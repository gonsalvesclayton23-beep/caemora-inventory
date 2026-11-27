import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { referenceData } from '@/lib/data';
import { queryLines } from '@/lib/queries';
import { PURCHASES_ALL_MONTHS_LIMIT, PURCHASES_ONE_MONTH_LIMIT } from '@/lib/limits';
import { createClient } from '@/lib/supabase/server';
import { money, monthLabel } from '@/lib/format';
import { groupByShipment, type GroupItem, type GroupShipment } from '@/lib/purchase-groups';
import { DESTINATIONS } from '@/lib/cases';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Purchases' };

type SP = Record<string, string | undefined>;

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { companies, periods } = await referenceData();
  const month = sp.month ?? (sp.q || sp.missing ? undefined : periods[0]?.month);
  // NFR-09: "All months" opens every line, not just the first few hundred
  const limit = month ? PURCHASES_ONE_MONTH_LIMIT : PURCHASES_ALL_MONTHS_LIMIT;
  const { data: lines, error } = await queryLines({ ...sp, month }, limit);
  // PUR-06 AC4: lines split across boxes, or partly boxed
  const supabase = await createClient();
  const ids = (lines ?? []).map((l) => l.id);
  const boxSummary = new Map<number, { summary: string; box_count: number; boxed_qty: number }>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase.from('v_line_boxes').select('purchase_line_id, summary, box_count, boxed_qty').in('purchase_line_id', ids.slice(i, i + 300));
    for (const b of data ?? []) boxSummary.set(b.purchase_line_id, b);
  }

  // PUR-07: group by shipment (unless the plain list is asked for)
  const grouped = sp.view !== 'list';
  const items: GroupItem[] = [];
  const shipments: GroupShipment[] = [];
  const otherMonths = new Map<number, { month: string; lines: number }[]>();
  if (grouped && ids.length) {
    for (let i = 0; i < ids.length; i += 300) {
      const { data } = await supabase.from('shipment_items').select('shipment_id, purchase_line_id, qty, short_qty').in('purchase_line_id', ids.slice(i, i + 300));
      items.push(...((data ?? []) as GroupItem[]));
    }
    const shipIds = [...new Set([...items.map((i) => i.shipment_id), ...(lines ?? []).map((l) => l.shipment_id).filter(Boolean)])] as number[];
    const names = new Map(companies.map((c) => [c.code, c.name]));
    for (let i = 0; i < shipIds.length; i += 300) {
      const { data } = await supabase.from('shipments').select('id, box_no, amazon_shipment_id, tracking_no, company_code, status, destination, created_on').in('id', shipIds.slice(i, i + 300));
      shipments.push(...(data ?? []).map((x: any) => ({ ...x, company_name: names.get(x.company_code) ?? x.company_code })));
    }
    // a shipment's lines from other months are counted on its header, not mixed into this month
    if (month && shipIds.length) {
      const shown = new Set(ids);
      const others: { shipment_id: number; purchase_line_id: number }[] = [];
      for (let i = 0; i < shipIds.length; i += 300) {
        const { data } = await supabase.from('shipment_items').select('shipment_id, purchase_line_id').in('shipment_id', shipIds.slice(i, i + 300));
        others.push(...(data ?? []).filter((x: any) => !shown.has(x.purchase_line_id)));
      }
      const otherIds = [...new Set(others.map((o) => o.purchase_line_id))];
      const monthOf = new Map<number, string>();
      for (let i = 0; i < otherIds.length; i += 300) {
        const { data } = await supabase.from('purchase_lines').select('id, period_month').in('id', otherIds.slice(i, i + 300));
        for (const x of data ?? []) monthOf.set(x.id, x.period_month);
      }
      for (const o of others) {
        const m = monthOf.get(o.purchase_line_id);
        if (!m || m === month) continue;
        const list = otherMonths.get(o.shipment_id) ?? otherMonths.set(o.shipment_id, []).get(o.shipment_id)!;
        const hit = list.find((x) => x.month === m);
        if (hit) hit.lines++; else list.push({ month: m, lines: 1 });
      }
    }
  }
  const groups = grouped ? groupByShipment((lines ?? []) as any[], items, shipments, otherMonths) : [];

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
      <Filters periods={periods} companies={companies} values={{ ...sp, month }} search extra={<>{sp.missing && <input type="hidden" name="missing" value={sp.missing} />}{sp.view === 'list' && <input type="hidden" name="view" value="list" />}</>} />
      {error && <p className="text-red-600">{error.message}</p>}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Show:</span>
        <Link href={`/purchases?${new URLSearchParams(Object.entries({ ...sp, month, view: undefined }).filter(([, v]) => v) as [string, string][])}`}
          className={`rounded-full border px-3 py-1 ${grouped ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-slate-300 dark:border-slate-700'}`}>By shipment</Link>
        <Link href={`/purchases?${new URLSearchParams(Object.entries({ ...sp, month, view: 'list' }).filter(([, v]) => v) as [string, string][])}`}
          className={`rounded-full border px-3 py-1 ${!grouped ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-slate-300 dark:border-slate-700'}`}>Plain list</Link>
      </div>

      <p className="text-sm text-slate-500">
        {grouped && `${groups.filter((g) => g.shipment).length} shipments · `}{lines?.length ?? 0} lines{lines?.length === limit ? ` (first ${limit.toLocaleString('en-GB')}: narrow the filters)` : ''} · {[...totals.entries()].map(([c, t]) => money(t, c as 'INR')).join(' + ')}
      </p>

      {grouped && (
        <div className="space-y-3">
          {groups.map((g) => (
            <details key={g.shipment?.id ?? 'none'} open className="card p-0">
              <summary className="flex cursor-pointer flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
                <span>
                  <span className="font-semibold">{g.title}</span>
                  {g.shipment && (
                    <span className="ml-2 text-sm text-slate-500">
                      {[g.shipment.company_name, g.shipment.destination ? DESTINATIONS[g.shipment.destination as keyof typeof DESTINATIONS] : null,
                        g.shipment.status?.replace('_', ' '), g.shipment.tracking_no && g.shipment.amazon_shipment_id ? `tracking ${g.shipment.tracking_no}` : null].filter(Boolean).join(' · ')}
                    </span>
                  )}
                </span>
                <span className="text-sm tabular-nums">
                  {g.products} product{g.products === 1 ? '' : 's'} · {g.units.toLocaleString('en-GB')} units · {Object.entries(g.totals).map(([c, t]) => money(t, c as 'INR')).join(' + ')}
                  {g.received && <span className={`ml-2 ${g.received.includes('short') ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>{g.received}</span>}
                </span>
              </summary>
              <div className="border-t border-slate-100 px-4 pb-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs text-slate-500">
                  <span>{g.otherMonths ?? ''}</span>
                  {g.shipment && <Link href={`/shipments/${g.shipment.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">Open shipment →</Link>}
                </div>
                {/* phone: one card per product */}
                <ul className="space-y-2 md:hidden">
                  {g.rows.map((r) => (
                    <li key={r.line.id}><Link href={`/purchases/${r.line.id}`} className="block rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                      <div className="flex justify-between gap-2 text-sm"><span className="font-medium">{r.line.product_name}</span><span className="tabular-nums">{money(r.value, r.line.currency)}</span></div>
                      <div className="mt-1 text-xs text-slate-500">{r.line.company_code} · {r.units}{r.units < r.partOf ? ` of ${r.partOf}` : ''} × {money(r.line.unit_price, r.line.currency)} + {money(r.line.courier_per_unit, r.line.currency)} · {r.line.invoice_no ?? 'no invoice'} · {monthLabel(r.line.period_month)}</div>
                    </Link></li>
                  ))}
                </ul>
                <table className="table hidden md:table">
                  <thead><tr>
                    <th>Month</th><th>Co.</th><th>Product</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Courier</th>
                    <th className="num">Total</th><th>Invoice</th><th className="num">Rcvd</th>
                  </tr></thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.line.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap">{monthLabel(r.line.period_month)}</td>
                        <td>{r.line.company_code}</td>
                        <td><Link href={`/purchases/${r.line.id}`} className="hover:underline">{r.line.product_name}</Link><div className="text-xs text-slate-500">{r.line.fnsku}</div></td>
                        <td className="num">{r.units}{r.units < r.partOf && <div className="text-xs text-slate-500">of {r.partOf}</div>}</td>
                        <td className="num">{money(r.line.unit_price, r.line.currency)}</td>
                        <td className="num">{money(r.line.courier_per_unit, r.line.currency)}</td>
                        <td className="num">{money(r.value, r.line.currency)}</td>
                        <td>{r.line.invoice_no ?? <span className="text-amber-600">—</span>}</td>
                        <td className={`num ${g.shipment && r.received < r.units ? 'text-amber-600' : ''}`}>{g.shipment ? r.received : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
          {!groups.length && <p className="card text-sm text-slate-500">No purchases match these filters.</p>}
        </div>
      )}

      {/* plain list. phone: cards */}
      {!grouped && <>
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
                <td className="text-xs">{l.amazon_shipment_id ?? l.tracking_no ?? ''}<div className="text-slate-500">{l.shipment_status?.replace('_', ' ')}</div>
                  {(() => { const b = boxSummary.get(l.id); return b && (b.box_count > 1 || b.boxed_qty < l.qty) ? <div className="text-slate-600 dark:text-slate-300">{b.summary}</div> : null; })()}
                </td>
                <td className={`num ${l.received_qty < l.qty ? 'text-amber-600' : ''}`}>{l.received_qty}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
    </div>
  );
}
