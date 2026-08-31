-- 0085: two things that made the money wrong on screen.
--
-- (1) TICKETS WERE COUNTED AT FACE VALUE.
--
-- The company charges a FLAT N500 technology fee per ticket sold. The rest of
-- what a buyer pays belongs to the event organiser and was never the
-- company's money. Counting the full N16,500 of a month's ticket sales as
-- revenue overstates gross profit, and gross profit sets four salaries.
--
-- The contract already says how to handle this. Monthly Gross Profit is gross
-- sums collected LESS "sums payable to sellers, merchants, vendors or other
-- third parties as their share of transaction proceeds". So the full amount
-- is collections and the organiser's share is a deduction. 14 tickets:
-- N16,500 collected, N9,500 to organisers, N7,000 to the company.
--
-- The fee is a ROW, not a constant, so changing it later is a form and not a
-- deployment.
--
-- (2) EVERY EXPENSE WAS SITTING OUTSIDE THE CALCULATION.
--
-- 0081 added company_expenses.category defaulting to 'other'. 'other' is not
-- deductible, and the older Expenses page only ever set `reason`. So every
-- cost already logged read as zero against gross profit -- the company looked
-- profitable while real money was going out. This backfills a category from
-- the reason text, and the app gains a way to re-tag by hand.

-- ---------------------------------------------------------------------------
-- 1. What the company actually keeps, per stream.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_fees (
  id            serial PRIMARY KEY,
  stream        text NOT NULL,

  -- all                  the whole payment is the company's
  -- flat_per_transaction a fixed fee per payment; the rest is a third party's
  -- percentage           the company keeps percent% of each payment
  basis         text NOT NULL DEFAULT 'all'
                CHECK (basis IN ('all','flat_per_transaction','percentage')),
  amount_kobo   bigint,
  percent       numeric(6,3),

  effective_from date NOT NULL DEFAULT DATE '2020-01-01',
  note          text,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fee_has_its_value CHECK (
    basis = 'all'
    OR (basis = 'flat_per_transaction' AND amount_kobo IS NOT NULL)
    OR (basis = 'percentage' AND percent IS NOT NULL)
  ),
  UNIQUE (stream, effective_from)
);

-- From the partnership proposal, which is the published price list.
INSERT INTO public.platform_fees (stream, basis, amount_kobo, percent, note) VALUES
  ('Plus subscriptions',  'all', NULL, NULL,
   'N700 a month. The whole subscription is the company revenue.'),
  ('Gist adverts',        'all', NULL, NULL,
   'Local N500/day, National N1,000/day, Global N5,000/day. All company revenue.'),
  ('Event tickets',       'flat_per_transaction', 50000, NULL,
   'Flat N500 technology fee per ticket. The balance belongs to the organiser.'),
  ('Premium groups',      'all', NULL, NULL, 'The whole payment is company revenue.'),
  ('Store subscriptions', 'all', NULL, NULL, 'The whole payment is company revenue.'),
  ('Delivery commission', 'all', NULL, NULL,
   'allowance_fee already holds only the company cut: N150 free, N50 Plus.')
ON CONFLICT (stream, effective_from) DO NOTHING;

ALTER TABLE public.platform_fees ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 2. A month's collections, split into ours and somebody else's.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.month_collections_kobo(date);

