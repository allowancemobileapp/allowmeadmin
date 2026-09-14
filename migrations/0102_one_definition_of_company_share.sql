-- 0102: the ticket cut was flat N500. It is tiered. Gross profit was wrong.
--
-- FOUND BY READING docs/PAYMENTS.md IN THE APP REPO, §10:
--
--     Tickets: <=N1,000 -> N100; <=N5,000 -> N300; <=N10,000 -> N500;
--              above -> N1,000. A price on a boundary pays the LOWER fee.
--
-- and confirmed against the live function: ticket_platform_fee(800) = 100,
-- ticket_platform_fee(5000) = 300, ticket_platform_fee(12000) = 1000.
--
-- My 0085 registered Event tickets as flat_per_transaction at 50000 kobo --
-- N500 every ticket regardless of price. On the fourteen real tickets:
--
--     flat N500 each     N7,000   what the books said the company kept
--     tiered (correct)   N1,600   what it actually keeps
--
-- N5,400 of organiser money counted as company revenue, flowing straight into
-- Monthly Gross Profit and from there into the salary band. 0085 was written
-- from a proposal document, not from the fee function, and the function is
-- the one that charges people.
--
-- WHY A NEW BASIS RATHER THAN A NEW NUMBER. A tiered fee cannot be applied to
-- a stream total: N7,000 across fourteen tickets tells you nothing about how
-- many were under N1,000. It has to be evaluated per ticket. So the split
-- moves from "apply a rule to an aggregate" to "sum a per-transaction share",
-- which is also what the campus breakdown already does -- and the two paths
-- finally share one function instead of two copies of the same CASE.
--
-- ALSO IN HERE: subscription_discrepancies switches from is_paid_tier() to
-- has_plus(), which the doc names as canonical. They agree today (31 = 31)
-- only because no expiry has passed yet. From the first lapse onward a tier
-- that still reads 'Membership' inside the three-day grace would count as
-- paying under the old test, and has_plus is what the app itself uses.

-- ---------------------------------------------------------------------------
-- 1. A basis that delegates to the function that actually charges people.
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_fees DROP CONSTRAINT IF EXISTS platform_fees_basis_check;
ALTER TABLE public.platform_fees ADD CONSTRAINT platform_fees_basis_check
  CHECK (basis IN ('all', 'flat_per_transaction', 'percentage', 'tiered_ticket'));

ALTER TABLE public.platform_fees DROP CONSTRAINT IF EXISTS fee_has_its_value;
ALTER TABLE public.platform_fees ADD CONSTRAINT fee_has_its_value CHECK (
     basis = 'all'
  OR basis = 'tiered_ticket'
  OR (basis = 'flat_per_transaction' AND amount_kobo IS NOT NULL)
  OR (basis = 'percentage' AND percent IS NOT NULL));

-- ---------------------------------------------------------------------------
-- 2. What the company keeps from ONE transaction, before gateway fees.
-- ---------------------------------------------------------------------------
--
-- The single definition. month_collections_kobo, school_earnings and
-- school_payment_breakdown all call this now. Three copies of the split CASE
-- is how a card and its breakdown came to disagree in 0098, and how the
-- ticket rule was wrong in one place while the fee function was right in
-- another.
CREATE OR REPLACE FUNCTION public.company_share_of(
  p_stream text,
  p_amount numeric,          -- NAIRA, as company_income and school_income carry it
  p_on     date DEFAULT current_date
)
RETURNS numeric
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  f public.platform_fees;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RETURN 0; END IF;

  SELECT * INTO f FROM public.platform_fees
  WHERE stream = p_stream AND effective_from <= p_on
  ORDER BY effective_from DESC LIMIT 1;

  RETURN CASE COALESCE(f.basis, 'all')
    WHEN 'all' THEN p_amount
    -- Never negative: a ticket that somehow sold for less than the fee means
    -- the company keeps what came in, not that it owes the organiser.
    WHEN 'flat_per_transaction' THEN LEAST(p_amount, f.amount_kobo / 100.0)
    WHEN 'percentage'           THEN ROUND(p_amount * f.percent / 100.0, 2)
    -- The fee schedule the app enforces at checkout. One source of truth,
    -- owned by the app repo, read here rather than restated.
    WHEN 'tiered_ticket'        THEN LEAST(p_amount, public.ticket_platform_fee(p_amount))
    ELSE p_amount
  END;
END $fn$;

REVOKE ALL ON FUNCTION public.company_share_of(text, numeric, date)
  FROM anon, authenticated;

COMMENT ON FUNCTION public.company_share_of(text, numeric, date) IS
  'The company''s cut of one transaction, in naira, before gateway fees. The '
  'ONLY place the third-party split is defined.';

-- Tickets now use it.
UPDATE public.platform_fees
   SET basis = 'tiered_ticket', amount_kobo = NULL, percent = NULL,
       note = 'Tiered platform fee from ticket_platform_fee(): <=N1,000 -> N100, '
              '<=N5,000 -> N300, <=N10,000 -> N500, above -> N1,000. The '
              'balance belongs to the organiser. Replaces a flat N500 that '
              'overstated the company''s cut 4.4x on real tickets.',
       updated_at = now()
 WHERE stream = 'Event tickets';

