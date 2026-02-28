"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, CartesianGrid,
} from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";

// ── Period helpers ──

function toDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getPreviousEquivalentRange(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  const dayCount = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (dayCount - 1));
  return { start: toDateOnly(prevStart), end: toDateOnly(prevEnd) };
}

// OF API already returns net earnings (after platform fee) — no adjustment needed
const NET_MULTIPLIER = 1.0;
function toNet(gross: number): number { return gross * NET_MULTIPLIER; }

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

// ── Sparkline component (pure SVG) ──

function Sparkline({ data, color, height = 32, width = 80 }: { data: number[]; color: string; height?: number; width?: number }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const areaPoints = [...points, `${width},${height}`, `0,${height}`];
  return (
    <svg width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints.join(" ")} fill={`url(#spark-${color.replace("#", "")})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Custom chart tooltip ──

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
          <span>{p.name}: {typeof p.value === "number" ? formatCurrency(p.value) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ──

export default function AdminRevenueDashboard({ user, token, filterCreatorNames }: { user: any; token: string; filterCreatorNames?: string[] }) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(29));
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [drillDate, setDrillDate] = useState<string | null>(null);

  const effectiveDateRange = useMemo(() => {
    if (drillDate) return { start: drillDate, end: drillDate };
    return dateRange;
  }, [drillDate, dateRange]);

  const comparisonRange = useMemo(() => {
    return getPreviousEquivalentRange(effectiveDateRange.start, effectiveDateRange.end);
  }, [effectiveDateRange.start, effectiveDateRange.end]);

  // ── Queries ──
  const dashboard = useQuery(
    api.crm.analyticsV2.getDashboard,
    token && effectiveDateRange.start
      ? {
          token,
          startDate: effectiveDateRange.start,
          endDate: effectiveDateRange.end,
        }
      : "skip"
  );
  const comparisonDashboard = useQuery(
    api.crm.analyticsV2.getDashboard,
    token && comparisonRange.start
      ? {
          token,
          startDate: comparisonRange.start,
          endDate: comparisonRange.end,
        }
      : "skip"
  );
  const trend = useQuery(
    api.crm.analyticsV2.getRevenueTrend,
    token && effectiveDateRange.start
      ? {
          token,
          startDate: effectiveDateRange.start,
          endDate: effectiveDateRange.end,
        }
      : "skip"
  );
  const creatorOverviewRows = useQuery(
    api.crm.analyticsV2.getCreatorOverviewTable,
    token && effectiveDateRange.start
      ? { token, startDate: effectiveDateRange.start, endDate: effectiveDateRange.end }
      : "skip"
  );
  const syncStatus = useQuery(api.crm.analyticsV2.getSyncStatus, token ? { token } : "skip");

  // ── Filter by accountIds (for manager dashboard) ──
  const filteredCreatorRows = useMemo(() => {
    const rows = creatorOverviewRows || [];
    if (!filterCreatorNames || filterCreatorNames.length === 0) return rows;
    return rows.filter((row: any) => filterCreatorNames.includes(row.creatorName));
  }, [creatorOverviewRows, filterCreatorNames]);
  const subscriptions = useQuery(
    api.crm.analyticsV2.getTodaySubscriptions,
    token
      ? {
          token,
          startDate: effectiveDateRange.start,
          endDate: effectiveDateRange.end,
        }
      : "skip"
  );
  const comparisonSubscriptions = useQuery(
    api.crm.analyticsV2.getTodaySubscriptions,
    token
      ? {
          token,
          startDate: comparisonRange.start,
          endDate: comparisonRange.end,
        }
      : "skip"
  );

  // ── Sync (OF API) ──
  const syncNow = useAction((api as any).crm.ofIntegration.syncNow);
  const handleSync = useCallback(async () => {
    if (!token || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      await syncNow({ token, accountId: "all", endpoint: "earnings" });
      setSyncMsg({ text: "OF sync triggered for all creators", type: "success" });
    } catch (err: any) {
      setSyncMsg({ text: err.message || "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }, [token, syncing, syncNow]);

  // ── Derived ──
  const syncStatusText = useMemo(() => {
    if (!syncStatus?.lastSyncAt) return "Never synced";
    const mins = Math.floor((Date.now() - syncStatus.lastSyncAt) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }, [syncStatus]);

  // When filtering by accountIds, derive aggregates from filtered creator rows
  const totalTypeRevenue = useMemo(() => {
    if (filterCreatorNames && filterCreatorNames.length > 0) {
      return filteredCreatorRows.reduce((sum: number, r: any) => sum + (r.subscriptionRevenue || 0) + (r.ppvRevenue || 0) + (r.tipsRevenue || 0), 0);
    }
    return dashboard ? toNet(dashboard.subscriptionRevenue + dashboard.messageRevenue + dashboard.tipRevenue) : 0;
  }, [filterCreatorNames, filteredCreatorRows, dashboard]);

  const currentRevenue = useMemo(() => {
    if (filterCreatorNames && filterCreatorNames.length > 0) {
      return filteredCreatorRows.reduce((sum: number, r: any) => sum + (r.totalRevenue || 0), 0);
    }
    return dashboard ? toNet(dashboard.netRevenue) : 0;
  }, [filterCreatorNames, filteredCreatorRows, dashboard]);

  const previousRevenue = useMemo(() => {
    if (filterCreatorNames && filterCreatorNames.length > 0) {
      return filteredCreatorRows.reduce((sum: number, r: any) => sum + (r.previousTotalRevenue || 0), 0);
    }
    return comparisonDashboard ? toNet(comparisonDashboard.netRevenue) : 0;
  }, [filterCreatorNames, filteredCreatorRows, comparisonDashboard]);
  const revenueChangePct = previousRevenue > 0
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
    : null;

  const donutData = useMemo(() => {
    if (filterCreatorNames && filterCreatorNames.length > 0 && totalTypeRevenue > 0) {
      const subs = filteredCreatorRows.reduce((s: number, r: any) => s + (r.subscriptionRevenue || 0), 0);
      const ppv = filteredCreatorRows.reduce((s: number, r: any) => s + (r.ppvRevenue || 0), 0);
      const tips = filteredCreatorRows.reduce((s: number, r: any) => s + (r.tipsRevenue || 0), 0);
      return [
        { name: "Subscriptions", value: subs, color: "#3b82f6" },
        { name: "Messages (PPV)", value: ppv, color: "#f59e0b" },
        { name: "Tips", value: tips, color: "#22c55e" },
      ];
    }
    if (!dashboard || totalTypeRevenue <= 0) return [];
    return [
      { name: "Subscriptions", value: toNet(dashboard.subscriptionRevenue), color: "#3b82f6" },
      { name: "Messages (PPV)", value: toNet(dashboard.messageRevenue), color: "#f59e0b" },
      { name: "Tips", value: toNet(dashboard.tipRevenue), color: "#22c55e" },
    ];
  }, [filterCreatorNames, filteredCreatorRows, totalTypeRevenue, dashboard]);

  const trendData = useMemo(() => {
    if (!trend) return [];
    return trend.map((d) => ({
      date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      rawDate: d.date,
      revenue: toNet(d.netRevenue),
      subscriptions: toNet(d.subscriptionRevenue),
      messages: toNet(d.messageRevenue),
      tips: toNet(d.tipRevenue),
    }));
  }, [trend]);

  const handleChartClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.rawDate) {
      setDrillDate(data.activePayload[0].payload.rawDate);
    }
  }, []);

  const subscriptionCards = useMemo(() => {
    const current = subscriptions || {
      newSubs: { count: 0, revenue: 0 },
      rebills: { count: 0, revenue: 0 },
      total: { count: 0, revenue: 0 },
    };
    const previous = comparisonSubscriptions || {
      newSubs: { count: 0, revenue: 0 },
      rebills: { count: 0, revenue: 0 },
      total: { count: 0, revenue: 0 },
    };

    return [
      { key: "new", label: "New Subscriptions", current: current.newSubs, previous: previous.newSubs, color: "#3b82f6" },
      { key: "rebill", label: "Rebills", current: current.rebills, previous: previous.rebills, color: "#22c55e" },
      { key: "total", label: "Total Subscriptions", current: current.total, previous: previous.total, color: "#f1ae38" },
    ];
  }, [subscriptions, comparisonSubscriptions]);

  // Sparkline data from trend
  const revenueSparkline = trend?.map((d) => toNet(d.netRevenue)) || [];
  const subsSparkline = trend?.map((d) => toNet(d.subscriptionRevenue)) || [];
  const txnSparkline = trend?.map((d) => d.transactionCount) || [];

  // Card style
  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "#1e1e1e",
    borderRadius: "16px",
    padding: "24px",
    border: "1px solid #2a2a2a",
    ...extra,
  });

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* ─── Header ─── */}
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "flex-start",
        marginBottom: "28px", flexWrap: "wrap", gap: "16px",
      }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#fff", margin: 0 }}>
            {getGreeting()}, {filterCreatorNames ? user.name || "Manager" : "Preach Agency"}! {filterCreatorNames ? "📊" : "👑"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <div style={{
              width: "8px", height: "8px", borderRadius: "50%",
              background: syncStatus?.creatorsWithErrors ? "#ef4444" : "#22c55e",
            }} />
            <span style={{ fontSize: "13px", color: "#a0a0a0" }}>
              Last synced: {syncStatusText}
              {syncStatus ? ` · ${syncStatus.totalTransactionsSynced.toLocaleString()} transactions` : ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {/* Date Range Picker */}
          <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setDrillDate(null); }} />

          {/* Sync Button (admin only) */}
          {user.role === "admin" && <button
            onClick={handleSync}
            disabled={syncing}
            style={{
              padding: "10px 18px", fontSize: "13px", fontWeight: "600",
              color: "#1a1a1a", background: syncing ? "#666" : "#f1ae38",
              border: "none", borderRadius: "10px",
              cursor: syncing ? "not-allowed" : "pointer", transition: "all 0.2s",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {syncing ? "⏳ Syncing..." : "🔄 Sync"}
          </button>}
        </div>
      </div>

      {/* Sync feedback */}
      {syncMsg && (
        <div style={{
          padding: "12px 18px", borderRadius: "10px", marginBottom: "16px",
          fontSize: "13px", fontWeight: "600",
          background: syncMsg.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
          color: syncMsg.type === "success" ? "#22c55e" : "#ef4444",
          border: `1px solid ${syncMsg.type === "success" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
        }}>
          {syncMsg.type === "success" ? "✅" : "❌"} {syncMsg.text}
        </div>
      )}

      {/* Sync errors */}
      {syncStatus?.perCreator?.some((c) => c.status === "error") && (
        <div style={{
          padding: "12px 18px", borderRadius: "10px", marginBottom: "16px",
          fontSize: "12px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)",
        }}>
          <div style={{ fontWeight: "600", color: "#ef4444", marginBottom: "4px" }}>⚠️ Sync Errors</div>
          {syncStatus.perCreator.filter((c) => c.status === "error").map((c) => (
            <div key={c.creatorName} style={{ color: "#ef4444", marginTop: "2px" }}>
              {c.creatorName}: {c.error || "Unknown error"}
            </div>
          ))}
        </div>
      )}

      {/* Drill-down banner */}
      {drillDate && (
        <div style={{
          padding: "12px 18px", borderRadius: "10px", marginBottom: "16px",
          fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(241,174,56,0.12)", color: "#f1ae38",
          border: "1px solid rgba(241,174,56,0.3)",
        }}>
          <span>📅 Drill-down: {new Date(drillDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
          <button
            onClick={() => setDrillDate(null)}
            style={{
              padding: "6px 14px", fontSize: "12px", fontWeight: "600",
              background: "#f1ae38", color: "#1a1a1a", border: "none",
              borderRadius: "6px", cursor: "pointer",
            }}
          >
            ✕ Back to range
          </button>
        </div>
      )}

      {/* ─── Top Row: Turnover + Stats + Donut ─── */}
      <div className="admin-rev-top-row" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "16px",
        marginBottom: "16px",
      }}>
        {/* Total Turnover */}
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
            Total Turnover
          </div>
          <div style={{ fontSize: "36px", fontWeight: "700", color: "#f1ae38", marginBottom: "8px" }}>
            {dashboard ? formatCurrency(currentRevenue) : "—"}
          </div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", marginBottom: "12px", display: "grid", gap: "4px" }}>
            <div>
              Previous period: <span style={{ color: "#fff", fontWeight: 600 }}>{comparisonDashboard ? formatCurrency(previousRevenue) : "—"}</span>
            </div>
            <div>
              Change:{" "}
              <span style={{ color: revenueChangePct === null ? "#a0a0a0" : revenueChangePct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                {revenueChangePct === null ? "—" : `${revenueChangePct >= 0 ? "↑" : "↓"} ${Math.abs(revenueChangePct).toFixed(1)}%`}
              </span>
            </div>
            {dashboard && <div>Net revenue · {dashboard.totalTransactions} txns</div>}
          </div>
          <Sparkline data={revenueSparkline} color="#f1ae38" width={200} height={40} />
        </div>

        {/* Stats: New Subs + Purchases */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={card({ flex: 1 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Subscriptions
                </div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#3b82f6" }}>
                  {dashboard ? formatCurrency(toNet(dashboard.subscriptionRevenue)) : "—"}
                </div>
              </div>
              <Sparkline data={subsSparkline} color="#3b82f6" width={60} height={28} />
            </div>
          </div>
          <div style={card({ flex: 1 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                  Total Transactions
                </div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#22c55e" }}>
                  {dashboard ? dashboard.totalTransactions.toLocaleString() : "—"}
                </div>
              </div>
              <Sparkline data={txnSparkline} color="#22c55e" width={60} height={28} />
            </div>
          </div>
        </div>

        {/* Revenue Breakdown Donut */}
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Revenue Breakdown
          </div>
          {donutData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "120px", height: "120px", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={35}
                      outerRadius={55}
                      dataKey="value"
                      stroke="none"
                    >
                      {donutData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                {donutData.map((d) => (
                  <div key={d.name} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "8px 12px", background: "#2a2a2a", borderRadius: "8px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "3px", background: d.color }} />
                      <span style={{ fontSize: "12px", color: "#fff" }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: d.color }}>
                      {formatCurrency(d.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "30px 0" }}>
              No revenue data for this period
            </div>
          )}
        </div>
      </div>

      {/* ─── Subscriptions ─── */}
      <div className="admin-rev-subs-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "16px" }}>
        {subscriptionCards.map((s) => {
          const currentCount = s.current?.count ?? 0;
          const currentRevenue = toNet(s.current?.revenue ?? 0);
          const previousCount = s.previous?.count ?? 0;
          const previousRevenue = toNet(s.previous?.revenue ?? 0);
          const changePct = previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : null;

          return (
            <div key={s.key} style={card()}>
              <div style={{ fontSize: "11px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
                {s.label}
              </div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: s.color, marginBottom: "6px" }}>
                {currentCount.toLocaleString()}
              </div>
              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "600", marginBottom: "10px" }}>
                {formatCurrency(currentRevenue)}
              </div>
              <div style={{ fontSize: "12px", color: "#a0a0a0", display: "grid", gap: "4px" }}>
                <div>
                  Previous period: <span style={{ color: "#fff", fontWeight: 600 }}>{formatCurrency(previousRevenue)}</span>
                  <span style={{ marginLeft: "6px", color: "#777" }}>({previousCount.toLocaleString()})</span>
                </div>
                <div>
                  Change:{" "}
                  <span style={{ color: changePct === null ? "#a0a0a0" : changePct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                    {changePct === null ? "—" : `${changePct >= 0 ? "↑" : "↓"} ${Math.abs(changePct).toFixed(1)}%`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Bottom Row: Charts ─── */}
      <div className="admin-rev-bottom-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        {/* Revenue over time */}
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Revenue Over Time
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} onClick={handleChartClick} style={{ cursor: "pointer" }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f1ae38" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f1ae38" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#f1ae38", strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="revenue" stroke="#f1ae38" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>No data</div>
          )}
        </div>

        {/* Revenue by type over time */}
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            Revenue Breakdown Over Time
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="subscriptions" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} name="Subscriptions" />
                <Area type="monotone" dataKey="messages" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.3} strokeWidth={2} name="Messages" />
                <Area type="monotone" dataKey="tips" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.3} strokeWidth={2} name="Tips" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>No data</div>
          )}
        </div>
      </div>

      {/* ─── Creator Overview Table ─── */}
      <div style={{ ...card(), marginBottom: "24px", overflowX: "auto" }}>
        <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          Creator Overview
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {['Creator', 'Total Revenue', 'New Fans', 'Sales Revenue', 'Subscription Revenue', 'Avg Fan Spend'].map((h) => (
                <th key={h} style={{ padding: "12px 10px", fontSize: "12px", color: "#a0a0a0", fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(filteredCreatorRows).map((row: any) => (
              <tr key={row.creatorId} style={{ borderBottom: "1px solid #242424" }}>
                <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {row.avatarUrl ? (
                      <img src={row.avatarUrl} alt={row.creatorName} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2a2a2a", display: "grid", placeItems: "center", fontSize: 11 }}>👤</div>
                    )}
                    <span>{row.creatorName}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>
                  <div style={{ fontWeight: 600 }}>{formatCurrency(row.totalRevenue || 0)}</div>
                  <div style={{ fontSize: "12px", color: row.totalRevenueChange >= 0 ? "#22c55e" : "#ef4444" }}>
                    {row.totalRevenueChange >= 0 ? '↑' : '↓'} {formatCurrency(Math.abs(row.totalRevenueChange || 0))}
                    {typeof row.totalRevenueChangePct === 'number' ? ` (${row.totalRevenueChangePct >= 0 ? '+' : ''}${row.totalRevenueChangePct.toFixed(1)}%)` : ''}
                  </div>
                </td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>
                  <div style={{ fontWeight: 600 }}>{(row.newFans || 0).toLocaleString()}</div>
                  <div style={{ fontSize: "12px", color: row.newFansChange >= 0 ? "#22c55e" : "#ef4444" }}>
                    {row.newFansChange >= 0 ? '↑' : '↓'} {Math.abs(row.newFansChange || 0).toLocaleString()}
                    {typeof row.newFansChangePct === 'number' ? ` (${row.newFansChangePct >= 0 ? '+' : ''}${row.newFansChangePct.toFixed(1)}%)` : ''}
                  </div>
                </td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.salesRevenue || 0)}</td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.subscriptionRevenue || 0)}</td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.avgFanSpend || 0)}</td>
              </tr>
            ))}
            {(() => {
              const rows = filteredCreatorRows;
              const total = rows.reduce((acc: any, row: any) => ({
                totalRevenue: acc.totalRevenue + (row.totalRevenue || 0),
                salesRevenue: acc.salesRevenue + (row.salesRevenue || 0),
                subscriptionRevenue: acc.subscriptionRevenue + (row.subscriptionRevenue || 0),
                newFans: acc.newFans + (row.newFans || 0),
              }), { totalRevenue: 0, salesRevenue: 0, subscriptionRevenue: 0, newFans: 0 });
              return (<>
                <tr style={{ borderTop: "2px solid #333" }}>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>Total</td>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>{formatCurrency(total.totalRevenue)}</td>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>{total.newFans.toLocaleString()}</td>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>{formatCurrency(total.salesRevenue)}</td>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>{formatCurrency(total.subscriptionRevenue)}</td>
                  <td style={{ padding: "12px 10px", color: "#f1ae38", fontWeight: 700 }}>{formatCurrency(total.newFans > 0 ? total.salesRevenue / total.newFans : 0)}</td>
                </tr>
              </>);
            })()}
          </tbody>
        </table>
      </div>

      {/* ─── Responsive styles via media query workaround ─── */}
      <style>{`
        @media (max-width: 900px) {
          .admin-rev-top-row { grid-template-columns: 1fr !important; }
          .admin-rev-subs-row { grid-template-columns: 1fr !important; }
          .admin-rev-bottom-row { grid-template-columns: 1fr !important; }
          .admin-rev-stats-row { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 600px) {
          .admin-rev-stats-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
