"use client";

import React, { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import QuickLogModal from "./QuickLogModal";

function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  const html = el as HTMLElement;
  return html.isContentEditable;
}

function getCreatorIdFromRoute(pathname: string, creatorIdFromQuery: string | null): string | undefined {
  if (creatorIdFromQuery) return creatorIdFromQuery;
  // Best-effort: /creators/<id> or /creator/<id>
  const m = pathname.match(/^\/(creators|creator)\/([^/]+)(?:\/|$)/);
  return m ? m[2] : undefined;
}

export default function QuickLogButton({
  token,
  role,
  assignedCreatorIds,
}: {
  token: string;
  role: string;
  assignedCreatorIds: string[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);

  const defaultCreatorId = useMemo(() => {
    const q = searchParams?.get("creatorId") ?? null;
    return getCreatorIdFromRoute(pathname ?? "", q);
  }, [pathname, searchParams]);

  // Show only on chatter-facing pages.
  const enabled = role === "chatter" || role === "supervisor";

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (open) return;
      if ((e.key === "n" || e.key === "N") && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditableElement(document.activeElement)) return;
        e.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled, open]);

  if (!enabled) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed",
          right: 20,
          bottom: 20,
          zIndex: 9990,
          background: "var(--accent)",
          color: "white",
          border: "1px solid rgba(0,0,0,0.05)",
          borderRadius: 999,
          padding: "12px 14px",
          fontWeight: 900,
          cursor: "pointer",
          boxShadow: "0 12px 30px rgba(0,0,0,0.18)",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
        aria-label="Quick log message (N)"
      >
        <span
          aria-hidden
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "rgba(255,255,255,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
          }}
        >
          ＋
        </span>
        <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <span style={{ lineHeight: 1.05 }}>Quick Log</span>
          <span style={{ fontSize: 12, opacity: 0.9, fontWeight: 800, lineHeight: 1.05 }}>
            Press N
          </span>
        </span>
      </button>

      <QuickLogModal
        open={open}
        token={token}
        assignedCreatorIds={assignedCreatorIds}
        defaultCreatorId={defaultCreatorId}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
