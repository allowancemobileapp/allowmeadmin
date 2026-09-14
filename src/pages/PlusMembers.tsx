import React, { useState, useEffect, useCallback } from 'react';
import { useApi } from '../hooks/useApi';
import {
  Crown, Search, Gift, CreditCard, AlertTriangle, ExternalLink, X,
  UserMinus, UserPlus, RefreshCw, Infinity as InfinityIcon, Clock,
} from 'lucide-react';

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * How somebody came to be Plus, in words.
 *
 * docs/PAYMENTS.md §3.1: trial_source is 'self' (the old no-card week),
 * 'referral' (an ambassador gift), 'paid_trial' (the N100 week). NULL with a
 * card means they bought it; NULL without a card and with an expiry means an
 * admin granted it; NULL expiry is permanent and reserved for the two admin
 * accounts.
 */
function howTheyGotIt(m: any) {
  if (m.permanent) return { label: 'Permanent (admin account)', tone: 'slate', icon: InfinityIcon };
  if (m.trial_source === 'referral') return { label: 'Ambassador gift week', tone: 'violet', icon: Gift };
  if (m.trial_source === 'paid_trial') return { label: '₦100 first week', tone: 'sky', icon: Clock };
  if (m.trial_source === 'self') return { label: 'Free week (old)', tone: 'slate', icon: Clock };
  if (m.has_card) return { label: 'Paying', tone: 'emerald', icon: CreditCard };
  return { label: 'Admin grant', tone: 'amber', icon: Crown };
}

const TONES: Record<string, string> = {
  emerald: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  violet: 'bg-violet-100 dark:bg-violet-950 text-violet-700 dark:text-violet-400',
  sky: 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400',
  amber: 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
};

/**
 * Plus membership, administered.
 *
 * Every write here is an RPC the database gates on is_app_admin(). Nothing on
 * this page touches profiles directly -- docs/PAYMENTS.md §12 forbids it and
 * a trigger refuses it anyway.
 *
 * THE REVOKE WARNING IS THE MOST IMPORTANT THING ON THIS PAGE. Revoking drops
 * the tier in our database and nothing else. If the person has a Paystack
 * customer, their card is still on a subscription and WILL BE CHARGED AGAIN
 * next period -- for a product they no longer have. There is no admin RPC
 * to cancel somebody else's subscription (§14). So the warning is a modal
 * that has to be dismissed, not a toast that can be missed.
 */
