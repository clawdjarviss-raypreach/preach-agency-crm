import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import AssignmentsClient from './client';

export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  chatterName: string;
  chatterEmail: string;
  creatorLabel: string;
  isPrimary: boolean;
  assignedAt: string; // ISO
};

type UnassignedRow = {
  id: string;
  chatterName: string;
  creatorLabel: string;
  unassignedAt: string; // ISO
};

type ChatterRow = {
  id: string;
  name: string;
  email: string;
};

type CreatorRow = {
  id: string;
  platform: string;
  username: string;
  displayName: string | null;
};

export default async function AdminAssignmentsPage() {
  const [assignments, unassigned, chatters, creators] = await Promise.all([
    prisma.chatterCreator.findMany({
      where: { unassignedAt: null },
      orderBy: [{ chatter: { name: 'asc' } }, { isPrimary: 'desc' }, { assignedAt: 'desc' }],
      take: 250,
      include: {
        chatter: { select: { name: true, email: true } },
        creator: { select: { platform: true, username: true, displayName: true } },
      },
    }),
    prisma.chatterCreator.findMany({
      where: { unassignedAt: { not: null } },
      orderBy: { unassignedAt: 'desc' },
      take: 50,
      include: {
        chatter: { select: { name: true } },
        creator: { select: { platform: true, username: true, displayName: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'chatter', status: 'active' },
      orderBy: { name: 'asc' },
      take: 200,
      select: { id: true, name: true, email: true },
    }),
    prisma.creator.findMany({
      where: { status: 'active' },
      orderBy: [{ platform: 'asc' }, { username: 'asc' }],
      take: 200,
      select: { id: true, platform: true, username: true, displayName: true },
    }),
  ]);

  const rows: Row[] = assignments.map((a) => ({
    id: a.id,
    chatterName: a.chatter.name,
    chatterEmail: a.chatter.email,
    creatorLabel: `${a.creator.displayName ?? a.creator.username} (${a.creator.platform})`,
    isPrimary: a.isPrimary,
    assignedAt: a.assignedAt.toISOString(),
  }));

  const unassignedRows: UnassignedRow[] = unassigned.map((u) => ({
    id: u.id,
    chatterName: u.chatter.name,
    creatorLabel: `${u.creator.displayName ?? u.creator.username} (${u.creator.platform})`,
    unassignedAt: (u.unassignedAt as Date).toISOString(),
  }));

  return (
    <div className="app-shell flex">
      <Sidebar />
      <AssignmentsClient
        initialRows={rows}
        unassignedRows={unassignedRows}
        chatters={chatters as ChatterRow[]}
        creators={creators as CreatorRow[]}
      />
    </div>
  );
}
