import React from 'react';

/**
 * Shared pieces for the finance tabs.
 *
 * TWO MONEY FORMATTERS, NAMED FOR THEIR UNIT.
 *
 * The v2 endpoints (gross profit, payroll, deferred, awards) speak KOBO as
 * integers. The older v1 endpoints (summary, timeseries, balance sheet) speak
 * naira. Mixing them up by a factor of one hundred is the exact bug that sat
 * in the dashboard for months, so neither formatter is called just `money`
 * and neither guesses.
 */

/** For v2 endpoints. Input is an integer number of kobo. */
export const fmtKobo = (k: number, dp = 0) =>
  '₦' + (Number(k || 0) / 100).toLocaleString('en-NG', {
    minimumFractionDigits: dp, maximumFractionDigits: dp });

/** For v1 endpoints. Input is already naira. */
export const fmtNaira = (n: number, dp = 0) =>
  '₦' + Number(n || 0).toLocaleString('en-NG', {
    minimumFractionDigits: dp, maximumFractionDigits: dp });

export const pct = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined ? '—' : `${Number(n).toFixed(dp)}%`;

export const shares = (n: number) => Number(n || 0).toLocaleString('en-NG');

export function Card({ children, className = '' }: any) {
  return (
    <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'slate', icon: Icon }: any) {
  const tones: Record<string, string> = {
    slate: 'text-slate-800 dark:text-slate-100',
    green: 'text-emerald-600 dark:text-emerald-400',
    red: 'text-rose-600 dark:text-rose-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    amber: 'text-amber-600 dark:text-amber-400',
  };
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-slate-400 shrink-0" />}
      </div>
      <p className={`text-2xl font-mono font-bold mt-2 ${tones[tone] || tones.slate}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </Card>
  );
}

export function Field({ label, hint, children }: any) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">{label}</span>
      {hint && <span className="block text-xs text-slate-500 font-normal mt-0.5">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export const inputCls =
  'w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 ' +
  'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500';

export const btnCls =
  'px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm ' +
  'font-bold disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors';

export const btnGhost =
  'px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 ' +
  'dark:text-slate-300 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700';

export function Empty({ children }: any) {
  return <div className="text-center py-12 text-sm text-slate-500">{children}</div>;
}

export function Note({ tone = 'amber', title, children }: any) {
  const tones: Record<string, string> = {
    amber: 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400',
    rose: 'border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-400',
    slate: 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400',
    indigo: 'border-indigo-300 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-800 dark:text-indigo-400',
  };
  return (
    <div className={`p-4 rounded-xl border ${tones[tone]}`}>
      {title && <p className="text-sm font-bold mb-1">{title}</p>}
      <div className="text-xs leading-relaxed">{children}</div>
    </div>
  );
}

/** Band 1 is bad news, Band 5 is full pay. Coloured so the month reads at a glance. */
export function BandPill({ band }: { band: number }) {
  const tones = [
    '',
    'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-400',
    'bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-400',
    'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400',
    'bg-lime-100 dark:bg-lime-950 text-lime-700 dark:text-lime-400',
    'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400',
  ];
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded ${tones[band] || tones[1]}`}>
      Band {band}
    </span>
  );
}

/**
 * A naira figure shown to a shareholder MUST carry what it is based on and
 * when it was set. Section 8: there is no share price, and an unlabelled
 * number reads as a valuation the company has never had.
 */
// The basis is stored as a slug and was being printed raw -- "Based on:
// founder_estimate". These are the words a person would use.
const BASIS_LABELS: Record<string, string> = {
  par_value: 'Par value — what was paid in, not a market price',
  founder_estimate: "The founder's own estimate",
  last_round: 'The price set at the last funding round',
  independent_valuation: 'An independent valuation',
  book_value: 'Book value',
};

export function BasisFigure({ label, amount, basis, asOf, movesWhen, negativeOk }: any) {
  const negative = amount < 0;
  return (
    <Card className="p-4">
      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-mono font-bold mt-1.5 ${
        negative && negativeOk ? 'text-rose-600 dark:text-rose-400'
                               : 'text-slate-800 dark:text-slate-100'}`}>
        {fmtKobo(amount)}
      </p>
      <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-0.5">
        <p className="text-[11px] text-slate-500">
          <span className="font-bold">Based on:</span> {BASIS_LABELS[basis] || basis}
        </p>
        {asOf && (
          <p className="text-[11px] text-slate-500">
            <span className="font-bold">As at:</span> {new Date(asOf).toLocaleDateString('en-NG')}
          </p>
        )}
        {movesWhen && <p className="text-[11px] text-slate-400 italic">{movesWhen}</p>}
      </div>
    </Card>
  );
}

/**
 * A dropdown that also lets you type something that is not on the list.
 *
 * WHY THIS EXISTS RATHER THAN A PLAIN <input>. A typed name is a string. A
 * chosen one is an id, and an id can be joined to a payroll line, a contract
 * or a share register. The salary bug came from exactly that difference: a
 * salary logged as free text could not be matched to the person it paid, so
 * the payroll register never cleared and the founder appeared to owe staff he
 * had already paid.
 *
 * The escape hatch is deliberate and not a compromise. Paying a contractor
 * who is not on the cap table is a real thing, and a form that refuses it
 * teaches people to put the real answer in the wrong box.
 */
export function Picker({
  value, onChange, options, placeholder = 'Choose…',
  allowOther = true, otherLabel = 'Someone not on this list',
  otherPlaceholder = 'Type the name', hint,
}: any) {
  const isOther = value?.mode === 'other';

  return (
    <div className="space-y-2">
      <select
        className={inputCls}
        value={isOther ? '__other__' : (value?.id || '')}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__other__') onChange({ mode: 'other', text: '' });
          else if (!v) onChange(null);
          else {
            const picked = options.find((o: any) => String(o.id) === v);
            onChange({ mode: 'picked', id: picked.id, label: picked.label,
                       meta: picked });
          }
        }}>
        <option value="">{placeholder}</option>
        {options.map((o: any) => (
          <option key={o.id} value={o.id}>
            {o.label}{o.sub ? ` — ${o.sub}` : ''}
          </option>
        ))}
        {allowOther && <option value="__other__">{otherLabel}</option>}
      </select>

      {isOther && (
        <input
          autoFocus
          className={inputCls}
          placeholder={otherPlaceholder}
          value={value.text || ''}
          onChange={(e) => onChange({ mode: 'other', text: e.target.value })} />
      )}

      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export function Th({ children, right }: any) {
  return (
    <th className={`px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider ${
      right ? 'text-right' : 'text-left'}`}>{children}</th>
  );
}

export function Td({ children, right, mono, bold, className = '' }: any) {
  return (
    <td className={`px-4 py-3 text-sm ${right ? 'text-right' : ''} ${
      mono ? 'font-mono' : ''} ${bold ? 'font-bold' : ''} ${className}`}>{children}</td>
  );
}
