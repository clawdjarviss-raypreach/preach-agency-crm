"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import BonusHeroBanner from "./BonusHeroBanner";
import BonusAccountCard, {
  BonusAccountData,
  TierEntry,
  VIEW_TIERS,
  FOLLOWER_TIERS,
  BASE_PAY,
  PHP_RATE,
  getTier,
  getNextTier,
} from "./BonusAccountCard";
import BonusLeaderboard, { BonusEmployee, LeaderboardEntry } from "./BonusLeaderboard";

function getWeekRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const label = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  return { start: fmt(monday), end: fmt(sunday), label };
}

interface BonusTrackerProps {
  user: { id: string; name: string; username: string; role: string; assigned_creators?: string[] };
}

function buildMockAccount(username: string, views: number, followerGain: number): BonusAccountData {
  const viewTier = getTier(views, VIEW_TIERS);
  const followerTier = getTier(followerGain, FOLLOWER_TIERS);
  return {
    igAccountId: `mock-${username}`,
    username,
    avatarUrl: null,
    totalViews: views,
    followerGain,
    viewTier,
    followerTier,
    viewNextTier: getNextTier(views, VIEW_TIERS),
    followerNextTier: getNextTier(followerGain, FOLLOWER_TIERS),
    viewBonus: viewTier?.bonus ?? 0,
    followerBonus: followerTier?.bonus ?? 0,
    totalBonus: (viewTier?.bonus ?? 0) + (followerTier?.bonus ?? 0),
  };
}

function getMockPreviewData(): { current: LeaderboardEntry; prev: LeaderboardEntry } {
  const accounts = [
    buildMockAccount("leni.marie", 620_000, 1_800),
    buildMockAccount("soldier.abbyy", 185_000, 420),
    buildMockAccount("hannah.xfit", 72_000, 150),
    buildMockAccount("mike.travels", 38_000, 60),
  ];
  const totalViewsBonus = accounts.reduce((s, a) => s + a.viewBonus, 0);
  const totalFollowerBonus = accounts.reduce((s, a) => s + a.followerBonus, 0);
  const totalBonus = totalViewsBonus + totalFollowerBonus;
  const mockEmployee: BonusEmployee = { id: "__preview__", name: "Jane (Preview)", username: "jane.traffic", assigned_creators: [] };

  const prevAccounts = [
    buildMockAccount("leni.marie", 410_000, 1_200),
    buildMockAccount("soldier.abbyy", 95_000, 280),
    buildMockAccount("hannah.xfit", 55_000, 110),
    buildMockAccount("mike.travels", 22_000, 40),
  ];
  const prevViewsBonus = prevAccounts.reduce((s, a) => s + a.viewBonus, 0);
  const prevFollowerBonus = prevAccounts.reduce((s, a) => s + a.followerBonus, 0);
  const prevTotalBonus = prevViewsBonus + prevFollowerBonus;

  return {
    current: { employee: mockEmployee, accounts, totalViewsBonus, totalFollowerBonus, totalBonus, totalPay: BASE_PAY + totalBonus },
    prev: { employee: mockEmployee, accounts: prevAccounts, totalViewsBonus: prevViewsBonus, totalFollowerBonus: prevFollowerBonus, totalBonus: prevTotalBonus, totalPay: BASE_PAY + prevTotalBonus },
  };
}

