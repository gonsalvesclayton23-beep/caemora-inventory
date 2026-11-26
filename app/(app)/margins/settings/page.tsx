import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MarginSettingsForm } from '../forms';
import { marginSettings } from '../data';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Margin fees and ROI target' };

export default async function MarginSettingsPage() {
  const me = await getProfile();
  const admin = isAdmin(me);
  const supabase = await createClient();
  const [{ rows }, { data: history }] = await Promise.all([
    marginSettings(),
    supabase.from('v_settings_history').select('*').like('key', 'margin_%').order('changed_at', { ascending: false }).limit(100),
  ]);
  const label = new Map(rows.map((r) => [r.key, (r.description ?? r.key).replace(/^Margins: /, '')]));
  return (
    <div className="space-y-4">
      <Link href="/margins" className="text-sm text-slate-500 hover:underline">← Margins</Link>
      <h1 className="text-2xl font-semibold">Fees and ROI target</h1>
      <p className="text-sm text-slate-500">Used by every margin line. A change recalculates all lines straight away. {admin ? '' : 'Only an admin can change these.'}</p>
      <div className="card"><MarginSettingsForm rows={rows.map((r) => ({ ...r, value: Number(r.value) }))} canEdit={admin} /></div>
      <div className="card">
        <h2 className="mb-2 font-medium">Changes</h2>
        {history?.length ? (
          <table className="table">
            <thead><tr><th>When</th><th>Who</th><th>Setting</th><th className="num">Old</th><th className="num">New</th></tr></thead>
            <tbody>{history.map((h: any) => (
              <tr key={h.id}>
                <td className="whitespace-nowrap">{new Date(h.changed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</td>
                <td>{h.changed_by_name ?? '—'}</td><td>{label.get(h.key) ?? h.key}</td><td className="num">{h.old_value}</td><td className="num">{h.new_value}</td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="text-sm text-slate-500">No changes yet.</p>}
      </div>
    </div>
  );
}
