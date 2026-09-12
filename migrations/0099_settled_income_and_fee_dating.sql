-- 0099: money owed is not money received.
--
-- TWO THINGS WRONG, BOTH FOUND BY LOOKING AT THE SCREEN RATHER THAN THE CODE.
--
-- ONE. Transport and delivery income was recognised when the job finished,
-- not when the company was paid. allowance_fee is a DEBT the agent or vendor
-- owes; settle_agent_fees() and settle_transport_vendor_fees() are what turn
-- it into cash, and they stamp fee_settled_at when they do.
--
-- Right now every transport fee is unsettled -- six travelled rides, N4,600,
-- not one paid -- and all of it was being reported as income. Delivery was
-- counting N300 of which only N250 has actually been collected. The books
-- were claiming money that is still sitting with the vendors.
--
-- This is the same distinction 0096 drew for subscriptions: a tier change is
-- not a payment, and a completed ride is not a settlement. Both times the
-- schema recorded the EVENT and the books read it as CASH.
--
-- TWO. post_gateway_fees() dated each monthly fee at the last day of the
-- month. For a month in progress that is a date in the future -- September's
-- N31.50 was stamped 30 September while today is the 12th -- so it fell
-- outside every reporting period that ends today and was invisible on the
-- dashboard. The fee was posted correctly and then hidden by its own date.
--
-- WHAT THIS COSTS. Recognised income drops by the N4,600 of transport and the
-- N50 of unsettled delivery. That is not revenue lost; it is revenue not yet
-- received, and it reappears the moment a vendor settles. A receivables view
-- is added below so it is visible while it waits rather than simply absent.

-- ---------------------------------------------------------------------------
-- 1. Income when the money arrives.
-- ---------------------------------------------------------------------------
--
-- Only the last two branches change: received_at becomes fee_settled_at, and
-- the filter requires it. Everything above is byte-for-byte what 0096 left.
CREATE OR REPLACE VIEW public.company_income AS
 SELECT 'Plus subscriptions'::text AS stream,
    mp.id::text AS source_id,
    (mp.amount / 100.0)::numeric(18,2) AS amount,
    mp.created_at AS received_at,
    mp.user_id::text AS payer,
    mp.payment_reference AS reference
   FROM membership_payments mp
  WHERE mp.amount > 0::numeric
    AND mp.verification = 'gateway'
UNION ALL
 SELECT 'Gist adverts'::text AS stream,
    g.id::text AS source_id,
    COALESCE(NULLIF(g.amount_paid, 0)::numeric, g.total_price, 0::numeric)::numeric(18,2) AS amount,
    g.created_at AS received_at,
    g.user_id::text AS payer,
    g.payment_reference AS reference
   FROM gists g
  WHERE (g.amount_paid > 0 OR g.paid = true)
    AND (g.payment_reference IS NULL OR g.payment_reference !~~* 'coupon%'::text)
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
 -- WHEN THE AGENT PAID, not when the food arrived. completed_at is the
 -- delivery; fee_settled_at is the money.
 SELECT 'Delivery commission'::text AS stream,
    do2.id::text AS source_id,
    do2.allowance_fee::numeric(18,2) AS amount,
    do2.fee_settled_at AS received_at,
    do2.agent_id::text AS payer,
    do2.closed_reason AS reference
   FROM delivery_orders do2
  WHERE do2.allowance_fee > 0::numeric
    AND do2.fee_settled_at IS NOT NULL
UNION ALL
 SELECT 'Transport bookings'::text AS stream,
    tb.id::text AS source_id,
    tb.allowance_fee::numeric(18,2) AS amount,
    tb.fee_settled_at AS received_at,
    tb.vendor_id::text AS payer,
    NULL::text AS reference
   FROM transport_bookings tb
  WHERE tb.allowance_fee > 0::numeric
    AND tb.fee_settled_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. What is owed but not yet paid.
