"use client";

import React, { useEffect, useState } from "react";
import { BonusAccountData, PHP_RATE, BASE_PAY, formatCompact } from "./BonusAccountCard";

interface BonusHeroBannerProps {
  totalPay: number;
  totalViewsBonus: number;
  totalFollowerBonus: number;
  accounts: BonusAccountData[];
  goldOrHigherCount: number;
  /** Previous week total pay for comparison — null if unavailable */
  prevWeekTotalPay: number | null;
  /** Whether we're looking at the current week (show countdown) */
  isCurrentWeek: boolean;
}

function getFridayCountdown(): string {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 5=Fri
  // If it's Friday
  if (day === 5) return "💰 PAYDAY!";
  // Calculate days until Friday
  let daysUntil = (5 - day + 7) % 7;
  if (daysUntil === 0) daysUntil = 7;
  // Target: next Friday at 23:59:59
  const target = new Date(now);
  target.setDate(now.getDate() + daysUntil);
  target.setHours(23, 59, 59, 0);
  const diff = target.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  if (days > 0) return `⏱ ${days}d ${remainingHours}h`;
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  return `⏱ ${remainingHours}h ${minutes}m`;
}

function getMaxPotential(numAccounts: number): number {
  // Max = $120 base + ($80 × N) views diamond + ($60 × N) followers diamond
  return BASE_PAY + numAccounts * 80 + numAccounts * 60;
}

function getNearestToNextTierNudge(accounts: BonusAccountData[]): string | null {
  let best: { username: string; metric: string; remaining: number; tierName: string; pct: number } | null = null;

  for (const acc of accounts) {
    // Check views
    if (acc.viewNextTier) {
      const remaining = acc.viewNextTier.min - acc.totalViews;
      const pct = acc.totalViews / acc.viewNextTier.min;
      if (!best || pct > best.pct) {
        best = { username: acc.username, metric: "views", remaining, tierName: acc.viewNextTier.name, pct };
      }
    }
    // Check followers
    if (acc.followerNextTier) {
      const remaining = acc.followerNextTier.min - acc.followerGain;
      const pct = acc.followerGain / acc.followerNextTier.min;
      if (!best || pct > best.pct) {
        best = { username: acc.username, metric: "followers", remaining, tierName: acc.followerNextTier.name, pct };
      }
    }
  }

  if (!best) return null;
  return `💪 Push @${best.username} — only ${formatCompact(best.remaining)} ${best.metric} from ${best.tierName}!`;
}

