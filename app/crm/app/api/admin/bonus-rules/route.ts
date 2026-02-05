import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

export async function GET() {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const rules = await prisma.bonusRule.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json(rules);
}
