"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export type GoalMetric =
  | "response_time"
  | "earnings"
  | "messages_handled"
  | "vip_retention"
  | "shift_hours"
  | "ppv_sales"
  | "tip_amount"
  | "custom";

export type GoalVisibility = "private" | "shared" | "team";

export type GoalStatus = "active" | "achieved" | "missed" | "cancelled";

export type GoalFormChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

export type GoalFormGoal = {
  id: string;
  chatterId: string;
  title: string;
  description?: string;
  metric?: GoalMetric;
  targetValue?: number;
  currentValue?: number;
  startValue?: number;
  unit?: string;
  periodStart: number;
  periodEnd: number;
  visibility: GoalVisibility;
  status: GoalStatus;
};

type SmartFields = {
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  notes: string;
};

function emptySmart(): SmartFields {
  return {
    specific: "",
    measurable: "",
    achievable: "",
    relevant: "",
    timeBound: "",
    notes: "",
  };
}

function normalizeHeading(s: string): keyof SmartFields | null {
  const t = s.trim().toLowerCase();
  if (t.startsWith("specific")) return "specific";
  if (t.startsWith("measurable")) return "measurable";
  if (t.startsWith("achievable")) return "achievable";
  if (t.startsWith("relevant")) return "relevant";
  if (t.startsWith("time-bound") || t.startsWith("time bound") || t.startsWith("timebound")) {
    return "timeBound";
  }
  if (t.startsWith("notes") || t.startsWith("description")) return "notes";
  return null;
}

export function parseSmartDescription(description?: string): SmartFields {
  const d = (description ?? "").trim();
  if (!d) return emptySmart();

  const lines = d.split(/\r?\n/);
  const acc: Record<keyof SmartFields, string[]> = {
    specific: [],
    measurable: [],
    achievable: [],
    relevant: [],
    timeBound: [],
    notes: [],
  };

  let current: keyof SmartFields = "notes";
  let sawHeading = false;

  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z\-\s]+)\s*:\s*(.*)$/);
    if (m) {
      const head = normalizeHeading(m[1] ?? "");
      if (head) {
        current = head;
        sawHeading = true;
        const rest = (m[2] ?? "").trim();
        if (rest) acc[current].push(rest);
        continue;
      }
    }

    acc[current].push(line);
  }

  const out: SmartFields = {
    specific: acc.specific.join("\n").trim(),
    measurable: acc.measurable.join("\n").trim(),
    achievable: acc.achievable.join("\n").trim(),
    relevant: acc.relevant.join("\n").trim(),
    timeBound: acc.timeBound.join("\n").trim(),
    notes: acc.notes.join("\n").trim(),
  };

  if (!sawHeading) {
    // Backwards-compatible: treat plain description as the "Specific" text.
    return { ...emptySmart(), specific: d };
  }

  return out;
}

export function encodeSmartDescription(s: SmartFields): string | undefined {
  const cleaned: SmartFields = {
    specific: s.specific.trim(),
    measurable: s.measurable.trim(),
    achievable: s.achievable.trim(),
    relevant: s.relevant.trim(),
    timeBound: s.timeBound.trim(),
    notes: s.notes.trim(),
  };

  const anyContent = Object.values(cleaned).some((v) => v.length > 0);
  if (!anyContent) return undefined;

  const parts: string[] = [];
  parts.push(`Specific: ${cleaned.specific}`.trimEnd());
  parts.push(`Measurable: ${cleaned.measurable}`.trimEnd());
  parts.push(`Achievable: ${cleaned.achievable}`.trimEnd());
  parts.push(`Relevant: ${cleaned.relevant}`.trimEnd());
  parts.push(`Time-bound: ${cleaned.timeBound}`.trimEnd());
  if (cleaned.notes) parts.push(`Notes: ${cleaned.notes}`.trimEnd());

  return parts.join("\n\n").trim();
}

