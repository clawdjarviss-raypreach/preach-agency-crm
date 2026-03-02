import { createClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * Validate session token and return the session + chatter info.
 * Returns null if unauthorized.
 */
async function validateSession(token: string) {
  const sb = createClient();
  const { data: session, error } = await sb
    .from("crm_sessions")
    .select("*, chatter:crm_chatters(*)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .single();

  if (error || !session) return null;
  return session;
}

/**
 * GET /api/automation/log
 *
 * Returns automation audit log.
 * Requires: Admin or Supervisor role
 *
 * Query params:
 * - limit: number (default 100)
 * - ruleId: filter by specific rule
 * - ruleType: filter by rule type
 */
export async function GET(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { searchParams } = new URL(request.url);

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.chatter?.role;
    if (role !== "admin" && role !== "supervisor" && role !== "manager") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const ruleId = searchParams.get("ruleId") || undefined;
    const ruleType = searchParams.get("ruleType") || undefined;

    const sb = createClient();
    let query = sb
      .from("crm_automation_log")
      .select("*")
      .order("triggered_at", { ascending: false })
      .limit(limit);

    if (ruleId) {
      query = query.eq("rule_id", ruleId);
    }
    if (ruleType) {
      query = query.eq("rule_type", ruleType);
    }

    const { data: logs, error } = await query;

    if (error) {
      console.error("Automation log query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { logs },
      {
        headers: {
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Automation log GET error:", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
