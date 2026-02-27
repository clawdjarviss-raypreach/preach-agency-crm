"use client";

import React, { useMemo } from "react";

export type QueuePriority = "critical" | "high" | "normal" | "low";
export type QueueSlaStatus = "ok" | "warning" | "breach";

export type QueueItemLike = {
  _id: string;
  creatorId: string;
  chatterId?: string;
  originalChatterId?: string;

  fanUsername: string;
  fanDisplayName?: string;
  fanSegment: string;

  messagePreview?: string;
  messageType: string;
  priority: QueuePriority;
  status: string;

  receivedAt: number;
  firstViewedAt?: number;
  respondedAt?: number;

  waitTimeSec?: number;
  slaMaxWaitSec?: number;
  slaStatus?: QueueSlaStatus;

  escalatedAt?: number;
  escalatedTo?: string;
  escalationReason?: string;

  notes?: string;
  tags?: string[];
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

function segmentBadgeColor(segment: string): { bg: string; fg: string } {
  switch (segment) {
    case "vip":
      return { bg: "rgba(239, 68, 68, 0.12)", fg: "#ef4444" };
    case "whale":
      return { bg: "rgba(245, 158, 11, 0.14)", fg: "#f59e0b" };
    case "core":
      return { bg: "rgba(59, 130, 246, 0.12)", fg: "#3b82f6" };
    case "casual":
      return { bg: "rgba(107, 114, 128, 0.14)", fg: "#6b7280" };
    case "new":
      return { bg: "rgba(34, 197, 94, 0.12)", fg: "#22c55e" };
    default:
      return { bg: "rgba(107, 114, 128, 0.14)", fg: "#6b7280" };
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

function isOpenStatus(status: string): boolean {
  return status === "pending" || status === "in_progress" || status === "escalated";
}

export default function QueueItemCard({
  item,
  nowMs,
  creatorsById,
  chattersById,
  selected,
  onToggleSelected,
  expanded,
  onToggleExpanded,
  onClaim,
  onEscalate,
  onResolve,
  loading,
}: {
  item: QueueItemLike;
  nowMs: number;
  creatorsById: Record<string, string>;
  chattersById: Record<string, string>;
  selected: boolean;
  onToggleSelected: () => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onClaim: () => void;
  onEscalate: () => void;
  onResolve: () => void;
  loading: boolean;
}) {
  const creatorName = creatorsById[item.creatorId] ?? "Unknown creator";
  const chatterName = item.chatterId ? (chattersById[item.chatterId] ?? "Unknown") : "Unassigned";

  const waitSec = computeWaitSec(item, nowMs);
  const maxWaitSec = item.slaMaxWaitSec ?? 0;

  const slaStatus: QueueSlaStatus = useMemo(() => {
    if (!isOpenStatus(item.status)) return "ok";
    if (maxWaitSec <= 0) return "ok";
    if (waitSec >= maxWaitSec) return "breach";
    if (waitSec >= Math.floor(maxWaitSec * 0.7)) return "warning";
    return "ok";
  }, [item.status, maxWaitSec, waitSec]);

  const priColor = priorityColor(item.priority);
  const seg = segmentBadgeColor(item.fanSegment);

  const borderColor = slaStatus === "breach" ? "#ef4444" : slaStatus === "warning" ? "#f59e0b" : "var(--border)";
  const bg = slaStatus === "breach"
    ? "rgba(239, 68, 68, 0.06)"
    : slaStatus === "warning"
      ? "rgba(245, 158, 11, 0.06)"
      : "var(--surface)";

  const cardStyle: React.CSSProperties = {
    background: bg,
    border: `1px solid ${borderColor}`,
    borderRadius: 18,
    padding: 16,
    cursor: "pointer",
    opacity: loading ? 0.7 : 1,
    transition: "all 0.15s ease",
    boxShadow: expanded ? "0 12px 26px rgba(0,0,0,0.08)" : "none",
  };

  const metaText: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 800,
  };

  const badge: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid var(--border)",
    background: "transparent",
    fontSize: 12,
    fontWeight: 900,
    color: "var(--text)",
    whiteSpace: "nowrap",
  };

  const actionBtn: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    fontSize: 13,
    cursor: "pointer",
  };

  const preview = (item.messagePreview ?? "").trim();
  const truncated = preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;

  return (
    <div
      style={cardStyle}
      onClick={onToggleExpanded}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleExpanded();
        }
      }}
      aria-expanded={expanded}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, minWidth: 260, flex: 1 }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelected();
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label="Select queue item"
            style={{ marginTop: 4 }}
          />

          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontSize: 15, fontWeight: 1000, color: "var(--text)" }}>
                @{item.fanUsername}
                {item.fanDisplayName ? (
                  <span style={{ fontWeight: 900, color: "var(--text-secondary)" }}>{" "}({item.fanDisplayName})</span>
                ) : null}
              </div>

              <span style={{ ...badge, borderColor: seg.fg, background: seg.bg, color: seg.fg }}>
                {String(item.fanSegment).toUpperCase()}
              </span>

              <span style={{ ...badge, borderColor: priColor }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: priColor }} />
                {String(item.priority).toUpperCase()}
              </span>

              {slaStatus !== "ok" ? (
                <span
                  style={{
                    ...badge,
                    borderColor: slaStatus === "breach" ? "#ef4444" : "#f59e0b",
                    color: slaStatus === "breach" ? "#ef4444" : "#f59e0b",
                  }}
                >
                  {slaStatus === "breach" ? "SLA BREACH" : "SLA WARNING"}
                </span>
              ) : null}
            </div>

            <div style={{ marginTop: 8, fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.35 }}>
              {truncated || <span style={{ color: "var(--text-muted)", fontWeight: 800 }}>No preview</span>}
            </div>

            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={metaText}>Creator: {creatorName}</span>
              <span style={metaText}>•</span>
              <span style={metaText}>Assigned: {chatterName}</span>
              <span style={metaText}>•</span>
              <span style={{ ...metaText, fontVariantNumeric: "tabular-nums" }}>
                Wait: {formatDuration(waitSec)}
                {maxWaitSec > 0 ? (
                  <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>{" "}/ {formatDuration(maxWaitSec)}</span>
                ) : null}
              </span>
              <span style={metaText}>•</span>
              <span style={metaText}>Status: {item.status}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
          <button
            style={{ ...actionBtn, borderColor: "rgba(59, 130, 246, 0.35)", background: "rgba(59, 130, 246, 0.08)" }}
            onClick={onClaim}
            disabled={loading || !isOpenStatus(item.status)}
            title="Claim (C)"
          >
            Claim
          </button>
          <button
            style={{ ...actionBtn, borderColor: "rgba(245, 158, 11, 0.45)", background: "rgba(245, 158, 11, 0.08)" }}
            onClick={onEscalate}
            disabled={loading || !isOpenStatus(item.status)}
            title="Escalate (E)"
          >
            Escalate
          </button>
          <button
            style={{ ...actionBtn, borderColor: "rgba(34, 197, 94, 0.45)", background: "rgba(34, 197, 94, 0.08)" }}
            onClick={onResolve}
            disabled={loading || !isOpenStatus(item.status)}
            title="Resolve"
          >
            Resolve
          </button>
        </div>
      </div>

      {expanded ? (
        <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 900, marginBottom: 6 }}>Message details</div>
              <div style={{ fontSize: 14, color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.35 }}>
                {(item.messagePreview ?? "").trim() || "(No preview logged)"}
              </div>
              {item.notes ? (
                <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                  <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Notes:</span> {item.notes}
                </div>
              ) : null}
              {item.tags && item.tags.length > 0 ? (
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {item.tags.map((t) => (
                    <span
                      key={t}
                      style={{
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        fontSize: 12,
                        fontWeight: 900,
                        color: "var(--text-secondary)",
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 900, marginBottom: 6 }}>Context</div>
              <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <div>
                  <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Type:</span> {item.messageType}
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Received:</span>{" "}
                  {new Date(item.receivedAt).toLocaleString()}
                </div>
                {item.firstViewedAt ? (
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>First viewed:</span>{" "}
                    {new Date(item.firstViewedAt).toLocaleString()}
                  </div>
                ) : null}
                {item.respondedAt ? (
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Responded:</span>{" "}
                    {new Date(item.respondedAt).toLocaleString()}
                  </div>
                ) : null}
                {item.escalatedAt ? (
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Escalated:</span>{" "}
                    {new Date(item.escalatedAt).toLocaleString()}
                  </div>
                ) : null}
                {item.escalationReason ? (
                  <div>
                    <span style={{ color: "var(--text-muted)", fontWeight: 900 }}>Reason:</span> {item.escalationReason}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-muted)", fontWeight: 900 }}>
            Click card header to collapse.
          </div>
        </div>
      ) : null}
    </div>
  );
}
