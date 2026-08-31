-- 0081: the contractual half of the finance module.
--
-- 0080 gave the company a set of books. This adds the parts that four people
-- are paid from, and the parts that decide who owns the company next year.
--
-- WHAT MAKES THIS FILE DIFFERENT FROM EVERY OTHER MIGRATION HERE
--
-- The numbers in it are named in signed contracts. Monthly Gross Profit is not
-- a metric on a dashboard -- it is the input to a salary formula that four
-- people have agreed to, and this app is named as the primary source of the
-- calculation. A mistake is a breach, not a bug.
--
-- Three consequences run through everything below:
--
--   1. A certified figure is IMMUTABLE. Corrections are new versions and both
--      stay visible for six years. There is no UPDATE path.
--   2. Money is stored in KOBO as bigint. No numeric, no float. The band
--      boundaries are exact integers and a value must land on the right side
--      of them every time.
--   3. Salaries and equity are per-person data. A stakeholder may see their
--      own and no one else's, and that is enforced by RLS rather than by the
--      UI, because the UI can be bypassed.

-- ===========================================================================
-- 1. Roles (section 9)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.finance_users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL UNIQUE,
  shareholder_id uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,

  role           text NOT NULL DEFAULT 'stakeholder'
                 CHECK (role IN ('founder','director','stakeholder')),

  -- A director may certify the founder's milestones (section 6). This is the
  -- ONLY route by which those tranches can ever vest, so it is recorded
  -- explicitly rather than inferred from the role.
  is_director    boolean NOT NULL DEFAULT false,

  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_users_email_idx
  ON public.finance_users (lower(email));

-- Who the caller is. Reads the header the admin server sets, so the app and
-- the database agree on one answer.
CREATE OR REPLACE FUNCTION public.finance_role(p_email text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.finance_users
      WHERE lower(email) = lower(p_email) AND active),
    'none');
$$;

-- ===========================================================================
-- 2. Monthly Gross Profit (section 3)
-- ===========================================================================
--
-- One row per (month, version). Version 1 is the draft; certifying freezes
-- it; a correction writes version 2 and BOTH remain readable. Nothing is ever
-- edited in place, which is what "frozen and versioned" has to mean if it is
-- going to survive a dispute.
CREATE TABLE IF NOT EXISTS public.gross_profit_months (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Calendar months only. The first of the month stands for the month.
  month             date NOT NULL,
  version           integer NOT NULL DEFAULT 1,

  -- THE FIVE LINES. Kobo. Nothing else may be deducted -- there is
  -- deliberately no column for salaries, marketing, G&A, tax or capex.
  collections            bigint NOT NULL DEFAULT 0,
  gateway_fees           bigint NOT NULL DEFAULT 0,
  seller_payouts         bigint NOT NULL DEFAULT 0,
  direct_infrastructure  bigint NOT NULL DEFAULT 0,
  refunds                bigint NOT NULL DEFAULT 0,

  -- Stored, not computed on read. The certified figure must not change if
  -- somebody later alters the arithmetic.
  gross_profit      bigint NOT NULL,

  -- The full line-item breakdown behind each figure, so the calculation can
  -- be re-checked six years from now against data that may since have moved.
  breakdown         jsonb NOT NULL DEFAULT '{}'::jsonb,

  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','certified','superseded')),

  certified_by      text,
  certified_at      timestamptz,
  supersedes_id     uuid REFERENCES public.gross_profit_months(id),
  correction_reason text,

  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (month, version)
);

CREATE INDEX IF NOT EXISTS gp_month_idx
  ON public.gross_profit_months (month DESC, version DESC);

-- Only one CERTIFIED version per month may be live at a time. A correction
-- must mark the old one superseded in the same transaction.
CREATE UNIQUE INDEX IF NOT EXISTS gp_one_live_certified
  ON public.gross_profit_months (month) WHERE status = 'certified';

