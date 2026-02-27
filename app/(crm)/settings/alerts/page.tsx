"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";

export default function AlertConfigPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [hasChanges, setHasChanges] = useState(false);

  // Form state
  const [responseTimeWarning, setResponseTimeWarning] = useState(90);
  const [responseTimeCritical, setResponseTimeCritical] = useState(180);
  const [vipQueueThreshold, setVipQueueThreshold] = useState(5);
  const [vipQueueMinutes, setVipQueueMinutes] = useState(10);
  const [queueOverloadThreshold, setQueueOverloadThreshold] = useState(20);
  const [enableResponseTime, setEnableResponseTime] = useState(true);
  const [enableVipQueue, setEnableVipQueue] = useState(true);
  const [enableQueueOverload, setEnableQueueOverload] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const config = useQuery(
    api.crm.alertConfig.get,
    token ? { token } : "skip"
  );
  const updateConfig = useMutation(api.crm.alertConfig.update);
  const resetToDefaults = useMutation(api.crm.alertConfig.resetToDefaults);

  // Load config into form when data arrives
  useEffect(() => {
    if (config) {
      setResponseTimeWarning(config.responseTimeWarning);
      setResponseTimeCritical(config.responseTimeCritical);
      setVipQueueThreshold(config.vipQueueThreshold);
      setVipQueueMinutes(config.vipQueueMinutes);
      setQueueOverloadThreshold(config.queueOverloadThreshold);
      setEnableResponseTime(config.enableResponseTime);
      setEnableVipQueue(config.enableVipQueue);
      setEnableQueueOverload(config.enableQueueOverload);
      setHasChanges(false);
    }
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await updateConfig({
        token,
        responseTimeWarning,
        responseTimeCritical,
        vipQueueThreshold,
        vipQueueMinutes,
        queueOverloadThreshold,
        enableResponseTime,
        enableVipQueue,
        enableQueueOverload,
      });
      setSuccess("Alert thresholds saved successfully!");
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Reset all thresholds to default values?")) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      await resetToDefaults({ token });
      setSuccess("Thresholds reset to defaults!");
      setHasChanges(false);
    } catch (err: any) {
      setError(err.message || "Failed to reset settings");
    } finally {
      setSaving(false);
    }
  };

  const markChanged = () => setHasChanges(true);

  // Format seconds to mm:ss display
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Check authorization
  if (user && !["admin", "supervisor"].includes(user.role)) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>You don&apos;t have permission to view this page</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ maxWidth: "800px" }}>
      {/* Header */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>🔔 Alert Configuration</h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
          Configure alert thresholds for response times, VIP queues, and workload monitoring
        </p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div style={{ padding: "14px 20px", background: "var(--green-bg)", color: "var(--green)", borderRadius: "14px", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          ✅ {success}
        </div>
      )}
      {error && (
        <div style={{ padding: "14px 20px", background: "var(--red-bg)", color: "var(--red)", borderRadius: "14px", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          ❌ {error}
        </div>
      )}

      {/* Last Updated Info */}
      {config?.updatedAt && (
        <div style={{ 
          padding: "12px 16px", 
          background: "var(--bg)", 
          borderRadius: "12px", 
          marginBottom: "20px",
          fontSize: "13px",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span>📝</span>
          <span>
            Last updated {new Date(config.updatedAt).toLocaleString()} by <strong>{config.updatedBy || "Unknown"}</strong>
          </span>
        </div>
      )}

      {/* Response Time Section */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "20px",
        padding: "24px",
        marginBottom: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
              ⏱️ Response Time Alerts
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Alert when chatters take too long to respond
            </p>
          </div>
          <ToggleSwitch
            checked={enableResponseTime}
            onChange={(v) => { setEnableResponseTime(v); markChanged(); }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", opacity: enableResponseTime ? 1 : 0.5 }}>
          <div>
            <label style={labelStyle}>Warning Threshold (seconds)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="number"
                value={responseTimeWarning}
                onChange={(e) => { setResponseTimeWarning(Number(e.target.value)); markChanged(); }}
                disabled={!enableResponseTime}
                style={inputStyle}
                min={0}
              />
              <span style={{ fontSize: "14px", color: "var(--text-muted)", minWidth: "50px" }}>
                = {formatTime(responseTimeWarning)}
              </span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>Critical Threshold (seconds)</label>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <input
                type="number"
                value={responseTimeCritical}
                onChange={(e) => { setResponseTimeCritical(Number(e.target.value)); markChanged(); }}
                disabled={!enableResponseTime}
                style={inputStyle}
                min={0}
              />
              <span style={{ fontSize: "14px", color: "var(--text-muted)", minWidth: "50px" }}>
                = {formatTime(responseTimeCritical)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* VIP Queue Section */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "20px",
        padding: "24px",
        marginBottom: "16px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
              ⭐ VIP Queue Backup
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Alert when VIP fans are waiting too long
            </p>
          </div>
          <ToggleSwitch
            checked={enableVipQueue}
            onChange={(v) => { setEnableVipQueue(v); markChanged(); }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", opacity: enableVipQueue ? 1 : 0.5 }}>
          <div>
            <label style={labelStyle}>VIP Count Threshold</label>
            <input
              type="number"
              value={vipQueueThreshold}
              onChange={(e) => { setVipQueueThreshold(Number(e.target.value)); markChanged(); }}
              disabled={!enableVipQueue}
              style={inputStyle}
              min={1}
            />
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
              Number of VIPs waiting before alert
            </p>
          </div>
          <div>
            <label style={labelStyle}>Wait Time (minutes)</label>
            <input
              type="number"
              value={vipQueueMinutes}
              onChange={(e) => { setVipQueueMinutes(Number(e.target.value)); markChanged(); }}
              disabled={!enableVipQueue}
              style={inputStyle}
              min={1}
            />
            <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
              Minutes waiting before counting
            </p>
          </div>
        </div>
      </div>

      {/* Queue Overload Section */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "20px",
        padding: "24px",
        marginBottom: "24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h2 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", display: "flex", alignItems: "center", gap: "8px" }}>
              📊 Queue Overload
            </h2>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Alert when chatters have too many pending messages
            </p>
          </div>
          <ToggleSwitch
            checked={enableQueueOverload}
            onChange={(v) => { setEnableQueueOverload(v); markChanged(); }}
          />
        </div>

        <div style={{ opacity: enableQueueOverload ? 1 : 0.5 }}>
          <label style={labelStyle}>Pending Messages per Chatter</label>
          <input
            type="number"
            value={queueOverloadThreshold}
            onChange={(e) => { setQueueOverloadThreshold(Number(e.target.value)); markChanged(); }}
            disabled={!enableQueueOverload}
            style={{ ...inputStyle, maxWidth: "200px" }}
            min={1}
          />
          <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "6px" }}>
            Alert when any chatter has more than this many pending messages
          </p>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "12px", justifyContent: "space-between", alignItems: "center" }}>
        <button
          onClick={handleReset}
          disabled={saving}
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: "600",
            color: "var(--text-secondary)",
            background: "var(--bg)",
            border: "2px solid var(--border)",
            borderRadius: "12px",
            cursor: "pointer",
          }}
        >
          Reset to Defaults
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{
            padding: "12px 28px",
            fontSize: "14px",
            fontWeight: "600",
            color: "#fff",
            background: hasChanges ? "var(--accent)" : "var(--text-muted)",
            border: "none",
            borderRadius: "12px",
            cursor: hasChanges ? "pointer" : "not-allowed",
            opacity: hasChanges ? 1 : 0.6,
          }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── Toggle Switch Component ─────────────────────────────
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: "52px",
        height: "28px",
        borderRadius: "14px",
        background: checked ? "var(--green)" : "var(--border)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        transition: "background 0.2s",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "3px",
          left: checked ? "27px" : "3px",
          width: "22px",
          height: "22px",
          borderRadius: "11px",
          background: "#2a2a2a",
          boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          transition: "left 0.2s",
        }}
      />
    </button>
  );
}

// ─── Shared Styles ─────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px 16px",
  fontSize: "15px",
  border: "2px solid var(--border)",
  borderRadius: "12px",
  background: "var(--bg)",
  color: "var(--text)",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "8px",
};