-- ---------------------------------------------------------------------------
-- 3. Gross profit collections, summed per transaction.
-- ---------------------------------------------------------------------------
--
-- Same output shape as before -- the UI and the golden tests read these
-- columns -- but computed by summing company_share_of() over rows rather than
-- applying a rule to the stream total. fee_basis is kept for the UI's
-- "reduces gross profit" labelling.
CREATE OR REPLACE FUNCTION public.month_collections_kobo(p_month date)
RETURNS TABLE(stream text, slug text, collected_kobo bigint, third_party_kobo bigint,
              company_kobo bigint, payments bigint, fee_basis text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH per_row AS (
    SELECT ci.stream,
           ci.amount,
           public.company_share_of(ci.stream, ci.amount, ci.received_at::date) AS keep
    FROM public.company_income ci
    WHERE date_trunc('month', ci.received_at) = date_trunc('month', p_month)
  ),
  fee AS (
    SELECT DISTINCT ON (pf.stream) pf.stream, pf.basis
    FROM public.platform_fees pf
    WHERE pf.effective_from <= p_month
    ORDER BY pf.stream, pf.effective_from DESC
  )
  SELECT
    r.stream,
    public.income_stream_slug(r.stream),
    ROUND(SUM(r.amount) * 100)::bigint,
    ROUND(SUM(r.amount - r.keep) * 100)::bigint,
    ROUND(SUM(r.keep) * 100)::bigint,
    COUNT(*)::bigint,
    COALESCE(f.basis, 'all')
  FROM per_row r
  LEFT JOIN fee f ON f.stream = r.stream
  GROUP BY r.stream, f.basis
  ORDER BY 3 DESC;
$fn$;

REVOKE ALL ON FUNCTION public.month_collections_kobo(date) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The campus figures, on the same definition.
-- ---------------------------------------------------------------------------
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
    SUM(GREATEST(
      public.company_share_of(si.stream, si.amount, si.received_at::date)
      - public.stream_gateway_fee(si.stream, si.amount, si.received_at::date),
    0))::numeric
  FROM public.school_income si
  WHERE si.received_at::date BETWEEN p_from AND p_to
  GROUP BY si.school_id, si.school_name
  ORDER BY 4 DESC;
$fn$;

REVOKE ALL ON FUNCTION public.school_earnings(date, date) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.school_payment_breakdown(
  p_school_id bigint, p_from date, p_to date)
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
      public.company_share_of(si.stream, si.amount, si.received_at::date)
      - public.stream_gateway_fee(si.stream, si.amount, si.received_at::date),
    0)::numeric,
    si.payer,
    p.full_name,
    p.username,
    NULL::text
  FROM public.school_income si
  LEFT JOIN public.profiles p ON p.id::text = si.payer
  WHERE si.received_at::date BETWEEN p_from AND p_to
    AND (p_school_id IS NULL AND si.school_id IS NULL
         OR si.school_id = p_school_id)
  ORDER BY si.received_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.school_payment_breakdown(bigint, date, date)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Is this person Plus" means has_plus(), not the tier column.
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated rather than replaced: CREATE OR REPLACE VIEW cannot
-- change a column's expression when a dependent column moves, and the safe
-- form of that is the same one 0101 used.
DROP VIEW IF EXISTS public.subscription_discrepancies;

CREATE VIEW public.subscription_discrepancies AS
  SELECT
    p.id            AS user_id,
    p.username,
    p.full_name,
    p.subscription_tier,
    p.subscription_expires_at,
    p.trial_source,
    p.created_at    AS joined_at,
    (p.paystack_customer_code IS NOT NULL) AS has_gateway_evidence,
    p.paystack_customer_code,
    public.has_plus(p.id) AS is_plus_now,

    COALESCE(pay.paid_rows, 0)   AS paid_payments,
    COALESCE(pay.zero_rows, 0)   AS zero_payments,
    COALESCE(pay.total_kobo, 0)  AS collected_kobo,
    pay.last_payment_at,

    CASE
      WHEN public.has_plus(p.id)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND p.paystack_customer_code IS NOT NULL
        THEN 'paid through the gateway, nothing recorded'
      WHEN public.has_plus(p.id)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND COALESCE(pay.zero_rows, 0) > 0
        THEN 'paying, but only cancellations recorded'
      -- A gift week or an admin grant is Plus without a payment, and that is
      -- the design, not a discrepancy. Only an unexplained one is flagged.
      WHEN public.has_plus(p.id)
       AND COALESCE(pay.paid_rows, 0) = 0
       AND p.trial_source IS NULL
       AND p.subscription_expires_at IS NOT NULL
        THEN 'on Plus, never paid, not a trial (free upgrade)'
      WHEN NOT public.has_plus(p.id)
       AND COALESCE(pay.paid_rows, 0) > COALESCE(pay.zero_rows, 0)
       AND (p.subscription_expires_at IS NULL OR p.subscription_expires_at > now() - interval '3 days')
        THEN 'paid, but not on Plus'
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
