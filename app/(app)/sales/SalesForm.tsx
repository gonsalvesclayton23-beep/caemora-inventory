'use client';
import { useActionState } from 'react';
import type { Result } from '@/lib/data';
import { saveSales } from './actions';

const monthName = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function SalesForm({ months, companies, values }: { months: string[]; companies: { code: string; name: string }[]; values: Record<string, number> }) {
  const [s, action, pending] = useActionState<Result | null, FormData>(saveSales, null);
  return (
    <form action={action} className="space-y-3">
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Month</th>{companies.map((c) => <th key={c.code} className="num">{c.name}</th>)}</tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m}>
                <td className="whitespace-nowrap">{monthName(m)}</td>
                {companies.map((c) => {
                  const v = values[`${c.code}|${m}`];
                  return (
                    <td key={c.code} className="num">
                      <input name={`s:${c.code}:${m}`} defaultValue={v == null ? '' : v.toFixed(2)} placeholder="not entered" inputMode="decimal"
                        className="input w-32 text-right" aria-label={`${c.name}, ${monthName(m)}, sales in £`} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        {s?.error && <span className="text-sm text-red-600">{s.error}</span>}
        {s?.ok && <span className="text-sm text-emerald-600">{s.status}</span>}
      </div>
    </form>
  );
}
