import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { name, type, isActive, thresholdCents, percentageBps, flatAmountCents } = body;

    const rule = await prisma.bonusRule.create({
      data: {
        name,
        type,
        isActive,
        thresholdCents,
        percentageBps,
        flatAmountCents,
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error('Failed to create bonus rule:', error);
    return NextResponse.json({ error: 'Failed to create bonus rule' }, { status: 500 });
  }
}
