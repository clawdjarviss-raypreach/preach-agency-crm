"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type FanSegmentUI = "vip" | "whale" | "core" | "casual" | "new";
type MessageTypeUI = "dm" | "tip" | "ppv_unlock" | "subscription" | "custom_request";

type CreatorListItem = {
  id: Id<"crm_creators">;
  name: string;
  onlyFansHandle?: string;
};

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

  return { fanUsername: trimmed.startsWith("@") ? trimmed.slice(1) : trimmed };
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

export default function QueueLogPage() {
  const [token, setToken] = useState<string>("");
  const [assignedCreatorIds, setAssignedCreatorIds] = useState<string[]>([]);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    setToken(t);
    const u = localStorage.getItem("crm_user");
    if (u) {
      try {
        const parsed = JSON.parse(u) as { assignedCreators?: string[] };
        setAssignedCreatorIds(parsed.assignedCreators ?? []);
      } catch {
        setAssignedCreatorIds([]);
      }
    }
  }, []);

  const creatorsRaw = useQuery(
    api.crm.creators.list,
    token ? { token, includeArchived: false } : "skip"
  );

  const creators = useMemo<CreatorListItem[]>(() => {
    const list = (creatorsRaw ?? []) as CreatorListItem[];
    if (!assignedCreatorIds || assignedCreatorIds.length === 0) return list;
    const allowed = new Set(assignedCreatorIds);
    const filtered = list.filter((c) => allowed.has(String(c.id)));
    return filtered.length > 0 ? filtered : list;
  }, [creatorsRaw, assignedCreatorIds]);

  const logMessage = useMutation(api.crm.queue.logMessage);
  const markResponded = useMutation(api.crm.queue.markResponded);

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

  useEffect(() => {
    if (!token) return;
    // Default creator selection
    if (creatorId) return;
    if (assignedCreatorIds.length === 1) {
      setCreatorId(assignedCreatorIds[0] as Id<"crm_creators">);
      return;
    }
    if (creators.length === 1) {
      setCreatorId(creators[0].id);
    }
  }, [token, creatorId, assignedCreatorIds, creators]);

  useEffect(() => {
    const t = setTimeout(() => fanInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const resetForNext = useCallback(() => {
    setFanIdentifier("");
    setNotes("");
    setTimeout(() => fanInputRef.current?.focus(), 0);
  }, []);

  const handleSubmit = useCallback(
    async (opts: { markAsResponded: boolean }) => {
      if (submitting) return;
      if (!token) return;

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

        if (opts.markAsResponded) {
          await markResponded({
            token,
            queueId: res.queueId as Id<"crm_message_queue">,
            notes: notes.trim() || undefined,
          });
        }

        setToast({
          message: opts.markAsResponded ? "Logged + responded" : "Logged",
          kind: "success",
        });
        resetForNext();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to log message";
        setToast({ message, kind: "error" });
      } finally {
        setSubmitting(false);
      }
    },
    [
      submitting,
      token,
      fanIdentifier,
      creatorId,
      fanSegment,
      messageType,
      notes,
      logMessage,
      markResponded,
      resetForNext,
    ]
  );

  // Keyboard: N resets, Enter submits.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") return;
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        resetForNext();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const active = document.activeElement;
        if (active && active.tagName.toLowerCase() === "textarea") return;
        e.preventDefault();
        void handleSubmit({ markAsResponded: false });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSubmit, resetForNext]);

  const segmentOptions: FanSegmentUI[] = ["vip", "whale", "core", "casual", "new"];
  const typeOptions: MessageTypeUI[] = [
    "dm",
    "tip",
    "ppv_unlock",
    "subscription",
    "custom_request",
  ];

  if (!token) {
    return (
      <div style={{ padding: 24, color: "var(--text-muted)" }}>Loading…</div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: "var(--text)" }}>
            🧾 Bulk Message Logging
          </h1>
          <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-muted)" }}>
            Keyboard: <b>N</b> new • <b>Enter</b> submit
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Link
            href="/dashboard"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              fontWeight: 800,
            }}
          >
            ← Back
          </Link>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit({ markAsResponded: false });
          }}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Creator</label>
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

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 800 }}>Fan (username or name)</label>
              <input
                ref={fanInputRef}
                value={fanIdentifier}
                onChange={(e) => setFanIdentifier(e.target.value)}
                placeholder="@username"
                disabled={submitting}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                }}
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Message type</div>
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
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {labelForMessageType(t)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 800 }}>Fan segment</div>
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
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {labelForSegment(s)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 800 }}>Note (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Optional context…"
              disabled={submitting}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                resize: "vertical",
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={() => resetForNext()}
              disabled={submitting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Reset
            </button>

            <button
              type="submit"
              disabled={submitting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--accent)",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              {submitting ? "Logging…" : "Log & Continue"}
            </button>

            <button
              type="button"
              onClick={() => void handleSubmit({ markAsResponded: true })}
              disabled={submitting}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "#111827",
                color: "white",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Log + Responded
            </button>
          </div>
        </form>
      </div>

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
            fontWeight: 900,
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
