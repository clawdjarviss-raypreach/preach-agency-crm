"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import GoalCard, {
  type GoalCardChatter,
  type GoalCardGoal,
} from "../../../../components/GoalCard";
import GoalForm, { type GoalFormChatterOption } from "../../../../components/GoalForm";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

type StatusFilter = "all" | "active" | "completed" | "expired";

type PeriodFilter = "all" | "weekly" | "monthly" | "quarterly";

function periodBucket(goal: Pick<GoalCardGoal, "periodStart" | "periodEnd">): PeriodFilter {
  const days = Math.round((goal.periodEnd - goal.periodStart) / (24 * 60 * 60 * 1000));
  if (days <= 8) return "weekly";
  if (days <= 32) return "monthly";
  return "quarterly";
}

function uiStatus(goal: Pick<GoalCardGoal, "status" | "periodEnd">, now: number): Exclude<StatusFilter, "all"> {
  if (goal.status === "achieved" || goal.status === "cancelled") return "completed";
  if (goal.status === "missed") return "expired";
  if (goal.status === "active" && goal.periodEnd < now) return "expired";
  return "active";
}

function normalizeGoal(raw: any): GoalCardGoal {
  return {
    id: String(raw.id ?? raw._id),
    chatterId: String(raw.chatterId),
    title: String(raw.title ?? ""),
    description: raw.description ?? undefined,
    metric: raw.metric ?? undefined,
    targetValue: raw.targetValue ?? undefined,
    currentValue: raw.currentValue ?? undefined,
    startValue: raw.startValue ?? undefined,
    unit: raw.unit ?? undefined,
    periodStart: Number(raw.periodStart ?? 0),
    periodEnd: Number(raw.periodEnd ?? 0),
    status: raw.status as GoalCardGoal["status"],
    achievedAt: raw.achievedAt ?? undefined,
    progressPercent: raw.progressPercent ?? undefined,
    checkIns: raw.checkIns ?? undefined,
  };
}

