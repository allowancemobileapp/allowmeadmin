-- 0090: payroll payments, their receipts, and the bookkeeping they were
--       never writing.
--
-- WHAT WAS WRONG
--
-- `POST /payroll/:id/pay` set payroll_runs.cash_paid and payroll_runs.paid_on
-- and stopped there. Three consequences, all of them quiet:
--
--   1. NO EVIDENCE. A salary was "paid" because a button had been pressed.
--      There was no date typed by a person, no reference, no receipt, and no
--      way to answer "prove it" six months later.
--
--   2. ONE PAYMENT ONLY. cash_paid is a single scalar, so paying half in
--      August and half in September could only be recorded by overwriting the
--      first figure with the second. The part-payment vanished.
--
--   3. THE MONEY NEVER LEFT THE BOOKS. Nothing was written to
--      company_expenses. Salaries are the largest thing this company spends
--      money on, and the expense ledger did not know they existed -- so the
--      app's cash position was overstated by the entire payroll, every month.
--      That is the whole reason the number on screen and the number in the
--      bank could not agree.
--
-- THE SHAPE OF THE FIX
--
-- payroll_payments is APPEND-ONLY, in the same spirit as
-- deferred_salary_ledger: what was actually paid is a list of transfers, and
-- payroll_runs.cash_paid becomes a SUM of that list rather than a number
-- somebody types. Each payment carries its receipt and writes exactly one row
-- into company_expenses, linked both ways so it can never be counted twice.
--
-- ON GROSS PROFIT. Salary is deliberately NOT a deductible category.
-- expense_is_deductible() covers payment_processing, seller_payouts,
-- infrastructure and refunds and nothing else. If salaries reduced Monthly
-- Gross Profit the calculation would eat itself: gross profit sets the band,
-- the band sets the salary, and the salary would then move the gross profit
-- that set it. Salaries are paid OUT OF gross profit, not before it.

