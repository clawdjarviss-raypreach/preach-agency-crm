"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";
import TrackingLinksCard from "./TrackingLinksCard";
import type { Id } from "../../../convex/_generated/dataModel";

const CREATOR_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
];

function toDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#1e1e1e", border: "1px solid #333", borderRadius: "8px",
      padding: "10px 14px", fontSize: "12px", color: "#fff",
      boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    }}>
      <div style={{ color: "#a0a0a0", marginBottom: "4px" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}>
          <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: p.color }} />
          <span>{p.name}: {p.value}</span>
        </div>
      ))}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a", ...style,
    }}>
      {children}
    </div>
  );
}

function KpiCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <Card>
      <div style={{
        fontSize: "11px", color: "#a0a0a0", fontWeight: "500",
        textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
      }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: "24px", fontWeight: "700", color: "#fff" }}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </Card>
  );
}

/* ─── IG Expandable Account Row (Redesigned) ─── */
function IgAccountRow({
  account,
  stats,
  token,
  dateRange,
  colorIndex,
}: {
  account: any;
  stats: any;
  token: string;
  dateRange: DateRange;
  colorIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reelSort, setReelSort] = useState<"views" | "likes" | "comments" | "date">("views");

  const reels = useQuery(
    api.crm.igQueries.getIgReels,
    expanded && token
      ? {
          token,
          igAccountId: account._id as Id<"crm_ig_accounts">,
          sortBy: reelSort,
          order: "desc" as const,
          limit: 10,
          startDate: dateRange.start,
          endDate: dateRange.end,
        }
      : "skip"
  );

  const followersDelta = stats?.followersDelta ?? 0;
  const followerGrowth = account.followers > 0 ? ((followersDelta / account.followers) * 100).toFixed(1) : "0.0";

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ borderBottom: "1px solid #1C2A3A", cursor: "pointer", transition: "background 0.15s" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "#1a2535")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ color: "#666", fontSize: "10px", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "none" }}>▶</span>
            <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: CREATOR_COLORS[colorIndex % CREATOR_COLORS.length], flexShrink: 0 }} />
            @{account.username}
          </div>
        </td>
        <td style={{ padding: "14px 12px" }}>
          <span style={{ color: followersDelta >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
            {followersDelta >= 0 ? "+" : ""}{followersDelta.toLocaleString()}
          </span>
          <span style={{ color: "#666", fontSize: "11px", marginLeft: "6px" }}>({followerGrowth}%)</span>
        </td>
        <td style={{ padding: "14px 12px" }}>
          <span style={{
            background: "#22c55e20", color: "#22c55e", padding: "3px 10px",
            borderRadius: "12px", fontSize: "11px", fontWeight: 600,
          }}>Active</span>
        </td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 500 }}>{(stats?.views ?? 0).toLocaleString()}</td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 500 }}>{(stats?.likes ?? 0).toLocaleString()}</td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 500 }}>{(stats?.comments ?? 0).toLocaleString()}</td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 500 }}>{stats?.reelCount ?? 0}</td>
      </tr>
      {expanded && (
        <tr style={{ borderBottom: "1px solid #1C2A3A" }}>
          <td colSpan={7} style={{ padding: "16px", background: "#0a1219" }}>
            {/* Sort controls */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px", alignItems: "center" }}>
              <span style={{ color: "#666", fontSize: "12px", marginRight: "4px" }}>Sort by:</span>
              {(["views", "likes", "comments", "date"] as const).map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); setReelSort(s); }}
                  style={{
                    padding: "4px 12px", fontSize: "11px", fontWeight: 500,
                    color: reelSort === s ? "#0F1923" : "#999",
                    background: reelSort === s ? "#f1ae38" : "#1C2A3A",
                    border: "none", borderRadius: "14px", cursor: "pointer",
                    textTransform: "capitalize",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            {!reels ? (
              <div style={{ color: "#666", fontSize: "12px" }}>Loading reels…</div>
            ) : reels.length === 0 ? (
              <div style={{ color: "#666", fontSize: "12px" }}>No reels in this period</div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "12px",
              }}>
                {reels.map((reel: any) => {
                  const postedDate = reel.postedAt ? new Date(reel.postedAt) : null;
                  const dateLabel = postedDate
                    ? `${String(postedDate.getDate()).padStart(2, "0")}.${String(postedDate.getMonth() + 1).padStart(2, "0")}.`
                    : "";
                  return (
                    <div
                      key={reel._id}
                      style={{
                        background: "#1C2A3A",
                        borderRadius: "10px",
                        overflow: "hidden",
                        border: "1px solid #253545",
                      }}
                    >
                      {/* Thumbnail */}
                      <div style={{
                        width: "100%", height: "120px", background: "#253545",
                        position: "relative", overflow: "hidden",
                      }}>
                        {reel.thumbnailUrl ? (
                          <img
                            src={reel.thumbnailUrl}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontSize: "24px" }}>
                            🎬
                          </div>
                        )}
                        {/* Date overlay */}
                        {dateLabel && (
                          <div style={{
                            position: "absolute", top: "6px", left: "6px",
                            background: "rgba(0,0,0,0.7)", color: "#fff",
                            padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 600,
                          }}>
                            {dateLabel}
                          </div>
                        )}
                      </div>
                      {/* Stats overlay */}
                      <div style={{ padding: "10px", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <div style={{ fontSize: "11px", color: "#a0a0a0" }}>
                          <span style={{ color: "#22c55e" }}>+{(reel.views || 0).toLocaleString()}</span> views
                        </div>
                        <div style={{ fontSize: "11px", color: "#a0a0a0" }}>
                          <span style={{ color: "#ef4444" }}>+{(reel.likes || 0).toLocaleString()}</span> likes
                        </div>
                        <div style={{ fontSize: "11px", color: "#a0a0a0" }}>
                          <span style={{ color: "#3b82f6" }}>+{(reel.comments || 0).toLocaleString()}</span> comments
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Donut Chart with Legend ─── */
function DonutWithLegend({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 280px", minWidth: "250px" }}>
      <div style={{ fontSize: "12px", color: "#a0a0a0", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "160px", height: "160px", flexShrink: 0 }}>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.filter(d => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  strokeWidth={0}
                >
                  {data.filter(d => d.value > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatNumber(Number(value ?? 0))}
                  contentStyle={{ background: "#1C2A3A", border: "1px solid #253545", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#a0a0a0", fontSize: "12px" }}>
              No data
            </div>
          )}
        </div>
        <div style={{
          flex: 1, maxHeight: "160px", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "6px",
          paddingRight: "4px",
        }}>
          {data.map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: entry.color, flexShrink: 0 }} />
              <span style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
              <span style={{ color: "#f1ae38", fontWeight: 600, flexShrink: 0 }}>
                {formatNumber(entry.value)}
              </span>
              <span style={{ color: "#666", flexShrink: 0, fontSize: "11px" }}>
                {total > 0 ? Math.round((entry.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Instagram Analytics Section (Redesigned) ─── */
function InstagramAnalyticsSection({ token, dateRange }: { token: string; dateRange: DateRange }) {
  const [selectedCreator, setSelectedCreator] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);

  const igAccounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token
      ? {
          token,
          ...(selectedCreator !== "all"
            ? { creatorId: selectedCreator as Id<"crm_creators"> }
            : {}),
        }
      : "skip"
  );

  const allIgAccounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token } : "skip"
  );

  const igReelStats = useQuery(
    api.crm.igQueries.getIgAccountReelStats,
    token
      ? {
          token,
          startDate: dateRange.start,
          endDate: dateRange.end,
          ...(selectedCreator !== "all"
            ? { creatorId: selectedCreator as Id<"crm_creators"> }
            : {}),
        }
      : "skip"
  );

  const creatorOptions = useMemo(() => {
    if (!allIgAccounts) return [];
    const map = new Map<string, string>();
    for (const acc of allIgAccounts) {
      if (acc.creatorId && acc.creatorName) {
        map.set(String(acc.creatorId), acc.creatorName);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allIgAccounts]);

  const statsMap = useMemo(() => {
    if (!igReelStats?.byAccount) return new Map();
    return new Map(igReelStats.byAccount.map((s: any) => [s.accountId, s]));
  }, [igReelStats]);

  const sortedAccounts = useMemo(() => {
    if (!igAccounts) return [];
    return [...igAccounts].sort((a, b) => {
      const aViews = statsMap.get(String(a._id))?.views ?? 0;
      const bViews = statsMap.get(String(b._id))?.views ?? 0;
      return bViews - aViews;
    });
  }, [igAccounts, statsMap]);

  const displayedAccounts = showAll ? sortedAccounts : sortedAccounts.slice(0, 30);
  const totals = igReelStats?.totals;

  // Donut chart data: views and followers per account
  const pieChartData = useMemo(() => {
    if (!igReelStats?.byAccount || !igAccounts) return { viewsData: [], followersData: [] };
    const accountMap = new Map<string, any>(igAccounts.map((a: any) => [String(a._id), a]));
    const viewsData: { name: string; value: number; color: string }[] = [];
    const followersData: { name: string; value: number; color: string }[] = [];
    igReelStats.byAccount.slice(0, 15).forEach((stat: any, i: number) => {
      const account = accountMap.get(stat.accountId);
      const name = account?.creatorName || account?.username || "Unknown";
      const color = CREATOR_COLORS[i % CREATOR_COLORS.length];
      viewsData.push({ name, value: stat.views, color });
      followersData.push({ name, value: Math.max(0, stat.followersDelta || 0), color });
    });
    return { viewsData, followersData };
  }, [igReelStats, igAccounts]);

  return (
    <div>
      <div style={{
        borderTop: "1px solid #1C2A3A", marginBottom: "28px", paddingTop: "28px",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexWrap: "wrap", gap: "12px", marginBottom: "24px",
        }}>
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "#fff", margin: 0 }}>
            📸 Instagram Analytics
          </h2>
          <select
            value={selectedCreator}
            onChange={(e) => { setSelectedCreator(e.target.value); setShowAll(false); }}
            style={{
              background: "#1C2A3A", color: "#fff", border: "1px solid #253545",
              borderRadius: "8px", padding: "8px 12px", fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <option value="all">All Creators</option>
            {creatorOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* A. KPI Cards Row */}
      {totals && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "14px", marginBottom: "24px",
        }}>
          {[
            { label: "All Views", value: totals.views, icon: "👁" },
            { label: "All Likes", value: totals.likes, icon: "❤️" },
            { label: "New Followers", value: totals.followersDelta ?? 0, icon: "👥", prefix: (totals.followersDelta ?? 0) >= 0 ? "+" : "" },
            { label: "All Shares", value: totals.shares, icon: "🔗" },
            { label: "Reels Posted", value: totals.reelCount, icon: "🎬" },
            { label: "All Comments", value: totals.comments, icon: "💬" },
          ].map((kpi) => (
            <div key={kpi.label} style={{
              background: "#1C2A3A", borderRadius: "14px", padding: "20px",
              border: "1px solid #253545",
            }}>
              <div style={{
                fontSize: "11px", color: "#a0a0a0", fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
              }}>
                {kpi.icon} {kpi.label}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 700, color: "#f1ae38" }}>
                {kpi.prefix || ""}{typeof kpi.value === "number" ? formatNumber(kpi.value) : kpi.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* B. Donut Charts Row */}
      {(pieChartData.viewsData.length > 0 || pieChartData.followersData.length > 0) && (
        <div style={{
          background: "#1C2A3A", borderRadius: "14px", padding: "24px",
          border: "1px solid #253545", marginBottom: "24px",
        }}>
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
            <DonutWithLegend title="All Views Comparison" data={pieChartData.viewsData} />
            <DonutWithLegend title="New Followers Comparison" data={pieChartData.followersData} />
          </div>
        </div>
      )}

      {/* C. Accounts Table */}
      <div style={{
        background: "#1C2A3A", borderRadius: "14px", padding: "24px",
        border: "1px solid #253545", overflowX: "auto",
      }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          Accounts (by views)
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #253545" }}>
              {["Username", "New Followers", "Status", "Views", "Likes", "Comments", "Reels Posted"].map((h) => (
                <th key={h} style={{ padding: "12px 12px", fontSize: "11px", color: "#666", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!igAccounts ? (
              <tr>
                <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#666", fontSize: "13px" }}>
                  Loading…
                </td>
              </tr>
            ) : displayedAccounts.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "#666", fontSize: "13px" }}>
                  No accounts found
                </td>
              </tr>
            ) : (
              displayedAccounts.map((account: any, i: number) => (
                <IgAccountRow
                  key={account._id}
                  account={account}
                  stats={statsMap.get(String(account._id))}
                  token={token}
                  dateRange={dateRange}
                  colorIndex={i}
                />
              ))
            )}
          </tbody>
        </table>
        {!showAll && sortedAccounts.length > 30 && (
          <div style={{ textAlign: "center", marginTop: "16px" }}>
            <button
              onClick={() => setShowAll(true)}
              style={{
                background: "transparent", color: "#f1ae38", border: "1px solid #f1ae38",
                borderRadius: "8px", padding: "8px 20px", fontSize: "13px",
                cursor: "pointer", fontWeight: 600,
              }}
            >
              Show all ({sortedAccounts.length - 30} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main Page ─── */
export default function ManagerDashboardPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);

  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(6));

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const trendPeriod = useMemo((): "7d" | "30d" | "90d" => {
    const start = new Date(dateRange.start + "T00:00:00");
    const end = new Date(dateRange.end + "T23:59:59");
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return "7d";
    if (days <= 30) return "30d";
    return "90d";
  }, [dateRange]);

  const subscriberStats = useQuery(
    api.crm.managerDashboard.getSubscriberStats,
    token ? { token, startDate: dateRange.start, endDate: dateRange.end } : "skip"
  );

  const subTrends = useQuery(
    api.crm.managerDashboard.getSubTrends,
    token ? { token, period: trendPeriod } : "skip"
  );

  const chartData = useMemo(() => {
    if (!subTrends?.dataPoints) return [];
    return subTrends.dataPoints.map((dp: any) => ({
      date: new Date(dp.date + "T12:00:00").toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      }),
      "New Subs": dp.newSubs,
    }));
  }, [subTrends]);

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "var(--text)" }}>
        🔒 This dashboard is for marketing managers only.
      </div>
    );
  }

  const accounts = subscriberStats?.accounts || [];
  const totals = subscriberStats?.totals || { newSubsInRange: 0 };
  const rangeLabelText = `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "28px", flexWrap: "wrap", gap: "16px",
      }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#fff", margin: 0 }}>
            {getGreeting()}, {user.name || "Manager"}! 📊
          </h1>
          <p style={{ fontSize: "14px", color: "#a0a0a0", marginTop: "6px", margin: 0 }}>
            Acquisition metrics for your creators
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      {/* Summary Card — New Subs in Range */}
      <div style={{ marginBottom: "24px" }}>
        <Card>
          <div style={{
            fontSize: "11px", color: "#a0a0a0", fontWeight: "500",
            textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px",
          }}>
            🆕 New Subscribers ({rangeLabelText})
          </div>
          <div style={{ fontSize: "28px", fontWeight: "700", color: "#f1ae38" }}>
            {totals.newSubsInRange.toLocaleString()}
          </div>
        </Card>
      </div>

      {/* New Subs Per Creator Table */}
      <Card style={{ marginBottom: "24px", overflowX: "auto" }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          New Subscribers Per Creator
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "400px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {["Creator", "New Subs"].map((h) => (
                <th key={h} style={{ padding: "12px 10px", fontSize: "12px", color: "#a0a0a0", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {accounts.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: "24px", textAlign: "center", color: "#666", fontSize: "13px" }}>
                  No creators assigned
                </td>
              </tr>
            ) : (
              accounts.map((row: any, i: number) => (
                <tr key={row.accountId} style={{ borderBottom: "1px solid #242424" }}>
                  <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{
                        width: "10px", height: "10px", borderRadius: "3px",
                        background: CREATOR_COLORS[i % CREATOR_COLORS.length], flexShrink: 0,
                      }} />
                      {row.creatorName}
                    </div>
                  </td>
                  <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600, fontSize: "16px" }}>{row.newSubsInRange}</td>
                </tr>
              ))
            )}
            {accounts.length > 1 && (
              <tr style={{ borderTop: "2px solid #333" }}>
                <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700, fontSize: "16px" }}>
                  {accounts.reduce((s: number, r: any) => s + r.newSubsInRange, 0)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Daily Sub Trend Chart */}
      <Card style={{ marginBottom: "24px" }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          Daily New Subscribers — Last {trendPeriod === "7d" ? "7" : trendPeriod === "30d" ? "30" : "90"} Days
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(241,174,56,0.08)" }} />
              <Bar dataKey="New Subs" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>
            No data available
          </div>
        )}
      </Card>

      {/* Tracking Links */}
      <div style={{ marginBottom: "24px" }}>
        <TrackingLinksCard token={token} isAdmin={user.role === "admin"} />
      </div>

      {/* Instagram Analytics Section */}
      {token && (
        <InstagramAnalyticsSection token={token} dateRange={dateRange} />
      )}
    </div>
  );
}
