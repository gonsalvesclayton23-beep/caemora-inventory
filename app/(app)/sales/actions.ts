'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { friendlyError, type Result } from '@/lib/data';
import { SALES_COMPANIES } from '@/lib/sales';

/** DSH-04: save the monthly sales grid. A cleared box removes that month's figure ("not entered"). */
export async function saveSales(_: unknown, f: FormData): Promise<Result> {
  const supabase = await createClient();
  const { data: current } = await supabase.from('company_sales').select('company_code, month, amount_gbp');
  const now = new Map((current ?? []).map((r: any) => [`${r.company_code}|${r.month}`, Number(r.amount_gbp)]));
  let changed = 0;
  for (const [key, value] of f.entries()) {
    const m = key.match(/^s:([A-Z]+):(\d{4}-\d{2}-01)$/);
    if (!m || !(SALES_COMPANIES as readonly string[]).includes(m[1])) continue;
    const [, code, month] = m;
    const raw = String(value).replace(/[£,\s]/g, '');
    const had = now.get(`${code}|${month}`);
    if (raw === '') {
      if (had == null) continue;
      const { error } = await supabase.from('company_sales').delete().eq('company_code', code).eq('month', month);
      if (error) return { error: friendlyError(error) };
      changed++;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return { error: `${code} ${month.slice(0, 7)}: enter an amount in £, e.g. 12450.00` };
    if (had === Math.round(n * 100) / 100) continue;   // only real changes go into the Audit log
    const { error } = await supabase.from('company_sales').upsert({ company_code: code, month, amount_gbp: n }, { onConflict: 'company_code,month' });
    if (error) return { error: friendlyError(error) };
    changed++;
  }
  revalidatePath('/sales');
  revalidatePath('/');
  return { ok: true, status: changed ? `Saved ${changed} change${changed === 1 ? '' : 's'}.` : 'Nothing changed.' };
}
