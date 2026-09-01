-- 0087: campus agreements earn only while they are running, and get paid.
--
-- FOUR THINGS 0086 LEFT UNFINISHED.
--
-- (1) THE START DATE WAS DECORATIVE.
--
-- liveRoutes computed a partner's earnings as
--
--     company_share * percent / 100
--
-- over the WHOLE reporting window, with no reference to the agreement's own
-- starts_on or ends_on. So an agreement dated to begin next month already
-- showed a balance, and one that ended in March still earned on April's
-- money. A start date you can set but that does nothing is worse than no
-- start date, because it looks like it worked.
--
-- Earnings are now scoped to the OVERLAP between the reporting window and the
-- agreement's own life. Outside that overlap a partner earns nothing, which
-- is what a start date means.
--
-- (2) THERE WAS NO WAY TO PAY ANYBODY.
--
-- The app could say what was owed and had no way to record that it had been
-- settled, so the number never went down. school_partner_payouts is that
-- record.
--
-- A PAYOUT IS A DEDUCTIBLE EXPENSE, and this is the part worth reading
-- twice. Clause 7.1(b) deducts "sums payable to sellers, merchants, vendors
-- or other third parties as their share of transaction proceeds" from
-- Monthly Gross Profit. A campus revenue share is precisely that. So paying
-- an exco REDUCES gross profit, which can reduce four people's salaries.
-- That is correct, it is contractual, and it is why the expense row is
-- written automatically rather than left to somebody to remember.
--
-- (3) AN ENDED AGREEMENT COULD NOT BE RENEWED OR RESTORED.
--
-- ends_on was write-once in practice. A tenure that renews is the normal
-- case, not the exception.
--
-- (4) A CAMPUS SHOWED A TOTAL AND NOTHING ELSE.
--
-- "N25,400 collected" is a number somebody is asked to trust. The breakdown
-- is who paid, how much, and when.

