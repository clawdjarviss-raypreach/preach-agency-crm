import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import UsersClient from './client';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'supervisor' | 'chatter';
  status: 'active' | 'inactive' | 'onboarding';
  supervisorId: string | null;
  hourlyRateCents: number | null;
  commissionBps: number;
  createdAt: Date;
};

export default async function AdminUsersPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const supervisors = await prisma.user.findMany({
    where: { role: 'supervisor' },
    orderBy: { createdAt: 'asc' },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role as 'admin' | 'supervisor' | 'chatter',
    status: u.status as 'active' | 'inactive' | 'onboarding',
    supervisorId: u.supervisorId,
    hourlyRateCents: u.hourlyRateCents,
    commissionBps: u.commissionBps,
    createdAt: u.createdAt,
  }));

  return (
    <div className="app-shell flex">
      <Sidebar />
      <UsersClient
        initialUsers={rows}
        supervisors={supervisors.map((s) => ({ id: s.id, name: s.name, email: s.email }))}
      />
    </div>
  );
}
