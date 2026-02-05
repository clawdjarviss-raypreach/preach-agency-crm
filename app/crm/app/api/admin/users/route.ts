import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import crypto from 'crypto';

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      email,
      password,
      role: userRole,
      status,
      supervisorId,
      hourlyRateCents,
      commissionBps,
    } = body;

    if (!name || !email || !password || !userRole || !status) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Optional supervisor assignment + hourly rate (mostly for chatters)
    if (supervisorId) {
      const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
      if (!supervisor || supervisor.role !== 'supervisor') {
        return NextResponse.json(
          { error: 'Invalid supervisorId' },
          { status: 400 }
        );
      }
    }

    if (hourlyRateCents !== null && hourlyRateCents !== undefined) {
      if (
        typeof hourlyRateCents !== 'number' ||
        !Number.isInteger(hourlyRateCents) ||
        hourlyRateCents < 0
      ) {
        return NextResponse.json({ error: 'Invalid hourlyRateCents' }, { status: 400 });
      }
    }

    if (commissionBps !== null && commissionBps !== undefined) {
      if (
        typeof commissionBps !== 'number' ||
        !Number.isInteger(commissionBps) ||
        commissionBps < 0 ||
        commissionBps > 10000
      ) {
        return NextResponse.json({ error: 'Invalid commissionBps' }, { status: 400 });
      }
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: userRole,
        status,
        supervisorId: supervisorId ?? null,
        hourlyRateCents: hourlyRateCents ?? null,
        commissionBps: commissionBps ?? 0,
      },
    });

    return NextResponse.json(
      {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        supervisorId: user.supervisorId,
        hourlyRateCents: user.hourlyRateCents,
        commissionBps: user.commissionBps,
        createdAt: user.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}
