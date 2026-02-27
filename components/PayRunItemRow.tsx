"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import PayRunStatusBadge from "./PayRunStatusBadge";
import PaymentMethodIcon from "./PaymentMethodIcon";

interface PayRunItemRowProps {
  id: string;
  chatterName: string;
  chatterId: string;
  hoursWorked: number;
  basePayFormatted: string;
  bonusTotalFormatted: string;
  commissionTotalFormatted: string;
  deductionsFormatted: string;
  grossPayFormatted: string;
  netPayFormatted: string;
  paymentStatus: "pending" | "processing" | "paid" | "failed";
  paymentMethod?: string;
  paymentRef?: string;
  paymentDate?: string;
  paymentNotes?: string;
  breakdown?: {
    shifts?: Array<{ date: string; hours: number; amount: number }>;
    bonuses?: Array<{ description: string; amount: number }>;
    commissions?: Array<{ description: string; amount: number }>;
  };
  isApproved: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  onMarkPaid?: (id: string) => void;
}

function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function PayRunItemRow({
  id,
  chatterName,
  chatterId,
  hoursWorked,
  basePayFormatted,
  bonusTotalFormatted,
  commissionTotalFormatted,
  deductionsFormatted,
  grossPayFormatted,
  netPayFormatted,
  paymentStatus,
  paymentMethod,
  paymentRef,
  paymentDate,
  paymentNotes,
  breakdown,
  isApproved,
  selected,
  onSelect,
  onMarkPaid,
}: PayRunItemRowProps) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  
  const hasBreakdown = breakdown && (
    (breakdown.shifts && breakdown.shifts.length > 0) ||
    (breakdown.bonuses && breakdown.bonuses.length > 0) ||
    (breakdown.commissions && breakdown.commissions.length > 0)
  );

  const cellStyle: React.CSSProperties = {
    padding: "14px 12px",
    fontSize: "14px",
    color: "var(--text)",
    borderBottom: expanded ? "none" : "1px solid var(--border-subtle)",
  };

  const expandedCellStyle: React.CSSProperties = {
    padding: "0 12px 14px",
    borderBottom: "1px solid var(--border-subtle)",
  };

  return (
    <>
      <tr 
        style={{ 
          background: selected ? "var(--accent-bg)" : "transparent",
          cursor: hasBreakdown ? "pointer" : "default",
        }}
        onClick={() => hasBreakdown && setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <td style={{ ...cellStyle, width: "40px", textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          {isApproved && paymentStatus !== "paid" && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onSelect(id)}
              style={{ width: "16px", height: "16px", cursor: "pointer" }}
            />
          )}
        </td>

        {/* Chatter Name */}
        <td style={cellStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {hasBreakdown && (
              <span style={{ 
                fontSize: "12px", 
                color: "var(--text-muted)",
                transition: "transform 0.2s",
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              }}>
                ▶
              </span>
            )}
            <div 
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/payroll/chatter/${chatterId}`);
              }}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, var(--accent) 0%, #f1ae38 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                color: "#fff",
                fontWeight: "600",
                cursor: "pointer",
              }}
              title="View payment history"
            >
              {chatterName.charAt(0).toUpperCase()}
            </div>
            <span 
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/payroll/chatter/${chatterId}`);
              }}
              style={{ fontWeight: "500", cursor: "pointer" }}
              title="View payment history"
            >
              {chatterName}
            </span>
            <PaymentMethodIcon method={paymentMethod} size="sm" showLabel={false} />
          </div>
        </td>

        {/* Hours */}
        <td style={{ ...cellStyle, textAlign: "right" }}>
          {formatHours(hoursWorked)}
        </td>

        {/* Base Pay */}
        <td style={{ ...cellStyle, textAlign: "right" }}>
          {basePayFormatted}
        </td>

        {/* Bonuses */}
        <td style={{ ...cellStyle, textAlign: "right", color: "var(--green)" }}>
          {bonusTotalFormatted}
        </td>

        {/* Commissions */}
        <td style={{ ...cellStyle, textAlign: "right", color: "var(--accent)" }}>
          {commissionTotalFormatted}
        </td>

        {/* Deductions */}
        <td style={{ ...cellStyle, textAlign: "right", color: "var(--red)" }}>
          {deductionsFormatted !== "$0.00" ? `-${deductionsFormatted}` : "—"}
        </td>

        {/* Net Pay */}
        <td style={{ ...cellStyle, textAlign: "right", fontWeight: "700", fontSize: "15px" }}>
          {netPayFormatted}
        </td>

        {/* Status */}
        <td style={{ ...cellStyle, textAlign: "center" }}>
          <PayRunStatusBadge status={paymentStatus} size="sm" />
        </td>

        {/* Action */}
        <td style={{ ...cellStyle, textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
          {isApproved && paymentStatus !== "paid" && onMarkPaid && (
            <button
              onClick={() => onMarkPaid(id)}
              style={{
                padding: "6px 12px",
                fontSize: "12px",
                fontWeight: "600",
                background: "var(--green-bg)",
                color: "var(--green)",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
              }}
            >
              💰 Pay
            </button>
          )}
          {paymentStatus === "paid" && paymentRef && (
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
              {paymentRef.substring(0, 8)}...
            </span>
          )}
        </td>
      </tr>

      {/* Expanded Breakdown */}
      {expanded && hasBreakdown && (
        <tr>
          <td colSpan={10} style={expandedCellStyle}>
            <div style={{
              background: "var(--bg)",
              borderRadius: "12px",
              padding: "16px 20px",
              marginTop: "8px",
              marginLeft: "40px",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
                {/* Shifts Breakdown */}
                {breakdown.shifts && breakdown.shifts.length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase" }}>
                      ⏱️ Shifts ({breakdown.shifts.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {breakdown.shifts.slice(0, 5).map((shift, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-muted)" }}>{shift.date}</span>
                          <span style={{ color: "var(--text)" }}>{formatHours(shift.hours)} = ${(shift.amount / 100).toFixed(2)}</span>
                        </div>
                      ))}
                      {breakdown.shifts.length > 5 && (
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          +{breakdown.shifts.length - 5} more shifts
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Bonuses Breakdown */}
                {breakdown.bonuses && breakdown.bonuses.length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase" }}>
                      🎁 Bonuses ({breakdown.bonuses.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {breakdown.bonuses.map((bonus, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-muted)" }}>{bonus.description}</span>
                          <span style={{ color: "var(--green)" }}>${(bonus.amount / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Commissions Breakdown */}
                {breakdown.commissions && breakdown.commissions.length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "8px", textTransform: "uppercase" }}>
                      💵 Commissions ({breakdown.commissions.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      {breakdown.commissions.map((comm, i) => (
                        <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                          <span style={{ color: "var(--text-muted)" }}>{comm.description}</span>
                          <span style={{ color: "var(--accent)" }}>${(comm.amount / 100).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Payment Info */}
              {(paymentMethod || paymentRef || paymentDate) && (
                <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                    {paymentMethod && (
                      <PaymentMethodIcon method={paymentMethod} size="sm" />
                    )}
                    {paymentRef && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        📝 Ref: <span style={{ fontFamily: "monospace" }}>{paymentRef}</span>
                      </span>
                    )}
                    {paymentDate && (
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        📅 {paymentDate}
                      </span>
                    )}
                  </div>
                  {paymentNotes && (
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "8px", fontStyle: "italic" }}>
                      💬 {paymentNotes}
                    </div>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
