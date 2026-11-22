import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { referenceData } from '@/lib/data';
import { queryLines } from '@/lib/queries';
import { money, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Purchases' };

type SP = Record<string, string | undefined>;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { companies, periods } = await referenceData();
  const month = sp.month ?? (sp.q || sp.missing ? undefined : periods[0]?.month);
  const { data: lines, error } = await queryLines({ ...sp, month });

  const totals = new Map<string, number>();
  for (const l of lines ?? []) totals.set(l.currency, (totals.get(l.currency) ?? 0) + Number(l.line_total));
  const exportQs = new URLSearchParams(Object.entries({ ...sp, month }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Purchases</h1>
        <div className="flex gap-2">
          <a className="btn-ghost border border-slate-300 dark:border-slate-700" href={`/purchases/export?${exportQs}`}>Export CSV</a>
          <Link className="btn" href="/purchases/new">+ New purchase</Link>
        </div>
      </div>
      {sp.saved && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Saved {sp.saved} line{sp.saved === '1' ? '' : 's'}.</p>}
      {sp.missing && <p className="text-sm text-amber-700">Showing lines without an invoice {sp.missing === 'date' ? 'date' : 'number'}. Open a line to add it. <a className="underline" href="/purchases">Clear</a></p>}
      <Filters periods={periods} companies={companies} values={{ ...sp, month }} search extra={sp.missing ? <input type="hidden" name="missing" value={sp.missing} /> : undefined} />
      {error && <p className="text-red-600">{error.message}</p>}

      <p className="text-sm text-slate-500">
        {lines?.length ?? 0} lines{lines?.length === 500 ? ' (first 500, so narrow the filters)' : ''} · {[...totals.entries()].map(([c, t]) => money(t, c as 'INR')).join(' + ')}
      </p>

      {/* phone: cards */}
      <ul className="space-y-2 md:hidden">
        {(lines ?? []).map((l) => (
          <li key={l.id}><Link href={`/purchases/${l.id}`} className="card block">
            <div className="flex justify-between gap-2 text-sm"><span className="font-medium">{l.product_name}</span><span className="tabular-nums">{money(l.line_total, l.currency)}</span></div>
            <div className="mt-1 text-xs text-slate-500">{l.company_code} · {l.qty} × {money(l.unit_price, l.currency)} + {money(l.courier_per_unit, l.currency)} · {l.invoice_no ?? 'no invoice'} · {monthLabel(l.period_month)}</div>
          </Link></li>
        ))}
      </ul>

      {/* desktop: table */}
      <div className="card hidden overflow-x-auto md:block">
        <table className="table">
          <thead><tr>
            <th>Month</th><th>Co.</th><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Courier</th>
            <th className="num">Total</th><th>Invoice</th><th>Shipment</th><th className="num">Rcvd</th>
          </tr></thead>
          <tbody>
            {(lines ?? []).map((l) => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="whitespace-nowrap">{monthLabel(l.period_month)}</td>
                <td>{l.company_code}</td>
                <td><Link href={`/purchases/${l.id}`} className="hover:underline">{l.product_name}</Link><div className="text-xs text-slate-500">{l.fnsku}</div></td>
                <td className="num">{l.qty}</td>
                <td className="num">{money(l.unit_price, l.currency)}</td>
                <td className="num">{money(l.courier_per_unit, l.currency)}</td>
                <td className="num">{money(l.line_total, l.currency)}</td>
                <td>{l.invoice_no ?? <span className="text-amber-600">—</span>}</td>
                <td className="text-xs">{l.amazon_shipment_id ?? l.tracking_no ?? ''}<div className="text-slate-500">{l.shipment_status?.replace('_', ' ')}</div></td>
                <td className={`num ${l.received_qty < l.qty ? 'text-amber-600' : ''}`}>{l.received_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
