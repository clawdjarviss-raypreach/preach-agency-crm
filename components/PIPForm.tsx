"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export type PIPFormChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

type Visibility = "confidential" | "shared";

type RequirementDraft = { description: string; targetValue?: number };

type MilestoneDraft = { title: string; dueDate: string };

function parseDateToStartTs(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.getTime();
}

function parseDateToEndTs(dateStr: string): number {
  const d = new Date(`${dateStr}T23:59:59`);
  return d.getTime();
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function PIPForm({
  token,
  chatters,
  defaultChatterId,
  onCancel,
  onSaved,
}: {
  token: string;
  chatters: PIPFormChatterOption[];
  defaultChatterId: string;
  onCancel: () => void;
  onSaved: (pipId: string) => void;
}) {
  const createPip = useMutation(api.crm.coaching.createPip);

  const chatterOptions = useMemo(() => {
    return (chatters || []).filter((c) => c.role === "chatter" || !c.role);
  }, [chatters]);

  const [chatterId, setChatterId] = useState(defaultChatterId);
  const [title, setTitle] = useState("Performance Improvement Plan");
  const [reason, setReason] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("confidential");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());

  const [requirements, setRequirements] = useState<RequirementDraft[]>([
    { description: "" },
  ]);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([
    { title: "", dueDate: todayISO() },
  ]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");

  const submit = async () => {
    if (!token) return;
    setError("");

    if (!chatterId) {
      setError("Select a chatter.");
      return;
    }

    const t = title.trim();
    const r = reason.trim();

    if (!t) {
      setError("Title is required.");
      return;
    }
    if (!r) {
      setError("Reason/description is required.");
      return;
    }

    const startTs = parseDateToStartTs(startDate);
    const endTs = parseDateToEndTs(endDate);

    if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
      setError("Start/end dates are invalid.");
      return;
    }

    if (endTs < startTs) {
      setError("End date must be on/after start date.");
      return;
    }

    const cleanedRequirements = requirements
      .map((req) => ({
        description: req.description.trim(),
        targetValue: req.targetValue,
      }))
      .filter((req) => req.description.length > 0);

    const cleanedMilestones = milestones
      .map((m) => ({
        title: m.title.trim(),
        dueDate: m.dueDate,
      }))
      .filter((m) => m.title.length > 0 && m.dueDate.trim().length > 0)
      .map((m) => ({
        title: m.title,
        dueDate: parseDateToEndTs(m.dueDate),
      }))
      .filter((m) => Number.isFinite(m.dueDate));

    if (cleanedMilestones.length === 0) {
      setError("Add at least one milestone.");
      return;
    }

    setBusy(true);
    try {
      const pipId = await createPip({
        token,
        chatterId: chatterId as Id<"crm_chatters">,
        title: t,
        reason: r,
        startDate: startTs,
        endDate: endTs,
        requirements: cleanedRequirements,
        milestones: cleanedMilestones,
        visibility,
      } as any);

      onSaved(String(pipId));
    } catch (e: any) {
      console.error(e);
      setError(e?.message ? String(e.message) : "Failed to create PIP.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>📋 Create PIP</div>
          <div style={{ marginTop: 4, fontSize: 13, color: "var(--text-secondary)" }}>
            Draft a plan with milestones and measurable requirements.
          </div>
        </div>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            cursor: busy ? "not-allowed" : "pointer",
            fontWeight: 900,
          }}
        >
          ✕
        </button>
      </div>

      <div
        style={{
          marginTop: 14,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatter</div>
          <select
            value={chatterId}
            onChange={(e) => setChatterId(e.target.value)}
            disabled={busy}
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
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Visibility</div>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
            disabled={busy}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          >
            <option value="confidential">Confidential</option>
            <option value="shared">Shared</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Title</div>
          <input
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Start date</div>
          <input
            type="date"
            value={startDate}
            disabled={busy}
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
            disabled={busy}
            onChange={(e) => setEndDate(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
            }}
          />
        </label>

        <label style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Reason / Description</div>
          <textarea
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What needs to improve and why?"
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              minHeight: 100,
              resize: "vertical",
            }}
          />
        </label>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Requirements (optional)</div>
        <div style={{ display: "grid", gap: 10 }}>
          {requirements.map((req, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 150px 44px", gap: 10 }}>
              <input
                value={req.description}
                disabled={busy}
                onChange={(e) => {
                  const next = [...requirements];
                  next[idx] = { ...next[idx], description: e.target.value };
                  setRequirements(next);
                }}
                placeholder="Requirement description"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <input
                type="number"
                value={req.targetValue ?? ""}
                disabled={busy}
                onChange={(e) => {
                  const raw = e.target.value;
                  const nextVal = raw.trim() ? Number(raw) : undefined;
                  const next = [...requirements];
                  next[idx] = { ...next[idx], targetValue: Number.isFinite(nextVal as any) ? nextVal : undefined };
                  setRequirements(next);
                }}
                placeholder="Target (opt)"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <button
                onClick={() => {
                  const next = requirements.filter((_, i) => i !== idx);
                  setRequirements(next.length ? next : [{ description: "" }]);
                }}
                disabled={busy}
                title="Remove"
                style={{
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                −
              </button>
            </div>
          ))}
          <button
            onClick={() => setRequirements([...requirements, { description: "" }])}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 900,
              width: "fit-content",
            }}
          >
            + Add requirement
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
        <div style={{ fontWeight: 900 }}>Milestones</div>
        <div style={{ display: "grid", gap: 10 }}>
          {milestones.map((m, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 170px 44px", gap: 10 }}>
              <input
                value={m.title}
                disabled={busy}
                onChange={(e) => {
                  const next = [...milestones];
                  next[idx] = { ...next[idx], title: e.target.value };
                  setMilestones(next);
                }}
                placeholder="Milestone title"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <input
                type="date"
                value={m.dueDate}
                disabled={busy}
                onChange={(e) => {
                  const next = [...milestones];
                  next[idx] = { ...next[idx], dueDate: e.target.value };
                  setMilestones(next);
                }}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                }}
              />
              <button
                onClick={() => {
                  const next = milestones.filter((_, i) => i !== idx);
                  setMilestones(next.length ? next : [{ title: "", dueDate: todayISO() }]);
                }}
                disabled={busy}
                title="Remove"
                style={{
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--bg)",
                  cursor: busy ? "not-allowed" : "pointer",
                  fontWeight: 900,
                }}
              >
                −
              </button>
            </div>
          ))}
          <button
            onClick={() => setMilestones([...milestones, { title: "", dueDate: todayISO() }])}
            disabled={busy}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              cursor: busy ? "not-allowed" : "pointer",
              fontWeight: 900,
              width: "fit-content",
            }}
          >
            + Add milestone
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.08)",
            color: "var(--red)",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "10px 12px",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontWeight: 900,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy}
          style={{
            padding: "10px 12px",
            background: "var(--accent)",
            color: "white",
            border: "1px solid var(--border)",
            borderRadius: 10,
            fontWeight: 900,
            cursor: busy ? "not-allowed" : "pointer",
            opacity: busy ? 0.7 : 1,
          }}
        >
          Create PIP
        </button>
      </div>
    </div>
  );
}
