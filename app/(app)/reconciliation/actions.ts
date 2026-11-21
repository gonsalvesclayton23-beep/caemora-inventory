'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';

const done = (): Result => { revalidatePath('/reconciliation'); revalidatePath('/'); return { ok: true }; };
const str = (f: FormData, k: string) => { const v = String(f.get(k) ?? '').trim(); return v === '' ? null : v; };

export async function addPayment(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const amount = Number(str(f, 'amount'));
  if (!(amount > 0)) return { error: 'Enter the amount paid.' };
  const gbp = str(f, 'amount_gbp');
  const choice = str(f, 'paid_from_company');
  const fromCompany = choice === '__other' ? null : choice ?? str(f, 'company_code');
  const { error } = await supabase.from('payments').insert({
    period_month: str(f, 'period_month'), company_code: str(f, 'company_code'), vendor_id: Number(str(f, 'vendor_id')),
    kind: str(f, 'kind') ?? 'other', amount, currency: str(f, 'currency') ?? 'INR', amount_gbp: gbp ? Number(gbp) : null,
    paid_on: str(f, 'paid_on'), method: str(f, 'method'), paid_from_company: fromCompany,
    paid_from: fromCompany ?? (str(f, 'paid_from_company') === '__other' ? 'Personal / other' : null), reference: str(f, 'reference'), notes: str(f, 'notes'),
  });
  return error ? { error: friendlyError(error) } : done();
}

export async function addCreditNote(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const amount = Number(str(f, 'amount'));
  if (!(amount > 0)) return { error: 'Enter the credit amount.' };
  if (!str(f, 'reason')) return { error: 'Enter a reason.' };
  const { error } = await supabase.from('credit_notes').insert({
    period_month: str(f, 'period_month'), relates_to_month: str(f, 'relates_to_month'), company_code: str(f, 'company_code'),
    vendor_id: Number(str(f, 'vendor_id')), amount, currency: str(f, 'currency') ?? 'INR', reason: str(f, 'reason'),
  });
  return error ? { error: friendlyError(error) } : done();
}

export async function confirmPayment(f: FormData) {
  const supabase = await createClient();
  await supabase.rpc('edit_with_reason', { p_table: 'payments', p_id: Number(f.get('id')), p_patch: { confirmed: true }, p_reason: 'Confirmed as paid' });
  done();
}

export async function settleMonth(f: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('settle_month', { p_month: String(f.get('month')) });
  if (error) throw new Error(friendlyError(error) ?? 'Could not settle');
  done();
}

export async function reopenMonth(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_month', { p_month: String(f.get('month')), p_reason: String(f.get('reason') ?? '') });
  return error ? { error: friendlyError(error) } : done();
}
