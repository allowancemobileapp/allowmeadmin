-- 0086: who people are, what each campus earns, and everyone's live share.
--
-- Three things:
--
--   1. TAGS. An admin is also a stakeholder, sometimes a director, sometimes a
--      co-founder. Those were scattered or missing, so round modelling could
--      not tell a shareholder from a staff member from an outsider.
--
--   2. SCHOOLS. The partnership proposal offers a student association 10% of
--      the gross profit generated FROM THEIR CAMPUS, rising to 15% past 1,000
--      referrals, for the duration of their tenure. That is a real liability
--      with an end date and nowhere to record it.
--
--   3. THE LIVE SPLIT. Every naira that arrives belongs, proportionally, to
--      the people on the register. This makes that visible instead of
--      theoretical.

-- ---------------------------------------------------------------------------
-- 1. Tags on a person.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS is_cofounder  boolean NOT NULL DEFAULT false;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS is_director   boolean NOT NULL DEFAULT false;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS staff_role    text;
-- An investor or an exco can be a stakeholder without being staff, and a
-- designer can be staff without owning a share. Neither implies the other.
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS is_investor   boolean NOT NULL DEFAULT false;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS is_external   boolean NOT NULL DEFAULT false;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS notes         text;

-- The four officers and the founder, from the executed contracts.
UPDATE public.shareholders SET is_director = true, is_cofounder = true
  WHERE is_founder = true;
UPDATE public.shareholders SET staff_role = role_title
  WHERE staff_role IS NULL AND role_title IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Attributing income to a campus.
-- ---------------------------------------------------------------------------
--
-- company_income records who paid. Whether that person's campus is reachable
-- depends on a column this migration cannot assume exists, so it LOOKS, and
-- builds the view it can actually support. If no link is found the view still
-- exists and reports everything as unattributed, which is honest -- better
-- than a view that fails to create and takes the Schools tab down with it.
DO $mig$
DECLARE
  v_col text;
BEGIN
  SELECT column_name INTO v_col
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND column_name IN ('school_id','school','institution_id','campus_id')
  ORDER BY array_position(
    ARRAY['school_id','school','institution_id','campus_id'], column_name)
  LIMIT 1;

  IF v_col IS NULL THEN
    EXECUTE $v$
      CREATE OR REPLACE VIEW public.school_income AS
        SELECT NULL::bigint AS school_id,
               'Unattributed'::text AS school_name,
               ci.stream, ci.amount, ci.received_at, ci.payer
        FROM public.company_income ci
    $v$;
    RAISE NOTICE 'No campus column on profiles. school_income reports everything as Unattributed.';
  ELSE
    -- profiles.school_id IS POLYMORPHIC TEXT, not a school id.
    --
    -- The column comment in the schema says "keep as text to match many
    -- school id shapes", and the cleanup migration that fixed the
    -- Nigeria/Afghanistan mixup writes three different kinds of value into
    -- it:
    --
    --     '1'            an actual school
    --     'STATE_3097'   a state -- the user picked a state, not a campus
    --     'COUNTRY_158'  a country
    --
    -- Only the first is a school. The other two are deliberately excluded
    -- rather than left to fail the join by luck: a user who chose a state
    -- has no campus, so their money is genuinely unattributable, and saying
    -- so out loud is the difference between correct and accidentally correct.
    --
    -- The text cast on both sides is what fixes the original
    -- "operator does not exist: integer = text" -- schools.id is integer.
    EXECUTE format($v$
      CREATE OR REPLACE VIEW public.school_income AS
        SELECT s.id::bigint AS school_id,
               COALESCE(s.name, 'Unattributed') AS school_name,
               ci.stream, ci.amount, ci.received_at, ci.payer
        FROM public.company_income ci
        LEFT JOIN public.profiles pr ON pr.id::text = ci.payer
        LEFT JOIN public.schools s
          -- Numeric school ids only. A STATE_ or COUNTRY_ tag is not a school.
          ON (pr.%I ~ '^[0-9]+$' AND s.id::text = pr.%I)
          -- Second chance: profiles also carries school_name, denormalised.
          -- A user whose school_id never got set but whose school_name did is
          -- still traceable, and matching on the name is better than losing
          -- the revenue to Unattributed.
          OR (COALESCE(pr.%I, '') !~ '^[0-9]+$'
              AND pr.school_name IS NOT NULL
              AND lower(btrim(s.name)) = lower(btrim(pr.school_name)))
    $v$, v_col, v_col, v_col);
    RAISE NOTICE 'school_income attributes income via profiles.%', v_col;
  END IF;
END $mig$;

