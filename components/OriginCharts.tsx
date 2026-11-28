import { ORIGINS, perUnitMoney, type OriginMonth } from '@/lib/origin';
import { money } from '@/lib/format';
import { UnitsChart } from './UnitsChart';
import { CostPerUnitChart } from './CostPerUnitChart';

/** DSH-06: for India (₹) and China (£) separately: units ordered per month, then price and courier per unit, months lined up. */
export function OriginCharts({ series }: { series: Record<string, OriginMonth[]> }) {
  return (
    <div className="grid gap-4">
      {ORIGINS.map((o) => {
        const data = series[o.code] ?? [];
        const sym = o.currency === 'GBP' ? '£' : '₹';
        return (
          <section key={o.code} className="card space-y-3">
            <div>
              <h2 className="font-medium">{o.label}: units ordered and cost per unit ({sym})</h2>
              <p className="text-xs text-slate-500">{o.note}. Last 12 months. Packaging and stationery not counted.</p>
            </div>
            <div>
              <h3 className="text-sm text-slate-600 dark:text-slate-300">Units ordered per month</h3>
              <UnitsChart data={data.map((m) => ({ month: m.month, units: m.units }))} />
            </div>
            <div>
              <h3 className="text-sm text-slate-600 dark:text-slate-300">Average price and courier per unit</h3>
              <CostPerUnitChart data={data} currency={o.currency} name={o.label} />
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-slate-600 dark:text-slate-300">Monthly table</summary>
              <div className="overflow-x-auto">
                <table className="table mt-2">
                  <thead><tr><th>Month</th><th className="num">Units</th><th className="num">Goods</th><th className="num">Courier</th><th className="num">Total</th>
                    <th className="num">Price / unit</th><th className="num">Courier / unit</th><th className="num">Total / unit</th></tr></thead>
                  <tbody>
                    {[...data].reverse().map((m) => (
                      <tr key={m.month}>
                        <td>{new Date(`${m.month}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })}</td>
                        <td className="num">{m.units.toLocaleString('en-GB')}</td>
                        <td className="num">{money(m.goods, o.currency, 0)}</td><td className="num">{money(m.courier, o.currency, 0)}</td>
                        <td className="num">{money(m.goods + m.courier, o.currency, 0)}</td>
                        <td className="num">{perUnitMoney(m.price, o.currency)}</td><td className="num">{perUnitMoney(m.courierPerUnit, o.currency)}</td>
                        <td className="num font-medium">{perUnitMoney(m.total, o.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
