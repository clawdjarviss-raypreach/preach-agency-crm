"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import FeedbackCard, { type FeedbackCardFeedback, type FeedbackType, type FeedbackVisibility } from "../../../../components/FeedbackCard";
import PraiseQuickButton from "../../../../components/PraiseQuickButton";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function normalizeFeedback(raw: any): FeedbackCardFeedback {
  return {
    id: String(raw.id),
    chatterId: String(raw.chatter_id),
    givenBy: String(raw.given_by),
    type: raw.type as FeedbackType,
    title: raw.title ?? undefined,
    content: String(raw.content ?? ""),
    category: raw.category ?? undefined,
    relatedCreatorId: raw.related_creator_id ? String(raw.related_creator_id) : undefined,
    relatedMeetingId: raw.related_meeting_id ? String(raw.related_meeting_id) : undefined,
    visibility: raw.visibility as FeedbackVisibility,
    acknowledged: raw.acknowledged ?? undefined,
    acknowledgedAt: raw.acknowledged_at ?? undefined,
    chatterResponse: raw.chatter_response ?? undefined,
    feedbackDate: raw.feedback_date ? new Date(raw.feedback_date).getTime() : (raw.created_at ? new Date(raw.created_at).getTime() : Date.now()),
    createdAt: raw.created_at ?? undefined,
    updatedAt: raw.updated_at ?? undefined,
  };
}

