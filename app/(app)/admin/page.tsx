import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { AcknowledgeForm, FxRow, SettingsForm, UserRow, VatRow } from './forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/');
  const supabase = await createClient();
  const { periods, companies } = await referenceData();
  const [{ data: users }, { data: settings }, { data: fx }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, active').order('active', { ascending: true }).order('full_name'),
    supabase.from('settings').select('key, value, description').not('key', 'like', 'margin_%').order('key'),
    supabase.from('v_fx').select('month, inr_per_gbp, source').order('month', { ascending: false }),
  ]);
  const { data: vatHistory } = await supabase.from('v_company_vat_history')
    .select('id, changed_at, company_name, code, old_vat, new_vat, old_scheme, new_scheme, changed_by_name').order('changed_at', { ascending: false }).limit(20);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="card">
        <h2 className="font-medium">Users</h2>
        <p className="text-sm text-slate-500">Invite people from Supabase (Authentication → Users → Invite). They appear here as inactive; set a role and tick Active.</p>
        {(users ?? []).map((u) => <UserRow key={u.id} u={u} />)}
      </section>

      <section className="card">
        <h2 className="font-medium">Companies and Default VAT</h2>
        <p className="text-sm text-slate-500">Each company's VAT rate on sales. Only an admin can change it; every change is kept below.</p>
        {companies.map((c) => <VatRow key={c.code} c={c} />)}
        <h3 className="mt-4 text-sm font-medium">VAT changes</h3>
        {vatHistory?.length ? (
          <table className="table mt-1">
            <thead><tr><th>When</th><th>Company</th><th>Old</th><th>New</th><th>Who</th></tr></thead>
            <tbody>
              {vatHistory.map((h) => (
                <tr key={h.id}>
                  <td className="whitespace-nowrap">{new Date(h.changed_at).toLocaleString('en-GB', { timeZone: 'Europe/London', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{h.company_name ?? h.code}</td>
                  <td>{Number(h.old_vat)}%{h.old_scheme ? ` ${h.old_scheme}` : ''}</td>
                  <td>{Number(h.new_vat)}%{h.new_scheme ? ` ${h.new_scheme}` : ''}</td>
                  <td>{h.changed_by_name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-500">No VAT changes yet.</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Old flags</h2>
        <p className="text-sm text-slate-500">Mark flags from before a month as seen, e.g. everything imported from the spreadsheet. They stay in the record.</p>
        <AcknowledgeForm periods={periods} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-medium">Flag thresholds</h2>
        <SettingsForm settings={(settings ?? []).map((s: any) => ({ ...s, value: Number(s.value) }))} />
      </section>

      <section className="card">
        <h2 className="font-medium">₹ per £</h2>
        <p className="mb-2 text-sm text-slate-500">Worked out from each month’s Wise payments. Type a rate to override a month; clear it to go back.</p>
        {(fx ?? []).map((r: any) => <FxRow key={r.month} month={r.month} rate={Number(r.inr_per_gbp)} source={r.source} />)}
      </section>
    </div>
  );
}
