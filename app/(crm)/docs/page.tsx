"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

const DOC_TYPES = [
  "spec",
  "research",
  "sop",
  "report",
  "deliverable",
  "code",
  "note",
] as const;

type DocType = (typeof DOC_TYPES)[number] | "all";

function formatDate(ts?: number) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function truncate(text: string, max = 200) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max).trimEnd() + "…";
}

export default function DocsPage() {
  const [typeFilter, setTypeFilter] = useState<DocType>("all");

  const docs = useQuery(api.documents.list, {
    type: typeFilter === "all" ? undefined : typeFilter,
  });

  const filtered = useMemo(() => {
    return docs ?? [];
  }, [docs]);

  return (
    <div style={{ maxWidth: "1200px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "20px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: 800, color: "var(--text)" }}>
            📚 Docs
          </h1>
          <p style={{ marginTop: "4px", fontSize: "14px", color: "var(--text-secondary)" }}>
            Specs, SOPs, research, and deliverables.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <label
            htmlFor="doc-type"
            style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}
          >
            Filter
          </label>
          <select
            id="doc-type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as DocType)}
            style={{
              padding: "10px 14px",
              fontSize: "13px",
              fontWeight: 700,
              border: typeFilter !== "all" ? "2px solid var(--accent)" : "2px solid var(--border)",
              borderRadius: "12px",
              cursor: "pointer",
              background:
                typeFilter !== "all" ? "rgba(196,149,106,0.10)" : "var(--surface)",
              color: typeFilter !== "all" ? "var(--accent)" : "var(--text-secondary)",
              outline: "none",
              appearance: "none",
            }}
          >
            <option value="all">All types</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!docs ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "22px",
            color: "var(--text-secondary)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          Loading documents…
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "48px 24px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "10px" }}>🗂️</div>
          <div style={{ fontSize: "15px", color: "var(--text-secondary)" }}>
            No documents found.
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "16px",
          }}
        >
          {filtered.map((doc) => (
            <Link
              key={doc._id}
              href={`/docs/${doc._id}`}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: "20px",
                padding: "18px 18px 16px",
                boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    padding: "4px 10px",
                    borderRadius: "999px",
                    background: "rgba(196,149,106,0.12)",
                    color: "var(--accent)",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.06em",
                  }}
                >
                  {String(doc.type).toUpperCase()}
                </div>
                <div style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-muted)" }}>
                  {formatDate(doc.createdAt)}
                </div>
              </div>

              <div
                style={{
                  marginTop: "10px",
                  fontSize: "16px",
                  fontWeight: 800,
                  color: "var(--text)",
                  lineHeight: 1.25,
                }}
              >
                {doc.title}
              </div>

              <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                by <span style={{ fontWeight: 700 }}>{doc.createdBy || "—"}</span>
              </div>

              <div
                style={{
                  marginTop: "12px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                }}
              >
                {truncate(doc.content, 200)}
              </div>

              {doc.tags?.length ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "14px" }}>
                  {doc.tags.slice(0, 6).map((tag) => (
                    <span
                      key={tag}
                      style={{
                        fontSize: "11px",
                        padding: "4px 8px",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                        background: "var(--bg)",
                        color: "var(--text-secondary)",
                        fontWeight: 600,
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              ) : null}

              <div
                style={{
                  marginTop: "14px",
                  paddingTop: "12px",
                  borderTop: "1px solid var(--border-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "var(--accent)",
                  fontWeight: 700,
                  fontSize: "13px",
                }}
              >
                <span>Open</span>
                <span aria-hidden>→</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <style>{`
        a:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 22px rgba(0,0,0,0.06);
        }
      `}</style>
    </div>
  );
}
