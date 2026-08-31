-- 0080: the company's own books.
--
-- Everything above this file is about running the APP. This is about running
-- the COMPANY: who owns it, what comes in, what goes out, and what each
-- shareholder's stake is worth today.
--
-- ALLOWANCE SAAS LTD, RC 9615473.
--
-- THE ONE IDEA THIS FILE RESTS ON
--
-- Money enters this business through six doors and each one stores its amount
-- in a different unit. Paystack settles in KOBO, so anything its webhook
-- writes is kobo; anything the app sets is naira. Getting that wrong is not a
-- rounding error, it is a factor of one hundred, and it went unnoticed in the
-- dashboard for months.
--
-- So there is exactly ONE definition of "money that came in" -- the
-- company_income view at the bottom. Every screen, every export and every
-- shareholder valuation reads it. Nothing else is allowed to sum a revenue
-- table directly, because two places that add up money independently will
-- eventually disagree, and the one that is wrong will be the one on screen.

-- ===========================================================================
-- 1. Settings, so a price is never hardcoded again
-- ===========================================================================
--
-- The Plus price lives inside log_membership_change() as the literal 70000.
-- Changing what Plus costs currently means writing a migration, and the
-- number appears nowhere a person would think to look.
CREATE TABLE IF NOT EXISTS public.company_settings (
  key         text PRIMARY KEY,
  value       numeric NOT NULL,
  unit        text NOT NULL DEFAULT 'kobo' CHECK (unit IN ('kobo','naira','percent','count')),
  label       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

INSERT INTO public.company_settings (key, value, unit, label) VALUES
  ('plus_price_monthly',      70000,  'kobo',  'Allowance Plus, per month'),
  ('store_sub_monthly',      300000,  'kobo',  'Store subscription, per month'),
  ('delivery_fee_plus',          50,  'naira', 'Allowance cut per delivery (Plus customer)'),
  ('delivery_fee_free',         150,  'naira', 'Allowance cut per delivery (free customer)'),
  ('gist_local_per_day',        500,  'naira', 'Local gist, per day'),
  ('gist_national_per_day',    1000,  'naira', 'National gist, per day'),
  ('gist_global_per_day',      5000,  'naira', 'Global gist, per day'),
  ('paystack_pct',              1.5,  'percent','Paystack percentage fee'),
  ('paystack_flat',             100,  'naira', 'Paystack flat fee (waived under N2,500)'),
  ('paystack_cap',             2000,  'naira', 'Paystack fee cap'),
  ('vat_pct',                   7.5,  'percent','VAT'),
  ('cit_pct',                     0,  'percent','Company income tax (0% under N25m turnover)')
ON CONFLICT (key) DO NOTHING;

-- The trigger reads this instead of carrying the number itself.
CREATE OR REPLACE FUNCTION public.plus_price_kobo()
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT value FROM public.company_settings
                    WHERE key = 'plus_price_monthly'), 70000);
$$;

-- ===========================================================================
-- 2. Who owns the company
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.share_classes (
  id              serial PRIMARY KEY,
  name            text NOT NULL UNIQUE,
  votes_per_share integer NOT NULL DEFAULT 1,
  -- Article 3: Class A may only be issued to the Founder, and reaches anyone
  -- else by transfer from the Founder. Recorded so the cap table can refuse
  -- an issuance the Articles forbid.
  founder_only    boolean NOT NULL DEFAULT false,
  nominal_value   numeric(12,2) NOT NULL DEFAULT 10.00,
  authorised      bigint NOT NULL,
  sort_order      integer NOT NULL DEFAULT 0
);

INSERT INTO public.share_classes
  (name, votes_per_share, founder_only, nominal_value, authorised, sort_order)
