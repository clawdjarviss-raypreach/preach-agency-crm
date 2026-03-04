"use client";

import { useEffect, useMemo, useState } from "react";
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
  profile_image_url?: string | null;
  instagram_username?: string | null;
  instagram_usernames?: string[] | null;
};

type IgAccount = {
  id: string;
  creator_id?: string | null;
  username?: string | null;
  followers?: number | null;
  profile_pic_url?: string | null;
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
  thumbnail_url?: string | null;
  caption?: string | null;
  posted_at?: string | null;
  views: number;
  likes: number;
  comments: number;
  outlierMultiplier: number;
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
  outlier_multiplier?: number | null;
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function normalizeUsername(value: string): string {
  return value.trim().replace(/^@/, "").toLowerCase();
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ color: "#8d8d8d", fontSize: 13, padding: "18px 0" }}>{text}</div>;
}

function ReelCard({
  title,
  thumbnail,
  video,
  views,
  likes,
  comments,
  outlierMultiplier,
  analysis,
  expanded,
  onToggle,
}: {
  title?: string | null;
  thumbnail?: string | null;
  video?: string | null;
  views: number;
  likes: number;
  comments: number;
  outlierMultiplier?: number | null;
  analysis?: ReelAnalysis;
  expanded: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 14, overflow: "hidden" }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", textAlign: "left", background: "transparent", border: "none", padding: 0, cursor: "pointer" }}
      >
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{ position: "relative", aspectRatio: "9/16", background: "#101010" }}
        >
          {thumbnail ? (
            <img src={thumbnail} alt={title || "Reel"} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#666" }}>🎬</div>
          )}
          {hovered && video ? (
            <video muted autoPlay loop playsInline src={video} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          ) : null}
          <div style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(0,0,0,0.7)", color: "#fff", fontSize: 12, borderRadius: 8, padding: "4px 8px", fontWeight: 700 }}>
            👁 {formatNumber(views)}
          </div>
        </div>
      </button>
      <div style={{ padding: 10 }}>
        <div style={{ color: "#d1d1d1", fontSize: 12, minHeight: 30, lineHeight: 1.3, marginBottom: 8, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2 as unknown as number, WebkitBoxOrient: "vertical" as unknown as "vertical" }}>
          {title || "No caption"}
        </div>
        <div style={{ display: "flex", gap: 10, color: "#a1a1a1", fontSize: 12 }}>
          <span>❤️ {formatNumber(likes)}</span>
          <span>💬 {formatNumber(comments)}</span>
          {outlierMultiplier ? <span style={{ color: "#3b82f6", fontWeight: 700 }}>{outlierMultiplier.toFixed(1)}x</span> : null}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: analysis ? "#22c55e" : "#a1a1a1", fontWeight: 700 }}>
          {analysis ? "Analyzed ✅" : "Awaiting Analysis"}
        </div>
        {expanded ? (
          <div style={{ marginTop: 10, borderTop: "1px solid #2a2a2a", paddingTop: 10, fontSize: 12, color: "#d8d8d8", lineHeight: 1.45 }}>
            <div><b>Hook:</b> {analysis?.hook || "—"}</div>
            <div><b>Retention:</b> {analysis?.retention || "—"}</div>
            <div><b>Pattern:</b> {analysis?.pattern_name || "—"}</div>
            <div><b>Formula:</b> {analysis?.pattern_formula || "—"}</div>
            <div><b>Triggers:</b> {(analysis?.triggers || []).join(", ") || "—"}</div>
            <div><b>Props:</b> {(analysis?.props || []).join(", ") || "—"}</div>
            <div><b>Difficulty:</b> {analysis?.difficulty ?? "—"} {analysis?.difficulty_note ? `(${analysis.difficulty_note})` : ""}</div>
            <div><b>Performance:</b> {analysis?.performance_analysis || "—"}</div>
          </div>
        ) : null}
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
  const [expandedWinning, setExpandedWinning] = useState<string | null>(null);

  const [formats, setFormats] = useState<ContentFormat[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState<string>("");
  const [watchlists, setWatchlists] = useState<Watchlist[]>([]);
  const [watchlistInput, setWatchlistInput] = useState("");
  const [competitorReels, setCompetitorReels] = useState<CompetitorReel[]>([]);
  const [competitorAnalyses, setCompetitorAnalyses] = useState<Record<string, ReelAnalysis>>({});
  const [expandedCompetitor, setExpandedCompetitor] = useState<string | null>(null);
  const [competitorReloadTick, setCompetitorReloadTick] = useState(0);

  useEffect(() => {
    const rawUser = localStorage.getItem("crm_user");
    if (!rawUser) {
      setLoading(false);
      return;
    }

    const parsed = JSON.parse(rawUser) as CrmUser;
    setUser(parsed);

    async function loadBase() {
      const [creatorsRes, formatsRes] = await Promise.all([
        supabase
          .from("crm_creators")
          .select("id,name,profile_image_url,instagram_username,instagram_usernames")
          .eq("status", "active")
          .order("name", { ascending: true }),
        supabase.from("crm_content_formats").select("id,name,icon").order("name", { ascending: true }),
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

      setLoading(false);
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
        .select("id,creator_id,username,followers,profile_pic_url")
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
        .select("id,ig_account_id,thumbnail_url,caption,posted_at,views,likes,comments")
        .in("ig_account_id", accountIds)
        .order("views", { ascending: false })
        .limit(5000);

      const ownReels = (ownReelsData || []) as any[];
      const totalViews = ownReels.reduce((sum, reel) => sum + Number(reel.views || 0), 0);
      const avgViews = ownReels.length > 0 ? totalViews / ownReels.length : 0;

      const outliers: WinningReel[] = ownReels
        .filter((reel) => Number(reel.views || 0) >= avgViews * 1.5)
        .map((reel) => ({
          id: String(reel.id),
          thumbnail_url: reel.thumbnail_url,
          caption: reel.caption,
          posted_at: reel.posted_at,
          views: Number(reel.views || 0),
          likes: Number(reel.likes || 0),
          comments: Number(reel.comments || 0),
          outlierMultiplier: avgViews > 0 ? Number(reel.views || 0) / avgViews : 0,
        }))
        .sort((a, b) => b.views - a.views);

      setWinningReels(outliers);

      if (outliers.length === 0) {
        setWinningAnalyses({});
        return;
      }

      const { data: ownAnalyses } = await supabase
        .from("crm_reel_analyses")
        .select("id,own_reel_id,hook,retention,pattern_name,pattern_formula,triggers,props,difficulty,difficulty_note,performance_analysis")
        .in("own_reel_id", outliers.map((reel) => reel.id));

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
        .select("id,watchlist_id,thumbnail_url,video_url,play_count,like_count,comment_count,caption,outlier_multiplier")
        .in("watchlist_id", watchlistIds)
        .eq("is_outlier", true)
        .order("play_count", { ascending: false })
        .limit(5000);

      const outliers = (reelRows || []) as CompetitorReel[];
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
          style={{ background: "#1a1a1a", color: "#fff", border: "1px solid #2b2b2b", borderRadius: 10, padding: "10px 12px", minWidth: 260 }}
        >
          {creators.map((creator) => (
            <option key={creator.id} value={creator.id}>{creator.name}</option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
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
              {selectedCreator?.profile_image_url ? (
                <img src={selectedCreator.profile_image_url} alt={selectedCreator.name} style={{ width: 56, height: 56, borderRadius: 14, objectFit: "cover" }} />
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

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>IG Followers</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(modelStats.totalFollowers)}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>Winning Reels</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(modelStats.totalReels)}</div>
            </div>
            <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#8f8f8f", fontSize: 12 }}>Avg Views (Winning)</div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 24 }}>{formatNumber(Math.round(modelStats.avgViews))}</div>
            </div>
          </div>

          {[
            "Character Reference",
            "Outfit Guide",
            "Branding Assets",
          ].map((title) => (
            <div key={title} style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 12, padding: 14 }}>
              <div style={{ color: "#fff", fontWeight: 700 }}>{title}</div>
              <div style={{ color: "#8f8f8f", fontSize: 13, marginTop: 4 }}>Coming soon</div>
            </div>
          ))}
        </div>
      ) : null}

      {!loading && activeTab === "winning" ? (
        <div>
          {winningReels.length === 0 ? <EmptyState text="No winning outlier reels for this creator yet." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {winningReels.map((reel) => (
              <ReelCard
                key={reel.id}
                title={reel.caption}
                thumbnail={reel.thumbnail_url}
                views={reel.views}
                likes={reel.likes}
                comments={reel.comments}
                outlierMultiplier={reel.outlierMultiplier}
                analysis={winningAnalyses[reel.id]}
                expanded={expandedWinning === reel.id}
                onToggle={() => setExpandedWinning((prev) => (prev === reel.id ? null : reel.id))}
              />
            ))}
          </div>
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
          </div>

          <div style={{ background: "#1a1a1a", border: "1px solid #2b2b2b", borderRadius: 14, padding: 14, marginBottom: 14 }}>
            <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Watchlist Management</div>

            {user.role === "admin" ? (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <input
                  value={watchlistInput}
                  onChange={(event) => setWatchlistInput(event.target.value)}
                  placeholder="Add competitor username (e.g. @example)"
                  style={{ flex: 1, minWidth: 220, background: "#121212", border: "1px solid #2f2f2f", borderRadius: 10, color: "#fff", padding: "9px 10px" }}
                />
                <button onClick={() => void addCompetitor()} style={{ background: "#243547", border: "1px solid #355273", color: "#fff", borderRadius: 10, padding: "9px 12px", cursor: "pointer", fontWeight: 700 }}>
                  Add Competitor
                </button>
              </div>
            ) : null}

            {watchlists.length === 0 ? <EmptyState text="No competitors in watchlist for this format." /> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 10 }}>
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

          <div style={{ color: "#fff", fontWeight: 700, marginBottom: 10 }}>Outlier Reels</div>
          {competitorReels.length === 0 ? <EmptyState text="No competitor outlier reels synced yet." /> : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {competitorReels.map((reel) => (
              <ReelCard
                key={reel.id}
                title={reel.caption}
                thumbnail={reel.thumbnail_url}
                video={reel.video_url}
                views={Number(reel.play_count || 0)}
                likes={Number(reel.like_count || 0)}
                comments={Number(reel.comment_count || 0)}
                outlierMultiplier={reel.outlier_multiplier}
                analysis={competitorAnalyses[reel.id]}
                expanded={expandedCompetitor === reel.id}
                onToggle={() => setExpandedCompetitor((prev) => (prev === reel.id ? null : reel.id))}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
