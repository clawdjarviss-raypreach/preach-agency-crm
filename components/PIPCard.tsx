"use client";

import Link from "next/link";

export type PipStatus =
  | "draft"
  | "active"
  | "completed"
  | "extended"
  | "failed"
  | "cancelled";

export type PipMilestone = {
  id: string;
  title: string;
  dueDate: number;
  status: "pending" | "met" | "missed" | "extended";
  notes?: string;
};

export type PIPCardPip = {
  id: string;
  chatterId: string;
  title: string;
  status: PipStatus;
  endDate: number;
  milestones: PipMilestone[];
};

export type PIPCardChatter = {
  id: string;
  name: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
};

function daysRemaining(endDate: number) {
  const days = Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24));
  return days;
}

function statusBadge(status: PipStatus) {
  if (status === "completed") return { label: "Completed", color: "var(--green)", bg: "var(--green-bg)" };
  if (status === "failed") return { label: "Failed", color: "var(--red)", bg: "var(--red-bg)" };
  if (status === "cancelled")
    return { label: "Cancelled", color: "var(--text-secondary)", bg: "var(--bg)" };
  if (status === "extended")
    return { label: "Extended", color: "var(--orange)", bg: "rgba(245,158,11,0.10)" };
  if (status === "draft")
    return { label: "Draft", color: "var(--text-secondary)", bg: "var(--bg)" };
  return { label: "Active", color: "var(--accent)", bg: "rgba(196,149,106,0.12)" };
}

export default function PIPCard({
  pip,
  chatter,
}: {
  pip: PIPCardPip;
  chatter?: PIPCardChatter;
}) {
  const met = pip.milestones.filter((m) => m.status === "met").length;
  const total = pip.milestones.length;
  const badge = statusBadge(pip.status);

  const remaining = daysRemaining(pip.endDate);
  const remainingLabel =
    remaining < 0
      ? `Ended ${Math.abs(remaining)}d ago`
      : remaining === 0
        ? "Ends today"
        : `${remaining}d left`;

  return (
    <Link
      href={`/coaching/pips/${encodeURIComponent(pip.id)}`}
      style={{
        display: "block",
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {chatter?.avatarEmoji ? `${chatter.avatarEmoji} ` : ""}
            {chatter?.name ?? pip.chatterId}
          </div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {pip.title}
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: badge.bg,
                color: badge.color,
                fontWeight: 800,
              }}
            >
              {badge.label}
            </span>

            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-secondary)",
              }}
              title={`${met}/${total} milestones met`}
            >
              Milestones: {met}/{total}
            </span>

            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: remaining < 3 && remaining >= 0 ? "var(--orange)" : "var(--text-secondary)",
                fontWeight: remaining < 3 && remaining >= 0 ? 900 : 700,
              }}
            >
              ⏳ {remainingLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
