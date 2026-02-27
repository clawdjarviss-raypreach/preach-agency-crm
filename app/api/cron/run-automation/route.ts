import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";
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

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    // Verify authorization
    const cronSecret = request.headers.get("X-Cron-Secret");
    const authToken = request.headers.get("Authorization")?.replace("Bearer ", "");
    
    let isAuthorized = false;
    
    // Check cron secret
    if (cronSecret === CRON_SECRET) {
      isAuthorized = true;
    }
    
    // Or check admin token (for manual triggers from UI)
    if (authToken && !isAuthorized) {
      try {
        // This will throw if not admin
        await convex.query(api.crm.automation.listRules, { token: authToken });
        isAuthorized = true;
      } catch {
        // Not authorized via token
      }
    }
    
    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const startTime = Date.now();
    const results: ActionResult[] = [];
    
    // 1. Fetch all enabled rules
    const rules = await convex.query(api.crm.automation.getEnabledRulesByType, {});
    
    if (rules.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No enabled rules to process",
        processed: 0,
        actions: 0,
        durationMs: Date.now() - startTime,
      });
    }

    // 2. Simulate fetching pending messages (in real implementation, this would
    //    query actual message data from an external API or database)
    //    For now, we'll demonstrate the structure but skip actual processing
    //    since we don't have real message data in this CRM
    
    const messages = await fetchPendingMessages();
    const creators = await fetchAvailableCreators();

    // Track round-robin state
    let lastAssignedIndex = 0;

    // 3. Evaluate each message against rules
    for (const message of messages) {
      const now = Date.now();

      // Check escalation rules
      for (const rule of rules.filter((r: any) => r.type === "escalation")) {
        const automationRule = rule as unknown as AutomationRule;
        if (evaluateEscalation(automationRule, message, now)) {
          const action = executeEscalation(automationRule, message);
          results.push(action);
          
          // Log the action
          await convex.mutation(api.crm.automation.logAction, {
            ruleId: rule._id,
            ruleType: action.ruleType,
            ruleName: action.ruleName,
            messageId: action.messageId,
            chatterId: action.chatterId as any,
            chatterName: action.chatterName,
            fromCreatorId: action.fromCreatorId as any,
            fromCreatorName: action.fromCreatorName,
            action: action.action,
            reason: action.reason,
            metadata: action.metadata,
          });
          
          break; // Only escalate once per message
        }
      }

      // Check reassignment rules
      for (const rule of rules.filter((r: any) => r.type === "reassignment")) {
        const automationRule = rule as unknown as AutomationRule;
        if (evaluateReassignment(automationRule, message, now)) {
          // Filter excluded creators
          const excludeIds = new Set(automationRule.config.excludeCreatorIds || []);
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
          await convex.mutation(api.crm.automation.logAction, {
            ruleId: rule._id,
            ruleType: actionResult.ruleType,
            ruleName: actionResult.ruleName,
            messageId: actionResult.messageId,
            chatterId: actionResult.chatterId as any,
            chatterName: actionResult.chatterName,
            fromCreatorId: actionResult.fromCreatorId as any,
            fromCreatorName: actionResult.fromCreatorName,
            toCreatorId: actionResult.toCreatorId as any,
            toCreatorName: actionResult.toCreatorName,
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

// ─── MOCK DATA FUNCTIONS ───────────────────────────────────
// In a real implementation, these would fetch from actual sources

async function fetchPendingMessages(): Promise<Message[]> {
  // TODO: Replace with actual message queue integration
  // This would typically query:
  // - OnlyMonster API for pending fan messages
  // - Internal queue table for unresponded messages
  
  // For now, return empty array since we don't have real message data
  return [];
}

async function fetchAvailableCreators(): Promise<Creator[]> {
  // Get active creators from Convex
  // In production, would also check creator availability/online status
  
  try {
    // Query creators directly using a simpler approach
    // Since we can't easily query without a token, return mock for now
    return [];
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
    },
  });
}
