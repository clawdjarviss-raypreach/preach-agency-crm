import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';
import { getRole } from '@/lib/auth';
import SupervisorShiftsClient from './client';

export const dynamic = 'force-dynamic';

type ShiftRow = {
  id: string;
  chatterName: string;
  chatterEmail: string;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  notes: string | null;
  status: 'pending' | 'approved';
};

export default async function SupervisorShiftsPage() {
  const role = await getRole();
  const email = await getActingUserEmail();
  const supervisor = email ? await prisma.user.findUnique({ where: { email } }) : null;

  const shifts = role === 'supervisor' && supervisor
    ? await prisma.shift.findMany({
        where: {
          chatter: { supervisorId: supervisor.id },
        },
        orderBy: { clockIn: 'desc' },
        take: 200,
        include: {
          chatter: { select: { name: true, email: true } },
        },
      })
    : [];

  const rows: ShiftRow[] = shifts.map((s) => ({
    id: s.id,
    chatterName: s.chatter.name,
    chatterEmail: s.chatter.email,
    clockIn: s.clockIn.toISOString(),
    clockOut: s.clockOut ? s.clockOut.toISOString() : null,
    breakMinutes: s.breakMinutes ?? 0,
    notes: s.notes,
    status: s.approvedAt ? 'approved' : 'pending',
  }));

  return (
    <div className="app-shell flex">
      <Sidebar />
      {role !== 'supervisor' ? (
        <main className="flex-1 p-6">
          <h1 className="text-2xl font-semibold">Supervisor — Shift Approvals</h1>
          <div className="mt-4 rounded border bg-yellow-50 p-4 text-sm text-yellow-800">
            Unauthorized.
          </div>
        </main>
      ) : (
        <SupervisorShiftsClient initialShifts={rows} />
      )}
    </div>
  );
}
