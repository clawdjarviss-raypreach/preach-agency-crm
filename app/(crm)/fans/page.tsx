"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type Segment = "all" | "whale" | "vip" | "core" | "casual" | "new";
type SortBy = "spend_desc" | "spend_asc" | "recent" | "username";

const SEGMENTS: Array<{ key: Segment; label: string; color: string; bg: string }> = [
  { key: "all", label: "All Fans", color: "#a0a0a0", bg: "rgba(160,160,160,0.12)" },
  { key: "whale", label: "🐳 Whale", color: "#f1ae38", bg: "rgba(241,174,56,0.15)" },
  { key: "vip", label: "⭐ VIP", color: "#a855f7", bg: "rgba(168,85,247,0.12)" },
  { key: "core", label: "💪 Core", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { key: "casual", label: "👋 Casual", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  { key: "new", label: "🆕 New", color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
];

const SORT_OPTIONS: Array<{ key: SortBy; label: string }> = [
  { key: "spend_desc", label: "Highest Spend" },
  { key: "spend_asc", label: "Lowest Spend" },
  { key: "recent", label: "Recently Active" },
  { key: "username", label: "Username A-Z" },
];

function segmentMeta(segment: string) {
  const found = SEGMENTS.find((s) => s.key === segment);
  return found || SEGMENTS[SEGMENTS.length - 1];
}

function formatMoney(value: number) {
  return `$${(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relativeTime(ts: number) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return `${Math.floor(day / 30)}mo ago`;
}

export default function FansPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [segment, setSegment] = useState<Segment>("all");
  const [sortBy, setSortBy] = useState<SortBy>("spend_desc");

  useEffect(() => {
    setToken(localStorage.getItem("crm_token") || "");
    const u = localStorage.getItem("crm_user");
    if (u) try { setUser(JSON.parse(u)); } catch { /* ignore */ }
  }, []);

  // OF API fans
  const ofFans = useQuery(
    (api as any).crm.ofQueries.getOfFans,
    {
      sortBy,
      segment: segment === "all" ? undefined : segment,
      limit: 200,
    }
  );

  // Segment counts
  const segmentCounts = useMemo(() => {
    if (!ofFans) return {};
    const allFansQuery = ofFans; // Already filtered by segment if set
    // We need unfiltered counts - use the data we have
    return { total: ofFans.length };
  }, [ofFans]);

  // Unfiltered fans for segment counts
  const allFans = useQuery(
    (api as any).crm.ofQueries.getOfFans,
    { sortBy: "spend_desc", limit: 500 }
  );

  const counts = useMemo(() => {
    if (!allFans) return {};
    const c: Record<string, number> = { all: allFans.length };
    for (const fan of allFans) {
      const seg = fan.segment || "new";
      c[seg] = (c[seg] || 0) + 1;
    }
    return c;
  }, [allFans]);

  if (user && !["admin", "manager", "supervisor"].includes(user.role)) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: 24, padding: 48, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h3 style={{ color: "var(--text)", marginBottom: 8 }}>Access Denied</h3>
        <p style={{ color: "var(--text-secondary)" }}>You don&apos;t have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1200 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>👥 Fan Directory</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, marginTop: 4 }}>
          OF API fan data with spending segments and activity tracking.
        </p>
      </div>

      {/* Segment cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 20 }}>
        {SEGMENTS.map((s) => {
          const active = segment === s.key;
          const count = counts[s.key] ?? 0;
          return (
            <button
              key={s.key}
              onClick={() => setSegment(s.key)}
              style={{
                background: active ? s.bg : "var(--surface)",
                borderRadius: 12,
                padding: "12px 14px",
                border: active ? `2px solid ${s.color}` : "2px solid transparent",
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              <div style={{ fontSize: 12, color: s.color, fontWeight: 600, textTransform: "uppercase" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text)", marginTop: 4 }}>
                {count}
              </div>
            </button>
          );
        })}
      </div>

      {/* Sort + controls */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: 14, flexWrap: "wrap", gap: 10,
      }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {ofFans ? `${ofFans.length} fans` : "Loading..."}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          style={{
            padding: "8px 14px",
            fontSize: 13,
            fontWeight: 600,
            background: "var(--surface)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            cursor: "pointer",
            outline: "none",
          }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Fan table */}
      <div style={{ background: "var(--surface)", borderRadius: 16, overflow: "hidden", border: "1px solid var(--border)" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={th}>Username</th>
                <th style={th}>Total Spend</th>
                <th style={th}>Segment</th>
                <th style={th}>Subscription</th>
                <th style={th}>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {!ofFans ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>Loading fans...</td></tr>
              ) : ofFans.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>No fans found for this segment.</td></tr>
              ) : (
                ofFans.map((fan: any) => {
                  const seg = segmentMeta(fan.segment);
                  return (
                    <tr key={fan._id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8,
                            background: seg.bg, display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: 14, fontWeight: 700, color: seg.color,
                          }}>
                            {(fan.username || "?")[0].toUpperCase()}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: "var(--text)", fontSize: 14 }}>@{fan.username}</div>
                            {fan.displayName && (
                              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{fan.displayName}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td style={{ ...td, fontWeight: 700, color: "#f1ae38", fontSize: 15 }}>
                        {formatMoney(fan.totalSpend)}
                      </td>
                      <td style={td}>
                        <span style={{
                          padding: "4px 10px", borderRadius: 999,
                          fontSize: 11, fontWeight: 700,
                          color: seg.color, background: seg.bg,
                          textTransform: "uppercase",
                        }}>
                          {seg.label}
                        </span>
                      </td>
                      <td style={td}>
                        {fan.isSubscribed || fan.subscriptionActive ? (
                          <span style={{
                            padding: "4px 10px", borderRadius: 8,
                            fontSize: 11, fontWeight: 600,
                            color: "#22c55e", background: "rgba(34,197,94,0.12)",
                          }}>
                            Active
                          </span>
                        ) : (
                          <span style={{
                            padding: "4px 10px", borderRadius: 8,
                            fontSize: 11, fontWeight: 600,
                            color: "#94a3b8", background: "rgba(148,163,184,0.1)",
                          }}>
                            Expired
                          </span>
                        )}
                      </td>
                      <td style={{ ...td, color: "var(--text-muted)", fontSize: 13 }}>
                        {relativeTime(fan.lastSeen)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 12,
  color: "var(--text-muted)",
  textAlign: "left",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const td: React.CSSProperties = {
  padding: "12px 14px",
  fontSize: 14,
};
