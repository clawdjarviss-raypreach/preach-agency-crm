"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import FeedbackForm, { type FeedbackFormChatterOption } from "../../../../../components/FeedbackForm";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

export default function NewFeedbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const canManage = isSupervisorRole(user?.role);

  const chattersRaw = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip") as any[] | undefined;

  const chatterOptions = useMemo((): FeedbackFormChatterOption[] => {
    return (chattersRaw || []).map((c: any) => ({
      id: String(c.id ?? c._id),
      name: String(c.name ?? c.username ?? c.id),
      role: c.role,
      avatarEmoji: c.avatarEmoji,
    }));
  }, [chattersRaw]);

  const defaultChatterId = useMemo(() => {
    const fromUrl = searchParams.get("chatterId") ?? "";
    if (fromUrl) return fromUrl;
    const first = chatterOptions.find((c) => c.role === "chatter") ?? chatterOptions[0];
    return first?.id ?? "";
  }, [searchParams, chatterOptions]);

  return (
    <div style={{ padding: 20, maxWidth: 950, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>💬 Give Feedback</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            Create a feedback entry with the right visibility.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {!token ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            Please log in to create feedback.
          </div>
        ) : !canManage ? (
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text-secondary)",
              fontSize: 13,
            }}
          >
            Only supervisors can create feedback entries.
          </div>
        ) : chattersRaw === undefined ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
        ) : (
          <FeedbackForm
            token={token}
            chatters={chatterOptions}
            defaultChatterId={defaultChatterId}
            onCancel={() => router.push("/coaching/feedback")}
            onSaved={() => {
              router.push("/coaching/feedback");
            }}
          />
        )}
      </div>
    </div>
  );
}
