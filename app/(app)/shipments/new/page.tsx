import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { firstOfMonth, referenceData } from '@/lib/data';
import NewShipmentForm from './NewShipmentForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'New shipment' };

export default async function NewShipmentPage() {
  const me = await getProfile();
  if (me.role === 'viewer') redirect('/shipments');
  const { companies, periods } = await referenceData();
  const current = firstOfMonth();
  const months = periods.some((p) => p.month === current) ? periods : [{ month: current, status: 'open' as const }, ...periods];
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">New shipment</h1>
      <p className="text-sm text-slate-500">Create the box or Amazon shipment now; add the purchases in it afterwards.</p>
      <NewShipmentForm companies={companies} months={months} defaultMonth={current} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
