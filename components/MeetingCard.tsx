"use client";

import Link from "next/link";

type Assignee = "chatter" | "supervisor";

export type MeetingActionItem = {
  id: string;
  item: string;
  assignee: Assignee;
  dueDate?: number;
  completed: boolean;
  completedAt?: number;
};

export type MeetingCardChatter = {
  id: string;
  name: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
};

export type MeetingCardMeeting = {
  id: string;
  chatterId: string;
  meetingDate: number;
  meetingType: string;
  duration?: number;
  location?: string;
  agenda?: string;
  notes?: string;
  actionItems?: MeetingActionItem[];
  followUpCompleted?: boolean;
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

function meetingTypeLabel(t: string) {
  const map: Record<string, string> = {
    one_on_one: "1:1",
    performance_review: "Performance Review",
    pip_checkin: "PIP Check-in",
    onboarding: "Onboarding",
    exit_interview: "Exit Interview",
  };
  return map[t] ?? t;
}

export default function MeetingCard({
  meeting,
  chatter,
  compact,
}: {
  meeting: MeetingCardMeeting;
  chatter?: MeetingCardChatter;
  compact?: boolean;
}) {
  const items = meeting.actionItems ?? [];
  const pending = items.filter((a) => !a.completed).length;

  const status = meeting.followUpCompleted ? "completed" : "scheduled";
  const statusStyle =
    status === "completed"
      ? { color: "var(--green)", background: "var(--green-bg)" }
      : { color: "var(--accent)", background: "rgba(196,149,106,0.12)" };

  const notesPreview = (meeting.notes ?? "").trim().slice(0, 140);

  return (
    <Link
      href={`/coaching/meetings/${meeting.id}`}
      style={{
        display: "block",
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
            <span style={{ fontSize: 18 }}>{chatter?.avatarEmoji ?? "👤"}</span>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis" }}>
                {chatter?.name ?? meeting.chatterId}
              </div>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {formatDateTime(meeting.meetingDate)}
                {meeting.duration ? ` • ${meeting.duration}m` : ""}
                {meeting.location ? ` • ${meeting.location}` : ""}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  ...statusStyle,
                  border: "1px solid var(--border)",
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                }}
              >
                {status}
              </span>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text-secondary)",
              }}
            >
              {meetingTypeLabel(meeting.meetingType)}
            </span>
            <span
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: pending > 0 ? "var(--orange)" : "var(--text-secondary)",
              }}
              title={pending > 0 ? `${pending} pending` : "No pending action items"}
            >
              Action items: {pending}/{items.length}
            </span>
          </div>

          {!compact && notesPreview ? (
            <div
              style={{
                marginTop: 10,
                fontSize: 13,
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              {notesPreview}
              {meeting.notes && meeting.notes.trim().length > notesPreview.length ? "…" : ""}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