REVOKE ALL ON public.school_income FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Campus revenue-share agreements.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_stakeholders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   bigint,

  -- Either a person already on the register, or a body that is not a person
  -- at all -- a student association, a hall, a faculty.
  person_id   uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  body_name   text,
  contact     text,

  kind        text NOT NULL DEFAULT 'student_association'
              CHECK (kind IN ('student_association','exco','matron','staff',
                              'ambassador','institution','other')),

  -- Percent of THAT CAMPUS's gross profit. The proposal offers 10%, doubling
  -- to 15% past 1,000 referrals.
  percent     numeric(6,3) NOT NULL CHECK (percent > 0 AND percent <= 100),

  -- "the exact duration of your current administrative tenure" -- these end.
  starts_on   date NOT NULL DEFAULT current_date,
  ends_on     date,

  active      boolean NOT NULL DEFAULT true,
  note        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT names_somebody CHECK (person_id IS NOT NULL OR body_name IS NOT NULL),
  CONSTRAINT ends_after_it_starts CHECK (ends_on IS NULL OR ends_on >= starts_on)
);

CREATE INDEX IF NOT EXISTS school_stakeholders_school_idx
  ON public.school_stakeholders (school_id, active);

ALTER TABLE public.school_stakeholders ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.school_stakeholders IS
  'Campus revenue-share agreements. percent applies to that school''s gross '
  'profit only, and lapses at ends_on -- a tenure, not a perpetuity.';

