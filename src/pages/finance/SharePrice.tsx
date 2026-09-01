import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Stat, Field, Empty, Note, Th, Td, inputCls, btnCls, btnGhost,
  fmtNaira, shares as fmtShares,
} from './ui';
import { Tag, TrendingUp, TrendingDown, History, Landmark } from 'lucide-react';

const price = (n: number | null) =>
  n === null || n === undefined ? '—'
    : '₦' + Number(n).toLocaleString('en-NG',
        { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const day = (d: string) =>
  new Date(d).toLocaleDateString('en-NG',
    { day: 'numeric', month: 'short', year: 'numeric' });

const BASIS = [
  { id: 'last_round',
    label: 'A round priced it',
    hint: 'Money actually came in at this price. The strongest basis there is.' },
  { id: 'par_value',
    label: 'Par value',
    hint: 'The ₦10 nominal value. What was paid in, not a market price.' },
  { id: 'independent_valuation',
    label: 'An independent valuation',
    hint: 'Somebody outside the company put this number on it.' },
  { id: 'founder_estimate',
    label: 'The founder’s estimate',
    hint: 'An opinion. Honest, but it is not evidence of anything.' },
];

/**
 * Setting the share price.
 *
 * THE DIRECTION OF THE ARITHMETIC IS THE POINT. Nobody agrees a company
 * valuation; they agree a price per share. "N10 a share" is the sentence that
 * gets said in the room, and the valuation is what falls out of it once you
 * know how many shares exist. This page works that way round, and the
 * valuation underneath is computed rather than typed.
 *
 * That is not a style preference. A valuation typed two zeroes short is
 * indistinguishable from a real one, and it happened -- migration 0088 exists
 * to undo a N100,000 entry that showed the founder's 80% as N80,000 against
 * N8,000,000 actually paid in. A price of N0.10 a share, by contrast, is
 * obviously wrong the moment it is typed, and the database refuses it outright
 * for being below par.
 */
export function SharePrice({ get, post, role, onDone }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await get('/api/finance/share-price')); }
    catch (e: any) { setErr(e.message); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <Note tone="rose" title="Could not read the share price.">
        {err}
        <br />
        If this mentions a missing function, run
        migrations/0089_share_price.sql.
      </Note>
    );
  }
  if (!data) return <Empty>Loading…</Empty>;

  const isFounder = role === 'founder';
  const par = Number(data.par_value || 0);
  const current = data.price_per_share;
  const belowPar = current !== null && par > 0 && current < par;
  const abovePar = current !== null && par > 0 && current > par;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Price per share" value={price(current)} icon={Tag}
              tone={abovePar ? 'green' : 'slate'}
              sub={current === null ? 'never set'
                   : abovePar ? `${(current / par).toFixed(1)}× par`
                   : belowPar ? 'below par value' : 'at par value'} />
        <Stat label="That values the company at"
              value={fmtNaira(data.company_value)} icon={TrendingUp}
              sub={`${fmtShares(data.shares_issued)} shares in issue`} />
        <Stat label="Share capital" value={fmtNaira(data.share_capital)}
              icon={Landmark} sub={`${price(par)} par value per share`} />
      </div>

      {belowPar && (
        <Note tone="rose" title="This price is below par value.">
          Shares cannot be issued at a discount to their {price(par)} nominal
          value, so a price under that describes something the company is not
          permitted to do. It is worth checking whether it was meant.
        </Note>
      )}

      {current === null && (
        <Note tone="amber" title="No share price has ever been set.">
          Until one is, the pages that show what a stake is worth have nothing
          to divide by, and they will fall back to par value &mdash; which is
          what was paid in, not a market price.
        </Note>
      )}

      <div className="flex items-center gap-2">
        {isFounder && (
          <button onClick={() => setEditing(!editing)} className={btnCls}>
            {editing ? 'Cancel' : current === null ? 'Set the share price'
                                                   : 'Update the share price'}
          </button>
        )}
        <button onClick={() => setShowHistory(!showHistory)} className={btnGhost}>
          <History className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
          {showHistory ? 'Hide' : 'Every price it has been'}
        </button>
      </div>

      {editing && (
        <SetPriceForm data={data} post={post}
                      onDone={() => {
                        setEditing(false);
                        load();
                        onDone?.();
                      }} />
      )}

      {showHistory && <PriceHistory rows={data.history} par={par} />}
    </div>
  );
}