-- ---------------------------------------------------------------------------
--
-- Excluded from income is not the same as forgotten. This is a receivable --
-- real money the company is entitled to -- and it should be chased, not
-- silently dropped because it failed an accounting test.
CREATE OR REPLACE VIEW public.fees_receivable AS
  SELECT 'Delivery'::text AS kind,
         do2.agent_id::text AS owed_by,
         p.username, p.full_name, p.phone_number,
         COUNT(*)::bigint AS jobs,
         SUM(do2.allowance_fee)::numeric AS owed,
         MIN(do2.completed_at) AS oldest_unsettled
  FROM public.delivery_orders do2
  LEFT JOIN public.profiles p ON p.id = do2.agent_id
  WHERE do2.allowance_fee > 0
    AND do2.fee_settled_at IS NULL
    AND do2.status = 'completed'
  GROUP BY do2.agent_id, p.username, p.full_name, p.phone_number
UNION ALL
  SELECT 'Transport',
         tb.vendor_id::text,
         p.username, p.full_name, p.phone_number,
         COUNT(*)::bigint,
         SUM(tb.allowance_fee)::numeric,
         MIN(tb.travelled_at)
  FROM public.transport_bookings tb
  LEFT JOIN public.profiles p ON p.id = tb.vendor_id
  WHERE tb.allowance_fee > 0
    AND tb.fee_settled_at IS NULL
    AND tb.status = 'travelled'
  GROUP BY tb.vendor_id, p.username, p.full_name, p.phone_number;

REVOKE ALL ON public.fees_receivable FROM anon, authenticated;

COMMENT ON VIEW public.fees_receivable IS
  'Fees earned and not yet collected. Not income until settled, but owed -- '
  'and the oldest date says how long it has been owed.';

-- ---------------------------------------------------------------------------
-- 3. The gateway fee on a settlement, charged once per settlement.
-- ---------------------------------------------------------------------------
--
-- WHY THESE ARE GROUPED AND THE OTHER STREAMS ARE NOT. settle_agent_fees()
-- clears every outstanding job for an agent in one transaction, stamping them
-- all with the same now(). That is ONE card payment covering many rides, so
-- the percentage and the flat fee apply once to the total -- not once per
-- ride. Charging per row would multiply the flat component by the number of
-- jobs and invent a cost that was never incurred.
CREATE OR REPLACE VIEW public.gateway_fees_due AS
  SELECT 'Plus subscriptions'::text AS stream,
         mp.id::text AS source_id,
         mp.created_at AS charged_at,
         mp.amount::bigint AS charged_kobo,
         public.gateway_fee_kobo(mp.amount::bigint, 'paystack',
                                 mp.created_at::date) AS fee_kobo
  FROM public.membership_payments mp
  WHERE mp.amount > 0 AND mp.verification = 'gateway'
UNION ALL
  SELECT 'Event tickets', tp.id::text, tp.created_at,
         (tp.amount_paid * 100)::bigint,
         public.gateway_fee_kobo((tp.amount_paid * 100)::bigint, 'paystack',
                                 tp.created_at::date)
  FROM public.ticket_purchases tp
  WHERE tp.amount_paid > 0
    AND COALESCE(tp.status, 'success') <> 'failed'
UNION ALL
  SELECT 'Premium groups', gpp.id::text, gpp.created_at,
         (gpp.amount * 100)::bigint,
         public.gateway_fee_kobo((gpp.amount * 100)::bigint, 'paystack',
                                 gpp.created_at::date)
  FROM public.group_premium_payments gpp
  WHERE gpp.amount > 0
UNION ALL
  SELECT 'Store subscriptions', ssp.id::text, ssp.created_at,
         ssp.amount_minor::bigint,
         public.gateway_fee_kobo(ssp.amount_minor::bigint, 'paystack',
                                 ssp.created_at::date)
  FROM public.store_subscription_payments ssp
  WHERE ssp.amount_minor > 0
