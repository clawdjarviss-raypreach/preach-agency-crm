"use client";

import React from "react";

interface PaymentMethodIconProps {
  method?: string | null;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const PAYMENT_METHODS: Record<
  string,
  { icon: string; label: string; color: string; bgColor: string }
> = {
  usdc: {
    icon: "💵",
    label: "USDC",
    color: "#2775CA",
    bgColor: "rgba(39, 117, 202, 0.1)",
  },
  usdt: {
    icon: "💲",
    label: "USDT",
    color: "#26A17B",
    bgColor: "rgba(38, 161, 123, 0.1)",
  },
  wise: {
    icon: "🌍",
    label: "Wise",
    color: "#00B9FF",
    bgColor: "rgba(0, 185, 255, 0.1)",
  },
  bank: {
    icon: "🏦",
    label: "Bank",
    color: "#6B7280",
    bgColor: "rgba(107, 114, 128, 0.1)",
  },
  paypal: {
    icon: "💳",
    label: "PayPal",
    color: "#003087",
    bgColor: "rgba(0, 48, 135, 0.1)",
  },
  crypto: {
    icon: "🔐",
    label: "Crypto",
    color: "#F7931A",
    bgColor: "rgba(247, 147, 26, 0.1)",
  },
  cash: {
    icon: "💰",
    label: "Cash",
    color: "#059669",
    bgColor: "rgba(5, 150, 105, 0.1)",
  },
};

const DEFAULT_METHOD = {
  icon: "❓",
  label: "Unknown",
  color: "var(--text-muted)",
  bgColor: "var(--bg)",
};

const SIZES = {
  sm: { icon: 14, padding: "4px 8px", fontSize: 11, gap: 4 },
  md: { icon: 18, padding: "6px 12px", fontSize: 13, gap: 6 },
  lg: { icon: 24, padding: "8px 16px", fontSize: 15, gap: 8 },
};

export default function PaymentMethodIcon({
  method,
  size = "md",
  showLabel = true,
}: PaymentMethodIconProps) {
  const normalizedMethod = method?.toLowerCase().trim() ?? "";
  const methodInfo = PAYMENT_METHODS[normalizedMethod] ?? DEFAULT_METHOD;
  const sizeInfo = SIZES[size];

  if (!method) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: sizeInfo.padding,
          fontSize: sizeInfo.fontSize,
          color: "var(--text-muted)",
          background: "var(--bg)",
          borderRadius: size === "sm" ? "6px" : "8px",
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: sizeInfo.icon }}>—</span>
        {showLabel && (
          <span style={{ marginLeft: sizeInfo.gap }}>Not set</span>
        )}
      </span>
    );
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: sizeInfo.padding,
        fontSize: sizeInfo.fontSize,
        color: methodInfo.color,
        background: methodInfo.bgColor,
        borderRadius: size === "sm" ? "6px" : "8px",
        fontWeight: 600,
      }}
    >
      <span style={{ fontSize: sizeInfo.icon }}>{methodInfo.icon}</span>
      {showLabel && (
        <span style={{ marginLeft: sizeInfo.gap }}>{methodInfo.label}</span>
      )}
    </span>
  );
}

// Helper to get just the emoji icon
export function getPaymentMethodEmoji(method?: string | null): string {
  if (!method) return "—";
  const normalizedMethod = method.toLowerCase().trim();
  return PAYMENT_METHODS[normalizedMethod]?.icon ?? "❓";
}

// Helper to get the label
export function getPaymentMethodLabel(method?: string | null): string {
  if (!method) return "Not set";
  const normalizedMethod = method.toLowerCase().trim();
  return PAYMENT_METHODS[normalizedMethod]?.label ?? method;
}
