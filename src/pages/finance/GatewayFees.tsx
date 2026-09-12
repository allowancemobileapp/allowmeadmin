import React, { useState, useEffect, useCallback } from 'react';
import { Card, Field, Note, Th, Td, inputCls, btnCls, btnGhost, fmtKobo, fmtNaira } from './ui';
import { CreditCard, AlertTriangle, RefreshCw } from 'lucide-react';

const month = (d: string) =>
  new Date(d).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' });

/**
 * What the payment gateway keeps.
 *
 * WHY THIS EXISTS. company_income records what the customer was charged; the
 * bank receives what Paystack settles, which is less. Nothing held the
 * difference, so the app's figure could never reconcile to a statement -- it
 * was always high by the processor's cut and nobody could say by how much.
 *
 * Payment processing is one of the four deductible categories, so this is not
 * presentation: the fee reduces Monthly Gross Profit, which sets the salary
 * band. Leaving it out overstates profit and overpays.
 *
 * THE RATE IS SHOWN, NOT HIDDEN, because it is Paystack's PUBLISHED pricing
 * rather than this company's contract. Negotiated rates are common. The only
 * person who can check it is the one holding the dashboard, so the figure and
 * the assumption behind it sit on the same screen.
 */
export function GatewayFees({ get, post, put, role }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await get('/api/finance/gateway-fees')); }
    catch (e: any) { setErr(e.message); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <Note tone="rose" title="Could not read gateway fees.">
        {err}
      </Note>
    );
  }
  if (!data) return null;

  const paystack = data.schedule?.find((s: any) => s.gateway === 'paystack');
  const totals = (data.months || []).reduce(
    (a: any, m: any) => ({
      charged: a.charged + m.charged_kobo,
      fee: a.fee + m.fee_kobo,
      net: a.net + m.net_to_bank_kobo,
      n: a.n + m.transactions,
    }), { charged: 0, fee: 0, net: 0, n: 0 });

  const startEdit = () => {
    setForm({
      gateway: 'paystack',
      percent: String(paystack?.percent ?? 1.5),
      flat_naira: String((paystack?.flat_kobo ?? 0) / 100),
      waive_below_naira: String((paystack?.flat_waived_below_kobo ?? 0) / 100),
      cap_naira: paystack?.cap_kobo === null ? '' : String((paystack?.cap_kobo ?? 0) / 100),
    });
    setEditing(true);
  };

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      const r = await put('/api/finance/gateway-fees', {
        gateway: form.gateway,
        percent: Number(form.percent),
        flat_kobo: Math.round(Number(form.flat_naira) * 100),
        flat_waived_below_kobo: Math.round(Number(form.waive_below_naira) * 100),
        cap_kobo: form.cap_naira === '' ? null : Math.round(Number(form.cap_naira) * 100),
      });
      setMsg(`Rate saved. ${r.months_recalculated} month(s) recalculated.`);
      setEditing(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-slate-400" />
            What the gateway keeps
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Charged to the card, less the processor&rsquo;s cut, equals what
            should reach the bank. The fee is posted as a deductible expense.
          </p>
        </div>
        {role === 'founder' && (
          <button onClick={editing ? () => setEditing(false) : startEdit}
                  className={btnGhost}>
            {editing ? 'Cancel' : 'Correct the rate'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <Note tone="amber" title="This rate is an assumption, not your contract.">
          {paystack
            ? <>Calculated at <strong>{paystack.percent}%
                {paystack.flat_kobo > 0 && <> + {fmtKobo(paystack.flat_kobo)}</>}</strong>
                {paystack.flat_waived_below_kobo > 0 && <>, the flat part waived
                  below {fmtKobo(paystack.flat_waived_below_kobo)}</>}
                {paystack.cap_kobo && <>, capped at {fmtKobo(paystack.cap_kobo)}</>}.
                {' '}That is Paystack&rsquo;s published Nigerian pricing. If you
                negotiated a different rate, correct it here and every month
                recalculates.</>
            : 'No rate configured.'}
          <br /><br />
          <strong>A second assumption worth knowing:</strong> the app tries
          Flutterwave first and falls back to Paystack, and which one handled a
          given transaction is not recorded anywhere. Every row here is priced
          as Paystack. That gap is a bigger source of error than the rate
          itself, and it needs a gateway column on the payment tables to close.
        </Note>

        {editing && form && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Percentage" hint="1.5 means 1.5%, as the pricing page writes it.">
                <input type="number" step="0.01" className={inputCls}
                       value={form.percent}
                       onChange={(e) => setForm({ ...form, percent: e.target.value })} />
              </Field>
              <Field label="Flat fee (₦)" hint="Paystack adds ₦100 above a threshold.">
                <input type="number" step="1" className={inputCls}
                       value={form.flat_naira}
                       onChange={(e) => setForm({ ...form, flat_naira: e.target.value })} />
              </Field>
              <Field label="Flat waived below (₦)"
                     hint="₦2,500 for Paystack. Why a ₦700 sub costs ₦10.50, not ₦110.50.">
                <input type="number" step="1" className={inputCls}
                       value={form.waive_below_naira}
                       onChange={(e) => setForm({ ...form, waive_below_naira: e.target.value })} />
              </Field>
              <Field label="Fee cap (₦)" hint="Blank for no cap.">
                <input type="number" step="1" className={inputCls}
                       value={form.cap_naira}
                       onChange={(e) => setForm({ ...form, cap_naira: e.target.value })} />
              </Field>
            </div>
            <button onClick={save} disabled={busy} className={btnCls}>
              <RefreshCw className={`w-4 h-4 inline mr-1.5 -mt-0.5 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Recalculating…' : 'Save and recalculate every month'}
            </button>
          </div>
        )}

        {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Figure label="Charged to cards" value={fmtKobo(totals.charged)}
                  sub={`${totals.n} transactions`} />
          <Figure label="Gateway kept" value={fmtKobo(totals.fee)} tone="rose"
                  sub={totals.charged > 0
                    ? `${(totals.fee / totals.charged * 100).toFixed(2)}% effective`
                    : undefined} />
          <Figure label="Should reach the bank" value={fmtKobo(totals.net)}
                  tone="emerald" sub="check this against a statement" />
        </div>

        {data.posted_rows > 0 && (
          <p className="text-xs text-slate-500">
            {fmtNaira(data.posted_naira)} posted across {data.posted_rows} monthly
            expense {data.posted_rows === 1 ? 'entry' : 'entries'} under
            payment processing — which is deductible, so it reduces gross
            profit and therefore the salary pool.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <Th>Month</Th><Th right>Txns</Th><Th right>Charged</Th>
                <Th right>Fee</Th><Th right>To bank</Th><Th right>Rate</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(data.months || []).map((m: any) => (
                <tr key={m.month}>
                  <Td className="text-xs whitespace-nowrap">{month(m.month)}</Td>
                  <Td right mono className="text-xs text-slate-500">{m.transactions}</Td>
                  <Td right mono>{fmtKobo(m.charged_kobo)}</Td>
                  <Td right mono className="text-rose-600">{fmtKobo(m.fee_kobo)}</Td>
                  <Td right mono bold className="text-emerald-600">
                    {fmtKobo(m.net_to_bank_kobo)}
                  </Td>
                  <Td right mono className="text-xs text-slate-400">
                    {m.effective_pct}%
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(data.months || []).some((m: any) => m.effective_pct > 2) && (
          <p className="text-xs text-slate-500 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            A month above 2% is the flat fee biting: it applies once per
            transaction, so a few large payments cost proportionally more than
            many small ones.
          </p>
        )}
      </div>
    </Card>
  );
}

function Figure({ label, value, sub, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    slate: 'text-slate-800 dark:text-slate-100',
    rose: 'text-rose-600 dark:text-rose-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
  };
  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-mono font-bold mt-1 ${tones[tone] || tones.slate}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );
}
