"use client";

import { useEffect, useState, useMemo } from "react";
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

export default function ManagerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(6));
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [totals, setTotals] = useState({ newSubsInRange: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<any[]>([]);
  const [igRows, setIgRows] = useState<any[]>([]);

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

      const { data: subsTx } = await supabase
        .from("crm_of_transactions")
        .select("account_id,type,timestamp")
        .in("type", ["new_sub", "subscription", "rebill"])
        .gte("timestamp", `${dateRange.start}T00:00:00`)
        .lte("timestamp", `${dateRange.end}T23:59:59`);

      const accMap = new Map<string, { accountId: string; creatorName: string; newSubsInRange: number }>();
      for (const tx of subsTx ?? []) {
        const accountId = (tx as any).account_id;
        const creatorName = accountToCreator.get(accountId) || accountId;
        const key = accountId;
        if (!accMap.has(key)) accMap.set(key, { accountId, creatorName, newSubsInRange: 0 });
        accMap.get(key)!.newSubsInRange += 1;
      }
      const accountsRows = Array.from(accMap.values()).sort((a, b) => b.newSubsInRange - a.newSubsInRange);

      const days = trendPeriod === "7d" ? 7 : trendPeriod === "30d" ? 30 : 90;
      const startTrend = new Date();
      startTrend.setDate(startTrend.getDate() - (days - 1));
      const trendStart = toDateOnly(startTrend);

      const { data: trendTx } = await supabase
        .from("crm_of_transactions")
        .select("timestamp,type")
        .in("type", ["new_sub", "subscription", "rebill"])
        .gte("timestamp", `${trendStart}T00:00:00`)
        .lte("timestamp", `${toDateOnly(new Date())}T23:59:59`);

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
        .select("id,name,url,clicks,subscribers,conversion_rate,last_synced_at,creator_id")
        .order("clicks", { ascending: false });

      const linksRows = (links ?? []).map((l: any) => ({
        ...l,
        creatorName: creatorNameById.get(l.creator_id) || "Unknown",
      }));

      const [{ data: igAccounts }, { data: igSnapshots }, { data: igReels }] = await Promise.all([
        supabase.from("crm_ig_accounts").select("id,creator_id,username,followers").order("followers", { ascending: false }),
        supabase
          .from("crm_ig_daily_snapshots")
          .select("ig_account_id,followers_delta,views,likes,comments,reels_posted,date")
          .gte("date", dateRange.start)
          .lte("date", dateRange.end),
        supabase
          .from("crm_ig_reels")
          .select("ig_account_id")
          .gte("posted_at", `${dateRange.start}T00:00:00`)
          .lte("posted_at", `${dateRange.end}T23:59:59`),
      ]);

      const snapByAccount = new Map<string, any>();
      for (const s of igSnapshots ?? []) {
        const id = (s as any).ig_account_id;
        if (!snapByAccount.has(id)) snapByAccount.set(id, { followersDelta: 0, views: 0, likes: 0, comments: 0, reelCount: 0 });
        const row = snapByAccount.get(id);
        row.followersDelta += Number((s as any).followers_delta || 0);
        row.views += Number((s as any).views || 0);
        row.likes += Number((s as any).likes || 0);
        row.comments += Number((s as any).comments || 0);
        row.reelCount += Number((s as any).reels_posted || 0);
      }
      for (const r of igReels ?? []) {
        const id = (r as any).ig_account_id;
        if (!snapByAccount.has(id)) snapByAccount.set(id, { followersDelta: 0, views: 0, likes: 0, comments: 0, reelCount: 0 });
        snapByAccount.get(id).reelCount += 1;
      }

      const igRowsData = (igAccounts ?? []).map((a: any) => {
        const s = snapByAccount.get(a.id) || { followersDelta: 0, views: 0, likes: 0, comments: 0, reelCount: 0 };
        return {
          accountId: a.id,
          creatorName: creatorNameById.get(a.creator_id) || "Unknown",
          username: a.username,
          followers: Number(a.followers || 0),
          ...s,
        };
      }).sort((a: any, b: any) => b.views - a.views);

      if (!cancelled) {
        setAccounts(accountsRows);
        setTotals({ newSubsInRange: accountsRows.reduce((s, a) => s + a.newSubsInRange, 0) });
        setChartData(trendRows);
        setTrackingLinks(linksRows);
        setIgRows(igRowsData);
        setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end, trendPeriod]);

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "var(--text)" }}>
        🔒 This dashboard is for marketing managers only.
      </div>
    );
  }

  const rangeLabelText = `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

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
              {[
                "Creator",
                "New Subs",
              ].map((h) => (
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
        <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: 500, marginBottom: "12px", textTransform: "uppercase" }}>
          🔗 Tracking Links
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "760px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {[
                "Name",
                "Creator",
                "Clicks",
                "Subscribers",
                "Conv %",
                "Last Synced",
              ].map((h) => (
                <th key={h} style={{ padding: "10px", fontSize: "12px", color: "#a0a0a0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trackingLinks.slice(0, 40).map((l: any) => (
              <tr key={l.id} style={{ borderBottom: "1px solid #242424" }}>
                <td style={{ padding: "10px", color: "#fff" }}>{l.name}</td>
                <td style={{ padding: "10px", color: "#a0a0a0" }}>{l.creatorName}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{Number(l.clicks || 0).toLocaleString()}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{Number(l.subscribers || 0).toLocaleString()}</td>
                <td style={{ padding: "10px", color: "#22c55e" }}>{(Number(l.conversion_rate || 0) * 100).toFixed(1)}%</td>
                <td style={{ padding: "10px", color: "#a0a0a0" }}>{l.last_synced_at ? new Date(l.last_synced_at).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card style={{ overflowX: "auto" }}>
        <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: 500, marginBottom: "12px", textTransform: "uppercase" }}>
          📸 Instagram Analytics
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "860px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {["Creator", "Account", "Views", "Likes", "Comments", "New Followers", "Reels"].map((h) => (
                <th key={h} style={{ padding: "10px", fontSize: "12px", color: "#a0a0a0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {igRows.slice(0, 50).map((r: any) => (
              <tr key={r.accountId} style={{ borderBottom: "1px solid #242424" }}>
                <td style={{ padding: "10px", color: "#fff" }}>{r.creatorName}</td>
                <td style={{ padding: "10px", color: "#a0a0a0" }}>@{r.username}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.views || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.likes || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.comments || 0)}</td>
                <td style={{ padding: "10px", color: r.followersDelta >= 0 ? "#22c55e" : "#ef4444" }}>{r.followersDelta >= 0 ? "+" : ""}{formatNumber(r.followersDelta || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.reelCount || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
