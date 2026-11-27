'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { shortFromReceived } from '@/lib/cases';

const STATUSES = ['in_transit', 'received', 'received_partial', 'lost', 'cancelled'];

/** Saves the box's receipt details and, per product in it, the units sent, received and defective (PUR-06 per box; SHP-08). */
export async function saveShipment(_: unknown, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = Number(form.get('id'));
  const s = (k: string) => { const v = String(form.get(k) ?? '').trim(); return v === '' ? null : v; };
  const num = (k: string) => Number(form.get(k) || 0);

  const items = [];
  for (const itemId of form.getAll('item_id').map(Number)) {
    const qty = form.has(`qty_${itemId}`) ? num(`qty_${itemId}`) : null;
    const sent = qty ?? num(`sent_${itemId}`);
    const remove = form.get(`remove_${itemId}`) === 'on';
    // SHP-08: "received" is what arrived (defective included); short = sent − received
    const raw = String(form.get(`received_${itemId}`) ?? '').trim();
    const got = shortFromReceived(sent, raw === '' ? sent : Number(raw));
    if ('error' in got && !remove && qty !== 0) return { error: `${String(form.get(`name_${itemId}`) ?? 'A product')}: ${got.error}` };
    items.push({
      id: itemId, lineId: Number(form.get(`line_${itemId}`)), qty, remove,
      defective_qty: num(`defective_${itemId}`), short_qty: 'short' in got ? got.short : 0, remarks: s(`remarks_${itemId}`),
    });
  }
  if (items.some((i) => i.defective_qty < 0 || (i.qty != null && i.qty < 0))) return { error: 'Quantities cannot be negative.' };

  // contents first (allowed while In transit), then the box's status
  for (const i of items) {
    if (i.remove || i.qty === 0) {
      const { error } = await supabase.from('shipment_items').delete().eq('id', i.id).eq('shipment_id', id);
      if (error) return { error: friendlyError(error) };
      continue;
    }
    const patch: Record<string, number> = { defective_qty: i.defective_qty, short_qty: i.short_qty };
    if (i.qty != null) patch.qty = i.qty;
    const { error } = await supabase.from('shipment_items').update(patch).eq('id', i.id).eq('shipment_id', id);
    if (error) return { error: friendlyError(error) };
    // receipt remarks stay on the purchase line, as before (the "no remark" flag reads them there)
    const { error: e2 } = await supabase.from('purchase_lines').update({ remarks: i.remarks }).eq('id', i.lineId);
    if (e2) return { error: friendlyError(e2) };
  }

  let status = s('status') ?? 'in_transit';
  if (!STATUSES.includes(status)) return { error: 'Unknown status.' };
  const kept = items.filter((i) => !i.remove && i.qty !== 0);
  if (status === 'received' && kept.some((i) => i.defective_qty + i.short_qty > 0)) status = 'received_partial';
  const receivedOn = s('received_on') ?? (status.startsWith('received') ? new Date().toISOString().slice(0, 10) : null);

  const patch: Record<string, unknown> = {
    status, received_on: receivedOn, received_by: s('received_by'), tracking_no: s('tracking_no'), courier: s('courier'), notes: s('notes'),
  };
  // SHP-08: where the box went (only an admin sees this field; the database also refuses anyone else)
  const destination = s('destination');
  if (destination === 'amazon' || destination === 'home') patch.destination = destination;
  const { error } = await supabase.from('shipments').update(patch).eq('id', id);
  if (error) return { error: friendlyError(error) };

  revalidatePath('/shipments');
  revalidatePath(`/shipments/${id}`);
  revalidatePath('/');
  return { ok: true, status };
}

/** PUR-06: put the ticked lines (with how many units of each) into a new or existing box. */
export async function putInBox(input: {
  lines: { lineId: number; qty: number }[];
  shipmentId: number | null;
  newBox: { company_code: string; box_no: string; amazon_shipment_id: string; tracking_no: string; courier: string; created_on: string; channel: string } | null;
}): Promise<Result & { shipmentId?: number }> {
  const supabase = await createClient();
  const lines = input.lines.filter((l) => l.qty > 0);
  if (!lines.length) return { error: 'Tick at least one line and give it a quantity.' };
  if (!input.shipmentId && !input.newBox?.company_code) return { error: 'Choose the company for the new box.' };
  const { data, error } = await supabase.rpc('put_in_box', {
    p_lines: lines.map((l) => ({ line_id: l.lineId, qty: l.qty })),
    p_shipment: input.shipmentId,
    p_new: input.newBox,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/shipments');
  revalidatePath('/purchases');
  return { ok: true, shipmentId: Number(data) };
}

/** SHP-06: create a shipment on its own, before any purchase is entered into it. */
export async function createShipment(_: unknown, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const s = (k: string) => { const v = String(form.get(k) ?? '').trim(); return v === '' ? null : v; };
  const company = s('company_code');
  const month = s('period_month');
  if (!company) return { error: 'Choose a company.' };
  if (!month) return { error: 'Choose a month.' };
  const amazonId = s('amazon_shipment_id')?.toUpperCase() ?? null;
  const boxNo = s('box_no');
  if (!amazonId && !boxNo && !s('tracking_no')) return { error: 'Enter at least a box no., Amazon shipment ID or tracking no.' };

  // AC3: the same Amazon shipment and box must not be created twice
  if (amazonId) {
    let q = supabase.from('shipments').select('id').eq('amazon_shipment_id', amazonId).limit(1);
    q = boxNo ? q.eq('box_no', boxNo) : q.is('box_no', null);
    const { data: existing } = await q;
    if (existing?.length) {
      return { error: `Shipment ${amazonId}${boxNo ? ` box ${boxNo}` : ''} already exists.`, status: `existing:${existing[0].id}` };
    }
  }

  const { data, error } = await supabase.from('shipments').insert({
    period_month: month, company_code: company, channel: s('channel') ?? (amazonId ? 'FBA' : 'FBM'),
    box_no: boxNo, amazon_shipment_id: amazonId, tracking_no: s('tracking_no'), courier: s('courier'),
    created_on: s('created_on'), notes: s('notes'), status: 'in_transit',
  }).select('id').single();
  if (error) return { error: friendlyError(error) };
  revalidatePath('/shipments');
  redirect(`/shipments/${data.id}?created=1`);
}
