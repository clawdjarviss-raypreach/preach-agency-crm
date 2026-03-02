"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface LTVProjectionProps {
  token: string;
}

type Confidence = "high" | "medium" | "low";

interface Projection {
  chatterId: string;
  name: string;
  avatarEmoji: string;
  profilePictureUrl?: string;
  ltv90d: number;
  confidence: Confidence;
  breakdown: {
    baseRevenue: number;
    responseMultiplier: number;
    churnDiscount: number;
    churnProb: number;
  };
  totalRevenue: number;
  reportCount: number;
  daysSinceLastActivity: number;
}

function formatCurrency(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

const confidenceColors: Record<Confidence, string> = {
  high: "#22c55e",
  medium: "#f59e0b",
  low: "#6b7280",
};

const confidenceLabels: Record<Confidence, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

export default function LTVProjection({ token }: LTVProjectionProps) {
  const [projections, setProjections] = useState<Projection[] | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchProjections() {
      const { data, error } = await supabase
        .from("crm_ltv_projections")
        .select("*");

      if (error) {
        console.error("Failed to fetch LTV projections:", error.message);
        setProjections([]);
        return;
      }

      setProjections(data ?? []);
    }

    fetchProjections();
  }, [token]);

  if (!projections) {
    return (
      <div style={cardStyle}>
        <h3 style={headerStyle}>📈 LTV Projections</h3>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading...
        </div>
      </div>
    );
  }

  if (projections.length === 0) {
    return (
      <div style={cardStyle}>
        <h3 style={headerStyle}>📈 LTV Projections</h3>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          No data available
        </div>
      </div>
    );
  }

  // Calculate max LTV for bar scaling
  const maxLTV = Math.max(...projections.map((p: Projection) => p.ltv90d), 1);

  // Summary stats
  const totalLTV = projections.reduce((sum: number, p: Projection) => sum + p.ltv90d, 0);
  const avgLTV = totalLTV / projections.length;
  const highConfidence = projections.filter((p: Projection) => p.confidence === "high").length;

  return (
    <div style={cardStyle}>
      <h3 style={headerStyle}>📈 LTV Projections (90-day)</h3>
      <p style={subtitleStyle}>
        Projected revenue based on activity, response rate, and churn risk
      </p>

      {/* Summary Stats */}
      <div style={summaryRowStyle}>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent)" }}>
            {formatCurrency(totalLTV)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Projected</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#3b82f6" }}>
            {formatCurrency(avgLTV)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Avg per Chatter</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#22c55e" }}>
            {highConfidence}/{projections.length}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>High Confidence</div>
        </div>
      </div>

      {/* Chart + Table */}
      <div style={{ display: "flex", gap: "20px", marginTop: "16px" }}>
        {/* Bar Chart */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {projections.slice(0, 10).map((p: Projection, i: number) => {
              const barWidth = maxLTV > 0 ? (p.ltv90d / maxLTV) * 100 : 0;
              return (
                <div
                  key={p.chatterId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 0",
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

                  {/* Avatar + Name */}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "120px" }}>
                    {p.profilePictureUrl ? (
                      <img
                        src={p.profilePictureUrl}
                        alt=""
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "8px",
                          objectFit: "cover",
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: "28px",
                          height: "28px",
                          borderRadius: "8px",
                          background: "var(--accent)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: "14px",
                        }}
                      >
                        {p.avatarEmoji || "👤"}
                      </div>
                    )}
                    <span
                      style={{
                        fontSize: "13px",
                        fontWeight: "500",
                        color: "var(--text)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {p.name}
                    </span>
                  </div>

                  {/* Bar */}
                  <div style={{ flex: 1, height: "20px", background: "var(--bg)", borderRadius: "6px", overflow: "hidden" }}>
                    <div
                      style={{
                        width: `${barWidth}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, var(--accent) 0%, #f1ae38 100%)`,
                        borderRadius: "6px",
                        transition: "width 0.3s ease",
                      }}
                    />
                  </div>

                  {/* Value */}
                  <div style={{ width: "60px", textAlign: "right", fontSize: "13px", fontWeight: "600", color: "var(--accent)" }}>
                    {formatCurrency(p.ltv90d)}
                  </div>

                  {/* Confidence */}
                  <div
                    style={{
                      width: "40px",
                      padding: "2px 6px",
                      fontSize: "10px",
                      fontWeight: "600",
                      color: "#fff",
                      background: confidenceColors[p.confidence],
                      borderRadius: "4px",
                      textAlign: "center",
                    }}
                  >
                    {confidenceLabels[p.confidence]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Full Table (collapsible in future) */}
      {projections.length > 10 && (
        <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-muted)", textAlign: "center" }}>
          Showing top 10 of {projections.length} chatters
        </div>
      )}

      {/* Methodology note */}
      <div
        style={{
          marginTop: "16px",
          padding: "12px",
          background: "var(--bg)",
          borderRadius: "10px",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        <strong>How LTV is calculated:</strong> Base = avg daily revenue × 90 days, adjusted by
        response rate (±20%) and churn probability (up to -50%). High confidence requires 30+ reports.
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

const summaryRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: "12px",
  padding: "16px 0",
  borderBottom: "1px solid var(--border)",
};

const summaryStatStyle: React.CSSProperties = {
  textAlign: "center",
};
