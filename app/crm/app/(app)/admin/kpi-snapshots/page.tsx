import Sidebar from '@/app/components/Sidebar';
import { prisma } from '@/lib/prisma';
import KpiSnapshotsClient from './client';

export const dynamic = 'force-dynamic';

type SnapshotRow = {
  id: string;
  chatterId: string;
  chatterName: string;
  creatorId: string;
  creatorLabel: string;
  snapshotDate: string;
  revenueCents: number | null;
  messagesSent: number | null;
  tipsReceivedCents: number | null;
  newSubs: number | null;
  source: string;
};

type ChatterRow = { id: string; name: string; email: string };
type CreatorRow = { id: string; platform: string; username: string; displayName: string | null };

export default async function AdminKpiSnapshotsPage() {
  const [snapshots, chatters, creators] = await Promise.all([
    prisma.kpiSnapshot.findMany({
      orderBy: { snapshotDate: 'desc' },
      take: 100,
      include: {
        chatter: { select: { name: true, email: true } },
        creator: { select: { platform: true, username: true, displayName: true } },
      },
    }),
    prisma.user.findMany({
      where: { role: 'chatter', status: 'active' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
      take: 200,
    }),
    prisma.creator.findMany({
      where: { status: 'active' },
      orderBy: [{ platform: 'asc' }, { username: 'asc' }],
      select: { id: true, platform: true, username: true, displayName: true },
      take: 200,
    }),
  ]);

  const rows: SnapshotRow[] = snapshots.map((s) => ({
    id: s.id,
    chatterId: s.chatterId,
    chatterName: s.chatter.name,
    creatorId: s.creatorId,
    creatorLabel: `${s.creator.displayName ?? s.creator.username} (${s.creator.platform})`,
    snapshotDate: s.snapshotDate.toISOString().split('T')[0],
    revenueCents: s.revenueCents,
    messagesSent: s.messagesSent,
    tipsReceivedCents: s.tipsReceivedCents,
    newSubs: s.newSubs,
    source: s.source,
  }));

  return (
    <div className="min-h-screen flex">
      <Sidebar />
      <KpiSnapshotsClient
        initialSnapshots={rows}
        chatters={chatters as ChatterRow[]}
        creators={creators as CreatorRow[]}
      />
    </div>
  );
}
