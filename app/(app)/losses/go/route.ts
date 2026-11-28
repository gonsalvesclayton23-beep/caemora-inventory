import { NextResponse } from 'next/server';

/** The filter form sends the month as YYYY-MM; turn it into the page's address. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const p = new URLSearchParams();
  const m = u.searchParams.get('m');
  if (m && /^\d{4}-\d{2}$/.test(m)) p.set('month', `${m}-01`);
  for (const k of ['company', 'type', 'platform']) { const v = u.searchParams.get(k); if (v) p.set(k, v); }
  return NextResponse.redirect(new URL(`/losses?${p}`, u.origin));
}
