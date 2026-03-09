"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type TopTab = "model" | "winning" | "competitor";

type CrmUser = {
  id: string;
  role: string;
  assignedCreators?: string[];
};

type Creator = {
  id: string;
  name: string;
  avatar_url?: string | null;
  instagram_username?: string | null;
  instagram_usernames?: string[] | null;
};

type IgAccount = {
  id: string;
  creator_id?: string | null;
  username?: string | null;
  followers?: number | null;
};

type ReelAnalysis = {
  id: string;
  own_reel_id?: string | null;
  competitor_reel_id?: string | null;
  hook?: string | null;
  retention?: string | null;
  pattern_name?: string | null;
  pattern_formula?: string | null;
  triggers?: string[] | null;
  props?: string[] | null;
  difficulty?: number | null;
  difficulty_note?: string | null;
  performance_analysis?: string | null;
};

type WinningReel = {
  id: string;
  ig_account_id?: string | null;
  thumbnail_url?: string | null;
  video_url?: string | null;
  caption?: string | null;
  posted_at?: string | null;
  views: number;
  likes: number;
  comments: number;
  performance_ratio?: number | null;
  is_winner?: boolean | null;
  account_avg_views?: number | null;
  analysis_status?: string | null;
  matched_pattern_id?: string | null;
  account_username?: string | null;
  shortcode?: string | null;
  lifetime_vpd?: number | null;
  effective_vpd?: number | null;
  delta_vpd?: number | null;
  is_trending?: boolean | null;
  projected_views?: number | null;
};

type ContentFormat = {
  id: string;
  name: string;
  icon?: string | null;
};

type Watchlist = {
  id: string;
  creator_id: string;
  format_id: string;
  ig_username: string;
  follower_count?: number | null;
  profile_pic_url?: string | null;
  avg_views?: number | null;
  last_synced_at?: string | null;
};

type CompetitorReel = {
  id: string;
  watchlist_id: string;
  thumbnail_url?: string | null;
  video_url?: string | null;
  play_count?: number | null;
  like_count?: number | null;
  comment_count?: number | null;
  caption?: string | null;
  virality_ratio?: number | null;
  is_outlier?: boolean | null;
  analysis_status?: string | null;
  matched_pattern_id?: string | null;
  ig_media_code?: string | null;
  lifetime_vpd?: number | null;
  effective_vpd?: number | null;
  delta_vpd?: number | null;
  is_trending?: boolean | null;
  projected_views?: number | null;
};

type Pattern = {
  id: string;
  name: string;
  status?: string | null;
  avg_views?: number | null;
  total_reels?: number | null;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function ratioBadgeStyle(ratio?: number | null) {
  const value = Number(ratio || 0);
  if (value > 3) return { bg: "#14532d", text: "#bbf7d0" };
  if (value > 2) return { bg: "#78350f", text: "#fde68a" };
  return { bg: "#7f1d1d", text: "#fecaca" };
}

function CaptionText({ text, lines = 3, style = {} }: { text: string; lines?: number; style?: React.CSSProperties }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        color: "#d4d4d8",
        fontSize: 12,
        lineHeight: 1.4,
        cursor: "pointer",
        ...(!expanded
          ? {
              display: "-webkit-box",
              WebkitLineClamp: lines,
              WebkitBoxOrient: "vertical" as const,
              overflow: "hidden",
            }
          : {}),
        ...style,
      }}
    >
      {text}
    </div>
  );
}

function isAnalyzedStatus(status?: string | null) {
  const normalized = (status || "pending").toLowerCase();
  return normalized === "done" || normalized === "completed" || normalized === "opus_done";
}

function analysisStatusLabel(status?: string | null) {
  const normalized = (status || "pending").toLowerCase();
  if (isAnalyzedStatus(normalized)) {
    return { label: "Analyzed ✅", bg: "#14532d", text: "#bbf7d0" };
  }
  if (normalized === "analyzing" || normalized === "queued" || normalized === "running") {
    return { label: "Analyzing 🔄", bg: "#1e3a8a", text: "#bfdbfe" };
  }
  return { label: "Awaiting Analysis ⏳", bg: "#3f3f46", text: "#d4d4d8" };
}

function getPatternStatus(reelCount: number, winnerCount: number, avgViews: number, globalAvgViews: number) {
  if (reelCount < 3) return "TEST";
  if (avgViews > globalAvgViews && winnerCount >= 1) return "SCALE";
  if (winnerCount === 0 && avgViews < globalAvgViews) return "PIVOT";
  return "OPTIMIZE";
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ color: "#8d8d8d", fontSize: 13, padding: "18px 0" }}>{text}</div>;
}

