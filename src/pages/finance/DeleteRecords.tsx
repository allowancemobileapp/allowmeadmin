import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Field, Empty, Note, Th, Td, inputCls, btnCls, btnGhost,
} from './ui';
import { Trash2, Undo2, ShieldAlert, History } from 'lucide-react';
import { auth, loginWithGoogle } from '../../firebase';

const day = (d: string) =>
  new Date(d).toLocaleString('en-NG',
    { day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit' });

/**
 * Deleting a record, and putting it back.
 *
 * WHY RE-AUTHENTICATION IS NOT A CHECKBOX. Firebase refreshes the ID token
 * every hour on its own, so a live session proves somebody signed in at some
 * point, not that the person at the keyboard right now is the account holder.
 * The `auth_time` claim only moves when a human actually signs in, and it is
 * inside the signature -- so the SERVER checks it. A "confirm it's you"
 * prompt that only sets a flag in the browser proves nothing to anybody; this
 * one cannot be skipped by editing local state, because local state is not
 * what is being read.
 *
 * NOTHING IS DESTROYED. The whole row is kept, so a restore puts back exactly
 * what was there -- same id, same values.
 */
export function DeleteRecords({ get, post }: any) {
  const [open, setOpen] = useState(false);
  const [entities, setEntities] = useState<any[]>([]);
  const [deleted, setDeleted] = useState<any[] | null>(null);
  const [entity, setEntity] = useState('expense');
  const [recordId, setRecordId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);

  // Only the super admin can do any of this, and the server is the authority.
  // Hiding the panel from everyone else is courtesy, not the control.
  const isSuper = ['allowancemobileapp@gmail.com', 'allowancemobielapp@gmail.com']
    .includes((auth.currentUser?.email || '').toLowerCase());

  const loadDeleted = useCallback(async () => {
    try { setDeleted(await get('/api/undo/deleted')); }
    catch { setDeleted([]); }
  }, [get]);

  useEffect(() => {
    if (!open || !isSuper) return;
    get('/api/undo/entities').then(setEntities).catch(() => setEntities([]));
    loadDeleted();
  }, [open, isSuper]);

  if (!isSuper) return null;

  /**
   * Prove it is you, for real.
   *
   * A fresh Google sign-in moves auth_time, then getIdToken(true) forces a
   * new token carrying it. Without the forced refresh the browser would keep
   * handing over the old cached token and the server would rightly keep
   * refusing.
   */
  const reauthenticate = async () => {
    setBusy(true); setErr(null);
    try {
      await loginWithGoogle();
      await auth.currentUser?.getIdToken(true);
      setNeedsReauth(false);
      setMsg('Confirmed. You have five minutes.');
    } catch (e: any) {
      setErr(e?.message || 'Could not confirm it is you.');
    } finally { setBusy(false); }
  };

  const handle = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null); setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      const m = e?.message || String(e);
      // The server says a fresh sign-in is needed. Offer it rather than
      // leaving somebody to work out what "REAUTH_REQUIRED" means.
      if (/sign-in from the last five minutes|Confirm it is you/i.test(m)) {
        setNeedsReauth(true);
        setErr('This needs a fresh sign-in. Confirm below, then try again.');
      } else {
        setErr(m);
      }
    } finally { setBusy(false); }
  };

  const doDelete = () => handle(async () => {
    const r = await fetch(`/api/undo/${entity}/${recordId.trim()}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await auth.currentUser!.getIdToken()}`,
      },
      body: JSON.stringify({ reason }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Could not delete that record.');

    setMsg(`Deleted: ${body.description}. It can be put back below.`);
    setRecordId(''); setReason('');
    await loadDeleted();
  });

  const restore = (id: string) => handle(async () => {
    const r = await post(`/api/undo/deleted/${id}/restore`, {});
    setMsg(`Restored: ${r.description}`);
    await loadDeleted();
  });

  return (
    <Card className="overflow-hidden">
      <button onClick={() => setOpen(!open)}
              className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-500" />
            Undo a record
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Only you can do this, and only with a sign-in from the last five
            minutes. Nothing is destroyed &mdash; anything removed can be put
            back.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400">
          {open ? 'HIDE' : 'OPEN'}
        </span>
      </button>

      {open && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          {needsReauth && (
            <Note tone="amber" title="Confirm it is you.">
              <p className="mb-3">
                A live session is not proof that you are the one at the
                keyboard &mdash; the token refreshes itself every hour. Sign in
                again and the server can see that you did.
              </p>
              <button onClick={reauthenticate} disabled={busy} className={btnCls}>
                {busy ? 'Confirming…'
                      : `Sign in as ${auth.currentUser?.email || 'yourself'}`}
              </button>
            </Note>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Kind of record">
              <select className={inputCls} value={entity}
                      onChange={(e) => setEntity(e.target.value)}>
                {entities.map((en: any) => (
                  <option key={en.id} value={en.id}>{en.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Record id"
                   hint="From the list on the relevant screen.">
              <input className={inputCls} value={recordId}
                     onChange={(e) => setRecordId(e.target.value)} />
            </Field>
          </div>

          <Field label="Why" hint="Kept with the record, so the correction explains itself.">
            <input className={inputCls} value={reason}
                   onChange={(e) => setReason(e.target.value)}
                   placeholder="e.g. entered twice by mistake" />
          </Field>

          {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}
          {msg && <p className="text-sm text-emerald-600 font-medium">{msg}</p>}

          <button onClick={doDelete} disabled={busy || !recordId.trim()}
                  className={btnCls + ' bg-rose-600 hover:bg-rose-500'}>
            <Trash2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            {busy ? 'Working…' : 'Delete this record'}
          </button>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 mb-3">
              <History className="w-3.5 h-3.5" />
              Recently deleted
            </h3>

            {deleted === null ? <Empty>Loading…</Empty>
             : deleted.length === 0 ? (
              <p className="text-xs text-slate-500">Nothing has been deleted.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <Th>What</Th><Th>Kind</Th><Th>When</Th><Th>Why</Th><Th></Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {deleted.map((d: any) => (
                      <tr key={d.id} className={d.restored_at ? 'opacity-50' : ''}>
                        <Td className="text-xs">{d.description}</Td>
                        <Td className="text-xs text-slate-500">{d.label}</Td>
                        <Td className="text-xs text-slate-500 whitespace-nowrap">
                          {day(d.deleted_at)}
                        </Td>
                        <Td className="text-xs text-slate-500">{d.reason}</Td>
                        <Td right>
                          {d.restored_at ? (
                            <span className="text-[10px] font-bold text-emerald-600">
                              put back
                            </span>
                          ) : (
                            <button onClick={() => restore(d.id)} disabled={busy}
                                    className={btnGhost}>
                              <Undo2 className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                              Put it back
                            </button>
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
