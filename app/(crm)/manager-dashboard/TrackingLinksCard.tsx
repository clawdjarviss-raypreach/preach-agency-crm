"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { supabase } from "@/lib/supabase";
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

function LinkSparkline({ token, linkId }: { token: string; linkId: string }) {
  const [history, setHistory] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token || !linkId) return;

    const fetchHistory = async () => {
      const { data } = await supabase
        .from("crm_tracking_link_snapshots")
        .select("*")
        .eq("tracking_link_id", linkId)
        .order("snapshot_at", { ascending: true })
        .limit(30);
      setHistory(data ?? []);
    };

    fetchHistory();
  }, [token, linkId]);

  const chartData = useMemo(() => {
    if (!history || history.length === 0) return [];
    return [...history]
      .sort((a: any, b: any) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime())
      .map((s: any) => ({
        date: new Date(s.snapshot_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
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

const COL_STYLES = {
  linkName: { width: "30%", padding: "10px 10px", textAlign: "left" as const },
  creator: { width: "18%", padding: "10px 10px", textAlign: "left" as const },
  clicks: { width: "12%", padding: "10px 10px", textAlign: "right" as const },
  subs: { width: "14%", padding: "10px 10px", textAlign: "right" as const },
  conv: { width: "12%", padding: "10px 10px", textAlign: "right" as const },
  synced: { width: "14%", padding: "10px 10px", textAlign: "right" as const },
};

export default function TrackingLinksCard({ token, isAdmin }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [links, setLinks] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchLinks = async () => {
      const { data } = await supabase
        .from("crm_tracking_links")
        .select("*, creator:crm_creators(name)");
      setLinks(data ?? []);
    };

    fetchLinks();
  }, [token]);

  // Group by creator
  const grouped = useMemo(() => {
    if (!links || links.length === 0) return [];
    const map = new Map<string, any[]>();
    for (const link of links) {
      const creator = link.creator?.name || (link as any).creatorName || "Unknown";
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px", tableLayout: "fixed" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #2a2a2a" }}>
                <th style={{ ...COL_STYLES.linkName, fontSize: "11px", color: "#666", fontWeight: 600 }}>Link Name</th>
                <th style={{ ...COL_STYLES.creator, fontSize: "11px", color: "#666", fontWeight: 600 }}>Creator</th>
                <th style={{ ...COL_STYLES.clicks, fontSize: "11px", color: "#666", fontWeight: 600 }}>Clicks</th>
                <th style={{ ...COL_STYLES.subs, fontSize: "11px", color: "#666", fontWeight: 600 }}>Subscribers</th>
                <th style={{ ...COL_STYLES.conv, fontSize: "11px", color: "#666", fontWeight: 600 }}>Conv. Rate</th>
                <th style={{ ...COL_STYLES.synced, fontSize: "11px", color: "#666", fontWeight: 600 }}>Last Synced</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([creator, creatorLinks]) => (
                <Fragment key={creator}>
                  {grouped.length > 1 && (
                    <tr>
                      <td colSpan={6} style={{
                        fontSize: "11px", color: "#f1ae38", fontWeight: 600,
                        textTransform: "uppercase", letterSpacing: "0.5px",
                        padding: "12px 10px 4px",
                      }}>
                        {creator}
                      </td>
                    </tr>
                  )}
                  {creatorLinks.map((link: any) => {
                    const id = link.id?.toString() || link.linkId;
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
                      <Fragment key={id}>
                        <tr
                          style={{ cursor: "pointer", borderBottom: isExpanded ? "none" : "1px solid #242424" }}
                          onClick={() => toggleExpand(id)}
                          onMouseEnter={(e) => {
                            for (const cell of Array.from(e.currentTarget.children)) {
                              (cell as HTMLElement).style.background = "#242424";
                            }
                          }}
                          onMouseLeave={(e) => {
                            for (const cell of Array.from(e.currentTarget.children)) {
                              (cell as HTMLElement).style.background = "transparent";
                            }
                          }}
                        >
                          <td style={{ ...COL_STYLES.linkName, color: "#fff", fontWeight: 500, transition: "background 0.15s" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "10px", color: "#666", transition: "transform 0.2s", transform: isExpanded ? "rotate(90deg)" : "rotate(0)", flexShrink: 0 }}>▶</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.name || link.url || "Unnamed"}</span>
                            </div>
                          </td>
                          <td style={{ ...COL_STYLES.creator, color: "#a0a0a0", fontSize: "13px", transition: "background 0.15s" }}>
                            {link.creator?.name || (link as any).creatorName || creator}
                          </td>
                          <td style={{ ...COL_STYLES.clicks, color: "#fff", fontWeight: 600, fontVariantNumeric: "tabular-nums", transition: "background 0.15s" }}>
                            {clicks.toLocaleString()}
                          </td>
                          <td style={{ ...COL_STYLES.subs, color: "#fff", fontWeight: 600, fontVariantNumeric: "tabular-nums", transition: "background 0.15s" }}>
                            {subs.toLocaleString()}
                          </td>
                          <td style={{ ...COL_STYLES.conv, color: subs > 0 ? "#22c55e" : "#666", fontWeight: 600, fontVariantNumeric: "tabular-nums", transition: "background 0.15s" }}>
                            {convRate}
                          </td>
                          <td style={{ ...COL_STYLES.synced, color: "#a0a0a0", fontSize: "12px", transition: "background 0.15s" }}>
                            {lastSynced}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr>
                            <td colSpan={6} style={{
                              padding: "12px 16px 16px", background: "#161616",
                              borderBottom: "1px solid #2a2a2a",
                            }}>
                              <div style={{ fontSize: "11px", color: "#666", marginBottom: "8px", textTransform: "uppercase" }}>
                                30-Day Trend
                              </div>
                              <LinkSparkline token={token} linkId={link.id} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
