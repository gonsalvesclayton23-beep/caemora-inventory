'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';

const done = (id: number): Result => { revalidatePath('/cases'); revalidatePath(`/cases/${id}`); revalidatePath('/', 'layout'); return { ok: true }; };
const text = (f: FormData, k: string) => String(f.get(k) ?? '').trim();

export async function reassignCase(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('reassign_case', { p_case: id, p_to: text(f, 'to'), p_note: text(f, 'note') || null });
  return error ? { error: friendlyError(error) } : { ...done(id), status: 'Reassigned.' };
}

export async function startCase(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_case_status', { p_case: id, p_status: text(f, 'status') === 'open' ? 'open' : 'in_progress' });
  return error ? { error: friendlyError(error) } : { ...done(id), status: 'Updated.' };
}

export async function resolveCase(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_case', { p_case: id, p_note: text(f, 'note') });
  return error ? { error: friendlyError(error) } : { ...done(id), status: 'Resolved.' };
}

export async function setCaseReference(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_case_reference', { p_case: id, p_ref: text(f, 'ref') });
  return error ? { error: friendlyError(error) } : { ...done(id), status: 'Saved.' };
}

export async function resolveShortage(_: unknown, f: FormData): Promise<Result> {
  const id = Number(f.get('id'));
  const raw = text(f, 'gbp');
  const gbp = raw === '' ? null : Number(raw);
  if (gbp != null && !(gbp >= 0)) return { error: 'Enter the £ amount as a number, e.g. 38.22' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('resolve_shortage', { p_case: id, p_outcome: text(f, 'outcome'), p_gbp: gbp, p_note: text(f, 'note') || null });
  if (error) return { error: friendlyError(error) };
  revalidatePath('/shipments', 'layout');
  return { ...done(id), status: 'Resolved.' };
}

/** Admin: which flag types create cases, who gets them, and the due time. */
export async function saveCaseRules(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const rules = f.getAll('rule').map(String);
  for (const rule of rules) {
    const assignTo = text(f, `assign_${rule}`);
    const patch = {
      creates_case: f.get(`on_${rule}`) === 'on',
      assign_to: assignTo === 'entered_by' ? 'entered_by' : 'person',
      assignee: assignTo === 'entered_by' || assignTo === 'admin' ? null : assignTo || null,
    };
    const { error } = await supabase.from('case_rules').update(patch).eq('rule', rule);
    if (error) return { error: friendlyError(error) };
  }
  const days = Number(text(f, 'due_days'));
  if (!Number.isInteger(days) || days < 1 || days > 60) return { error: 'Due time must be a whole number of working days, 1 to 60.' };
  const { error } = await supabase.from('settings').update({ value: days }).eq('key', 'case_due_working_days');
  if (error) return { error: friendlyError(error) };
  revalidatePath('/admin');
  return { ok: true };
}
