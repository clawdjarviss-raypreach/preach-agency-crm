"use client";

import React from "react";

type PayRunStatus = "draft" | "approved" | "paid" | "cancelled" | "payment_initiated" | "payment_failed" | "void";
type PaymentStatus = "pending" | "processing" | "paid" | "failed";

interface PayRunStatusBadgeProps {
  status: PayRunStatus | PaymentStatus;
  size?: "sm" | "md";
}

const STATUS_CONFIG: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  // Pay run statuses
  draft: { emoji: "📝", label: "Draft", color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" },
  approved: { emoji: "✅", label: "Approved", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.1)" },
  paid: { emoji: "💰", label: "Paid", color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
  cancelled: { emoji: "❌", label: "Cancelled", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
  payment_initiated: { emoji: "🚀", label: "Payment Initiated", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  payment_failed: { emoji: "⚠️", label: "Payment Failed", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
  void: { emoji: "🚫", label: "Void", color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" },
  // Payment statuses
  pending: { emoji: "⏳", label: "Pending", color: "#6b7280", bg: "rgba(107, 114, 128, 0.1)" },
  processing: { emoji: "⚙️", label: "Processing", color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
  failed: { emoji: "⚠️", label: "Failed", color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
};

export default function PayRunStatusBadge({ status, size = "md" }: PayRunStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const isSmall = size === "sm";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: isSmall ? "4px" : "6px",
        padding: isSmall ? "3px 8px" : "5px 12px",
        fontSize: isSmall ? "11px" : "12px",
        fontWeight: "600",
        color: config.color,
        background: config.bg,
        borderRadius: "8px",
        textTransform: "uppercase",
        letterSpacing: "0.3px",
      }}
    >
      <span style={{ fontSize: isSmall ? "10px" : "12px" }}>{config.emoji}</span>
      {config.label}
    </span>
  );
}