export default function GoalsPage() {
  const router = useRouter();

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  const [selectedChatterId, setSelectedChatterId] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");

  const [showNewGoal, setShowNewGoal] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const canManage = isSupervisorRole(user?.role);

  const chatters = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip") as
    | any[]
    | undefined;

  const chatterOptions = useMemo((): GoalFormChatterOption[] => {
    return (chatters || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name ?? c.username ?? c.id),
      role: c.role,
      avatarEmoji: c.avatarEmoji,
    }));
  }, [chatters]);

  const chatterById = useMemo(() => {
    const map: Record<string, GoalCardChatter> = {};
    (chatters || []).forEach((c: any) => {
      map[String(c.id)] = {
        id: String(c.id),
        name: String(c.name ?? c.username ?? c.id),
        avatarEmoji: c.avatarEmoji,
        profilePictureUrl: c.profilePictureUrl,
      };
    });
    return map;
  }, [chatters]);

  const activeArgs = useMemo(() => {
    if (!token) return "skip" as const;

    if (canManage) {
      if (selectedChatterId) {
        return {
          token,
          chatterId: selectedChatterId as Id<"crm_chatters">,
          limit: 500,
        };
      }
      return { token, limit: 500 };
    }

    if (user?.id) {
      return {
        token,
        chatterId: user.id as Id<"crm_chatters">,
        limit: 500,
      };
    }

    return "skip" as const;
  }, [token, canManage, selectedChatterId, user?.id]);

  const activeGoalsRaw = useQuery(api.crm.coaching.getActiveGoals, activeArgs as any) as
    | any[]
    | undefined;

  const historyChatterId = useMemo(() => {
    if (!token) return "";
    if (canManage) return selectedChatterId; // only if a chatter is selected
    return user?.id ?? "";
  }, [token, canManage, selectedChatterId, user?.id]);

  const goalsForChatterRaw = useQuery(
    api.crm.coaching.getGoalsByChatter,
    token && historyChatterId
      ? { token, chatterId: historyChatterId as Id<"crm_chatters"> }
      : "skip"
  ) as any[] | undefined;

  // Default chatter selection: for chatters, lock to self.
  useEffect(() => {
    if (!user?.id) return;
    if (!canManage) {
      setSelectedChatterId(user.id);
    }
  }, [canManage, user?.id]);

  const now = Date.now();

  const activeGoals = useMemo(() => {
    return (activeGoalsRaw || []).map(normalizeGoal);
  }, [activeGoalsRaw]);

  const expiredFromActive = useMemo(() => {
    return activeGoals.filter((g) => uiStatus(g, now) === "expired");
  }, [activeGoals, now]);

  const activeNotExpired = useMemo(() => {
    return activeGoals
      .filter((g) => uiStatus(g, now) === "active")
      .filter((g) => (periodFilter === "all" ? true : periodBucket(g) === periodFilter));
  }, [activeGoals, now, periodFilter]);

  const historyGoals = useMemo(() => {
    const base = goalsForChatterRaw ? goalsForChatterRaw.map(normalizeGoal) : expiredFromActive;
    const filtered = base
      .filter((g) => uiStatus(g, now) !== "active")
      .filter((g) => (periodFilter === "all" ? true : periodBucket(g) === periodFilter));

    filtered.sort((a, b) => (b.periodEnd ?? 0) - (a.periodEnd ?? 0));
    return filtered;
  }, [goalsForChatterRaw, expiredFromActive, now, periodFilter]);

  const filteredActive = useMemo(() => {
    if (statusFilter === "all" || statusFilter === "active") return activeNotExpired;
    return [] as GoalCardGoal[];
  }, [statusFilter, activeNotExpired]);

  const filteredHistory = useMemo(() => {
    if (statusFilter === "all") return historyGoals;
    if (statusFilter === "completed") {
      return historyGoals.filter((g) => uiStatus(g, now) === "completed");
    }
    if (statusFilter === "expired") {
      return historyGoals.filter((g) => uiStatus(g, now) === "expired");
    }
    return [] as GoalCardGoal[];
  }, [statusFilter, historyGoals, now]);

  const activeGrouped = useMemo(() => {
    const map: Record<string, GoalCardGoal[]> = {};
    for (const g of filteredActive) {
      map[g.chatterId] = map[g.chatterId] ? [...map[g.chatterId], g] : [g];
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => a.periodEnd - b.periodEnd);
    }
    return map;
  }, [filteredActive]);

  const historyGrouped = useMemo(() => {
    const map: Record<string, GoalCardGoal[]> = {};
    for (const g of filteredHistory) {
      map[g.chatterId] = map[g.chatterId] ? [...map[g.chatterId], g] : [g];
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => b.periodEnd - a.periodEnd);
    }
    return map;
  }, [filteredHistory]);

  const defaultNewGoalChatterId = useMemo(() => {
    if (!canManage) return user?.id ?? "";
    if (selectedChatterId) return selectedChatterId;
    const first = chatterOptions.find((c) => c.role === "chatter") ?? chatterOptions[0];
    return first?.id ?? "";
  }, [canManage, user?.id, selectedChatterId, chatterOptions]);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>🎯 Performance Goals</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            Set SMART goals and track progress with check-ins.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {canManage ? (
            <button
              onClick={() => setShowNewGoal(true)}
              style={{
                padding: "10px 12px",
                background: "var(--accent)",
                color: "white",
                border: "1px solid var(--border)",
                borderRadius: 10,
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              + New Goal
            </button>
          ) : null}
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: canManage ? "1.2fr 1fr 1fr" : "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        {canManage ? (
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
            <select
              value={selectedChatterId}
              onChange={(e) => setSelectedChatterId(e.target.value)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="">All chatters</option>
              {(chatters || [])
                .filter((c: any) => c.role === "chatter")
                .map((c: any) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Status</div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="expired">Expired</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Period</div>
          <select
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="all">All</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>Active Goals</div>
        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          {filteredActive.length === 0 ? (
            <div style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
              <div style={{ fontWeight: 800 }}>No active goals.</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                {canManage ? "Create a goal to start tracking progress." : "Your supervisor will assign goals here."}
              </div>
            </div>
          ) : selectedChatterId || !canManage ? (
            filteredActive.map((g) => (
              <GoalCard key={g.id} goal={g} chatter={chatterById[g.chatterId]} />
            ))
          ) : (
            Object.entries(activeGrouped)
              .sort(([a], [b]) => (chatterById[a]?.name ?? a).localeCompare(chatterById[b]?.name ?? b))
              .map(([chatterId, list]) => (
                <div key={chatterId} style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-secondary)" }}>
                    {chatterById[chatterId]?.name ?? chatterId} • {list.length} goal{list.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {list.map((g) => (
                      <GoalCard key={g.id} goal={g} chatter={chatterById[g.chatterId]} />
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>Completed / Expired</div>
        {!historyChatterId && canManage ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            Select a chatter to view full goal history.
          </div>
        ) : null}

        <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
          {filteredHistory.length === 0 ? (
            <div style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
              <div style={{ fontWeight: 800 }}>No history yet.</div>
              <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                Completed or expired goals will appear here.
              </div>
            </div>
          ) : selectedChatterId || !canManage ? (
            filteredHistory.map((g) => (
              <GoalCard key={g.id} goal={g} chatter={chatterById[g.chatterId]} compact />
            ))
          ) : (
            Object.entries(historyGrouped)
              .sort(([a], [b]) => (chatterById[a]?.name ?? a).localeCompare(chatterById[b]?.name ?? b))
              .map(([chatterId, list]) => (
                <div key={chatterId} style={{ display: "grid", gap: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "var(--text-secondary)" }}>
                    {chatterById[chatterId]?.name ?? chatterId} • {list.length} item{list.length === 1 ? "" : "s"}
                  </div>
                  <div style={{ display: "grid", gap: 12 }}>
                    {list.map((g) => (
                      <GoalCard key={g.id} goal={g} chatter={chatterById[g.chatterId]} compact />
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      {showNewGoal ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowNewGoal(false);
          }}
        >
          <div
            style={{
              width: "min(900px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "transparent",
            }}
          >
            <GoalForm
              token={token}
              chatters={chatterOptions}
              defaultChatterId={defaultNewGoalChatterId}
              onCancel={() => setShowNewGoal(false)}
              onSaved={(goalId) => {
                setShowNewGoal(false);
                router.push(`/coaching/goals/${goalId}`);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
