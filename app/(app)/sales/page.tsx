import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { referenceData } from '@/lib/data';
import { last12Months, SALES_COMPANIES } from '@/lib/sales';
import { UK_TZ } from '@/lib/tz';
import { SalesForm } from './SalesForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Enter sales' };

/** DSH-04: an admin types each company's monthly sales (£, including VAT, all platforms together). */
export default async function SalesPage() {
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/');
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: UK_TZ }).format(new Date());
  // the last 24 months, newest first: this year for the dashboard, and last year to compare later
  const prevYear = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const months = [...last12Months(prevYear), ...last12Months(today)].reverse();
  const { companies: all } = await referenceData();
  const companies = SALES_COMPANIES.map((code) => ({ code, name: all.find((c) => c.code === code)?.name ?? code }));
  const supabase = await createClient();
  const { data } = await supabase.from('company_sales').select('company_code, month, amount_gbp').gte('month', months.at(-1)!);
  const values = Object.fromEntries((data ?? []).map((r: any) => [`${r.company_code}|${r.month}`, Number(r.amount_gbp)]));

  return (
    <div className="space-y-4">
      <Link href="/" className="text-sm text-slate-500 hover:underline">← Dashboard</Link>
      <h1 className="text-2xl font-semibold">Enter sales</h1>
      <p className="text-sm text-slate-500">
        Each company&apos;s total sales for the month, in £ including VAT, across Amazon, eBay and every other platform it sells on.
        Leave a box empty if it is not known yet. Every change is kept in the Audit log.
      </p>
      <SalesForm months={months} companies={companies} values={values} />
    </div>
  );
}
