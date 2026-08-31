import React, { useState, useEffect, useCallback } from 'react';
import { Card, Field, Note, Empty, inputCls, btnCls, btnGhost } from './ui';
import { UserPlus, Trash2, Users } from 'lucide-react';

const naira = (n: number) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

/**
 * Who the money in a modelled round is coming from.
 *
 * A raise is rarely one anonymous cheque. Naming the participants lets a
 * scenario be argued about ("what if Arinze puts in 20m and an outside fund
 * puts in 180m") instead of staring at a single number, and the total is what
 * feeds the dilution maths.
 *
 * NOTHING HERE TOUCHES THE CAP TABLE. It is scratch paper that survives a
 * page reload, which is why it is stored rather than kept in component state.
 */
export function InvestorPicker({ get, post, put, del, onTotal, role }: any) {
  const [list, setList] = useState<any[]>([]);
  const [people, setPeople] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState<any>({ name: '', amount: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const r = await get('/api/live/investors');
      setList(r);
      onTotal(r.reduce((a: number, i: any) => a + Number(i.amount || 0), 0));
    } catch (e: any) { setErr(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    get('/api/people').then(setPeople).catch(() => setPeople([]));
  }, []);

  const isFounder = role === 'founder';

  const add = async () => {
    setBusy(true); setErr(null);
    try {
      const person = people.find((p: any) => p.id === f.person_id);
      await post('/api/live/investors', {
        name: person ? person.full_name : (f.name?.trim() || 'Test investor'),
        person_id: f.person_id || null,
        amount: Math.round(Number(f.amount || 0)),
        is_test: !f.person_id,
        note: f.note || null,
      });
      setF({ name: '', amount: '' });
      setAdding(false);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const setAmount = async (id: string, amount: number) => {
    try { await put(`/api/live/investors/${id}`, { amount }); await load(); }
    catch (e: any) { setErr(e.message); }
  };

  const total = list.reduce((a, i) => a + Number(i.amount || 0), 0);

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Where the money is coming from
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Model several participants at once. Nothing here changes the real
            cap table.
          </p>
        </div>
        {isFounder && (
          <button onClick={() => setAdding(!adding)} className={btnGhost}>
            <UserPlus className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />
            {adding ? 'Cancel' : 'Add someone'}
          </button>
        )}
      </div>

      {err && <div className="px-5 pt-4"><Note tone="rose">{err}</Note></div>}

      {adding && (
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Who"
                   hint="Somebody on the register, or leave blank for an outsider.">
              <select className={inputCls} value={f.person_id || ''}
                      onChange={(e) => setF({ ...f, person_id: e.target.value || null })}>
                <option value="">A test investor (not on the register)</option>
                {people.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}{p.role_title ? ` — ${p.role_title}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {!f.person_id && (
              <Field label="Call them">
                <input className={inputCls} value={f.name}
                       placeholder="e.g. Ventures Fund A"
                       onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
            )}

            <Field label="Putting in (₦)">
              <input type="number" className={inputCls} value={f.amount}
                     onChange={(e) => setF({ ...f, amount: e.target.value })} />
            </Field>
          </div>
          <button onClick={add} disabled={busy || !Number(f.amount)} className={btnCls}>
            {busy ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      {list.length === 0 ? (
        <Empty>
          Nobody added. The whole raise is treated as one anonymous investor.
        </Empty>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {list.map((i) => (
            <div key={i.id} className="flex flex-wrap items-center gap-3 p-4">
              <Users className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-[140px]">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {i.person_name || i.name}
                </p>
                <p className="text-xs text-slate-500">
                  {i.person_name
                    ? (i.role_title || 'on the register')
                    : 'hypothetical'}
                  {total > 0 && (
                    <> · {((Number(i.amount) / total) * 100).toFixed(1)}% of the round</>
                  )}
                </p>
              </div>
              {isFounder ? (
                <input type="number" defaultValue={i.amount}
                       className={inputCls + ' max-w-[160px]'}
                       onBlur={(e) => setAmount(i.id, Number(e.target.value))} />
              ) : (
                <span className="font-mono text-sm">{naira(i.amount)}</span>
              )}
              {isFounder && (
                <button title="Remove"
                        className="p-2 rounded-lg text-slate-400 hover:text-rose-600"
                        onClick={async () => {
                          await del(`/api/live/investors/${i.id}`); await load();
                        }}>
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {list.length > 0 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
            Total being raised
          </span>
          <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
            {naira(total)}
          </span>
        </div>
      )}
    </Card>
  );
}
