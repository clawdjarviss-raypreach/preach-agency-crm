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
    const { status, displayName } = body;

    const creator = await prisma.creator.findUnique({
      where: { id },
    });

    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const updated = await prisma.creator.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(displayName !== undefined && { displayName }),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update creator:', error);
    return NextResponse.json(
      { error: 'Failed to update creator' },
      { status: 500 }
    );
  }
}
