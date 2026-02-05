import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = await getRole();
    if (role !== 'supervisor' && role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    const payroll = await prisma.payroll.findUnique({
      where: { id },
      include: { chatter: true },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    // Check authorization: supervisor can only mark paid for their team
    if (
      role === 'supervisor' &&
      payroll.chatter.supervisorId !== (await getRole())
    ) {
      // For supervisors, we need to get the acting user's ID
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (payroll.status !== 'approved') {
      return NextResponse.json(
        { error: 'Only approved payrolls can be marked as paid' },
        { status: 400 }
      );
    }

    const updated = await prisma.payroll.update({
      where: { id },
      data: { status: 'paid' },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to mark payroll as paid:', error);
    return NextResponse.json(
      { error: 'Failed to mark payroll as paid' },
      { status: 500 }
    );
  }
}
