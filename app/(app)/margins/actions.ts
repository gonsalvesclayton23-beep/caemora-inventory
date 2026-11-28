'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { PLATFORMS, validateCosts } from '@/lib/margin';

const NUM_PRODUCT = ['product_cost', 'courier_cost', 'fx_rate'] as const;
const NUM_PLATFORM = ['selling_price', 'tax_override_pct', 'referral_pct', 'fba_fee', 'promo_per_unit', 'local_shipping', 'misc_expense', 'ad_pct', 'category_fee_pct'] as const;
const LABEL: Record<string, string> = {
  product_cost: 'Product cost', courier_cost: 'Courier cost', fx_rate: 'Exchange rate', selling_price: 'Selling price', tax_override_pct: 'Tax rate',
  referral_pct: 'Referral fee %', fba_fee: 'FBA fee', promo_per_unit: 'Ads (£ per unit)', local_shipping: 'Shipping / local courier', misc_expense: 'Miscellaneous', ad_pct: 'Ads %',
  category_fee_pct: 'Category fee %',
};
const toNum = (v: unknown) => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
};
const text = (v: unknown) => String(v ?? '').trim() || null;

/** Save a product line and its platforms (MRG-09). Only inputs are saved; figures are worked out when shown. */
export async function saveMarginProduct(_: unknown, f: FormData): Promise<Result> {
  let p: any;
  try { p = JSON.parse(String(f.get('payload'))); } catch { return { error: 'Could not read the form.' }; }
  const name = String(p.name ?? '').trim();
  if (!name) return { error: 'Enter the product name.' };
  const out: Record<string, unknown> = {
    id: p.id ?? null, product_id: p.product_id ?? null, name, asin: text(p.asin), fnsku: text(p.fnsku), owner: text(p.owner), notes: text(p.notes),
    product_cost_currency: p.product_cost_currency === 'GBP' ? 'GBP' : 'INR', courier_currency: p.courier_currency === 'GBP' ? 'GBP' : 'INR',
  };
  // MRG-11: both costs are required (0 is a valid courier cost)
  const missing = validateCosts({ product_cost: String(p.product_cost ?? ''), courier_cost: String(p.courier_cost ?? '') });
  if (missing.product_cost || missing.courier_cost) return { error: [missing.product_cost, missing.courier_cost].filter(Boolean).join('. ') + '.' };
  for (const k of NUM_PRODUCT) {
    const x = toNum(p[k]);
    if (Number.isNaN(x) || (x != null && x < 0)) return { error: `${LABEL[k]} must be a number of 0 or more.` };
    out[k] = x;
  }
  // MRG-08: a rate left as filled in keeps its source and date; one typed over is "entered by hand" (dated today)
  if (!p.id) {
    if (p.fx_source === 'daily' && p.fx_rate_date) Object.assign(out, { fx_source: 'daily', fx_rate_date: p.fx_rate_date });
    else if (p.fx_source === 'monthly') out.fx_rate = null;   // the database fills in the latest monthly rate
  }
  if (out.fx_rate == null && (p.id || p.fx_source !== 'monthly')) return { error: 'Enter the exchange rate (₹ per £).' };
  if (out.fx_rate != null && !(Number(out.fx_rate) > 0)) return { error: 'Enter the exchange rate (₹ per £).' };

  const platforms = [];
  for (const { code, label } of PLATFORMS) {
    const x = p.platforms?.[code];
    if (!x) continue;
    const row: Record<string, unknown> = { channel: code, company_code: String(x.company_code ?? ''), hidden: !!x.hidden,
      listing_status: x.listing_status === 'not_listed' ? 'not_listed' : 'listed' };
    for (const k of NUM_PLATFORM) {
      const v = toNum(x[k]);
      if (Number.isNaN(v) || (v != null && v < 0)) return { error: `${label}: ${LABEL[k].toLowerCase()} must be a number of 0 or more.` };
      row[k] = v;
    }
    if (row.tax_override_pct != null && Number(row.tax_override_pct) > 100) return { error: `${label}: the tax rate must be between 0 and 100%.` };
    if ((row.selling_price != null || row.hidden || x.saved) && !row.company_code) return { error: `${label}: choose the company that sells it.` };
    if (row.selling_price == null && !row.hidden && !x.saved) continue;   // nothing entered for this platform
    platforms.push(row);
  }
  out.platforms = platforms;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('save_margin_product', { p: out });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/margins');
  revalidatePath(`/margins/${data}`);
  if (!p.id) redirect(`/margins/${data}?saved=1`);
  return { ok: true, status: 'Saved.' };
}

export async function applyTodaysRate(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('use_todays_rate', { p_product: id });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/margins/${id}`);
  revalidatePath('/margins');
  return { ok: true, status: 'Today\'s rate applied.' };
}

export async function deleteMarginProduct(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('margin_products').delete().eq('id', Number(f.get('id'))).select('id');
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: 'You do not have permission to do that.' };
  revalidatePath('/margins');
  redirect('/margins');
}

/** MRG-09 AC6: an admin confirms one match. The line chosen as "keep" gives the name, costs and rate. */
export async function mergeMatch(_: unknown, f: FormData): Promise<Result> {
  const keep = Number(f.get('keep')), a = Number(f.get('a')), b = Number(f.get('b'));
  if (keep !== a && keep !== b) return { error: 'Choose which line\'s costs to keep.' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('merge_margin_products', { p_keep: keep, p_from: keep === a ? b : a });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/margins', 'layout');
  return { ok: true, status: 'Merged into one line.' };
}

export async function dismissMatch(_: unknown, f: FormData): Promise<Result> {
  const a = Number(f.get('a')), b = Number(f.get('b'));
  const supabase = await createClient();
  const { error } = await supabase.from('margin_match_dismissed').insert({ a_id: Math.min(a, b), b_id: Math.max(a, b) });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/margins', 'layout');
  return { ok: true, status: 'Marked as not a match.' };
}

export async function saveMarginSettings(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data: current } = await supabase.from('settings').select('key, value').like('key', 'margin_%');
  const now = new Map((current ?? []).map((r: any) => [r.key, Number(r.value)]));
  for (const [key, value] of f.entries()) {
    if (!now.has(key)) continue;
    const x = Number(String(value).trim());
    if (String(value).trim() === '' || !Number.isFinite(x) || x < 0) return { error: 'Every setting must be a number of 0 or more.' };
    if (now.get(key) === x) continue;   // only real changes go into the history
    const { data, error } = await supabase.from('settings').update({ value: x }).eq('key', key).select('key');
    if (error) return { error: friendlyError(error) };
    if (!data?.length) return { error: 'You do not have permission to do that.' };
  }
  revalidatePath('/margins', 'layout');
  return { ok: true };
}
