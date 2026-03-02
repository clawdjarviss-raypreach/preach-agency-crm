"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface SegmentationDashboardProps {
  token: string;
}

type Segment = "vip" | "whale" | "core" | "casual";

interface SegmentStats {
  segment: Segment;
  count: number;
  avgLTV: number;
  avgResponseTime: number;
  churnRate: number;
}

interface SegmentedChatter {
  chatterId: string;
  name: string;
  avatarEmoji: string;
  profilePictureUrl?: string;
  ltv90d: number;
  daysSinceLastActivity: number;
  reportCount: number;
  segment: Segment;
  percentile: number;
}

const SEGMENT_CONFIG: Record<Segment, { emoji: string; color: string; label: string; description: string }> = {
  vip: {
    emoji: "👑",
    color: "#8b5cf6",
    label: "VIP",
    description: "Top 10% by revenue",
  },
  whale: {
    emoji: "🐋",
    color: "#3b82f6",
    label: "Whale",
    description: "50-90th percentile",
  },
  core: {
    emoji: "⭐",
    color: "#22c55e",
    label: "Core",
    description: "10-50th percentile",
  },
  casual: {
    emoji: "🌱",
    color: "#6b7280",
    label: "Casual",
    description: "Bottom 10%",
  },
};

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function SegmentationDashboard({ token }: SegmentationDashboardProps) {
  const [segmentation, setSegmentation] = useState<SegmentStats[] | null>(null);
  const [segmentedChatters, setSegmentedChatters] = useState<SegmentedChatter[] | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchData() {
      const { data: segData, error: segError } = await supabase
        .from("crm_chatter_segmentation")
        .select("*");

      if (!segError && segData) {
        const mapped: SegmentStats[] = segData.map((row: any) => ({
          segment: row.segment as Segment,
          count: row.count ?? 0,
          avgLTV: row.avg_ltv ?? 0,
          avgResponseTime: row.avg_response_time ?? 0,
          churnRate: row.churn_rate ?? 0,
        }));
        setSegmentation(mapped);
      }

      const { data: chattersData, error: chattersError } = await supabase
        .from("crm_chatters")
        .select("id, name, avatar_emoji, profile_picture_url, ltv_90d, last_activity_at, report_count, segment, percentile")
        .not("segment", "is", null)
        .order("ltv_90d", { ascending: false });

      if (!chattersError && chattersData) {
        const now = Date.now();
        const mapped: SegmentedChatter[] = chattersData.map((row: any) => {
          const lastActivity = row.last_activity_at ? new Date(row.last_activity_at).getTime() : now;
          const daysSince = Math.floor((now - lastActivity) / (1000 * 60 * 60 * 24));
          return {
            chatterId: row.id,
            name: row.name ?? "",
            avatarEmoji: row.avatar_emoji ?? "👤",
            profilePictureUrl: row.profile_picture_url ?? undefined,
            ltv90d: row.ltv_90d ?? 0,
            daysSinceLastActivity: daysSince,
            reportCount: row.report_count ?? 0,
            segment: row.segment as Segment,
            percentile: row.percentile ?? 0,
          };
        });
        setSegmentedChatters(mapped);
      }
    }

    fetchData();
  }, [token]);

  if (!segmentation || !segmentedChatters) {
    return (
      <div style={cardStyle}>
        <h3 style={headerStyle}>🎯 Chatter Segmentation</h3>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading...
        </div>
      </div>
    );
  }

  const totalChatters = segmentation.reduce((sum: number, s: SegmentStats) => sum + s.count, 0);

  return (
    <div style={cardStyle}>
      <h3 style={headerStyle}>🎯 Chatter Segmentation</h3>
      <p style={subtitleStyle}>
        Chatters ranked by 90-day LTV into performance tiers
      </p>

      {/* Segment Cards Grid */}
      <div style={segmentGridStyle}>
        {(["vip", "whale", "core", "casual"] as Segment[]).map((segmentKey) => {
          const stats = segmentation.find((s: SegmentStats) => s.segment === segmentKey);
          const config = SEGMENT_CONFIG[segmentKey];

          if (!stats) return null;

          const pct = totalChatters > 0 ? (stats.count / totalChatters) * 100 : 0;

          return (
            <div
              key={segmentKey}
              style={{
                ...segmentCardStyle,
                borderLeft: `4px solid ${config.color}`,
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                <span style={{ fontSize: "24px" }}>{config.emoji}</span>
                <div>
                  <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
                    {config.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {config.description}
                  </div>
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: "700", color: config.color }}>
                    {stats.count}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                    Chatters ({pct.toFixed(0)}%)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent)" }}>
                    {formatCurrency(stats.avgLTV)}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Avg LTV</div>
                </div>
                <div>
                  <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
                    {formatTime(stats.avgResponseTime)}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Avg Response</div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: "18px",
                      fontWeight: "600",
                      color: stats.churnRate > 0.3 ? "#ef4444" : stats.churnRate > 0.15 ? "#f59e0b" : "#22c55e",
                    }}
                  >
                    {(stats.churnRate * 100).toFixed(0)}%
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Churn Risk</div>
                </div>
              </div>

              {/* Mini distribution bar */}
              <div
                style={{
                  marginTop: "12px",
                  height: "6px",
                  background: "var(--bg)",
                  borderRadius: "3px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${pct}%`,
                    height: "100%",
                    background: config.color,
                    borderRadius: "3px",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Detailed Chatter List */}
      <div style={{ marginTop: "24px" }}>
        <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)", marginBottom: "12px" }}>
          Top Performers by Segment
        </h4>

        <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
          {segmentedChatters.slice(0, 15).map((chatter: SegmentedChatter, i: number) => {
            const config = SEGMENT_CONFIG[chatter.segment];
            return (
              <div
                key={chatter.chatterId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "10px 12px",
                  background: "var(--bg)",
                  borderRadius: "12px",
                }}
              >
                {/* Rank */}
                <div
                  style={{
                    width: "24px",
                    fontSize: "12px",
                    fontWeight: "700",
                    color: i < 3 ? "var(--accent)" : "var(--text-muted)",
                  }}
                >
                  {i + 1}.
                </div>

                {/* Avatar */}
                {chatter.profilePictureUrl ? (
                  <img
                    src={chatter.profilePictureUrl}
                    alt=""
                    style={{ width: "32px", height: "32px", borderRadius: "10px", objectFit: "cover" }}
                  />
                ) : (
                  <div
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "10px",
                      background: config.color,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "16px",
                    }}
                  >
                    {chatter.avatarEmoji || "👤"}
                  </div>
                )}

                {/* Name + Segment */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "13px", fontWeight: "500", color: "var(--text)" }}>
                    {chatter.name}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
                    <span
                      style={{
                        fontSize: "10px",
                        fontWeight: "600",
                        color: "#fff",
                        background: config.color,
                        padding: "1px 6px",
                        borderRadius: "4px",
                      }}
                    >
                      {config.emoji} {config.label}
                    </span>
                    <span style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {chatter.reportCount} reports
                    </span>
                  </div>
                </div>

                {/* LTV */}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: "var(--accent)" }}>
                    {formatCurrency(chatter.ltv90d)}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                    P{chatter.percentile}
                  </div>
                </div>

                {/* Activity indicator */}
                <div
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background:
                      chatter.daysSinceLastActivity <= 3
                        ? "#22c55e"
                        : chatter.daysSinceLastActivity <= 7
                        ? "#f59e0b"
                        : "#ef4444",
                  }}
                  title={`Last active ${chatter.daysSinceLastActivity} days ago`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: "16px",
          padding: "12px",
          background: "var(--bg)",
          borderRadius: "10px",
          display: "flex",
          justifyContent: "center",
          gap: "20px",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e", marginRight: "4px" }} />
          Active (≤3d)
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#f59e0b", marginRight: "4px" }} />
          Recent (≤7d)
        </span>
        <span>
          <span style={{ display: "inline-block", width: "8px", height: "8px", borderRadius: "50%", background: "#ef4444", marginRight: "4px" }} />
          At Risk (&gt;7d)
        </span>
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "20px",
  padding: "24px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const headerStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "600",
  color: "var(--text)",
  marginBottom: "4px",
};

const subtitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--text-muted)",
  marginBottom: "16px",
};

const segmentGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "16px",
};

const segmentCardStyle: React.CSSProperties = {
  padding: "16px",
  background: "var(--bg)",
  borderRadius: "16px",
};
