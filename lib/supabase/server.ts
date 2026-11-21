import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/** Supabase client for server components and server actions, acting as the signed-in user (RLS applies). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) cookieStore.set(name, value, options);
        } catch {
          // called from a server component: the middleware refreshes the session instead
        }
      },
    },
  });
}