UNION ALL
  SELECT 'Delivery settlements',
         do2.agent_id::text || '@' || do2.fee_settled_at::text,
         do2.fee_settled_at,
         (SUM(do2.allowance_fee) * 100)::bigint,
         public.gateway_fee_kobo((SUM(do2.allowance_fee) * 100)::bigint,
                                 'paystack', do2.fee_settled_at::date)
  FROM public.delivery_orders do2
  WHERE do2.allowance_fee > 0 AND do2.fee_settled_at IS NOT NULL
  GROUP BY do2.agent_id, do2.fee_settled_at
UNION ALL
  SELECT 'Transport settlements',
         tb.vendor_id::text || '@' || tb.fee_settled_at::text,
         tb.fee_settled_at,
         (SUM(tb.allowance_fee) * 100)::bigint,
         public.gateway_fee_kobo((SUM(tb.allowance_fee) * 100)::bigint,
                                 'paystack', tb.fee_settled_at::date)
  FROM public.transport_bookings tb
  WHERE tb.allowance_fee > 0 AND tb.fee_settled_at IS NOT NULL
  GROUP BY tb.vendor_id, tb.fee_settled_at;

REVOKE ALL ON public.gateway_fees_due FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Date the fee where it can actually be seen.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_gateway_fees(
  p_month date,
  p_actor text DEFAULT NULL
)
RETURNS TABLE (expense_id integer, transactions bigint, fee_naira numeric)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_on   date;
  v_fee  bigint;
  v_n    bigint;
  v_title text;
  v_id   integer;
BEGIN
  -- THE FIX. Month-end for a month that has finished, today for one still
  -- running. Stamping a fee 30 September while it is the 12th put it outside
  -- every period ending today, so a correctly posted expense was invisible.
  v_on := LEAST(v_to, current_date);
  IF v_on < v_from THEN v_on := v_from; END IF;

  SELECT COALESCE(SUM(fee_kobo), 0), COUNT(*)
    INTO v_fee, v_n
  FROM public.gateway_fees_due
  WHERE charged_at::date BETWEEN v_from AND v_to;

  v_title := format('Payment gateway fees — %s', to_char(v_from, 'Mon YYYY'));

  IF v_fee = 0 THEN
    DELETE FROM public.company_expenses
     WHERE title = v_title AND category = 'payment_processing';
    RETURN QUERY SELECT NULL::integer, 0::bigint, 0::numeric;
    RETURN;
  END IF;

  SELECT id INTO v_id FROM public.company_expenses
   WHERE title = v_title AND category = 'payment_processing'
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.company_expenses
      (title, reason, amount, expense_date, category, vendor, approved_by)
    VALUES (v_title, 'Payment processing',
            ROUND(v_fee / 100.0, 2), v_on, 'payment_processing', 'Paystack',
            p_actor)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.company_expenses
       SET amount = ROUND(v_fee / 100.0, 2),
           expense_date = v_on,
           approved_by = COALESCE(p_actor, approved_by)
     WHERE id = v_id;
  END IF;

  RETURN QUERY SELECT v_id, v_n, ROUND(v_fee / 100.0, 2);
END $fn$;

REVOKE ALL ON FUNCTION public.post_gateway_fees(date, text)
  FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A stale note, corrected.
-- ---------------------------------------------------------------------------
-- The free-user delivery fee is N350, not the N150 this said. Documentation
-- that contradicts the function it describes is worse than none.
UPDATE public.platform_fees
   SET note = 'allowance_fee already holds only the company cut: N350 free, '
              'N50 Plus. Recognised when the agent settles, not when the '
              'delivery completes.'
 WHERE stream = 'Delivery commission';

INSERT INTO public.platform_fees (stream, basis, effective_from, note)
SELECT 'Transport settlements', 'all', '2020-01-01',
       'Gateway cost of a vendor clearing their fee debt. One card payment '
       'covers many rides, so the fee applies to the settlement total.'
WHERE NOT EXISTS (SELECT 1 FROM public.platform_fees
                   WHERE stream = 'Transport settlements');

NOTIFY pgrst, 'reload schema';
