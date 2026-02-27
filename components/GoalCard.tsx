"use client";

import Link from "next/link";

export type GoalStatus = "active" | "achieved" | "missed" | "cancelled";

export type GoalCardChatter = {
  id: string;
  name: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
};

export type GoalCheckIn = {
  date: number;
  value?: number;
  note: string;
  recordedBy: string;
};

export type GoalCardGoal = {
  id: string;
  chatterId: string;
  title: string;
  description?: string;
  metric?: string;
  targetValue?: number;
  currentValue?: number;
  startValue?: number;
  unit?: string;
  periodStart: number;
  periodEnd: number;
  status: GoalStatus;
  achievedAt?: number;
  progressPercent?: number;
  checkIns?: GoalCheckIn[];
};

function formatShortDate(ts: number) {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function clampPercent(p: number) {
  if (!Number.isFinite(p)) return 0;
  return Math.max(0, Math.min(100, Math.round(p)));
}

function computeProgressPercent(goal: GoalCardGoal): number | undefined {
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

function isExpired(goal: GoalCardGoal, now: number) {
  return goal.status === "active" && goal.periodEnd < now;
}

function uiStatus(goal: GoalCardGoal, now: number): "active" | "completed" | "expired" {
  if (goal.status === "achieved" || goal.status === "cancelled") return "completed";
  if (goal.status === "missed") return "expired";
  if (isExpired(goal, now)) return "expired";
  return "active";
}

function statusStyles(s: "active" | "completed" | "expired") {
  if (s === "completed") {
    return { color: "var(--green)", background: "var(--green-bg)" };
  }
  if (s === "expired") {
    return { color: "var(--red)", background: "var(--red-bg)" };
  }
  return { color: "var(--accent)", background: "rgba(196,149,106,0.12)" };
}

function deadlineLabel(goal: GoalCardGoal, now: number) {
  const days = Math.ceil((goal.periodEnd - now) / (24 * 60 * 60 * 1000));
  if (days > 1) return `Due: ${formatShortDate(goal.periodEnd)} (${days} days)`;
  if (days === 1) return `Due: ${formatShortDate(goal.periodEnd)} (1 day)`;
  if (days === 0) return `Due: ${formatShortDate(goal.periodEnd)} (today)`;
  const overdue = Math.abs(days);
  return `Due: ${formatShortDate(goal.periodEnd)} (overdue ${overdue} day${overdue === 1 ? "" : "s"})`;
}

export default function GoalCard({
  goal,
  chatter,
  compact,
}: {
  goal: GoalCardGoal;
  chatter?: GoalCardChatter;
  compact?: boolean;
}) {
  const now = Date.now();
  const percent = computeProgressPercent(goal);
  const status = uiStatus(goal, now);
  const badgeStyle = statusStyles(status);

  const desc = (goal.description ?? "").trim();
  const preview = desc ? desc.replace(/\s+/g, " ").slice(0, 140) : "";

  const valueLine =
    goal.currentValue !== undefined && goal.targetValue !== undefined
      ? `${goal.currentValue}${goal.unit ? ` ${goal.unit}` : ""} / ${goal.targetValue}${goal.unit ? ` ${goal.unit}` : ""}`
      : undefined;

  return (
    <Link
      href={`/coaching/goals/${goal.id}`}
      style={{
        display: "block",
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flex: "0 0 auto",
          }}
          aria-label={chatter?.name ? `Chatter: ${chatter.name}` : "Chatter"}
        >
          {chatter?.profilePictureUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={chatter.profilePictureUrl}
              alt={chatter.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <span style={{ fontSize: 18 }}>{chatter?.avatarEmoji ?? "🎯"}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 900,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={goal.title}
              >
                {goal.title}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2 }}>
                {chatter?.name ? `👤 ${chatter.name}` : `Chatter: ${goal.chatterId}`}
              </div>
            </div>

            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                textTransform: "capitalize",
                whiteSpace: "nowrap",
                ...badgeStyle,
              }}
            >
              {status}
            </span>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {percent !== undefined ? `Progress: ${percent}%` : "Progress: —"}
                {valueLine ? ` • ${valueLine}` : ""}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                {deadlineLabel(goal, now)}
              </div>
            </div>

            <div
              aria-label="Progress bar"
              style={{
                marginTop: 8,
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
                    status === "completed"
                      ? "var(--green)"
                      : status === "expired"
                        ? "var(--red)"
                        : "var(--accent)",
                }}
              />
            </div>
          </div>

          {!compact && preview ? (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.45 }}>
              {preview}
              {desc.length > preview.length ? "…" : ""}
            </div>
          ) : null}

          {!compact ? (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
              Period: {formatShortDate(goal.periodStart)} → {formatShortDate(goal.periodEnd)}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