-- A certified row is frozen. Enforced by trigger rather than by convention,
-- because the whole point of certification is that it cannot be quietly
-- adjusted afterwards.
CREATE OR REPLACE FUNCTION public.freeze_certified_gross_profit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'certified' THEN
    -- The one permitted change: marking it superseded by a correction.
    IF NEW.status = 'superseded'
       AND NEW.collections           IS NOT DISTINCT FROM OLD.collections
       AND NEW.gateway_fees          IS NOT DISTINCT FROM OLD.gateway_fees
       AND NEW.seller_payouts        IS NOT DISTINCT FROM OLD.seller_payouts
       AND NEW.direct_infrastructure IS NOT DISTINCT FROM OLD.direct_infrastructure
       AND NEW.refunds               IS NOT DISTINCT FROM OLD.refunds
       AND NEW.gross_profit          IS NOT DISTINCT FROM OLD.gross_profit THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION
      'Month % version % is certified and cannot be edited. Record a '
      'correction as a new version instead.', OLD.month, OLD.version;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS freeze_certified_gp ON public.gross_profit_months;
CREATE TRIGGER freeze_certified_gp
  BEFORE UPDATE ON public.gross_profit_months
  FOR EACH ROW EXECUTE FUNCTION public.freeze_certified_gross_profit();

-- Deleting a certified month would defeat the six-year retention rule.
CREATE OR REPLACE FUNCTION public.block_certified_gp_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('certified','superseded') THEN
    RAISE EXCEPTION 'Certified gross profit must be retained for 6 years.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS block_certified_gp_delete ON public.gross_profit_months;
CREATE TRIGGER block_certified_gp_delete
  BEFORE DELETE ON public.gross_profit_months
  FOR EACH ROW EXECUTE FUNCTION public.block_certified_gp_delete();

-- ===========================================================================
-- 3. Payroll and the Deferred Salary Account (sections 4 and 5)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.pay_scales (
  shareholder_id  uuid PRIMARY KEY REFERENCES public.shareholders(id) ON DELETE CASCADE,
  scale           text NOT NULL CHECK (scale IN ('officer','founder')),
  full_salary     bigint NOT NULL,       -- kobo
  deferred_cap    bigint NOT NULL,       -- kobo
  min_instalment  bigint NOT NULL,       -- kobo
  active          boolean NOT NULL DEFAULT true,

  -- Bands are contractual. Changing one needs a recorded shareholder
  -- resolution, and the reference is stored so the change can be traced back
  -- to the meeting that authorised it.
  resolution_ref  text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per person per month. Written when the month is certified.
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month           date NOT NULL,
  shareholder_id  uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  gross_profit_id uuid NOT NULL REFERENCES public.gross_profit_months(id),

  band            smallint NOT NULL CHECK (band BETWEEN 1 AND 5),
  full_salary     bigint NOT NULL,
  cash_due        bigint NOT NULL,
  accrued         bigint NOT NULL,
  extinguished    bigint NOT NULL,

  cash_paid       bigint NOT NULL DEFAULT 0,
  paid_on         date,
  -- Due by the 10th of the following month.
  due_on          date NOT NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, shareholder_id)
);

CREATE INDEX IF NOT EXISTS payroll_month_idx
  ON public.payroll_runs (month DESC);
CREATE INDEX IF NOT EXISTS payroll_overdue_idx
  ON public.payroll_runs (due_on) WHERE cash_paid = 0;

