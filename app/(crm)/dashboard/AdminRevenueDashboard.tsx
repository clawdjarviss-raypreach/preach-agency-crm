"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Area, AreaChart, CartesianGrid,
} from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";
import { supabase } from "@/lib/supabase";

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

function formatCurrency(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeRevenueTxType(type: unknown): "subscription" | "message" | "tip" | "stream" | "other" {
  const raw = String(type ?? "").trim().toLowerCase();
  if (!raw) return "other";
  if (raw.includes("tip")) return "tip";
  if (
    raw.includes("stream") ||
    raw.includes("live")
  ) return "stream";
  if (
    raw === "new_sub" ||
    raw === "new_subscription" ||
    raw === "subscription" ||
    raw === "subscribes" ||
    raw === "subscribe" ||
    raw === "rebill" ||
    raw.includes("renewal") ||
    raw.includes("recurring")
  ) return "subscription";
  if (
    raw === "message" ||
    raw === "messages" ||
    raw === "chat_messages" ||
    raw === "ppv" ||
    raw === "post" ||
    raw.includes("ppv")
  ) return "message";
  return "other";
}

function isNewSubscriptionTxType(type: unknown): boolean {
  const raw = String(type ?? "").trim().toLowerCase();
  return raw === "new_sub"
    || raw === "new_subscription";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good Morning";
  if (h < 18) return "Good Afternoon";
  return "Good Evening";
}

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

type CreatorRow = {
  creatorId: string;
  creatorName: string;
  avatarUrl?: string;
  totalRevenue: number;
  previousTotalRevenue: number;
  totalRevenueChange: number;
  totalRevenueChangePct?: number;
  newFans: number;
  newFansChange: number;
  newFansChangePct?: number;
  salesRevenue: number;
  subscriptionRevenue: number;
  ppvRevenue: number;
  tipsRevenue: number;
  avgFanSpend: number;
};

export default function AdminRevenueDashboard({ user, filterCreatorNames }: { user: any; token: string; filterCreatorNames?: string[] }) {
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(0));
  const [drillDate, setDrillDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [dashboard, setDashboard] = useState<any>(null);
  const [comparisonDashboard, setComparisonDashboard] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [creatorOverviewRows, setCreatorOverviewRows] = useState<CreatorRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [subscriptions, setSubscriptions] = useState<any>(null);
  const [comparisonSubscriptions, setComparisonSubscriptions] = useState<any>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const effectiveDateRange = useMemo(() => {
    if (drillDate) return { start: drillDate, end: drillDate };
    return dateRange;
  }, [drillDate, dateRange]);

  const comparisonRange = useMemo(() => {
    return getPreviousEquivalentRange(effectiveDateRange.start, effectiveDateRange.end);
  }, [effectiveDateRange.start, effectiveDateRange.end]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data: accounts } = await supabase
        .from("crm_of_accounts")
        .select("account_id, creator_id, crm_creators(name, avatar_url)");

      const accountMap = new Map<string, { creatorId: string; creatorName: string; avatarUrl?: string }>();
      for (const row of accounts ?? []) {
        const creator = (row as any).crm_creators;
        const creatorName = creator?.name ?? "Unassigned (CSV)";
        if (filterCreatorNames?.length && !filterCreatorNames.includes(creatorName)) continue;
        accountMap.set((row as any).account_id, {
          creatorId: (row as any).creator_id,
          creatorName,
          avatarUrl: creator?.avatar_url,
        });
      }

      const { data: earningsCur } = await supabase
        .from("crm_of_daily_earnings")
        .select("account_id,date,total_earnings,net_earnings,subscription_earnings,message_earnings,tip_earnings,transaction_count,subscription_count")
        .gte("date", effectiveDateRange.start)
        .lte("date", effectiveDateRange.end);

      const { data: earningsPrev } = await supabase
        .from("crm_of_daily_earnings")
        .select("account_id,date,total_earnings,net_earnings,subscription_earnings,message_earnings,tip_earnings,transaction_count,subscription_count")
        .gte("date", comparisonRange.start)
        .lte("date", comparisonRange.end);

      const today = toDateOnly(new Date());
      const includesToday = effectiveDateRange.start <= today && effectiveDateRange.end >= today;
      let earningsCurRows = earningsCur ?? [];

      if (includesToday) {
        const todayEarningsRows = earningsCurRows.filter((r: any) => r.date === today);
        const todayNet = todayEarningsRows.reduce((sum: number, r: any) => sum + Number(r.net_earnings || 0), 0);

        if (todayEarningsRows.length === 0 || todayNet === 0) {
          const { data: todayTx } = await supabase
            .from("crm_of_transactions")
            .select("account_id,type,amount,timestamp")
            .gte("timestamp", `${today}T00:00:00`)
            .lte("timestamp", `${today}T23:59:59`);

          const txFiltered = (todayTx ?? []).filter((r: any) => !accountMap.size || accountMap.has(r.account_id));
          const todayByAccount = new Map<string, any>();

          for (const tx of txFiltered) {
            const accountId = String(tx.account_id ?? "").trim();
            if (!accountId) continue;
            if (!todayByAccount.has(accountId)) {
              todayByAccount.set(accountId, {
                account_id: accountId,
                date: today,
                total_earnings: 0,
                net_earnings: 0,
                subscription_earnings: 0,
                message_earnings: 0,
                tip_earnings: 0,
                transaction_count: 0,
                subscription_count: 0,
              });
            }

            const row = todayByAccount.get(accountId)!;
            const amount = Number(tx.amount || 0);
            row.total_earnings += amount;
            row.net_earnings += amount;
            row.transaction_count += 1;

            switch (normalizeRevenueTxType(tx.type)) {
              case "subscription":
                row.subscription_earnings += amount;
                if (isNewSubscriptionTxType(tx.type)) {
                  row.subscription_count += 1;
                }
                break;
              case "message":
                row.message_earnings += amount;
                break;
              case "tip":
                row.tip_earnings += amount;
                break;
              default:
                break;
            }
          }

          const todayFallbackRows = Array.from(todayByAccount.values());
          if (todayFallbackRows.length > 0) {
            const replaceAccountIds = new Set(todayFallbackRows.map((r) => r.account_id));
            earningsCurRows = earningsCurRows.filter((r: any) => !(r.date === today && replaceAccountIds.has(r.account_id)));
            earningsCurRows.push(...todayFallbackRows);
          }
        }
      }

      const rowsCur = earningsCurRows.filter((r: any) => !accountMap.size || accountMap.has(r.account_id));
      const rowsPrev = (earningsPrev ?? []).filter((r: any) => !accountMap.size || accountMap.has(r.account_id));

      const dashboardAgg = rowsCur.reduce((acc: any, r: any) => {
        acc.netRevenue += Number(r.net_earnings || 0);
        acc.subscriptionRevenue += Number(r.subscription_earnings || 0);
        acc.messageRevenue += Number(r.message_earnings || 0);
        acc.tipRevenue += Number(r.tip_earnings || 0);
        acc.totalTransactions += Number(r.transaction_count || 0);
        return acc;
      }, { netRevenue: 0, subscriptionRevenue: 0, messageRevenue: 0, tipRevenue: 0, totalTransactions: 0 });

      const prevAgg = rowsPrev.reduce((acc: any, r: any) => {
        acc.netRevenue += Number(r.net_earnings || 0);
        return acc;
      }, { netRevenue: 0 });

      const trendMap = new Map<string, any>();
      for (const r of rowsCur) {
        const d = r.date;
        if (!trendMap.has(d)) trendMap.set(d, { date: d, netRevenue: 0, subscriptionRevenue: 0, messageRevenue: 0, tipRevenue: 0, transactionCount: 0 });
        const t = trendMap.get(d);
        t.netRevenue += Number(r.net_earnings || 0);
        t.subscriptionRevenue += Number(r.subscription_earnings || 0);
        t.messageRevenue += Number(r.message_earnings || 0);
        t.tipRevenue += Number(r.tip_earnings || 0);
        t.transactionCount += Number(r.transaction_count || 0);
      }

      const byCreatorCur = new Map<string, CreatorRow>();
      const byCreatorPrev = new Map<string, { totalRevenue: number; newFans: number }>();

      for (const r of rowsCur) {
        const meta = accountMap.get(r.account_id) ?? { creatorId: r.account_id, creatorName: "Unassigned (CSV)", avatarUrl: undefined };
        if (!byCreatorCur.has(meta.creatorId)) {
          byCreatorCur.set(meta.creatorId, {
            creatorId: meta.creatorId,
            creatorName: meta.creatorName,
            avatarUrl: meta.avatarUrl,
            totalRevenue: 0,
            previousTotalRevenue: 0,
            totalRevenueChange: 0,
            newFans: 0,
            newFansChange: 0,
            salesRevenue: 0,
            subscriptionRevenue: 0,
            ppvRevenue: 0,
            tipsRevenue: 0,
            avgFanSpend: 0,
          });
        }
        const c = byCreatorCur.get(meta.creatorId)!;
        c.totalRevenue += Number(r.net_earnings || 0);
        c.salesRevenue += Number(r.message_earnings || 0) + Number(r.tip_earnings || 0);
        c.subscriptionRevenue += Number(r.subscription_earnings || 0);
        c.ppvRevenue += Number(r.message_earnings || 0);
        c.tipsRevenue += Number(r.tip_earnings || 0);
        c.newFans += Number(r.subscription_count || 0);
      }

      for (const r of rowsPrev) {
        const meta = accountMap.get(r.account_id) ?? { creatorId: r.account_id, creatorName: "Unassigned (CSV)", avatarUrl: undefined };
        if (!byCreatorPrev.has(meta.creatorId)) byCreatorPrev.set(meta.creatorId, { totalRevenue: 0, newFans: 0 });
        const p = byCreatorPrev.get(meta.creatorId)!;
        p.totalRevenue += Number(r.net_earnings || 0);
        p.newFans += Number(r.subscription_count || 0);
      }

      const creatorRows = Array.from(byCreatorCur.values())
        .map((c) => {
          const prev = byCreatorPrev.get(c.creatorId) ?? { totalRevenue: 0, newFans: 0 };
          const totalRevenueChange = c.totalRevenue - prev.totalRevenue;
          const newFansChange = c.newFans - prev.newFans;
          const totalRevenueChangePct = prev.totalRevenue > 0 ? (totalRevenueChange / prev.totalRevenue) * 100 : undefined;
          const newFansChangePct = prev.newFans > 0 ? (newFansChange / prev.newFans) * 100 : undefined;
          const avgFanSpend = c.newFans > 0 ? c.totalRevenue / c.newFans : 0;
          return {
            ...c,
            previousTotalRevenue: prev.totalRevenue,
            totalRevenueChange,
            totalRevenueChangePct,
            newFansChange,
            newFansChangePct,
            avgFanSpend,
          };
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue);

      // Fetch ALL transactions for the date range (Supabase defaults to 1000 rows which truncates data)
      const fetchAllTx = async (start: string, end: string) => {
        const all: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data } = await supabase
            .from("crm_of_transactions")
            .select("account_id,type,amount,timestamp")
            .gte("timestamp", `${start}T00:00:00`)
            .lte("timestamp", `${end}T23:59:59`)
            .range(from, from + pageSize - 1);
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };

      const [txCur, txPrev] = await Promise.all([
        fetchAllTx(effectiveDateRange.start, effectiveDateRange.end),
        fetchAllTx(comparisonRange.start, comparisonRange.end),
      ]);

      const txCurFiltered = (txCur ?? []).filter((r: any) => !accountMap.size || accountMap.has(r.account_id));
      const txPrevFiltered = (txPrev ?? []).filter((r: any) => !accountMap.size || accountMap.has(r.account_id));

      const calcSubs = (rows: any[]) => {
        const newSubsRows = rows.filter((r) => r.type === "new_sub" || r.type === "new_subscription");
        const rebillRows = rows.filter((r) => r.type === "rebill");
        const sum = (list: any[]) => list.reduce((s, r) => s + Number(r.amount || 0), 0);
        return {
          newSubs: { count: newSubsRows.length, revenue: sum(newSubsRows) },
          rebills: { count: rebillRows.length, revenue: sum(rebillRows) },
          total: { count: newSubsRows.length + rebillRows.length, revenue: sum(newSubsRows) + sum(rebillRows) },
        };
      };

      const [{ data: syncRows }, { count: txCount }] = await Promise.all([
        supabase
          .from("crm_of_sync_state")
          .select("account_id,status,error,last_sync_at")
          .order("last_sync_at", { ascending: false }),
        supabase.from("crm_of_transactions").select("id", { count: "exact", head: true }),
      ]);

      const perCreator = (syncRows ?? []).map((r: any) => ({
        creatorName: accountMap.get(r.account_id)?.creatorName ?? r.account_id,
        status: r.status,
        error: r.error,
      }));

      if (!cancelled) {
        setDashboard(dashboardAgg);
        setComparisonDashboard(prevAgg);
        setTrend(Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date)));
        setCreatorOverviewRows(creatorRows);
        setSubscriptions(calcSubs(txCurFiltered));
        setComparisonSubscriptions(calcSubs(txPrevFiltered));
        setSyncStatus({
          lastSyncAt: syncRows?.[0]?.last_sync_at ? new Date(syncRows[0].last_sync_at).getTime() : null,
          creatorsWithErrors: perCreator.some((c: any) => c.status === "error"),
          totalTransactionsSynced: txCount ?? 0,
          perCreator,
        });
        setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [effectiveDateRange.start, effectiveDateRange.end, comparisonRange.start, comparisonRange.end, filterCreatorNames]);

  const filteredCreatorRows = useMemo(() => {
    if (!filterCreatorNames || filterCreatorNames.length === 0) return creatorOverviewRows || [];
    return (creatorOverviewRows || []).filter((row: any) => filterCreatorNames.includes(row.creatorName));
  }, [creatorOverviewRows, filterCreatorNames]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { error } = await supabase.functions.invoke("of-sync", { body: { job: "earnings", range: "24h" } });
      if (error) throw error;
      setSyncMsg({ text: "OF sync triggered", type: "success" });
    } catch (err: any) {
      setSyncMsg({ text: err?.message || "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  }, []);

  const syncStatusText = useMemo(() => {
    if (!syncStatus?.lastSyncAt) return "Never synced";
    const mins = Math.floor((Date.now() - syncStatus.lastSyncAt) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  }, [syncStatus]);

  const totalTypeRevenue = dashboard ? dashboard.subscriptionRevenue + dashboard.messageRevenue + dashboard.tipRevenue : 0;
  const currentRevenue = dashboard?.netRevenue ?? 0;
  const previousRevenue = comparisonDashboard?.netRevenue ?? 0;
  const revenueChangePct = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

  const donutData = useMemo(() => {
    if (!dashboard || totalTypeRevenue <= 0) return [];
    return [
      { name: "Subscriptions", value: dashboard.subscriptionRevenue || 0, color: "#3b82f6" },
      { name: "Messages (PPV)", value: dashboard.messageRevenue || 0, color: "#f59e0b" },
      { name: "Tips", value: dashboard.tipRevenue || 0, color: "#22c55e" },
    ];
  }, [dashboard, totalTypeRevenue]);

  const trendData = useMemo(() => {
    return (trend || []).map((d: any) => ({
      date: new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      rawDate: d.date,
      revenue: d.netRevenue,
      subscriptions: d.subscriptionRevenue,
      messages: d.messageRevenue,
      tips: d.tipRevenue,
    }));
  }, [trend]);

  const handleChartClick = useCallback((data: any) => {
    if (data?.activePayload?.[0]?.payload?.rawDate) setDrillDate(data.activePayload[0].payload.rawDate);
  }, []);

  const subscriptionCards = useMemo(() => {
    const current = subscriptions || { newSubs: { count: 0, revenue: 0 }, rebills: { count: 0, revenue: 0 }, total: { count: 0, revenue: 0 } };
    const previous = comparisonSubscriptions || { newSubs: { count: 0, revenue: 0 }, rebills: { count: 0, revenue: 0 }, total: { count: 0, revenue: 0 } };
    return [
      { key: "new", label: "New Subscriptions", current: current.newSubs, previous: previous.newSubs, color: "#3b82f6" },
      { key: "rebill", label: "Rebills", current: current.rebills, previous: previous.rebills, color: "#22c55e" },
      { key: "total", label: "Total Subscriptions", current: current.total, previous: previous.total, color: "#f1ae38" },
    ];
  }, [subscriptions, comparisonSubscriptions]);

  const revenueSparkline = trend?.map((d: any) => d.netRevenue || 0) || [];
  const subsSparkline = trend?.map((d: any) => d.subscriptionRevenue || 0) || [];
  const txnSparkline = trend?.map((d: any) => d.transactionCount || 0) || [];

  const card = (extra?: React.CSSProperties): React.CSSProperties => ({
    background: "#1e1e1e",
    borderRadius: "16px",
    padding: "24px",
    border: "1px solid #2a2a2a",
    ...extra,
  });

  if (loading) {
    return <div style={{ color: "#a0a0a0", padding: 24 }}>Loading dashboard…</div>;
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "#fff", margin: 0 }}>
            {getGreeting()}, {filterCreatorNames ? user.name || "Manager" : "Preach Agency"}! {filterCreatorNames ? "📊" : "👑"}
          </h1>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: syncStatus?.creatorsWithErrors ? "#ef4444" : "#22c55e" }} />
            <span style={{ fontSize: "13px", color: "#a0a0a0" }}>
              Last synced: {syncStatusText}
              {syncStatus ? ` · ${Number(syncStatus.totalTransactionsSynced || 0).toLocaleString()} transactions` : ""}
            </span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setDrillDate(null); }} />
          {user.role === "admin" && <button onClick={handleSync} disabled={syncing} style={{ padding: "10px 18px", fontSize: "13px", fontWeight: "600", color: "#1a1a1a", background: syncing ? "#666" : "#f1ae38", border: "none", borderRadius: "10px", cursor: syncing ? "not-allowed" : "pointer" }}>{syncing ? "⏳ Syncing..." : "🔄 Sync"}</button>}
        </div>
      </div>

      {syncMsg && <div style={{ padding: "12px 18px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", background: syncMsg.type === "success" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: syncMsg.type === "success" ? "#22c55e" : "#ef4444" }}>{syncMsg.text}</div>}

      {drillDate && (
        <div style={{ padding: "12px 18px", borderRadius: "10px", marginBottom: "16px", fontSize: "13px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(241,174,56,0.12)", color: "#f1ae38", border: "1px solid rgba(241,174,56,0.3)" }}>
          <span>📅 Drill-down: {new Date(drillDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
          <button onClick={() => setDrillDate(null)} style={{ padding: "6px 14px", fontSize: "12px", fontWeight: "600", background: "#f1ae38", color: "#1a1a1a", border: "none", borderRadius: "6px", cursor: "pointer" }}>✕ Back to range</button>
        </div>
      )}

      <div className="admin-rev-top-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Total Turnover</div>
          <div style={{ fontSize: "36px", fontWeight: "700", color: "#f1ae38", marginBottom: "8px" }}>{formatCurrency(currentRevenue)}</div>
          <div style={{ fontSize: "12px", color: "#a0a0a0", marginBottom: "12px", display: "grid", gap: "4px" }}>
            <div>Previous period: <span style={{ color: "#fff", fontWeight: 600 }}>{formatCurrency(previousRevenue)}</span></div>
            <div>Change: <span style={{ color: revenueChangePct === null ? "#a0a0a0" : revenueChangePct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{revenueChangePct === null ? "—" : `${revenueChangePct >= 0 ? "↑" : "↓"} ${Math.abs(revenueChangePct).toFixed(1)}%`}</span></div>
            {dashboard && <div>Net revenue · {dashboard.totalTransactions} txns</div>}
          </div>
          <Sparkline data={revenueSparkline} color="#f1ae38" width={200} height={40} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={card({ flex: 1 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Subscriptions</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#3b82f6" }}>{formatCurrency(dashboard?.subscriptionRevenue || 0)}</div>
              </div>
              <Sparkline data={subsSparkline} color="#3b82f6" width={60} height={28} />
            </div>
          </div>
          <div style={card({ flex: 1 })}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: "12px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Total Transactions</div>
                <div style={{ fontSize: "24px", fontWeight: "700", color: "#22c55e" }}>{Number(dashboard?.totalTransactions || 0).toLocaleString()}</div>
              </div>
              <Sparkline data={txnSparkline} color="#22c55e" width={60} height={28} />
            </div>
          </div>
        </div>

        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Revenue Breakdown</div>
          {donutData.length > 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "120px", height: "120px", flexShrink: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} cx="50%" cy="50%" innerRadius={35} outerRadius={55} dataKey="value" stroke="none">
                      {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                {donutData.map((d) => (
                  <div key={d.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "#2a2a2a", borderRadius: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><div style={{ width: "10px", height: "10px", borderRadius: "3px", background: d.color }} /><span style={{ fontSize: "12px", color: "#fff" }}>{d.name}</span></div>
                    <span style={{ fontSize: "12px", fontWeight: "700", color: d.color }}>{formatCurrency(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "30px 0" }}>No revenue data for this period</div>}
        </div>
      </div>

      <div className="admin-rev-subs-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "16px", marginBottom: "16px" }}>
        {subscriptionCards.map((s) => {
          const currentCount = s.current?.count ?? 0;
          const currentRevenue = s.current?.revenue ?? 0;
          const previousCount = s.previous?.count ?? 0;
          const previousRevenue = s.previous?.revenue ?? 0;
          const changePct = previousRevenue > 0 ? ((currentRevenue - previousRevenue) / previousRevenue) * 100 : null;

          return (
            <div key={s.key} style={card()}>
              <div style={{ fontSize: "11px", color: "#a0a0a0", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{s.label}</div>
              <div style={{ fontSize: "22px", fontWeight: "700", color: s.color, marginBottom: "6px" }}>{currentCount.toLocaleString()}</div>
              <div style={{ fontSize: "14px", color: "#fff", fontWeight: "600", marginBottom: "10px" }}>{formatCurrency(currentRevenue)}</div>
              <div style={{ fontSize: "12px", color: "#a0a0a0", display: "grid", gap: "4px" }}>
                <div>Previous period: <span style={{ color: "#fff", fontWeight: 600 }}>{formatCurrency(previousRevenue)}</span><span style={{ marginLeft: "6px", color: "#777" }}>({previousCount.toLocaleString()})</span></div>
                <div>Change: <span style={{ color: changePct === null ? "#a0a0a0" : changePct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>{changePct === null ? "—" : `${changePct >= 0 ? "↑" : "↓"} ${Math.abs(changePct).toFixed(1)}%`}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="admin-rev-bottom-row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Revenue Over Time</div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} onClick={handleChartClick} style={{ cursor: "pointer" }}>
                <defs><linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f1ae38" stopOpacity={0.3} /><stop offset="100%" stopColor="#f1ae38" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v)} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#f1ae38", strokeOpacity: 0.3 }} />
                <Area type="monotone" dataKey="revenue" stroke="#f1ae38" fill="url(#revGrad)" strokeWidth={2} name="Revenue" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>No data</div>}
        </div>

        <div style={card()}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Revenue Breakdown Over Time</div>
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
          ) : <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>No data</div>}
        </div>
      </div>

      <div style={{ ...card(), marginBottom: "24px", overflowX: "auto" }}>
        <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Creator Overview</div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {['Creator', 'Total Revenue', 'New Subs', 'Sales Revenue', 'Subscription Revenue', 'Avg Fan Spend'].map((h) => <th key={h} style={{ padding: "12px 10px", fontSize: "12px", color: "#a0a0a0", fontWeight: 600 }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredCreatorRows.map((row: any) => (
              <tr key={row.creatorId} style={{ borderBottom: "1px solid #242424" }}>
                <td style={{ padding: "12px 10px", color: "#fff", fontWeight: 600 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {row.avatarUrl ? <img src={row.avatarUrl} alt={row.creatorName} style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} /> : <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#2a2a2a", display: "grid", placeItems: "center", fontSize: 11 }}>👤</div>}
                    <span>{row.creatorName}</span>
                  </div>
                </td>
                <td style={{ padding: "12px 10px", color: "#fff" }}><div style={{ fontWeight: 600 }}>{formatCurrency(row.totalRevenue || 0)}</div></td>
                <td style={{ padding: "12px 10px", color: "#fff" }}><div style={{ fontWeight: 600 }}>{(row.newFans || 0).toLocaleString()}</div></td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.salesRevenue || 0)}</td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.subscriptionRevenue || 0)}</td>
                <td style={{ padding: "12px 10px", color: "#fff" }}>{formatCurrency(row.avgFanSpend || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .admin-rev-top-row { grid-template-columns: 1fr !important; }
          .admin-rev-subs-row { grid-template-columns: 1fr !important; }
          .admin-rev-bottom-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
