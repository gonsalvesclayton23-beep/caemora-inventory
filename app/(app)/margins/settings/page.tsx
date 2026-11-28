import Link from 'next/link';
import { getProfile, isAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { MarginSettingsForm } from '../forms';
import { marginSettings } from '../data';

export const dynamic = 'force-dynamic';

const OTHER = /^margin_(shopify|onbuy|etsy)_/;
const GROUPS = [
  { title: 'Amazon, eBay and ROI target', platform: false, test: (k: string) => !OTHER.test(k) && !k.startsWith('margin_suspect_') },
  { title: 'Currency check on product cost', platform: false, test: (k: string) => k.startsWith('margin_suspect_') },
  { title: 'Shopify', platform: true, test: (k: string) => k.startsWith('margin_shopify_') },
  { title: 'OnBuy', platform: true, test: (k: string) => k.startsWith('margin_onbuy_') },
  { title: 'Etsy', platform: true, test: (k: string) => k.startsWith('margin_etsy_') },
];
export const metadata = { title: 'Product margins: fees and ROI target' };

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
      <Link href="/margins" className="text-sm text-slate-500 hover:underline">← Product margins</Link>
      <h1 className="text-2xl font-semibold">Fees and ROI target</h1>
      <p className="text-sm text-slate-500">Used by every margin line. A change recalculates all lines straight away. {admin ? '' : 'Only an admin can change these.'}</p>
      {GROUPS.map((g) => {
        const these = rows.filter((r) => g.test(r.key));
        const notSet = g.platform && these.filter((r) => /_(fee_pct|fixed_fee|payment_pct|payment_fixed)$/.test(r.key)).every((r) => Number(r.value) === 0);
        return (
          <div key={g.title} className="card space-y-2">
            <h2 className="font-medium">{g.title}{notSet && <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">Fees not set up</span>}</h2>
            <MarginSettingsForm rows={these.map((r) => ({ ...r, value: Number(r.value) }))} canEdit={admin} />
          </div>
        );
      })}
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
