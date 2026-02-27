"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQueries, useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
    id: String(raw.id ?? raw._id),
    chatterId: String(raw.chatterId),
    givenBy: String(raw.givenBy),
    type: raw.type as FeedbackType,
    title: raw.title ?? undefined,
    content: String(raw.content ?? ""),
    category: raw.category ?? undefined,
    relatedCreatorId: raw.relatedCreatorId ? String(raw.relatedCreatorId) : undefined,
    relatedMeetingId: raw.relatedMeetingId ? String(raw.relatedMeetingId) : undefined,
    visibility: raw.visibility as FeedbackVisibility,
    acknowledged: raw.acknowledged ?? undefined,
    acknowledgedAt: raw.acknowledgedAt ?? undefined,
    chatterResponse: raw.chatterResponse ?? undefined,
    feedbackDate: Number(raw.feedbackDate ?? raw.createdAt ?? Date.now()),
    createdAt: raw.createdAt ?? undefined,
    updatedAt: raw.updatedAt ?? undefined,
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

  const chatters = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip") as any[] | undefined;

  // Default chatter selection for supervisors (optional): keep "All" by default unless URL preselects.
  useEffect(() => {
    if (!canManage) return;
    if (!token) return;
    if (selectedChatterId) return;
    // Keep "All chatters" (empty) as the default.
  }, [canManage, token, selectedChatterId]);

  const peopleById = useMemo(() => {
    const map: Record<string, { id: string; name: string; avatarEmoji?: string; profilePictureUrl?: string }> = {};
    (chatters || []).forEach((c: any) => {
      const id = String(c.id ?? c._id);
      map[id] = {
        id,
        name: String(c.name ?? c.username ?? id),
        avatarEmoji: c.avatarEmoji,
        profilePictureUrl: c.profilePictureUrl,
      };
    });
    return map;
  }, [chatters]);

  const singleArgs = useMemo(() => {
    if (!token) return "skip" as const;
    if (!selectedChatterId) return "skip" as const;

    return {
      token,
      chatterId: selectedChatterId as Id<"crm_chatters">,
      type: (typeFilter ? (typeFilter as FeedbackType) : undefined) as any,
      visibility: (visibilityFilter ? (visibilityFilter as FeedbackVisibility) : undefined) as any,
      limit: 200,
    };
  }, [token, selectedChatterId, typeFilter, visibilityFilter]);

  const singleFeedbackRaw = useQuery(api.crm.coaching.getFeedbackByChatter, singleArgs as any) as any[] | undefined;

  const allQueries = useMemo(() => {
    if (!token || !canManage) return {};
    if (selectedChatterId) return {};

    const onlyChatters = (chatters || []).filter((c: any) => c.role === "chatter");
    const q: Record<string, { query: any; args: any }> = {};

    for (const c of onlyChatters) {
      const id = String(c.id ?? c._id);
      q[id] = {
        query: api.crm.coaching.getFeedbackByChatter,
        args: {
          token,
          chatterId: id as Id<"crm_chatters">,
          type: typeFilter ? (typeFilter as FeedbackType) : undefined,
          visibility: visibilityFilter ? (visibilityFilter as FeedbackVisibility) : undefined,
          limit: 80,
        },
      };
    }

    return q;
  }, [token, canManage, selectedChatterId, chatters, typeFilter, visibilityFilter]);

  const allResults = useQueries(allQueries as any) as Record<string, any[] | Error | undefined>;

  const allFeedback = useMemo(() => {
    if (!token) return [] as FeedbackCardFeedback[];

    let list: any[] = [];

    if (canManage && !selectedChatterId) {
      for (const v of Object.values(allResults)) {
        if (v instanceof Error) continue;
        if (!v) continue;
        list = list.concat(v);
      }
    } else {
      list = singleFeedbackRaw ?? [];
    }

    const normalized = list.map(normalizeFeedback);
    normalized.sort((a, b) => b.feedbackDate - a.feedbackDate);
    return normalized;
  }, [token, canManage, selectedChatterId, allResults, singleFeedbackRaw]);

  const loadingAll = useMemo(() => {
    if (!token || !canManage) return false;
    if (selectedChatterId) return false;
    const values = Object.values(allResults);
    if (values.length === 0) return Boolean(chatters && chatters.length > 0); // queries not yet created
    return values.some((v) => v === undefined);
  }, [token, canManage, selectedChatterId, allResults, chatters]);

  const allError = useMemo(() => {
    for (const v of Object.values(allResults)) {
      if (v instanceof Error) return v;
    }
    return null;
  }, [allResults]);

  const acknowledge = useMutation(api.crm.coaching.acknowledgeFeedback);

  const onAcknowledge = async ({ feedbackId }: { feedbackId: string }) => {
    if (!token) return;
    setAcknowledgingId(feedbackId);
    try {
      await acknowledge({ token, feedbackId: feedbackId as Id<"crm_coaching_feedback">, response: undefined });
    } finally {
      setAcknowledgingId("");
    }
  };

  const chatterOptions = useMemo(() => {
    return (chatters || [])
      .filter((c: any) => c.role === "chatter")
      .map((c: any) => ({
        id: String(c.id ?? c._id),
        name: String(c.name ?? c.username ?? c.id),
        role: c.role,
        avatarEmoji: c.avatarEmoji,
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
                  <option key={String(c.id ?? c._id)} value={String(c.id ?? c._id)}>
                    {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
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
        ) : allError ? (
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
            {allError.message}
          </div>
        ) : selectedChatterId && singleFeedbackRaw === undefined && !canManage ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
        ) : selectedChatterId && singleFeedbackRaw === undefined && canManage ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
        ) : loadingAll ? (
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
                ? "Use “Give Feedback” or “Quick Praise” to add a new entry."
                : "Your supervisor will share feedback here."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
