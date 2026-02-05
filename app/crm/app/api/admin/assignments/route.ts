import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

type Row = {
  id: string;
  chatterName: string;
  chatterEmail: string;
  creatorLabel: string;
  isPrimary: boolean;
  assignedAt: string;
};

type UnassignedRow = {
  id: string;
  chatterName: string;
  creatorLabel: string;
  unassignedAt: string;
};

type Payload = {
  activeRows: Row[];
  unassignedRows: UnassignedRow[];
};

async function getActiveRows(): Promise<Row[]> {
  const assignments = await prisma.chatterCreator.findMany({
    where: { unassignedAt: null },
    orderBy: [{ chatter: { name: 'asc' } }, { isPrimary: 'desc' }, { assignedAt: 'desc' }],
    take: 250,
    include: {
      chatter: { select: { name: true, email: true } },
      creator: { select: { platform: true, username: true, displayName: true } },
    },
  });

  return assignments.map((a) => ({
    id: a.id,
    chatterName: a.chatter.name,
    chatterEmail: a.chatter.email,
    creatorLabel: `${a.creator.displayName ?? a.creator.username} (${a.creator.platform})`,
    isPrimary: a.isPrimary,
    assignedAt: a.assignedAt.toISOString(),
  }));
}

async function getUnassignedRows(): Promise<UnassignedRow[]> {
  const unassigned = await prisma.chatterCreator.findMany({
    where: { unassignedAt: { not: null } },
    orderBy: { unassignedAt: 'desc' },
    take: 50,
    include: {
      chatter: { select: { name: true } },
      creator: { select: { platform: true, username: true, displayName: true } },
    },
  });

  return unassigned.map((u) => ({
    id: u.id,
    chatterName: u.chatter.name,
    creatorLabel: `${u.creator.displayName ?? u.creator.username} (${u.creator.platform})`,
    unassignedAt: (u.unassignedAt as Date).toISOString(),
  }));
}

async function getPayload(): Promise<Payload> {
  const [activeRows, unassignedRows] = await Promise.all([getActiveRows(), getUnassignedRows()]);
  return { activeRows, unassignedRows };
}

export async function GET() {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const payload = await getPayload();
  return NextResponse.json(payload);
}

export async function POST(req: Request) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as
    | { chatterId?: string; creatorId?: string; isPrimary?: boolean }
    | null;

  const chatterId = String(body?.chatterId ?? '');
  const creatorId = String(body?.creatorId ?? '');
  const isPrimary = Boolean(body?.isPrimary);

  if (!chatterId || !creatorId) {
    return NextResponse.json({ error: 'missing chatterId/creatorId' }, { status: 400 });
  }

  const [chatter, creator] = await Promise.all([
    prisma.user.findUnique({ where: { id: chatterId } }),
    prisma.creator.findUnique({ where: { id: creatorId } }),
  ]);
  if (!chatter || !creator) return NextResponse.json({ error: 'not found' }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    if (isPrimary) {
      await tx.chatterCreator.updateMany({
        where: { chatterId, unassignedAt: null },
        data: { isPrimary: false },
      });
    }

    const existing = await tx.chatterCreator.findFirst({
      where: { chatterId, creatorId, unassignedAt: null },
      orderBy: { assignedAt: 'desc' },
    });

    if (existing) {
      await tx.chatterCreator.update({ where: { id: existing.id }, data: { isPrimary } });
    } else {
      await tx.chatterCreator.create({ data: { chatterId, creatorId, isPrimary } });
    }
  });

  const payload = await getPayload();
  return NextResponse.json(payload);
}
