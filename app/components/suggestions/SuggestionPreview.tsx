"use client";

import * as React from "react";
import type { SuggestionTemplate } from "./SuggestionChip";

export interface SuggestionPreviewProps {
  template: SuggestionTemplate | null;
  onApply: (template: SuggestionTemplate) => void;
  onCopy?: (template: SuggestionTemplate) => void;
}

export function SuggestionPreview({
  template,
  onApply,
  onCopy,
}: SuggestionPreviewProps) {
  const [copied, setCopied] = React.useState(false);

  if (!template) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(template.text);
      setCopied(true);
      onCopy?.(template);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = template.text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        padding: "12px",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface)",
      }}
      aria-label="Selected suggestion preview"
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: "8px",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {template.name}
          </div>
          {template.category ? (
            <div
              style={{
                marginTop: "2px",
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              {template.category}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
          <button
            type="button"
            onClick={handleCopy}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text-secondary)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {copied ? "✓ Copied" : "📋 Copy"}
          </button>
          <button
            type="button"
            onClick={() => onApply(template)}
            style={{
              padding: "6px 12px",
              borderRadius: "8px",
              border: "1px solid rgba(196, 149, 106, 0.4)",
              background: "rgba(196, 149, 106, 0.1)",
              color: "var(--accent)",
              fontSize: "12px",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            Apply
          </button>
        </div>
      </div>

      <pre
        style={{
          maxHeight: "176px",
          overflow: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: 0,
          padding: "8px",
          borderRadius: "8px",
          border: "1px solid var(--border-subtle)",
          background: "var(--bg)",
          fontSize: "12px",
          lineHeight: 1.6,
          color: "var(--text)",
          fontFamily: "inherit",
        }}
      >
        {template.text}
      </pre>
    </div>
  );
}
