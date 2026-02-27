"use client";

import { useState, useEffect, useCallback } from "react";
import AutomationRuleCard from "../../../components/AutomationRuleCard";
import AutomationLog from "../../../components/AutomationLog";
import { getRuleTypeEmoji, type RuleType } from "../../../lib/automation-engine";

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

interface LogStats {
  total: number;
  byType: Record<string, number>;
  byDay: Record<string, number>;
  sinceDays: number;
}

export default function AutomationPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRuleType, setNewRuleType] = useState<RuleType>("escalation");
  const [newRuleName, setNewRuleName] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const fetchRules = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/automation/rules", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch rules");
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchRules();
    }
  }, [token, fetchRules]);

  const isAdmin = user && user.role === "admin";
  const isSupervisor = user && ["admin", "supervisor"].includes(user.role);

  const handleToggle = async (ruleId: string) => {
    try {
      const res = await fetch("/api/automation/rules", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ruleId }),
      });
      if (!res.ok) throw new Error("Failed to toggle rule");
      await fetchRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to toggle rule");
    }
  };

  const handleUpdate = async (ruleId: string, updates: Partial<AutomationRule>) => {
    try {
      const res = await fetch("/api/automation/rules", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ruleId, ...updates }),
      });
      if (!res.ok) throw new Error("Failed to update rule");
      await fetchRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update rule");
    }
  };

  const handleDelete = async (ruleId: string) => {
    try {
      const res = await fetch(`/api/automation/rules?ruleId=${ruleId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete rule");
      await fetchRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete rule");
    }
  };

  const handleCreateRule = async () => {
    if (!newRuleName.trim()) {
      alert("Please enter a rule name");
      return;
    }
    try {
      const res = await fetch("/api/automation/rules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: newRuleType,
          name: newRuleName,
          enabled: false,
          config: {},
        }),
      });
      if (!res.ok) throw new Error("Failed to create rule");
      setShowNewRule(false);
      setNewRuleName("");
      await fetchRules();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create rule");
    }
  };

  const handleRunNow = async () => {
    setIsRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/cron/run-automation", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRunResult(data);
    } catch (err) {
      setRunResult({ error: err instanceof Error ? err.message : "Failed to run automation" });
    } finally {
      setIsRunning(false);
    }
  };

  if (!user) {
    return (
      <div style={{ maxWidth: "1400px", padding: "24px" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⏳</div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            Loading...
          </h3>
        </div>
      </div>
    );
  }

  if (!isSupervisor) {
    return (
      <div style={{ maxWidth: "1400px", padding: "24px" }}>
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 24px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>
            Access Denied
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginTop: "8px" }}>
            Admin or supervisor access required to manage automation rules.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Header */}
      <div
        style={{
          marginBottom: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>
            ⚙️ Queue Automation
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Configure automated escalation, reassignment, and smart routing rules
          </p>
        </div>

        <div style={{ display: "flex", gap: "12px" }}>
          {isAdmin && (
            <button
              onClick={() => setShowNewRule(true)}
              style={{
                padding: "10px 16px",
                borderRadius: "10px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              ➕ New Rule
            </button>
          )}
          <button
            onClick={handleRunNow}
            disabled={isRunning}
            style={{
              padding: "10px 16px",
              borderRadius: "10px",
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text)",
              fontSize: "14px",
              fontWeight: 500,
              cursor: isRunning ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              opacity: isRunning ? 0.7 : 1,
            }}
          >
            {isRunning ? "⏳ Running..." : "▶️ Run Now"}
          </button>
        </div>
      </div>

      {/* Run Result */}
      {runResult && (
        <div
          style={{
            marginBottom: "24px",
            padding: "16px",
            borderRadius: "12px",
            background: runResult.error ? "rgba(239, 68, 68, 0.1)" : "rgba(34, 197, 94, 0.1)",
            border: `1px solid ${runResult.error ? "var(--error)" : "var(--success)"}`,
          }}
        >
          {runResult.error ? (
            <p style={{ color: "var(--error)", margin: 0 }}>❌ {runResult.error}</p>
          ) : (
            <>
              <p style={{ color: "var(--success)", margin: 0, fontWeight: 500 }}>
                ✅ Automation completed in {runResult.durationMs}ms
              </p>
              <p style={{ color: "var(--text-secondary)", margin: "8px 0 0", fontSize: "14px" }}>
                Rules evaluated: {runResult.rulesEvaluated} • Messages processed:{" "}
                {runResult.messagesProcessed} • Actions: {runResult.actionsExecuted}
              </p>
            </>
          )}
        </div>
      )}

      {/* New Rule Modal */}
      {showNewRule && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowNewRule(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "400px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: "18px", fontWeight: 600, margin: "0 0 20px" }}>
              ➕ Create New Rule
            </h3>

            <div style={{ marginBottom: "16px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Rule Type
              </label>
              <select
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value as RuleType)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              >
                <option value="escalation">{getRuleTypeEmoji("escalation")} Escalation</option>
                <option value="reassignment">{getRuleTypeEmoji("reassignment")} Reassignment</option>
                <option value="smart_routing">
                  {getRuleTypeEmoji("smart_routing")} Smart Routing
                </option>
              </select>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                  marginBottom: "6px",
                }}
              >
                Rule Name
              </label>
              <input
                type="text"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
                placeholder="e.g., VIP Escalation"
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "var(--background)",
                  color: "var(--text)",
                  fontSize: "14px",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowNewRule(false)}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateRule}
                style={{
                  padding: "10px 16px",
                  borderRadius: "8px",
                  border: "none",
                  background: "var(--accent)",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Create Rule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Summary */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        {[
          {
            label: "Total Rules",
            value: rules.length,
            emoji: "📋",
            color: "var(--text)",
          },
          {
            label: "Active",
            value: rules.filter((r) => r.enabled).length,
            emoji: "✅",
            color: "var(--success)",
          },
          {
            label: "Escalation",
            value: rules.filter((r) => r.type === "escalation").length,
            emoji: "🚨",
            color: "#f97316",
          },
          {
            label: "Reassignment",
            value: rules.filter((r) => r.type === "reassignment").length,
            emoji: "🔄",
            color: "#3b82f6",
          },
          {
            label: "Smart Routing",
            value: rules.filter((r) => r.type === "smart_routing").length,
            emoji: "🎯",
            color: "#22c55e",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            style={{
              background: "var(--surface)",
              borderRadius: "12px",
              padding: "16px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>{stat.emoji}</div>
            <div style={{ fontSize: "24px", fontWeight: 700, color: stat.color }}>
              {stat.value}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Rules Grid */}
      {isLoading ? (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "16px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          ⏳ Loading rules...
        </div>
      ) : error ? (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "16px",
            padding: "48px",
            textAlign: "center",
            color: "var(--error)",
          }}
        >
          ❌ {error}
          <br />
          <button
            onClick={fetchRules}
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
      ) : rules.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "16px",
            padding: "48px",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📭</div>
          <h3 style={{ fontSize: "18px", fontWeight: 600, color: "var(--text)", margin: 0 }}>
            No automation rules yet
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-muted)", margin: "8px 0 0" }}>
            Create your first rule to automate queue management
          </p>
          {isAdmin && (
            <button
              onClick={() => setShowNewRule(true)}
              style={{
                marginTop: "16px",
                padding: "10px 20px",
                borderRadius: "10px",
                border: "none",
                background: "var(--accent)",
                color: "white",
                fontSize: "14px",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              ➕ Create First Rule
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          {rules.map((rule) => (
            <AutomationRuleCard
              key={rule._id}
              rule={rule}
              onToggle={handleToggle}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {/* Automation Log */}
      <div style={{ marginTop: "32px" }}>
        <AutomationLog token={token} limit={50} />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "32px",
          padding: "16px",
          background: "var(--surface)",
          borderRadius: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
        }}
      >
        <span style={{ fontSize: "18px" }}>💡</span>
        <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>
          Automation rules are evaluated every 5 minutes via cron. Use "Run Now" to trigger
          immediate evaluation. Smart routing is applied on new message creation.
        </span>
      </div>
    </div>
  );
}
