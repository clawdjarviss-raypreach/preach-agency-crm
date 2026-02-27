"use client";

import React, { useState, useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import PaymentMethodIcon, { getPaymentMethodLabel } from "./PaymentMethodIcon";

interface BatchPaymentModalProps {
  token: string;
  payRunId?: Id<"crm_pay_runs">;
  selectedItemIds?: string[];
  onClose: () => void;
  onSuccess: (count: number) => void;
}

type TabMode = "mark-paid" | "export" | "import";

export default function BatchPaymentModal({
  token,
  payRunId,
  selectedItemIds,
  onClose,
  onSuccess,
}: BatchPaymentModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("mark-paid");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [paymentNotes, setPaymentNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importData, setImportData] = useState("");
  const [importResult, setImportResult] = useState<{
    successCount: number;
    skipCount: number;
    errors: string[];
  } | null>(null);

  const itemsForExport = useQuery(
    api.crm.payroll.getItemsForExport,
    token && payRunId ? { token, payRunId } : "skip"
  );

  const batchMarkPaid = useMutation(api.crm.payroll.batchMarkPaid);
  const importConfirmations = useMutation(
    api.crm.payroll.importPaymentConfirmations
  );

  const pendingItems = useMemo(() => {
    if (!itemsForExport) return [];
    return itemsForExport.filter((i) => i.paymentStatus === "pending");
  }, [itemsForExport]);

  const handleBatchMarkPaid = async () => {
    if (!selectedItemIds || selectedItemIds.length === 0) {
      setError("No items selected");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await batchMarkPaid({
        token,
        itemIds: selectedItemIds as Id<"crm_pay_run_items">[],
        paymentRef: paymentRef || undefined,
        paymentDate: paymentDate || undefined,
        paymentNotes: paymentNotes || undefined,
      });
      onSuccess(selectedItemIds.length);
    } catch (err: any) {
      setError(err.message || "Failed to mark items as paid");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = useCallback(() => {
    if (!pendingItems.length) return;

    // Generate CSV content
    const headers = [
      "Item ID",
      "Chatter Name",
      "Net Pay",
      "Payment Method",
      "Payment Address",
      "Period",
      "Payment Ref",
      "Payment Date",
      "Notes",
    ];

    const rows = pendingItems.map((item) => [
      item.itemId,
      item.chatterName,
      (item.netPay / 100).toFixed(2),
      item.paymentMethod,
      item.paymentAddress,
      `${item.periodStartDate} to ${item.periodEndDate}`,
      "", // Payment Ref (to be filled)
      "", // Payment Date (to be filled)
      "", // Notes (to be filled)
    ]);

    const csvContent = [headers.join(",")]
      .concat(rows.map((row) => row.map((cell) => `"${cell}"`).join(",")))
      .join("\n");

    // Download CSV
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `payment-export-${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [pendingItems]);

  const handleImport = async () => {
    if (!importData.trim()) {
      setError("Please paste payment data");
      return;
    }

    setLoading(true);
    setError("");
    setImportResult(null);

    try {
      // Parse CSV/JSON data
      const lines = importData.trim().split("\n");
      const confirmations: Array<{
        itemId: Id<"crm_pay_run_items">;
        paymentRef: string;
        paymentDate?: string;
        paymentNotes?: string;
      }> = [];

      // Try to detect format
      const firstLine = lines[0].trim();
      const isCSV = firstLine.includes(",");

      if (isCSV) {
        // Skip header row if present
        const startRow = firstLine.toLowerCase().includes("item id") ? 1 : 0;

        for (let i = startRow; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;

          // Parse CSV line (handle quoted values)
          const parts = line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g);
          if (!parts || parts.length < 7) continue;

          const cleanPart = (s: string) => s.replace(/^"|"$/g, "").trim();

          const itemId = cleanPart(parts[0]);
          const paymentRef = cleanPart(parts[6] || "");
          const paymentDate = cleanPart(parts[7] || "");
          const paymentNotes = cleanPart(parts[8] || "");

          if (itemId && paymentRef) {
            confirmations.push({
              itemId: itemId as Id<"crm_pay_run_items">,
              paymentRef,
              paymentDate: paymentDate || undefined,
              paymentNotes: paymentNotes || undefined,
            });
          }
        }
      } else {
        // Try JSON format
        try {
          const jsonData = JSON.parse(importData);
          const items = Array.isArray(jsonData) ? jsonData : [jsonData];
          for (const item of items) {
            if (item.itemId && item.paymentRef) {
              confirmations.push({
                itemId: item.itemId,
                paymentRef: item.paymentRef,
                paymentDate: item.paymentDate,
                paymentNotes: item.paymentNotes,
              });
            }
          }
        } catch {
          setError("Invalid format. Please use CSV or JSON.");
          setLoading(false);
          return;
        }
      }

      if (confirmations.length === 0) {
        setError("No valid payment confirmations found in the data");
        setLoading(false);
        return;
      }

      const result = await importConfirmations({
        token,
        confirmations,
      });

      setImportResult(result);

      if (result.successCount > 0) {
        setTimeout(() => {
          onSuccess(result.successCount);
        }, 2000);
      }
    } catch (err: any) {
      setError(err.message || "Failed to import payment confirmations");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--surface)",
          borderRadius: "20px",
          width: "90%",
          maxWidth: "700px",
          maxHeight: "90vh",
          overflow: "auto",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2
            style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}
          >
            💰 Batch Payment Operations
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            padding: "0 24px",
          }}
        >
          {[
            { id: "mark-paid" as TabMode, label: "Mark Paid", icon: "✅" },
            { id: "export" as TabMode, label: "Export for Payment", icon: "📤" },
            {
              id: "import" as TabMode,
              label: "Import Confirmations",
              icon: "📥",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setError("");
                setImportResult(null);
              }}
              style={{
                padding: "16px 20px",
                fontSize: "14px",
                fontWeight: "600",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab.id
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                color:
                  activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: "24px" }}>
          {error && (
            <div
              style={{
                padding: "14px 20px",
                background: "var(--red-bg)",
                color: "var(--red)",
                borderRadius: "12px",
                marginBottom: "16px",
                fontSize: "14px",
                fontWeight: "500",
              }}
            >
              ❌ {error}
            </div>
          )}

          {/* Mark Paid Tab */}
          {activeTab === "mark-paid" && (
            <div>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  marginBottom: "20px",
                }}
              >
                Mark {selectedItemIds?.length ?? 0} selected items as paid with
                the following details:
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                    }}
                  >
                    Payment Reference (Transaction ID)
                  </label>
                  <input
                    type="text"
                    value={paymentRef}
                    onChange={(e) => setPaymentRef(e.target.value)}
                    placeholder="e.g., TXN-12345 or wire transfer ref"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      fontSize: "14px",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      background: "var(--bg)",
                      color: "var(--text)",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                    }}
                  >
                    Payment Date
                  </label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      fontSize: "14px",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      background: "var(--bg)",
                      color: "var(--text)",
                    }}
                  />
                </div>

                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                      marginBottom: "8px",
                    }}
                  >
                    Notes (optional)
                  </label>
                  <textarea
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                    placeholder="Add any notes about this payment..."
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      fontSize: "14px",
                      border: "1px solid var(--border)",
                      borderRadius: "10px",
                      background: "var(--bg)",
                      color: "var(--text)",
                      resize: "vertical",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={handleBatchMarkPaid}
                disabled={loading || !selectedItemIds?.length}
                style={{
                  marginTop: "24px",
                  width: "100%",
                  padding: "14px 24px",
                  fontSize: "15px",
                  fontWeight: "600",
                  background: loading ? "var(--text-muted)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Processing..." : `✅ Mark ${selectedItemIds?.length ?? 0} Items as Paid`}
              </button>
            </div>
          )}

          {/* Export Tab */}
          {activeTab === "export" && (
            <div>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  marginBottom: "20px",
                }}
              >
                Export pending payment items as CSV for processing. Fill in the
                payment reference column after processing, then import to mark
                items as paid.
              </p>

              <div
                style={{
                  background: "var(--bg)",
                  borderRadius: "12px",
                  padding: "16px",
                  marginBottom: "20px",
                }}
              >
                <h4
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    marginBottom: "12px",
                    color: "var(--text)",
                  }}
                >
                  Items to Export ({pendingItems.length})
                </h4>

                {pendingItems.length === 0 ? (
                  <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
                    No pending items to export
                  </p>
                ) : (
                  <div style={{ maxHeight: "200px", overflow: "auto" }}>
                    <table style={{ width: "100%", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          <th
                            style={{
                              textAlign: "left",
                              padding: "8px 4px",
                              color: "var(--text-muted)",
                            }}
                          >
                            Chatter
                          </th>
                          <th
                            style={{
                              textAlign: "right",
                              padding: "8px 4px",
                              color: "var(--text-muted)",
                            }}
                          >
                            Amount
                          </th>
                          <th
                            style={{
                              textAlign: "center",
                              padding: "8px 4px",
                              color: "var(--text-muted)",
                            }}
                          >
                            Method
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingItems.map((item) => (
                          <tr
                            key={item.itemId}
                            style={{ borderBottom: "1px solid var(--border-subtle)" }}
                          >
                            <td style={{ padding: "8px 4px" }}>{item.chatterName}</td>
                            <td style={{ textAlign: "right", padding: "8px 4px" }}>
                              {item.netPayFormatted}
                            </td>
                            <td style={{ textAlign: "center", padding: "8px 4px" }}>
                              <PaymentMethodIcon
                                method={item.paymentMethod}
                                size="sm"
                                showLabel={false}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <button
                onClick={handleExport}
                disabled={pendingItems.length === 0}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  fontSize: "15px",
                  fontWeight: "600",
                  background:
                    pendingItems.length === 0
                      ? "var(--text-muted)"
                      : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  cursor: pendingItems.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                📤 Export {pendingItems.length} Items as CSV
              </button>
            </div>
          )}

          {/* Import Tab */}
          {activeTab === "import" && (
            <div>
              <p
                style={{
                  fontSize: "14px",
                  color: "var(--text-secondary)",
                  marginBottom: "20px",
                }}
              >
                Paste the CSV data with payment confirmations. Required columns:
                Item ID, Payment Ref. Optional: Payment Date, Notes.
              </p>

              {importResult && (
                <div
                  style={{
                    padding: "16px",
                    background: importResult.successCount > 0 ? "var(--green-bg)" : "var(--orange-bg)",
                    borderRadius: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <p style={{ fontSize: "14px", fontWeight: "600", marginBottom: "8px" }}>
                    ✅ Import Complete
                  </p>
                  <p style={{ fontSize: "13px" }}>
                    Successfully marked: {importResult.successCount} |
                    Skipped: {importResult.skipCount}
                  </p>
                  {importResult.errors.length > 0 && (
                    <div style={{ marginTop: "8px", fontSize: "12px", color: "var(--red)" }}>
                      Errors:
                      <ul style={{ margin: "4px 0 0 16px" }}>
                        {importResult.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {importResult.errors.length > 5 && (
                          <li>...and {importResult.errors.length - 5} more</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder={`Paste CSV data here, e.g.:
Item ID,Chatter Name,Net Pay,Payment Method,Payment Address,Period,Payment Ref,Payment Date,Notes
"j57...",John,150.00,usdc,0x...,2026-02-01 to 2026-02-07,"TXN-123",2026-02-07,"Paid via Coinbase"`}
                rows={8}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  fontSize: "13px",
                  fontFamily: "monospace",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  background: "var(--bg)",
                  color: "var(--text)",
                  resize: "vertical",
                  marginBottom: "20px",
                }}
              />

              <button
                onClick={handleImport}
                disabled={loading || !importData.trim()}
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  fontSize: "15px",
                  fontWeight: "600",
                  background: loading || !importData.trim() ? "var(--text-muted)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  cursor: loading || !importData.trim() ? "not-allowed" : "pointer",
                }}
              >
                {loading ? "Importing..." : "📥 Import Payment Confirmations"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
