-- 0100: a PIN for the things only one person may do.
--
-- WHAT THIS REPLACES. Destructive actions required a fresh Google sign-in,
-- checked server-side against the token's auth_time. That is a strong control
-- against a stolen token, and a weak one against the threat actually worth
-- worrying about here: somebody sitting at an unlocked laptop with a live
-- session, or somebody who has the Google password. In both cases
-- "re-authenticate with Google" may simply succeed.
--
-- A PIN is a different KIND of secret -- something known rather than
-- something signed into -- so it holds where the other one gives way.
--
-- BEING HONEST ABOUT THE TRADE. Six digits is a million combinations, which
-- a script exhausts in minutes if it is allowed to keep guessing. On its own
-- that is weaker than a Google account with 2FA. What makes it safe is the
-- lockout below, and the lockout is therefore not a nicety bolted on beside
-- the feature -- it IS the feature. Without it this would be a downgrade.
--
--   * five wrong attempts and the PIN locks for fifteen minutes
--   * the counter is server-side, so clearing browser state does not reset it
--   * at five attempts per fifteen minutes, a million guesses takes
--     roughly six years
--
-- The PIN is never stored. Only a bcrypt hash of it, so the database being
-- read does not hand anybody the code.

-- ---------------------------------------------------------------------------
-- 1. Where the PIN lives.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admin_pins (
  email            text PRIMARY KEY,

  -- bcrypt, via pgcrypto's crypt(). Never the PIN itself: anybody who can
  -- read this table would otherwise hold the second factor outright, which
  -- would make it no factor at all.
  pin_hash         text NOT NULL,

  failed_attempts  integer NOT NULL DEFAULT 0,
  locked_until     timestamptz,
  last_used_at     timestamptz,

  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_pins FROM anon, authenticated;

COMMENT ON TABLE public.admin_pins IS
  'Second factor for destructive admin actions. Stores a bcrypt hash and the '
  'failed-attempt counter -- the counter is what makes six digits defensible.';

-- ---------------------------------------------------------------------------
-- 2. Setting or changing it.
-- ---------------------------------------------------------------------------
--
-- Changing an existing PIN requires the current one. Otherwise the PIN
-- protects nothing: anybody holding the session could simply set a new one
-- and carry on, and the second factor would be a formality with a keypad.
CREATE OR REPLACE FUNCTION public.set_admin_pin(
  p_email       text,
  p_new_pin     text,
  p_current_pin text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_existing text;
BEGIN
  IF p_new_pin !~ '^[0-9]{6}$' THEN
    RAISE EXCEPTION 'A PIN is exactly six digits.';
  END IF;

  -- Refused because they are the first codes anybody tries, and a PIN that
  -- loses to three guesses is worse than none -- it reads as protection
  -- while providing none.
  IF p_new_pin IN ('000000','111111','222222','333333','444444','555555',
                   '666666','777777','888888','999999','123456','654321',
                   '012345','123123','121212') THEN
    RAISE EXCEPTION 'That PIN is too easy to guess. Pick something less obvious.';
  END IF;

  SELECT pin_hash INTO v_existing
  FROM public.admin_pins WHERE email = lower(btrim(p_email));

  IF v_existing IS NOT NULL THEN
    IF p_current_pin IS NULL
       OR extensions.crypt(p_current_pin, v_existing) <> v_existing THEN
      RAISE EXCEPTION 'The current PIN is wrong.';
    END IF;
  END IF;

  INSERT INTO public.admin_pins (email, pin_hash, updated_at)
  VALUES (lower(btrim(p_email)),
          extensions.crypt(p_new_pin, extensions.gen_salt('bf', 10)),
          now())
  ON CONFLICT (email) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash,
        failed_attempts = 0,
        locked_until = NULL,
        updated_at = now();
END $fn$;

REVOKE ALL ON FUNCTION public.set_admin_pin(text, text, text)
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 3. Checking it.
-- ---------------------------------------------------------------------------
--
-- Returns a reason rather than just true or false, because "locked for 12
-- more minutes" and "wrong PIN" need different things from the person
-- reading them, and a bare false makes the caller guess.
--
-- THE COUNTER IS INCREMENTED BEFORE THE ANSWER IS GIVEN and committed either
-- way. A failed attempt that rolled back with the transaction would leave the
-- lockout unenforceable, which is the whole protection.
CREATE OR REPLACE FUNCTION public.verify_admin_pin(
  p_email text,
  p_pin   text
)
RETURNS TABLE (ok boolean, reason text, locked_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  r public.admin_pins;
  v_wait integer;
BEGIN
  SELECT * INTO r FROM public.admin_pins
  WHERE email = lower(btrim(p_email)) FOR UPDATE;

  IF r.email IS NULL THEN
    RETURN QUERY SELECT false, 'no_pin_set'::text, 0;
    RETURN;
  END IF;

  IF r.locked_until IS NOT NULL AND r.locked_until > now() THEN
    v_wait := CEIL(EXTRACT(EPOCH FROM (r.locked_until - now())))::integer;
    RETURN QUERY SELECT false, 'locked'::text, v_wait;
    RETURN;
  END IF;

  IF p_pin IS NULL OR p_pin !~ '^[0-9]{6}$' THEN
    RETURN QUERY SELECT false, 'malformed'::text, 0;
    RETURN;
  END IF;

  IF extensions.crypt(p_pin, r.pin_hash) = r.pin_hash THEN
    UPDATE public.admin_pins
       SET failed_attempts = 0, locked_until = NULL, last_used_at = now()
     WHERE email = r.email;
    RETURN QUERY SELECT true, 'ok'::text, 0;
    RETURN;
  END IF;

  UPDATE public.admin_pins
     SET failed_attempts = r.failed_attempts + 1,
         locked_until = CASE WHEN r.failed_attempts + 1 >= 5
                             THEN now() + interval '15 minutes' ELSE NULL END
   WHERE email = r.email;

  IF r.failed_attempts + 1 >= 5 THEN
    RETURN QUERY SELECT false, 'locked'::text, 900;
  ELSE
    RETURN QUERY SELECT false, 'wrong'::text, (4 - r.failed_attempts)::integer;
  END IF;
END $fn$;

REVOKE ALL ON FUNCTION public.verify_admin_pin(text, text)
  FROM anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- 4. Whether a PIN exists, without revealing anything about it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_pin_status(p_email text)
RETURNS TABLE (has_pin boolean, locked boolean, locked_seconds integer,
               last_used_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    true,
    (a.locked_until IS NOT NULL AND a.locked_until > now()),
    COALESCE(CEIL(EXTRACT(EPOCH FROM (a.locked_until - now())))::integer, 0),
    a.last_used_at
  FROM public.admin_pins a
  WHERE a.email = lower(btrim(p_email))
  UNION ALL
  SELECT false, false, 0, NULL::timestamptz
  WHERE NOT EXISTS (SELECT 1 FROM public.admin_pins b
                     WHERE b.email = lower(btrim(p_email)))
  LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.admin_pin_status(text)
  FROM anon, authenticated, public;

NOTIFY pgrst, 'reload schema';
