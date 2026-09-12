-- 0097: what the payment gateway keeps, so the books match the bank.
--
-- THE GAP THIS CLOSES. company_income records what the customer was charged.
-- The bank receives what Paystack settles, which is less. Nothing in the
-- schema held the difference, so the app's figure could never reconcile to a
-- statement -- it was always high by the processor's cut, and nobody could
-- say by how much.
--
-- Payment processing is one of the four deductible categories in
-- expense_is_deductible(), so this is not cosmetic: a gateway fee reduces
-- Monthly Gross Profit, which sets the salary band. Leaving it out overstates
-- gross profit and overpays.
--
-- WHAT I CANNOT SEE, STATED PLAINLY
--
-- There is no Paystack API access here and webhook_logs is empty, so no
-- settlement figure exists in this database to read. These rates are
-- PAYSTACK'S PUBLISHED NIGERIAN PRICING, not your contract. Negotiated rates
-- are common above a certain volume. The schedule is a table rather than a
-- constant precisely so the number can be corrected against your dashboard
-- without a migration, and everything downstream recalculates.
--
-- A SECOND THING THE SCHEMA CANNOT ANSWER. The app tries Flutterwave first
-- and falls back to Paystack, and WHICH ONE HANDLED A GIVEN TRANSACTION IS
-- NOT STORED ANYWHERE. Their rates differ. Until a gateway column exists on
-- the payment tables, every calculation here assumes one processor, and that
-- assumption is the largest source of error in the figure below -- larger
-- than the rate itself.

-- ---------------------------------------------------------------------------
-- 1. The schedule.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payment_gateway_fees (
  id              serial PRIMARY KEY,
  gateway         text NOT NULL,

  -- 1.5 means 1.5%, not 0.015. Written the way the pricing page writes it, so
  -- somebody checking this against Paystack's site is comparing like with like.
  percent         numeric(6,3) NOT NULL,

  -- The flat component, and the transaction value below which it is waived.
  -- Paystack waives its N100 on anything under N2,500, which is why a N700
  -- subscription costs N10.50 and not N110.50 -- a 15x difference on the
  -- commonest transaction this company takes.
  flat_kobo       bigint NOT NULL DEFAULT 0,
  flat_waived_below_kobo bigint NOT NULL DEFAULT 0,

  -- Total fee ceiling. Paystack caps local card fees at N2,000.
  cap_kobo        bigint,

  effective_from  date NOT NULL DEFAULT current_date,
  note            text,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gateway, effective_from)
);

ALTER TABLE public.payment_gateway_fees ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_gateway_fees FROM anon, authenticated;

INSERT INTO public.payment_gateway_fees
  (gateway, percent, flat_kobo, flat_waived_below_kobo, cap_kobo, effective_from, note)
SELECT 'paystack', 1.5, 10000, 250000, 200000, '2020-01-01',
       'Paystack published Nigerian local pricing: 1.5% + N100, the N100 '
       'waived below N2,500, total capped at N2,000. NOT VERIFIED against '
       'this company''s contract -- correct it here if the negotiated rate '
       'differs and every figure recalculates.'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_gateway_fees WHERE gateway='paystack');

INSERT INTO public.payment_gateway_fees
  (gateway, percent, flat_kobo, flat_waived_below_kobo, cap_kobo, effective_from, note)
SELECT 'flutterwave', 1.4, 0, 0, 200000, '2020-01-01',
       'Flutterwave published Nigerian local card pricing: 1.4%, capped at '
       'N2,000. Which gateway handled a given transaction is not recorded, so '
       'this rate is currently unused by gateway_fees_due.'
WHERE NOT EXISTS (SELECT 1 FROM public.payment_gateway_fees WHERE gateway='flutterwave');

COMMENT ON TABLE public.payment_gateway_fees IS
  'What each processor keeps. Published rates, not contracted ones -- verify '
  'against the gateway dashboard and edit here rather than in code.';

-- ---------------------------------------------------------------------------
-- 2. The fee on one transaction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.gateway_fee_kobo(
  p_amount_kobo bigint,
  p_gateway     text DEFAULT 'paystack',
  p_on          date DEFAULT current_date
)
RETURNS bigint
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  f public.payment_gateway_fees;
  v_fee numeric;
BEGIN
  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN RETURN 0; END IF;

  -- The schedule in force on the transaction date, not today's. A rate change
  -- must not retrospectively rewrite what last quarter cost.
  SELECT * INTO f FROM public.payment_gateway_fees
  WHERE gateway = p_gateway AND effective_from <= p_on
  ORDER BY effective_from DESC LIMIT 1;

  IF f.id IS NULL THEN RETURN 0; END IF;

  v_fee := p_amount_kobo * f.percent / 100.0;

  IF p_amount_kobo >= f.flat_waived_below_kobo THEN
    v_fee := v_fee + f.flat_kobo;
  END IF;

  IF f.cap_kobo IS NOT NULL AND v_fee > f.cap_kobo THEN
    v_fee := f.cap_kobo;
  END IF;

  RETURN ROUND(v_fee)::bigint;
END $fn$;

REVOKE ALL ON FUNCTION public.gateway_fee_kobo(bigint, text, date)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. What the gateway took, per transaction.
-- ---------------------------------------------------------------------------
--
-- ON TICKETS, WHICH ARE THE SUBTLE ONE. The company keeps a flat N500 per
-- ticket and the organiser owns the rest -- but the CARD IS CHARGED THE FULL
-- FACE VALUE, and Paystack's percentage applies to that. A N5,000 ticket
-- earns the company N500 and costs it N175 in fees. Computing the fee on our
-- share instead of on the amount charged would understate it by a factor of
-- ten on exactly the transactions where it matters most.
--
-- Delivery and transport are excluded: those fees are a debt the agent or
-- vendor settles separately, and the gateway cost of that settlement lands on
-- the settlement, not on the ride.
CREATE OR REPLACE VIEW public.gateway_fees_due AS
  SELECT 'Plus subscriptions'::text AS stream,
         mp.id::text AS source_id,
         mp.created_at AS charged_at,
         mp.amount::bigint AS charged_kobo,
         public.gateway_fee_kobo(mp.amount::bigint, 'paystack',
                                 mp.created_at::date) AS fee_kobo
  FROM public.membership_payments mp
  WHERE mp.amount > 0 AND mp.verification = 'gateway'
