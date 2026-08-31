-- 0083: staff and stakeholders as one list of people.
--
-- Until now a person was scattered across three tables: `shareholders` if
-- they owned shares, `finance_users` if they could log in, `pay_scales` if
-- they were one of the four contracted officers. Nobody could see a person
-- whole, and there was nowhere at all to put an employment contract.
--
-- `shareholders` becomes the canonical PERSON record. A staff member who owns
-- no shares is a row with no share transactions -- cap_table already filters
-- on HAVING SUM(shares) > 0, so they simply do not appear there, which is
-- correct.
--
-- WHY CONTRACTS ARE NOT IN A PUBLIC BUCKET
--
-- An employment contract contains somebody's salary. The existing
-- `library-materials` bucket is public: anyone holding the URL reads the
-- file, and the URL is guessable from a timestamp. Contracts go in a PRIVATE
-- bucket and are only ever handed out as short-lived signed URLs, to the
-- person themselves or to the founder.

-- ---------------------------------------------------------------------------
-- 1. A person is a shareholder row, whether or not they hold shares.
-- ---------------------------------------------------------------------------
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS is_staff boolean NOT NULL DEFAULT false;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.shareholders
  ADD COLUMN IF NOT EXISTS employment_status text NOT NULL DEFAULT 'active'
    CHECK (employment_status IN ('active','on_leave','left','prospective'));

-- Everyone seeded so far is both.
UPDATE public.shareholders SET is_staff = true WHERE role_title IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Contracts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_contracts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id    uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,

  title        text NOT NULL,
  -- The object PATH inside the private bucket, never a public URL. A URL is
  -- minted on demand, expires, and is only given to people entitled to it.
  storage_path text NOT NULL,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,

  kind         text NOT NULL DEFAULT 'employment'
               CHECK (kind IN ('employment','nda','offer','amendment','other')),
  signed_on    date,

  uploaded_by  text,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  -- Superseded rather than deleted: an amended contract does not erase what
  -- the person was previously on, and a dispute needs both.
  superseded_by uuid REFERENCES public.staff_contracts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS staff_contracts_person_idx
  ON public.staff_contracts (person_id, uploaded_at DESC);

-- ---------------------------------------------------------------------------
-- 3. Rewards -- money or shares, outside the salary bands.
-- ---------------------------------------------------------------------------
--
-- Deliberately separate from payroll_runs. A bonus is discretionary and has
-- nothing to do with the contractual band formula; mixing them would let a
-- one-off payment look like a salary obligation.
CREATE TABLE IF NOT EXISTS public.staff_rewards (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,

  kind        text NOT NULL CHECK (kind IN
                ('bonus','commission','gift','expense_reimbursement','share_award')),

  -- Kobo. Null on a pure share award.
  amount      bigint,
  -- Shares. Null on a cash reward. A share award still has to go through
  -- share_transactions to reach the cap table -- this row is the DECISION,
  -- that one is the movement.
  shares      bigint,
  share_class_id integer REFERENCES public.share_classes(id),

  reason      text NOT NULL,
  awarded_on  date NOT NULL DEFAULT current_date,
  paid_on     date,

  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reward_has_a_value CHECK (
    (amount IS NOT NULL AND amount > 0) OR (shares IS NOT NULL AND shares > 0)
  )
);

CREATE INDEX IF NOT EXISTS staff_rewards_person_idx
  ON public.staff_rewards (person_id, awarded_on DESC);

-- ---------------------------------------------------------------------------
-- 4. Salary for anyone, not just the four officers.
-- ---------------------------------------------------------------------------
--
-- pay_scales is keyed by shareholder_id and its `scale` CHECK only allowed
-- 'officer' and 'founder' -- the two contractual band scales. A designer on a
-- flat N150,000 fits neither, so 'flat' joins them: paid in full every month,
-- no bands, no deferral.
DO $$
DECLARE v_name text;
BEGIN
  SELECT con.conname INTO v_name
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'pay_scales' AND con.contype = 'c'
    AND pg_get_constraintdef(con.oid) ILIKE '%scale%'
  LIMIT 1;
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.pay_scales DROP CONSTRAINT %I', v_name);
  END IF;
END $$;

ALTER TABLE public.pay_scales
  ADD CONSTRAINT pay_scales_scale_check
  CHECK (scale IN ('officer', 'founder', 'flat'));

-- A flat scale has no deferral, so these are zero rather than null.
ALTER TABLE public.pay_scales ALTER COLUMN deferred_cap SET DEFAULT 0;
ALTER TABLE public.pay_scales ALTER COLUMN min_instalment SET DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 5. One row per person, everything about them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.people AS
  SELECT
    s.id,
    s.full_name,
    s.email,
    s.phone,
    s.role_title,
    s.is_founder,
    s.is_founding_team,
    s.is_staff,
    s.employment_status,
    s.joined_on,

    fu.email      AS login_email,
    fu.role       AS access_role,
    fu.is_director,
    fu.active     AS login_active,

    ps.scale,
    ps.full_salary,
    ps.deferred_cap,

    COALESCE(sh.shares, 0)                    AS shares,
    COALESCE(dl.balance, 0)                   AS deferred_balance,
    COALESCE(rw.rewards_total, 0)             AS rewards_total,
    COALESCE(ct.contract_count, 0)            AS contract_count
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

COMMENT ON VIEW public.people IS
  'Staff and stakeholders as one list. A person with 0 shares is staff only; '
  'a person with no login_email has no access to the admin app.';

-- ---------------------------------------------------------------------------
-- 6. Locked down, like everything else in this module.
-- ---------------------------------------------------------------------------
ALTER TABLE public.staff_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_rewards   ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.people FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The private bucket for contracts.
-- ---------------------------------------------------------------------------
--
-- public = false. A contract states somebody's salary, and the public
-- `library-materials` bucket hands the file to anyone holding a guessable
-- URL. Access here is only ever a signed URL that expires.
INSERT INTO storage.buckets (id, name, public)
VALUES ('staff-contracts', 'staff-contracts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- No storage policies at all: the admin server reads and writes with the
-- service role, which bypasses them. Nothing else should ever touch this
-- bucket, and a policy is how that would accidentally become possible.

NOTIFY pgrst, 'reload schema';
