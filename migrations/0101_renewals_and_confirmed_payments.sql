-- 0101: a payment from somebody already subscribed recorded nothing.
--
-- FOUND BY THE FOUNDER NOTICING A DEBIT THAT NEVER APPEARED. swcaiagent@gmail.com
-- paid for Plus. The profile carries Paystack customer code CUS_lp4ge0tbb25quxv,
-- which the app writes ONLY inside _activateSubscriptionDb() and only after
-- the gateway returns success -- so a payment processor confirmed that money.
-- membership_payments has no row for them at all.
--
-- MY BUG, IN 0096. The trigger decides whether to record anything by
-- comparing paid-tier-before against paid-tier-after:
--
--     IF v_was_paid = v_is_paid THEN RETURN NEW; END IF;
--
-- which is right for an upgrade and wrong for everything else. Somebody
-- already on Membership who pays again never changes tier, so the two sides
-- match, the trigger returns early, and the money is never written down.
-- Verified rather than reasoned about: attaching a gateway code to an
-- existing member left the row count at 53 before and 53 after.
--
-- HOW BIG. Seven accounts hold a real Paystack customer code and have ZERO
-- payment rows -- Chimbueze, Alexander, swc, azeez, sore, allowance, mrjames.
-- At one month each that is N4,900 of confirmed income the books have never
-- seen, and more if any of them paid for several months.
--
-- I ALSO GOT THESE WRONG EARLIER. When 0096 shipped I called them "manual or
-- free upgrades, probably founder and test accounts" from their dates alone.
-- Every one of them has gateway evidence. The dates were a guess; the
-- customer code is a fact, and I should have checked it before classifying.
--
-- WHAT THIS STILL CANNOT DO. A Paystack customer code is stable per CUSTOMER,
-- not per charge, so a second month's payment changes nothing on the profile
-- and remains undetectable here. Renewals need the charge.success webhook,
-- and webhook_logs is empty. This migration closes the first-payment hole and
-- makes the rest visible; only the webhook closes it properly.

-- ---------------------------------------------------------------------------
-- 0. The guard the trigger leans on.
-- ---------------------------------------------------------------------------
--
-- One payment per customer per reference. The trigger builds the reference
-- from the gateway code plus the date, so this reads as "one charge per
-- customer per day" -- which blocks a duplicate from a profile being saved
-- twice, and still admits a real payment tomorrow.
--
-- Duplicates are removed first, or the index cannot be created. There are
-- none today; this is here so the migration is safe to run on a database
-- where a profile has been re-saved since.
DELETE FROM public.membership_payments a
USING public.membership_payments b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.payment_reference = b.payment_reference
  AND a.payment_reference IS NOT NULL;

-- Not a PARTIAL index: ON CONFLICT can only infer one if the statement
-- repeats the same predicate, and a plain unique index behaves identically
-- here because Postgres treats NULLs as distinct -- so old rows with no
-- reference never collide with each other.
CREATE UNIQUE INDEX IF NOT EXISTS membership_payments_once_idx
  ON public.membership_payments (user_id, payment_reference);

-- ---------------------------------------------------------------------------
-- 1. A payment is a payment, whether or not the tier moves.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_was_paid    boolean;
  v_is_paid     boolean;
  v_had_gateway boolean;
  v_has_gateway boolean;
