"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import ActionItemList from "../../../../../components/ActionItemList";
import type { MeetingActionItem } from "../../../../../components/MeetingCard";

type CrmUser = {
  id: string;
  name: string;
  username: string;
  role: string;
};

function isSupervisorRole(role?: string) {
  return role === "admin" || role === "manager" || role === "supervisor";
}

function toDateTimeLocalValue(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function toDateInputValue(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function fromDateInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(value + "T12:00:00");
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export default function MeetingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const meetingId = params.id as string;

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable fields
  const [meetingDateTime, setMeetingDateTime] = useState<string>("");
  const [meetingType, setMeetingType] = useState<string>("one_on_one");
  const [duration, setDuration] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [agenda, setAgenda] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [privateNotes, setPrivateNotes] = useState<string>("");
  const [actionItems, setActionItems] = useState<MeetingActionItem[]>([]);
  const [followUpEnabled, setFollowUpEnabled] = useState<boolean>(false);
  const [followUpDate, setFollowUpDate] = useState<string>("");
  const [followUpNotes, setFollowUpNotes] = useState<string>("");
  const [followUpCompletedLocal, setFollowUpCompletedLocal] = useState<boolean>(false);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const meeting = useQuery(
    api.crm.coaching.getMeetingById,
    token && meetingId ? { token, meetingId: meetingId as Id<"crm_coaching_meetings"> } : "skip"
  ) as any | null | undefined;

  const canManage = isSupervisorRole(user?.role);
  const chatters = useQuery(api.crm.chatters.list, token && canManage ? { token } : "skip");

  const chatterName = useMemo(() => {
    if (!meeting) return "";
    const chatter = (chatters || []).find((c: any) => c.id === meeting.chatterId);
    return chatter?.name ?? meeting.chatterId;
  }, [chatters, meeting]);

  const updateMeeting = useMutation(api.crm.coaching.updateMeeting);
  const completeMeeting = useMutation(api.crm.coaching.completeMeeting);

  useEffect(() => {
    if (!meeting || initialized) return;

    setMeetingDateTime(toDateTimeLocalValue(meeting.meetingDate));
    setMeetingType(meeting.meetingType);
    setDuration(meeting.duration ? String(meeting.duration) : "");
    setLocation(meeting.location ?? "");
    setAgenda(meeting.agenda ?? "");
    setNotes(meeting.notes ?? "");
    setPrivateNotes(meeting.privateNotes ?? "");
    setActionItems((meeting.actionItems ?? []) as MeetingActionItem[]);

    const fuEnabled = Boolean(meeting.followUpDate) && !Boolean(meeting.followUpCompleted);
    setFollowUpEnabled(fuEnabled);
    setFollowUpDate(toDateInputValue(meeting.followUpDate));
    setFollowUpNotes(meeting.followUpNotes ?? "");
    setFollowUpCompletedLocal(Boolean(meeting.followUpCompleted));

    setInitialized(true);
  }, [meeting, initialized]);

  const save = async () => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing auth token.");
      return;
    }
    if (!meetingId) {
      setError("Missing meeting id.");
      return;
    }

    const meetingDateTs = new Date(meetingDateTime).getTime();
    if (!Number.isFinite(meetingDateTs)) {
      setError("Please choose a valid meeting date/time.");
      return;
    }

    const durationNum = duration.trim() ? Number(duration) : undefined;
    if (durationNum !== undefined && (!Number.isFinite(durationNum) || durationNum < 0)) {
      setError("Duration must be a number of minutes.");
      return;
    }

    setSaving(true);
    try {
      await updateMeeting({
        token,
        meetingId: meetingId as Id<"crm_coaching_meetings">,
        meetingDate: meetingDateTs,
        meetingType: meetingType as any,
        duration: durationNum,
        location: location.trim() ? location.trim() : undefined,
        agenda: agenda.trim() ? agenda.trim() : undefined,
        notes,
        privateNotes: privateNotes.trim() ? privateNotes.trim() : undefined,
        actionItems,
        followUpDate: followUpEnabled ? fromDateInputValue(followUpDate) : undefined,
        followUpNotes: followUpNotes.trim() ? followUpNotes.trim() : undefined,
      });

      setSuccess("Saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const markComplete = async () => {
    setError("");
    setSuccess("");

    if (!token) {
      setError("Missing auth token.");
      return;
    }

    setCompleting(true);
    try {
      await completeMeeting({
        token,
        meetingId: meetingId as Id<"crm_coaching_meetings">,
        followUpNotes: followUpNotes.trim() ? followUpNotes.trim() : undefined,
      });
      setSuccess("Meeting marked complete.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to complete meeting");
    } finally {
      setCompleting(false);
    }
  };

  const followUpCompleted = Boolean(meeting?.followUpCompleted);

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Meeting</div>
          <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
            {chatterName ? `Attendee: ${chatterName}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            onClick={() => router.push("/coaching/meetings")}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !initialized}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: saving ? "var(--bg)" : "var(--accent)",
              color: saving ? "var(--text-muted)" : "white",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={markComplete}
            disabled={completing || followUpCompleted}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: followUpCompleted ? "var(--bg)" : "var(--green)",
              color: followUpCompleted ? "var(--text-muted)" : "white",
              cursor: completing || followUpCompleted ? "not-allowed" : "pointer",
              fontWeight: 800,
            }}
          >
            {followUpCompleted ? "Completed" : completing ? "Completing…" : "Complete Meeting"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
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
            marginTop: 14,
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

      {meeting === undefined ? (
        <div style={{ marginTop: 16, color: "var(--text-secondary)", fontSize: 13 }}>Loading…</div>
      ) : meeting === null ? (
        <div style={{ marginTop: 16, color: "var(--text-secondary)", fontSize: 13 }}>
          Meeting not found.
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "grid", gap: 14 }}>
          <div
            style={{
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 10 }}>Metadata</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Date & Time</div>
                <input
                  type="datetime-local"
                  value={meetingDateTime}
                  onChange={(e) => setMeetingDateTime(e.target.value)}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Meeting Type</div>
                <select
                  value={meetingType}
                  onChange={(e) => setMeetingType(e.target.value)}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <option value="one_on_one">1:1</option>
                  <option value="performance_review">Performance Review</option>
                  <option value="pip_checkin">PIP Check-in</option>
                  <option value="onboarding">Onboarding</option>
                  <option value="exit_interview">Exit Interview</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Duration (minutes)</div>
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  placeholder="e.g. 30"
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Location</div>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder='e.g. "Zoom"'
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <label style={{ display: "grid", gap: 6 }}>
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Agenda</div>
                <textarea
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  rows={3}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="checkbox"
                  checked={followUpEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setFollowUpEnabled(next);
                    if (!next) {
                      setFollowUpDate("");
                    } else if (!followUpDate) {
                      const d = new Date();
                      d.setDate(d.getDate() + 7);
                      setFollowUpDate(toDateInputValue(d.getTime()));
                    }
                  }}
                />
                <div>
                  <div style={{ fontWeight: 800 }}>Follow-up reminder</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Set a follow-up date and notes.
                  </div>
                </div>
              </label>

              {followUpEnabled ? (
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "220px 1fr", gap: 12 }}>
                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Follow-up date</div>
                    <input
                      type="date"
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      style={{
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: 6 }}>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Follow-up notes</div>
                    <input
                      value={followUpNotes}
                      onChange={(e) => setFollowUpNotes(e.target.value)}
                      placeholder="Optional"
                      style={{
                        padding: "10px 10px",
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "var(--surface)",
                      }}
                    />
                  </label>
                </div>
              ) : null}

              <div style={{ marginTop: 10, fontSize: 12, color: followUpCompleted ? "var(--green)" : "var(--text-secondary)" }}>
                Status: {followUpCompleted ? "Completed" : "Scheduled"}
              </div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 14 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Notes (Markdown)</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                placeholder="Write meeting notes…"
                style={{
                  width: "100%",
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  resize: "vertical",
                }}
              />
              <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-secondary)" }}>
                Tip: Use bullet points, headers, and checklists.
              </div>
            </div>

            {canManage ? (
              <div
                style={{
                  padding: 14,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Private Notes (Supervisor only)</div>
                <textarea
                  value={privateNotes}
                  onChange={(e) => setPrivateNotes(e.target.value)}
                  rows={6}
                  placeholder="Visible only to supervisors…"
                  style={{
                    width: "100%",
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    resize: "vertical",
                  }}
                />
              </div>
            ) : null}

            <ActionItemList
              items={actionItems}
              onChange={(next) => {
                setActionItems(next);
                setSuccess("");
              }}
              disabled={!canManage && Boolean(user)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
