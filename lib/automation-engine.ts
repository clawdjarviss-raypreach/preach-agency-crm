/**
 * Automation Engine — Rule evaluation and action execution
 *
 * Provides stateless compute functions for automation rules.
 * Used by the cron job to evaluate and execute rules.
 */

// ─── TYPES ─────────────────────────────────────────────────

export type RuleType = "escalation" | "reassignment" | "smart_routing";

export interface AutomationRule {
  _id: string;
  type: RuleType;
  name: string;
  enabled: boolean;
  config: RuleConfig;
}

export interface RuleConfig {
  thresholdMinutes?: number;
  targetRole?: string;
  excludeCreatorIds?: string[];
  segments?: string[];
  roundRobin?: boolean;
  priorityMetric?: string;
}

export interface Message {
  id: string;
  chatterId?: string;
  chatterName?: string;
  creatorId?: string;
  creatorName?: string;
  segment?: string; // "vip", "whale", "regular"
  receivedAt: number;
  respondedAt?: number;
  assignedTo?: string;
}

export interface Creator {
  id: string;
  name: string;
  avatarUrl?: string;
  // Performance metrics from leaderboard
  responseRate?: number;
  avgResponseTimeSec?: number;
  earnings?: number;
  currentLoad?: number; // Active messages assigned
}

export interface ActionResult {
  ruleId: string;
  ruleType: RuleType;
  ruleName: string;
  action: "escalated" | "reassigned" | "routed" | "skipped";
  messageId?: string;
  chatterId?: string;
  chatterName?: string;
  fromCreatorId?: string;
  fromCreatorName?: string;
  toCreatorId?: string;
  toCreatorName?: string;
  reason: string;
  metadata?: Record<string, any>;
}

// ─── RULE EVALUATION ───────────────────────────────────────

/**
 * Evaluate escalation rule against a message
 */
export function evaluateEscalation(
  rule: AutomationRule,
  message: Message,
  now: number = Date.now()
): boolean {
  if (!rule.enabled || rule.type !== "escalation") return false;

  const config = rule.config;
  const thresholdMs = (config.thresholdMinutes || 30) * 60 * 1000;

  // Check if message is from a matching segment
  const segments = config.segments || ["vip", "whale"];
  if (message.segment && !segments.includes(message.segment.toLowerCase())) {
    return false;
  }

  // Check if message is unresponded and older than threshold
  if (message.respondedAt) return false;

  const age = now - message.receivedAt;
  return age >= thresholdMs;
}

/**
 * Evaluate reassignment rule against a message
 */
export function evaluateReassignment(
  rule: AutomationRule,
  message: Message,
  now: number = Date.now()
): boolean {
  if (!rule.enabled || rule.type !== "reassignment") return false;

  const config = rule.config;
  const thresholdMs = (config.thresholdMinutes || 60) * 60 * 1000;

  // Check if message is stale (unresponded)
  if (message.respondedAt) return false;

  // Check if creator is excluded
  const excludeIds = config.excludeCreatorIds || [];
  if (message.creatorId && excludeIds.includes(message.creatorId)) {
    return false;
  }

  const age = now - message.receivedAt;
  return age >= thresholdMs;
}

/**
 * Evaluate smart routing rule for a new message
 */
export function evaluateSmartRouting(
  rule: AutomationRule,
  message: Message
): boolean {
  if (!rule.enabled || rule.type !== "smart_routing") return false;

  const config = rule.config;
  const segments = config.segments || ["vip", "whale"];

  // Only route high-value chatters
  if (!message.segment || !segments.includes(message.segment.toLowerCase())) {
    return false;
  }

  return true;
}

// ─── ACTION EXECUTION ──────────────────────────────────────

/**
 * Execute escalation action
 */
