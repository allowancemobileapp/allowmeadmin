import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Lock, ShieldAlert } from 'lucide-react';
import { Card, Note, btnCls } from './ui';
import { auth, loginWithGoogle } from '../../firebase';

/**
 * Section 9: 30 minutes idle, and re-authentication before payroll or the
 * deferred salary ledger.
 *
 * WHAT THIS ACTUALLY DEFENDS AGAINST, stated plainly so nobody mistakes it
 * for more than it is: an unattended laptop, and a shoulder-surfer. It is a
 * real protection for the realistic threat.
 *
 * WHAT IT DOES NOT DEFEND AGAINST: anyone calling the API directly. That is
 * requireAdmin's job, and it now does it properly -- every request carries a
 * Firebase ID token verified against Google's public keys, and the email is
 * read from the signature rather than from a header the caller wrote. This
 * component is the lock on the laptop; that is the lock on the door.
 */

const IDLE_MS = 30 * 60 * 1000;
const REAUTH_VALID_MS = 5 * 60 * 1000;

export function useIdleLock() {
  const [locked, setLocked] = useState(false);
  const timer = useRef<any>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLocked(true), IDLE_MS);
  }, []);

  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    const onActivity = () => { if (!locked) reset(); };
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    reset();
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      if (timer.current) clearTimeout(timer.current);
    };
  }, [locked, reset]);

  return { locked, unlock: () => { setLocked(false); reset(); } };
}

export function IdleLockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const unlock = async () => {
    setBusy(true); setErr(null);
    try {
      await loginWithGoogle();
      sessionStorage.setItem('finance_reauth_at', String(Date.now()));
      onUnlock();
    } catch (e: any) {
      setErr(e?.message || 'Could not confirm it is you.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-6">
      <Card className="p-8 max-w-md text-center">
        <Lock className="w-10 h-10 text-indigo-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-4">
          Locked after 30 minutes idle
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          This page holds salaries and the cap table. Sign in again to carry on.
        </p>
        {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
        <button onClick={unlock} disabled={busy} className={btnCls + ' mt-5'}>
          {busy ? 'Confirming…' : 'Sign in again'}
        </button>
      </Card>
    </div>
  );
}

/**
 * Wraps payroll and the deferred ledger. A fresh sign-in is required, and it
 * only stays fresh for five minutes.
 */
export function ReauthGate({ children }: { children: React.ReactNode }) {
  const [ok, setOk] = useState(() => {
    const at = Number(sessionStorage.getItem('finance_reauth_at') || 0);
    return Date.now() - at < REAUTH_VALID_MS;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true); setErr(null);
    try {
      // A fresh popup, not a cached session -- the point is to prove the
      // person at the keyboard right now is the account holder.
      await loginWithGoogle();
      sessionStorage.setItem('finance_reauth_at', String(Date.now()));
      setOk(true);
    } catch (e: any) {
      setErr(e?.message || 'Could not confirm it is you.');
    } finally { setBusy(false); }
  };

  if (ok) return <>{children}</>;

  return (
    <div className="max-w-lg">
      <Card className="p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-200 mt-4">
          Confirm it is you
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          This section shows what every officer is paid and what they are owed.
        </p>
        {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
        <button onClick={confirm} disabled={busy} className={btnCls + ' mt-5'}>
          {busy ? 'Confirming…' : `Sign in as ${auth.currentUser?.email || 'yourself'}`}
        </button>
        <p className="text-[11px] text-slate-400 mt-4">
          Stays unlocked for five minutes.
        </p>
      </Card>
    </div>
  );
}
