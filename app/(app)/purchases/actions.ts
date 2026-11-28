'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { duplicateMessage, findDuplicates } from '@/lib/duplicates';

export interface ProductHit {
  id: number;
  name: string;
  agreed_courier_per_unit: number | null;
  agreed_courier_currency: 'INR' | 'GBP';
  listings: { id: number; company_code: string; channel: string; fnsku: string | null; asin: string | null }[];
  last: { unit_price: number | null; courier_per_unit: number; currency: 'INR' | 'GBP'; period_month: string } | null;
}

/** Search by name, FNSKU or ASIN. Returns the rate card and the last purchase of each product. */
export async function searchProducts(q: string): Promise<ProductHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const supabase = await createClient();
  const select = 'id, name, agreed_courier_per_unit, agreed_courier_currency, listings(id, company_code, channel, fnsku, asin)';
  const safe = term.replace(/[%,()"\\]/g, ' ');

  const [byName, byCode] = await Promise.all([
    supabase.from('products').select(select).eq('active', true).eq('category', 'stock').ilike('name', `%${safe}%`).limit(20),
    supabase.from('listings').select('product_id').or(`fnsku.ilike."${safe}%",asin.ilike."${safe}%"`).limit(20),
  ]);
  const ids = new Set((byName.data ?? []).map((p: any) => p.id));
  const extraIds = (byCode.data ?? []).map((l: any) => l.product_id).filter((id: number) => !ids.has(id));
  const extra = extraIds.length ? (await supabase.from('products').select(select).in('id', extraIds)).data ?? [] : [];
  const products = [...extra, ...(byName.data ?? [])] as any[];
  if (!products.length) return [];

  const { data: recent } = await supabase.from('purchase_lines')
    .select('product_id, unit_price, courier_per_unit, currency, period_month')
    .in('product_id', products.map((p) => p.id))
    .order('period_month', { ascending: false }).order('id', { ascending: false }).limit(300);
  const last = new Map<number, any>();
  for (const r of recent ?? []) if (!last.has(r.product_id)) last.set(r.product_id, r);

  return products.slice(0, 20).map((p) => ({ ...p, last: last.get(p.id) ?? null }));
}

/** PRD-08: is this new product already created? Exact duplicates come back with the product, ready to use. */
export async function checkProductDuplicate(input: { name: string; fnsku?: string; asin?: string }) {
  if ((input.name ?? '').trim().length < 3 && !input.fnsku && !input.asin) return { exact: null, message: null, product: null, similar: [] };
  const supabase = await createClient();
  const { data } = await supabase.from('products').select('id, name, listings(fnsku, asin)').limit(10000);
  const existing = (data ?? []).map((p: any) => ({ id: p.id, name: p.name, asins: p.listings.map((l: any) => l.asin), fnskus: p.listings.map((l: any) => l.fnsku) }));
  const d = findDuplicates({ name: input.name, fnsku: input.fnsku, asin: input.asin }, existing);
  let product: ProductHit | null = null;
  if (d.exact) {
    const hits = await searchProducts(d.exact.name);
    product = hits.find((h) => h.id === d.exact!.id) ?? null;
  }
  return { exact: d.exact, message: d.exact ? duplicateMessage(d.exact) : null, product, similar: d.similar };
}

export async function createProduct(input: { name: string; company: string; fnsku?: string; asin?: string; channel: string }) {
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return { error: 'Enter a product name.' };
  // PRD-08: refuse a product that already exists before creating anything (the database also refuses it)
  const dup = await checkProductDuplicate({ name, fnsku: input.fnsku, asin: input.asin });
  if (dup.message) return { error: dup.message };
  const { data: product, error } = await supabase.from('products').insert({ name }).select('id, name').single();
  if (error) return { error: friendlyError(error) };
  const fnsku = input.fnsku?.trim().toUpperCase() || null;
  const { data: listing, error: e2 } = await supabase.from('listings').insert({
    product_id: product.id, company_code: input.company, channel: input.channel, fnsku, asin: input.asin?.trim().toUpperCase() || null,
  }).select('id, company_code, channel, fnsku, asin').single();
  if (e2) return { error: friendlyError(e2) };
  return { product: { ...product, agreed_courier_per_unit: null, agreed_courier_currency: 'INR', listings: [listing], last: null } as ProductHit };
}

export interface PurchaseInput {
  month: string;
  company: string;
  vendorId: number;
  currency: 'INR' | 'GBP';
  invoiceNo: string;
  invoiceDate: string;
  shipment: { mode: 'none' } | { mode: 'existing'; id: number } |
    { mode: 'new'; boxNo: string; amazonShipmentId: string; trackingNo: string; courier: string; createdOn: string };
  lines: { productId: number; listingId: number | null; description: string; qty: number; unitPrice: number | null; courierPerUnit: number; remarks: string }[];
  invoiceFile?: { path: string; name: string; type: string; size: number } | null;
}

export async function savePurchase(input: PurchaseInput) {
  const supabase = await createClient();
  if (!input.lines.length) return { error: 'Add at least one product.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.invoiceDate)) return { error: 'Enter the invoice date.' };
  input.month = `${input.invoiceDate.slice(0, 7)}-01`; // INV-01: filed in the invoice's month
  if (input.lines.some((l) => !(l.qty > 0))) return { error: 'Every line needs a quantity.' };

  let shipmentId: number | null = null;
  if (input.shipment.mode === 'existing') shipmentId = input.shipment.id;
  if (input.shipment.mode === 'new') {
    const s = input.shipment;
    const { data, error } = await supabase.from('shipments').insert({
      period_month: input.month, company_code: input.company, box_no: s.boxNo || null,
      amazon_shipment_id: s.amazonShipmentId.trim().toUpperCase() || null, tracking_no: s.trackingNo.trim() || null,
      courier: s.courier || null, created_on: s.createdOn || null,
      channel: s.amazonShipmentId ? 'FBA' : 'FBM', status: 'in_transit',
    }).select('id').single();
    if (error) return { error: friendlyError(error) };
    shipmentId = data.id;
  }

  const { error } = await supabase.from('purchase_lines').insert(input.lines.map((l) => ({
    period_month: input.month, shipment_id: shipmentId, product_id: l.productId, listing_id: l.listingId,
    company_code: input.company, vendor_id: input.vendorId, description: l.description, qty: l.qty,
    unit_price: l.unitPrice, currency: input.currency, courier_per_unit: l.courierPerUnit || 0,
    invoice_no: input.invoiceNo.trim() || null, invoice_date: input.invoiceDate || null, remarks: l.remarks || null,
  })));
  if (error) {
    if (input.shipment.mode === 'new' && shipmentId) await supabase.from('shipments').delete().eq('id', shipmentId);
    return { error: friendlyError(error) };
  }
  if (input.invoiceFile) {
    const f = input.invoiceFile;
    await supabase.from('invoice_files').insert({
      company_code: input.company, vendor_id: input.vendorId, invoice_no: input.invoiceNo.trim() || null, invoice_date: input.invoiceDate,
      storage_path: f.path, file_name: f.name, content_type: f.type, size_bytes: f.size,
    });
  }
  revalidatePath('/purchases');
  revalidatePath('/');
  redirect(`/purchases?month=${input.month}&saved=${input.lines.length}`);
}

const LINE_FIELDS = ['qty', 'unit_price', 'courier_per_unit', 'currency', 'invoice_no', 'invoice_date', 'defective_qty', 'short_qty',
  'checked_by', 'remarks', 'remarks_2', 'company_code', 'vendor_id', 'amazon_case_id', 'reimbursement_id', 'reimbursed_gbp'] as const;

export async function updateLine(_: unknown, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = Number(form.get('id'));
  const patch: Record<string, unknown> = {};
  for (const f of LINE_FIELDS) {
    if (!form.has(f)) continue;
    const raw = String(form.get(f) ?? '').trim();
    patch[f] = raw === '' ? null : ['qty', 'unit_price', 'courier_per_unit', 'defective_qty', 'short_qty', 'vendor_id', 'reimbursed_gbp'].includes(f) ? Number(raw) : raw;
  }
  for (const f of ['courier_per_unit', 'defective_qty', 'short_qty'] as const) if (patch[f] == null && f in patch) patch[f] = 0;
  const reason = String(form.get('reason') ?? '').trim();

  const { error } = reason
    ? await supabase.rpc('edit_with_reason', { p_table: 'purchase_lines', p_id: id, p_patch: patch, p_reason: reason })
    : await supabase.from('purchase_lines').update(patch).eq('id', id);
  if (error) return { error: friendlyError(error) };
  revalidatePath('/purchases');
  revalidatePath(`/purchases/${id}`);
  return { ok: true };
}

export async function deleteLine(_: unknown, form: FormData): Promise<Result> {
  const supabase = await createClient();
  const id = Number(form.get('id'));
  const reason = String(form.get('reason') ?? '').trim();
  const { error } = await supabase.rpc('delete_with_reason', { p_table: 'purchase_lines', p_id: id, p_reason: reason || 'Deleted' });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/purchases');
  redirect('/purchases');
}
