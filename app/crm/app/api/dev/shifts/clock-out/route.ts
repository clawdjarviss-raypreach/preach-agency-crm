import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

// Dev-only JSON clock-out endpoint for scripts/tools.

export async function POST(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const email = await getActingUserEmail();
    if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const breakMinutesRaw = body?.breakMinutes;
    const notesRaw = body?.notes;

    const breakMinutes = Number.isFinite(breakMinutesRaw) ? Math.max(0, Math.floor(breakMinutesRaw)) : undefined;
    const notes = typeof notesRaw === 'string' && notesRaw.trim() ? notesRaw.trim().slice(0, 500) : undefined;

    const openShift = await prisma.shift.findFirst({
      where: { chatterId: user.id, clockOut: null },
      orderBy: { clockIn: 'desc' },
    });

    if (!openShift) {
      return NextResponse.json({ error: 'No open shift found' }, { status: 400 });
    }

    const updated = await prisma.shift.update({
      where: { id: openShift.id },
      data: {
        clockOut: new Date(),
        ...(breakMinutes !== undefined ? { breakMinutes } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
      include: { chatter: { select: { id: true, name: true } } },
    });

    return NextResponse.json({ ok: true, shift: updated });
  } catch (error) {
    console.error('Dev clock-out failed:', error);
    return NextResponse.json({ error: 'Dev clock-out failed' }, { status: 500 });
  }
}
