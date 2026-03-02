"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type TrainingAssignerMaterialOption = {
  id: string;
  title: string;
  type?: string;
  category?: string;
};

export type TrainingAssignerChatterOption = {
  id: string;
  name: string;
  role?: string;
  avatarEmoji?: string;
};

type Priority = "required" | "recommended" | "optional";

function parseDateToTsEndOfDay(dateStr: string): number | undefined {
  const trimmed = dateStr.trim();
  if (!trimmed) return undefined;
  const d = new Date(`${trimmed}T23:59:59`);
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export default function TrainingAssigner({
  open,
  token,
  materials,
  chatters,
  defaultMaterialIds,
  onClose,
  onAssigned,
}: {
  open: boolean;
  token: string;
  materials: TrainingAssignerMaterialOption[];
  chatters: TrainingAssignerChatterOption[];
  defaultMaterialIds?: string[];
  onClose: () => void;
  onAssigned?: () => void;
}) {
  const chatterOptions = useMemo(() => {
    return (chatters || []).filter((c) => c.role === "chatter" || !c.role);
  }, [chatters]);

  const [selectedMaterialIds, setSelectedMaterialIds] = useState<string[]>(defaultMaterialIds ?? []);
  const [assignAllChatters, setAssignAllChatters] = useState(false);
  const [selectedChatterIds, setSelectedChatterIds] = useState<string[]>([]);
  const [priority, setPriority] = useState<Priority>("required");
  const [dueDate, setDueDate] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string>("");

  if (!open) return null;

  const dueTs = parseDateToTsEndOfDay(dueDate);

  const effectiveChatterIds = assignAllChatters
    ? chatterOptions.map((c) => c.id)
    : selectedChatterIds;

  const totalOps = selectedMaterialIds.length * effectiveChatterIds.length;

  const doAssign = async () => {
    if (!token) return;
    setError("");

    if (selectedMaterialIds.length === 0) {
      setError("Select at least one material.");
      return;
    }

    if (effectiveChatterIds.length === 0) {
      setError("Select at least one chatter (or choose All).");
      return;
    }

    setBusy(true);
    setProgress("Starting…");

    try {
      let done = 0;
      for (const materialId of selectedMaterialIds) {
        for (const chatterId of effectiveChatterIds) {
          done += 1;
          setProgress(`Assigning ${done}/${totalOps}…`);
          const { error: insertError } = await supabase.from("crm_training_assignments").insert({
            chatter_id: chatterId,
            material_id: materialId,
            priority,
            due_date: dueTs ?? null,
            reason: reason.trim() ? reason.trim() : null,
          });
          if (insertError) throw new Error(insertError.message);
        }
      }

      setProgress("Done.");
      onAssigned?.();
      onClose();
    } catch (e: any) {
      console.error(e);
      setError(e?.message ? String(e.message) : "Failed to assign training.");
    } finally {
      setBusy(false);
      setTimeout(() => setProgress(""), 1200);
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
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        style={{
          width: "min(900px, 100%)",
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>📚 Bulk Assign Training</div>
            <div style={{ marginTop: 4, color: "var(--text-secondary)", fontSize: 13 }}>
              Assign one or more materials to one or more chatters.
            </div>
          </div>
          <button
            onClick={onClose}
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
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Materials</div>
            <select
              multiple
              value={selectedMaterialIds}
              onChange={(e) => {
                const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                setSelectedMaterialIds(next);
              }}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                minHeight: 170,
              }}
            >
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              Tip: hold ⌘/Ctrl to multi-select.
            </div>
          </label>

          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                type="checkbox"
                checked={assignAllChatters}
                onChange={(e) => setAssignAllChatters(e.target.checked)}
                disabled={busy}
              />
              <span style={{ fontWeight: 800 }}>Assign to all chatters</span>
            </label>

            <label style={{ display: "grid", gap: 6, opacity: assignAllChatters ? 0.6 : 1 }}>
              <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Chatters</div>
              <select
                multiple
                value={selectedChatterIds}
                disabled={busy || assignAllChatters}
                onChange={(e) => {
                  const next = Array.from(e.target.selectedOptions).map((o) => o.value);
                  setSelectedChatterIds(next);
                }}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  minHeight: 170,
                }}
              >
                {chatterOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.avatarEmoji ? `${c.avatarEmoji} ` : ""}{c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Priority</div>
            <select
              value={priority}
              disabled={busy}
              onChange={(e) => setPriority(e.target.value as Priority)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <option value="required">Required</option>
              <option value="recommended">Recommended</option>
              <option value="optional">Optional</option>
            </select>
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Due date</div>
            <input
              type="date"
              value={dueDate}
              disabled={busy}
              onChange={(e) => setDueDate(e.target.value)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Reason (optional)</div>
            <input
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Onboarding requirement"
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            />
          </label>
        </div>

        {error ? (
          <div
            style={{
              marginTop: 12,
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

        {progress ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text-secondary)" }}>{progress}</div>
        ) : null}

        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={onClose}
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
            onClick={doAssign}
            disabled={busy || totalOps === 0}
            style={{
              padding: "10px 12px",
              background: "var(--accent)",
              color: "white",
              border: "1px solid var(--border)",
              borderRadius: 10,
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy || totalOps === 0 ? 0.7 : 1,
            }}
          >
            Assign {totalOps > 0 ? `(${totalOps})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