export default function BonusHeroBanner({
  totalPay,
  totalViewsBonus,
  totalFollowerBonus,
  accounts,
  goldOrHigherCount,
  prevWeekTotalPay,
  isCurrentWeek,
}: BonusHeroBannerProps) {
  const [countdown, setCountdown] = useState(getFridayCountdown);

  useEffect(() => {
    if (!isCurrentWeek) return;
    const id = setInterval(() => setCountdown(getFridayCountdown()), 60_000);
    return () => clearInterval(id);
  }, [isCurrentWeek]);

  const totalPhp = totalPay * PHP_RATE;
  const maxPotential = getMaxPotential(accounts.length);
  const potentialPct = maxPotential > 0 ? Math.min(100, (totalPay / maxPotential) * 100) : 0;
  const totalBonus = totalViewsBonus + totalFollowerBonus;
  const nudge = getNearestToNextTierNudge(accounts);

  // Historical comparison
  const weekDiff = prevWeekTotalPay !== null ? totalPay - prevWeekTotalPay : null;
  const weekDiffPhp = weekDiff !== null ? weekDiff * PHP_RATE : null;

  return (
    <div style={{
      background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
      borderRadius: 20,
      padding: "28px 32px",
      border: "1px solid rgba(255,215,0,0.15)",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Subtle shimmer overlay */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "linear-gradient(45deg, transparent 30%, rgba(255,215,0,0.03) 50%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Top Row: Earned + Countdown */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        flexWrap: "wrap",
        gap: 16,
        position: "relative",
        zIndex: 1,
      }}>
        {/* Left: Total Earnings */}
        <div>
          <div style={{ fontSize: 13, color: "#9ca3af", fontWeight: 500, marginBottom: 4 }}>
            You&apos;ve earned this week
          </div>
          <div style={{
            fontSize: 40,
            fontWeight: 800,
            color: "#FFD700",
            lineHeight: 1.1,
            letterSpacing: "-0.5px",
          }}>
            ₱{totalPhp.toLocaleString()}
          </div>
          <div style={{ fontSize: 15, color: "#9ca3af", marginTop: 4 }}>
            ${totalPay}
          </div>
          {weekDiff !== null && weekDiffPhp !== null && weekDiff !== 0 && (
            <div style={{
              fontSize: 13,
              color: weekDiff > 0 ? "#22c55e" : "#ef4444",
              marginTop: 6,
              fontWeight: 600,
            }}>
              {weekDiff > 0 ? "↑" : "↓"}₱{Math.abs(weekDiffPhp).toLocaleString()} {weekDiff > 0 ? "more" : "less"} than last week
            </div>
          )}
        </div>

        {/* Right: Countdown */}
        {isCurrentWeek && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>Payout in</div>
            <div style={{
              fontSize: 24,
              fontWeight: 700,
              color: countdown.includes("PAYDAY") ? "#22c55e" : "#e5e7eb",
              letterSpacing: "0.5px",
            }}>
              {countdown}
            </div>
            {!countdown.includes("PAYDAY") && (
              <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>FRIDAY</div>
            )}
          </div>
        )}
      </div>

      {/* Progress Bar: Max Potential */}
      <div style={{ marginTop: 24, position: "relative", zIndex: 1 }}>
        <div style={{
          width: "100%",
          height: 12,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 6,
          overflow: "hidden",
        }}>
          <div style={{
            width: `${potentialPct}%`,
            height: "100%",
            background: "linear-gradient(90deg, #FFD700, #f59e0b)",
            borderRadius: 6,
            transition: "width 0.5s ease",
          }} />
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 6,
          fontSize: 12,
          color: "#9ca3af",
        }}>
          <span>₱{totalPhp.toLocaleString()} / ₱{(maxPotential * PHP_RATE).toLocaleString()}</span>
          <span>{potentialPct.toFixed(0)}% of max potential</span>
        </div>
      </div>

      {/* Stat Pills Row */}
      <div style={{
        display: "flex",
        gap: 12,
        marginTop: 20,
        flexWrap: "wrap",
        position: "relative",
        zIndex: 1,
      }}>
        {[
          { label: "💰 Base Pay", usd: BASE_PAY },
          { label: "👁 Views Bonus", usd: totalViewsBonus },
          { label: "👥 Follower Bonus", usd: totalFollowerBonus },
        ].map((pill) => (
          <div key={pill.label} style={{
            flex: "1 1 140px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: 12,
            padding: "12px 16px",
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 4 }}>{pill.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#FFD700" }}>₱{(pill.usd * PHP_RATE).toLocaleString()}</div>
            <div style={{ fontSize: 11, color: "#6b7280" }}>${pill.usd}</div>
          </div>
        ))}
      </div>

      {/* Motivational Line */}
      <div style={{ marginTop: 16, position: "relative", zIndex: 1 }}>
        {goldOrHigherCount > 0 ? (
          <div style={{ fontSize: 14, color: "#f59e0b", fontWeight: 600 }}>
            🔥 {goldOrHigherCount} account{goldOrHigherCount > 1 ? "s" : ""} at Gold or higher!
          </div>
        ) : nudge ? (
          <div style={{ fontSize: 13, color: "#60a5fa" }}>{nudge}</div>
        ) : null}
      </div>
    </div>
  );
}
