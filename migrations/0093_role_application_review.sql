-- 0093: reviewing delivery-agent and transport-vendor applications from here.
--
-- The app's 0087 built the queue and the lock: role_applications holds the
-- requests, guard_role_flags() refuses any direct change to
-- profiles.is_delivery_agent or is_transport_vendor, and
-- approve_role_application() is the only door through it. What it did not
-- build is the admin side, because that lives in this repo.
--
-- THE ONE MISMATCH TO SOLVE. 0087 records the reviewer as
--
--     reviewer_id uuid REFERENCES auth.users(id)
--
-- which assumes whoever approves is a Supabase auth user. The admin app is
-- not: it signs in with Firebase and identifies people by email address.
-- There is no auth.users row for the founder's admin login, so reviewer_id
-- can only ever be NULL from here -- and an approval with no record of who
-- gave it is precisely what 0087 exists to prevent.
--
-- So this adds reviewer_email alongside it. Not instead of: if the mobile app
-- ever grows an in-app reviewer, reviewer_id is still the right column for
-- them, and the two coexist rather than one pretending to be the other.

-- ---------------------------------------------------------------------------
-- 1. Who actually reviewed it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.role_applications
  ADD COLUMN IF NOT EXISTS reviewer_email text;

COMMENT ON COLUMN public.role_applications.reviewer_email IS
  'The admin who decided this, by email. Filled from the admin app, which '
  'authenticates with Firebase and therefore has no auth.users id to put in '
  'reviewer_id.';

-- ---------------------------------------------------------------------------
-- 2. The queue, with enough about the applicant to decide.
-- ---------------------------------------------------------------------------
--
-- An application on its own is an address and a sentence. Deciding it needs
-- the person: how long they have been on the platform, which campus they say
-- they are on, whether they already hold the other role. Joining that in the
-- view rather than in the API keeps one definition of "what a reviewer sees".
CREATE OR REPLACE VIEW public.role_application_queue AS
  SELECT
    ra.id,
    ra.user_id,
    ra.kind,
    ra.gender,
    ra.address,
    ra.note,
    ra.status,
    ra.review_note,
    ra.reviewer_email,
    ra.reviewed_at,
    ra.created_at,

    p.full_name,
    p.username,
    p.avatar_url,
    p.phone_number,
    p.school_id,
    p.school_name,
    p.subscription_tier,
    p.created_at         AS joined_at,

    -- What they already are. Approving somebody who is already an agent is a
    -- no-op worth seeing before you click rather than after.
    COALESCE(p.is_delivery_agent, false)   AS is_delivery_agent,
    COALESCE(p.is_transport_vendor, false) AS is_transport_vendor,

    -- Has this person been turned down before? A second application from
    -- somebody rejected last month is a different decision from a first one.
    (SELECT COUNT(*) FROM public.role_applications prev
      WHERE prev.user_id = ra.user_id
        AND prev.kind = ra.kind
        AND prev.status = 'rejected')      AS previous_rejections
  FROM public.role_applications ra
  LEFT JOIN public.profiles p ON p.id = ra.user_id;

REVOKE ALL ON public.role_application_queue FROM anon, authenticated;

COMMENT ON VIEW public.role_application_queue IS
  'Applications with the applicant attached, for the admin review screen. '
  'Not reachable by anon or authenticated -- the admin server reads it on the '
  'service role.';

