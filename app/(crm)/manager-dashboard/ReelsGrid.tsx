"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

type SortField = "views" | "likes" | "date";

interface Props {
  token: string;
  startDate: string;
  endDate: string;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString();
}

function ReelCard({ reel }: { reel: any }) {
  return (
    <div style={{
      background: "#161616", borderRadius: "12px", border: "1px solid #2a2a2a",
      overflow: "hidden", transition: "border-color 0.15s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#444"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = "#2a2a2a"; }}
    >
      {reel.thumbnail_url ? (
        <div style={{
          width: "100%", aspectRatio: "9/16", background: "#0a0a0a",
          backgroundImage: `url(${reel.thumbnail_url})`,
          backgroundSize: "cover", backgroundPosition: "center",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", bottom: "8px", left: "8px",
            background: "rgba(0,0,0,0.7)", borderRadius: "6px",
            padding: "4px 8px", fontSize: "13px", fontWeight: "700", color: "#fff",
          }}>
            👁 +{formatNumber(reel.viewsGained ?? 0)}
          </div>
        </div>
      ) : (
        <div style={{
          width: "100%", aspectRatio: "9/16", background: "#0a0a0a",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#444", fontSize: "32px",
        }}>
          🎬
        </div>
      )}
      <div style={{ padding: "12px" }}>
        <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#a0a0a0" }}>
          <span>❤️ +{formatNumber(reel.likesGained ?? 0)}</span>
          <span>💬 +{formatNumber(reel.commentsGained ?? 0)}</span>
        </div>
        {reel.posted_at && (
          <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>
            {new Date(reel.posted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountReelsSection({
  token,
  account,
  sortBy,
  startDate,
  endDate,
}: {
  token: string;
  account: any;
  sortBy: SortField;
  startDate: string;
  endDate: string;
}) {
  const [expanded, setExpanded] = useState(true);
  const [reels, setReels] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token || !account?.id) return;

    async function fetchReels() {
      const endPlusOne = addDays(endDate, 1);

      const { data: baseReels } = await supabase
        .from("crm_ig_reels")
        .select("id,ig_account_id,supabase_reel_id,thumbnail_url,posted_at")
        .eq("ig_account_id", account.id)
        .lte("posted_at", `${endDate}T23:59:59`)
        .limit(80);

      const reelsList = baseReels || [];
      if (reelsList.length === 0) {
        setReels([]);
        return;
      }

      const reelIds = reelsList.map((r: any) => r.id);
      const { data: snapshots } = await supabase
        .from("crm_ig_reel_daily_snapshots")
        .select("ig_reel_id,snapshot_date,views,likes,comments")
        .in("ig_reel_id", reelIds)
        .gte("snapshot_date", startDate)
        .lte("snapshot_date", endPlusOne);

      const byReel = new Map<string, any[]>();
      for (const snap of snapshots ?? []) {
        const reelId = (snap as any).ig_reel_id;
        if (!byReel.has(reelId)) byReel.set(reelId, []);
        byReel.get(reelId)!.push(snap);
      }

      const hydrated = reelsList.map((reel: any) => {
        const rows = (byReel.get(reel.id) ?? []).sort((a, b) => String(a.snapshot_date).localeCompare(String(b.snapshot_date)));
        const byDate = new Map(rows.map((r) => [String((r as any).snapshot_date), r]));
        const startSnap = byDate.get(startDate);
        const endSnap = byDate.get(endPlusOne) ?? (rows.length ? rows[rows.length - 1] : null);

        const startViews = Number(startSnap?.views || 0);
        const endViews = Number(endSnap?.views || 0);
        const startLikes = Number(startSnap?.likes || 0);
        const endLikes = Number(endSnap?.likes || 0);
        const startComments = Number(startSnap?.comments || 0);
        const endComments = Number(endSnap?.comments || 0);

        return {
          ...reel,
          viewsGained: endViews - startViews,
          likesGained: endLikes - startLikes,
          commentsGained: endComments - startComments,
        };
      });

      const sorted = hydrated.sort((a: any, b: any) => {
        if (sortBy === "date") {
          return new Date(b.posted_at || 0).getTime() - new Date(a.posted_at || 0).getTime();
        }
        if (sortBy === "views") return (b.viewsGained || 0) - (a.viewsGained || 0);
        return (b.likesGained || 0) - (a.likesGained || 0);
      });

      setReels(sorted.slice(0, 50));
    }

    fetchReels();
  }, [token, account?.id, sortBy, startDate, endDate]);

  return (
    <div style={{ marginBottom: "16px" }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", gap: "8px",
          padding: "8px 0", width: "100%", textAlign: "left",
        }}
      >
        <span style={{
          fontSize: "10px", color: "#666", transition: "transform 0.2s",
          transform: expanded ? "rotate(90deg)" : "rotate(0)",
        }}>▶</span>
        <span style={{ fontSize: "14px", fontWeight: "600", color: "#fff" }}>
          {account.username || "Unknown"}
        </span>
        <span style={{ fontSize: "12px", color: "#a0a0a0" }}>
          @{account.username || "—"}
        </span>
        {reels && (
          <span style={{ fontSize: "11px", color: "#666", marginLeft: "auto" }}>
            {reels.length} reels
          </span>
        )}
      </button>

      {expanded && (
        <div>
          {!reels ? (
            <div style={{ color: "#666", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>
              Loading…
            </div>
          ) : reels.length === 0 ? (
            <div style={{ color: "#666", fontSize: "13px", padding: "20px 0", textAlign: "center" }}>
              No reels found
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "12px",
              padding: "8px 0",
            }}>
              {reels.map((reel: any) => (
                <ReelCard key={reel.id} reel={reel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReelsGrid({ token, startDate, endDate }: Props) {
  const [sortBy, setSortBy] = useState<SortField>("views");
  const [accounts, setAccounts] = useState<any[] | null>(null);

  useEffect(() => {
    if (!token) return;

    async function fetchAccounts() {
      const { data } = await supabase.from("crm_ig_accounts").select("id,username");
      setAccounts(data || []);
    }

    fetchAccounts();
  }, [token]);

  if (!accounts || accounts.length === 0) return null;

  return (
    <div style={{
      background: "#1e1e1e", borderRadius: "16px", padding: "24px",
      border: "1px solid #2a2a2a", marginBottom: "24px",
    }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        marginBottom: "16px", flexWrap: "wrap", gap: "8px",
      }}>
        <div style={{
          fontSize: "13px", color: "#a0a0a0", fontWeight: "500",
          textTransform: "uppercase", letterSpacing: "0.5px",
        }}>
          🎬 Reels Performance (Range Gains)
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          {(["views", "likes", "date"] as SortField[]).map((field) => (
            <button
              key={field}
              onClick={() => setSortBy(field)}
              style={{
                background: sortBy === field ? "#333" : "transparent",
                border: "1px solid",
                borderColor: sortBy === field ? "#555" : "#2a2a2a",
                borderRadius: "6px",
                padding: "4px 10px",
                fontSize: "11px",
                fontWeight: sortBy === field ? "600" : "400",
                color: sortBy === field ? "#fff" : "#888",
                cursor: "pointer",
                textTransform: "capitalize",
                transition: "all 0.15s",
              }}
            >
              {field}
            </button>
          ))}
        </div>
      </div>

      {accounts.map((account: any) => (
        <AccountReelsSection
          key={account.id}
          token={token}
          account={account}
          sortBy={sortBy}
          startDate={startDate}
          endDate={endDate}
        />
      ))}
    </div>
  );
}
