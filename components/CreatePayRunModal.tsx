"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface CreatePayRunModalProps {
  token: string;
  onClose: () => void;
  onSuccess: (payRunId: string) => void;
}

interface PreviewItem {
  chatterId: string;
  chatterName: string;
  hoursWorked: number;
  basePay: number;
  bonusTotal: number;
  commissionTotal: number;
  grossPay: number;
  grossPayFormatted: string;
}

interface PreviewSummary {
  totalGross: number;
  totalGrossFormatted: string;
  totalHours: number;
  totalHoursFormatted: string;
  totalBonuses: number;
  totalBonusesFormatted: string;
  totalCommissions: number;
  totalCommissionsFormatted: string;
}

interface Preview {
  summary: PreviewSummary;
  items: PreviewItem[];
}

function getDefaultPeriod(): { start: string; end: string } {
  const now = new Date();

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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Convert date strings to timestamps for preview
  const startTs = new Date(periodStart + "T00:00:00").getTime();
  const endTs = new Date(periodEnd + "T23:59:59").getTime();

  // Fetch preview data
  useEffect(() => {
    if (!periodStart || !periodEnd || startTs >= endTs || !token) {
      setPreview(null);
      return;
    }

    async function fetchPreview() {
      setPreviewLoading(true);
      try {
        const startISO = new Date(periodStart + "T00:00:00").toISOString();
        const endISO = new Date(periodEnd + "T23:59:59").toISOString();

        // Get shifts in period
        const { data: shifts } = await supabase
          .from("crm_shifts")
          .select("chatter_id, total_minutes")
          .gte("date", periodStart)
          .lte("date", periodEnd);

        // Get chatters with hourly rates
        const { data: chatters } = await supabase
          .from("crm_chatters")
          .select("id, name, hourly_rate, commission_pct")
          .eq("status", "active");

        // Get bonus records in period
        const { data: bonuses } = await supabase
          .from("crm_bonus_records")
          .select("chatter_id, amount")
          .eq("status", "approved")
          .gte("period_start", startISO)
          .lte("period_end", endISO);

        const chatterMap = new Map<string, { name: string; hourlyRate: number; commissionPct: number }>();
        for (const c of chatters || []) {
          chatterMap.set(c.id, {
            name: c.name,
            hourlyRate: c.hourly_rate || 0,
            commissionPct: c.commission_pct || 0,
          });
        }

        // Aggregate hours per chatter
        const hoursMap = new Map<string, number>();
        for (const shift of shifts || []) {
          const current = hoursMap.get(shift.chatter_id) || 0;
          hoursMap.set(shift.chatter_id, current + (shift.total_minutes || 0) / 60);
        }

        // Aggregate bonuses per chatter
        const bonusMap = new Map<string, number>();
        for (const bonus of bonuses || []) {
          const current = bonusMap.get(bonus.chatter_id) || 0;
          bonusMap.set(bonus.chatter_id, current + (bonus.amount || 0));
        }

        // Build preview items
        const allChatterIds = new Set([...hoursMap.keys(), ...bonusMap.keys()]);
        const items: PreviewItem[] = [];

        for (const cid of allChatterIds) {
          const info = chatterMap.get(cid);
          if (!info) continue;

          const hours = hoursMap.get(cid) || 0;
          const basePay = Math.round(hours * info.hourlyRate * 100);
          const bonusTotal = bonusMap.get(cid) || 0;
          const grossPay = basePay + bonusTotal;

          items.push({
            chatterId: cid,
            chatterName: info.name,
            hoursWorked: hours,
            basePay,
            bonusTotal,
            commissionTotal: 0,
            grossPay,
            grossPayFormatted: formatCurrency(grossPay),
          });
        }

        const totalGross = items.reduce((s, i) => s + i.grossPay, 0);
        const totalHours = items.reduce((s, i) => s + i.hoursWorked, 0);
        const totalBonuses = items.reduce((s, i) => s + i.bonusTotal, 0);
        const totalCommissions = items.reduce((s, i) => s + i.commissionTotal, 0);

        setPreview({
          summary: {
            totalGross,
            totalGrossFormatted: formatCurrency(totalGross),
            totalHours,
            totalHoursFormatted: totalHours.toFixed(1),
            totalBonuses,
            totalBonusesFormatted: formatCurrency(totalBonuses),
            totalCommissions,
            totalCommissionsFormatted: formatCurrency(totalCommissions),
          },
          items,
        });
      } catch (err) {
        console.error("Failed to fetch preview:", err);
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }

    fetchPreview();
  }, [token, periodStart, periodEnd, startTs, endTs]);

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
      const user = JSON.parse(localStorage.getItem("crm_user") || "{}");

      // Create pay run
      const { data: payRun, error: createError } = await supabase
        .from("crm_pay_runs")
        .insert({
          period_start: new Date(periodStart + "T00:00:00").toISOString(),
          period_end: new Date(periodEnd + "T23:59:59").toISOString(),
          status: "draft",
          total_gross: preview?.summary.totalGross || 0,
          total_net: preview?.summary.totalGross || 0,
          line_item_count: preview?.items.length || 0,
          created_by: user.name || user.username || "unknown",
          notes: notes || null,
        })
        .select("id")
        .single();

      if (createError) throw createError;

      // Create pay run items
      if (preview?.items.length) {
        const items = preview.items.map((item) => ({
          pay_run_id: payRun.id,
          chatter_id: item.chatterId,
          chatter_name: item.chatterName,
          hours_worked: item.hoursWorked,
          base_pay: item.basePay,
          bonus_total: item.bonusTotal,
          commission_total: item.commissionTotal,
          deductions: 0,
          gross_pay: item.grossPay,
          net_pay: item.grossPay,
          payment_status: "pending",
        }));

        const { error: itemsError } = await supabase
          .from("crm_pay_run_items")
          .insert(items);

        if (itemsError) throw itemsError;
      }

      onSuccess(payRun.id);
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

        {previewLoading && periodStart && periodEnd && startTs < endTs && (
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
