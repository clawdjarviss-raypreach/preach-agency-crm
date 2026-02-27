"use client";

import { useMemo, useState } from "react";

export type FeedbackType = "praise" | "constructive" | "observation" | "warning";
export type FeedbackVisibility = "private" | "shared" | "team";

export type FeedbackCategory =
  | "response_quality"
  | "response_speed"
  | "fan_handling"
  | "teamwork"
  | "reliability"
  | "earnings"
  | "attitude"
  | "other";

export type FeedbackCardFeedback = {
  id: string;
  chatterId: string;
  givenBy: string;
  type: FeedbackType;
  title?: string;
  content: string;
  category?: FeedbackCategory;
  relatedCreatorId?: string;
  relatedMeetingId?: string;
  visibility: FeedbackVisibility;
  acknowledged?: boolean;
  acknowledgedAt?: number;
  chatterResponse?: string;
  feedbackDate: number;
  createdAt?: number;
  updatedAt?: number;
};

export type FeedbackCardPerson = {
  id: string;
  name: string;
  avatarEmoji?: string;
  profilePictureUrl?: string;
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function typeIcon(t: FeedbackType) {
  if (t === "praise") return "🌟";
  if (t === "constructive") return "💬";
  if (t === "warning") return "⚠️";
  return "👁️";
}

function typeLabel(t: FeedbackType) {
  if (t === "praise") return "Praise";
  if (t === "constructive") return "Constructive";
  if (t === "warning") return "Warning";
  return "Observation";
}

function visibilityLabel(v: FeedbackVisibility) {
  if (v === "private") return "Private";
  if (v === "shared") return "Shared";
  return "Team";
}

function categoryLabel(c?: FeedbackCategory) {
  if (!c) return "";
  const map: Record<FeedbackCategory, string> = {
    response_quality: "Response Quality",
    response_speed: "Response Speed",
    fan_handling: "Fan Handling",
    teamwork: "Teamwork",
    reliability: "Reliability",
    earnings: "Earnings",
    attitude: "Attitude",
    other: "Other",
  };
  return map[c] ?? c;
}

export default function FeedbackCard({
  feedback,
  chatter,
  supervisor,
  defaultExpanded,
  onAcknowledge,
  acknowledging,
}: {
  feedback: FeedbackCardFeedback;
  chatter?: FeedbackCardPerson;
  supervisor?: FeedbackCardPerson;
  defaultExpanded?: boolean;
  onAcknowledge?: (args: { feedbackId: string }) => void;
  acknowledging?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(defaultExpanded));

  const preview = useMemo(() => {
    const s = (feedback.content ?? "").trim().replace(/\s+/g, " ");
    return s.length > 180 ? s.slice(0, 180) + "…" : s;
  }, [feedback.content]);

  const title = (feedback.title ?? "").trim();
  const subtitle = title || preview;

  const needsAck = feedback.visibility !== "private";
  const isPendingAck = needsAck && feedback.acknowledged === false;

  const typeStyle =
    feedback.type === "praise"
      ? { color: "var(--green)", background: "var(--green-bg)" }
      : feedback.type === "warning"
        ? { color: "var(--red)", background: "var(--red-bg)" }
        : feedback.type === "constructive"
          ? { color: "var(--accent)", background: "rgba(196,149,106,0.12)" }
          : { color: "var(--text-secondary)", background: "var(--bg)" };

  const cardBorder = isPendingAck ? "1px solid rgba(255,170,0,0.55)" : "1px solid var(--border)";
  const cardBg = isPendingAck ? "rgba(255,170,0,0.08)" : "var(--surface)";

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        border: cardBorder,
        background: cardBg,
        cursor: "pointer",
      }}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((v) => !v)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setExpanded((v) => !v);
        }
      }}
      aria-expanded={expanded}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
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
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                    ...typeStyle,
                  }}
                >
                  {typeIcon(feedback.type)} {typeLabel(feedback.type)}
                </span>

                <span style={{ fontWeight: 900, overflow: "hidden", textOverflow: "ellipsis" }}>
                  {chatter?.name ?? feedback.chatterId}
                </span>

                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {formatDate(feedback.feedbackDate)}
                </span>
              </div>

              {subtitle ? (
                <div
                  style={{
                    marginTop: 8,
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    lineHeight: 1.45,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={title ? title : undefined}
                >
                  {subtitle}
                </div>
              ) : null}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: 12,
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                }}
                title={`Visibility: ${feedback.visibility}`}
              >
                {visibilityLabel(feedback.visibility)}
              </span>

              {needsAck ? (
                <span
                  style={{
                    fontSize: 12,
                    padding: "4px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                    color:
                      feedback.acknowledged === true
                        ? "var(--green)"
                        : feedback.acknowledged === false
                          ? "var(--orange)"
                          : "var(--text-secondary)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {feedback.acknowledged === true
                    ? "✅ Acknowledged"
                    : feedback.acknowledged === false
                      ? "⏳ Pending"
                      : "—"}
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {feedback.category ? (
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
                {categoryLabel(feedback.category)}
              </span>
            ) : null}

            {supervisor?.name ? (
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
                Given by: {supervisor.name}
              </span>
            ) : null}

            {feedback.relatedMeetingId ? (
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
                Related meeting: {feedback.relatedMeetingId}
              </span>
            ) : null}
          </div>

          {expanded ? (
            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {title ? (
                <div style={{ fontWeight: 900, fontSize: 15 }}>{title}</div>
              ) : null}

              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}
              >
                {feedback.content}
              </div>

              {feedback.chatterResponse ? (
                <div
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--bg)",
                  }}
                >
                  <div style={{ fontWeight: 900, fontSize: 12, color: "var(--text-secondary)" }}>
                    Chatter response
                  </div>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap", fontSize: 13 }}>
                    {feedback.chatterResponse}
                  </div>
                </div>
              ) : null}

              {onAcknowledge && isPendingAck ? (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAcknowledge({ feedbackId: feedback.id });
                    }}
                    disabled={acknowledging}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: acknowledging ? "var(--bg)" : "var(--accent)",
                      color: acknowledging ? "var(--text-muted)" : "white",
                      cursor: acknowledging ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {acknowledging ? "Acknowledging…" : "Acknowledge"}
                  </button>
                </div>
              ) : null}

              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                Click to {expanded ? "collapse" : "expand"}.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
