import { TICKER_COMPANIES, TICKER_PLATFORMS } from '@/lib/ticker';

/**
 * DSH-05: the four companies moving across the top of the dashboard, in a loop. Pauses while the pointer is over it,
 * and stands still for anyone who has turned off motion on their device. Logos sit on a light pill so they read in dark mode too.
 */
export function CompanyTicker() {
  // the list is repeated so the strip is always full; the two halves are identical, so moving by half loops seamlessly
  // DSH-07: the companies, then the platforms we sell on
  const items: { name: string; logo?: string; withName?: boolean }[] = [...TICKER_COMPANIES, ...TICKER_PLATFORMS];
  const run = [...items, ...items];
  const half = (key: string, hidden: boolean) => (
    <ul className="cims-ticker-half" aria-hidden={hidden || undefined} key={key}>
      {run.map((c, i) => (
        <li key={`${key}${i}`} className="cims-ticker-item">
          {c.logo && 'withName' in c && c.withName
            ? <span className="flex h-20 items-center gap-2 rounded-lg bg-white px-4 shadow-sm"><img src={c.logo} alt="" className="h-10 w-10" /><span className="text-xl font-semibold text-slate-900">{c.name}</span></span>
            : c.logo && c.logo.endsWith('.svg')
            ? <span className="flex h-20 items-center rounded-lg bg-white px-5 shadow-sm"><img src={c.logo} alt={hidden ? '' : c.name} className="h-12 w-auto" /></span>
            : c.logo
            ? <span className="flex h-20 items-center rounded-lg bg-white px-3 shadow-sm"><img src={c.logo} alt={hidden ? '' : c.name} className="h-[4.25rem] w-auto" /></span>
            : <span className="flex h-20 items-center rounded-lg bg-white px-5 text-xl font-semibold tracking-wide text-slate-900 shadow-sm">{c.name}</span>}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="cims-ticker card overflow-hidden p-2" role="region" aria-label={`Our companies and the platforms we sell on: ${items.map((c) => c.name).join(', ')}`}>
      <style>{`
        @keyframes cims-ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .cims-ticker-track { display: flex; width: max-content; animation: cims-ticker 60s linear infinite; }
        .cims-ticker:hover .cims-ticker-track { animation-play-state: paused; }
        .cims-ticker-half { display: flex; align-items: center; gap: 2.5rem; padding-right: 2.5rem; }
        .cims-ticker-item { flex: none; }
        @media (prefers-reduced-motion: reduce) { .cims-ticker-track { animation: none; } }
      `}</style>
      <div className="cims-ticker-track">{half('a', false)}{half('b', true)}</div>
    </div>
  );
}
