import React, { useState, useEffect, useCallback } from 'react';
import { Card, Field, Note, inputCls, btnCls, btnGhost } from './ui';
import {
  MapPin, Phone, Landmark, ShieldCheck, Eye, EyeOff, CheckCircle2,
  AlertTriangle, User,
} from 'lucide-react';

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const EMPLOYMENT_TYPES = [
  { id: 'full_time',  label: 'Full time' },
  { id: 'part_time',  label: 'Part time' },
  { id: 'contract',   label: 'Contract' },
  { id: 'intern',     label: 'Intern' },
  { id: 'advisor',    label: 'Advisor' },
  { id: 'volunteer',  label: 'Volunteer' },
];

const RELATIONSHIPS = [
  'Spouse', 'Parent', 'Sibling', 'Child', 'Partner', 'Friend',
  'Guardian', 'Other relative',
];

// The list a Nigerian account is almost always at. "Other" keeps it honest
// rather than forcing a wrong pick, which is the failure mode of a closed
// dropdown over a list that changes.
const BANKS = [
  'Access Bank', 'Citibank', 'Ecobank', 'Fidelity Bank', 'First Bank',
  'First City Monument Bank', 'Globus Bank', 'Guaranty Trust Bank',
  'Heritage Bank', 'Jaiz Bank', 'Keystone Bank', 'Kuda', 'Lotus Bank',
  'Moniepoint', 'Opay', 'Optimus Bank', 'Palmpay', 'Parallex Bank',
  'Polaris Bank', 'PremiumTrust Bank', 'Providus Bank', 'Stanbic IBTC',
  'Standard Chartered', 'Sterling Bank', 'SunTrust Bank', 'Titan Trust Bank',
  'Union Bank', 'United Bank for Africa', 'Unity Bank', 'Wema Bank',
  'Zenith Bank',
];

/**
 * Everything about a person that is not their pay.
 *
 * TWO SENSITIVITIES ON ONE SCREEN, AND THEY ARE NOT TREATED ALIKE. An address
 * and an emergency contact are HR detail: useful, and no worse than a phone
 * book. An account number is a salary destination, and in Nigeria a number
 * plus a name is enough to redirect a payment.
 *
 * So the account number arrives masked unless the viewer is the founder or
 * the person themselves, the server decides that rather than this component,
 * and revealing it is a deliberate click rather than something that happens
 * because a panel was opened.
 */
