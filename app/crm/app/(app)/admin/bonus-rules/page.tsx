import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import BonusRulesClient from './client';

export default async function AdminBonusRulesPage() {
  const rules = await prisma.bonusRule.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <div className="app-shell flex">
      <Sidebar />
      <BonusRulesClient initialRules={rules} />
    </div>
  );
}
