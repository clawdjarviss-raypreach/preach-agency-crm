"use client";

import React from "react";

// ── Tier types (shared) ───────────────────────────────────────────────
export interface TierEntry {
  name: string;
  emoji: string;
  min: number;
  bonus: number;
  color: string;
}

export interface BonusAccountData {
  igAccountId: string;
  username: string;
  avatarUrl: string | null;
  totalViews: number;
  followerGain: number;
  viewTier: TierEntry | null;
  followerTier: TierEntry | null;
  viewNextTier: TierEntry | null;
  followerNextTier: TierEntry | null;
  viewBonus: number;
  followerBonus: number;
  totalBonus: number;
}

export const VIEW_TIERS: readonly TierEntry[] = [
  { name: "DIAMOND", emoji: "💎", min: 1_000_000, bonus: 80, color: "#B9F2FF" },
  { name: "GOLD", emoji: "🥇", min: 500_000, bonus: 50, color: "#FFD700" },
  { name: "SILVER", emoji: "🥈", min: 200_000, bonus: 25, color: "#C0C0C0" },
  { name: "BRONZE", emoji: "🥉", min: 50_000, bonus: 10, color: "#CD7F32" },
];

export const FOLLOWER_TIERS: readonly TierEntry[] = [
  { name: "DIAMOND", emoji: "💎", min: 3000, bonus: 60, color: "#B9F2FF" },
  { name: "GOLD", emoji: "🥇", min: 1500, bonus: 40, color: "#FFD700" },
  { name: "SILVER", emoji: "🥈", min: 500, bonus: 20, color: "#C0C0C0" },
  { name: "BRONZE", emoji: "🥉", min: 100, bonus: 10, color: "#CD7F32" },
];

export const BASE_PAY = 120;
export const PHP_RATE = 58;

export function getTier(value: number, tiers: readonly TierEntry[]): TierEntry | null {
  for (const t of tiers) {
    if (value >= t.min) return t;
  }
  return null;
}

export function getNextTier(value: number, tiers: readonly TierEntry[]): TierEntry | null {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (value < tiers[i].min) return tiers[i];
  }
  return null;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div style={{ width: "100%", height: 8, background: "#2a2a2a", borderRadius: 4, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
    </div>
  );
}

interface BonusAccountCardProps {
  account: BonusAccountData;
}

export default function BonusAccountCard({ account: acc }: BonusAccountCardProps) {
  return (
    <div style={{
      background: "#1a1a2e",
      borderRadius: 16,
      padding: "20px 22px",
      border: "1px solid #2a2a3e",
      display: "flex",
      flexDirection: "column",
      gap: 0,
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        {acc.avatarUrl ? (
          <img src={acc.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid #2a2a3e" }} />
        ) : (
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, color: "#fff", fontWeight: 700,
          }}>📸</div>
        )}
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>@{acc.username}</span>
      </div>

      {/* Views Row */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 13, color: "#e5e7eb" }}>
            👁 {formatCompact(acc.totalViews)}
            {acc.viewTier && (
              <span style={{ marginLeft: 8, color: acc.viewTier.color, fontWeight: 600 }}>
                {acc.viewTier.emoji} {acc.viewTier.name}
              </span>
            )}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: acc.viewTier ? acc.viewTier.color : "#555" }}>
            {acc.viewBonus > 0 ? `+$${acc.viewBonus}` : "—"}
          </span>
        </div>
        {acc.viewNextTier ? (
          <>
            <ProgressBar value={acc.totalViews} max={acc.viewNextTier.min} color={acc.viewTier?.color ?? "#3b82f6"} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {formatCompact(acc.totalViews)} / {formatCompact(acc.viewNextTier.min)} → {acc.viewNextTier.name}
            </div>
          </>
        ) : acc.viewTier ? (
          <>
            <ProgressBar value={1} max={1} color={acc.viewTier.color} />
            <div style={{ fontSize: 11, color: "#B9F2FF", marginTop: 3 }}>💎 Max tier reached!</div>
          </>
        ) : (
          <>
            <ProgressBar value={acc.totalViews} max={VIEW_TIERS[VIEW_TIERS.length - 1].min} color="#555" />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {formatCompact(acc.totalViews)} / {formatCompact(VIEW_TIERS[VIEW_TIERS.length - 1].min)} → {VIEW_TIERS[VIEW_TIERS.length - 1].name}
            </div>
          </>
        )}
      </div>

      {/* Followers Row */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
          <span style={{ fontSize: 13, color: "#e5e7eb" }}>
            👥 +{formatCompact(acc.followerGain)}
            {acc.followerTier && (
              <span style={{ marginLeft: 8, color: acc.followerTier.color, fontWeight: 600 }}>
                {acc.followerTier.emoji} {acc.followerTier.name}
              </span>
            )}
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: acc.followerTier ? acc.followerTier.color : "#555" }}>
            {acc.followerBonus > 0 ? `+$${acc.followerBonus}` : "—"}
          </span>
        </div>
        {acc.followerNextTier ? (
          <>
            <ProgressBar value={acc.followerGain} max={acc.followerNextTier.min} color={acc.followerTier?.color ?? "#3b82f6"} />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {formatCompact(acc.followerGain)} / {formatCompact(acc.followerNextTier.min)} → {acc.followerNextTier.name}
            </div>
          </>
        ) : acc.followerTier ? (
          <>
            <ProgressBar value={1} max={1} color={acc.followerTier.color} />
            <div style={{ fontSize: 11, color: "#B9F2FF", marginTop: 3 }}>💎 Max tier reached!</div>
          </>
        ) : (
          <>
            <ProgressBar value={acc.followerGain} max={FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1].min} color="#555" />
            <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
              {formatCompact(acc.followerGain)} / {formatCompact(FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1].min)} → {FOLLOWER_TIERS[FOLLOWER_TIERS.length - 1].name}
            </div>
          </>
        )}
      </div>

      {/* Account Total */}
      <div style={{
        borderTop: "1px solid #2a2a3e",
        paddingTop: 10,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <span style={{ fontSize: 13, color: "#9ca3af" }}>💰 Account Bonus</span>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#FFD700" }}>
            ₱{(acc.totalBonus * PHP_RATE).toLocaleString()}
          </span>
          <div style={{ fontSize: 11, color: "#9ca3af" }}>${acc.totalBonus}</div>
        </div>
      </div>
    </div>
  );
}
