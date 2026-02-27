import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

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
    const token = request.headers.get("Authorization")?.replace("Bearer ", "") || "";
    const { searchParams } = new URL(request.url);
    
    if (!token) {
      return NextResponse.json(
        { error: "Missing authorization token" },
        { status: 401 }
      );
    }

    const limit = parseInt(searchParams.get("limit") || "100", 10);
    const ruleId = searchParams.get("ruleId") || undefined;
    const ruleType = searchParams.get("ruleType") || undefined;

    const logs = await convex.query(api.crm.automation.getLog, {
      token,
      limit,
      ruleId: ruleId as any,
      ruleType,
    });

    return NextResponse.json({ logs }, {
      headers: {
        "Cache-Control": "private, no-cache",
      },
    });
  } catch (error) {
    console.error("Automation log GET error:", error);

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
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
