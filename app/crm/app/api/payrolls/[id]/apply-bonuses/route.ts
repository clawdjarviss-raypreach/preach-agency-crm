import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateNetPayCents, calculateNetSalesCents } from '@/lib/payroll-calculations';
import { evaluateBonuses } from '@/lib/bonus-engine';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: {
        payPeriod: true,
        bonuses: true,
      },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    const rules = await prisma.bonusRule.findMany({ where: { isActive: true } });

    // KPI totals for the pay period.
    const kpiAgg = await prisma.kpiSnapshot.aggregate({
      where: {
        chatterId: payroll.chatterId,
        snapshotDate: { gte: payroll.payPeriod.startDate, lte: payroll.payPeriod.endDate },
      },
      _sum: {
        revenueCents: true,
        messagesSent: true,
        newSubs: true,
        tipsReceivedCents: true,
      },
    });

    const grossSalesCents = kpiAgg._sum.revenueCents ?? 0;
    const netSalesCents = calculateNetSalesCents(grossSalesCents);

    const assignments = await prisma.chatterCreator.findMany({
      where: { chatterId: payroll.chatterId, unassignedAt: null },
      select: { creatorId: true },
      take: 5000,
    });

    const autoBonuses = await evaluateBonuses(
      {
        chatterId: payroll.chatterId,
        payPeriodId: payroll.payPeriodId,
        periodStart: payroll.payPeriod.startDate,
        periodEnd: payroll.payPeriod.endDate,
        grossSalesCents,
        netSalesCents,
        messagesSent: kpiAgg._sum.messagesSent ?? 0,
        newSubs: kpiAgg._sum.newSubs ?? 0,
        tipsCents: kpiAgg._sum.tipsReceivedCents ?? 0,
        assignedCreatorIds: assignments.map((a) => a.creatorId),
      },
      rules
    );

    const autoTotalCents = autoBonuses.reduce((sum, b) => sum + b.amountCents, 0);

    // Preserve manual/unlinked bonuses.
    const manualTotalCents = payroll.bonuses
      .filter((b) => b.bonusRuleId == null)
      .reduce((sum, b) => sum + b.amountCents, 0);

    // Replace auto-linked bonuses only.
    await prisma.bonus.deleteMany({
      where: { payrollId: payroll.id, bonusRuleId: { not: null } },
    });

    if (autoBonuses.length > 0) {
      await prisma.bonus.createMany({
        data: autoBonuses.map((b) => ({
          payrollId: payroll.id,
          bonusRuleId: b.ruleId,
          description: b.description,
          amountCents: b.amountCents,
        })),
      });
    }

    const bonusTotalCents = manualTotalCents + autoTotalCents;

    const updated = await prisma.payroll.update({
      where: { id: payroll.id },
      data: {
        grossSalesCents,
        netSalesCents,
        bonusTotalCents,
        netPayCents: calculateNetPayCents({
          basePayCents: payroll.basePayCents,
          commissionCents: payroll.commissionCents,
          bonusTotalCents,
          deductionsCents: payroll.deductionsCents,
        }),
      },
      include: { bonuses: { include: { bonusRule: true } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to apply bonuses:', error);
    return NextResponse.json({ error: 'Failed to apply bonuses' }, { status: 500 });
  }
}
