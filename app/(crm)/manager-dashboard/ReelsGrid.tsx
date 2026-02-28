"use client";

import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

type SortField = "views" | "likes" | "date";

interface Props {
  token: string;
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
      {/* Thumbnail */}
      {reel.mediaUrl ? (
        <div style={{
          width: "100%", aspectRatio: "9/16", background: "#0a0a0a",
          backgroundImage: `url(${reel.thumbnailUrl || reel.mediaUrl})`,
          backgroundSize: "cover", backgroundPosition: "center",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", bottom: "8px", left: "8px",
            background: "rgba(0,0,0,0.7)", borderRadius: "6px",
            padding: "4px 8px", fontSize: "13px", fontWeight: "700", color: "#fff",
          }}>
            👁 {formatNumber(reel.views ?? 0)}
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
      {/* Stats */}
      <div style={{ padding: "12px" }}>
        <div style={{ display: "flex", gap: "12px", fontSize: "12px", color: "#a0a0a0" }}>
          <span>❤️ {formatNumber(reel.likes ?? 0)}</span>
          <span>💬 {formatNumber(reel.comments ?? 0)}</span>
        </div>
        {reel.postedAt && (
          <div style={{ fontSize: "11px", color: "#666", marginTop: "6px" }}>
            {new Date(reel.postedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
}: {
  token: string;
  account: any;
  sortBy: SortField;
}) {
  const [expanded, setExpanded] = useState(true);

  const reels = useQuery(
    api.crm.igQueries.getIgReels,
    token ? { token, igAccountId: account._id, sortBy, order: "desc" as const } : "skip"
  );

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
          {account.creatorName || account.username || "Unknown"}
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
                <ReelCard key={reel._id} reel={reel} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ReelsGrid({ token }: Props) {
  const [sortBy, setSortBy] = useState<SortField>("views");

  const accounts = useQuery(
    api.crm.igQueries.getIgAccounts,
    token ? { token } : "skip"
  );

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
          🎬 Reels Performance
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
          key={account._id}
          token={token}
          account={account}
          sortBy={sortBy}
        />
      ))}
    </div>
  );
}
