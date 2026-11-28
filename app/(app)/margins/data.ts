import type { Channel, MarginSettings } from '@/lib/margin';
import { PLATFORMS } from '@/lib/margin';
import { blankPlatform, type PlatformValues, type ProductValues } from './values';
import { createClient } from '@/lib/supabase/server';
import { settingsFromRows } from '@/lib/margin';

export async function marginSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('key, value, description').like('key', 'margin_%').order('key');
  return { settings: settingsFromRows(data ?? []), rows: (data ?? []) as { key: string; value: unknown; description: string | null }[] };
}

/** Today's ₹/£ for a new line: the latest daily rate, else the latest monthly rate (MRG-08 AC1). */
export async function todaysRate(): Promise<{ rate: number | null; date: string | null; source: 'daily' | 'monthly' | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from('daily_fx_rates').select('rate_date, inr_per_gbp').order('rate_date', { ascending: false }).limit(1);
  if (data?.[0]) return { rate: Number(data[0].inr_per_gbp), date: data[0].rate_date, source: 'daily' };
  const { data: m } = await supabase.from('v_fx').select('month, inr_per_gbp').order('month', { ascending: false }).limit(1);
  return m?.[0] ? { rate: Number(m[0].inr_per_gbp), date: null, source: 'monthly' } : { rate: null, date: null, source: null };
}

const str = (v: unknown) => (v == null ? '' : String(Number(v)));

/** A product line and its platform rows from the database, as form values. Platforms with no row start blank. */
export function productValues(p: any, lines: any[], s: MarginSettings, defaultCompany: string): ProductValues {
  const platforms = {} as Record<Channel, PlatformValues>;
  for (const { code } of PLATFORMS) {
    const l = lines.find((x) => x.channel === code);
    platforms[code] = l ? {
      saved: true, company_code: l.company_code, selling_price: str(l.selling_price), tax_override_pct: str(l.tax_override_pct), hidden: !!l.hidden,
      listing_status: l.listing_status === 'not_listed' ? 'not_listed' : 'listed',
      referral_pct: str(l.referral_pct), fba_fee: str(l.fba_fee), promo_per_unit: str(l.promo_per_unit),
      local_shipping: str(l.local_shipping), misc_expense: str(l.misc_expense), ad_pct: str(l.ad_pct), category_fee_pct: str(l.category_fee_pct),
    } : blankPlatform(code, s, lines[0]?.company_code ?? defaultCompany);
  }
  return {
    id: p.id, product_id: p.product_id, name: p.name, asin: p.asin ?? '', fnsku: p.fnsku ?? '', owner: p.owner ?? '', notes: p.notes ?? '',
    product_cost: str(p.product_cost), product_cost_currency: p.product_cost_currency === 'GBP' ? 'GBP' : 'INR',
    courier_cost: str(p.courier_cost), courier_currency: p.courier_currency === 'GBP' ? 'GBP' : 'INR',
    fx_rate: str(p.fx_rate), fx_rate_date: p.fx_rate_date, fx_source: p.fx_source, platforms,
  };
}
