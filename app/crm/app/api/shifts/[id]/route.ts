import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { getActingUserEmail } from '@/lib/acting-user';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const role = await getRole();

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { breakMinutes, notes, approve } = body as {
      breakMinutes?: number;
      notes?: string | null;
      approve?: boolean;
    };

    const shift = await prisma.shift.findUnique({
      where: { id },
      include: { chatter: { select: { name: true, supervisorId: true } } },
    });

    if (!shift) {
      return NextResponse.json({ error: 'Shift not found' }, { status: 404 });
    }

    // Authorization:
    // - admin: can edit + approve/unapprove any shift
    // - supervisor: can (un)approve shifts only for their direct chatters; cannot edit fields
    let approverId: string | null = null;
    if (role === 'admin' || role === 'supervisor') {
      const email = await getActingUserEmail();
      const approver = email ? await prisma.user.findUnique({ where: { email } }) : null;
      approverId = approver?.id ?? null;

      if (role === 'supervisor') {
        if (!approverId) {
          return NextResponse.json({ error: 'Approver not found' }, { status: 400 });
        }

        if (shift.chatter.supervisorId !== approverId) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }
      }
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    let approvalPatch: { approvedAt?: Date | null; approvedById?: string | null } = {};
    if (approve === true) {
      if (!shift.clockOut) {
        return NextResponse.json(
          { error: 'Cannot approve an ongoing shift (missing clockOut)' },
          { status: 400 }
        );
      }

      if (!approverId) {
        return NextResponse.json({ error: 'Approver not found' }, { status: 400 });
      }

      approvalPatch = { approvedAt: new Date(), approvedById: approverId };
    } else if (approve === false) {
      approvalPatch = { approvedAt: null, approvedById: null };
    }

    const updated = await prisma.shift.update({
      where: { id },
      data: {
        ...(role === 'admin' &&
          breakMinutes !== undefined && {
            breakMinutes: Math.max(0, Number.isFinite(breakMinutes) ? breakMinutes : 0),
          }),
        ...(role === 'admin' && notes !== undefined && { notes }),
        ...approvalPatch,
      },
      include: {
        chatter: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update shift:', error);
    return NextResponse.json({ error: 'Failed to update shift' }, { status: 500 });
  }
}
