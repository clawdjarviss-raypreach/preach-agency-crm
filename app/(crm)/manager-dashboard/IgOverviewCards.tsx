"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  token: string;
  startDate: string;
  endDate: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function StatCard({ label, value, icon, isEmpty }: { label: string; value: string; icon: string; isEmpty?: boolean }) {
  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "20px 24px",
      border: "1px solid #2a2a2a", flex: "1 1 200px", minWidth: "180px",
    }}>
      <div style={{
        fontSize: "11px", color: "#a0a0a0", fontWeight: "500",
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
      }}>
        {icon} {label}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: "14px", fontWeight: "500", color: "#666", fontStyle: "italic" }}>
          No data yet
        </div>
      ) : (
        <div style={{ fontSize: "28px", fontWeight: "700", color: "#fff" }}>
          {value}
        </div>
      )}
    </div>
  );
}

export default function IgOverviewCards({ token, startDate, endDate }: Props) {
  const [overview, setOverview] = useState<any>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchOverview() {
      const endPlusOne = addDays(endDate, 1);

      const [{ data: accounts }, { data: snapshots }] = await Promise.all([
        supabase.from("crm_ig_accounts").select("id"),
        supabase
          .from("crm_ig_daily_snapshots")
          .select("ig_account_id,date,followers,views,likes,comments")
          .gte("date", startDate)
          .lte("date", endPlusOne),
      ]);

      const byAccount = new Map<string, any[]>();
      for (const snap of snapshots ?? []) {
        const accountId = (snap as any).ig_account_id;
        if (!byAccount.has(accountId)) byAccount.set(accountId, []);
        byAccount.get(accountId)!.push(snap);
      }

      let totalFollowersStart = 0;
      let totalFollowersEnd = 0;
      let totalViews = 0;
      let totalLikes = 0;
      let totalComments = 0;

      for (const account of accounts ?? []) {
        const accountId = (account as any).id;
        const rows = (byAccount.get(accountId) ?? []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        const byDate = new Map(rows.map((r) => [String((r as any).date), r]));

        const startSnap = byDate.get(startDate);
        const endSnap = byDate.get(endPlusOne) ?? (rows.length ? rows[rows.length - 1] : null);

        const startFollowers = Number(startSnap?.followers || 0);
        const endFollowers = Number(endSnap?.followers || 0);
        const startViews = Number(startSnap?.views || 0);
        const endViews = Number(endSnap?.views || 0);
        const startLikes = Number(startSnap?.likes || 0);
        const endLikes = Number(endSnap?.likes || 0);
        const startComments = Number(startSnap?.comments || 0);
        const endComments = Number(endSnap?.comments || 0);

        totalFollowersStart += startFollowers;
        totalFollowersEnd += endFollowers;
        totalViews += endViews - startViews;
        totalLikes += endLikes - startLikes;
        totalComments += endComments - startComments;
      }

      const totalFollowerDelta = totalFollowersEnd - totalFollowersStart;
      const followerGrowthPct = totalFollowersStart > 0
        ? ((totalFollowerDelta / totalFollowersStart) * 100)
        : null;

      setOverview({
        totalFollowers: totalFollowersEnd,
        totalFollowerDelta,
        totalViews,
        totalLikes,
        totalComments,
        followerGrowthPct,
      });
    }

    fetchOverview();
  }, [token, startDate, endDate]);

  if (!overview) return null;

  const {
    totalFollowers,
    totalFollowerDelta,
    totalViews,
    totalLikes,
    totalComments,
    followerGrowthPct,
  } = overview;

  const totalEngagements = totalLikes + totalComments;
  const avgEngagementRate = totalViews > 0
    ? ((totalEngagements / totalViews) * 100).toFixed(1) + "%"
    : "—";

  const deltaSign = totalFollowerDelta >= 0 ? "+" : "";
  const growthSign = followerGrowthPct !== null && followerGrowthPct >= 0 ? "+" : "";

  return (
    <div style={{
      display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px",
    }}>
      <StatCard
        icon="👥"
        label="Total Followers"
        value={totalFollowers.toLocaleString()}
        isEmpty={totalFollowers === 0 && totalViews === 0}
      />
      <StatCard
        icon="📈"
        label="Follower Growth"
        value={`${deltaSign}${totalFollowerDelta.toLocaleString()}${followerGrowthPct !== null ? ` (${growthSign}${followerGrowthPct.toFixed(1)}%)` : ""}`}
        isEmpty={totalFollowers === 0 && totalFollowerDelta === 0}
      />
      <StatCard
        icon="🎬"
        label="Total Reel Views"
        value={totalViews.toLocaleString()}
        isEmpty={totalViews === 0}
      />
      <StatCard
        icon="💬"
        label="Avg Engagement Rate"
        value={avgEngagementRate}
        isEmpty={totalViews === 0}
      />
    </div>
  );
}
