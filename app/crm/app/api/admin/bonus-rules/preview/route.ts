import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import { evaluateBonuses } from '@/lib/bonus-engine';
import type { BonusRule, BonusTargetType, BonusType } from '@prisma/client';

type Input = {
  rule: {
    name: unknown;
    description?: unknown;
    type: unknown;
    targetType?: unknown;
    targetThreshold?: unknown;
    thresholdCents?: unknown;
    percentageBps?: unknown;
    flatAmountCents?: unknown;
    multiplier?: unknown;
    creatorId?: unknown;
    startDate?: unknown;
    endDate?: unknown;
    isActive?: unknown;
  };
  periodStart?: unknown;
  periodEnd?: unknown;
};

const TARGET_TYPES = new Set<BonusTargetType>([
  'revenue',
  'net_revenue',
  'messages_sent',
  'new_subs',
  'tips',
  'manual',
]);

function asOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isInteger(Number(v))) return Number(v);
  return NaN;
}

function asOptionalFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return NaN;
}

function asOptionalDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? (NaN as unknown as Date) : v;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return NaN as unknown as Date;
    return d;
  }
  return NaN as unknown as Date;
}

function normalizeRule(input: Input['rule']): { ok: true; rule: BonusRule } | { ok: false; message: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, message: 'rule.name is required' };

  const type = input.type;
  if (type !== 'percentage' && type !== 'flat' && type !== 'milestone') {
    return { ok: false, message: 'rule.type must be percentage|flat|milestone' };
  }

  const targetTypeRaw = input.targetType;
  const targetType: BonusTargetType =
    typeof targetTypeRaw === 'string' && TARGET_TYPES.has(targetTypeRaw as BonusTargetType)
      ? (targetTypeRaw as BonusTargetType)
      : 'manual';

  const thresholdCents = asOptionalInt(input.thresholdCents);
  const targetThreshold = asOptionalInt(input.targetThreshold);
  const percentageBps = asOptionalInt(input.percentageBps);
  const flatAmountCents = asOptionalInt(input.flatAmountCents);

  if (Number.isNaN(thresholdCents) || Number.isNaN(targetThreshold) || Number.isNaN(percentageBps) || Number.isNaN(flatAmountCents)) {
    return { ok: false, message: 'rule numeric fields must be integers' };
  }

  const multiplierRaw = asOptionalFloat(input.multiplier);
  const multiplier = multiplierRaw == null ? 1.0 : multiplierRaw;
  if (Number.isNaN(multiplier) || multiplier <= 0) {
    return { ok: false, message: 'rule.multiplier must be > 0' };
  }

  const creatorId = typeof input.creatorId === 'string' && input.creatorId.trim() !== '' ? input.creatorId : null;

  const startDate = asOptionalDate(input.startDate);
  const endDate = asOptionalDate(input.endDate);
  if (startDate && Number.isNaN(startDate.getTime())) return { ok: false, message: 'rule.startDate is invalid' };
  if (endDate && Number.isNaN(endDate.getTime())) return { ok: false, message: 'rule.endDate is invalid' };

  const isActive = typeof input.isActive === 'boolean' ? input.isActive : true;

  const description = typeof input.description === 'string' ? input.description.trim() : null;

  const now = new Date();

  // Build a temp BonusRule object for evaluation (not persisted).
  const rule: BonusRule = {
    id: 'preview',
    name,
    description: description && description.length > 0 ? description : null,
    type: type as BonusType,
    targetType,
    thresholdCents: thresholdCents ?? null,
    targetThreshold: targetThreshold ?? null,
    percentageBps: percentageBps ?? null,
    flatAmountCents: flatAmountCents ?? null,
    multiplier,
    creatorId,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    isActive,
    createdAt: now,
  };

  return { ok: true, rule };
}

export async function POST(req: NextRequest) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  try {
    const body = (await req.json().catch(() => null)) as Input | null;
    if (!body?.rule) return NextResponse.json({ error: 'rule is required' }, { status: 400 });

    const normalized = normalizeRule(body.rule);
    if (!normalized.ok) return NextResponse.json({ error: normalized.message }, { status: 400 });

    const now = new Date();
    const defaultEnd = now;
    const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const periodStart = body.periodStart ? new Date(String(body.periodStart)) : defaultStart;
    const periodEnd = body.periodEnd ? new Date(String(body.periodEnd)) : defaultEnd;

    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return NextResponse.json({ error: 'Invalid periodStart/periodEnd' }, { status: 400 });
    }

    const chatters = await prisma.user.findMany({
      where: { role: 'chatter' },
      select: { id: true, name: true, email: true },
      take: 1000,
    });

    const kpiAgg = await prisma.kpiSnapshot.groupBy({
      by: ['chatterId'],
      where: { snapshotDate: { gte: periodStart, lte: periodEnd } },
      _sum: {
        revenueCents: true,
        messagesSent: true,
        newSubs: true,
        tipsReceivedCents: true,
      },
    });

    const kpiByChatter = new Map(
      kpiAgg.map((r) => [
        r.chatterId,
        {
          grossSalesCents: r._sum.revenueCents ?? 0,
          messagesSent: r._sum.messagesSent ?? 0,
          newSubs: r._sum.newSubs ?? 0,
          tipsCents: r._sum.tipsReceivedCents ?? 0,
        },
      ])
    );

    const assignments = await prisma.chatterCreator.findMany({
      where: { chatterId: { in: chatters.map((c) => c.id) }, unassignedAt: null },
      select: { chatterId: true, creatorId: true },
      take: 50000,
    });

    const assignedCreatorsByChatter = new Map<string, string[]>();
    for (const a of assignments) {
      const cur = assignedCreatorsByChatter.get(a.chatterId) ?? [];
      cur.push(a.creatorId);
      assignedCreatorsByChatter.set(a.chatterId, cur);
    }

    const qualified: Array<{
      chatterId: string;
      chatterName: string;
      chatterEmail: string;
      amountCents: number;
      description: string;
    }> = [];

    for (const chatter of chatters) {
      const kpi = kpiByChatter.get(chatter.id) ?? {
        grossSalesCents: 0,
        messagesSent: 0,
        newSubs: 0,
        tipsCents: 0,
      };

      const netSalesCents = Math.round(kpi.grossSalesCents * 0.8);

      const bonuses = await evaluateBonuses(
        {
          chatterId: chatter.id,
          payPeriodId: 'preview',
          periodStart,
          periodEnd,
          grossSalesCents: kpi.grossSalesCents,
          netSalesCents,
          messagesSent: kpi.messagesSent,
          newSubs: kpi.newSubs,
          tipsCents: kpi.tipsCents,
          assignedCreatorIds: assignedCreatorsByChatter.get(chatter.id) ?? [],
        },
        [normalized.rule]
      );

      if (bonuses.length > 0) {
        // With a single rule, this is either 0 or 1, but keep it generic.
        for (const b of bonuses) {
          qualified.push({
            chatterId: chatter.id,
            chatterName: chatter.name,
            chatterEmail: chatter.email,
            amountCents: b.amountCents,
            description: b.description,
          });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      qualified,
    });
  } catch (error) {
    console.error('Failed to preview bonus rule:', error);
    return NextResponse.json({ error: 'Failed to preview bonus rule' }, { status: 500 });
  }
}
