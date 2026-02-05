import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { approve } = body;

    const payroll = await prisma.payroll.findUnique({
      where: { id },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'Payroll not found' }, { status: 404 });
    }

    if (approve === true) {
      // Approve: set status to approved + approvalId/At
      const updated = await prisma.payroll.update({
        where: { id },
        data: {
          status: 'approved',
          approvedById: role === 'admin' ? 'admin-id' : undefined,
          approvedAt: new Date(),
        },
      });

      return NextResponse.json(updated);
    } else if (approve === false) {
      // Unapprove: revert to draft
      const updated = await prisma.payroll.update({
        where: { id },
        data: {
          status: 'draft',
          approvedById: null,
          approvedAt: null,
        },
      });

      return NextResponse.json(updated);
    } else {
      return NextResponse.json(
        { error: 'Invalid approve value' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Failed to update payroll:', error);
    return NextResponse.json(
      { error: 'Failed to update payroll' },
      { status: 500 }
    );
  }
}
