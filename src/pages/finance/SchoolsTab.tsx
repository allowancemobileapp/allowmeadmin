import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Stat, Field, Empty, Note, Th, Td, inputCls, btnCls, btnGhost,
} from './ui';
import { School, Plus, TrendingUp, Users, AlertTriangle, Receipt,
         RotateCcw, Undo2, ListTree } from 'lucide-react';
import {
  StatusPill, PayPartnerModal, RenewModal, BreakdownModal, PayoutHistory,
} from './CampusPartner';

const naira = (n: number) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

const KINDS = [
  { id: 'student_association', label: 'Student association' },
  { id: 'exco',                label: 'Exco member' },
  { id: 'matron',              label: 'Matron' },
  { id: 'ambassador',          label: 'Campus ambassador' },
  { id: 'institution',         label: 'The institution' },
  { id: 'staff',               label: 'Staff member' },
  { id: 'other',               label: 'Other' },
];

/**
 * What each campus earns, and who takes a cut of it.
 *
 * The partnership proposal offers a student association 10% of the gross
 * profit generated FROM THEIR CAMPUS, doubling to 15% past 1,000 referrals,
 * "for the exact duration of your current administrative tenure". Two things
 * follow that the app has to get right: the percentage applies to one campus
 * and not the company, and it EXPIRES. An agreement past its end date is
 * shown as lapsed and stops counting against the money.
 */
