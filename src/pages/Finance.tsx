import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Wallet, Users, PieChart as PieIcon,
  Download, Plus, Calendar, Building2, Landmark, Receipt,
  Calculator, FileText, Target, ShieldCheck, BadgeDollarSign, KeyRound,
} from 'lucide-react';
import {
  Card, Stat, Field, Empty, Note, Th, Td,
  fmtNaira, pct, shares, inputCls, btnCls,
} from './finance/ui';
import {
  GrossProfitTab, PayrollTab, MilestonesTab, StakeholderTab,
} from './finance/tabs';
import { useIdleLock, IdleLockScreen, ReauthGate } from './finance/SessionGuard';

/**
 * The company's money, in one place.
 *
 * TAB ORDER FOLLOWS THE SPEC. Milestones replaces the ESOP tab -- there is no
 * option pool, no grants and no vesting schedule, so a tab describing one
 * would be describing something that does not exist. Round modelling sits
 * AFTER Milestones because it is now hypothetical rather than imminent.
 */

/**
 * SAFE and convertible notes are OFF.
 *
 * No outside investment is planned. The conversion maths is kept because it
 * is correct and will be needed at a raise -- deleting it would mean writing
 * and re-verifying it again under time pressure. Set
 * localStorage.finance_safe_enabled = 'true' when a raise is actually on.
 */
const SAFE_ENABLED =
  typeof localStorage !== 'undefined'
  && localStorage.getItem('finance_safe_enabled') === 'true';

const PERIODS = [
  { id: 'today',   label: 'Today' },
  { id: 'week',    label: 'Last 7 days' },
  { id: 'month',   label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year',    label: 'This year' },
  { id: 'all',     label: 'All time' },
  { id: 'custom',  label: 'Pick dates' },
];

const STREAM_COLOURS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4',
  '#ec4899', '#84cc16',
];

