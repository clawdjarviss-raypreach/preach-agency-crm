"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PaymentMethodIcon from "../../../../../components/PaymentMethodIcon";
import PayRunStatusBadge from "../../../../../components/PayRunStatusBadge";

interface CrmUser {
  id: string;
  name: string;
  username: string;
  role: string;
}

interface ChatterSummary {
  chatterName: string;
  avatarEmoji: string | null;
  hourlyRate: number;
  hourlyRateFormatted: string;
  paymentMethod: string;
  paymentAddress: string | null;
  ytdNet: number;
  ytdNetFormatted: string;
  ytdHours: number;
  ytdBonuses: number;
  ytdBonusesFormatted: string;
  ytdCommissions: number;
  ytdCommissionsFormatted: string;
  avgPerPeriod: number;
  avgPerPeriodFormatted: string;
  totalPayPeriods: number;
  pendingCount: number;
  pendingAmount: number;
  pendingAmountFormatted: string;
}

interface PaymentHistoryItem {
  id: string;
  pay_run_id: string;
  hours_worked: number;
  base_pay: number;
  bonus_total: number;
  commission_total: number;
  net_pay: number;
  payment_status: string;
  payment_method: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  paid_at: string | null;
  pay_run: {
    id: string;
    period_start: string;
    period_end: string;
    status: string;
  };
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDate(timestamp: number | string): string {
  const ts = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  return new Date(ts).toLocaleDateString("en-US", {
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

function formatPeriodDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default function ChatterPaymentHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const chatterId = params.id as string;

  const [token, setToken] = useState("");
  const [user, setUser] = useState<CrmUser | null>(null);
  const [summary, setSummary] = useState<ChatterSummary | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  // Fetch chatter summary and payment history
  useEffect(() => {
    if (!token || !chatterId) return;

    async function fetchData() {
      setLoading(true);
      try {
        // Get chatter info
        const { data: chatter, error: chatterError } = await supabase
          .from("crm_chatters")
          .select("id, name, avatar_emoji, hourly_rate, payment_method, payment_details")
          .eq("id", chatterId)
          .single();

        if (chatterError) throw chatterError;

        // Get payment history with pay run info
        const { data: history, error: historyError } = await supabase
          .from("crm_pay_run_items")
          .select("*, pay_run:crm_pay_runs(id, period_start, period_end, status)")
          .eq("chatter_id", chatterId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (historyError) throw historyError;

        setPaymentHistory(history || []);

        // Compute summary from history
        const now = new Date();
        const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

        const ytdItems = (history || []).filter(
          (item) => item.payment_status === "paid" && item.paid_at && item.paid_at >= yearStart
        );

        const ytdNet = ytdItems.reduce((sum, item) => sum + (item.net_pay || 0), 0);
        const ytdHours = ytdItems.reduce((sum, item) => sum + (item.hours_worked || 0), 0);
        const ytdBonuses = ytdItems.reduce((sum, item) => sum + (item.bonus_total || 0), 0);
        const ytdCommissions = ytdItems.reduce((sum, item) => sum + (item.commission_total || 0), 0);

        const pendingItems = (history || []).filter(
          (item) => item.payment_status === "pending" || item.payment_status !== "paid"
        );
        const approvedPending = pendingItems.filter(
          (item) => item.pay_run?.status === "approved"
        );
        const pendingAmount = approvedPending.reduce((sum, item) => sum + (item.net_pay || 0), 0);

        const totalPayPeriods = new Set((history || []).map((item) => item.pay_run_id)).size;
        const avgPerPeriod = totalPayPeriods > 0 ? ytdNet / totalPayPeriods : 0;

        // Get payment address from payment_preferences
        const { data: prefs } = await supabase
          .from("crm_payment_preferences")
          .select("preferred_method, wallet_address, wise_email")
          .eq("chatter_id", chatterId)
          .single();

        const paymentAddress = prefs?.wallet_address || prefs?.wise_email || null;
        const paymentMethod = prefs?.preferred_method || chatter.payment_method || "unknown";

        setSummary({
          chatterName: chatter.name,
          avatarEmoji: chatter.avatar_emoji,
          hourlyRate: chatter.hourly_rate || 0,
          hourlyRateFormatted: formatCents((chatter.hourly_rate || 0) * 100),
          paymentMethod,
          paymentAddress,
          ytdNet,
          ytdNetFormatted: formatCents(ytdNet),
          ytdHours,
          ytdBonuses,
          ytdBonusesFormatted: formatCents(ytdBonuses),
          ytdCommissions,
          ytdCommissionsFormatted: formatCents(ytdCommissions),
          avgPerPeriod,
          avgPerPeriodFormatted: formatCents(avgPerPeriod),
          totalPayPeriods,
          pendingCount: approvedPending.length,
          pendingAmount,
          pendingAmountFormatted: formatCents(pendingAmount),
        });
      } catch (err) {
        console.error("Failed to fetch chatter payment data:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [token, chatterId]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!paymentHistory) return { total: 0, paid: 0, pending: 0 };

    return {
      total: paymentHistory.length,
      paid: paymentHistory.filter((p) => p.payment_status === "paid").length,
      pending: paymentHistory.filter(
        (p) => p.payment_status === "pending" && p.pay_run?.status === "approved"
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
                  onClick={() => router.push(`/payroll/${payment.pay_run_id}`)}
                >
                  <td style={tdStyle}>
                    <div style={{ fontWeight: "500" }}>
                      {formatPeriodDate(payment.pay_run?.period_start)} – {formatPeriodDate(payment.pay_run?.period_end)}
                    </div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {formatHours(payment.hours_worked)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {formatCents(payment.base_pay)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: "var(--green)" }}>
                    {formatCents(payment.bonus_total)}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: "700",
                      fontSize: "15px",
                    }}
                  >
                    {formatCents(payment.net_pay)}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <PayRunStatusBadge
                      status={
                        payment.payment_status === "paid"
                          ? "paid"
                          : payment.pay_run?.status === "approved"
                            ? "approved"
                            : "draft"
                      }
                      size="sm"
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <PaymentMethodIcon
                      method={payment.payment_method || ""}
                      size="sm"
                      showLabel={false}
                    />
                  </td>
                  <td style={tdStyle}>
                    {payment.payment_ref ? (
                      <span
                        style={{
                          fontSize: "12px",
                          fontFamily: "monospace",
                          color: "var(--text-muted)",
                        }}
                      >
                        {payment.payment_ref.length > 16
                          ? `${payment.payment_ref.substring(0, 12)}...`
                          : payment.payment_ref}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </td>
                  <td style={tdStyle}>
                    {payment.payment_date ? (
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        {payment.payment_date}
                      </span>
                    ) : payment.paid_at ? (
                      <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        {formatDate(payment.paid_at)}
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