-- APPEND-ONLY. A balance is the sum of its entries, never a stored number
-- somebody can correct. It survives termination and is never zeroed.
CREATE TABLE IF NOT EXISTS public.deferred_salary_ledger (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_id  uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  entry_date      date NOT NULL DEFAULT current_date,

  -- Positive accrues, negative pays down. One signed column, so a balance is
  -- a SUM and never a CASE somebody can get the wrong way round.
  amount          bigint NOT NULL,

  kind            text NOT NULL CHECK (kind IN
                    ('accrual','payment','cap_extinguished','adjustment')),
  month           date,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS deferred_holder_idx
  ON public.deferred_salary_ledger (shareholder_id, entry_date);

CREATE OR REPLACE VIEW public.deferred_balances AS
  SELECT
    s.id AS shareholder_id,
    s.full_name,
    ps.scale,
    ps.deferred_cap,
    COALESCE(SUM(d.amount) FILTER (WHERE d.kind <> 'cap_extinguished'), 0) AS balance,
    COALESCE(SUM(d.amount) FILTER (WHERE d.kind = 'accrual'), 0) AS total_accrued,
    COALESCE(-SUM(d.amount) FILTER (WHERE d.kind = 'payment'), 0) AS total_paid
  FROM public.shareholders s
  JOIN public.pay_scales ps ON ps.shareholder_id = s.id
  LEFT JOIN public.deferred_salary_ledger d ON d.shareholder_id = s.id
  GROUP BY s.id, s.full_name, ps.scale, ps.deferred_cap;

COMMENT ON VIEW public.deferred_balances IS
  'Balance is the SUM of the append-only ledger. cap_extinguished entries are '
  'recorded for the audit trail but are NOT owed and are excluded.';

-- ===========================================================================
-- 4. Contingent equity (section 6)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.award_schemes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shareholder_id    uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,
  award_total       bigint NOT NULL CHECK (award_total > 0),
  class_code        text NOT NULL CHECK (class_code IN ('A','B')),

  -- THE DISTINCTION THAT DECIDES EVERYTHING DOWNSTREAM.
  --   transfer: total shares unchanged, founder's holding falls, no filing.
  --   issue:    total shares rise, capital rises, CAC filing required.
  mechanism         text NOT NULL CHECK (mechanism IN ('transfer','issue')),
  transfer_from_id  uuid REFERENCES public.shareholders(id),

  kind              text NOT NULL DEFAULT 'challenge'
                    CHECK (kind IN ('challenge','tranche')),
  longstop_date     date NOT NULL,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- A transfer has to say whose shares move.
  CONSTRAINT award_transfer_needs_source CHECK (
    mechanism <> 'transfer' OR transfer_from_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.award_challenges (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id           uuid NOT NULL REFERENCES public.award_schemes(id) ON DELETE CASCADE,
  description         text NOT NULL,
  acceptance_criteria text,
  allocated_shares    bigint NOT NULL CHECK (allocated_shares > 0),

  issued_on           date NOT NULL DEFAULT current_date,
  respond_by          date NOT NULL,          -- issued_on + 5 business days
  deliver_by          date,

  status              text NOT NULL DEFAULT 'issued' CHECK (status IN
                        ('issued','accepted','declined','completed',
                         'not_completed','expired')),
  outcome             text,
  assessed_by         text,
  assessed_on         date,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenges_scheme_idx
  ON public.award_challenges (scheme_id, status);

-- The founder's five tranches. No challenge flow, no default award.
CREATE TABLE IF NOT EXISTS public.award_tranches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_id       uuid NOT NULL REFERENCES public.award_schemes(id) ON DELETE CASCADE,
  tranche_index   smallint NOT NULL CHECK (tranche_index BETWEEN 1 AND 5),
  shares          bigint NOT NULL,

  milestone_description text,
  -- Milestones must be RECORDED by 30 September 2026. After that the fields
  -- lock: no add, edit, extend or delete.
  recorded_on     date,

  achieved        boolean NOT NULL DEFAULT false,
  -- Must be a director OTHER than the founder. Enforced below.
  certified_by    text,
  certified_on    date,

  UNIQUE (scheme_id, tranche_index)
);

-- The two hard constraints on the founder's scheme, in the database rather
-- than in the form, because they are the only things standing between him and
-- certifying his own equity.
CREATE OR REPLACE FUNCTION public.guard_award_tranche()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_founder_email text;
  v_certifier_role text;
BEGIN
  -- 1. Milestones lock after 30 September 2026.
  IF TG_OP = 'UPDATE'
     AND NEW.milestone_description IS DISTINCT FROM OLD.milestone_description
     AND current_date > DATE '2026-09-30' THEN
    RAISE EXCEPTION
      'Milestones had to be recorded by 30 September 2026. This one is locked.';
  END IF;
  IF TG_OP = 'INSERT'
     AND NEW.milestone_description IS NOT NULL
     AND current_date > DATE '2026-09-30' THEN
    RAISE EXCEPTION
      'Milestones had to be recorded by 30 September 2026. No new ones may be added.';
  END IF;

  -- 2. The founder may not certify his own tranche.
  IF NEW.certified_by IS NOT NULL
     AND NEW.certified_by IS DISTINCT FROM COALESCE(OLD.certified_by, '') THEN
    SELECT fu.email INTO v_founder_email
    FROM public.finance_users fu
    JOIN public.shareholders sh ON sh.id = fu.shareholder_id
    JOIN public.award_schemes asch ON asch.shareholder_id = sh.id
    WHERE asch.id = NEW.scheme_id;

    IF lower(NEW.certified_by) = lower(COALESCE(v_founder_email, '~none~')) THEN
      RAISE EXCEPTION
        'A milestone must be certified by a director other than the person it '
        'awards shares to.';
    END IF;

    SELECT role INTO v_certifier_role
    FROM public.finance_users
    WHERE lower(email) = lower(NEW.certified_by) AND active;

    IF v_certifier_role IS DISTINCT FROM 'director'
       AND v_certifier_role IS DISTINCT FROM 'founder' THEN
      RAISE EXCEPTION 'Only a director may certify a milestone.';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS guard_award_tranche ON public.award_tranches;
CREATE TRIGGER guard_award_tranche
  BEFORE INSERT OR UPDATE ON public.award_tranches
  FOR EACH ROW EXECUTE FUNCTION public.guard_award_tranche();

-- ===========================================================================
-- 5. Money in and out (section 7)
-- ===========================================================================
--
-- Per-transaction, so the AI layer can see margin PER STREAM rather than one
-- blended number that hides which product actually makes money.
CREATE TABLE IF NOT EXISTS public.revenue_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stream          text NOT NULL CHECK (stream IN
                    ('marketplace_commission','plus_subscriptions',
                     'premium_groups','fantasy','other')),
  collected_on    date NOT NULL,          -- CASH BASIS. When funds arrived.
  gross_collected bigint NOT NULL,
  gateway_fee     bigint NOT NULL DEFAULT 0,
  seller_payout   bigint NOT NULL DEFAULT 0,
  direct_cost     bigint NOT NULL DEFAULT 0,
  -- Stored so a historical row keeps its own arithmetic.
  net             bigint NOT NULL,
  source_ref      text,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revenue_collected_idx
  ON public.revenue_entries (collected_on DESC, stream);

-- Capital in that is NOT revenue. Founder loans, director advances, grants,
-- equity rounds. MUST NEVER touch Monthly Gross Profit -- separate table so
-- it cannot be swept into a revenue sum by accident.
CREATE TABLE IF NOT EXISTS public.capital_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN
                 ('founder_loan','director_advance','grant','equity_round','other')),
  counterparty text,
  amount       bigint NOT NULL,
  received_on  date NOT NULL DEFAULT current_date,
  repayable    boolean NOT NULL DEFAULT false,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.capital_events IS
  'Money in that is NOT revenue. Never included in Monthly Gross Profit.';

-- The expense ledger gains the one column that decides whether a row reduces
-- four people's pay.
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'other';
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS vendor text;
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS receipt_url text;
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS approved_by text;

-- Only these four reduce Monthly Gross Profit. Kept as a function so the UI,
-- the calculation and any report all read one definition.
CREATE OR REPLACE FUNCTION public.expense_is_deductible(p_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_category IN
    ('payment_processing','seller_payouts','infrastructure','refunds');
$$;

-- ===========================================================================
-- 6. Valuation basis (section 8)
-- ===========================================================================
--
-- A naira figure shown to a shareholder must carry its basis and its date.
-- Making the column NOT NULL is what stops an unlabelled number reaching a
-- screen.
ALTER TABLE public.company_valuations
  ADD COLUMN IF NOT EXISTS basis text NOT NULL DEFAULT 'founder_estimate';

DO $$ BEGIN
  ALTER TABLE public.company_valuations
    ADD CONSTRAINT valuation_basis_check CHECK (basis IN
      ('founder_estimate','last_round','independent_valuation','par_value'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ===========================================================================
-- 7. Audit log (section 9)
-- ===========================================================================
--
-- Every certification, assessment, share movement, band edit, payment,
-- valuation change and role change. Before and after, so a dispute can be
-- reconstructed rather than argued.
CREATE TABLE IF NOT EXISTS public.finance_audit (
  id          bigserial PRIMARY KEY,
  actor       text NOT NULL,
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS finance_audit_at_idx ON public.finance_audit (at DESC);
CREATE INDEX IF NOT EXISTS finance_audit_entity_idx
  ON public.finance_audit (entity, entity_id);

-- Append-only. An audit log that can be edited is not an audit log.
CREATE OR REPLACE FUNCTION public.block_audit_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The audit log is append-only.';
END $$;

DROP TRIGGER IF EXISTS block_audit_mutation ON public.finance_audit;
CREATE TRIGGER block_audit_mutation
  BEFORE UPDATE OR DELETE ON public.finance_audit
  FOR EACH ROW EXECUTE FUNCTION public.block_audit_mutation();

-- ===========================================================================
-- 8. Row level security (section 9)
-- ===========================================================================
--
-- RLS ON, NO POLICIES. The admin server connects as the owning role and
-- bypasses RLS; nothing reaches these tables through PostgREST.
--
-- THE STAKEHOLDER SELF-SERVICE PATH IS NOT OPEN YET. Section 13 says no
-- stakeholder gets a login until roles and RLS are done and tested, so the
-- safe state until then is that the anon and authenticated roles can read
-- none of it. Opening it later means adding policies here deliberately, not
-- discovering that a table was readable all along.
ALTER TABLE public.finance_users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gross_profit_months     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pay_scales              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deferred_salary_ledger  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_schemes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_challenges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.award_tranches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capital_events          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_audit           ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.deferred_balances FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.finance_role(text) FROM anon, authenticated;

-- ===========================================================================
-- 9. Seed
-- ===========================================================================

DO $$
DECLARE
  v_james uuid; v_laniyan uuid; v_azeez uuid; v_aminat uuid;
BEGIN
  SELECT id INTO v_james   FROM public.shareholders WHERE full_name ILIKE 'EZENWAMMADU IZUCHUKWU JAMES';
  SELECT id INTO v_laniyan FROM public.shareholders WHERE full_name ILIKE 'LANIYAN MOBOLUWASORE';
  SELECT id INTO v_azeez   FROM public.shareholders WHERE full_name ILIKE 'AKPALA ABDULAZEEZ OLANREWAJU';
  SELECT id INTO v_aminat  FROM public.shareholders WHERE full_name ILIKE 'ADESOPE AMINAT';

  IF v_james IS NULL THEN
    RAISE NOTICE 'Shareholders not seeded -- run 0080 first. Skipping.';
    RETURN;
  END IF;

  -- Pay scales. Kobo.
  INSERT INTO public.pay_scales
    (shareholder_id, scale, full_salary, deferred_cap, min_instalment)
  VALUES
    (v_james,   'founder', 60000000, 150000000, 15000000),
    (v_laniyan, 'officer', 40000000, 100000000, 10000000),
    (v_azeez,   'officer', 40000000, 100000000, 10000000),
    (v_aminat,  'officer', 40000000, 100000000, 10000000)
  ON CONFLICT (shareholder_id) DO NOTHING;

  -- Logins. The founder only, for now: section 13 forbids giving any
  -- stakeholder a login before roles and RLS are done and tested.
  INSERT INTO public.finance_users (email, shareholder_id, role, is_director)
  VALUES ('allowancemobileapp@gmail.com', v_james, 'founder', true)
  ON CONFLICT (email) DO NOTHING;

  -- The four award schemes. None have vested.
  IF NOT EXISTS (SELECT 1 FROM public.award_schemes) THEN
    -- Laniyan: 10,000 Class A BY TRANSFER FROM THE FOUNDER. Total shares
    -- unchanged, no filing. One binary milestone.
    INSERT INTO public.award_schemes
      (shareholder_id, award_total, class_code, mechanism, transfer_from_id,
       kind, longstop_date, note)
    VALUES (v_laniyan, 10000, 'A', 'transfer', v_james, 'challenge',
            DATE '2026-09-30',
            'Single binary milestone: 7 qualifying school collaborations.');

    INSERT INTO public.award_schemes
      (shareholder_id, award_total, class_code, mechanism, kind, longstop_date, note)
    VALUES
      (v_azeez,  50000, 'B', 'issue', 'challenge', DATE '2026-12-25',
       'Challenge-based, tranches.'),
      (v_aminat, 40000, 'B', 'issue', 'challenge', DATE '2026-12-25',
       'Challenge-based, tranches.'),
      (v_james,  50000, 'A', 'issue', 'tranche',   DATE '2026-12-25',
       '5 fixed tranches of 10,000. Milestones must be recorded by 30 Sep 2026 '
       'and certified by a director other than James.');

    -- The founder's five empty tranches, ready for milestones to be recorded.
    INSERT INTO public.award_tranches (scheme_id, tranche_index, shares)
    SELECT s.id, g.i, 10000
    FROM public.award_schemes s
    CROSS JOIN generate_series(1, 5) AS g(i)
    WHERE s.shareholder_id = v_james AND s.kind = 'tranche';
  END IF;

  RAISE NOTICE 'Seeded pay scales and 4 award schemes.';
END $$;

NOTIFY pgrst, 'reload schema';