CREATE FUNCTION public.month_collections_kobo(p_month date)
RETURNS TABLE (
  stream           text,
  slug             text,
  collected_kobo   bigint,   -- everything the buyers paid
  third_party_kobo bigint,   -- the organiser's or vendor's share
  company_kobo     bigint,   -- what the company actually keeps
  payments         bigint,
  fee_basis        text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH raw AS (
    SELECT ci.stream,
           ROUND(SUM(ci.amount) * 100)::bigint AS gross,
           COUNT(*)::bigint                    AS n
    FROM public.company_income ci
    WHERE date_trunc('month', ci.received_at) = date_trunc('month', p_month)
    GROUP BY ci.stream
  ),
  fee AS (
    SELECT DISTINCT ON (pf.stream) pf.stream, pf.basis, pf.amount_kobo, pf.percent
    FROM public.platform_fees pf
    WHERE pf.effective_from <= p_month
    ORDER BY pf.stream, pf.effective_from DESC
  )
  SELECT
    r.stream,
    public.income_stream_slug(r.stream),
    r.gross,
    CASE COALESCE(f.basis, 'all')
      -- Never negative: if a ticket somehow sold for less than the fee, the
      -- company keeps what came in rather than inventing a payable.
      WHEN 'flat_per_transaction'
        THEN GREATEST(r.gross - (f.amount_kobo * r.n), 0)
      WHEN 'percentage'
        THEN GREATEST(r.gross - ROUND(r.gross * f.percent / 100.0)::bigint, 0)
      ELSE 0
    END,
    CASE COALESCE(f.basis, 'all')
      WHEN 'flat_per_transaction' THEN LEAST(f.amount_kobo * r.n, r.gross)
      WHEN 'percentage'           THEN ROUND(r.gross * f.percent / 100.0)::bigint
      ELSE r.gross
    END,
    r.n,
    COALESCE(f.basis, 'all')
  FROM raw r
  LEFT JOIN fee f ON f.stream = r.stream
  ORDER BY 3 DESC;
$fn$;

REVOKE ALL ON FUNCTION public.month_collections_kobo(date) FROM anon, authenticated;

COMMENT ON FUNCTION public.month_collections_kobo(date) IS
  'A month of collections per stream in KOBO, split into the third party share '
  'and the company share. Event tickets carry a flat N500 fee; the rest of a '
  'ticket price belongs to the organiser.';

-- ---------------------------------------------------------------------------
-- 3. Give every already-logged expense a real category.
-- ---------------------------------------------------------------------------
--
-- Best guess from the reason text, and only where nobody has set one yet.
-- Anything unrecognised stays 'other' and is listed on the Gross profit tab as
-- untagged, so it is visible rather than silently excluded.
UPDATE public.company_expenses SET category =
  CASE
    WHEN reason ~* '(paystack|flutterwave|gateway|processing|transfer fee)'
      THEN 'payment_processing'
    WHEN reason ~* '(supabase|hosting|server|database|storage|bandwidth|domain|vercel|api|token|compute|internet|intelligence|openai|gemini|anthropic|cloud)'
      THEN 'infrastructure'
    WHEN reason ~* '(vendor|seller|merchant|payout|organiser|organizer)'
      THEN 'seller_payouts'
    WHEN reason ~* '(refund|chargeback|reversal)'      THEN 'refunds'
    WHEN reason ~* '(salary|salaries|wage|staff|payroll|stipend)' THEN 'payroll'
    WHEN reason ~* '(market|advert|promo|campaign|influencer|flyer)' THEN 'marketing'
    WHEN reason ~* '(legal|account|audit|consult|professional|cac|filing)'
      THEN 'professional'
    WHEN reason ~* '(tax|paye|vat|levy)'               THEN 'tax'
    WHEN reason ~* '(laptop|equipment|phone|device|furniture)' THEN 'capex'
    WHEN reason ~* '(loan|interest|financ)'            THEN 'financing'
    ELSE 'other'
  END
WHERE COALESCE(category, 'other') = 'other';

-- Keep the two columns in step for anything written by the older Expenses
-- page, which only ever sets `reason`.
CREATE OR REPLACE FUNCTION public.expense_default_category()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF COALESCE(NEW.category, 'other') = 'other' AND NEW.reason IS NOT NULL THEN
    NEW.category := CASE
      WHEN NEW.reason ~* '(paystack|flutterwave|gateway|processing)'
        THEN 'payment_processing'
      WHEN NEW.reason ~* '(supabase|hosting|server|database|storage|bandwidth|domain|vercel|api|token|compute|internet|intelligence|cloud)'
        THEN 'infrastructure'
      WHEN NEW.reason ~* '(vendor|seller|merchant|payout)' THEN 'seller_payouts'
      WHEN NEW.reason ~* '(refund|chargeback|reversal)'    THEN 'refunds'
      ELSE COALESCE(NEW.category, 'other')
    END;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS expense_category_default ON public.company_expenses;
CREATE TRIGGER expense_category_default
  BEFORE INSERT OR UPDATE ON public.company_expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_default_category();

NOTIFY pgrst, 'reload schema';
