'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { saveShipment } from '../actions';

export interface ContentRow {
  id: number; purchase_line_id: number; product_name: string; invoice_no: string | null; company_code: string;
  qty: number; line_qty: number; defective_qty: number; short_qty: number; received_qty: number; remarks: string | null;
}

/** SHP-02 receipts, per box (PUR-06). While the box is In transit its contents can be reduced or removed. */
export default function ReceiveForm({ shipment: s, contents, canEdit }: { shipment: any; contents: ContentRow[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveShipment, null);
  const inTransit = s.status === 'in_transit';
  const total = contents.reduce((t, c) => t + c.qty, 0);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={s.id} />
      <fieldset disabled={!canEdit} className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="label">Status</span>
          <select name="status" defaultValue={s.status === 'received_partial' ? 'received' : s.status} className="input">
            <option value="in_transit">In transit</option>
            <option value="received">Received</option>
            <option value="lost">Lost</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label><span className="label">Received date</span><input type="date" name="received_on" defaultValue={s.received_on ?? ''} className="input" /></label>
        <label><span className="label">Received by, e.g. Amazon</span><input name="received_by" defaultValue={s.received_by ?? ''} className="input" /></label>
        <label><span className="label">Tracking no.</span><input name="tracking_no" defaultValue={s.tracking_no ?? ''} className="input" /></label>
        <label><span className="label">Courier</span><input name="courier" defaultValue={s.courier ?? ''} className="input" /></label>
        <label><span className="label">Notes</span><input name="notes" defaultValue={s.notes ?? ''} className="input" /></label>
      </fieldset>

      <fieldset disabled={!canEdit} className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-medium">Contents</h2>
          <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{contents.length} products · {total.toLocaleString('en-GB')} units</span>
        </div>
        <p className="text-xs text-slate-500">
          Enter anything that arrived damaged or missing in this box. Saving as “Received” with any shortfall marks the box as received short.
          {inTransit ? ' While the box is in transit you can change its units or take a product out.' : ' The box is received, so its contents are fixed.'}
        </p>
        <table className="table">
          <thead><tr>
            <th>Product</th><th>Invoice</th><th>Co.</th><th className="num">Units in box</th>
            <th className="num">Defective</th><th className="num">Short</th><th className="num">Received</th><th>Remarks</th>{inTransit && <th>Remove</th>}
          </tr></thead>
          <tbody>
            {contents.map((c) => (
              <tr key={c.id}>
                <td>
                  <input type="hidden" name="item_id" value={c.id} />
                  <input type="hidden" name={`line_${c.id}`} value={c.purchase_line_id} />
                  <Link href={`/purchases/${c.purchase_line_id}`} className="hover:underline">{c.product_name}</Link>
                  {c.qty < c.line_qty && <div className="text-xs text-slate-500">{c.qty} of the line's {c.line_qty}</div>}
                </td>
                <td>{c.invoice_no ?? '—'}</td>
                <td>{c.company_code}</td>
                <td className="num">
                  {inTransit
                    ? <input name={`qty_${c.id}`} defaultValue={c.qty} inputMode="numeric" className="input w-20 text-right" aria-label="Units in box" />
                    : c.qty}
                </td>
                <td className="num"><input name={`defective_${c.id}`} defaultValue={c.defective_qty} inputMode="numeric" className="input w-16 text-right" aria-label="Defective" /></td>
                <td className="num"><input name={`short_${c.id}`} defaultValue={c.short_qty} inputMode="numeric" className="input w-16 text-right" aria-label="Short" /></td>
                <td className={`num ${c.received_qty < c.qty ? 'text-amber-700' : ''}`}>{c.received_qty}</td>
                <td><input name={`remarks_${c.id}`} defaultValue={c.remarks ?? ''} className="input" aria-label="Remarks" /></td>
                {inTransit && <td className="text-center"><input type="checkbox" name={`remove_${c.id}`} aria-label="Take out of the box" /></td>}
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="font-medium"><td colSpan={3}>Total</td><td className="num">{total.toLocaleString('en-GB')}</td><td colSpan={inTransit ? 5 : 4}></td></tr></tfoot>
        </table>
        {contents.length === 0 && <p className="text-sm text-slate-500">This box is empty.</p>}
      </fieldset>

      {canEdit && (
        <div className="flex items-center gap-3">
          <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
          {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
          {state?.ok && <span className="text-sm text-emerald-600">Saved{state.status === 'received_partial' ? ': marked as received short' : ''}.</span>}
        </div>
      )}
    </form>
  );
}
