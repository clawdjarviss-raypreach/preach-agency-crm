import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';
import type { BonusTargetType, BonusType } from '@prisma/client';

type Input = {
  name: unknown;
  description?: unknown;

  type: unknown;
  targetType?: unknown;

  isActive?: unknown;

  // legacy
  thresholdCents?: unknown;

  // new
  targetThreshold?: unknown;

  percentageBps?: unknown;
  flatAmountCents?: unknown;

  multiplier?: unknown;

  creatorId?: unknown;
  startDate?: unknown;
  endDate?: unknown;
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

function validate(input: Input):
  | {
      ok: true;
      data: {
        name: string;
        description: string | null;
        type: BonusType;
        targetType: BonusTargetType;
        isActive: boolean;
        thresholdCents: number | null;
        targetThreshold: number | null;
        percentageBps: number | null;
        flatAmountCents: number | null;
        multiplier: number;
        creatorId: string | null;
        startDate: Date | null;
        endDate: Date | null;
      };
    }
  | { ok: false; message: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, message: 'name is required' };

  const description = typeof input.description === 'string' ? input.description.trim() : '';

  const type = input.type;
  if (type !== 'percentage' && type !== 'flat' && type !== 'milestone') {
    return { ok: false, message: 'type must be percentage|flat|milestone' };
  }

  const targetTypeRaw = input.targetType;
  const targetType: BonusTargetType =
    typeof targetTypeRaw === 'string' && TARGET_TYPES.has(targetTypeRaw as BonusTargetType)
      ? (targetTypeRaw as BonusTargetType)
      : 'manual';

  const isActive = typeof input.isActive === 'boolean' ? input.isActive : true;

  const thresholdCents = asOptionalInt(input.thresholdCents);
  const targetThreshold = asOptionalInt(input.targetThreshold);
  const percentageBps = asOptionalInt(input.percentageBps);
  const flatAmountCents = asOptionalInt(input.flatAmountCents);

  const multiplierRaw = asOptionalFloat(input.multiplier);
  const multiplier = multiplierRaw == null ? 1.0 : multiplierRaw;

  const startDate = asOptionalDate(input.startDate);
  const endDate = asOptionalDate(input.endDate);

  const ints = { thresholdCents, targetThreshold, percentageBps, flatAmountCents };
  for (const [k, v] of Object.entries(ints)) {
    if (Number.isNaN(v)) return { ok: false, message: `${k} must be an integer` };
    if (typeof v === 'number' && v < 0) return { ok: false, message: `${k} must be >= 0` };
  }

  if (Number.isNaN(multiplier) || multiplier <= 0) {
    return { ok: false, message: 'multiplier must be a number > 0' };
  }

  if (startDate && Number.isNaN(startDate.getTime())) {
    return { ok: false, message: 'startDate is invalid' };
  }
  if (endDate && Number.isNaN(endDate.getTime())) {
    return { ok: false, message: 'endDate is invalid' };
  }
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, message: 'startDate must be <= endDate' };
  }

  const creatorId = typeof input.creatorId === 'string' && input.creatorId.trim() !== '' ? input.creatorId : null;

  if (type === 'percentage') {
    if (percentageBps == null && flatAmountCents == null) {
      return { ok: false, message: 'percentage rules require percentageBps or flatAmountCents' };
    }
    if (percentageBps != null && percentageBps > 10000) {
      return { ok: false, message: 'percentageBps must be <= 10000 (100.00%)' };
    }
  }

  if (type === 'flat') {
    if (flatAmountCents == null) return { ok: false, message: 'flatAmountCents is required for flat rules' };
  }

  if (type === 'milestone') {
    const effectiveThreshold = targetThreshold ?? thresholdCents;
    if (effectiveThreshold == null) {
      return { ok: false, message: 'targetThreshold is required for milestone rules' };
    }
    if (flatAmountCents == null) {
      return { ok: false, message: 'flatAmountCents is required for milestone rules' };
    }
  }

  return {
    ok: true,
    data: {
      name,
      description: description || null,
      type,
      targetType,
      isActive,
      thresholdCents: thresholdCents == null ? null : thresholdCents,
      targetThreshold: targetThreshold == null ? null : targetThreshold,
      percentageBps: percentageBps == null ? null : percentageBps,
      flatAmountCents: flatAmountCents == null ? null : flatAmountCents,
      multiplier,
      creatorId,
      startDate: startDate == null ? null : startDate,
      endDate: endDate == null ? null : endDate,
    },
  };
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = (await req.json()) as Input;
    const validated = validate(body);
    if (!validated.ok) return NextResponse.json({ error: validated.message }, { status: 400 });

    const updated = await prisma.bonusRule.update({
      where: { id },
      data: validated.data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error('Failed to update bonus rule:', error);
    return NextResponse.json({ error: 'Failed to update bonus rule' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const role = await getRole();
  if (role !== 'admin') return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    await prisma.bonusRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to delete bonus rule:', error);
    return NextResponse.json({ error: 'Failed to delete bonus rule' }, { status: 500 });
  }
}