function toDateInputValue(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  // midday to avoid DST edge cases.
  const d = new Date(value + "T12:00:00");
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

function parseOptionalNumber(s: string): number | undefined {
  if (!s.trim()) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

type PeriodPreset = "weekly" | "monthly" | "quarterly" | "custom";

function presetDays(p: PeriodPreset): number | null {
  if (p === "weekly") return 7;
  if (p === "monthly") return 30;
  if (p === "quarterly") return 90;
  return null;
}

function addDays(ts: number, days: number): number {
  return ts + days * 24 * 60 * 60 * 1000;
}

function metricLabel(m: GoalMetric) {
  const map: Record<GoalMetric, string> = {
    response_time: "Response Time",
    earnings: "Earnings",
    messages_handled: "Messages Handled",
    vip_retention: "VIP Retention",
    shift_hours: "Shift Hours",
    ppv_sales: "PPV Sales",
    tip_amount: "Tip Amount",
    custom: "Custom",
  };
  return map[m] ?? m;
}

export default function GoalForm({
  token,
  chatters,
  initialGoal,
  defaultChatterId,
  onSaved,
  onCancel,
}: {
  token: string;
  chatters: GoalFormChatterOption[];
  initialGoal?: GoalFormGoal;
  defaultChatterId?: string;
  onSaved?: (goalId: string) => void;
  onCancel?: () => void;
}) {
  const createGoal = useMutation(api.crm.coaching.createGoal);
  const updateGoal = useMutation(api.crm.coaching.updateGoal);

  const chatterOptions = useMemo(() => {
    const onlyChatters = chatters.filter((c) => (c.role ? c.role === "chatter" : true));
    return onlyChatters.length ? onlyChatters : chatters;
  }, [chatters]);

  const [initialized, setInitialized] = useState(false);

  const [chatterId, setChatterId] = useState<string>(initialGoal?.chatterId ?? defaultChatterId ?? "");
  const [title, setTitle] = useState<string>(initialGoal?.title ?? "");

  const [smart, setSmart] = useState<SmartFields>(() => parseSmartDescription(initialGoal?.description));

  const [metric, setMetric] = useState<GoalMetric>(initialGoal?.metric ?? "custom");
  const [unit, setUnit] = useState<string>(initialGoal?.unit ?? "");

  const [startValue, setStartValue] = useState<string>(
    initialGoal?.startValue !== undefined ? String(initialGoal.startValue) : ""
  );
  const [currentValue, setCurrentValue] = useState<string>(
    initialGoal?.currentValue !== undefined ? String(initialGoal.currentValue) : ""
  );
  const [targetValue, setTargetValue] = useState<string>(
    initialGoal?.targetValue !== undefined ? String(initialGoal.targetValue) : ""
  );

  const [periodStart, setPeriodStart] = useState<string>(
    toDateInputValue(initialGoal?.periodStart ?? Date.now())
  );
  const [periodEnd, setPeriodEnd] = useState<string>(
    toDateInputValue(initialGoal?.periodEnd ?? addDays(Date.now(), 30))
  );

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("monthly");

  const [visibility, setVisibility] = useState<GoalVisibility>(initialGoal?.visibility ?? "shared");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    if (initialized) return;

    if (initialGoal) {
      // Guess preset from duration.
      const days = Math.round((initialGoal.periodEnd - initialGoal.periodStart) / (24 * 60 * 60 * 1000));
      if (days <= 8) setPeriodPreset("weekly");
      else if (days <= 32) setPeriodPreset("monthly");
      else if (days <= 100) setPeriodPreset("quarterly");
      else setPeriodPreset("custom");
    }

    // Creation defaults: baseline equals current.
    if (!initialGoal && !startValue && currentValue) {
      setStartValue(currentValue);
    }

    setInitialized(true);
  }, [initialized, initialGoal, startValue, currentValue]);

  const onChangePreset = (p: PeriodPreset) => {
    setPeriodPreset(p);
    const startTs = fromDateInputValue(periodStart);
    const days = presetDays(p);
    if (startTs !== undefined && days !== null) {
      setPeriodEnd(toDateInputValue(addDays(startTs, days)));
    }
  };

  const submit = async () => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing auth token.");
      return;
    }

    if (!chatterId) {
      setError("Please select a chatter.");
      return;
    }

    const t = title.trim();
    if (!t) {
      setError("Please enter a title.");
      return;
    }

    const startTs = fromDateInputValue(periodStart);
    const endTs = fromDateInputValue(periodEnd);
    if (startTs === undefined || endTs === undefined) {
      setError("Please choose a valid start and end date.");
      return;
    }
    if (endTs <= startTs) {
      setError("End date must be after start date.");
      return;
    }

    const target = parseOptionalNumber(targetValue);
    const current = parseOptionalNumber(currentValue);
    const baseline = parseOptionalNumber(startValue) ?? current;

    if (target !== undefined && current === undefined) {
      setError("If you set a target, please set the current value too.");
      return;
    }

    const desc = encodeSmartDescription(smart);

    setSaving(true);
    try {
      if (initialGoal) {
        await updateGoal({
          token,
          goalId: initialGoal.id as Id<"crm_coaching_goals">,
          chatterId: undefined as never, // (not patchable)
          title: t,
          description: desc,
          metric,
          unit: unit.trim() ? unit.trim() : undefined,
          targetValue: target,
          currentValue: current,
          startValue: baseline,
          periodStart: startTs,
          periodEnd: endTs,
          visibility,
        } as any);

        setSuccess("Saved.");
        onSaved?.(initialGoal.id);
      } else {
        const goalId = await createGoal({
          token,
          chatterId: chatterId as Id<"crm_chatters">,
          title: t,
          description: desc,
          metric,
          unit: unit.trim() ? unit.trim() : undefined,
          targetValue: target,
          currentValue: current,
          startValue: baseline,
          periodStart: startTs,
          periodEnd: endTs,
          visibility,
        });
        setSuccess("Goal created.");
        onSaved?.(String(goalId));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to save goal");
    } finally {
      setSaving(false);
    }
  };

  const smartCheck = {
    specific: smart.specific.trim().length > 0,
    measurable:
      smart.measurable.trim().length > 0 ||
      (parseOptionalNumber(targetValue) !== undefined && parseOptionalNumber(currentValue) !== undefined),
    achievable: smart.achievable.trim().length > 0,
    relevant: smart.relevant.trim().length > 0,
    timeBound: Boolean(fromDateInputValue(periodEnd)),
  };

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
          <div style={{ fontWeight: 900, fontSize: 16 }}>{initialGoal ? "Edit Goal" : "Set New Goal"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Define a SMART goal with measurable progress.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {onCancel ? (
            <button
              type="button"
              onClick={() => onCancel()}
              disabled={saving}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
          ) : null}
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: saving ? "var(--bg)" : "var(--accent)",
              color: saving ? "var(--text-muted)" : "white",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            {saving ? "Saving…" : initialGoal ? "Save" : "Create Goal"}
          </button>
        </div>
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

      <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
            <select
              value={chatterId}
              onChange={(e) => setChatterId(e.target.value)}
              disabled={saving || Boolean(initialGoal)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="">Select…</option>
              {chatterOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
                </option>
              ))}
            </select>
            {initialGoal ? (
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                Chatter assignment cannot be changed after creation.
              </div>
            ) : null}
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visibility</div>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as GoalVisibility)}
              disabled={saving}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="private">Private (supervisor only)</option>
              <option value="shared">Shared with chatter</option>
              <option value="team">Team visible</option>
            </select>
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Goal Title</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            placeholder="e.g. Reduce response time under 5 minutes"
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
          <div style={{ fontWeight: 900 }}>SMART Breakdown</div>
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {(
              [
                ["Specific", "specific"],
                ["Measurable", "measurable"],
                ["Achievable", "achievable"],
                ["Relevant", "relevant"],
                ["Time-bound", "timeBound"],
              ] as const
            ).map(([label, key]) => (
              <label key={key} style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</div>
                <textarea
                  value={smart[key]}
                  onChange={(e) => setSmart((s) => ({ ...s, [key]: e.target.value }))}
                  disabled={saving}
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
            ))}

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Notes (optional)</div>
              <textarea
                value={smart.notes}
                onChange={(e) => setSmart((s) => ({ ...s, notes: e.target.value }))}
                disabled={saving}
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
          </div>

          <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 900 }}>SMART Check</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "var(--text-secondary)" }}>
              <span style={{ color: smartCheck.specific ? "var(--green)" : "var(--text-secondary)" }}>
                {smartCheck.specific ? "✓" : "•"} Specific
              </span>
              <span style={{ color: smartCheck.measurable ? "var(--green)" : "var(--text-secondary)" }}>
                {smartCheck.measurable ? "✓" : "•"} Measurable
              </span>
              <span style={{ color: smartCheck.achievable ? "var(--green)" : "var(--text-secondary)" }}>
                {smartCheck.achievable ? "✓" : "•"} Achievable
              </span>
              <span style={{ color: smartCheck.relevant ? "var(--green)" : "var(--text-secondary)" }}>
                {smartCheck.relevant ? "✓" : "•"} Relevant
              </span>
              <span style={{ color: smartCheck.timeBound ? "var(--green)" : "var(--text-secondary)" }}>
                {smartCheck.timeBound ? "✓" : "•"} Time-bound
              </span>
            </div>
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
          <div style={{ fontWeight: 900 }}>Measurement</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Type</div>
              <select
                value={metric}
                onChange={(e) => setMetric(e.target.value as GoalMetric)}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                {(
                  [
                    "response_time",
                    "earnings",
                    "messages_handled",
                    "vip_retention",
                    "shift_hours",
                    "ppv_sales",
                    "tip_amount",
                    "custom",
                  ] as GoalMetric[]
                ).map((m) => (
                  <option key={m} value={m}>
                    {metricLabel(m)}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Unit (optional)</div>
              <input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                disabled={saving}
                placeholder="e.g. minutes, $, messages, %"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Baseline (start value)</div>
              <input
                value={startValue}
                onChange={(e) => setStartValue(e.target.value)}
                disabled={saving}
                placeholder="e.g. 8"
                inputMode="decimal"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Current</div>
              <input
                value={currentValue}
                onChange={(e) => setCurrentValue(e.target.value)}
                disabled={saving}
                placeholder="e.g. 8"
                inputMode="decimal"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Target</div>
              <input
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                disabled={saving}
                placeholder="e.g. 5"
                inputMode="decimal"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
            Tip: If baseline is blank, it will default to the current value.
          </div>
        </div>

        <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
          <div style={{ fontWeight: 900 }}>Timeframe</div>
          <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Period</div>
              <select
                value={periodPreset}
                onChange={(e) => onChangePreset(e.target.value as PeriodPreset)}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Start</div>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => {
                  setPeriodStart(e.target.value);
                  const days = presetDays(periodPreset);
                  const startTs = fromDateInputValue(e.target.value);
                  if (days !== null && startTs !== undefined && periodPreset !== "custom") {
                    setPeriodEnd(toDateInputValue(addDays(startTs, days)));
                  }
                }}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>End (deadline)</div>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => {
                  setPeriodEnd(e.target.value);
                  if (periodPreset !== "custom") setPeriodPreset("custom");
                }}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
