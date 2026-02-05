import Sidebar from '@/app/components/Sidebar';
import { getRole } from '@/lib/auth';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const role = await getRole();

  const adminContent = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Admin Quick Links</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Link href="/admin/dashboard" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">Dashboard</div>
            <div className="text-xs text-zinc-600">System metrics</div>
          </Link>
          <Link href="/admin/users" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">Users</div>
            <div className="text-xs text-zinc-600">Create/manage users</div>
          </Link>
          <Link href="/admin/shifts" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">Shifts</div>
            <div className="text-xs text-zinc-600">All shifts + edit</div>
          </Link>
          <Link href="/admin/payrolls" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">Payrolls</div>
            <div className="text-xs text-zinc-600">Generate + apply bonuses</div>
          </Link>
          <Link href="/admin/bonus-rules" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">Bonus Rules</div>
            <div className="text-xs text-zinc-600">Create/manage bonuses</div>
          </Link>
          <Link href="/admin/kpi-snapshots" className="rounded border bg-blue-50 p-3 hover:bg-blue-100 transition">
            <div className="text-sm font-medium">KPI Snapshots</div>
            <div className="text-xs text-zinc-600">Log chatter metrics</div>
          </Link>
        </div>
      </div>
      <div className="rounded border bg-amber-50 p-4">
        <div className="text-sm font-medium text-amber-900">Pro Tips</div>
        <ul className="mt-2 text-xs text-amber-800 space-y-1">
          <li>• Create users first, then assign to supervisors</li>
          <li>• Set up bonus rules before generating payrolls</li>
          <li>• View recent activity on the Dashboard</li>
        </ul>
      </div>
    </div>
  );

  const supervisorContent = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Supervisor Quick Links</h2>
        <div className="grid grid-cols-2 gap-3">
          <Link href="/supervisor/dashboard" className="rounded border bg-purple-50 p-3 hover:bg-purple-100 transition">
            <div className="text-sm font-medium">Dashboard</div>
            <div className="text-xs text-zinc-600">Team KPIs</div>
          </Link>
          <Link href="/supervisor/shifts" className="rounded border bg-purple-50 p-3 hover:bg-purple-100 transition">
            <div className="text-sm font-medium">Shift Approvals</div>
            <div className="text-xs text-zinc-600">Pending shifts</div>
          </Link>
          <Link href="/supervisor/payrolls" className="rounded border bg-purple-50 p-3 hover:bg-purple-100 transition">
            <div className="text-sm font-medium">Payroll Approvals</div>
            <div className="text-xs text-zinc-600">Approve + mark paid</div>
          </Link>
        </div>
      </div>
      <div className="rounded border bg-emerald-50 p-4">
        <div className="text-sm font-medium text-emerald-900">Workflow</div>
        <ol className="mt-2 text-xs text-emerald-800 space-y-1">
          <li>1. Approve shifts from your team</li>
          <li>2. Admin generates payrolls</li>
          <li>3. Approve payrolls (with bonuses applied)</li>
          <li>4. Mark as paid</li>
        </ol>
      </div>
    </div>
  );

  const chatterContent = (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Chatter Quick Links</h2>
        <div className="grid grid-cols-1 gap-3">
          <Link href="/shifts" className="rounded border bg-green-50 p-3 hover:bg-green-100 transition">
            <div className="text-sm font-medium">My Shifts</div>
            <div className="text-xs text-zinc-600">Clock in/out + history</div>
          </Link>
        </div>
      </div>
      <div className="rounded border bg-blue-50 p-4">
        <div className="text-sm font-medium text-blue-900">Getting Started</div>
        <ul className="mt-2 text-xs text-blue-800 space-y-1">
          <li>• Click &quot;Clock In&quot; to start your shift</li>
          <li>• Enter break minutes and notes at clock-out</li>
          <li>• Your shifts go to supervisor for approval</li>
          <li>• Approved shifts roll into payroll</li>
        </ul>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Mission Control v0</h1>
          <p className="mt-1 text-sm text-zinc-600">OnlyFans Agency CRM — Shifts, Payroll, Bonuses</p>
        </div>

        {role === 'admin' && adminContent}
        {role === 'supervisor' && supervisorContent}
        {role === 'chatter' && chatterContent}

        {!role && (
          <div className="rounded border bg-yellow-50 p-4 text-sm text-yellow-800">
            <div className="font-medium">Not signed in</div>
            <p className="mt-1">Please log in to access Dashboard v0.</p>
          </div>
        )}
      </main>
    </div>
  );
}