export function executeEscalation(
  rule: AutomationRule,
  message: Message
): ActionResult {
  const config = rule.config;
  const targetRole = config.targetRole || "supervisor";

  return {
    ruleId: rule._id,
    ruleType: "escalation",
    ruleName: rule.name,
    action: "escalated",
    messageId: message.id,
    chatterId: message.chatterId,
    chatterName: message.chatterName,
    fromCreatorId: message.creatorId,
    fromCreatorName: message.creatorName,
    reason: `VIP message unresponded for >${config.thresholdMinutes || 30} minutes`,
    metadata: {
      targetRole,
      segment: message.segment,
      ageMinutes: Math.round((Date.now() - message.receivedAt) / 60000),
    },
  };
}

/**
 * Execute reassignment action with round-robin or load-balanced selection
 */
export function executeReassignment(
  rule: AutomationRule,
  message: Message,
  availableCreators: Creator[],
  lastAssignedIndex: number = 0
): ActionResult & { nextCreatorIndex: number } {
  const config = rule.config;

  if (availableCreators.length === 0) {
    return {
      ruleId: rule._id,
      ruleType: "reassignment",
      ruleName: rule.name,
      action: "skipped",
      messageId: message.id,
      reason: "No available creators for reassignment",
      nextCreatorIndex: lastAssignedIndex,
    };
  }

  let selectedCreator: Creator;
  let nextIndex: number;

  if (config.roundRobin) {
    // Round-robin selection
    nextIndex = (lastAssignedIndex + 1) % availableCreators.length;
    selectedCreator = availableCreators[nextIndex];
  } else {
    // Load-balanced selection (lowest current load)
    const sorted = [...availableCreators].sort(
      (a, b) => (a.currentLoad || 0) - (b.currentLoad || 0)
    );
    selectedCreator = sorted[0];
    nextIndex = availableCreators.findIndex((c) => c.id === selectedCreator.id);
  }

  return {
    ruleId: rule._id,
    ruleType: "reassignment",
    ruleName: rule.name,
    action: "reassigned",
    messageId: message.id,
    chatterId: message.chatterId,
    chatterName: message.chatterName,
    fromCreatorId: message.creatorId,
    fromCreatorName: message.creatorName,
    toCreatorId: selectedCreator.id,
    toCreatorName: selectedCreator.name,
    reason: `Message stale for >${config.thresholdMinutes || 60} minutes`,
    metadata: {
      selectionMethod: config.roundRobin ? "round_robin" : "load_balanced",
      ageMinutes: Math.round((Date.now() - message.receivedAt) / 60000),
    },
    nextCreatorIndex: nextIndex,
  };
}

/**
 * Execute smart routing for a new message
 */
export function executeSmartRouting(
  rule: AutomationRule,
  message: Message,
  availableCreators: Creator[]
): ActionResult {
  const config = rule.config;
  const priorityMetric = config.priorityMetric || "response_time";

  if (availableCreators.length === 0) {
    return {
      ruleId: rule._id,
      ruleType: "smart_routing",
      ruleName: rule.name,
      action: "skipped",
      messageId: message.id,
      reason: "No available creators for routing",
    };
  }

  // Sort by priority metric
  const sorted = [...availableCreators].sort((a, b) => {
    switch (priorityMetric) {
      case "response_time":
        // Lower response time is better
        const aTime = a.avgResponseTimeSec ?? Infinity;
        const bTime = b.avgResponseTimeSec ?? Infinity;
        return aTime - bTime;
      case "response_rate":
        // Higher response rate is better
        return (b.responseRate || 0) - (a.responseRate || 0);
      case "earnings":
        // Higher earnings is better
        return (b.earnings || 0) - (a.earnings || 0);
      default:
        return 0;
    }
  });

  const bestCreator = sorted[0];

  return {
    ruleId: rule._id,
    ruleType: "smart_routing",
    ruleName: rule.name,
    action: "routed",
    messageId: message.id,
    chatterId: message.chatterId,
    chatterName: message.chatterName,
    toCreatorId: bestCreator.id,
    toCreatorName: bestCreator.name,
    reason: `Routed ${message.segment} chatter to best performer by ${priorityMetric}`,
    metadata: {
      segment: message.segment,
      priorityMetric,
      creatorScore:
        priorityMetric === "response_time"
          ? bestCreator.avgResponseTimeSec
          : priorityMetric === "response_rate"
            ? bestCreator.responseRate
            : bestCreator.earnings,
    },
  };
}

