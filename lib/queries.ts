import { createClient } from '@/lib/supabase/server';

export type SP = Record<string, string | undefined>;

const LINE_COLUMNS = 'id, shipment_id, period_month, company_code, product_name, fnsku, qty, unit_price, courier_per_unit, currency, line_total, line_total_gbp, line_total_inr, invoice_no, invoice_date, vendor_name, shipment_status, amazon_shipment_id, tracking_no, defective_qty, short_qty, received_qty, remarks';
const PAGE = 1000; // the most rows Supabase returns per request by default

/** Purchase lines for the filters. NFR-09: fetched in pages, so "All months" returns every line up to `limit`. */
export async function queryLines(sp: SP, limit = 500) {
  const supabase = await createClient();
  const build = () => {
    let q = supabase.from('v_purchase_lines').select(LINE_COLUMNS)
      .order('period_month', { ascending: false }).order('id', { ascending: false });
    if (sp.month) q = q.eq('period_month', sp.month);
    if (sp.company) q = q.eq('company_code', sp.company);
    if (sp.vendor) q = q.eq('vendor_id', Number(sp.vendor));
    if (sp.missing === 'date') q = q.is('invoice_date', null).eq('category', 'stock');
    if (sp.missing === 'number') q = q.is('invoice_no', null).eq('category', 'stock');
    if (sp.q) {
      const t = sp.q.replace(/[%,()"\\]/g, ' ').trim();
      q = q.or(`product_name.ilike."%${t}%",fnsku.ilike."${t}%",invoice_no.ilike."%${t}%",amazon_shipment_id.ilike."%${t}%"`);
    }
    return q;
  };
  const rows: any[] = [];
  for (let from = 0; from < limit; from += PAGE) {
    const { data, error } = await build().range(from, Math.min(from + PAGE, limit) - 1);
    if (error) return { data: rows.length ? rows : null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < Math.min(PAGE, limit - from)) break;
  }
  return { data: rows, error: null };
}


export async function queryLandedCost(sp: SP, limit = 1000) {
  const supabase = await createClient();
  let q = supabase.from('v_landed_cost')
    .select('period_month, company_code, product_id, product_name, currency, qty, received_qty, total_cost, landed_per_unit, landed_per_unit_inr, landed_per_unit_gbp, landed_per_received_unit')
    .order('period_month', { ascending: false }).order('product_name').limit(limit);
  if (sp.month) q = q.eq('period_month', sp.month);
  if (sp.company) q = q.eq('company_code', sp.company);
  if (sp.q) q = q.ilike('product_name', `%${sp.q.replace(/[%,()]/g, ' ').trim()}%`);
  return q;
}
