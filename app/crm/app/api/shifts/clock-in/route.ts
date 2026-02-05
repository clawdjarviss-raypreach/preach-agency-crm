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

  const openShift = await prisma.shift.findFirst({
    where: { chatterId: user.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });

  if (!openShift) {
    await prisma.shift.create({
      data: {
        chatterId: user.id,
        clockIn: new Date(),
      },
    });
  }

  return NextResponse.redirect(new URL('/shifts', req.url));
}
