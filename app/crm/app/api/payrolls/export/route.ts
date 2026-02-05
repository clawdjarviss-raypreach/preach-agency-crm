import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { getActingUserEmail } from '@/lib/acting-user';

export async function GET() {
  try {
    const role = await getRole();
    if (role !== 'admin' && role !== 'supervisor') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    let payrolls;

    if (role === 'admin') {
      // Admin exports all payrolls
      payrolls = await prisma.payroll.findMany({
        include: {
          chatter: { select: { name: true, email: true } },
          payPeriod: true,
          bonuses: true,
        },
        orderBy: { payPeriod: { startDate: 'desc' } },
      });
    } else {
      // Supervisor exports their team's payrolls
      const email = await getActingUserEmail();
      const supervisor = email ? await prisma.user.findUnique({ where: { email } }) : null;

      if (!supervisor) {
        return NextResponse.json({ error: 'Supervisor not found' }, { status: 404 });
      }

      payrolls = await prisma.payroll.findMany({
        where: { chatter: { supervisorId: supervisor.id } },
        include: {
          chatter: { select: { name: true, email: true } },
          payPeriod: true,
          bonuses: true,
        },
        orderBy: { payPeriod: { startDate: 'desc' } },
      });
    }

    // Generate CSV with USD formatting
    const headers = [
      'Chatter',
      'Email',
      'Period Start',
      'Period End',
      'Hours Worked',
      'Base Pay (USD)',
      'Bonus Total (USD)',
      'Net Pay (USD)',
      'Status',
    ];

    const usdFormatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const rows = payrolls.map((p) => [
      p.chatter.name,
      p.chatter.email,
      new Date(p.payPeriod.startDate).toISOString().split('T')[0],
      new Date(p.payPeriod.endDate).toISOString().split('T')[0],
      (p.hoursWorkedMinutes / 60).toFixed(2),
      usdFormatter.format(p.basePayCents / 100),
      usdFormatter.format(p.bonusTotalCents / 100),
      usdFormatter.format(p.netPayCents / 100),
      p.status,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="payrolls-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export payrolls:', error);
    return NextResponse.json(
      { error: 'Failed to export payrolls' },
      { status: 500 }
    );
  }
}