function SetPriceForm({ data, post, onDone }: any) {
  const [form, setForm] = useState({
    price_per_share: data.price_per_share ? String(data.price_per_share)
                                          : String(data.par_value || '10'),
    basis: 'last_round',
    valued_on: new Date().toISOString().slice(0, 10),
    note: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const typed = Number(form.price_per_share);
  const par = Number(data.par_value || 0);
  const valid = Number.isFinite(typed) && typed > 0;
  // The valuation this price implies, shown live. Nobody should press a
  // button that moves every shareholder's number without seeing what it
  // becomes first.
  const implied = valid ? typed * data.shares_issued : 0;
  const wasWorth = data.company_value || 0;
  const belowPar = valid && par > 0 && typed < par;
  const chosen = BASIS.find((b) => b.id === form.basis);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post('/api/finance/share-price', {
        price_per_share: typed,
        basis: form.basis,
        valued_on: form.valued_on,
        note: form.note || null,
      });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field label="Price per share (₦)"
               hint={`Nominal value is ${price(par)}.`}>
          <input type="number" step="0.01" min="0" className={inputCls}
                 value={form.price_per_share}
                 onChange={(e) => set('price_per_share', e.target.value)} />
        </Field>
        <Field label="As at"
               hint="Divided by the shares that existed on this date.">
          <input type="date" className={inputCls} value={form.valued_on}
                 onChange={(e) => set('valued_on', e.target.value)} />
        </Field>
        <Field label="Where the price comes from" hint={chosen?.hint}>
          <select className={inputCls} value={form.basis}
                  onChange={(e) => set('basis', e.target.value)}>
            {BASIS.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Note"
             hint={belowPar
               ? 'Required — this price is below par value, so it needs a reason.'
               : 'Optional. What was agreed, and with whom.'}>
        <input className={inputCls} value={form.note}
               onChange={(e) => set('note', e.target.value)} />
      </Field>

      {/* The consequence, before the button. */}
      {valid && data.shares_issued > 0 && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            {price(typed)} × {fmtShares(data.shares_issued)} shares
          </p>
          <p className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100 mt-1">
            {fmtNaira(implied)}
          </p>
          {wasWorth > 0 && Math.abs(implied - wasWorth) > 0.5 && (
            <p className={`text-xs font-bold mt-1 flex items-center gap-1 ${
              implied > wasWorth ? 'text-emerald-600' : 'text-rose-600'}`}>
              {implied > wasWorth
                ? <TrendingUp className="w-3 h-3" />
                : <TrendingDown className="w-3 h-3" />}
              {implied > wasWorth ? 'Up' : 'Down'} from {fmtNaira(wasWorth)}
              &mdash; every shareholder&rsquo;s figure moves by{' '}
              {((implied / wasWorth - 1) * 100).toFixed(1)}%.
            </p>
          )}
        </div>
      )}

      {form.basis === 'founder_estimate' && (
        <Note tone="amber" title="This will be labelled as an estimate.">
          Every page that shows a naira figure to a shareholder prints the
          basis next to it, so this one will say it is your opinion rather than
          a price anybody paid. That is deliberate, and it is the honest label
          when no round has happened.
        </Note>
      )}

      {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}

      <button onClick={save} disabled={busy || !valid} className={btnCls}>
        {busy ? 'Recording…' : `Set the price at ${price(typed)} a share`}
      </button>
    </Card>
  );
}

/**
 * Every price it has ever been.
 *
 * Kept rather than overwritten, because a shareholder is entitled to ask what
 * their stake was worth in March and on what basis -- and because a correction
 * that quietly erased the figure it corrected would be worth nothing as a
 * record.
 */
function PriceHistory({ rows, par }: any) {
  if (!rows?.length) return <Empty>No valuations recorded.</Empty>;

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <Th>As at</Th><Th right>Per share</Th><Th right>Shares then</Th>
              <Th right>Company value</Th><Th>Basis</Th><Th>Note</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((r: any, i: number) => (
              <tr key={r.id} className={i === 0 ? '' : 'opacity-70'}>
                <Td className="whitespace-nowrap text-xs">
                  {day(r.valued_on)}
                  {i === 0 && (
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400">
                      current
                    </span>
                  )}
                </Td>
                <Td right mono bold className={
                  r.price_per_share !== null && par > 0 && r.price_per_share < par
                    ? 'text-rose-600 dark:text-rose-400' : ''}>
                  {price(r.price_per_share)}
                </Td>
                <Td right mono className="text-xs text-slate-500">
                  {fmtShares(r.shares_then)}
                </Td>
                <Td right mono>{fmtNaira(r.company_value)}</Td>
                <Td className="text-xs text-slate-500">
                  {BASIS.find((b) => b.id === r.basis)?.label || r.basis}
                </Td>
                <Td className="text-xs text-slate-500 max-w-xs">{r.note}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