VALUES
  ('Class A Ordinary', 10, true,  10.00, 800000, 1),
  ('Class B Ordinary',  1, false, 10.00, 200000, 2)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.shareholders (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name    text NOT NULL,
  email        text,
  role_title   text,
  is_founder   boolean NOT NULL DEFAULT false,
  -- Article 1: a Founding Team Member is the only person other than the
  -- Founder who may hold Class A, and only by transfer.
  is_founding_team boolean NOT NULL DEFAULT false,
  joined_on    date NOT NULL DEFAULT current_date,
  exited_on    date,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shareholders_name_idx
  ON public.shareholders (lower(full_name));

-- A LEDGER, not a balance column.
--
-- Holdings are the sum of what has been issued, transferred and bought back.
-- A single "shares" number on the shareholder row would have to be kept in
-- step by application code, and the first time that failed the cap table
-- would be quietly wrong -- which is the one document that must not be.
CREATE TABLE IF NOT EXISTS public.share_transactions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_id  uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  class_id        integer NOT NULL REFERENCES public.share_classes(id),

  -- Signed. An issue and a transfer in are positive; a transfer out and a
  -- buyback are negative. One column, so a holding is a SUM and never a
  -- CASE expression somebody can get the wrong way round.
  shares          bigint NOT NULL,

  kind            text NOT NULL CHECK (kind IN
                    ('issue','transfer_in','transfer_out','buyback','conversion')),

  price_per_share numeric(14,4) NOT NULL DEFAULT 0,
  txn_date        date NOT NULL DEFAULT current_date,

  -- The other side of a transfer, so both halves can be found together.
  counterparty_id uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS share_txn_holder_idx
  ON public.share_transactions (shareholder_id, txn_date);

-- ===========================================================================
-- 3. What the company is worth
-- ===========================================================================
--
-- Valuation is a JUDGEMENT, not a calculation, so it is recorded rather than
-- derived. The most recent row is what the stakeholder page divides up.
CREATE TABLE IF NOT EXISTS public.company_valuations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  valued_on      date NOT NULL DEFAULT current_date,
  amount         numeric(18,2) NOT NULL,
  method         text NOT NULL DEFAULT 'manual' CHECK (method IN
                   ('manual','round_post_money','multiple_of_revenue','book_value')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     text
);

CREATE INDEX IF NOT EXISTS valuations_date_idx
  ON public.company_valuations (valued_on DESC);

-- ===========================================================================
-- 4. Money raised
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.funding_rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  round_type      text NOT NULL DEFAULT 'priced' CHECK (round_type IN
                    ('pre_seed','seed','priced','bridge','grant')),
  amount_raised   numeric(18,2) NOT NULL DEFAULT 0,
  pre_money       numeric(18,2),
  post_money      numeric(18,2),
  -- Whether the option pool was created BEFORE the round (founders bear the
  -- dilution) or AFTER (everyone does). It is the single most expensive term
  -- founders agree to without noticing.
  pool_pct        numeric(6,3) NOT NULL DEFAULT 0,
  pool_pre_money  boolean NOT NULL DEFAULT true,
  closed_on       date,
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN
                    ('planned','open','closed','cancelled')),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- SAFEs. OPTIONAL -- a company with none simply has no rows here, and the
-- cap table maths skips the conversion step entirely.
--
-- A SAFE is money now for shares later. It converts at the NEXT priced round,
-- at whichever is kinder to the investor: the discount off that round's
-- price, or the price implied by the valuation cap. Both are stored because
-- both are needed to work out which one wins.
CREATE TABLE IF NOT EXISTS public.safes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_name   text NOT NULL,
  investor_email  text,
  amount          numeric(18,2) NOT NULL CHECK (amount > 0),

  valuation_cap   numeric(18,2),      -- null = uncapped
  discount_pct    numeric(6,3) NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct < 100),
  -- Most favoured nation: this SAFE takes the best terms given to any later
  -- SAFE. Recorded so it is visible; it does not compute anything on its own.
  mfn             boolean NOT NULL DEFAULT false,

  -- Post-money SAFEs (the YC 2018 form) dilute the founders and NOT each
  -- other; pre-money ones dilute each other too. It changes who pays for the
  -- round, so it is not a detail.
  post_money      boolean NOT NULL DEFAULT true,

  signed_on       date NOT NULL DEFAULT current_date,
  status          text NOT NULL DEFAULT 'outstanding' CHECK (status IN
                    ('outstanding','converted','repaid','cancelled')),
  converted_on    date,
  converted_shares bigint,
  converted_round_id uuid REFERENCES public.funding_rounds(id) ON DELETE SET NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS safes_status_idx ON public.safes (status);

-- ===========================================================================
-- 5. Money going out
-- ===========================================================================
--
-- company_expenses already exists (created by server.ts at boot) and is left
-- exactly as it is. These are the two things it cannot express.

