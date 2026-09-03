import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card, Stat, Field, Empty, Note, Th, Td,
  fmtKobo, shares, inputCls, btnCls, btnGhost,
} from './ui';
import { authHeadersForUpload } from '../../hooks/useApi';
import { ProfilePane } from './ProfilePane';
import {
  UserPlus, KeyRound, FileText, Gift, Upload, ExternalLink,
  ShieldCheck, Wallet, Users, Ban, Loader2,
  UserCircle,
} from 'lucide-react';

/**
 * Staff and stakeholders, one list.
 *
 * The founder sees and edits everything. Anybody else sees the roster and
 * their own row only -- the server strips other people's salary, deferred
 * balance and contract count before it sends the list, so it is not a
 * question of what this component chooses to render.
 */

const ACCESS_ROLES = [
  { id: 'stakeholder', label: 'Stakeholder',
    hint: 'Sees only their own stake, pay and milestones.' },
  { id: 'director', label: 'Director',
    hint: 'Sees everything except other people’s salaries. Can sign off the founder’s milestones.' },
  { id: 'founder', label: 'Founder',
    hint: 'Full control. Only role that can certify gross profit or change pay.' },
];

const REWARD_KINDS = [
  { id: 'bonus', label: 'Bonus' },
  { id: 'commission', label: 'Commission' },
  { id: 'gift', label: 'Gift' },
  { id: 'expense_reimbursement', label: 'Expense reimbursement' },
  { id: 'share_award', label: 'Share award' },
];

