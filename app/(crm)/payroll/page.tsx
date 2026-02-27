"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../../convex/_generated/api";
import PayRunCard from "../../../components/PayRunCard";
import CreatePayRunModal from "../../../components/CreatePayRunModal";
import PayRunStatusBadge from "../../../components/PayRunStatusBadge";
import BatchPaymentModal from "../../../components/BatchPaymentModal";
import ExportModal from "../../../components/ExportModal";

type StatusFilter = "all" | "draft" | "approved" | "paid" | "cancelled";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

export default function PayrollPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const payRuns = useQuery(
    api.crm.payroll.listPayRuns,
    token
      ? { token, status: statusFilter === "all" ? undefined : statusFilter }
      : "skip"
  );

  const dashboardStats = useQuery(
    api.crm.payroll.getDashboardStats,
    token ? { token } : "skip"
  );

  // Stats calculations
  const stats = useMemo(() => {
    if (!payRuns) return { pending: 0, paidThisMonth: 0, totalPending: 0 };

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    let pendingCount = 0;
    let paidThisMonth = 0;
    let totalPending = 0;

    for (const pr of payRuns) {
      if (pr.status === "draft" || pr.status === "approved") {
        pendingCount++;
        totalPending += pr.totalNet;
      }
      if (pr.status === "paid" && pr.paidAt && pr.paidAt >= monthStart) {
        paidThisMonth += pr.totalNet;
      }
    }

    return { pending: pendingCount, paidThisMonth, totalPending };
  }, [payRuns]);

  const handlePayRunCreated = (payRunId: string) => {
    setShowCreateModal(false);
    setSuccess("Pay run created successfully!");
    router.push(`/payroll/${payRunId}`);
  };

  const handleBatchSuccess = (count: number) => {
    setShowBatchModal(false);
    setSuccess(`${count} payments processed successfully!`);
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

  if (!user) return null;

  return (
    <div style={{ maxWidth: "1200px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>💰 Payroll</h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
            Manage pay runs, track payments, and export for processing
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "14px 24px",
            fontSize: "14px",
            fontWeight: "600",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: "14px",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(196, 149, 106, 0.3)",
          }}
        >
          <span style={{ fontSize: "18px" }}>➕</span>
          Create Pay Run
        </button>
      </div>

      {/* Messages */}
      {success && (
        <div style={{ padding: "14px 20px", background: "var(--green-bg)", color: "var(--green)", borderRadius: "14px", marginBottom: "16px", fontSize: "14px", fontWeight: "500" }}>
          ✅ {success}
        </div>
      )}

      {/* Outstanding Payments Alert */}
      {dashboardStats && dashboardStats.pendingItems > 0 && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 24px",
          background: "var(--orange-bg)",
          borderRadius: "16px",
          marginBottom: "20px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ fontSize: "28px" }}>⚠️</span>
            <div>
              <div style={{ fontSize: "15px", fontWeight: "600", color: "var(--orange)" }}>
                {dashboardStats.pendingItems} Outstanding Payments
              </div>
              <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {dashboardStats.pendingAmountFormatted} ready to process
                {dashboardStats.readyToPayCount > 0 && (
                  <span> • {dashboardStats.readyToPayCount} ready to pay ({dashboardStats.readyToPayAmountFormatted})</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              padding: "10px 20px",
              fontSize: "13px",
              fontWeight: "600",
              background: "transparent",
              color: "var(--orange)",
              border: "2px solid var(--orange)",
              borderRadius: "10px",
              cursor: "pointer",
              marginRight: "8px",
            }}
          >
            📤 Export
          </button>
          <button
            onClick={() => setShowBatchModal(true)}
            style={{
              padding: "10px 20px",
              fontSize: "13px",
              fontWeight: "600",
              background: "var(--orange)",
              color: "#fff",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
            }}
          >
            💳 Process Payments
          </button>
        </div>
      )}

      {/* Stats Summary */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "16px",
        marginBottom: "24px",
      }}>
        <div style={statCardStyle}>
          <span style={{ fontSize: "28px" }}>📝</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>
              Pending Approval
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: dashboardStats?.draftPayRunCount ? "var(--orange)" : "var(--text)" }}>
              {dashboardStats?.draftPayRunCount ?? stats.pending}
            </div>
          </div>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: "28px" }}>✅</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>
              Ready to Pay
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--green)" }}>
              {dashboardStats?.readyToPayCount ?? 0}
            </div>
          </div>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: "28px" }}>⏳</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>
              Total Outstanding
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--accent)" }}>
              {dashboardStats?.pendingAmountFormatted ?? `$${(stats.totalPending / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            </div>
          </div>
        </div>
        <div style={statCardStyle}>
          <span style={{ fontSize: "28px" }}>💰</span>
          <div>
            <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: "500", textTransform: "uppercase" }}>
              Paid This Month
            </div>
            <div style={{ fontSize: "28px", fontWeight: "700", color: "var(--green)" }}>
              {dashboardStats?.paidThisMonthFormatted ?? `$${(stats.paidThisMonth / 100).toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        marginBottom: "20px",
        background: "var(--surface)",
        padding: "8px",
        borderRadius: "14px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        flexWrap: "wrap",
      }}>
        {(["all", "draft", "approved", "paid", "cancelled"] as StatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            style={{
              padding: "10px 18px",
              fontSize: "13px",
              fontWeight: "600",
              background: statusFilter === status ? "var(--bg)" : "transparent",
              color: statusFilter === status ? "var(--text)" : "var(--text-secondary)",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {status === "all" ? "All" : (
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <PayRunStatusBadge status={status} size="sm" />
              </span>
            )}
          </button>
        ))}
        
        {/* Quick action buttons */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
          {dashboardStats?.draftPayRunCount ? (
            <button
              onClick={() => setStatusFilter("draft")}
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: "600",
                background: "var(--orange-bg)",
                color: "var(--orange)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              ⏳ {dashboardStats.draftPayRunCount} Pending Approval
            </button>
          ) : null}
          {dashboardStats?.readyToPayCount ? (
            <button
              onClick={() => {
                setStatusFilter("approved");
                setShowBatchModal(true);
              }}
              style={{
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: "600",
                background: "var(--green-bg)",
                color: "var(--green)",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              ✅ {dashboardStats.readyToPayCount} Ready to Pay
            </button>
          ) : null}
        </div>
      </div>

      {/* Pay Runs List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {payRuns?.map((payRun) => (
          <PayRunCard
            key={payRun.id}
            id={payRun.id}
            periodStartDate={payRun.periodStartDate}
            periodEndDate={payRun.periodEndDate}
            status={payRun.status}
            totalGrossFormatted={payRun.totalGrossFormatted}
            totalNetFormatted={payRun.totalNetFormatted}
            lineItemCount={payRun.lineItemCount}
            createdBy={payRun.createdBy}
            createdAt={payRun.createdAt}
            approvedBy={payRun.approvedBy}
            paidAt={payRun.paidAt}
            onClick={() => router.push(`/payroll/${payRun.id}`)}
          />
        ))}
      </div>

      {/* Empty State */}
      {payRuns && payRuns.length === 0 && (
        <div style={{
          background: "var(--surface)",
          borderRadius: "24px",
          padding: "60px 24px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>💰</div>
          <h3 style={{ fontSize: "20px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>
            {statusFilter === "all" ? "No pay runs yet" : `No ${statusFilter} pay runs`}
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
            {statusFilter === "all"
              ? "Create your first pay run to start tracking payments"
              : "Try selecting a different status filter"}
          </p>
          {statusFilter === "all" && (
            <button
              onClick={() => setShowCreateModal(true)}
              style={{
                padding: "14px 28px",
                fontSize: "14px",
                fontWeight: "600",
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: "14px",
                cursor: "pointer",
              }}
            >
              ➕ Create Pay Run
            </button>
          )}
        </div>
      )}

      {/* Loading State */}
      {!payRuns && (
        <div style={{
          background: "var(--surface)",
          borderRadius: "24px",
          padding: "60px 24px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ fontSize: "16px", color: "var(--text-muted)" }}>Loading pay runs...</div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePayRunModal
          token={token}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handlePayRunCreated}
        />
      )}

      {/* Batch Payment Modal */}
      {showBatchModal && (
        <BatchPaymentModal
          token={token}
          onClose={() => setShowBatchModal(false)}
          onSuccess={handleBatchSuccess}
        />
      )}

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          token={token}
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
const statCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  borderRadius: "20px",
  padding: "20px 24px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  display: "flex",
  alignItems: "center",
  gap: "16px",
};
