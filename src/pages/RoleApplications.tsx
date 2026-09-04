import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Bike, Bus, Check, X, Clock, AlertTriangle, ShieldOff, MapPin,
  Phone, School, History, RefreshCw,
} from 'lucide-react';

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const since = (d: string | null) => {
  if (!d) return '';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};

const KINDS: Record<string, { label: string; icon: any; blurb: string }> = {
  delivery_agent: {
    label: 'Delivery agent',
    icon: Bike,
    blurb: 'Will be listed to students, accept orders and handle cash.',
  },
  transport_vendor: {
    label: 'Transport vendor',
    icon: Bus,
    blurb: 'Will offer rides and take bookings and fares.',
  },
};

/**
 * Deciding who becomes a delivery agent or a transport vendor.
 *
 * WHY THIS SCREEN MATTERS MORE THAN IT LOOKS. Before the app's 0087, becoming
 * a delivery agent was a button that wrote to your own profile row. Anybody
 * who tapped it was immediately listed to students, accepting orders and
 * collecting cash, with nobody having looked at them. This is the review that
 * was missing, and approving somebody here is the moment they can start
 * taking money from students.
 *
 * So the card leads with what the decision does, not with the applicant's
 * text: how long they have been on the platform, whether they have been
 * turned down before, and what the role lets them do.
 */
export default function RoleApplications() {
  const { get, post } = useApi();
  const [tab, setTab] = useState<'pending' | 'all' | 'holders'>('pending');
  const [kind, setKind] = useState<string>('');
  const [data, setData] = useState<any>(null);
  const [holders, setHolders] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null); setLoading(true);
    try {
      if (tab === 'holders') {
        setHolders(await get(
          `/api/roles/holders?kind=${kind || 'delivery_agent'}`));
      } else {
        const q = `status=${tab}${kind ? `&kind=${kind}` : ''}`;
        setData(await get(`/api/roles/applications?${q}`));
      }
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [tab, kind]);

  useEffect(() => { load(); }, [load]);

  const decide = async (app: any, decision: 'approved' | 'rejected') => {
    let note: string | null = null;

    if (decision === 'rejected') {
      note = window.prompt(
        `Why is ${app.full_name || app.username || 'this application'} being `
        + 'turned down? They can be told this, so make it something they '
        + 'could act on.');
      if (!note?.trim()) return;
    } else {
      const k = KINDS[app.kind];
      if (!window.confirm(
        `Approve ${app.full_name || app.username} as a ${k.label.toLowerCase()}?`
        + `\n\n${k.blurb}\n\nThis takes effect immediately.`)) return;
      note = window.prompt('Any note for the record? (optional)') || null;
    }

    setBusy(app.id); setErr(null); setMsg(null);
    try {
      await post(`/api/roles/applications/${app.id}/review`, { decision, note });
      setMsg(decision === 'approved'
        ? `${app.full_name || app.username} is now a ${KINDS[app.kind].label.toLowerCase()}.`
        : 'Turned down.');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const revoke = async (person: any, roleKind: string) => {
    const reason = window.prompt(
      `Why is ${person.full_name || person.username} losing this role? `
      + 'It goes on the record with your name against it.');
    if (!reason?.trim()) return;

    setBusy(person.user_id); setErr(null); setMsg(null);
    try {
      await post('/api/roles/revoke',
                 { user_id: person.user_id, kind: roleKind, reason });
      setMsg('Role taken back.');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const pendingCount = (data?.counts || [])
    .filter((c: any) => c.status === 'pending')
    .reduce((a: number, c: any) => a + Number(c.n), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Agents &amp; Vendors
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Who may deliver orders and who may sell rides. Approving somebody
            here lets them start taking money from students.
          </p>
        </div>
        <button onClick={load} disabled={loading}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 -mt-0.5 ${
            loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'pending', label: pendingCount > 0 ? `Waiting (${pendingCount})` : 'Waiting' },
          { id: 'all',     label: 'Everything decided' },
          { id: 'holders', label: 'Who holds a role now' },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
              tab === t.id ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
            {t.label}
          </button>
        ))}

        <div className="ml-auto">
          <select value={kind} onChange={(e) => setKind(e.target.value)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-0">
            {tab === 'holders' ? (
              <>
                <option value="delivery_agent">Delivery agents</option>
                <option value="transport_vendor">Transport vendors</option>
              </>
            ) : (
              <>
                <option value="">Both roles</option>
                <option value="delivery_agent">Delivery agents</option>
                <option value="transport_vendor">Transport vendors</option>
              </>
            )}
          </select>
        </div>
      </div>

      {err && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-400">
            Could not load this.
          </p>
          <p className="text-xs text-rose-600 dark:text-rose-500 mt-1">{err}</p>
        </div>
      )}
      {msg && (
        <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{msg}</p>
        </div>
      )}

      {loading && !data && !holders && (
        <p className="text-sm text-slate-500">Loading…</p>
      )}

      {tab === 'holders' ? (
        <Holders rows={holders} kind={kind || 'delivery_agent'}
                 onRevoke={revoke} busy={busy} />
      ) : (
        <Queue apps={data?.applications} onDecide={decide} busy={busy}
               get={get} />
      )}
    </div>
  );
}

