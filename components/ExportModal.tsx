"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import PaymentMethodIcon, { getPaymentMethodLabel } from "./PaymentMethodIcon";
import {
  generateExport,
  validateForExport,
  parseImportData,
  getExportFormats,
  getPaymentMethods,
  generateCryptoCSV,
  type ExportItem,
  type ExportOptions,
  type ValidationResult,
} from "../lib/export-engine";

interface ExportModalProps {
  token: string;
  payRunId?: Id<"crm_pay_runs">;
  selectedItemIds?: string[];
  onClose: () => void;
  onSuccess?: (message: string) => void;
}

type TabMode = "export" | "import" | "validation";

export default function ExportModal({
  token,
  payRunId,
  selectedItemIds,
  onClose,
  onSuccess,
}: ExportModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>("export");
  const [exportFormat, setExportFormat] = useState<string>("csv");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [importData, setImportData] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Queries
  const exportableItems = useQuery(
    api.crm.export.getExportableItems,
    token
      ? {
          token,
          payRunId,
          paymentMethod: paymentMethodFilter === "all" ? undefined : paymentMethodFilter,
          itemIds: selectedItemIds,
        }
      : "skip"
  );

  const exportSummary = useQuery(
    api.crm.export.getExportSummary,
    token ? { token, payRunId } : "skip"
  );

  const missingInfo = useQuery(
    api.crm.export.getItemsWithMissingInfo,
    token ? { token, payRunId } : "skip"
  );

  // Mutations
  const markExported = useMutation(api.crm.export.markItemsExported);
  const importConfirmations = useMutation(api.crm.export.importConfirmations);

  // Filtered items based on selection and method filter
  const filteredItems = useMemo(() => {
    if (!exportableItems) return [];
    return exportableItems as ExportItem[];
  }, [exportableItems]);

  // Validate items when tab changes to validation
  useEffect(() => {
    if (activeTab === "validation" && filteredItems.length > 0) {
      const result = validateForExport(
        filteredItems,
        paymentMethodFilter === "all" ? undefined : paymentMethodFilter
      );
      setValidation(result);
    }
  }, [activeTab, filteredItems, paymentMethodFilter]);

  // Calculate totals
  const totals = useMemo(() => {
    const total = filteredItems.reduce((sum, item) => sum + item.netPay, 0);
    return {
      count: filteredItems.length,
      total,
      totalFormatted: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(total / 100),
    };
  }, [filteredItems]);

  // Handle export
  const handleExport = useCallback(async () => {
    if (filteredItems.length === 0) {
      setError("No items to export");
      return;
    }

    setLoading(true);
    setError("");

    try {
      // Validate before export
      const validationResult = validateForExport(
        filteredItems,
        paymentMethodFilter === "all" ? undefined : paymentMethodFilter
      );

      if (!validationResult.valid && validationResult.errors.length > 0) {
        setValidation(validationResult);
        setActiveTab("validation");
        setLoading(false);
        return;
      }

      // Generate export
      const options: ExportOptions = {
        format: exportFormat as any,
        includeHeaders: true,
        currency: "USD",
        batchName: payRunId ? `Pay Run Export` : `Payroll Export`,
      };

      let result;
      if (exportFormat === "usdc-csv") {
        result = generateCryptoCSV(validationResult.validItems, { ...options, tokenType: "usdc" });
      } else if (exportFormat === "usdt-csv") {
        result = generateCryptoCSV(validationResult.validItems, { ...options, tokenType: "usdt" });
      } else {
        result = generateExport(validationResult.validItems, options);
      }

      // Download file
      const blob = new Blob([result.content], { type: result.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Mark items as exported
      await markExported({
        token,
        itemIds: validationResult.validItems.map((i) => i.itemId as Id<"crm_pay_run_items">),
        exportFilename: result.filename,
        exportFormat,
      });

      onSuccess?.(`Exported ${result.itemCount} items (${result.totalAmountFormatted})`);
    } catch (err: any) {
      setError(err.message || "Export failed");
    } finally {
      setLoading(false);
    }
  }, [filteredItems, exportFormat, paymentMethodFilter, token, payRunId, markExported, onSuccess]);

  // Handle import
  const handleImport = useCallback(async () => {
    if (!importData.trim()) {
      setError("Please paste payment confirmation data");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const parseResult = parseImportData(importData);

      if (!parseResult.success) {
        setError(parseResult.errors.join(", "));
        setLoading(false);
        return;
      }

      const result = await importConfirmations({
        token,
        confirmations: parseResult.confirmations.map((c) => ({
          itemId: c.itemId,
          paymentRef: c.paymentRef,
          paymentDate: c.paymentDate,
          paymentNotes: c.paymentNotes,
          status: c.status,
        })),
      });

      if (result.successCount > 0) {
        onSuccess?.(
          `Imported ${result.successCount} payment confirmations${
            result.failedCount > 0 ? ` (${result.failedCount} failed)` : ""
          }${result.skipCount > 0 ? ` (${result.skipCount} skipped)` : ""}`
        );
      } else {
        setError(
          result.errors.length > 0
            ? result.errors.slice(0, 3).join(", ")
            : "No confirmations were imported"
        );
      }
    } catch (err: any) {
      setError(err.message || "Import failed");
    } finally {
      setLoading(false);
    }
  }, [importData, token, importConfirmations, onSuccess]);

  // Export formats
  const exportFormats = getExportFormats();
  const paymentMethods = getPaymentMethods();

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
          maxWidth: "800px",
          maxHeight: "90vh",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h2 style={{ fontSize: "20px", fontWeight: "700", color: "var(--text)" }}>
            📤 Export for Payment
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "24px",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: "4px",
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
            { id: "export" as TabMode, label: "Export", icon: "📤" },
            { id: "import" as TabMode, label: "Import Confirmations", icon: "📥" },
            {
              id: "validation" as TabMode,
              label: `Issues${missingInfo && missingInfo.length > 0 ? ` (${missingInfo.length})` : ""}`,
              icon: "⚠️",
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setError("");
              }}
              style={{
                padding: "14px 18px",
                fontSize: "14px",
                fontWeight: "600",
                background: "transparent",
                border: "none",
                borderBottom:
                  activeTab === tab.id ? "3px solid var(--accent)" : "3px solid transparent",
                color: activeTab === tab.id ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px" }}>
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

          {/* Export Tab */}
          {activeTab === "export" && (
            <div>
              {/* Summary Stats */}
              {exportSummary && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                    gap: "12px",
                    marginBottom: "20px",
                  }}
                >
                  <div style={statCardStyle}>
                    <div style={{ fontSize: "24px" }}>📝</div>
                    <div>
                      <div style={statLabelStyle}>Total Pending</div>
                      <div style={statValueStyle}>{exportSummary.totalPending}</div>
                    </div>
                  </div>
                  <div style={statCardStyle}>
                    <div style={{ fontSize: "24px" }}>✅</div>
                    <div>
                      <div style={statLabelStyle}>Ready to Export</div>
                      <div style={statValueStyle}>{exportSummary.readyToExport}</div>
                    </div>
                  </div>
                  <div style={statCardStyle}>
                    <div style={{ fontSize: "24px" }}>⚠️</div>
                    <div>
                      <div style={statLabelStyle}>Missing Info</div>
                      <div style={{ ...statValueStyle, color: "var(--orange)" }}>
                        {exportSummary.missingPaymentInfo}
                      </div>
                    </div>
                  </div>
                  <div style={statCardStyle}>
                    <div style={{ fontSize: "24px" }}>💰</div>
                    <div>
                      <div style={statLabelStyle}>Total Amount</div>
                      <div style={statValueStyle}>{exportSummary.totalPendingAmountFormatted}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  gap: "16px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                {/* Payment Method Filter */}
                <div>
                  <label style={labelStyle}>Payment Method</label>
                  <select
                    value={paymentMethodFilter}
                    onChange={(e) => setPaymentMethodFilter(e.target.value)}
                    style={selectStyle}
                  >
                    <option value="all">All Methods</option>
                    {paymentMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.icon} {method.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Export Format */}
                <div>
                  <label style={labelStyle}>Export Format</label>
                  <select
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    style={selectStyle}
                  >
                    {exportFormats.map((format) => (
                      <option key={format.id} value={format.id}>
                        {format.icon} {format.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Format Description */}
              <div
                style={{
                  padding: "12px 16px",
                  background: "var(--bg)",
                  borderRadius: "10px",
                  marginBottom: "20px",
                  fontSize: "13px",
                  color: "var(--text-secondary)",
                }}
              >
                {exportFormats.find((f) => f.id === exportFormat)?.description}
              </div>

              {/* Preview Section */}
              <div
                style={{
                  background: "var(--bg)",
                  borderRadius: "12px",
                  marginBottom: "20px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "12px 16px",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h4 style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                    Export Preview ({filteredItems.length} items)
                  </h4>
                  <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--accent)" }}>
                    {totals.totalFormatted}
                  </span>
                </div>

                <div style={{ maxHeight: "250px", overflow: "auto" }}>
                  {filteredItems.length === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", color: "var(--text-muted)" }}>
                      No items match the current filters
                    </div>
                  ) : (
                    <table style={{ width: "100%", fontSize: "13px", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--surface)" }}>
                          <th style={thStyle}>Chatter</th>
                          <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
                          <th style={{ ...thStyle, textAlign: "center" }}>Method</th>
                          <th style={thStyle}>Address</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.slice(0, showPreview ? 100 : 5).map((item) => (
                          <tr key={item.itemId} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                            <td style={tdStyle}>{item.chatterName}</td>
                            <td style={{ ...tdStyle, textAlign: "right", fontWeight: "600" }}>
                              {item.netPayFormatted}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <PaymentMethodIcon method={item.paymentMethod} size="sm" showLabel={false} />
                            </td>
                            <td style={{ ...tdStyle, maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {item.paymentAddress || item.wiseEmail || (
                                <span style={{ color: "var(--orange)" }}>Missing</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  
                  {filteredItems.length > 5 && !showPreview && (
                    <button
                      onClick={() => setShowPreview(true)}
                      style={{
                        width: "100%",
                        padding: "10px",
                        background: "none",
                        border: "none",
                        color: "var(--accent)",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Show all {filteredItems.length} items
                    </button>
                  )}
                </div>
              </div>

              {/* By Method Breakdown */}
              {exportSummary && exportSummary.byMethod.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginBottom: "20px",
                  }}
                >
                  {exportSummary.byMethod.map((m: { method: string; count: number; amountFormatted: string }) => (
                    <div
                      key={m.method}
                      style={{
                        padding: "8px 14px",
                        background: "var(--bg)",
                        borderRadius: "8px",
                        fontSize: "13px",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                      }}
                    >
                      <PaymentMethodIcon method={m.method} size="sm" showLabel={false} />
                      <span style={{ fontWeight: "600" }}>{m.count}</span>
                      <span style={{ color: "var(--text-muted)" }}>({m.amountFormatted})</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Export Button */}
              <button
                onClick={handleExport}
                disabled={loading || filteredItems.length === 0}
                style={{
                  width: "100%",
                  padding: "16px 24px",
                  fontSize: "15px",
                  fontWeight: "600",
                  background: loading || filteredItems.length === 0 ? "var(--text-muted)" : "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "12px",
                  cursor: loading || filteredItems.length === 0 ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                }}
              >
                {loading ? (
                  "Processing..."
                ) : (
                  <>
                    📤 Export {filteredItems.length} Items ({totals.totalFormatted})
                  </>
                )}
              </button>
            </div>
          )}

          {/* Import Tab */}
          {activeTab === "import" && (
            <div>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                Paste payment confirmation data (CSV or JSON format) to mark items as paid.
              </p>

              <div style={{ marginBottom: "16px" }}>
                <label style={labelStyle}>Confirmation Data</label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder={`Paste CSV or JSON data here...

CSV Example:
Item ID,Chatter Name,Net Pay,...,Payment Ref,Payment Date,Notes
"j57abc...",John,150.00,...,"TXN-12345","2026-02-07","Paid via Wise"

JSON Example:
[
  { "itemId": "j57abc...", "paymentRef": "TXN-12345", "paymentDate": "2026-02-07" }
]`}
                  rows={10}
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
                  }}
                />
              </div>

              <button
                onClick={handleImport}
                disabled={loading || !importData.trim()}
                style={{
                  width: "100%",
                  padding: "16px 24px",
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

          {/* Validation Tab */}
          {activeTab === "validation" && (
            <div>
              {missingInfo && missingInfo.length > 0 ? (
                <div>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    The following items have missing payment information and cannot be exported:
                  </p>

                  <div style={{ maxHeight: "400px", overflow: "auto" }}>
                    {missingInfo.map((item: { itemId: string; chatterName: string; netPayFormatted: string; paymentMethod?: string; issues: string[] }) => (
                      <div
                        key={item.itemId}
                        style={{
                          padding: "14px 16px",
                          background: "var(--bg)",
                          borderRadius: "10px",
                          marginBottom: "8px",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                      >
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "var(--text)" }}>
                            {item.chatterName}
                          </div>
                          <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "4px" }}>
                            {item.netPayFormatted} • {item.paymentMethod || "No method set"}
                          </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          {item.issues.map((issue: string, i: number) => (
                            <div
                              key={i}
                              style={{
                                fontSize: "12px",
                                color: "var(--orange)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                              }}
                            >
                              ⚠️ {issue}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : validation && validation.errors.length > 0 ? (
                <div>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    Validation errors found:
                  </p>

                  {validation.errors.map((err, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "12px 16px",
                        background: "var(--red-bg)",
                        borderRadius: "8px",
                        marginBottom: "8px",
                        fontSize: "13px",
                      }}
                    >
                      <strong>{err.chatterName}:</strong> {err.message}
                    </div>
                  ))}

                  {validation.warnings.length > 0 && (
                    <>
                      <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: "16px 0" }}>
                        Warnings:
                      </p>
                      {validation.warnings.map((warn, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "12px 16px",
                            background: "var(--orange-bg)",
                            borderRadius: "8px",
                            marginBottom: "8px",
                            fontSize: "13px",
                          }}
                        >
                          <strong>{warn.chatterName}:</strong> {warn.message}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <div style={{ fontSize: "48px", marginBottom: "16px" }}>✅</div>
                  <h3 style={{ fontSize: "18px", fontWeight: "600", color: "var(--text)", marginBottom: "8px" }}>
                    All Items Valid
                  </h3>
                  <p style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                    All pending items have valid payment information
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Styles
const statCardStyle: React.CSSProperties = {
  background: "var(--bg)",
  borderRadius: "12px",
  padding: "14px 16px",
  display: "flex",
  alignItems: "center",
  gap: "12px",
};

const statLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--text-muted)",
  textTransform: "uppercase",
  fontWeight: "500",
};

const statValueStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: "700",
  color: "var(--text)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: "600",
  color: "var(--text-secondary)",
  marginBottom: "6px",
};

const selectStyle: React.CSSProperties = {
  padding: "10px 14px",
  fontSize: "14px",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--bg)",
  color: "var(--text)",
  minWidth: "160px",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: "11px",
  fontWeight: "600",
  color: "var(--text-muted)",
  textTransform: "uppercase",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  color: "var(--text)",
};
