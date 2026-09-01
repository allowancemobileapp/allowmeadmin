import React, { useState, useEffect, useCallback } from 'react';
import {
  Card, Stat, Field, Note, Th, Td, inputCls, btnCls, btnGhost, fmtKobo,
} from './ui';
import {
  Receipt, Upload, X, Paperclip, Undo2, Scale, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { authHeadersForUpload } from '../../hooks/useApi';

const naira = (n: number) =>
  '₦' + Math.round(Number(n) || 0).toLocaleString('en-NG');

const day = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('en-NG',
        { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * Multipart upload.
 *
 * Sent with fetch rather than the JSON helper: setting Content-Type by hand
 * on a FormData body strips the boundary marker and the server sees no file.
 */
async function uploadFile(path: string, fd: FormData) {
  const res = await fetch(path, {
    method: 'POST',
    headers: await authHeadersForUpload(),
    body: fd,
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || 'Upload failed.');
  }
  return res.json();
}

const METHODS = [
  { id: 'bank_transfer', label: 'Bank transfer' },
  { id: 'cash',          label: 'Cash' },
  { id: 'cheque',        label: 'Cheque' },
  { id: 'ussd',          label: 'USSD' },
  { id: 'other',         label: 'Other' },
];

/**
 * Recording a salary payment.
 *
 * WHAT THIS REPLACED. A "Mark paid" button that set one figure and stopped.
 * It captured no date anybody chose, no reference, no receipt, could hold
 * only one payment per month, and wrote nothing to the expense ledger -- so
 * the largest thing the company spends money on never reached the books and
 * the cash position was overstated by the whole payroll, every month.
 *
 * The amount is in KOBO on the wire, because payroll_runs is. The form works
 * in naira because a person does, and converts once, here.
 */
export function PayPayrollModal({ run, post, onClose, onDone }: any) {
  const outstanding = Math.max(0, run.cash_due - run.cash_paid);
  const [amount, setAmount] = useState(String(Math.round(outstanding / 100)));
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);

  const kobo = Math.round(Number(amount) * 100);
  const valid = Number.isFinite(kobo) && kobo > 0 && kobo <= outstanding;
  const over = Number.isFinite(kobo) && kobo > outstanding;

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      setStep('Recording the payment…');
      const r = await post(`/api/finance/payroll/${run.id}/pay`, {
        amount: kobo, paid_on: paidOn, method, reference, note,
      });

      // The receipt is a second request on purpose: the payment and its
      // expense row are already committed by the time the file is sent, so a
      // failed or abandoned upload can never lose the payment itself. It can
      // be attached afterwards from the history.
      if (file && r?.payment?.id) {
        setStep('Attaching the receipt…');
        try {
          const fd = new FormData();
          fd.append('file', file);
          await uploadFile(`/api/finance/payroll/payments/${r.payment.id}/receipt`, fd);
        } catch (e: any) {
          setErr(`The payment was recorded, but the receipt did not upload: ${
            e.message}. Attach it from the history.`);
          setBusy(false); setStep(null);
          return;
        }
      }
      onDone();
    } catch (e: any) { setErr(e.message); setBusy(false); setStep(null); }
  };

  return (
    <Modal title={`Pay ${run.full_name}`} onClose={onClose}>
      <div className="flex items-center gap-6 text-xs">
        <div>
          <p className="text-slate-500 uppercase font-bold text-[10px]">Due this month</p>
          <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
            {fmtKobo(run.cash_due)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 uppercase font-bold text-[10px]">Already paid</p>
          <p className="font-mono font-bold text-sm text-slate-800 dark:text-slate-200">
            {fmtKobo(run.cash_paid)}
          </p>
        </div>
        <div>
          <p className="text-slate-500 uppercase font-bold text-[10px]">Still owed</p>
          <p className="font-mono font-bold text-sm text-amber-600">
            {fmtKobo(outstanding)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="How much was paid (₦)"
               hint="Part payments are fine. Record each one separately.">
          <input type="number" step="1" min="0" className={inputCls} value={amount}
                 onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="When it left the account">
          <input type="date" className={inputCls} value={paidOn}
                 onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
        <Field label="How">
          <select className={inputCls} value={method}
                  onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Reference"
               hint="The transfer reference, so this can be traced to a statement.">
          <input className={inputCls} value={reference}
                 onChange={(e) => setReference(e.target.value)} />
        </Field>
      </div>

      <Field label="Receipt"
             hint="A screenshot of the transfer, or the bank's PDF. Stored privately.">
        <label className="flex items-center gap-3 px-3 py-2 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 cursor-pointer hover:border-indigo-400">
          <Upload className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
            {file ? file.name : 'Choose a file'}
          </span>
          <input type="file" className="hidden"
                 accept="image/*,application/pdf"
                 onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </Field>

      <Field label="Note" hint="Optional. Anything worth remembering about this one.">
        <input className={inputCls} value={note}
               onChange={(e) => setNote(e.target.value)} />
      </Field>

      {over && (
        <Note tone="rose" title="That is more than the month owes.">
          {fmtKobo(outstanding)} is outstanding on this line. Money above that
          is not salary for this month — it is either a typo or a payment
          against the deferred balance, which is a different debt with
          different rules and is recorded on the Deferred Salary Account.
        </Note>
      )}

      <Note tone="slate">
        This writes {kobo > 0 ? naira(kobo / 100) : 'the amount'} into the
        expense ledger dated {day(paidOn)}, so the company&rsquo;s cash
        position drops by it. Salary is not a deductible category, so it does
        not touch Monthly Gross Profit — salaries are paid <em>out of</em>{' '}
        gross profit, not before it.
      </Note>

      {err && <p className="text-sm text-rose-600 font-medium">{err}</p>}

      <button onClick={save} disabled={busy || !valid} className={btnCls}>
        {busy ? (step || 'Recording…')
              : `Record ${kobo > 0 ? naira(kobo / 100) : ''} paid`}
      </button>
    </Modal>
  );
}

/**
 * Every payment behind one payroll line, with its receipt.
 *
 * A reversal stays visible rather than disappearing. "Entered on the 3rd,
 * reversed on the 5th, because it was the wrong account" is part of the
 * record, and a history that quietly dropped it would be worth less than no
 * history at all.
 */
export function PaymentHistory({ run, get, post, role, onChange }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try { setRows(await get(`/api/finance/payroll/${run.id}/payments`)); }
    catch (e: any) { setErr(e.message); setRows([]); }
  }, [run.id]);

  useEffect(() => { load(); }, [load]);

  const openReceipt = async (id: string) => {
    setBusy(id);
    try {
      const r = await get(`/api/finance/payroll/payments/${id}/receipt`);
      window.open(r.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const attach = async (id: string, f: File) => {
    setBusy(id); setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', f);
      await uploadFile(`/api/finance/payroll/payments/${id}/receipt`, fd);
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  const voidIt = async (id: string) => {
    const reason = window.prompt(
      'Why is this being reversed? It stays on the record with this reason, '
      + 'and its expense row is removed from the books.');
    if (!reason) return;
    setBusy(id); setErr(null);
    try {
      await post(`/api/finance/payroll/payments/${id}/void`, { reason });
      await load();
      onChange?.();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(null); }
  };

  if (rows === null) return <p className="text-xs text-slate-500 px-4 py-3">Loading…</p>;

  return (
    <div className="px-4 py-3 space-y-2">
      {err && <p className="text-xs text-rose-600">{err}</p>}

      {rows.length === 0 ? (
        <p className="text-xs text-slate-500">
          Nothing paid yet on this line.
        </p>
      ) : rows.map((p) => (
        <div key={p.id}
             className={`flex items-center gap-3 text-xs flex-wrap ${
               p.voided_at ? 'opacity-50' : ''}`}>
          {p.voided_at
            ? <Undo2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}

          <span className="text-slate-600 dark:text-slate-400">
            {day(p.paid_on)}
            {' · '}
            {METHODS.find((m) => m.id === p.method)?.label || p.method}
            {p.reference && ` · ${p.reference}`}
          </span>

          {p.voided_at && (
            <span className="text-rose-600 font-medium">
              reversed — {p.void_reason}
            </span>
          )}

          <span className={`ml-auto font-mono font-bold ${
            p.voided_at ? 'line-through text-slate-400'
                        : 'text-slate-800 dark:text-slate-200'}`}>
            {fmtKobo(p.amount)}
          </span>

          {!p.voided_at && (p.has_receipt ? (
            <button onClick={() => openReceipt(p.id)} disabled={busy === p.id}
                    className={btnGhost} title={p.file_name}>
              <Paperclip className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {busy === p.id ? '…' : 'Receipt'}
            </button>
          ) : role === 'founder' ? (
            <label className={btnGhost + ' cursor-pointer'}>
              <Upload className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
              {busy === p.id ? '…' : 'Add receipt'}
              <input type="file" className="hidden"
                     accept="image/*,application/pdf"
                     onChange={(e) => {
                       const f = e.target.files?.[0];
                       if (f) attach(p.id, f);
                     }} />
            </label>
          ) : (
            <span className="text-[10px] text-amber-600 font-bold">no receipt</span>
          ))}

          {role === 'founder' && !p.voided_at && (
            <button onClick={() => voidIt(p.id)} disabled={busy === p.id}
                    className={btnGhost} title="Reverse this payment">
              <Undo2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Does the app agree with the bank?
 *
 * The reason payroll is written into the expense ledger at all. A cash
 * position nobody can check against a statement is a number taken on faith,
 * and this is where it stops being one.
 *
 * A difference is NOT presented as an error. It is a list of things not yet
 * recorded, which is a to-do, and saying so is the difference between a
 * useful tool and one people learn to ignore.
 */
export function Reconciliation({ get, post, role }: any) {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    as_of: new Date().toISOString().slice(0, 10), balance: '', note: '',
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await get('/api/finance/reconciliation')); }
    catch (e: any) { setErr(e.message); }
  }, [get]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      await post('/api/finance/reconciliation', {
        as_of: form.as_of, balance: Number(form.balance), note: form.note,
      });
      setOpen(false);
      setForm({ ...form, balance: '', note: '' });
      await load();
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (err) {
    return (
      <Note tone="rose" title="Could not load the reconciliation.">
        {err}
        <br />
        If this mentions a missing view, run
        migrations/0090_payroll_payments.sql.
      </Note>
    );
  }
  if (!data) return null;

  const latest = data.history?.[0];
  const gap = latest ? latest.difference : null;
  const matches = gap !== null && Math.abs(gap) < 1;

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Scale className="w-4 h-4 text-slate-400" />
            The app against the bank
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Money in, plus capital that was never revenue, less money out.
            Every payroll payment now lands in here.
          </p>
        </div>
        {role === 'founder' && (
          <button onClick={() => setOpen(!open)} className={btnCls}>
            {open ? 'Cancel' : 'Enter the bank balance'}
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Money in" value={naira(data.income_in)} />
          <Stat label="Capital in" value={naira(data.capital_in)}
                sub="not revenue" />
          <Stat label="Money out" value={naira(data.expenses_out)} tone="red" />
          <Stat label="App says" value={naira(data.app_says)} tone="indigo"
                sub="should be in the account" />
        </div>

        {latest && (
          <div className={`p-4 rounded-xl border ${
            matches
              ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30'
              : 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30'}`}>
            <p className="text-xs font-bold flex items-center gap-1.5 mb-1">
              {matches
                ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 dark:text-emerald-400">
                      They agree, as at {day(latest.as_of)}.
                    </span></>
                : <><AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span className="text-amber-700 dark:text-amber-400">
                      {naira(Math.abs(gap))} apart, as at {day(latest.as_of)}.
                    </span></>}
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Bank says {naira(latest.bank_says)} · app said{' '}
              {naira(latest.app_says)}.
              {!matches && (gap > 0
                ? ' There is more in the account than the app knows about — '
                  + 'income that has not been recorded.'
                : ' There is less in the account than the app expects — '
                  + 'money has gone out without being logged.')}
            </p>
            {!matches && data.unpaid_payroll_kobo > 0 && (
              <p className="text-xs text-slate-500 mt-1">
                Worth checking first: {fmtKobo(data.unpaid_payroll_kobo)} of
                certified payroll is still unpaid, so it has correctly not
                left the account and is correctly not in the books.
              </p>
            )}
          </div>
        )}

        {!latest && (
          <Note tone="slate">
            No bank balance has been entered, so there is nothing to check the
            app against. Enter what the statement says and the two figures sit
            side by side.
          </Note>
        )}

        {open && (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="As at" hint="The statement date.">
                <input type="date" className={inputCls} value={form.as_of}
                       onChange={(e) => setForm({ ...form, as_of: e.target.value })} />
              </Field>
              <Field label="Balance (₦)" hint="What the statement says, to the naira.">
                <input type="number" step="0.01" className={inputCls}
                       value={form.balance}
                       onChange={(e) => setForm({ ...form, balance: e.target.value })} />
              </Field>
            </div>
            <Field label="Note">
              <input className={inputCls} value={form.note}
                     onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </Field>
            <button onClick={save} disabled={busy || !form.balance}
                    className={btnCls}>
              {busy ? 'Saving…' : 'Record it'}
            </button>
          </div>
        )}

        {data.history?.length > 1 && (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <Th>As at</Th><Th right>Bank</Th><Th right>App</Th>
                  <Th right>Difference</Th><Th>Note</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.history.map((h: any, i: number) => (
                  <tr key={`${h.as_of}-${h.account}`} className={i === 0 ? '' : 'opacity-70'}>
                    <Td className="text-xs whitespace-nowrap">{day(h.as_of)}</Td>
                    <Td right mono>{naira(h.bank_says)}</Td>
                    <Td right mono className="text-slate-500">{naira(h.app_says)}</Td>
                    <Td right mono bold className={
                      Math.abs(h.difference) < 1 ? 'text-emerald-600' : 'text-amber-600'}>
                      {Math.abs(h.difference) < 1 ? '—' : naira(h.difference)}
                    </Td>
                    <Td className="text-xs text-slate-500">{h.note}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Modal({ title, children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 overflow-y-auto"
         onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl w-full max-w-lg my-8"
           onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          <button onClick={onClose}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
}
