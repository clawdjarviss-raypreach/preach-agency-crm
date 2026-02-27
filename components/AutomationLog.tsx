"use client";

import { useState, useEffect } from "react";
import { getActionEmoji, getActionColor } from "../lib/automation-engine";

interface LogEntry {
  _id: string;
  ruleId: string;
  ruleType: string;
  ruleName: string;
  triggeredAt: number;
  messageId?: string;
  chatterId?: string;
  chatterName?: string;
  fromCreatorId?: string;
  fromCreatorName?: string;
  toCreatorId?: string;
  toCreatorName?: string;
  action: string;
  reason: string;
  metadata?: Record<string, any>;
}

interface Props {
  token: string;
  limit?: number;
  ruleType?: string;
}

export default function AutomationLog({ token, limit = 50, ruleType }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", limit.toString());
      if (ruleType) params.set("ruleType", ruleType);

      const res = await fetch(`/api/automation/log?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch logs");
      }

      const data = await res.json();
      setLogs(data.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchLogs();
    }
  }, [token, limit, ruleType]);

  const containerStyle: React.CSSProperties = {
    background: "var(--surface)",
    borderRadius: "16px",
    padding: "20px",
    overflow: "hidden",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "16px",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: "12px",
    fontWeight: 600,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    borderBottom: "1px solid var(--border)",
  };

  const tdStyle: React.CSSProperties = {
    padding: "12px",
    fontSize: "14px",
    color: "var(--text)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "top",
  };

  const getActionBadgeStyle = (action: string): React.CSSProperties => {
    const color = getActionColor(action);
    const colors: Record<string, { bg: string; text: string }> = {
      green: { bg: "rgba(34, 197, 94, 0.15)", text: "#22c55e" },
      orange: { bg: "rgba(249, 115, 22, 0.15)", text: "#f97316" },
      blue: { bg: "rgba(59, 130, 246, 0.15)", text: "#3b82f6" },
      gray: { bg: "rgba(107, 114, 128, 0.15)", text: "#6b7280" },
    };
    const c = colors[color] || colors.gray;

    return {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderRadius: "6px",
      fontSize: "12px",
      fontWeight: 500,
      background: c.bg,
      color: c.text,
    };
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
          ⏳ Loading automation log...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: "center", padding: "40px", color: "var(--error)" }}>
          ❌ {error}
          <br />
          <button
            onClick={fetchLogs}
            style={{
              marginTop: "12px",
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: "var(--accent)",
              color: "white",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text)", margin: 0 }}>
          📋 Automation Log
        </h3>
        <button
          onClick={fetchLogs}
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
          🔄 Refresh
        </button>
      </div>

      {logs.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "40px",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📭</div>
          <p>No automation events yet</p>
          <p style={{ fontSize: "13px", marginTop: "8px" }}>
            Events will appear here when automation rules trigger actions
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Time</th>
                <th style={thStyle}>Action</th>
                <th style={thStyle}>Rule</th>
                <th style={thStyle}>Details</th>
                <th style={thStyle}>Reason</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td style={tdStyle}>
                    <div style={{ whiteSpace: "nowrap" }}>{formatTime(log.triggeredAt)}</div>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                      {new Date(log.triggeredAt).toLocaleTimeString()}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span style={getActionBadgeStyle(log.action)}>
                      {getActionEmoji(log.action)} {log.action}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{log.ruleName}</div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {log.ruleType}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    {log.chatterName && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>Chatter:</span>{" "}
                        {log.chatterName}
                      </div>
                    )}
                    {log.fromCreatorName && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>From:</span>{" "}
                        {log.fromCreatorName}
                      </div>
                    )}
                    {log.toCreatorName && (
                      <div>
                        <span style={{ color: "var(--text-muted)" }}>To:</span> {log.toCreatorName}
                      </div>
                    )}
                    {log.messageId && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                        Message: {log.messageId.slice(0, 8)}...
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ maxWidth: "250px" }}>{log.reason}</div>
                    {log.metadata && (
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "4px" }}>
                        {Object.entries(log.metadata)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(" • ")}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
