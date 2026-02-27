"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";

export type QueueNotificationKind = "info" | "warning" | "critical";

export type QueueNotificationToastItem = {
  id: string;
  kind: QueueNotificationKind;
  title: string;
  message?: string;
  href?: string;
  createdAt: number;
  /** Defaults: info/warning 5s, critical 12s */
  durationMs?: number;
  /** If true, disables auto-dismiss for this toast */
  sticky?: boolean;
};

function kindStyles(kind: QueueNotificationKind): {
  border: string;
  background: string;
  titleColor: string;
  badgeBg: string;
  badgeText: string;
} {
  switch (kind) {
    case "critical":
      return {
        border: "1px solid rgba(239, 68, 68, 0.35)",
        background: "rgba(239, 68, 68, 0.10)",
        titleColor: "#7f1d1d",
        badgeBg: "rgba(239, 68, 68, 0.18)",
        badgeText: "#991b1b",
      };
    case "warning":
      return {
        border: "1px solid rgba(245, 158, 11, 0.35)",
        background: "rgba(245, 158, 11, 0.10)",
        titleColor: "#7c2d12",
        badgeBg: "rgba(245, 158, 11, 0.18)",
        badgeText: "#92400e",
      };
    case "info":
    default:
      return {
        border: "1px solid rgba(59, 130, 246, 0.35)",
        background: "rgba(59, 130, 246, 0.10)",
        titleColor: "#1e3a8a",
        badgeBg: "rgba(59, 130, 246, 0.18)",
        badgeText: "#1d4ed8",
      };
  }
}

function defaultDurationMs(kind: QueueNotificationKind): number {
  // Spec: auto-dismiss after 5s; critical stays longer.
  if (kind === "critical") return 12_000;
  return 5_000;
}

export default function QueueNotificationToastHost({
  toasts,
  onDismiss,
  maxVisible = 3,
}: {
  toasts: QueueNotificationToastItem[];
  onDismiss: (id: string) => void;
  maxVisible?: number;
}) {
  const router = useRouter();

  // Keep the most recent toasts (by createdAt).
  const visible = useMemo(() => {
    const sorted = [...toasts].sort((a, b) => b.createdAt - a.createdAt);
    return sorted.slice(0, Math.max(1, maxVisible));
  }, [maxVisible, toasts]);

  const timersRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    // Add timers for any toast that doesn't already have one.
    for (const toast of visible) {
      if (toast.sticky) continue;
      if (timersRef.current.has(toast.id)) continue;

      const ms = toast.durationMs ?? defaultDurationMs(toast.kind);
      const t = window.setTimeout(() => {
        timersRef.current.delete(toast.id);
        onDismiss(toast.id);
      }, ms);
      timersRef.current.set(toast.id, t);
    }

    // Clean up timers for toasts that are no longer visible/present.
    const ids = new Set(toasts.map((t) => t.id));
    for (const [id, timer] of timersRef.current.entries()) {
      if (!ids.has(id)) {
        window.clearTimeout(timer);
        timersRef.current.delete(id);
      }
    }

    return () => {
      // no-op: timers cleaned on next run/unmount below
    };
  }, [onDismiss, toasts, visible]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  if (visible.length === 0) return null;

  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        top: 16,
        right: 16,
        zIndex: 10050,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        width: "min(420px, calc(100vw - 32px))",
      }}
    >
      {visible.map((toast) => {
        const s = kindStyles(toast.kind);
        const clickable = !!toast.href;

        return (
          <div
            key={toast.id}
            role="status"
            onClick={() => {
              if (!toast.href) return;
              router.push(toast.href);
              onDismiss(toast.id);
            }}
            style={{
              border: s.border,
              background: s.background,
              borderRadius: 16,
              padding: 12,
              boxShadow: "0 14px 40px rgba(0,0,0,0.18)",
              cursor: clickable ? "pointer" : "default",
              userSelect: "none",
              backdropFilter: "blur(10px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: s.badgeBg,
                      color: s.badgeText,
                      fontSize: 11,
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: 0.4,
                    }}
                  >
                    {toast.kind}
                  </span>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 950,
                      color: "var(--text)",
                      lineHeight: 1.2,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      maxWidth: 320,
                    }}
                    title={toast.title}
                  >
                    {toast.title}
                  </div>
                </div>

                {toast.message ? (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 13,
                      color: "var(--text-secondary)",
                      lineHeight: 1.35,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical" as const,
                      WebkitLineClamp: 2,
                    }}
                  >
                    {toast.message}
                  </div>
                ) : null}

                {toast.href ? (
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: s.titleColor }}>
                    Click to view
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(toast.id);
                }}
                style={{
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.7)",
                  borderRadius: 10,
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  color: "var(--text)",
                  fontWeight: 900,
                }}
                aria-label="Dismiss notification"
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
