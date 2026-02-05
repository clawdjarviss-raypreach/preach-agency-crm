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
    const { supervisorId, hourlyRateCents, commissionBps } = body;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If supervisorId is provided, validate it exists
    if (supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
      if (!supervisor || supervisor.role !== 'supervisor') {
        return NextResponse.json(
          { error: 'Supervisor not found or invalid' },
          { status: 400 }
        );
      }
    }

    if (hourlyRateCents !== undefined) {
      if (hourlyRateCents !== null) {
        if (
          typeof hourlyRateCents !== 'number' ||
          !Number.isInteger(hourlyRateCents) ||
          hourlyRateCents < 0
        ) {
          return NextResponse.json({ error: 'Invalid hourlyRateCents' }, { status: 400 });
        }
      }
    }

    if (commissionBps !== undefined) {
      if (
        typeof commissionBps !== 'number' ||
        !Number.isInteger(commissionBps) ||
        commissionBps < 0 ||
        commissionBps > 10000
      ) {
        return NextResponse.json({ error: 'Invalid commissionBps' }, { status: 400 });
      }
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(supervisorId !== undefined && { supervisorId: supervisorId || null }),
        ...(hourlyRateCents !== undefined && { hourlyRateCents }),
        ...(commissionBps !== undefined && { commissionBps }),
      },
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      role: updated.role,
      status: updated.status,
      supervisorId: updated.supervisorId,
      hourlyRateCents: updated.hourlyRateCents,
      commissionBps: updated.commissionBps,
      createdAt: updated.createdAt,
    });
  } catch (error) {
    console.error('Failed to update user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}
