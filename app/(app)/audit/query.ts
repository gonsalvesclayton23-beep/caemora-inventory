import { createClient } from '@/lib/supabase/server';
import { areaTables, type AuditFilters, type Lookups } from '@/lib/audit';

/** One page of the audit log (newest first) plus names for the records on it. */
export async function auditPage(f: AuditFilters, limit: number, offset: number) {
  const supabase = await createClient();
  let q = supabase.from('v_audit_log').select('*', { count: 'exact' }).order('changed_at', { ascending: false }).order('id', { ascending: false });
  if (f.user) q = q.eq('changed_by', f.user);
  if (f.area) q = q.in('table_name', areaTables(f.area));
  if (f.action) q = q.eq('action', f.action);
  if (f.from) q = q.gte('changed_at', `${f.from}T00:00:00Z`);
  if (f.to) q = q.lt('changed_at', new Date(Date.parse(`${f.to}T00:00:00Z`) + 86400000).toISOString());
  const { data, error, count } = await q.range(offset, offset + limit - 1);
  const rows = (data ?? []) as any[];

  // names for ids on this page
  const ids = (key: string, tables: string[]) => [...new Set(rows.filter((r) => tables.includes(r.table_name))
    .flatMap((r) => [r.new_data?.[key], r.old_data?.[key]]).filter((x) => x != null).map(Number))];
  const pIds = ids('product_id', ['purchase_lines', 'shipment_items', 'listings']);
  const vIds = ids('vendor_id', ['payments', 'credit_notes']);
  const mIds = [...new Set([...ids('margin_product_id', ['margin_lines']), ...ids('a_id', ['margin_match_dismissed']), ...ids('b_id', ['margin_match_dismissed'])])];
  const [p, v, m] = await Promise.all([
    pIds.length ? supabase.from('products').select('id, name').in('id', pIds) : { data: [] },
    vIds.length ? supabase.from('vendors').select('id, name').in('id', vIds) : { data: [] },
    mIds.length ? supabase.from('margin_products').select('id, name').in('id', mIds) : { data: [] },
  ]);
  const map = (d: any) => new Map<number, string>((d.data ?? []).map((x: any) => [x.id, x.name]));
  const lookups: Lookups = { products: map(p), vendors: map(v), marginProducts: map(m) };
  return { rows, error, count: count ?? 0, lookups };
}
