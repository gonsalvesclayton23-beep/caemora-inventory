'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { LOSS_TYPES, LOSS_PLATFORMS } from '@/lib/losses';

/** LOS-02: the landed cost per unit (£) of a product's latest purchase, offered when the product is picked. */
export async function landedCostFor(productId: number): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('landed_cost_gbp', { p_product: productId });
  return data == null ? null : Number(data);
}

interface Row { id?: number; product_id: number | null; qty: string; unit_cost_gbp: string; refund_gbp: string; recovered_gbp: string; reference: string; notes: string }
interface Payload { occurred_on: string; type: string; company_code: string; platform: string; shipment_id: number | null; rows: Row[] }

const n = (v: string) => (String(v ?? '').trim() === '' ? 0 : Number(v));

function check(p: Payload): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.occurred_on)) return 'Enter the date of the loss.';
  if (!(p.type in LOSS_TYPES)) return 'Choose the type of loss.';
  if (!p.company_code) return 'Choose the company.';
  if (p.platform && !LOSS_PLATFORMS.some(([k]) => k === p.platform)) return 'Choose a platform from the list.';
  if (!p.rows.length) return 'Add at least one product.';
  for (const [i, r] of p.rows.entries()) {
    const at = p.rows.length > 1 ? ` (line ${i + 1})` : '';
    if (!r.product_id) return `Choose the product${at}.`;
    if (!(Number.isInteger(Number(r.qty)) && Number(r.qty) > 0)) return `Enter how many units were lost${at}.`;
    if (String(r.unit_cost_gbp).trim() === '' || !(n(r.unit_cost_gbp) >= 0)) return `Enter the cost per unit in £${at}.`;
    for (const [k, label] of [['refund_gbp', 'Refund'], ['recovered_gbp', 'Recovered']] as const) {
      if (!(n(r[k]) >= 0)) return `${label} must be a £ amount of 0 or more${at}.`;
    }
  }
  return null;
}

const rowFields = (p: Payload, r: Row) => ({
  occurred_on: p.occurred_on, type: p.type, company_code: p.company_code, platform: p.platform || null, shipment_id: p.shipment_id,
  product_id: r.product_id, qty: Number(r.qty), unit_cost_gbp: n(r.unit_cost_gbp), refund_gbp: n(r.refund_gbp), recovered_gbp: n(r.recovered_gbp),
  reference: r.reference.trim() || null, notes: r.notes.trim() || null,
});

/** LOS-01 / LOS-04: record one loss, or one per product of a lost box. */
export async function saveLosses(_: unknown, f: FormData): Promise<Result> {
  let p: Payload;
  try { p = JSON.parse(String(f.get('payload'))); } catch { return { error: 'Could not read the form.' }; }
  const err = check(p);
  if (err) return { error: err };
  const supabase = await createClient();
  const edit = p.rows.length === 1 && p.rows[0].id;
  if (edit) {
    const { data, error } = await supabase.from('losses').update(rowFields(p, p.rows[0])).eq('id', p.rows[0].id!).select('id');
    if (error) return { error: friendlyError(error) };
    if (!data?.length) return { error: 'You do not have permission to do that.' };
  } else {
    const { error } = await supabase.from('losses').insert(p.rows.map((r) => rowFields(p, r)));
    if (error) return { error: friendlyError(error) };
  }
  revalidatePath('/losses');
  if (p.shipment_id) revalidatePath(`/shipments/${p.shipment_id}`);
  redirect(`/losses?month=${p.occurred_on.slice(0, 7)}-01&saved=${p.rows.length}`);
}

export async function deleteLoss(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('losses').delete().eq('id', Number(f.get('id'))).select('id');
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: 'Only an admin can delete a loss.' };
  revalidatePath('/losses');
  redirect('/losses');
}
