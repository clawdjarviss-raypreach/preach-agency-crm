"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import GoalForm, {
  type GoalFormGoal,
  parseSmartDescription,
} from "../../../../../components/GoalForm";
import ProgressTracker, {
  type ProgressTrackerGoal,
} from "../../../../../components/ProgressTracker";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type GoalStatus = "active" | "achieved" | "missed" | "cancelled";

function statusBadge(status: GoalStatus, periodEnd: number, now: number) {
  const expired = status === "active" && periodEnd < now;

  if (status === "achieved") {
    return { label: "Achieved", color: "var(--green)", bg: "var(--green-bg)" };
  }
  if (status === "cancelled") {
    return { label: "Cancelled", color: "var(--text-secondary)", bg: "var(--bg)" };
  }
  if (status === "missed" || expired) {
    return { label: expired ? "Expired" : "Missed", color: "var(--red)", bg: "var(--red-bg)" };
  }
  return { label: "Active", color: "var(--accent)", bg: "rgba(196,149,106,0.12)" };
}

export default function GoalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const goalId = params?.id as string | undefined;

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmClose, setConfirmClose] = useState<"achieved" | "missed" | "cancelled" | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const canManage = isSupervisorRole(user?.role);

  const goal = useQuery(
    api.crm.coaching.getGoalById,
    token && goalId ? { token, goalId: goalId as Id<"crm_coaching_goals"> } : "skip"
  ) as any | undefined;

  const chatters = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip") as
    | any[]
    | undefined;

  const chatterById = useMemo(() => {
    const map: Record<string, { id: string; name: string; avatarEmoji?: string }> = {};
    (chatters || []).forEach((c: any) => {
      map[String(c.id)] = {
        id: String(c.id),
        name: String(c.name ?? c.username ?? c.id),
        avatarEmoji: c.avatarEmoji,
      };
    });
    return map;
  }, [chatters]);

  const chatterOptions = useMemo(() => {
    return (chatters || []).map((c: any) => ({
      id: String(c.id),
      name: String(c.name ?? c.username ?? c.id),
      role: c.role,
      avatarEmoji: c.avatarEmoji,
    }));
  }, [chatters]);

  const updateGoal = useMutation(api.crm.coaching.updateGoal);

  const closeGoal = async (newStatus: "achieved" | "missed" | "cancelled") => {
    if (!token || !goal) return;
    try {
      await updateGoal({
        token,
        goalId: goal._id as Id<"crm_coaching_goals">,
        status: newStatus,
      } as any);
      setConfirmClose(null);
    } catch (e) {
      console.error(e);
    }
  };

  if (!goalId) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontWeight: 900 }}>Goal not found.</div>
        <Link href="/coaching/goals" style={{ color: "var(--accent)" }}>
          ← Back to goals
        </Link>
      </div>
    );
  }

  if (goal === undefined) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontWeight: 900 }}>Loading…</div>
      </div>
    );
  }

  if (goal === null) {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ fontWeight: 900 }}>Goal not found.</div>
        <Link href="/coaching/goals" style={{ color: "var(--accent)" }}>
          ← Back to goals
        </Link>
      </div>
    );
  }

  const now = Date.now();
  const badge = statusBadge(goal.status as GoalStatus, goal.periodEnd, now);
  const chatter = chatterById[String(goal.chatterId)];
  const smart = parseSmartDescription(goal.description);

  const formGoal: GoalFormGoal = {
    id: String(goal._id),
    chatterId: String(goal.chatterId),
    title: goal.title ?? "",
    description: goal.description,
    metric: goal.metric,
    targetValue: goal.targetValue,
    currentValue: goal.currentValue,
    startValue: goal.startValue,
    unit: goal.unit,
    periodStart: goal.periodStart,
    periodEnd: goal.periodEnd,
    visibility: goal.visibility ?? "shared",
    status: goal.status,
  };

  const trackerGoal: ProgressTrackerGoal = {
    id: String(goal._id),
    title: goal.title ?? "",
    status: goal.status,
    unit: goal.unit,
    startValue: goal.startValue,
    currentValue: goal.currentValue,
    targetValue: goal.targetValue,
    progressPercent: goal.progressPercent,
    checkIns: goal.checkIns,
  };

  const allowProgressEdit = canManage && goal.status === "active";

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ marginBottom: 14 }}>
        <Link href="/coaching/goals" style={{ color: "var(--accent)", fontSize: 13 }}>
          ← Back to goals
        </Link>
      </div>

      {editing ? (
        <GoalForm
          token={token}
          chatters={chatterOptions}
          initialGoal={formGoal}
          onCancel={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <>
          <div
            style={{
              padding: 16,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 18 }}>{goal.title}</div>
                <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
                  👤 {chatter?.name ?? goal.chatterId}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 10px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    color: badge.color,
                    background: badge.bg,
                    textTransform: "capitalize",
                    whiteSpace: "nowrap",
                  }}
                >
                  {badge.label}
                </span>

                {canManage ? (
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: "var(--bg)",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Edit
                  </button>
                ) : null}
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Period</div>
                <div style={{ marginTop: 4, fontWeight: 700 }}>
                  {formatDate(goal.periodStart)} → {formatDate(goal.periodEnd)}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Metric</div>
                <div style={{ marginTop: 4, fontWeight: 700, textTransform: "capitalize" }}>
                  {goal.metric?.replace(/_/g, " ") ?? "Custom"}
                </div>
              </div>

              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visibility</div>
                <div style={{ marginTop: 4, fontWeight: 700, textTransform: "capitalize" }}>
                  {goal.visibility ?? "shared"}
                </div>
              </div>
            </div>

            {(smart.specific ||
              smart.measurable ||
              smart.achievable ||
              smart.relevant ||
              smart.timeBound ||
              smart.notes) && (
              <div
                style={{
                  marginTop: 16,
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ fontWeight: 900 }}>SMART Breakdown</div>
                <div style={{ marginTop: 10, display: "grid", gap: 10, fontSize: 13 }}>
                  {smart.specific ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Specific</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.specific}</div>
                    </div>
                  ) : null}
                  {smart.measurable ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Measurable</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.measurable}</div>
                    </div>
                  ) : null}
                  {smart.achievable ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Achievable</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.achievable}</div>
                    </div>
                  ) : null}
                  {smart.relevant ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Relevant</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.relevant}</div>
                    </div>
                  ) : null}
                  {smart.timeBound ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Time-bound</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.timeBound}</div>
                    </div>
                  ) : null}
                  {smart.notes ? (
                    <div>
                      <div style={{ fontWeight: 700, color: "var(--text-secondary)" }}>Notes</div>
                      <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{smart.notes}</div>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {canManage && goal.status === "active" ? (
              <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  onClick={() => setConfirmClose("achieved")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--green)",
                    background: "var(--green-bg)",
                    color: "var(--green)",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✓ Mark Achieved
                </button>
                <button
                  onClick={() => setConfirmClose("missed")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--red)",
                    background: "var(--red-bg)",
                    color: "var(--red)",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  ✗ Mark Missed
                </button>
                <button
                  onClick={() => setConfirmClose("cancelled")}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  Cancel Goal
                </button>
              </div>
            ) : null}
          </div>

          <div style={{ marginTop: 20 }}>
            <ProgressTracker
              token={token}
              goal={trackerGoal}
              allowEdit={allowProgressEdit}
              chatterNameById={(id) => chatterById[id]?.name}
            />
          </div>
        </>
      )}

      {confirmClose ? (
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
            if (e.target === e.currentTarget) setConfirmClose(null);
          }}
        >
          <div
            style={{
              width: "min(400px, 100%)",
              padding: 20,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>
              {confirmClose === "achieved"
                ? "Mark goal as achieved?"
                : confirmClose === "missed"
                  ? "Mark goal as missed?"
                  : "Cancel this goal?"}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
              This action will close the goal and cannot be undone easily.
            </div>
            <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmClose(null)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => void closeGoal(confirmClose)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background:
                    confirmClose === "achieved"
                      ? "var(--green)"
                      : confirmClose === "missed"
                        ? "var(--red)"
                        : "var(--bg)",
                  color: confirmClose === "cancelled" ? "var(--text)" : "white",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
