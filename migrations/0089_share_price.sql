-- 0089: a place to set the share price, and one definition of what it means.
--
-- WHY THIS EXISTS
--
-- Until now the only way to move the per-share price was to type a whole
-- company valuation into the Record tab and hope the division worked out.
-- That is backwards. When money comes into a company it comes in AT A PRICE
-- PER SHARE -- "N10 a share" is the thing that gets agreed, and the company
-- valuation is what falls out of it. 0088 had to clean up after exactly that
-- confusion, where a valuation typed two zeroes short put every shareholder's
-- stake at a hundredth of what they paid.
--
-- So the price is now the thing you set, and the valuation is derived:
--
--     company valuation  =  price per share  x  shares issued on that date
--
-- One multiplication, done by the database, from the share register. It
-- cannot disagree with the cap table because it is computed from it.
--
-- WHAT IS DELIBERATELY NOT HERE. Nothing automatically revalues anything.
-- Setting a price writes a new dated row and leaves every earlier row where
-- it is, because company_valuations is a history and a shareholder is
-- entitled to see what the price was in March as well as what it is today.

-- ---------------------------------------------------------------------------
-- 1. How many shares exist, as at a date.
-- ---------------------------------------------------------------------------
--
-- As at a DATE, not just today. A valuation dated in March must divide by the
-- shares that existed in March, or the price it implies is wrong for anyone
-- reading the history. share_transactions.shares is signed, so a buyback
-- subtracts itself and this stays a plain SUM.
CREATE OR REPLACE FUNCTION public.shares_issued(p_as_of date DEFAULT current_date)
RETURNS bigint
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(SUM(st.shares), 0)::bigint
  FROM public.share_transactions st
  WHERE st.txn_date <= p_as_of;
$fn$;

REVOKE ALL ON FUNCTION public.shares_issued(date) FROM anon, authenticated;

COMMENT ON FUNCTION public.shares_issued(date) IS
  'Shares in existence on a given date, from the register. Signed sum, so '
  'buybacks reduce it.';

-- ---------------------------------------------------------------------------
-- 2. Every valuation, and the price per share it implies.
-- ---------------------------------------------------------------------------
--
-- The history read the other way round. A shareholder asking "what was my
-- stake worth in March, and why" gets the price, the basis and the note in
-- one row rather than being handed a company valuation to divide themselves.
CREATE OR REPLACE VIEW public.share_price_history AS
SELECT
  v.id,
  v.valued_on,
  v.amount                AS company_value,
  public.shares_issued(v.valued_on) AS shares_then,
  CASE WHEN public.shares_issued(v.valued_on) > 0
       THEN ROUND(v.amount / public.shares_issued(v.valued_on), 4)
       ELSE NULL END      AS price_per_share,
  v.method,
  v.basis,
  v.note,
  v.created_at,
  v.created_by
FROM public.company_valuations v
ORDER BY v.valued_on DESC, v.created_at DESC;

REVOKE ALL ON public.share_price_history FROM anon, authenticated;

COMMENT ON VIEW public.share_price_history IS
  'Valuation history expressed as a price per share, divided by the shares '
  'that existed on each valuation date rather than the shares that exist now.';

-- ---------------------------------------------------------------------------
-- 3. What the price is right now.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_share_price()
RETURNS numeric
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  -- Ordered here as well as in the view. A view's ORDER BY is not a promise
  -- the planner has to keep once it is wrapped in another query, and "the
  -- current share price" picking an arbitrary row would be a quiet, plausible
  -- and badly wrong answer.
  SELECT price_per_share
  FROM public.share_price_history
  ORDER BY valued_on DESC, created_at DESC
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.current_share_price() FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Setting it.
-- ---------------------------------------------------------------------------
--
-- The whole point of putting this in a function rather than in the API: the
-- multiplication happens once, next to the register, and every caller gets
-- the same answer. An API that computed shares x price in TypeScript would
-- be reading a cap table over the wire and could be one deploy behind it.
--
-- THE PAR VALUE REFUSAL IS NOT PEDANTRY. Section 118 of CAMA 2020 does not
-- allow shares to be issued at a discount to their nominal value. A price
-- below N10 here would either be a typo or would describe an issuance the
-- company is not permitted to make, and both are worth stopping. A note
-- overrides it, because a genuine down round below par is a real event that
-- gets restructured rather than refused outright -- it just should not happen
-- by accident.
CREATE OR REPLACE FUNCTION public.set_share_price(
  p_price     numeric,
  p_basis     text    DEFAULT 'founder_estimate',
  p_valued_on date    DEFAULT current_date,
  p_note      text    DEFAULT NULL,
  p_actor     text    DEFAULT NULL
)
RETURNS public.company_valuations
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_shares bigint;
  v_par    numeric;
  v_row    public.company_valuations;
BEGIN
  IF p_price IS NULL OR p_price <= 0 THEN
    RAISE EXCEPTION 'A share price has to be a positive number.';
  END IF;

  v_shares := public.shares_issued(p_valued_on);

  IF v_shares <= 0 THEN
    RAISE EXCEPTION
      'No shares existed on %. A price per share means nothing until shares '
      'have been issued -- record the share issuance first.', p_valued_on;
  END IF;

  SELECT MAX(sc.nominal_value) INTO v_par FROM public.share_classes sc;

  IF v_par IS NOT NULL AND p_price < v_par
     AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION
      'N% a share is below the N% nominal value. Shares cannot be issued at a '
      'discount to par, so this is either a typo or something that needs '
      'explaining -- put the reason in the note if you mean it.',
      to_char(p_price, 'FM999,999,990.00'), to_char(v_par, 'FM999,999,990.00');
  END IF;

  INSERT INTO public.company_valuations
    (valued_on, amount, method, basis, note, created_by)
  VALUES (
    p_valued_on,
    ROUND(p_price * v_shares, 2),
    CASE WHEN p_basis = 'last_round' THEN 'round_post_money'
         WHEN p_basis = 'par_value'  THEN 'book_value'
         ELSE 'manual' END,
    p_basis,
    COALESCE(NULLIF(btrim(p_note), ''),
      format('Set from a price of N%s a share against %s shares in issue on %s.',
             to_char(p_price, 'FM999,999,990.00'),
             to_char(v_shares, 'FM999,999,999,990'),
             to_char(p_valued_on, 'DD Mon YYYY'))),
    p_actor
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $fn$;

-- ON 0088's TRIGGER. sanity_check_valuation refuses an amount below a tenth
-- of par unless a note explains it, and this function always writes a note --
-- so on paper it slips past that guard. It does not matter: the check above
-- is the stricter of the two. The trigger draws its line at a tenth of par
-- (N1 a share) and only for typed amounts; this refuses anything under par
-- itself (N10 a share). Nothing reaching the table through here could have
-- failed the trigger.
REVOKE ALL ON FUNCTION public.set_share_price(numeric, text, date, text, text)
  FROM anon, authenticated;

COMMENT ON FUNCTION public.set_share_price(numeric, text, date, text, text) IS
  'Records a valuation from a price per share x shares in issue on that date. '
  'Refuses a price below nominal value unless a note explains it.';

NOTIFY pgrst, 'reload schema';