export default function BonusTracker({ user }: BonusTrackerProps) {
  const [showBonus, setShowBonus] = useState(false);
  const [bonusWeekOffset, setBonusWeekOffset] = useState(0);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusEmployees, setBonusEmployees] = useState<BonusEmployee[]>([]);
  const [selectedBonusEmployee, setSelectedBonusEmployee] = useState<string>("__leaderboard__");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [prevWeekLeaderboard, setPrevWeekLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [bonusAccounts, setBonusAccounts] = useState<BonusAccountData[]>([]);
  const isPreview = selectedBonusEmployee === "__preview__";

  const isAdmin = user.role === "admin";
  const bonusWeek = useMemo(() => getWeekRange(bonusWeekOffset), [bonusWeekOffset]);
  const prevWeek = useMemo(() => getWeekRange(bonusWeekOffset - 1), [bonusWeekOffset]);
  const isCurrentWeek = bonusWeekOffset === 0;

  // Check bonus eligibility
  useEffect(() => {
    async function checkBonusEligibility() {
      if (isAdmin) {
        const { data } = await supabase
          .from("crm_chatters")
          .select("id, name, username, assigned_creators, bonus_enabled")
          .eq("bonus_enabled", true);
        const employees = (data ?? []) as BonusEmployee[];
        setBonusEmployees(employees);
        setShowBonus(true);
        if (employees.length > 0) setSelectedBonusEmployee("__leaderboard__");
      } else if (user.role === "marketing_manager") {
        const { data } = await supabase
          .from("crm_chatters")
          .select("bonus_enabled")
          .eq("id", user.id)
          .single();
        setShowBonus(data?.bonus_enabled === true);
      }
    }
    checkBonusEligibility();
  }, [user.id, user.role, isAdmin]);

  // Load bonus data for current + previous week
  useEffect(() => {
    if (!showBonus) return;
    let cancelled = false;

    async function loadBonusWeek(weekStart: string, weekEnd: string): Promise<LeaderboardEntry[]> {
      let employeesToLoad: BonusEmployee[] = [];
      if (isAdmin) {
        employeesToLoad = bonusEmployees;
      } else {
        employeesToLoad = [{
          id: user.id,
          name: user.name,
          username: user.username,
          assigned_creators: user.assigned_creators || [],
        }];
      }

      if (employeesToLoad.length === 0) return [];

      const { data: igAccounts } = await supabase
        .from("crm_ig_accounts")
        .select("id, username, profile_pic_url, creator_id")
        .eq("is_active", true);

      const { data: weeklyViews } = await supabase.rpc("ig_account_reel_stats", {
        p_start_date: weekStart,
        p_end_date: weekEnd,
      });

      const [{ data: startSnaps }, { data: endSnaps }] = await Promise.all([
        supabase.from("crm_ig_daily_snapshots").select("ig_account_id, followers").eq("date", weekStart),
        supabase.from("crm_ig_daily_snapshots").select("ig_account_id, followers").eq("date", weekEnd),
      ]);

      const viewsByAccount = new Map<string, number>();
      for (const row of weeklyViews ?? []) {
        viewsByAccount.set(row.ig_account_id, Number(row.total_views ?? 0));
      }

      const startFollowers = new Map<string, number>();
      const endFollowers = new Map<string, number>();
      for (const s of startSnaps ?? []) startFollowers.set(s.ig_account_id, Number(s.followers ?? 0));
      for (const s of endSnaps ?? []) endFollowers.set(s.ig_account_id, Number(s.followers ?? 0));

      const allEntries: LeaderboardEntry[] = [];

      for (const emp of employeesToLoad) {
        const empAccounts: BonusAccountData[] = [];
        const assignedCreatorIds = new Set(emp.assigned_creators || []);
        const relevantAccounts = (igAccounts ?? []).filter((a: any) => assignedCreatorIds.has(a.creator_id));

        for (const acc of relevantAccounts) {
          const views = viewsByAccount.get(acc.id) ?? 0;
          const fStart = startFollowers.get(acc.id) ?? 0;
          const fEnd = endFollowers.get(acc.id) ?? 0;
          const followerGain = Math.max(0, fEnd - fStart);

          const viewTier = getTier(views, VIEW_TIERS);
          const followerTier = getTier(followerGain, FOLLOWER_TIERS);
          const viewNextTier = getNextTier(views, VIEW_TIERS);
          const followerNextTier = getNextTier(followerGain, FOLLOWER_TIERS);

          empAccounts.push({
            igAccountId: acc.id,
            username: acc.username,
            avatarUrl: acc.profile_pic_url,
            totalViews: views,
            followerGain,
            viewTier,
            followerTier,
            viewNextTier,
            followerNextTier,
            viewBonus: viewTier?.bonus ?? 0,
            followerBonus: followerTier?.bonus ?? 0,
            totalBonus: (viewTier?.bonus ?? 0) + (followerTier?.bonus ?? 0),
          });
        }

        empAccounts.sort((a, b) => b.totalBonus - a.totalBonus);

        const totalViewsBonus = empAccounts.reduce((s, a) => s + a.viewBonus, 0);
        const totalFollowerBonus = empAccounts.reduce((s, a) => s + a.followerBonus, 0);
        const totalBonus = totalViewsBonus + totalFollowerBonus;

        allEntries.push({
          employee: emp,
          accounts: empAccounts,
          totalViewsBonus,
          totalFollowerBonus,
          totalBonus,
          totalPay: BASE_PAY + totalBonus,
        });
      }

      allEntries.sort((a, b) => b.totalPay - a.totalPay);
      return allEntries;
    }

    async function loadBonusData() {
      setBonusLoading(true);

      // Load current + previous week in parallel
      const [currentEntries, prevEntries] = await Promise.all([
        loadBonusWeek(bonusWeek.start, bonusWeek.end),
        loadBonusWeek(prevWeek.start, prevWeek.end),
      ]);

      if (!cancelled) {
        setLeaderboard(currentEntries);
        setPrevWeekLeaderboard(prevEntries);
        if (!isAdmin && currentEntries.length > 0) {
          setBonusAccounts(currentEntries[0].accounts);
        }
        setBonusLoading(false);
      }
    }

    loadBonusData();
    return () => { cancelled = true; };
  }, [showBonus, bonusWeekOffset, bonusEmployees, isAdmin, user, bonusWeek.start, bonusWeek.end, prevWeek.start, prevWeek.end]);

  // Derived data
  const selectedEmployeeData = useMemo(() => {
    if (selectedBonusEmployee === "__leaderboard__") return null;
    return leaderboard.find((e) => e.employee.id === selectedBonusEmployee) ?? null;
  }, [leaderboard, selectedBonusEmployee]);

  const mockPreview = useMemo(() => isPreview ? getMockPreviewData() : null, [isPreview]);

  const currentBonusData = useMemo(() => {
    if (isPreview && mockPreview) return mockPreview.current;
    if (isAdmin) {
      if (selectedEmployeeData) return selectedEmployeeData;
      return null;
    }
    if (bonusAccounts.length === 0 && leaderboard.length > 0) return leaderboard[0];
    const totalViewsBonus = bonusAccounts.reduce((s, a) => s + a.viewBonus, 0);
    const totalFollowerBonus = bonusAccounts.reduce((s, a) => s + a.followerBonus, 0);
    const totalBonus = totalViewsBonus + totalFollowerBonus;
    return {
      accounts: bonusAccounts,
      totalViewsBonus,
      totalFollowerBonus,
      totalBonus,
      totalPay: BASE_PAY + totalBonus,
    };
  }, [isAdmin, isPreview, mockPreview, bonusAccounts, selectedEmployeeData, leaderboard]);

  const prevWeekTotalPay = useMemo(() => {
    if (isPreview && mockPreview) return mockPreview.prev.totalPay;
    if (prevWeekLeaderboard.length === 0) return null;
    if (isAdmin && selectedEmployeeData) {
      const prev = prevWeekLeaderboard.find((e) => e.employee.id === selectedEmployeeData.employee.id);
      return prev?.totalPay ?? null;
    }
    if (!isAdmin && prevWeekLeaderboard.length > 0) {
      return prevWeekLeaderboard[0].totalPay;
    }
    return null;
  }, [prevWeekLeaderboard, isAdmin, isPreview, mockPreview, selectedEmployeeData]);

  const goldOrHigherCount = useMemo(() => {
    if (!currentBonusData) return 0;
    return currentBonusData.accounts.filter((a) => {
      const vt = a.viewTier;
      const ft = a.followerTier;
      return (vt && (vt.name === "GOLD" || vt.name === "DIAMOND")) ||
             (ft && (ft.name === "GOLD" || ft.name === "DIAMOND"));
    }).length;
  }, [currentBonusData]);

  if (!showBonus) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      {/* Week Navigator — SEPARATE ROW above hero banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16,
        flexWrap: "wrap",
        gap: 12,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: "#fff" }}>🏆 BONUS TRACKER</span>
          {isAdmin && (
            <select
              value={selectedBonusEmployee}
              onChange={(e) => setSelectedBonusEmployee(e.target.value)}
              style={{
                background: "#141414",
                color: "#fff",
                border: "1px solid #2f2f2f",
                borderRadius: 8,
                padding: "7px 12px",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <option value="__leaderboard__">All — Leaderboard</option>
              <option value="__preview__">Preview — Employee View</option>
              {bonusEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setBonusWeekOffset((w) => w - 1)}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: "1px solid #2f2f2f", background: "#171717",
              color: "#fff", cursor: "pointer", fontSize: 16,
            }}
          >◀</button>
          <span style={{
            fontSize: 14, color: "#e5e7eb", fontWeight: 500,
            minWidth: 200, textAlign: "center",
          }}>
            {bonusWeek.label}
          </span>
          <button
            onClick={() => setBonusWeekOffset((w) => Math.min(0, w + 1))}
            disabled={bonusWeekOffset >= 0}
            style={{
              width: 34, height: 34, borderRadius: 8,
              border: "1px solid #2f2f2f", background: "#171717",
              color: bonusWeekOffset >= 0 ? "#555" : "#fff",
              cursor: bonusWeekOffset >= 0 ? "default" : "pointer",
              fontSize: 16,
            }}
          >▶</button>
        </div>
      </div>

      {bonusLoading ? (
        <div style={{
          textAlign: "center",
          color: "#666",
          padding: "60px 0",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          borderRadius: 20,
        }}>
          Loading bonus data…
        </div>
      ) : isAdmin && selectedBonusEmployee === "__leaderboard__" && !isPreview ? (
        <BonusLeaderboard
          leaderboard={leaderboard}
          weekLabel={bonusWeek.label}
          onSelectEmployee={setSelectedBonusEmployee}
        />
      ) : currentBonusData ? (
        <div>
          {/* Back to Leaderboard link (admin) */}
          {isAdmin && selectedBonusEmployee !== "__leaderboard__" && !isPreview && (
            <button
              onClick={() => setSelectedBonusEmployee("__leaderboard__")}
              style={{
                background: "none",
                border: "none",
                color: "#60a5fa",
                fontSize: 13,
                cursor: "pointer",
                padding: 0,
                marginBottom: 12,
                fontWeight: 600,
              }}
            >
              ← Back to Leaderboard
            </button>
          )}

          {/* Preview badge */}
          {isPreview && (
            <div style={{
              background: "rgba(245,158,11,0.15)",
              border: "1px solid rgba(245,158,11,0.3)",
              borderRadius: 8,
              padding: "8px 14px",
              marginBottom: 14,
              fontSize: 13,
              color: "#f59e0b",
              fontWeight: 600,
            }}>
              PREVIEW MODE — Showing fake data to demonstrate employee view
            </div>
          )}

          {/* Hero Banner */}
          <BonusHeroBanner
            totalPay={currentBonusData.totalPay}
            totalViewsBonus={currentBonusData.totalViewsBonus}
            totalFollowerBonus={currentBonusData.totalFollowerBonus}
            accounts={currentBonusData.accounts}
            goldOrHigherCount={goldOrHigherCount}
            prevWeekTotalPay={prevWeekTotalPay}
            isCurrentWeek={isCurrentWeek}
          />

          {/* Per-Account Cards Grid */}
          {currentBonusData.accounts.length > 0 && (
            <>
              <div style={{
                fontSize: 13, color: "#a0a0a0", fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.5px",
                marginTop: 24, marginBottom: 14,
              }}>
                Per-Account Breakdown
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
                gap: 14,
              }}>
                {currentBonusData.accounts.map((acc) => (
                  <BonusAccountCard key={acc.igAccountId} account={acc} />
                ))}
              </div>
            </>
          )}

          {currentBonusData.accounts.length === 0 && (
            <div style={{
              color: "#666", fontSize: 13, textAlign: "center",
              padding: "24px 0", marginTop: 16,
            }}>
              No IG accounts found for this employee.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
