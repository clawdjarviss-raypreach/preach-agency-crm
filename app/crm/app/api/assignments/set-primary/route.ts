import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const { assignmentId } = body;

    if (!assignmentId) {
      return NextResponse.json({ error: 'assignmentId required' }, { status: 400 });
    }

    const assignment = await prisma.chatterCreator.findUnique({
      where: { id: assignmentId },
    });

    if (!assignment) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }

    if (assignment.unassignedAt) {
      return NextResponse.json({ error: 'Cannot set primary on an unassigned (historical) assignment' }, { status: 400 });
    }

    // Clear other *active* primary assignments for this chatter
    await prisma.chatterCreator.updateMany({
      where: {
        chatterId: assignment.chatterId,
        unassignedAt: null,
        isPrimary: true,
        NOT: { id: assignmentId },
      },
      data: { isPrimary: false },
    });

    // Set this one as primary (active only)
    const updated = await prisma.chatterCreator.update({
      where: { id: assignmentId },
      data: { isPrimary: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to set primary assignment:', error);
    return NextResponse.json(
      { error: 'Failed to set primary assignment' },
      { status: 500 }
    );
  }
}
