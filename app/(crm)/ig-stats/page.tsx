"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  Tooltip,
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

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: "#1e1e1e",
        borderRadius: "16px",
        padding: "24px",
        border: "1px solid #2a2a2a",
        ...style,
      }}
    >
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

type SortKey = "creator" | "account" | "followers" | "views" | "likes" | "comments" | "shares" | "newFollowers" | "growth" | "reels";

export default function IgStatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [igDateRange, setIgDateRange] = useState<DateRange>(() => getLast7DaysEndingYesterday());
  const [igMaxDate, setIgMaxDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [igRows, setIgRows] = useState<any[]>([]);
  const [igCreatorOptions, setIgCreatorOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedIgCreator, setSelectedIgCreator] = useState<string>("all");
  const [showAllIgAccounts, setShowAllIgAccounts] = useState(false);
  const [selectedIgAccount, setSelectedIgAccount] = useState<any | null>(null);
  const [selectedIgAccountReels, setSelectedIgAccountReels] = useState<any[] | null>(null);
  const [isCompactReelGrid, setIsCompactReelGrid] = useState(false);
  const hoveredReelRef = useRef<string | null>(null);
  const [hoveredReelId, setHoveredReelId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [inactiveAccounts, setInactiveAccounts] = useState<any[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addUsername, setAddUsername] = useState("");
  const [addCreatorId, setAddCreatorId] = useState<string>("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addSaving, setAddSaving] = useState(false);
  const [creatorByIgHandle, setCreatorByIgHandle] = useState<Map<string, { id: string; name: string }>>(new Map());

  useEffect(() => {
    const raw = localStorage.getItem("crm_user");
    if (!raw) {
      router.replace("/login");
      return;
    }
    setUser(JSON.parse(raw));
  }, [router]);

  useEffect(() => {
    const updateGrid = () => setIsCompactReelGrid(window.innerWidth < 768);
    updateGrid();
    window.addEventListener("resize", updateGrid);
    return () => window.removeEventListener("resize", updateGrid);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin" && user.role !== "marketing_manager") return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);

      const [{ data: creators }, { data: maxDateResult }] = await Promise.all([
        supabase.from("crm_creators").select("id,name,instagram_username,instagram_usernames").eq("status", "active"),
        supabase.rpc("ig_max_selectable_date"),
      ]);

      const igMax = typeof maxDateResult === "string" ? maxDateResult : null;
      const effectiveRange = igMax ? clampRangeToMax(igDateRange, igMax) : igDateRange;

      if (igMax && !cancelled) {
        setIgMaxDate(igMax);
        if (effectiveRange.start !== igDateRange.start || effectiveRange.end !== igDateRange.end) {
          setIgDateRange(effectiveRange);
          return;
        }
      }

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

      const igEndPlusOne = addDays(effectiveRange.end, 1);
      const [{ data: igAccounts }, { data: igSnapshots }, { data: igReels }, { data: reelStats }] = await Promise.all([
        supabase
          .from("crm_ig_accounts")
          .select("id,creator_id,username,followers")
          .neq("is_active", false)
          .order("followers", { ascending: false }),
        supabase
          .from("crm_ig_daily_snapshots")
          .select("ig_account_id,date,followers,views,likes,comments")
          .gte("date", effectiveRange.start)
          .lte("date", igEndPlusOne),
        supabase.rpc("ig_active_reels", { p_start_date: effectiveRange.start, p_end_date: igEndPlusOne }).limit(5000),
        supabase.rpc("ig_account_reel_stats", { p_start_date: effectiveRange.start, p_end_date: effectiveRange.end }),
      ]);

      // Fetch inactive accounts separately so a failure doesn't break the page
      let inactiveData: any[] | null = null;
      try {
        const res = await supabase
          .from("crm_ig_accounts")
          .select("id,creator_id,username,followers")
          .eq("is_active", false)
          .order("username", { ascending: true });
        inactiveData = res.data;
      } catch {
        // Column may not exist or RLS may block — silently ignore
      }

      const reelStatsByAccount = new Map<string, { views: number; likes: number; comments: number; shares: number }>();
      for (const rs of reelStats ?? []) {
        reelStatsByAccount.set(rs.ig_account_id, {
          views: Number(rs.total_views || 0),
          likes: Number(rs.total_likes || 0),
          comments: Number(rs.total_comments || 0),
          shares: Number(rs.total_shares || 0),
        });
      }

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

      const igRowsData = (igAccounts ?? [])
        .map((a: any) => {
          const rows = (snapByAccount.get(a.id) ?? []).sort((x, y) => String(x.date).localeCompare(String(y.date)));
          const byDate = new Map(rows.map((r) => [String((r as any).date), r]));

          const startSnap = byDate.get(effectiveRange.start);
          const endSnap = byDate.get(igEndPlusOne) ?? (rows.length ? rows[rows.length - 1] : null);

          const startFollowers = Number(startSnap?.followers || 0);
          const endFollowers = Number(endSnap?.followers || 0);

          const followersDelta = endFollowers - startFollowers;
          const followerGrowthPct = startFollowers > 0 ? (followersDelta / startFollowers) * 100 : null;

          const accountRS = reelStatsByAccount.get(a.id);
          const viewsDelta = accountRS?.views || 0;
          const likesDelta = accountRS?.likes || 0;
          const commentsDelta = accountRS?.comments || 0;
          const sharesDelta = accountRS?.shares || 0;

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
            views: viewsDelta,
            likes: likesDelta,
            comments: commentsDelta,
            shares: sharesDelta,
            reelCount: reelCountByAccount.get(a.id) || 0,
          };
        })
        .sort((a: any, b: any) => b.views - a.views);

      if (!cancelled) {
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
        setCreatorByIgHandle(creatorByInstagram);
        setInactiveAccounts(
          (inactiveData ?? []).map((a: any) => {
            const usernameKey = String(a.username ?? "").replace(/^@/, "").toLowerCase();
            const mappedCreator = creatorByInstagram.get(usernameKey);
            const creatorId = a.creator_id ?? mappedCreator?.id ?? null;
            return {
              ...a,
              creatorId,
              creatorName: creatorNameById.get(creatorId) || mappedCreator?.name || "Unknown",
            };
          }),
        );
        setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [user, igDateRange.start, igDateRange.end]);

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
      hoveredReelRef.current = null;
      setHoveredReelId(null);
      return;
    }

    let cancelled = false;

    async function loadAccountReels() {
      setSelectedIgAccountReels(null);
      const endPlusOne = addDays(igDateRange.end, 1);
      const { data: activeReelData } = await supabase
        .rpc("ig_active_reels", {
          p_start_date: igDateRange.start,
          p_end_date: endPlusOne,
        })
        .limit(5000);

      const reels = (activeReelData ?? [])
        .filter((r: any) => r.ig_account_id === selectedIgAccount.accountId)
        .map((r: any) => ({
          reelId: r.id,
          postedAt: r.posted_at,
          thumbnailUrl: r.thumbnail_url,
          videoUrl: r.video_url,
          caption: r.caption,
          views: Math.max(0, (r.end_views || 0) - (r.start_views || 0)),
          likes: Math.max(0, (r.end_likes || 0) - (r.start_likes || 0)),
          comments: Math.max(0, (r.end_comments || 0) - (r.start_comments || 0)),
        }))
        .sort((a: any, b: any) => b.views - a.views)
        .slice(0, 50);

      if (!cancelled) {
        setSelectedIgAccountReels(reels);
      }
    }

    loadAccountReels();
    return () => {
      cancelled = true;
    };
  }, [selectedIgAccount, igDateRange.start, igDateRange.end]);

  const maxIgEnd = igMaxDate || getYesterdayDateOnly();
  const igRangeLabelText = `${new Date(igDateRange.start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${new Date(igDateRange.end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;

  const filteredIgRows = useMemo(() => {
    if (selectedIgCreator === "all") return igRows;
    return igRows.filter((row: any) => String(row.creatorId ?? "") === selectedIgCreator);
  }, [igRows, selectedIgCreator]);

  const sortedIgRows = useMemo(() => {
    const rows = [...filteredIgRows];
    const getVal = (row: any) => {
      switch (sortKey) {
        case "creator":
          return String(row.creatorName || "").toLowerCase();
        case "account":
          return String(row.username || "").toLowerCase();
        case "followers":
          return Number(row.followers || 0);
        case "views":
          return Number(row.views || 0);
        case "likes":
          return Number(row.likes || 0);
        case "comments":
          return Number(row.comments || 0);
        case "shares":
          return Number(row.shares || 0);
        case "newFollowers":
          return Number(row.followersDelta || 0);
        case "growth":
          return Number(row.followerGrowthPct ?? -999999);
        case "reels":
          return Number(row.reelCount || 0);
        default:
          return 0;
      }
    };

    rows.sort((a, b) => {
      const va = getVal(a);
      const vb = getVal(b);
      if (typeof va === "string" && typeof vb === "string") {
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === "asc" ? Number(va) - Number(vb) : Number(vb) - Number(va);
    });

    return rows;
  }, [filteredIgRows, sortKey, sortDir]);

  const displayedIgRows = useMemo(() => {
    return showAllIgAccounts ? sortedIgRows : sortedIgRows.slice(0, 10);
  }, [sortedIgRows, showAllIgAccounts]);

  const igDonutData = useMemo(() => {
    const rows = filteredIgRows;
    if (selectedIgCreator !== "all") {
      const viewsData = rows.slice(0, 30).map((row: any, i: number) => ({
        name: `@${row.username}`,
        value: Math.max(0, Number(row.views || 0)),
        color: CREATOR_COLORS[i % CREATOR_COLORS.length],
      }));
      const followersData = rows.slice(0, 30).map((row: any, i: number) => ({
        name: `@${row.username}`,
        value: Math.max(0, Number(row.followersDelta || 0)),
        color: CREATOR_COLORS[i % CREATOR_COLORS.length],
      }));
      return { viewsData, followersData };
    }

    const byCreator = new Map<string, { views: number; followers: number }>();
    for (const row of rows) {
      const key = row.creatorName || "Unknown";
      if (!byCreator.has(key)) byCreator.set(key, { views: 0, followers: 0 });
      const c = byCreator.get(key)!;
      c.views += Math.max(0, Number(row.views || 0));
      c.followers += Math.max(0, Number(row.followersDelta || 0));
    }

    const entries = Array.from(byCreator.entries()).sort((a, b) => b[1].views - a[1].views);
    const viewsData = entries.map(([name, d], i) => ({ name, value: d.views, color: CREATOR_COLORS[i % CREATOR_COLORS.length] }));
    const followersData = entries.map(([name, d], i) => ({ name, value: d.followers, color: CREATOR_COLORS[i % CREATOR_COLORS.length] }));

    return { viewsData, followersData };
  }, [filteredIgRows, selectedIgCreator]);

  const onSort = (nextKey: SortKey) => {
    if (sortKey === nextKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextKey);
    setSortDir("desc");
  };

  if (!user) return null;
  if (user.role !== "admin" && user.role !== "marketing_manager") {
    return (
      <div style={{ padding: 24, color: "var(--text)" }}>
        🔒 This page is for marketing managers and admins.
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      <div style={{ marginBottom: "24px" }}>
        <Card style={{ marginBottom: "24px", overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
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
                    <option key={creator.id} value={creator.id}>
                      {creator.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => { setShowAddAccount(true); setAddUsername(""); setAddCreatorId(""); setAddError(null); }}
                  style={{
                    background: "#1c4a2e", border: "1px solid #166534", color: "#4ade80",
                    borderRadius: "8px", padding: "7px 14px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                  }}
                >
                  + Add Account
                </button>
                <DateRangePicker value={igDateRange} onChange={(next) => setIgDateRange(clampRangeToMax(next, maxIgEnd))} />
              </div>
              <span style={{ fontSize: "11px", color: "#666" }}>IG data available through: {maxIgEnd}</span>
            </div>
          </div>

          {(() => {
            const filtered = selectedIgCreator === "all"
              ? inactiveAccounts
              : inactiveAccounts.filter((a: any) => a.creatorId === selectedIgCreator);
            if (filtered.length === 0) return null;
            return (
              <div style={{
                background: "#2a1a0a",
                border: "1px solid #78350f",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 16,
              }}>
                <div
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
                  onClick={() => setShowInactive(!showInactive)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "#fbbf24", fontSize: 16 }}>!</span>
                    <span style={{ color: "#fbbf24", fontSize: 13, fontWeight: 700 }}>
                      {filtered.length} inactive account{filtered.length !== 1 ? "s" : ""} — may need review
                    </span>
                  </div>
                  <span style={{ color: "#92400e", fontSize: 12 }}>{showInactive ? "Hide" : "Show details"}</span>
                </div>
                {showInactive && (
                  <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.map((a: any) => (
                      <div key={a.id} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: "#1a1206", borderRadius: 8, padding: "8px 12px",
                      }}>
                        <span style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13, minWidth: 120 }}>@{a.username}</span>
                        <span style={{ color: "#a1a1a1", fontSize: 12 }}>{a.creatorName}</span>
                        <span style={{ color: "#78716c", fontSize: 11, marginLeft: "auto" }}>
                          {a.followers ? `${formatNumber(a.followers)} followers` : "—"}
                        </span>
                        <a
                          href={`https://instagram.com/${a.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            background: "#1a1a2e", border: "1px solid #312e81", color: "#a78bfa",
                            borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                            textDecoration: "none",
                          }}
                        >
                          Open IG
                        </a>
                        <button
                          onClick={async () => {
                            await supabase.from("crm_ig_accounts").update({ is_active: true }).eq("id", a.id);
                            setInactiveAccounts((prev) => prev.filter((x: any) => x.id !== a.id));
                          }}
                          style={{
                            background: "#1c4a2e", border: "1px solid #166534", color: "#4ade80",
                            borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          Reactivate
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Permanently delete @${a.username} and all its data (snapshots, reels, funnels)? This cannot be undone.`)) return;
                            await supabase.from("crm_ig_accounts").delete().eq("id", a.id);
                            setInactiveAccounts((prev) => prev.filter((x: any) => x.id !== a.id));
                          }}
                          style={{
                            background: "#2a1215", border: "1px solid #7f1d1d", color: "#f87171",
                            borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                    <div style={{ color: "#78716c", fontSize: 11, marginTop: 4 }}>
                      Accounts marked inactive when the scraper gets a 404 from Instagram. This may mean the account is banned, suspended, or the username changed. Reactivating will retry on the next scrape cycle.
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {igRows.length > 0 && (() => {
            const filtered = selectedIgCreator === "all" ? igRows : igRows.filter((r: any) => r.creatorId === selectedIgCreator);
            const sumViews = filtered.reduce((s: number, r: any) => s + (r.views || 0), 0);
            const sumLikes = filtered.reduce((s: number, r: any) => s + (r.likes || 0), 0);
            const sumComments = filtered.reduce((s: number, r: any) => s + (r.comments || 0), 0);
            const sumShares = filtered.reduce((s: number, r: any) => s + (r.shares || 0), 0);
            const sumFollowers = filtered.reduce((s: number, r: any) => s + (r.followersDelta || 0), 0);
            const sumReels = filtered.reduce((s: number, r: any) => s + (r.reelCount || 0), 0);
            const kpis = [
              { label: "All Views", value: formatNumber(sumViews) },
              { label: "All Likes", value: formatNumber(sumLikes) },
              { label: "New Followers", value: (sumFollowers >= 0 ? "+" : "") + formatNumber(sumFollowers) },
              { label: "All Shares", value: formatNumber(sumShares) },
              { label: "Reels Posted", value: String(sumReels) },
              { label: "All Comments", value: formatNumber(sumComments) },
            ];
            return (
              <div style={{ background: "#1C2A3A", borderRadius: 14, padding: 24, border: "1px solid #253545", marginBottom: 16 }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 18, fontWeight: 700, color: "#fff" }}>Accounts summarized</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {kpis.map((k) => (
                    <div key={k.label} style={{ background: "#0f1a2a", border: "1px solid #253545", borderRadius: 10, padding: "16px 20px" }}>
                      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff" }}>{k.value}</div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {(igDonutData.viewsData.length > 0 || igDonutData.followersData.length > 0) && (
            <div
              style={{
                background: "#1C2A3A",
                borderRadius: "14px",
                padding: "24px",
                border: "1px solid #253545",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
                <DonutWithLegend title="Views Comparison" data={igDonutData.viewsData} />
                <DonutWithLegend title="New Followers Comparison" data={igDonutData.followersData} />
              </div>
            </div>
          )}

          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "1120px" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid #2a2a2a" }}>
                {[
                  { label: "Creator", key: "creator" as SortKey },
                  { label: "Account", key: "account" as SortKey },
                  { label: "Followers", key: "followers" as SortKey },
                  { label: "Views", key: "views" as SortKey },
                  { label: "Likes", key: "likes" as SortKey },
                  { label: "Comments", key: "comments" as SortKey },
                  { label: "Shares", key: "shares" as SortKey },
                  { label: "New Followers", key: "newFollowers" as SortKey },
                  { label: "Growth %", key: "growth" as SortKey },
                  { label: "Reels", key: "reels" as SortKey },
                ].map((h) => (
                  <th
                    key={h.label}
                    style={{ padding: "10px", fontSize: "12px", color: "#a0a0a0", cursor: "pointer", userSelect: "none" }}
                    onClick={() => onSort(h.key)}
                  >
                    {h.label} {sortKey === h.key ? (sortDir === "asc" ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} style={{ color: "#9ca3af", padding: "16px", textAlign: "center" }}>
                    Loading IG analytics…
                  </td>
                </tr>
              ) : displayedIgRows.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ color: "#6b7280", padding: "16px", textAlign: "center" }}>
                    No IG accounts for selected filters.
                  </td>
                </tr>
              ) : (
                displayedIgRows.map((r: any) => (
                  <tr key={r.accountId} style={{ borderBottom: "1px solid #242424", cursor: "pointer" }} onClick={() => setSelectedIgAccount(r)}>
                    <td style={{ padding: "10px", color: "#fff" }}>{r.creatorName}</td>
                    <td style={{ padding: "10px", color: "#a0a0a0" }}>@{r.username}</td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.followers || 0)}</td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.views || 0)}</td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.likes || 0)}</td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.comments || 0)}</td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.shares || 0)}</td>
                    <td style={{ padding: "10px", color: r.followersDelta >= 0 ? "#22c55e" : "#ef4444" }}>
                      {r.followersDelta >= 0 ? "+" : ""}
                      {formatNumber(r.followersDelta || 0)}
                    </td>
                    <td style={{ padding: "10px", color: "#fff" }}>
                      {r.followerGrowthPct === null ? "—" : `${r.followerGrowthPct >= 0 ? "+" : ""}${r.followerGrowthPct.toFixed(1)}%`}
                    </td>
                    <td style={{ padding: "10px", color: "#fff" }}>{formatNumber(r.reelCount || 0)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!showAllIgAccounts && sortedIgRows.length > 10 && (
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
                Show more ({sortedIgRows.length - 10} remaining)
              </button>
            </div>
          )}
        </Card>
      </div>

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
                <div style={{ color: "#9ca3af", fontSize: "12px" }}>
                  {selectedIgAccount.creatorName} · {igRangeLabelText}
                </div>
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isCompactReelGrid ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                  gap: "12px",
                }}
              >
                {selectedIgAccountReels.map((reel) => {
                  const isHovered = hoveredReelId === reel.reelId;
                  return (
                    <div
                      key={reel.reelId}
                      onMouseEnter={() => {
                        hoveredReelRef.current = reel.reelId;
                        setHoveredReelId(reel.reelId);
                      }}
                      onMouseLeave={(event) => {
                        const video = event.currentTarget.querySelector("video") as HTMLVideoElement | null;
                        if (video) video.pause();
                        if (hoveredReelRef.current === reel.reelId) {
                          hoveredReelRef.current = null;
                          setHoveredReelId(null);
                        }
                      }}
                      style={{
                        border: "1px solid #2a2a2a",
                        borderRadius: "12px",
                        overflow: "hidden",
                        background: "#1e1e1e",
                        transition: "transform 0.18s ease, box-shadow 0.18s ease",
                        transform: isHovered ? "scale(1.02)" : "scale(1)",
                        boxShadow: isHovered ? "0 10px 24px rgba(0,0,0,0.35)" : "none",
                      }}
                    >
                      <div style={{ position: "relative", aspectRatio: "9 / 16", background: "#2f2f2f" }}>
                        {reel.thumbnailUrl ? (
                          <img
                            src={reel.thumbnailUrl}
                            alt={reel.caption ? String(reel.caption).slice(0, 80) : "Reel thumbnail"}
                            loading="lazy"
                            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "10px" }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              height: "100%",
                              background: "#3a3a3a",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: "10px",
                              textAlign: "center",
                              color: "#bdbdbd",
                              fontSize: "12px",
                            }}
                          >
                            {reel.caption || "No thumbnail available"}
                          </div>
                        )}
                        {isHovered && reel.videoUrl && (
                          <video
                            muted
                            autoPlay
                            loop
                            playsInline
                            src={reel.videoUrl}
                            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        )}
                      </div>
                      <div style={{ padding: "10px" }}>
                        <div
                          style={{
                            color: "#ccc",
                            fontSize: "13px",
                            lineHeight: 1.35,
                            marginBottom: "8px",
                            minHeight: "34px",
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {reel.caption || "No caption"}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", color: "#999", fontSize: "11px" }}>
                          <span>👁 {formatNumber(reel.views)}</span>
                          <span>❤️ {formatNumber(reel.likes)}</span>
                          <span>💬 {formatNumber(reel.comments)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {showAddAccount && (
        <div
          onClick={() => setShowAddAccount(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(480px, 100%)", background: "#111827", border: "1px solid #253545",
              borderRadius: "12px", padding: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <div style={{ color: "#fff", fontSize: "16px", fontWeight: 700 }}>Add Instagram Account</div>
              <button
                onClick={() => setShowAddAccount(false)}
                style={{ background: "transparent", border: "none", color: "#9ca3af", fontSize: "22px", cursor: "pointer" }}
              >
                x
              </button>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginBottom: "6px" }}>Username</label>
              <input
                type="text"
                value={addUsername}
                onChange={(e) => {
                  const val = e.target.value.replace(/^@/, "").replace(/\s/g, "").toLowerCase();
                  setAddUsername(val);
                  setAddError(null);
                  // Auto-detect creator from instagram_usernames mapping
                  const match = creatorByIgHandle.get(val);
                  if (match) {
                    setAddCreatorId(match.id);
                  }
                }}
                placeholder="e.g. blondenervensaege"
                style={{
                  width: "100%", background: "#1C2A3A", color: "#fff", border: "1px solid #253545",
                  borderRadius: "8px", padding: "10px 12px", fontSize: "14px", boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ color: "#9ca3af", fontSize: "12px", display: "block", marginBottom: "6px" }}>Creator</label>
              <select
                value={addCreatorId}
                onChange={(e) => setAddCreatorId(e.target.value)}
                style={{
                  width: "100%", background: "#1C2A3A", color: "#fff", border: "1px solid #253545",
                  borderRadius: "8px", padding: "10px 12px", fontSize: "14px", boxSizing: "border-box",
                }}
              >
                <option value="">— Select creator —</option>
                {igCreatorOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {addError && (
              <div style={{ color: "#f87171", fontSize: "12px", marginBottom: "12px", padding: "8px 12px", background: "#2a1215", borderRadius: "8px", border: "1px solid #7f1d1d" }}>
                {addError}
              </div>
            )}

            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowAddAccount(false)}
                style={{
                  background: "transparent", border: "1px solid #374151", color: "#9ca3af",
                  borderRadius: "8px", padding: "8px 16px", fontSize: "13px", cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                disabled={addSaving || !addUsername.trim()}
                onClick={async () => {
                  const username = addUsername.trim().replace(/^@/, "").toLowerCase();
                  if (!username) return;

                  setAddSaving(true);
                  setAddError(null);

                  try {
                    // Check if account already exists
                    const { data: existing } = await supabase
                      .from("crm_ig_accounts")
                      .select("id,username,is_active")
                      .eq("username", username)
                      .maybeSingle();

                    if (existing) {
                      if (existing.is_active === false) {
                        // Reactivate existing inactive account
                        await supabase.from("crm_ig_accounts").update({ is_active: true }).eq("id", existing.id);
                        setInactiveAccounts((prev) => prev.filter((a: any) => a.id !== existing.id));
                        setShowAddAccount(false);
                        // Trigger data reload
                        setIgDateRange({ ...igDateRange });
                        return;
                      }
                      setAddError(`@${username} is already being tracked.`);
                      return;
                    }

                    // Insert new account
                    const { error } = await supabase.from("crm_ig_accounts").insert({
                      supabase_id: `manual-${username}`,
                      username,
                      creator_id: addCreatorId || null,
                      followers: 0,
                      following: 0,
                      media_count: 0,
                      is_active: true,
                    });

                    if (error) {
                      setAddError(error.message);
                      return;
                    }

                    setShowAddAccount(false);
                    // Trigger data reload
                    setIgDateRange({ ...igDateRange });
                  } catch (err: any) {
                    setAddError(err.message || "Failed to add account");
                  } finally {
                    setAddSaving(false);
                  }
                }}
                style={{
                  background: addSaving || !addUsername.trim() ? "#1a3a2a" : "#1c4a2e",
                  border: "1px solid #166534", color: "#4ade80",
                  borderRadius: "8px", padding: "8px 20px", fontSize: "13px", fontWeight: 700,
                  cursor: addSaving || !addUsername.trim() ? "not-allowed" : "pointer",
                  opacity: addSaving || !addUsername.trim() ? 0.5 : 1,
                }}
              >
                {addSaving ? "Adding..." : "Add Account"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
