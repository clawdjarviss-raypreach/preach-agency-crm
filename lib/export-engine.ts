/**
 * Export Engine (Phase 7D) - Format Generators for Payment Exports
 * 
 * Supports multiple export formats:
 * - CSV: Simple comma-separated format
 * - JSON: Structured export for payment APIs
 * - Wise: Compatible with Wise batch upload format
 */

// ─── TYPES ────────────────────────────────────────────────────

export interface ExportItem {
  itemId: string;
  payRunId: string;
  periodStartDate: string;
  periodEndDate: string;
  chatterId: string;
  chatterName: string;
  email?: string;
  netPay: number; // cents
  netPayFormatted: string;
  paymentMethod: string;
  paymentAddress?: string;
  wiseEmail?: string;
  bankDetails?: string;
  currency?: string;
}

export interface ExportOptions {
  format: "csv" | "json" | "wise" | "wise-csv";
  includeHeaders?: boolean;
  currency?: string;
  batchName?: string;
  dateFormat?: "iso" | "us" | "eu";
}

export interface ExportResult {
  content: string;
  filename: string;
  mimeType: string;
  itemCount: number;
  totalAmount: number;
  totalAmountFormatted: string;
}

export interface ValidationError {
  itemId: string;
  chatterName: string;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  validItems: ExportItem[];
  invalidItems: ExportItem[];
}

// ─── VALIDATION ───────────────────────────────────────────────

/**
 * Validate items for export - check for missing payment details
 */
export function validateForExport(
  items: ExportItem[],
  targetMethod?: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const validItems: ExportItem[] = [];
  const invalidItems: ExportItem[] = [];

  for (const item of items) {
    let hasError = false;

    // Filter by method if specified
    if (targetMethod && item.paymentMethod !== targetMethod) {
      continue; // Skip items with different payment method
    }

    // Check for missing payment method
    if (!item.paymentMethod || item.paymentMethod === "unknown") {
      errors.push({
        itemId: item.itemId,
        chatterName: item.chatterName,
        field: "paymentMethod",
        message: "Payment method not set",
      });
      hasError = true;
    }

    // Check for missing payment address based on method
    const method = item.paymentMethod?.toLowerCase();
    if (method === "usdc" || method === "usdt") {
      if (!item.paymentAddress) {
        errors.push({
          itemId: item.itemId,
          chatterName: item.chatterName,
          field: "paymentAddress",
          message: "Wallet address missing for crypto payment",
        });
        hasError = true;
      } else if (!isValidWalletAddress(item.paymentAddress)) {
        warnings.push({
          itemId: item.itemId,
          chatterName: item.chatterName,
          field: "paymentAddress",
          message: "Wallet address format may be invalid",
        });
      }
    } else if (method === "wise") {
      if (!item.wiseEmail && !item.email && !item.paymentAddress) {
        errors.push({
          itemId: item.itemId,
          chatterName: item.chatterName,
          field: "wiseEmail",
          message: "Wise email not set",
        });
        hasError = true;
      }
    } else if (method === "bank") {
      if (!item.bankDetails) {
        errors.push({
          itemId: item.itemId,
          chatterName: item.chatterName,
          field: "bankDetails",
          message: "Bank details not provided",
        });
        hasError = true;
      }
    }

    // Check for zero or negative amounts
    if (item.netPay <= 0) {
      warnings.push({
        itemId: item.itemId,
        chatterName: item.chatterName,
        field: "netPay",
        message: "Amount is zero or negative",
      });
    }

    if (hasError) {
      invalidItems.push(item);
    } else {
      validItems.push(item);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    validItems,
    invalidItems,
  };
}

/**
 * Simple wallet address validation (basic check)
 */
function isValidWalletAddress(address: string): boolean {
  // Ethereum/ERC-20 address pattern
  if (/^0x[a-fA-F0-9]{40}$/.test(address)) return true;
  // Solana address pattern (base58, 32-44 chars)
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) return true;
  // TRON address pattern (starts with T)
  if (/^T[a-zA-Z0-9]{33}$/.test(address)) return true;
  return false;
}

// ─── FORMAT GENERATORS ────────────────────────────────────────

/**
 * Generate CSV export
 */
