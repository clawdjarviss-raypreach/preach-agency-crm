"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type FanSegmentUI = "vip" | "whale" | "core" | "casual" | "new";
type MessageTypeUI = "dm" | "tip" | "ppv_unlock" | "subscription" | "custom_request";

type CreatorListItem = {
  id: Id<"crm_creators">;
  name: string;
  onlyFansHandle?: string;
  status?: string;
};

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  const html = el as HTMLElement;
  return html.isContentEditable;
}

function parseFanIdentifier(input: string): {
  fanUsername: string;
  fanDisplayName?: string;
} {
  const trimmed = input.trim();
  if (!trimmed) return { fanUsername: "" };

  const atMatch = trimmed.match(/@([A-Za-z0-9_\.]+)/);
  if (atMatch) {
    const fanUsername = atMatch[1];
    const display = trimmed
      .replace(atMatch[0], "")
      .replace(/[()]/g, "")
      .trim();
    return { fanUsername, fanDisplayName: display || undefined };
  }

  // Fall back to treating the whole input as a username-like identifier.
  const fanUsername = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;
  return { fanUsername };
}

function labelForMessageType(t: MessageTypeUI): string {
  switch (t) {
    case "dm":
      return "DM";
    case "tip":
      return "Tip";
    case "ppv_unlock":
      return "PPV";
    case "subscription":
      return "Subscription";
    case "custom_request":
      return "Custom Request";
    default:
      return t;
  }
}

function labelForSegment(s: FanSegmentUI): string {
  switch (s) {
    case "vip":
      return "VIP";
    case "whale":
      return "Whale";
    case "core":
      return "Core";
    case "casual":
      return "Casual";
    case "new":
      return "New";
    default:
      return s;
  }
}

