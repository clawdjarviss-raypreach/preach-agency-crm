import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  // Get global system stats
  const [
    userCount,
    creatorCount,
    activeAssignments,
    totalShifts,
    pendingShifts,
    approvedShifts,
    deniedShifts,
    totalPayrolls,
    draftPayrolls,
    approvedPayrolls,
    paidPayrolls,
    totalKpiSnapshots,
    bonusRuleCount,
    recentShifts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.creator.count(),
    prisma.chatterCreator.count({ where: { unassignedAt: null } }),
    prisma.shift.count(),
    prisma.shift.count({ where: { approvedAt: null } }),
    prisma.shift.count({ where: { approvedAt: { not: null } } }),
    prisma.shift.count({ where: { notes: { contains: '[DENIED]' } } }),
    prisma.payroll.count(),
    prisma.payroll.count({ where: { status: 'draft' } }),
    prisma.payroll.count({ where: { status: 'approved' } }),
    prisma.payroll.count({ where: { status: 'paid' } }),
    prisma.kpiSnapshot.count(),
    prisma.bonusRule.count(),
    prisma.shift.findMany({
      orderBy: { clockIn: 'desc' },
      take: 10,
      include: {
        chatter: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
  ]);

  const deniedCount = deniedShifts;

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">System-wide metrics and activity.</p>
        </div>

        {/* System Overview */}
        <div className="grid grid-cols-2 gap-4 mb-8 md:grid-cols-4 lg:grid-cols-5">
          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Users</div>
            <div className="mt-2 text-2xl font-semibold">{userCount}</div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Creators</div>
            <div className="mt-2 text-2xl font-semibold">{creatorCount}</div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Active Assignments</div>
            <div className="mt-2 text-2xl font-semibold">{activeAssignments}</div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Bonus Rules</div>
            <div className="mt-2 text-2xl font-semibold">{bonusRuleCount}</div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">KPI Snapshots</div>
            <div className="mt-2 text-2xl font-semibold">{totalKpiSnapshots}</div>
          </div>
        </div>

        {/* Shifts Breakdown */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Shifts</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Total</div>
              <div className="mt-2 text-2xl font-semibold">{totalShifts}</div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Pending</div>
              <div className="mt-2 text-2xl font-semibold text-amber-600">
                {pendingShifts}
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Approved</div>
              <div className="mt-2 text-2xl font-semibold text-emerald-600">
                {approvedShifts}
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Denied</div>
              <div className="mt-2 text-2xl font-semibold text-red-600">
                {deniedCount}
              </div>
            </div>
          </div>
        </div>

        {/* Payrolls Breakdown */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Payrolls</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Total</div>
              <div className="mt-2 text-2xl font-semibold">{totalPayrolls}</div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Draft</div>
              <div className="mt-2 text-2xl font-semibold text-blue-600">
                {draftPayrolls}
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Approved</div>
              <div className="mt-2 text-2xl font-semibold text-purple-600">
                {approvedPayrolls}
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Paid</div>
              <div className="mt-2 text-2xl font-semibold text-teal-600">
                {paidPayrolls}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Shifts */}
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Shifts</h2>
          {recentShifts.length === 0 ? (
            <div className="rounded border bg-white p-4 text-sm text-zinc-600">
              No shifts yet.
            </div>
          ) : (
            <div className="rounded border bg-white overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Chatter</th>
                    <th className="px-3 py-2">Clock In</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Approved By</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentShifts.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 font-medium">{s.chatter.name}</td>
                      <td className="px-3 py-2 text-xs">
                        {new Date(s.clockIn).toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                            s.approvedAt
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {s.approvedAt ? 'approved' : 'pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {s.approvedBy?.name ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
