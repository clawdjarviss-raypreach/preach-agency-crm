/**
 * Payroll Aggregation Engine (Phase 7A) - Client-Side Utilities
 * 
 * The main aggregation logic lives in convex/crm/payrollEngine.ts for Convex use.
 * This file provides re-exports and additional client-side helpers.
 */

// Re-export types and helpers from the Convex module for client-side use
export type { 
  ShiftData, 
  BonusRecordData, 
  ChatterData, 
  PayrollBreakdown,
  ChatterPayrollData,
  PayRunSummary,
} from "../convex/crm/payrollEngine";

export {
  minutesToHours,
  calculateShiftMinutes,
  isShiftInPeriod,
  isBonusInPeriod,
  formatCurrency,
  calculateNetPay,
  aggregateChatterPay,
  aggregatePayrollData,
  calculatePayRunSummary,
} from "../convex/crm/payrollEngine";

// ─── CLIENT-SIDE UTILITIES ────────────────────────────────────

/**
 * Format a date range for display
 */
export function formatPeriodRange(startTs: number, endTs: number): string {
  const start = new Date(startTs);
  const end = new Date(endTs);
  
  const options: Intl.DateTimeFormatOptions = { 
    month: "short", 
    day: "numeric",
    year: start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
  };
  
  return `${start.toLocaleDateString("en-US", options)} – ${end.toLocaleDateString("en-US", { ...options, year: "numeric" })}`;
}

/**
 * Format hours for display (e.g., "42.5h")
 */
export function formatHours(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

/**
 * Get status color class for pay run status
 */
export function getPayRunStatusColor(status: string): string {
  switch (status) {
    case "draft":
      return "text-gray-500 bg-gray-100";
    case "approved":
      return "text-blue-600 bg-blue-100";
    case "paid":
      return "text-green-600 bg-green-100";
    case "cancelled":
      return "text-red-500 bg-red-100";
    default:
      return "text-gray-500 bg-gray-100";
  }
}

/**
 * Get status color class for payment status
 */
export function getPaymentStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "text-yellow-600 bg-yellow-100";
    case "processing":
      return "text-blue-600 bg-blue-100";
    case "paid":
      return "text-green-600 bg-green-100";
    case "failed":
      return "text-red-600 bg-red-100";
    default:
      return "text-gray-500 bg-gray-100";
  }
}
