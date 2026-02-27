"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

type ChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

type Recurring = "none" | "weekly" | "biweekly";

type MeetingType =
  | "one_on_one"
  | "performance_review"
  | "pip_checkin"
  | "onboarding"
  | "exit_interview";

function toDateTimeLocalValue(ts: number) {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function MeetingScheduler({
  open,
  onClose,
  token,
  chatters,
  defaultChatterId,
  onScheduled,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  chatters: ChatterOption[];
  defaultChatterId?: string;
  onScheduled?: () => void;
}) {
  const createMeeting = useMutation(api.crm.coaching.createMeeting);

  const chatterOptions = useMemo(() => {
    // Most deployments treat 1:1 attendees as chatters.
    const opts = chatters.filter((c) => (c.role ? c.role === "chatter" : true));
    return opts.length ? opts : chatters;
  }, [chatters]);

  const [chatterId, setChatterId] = useState<string>(defaultChatterId ?? "");
  const [meetingType, setMeetingType] = useState<MeetingType>("one_on_one");
  const [meetingDateTime, setMeetingDateTime] = useState<string>(
    toDateTimeLocalValue(Date.now() + 60 * 60 * 1000)
  );
  const [duration, setDuration] = useState<string>("30");
  const [location, setLocation] = useState<string>("");
  const [agenda, setAgenda] = useState<string>("");
  const [recurring, setRecurring] = useState<Recurring>("none");
  const [occurrences, setOccurrences] = useState<string>("4");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setSuccess("");
    setChatterId(defaultChatterId ?? "");
    setMeetingType("one_on_one");
    setMeetingDateTime(toDateTimeLocalValue(Date.now() + 60 * 60 * 1000));
    setDuration("30");
    setLocation("");
    setAgenda("");
    setRecurring("none");
    setOccurrences("4");
  }, [open, defaultChatterId]);

  if (!open) return null;

  const submit = async () => {
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

    const baseTs = new Date(meetingDateTime).getTime();
    if (!Number.isFinite(baseTs)) {
      setError("Please choose a valid date/time.");
      return;
    }

    const durationNum = duration.trim() ? Number(duration) : undefined;
    if (durationNum !== undefined && (!Number.isFinite(durationNum) || durationNum < 0)) {
      setError("Duration must be a number of minutes.");
      return;
    }

    const reps = Math.max(1, Math.min(24, Number(occurrences) || 1));
    const stepDays = recurring === "weekly" ? 7 : recurring === "biweekly" ? 14 : 0;
    const count = recurring === "none" ? 1 : reps;

    setSaving(true);
    try {
      for (let i = 0; i < count; i++) {
        const ts = baseTs + i * stepDays * 24 * 60 * 60 * 1000;
        await createMeeting({
          token,
          chatterId: chatterId as Id<"crm_chatters">,
          meetingDate: ts,
          meetingType,
          duration: durationNum,
          location: location.trim() ? location.trim() : undefined,
          agenda: agenda.trim() ? agenda.trim() : undefined,
          notes: "", // Notes can be filled in after the meeting.
        });
      }

      setSuccess(count === 1 ? "Meeting scheduled." : `Scheduled ${count} meetings.`);
      onScheduled?.();
      // Close after a tiny delay so user sees confirmation.
      setTimeout(() => onClose(), 400);
    } catch (e: any) {
      setError(e?.message ?? "Failed to schedule meeting");
    } finally {
      setSaving(false);
    }
  };

  return (
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
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          background: "var(--surface)",
          borderRadius: 14,
          border: "1px solid var(--border)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.18)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Schedule 1:1 Meeting</div>
            <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>
              Create a new coaching meeting.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 16, display: "grid", gap: 12 }}>
          {error ? (
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
              {error}
            </div>
          ) : null}
          {success ? (
            <div
              style={{
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
              <select
                value={chatterId}
                onChange={(e) => setChatterId(e.target.value)}
                disabled={saving}
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

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Meeting Type</div>
              <select
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value as MeetingType)}
                disabled={saving}
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
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Date & Time</div>
              <input
                type="datetime-local"
                value={meetingDateTime}
                onChange={(e) => setMeetingDateTime(e.target.value)}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Duration (minutes)</div>
              <select
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <option value="15">15</option>
                <option value="30">30</option>
                <option value="45">45</option>
                <option value="60">60</option>
                <option value="90">90</option>
              </select>
            </label>
          </div>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Location</div>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={saving}
              placeholder='e.g. "Zoom", "Slack Call"'
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Agenda</div>
            <textarea
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              disabled={saving}
              placeholder="What do you want to cover?"
              rows={4}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                resize: "vertical",
              }}
            />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Recurring</div>
              <select
                value={recurring}
                onChange={(e) => setRecurring(e.target.value as Recurring)}
                disabled={saving}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              >
                <option value="none">No repeat</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
              </select>
            </label>

            <label style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Occurrences</div>
              <input
                type="number"
                min={1}
                max={24}
                value={occurrences}
                onChange={(e) => setOccurrences(e.target.value)}
                disabled={saving || recurring === "none"}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: recurring === "none" ? "var(--bg)" : "var(--surface)",
                }}
              />
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                cursor: saving ? "not-allowed" : "pointer",
                fontWeight: 700,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
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
              {saving ? "Scheduling…" : "Schedule"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
