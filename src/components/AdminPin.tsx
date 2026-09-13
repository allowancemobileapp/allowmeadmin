import React, { useState, useEffect, useRef } from 'react';
import { auth, loginWithGoogle } from '../firebase';
import { ShieldCheck, X, KeyRound } from 'lucide-react';

export const SUPER_ADMINS = [
  'allowancemobileapp@gmail.com',
  'allowancemobielapp@gmail.com',
];

export const isSuperAdmin = () =>
  SUPER_ADMINS.includes((auth.currentUser?.email || '').toLowerCase());

/**
 * Ask for the six-digit PIN.
 *
 * The PIN is NEVER kept anywhere — not in state that outlives the modal, not
 * in localStorage, not in a "remember me". It is typed, sent with the one
 * request it authorises, and dropped. Caching it would recreate exactly the
 * hole it exists to close: a live session that can act without the person.
 *
 * Everything that matters is checked server-side. This component collects
 * digits; it decides nothing.
 */
export function PinPrompt({ title, action, onConfirm, onClose }: {
  title: string;
  action: string;
  onConfirm: (pin: string) => Promise<void>;
  onClose: () => void;
}) {
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);

  const submit = async () => {
    if (digits.length !== 6) return;
    setBusy(true); setErr(null);
    try {
      await onConfirm(digits);
    } catch (e: any) {
      setErr(e.message || 'That did not work.');
      setDigits('');
      ref.current?.focus();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4"
         onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-sm"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-amber-500" />
              {title}
            </h2>
            <p className="text-xs text-slate-500 mt-1">{action}</p>
          </div>
          <button onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <input
            ref={ref}
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={digits}
            onChange={(e) => {
              setDigits(e.target.value.replace(/\D/g, '').slice(0, 6));
              setErr(null);
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="••••••"
            className="w-full text-center text-3xl font-mono tracking-[0.5em] py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {err && <p className="text-sm text-rose-600 font-medium text-center">{err}</p>}

          <button onClick={submit} disabled={busy || digits.length !== 6}
                  className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
            {busy ? 'Checking…' : 'Confirm'}
          </button>

          <p className="text-[11px] text-slate-400 text-center">
            Five wrong attempts locks this for fifteen minutes.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Setting the PIN, and changing it.
 *
 * A first PIN needs a recent sign-in, because there is no older secret to
 * prove with. Every change after that needs the current PIN — otherwise
 * anybody holding the session could set a new one and walk straight through,
 * and the second factor would be a formality with a keypad.
 */
export function PinSettings({ get, post }: any) {
  const [status, setStatus] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  // The server wants a recent sign-in and this screen has to offer one.
  const [needsReauth, setNeedsReauth] = useState(false);

  const load = () => get('/api/undo/pin').then(setStatus).catch(() => setStatus(null));
  useEffect(() => { load(); }, []);

  if (!status?.is_super_admin) return null;

  const submit = async () => {
    await post('/api/undo/pin', { pin: next, current_pin: current || null });
    setMsg(status.has_pin ? 'PIN changed.' : 'PIN set.');
    setCurrent(''); setNext(''); setConfirm('');
    setNeedsReauth(false); setOpen(false);
    load();
  };

  const save = async () => {
    if (next !== confirm) { setErr('The two new PINs do not match.'); return; }
    setBusy(true); setErr(null); setMsg(null);
    try {
      await submit();
    } catch (e: any) {
      // A dead-end "sign in again" with nothing to click is not an
      // instruction, it is a wall. Offer the sign-in here instead.
      if (/sign in again|REAUTH_REQUIRED/i.test(e?.message || '')) {
        setNeedsReauth(true);
        setErr(null);
      } else {
        setErr(e.message);
      }
    } finally { setBusy(false); }
  };

  /**
   * Re-authenticate, then finish the thing that was blocked.
   *
   * getIdToken(true) forces a refresh. Without it the browser keeps handing
   * over the token it already had, whose auth_time is the old one, and the
   * server keeps refusing however many times somebody signs in.
   */
  const reauthThenSave = async () => {
    setBusy(true); setErr(null);
    try {
      await loginWithGoogle();
      await auth.currentUser?.getIdToken(true);
      await submit();
    } catch (e: any) {
      setErr(e?.message || 'Could not confirm it is you.');
    } finally { setBusy(false); }
  };

  const box = 'w-full text-center text-xl font-mono tracking-[0.4em] py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const only6 = (v: string) => v.replace(/\D/g, '').slice(0, 6);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <button onClick={() => setOpen(!open)}
              className="w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" />
            Your six-digit PIN
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {status.has_pin
              ? <>Set. Required for deleting or restoring any record
                  {status.last_used_at && <> — last used {
                    new Date(status.last_used_at).toLocaleDateString('en-NG')}</>}.</>
              : <span className="text-amber-600 font-medium">
                  Not set yet. Destructive actions stay blocked until it is.
                </span>}
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400 shrink-0">
          {open ? 'CLOSE' : status.has_pin ? 'CHANGE' : 'SET IT'}
        </span>
      </button>

      {status.locked && (
        <div className="px-5 pb-4">
          <p className="text-xs font-medium text-rose-600">
            Locked for another {Math.ceil(status.locked_seconds / 60)} minute(s)
            after too many wrong attempts.
          </p>
        </div>
      )}

      {open && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {status.has_pin && (
            <label className="block">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Current PIN
              </span>
              <input type="password" inputMode="numeric" className={box + ' mt-1.5'}
                     value={current} maxLength={6}
                     onChange={(e) => setCurrent(only6(e.target.value))} />
            </label>
          )}
          <label className="block">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              New PIN
            </span>
            <input type="password" inputMode="numeric" className={box + ' mt-1.5'}
                   value={next} maxLength={6}
                   onChange={(e) => setNext(only6(e.target.value))} />
          </label>
          <label className="block">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Repeat it
            </span>
            <input type="password" inputMode="numeric" className={box + ' mt-1.5'}
                   value={confirm} maxLength={6}
                   onChange={(e) => setConfirm(only6(e.target.value))} />
          </label>

          <p className="text-[11px] text-slate-500">
            Six digits, and not an obvious one — 123456 and six repeated
            digits are refused, because they are the first things anybody
            tries and a PIN that loses to three guesses reads as protection
            while providing none.
          </p>

          {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}
          {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}

          {needsReauth ? (
            <div className="p-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 space-y-3">
              <p className="text-xs text-amber-800 dark:text-amber-400">
                Your first PIN needs a fresh sign-in, because there is no older
                PIN to prove with. Confirm below and it will be set straight
                away &mdash; your digits are still here.
              </p>
              <button onClick={reauthThenSave} disabled={busy}
                      className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
                {busy ? 'Confirming…'
                      : `Sign in as ${auth.currentUser?.email || 'yourself'} and set it`}
              </button>
            </div>
          ) : (
            <button onClick={save} disabled={busy || next.length !== 6}
                    className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white font-bold text-sm disabled:opacity-40">
              {busy ? 'Saving…' : status.has_pin ? 'Change PIN' : 'Set PIN'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
