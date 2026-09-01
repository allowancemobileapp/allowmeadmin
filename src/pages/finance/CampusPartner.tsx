import React, { useState, useEffect, useCallback } from 'react';
import { Card, Field, Note, Empty, Th, Td, inputCls, btnCls, btnGhost } from './ui';
import { Receipt, RotateCcw, Undo2, Users, X, ExternalLink } from 'lucide-react';

const naira = (n: number) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * What state an agreement is in, said plainly.
 *
 * Four, not two. "Ended" used to cover three different situations â€” hasn't
 * started, ran its course, switched off by hand â€” and the action you want is
 * different in each.
 */
export function StatusPill({ status, endsOn }: any) {
  const map: Record<string, [string, string]> = {
    active:  ['Running',  'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'],
    pending: ['Not started yet', 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400'],
    lapsed:  ['Ran out',  'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'],
    ended:   ['Ended',    'bg-slate-100 dark:bg-slate-800 text-slate-500'],
  };
  const [label, cls] = map[status] || map.ended;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${cls}`}>
      {label}
      {status === 'lapsed' && endsOn && ` ${day(endsOn)}`}
    </span>
  );
}

/**
 * Paying a partner.
 *
 * THE WARNING ON THIS FORM IS NOT DECORATION. Clause 7.1(b) deducts a third
 * party's share of transaction proceeds from Monthly Gross Profit, so
 * recording this payment reduces gross profit and can move somebody's salary
 * band. That is the correct treatment, and it should not be a surprise.
 */
export function PayPartnerModal({ partner, period, post, onClose, onDone }: any) {
  const [amount, setAmount] = useState(
    String(Math.round(partner.outstanding || partner.earned_this_period || 0)));
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [method, setMethod] = useState('Bank transfer');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post(`/api/live/schools/partners/${partner.id}/pay`, {
        period_from: from, period_to: to,
        amount: Number(amount), method, reference,
      });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Pay ${partner.person_name || partner.body_name}`} onClose={onClose}>
      <Note tone="amber" title="This reduces gross profit.">
        A campus share is a third party&rsquo;s cut of transaction proceeds, so
        the contract deducts it from Monthly Gross Profit. Recording this
        payment lowers that figure &mdash; which can lower the salary band for
        the month it lands in. It is the correct treatment; it is just worth
        knowing before you press it.
      </Note>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Period from">
          <input type="date" className={inputCls} value={from}
                 onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Period to">
          <input type="date" className={inputCls} value={to}
                 onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Amount paid (₦)"
               hint={`Outstanding on this agreement: ${naira(partner.outstanding)}`}>
          <input type="number" className={inputCls} value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="How">
          <select className={inputCls} value={method}
                  onChange={(e) => setMethod(e.target.value)}>
            <option>Bank transfer</option>
            <option>Cash</option>
            <option>Paystack</option>
            <option>Other</option>
          </select>
        </Field>
      </div>

      <Field label="Reference" hint="A transfer reference, so this can be traced later.">
        <input className={inputCls} value={reference}
               onChange={(e) => setReference(e.target.value)} />
      </Field>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <button onClick={save} disabled={busy || !amount} className={btnCls}>
        {busy ? 'Recording…' : `Record ${naira(Number(amount))} paid`}
      </button>
    </Modal>
  );
}

/** Extending a tenure, rather than starting a new agreement. */
export function RenewModal({ partner, post, onClose, onDone }: any) {
  const [endsOn, setEndsOn] = useState('');
  const [percent, setPercent] = useState(String(partner.percent));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post(`/api/live/schools/partners/${partner.id}/renew`,
        { ends_on: endsOn, percent: Number(percent) });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={`Renew ${partner.person_name || partner.body_name}`} onClose={onClose}>
      <Note tone="slate">
        This extends the same agreement, so everything already paid stays
        attached to it. A new tenure on different terms is better added as a
        separate agreement.
      </Note>

      <Field label="New end date" hint="When the renewed tenure finishes.">
        <input type="date" className={inputCls} value={endsOn}
               onChange={(e) => setEndsOn(e.target.value)} />
      </Field>

      <Field label="Cut (%)"
             hint="The standard offer doubles to 15% past 1,000 referrals.">
        <input type="number" step="0.5" className={inputCls} value={percent}
               onChange={(e) => setPercent(e.target.value)} />
      </Field>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <button onClick={save} disabled={busy || !endsOn} className={btnCls}>
        {busy ? 'Renewing…' : 'Renew'}
      </button>
    </Modal>
  );
}

