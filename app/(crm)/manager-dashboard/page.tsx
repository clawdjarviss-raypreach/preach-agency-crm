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
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
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

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateOnly(d);
}

function enumerateDates(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    out.push(toDateOnly(d));
  }
  return out;
}

function getDaysAgoRange(days: number) {
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: toDateOnly(start), end: toDateOnly(now) };
}

function getYesterdayDateOnly() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toDateOnly(d);
}

function getLast7DaysEndingYesterday() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

function clampRangeToMax(range: DateRange, maxDate: string): DateRange {
  const end = range.end > maxDate ? maxDate : range.end;
  const start = range.start > end ? end : range.start;
  return { start, end };
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

function DonutWithLegend({
  title,
  data,
}: {
  title: string;
  data: { name: string; value: number; color: string }[];
}) {
  const safeData = data.filter((d) => d.value > 0);
  const total = safeData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div style={{ flex: 1, minWidth: "300px" }}>
      <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: 600, marginBottom: "12px" }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "160px", height: "160px", flexShrink: 0 }}>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={safeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={72}
                  strokeWidth={0}
                >
                  {safeData.map((entry, i) => (
                    <Cell key={`${entry.name}-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ color: "#666", fontSize: "12px", textAlign: "center", paddingTop: "70px" }}>No data</div>
          )}
        </div>

        <div style={{ flex: 1, maxHeight: "160px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
          {safeData.map((entry) => (
            <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: entry.color, flexShrink: 0 }} />
              <span style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
              <span style={{ color: "#f1ae38", fontWeight: 600, flexShrink: 0 }}>{formatNumber(entry.value)}</span>
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

export default function ManagerDashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(29));
  const [igDateRange, setIgDateRange] = useState<DateRange>(() => getLast7DaysEndingYesterday());
  const [loading, setLoading] = useState(true);

  const [accounts, setAccounts] = useState<any[]>([]);
  const [totals, setTotals] = useState({ newSubsInRange: 0 });
  const [chartData, setChartData] = useState<any[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<any[]>([]);
  const [activeOfTab, setActiveOfTab] = useState<"tracking_links">("tracking_links");
  const [igRows, setIgRows] = useState<any[]>([]);
  const [igDailyGains, setIgDailyGains] = useState<any[]>([]);
  const [igReelCurves, setIgReelCurves] = useState<any[]>([]);
  const [igCreatorOptions, setIgCreatorOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedIgCreator, setSelectedIgCreator] = useState<string>("all");
  const [showAllIgAccounts, setShowAllIgAccounts] = useState(false);
  const [selectedIgAccount, setSelectedIgAccount] = useState<any | null>(null);
  const [selectedIgAccountReels, setSelectedIgAccountReels] = useState<any[] | null>(null);

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
        supabase.from("crm_creators").select("id,name,instagram_username,instagram_usernames").eq("status", "active"),
        supabase.from("crm_of_accounts").select("account_id,creator_id"),
      ]);

      const creatorNameById = new Map<string, string>((creators ?? []).map((c: any) => [c.id, c.name]));
      const creatorByInstagram = new Map<string, { id: string; name: string }>();
      for (const creator of creators ?? []) {
        const names = [
          (creator as any).instagram_username,
          ...(((creator as any).instagram_usernames ?? []) as string[]),
        ]
          .filter(Boolean)
          .map((name: string) => name.replace(/^@/, "").toLowerCase());

        for (const name of names) {
          creatorByInstagram.set(name, { id: (creator as any).id, name: (creator as any).name });
        }
      }
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

      const igEndPlusOne = addDays(igDateRange.end, 1);
      const [{ data: igAccounts }, { data: igSnapshots }, { data: igReels }] = await Promise.all([
        supabase.from("crm_ig_accounts").select("id,creator_id,username,followers").order("followers", { ascending: false }),
        supabase
          .from("crm_ig_daily_snapshots")
          .select("ig_account_id,date,followers,views,likes,comments")
          .gte("date", igDateRange.start)
          .lte("date", igEndPlusOne),
        supabase
          .from("crm_ig_reels")
          .select("id,ig_account_id,posted_at,thumbnail_url")
          .gte("posted_at", `${igDateRange.start}T00:00:00`)
          .lte("posted_at", `${igDateRange.end}T23:59:59`),
      ]);

      const snapByAccount = new Map<string, any[]>();
      for (const s of igSnapshots ?? []) {
        const id = (s as any).ig_account_id;
        if (!snapByAccount.has(id)) snapByAccount.set(id, []);
        snapByAccount.get(id)!.push(s);
      }

      const reelCountByAccount = new Map<string, number>();
      for (const r of igReels ?? []) {
        const id = (r as any).ig_account_id;
        reelCountByAccount.set(id, (reelCountByAccount.get(id) || 0) + 1);
      }

      const igRowsData = (igAccounts ?? []).map((a: any) => {
        const rows = (snapByAccount.get(a.id) ?? []).sort((x, y) => String(x.date).localeCompare(String(y.date)));
        const byDate = new Map(rows.map((r) => [String((r as any).date), r]));

        const startSnap = byDate.get(igDateRange.start);
        const endSnap = byDate.get(igEndPlusOne) ?? (rows.length ? rows[rows.length - 1] : null);

        const startFollowers = Number(startSnap?.followers || 0);
        const endFollowers = Number(endSnap?.followers || 0);
        const startViews = Number(startSnap?.views || 0);
        const endViews = Number(endSnap?.views || 0);
        const startLikes = Number(startSnap?.likes || 0);
        const endLikes = Number(endSnap?.likes || 0);
        const startComments = Number(startSnap?.comments || 0);
        const endComments = Number(endSnap?.comments || 0);

        const followersDelta = endFollowers - startFollowers;
        const followerGrowthPct = startFollowers > 0 ? ((followersDelta / startFollowers) * 100) : null;

        const usernameKey = String(a.username ?? "").replace(/^@/, "").toLowerCase();
        const mappedCreator = creatorByInstagram.get(usernameKey);
        const creatorId = a.creator_id ?? mappedCreator?.id ?? null;
        const creatorName = creatorNameById.get(creatorId) || mappedCreator?.name || "Unknown";

        return {
          accountId: a.id,
          creatorId,
          creatorName,
          username: a.username,
          followers: endFollowers,
          followersDelta,
          followerGrowthPct,
          views: endViews - startViews,
          likes: endLikes - startLikes,
          comments: endComments - startComments,
          reelCount: reelCountByAccount.get(a.id) || 0,
        };
      }).sort((a: any, b: any) => b.views - a.views);

      const accountDailyGainRows = enumerateDates(igDateRange.start, igDateRange.end).map((day) => {
        const next = addDays(day, 1);
        let views = 0;
        let likes = 0;
        let comments = 0;

        for (const account of igAccounts ?? []) {
          const rows = (snapByAccount.get((account as any).id) ?? []).sort((x, y) => String(x.date).localeCompare(String(y.date)));
          const byDate = new Map(rows.map((r) => [String((r as any).date), r]));
          const startSnap = byDate.get(day);
          const endSnap = byDate.get(next);
          views += Number(endSnap?.views || 0) - Number(startSnap?.views || 0);
          likes += Number(endSnap?.likes || 0) - Number(startSnap?.likes || 0);
          comments += Number(endSnap?.comments || 0) - Number(startSnap?.comments || 0);
        }

        return {
          date: new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          Views: views,
          Likes: likes,
          Comments: comments,
        };
      });

      const accountUsernameById = new Map<string, string>((igAccounts ?? []).map((a: any) => [a.id, a.username || "unknown"]));
      const curveUpperBound = addDays(getYesterdayDateOnly(), 1);
      const reelsForCurve = (igReels ?? []).slice(0, 60);

      let reelCurveRows: any[] = [];
      if (reelsForCurve.length > 0) {
        const reelIds = reelsForCurve.map((r: any) => r.id);
        const earliestPosted = reelsForCurve
          .map((r: any) => String((r.posted_at || "").split("T")[0]))
          .filter(Boolean)
          .sort()[0];

        const latestCurveEnd = reelsForCurve
          .map((r: any) => {
            const posted = String((r.posted_at || "").split("T")[0]);
            return posted ? addDays(posted, 30) : igDateRange.end;
          })
          .sort()
          .slice(-1)[0];

        const curveQueryEnd = latestCurveEnd > curveUpperBound ? curveUpperBound : latestCurveEnd;

        const { data: reelSnapshots } = await supabase
          .from("crm_ig_reel_daily_snapshots")
          .select("ig_reel_id,snapshot_date,views,likes,comments")
          .in("ig_reel_id", reelIds)
          .gte("snapshot_date", earliestPosted)
          .lte("snapshot_date", curveQueryEnd);

        const snapshotsByReel = new Map<string, any[]>();
        for (const row of reelSnapshots ?? []) {
          const reelId = (row as any).ig_reel_id;
          if (!snapshotsByReel.has(reelId)) snapshotsByReel.set(reelId, []);
          snapshotsByReel.get(reelId)!.push(row);
        }

        reelCurveRows = reelsForCurve.map((reel: any) => {
          const postedDay = String((reel.posted_at || "").split("T")[0]);
          const snapshots = (snapshotsByReel.get(reel.id) ?? []).sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
          const byDate = new Map(snapshots.map((s) => [String((s as any).snapshot_date), s]));

          const points = Array.from({ length: 30 }, (_, idx) => {
            const startDay = addDays(postedDay, idx);
            const endDay = addDays(postedDay, idx + 1);
            if (endDay > curveUpperBound) {
              return {
                day: `D${idx + 1}`,
                Views: null,
                Likes: null,
                Comments: null,
              };
            }
            const startSnap = byDate.get(startDay);
            const endSnap = byDate.get(endDay);
            return {
              day: `D${idx + 1}`,
              Views: Number(endSnap?.views || 0) - Number(startSnap?.views || 0),
              Likes: Number(endSnap?.likes || 0) - Number(startSnap?.likes || 0),
              Comments: Number(endSnap?.comments || 0) - Number(startSnap?.comments || 0),
            };
          });

          return {
            reelId: reel.id,
            accountUsername: accountUsernameById.get(reel.ig_account_id) || "unknown",
            postedAt: reel.posted_at,
            thumbnailUrl: reel.thumbnail_url,
            totalViews30d: points.reduce((sum, p) => sum + Number(p.Views || 0), 0),
            points,
          };
        }).sort((a, b) => b.totalViews30d - a.totalViews30d).slice(0, 8);
      }

      if (!cancelled) {
        setAccounts(accountsRows);
        setTotals({ newSubsInRange: accountsRows.reduce((s, a) => s + a.newSubsInRange, 0) });
        setChartData(trendRows);
        setTrackingLinks(linksRows);
        setIgRows(igRowsData);
        const creatorOptions = Array.from(
          new Map(
            igRowsData
              .filter((row: any) => row.creatorId)
              .map((row: any) => [String(row.creatorId), row.creatorName]),
          ).entries(),
        )
          .map(([id, name]) => ({ id, name }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setIgCreatorOptions(creatorOptions);
        setIgDailyGains(accountDailyGainRows);
        setIgReelCurves(reelCurveRows);
        setLoading(false);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [dateRange.start, dateRange.end, igDateRange.start, igDateRange.end, trendPeriod]);

  useEffect(() => {
    setShowAllIgAccounts(false);
  }, [selectedIgCreator]);

  useEffect(() => {
    if (selectedIgCreator === "all") return;
    if (!igCreatorOptions.some((creator) => creator.id === selectedIgCreator)) {
      setSelectedIgCreator("all");
    }
  }, [igCreatorOptions, selectedIgCreator]);

  useEffect(() => {
    if (!selectedIgAccount) {
      setSelectedIgAccountReels(null);
      return;
    }

    let cancelled = false;

    async function loadAccountReels() {
      setSelectedIgAccountReels(null);

      const { data: reels } = await supabase
        .from("crm_ig_reels")
        .select("id,posted_at,thumbnail_url")
        .eq("ig_account_id", selectedIgAccount.accountId)
        .order("posted_at", { ascending: false })
        .limit(20);

      const reelIds = (reels ?? []).map((reel: any) => reel.id);
      if (reelIds.length === 0) {
        if (!cancelled) setSelectedIgAccountReels([]);
        return;
      }

      const { data: reelSnapshots } = await supabase
        .from("crm_ig_reel_daily_snapshots")
        .select("ig_reel_id,snapshot_date,views,likes,comments,shares")
        .in("ig_reel_id", reelIds)
        .gte("snapshot_date", igDateRange.start)
        .lte("snapshot_date", addDays(igDateRange.end, 1));

      const snapshotsByReel = new Map<string, any[]>();
      for (const snapshot of reelSnapshots ?? []) {
        const reelId = (snapshot as any).ig_reel_id;
        if (!snapshotsByReel.has(reelId)) snapshotsByReel.set(reelId, []);
        snapshotsByReel.get(reelId)!.push(snapshot);
      }

      const rows = (reels ?? [])
        .map((reel: any) => {
          const snapshots = (snapshotsByReel.get(reel.id) ?? []).sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
          const start = snapshots.find((snapshot: any) => String(snapshot.snapshot_date) === igDateRange.start) ?? snapshots[0];
          const end = snapshots.find((snapshot: any) => String(snapshot.snapshot_date) === addDays(igDateRange.end, 1)) ?? snapshots[snapshots.length - 1];

          const views = Number(end?.views || 0) - Number(start?.views || 0);
          const likes = Number(end?.likes || 0) - Number(start?.likes || 0);
          const comments = Number(end?.comments || 0) - Number(start?.comments || 0);
          const shares = Number(end?.shares || 0) - Number(start?.shares || 0);

          return {
            reelId: reel.id,
            postedAt: reel.posted_at,
            thumbnailUrl: reel.thumbnail_url,
            views,
            likes,
            comments,
            shares,
          };
        })
        .sort((a, b) => b.views - a.views);

      if (!cancelled) setSelectedIgAccountReels(rows);
    }

    loadAccountReels();
    return () => {
      cancelled = true;
    };
  }, [selectedIgAccount, igDateRange.start, igDateRange.end]);

  const maxIgEnd = getYesterdayDateOnly();
  const rangeLabelText = `${new Date(dateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(dateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const igRangeLabelText = `${new Date(igDateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(igDateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const filteredIgRows = useMemo(() => {
    if (selectedIgCreator === "all") return igRows;
    return igRows.filter((row: any) => String(row.creatorId ?? "") === selectedIgCreator);
  }, [igRows, selectedIgCreator]);

  const displayedIgRows = useMemo(() => {
    return showAllIgAccounts ? filteredIgRows : filteredIgRows.slice(0, 10);
  }, [filteredIgRows, showAllIgAccounts]);

  const igDonutData = useMemo(() => {
    const rows = filteredIgRows.slice(0, 30);
    const viewsData = rows.map((row: any, i: number) => ({
      name: row.creatorName || `@${row.username}`,
      value: Math.max(0, Number(row.views || 0)),
      color: CREATOR_COLORS[i % CREATOR_COLORS.length],
    }));
    const followersData = rows.map((row: any, i: number) => ({
      name: row.creatorName || `@${row.username}`,
      value: Math.max(0, Number(row.followersDelta || 0)),
      color: CREATOR_COLORS[i % CREATOR_COLORS.length],
    }));
    return { viewsData, followersData };
  }, [filteredIgRows]);

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
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
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
        </div>
        {activeOfTab === "tracking_links" && (
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
        )}
      </Card>

      <Card style={{ marginBottom: "24px", overflowX: "auto" }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}>
          <div style={{ fontSize: "13px", color: "#a0a0a0", fontWeight: 500, textTransform: "uppercase" }}>
            📸 Instagram Analytics ({igRangeLabelText})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <select
                value={selectedIgCreator}
                onChange={(e) => setSelectedIgCreator(e.target.value)}
                style={{
                  background: "#1C2A3A",
                  color: "#fff",
                  border: "1px solid #253545",
                  borderRadius: "8px",
                  padding: "7px 10px",
                  fontSize: "12px",
                  minWidth: "160px",
                }}
              >
                <option value="all">All creators</option>
                {igCreatorOptions.map((creator) => (
                  <option key={creator.id} value={creator.id}>{creator.name}</option>
                ))}
              </select>
              <DateRangePicker
                value={igDateRange}
                onChange={(next) => setIgDateRange(clampRangeToMax(next, maxIgEnd))}
              />
            </div>
            <span style={{ fontSize: "11px", color: "#666" }}>IG max end date: yesterday ({maxIgEnd})</span>
          </div>
        </div>

        {(igDonutData.viewsData.length > 0 || igDonutData.followersData.length > 0) && (
          <div style={{
            background: "#1C2A3A",
            borderRadius: "14px",
            padding: "24px",
            border: "1px solid #253545",
            marginBottom: "16px",
          }}>
            <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
              <DonutWithLegend title="Views Comparison" data={igDonutData.viewsData} />
              <DonutWithLegend title="New Followers Comparison" data={igDonutData.followersData} />
            </div>
          </div>
        )}

        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "980px" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
              {["Creator", "Account", "Views", "Likes", "Comments", "New Followers", "Growth %", "Reels"].map((h) => (
                <th key={h} style={{ padding: "10px", fontSize: "12px", color: "#a0a0a0" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedIgRows.map((r: any) => (
              <tr
                key={r.accountId}
                style={{ borderBottom: "1px solid #242424", cursor: "pointer" }}
                onClick={() => setSelectedIgAccount(r)}
              >
                <td style={{ padding: "10px", color: "#fff" }}>{r.creatorName}</td>
                <td style={{ padding: "10px", color: "#a0a0a0" }}>@{r.username}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.views || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.likes || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.comments || 0)}</td>
                <td style={{ padding: "10px", color: r.followersDelta >= 0 ? "#22c55e" : "#ef4444" }}>{r.followersDelta >= 0 ? "+" : ""}{formatNumber(r.followersDelta || 0)}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{r.followerGrowthPct === null ? "—" : `${r.followerGrowthPct >= 0 ? "+" : ""}${r.followerGrowthPct.toFixed(1)}%`}</td>
                <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.reelCount || 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!showAllIgAccounts && filteredIgRows.length > 10 && (
          <div style={{ textAlign: "center", marginTop: "14px" }}>
            <button
              onClick={() => setShowAllIgAccounts(true)}
              style={{
                background: "transparent",
                color: "#f1ae38",
                border: "1px solid #f1ae38",
                borderRadius: "8px",
                padding: "8px 14px",
                fontSize: "12px",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Show more ({filteredIgRows.length - 10} remaining)
            </button>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: "24px" }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          📈 IG Account Daily Gains (sum of account deltas: snapshot[day+1]-snapshot[day])
        </div>
        {igDailyGains.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={igDailyGains}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#666", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Legend wrapperStyle={{ fontSize: "12px", color: "#a0a0a0" }} />
              <Line type="monotone" dataKey="Views" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Likes" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Comments" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "60px 0" }}>
            No IG daily gain data for this range
          </div>
        )}
      </Card>

      <Card>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500", marginBottom: "16px",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          🎬 Reel 30-Day Performance Curves (daily deltas from cumulative snapshots)
        </div>

        {igReelCurves.length === 0 ? (
          <div style={{ color: "#666", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
            No reels in selected IG range
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
            {igReelCurves.map((reel: any) => (
              <div key={reel.reelId} style={{ border: "1px solid #2a2a2a", borderRadius: "12px", padding: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", marginBottom: "8px" }}>
                  <div>
                    <div style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>@{reel.accountUsername}</div>
                    <div style={{ color: "#888", fontSize: "11px" }}>
                      Posted {reel.postedAt ? new Date(reel.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </div>
                  </div>
                  <div style={{ color: "#3b82f6", fontSize: "12px", fontWeight: 600 }}>
                    30d Views: +{formatNumber(reel.totalViews30d || 0)}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={170}>
                  <LineChart data={reel.points}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                    <XAxis dataKey="day" tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
                    <YAxis tick={{ fill: "#666", fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="Views" stroke="#3b82f6" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="Likes" stroke="#22c55e" strokeWidth={1.75} dot={false} connectNulls />
                    <Line type="monotone" dataKey="Comments" stroke="#f59e0b" strokeWidth={1.75} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}
      </Card>

      {selectedIgAccount && (
        <div
          onClick={() => setSelectedIgAccount(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            padding: "20px",
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: "min(960px, 100%)",
              maxHeight: "90vh",
              overflowY: "auto",
              background: "#111827",
              border: "1px solid #253545",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
              <div>
                <div style={{ color: "#fff", fontSize: "16px", fontWeight: 700 }}>🎬 Reels — @{selectedIgAccount.username}</div>
                <div style={{ color: "#9ca3af", fontSize: "12px" }}>{selectedIgAccount.creatorName} · {igRangeLabelText}</div>
              </div>
              <button
                onClick={() => setSelectedIgAccount(null)}
                style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: "22px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>

            {selectedIgAccountReels === null ? (
              <div style={{ color: "#9ca3af", padding: "12px 0" }}>Loading reel stats…</div>
            ) : selectedIgAccountReels.length === 0 ? (
              <div style={{ color: "#9ca3af", padding: "12px 0" }}>No reels found for this account and range.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: "12px" }}>
                {selectedIgAccountReels.map((reel) => (
                  <div key={reel.reelId} style={{ border: "1px solid #253545", borderRadius: "10px", overflow: "hidden", background: "#1C2A3A" }}>
                    <div style={{ height: "120px", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {reel.thumbnailUrl ? (
                        <img src={reel.thumbnailUrl} alt="reel" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span style={{ color: "#64748b" }}>No thumbnail</span>
                      )}
                    </div>
                    <div style={{ padding: "10px", fontSize: "12px", color: "#e5e7eb", display: "grid", gap: "4px" }}>
                      <div style={{ color: "#9ca3af" }}>{reel.postedAt ? new Date(reel.postedAt).toLocaleDateString() : "Unknown post date"}</div>
                      <div>Views: <strong>{formatNumber(reel.views)}</strong></div>
                      <div>Likes: <strong>{formatNumber(reel.likes)}</strong></div>
                      <div>Comments: <strong>{formatNumber(reel.comments)}</strong></div>
                      <div>Shares: <strong>{formatNumber(reel.shares)}</strong></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
