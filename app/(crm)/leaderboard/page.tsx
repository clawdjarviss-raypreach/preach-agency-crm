"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";

// ─── TYPES ─────────────────────────────────────────────────

type Category = "sales" | "hours" | "streaks" | "efficiency" | "ppv";
type Period = "today" | "this_week" | "this_month" | "all_time";
type ExtendedPeriod = "ytd" | "mtd" | "wtd";
type SortMetric = "earnings" | "responseRate" | "avgResponseTime";
type ViewMode = "classic" | "extended";
type BadgeType = "speedster" | "top_earner" | "vip_favorite" | "consistency";

const CATEGORIES: Array<{ key: Category; label: string; description: string }> = [
  { key: "sales", label: "💰 Sales", description: "Total sales reported" },
  { key: "hours", label: "⏱️ Hours", description: "Net work hours" },
  { key: "streaks", label: "🔥 Streaks", description: "Consecutive work days" },
  { key: "efficiency", label: "📊 $/Hour", description: "Revenue per hour worked" },
  { key: "ppv", label: "🎯 PPV", description: "PPV revenue" },
];

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This Week" },
  { key: "this_month", label: "This Month" },
  { key: "all_time", label: "All Time" },
];

const EXTENDED_PERIODS: Array<{ key: ExtendedPeriod; label: string }> = [
  { key: "wtd", label: "Week" },
  { key: "mtd", label: "Month" },
  { key: "ytd", label: "Year" },
];

const SORT_METRICS: Array<{ key: SortMetric; label: string }> = [
  { key: "earnings", label: "💰 Earnings" },
  { key: "responseRate", label: "📈 Response Rate" },
  { key: "avgResponseTime", label: "⚡ Response Time" },
];

const BADGE_INFO: Record<BadgeType, { emoji: string; label: string; color: string }> = {
  speedster: { emoji: "⚡", label: "Speedster", color: "#f59e0b" },
  top_earner: { emoji: "💰", label: "Top Earner", color: "#10b981" },
  vip_favorite: { emoji: "👑", label: "VIP Favorite", color: "#8b5cf6" },
  consistency: { emoji: "🎯", label: "Consistency", color: "#3b82f6" },
};

// ─── STYLES ────────────────────────────────────────────────

const colors = {
  bg: "#1a1a1a",
  surface: "#ffffff",
  surfaceAlt: "#faf9f7",
  border: "#e8e4df",
  accent: "#f1ae38",
  accentLight: "#d4a87a",
  text: "#1a1a1a",
  textSecondary: "#666666",
  textMuted: "#999999",
  gold: "#FFD700",
  goldBg: "#fff8e1",
  silver: "#C0C0C0",
  silverBg: "#f5f5f5",
  bronze: "#CD7F32",
  bronzeBg: "#fef3e8",
  trendUp: "#4caf50",
  trendDown: "#999999",
  trendNeutral: "#999999",
  tierBronze: "#CD7F32",
  tierSilver: "#C0C0C0",
  tierGold: "#FFD700",
  tierDiamond: "#b9f2ff",
};

// ─── MAIN PAGE ─────────────────────────────────────────────

