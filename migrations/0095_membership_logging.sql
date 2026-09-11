-- 0095: a paid subscription was being recorded as a cancellation.
--
-- THE BUG, WITH THE ROW THAT PROVES IT
--
-- log_membership_change() fires when profiles.subscription_tier changes and
-- writes a membership_payments row. It decided which kind to write with:
--
--     IF NEW.subscription_tier = 'Membership' THEN  ... N700 payment
--     ELSE                                          ... N0 cancellation
--
-- An exact, case-sensitive match against one literal string, with everything
-- else falling into "cancelled". On 2026-07-09 a profile was set to the tier
-- 'plus' -- lower case, a different word for the same thing -- and the
-- trigger wrote:
--
--     tier = 'Canceled (Free)', amount = 0, ref = 'cancel_1783634118'
--
-- A subscriber who had just paid was recorded as having quit, and N700 of
-- revenue became N0. Nothing failed, nothing was logged as an error, and the
-- books simply disagreed with reality.
--
-- THE SECOND HOLE. The trigger is AFTER UPDATE OF subscription_tier. A
-- profile INSERTED already on a paid tier never fires it at all, which is why
-- seven accounts sit on 'Membership' today with no payment row behind them.
--
-- THE THIRD. The price was the literal 70000. Change what Plus costs and
-- every future row records the old figure.
--
-- WHAT THIS MIGRATION DOES NOT DO: invent revenue. It does not backfill the
-- eight affected accounts, because whether real money changed hands is a
-- question about a bank statement, not about this schema -- several look like
-- founder or test accounts. It surfaces every one of them instead, so a human
-- decides which were real. Guessing here would put fictional income into the
-- figure that sets four people's salaries.

-- ---------------------------------------------------------------------------
-- 1. What counts as a paid tier.
-- ---------------------------------------------------------------------------
--
-- One definition, in one place. The bug existed because the answer to "is
-- this person paying?" was an inline string comparison that only one caller
-- could see. Written down, it is fixable in a single spot when a fourth
-- spelling turns up.
CREATE OR REPLACE FUNCTION public.is_paid_tier(p_tier text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public, pg_temp
AS $fn$
  -- Case-insensitive and trimmed, because 'plus', 'Plus', 'Membership' and
  -- ' Membership' are the same commercial fact and only one of them used to
  -- count. Anything not on this list is treated as unpaid.
  SELECT lower(btrim(COALESCE(p_tier, ''))) IN
    ('membership', 'plus', 'premium', 'pro');
$fn$;

COMMENT ON FUNCTION public.is_paid_tier(text) IS
  'Whether a subscription_tier value means the person is paying. One '
  'definition -- an inline = ''Membership'' comparison is what logged a '
  'paying subscriber as a cancellation.';

-- ---------------------------------------------------------------------------
-- 2. The trigger, fixed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_was_paid boolean;
  v_is_paid  boolean;
BEGIN
  -- TG_OP is checked rather than assuming OLD exists. On INSERT there is no
  -- previous row, and treating that as "was not paying" is what makes a
  -- profile created already on Plus record its first payment.
  v_was_paid := (TG_OP = 'UPDATE') AND public.is_paid_tier(OLD.subscription_tier);
  v_is_paid  := public.is_paid_tier(NEW.subscription_tier);

  -- Nothing commercially changed. A rename from 'plus' to 'Membership' is not
  -- a new sale, and the old code would have logged it as a cancellation
  -- followed by nothing.
  IF v_was_paid = v_is_paid THEN
    RETURN NEW;
  END IF;

  IF v_is_paid THEN
    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference)
    VALUES (
      NEW.id::text,
      NEW.subscription_tier,
      -- From the price function, so a price change reaches this without an
      -- edit here. It was the literal 70000.
      public.plus_price_kobo(),
      'sub_' || extract(epoch from now())::bigint
    );
  ELSE
    INSERT INTO public.membership_payments
      (user_id, tier, amount, payment_reference)
    VALUES (
      NEW.id::text, 'Canceled (Free)', 0,
      'cancel_' || extract(epoch from now())::bigint
    );
  END IF;

  RETURN NEW;
END $fn$;

-- INSERT as well as UPDATE. The old trigger could not see a profile that
-- arrived already paying.
DROP TRIGGER IF EXISTS membership_change_trigger ON public.profiles;
CREATE TRIGGER membership_change_trigger
  AFTER INSERT OR UPDATE OF subscription_tier ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.log_membership_change();

-- ---------------------------------------------------------------------------
-- 3. Never silent again.
-- ---------------------------------------------------------------------------
--
-- The reason this went unnoticed for two months is that there was nowhere it
-- could show up. A subscriber with no payment and a payment with no
-- subscriber both looked like nothing at all.
--
-- This is the reconciliation: every account whose tier and whose payment
-- history disagree, with what the discrepancy is worth, so it can be looked
-- at rather than discovered.
CREATE OR REPLACE VIEW public.subscription_discrepancies AS
  SELECT
    p.id            AS user_id,
    p.username,
    p.full_name,
    p.subscription_tier,
    p.created_at    AS joined_at,

    COALESCE(pay.paid_rows, 0)   AS paid_payments,
    COALESCE(pay.zero_rows, 0)   AS zero_payments,
    COALESCE(pay.total_kobo, 0)  AS collected_kobo,
    pay.last_payment_at,

    CASE
      -- The Lalaa case: on a paid tier, and every row against them is a
      -- cancellation. This is the shape the old trigger produced.
      WHEN public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND COALESCE(pay.zero_rows, 0) > 0
        THEN 'paying, but only cancellations recorded'
      -- Created already on a paid tier, before the trigger could fire.
      WHEN public.is_paid_tier(p.subscription_tier)
       AND COALESCE(pay.paid_rows, 0) = 0
        THEN 'paying, with no payment recorded at all'
      -- Money came in and the tier is not set. A downgrade that should have
      -- been logged, or a payment against the wrong account.
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

COMMENT ON VIEW public.subscription_discrepancies IS
  'Accounts whose subscription tier and payment history disagree. Every row '
  'is either money that was never recorded or access that was never paid '
  'for. Deliberately not auto-corrected -- a human decides which.';

NOTIFY pgrst, 'reload schema';