-- ---------------------------------------------------------------------------
-- 1. What was actually paid.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payroll_payments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_run_id  uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  shareholder_id  uuid NOT NULL REFERENCES public.shareholders(id) ON DELETE CASCADE,

  -- KOBO, matching payroll_runs and every other figure in the 0081 family.
  -- company_expenses.amount is NAIRA, and the conversion happens in exactly
  -- one place: record_payroll_payment(). Four separate money-unit bugs have
  -- been fixed in this schema already; this is the boundary they came from.
  amount          bigint NOT NULL CHECK (amount > 0),

  paid_on         date NOT NULL DEFAULT current_date,
  method          text NOT NULL DEFAULT 'bank_transfer' CHECK (method IN
                    ('bank_transfer','cash','cheque','ussd','other')),
  reference       text,

  -- The receipt. Path inside a PRIVATE bucket, never a URL: a payslip names a
  -- person and their salary, so it is handed out only as a signed link that
  -- expires, exactly like staff contracts in 0083.
  storage_path    text,
  file_name       text,
  mime_type       text,
  size_bytes      bigint,

  -- The company_expenses row this created. The link is what makes the two
  -- ledgers reconcilable, and the UNIQUE below is what stops one payment
  -- being expensed twice.
  expense_id      integer REFERENCES public.company_expenses(id) ON DELETE SET NULL,

  -- A correction. Append-only means a mistake is reversed, not erased: the
  -- row stays, stops counting, and says who voided it and why.
  voided_at       timestamptz,
  voided_by       text,
  void_reason     text,

  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS payroll_payments_run_idx
  ON public.payroll_payments (payroll_run_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS payroll_payments_holder_idx
  ON public.payroll_payments (shareholder_id, paid_on DESC);
CREATE UNIQUE INDEX IF NOT EXISTS payroll_payments_expense_idx
  ON public.payroll_payments (expense_id) WHERE expense_id IS NOT NULL;

ALTER TABLE public.payroll_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_payments FROM anon, authenticated;

COMMENT ON TABLE public.payroll_payments IS
  'Append-only record of salary actually transferred. payroll_runs.cash_paid '
  'is the SUM of the un-voided rows here, never typed. Each row writes one '
  'company_expenses row so the cash position is real.';

-- ---------------------------------------------------------------------------
-- 2. The private bucket for receipts.
-- ---------------------------------------------------------------------------
--
-- public = false, for the same reason as staff-contracts: a payment receipt
-- states what one named person was paid. Nothing but the admin server, using
-- the service role, ever touches it, and no storage policy exists here --
-- a policy is how "nothing else" would quietly become "something else".
INSERT INTO storage.buckets (id, name, public)
VALUES ('payroll-receipts', 'payroll-receipts', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- ---------------------------------------------------------------------------
-- 3. What a run has actually been paid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.payroll_paid(p_run_id uuid)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(SUM(pp.amount), 0)::bigint
  FROM public.payroll_payments pp
  WHERE pp.payroll_run_id = p_run_id
    AND pp.voided_at IS NULL;
$fn$;

REVOKE ALL ON FUNCTION public.payroll_paid(uuid) FROM anon, authenticated;

-- Bring payroll_runs back in step with the payment list. Called after every
-- write, so cash_paid can never drift from the rows that justify it.
CREATE OR REPLACE FUNCTION public.resync_payroll_run(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_paid bigint;
  v_due  bigint;
  v_last date;
BEGIN
  v_paid := public.payroll_paid(p_run_id);

  SELECT cash_due INTO v_due FROM public.payroll_runs WHERE id = p_run_id;

  SELECT MAX(paid_on) INTO v_last
  FROM public.payroll_payments
  WHERE payroll_run_id = p_run_id AND voided_at IS NULL;

  UPDATE public.payroll_runs
  SET cash_paid = v_paid,
      -- paid_on means SETTLED IN FULL, and the UI reads it as "Paid". A part
      -- payment must not flip that flag, or a line showing half the money
      -- would read as closed.
      paid_on = CASE WHEN v_paid >= v_due AND v_due > 0 THEN v_last ELSE NULL END
  WHERE id = p_run_id;
END $fn$;

REVOKE ALL ON FUNCTION public.resync_payroll_run(uuid) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Recording a payment.
-- ---------------------------------------------------------------------------
--
-- One function, one transaction: the payment, the expense, and the resync
-- either all happen or none do. Splitting them across API calls is how a
-- payment ends up recorded with no matching expense, which is the exact
-- failure this migration exists to fix.
--
-- THE FOUNDER-LAST RULE IS NOT ENFORCED HERE. It lives in
-- founderPaymentBlocked() in src/lib/finance/payroll.ts, is unit-tested, and
-- is applied by the route before this is called. Duplicating it in SQL would
-- mean two definitions of a contractual term that must only have one.
CREATE OR REPLACE FUNCTION public.record_payroll_payment(
  p_run_id     uuid,
  p_amount     bigint,                    -- KOBO
  p_paid_on    date    DEFAULT current_date,
  p_method     text    DEFAULT 'bank_transfer',
  p_reference  text    DEFAULT NULL,
  p_note       text    DEFAULT NULL,
  p_actor      text    DEFAULT NULL
)
RETURNS public.payroll_payments
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_run      public.payroll_runs;
  v_name     text;
  v_paid     bigint;
  v_expense  integer;
  v_row      public.payroll_payments;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'A payment has to be a positive amount.';
  END IF;

  SELECT * INTO v_run FROM public.payroll_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'No such payroll line.';
  END IF;

  SELECT full_name INTO v_name
  FROM public.shareholders WHERE id = v_run.shareholder_id;

  v_paid := public.payroll_paid(p_run_id);

  -- Overpayment is refused rather than absorbed. Money above the month's cash
  -- entitlement is not salary for that month -- it is almost always either a
  -- typo or a payment against the deferred balance, and the deferred ledger
  -- is a different book with its own rules. Silently filing it here would
  -- overstate what the month cost and understate what is still owed.
  IF v_paid + p_amount > v_run.cash_due THEN
    RAISE EXCEPTION
      'That is more than the month owes. % is due for %, % has already been '
      'paid, and this would take it to %. If this is money against the '
      'deferred salary balance, record it there instead -- it is a different '
      'debt with different rules.',
      to_char(v_run.cash_due / 100.0, 'FM"N"999,999,990.00'),
      to_char(v_run.month, 'Mon YYYY'),
      to_char(v_paid / 100.0, 'FM"N"999,999,990.00'),
      to_char((v_paid + p_amount) / 100.0, 'FM"N"999,999,990.00');
  END IF;

  -- The bookkeeping. KOBO -> NAIRA happens here and nowhere else.
  -- category 'payroll' matches what 0085 backfills from a reason mentioning
  -- salary, and is deliberately outside expense_is_deductible().
  INSERT INTO public.company_expenses
    (title, reason, amount, expense_date, category, vendor, approved_by)
  VALUES (
    format('Salary — %s — %s', COALESCE(v_name, 'staff'),
           to_char(v_run.month, 'Mon YYYY')),
    'Payroll',
    ROUND(p_amount / 100.0, 2),
    p_paid_on,
    'payroll',
    COALESCE(v_name, 'staff'),
    p_actor
  )
  RETURNING id INTO v_expense;

  INSERT INTO public.payroll_payments
    (payroll_run_id, shareholder_id, amount, paid_on, method, reference,
     expense_id, note, created_by)
  VALUES (p_run_id, v_run.shareholder_id, p_amount, p_paid_on,
          COALESCE(p_method, 'bank_transfer'), p_reference, v_expense,
          p_note, p_actor)
  RETURNING * INTO v_row;

  PERFORM public.resync_payroll_run(p_run_id);

  RETURN v_row;
END $fn$;

REVOKE ALL ON FUNCTION public.record_payroll_payment
  (uuid, bigint, date, text, text, text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Undoing one.
-- ---------------------------------------------------------------------------
--
-- A void, not a delete. The row stays and stops counting, because "this was
-- entered by mistake on the 3rd and reversed on the 5th" is itself part of
-- the record. The expense row IS deleted -- an expense that never happened
-- has no business sitting in the cash position, and the payroll_payments row
-- preserves the fact that it once existed.
CREATE OR REPLACE FUNCTION public.void_payroll_payment(
  p_payment_id uuid,
  p_reason     text,
  p_actor      text DEFAULT NULL
)
RETURNS public.payroll_payments
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row     public.payroll_payments;
  v_expense integer;
BEGIN
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Say why this payment is being reversed.';
  END IF;

  SELECT * INTO v_row FROM public.payroll_payments WHERE id = p_payment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'No such payment.';
  END IF;
  IF v_row.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'That payment was already reversed on %.',
      to_char(v_row.voided_at, 'DD Mon YYYY');
  END IF;

  v_expense := v_row.expense_id;

  UPDATE public.payroll_payments
  SET voided_at = now(), voided_by = p_actor, void_reason = p_reason,
      expense_id = NULL
  WHERE id = p_payment_id
  RETURNING * INTO v_row;

  IF v_expense IS NOT NULL THEN
    DELETE FROM public.company_expenses WHERE id = v_expense;
  END IF;

  PERFORM public.resync_payroll_run(v_row.payroll_run_id);

  RETURN v_row;
END $fn$;

REVOKE ALL ON FUNCTION public.void_payroll_payment(uuid, text, text)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Backfilling what the old button recorded.
-- ---------------------------------------------------------------------------
--
-- Every run already marked paid has a cash_paid figure and no payment behind
-- it, and no expense at all. Those are real payments -- the money did leave
-- the account -- so they are brought across rather than discarded, flagged in
-- the note as reconstructed. Without this the cash position would jump the
-- first time a new-style payment was recorded and stay wrong for everything
-- before it.
DO $$
DECLARE
  r         record;
  v_name    text;
  v_expense integer;
  n         integer := 0;
BEGIN
  FOR r IN
    SELECT pr.* FROM public.payroll_runs pr
    WHERE pr.cash_paid > 0
      AND NOT EXISTS (SELECT 1 FROM public.payroll_payments pp
                       WHERE pp.payroll_run_id = pr.id)
  LOOP
    SELECT full_name INTO v_name
    FROM public.shareholders WHERE id = r.shareholder_id;

    INSERT INTO public.company_expenses
      (title, reason, amount, expense_date, category, vendor)
    VALUES (
      format('Salary — %s — %s', COALESCE(v_name, 'staff'),
             to_char(r.month, 'Mon YYYY')),
      'Payroll',
      ROUND(r.cash_paid / 100.0, 2),
      COALESCE(r.paid_on, r.due_on),
      'payroll',
      COALESCE(v_name, 'staff')
    )
    RETURNING id INTO v_expense;

    INSERT INTO public.payroll_payments
      (payroll_run_id, shareholder_id, amount, paid_on, method,
       expense_id, note, created_by)
    VALUES (r.id, r.shareholder_id, r.cash_paid,
            COALESCE(r.paid_on, r.due_on), 'other', v_expense,
            'Reconstructed by migration 0090 from the old single-figure '
            || '"mark paid" button. No receipt was captured at the time.',
            'migration_0090');

    n := n + 1;
  END LOOP;

  RAISE NOTICE '% payroll payment(s) brought across into the expense ledger.', n;
END $$;

-- ---------------------------------------------------------------------------
-- 7. Does the app agree with the bank?
-- ---------------------------------------------------------------------------
--
-- The point of all of the above. Cash in the account is money in, less money
-- out, plus capital that was never revenue -- and a figure that cannot be
-- checked against a bank statement is a figure nobody should trust.
--
-- UNITS, STATED PER LINE ON PURPOSE. company_income and company_expenses are
-- NAIRA; capital_events.amount is KOBO like everything else in the 0081
-- family. Four money-unit bugs have already been fixed in this schema, so
-- each component is exposed separately below rather than pre-summed: if one
-- is out by a hundred it shows up as one wrong line instead of one wrong
-- total.
CREATE OR REPLACE FUNCTION public.cash_position(p_as_of date DEFAULT current_date)
RETURNS TABLE (
  income_in    numeric,
  capital_in   numeric,
  expenses_out numeric,
  net_position numeric
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    COALESCE((SELECT SUM(amount) FROM public.company_income
               WHERE received_at::date <= p_as_of), 0)::numeric,
    COALESCE((SELECT SUM(amount) / 100.0 FROM public.capital_events
               WHERE received_on <= p_as_of), 0)::numeric,
    COALESCE((SELECT SUM(amount) FROM public.company_expenses
               WHERE expense_date::date <= p_as_of), 0)::numeric,
    COALESCE((SELECT SUM(amount) FROM public.company_income
               WHERE received_at::date <= p_as_of), 0)::numeric
    + COALESCE((SELECT SUM(amount) / 100.0 FROM public.capital_events
                 WHERE received_on <= p_as_of), 0)::numeric
    - COALESCE((SELECT SUM(amount) FROM public.company_expenses
                 WHERE expense_date::date <= p_as_of), 0)::numeric;
$fn$;

REVOKE ALL ON FUNCTION public.cash_position(date) FROM anon, authenticated;

-- What the bank actually says, typed off a statement. NAIRA, to match the
-- ledgers it is compared against.
CREATE TABLE IF NOT EXISTS public.bank_balances (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of       date NOT NULL,
  balance     numeric(18,2) NOT NULL,
  account     text NOT NULL DEFAULT 'main',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text,
  UNIQUE (as_of, account)
);

ALTER TABLE public.bank_balances ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.bank_balances FROM anon, authenticated;

COMMENT ON TABLE public.bank_balances IS
  'The real balance, read off a statement. NAIRA. Exists so the app can be '
  'checked against it rather than asserting it is right.';

CREATE OR REPLACE VIEW public.bank_reconciliation AS
  SELECT
    b.as_of,
    b.account,
    b.balance                   AS bank_says,
    cp.net_position             AS app_says,
    b.balance - cp.net_position AS difference,
    cp.income_in,
    cp.capital_in,
    cp.expenses_out,
    b.note,
    b.created_at
  FROM public.bank_balances b
  CROSS JOIN LATERAL public.cash_position(b.as_of) cp
  ORDER BY b.as_of DESC, b.account;

REVOKE ALL ON public.bank_reconciliation FROM anon, authenticated;

COMMENT ON VIEW public.bank_reconciliation IS
  'Bank statement against the app, on the same date. A non-zero difference '
  'means something real is unrecorded -- it is a to-do list, not an error.';

NOTIFY pgrst, 'reload schema';
