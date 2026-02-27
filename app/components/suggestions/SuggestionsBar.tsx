"use client";

import * as React from "react";
import { SuggestionChip, type SuggestionTemplate } from "./SuggestionChip";

export type SuggestionItem = {
  template: SuggestionTemplate;
  score: number;
  matchedKeywords?: string[];
  contextBoost?: number;
  baseScore?: number;
};

export interface SuggestionsBarProps {
  suggestions?: SuggestionItem[];
  isLoading?: boolean;
  error?: unknown;
  selectedTemplateId?: string | null;
  onApply: (template: SuggestionTemplate) => void;
  onSelect?: (templateId: string) => void;
  maxVisible?: number;
}

function SkeletonChip() {
  return (
    <div
      style={{
        width: "144px",
        height: "28px",
        borderRadius: "9999px",
        border: "1px solid var(--border-subtle)",
        background: "var(--bg)",
        animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      }}
      aria-hidden="true"
    />
  );
}

export function SuggestionsBar({
  suggestions,
  isLoading,
  error,
  selectedTemplateId,
  onApply,
  onSelect,
  maxVisible = 5,
}: SuggestionsBarProps) {
  const safeSuggestions = suggestions ?? [];

  // Graceful degradation: hide entirely when empty and not loading.
  if (!isLoading && (error || safeSuggestions.length === 0)) {
    return null;
  }

  const visible = safeSuggestions.slice(0, maxVisible);
  const overflowCount = Math.max(0, safeSuggestions.length - visible.length);

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        borderRadius: "12px",
        border: "1px solid var(--border-subtle)",
        background: "var(--surface)",
      }}
      aria-label="Quick reply suggestions"
    >
      <div
        style={{
          display: "none",
          flexShrink: 0,
          alignItems: "center",
          gap: "8px",
          paddingLeft: "4px",
          fontSize: "12px",
          color: "var(--text-muted)",
          userSelect: "none",
        }}
        className="suggestions-label"
      >
        <span style={{ color: "var(--accent)" }}>💡</span>
        <span style={{ fontWeight: 600 }}>Quick Replies</span>
      </div>

      <div
        style={{
          display: "flex",
          flex: 1,
          minWidth: 0,
          alignItems: "center",
          gap: "8px",
          overflowX: "auto",
          paddingRight: "4px",
          msOverflowStyle: "none",
          scrollbarWidth: "none",
        }}
      >
        {isLoading ? (
          <>
            <SkeletonChip />
            <SkeletonChip />
            <SkeletonChip />
          </>
        ) : (
          <>
            {visible.map((s) => (
              <SuggestionChip
                key={s.template.id}
                template={s.template}
                score={s.score}
                isSelected={selectedTemplateId === s.template.id}
                onApply={(tpl) => {
                  onSelect?.(tpl.id);
                  onApply(tpl);
                }}
              />
            ))}

            {overflowCount > 0 ? (
              <button
                type="button"
                style={{
                  flexShrink: 0,
                  padding: "6px 12px",
                  borderRadius: "9999px",
                  border: "1px solid var(--border-subtle)",
                  background: "var(--bg)",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
                title={`${overflowCount} more suggestions not shown`}
                aria-label={`${overflowCount} more suggestions`}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--surface)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg)";
                }}
              >
                +{overflowCount} more
              </button>
            ) : null}
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @media (min-width: 768px) {
          .suggestions-label { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
