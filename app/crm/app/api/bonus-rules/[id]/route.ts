import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, type, isActive, thresholdCents, percentageBps, flatAmountCents } = body;

    const rule = await prisma.bonusRule.update({
      where: { id },
      data: {
        name,
        type,
        isActive,
        thresholdCents,
        percentageBps,
        flatAmountCents,
      },
    });

    return NextResponse.json(rule);
  } catch (error) {
    console.error('Failed to update bonus rule:', error);
    return NextResponse.json({ error: 'Failed to update bonus rule' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const { id } = await params;

    await prisma.bonusRule.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete bonus rule:', error);
    return NextResponse.json({ error: 'Failed to delete bonus rule' }, { status: 500 });
  }
}