UNION ALL
  -- amount_paid is NAIRA on this table, hence the x100. See 0084.
  SELECT 'Event tickets', tp.id::text, tp.created_at,
         (tp.amount_paid * 100)::bigint,
         public.gateway_fee_kobo((tp.amount_paid * 100)::bigint, 'paystack',
                                 tp.created_at::date)
  FROM public.ticket_purchases tp
  WHERE tp.amount_paid > 0
    AND COALESCE(tp.status, 'success') <> 'failed'
UNION ALL
  SELECT 'Premium groups', gpp.id::text, gpp.created_at,
         (gpp.amount * 100)::bigint,
         public.gateway_fee_kobo((gpp.amount * 100)::bigint, 'paystack',
                                 gpp.created_at::date)
  FROM public.group_premium_payments gpp
  WHERE gpp.amount > 0
UNION ALL
  SELECT 'Store subscriptions', ssp.id::text, ssp.created_at,
         ssp.amount_minor::bigint,
         public.gateway_fee_kobo(ssp.amount_minor::bigint, 'paystack',
                                 ssp.created_at::date)
  FROM public.store_subscription_payments ssp
  WHERE ssp.amount_minor > 0;

REVOKE ALL ON public.gateway_fees_due FROM anon, authenticated;

COMMENT ON VIEW public.gateway_fees_due IS
  'The processor''s cut per transaction, computed on the amount CHARGED TO '
  'THE CARD rather than on the company''s share. Assumes Paystack for every '
  'row because the gateway used is not recorded.';

-- ---------------------------------------------------------------------------
-- 4. Posting a month's fees to the books.
-- ---------------------------------------------------------------------------
--
-- ONE EXPENSE ROW PER MONTH, not one per transaction. A gateway settles in
-- batches and a statement shows a monthly charge; matching that shape is what
-- makes the two reconcilable by eye. The note carries the count and the
-- streams so the single figure can still be taken apart.
--
-- Idempotent by design: re-running for the same month updates the existing
-- row rather than adding a second one. Fees get recalculated whenever a rate
-- is corrected or a late transaction lands, and an append-only version of
-- this would double the expense every time somebody pressed the button.
CREATE OR REPLACE FUNCTION public.post_gateway_fees(
  p_month date,
  p_actor text DEFAULT NULL
)
RETURNS TABLE (expense_id integer, transactions bigint, fee_naira numeric)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_fee  bigint;
  v_n    bigint;
  v_title text;
  v_id   integer;
BEGIN
  SELECT COALESCE(SUM(fee_kobo), 0), COUNT(*)
    INTO v_fee, v_n
  FROM public.gateway_fees_due
  WHERE charged_at::date BETWEEN v_from AND v_to;

  v_title := format('Payment gateway fees — %s', to_char(v_from, 'Mon YYYY'));

  IF v_fee = 0 THEN
    -- Nothing charged that month. Remove a stale row rather than leaving a
    -- fee behind for transactions that have since been corrected away.
    DELETE FROM public.company_expenses
     WHERE title = v_title AND category = 'payment_processing';
    RETURN QUERY SELECT NULL::integer, 0::bigint, 0::numeric;
    RETURN;
  END IF;

  SELECT id INTO v_id FROM public.company_expenses
   WHERE title = v_title AND category = 'payment_processing'
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.company_expenses
      (title, reason, amount, expense_date, category, vendor, approved_by)
    VALUES (v_title, 'Payment processing',
            ROUND(v_fee / 100.0, 2), v_to, 'payment_processing', 'Paystack',
            p_actor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.company_expenses
       SET amount = ROUND(v_fee / 100.0, 2),
           expense_date = v_to,
           approved_by = COALESCE(p_actor, approved_by)
     WHERE id = v_id;
  END IF;

  RETURN QUERY SELECT v_id, v_n, ROUND(v_fee / 100.0, 2);
END $fn$;

REVOKE ALL ON FUNCTION public.post_gateway_fees(date, text)
  FROM anon, authenticated;

COMMENT ON FUNCTION public.post_gateway_fees(date, text) IS
  'Writes one payment_processing expense for a month''s gateway fees. '
  'Idempotent -- re-running updates rather than duplicating.';

-- ---------------------------------------------------------------------------
-- 5. Gross charged, fee, and what should actually reach the bank.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.gateway_settlement AS
  SELECT
    date_trunc('month', charged_at)::date AS month,
    COUNT(*)                              AS transactions,
    SUM(charged_kobo)                     AS charged_kobo,
    SUM(fee_kobo)                         AS fee_kobo,
    SUM(charged_kobo) - SUM(fee_kobo)     AS net_to_bank_kobo,
    ROUND(SUM(fee_kobo) * 100.0 / NULLIF(SUM(charged_kobo), 0), 2)
                                          AS effective_pct
  FROM public.gateway_fees_due
  GROUP BY 1
  ORDER BY 1 DESC;

REVOKE ALL ON public.gateway_settlement FROM anon, authenticated;

COMMENT ON VIEW public.gateway_settlement IS
  'Per month: charged, the processor''s cut, and what should land in the '
  'bank. The last column is the figure to check a statement against.';

NOTIFY pgrst, 'reload schema';
