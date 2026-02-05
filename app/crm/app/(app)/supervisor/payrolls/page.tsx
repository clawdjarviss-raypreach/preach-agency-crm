import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';
import PayrollApprovalsClient from './client';

export const dynamic = 'force-dynamic';

export default async function SupervisorPayrollsPage() {
  const email = await getActingUserEmail();
  const supervisor = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!supervisor || supervisor.role !== 'supervisor') {
    return (
      <div className="app-shell flex">
        <Sidebar />
        <main className="flex-1 p-6">
          <div className="rounded border bg-red-50 p-4 text-red-700">
            Access denied. Supervisor role required.
          </div>
        </main>
      </div>
    );
  }

  const [pending, approved, paid] = await Promise.all([
    prisma.payroll.findMany({
      where: {
        status: 'draft',
        chatter: { supervisorId: supervisor.id },
      },
      orderBy: { payPeriod: { startDate: 'desc' } },
      take: 100,
      include: {
        chatter: { select: { name: true, email: true } },
        payPeriod: true,
        bonuses: true,
      },
    }),
    prisma.payroll.findMany({
      where: {
        status: 'approved',
        chatter: { supervisorId: supervisor.id },
      },
      orderBy: { approvedAt: 'desc' },
      take: 50,
      include: {
        chatter: { select: { name: true } },
        payPeriod: true,
        bonuses: true,
      },
    }),
    prisma.payroll.findMany({
      where: {
        status: 'paid',
        chatter: { supervisorId: supervisor.id },
      },
      orderBy: { approvedAt: 'desc' },
      take: 50,
      include: {
        chatter: { select: { name: true } },
        payPeriod: true,
        bonuses: true,
      },
    }),
  ]);

  return (
    <div className="app-shell flex">
      <Sidebar />
      <PayrollApprovalsClient
        pendingPayrolls={pending}
        approvedPayrolls={approved}
        paidPayrolls={paid}
      />
    </div>
  );
}
