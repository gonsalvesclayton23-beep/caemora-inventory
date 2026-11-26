'use server';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(_: unknown, form: FormData) {
  const supabase = await createClient();
  const email = String(form.get('email') ?? '').trim();
  const { error } = await supabase.auth.signInWithPassword({ email, password: String(form.get('password') ?? '') });
  // Audit log (AUD AC4): recorded on a best-effort basis; a problem here never stops anyone signing in
  if (error) {
    await supabase.rpc('record_sign_in_event', { p_event: 'SIGN_IN_FAILED', p_email: email }).then(() => null, () => null);
    return { error: 'Email or password is incorrect.' };
  }
  await supabase.rpc('record_sign_in_event', { p_event: 'SIGN_IN', p_email: null }).then(() => null, () => null);
  redirect('/');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.rpc('record_sign_in_event', { p_event: 'SIGN_OUT', p_email: null }).then(() => null, () => null);
  await supabase.auth.signOut();
  redirect('/login');
}
