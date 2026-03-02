"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface Props {
  token: string;
  startDate: string;
  endDate: string;
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
      // Aggregate from crm_ig_daily_snapshots for date range
      const { data: snapshots } = await supabase
        .from("crm_ig_daily_snapshots")
        .select("followers, followers_delta, views, likes, comments")
        .gte("date", startDate)
        .lte("date", endDate);

      if (!snapshots || snapshots.length === 0) {
        setOverview({
          totalFollowers: 0,
          totalFollowerDelta: 0,
          totalViews: 0,
          totalLikes: 0,
          totalComments: 0,
        });
        return;
      }

      // Get latest followers total (max from the snapshots)
      const { data: latestSnapshots } = await supabase
        .from("crm_ig_daily_snapshots")
        .select("followers")
        .lte("date", endDate)
        .order("date", { ascending: false })
        .limit(50);

      // Sum up deltas and engagement
      const totalFollowerDelta = snapshots.reduce((s, r) => s + (r.followers_delta || 0), 0);
      const totalViews = snapshots.reduce((s, r) => s + (r.views || 0), 0);
      const totalLikes = snapshots.reduce((s, r) => s + (r.likes || 0), 0);
      const totalComments = snapshots.reduce((s, r) => s + (r.comments || 0), 0);

      // Get unique latest followers per account from the latest snapshots
      const totalFollowers = (latestSnapshots || []).reduce((max, s) => Math.max(max, s.followers || 0), 0);

      setOverview({
        totalFollowers,
        totalFollowerDelta,
        totalViews,
        totalLikes,
        totalComments,
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
  } = overview;

  const totalEngagements = totalLikes + totalComments;
  const avgEngagementRate = totalViews > 0
    ? ((totalEngagements / totalViews) * 100).toFixed(1) + "%"
    : "—";

  const deltaSign = totalFollowerDelta >= 0 ? "+" : "";

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
        value={`${deltaSign}${totalFollowerDelta.toLocaleString()}`}
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
