import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Megaphone, TrendingUp, UserPlus, Gift, Power, Check, X, RefreshCw,
} from 'lucide-react';

const n = (v: number) => Number(v || 0).toLocaleString('en-NG');

/**
 * Ambassador referral codes.
 *
 * A referral code IS a username — invite links are /join?ref=<username> — so
 * promoting somebody does not create anything. It attaches a number of free
 * Plus days to a code that already exists, and anyone signing up with it
 * lands already subscribed.
 *
 * PAID CONVERSIONS IS THE COLUMN THAT MATTERS and is styled to say so.
 * Signups measure reach and weeks granted measure what was given away; only
 * the third says somebody took the free week, watched it expire, and chose to
 * pay. A campaign with a thousand signups and no conversions is a campaign
 * that bought a thousand people a free week.
 *
 * Every write goes to set_referral_plus, which checks is_app_admin() in the
 * database. The gate below hides a screen that would return nothing for a
 * non-admin; it is courtesy, not the control.
 */
export default function Ambassadors() {
  const { get, post } = useApi();
  const [rows, setRows] = useState<any[] | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The promote form.
  const [username, setUsername] = useState('');
  const [days, setDays] = useState('7');

  // Editing days on an existing row.
  const [editing, setEditing] = useState<string | null>(null);
  const [editDays, setEditDays] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const access = await get<any>('/api/ambassadors/access');
      setAllowed(access.allowed);
      if (access.allowed) setRows(await get('/api/ambassadors'));
    } catch (e: any) { setErr(e.message); setAllowed(false); }
    finally { setLoading(false); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const apply = async (u: string, d: number, confirmText: string, tag: string) => {
    if (!window.confirm(confirmText)) return;
    setBusy(tag); setErr(null); setMsg(null);
    try {
      const r = await post<any>('/api/ambassadors', { username: u, days: d });
      setMsg(r.days === 0
        ? `@${r.username} is an ordinary code again. New signups get nothing.`
        : `@${r.username} now grants ${r.days} day${r.days === 1 ? '' : 's'} of Plus.`);
      setEditing(null);
      setUsername(''); setDays('7');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const promote = () => {
    const u = username.trim().replace(/^@/, '');
    const d = Number(days);
    if (!u) { setErr('Type the username whose code you want to promote.'); return; }
    if (!Number.isInteger(d) || d < 0 || d > 90) {
      setErr('Days has to be a whole number between 0 and 90.'); return;
    }
    apply(u, d,
      `Promote @${u} to an ambassador code granting ${d} day${d === 1 ? '' : 's'} `
      + 'of free Plus?\n\nEveryone who signs up with this code from now on gets '
      + 'Plus automatically. This gives away real money.',
      'promote');
  };

  if (allowed === false) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-center">
        <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
        <h1 className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-4">
          Not available on this account
        </h1>
        <p className="text-sm text-slate-500 mt-2">
          Ambassador codes are limited to app admins. This account is signed
          in to the dashboard but is not in <code>admin_users</code>, so the
          database would return an empty page.
        </p>
        {err && <p className="text-xs text-rose-600 mt-3">{err}</p>}
      </div>
    );
  }

  if (allowed === null) {
    return <p className="text-sm text-slate-500">Loading…</p>;
  }

  const totals = (rows || []).reduce(
    (a, r) => ({
      signups: a.signups + r.signups,
      granted: a.granted + r.weeks_granted,
      paid: a.paid + r.paid_conversions,
    }), { signups: 0, granted: 0, paid: 0 });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Ambassador Codes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            A referral code is a username. Promoting one means anybody who
            signs up with it arrives already on Plus.
          </p>
        </div>
        <button onClick={load} disabled={loading}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 -mt-0.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Tile label="Signups" value={n(totals.signups)} icon={UserPlus}
                sub="everyone who used an ambassador code" />
          <Tile label="Given free Plus" value={n(totals.granted)} icon={Gift}
                sub="what the campaign cost" />
          <Tile label="Still paying after it expired" value={n(totals.paid)}
                icon={TrendingUp} accent
                sub={totals.granted > 0
                  ? `${Math.round(totals.paid / totals.granted * 100)}% of those who got it`
                  : 'the only number that says it worked'} />
        </div>
      )}

      {err && (
        <div className="p-4 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30">
          <p className="text-sm text-rose-700 dark:text-rose-400 font-medium">{err}</p>
        </div>
      )}
      {msg && (
        <div className="p-3 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
          <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">{msg}</p>
        </div>
      )}

      {/* Promote ------------------------------------------------------- */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Promote a code
        </h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          The username has to exist — a code is not something you invent, it is
          somebody&rsquo;s handle.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[12rem]">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Username
            </span>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
              <input value={username} placeholder="jamesx"
                     onChange={(e) => setUsername(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') promote(); }}
                     className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </label>
          <label className="w-32">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Days of Plus
            </span>
            <input type="number" min={0} max={90} value={days}
                   onChange={(e) => setDays(e.target.value)}
                   className="w-full mt-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <button onClick={promote} disabled={busy === 'promote' || !username.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
            {busy === 'promote' ? 'Working…' : 'Promote'}
          </button>
        </div>
      </div>

      {/* The table ----------------------------------------------------- */}
      {rows === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <Megaphone className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-500 mt-3">
            No ambassador codes yet. Promote one to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">Ambassador</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">Grants</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">Signups</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">Given Plus</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">Still paying</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => {
                  const rate = r.weeks_granted > 0
                    ? Math.round(r.paid_conversions / r.weeks_granted * 100) : null;
                  return (
                    <tr key={r.username} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt=""
                                 className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                              {(r.full_name || r.username || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                              {r.full_name || r.username}
                            </p>
                            <p className="text-xs text-slate-500 font-mono truncate">
                              @{r.username}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {editing === r.username ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={90} value={editDays} autoFocus
                                   onChange={(e) => setEditDays(e.target.value)}
                                   className="w-20 px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                            <button title="Save"
                              onClick={() => {
                                const d = Number(editDays);
                                if (!Number.isInteger(d) || d < 0 || d > 90) {
                                  setErr('Days has to be a whole number between 0 and 90.');
                                  return;
                                }
                                apply(r.username, d,
                                  `Change @${r.username} to grant ${d} day${d === 1 ? '' : 's'} of Plus?`,
                                  r.username);
                              }}
                              className="p-1.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">
                              <Check className="w-4 h-4" />
                            </button>
                            <button title="Cancel" onClick={() => setEditing(null)}
                                    className="p-1.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditing(r.username); setEditDays(String(r.days)); }}
                            className="text-xs font-bold px-2.5 py-1 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-400 hover:ring-2 hover:ring-indigo-300">
                            {r.days} day{r.days === 1 ? '' : 's'}
                          </button>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {n(r.signups)}
                      </td>
                      <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {n(r.weeks_granted)}
                      </td>

                      {/* The one that says whether it worked. */}
                      <td className="px-5 py-4 text-right">
                        <span className={`font-mono font-bold text-lg ${
                          r.paid_conversions > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-400'}`}>
                          {n(r.paid_conversions)}
                        </span>
                        {rate !== null && (
                          <span className="block text-[10px] font-bold text-slate-400">
                            {rate}% of those given it
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-right">
                        <button
                          disabled={busy === r.username}
                          onClick={() => apply(r.username, 0,
                            `Switch off @${r.username}?\n\nThe code keeps working as an `
                            + 'ordinary referral link, but new signups stop getting free '
                            + 'Plus. Anyone already granted it keeps what they have.',
                            r.username)}
                          className="text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2.5 py-1.5 rounded-lg whitespace-nowrap disabled:opacity-40">
                          <Power className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                          {busy === r.username ? '…' : 'Switch off'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <p className="text-xs text-slate-500">
              <strong className="text-slate-600 dark:text-slate-400">Still paying</strong> counts
              people who took the free days, let them expire, and subscribed anyway.
              Signups measure reach and Given Plus measures what it cost; only this
              one says the campaign worked.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, icon: Icon, accent }: any) {
  return (
    <div className={`p-5 rounded-xl border bg-white dark:bg-slate-900 ${
      accent ? 'border-emerald-300 dark:border-emerald-800'
             : 'border-slate-200 dark:border-slate-800'}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        <Icon className={`w-4 h-4 shrink-0 ${
          accent ? 'text-emerald-500' : 'text-slate-400'}`} />
      </div>
      <p className={`text-2xl font-mono font-bold mt-2 ${
        accent ? 'text-emerald-600 dark:text-emerald-400'
               : 'text-slate-800 dark:text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
