"use client";

import { useState, useEffect, useMemo, type ComponentProps } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PayRunStatusBadge from "../../../../components/PayRunStatusBadge";
import PayRunItemRow from "../../../../components/PayRunItemRow";
import BatchPaymentModal from "../../../../components/BatchPaymentModal";
import ExportModal from "../../../../components/ExportModal";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface PayRunItem {
  id: string;
  chatter_name: string;
  chatter_id: string;
  hours_worked: number;
  base_pay: number;
  bonus_total: number;
  commission_total: number;
  deductions: number;
  gross_pay: number;
  net_pay: number;
  payment_status: string;
  payment_method: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  payment_notes: string | null;
  breakdown: any;
}

type PayRunStatus = ComponentProps<typeof PayRunStatusBadge>["status"];
type PayRunItemPaymentStatus = ComponentProps<typeof PayRunItemRow>["paymentStatus"];

interface PayRun {
  id: string;
  period_start: string;
  period_end: string;
  status: string;
  total_gross: number;
  total_net: number;
  line_item_count: number;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  items: PayRunItem[];
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
  const startStr = startDate.toLocaleDateString("en-US", opts);
  const endStr = endDate.toLocaleDateString("en-US", opts);
  return `${startStr} – ${endStr}`;
}

function formatDate(timestamp: number | string): string {
  const ts = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PayRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const payRunId = params.id as string;

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const [payRun, setPayRun] = useState<PayRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  // Fetch pay run + items
  const fetchPayRun = async () => {
    if (!token || !payRunId) return;
    setLoading(true);
    try {
      const { data: run, error: runError } = await supabase
        .from("crm_pay_runs")
        .select("*")
        .eq("id", payRunId)
        .single();

      if (runError) throw runError;

      const { data: items, error: itemsError } = await supabase
        .from("crm_pay_run_items")
        .select("*")
        .eq("pay_run_id", payRunId)
        .order("chatter_name");

      if (itemsError) throw itemsError;

      setPayRun({ ...run, items: items || [] });
    } catch (err) {
      console.error("Failed to fetch pay run:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayRun();
  }, [token, payRunId]);

  // Stats calculations
  const stats = useMemo(() => {
    if (!payRun?.items) return { basePay: 0, bonuses: 0, commissions: 0, deductions: 0 };

    let basePay = 0;
    let bonuses = 0;
    let commissions = 0;
    let deductions = 0;

    for (const item of payRun.items) {
      basePay += item.base_pay || 0;
      bonuses += item.bonus_total || 0;
      commissions += item.commission_total || 0;
      deductions += item.deductions || 0;
    }

    return { basePay, bonuses, commissions, deductions };
  }, [payRun?.items]);

  const pendingItems = useMemo(() => {
    if (!payRun?.items) return [];
    return payRun.items.filter((item) => item.payment_status !== "paid");
  }, [payRun?.items]);

  const handleSelectItem = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === pendingItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(pendingItems.map((item) => item.id)));
    }
  };

  const handleApprove = async () => {
    setActionLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("crm_pay_runs")
        .update({
          status: "approved",
          approved_by: user?.name || user?.username || "unknown",
          approved_at: new Date().toISOString(),
        })
        .eq("id", payRunId);

      if (updateError) throw updateError;
      setSuccess("Pay run approved!");
      await fetchPayRun();
    } catch (err: any) {
      setError(err.message || "Failed to approve pay run");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm("Are you sure you want to cancel this pay run? This cannot be undone.")) return;

    setActionLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("crm_pay_runs")
        .update({ status: "cancelled" })
        .eq("id", payRunId);

      if (updateError) throw updateError;
      setSuccess("Pay run cancelled");
      await fetchPayRun();
    } catch (err: any) {
      setError(err.message || "Failed to cancel pay run");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkAllPaid = async () => {
    setActionLoading(true);
    setError("");
    try {
      const { error: updateRunError } = await supabase
        .from("crm_pay_runs")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", payRunId);

      if (updateRunError) throw updateRunError;

      const { error: updateItemsError } = await supabase
        .from("crm_pay_run_items")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("pay_run_id", payRunId);

      if (updateItemsError) throw updateItemsError;

      setSuccess("All items marked as paid!");
      setSelectedItems(new Set());
      await fetchPayRun();
    } catch (err: any) {
      setError(err.message || "Failed to mark all as paid");
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkItemPaid = async (itemId: string) => {
    setActionLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("crm_pay_run_items")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .eq("id", itemId);

      if (updateError) throw updateError;
      setSuccess("Item marked as paid!");
      await fetchPayRun();
    } catch (err: any) {
      setError(err.message || "Failed to mark item as paid");
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchMarkPaid = async () => {
    if (selectedItems.size === 0) return;

    setActionLoading(true);
    setError("");
    try {
      const { error: updateError } = await supabase
        .from("crm_pay_run_items")
        .update({ payment_status: "paid", paid_at: new Date().toISOString() })
        .in("id", Array.from(selectedItems));

      if (updateError) throw updateError;
      setSuccess(`${selectedItems.size} items marked as paid!`);
      setSelectedItems(new Set());
      await fetchPayRun();
    } catch (err: any) {
      setError(err.message || "Failed to mark items as paid");
    } finally {
      setActionLoading(false);
    }
  };

  // Permission check
  if (user && !["admin", "manager"].includes(user.role)) {
    return (
      <div style={{ background: "var(--surface)", borderRadius: "24px", padding: "48px 24px", textAlign: "center", boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>Access Denied</h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Only admins and managers can access payroll</p>
      </div>
    );
  }

  if (!user || !payRun) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  const isApproved = payRun.status === "approved";
  const isDraft = payRun.status === "draft";
  const isPaid = payRun.status === "paid";
  const isCancelled = payRun.status === "cancelled";

  return (
    <div style={{ maxWidth: "1400px" }}>
      {/* Back Button */}
      <button
        onClick={() => router.push("/payroll")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 16px",
          fontSize: "14px",
          fontWeight: "500",
          color: "var(--text-secondary)",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          marginBottom: "16px",
        }}
      >
        ← Back to Payroll
      </button>

      {/* Messages */}
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

      {/* Header */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "24px",
        padding: "28px 32px",
        marginBottom: "24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "20px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "8px" }}>
              <h1 style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)" }}>
                {formatDateRange(payRun.period_start, payRun.period_end)}
              </h1>
              <PayRunStatusBadge status={payRun.status as PayRunStatus} />
            </div>
            <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Created by {payRun.created_by} on {formatDate(payRun.created_at)}
              {payRun.approved_by && ` • Approved by ${payRun.approved_by}`}
              {payRun.paid_at && ` • Paid ${formatDate(payRun.paid_at)}`}
            </div>
            {payRun.notes && (
              <div style={{ fontSize: "13px", color: "var(--text-muted)", marginTop: "6px", fontStyle: "italic" }}>
                📝 {payRun.notes}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            {isDraft && (
              <>
                <button onClick={handleApprove} disabled={actionLoading} style={approveBtn}>
                  ✅ Approve
                </button>
                <button onClick={handleCancel} disabled={actionLoading} style={cancelBtn}>
                  ❌ Cancel
                </button>
              </>
            )}
            {isApproved && (
              <>
                <button onClick={() => setShowExportModal(true)} style={exportBtn}>
                  📤 Export for Payment
                </button>
                <button onClick={handleMarkAllPaid} disabled={actionLoading} style={paidBtn}>
                  💰 Mark All Paid
                </button>
                <button onClick={handleCancel} disabled={actionLoading} style={cancelBtn}>
                  ❌ Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary Stats */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "16px",
          marginTop: "24px",
          padding: "20px",
          background: "var(--bg)",
          borderRadius: "16px",
        }}>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Total Gross</div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text)" }}>{formatCents(payRun.total_gross)}</div>
          </div>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Base Pay</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)" }}>${(stats.basePay / 100).toFixed(2)}</div>
          </div>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Bonuses</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--green)" }}>${(stats.bonuses / 100).toFixed(2)}</div>
          </div>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Commissions</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--accent)" }}>${(stats.commissions / 100).toFixed(2)}</div>
          </div>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Deductions</div>
            <div style={{ fontSize: "18px", fontWeight: "600", color: "var(--red)" }}>
              {stats.deductions > 0 ? `-$${(stats.deductions / 100).toFixed(2)}` : "—"}
            </div>
          </div>
          <div style={summaryStatStyle}>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "4px" }}>Total Net</div>
            <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--accent)" }}>{formatCents(payRun.total_net)}</div>
          </div>
        </div>
      </div>

      {/* Batch Actions (when items selected) */}
      {isApproved && selectedItems.size > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "var(--accent-bg)",
          borderRadius: "14px",
          marginBottom: "16px",
        }}>
          <span style={{ fontSize: "14px", fontWeight: "500", color: "var(--text)" }}>
            {selectedItems.size} item{selectedItems.size !== 1 ? "s" : ""} selected
          </span>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={() => setShowBatchModal(true)}
              disabled={actionLoading}
              style={paidBtn}
            >
              💰 Mark Selected as Paid
            </button>
          </div>
        </div>
      )}

      {/* Line Items Table */}
      <div style={{
        background: "var(--surface)",
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          borderBottom: "1px solid var(--border)",
        }}>
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
            Line Items ({payRun.items?.length || 0})
          </h2>
          {isApproved && pendingItems.length > 0 && (
            <button onClick={handleSelectAll} style={selectAllBtn}>
              {selectedItems.size === pendingItems.length ? "Deselect All" : "Select All Pending"}
            </button>
          )}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "900px" }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={{ ...thStyle, width: "40px" }}></th>
                <th style={thStyle}>Chatter</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Hours</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Base Pay</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Bonuses</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Commissions</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Deductions</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Net Pay</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...thStyle, textAlign: "center", width: "100px" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {payRun.items?.map((item) => (
                <PayRunItemRow
                  key={item.id}
                  id={item.id}
                  chatterName={item.chatter_name}
                  chatterId={item.chatter_id}
                  hoursWorked={item.hours_worked}
                  basePayFormatted={formatCents(item.base_pay)}
                  bonusTotalFormatted={formatCents(item.bonus_total)}
                  commissionTotalFormatted={formatCents(item.commission_total)}
                  deductionsFormatted={item.deductions > 0 ? `-${formatCents(item.deductions)}` : formatCents(0)}
                  grossPayFormatted={formatCents(item.gross_pay)}
                  netPayFormatted={formatCents(item.net_pay)}
                  paymentStatus={item.payment_status as PayRunItemPaymentStatus}
                  paymentMethod={item.payment_method ?? undefined}
                  paymentRef={item.payment_ref ?? undefined}
                  paymentDate={item.payment_date ?? undefined}
                  paymentNotes={item.payment_notes ?? undefined}
                  breakdown={item.breakdown}
                  isApproved={isApproved}
                  selected={selectedItems.has(item.id)}
                  onSelect={handleSelectItem}
                  onMarkPaid={isApproved ? handleMarkItemPaid : undefined}
                />
              ))}
            </tbody>
          </table>
        </div>

        {(!payRun.items || payRun.items.length === 0) && (
          <div style={{ padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "14px", color: "var(--text-muted)" }}>
              No line items in this pay run
            </div>
          </div>
        )}
      </div>

      {/* Batch Payment Modal */}
      {showBatchModal && (
        <BatchPaymentModal
          token={token}
          payRunId={payRunId}
          selectedItemIds={Array.from(selectedItems)}
          onClose={() => setShowBatchModal(false)}
          onSuccess={(count) => {
            setShowBatchModal(false);
            setSelectedItems(new Set());
            setSuccess(`${count} payments processed successfully!`);
            fetchPayRun();
          }}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          token={token}
          payRunId={payRunId}
          selectedItemIds={selectedItems.size > 0 ? Array.from(selectedItems) : undefined}
          onClose={() => setShowExportModal(false)}
          onSuccess={(message) => {
            setShowExportModal(false);
            setSuccess(message);
          }}
        />
      )}
    </div>
  );
}

