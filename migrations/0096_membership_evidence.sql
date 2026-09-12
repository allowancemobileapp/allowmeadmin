-- 0096: revenue must be evidenced, not inferred.
--
-- WHAT THIS FIXES, AND WHY IT IS A TAX PROBLEM RATHER THAN A DISPLAY ONE
--
-- membership_payments looks like a payment ledger. It is not one. Every row
-- in it was written by log_membership_change(), a trigger that fires when
-- profiles.subscription_tier changes and fabricates a payment reference from
-- the clock:
--
--     'sub_' || extract(epoch from now())
--
-- All 37 "payments" carry a reference of that shape. Not one is a gateway
-- transaction id. webhook_logs, which would hold the real ones, is empty. So
-- the company has been reporting N25,900 of subscription revenue for which no
-- settlement evidence exists anywhere in the database -- and a tier changed by
-- hand in the SQL editor produced an identical row to one somebody paid for.
--
-- THE EVIDENCE THAT DOES EXIST
--
-- The mobile app's _activateSubscriptionDb() is called in exactly one place:
-- after the gateway verification returns success --
--
--     paystack:    data['status'] == true  && data['data']['status'] == 'success'
--     flutterwave: data['status'] == 'success' && ...['status'] == 'successful'
--
-- and it writes subscription_tier = 'Membership' TOGETHER WITH
-- paystack_customer_code. That column is therefore only ever set on a path a
-- payment gateway confirmed. It is the receipt trail, and nothing else in
-- this schema is.
--
-- The app also never writes 'Plus'. Every read in the Flutter source compares
-- against the literal 'Membership'. So a profile sitting on 'Plus' was put
-- there by hand -- a free upgrade -- and 0095 made the trigger log N700 for
-- it, because is_paid_tier() correctly recognises 'plus' as a paid tier. That
-- was my change and it turned a silent misclassification into phantom income:
-- two accounts upgraded manually on 11 September produced N1,400 of revenue
-- that nobody paid.
--
-- THE SPLIT THIS MIGRATION DRAWS
--
--     N18,900  27 rows  payer holds a gateway credential   -> revenue
--      N7,000  10 rows  no credential, upgraded by hand    -> NOT revenue
--
-- Nothing is deleted. The free upgrades are real events and belong in the
-- record; they simply are not income, and the books must stop counting them.

-- ---------------------------------------------------------------------------
-- 1. Say what each row actually is.
-- ---------------------------------------------------------------------------
ALTER TABLE public.membership_payments
  ADD COLUMN IF NOT EXISTS verification text NOT NULL DEFAULT 'unverified';

DO $$ BEGIN
  ALTER TABLE public.membership_payments
    ADD CONSTRAINT membership_verification_check CHECK (verification IN
      ('gateway',      -- the gateway confirmed money. Counts as revenue.
       'manual',       -- granted by hand. Access without payment.
       'cancellation', -- a downgrade. Never was money.
       'unverified')); -- predates this column and could not be classified.
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.membership_payments.verification IS
  'Whether money can be shown to have changed hands. Only ''gateway'' is '
  'counted as income -- everything else is access granted without payment.';

-- ---------------------------------------------------------------------------
-- 2. Classify what is already there.
-- ---------------------------------------------------------------------------
--
-- Backfilled from the payer's gateway credential rather than from the tier,
-- because the tier is the thing that proved unreliable. A customer code is
-- only ever written after a gateway said success.
UPDATE public.membership_payments mp
SET verification = CASE
  WHEN mp.amount = 0 THEN 'cancellation'
  WHEN EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id::text = mp.user_id
                  AND p.paystack_customer_code IS NOT NULL) THEN 'gateway'
  ELSE 'manual'
END
WHERE mp.verification = 'unverified';

-- ---------------------------------------------------------------------------
-- 3. Stop the trigger inventing money.
-- ---------------------------------------------------------------------------
--
-- The rule it now applies: a tier change alone grants ACCESS. Only a tier
-- change accompanied by a gateway credential is a PAYMENT. That is the same
-- test the app itself applies before it writes either one, so the ledger and
-- the checkout flow finally agree about what a sale is.
CREATE OR REPLACE FUNCTION public.log_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_was_paid boolean;
  v_is_paid  boolean;
  v_has_gateway boolean;
BEGIN
  v_was_paid := (TG_OP = 'UPDATE') AND public.is_paid_tier(OLD.subscription_tier);
  v_is_paid  := public.is_paid_tier(NEW.subscription_tier);

  IF v_was_paid = v_is_paid THEN
    RETURN NEW;
  END IF;

  IF v_is_paid THEN
    -- THE TEST THAT MATTERS. Set by _activateSubscriptionDb() and by nothing
    -- else, and only after the gateway returned success. Absent means somebody
    -- changed a column; present means a payment processor said money moved.
    v_has_gateway := NEW.paystack_customer_code IS NOT NULL;

    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference, verification)
    VALUES (
      NEW.id::text,
      NEW.subscription_tier,
      -- A free upgrade is recorded at zero. It is access, and access is not
      -- income however much it looks like a subscription on screen.
      CASE WHEN v_has_gateway THEN public.plus_price_kobo() ELSE 0 END,
      CASE WHEN v_has_gateway
           THEN COALESCE(NEW.paystack_subscription_id,
                         'paystack_' || NEW.paystack_customer_code)
           ELSE 'manual_grant_' || extract(epoch from now())::bigint END,
      CASE WHEN v_has_gateway THEN 'gateway' ELSE 'manual' END
    );
  ELSE
    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference, verification)
    VALUES (
      NEW.id::text, 'Canceled (Free)', 0,
      'cancel_' || extract(epoch from now())::bigint, 'cancellation'
    );
  END IF;

  RETURN NEW;
