import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { KpiSource } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const role = await getRole();
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await req.json();
    const {
      chatterId,
      creatorId,
      snapshotDate,
      revenueCents,
      messagesSent,
      tipsReceivedCents,
      newSubs,
      source,
      rawData,
      messagesReceived,
      ppvRevenueCents,
      subsRenewed,
      avgResponseTimeSec,
    } = body;

    if (!chatterId || !creatorId || !snapshotDate) {
      return NextResponse.json(
        { error: 'chatterId, creatorId, and snapshotDate are required' },
        { status: 400 }
      );
    }

    // Check if chatter and creator exist
    const [chatter, creator] = await Promise.all([
      prisma.user.findUnique({ where: { id: chatterId } }),
      prisma.creator.findUnique({ where: { id: creatorId } }),
    ]);

    if (!chatter) {
      return NextResponse.json({ error: 'Chatter not found' }, { status: 404 });
    }
    if (!creator) {
      return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
    }

    const allowedSources: readonly KpiSource[] = [
      'manual',
      'creatorhero_scrape',
      'onlymonster_api',
      'discord',
    ];

    const normalizedSource: KpiSource =
      (typeof source === 'string' && (allowedSources as string[]).includes(source))
        ? (source as KpiSource)
        : 'manual';

    const snapshot = await prisma.kpiSnapshot.create({
      data: {
        chatterId,
        creatorId,
        snapshotDate: new Date(snapshotDate),
        revenueCents: revenueCents ?? null,
        messagesSent: messagesSent ?? null,
        messagesReceived: messagesReceived ?? null,
        tipsReceivedCents: tipsReceivedCents ?? null,
        ppvRevenueCents: ppvRevenueCents ?? null,
        subsRenewed: subsRenewed ?? null,
        newSubs: newSubs ?? null,
        avgResponseTimeSec: avgResponseTimeSec ?? null,
        // Allow explicit sources for structured imports (e.g. Discord paste)
        source: normalizedSource,
        rawData: rawData ?? null,
      },
    });

    return NextResponse.json(
      {
        id: snapshot.id,
        chatterId: snapshot.chatterId,
        creatorId: snapshot.creatorId,
        snapshotDate: snapshot.snapshotDate.toISOString().split('T')[0],
        revenueCents: snapshot.revenueCents,
        messagesSent: snapshot.messagesSent,
        tipsReceivedCents: snapshot.tipsReceivedCents,
        newSubs: snapshot.newSubs,
        source: snapshot.source,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Failed to create KPI snapshot:', error);
    return NextResponse.json(
      { error: 'Failed to create KPI snapshot' },
      { status: 500 }
    );
  }
}
