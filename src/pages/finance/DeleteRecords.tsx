import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Field, Empty, Note, Th, Td, inputCls, btnCls, btnGhost,
} from './ui';
import { Trash2, Undo2, ShieldAlert, History } from 'lucide-react';
import { auth } from '../../firebase';
import { PinPrompt, PinSettings } from '../../components/AdminPin';

const day = (d: string) =>
  new Date(d).toLocaleString('en-NG',
    { day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit' });

/**
 * Deleting a record, and putting it back.
 *
 * WHY A PIN RATHER THAN A FRESH SIGN-IN. The threat worth defending against
 * is somebody at an unlocked laptop with a live session, or somebody holding
 * the Google password. "Re-authenticate with Google" may simply succeed for
 * both of them. A PIN is a different KIND of secret -- known rather than
 * signed into -- so it holds exactly where the other gives way.
 *
 * It is checked in the database, never here, and five wrong attempts locks it
 * for fifteen minutes with the counter server-side. That lockout is what
 * makes six digits defensible rather than a million-guess formality.
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
  // The action waiting on a PIN: a delete, or a restore.
  const [pending, setPending] = useState<any>(null);

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

  const doDelete = async (pin: string) => {
    const r = await fetch(`/api/undo/${entity}/${recordId.trim()}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await auth.currentUser!.getIdToken()}`,
        'x-admin-pin': pin,
      },
      body: JSON.stringify({ reason }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Could not delete that record.');

    setMsg(`Deleted: ${body.description}. It can be put back below.`);
    setRecordId(''); setReason(''); setPending(null);
    await loadDeleted();
  };

  const doRestore = async (id: string, pin: string) => {
    const r = await fetch(`/api/undo/deleted/${id}/restore`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await auth.currentUser!.getIdToken()}`,
        'x-admin-pin': pin,
      },
      body: JSON.stringify({}),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body.error || 'Could not restore that record.');
    setMsg(`Restored: ${body.description}`);
    setPending(null);
    await loadDeleted();
  };

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
            Only you can do this, and only with your six-digit PIN. Nothing
            is destroyed &mdash; anything removed can be put back.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400">
          {open ? 'HIDE' : 'OPEN'}
        </span>
      </button>

      {open && (
        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <PinSettings get={get} post={post} />

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

          <button onClick={() => setPending({ kind: 'delete' })}
                  disabled={busy || !recordId.trim()}
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
                <table className="w-full min-w-[36rem]">
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
                            <button onClick={() => setPending({ kind: 'restore', id: d.id, what: d.description })}
                                    disabled={busy}
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
      {pending && (
        <PinPrompt
          title={pending.kind === 'delete' ? 'Delete this record' : 'Put it back'}
          action={pending.kind === 'delete'
            ? `${entity} ${recordId}. It is kept and can be restored.`
            : pending.what}
          onClose={() => setPending(null)}
          onConfirm={(pin) => pending.kind === 'delete'
            ? doDelete(pin) : doRestore(pending.id, pin)} />
      )}
    </Card>
  );
}
