import { createClient } from '@/lib/supabase/server';

export async function load() {
  const supabase = await createClient();
  const [{ data: products }, { data: lines }] = await Promise.all([
    supabase.from('margin_products').select('*').order('id').limit(5000),
    supabase.from('v_margin_lines').select('id, margin_product_id, channel, company_name, selling_price, hidden').limit(20000),
  ]);
  return { products: (products ?? []).map((p: any) => ({ ...p, rows: (lines ?? []).filter((l: any) => l.margin_product_id === p.id) })) };
}
