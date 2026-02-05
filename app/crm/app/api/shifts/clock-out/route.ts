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

  const rawBusyness = form.get('busyness');
  const rawWentWell = form.get('whatWentWell');
  const rawDidntGoWell = form.get('whatDidntGoWell');
  const rawMmSellingChats = form.get('mmSellingChats');
  const rawRevenueUsd = form.get('revenueUsd');
  const rawCreatorId = form.get('creatorId');

  const breakMinutes = (() => {
    if (typeof rawBreak !== 'string' || rawBreak.trim() === '') return undefined;
    const n = Number.parseInt(rawBreak, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
    return Math.max(0, n);
  })();

  const notes = typeof rawNotes === 'string' && rawNotes.trim() ? rawNotes.trim().slice(0, 500) : undefined;

  const busyness = (() => {
    if (typeof rawBusyness !== 'string' || rawBusyness.trim() === '') return undefined;
    const n = Number.parseInt(rawBusyness, 10);
    if (!Number.isFinite(n) || Number.isNaN(n)) return undefined;
    if (n < 1 || n > 5) return undefined;
    return n;
  })();

  const whatWentWell =
    typeof rawWentWell === 'string' && rawWentWell.trim() ? rawWentWell.trim().slice(0, 1000) : undefined;
  const whatDidntGoWell =
    typeof rawDidntGoWell === 'string' && rawDidntGoWell.trim() ? rawDidntGoWell.trim().slice(0, 1000) : undefined;
  const mmSellingChats =
    typeof rawMmSellingChats === 'string' && rawMmSellingChats.trim()
      ? rawMmSellingChats.trim().slice(0, 500)
      : undefined;

  const revenueCents = (() => {
    if (typeof rawRevenueUsd !== 'string' || rawRevenueUsd.trim() === '') return undefined;
    const n = Number.parseFloat(rawRevenueUsd);
    if (!Number.isFinite(n) || Number.isNaN(n) || n < 0) return undefined;
    return Math.round(n * 100);
  })();

  const creatorId = typeof rawCreatorId === 'string' && rawCreatorId.trim() ? rawCreatorId.trim() : undefined;

  const openShift = await prisma.shift.findFirst({
    where: { chatterId: user.id, clockOut: null },
    orderBy: { clockIn: 'desc' },
  });

  const attemptedReport =
    busyness !== undefined ||
    whatWentWell !== undefined ||
    whatDidntGoWell !== undefined ||
    mmSellingChats !== undefined ||
    revenueCents !== undefined ||
    creatorId !== undefined;

  // If the chatter touched the report fields, enforce the core trio + creator selection.
  // Otherwise we end up with silent “clocked out but no report saved” confusion.
  if (attemptedReport && (busyness === undefined || !whatWentWell || !whatDidntGoWell)) {
    return NextResponse.redirect(new URL('/shifts?error=missing_report_fields', req.url));
  }

  if (attemptedReport && !creatorId) {
    return NextResponse.redirect(new URL('/shifts?error=missing_creator', req.url));
  }

  if (attemptedReport && creatorId) {
    const assignment = await prisma.chatterCreator.findFirst({
      where: { chatterId: user.id, creatorId, unassignedAt: null },
      select: { id: true },
    });

    if (!assignment) {
      return NextResponse.redirect(new URL('/shifts?error=invalid_creator', req.url));
    }
  }

  if (openShift) {
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.shift.update({
        where: { id: openShift.id },
        data: {
          clockOut: now,
          ...(breakMinutes !== undefined ? { breakMinutes } : {}),
          ...(notes !== undefined ? { notes } : {}),
        },
      });

      // V0: if report fields are provided, persist a ShiftReport tied 1:1 to the Shift.
      if (attemptedReport) {
        const creatorIdValue = creatorId!;

        await tx.shiftReport.upsert({
          where: { shiftId: openShift.id },
          create: {
            shiftId: openShift.id,
            createdById: user.id,
            creatorId: creatorIdValue,
            busyness: busyness!,
            whatWentWell: whatWentWell!,
            whatDidntGoWell: whatDidntGoWell!,
            mmSellingChats,
            revenueCents,
          },
          update: {
            creatorId: creatorIdValue,
            busyness: busyness!,
            whatWentWell: whatWentWell!,
            whatDidntGoWell: whatDidntGoWell!,
            mmSellingChats,
            revenueCents,
          },
        });
      }
    });
  }

  return NextResponse.redirect(new URL('/shifts', req.url));
}
