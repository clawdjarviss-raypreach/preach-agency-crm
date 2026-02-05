import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

// Dev-only JSON clock-in endpoint for scripts/tools.
// Keeps UI routes (which redirect) unchanged.

export async function POST() {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const email = await getActingUserEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const openShift = await prisma.shift.findFirst({
      where: { chatterId: user.id, clockOut: null },
      orderBy: { clockIn: 'desc' },
      include: { chatter: { select: { id: true, name: true } } },
    });

    if (openShift) {
      return NextResponse.json({ ok: true, shift: openShift });
    }

    const created = await prisma.shift.create({
      data: {
        chatterId: user.id,
        clockIn: new Date(),
      },
      include: { chatter: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ ok: true, shift: created });
  } catch (error) {
    console.error('Dev clock-in failed:', error);
    return NextResponse.json({ error: 'Dev clock-in failed' }, { status: 500 });
  }
}