// Styles
const thStyle: React.CSSProperties = {
  padding: "12px 12px",
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  textAlign: "left",
};

const summaryStatStyle: React.CSSProperties = {
  textAlign: "center",
};

const approveBtn: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: "600",
  background: "var(--green-bg)",
  color: "var(--green)",
  border: "2px solid var(--green)",
  borderRadius: "12px",
  cursor: "pointer",
};

const paidBtn: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: "600",
  background: "var(--accent)",
  color: "#fff",
  border: "none",
  borderRadius: "12px",
  cursor: "pointer",
};

const cancelBtn: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: "600",
  background: "var(--bg)",
  color: "var(--text-secondary)",
  border: "2px solid var(--border)",
  borderRadius: "12px",
  cursor: "pointer",
};

const selectAllBtn: React.CSSProperties = {
  padding: "8px 14px",
  fontSize: "12px",
  fontWeight: "600",
  background: "var(--bg)",
  color: "var(--text-secondary)",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  cursor: "pointer",
};

const exportBtn: React.CSSProperties = {
  padding: "12px 20px",
  fontSize: "14px",
  fontWeight: "600",
  background: "var(--blue-bg)",
  color: "var(--blue)",
  border: "2px solid var(--blue)",
  borderRadius: "12px",
  cursor: "pointer",
};
