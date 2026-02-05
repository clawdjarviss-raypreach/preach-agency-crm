import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateNetPayCents } from '@/lib/payroll-calculations';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch payroll with related data
    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: { bonuses: true },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    // Fetch active bonus rules
    const rules = await prisma.bonusRule.findMany({
      where: { isActive: true },
    });

    let totalBonusCents = 0;
    const newBonuses = [];

    // Apply each rule
    for (const rule of rules) {
      let bonusAmount = 0;

      if (rule.type === 'percentage' && rule.percentageBps !== null) {
        // Calculate percentage of base pay
        bonusAmount = Math.round((payroll.basePayCents * rule.percentageBps) / 10000);
      } else if (rule.type === 'flat' && rule.flatAmountCents !== null) {
        // Flat bonus
        bonusAmount = rule.flatAmountCents;
      } else if (rule.type === 'milestone' && rule.thresholdCents !== null) {
        // Milestone: bonus if base pay exceeds threshold
        if (payroll.basePayCents >= rule.thresholdCents && rule.flatAmountCents !== null) {
          bonusAmount = rule.flatAmountCents;
        }
      }

      if (bonusAmount > 0) {
        newBonuses.push({
          payrollId: payroll.id,
          bonusRuleId: rule.id,
          description: rule.name,
          amountCents: bonusAmount,
        });
        totalBonusCents += bonusAmount;
      }
    }

    // Delete existing bonuses (if reapplying)
    await prisma.bonus.deleteMany({
      where: { payrollId: payroll.id },
    });

    // Create new bonuses
    if (newBonuses.length > 0) {
      await prisma.bonus.createMany({
        data: newBonuses,
      });
    }

    // Update payroll with new bonus total
    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        bonusTotalCents: totalBonusCents,
        netPayCents: calculateNetPayCents({
          basePayCents: payroll.basePayCents,
          commissionCents: payroll.commissionCents,
          bonusTotalCents: totalBonusCents,
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