END $fn$;

-- Watch the credential column too. The app sets tier and customer code in one
-- UPDATE; if only subscription_tier were watched, a later correction that
-- attached the gateway code would go unrecorded.
DROP TRIGGER IF EXISTS membership_change_trigger ON public.profiles;
CREATE TRIGGER membership_change_trigger
  AFTER INSERT OR UPDATE OF subscription_tier, paystack_customer_code
  ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_membership_change();

-- ---------------------------------------------------------------------------
-- 4. The books count only what can be evidenced.
-- ---------------------------------------------------------------------------
--
-- The one substantive change to the money. Plus subscriptions previously
-- summed every positive row; it now sums only the gateway-confirmed ones, so
-- the N7,000 of manual upgrades leaves reported income.
--
-- Reproduced in full because CREATE OR REPLACE VIEW replaces the whole body.
-- Only the first branch changes.
CREATE OR REPLACE VIEW public.company_income AS
 SELECT 'Plus subscriptions'::text AS stream,
    mp.id::text AS source_id,
    (mp.amount / 100.0)::numeric(18,2) AS amount,
    mp.created_at AS received_at,
    mp.user_id::text AS payer,
    mp.payment_reference AS reference
   FROM membership_payments mp
  WHERE mp.amount > 0::numeric
    AND mp.verification = 'gateway'
UNION ALL
 SELECT 'Gist adverts'::text AS stream,
    g.id::text AS source_id,
    COALESCE(NULLIF(g.amount_paid, 0)::numeric, g.total_price, 0::numeric)::numeric(18,2) AS amount,
    g.created_at AS received_at,
    g.user_id::text AS payer,
    g.payment_reference AS reference
   FROM gists g
  WHERE (g.amount_paid > 0 OR g.paid = true)
    AND (g.payment_reference IS NULL OR g.payment_reference !~~* 'coupon%'::text)
UNION ALL
 SELECT 'Event tickets'::text AS stream,
    tp.id::text AS source_id,
    tp.amount_paid::numeric(18,2) AS amount,
    tp.created_at AS received_at,
    tp.user_id::text AS payer,
    tp.payment_reference AS reference
   FROM ticket_purchases tp
  WHERE tp.amount_paid > 0 AND COALESCE(tp.status, 'success'::text) <> 'failed'::text
UNION ALL
 SELECT 'Premium groups'::text AS stream,
    gpp.id::text AS source_id,
    gpp.amount::numeric(18,2) AS amount,
    gpp.created_at AS received_at,
    gpp.user_id::text AS payer,
    gpp.payment_reference AS reference
   FROM group_premium_payments gpp
  WHERE gpp.amount > 0::numeric
UNION ALL
 SELECT 'Store subscriptions'::text AS stream,
    ssp.id::text AS source_id,
    (ssp.amount_minor::numeric / 100.0)::numeric(18,2) AS amount,
    ssp.created_at AS received_at,
    ssp.paid_by::text AS payer,
    ssp.reference
   FROM store_subscription_payments ssp
  WHERE ssp.amount_minor > 0
UNION ALL
 SELECT 'Delivery commission'::text AS stream,
    do2.id::text AS source_id,
    do2.allowance_fee::numeric(18,2) AS amount,
    do2.completed_at AS received_at,
    do2.agent_id::text AS payer,
    NULL::text AS reference
   FROM delivery_orders do2
  WHERE do2.status = 'completed'::text AND do2.allowance_fee > 0::numeric
    AND do2.completed_at IS NOT NULL
UNION ALL
 SELECT 'Transport bookings'::text AS stream,
    tb.id::text AS source_id,
    tb.allowance_fee::numeric(18,2) AS amount,
    tb.travelled_at AS received_at,
    tb.passenger_id::text AS payer,
    NULL::text AS reference
   FROM transport_bookings tb
  WHERE tb.status = 'travelled'::text
    AND tb.allowance_fee > 0::numeric
    AND tb.travelled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 5. What was granted free, kept visible.
-- ---------------------------------------------------------------------------
--
-- Excluded from income is not the same as hidden. These are real commercial
-- events -- people using Plus without paying -- and the cost of that is worth
-- seeing even though, and precisely because, it is not revenue.
CREATE OR REPLACE VIEW public.membership_grants AS
  SELECT
    mp.id,
    mp.created_at,
    mp.user_id,
    p.username,
    p.full_name,
    mp.tier,
    COALESCE(p.subscription_tier, 'none') AS tier_now,
    mp.verification,
    -- What it would have been worth at list price, so "we gave away N7,000 of
    -- Plus" is answerable without anybody doing arithmetic.
    public.plus_price_kobo() AS list_price_kobo
  FROM public.membership_payments mp
  LEFT JOIN public.profiles p ON p.id::text = mp.user_id
  WHERE mp.verification = 'manual'
  ORDER BY mp.created_at DESC;

REVOKE ALL ON public.membership_grants FROM anon, authenticated;

COMMENT ON VIEW public.membership_grants IS
  'Plus access granted without payment. Deliberately not income -- but a real '
  'cost, and kept visible so it can be counted as one.';

NOTIFY pgrst, 'reload schema';
