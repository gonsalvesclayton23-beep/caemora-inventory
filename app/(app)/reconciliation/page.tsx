import { redirect } from 'next/navigation';
import { canViewMoney, getProfile, isAdmin } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { dateLabel, money, monthLabel } from '@/lib/format';
import { confirmPayment, settleMonth } from './actions';
import { CreditNoteForm, PaymentForm, ReopenForm } from './forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reconciliation' };

export default async function ReconciliationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getProfile();
  if (!canViewMoney(me)) redirect('/');
  const sp = await searchParams;
  const { companies, vendors, periods } = await referenceData();
  const month = sp.month ?? periods[0]?.month;
  const vendor = vendors.find((v) => String(v.id) === sp.vendor) ?? vendors.find((v) => v.name === 'Peace Enterprises') ?? vendors[0];
  const period = periods.find((p) => p.month === month);
  const supabase = await createClient();

  const [{ data: rows }, { data: total }, { data: payments }, { data: credits }] = await Promise.all([
    supabase.from('v_reconciliation').select('*').eq('vendor_id', vendor.id).eq('period_month', month).order('company_code'),
    supabase.from('v_vendor_balance').select('*').eq('vendor_id', vendor.id).eq('period_month', month),
    supabase.from('payments').select('id, company_code, kind, amount, currency, amount_gbp, fx_rate, paid_on, method, paid_from, paid_from_company, reference, confirmed, notes')
      .eq('vendor_id', vendor.id).eq('period_month', month).order('paid_on', { nullsFirst: false }).order('id'),
    supabase.from('credit_notes').select('id, company_code, amount, currency, reason, relates_to_month').eq('vendor_id', vendor.id).eq('period_month', month).order('id'),
  ]);

  const Row = ({ r, label, bold }: { r: any; label: string; bold?: boolean }) => (
    <tr className={bold ? 'font-semibold' : ''}>
      <td>{label}</td>
      <td className="num">{money(r.opening_balance, r.currency)}</td>
      <td className="num">{money(r.purchases, r.currency)}</td>
      <td className="num">{Number(r.credit_notes) ? `−${money(r.credit_notes, r.currency)}` : ''}</td>
      <td className="num">{Number(r.payments) ? `−${money(r.payments, r.currency)}` : ''}</td>
      <td className="num text-amber-600">{Number(r.unconfirmed_payments) ? money(r.unconfirmed_payments, r.currency) : ''}</td>
      <td className={`num ${Number(r.closing_balance) < 0 ? 'text-emerald-600' : ''}`}>{money(r.closing_balance, r.currency)}</td>
    </tr>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Reconciliation</h1>
        {isAdmin(me) && period && (period.status === 'open'
          ? <form action={settleMonth}><input type="hidden" name="month" value={month} /><button className="btn">Settle {monthLabel(month!)}</button></form>
          : <ReopenForm month={month!} />)}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <label><span className="label">Month</span>
          <select name="month" defaultValue={month} className="input w-44">
            {periods.map((p) => <option key={p.month} value={p.month}>{monthLabel(p.month)}{p.status === 'settled' ? ' ✓ settled' : ''}</option>)}
          </select>
        </label>
        <label><span className="label">Supplier</span>
          <select name="vendor" defaultValue={vendor.id} className="input w-64">
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <button className="btn">Show</button>
      </form>

      <section className="card overflow-x-auto">
        <h2 className="mb-1 font-medium">{vendor.name} · {month && monthLabel(month)} {period?.status === 'settled' && <span className="text-sm font-normal text-emerald-600">✓ settled</span>}</h2>
        <p className="mb-2 text-xs text-slate-500">Closing = opening + purchases − credit notes − payments. Negative = paid in advance.</p>
        <table className="table">
          <thead><tr><th>Company</th><th className="num">Opening</th><th className="num">Purchases</th><th className="num">Credit notes</th><th className="num">Paid</th><th className="num">Unconfirmed</th><th className="num">Closing due</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r: any) => <Row key={`${r.company_code}${r.currency}`} r={r} label={r.company_code ?? 'All companies (credit notes)'} />)}
            {(total ?? []).map((t: any) => <Row key={t.currency} r={t} label={`Total ${t.currency === 'INR' ? '₹' : '£'}`} bold />)}
          </tbody>
        </table>
        {!rows?.length && <p className="text-sm text-slate-500">Nothing with this supplier this month.</p>}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-medium">Payments</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>For</th><th>From account</th><th>Kind</th><th className="num">Amount</th><th className="num">£</th><th className="num">Rate</th><th>Ref.</th><th></th></tr></thead>
          <tbody>
            {(payments ?? []).map((p: any) => {
              const onBehalf = p.paid_from_company !== p.company_code;
              return (
                <tr key={p.id} className={p.confirmed ? '' : 'text-amber-700 dark:text-amber-400'}>
                  <td className="whitespace-nowrap">{dateLabel(p.paid_on)}</td>
                  <td>{p.company_code}</td>
                  <td>{onBehalf ? <span className="rounded bg-amber-100 px-1.5 text-amber-900 dark:bg-amber-950 dark:text-amber-200">{p.paid_from_company ?? p.paid_from ?? '?'}</span> : 'own'}</td>
                  <td>{p.kind}</td>
                  <td className="num">{money(p.amount, p.currency)}</td>
                  <td className="num">{money(p.amount_gbp, 'GBP')}</td>
                  <td className="num">{p.fx_rate ?? ''}</td>
                  <td className="text-xs">{p.reference}{p.method && ` · ${p.method}`}</td>
                  <td>{!p.confirmed && isAdmin(me) && <form action={confirmPayment}><input type="hidden" name="id" value={p.id} /><button className="btn-ghost text-xs">Confirm paid</button></form>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!payments?.length && <p className="text-sm text-slate-500">No payments.</p>}
        <p className="mt-2 text-xs text-slate-500">Highlighted “from account” = paid from an account other than the company’s own.</p>
      </section>

      {!!credits?.length && (
        <section className="card">
          <h2 className="mb-2 font-medium">Credit notes</h2>
          <ul className="space-y-1 text-sm">
            {credits.map((c: any) => <li key={c.id}>{c.company_code ?? 'All companies'} · {money(c.amount, c.currency)} · {c.reason}</li>)}
          </ul>
        </section>
      )}

      {isAdmin(me) && month && (
        <div className="grid gap-4 lg:grid-cols-2">
          <PaymentForm month={month} vendorId={vendor.id} currency={vendor.default_currency} companies={companies} />
          <CreditNoteForm month={month} vendorId={vendor.id} currency={vendor.default_currency} companies={companies} periods={periods} />
        </div>
      )}
    </div>
  );
}