export function PeopleTab({ get, post, put, del, role }: any) {
  const [people, setPeople] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try { setPeople(await get('/api/people')); }
    catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const isFounder = role === 'founder';
  const staff = people.filter((p) => p.is_staff);
  const owners = people.filter((p) => p.shares > 0);
  const withAccess = people.filter((p) => p.login_email && p.login_active);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label="People" value={people.length} icon={Users}
              sub={`${staff.length} on staff`} />
        <Stat label="Own part of the company" value={owners.length} icon={ShieldCheck} />
        <Stat label="Can sign in" value={withAccess.length} icon={KeyRound}
              tone="indigo" sub="finance pages only" />
      </div>

      {err && <Note tone="rose" title="Could not load.">{err}</Note>}

      {isFounder && (
        <div className="flex justify-between items-center gap-4 flex-wrap">
          <Note tone="slate">
            Giving somebody access here lets them into the <strong>finance
            pages only</strong>. It does not let them into gists, users or
            moderation — those live under Account Permissions.
          </Note>
          <button onClick={() => setAdding(!adding)} className={btnCls}>
            <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {adding ? 'Cancel' : 'Add a person'}
          </button>
        </div>
      )}

      {adding && <AddPerson post={post} onDone={() => { setAdding(false); load(); }} />}

      {loading ? <Empty>Loading…</Empty> : people.length === 0 ? (
        <Empty>Nobody here yet. Run migration 0083, then add a person.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>Person</Th><Th>Access</Th><Th right>Shares</Th>
                  <Th right>Salary</Th><Th>Contract</Th><Th></Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {people.map((p) => (
                  <React.Fragment key={p.id}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <Td>
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {p.full_name}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {p.is_founder && <TagPill tone="indigo">Founder</TagPill>}
                          {p.is_cofounder && !p.is_founder && <TagPill tone="indigo">Co-founder</TagPill>}
                          {(p.tagged_director || p.is_director) && <TagPill tone="violet">Director</TagPill>}
                          {p.shares > 0 && <TagPill tone="emerald">Shareholder</TagPill>}
                          {p.is_staff && <TagPill tone="slate">Staff</TagPill>}
                          {p.is_founding_team && <TagPill tone="amber">Founding team</TagPill>}
                          {p.is_investor && <TagPill tone="cyan">Investor</TagPill>}
                          {p.is_external && <TagPill tone="slate">External</TagPill>}
                        </div>
                        <p className="text-xs text-slate-500">
                          {p.staff_role || p.role_title || 'No title'}
                          {p.employment_status !== 'active' && (
                            <span className="ml-2 text-amber-600 font-medium">
                              {p.employment_status.replace('_', ' ')}
                            </span>
                          )}
                        </p>
                      </Td>
                      <Td>
                        {p.login_email && p.login_active ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400">
                            <KeyRound className="w-3 h-3" /> {p.access_role}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">No access</span>
                        )}
                      </Td>
                      <Td right mono>
                        {p.shares > 0 ? shares(p.shares)
                          : <span className="text-slate-300">—</span>}
                      </Td>
                      <Td right mono>
                        {p.restricted ? <span className="text-slate-300">—</span>
                          : p.full_salary ? fmtKobo(p.full_salary)
                          : <span className="text-slate-300">not set</span>}
                      </Td>
                      <Td>
                        {p.contract_count > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-bold">
                            <FileText className="w-3 h-3" /> {p.contract_count}
                          </span>
                        ) : <span className="text-xs text-slate-400">none</span>}
                      </Td>
                      <Td right>
                        <button onClick={() => setOpenId(openId === p.id ? null : p.id)}
                                className={btnGhost}>
                          {openId === p.id ? 'Close' : 'Manage'}
                        </button>
                      </Td>
                    </tr>
                    {openId === p.id && (
                      <tr>
                        <td colSpan={6} className="bg-slate-50 dark:bg-slate-800/30 p-5">
                          <PersonDetail person={p} isFounder={isFounder}
                                        get={get} post={post} put={put} del={del}
                                        onChange={load} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// --------------------------------------------------------------------------

function AddPerson({ post, onDone }: any) {
  const [f, setF] = useState<any>({ is_staff: true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try { await post('/api/people', f); onDone(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Full name">
          <input className={inputCls} value={f.full_name || ''} autoFocus
                 onChange={(e) => setF({ ...f, full_name: e.target.value })} />
        </Field>
        <Field label="Job title">
          <input className={inputCls} value={f.role_title || ''} placeholder="e.g. Designer"
                 onChange={(e) => setF({ ...f, role_title: e.target.value })} />
        </Field>
        <Field label="Email" hint="Used later to give them access.">
          <input className={inputCls} type="email" value={f.email || ''}
                 onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className={inputCls} value={f.phone || ''}
                 onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={f.is_founding_team || false}
               onChange={(e) => setF({ ...f, is_founding_team: e.target.checked })} />
        Founding Team Member
        <span className="text-xs text-slate-500">
          (only these people may ever hold Class A shares)
        </span>
      </label>
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button onClick={save} disabled={busy || !f.full_name?.trim()} className={btnCls}>
        {busy ? 'Saving…' : 'Add person'}
      </button>
    </Card>
  );
}

// --------------------------------------------------------------------------

function PersonDetail({ person: p, isFounder, get, post, put, del, onChange }: any) {
  const [pane, setPane] = useState<string>(isFounder ? 'tags' : 'contracts');

  const panes = isFounder
    ? [
        { id: 'profile', label: 'Profile', icon: UserCircle },
        { id: 'tags', label: 'Role & tags', icon: ShieldCheck },
        { id: 'access', label: 'Access', icon: KeyRound },
        { id: 'salary', label: 'Salary', icon: Wallet },
        { id: 'contracts', label: 'Contracts', icon: FileText },
        { id: 'rewards', label: 'Rewards', icon: Gift },
      ]
    : [{ id: 'profile', label: 'My details', icon: UserCircle },
       { id: 'contracts', label: 'My documents', icon: FileText }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {panes.map((x) => (
          <button key={x.id} onClick={() => setPane(x.id as any)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
              pane === x.id ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            <x.icon className="w-3.5 h-3.5" /> {x.label}
          </button>
        ))}
      </div>

      {pane === 'profile'   && <ProfilePane p={p} get={get} put={put}
                                            isFounder={isFounder} onChange={onChange} />}
      {pane === 'tags'      && <TagsPane p={p} put={put} onChange={onChange} />}
      {pane === 'access'    && <AccessPane p={p} post={post} del={del} onChange={onChange} />}
      {pane === 'salary'    && <SalaryPane p={p} put={put} onChange={onChange} />}
      {pane === 'contracts' && <ContractsPane p={p} get={get} isFounder={isFounder} onChange={onChange} />}
      {pane === 'rewards'   && <RewardsPane p={p} get={get} post={post} onChange={onChange} />}
    </div>
  );
}


function TagPill({ children, tone = 'slate' }: any) {
  const tones: Record<string, string> = {
    indigo:  'bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400',
    violet:  'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400',
    emerald: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
    amber:   'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
    cyan:    'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-400',
    slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  };
  return (
    <span className={'text-[10px] font-bold px-1.5 py-0.5 rounded ' + tones[tone]}>
      {children}
    </span>
  );
}

/**
 * What a person IS to the company.
 *
 * These are separate flags on purpose. An admin can be a stakeholder without
 * being staff; a designer can be staff without owning a share; a director
 * need be neither. Collapsing them into one "role" is exactly what left round
 * modelling unable to tell an owner from an employee from an outsider.
 */
function TagsPane({ p, put, onChange }: any) {
  const [f, setF] = useState<any>({
    staff_role: p.staff_role || p.role_title || '',
    role_title: p.role_title || '',
    is_cofounder: !!p.is_cofounder,
    is_director: !!(p.tagged_director ?? p.is_director),
    is_founding_team: !!p.is_founding_team,
    is_staff: !!p.is_staff,
    is_investor: !!p.is_investor,
    is_external: !!p.is_external,
    employment_status: p.employment_status || 'active',
    notes: p.notes || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await put('/api/people/' + p.id, f);
      setMsg('Saved.');
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const FLAGS = [
    { k: 'is_cofounder',     label: 'Co-founder',
      hint: 'Started the company with you.' },
    { k: 'is_director',      label: 'Director',
      hint: 'A director is the only person who can certify your own milestone shares.' },
    { k: 'is_founding_team', label: 'Founding Team Member',
      hint: 'Article 3: only these people may ever hold Class A shares.' },
    { k: 'is_staff',         label: 'Staff',
      hint: 'Works here. Separate from owning part of the company.' },
    { k: 'is_investor',      label: 'Investor',
      hint: 'Put money in rather than time.' },
    { k: 'is_external',      label: 'External',
      hint: 'An exco, a matron, a partner — not an employee.' },
  ];

  return (
    <div className="space-y-4 max-w-2xl">
      <Note tone="slate">
        A person can be several of these at once, and most of yours are. They
        are separate switches because round modelling and the campus split need
        to tell an owner from an employee from an outsider.
      </Note>

      {p.shares > 0 && (
        <Note tone="emerald" title="Shareholder.">
          {shares(p.shares)} shares on the register. That one is not a switch —
          it comes from the share register itself and changes only when shares
          actually move, on the Ownership tab.
        </Note>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Job title" hint="What they are called.">
          <input className={inputCls} value={f.role_title}
                 onChange={(e) => setF({ ...f, role_title: e.target.value })} />
        </Field>
        <Field label="Staff role" hint="What they actually do day to day.">
          <input className={inputCls} value={f.staff_role}
                 placeholder="e.g. Engineering, Growth, Design"
                 onChange={(e) => setF({ ...f, staff_role: e.target.value })} />
        </Field>
        <Field label="Employment status">
          <select className={inputCls} value={f.employment_status}
                  onChange={(e) => setF({ ...f, employment_status: e.target.value })}>
            <option value="active">Active</option>
            <option value="on_leave">On leave</option>
            <option value="left">Left</option>
            <option value="prospective">Prospective</option>
          </select>
        </Field>
      </div>

      <div className="space-y-2">
        {FLAGS.map((x) => (
          <label key={x.k}
                 className={'flex items-start gap-3 p-3 rounded-lg border cursor-pointer ' +
                   (f[x.k] ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                           : 'border-slate-200 dark:border-slate-700')}>
            <input type="checkbox" className="mt-0.5" checked={f[x.k]}
                   onChange={(e) => setF({ ...f, [x.k]: e.target.checked })} />
            <span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {x.label}
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">{x.hint}</span>
            </span>
          </label>
        ))}
      </div>

      <Field label="Notes">
        <textarea className={inputCls} rows={2} value={f.notes}
                  onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <button onClick={save} disabled={busy} className={btnCls}>
        {busy ? 'Saving…' : 'Save'}
      </button>
    </div>
  );
}

function AccessPane({ p, post, del, onChange }: any) {
  const [email, setEmail] = useState(p.login_email || p.email || '');
  const [role, setRole] = useState(p.access_role || 'stakeholder');
  const [isDirector, setIsDirector] = useState(!!p.is_director);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const grant = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await post(`/api/people/${p.id}/access`,
        { email, role, is_director: isDirector, active: true });
      setMsg(`${email} can now sign in as ${role}.`);
      onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try { await del(`/api/people/${p.id}/access`); setMsg('Access removed.'); onChange(); }
    catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Field label="Email they will sign in with">
        <input className={inputCls} type="email" value={email}
               onChange={(e) => setEmail(e.target.value)} />
      </Field>

      <Field label="What they can see">
        <div className="space-y-2">
          {ACCESS_ROLES.map((r) => (
            <label key={r.id}
                   className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                     role === r.id
                       ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                       : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" className="mt-0.5" checked={role === r.id}
                     onChange={() => setRole(r.id)} />
              <span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {r.label}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
        <input type="checkbox" checked={isDirector}
               onChange={(e) => setIsDirector(e.target.checked)} />
        Is a director
        <span className="text-xs text-slate-500">
          (a director is the only person who can sign off your own milestone shares)
        </span>
      </label>

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <div className="flex gap-2">
        <button onClick={grant} disabled={busy || !email.trim()} className={btnCls}>
          {busy ? 'Saving…' : p.login_email ? 'Update access' : 'Give access'}
        </button>
        {p.login_email && p.login_active && (
          <button onClick={revoke} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 text-sm font-bold">
            <Ban className="w-4 h-4 inline mr-1 -mt-0.5" /> Remove access
          </button>
        )}
      </div>
    </div>
  );
}

function SalaryPane({ p, put, onChange }: any) {
  const [scale, setScale] = useState(p.scale || 'flat');
  const [salary, setSalary] = useState(
    p.full_salary ? String(p.full_salary / 100) : '');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const banded = scale === 'officer' || scale === 'founder';

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await put(`/api/people/${p.id}/salary`,
        { scale, monthly_salary: Number(salary), resolution_ref: ref });
      setMsg('Saved.'); onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Field label="How they are paid">
        <div className="space-y-2">
          {[
            { id: 'flat', label: 'Flat monthly salary',
              hint: 'The same amount every month, whatever the company earns. No deferral.' },
            { id: 'officer', label: 'Officer (contract bands)',
              hint: 'Pay rises and falls with gross profit. Half of any shortfall is deferred, capped at ₦1,000,000.' },
            { id: 'founder', label: 'Founder (contract bands)',
              hint: 'Same idea, founder scale. Deferral capped at ₦1,500,000. Paid last.' },
          ].map((s) => (
            <label key={s.id}
                   className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer ${
                     scale === s.id
                       ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                       : 'border-slate-200 dark:border-slate-700'}`}>
              <input type="radio" className="mt-0.5" checked={scale === s.id}
                     onChange={() => setScale(s.id)} />
              <span>
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {s.label}
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Full monthly salary (₦)"
             hint={banded
               ? 'The full amount. What they actually receive each month depends on the band.'
               : 'Paid in full every month.'}>
        <input type="number" className={inputCls} value={salary}
               onChange={(e) => setSalary(e.target.value)} />
      </Field>

      {banded && (
        <Field label="Shareholder resolution reference"
               hint="Officer and founder pay is set by contract. Changing it needs the resolution that authorised it.">
          <input className={inputCls} value={ref} placeholder="e.g. Board resolution 2026-03"
                 onChange={(e) => setRef(e.target.value)} />
        </Field>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}
      {msg && <p className="text-sm text-emerald-600">{msg}</p>}

      <button onClick={save} disabled={busy || !salary} className={btnCls}>
        {busy ? 'Saving…' : 'Save salary'}
      </button>
    </div>
  );
}

const DOC_KINDS: Record<string, string> = {
  employment: 'Employment contract',
  offer: 'Offer letter',
  nda: 'NDA',
  amendment: 'Amendment',
  certification: 'Certification',
  qualification: 'Degree / diploma',
  reference: 'Reference letter',
  id_document: 'ID document',
  tax: 'Tax document',
  medical: 'Medical',
  other: 'Other',
};

function ContractsPane({ p, get, isFounder, onChange }: any) {
  const [list, setList] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('employment');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setList(await get(`/api/people/${p.id}/contracts`)); }
    catch (e: any) { setErr(e.message); }
  }, [p.id]);

  useEffect(() => { load(); }, [load]);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr('Choose a file first.'); return; }
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title || file.name);
      fd.append('kind', kind);
      // Sent with fetch rather than the JSON helper: this is multipart, and
      // setting Content-Type by hand would break the boundary marker.
      const res = await fetch(`/api/people/${p.id}/contracts`, {
        method: 'POST',
        headers: await authHeadersForUpload(),
        body: fd,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Upload failed.');
      }
      setTitle('');
      if (fileRef.current) fileRef.current.value = '';
      await load(); onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const open = async (c: any) => {
    setErr(null);
    try {
      const r = await get(`/api/people/${p.id}/contracts/${c.id}/link`);
      window.open(r.url, '_blank', 'noopener');
    } catch (e: any) { setErr(e.message); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Note tone="slate">
        Contracts are stored privately. A link works for five minutes and only
        you and {p.full_name?.split(' ')[0] || 'they'} can open it.
      </Note>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      {list.length === 0 ? (
        <p className="text-sm text-slate-500">No contract uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((c) => (
            <div key={c.id}
                 className={`flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 ${
                   c.superseded_by ? 'opacity-50' : ''}`}>
              <FileText className="w-4 h-4 text-indigo-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {c.title}
                </p>
                <p className="text-xs text-slate-500">
                  {DOC_KINDS[c.kind] || c.kind.replace('_', ' ')} ·{' '}
                  {new Date(c.uploaded_at).toLocaleDateString('en-NG')}
                  {c.superseded_by && ' · replaced'}
                </p>
              </div>
              <button onClick={() => open(c)} className={btnGhost}>
                <ExternalLink className="w-3.5 h-3.5 inline mr-1 -mt-0.5" /> Open
              </button>
            </div>
          ))}
        </div>
      )}

      {isFounder && (
        <div className="p-4 rounded-lg bg-white dark:bg-slate-800 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="What is it">
              <input className={inputCls} value={title} placeholder="Employment contract"
                     onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Type">
              <select className={inputCls} value={kind}
                      onChange={(e) => setKind(e.target.value)}>
                <optgroup label="Contracts">
                  <option value="employment">Employment contract</option>
                  <option value="offer">Offer letter</option>
                  <option value="nda">NDA</option>
                  <option value="amendment">Amendment</option>
                </optgroup>
                <optgroup label="Certificates and credentials">
                  <option value="certification">Certification</option>
                  <option value="qualification">Degree / diploma</option>
                  <option value="reference">Reference letter</option>
                </optgroup>
                <optgroup label="Identity and compliance">
                  <option value="id_document">ID document</option>
                  <option value="tax">Tax document (TIN, PAYE)</option>
                  <option value="medical">Medical / fitness to work</option>
                </optgroup>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <input ref={fileRef} type="file" className="text-sm text-slate-600 dark:text-slate-400"
                 accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" />
          <button onClick={upload} disabled={busy} className={btnCls}>
            {busy ? <><Loader2 className="w-4 h-4 inline mr-1.5 -mt-0.5 animate-spin" />Uploading…</>
                  : <><Upload className="w-4 h-4 inline mr-1.5 -mt-0.5" />Upload</>}
          </button>
        </div>
      )}
    </div>
  );
}

function RewardsPane({ p, get, post, onChange }: any) {
  const [list, setList] = useState<any[]>([]);
  const [f, setF] = useState<any>({ kind: 'bonus' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setList(await get(`/api/people/${p.id}/rewards`)); }
    catch (e: any) { setErr(e.message); }
  }, [p.id]);

  useEffect(() => { load(); }, [load]);

  const isShares = f.kind === 'share_award';

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post(`/api/people/${p.id}/rewards`, {
        kind: f.kind,
        amount: isShares ? null : Number(f.amount),
        shares: isShares ? Number(f.shares) : null,
        // Class B: Article 3 forbids ISSUING Class A to anyone but the
        // founder, and the server rejects it anyway.
        share_class_id: isShares ? 2 : null,
        reason: f.reason,
      });
      setF({ kind: 'bonus' });
      await load(); onChange();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.id}
                 className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-slate-800">
              <Gift className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-200">{r.reason}</p>
                <p className="text-xs text-slate-500">
                  {r.kind.replace('_', ' ')} ·{' '}
                  {new Date(r.awarded_on).toLocaleDateString('en-NG')}
                  {r.paid_on ? ' · paid' : ' · unpaid'}
                </p>
              </div>
              <span className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
                {r.shares ? `${shares(r.shares)} shares` : fmtKobo(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 rounded-lg bg-white dark:bg-slate-800 space-y-3">
        <Field label="Kind">
          <select className={inputCls} value={f.kind}
                  onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {REWARD_KINDS.map((k) => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </Field>

        {isShares ? (
          <Field label="Number of Class B shares"
                 hint="This also updates the ownership register — everyone else’s percentage goes down.">
            <input type="number" className={inputCls} value={f.shares || ''}
                   onChange={(e) => setF({ ...f, shares: e.target.value })} />
          </Field>
        ) : (
          <Field label="Amount (₦)">
            <input type="number" className={inputCls} value={f.amount || ''}
                   onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </Field>
        )}

        <Field label="What is it for">
          <input className={inputCls} value={f.reason || ''}
                 placeholder="e.g. Shipped the delivery rewrite"
                 onChange={(e) => setF({ ...f, reason: e.target.value })} />
        </Field>

        {err && <p className="text-sm text-rose-600">{err}</p>}

        <button onClick={save} className={btnCls}
                disabled={busy || !f.reason?.trim() || (isShares ? !f.shares : !f.amount)}>
          {busy ? 'Saving…' : 'Give reward'}
        </button>
      </div>
    </div>
  );
}
