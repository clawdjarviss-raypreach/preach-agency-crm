"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

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

export type FeedbackFormChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

type InlineToken =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string };

function parseInline(s: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const idx = m.index;
    if (idx > last) {
      out.push({ kind: "text", text: s.slice(last, idx) });
    }
    const tok = m[0] ?? "";
    if (tok.startsWith("**") && tok.endsWith("**")) {
      out.push({ kind: "bold", text: tok.slice(2, -2) });
    } else if (tok.startsWith("*") && tok.endsWith("*")) {
      out.push({ kind: "italic", text: tok.slice(1, -1) });
    } else if (tok.startsWith("`") && tok.endsWith("`")) {
      out.push({ kind: "code", text: tok.slice(1, -1) });
    } else {
      out.push({ kind: "text", text: tok });
    }
    last = idx + tok.length;
  }
  if (last < s.length) out.push({ kind: "text", text: s.slice(last) });
  return out;
}

function renderInline(tokens: InlineToken[]) {
  return tokens.map((t, i) => {
    if (t.kind === "bold") {
      return (
        <strong key={i} style={{ fontWeight: 900 }}>
          {t.text}
        </strong>
      );
    }
    if (t.kind === "italic") {
      return (
        <em key={i} style={{ fontStyle: "italic" }}>
          {t.text}
        </em>
      );
    }
    if (t.kind === "code") {
      return (
        <code
          key={i}
          style={{
            padding: "2px 6px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            fontSize: 12,
          }}
        >
          {t.text}
        </code>
      );
    }
    return <span key={i}>{t.text}</span>;
  });
}

