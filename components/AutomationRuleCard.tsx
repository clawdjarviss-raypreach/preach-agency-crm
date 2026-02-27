"use client";

import { useState } from "react";
import {
  getRuleTypeEmoji,
  getRuleTypeDescription,
  formatThreshold,
  type RuleType,
} from "../lib/automation-engine";

interface RuleConfig {
  thresholdMinutes?: number;
  targetRole?: string;
  excludeCreatorIds?: string[];
  segments?: string[];
  roundRobin?: boolean;
  priorityMetric?: string;
}

interface AutomationRule {
  _id: string;
  type: RuleType;
  name: string;
  enabled: boolean;
  config: RuleConfig;
  updatedAt: number;
  updatedByName?: string;
}

interface Props {
  rule: AutomationRule;
  onToggle: (ruleId: string) => Promise<void>;
  onUpdate: (ruleId: string, updates: Partial<AutomationRule>) => Promise<void>;
  onDelete: (ruleId: string) => Promise<void>;
  isAdmin: boolean;
}

export default function AutomationRuleCard({
  rule,
  onToggle,
  onUpdate,
  onDelete,
  isAdmin,
}: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [editConfig, setEditConfig] = useState<RuleConfig>(rule.config);
  const [editName, setEditName] = useState(rule.name);

  const handleToggle = async () => {
    setIsLoading(true);
    try {
      await onToggle(rule._id);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      await onUpdate(rule._id, { name: editName, config: editConfig } as any);
      setIsEditing(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this automation rule?")) return;
    setIsLoading(true);
    try {
      await onDelete(rule._id);
    } finally {
      setIsLoading(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: "var(--surface)",
    borderRadius: "16px",
    padding: "20px",
    border: rule.enabled ? "2px solid var(--accent)" : "2px solid transparent",
    opacity: isLoading ? 0.7 : 1,
    transition: "all 0.2s ease",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  };

  const titleStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  };

  const toggleStyle: React.CSSProperties = {
    width: "48px",
    height: "26px",
    borderRadius: "13px",
    background: rule.enabled ? "var(--accent)" : "var(--muted)",
    position: "relative",
    cursor: isAdmin ? "pointer" : "not-allowed",
    transition: "background 0.2s ease",
    border: "none",
    padding: 0,
  };

  const toggleDotStyle: React.CSSProperties = {
    position: "absolute",
    top: "3px",
    left: rule.enabled ? "25px" : "3px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    background: "#2a2a2a",
    transition: "left 0.2s ease",
  };

  const configRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    marginBottom: "12px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-secondary)",
    minWidth: "100px",
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid var(--border)",
    background: "var(--background)",
    color: "var(--text)",
    fontSize: "14px",
    width: "120px",
  };

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    width: "150px",
  };

  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: 500,
    background: "var(--background)",
    color: "var(--text-secondary)",
  };

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div style={titleStyle}>
          <span style={{ fontSize: "24px" }}>{getRuleTypeEmoji(rule.type)}</span>
          <div>
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ ...inputStyle, width: "200px", fontWeight: 600 }}
              />
            ) : (
              <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", margin: 0 }}>
                {rule.name}
              </h3>
            )}
            <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "4px 0 0" }}>
              {getRuleTypeDescription(rule.type)}
            </p>
          </div>
        </div>

        <button
          style={toggleStyle}
          onClick={handleToggle}
          disabled={!isAdmin || isLoading}
          title={rule.enabled ? "Disable rule" : "Enable rule"}
        >
          <div style={toggleDotStyle} />
        </button>
      </div>

      {/* Config Section */}
      <div style={{ marginBottom: "16px" }}>
        {/* Escalation Config */}
        {rule.type === "escalation" && (
          <>
            <div style={configRowStyle}>
              <span style={labelStyle}>Threshold:</span>
              {isEditing ? (
                <input
                  type="number"
                  value={editConfig.thresholdMinutes || 30}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, thresholdMinutes: parseInt(e.target.value) })
                  }
                  style={inputStyle}
                  min={5}
                  max={240}
                />
              ) : (
                <span style={badgeStyle}>
                  ⏱️ {formatThreshold(rule.config.thresholdMinutes || 30)}
                </span>
              )}
            </div>
            <div style={configRowStyle}>
              <span style={labelStyle}>Escalate to:</span>
              {isEditing ? (
                <select
                  value={editConfig.targetRole || "supervisor"}
                  onChange={(e) => setEditConfig({ ...editConfig, targetRole: e.target.value })}
                  style={selectStyle}
                >
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                </select>
              ) : (
                <span style={badgeStyle}>👤 {rule.config.targetRole || "supervisor"}</span>
              )}
            </div>
            <div style={configRowStyle}>
              <span style={labelStyle}>Segments:</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(rule.config.segments || ["vip", "whale"]).map((seg) => (
                  <span key={seg} style={badgeStyle}>
                    {seg === "vip" ? "👑" : seg === "whale" ? "🐋" : "👤"} {seg}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Reassignment Config */}
        {rule.type === "reassignment" && (
          <>
            <div style={configRowStyle}>
              <span style={labelStyle}>Threshold:</span>
              {isEditing ? (
                <input
                  type="number"
                  value={editConfig.thresholdMinutes || 60}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, thresholdMinutes: parseInt(e.target.value) })
                  }
                  style={inputStyle}
                  min={15}
                  max={480}
                />
              ) : (
                <span style={badgeStyle}>
                  ⏱️ {formatThreshold(rule.config.thresholdMinutes || 60)}
                </span>
              )}
            </div>
            <div style={configRowStyle}>
              <span style={labelStyle}>Method:</span>
              {isEditing ? (
                <select
                  value={editConfig.roundRobin ? "round_robin" : "load_balanced"}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, roundRobin: e.target.value === "round_robin" })
                  }
                  style={selectStyle}
                >
                  <option value="round_robin">Round Robin</option>
                  <option value="load_balanced">Load Balanced</option>
                </select>
              ) : (
                <span style={badgeStyle}>
                  {rule.config.roundRobin ? "🔄 Round Robin" : "⚖️ Load Balanced"}
                </span>
              )}
            </div>
          </>
        )}

        {/* Smart Routing Config */}
        {rule.type === "smart_routing" && (
          <>
            <div style={configRowStyle}>
              <span style={labelStyle}>Priority:</span>
              {isEditing ? (
                <select
                  value={editConfig.priorityMetric || "response_time"}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, priorityMetric: e.target.value })
                  }
                  style={selectStyle}
                >
                  <option value="response_time">Response Time</option>
                  <option value="response_rate">Response Rate</option>
                  <option value="earnings">Earnings</option>
                </select>
              ) : (
                <span style={badgeStyle}>
                  📊{" "}
                  {rule.config.priorityMetric === "response_time"
                    ? "Response Time"
                    : rule.config.priorityMetric === "response_rate"
                      ? "Response Rate"
                      : "Earnings"}
                </span>
              )}
            </div>
            <div style={configRowStyle}>
              <span style={labelStyle}>Segments:</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {(rule.config.segments || ["vip", "whale"]).map((seg) => (
                  <span key={seg} style={badgeStyle}>
                    {seg === "vip" ? "👑" : seg === "whale" ? "🐋" : "👤"} {seg}
                  </span>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border)",
          paddingTop: "12px",
        }}
      >
        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          Updated {new Date(rule.updatedAt).toLocaleDateString()}
          {rule.updatedByName && ` by ${rule.updatedByName}`}
        </span>

        {isAdmin && (
          <div style={{ display: "flex", gap: "8px" }}>
            {isEditing ? (
              <>
                <button
                  onClick={() => {
                    setIsEditing(false);
                    setEditConfig(rule.config);
                    setEditName(rule.name);
                  }}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text-secondary)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "none",
                    background: "var(--accent)",
                    color: "white",
                    fontSize: "13px",
                    fontWeight: 500,
                    cursor: "pointer",
                  }}
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  ✏️ Edit
                </button>
                <button
                  onClick={handleDelete}
                  disabled={isLoading}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--error)",
                    background: "transparent",
                    color: "var(--error)",
                    fontSize: "13px",
                    cursor: "pointer",
                  }}
                >
                  🗑️ Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