-- An INVESTMENT is not an expense. Buying a laptop is money out and an asset
-- in; paying for electricity is money out and nothing in. A balance sheet
-- that cannot tell them apart is not a balance sheet.
CREATE TABLE IF NOT EXISTS public.company_investments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  category      text NOT NULL DEFAULT 'Other',
  amount        numeric(18,2) NOT NULL CHECK (amount > 0),
  invested_on   date NOT NULL DEFAULT current_date,
  -- What it is worth now. Null means "still worth what we paid".
  current_value numeric(18,2),
  disposed_on   date,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text
);

-- Money the company is HOLDING but does not own: group creators paid on the
-- 21st, ticket organisers, vendors. Counting it as revenue is the classic way
-- a young company thinks it is profitable while spending other people's cash.
CREATE TABLE IF NOT EXISTS public.company_liabilities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  owed_to       text,
  amount        numeric(18,2) NOT NULL,
  due_on        date,
  settled_on    date,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Salaries, so payroll is visible without being buried in expenses.
CREATE TABLE IF NOT EXISTS public.staff_salaries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_id uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  person_name    text NOT NULL,
  role_title     text,
  monthly_gross  numeric(14,2) NOT NULL DEFAULT 0,
  started_on     date NOT NULL DEFAULT current_date,
  ended_on       date,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ===========================================================================
-- 6. THE income definition
-- ===========================================================================
--
-- Every stream, every amount in NAIRA, one row per payment. This view is the
-- only thing in the system permitted to convert a gateway column into money.
--
-- If a new revenue stream is added to the app, it is added HERE and every
-- screen picks it up at once.
CREATE OR REPLACE VIEW public.company_income AS
  -- Plus subscriptions. amount is kobo.
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
  -- Gist advertising. amount_paid is kobo; total_price is naira and is the
  -- fallback for a gist that was priced but settled another way.
  SELECT
    'Gist adverts',
    g.id::text,
    COALESCE(NULLIF(g.amount_paid, 0) / 100.0, g.total_price, 0)::numeric(18,2),
    g.created_at,
    g.user_id::text,
    g.payment_reference
  FROM public.gists g
  WHERE (g.amount_paid > 0 OR g.paid = true)
    AND (g.payment_reference IS NULL OR g.payment_reference NOT ILIKE 'coupon%')

  UNION ALL
  -- Event tickets. amount_paid is kobo.
  SELECT
    'Event tickets',
    tp.id::text,
    (tp.amount_paid / 100.0)::numeric(18,2),
    tp.created_at,
    tp.user_id::text,
    tp.payment_reference
  FROM public.ticket_purchases tp
  WHERE tp.amount_paid > 0
    AND COALESCE(tp.status, 'success') <> 'failed'

  UNION ALL
  -- Premium group access. amount is naira (the notification prints it with a
  -- naira sign and no division).
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
  -- Store subscriptions. amount_minor is named for its unit: kobo.
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
  -- Delivery commission. allowance_fee is naira and is only earned once the
  -- customer has confirmed the delivery.
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
  'Every naira the company has earned, one row per payment, already converted '
  'to naira. THE single source for revenue. Never sum a payments table '
  'directly -- add the stream here instead.';

-- ===========================================================================
-- 7. Current holdings, and what they are worth
-- ===========================================================================

CREATE OR REPLACE VIEW public.cap_table AS
  WITH holdings AS (
    SELECT
      st.shareholder_id,
      st.class_id,
      SUM(st.shares) AS shares
    FROM public.share_transactions st
    GROUP BY st.shareholder_id, st.class_id
    HAVING SUM(st.shares) > 0
  ),
  totals AS (
    SELECT
      SUM(h.shares) AS all_shares,
      SUM(h.shares * sc.votes_per_share) AS all_votes
    FROM holdings h
    JOIN public.share_classes sc ON sc.id = h.class_id
  )
  SELECT
    s.id                       AS shareholder_id,
    s.full_name,
    s.role_title,
    s.is_founder,
    sc.name                    AS share_class,
    sc.votes_per_share,
    h.shares,
    h.shares * sc.votes_per_share AS votes,
    -- Guarded: an empty cap table must render as zeroes, not divide by zero.
    ROUND(100.0 * h.shares / NULLIF(t.all_shares, 0), 4)  AS ownership_pct,
    ROUND(100.0 * (h.shares * sc.votes_per_share)
                / NULLIF(t.all_votes, 0), 4)              AS voting_pct,
    t.all_shares,
    t.all_votes
  FROM holdings h
  JOIN public.shareholders s  ON s.id = h.shareholder_id
  JOIN public.share_classes sc ON sc.id = h.class_id
  CROSS JOIN totals t
  ORDER BY h.shares * sc.votes_per_share DESC;

