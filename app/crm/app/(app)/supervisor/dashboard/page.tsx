import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

export const dynamic = 'force-dynamic';

export default async function SupervisorDashboardPage() {
  const email = await getActingUserEmail();
  const supervisor = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!supervisor || supervisor.role !== 'supervisor') {
    return (
      <div className="min-h-screen flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="rounded border bg-red-50 p-4 text-red-700">
            Access denied. Supervisor role required.
          </div>
        </main>
      </div>
    );
  }

  // Get team stats
  const [
    teamCount,
    pendingShiftsCount,
    approvedShiftsCount,
    draftPayrollsCount,
    approvedPayrollsCount,
    paidPayrollsCount,
    shiftsWithReport,
    shiftsWithoutReport,
    recentShifts,
    recentPayrolls,
    teamMembers,
  ] = await Promise.all([
    prisma.user.count({
      where: { supervisorId: supervisor.id, status: 'active' },
    }),
    prisma.shift.count({
      where: {
        approvedAt: null,
        chatter: { supervisorId: supervisor.id },
      },
    }),
    prisma.shift.count({
      where: {
        approvedAt: { not: null },
        chatter: { supervisorId: supervisor.id },
      },
    }),
    prisma.payroll.count({
      where: {
        status: 'draft',
        chatter: { supervisorId: supervisor.id },
      },
    }),
    prisma.payroll.count({
      where: {
        status: 'approved',
        chatter: { supervisorId: supervisor.id },
      },
    }),
    prisma.payroll.count({
      where: {
        status: 'paid',
        chatter: { supervisorId: supervisor.id },
      },
    }),
    prisma.shift.count({
      where: {
        chatter: { supervisorId: supervisor.id },
        clockOut: { not: null },
        report: { isNot: null },
      },
    }),
    prisma.shift.count({
      where: {
        chatter: { supervisorId: supervisor.id },
        clockOut: { not: null },
        report: null,
      },
    }),
    prisma.shift.findMany({
      where: { chatter: { supervisorId: supervisor.id } },
      orderBy: { clockIn: 'desc' },
      take: 10,
      include: { chatter: { select: { name: true } } },
    }),
    prisma.payroll.findMany({
      where: { chatter: { supervisorId: supervisor.id } },
      orderBy: { payPeriod: { startDate: 'desc' } },
      take: 10,
      include: {
        chatter: { select: { name: true } },
        payPeriod: true,
      },
    }),
    prisma.user.findMany({
      where: { supervisorId: supervisor.id, status: 'active' },
      orderBy: { name: 'asc' },
      include: {
        creatorAssignments: {
          where: { isPrimary: true, unassignedAt: null },
          include: { creator: { select: { displayName: true, username: true } } },
        },
        kpiSnapshots: {
          orderBy: { snapshotDate: 'desc' },
          take: 1,
          include: { creator: { select: { displayName: true, username: true } } },
        },
      },
    }),
  ]);

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Supervisor Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">Team overview & metrics.</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-8 md:grid-cols-4 lg:grid-cols-8">
          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Team Members</div>
            <div className="mt-2 text-2xl font-semibold">{teamCount}</div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Pending Shifts</div>
            <div className="mt-2 text-2xl font-semibold text-amber-600">
              {pendingShiftsCount}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Approved Shifts</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-600">
              {approvedShiftsCount}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Reports Submitted</div>
            <div className="mt-2 text-2xl font-semibold text-emerald-600">
              {shiftsWithReport}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Reports Missing</div>
            <div className="mt-2 text-2xl font-semibold text-amber-600">
              {shiftsWithoutReport}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Draft Payrolls</div>
            <div className="mt-2 text-2xl font-semibold text-blue-600">
              {draftPayrollsCount}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Approved Payrolls</div>
            <div className="mt-2 text-2xl font-semibold text-purple-600">
              {approvedPayrollsCount}
            </div>
          </div>

          <div className="rounded border bg-white p-4">
            <div className="text-xs text-zinc-600">Paid Payrolls</div>
            <div className="mt-2 text-2xl font-semibold text-teal-600">
              {paidPayrollsCount}
            </div>
          </div>
        </div>

        {/* Team Member Performance */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-3">Team Performance</h2>
          {teamMembers.length === 0 ? (
            <div className="rounded border bg-white p-4 text-sm text-zinc-600">
              No team members yet.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {teamMembers.map((member) => {
                const primaryAssignment = member.creatorAssignments[0];
                const latestKpi = member.kpiSnapshots[0];

                return (
                  <div key={member.id} className="rounded border bg-white p-4">
                    <div className="font-medium text-sm">{member.name}</div>
                    {primaryAssignment && (
                      <div className="text-xs text-zinc-600 mt-1">
                        {primaryAssignment.creator.displayName ?? primaryAssignment.creator.username}
                      </div>
                    )}
                    {latestKpi ? (
                      <div className="mt-3 space-y-1 text-xs text-zinc-700">
                        <div>
                          Revenue:{' '}
                          <span className="font-medium">
                            {latestKpi.revenueCents
                              ? `$${(latestKpi.revenueCents / 100).toFixed(2)}`
                              : '—'}
                          </span>
                        </div>
                        <div>
                          Messages:{' '}
                          <span className="font-medium">
                            {latestKpi.messagesSent ?? '—'}
                          </span>
                        </div>
                        <div className="text-zinc-500 text-xs">
                          {new Date(latestKpi.snapshotDate).toISOString().slice(0, 10)}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-xs text-zinc-400">No KPI data yet</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="grid gap-8 md:grid-cols-2">
          {/* Recent Shifts */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Recent Shifts</h2>
            {recentShifts.length === 0 ? (
              <div className="rounded border bg-white p-4 text-sm text-zinc-600">
                No shifts yet.
              </div>
            ) : (
              <div className="rounded border bg-white overflow-hidden">
                <div className="space-y-2">
                  {recentShifts.map((s) => (
                    <div key={s.id} className="border-b p-3 text-xs last:border-b-0">
                      <div className="font-medium">{s.chatter.name}</div>
                      <div className="text-zinc-500">
                        {new Date(s.clockIn).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Payrolls */}
          <div>
            <h2 className="text-lg font-semibold mb-3">Recent Payrolls</h2>
            {recentPayrolls.length === 0 ? (
              <div className="rounded border bg-white p-4 text-sm text-zinc-600">
                No payrolls yet.
              </div>
            ) : (
              <div className="rounded border bg-white overflow-hidden">
                <div className="space-y-2">
                  {recentPayrolls.map((p) => (
                    <div key={p.id} className="border-b p-3 text-xs last:border-b-0">
                      <div className="font-medium">
                        {p.chatter.name} •{' '}
                        <span
                          className={`text-xs font-semibold ${
                            p.status === 'draft'
                              ? 'text-blue-600'
                              : p.status === 'approved'
                                ? 'text-purple-600'
                                : 'text-teal-600'
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                      <div className="text-zinc-500">
                        {new Date(p.payPeriod.startDate).toISOString().slice(0, 10)} to{' '}
                        {new Date(p.payPeriod.endDate).toISOString().slice(0, 10)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
