'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { saveShipment } from '../actions';

export default function ReceiveForm({ shipment: s, lines, canEdit }: { shipment: any; lines: any[]; canEdit: boolean }) {
  const [state, action, pending] = useActionState(saveShipment, null);
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
        <label><span className="label">Received by</span><input name="received_by" defaultValue={s.received_by ?? ''} className="input" placeholder="Amazon, Northampton, name…" /></label>
        <label><span className="label">Tracking no.</span><input name="tracking_no" defaultValue={s.tracking_no ?? ''} className="input" /></label>
        <label><span className="label">Courier</span><input name="courier" defaultValue={s.courier ?? ''} className="input" /></label>
        <label><span className="label">Notes</span><input name="notes" defaultValue={s.notes ?? ''} className="input" /></label>
      </fieldset>

      <fieldset disabled={!canEdit} className="card space-y-3">
        <h2 className="font-medium">Contents</h2>
        <p className="text-xs text-slate-500">Enter anything that arrived damaged or missing. Saving as “Received” with any shortfall marks the shipment as received short.</p>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {lines.map((l) => (
            <li key={l.id} className="py-3">
              <input type="hidden" name="line_id" value={l.id} />
              <div className="flex justify-between gap-2 text-sm">
                <Link href={`/purchases/${l.id}`} className="font-medium hover:underline">{l.product_name}</Link>
                <span className="shrink-0 tabular-nums text-slate-500">{l.qty} sent</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <label><span className="label text-xs">Defective</span><input name={`defective_${l.id}`} defaultValue={l.defective_qty} inputMode="numeric" className="input" /></label>
                <label><span className="label text-xs">Short</span><input name={`short_${l.id}`} defaultValue={l.short_qty} inputMode="numeric" className="input" /></label>
                <label><span className="label text-xs">Remarks</span><input name={`remarks_${l.id}`} defaultValue={l.remarks ?? ''} className="input" /></label>
              </div>
            </li>
          ))}
        </ul>
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
