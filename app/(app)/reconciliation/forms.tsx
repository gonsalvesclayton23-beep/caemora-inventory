'use client';
import { useActionState, useRef, useEffect } from 'react';
import { monthLabel } from '@/lib/format';
import { addCreditNote, addPayment, reopenMonth } from './actions';

type C = { code: string; name: string }[];

function useResetOnSuccess(state: any) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state?.ok) ref.current?.reset(); }, [state]);
  return ref;
}

export function PaymentForm({ month, vendorId, currency, companies }: { month: string; vendorId: number; currency: string; companies: C }) {
  const [state, action, pending] = useActionState(addPayment, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="card space-y-3">
      <h2 className="font-medium">Add payment</h2>
      <input type="hidden" name="period_month" value={month} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">For company</span><select name="company_code" className="input">{companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
        <label><span className="label">Paid from account</span>
          <select name="paid_from_company" className="input">
            <option value="">Same company</option>
            {companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            <option value="__other">Personal / other…</option>
          </select>
        </label>
        <label><span className="label">Amount</span><input name="amount" inputMode="decimal" className="input" required /></label>
        <label><span className="label">Currency</span><select name="currency" defaultValue={currency} className="input"><option>INR</option><option>GBP</option></select></label>
        <label><span className="label">£ that left the account</span><input name="amount_gbp" inputMode="decimal" className="input" /></label>
        <label><span className="label">Date paid</span><input type="date" name="paid_on" className="input" required /></label>
        <label><span className="label">Kind</span><select name="kind" className="input"><option value="opening">Opening</option><option value="other">Mid-month</option><option value="closing">Closing</option></select></label>
        <label><span className="label">Method</span><input name="method" defaultValue="Wise" className="input" /></label>
        <label className="col-span-2"><span className="label">Reference (Wise transfer no.)</span><input name="reference" className="input" /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>Add payment</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-600">Added.</span>}
      </div>
    </form>
  );
}

export function CreditNoteForm({ month, vendorId, currency, companies, periods }: { month: string; vendorId: number; currency: string; companies: C; periods: { month: string }[] }) {
  const [state, action, pending] = useActionState(addCreditNote, null);
  const ref = useResetOnSuccess(state);
  return (
    <form ref={ref} action={action} className="card space-y-3">
      <h2 className="font-medium">Add credit note</h2>
      <input type="hidden" name="period_month" value={month} />
      <input type="hidden" name="vendor_id" value={vendorId} />
      <input type="hidden" name="currency" value={currency} />
      <div className="grid grid-cols-2 gap-3">
        <label><span className="label">Company</span>
          <select name="company_code" className="input"><option value="">All companies</option>{companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select>
        </label>
        <label><span className="label">Amount</span><input name="amount" inputMode="decimal" className="input" required /></label>
        <label><span className="label">For month</span>
          <select name="relates_to_month" className="input"><option value="">—</option>{periods.map((p) => <option key={p.month} value={p.month}>{monthLabel(p.month)}</option>)}</select>
        </label>
        <label className="col-span-2"><span className="label">Reason</span><input name="reason" className="input" required placeholder="e.g. Excess billing on ARC, row 107" /></label>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>Add credit note</button>
        {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
        {state?.ok && <span className="text-sm text-emerald-600">Added.</span>}
      </div>
    </form>
  );
}

export function ReopenForm({ month }: { month: string }) {
  const [state, action, pending] = useActionState(reopenMonth, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <input name="reason" required placeholder="Reason to reopen" className="input w-56" />
      <button className="btn-ghost border border-slate-300 dark:border-slate-700" disabled={pending}>Reopen {monthLabel(month)}</button>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}