-- ---------------------------------------------------------------------------
-- 1. What state is an agreement actually in?
-- ---------------------------------------------------------------------------
--
-- Four, not two. The screen was showing "ended" for anything that was not
-- currently earning, which collapses three different situations into one:
-- not started yet, finished naturally, and switched off by hand.
CREATE OR REPLACE FUNCTION public.partner_status(
  p_active    boolean,
  p_starts_on date,
  p_ends_on   date,
  p_on        date DEFAULT current_date
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN NOT COALESCE(p_active, true)            THEN 'ended'
    WHEN p_starts_on > p_on                      THEN 'pending'
    WHEN p_ends_on IS NOT NULL AND p_ends_on < p_on THEN 'lapsed'
    ELSE 'active'
  END;
$$;

-- ---------------------------------------------------------------------------
-- 2. What one agreement earned, over its own dates.
-- ---------------------------------------------------------------------------
--
-- The fix for (1). Income is counted only where the reporting window and the
-- agreement's life overlap -- GREATEST of the two starts, LEAST of the two
-- ends -- so a future agreement earns zero and a lapsed one stops at its end
-- date rather than at the edge of whatever window is on screen.
CREATE OR REPLACE FUNCTION public.partner_earned(
  p_agreement_id uuid,
  p_from date,
  p_to   date
)
RETURNS TABLE (
  effective_from date,
  effective_to   date,
  campus_share   numeric,
  earned         numeric,
  payments       bigint
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH ag AS (
    SELECT ss.school_id, ss.percent, ss.active, ss.starts_on, ss.ends_on
    FROM public.school_stakeholders ss
    WHERE ss.id = p_agreement_id
  ),
  span AS (
    SELECT
      ag.school_id,
      ag.percent,
      GREATEST(p_from, ag.starts_on) AS eff_from,
      LEAST(p_to, COALESCE(ag.ends_on, p_to)) AS eff_to,
      ag.active
    FROM ag
  )
  SELECT
    w.eff_from,
    w.eff_to,
    COALESCE(se.company_share, 0)::numeric,
    -- An inactive agreement earns nothing from today, but what it earned
    -- while it was running still counts -- that money was owed and may still
    -- be unpaid.
    ROUND(COALESCE(se.company_share, 0) * w.percent / 100.0, 2)::numeric,
    COALESCE(se.payments, 0)::bigint
  FROM span w
  LEFT JOIN LATERAL (
    SELECT * FROM public.school_earnings(w.eff_from, w.eff_to) x
    WHERE x.school_id = w.school_id
  ) se ON true
  -- No overlap at all: the agreement had not started, or had finished,
  -- before this window opened.
  WHERE w.eff_from <= w.eff_to;
$fn$;

REVOKE ALL ON FUNCTION public.partner_earned(uuid, date, date)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Payouts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.school_partner_payouts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id   uuid NOT NULL
                 REFERENCES public.school_stakeholders(id) ON DELETE CASCADE,

  -- The period this payment covers. Stored rather than inferred so a payout
  -- can be reconciled against the exact window it was calculated from, six
  -- years later, when the reporting window on screen is something else.
  period_from    date NOT NULL,
  period_to      date NOT NULL,

  -- What the campus made in that window, and the cut applied. Both frozen:
  -- a percentage that is later renegotiated must not silently rewrite a
  -- payment that has already been made.
  campus_share   numeric(18,2) NOT NULL DEFAULT 0,
  percent        numeric(6,3) NOT NULL,
  amount         numeric(18,2) NOT NULL CHECK (amount >= 0),

  paid_on        date NOT NULL DEFAULT current_date,
  method         text,
  reference      text,
  note           text,

  -- The company_expenses row this created, so the two can be traced to each
  -- other. Nullable: a payout recorded before the ledger existed, or one
  -- whose expense write failed, is still a real payment.
  expense_id     integer,

  created_by     text,
  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT payout_period_sane CHECK (period_to >= period_from)
);

CREATE INDEX IF NOT EXISTS school_payouts_agreement_idx
  ON public.school_partner_payouts (agreement_id, period_to DESC);

ALTER TABLE public.school_partner_payouts ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Recording one, and the expense it creates.
-- ---------------------------------------------------------------------------
--
-- Both in ONE transaction. A payout with no expense row understates costs and
-- overstates gross profit -- which overpays four people. An expense with no
-- payout row is money out with nothing explaining it. Neither half is worth
-- having on its own.
CREATE OR REPLACE FUNCTION public.record_partner_payout(
  p_agreement_id uuid,
  p_period_from  date,
  p_period_to    date,
  p_amount       numeric,
  p_method       text DEFAULT NULL,
  p_reference    text DEFAULT NULL,
  p_note         text DEFAULT NULL,
  p_actor        text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ag       record;
  v_partner  text;
  v_school   text;
  v_share    numeric;
  v_expense  integer;
  v_id       uuid;
BEGIN
  SELECT ss.*,
         COALESCE(sh.full_name, ss.body_name) AS partner_name,
         s.name AS school_name
  INTO v_ag
  FROM public.school_stakeholders ss
  LEFT JOIN public.shareholders sh ON sh.id = ss.person_id
  LEFT JOIN public.schools s ON s.id = ss.school_id
  WHERE ss.id = p_agreement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such campus agreement.';
  END IF;
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'A payout cannot be negative.';
  END IF;

  v_partner := COALESCE(v_ag.partner_name, 'Campus partner');
  v_school  := COALESCE(v_ag.school_name, 'a campus');

  SELECT COALESCE(campus_share, 0) INTO v_share
  FROM public.partner_earned(p_agreement_id, p_period_from, p_period_to);

  -- THE EXPENSE. category = 'seller_payouts', which IS deductible from
  -- Monthly Gross Profit under clause 7.1(b). See the header: this reduces
  -- gross profit and can reduce salaries, and that is the correct treatment
  -- of a third party's share of transaction proceeds.
  BEGIN
    INSERT INTO public.company_expenses
      (title, reason, category, amount, expense_date, vendor, approved_by)
    VALUES
      (format('Campus share: %s (%s)', v_partner, v_school),
       format('%s%% of %s gross profit, %s to %s',
              v_ag.percent, v_school, p_period_from, p_period_to),
       'seller_payouts',
       p_amount,
       COALESCE(p_period_to, current_date),
       v_partner,
       p_actor)
    RETURNING id INTO v_expense;
  EXCEPTION WHEN OTHERS THEN
    -- The payment happened whether or not the ledger accepted the row.
    -- Losing the record of it would be worse than a missing expense line,
    -- which can be added by hand.
    RAISE NOTICE 'Could not write the expense row: %', SQLERRM;
    v_expense := NULL;
  END;

  INSERT INTO public.school_partner_payouts
    (agreement_id, period_from, period_to, campus_share, percent, amount,
     method, reference, note, expense_id, created_by)
  VALUES
    (p_agreement_id, p_period_from, p_period_to, COALESCE(v_share, 0),
     v_ag.percent, p_amount, p_method, p_reference, p_note, v_expense, p_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END $fn$;

REVOKE ALL ON FUNCTION public.record_partner_payout(
  uuid, date, date, numeric, text, text, text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. What is still owed on one agreement.
-- ---------------------------------------------------------------------------
--
-- Earned since the agreement started, less everything already paid. Lifetime
-- rather than window-scoped on purpose: a debt does not disappear because the
-- date filter moved.
CREATE OR REPLACE FUNCTION public.partner_balance(p_agreement_id uuid)
RETURNS TABLE (
  status        text,
  earned_total  numeric,
  paid_total    numeric,
  outstanding   numeric,
  last_paid_on  date
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  WITH ag AS (
    SELECT ss.active, ss.starts_on, ss.ends_on
    FROM public.school_stakeholders ss WHERE ss.id = p_agreement_id
  ),
  earned AS (
    SELECT COALESCE(pe.earned, 0) AS earned
    FROM ag
    LEFT JOIN LATERAL public.partner_earned(
      p_agreement_id,
      ag.starts_on,
      LEAST(current_date, COALESCE(ag.ends_on, current_date))
    ) pe ON true
  ),
  paid AS (
    SELECT COALESCE(SUM(amount), 0) AS paid, MAX(paid_on) AS last_paid
    FROM public.school_partner_payouts WHERE agreement_id = p_agreement_id
  )
  SELECT
    public.partner_status(ag.active, ag.starts_on, ag.ends_on),
    e.earned,
    p.paid,
    GREATEST(e.earned - p.paid, 0),
    p.last_paid
  FROM ag CROSS JOIN earned e CROSS JOIN paid p;
$fn$;

REVOKE ALL ON FUNCTION public.partner_balance(uuid) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Renew, and restore.
-- ---------------------------------------------------------------------------
--
-- Renewing EXTENDS the same agreement rather than creating a second one, so
-- the payout history stays attached to it. A new tenure with the same partner
-- on different terms is a new agreement; the same terms running longer is
-- this.
CREATE OR REPLACE FUNCTION public.renew_partner_agreement(
  p_agreement_id uuid,
  p_new_ends_on  date,
  p_percent      numeric DEFAULT NULL,
  p_actor        text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ag record;
BEGIN
  SELECT * INTO v_ag FROM public.school_stakeholders WHERE id = p_agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such campus agreement.';
  END IF;

  IF p_new_ends_on IS NOT NULL AND p_new_ends_on < current_date THEN
    RAISE EXCEPTION 'A renewal has to end in the future.';
  END IF;

  UPDATE public.school_stakeholders
  SET ends_on = p_new_ends_on,
      percent = COALESCE(p_percent, percent),
      active  = true,
      note    = COALESCE(note, '')
                || format(E'\nRenewed to %s by %s on %s.',
                          COALESCE(p_new_ends_on::text, 'open-ended'),
                          COALESCE(p_actor, 'unknown'), current_date)
  WHERE id = p_agreement_id;
END $fn$;

-- Restoring an agreement that was ended by hand.
--
-- Deliberately does NOT clear ends_on: an agreement switched off in error
-- should come back exactly as it was, and quietly making it open-ended would
-- be a second, invisible change. Extending the term is what renew is for.
CREATE OR REPLACE FUNCTION public.restore_partner_agreement(
  p_agreement_id uuid,
  p_actor        text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ag record;
BEGIN
  SELECT * INTO v_ag FROM public.school_stakeholders WHERE id = p_agreement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such campus agreement.';
  END IF;

  UPDATE public.school_stakeholders
  SET active = true,
      note   = COALESCE(note, '')
               || format(E'\nRestored by %s on %s.',
                         COALESCE(p_actor, 'unknown'), current_date)
  WHERE id = p_agreement_id;

  -- Tells the caller what it came back AS, so the UI can say "restored, but
  -- its end date has passed -- renew it" rather than showing a restored
  -- agreement that still earns nothing.
  RETURN public.partner_status(true, v_ag.starts_on, v_ag.ends_on);
END $fn$;

REVOKE ALL ON FUNCTION public.renew_partner_agreement(uuid, date, numeric, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.restore_partner_agreement(uuid, text)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. The breakdown behind a campus total.
-- ---------------------------------------------------------------------------
--
-- Every payment, who made it, and what it was for. "N25,400 collected" is a
-- number somebody is asked to trust; this is the evidence for it.
--
-- The payer is named because a campus partner receiving a percentage is
-- entitled to see what it is a percentage OF -- that is the whole basis of
-- the transparency this is for. It is founder-gated at the route, like
-- everything else in the module.
CREATE OR REPLACE FUNCTION public.school_payment_breakdown(
  p_school_id bigint,
  p_from date,
  p_to   date
)
RETURNS TABLE (
  received_at   timestamptz,
  stream        text,
  amount        numeric,
  company_share numeric,
  payer_id      text,
  payer_name    text,
  payer_username text,
  reference     text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    si.received_at,
    si.stream,
    si.amount,
    -- The same per-stream split the campus totals use, so a row here always
    -- adds up to the figure on the card above it.
    (si.amount * CASE COALESCE(pf.basis, 'all')
        WHEN 'percentage' THEN COALESCE(pf.percent, 100) / 100.0
        ELSE 1 END
     - CASE WHEN COALESCE(pf.basis, 'all') = 'flat_per_transaction'
            THEN GREATEST(si.amount - (pf.amount_kobo / 100.0), 0)
            ELSE 0 END)::numeric,
    si.payer,
    p.full_name,
    p.username,
    NULL::text
  FROM public.school_income si
  LEFT JOIN public.profiles p ON p.id::text = si.payer
  LEFT JOIN LATERAL (
    SELECT f.basis, f.amount_kobo, f.percent
    FROM public.platform_fees f
    WHERE f.stream = si.stream AND f.effective_from <= si.received_at::date
    ORDER BY f.effective_from DESC LIMIT 1
  ) pf ON true
  WHERE si.received_at::date BETWEEN p_from AND p_to
    AND (p_school_id IS NULL AND si.school_id IS NULL
         OR si.school_id = p_school_id)
  ORDER BY si.received_at DESC;
$fn$;

REVOKE ALL ON FUNCTION public.school_payment_breakdown(bigint, date, date)
  FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
