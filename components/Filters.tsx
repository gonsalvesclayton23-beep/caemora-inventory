import { monthLabel } from '@/lib/format';

/** GET form with month/company selects (and optional search); works without JavaScript. */
export function Filters({ periods, companies, values, search, extra }: {
  periods: { month: string; status: string }[];
  companies: { code: string; name: string }[];
  values: Record<string, string | undefined>;
  search?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <form className="flex flex-wrap items-end gap-2">
      <label><span className="label">Month</span>
        <select name="month" defaultValue={values.month ?? ''} className="input w-44">
          <option value="">All months</option>
          {periods.map((p) => <option key={p.month} value={p.month}>{monthLabel(p.month)}{p.status === 'settled' ? ' ✓' : ''}</option>)}
        </select>
      </label>
      <label><span className="label">Company</span>
        <select name="company" defaultValue={values.company ?? ''} className="input w-36">
          <option value="">All</option>
          {companies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
        </select>
      </label>
      {search && <label className="min-w-48 flex-1"><span className="label">Search</span><input name="q" defaultValue={values.q ?? ''} className="input" placeholder="Product, FNSKU, invoice…" /></label>}
      {extra}
      <button className="btn">Apply</button>
    </form>
  );
}
