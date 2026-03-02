"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import {
  SuggestionsBar,
  SuggestionPreview,
  type SuggestionTemplate,
  type SuggestionItem,
} from "../../components/suggestions";

const DEBOUNCE_MS = 300;

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ─── Create/Edit Template Modal ────────────────────────────────────

function TemplateModal({
  template,
  onClose,
  token,
  onSaved,
}: {
  template?: {
    id: string;
    name: string;
    text: string;
    category?: string;
  } | null;
  onClose: () => void;
  token: string;
  onSaved: () => void;
}) {
  const [name, setName] = useState(template?.name || "");
  const [text, setText] = useState(template?.text || "");
  const [category, setCategory] = useState(template?.category || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!name.trim() || !text.trim()) {
      setError("Name and text are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      if (template) {
        const { error: updateError } = await supabase
          .from("crm_reply_templates")
          .update({
            name: name.trim(),
            text: text.trim(),
            category: category.trim() || null,
          })
          .eq("id", template.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("crm_reply_templates")
          .insert({
            name: name.trim(),
            text: text.trim(),
            category: category.trim() || null,
            is_active: true,
            usage_count: 0,
          });
        if (insertError) throw insertError;
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "500px",
          background: "var(--surface)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: "20px",
            fontWeight: 700,
            color: "var(--text)",
            marginBottom: "20px",
          }}
        >
          {template ? "Edit Template" : "New Reply Template"}
        </h2>

        {error && (
          <div
            style={{
              padding: "12px",
              borderRadius: "12px",
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: "14px",
              marginBottom: "16px",
            }}
          >
            {error}
          </div>
        )}

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "6px",
            }}
          >
            Template Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Greeting, Price Request, PPV Pitch"
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "14px",
              border: "2px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "6px",
            }}
          >
            Category (optional)
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "14px",
              border: "2px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
              cursor: "pointer",
            }}
          >
            <option value="">No category</option>
            <option value="greetings">Greetings</option>
            <option value="pricing">Pricing</option>
            <option value="ppv">PPV</option>
            <option value="custom">Custom Content</option>
            <option value="schedule">Schedule/Availability</option>
            <option value="upsell">Upsell</option>
            <option value="closing">Closing</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "6px",
            }}
          >
            Reply Text
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter the reply text..."
            rows={6}
            style={{
              width: "100%",
              padding: "12px 14px",
              fontSize: "14px",
              border: "2px solid var(--border)",
              borderRadius: "12px",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
              resize: "vertical",
              lineHeight: 1.5,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px 20px",
              borderRadius: "12px",
              border: "2px solid var(--border)",
              background: "transparent",
              color: "var(--text-secondary)",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim() || !text.trim()}
            style={{
              padding: "12px 24px",
              borderRadius: "12px",
              border: "none",
              background: saving ? "var(--text-muted)" : "var(--accent)",
              color: "#fff",
              fontSize: "14px",
              fontWeight: 600,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {saving ? "Saving..." : template ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────

export default function TemplatesPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);

  // Search/suggestion state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebounce(searchQuery, DEBOUNCE_MS);

  // Selected template for preview
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<{
    id: string;
    name: string;
    text: string;
    category?: string;
  } | null>(null);

  // Category filter
  const [categoryFilter, setCategoryFilter] = useState("");

  // Data state
  const [templates, setTemplates] = useState<any[] | null>(null);
  const [suggestions, setSuggestions] = useState<any[] | undefined>(undefined);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    if (!token) return;

    let query = supabase
      .from("crm_reply_templates")
      .select("*")
      .eq("is_active", true);

    if (categoryFilter) {
      query = query.eq("category", categoryFilter);
    }

    const { data } = await query;
    setTemplates(data ?? []);
  }, [token, categoryFilter]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Fetch suggestions based on search
  useEffect(() => {
    if (!token || debouncedQuery.length === 0) {
      setSuggestions(undefined);
      return;
    }

    const fetchSuggestions = async () => {
      setSuggestions(undefined);
      const { data } = await supabase
        .from("crm_reply_templates")
        .select("*")
        .eq("is_active", true)
        .ilike("text", `%${debouncedQuery}%`)
        .limit(8);

      if (data) {
        const items = data.map((t: any) => ({
          template: {
            id: t.id,
            name: t.name,
            text: t.text,
            category: t.category ?? null,
          },
          score: t.usage_count ?? 0,
          matchedKeywords: [],
          contextBoost: 0,
          baseScore: t.usage_count ?? 0,
        }));
        setSuggestions(items);
      } else {
        setSuggestions([]);
      }
    };

    fetchSuggestions();
  }, [token, debouncedQuery]);

  // Transform suggestions to the expected format
  const suggestionItems: SuggestionItem[] = useMemo(() => {
    if (!suggestions) return [];
    return suggestions.map((s) => ({
      template: {
        id: s.template.id,
        name: s.template.name,
        text: s.template.text,
        category: s.template.category,
      },
      score: s.score,
      matchedKeywords: s.matchedKeywords,
      contextBoost: s.contextBoost,
      baseScore: s.baseScore,
    }));
  }, [suggestions]);

  // Selected template for preview
  const selectedTemplate: SuggestionTemplate | null = useMemo(() => {
    if (!selectedTemplateId) return null;
    const found = templates?.find((t) => t.id === selectedTemplateId);
    if (found) {
      return {
        id: found.id,
        name: found.name,
        text: found.text,
        category: found.category ?? null,
      };
    }
    const fromSuggestions = suggestionItems.find(
      (s) => s.template.id === selectedTemplateId
    );
    return fromSuggestions?.template ?? null;
  }, [selectedTemplateId, templates, suggestionItems]);

  const recordUsage = useCallback(async (templateId: string) => {
    if (!templateId) return;
    await supabase.rpc("increment_template_usage", { template_id: templateId }).catch(() => {
      // Fallback: manual increment
      supabase
        .from("crm_reply_templates")
        .select("usage_count")
        .eq("id", templateId)
        .single()
        .then(({ data }) => {
          if (data) {
            supabase
              .from("crm_reply_templates")
              .update({ usage_count: (data.usage_count ?? 0) + 1 })
              .eq("id", templateId);
          }
        });
    });
  }, []);

  const handleApply = useCallback(
    async (template: SuggestionTemplate) => {
      // Copy to clipboard
      try {
        await navigator.clipboard.writeText(template.text);
      } catch {
        // fallback
        const textarea = document.createElement("textarea");
        textarea.value = template.text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }

      // Record usage
      if (token) {
        try {
          await recordUsage(template.id);
        } catch {
          // ignore usage tracking errors
        }
      }

      // Clear selection
      setSelectedTemplateId(null);
    },
    [token, recordUsage]
  );

  const handleDelete = async (templateId: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;
    try {
      const { error } = await supabase
        .from("crm_reply_templates")
        .delete()
        .eq("id", templateId);
      if (error) throw error;
      await fetchTemplates();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  if (!token || !user) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            color: "var(--text)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          💡 Smart Replies
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          Quick access to reply templates for faster chatting
        </p>
      </div>

      {/* Search & Suggestions */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          padding: "20px",
          marginBottom: "20px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ marginBottom: "16px" }}>
          <label
            style={{
              display: "block",
              fontSize: "14px",
              fontWeight: 600,
              color: "var(--text-secondary)",
              marginBottom: "8px",
            }}
          >
            🔍 What did the fan say?
          </label>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Paste the fan's message here to get smart suggestions..."
            style={{
              width: "100%",
              padding: "14px 16px",
              fontSize: "15px",
              border: "2px solid var(--border)",
              borderRadius: "14px",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        {debouncedQuery.length > 0 && (
          <SuggestionsBar
            suggestions={suggestionItems}
            isLoading={suggestions === undefined}
            selectedTemplateId={selectedTemplateId}
            onApply={handleApply}
            onSelect={setSelectedTemplateId}
            maxVisible={5}
          />
        )}

        {selectedTemplate && (
          <div style={{ marginTop: "16px" }}>
            <SuggestionPreview
              template={selectedTemplate}
              onApply={handleApply}
              onCopy={() => {
                if (token && selectedTemplate) {
                  recordUsage(selectedTemplate.id).catch(() => {});
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Templates List */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          padding: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "12px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text)" }}>
            📋 Your Templates
          </h2>

          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{
                padding: "8px 14px",
                fontSize: "13px",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                background: "var(--bg)",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <option value="">All categories</option>
              <option value="greetings">Greetings</option>
              <option value="pricing">Pricing</option>
              <option value="ppv">PPV</option>
              <option value="custom">Custom Content</option>
              <option value="schedule">Schedule</option>
              <option value="upsell">Upsell</option>
              <option value="closing">Closing</option>
              <option value="other">Other</option>
            </select>

            <button
              type="button"
              onClick={() => {
                setEditTemplate(null);
                setShowModal(true);
              }}
              style={{
                padding: "8px 16px",
                borderRadius: "10px",
                border: "none",
                background: "var(--accent)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ➕ New Template
            </button>
          </div>
        </div>

        {!templates || templates.length === 0 ? (
          <div
            style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>💬</div>
            <p style={{ fontSize: "14px" }}>
              No templates yet. Create your first one to speed up your responses!
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {templates.map((template) => (
              <div
                key={template.id}
                style={{
                  padding: "16px",
                  background: "var(--bg)",
                  borderRadius: "14px",
                  display: "flex",
                  gap: "12px",
                  alignItems: "flex-start",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {template.name}
                    </span>
                    {template.category && (
                      <span
                        style={{
                          padding: "2px 8px",
                          fontSize: "11px",
                          fontWeight: 500,
                          background: "var(--surface)",
                          color: "var(--text-muted)",
                          borderRadius: "6px",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        {template.category}
                      </span>
                    )}
                    <span
                      style={{
                        marginLeft: "auto",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {template.usage_count} uses
                    </span>
                  </div>
                  <p
                    style={{
                      fontSize: "13px",
                      color: "var(--text-secondary)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {template.text}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() =>
                      handleApply({
                        id: template.id,
                        name: template.name,
                        text: template.text,
                        category: template.category ?? null,
                      })
                    }
                    style={{
                      padding: "6px 12px",
                      borderRadius: "8px",
                      border: "1px solid rgba(196, 149, 106, 0.4)",
                      background: "rgba(196, 149, 106, 0.1)",
                      color: "var(--accent)",
                      fontSize: "12px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditTemplate({
                        id: template.id,
                        name: template.name,
                        text: template.text,
                        category: template.category,
                      });
                      setShowModal(true);
                    }}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-secondary)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(template.id)}
                    style={{
                      padding: "6px 10px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text-muted)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <TemplateModal
          template={editTemplate}
          token={token}
          onSaved={fetchTemplates}
          onClose={() => {
            setShowModal(false);
            setEditTemplate(null);
          }}
        />
      )}
    </div>
  );
}
