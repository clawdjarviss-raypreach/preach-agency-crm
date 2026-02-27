import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/automation/rules
 * 
 * Returns all automation rules.
 * Requires: Admin or Supervisor role
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const rules = await convex.query(api.crm.automation.listRules, { token });

    return NextResponse.json({ rules }, {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Automation rules GET error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
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

    const result = await convex.mutation(api.crm.automation.createRule, {
      token,
      type: body.type,
      name: body.name,
      enabled: body.enabled ?? true,
      config: body.config || {},
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Automation rules POST error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    if (!body.ruleId) {
      return NextResponse.json(
        { error: "Missing required field: ruleId" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.crm.automation.updateRule, {
      token,
      ruleId: body.ruleId,
      name: body.name,
      enabled: body.enabled,
      config: body.config,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Automation rules PUT error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.includes("not found")) {
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
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
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

    const result = await convex.mutation(api.crm.automation.deleteRule, {
      token,
      ruleId: ruleId as any,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Automation rules DELETE error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.includes("not found")) {
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
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const body = await request.json();
    
    if (!body.ruleId) {
      return NextResponse.json(
        { error: "Missing required field: ruleId" },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.crm.automation.toggleRule, {
      token,
      ruleId: body.ruleId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Automation rules PATCH error:", error);

    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

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
