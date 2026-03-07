"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";
import { supabase } from "@/lib/supabase";

const CREATOR_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
];

type TrackingSort = "clicks" | "subscribers";

type DailyStatRow = {
  tracking_link_id: string;
  date: string;
  clicks: number;
  subs: number;
  revenue: number;
  spenders: number;
};

function toDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

function formatMoney(value: number | null | undefined) {
  const safe = Number(value ?? 0);
  return safe.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getArpsColor(value: number | null | undefined) {
  const v = Number(value ?? 0);
  if (v > 15) return { color: "#22c55e", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.35)" };
  if (v >= 8) return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)" };
  return { color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)" };
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
          <span>{p.name}: {Number(p.value || 0).toLocaleString()}</span>
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

export default function ManagerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(29));
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [totals, setTotals] = useState({ newSubsInRange: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<any[]>([]);
  const [trackingDailyStats, setTrackingDailyStats] = useState<Record<string, DailyStatRow[]>>({});
  const [activeOfTab, setActiveOfTab] = useState<"tracking_links">("tracking_links");
  const [showAllTrackingLinks, setShowAllTrackingLinks] = useState(false);
  const [trackingSort, setTrackingSort] = useState<TrackingSort>("subscribers");
  const [expandedTrackingLinks, setExpandedTrackingLinks] = useState<Record<string, boolean>>({});
  const [syncingStats, setSyncingStats] = useState(false);
  const [syncStatsStatus, setSyncStatsStatus] = useState<string>("");

  useEffect(() => {
    const u = localStorage.getItem("crm_user");
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

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);

      const [{ data: creators }, { data: ofAccounts }] = await Promise.all([
        supabase.from("crm_creators").select("id,name").eq("status", "active"),
        supabase.from("crm_of_accounts").select("account_id,creator_id"),
      ]);

      const creatorNameById = new Map<string, string>((creators ?? []).map((c: any) => [c.id, c.name]));
      const accountToCreator = new Map<string, string>();
      for (const row of ofAccounts ?? []) {
        const name = creatorNameById.get((row as any).creator_id) || "Unknown";
        accountToCreator.set((row as any).account_id, name);
      }

      const subsTx: any[] = [];
      {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from("crm_of_transactions")
            .select("account_id,type,timestamp")
            .eq("type", "new_sub")
            .gte("timestamp", `${dateRange.start}T00:00:00`)
            .lte("timestamp", `${dateRange.end}T23:59:59`)
            .range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          subsTx.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }

      const accMap = new Map<string, { accountId: string; creatorName: string; newSubsInRange: number }>();
      for (const row of ofAccounts ?? []) {
        const accountId = (row as any).account_id;
        const creatorName = accountToCreator.get(accountId) || accountId;
        accMap.set(accountId, { accountId, creatorName, newSubsInRange: 0 });
      }
      for (const tx of subsTx ?? []) {
        const accountId = (tx as any).account_id;
        const creatorName = accountToCreator.get(accountId) || accountId;
        if (!accMap.has(accountId)) accMap.set(accountId, { accountId, creatorName, newSubsInRange: 0 });
        accMap.get(accountId)!.newSubsInRange += 1;
      }
      const accountsRows = Array.from(accMap.values()).sort((a, b) => b.newSubsInRange - a.newSubsInRange);

      const days = trendPeriod === "7d" ? 7 : trendPeriod === "30d" ? 30 : 90;
      const startTrend = new Date();
      startTrend.setDate(startTrend.getDate() - (days - 1));
      const trendStart = toDateOnly(startTrend);

      const trendTx: any[] = [];
      {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from("crm_of_transactions")
            .select("timestamp,type")
            .eq("type", "new_sub")
            .gte("timestamp", `${trendStart}T00:00:00`)
            .lte("timestamp", `${toDateOnly(new Date())}T23:59:59`)
            .range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          trendTx.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
      }

      const trendMap = new Map<string, number>();
      for (const tx of trendTx ?? []) {
        const d = new Date((tx as any).timestamp).toISOString().split("T")[0];
        trendMap.set(d, (trendMap.get(d) || 0) + 1);
      }
      const trendRows: any[] = [];
      for (let i = 0; i < days; i++) {
        const d = new Date(startTrend);
        d.setDate(startTrend.getDate() + i);
        const key = toDateOnly(d);
        trendRows.push({
          date: new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          "New Subs": trendMap.get(key) || 0,
        });
      }

      const { data: links } = await supabase
        .from("crm_of_tracking_links")
        .select("id,link_id,name,url,clicks,subscribers,conversion_rate,revenue,spenders,arps_7d,arps_30d,arps_all_time,last_synced_at,creator_id")
        .order("subscribers", { ascending: false, nullsFirst: false });

      const u = localStorage.getItem("crm_user");
      const currentUserRole = u ? JSON.parse(u)?.role : null;
      const currentUserId = u ? JSON.parse(u)?.id : null;
      let filteredLinks = links ?? [];
      if (currentUserRole !== "admin" && currentUserId) {
        const { data: assignments } = await supabase
          .from("crm_tracking_link_assignments")
          .select("tracking_link_id")
          .eq("user_id", currentUserId);
        const assignedIds = new Set((assignments ?? []).map((a: any) => a.tracking_link_id));
        filteredLinks = (links ?? []).filter((l: any) => assignedIds.has(l.id));
      }

      const linksRows = filteredLinks.map((l: any) => ({
        ...l,
        creatorName: creatorNameById.get(l.creator_id) || "Unknown",
      }));

      const linkIds = linksRows.map((l: any) => l.id).filter(Boolean);
      const statsByLink: Record<string, DailyStatRow[]> = {};
      if (linkIds.length > 0) {
        const statsStart = new Date();
        statsStart.setDate(statsStart.getDate() - 13);
        const statsStartDate = toDateOnly(statsStart);

        const { data: dailyStats } = await supabase
          .from("crm_of_tracking_link_daily_stats")
          .select("tracking_link_id,date,clicks,subs,revenue,spenders")
          .in("tracking_link_id", linkIds)
          .gte("date", statsStartDate)
          .order("date", { ascending: false });

        for (const row of dailyStats ?? []) {
          const key = (row as any).tracking_link_id;
          if (!key) continue;
          if (!statsByLink[key]) statsByLink[key] = [];
          statsByLink[key].push({
            tracking_link_id: key,
            date: (row as any).date,
            clicks: Number((row as any).clicks || 0),
            subs: Number((row as any).subs || 0),
            revenue: Number((row as any).revenue || 0),
            spenders: Number((row as any).spenders || 0),
          });
        }
      }

      if (!cancelled) {
        setAccounts(accountsRows);
        setTotals({ newSubsInRange: accountsRows.reduce((s, a) => s + a.newSubsInRange, 0) });
        setChartData(trendRows);
        setTrackingLinks(linksRows);
        setTrackingDailyStats(statsByLink);
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [dateRange.start, dateRange.end, trendPeriod, reloadKey]);

  const sortedTrackingLinks = useMemo(() => {
    const rows = [...trackingLinks];
    const getValue = (row: any) => {
      if (trackingSort === "clicks") return Number(row.clicks || 0);
      return Number(row.subscribers || 0);
    };
    rows.sort((a, b) => getValue(b) - getValue(a));
    return rows;
  }, [trackingLinks, trackingSort]);

  const visibleTrackingLinks = useMemo(
    () => sortedTrackingLinks.slice(0, showAllTrackingLinks ? sortedTrackingLinks.length : 10),
    [sortedTrackingLinks, showAllTrackingLinks],
  );

  const rangeLabelText = `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  async function runSyncStats() {
    if (user?.role !== "admin") return;
    setSyncingStats(true);
    setSyncStatsStatus("");
    try {
      const { error } = await supabase.functions.invoke("of-sync", {
        body: { job: "tracking_link_stats" },
      });
      if (error) throw error;
      setSyncStatsStatus("Tracking link stats sync triggered.");
      setReloadKey((v) => v + 1);
    } catch (e: any) {
      setSyncStatsStatus(e?.message || "Failed to trigger tracking stats sync.");
    } finally {
      setSyncingStats(false);
    }
  }

  function toggleExpanded(id: string) {
    setExpandedTrackingLinks((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "var(--text)" }}>
        🔒 This dashboard is for marketing managers only.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "28px", flexWrap: "wrap", gap: "16px",
      }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#fff", margin: 0 }}>
            {getGreeting()}, {user.name || "Manager"}! 📊
          </h1>
          <p style={{ fontSize: "14px", color: "#a0a0a0", marginTop: "6px", margin: 0 }}>
            Acquisition metrics from Supabase
          </p>
        </div>
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

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
            {loading ? (
              <tr><td colSpan={2} style={{ padding: "24px", textAlign: "center", color: "#666" }}>Loading…</td></tr>
            ) : accounts.length === 0 ? (
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
          </tbody>
        </table>
      </Card>

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

      <Card style={{ marginBottom: "24px", overflowX: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={() => setActiveOfTab("tracking_links")}
              style={{
                border: "1px solid #253545",
                borderRadius: "8px",
                padding: "6px 12px",
                fontSize: "12px",
                cursor: "pointer",
                background: activeOfTab === "tracking_links" ? "#253545" : "transparent",
                color: activeOfTab === "tracking_links" ? "#fff" : "#a0a0a0",
                fontWeight: 600,
              }}
            >
              🔗 Tracking Links
            </button>
            <select
              value={trackingSort}
              onChange={(e) => {
                setTrackingSort(e.target.value as TrackingSort);
                setShowAllTrackingLinks(false);
              }}
              style={{
                background: "#141414",
                color: "#fff",
                border: "1px solid #2f2f2f",
                borderRadius: 8,
                padding: "7px 10px",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <option value="subscribers">Sort: Subs</option>
              <option value="clicks">Sort: Clicks</option>
            </select>
          </div>
        </div>

        {false && syncStatsStatus && (
          <div style={{ marginBottom: 10, fontSize: 12, color: syncStatsStatus.toLowerCase().includes("failed") ? "#ef4444" : "#22c55e" }}>
            {syncStatsStatus}
          </div>
        )}

        {activeOfTab === "tracking_links" && (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
                  {["", "Name", "Creator", "Clicks", "Subscribers", "Conv %", "Daily Avg Subs"].map((h) => (
                    <th key={h || "expand"} style={{ padding: "10px", fontSize: "12px", color: "#a0a0a0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTrackingLinks.map((l: any) => {
                  const detailsOpen = Boolean(expandedTrackingLinks[l.id]);
                  const dailyRows = trackingDailyStats[l.id] || [];
                  const avgDailySubs = dailyRows.length > 0
                    ? (dailyRows.reduce((s: number, d: any) => s + d.subs, 0) / dailyRows.length).toFixed(1)
                    : "—";

                  return (
                    <Fragment key={l.id}>
                      <tr style={{ borderBottom: detailsOpen ? "none" : "1px solid #242424" }}>
                        <td style={{ padding: "10px", color: "#fff", width: 36 }}>
                          <button
                            onClick={() => toggleExpanded(l.id)}
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              border: "1px solid #2f2f2f",
                              background: "#171717",
                              color: "#cbd5e1",
                              cursor: "pointer",
                              fontSize: 12,
                              lineHeight: "22px",
                            }}
                            title={detailsOpen ? "Hide daily stats" : "Show last 14 days"}
                          >
                            {detailsOpen ? "−" : "+"}
                          </button>
                        </td>
                        <td style={{ padding: "10px", color: "#fff" }}>{l.name}</td>
                        <td style={{ padding: "10px", color: "#a0a0a0" }}>{l.creatorName}</td>
                        <td style={{ padding: "10px", color: "#fff" }}>{Number(l.clicks || 0).toLocaleString()}</td>
                        <td style={{ padding: "10px", color: "#fff", fontWeight: 700 }}>{Number(l.subscribers || 0).toLocaleString()}</td>
                        <td style={{ padding: "10px", color: "#22c55e" }}>{(Number(l.conversion_rate || 0) * 100).toFixed(1)}%</td>
                        <td style={{ padding: "10px", color: "#f59e0b", fontWeight: 600 }}>{avgDailySubs}</td>
                      </tr>

                      {detailsOpen && (
                        <tr style={{ borderBottom: "1px solid #242424", background: "#141414" }}>
                          <td colSpan={7} style={{ padding: "12px 14px 14px" }}>
                            <div style={{ color: "#a0a0a0", fontSize: 12, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.4px" }}>
                              Last 14 Days
                            </div>
                            {dailyRows.length === 0 ? (
                              <div style={{ fontSize: 12, color: "#666" }}>No daily stats synced yet.</div>
                            ) : (
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                <thead>
                                  <tr style={{ borderBottom: "1px solid #2b2b2b", textAlign: "left" }}>
                                    <th style={{ padding: "6px 8px", color: "#8a8a8a", fontWeight: 600 }}>Date</th>
                                    <th style={{ padding: "6px 8px", color: "#8a8a8a", fontWeight: 600 }}>Clicks</th>
                                    <th style={{ padding: "6px 8px", color: "#8a8a8a", fontWeight: 600 }}>Subs</th>
                                    <th style={{ padding: "6px 8px", color: "#8a8a8a", fontWeight: 600 }}>Conv %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dailyRows.map((d) => (
                                    <tr key={`${l.id}-${d.date}`} style={{ borderBottom: "1px solid #1f1f1f" }}>
                                      <td style={{ padding: "6px 8px", color: "#d4d4d4" }}>{new Date(`${d.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                                      <td style={{ padding: "6px 8px", color: "#fff" }}>{d.clicks.toLocaleString()}</td>
                                      <td style={{ padding: "6px 8px", color: "#fff", fontWeight: 700 }}>{d.subs.toLocaleString()}</td>
                                      <td style={{ padding: "6px 8px", color: "#22c55e" }}>{d.clicks > 0 ? ((d.subs / d.clicks) * 100).toFixed(1) + "%" : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            {!showAllTrackingLinks && sortedTrackingLinks.length > 10 && (
              <button
                onClick={() => setShowAllTrackingLinks(true)}
                style={{ display: "block", margin: "12px auto 0", padding: "8px 20px", borderRadius: 8, border: "1px solid var(--border, #333)", background: "transparent", color: "#a0a0a0", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                Show More ({sortedTrackingLinks.length - 10} more)
              </button>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
