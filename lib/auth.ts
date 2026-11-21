import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';

export type Role = 'admin' | 'data_entry' | 'viewer';
export interface Profile { id: string; full_name: string; role: Role; active: boolean; email: string | null; error: string | null }

/** The signed-in user's profile, or a redirect to /login. Cached per request. */
export const getProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data, error } = await supabase.from('profiles').select('id, full_name, role, active').eq('id', user.id).maybeSingle();
  return {
    error: error ? error.message : data ? null : 'No profile found for this login.',
    id: user.id,
    full_name: data?.full_name ?? user.email ?? 'User',
    role: (data?.role ?? 'data_entry') as Role,
    active: data?.active ?? false,
    email: user.email ?? null,
  };
});

export const canViewMoney = (p: Profile) => p.role === 'admin' || p.role === 'viewer';
export const isAdmin = (p: Profile) => p.role === 'admin';