BEGIN
  v_was_paid := (TG_OP = 'UPDATE') AND public.is_paid_tier(OLD.subscription_tier);
  v_is_paid  := public.is_paid_tier(NEW.subscription_tier);

  v_had_gateway := (TG_OP = 'UPDATE') AND OLD.paystack_customer_code IS NOT NULL;
  v_has_gateway := NEW.paystack_customer_code IS NOT NULL;

  -- THE NEW BRANCH, AND THE POINT OF THIS MIGRATION. A gateway credential
  -- appearing, or changing, is a payment processor saying money moved. That
  -- is true whether the person was already a member or not, and the old code
  -- only looked at the tier.
  IF v_has_gateway AND (NOT v_had_gateway
        OR NEW.paystack_customer_code IS DISTINCT FROM OLD.paystack_customer_code) THEN
    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference, verification)
    VALUES (
      NEW.id::text,
      COALESCE(NEW.subscription_tier, 'Membership'),
      public.plus_price_kobo(),
      -- The DATE is part of the reference, which is what makes the unique
      -- index below mean "one payment per customer per day". Without it the
      -- reference is identical forever and either every renewal is blocked or
      -- none is.
      'paystack_' || NEW.paystack_customer_code || '_'
        || to_char(now(), 'YYYYMMDD'),
      'gateway'
    )
    -- A profile save that rewrites the same code must not bank the money
    -- twice. ON CONFLICT DO NOTHING is inert without a constraint to conflict
    -- against, so the index is created before this function is used.
    ON CONFLICT (user_id, payment_reference) DO NOTHING;

    RETURN NEW;
  END IF;

  IF v_was_paid = v_is_paid THEN
    RETURN NEW;
  END IF;

  IF v_is_paid THEN
    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference, verification)
    VALUES (
      NEW.id::text,
      NEW.subscription_tier,
      CASE WHEN v_has_gateway THEN public.plus_price_kobo() ELSE 0 END,
      CASE WHEN v_has_gateway
           THEN 'paystack_' || NEW.paystack_customer_code
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

-- ---------------------------------------------------------------------------
-- 2. Recording a payment that was confirmed but never written down.
-- ---------------------------------------------------------------------------
--
-- NOT A BACKFILL, ON PURPOSE. Seven accounts hold gateway evidence, but the
-- evidence says "a gateway confirmed a charge at some point" -- not how much,
-- not when, and not how many times. Inserting N700 dated today for each would
-- put seven invented figures into the number that sets four people's salaries
-- and that a tax return is built from.
--
-- So this records ONE payment that a person has confirmed, with the amount and
-- the date they confirm. The gateway reference is carried through, so the row
-- can be traced back to a Paystack dashboard entry afterwards.
CREATE OR REPLACE FUNCTION public.record_confirmed_payment(
  p_user_id   uuid,
  p_amount_kobo bigint,
  p_paid_on   date,
  p_actor     text,
  p_note      text DEFAULT NULL
)
RETURNS public.membership_payments
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_code text;
  v_tier text;
  v_row  public.membership_payments;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'A payment has to be a positive amount.';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > current_date THEN
    RAISE EXCEPTION 'A payment cannot be dated in the future.';
  END IF;

  SELECT paystack_customer_code, subscription_tier
    INTO v_code, v_tier
  FROM public.profiles WHERE id = p_user_id;

  IF v_code IS NULL THEN
    RAISE EXCEPTION
      'That account has no gateway credential, so there is nothing to say a '
      'payment was ever confirmed for it. Recording one here would be '
      'inventing income.';
  END IF;

  INSERT INTO public.membership_payments
    (user_id, tier, amount, payment_reference, verification, created_at)
  VALUES (
    p_user_id::text,
    COALESCE(v_tier, 'Membership'),
    p_amount_kobo,
    'paystack_' || v_code || '_' || to_char(p_paid_on, 'YYYYMMDD'),
    'gateway',
    p_paid_on::timestamptz
  )
  RETURNING * INTO v_row;

  INSERT INTO public.finance_audit (actor, action, entity, entity_id, before, after)
  VALUES (p_actor, 'membership.payment.recorded', 'membership_payments',
          v_row.id::text, NULL,
          jsonb_build_object('user_id', p_user_id, 'amount_kobo', p_amount_kobo,
                             'paid_on', p_paid_on, 'note', p_note,
                             'gateway_code', v_code));

  RETURN v_row;
END $fn$;

REVOKE ALL ON FUNCTION public.record_confirmed_payment(uuid, bigint, date, text, text)
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. The distinction I should have drawn the first time.
-- ---------------------------------------------------------------------------
--
-- The old view said "paying, with no payment recorded at all" for both the
-- accounts a gateway confirmed and the ones upgraded by hand. Those are
-- opposite problems -- one is missing income, the other is a free giveaway --
-- and lumping them together is what let seven real payments read as comped
-- accounts.
-- DROPPED FIRST, because CREATE OR REPLACE VIEW can only APPEND columns and
-- has_gateway_evidence goes in the middle -- Postgres reads that as renaming
-- paid_payments and refuses. Same trap as 0086. No CASCADE: nothing should
-- depend on this view, and if something does, failing loudly here is better
-- than dropping it silently.
DROP VIEW IF EXISTS public.subscription_discrepancies;

CREATE VIEW public.subscription_discrepancies AS
  SELECT
    p.id            AS user_id,
    p.username,
    p.full_name,
    p.subscription_tier,
    p.created_at    AS joined_at,
    (p.paystack_customer_code IS NOT NULL) AS has_gateway_evidence,
    p.paystack_customer_code,

    COALESCE(pay.paid_rows, 0)   AS paid_payments,
    COALESCE(pay.zero_rows, 0)   AS zero_payments,
    COALESCE(pay.total_kobo, 0)  AS collected_kobo,
    pay.last_payment_at,

    CASE
      -- Money a gateway confirmed, with nothing in the books. Recoverable.
      WHEN public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND p.paystack_customer_code IS NOT NULL
        THEN 'paid through the gateway, nothing recorded'
      WHEN public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND COALESCE(pay.zero_rows, 0) > 0
        THEN 'paying, but only cancellations recorded'
      WHEN public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) = 0
        THEN 'on a paid tier, never paid (free upgrade)'
      WHEN NOT public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) > COALESCE(pay.zero_rows, 0)
        THEN 'paid, but not on a paid tier'
      ELSE 'consistent'
    END AS state
  FROM public.profiles p
  LEFT JOIN (
    SELECT user_id,
           COUNT(*) FILTER (WHERE amount > 0)  AS paid_rows,
           COUNT(*) FILTER (WHERE amount = 0)  AS zero_rows,
           SUM(amount)                          AS total_kobo,
           MAX(created_at) FILTER (WHERE amount > 0) AS last_payment_at
    FROM public.membership_payments GROUP BY user_id
  ) pay ON pay.user_id = p.id::text;

REVOKE ALL ON public.subscription_discrepancies FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
