-- 0084: gist and ticket revenue was being divided by 100 when it should not.
--
-- I GOT THIS WRONG IN 0080 AND THIS FILE CORRECTS IT.
--
-- The reasoning in 0080 was that every column a payment webhook writes must
-- be kobo, because Paystack settles in kobo. That is true of what Paystack
-- SENDS. It is not true of what this app STORES -- the webhooks convert to
-- naira before writing, and only membership_payments keeps kobo, because its
-- value comes from a trigger with the literal 70000 in it rather than from a
-- webhook at all.
--
-- CAUGHT BY REAL DATA, not by reading the schema: 14 ticket payments summing
-- to a displayed N165. The minimum ticket price is N100, so 14 payments
-- cannot total N165. The raw sum was 16,500 -- N16,500, an average of about
-- N1,178 a ticket, which is a sensible price. Divided by 100 it became N165
-- and an average of N11.79, which is below the minimum the app allows.
--
-- THE UNITS, SETTLED. Anything not on this list is naira.
--
--   membership_payments.amount             KOBO   70000 = N700, set by
--                                                 log_membership_change()
--   store_subscription_payments.amount_minor KOBO  named for its unit
--
--   ticket_purchases.amount_paid           NAIRA  proven by the data above
--   gists.amount_paid                      NAIRA  added in the same migration
--                                                 and the same pattern as
--                                                 tickets.amount_paid
--   gists.total_price                      NAIRA  price_per_day x days
--   group_premium_payments.amount          NAIRA  its notification prints
--                                                 'N' || NEW.amount directly
--   delivery_orders.allowance_fee          NAIRA  holds 50 and 150
--
-- HOW TO CHECK THIS YOURSELF, and how it was caught: the Gross profit tab
-- shows a payment count beside every stream. Divide the total by the count.
-- If the average price is not something you would actually charge, the unit
-- is wrong.

CREATE OR REPLACE VIEW public.company_income AS
  -- KOBO. The only one. Written by a trigger, not a webhook.
  SELECT
    'Plus subscriptions'::text AS stream,
    mp.id::text                AS source_id,
    (mp.amount / 100.0)::numeric(18,2) AS amount,
    mp.created_at              AS received_at,
    mp.user_id::text           AS payer,
    mp.payment_reference       AS reference
  FROM public.membership_payments mp
  WHERE mp.amount > 0

  UNION ALL
  -- NAIRA. Not divided. total_price is the fallback for a gist that was
  -- priced but settled some other way; both columns are naira, so no
  -- conversion is needed on either branch.
  SELECT
    'Gist adverts',
    g.id::text,
    COALESCE(NULLIF(g.amount_paid, 0), g.total_price, 0)::numeric(18,2),
    g.created_at,
    g.user_id::text,
    g.payment_reference
  FROM public.gists g
  WHERE (g.amount_paid > 0 OR g.paid = true)
    AND (g.payment_reference IS NULL OR g.payment_reference NOT ILIKE 'coupon%')

  UNION ALL
  -- NAIRA. This is the one the 14-payment check proved.
  SELECT
    'Event tickets',
    tp.id::text,
    tp.amount_paid::numeric(18,2),
    tp.created_at,
    tp.user_id::text,
    tp.payment_reference
  FROM public.ticket_purchases tp
  WHERE tp.amount_paid > 0
    AND COALESCE(tp.status, 'success') <> 'failed'

  UNION ALL
  -- NAIRA.
  SELECT
    'Premium groups',
    gpp.id::text,
    gpp.amount::numeric(18,2),
    gpp.created_at,
    gpp.user_id::text,
    gpp.payment_reference
  FROM public.group_premium_payments gpp
  WHERE gpp.amount > 0

  UNION ALL
  -- KOBO. The column is named amount_minor precisely so this is not a guess.
  SELECT
    'Store subscriptions',
    ssp.id::text,
    (ssp.amount_minor / 100.0)::numeric(18,2),
    ssp.created_at,
    ssp.paid_by::text,
    ssp.reference
  FROM public.store_subscription_payments ssp
  WHERE ssp.amount_minor > 0

  UNION ALL
  -- NAIRA. Earned only once the customer confirms delivery.
  SELECT
    'Delivery commission',
    do2.id::text,
    do2.allowance_fee::numeric(18,2),
    do2.completed_at,
    do2.agent_id::text,
    NULL
  FROM public.delivery_orders do2
  WHERE do2.status = 'completed'
    AND do2.allowance_fee > 0
    AND do2.completed_at IS NOT NULL;

COMMENT ON VIEW public.company_income IS
  'Every naira the company has earned, one row per payment, in NAIRA. THE '
  'single source for revenue. Only membership_payments.amount and '
  'store_subscription_payments.amount_minor are kobo and get divided -- see '
  'migration 0084 for how that was established.';

REVOKE ALL ON public.company_income FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- A sanity check you can run any time.
-- ---------------------------------------------------------------------------
--
-- Average payment per stream. If a number here is not a price you would
-- actually charge, a unit is wrong somewhere. This is exactly the check that
-- caught the ticket bug.
CREATE OR REPLACE FUNCTION public.income_sanity_check()
RETURNS TABLE (stream text, payments bigint, total numeric, average numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT ci.stream, COUNT(*)::bigint, SUM(ci.amount)::numeric,
         ROUND(AVG(ci.amount), 2)
  FROM public.company_income ci
  GROUP BY ci.stream
  ORDER BY 3 DESC;
$$;

REVOKE ALL ON FUNCTION public.income_sanity_check() FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
