import React, { useState, useEffect, useCallback } from 'react';
import { Card, Note, Th, Td, fmtNaira } from './ui';
import { HandCoins, Clock, CheckCircle2, Bike, Bus } from 'lucide-react';

/**
 * Fees earned and not yet collected.
 *
 * WHY THIS PANEL HAD TO EXIST THE MOMENT 0099 SHIPPED. That migration stopped
 * counting a finished ride as income, because the allowance fee is a debt the
 * vendor owes until settle_transport_vendor_fees() clears it. Correct -- but
 * removing N4,650 from the books with nothing in its place would turn real
 * money into an absence nobody was tracking.
 *
 * So it is out of revenue and into view. The oldest date is the important
 * column: a fee owed since August is a different conversation from one owed
 * since yesterday, and without it "N4,650 outstanding" is a number rather
 * than a prompt to do something.
 */
export function Receivable({ get }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await get('/api/finance/receivable')); }
    catch (e: any) { setErr(e.message); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  if (err) return <Note tone="rose" title="Could not read outstanding fees.">{err}</Note>;
  if (!rows) return null;

  if (rows.length === 0) {
    return (
      <Note tone="slate">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Every delivery and transport fee earned has been settled.
        </span>
      </Note>
    );
  }

  const total = rows.reduce((a, r) => a + r.owed, 0);
  const stale = rows.filter((r) => (r.days_outstanding ?? 0) > 30);

  return (
    <Card className="overflow-hidden border-amber-300 dark:border-amber-800">
      <button onClick={() => setOpen(!open)}
              className="w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-amber-50/50 dark:hover:bg-amber-950/10">
        <div>
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <HandCoins className="w-4 h-4" />
            {fmtNaira(total)} earned and not yet collected
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Agents and vendors owe this. It is not income until they settle,
            so it is deliberately outside the figures above &mdash; but it is
            money, and it is late.
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400 shrink-0">
          {open ? 'HIDE' : 'SHOW'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800">
          {stale.length > 0 && (
            <div className="p-4">
              <Note tone="amber" title={`${stale.length} outstanding for over a month.`}>
                A fee that has sat unsettled this long is usually either a
                person who has stopped working or one who does not know they
                owe it. Both are worth a message before they are worth
                writing off.
              </Note>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>Who</Th><Th>What for</Th><Th right>Jobs</Th>
                  <Th right>Owed</Th><Th>Waiting</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r, i) => {
                  const Icon = r.kind === 'Transport' ? Bus : Bike;
                  const days = r.days_outstanding ?? 0;
                  return (
                    <tr key={`${r.kind}-${r.owed_by}-${i}`}>
                      <Td>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {r.full_name || r.username || 'Unknown'}
                        </p>
                        {r.phone_number && (
                          <p className="text-xs text-slate-500">{r.phone_number}</p>
                        )}
                      </Td>
                      <Td className="text-xs text-slate-500">
                        <span className="inline-flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5" />
                          {r.kind}
                        </span>
                      </Td>
                      <Td right mono className="text-xs text-slate-500">{r.jobs}</Td>
                      <Td right mono bold>{fmtNaira(r.owed)}</Td>
                      <Td>
                        <span className={`text-xs font-medium inline-flex items-center gap-1 ${
                          days > 30 ? 'text-rose-600'
                          : days > 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                          <Clock className="w-3 h-3" />
                          {days === 0 ? 'today'
                           : days === 1 ? '1 day'
                           : `${days} days`}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4">
            <Note tone="slate">
              Settling is done from the agent&rsquo;s or vendor&rsquo;s own
              screen in the mobile app, which routes the payment through the
              gateway. The moment it clears, the fee moves out of here and
              into income &mdash; with the processor&rsquo;s cut deducted on
              the settlement total rather than on each job.
            </Note>
          </div>
        </div>
      )}
    </Card>
  );
}
