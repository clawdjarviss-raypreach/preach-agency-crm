import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function POST(req: Request) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.redirect(new URL('/', req.url));

  const fd = await req.formData();
  const chatterId = String(fd.get('chatterId') ?? '');
  const creatorId = String(fd.get('creatorId') ?? '');
  const isPrimary = fd.get('isPrimary') === 'on';

  if (!chatterId || !creatorId) {
    return NextResponse.redirect(new URL('/admin/assignments', req.url));
  }

  const [chatter, creator] = await Promise.all([
    prisma.user.findUnique({ where: { id: chatterId } }),
    prisma.creator.findUnique({ where: { id: creatorId } }),
  ]);

  if (!chatter || !creator) return NextResponse.redirect(new URL('/admin/assignments', req.url));

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
      await tx.chatterCreator.update({
        where: { id: existing.id },
        data: { isPrimary },
      });
    } else {
      await tx.chatterCreator.create({
        data: { chatterId, creatorId, isPrimary },
      });
    }
  });

  return NextResponse.redirect(new URL('/admin/assignments', req.url));
}
