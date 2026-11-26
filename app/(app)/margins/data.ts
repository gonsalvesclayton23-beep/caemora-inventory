import { createClient } from '@/lib/supabase/server';
import { settingsFromRows } from '@/lib/margin';

export async function marginSettings() {
  const supabase = await createClient();
  const { data } = await supabase.from('settings').select('key, value, description').like('key', 'margin_%').order('key');
  return { settings: settingsFromRows(data ?? []), rows: (data ?? []) as { key: string; value: unknown; description: string | null }[] };
}

/** Today's ₹/£ for a new line: the latest daily rate, else the latest monthly rate (MRG-08 AC1). */
export async function todaysRate(): Promise<{ rate: number | null; date: string | null; source: 'daily' | 'monthly' | null }> {
  const supabase = await createClient();
  const { data } = await supabase.from('daily_fx_rates').select('rate_date, inr_per_gbp').order('rate_date', { ascending: false }).limit(1);
  if (data?.[0]) return { rate: Number(data[0].inr_per_gbp), date: data[0].rate_date, source: 'daily' };
  const { data: m } = await supabase.from('v_fx').select('month, inr_per_gbp').order('month', { ascending: false }).limit(1);
  return m?.[0] ? { rate: Number(m[0].inr_per_gbp), date: null, source: 'monthly' } : { rate: null, date: null, source: null };
}
