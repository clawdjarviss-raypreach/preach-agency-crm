"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface SeasonalityHeatmapProps {
  token: string;
}

interface SeasonalityCell {
  dayOfWeek: number;
  hour: number;
  avgMessages: number;
  totalCount: number;
  peakFlag: boolean;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOUR_LABELS = [
  "12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a",
  "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p",
];

function getHeatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "var(--bg)";
  const intensity = value / max;

  // Color gradient: light gray → yellow → orange → red
  if (intensity < 0.25) {
    return `rgba(196, 149, 106, ${0.1 + intensity * 0.3})`;
  } else if (intensity < 0.5) {
    return `rgba(196, 149, 106, ${0.4 + (intensity - 0.25) * 0.4})`;
  } else if (intensity < 0.75) {
    return `rgba(245, 158, 11, ${0.6 + (intensity - 0.5) * 0.3})`;
  } else {
    return `rgba(239, 68, 68, ${0.8 + (intensity - 0.75) * 0.2})`;
  }
}

export default function SeasonalityHeatmap({ token }: SeasonalityHeatmapProps) {
  const [seasonality, setSeasonality] = useState<SeasonalityCell[] | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchSeasonality() {
      const { data, error } = await supabase
        .from("crm_seasonality")
        .select("*");

      if (error) {
        console.error("Failed to fetch seasonality data:", error.message);
        setSeasonality([]);
        return;
      }

      setSeasonality(data ?? []);
    }

    fetchSeasonality();
  }, [token]);

  if (!seasonality) {
    return (
      <div style={cardStyle}>
        <h3 style={headerStyle}>🔥 Activity Heatmap</h3>
        <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
          Loading...
        </div>
      </div>
    );
  }

  // Build 7x24 matrix
  const matrix: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
  let maxValue = 0;

  for (const cell of seasonality) {
    matrix[cell.dayOfWeek][cell.hour] = cell.avgMessages;
    if (cell.avgMessages > maxValue) maxValue = cell.avgMessages;
  }

  // Find peak times
  const peaks = seasonality.filter((c: SeasonalityCell) => c.peakFlag);
  const peakDescriptions = peaks.slice(0, 5).map((p: SeasonalityCell) =>
    `${DAY_LABELS[p.dayOfWeek]} ${HOUR_LABELS[p.hour]}`
  );

  // Calculate summary stats
  const totalActivity = seasonality.reduce((sum: number, c: SeasonalityCell) => sum + c.avgMessages, 0);
  const avgPerSlot = totalActivity / (7 * 24);

  // Find busiest day and hour
  const dayTotals = DAY_LABELS.map((_, i) =>
    matrix[i].reduce((sum, v) => sum + v, 0)
  );
  const busiestDayIndex = dayTotals.indexOf(Math.max(...dayTotals));

  const hourTotals = HOUR_LABELS.map((_, h) =>
    matrix.reduce((sum, day) => sum + day[h], 0)
  );
  const busiestHourIndex = hourTotals.indexOf(Math.max(...hourTotals));

  return (
    <div style={cardStyle}>
      <h3 style={headerStyle}>🔥 Activity Heatmap</h3>
      <p style={subtitleStyle}>
        Transaction patterns by day of week and hour (last 90 days)
      </p>

      {/* Summary Stats */}
      <div style={summaryRowStyle}>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "var(--accent)" }}>
            {DAY_LABELS[busiestDayIndex]}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Busiest Day</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#f59e0b" }}>
            {HOUR_LABELS[busiestHourIndex]}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Peak Hour</div>
        </div>
        <div style={summaryStatStyle}>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#3b82f6" }}>
            {avgPerSlot.toFixed(1)}
          </div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Avg/Slot</div>
        </div>
      </div>

      {/* Heatmap Grid */}
      <div style={{ marginTop: "16px", overflowX: "auto" }}>
        <div style={{ display: "flex", flexDirection: "column", minWidth: "600px" }}>
          {/* Hour labels row */}
          <div style={{ display: "flex", marginLeft: "50px", marginBottom: "4px" }}>
            {HOUR_LABELS.map((label, i) => (
              <div
                key={i}
                style={{
                  width: "24px",
                  fontSize: "9px",
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                {i % 3 === 0 ? label : ""}
              </div>
            ))}
          </div>

          {/* Day rows */}
          {DAY_LABELS.map((day, dayIndex) => (
            <div key={dayIndex} style={{ display: "flex", alignItems: "center", marginBottom: "2px" }}>
              {/* Day label */}
              <div
                style={{
                  width: "50px",
                  fontSize: "11px",
                  fontWeight: "500",
                  color: "var(--text)",
                  paddingRight: "8px",
                  textAlign: "right",
                }}
              >
                {day}
              </div>

              {/* Hour cells */}
              {matrix[dayIndex].map((value, hourIndex) => {
                const cell = seasonality.find(
                  (c: SeasonalityCell) => c.dayOfWeek === dayIndex && c.hour === hourIndex
                );
                const isPeak = cell?.peakFlag || false;

                return (
                  <div
                    key={hourIndex}
                    title={`${day} ${HOUR_LABELS[hourIndex]}: ${value.toFixed(1)} avg transactions`}
                    style={{
                      width: "24px",
                      height: "24px",
                      background: getHeatColor(value, maxValue),
                      borderRadius: "3px",
                      margin: "1px",
                      cursor: "pointer",
                      border: isPeak ? "2px solid #ef4444" : "none",
                      boxSizing: "border-box",
                      transition: "transform 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.target as HTMLDivElement).style.transform = "scale(1.2)";
                    }}
                    onMouseLeave={(e) => {
                      (e.target as HTMLDivElement).style.transform = "scale(1)";
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          marginTop: "16px",
          padding: "12px",
          background: "var(--bg)",
          borderRadius: "10px",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Less</span>
        <div style={{ display: "flex", gap: "3px" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((i) => (
            <div
              key={i}
              style={{
                width: "20px",
                height: "20px",
                background: getHeatColor(i * maxValue, maxValue),
                borderRadius: "3px",
              }}
            />
          ))}
        </div>
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>More</span>
        <span style={{ fontSize: "11px", color: "#ef4444", fontWeight: "500", marginLeft: "12px" }}>
          🔥 = Peak (80%+ of max)
        </span>
      </div>

      {/* Peak times */}
      {peakDescriptions.length > 0 && (
        <div
          style={{
            marginTop: "12px",
            fontSize: "12px",
            color: "var(--text-muted)",
            textAlign: "center",
          }}
        >
          <strong>Peak times:</strong> {peakDescriptions.join(" · ")}
        </div>
      )}
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
