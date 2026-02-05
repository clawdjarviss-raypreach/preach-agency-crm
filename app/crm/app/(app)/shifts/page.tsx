import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

export default async function ShiftsPage() {
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
      })
    : [];

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <main className="flex-1 p-6">
        <h1 className="text-xl font-semibold">My Shifts</h1>
        <p className="mt-1 text-sm text-zinc-600">V0: shifts are tied to your dev-login role via seeded demo users.</p>

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
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="p-2">{s.clockIn.toISOString()}</td>
                  <td className="p-2">{s.clockOut ? s.clockOut.toISOString() : '-'}</td>
                  <td className="p-2">{s.breakMinutes}</td>
                  <td className="p-2 text-zinc-600">{s.notes ?? '-'}</td>
                </tr>
              ))}
              {shifts.length === 0 && (
                <tr>
                  <td className="p-4 text-zinc-500" colSpan={4}>
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
