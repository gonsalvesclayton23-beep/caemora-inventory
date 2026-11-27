'use client';
import { useActionState } from 'react';
import type { Result } from '@/lib/data';
import { OUTCOMES } from '@/lib/cases';
import { reassignCase, resolveCase, resolveShortage, saveCaseRules, setCaseReference, startCase } from './actions';

const Msg = ({ s }: { s: Result | null }) =>
  s?.error ? <span className="text-sm text-red-600">{s.error}</span> : s?.ok ? <span className="text-sm text-emerald-600">{s.status ?? 'Saved.'}</span> : null;
const ghost = 'btn-ghost border border-slate-300 dark:border-slate-700';
type Person = { id: string; name: string; role: string };

export function StatusForm({ id, status }: { id: number; status: string }) {
  const [s, action, pending] = useActionState(startCase, null);
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      {status === 'open' && <button name="status" value="in_progress" className={ghost} disabled={pending}>Start: mark In progress</button>}
      {status === 'in_progress' && <button name="status" value="open" className={ghost} disabled={pending}>Back to Open</button>}
      {status === 'resolved' && <button name="status" value="open" className={ghost} disabled={pending}>Reopen</button>}
      <Msg s={s} />
    </form>
  );
}

export function ResolveForm({ id }: { id: number }) {
  const [s, action, pending] = useActionState(resolveCase, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <label className="block"><span className="label">What was done</span><textarea name="note" rows={2} className="input" required /></label>
      <div className="flex items-center gap-2"><button className="btn" disabled={pending}>Resolve</button><Msg s={s} /></div>
    </form>
  );
}

export function ReassignForm({ id, people, current }: { id: number; people: Person[]; current: string | null }) {
  const [s, action, pending] = useActionState(reassignCase, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
        <select name="to" defaultValue={current ?? ''} className="input" aria-label="Assign to">
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.role === 'admin' ? ' (admin)' : ''}</option>)}
        </select>
        <input name="note" placeholder="Note, e.g. Raj has the invoice" className="input" />
      </div>
      <div className="flex items-center gap-2"><button className={ghost} disabled={pending}>Reassign</button><Msg s={s} /></div>
    </form>
  );
}

export function ReferenceForm({ id, current, amazon }: { id: number; current: string | null; amazon: boolean }) {
  const [s, action, pending] = useActionState(setCaseReference, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <label><span className="label">{amazon ? 'Amazon case ID' : 'Reference'}</span><input name="ref" defaultValue={current ?? ''} className="input w-56" /></label>
      <button className={ghost} disabled={pending}>Save</button><Msg s={s} />
    </form>
  );
}

export function OutcomeForm({ id, amazon }: { id: number; amazon: boolean }) {
  const [s, action, pending] = useActionState(resolveShortage, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-2 sm:grid-cols-3">
        <label><span className="label">What happened</span>
          <select name="outcome" defaultValue={amazon ? 'amazon_reimbursed' : 'supplier_credit_note'} className="input">
            {Object.entries(OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label><span className="label">£ amount (Amazon reimbursed)</span><input name="gbp" inputMode="decimal" className="input" /></label>
        <label><span className="label">Note</span><input name="note" placeholder="e.g. credit note CN-9" className="input" /></label>
      </div>
      <div className="flex items-center gap-2"><button className="btn" disabled={pending}>Record outcome and close</button><Msg s={s} /></div>
    </form>
  );
}

export function CaseRulesForm({ rules, people, dueDays }: {
  rules: { rule: string; label: string; creates_case: boolean; assign_to: string; assignee: string | null; staff_ok: boolean }[];
  people: Person[]; dueDays: number;
}) {
  const [s, action, pending] = useActionState(saveCaseRules, null);
  return (
    <form action={action} className="space-y-3">
      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Flag type</th><th>Creates a case</th><th>Goes to</th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.rule}>
                <td><input type="hidden" name="rule" value={r.rule} />{r.label}{!r.staff_ok && <div className="text-xs text-slate-500">payments/money: admins only</div>}</td>
                <td><input type="checkbox" name={`on_${r.rule}`} defaultChecked={r.creates_case} aria-label={`${r.label} creates a case`} /></td>
                <td>
                  <select name={`assign_${r.rule}`} defaultValue={r.assign_to === 'entered_by' ? 'entered_by' : r.assignee ?? 'admin'} className="input w-64">
                    {r.staff_ok && <option value="entered_by">The person who entered it</option>}
                    <option value="admin">The admin</option>
                    {people.filter((p) => r.staff_ok || p.role === 'admin').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm">Due after <input name="due_days" defaultValue={dueDays} inputMode="numeric" className="input w-20" /> working days (Mon–Fri)</label>
      <div className="flex items-center gap-2"><button className="btn" disabled={pending}>Save</button><Msg s={s} /></div>
    </form>
  );
}