-- ---------------------------------------------------------------------------
-- 3. Deciding, with attribution, in one transaction.
-- ---------------------------------------------------------------------------
--
-- A thin wrapper over 0087's functions rather than a reimplementation. The
-- flag flip, the guard bypass and the status change all stay where 0087 put
-- them; this only adds the reviewer's email and makes the two writes atomic.
-- Doing it as two calls from the API would allow an approval that lands with
-- nobody's name on it if the second call fails.
CREATE OR REPLACE FUNCTION public.review_role_application(
  p_id             uuid,
  p_decision       text,
  p_reviewer_email text,
  p_note           text DEFAULT NULL
)
RETURNS public.role_applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row public.role_applications;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'A decision is either approved or rejected, not %', p_decision;
  END IF;

  IF COALESCE(btrim(p_reviewer_email), '') = '' THEN
    RAISE EXCEPTION 'Every decision has to carry the reviewer''s email.';
  END IF;

  -- Rejecting somebody deserves a reason they can be told. Approving does
  -- not need one, because the outcome speaks for itself.
  IF p_decision = 'rejected' AND COALESCE(btrim(p_note), '') = '' THEN
    RAISE EXCEPTION 'Say why it is being turned down.';
  END IF;

  IF p_decision = 'approved' THEN
    PERFORM public.approve_role_application(p_id, NULL, p_note);
  ELSE
    PERFORM public.reject_role_application(p_id, NULL, p_note);
  END IF;

  UPDATE public.role_applications
     SET reviewer_email = btrim(p_reviewer_email)
   WHERE id = p_id
  RETURNING * INTO v_row;

  RETURN v_row;
END $fn$;

REVOKE ALL ON FUNCTION
  public.review_role_application(uuid, text, text, text)
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.review_role_application(uuid, text, text, text) IS
  'Approve or reject an application and record who did it, atomically. Wraps '
  '0087 rather than repeating it.';

-- ---------------------------------------------------------------------------
-- 4. Taking a role back.
-- ---------------------------------------------------------------------------
--
-- WHY THIS HAS TO EXIST. 0087 gives the person resign_role() and the admin
-- approve_role_application(), and nothing in between. An agent who takes
-- money and does not deliver can currently only be stopped by asking them
-- nicely to resign -- guard_role_flags() refuses a direct UPDATE, correctly,
-- and there is no other door.
--
-- This is that door, and it is deliberately narrow: it demands a reason, it
-- records who turned it off, and it goes in the same audit trail as an
-- approval. Revocation without a name against it is the thing 0087 was
-- written to stop, and it would be no better here.
CREATE OR REPLACE FUNCTION public.revoke_role(
  p_user_id        uuid,
  p_kind           text,
  p_reviewer_email text,
  p_reason         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_kind NOT IN ('delivery_agent', 'transport_vendor') THEN
    RAISE EXCEPTION 'Unknown role: %', p_kind;
  END IF;
  IF COALESCE(btrim(p_reason), '') = '' THEN
    RAISE EXCEPTION 'Say why this role is being taken away.';
  END IF;
  IF COALESCE(btrim(p_reviewer_email), '') = '' THEN
    RAISE EXCEPTION 'Every revocation has to carry the reviewer''s email.';
  END IF;

  -- Same guarded path an approval uses, scoped to this transaction.
  PERFORM set_config('app.role_grant', 'on', true);

  IF p_kind = 'delivery_agent' THEN
    UPDATE public.profiles
       SET is_delivery_agent = false,
           -- Off the delivery sheet immediately. Leaving them listed but
           -- unable to accept is how a customer places an order that can
           -- never be taken.
           is_available_for_delivery = false
     WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
       SET is_transport_vendor = false
     WHERE id = p_user_id;
  END IF;

  PERFORM set_config('app.role_grant', 'off', true);

  -- Recorded as a decided application, so the person's history reads in one
  -- place: applied, approved, revoked, with a reason at each step.
  INSERT INTO public.role_applications
    (user_id, kind, address, note, status, review_note, reviewer_email,
     reviewed_at)
  VALUES
    (p_user_id, p_kind, '—',
     'Role revoked by an administrator.', 'rejected',
     btrim(p_reason), btrim(p_reviewer_email), now());
END $fn$;

REVOKE ALL ON FUNCTION public.revoke_role(uuid, text, text, text)
  FROM anon, authenticated, public;

COMMENT ON FUNCTION public.revoke_role(uuid, text, text, text) IS
  'Take a delivery-agent or transport-vendor role back. Demands a reason and '
  'records who did it; goes through the same guarded path as an approval.';

NOTIFY pgrst, 'reload schema';
