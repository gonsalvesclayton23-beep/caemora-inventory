import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { getProfile } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, money } from '@/lib/format';
import { UploadButton } from './UploadButton';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Invoices' };

/** INV-03: every invoice, whether its file is uploaded, and the lines still missing invoice details. */
export default async function InvoicesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const me = await getProfile();
  const { companies, periods } = await referenceData();
  const supabase = await createClient();
  const show = sp.show ?? 'missing';

  let q = supabase.from('v_invoices')
    .select('vendor_id, vendor_name, company_code, invoice_no, invoice_date, period_month, lines, units, total_inr, total_gbp, files')
    .order('invoice_date', { ascending: false, nullsFirst: false }).order('invoice_no').limit(400);
  if (sp.month) q = q.eq('period_month', sp.month);
  if (sp.company) q = q.eq('company_code', sp.company);
  if (show === 'missing') q = q.eq('files', 0);

  const [{ data: invoices, error }, { count: noDate }, { count: noNumber }] = await Promise.all([
    q,
    supabase.from('purchase_lines').select('id', { count: 'exact', head: true }).eq('category', 'stock').is('invoice_date', null),
    supabase.from('purchase_lines').select('id', { count: 'exact', head: true }).eq('category', 'stock').is('invoice_no', null),
  ]);

  // the files themselves, for the "View" links
  const keys = (invoices ?? []).filter((i) => i.files > 0);
  const { data: files } = keys.length
    ? await supabase.from('invoice_files').select('id, vendor_id, invoice_no, company_code, file_name')
        .in('invoice_no', keys.map((k) => k.invoice_no)).order('id')
    : { data: [] };
  const filesFor = (i: { vendor_id: number; invoice_no: string; company_code: string }) =>
    (files ?? []).filter((f) => f.vendor_id === i.vendor_id && f.invoice_no === i.invoice_no && (!f.company_code || f.company_code === i.company_code));
  const canUpload = me.role !== 'viewer';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Invoices</h1>

      {(noDate ?? 0) + (noNumber ?? 0) > 0 && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Purchase lines still missing invoice details:{' '}
          <Link className="underline" href="/purchases?missing=date">{noDate ?? 0} without an invoice date</Link>
          {' · '}
          <Link className="underline" href="/purchases?missing=number">{noNumber ?? 0} without an invoice number</Link>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {[['missing', 'No file yet'], ['all', 'All invoices']].map(([v, l]) => (
          <Link key={v} href={`/invoices?${new URLSearchParams({ ...(sp as Record<string, string>), show: v })}`}
            className={`rounded-full border px-3 py-1 ${show === v ? 'border-indigo-600 text-indigo-600' : 'border-slate-300 dark:border-slate-700'}`}>{l}</Link>
        ))}
      </div>
      <Filters periods={periods} companies={companies} values={sp} extra={<input type="hidden" name="show" value={show} />} />
      {error && <p className="text-red-600">{error.message}</p>}

      <ul className="space-y-2">
        {(invoices ?? []).map((i) => (
          <li key={`${i.vendor_id}|${i.company_code}|${i.invoice_no}`} className="card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium">{i.invoice_no} <span className="text-sm font-normal text-slate-500">· {i.vendor_name} · {i.company_code}</span></div>
              <div className="text-xs text-slate-500">
                {i.invoice_date ? dateLabel(i.invoice_date) : <span className="text-amber-600">no invoice date</span>}
                {' · '}{i.lines} line{i.lines === 1 ? '' : 's'}, {i.units} units
                {i.total_inr ? ` · ${money(i.total_inr, 'INR')}` : ''}{i.total_gbp ? ` · ${money(i.total_gbp, 'GBP')}` : ''}
              </div>
              {filesFor(i).map((f) => (
                <a key={f.id} href={`/invoices/file/${f.id}`} target="_blank" rel="noopener" className="mr-3 text-sm text-indigo-600 underline">{f.file_name}</a>
              ))}
            </div>
            {canUpload && (
              <UploadButton company={i.company_code} vendorId={i.vendor_id} invoiceNo={i.invoice_no} invoiceDate={i.invoice_date}
                label={i.files > 0 ? 'Add another file' : 'Upload invoice'} />
            )}
          </li>
        ))}
      </ul>
      {invoices?.length === 0 && <p className="text-sm text-slate-500">{show === 'missing' ? 'Every invoice here has a file.' : 'No invoices.'}</p>}
    </div>
  );
}
