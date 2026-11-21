import { queryLandedCost } from '@/lib/queries';

const cell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const { data, error } = await queryLandedCost(sp, 20000);
  if (error) return new Response(error.message, { status: 400 });
  const cols = ['period_month', 'company_code', 'product_name', 'currency', 'qty', 'received_qty', 'total_cost',
    'landed_per_unit', 'landed_per_unit_inr', 'landed_per_unit_gbp', 'landed_per_received_unit'] as const;
  const body = [cols.join(','), ...(data ?? []).map((r: any) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="landed-cost-${sp.month ?? 'all'}.csv"` } });
}
