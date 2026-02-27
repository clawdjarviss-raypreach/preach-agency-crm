"use client";

import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";

export default function ReportsPage() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<any>(null);
  const [expandedReport, setExpandedReport] = useState<string | null>(null);
  const [dateFilter, setDateFilter] = useState(() => new Date().toISOString().split("T")[0]);

  useEffect(() => {
    const t = localStorage.getItem("crm_token") || "";
    const u = localStorage.getItem("crm_user");
    setToken(t);
    if (u) setUser(JSON.parse(u));
  }, []);

  const isAdmin = user?.role === "admin" || user?.role === "supervisor" || user?.role === "manager";

  // Chatters see own reports; admins see all for a date
  const ownReports = useQuery(
    api.crm.salesReports.listByChatter,
    token && !isAdmin ? { token } : "skip"
  );

  const allReports = useQuery(
    api.crm.salesReports.listByDate,
    token && isAdmin ? { token, date: dateFilter } : "skip"
  );

  const reports = isAdmin ? allReports : ownReports;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "submitted":
        return { color: "var(--orange)", bg: "var(--orange-bg)", label: "Submitted" };
      case "reviewed":
        return { color: "var(--green)", bg: "var(--green-bg)", label: "Reviewed" };
      case "flagged":
        return { color: "var(--red)", bg: "var(--red-bg)", label: "Flagged" };
      default:
        return { color: "var(--text-muted)", bg: "var(--border-subtle)", label: status };
    }
  };

  if (!user) return null;

  return (
    <div style={{ maxWidth: "900px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "28px",
          flexWrap: "wrap",
          gap: "16px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "28px", fontWeight: "700", color: "var(--text)" }}>
            📝 Reports
          </h1>
          <p style={{ fontSize: "15px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {isAdmin ? "All team reports" : "Your submitted reports"}
          </p>
        </div>
        <Link
          href="/reports/submit"
          style={{
            padding: "12px 24px",
            fontSize: "15px",
            fontWeight: "600",
            color: "#ffffff",
            background: "var(--accent)",
            borderRadius: "12px",
          }}
        >
          + New Report
        </Link>
      </div>

      {/* Date filter for admins */}
      {isAdmin && (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "16px",
            padding: "16px 20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <label style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-secondary)" }}>
            Filter by date:
          </label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            style={{
              padding: "10px 14px",
              fontSize: "14px",
              border: "2px solid var(--border)",
              borderRadius: "10px",
              background: "var(--bg)",
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>
      )}

      {/* Reports list */}
      {!reports || reports.length === 0 ? (
        <div
          style={{
            background: "var(--surface)",
            borderRadius: "24px",
            padding: "48px 24px",
            textAlign: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📝</div>
          <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>
            No reports found
          </h3>
          <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "24px" }}>
            {isAdmin ? "No reports for this date" : "Submit your first report to get started"}
          </p>
          <Link
            href="/reports/submit"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              fontSize: "15px",
              fontWeight: "600",
              color: "#ffffff",
              background: "var(--accent)",
              borderRadius: "12px",
            }}
          >
            Submit Report
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {reports.map((report: any) => {
            const badge = getStatusBadge(report.status);
            const isExpanded = expandedReport === (report.id || report._id);
            const reportId = report.id || report._id;

            return (
              <div
                key={reportId}
                style={{
                  background: "var(--surface)",
                  borderRadius: "20px",
                  overflow: "hidden",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                }}
              >
                {/* Header row */}
                <button
                  onClick={() => setExpandedReport(isExpanded ? null : reportId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    width: "100%",
                    padding: "20px 24px",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    flexWrap: "wrap",
                    gap: "12px",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
                      {report.date
                        ? new Date(report.date + "T12:00:00").toLocaleDateString("en-US", {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })
                        : "Unknown date"}
                    </div>
                    {isAdmin && report.chatter && (
                      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "2px" }}>
                        {report.chatter.name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--accent)" }}>
                      ${(report.totalSales || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div
                      style={{
                        padding: "4px 10px",
                        fontSize: "11px",
                        fontWeight: "600",
                        color: badge.color,
                        background: badge.bg,
                        borderRadius: "8px",
                        textTransform: "uppercase",
                      }}
                    >
                      {badge.label}
                    </div>
                    <span style={{ fontSize: "16px", color: "var(--text-muted)", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>
                      ▼
                    </span>
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{ padding: "0 24px 24px", borderTop: "1px solid var(--border-subtle)" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "12px",
                        padding: "16px 0",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Busyness
                        </div>
                        <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
                          {report.busynessRating}/10
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                          Spenders
                        </div>
                        <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)" }}>
                          {report.spenderCount || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
