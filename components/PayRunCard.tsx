"use client";

import React from "react";
import PayRunStatusBadge from "./PayRunStatusBadge";

interface PayRunCardProps {
  id: string;
  periodStartDate: string;
  periodEndDate: string;
  status: "draft" | "approved" | "paid" | "cancelled" | "payment_initiated" | "payment_failed" | "void";
  totalGrossFormatted: string;
  totalNetFormatted: string;
  lineItemCount: number;
  createdBy: string;
  createdAt: number;
  approvedBy?: string;
  paidAt?: number;
  onClick: () => void;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yearOpts: Intl.DateTimeFormatOptions = { year: "numeric" };
  
  const startStr = startDate.toLocaleDateString("en-US", opts);
  const endStr = endDate.toLocaleDateString("en-US", opts);
  const year = endDate.toLocaleDateString("en-US", yearOpts);
  
  return `${startStr} – ${endStr}, ${year}`;
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function PayRunCard({
  periodStartDate,
  periodEndDate,
  status,
  totalGrossFormatted,
  totalNetFormatted,
  lineItemCount,
  createdBy,
  createdAt,
  approvedBy,
  paidAt,
  onClick,
}: PayRunCardProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--surface)",
        borderRadius: "20px",
        padding: "20px 24px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        border: status === "paid" ? "2px solid var(--green)" : "1px solid var(--border)",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)";
        e.currentTarget.style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: "600", color: "var(--text)", marginBottom: "4px" }}>
            {formatDateRange(periodStartDate, periodEndDate)}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>
            {lineItemCount} chatter{lineItemCount !== 1 ? "s" : ""} • Created by {createdBy}
          </div>
        </div>
        <PayRunStatusBadge status={status} />
      </div>

      {/* Amounts */}
      <div style={{ display: "flex", gap: "24px", marginBottom: "12px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
            Gross
          </div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>
            {totalGrossFormatted}
          </div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "2px" }}>
            Net
          </div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "var(--accent)" }}>
            {totalNetFormatted}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "16px" }}>
        <span>Created {formatTimeAgo(createdAt)}</span>
        {approvedBy && <span>• Approved by {approvedBy}</span>}
        {paidAt && <span>• Paid {formatTimeAgo(paidAt)}</span>}
      </div>
    </div>
  );
}
