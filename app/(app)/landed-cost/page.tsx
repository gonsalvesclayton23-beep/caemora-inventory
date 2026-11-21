import { redirect } from 'next/navigation';
import { Filters } from '@/components/Filters';
import { canViewMoney, getProfile } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { queryLandedCost } from '@/lib/queries';
import { money, monthLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Landed cost' };

export default async function LandedCostPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getProfile();
  if (!canViewMoney(me)) redirect('/');
  const sp = await searchParams;
  const { companies, periods } = await referenceData();
  // searching a product shows its history across months; otherwise default to the latest month
  const month = sp.month ?? (sp.q ? undefined : periods[0]?.month);
  const { data: rows, error } = await queryLandedCost({ ...sp, month });
  const qs = new URLSearchParams(Object.entries({ ...sp, month }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Landed cost</h1>
        <a className="btn-ghost border border-slate-300 dark:border-slate-700" href={`/landed-cost/export?${qs}`}>Export CSV</a>
      </div>
      <p className="text-sm text-slate-500">Product price + courier, per unit bought. ₹↔£ at each month’s actual Wise rate. “Per unit received” leaves out short and defective units.</p>
      <Filters periods={periods} companies={companies} values={{ ...sp, month }} search />
      {error && <p className="text-red-600">{error.message}</p>}
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr>
            <th>Month</th><th>Co.</th><th>Product</th><th className="num">Units</th><th className="num">Total</th>
            <th className="num">₹ / unit</th><th className="num">£ / unit</th><th className="num">Per unit received</th>
          </tr></thead>
          <tbody>
            {(rows ?? []).map((r: any) => (
              <tr key={`${r.period_month}${r.company_code}${r.product_id}${r.currency}`}>
                <td className="whitespace-nowrap">{monthLabel(r.period_month)}</td>
                <td>{r.company_code}</td>
                <td>{r.product_name}</td>
                <td className="num">{r.qty}{r.received_qty < r.qty && <span className="text-amber-600"> ({r.received_qty})</span>}</td>
                <td className="num">{money(r.total_cost, r.currency)}</td>
                <td className="num">{money(r.landed_per_unit_inr, 'INR', 2)}</td>
                <td className="num font-medium">{money(r.landed_per_unit_gbp, 'GBP', 2)}</td>
                <td className="num">{money(r.landed_per_received_unit, r.currency, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
