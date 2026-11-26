import { createClient } from '@/lib/supabase/server';

/** What a form's server action returns. */
export interface Result { ok?: boolean; error?: string | null; status?: string }

export interface Option { value: string; label: string }

/** Reference lists used by most forms and filters. */
export async function referenceData() {
  const supabase = await createClient();
  const [companies, vendors, periods] = await Promise.all([
    supabase.from('companies').select('code, name, default_vat_pct, vat_scheme').eq('active', true).order('sort_order').order('code'),
    supabase.from('vendors').select('id, name, default_currency, kind').eq('active', true).order('name'),
    supabase.from('periods').select('month, status').order('month', { ascending: false }),
  ]);
  return {
    companies: (companies.data ?? []) as { code: string; name: string; default_vat_pct: number; vat_scheme: string | null }[],
    vendors: (vendors.data ?? []) as { id: number; name: string; default_currency: 'INR' | 'GBP'; kind: string }[],
    periods: (periods.data ?? []) as { month: string; status: 'open' | 'settled' }[],
  };
}

export const firstOfMonth = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;

/** Turns a Postgres/PostgREST error into a sentence for the person using the form. */
export function friendlyError(e: { message?: string; code?: string } | null | undefined): string | null {
  if (!e) return null;
  if (e.code === '42501' || /row-level security/i.test(e.message ?? '')) return 'You do not have permission to do that.';
  if (e.code === '23505') return 'That already exists.';
  return e.message ?? 'Something went wrong.';
}

export async function getSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('key, value');
  const map = new Map((data ?? []).map((r: any) => [r.key, Number(r.value)]));
  return {
    priceChangePct: map.get('price_change_pct') ?? 5,
    suspectInrBelow: map.get('suspect_inr_price_below') ?? 20,
    rateTolerancePct: map.get('rate_card_tolerance_pct') ?? 0,
  };
}

/** Sort helper: lists of companies follow the companies' own order (CMR, ARC, YD, GOE, GOA, GEN, ALS). */
export function byCompanyOrder(companies: { code: string }[]) {
  const pos = new Map(companies.map((c, i) => [c.code, i]));
  return (a: string | null | undefined, b: string | null | undefined) =>
    (pos.get(a ?? '') ?? 99) - (pos.get(b ?? '') ?? 99) || String(a ?? '').localeCompare(String(b ?? ''));
}
