import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import ShiftsAdminClient from './client';

export const dynamic = 'force-dynamic';

type ShiftRow = {
  id: string;
  chatterId: string;
  chatterName: string;
  chatterEmail: string;
  clockIn: string; // ISO
  clockOut: string | null; // ISO
  breakMinutes: number;
  notes: string | null;
  status: 'pending' | 'approved';
  approvedBy: string | null;
  approvedAt: string | null;
};

export default async function AdminShiftsPage() {
  const shifts = await prisma.shift.findMany({
    orderBy: { clockIn: 'desc' },
    take: 500,
    include: {
      chatter: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
    },
  });

  const rows: ShiftRow[] = shifts.map((s) => ({
    id: s.id,
    chatterId: s.chatterId,
    chatterName: s.chatter.name,
    chatterEmail: s.chatter.email,
    clockIn: s.clockIn.toISOString(),
    clockOut: s.clockOut ? s.clockOut.toISOString() : null,
    breakMinutes: s.breakMinutes ?? 0,
    notes: s.notes,
    status: s.approvedAt ? 'approved' : 'pending',
    approvedBy: s.approvedBy?.name ?? null,
    approvedAt: s.approvedAt ? s.approvedAt.toISOString() : null,
  }));

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <ShiftsAdminClient initialShifts={rows} />
    </div>
  );
}
