"use client";

import { useMemo, useState } from "react";
import type { MeetingActionItem } from "./MeetingCard";

function generateLocalId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function dateToInputValue(ts?: number): string {
  if (!ts) return "";
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inputValueToTimestamp(value: string): number | undefined {
  if (!value) return undefined;
  // Use local noon to avoid TZ edge cases.
  const d = new Date(value + "T12:00:00");
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

export default function ActionItemList({
  items,
  onChange,
  disabled,
}: {
  items: MeetingActionItem[];
  onChange: (next: MeetingActionItem[]) => void;
  disabled?: boolean;
}) {
  const [newItemText, setNewItemText] = useState("");
  const [newAssignee, setNewAssignee] = useState<"chatter" | "supervisor">("chatter");
  const [newDueDate, setNewDueDate] = useState("");

  const pendingCount = useMemo(() => items.filter((i) => !i.completed).length, [items]);

  const updateItem = (id: string, patch: Partial<MeetingActionItem>) => {
    onChange(items.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((i) => i.id !== id));
  };

  const addItem = () => {
    const text = newItemText.trim();
    if (!text) return;

    const dueTs = inputValueToTimestamp(newDueDate);
    const next: MeetingActionItem = {
      id: generateLocalId(),
      item: text,
      assignee: newAssignee,
      dueDate: dueTs,
      completed: false,
      completedAt: undefined,
    };

    onChange([...(items ?? []), next]);
    setNewItemText("");
    setNewAssignee("chatter");
    setNewDueDate("");
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 12,
        background: "var(--surface)",
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontWeight: 800 }}>Action Items</div>
        <div style={{ fontSize: 12, color: pendingCount ? "var(--orange)" : "var(--text-secondary)" }}>
          {pendingCount} pending / {items.length} total
        </div>
      </div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        {items.length === 0 ? (
          <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>No action items yet.</div>
        ) : null}

        {items.map((it) => {
          const due = dateToInputValue(it.dueDate);
          return (
            <div
              key={it.id}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 140px 140px 80px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={it.completed}
                disabled={disabled}
                onChange={(e) =>
                  updateItem(it.id, {
                    completed: e.target.checked,
                    completedAt: e.target.checked ? Date.now() : undefined,
                  })
                }
              />

              <input
                value={it.item}
                disabled={disabled}
                onChange={(e) => updateItem(it.id, { item: e.target.value })}
                placeholder="Action item"
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: disabled ? "var(--bg)" : "var(--surface)",
                }}
              />

              <select
                value={it.assignee}
                disabled={disabled}
                onChange={(e) => updateItem(it.id, { assignee: e.target.value as any })}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: disabled ? "var(--bg)" : "var(--surface)",
                }}
              >
                <option value="chatter">Chatter</option>
                <option value="supervisor">Supervisor</option>
              </select>

              <input
                type="date"
                value={due}
                disabled={disabled}
                onChange={(e) => updateItem(it.id, { dueDate: inputValueToTimestamp(e.target.value) })}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: disabled ? "var(--bg)" : "var(--surface)",
                }}
              />

              <button
                type="button"
                disabled={disabled}
                onClick={() => removeItem(it.id)}
                style={{
                  padding: "10px 10px",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  cursor: disabled ? "not-allowed" : "pointer",
                  color: "var(--red)",
                }}
              >
                Remove
              </button>
            </div>
          );
        })}

        <div
          style={{
            height: 1,
            background: "var(--border)",
            margin: "6px 0",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 140px 140px 80px",
            gap: 10,
            alignItems: "center",
          }}
        >
          <input
            value={newItemText}
            disabled={disabled}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="New action item…"
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: disabled ? "var(--bg)" : "var(--surface)",
            }}
          />

          <select
            value={newAssignee}
            disabled={disabled}
            onChange={(e) => setNewAssignee(e.target.value as any)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: disabled ? "var(--bg)" : "var(--surface)",
            }}
          >
            <option value="chatter">Chatter</option>
            <option value="supervisor">Supervisor</option>
          </select>

          <input
            type="date"
            value={newDueDate}
            disabled={disabled}
            onChange={(e) => setNewDueDate(e.target.value)}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: disabled ? "var(--bg)" : "var(--surface)",
            }}
          />

          <button
            type="button"
            disabled={disabled}
            onClick={addItem}
            style={{
              padding: "10px 10px",
              borderRadius: 10,
              border: "1px solid var(--border)",
              background: disabled ? "var(--bg)" : "var(--accent)",
              color: disabled ? "var(--text-muted)" : "white",
              cursor: disabled ? "not-allowed" : "pointer",
              fontWeight: 700,
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
