import { createClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

/**
 * Validate session token and return the session + chatter info.
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

function isAdminOrSupervisor(role: string | undefined): boolean {
  return role === "admin" || role === "supervisor" || role === "manager";
}

function isAdmin(role: string | undefined): boolean {
  return role === "admin";
}

/**
 * GET /api/automation/rules
 *
 * Returns all automation rules.
 * Requires: Admin or Supervisor role
 */
export async function GET(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    if (!session || !isAdminOrSupervisor(session.chatter?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createClient();
    const { data: rules, error } = await sb
      .from("crm_automation_rules")
      .select("*");

    if (error) {
      console.error("Automation rules query error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { rules },
      {
        headers: {
          "Cache-Control": "private, no-cache",
        },
      }
    );
  } catch (error) {
    console.error("Automation rules GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/automation/rules
 *
 * Create a new automation rule.
 * Requires: Admin role
 *
 * Body:
 * {
 *   type: "escalation" | "reassignment" | "smart_routing",
 *   name: string,
 *   enabled: boolean,
 *   config: { ... }
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    if (!session || !isAdmin(session.chatter?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    if (!body.type || !body.name) {
      return NextResponse.json(
        { error: "Missing required fields: type, name" },
        { status: 400 }
      );
    }

    const validTypes = ["escalation", "reassignment", "smart_routing"];
    if (!validTypes.includes(body.type)) {
      return NextResponse.json(
        { error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const sb = createClient();
    const { data: rule, error } = await sb
      .from("crm_automation_rules")
      .insert({
        type: body.type,
        name: body.name,
        enabled: body.enabled ?? true,
        config: body.config || {},
        updated_by: session.chatter_id,
      })
      .select()
      .single();

    if (error) {
      console.error("Automation rules insert error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Automation rules POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/automation/rules
 *
 * Update an automation rule.
 * Requires: Admin role
 *
 * Body:
 * {
 *   ruleId: string,
 *   name?: string,
 *   enabled?: boolean,
 *   config?: { ... }
 * }
 */
export async function PUT(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    if (!session || !isAdmin(session.chatter?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.ruleId) {
      return NextResponse.json(
        { error: "Missing required field: ruleId" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      updated_by: session.chatter_id,
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;
    if (body.config !== undefined) updateData.config = body.config;

    const sb = createClient();
    const { data: rule, error } = await sb
      .from("crm_automation_rules")
      .update(updateData)
      .eq("id", body.ruleId)
      .select()
      .single();

    if (error) {
      console.error("Automation rules update error:", error);
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Rule not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Automation rules PUT error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/automation/rules
 *
 * Delete an automation rule.
 * Requires: Admin role
 *
 * Query params: ?ruleId=...
 */
export async function DELETE(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { searchParams } = new URL(request.url);
    const ruleId = searchParams.get("ruleId");

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    if (!ruleId) {
      return NextResponse.json(
        { error: "Missing required query param: ruleId" },
        { status: 400 }
      );
    }

    const session = await validateSession(token);
    if (!session || !isAdmin(session.chatter?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sb = createClient();
    const { error } = await sb
      .from("crm_automation_rules")
      .delete()
      .eq("id", ruleId);

    if (error) {
      console.error("Automation rules delete error:", error);
      if (error.code === "PGRST116") {
        return NextResponse.json(
          { error: "Rule not found" },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Automation rules DELETE error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/automation/rules
 *
 * Toggle a rule on/off.
 * Requires: Admin role
 *
 * Body: { ruleId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const token =
      request.headers.get("Authorization")?.replace("Bearer ", "") || "";

    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const session = await validateSession(token);
    if (!session || !isAdmin(session.chatter?.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    if (!body.ruleId) {
      return NextResponse.json(
        { error: "Missing required field: ruleId" },
        { status: 400 }
      );
    }

    const sb = createClient();

    // Fetch current state to toggle
    const { data: current, error: fetchError } = await sb
      .from("crm_automation_rules")
      .select("enabled")
      .eq("id", body.ruleId)
      .single();

    if (fetchError || !current) {
      return NextResponse.json(
        { error: "Rule not found" },
        { status: 404 }
      );
    }

    const { data: rule, error } = await sb
      .from("crm_automation_rules")
      .update({
        enabled: !current.enabled,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.ruleId)
      .select()
      .single();

    if (error) {
      console.error("Automation rules toggle error:", error);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(rule);
  } catch (error) {
    console.error("Automation rules PATCH error:", error);
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
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
