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

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { chatter: true },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Verify the chatter is under this supervisor
    if (shift.chatter.supervisorId !== supervisor.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        approvedById: supervisor.id,
        approvedAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to approve shift:', error);
    return NextResponse.json({ error: 'Failed to approve shift' }, { status: 500 });
  }
}
