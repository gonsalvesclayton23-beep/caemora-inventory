'use client';
import { useEffect, useRef, useState } from 'react';
import { chartScales, monthSummary, perUnitMoney, type OriginMonth } from '@/lib/origin';

const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
const unitsTick = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('en-GB')}K` : v.toLocaleString('en-GB'));

/**
 * DSH-06: one chart per country, three bars a month: units ordered (left scale), and price and courier per unit
 * (right scale, in the country's currency). Clayton chose two scales (28 Nov 2026); the legend says which bar uses which.
 */
export function OriginChart({ data, currency, name }: { data: OriginMonth[]; currency: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (!data.some((d) => d.units > 0)) return <p className="py-8 text-center text-sm text-slate-500">No orders in these 12 months</p>;

  const sym = currency === 'GBP' ? '£' : '₹';
  const { unitsMax, moneyMax } = chartScales(data);
  const H = 250, top = 24, bottom = 34, left = 44, right = 48;
  const plotW = width - left - right, plotH = H - top - bottom, base = top + plotH;
  const band = plotW / data.length;
  const barW = Math.max(3, Math.min(12, (band - 10) / 3));     // three bars and 2px gaps fit in each month
  const fracs = [0, 0.2, 0.4, 0.6, 0.8, 1];   // fifths keep both scales round (2K, 4K… and ₹50, ₹100…)
  const bar = (x0: number, h: number, fill: string) => {
    if (!(h > 0)) return null;
    const yTop = base - h, r = Math.min(4, h, barW / 2);
    return <path fill={fill} d={`M${x0},${base} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${base} Z`} />;
  };
  const a = active != null ? data[active] : null;

  return (
    <div ref={box} className="relative" onMouseLeave={() => setActive(null)}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-3)' }} />Units ordered (left scale)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-1)' }} />Price per unit (right scale, {sym})</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-2)' }} />Courier per unit (right scale, {sym})</span>
      </div>
      <svg width={width} height={H} role="img" aria-label={`${name}: units ordered, price per unit and courier per unit, per month`} className="block">
        {fracs.map((f) => {
          const y = base - f * plotH;
          return (
            <g key={f}>
              <line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
              <text x={left - 6} y={y} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-text)">{unitsTick(f * unitsMax)}</text>
              <text x={width - right + 6} y={y} dy="0.32em" textAnchor="start" fontSize={11} fill="var(--chart-text)">{perUnitMoney(f * moneyMax, currency)}</text>
            </g>
          );
        })}
        <text x={left - 6} y={top - 13} textAnchor="end" fontSize={10} fill="var(--chart-text)">Units</text>
        <text x={width - right + 6} y={top - 13} textAnchor="start" fontSize={10} fill="var(--chart-text)">{sym} / unit</text>
        {data.map((d, i) => {
          const cx = left + band * i + band / 2, x0 = cx - (3 * barW + 4) / 2;
          const showYear = i === 0 || d.month.slice(5, 7) === '01';
          return (
            <g key={d.month}>
              {active === i && <rect x={left + band * i} y={top} width={band} height={plotH} fill="var(--chart-grid)" opacity={0.5} />}
              {bar(x0, (d.units / unitsMax) * plotH, 'var(--series-3)')}
              {bar(x0 + barW + 2, ((d.price ?? 0) / moneyMax) * plotH, 'var(--series-1)')}
              {bar(x0 + 2 * (barW + 2), ((d.courierPerUnit ?? 0) / moneyMax) * plotH, 'var(--series-2)')}
              <text x={cx} y={H - bottom + 16} textAnchor="middle" fontSize={11} fill="var(--chart-text)">{label(d.month)}</text>
              {showYear && <text x={cx} y={H - bottom + 29} textAnchor="middle" fontSize={10} fill="var(--chart-text)">{d.month.slice(0, 4)}</text>}
              <rect x={left + band * i} y={top} width={band} height={plotH + bottom} fill="transparent" tabIndex={0} aria-label={monthSummary(d, currency)}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      {a && active != null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: Math.min(Math.max(left + band * active + band / 2 - 95, 0), width - 190), top: 24, width: 190 }}>
          <div className="text-xs text-slate-500">{new Date(`${a.month}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
          {a.units ? <>
            <div className="flex justify-between tabular-nums"><span>Units</span><span>{a.units.toLocaleString('en-GB')}</span></div>
            <div className="flex justify-between tabular-nums"><span>Price</span><span>{perUnitMoney(a.price, currency)}/unit</span></div>
            <div className="flex justify-between tabular-nums"><span>Courier</span><span>{perUnitMoney(a.courierPerUnit, currency)}/unit</span></div>
            <div className="flex justify-between font-semibold tabular-nums"><span>Total</span><span>{perUnitMoney(a.total, currency)}/unit</span></div>
          </> : <div>No orders</div>}
        </div>
      )}
    </div>
  );
}