function Queue({ apps, onDecide, busy, get }: any) {
  if (!apps) return null;
  if (apps.length === 0) {
    return (
      <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
        <Check className="w-8 h-8 text-emerald-500 mx-auto" />
        <p className="text-sm text-slate-500 mt-3">
          Nothing waiting. Everyone who applied has been dealt with.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {apps.map((a: any) => (
        <ApplicationCard key={a.id} a={a} onDecide={onDecide} busy={busy}
                         get={get} />
      ))}
    </div>
  );
}

function ApplicationCard({ a, onDecide, busy, get }: any) {
  const [history, setHistory] = useState<any[] | null>(null);
  const k = KINDS[a.kind] || KINDS.delivery_agent;
  const Icon = k.icon;
  const pending = a.status === 'pending';
  const working = busy === a.id;

  const already = a.kind === 'delivery_agent'
    ? a.is_delivery_agent : a.is_transport_vendor;

  const showHistory = async () => {
    if (history) { setHistory(null); return; }
    try { setHistory(await get(`/api/roles/applications/${a.user_id}/history`)); }
    catch { setHistory([]); }
  };

  return (
    <div className={`rounded-xl border overflow-hidden ${
      pending ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 opacity-80'}`}>

      <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4">
        {a.avatar_url ? (
          <img src={a.avatar_url} alt=""
               className="w-11 h-11 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500 font-bold">
            {(a.full_name || a.username || '?').charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
            {a.full_name || 'No name set'}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {a.username ? `@${a.username}` : 'no username'}
            {a.joined_at && ` · joined ${since(a.joined_at)}`}
          </p>
        </div>

        <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1 ${
          a.kind === 'delivery_agent'
            ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400'
            : 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400'}`}>
          <Icon className="w-3 h-3" />
          {k.label}
        </span>
      </div>

      <div className="p-5 space-y-3">
        {/* The things that should change the decision, before their pitch. */}
        {a.previous_rejections > 0 && (
          <p className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Turned down {a.previous_rejections} time
            {a.previous_rejections === 1 ? '' : 's'} before.
          </p>
        )}
        {already && pending && (
          <p className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
            <Check className="w-3.5 h-3.5" />
            Already holds this role — approving changes nothing.
          </p>
        )}

        <div className="space-y-2 text-sm">
          <Row icon={MapPin} label="Address">{a.address}</Row>
          {a.phone_number && <Row icon={Phone} label="Phone">{a.phone_number}</Row>}
          {a.school_name && <Row icon={School} label="Campus">{a.school_name}</Row>}
        </div>

        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
            What they said
          </p>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {a.note}
          </p>
        </div>

        {!pending && (
          <div className={`p-3 rounded-lg text-xs ${
            a.status === 'approved'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400'}`}>
            <p className="font-bold">
              {a.status === 'approved' ? 'Approved' : 'Turned down'}
              {a.reviewed_at && ` ${day(a.reviewed_at)}`}
              {a.reviewer_email && ` by ${a.reviewer_email}`}
            </p>
            {a.review_note && <p className="mt-1">{a.review_note}</p>}
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          {pending && (
            <>
              <button onClick={() => onDecide(a, 'approved')} disabled={working}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50">
                <Check className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                {working ? 'Working…' : 'Approve'}
              </button>
              <button onClick={() => onDecide(a, 'rejected')} disabled={working}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50">
                <X className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
                Turn down
              </button>
            </>
          )}
          <button onClick={showHistory}
            className="ml-auto px-2.5 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <History className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            History
          </button>
        </div>

        {history && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
            {history.length === 0 ? (
              <p className="text-xs text-slate-400">Nothing else on record.</p>
            ) : history.map((h: any) => (
              <p key={h.id} className="text-xs text-slate-500">
                <span className="font-medium">{day(h.created_at)}</span>
                {' · '}{KINDS[h.kind]?.label || h.kind}
                {' · '}<span className={
                  h.status === 'approved' ? 'text-emerald-600'
                  : h.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}>
                  {h.status}
                </span>
                {h.review_note && ` — ${h.review_note}`}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ icon: Icon, label, children }: any) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
      <span className="text-xs text-slate-400 w-16 shrink-0">{label}</span>
      <span className="text-sm text-slate-700 dark:text-slate-300 min-w-0">
        {children}
      </span>
    </div>
  );
}

/**
 * Who is out there right now.
 *
 * The queue answers "who is asking". This answers "who is already able to
 * take a student's money", which is the question you need before revoking
 * anybody and the one an application list cannot tell you.
 */
function Holders({ rows, kind, onRevoke, busy }: any) {
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
        <p className="text-sm text-slate-500">
          Nobody holds this role yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              {['Person', 'Campus', 'Phone', 'Since', '', ''].map((h, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {rows.map((p: any) => (
              <tr key={p.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {p.full_name || 'No name'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.username ? `@${p.username}` : ''}
                  </p>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.school_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{p.phone_number || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{since(p.joined_at)}</td>
                <td className="px-4 py-3">
                  {kind === 'delivery_agent' && (
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      p.available
                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                      {p.available ? 'online' : 'offline'}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onRevoke(p, kind)}
                          disabled={busy === p.user_id}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50">
                    <ShieldOff className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                    {busy === p.user_id ? '…' : 'Take it back'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
