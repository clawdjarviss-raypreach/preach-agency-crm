"use client";

import * as React from "react";

export type SuggestionTemplate = {
  id: string;
  name: string;
  text: string;
  category: string | null;
};

export interface SuggestionChipProps {
  template: SuggestionTemplate;
  score?: number;
  isSelected?: boolean;
  onApply: (template: SuggestionTemplate) => void;
}

function formatCategory(category: string): string {
  return category
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function SuggestionChip({
  template,
  score,
  onApply,
  isSelected,
}: SuggestionChipProps) {
  const label = template.name?.trim() || template.text.trim();
  const preview = template.text.trim();

  const baseStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    maxWidth: "220px",
    padding: "6px 12px",
    borderRadius: "9999px",
    border: isSelected ? "1px solid rgba(196, 149, 106, 0.4)" : "1px solid var(--border-subtle)",
    background: isSelected ? "rgba(196, 149, 106, 0.1)" : "var(--bg)",
    color: "var(--text)",
    fontSize: "12px",
    cursor: "pointer",
    transition: "all 0.15s",
    textAlign: "left",
  };

  const categoryStyle: React.CSSProperties = {
    flexShrink: 0,
    padding: "2px 8px",
    borderRadius: "9999px",
    border: isSelected ? "1px solid rgba(196, 149, 106, 0.25)" : "1px solid var(--border-subtle)",
    background: "var(--surface)",
    color: isSelected ? "var(--accent)" : "var(--text-muted)",
    fontSize: "10px",
    fontWeight: 500,
  };

  return (
    <button
      type="button"
      title={preview}
      onClick={() => onApply(template)}
      style={baseStyle}
      aria-pressed={isSelected}
      aria-label={`Apply suggestion: ${label}`}
      data-score={typeof score === "number" ? score.toFixed(3) : undefined}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = isSelected
          ? "rgba(196, 149, 106, 0.15)"
          : "var(--surface)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isSelected
          ? "rgba(196, 149, 106, 0.1)"
          : "var(--bg)";
      }}
    >
      <span
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontWeight: 600,
        }}
      >
        {label}
      </span>

      {template.category ? (
        <span style={categoryStyle}>{formatCategory(template.category)}</span>
      ) : null}
    </button>
  );
}
