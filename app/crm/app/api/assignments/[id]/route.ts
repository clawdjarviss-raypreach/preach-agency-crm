import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

// Soft-unassign: keep history by setting unassignedAt
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { id } = await params;

    const updated = await prisma.chatterCreator.update({
      where: { id },
      data: { unassignedAt: new Date(), isPrimary: false },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to unassign assignment:', error);
    return NextResponse.json({ error: 'Failed to unassign assignment' }, { status: 500 });
  }
}
