'use client';
import { useEffect, useRef, useState } from 'react';

const label = (iso: string, long = false) =>
  new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

/** DSH-04: one company's sales per month, last 12 months. Hover or tap a month for its figure; months not entered show a dash. */
export function SalesBars({ name, months }: { name: string; months: { month: string; amount: number | null }[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(240);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(160, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);

  const H = 72, top = 6, bottom = 16;
  const plotH = H - top - bottom;
  const max = Math.max(1, ...months.map((m) => m.amount ?? 0));
  const band = width / months.length;
  const barW = Math.max(3, Math.min(14, band - 2));     // keeps a 2px gap between bars
  const a = active != null ? months[active] : null;
  const base = top + plotH;

  return (
    <div ref={box} className="relative mt-2" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={H} role="img" aria-label={`${name}: sales per month, last 12 months`} className="block">
        <line x1={0} x2={width} y1={base} y2={base} stroke="var(--chart-grid)" strokeWidth={1} />
        {months.map((m, i) => {
          const cx = band * i + band / 2, x0 = cx - barW / 2;
          const h = m.amount ? Math.max(1, (m.amount / max) * plotH) : 0;
          const yTop = base - h, r = Math.min(4, h, barW / 2);
          const first = i === 0 || i === months.length - 1;
          return (
            <g key={m.month}>
              {active === i && <rect x={band * i} y={top} width={band} height={plotH} fill="var(--chart-grid)" opacity={0.5} />}
              {h > 0 && <path fill="var(--series-1)"
                d={`M${x0},${base} V${yTop + r} Q${x0},${yTop} ${x0 + r},${yTop} H${x0 + barW - r} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + r} V${base} Z`} />}
              {m.amount == null && <line x1={x0} x2={x0 + barW} y1={base - 2} y2={base - 2} stroke="var(--chart-text)" strokeWidth={1} strokeDasharray="2 2" />}
              {first && <text x={cx} y={H - 3} textAnchor={i === 0 ? 'start' : 'end'} dx={i === 0 ? -barW / 2 : barW / 2} fontSize={10} fill="var(--chart-text)">{label(m.month)}</text>}
              <rect x={band * i} y={0} width={band} height={H} fill="transparent" tabIndex={0}
                aria-label={`${label(m.month, true)}: ${m.amount == null ? 'not entered' : gbp(m.amount)}`}
                onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onClick={() => setActive(i)} />
            </g>
          );
        })}
      </svg>
      {a && active != null && (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: Math.min(Math.max(band * active + band / 2 - 55, 0), width - 110), top: -34, width: 110 }}>
          <div className="text-slate-500">{label(a.month, true)}</div>
          <div className="font-semibold tabular-nums">{a.amount == null ? 'Not entered' : gbp(a.amount)}</div>
        </div>
      )}
    </div>
  );
}
