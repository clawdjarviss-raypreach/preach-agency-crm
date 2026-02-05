import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import PayrollsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminPayrollsPage() {
  const payrolls = await prisma.payroll.findMany({
    orderBy: { payPeriod: { startDate: 'desc' } },
    take: 100,
    include: {
      chatter: { select: { name: true, email: true } },
      payPeriod: true,
      bonuses: { include: { bonusRule: true } },
    },
  });

  return (
    <div className="app-shell flex">
      <Sidebar />
      <PayrollsClient initialPayrolls={payrolls} />
    </div>
  );
}
