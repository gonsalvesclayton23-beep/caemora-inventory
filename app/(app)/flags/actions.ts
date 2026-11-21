'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function setFlagStatus(form: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const status = String(form.get('status'));
  if (!['acknowledged', 'resolved'].includes(status)) return;
  await supabase.from('flags').update({
    status,
    resolved_by: status === 'resolved' ? user?.id : null,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', Number(form.get('id')));
  revalidatePath('/flags');
  revalidatePath('/');
}
