export type FanSegment = "vip" | "whale" | "core" | "casual" | "new" | "unknown";

export type VipAssignmentStrategy =
  | "top_performer"
  | "round_robin"
  | "specific_chatters";

export type QueueMessageForRouting = {
  id: string;
  creatorId: string;
  fanSegment: FanSegment;
  priority: "critical" | "high" | "normal" | "low";
  receivedAt: number;
};

export type RoutingCandidate = {
  chatterId: string;
  isOnline: boolean;
  workloadOpenCount: number;
  performanceScore: number;
};

export type RoutingConfig = {
  autoRoutingEnabled: boolean;
  vipAssignmentStrategy: VipAssignmentStrategy;
  vipSpecificChatterIds?: string[];
  whalePriorityBoostEnabled: boolean;
  workloadBalancingThreshold: number;
  roundRobinCursor?: number;
};

export type RoutingInput = {
  message: QueueMessageForRouting;
  candidates: RoutingCandidate[];
  config: RoutingConfig;
};

export type RoutingDecision = {
  chatterId: string | null;
  reasons: string[];
  nextRoundRobinCursor?: number;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function log10Safe(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  // eslint-disable-next-line no-restricted-properties
  return Math.log(n) / Math.LN10;
}

function baseScoreForCandidate(
  message: QueueMessageForRouting,
  c: RoutingCandidate,
  config: RoutingConfig
): { score: number; reasons: string[] } {
  let score = 100;
  const reasons: string[] = [];

  // Availability
  if (c.isOnline) {
    score += 20;
    reasons.push("Online: +20");
  } else {
    reasons.push("Offline: +0");
  }

  // Workload (penalize)
  const loadPenalty = clamp(c.workloadOpenCount * 3, 0, 30);
  score -= loadPenalty;
  reasons.push(`Workload(${c.workloadOpenCount}): -${loadPenalty}`);

  // Threshold (harder penalty)
  if (c.workloadOpenCount > config.workloadBalancingThreshold) {
    score -= 30;
    reasons.push(`Over threshold(${config.workloadBalancingThreshold}): -30`);
  }

  // Performance: normalize via log10 so big sales values don't dominate.
  // Give VIP/Whale more weight on performance.
  const perfWeight = message.fanSegment === "vip" || message.fanSegment === "whale" ? 14 : 10;
  const perfBonus = clamp(log10Safe(c.performanceScore + 1) * perfWeight, 0, 30);
  score += perfBonus;
  reasons.push(`Performance: +${Math.round(perfBonus)}`);

  return { score, reasons };
}

function pickLowestWorkload(candidates: RoutingCandidate[]): RoutingCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => a.workloadOpenCount - b.workloadOpenCount);
  return sorted[0] ?? null;
}

export function calculateOptimalAssignmentWithMeta(input: RoutingInput): RoutingDecision {
  const { message, candidates, config } = input;

  if (!config.autoRoutingEnabled) {
    return { chatterId: null, reasons: ["Auto-routing disabled"] };
  }

  if (candidates.length === 0) {
    return { chatterId: null, reasons: ["No candidates"] };
  }

  // Apply VIP strategy filtering when relevant.
  let eligible = candidates;
  if (message.fanSegment === "vip") {
    if (config.vipAssignmentStrategy === "specific_chatters") {
      const allow = new Set((config.vipSpecificChatterIds || []).filter(Boolean));
      const filtered = eligible.filter((c) => allow.has(c.chatterId));
      if (filtered.length > 0) eligible = filtered;
    }
  }

  // Special-case VIP top performer: pick highest performance among "reasonable" workload.
  if (message.fanSegment === "vip" && config.vipAssignmentStrategy === "top_performer") {
    const reasonable = eligible.filter((c) => c.workloadOpenCount <= config.workloadBalancingThreshold);
    const pool = reasonable.length > 0 ? reasonable : eligible;

    const onlinePool = pool.filter((c) => c.isOnline);
    const finalPool = onlinePool.length > 0 ? onlinePool : pool;

    const best = [...finalPool].sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0))[0];
    if (best) {
      return {
        chatterId: best.chatterId,
        reasons: [
          "VIP strategy: top_performer",
          `Picked highest performance (${Math.round(best.performanceScore)})`,
        ],
      };
    }
  }

  // Round-robin routing for VIP if configured.
  if (message.fanSegment === "vip" && config.vipAssignmentStrategy === "round_robin") {
    const stable = [...eligible].sort((a, b) => a.chatterId.localeCompare(b.chatterId));
    if (stable.length === 0) return { chatterId: null, reasons: ["No eligible chatters"] };

    const cursor = Number.isFinite(config.roundRobinCursor) ? (config.roundRobinCursor as number) : 0;
    const index = ((cursor % stable.length) + stable.length) % stable.length;
    const picked = stable[index]!;

    return {
      chatterId: picked.chatterId,
      reasons: ["VIP strategy: round_robin", `Cursor ${cursor} → idx ${index}`],
      nextRoundRobinCursor: cursor + 1,
    };
  }

  // General scoring-based routing.
  const scored = eligible
    .map((c) => {
      const { score, reasons } = baseScoreForCandidate(message, c, config);
      return { c, score, reasons };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return { chatterId: null, reasons: ["No scored candidates"] };

  // If the best option is too weak, fall back to least loaded online chatter.
  if (best.score < 30) {
    const online = eligible.filter((c) => c.isOnline);
    const fallback = pickLowestWorkload(online.length > 0 ? online : eligible);
    if (!fallback) return { chatterId: null, reasons: ["Fallback failed"] };

    return {
      chatterId: fallback.chatterId,
      reasons: [
        `Best score too low (${Math.round(best.score)}), using fallback (lowest workload)`,
      ],
    };
  }

  return { chatterId: best.c.chatterId, reasons: best.reasons };
}

/**
 * calculateOptimalAssignment
 * Returns the best chatterId, or null if none.
 */
export function calculateOptimalAssignment(input: RoutingInput): string | null {
  return calculateOptimalAssignmentWithMeta(input).chatterId;
}
