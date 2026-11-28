'use client';
import { useEffect, useRef, useState } from 'react';
import { monthSummary, perUnitMoney, type OriginMonth } from '@/lib/origin';

const label = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v)), n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** DSH-06: average price and courier per unit, side by side for each month (same currency, one axis). */
export function CostPerUnitChart({ data, currency, name }: { data: OriginMonth[]; currency: string; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (!data.some((d) => d.units > 0)) return <p className="py-6 text-center text-sm text-slate-500">No orders in these 12 months</p>;

  const H = 180, top = 12, bottom = 22, left = 44, right = 8;   // same left margin as the units chart, so the months line up
  const plotW = width - left - right, plotH = H - top - bottom;
  const max = niceMax(Math.max(...data.map((d) => Math.max(d.price ?? 0, d.courierPerUnit ?? 0))));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const band = plotW / data.length;
  const barW = Math.max(3, Math.min(14, (band - 8) / 2));
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const bar = (x0: number, v: number | null, fill: string) => {
    if (!v) return null;
    const h = (v / max) * plotH, yTop = top + plotH - h, r = Math.min(4, h, barW / 2);
    return <path fill={fill} d={`M${x0},${top + plotH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${top + plotH} Z`} />;
  };
  const a = active != null ? data[active] : null;

  return (
    <div ref={box} className="relative" onMouseLeave={() => setActive(null)}>
      <div className="mb-1 flex gap-4 text-xs text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-1)' }} />Price per unit</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: 'var(--series-2)' }} />Courier per unit</span>
      </div>
      <svg width={width} height={H} role="img" aria-label={`${name}: price and courier per unit, per month`} className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-text)">{perUnitMoney(t, currency)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + band * i + band / 2;
          return (
            <g key={d.month}>
              {active === i && <rect x={left + band * i} y={top} width={band} height={plotH} fill="var(--chart-grid)" opacity={0.5} />}
              {bar(cx - barW - 1, d.price, 'var(--series-1)')}
              {bar(cx + 1, d.courierPerUnit, 'var(--series-2)')}
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--chart-text)">{label(d.month)}</text>
              <rect x={left + band * i} y={top} width={band} height={plotH + bottom} fill="transparent" tabIndex={0} aria-label={monthSummary(d, currency)}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      {a && active != null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: Math.min(Math.max(left + band * active + band / 2 - 95, 0), width - 190), top: 0, width: 190 }}>
          <div className="text-xs text-slate-500">{new Date(`${a.month}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</div>
          {a.units ? <>
            <div className="tabular-nums">{a.units.toLocaleString('en-GB')} units</div>
            <div className="flex justify-between tabular-nums"><span>Price</span><span>{perUnitMoney(a.price, currency)}/unit</span></div>
            <div className="flex justify-between tabular-nums"><span>Courier</span><span>{perUnitMoney(a.courierPerUnit, currency)}/unit</span></div>
            <div className="flex justify-between font-semibold tabular-nums"><span>Total</span><span>{perUnitMoney(a.total, currency)}/unit</span></div>
          </> : <div>No orders</div>}
        </div>
      )}
    </div>
  );
}
