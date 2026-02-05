import type { BonusRule, BonusTargetType, BonusType } from '@prisma/client';

export interface BonusEvalContext {
  chatterId: string;
  payPeriodId: string;
  periodStart: Date;
  periodEnd: Date;

  grossSalesCents: number;
  netSalesCents: number;
  messagesSent: number;
  newSubs: number;
  tipsCents: number;

  assignedCreatorIds: string[];
}

export interface EvaluatedBonus {
  ruleId: string;
  ruleName: string;
  amountCents: number;
  description: string;
}

export async function evaluateBonuses(
  ctx: BonusEvalContext,
  rules: BonusRule[]
): Promise<EvaluatedBonus[]> {
  const bonuses: EvaluatedBonus[] = [];

  // Evaluate date-scoped rules against the end of the pay period (matches spec).
  const now = ctx.periodEnd;

  for (const rule of rules) {
    if (!rule.isActive) continue;

    // Null dates treated as always active.
    if (rule.startDate && now < rule.startDate) continue;
    if (rule.endDate && now > rule.endDate) continue;

    // Creator-scoped rules only apply if chatter is assigned to that creator.
    if (rule.creatorId && !ctx.assignedCreatorIds.includes(rule.creatorId)) continue;

    const { qualifies, baseAmountCents } = evaluateRule(rule, ctx);
    if (!qualifies) continue;

    const multiplier = Number.isFinite(rule.multiplier) ? rule.multiplier : 1;
    const finalAmountCents = Math.round(baseAmountCents * multiplier);

    if (finalAmountCents <= 0) continue;

    bonuses.push({
      ruleId: rule.id,
      ruleName: rule.name,
      amountCents: finalAmountCents,
      description: generateBonusDescription(rule),
    });
  }

  return bonuses;
}

function evaluateRule(
  rule: BonusRule,
  ctx: BonusEvalContext
): { qualifies: boolean; baseAmountCents: number } {
  if (rule.targetType === 'manual') return { qualifies: false, baseAmountCents: 0 };

  const metric = getMetric(rule.targetType, ctx);

  const threshold = rule.targetThreshold ?? rule.thresholdCents ?? 0;
  if (metric < threshold) return { qualifies: false, baseAmountCents: 0 };

  const baseAmountCents = calculateBaseAmount(rule.type, rule, metric);
  return { qualifies: true, baseAmountCents };
}

function getMetric(targetType: BonusTargetType, ctx: BonusEvalContext): number {
  switch (targetType) {
    case 'revenue':
      return ctx.grossSalesCents;
    case 'net_revenue':
      return ctx.netSalesCents;
    case 'messages_sent':
      return ctx.messagesSent;
    case 'new_subs':
      return ctx.newSubs;
    case 'tips':
      return ctx.tipsCents;
    case 'manual':
    default:
      return 0;
  }
}

function calculateBaseAmount(type: BonusType, rule: BonusRule, metric: number): number {
  switch (type) {
    case 'percentage': {
      const bps = rule.percentageBps ?? 0;
      if (bps !== 0) {
        return Math.round((metric * bps) / 10000);
      }
      // Allow a "percentage" rule to still award a flat base amount
      // (useful for promos where multiplier is the main feature).
      return rule.flatAmountCents ?? 0;
    }
    case 'flat':
      return rule.flatAmountCents ?? 0;
    case 'milestone':
      return rule.flatAmountCents ?? 0;
    default:
      return 0;
  }
}

function generateBonusDescription(rule: BonusRule): string {
  const targetLabel: Record<BonusTargetType, string> = {
    revenue: 'gross sales',
    net_revenue: 'net sales',
    messages_sent: 'messages',
    new_subs: 'new subs',
    tips: 'tips',
    manual: '',
  };

  const threshold = rule.targetThreshold ?? rule.thresholdCents ?? 0;

  const isMoneyTarget =
    rule.targetType === 'revenue' || rule.targetType === 'net_revenue' || rule.targetType === 'tips';

  if (rule.type === 'milestone') {
    const formatted = isMoneyTarget
      ? `$${Math.round(threshold / 100).toFixed(0)}`
      : threshold.toString();
    return `${rule.name}: Hit ${formatted} ${targetLabel[rule.targetType]}`;
  }

  if (rule.type === 'percentage') {
    const pct = (rule.percentageBps ?? 0) / 100;
    return `${rule.name}: ${pct}% of ${targetLabel[rule.targetType]}`;
  }

  return rule.name;
}
