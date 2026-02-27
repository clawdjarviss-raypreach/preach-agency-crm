"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export type GoalStatus = "active" | "achieved" | "missed" | "cancelled";

export type GoalCheckIn = {
  date: number;
  value?: number;
  note: string;
  recordedBy: string;
};

export type ProgressTrackerGoal = {
  id: string;
  title: string;
  status: GoalStatus;
  unit?: string;
  startValue?: number;
  currentValue?: number;
  targetValue?: number;
  progressPercent?: number;
  checkIns?: GoalCheckIn[];
};

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function clampPercent(p: number) {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function computedPercent(goal: ProgressTrackerGoal): number | undefined {
  if (goal.progressPercent !== undefined) return clampPercent(goal.progressPercent);
  if (
    goal.currentValue === undefined ||
    goal.targetValue === undefined ||
    goal.startValue === undefined
  ) {
    return undefined;
  }
  if (goal.targetValue === goal.startValue) return 100;
  const raw = ((goal.currentValue - goal.startValue) / (goal.targetValue - goal.startValue)) * 100;
  return clampPercent(raw);
}

function parseOptionalNumber(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

export default function ProgressTracker({
  token,
  goal,
  allowEdit,
  chatterNameById,
}: {
  token: string;
  goal: ProgressTrackerGoal;
  allowEdit: boolean;
  chatterNameById?: (id: string) => string | undefined;
}) {
  const updateGoalProgress = useMutation(api.crm.coaching.updateGoalProgress);

  const [note, setNote] = useState<string>("");
  const [customValue, setCustomValue] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    setError("");
    setSuccess("");
  }, [goal.id]);

  const unitSuffix = goal.unit ? ` ${goal.unit}` : "";

  const percent = computedPercent(goal);

  const history = useMemo(() => {
    const list = [...(goal.checkIns ?? [])];
    list.sort((a, b) => b.date - a.date);
    return list;
  }, [goal.checkIns]);

  const current = goal.currentValue ?? goal.startValue;

  const setValue = async (nextValue: number | undefined, label: string) => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing auth token.");
      return;
    }

    if (!allowEdit) {
      setError("You don't have permission to update this goal.");
      return;
    }

    setSaving(true);
    try {
      await updateGoalProgress({
        token,
        goalId: goal.id as Id<"crm_coaching_goals">,
        currentValue: nextValue,
        note: note.trim() ? note.trim() : undefined,
      });
      setSuccess(label);
      setNote("");
      setCustomValue("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to update progress");
    } finally {
      setSaving(false);
    }
  };

  const quickAdd = async (delta: number) => {
    const base = current ?? 0;
    const next = base + delta;
    await setValue(next, `Updated (+${delta}).`);
  };

  const submitCustom = async () => {
    const v = parseOptionalNumber(customValue);
    if (v === undefined) {
      setError("Enter a number for current value.");
      return;
    }
    await setValue(v, "Updated.");
  };

  const canShowNumbers =
    goal.targetValue !== undefined || goal.currentValue !== undefined || goal.startValue !== undefined;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16 }}>Progress</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            {percent !== undefined ? `${percent}% complete` : "Progress tracking"}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div
          style={{
            height: 10,
            borderRadius: 999,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percent ?? 0}%`,
              height: "100%",
              background:
                goal.status === "achieved"
                  ? "var(--green)"
                  : goal.status === "missed" || goal.status === "cancelled"
                    ? "var(--red)"
                    : "var(--accent)",
            }}
          />
        </div>

        {canShowNumbers ? (
          <div style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13 }}>
            <div style={{ color: "var(--text-secondary)" }}>
              Current: <span style={{ fontWeight: 900, color: "var(--text)" }}>{goal.currentValue ?? "—"}</span>
              {unitSuffix}
            </div>
            <div style={{ color: "var(--text-secondary)" }}>
              Target: <span style={{ fontWeight: 900, color: "var(--text)" }}>{goal.targetValue ?? "—"}</span>
              {unitSuffix}
            </div>
            <div style={{ color: "var(--text-secondary)" }}>
              Baseline: <span style={{ fontWeight: 900, color: "var(--text)" }}>{goal.startValue ?? "—"}</span>
              {unitSuffix}
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>
            This goal is note-based (no numeric tracking).
          </div>
        )}
      </div>

      {error ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--red)",
            background: "var(--red-bg)",
            color: "var(--red)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}
      {success ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            borderRadius: 12,
            border: "1px solid var(--green)",
            background: "var(--green-bg)",
            color: "var(--green)",
            fontSize: 13,
          }}
        >
          {success}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Check-in note (optional)</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={saving || !allowEdit}
            rows={2}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              resize: "vertical",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            onClick={() => void quickAdd(5)}
            disabled={saving || !allowEdit}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: saving || !allowEdit ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            +5
          </button>
          <button
            type="button"
            onClick={() => void quickAdd(10)}
            disabled={saving || !allowEdit}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: saving || !allowEdit ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            +10
          </button>

          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              disabled={saving || !allowEdit}
              inputMode="decimal"
              placeholder="Set current value"
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                minWidth: 180,
              }}
            />
            <button
              type="button"
              onClick={() => void submitCustom()}
              disabled={saving || !allowEdit}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: saving ? "var(--bg)" : "var(--accent)",
                color: saving ? "var(--text-muted)" : "white",
                cursor: saving || !allowEdit ? "not-allowed" : "pointer",
                fontWeight: 900,
              }}
            >
              {saving ? "Updating…" : "Update"}
            </button>
          </div>

          <button
            type="button"
            onClick={() => void setValue(undefined, "Check-in added.")}
            disabled={saving || !allowEdit}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: saving || !allowEdit ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
            title="Add a note-only check-in"
          >
            Add note only
          </button>
        </div>

        {!allowEdit ? (
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Updates are disabled for this goal.
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 900, fontSize: 14 }}>Progress history</div>
        {history.length === 0 ? (
          <div style={{ marginTop: 8, fontSize: 13, color: "var(--text-secondary)" }}>
            No check-ins yet.
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {history.map((c, idx) => (
              <div
                key={`${c.date}_${idx}`}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{formatDateTime(c.date)}</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    {c.value !== undefined ? `Value: ${c.value}${unitSuffix}` : "Note-only"}
                  </div>
                </div>
                {c.note ? (
                  <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.45 }}>{c.note}</div>
                ) : null}
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                  Recorded by: {chatterNameById?.(c.recordedBy) ?? c.recordedBy}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
