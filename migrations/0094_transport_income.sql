-- 0094: the company was earning money from rides and not counting it.
--
-- FOUND AGAINST THE LIVE DATABASE, not by reading code. company_income lists
-- six streams; the app shipped a seventh in its 0083-0085 (transport vendors,
-- rides, bookings and the Allowance fee on them) and nothing here was ever
-- told. Three trips have been confirmed travelled and N2,000 of fees earned,
-- and every figure built on company_income has been reporting N0 for it.
--
-- WHY THAT IS WORSE THAN A MISSING NUMBER ON A SCREEN. month_collections_kobo()
-- reads company_income, gross profit reads that, and the salary band reads
-- gross profit. Revenue the view cannot see does not merely go unreported --
-- it fails to count towards what four people are paid. Against N40,900 of
-- counted income, N2,000 is a five per cent understatement of the pool.
--
-- WHAT IS DELIBERATELY NOT COUNTED
--
--   * `booked` bookings (N2,600 today). 0084 freezes the fee at booking and
--     0085 makes it OWED only when the trip is confirmed travelled. Money
--     that might still be cancelled is not revenue.
--   * `rejected` bookings (N500). Never happened.
--
-- That matches how delivery is already treated: `agent_completed` orders are
-- excluded because the app's 0065 makes completion mutual -- the agent saying
-- they delivered is not the customer saying they received it. I checked
-- whether that exclusion was a bug too. It is not; it is the same rule,
-- correctly applied, and one order worth N200 is right to be sitting outside.

-- ---------------------------------------------------------------------------
-- 1. The fee is already our cut, so no third-party share comes off it.
-- ---------------------------------------------------------------------------
--
-- The distinction that matters. A ticket's amount_paid is the whole face
-- value and the organiser owns most of it, so Event tickets carries a flat
-- N500 technology fee and the balance is deducted. transport_bookings
-- .allowance_fee is NOT the fare -- the N45,000-N70,000 seat price belongs to
-- the vendor and never reaches the company. The fee column already holds only
-- our ~1%, exactly like delivery_orders.allowance_fee.
--
-- Registering it as `all` says that in the one place the calculation looks,
-- and stops a future reader assuming a split was forgotten.
INSERT INTO public.platform_fees (stream, basis, effective_from, note)
SELECT 'Transport bookings', 'all', '2020-01-01',
       'allowance_fee already holds only the company cut (~1% of the fare). '
       'The seat price belongs to the vendor and never reaches the company.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_fees WHERE stream = 'Transport bookings');

-- ---------------------------------------------------------------------------
-- 2. The stream itself.
-- ---------------------------------------------------------------------------
--
-- Reproduced in full because CREATE OR REPLACE VIEW replaces the whole body.
-- The six existing branches are what was actually live -- read back with
-- pg_get_viewdef rather than retyped from memory, so this cannot quietly
-- change one of them while adding the seventh.
CREATE OR REPLACE VIEW public.company_income AS
SELECT 'Plus subscriptions'::text AS stream,
    mp.id::text AS source_id,
    (mp.amount / 100.0)::numeric(18,2) AS amount,
    mp.created_at AS received_at,
    mp.user_id AS payer,
    mp.payment_reference AS reference
   FROM membership_payments mp
  WHERE mp.amount > 0::numeric
UNION ALL
 SELECT 'Gist adverts'::text AS stream,
    g.id::text AS source_id,
    COALESCE(NULLIF(g.amount_paid, 0)::numeric, g.total_price, 0::numeric)::numeric(18,2) AS amount,
    g.created_at AS received_at,
    g.user_id::text AS payer,
    g.payment_reference AS reference
   FROM gists g
  WHERE (g.amount_paid > 0 OR g.paid = true) AND (g.payment_reference IS NULL OR g.payment_reference !~~* 'coupon%'::text)
UNION ALL
 SELECT 'Event tickets'::text AS stream,
    tp.id::text AS source_id,
    tp.amount_paid::numeric(18,2) AS amount,
    tp.created_at AS received_at,
    tp.user_id::text AS payer,
    tp.payment_reference AS reference
   FROM ticket_purchases tp
  WHERE tp.amount_paid > 0 AND COALESCE(tp.status, 'success'::text) <> 'failed'::text
UNION ALL
 SELECT 'Premium groups'::text AS stream,
    gpp.id::text AS source_id,
    gpp.amount::numeric(18,2) AS amount,
    gpp.created_at AS received_at,
    gpp.user_id::text AS payer,
    gpp.payment_reference AS reference
   FROM group_premium_payments gpp
  WHERE gpp.amount > 0::numeric
UNION ALL
 SELECT 'Store subscriptions'::text AS stream,
    ssp.id::text AS source_id,
    (ssp.amount_minor::numeric / 100.0)::numeric(18,2) AS amount,
    ssp.created_at AS received_at,
    ssp.paid_by::text AS payer,
    ssp.reference
   FROM store_subscription_payments ssp
  WHERE ssp.amount_minor > 0
UNION ALL
 SELECT 'Delivery commission'::text AS stream,
    do2.id::text AS source_id,
    do2.allowance_fee::numeric(18,2) AS amount,
    do2.completed_at AS received_at,
    do2.agent_id::text AS payer,
    NULL::text AS reference
   FROM delivery_orders do2
  WHERE do2.status = 'completed'::text AND do2.allowance_fee > 0::numeric AND do2.completed_at IS NOT NULL
UNION ALL
 SELECT 'Transport bookings'::text AS stream,
    tb.id::text AS source_id,
    tb.allowance_fee::numeric(18,2) AS amount,
    tb.travelled_at AS received_at,
    tb.passenger_id::text AS payer,
    NULL::text AS reference
   FROM transport_bookings tb
  WHERE tb.status = 'travelled'::text
    AND tb.allowance_fee > 0::numeric
    AND tb.travelled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. The slug, so reports and manual entries can name it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.income_stream_slug(p_label text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $fn$
  SELECT CASE p_label
    WHEN 'Plus subscriptions'   THEN 'plus_subscriptions'
    WHEN 'Gist adverts'         THEN 'gist_adverts'
    WHEN 'Event tickets'        THEN 'event_tickets'
    WHEN 'Premium groups'       THEN 'premium_groups'
    WHEN 'Store subscriptions'  THEN 'store_subscriptions'
    WHEN 'Delivery commission'  THEN 'delivery_commission'
    WHEN 'Transport bookings'   THEN 'transport_bookings'
    ELSE 'other'
  END;
$fn$;

-- revenue_entries is for money that did NOT come through the app, and its
-- CHECK is the list of things that may be typed by hand. Transport belongs on
-- it for the same reason the others do: an off-platform charter that never
-- created a booking row still has to be recordable.
ALTER TABLE public.revenue_entries
  DROP CONSTRAINT IF EXISTS revenue_entries_stream_check;
ALTER TABLE public.revenue_entries
  ADD CONSTRAINT revenue_entries_stream_check
  CHECK (stream = ANY (ARRAY[
    'plus_subscriptions','gist_adverts','event_tickets','premium_groups',
    'store_subscriptions','delivery_commission','transport_bookings',
    'marketplace_commission','fantasy','sponsorship','other']));

NOTIFY pgrst, 'reload schema';
