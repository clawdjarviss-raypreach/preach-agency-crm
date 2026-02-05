import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRole } from '@/lib/auth';

type BonusType = 'percentage' | 'flat' | 'milestone';

type Input = {
  name: unknown;
  type: unknown;
  isActive: unknown;
  thresholdCents: unknown;
  percentageBps: unknown;
  flatAmountCents: unknown;
};

function asOptionalInt(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isInteger(Number(v))) return Number(v);
  return NaN;
}

function validate(input: Input):
  | {
      ok: true;
      data: {
        name: string;
        type: BonusType;
        isActive: boolean;
        thresholdCents: number | null;
        percentageBps: number | null;
        flatAmountCents: number | null;
      };
    }
  | { ok: false; message: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return { ok: false, message: 'name is required' };

  const type = input.type;
  if (type !== 'percentage' && type !== 'flat' && type !== 'milestone') {
    return { ok: false, message: 'type must be percentage|flat|milestone' };
  }

  const isActive = typeof input.isActive === 'boolean' ? input.isActive : true;

  const thresholdCents = asOptionalInt(input.thresholdCents);
  const percentageBps = asOptionalInt(input.percentageBps);
  const flatAmountCents = asOptionalInt(input.flatAmountCents);

  const ints = { thresholdCents, percentageBps, flatAmountCents };
  for (const [k, v] of Object.entries(ints)) {
    if (Number.isNaN(v)) return { ok: false, message: `${k} must be an integer (cents/bps)` };
    if (typeof v === 'number' && v < 0) return { ok: false, message: `${k} must be >= 0` };
  }

  if (type === 'percentage') {
    if (percentageBps == null) return { ok: false, message: 'percentageBps is required for percentage rules' };
    if (percentageBps > 10000) return { ok: false, message: 'percentageBps must be <= 10000 (100.00%)' };
  }

  if (type === 'flat') {
    if (flatAmountCents == null) return { ok: false, message: 'flatAmountCents is required for flat rules' };
  }

  if (type === 'milestone') {
    if (thresholdCents == null) return { ok: false, message: 'thresholdCents is required for milestone rules' };
    if (flatAmountCents == null) return { ok: false, message: 'flatAmountCents is required for milestone rules' };
  }

  return {
    ok: true,
    data: {
      name,
      type,
      isActive,
      thresholdCents: thresholdCents == null ? null : thresholdCents,
      percentageBps: percentageBps == null ? null : percentageBps,
      flatAmountCents: flatAmountCents == null ? null : flatAmountCents,
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
