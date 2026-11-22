'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Supabase client in the browser, as the signed-in user. Used for direct file uploads. */
export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