export default function QuickLogModal({
  open,
  token,
  assignedCreatorIds,
  defaultCreatorId,
  onClose,
}: {
  open: boolean;
  token: string;
  assignedCreatorIds: string[];
  defaultCreatorId?: string;
  onClose: () => void;
}) {
  const creatorsRaw = useQuery(
    api.crm.creators.list,
    open && token ? { token, includeArchived: false } : "skip"
  );
  const logMessage = useMutation(api.crm.queue.logMessage);
  const markResponded = useMutation(api.crm.queue.markResponded);

  const creators = useMemo<CreatorListItem[]>(() => {
    const list = (creatorsRaw ?? []) as CreatorListItem[];
    if (!assignedCreatorIds || assignedCreatorIds.length === 0) return list;
    const allowed = new Set(assignedCreatorIds);
    const filtered = list.filter((c) => allowed.has(String(c.id)));
    return filtered.length > 0 ? filtered : list;
  }, [creatorsRaw, assignedCreatorIds]);

  const [creatorId, setCreatorId] = useState<Id<"crm_creators"> | "">("");
  const [fanIdentifier, setFanIdentifier] = useState<string>("");
  const [fanSegment, setFanSegment] = useState<FanSegmentUI>("new");
  const [messageType, setMessageType] = useState<MessageTypeUI>("dm");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(
    null
  );

  const fanInputRef = useRef<HTMLInputElement | null>(null);

  const closeAndReset = useCallback(() => {
    setSubmitting(false);
    setToast(null);
    setFanIdentifier("");
    setNotes("");
    setFanSegment("new");
    setMessageType("dm");
    onClose();
  }, [onClose]);

  const resetForNext = useCallback(() => {
    setFanIdentifier("");
    setNotes("");
    // Keep creator + segment + type for rapid logging.
    setTimeout(() => {
      fanInputRef.current?.focus();
    }, 0);
  }, []);

  // Default creator selection
  useEffect(() => {
    if (!open) return;
    if (creatorId) return;

    const validIds = new Set(creators.map((c) => String(c.id)));

    if (defaultCreatorId && validIds.has(defaultCreatorId)) {
      setCreatorId(defaultCreatorId as Id<"crm_creators">);
      return;
    }

    if (assignedCreatorIds.length === 1 && validIds.has(assignedCreatorIds[0])) {
      setCreatorId(assignedCreatorIds[0] as Id<"crm_creators">);
      return;
    }

    if (creators.length === 1) {
      setCreatorId(creators[0].id);
    }
  }, [open, creatorId, creators, defaultCreatorId, assignedCreatorIds]);

  // Autofocus fan identifier
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => fanInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  // Keyboard shortcuts while modal open
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeAndReset();
        return;
      }

      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Start a new log (reset fields) even if already open.
        if (isEditableElement(document.activeElement)) return;
        e.preventDefault();
        resetForNext();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Avoid submitting while typing in textarea.
        const active = document.activeElement;
        if (active && active.tagName.toLowerCase() === "textarea") return;
        e.preventDefault();
        void handleSubmit({ markAsResponded: false, keepOpen: true });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeAndReset, resetForNext]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = useCallback(
    async ({ markAsResponded, keepOpen }: { markAsResponded: boolean; keepOpen: boolean }) => {
      if (submitting) return;

      const parsed = parseFanIdentifier(fanIdentifier);
      const safeCreatorId = creatorId ? creatorId : undefined;

      if (!safeCreatorId) {
        setToast({ message: "Pick a creator", kind: "error" });
        return;
      }
      if (!parsed.fanUsername) {
        setToast({ message: "Enter a fan username/name", kind: "error" });
        return;
      }

      setSubmitting(true);
      setToast(null);

      try {
        const res = await logMessage({
          token,
          creatorId: safeCreatorId,
          fanUsername: parsed.fanUsername,
          fanDisplayName: parsed.fanDisplayName,
          fanSegment,
          messageType,
          notes: notes.trim() || undefined,
          source: "manual",
        });

        if (markAsResponded) {
          await markResponded({
            token,
            queueId: res.queueId as Id<"crm_message_queue">,
            notes: notes.trim() || undefined,
          });
        }

        setToast({
          message: markAsResponded ? "Logged + responded" : "Logged",
          kind: "success",
        });

        if (keepOpen) {
          resetForNext();
        } else {
          closeAndReset();
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to log message";
        setToast({ message, kind: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      fanIdentifier,
      creatorId,
      token,
      fanSegment,
      messageType,
      notes,
      logMessage,
      markResponded,
      resetForNext,
      closeAndReset,
    ]
  );

  const segmentOptions: FanSegmentUI[] = ["vip", "whale", "core", "casual", "new"];
  const typeOptions: MessageTypeUI[] = [
    "dm",
    "tip",
    "ppv_unlock",
    "subscription",
    "custom_request",
  ];

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) closeAndReset();
        }}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 9998,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick log message"
          style={{
            width: "100%",
            maxWidth: 560,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "16px 16px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text)" }}>
                📩 Log New Message
              </div>
              <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-muted)" }}>
                Shortcuts: <b>N</b> new • <b>Enter</b> submit • <b>Esc</b> close
              </div>
            </div>
            <button
              onClick={closeAndReset}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                borderRadius: 10,
                padding: "8px 10px",
                cursor: "pointer",
                color: "var(--text)",
              }}
            >
              ✕
            </button>
          </div>

          {/* Body */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit({ markAsResponded: false, keepOpen: true });
            }}
            style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}
          >
            {/* Creator */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                Creator
              </label>
              <select
                value={creatorId}
                onChange={(e) => setCreatorId(e.target.value as Id<"crm_creators">)}
                disabled={submitting || creators.length <= 1}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              >
                <option value="">Select creator…</option>
                {creators.map((c) => (
                  <option key={String(c.id)} value={c.id}>
                    {c.name}
                    {c.onlyFansHandle ? ` (@${c.onlyFansHandle})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Fan */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                Fan (username or name)
              </label>
              <input
                ref={fanInputRef}
                value={fanIdentifier}
                onChange={(e) => setFanIdentifier(e.target.value)}
                placeholder="@username or Jane Doe (@username)"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
            </div>

            {/* Message type */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                Message type
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {typeOptions.map((t) => {
                  const selected = messageType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setMessageType(t)}
                      disabled={submitting}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: selected ? "var(--accent)" : "var(--surface)",
                        color: selected ? "white" : "var(--text)",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {labelForMessageType(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Segment */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                Fan segment
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {segmentOptions.map((s) => {
                  const selected = fanSegment === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFanSegment(s)}
                      disabled={submitting}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 999,
                        border: "1px solid var(--border)",
                        background: selected ? "#111827" : "var(--surface)",
                        color: selected ? "white" : "var(--text)",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {labelForSegment(s)}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                Note (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context…"
                disabled={submitting}
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  color: "var(--text)",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Actions */}
            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "space-between",
                alignItems: "center",
                paddingTop: 4,
              }}
            >
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button
                  type="button"
                  onClick={closeAndReset}
                  disabled={submitting}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    cursor: "pointer",
                    fontWeight: 700,
                    color: "var(--text)",
                  }}
                >
                  Cancel
                </button>

                <Link
                  href="/queue/log"
                  style={{
                    fontSize: 13,
                    color: "var(--text-secondary)",
                    textDecoration: "underline",
                  }}
                >
                  Open full page
                </Link>
              </div>

              <div style={{ display: "flex", gap: 10 }}>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "var(--accent)",
                    cursor: "pointer",
                    fontWeight: 800,
                    color: "white",
                  }}
                >
                  {submitting ? "Logging…" : "Log & Continue"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleSubmit({ markAsResponded: true, keepOpen: true })}
                  disabled={submitting}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "#111827",
                    cursor: "pointer",
                    fontWeight: 800,
                    color: "white",
                  }}
                >
                  Log + Responded
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            top: 16,
            right: 16,
            zIndex: 10050,
            background: toast.kind === "success" ? "#16a34a" : "#dc2626",
            color: "white",
            padding: "10px 12px",
            borderRadius: 12,
            fontWeight: 800,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            maxWidth: 320,
          }}
        >
          {toast.message}
        </div>
      )}
    </>
  );
}