export default function LeaderboardPage() {
  const [token, setToken] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("extended");
  // Classic view state
  const [category, setCategory] = useState<Category>("sales");
  const [period, setPeriod] = useState<Period>("this_week");
  // Extended view state
  const [extendedPeriod, setExtendedPeriod] = useState<ExtendedPeriod>("mtd");
  const [sortMetric, setSortMetric] = useState<SortMetric>("earnings");
  // Modal state
  const [showBadgeModal, setShowBadgeModal] = useState(false);
  const [currentBadge, setCurrentBadge] = useState<any>(null);

  useEffect(() => {
    setToken(localStorage.getItem("crm_token"));
  }, []);

  // Classic leaderboard query
  const leaderboard = useQuery(
    api.crm.leaderboard.getLeaderboard,
    token && viewMode === "classic" ? { token, category, period } : "skip"
  );

  // Extended leaderboard query
  const extendedLeaderboard = useQuery(
    api.crm.leaderboard.getExtendedLeaderboard,
    token && viewMode === "extended" ? { token, period: extendedPeriod, sortBy: sortMetric } : "skip"
  );

  const achievements = useQuery(
    api.crm.achievements.getAchievements,
    token ? { token } : "skip"
  );

  const streak = useQuery(
    api.crm.streaks.getMyStreak,
    token ? { token } : "skip"
  );

  const unnotifiedBadges = useQuery(
    api.crm.achievements.getUnnotifiedBadges,
    token ? { token } : "skip"
  );

  const markNotified = useMutation(api.crm.achievements.markBadgeNotified);

  // Show badge modal for unnotified badges
  useEffect(() => {
    if (unnotifiedBadges && unnotifiedBadges.length > 0 && !showBadgeModal) {
      setCurrentBadge(unnotifiedBadges[0]);
      setShowBadgeModal(true);
    }
  }, [unnotifiedBadges, showBadgeModal]);

  const dismissBadge = useCallback(async () => {
    if (currentBadge && token) {
      try {
        await markNotified({ token, chatterAchievementId: currentBadge.id });
      } catch (e) {
        // ignore
      }
    }
    setShowBadgeModal(false);
    setCurrentBadge(null);
  }, [currentBadge, token, markNotified]);

  if (!token) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: colors.textMuted }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: colors.text }}>
            🏆 Leaderboard
          </h1>
          {/* View Mode Toggle */}
          <ViewModeToggle viewMode={viewMode} setViewMode={setViewMode} />
        </div>
      </div>

      {viewMode === "extended" ? (
        <>
          {/* Extended Period Selector */}
          <ExtendedPeriodSelector
            period={extendedPeriod}
            setPeriod={setExtendedPeriod}
          />

          {/* Sort Metric Selector */}
          <SortMetricSelector
            sortMetric={sortMetric}
            setSortMetric={setSortMetric}
          />

          {/* Extended Personal Stats */}
          {extendedLeaderboard?.myRank && (
            <ExtendedPersonalStats
              myRank={extendedLeaderboard.myRank}
              periodLabel={extendedLeaderboard.periodLabel}
              totalRanked={extendedLeaderboard.entries.length}
            />
          )}

          {/* Extended Podium */}
          {extendedLeaderboard && extendedLeaderboard.entries.length >= 1 && (
            <ExtendedPodium entries={extendedLeaderboard.entries} />
          )}

          {/* Extended Rankings Table */}
          {extendedLeaderboard && (
            <ExtendedRankingsTable
              entries={extendedLeaderboard.entries}
              sortMetric={sortMetric}
            />
          )}

          {/* Badge Legend */}
          <BadgeLegend />

          {/* Loading state */}
          {!extendedLeaderboard && (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                color: colors.textMuted,
                fontSize: "15px",
              }}
            >
              Loading leaderboard...
            </div>
          )}
        </>
      ) : (
        <>
          {/* Category Tabs */}
          <CategoryTabs category={category} setCategory={setCategory} />

          {/* Period Selector */}
          <PeriodSelector
            period={period}
            setPeriod={setPeriod}
            disableAllTime={category === "streaks"}
          />

          {/* Personal Stats */}
          {leaderboard && (
            <PersonalStats
              myRank={leaderboard.myRank}
              category={category}
              periodLabel={leaderboard.periodLabel}
              totalRanked={leaderboard.rankings.length}
            />
          )}

          {/* Streak Card (when streaks tab is active) */}
          {category === "streaks" && streak && <StreakCard streak={streak} />}

          {/* Podium */}
          {leaderboard && leaderboard.rankings.length >= 1 && (
            <Podium rankings={leaderboard.rankings} />
          )}

          {/* Full Rankings */}
          {leaderboard && (
            <RankingsTable
              rankings={leaderboard.rankings}
              category={category}
            />
          )}

          {/* Badge Showcase */}
          {achievements && <BadgeShowcase achievements={achievements} />}

          {/* Loading state */}
          {!leaderboard && (
            <div
              style={{
                padding: "60px 20px",
                textAlign: "center",
                color: colors.textMuted,
                fontSize: "15px",
              }}
            >
              Loading leaderboard...
            </div>
          )}
        </>
      )}

      {/* Badge Celebration Modal */}
      {showBadgeModal && currentBadge && (
        <BadgeCelebrationModal badge={currentBadge} onDismiss={dismissBadge} />
      )}
    </div>
  );
}

// ─── VIEW MODE TOGGLE ──────────────────────────────────────