export default function PlusMembers() {
  const { get, post } = useApi();
  const [members, setMembers] = useState<any[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Grant form.
  const [grantUser, setGrantUser] = useState('');
  const [grantDays, setGrantDays] = useState('30');

  // The Paystack warning, when a revoke returns has_paystack_customer.
  const [paystackWarning, setPaystackWarning] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      setMembers(await get(`/api/plus/members?q=${encodeURIComponent(q)}`));
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }, [get, q]);

  useEffect(() => { load(); }, [load]);

  const grant = async (username: string, days: number) => {
    const u = username.trim().replace(/^@/, '');
    if (!u) { setErr('Which username?'); return; }
    if (!Number.isInteger(days) || days < 1 || days > 366) {
      setErr('Days has to be a whole number from 1 to 366.'); return;
    }
    if (!window.confirm(
      `Grant @${u} ${days} day${days === 1 ? '' : 's'} of Plus?\n\n`
      + 'If they already have Plus this EXTENDS from their current expiry, it '
      + 'does not replace it. This gives away real access.')) return;

    setBusy(u); setErr(null); setMsg(null);
    try {
      const r = await post<any>('/api/plus/grant', { username: u, days });
      setMsg(r.extended
        ? `@${r.username} extended — now runs to ${day(r.expires_at)} (was ${day(r.was)}).`
        : `@${r.username} is now Plus until ${day(r.expires_at)}.`);
      setGrantUser(''); setGrantDays('30');
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const revoke = async (m: any) => {
    if (!window.confirm(
      `Revoke Plus from @${m.username}?\n\n`
      + 'Drops them to Free immediately and ends any running week. '
      + (m.has_card
          ? '\n\nTHEY HAVE A CARD ON FILE. You will also need to cancel their '
            + 'subscription in the Paystack dashboard, or they keep being charged.'
          : ''))) return;

    setBusy(m.username); setErr(null); setMsg(null);
    try {
      const r = await post<any>('/api/plus/revoke', { username: m.username });
      if (r.must_cancel_at_paystack) {
        // Not a toast. A modal that has to be acknowledged, because the
        // consequence of ignoring it is somebody's card being charged for
        // nothing next month.
        setPaystackWarning(r.username);
      } else {
        setMsg(`@${r.username} is Free again. No card was on file, so nothing to cancel at Paystack.`);
      }
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const active = (members || []).filter((m) => m.is_plus);
  const byHow = active.reduce<Record<string, number>>((a, m) => {
    const k = howTheyGotIt(m).label; a[k] = (a[k] || 0) + 1; return a;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-200">
            Plus Members
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Everyone on Plus right now, how they got it, and when it ends.
          </p>
        </div>
        <button onClick={load} disabled={loading}
                className="px-3 py-2 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
          <RefreshCw className={`w-3.5 h-3.5 inline mr-1.5 -mt-0.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {members && (
        <div className="flex flex-wrap gap-2">
          <span className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-900 dark:bg-indigo-600 text-white">
            {active.length} on Plus
          </span>
          {Object.entries(byHow).map(([k, n]) => (
            <span key={k} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
              {n} {k.toLowerCase()}
            </span>
          ))}
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

      {/* Grant ---------------------------------------------------------- */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Grant Plus</h2>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          Extends from the later of now and their current expiry &mdash; granting
          30 days to somebody with 10 left gives them 40, not 30.
        </p>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="flex-1 min-w-[12rem]">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Username</span>
            <div className="relative mt-1.5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">@</span>
              <input value={grantUser} placeholder="jamesx"
                     onChange={(e) => setGrantUser(e.target.value)}
                     onKeyDown={(e) => { if (e.key === 'Enter') grant(grantUser, Number(grantDays)); }}
                     className="w-full pl-7 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </label>
          <label className="w-32">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Days</span>
            <input type="number" min={1} max={366} value={grantDays}
                   onChange={(e) => setGrantDays(e.target.value)}
                   className="w-full mt-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          </label>
          <button onClick={() => grant(grantUser, Number(grantDays))}
                  disabled={!!busy || !grantUser.trim()}
                  className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
            <UserPlus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Grant
          </button>
        </div>
      </div>

      {/* Search --------------------------------------------------------- */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search any user by username, name or email — Plus or not"
               className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>

      {/* The table ------------------------------------------------------ */}
      {members === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : members.length === 0 ? (
        <div className="p-10 text-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
          <p className="text-sm text-slate-500">
            {q ? `Nobody matches "${q}".` : 'Nobody is on Plus.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">Member</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">How</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">Ends</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs">Card</th>
                  <th className="px-5 py-3 font-bold uppercase tracking-wider text-xs text-right">Payments</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {members.map((m) => {
                  const how = howTheyGotIt(m);
                  const Icon = how.icon;
                  return (
                    <tr key={m.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 ${
                      m.is_plus ? '' : 'opacity-60'}`}>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-xs shrink-0">
                              {(m.full_name || m.username || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                              {m.full_name || m.username}
                            </p>
                            <p className="text-xs text-slate-500 font-mono truncate">
                              @{m.username}{m.email && <> · {m.email}</>}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        {m.is_plus ? (
                          <span className={`text-[10px] font-bold px-2 py-1 rounded inline-flex items-center gap-1 ${TONES[how.tone]}`}>
                            <Icon className="w-3 h-3" />
                            {how.label}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                            Free
                          </span>
                        )}
                      </td>

                      <td className="px-5 py-4 text-xs">
                        {m.permanent ? (
                          <span className="text-slate-500">never</span>
                        ) : m.subscription_expires_at ? (
                          <span className={
                            m.days_left <= 3 ? 'text-rose-600 font-bold'
                            : m.days_left <= 7 ? 'text-amber-600 font-medium'
                            : 'text-slate-600 dark:text-slate-400'}>
                            {day(m.subscription_expires_at)}
                            <span className="block text-[10px] text-slate-400 font-normal">
                              {m.days_left < 0 ? `${-m.days_left}d ago (grace)`
                               : m.days_left === 0 ? 'today'
                               : `${m.days_left}d left`}
                            </span>
                          </span>
                        ) : <span className="text-slate-400">—</span>}
                      </td>

                      <td className="px-5 py-4 text-xs">
                        {m.has_card ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                            <CreditCard className="w-3.5 h-3.5" />
                            …{m.card_tail}
                          </span>
                        ) : <span className="text-slate-400">none</span>}
                      </td>

                      <td className="px-5 py-4 text-right font-mono text-slate-600 dark:text-slate-400">
                        {m.gateway_payments}
                      </td>

                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <button onClick={() => grant(m.username, 30)} disabled={busy === m.username}
                                className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
                          +30d
                        </button>
                        {m.is_plus && !m.permanent && (
                          <button onClick={() => revoke(m)} disabled={busy === m.username}
                                  className="ml-1 text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 px-2.5 py-1.5 rounded-lg disabled:opacity-40">
                            <UserMinus className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                            {busy === m.username ? '…' : 'Revoke'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* THE WARNING. §12 MUST. A modal, because a card being charged next
          month for nothing is the consequence of missing it. */}
      {paystackWarning && (
        <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border-2 border-amber-400 dark:border-amber-600 rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-5 border-b border-amber-200 dark:border-amber-900 flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Plus revoked — but their card is still subscribed
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  @{paystackWarning} has a Paystack customer on file.
                </p>
              </div>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>
                This dropped them to Free in our database and <strong>nothing else</strong>.
                Their subscription at Paystack is still live, and{' '}
                <strong className="text-rose-600">their card will be charged again next period</strong>{' '}
                for a product they no longer have.
              </p>
              <p>
                There is no way to cancel somebody else&rsquo;s subscription from
                here. You have to do one of these now:
              </p>
              <ol className="list-decimal pl-5 space-y-1.5 text-xs">
                <li>
                  Open the <strong>Paystack dashboard</strong> → Customers → find
                  @{paystackWarning} → Subscriptions → <strong>Disable</strong>.
                </li>
                <li>
                  Or ask them to cancel from inside the app, which reaches Paystack
                  on their own account.
                </li>
              </ol>
              <a href="https://dashboard.paystack.com/#/customers" target="_blank"
                 rel="noopener noreferrer"
                 className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:underline">
                Open Paystack customers <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="p-5 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setPaystackWarning(null)}
                      className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm">
                I understand — I will cancel it at Paystack
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
