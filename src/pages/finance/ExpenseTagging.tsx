import React, { useState, useEffect, useCallback } from 'react';
import { Card, Note, Th, Td, fmtKobo, btnGhost } from './ui';

/**
 * Costs that are not reaching Monthly Gross Profit, and a way to fix them.
 *
 * Only four categories come off gross profit. Everything logged before
 * migration 0085 defaulted to "other" -- not deductible -- so real spending
 * sat outside the calculation and the month looked more profitable than it
 * was. This lists the month's costs with what each one is actually doing, and
 * re-tags one in place.
 */
export function ExpenseTagging({ month, get, put, onChange }: any) {
  const [rows, setRows] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      // Last day of the month rather than a fixed 31: a "2026-02-31" range
      // silently returns nothing on some drivers instead of erroring.
      const [y, m] = month.split('-').map(Number);
      const last = new Date(y, m, 0).getDate();
      const [e, c] = await Promise.all([
        get(`/api/finance/expenses?period=custom&from=${month}-01&to=${month}-${last}`),
        get('/api/finance/expense-categories'),
      ]);
      setRows(e || []);
      setCats(c || []);
    } catch (e: any) { setErr(e.message); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const isDeductible = (id: string) =>
    !!cats.find((c: any) => c.id === id)?.deductible;

  const retag = async (id: number, category: string) => {
    setBusy(String(id)); setErr(null);
    try {
      await put(`/api/finance/expenses/${id}`, { category });
      await load();
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  if (rows.length === 0) return null;

  const untagged = rows.filter((r) => !isDeductible(r.category));
  const shown = showAll ? rows : untagged;
  const missed = untagged.reduce((a, r) => a + Number(r.amount || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Costs in {month}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Only four categories come off gross profit: payment processing,
          seller share, direct infrastructure and refunds. Everything else is a
          real cost, but the contract says it must not reduce anyone&rsquo;s pay.
        </p>
      </div>

      {untagged.length > 0 && (
        <div className="px-5 pt-4">
          <Note tone="amber"
                title={`${untagged.length} cost${untagged.length === 1 ? ' is' : 's are'} not reducing gross profit.`}>
            {fmtKobo(Math.round(missed * 100))} is logged this month but tagged as
            something that does not come off. If any of it is hosting, gateway
            fees, a vendor payout or a refund, re-tag it here and the figure
            above corrects itself.
          </Note>
        </div>
      )}

      {err && <div className="px-5 pt-3"><Note tone="rose">{err}</Note></div>}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr><Th>Cost</Th><Th right>Amount</Th><Th>Tagged as</Th><Th>Effect</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shown.map((r) => (
              <tr key={r.id}>
                <Td>
                  <p className="text-sm text-slate-800 dark:text-slate-200">{r.title}</p>
                  <p className="text-xs text-slate-500">{r.reason}</p>
                </Td>
                <Td right mono>
                  &#8358;{Number(r.amount || 0).toLocaleString('en-NG')}
                </Td>
                <Td>
                  <select
                    className="text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1"
                    value={r.category || 'other'}
                    disabled={busy === String(r.id)}
                    onChange={(e) => retag(r.id, e.target.value)}>
                    <optgroup label="Comes off gross profit">
                      {cats.filter((c: any) => c.deductible).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Does NOT come off">
                      {cats.filter((c: any) => !c.deductible).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </optgroup>
                  </select>
                </Td>
                <Td>
                  {busy === String(r.id) ? (
                    <span className="text-xs text-slate-400">saving…</span>
                  ) : isDeductible(r.category) ? (
                    <span className="text-xs font-bold text-emerald-600">
                      reduces gross profit
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">no effect on pay</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-800">
        <button onClick={() => setShowAll(!showAll)} className={btnGhost}>
          {showAll
            ? `Show only the ${untagged.length} not counted`
            : `Show all ${rows.length} costs this month`}
        </button>
      </div>
    </Card>
  );
}
