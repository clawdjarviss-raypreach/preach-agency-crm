"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

interface Props {
  token: string;
  isAdmin: boolean;
}

function SparkTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e1e1e", border: "1px solid #333", borderRadius: "6px",
      padding: "6px 10px", fontSize: "11px", color: "#fff",
    }}>
      <div style={{ color: "#a0a0a0" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
}

function LinkSparkline({ token, linkId }: { token: string; linkId: any }) {
  const history = useQuery(
    api.crm.trackingLinks.getTrackingLinkHistory,
    { token, trackingLinkId: linkId, days: 30 }
  );

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history]
      .sort((a: any, b: any) => a.snapshotAt - b.snapshotAt)
      .map((s: any) => ({
        date: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        clicks: s.clicks ?? 0,
        subs: s.subscribers ?? 0,
      }));
  }, [history]);

  if (!chartData.length) {
    return (
      <div style={{ color: "#666", fontSize: "12px", textAlign: "center", padding: "20px 0" }}>
        No snapshot data yet
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={chartData}>
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis hide allowDecimals={false} />
        <Tooltip content={<SparkTooltip />} />
        <Area type="monotone" dataKey="clicks" stroke="#3b82f6" fill="url(#sparkGrad)" strokeWidth={2} />
        <Area type="monotone" dataKey="subs" stroke="#22c55e" fill="none" strokeWidth={1.5} strokeDasharray="4 2" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function TrackingLinksCard({ token, isAdmin }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const links = useQuery(api.crm.trackingLinks.getMyTrackingLinks, token ? { token } : "skip");

  // Group by creator
  const grouped = useMemo(() => {
    if (!links || links.length === 0) return [];
    const map = new Map<string, any[]>();
    for (const link of links) {
      const creator = (link as any).creatorName || "Unknown";
      if (!map.has(creator)) map.set(creator, []);
      map.get(creator)!.push(link);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [links]);

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a",
    }}>
      <div style={{
        fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
        textTransform: "uppercase", letterSpacing: "0.5px",
      }}>
        🔗 Tracking Link Performance
      </div>

      {!links ? (
        <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
          Loading…
        </div>
      ) : links.length === 0 ? (
        <div style={{
          color: "#666", fontSize: "13px", textAlign: "center", padding: "40px 0",
          background: "#161616", borderRadius: "10px", border: "1px dashed #333",
        }}>
          No tracking links assigned to you
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {grouped.map(([creator, creatorLinks]) => (
            <div key={creator} style={{ marginBottom: "16px" }}>
              {grouped.length > 1 && (
                <div style={{
                  fontSize: "11px", color: "#f1ae38", fontWeight: 600,
                  textTransform: "uppercase", letterSpacing: "0.5px",
                  padding: "8px 10px", marginBottom: "4px",
                }}>
                  {creator}
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                <thead>
                  <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
                    {["Link Name", "Creator", "Clicks", "Subscribers", "Conv. Rate", "Last Synced"].map((h) => (
                      <th key={h} style={{ padding: "10px 10px", fontSize: "11px", color: "#666", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {creatorLinks.map((link: any) => {
                    const id = link._id?.toString() || link.linkId;
                    const clicks = link.clicks ?? link.totalClicks ?? 0;
                    const subs = link.subscribers ?? link.totalSubscribers ?? 0;
                    const convRate = clicks > 0 ? ((subs / clicks) * 100).toFixed(1) + "%" : "—";
                    const lastSynced = link.lastSyncedAt
                      ? new Date(link.lastSyncedAt).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                        })
                      : "—";
                    const isExpanded = expandedId === id;

                    return (
                      <tr key={id} style={{ cursor: "pointer" }} onClick={() => toggleExpand(id)}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div>
                            <div style={{
                              display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1.2fr",
                              padding: "12px 10px", borderBottom: "1px solid #242424",
                              transition: "background 0.15s",
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#242424")}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <div style={{ color: "#fff", fontWeight: 500, display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontSize: "10px", color: "#666", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                                {link.name || link.url || "Unnamed"}
                              </div>
                              <div style={{ color: "#a0a0a0", fontSize: "13px" }}>{(link as any).creatorName || creator}</div>
                              <div style={{ color: "#fff", fontWeight: 600 }}>{clicks.toLocaleString()}</div>
                              <div style={{ color: "#fff", fontWeight: 600 }}>{subs.toLocaleString()}</div>
                              <div style={{ color: subs > 0 ? "#22c55e" : "#666", fontWeight: 600 }}>{convRate}</div>
                              <div style={{ color: "#a0a0a0", fontSize: "12px" }}>{lastSynced}</div>
                            </div>
                            {isExpanded && (
                              <div style={{
                                padding: "12px 16px 16px", background: "#161616",
                                borderBottom: "1px solid #2a2a2a",
                              }}>
                                <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px", textTransform: "uppercase" }}>
                                  30-Day Trend
                                </div>
                                <LinkSparkline token={token} linkId={link._id} />
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