-- ---------------------------------------------------------------------------
-- 4. What each campus earned over a period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.school_earnings(p_from date, p_to date)
RETURNS TABLE (
  school_id     bigint,
  school_name   text,
  payments      bigint,
  collected     numeric,
  company_share numeric
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    si.school_id,
    si.school_name,
    COUNT(*)::bigint,
    SUM(si.amount)::numeric,
    -- Net of whatever belongs to a third party on that stream, so a campus is
    -- not credited with ticket money that went to the organiser.
    SUM(
      si.amount * CASE COALESCE(pf.basis, 'all')
        WHEN 'percentage' THEN COALESCE(pf.percent, 100) / 100.0
        ELSE 1
      END
      - CASE WHEN COALESCE(pf.basis,'all') = 'flat_per_transaction'
             THEN GREATEST(si.amount - (pf.amount_kobo / 100.0), 0)
             ELSE 0 END
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

REVOKE ALL ON FUNCTION public.school_earnings(date, date) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The live split: everyone's share of every naira, for a period.
-- ---------------------------------------------------------------------------
--
-- Deliberately reports THREE different things, because they are three
-- different claims and conflating them is how people end up believing they
-- are owed money they are not:
--
--   share_of_income   their percentage of what came in. Not theirs to draw.
--   share_of_profit   their percentage of what was actually kept. Can be
--                     negative, and shows negative rather than hiding it.
--   campus_liability  what campus partners are owed off the top -- this is
--                     NOT shareholder money and comes out before any split.
CREATE OR REPLACE FUNCTION public.stakeholder_earnings(p_from date, p_to date)
RETURNS TABLE (
  holder_id       uuid,
  full_name       text,
  role_title      text,
  shares          bigint,
  ownership_pct   numeric,
  share_of_income numeric,
  share_of_profit numeric
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH totals AS (
    SELECT
      COALESCE((SELECT SUM(amount) FROM public.company_income
                 WHERE received_at::date BETWEEN p_from AND p_to), 0) AS income,
      COALESCE((SELECT SUM(amount) FROM public.company_expenses
                 WHERE expense_date::date BETWEEN p_from AND p_to), 0) AS spend
  ),
  held AS (
    SELECT st.shareholder_id, SUM(st.shares)::bigint AS shares
    FROM public.share_transactions st
    GROUP BY st.shareholder_id
    HAVING SUM(st.shares) > 0
  ),
  all_shares AS (SELECT SUM(shares)::numeric AS total FROM held)
  SELECT
    s.id,
    s.full_name,
    s.role_title,
    h.shares,
    ROUND(h.shares / NULLIF(a.total, 0) * 100, 4),
    ROUND(t.income * h.shares / NULLIF(a.total, 0), 2),
    ROUND((t.income - t.spend) * h.shares / NULLIF(a.total, 0), 2)
  FROM held h
  JOIN public.shareholders s ON s.id = h.shareholder_id
  CROSS JOIN all_shares a
  CROSS JOIN totals t
  ORDER BY h.shares DESC;
$fn$;

REVOKE ALL ON FUNCTION public.stakeholder_earnings(date, date) FROM anon, authenticated;

COMMENT ON FUNCTION public.stakeholder_earnings(date, date) IS
  'Each shareholder''s proportional share of income and of retained profit '
  'over a period. A share of income is NOT a sum anyone may draw -- profit is '
  'distributed by resolution, not automatically.';

-- ---------------------------------------------------------------------------
-- 6. Named investors for round modelling.
-- ---------------------------------------------------------------------------
--
-- So a raise can be modelled against real people and several hypothetical
-- ones side by side, instead of one anonymous blob of money.
CREATE TABLE IF NOT EXISTS public.model_investors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- A person already on the register, or nobody at all for a pure hypothetical.
  person_id   uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  is_test     boolean NOT NULL DEFAULT true,
  amount      bigint NOT NULL DEFAULT 0,     -- kobo
  note        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.model_investors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.model_investors IS
  'Hypothetical participants in a modelled round. Nothing here affects the '
  'cap table -- it is scratch paper that survives a page reload.';


-- ---------------------------------------------------------------------------
-- 7. Rebuild the people view so the new tags reach the app.
-- ---------------------------------------------------------------------------
-- DROPPED FIRST, NOT REPLACED.
--
-- CREATE OR REPLACE VIEW can only APPEND columns. 0083 defined `people` with
-- login_email in position 11; this version inserts the tag columns before it,
-- so Postgres reads that as renaming login_email to is_cofounder and refuses:
--
--     42P16: cannot change name of view column "login_email" to "is_cofounder"
--
-- Nothing else selects from `people` -- it is read by the People tab and by
-- the SchoolsTab partner picker, both through the API -- so dropping it costs
-- nothing. CASCADE is deliberately NOT used: if something does depend on it,
-- this should fail loudly rather than silently delete that too.
DROP VIEW IF EXISTS public.people;

CREATE VIEW public.people AS
  SELECT
    s.id, s.full_name, s.email, s.phone, s.role_title,
    s.is_founder, s.is_founding_team, s.is_staff, s.employment_status, s.joined_on,
    s.is_cofounder, s.is_director AS tagged_director, s.staff_role,
    s.is_investor, s.is_external, s.notes,

    fu.email AS login_email, fu.role AS access_role,
    fu.is_director, fu.active AS login_active,

    ps.scale, ps.full_salary, ps.deferred_cap,

    COALESCE(sh.shares, 0)         AS shares,
    COALESCE(dl.balance, 0)        AS deferred_balance,
    COALESCE(rw.rewards_total, 0)  AS rewards_total,
    COALESCE(ct.contract_count, 0) AS contract_count
  FROM public.shareholders s
  LEFT JOIN public.finance_users fu ON fu.shareholder_id = s.id
  LEFT JOIN public.pay_scales ps    ON ps.shareholder_id = s.id
  LEFT JOIN (
    SELECT shareholder_id, SUM(shares) AS shares
    FROM public.share_transactions GROUP BY shareholder_id
  ) sh ON sh.shareholder_id = s.id
  LEFT JOIN (
    SELECT shareholder_id, SUM(amount) AS balance
    FROM public.deferred_salary_ledger
    WHERE kind <> 'cap_extinguished' GROUP BY shareholder_id
  ) dl ON dl.shareholder_id = s.id
  LEFT JOIN (
    SELECT person_id, SUM(COALESCE(amount, 0)) AS rewards_total
    FROM public.staff_rewards GROUP BY person_id
  ) rw ON rw.person_id = s.id
  LEFT JOIN (
    SELECT person_id, COUNT(*) AS contract_count
    FROM public.staff_contracts WHERE superseded_by IS NULL
    GROUP BY person_id
  ) ct ON ct.person_id = s.id
  ORDER BY s.is_founder DESC, s.full_name;

REVOKE ALL ON public.people FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8. Is the campus link actually working?
-- ---------------------------------------------------------------------------
--
-- Finding the column is not the same as the column matching anything. If
-- profiles.school_id holds a name rather than an id, or is mostly empty, the
-- join is valid SQL that quietly matches nothing -- and the Campuses tab
-- would show every naira as Unattributed with no explanation. Run this to see
-- which it is.
CREATE OR REPLACE FUNCTION public.school_link_check()
RETURNS TABLE (
  payments      bigint,
  matched       bigint,
  unmatched     bigint,
  pct_matched   numeric,
  payers_on_a_school   bigint,
  payers_on_a_state    bigint,
  payers_on_a_country  bigint,
  payers_with_nothing  bigint
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    (SELECT COUNT(*) FROM public.school_income)::bigint,
    (SELECT COUNT(school_id) FROM public.school_income)::bigint,
    (SELECT COUNT(*) - COUNT(school_id) FROM public.school_income)::bigint,
    (SELECT ROUND(COUNT(school_id)::numeric
                  / NULLIF(COUNT(*), 0) * 100, 1) FROM public.school_income),
    -- WHY it did or did not match. A campus tab showing everything as
    -- Unattributed is a very different problem depending on which of these
    -- is large.
    (SELECT COUNT(*) FROM public.profiles
      WHERE school_id ~ '^[0-9]+$')::bigint,
    (SELECT COUNT(*) FROM public.profiles
      WHERE school_id LIKE 'STATE_%')::bigint,
    (SELECT COUNT(*) FROM public.profiles
      WHERE school_id LIKE 'COUNTRY_%')::bigint,
    (SELECT COUNT(*) FROM public.profiles
      WHERE COALESCE(school_id, '') = '' AND school_name IS NULL)::bigint;
$fn$;

REVOKE ALL ON FUNCTION public.school_link_check() FROM anon, authenticated;

COMMENT ON FUNCTION public.school_link_check() IS
  'SELECT * FROM school_link_check(); -- if matched is 0, profiles.school_id '
  'does not hold something that matches schools.id.';

NOTIFY pgrst, 'reload schema';