export function SchoolsTab({ get, post, put, del, period, role }: any) {
  const [data, setData] = useState<any>(null);
  const [schools, setSchools] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<any>(null);
  const [renewing, setRenewing] = useState<any>(null);
  const [breakdown, setBreakdown] = useState<any>(null);
  const [openHistory, setOpenHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await get(`/api/live/schools?period=${period}`);
      setData(d);
    } catch (e: any) { setErr(e.message); }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    get('/api/live/schools/list').then(setSchools).catch(() => setSchools([]));
    get('/api/people').then(setPeople).catch(() => setPeople([]));
  }, []);

  if (err) {
    return (
      <Note tone="rose" title="Could not load campuses.">
        {err}
        <br />
        If this mentions a missing function, run
        migrations/0086_tags_schools_live_split.sql.
      </Note>
    );
  }
  if (!data) return <Empty>Loading…</Empty>;

  const isFounder = role === 'founder';
  const totalCollected = data.schools.reduce(
    (a: number, s: any) => a + s.collected, 0);
  const totalOwed = data.schools.reduce(
    (a: number, s: any) => a + s.owed_to_partners, 0);
  const unattributed = data.schools.find(
    (s: any) => s.school_id === null || s.school_name === 'Unattributed');

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="Campuses earning" icon={School}
              value={data.schools.filter((s: any) => s.school_id).length}
              sub={data.period.label} />
        <Stat label="Collected" value={naira(totalCollected)} icon={TrendingUp}
              tone="green" />
        <Stat label="Owed to partners" value={naira(totalOwed)} icon={Users}
              tone="amber" sub="off the top, before any shareholder split" />
      </div>

      {unattributed && unattributed.collected > 0 && (
        <Note tone="amber" title="Some income cannot be traced to a campus.">
          {naira(unattributed.collected)} came in from payers whose campus
          is not recorded. Campus revenue shares are calculated only on
          traceable income, so a partner is never paid on money that might not
          be theirs.
        </Note>
      )}

      {isFounder && (
        <div className="flex justify-end">
          <button onClick={() => setAdding(!adding)} className={btnCls}>
            <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {adding ? 'Cancel' : 'Add a campus agreement'}
          </button>
        </div>
      )}

      {adding && (
        <AddPartner schools={schools} people={people} post={post}
                    onDone={() => { setAdding(false); load(); }} />
      )}

      {paying && (
        <PayPartnerModal partner={paying} period={data.period} post={post}
                         onClose={() => setPaying(null)}
                         onDone={() => { setPaying(null); load(); }} />
      )}
      {renewing && (
        <RenewModal partner={renewing} post={post}
                    onClose={() => setRenewing(null)}
                    onDone={() => { setRenewing(null); load(); }} />
      )}
      {breakdown && (
        <BreakdownModal school={breakdown} period={data.period} get={get}
                        onClose={() => setBreakdown(null)} />
      )}

      {data.schools.length === 0 ? (
        <Empty>No campus income recorded in this period.</Empty>
      ) : data.schools.map((s: any) => (
        <Card key={String(s.school_id)} className="overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {s.school_name}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {s.payments} payment{s.payments === 1 ? '' : 's'} ·{' '}
                {naira(s.collected)} collected
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                {naira(s.company_keeps)}
              </p>
              <p className="text-xs text-slate-500">
                the company keeps
                {s.owed_to_partners > 0 &&
                  ` · ${naira(s.owed_to_partners)} to partners`}
              </p>
              <button onClick={() => setBreakdown(s)}
                      className={btnGhost + ' mt-2'}>
                <ListTree className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Every payment
              </button>
            </div>
          </div>

          {s.partners.length === 0 ? (
            <div className="p-5">
              <p className="text-sm text-slate-500">
                No revenue-share agreement on this campus. All of it is the
                company&rsquo;s.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>Partner</Th><Th>Type</Th><Th right>Cut</Th>
                  <Th right>Earns</Th><Th>Runs until</Th>
                  {isFounder && <Th></Th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {s.partners.map((p: any) => (
                  <React.Fragment key={p.id}>
                    <tr className={p.status === 'active' ? '' : 'opacity-60'}>
                      <Td>
                        <p className="text-sm text-slate-800 dark:text-slate-200">
                          {p.person_name || p.body_name}
                        </p>
                        {p.contact && (
                          <p className="text-xs text-slate-500">{p.contact}</p>
                        )}
                        <div className="mt-1">
                          <StatusPill status={p.status} endsOn={p.ends_on} />
                        </div>
                      </Td>
                      <Td className="text-xs text-slate-500">
                        {KINDS.find((k) => k.id === p.kind)?.label || p.kind}
                      </Td>
                      <Td right mono>{p.percent}%</Td>
                      <Td right mono bold>
                        {/* What this agreement ACTUALLY earned in the window,
                            scoped to its own start and end dates. A pending
                            one earns nothing, which is what a start date is
                            for. */}
                        {p.earned_this_period > 0
                          ? naira(p.earned_this_period)
                          : <span className="text-slate-400">—</span>}
                        {p.outstanding > 0 && (
                          <span className="block text-[10px] font-normal text-amber-600">
                            {naira(p.outstanding)} owed
                          </span>
                        )}
                      </Td>
                      <Td>
                        {p.status === 'pending' ? (
                          <span className="text-xs text-sky-600">
                            starts {new Date(p.starts_on).toLocaleDateString('en-NG')}
                          </span>
                        ) : p.ends_on ? (
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {new Date(p.ends_on).toLocaleDateString('en-NG')}
                          </span>
                        ) : (
                          <span className="text-xs text-amber-600">
                            no end date set
                          </span>
                        )}
                      </Td>
                      {isFounder && (
                        <Td right>
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <button className={btnGhost}
                                    onClick={() => setOpenHistory(
                                      openHistory === p.id ? null : p.id)}>
                              <Receipt className="w-3.5 h-3.5" />
                            </button>

                            {(p.outstanding > 0 || p.earned_this_period > 0) && (
                              <button className={btnCls} onClick={() => setPaying(p)}>
                                Paid
                              </button>
                            )}

                            {/* Ran out, or ended by hand. Renew extends the
                                same agreement so its payout history stays
                                attached; restore only switches it back on. */}
                            {(p.status === 'lapsed' || p.status === 'ended') && (
                              <button className={btnGhost}
                                      onClick={() => setRenewing(p)}>
                                <RotateCcw className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                                Renew
                              </button>
                            )}

                            {p.status === 'ended' ? (
                              <button className={btnGhost}
                                onClick={async () => {
                                  const r = await post(
                                    `/api/live/schools/partners/${p.id}/restore`, {});
                                  if (r?.status === 'lapsed') {
                                    alert('Restored — but its end date has already '
                                          + 'passed, so it still earns nothing. '
                                          + 'Renew it to set a new one.');
                                  }
                                  load();
                                }}>
                                <Undo2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                                Restore
                              </button>
                            ) : (
                              <button className={btnGhost}
                                onClick={async () => {
                                  await del(`/api/live/schools/partners/${p.id}`);
                                  load();
                                }}>
                                End it
                              </button>
                            )}
                          </div>
                        </Td>
                      )}
                    </tr>
                    {openHistory === p.id && (
                      <tr>
                        <td colSpan={isFounder ? 6 : 5}
                            className="bg-slate-50 dark:bg-slate-800/30">
                          <PayoutHistory partner={p} get={get} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      ))}
    </div>
  );
}

function AddPartner({ schools, people, post, onDone }: any) {
  const [f, setF] = useState<any>({ kind: 'student_association', percent: 10 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try { await post('/api/live/schools/partners', f); onDone(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5 space-y-4">
      <Note tone="slate">
        The percentage applies to <strong>that campus&rsquo;s</strong> gross
        profit only, not the company&rsquo;s. Set an end date — the standard
        offer runs for the duration of one administrative tenure, and an
        agreement with no end date never stops costing money.
      </Note>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Campus">
          <select className={inputCls} value={f.school_id || ''}
                  onChange={(e) => setF({ ...f, school_id: e.target.value })}>
            <option value="">Choose a campus…</option>
            {schools.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Type">
          <select className={inputCls} value={f.kind}
                  onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </Field>

        <Field label="Who they are"
               hint="Pick somebody on the register, or type a body like a students' union.">
          <select className={inputCls} value={f.person_id || ''}
                  onChange={(e) => setF({ ...f, person_id: e.target.value || null })}>
            <option value="">Not a person on the register</option>
            {people.map((p: any) => (
              <option key={p.id} value={p.id}>{p.full_name}</option>
            ))}
          </select>
        </Field>

        {!f.person_id && (
          <Field label="Name of the body">
            <input className={inputCls} value={f.body_name || ''}
                   placeholder="e.g. UNILAG Students' Union"
                   onChange={(e) => setF({ ...f, body_name: e.target.value })} />
          </Field>
        )}

        <Field label="Contact">
          <input className={inputCls} value={f.contact || ''}
                 placeholder="Phone or email"
                 onChange={(e) => setF({ ...f, contact: e.target.value })} />
        </Field>

        <Field label="Their cut (%)"
               hint="The standard offer is 10%, doubling to 15% past 1,000 referrals.">
          <input type="number" step="0.5" className={inputCls} value={f.percent}
                 onChange={(e) => setF({ ...f, percent: e.target.value })} />
        </Field>

        <Field label="Starts">
          <input type="date" className={inputCls} value={f.starts_on || ''}
                 onChange={(e) => setF({ ...f, starts_on: e.target.value })} />
        </Field>

        <Field label="Ends" hint="When their tenure finishes.">
          <input type="date" className={inputCls} value={f.ends_on || ''}
                 onChange={(e) => setF({ ...f, ends_on: e.target.value })} />
        </Field>
      </div>

      {!f.ends_on && (
        <Note tone="amber">
          No end date. This will keep taking a cut of that campus for ever
          until somebody ends it by hand.
        </Note>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <button onClick={save} className={btnCls}
              disabled={busy || !f.school_id || (!f.person_id && !f.body_name?.trim())}>
        {busy ? 'Saving…' : 'Add agreement'}
      </button>
    </Card>
  );
}
