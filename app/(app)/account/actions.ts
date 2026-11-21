'use server';
import { createClient } from '@/lib/supabase/server';
import type { Result } from '@/lib/data';

export async function changePassword(_: unknown, f: FormData): Promise<Result> {
  const password = String(f.get('password') ?? '');
  if (password.length < 10) return { error: 'Use at least 10 characters.' };
  if (password !== String(f.get('confirm') ?? '')) return { error: 'The two passwords do not match.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { error: error.message } : { ok: true, status: 'Password changed.' };
}