export function generateCSV(
  items: ExportItem[],
  options: ExportOptions = { format: "csv" }
): ExportResult {
  const includeHeaders = options.includeHeaders !== false;
  const dateStr = new Date().toISOString().split("T")[0];
  
  const headers = [
    "Item ID",
    "Chatter Name",
    "Email",
    "Amount",
    "Currency",
    "Payment Method",
    "Payment Address",
    "Period Start",
    "Period End",
    "Payment Ref",
    "Payment Date",
    "Notes",
  ];

  const rows = items.map((item) => [
    item.itemId,
    item.chatterName,
    item.email || item.wiseEmail || "",
    (item.netPay / 100).toFixed(2),
    options.currency || "USD",
    item.paymentMethod,
    getPaymentAddress(item),
    item.periodStartDate,
    item.periodEndDate,
    "", // Payment Ref - to be filled
    "", // Payment Date - to be filled
    "", // Notes - to be filled
  ]);

  const csvLines = [];
  if (includeHeaders) {
    csvLines.push(headers.map(escapeCSV).join(","));
  }
  csvLines.push(...rows.map((row) => row.map(escapeCSV).join(",")));

  const totalAmount = items.reduce((sum, item) => sum + item.netPay, 0);

  return {
    content: csvLines.join("\n"),
    filename: `payment-export-${dateStr}.csv`,
    mimeType: "text/csv;charset=utf-8;",
    itemCount: items.length,
    totalAmount,
    totalAmountFormatted: formatCurrency(totalAmount),
  };
}

/**
 * Generate JSON export (for payment APIs)
 */
export function generateJSON(
  items: ExportItem[],
  options: ExportOptions = { format: "json" }
): ExportResult {
  const dateStr = new Date().toISOString().split("T")[0];
  const totalAmount = items.reduce((sum, item) => sum + item.netPay, 0);

  const payload = {
    exportDate: new Date().toISOString(),
    batchName: options.batchName || `Payroll Export ${dateStr}`,
    currency: options.currency || "USD",
    totalAmount: totalAmount / 100,
    totalAmountCents: totalAmount,
    recipientCount: items.length,
    recipients: items.map((item) => ({
      id: item.itemId,
      payRunId: item.payRunId,
      name: item.chatterName,
      email: item.email || item.wiseEmail,
      amount: item.netPay / 100,
      amountCents: item.netPay,
      paymentMethod: item.paymentMethod,
      paymentAddress: getPaymentAddress(item),
      period: {
        start: item.periodStartDate,
        end: item.periodEndDate,
      },
      metadata: {
        chatterId: item.chatterId,
      },
    })),
  };

  return {
    content: JSON.stringify(payload, null, 2),
    filename: `payment-export-${dateStr}.json`,
    mimeType: "application/json",
    itemCount: items.length,
    totalAmount,
    totalAmountFormatted: formatCurrency(totalAmount),
  };
}

/**
 * Generate Wise batch upload CSV format
 * See: https://wise.com/help/articles/2827506/how-do-i-make-batch-payments
 */
