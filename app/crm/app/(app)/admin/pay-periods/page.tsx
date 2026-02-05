import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import PayPeriodsClient from './client';

export const dynamic = 'force-dynamic';

export default async function AdminPayPeriodsPage() {
  const periods = await prisma.payPeriod.findMany({
    orderBy: { startDate: 'desc' },
    take: 50,
    include: {
      payrolls: { select: { id: true } },
    },
  });

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <PayPeriodsClient initialPeriods={periods} />
    </div>
  );
}
