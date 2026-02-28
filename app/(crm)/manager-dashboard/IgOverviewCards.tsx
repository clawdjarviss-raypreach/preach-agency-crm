"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

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
  const overview = useQuery(
    api.crm.igQueries.getIgOverview,
    token ? { token, startDate, endDate } : "skip"
  );

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