// ─── BATCH PROCESSING ──────────────────────────────────────

export interface BatchResult {
  processed: number;
  escalated: number;
  reassigned: number;
  routed: number;
  skipped: number;
  errors: number;
  actions: ActionResult[];
}

/**
 * Process all enabled rules against a batch of messages
 */
export function processBatch(
  rules: AutomationRule[],
  messages: Message[],
  creators: Creator[],
  lastAssignedIndex: number = 0
): BatchResult {
  const result: BatchResult = {
    processed: 0,
    escalated: 0,
    reassigned: 0,
    routed: 0,
    skipped: 0,
    errors: 0,
    actions: [],
  };

  let currentIndex = lastAssignedIndex;
  const now = Date.now();

  // Get enabled rules by type
  const escalationRules = rules.filter(
    (r) => r.type === "escalation" && r.enabled
  );
  const reassignmentRules = rules.filter(
    (r) => r.type === "reassignment" && r.enabled
  );

  // Process each message
  for (const message of messages) {
    result.processed++;

    // Check escalation rules
    for (const rule of escalationRules) {
      if (evaluateEscalation(rule, message, now)) {
        const action = executeEscalation(rule, message);
        result.actions.push(action);
        result.escalated++;
        break; // Only escalate once per message
      }
    }

    // Check reassignment rules
    for (const rule of reassignmentRules) {
      if (evaluateReassignment(rule, message, now)) {
        // Filter out excluded creators
        const excludeIds = new Set(rule.config.excludeCreatorIds || []);
        const available = creators.filter((c) => !excludeIds.has(c.id));

        const action = executeReassignment(
          rule,
          message,
          available,
          currentIndex
        );
        currentIndex = action.nextCreatorIndex;
        result.actions.push(action);

        if (action.action === "reassigned") {
          result.reassigned++;
        } else {
          result.skipped++;
        }
        break; // Only reassign once per message
      }
    }
  }

  return result;
}

// ─── HELPERS ───────────────────────────────────────────────

/**
 * Format time threshold for display
 */
export function formatThreshold(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get segment label for display
 */
export function getSegmentLabel(segment: string): string {
  const labels: Record<string, string> = {
    vip: "👑 VIP",
    whale: "🐋 Whale",
    regular: "Regular",
    new: "🆕 New",
  };
  return labels[segment.toLowerCase()] || segment;
}

/**
 * Get action color for UI
 */
export function getActionColor(
  action: string
): "green" | "orange" | "blue" | "gray" {
  switch (action) {
    case "escalated":
      return "orange";
    case "reassigned":
      return "blue";
    case "routed":
      return "green";
    default:
      return "gray";
  }
}

/**
 * Get action emoji
 */
export function getActionEmoji(action: string): string {
  switch (action) {
    case "escalated":
      return "🚨";
    case "reassigned":
      return "🔄";
    case "routed":
      return "🎯";
    case "skipped":
      return "⏭️";
    default:
      return "📋";
  }
}

/**
 * Get rule type emoji
 */
export function getRuleTypeEmoji(type: RuleType): string {
  switch (type) {
    case "escalation":
      return "🚨";
    case "reassignment":
      return "🔄";
    case "smart_routing":
      return "🎯";
    default:
      return "⚙️";
  }
}

/**
 * Get rule type description
 */
export function getRuleTypeDescription(type: RuleType): string {
  switch (type) {
    case "escalation":
      return "Escalate VIP messages to supervisors when unresponded";
    case "reassignment":
      return "Reassign stale messages to available creators";
    case "smart_routing":
      return "Route high-value chatters to top performers";
    default:
      return "";
  }
}
