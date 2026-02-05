import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import CreatorsClient from './client';

export const dynamic = 'force-dynamic';

type CreatorRow = {
  id: string;
  platform: 'onlyfans' | 'fansly' | 'other';
  username: string;
  displayName: string | null;
  status: 'active' | 'paused' | 'churned';
  createdAt: Date;
};

export default async function AdminCreatorsPage() {
  const creators = await prisma.creator.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });

  return (
    <div className="app-shell flex">
      <Sidebar />
      <CreatorsClient initialCreators={creators as CreatorRow[]} />
    </div>
  );
}
