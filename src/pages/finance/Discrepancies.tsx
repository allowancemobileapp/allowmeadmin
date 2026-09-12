import React, { useState, useEffect, useCallback } from 'react';
import { Card, Note, Th, Td, btnGhost, fmtKobo } from './ui';
import { AlertTriangle, CheckCircle2, ScanSearch } from 'lucide-react';

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const STATE_HELP: Record<string, string> = {
  'paying, but only cancellations recorded':
    'On a paid tier, and every row against them is a cancellation. This is '
    + 'what the old trigger produced when the tier was spelled anything other '
    + 'than exactly "Membership".',
  'paying, with no payment recorded at all':
    'On a paid tier with nothing recorded. Usually an account created already '
    + 'on Plus, which the old trigger could not see because it only fired on '
    + 'an update.',
  'paid, but not on a paid tier':
    'Money came in, and the tier is not set. Either a downgrade that was not '
    + 'logged, or a payment against the wrong account.',
};

/**
 * Subscriptions whose tier and payment history disagree.
 *
 * WHY THIS PANEL EXISTS. log_membership_change() spent two months recording a
 * paying subscriber as a cancellation, because it compared the tier against
 * the literal string 'Membership' and one profile said 'plus'. Nobody
 * noticed, and nobody could have: there was nowhere a discrepancy was allowed
 * to appear.
 *
 * That is the part worth fixing permanently. Money that quietly fails to be
 * counted is worse than money that errors, because gross profit sets the
 * salary band -- unrecorded income underpays people, silently, for as long as
 * it takes somebody to happen to look.
 *
 * NOTHING HERE IS AUTO-CORRECTED. Whether real money changed hands is a
 * question about a bank statement, not about the database. Several of these
 * accounts look like founder or test profiles. Inventing N700 of income for
 * each would put fiction into the figure that decides four people's pay.
 */
export function Discrepancies({ get }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await get('/api/finance/discrepancies')); }
    catch (e: any) { setErr(e.message); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return (
      <Note tone="rose" title="Could not check subscriptions.">
        {err}
      </Note>
    );
  }
  if (!data) return null;

  const rows = data.rows || [];

  // Nothing wrong is worth saying out loud, quietly. A panel that vanishes
  // when it is happy leaves you unsure whether it ran.
  if (rows.length === 0) {
    return (
      <Note tone="slate">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          Every paid subscription has a payment behind it, and every payment
          has a subscriber.
        </span>
      </Note>
    );
  }

  // What the gap is probably worth: one month of Plus per account that is
  // paying with nothing recorded. Called an estimate because that is what it
  // is -- somebody may have paid for six months, or not at all.
  const likely = rows.filter((r: any) =>
    r.state.startsWith('paying')).length * (data.plus_price_kobo || 0);

  return (
    <Card className="overflow-hidden border-amber-300 dark:border-amber-800">
      <button onClick={() => setOpen(!open)}
              className="w-full p-5 flex items-start justify-between gap-4 text-left hover:bg-amber-50/50 dark:hover:bg-amber-950/10">
        <div>
          <h2 className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {rows.length} subscription{rows.length === 1 ? '' : 's'} that
            {rows.length === 1 ? ' does' : ' do'} not reconcile
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {likely > 0
              ? <>Roughly {fmtKobo(likely)} of income may be unrecorded — one
                  month of Plus each. Worth checking against a statement.</>
              : 'Payments recorded against accounts that are not on a paid tier.'}
          </p>
        </div>
        <span className="text-xs font-bold text-slate-400 shrink-0">
          {open ? 'HIDE' : 'SHOW'}
        </span>
      </button>

      {open && (
        <div className="border-t border-slate-200 dark:border-slate-800">
          <div className="p-4">
            <Note tone="slate">
              <span className="flex items-start gap-1.5">
                <ScanSearch className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  These are not corrected automatically. Whether money actually
                  changed hands is a question for your bank statement, and
                  several of these look like founder or test accounts —
                  inventing income for them would put fiction into the figure
                  that sets salaries. Record a real one under{' '}
                  <strong>Record → Revenue</strong>.
                </span>
              </span>
            </Note>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem]">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>Account</Th><Th>Tier</Th><Th>Joined</Th>
                  <Th right>Recorded</Th><Th>What is wrong</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r: any) => (
                  <tr key={r.user_id}>
                    <Td>
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                        {r.full_name || r.username || 'No name'}
                      </p>
                      {r.username && r.full_name && (
                        <p className="text-xs text-slate-500">@{r.username}</p>
                      )}
                    </Td>
                    <Td className="text-xs">
                      <span className="font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800">
                        {r.subscription_tier || 'none'}
                      </span>
                    </Td>
                    <Td className="text-xs text-slate-500 whitespace-nowrap">
                      {day(r.joined_at)}
                    </Td>
                    <Td right mono className="text-xs">
                      {r.collected_kobo > 0
                        ? fmtKobo(r.collected_kobo)
                        : <span className="text-rose-600 font-bold">nothing</span>}
                      {r.zero_payments > 0 && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          {r.zero_payments} cancellation
                          {r.zero_payments === 1 ? '' : 's'} logged
                        </span>
                      )}
                    </Td>
                    <Td className="text-xs text-slate-500 max-w-sm">
                      {STATE_HELP[r.state] || r.state}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}
