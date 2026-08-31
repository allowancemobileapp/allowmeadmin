import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Stat, Field, Empty, Note, BandPill, BasisFigure, Th, Td,
  fmtKobo, pct, shares, inputCls, btnCls, btnGhost,
} from './ui';
import { ExpenseTagging } from './ExpenseTagging';
import {
  ShieldCheck, Lock, AlertTriangle, CheckCircle2, XCircle, Clock,
  ArrowRightLeft, FilePlus2, Wallet, Target, TrendingUp,
} from 'lucide-react';

const monthKey = (d = new Date()) => d.toISOString().slice(0, 7);

// ==========================================================================
// Section 3 -- Monthly Gross Profit
// ==========================================================================

export function GrossProfitTab({ get, post, put, role }: any) {
  const [month, setMonth] = useState(monthKey());
  const [draft, setDraft] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [d, h] = await Promise.all([
        get(`/api/finance/gross-profit/draft?month=${month}`),
        get('/api/finance/gross-profit'),
      ]);
      setDraft(d); setHistory(h);
    } catch (e: any) { setErr(e.message); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const certified = history.find(
    (h) => h.month?.slice(0, 7) === month && h.status === 'certified');

  const certify = async () => {
    setBusy(true); setErr(null);
    try {
      await post('/api/finance/gross-profit/certify',
        { month, correction_reason: certified ? reason : null });
      setReason('');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const lines = draft ? [
    { label: 'Gross collected, all streams', amount: draft.collections, sign: '+' },
    { label: 'Payment gateway & processing fees', amount: -draft.gatewayFees, sign: '−' },
    { label: 'Seller, merchant & vendor share', amount: -draft.sellerPayouts, sign: '−' },
    { label: 'Direct infrastructure', amount: -draft.directInfrastructure, sign: '−' },
    { label: 'Refunds, chargebacks & reversals', amount: -draft.refunds, sign: '−' },
  ] : [];

  return (
    <div className="space-y-6">
      <Note tone="indigo" title="This figure is contractual.">
        Four people's salaries are calculated from it, and this app is named in
        their contracts as the primary source. Once certified it cannot be
        edited — a correction is a new version and both stay visible for six
        years.
      </Note>

      <div className="flex flex-wrap items-end gap-4">
        <Field label="Month">
          <input type="month" className={inputCls} value={month}
                 onChange={(e) => setMonth(e.target.value)} />
        </Field>
        {certified && (
          <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-bold pb-2">
            <ShieldCheck className="w-4 h-4" />
            Certified v{certified.version} by {certified.certified_by}
          </div>
        )}
      </div>

      {err && <Note tone="rose">{err}</Note>}

      {draft && (
        <Card className="overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
              Monthly Gross Profit — {month}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Cash basis: counted in the month the money was collected.
            </p>
          </div>

          <table className="w-full">
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {/* The streams behind the collections line. Without these the
                  top figure is unauditable -- you cannot tell a quiet month
                  from a stream that stopped reporting. */}
              {(draft.breakdown?.automatic || []).map((a: any) => (
                <tr key={'auto-' + a.slug} className="bg-slate-50/50 dark:bg-slate-800/20">
                  <Td>
                    <span className="text-slate-300 font-mono mr-2 pl-4">↳</span>
                    <span className="text-xs text-slate-500">
                      {a.stream}
                      <span className="ml-2 text-slate-400">
                        {a.payments} payment{a.payments === 1 ? '' : 's'}
                        {a.payments > 0 &&
                          ` · avg ${fmtKobo(Math.round(a.collected / a.payments))}`}
                      </span>
                      {a.thirdParty > 0 && (
                        <span className="block text-amber-600 dark:text-amber-500 mt-0.5">
                          {fmtKobo(a.thirdParty)} of this is the organiser's —
                          the company keeps {fmtKobo(a.company)}
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td right mono className="text-xs text-slate-500">
                    {fmtKobo(a.collected)}
                  </Td>
                </tr>
              ))}
              {(draft.breakdown?.manual || []).map((m: any) => (
                <tr key={'man-' + m.slug} className="bg-slate-50/50 dark:bg-slate-800/20">
                  <Td>
                    <span className="text-slate-300 font-mono mr-2 pl-4">↳</span>
                    <span className="text-xs text-slate-500">
                      {m.stream}
                      <span className="ml-2 text-amber-600">entered by hand</span>
                    </span>
                  </Td>
                  <Td right mono className="text-xs text-slate-500">
                    {fmtKobo(m.collected)}
                  </Td>
                </tr>
              ))}
              {lines.map((l) => (
                <tr key={l.label}>
                  <Td>
                    <span className="text-slate-400 font-mono mr-2">{l.sign}</span>
                    <span className="text-slate-700 dark:text-slate-300">{l.label}</span>
                  </Td>
                  <Td right mono className={l.amount < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-800 dark:text-slate-200'}>
                    {fmtKobo(Math.abs(l.amount))}
                  </Td>
                </tr>
              ))}
              <tr className="bg-slate-50 dark:bg-slate-800/50">
                <Td bold>Monthly Gross Profit</Td>
                <Td right mono bold className={draft.grossProfit >= 0
                  ? 'text-emerald-600 dark:text-emerald-400 text-lg'
                  : 'text-rose-600 dark:text-rose-400 text-lg'}>
                  {fmtKobo(draft.grossProfit)}
                </Td>
              </tr>
            </tbody>
          </table>

          {draft.collections === 0 && (
            <div className="px-5 pt-4">
              <Note tone="amber" title="No money collected in this month.">
                Every stream reads zero. If that is not right, check the month,
                and check that payments are actually landing in the app's
                payment tables — this figure decides four salaries, and zero
                puts everyone on Band 1.
              </Note>
            </div>
          )}

          <div className="p-5 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-4">
            <BandPill band={draft.band} />
            <p className="text-xs text-slate-500 flex-1 min-w-[200px]">
              Nothing else is deducted — not salaries, marketing, G&amp;A, tax,
              depreciation or capital spend.
            </p>
            {role === 'founder' && (
              <>
                {certified && (
                  <input className={inputCls + ' max-w-xs'} value={reason}
                         placeholder="Reason for the correction"
                         onChange={(e) => setReason(e.target.value)} />
                )}
                <button onClick={certify} disabled={busy || (!!certified && !reason)}
                        className={btnCls}>
                  {busy ? 'Working…'
                    : certified ? 'Record correction' : 'Certify this month'}
                </button>
              </>
            )}
          </div>
        </Card>
      )}

      <ExpenseTagging month={month} get={get} put={put} onChange={load} />

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Certified history
          </h2>
          <p className="text-xs text-slate-500 mt-1">Retained for six years.</p>
        </div>
        {history.length === 0 ? <Empty>Nothing certified yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr><Th>Month</Th><Th>Version</Th><Th>Status</Th>
                    <Th right>Gross profit</Th><Th>Band</Th><Th>Certified by</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((h) => (
                  <tr key={h.id} className={h.status === 'superseded' ? 'opacity-50' : ''}>
                    <Td mono>{h.month?.slice(0, 7)}</Td>
                    <Td mono>v{h.version}</Td>
                    <Td>
                      <span className={`text-xs font-bold ${
                        h.status === 'certified' ? 'text-emerald-600'
                        : h.status === 'superseded' ? 'text-slate-400' : 'text-amber-600'}`}>
                        {h.status}
                      </span>
                    </Td>
                    <Td right mono bold>{fmtKobo(h.gross_profit)}</Td>
                    <Td><BandPill band={h.band} /></Td>
                    <Td className="text-xs text-slate-500">{h.certified_by || '—'}</Td>
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

// ==========================================================================
// Sections 4 and 5 -- payroll and deferred pay
// ==========================================================================

export function PayrollTab({ get, post, role }: any) {
  const [month, setMonth] = useState(monthKey());
  const [runs, setRuns] = useState<any[]>([]);
  const [deferred, setDeferred] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [r, d] = await Promise.all([
        get(`/api/finance/payroll?month=${month}`),
        get('/api/finance/deferred'),
      ]);
      setRuns(r); setDeferred(d);
    } catch (e: any) { setErr(e.message); }
  }, [month]);

  useEffect(() => { load(); }, [load]);

  const pay = async (id: string) => {
    setBusy(id); setErr(null);
    try { await post(`/api/finance/payroll/${id}/pay`, {}); await load(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const totalCash = runs.reduce((a, r) => a + r.cash_due, 0);
  const totalAccrued = runs.reduce((a, r) => a + r.accrued, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Cash payroll this month" value={fmtKobo(totalCash)} icon={Wallet} />
        <Stat label="Accrued this month" value={fmtKobo(totalAccrued)} tone="amber"
              sub="half the shortfall; the rest is extinguished" />
        <Stat label="Total deferred liability"
              value={fmtKobo(deferred?.total_liability || 0)} tone="red"
              sub="survives termination" />
      </div>

      {deferred?.triggers?.band5_three_months && (
        <Note tone="indigo" title="Payment trigger met.">
          Three consecutive months at Band 5. Deferred salary now falls due in
          monthly instalments of at least ₦100,000 for officers and ₦150,000
          for the founder, until cleared.
        </Note>
      )}

      <Field label="Month">
        <input type="month" className={inputCls + ' max-w-[200px]'} value={month}
               onChange={(e) => setMonth(e.target.value)} />
      </Field>

      {err && <Note tone="rose">{err}</Note>}

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Payroll register
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Due by the 10th of the following month. The founder ranks last and
            cannot be paid while any officer is still owed.
          </p>
        </div>
        {runs.length === 0 ? (
          <Empty>Nothing for this month. Certify the month's gross profit first.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr><Th>Person</Th><Th>Band</Th><Th right>Full</Th><Th right>Cash due</Th>
                    <Th right>Paid</Th><Th right>Accrued</Th><Th>Status</Th><Th></Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {runs.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {r.full_name}
                      </p>
                      <p className="text-xs text-slate-500">{r.scale}</p>
                    </Td>
                    <Td><BandPill band={r.band} /></Td>
                    <Td right mono className="text-slate-500">{fmtKobo(r.full_salary)}</Td>
                    <Td right mono bold>{fmtKobo(r.cash_due)}</Td>
                    <Td right mono className={r.cash_paid >= r.cash_due
                      ? 'text-emerald-600' : 'text-slate-400'}>
                      {fmtKobo(r.cash_paid)}
                    </Td>
                    <Td right mono className="text-amber-600">{fmtKobo(r.accrued)}</Td>
                    <Td>
                      {r.paid_on ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Paid
                        </span>
                      ) : r.overdue ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600">
                          <AlertTriangle className="w-3.5 h-3.5" /> Overdue
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-400">
                          <Clock className="w-3.5 h-3.5" /> Due {new Date(r.due_on).toLocaleDateString('en-NG')}
                        </span>
                      )}
                    </Td>
                    <Td right>
                      {role === 'founder' && !r.paid_on && r.cash_due > 0 && (
                        <button onClick={() => pay(r.id)} disabled={busy === r.id}
                                className={btnGhost}>
                          {busy === r.id ? '…' : 'Mark paid'}
                        </button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Deferred Salary Account
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Half of every shortfall accrues. The other half is extinguished
            permanently and is never owed.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr><Th>Person</Th><Th right>Accrued</Th><Th right>Paid</Th>
                  <Th right>Balance</Th><Th right>Cap</Th><Th></Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(deferred?.balances || []).map((b: any) => (
                <tr key={b.shareholder_id}>
                  <Td>{b.full_name}</Td>
                  <Td right mono className="text-slate-500">{fmtKobo(b.total_accrued)}</Td>
                  <Td right mono className="text-slate-500">{fmtKobo(b.total_paid)}</Td>
                  <Td right mono bold>{fmtKobo(b.balance)}</Td>
                  <Td right mono className="text-slate-400">{fmtKobo(b.deferred_cap)}</Td>
                  <Td>
                    {b.at_cap && (
                      <span className="text-xs font-bold text-amber-600">
                        At cap — accrual stopped
                      </span>
                    )}
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

// ==========================================================================
// Section 6 -- milestones
// ==========================================================================

const CHALLENGE_TONE: Record<string, string> = {
  issued: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  accepted: 'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400',
  completed: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  declined: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400',
  not_completed: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400',
  expired: 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400',
};

export function MilestonesTab({ get, post, put, role }: any) {
  const [awards, setAwards] = useState<any[]>([]);
  const [table, setTable] = useState<any>(null);
  const [mode, setMode] = useState<'current' | 'if_all_vest' | 'scenario'>('current');
  const [on, setOn] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const q = mode === 'scenario' ? `?on=${on.join(',')}` : '';
      const [a, t] = await Promise.all([
        get('/api/finance/awards'),
        get(`/api/finance/cap-table/${mode}${q}`),
      ]);
      setAwards(a); setTable(t);
    } catch (e: any) { setErr(e.message); }
  }, [mode, on]);

  useEffect(() => { load(); }, [load]);

  const toggle = (id: string) =>
    setOn((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  return (
    <div className="space-y-6">
      <Note tone="slate" title="No award has vested yet.">
        Laniyan's 10,000 Class A shares come <strong>by transfer from the
        founder</strong> — the company's share count does not change and no
        filing is needed. The other three are <strong>new issues</strong>: the
        share count rises, the capital rises, and the memorandum has to be
        amended.
      </Note>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'current', label: 'Current' },
          { id: 'if_all_vest', label: 'If everything vests' },
          { id: 'scenario', label: 'Scenario' },
        ].map((m) => (
          <button key={m.id} onClick={() => setMode(m.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    mode === m.id ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'scenario' && (
        <Card className="p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            Which awards land?
          </p>
          <div className="flex flex-wrap gap-4">
            {awards.map((a) => (
              <label key={a.scheme.id}
                     className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={on.includes(a.scheme.id)}
                       onChange={() => toggle(a.scheme.id)} />
                {a.scheme.holderName}
                <span className="text-xs text-slate-500">
                  ({shares(a.atLongstop.totalVested)} {a.scheme.classCode})
                </span>
              </label>
            ))}
          </div>
        </Card>
      )}

      {err && <Note tone="rose">{err}</Note>}

      {table && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Stat label="Total shares" value={shares(table.totalShares)} />
            <Stat label="Share capital" value={fmtKobo(table.issuedCapital)} />
            <Stat label="Total votes" value={shares(table.totalVotes)} />
            <Stat label="New shares to issue"
                  value={shares(table.filing.newShares)}
                  tone={table.filing.newShares > 0 ? 'amber' : 'slate'}
                  sub={table.filing.requiresCacFiling
                    ? 'CAC filing required' : 'no filing needed'} />
          </div>

          {table.filing.newShares > 0 && (
            <Note tone="amber" title="Filing tracker">
              {shares(table.filing.newShares)} new shares would take the share
              capital to {fmtKobo(table.issuedCapital)}. Memorandum Clause 6
              becomes {shares(table.sharesByClass.A)} Class A and{' '}
              {shares(table.sharesByClass.B)} Class B. Nothing files until a
              milestone actually vests.
            </Note>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr><Th>Holder</Th><Th right>Class A</Th><Th right>Class B</Th>
                      <Th right>Total</Th><Th right>Economic</Th><Th right>Voting</Th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {table.holders.map((h: any) => (
                    <tr key={h.holderId}>
                      <Td>
                        <p className="font-medium text-slate-800 dark:text-slate-200">{h.name}</p>
                        {h.role && <p className="text-xs text-slate-500">{h.role}</p>}
                      </Td>
                      <Td right mono className={h.byClass.A > 0
                        ? 'text-indigo-600 dark:text-indigo-400 font-bold' : 'text-slate-300'}>
                        {h.byClass.A > 0 ? shares(h.byClass.A) : '—'}
                      </Td>
                      <Td right mono className={h.byClass.B > 0 ? '' : 'text-slate-300'}>
                        {h.byClass.B > 0 ? shares(h.byClass.B) : '—'}
                      </Td>
                      <Td right mono bold>{shares(h.totalShares)}</Td>
                      <Td right mono bold>{pct(h.economicPct)}</Td>
                      <Td right mono bold className="text-indigo-600 dark:text-indigo-400">
                        {pct(h.votingPct)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <div className="space-y-4">
        {awards.map((a) => (
          <AwardCard key={a.scheme.id} award={a} get={get} post={post} put={put}
                     role={role} onChange={load} />
        ))}
      </div>
    </div>
  );
}

function AwardCard({ award, post, put, role, onChange }: any) {
  const { scheme, now, atLongstop, daysToLongstop } = award;
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ description: '', acceptance_criteria: '',
                                     allocated_shares: '', deliver_by: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addChallenge = async () => {
    setBusy(true); setErr(null);
    try {
      await post(`/api/finance/awards/${scheme.id}/challenges`, {
        ...form, allocated_shares: Number(form.allocated_shares) });
      setForm({ description: '', acceptance_criteria: '',
                allocated_shares: '', deliver_by: '' });
      setAdding(false);
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const setStatus = async (id: string, status: string) => {
    setErr(null);
    try { await post(`/api/finance/challenges/${id}/status`, { status }); onChange(); }
    catch (e: any) { setErr(e.message); }
  };

  const certify = async (id: string) => {
    setErr(null);
    try { await post(`/api/finance/tranches/${id}/certify`, {}); onChange(); }
    catch (e: any) { setErr(e.message); }
  };

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-bold text-slate-800 dark:text-slate-200">
              {scheme.holderName}
            </p>
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
              scheme.mechanism === 'transfer'
                ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400'
                : 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400'}`}>
              {scheme.mechanism === 'transfer'
                ? <><ArrowRightLeft className="w-3 h-3" /> Transfer</>
                : <><FilePlus2 className="w-3 h-3" /> New issue</>}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Up to {shares(scheme.awardTotal)} Class {scheme.classCode} ·
            longstop {new Date(scheme.longstopDate).toLocaleDateString('en-NG')} ·{' '}
            <span className={daysToLongstop < 60 ? 'text-amber-600 font-bold' : ''}>
              {daysToLongstop > 0 ? `${daysToLongstop} days left` : 'passed'}
            </span>
          </p>
        </div>
        {role === 'founder' && scheme.kind === 'challenge' && (
          <button onClick={() => setAdding(!adding)} className={btnGhost}>
            {adding ? 'Cancel' : '+ Challenge'}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-center">
        {[
          ['Awarded', shares(scheme.awardTotal), 'text-slate-800 dark:text-slate-200'],
          ['Vested', shares(now.vestedFromChallenges), 'text-emerald-600'],
          ['Lapsed', shares(now.lapsed), 'text-rose-600'],
          ['Default award', shares(now.defaultAward), 'text-indigo-600'],
          ['If all resolves', shares(atLongstop.totalVested), 'text-slate-800 dark:text-slate-200 font-bold'],
        ].map(([label, value, tone]) => (
          <div key={label as string}>
            <p className="text-[10px] font-bold text-slate-500 uppercase">{label}</p>
            <p className={`font-mono font-bold ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      {now.lapsed > 0 && (
        <p className="text-xs text-rose-600 dark:text-rose-400 mt-3">
          {shares(now.lapsed)} shares have lapsed permanently. They do not return
          to the default award.
        </p>
      )}

      {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}

      {adding && (
        <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 space-y-3">
          <Field label="Description">
            <input className={inputCls} value={form.description}
                   onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Acceptance criteria">
            <textarea className={inputCls} rows={2} value={form.acceptance_criteria}
                      onChange={(e) => setForm({ ...form, acceptance_criteria: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shares allocated">
              <input type="number" className={inputCls} value={form.allocated_shares}
                     onChange={(e) => setForm({ ...form, allocated_shares: e.target.value })} />
            </Field>
            <Field label="Deliver by">
              <input type="date" className={inputCls} value={form.deliver_by}
                     onChange={(e) => setForm({ ...form, deliver_by: e.target.value })} />
            </Field>
          </div>
          <p className="text-xs text-slate-500">
            Allocating shares to a challenge reduces the default award, whether
            or not the challenge is completed.
          </p>
          <button onClick={addChallenge} className={btnCls}
                  disabled={busy || !form.description || !form.allocated_shares}>
            {busy ? 'Issuing…' : 'Issue challenge'}
          </button>
        </div>
      )}

      {(scheme.challenges?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-2">
          {scheme.challenges.map((c: any) => (
            <div key={c.id}
                 className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {c.description}
                </p>
                <p className="text-xs text-slate-500">
                  {shares(c.allocatedShares)} shares · respond by{' '}
                  {new Date(c.respondBy).toLocaleDateString('en-NG')}
                </p>
              </div>
              <span className={`text-xs font-bold px-2 py-1 rounded ${CHALLENGE_TONE[c.status]}`}>
                {c.status.replace('_', ' ')}
              </span>
              {role === 'founder' && ['issued', 'accepted'].includes(c.status) && (
                <div className="flex gap-1">
                  <button onClick={() => setStatus(c.id, 'completed')}
                          className="p-1.5 rounded hover:bg-emerald-100 dark:hover:bg-emerald-950 text-emerald-600"
                          title="Completed">
                    <CheckCircle2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setStatus(c.id, 'not_completed')}
                          className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600"
                          title="Not completed — shares lapse">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(scheme.tranches?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock className="w-3.5 h-3.5" />
            Milestones must be recorded by 30 September 2026 and certified by a
            director other than the founder.
          </div>
          {scheme.tranches.map((t: any) => (
            <TrancheRow key={t.id} tranche={t} role={role} put={put}
                        certify={certify} onChange={onChange} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TrancheRow({ tranche: t, role, put, certify, onChange }: any) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(t.milestoneDescription || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // The Articles fix this date. After it the server refuses the write and a
  // database trigger refuses it again, so the UI stops offering the field
  // rather than letting somebody type a milestone out and lose it on save.
  const locked = new Date() > new Date('2026-09-30T23:59:59.999Z');

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await put(`/api/finance/tranches/${t.id}`, { milestone_description: text });
      setEditing(false);
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-3">
        <Target className="w-4 h-4 text-slate-400 shrink-0" />
        <div className="flex-1 min-w-[180px]">
          <p className="text-sm text-slate-800 dark:text-slate-200">
            Tranche {t.index} · {shares(t.shares)} Class A
          </p>
          {!editing && (
            <p className={`text-xs ${t.milestoneDescription
              ? 'text-slate-500' : 'text-amber-600 dark:text-amber-500 font-medium'}`}>
              {t.milestoneDescription
                || (locked
                    ? 'No milestone was recorded before the deadline — this tranche cannot be earned'
                    : 'No milestone recorded yet')}
            </p>
          )}
        </div>

        {t.certifiedBy ? (
          <span className="text-xs font-bold text-emerald-600">
            Certified by {t.certifiedBy}
          </span>
        ) : (
          <div className="flex items-center gap-2">
            {role === 'founder' && !locked && !editing && (
              <button onClick={() => setEditing(true)} className={btnGhost}>
                {t.milestoneDescription ? 'Edit' : 'Record milestone'}
              </button>
            )}
            {role === 'director' && t.milestoneDescription && (
              <button onClick={() => certify(t.id)} className={btnGhost}>Certify</button>
            )}
            {role !== 'director' && (
              <span className="text-xs text-slate-400">Awaiting a director</span>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <textarea className={inputCls} rows={2} value={text} autoFocus
                    placeholder="What has to happen for this tranche to be earned?"
                    onChange={(e) => setText(e.target.value)} />
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !text.trim()} className={btnCls}>
              {busy ? 'Saving…' : 'Save milestone'}
            </button>
            <button onClick={() => { setEditing(false); setText(t.milestoneDescription || ''); }}
                    className={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================================================
// Section 8 -- the stakeholder's own view
// ==========================================================================

export function StakeholderTab({ get }: any) {
  const [me, setMe] = useState<any>(null);
  const [view, setView] = useState<'shares' | 'money'>('shares');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    get('/api/finance/me').then(setMe).catch((e: any) => setErr(e.message));
  }, []);

  if (err) return <Note tone="rose">{err}</Note>;
  if (!me) return <Empty>Loading…</Empty>;
  if (!me.linked) {
    return (
      <Note tone="slate" title="This login is not linked to a shareholding.">
        Link it under Access, or sign in as a shareholder.
      </Note>
    );
  }

  const h = me.holding;

  return (
    <div className="space-y-6">
      {/* Shares first, deliberately. Section 8: the naira figures sit on a
          second tab so nobody's morale is tied to a number that drops daily
          in a pre-revenue month. */}
      <div className="flex gap-2">
        {[
          { id: 'shares', label: 'What I own' },
          { id: 'money', label: 'What it is worth' },
        ].map((t) => (
          <button key={t.id} onClick={() => setView(t.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                    view === t.id ? 'bg-indigo-600 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'shares' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Stat label="Shares held" value={shares(h.shares)}
                  sub={`${h.byClass.A ? `${shares(h.byClass.A)} Class A` : ''}${
                    h.byClass.A && h.byClass.B ? ' · ' : ''}${
                    h.byClass.B ? `${shares(h.byClass.B)} Class B` : ''}`} />
            <Stat label="Share of the company" value={pct(h.economicPct)} tone="indigo" />
            <Stat label="Share of the votes" value={pct(h.votingPct)} tone="indigo"
                  sub="Class A carries ten votes each" />
          </div>
          <Note tone="slate">
            This is the only hard fact on this page. It changes when a share
            transaction happens, and at no other time.
          </Note>
        </>
      ) : (
        <>
          <Note tone="amber" title="There is no share price.">
            The company has never raised money, so nothing here is a market
            value. ₦10 is par value — a legal minimum. Every figure below says
            what it is based on and when it was set.
          </Note>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {me.figures.map((f: any) => (
              <BasisFigure key={f.key} label={f.label} amount={f.amount}
                           basis={f.basis} asOf={f.asOf} movesWhen={f.movesWhen}
                           negativeOk={f.key === 'retained_share'} />
            ))}
          </div>

          <Note tone="slate">{me.disclaimer}</Note>
        </>
      )}

      {me.deferred && (
        <Card className="p-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
            My deferred salary
          </h2>
          <div className="flex items-end gap-6">
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Owed to me</p>
              <p className="text-2xl font-mono font-bold text-slate-800 dark:text-slate-100">
                {fmtKobo(me.deferred.balance)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">Cap</p>
              <p className="text-lg font-mono text-slate-400">
                {fmtKobo(me.deferred.cap)}
              </p>
            </div>
          </div>
          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3">
            <div className="h-full bg-indigo-500 rounded-full"
                 style={{ width: `${Math.min(100,
                   (me.deferred.balance / Math.max(1, me.deferred.cap)) * 100)}%` }} />
          </div>
        </Card>
      )}

      {me.awards?.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            My milestone progress
          </h2>
          {me.awards.map((a: any) => (
            <Card key={a.scheme.id} className="p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-slate-800 dark:text-slate-200">
                  Up to {shares(a.scheme.awardTotal)} Class {a.scheme.classCode}
                </p>
                <span className={`text-xs font-bold ${
                  a.daysToLongstop < 60 ? 'text-amber-600' : 'text-slate-500'}`}>
                  {a.daysToLongstop > 0
                    ? `${a.daysToLongstop} days left` : 'longstop passed'}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 mt-4 text-center">
                {[
                  ['Vested', shares(a.progress.vestedFromChallenges), 'text-emerald-600'],
                  ['Lapsed', shares(a.progress.lapsed), 'text-rose-600'],
                  ['Default', shares(a.progress.defaultAward), 'text-indigo-600'],
                  ['Still open', shares(a.progress.pending), 'text-slate-500'],
                ].map(([l, v, tone]) => (
                  <div key={l as string}>
                    <p className="text-[10px] font-bold text-slate-500 uppercase">{l}</p>
                    <p className={`font-mono font-bold ${tone}`}>{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