export default function Finance() {
  const { get, post } = useApi();

  const [tab, setTab] = useState('overview');
  const [period, setPeriod] = useState('month');
  const [custom, setCustom] = useState({ from: '', to: '' });
  const [role, setRole] = useState<string>('none');

  const [summary, setSummary] = useState<any>(null);
  const [series, setSeries] = useState<any[]>([]);
  const [capTable, setCapTable] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Section 9: 30 minutes idle on this module.
  const { locked, unlock } = useIdleLock();

  const qs = useCallback(() => {
    const p = new URLSearchParams({ period });
    if (period === 'custom') {
      p.set('from', custom.from || '1970-01-01');
      p.set('to', custom.to || new Date().toISOString().slice(0, 10));
    }
    return p.toString();
  }, [period, custom]);

  /**
   * ONE request for the whole page.
   *
   * This used to be four in parallel plus a fifth for the role. On Vercel
   * each can land on a different function instance, each opening its own
   * database connections against a project-wide cap of 15 -- which is what
   * EMAXCONNSESSION was. One request is one instance is one connection.
   */
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const b = await get<any>(`/api/finance/bootstrap?${qs()}`);
      setSummary(b.summary);
      setSeries(b.series);
      setCapTable(b.capTable);
      setRole(b.role || 'none');
    } catch (e: any) {
      setError(e.message || 'Could not load the finance data.');
    } finally {
      setLoading(false);
    }
  }, [qs]);

  useEffect(() => { load(); }, [load]);

  const TABS = [
    { id: 'overview',    label: 'Money in & out',  icon: Wallet },
    { id: 'grossprofit', label: 'Gross profit',    icon: ShieldCheck },
    { id: 'payroll',     label: 'Payroll',         icon: BadgeDollarSign },
    { id: 'captable',    label: 'Ownership',       icon: PieIcon },
    { id: 'milestones',  label: 'Milestones',      icon: Target },
    { id: 'round',       label: 'Round modelling', icon: Calculator },
    { id: 'mystake',     label: 'My stake',        icon: Users },
    { id: 'record',      label: 'Record',          icon: Plus },
    { id: 'reports',     label: 'Reports',         icon: Download },
    ...(role === 'founder'
      ? [{ id: 'access', label: 'Access', icon: KeyRound }] : []),
  ];

  const customIncomplete = period === 'custom' && (!custom.from || !custom.to);
  // Only these tabs are driven by the date filter. Showing it above a cap
  // table would imply ownership changes with the range, which it does not.
  const periodDriven = ['overview', 'reports'].includes(tab);

  return (
    <div className="space-y-6">
      {locked && <IdleLockScreen onUnlock={unlock} />}

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Company Finance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            ALLOWANCE SAAS LTD · RC 9615473
            {periodDriven && summary?.period &&
              <> · <span className="font-medium">{summary.period.label}</span></>}
          </p>
        </div>

        {periodDriven && (
          <div className="flex flex-wrap items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            {PERIODS.map((p) => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  period === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {periodDriven && period === 'custom' && (
        <Card className="p-4 flex flex-wrap items-end gap-4">
          <Field label="From">
            <input type="date" className={inputCls} value={custom.from}
                   onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          </Field>
          <Field label="To">
            <input type="date" className={inputCls} value={custom.to}
                   onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </Field>
          <button onClick={load} disabled={customIncomplete} className={btnCls}>Apply</button>
        </Card>
      )}

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <Note tone="rose" title="Could not load.">
          {error}
          <br />
          If this says a relation does not exist, run
          migrations/0080_company_finance.sql then 0081_finance_v2.sql.
        </Note>
      )}

      {loading && !summary && tab === 'overview'
        ? <Empty>Loading…</Empty>
        : (
          <>
            {tab === 'overview'    && <Overview summary={summary} series={series} />}
            {tab === 'grossprofit' && <GrossProfitTab get={get} post={post} role={role} />}
            {tab === 'payroll'     && (
              <ReauthGate>
                <PayrollTab get={get} post={post} role={role} />
              </ReauthGate>
            )}
            {tab === 'captable'    && <CapTableView data={capTable} />}
            {tab === 'milestones'  && <MilestonesTab get={get} post={post} role={role} />}
            {tab === 'round'       && <RoundModelling data={capTable} post={post} />}
            {tab === 'mystake'     && <StakeholderTab get={get} />}
            {tab === 'record'      && <RecordTab post={post} get={get} onDone={load} />}
            {tab === 'reports'     && <Reports get={get} qs={qs()} summary={summary} />}
            {tab === 'access'      && <AccessTab get={get} />}
          </>
        )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Money in & out
// --------------------------------------------------------------------------

function Overview({ summary, series }: any) {
  if (!summary) return <Empty>No data.</Empty>;
  const t = summary.totals;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Stat label="Money in" value={fmtNaira(t.income)} icon={TrendingUp} tone="green"
              sub={t.income_change_pct !== null
                ? `${t.income_change_pct >= 0 ? '+' : ''}${t.income_change_pct.toFixed(1)}% vs previous`
                : 'no previous period'} />
        <Stat label="Money out" value={fmtNaira(t.expenses)} icon={TrendingDown} tone="red" />
        <Stat label="Profit" value={fmtNaira(t.profit)} icon={Wallet}
              tone={t.profit >= 0 ? 'green' : 'red'}
              sub={`${t.margin_pct.toFixed(1)}% margin`} />
        <Stat label="Company value" value={fmtNaira(summary.valuation?.amount || 0)}
              icon={Building2} tone="indigo"
              sub={summary.valuation
                ? `${summary.valuation.method}, ${new Date(summary.valuation.valued_on).toLocaleDateString('en-NG')}`
                : 'not set yet'} />
      </div>

      <Note tone="slate">
        This is <strong>all</strong> money in and out. It is not Monthly Gross
        Profit — that has a narrower, contractual definition and lives on its
        own tab.
      </Note>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Assets owned" value={fmtNaira(t.assets_worth)} icon={Landmark}
              sub={`${fmtNaira(t.invested)} invested this period`} />
        <Stat label="Owed to others" value={fmtNaira(t.liabilities)} icon={Receipt} tone="amber"
              sub="money held, not earned" />
        <Stat label="Payroll" value={fmtNaira(t.payroll_monthly)} icon={Users}
              sub="per month, current staff" />
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Day by day</h2>
        {series.length === 0 ? <Empty>Nothing in this period.</Empty> : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8"
                tickFormatter={(d: any) => new Date(String(d)).toLocaleDateString('en-NG',
                  { day: 'numeric', month: 'short' })} />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8"
                tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : String(v)} />
              <Tooltip formatter={(v: any, name: string) => [fmtNaira(v, 2), name]}
                labelFormatter={(d: any) => new Date(String(d)).toLocaleDateString('en-NG',
                  { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                contentStyle={{ borderRadius: 10, border: '1px solid #cbd5e1', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="income" name="In" stroke="#10b981"
                    fill="url(#gIn)" strokeWidth={2} />
              <Area type="monotone" dataKey="expenses" name="Out" stroke="#ef4444"
                    fill="url(#gOut)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
            Where the money comes from
          </h2>
          {summary.streams.length === 0 ? <Empty>No income in this period.</Empty> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={summary.streams} dataKey="total" nameKey="stream"
                       cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={2}>
                    {summary.streams.map((_: any, i: number) => (
                      <Cell key={i} fill={STREAM_COLOURS[i % STREAM_COLOURS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtNaira(v, 2)}
                           contentStyle={{ borderRadius: 10, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-4">
                {summary.streams.map((s: any, i: number) => (
                  <div key={s.stream} className="flex items-center gap-3 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: STREAM_COLOURS[i % STREAM_COLOURS.length] }} />
                    <span className="flex-1 text-slate-700 dark:text-slate-300">{s.stream}</span>
                    <span className="text-xs text-slate-400">{s.payments} payments</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {fmtNaira(s.total)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
            Where it goes
          </h2>
          {summary.expense_categories.length === 0
            ? <Empty>No expenses recorded in this period.</Empty>
            : (
              <div className="space-y-3">
                {summary.expense_categories.map((c: any) => {
                  const share = summary.totals.expenses > 0
                    ? (c.total / summary.totals.expenses) * 100 : 0;
                  return (
                    <div key={c.category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-700 dark:text-slate-300">{c.category}</span>
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          {fmtNaira(c.total)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-rose-500 rounded-full"
                             style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        </Card>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Ownership, as registered today
// --------------------------------------------------------------------------

function CapTableView({ data }: any) {
  if (!data) return <Empty>No data.</Empty>;
  if (!data.holders?.length) {
    return <Empty>Nobody is on the cap table yet. Run migration 0080.</Empty>;
  }
  const totals = data.holders[0];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Shares issued" value={shares(totals.all_shares)} icon={PieIcon} />
        <Stat label="Share capital" value={fmtNaira(Number(totals.all_shares) * 10)}
              icon={Landmark} sub="₦10 par value per share" />
        <Stat label="Total votes" value={shares(totals.all_votes)} icon={ShieldCheck}
              sub="Class A carries ten each" />
      </div>

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Who owns what</h2>
          <p className="text-xs text-slate-500 mt-1">
            Ownership and voting are different numbers. That is the dual-class
            structure working as intended, not a mistake.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr><Th>Holder</Th><Th>Class</Th><Th right>Shares</Th>
                  <Th right>Owns</Th><Th right>Votes</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.holders.map((h: any) => (
                <tr key={h.shareholder_id + h.share_class}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <Td>
                    <p className="font-medium text-slate-800 dark:text-slate-200">{h.full_name}</p>
                    {h.role_title && <p className="text-xs text-slate-500">{h.role_title}</p>}
                  </Td>
                  <Td>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                      h.share_class?.startsWith('Class A')
                        ? 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
                      {h.share_class?.replace(' Ordinary', '')}
                    </span>
                  </Td>
                  <Td right mono>{shares(h.shares)}</Td>
                  <Td right mono bold>{pct(h.ownership_pct)}</Td>
                  <Td right mono bold className="text-indigo-600 dark:text-indigo-400">
                    {pct(h.voting_pct)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Round modelling. Hypothetical -- no outside investment is planned.
// --------------------------------------------------------------------------

function RoundModelling({ data, post }: any) {
  const [model, setModel] = useState<any>(null);
  const [modelling, setModelling] = useState(false);
  const [form, setForm] = useState({
    raise: '', pre_money: '', pool_pct: '10',
    pool_pre_money: true, include_safes: SAFE_ENABLED,
  });
  const [err, setErr] = useState<string | null>(null);

  if (!data?.holders?.length) return <Empty>Nobody is on the cap table yet.</Empty>;

  const runModel = async () => {
    setErr(null); setModelling(true);
    try {
      setModel(await post('/api/finance/model-round', {
        raise: Number(form.raise),
        pre_money: Number(form.pre_money),
        pool_pct: Number(form.pool_pct),
        pool_pre_money: form.pool_pre_money,
        include_safes: SAFE_ENABLED && form.include_safes,
      }));
    } catch (e: any) { setErr(e.message); }
    finally { setModelling(false); }
  };

  return (
    <div className="space-y-6">
      <Note tone="slate" title="Hypothetical.">
        No outside investment is planned. This is here so a term sheet can be
        checked before it is signed.
      </Note>

      <Card className="p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Raising (₦)">
            <input type="number" className={inputCls} value={form.raise}
                   placeholder="200000000"
                   onChange={(e) => setForm({ ...form, raise: e.target.value })} />
          </Field>
          <Field label="Pre-money valuation (₦)">
            <input type="number" className={inputCls} value={form.pre_money}
                   placeholder="800000000"
                   onChange={(e) => setForm({ ...form, pre_money: e.target.value })} />
          </Field>
          <Field label="Staff share pool (%)">
            <input type="number" className={inputCls} value={form.pool_pct}
                   onChange={(e) => setForm({ ...form, pool_pct: e.target.value })} />
          </Field>
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mt-4">
          <input type="checkbox" checked={form.pool_pre_money}
                 onChange={(e) => setForm({ ...form, pool_pre_money: e.target.checked })} />
          Pool created before the round
          <span className="text-xs text-slate-500">(you pay for all of it)</span>
        </label>

        {SAFE_ENABLED && (
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 mt-2">
            <input type="checkbox" checked={form.include_safes}
                   onChange={(e) => setForm({ ...form, include_safes: e.target.checked })} />
            Convert outstanding SAFEs
          </label>
        )}

        <button onClick={runModel} disabled={modelling || !form.raise || !form.pre_money}
                className={btnCls + ' mt-4'}>
          {modelling ? 'Working…' : 'Show me'}
        </button>

        {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}

        {model && (
          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Post-money</p>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {fmtNaira(model.inputs.post_money)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Price per share</p>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {fmtNaira(model.share_price, 2)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Shares after</p>
                <p className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {shares(model.shares.after)}
                </p>
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase">Your votes after</p>
                <p className={`font-mono font-bold ${
                  model.founder_voting_after >= 75 ? 'text-emerald-600'
                  : model.founder_voting_after >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                  {model.founder_voting_after.toFixed(1)}%
                </p>
              </div>
            </div>

            {model.founder_voting_after < 75 && (
              <Note tone="amber">
                {model.founder_voting_after < 50
                  ? 'This drops your voting power below half. You would no longer carry an ordinary resolution on your own.'
                  : 'This drops you below 75%, the threshold for a special resolution — changing the Articles, for one.'}
              </Note>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr><Th>Holder</Th><Th right>Before</Th><Th right>After</Th>
                      <Th right>Given up</Th><Th right>Worth</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {model.holders.map((h: any, i: number) => (
                    <tr key={i}>
                      <Td>{h.name}</Td>
                      <Td right mono className="text-slate-500">{h.before_pct.toFixed(2)}%</Td>
                      <Td right mono bold>{h.after_pct.toFixed(2)}%</Td>
                      <Td right mono className="text-rose-600">−{h.dilution_pct.toFixed(2)}%</Td>
                      <Td right mono className="text-emerald-600">{fmtNaira(h.value_after)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Record
// --------------------------------------------------------------------------

function RecordTab({ post, get, onDone }: any) {
  const [kind, setKind] = useState('expense');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ date: new Date().toISOString().slice(0, 10) });

  useEffect(() => {
    get('/api/finance/expense-categories').then(setCats).catch(() => {});
  }, []);

  const KINDS = [
    { id: 'expense',    label: 'Expense',    hint: 'Money spent. Some categories reduce Monthly Gross Profit — the form says which.' },
    { id: 'revenue',    label: 'Revenue',    hint: 'Money collected, with its gateway fee and seller share.' },
    { id: 'capital',    label: 'Capital in', hint: 'Founder loans, grants, advances. NEVER counts as revenue.' },
    { id: 'investment', label: 'Investment', hint: 'Money spent on something you still own.' },
    { id: 'liability',  label: 'Money owed', hint: 'Held for someone else — creator payouts, vendor money.' },
    { id: 'valuation',  label: 'Valuation',  hint: 'What the company is worth, and on what basis.' },
  ];

  const submit = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // The v2 endpoints speak kobo; the older ones speak naira. Converted at
      // the call site rather than guessed inside the form.
      const k = (v: any) => Math.round(Number(v || 0) * 100);

      if (kind === 'expense') {
        await post('/api/finance/expenses', {
          title: form.title, reason: form.category, category: form.category,
          amount: Number(form.amount), expense_date: form.date });
      } else if (kind === 'revenue') {
        await post('/api/finance/revenue', {
          stream: form.stream || 'other', collected_on: form.date,
          gross_collected: k(form.amount), gateway_fee: k(form.gateway),
          seller_payout: k(form.seller), direct_cost: k(form.direct),
          note: form.note });
      } else if (kind === 'capital') {
        await post('/api/finance/capital', {
          kind: form.category || 'other', counterparty: form.title,
          amount: k(form.amount), received_on: form.date, note: form.note });
      } else if (kind === 'investment') {
        await post('/api/finance/investments', {
          title: form.title, category: form.category,
          amount: Number(form.amount), invested_on: form.date, note: form.note });
      } else if (kind === 'liability') {
        await post('/api/finance/liabilities', {
          title: form.title, owed_to: form.category,
          amount: Number(form.amount), due_on: form.date, note: form.note });
      } else {
        await post('/api/finance/valuations', {
          amount: Number(form.amount), method: 'manual',
          basis: form.basis || 'founder_estimate',
          valued_on: form.date, note: form.note });
      }
      setMsg('Saved.');
      setForm({ date: new Date().toISOString().slice(0, 10) });
      onDone();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const active = KINDS.find((k) => k.id === kind)!;
  const needsTitle = kind !== 'valuation';

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap gap-2 mb-2">
          {KINDS.map((k) => (
            <button key={k.id} onClick={() => { setKind(k.id); setMsg(null); setErr(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                kind === k.id ? 'bg-indigo-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
              {k.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 mb-5">{active.hint}</p>

        <div className="space-y-4">
          {needsTitle && (
            <Field label={kind === 'capital' ? 'From whom' : 'What was it'}>
              <input className={inputCls} value={form.title || ''}
                     onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
          )}

          {kind === 'expense' && (
            <Field label="Category"
                   hint="Green reduces Monthly Gross Profit and therefore salaries. Grey does not.">
              <div className="grid grid-cols-2 gap-2">
                {cats.map((c: any) => (
                  <button key={c.id} type="button"
                    onClick={() => setForm({ ...form, category: c.id })}
                    className={`text-left px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      form.category === c.id
                        ? c.deductible
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-600 text-white border-slate-600'
                        : c.deductible
                          ? 'border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}>
                    {c.label}
                    <span className="block font-normal opacity-75 mt-0.5">
                      {c.deductible ? 'reduces gross profit' : 'does not'}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          )}

          {kind === 'revenue' && (
            <>
              <Field label="Stream">
                <select className={inputCls} value={form.stream || 'other'}
                        onChange={(e) => setForm({ ...form, stream: e.target.value })}>
                  <option value="marketplace_commission">Marketplace commission</option>
                  <option value="plus_subscriptions">Plus subscriptions</option>
                  <option value="premium_groups">Premium groups</option>
                  <option value="fantasy">Allowance Fantasy</option>
                  <option value="other">Other</option>
                </select>
              </Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Gateway fee (₦)">
                  <input type="number" className={inputCls} value={form.gateway || ''}
                         onChange={(e) => setForm({ ...form, gateway: e.target.value })} />
                </Field>
                <Field label="Seller share (₦)">
                  <input type="number" className={inputCls} value={form.seller || ''}
                         onChange={(e) => setForm({ ...form, seller: e.target.value })} />
                </Field>
                <Field label="Direct cost (₦)">
                  <input type="number" className={inputCls} value={form.direct || ''}
                         onChange={(e) => setForm({ ...form, direct: e.target.value })} />
                </Field>
              </div>
            </>
          )}

          {kind === 'capital' && (
            <Field label="Kind">
              <select className={inputCls} value={form.category || 'founder_loan'}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="founder_loan">Founder loan</option>
                <option value="director_advance">Director advance</option>
                <option value="grant">Grant</option>
                <option value="equity_round">Equity round</option>
                <option value="other">Other</option>
              </select>
            </Field>
          )}

          {kind === 'valuation' && (
            <Field label="Basis" hint="Shown next to the figure, always.">
              <select className={inputCls} value={form.basis || 'founder_estimate'}
                      onChange={(e) => setForm({ ...form, basis: e.target.value })}>
                <option value="founder_estimate">Founder estimate</option>
                <option value="last_round">Last round</option>
                <option value="independent_valuation">Independent valuation</option>
                <option value="par_value">Par value</option>
              </select>
            </Field>
          )}

          {(kind === 'investment' || kind === 'liability') && (
            <Field label={kind === 'liability' ? 'Owed to' : 'Category'}>
              <input className={inputCls} value={form.category || ''}
                     onChange={(e) => setForm({ ...form, category: e.target.value })} />
            </Field>
          )}

          <Field label={kind === 'revenue' ? 'Gross collected (₦)' : 'Amount (₦)'}>
            <input type="number" className={inputCls} value={form.amount || ''}
                   onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </Field>

          <Field label={kind === 'revenue' ? 'Collected on' : 'Date'}>
            <input type="date" className={inputCls} value={form.date || ''}
                   onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </Field>

          <Field label="Note (optional)">
            <textarea className={inputCls} rows={2} value={form.note || ''}
                      onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </Field>

          {err && <p className="text-sm text-rose-600">{err}</p>}
          {msg && <p className="text-sm text-emerald-600">{msg}</p>}

          <button onClick={submit} className={btnCls}
                  disabled={busy || !form.amount || (needsTitle && !form.title)}>
            {busy ? 'Saving…' : `Save ${active.label.toLowerCase()}`}
          </button>
        </div>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Access (section 9)
// --------------------------------------------------------------------------

function AccessTab({ get }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [auditRows, setAuditRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [u, a] = await Promise.all([
        get('/api/finance/users'), get('/api/finance/audit?limit=100')]);
      setUsers(u); setAuditRows(a);
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <Note tone="rose" title="No stakeholder has a login yet — deliberately.">
        The spec's build order forbids giving anyone outside the founder access
        until roles and row-level security are done and tested. The tables are
        RLS-on with no policies, so nothing reaches them except this admin
        server.
      </Note>

      {err && <Note tone="rose">{err}</Note>}

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Who can sign in</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr><Th>Email</Th><Th>Linked to</Th><Th>Role</Th><Th>Director</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <Td mono className="text-xs">{u.email}</Td>
                  <Td>{u.full_name || '—'}</Td>
                  <Td><span className="text-xs font-bold">{u.role}</span></Td>
                  <Td>{u.is_director ? 'Yes' : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Audit log</h2>
          <p className="text-xs text-slate-500 mt-1">
            Append-only. Cannot be edited or deleted, by anyone.
          </p>
        </div>
        {auditRows.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                <tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Entity</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditRows.map((a) => (
                  <tr key={a.id}>
                    <Td className="text-xs text-slate-500">
                      {new Date(a.at).toLocaleString('en-NG')}
                    </Td>
                    <Td className="text-xs">{a.actor}</Td>
                    <Td><span className="text-xs font-bold">{a.action}</span></Td>
                    <Td className="text-xs text-slate-500">{a.entity}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Reports
// --------------------------------------------------------------------------

function Reports({ get, qs, summary }: any) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const who = () => localStorage.getItem('admin_email') || 'unknown';
  const stamp = () => new Date().toISOString().slice(0, 10);
  const kobo = (k: any) => (Number(k || 0) / 100).toLocaleString('en-NG');

  const download = (name: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const toCsv = (rows: any[], cols: string[]) => {
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Watermarked with the requesting user and timestamp, per section 9.
    return [
      '# ALLOWANCE SAAS LTD (RC 9615473)',
      `# Generated ${new Date().toISOString()} by ${who()}`,
      cols.join(','),
      ...rows.map((r) => cols.map((c) => esc(r[c])).join(',')),
    ].join('\n');
  };

  const jsPdf = async () => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    return { jsPDF, autoTable };
  };

  /** Company name, RC number, range, timestamp and requesting user. */
  const pdfHeader = (doc: any, title: string, range?: string) => {
    doc.setFontSize(16);
    doc.text('ALLOWANCE SAAS LTD', 14, 18);
    doc.setFontSize(9); doc.setTextColor(110);
    doc.text('RC 9615473', 14, 24);
    doc.setTextColor(0); doc.setFontSize(12);
    doc.text(title, 14, 34);
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text(`${range ? range + ' · ' : ''}generated ${new Date().toLocaleString('en-NG')} by ${who()}`,
             14, 39);
    doc.setTextColor(0);
    return 46;
  };

  const run = (id: string, fn: () => Promise<void>) => async () => {
    setBusy(id); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  };

  const reports = [
    {
      id: 'bs-pdf', label: 'Balance sheet (PDF)',
      hint: 'Income, expenses, what you own, what you owe.',
      run: run('bs-pdf', async () => {
        const { jsPDF, autoTable } = await jsPdf();
        const bs = await get(`/api/finance/balance-sheet?${qs}`);
        const doc = new jsPDF();
        let y = pdfHeader(doc, 'Balance sheet', `${bs.period.from} to ${bs.period.to}`);
        const sec = (head: string[], body: any[][]) => {
          autoTable(doc, { startY: y, head: [head], body, theme: 'striped',
            headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
            bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 } });
          y = (doc as any).lastAutoTable.finalY + 8;
        };
        sec(['Income stream', 'Amount (N)'],
          [...bs.income.map((r: any) => [r.stream, Math.round(r.total).toLocaleString()]),
           ['TOTAL', Math.round(bs.totals.income).toLocaleString()]]);
        sec(['Expense', 'Amount (N)'],
          [...bs.expenses.map((r: any) => [r.category, Math.round(r.total).toLocaleString()]),
           ['TOTAL', Math.round(bs.totals.expenses).toLocaleString()]]);
        if (bs.assets.length) sec(['Asset', 'Cost (N)', 'Worth now (N)'],
          bs.assets.map((r: any) => [r.title, Math.round(r.amount).toLocaleString(),
                                     Math.round(r.worth).toLocaleString()]));
        if (bs.liabilities.length) sec(['Owed', 'Amount (N)'],
          bs.liabilities.map((r: any) => [r.title, Math.round(r.amount).toLocaleString()]));
        sec(['', 'Amount (N)'], [
          ['Retained', Math.round(bs.totals.retained).toLocaleString()],
          ['Assets', Math.round(bs.totals.assets).toLocaleString()],
          ['Liabilities', Math.round(bs.totals.liabilities).toLocaleString()],
          ['NET WORTH', Math.round(bs.totals.net_worth).toLocaleString()],
        ]);
        doc.save(`allowance-balance-sheet-${stamp()}.pdf`);
      }),
    },
    {
      id: 'pl', label: 'Profit and loss (CSV)',
      hint: 'Income by stream less expenses by category.',
      run: run('pl', async () => {
        const bs = await get(`/api/finance/balance-sheet?${qs}`);
        const rows = [
          ...bs.income.map((r: any) => ({ section: 'Income', line: r.stream, amount: r.total })),
          { section: 'Income', line: 'TOTAL', amount: bs.totals.income },
          ...bs.expenses.map((r: any) => ({ section: 'Expenses', line: r.category, amount: -r.total })),
          { section: 'Expenses', line: 'TOTAL', amount: -bs.totals.expenses },
          { section: 'Result', line: 'Retained', amount: bs.totals.retained },
        ];
        download(`allowance-profit-and-loss-${stamp()}.csv`,
                 toCsv(rows, ['section', 'line', 'amount']), 'text/csv');
      }),
    },
    {
      id: 'gp', label: 'Gross profit breakdown (CSV)',
      hint: 'Line items per month with certification status. The six-year record.',
      run: run('gp', async () => {
        const rows = await get('/api/finance/gross-profit');
        download(`allowance-gross-profit-${stamp()}.csv`, toCsv(
          rows.map((r: any) => ({
            month: r.month?.slice(0, 7), version: r.version, status: r.status,
            collections: kobo(r.collections), gateway_fees: kobo(r.gateway_fees),
            seller_payouts: kobo(r.seller_payouts),
            direct_infrastructure: kobo(r.direct_infrastructure),
            refunds: kobo(r.refunds), gross_profit: kobo(r.gross_profit),
            band: r.band, certified_by: r.certified_by,
            certified_at: r.certified_at, correction_reason: r.correction_reason,
          })),
          ['month','version','status','collections','gateway_fees','seller_payouts',
           'direct_infrastructure','refunds','gross_profit','band','certified_by',
           'certified_at','correction_reason']), 'text/csv');
      }),
    },
    {
      id: 'payroll', label: 'Payroll register (CSV)',
      hint: 'Cash paid and band applied, per person per month.',
      run: run('payroll', async () => {
        const rows = await get('/api/finance/payroll');
        download(`allowance-payroll-${stamp()}.csv`, toCsv(
          rows.map((r: any) => ({
            month: r.month?.slice(0, 7), person: r.full_name, scale: r.scale,
            band: r.band, full_salary: kobo(r.full_salary),
            cash_due: kobo(r.cash_due), cash_paid: kobo(r.cash_paid),
            accrued: kobo(r.accrued), due_on: r.due_on, paid_on: r.paid_on,
          })),
          ['month','person','scale','band','full_salary','cash_due','cash_paid',
           'accrued','due_on','paid_on']), 'text/csv');
      }),
    },
    {
      id: 'deferred', label: 'Deferred salary statement (PDF)',
      hint: 'Per person and total. The quarterly version is contractual.',
      run: run('deferred', async () => {
        const { jsPDF, autoTable } = await jsPdf();
        const d = await get('/api/finance/deferred');
        const doc = new jsPDF();
        const y = pdfHeader(doc, 'Deferred Salary Account statement');
        autoTable(doc, {
          startY: y,
          head: [['Person', 'Accrued (N)', 'Paid (N)', 'Balance (N)', 'Cap (N)']],
          body: d.balances.map((b: any) => [
            b.full_name, kobo(b.total_accrued), kobo(b.total_paid),
            kobo(b.balance), kobo(b.deferred_cap)]),
          theme: 'striped', headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
          bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 },
        });
        const endY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(8); doc.setTextColor(110);
        doc.text(
          `Total company liability: N${kobo(d.total_liability)}. Half of every `
          + 'shortfall accrues; the other half is extinguished permanently and is '
          + 'not owed. Balances survive termination.', 14, endY, { maxWidth: 180 });
        doc.save(`allowance-deferred-salary-${stamp()}.pdf`);
      }),
    },
    {
      id: 'cap', label: 'Cap table (PDF)',
      hint: 'Current registered holdings. Not affected by the date filter.',
      run: run('cap', async () => {
        const { jsPDF, autoTable } = await jsPdf();
        const ct = await get('/api/finance/cap-table/current');
        const doc = new jsPDF();
        const y = pdfHeader(doc, 'Shareholder register',
                            `as at ${new Date().toLocaleDateString('en-NG')}`);
        autoTable(doc, {
          startY: y,
          head: [['Shareholder', 'Class A', 'Class B', 'Total', 'Owns', 'Votes']],
          body: ct.holders.map((h: any) => [
            h.name, h.byClass.A ? h.byClass.A.toLocaleString() : '-',
            h.byClass.B ? h.byClass.B.toLocaleString() : '-',
            h.totalShares.toLocaleString(),
            `${h.economicPct.toFixed(2)}%`, `${h.votingPct.toFixed(2)}%`]),
          theme: 'striped', headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
          bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 },
        });
        const endY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(8); doc.setTextColor(110);
        doc.text(
          `${ct.totalShares.toLocaleString()} shares of N10.00 par, share capital `
          + `N${(ct.issuedCapital / 100).toLocaleString()}. Class A Ordinary carries `
          + 'ten votes per share and may be held only by the Founder and Founding '
          + 'Team Members (Articles, Part 2).', 14, endY, { maxWidth: 180 });
        doc.save(`allowance-cap-table-${stamp()}.pdf`);
      }),
    },
    {
      id: 'milestones', label: 'Milestone register (CSV)',
      hint: 'Every award, challenge and tranche.',
      run: run('milestones', async () => {
        const awards = await get('/api/finance/awards');
        const rows: any[] = [];
        for (const a of awards) {
          for (const c of a.scheme.challenges || []) {
            rows.push({ holder: a.scheme.holderName, mechanism: a.scheme.mechanism,
              type: 'challenge', item: c.description, shares: c.allocatedShares,
              status: c.status, issued: c.issuedOn, deadline: c.deliverBy });
          }
          for (const t of a.scheme.tranches || []) {
            rows.push({ holder: a.scheme.holderName, mechanism: a.scheme.mechanism,
              type: 'tranche', item: t.milestoneDescription || `Tranche ${t.index}`,
              shares: t.shares, status: t.certifiedBy ? 'certified' : 'open',
              issued: t.recordedOn, deadline: a.scheme.longstopDate });
          }
        }
        download(`allowance-milestones-${stamp()}.csv`,
          toCsv(rows, ['holder','mechanism','type','item','shares','status','issued','deadline']),
          'text/csv');
      }),
    },
    {
      id: 'streams', label: 'Income by stream (CSV)',
      hint: 'Per-stream margin, not one blended number.',
      run: run('streams', async () => {
        const rows = await get('/api/finance/revenue/by-stream');
        download(`allowance-income-by-stream-${stamp()}.csv`, toCsv(
          rows.map((r: any) => ({
            stream: r.stream, gross: kobo(r.gross), gateway: kobo(r.gateway),
            seller: kobo(r.seller), direct: kobo(r.direct), net: kobo(r.net),
            margin_pct: r.margin_pct.toFixed(2), entries: r.entries })),
          ['stream','gross','gateway','seller','direct','net','margin_pct','entries']),
          'text/csv');
      }),
    },
    {
      id: 'income', label: 'Every payment (CSV)',
      hint: 'One row per payment in the period.',
      run: run('income', async () => {
        const rows = await get(`/api/finance/income?${qs}`);
        download(`allowance-payments-${stamp()}.csv`,
          toCsv(rows, ['received_at', 'stream', 'amount', 'payer', 'reference']), 'text/csv');
      }),
    },
    {
      id: 'expenses', label: 'Expense register (CSV)',
      hint: 'By category, with whether each one reduces gross profit.',
      run: run('expenses', async () => {
        const [rows, cats] = await Promise.all([
          get('/api/finance/expenses'), get('/api/finance/expense-categories')]);
        const deductible = (id: string) =>
          cats.find((c: any) => c.id === id)?.deductible ? 'yes' : 'no';
        download(`allowance-expenses-${stamp()}.csv`, toCsv(
          rows.map((r: any) => ({
            date: r.expense_date, title: r.title,
            category: r.category || r.reason, amount: r.amount,
            reduces_gross_profit: deductible(r.category), vendor: r.vendor,
            approved_by: r.approved_by })),
          ['date','title','category','amount','reduces_gross_profit','vendor','approved_by']),
          'text/csv');
      }),
    },
    {
      id: 'mine', label: 'My stakeholder statement (PDF)',
      hint: 'Your own figures, each with its basis.',
      run: run('mine', async () => {
        const { jsPDF, autoTable } = await jsPdf();
        const me = await get('/api/finance/me');
        if (!me.linked) throw new Error('This login is not linked to a shareholding.');
        const doc = new jsPDF();
        let y = pdfHeader(doc, 'Stakeholder statement');
        autoTable(doc, {
          startY: y, head: [['', '']],
          body: [
            ['Shares held', me.holding.shares.toLocaleString()],
            ['Share of the company', `${me.holding.economicPct.toFixed(4)}%`],
            ['Share of the votes', `${me.holding.votingPct.toFixed(4)}%`],
          ],
          theme: 'plain', bodyStyles: { fontSize: 10 }, margin: { left: 14, right: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 6;
        autoTable(doc, {
          startY: y, head: [['Figure', 'Amount (N)', 'Based on', 'As at']],
          body: me.figures.map((f: any) => [
            f.label, kobo(f.amount), f.basis,
            f.asOf ? new Date(f.asOf).toLocaleDateString('en-NG') : '-']),
          theme: 'striped', headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
          bodyStyles: { fontSize: 9 }, margin: { left: 14, right: 14 },
        });
        const endY = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(8); doc.setTextColor(110);
        doc.text(me.disclaimer, 14, endY, { maxWidth: 180 });
        doc.save(`allowance-stakeholder-statement-${stamp()}.pdf`);
      }),
    },
  ];

  return (
    <div className="space-y-4 max-w-4xl">
      <Note tone="slate">
        Period-based reports cover{' '}
        <strong>{summary?.period?.label || 'the selected period'}</strong>. The
        cap table, payroll and milestone registers are point-in-time and ignore
        the filter. Every export carries your email and the time it was made.
      </Note>

      {err && <Note tone="rose">{err}</Note>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {reports.map((r) => (
          <Card key={r.id} className="p-5">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{r.label}</p>
                <p className="text-xs text-slate-500 mt-1">{r.hint}</p>
                <button onClick={r.run} disabled={busy !== null}
                        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold disabled:opacity-40">
                  <Download className="w-3.5 h-3.5" />
                  {busy === r.id ? 'Preparing…' : 'Download'}
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
