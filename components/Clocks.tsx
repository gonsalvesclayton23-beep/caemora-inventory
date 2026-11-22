'use client';
import { useEffect, useState } from 'react';
import { clockParts, INDIA_TZ, UK_TZ } from '@/lib/tz';

/** DSH-03: live UK and India clocks, from the time zones rather than the device's clock. */
export function Clocks() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

  const clocks = [
    { label: 'UK', tz: UK_TZ },
    { label: 'India', tz: INDIA_TZ },
  ];
  return (
    <div className="flex gap-2" aria-live="off">
      {clocks.map((c) => {
        const p = now ? clockParts(now, c.tz) : null;
        return (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500">{c.label}{p && <span className="ml-1">{p.zone}</span>}</div>
            <div className="text-xl font-semibold tabular-nums leading-tight">{p?.time ?? '--:--'}</div>
            <div className="text-xs text-slate-500">{p?.day ?? ' '}</div>
          </div>
        );
      })}
    </div>
  );
}
