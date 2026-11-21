import { redirect } from 'next/navigation';
import { getProfile, isAdmin } from '@/lib/auth';
import { referenceData } from '@/lib/data';
import { createClient } from '@/lib/supabase/server';
import { AcknowledgeForm, FxRow, SettingsForm, UserRow } from './forms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin' };

export default async function AdminPage() {
  const me = await getProfile();
  if (!isAdmin(me)) redirect('/');
  const supabase = await createClient();
  const { periods } = await referenceData();
  const [{ data: users }, { data: settings }, { data: fx }] = await Promise.all([
    supabase.from('profiles').select('id, full_name, email, role, active').order('active', { ascending: true }).order('full_name'),
    supabase.from('settings').select('key, value, description').order('key'),
    supabase.from('v_fx').select('month, inr_per_gbp, source').order('month', { ascending: false }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Admin</h1>

      <section className="card">
        <h2 className="font-medium">Users</h2>
        <p className="text-sm text-slate-500">Invite people from Supabase (Authentication → Users → Invite). They appear here as inactive; set a role and tick Active.</p>
        {(users ?? []).map((u) => <UserRow key={u.id} u={u} />)}
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
