'use client';
import { useEffect, useRef, useState } from 'react';

export interface MonthPoint { month: string; units: number }

const label = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });

function niceMax(v: number) {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
const tick = (v: number, max: number) => (max >= 10000 ? `${(v / 1000).toLocaleString('en-GB')}K` : v.toLocaleString('en-GB'));

/** DSH-01: units ordered per month, one bar per month, hover/tap for the exact total. */
export function UnitsChart({ data }: { data: MonthPoint[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  if (!data.some((d) => d.units > 0)) {
    return <p className="py-10 text-center text-sm text-slate-500">No orders recorded yet</p>;
  }

  const H = 220, top = 12, bottom = 34, left = 44, right = 8;
  const plotW = width - left - right, plotH = H - top - bottom;
  const max = niceMax(Math.max(...data.map((d) => d.units)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const band = plotW / data.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => top + plotH - (v / max) * plotH;
  const a = active != null ? data[active] : null;

  return (
    <div ref={box} className="relative" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={H} role="img" aria-label="Units ordered per month" className="block">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-text)">{tick(t, max)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = left + band * i + band / 2;
          const h = (d.units / max) * plotH;
          const x0 = cx - barW / 2, yTop = top + plotH - h, r = Math.min(4, h);
          const showYear = i === 0 || d.month.slice(5, 7) === '01';
          return (
            <g key={d.month}>
              {active === i && <rect x={left + band * i} y={top} width={band} height={plotH} fill="var(--chart-grid)" opacity={0.5} />}
              {h > 0 && (
                <path fill="var(--series-1)"
                  d={`M${x0},${top + plotH} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${top + plotH} Z`} />
              )}
              <text x={cx} y={H - bottom + 16} textAnchor="middle" fontSize={11} fill="var(--chart-text)">{label(d.month)}</text>
              {showYear && <text x={cx} y={H - bottom + 29} textAnchor="middle" fontSize={10} fill="var(--chart-text)">{d.month.slice(0, 4)}</text>}
              {/* hit target: the whole column, bigger than the bar */}
              <rect x={left + band * i} y={top} width={band} height={plotH + bottom} fill="transparent" tabIndex={0}
                aria-label={`${label(d.month, true)}: ${d.units.toLocaleString('en-GB')} units`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      {a && active != null && (
        <div className="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: Math.min(Math.max(left + band * active + band / 2 - 70, 0), width - 140), top: Math.max(y(a.units) - 56, 0), width: 140 }}>
          <div className="text-xs text-slate-500">{label(a.month, true)}</div>
          <div className="font-semibold tabular-nums">{a.units.toLocaleString('en-GB')} units</div>
        </div>
      )}
    </div>
  );
}
