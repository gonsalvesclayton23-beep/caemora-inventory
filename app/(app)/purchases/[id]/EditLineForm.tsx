'use client';
import { useActionState, useState } from 'react';
import { deleteLine, updateLine } from '../actions';

const MONEY = ['qty', 'unit_price', 'courier_per_unit', 'currency', 'invoice_no', 'invoice_date', 'company_code', 'vendor_id'];

export default function EditLineForm({ line, companies, vendors, settled, admin, canEdit, splitAcross = 0 }: {
  line: any; companies: { code: string; name: string }[]; vendors: { id: number; name: string }[];
  settled: boolean; admin: boolean; canEdit: boolean; splitAcross?: number;
}) {
  const [state, action, pending] = useActionState(updateLine, null);
  const [delState, delAction, deleting] = useActionState(deleteLine, null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // settled month: data entry may only record receipt details; admins may change anything with a reason
  const moneyLocked = !canEdit || (settled && !admin);
  // PUR-06: a line split across boxes records its shortages on each box
  const ro = (f: string) => !canEdit || (MONEY.includes(f) && moneyLocked) || (splitAcross > 1 && ['defective_qty', 'short_qty'].includes(f));

  return (
    <div className="space-y-4">
      <form action={action} className="card space-y-4">
        <input type="hidden" name="id" value={line.id} />
        {settled && (
          <p className="rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
            {admin ? 'This month is settled. Your change will be logged and flagged, and needs a reason.'
                   : 'This month is settled: prices and quantities are locked. You can still record what was received.'}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field line={line} disabled={ro("qty")} name="qty" label="Qty" mode="numeric" />
          <Field line={line} disabled={ro("unit_price")} name="unit_price" label="Price / unit" mode="decimal" />
          <Field line={line} disabled={ro("courier_per_unit")} name="courier_per_unit" label="Courier / unit" mode="decimal" />
          <label className="block"><span className="label">Currency</span>
            <select className="input" name="currency" defaultValue={line.currency} disabled={ro('currency')}><option>INR</option><option>GBP</option></select>
          </label>
          <label className="block"><span className="label">Company</span>
            <select className="input" name="company_code" defaultValue={line.company_code} disabled={ro('company_code')}>
              {companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Vendor</span>
            <select className="input" name="vendor_id" defaultValue={line.vendor_id} disabled={ro('vendor_id')}>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <Field line={line} disabled={ro("invoice_no")} name="invoice_no" label="Invoice no." />
          <Field line={line} disabled={ro("invoice_date")} name="invoice_date" label="Invoice date" type="date" />
        </div>
        <h3 className="font-medium">Received</h3>
        {splitAcross > 1 && <p className="text-xs text-slate-500">This line is in {splitAcross} boxes: defective and short units are recorded on each box.</p>}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Field line={line} disabled={ro("defective_qty")} name="defective_qty" label="Defective" mode="numeric" />
          <Field line={line} disabled={ro("short_qty")} name="short_qty" label="Short" mode="numeric" />
          <Field line={line} disabled={ro("checked_by")} name="checked_by" label="Checked by" />
          <Field line={line} disabled={ro("reimbursed_gbp")} name="reimbursed_gbp" label="Amazon reimbursed £" mode="decimal" />
          <Field line={line} disabled={ro("amazon_case_id")} name="amazon_case_id" label="Amazon case ID" />
          <Field line={line} disabled={ro("reimbursement_id")} name="reimbursement_id" label="Reimbursement ID" />
        </div>
        <Field line={line} disabled={ro("remarks")} name="remarks" label="Remarks" />
        <Field line={line} disabled={ro("remarks_2")} name="remarks_2" label="Remarks 2" />
        {settled && admin && (
          <label className="block"><span className="label">Reason for changing a settled month *</span>
            <input className="input" name="reason" required placeholder="e.g. Vendor sent corrected invoice" />
          </label>
        )}
        {canEdit && (
          <div className="flex items-center gap-3">
            <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</button>
            {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
            {state?.ok && <span className="text-sm text-emerald-600">Saved.</span>}
          </div>
        )}
      </form>

      {canEdit && (!settled || admin) && (
        <form action={delAction} className="card space-y-2">
          <input type="hidden" name="id" value={line.id} />
          {!confirmDelete ? (
            <button type="button" className="btn-ghost text-red-600" onClick={() => setConfirmDelete(true)}>Delete this line…</button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input className="input max-w-sm" name="reason" placeholder={settled ? 'Reason (required)' : 'Reason (optional)'} required={settled} />
              <button className="btn bg-red-600 hover:bg-red-500" disabled={deleting}>Delete</button>
              <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Cancel</button>
            </div>
          )}
          {delState?.error && <p className="text-sm text-red-600">{delState.error}</p>}
        </form>
      )}
    </div>
  );
}

function Field({ name, label, type = 'text', mode, line, disabled }: {
  name: string; label: string; type?: string; mode?: 'numeric' | 'decimal'; line: any; disabled: boolean;
}) {
  return (
    <label className="block"><span className="label">{label}</span>
      <input className="input disabled:opacity-60" name={name} type={type} inputMode={mode} defaultValue={line[name] ?? ''} disabled={disabled} />
    </label>
  );
}