export function ProfilePane({ p, get, put, isFounder, onChange }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any>({});
  const [who, setWho] = useState<any>({});
  const [people, setPeople] = useState<any[]>([]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const d = await get(`/api/people/${p.id}/profile`);
      setData(d);
      setForm(d.profile || {});
      setWho({
        full_name: d.person.full_name || '',
        email: d.person.email || '',
        phone: d.person.phone || '',
        role_title: d.person.role_title || '',
      });
    } catch (e: any) { setErr(e.message); }
  }, [p.id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (isFounder) get('/api/people').then(setPeople).catch(() => setPeople([]));
  }, [isFounder]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      // Dates come back from Postgres as timestamps; send just the day part
      // or the column will reject the round trip.
      const payload = { ...form };
      for (const k of ['date_of_birth', 'probation_ends']) {
        if (payload[k]) payload[k] = String(payload[k]).slice(0, 10);
      }
      await put(`/api/people/${p.id}`, who);
      await put(`/api/people/${p.id}/profile`, payload);
      setMsg('Saved.');
      await load();
      onChange?.();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err && !data) return <Note tone="rose" title="Could not load.">{err}</Note>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const dateVal = (v: any) => (v ? String(v).slice(0, 10) : '');

  return (
    <div className="space-y-6">
      {!isFounder && (
        <Note tone="slate">
          This is your own record. Ask the founder to change anything that is
          wrong &mdash; including your bank details, which are deliberately not
          editable here.
        </Note>
      )}

      <Section icon={User} title="Name and contact"
               note="The name here is the one every other screen uses — the payroll register, the cap table, the reports.">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Full name">
            <input className={inputCls} disabled={!isFounder}
                   value={who.full_name || ''}
                   onChange={(e) => setWho({ ...who, full_name: e.target.value })} />
          </Field>
          <Field label="Job title">
            <input className={inputCls} disabled={!isFounder}
                   value={who.role_title || ''}
                   onChange={(e) => setWho({ ...who, role_title: e.target.value })} />
          </Field>
          <Field label="Work email"
                 hint="Their contact address. Sign-in access is set on the Access tab.">
            <input type="email" className={inputCls} disabled={!isFounder}
                   value={who.email || ''}
                   onChange={(e) => setWho({ ...who, email: e.target.value })} />
          </Field>
          <Field label="Phone">
            <input className={inputCls} disabled={!isFounder}
                   value={who.phone || ''}
                   onChange={(e) => setWho({ ...who, phone: e.target.value })} />
          </Field>
        </div>
      </Section>

      <Section icon={MapPin} title="Where they are">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <Field label="Address">
              <input className={inputCls} disabled={!isFounder}
                     value={form.address_line1 || ''}
                     onChange={(e) => set('address_line1', e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Address line 2">
              <input className={inputCls} disabled={!isFounder}
                     value={form.address_line2 || ''}
                     onChange={(e) => set('address_line2', e.target.value)} />
            </Field>
          </div>
          <Field label="City">
            <input className={inputCls} disabled={!isFounder}
                   value={form.city || ''}
                   onChange={(e) => set('city', e.target.value)} />
          </Field>
          <Field label="State">
            <input className={inputCls} disabled={!isFounder}
                   value={form.state || ''}
                   onChange={(e) => set('state', e.target.value)} />
          </Field>
          <Field label="Country">
            <input className={inputCls} disabled={!isFounder}
                   value={form.country ?? 'Nigeria'}
                   onChange={(e) => set('country', e.target.value)} />
          </Field>
          <Field label="Where they work from">
            <input className={inputCls} disabled={!isFounder}
                   placeholder="Remote, Lagos office, campus…"
                   value={form.work_location || ''}
                   onChange={(e) => set('work_location', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={User} title="Personal">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date of birth">
            <input type="date" className={inputCls} disabled={!isFounder}
                   value={dateVal(form.date_of_birth)}
                   onChange={(e) => set('date_of_birth', e.target.value)} />
          </Field>
          <Field label="Gender">
            <input className={inputCls} disabled={!isFounder}
                   value={form.gender || ''}
                   onChange={(e) => set('gender', e.target.value)} />
          </Field>
          <Field label="Personal email"
                 hint="Separate from the login address, so they are reachable after they leave.">
            <input type="email" className={inputCls} disabled={!isFounder}
                   value={form.personal_email || ''}
                   onChange={(e) => set('personal_email', e.target.value)} />
          </Field>
          <Field label="Another phone number">
            <input className={inputCls} disabled={!isFounder}
                   value={form.alternate_phone || ''}
                   onChange={(e) => set('alternate_phone', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={Phone} title="Who to call"
               note="The field most likely to be empty on the day it is needed.">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Emergency contact">
            <input className={inputCls} disabled={!isFounder}
                   value={form.emergency_name || ''}
                   onChange={(e) => set('emergency_name', e.target.value)} />
          </Field>
          <Field label="Relationship">
            <select className={inputCls} disabled={!isFounder}
                    value={form.emergency_relationship || ''}
                    onChange={(e) => set('emergency_relationship', e.target.value)}>
              <option value="">Choose…</option>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Phone">
            <input className={inputCls} disabled={!isFounder}
                   value={form.emergency_phone || ''}
                   onChange={(e) => set('emergency_phone', e.target.value)} />
          </Field>

          <Field label="Next of kin">
            <input className={inputCls} disabled={!isFounder}
                   value={form.next_of_kin_name || ''}
                   onChange={(e) => set('next_of_kin_name', e.target.value)} />
          </Field>
          <Field label="Relationship">
            <select className={inputCls} disabled={!isFounder}
                    value={form.next_of_kin_relationship || ''}
                    onChange={(e) => set('next_of_kin_relationship', e.target.value)}>
              <option value="">Choose…</option>
              {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Phone">
            <input className={inputCls} disabled={!isFounder}
                   value={form.next_of_kin_phone || ''}
                   onChange={(e) => set('next_of_kin_phone', e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section icon={ShieldCheck} title="Employment">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Type">
            <select className={inputCls} disabled={!isFounder}
                    value={form.employment_type || ''}
                    onChange={(e) => set('employment_type', e.target.value)}>
              <option value="">Not set</option>
              {EMPLOYMENT_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Reports to">
            <select className={inputCls} disabled={!isFounder}
                    value={form.reports_to || ''}
                    onChange={(e) => set('reports_to', e.target.value)}>
              <option value="">Nobody / the founder</option>
              {people.filter((o: any) => o.id !== p.id).map((o: any) => (
                <option key={o.id} value={o.id}>{o.full_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Probation ends">
            <input type="date" className={inputCls} disabled={!isFounder}
                   value={dateVal(form.probation_ends)}
                   onChange={(e) => set('probation_ends', e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputCls} rows={3} disabled={!isFounder}
                    value={form.notes || ''}
                    onChange={(e) => set('notes', e.target.value)} />
        </Field>
      </Section>

      {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}
      {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}

      {isFounder && (
        <button onClick={save} disabled={busy} className={btnCls}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
      )}

      <BankPane p={p} bank={data.bank} visible={data.bank_visible}
                isFounder={isFounder} put={put} onSaved={load} />
    </div>
  );
}

/**
 * Where the salary goes.
 *
 * FOUNDER-WRITE-ONLY, ON PURPOSE, INCLUDING FOR A PERSON'S OWN. Changing a
 * salary destination is a standard fraud: take over an account, point the pay
 * somewhere else, wait for payday. If a person could edit their own, one
 * compromised login would be enough. They can read theirs to check it is
 * right; changing it is a conversation with a human.
 */
function BankPane({ p, bank, visible, isFounder, put, onSaved }: any) {
  const [editing, setEditing] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [form, setForm] = useState<any>({
    bank_name: bank?.bank_name || '',
    account_number: '',
    account_name: bank?.account_name || p.full_name || '',
    verified: false,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await put(`/api/people/${p.id}/bank`, form);
      setEditing(false);
      setForm({ ...form, account_number: '' });
      onSaved();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const shown = bank?.account_number
    ? (reveal ? bank.account_number
              : bank.account_number.replace(/.(?=.{4})/g, '*'))
    : bank?.account_number_masked;

  return (
    <Section icon={Landmark} title="Where the salary is paid"
             note="Separate from everything above, and behind a stricter rule.">
      {!bank?.has_details && !bank?.account_number && !editing && (
        <Note tone="amber" title="No account on file.">
          Payroll can still be recorded, but there is nowhere written down to
          send the money.
        </Note>
      )}

      {(bank?.account_number || bank?.account_number_masked) && !editing && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">
                {bank.bank_name || 'Bank not recorded'}
              </p>
              <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-100 mt-1">
                {shown}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {bank.account_name || 'No account name recorded'}
              </p>

              {/* A name mismatch is worth seeing BEFORE a transfer, not
                  after it bounces or lands somewhere unexpected. */}
              {bank.account_name && p.full_name
                && bank.account_name.trim().toLowerCase()
                   !== p.full_name.trim().toLowerCase() && (
                <p className="text-xs text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  The account name is not the same as the name on the register.
                </p>
              )}
            </div>

            <div className="text-right space-y-2">
              {bank.verified_at ? (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Checked {day(bank.verified_at)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Never checked
                </span>
              )}

              {visible && bank.account_number && (
                <button onClick={() => setReveal(!reveal)} className={btnGhost + ' block ml-auto'}>
                  {reveal ? <EyeOff className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                          : <Eye className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />}
                  {reveal ? 'Hide' : 'Show'}
                </button>
              )}
            </div>
          </div>

          {!visible && (
            <p className="text-[11px] text-slate-400 mt-3">
              Only the last four digits are shown. The full number goes to the
              founder and to {p.full_name} alone.
            </p>
          )}
        </div>
      )}

      {isFounder && !editing && (
        <button onClick={() => setEditing(true)} className={btnGhost}>
          {bank?.account_number || bank?.account_number_masked
            ? 'Change these details' : 'Add bank details'}
        </button>
      )}

      {editing && (
        <div className="space-y-4">
          <Note tone="amber" title="This changes where money is sent.">
            Every change is recorded with who made it and what it was before,
            because redirecting a salary is exactly what a compromised account
            would try to do. Check the number against something the person
            sent you, not against memory.
          </Note>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Bank">
              <select className={inputCls} value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}>
                <option value="">Choose the bank…</option>
                {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                <option value="Other">Other</option>
              </select>
            </Field>
            <Field label="Account number" hint="Digits only.">
              <input className={inputCls} inputMode="numeric"
                     value={form.account_number}
                     onChange={(e) => setForm({ ...form, account_number: e.target.value })} />
            </Field>
          </div>

          <Field label="Name on the account"
                 hint="As the bank has it, which is not always as the register has it.">
            <input className={inputCls} value={form.account_name}
                   onChange={(e) => setForm({ ...form, account_name: e.target.value })} />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <input type="checkbox" checked={form.verified}
                   onChange={(e) => setForm({ ...form, verified: e.target.checked })} />
            I have checked these against a statement or a transfer receipt
          </label>

          {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}

          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !form.account_number}
                    className={btnCls}>
              {busy ? 'Saving…' : 'Save bank details'}
            </button>
            <button onClick={() => setEditing(false)} className={btnGhost}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Section({ icon: Icon, title, note, children }: any) {
  return (
    <Card className="p-5 space-y-4">
      <div>
        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Icon className="w-4 h-4 text-slate-400" />
          {title}
        </h3>
        {note && <p className="text-xs text-slate-500 mt-1">{note}</p>}
      </div>
      {children}
    </Card>
  );
}
