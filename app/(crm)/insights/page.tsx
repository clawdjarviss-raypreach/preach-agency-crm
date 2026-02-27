"use client";

import { useState, useEffect } from "react";
import LTVProjection from "../../../components/LTVProjection";
import SeasonalityHeatmap from "../../../components/SeasonalityHeatmap";
import SegmentationDashboard from "../../../components/SegmentationDashboard";

export default function InsightsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isAdmin = user && ["admin", "manager", "supervisor"].includes(user.role);

  if (!user) {
    return (
      <div style={{ maxWidth: "1400px", padding: "24px" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            Loading...
          </h3>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{ maxWidth: "1400px", padding: "24px" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            Access Denied
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
            Admin, manager, or supervisor access required to view insights.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>
          🔮 Queue Insights
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          Deep analytics on chatter performance, activity patterns, and segmentation
        </p>
      </div>

      {/* Dashboard Sections */}
      <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
        {/* Section 1: LTV Projections */}
        <LTVProjection token={token} />

        {/* Two-column layout for Seasonality and Segmentation */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(500px, 1fr))",
            gap: "24px",
          }}
        >
          {/* Section 2: Seasonality Heatmap */}
          <SeasonalityHeatmap token={token} />

          {/* Section 3: Segmentation Dashboard */}
          <SegmentationDashboard token={token} />
        </div>
      </div>

      {/* Footer note */}
      <div
        style={{
          marginTop: "32px",
          padding: "16px",
          background: "var(--surface)",
          borderRadius: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "18px" }}>💡</span>
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          Data is computed from the last 90 days of activity. LTV projections update
          automatically as new reports are submitted. Refresh to see latest data.
        </span>
      </div>
    </div>
  );
}
