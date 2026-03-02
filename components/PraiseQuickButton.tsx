"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type PraiseQuickChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

type Template = {
  id: string;
  label: string;
  title: string;
  content: string;
};

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "vip_handling",
    label: "VIP handling",
    title: "Excellent VIP handling",
    content:
      "Great work handling VIPs this week. Your responses were fast, confident, and you kept the tone personal while still moving toward the close.",
  },
  {
    id: "response_time",
    label: "Response time",
    title: "Strong response time improvement",
    content:
      "Noticed your response time has improved a lot. Keep the momentum—your consistency is making a real difference.",
  },
  {
    id: "teamwork",
    label: "Teamwork",
    title: "Awesome teamwork",
    content:
      "Thank you for being proactive and supportive with the team. Your handoffs and notes help everyone operate better.",
  },
  {
    id: "ppv_close",
    label: "PPV sales",
    title: "Great PPV execution",
    content:
      "Excellent PPV execution—your pacing, framing, and follow-up were on point. Nice job driving revenue while keeping the fan engaged.",
  },
];

export default function PraiseQuickButton({
  token,
  chatters,
  defaultChatterId,
  defaultVisibility = "shared",
  templates,
  buttonLabel,
  onSent,
}: {
  token: string;
  chatters: PraiseQuickChatterOption[];
  defaultChatterId?: string;
  defaultVisibility?: "private" | "shared" | "team";
  templates?: Template[];
  buttonLabel?: string;
  onSent?: (feedbackId: string) => void;
}) {
  const chatterOptions = useMemo(() => {
    const onlyChatters = chatters.filter((c) => (c.role ? c.role === "chatter" : true));
    return onlyChatters.length ? onlyChatters : chatters;
  }, [chatters]);

  const list = templates ?? DEFAULT_TEMPLATES;

  const [open, setOpen] = useState(false);

  const [chatterId, setChatterId] = useState<string>(defaultChatterId ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(list[0]?.id ?? "");
  const [customMessage, setCustomMessage] = useState<string>("");

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");

    if (!chatterId) {
      const first = chatterOptions[0];
      if (first?.id) setChatterId(first.id);
    }

    if (!selectedTemplateId && list[0]?.id) setSelectedTemplateId(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const selected = useMemo(() => list.find((t) => t.id === selectedTemplateId) ?? list[0], [list, selectedTemplateId]);

  const send = async (payload: { title: string; content: string }) => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing auth token.");
      return;
    }

    if (!chatterId) {
      setError("Please select a chatter.");
      return;
    }

    const title = payload.title.trim();
    const content = payload.content.trim();
    if (!content) {
      setError("Message is empty.");
      return;
    }

    setSending(true);
    try {
      const { data, error: insertError } = await supabase.from("crm_coaching_feedback").insert({
        chatter_id: chatterId,
        type: "praise",
        title: title ? title : null,
        content,
        visibility: defaultVisibility,
        feedback_date: Date.now(),
      }).select("id").single();

      if (insertError) throw new Error(insertError.message);

      setSuccess("Praise sent.");
      onSent?.(String(data?.id));

      // Reset and close.
      setCustomMessage("");
      setTimeout(() => setOpen(false), 350);
    } catch (e: any) {
      setError(e?.message ?? "Failed to send praise");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          padding: "10px 12px",
          background: "var(--accent)",
          color: "white",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontWeight: 900,
          cursor: "pointer",
        }}
      >
        {buttonLabel ?? "+ Quick Praise"}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            style={{
              width: "min(800px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              background: "var(--surface)",
              borderRadius: 14,
              border: "1px solid var(--border)",
              padding: 16,
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>Quick Praise</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                  Pick a template or write a custom message.
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={sending}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: sending ? "not-allowed" : "pointer",
                  fontWeight: 800,
                }}
              >
                ✕
              </button>
            </div>

            {error ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--red)",
                  background: "var(--red-bg)",
                  color: "var(--red)",
                  fontSize: 13,
                }}
              >
                {error}
              </div>
            ) : null}

            {success ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--green)",
                  background: "var(--green-bg)",
                  color: "var(--green)",
                  fontSize: 13,
                }}
              >
                {success}
              </div>
            ) : null}

            <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
                <select
                  value={chatterId}
                  onChange={(e) => setChatterId(e.target.value)}
                  disabled={sending}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <option value="">Select…</option>
                  {chatterOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
                    </option>
                  ))}
                </select>
              </label>

              <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
                <div style={{ fontWeight: 900 }}>Templates</div>
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {list.map((t) => {
                    const active = t.id === (selected?.id ?? "");
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTemplateId(t.id);
                        }}
                        disabled={sending}
                        style={{
                          padding: 12,
                          borderRadius: 12,
                          border: active ? "1px solid rgba(196,149,106,0.65)" : "1px solid var(--border)",
                          background: active ? "rgba(196,149,106,0.12)" : "var(--surface)",
                          cursor: sending ? "not-allowed" : "pointer",
                          textAlign: "left",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{t.label}</div>
                        <div style={{ marginTop: 4, fontSize: 12, color: "var(--text-secondary)" }}>{t.title}</div>
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const t = selected;
                      if (!t) return;
                      void send({ title: t.title, content: t.content });
                    }}
                    disabled={sending}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: sending ? "var(--bg)" : "var(--accent)",
                      color: sending ? "var(--text-muted)" : "white",
                      cursor: sending ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {sending ? "Sending…" : "One-click send"}
                  </button>
                </div>
              </div>

              <div style={{ padding: 12, borderRadius: 12, border: "1px solid var(--border)", background: "var(--bg)" }}>
                <div style={{ fontWeight: 900 }}>Custom message</div>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  disabled={sending}
                  rows={4}
                  placeholder="Write your praise message…"
                  style={{
                    marginTop: 10,
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    resize: "vertical",
                  }}
                />

                <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      void send({ title: "Quick praise", content: customMessage });
                    }}
                    disabled={sending}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 10,
                      border: "1px solid var(--border)",
                      background: sending ? "var(--bg)" : "var(--accent)",
                      color: sending ? "var(--text-muted)" : "white",
                      cursor: sending ? "not-allowed" : "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {sending ? "Sending…" : "Send custom"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
