import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

export async function POST(req: Request) {
  const email = await getActingUserEmail();
  if (!email) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const form = await req.formData();
  const rawBreak = form.get('breakMinutes');
  const rawNotes = form.get('notes');

  const breakMinutes = (() => {
    if (typeof rawBreak !== 'string' || rawBreak.trim() === '') return undefined;
    const n = Number.parseInt(rawBreak, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
    return Math.max(0, n);
  })();

  const notes = typeof rawNotes === 'string' && rawNotes.trim() ? rawNotes.trim().slice(0, 500) : undefined;

  const openShift = await prisma.shift.findFirst({
    where: { chatterId: user.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });

  if (openShift) {
    await prisma.shift.update({
      where: { id: openShift.id },
      data: {
        clockOut: new Date(),
        ...(breakMinutes !== undefined ? { breakMinutes } : {}),
        ...(notes !== undefined ? { notes } : {}),
      },
    });
  }

  return NextResponse.redirect(new URL('/shifts', req.url));
}
