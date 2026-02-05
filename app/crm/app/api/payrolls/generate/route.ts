import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

function toISODate(d: Date) {
  return d.toISOString();
}

export async function POST(req: NextRequest) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));

    const now = new Date();
    const defaultEnd = now;
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const startDate = body?.startDate ? new Date(body.startDate) : defaultStart;
    const endDate = body?.endDate ? new Date(body.endDate) : defaultEnd;

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate/endDate' }, { status: 400 });
    }

    if (startDate >= endDate) {
      return NextResponse.json({ error: 'startDate must be before endDate' }, { status: 400 });
    }

    // Find or create the pay period for this range (exact match).
    const payPeriod =
      (await prisma.payPeriod.findFirst({
        where: { startDate, endDate },
      })) ??
      (await prisma.payPeriod.create({
        data: { startDate, endDate, status: 'open' },
      }));

    const shifts = await prisma.shift.findMany({
      where: {
        approvedAt: { not: null },
        clockIn: { gte: startDate },
        AND: [{ clockOut: { not: null } }, { clockOut: { lte: endDate } }],
      },
      include: { chatter: { select: { id: true, hourlyRateCents: true } } },
      take: 1000,
    });

    const byChatter = new Map<
      string,
      { minutes: number; hourlyRateCents: number | null }
    >();

    for (const s of shifts) {
      const clockOut = s.clockOut as Date;
      const rawMinutes = Math.max(0, Math.round((clockOut.getTime() - s.clockIn.getTime()) / 60000));
      const worked = Math.max(0, rawMinutes - (s.breakMinutes ?? 0));

      const prev = byChatter.get(s.chatterId);
      byChatter.set(s.chatterId, {
        minutes: (prev?.minutes ?? 0) + worked,
        hourlyRateCents: s.chatter.hourlyRateCents ?? prev?.hourlyRateCents ?? null,
      });
    }

    let createdOrUpdated = 0;

    for (const [chatterId, agg] of byChatter.entries()) {
      const rate = agg.hourlyRateCents ?? 0;
      const basePayCents = Math.round((agg.minutes * rate) / 60);
      const netPayCents = basePayCents; // bonuses/deductions applied later

      await prisma.payroll.upsert({
        where: { chatterId_payPeriodId: { chatterId, payPeriodId: payPeriod.id } },
        create: {
          chatterId,
          payPeriodId: payPeriod.id,
          hoursWorkedMinutes: agg.minutes,
          basePayCents,
          netPayCents,
        },
        update: {
          hoursWorkedMinutes: agg.minutes,
          basePayCents,
          netPayCents,
        },
      });

      createdOrUpdated += 1;
    }

    return NextResponse.json({
      ok: true,
      payPeriodId: payPeriod.id,
      startDate: toISODate(payPeriod.startDate),
      endDate: toISODate(payPeriod.endDate),
      payrollsCreatedOrUpdated: createdOrUpdated,
    });
  } catch (error) {
    console.error('Failed to generate payrolls:', error);
    return NextResponse.json({ error: 'Failed to generate payrolls' }, { status: 500 });
  }
}
