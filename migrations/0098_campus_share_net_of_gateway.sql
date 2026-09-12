-- 0098: "company keeps" was keeping money the gateway had already taken.
--
-- THE BUG ON SCREEN. A N700 Plus subscription showed "paid N700 / company
-- keeps N700". Paystack took N10.50 of it. The company kept N689.50 and the
-- breakdown said otherwise.
--
-- WHY IT IS NOT A DISPLAY PROBLEM. school_earnings() produces company_share,
-- partner_earned() multiplies that by the campus percentage, and the result
-- is what a student association is owed. Computing the cut on a figure that
-- includes the processor's fee pays a partner a share of money that never
-- reached the company -- every month, quietly, and in their favour.
--
-- The partnership proposal offers a share of GROSS PROFIT from that campus,
-- and payment processing is one of the four costs that reduce gross profit.
-- So netting it here is not a new deduction; it is applying the one that was
-- already agreed.
--
-- THE DOUBLE-COUNTING TRAP, CHECKED BEFORE WRITING THIS
--
-- 0097 posts gateway fees as a monthly payment_processing expense, and gross
-- profit is collections minus deductible expenses. If the campus path fed the
-- same calculation, netting here would subtract the fee twice.
--
-- It does not. month_collections_kobo() reads company_income and never
-- touches school_income -- verified against the live function body, not
-- assumed. The two paths are independent:
--
--     gross profit  = company_income   - expenses (incl. the fee, once)
--     campus share  = school_income    - third party - the fee, once
--
-- Each subtracts it exactly once, by a different route, because they are
-- answering different questions.

-- ---------------------------------------------------------------------------
-- 1. The processor's cut on one payment, by stream.
-- ---------------------------------------------------------------------------
--
-- Stream-aware because not everything goes through a card. Delivery and
-- transport fees are a debt the agent or vendor settles separately -- the
-- gateway cost lands on that settlement, not on the ride, and charging it
-- here would invent a cost the company never paid.
--
-- Takes and returns NAIRA, because school_income is naira. gateway_fee_kobo()
-- works in kobo, and this is the one place the two meet.
CREATE OR REPLACE FUNCTION public.stream_gateway_fee(
  p_stream text,
  p_amount numeric,
  p_on     date DEFAULT current_date
)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_stream IN ('Plus subscriptions', 'Event tickets', 'Premium groups',
                      'Store subscriptions', 'Gist adverts')
      THEN public.gateway_fee_kobo(ROUND(p_amount * 100)::bigint, 'paystack', p_on) / 100.0
    ELSE 0
  END::numeric;
$fn$;

REVOKE ALL ON FUNCTION public.stream_gateway_fee(text, numeric, date)
  FROM anon, authenticated;

COMMENT ON FUNCTION public.stream_gateway_fee(text, numeric, date) IS
  'Payment processor fee on one transaction, in naira, zero for streams that '
  'never touch a card. One definition so the campus totals and the payment '
  'breakdown cannot disagree.';

-- ---------------------------------------------------------------------------
-- 2. What a campus actually earns the company.
-- ---------------------------------------------------------------------------
--
-- The third-party split is unchanged; only the gateway fee is new. GREATEST
-- against zero because a fee cannot make a payment worth less than nothing,
-- and a partner's share of a negative number would be a charge.
CREATE OR REPLACE FUNCTION public.school_earnings(p_from date, p_to date)
RETURNS TABLE(school_id bigint, school_name text, payments bigint,
              collected numeric, company_share numeric)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    si.school_id,
    si.school_name,
    COUNT(*)::bigint,
    SUM(si.amount)::numeric,
    SUM(
      GREATEST(
        si.amount * CASE COALESCE(pf.basis, 'all')
          WHEN 'percentage' THEN COALESCE(pf.percent, 100) / 100.0
          ELSE 1
        END
        - CASE WHEN COALESCE(pf.basis,'all') = 'flat_per_transaction'
               THEN GREATEST(si.amount - (pf.amount_kobo / 100.0), 0)
               ELSE 0 END
        -- The new term. What the processor took before the money arrived.
        - public.stream_gateway_fee(si.stream, si.amount, si.received_at::date),
      0)
    )::numeric
  FROM public.school_income si
  LEFT JOIN LATERAL (
    SELECT p.basis, p.amount_kobo, p.percent
    FROM public.platform_fees p
    WHERE p.stream = si.stream AND p.effective_from <= si.received_at::date
    ORDER BY p.effective_from DESC LIMIT 1
  ) pf ON true
  WHERE si.received_at::date BETWEEN p_from AND p_to
  GROUP BY si.school_id, si.school_name
  ORDER BY 4 DESC;
$fn$;

REVOKE ALL ON FUNCTION public.school_earnings(date, date)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The same arithmetic, per payment.
-- ---------------------------------------------------------------------------
--
-- The breakdown exists so a partner can check the total, so it has to use the
-- identical expression. Two copies of a formula is how a card and its detail
-- come to disagree -- which is exactly what this migration is fixing.
CREATE OR REPLACE FUNCTION public.school_payment_breakdown(
  p_school_id bigint,
  p_from      date,
  p_to        date
)
RETURNS TABLE(received_at timestamptz, stream text, amount numeric,
              company_share numeric, payer_id text, payer_name text,
              payer_username text, reference text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    si.received_at,
    si.stream,
    si.amount,
    GREATEST(
      si.amount * CASE COALESCE(pf.basis, 'all')
          WHEN 'percentage' THEN COALESCE(pf.percent, 100) / 100.0
          ELSE 1 END
      - CASE WHEN COALESCE(pf.basis, 'all') = 'flat_per_transaction'
             THEN GREATEST(si.amount - (pf.amount_kobo / 100.0), 0)
             ELSE 0 END
      - public.stream_gateway_fee(si.stream, si.amount, si.received_at::date),
    0)::numeric,
    si.payer,
    p.full_name,
    p.username,
    NULL::text
  FROM public.school_income si
  LEFT JOIN public.profiles p ON p.id::text = si.payer
  LEFT JOIN LATERAL (
    SELECT f.basis, f.amount_kobo, f.percent
    FROM public.platform_fees f
    WHERE f.stream = si.stream AND f.effective_from <= si.received_at::date
    ORDER BY f.effective_from DESC LIMIT 1
  ) pf ON true
  WHERE si.received_at::date BETWEEN p_from AND p_to
    AND (p_school_id IS NULL AND si.school_id IS NULL
         OR si.school_id = p_school_id)
  ORDER BY si.received_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.school_payment_breakdown(bigint, date, date)
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