/**
 * Every payment behind a campus total.
 *
 * The card says "₦25,400 collected", which is a number somebody is asked to
 * take on trust. This is the evidence for it: who paid, how much, when, and
 * how much of it the company actually kept.
 */
export function BreakdownModal({ school, period, get, onClose }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = school.school_id ?? 'null';
    get(`/api/live/schools/${id}/breakdown?period=custom&from=${period.from}&to=${period.to}`)
      .then((d: any) => setRows(d.payments || []))
      .catch((e: any) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [school.school_id, period.from, period.to]);

  const total = rows.reduce((a, r) => a + r.amount, 0);
  const kept = rows.reduce((a, r) => a + r.company_share, 0);

  return (
    <Modal title={`${school.school_name} — every payment`} onClose={onClose} wide>
      <p className="text-xs text-slate-500">
        {period.from} to {period.to} · {rows.length} payment
        {rows.length === 1 ? '' : 's'} · {naira(total)} collected ·{' '}
        {naira(kept)} kept
      </p>

      {err && <Note tone="rose">{err}</Note>}
      {loading ? <Empty>Loading…</Empty> : rows.length === 0 ? (
        <Empty>Nothing came in from this campus in that period.</Empty>
      ) : (
        <div className="overflow-x-auto max-h-[55vh] overflow-y-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
              <tr>
                <Th>When</Th><Th>Who paid</Th><Th>What for</Th>
                <Th right>Paid</Th><Th right>Company keeps</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((r, i) => (
                <tr key={i}>
                  <Td className="text-xs text-slate-500 whitespace-nowrap">
                    {new Date(r.received_at).toLocaleDateString('en-NG',
                      { day: 'numeric', month: 'short' })}
                  </Td>
                  <Td>
                    <p className="text-sm text-slate-800 dark:text-slate-200">
                      {r.payer_username
                        ? `@${r.payer_username}`
                        : r.payer_name || 'Unknown'}
                    </p>
                  </Td>
                  <Td className="text-xs text-slate-500">{r.stream}</Td>
                  <Td right mono>{naira(r.amount)}</Td>
                  <Td right mono className={
                    r.company_share < r.amount
                      ? 'text-amber-600 dark:text-amber-500' : ''}>
                    {naira(r.company_share)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Note tone="slate">
        &ldquo;Company keeps&rdquo; is less than &ldquo;paid&rdquo; where a
        third party takes a share &mdash; a ticket carries a flat ₦500 fee and
        the rest belongs to the organiser. A campus cut is calculated on what
        the company keeps, not on the face value.
      </Note>
    </Modal>
  );
}

/** What has actually been paid to one partner. */
export function PayoutHistory({ partner, get }: any) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    get(`/api/live/schools/partners/${partner.id}/payouts`)
      .then(setData).catch(() => setData({ payouts: [] }));
  }, [partner.id]);

  if (!data) return null;
  if (!data.payouts?.length) {
    return (
      <p className="text-xs text-slate-500 px-4 py-3">
        Nothing paid yet.{' '}
        {partner.outstanding > 0 && (
          <span className="text-amber-600 font-medium">
            {naira(partner.outstanding)} outstanding.
          </span>
        )}
      </p>
    );
  }

  return (
    <div className="px-4 py-3 space-y-1">
      {data.payouts.map((p: any) => (
        <div key={p.id} className="flex items-center gap-3 text-xs">
          <Receipt className="w-3 h-3 text-emerald-500 shrink-0" />
          <span className="text-slate-600 dark:text-slate-400">
            {day(p.paid_on)} · {p.period_from} to {p.period_to}
            {p.reference && ` · ${p.reference}`}
          </span>
          <span className="ml-auto font-mono font-bold">{naira(p.amount)}</span>
        </div>
      ))}
      {partner.outstanding > 0 && (
        <p className="text-xs text-amber-600 font-medium pt-1">
          {naira(partner.outstanding)} still outstanding.
        </p>
      )}
    </div>
  );
}

function Modal({ title, children, onClose, wide }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
         onClick={onClose}>
      <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full my-8 ${
             wide ? 'max-w-3xl' : 'max-w-lg'}`}
           onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          <button onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
