-- 0088: the valuation says N100,000. The company is worth N10,000,000 at par.
--
-- WHAT WENT WRONG
--
-- 0080 seeded a valuation of N10,000,000 -- nominal share capital, 1,000,000
-- shares at N10 each -- with the basis 'book_value'. A later row was recorded
-- with basis 'founder_estimate' and an amount of N100,000, and because the
-- stakeholder page reads the MOST RECENT valuation, every stake collapsed by
-- a factor of a hundred: the founder's 80% showed as N80,000 against
-- N8,000,000 actually paid in.
--
-- A stake worth a hundredth of what was paid for it is not a valuation
-- anybody would defend, and the page had no way to notice.
--
-- THE FIX, IN TWO PARTS
--
-- 1. A par-value valuation is recorded now, computed FROM THE SHARE REGISTER
--    rather than typed: shares issued x nominal value. It cannot be wrong by
--    a factor of a hundred because nobody enters it.
--
-- 2. par_value_valuation() exists so it can be recomputed after any share
--    movement, which is the whole point of a derived figure.
--
-- WHAT THIS DOES NOT CLAIM. Par value is what was PAID IN, not what the
-- company is worth. It is the only defensible number before a round prices
-- the shares, and it is deliberately equal to "amount paid in" on the
-- stakeholder page -- those two figures agreeing is the honest state of a
-- company that has never raised.

-- ---------------------------------------------------------------------------
-- 1. What the register says the company is worth at par.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.par_value_valuation()
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  -- Every share actually issued, at its own class's nominal value. Class A
  -- and Class B are both N10 today, but reading it per class means a future
  -- class at a different par does not silently break this.
  SELECT COALESCE(SUM(h.shares * sc.nominal_value), 0)::numeric
  FROM (
    SELECT st.class_id, SUM(st.shares) AS shares
    FROM public.share_transactions st
    GROUP BY st.class_id
    HAVING SUM(st.shares) > 0
  ) h
  JOIN public.share_classes sc ON sc.id = h.class_id;
$fn$;

REVOKE ALL ON FUNCTION public.par_value_valuation() FROM anon, authenticated;

COMMENT ON FUNCTION public.par_value_valuation() IS
  'Shares issued x nominal value. What was paid in, NOT what the company is '
  'worth. The only defensible figure before a round prices the shares.';

-- ---------------------------------------------------------------------------
-- 2. Record it as today's valuation.
-- ---------------------------------------------------------------------------
--
-- Recorded rather than replacing the bad row. company_valuations is a history:
-- deleting the N100,000 entry would hide that it was ever there, and the
-- stakeholder page is meant to be auditable. The newest row wins, so this
-- corrects the figure while leaving the record of what it was.
DO $$
DECLARE
  v_par      numeric;
  v_current  numeric;
BEGIN
  v_par := public.par_value_valuation();

  IF v_par IS NULL OR v_par <= 0 THEN
    RAISE NOTICE 'No shares on the register -- nothing to value.';
    RETURN;
  END IF;

  SELECT amount INTO v_current
  FROM public.company_valuations
  ORDER BY valued_on DESC, created_at DESC
  LIMIT 1;

  IF v_current IS NOT DISTINCT FROM v_par THEN
    RAISE NOTICE 'Valuation is already N% at par -- nothing to do.', v_par;
    RETURN;
  END IF;

  INSERT INTO public.company_valuations (valued_on, amount, method, basis, note)
  VALUES (
    current_date,
    v_par,
    'book_value',
    'par_value',
    format('Shares issued at nominal value: N%s. Replaces a recorded figure '
           'of N%s, which valued the whole company at a fraction of what was '
           'paid into it. Par value is what shareholders put in, not a market '
           'price -- there has been no round.',
           to_char(v_par, 'FM999,999,999,990'),
           to_char(COALESCE(v_current, 0), 'FM999,999,999,990'))
  );

  RAISE NOTICE 'Valuation set to N% (was N%).', v_par, COALESCE(v_current, 0);
END $$;

-- ---------------------------------------------------------------------------
-- 3. A guard against the same mistake.
-- ---------------------------------------------------------------------------
--
-- The bad row was almost certainly a typo -- N100,000 for N10,000,000, two
-- zeroes short. Nothing checked it, and the consequence was every
-- shareholder's stake shown at a hundredth of its value.
--
-- This does not forbid a low valuation: a company genuinely can be worth less
-- than was paid into it, and a down round is a real thing. It refuses one
-- that is below a TENTH of par without an explicit note saying why, because
-- at that point a typo is far likelier than a deliberate write-down.
CREATE OR REPLACE FUNCTION public.sanity_check_valuation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_par numeric;
BEGIN
  v_par := public.par_value_valuation();

  IF v_par > 0
     AND NEW.amount < v_par / 10
     AND COALESCE(btrim(NEW.note), '') = '' THEN
    RAISE EXCEPTION
      'A valuation of N% is less than a tenth of the N% actually paid into '
      'the company. If that is deliberate, record the reason in the note. If '
      'it is a typo, this is the two zeroes.',
      to_char(NEW.amount, 'FM999,999,999,990'),
      to_char(v_par, 'FM999,999,999,990');
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS sanity_check_valuation ON public.company_valuations;
CREATE TRIGGER sanity_check_valuation
  BEFORE INSERT OR UPDATE ON public.company_valuations
  FOR EACH ROW EXECUTE FUNCTION public.sanity_check_valuation();

NOTIFY pgrst, 'reload schema';
