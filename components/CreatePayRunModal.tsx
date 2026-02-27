"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

interface CreatePayRunModalProps {
  token: string;
  onClose: () => void;
  onSuccess: (payRunId: string) => void;
}

function getDefaultPeriod(): { start: string; end: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  
  // Default to previous pay period (1st-15th or 16th-end of month)
  const day = now.getDate();
  let start: Date;
  let end: Date;
  
  if (day <= 15) {
    // We're in first half, so default to previous month's second half
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 16);
    start = prevMonth;
    end = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of prev month
  } else {
    // We're in second half, default to first half of current month
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth(), 15);
  }
  
  return {
    start: start.toISOString().split("T")[0],
    end: end.toISOString().split("T")[0],
  };
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

export default function CreatePayRunModal({ token, onClose, onSuccess }: CreatePayRunModalProps) {
  const defaults = getDefaultPeriod();
  const [periodStart, setPeriodStart] = useState(defaults.start);
  const [periodEnd, setPeriodEnd] = useState(defaults.end);
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // Convert date strings to timestamps for preview
  const startTs = new Date(periodStart + "T00:00:00").getTime();
  const endTs = new Date(periodEnd + "T23:59:59").getTime();

  const preview = useQuery(
    api.crm.payroll.previewPayRun,
    periodStart && periodEnd && startTs < endTs
      ? { token, periodStart: startTs, periodEnd: endTs }
      : "skip"
  );

  const createPayRun = useMutation(api.crm.payroll.createPayRun);

  const handleCreate = async () => {
    if (!periodStart || !periodEnd) {
      setError("Please select both start and end dates");
      return;
    }
    
    if (startTs >= endTs) {
      setError("End date must be after start date");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const result = await createPayRun({
        token,
        periodStart: startTs,
        periodEnd: endTs,
        notes: notes || undefined,
      });
      onSuccess(result.payRunId);
    } catch (err: any) {
      setError(err.message || "Failed to create pay run");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "16px",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--surface)",
          borderRadius: "24px",
          padding: "28px",
          width: "100%",
          maxWidth: "560px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
        }}
      >
        <h3 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text)", marginBottom: "8px" }}>
          💰 Create New Pay Run
        </h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>
          Select a pay period to aggregate hours, bonuses, and commissions
        </p>

        {/* Period Selection */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "20px" }}>
          <div>
            <label style={labelStyle}>Period Start</label>
            <input
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Period End</label>
            <input
              type="date"
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: "20px" }}>
          <label style={labelStyle}>Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., January 2026 first half..."
            style={{ ...inputStyle, minHeight: "60px", resize: "vertical" }}
          />
        </div>

        {/* Preview Summary */}
        {preview && (
          <div style={{
            background: "var(--bg)",
            borderRadius: "16px",
            padding: "20px",
            marginBottom: "20px",
          }}>
            <div style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "12px", textTransform: "uppercase" }}>
              📊 Preview Summary
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "16px" }}>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Gross</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>
                  {preview.summary.totalGrossFormatted}
                </div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Total Hours</div>
                <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>
                  {preview.summary.totalHoursFormatted}h
                </div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Bonuses</div>
                <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--green)" }}>
                  {preview.summary.totalBonusesFormatted}
                </div>
              </div>
              <div style={statBoxStyle}>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Commissions</div>
                <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--accent)" }}>
                  {preview.summary.totalCommissionsFormatted}
                </div>
              </div>
            </div>

            {/* Chatter List Preview */}
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "8px" }}>
              {preview.items.length} chatter{preview.items.length !== 1 ? "s" : ""} in this period:
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {preview.items.slice(0, 8).map((item) => (
                <span
                  key={item.chatterId}
                  style={{
                    padding: "4px 10px",
                    background: "var(--surface)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--text)",
                  }}
                >
                  {item.chatterName}: {item.grossPayFormatted}
                </span>
              ))}
              {preview.items.length > 8 && (
                <span style={{ padding: "4px 10px", fontSize: "12px", color: "var(--text-muted)" }}>
                  +{preview.items.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {preview === null && periodStart && periodEnd && startTs < endTs && (
          <div style={{
            background: "var(--bg)",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>
              Loading preview...
            </div>
          </div>
        )}

        {preview && preview.items.length === 0 && (
          <div style={{
            background: "var(--orange-bg)",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "20px",
            color: "var(--orange)",
            fontSize: "14px",
          }}>
            ⚠️ No payroll data found for this period. Check that chatters have shifts and approved bonuses.
          </div>
        )}

        {error && (
          <div style={{
            padding: "14px 20px",
            background: "var(--red-bg)",
            color: "var(--red)",
            borderRadius: "14px",
            marginBottom: "16px",
            fontSize: "14px",
            fontWeight: "500",
          }}>
            ❌ {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px" }}>
          <button onClick={onClose} style={cancelBtnStyle}>
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !preview || preview.items.length === 0}
            style={{
              ...saveBtnStyle,
              opacity: creating || !preview || preview.items.length === 0 ? 0.5 : 1,
              cursor: creating || !preview || preview.items.length === 0 ? "not-allowed" : "pointer",
            }}
          >
            {creating ? "Creating..." : "Create Pay Run"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Styles
const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

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

const statBoxStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "10px",
  padding: "12px",
  textAlign: "center",
};

const cancelBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  fontSize: "14px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  background: "var(--bg)",
  border: "2px solid var(--border)",
  borderRadius: "14px",
  cursor: "pointer",
};

const saveBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: "14px",
  fontSize: "14px",
  fontWeight: "600",
  color: "#fff",
  background: "var(--accent)",
  border: "none",
  borderRadius: "14px",
  cursor: "pointer",
};
