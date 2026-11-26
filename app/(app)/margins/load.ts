import { createClient } from '@/lib/supabase/server';
import type { Channel, MarginLineRow, PlatformEntry, ProductCosts } from '@/lib/margin';

export interface ProductLine {
  id: number; name: string; asin: string | null; fnsku: string | null; owner: string | null; notes: string | null;
  fx_rate: number | string; fx_rate_date: string | null; fx_source: string | null;
  rows: MarginLineRow[]; costs: ProductCosts; entries: PlatformEntry[];
}

/** Every product line with its platform rows (from v_margin_lines), plus lines that have no platform yet. */
export async function loadProducts() {
  const supabase = await createClient();
  const [{ data: products, error }, { data: lines }] = await Promise.all([
    supabase.from('margin_products').select('*').order('name').limit(5000),
    supabase.from('v_margin_lines').select('*').limit(20000),
  ]);
  const byProduct = new Map<number, MarginLineRow[]>();
  for (const l of (lines ?? []) as MarginLineRow[]) {
    const k = Number(l.margin_product_id);
    (byProduct.get(k) ?? byProduct.set(k, []).get(k)!).push(l);
  }
  return {
    error,
    products: (products ?? []).map((p: any) => {
      const rows = byProduct.get(p.id) ?? [];
      const costs: ProductCosts = {
        productCost: Number(p.product_cost), productCostCurrency: p.product_cost_currency, courierCost: Number(p.courier_cost),
        courierCurrency: p.courier_currency, fxRate: Number(p.fx_rate),
      };
      const entries: PlatformEntry[] = rows.map((l) => ({
        channel: l.channel as Channel, companyCode: l.company_code, companyName: l.company_name, companyVatPct: Number(l.company_vat_pct),
        ownTaxPct: l.tax_override_pct == null ? null : Number(l.tax_override_pct), sellingPrice: l.selling_price == null ? null : Number(l.selling_price),
        hidden: !!l.hidden, referralPct: num(l.referral_pct), fbaFee: num(l.fba_fee), promoPerUnit: num(l.promo_per_unit),
        localShipping: num(l.local_shipping), miscExpense: num(l.misc_expense), adPct: num(l.ad_pct),
      }));
      return { ...p, rows, costs, entries } as ProductLine;
    }),
  };
}
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
