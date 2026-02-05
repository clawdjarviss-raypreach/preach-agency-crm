import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatHoursFromMinutes(minutes: number): string {
  const hours = minutes / 60;
  return `${hours.toFixed(1)}h`;
}

function isoDayUTC(d: Date): string {
  // yyyy-mm-dd in UTC (stable for grouping snapshots + shifts)
  return d.toISOString().split('T')[0];
}

export default async function AdminDashboardPage() {
  const now = new Date();

  // Use UTC cutoffs to avoid off-by-one day grouping across timezones.
  const start14dUTC = new Date(now);
  start14dUTC.setUTCDate(now.getUTCDate() - 13);
  start14dUTC.setUTCHours(0, 0, 0, 0);

  const start7dUTC = new Date(now);
  start7dUTC.setUTCDate(now.getUTCDate() - 6);
  start7dUTC.setUTCHours(0, 0, 0, 0);

  // Get global system stats + analytics input data
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
    kpiSnapshots14d,
    shifts14d,
    chatters,
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
        chatter: { select: { id: true, name: true } },
        approvedBy: { select: { name: true } },
      },
    }),
    prisma.kpiSnapshot.findMany({
      where: { snapshotDate: { gte: start14dUTC } },
      select: {
        snapshotDate: true,
        revenueCents: true,
        tipsReceivedCents: true,
        chatterId: true,
      },
    }),
    prisma.shift.findMany({
      where: {
        clockIn: { gte: start14dUTC },
        clockOut: { not: null },
      },
      select: {
        chatterId: true,
        clockIn: true,
        clockOut: true,
        breakMinutes: true,
      },
    }),
    prisma.user.findMany({
      where: { role: 'chatter' },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const deniedCount = deniedShifts;

  // --- Analytics (MVP) ---
  // 14-day daily totals: revenue/tips + hours
  const dayKeys: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start14dUTC);
    d.setUTCDate(start14dUTC.getUTCDate() + i);
    dayKeys.push(isoDayUTC(d));
  }

  const revenueByDay = new Map<string, number>();
  const tipsByDay = new Map<string, number>();
  for (const k of dayKeys) {
    revenueByDay.set(k, 0);
    tipsByDay.set(k, 0);
  }

  for (const s of kpiSnapshots14d) {
    const k = isoDayUTC(new Date(s.snapshotDate));
    revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + (s.revenueCents ?? 0));
    tipsByDay.set(k, (tipsByDay.get(k) ?? 0) + (s.tipsReceivedCents ?? 0));
  }

  const workedMinutesByDay = new Map<string, number>();
  for (const k of dayKeys) workedMinutesByDay.set(k, 0);

  for (const sh of shifts14d) {
    const k = isoDayUTC(new Date(sh.clockIn));
    const clockIn = new Date(sh.clockIn).getTime();
    const clockOut = new Date(sh.clockOut!).getTime();
    const minutes = Math.max(0, Math.floor((clockOut - clockIn) / 60000) - (sh.breakMinutes ?? 0));
    workedMinutesByDay.set(k, (workedMinutesByDay.get(k) ?? 0) + minutes);
  }

  // Quick 7d vs previous 7d summary
  let revenueLast7 = 0;
  let revenuePrev7 = 0;
  let tipsLast7 = 0;
  let tipsPrev7 = 0;
  for (const s of kpiSnapshots14d) {
    const isLast7 = new Date(s.snapshotDate) >= start7dUTC;
    if (isLast7) {
      revenueLast7 += s.revenueCents ?? 0;
      tipsLast7 += s.tipsReceivedCents ?? 0;
    } else {
      revenuePrev7 += s.revenueCents ?? 0;
      tipsPrev7 += s.tipsReceivedCents ?? 0;
    }
  }

  let workedMinutesLast7 = 0;
  let workedMinutesPrev7 = 0;
  for (const sh of shifts14d) {
    const isLast7 = new Date(sh.clockIn) >= start7dUTC;
    const clockIn = new Date(sh.clockIn).getTime();
    const clockOut = new Date(sh.clockOut!).getTime();
    const minutes = Math.max(0, Math.floor((clockOut - clockIn) / 60000) - (sh.breakMinutes ?? 0));
    if (isLast7) workedMinutesLast7 += minutes;
    else workedMinutesPrev7 += minutes;
  }

  function formatDeltaPct(current: number, previous: number): string {
    if (previous <= 0) return current > 0 ? '+∞' : '—';
    const pct = ((current - previous) / previous) * 100;
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(0)}%`;
  }

  // Top chatters (last 7 days): by worked hours, tie-breaker by revenue
  const workedMinutes7d = new Map<string, number>();
  for (const sh of shifts14d) {
    if (new Date(sh.clockIn) < start7dUTC) continue;
    const clockIn = new Date(sh.clockIn).getTime();
    const clockOut = new Date(sh.clockOut!).getTime();
    const minutes = Math.max(0, Math.floor((clockOut - clockIn) / 60000) - (sh.breakMinutes ?? 0));
    workedMinutes7d.set(sh.chatterId, (workedMinutes7d.get(sh.chatterId) ?? 0) + minutes);
  }

  const revenue7d = new Map<string, number>();
  const tips7d = new Map<string, number>();
  for (const s of kpiSnapshots14d) {
    if (new Date(s.snapshotDate) < start7dUTC) continue;
    revenue7d.set(s.chatterId, (revenue7d.get(s.chatterId) ?? 0) + (s.revenueCents ?? 0));
    tips7d.set(s.chatterId, (tips7d.get(s.chatterId) ?? 0) + (s.tipsReceivedCents ?? 0));
  }

  const chatterName = new Map(chatters.map((c) => [c.id, c.name] as const));

  const topChatters = chatters
    .map((c) => ({
      id: c.id,
      name: c.name,
      workedMinutes: workedMinutes7d.get(c.id) ?? 0,
      revenueCents: revenue7d.get(c.id) ?? 0,
      tipsCents: tips7d.get(c.id) ?? 0,
    }))
    .filter((r) => r.workedMinutes > 0 || r.revenueCents > 0 || r.tipsCents > 0)
    .sort((a, b) => {
      if (b.workedMinutes !== a.workedMinutes) return b.workedMinutes - a.workedMinutes;
      return b.revenueCents - a.revenueCents;
    })
    .slice(0, 8);

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-600">
            System-wide metrics and a lightweight analytics MVP (last 14 days).
          </p>
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

        {/* Analytics MVP */}
        <div className="mb-10">
          <div className="flex items-end justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Analytics (MVP)</h2>
              <p className="text-xs text-zinc-600">Aggregated from KPI snapshots + closed shifts.</p>
            </div>

            <a
              href="/api/admin/analytics/export"
              className="text-xs font-medium text-blue-700 hover:underline"
            >
              Download CSV
            </a>
          </div>

          <div className="grid grid-cols-1 gap-4 mb-4 md:grid-cols-3">
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Revenue (last 7d)</div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="text-2xl font-semibold">{formatMoney(revenueLast7)}</div>
                <div className="text-xs text-zinc-600">vs prev: {formatDeltaPct(revenueLast7, revenuePrev7)}</div>
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Tips (last 7d)</div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="text-2xl font-semibold">{formatMoney(tipsLast7)}</div>
                <div className="text-xs text-zinc-600">vs prev: {formatDeltaPct(tipsLast7, tipsPrev7)}</div>
              </div>
            </div>
            <div className="rounded border bg-white p-4">
              <div className="text-xs text-zinc-600">Hours worked (last 7d)</div>
              <div className="mt-2 flex items-end justify-between gap-2">
                <div className="text-2xl font-semibold">
                  {formatHoursFromMinutes(workedMinutesLast7)}
                </div>
                <div className="text-xs text-zinc-600">
                  vs prev: {formatDeltaPct(workedMinutesLast7, workedMinutesPrev7)}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded border bg-white overflow-hidden lg:col-span-2">
              <div className="px-4 py-3 border-b">
                <div className="text-sm font-semibold">Revenue + Tips (last 14 days)</div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Tips</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dayKeys
                    .slice()
                    .reverse()
                    .map((k) => (
                      <tr key={k} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 text-xs text-zinc-700">{k}</td>
                        <td className="px-3 py-2 font-medium">
                          {formatMoney(revenueByDay.get(k) ?? 0)}
                        </td>
                        <td className="px-3 py-2">{formatMoney(tipsByDay.get(k) ?? 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div className="rounded border bg-white overflow-hidden">
              <div className="px-4 py-3 border-b">
                <div className="text-sm font-semibold">Hours Worked (last 14 days)</div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Day</th>
                    <th className="px-3 py-2">Hours</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {dayKeys
                    .slice()
                    .reverse()
                    .map((k) => (
                      <tr key={k} className="hover:bg-zinc-50">
                        <td className="px-3 py-2 text-xs text-zinc-700">{k}</td>
                        <td className="px-3 py-2 font-medium">
                          {formatHoursFromMinutes(workedMinutesByDay.get(k) ?? 0)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 rounded border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b">
              <div className="text-sm font-semibold">Top Chatters (last 7 days)</div>
              <div className="text-xs text-zinc-600">Ranked by hours worked (tie-breaker: revenue).</div>
            </div>
            {topChatters.length === 0 ? (
              <div className="p-4 text-sm text-zinc-600">No activity yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-left text-xs font-semibold text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">Chatter</th>
                    <th className="px-3 py-2">Hours</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Tips</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {topChatters.map((c) => (
                    <tr key={c.id} className="hover:bg-zinc-50">
                      <td className="px-3 py-2 font-medium">
                        {c.name || chatterName.get(c.id) || '—'}
                      </td>
                      <td className="px-3 py-2">{formatHoursFromMinutes(c.workedMinutes)}</td>
                      <td className="px-3 py-2">{formatMoney(c.revenueCents)}</td>
                      <td className="px-3 py-2">{formatMoney(c.tipsCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
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
