import Link from 'next/link';
import { getProfile, canViewMoney, isAdmin } from '@/lib/auth';
import { signOut } from '@/app/login/actions';
import { APP_NAME, NAV } from '@/lib/nav';

const ROLE_LABEL = { admin: 'Admin', data_entry: 'Data entry', viewer: 'Viewer' } as const;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getProfile();

  if (!me.active) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <div className="card max-w-sm space-y-3 text-center">
          <h1 className="text-lg font-semibold">Waiting for access</h1>
          <p className="text-sm text-slate-500">Your account ({me.email}) has been created. An admin needs to activate it before you can use the app.</p>
          {me.error && <p className="text-xs text-red-600">Could not read your profile: {me.error}</p>}
          <form action={signOut}><button className="btn-ghost">Sign out</button></form>
        </div>
      </main>
    );
  }

  const nav = NAV.filter((n) => n.who === 'all' || (n.who === 'money' ? canViewMoney(me) : isAdmin(me)));

  return (
    <div className="min-h-dvh md:flex">
      <aside className="hidden w-56 shrink-0 border-r border-slate-200 bg-white p-4 md:block dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-6 font-semibold leading-snug">{APP_NAME}</div>
        <nav className="space-y-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{n.label}</Link>
          ))}
        </nav>
        <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800">
          <div className="font-medium text-slate-700 dark:text-slate-300">{me.full_name}</div>
          <div>{ROLE_LABEL[me.role]} · <Link href="/account" className="underline">my account</Link></div>
          <form action={signOut}><button className="mt-2 underline">Sign out</button></form>
        </div>
      </aside>

      {/* phone: top bar with the remaining screens, account and sign out */}
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 text-sm md:hidden dark:border-slate-800 dark:bg-slate-900">
        <span className="truncate font-semibold">{APP_NAME}</span>
        <details className="relative">
          <summary className="cursor-pointer list-none rounded-lg px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800">{me.full_name.split(' ')[0]} ▾</summary>
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-800 dark:bg-slate-900">
            {nav.slice(5).map((n) => <Link key={n.href} href={n.href} className="block rounded px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">{n.label}</Link>)}
            <Link href="/account" className="block rounded px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800">My account</Link>
            <form action={signOut}><button className="w-full rounded px-3 py-2 text-left hover:bg-slate-100 dark:hover:bg-slate-800">Sign out</button></form>
          </div>
        </details>
      </header>

      <main className="min-w-0 flex-1 p-4 pb-24 md:p-8">{children}</main>

      {/* phone: bottom tab bar with the most-used screens */}
      <nav className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-slate-200 bg-white py-2 text-xs md:hidden dark:border-slate-800 dark:bg-slate-900">
        {nav.slice(0, 5).map((n) => (
          <Link key={n.href} href={n.href} className="px-2 py-1">{n.label}</Link>
        ))}
      </nav>
    </div>
  );
}