COMMENT ON VIEW public.cap_table IS
  'Who owns what, right now. ownership_pct and voting_pct are different '
  'numbers because Class A carries ten votes -- the founder holds 80% of the '
  'company and 97.5% of the votes.';

-- ===========================================================================
-- 8. History, so the graph has something to draw
-- ===========================================================================
--
-- Today's value is computed live. Yesterday's cannot be -- the valuation and
-- the holdings both move -- so it is written down once a day.
CREATE TABLE IF NOT EXISTS public.stakeholder_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date   date NOT NULL,
  shareholder_id  uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  shares          bigint NOT NULL,
  ownership_pct   numeric(9,4) NOT NULL,
  voting_pct      numeric(9,4) NOT NULL,
  company_value   numeric(18,2) NOT NULL,
  stake_value     numeric(18,2) NOT NULL,
  -- Their share of what the company actually made that day, which is the
  -- number that makes the page worth opening daily.
  profit_share    numeric(18,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (snapshot_date, shareholder_id)
);

CREATE INDEX IF NOT EXISTS snapshots_holder_idx
  ON public.stakeholder_snapshots (shareholder_id, snapshot_date DESC);

-- Takes today's picture. Safe to run repeatedly -- the same day overwrites
-- rather than duplicating, so a retry or a second call costs nothing.
CREATE OR REPLACE FUNCTION public.take_stakeholder_snapshot(
  p_date date DEFAULT current_date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value    numeric;
  v_income   numeric;
  v_expense  numeric;
  v_profit   numeric;
  v_count    integer;
BEGIN
  SELECT amount INTO v_value
  FROM public.company_valuations
  WHERE valued_on <= p_date
  ORDER BY valued_on DESC, created_at DESC
  LIMIT 1;
  v_value := COALESCE(v_value, 0);

  SELECT COALESCE(SUM(amount), 0) INTO v_income
  FROM public.company_income
  WHERE received_at::date = p_date;

  SELECT COALESCE(SUM(amount), 0) INTO v_expense
  FROM public.company_expenses
  WHERE expense_date::date = p_date;

  v_profit := v_income - v_expense;

  INSERT INTO public.stakeholder_snapshots
    (snapshot_date, shareholder_id, shares, ownership_pct, voting_pct,
     company_value, stake_value, profit_share)
  SELECT
    p_date,
    ct.shareholder_id,
    ct.shares,
    ct.ownership_pct,
    ct.voting_pct,
    v_value,
    ROUND(v_value * ct.ownership_pct / 100.0, 2),
    ROUND(v_profit * ct.ownership_pct / 100.0, 2)
  FROM public.cap_table ct
  ON CONFLICT (snapshot_date, shareholder_id) DO UPDATE
    SET shares        = EXCLUDED.shares,
        ownership_pct = EXCLUDED.ownership_pct,
        voting_pct    = EXCLUDED.voting_pct,
        company_value = EXCLUDED.company_value,
        stake_value   = EXCLUDED.stake_value,
        profit_share  = EXCLUDED.profit_share;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

-- Nightly, just before midnight, so the day it stamps is the day it measured.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('stakeholder_snapshot')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stakeholder_snapshot');
    PERFORM cron.schedule(
      'stakeholder_snapshot', '55 23 * * *',
      $cron$SELECT public.take_stakeholder_snapshot();$cron$);
  ELSE
    RAISE NOTICE 'pg_cron not installed -- the shareholder value chart will '
                 'have no history until take_stakeholder_snapshot() is scheduled.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule stakeholder_snapshot (%).', SQLERRM;
END $$;

-- ===========================================================================
-- 9. Locking it down
-- ===========================================================================
--
-- THIS IS THE MOST SENSITIVE DATA IN THE BUSINESS. Salaries, ownership,
-- valuation. Every table here is RLS-on with NO policy at all, deliberately:
-- the admin server connects on DATABASE_URL as the owning role and bypasses
-- RLS, and nothing else should ever read these through PostgREST.
--
-- 0062 is the reason this is spelled out. Three commerce tables were writable
-- by anyone holding the anon key -- the key that ships inside the app -- and
-- it was found by accident. A table with RLS enabled and no policy denies
-- everyone; a table with RLS off is open to whoever asks.
ALTER TABLE public.company_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_classes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shareholders            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.share_transactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_valuations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.funding_rounds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safes                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_investments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_liabilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_salaries          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stakeholder_snapshots   ENABLE ROW LEVEL SECURITY;

-- company_expenses is created by server.ts at boot with no RLS at all, which
-- means PostgREST has been serving the company's expense ledger to anyone
-- holding the anon key -- the key that ships inside the mobile app. Same class
-- of hole as 0062, found the same way: by counting the tables in this file
-- against the ones protected in it.
--
-- Closing it here rather than in server.ts because that file runs CREATE TABLE
-- IF NOT EXISTS on every boot and is the wrong place for a security decision.
-- The admin server connects as the owning role and is unaffected.
ALTER TABLE public.company_expenses        ENABLE ROW LEVEL SECURITY;

-- The views inherit nothing, so they are revoked by hand. A view is not
-- covered by the RLS on its base tables when it is owned by a superuser.
REVOKE ALL ON public.company_income  FROM anon, authenticated;
REVOKE ALL ON public.cap_table       FROM anon, authenticated;

-- 0068's lesson, applied before it can bite: a function in the public schema
-- is callable by anon THE MOMENT IT EXISTS.
REVOKE ALL ON FUNCTION public.take_stakeholder_snapshot(date) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.plus_price_kobo() FROM anon;

-- ===========================================================================
-- 10. The founding allocation, from the amended MEMART
-- ===========================================================================
--
-- Part 5 of the Articles, adopted 2026. 1,000,000 shares of N10 = N10,000,000
-- nominal capital, fully allotted.
--
-- Seeded only if the cap table is empty, so re-running this file never
-- doubles anybody's holding.
DO $$
DECLARE
  v_class_a integer;
  v_class_b integer;
  v_id      uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.share_transactions) THEN
    RAISE NOTICE 'Cap table already has entries -- founding allocation skipped.';
    RETURN;
  END IF;

  SELECT id INTO v_class_a FROM public.share_classes WHERE name = 'Class A Ordinary';
  SELECT id INTO v_class_b FROM public.share_classes WHERE name = 'Class B Ordinary';

  -- Founder, Class A, ten votes a share.
  INSERT INTO public.shareholders (full_name, role_title, is_founder, is_founding_team)
  VALUES ('EZENWAMMADU IZUCHUKWU JAMES', 'Founder & Permanent Chairman', true, true)
  RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_a, 800000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  INSERT INTO public.shareholders (full_name, role_title, is_founding_team)
  VALUES ('LANIYAN MOBOLUWASORE', 'COO', true) RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_b, 100000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  INSERT INTO public.shareholders (full_name, role_title, is_founding_team)
  VALUES ('AKPALA ABDULAZEEZ OLANREWAJU', 'CTO', true) RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_b, 50000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  INSERT INTO public.shareholders (full_name, role_title, is_founding_team)
  VALUES ('ADESOPE AMINAT', 'CIO', true) RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_b, 10000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  INSERT INTO public.shareholders (full_name)
  VALUES ('EZENWAMMADU ARINZECHUKWU CHRISTIAN') RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_b, 30000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  INSERT INTO public.shareholders (full_name)
  VALUES ('OKWUEGO LINDA OGECHUKWU') RETURNING id INTO v_id;
  INSERT INTO public.share_transactions
    (shareholder_id, class_id, shares, kind, price_per_share, txn_date, note)
  VALUES (v_id, v_class_b, 10000, 'issue', 10.00, current_date,
          'Founding allocation, amended MEMART Part 5');

  -- The opening valuation is nominal capital. It is not what the company is
  -- worth; it is what was paid in, and it is the only defensible number to
  -- start from before a round prices it.
  INSERT INTO public.company_valuations (amount, method, note)
  VALUES (10000000, 'book_value',
          'Nominal share capital at incorporation. Replace with a real '
          'valuation before showing anyone a stake value.');

  RAISE NOTICE 'Seeded 6 shareholders, 1,000,000 shares.';
END $$;

NOTIFY pgrst, 'reload schema';
