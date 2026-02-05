import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { CreatorStatus, Platform } from '@prisma/client';

const PLATFORMS = new Set<Platform>(['onlyfans', 'fansly', 'other']);
const STATUSES = new Set<CreatorStatus>(['active', 'paused', 'churned']);

export async function GET() {
  const role = await getRole();
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const creators = await prisma.creator.findMany({
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      username: true,
      displayName: true,
      platform: true,
      status: true,
    },
  });

  return NextResponse.json(creators);
}

export async function POST(req: NextRequest) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const platform = String(body.platform ?? '') as Platform;
    const username = String(body.username ?? '').trim();
    const displayName = body.displayName ? String(body.displayName).trim() : null;
    const status = String(body.status ?? '') as CreatorStatus;

    if (!PLATFORMS.has(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!STATUSES.has(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const existing = await prisma.creator.findUnique({
      where: { platform_username: { platform, username } },
      select: { id: true },
    });

    if (existing) {
      return NextResponse.json({ error: 'Creator already exists for this platform/username' }, { status: 400 });
    }

    const created = await prisma.creator.create({
      data: {
        platform,
        username,
        displayName: displayName || null,
        status,
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        platform: created.platform,
        username: created.username,
        displayName: created.displayName,
        status: created.status,
        createdAt: created.createdAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create creator:', error);
    return NextResponse.json({ error: 'Failed to create creator' }, { status: 500 });
  }
}
