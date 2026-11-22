'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';

const STATUSES = ['in_transit', 'received', 'received_partial', 'lost', 'cancelled'];

/** Saves the shipment's receipt details and the defective/short quantity of each of its lines. */
export async function saveShipment(_: unknown, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = Number(form.get('id'));
  const s = (k: string) => { const v = String(form.get(k) ?? '').trim(); return v === '' ? null : v; };

  const lineIds = form.getAll('line_id').map(Number);
  const lines = lineIds.map((lineId) => ({
    id: lineId,
    defective_qty: Number(form.get(`defective_${lineId}`) || 0),
    short_qty: Number(form.get(`short_${lineId}`) || 0),
    remarks: s(`remarks_${lineId}`),
  }));
  if (lines.some((l) => l.defective_qty < 0 || l.short_qty < 0)) return { error: 'Quantities cannot be negative.' };

  let status = s('status') ?? 'in_transit';
  if (!STATUSES.includes(status)) return { error: 'Unknown status.' };
  if (status === 'received' && lines.some((l) => l.defective_qty + l.short_qty > 0)) status = 'received_partial';
  const receivedOn = s('received_on') ?? (status.startsWith('received') ? new Date().toISOString().slice(0, 10) : null);

  const { error } = await supabase.from('shipments').update({
    status, received_on: receivedOn, received_by: s('received_by'), tracking_no: s('tracking_no'), courier: s('courier'), notes: s('notes'),
  }).eq('id', id);
  if (error) return { error: friendlyError(error) };

  for (const l of lines) {
    const { error: e } = await supabase.from('purchase_lines')
      .update({ defective_qty: l.defective_qty, short_qty: l.short_qty, remarks: l.remarks }).eq('id', l.id).eq('shipment_id', id);
    if (e) return { error: friendlyError(e) };
  }
  revalidatePath('/shipments');
  revalidatePath(`/shipments/${id}`);
  revalidatePath('/');
  return { ok: true, status };
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
