-- 0091: a salary expense that knows whose salary it was, and an undo.
--
-- WHAT WAS WRONG
--
-- There were two ways to record paying somebody, and they did not agree.
--
--   Record -> Expense -> "Salaries & staff" wrote a row into
--   company_expenses with a typed description and nothing else. It was not
--   attached to a person, so payroll_runs never heard about it. The money
--   left the bank, the books said it left, and the payroll register still
--   showed the staff member owed in full.
--
--   Payroll -> Record payment (0090) did it properly: settled the line AND
--   wrote the expense, linked, once.
--
-- The first route is the one on the Record tab, which is where somebody
-- logging the day's spending naturally goes. So the common path was the
-- broken one, and the symptom was the founder appearing to owe staff he had
-- already paid.
--
-- THE FIX HAS TWO HALVES
--
--   1. An expense can name a person. Then "who was this for" is a foreign
--      key rather than a string somebody typed, and a salary payment can be
--      traced to the payroll line it settles.
--   2. Where the person HAS an open payroll month, the form stops writing a
--      loose expense at all and routes through record_payroll_payment(), so
--      there is exactly one way for salary money to reach the ledger.
--
-- Free text is still allowed, because paying a contractor who is not on the
-- cap table is a real thing. It is just no longer the only option.

-- ---------------------------------------------------------------------------
-- 1. An expense can name a person.
-- ---------------------------------------------------------------------------
ALTER TABLE public.company_expenses
  ADD COLUMN IF NOT EXISTS person_id uuid
    REFERENCES public.shareholders(id) ON DELETE SET NULL;

-- ON DELETE SET NULL, not CASCADE. Removing somebody from the cap table must
-- never delete the record that the company paid them money -- that is a
-- payment that happened, and the expense has to survive the payee.

CREATE INDEX IF NOT EXISTS company_expenses_person_idx
  ON public.company_expenses (person_id) WHERE person_id IS NOT NULL;

COMMENT ON COLUMN public.company_expenses.person_id IS
  'Who this was paid to, where they are on the register. NULL for a supplier '
  'or a contractor typed in by hand.';

-- ---------------------------------------------------------------------------
-- 2. What each person is still owed, ready for a dropdown.
-- ---------------------------------------------------------------------------
--
-- One row per person per unsettled month. The form uses it to offer the real
-- outstanding months rather than asking somebody to remember them, which is
-- the difference between a figure that reconciles and a figure that is close.
CREATE OR REPLACE VIEW public.payroll_outstanding AS
  SELECT
    pr.id            AS payroll_run_id,
    pr.shareholder_id,
    s.full_name,
    s.role_title,
    ps.scale,
    pr.month,
    pr.band,
    pr.cash_due,
    pr.cash_paid,
    (pr.cash_due - pr.cash_paid) AS outstanding,
    pr.due_on,
    (pr.paid_on IS NULL AND pr.due_on < current_date) AS overdue
  FROM public.payroll_runs pr
  JOIN public.shareholders s ON s.id = pr.shareholder_id
  LEFT JOIN public.pay_scales ps ON ps.shareholder_id = pr.shareholder_id
  WHERE pr.cash_paid < pr.cash_due
  ORDER BY pr.month DESC, s.full_name;

REVOKE ALL ON public.payroll_outstanding FROM anon, authenticated;

COMMENT ON VIEW public.payroll_outstanding IS
  'Every payroll line still owing money. Drives the month picker when a '
  'salary payment is recorded, so the payment lands on a real month.';

-- ---------------------------------------------------------------------------
-- 3. Undo.
-- ---------------------------------------------------------------------------
--
-- Somebody will type a figure into the wrong box. Today the only remedy is a
-- second entry cancelling the first, which leaves two wrong rows in the books
-- instead of none.
--
-- WHY THE WHOLE ROW IS KEPT. A delete that cannot be reversed is not a
-- correction, it is a second mistake waiting to happen. The complete row goes
-- in here as JSON before it is removed, so restoring it is an INSERT of
-- exactly what was there -- same id, same values, nothing reconstructed from
-- memory.
--
-- finance_audit still records that the deletion happened. This table is what
-- makes it undoable; that one is what makes it accountable.
CREATE TABLE IF NOT EXISTS public.deleted_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which table, and which row in it.
  entity       text NOT NULL,
  entity_id    text NOT NULL,

  -- Everything the row held. Restoring is INSERT ... SELECT from this.
  payload      jsonb NOT NULL,

  -- Said in words, because six months later "expense 412" means nothing.
  description  text,

  deleted_by   text NOT NULL,
  deleted_at   timestamptz NOT NULL DEFAULT now(),
  reason       text,

  restored_by  text,
  restored_at  timestamptz
);

CREATE INDEX IF NOT EXISTS deleted_records_at_idx
  ON public.deleted_records (deleted_at DESC);
CREATE INDEX IF NOT EXISTS deleted_records_entity_idx
  ON public.deleted_records (entity, entity_id);

ALTER TABLE public.deleted_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.deleted_records FROM anon, authenticated;

COMMENT ON TABLE public.deleted_records IS
  'The full row of anything deleted from the books, kept so it can be put '
  'back. Deletion is super-admin only and requires a fresh sign-in.';

NOTIFY pgrst, 'reload schema';
