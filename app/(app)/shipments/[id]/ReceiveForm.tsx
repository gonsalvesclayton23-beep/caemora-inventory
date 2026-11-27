'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { boxReceiptSummary, DESTINATIONS, shortageStatus } from '@/lib/cases';
import { saveShipment } from '../actions';

export interface ContentRow {
  id: number; purchase_line_id: number; product_name: string; invoice_no: string | null; company_code: string;
  qty: number; line_qty: number; defective_qty: number; short_qty: number; received_qty: number; remarks: string | null;
  counted_by_name: string | null; counted_at: string | null; amazon_case_id: string | null; outcome: string | null; outcome_gbp: number | null;
  case_id: number | null; case_status: string | null; case_owner: string | null;
}

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

/**
 * SHP-02/SHP-08 receipts, per box (PUR-06). "Received" is what arrived (defective included); short = sent − received.
 * Counts can be entered and corrected at any time, settled months included. While the box is In transit its contents can change.
 */
export default function ReceiveForm({ shipment: s, contents, canEdit, admin }: { shipment: any; contents: ContentRow[]; canEdit: boolean; admin: boolean }) {
  const [state, action, pending] = useActionState(saveShipment, null);
  const inTransit = s.status === 'in_transit';
  const total = contents.reduce((t, c) => t + c.qty, 0);
  const amazon = s.destination === 'amazon';
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={s.id} />
      <fieldset disabled={!canEdit} className="card grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label><span className="label">Destination</span>
          {admin
            ? <select name="destination" defaultValue={s.destination} className="input">
                {Object.entries(DESTINATIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            : <div className="py-2">{DESTINATIONS[s.destination as keyof typeof DESTINATIONS] ?? s.destination}</div>}
        </label>
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
        <label className="sm:col-span-2 lg:col-span-3"><span className="label">Notes</span><input name="notes" defaultValue={s.notes ?? ''} className="input" /></label>
      </fieldset>

      <fieldset disabled={!canEdit} className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Contents</h2>
          <span className={`text-sm font-medium tabular-nums ${contents.some((c) => c.short_qty) ? 'text-amber-700 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
            {contents.length ? boxReceiptSummary(contents) : 'Empty'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          {amazon ? 'Enter Amazon’s count for each product. ' : 'Whoever opens the box counts each product. '}
          “Received” is every unit that arrived, damaged ones included; enter damaged units under Defective. Counts can be corrected at any time.
          {inTransit ? ' While the box is in transit you can change the units sent or take a product out.' : ''}
        </p>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr>
              <th>Product</th><th>Invoice</th><th>Co.</th><th className="num">Sent</th><th className="num">Received</th><th className="num">Defective</th>
              <th className="num">Short</th><th>Follow-up</th><th>Remarks</th>{inTransit && <th>Remove</th>}
            </tr></thead>
            <tbody>
              {contents.map((c) => {
                const follow = shortageStatus(c);
                return (
                  <tr key={c.id}>
                    <td>
                      <input type="hidden" name="item_id" value={c.id} />
                      <input type="hidden" name={`line_${c.id}`} value={c.purchase_line_id} />
                      <input type="hidden" name={`sent_${c.id}`} value={c.qty} />
                      <input type="hidden" name={`name_${c.id}`} value={c.product_name} />
                      <Link href={`/purchases/${c.purchase_line_id}`} className="hover:underline">{c.product_name}</Link>
                      {c.qty < c.line_qty && <div className="text-xs text-slate-500">{c.qty} of the line's {c.line_qty}</div>}
                      {c.counted_at && <div className="text-xs text-slate-500">Counted by {c.counted_by_name ?? '—'}, {when(c.counted_at)}</div>}
                    </td>
                    <td>{c.invoice_no ?? '—'}</td>
                    <td>{c.company_code}</td>
                    <td className="num">
                      {inTransit
                        ? <input name={`qty_${c.id}`} defaultValue={c.qty} inputMode="numeric" className="input w-20 text-right" aria-label="Units sent" />
                        : c.qty}
                    </td>
                    <td className="num"><input name={`received_${c.id}`} defaultValue={c.qty - c.short_qty} inputMode="numeric" className="input w-20 text-right" aria-label="Received" /></td>
                    <td className="num"><input name={`defective_${c.id}`} defaultValue={c.defective_qty} inputMode="numeric" className="input w-16 text-right" aria-label="Defective" /></td>
                    <td className={`num ${c.short_qty ? 'font-medium text-amber-700 dark:text-amber-400' : ''}`}>{c.short_qty}</td>
                    <td className="text-xs">
                      {follow && <div className={c.outcome ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}>{follow}</div>}
                      {c.case_id && <Link href={`/cases/${c.case_id}`} className="underline">Case{c.case_status === 'resolved' ? ' (resolved)' : c.case_owner ? `: ${c.case_owner}` : ''}</Link>}
                    </td>
                    <td><input name={`remarks_${c.id}`} defaultValue={c.remarks ?? ''} className="input" aria-label="Remarks" /></td>
                    {inTransit && <td className="text-center"><input type="checkbox" name={`remove_${c.id}`} aria-label="Take out of the box" /></td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-medium"><td colSpan={3}>Total</td><td className="num">{total.toLocaleString('en-GB')}</td>
              <td className="num">{(total - contents.reduce((t, c) => t + c.short_qty, 0)).toLocaleString('en-GB')}</td>
              <td className="num">{contents.reduce((t, c) => t + c.defective_qty, 0)}</td><td className="num">{contents.reduce((t, c) => t + c.short_qty, 0)}</td>
              <td colSpan={inTransit ? 3 : 2}></td></tr></tfoot>
          </table>
        </div>
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
