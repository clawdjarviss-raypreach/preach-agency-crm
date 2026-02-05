import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

// Dev helper endpoint for scripts: fetch latest payroll (optionally for a payPeriod).
// Requires an authenticated role cookie (same as the app).

export async function GET(req: NextRequest) {
  try {
    if (process.env.NODE_ENV !== 'development') {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const role = await getRole();
    if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    const url = new URL(req.url);
    const payPeriodId = url.searchParams.get('payPeriodId') || undefined;

    const payroll = await prisma.payroll.findFirst({
      where: {
        ...(payPeriodId ? { payPeriodId } : {}),
      },
      orderBy: {
        payPeriod: { startDate: 'desc' },
      },
      include: {
        chatter: { select: { id: true, name: true, email: true } },
        payPeriod: true,
        bonuses: true,
      },
    });

    if (!payroll) {
      return NextResponse.json({ error: 'No payroll found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, payroll });
  } catch (error) {
    console.error('Dev payroll lookup failed:', error);
    return NextResponse.json({ error: 'Dev payroll lookup failed' }, { status: 500 });
  }
}
