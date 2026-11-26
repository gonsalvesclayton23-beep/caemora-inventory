'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';

export async function updateUser(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({
    full_name: String(f.get('full_name') ?? '').trim(), role: String(f.get('role')), active: f.get('active') === 'on',
  }).eq('id', String(f.get('id')));
  revalidatePath('/admin');
  return error ? { error: friendlyError(error) } : { ok: true };
}

export async function saveSettings(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  for (const [key, value] of f.entries()) {
    if (!key.startsWith('s:')) continue;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return { error: `${key.slice(2)} must be a number.` };
    const { error } = await supabase.from('settings').update({ value: n }).eq('key', key.slice(2));
    if (error) return { error: friendlyError(error) };
  }
  await supabase.rpc('refresh_all_flags');
  revalidatePath('/admin');
  return { ok: true };
}

export async function setFxRate(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const month = String(f.get('month'));
  const raw = String(f.get('rate') ?? '').trim();
  if (raw === '') {
    // back to the rate worked out from that month's payments
    await supabase.from('fx_rates').delete().eq('month', month);
    await supabase.rpc('recompute_fx_from_payments');
  } else {
    const rate = Number(raw);
    if (!(rate > 0)) return { error: 'Enter a rate such as 124.5' };
    const { error } = await supabase.from('fx_rates').upsert({ month, inr_per_gbp: rate, source: 'manual', updated_at: new Date().toISOString() });
    if (error) return { error: friendlyError(error) };
  }
  revalidatePath('/admin');
  return { ok: true };
}

export async function acknowledgeBefore(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('acknowledge_flags_before', { p_month: String(f.get('month')), p_rule: String(f.get('rule') ?? '') || null });
  revalidatePath('/flags');
  revalidatePath('/');
  return error ? { error: friendlyError(error) } : { ok: true, status: `${data} flags marked as seen` };
}

export async function updateRateCard(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const raw = String(f.get('rate') ?? '').trim();
  const { error } = await supabase.from('products').update({
    agreed_courier_per_unit: raw === '' ? null : Number(raw),
    agreed_courier_currency: String(f.get('currency') ?? 'INR'),
    agreed_courier_from: String(f.get('from') ?? '') ? `${f.get('from')}-01` : null,  // <input type=month> gives YYYY-MM
  }).eq('id', Number(f.get('id')));
  if (error) return { error: friendlyError(error) };
  await supabase.rpc('refresh_all_flags');
  revalidatePath('/products');
  return { ok: true };
}

/** Default VAT per company (admin only; every change is kept in the change history). */
export async function updateVat(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const vat = Number(String(f.get('vat') ?? '').replace('%', '').trim());
  if (!Number.isFinite(vat)) return { error: 'Enter the VAT as a number, e.g. 7.5' };
  const { error } = await supabase.rpc('set_vat', { p_code: String(f.get('code')), p_vat: vat, p_scheme: String(f.get('scheme') ?? '') });
  revalidatePath('/admin');
  return error ? { error: friendlyError(error) } : { ok: true };
}
