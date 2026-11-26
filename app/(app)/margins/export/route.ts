import { createClient } from '@/lib/supabase/server';
import { EXPORT_COLUMNS, exportRow, filterLines, settingsFromRows, type MarginLineRow } from '@/lib/margin';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const channel = sp.channel === 'EBAY' ? 'EBAY' : sp.channel === 'AMAZON' ? 'AMAZON' : null;
  const supabase = await createClient();
  const [{ data: s }, { data, error }] = await Promise.all([
    supabase.from('settings').select('key, value').like('key', 'margin_%'),
    supabase.from('v_margin_lines').select('*').order('channel').order('name').limit(5000),
  ]);
  if (error) return new Response(error.message, { status: 400 });
  const settings = settingsFromRows(s ?? []);
  const rows = filterLines((data ?? []) as MarginLineRow[], { channel, company: sp.company?.toUpperCase() || null });
  const body = [EXPORT_COLUMNS.join(','), ...rows.map((r) => { const x = exportRow(r, settings); return EXPORT_COLUMNS.map((c) => cell(x[c])).join(','); })].join('\n');
  const name = ['margins', channel?.toLowerCase(), sp.company?.toLowerCase()].filter(Boolean).join('-');
  return new Response('﻿' + body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` },
  });
}
