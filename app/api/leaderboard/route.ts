import { ConvexHttpClient } from "convex/browser";
import { NextRequest, NextResponse } from "next/server";
import { api } from "../../../convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * GET /api/leaderboard?period=ytd|mtd|wtd
 * 
 * Returns leaderboard rankings with badges for the specified period.
 * 
 * Response:
 * {
 *   period: "ytd" | "mtd" | "wtd",
 *   updated: number, // timestamp
 *   entries: Array<{
 *     rank: number,
 *     creatorId: string,
 *     creatorName: string,
 *     creatorAvatar: string,
 *     responseRate: number,      // 0-100
 *     avgResponseTimeSec: number,
 *     earnings: number,          // USD
 *     badges: string[]           // ["speedster", "top_earner", ...]
 *   }>
 * }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period") || "mtd";
    
    // Validate period
    const validPeriods = ["ytd", "mtd", "wtd"];
    if (!validPeriods.includes(periodParam)) {
      return NextResponse.json(
        { 
          error: "Invalid period. Must be one of: ytd, mtd, wtd",
          validPeriods 
        },
        { status: 400 }
      );
    }
    
    const period = periodParam as "ytd" | "mtd" | "wtd";
    
    // Fetch from Convex
    const result = await convex.query(api.crm.leaderboard.getLeaderboardForApi, {
      period,
    });
    
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    console.error("Leaderboard API error:", error);
    
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