function ViewModeToggle({
  viewMode,
  setViewMode,
}: {
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        background: colors.surfaceAlt,
        borderRadius: "8px",
        padding: "4px",
      }}
    >
      <button
        onClick={() => setViewMode("extended")}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "none",
          background: viewMode === "extended" ? colors.surface : "transparent",
          color: viewMode === "extended" ? colors.text : colors.textMuted,
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          boxShadow: viewMode === "extended" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        }}
      >
        Performance
      </button>
      <button
        onClick={() => setViewMode("classic")}
        style={{
          padding: "6px 12px",
          borderRadius: "6px",
          border: "none",
          background: viewMode === "classic" ? colors.surface : "transparent",
          color: viewMode === "classic" ? colors.text : colors.textMuted,
          fontSize: "12px",
          fontWeight: "600",
          cursor: "pointer",
          boxShadow: viewMode === "classic" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
        }}
      >
        Classic
      </button>
    </div>
  );
}

// ─── EXTENDED PERIOD SELECTOR ──────────────────────────────

function ExtendedPeriodSelector({
  period,
  setPeriod,
}: {
  period: ExtendedPeriod;
  setPeriod: (p: ExtendedPeriod) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        marginBottom: "12px",
      }}
    >
      {EXTENDED_PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => setPeriod(p.key)}
          style={{
            flex: "1",
            padding: "10px 16px",
            borderRadius: "12px",
            border: `1px solid ${period === p.key ? colors.accent : colors.border}`,
            background: period === p.key ? `${colors.accent}15` : "transparent",
            color: period === p.key ? colors.accent : colors.textSecondary,
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
            minHeight: "44px",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ─── SORT METRIC SELECTOR ──────────────────────────────────

function SortMetricSelector({
  sortMetric,
  setSortMetric,
}: {
  sortMetric: SortMetric;
  setSortMetric: (m: SortMetric) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        marginBottom: "16px",
      }}
    >
      {SORT_METRICS.map((m) => (
        <button
          key={m.key}
          onClick={() => setSortMetric(m.key)}
          style={{
            flex: "0 0 auto",
            padding: "8px 14px",
            borderRadius: "20px",
            border: `1px solid ${sortMetric === m.key ? colors.accent : colors.border}`,
            background: sortMetric === m.key ? `${colors.accent}10` : "transparent",
            color: sortMetric === m.key ? colors.accent : colors.textSecondary,
            fontSize: "13px",
            fontWeight: "500",
            cursor: "pointer",
            whiteSpace: "nowrap",
            minHeight: "36px",
          }}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

// ─── EXTENDED PERSONAL STATS ───────────────────────────────

function ExtendedPersonalStats({
  myRank,
  periodLabel,
  totalRanked,
}: {
  myRank: any;
  periodLabel: string;
  totalRanked: number;
}) {
  if (!myRank || myRank.rank === 0) {
    return (
      <div
        style={{
          background: colors.surface,
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "16px",
          border: `2px solid ${colors.border}`,
        }}
      >
        <p style={{ fontSize: "14px", color: colors.textMuted, textAlign: "center" }}>
          No data yet for this period.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "20px",
        marginBottom: "16px",
        border: `2px solid ${colors.accent}40`,
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        Your Performance • {periodLabel}
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "24px", fontWeight: "700", color: colors.text }}>
          #{myRank.rank}
        </span>
        <span style={{ fontSize: "14px", color: colors.textSecondary }}>
          of {totalRanked}
        </span>
        {myRank.trend !== 0 && <TrendBadge trend={myRank.trend} />}
      </div>

      <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
        <div>
          <span style={{ color: colors.textMuted }}>Earnings: </span>
          <span style={{ color: colors.text, fontWeight: "600" }}>
            ${(myRank.earnings / 100).toLocaleString()}
          </span>
        </div>
        <div>
          <span style={{ color: colors.textMuted }}>Response: </span>
          <span style={{ color: colors.text, fontWeight: "600" }}>
            {myRank.responseRate.toFixed(1)}%
          </span>
        </div>
        <div>
          <span style={{ color: colors.textMuted }}>Avg Time: </span>
          <span style={{ color: colors.text, fontWeight: "600" }}>
            {formatResponseTime(myRank.avgResponseTimeSec)}
          </span>
        </div>
      </div>

      {/* Badges */}
      {myRank.badges && myRank.badges.length > 0 && (
        <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {myRank.badges.map((badge: BadgeType) => (
            <BadgePill key={badge} badge={badge} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── BADGE PILL ────────────────────────────────────────────

function BadgePill({ badge }: { badge: BadgeType }) {
  const info = BADGE_INFO[badge];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        padding: "4px 10px",
        borderRadius: "12px",
        background: `${info.color}15`,
        color: info.color,
        fontSize: "12px",
        fontWeight: "600",
      }}
    >
      {info.emoji} {info.label}
    </span>
  );
}

// ─── BADGE LEGEND ──────────────────────────────────────────

function BadgeLegend() {
  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "16px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Badge Legend
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
        {(Object.keys(BADGE_INFO) as BadgeType[]).map((badge) => {
          const info = BADGE_INFO[badge];
          return (
            <div key={badge} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "18px" }}>{info.emoji}</span>
              <div>
                <div style={{ fontSize: "12px", fontWeight: "600", color: info.color }}>
                  {info.label}
                </div>
                <div style={{ fontSize: "11px", color: colors.textMuted }}>
                  {badge === "speedster" && "< 1 min avg response"}
                  {badge === "top_earner" && "Top 3 earnings"}
                  {badge === "vip_favorite" && "10+ VIP messages"}
                  {badge === "consistency" && "95%+ for 7+ days"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EXTENDED PODIUM ───────────────────────────────────────

function ExtendedPodium({ entries }: { entries: any[] }) {
  const top3 = entries.slice(0, 3);
  if (top3.length === 0) return null;

  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : [top3[0]];

  const podiumConfig = [
    { medal: "🥈", color: colors.silver, bg: colors.silverBg, height: "100px" },
    { medal: "🥇", color: colors.gold, bg: colors.goldBg, height: "140px" },
    { medal: "🥉", color: colors.bronze, bg: colors.bronzeBg, height: "80px" },
  ];

  const configs = top3.length >= 3
    ? [podiumConfig[0], podiumConfig[1], podiumConfig[2]]
    : top3.length === 2
      ? [podiumConfig[0], podiumConfig[1]]
      : [podiumConfig[1]];

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "24px 16px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: "8px",
        }}
      >
        {podiumOrder.map((entry, i) => {
          const config = configs[i];
          if (!entry || !config) return null;

          return (
            <div
              key={entry.chatterId}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                flex: "1",
                maxWidth: "140px",
              }}
            >
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: config.bg,
                  border: `3px solid ${config.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                }}
              >
                {entry.chatterAvatar || "👤"}
              </div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: colors.text, textAlign: "center" }}>
                {entry.chatterName}
              </div>
              {/* Badges */}
              {entry.badges && entry.badges.length > 0 && (
                <div style={{ display: "flex", gap: "2px" }}>
                  {entry.badges.slice(0, 3).map((b: BadgeType) => (
                    <span key={b} title={BADGE_INFO[b].label}>
                      {BADGE_INFO[b].emoji}
                    </span>
                  ))}
                </div>
              )}
              <div
                style={{
                  width: "100%",
                  height: config.height,
                  borderRadius: "12px 12px 0 0",
                  background: `linear-gradient(180deg, ${config.bg} 0%, ${config.color}30 100%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: "12px",
                  border: `1px solid ${config.color}40`,
                  borderBottom: "none",
                }}
              >
                <span style={{ fontSize: "28px" }}>{config.medal}</span>
                <span style={{ fontSize: "14px", fontWeight: "700", color: colors.text, marginTop: "4px" }}>
                  ${Math.round(entry.earnings).toLocaleString()}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── EXTENDED RANKINGS TABLE ───────────────────────────────

function ExtendedRankingsTable({
  entries,
  sortMetric,
}: {
  entries: any[];
  sortMetric: SortMetric;
}) {
  if (entries.length === 0) {
    return (
      <div
        style={{
          background: colors.surface,
          borderRadius: "16px",
          padding: "40px 20px",
          marginBottom: "16px",
          border: `1px solid ${colors.border}`,
          textAlign: "center",
          color: colors.textMuted,
          fontSize: "14px",
        }}
      >
        No data for this period yet.
      </div>
    );
  }

  const userData = typeof window !== "undefined" ? localStorage.getItem("crm_user") : null;
  let myChatterId: string | null = null;
  try {
    if (userData) myChatterId = JSON.parse(userData).id;
  } catch { /* ignore */ }

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "16px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Full Rankings
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {entries.map((entry) => {
          const isMe = entry.chatterId === myChatterId;

          return (
            <div
              key={entry.chatterId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                borderRadius: "12px",
                background: isMe ? `${colors.accent}10` : "transparent",
                border: isMe ? `1px solid ${colors.accent}30` : "1px solid transparent",
              }}
            >
              {/* Rank */}
              <div
                style={{
                  width: "28px",
                  fontSize: "14px",
                  fontWeight: entry.rank <= 3 ? "700" : "500",
                  color: entry.rank <= 3 ? colors.text : colors.textSecondary,
                  textAlign: "center",
                }}
              >
                {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : `#${entry.rank}`}
              </div>

              {/* Avatar */}
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: isMe
                    ? `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`
                    : colors.surfaceAlt,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                }}
              >
                {entry.chatterAvatar || "👤"}
              </div>

              {/* Name & Badges */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: isMe ? "700" : "500",
                    color: colors.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isMe ? `⚡ ${entry.chatterName}` : entry.chatterName}
                </div>
                {entry.badges && entry.badges.length > 0 && (
                  <div style={{ fontSize: "12px", marginTop: "2px" }}>
                    {entry.badges.map((b: BadgeType) => BADGE_INFO[b].emoji).join(" ")}
                  </div>
                )}
              </div>

              {/* Metrics */}
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: colors.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {sortMetric === "earnings" && `$${Math.round(entry.earnings).toLocaleString()}`}
                  {sortMetric === "responseRate" && `${entry.responseRate.toFixed(1)}%`}
                  {sortMetric === "avgResponseTime" && formatResponseTime(entry.avgResponseTimeSec)}
                </div>
                <div style={{ fontSize: "11px", color: colors.textMuted }}>
                  {sortMetric !== "responseRate" && `${entry.responseRate.toFixed(0)}% resp`}
                  {sortMetric === "responseRate" && `$${Math.round(entry.earnings).toLocaleString()}`}
                </div>
              </div>

              {/* Trend */}
              <TrendBadge trend={entry.trend} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── HELPER ────────────────────────────────────────────────

function formatResponseTime(seconds: number): string {
  if (seconds === 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (remainingSeconds === 0) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

// ─── CATEGORY TABS ─────────────────────────────────────────

function CategoryTabs({
  category,
  setCategory,
}: {
  category: Category;
  setCategory: (c: Category) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "4px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        scrollSnapType: "x mandatory",
        padding: "4px 0",
        marginBottom: "12px",
      }}
    >
      {CATEGORIES.map((cat) => (
        <button
          key={cat.key}
          onClick={() => setCategory(cat.key)}
          style={{
            flex: "0 0 auto",
            scrollSnapAlign: "start",
            padding: "10px 16px",
            borderRadius: "12px",
            border: "none",
            background:
              category === cat.key ? colors.accent : colors.surface,
            color: category === cat.key ? "#ffffff" : colors.textSecondary,
            fontSize: "13px",
            fontWeight: "600",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all 0.15s",
            minHeight: "44px",
          }}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

// ─── PERIOD SELECTOR ───────────────────────────────────────

function PeriodSelector({
  period,
  setPeriod,
  disableAllTime,
}: {
  period: Period;
  setPeriod: (p: Period) => void;
  disableAllTime: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: "6px",
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
        marginBottom: "16px",
      }}
    >
      {PERIODS.map((p) => {
        const disabled = disableAllTime && p.key === "all_time";
        return (
          <button
            key={p.key}
            onClick={() => !disabled && setPeriod(p.key)}
            disabled={disabled}
            style={{
              flex: "0 0 auto",
              padding: "8px 14px",
              borderRadius: "20px",
              border: `1px solid ${period === p.key ? colors.accent : colors.border}`,
              background: period === p.key ? `${colors.accent}15` : "transparent",
              color: disabled
                ? colors.textMuted
                : period === p.key
                  ? colors.accent
                  : colors.textSecondary,
              fontSize: "13px",
              fontWeight: "500",
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.5 : 1,
              whiteSpace: "nowrap",
              minHeight: "38px",
            }}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── PERSONAL STATS CARD ───────────────────────────────────

function PersonalStats({
  myRank,
  category,
  periodLabel,
  totalRanked,
}: {
  myRank: any;
  category: Category;
  periodLabel: string;
  totalRanked: number;
}) {
  if (!myRank || myRank.rank === 0) {
    return (
      <div
        style={{
          background: colors.surface,
          borderRadius: "16px",
          padding: "20px",
          marginBottom: "16px",
          border: `2px solid ${colors.border}`,
        }}
      >
        <p style={{ fontSize: "14px", color: colors.textMuted, textAlign: "center" }}>
          No data yet for this period. Clock in and submit reports!
        </p>
      </div>
    );
  }

  const catLabel = CATEGORIES.find((c) => c.key === category)?.label || category;

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "20px",
        marginBottom: "16px",
        border: `2px solid ${colors.accent}40`,
      }}
    >
      <div style={{ fontSize: "12px", fontWeight: "600", color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>
        Your Stats
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginBottom: "8px" }}>
        <span style={{ fontSize: "24px", fontWeight: "700", color: colors.text }}>
          #{myRank.rank}
        </span>
        <span style={{ fontSize: "14px", color: colors.textSecondary }}>
          in {catLabel} · {myRank.formattedValue}
        </span>
        {myRank.trend !== 0 && (
          <TrendBadge trend={myRank.trend} />
        )}
      </div>

      {myRank.rank === 1 ? (
        <p style={{ fontSize: "14px", color: colors.accent, fontWeight: "600" }}>
          🥇 You&apos;re #1! Stay on top!
        </p>
      ) : myRank.gapToNext !== null ? (
        <p style={{ fontSize: "14px", color: colors.textSecondary }}>
          You need {formatGap(myRank.gapToNext, category)} more to reach #{myRank.rank - 1}
        </p>
      ) : null}

      {/* Progress bar */}
      {myRank.rank > 1 && myRank.progressToNext > 0 && (
        <div
          style={{
            marginTop: "12px",
            height: "8px",
            borderRadius: "4px",
            background: `${colors.accent}20`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${myRank.progressToNext}%`,
              height: "100%",
              borderRadius: "4px",
              background: `linear-gradient(90deg, ${colors.accent}, ${colors.accentLight})`,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}

function formatGap(gap: number, category: Category): string {
  switch (category) {
    case "sales":
    case "ppv":
      return `$${Math.round(gap).toLocaleString()}`;
    case "hours":
      return `${Math.round(gap)}min`;
    case "streaks":
      return `${gap} day${gap !== 1 ? "s" : ""}`;
    case "efficiency":
      return `$${gap.toFixed(2)}/h`;
    default:
      return String(gap);
  }
}

// ─── STREAK CARD ───────────────────────────────────────────

function StreakCard({ streak }: { streak: any }) {
  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "20px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ fontSize: "24px" }}>🔥</span>
        <span style={{ fontSize: "20px", fontWeight: "700", color: colors.text }}>
          {streak.currentStreak}-Day Streak
        </span>
      </div>

      {/* Progress to next milestone */}
      <div style={{ marginBottom: "12px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "12px",
            color: colors.textMuted,
            marginBottom: "4px",
          }}
        >
          <span>Progress to {streak.nextMilestone} days</span>
          <span>{streak.currentStreak}/{streak.nextMilestone}</span>
        </div>
        <div
          style={{
            height: "8px",
            borderRadius: "4px",
            background: `${colors.accent}20`,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${streak.progressToNextMilestone}%`,
              height: "100%",
              borderRadius: "4px",
              background: `linear-gradient(90deg, #ff6b35, #ff9f1c)`,
              transition: "width 0.5s ease",
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: "16px", fontSize: "13px" }}>
        <div>
          <span style={{ color: colors.textMuted }}>❄️ Freezes: </span>
          <span style={{ color: colors.text, fontWeight: "600" }}>
            {streak.freezesRemaining} left
          </span>
        </div>
        <div>
          <span style={{ color: colors.textMuted }}>Best: </span>
          <span style={{ color: colors.text, fontWeight: "600" }}>
            {streak.bestStreak} days
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── PODIUM ────────────────────────────────────────────────

function Podium({ rankings }: { rankings: any[] }) {
  const top3 = rankings.slice(0, 3);
  if (top3.length === 0) return null;

  // Reorder for display: [2nd, 1st, 3rd]
  const podiumOrder = top3.length >= 3
    ? [top3[1], top3[0], top3[2]]
    : top3.length === 2
      ? [top3[1], top3[0]]
      : [top3[0]];

  const podiumConfig = [
    { medal: "🥈", color: colors.silver, bg: colors.silverBg, height: "100px" },
    { medal: "🥇", color: colors.gold, bg: colors.goldBg, height: "140px" },
    { medal: "🥉", color: colors.bronze, bg: colors.bronzeBg, height: "80px" },
  ];

  // Adjust order based on how many we have
  const configs = top3.length >= 3
    ? [podiumConfig[0], podiumConfig[1], podiumConfig[2]]
    : top3.length === 2
      ? [podiumConfig[0], podiumConfig[1]]
      : [podiumConfig[1]];

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "24px 16px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-end",
          gap: "8px",
        }}
      >
        {podiumOrder.map((entry, i) => {
          const config = configs[i];
          if (!entry || !config) return null;

          return (
            <div
              key={entry.chatterId}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                flex: "1",
                maxWidth: "140px",
              }}
            >
              {/* Avatar + Medal */}
              <div
                style={{
                  width: "52px",
                  height: "52px",
                  borderRadius: "50%",
                  background: config.bg,
                  border: `3px solid ${config.color}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "24px",
                }}
              >
                {entry.avatarEmoji || "👤"}
              </div>
              <div style={{ fontSize: "12px", fontWeight: "600", color: colors.text, textAlign: "center" }}>
                {entry.chatterName}
              </div>
              {/* Podium block */}
              <div
                style={{
                  width: "100%",
                  height: config.height,
                  borderRadius: "12px 12px 0 0",
                  background: `linear-gradient(180deg, ${config.bg} 0%, ${config.color}30 100%)`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-start",
                  paddingTop: "12px",
                  border: `1px solid ${config.color}40`,
                  borderBottom: "none",
                }}
              >
                <span style={{ fontSize: "28px" }}>{config.medal}</span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: "700",
                    color: colors.text,
                    marginTop: "4px",
                  }}
                >
                  {entry.formattedValue}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RANKINGS TABLE ────────────────────────────────────────

function RankingsTable({
  rankings,
  category,
}: {
  rankings: any[];
  category: Category;
}) {
  if (rankings.length === 0) {
    return (
      <div
        style={{
          background: colors.surface,
          borderRadius: "16px",
          padding: "40px 20px",
          marginBottom: "16px",
          border: `1px solid ${colors.border}`,
          textAlign: "center",
          color: colors.textMuted,
          fontSize: "14px",
        }}
      >
        No data for this period yet.
      </div>
    );
  }

  // Check if current user is in the list
  const userData = typeof window !== "undefined" ? localStorage.getItem("crm_user") : null;
  let myChatterId: string | null = null;
  try {
    if (userData) myChatterId = JSON.parse(userData).id;
  } catch { /* ignore */ }

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "16px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          fontSize: "12px",
          fontWeight: "600",
          color: colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: "12px",
        }}
      >
        Full Rankings
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {rankings.map((entry) => {
          const isMe = entry.chatterId === myChatterId;

          return (
            <div
              key={entry.chatterId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px",
                borderRadius: "12px",
                background: isMe ? `${colors.accent}10` : "transparent",
                border: isMe ? `1px solid ${colors.accent}30` : "1px solid transparent",
              }}
            >
              {/* Rank */}
              <div
                style={{
                  width: "28px",
                  fontSize: "14px",
                  fontWeight: entry.rank <= 3 ? "700" : "500",
                  color: entry.rank <= 3 ? colors.text : colors.textSecondary,
                  textAlign: "center",
                }}
              >
                {entry.rank <= 3
                  ? ["🥇", "🥈", "🥉"][entry.rank - 1]
                  : `#${entry.rank}`}
              </div>

              {/* Avatar */}
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: isMe
                    ? `linear-gradient(135deg, ${colors.accent} 0%, ${colors.accentLight} 100%)`
                    : colors.surfaceAlt,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "18px",
                  flexShrink: 0,
                }}
              >
                {entry.avatarEmoji || "👤"}
              </div>

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: isMe ? "700" : "500",
                    color: colors.text,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {isMe ? `⚡ ${entry.chatterName}` : entry.chatterName}
                </div>
                {entry.recentBadges.length > 0 && (
                  <div style={{ fontSize: "12px", marginTop: "2px" }}>
                    {entry.recentBadges.join(" ")}
                  </div>
                )}
              </div>

              {/* Value */}
              <div
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: colors.text,
                  whiteSpace: "nowrap",
                }}
              >
                {entry.formattedValue}
              </div>

              {/* Trend */}
              <TrendBadge trend={entry.trend} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── TREND BADGE ───────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (trend === 0) {
    return (
      <span
        style={{
          fontSize: "12px",
          color: colors.trendNeutral,
          fontWeight: "500",
          minWidth: "32px",
          textAlign: "center",
        }}
      >
        — 0
      </span>
    );
  }

  const isUp = trend > 0;
  return (
    <span
      style={{
        fontSize: "12px",
        color: isUp ? colors.trendUp : colors.trendDown,
        fontWeight: "600",
        minWidth: "32px",
        textAlign: "center",
      }}
    >
      {isUp ? `↑ +${trend}` : `↓ ${trend}`}
    </span>
  );
}

// ─── BADGE SHOWCASE ────────────────────────────────────────

function BadgeShowcase({ achievements }: { achievements: any }) {
  const tierColor = (tier: string) => {
    switch (tier) {
      case "bronze": return colors.tierBronze;
      case "silver": return colors.tierSilver;
      case "gold": return colors.tierGold;
      case "diamond": return colors.tierDiamond;
      default: return colors.textMuted;
    }
  };

  return (
    <div
      style={{
        background: colors.surface,
        borderRadius: "16px",
        padding: "20px",
        marginBottom: "16px",
        border: `1px solid ${colors.border}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <div
          style={{
            fontSize: "12px",
            fontWeight: "600",
            color: colors.textMuted,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Your Badges
        </div>
        <div style={{ fontSize: "12px", color: colors.textSecondary }}>
          {achievements.totalEarned} / {achievements.totalAvailable} earned
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "10px",
        }}
      >
        {/* Earned badges */}
        {achievements.earned.map((item: any) => (
          <div
            key={item.achievement.slug}
            style={{
              padding: "14px 10px",
              borderRadius: "12px",
              border: `1px solid ${tierColor(item.achievement.tier)}40`,
              background: `${tierColor(item.achievement.tier)}10`,
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "6px" }}>
              {item.achievement.emoji}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: colors.text,
                marginBottom: "2px",
              }}
            >
              {item.achievement.name}
            </div>
            <div style={{ fontSize: "11px", color: colors.textMuted }}>
              {item.achievement.description}
            </div>
          </div>
        ))}

        {/* Locked badges */}
        {achievements.locked.map((item: any) => (
          <div
            key={item.achievement.slug}
            style={{
              padding: "14px 10px",
              borderRadius: "12px",
              border: `1px solid ${colors.border}`,
              background: colors.surfaceAlt,
              textAlign: "center",
              opacity: 0.5,
            }}
          >
            <div style={{ fontSize: "28px", marginBottom: "6px", filter: "grayscale(1)" }}>
              {item.achievement.emoji}
            </div>
            <div
              style={{
                fontSize: "12px",
                fontWeight: "600",
                color: colors.textMuted,
                marginBottom: "2px",
              }}
            >
              {item.achievement.name}
            </div>
            <div style={{ fontSize: "11px", color: colors.textMuted }}>
              {item.progressHint}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── BADGE CELEBRATION MODAL ───────────────────────────────

function BadgeCelebrationModal({
  badge,
  onDismiss,
}: {
  badge: any;
  onDismiss: () => void;
}) {
  const tierBg = {
    bronze: colors.bronzeBg,
    silver: colors.silverBg,
    gold: colors.goldBg,
    diamond: "#e8f7ff",
  }[badge.tier as string] || colors.surfaceAlt;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "20px",
      }}
      onClick={onDismiss}
    >
      <div
        style={{
          background: colors.surface,
          borderRadius: "24px",
          padding: "40px 32px",
          maxWidth: "320px",
          width: "100%",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          animation: "badgePopIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: "14px", fontWeight: "600", color: colors.accent, marginBottom: "16px" }}>
          🎉 NEW BADGE EARNED!
        </div>

        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: tierBg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "40px",
            margin: "0 auto 16px",
          }}
        >
          {badge.emoji}
        </div>

        <div
          style={{
            fontSize: "20px",
            fontWeight: "700",
            color: colors.text,
            marginBottom: "8px",
          }}
        >
          {badge.name}
        </div>

        <div
          style={{
            fontSize: "14px",
            color: colors.textSecondary,
            marginBottom: "24px",
          }}
        >
          {badge.description}
        </div>

        <button
          onClick={onDismiss}
          style={{
            padding: "12px 32px",
            borderRadius: "12px",
            border: "none",
            background: colors.accent,
            color: "#ffffff",
            fontSize: "15px",
            fontWeight: "600",
            cursor: "pointer",
            minHeight: "44px",
          }}
        >
          Awesome! 🙌
        </button>
      </div>

      <style>{`
        @keyframes badgePopIn {
          0% { transform: scale(0.5); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
