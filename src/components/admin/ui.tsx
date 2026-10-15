import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="font-serif text-3xl font-black">{title}</h1>{subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div role={err ? 'alert' : 'status'} className={`mb-6 whitespace-pre-line rounded-md border px-4 py-3 text-sm ${err ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'}`}>{err ?? ok}</div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  const color = tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : 'text-ink';
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-1 font-serif text-3xl font-black ${color}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const BADGE = {
  green: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300', amber: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', red: 'bg-red-500/15 text-red-700 dark:text-red-300',
  blue: 'bg-sky-500/15 text-sky-700 dark:text-sky-300', gray: 'bg-wash text-muted',
};
export type Tone = keyof typeof BADGE;
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${BADGE[tone]}`}>{children}</span>;
}

export const statusTone = (s: string): Tone =>
  ({ PUBLISHED: 'green', PENDING_REVIEW: 'amber', DRAFT: 'blue', REJECTED: 'red', UNPUBLISHED: 'gray', GENERATED: 'green', DUPLICATE: 'blue', SKIPPED: 'gray', FAILED: 'red', DETECTED: 'amber', EXTRACTED: 'amber', ERROR: 'red', WARN: 'amber' } as Record<string, Tone>)[s] ?? 'gray';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Check({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]" />
      <span><span className="font-semibold">{label}</span>{hint && <span className="block text-xs text-muted">{hint}</span>}</span>
    </label>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: ReactNode; empty?: string }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line bg-wash/60 text-xs uppercase tracking-wide text-muted"><tr>{head.map((h) => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>}
    </div>
  );
}
