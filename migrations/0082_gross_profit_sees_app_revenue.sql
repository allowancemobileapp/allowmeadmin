-- 0082: Monthly Gross Profit was blind to almost all of the company's money.
--
-- THE BUG
--
-- 0081 built the gross profit calculation on `revenue_entries` -- a table
-- somebody has to type into by hand. Meanwhile every naira the app actually
-- earns lands in the payment tables that `company_income` reads: membership,
-- gist adverts, event tickets, premium groups, store subscriptions and
-- delivery commission.
--
-- The two were never connected. So Monthly Gross Profit was zero unless a
-- human re-keyed every Paystack settlement, and zero is Band 1, and Band 1
-- pays four people nothing.
--
-- That is the wrong direction to be wrong in. Understating gross profit
-- underpays people under a signed contract.
--
-- THE FIX, in two halves:
--
--   1. This file widens revenue_entries so the six real streams can be named
--      at all -- it only allowed marketplace/plus/groups/fantasy/other.
--   2. financeV2Routes.draftFor() now sums company_income AS WELL, which is
--      the half that actually matters.
--
-- WHAT revenue_entries IS FOR, NOW THAT IT IS NOT THE ONLY SOURCE
--
-- Money that does NOT flow through the app: an offline sponsorship, a bank
-- transfer, an invoice paid directly. Anything settled through Paystack is
-- already counted by company_income, and recording it here as well would
-- double it -- which overstates gross profit and OVERPAYS. The draft
-- breakdown shows automatic and manual separately so that is visible rather
-- than silent.

-- ---------------------------------------------------------------------------
-- 1. Let a manual entry name any of the real streams.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_name text;
BEGIN
  -- The constraint was created inline, so its name is generated. Find it by
  -- what it mentions rather than guessing.
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'revenue_entries'
    AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%stream%'
  LIMIT 1;

  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.revenue_entries DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_stream_check CHECK (stream IN (
    -- The six the app settles automatically. Named here so an OFF-PLATFORM
    -- payment of the same kind can still be categorised correctly.
    'plus_subscriptions',
    'gist_adverts',
    'event_tickets',
    'premium_groups',
    'store_subscriptions',
    'delivery_commission',
    -- Everything else.
    'marketplace_commission',
    'fantasy',
    'sponsorship',
    'other'
  ));

-- ---------------------------------------------------------------------------
-- 2. Name the automatic streams once, so SQL and TypeScript agree.
-- ---------------------------------------------------------------------------
--
-- company_income labels its streams in prose ('Plus subscriptions'). The
-- revenue_entries CHECK uses slugs. This maps between them so a report can
-- group both sources under one heading instead of showing the same stream
-- twice under two spellings.
CREATE OR REPLACE FUNCTION public.income_stream_slug(p_label text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_label
    WHEN 'Plus subscriptions'   THEN 'plus_subscriptions'
    WHEN 'Gist adverts'         THEN 'gist_adverts'
    WHEN 'Event tickets'        THEN 'event_tickets'
    WHEN 'Premium groups'       THEN 'premium_groups'
    WHEN 'Store subscriptions'  THEN 'store_subscriptions'
    WHEN 'Delivery commission'  THEN 'delivery_commission'
    ELSE 'other'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 3. A month's automatic collections, in kobo.
-- ---------------------------------------------------------------------------
--
-- company_income.amount is NAIRA (it divides the kobo columns on the way out,
-- which is what fixed the 100x dashboard bug). Gross profit works in integer
-- kobo, so it is converted back here -- once, in one place, rather than in
-- every caller.
--
-- ROUND before ::bigint: a naira numeric like 1234.565 must not be truncated
-- to 123456 kobo when it is 123457.
CREATE OR REPLACE FUNCTION public.month_collections_kobo(p_month date)
RETURNS TABLE (stream text, slug text, collected_kobo bigint, payments bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    ci.stream,
    public.income_stream_slug(ci.stream),
    ROUND(SUM(ci.amount) * 100)::bigint,
    COUNT(*)::bigint
  FROM public.company_income ci
  WHERE date_trunc('month', ci.received_at) = date_trunc('month', p_month)
  GROUP BY ci.stream
  ORDER BY 3 DESC;
$$;

REVOKE ALL ON FUNCTION public.month_collections_kobo(date) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.income_stream_slug(text) FROM anon;

COMMENT ON FUNCTION public.month_collections_kobo(date) IS
  'Automatic collections for a calendar month, in KOBO, per stream. This is '
  'the input to Monthly Gross Profit. Coupon-funded gists are already '
  'excluded by company_income.';

NOTIFY pgrst, 'reload schema';
