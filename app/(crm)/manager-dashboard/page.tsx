"use client";

import { useEffect, useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import DateRangePicker, { DateRange } from "../../../components/DateRangePicker";
import TrackingLinksCard from "./TrackingLinksCard";

const CHART_COLORS = [
  "#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#a855f7",
  "#6366f1", "#84cc16", "#e11d48", "#0891b2", "#d946ef",
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

/* ═══════════════════════════════════════════════════════════
   SECTION A: Subscriber Stats (original, restored)
   ═══════════════════════════════════════════════════════════ */

function SubscriberCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: "var(--surface, #253545)", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted, #8899AA)" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const selectStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #3a4a5a)", background: "var(--surface, #253545)", color: "var(--text, #fff)" };
const pillStyle: React.CSSProperties = { border: "1px solid var(--border, #3a4a5a)", background: "var(--surface, #253545)", color: "var(--text, #fff)", borderRadius: 999, padding: "8px 12px", cursor: "pointer" };
const thStyleSub: React.CSSProperties = { textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border, #253545)" };
const tdStyleSub: React.CSSProperties = { padding: "8px", borderBottom: "1px solid var(--border-subtle, #1C2A3A)" };

function SubscriberStatsSection({ token }: { token: string }) {
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");
  const [selectedAccount, setSelectedAccount] = useState<string>("");

  const stats = useQuery(api.crm.managerDashboard.getSubscriberStats, token ? { token } : "skip");
  const health = useQuery(api.crm.managerDashboard.getAccountHealth, token ? { token } : "skip");
  const trends = useQuery(
    api.crm.managerDashboard.getSubTrends,
    token ? { token, period, accountId: selectedAccount || undefined } : "skip"
  );

  const maxTrend = useMemo(() => {
    const vals = (trends?.dataPoints || []).flatMap((d: any) => [d.newSubs, d.rebills]);
    return Math.max(1, ...(vals.length ? vals : [1]));
  }, [trends]);

  const accounts = stats?.accounts || [];

  if (accounts.length === 0) {
    return (
      <div style={{ background: "var(--surface, #253545)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
        No models assigned yet. Contact your admin.
      </div>
    );
  }

  return (
    <>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={selectStyle}>
          <option value="">All assigned models</option>
          {accounts.map((a: any) => <option key={a.accountId} value={a.accountId}>{a.displayName}</option>)}
        </select>
        {(["7d", "30d", "90d"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} style={{ ...pillStyle, opacity: period === p ? 1 : 0.6 }}>{p}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 16 }}>
        <SubscriberCard title="New Subs (Range)" value={stats?.totals.newSubsInRange ?? 0} />
        {health?.accounts && (
          <>
            <SubscriberCard title="Total Fans" value={health.accounts.reduce((s: number, a: any) => s + a.totalFans, 0)} />
            <SubscriberCard title="Active Fans" value={health.accounts.reduce((s: number, a: any) => s + a.activeFans, 0)} />
            <SubscriberCard title="Unread Chats" value={health.accounts.reduce((s: number, a: any) => s + a.unreadChats, 0)} />
          </>
        )}
      </div>

      <div style={{ background: "var(--surface, #253545)", borderRadius: 16, padding: 16, marginBottom: 16 }}>
        <h3 style={{ marginBottom: 10 }}>Sub Trends</h3>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, trends?.dataPoints?.length || 1)}, minmax(10px, 1fr))`, gap: 4, alignItems: "end", minHeight: 140 }}>
          {(trends?.dataPoints || []).map((d: any) => (
            <div key={d.date} title={`${d.date} • new ${d.newSubs} • rebills ${d.rebills}`}>
              <div style={{ background: "#60a5fa", height: `${Math.max(4, (d.newSubs / maxTrend) * 100)}px`, borderRadius: 3 }} />
              <div style={{ background: "#34d399", height: `${Math.max(4, (d.rebills / maxTrend) * 100)}px`, borderRadius: 3, marginTop: 2 }} />
            </div>
          ))}
        </div>
      </div>

      <div style={{ background: "var(--surface, #253545)", borderRadius: 16, padding: 16, overflowX: "auto", marginBottom: 24 }}>
        <h3 style={{ marginBottom: 10 }}>Account Health</h3>
        <table style={{ width: "100%", minWidth: 700, borderCollapse: "collapse" }}>
          <thead><tr>{["Model", "Total Fans", "Active Fans", "Avg Lifetime (d)", "Response Rate %", "Unread"].map((h) => <th key={h} style={thStyleSub}>{h}</th>)}</tr></thead>
          <tbody>
            {(health?.accounts || []).map((row: any) => (
              <tr key={row.accountId}>
                <td style={tdStyleSub}>{row.displayName}</td>
                <td style={tdStyleSub}>{row.totalFans}</td>
                <td style={tdStyleSub}>{row.activeFans}</td>
                <td style={tdStyleSub}>{row.avgFanLifetimeDays}</td>
                <td style={tdStyleSub}>{row.chatResponseRate}</td>
                <td style={tdStyleSub}>{row.unreadChats}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION B: Instagram Analytics
   ═══════════════════════════════════════════════════════════ */

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{
      background: "#253545", borderRadius: "12px", padding: "16px",
      display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <div style={{ fontSize: "11px", color: "#8899AA", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "22px", fontWeight: 700, color: color || "#fff" }}>
        {value}
      </div>
    </div>
  );
}

function DonutWithLegend({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: "1 1 280px", minWidth: "250px" }}>
      <div style={{ fontSize: "12px", color: "#8899AA", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>{title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "140px", height: "140px", flexShrink: 0 }}>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.filter(d => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={40} outerRadius={65} strokeWidth={0}>
                  {data.filter(d => d.value > 0).map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                </Pie>
                <Tooltip formatter={(value) => formatNumber(Number(value ?? 0))} contentStyle={{ background: "#1C2A3A", border: "1px solid #2a3a4a", borderRadius: "8px", fontSize: "12px", color: "#fff" }} itemStyle={{ color: "#fff" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#8899AA", fontSize: "12px" }}>No data</div>
          )}
        </div>
        <div style={{ flex: 1, maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "4px", paddingRight: "4px" }}>
          {data.map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: entry.color, flexShrink: 0 }} />
              <span style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{entry.name}</span>
              <span style={{ color: "#8899AA", flexShrink: 0 }}>{total > 0 ? Math.round((entry.value / total) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReelCard({ reel }: { reel: any }) {
  const dateStr = reel.postedAt ? new Date(reel.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;
  return (
    <div style={{ flex: "0 0 160px", background: "#1C2A3A", borderRadius: "10px", overflow: "hidden", border: "1px solid #253545" }}>
      <div style={{
        width: "100%", aspectRatio: "9/16", background: "#0F1923",
        backgroundImage: reel.thumbnailUrl ? `url(${reel.thumbnailUrl})` : undefined,
        backgroundSize: "cover", backgroundPosition: "center", position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!reel.thumbnailUrl && <span style={{ fontSize: "32px", color: "#253545" }}>🎬</span>}
        {dateStr && (
          <div style={{ position: "absolute", top: "6px", left: "6px", background: "rgba(0,0,0,0.7)", borderRadius: "6px", padding: "3px 7px", fontSize: "10px", fontWeight: 600, color: "#fff" }}>{dateStr}</div>
        )}
      </div>
      <div style={{ padding: "10px", display: "flex", gap: "10px", fontSize: "11px" }}>
        <span style={{ color: "#22c55e" }}>▶ {formatNumber(reel.views ?? 0)}</span>
        <span style={{ color: "#22c55e" }}>♥ {formatNumber(reel.likes ?? 0)}</span>
        <span style={{ color: "#22c55e" }}>💬 {formatNumber(reel.comments ?? 0)}</span>
      </div>
    </div>
  );
}

type VideoSort = "views" | "likes" | "comments" | "date";

function TopVideosSection({ token, accountId, startDate, endDate }: { token: string; accountId: any; startDate: string; endDate: string }) {
  const [sortBy, setSortBy] = useState<VideoSort>("views");

  const reels = useQuery(
    api.crm.igQueries.getIgReels,
    token ? { token, igAccountId: accountId, sortBy, order: "desc" as const, limit: 10, startDate, endDate } : "skip"
  );

  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {(["views", "likes", "comments", "date"] as VideoSort[]).map((field) => (
          <button key={field} onClick={() => setSortBy(field)} style={{
            background: sortBy === field ? "#253545" : "transparent",
            border: "1px solid", borderColor: sortBy === field ? "#3a4a5a" : "#253545",
            borderRadius: "16px", padding: "4px 12px", fontSize: "11px",
            fontWeight: sortBy === field ? 600 : 400, color: sortBy === field ? "#fff" : "#8899AA",
            cursor: "pointer", textTransform: "capitalize",
          }}>{field}</button>
        ))}
      </div>
      <div style={{ fontSize: "10px", color: "#8899AA", marginBottom: "8px" }}>
        📊 Showing cumulative totals per reel (daily deltas not yet available)
      </div>
      {!reels?.length ? (
        <div style={{ color: "#8899AA", fontSize: "12px", padding: "20px 0", textAlign: "center" }}>No reels in this date range</div>
      ) : (
        <div style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
          {reels.map((reel: any) => (<ReelCard key={reel._id} reel={reel} />))}
        </div>
      )}
    </div>
  );
}

function AccountRow({ account, stats, token, startDate, endDate }: {
  account: any;
  stats: { views: number; likes: number; comments: number; shares: number; reelCount: number };
  token: string;
  startDate: string;
  endDate: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", borderBottom: expanded ? "none" : "1px solid #253545" }}
        onMouseEnter={(e) => { for (const cell of Array.from(e.currentTarget.children)) (cell as HTMLElement).style.background = "#253545"; }}
        onMouseLeave={(e) => { for (const cell of Array.from(e.currentTarget.children)) (cell as HTMLElement).style.background = "transparent"; }}
      >
        <td style={{ padding: "14px 12px", transition: "background 0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "10px", color: "#8899AA", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
            {account.profilePicUrl ? (
              <img src={account.profilePicUrl} alt="" style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#253545", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>📷</div>
            )}
            <div>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>{account.creatorName || account.username}</div>
              <div style={{ display: "inline-block", marginTop: "2px", padding: "1px 6px", fontSize: "10px", fontWeight: 600, color: "#E1306C", background: "rgba(225,48,108,0.1)", borderRadius: "4px" }}>
                @{account.username}
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>{formatNumber(stats.views)}</td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>{formatNumber(stats.likes)}</td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>{formatNumber(stats.comments)}</td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 600, transition: "background 0.15s" }}>{stats.reelCount}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} style={{ padding: "0 16px 16px", background: "#162230", borderBottom: "1px solid #253545" }}>
            <TopVideosSection token={token} accountId={account._id} startDate={startDate} endDate={endDate} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function ManagerDashboardPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(30));
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const creatorIdArg = creatorFilter !== "all" ? creatorFilter as any : undefined;

  const accounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token, creatorId: creatorIdArg } : "skip"
  );

  const allAccounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token } : "skip"
  );

  // New: aggregated reel stats per account within date range, sorted by views desc
  const reelStats = useQuery(
    api.crm.igQueries.getIgAccountReelStats,
    token ? { token, startDate: dateRange.start, endDate: dateRange.end, creatorId: creatorIdArg } : "skip"
  );

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return <div style={{ padding: 24, color: "#fff" }}>🔒 This dashboard is for marketing managers only.</div>;
  }

  const creatorOptions: { id: string; name: string }[] = (() => {
    if (!allAccounts) return [];
    const seen = new Map<string, string>();
    for (const a of allAccounts as any[]) {
      if (a.creatorId && a.creatorName) seen.set(String(a.creatorId), a.creatorName);
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  })();

  // Build account map for lookup
  const accountMap = useMemo(() => {
    if (!accounts) return new Map();
    return new Map((accounts as any[]).map((a: any) => [String(a._id), a]));
  }, [accounts]);

  // Sorted accounts by views desc (from reelStats)
  const sortedAccounts = useMemo(() => {
    if (!reelStats?.byAccount || !accounts) return [];
    return reelStats.byAccount
      .map((s: any) => ({ account: accountMap.get(s.accountId), stats: s }))
      .filter((x: any) => x.account);
  }, [reelStats, accounts, accountMap]);

  // Donut data from reelStats
  const { viewsData, likesData } = useMemo(() => {
    const viewsData: { name: string; value: number; color: string }[] = [];
    const likesData: { name: string; value: number; color: string }[] = [];
    if (!reelStats?.byAccount) return { viewsData, likesData };

    reelStats.byAccount.forEach((s: any, i: number) => {
      const account = accountMap.get(s.accountId);
      const name = account?.creatorName || account?.username || "Unknown";
      const color = CHART_COLORS[i % CHART_COLORS.length];
      viewsData.push({ name, value: s.views, color });
      likesData.push({ name, value: s.likes, color });
    });

    return { viewsData, likesData };
  }, [reelStats, accountMap]);

  const totals = reelStats?.totals;

  return (
    <div style={{ maxWidth: "1400px", color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>📈 Traffic Dashboard</h1>
      <p style={{ color: "#8899AA", marginBottom: 20 }}>Subscriber stats & social media analytics</p>

      {/* ═══ TOP: Subscriber Stats ═══ */}
      <SubscriberStatsSection token={token} />

      {/* ═══ Tracking Links ═══ */}
      <div style={{ marginBottom: "24px" }}>
        <TrackingLinksCard token={token} isAdmin={user.role === "admin"} />
      </div>

      {/* ═══ BOTTOM: Instagram Analytics ═══ */}
      <div style={{ borderTop: "2px solid #253545", paddingTop: "24px", marginTop: "8px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: 700, margin: 0 }}>📱 Instagram Analytics</h2>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <select
              value={creatorFilter}
              onChange={(e) => setCreatorFilter(e.target.value)}
              style={{ background: "#253545", color: "#fff", border: "1px solid #3a4a5a", borderRadius: "8px", padding: "8px 12px", fontSize: "13px", cursor: "pointer", outline: "none" }}
            >
              <option value="all">All Creators</option>
              {creatorOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        <div style={{ fontSize: "11px", color: "#8899AA", marginBottom: "16px", padding: "8px 12px", background: "#253545", borderRadius: "8px", display: "inline-block" }}>
          ℹ️ Stats are cumulative totals for reels posted in the selected date range. Daily gain tracking coming soon.
        </div>

        {/* Accounts Summarized */}
        <div style={{ background: "#1C2A3A", borderRadius: "16px", padding: "24px", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: "0 0 16px 0" }}>Accounts Summarized</h3>
          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", flex: "0 0 320px", minWidth: "280px" }}>
              <StatCard label="Total Views" value={formatNumber(totals?.views ?? 0)} color="#22c55e" />
              <StatCard label="Total Likes" value={formatNumber(totals?.likes ?? 0)} color="#22c55e" />
              <StatCard label="Total Comments" value={formatNumber(totals?.comments ?? 0)} />
              <StatCard label="Reels Posted" value={formatNumber(totals?.reelCount ?? 0)} />
            </div>
            {viewsData.length > 0 && (
              <div style={{ display: "flex", gap: "24px", flex: 1, flexWrap: "wrap" }}>
                <DonutWithLegend title="Views by account" data={viewsData} />
                <DonutWithLegend title="Likes by account" data={likesData} />
              </div>
            )}
          </div>
        </div>

        {/* Accounts Table — sorted by views desc */}
        <div style={{ background: "#1C2A3A", borderRadius: "16px", padding: "24px", marginBottom: "24px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 16px 0" }}>
            Accounts <span style={{ fontSize: "12px", color: "#8899AA", fontWeight: 400 }}>ranked by views</span>
          </h3>
          {sortedAccounts.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "700px" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #253545" }}>
                    {["ACCOUNT", "VIEWS", "LIKES", "COMMENTS", "REELS"].map((h) => (
                      <th key={h} style={{ padding: "12px", fontSize: "11px", color: "#8899AA", fontWeight: 600, textAlign: "left", textTransform: "uppercase", letterSpacing: "0.5px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAccounts.map(({ account, stats: s }: any) => (
                    <AccountRow key={account._id} account={account} stats={s} token={token} startDate={dateRange.start} endDate={dateRange.end} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ color: "#8899AA", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
              {accounts === undefined ? "Loading…" : "No reels found in this date range"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
