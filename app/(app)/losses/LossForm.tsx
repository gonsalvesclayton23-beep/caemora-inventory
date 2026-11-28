'use client';
import { useActionState, useState } from 'react';
import type { Result } from '@/lib/data';
import { LOSS_PLATFORMS, LOSS_TYPES, lossValue } from '@/lib/losses';
import { gbp } from '@/lib/margin';
import { deleteLoss, landedCostFor, saveLosses } from './actions';

export interface LossRowValues { id?: number; product_id: number | null; product_name: string; qty: string; unit_cost_gbp: string; refund_gbp: string; recovered_gbp: string; reference: string; notes: string; already?: number }
export interface LossValues { occurred_on: string; type: string; company_code: string; platform: string; shipment_id: number | null; shipment_label?: string | null; rows: LossRowValues[] }

/** LOS-01/LOS-02/LOS-04: one loss, or one per product of a lost box. Net loss = goods at landed cost + refund − recovered. */
export function LossForm({ initial, products, companies, canEdit, canDelete, lossId }: {
  initial: LossValues; products: { id: number; name: string }[]; companies: { code: string; name: string }[];
  canEdit: boolean; canDelete?: boolean; lossId?: number;
}) {
  const [v, setV] = useState(initial);
  const [s, action, pending] = useActionState<Result | null, FormData>(saveLosses, null);
  const [d, del, deleting] = useActionState<Result | null, FormData>(deleteLoss, null);
  const setRow = (i: number, patch: Partial<LossRowValues>) => setV((x) => ({ ...x, rows: x.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const pickProduct = async (i: number, name: string) => {
    const hit = products.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    setRow(i, { product_name: name, product_id: hit?.id ?? null });
    if (hit) {
      const cost = await landedCostFor(hit.id);
      if (cost != null) setRow(i, { unit_cost_gbp: cost.toFixed(2) });
    }
  };
  const total = v.rows.reduce((t, r) => t + lossValue({ qty: Number(r.qty) || 0, unitCostGbp: Number(r.unit_cost_gbp) || 0, refundGbp: Number(r.refund_gbp) || 0, recoveredGbp: Number(r.recovered_gbp) || 0 }).net, 0);
  const field = 'input';

  return (
    <div className="space-y-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="payload" value={JSON.stringify(v)} />
        <fieldset disabled={!canEdit} className="card grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label><span className="label">Date</span><input type="date" value={v.occurred_on} onChange={(e) => setV({ ...v, occurred_on: e.target.value })} className={field} required /></label>
          <label><span className="label">Type of loss</span>
            <select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })} className={field}>
              {Object.entries(LOSS_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label><span className="label">Company</span>
            <select value={v.company_code} onChange={(e) => setV({ ...v, company_code: e.target.value })} className={field}>
              {companies.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </label>
          <label><span className="label">Platform</span>
            <select value={v.platform} onChange={(e) => setV({ ...v, platform: e.target.value })} className={field}>
              <option value="">— none —</option>
              {LOSS_PLATFORMS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          {v.shipment_label && <p className="text-sm text-slate-500 sm:col-span-2 lg:col-span-4">From lost shipment <span className="font-medium">{v.shipment_label}</span>: one loss per product.</p>}
        </fieldset>

        <datalist id="loss-products">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
        <fieldset disabled={!canEdit} className="card overflow-x-auto">
          <table className="table">
            <thead><tr><th>Product</th><th className="num">Units</th><th className="num">Cost / unit £</th><th className="num">Goods £</th>
              <th className="num">Refund to buyer £</th><th className="num">Recovered £</th><th className="num">Net loss £</th><th>Reference</th><th>Notes</th>{v.rows.length > 1 && <th></th>}</tr></thead>
            <tbody>
              {v.rows.map((r, i) => {
                const val = lossValue({ qty: Number(r.qty) || 0, unitCostGbp: Number(r.unit_cost_gbp) || 0, refundGbp: Number(r.refund_gbp) || 0, recoveredGbp: Number(r.recovered_gbp) || 0 });
                return (
                  <tr key={i}>
                    <td className="min-w-64">
                      {v.shipment_id ? <span className="font-medium">{r.product_name}</span>
                        : <input list="loss-products" value={r.product_name} onChange={(e) => pickProduct(i, e.target.value)} placeholder="Start typing a product…" className={field} />}
                      {!r.product_id && r.product_name && !v.shipment_id && <div className="text-xs text-amber-600">Pick a product from the list.</div>}
                      {!!r.already && <div className="text-xs text-amber-600">{r.already} already recorded as lost from this box</div>}
                    </td>
                    <td className="num"><input value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} inputMode="numeric" className={`${field} w-20 text-right`} /></td>
                    <td className="num"><input value={r.unit_cost_gbp} onChange={(e) => setRow(i, { unit_cost_gbp: e.target.value })} inputMode="decimal" className={`${field} w-24 text-right`} /></td>
                    <td className="num">{gbp(val.goods)}</td>
                    <td className="num"><input value={r.refund_gbp} onChange={(e) => setRow(i, { refund_gbp: e.target.value })} inputMode="decimal" placeholder="0" className={`${field} w-24 text-right`} /></td>
                    <td className="num"><input value={r.recovered_gbp} onChange={(e) => setRow(i, { recovered_gbp: e.target.value })} inputMode="decimal" placeholder="0" className={`${field} w-24 text-right`} /></td>
                    <td className="num font-semibold">{gbp(val.net)}</td>
                    <td><input value={r.reference} onChange={(e) => setRow(i, { reference: e.target.value })} placeholder="Order / case ID" className={`${field} w-36`} /></td>
                    <td><input value={r.notes} onChange={(e) => setRow(i, { notes: e.target.value })} className={`${field} w-40`} /></td>
                    {v.rows.length > 1 && <td><button type="button" className="text-xs text-slate-500 underline" onClick={() => setV((x) => ({ ...x, rows: x.rows.filter((_, j) => j !== i) }))}>Remove</button></td>}
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-semibold"><td colSpan={6}>Net loss</td><td className="num">{gbp(total)}</td><td colSpan={v.rows.length > 1 ? 3 : 2}></td></tr></tfoot>
          </table>
          <p className="mt-2 text-xs text-slate-500">Cost per unit is the landed cost (price + courier) of the product&apos;s latest purchase, in £; change it if needed. Net loss = goods + refund to the buyer − anything recovered (e.g. an Amazon reimbursement).</p>
        </fieldset>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn" disabled={pending}>{pending ? 'Saving…' : lossId ? 'Save' : v.rows.length > 1 ? `Record ${v.rows.length} losses` : 'Record loss'}</button>
            {s?.error && <span className="text-sm text-red-600">{s.error}</span>}
          </div>
        )}
      </form>
      {lossId && canDelete && (
        <form action={del} onSubmit={(e) => { if (!confirm('Delete this loss? It stays in the Audit log.')) e.preventDefault(); }} className="flex items-center gap-2">
          <input type="hidden" name="id" value={lossId} />
          <button className="btn-ghost border border-red-300 text-red-600 dark:border-red-900" disabled={deleting}>Delete loss</button>
          {d?.error && <span className="text-sm text-red-600">{d.error}</span>}
        </form>
      )}
    </div>
  );
}
