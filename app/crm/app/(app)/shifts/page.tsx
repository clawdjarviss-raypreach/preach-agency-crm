import Sidebar from '@/app/components/Sidebar';
import ShiftReportView from '@/app/components/ShiftReportView';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

type ShiftsPageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function ShiftsPage({ searchParams }: ShiftsPageProps) {
  const email = await getActingUserEmail();
  const chatter = email ? await prisma.user.findUnique({ where: { email } }) : null;

  const openShift = chatter
    ? await prisma.shift.findFirst({
        where: { chatterId: chatter.id, clockOut: null },
        orderBy: { clockIn: 'desc' },
      })
    : null;

  const shifts = chatter
    ? await prisma.shift.findMany({
        where: { chatterId: chatter.id },
        orderBy: { clockIn: 'desc' },
        take: 50,
        include: {
          report: {
            include: {
              creator: { select: { displayName: true, username: true } },
            },
          },
        },
      })
    : [];

  const activeCreators = chatter
    ? await prisma.chatterCreator.findMany({
        where: { chatterId: chatter.id, unassignedAt: null },
        include: { creator: true },
        orderBy: { assignedAt: 'desc' },
      })
    : [];

  // V0 stats (server-side): last 7 days of closed shifts only.
  // Avoid Date.now() to satisfy react-hooks/purity lint rule.
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentClosed = chatter
    ? await prisma.shift.findMany({
        where: {
          chatterId: chatter.id,
          clockOut: { not: null },
          clockIn: { gte: sevenDaysAgo },
        },
        select: { clockIn: true, clockOut: true, breakMinutes: true },
        take: 250,
      })
    : [];

  const recentMinutes = recentClosed.reduce((sum, s) => {
    const out = s.clockOut;
    if (!out) return sum;
    const minutes = Math.max(
      0,
      Math.floor((out.getTime() - s.clockIn.getTime()) / 60000) - (s.breakMinutes ?? 0)
    );
    return sum + minutes;
  }, 0);

  const recentHours = (recentMinutes / 60).toFixed(2);

  // Current pay period stats (if any open pay period exists)
  const openPayPeriod = await prisma.payPeriod.findFirst({
    where: { endDate: { gte: new Date() } },
    orderBy: { startDate: 'asc' },
  });

  const periodShifts = chatter && openPayPeriod
    ? await prisma.shift.findMany({
        where: {
          chatterId: chatter.id,
          clockOut: { not: null },
          clockIn: { gte: openPayPeriod.startDate, lte: openPayPeriod.endDate },
        },
        select: { clockIn: true, clockOut: true, breakMinutes: true },
      })
    : [];

  const periodMinutes = periodShifts.reduce((sum, s) => {
    const out = s.clockOut;
    if (!out) return sum;
    const minutes = Math.max(
      0,
      Math.floor((out.getTime() - s.clockIn.getTime()) / 60000) - (s.breakMinutes ?? 0)
    );
    return sum + minutes;
  }, 0);

  const periodHours = (periodMinutes / 60).toFixed(2);
  const periodLabel = openPayPeriod
    ? `${openPayPeriod.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${openPayPeriod.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'N/A';

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <h1 className="text-xl font-semibold">My Shifts</h1>
        <p className="mt-1 text-sm text-zinc-600">V0: shifts are tied to your dev-login role via seeded demo users.</p>

        {searchParams?.error === 'missing_report_fields' && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            End-of-shift report: if you fill any report field, you must also provide <b>Busyness</b>, <b>What went well</b>, and{' '}
            <b>What didn’t go well</b>.
          </div>
        )}

        {searchParams?.error === 'missing_creator' && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            End-of-shift report: please select the <b>Creator</b> you worked on.
          </div>
        )}

        {searchParams?.error === 'invalid_creator' && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            End-of-shift report: that creator is not assigned to you.
          </div>
        )}

        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs text-zinc-500">Current Pay Period</div>
            <div className="mt-1 text-lg font-semibold">{periodHours} h</div>
            <div className="mt-1 text-xs text-zinc-500">{periodLabel}</div>
          </div>
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs text-zinc-500">Period Shifts</div>
            <div className="mt-1 text-lg font-semibold">{periodShifts.length}</div>
          </div>
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs text-zinc-500">Last 7 days</div>
            <div className="mt-1 text-lg font-semibold">{recentHours} h</div>
          </div>
          <div className="rounded-md border bg-white p-3 text-sm">
            <div className="text-xs text-zinc-500">Open shift</div>
            <div className="mt-1 text-lg font-semibold">{openShift ? 'Running' : 'None'}</div>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <form action="/api/shifts/clock-in" method="post">
            <button
              className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
              disabled={!chatter || !!openShift}
            >
              Clock in
            </button>
          </form>
        </div>

        {openShift && (
          <div className="mt-4 rounded-md border bg-zinc-50 p-3 text-sm">
            <div className="font-medium">Open shift</div>
            <div className="text-zinc-600">started {openShift.clockIn.toISOString()}</div>

            <form action="/api/shifts/clock-out" method="post" className="mt-3 grid gap-2 sm:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-xs text-zinc-600">Break minutes</span>
                <input
                  name="breakMinutes"
                  type="number"
                  min={0}
                  step={1}
                  className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                  placeholder="0"
                />
              </label>

              <label className="grid gap-1 sm:col-span-2">
                <span className="text-xs text-zinc-600">Notes</span>
                <input
                  name="notes"
                  type="text"
                  maxLength={500}
                  className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                  placeholder="Optional"
                />
              </label>

              <div className="sm:col-span-3 mt-2 border-t pt-3">
                <div className="text-xs font-medium text-zinc-700">End-of-shift report (V0)</div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-600">Busyness (1–5)</span>
                    <select name="busyness" className="w-full rounded-md border bg-white px-2 py-1 text-sm" defaultValue="">
                      <option value="" disabled>
                        Select
                      </option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                    </select>
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-600">Creator</span>
                    <select
                      name="creatorId"
                      className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {activeCreators.map((a) => (
                        <option key={a.creatorId} value={a.creatorId}>
                          {a.creator.displayName || a.creator.username}
                        </option>
                      ))}
                    </select>
                    {activeCreators.length === 0 && (
                      <span className="text-[11px] text-zinc-500">No active creator assignments found.</span>
                    )}
                  </label>

                  <label className="grid gap-1">
                    <span className="text-xs text-zinc-600">Revenue (USD)</span>
                    <input
                      name="revenueUsd"
                      type="number"
                      min={0}
                      step="0.01"
                      className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                      placeholder="Optional"
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-3">
                    <span className="text-xs text-zinc-600">What went well?</span>
                    <textarea
                      name="whatWentWell"
                      maxLength={1000}
                      className="min-h-[72px] w-full rounded-md border bg-white px-2 py-1 text-sm"
                      placeholder="Quick bullets are fine"
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-3">
                    <span className="text-xs text-zinc-600">What didn’t go well?</span>
                    <textarea
                      name="whatDidntGoWell"
                      maxLength={1000}
                      className="min-h-[72px] w-full rounded-md border bg-white px-2 py-1 text-sm"
                      placeholder="Blockers / issues"
                    />
                  </label>

                  <label className="grid gap-1 sm:col-span-3">
                    <span className="text-xs text-zinc-600">MM selling chats</span>
                    <input
                      name="mmSellingChats"
                      type="text"
                      maxLength={500}
                      className="w-full rounded-md border bg-white px-2 py-1 text-sm"
                      placeholder="Optional"
                    />
                  </label>
                </div>
              </div>

              <div className="sm:col-span-3">
                <button className="rounded-md border px-3 py-2 text-sm">Clock out</button>
              </div>
            </form>
          </div>
        )}

        {!openShift && (
          <div className="mt-4 rounded-md border bg-white p-3 text-sm text-zinc-600">
            No open shift right now. Clock in to start one.
          </div>
        )}

        <div className="mt-6 overflow-auto rounded border">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="p-2">Clock in</th>
                <th className="p-2">Clock out</th>
                <th className="p-2">Break (min)</th>
                <th className="p-2">Notes</th>
                <th className="p-2">Report</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => {
                const reportState = !s.clockOut ? 'na' : s.report ? 'yes' : 'no';

                return (
                  <tr key={s.id} className="border-t align-top">
                    <td className="p-2">{s.clockIn.toISOString()}</td>
                    <td className="p-2">{s.clockOut ? s.clockOut.toISOString() : '-'}</td>
                    <td className="p-2">{s.breakMinutes}</td>
                    <td className="p-2 text-zinc-600">{s.notes ?? '-'}</td>
                    <td className="p-2">
                      {reportState === 'na' && <span className="text-zinc-400">N/A</span>}
                      {reportState === 'no' && <span className="text-zinc-400">—</span>}
                      {reportState === 'yes' && s.report && (
                        <details className="group">
                          <summary className="cursor-pointer select-none">
                            <span className="font-medium text-emerald-700">✓</span>{' '}
                            <span className="text-xs text-blue-700 group-open:hidden">View</span>
                            <span className="text-xs text-blue-700 hidden group-open:inline">Hide</span>
                          </summary>
                          <div className="mt-2">
                            <ShiftReportView
                              report={{
                                busyness: s.report.busyness,
                                whatWentWell: s.report.whatWentWell,
                                whatDidntGoWell: s.report.whatDidntGoWell,
                                mmSellingChats: s.report.mmSellingChats,
                                revenueCents: s.report.revenueCents,
                                creator: s.report.creator,
                              }}
                            />
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
              {shifts.length === 0 && (
                <tr>
                  <td className="p-4 text-zinc-500" colSpan={5}>
                    No shifts yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
