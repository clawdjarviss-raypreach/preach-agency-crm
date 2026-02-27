"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, CartesianGrid,
} from "recharts";

// ── Period helpers ──

function toDateOnly(d: Date) {
  return d.toISOString().split("T")[0];
}

function addDays(dateString: string, days: number) {
  const d = new Date(`${dateString}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

function getToday() {
  const d = toDateOnly(new Date());
  return { start: d, end: d };
}

function getYesterday() {
  const d = addDays(getToday().start, -1);
  return { start: d, end: d };
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getPreviousMonthRange() {
  const now = new Date();
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  return { start: toDateOnly(prevMonthStart), end: toDateOnly(prevMonthEnd) };
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

const PERIODS = [
  { key: "today", label: "Today", ...getToday() },
  { key: "yesterday", label: "Yesterday", ...getYesterday() },
  { key: "7d", label: "7 Days", ...getDaysAgoRange(7) },
  { key: "30d", label: "30 Days", ...getDaysAgoRange(30) },
  { key: "month", label: "Month", ...getMonthRange() },
] as const;

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

export default function AdminRevenueDashboard({ user, token }: { user: any; token: string }) {
  const [periodKey, setPeriodKey] = useState("30d");
  const [creatorFilter, setCreatorFilter] = useState("all");
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [customStart, setCustomStart] = useState(() => getDaysAgoRange(30).start);
  const [customEnd, setCustomEnd] = useState(() => getDaysAgoRange(30).end);
  const [drillDate, setDrillDate] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    if (drillDate) return { start: drillDate, end: drillDate };
    if (periodKey === "custom") return { start: customStart, end: customEnd };
    const p = PERIODS.find((o) => o.key === periodKey);
    return p ? { start: p.start, end: p.end } : PERIODS[3]; // default 30d
  }, [periodKey, customStart, customEnd, drillDate]);

  const comparisonRange = useMemo(() => {
    if (periodKey === "month" && !drillDate) return getPreviousMonthRange();
    return getPreviousEquivalentRange(dateRange.start, dateRange.end);
  }, [periodKey, drillDate, dateRange.start, dateRange.end]);

  // ── Queries ──
  const creators = useQuery(api.crm.creators.list, token ? { token } : "skip");
  const selectedAccountId = useMemo(() => {
    if (creatorFilter === "all") return undefined;
    const selectedCreator = creators?.find((c: any) => c.id === creatorFilter);
    return selectedCreator?.accountId;
  }, [creatorFilter, creators]);
  const dashboard = useQuery(
    api.crm.analyticsV2.getDashboard,
    token && dateRange.start
      ? {
          token,
          startDate: dateRange.start,
          endDate: dateRange.end,
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
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
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        }
      : "skip"
  );
  const trend = useQuery(
    api.crm.analyticsV2.getRevenueTrend,
    token && dateRange.start
      ? {
          token,
          startDate: dateRange.start,
          endDate: dateRange.end,
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
        }
      : "skip"
  );
  const syncStatus = useQuery(api.crm.analyticsV2.getSyncStatus, token ? { token } : "skip");
  const subscriptions = useQuery(
    api.crm.analyticsV2.getTodaySubscriptions,
    token
      ? {
          token,
          startDate: dateRange.start,
          endDate: dateRange.end,
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
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
          ...(selectedAccountId ? { accountId: selectedAccountId } : {}),
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
      const accountId = selectedAccountId || "all";
      await syncNow({ token, accountId, endpoint: "earnings" });
      setSyncMsg({ text: accountId === "all" ? "OF sync triggered for all creators" : "OF sync triggered successfully", type: "success" });
    } catch (err: any) {
      setSyncMsg({ text: err.message || "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }, [token, syncing, syncNow, selectedAccountId]);

  // ── Derived ──
  const syncStatusText = useMemo(() => {
    if (!syncStatus?.lastSyncAt) return "Never synced";
    const mins = Math.floor((Date.now() - syncStatus.lastSyncAt) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }, [syncStatus]);

  const totalTypeRevenue = dashboard
    ? toNet(dashboard.subscriptionRevenue + dashboard.messageRevenue + dashboard.tipRevenue)
    : 0;

  const currentRevenue = dashboard ? toNet(dashboard.netRevenue) : 0;
  const previousRevenue = comparisonDashboard ? toNet(comparisonDashboard.netRevenue) : 0;
  const revenueChangePct = previousRevenue > 0
    ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
    : null;

  const donutData = dashboard && totalTypeRevenue > 0
    ? [
        { name: "Subscriptions", value: toNet(dashboard.subscriptionRevenue), color: "#3b82f6" },
        { name: "Messages (PPV)", value: toNet(dashboard.messageRevenue), color: "#f59e0b" },
        { name: "Tips", value: toNet(dashboard.tipRevenue), color: "#22c55e" },
      ]
    : [];

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
            {getGreeting()}, Preach Agency! 👑
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
          {/* Creator Filter */}
          <select
            value={creatorFilter}
            onChange={(e) => setCreatorFilter(e.target.value)}
            style={{
              padding: "10px 16px", fontSize: "13px", fontWeight: "600",
              background: "#1e1e1e", color: "#fff", border: "1px solid #333",
              borderRadius: "10px", outline: "none", cursor: "pointer",
              appearance: "none", minWidth: "140px",
            }}
          >
            <option value="all">All Creators</option>
            {creators?.filter((c: any) => c.accountId).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Period Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <div style={{ display: "flex", background: "#1e1e1e", borderRadius: "10px", border: "1px solid #333", overflow: "hidden" }}>
              {PERIODS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => { setPeriodKey(p.key); setDrillDate(null); }}
                  style={{
                    padding: "10px 16px", fontSize: "13px", fontWeight: "600",
                    color: periodKey === p.key && !drillDate ? "#1a1a1a" : "#a0a0a0",
                    background: periodKey === p.key && !drillDate ? "#f1ae38" : "transparent",
                    border: "none", cursor: "pointer", transition: "all 0.2s",
                  }}
                >
                  {p.label}
                </button>
              ))}
              <button
                onClick={() => { setPeriodKey("custom"); setDrillDate(null); }}
                style={{
                  padding: "10px 16px", fontSize: "13px", fontWeight: "600",
                  color: periodKey === "custom" && !drillDate ? "#1a1a1a" : "#a0a0a0",
                  background: periodKey === "custom" && !drillDate ? "#f1ae38" : "transparent",
                  border: "none", cursor: "pointer", transition: "all 0.2s",
                }}
              >
                Custom
              </button>
            </div>
            {periodKey === "custom" && !drillDate && (
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  style={{
                    padding: "8px 12px", fontSize: "13px", fontWeight: "500",
                    background: "#1e1e1e", color: "#fff", border: "1px solid #333",
                    borderRadius: "8px", outline: "none", colorScheme: "dark",
                  }}
                />
                <span style={{ color: "#666", fontSize: "13px" }}>→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  style={{
                    padding: "8px 12px", fontSize: "13px", fontWeight: "500",
                    background: "#1e1e1e", color: "#fff", border: "1px solid #333",
                    borderRadius: "8px", outline: "none", colorScheme: "dark",
                  }}
                />
              </div>
            )}
          </div>

          {/* Sync Button */}
          <button
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
          </button>
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
            ✕ Back to {PERIODS.find((p) => p.key === periodKey)?.label || "Custom"}
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

      {/* ─── Quick Stats Row ─── */}
      <div className="admin-rev-stats-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
        {[
          { label: "Unique Spenders", value: dashboard?.uniqueSpenders?.toLocaleString() || "—", color: "#8b5cf6" },
          { label: "Avg Per Customer", value: dashboard?.avgPerCustomer ? formatCurrency(toNet(dashboard.avgPerCustomer)) : "—", color: "#f1ae38" },
          { label: "Recurring %", value: dashboard?.recurringRevenuePct ? `${dashboard.recurringRevenuePct.toFixed(1)}%` : "—", color: "#3b82f6" },
          { label: "Chargebacks", value: dashboard?.chargebackAmount ? `-${formatCurrency(toNet(dashboard.chargebackAmount))}` : "$0", color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={card()}>
            <div style={{ fontSize: "11px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "22px", fontWeight: "700", color: s.color }}>{s.value}</div>
          </div>
        ))}
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
