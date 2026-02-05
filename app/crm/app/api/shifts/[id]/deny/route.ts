import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { getActingUserEmail } from '@/lib/acting-user';

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
    const body = await req.json().catch(() => ({}));
    const { notes } = body;

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { chatter: { select: { supervisorId: true } } },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Check authorization: supervisor can only deny shifts from their team
    if (role === 'supervisor') {
      const email = await getActingUserEmail();
      const supervisor = email
        ? await prisma.user.findUnique({ where: { email } })
        : null;

      if (!supervisor || shift.chatter.supervisorId !== supervisor.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
      }
    }

    if (shift.approvedAt) {
      return NextResponse.json(
        { error: 'Already approved. Cannot deny.' },
        { status: 400 }
      );
    }

    // Update shift: set notes (append "DENIED" marker), keep approvedAt null
    const newNotes = notes
      ? `[DENIED] ${notes} (prev: ${shift.notes || 'N/A'})`
      : '[DENIED] No reason provided';

    const updated = await prisma.shift.update({
      where: { id },
      data: { notes: newNotes },
      include: {
        chatter: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to deny shift:', error);
    return NextResponse.json(
      { error: 'Failed to deny shift' },
      { status: 500 }
    );
  }
}