function AnalysisRows({ analysis }: { analysis?: ReelAnalysis }) {
  const rows = [
    { label: "HOOK", color: "#dc2626", value: analysis?.hook || "—" },
    { label: "RETENTION", color: "#2563eb", value: analysis?.retention || "—" },
    { label: "PATTERN", color: "#d97706", value: analysis?.pattern_formula || analysis?.pattern_name || "—" },
    { label: "TRIGGERS", color: "#7c3aed", value: (analysis?.triggers || []).join(" · ") || "—" },
    { label: "PROPS", color: "#6b7280", value: (analysis?.props || []).join(", ") || "—" },
  ];

  return (
    <>
      {rows.map((row, index) => (
        <div
          key={row.label}
          style={{
            display: "grid",
            gridTemplateColumns: "72px minmax(0,1fr)",
            columnGap: 10,
            alignItems: "start",
            padding: "8px 0",
            borderTop: index === 0 ? "none" : "1px solid rgba(42,42,42,0.3)",
          }}
        >
          <span style={{ color: row.color, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.2 }}>{row.label}</span>
          <span style={{ color: "#e7e7e7", fontSize: 13, lineHeight: 1.4 }}>{row.value}</span>
        </div>
      ))}

      <div
        style={{
          marginTop: 10,
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #92400e",
          background: "linear-gradient(to bottom right, #451a03, #422006)",
          color: "#fbbf24",
          fontSize: 12,
          lineHeight: 1.45,
        }}
      >
        {analysis?.performance_analysis || "No performance notes yet."}
      </div>
    </>
  );
}

function DifficultyDots({ level, note }: { level?: number | null; note?: string | null }) {
  if (!level || level < 1) return <span style={{ fontSize: 12, color: "#8f8f8f" }}>Difficulty —</span>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ display: "flex", gap: 4 }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: i <= level ? "#fbbf24" : "#374151",
              display: "inline-block",
            }}
          />
        ))}
      </div>
      <span style={{ fontSize: 12, color: "#cfcfcf" }}>{level}/5 {note ? `· ${note}` : ""}</span>
    </div>
  );
}

