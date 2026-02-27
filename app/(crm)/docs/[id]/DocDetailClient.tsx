"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function formatDate(ts?: number) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
      <div
        style={{
          width: "120px",
          flexShrink: 0,
          fontSize: "12px",
          fontWeight: 800,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", minWidth: 0 }}>{value}</div>
    </div>
  );
}

export default function DocDetailClient({ id }: { id: string }) {
  const doc = useQuery(api.documents.get, { id: id as Id<"documents"> });

  const tags = useMemo(() => {
    return doc?.tags?.filter(Boolean) ?? [];
  }, [doc]);

  if (doc === undefined) {
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
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            ← Back
          </Link>
        </div>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "22px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            color: "var(--text-secondary)",
          }}
        >
          Loading document…
        </div>
      </div>
    );
  }

  if (doc === null) {
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
              fontWeight: 700,
              boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            }}
          >
            ← Back
          </Link>
        </div>

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
          <div style={{ fontSize: "44px", marginBottom: "12px" }}>🕵️‍♂️</div>
          <div style={{ fontSize: "16px", fontWeight: 800, color: "var(--text)" }}>
            Document not found
          </div>
          <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-secondary)" }}>
            The document may have been deleted or the link is incorrect.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1100px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
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

        <div
          style={{
            padding: "6px 10px",
            borderRadius: "999px",
            background: "rgba(196,149,106,0.12)",
            color: "var(--accent)",
            fontSize: "11px",
            fontWeight: 900,
            letterSpacing: "0.06em",
          }}
        >
          {String(doc.type).toUpperCase()}
        </div>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "22px",
          padding: "22px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          marginBottom: "14px",
        }}
      >
        <h1
          style={{
            fontSize: "26px",
            fontWeight: 900,
            color: "var(--text)",
            letterSpacing: "-0.02em",
            lineHeight: 1.2,
          }}
        >
          {doc.title}
        </h1>

        <div
          style={{
            marginTop: "14px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "10px",
          }}
        >
          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <MetaRow label="Author" value={<span style={{ fontWeight: 800 }}>{doc.createdBy || "—"}</span>} />
              <MetaRow label="Version" value={<span style={{ fontWeight: 800 }}>v{doc.version}</span>} />
              <MetaRow label="Created" value={formatDate(doc.createdAt)} />
              <MetaRow label="Updated" value={formatDate(doc.updatedAt)} />
            </div>
          </div>

          <div
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: "16px",
              padding: "14px 16px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <MetaRow
                label="Tags"
                value={
                  tags.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          style={{
                            fontSize: "11px",
                            padding: "4px 8px",
                            borderRadius: "10px",
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            color: "var(--text-secondary)",
                            fontWeight: 700,
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : (
                    "—"
                  )
                }
              />

              <MetaRow
                label="Task"
                value={
                  doc.taskId ? (
                    <Link
                      href={`/tasks/${doc.taskId}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--accent)",
                        fontWeight: 800,
                        textDecoration: "underline",
                        textUnderlineOffset: "3px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "100%",
                      }}
                      title={String(doc.taskId)}
                    >
                      {String(doc.taskId)} <span aria-hidden>→</span>
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />

              <MetaRow
                label="ID"
                value={
                  <span
                    style={{
                      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      display: "block",
                      maxWidth: "100%",
                    }}
                    title={String(doc._id)}
                  >
                    {String(doc._id)}
                  </span>
                }
              />
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "22px",
          padding: "22px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content || ""}</ReactMarkdown>
        </div>
      </div>

      <style>{`
        .markdown {
          color: var(--text-secondary);
          font-size: 15px;
          line-height: 1.7;
        }
        .markdown :where(h1,h2,h3) {
          color: var(--text);
          margin-top: 22px;
          margin-bottom: 10px;
          line-height: 1.25;
          letter-spacing: -0.01em;
        }
        .markdown h1 { font-size: 22px; }
        .markdown h2 { font-size: 18px; }
        .markdown h3 { font-size: 16px; }
        .markdown p { margin: 10px 0; }
        .markdown a {
          color: var(--accent);
          text-decoration: underline;
          text-underline-offset: 3px;
          font-weight: 700;
        }
        .markdown code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 13px;
          background: rgba(196,149,106,0.12);
          color: var(--text);
          padding: 2px 6px;
          border-radius: 8px;
        }
        .markdown pre {
          background: #1f1f1f;
          color: #f3f3f3;
          padding: 14px;
          border-radius: 16px;
          overflow: auto;
          margin: 14px 0;
        }
        .markdown pre code {
          background: transparent;
          color: inherit;
          padding: 0;
        }
        .markdown blockquote {
          border-left: 4px solid var(--accent);
          padding-left: 14px;
          color: var(--text-secondary);
          margin: 12px 0;
        }
        .markdown table {
          width: 100%;
          border-collapse: collapse;
          margin: 12px 0;
          font-size: 13px;
        }
        .markdown th,
        .markdown td {
          border: 1px solid var(--border);
          padding: 10px;
          text-align: left;
          vertical-align: top;
        }
        .markdown th {
          background: var(--bg);
          color: var(--text);
          font-weight: 800;
        }
        .markdown ul,
        .markdown ol {
          margin: 10px 0 10px 18px;
        }
      `}</style>
    </div>
  );
}