export default function FeedbackPage() {
  const searchParams = useSearchParams();

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  const [selectedChatterId, setSelectedChatterId] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [visibilityFilter, setVisibilityFilter] = useState<string>("");

  const [acknowledgingId, setAcknowledgingId] = useState<string>("");

  const [chatters, setChatters] = useState<any[] | undefined>(undefined);
  const [feedbackData, setFeedbackData] = useState<any[] | undefined>(undefined);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  const [feedbackError, setFeedbackError] = useState<Error | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));

    const preselect = searchParams.get("chatterId") ?? "";
    if (preselect) setSelectedChatterId(preselect);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canManage = isSupervisorRole(user?.role);

  // Lock selection to self for chatters.
  useEffect(() => {
    if (!user?.id) return;
    if (!canManage) setSelectedChatterId(user.id);
  }, [canManage, user?.id]);

  const loadChatters = useCallback(async () => {
    if (!token || !canManage) return;
    try {
      const { data, error } = await supabase.from("crm_chatters").select("*");
      if (error) throw error;
      setChatters(data ?? []);
    } catch (e) {
      console.error("Failed to load chatters:", e);
      setChatters([]);
    }
  }, [token, canManage]);

  useEffect(() => {
    if (!token) return;
    loadChatters();
  }, [token, loadChatters]);

  const loadFeedback = useCallback(async () => {
    if (!token) return;
    setLoadingFeedback(true);
    setFeedbackError(null);
    try {
      let query = supabase.from("crm_coaching_feedback").select("*");

      if (selectedChatterId) {
        query = query.eq("chatter_id", selectedChatterId);
      } else if (!canManage && user?.id) {
        query = query.eq("chatter_id", user.id);
      }

      if (typeFilter) {
        query = query.eq("type", typeFilter);
      }
      if (visibilityFilter) {
        query = query.eq("visibility", visibilityFilter);
      }

      query = query.order("feedback_date", { ascending: false }).limit(200);

      const { data, error } = await query;
      if (error) throw error;
      setFeedbackData(data ?? []);
    } catch (e: any) {
      console.error("Failed to load feedback:", e);
      setFeedbackError(e);
      setFeedbackData([]);
    } finally {
      setLoadingFeedback(false);
    }
  }, [token, selectedChatterId, canManage, user?.id, typeFilter, visibilityFilter]);

  useEffect(() => {
    if (!token) return;
    loadFeedback();
  }, [token, loadFeedback]);

  const peopleById = useMemo(() => {
    const map: Record<string, { id: string; name: string; avatarEmoji?: string; profilePictureUrl?: string }> = {};
    (chatters || []).forEach((c: any) => {
      const id = String(c.id);
      map[id] = {
        id,
        name: String(c.name ?? c.username ?? id),
        avatarEmoji: c.avatar_emoji,
        profilePictureUrl: c.profile_picture_url,
      };
    });
    return map;
  }, [chatters]);

  const allFeedback = useMemo(() => {
    if (!token) return [] as FeedbackCardFeedback[];
    const normalized = (feedbackData || []).map(normalizeFeedback);
    normalized.sort((a, b) => b.feedbackDate - a.feedbackDate);
    return normalized;
  }, [token, feedbackData]);

  const onAcknowledge = async ({ feedbackId }: { feedbackId: string }) => {
    if (!token) return;
    setAcknowledgingId(feedbackId);
    try {
      const { error } = await supabase
        .from("crm_coaching_feedback")
        .update({
          acknowledged: true,
          acknowledged_at: new Date().toISOString(),
        })
        .eq("id", feedbackId);
      if (error) throw error;
      await loadFeedback();
    } finally {
      setAcknowledgingId("");
    }
  };

  const chatterOptions = useMemo(() => {
    return (chatters || [])
      .filter((c: any) => c.role === "chatter")
      .map((c: any) => ({
        id: String(c.id),
        name: String(c.name ?? c.username ?? c.id),
        role: c.role,
        avatarEmoji: c.avatar_emoji,
      }));
  }, [chatters]);

  const headerRight = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
      {token && canManage ? (
        <PraiseQuickButton token={token} chatters={chatterOptions as any} defaultChatterId={selectedChatterId || undefined} />
      ) : null}

      <Link
        href={selectedChatterId ? `/coaching/feedback/new?chatterId=${encodeURIComponent(selectedChatterId)}` : "/coaching/feedback/new"}
        style={{
          padding: "10px 12px",
          background: "var(--surface)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontWeight: 900,
          textDecoration: "none",
          display: "inline-block",
        }}
      >
        + Give Feedback
      </Link>
    </div>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>💬 Feedback Log</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            Track praise, constructive feedback, and warnings over time.
          </div>
        </div>
        {headerRight}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          borderRadius: 12,
          display: "grid",
          gridTemplateColumns: canManage ? "1.2fr 1fr 1fr" : "1fr 1fr",
          gap: 12,
          alignItems: "end",
        }}
      >
        {canManage ? (
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
            <select
              value={selectedChatterId}
              onChange={(e) => setSelectedChatterId(e.target.value)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="">All chatters</option>
              {(chatters || [])
                .filter((c: any) => c.role === "chatter")
                .map((c: any) => (
                  <option key={String(c.id)} value={String(c.id)}>
                    {c.avatar_emoji ? `${c.avatar_emoji} ` : ""}{c.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Type</div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="">All</option>
            <option value="praise">🌟 Praise</option>
            <option value="constructive">💬 Constructive</option>
            <option value="observation">👁️ Observation</option>
            <option value="warning">⚠️ Warning</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visibility</div>
          <select
            value={visibilityFilter}
            onChange={(e) => setVisibilityFilter(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="">All</option>
            <option value="private">Private</option>
            <option value="shared">Shared</option>
            <option value="team">Team</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: 18 }}>
        {!token ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            Please log in to view feedback.
          </div>
        ) : canManage && chatters === undefined ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading chatters…</div>
        ) : feedbackError ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--red)",
              background: "var(--red-bg)",
              color: "var(--red)",
              fontSize: 13,
            }}
          >
            {feedbackError.message}
          </div>
        ) : loadingFeedback && feedbackData === undefined ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading feedback…</div>
        ) : allFeedback.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {allFeedback.map((f) => (
              <FeedbackCard
                key={f.id}
                feedback={f}
                chatter={peopleById[f.chatterId]}
                supervisor={peopleById[f.givenBy]}
                onAcknowledge={!canManage ? onAcknowledge : undefined}
                acknowledging={acknowledgingId === f.id}
              />
            ))}
          </div>
        ) : (
          <div style={{ padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)" }}>
            <div style={{ fontWeight: 800 }}>No feedback found.</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "var(--text-secondary)" }}>
              {canManage
                ? "Use \u201cGive Feedback\u201d or \u201cQuick Praise\u201d to add a new entry."
                : "Your supervisor will share feedback here."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
