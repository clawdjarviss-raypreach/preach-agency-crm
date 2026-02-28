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
   SECTION A: Original Subscriber Stats
   ═══════════════════════════════════════════════════════════ */

function SubscriberCard({ title, value }: { title: string; value: number }) {
  return (
    <div style={{ background: "var(--surface, #253545)", borderRadius: 14, padding: 14 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted, #8899AA)" }}>{title}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border, #3a4a5a)", background: "var(--surface, #253545)", color: "var(--text, #fff)" };
const pillStyle: React.CSSProperties = { border: "1px solid var(--border, #3a4a5a)", background: "var(--surface, #253545)", color: "var(--text, #fff)", borderRadius: 999, padding: "8px 12px", cursor: "pointer" };
const thStyle: React.CSSProperties = { textAlign: "left", padding: "8px", borderBottom: "1px solid var(--border, #253545)" };
const tdStyle: React.CSSProperties = { padding: "8px", borderBottom: "1px solid var(--border-subtle, #1C2A3A)" };

function SubscriberStatsSection({ token, user }: { token: string; user: any }) {
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
        <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)} style={inputStyle}>
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
          <thead><tr>{["Model", "Total Fans", "Active Fans", "Avg Lifetime (d)", "Response Rate %", "Unread"].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
          <tbody>
            {(health?.accounts || []).map((row: any) => (
              <tr key={row.accountId}>
                <td style={tdStyle}>{row.displayName}</td>
                <td style={tdStyle}>{row.totalFans}</td>
                <td style={tdStyle}>{row.activeFans}</td>
                <td style={tdStyle}>{row.avgFanLifetimeDays}</td>
                <td style={tdStyle}>{row.chatResponseRate}</td>
                <td style={tdStyle}>{row.unreadChats}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   SECTION B: Instagram / Reels Analytics (new addition)
   ═══════════════════════════════════════════════════════════ */

/* ─── Stat Card ─── */
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
      <div style={{ fontSize: "12px", color: "#8899AA", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {title}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
        <div style={{ width: "140px", height: "140px", flexShrink: 0 }}>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.filter(d => d.value > 0)}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={65}
                  strokeWidth={0}
                >
                  {data.filter(d => d.value > 0).map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatNumber(Number(value ?? 0))}
                  contentStyle={{ background: "#1C2A3A", border: "1px solid #2a3a4a", borderRadius: "8px", fontSize: "12px", color: "#fff" }}
                  itemStyle={{ color: "#fff" }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#8899AA", fontSize: "12px" }}>
              No data
            </div>
          )}
        </div>
        <div style={{
          flex: 1, maxHeight: "140px", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: "4px",
          paddingRight: "4px",
        }}>
          {data.map((entry, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: entry.color, flexShrink: 0 }} />
              <span style={{ color: "#ccc", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {entry.name}
              </span>
              <span style={{ color: "#8899AA", flexShrink: 0 }}>
                {total > 0 ? Math.round((entry.value / total) * 100) : 0}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Reel Card ─── */
function ReelCard({ reel }: { reel: any }) {
  const dateStr = reel.postedAt
    ? new Date(reel.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  return (
    <div style={{
      flex: "0 0 160px", background: "#1C2A3A", borderRadius: "10px",
      overflow: "hidden", border: "1px solid #253545",
    }}>
      <div style={{
        width: "100%", aspectRatio: "9/16", background: "#0F1923",
        backgroundImage: reel.thumbnailUrl ? `url(${reel.thumbnailUrl})` : undefined,
        backgroundSize: "cover", backgroundPosition: "center",
        position: "relative",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!reel.thumbnailUrl && (
          <span style={{ fontSize: "32px", color: "#253545" }}>🎬</span>
        )}
        {dateStr && (
          <div style={{
            position: "absolute", top: "6px", left: "6px",
            background: "rgba(0,0,0,0.7)", borderRadius: "6px",
            padding: "3px 7px", fontSize: "10px", fontWeight: 600, color: "#fff",
          }}>
            {dateStr}
          </div>
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

/* ─── Top Videos Section (per account) ─── */
type VideoSort = "views" | "likes" | "comments" | "date";

function TopVideosSection({ token, accountId }: { token: string; accountId: any }) {
  const [sortBy, setSortBy] = useState<VideoSort>("views");

  const reels = useQuery(
    api.crm.igQueries.getIgReels,
    token
      ? {
          token,
          igAccountId: accountId,
          sortBy,
          order: "desc" as const,
          limit: 10,
        }
      : "skip"
  );

  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", gap: "4px", marginBottom: "12px" }}>
        {(["views", "likes", "comments", "date"] as VideoSort[]).map((field) => (
          <button
            key={field}
            onClick={() => setSortBy(field)}
            style={{
              background: sortBy === field ? "#253545" : "transparent",
              border: "1px solid",
              borderColor: sortBy === field ? "#3a4a5a" : "#253545",
              borderRadius: "16px",
              padding: "4px 12px",
              fontSize: "11px",
              fontWeight: sortBy === field ? 600 : 400,
              color: sortBy === field ? "#fff" : "#8899AA",
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {field}
          </button>
        ))}
      </div>
      {!reels?.length ? (
        <div style={{ color: "#8899AA", fontSize: "12px", padding: "20px 0", textAlign: "center" }}>
          No reels found
        </div>
      ) : (
        <div style={{
          display: "flex", gap: "12px", overflowX: "auto",
          paddingBottom: "8px",
        }}>
          {reels.map((reel: any) => (
            <ReelCard key={reel._id} reel={reel} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Account Row ─── */
function AccountRow({
  account,
  snapshots,
  reelStats,
  token,
}: {
  account: any;
  snapshots: any;
  reelStats: { views: number; likes: number; comments: number; reelsPosted: number };
  token: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const followerDelta = snapshots
    ? snapshots.reduce((sum: number, s: any) => sum + Number(s.followersDelta || 0), 0)
    : 0;

  const followerPct = account.followers > 0
    ? ((followerDelta / account.followers) * 100).toFixed(1)
    : "0.0";

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: "pointer", borderBottom: expanded ? "none" : "1px solid #253545" }}
        onMouseEnter={(e) => {
          for (const cell of Array.from(e.currentTarget.children))
            (cell as HTMLElement).style.background = "#253545";
        }}
        onMouseLeave={(e) => {
          for (const cell of Array.from(e.currentTarget.children))
            (cell as HTMLElement).style.background = "transparent";
        }}
      >
        <td style={{ padding: "14px 12px", transition: "background 0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "10px", color: "#8899AA", transition: "transform 0.2s",
              transform: expanded ? "rotate(90deg)" : "rotate(0)",
            }}>▶</span>
            {account.profilePicUrl ? (
              <img src={account.profilePicUrl} alt="" style={{ width: "32px", height: "32px", borderRadius: "8px", objectFit: "cover" }} />
            ) : (
              <div style={{ width: "32px", height: "32px", borderRadius: "8px", background: "#253545", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px" }}>
                📷
              </div>
            )}
            <div>
              <div style={{ color: "#fff", fontWeight: 600, fontSize: "13px" }}>
                {account.creatorName || account.username}
              </div>
              <div style={{
                display: "inline-block", marginTop: "2px",
                padding: "1px 6px", fontSize: "10px", fontWeight: 600,
                color: "#E1306C", background: "rgba(225,48,108,0.1)",
                borderRadius: "4px",
              }}>
                Instagram
              </div>
            </div>
          </div>
        </td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 600, fontSize: "14px", transition: "background 0.15s" }}>
          {followerDelta >= 0 ? "+" : ""}{formatNumber(followerDelta)}
          <span style={{ color: "#8899AA", fontSize: "11px", marginLeft: "4px" }}>
            ({followerPct}%)
          </span>
        </td>
        <td style={{ padding: "14px 12px", transition: "background 0.15s" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#22c55e" }} />
            <span style={{ color: "#8899AA", fontSize: "12px" }}>Active</span>
          </div>
        </td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>
          {reelStats.views > 0 ? "+" : ""}{formatNumber(reelStats.views)}
        </td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>
          {reelStats.likes > 0 ? "+" : ""}{formatNumber(reelStats.likes)}
        </td>
        <td style={{ padding: "14px 12px", color: "#22c55e", fontWeight: 600, transition: "background 0.15s" }}>
          {reelStats.comments > 0 ? "+" : ""}{formatNumber(reelStats.comments)}
        </td>
        <td style={{ padding: "14px 12px", color: "#fff", fontWeight: 600, transition: "background 0.15s" }}>
          {reelStats.reelsPosted}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding: "0 16px 16px", background: "#162230", borderBottom: "1px solid #253545" }}>
            <TopVideosSection token={token} accountId={account._id} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Snapshot Fetcher (up to 10 accounts) ─── */
function AccountsTableInner({
  token,
  accounts,
  startDate,
  endDate,
}: {
  token: string;
  accounts: any[];
  startDate: string;
  endDate: string;
}) {
  const MAX = 10;
  const padded = accounts.slice(0, MAX);

  const s0 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[0] ? { token, igAccountId: padded[0]._id, startDate, endDate } : "skip");
  const s1 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[1] ? { token, igAccountId: padded[1]._id, startDate, endDate } : "skip");
  const s2 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[2] ? { token, igAccountId: padded[2]._id, startDate, endDate } : "skip");
  const s3 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[3] ? { token, igAccountId: padded[3]._id, startDate, endDate } : "skip");
  const s4 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[4] ? { token, igAccountId: padded[4]._id, startDate, endDate } : "skip");
  const s5 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[5] ? { token, igAccountId: padded[5]._id, startDate, endDate } : "skip");
  const s6 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[6] ? { token, igAccountId: padded[6]._id, startDate, endDate } : "skip");
  const s7 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[7] ? { token, igAccountId: padded[7]._id, startDate, endDate } : "skip");
  const s8 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[8] ? { token, igAccountId: padded[8]._id, startDate, endDate } : "skip");
  const s9 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[9] ? { token, igAccountId: padded[9]._id, startDate, endDate } : "skip");

  const allSnapshots = [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const reelStatsByAccount = useMemo(() => {
    const result: Record<string, { views: number; likes: number; comments: number; reelsPosted: number }> = {};
    padded.forEach((account, i) => {
      const snaps = allSnapshots[i];
      if (!snaps) {
        result[account._id] = { views: 0, likes: 0, comments: 0, reelsPosted: 0 };
        return;
      }
      result[account._id] = {
        views: snaps.reduce((s: number, snap: any) => s + Number(snap.views || 0), 0),
        likes: snaps.reduce((s: number, snap: any) => s + Number(snap.likes || 0), 0),
        comments: snaps.reduce((s: number, snap: any) => s + Number(snap.comments || 0), 0),
        reelsPosted: snaps.reduce((s: number, snap: any) => s + Number(snap.reelsPosted || 0), 0),
      };
    });
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padded.length, ...allSnapshots]);

  const COLS = ["USERNAME", "NEW FOLLOWERS", "STATUS", "VIEWS", "LIKES", "COMMENTS", "REELS POSTED"];

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #253545" }}>
            {COLS.map((h) => (
              <th key={h} style={{
                padding: "12px 12px", fontSize: "11px", color: "#8899AA",
                fontWeight: 600, textAlign: "left", textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {padded.map((account, i) => (
            <AccountRow
              key={account._id}
              account={account}
              snapshots={allSnapshots[i]}
              reelStats={reelStatsByAccount[account._id] || { views: 0, likes: 0, comments: 0, reelsPosted: 0 }}
              token={token}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Donut Charts Inner ─── */
function DonutChartsInner({
  token,
  accounts,
  startDate,
  endDate,
}: {
  token: string;
  accounts: any[];
  startDate: string;
  endDate: string;
}) {
  const MAX = 10;
  const padded = accounts.slice(0, MAX);

  const s0 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[0] ? { token, igAccountId: padded[0]._id, startDate, endDate } : "skip");
  const s1 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[1] ? { token, igAccountId: padded[1]._id, startDate, endDate } : "skip");
  const s2 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[2] ? { token, igAccountId: padded[2]._id, startDate, endDate } : "skip");
  const s3 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[3] ? { token, igAccountId: padded[3]._id, startDate, endDate } : "skip");
  const s4 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[4] ? { token, igAccountId: padded[4]._id, startDate, endDate } : "skip");
  const s5 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[5] ? { token, igAccountId: padded[5]._id, startDate, endDate } : "skip");
  const s6 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[6] ? { token, igAccountId: padded[6]._id, startDate, endDate } : "skip");
  const s7 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[7] ? { token, igAccountId: padded[7]._id, startDate, endDate } : "skip");
  const s8 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[8] ? { token, igAccountId: padded[8]._id, startDate, endDate } : "skip");
  const s9 = useQuery(api.crm.igQueries.getIgDailySnapshots, padded[9] ? { token, igAccountId: padded[9]._id, startDate, endDate } : "skip");

  const allSnapshots = [s0, s1, s2, s3, s4, s5, s6, s7, s8, s9];

  const { viewsData, followersData } = useMemo(() => {
    const viewsData: { name: string; value: number; color: string }[] = [];
    const followersData: { name: string; value: number; color: string }[] = [];

    padded.forEach((account, i) => {
      const snaps = allSnapshots[i];
      const name = account.creatorName || account.username || "Unknown";
      const color = CHART_COLORS[i % CHART_COLORS.length];

      if (!snaps) {
        viewsData.push({ name, value: 0, color });
        followersData.push({ name, value: 0, color });
        return;
      }

      const views = snaps.reduce((s: number, snap: any) => s + Number(snap.views || 0), 0);
      const followerDelta = snaps.reduce((s: number, snap: any) => s + Number(snap.followersDelta || 0), 0);

      viewsData.push({ name, value: views, color });
      followersData.push({ name, value: Math.max(0, followerDelta), color });
    });

    return { viewsData, followersData };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [padded.length, ...allSnapshots]);

  return (
    <div style={{ display: "flex", gap: "24px", flex: 1, flexWrap: "wrap" }}>
      <DonutWithLegend title="All views comparison" data={viewsData} />
      <DonutWithLegend title="New followers comparison" data={followersData} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════ */

export default function ManagerDashboardPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [dateRange, setDateRange] = useState<DateRange>(() => getDaysAgoRange(6));
  const [creatorFilter, setCreatorFilter] = useState<string>("all");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const creatorIdArg = creatorFilter !== "all" ? creatorFilter as any : undefined;

  const overview = useQuery(
    api.crm.igQueries.getIgOverview,
    token ? { token, startDate: dateRange.start, endDate: dateRange.end, creatorId: creatorIdArg } : "skip"
  );

  const accounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token, creatorId: creatorIdArg } : "skip"
  );

  const allAccounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token } : "skip"
  );

  if (!user) return null;
  if (user.role !== "marketing_manager" && user.role !== "admin") {
    return (
      <div style={{ padding: 24, color: "#fff" }}>
        🔒 This dashboard is for marketing managers only.
      </div>
    );
  }

  const creatorOptions: { id: string; name: string }[] = (() => {
    if (!allAccounts) return [];
    const seen = new Map<string, string>();
    for (const a of allAccounts as any[]) {
      if (a.creatorId && a.creatorName) {
        seen.set(String(a.creatorId), a.creatorName);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  })();

  return (
    <div style={{ maxWidth: "1400px", color: "#fff" }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>📈 Traffic Dashboard</h1>
      <p style={{ color: "#8899AA", marginBottom: 20 }}>Subscriber stats & social media analytics</p>

      {/* ═══ TOP: Subscriber Stats (original) ═══ */}
      <SubscriberStatsSection token={token} user={user} />

      {/* ═══ Tracking Links ═══ */}
      <div style={{ marginBottom: "24px" }}>
        <TrackingLinksCard token={token} isAdmin={user.role === "admin"} />
      </div>

      {/* ═══ BOTTOM: Instagram / Reels Analytics (new addition) ═══ */}
      <div style={{
        borderTop: "2px solid #253545", paddingTop: "24px", marginTop: "8px",
      }}>
        <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "20px" }}>
          📱 Instagram Analytics
        </h2>

        {/* Accounts Summarized */}
        <div style={{
          background: "#1C2A3A", borderRadius: "16px", padding: "24px",
          marginBottom: "24px",
        }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginBottom: "20px", flexWrap: "wrap", gap: "12px",
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: 700, color: "#fff", margin: 0 }}>
              Accounts Summarized
            </h3>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={creatorFilter}
                onChange={(e) => setCreatorFilter(e.target.value)}
                style={{
                  background: "#253545", color: "#fff", border: "1px solid #3a4a5a",
                  borderRadius: "8px", padding: "8px 12px", fontSize: "13px",
                  cursor: "pointer", outline: "none",
                }}
              >
                <option value="all">All Creators</option>
                {creatorOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <DateRangePicker value={dateRange} onChange={setDateRange} />
            </div>
          </div>

          <div style={{ display: "flex", gap: "24px", flexWrap: "wrap" }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
              flex: "0 0 320px", minWidth: "280px",
            }}>
              <StatCard label="All Views" value={formatNumber(overview?.totalViews ?? 0)} color="#22c55e" />
              <StatCard label="All Likes" value={formatNumber(overview?.totalLikes ?? 0)} color="#22c55e" />
              <StatCard label="New Followers" value={formatNumber(overview?.totalFollowerDelta ?? 0)} color="#22c55e" />
              <StatCard label="All Shares" value="—" />
              <StatCard label="Reels Posted" value={formatNumber(overview?.reelsPosted ?? 0)} />
              <StatCard label="All Comments" value={formatNumber(overview?.totalComments ?? 0)} />
            </div>

            {accounts && (accounts as any[]).length > 0 && (
              <DonutChartsInner token={token} accounts={accounts as any[]} startDate={dateRange.start} endDate={dateRange.end} />
            )}
          </div>
        </div>

        {/* Accounts Table */}
        <div style={{
          background: "#1C2A3A", borderRadius: "16px", padding: "24px",
          marginBottom: "24px",
        }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#fff", margin: "0 0 16px 0" }}>
            Accounts
          </h3>
          {accounts && (accounts as any[]).length > 0 ? (
            <AccountsTableInner
              token={token}
              accounts={accounts as any[]}
              startDate={dateRange.start}
              endDate={dateRange.end}
            />
          ) : (
            <div style={{ color: "#8899AA", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
              {accounts === undefined ? "Loading…" : "No Instagram accounts found"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
