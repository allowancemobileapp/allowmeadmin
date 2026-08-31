import React, { useState, useEffect, useCallback } from 'react';
import { Card, Stat, Empty, Note, Th, Td, pct, shares, btnGhost } from './ui';
import { TrendingUp, Users, Wallet, School, Coins } from 'lucide-react';

const naira = (n: number) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

// Enough decimals to be meaningful on a small holding without being absurd.
const perNaira = (f: number) => '₦' + (Number(f) || 0).toFixed(4);

/**
 * Everyone's share of the money, as it arrives.
 *
 * THE HONEST FRAMING MATTERS HERE. A number beside somebody's name reads like
 * a promise, so the page distinguishes three things that are genuinely
 * different: a share of what came IN (not drawable), a share of what was
 * KEPT (the real economics, and negative in a bad month), and what campus
 * partners are owed OFF THE TOP (not shareholder money at all).
 */
export function LiveSplitTab({ get, period, role }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [basis, setBasis] = useState<'income' | 'profit'>('income');

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await get(`/api/live/split?period=${period}`)); }
    catch (e: any) { setErr(e.message); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  // Refresh while the tab is open, so "real time" means something. 60s is
  // frequent enough to feel live and rare enough not to hammer the pool.
  useEffect(() => {
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (err) {
    return (
      <Note tone="rose" title="Could not load the split.">
        {err}
        <br />
        If this mentions a function that does not exist, run
        migrations/0086_tags_schools_live_split.sql.
      </Note>
    );
  }
  if (!data) return <Empty>Loading…</Empty>;

  const t = data.totals;
  const loss = t.retained < 0;

  return (
    <div className="space-y-6">
      <Note tone="indigo" title="What this page is, and what it is not.">
        This is everyone&rsquo;s proportional share of the money, updated as it
        arrives. It is <strong>not</strong> a balance anyone can withdraw.
        Shareholders receive money when profit is formally distributed or the
        company is sold — neither has happened. Salaries are on the Payroll
        tab and are a completely separate thing.
      </Note>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Money in" value={naira(t.income)} icon={TrendingUp}
              tone="emerald" sub={`${t.payments} payments · ${data.period.label}`} />
        <Stat label="Money out" value={naira(t.spend)} icon={Wallet} />
        <Stat label={loss ? 'Lost' : 'Kept'} value={naira(Math.abs(t.retained))}
              icon={Coins} tone={loss ? 'rose' : 'indigo'}
              sub={loss ? 'spent more than earned' : 'income minus costs'} />
        <Stat label="Owed to campuses" value={naira(t.campus_liability)}
              icon={School} tone="amber"
              sub="comes off before any shareholder split" />
      </div>

      {t.campus_liability > 0 && (
        <Note tone="amber">
          {naira(t.campus_liability)} of the money above is owed to campus
          partners under revenue-share agreements. It is not the
          company&rsquo;s and is not inside anyone&rsquo;s share below.
        </Note>
      )}

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Every shareholder&rsquo;s share
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {data.period.label} · everyone with access can see this page
            </p>
          </div>
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            {[
              { id: 'income', label: 'Of money in' },
              { id: 'profit', label: 'Of what was kept' },
            ].map((b) => (
              <button key={b.id} onClick={() => setBasis(b.id as any)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                  basis === b.id
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm'
                    : 'text-slate-500'}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {data.holders.length === 0 ? (
          <Empty>No shareholders on the register yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>Shareholder</Th>
                  <Th right>Shares</Th>
                  <Th right>Owns</Th>
                  <Th right>Per ₦1 in</Th>
                  <Th right>{basis === 'income' ? 'Share of money in' : 'Share of what was kept'}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.holders.map((h: any) => {
                  const v = basis === 'income' ? h.share_of_income : h.share_of_profit;
                  return (
                    <tr key={h.holder_id}>
                      <Td>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {h.full_name}
                        </p>
                        <p className="text-xs text-slate-500">{h.role_title || '—'}</p>
                      </Td>
                      <Td right mono>{shares(h.shares)}</Td>
                      <Td right mono>{pct(h.ownership_pct)}</Td>
                      <Td right mono className="text-slate-500">
                        {perNaira(h.per_naira)}
                      </Td>
                      <Td right mono bold className={
                        v < 0 ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-800 dark:text-slate-200'}>
                        {naira(v)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            {basis === 'income'
              ? 'A share of money in ignores what it cost to earn it. Switch to "what was kept" for the figure that reflects the business.'
              : 'This is income minus everything spent, split by ownership. It goes negative in a month that lost money, and that is shown rather than hidden.'}
          </p>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Where the money came from
          </h2>
        </div>
        {data.streams.length === 0 ? (
          <Empty>Nothing came in during this period.</Empty>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr><Th>Stream</Th><Th right>Payments</Th><Th right>Average</Th><Th right>Total</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.streams.map((s: any) => (
                <tr key={s.stream}>
                  <Td>{s.stream}</Td>
                  <Td right mono className="text-slate-500">{s.payments}</Td>
                  <Td right mono className="text-slate-500">
                    {s.payments > 0 ? naira(s.total / s.payments) : '—'}
                  </Td>
                  <Td right mono bold>{naira(s.total)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500">
            Check the average against what you actually charge. If it looks
            wrong, a unit is wrong — that is how the ticket error was found.
          </p>
        </div>
      </Card>
    </div>
  );
}
