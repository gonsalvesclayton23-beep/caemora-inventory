'use client';
import { useActionState } from 'react';
import type { Result } from '@/lib/data';
import { applyTodaysRate, deleteMarginProduct, dismissMatch, mergeMatch, saveMarginSettings } from './actions';

const Msg = ({ s }: { s: Result | null }) =>
  s?.error ? <span className="text-sm text-red-600">{s.error}</span> : s?.ok ? <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span> : null;
const ghost = 'btn-ghost border border-slate-300 dark:border-slate-700';

export function TodaysRateForm({ id }: { id: number }) {
  const [s, action, pending] = useActionState(applyTodaysRate, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button className={ghost} disabled={pending}>Use today&apos;s rate</button><Msg s={s} />
    </form>
  );
}

export function DeleteForm({ id }: { id: number }) {
  const [s, action, pending] = useActionState(deleteMarginProduct, null);
  return (
    <form action={action} onSubmit={(e) => { if (!confirm('Delete this margin line and all its platforms? Purchases and products are not affected.')) e.preventDefault(); }} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost border border-red-300 text-red-600 dark:border-red-900" disabled={pending}>Delete line</button><Msg s={s} />
    </form>
  );
}

export function MarginSettingsForm({ rows, canEdit }: { rows: { key: string; value: number; description: string | null }[]; canEdit: boolean }) {
  const [s, action, pending] = useActionState(saveMarginSettings, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((x) => (
          <label key={x.key}><span className="label">{(x.description ?? x.key).replace(/^Margins: (Shopify|OnBuy|Etsy) /, '').replace(/^Margins: /, '')}</span>
            <input name={x.key} defaultValue={x.value} inputMode="decimal" className="input" disabled={!canEdit} /></label>
        ))}
      </div>
      {canEdit && <div className="flex items-center gap-3"><button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button><Msg s={s} /></div>}
    </form>
  );
}

/** MRG-09 AC6: confirm one likely match; the admin picks whose costs and rate to keep. */
export function MatchForm({ a, b, defaultKeep, children }: { a: number; b: number; defaultKeep: number; children: React.ReactNode }) {
  const [s, merge, merging] = useActionState(mergeMatch, null);
  const [d, dismiss, dismissing] = useActionState(dismissMatch, null);
  if (s?.ok || d?.ok) return <Msg s={s?.ok ? s : d} />;
  return (
    <div className="space-y-3">
      <form action={merge} className="space-y-3">
        <input type="hidden" name="a" value={a} /><input type="hidden" name="b" value={b} />
        {children}
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn" disabled={merging}>Confirm: make one line</button>
          <Msg s={s} />
        </div>
      </form>
      <form action={dismiss} className="flex items-center gap-2">
        <input type="hidden" name="a" value={a} /><input type="hidden" name="b" value={b} />
        <button className={ghost} disabled={dismissing}>Not a match</button><Msg s={d} />
      </form>
    </div>
  );
}
