"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import MeetingScheduler from "../../../../components/MeetingScheduler";
import MeetingCard, {
  type MeetingCardChatter,
  type MeetingCardMeeting,
} from "../../../../components/MeetingCard";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function inputDateToRange(dateStr: string, which: "start" | "end"): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(dateStr + (which === "start" ? "T00:00:00" : "T23:59:59"));
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export default function MeetingsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  const [selectedChatterId, setSelectedChatterId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [showScheduler, setShowScheduler] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const canManage = isSupervisorRole(user?.role);

  const chatters = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip");

  const upcoming = useQuery(
    api.crm.coaching.getUpcomingMeetings,
    token && canManage ? { token, limit: 100 } : "skip"
  ) as any[] | undefined;

  // Meeting history is shown for a selected chatter.
  const meetingsForChatter = useQuery(
    api.crm.coaching.getMeetingsByChatter,
    token && (selectedChatterId || !canManage)
      ? {
          token,
          chatterId: (selectedChatterId || user?.id) as Id<"crm_chatters">,
          limit: 200,
        }
      : "skip"
  ) as any[] | undefined;

  // Default chatter selection for supervisors.
  useEffect(() => {
    if (!canManage) return;
    if (selectedChatterId) return;
    const first = (chatters || []).find((c: any) => c.role === "chatter") ?? (chatters || [])[0];
    if (first?.id) setSelectedChatterId(first.id);
  }, [canManage, chatters, selectedChatterId]);

  const chatterById = useMemo(() => {
    const map: Record<string, MeetingCardChatter> = {};
    (chatters || []).forEach((c: any) => {
      map[c.id] = {
        id: c.id,
        name: c.name,
        avatarEmoji: c.avatarEmoji,
        profilePictureUrl: c.profilePictureUrl,
      };
    });
    return map;
  }, [chatters]);

  const filteredUpcoming = useMemo(() => {
    const s = inputDateToRange(startDate, "start");
    const e = inputDateToRange(endDate, "end");
    return (upcoming || [])
      .map((m: any) => ({ ...m, id: m._id }))
      .filter((m: any) => {
        if (selectedChatterId && m.chatterId !== selectedChatterId) return false;
        if (s !== undefined && m.meetingDate < s) return false;
        if (e !== undefined && m.meetingDate > e) return false;
        return true;
      })
      .sort((a: any, b: any) => a.meetingDate - b.meetingDate);
  }, [upcoming, selectedChatterId, startDate, endDate]);

  const filteredHistory = useMemo(() => {
    const s = inputDateToRange(startDate, "start");
    const e = inputDateToRange(endDate, "end");
    const now = Date.now();

    const list = (meetingsForChatter || [])
      .map((m: any) => ({ ...m, id: m.id ?? m._id }))
      .filter((m: any) => {
        if (s !== undefined && m.meetingDate < s) return false;
        if (e !== undefined && m.meetingDate > e) return false;
        return true;
      });

    const past = list.filter((m: any) => m.meetingDate < now);
    past.sort((a: any, b: any) => b.meetingDate - a.meetingDate);
    return past;
  }, [meetingsForChatter, startDate, endDate]);

  const headerRight = (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button
        onClick={() => setShowScheduler(true)}
        style={{
          padding: "10px 12px",
          background: "var(--accent)",
          color: "white",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontWeight: 800,
          cursor: "pointer",
        }}
      >
        + Quick Schedule
      </button>
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
          <div style={{ fontSize: 22, fontWeight: 900 }}>1:1 Meetings</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            Schedule meetings and keep structured notes + action items.
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
          gridTemplateColumns: canManage ? "1.2fr 1fr 1fr auto" : "1fr 1fr auto",
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
              {(chatters || [])
                .filter((c: any) => c.role === "chatter")
                .map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Start date</div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>End date</div>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => {
            setStartDate("");
            setEndDate("");
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            cursor: "pointer",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          Clear
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Upcoming</div>
        {token && canManage ? (
          filteredUpcoming.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {filteredUpcoming.map((m: any) => (
                <MeetingCard
                  key={m.id}
                  meeting={m as MeetingCardMeeting}
                  chatter={chatterById[m.chatterId]}
                  compact
                />
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
              No upcoming meetings.
            </div>
          )
        ) : (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            Upcoming meetings are available for supervisors.
          </div>
        )}
      </div>

      <div style={{ marginTop: 22 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Past Meetings (notes preview)</div>
        {!token ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            Please log in to view meetings.
          </div>
        ) : meetingsForChatter === undefined ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
        ) : filteredHistory.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {filteredHistory.map((m: any) => (
              <MeetingCard
                key={m.id}
                meeting={m as MeetingCardMeeting}
                chatter={chatterById[m.chatterId]}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
            No past meetings in this range.
          </div>
        )}
      </div>

      <MeetingScheduler
        open={showScheduler}
        onClose={() => setShowScheduler(false)}
        token={token}
        chatters={(chatters || []) as any}
        defaultChatterId={selectedChatterId || undefined}
        onScheduled={() => {
          // Convex queries will re-run automatically; no-op.
        }}
      />
    </div>
  );
}
