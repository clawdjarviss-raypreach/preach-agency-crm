"use client";

import React from "react";
import { BonusAccountData, PHP_RATE } from "./BonusAccountCard";

export interface BonusEmployee {
  id: string;
  name: string;
  username: string;
  assigned_creators: string[];
}

export interface LeaderboardEntry {
  employee: BonusEmployee;
  accounts: BonusAccountData[];
  totalViewsBonus: number;
  totalFollowerBonus: number;
  totalBonus: number;
  totalPay: number;
}

interface BonusLeaderboardProps {
  leaderboard: LeaderboardEntry[];
  weekLabel: string;
  onSelectEmployee: (id: string) => void;
}

export default function BonusLeaderboard({ leaderboard, weekLabel, onSelectEmployee }: BonusLeaderboardProps) {
  if (leaderboard.length === 0) {
    return (
      <div style={{ color: "#666", fontSize: 13, textAlign: "center", padding: "40px 0" }}>
        No bonus-enabled employees found.
      </div>
    );
  }

  return (
    <div>
      <div style={{
        fontSize: 13,
        color: "#a0a0a0",
        fontWeight: 500,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        marginBottom: 14,
      }}>
        🏆 LEADERBOARD — {weekLabel}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {leaderboard.map((entry, idx) => {
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
          const tierBadges = entry.accounts.map((a) => {
            const best = a.viewTier && a.followerTier
              ? (a.viewTier.min >= a.followerTier.min ? a.viewTier : a.followerTier)
              : a.viewTier || a.followerTier;
            return best?.emoji ?? "";
          }).filter(Boolean).join("");

          const totalPhp = entry.totalPay * PHP_RATE;

          return (
            <div
              key={entry.employee.id}
              onClick={() => onSelectEmployee(entry.employee.id)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                borderRadius: 12,
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                border: "1px solid #2a2a3e",
                cursor: "pointer",
                transition: "border-color 0.2s, transform 0.15s",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 22, minWidth: 36, textAlign: "center" }}>{medal}</span>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>{entry.employee.name}</div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>@{entry.employee.username}</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontSize: 14, letterSpacing: 1 }}>{tierBadges || "—"}</span>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: "#FFD700" }}>
                    ₱{totalPhp.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: "#9ca3af" }}>
                    ${entry.totalPay}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
