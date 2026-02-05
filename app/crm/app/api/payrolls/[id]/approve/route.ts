import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getActingUserEmail } from '@/lib/acting-user';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const email = await getActingUserEmail();
    const supervisor = email ? await prisma.user.findUnique({ where: { email } }) : null;

    if (!supervisor || supervisor.role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: { chatter: true },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    // Verify the chatter is under this supervisor
    if (payroll.chatter.supervisorId !== supervisor.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updated = await prisma.payroll.update({
      where: { id },
      data: {
        status: 'approved',
        approvedById: supervisor.id,
        approvedAt: new Date(),
      },
      include: {
        chatter: { select: { name: true } },
        payPeriod: true,
        bonuses: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to approve payroll:', error);
    return NextResponse.json({ error: 'Failed to approve payroll' }, { status: 500 });
  }
}
