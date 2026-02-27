"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <div style={{ maxWidth: "1100px" }}>
      <div style={{ marginBottom: "16px" }}>
        <Link
          href="/docs"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "10px",
            padding: "10px 14px",
            borderRadius: "14px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
            fontWeight: 800,
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          ← Back to Docs
        </Link>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "22px",
          padding: "28px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontSize: "42px", marginBottom: "10px" }}>⚠️</div>
        <div style={{ fontSize: "18px", fontWeight: 900, color: "var(--text)" }}>
          Something went wrong
        </div>
        <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
          {error.message || "Failed to load this document."}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "18px", flexWrap: "wrap" }}>
          <button
            onClick={() => reset()}
            style={{
              padding: "10px 14px",
              borderRadius: "14px",
              background: "var(--accent)",
              border: "none",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <Link
            href="/docs"
            style={{
              padding: "10px 14px",
              borderRadius: "14px",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              fontWeight: 900,
            }}
          >
            Go to Docs list
          </Link>
        </div>
      </div>
    </div>
  );
}
