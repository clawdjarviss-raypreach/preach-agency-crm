import { createClient } from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

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
          validPeriods,
        },
        { status: 400 }
      );
    }

    const period = periodParam as "ytd" | "mtd" | "wtd";
    const sb = createClient();

    // Compute date range based on period
    const now = new Date();
    let periodStart: Date;

    if (period === "ytd") {
      periodStart = new Date(now.getFullYear(), 0, 1);
    } else if (period === "mtd") {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      // wtd - week to date (Monday start)
      const dayOfWeek = now.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday = 0
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - diff);
      periodStart.setHours(0, 0, 0, 0);
    }

    const periodStartStr = periodStart.toISOString().split("T")[0];

    // Fetch chatters (active)
    const { data: chatters } = await sb
      .from("crm_chatters")
      .select("id, name, avatar_emoji, profile_picture_url")
      .eq("status", "active");

    if (!chatters || chatters.length === 0) {
      return NextResponse.json(
        {
          period,
          updated: Date.now(),
          entries: [],
        },
        {
          headers: {
            "Cache-Control":
              "public, s-maxage=300, stale-while-revalidate=600",
          },
        }
      );
    }

    // Fetch sales reports in period
    const { data: salesReports } = await sb
      .from("crm_sales_reports")
      .select("chatter_id, total_sales")
      .gte("date", periodStartStr);

    // Fetch shifts in period
    const { data: shifts } = await sb
      .from("crm_shifts")
      .select("chatter_id, total_minutes")
      .gte("date", periodStartStr);

    // Fetch streaks
    const { data: streaks } = await sb
      .from("crm_streaks")
      .select("chatter_id, current_streak");

    // Fetch achievements
    const { data: achievements } = await sb
      .from("crm_chatter_achievements")
      .select("chatter_id, achievement:crm_achievements(slug)");

    // Fetch chat stats (avg response time)
    const { data: chatStats } = await sb
      .from("crm_of_chat_stats")
      .select("account_id, avg_response_time_sec");

    // Aggregate per chatter
    const chatterMap = new Map<
      string,
      {
        id: string;
        name: string;
        avatar: string;
        earnings: number;
        hoursWorked: number;
        streak: number;
        avgResponseTimeSec: number;
        badges: string[];
      }
    >();

    for (const c of chatters) {
      chatterMap.set(c.id, {
        id: c.id,
        name: c.name,
        avatar: c.profile_picture_url || c.avatar_emoji || "",
        earnings: 0,
        hoursWorked: 0,
        streak: 0,
        avgResponseTimeSec: 0,
        badges: [],
      });
    }

    // Sum sales
    for (const sr of salesReports || []) {
      const entry = chatterMap.get(sr.chatter_id);
      if (entry) entry.earnings += sr.total_sales || 0;
    }

    // Sum shifts
    for (const s of shifts || []) {
      const entry = chatterMap.get(s.chatter_id);
      if (entry) entry.hoursWorked += (s.total_minutes || 0) / 60;
    }

    // Streaks
    for (const s of streaks || []) {
      const entry = chatterMap.get(s.chatter_id);
      if (entry) entry.streak = s.current_streak || 0;
    }

    // Achievements as badges
    for (const a of achievements || []) {
      const entry = chatterMap.get(a.chatter_id);
      const achievementSlug = a.achievement?.[0]?.slug;

      if (entry && achievementSlug) {
        entry.badges.push(achievementSlug);
      }
    }

    // Chat stats (use account_id as a rough proxy; in production, map accounts to chatters)
    const chatStatsMap = new Map<string, number>();
    for (const cs of chatStats || []) {
      chatStatsMap.set(
        cs.account_id,
        cs.avg_response_time_sec || 0
      );
    }

    // Build entries sorted by earnings descending
    const entries = Array.from(chatterMap.values())
      .sort((a, b) => b.earnings - a.earnings)
      .map((entry, index) => ({
        rank: index + 1,
        creatorId: entry.id,
        creatorName: entry.name,
        creatorAvatar: entry.avatar,
        responseRate: 0, // TODO: compute from actual response data
        avgResponseTimeSec: entry.avgResponseTimeSec,
        earnings: entry.earnings,
        badges: entry.badges,
      }));

    // Assign dynamic badges
    if (entries.length > 0) {
      // Top earner
      entries[0].badges = [
        ...new Set([...entries[0].badges, "top_earner"]),
      ];

      // Speedster: fastest response time (if data available)
      const withResponseTime = entries.filter(
        (e) => e.avgResponseTimeSec > 0
      );
      if (withResponseTime.length > 0) {
        const fastest = withResponseTime.sort(
          (a, b) => a.avgResponseTimeSec - b.avgResponseTimeSec
        )[0];
        const fastestEntry = entries.find(
          (e) => e.creatorId === fastest.creatorId
        );
        if (fastestEntry) {
          fastestEntry.badges = [
            ...new Set([...fastestEntry.badges, "speedster"]),
          ];
        }
      }
    }

    return NextResponse.json(
      {
        period,
        updated: Date.now(),
        entries,
      },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("Leaderboard API error:", error);

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
