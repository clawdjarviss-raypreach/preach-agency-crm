import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function GET() {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const rules = await prisma.bonusRule.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json(rules);
  } catch (error) {
    console.error('Failed to fetch bonus rules:', error);
    return NextResponse.json({ error: 'Failed to fetch bonus rules' }, { status: 500 });
  }
}
