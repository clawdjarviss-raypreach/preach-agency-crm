"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../../convex/_generated/api";
import { Id } from "../../../../../convex/_generated/dataModel";
import PaymentMethodIcon from "../../../../../components/PaymentMethodIcon";
import PayRunStatusBadge from "../../../../../components/PayRunStatusBadge";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function ChatterPaymentHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const chatterId = params.id as string;

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const summary = useQuery(
    api.crm.payroll.getChatterPaymentSummary,
    token && chatterId
      ? { token, chatterId: chatterId as Id<"crm_chatters"> }
      : "skip"
  );

  const paymentHistory = useQuery(
    api.crm.payroll.getChatterPaymentHistory,
    token && chatterId
      ? { token, chatterId: chatterId as Id<"crm_chatters">, limit: 50 }
      : "skip"
  );

  // Calculate stats
  const stats = useMemo(() => {
    if (!paymentHistory) return { total: 0, paid: 0, pending: 0 };

    return {
      total: paymentHistory.length,
      paid: paymentHistory.filter((p) => p.paymentStatus === "paid").length,
      pending: paymentHistory.filter(
        (p) => p.paymentStatus === "pending" && p.payRunStatus === "approved"
      ).length,
    };
  }, [paymentHistory]);

  // Permission check
  if (user && !["admin", "manager"].includes(user.role)) {
    return (
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "24px",
          padding: "48px 24px",
          textAlign: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔒</div>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: "600",
            color: "var(--text)",
            marginBottom: "8px",
          }}
        >
          Access Denied
        </h3>
        <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
          Only admins and managers can access payment history
        </p>
      </div>
    );
  }

  if (!user || !summary) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "1200px" }}>
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

      {/* Chatter Header */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "24px",
          padding: "28px 32px",
          marginBottom: "24px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "28px",
              color: "#fff",
              fontWeight: "600",
            }}
          >
            {summary.avatarEmoji || summary.chatterName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 style={{ fontSize: "26px", fontWeight: "700", color: "var(--text)" }}>
              {summary.chatterName}
            </h1>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                marginTop: "8px",
              }}
            >
              <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                💵 {summary.hourlyRateFormatted}/hr
              </span>
              <PaymentMethodIcon method={summary.paymentMethod} size="sm" />
              {summary.paymentAddress && (
                <span
                  style={{
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontFamily: "monospace",
                  }}
                >
                  {summary.paymentAddress.length > 20
                    ? `${summary.paymentAddress.substring(0, 10)}...${summary.paymentAddress.substring(summary.paymentAddress.length - 6)}`
                    : summary.paymentAddress}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* YTD Stats Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "16px",
            padding: "20px",
            background: "var(--bg)",
            borderRadius: "16px",
          }}
        >
          <StatCard
            label="Total Paid YTD"
            value={summary.ytdNetFormatted}
            icon="💰"
            color="var(--accent)"
          />
          <StatCard
            label="Hours Worked YTD"
            value={`${summary.ytdHours}h`}
            icon="⏱️"
            color="var(--text)"
          />
          <StatCard
            label="Bonuses YTD"
            value={summary.ytdBonusesFormatted}
            icon="🎁"
            color="var(--green)"
          />
          <StatCard
            label="Commissions YTD"
            value={summary.ytdCommissionsFormatted}
            icon="💵"
            color="var(--accent)"
          />
          <StatCard
            label="Avg Per Period"
            value={summary.avgPerPeriodFormatted}
            icon="📊"
            color="var(--text)"
          />
          <StatCard
            label="Pay Periods"
            value={String(summary.totalPayPeriods)}
            icon="📅"
            color="var(--text-secondary)"
          />
        </div>

        {/* Outstanding Alert */}
        {summary.pendingCount > 0 && (
          <div
            style={{
              marginTop: "20px",
              padding: "16px 20px",
              background: "var(--orange-bg)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>⏳</span>
              <div>
                <div
                  style={{ fontSize: "14px", fontWeight: "600", color: "var(--orange)" }}
                >
                  {summary.pendingCount} payment{summary.pendingCount !== 1 ? "s" : ""}{" "}
                  pending
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                  Outstanding: {summary.pendingAmountFormatted}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payment History Table */}
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          overflow: "hidden",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}
      >
        <div
          style={{
            padding: "16px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
            📜 Payment History ({stats.total})
          </h2>
          <div style={{ display: "flex", gap: "8px", fontSize: "13px" }}>
            <span style={{ color: "var(--green)" }}>✅ {stats.paid} paid</span>
            {stats.pending > 0 && (
              <span style={{ color: "var(--orange)" }}>⏳ {stats.pending} pending</span>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "800px" }}>
            <thead>
              <tr style={{ background: "var(--bg)" }}>
                <th style={thStyle}>Period</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Hours</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Base</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Bonuses</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Net Pay</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Status</th>
                <th style={{ ...thStyle, textAlign: "center" }}>Method</th>
                <th style={thStyle}>Payment Ref</th>
                <th style={thStyle}>Paid</th>
              </tr>
            </thead>
            <tbody>
              {paymentHistory?.map((payment) => (
                <tr
                  key={payment.id}
                  style={{
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                  }}
                  onClick={() => router.push(`/payroll/${payment.payRunId}`)}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: "500" }}>
                      {payment.periodStartDate} – {payment.periodEndDate}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {formatHours(payment.hoursWorked)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {payment.basePayFormatted}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--green)" }}>
                    {payment.bonusTotalFormatted}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: "700",
                      fontSize: "15px",
                    }}
                  >
                    {payment.netPayFormatted}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <PayRunStatusBadge
                      status={
                        payment.paymentStatus === "paid"
                          ? "paid"
                          : payment.payRunStatus === "approved"
                            ? "approved"
                            : "draft"
                      }
                      size="sm"
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <PaymentMethodIcon
                      method={payment.paymentMethod}
                      size="sm"
                      showLabel={false}
                    />
                  </td>
                  <td style={tdStyle}>
                    {payment.paymentRef ? (
                      <span
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: "var(--text-muted)",
                        }}
                      >
                        {payment.paymentRef.length > 16
                          ? `${payment.paymentRef.substring(0, 12)}...`
                          : payment.paymentRef}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {payment.paymentDate ? (
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        {payment.paymentDate}
                      </span>
                    ) : payment.paidAt ? (
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        {formatDate(payment.paidAt)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {(!paymentHistory || paymentHistory.length === 0) && (
          <div style={{ padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>💸</div>
            <h3
              style={{
                fontSize: "18px",
                fontWeight: "600",
                color: "var(--text)",
                marginBottom: "8px",
              }}
            >
              No payment history yet
            </h3>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
              Payments will appear here once pay runs are processed
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// Stat Card Component
function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: string;
  color: string;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "22px", marginBottom: "4px" }}>{icon}</div>
      <div style={{ fontSize: "24px", fontWeight: "700", color }}>{value}</div>
      <div
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          textTransform: "uppercase",
          fontWeight: "500",
          marginTop: "4px",
        }}
      >
        {label}
      </div>
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

const tdStyle: React.CSSProperties = {
  padding: "14px 12px",
  fontSize: "14px",
  color: "var(--text)",
};
