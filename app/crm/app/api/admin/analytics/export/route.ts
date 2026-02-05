import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

function isoDayUTC(d: Date): string {
  return d.toISOString().split('T')[0];
}

export async function GET() {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const now = new Date();
    const start = new Date(now);
    start.setUTCDate(now.getUTCDate() - 13);
    start.setUTCHours(0, 0, 0, 0);

    const [kpiSnapshots14d, shifts14d] = await Promise.all([
      prisma.kpiSnapshot.findMany({
        where: { snapshotDate: { gte: start } },
        select: {
          snapshotDate: true,
          revenueCents: true,
          tipsReceivedCents: true,
        },
      }),
      prisma.shift.findMany({
        where: {
          clockIn: { gte: start },
          clockOut: { not: null },
        },
        select: {
          clockIn: true,
          clockOut: true,
          breakMinutes: true,
        },
      }),
    ]);

    const dayKeys: string[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      dayKeys.push(isoDayUTC(d));
    }

    const revenueByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
    const tipsByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));
    const minutesByDay = new Map<string, number>(dayKeys.map((k) => [k, 0]));

    for (const s of kpiSnapshots14d) {
      const k = isoDayUTC(new Date(s.snapshotDate));
      if (!revenueByDay.has(k)) continue;
      revenueByDay.set(k, (revenueByDay.get(k) ?? 0) + (s.revenueCents ?? 0));
      tipsByDay.set(k, (tipsByDay.get(k) ?? 0) + (s.tipsReceivedCents ?? 0));
    }

    for (const sh of shifts14d) {
      const k = isoDayUTC(new Date(sh.clockIn));
      if (!minutesByDay.has(k)) continue;
      const clockIn = new Date(sh.clockIn).getTime();
      const clockOut = new Date(sh.clockOut!).getTime();
      const minutes = Math.max(
        0,
        Math.floor((clockOut - clockIn) / 60000) - (sh.breakMinutes ?? 0)
      );
      minutesByDay.set(k, (minutesByDay.get(k) ?? 0) + minutes);
    }

    const headers = ['date', 'revenue_usd', 'tips_usd', 'hours_worked'];
    const rows = dayKeys.map((k) => {
      const revenueUsd = ((revenueByDay.get(k) ?? 0) / 100).toFixed(2);
      const tipsUsd = ((tipsByDay.get(k) ?? 0) / 100).toFixed(2);
      const hours = (((minutesByDay.get(k) ?? 0) as number) / 60).toFixed(2);
      return [k, revenueUsd, tipsUsd, hours];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="analytics-14d-${isoDayUTC(now)}.csv"`,
      },
    });
  } catch (error) {
    console.error('Failed to export analytics:', error);
    return NextResponse.json(
      { error: 'Failed to export analytics' },
      { status: 500 }
    );
  }
}
