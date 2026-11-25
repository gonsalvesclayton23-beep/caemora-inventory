import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { dailyRates, ECB_URL } from '@/lib/fx';

export const dynamic = 'force-dynamic';

/**
 * UI-04: fetches the ECB's last 90 days of reference rates and stores ₹ per £.
 * Run once a day by Vercel Cron (vercel.json). Only Vercel can call it: it sends CRON_SECRET,
 * and saving needs the Supabase service key, which never leaves the server (NFR-08).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Not allowed' }, { status: 401 });
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set in Vercel' }, { status: 500 });

  const res = await fetch(ECB_URL, { cache: 'no-store' });
  if (!res.ok) return NextResponse.json({ error: `ECB returned ${res.status}` }, { status: 502 });
  const rates = dailyRates(await res.text());
  if (!rates.length) return NextResponse.json({ error: 'No GBP/INR rates in the ECB file' }, { status: 502 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase.rpc('store_daily_rates', {
    p_rates: rates.map((r) => ({ date: r.date, eur_inr: r.eurInr, eur_gbp: r.eurGbp })),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ stored: data, latest: rates[0] });
}