function IdeaCard({
  title,
  thumbnail,
  video,
  views,
  likes,
  comments,
  accountUsername,
  ratio,
  badge,
  status,
  analysis,
  shortcode,
  vpd,
  projectedViews,
  isTrending,
}: {
  title?: string | null;
  thumbnail?: string | null;
  video?: string | null;
  views: number;
  likes: number;
  comments: number;
  accountUsername?: string | null;
  ratio?: number | null;
  badge?: string;
  status?: string | null;
  analysis?: ReelAnalysis;
  shortcode?: string | null;
  vpd?: number | null;
  projectedViews?: number | null;
  isTrending?: boolean | null;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ratioStyle = ratioBadgeStyle(ratio);
  const statusStyle = analysisStatusLabel(status);

  return (
    <div style={{ background: "#171717", border: "1px solid #2a2a2a", borderRadius: 14, overflow: "hidden", display: "flex", minHeight: 320 }}>
      <div style={{ width: 200, flexShrink: 0, background: "#0f0f0f", position: "relative", overflow: "hidden" }}>
        {video ? (
          <>
            <video
              ref={videoRef}
              src={video}
              poster={thumbnail || undefined}
              controls={playing}
              playsInline
              preload="none"
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {!playing ? (
              <button
                onClick={() => {
                  setPlaying(true);
                  videoRef.current?.play().catch(() => null);
                }}
                style={{ position: "absolute", inset: 0, border: "none", background: "rgba(0,0,0,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <span style={{ width: 44, height: 44, borderRadius: 999, background: "#fff", color: "#111", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16 }}>▶</span>
              </button>
            ) : null}
          </>
        ) : thumbnail ? (
          <img src={thumbnail} alt={title || "Reel"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>🎬</div>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #2a2a2a", display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          {accountUsername ? <span style={{ color: "#e5e7eb", fontWeight: 700 }}>@{normalizeUsername(accountUsername)}</span> : null}
          <span style={{ color: "#fff", fontWeight: 700 }}>{formatNumber(views)} views</span>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>❤️ {formatNumber(likes)} · 💬 {formatNumber(comments)}</span>
          <span style={{ background: "#1e293b", color: "#93c5fd", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
            {formatNumber(Math.round(vpd || 0))} VPD
          </span>
          <span style={{ background: ratioStyle.bg, color: ratioStyle.text, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>{Number(ratio || 0).toFixed(1)}x</span>
          {projectedViews && projectedViews > 0 ? (
            <span style={{ background: "#1a1a2e", color: "#a78bfa", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px" }}>
              → {formatNumber(Math.round(projectedViews))} projected
            </span>
          ) : null}
          {isTrending ? (
            <span style={{ background: "#7c2d12", color: "#fdba74", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
              🔥 TRENDING
            </span>
          ) : null}
          {badge ? <span style={{ background: "#1f2937", color: "#cbd5e1", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>{badge}</span> : null}
          <span style={{ marginLeft: "auto", background: statusStyle.bg, color: statusStyle.text, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
            {statusStyle.label}
          </span>
        </div>

        {!analysis ? <CaptionText text={title || "No caption"} style={{ padding: "10px 14px" }} /> : null}
        <div style={{ padding: "0 14px 14px 14px", flex: 1 }}>
          <AnalysisRows analysis={analysis} />
        </div>

        <div style={{ borderTop: "1px solid #2a2a2a", padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <DifficultyDots level={analysis?.difficulty} note={analysis?.difficulty_note} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {shortcode ? (
              <a
                href={`https://www.instagram.com/reel/${shortcode}/`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ border: "1px solid #3f3f46", background: "#18181b", color: "#d4d4d8", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}
              >
                <span>↗</span>
                <span>Open on IG</span>
              </a>
            ) : null}
            <button
              onClick={() => console.log("Reproduce placeholder", { title, ratio, status })}
              style={{ border: "1px solid #355273", background: "#243547", color: "#dbeafe", borderRadius: 8, padding: "6px 10px", fontWeight: 700, cursor: "pointer", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <span>✨</span>
              <span>Reproduce</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThumbnailCard({
  title,
  thumbnail,
  views,
  likes,
  comments,
  ratio,
  status,
  badge,
  shortcode,
  vpd,
  isTrending,
}: {
  title?: string | null;
  thumbnail?: string | null;
  views: number;
  likes: number;
  comments: number;
  ratio?: number | null;
  status?: string | null;
  badge?: string;
  shortcode?: string | null;
  vpd?: number | null;
  isTrending?: boolean | null;
}) {
  const ratioStyle = ratioBadgeStyle(ratio);
  const statusStyle = analysisStatusLabel(status);

  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ aspectRatio: "9/16", background: "#0f0f0f", overflow: "hidden" }}>
        {thumbnail ? <img src={thumbnail} alt={title || "Reel"} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
      </div>
      <div style={{ padding: 10 }}>
        <CaptionText text={title || "No caption"} lines={3} style={{ minHeight: 34 }} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>👁 {formatNumber(views)}</span>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>❤️ {formatNumber(likes)}</span>
          <span style={{ color: "#9ca3af", fontSize: 12 }}>💬 {formatNumber(comments)}</span>
          <span style={{ background: ratioStyle.bg, color: ratioStyle.text, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "3px 8px" }}>{Number(ratio || 0).toFixed(1)}x</span>
          {vpd ? (
            <span style={{ color: "#93c5fd", fontSize: 10, fontWeight: 700 }}>
              {formatNumber(Math.round(vpd))} VPD
            </span>
          ) : null}
          {isTrending ? (
            <span style={{ color: "#fdba74", fontSize: 10, fontWeight: 700 }}>🔥</span>
          ) : null}
          {badge ? <span style={{ background: "#1f2937", color: "#cbd5e1", fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 8px" }}>{badge}</span> : null}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ display: "inline-block", background: statusStyle.bg, color: statusStyle.text, fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>{statusStyle.label}</span>
          {shortcode ? (
            <a
              href={`https://www.instagram.com/reel/${shortcode}/`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#1f2937", color: "#93c5fd", fontSize: 10, fontWeight: 700, borderRadius: 999, padding: "4px 8px", textDecoration: "none" }}
            >
              ↗ IG
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TrafficAnalyticsPage() {
  const [user, setUser] = useState<CrmUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [creators, setCreators] = useState<Creator[]>([]);
  const [selectedCreatorId, setSelectedCreatorId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<TopTab>("model");

  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([]);
  const [winningReels, setWinningReels] = useState<WinningReel[]>([]);
  const [winningAnalyses, setWinningAnalyses] = useState<Record<string, ReelAnalysis>>({});
  const [winnerOnly, setWinnerOnly] = useState(true);
  const [trendingOnly, setTrendingOnly] = useState(false);

  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [selectedPatternId, setSelectedPatternId] = useState<string>("");
  const [patternLibraryOpen, setPatternLibraryOpen] = useState(true);

  const [formats, setFormats] = useState<ContentFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [competitorReels, setCompetitorReels] = useState<CompetitorReel[]>([]);
  const [competitorAnalyses, setCompetitorAnalyses] = useState<Record<string, ReelAnalysis>>({});
  const [competitorReloadTick, setCompetitorReloadTick] = useState(0);
  const [competitorTrendingOnly, setCompetitorTrendingOnly] = useState(false);
  const [newFormatName, setNewFormatName] = useState("");
  const [newFormatIcon, setNewFormatIcon] = useState("📁");
  const [showAddFormat, setShowAddFormat] = useState(false);

  useEffect(() => {
    const rawUser = localStorage.getItem("crm_user");
    if (!rawUser) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(rawUser) as CrmUser;
    setUser(parsed);

    async function loadBase() {
      try {
        const [creatorsRes, formatsRes, patternsRes] = await Promise.all([
          supabase
            .from("crm_creators")
            .select("id,name,avatar_url,instagram_username,instagram_usernames")
            .eq("status", "active")
            .order("name", { ascending: true }),
          supabase.from("crm_content_formats").select("id,name,icon").order("name", { ascending: true }),
          supabase.from("patterns").select("id,name,status,avg_views,total_reels").order("avg_views", { ascending: false }),
        ]);

        const allCreators = (creatorsRes.data || []) as Creator[];
        const allowedCreators = parsed.role === "admin"
          ? allCreators
          : allCreators.filter((creator) => (parsed.assignedCreators || []).includes(creator.id));

        setCreators(allowedCreators);
        if (allowedCreators.length > 0) {
          setSelectedCreatorId((prev) => prev || allowedCreators[0].id);
        }

        const fmtRows = (formatsRes.data || []) as ContentFormat[];
        setFormats(fmtRows);
        if (fmtRows.length > 0) {
          setSelectedFormatId((prev) => prev || fmtRows[0].id);
        }

        setPatterns((patternsRes.data || []) as Pattern[]);
      } catch (err) {
        console.error("Failed to load traffic analytics data:", err);
      } finally {
        setLoading(false);
      }
    }

    void loadBase();
  }, []);

  const selectedCreator = useMemo(
    () => creators.find((creator) => creator.id === selectedCreatorId) || null,
    [creators, selectedCreatorId],
  );

  useEffect(() => {
    if (!selectedCreatorId) return;

    async function loadCreatorData() {
      const { data: allAccounts } = await supabase
        .from("crm_ig_accounts")
        .select("id,creator_id,username,followers,is_active")
        .neq("is_active", false)
        .order("followers", { ascending: false });

      const creator = creators.find((c) => c.id === selectedCreatorId) || null;
      const usernames = new Set(
        [creator?.instagram_username || "", ...((creator?.instagram_usernames || []) as string[])]
          .map((name) => normalizeUsername(name))
          .filter(Boolean),
      );

      const filteredAccounts = ((allAccounts || []) as IgAccount[]).filter((account) => {
        if (account.creator_id === selectedCreatorId) return true;
        if (!account.username) return false;
        return usernames.has(normalizeUsername(account.username));
      });

      setIgAccounts(filteredAccounts);

      if (filteredAccounts.length === 0) {
        setWinningReels([]);
        setWinningAnalyses({});
        return;
      }

      const accountIds = filteredAccounts.map((a) => a.id);
      const { data: ownReelsData } = await supabase
        .from("crm_ig_reels")
        .select("id,ig_account_id,thumbnail_url,video_url,caption,posted_at,views,likes,comments,performance_ratio,is_winner,account_avg_views,analysis_status,matched_pattern_id,shortcode,lifetime_vpd,effective_vpd,delta_vpd,is_trending,projected_views,crm_ig_accounts!inner(username)")
        .in("ig_account_id", accountIds)
        .neq("is_deleted", true)
        .order("effective_vpd", { ascending: false, nullsFirst: false })
        .limit(5000);

      const reels = ((ownReelsData || []) as any[])
        .map((reel) => ({
          id: String(reel.id),
          ig_account_id: reel.ig_account_id,
          thumbnail_url: reel.thumbnail_url,
          video_url: reel.video_url,
          caption: reel.caption,
          posted_at: reel.posted_at,
          views: Number(reel.views || 0),
          likes: Number(reel.likes || 0),
          comments: Number(reel.comments || 0),
          performance_ratio: reel.performance_ratio == null ? 0 : Number(reel.performance_ratio),
          is_winner: Boolean(reel.is_winner),
          account_avg_views: reel.account_avg_views == null ? 0 : Number(reel.account_avg_views),
          analysis_status: reel.analysis_status || "pending",
          matched_pattern_id: reel.matched_pattern_id || null,
          account_username: reel.crm_ig_accounts?.username || null,
          shortcode: reel.shortcode || null,
          lifetime_vpd: reel.lifetime_vpd == null ? null : Number(reel.lifetime_vpd),
          effective_vpd: reel.effective_vpd == null ? null : Number(reel.effective_vpd),
          delta_vpd: reel.delta_vpd == null ? null : Number(reel.delta_vpd),
          is_trending: Boolean(reel.is_trending),
          projected_views: reel.projected_views == null ? null : Number(reel.projected_views),
        }))
        .sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));

      setWinningReels(reels);

      if (reels.length === 0) {
        setWinningAnalyses({});
        return;
      }

      const { data: ownAnalyses } = await supabase
        .from("crm_reel_analyses")
        .select("id,own_reel_id,hook,retention,pattern_name,pattern_formula,triggers,props,difficulty,difficulty_note,performance_analysis")
        .not("own_reel_id", "is", null)
        .limit(5000);

      const map: Record<string, ReelAnalysis> = {};
      (ownAnalyses || []).forEach((row: any) => {
        if (row.own_reel_id) {
          map[String(row.own_reel_id)] = {
            ...row,
            triggers: Array.isArray(row.triggers) ? row.triggers : [],
            props: Array.isArray(row.props) ? row.props : [],
          };
        }
      });
      setWinningAnalyses(map);
    }

    void loadCreatorData();
  }, [selectedCreatorId, creators]);

  useEffect(() => {
    if (!selectedCreatorId || !selectedFormatId) return;

    async function loadCompetitorData() {
      const { data: watchlistRows } = await supabase
        .from("crm_competitor_watchlists")
        .select("id,creator_id,format_id,ig_username,follower_count,profile_pic_url,avg_views,last_synced_at")
        .eq("creator_id", selectedCreatorId)
        .eq("format_id", selectedFormatId)
        .order("created_at", { ascending: false });

      const wl = (watchlistRows || []) as Watchlist[];
      setWatchlists(wl);

      if (wl.length === 0) {
        setCompetitorReels([]);
        setCompetitorAnalyses({});
        return;
      }

      const watchlistIds = wl.map((row) => row.id);
      const { data: reelRows } = await supabase
        .from("crm_competitor_reels")
        .select("id,watchlist_id,thumbnail_url,video_url,play_count,like_count,comment_count,caption,virality_ratio,is_outlier,analysis_status,matched_pattern_id,ig_media_code,lifetime_vpd,effective_vpd,delta_vpd,is_trending,projected_views")
        .in("watchlist_id", watchlistIds)
        .eq("is_outlier", true)
        .order("effective_vpd", { ascending: false, nullsFirst: false })
        .limit(5000);

      const outliers = ((reelRows || []) as CompetitorReel[]).sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));
      setCompetitorReels(outliers);

      if (outliers.length === 0) {
        setCompetitorAnalyses({});
        return;
      }

      const { data: compAnalyses } = await supabase
        .from("crm_reel_analyses")
        .select("id,competitor_reel_id,hook,retention,pattern_name,pattern_formula,triggers,props,difficulty,difficulty_note,performance_analysis")
        .in("competitor_reel_id", outliers.map((row) => row.id));

      const map: Record<string, ReelAnalysis> = {};
      (compAnalyses || []).forEach((row: any) => {
        if (row.competitor_reel_id) {
          map[String(row.competitor_reel_id)] = {
            ...row,
            triggers: Array.isArray(row.triggers) ? row.triggers : [],
            props: Array.isArray(row.props) ? row.props : [],
          };
        }
      });
      setCompetitorAnalyses(map);
    }

    void loadCompetitorData();
  }, [selectedCreatorId, selectedFormatId, competitorReloadTick]);

  const modelStats = useMemo(() => {
    const totalFollowers = igAccounts.reduce((sum, account) => sum + Number(account.followers || 0), 0);
    const totalReels = winningReels.length;
    const avgViews = winningReels.length > 0
      ? winningReels.reduce((sum, reel) => sum + reel.views, 0) / winningReels.length
      : 0;

    return { totalFollowers, totalReels, avgViews };
  }, [igAccounts, winningReels]);

  const winningStats = useMemo(() => {
    const trendingCount = winningReels.filter((reel) => reel.is_trending).length;
    const winnerCount = winningReels.filter((reel) => reel.is_winner).length;
    const avgVpd = winningReels.length > 0
      ? winningReels.reduce((sum, reel) => sum + Number(reel.effective_vpd || 0), 0) / winningReels.length
      : 0;

    return { trendingCount, winnerCount, avgVpd };
  }, [winningReels]);

  const winningFiltered = useMemo(() => {
    return winningReels
      .filter((reel) => (!winnerOnly || Boolean(reel.is_winner)))
      .filter((reel) => (!trendingOnly || Boolean(reel.is_trending)))
      .filter((reel) => (!selectedPatternId || reel.matched_pattern_id === selectedPatternId))
      .sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));
  }, [winningReels, winnerOnly, trendingOnly, selectedPatternId]);

  const winningAnalyzed = useMemo(() => {
    return winningFiltered.filter((reel) => {
      const analysis = winningAnalyses[reel.id];
      return isAnalyzedStatus(reel.analysis_status) && Boolean(analysis);
    });
  }, [winningFiltered, winningAnalyses]);

  const winningUnanalyzed = useMemo(() => {
    return winningFiltered.filter((reel) => {
      const analysis = winningAnalyses[reel.id];
      return !(isAnalyzedStatus(reel.analysis_status) && Boolean(analysis));
    });
  }, [winningFiltered, winningAnalyses]);

  const watchlistUsernames = useMemo(() => {
    return watchlists.reduce<Record<string, string>>((acc, watch) => {
      acc[watch.id] = watch.ig_username;
      return acc;
    }, {});
  }, [watchlists]);

  const competitorFiltered = useMemo(() => {
    return competitorReels
      .filter((reel) => (!competitorTrendingOnly || Boolean(reel.is_trending)))
      .sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));
  }, [competitorReels, competitorTrendingOnly]);

  const competitorStats = useMemo(() => {
    const trendingCount = competitorReels.filter((reel) => reel.is_trending).length;
    const outlierCount = competitorReels.filter((reel) => reel.is_outlier).length;
    const avgVpd = competitorReels.length > 0
      ? competitorReels.reduce((sum, reel) => sum + Number(reel.effective_vpd || 0), 0) / competitorReels.length
      : 0;
    return { trendingCount, outlierCount, avgVpd };
  }, [competitorReels]);

  const competitorAnalyzed = useMemo(() => {
    return competitorFiltered.filter((reel) => {
      const analysis = competitorAnalyses[reel.id];
      return isAnalyzedStatus(reel.analysis_status) && Boolean(analysis);
    });
  }, [competitorFiltered, competitorAnalyses]);

  const competitorUnanalyzed = useMemo(() => {
    return competitorFiltered.filter((reel) => {
      const analysis = competitorAnalyses[reel.id];
      return !(isAnalyzedStatus(reel.analysis_status) && Boolean(analysis));
    });
  }, [competitorFiltered, competitorAnalyses]);

  const patternSummary = useMemo(() => {
    const globalAvg = winningReels.length
      ? winningReels.reduce((sum, reel) => sum + reel.views, 0) / winningReels.length
      : 0;

    return patterns.map((pattern) => {
      const reels = winningReels.filter((reel) => reel.matched_pattern_id === pattern.id);
      const reelCount = reels.length;
      const winnerCount = reels.filter((reel) => reel.is_winner).length;
      const avgViews = reelCount ? reels.reduce((sum, reel) => sum + reel.views, 0) / reelCount : Number(pattern.avg_views || 0);
      return {
        ...pattern,
        reelCount,
        avgViews,
        winnerCount,
        computedStatus: getPatternStatus(reelCount, winnerCount, avgViews, globalAvg),
      };
    });
  }, [patterns, winningReels]);

  async function addCompetitor() {
    if (!selectedCreatorId || !selectedFormatId || !watchlistInput.trim()) return;

    const username = normalizeUsername(watchlistInput);
    const { error } = await supabase
      .from("crm_competitor_watchlists")
      .insert({
        creator_id: selectedCreatorId,
        format_id: selectedFormatId,
        ig_username: username,
        created_by: user?.id || null,
      });

    if (!error) {
      setWatchlistInput("");
      setCompetitorReloadTick((prev) => prev + 1);
    }
  }

  async function removeCompetitor(watchlistId: string) {
    const { error } = await supabase
      .from("crm_competitor_watchlists")
      .delete()
      .eq("id", watchlistId);

    if (!error) {
      setWatchlists((prev) => prev.filter((row) => row.id !== watchlistId));
      setCompetitorReels((prev) => prev.filter((row) => row.watchlist_id !== watchlistId));
      setCompetitorReloadTick((prev) => prev + 1);
    }
  }

  if (!user) return null;

  if (user.role !== "admin" && user.role !== "marketing_manager") {
    return <div style={{ color: "#fff", padding: 24 }}>🔒 This page is for marketing managers and admins.</div>;
  }

  return (
    <div style={{ maxWidth: 1440 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 30, color: "#fff", margin: 0 }}>🔬 Traffic Analytics</h1>
        <p style={{ color: "#a3a3a3", marginTop: 8 }}>Analyze winning patterns and competitor outliers by creator + format.</p>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={selectedCreatorId}
          onChange={(event) => setSelectedCreatorId(event.target.value)}
          style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #2b2b2b", borderRadius: 10, padding: "10px 12px", minWidth: 140, flex: "1 1 140px", maxWidth: 320 }}
        >
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>{creator.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, overflowX: "auto", WebkitOverflowScrolling: "touch", paddingBottom: 4 }}>
        {([
          ["model", "Model Info"],
          ["winning", "Winning Patterns"],
          ["competitor", "Competitor Analysis"],
        ] as [TopTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              background: activeTab === key ? "#243547" : "transparent",
              color: activeTab === key ? "#fff" : "#a1a1a1",
              border: "1px solid #2b2b2b",
              borderColor: activeTab === key ? "#355273" : "#2b2b2b",
              borderRadius: 10,
              padding: "9px 14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <EmptyState text="Loading traffic analytics…" /> : null}

      {!loading && activeTab === "model" ? (
        <div style={{ display: "grid", gap: 14 }}>
          <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 14, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {selectedCreator?.avatar_url ? (
                <img src={selectedCreator.avatar_url} alt={selectedCreator.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
              ) : (
                <div style={{ width: 56, height: 56, borderRadius: 14, background: "#2f2f2f", display: "flex", alignItems: "center", justifyContent: "center" }}>👤</div>
              )}
              <div>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 18 }}>{selectedCreator?.name || "—"}</div>
                <div style={{ color: "#a1a1a1", fontSize: 13 }}>
                  {(selectedCreator?.instagram_usernames || []).length > 0
                    ? (selectedCreator?.instagram_usernames || []).join(", ")
                    : selectedCreator?.instagram_username || "No IG usernames mapped"}
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>IG Followers</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(modelStats.totalFollowers)}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>Reels</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(modelStats.totalReels)}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>Avg Views</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(Math.round(modelStats.avgViews))}</div>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && activeTab === "winning" ? (
        <div>
          <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 14, marginBottom: 14 }}>
            <button
              onClick={() => setPatternLibraryOpen((prev) => !prev)}
              style={{ width: "100%", background: "transparent", border: "none", color: "#fff", cursor: "pointer", padding: 12, textAlign: "left", fontWeight: 800 }}
            >
              Pattern Library {patternLibraryOpen ? "▾" : "▸"}
            </button>
            {patternLibraryOpen ? (
              <div style={{ padding: 12, borderTop: "1px solid #2b2b2b", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
                {patternSummary.map((pattern) => (
                  <button
                    key={pattern.id}
                    onClick={() => setSelectedPatternId((prev) => (prev === pattern.id ? "" : pattern.id))}
                    style={{
                      textAlign: "left",
                      borderRadius: 12,
                      border: selectedPatternId === pattern.id ? "1px solid #3b82f6" : "1px solid #2f2f2f",
                      background: selectedPatternId === pattern.id ? "#172554" : "#111111",
                      padding: 10,
                      color: "#f4f4f5",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <strong style={{ fontSize: 13 }}>{pattern.name}</strong>
                      <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "3px 7px", background: "#27272a", color: "#e4e4e7" }}>{pattern.computedStatus}</span>
                    </div>
                    <div style={{ marginTop: 7, color: "#a1a1aa", fontSize: 12 }}>
                      Avg views: {formatNumber(Math.round(Number(pattern.avgViews || 0)))}
                    </div>
                    <div style={{ color: "#71717a", fontSize: 11, marginTop: 2 }}>
                      Reels: {pattern.reelCount} · Winners: {pattern.winnerCount}
                    </div>
                  </button>
                ))}
                {patternSummary.length === 0 ? <EmptyState text="No patterns yet." /> : null}
              </div>
            ) : null}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>Winners</div>
              <div style={{ color: "#bbf7d0", fontWeight: 800, fontSize: 18 }}>{winningStats.winnerCount}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>🔥 Trending</div>
              <div style={{ color: "#fdba74", fontWeight: 800, fontSize: 18 }}>{winningStats.trendingCount}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>Avg VPD</div>
              <div style={{ color: "#93c5fd", fontWeight: 800, fontSize: 18 }}>{formatNumber(Math.round(winningStats.avgVpd))}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => setWinnerOnly((v) => !v)}
              style={{
                border: "1px solid #2b2b2b",
                background: winnerOnly ? "#14532d" : "#18181b",
                color: winnerOnly ? "#dcfce7" : "#a1a1a1",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Winners Only
            </button>
            <button
              onClick={() => setTrendingOnly(!trendingOnly)}
              style={{
                border: "1px solid #2b2b2b",
                background: trendingOnly ? "#7c2d12" : "#18181b",
                color: trendingOnly ? "#fdba74" : "#a1a1a1",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔥 Trending
            </button>
            {selectedPatternId ? (
              <button
                onClick={() => setSelectedPatternId("")}
                style={{ border: "1px solid #3f3f46", background: "#18181b", color: "#d4d4d8", borderRadius: 999, padding: "6px 12px", cursor: "pointer" }}
              >
                Clear Pattern Filter
              </button>
            ) : null}
            <span style={{ marginLeft: "auto", color: "#8f8f8f", fontSize: 12 }}>{winningFiltered.length} reels</span>
          </div>

          {winningFiltered.length === 0 ? <EmptyState text="No reels match current filters." /> : null}
          <div style={{ display: "grid", gap: 12 }}>
            {winningAnalyzed.map((reel) => {
              const analysis = winningAnalyses[reel.id];
              if (!analysis) return null;
              return (
                <IdeaCard
                  key={reel.id}
                  title={reel.caption}
                  thumbnail={reel.thumbnail_url}
                  video={reel.video_url}
                  views={reel.views}
                  likes={reel.likes}
                  comments={reel.comments}
                  accountUsername={reel.account_username}
                  ratio={reel.performance_ratio}
                  badge={reel.is_winner ? "WINNER" : undefined}
                  status={reel.analysis_status}
                  analysis={analysis}
                  shortcode={reel.shortcode}
                  vpd={reel.effective_vpd}
                  projectedViews={reel.projected_views}
                  isTrending={reel.is_trending}
                />
              );
            })}
          </div>

          {winningUnanalyzed.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
              {winningUnanalyzed.map((reel) => (
                <ThumbnailCard
                  key={reel.id}
                  title={reel.caption}
                  thumbnail={reel.thumbnail_url}
                  views={reel.views}
                  likes={reel.likes}
                  comments={reel.comments}
                  ratio={reel.performance_ratio}
                  status={reel.analysis_status}
                  shortcode={reel.shortcode}
                  badge={reel.is_winner ? "WINNER" : undefined}
                  vpd={reel.effective_vpd}
                  isTrending={reel.is_trending}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && activeTab === "competitor" ? (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            {formats.map((format) => (
              <button
                key={format.id}
                onClick={() => setSelectedFormatId(format.id)}
                style={{
                  border: "1px solid #2b2b2b",
                  borderColor: selectedFormatId === format.id ? "#355273" : "#2b2b2b",
                  background: selectedFormatId === format.id ? "#243547" : "transparent",
                  color: selectedFormatId === format.id ? "#fff" : "#a1a1a1",
                  borderRadius: 999,
                  padding: "7px 12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {format.icon || "📁"} {format.name}
              </button>
            ))}
            {user.role === "admin" && !showAddFormat && (
              <button
                onClick={() => setShowAddFormat(true)}
                style={{ border: "1px dashed #444", background: "transparent", color: "#666", borderRadius: 999, padding: "7px 12px", fontWeight: 700, cursor: "pointer" }}
              >
                + Add Format
              </button>
            )}
            {user.role === "admin" && showAddFormat && (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  value={newFormatIcon}
                  onChange={(e) => setNewFormatIcon(e.target.value)}
                  placeholder="📁"
                  style={{ width: 40, background: "#1a1a1a", color: "#fff", border: "1px solid #2b2b2b", borderRadius: 8, padding: "6px", textAlign: "center" }}
                />
                <input
                  value={newFormatName}
                  onChange={(e) => setNewFormatName(e.target.value)}
                  placeholder="Format name..."
                  style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #2b2b2b", borderRadius: 8, padding: "6px 10px", minWidth: 140 }}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newFormatName.trim()) {
                      const { data, error } = await supabase
                        .from("crm_content_formats")
                        .insert({ name: newFormatName.trim(), icon: newFormatIcon || "📁" })
                        .select()
                        .single();
                      if (data && !error) {
                        setFormats((prev) => [...prev, data as ContentFormat]);
                        setNewFormatName("");
                        setNewFormatIcon("📁");
                        setShowAddFormat(false);
                      }
                    }
                  }}
                />
                <button
                  onClick={async () => {
                    if (!newFormatName.trim()) return;
                    const { data, error } = await supabase
                      .from("crm_content_formats")
                      .insert({ name: newFormatName.trim(), icon: newFormatIcon || "📁" })
                      .select()
                      .single();
                    if (data && !error) {
                      setFormats((prev) => [...prev, data as ContentFormat]);
                      setNewFormatName("");
                      setNewFormatIcon("📁");
                      setShowAddFormat(false);
                    }
                  }}
                  style={{ background: "#243547", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 700 }}
                >
                  Add
                </button>
                <button
                  onClick={() => { setShowAddFormat(false); setNewFormatName(""); setNewFormatIcon("📁"); }}
                  style={{ background: "transparent", color: "#666", border: "none", cursor: "pointer", fontSize: 18 }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Watchlist Management</div>

            {user.role === "admin" ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input
                  value={watchlistInput}
                  onChange={(event) => setWatchlistInput(event.target.value)}
                  placeholder="Add competitor username (e.g. @example)"
                  style={{ flex: "1 1 180px", minWidth: 0, background: "#121212", border: "1px solid #2f2f2f", borderRadius: 10, color: "#fff", padding: "9px 10px" }}
                />
                <button onClick={() => void addCompetitor()} style={{ background: "#243547", border: "1px solid #355273", color: "#fff", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontWeight: 700 }}>
                  Add Competitor
                </button>
              </div>
            ) : null}

            {watchlists.length === 0 ? <EmptyState text="No competitors in watchlist for this format." /> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10 }}>
              {watchlists.map((watch) => (
                <div key={watch.id} style={{ background: "#131313", border: "1px solid #2a2a2a", borderRadius: 12, padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {watch.profile_pic_url ? (
                      <img src={watch.profile_pic_url} alt={watch.ig_username} style={{ width: 34, height: 34, borderRadius: 999 }} />
                    ) : (
                      <div style={{ width: 34, height: 34, borderRadius: 999, background: "#2f2f2f" }} />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>@{watch.ig_username}</div>
                      <div style={{ color: "#8f8f8f", fontSize: 11 }}>{watch.follower_count ? `${formatNumber(watch.follower_count)} followers` : "followers —"}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, color: "#a1a1a1", fontSize: 12 }}>Avg views: {watch.avg_views ? formatNumber(Math.round(Number(watch.avg_views))) : "—"}</div>
                  <div style={{ color: "#717171", fontSize: 11, marginTop: 3 }}>Last synced: {watch.last_synced_at ? new Date(watch.last_synced_at).toLocaleString() : "never"}</div>
                  {user.role === "admin" ? (
                    <button onClick={() => void removeCompetitor(watch.id)} style={{ marginTop: 8, background: "transparent", border: "1px solid #4b1f1f", color: "#f87171", borderRadius: 8, padding: "6px 9px", cursor: "pointer", fontSize: 12 }}>
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 10, marginBottom: 14 }}>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>Outliers</div>
              <div style={{ color: "#bbf7d0", fontWeight: 800, fontSize: 18 }}>{competitorStats.outlierCount}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>🔥 Trending</div>
              <div style={{ color: "#fdba74", fontWeight: 800, fontSize: 18 }}>{competitorStats.trendingCount}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#8f8f8f", fontSize: 11 }}>Avg VPD</div>
              <div style={{ color: "#93c5fd", fontWeight: 800, fontSize: 18 }}>{formatNumber(Math.round(competitorStats.avgVpd))}</div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <button
              onClick={() => setCompetitorTrendingOnly(!competitorTrendingOnly)}
              style={{
                border: "1px solid #2b2b2b",
                background: competitorTrendingOnly ? "#7c2d12" : "#18181b",
                color: competitorTrendingOnly ? "#fdba74" : "#a1a1a1",
                borderRadius: 999,
                padding: "6px 12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              🔥 Trending
            </button>
            <span style={{ marginLeft: "auto", color: "#8f8f8f", fontSize: 12 }}>{competitorFiltered.length} reels</span>
          </div>

          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Outlier Reels</div>
          {competitorFiltered.length === 0 ? <EmptyState text="No competitor outlier reels match current filters." /> : null}
          <div style={{ display: "grid", gap: 12 }}>
            {competitorAnalyzed.map((reel) => {
              const analysis = competitorAnalyses[reel.id];
              if (!analysis) return null;
              return (
                <IdeaCard
                  key={reel.id}
                  title={reel.caption}
                  thumbnail={reel.thumbnail_url}
                  video={reel.video_url}
                  views={Number(reel.play_count || 0)}
                  likes={Number(reel.like_count || 0)}
                  comments={Number(reel.comment_count || 0)}
                  accountUsername={watchlistUsernames[reel.watchlist_id] || null}
                  ratio={reel.virality_ratio}
                  badge={reel.is_outlier ? "OUTLIER" : undefined}
                  status={reel.analysis_status}
                  analysis={analysis}
                  shortcode={reel.ig_media_code}
                  vpd={reel.effective_vpd}
                  projectedViews={reel.projected_views}
                  isTrending={reel.is_trending}
                />
              );
            })}
          </div>

          {competitorUnanalyzed.length > 0 ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginTop: 12 }}>
              {competitorUnanalyzed.map((reel) => (
                <ThumbnailCard
                  key={reel.id}
                  title={reel.caption}
                  thumbnail={reel.thumbnail_url}
                  views={Number(reel.play_count || 0)}
                  likes={Number(reel.like_count || 0)}
                  comments={Number(reel.comment_count || 0)}
                  ratio={reel.virality_ratio}
                  status={reel.analysis_status}
                  badge={reel.is_outlier ? "OUTLIER" : undefined}
                  shortcode={reel.ig_media_code}
                  vpd={reel.effective_vpd}
                  isTrending={reel.is_trending}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
