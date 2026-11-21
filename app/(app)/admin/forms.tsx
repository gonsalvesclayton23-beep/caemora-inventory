'use client';
import { useActionState } from 'react';
import { acknowledgeBefore, saveSettings, setFxRate, updateRateCard, updateUser } from './actions';
import { RULE_LABELS, monthLabel } from '@/lib/format';
import type { Result } from '@/lib/data';

const Msg = ({ s }: { s: Result | null }) =>
  s?.error ? <span className="text-sm text-red-600">{s.error}</span> : s?.ok ? <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span> : null;

export function UserRow({ u }: { u: { id: string; full_name: string; email: string | null; role: string; active: boolean } }) {
  const [s, action, pending] = useActionState(updateUser, null);
  return (
    <form action={action} className="grid grid-cols-1 items-end gap-2 border-b border-slate-100 py-3 sm:grid-cols-[1fr_1fr_10rem_6rem_auto] dark:border-slate-800">
      <input type="hidden" name="id" value={u.id} />
      <label><span className="label text-xs">Name</span><input name="full_name" defaultValue={u.full_name} className="input" /></label>
      <div className="text-sm text-slate-500 sm:pb-2">{u.email}</div>
      <label><span className="label text-xs">Role</span>
        <select name="role" defaultValue={u.role} className="input"><option value="admin">Admin</option><option value="data_entry">Data entry</option><option value="viewer">Viewer</option></select>
      </label>
      <label className="flex items-center gap-2 sm:pb-2"><input type="checkbox" name="active" defaultChecked={u.active} /> Active</label>
      <div className="flex items-center gap-2"><button className="btn" disabled={pending}>Save</button><Msg s={s} /></div>
    </form>
  );
}

export function SettingsForm({ settings }: { settings: { key: string; value: number; description: string | null }[] }) {
  const [s, action, pending] = useActionState(saveSettings, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {settings.map((x) => (
          <label key={x.key}><span className="label">{x.description ?? x.key}</span><input name={`s:${x.key}`} defaultValue={x.value} inputMode="decimal" className="input" /></label>
        ))}
      </div>
      <div className="flex items-center gap-3"><button className="btn" disabled={pending}>{pending ? 'Saving and re-checking flags…' : 'Save'}</button><Msg s={s} /></div>
    </form>
  );
}

export function FxRow({ month, rate, source }: { month: string; rate: number; source: string | null }) {
  const [s, action, pending] = useActionState(setFxRate, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 py-1">
      <input type="hidden" name="month" value={month} />
      <span className="w-24 text-sm">{monthLabel(month)}</span>
      <input name="rate" defaultValue={source === 'manual' ? rate : ''} placeholder={String(Number(rate).toFixed(2))} inputMode="decimal" className="input w-28" />
      <span className="w-20 text-xs text-slate-500">{source ?? 'carried over'}</span>
      <button className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={pending}>Set</button>
      <Msg s={s} />
    </form>
  );
}

export function AcknowledgeForm({ periods }: { periods: { month: string }[] }) {
  const [s, action, pending] = useActionState(acknowledgeBefore, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label><span className="label">Flags from before</span>
        <select name="month" className="input w-40">{periods.map((p) => <option key={p.month} value={p.month}>{monthLabel(p.month)}</option>)}</select>
      </label>
      <label><span className="label">Type</span>
        <select name="rule" className="input w-56"><option value="">All types</option>{Object.entries(RULE_LABELS).filter(([k]) => k !== 'settled_month_edit').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <button className="btn" disabled={pending}>Mark as seen</button>
      <Msg s={s} />
    </form>
  );
}

export function RateCardForm({ p }: { p: { id: number; agreed_courier_per_unit: number | null; agreed_courier_currency: string; agreed_courier_from: string | null } }) {
  const [s, action, pending] = useActionState(updateRateCard, null);
  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-1">
      <input type="hidden" name="id" value={p.id} />
      <input name="rate" defaultValue={p.agreed_courier_per_unit ?? ''} inputMode="decimal" className="input w-20 py-1 text-right" aria-label="Agreed courier per unit" />
      <select name="currency" defaultValue={p.agreed_courier_currency} className="input w-20 py-1"><option>INR</option><option>GBP</option></select>
      <input name="from" type="month" defaultValue={p.agreed_courier_from?.slice(0, 7) ?? ''} className="input w-36 py-1" aria-label="Applies from month" />
      <button className="btn-ghost py-1" disabled={pending}>Save</button>
      <Msg s={s} />
    </form>
  );
}
