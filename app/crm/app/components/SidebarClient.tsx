'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Role = 'admin' | 'supervisor' | 'chatter' | null;

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== '/' && pathname?.startsWith(href));

  return (
    <Link
      href={href}
      className={
        isActive
          ? 'block rounded-md px-3 py-2 text-sm font-semibold brand-primary'
          : 'block rounded-md px-3 py-2 text-sm text-zinc-200 hover:bg-[color:var(--brand-soft)] hover:text-white'
      }
    >
      {children}
    </Link>
  );
}

export default function SidebarClient({ role }: { role: Role }) {
  return (
    <aside className="w-64 border-r border-zinc-900 bg-black p-4 text-white">
      <div className="rounded-lg bg-[color:var(--brand-soft)]/60 px-3 py-2">
        <div className="text-sm font-semibold tracking-tight">
          <span className="text-white">Preach</span>{' '}
          <span className="text-[color:var(--brand)]">Agency</span>{' '}
          <span className="text-zinc-200">CRM</span>
        </div>
        <div className="mt-0.5 text-[11px] text-zinc-400">role: {role ?? 'none'}</div>
      </div>

      <nav className="mt-6 space-y-1">
        <NavLink href="/">Home</NavLink>
        <NavLink href="/shifts">Shifts</NavLink>
        <NavLink href="/my-stats">My Stats</NavLink>

        {role === 'admin' && (
          <>
            <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin</div>
            <NavLink href="/admin/dashboard">Dashboard</NavLink>
            <NavLink href="/admin/users">Users</NavLink>
            <NavLink href="/admin/creators">Creators</NavLink>
            <NavLink href="/admin/assignments">Assignments</NavLink>
            <NavLink href="/admin/shifts">Shifts</NavLink>
            <NavLink href="/admin/bonus-rules">Bonus Rules</NavLink>
            <NavLink href="/admin/pay-periods">Pay Periods</NavLink>
            <NavLink href="/admin/payrolls">Payrolls</NavLink>
            <NavLink href="/admin/kpi-snapshots">KPI Snapshots</NavLink>
            <Link
              className="block rounded-md px-3 py-2 text-sm brand-link hover:bg-[color:var(--brand-soft)]/60"
              href="/admin/dashboard#analytics"
            >
              Analytics
            </Link>
          </>
        )}

        {role === 'supervisor' && (
          <>
            <div className="pt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Supervisor</div>
            <NavLink href="/supervisor/dashboard">Dashboard</NavLink>
            <NavLink href="/supervisor/shifts">Shift Approvals</NavLink>
            <NavLink href="/supervisor/payrolls">Payroll Approvals</NavLink>
          </>
        )}
      </nav>

      <form action="/api/logout" method="post" className="mt-8">
        <button className="text-xs text-zinc-400 hover:text-white">Logout</button>
      </form>
    </aside>
  );
}
