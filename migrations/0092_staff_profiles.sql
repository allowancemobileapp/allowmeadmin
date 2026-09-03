-- 0092: a staff record that holds more than a name and a salary.
--
-- WHAT WAS MISSING. A person was a row on the cap table with a job title.
-- There was nowhere to put an address, a date of birth, a next of kin, or the
-- account their salary actually goes to -- so those things lived in a phone,
-- a WhatsApp thread, or nowhere.
--
-- THE ACCESS DESIGN, WHICH IS THE WHOLE POINT
--
-- These are not one kind of data and they must not sit behind one permission.
-- Somebody granted the People screen has a reason to see a job title and an
-- emergency contact. They have no reason at all to see where four people's
-- salaries are paid.
--
--   staff_profiles      -- address, next of kin, emergency contact.
--                          Readable by anyone holding the People screen.
--
--   staff_bank_details  -- account number and bank. FOUNDER OR THE PERSON
--                          THEMSELVES, nobody else, and every read is logged.
--
-- WHY BANK DETAILS ARE FOUNDER-WRITE-ONLY. In Nigeria an account number plus
-- a name is enough to redirect a payment, and salary destinations are a
-- standard fraud target: compromise an account, change the details, wait for
-- payday. Letting a person edit their own would make one compromised login
-- enough. The founder changes them, the change is audited, and the person can
-- read their own to check them.
--
-- CERTIFICATIONS REUSE staff_contracts. It already has the private bucket,
-- the expiring signed links and the permission rule; a certificate is a
-- document about a person exactly as an offer letter is. A parallel table
-- would be a second copy of all of that to keep in step, and the second copy
-- is always the one that ends up with the weaker access check.

-- ---------------------------------------------------------------------------
-- 1. Certificates, ID documents and qualifications are documents too.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  ALTER TABLE public.staff_contracts DROP CONSTRAINT IF EXISTS staff_contracts_kind_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.staff_contracts
  ADD CONSTRAINT staff_contracts_kind_check CHECK (kind IN (
    -- The originals.
    'employment','nda','offer','amendment',
    -- What this migration adds.
    'certification',   -- a professional certificate or course completion
    'qualification',   -- a degree, diploma, transcript
    'id_document',     -- NIN slip, passport, driver's licence
    'reference',       -- a reference letter
    'medical',         -- a fitness-to-work note
    'tax',             -- a TIN or PAYE document
    'other'
  ));

COMMENT ON COLUMN public.staff_contracts.kind IS
  'What the document is. Contracts and certificates share this table because '
  'they share a bucket, a signed-link route and an access rule -- splitting '
  'them would mean maintaining that rule twice.';

-- ---------------------------------------------------------------------------
-- 2. The person, beyond their job title.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  person_id        uuid PRIMARY KEY
                     REFERENCES public.shareholders(id) ON DELETE CASCADE,

  -- Where they are.
  address_line1    text,
  address_line2    text,
  city             text,
  state            text,
  country          text DEFAULT 'Nigeria',

  -- Who they are.
  date_of_birth    date,
  gender           text,
  personal_email   text,
  alternate_phone  text,

  -- Who to call. The single most important field here and the one most
  -- likely to be empty when it is needed.
  emergency_name         text,
  emergency_relationship text,
  emergency_phone        text,

  next_of_kin_name         text,
  next_of_kin_relationship text,
  next_of_kin_phone        text,

  -- Employment context that is not pay.
  employment_type  text CHECK (employment_type IS NULL OR employment_type IN
                     ('full_time','part_time','contract','intern','advisor','volunteer')),
  work_location    text,
  reports_to       uuid REFERENCES public.shareholders(id) ON DELETE SET NULL,
  probation_ends   date,

  notes            text,

  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       text
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_profiles FROM anon, authenticated;

COMMENT ON TABLE public.staff_profiles IS
  'Contact and HR details. Visible to anyone holding the People screen. '
  'Bank details are deliberately NOT here -- see staff_bank_details.';

-- ---------------------------------------------------------------------------
-- 3. Where the salary actually goes.
-- ---------------------------------------------------------------------------
--
-- A separate table, not a few more columns above, and the separation is the
-- security control rather than tidiness: a route that reads staff_profiles
-- cannot accidentally return an account number, because the account number is
-- not in the row it read.
CREATE TABLE IF NOT EXISTS public.staff_bank_details (
  person_id       uuid PRIMARY KEY
                    REFERENCES public.shareholders(id) ON DELETE CASCADE,

  bank_name       text,
  account_number  text,
  -- The name ON THE ACCOUNT, which is not always the name in the register --
  -- and a mismatch is worth seeing before a transfer, not after.
  account_name    text,
  bank_code       text,

  -- Somebody eyeballed a statement or a transfer receipt and confirmed these
  -- details are real. Unverified details are shown as such rather than being
  -- quietly trusted on payday.
  verified_at     timestamptz,
  verified_by     text,

  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);

ALTER TABLE public.staff_bank_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_bank_details FROM anon, authenticated;

COMMENT ON TABLE public.staff_bank_details IS
  'Salary destination. FOUNDER OR THE PERSON THEMSELVES ONLY. Changing these '
  'redirects somebody pay, so writes are founder-only and audited; the People '
  'screen alone is not enough to read them.';

-- Changing a salary destination is exactly the event a fraud investigation
-- would ask about, so the old and new values are recorded without relying on
-- an API route remembering to do it.
CREATE OR REPLACE FUNCTION public.audit_bank_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  INSERT INTO public.finance_audit (actor, action, entity, entity_id, before, after)
  VALUES (
    COALESCE(NEW.updated_by, 'unknown'),
    CASE WHEN TG_OP = 'INSERT' THEN 'bank.details.add' ELSE 'bank.details.change' END,
    'staff_bank_details',
    NEW.person_id::text,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW)
  );
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS audit_bank_change ON public.staff_bank_details;
CREATE TRIGGER audit_bank_change
  AFTER INSERT OR UPDATE ON public.staff_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.audit_bank_change();

-- ---------------------------------------------------------------------------
-- 4. A masked view, for anywhere an account number should not be spelled out.
-- ---------------------------------------------------------------------------
--
-- Last four digits only. Enough to check a transfer went to the right place;
-- not enough to send money anywhere. Anything that lists people uses this, and
-- the full number is a deliberate, separate, audited request.
CREATE OR REPLACE VIEW public.staff_bank_masked AS
  SELECT
    b.person_id,
    b.bank_name,
    CASE
      WHEN b.account_number IS NULL OR length(b.account_number) < 4 THEN NULL
      ELSE repeat('*', GREATEST(length(b.account_number) - 4, 0))
           || right(b.account_number, 4)
    END AS account_number_masked,
    b.account_name,
    (b.account_number IS NOT NULL) AS has_details,
    b.verified_at,
    b.verified_by,
    b.updated_at
  FROM public.staff_bank_details b;

REVOKE ALL ON public.staff_bank_masked FROM anon, authenticated;

COMMENT ON VIEW public.staff_bank_masked IS
  'Bank details with the account number reduced to its last four digits. '
  'Enough to recognise an account, not enough to pay into one.';

-- ---------------------------------------------------------------------------
-- 5. Keep updated_at honest.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS touch_staff_profiles ON public.staff_profiles;
CREATE TRIGGER touch_staff_profiles
  BEFORE UPDATE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS touch_staff_bank ON public.staff_bank_details;
CREATE TRIGGER touch_staff_bank
  BEFORE UPDATE ON public.staff_bank_details
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';
