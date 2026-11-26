'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { SETTING_KEYS } from '@/lib/margin';

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? '').trim();
  if (s === '') return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : NaN;
};
const textOrNull = (v: FormDataEntryValue | null) => String(v ?? '').trim() || null;

/** Inputs from the line form. Only inputs are saved; figures are worked out when shown. */
function lineFields(f: FormData): { row?: Record<string, unknown>; error?: string } {
  const channel = String(f.get('channel'));
  if (channel !== 'AMAZON' && channel !== 'EBAY') return { error: 'Choose Amazon or eBay.' };
  const name = String(f.get('name') ?? '').trim();
  if (!name) return { error: 'Enter the product name.' };
  const nums: Record<string, number | null> = {};
  const fields = channel === 'AMAZON'
    ? ['product_cost', 'courier_cost', 'fx_rate', 'selling_price', 'tax_override_pct', 'referral_pct', 'fba_fee', 'promo_per_unit']
    : ['product_cost', 'courier_cost', 'fx_rate', 'selling_price', 'tax_override_pct', 'local_shipping', 'misc_expense', 'ad_pct'];
  for (const k of fields) {
    const x = numOrNull(f.get(k));
    if (Number.isNaN(x) || (x != null && x < 0)) return { error: `${k.replace(/_/g, ' ')} must be a number of 0 or more.` };
    nums[k] = x;
  }
  if (nums.selling_price == null) return { error: 'Enter the selling price.' };
  if (!(Number(nums.fx_rate) > 0)) return { error: 'Enter the exchange rate (₹ per £).' };
  if (nums.tax_override_pct != null && nums.tax_override_pct > 100) return { error: 'The tax rate must be between 0 and 100%.' };
  const row: Record<string, unknown> = {
    channel, name, company_code: String(f.get('company_code')),
    asin: textOrNull(f.get('asin')), fnsku: textOrNull(f.get('fnsku')), owner: textOrNull(f.get('owner')), notes: textOrNull(f.get('notes')),
    listing_status: f.get('listing_status') === 'not_listed' ? 'not_listed' : 'listed',
    product_cost_currency: String(f.get('product_cost_currency') ?? 'INR'), courier_currency: String(f.get('courier_currency') ?? 'INR'),
    product_id: numOrNull(f.get('product_id')),
    ...nums, product_cost: nums.product_cost ?? 0, courier_cost: nums.courier_cost ?? 0,
  };
  return { row };
}

export async function createMarginLine(_: unknown, f: FormData): Promise<Result> {
  const { row, error } = lineFields(f);
  if (error) return { error };
  const supabase = await createClient();
  // MRG-08: a rate left as filled in keeps its source and date; one typed over is marked "entered by hand"
  if (f.get('fx_source') === 'daily' && f.get('fx_rate_date')) Object.assign(row!, { fx_source: 'daily', fx_rate_date: String(f.get('fx_rate_date')) });
  const { data, error: e } = await supabase.from('margin_lines').insert(row!).select('id').single();
  if (e) return { error: friendlyError(e) };
  revalidatePath('/margins');
  redirect(`/margins/${data.id}?saved=1`);
}

export async function updateMarginLine(_: unknown, f: FormData): Promise<Result> {
  const { row, error } = lineFields(f);
  if (error) return { error };
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { data, error: e } = await supabase.from('margin_lines').update(row!).eq('id', id).select('id');
  if (e) return { error: friendlyError(e) };
  if (!data?.length) return { error: 'You do not have permission to do that.' };
  revalidatePath('/margins');
  revalidatePath(`/margins/${id}`);
  return { ok: true, status: 'Saved.' };
}

export async function applyTodaysRate(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('use_todays_rate', { p_id: id });
  if (error) return { error: friendlyError(error) };
  revalidatePath(`/margins/${id}`);
  revalidatePath('/margins');
  return { ok: true, status: 'Today\'s rate applied.' };
}

export async function copyMarginLine(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('copy_margin_line', { p_id: Number(f.get('id')), p_company: String(f.get('company_code')) });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/margins');
  redirect(`/margins/${data}?copied=1`);
}

export async function deleteMarginLine(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('margin_lines').delete().eq('id', Number(f.get('id'))).select('id');
  if (error) return { error: friendlyError(error) };
  if (!data?.length) return { error: 'You do not have permission to do that.' };
  revalidatePath('/margins');
  redirect('/margins');
}

export async function saveMarginSettings(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const allowed = new Set(Object.values(SETTING_KEYS));
  const { data: current } = await supabase.from('settings').select('key, value').like('key', 'margin_%');
  const now = new Map((current ?? []).map((r: any) => [r.key, Number(r.value)]));
  for (const [key, value] of f.entries()) {
    if (!allowed.has(key)) continue;
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
