"use client";

import React, { useMemo } from "react";

type QueuePriority = "critical" | "high" | "normal" | "low";

type QueueItemLike = {
  status: string;
  priority: QueuePriority;
  receivedAt: number;
  respondedAt?: number;
  slaMaxWaitSec?: number;
};

function priorityColor(p: QueuePriority): string {
  switch (p) {
    case "critical":
      return "#ef4444";
    case "high":
      return "#f59e0b";
    case "normal":
      return "#3b82f6";
    case "low":
    default:
      return "#6b7280";
  }
}

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function computeWaitSec(item: QueueItemLike, nowMs: number): number {
  const end = item.respondedAt ?? nowMs;
  return Math.max(0, Math.floor((end - item.receivedAt) / 1000));
}

export default function QueueStatsBar({
  items,
  nowMs,
}: {
  items: QueueItemLike[];
  nowMs: number;
}) {
  const stats = useMemo(() => {
    const open = items.filter((i) => i.status === "pending" || i.status === "in_progress" || i.status === "escalated");
    const pending = open.filter((i) => i.status === "pending").length;

    let totalWait = 0;
    let breaches = 0;

    const byPriority: Record<QueuePriority, number> = {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    for (const i of open) {
      byPriority[i.priority] = (byPriority[i.priority] ?? 0) + 1;
      const w = computeWaitSec(i, nowMs);
      totalWait += w;
      const max = i.slaMaxWaitSec ?? 0;
      if (max > 0 && w >= max) breaches += 1;
    }

    const avgWaitSec = open.length > 0 ? Math.round(totalWait / open.length) : 0;

    return {
      openCount: open.length,
      pending,
      avgWaitSec,
      breaches,
      byPriority,
    };
  }, [items, nowMs]);

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 18,
    padding: 16,
  };

  const bigStyle: React.CSSProperties = {
    fontSize: 26,
    fontWeight: 900,
    color: "var(--text)",
    fontVariantNumeric: "tabular-nums",
    lineHeight: 1.1,
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 800,
    marginTop: 6,
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 12,
  };

  return (
    <div style={rowStyle}>
      <div style={cardStyle}>
        <div style={bigStyle}>{stats.pending}</div>
        <div style={labelStyle}>📬 Pending</div>
      </div>

      <div style={cardStyle}>
        <div style={bigStyle}>{formatDuration(stats.avgWaitSec)}</div>
        <div style={labelStyle}>⏱️ Avg wait (open)</div>
      </div>

      <div style={cardStyle}>
        <div style={{ ...bigStyle, color: stats.breaches > 0 ? "#ef4444" : "var(--text)" }}>
          {stats.breaches}
        </div>
        <div style={labelStyle}>⚠️ SLA breaches (open)</div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          {(["critical", "high", "normal", "low"] as QueuePriority[]).map((p) => (
            <div
              key={p}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 999,
                border: `1px solid ${priorityColor(p)}`,
                background: "transparent",
                fontSize: 13,
                fontWeight: 900,
                color: "var(--text)",
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 999, background: priorityColor(p) }} />
              {p}: {stats.byPriority[p] ?? 0}
            </div>
          ))}
        </div>
        <div style={labelStyle}>Items by priority (open)</div>
      </div>
    </div>
  );
}
