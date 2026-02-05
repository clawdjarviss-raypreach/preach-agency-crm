import Sidebar from '@/app/components/Sidebar';
import { getActingUserEmail } from '@/lib/acting-user';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

function formatMoney(cents: number): string {
  return USD.format(cents / 100);
}

function minutesToHours(minutes: number): number {
  return minutes / 60;
}

function formatHours(minutes: number): string {
  return `${minutesToHours(minutes).toFixed(2)} h`;
}

function safeDeltaPct(current: number, previous: number): string {
  if (previous <= 0) return current > 0 ? '+∞' : '—';
  const pct = ((current - previous) / previous) * 100;
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${pct.toFixed(0)}%`;
}

function trendArrow(current: number, previous: number): string {
  if (current === previous) return '→';
  return current > previous ? '↑' : '↓';
}

export default async function MyStatsPage() {
  const email = await getActingUserEmail();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    return (
      <div className="app-shell flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="card text-sm text-zinc-600 dark:text-zinc-400">Please log in.</div>
        </main>
      </div>
    );
  }

  const openPayPeriod = await prisma.payPeriod.findFirst({
    where: { endDate: { gte: new Date() } },
    orderBy: { startDate: 'asc' },
  });

  // Fallback: last 7 days if no open pay period exists.
  const periodStart = openPayPeriod?.startDate ?? (() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  const periodEnd = openPayPeriod?.endDate ?? new Date();

  const periodLabel = `${periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const msRange = periodEnd.getTime() - periodStart.getTime();
  const prevStart = new Date(periodStart.getTime() - msRange);
  const prevEnd = new Date(periodEnd.getTime() - msRange);

  const [shiftsThisPeriod, shiftsPrevPeriod, kpisThisPeriod, kpisPrevPeriod, assignments, recentShifts] =
    await Promise.all([
      prisma.shift.findMany({
        where: {
          chatterId: user.id,
          clockOut: { not: null },
          clockIn: { gte: periodStart, lte: periodEnd },
        },
        select: { clockIn: true, clockOut: true, breakMinutes: true, approvedAt: true },
      }),
      prisma.shift.findMany({
        where: {
          chatterId: user.id,
          clockOut: { not: null },
          clockIn: { gte: prevStart, lte: prevEnd },
        },
        select: { clockIn: true, clockOut: true, breakMinutes: true },
      }),
      prisma.kpiSnapshot.findMany({
        where: {
          chatterId: user.id,
          snapshotDate: { gte: periodStart, lte: periodEnd },
        },
        select: { revenueCents: true, tipsReceivedCents: true },
        take: 250,
      }),
      prisma.kpiSnapshot.findMany({
        where: {
          chatterId: user.id,
          snapshotDate: { gte: prevStart, lte: prevEnd },
        },
        select: { revenueCents: true, tipsReceivedCents: true },
        take: 250,
      }),
      prisma.chatterCreator.findMany({
        where: { chatterId: user.id, unassignedAt: null },
        include: { creator: { select: { id: true, displayName: true, username: true } } },
        orderBy: { assignedAt: 'desc' },
      }),
      prisma.shift.findMany({
        where: { chatterId: user.id },
        orderBy: { clockIn: 'desc' },
        take: 10,
        include: { approvedBy: { select: { name: true } } },
      }),
    ]);

  const minutesThisPeriod = shiftsThisPeriod.reduce((sum, s) => {
    const out = s.clockOut;
    if (!out) return sum;
    const minutes = Math.max(0, Math.floor((out.getTime() - s.clockIn.getTime()) / 60000) - (s.breakMinutes ?? 0));
    return sum + minutes;
  }, 0);

  const minutesPrevPeriod = shiftsPrevPeriod.reduce((sum, s) => {
    const out = s.clockOut;
    if (!out) return sum;
    const minutes = Math.max(0, Math.floor((out.getTime() - s.clockIn.getTime()) / 60000) - (s.breakMinutes ?? 0));
    return sum + minutes;
  }, 0);

  const revenueThisPeriod = kpisThisPeriod.reduce((sum, k) => sum + (k.revenueCents ?? 0), 0);
  const tipsThisPeriod = kpisThisPeriod.reduce((sum, k) => sum + (k.tipsReceivedCents ?? 0), 0);
  const revenuePrevPeriod = kpisPrevPeriod.reduce((sum, k) => sum + (k.revenueCents ?? 0), 0);
  const tipsPrevPeriod = kpisPrevPeriod.reduce((sum, k) => sum + (k.tipsReceivedCents ?? 0), 0);

  // Team average (if supervisorId exists, scope to that team; else global average across chatters)
  const teamWhere = user.supervisorId ? { supervisorId: user.supervisorId, role: 'chatter' as const } : { role: 'chatter' as const };
  const teamChatters = await prisma.user.findMany({
    where: teamWhere,
    select: { id: true },
  });

  const teamChatterIds = teamChatters.map((c) => c.id);

  const [teamShifts, teamKpis] = await Promise.all([
    prisma.shift.findMany({
      where: {
        chatterId: { in: teamChatterIds },
        clockOut: { not: null },
        clockIn: { gte: periodStart, lte: periodEnd },
      },
      select: { chatterId: true, clockIn: true, clockOut: true, breakMinutes: true },
      take: 5000,
    }),
    prisma.kpiSnapshot.findMany({
      where: {
        chatterId: { in: teamChatterIds },
        snapshotDate: { gte: periodStart, lte: periodEnd },
      },
      select: { chatterId: true, revenueCents: true, tipsReceivedCents: true },
      take: 5000,
    }),
  ]);

  const teamMinutesByChatter = new Map<string, number>();
  for (const sh of teamShifts) {
    const out = sh.clockOut;
    if (!out) continue;
    const minutes = Math.max(0, Math.floor((out.getTime() - sh.clockIn.getTime()) / 60000) - (sh.breakMinutes ?? 0));
    teamMinutesByChatter.set(sh.chatterId, (teamMinutesByChatter.get(sh.chatterId) ?? 0) + minutes);
  }

  const teamRevenueByChatter = new Map<string, number>();
  for (const k of teamKpis) {
    teamRevenueByChatter.set(k.chatterId, (teamRevenueByChatter.get(k.chatterId) ?? 0) + (k.revenueCents ?? 0));
  }

  const teamAvgHours = teamChatterIds.length
    ? teamChatterIds.reduce((sum, id) => sum + (teamMinutesByChatter.get(id) ?? 0), 0) / teamChatterIds.length
    : 0;

  const teamAvgRevenue = teamChatterIds.length
    ? teamChatterIds.reduce((sum, id) => sum + (teamRevenueByChatter.get(id) ?? 0), 0) / teamChatterIds.length
    : 0;

  const approvedCount = shiftsThisPeriod.filter((s) => !!s.approvedAt).length;
  const pendingCount = shiftsThisPeriod.length - approvedCount;

  return (
    <div className="app-shell flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">My Stats</h1>
          <p className="page-subtitle">Performance snapshot for {periodLabel}.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="card">
            <div className="card-label">Hours worked</div>
            <div className="card-value">{formatHours(minutesThisPeriod)}</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {trendArrow(minutesThisPeriod, minutesPrevPeriod)} {safeDeltaPct(minutesThisPeriod, minutesPrevPeriod)} vs prev
            </div>
          </div>

          <div className="card">
            <div className="card-label">Revenue generated</div>
            <div className="card-value">{formatMoney(revenueThisPeriod)}</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {trendArrow(revenueThisPeriod, revenuePrevPeriod)} {safeDeltaPct(revenueThisPeriod, revenuePrevPeriod)} vs prev
            </div>
          </div>

          <div className="card">
            <div className="card-label">Tips earned</div>
            <div className="card-value">{formatMoney(tipsThisPeriod)}</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              {trendArrow(tipsThisPeriod, tipsPrevPeriod)} {safeDeltaPct(tipsThisPeriod, tipsPrevPeriod)} vs prev
            </div>
          </div>

          <div className="card">
            <div className="card-label">Team comparison</div>
            <div className="mt-2 grid gap-1 text-sm">
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">Hours vs avg:</span>{' '}
                <span className="font-semibold">{safeDeltaPct(minutesThisPeriod, teamAvgHours)}</span>
              </div>
              <div>
                <span className="text-zinc-600 dark:text-zinc-400">Revenue vs avg:</span>{' '}
                <span className="font-semibold">{safeDeltaPct(revenueThisPeriod, teamAvgRevenue)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Current assignments</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Creators you’re currently assigned to.</p>

            {assignments.length === 0 ? (
              <div className="mt-3 card text-sm text-zinc-600 dark:text-zinc-400">No active assignments.</div>
            ) : (
              <div className="mt-3 table-wrap">
                <table className="table-ui">
                  <thead>
                    <tr>
                      <th>Creator</th>
                      <th>Primary</th>
                      <th>Assigned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.creatorId}>
                        <td className="font-medium">
                          {a.creator.displayName ?? a.creator.username}
                        </td>
                        <td>{a.isPrimary ? 'Yes' : 'No'}</td>
                        <td className="text-xs text-zinc-600 dark:text-zinc-400">
                          {new Date(a.assignedAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold tracking-tight">Recent shifts</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Last 10 shifts with approval status.</p>

            {recentShifts.length === 0 ? (
              <div className="mt-3 card text-sm text-zinc-600 dark:text-zinc-400">No shifts yet.</div>
            ) : (
              <div className="mt-3 table-wrap">
                <table className="table-ui">
                  <thead>
                    <tr>
                      <th>Clock in</th>
                      <th>Clock out</th>
                      <th>Status</th>
                      <th>Approved by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentShifts.map((s) => (
                      <tr key={s.id}>
                        <td className="text-xs">{new Date(s.clockIn).toLocaleString()}</td>
                        <td className="text-xs">{s.clockOut ? new Date(s.clockOut).toLocaleString() : '—'}</td>
                        <td>
                          <span
                            className={
                              'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ' +
                              (s.approvedAt
                                ? 'bg-[color:var(--brand-soft)]/60 text-[color:var(--brand)]'
                                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-950 dark:text-zinc-300')
                            }
                          >
                            {s.approvedAt ? 'approved' : 'pending'}
                          </span>
                        </td>
                        <td className="text-xs text-zinc-600 dark:text-zinc-400">{s.approvedBy?.name ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              Period shifts: <span className="font-medium">{shiftsThisPeriod.length}</span> (approved: {approvedCount}, pending: {pendingCount})
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
