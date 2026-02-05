import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import {
  calculateCommissionCents,
  calculateNetPayCents,
  calculateNetSalesCents,
} from '@/lib/payroll-calculations';

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
      select: {
        chatterId: true,
        clockIn: true,
        clockOut: true,
        breakMinutes: true,
      },
      take: 5000,
    });

    // Aggregate approved shift minutes by chatter
    const minutesByChatter = new Map<string, number>();

    for (const s of shifts) {
      const clockOut = s.clockOut as Date;
      const rawMinutes = Math.max(
        0,
        Math.round((clockOut.getTime() - s.clockIn.getTime()) / 60000)
      );
      const worked = Math.max(0, rawMinutes - (s.breakMinutes ?? 0));
      minutesByChatter.set(s.chatterId, (minutesByChatter.get(s.chatterId) ?? 0) + worked);
    }

    // Aggregate gross sales from KPI snapshots by chatter for the same period.
    const revenueAgg = await prisma.kpiSnapshot.groupBy({
      by: ['chatterId'],
      where: {
        snapshotDate: { gte: startDate, lte: endDate },
      },
      _sum: {
        revenueCents: true,
      },
    });

    const grossSalesByChatter = new Map<string, number>();
    for (const row of revenueAgg) {
      grossSalesByChatter.set(row.chatterId, row._sum.revenueCents ?? 0);
    }

    // Union of chatters with either shifts or revenue.
    const chatterIds = Array.from(
      new Set<string>([...minutesByChatter.keys(), ...grossSalesByChatter.keys()])
    );

    const chatters = await prisma.user.findMany({
      where: { id: { in: chatterIds } },
      select: { id: true, hourlyRateCents: true, commissionBps: true },
    });

    const chatterById = new Map(chatters.map((c) => [c.id, c] as const));

    let createdOrUpdated = 0;

    for (const chatterId of chatterIds) {
      const chatter = chatterById.get(chatterId);

      const minutes = minutesByChatter.get(chatterId) ?? 0;
      const hourlyRateCents = chatter?.hourlyRateCents ?? 0;
      const commissionBps = chatter?.commissionBps ?? 0;

      const basePayCents = Math.round((minutes * hourlyRateCents) / 60);

      const grossSalesCents = grossSalesByChatter.get(chatterId) ?? 0;
      const netSalesCents = calculateNetSalesCents(grossSalesCents);
      const commissionCents = calculateCommissionCents(netSalesCents, commissionBps);

      const existing = await prisma.payroll.findUnique({
        where: { chatterId_payPeriodId: { chatterId, payPeriodId: payPeriod.id } },
        select: { bonusTotalCents: true, deductionsCents: true },
      });

      const bonusTotalCents = existing?.bonusTotalCents ?? 0;
      const deductionsCents = existing?.deductionsCents ?? 0;

      const netPayCents = calculateNetPayCents({
        basePayCents,
        commissionCents,
        bonusTotalCents,
        deductionsCents,
      });

      await prisma.payroll.upsert({
        where: { chatterId_payPeriodId: { chatterId, payPeriodId: payPeriod.id } },
        create: {
          chatterId,
          payPeriodId: payPeriod.id,
          hoursWorkedMinutes: minutes,
          basePayCents,
          grossSalesCents,
          netSalesCents,
          commissionCents,
          bonusTotalCents: 0,
          deductionsCents: 0,
          netPayCents: calculateNetPayCents({ basePayCents, commissionCents }),
        },
        update: {
          hoursWorkedMinutes: minutes,
          basePayCents,
          grossSalesCents,
          netSalesCents,
          commissionCents,
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
