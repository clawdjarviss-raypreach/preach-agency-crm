import { createClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";
import {
  evaluateEscalation,
  evaluateReassignment,
  executeEscalation,
  executeReassignment,
  type AutomationRule,
  type Message,
  type Creator,
  type ActionResult,
} from "../../../../lib/automation-engine";

// Cron secret for security (set in environment)
const CRON_SECRET = process.env.CRON_SECRET || "dev-cron-secret";

/**
 * POST /api/cron/run-automation
 *
 * Cron endpoint to evaluate and execute automation rules.
 * Should be called every 5 minutes.
 *
 * Security: Requires CRON_SECRET header or admin token
 *
 * Headers:
 * - X-Cron-Secret: secret key
 * OR
 * - Authorization: Bearer <admin-token>
 */
export async function POST(request: NextRequest) {
  try {
    const sb = createClient();

    // Verify authorization
    const cronSecret = request.headers.get("X-Cron-Secret");
    const authToken = request.headers
      .get("Authorization")
      ?.replace("Bearer ", "");

    let isAuthorized = false;

    // Check cron secret
    if (cronSecret === CRON_SECRET) {
      isAuthorized = true;
    }

    // Or check admin token (for manual triggers from UI)
    if (authToken && !isAuthorized) {
      try {
        const { data: session } = await sb
          .from("crm_sessions")
          .select("*, chatter:crm_chatters(role)")
          .eq("token", authToken)
          .gt("expires_at", new Date().toISOString())
          .single();

        if (session?.chatter?.role === "admin") {
          isAuthorized = true;
        }
      } catch {
        // Not authorized via token
      }
    }

    if (!isAuthorized) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startTime = Date.now();
    const results: ActionResult[] = [];

    // 1. Fetch all enabled rules
    const { data: rulesRaw, error: rulesError } = await sb
      .from("crm_automation_rules")
      .select("*")
      .eq("enabled", true);

    if (rulesError) {
      console.error("Failed to fetch automation rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch rules" },
        { status: 500 }
      );
    }

    const rules = rulesRaw || [];

    if (rules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No enabled rules to process",
        processed: 0,
        actions: 0,
        durationMs: Date.now() - startTime,
      });
    }

    // 2. Fetch pending messages from queue and available creators
    const messages = await fetchPendingMessages(sb);
    const creators = await fetchAvailableCreators(sb);

    // Track round-robin state
    let lastAssignedIndex = 0;

    // 3. Evaluate each message against rules
    for (const message of messages) {
      const now = Date.now();

      // Check escalation rules
      for (const rule of rules.filter((r: any) => r.type === "escalation")) {
        const automationRule = mapRuleToAutomationRule(rule);
        if (evaluateEscalation(automationRule, message, now)) {
          const action = executeEscalation(automationRule, message);
          results.push(action);

          // Log the action
          await sb.from("crm_automation_log").insert({
            rule_id: rule.id,
            rule_type: action.ruleType,
            rule_name: action.ruleName,
            message_id: action.messageId,
            chatter_id: action.chatterId,
            chatter_name: action.chatterName,
            from_creator_id: action.fromCreatorId,
            from_creator_name: action.fromCreatorName,
            action: action.action,
            reason: action.reason,
            metadata: action.metadata,
          });

          break; // Only escalate once per message
        }
      }

      // Check reassignment rules
      for (const rule of rules.filter(
        (r: any) => r.type === "reassignment"
      )) {
        const automationRule = mapRuleToAutomationRule(rule);
        if (evaluateReassignment(automationRule, message, now)) {
          // Filter excluded creators
          const excludeIds = new Set(
            automationRule.config.excludeCreatorIds || []
          );
          const available = creators.filter((c) => !excludeIds.has(c.id));

          const actionResult = executeReassignment(
            automationRule,
            message,
            available,
            lastAssignedIndex
          );
          lastAssignedIndex = actionResult.nextCreatorIndex;
          results.push(actionResult);

          // Log the action
          await sb.from("crm_automation_log").insert({
            rule_id: rule.id,
            rule_type: actionResult.ruleType,
            rule_name: actionResult.ruleName,
            message_id: actionResult.messageId,
            chatter_id: actionResult.chatterId,
            chatter_name: actionResult.chatterName,
            from_creator_id: actionResult.fromCreatorId,
            from_creator_name: actionResult.fromCreatorName,
            to_creator_id: actionResult.toCreatorId,
            to_creator_name: actionResult.toCreatorName,
            action: actionResult.action,
            reason: actionResult.reason,
            metadata: actionResult.metadata,
          });

          break; // Only reassign once per message
        }
      }
    }

    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      rulesEvaluated: rules.length,
      messagesProcessed: messages.length,
      actionsExecuted: results.length,
      actions: results.map((r) => ({
        ruleType: r.ruleType,
        action: r.action,
        reason: r.reason,
      })),
      durationMs,
    });
  } catch (error) {
    console.error("Cron automation error:", error);

    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/run-automation
 *
 * Health check / status endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "run-automation",
    description: "POST to trigger automation rules evaluation",
    recommendedSchedule: "Every 5 minutes",
  });
}

// ---- HELPERS ----

/**
 * Map a Supabase row to the AutomationRule interface expected by automation-engine
 */
function mapRuleToAutomationRule(row: any): AutomationRule {
  return {
    _id: row.id,
    type: row.type,
    name: row.name,
    enabled: row.enabled,
    config: row.config || {},
  };
}

// ---- DATA FETCHING ----

/**
 * Fetch pending/in_progress messages from the queue table.
 */
async function fetchPendingMessages(
  sb: ReturnType<typeof createClient>
): Promise<Message[]> {
  // TODO: In production, also query external message API for real fan messages
  const { data: items } = await sb
    .from("crm_message_queue")
    .select("*")
    .in("status", ["pending", "in_progress"]);

  if (!items || items.length === 0) return [];

  return items.map((item: any) => ({
    id: item.id,
    chatterId: item.chatter_id,
    chatterName: item.fan_username,
    creatorId: item.creator_id,
    creatorName: undefined,
    segment: item.fan_segment,
    receivedAt: new Date(item.received_at).getTime(),
    respondedAt: item.responded_at
      ? new Date(item.responded_at).getTime()
      : undefined,
    assignedTo: item.chatter_id,
  }));
}

/**
 * Fetch available creators (active chatters with creator assignments).
 */
async function fetchAvailableCreators(
  sb: ReturnType<typeof createClient>
): Promise<Creator[]> {
  // In production, would also check creator availability/online status
  try {
    const { data: chatters } = await sb
      .from("crm_chatters")
      .select("id, name, profile_picture_url")
      .eq("status", "active");

    if (!chatters) return [];

    return chatters.map((c: any) => ({
      id: c.id,
      name: c.name,
      avatarUrl: c.profile_picture_url,
    }));
  } catch {
    return [];
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-Cron-Secret",
    },
  });
}