export function generateWiseCSV(
  items: ExportItem[],
  options: ExportOptions = { format: "wise-csv" }
): ExportResult {
  const dateStr = new Date().toISOString().split("T")[0];
  
  // Wise batch CSV format headers
  const headers = [
    "recipientEmail",
    "amount",
    "sourceCurrency",
    "targetCurrency",
    "reference",
  ];

  // Filter to only Wise-eligible items
  const wiseItems = items.filter((item) => 
    item.paymentMethod?.toLowerCase() === "wise" &&
    (item.wiseEmail || item.email || item.paymentAddress)
  );

  const rows = wiseItems.map((item) => [
    item.wiseEmail || item.email || item.paymentAddress || "",
    (item.netPay / 100).toFixed(2),
    options.currency || "USD",
    options.currency || "USD", // Same currency for simplicity
    `Payroll ${item.periodStartDate} - ${item.chatterName}`,
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ];

  const totalAmount = wiseItems.reduce((sum, item) => sum + item.netPay, 0);

  return {
    content: csvLines.join("\n"),
    filename: `wise-batch-${dateStr}.csv`,
    mimeType: "text/csv;charset=utf-8;",
    itemCount: wiseItems.length,
    totalAmount,
    totalAmountFormatted: formatCurrency(totalAmount),
  };
}

/**
 * Generate Wise batch upload XML format (legacy)
 */
export function generateWiseXML(
  items: ExportItem[],
  options: ExportOptions = { format: "wise" }
): ExportResult {
  const dateStr = new Date().toISOString().split("T")[0];
  
  // Filter to only Wise-eligible items
  const wiseItems = items.filter((item) => 
    item.paymentMethod?.toLowerCase() === "wise" &&
    (item.wiseEmail || item.email || item.paymentAddress)
  );

  const currency = options.currency || "USD";
  const totalAmount = wiseItems.reduce((sum, item) => sum + item.netPay, 0);

  const xmlPayments = wiseItems.map((item) => `
    <payment>
      <recipientEmail>${escapeXML(item.wiseEmail || item.email || item.paymentAddress || "")}</recipientEmail>
      <amount>${(item.netPay / 100).toFixed(2)}</amount>
      <currency>${currency}</currency>
      <reference>${escapeXML(`Payroll ${item.periodStartDate} - ${item.chatterName}`)}</reference>
    </payment>`).join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<batchPayments>
  <batchName>${escapeXML(options.batchName || `Payroll Export ${dateStr}`)}</batchName>
  <sourceCurrency>${currency}</sourceCurrency>
  <totalAmount>${(totalAmount / 100).toFixed(2)}</totalAmount>
  <paymentCount>${wiseItems.length}</paymentCount>
  <payments>${xmlPayments}
  </payments>
</batchPayments>`;

  return {
    content: xml,
    filename: `wise-batch-${dateStr}.xml`,
    mimeType: "application/xml",
    itemCount: wiseItems.length,
    totalAmount,
    totalAmountFormatted: formatCurrency(totalAmount),
  };
}

/**
 * Generate crypto payment export (for USDC/USDT batch payments)
 */
export function generateCryptoCSV(
  items: ExportItem[],
  options: ExportOptions & { tokenType?: "usdc" | "usdt" } = { format: "csv" }
): ExportResult {
  const dateStr = new Date().toISOString().split("T")[0];
  const tokenType = options.tokenType || "usdc";
  
  // Filter to only crypto items of the specified type
  const cryptoItems = items.filter((item) => 
    item.paymentMethod?.toLowerCase() === tokenType &&
    item.paymentAddress
  );

  // Simple format for crypto batch transfers
  const headers = [
    "wallet_address",
    "amount",
    "token",
    "reference",
    "recipient_name",
  ];

  const rows = cryptoItems.map((item) => [
    item.paymentAddress || "",
    (item.netPay / 100).toFixed(2),
    tokenType.toUpperCase(),
    item.itemId,
    item.chatterName,
  ]);

  const csvLines = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ];

  const totalAmount = cryptoItems.reduce((sum, item) => sum + item.netPay, 0);

  return {
    content: csvLines.join("\n"),
    filename: `${tokenType}-payments-${dateStr}.csv`,
    mimeType: "text/csv;charset=utf-8;",
    itemCount: cryptoItems.length,
    totalAmount,
    totalAmountFormatted: formatCurrency(totalAmount),
  };
}

// ─── IMPORT PARSERS ───────────────────────────────────────────

export interface ImportConfirmation {
  itemId: string;
  paymentRef: string;
  paymentDate?: string;
  paymentNotes?: string;
  status?: "success" | "failed";
}

export interface ImportParseResult {
  success: boolean;
  confirmations: ImportConfirmation[];
  errors: string[];
  format: "csv" | "json" | "unknown";
}

/**
 * Parse payment confirmation import data
 */
export function parseImportData(data: string): ImportParseResult {
  const trimmed = data.trim();
  
  if (!trimmed) {
    return {
      success: false,
      confirmations: [],
      errors: ["Empty data provided"],
      format: "unknown",
    };
  }

  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJSONImport(trimmed);
  }

  // Otherwise try CSV
  return parseCSVImport(trimmed);
}

/**
 * Parse JSON import format
 */
function parseJSONImport(data: string): ImportParseResult {
  try {
    const parsed = JSON.parse(data);
    const items = Array.isArray(parsed) ? parsed : parsed.confirmations || [parsed];
    const confirmations: ImportConfirmation[] = [];
    const errors: string[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.itemId) {
        errors.push(`Row ${i + 1}: Missing itemId`);
        continue;
      }
      if (!item.paymentRef && !item.transactionId && !item.txHash) {
        errors.push(`Row ${i + 1}: Missing payment reference`);
        continue;
      }

      confirmations.push({
        itemId: item.itemId,
        paymentRef: item.paymentRef || item.transactionId || item.txHash,
        paymentDate: item.paymentDate || item.date,
        paymentNotes: item.paymentNotes || item.notes,
        status: item.status === "failed" ? "failed" : "success",
      });
    }

    return {
      success: confirmations.length > 0,
      confirmations,
      errors,
      format: "json",
    };
  } catch (err: any) {
    return {
      success: false,
      confirmations: [],
      errors: [`JSON parse error: ${err.message}`],
      format: "json",
    };
  }
}

/**
 * Parse CSV import format
 */
function parseCSVImport(data: string): ImportParseResult {
  const lines = data.split("\n").filter((line) => line.trim());
  const confirmations: ImportConfirmation[] = [];
  const errors: string[] = [];

  // Detect header row
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes("item") || firstLine.includes("id") || firstLine.includes("ref");
  const startRow = hasHeader ? 1 : 0;

  // Find column indices from header or use defaults
  let itemIdCol = 0;
  let paymentRefCol = 6; // Default position in our export format
  let paymentDateCol = 7;
  let paymentNotesCol = 8;

  if (hasHeader) {
    const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
    const findCol = (terms: string[]) => {
      for (const term of terms) {
        const idx = headers.findIndex((h) => h.includes(term));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const foundItemId = findCol(["item id", "itemid", "id"]);
    const foundPaymentRef = findCol(["payment ref", "paymentref", "ref", "transaction", "tx"]);
    const foundPaymentDate = findCol(["payment date", "paymentdate", "date"]);
    const foundPaymentNotes = findCol(["notes", "memo", "comment"]);

    if (foundItemId !== -1) itemIdCol = foundItemId;
    if (foundPaymentRef !== -1) paymentRefCol = foundPaymentRef;
    if (foundPaymentDate !== -1) paymentDateCol = foundPaymentDate;
    if (foundPaymentNotes !== -1) paymentNotesCol = foundPaymentNotes;
  }

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = parseCSVLine(line);
    
    const itemId = cols[itemIdCol]?.trim();
    const paymentRef = cols[paymentRefCol]?.trim();
    const paymentDate = cols[paymentDateCol]?.trim();
    const paymentNotes = cols[paymentNotesCol]?.trim();

    if (!itemId) {
      errors.push(`Row ${i + 1}: Missing item ID`);
      continue;
    }
    if (!paymentRef) {
      errors.push(`Row ${i + 1}: Missing payment reference for ${itemId}`);
      continue;
    }

    confirmations.push({
      itemId,
      paymentRef,
      paymentDate: paymentDate || undefined,
      paymentNotes: paymentNotes || undefined,
      status: "success",
    });
  }

  return {
    success: confirmations.length > 0,
    confirmations,
    errors,
    format: "csv",
  };
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

// ─── HELPERS ──────────────────────────────────────────────────

/**
 * Get the appropriate payment address for an item
 */
function getPaymentAddress(item: ExportItem): string {
  const method = item.paymentMethod?.toLowerCase();
  
  if (method === "usdc" || method === "usdt") {
    return item.paymentAddress || "";
  }
  if (method === "wise") {
    return item.wiseEmail || item.email || item.paymentAddress || "";
  }
  if (method === "bank") {
    return item.bankDetails || "[Bank Details]";
  }
  
  return item.paymentAddress || item.email || "";
}

/**
 * Escape a value for CSV
 */
function escapeCSV(value: string | number | undefined): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  // Wrap in quotes if contains comma, quote, or newline
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Escape a value for XML
 */
function escapeXML(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format cents to currency string
 */
function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

// ─── MAIN EXPORT FUNCTION ─────────────────────────────────────

/**
 * Generate export in the specified format
 */
export function generateExport(
  items: ExportItem[],
  options: ExportOptions
): ExportResult {
  switch (options.format) {
    case "csv":
      return generateCSV(items, options);
    case "json":
      return generateJSON(items, options);
    case "wise":
      return generateWiseXML(items, options);
    case "wise-csv":
      return generateWiseCSV(items, options);
    default:
      return generateCSV(items, options);
  }
}

/**
 * Get export formats with descriptions
 */
export function getExportFormats() {
  return [
    {
      id: "csv",
      name: "CSV",
      description: "Standard comma-separated format for spreadsheets",
      icon: "📊",
      supportedMethods: ["all"],
    },
    {
      id: "json",
      name: "JSON",
      description: "Structured format for payment APIs and automation",
      icon: "🔧",
      supportedMethods: ["all"],
    },
    {
      id: "wise-csv",
      name: "Wise CSV",
      description: "Compatible with Wise batch payment upload",
      icon: "💸",
      supportedMethods: ["wise"],
    },
    {
      id: "usdc-csv",
      name: "USDC Batch",
      description: "Crypto batch payment format for USDC transfers",
      icon: "🪙",
      supportedMethods: ["usdc"],
    },
    {
      id: "usdt-csv",
      name: "USDT Batch",
      description: "Crypto batch payment format for USDT transfers",
      icon: "🪙",
      supportedMethods: ["usdt"],
    },
  ];
}

/**
 * Get payment methods with labels
 */
export function getPaymentMethods() {
  return [
    { id: "usdc", name: "USDC", icon: "🔵" },
    { id: "usdt", name: "USDT", icon: "🟢" },
    { id: "wise", name: "Wise", icon: "💸" },
    { id: "bank", name: "Bank Transfer", icon: "🏦" },
  ];
}
