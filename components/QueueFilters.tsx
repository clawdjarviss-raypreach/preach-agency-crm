"use client";

import React from "react";

export type QueueStatusFilter = "pending" | "in_progress" | "escalated" | "responded";
export type QueuePriorityFilter = "critical" | "high" | "normal" | "low";

export type QueueFiltersState = {
  statuses: QueueStatusFilter[];
  priorities: QueuePriorityFilter[];
  creatorId: string | "all";
  chatterId: string | "all";
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

type CreatorOption = { id: string; name: string };
type ChatterOption = { id: string; name: string };

function toggleInList<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function labelForStatus(s: QueueStatusFilter): string {
  switch (s) {
    case "pending":
      return "Pending";
    case "in_progress":
      return "In Progress";
    case "escalated":
      return "Escalated";
    case "responded":
      return "Responded";
    default:
      return s;
  }
}

function labelForPriority(p: QueuePriorityFilter): string {
  switch (p) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "normal":
      return "Normal";
    case "low":
      return "Low";
    default:
      return p;
  }
}

export default function QueueFilters({
  value,
  creators,
  chatters,
  onChange,
  onReset,
}: {
  value: QueueFiltersState;
  creators: CreatorOption[];
  chatters: ChatterOption[];
  onChange: (next: QueueFiltersState) => void;
  onReset: () => void;
}) {
  const boxStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 16,
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 14,
  };

  const rowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 12,
    alignItems: "end",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "var(--text-muted)",
    fontWeight: 700,
    marginBottom: 6,
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    color: "var(--text)",
    fontSize: 14,
  };

  const pillWrap: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "8px 10px",
    borderRadius: 999,
    border: active ? "1px solid var(--accent)" : "1px solid var(--border)",
    background: active ? "rgba(59, 130, 246, 0.10)" : "transparent",
    color: active ? "var(--text)" : "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    userSelect: "none",
  });

  const sectionTitleStyle: React.CSSProperties = {
    fontSize: 13,
    color: "var(--text)",
    fontWeight: 800,
    margin: 0,
  };

  return (
    <div style={boxStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={sectionTitleStyle}>Filters</p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
            Status + priority multi-select, creator/chatter, date range
          </p>
        </div>

        <button
          onClick={onReset}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text)",
            cursor: "pointer",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          Reset
        </button>
      </div>

      <div>
        <div style={labelStyle}>Status</div>
        <div style={pillWrap}>
          {(["pending", "in_progress", "escalated", "responded"] as QueueStatusFilter[]).map(
            (s) => (
              <div
                key={s}
                role="button"
                tabIndex={0}
                onClick={() => onChange({ ...value, statuses: toggleInList(value.statuses, s) })}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChange({ ...value, statuses: toggleInList(value.statuses, s) });
                  }
                }}
                style={pillStyle(value.statuses.includes(s))}
                aria-pressed={value.statuses.includes(s)}
                title="Toggle status"
              >
                {labelForStatus(s)}
              </div>
            )
          )}
        </div>
      </div>

      <div>
        <div style={labelStyle}>Priority</div>
        <div style={pillWrap}>
          {(["critical", "high", "normal", "low"] as QueuePriorityFilter[]).map((p) => (
            <div
              key={p}
              role="button"
              tabIndex={0}
              onClick={() => onChange({ ...value, priorities: toggleInList(value.priorities, p) })}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onChange({ ...value, priorities: toggleInList(value.priorities, p) });
                }
              }}
              style={pillStyle(value.priorities.includes(p))}
              aria-pressed={value.priorities.includes(p)}
              title="Toggle priority"
            >
              {labelForPriority(p)}
            </div>
          ))}
        </div>
      </div>

      <div style={rowStyle}>
        <div>
          <div style={labelStyle}>Creator</div>
          <select
            value={value.creatorId}
            onChange={(e) => onChange({ ...value, creatorId: e.target.value as any })}
            style={inputStyle}
          >
            <option value="all">All creators</option>
            {creators.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={labelStyle}>Chatter</div>
          <select
            value={value.chatterId}
            onChange={(e) => onChange({ ...value, chatterId: e.target.value as any })}
            style={inputStyle}
          >
            <option value="all">All chatters</option>
            {chatters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={labelStyle}>Start date</div>
          <input
            type="date"
            value={value.startDate}
            onChange={(e) => onChange({ ...value, startDate: e.target.value })}
            style={inputStyle}
          />
        </div>

        <div>
          <div style={labelStyle}>End date</div>
          <input
            type="date"
            value={value.endDate}
            onChange={(e) => onChange({ ...value, endDate: e.target.value })}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}
