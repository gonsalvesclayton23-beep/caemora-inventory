import { queryLines } from '@/lib/queries';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { data, error } = await queryLines(sp, 10000);
  if (error) return new Response(error.message, { status: 400 });
  const cols = ['period_month', 'company_code', 'product_name', 'fnsku', 'qty', 'unit_price', 'courier_per_unit', 'currency', 'line_total',
    'line_total_inr', 'line_total_gbp', 'invoice_no', 'invoice_date', 'vendor_name', 'amazon_shipment_id', 'tracking_no', 'shipment_status',
    'defective_qty', 'short_qty', 'received_qty', 'remarks'] as const;
  const body = [cols.join(','), ...(data ?? []).map((r: any) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="purchases-${sp.month ?? 'all'}.csv"` },
  });
}
