'use client';
import { useActionState } from 'react';
import { changePassword } from './actions';

export default function AccountPage() {
  const [s, action, pending] = useActionState(changePassword, null);
  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-semibold">My account</h1>
      <form action={action} className="card space-y-3">
        <h2 className="font-medium">Change password</h2>
        <label className="block"><span className="label">New password</span><input className="input" type="password" name="password" autoComplete="new-password" required /></label>
        <label className="block"><span className="label">Repeat it</span><input className="input" type="password" name="confirm" autoComplete="new-password" required /></label>
        <button className="btn" disabled={pending}>{pending ? 'Saving…' : 'Change password'}</button>
        {s?.error && <p className="text-sm text-red-600">{s.error}</p>}
        {s?.ok && <p className="text-sm text-emerald-600">{s.status}</p>}
      </form>
    </div>
  );
}
