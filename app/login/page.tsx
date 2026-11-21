'use client';
import { useActionState } from 'react';
import { signIn } from './actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Caemora Inventory</h1>
          <p className="text-sm text-slate-500">Sign in to continue</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn w-full" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}
