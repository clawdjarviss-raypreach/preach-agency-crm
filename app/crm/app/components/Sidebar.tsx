import Link from 'next/link';
import { getRole } from '@/lib/auth';

export default async function Sidebar() {
  const role = await getRole();

  return (
    <aside className="w-64 border-r border-zinc-800 bg-black p-4 text-white">
      <div className="text-sm font-semibold">
        <span className="text-white">Preach</span>{' '}
        <span className="text-[color:var(--brand)]">Agency</span>{' '}
        <span className="text-zinc-300">CRM</span>
      </div>
      <div className="mt-1 text-xs text-zinc-400">role: {role ?? 'none'}</div>

      <nav className="mt-6 space-y-2 text-sm">
        <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/">Home</Link>
        <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/shifts">Shifts</Link>

        {role === 'admin' && (
          <>
            <div className="pt-2 text-xs font-semibold text-zinc-500">Admin</div>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/dashboard">Dashboard</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/users">Users</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/creators">Creators</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/assignments">Assignments</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/shifts">Shifts</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/bonus-rules">Bonus Rules</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/pay-periods">Pay Periods</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/payrolls">Payrolls</Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/admin/kpi-snapshots">KPI Snapshots</Link>
          </>
        )}

        {role === 'supervisor' && (
          <>
            <div className="pt-2 text-xs font-semibold text-zinc-500">Supervisor</div>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/supervisor/dashboard">
              Dashboard
            </Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/supervisor/shifts">
              Shift Approvals
            </Link>
            <Link className="block rounded px-2 py-1 hover:bg-zinc-900" href="/supervisor/payrolls">
              Payroll Approvals
            </Link>
          </>
        )}
      </nav>

      <form action="/api/logout" method="post" className="mt-8">
        <button className="text-xs text-zinc-400 hover:text-white">Logout</button>
      </form>
    </aside>
  );
}
