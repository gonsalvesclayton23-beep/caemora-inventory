'use client';
import { useEffect, useRef, useState } from 'react';
import { compareWithWise, rateLine } from '@/lib/fx';

interface Point { date: string; inrPerGbp: number }

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** UI-04: today's £→₹ rate, next to this month's Wise rate; click for the last 30 days. */
export function FxCard({ latest, label, updated, wise, wiseMonth, history }: {
  latest: Point | null; label: string; updated: string | null; wise: number | null; wiseMonth: string; history: Point[];
}) {
  const [open, setOpen] = useState(false);
  if (!latest) {
    return (
      <div className="card text-sm text-slate-500">
        <div className="text-slate-700 dark:text-slate-300">Today's £ to ₹ rate</div>
        Not fetched yet. It is collected once a day from the European Central Bank.
      </div>
    );
  }
  const cmp = wise ? compareWithWise(latest.inrPerGbp, wise) : null;
  return (
    <div className="card">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left" aria-expanded={open}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-sm text-slate-500">Today's £ to ₹ rate · {label}</div>
            <div className="text-2xl font-semibold tabular-nums">{rateLine(latest)}</div>
          </div>
          <div className="text-right text-sm">
            <div className="text-slate-500">{wiseMonth} Wise rate</div>
            <div className="tabular-nums">{wise ? `₹${wise.toFixed(2)}` : 'No Wise payment yet this month'}</div>
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {cmp && <span className="mr-2 text-slate-700 dark:text-slate-300">{cmp.text}</span>}
          Source: European Central Bank{updated && ` · updated ${updated}`} · {open ? 'hide' : 'show'} last 30 days
        </div>
      </button>
      {open && <RateChart points={history} />}
      <p className="mt-2 text-xs text-slate-500">Purchases invoiced from 25 Nov 2026 are converted at the daily rate of their invoice date.</p>
    </div>
  );
}

function RateChart({ points }: { points: Point[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  if (points.length < 2) return <p className="mt-3 text-sm text-slate-500">Not enough days yet for a chart.</p>;

  const H = 160, top = 10, bottom = 24, left = 48, right = 10;
  const vals = points.map((p) => p.inrPerGbp);
  const lo = Math.floor(Math.min(...vals) * 2) / 2, hi = Math.ceil(Math.max(...vals) * 2) / 2 || lo + 1;
  const x = (i: number) => left + (i / (points.length - 1)) * (width - left - right);
  const y = (v: number) => top + (1 - (v - lo) / (hi - lo || 1)) * (H - top - bottom);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.inrPerGbp)}`).join(' ');
  const a = active != null ? points[active] : null;

  return (
    <div ref={box} className="relative mt-3" onMouseLeave={() => setActive(null)}>
      <svg width={width} height={H} role="img" aria-label="£ to ₹ rate, last 30 days">
        {[lo, (lo + hi) / 2, hi].map((t) => (
          <g key={t}>
            <line x1={left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--chart-text)">₹{t.toFixed(1)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.date}>
            <circle cx={x(i)} cy={y(p.inrPerGbp)} r={active === i ? 5 : 3} fill="var(--series-1)" stroke="var(--chart-surface, #fff)" strokeWidth={2} />
            <rect x={x(i) - 10} y={top} width={20} height={H - top - bottom} fill="transparent" tabIndex={0}
              aria-label={`${short(p.date)}: £1 = ₹${p.inrPerGbp.toFixed(2)}`} onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} />
          </g>
        ))}
        <text x={left} y={H - 6} fontSize={11} fill="var(--chart-text)">{short(points[0].date)}</text>
        <text x={width - right} y={H - 6} fontSize={11} textAnchor="end" fill="var(--chart-text)">{short(points[points.length - 1].date)}</text>
      </svg>
      {a && active != null && (
        <div className="pointer-events-none absolute rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-md dark:border-slate-700 dark:bg-slate-900"
          style={{ left: Math.min(Math.max(x(active) - 60, 0), width - 120), top: Math.max(y(a.inrPerGbp) - 50, 0), width: 120 }}>
          <div className="text-xs text-slate-500">{short(a.date)}</div>
          <div className="font-semibold tabular-nums">₹{a.inrPerGbp.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