function renderMarkdownBasic(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const nodes: ReactNode[] = [];

  let listItems: React.ReactNode[] = [];
  const flushList = () => {
    if (!listItems.length) return;
    nodes.push(
      <ul key={`ul_${nodes.length}`} style={{ margin: "6px 0 10px 18px" }}>
        {listItems}
      </ul>
    );
    listItems = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const trimmed = line.trimEnd();

    const listMatch = trimmed.match(/^\s*[-*]\s+(.*)$/);
    if (listMatch) {
      const itemText = listMatch[1] ?? "";
      listItems.push(
        <li key={`li_${i}`} style={{ margin: "4px 0" }}>
          {renderInline(parseInline(itemText))}
        </li>
      );
      continue;
    }

    flushList();

    if (!trimmed.trim()) {
      nodes.push(<div key={`sp_${i}`} style={{ height: 8 }} />);
      continue;
    }

    const h3 = trimmed.match(/^###\s+(.*)$/);
    const h2 = trimmed.match(/^##\s+(.*)$/);
    const h1 = trimmed.match(/^#\s+(.*)$/);

    if (h3) {
      nodes.push(
        <div key={`h3_${i}`} style={{ fontWeight: 900, marginTop: 8 }}>
          {renderInline(parseInline(h3[1] ?? ""))}
        </div>
      );
      continue;
    }

    if (h2) {
      nodes.push(
        <div key={`h2_${i}`} style={{ fontWeight: 900, fontSize: 15, marginTop: 10 }}>
          {renderInline(parseInline(h2[1] ?? ""))}
        </div>
      );
      continue;
    }

    if (h1) {
      nodes.push(
        <div key={`h1_${i}`} style={{ fontWeight: 900, fontSize: 16, marginTop: 12 }}>
          {renderInline(parseInline(h1[1] ?? ""))}
        </div>
      );
      continue;
    }

    nodes.push(
      <div key={`p_${i}`} style={{ margin: "6px 0", lineHeight: 1.55, fontSize: 13 }}>
        {renderInline(parseInline(trimmed))}
      </div>
    );
  }

  flushList();
  return nodes;
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

function typeLabel(t: FeedbackType) {
  const map: Record<FeedbackType, string> = {
    praise: "🌟 Praise",
    constructive: "💬 Constructive",
    observation: "👁️ Observation",
    warning: "⚠️ Warning",
  };
  return map[t] ?? t;
}

function categoryLabel(c: FeedbackCategory) {
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

export default function FeedbackForm({
  token,
  chatters,
  defaultChatterId,
  onSaved,
  onCancel,
  initialType,
  initialVisibility,
  initialTitle,
  initialContent,
}: {
  token: string;
  chatters: FeedbackFormChatterOption[];
  defaultChatterId?: string;
  onSaved?: (feedbackId: string) => void;
  onCancel?: () => void;
  initialType?: FeedbackType;
  initialVisibility?: FeedbackVisibility;
  initialTitle?: string;
  initialContent?: string;
}) {
  const createFeedback = useMutation(api.crm.coaching.createFeedback);

  const chatterOptions = useMemo(() => {
    const onlyChatters = chatters.filter((c) => (c.role ? c.role === "chatter" : true));
    return onlyChatters.length ? onlyChatters : chatters;
  }, [chatters]);

  const [initialized, setInitialized] = useState(false);

  const [chatterId, setChatterId] = useState<string>(defaultChatterId ?? "");
  const [type, setType] = useState<FeedbackType>(initialType ?? "praise");
  const [visibility, setVisibility] = useState<FeedbackVisibility>(initialVisibility ?? "shared");
  const [category, setCategory] = useState<string>("");

  const [title, setTitle] = useState<string>(initialTitle ?? "");
  const [content, setContent] = useState<string>(initialContent ?? "");
  const [feedbackDate, setFeedbackDate] = useState<string>(toDateInputValue(Date.now()));

  // Optional context
  const [relatedMeetingId, setRelatedMeetingId] = useState<string>("");
  const [relatedLink, setRelatedLink] = useState<string>("");

  const [previewMode, setPreviewMode] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    if (initialized) return;
    if (!defaultChatterId) {
      const first = chatterOptions[0];
      if (first?.id) setChatterId(first.id);
    }
    setInitialized(true);
  }, [initialized, defaultChatterId, chatterOptions]);

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

    const body = content.trim();
    if (!body) {
      setError("Please write feedback content.");
      return;
    }

    const t = title.trim();

    const ts = fromDateInputValue(feedbackDate);

    let finalContent = body;
    if (relatedLink.trim()) {
      finalContent = `${finalContent}\n\nRelated: ${relatedLink.trim()}`;
    }

    setSaving(true);
    try {
      const feedbackId = await createFeedback({
        token,
        chatterId: chatterId as Id<"crm_chatters">,
        type,
        title: t ? t : undefined,
        content: finalContent,
        category: (category.trim() ? (category as FeedbackCategory) : undefined) as any,
        visibility,
        feedbackDate: ts,
        relatedMeetingId: relatedMeetingId.trim()
          ? (relatedMeetingId.trim() as Id<"crm_coaching_meetings">)
          : undefined,
      } as any);

      setSuccess("Feedback submitted.");
      onSaved?.(String(feedbackId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to submit feedback");
    } finally {
      setSaving(false);
    }
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
          <div style={{ fontWeight: 900, fontSize: 16 }}>Give Feedback</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            Praise, constructive notes, observations, or formal warnings.
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
            {saving ? "Submitting…" : "Submit Feedback"}
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
              disabled={saving}
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
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visibility</div>
            <select
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as FeedbackVisibility)}
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Type</div>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FeedbackType)}
              disabled={saving}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              {( ["praise", "constructive", "observation", "warning"] as FeedbackType[] ).map((t) => (
                <option key={t} value={t}>
                  {typeLabel(t)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Category (optional)</div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={saving}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="">—</option>
              {( [
                "response_quality",
                "response_speed",
                "fan_handling",
                "teamwork",
                "reliability",
                "earnings",
                "attitude",
                "other",
              ] as FeedbackCategory[] ).map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Date</div>
            <input
              type="date"
              value={feedbackDate}
              onChange={(e) => setFeedbackDate(e.target.value)}
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

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Subject</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={saving}
            placeholder="e.g. Excellent VIP handling this week"
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Feedback (Markdown supported)</div>
            <button
              type="button"
              onClick={() => setPreviewMode((v) => !v)}
              disabled={saving}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {previewMode ? "Edit" : "Preview"}
            </button>
          </div>

          {!previewMode ? (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              disabled={saving}
              rows={8}
              placeholder="Write feedback here…"
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                resize: "vertical",
              }}
            />
          ) : (
            <div
              style={{
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
              }}
            >
              {content.trim() ? (
                <div style={{ display: "grid", gap: 2 }}>{renderMarkdownBasic(content)}</div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nothing to preview.</div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Related meeting ID (optional)</div>
            <input
              value={relatedMeetingId}
              onChange={(e) => setRelatedMeetingId(e.target.value)}
              disabled={saving}
              placeholder="Paste meeting id (Convex Id)"
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Related goal/meeting link (optional)</div>
            <input
              value={relatedLink}
              onChange={(e) => setRelatedLink(e.target.value)}
              disabled={saving}
              placeholder="e.g. /coaching/goals/… or https://…"
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </label>
        </div>

        <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Tip: If visibility is “Shared”, the chatter will be able to acknowledge the feedback.
        </div>
      </div>
    </div>
  );
}
