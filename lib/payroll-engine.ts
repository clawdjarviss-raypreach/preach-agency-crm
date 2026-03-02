/**
 * Payroll Aggregation Engine (Phase 7A) - Client-Side Utilities
 *
 * Previously re-exported from convex/crm/payrollEngine.ts.
 * Now provides standalone types and pure calculation logic.
 */

// ─── TYPES ────────────────────────────────────────────────────

export interface ShiftData {
  id: string;
  chatter_id: string;
  creator_id: string;
  clock_in: string;
  clock_out: string | null;
  total_minutes: number;
  date: string;
}

export interface BonusRecordData {
  id: string;
  chatter_id: string;
  amount: number;
  reason: string;
  date: string;
}

export interface ChatterData {
  id: string;
  name: string;
  hourly_rate: number;
  commission_pct: number;
}

export interface PayrollBreakdown {
  basePay: number;
  bonusTotal: number;
  commissionTotal: number;
  deductions: number;
  grossPay: number;
  netPay: number;
  hoursWorked: number;
  totalMinutes: number;
}

export interface ChatterPayrollData {
  chatter: ChatterData;
  breakdown: PayrollBreakdown;
  shifts: ShiftData[];
  bonuses: BonusRecordData[];
}

export interface PayRunSummary {
  totalGross: number;
  totalNet: number;
  chatterCount: number;
  totalHours: number;
}

// ─── PURE CALCULATION HELPERS ──────────────────────────────────

/**
 * Convert minutes to hours (rounded to 2 decimal places)
 */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Calculate shift duration in minutes
 */
export function calculateShiftMinutes(shift: ShiftData): number {
  if (shift.total_minutes) return shift.total_minutes;
  if (!shift.clock_out) return 0;
  const start = new Date(shift.clock_in).getTime();
  const end = new Date(shift.clock_out).getTime();
  return Math.max(0, Math.round((end - start) / 60000));
}

/**
 * Check if a shift falls within a period
 */
export function isShiftInPeriod(
  shift: ShiftData,
  periodStart: string,
  periodEnd: string
): boolean {
  const shiftDate = shift.date;
  return shiftDate >= periodStart && shiftDate <= periodEnd;
}

/**
 * Check if a bonus record falls within a period
 */
export function isBonusInPeriod(
  bonus: BonusRecordData,
  periodStart: string,
  periodEnd: string
): boolean {
  return bonus.date >= periodStart && bonus.date <= periodEnd;
}

/**
 * Format a number as currency
 */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Calculate net pay after deductions
 */
export function calculateNetPay(grossPay: number, deductions: number): number {
  return Math.max(0, grossPay - deductions);
}

/**
 * Aggregate pay data for a single chatter
 */
export function aggregateChatterPay(
  chatter: ChatterData,
  shifts: ShiftData[],
  bonuses: BonusRecordData[],
  commissionSales: number = 0,
  deductions: number = 0
): PayrollBreakdown {
  const totalMinutes = shifts.reduce(
    (sum, s) => sum + calculateShiftMinutes(s),
    0
  );
  const hoursWorked = minutesToHours(totalMinutes);
  const basePay = Math.round(hoursWorked * chatter.hourly_rate * 100); // in cents
  const bonusTotal = bonuses.reduce((sum, b) => sum + b.amount, 0);
  const commissionTotal = Math.round(
    commissionSales * (chatter.commission_pct / 100)
  );
  const grossPay = basePay + bonusTotal + commissionTotal;
  const netPay = calculateNetPay(grossPay, deductions);

  return {
    basePay,
    bonusTotal,
    commissionTotal,
    deductions,
    grossPay,
    netPay,
    hoursWorked,
    totalMinutes,
  };
}

/**
 * Aggregate payroll data for multiple chatters
 */
export function aggregatePayrollData(
  chatters: ChatterData[],
  allShifts: ShiftData[],
  allBonuses: BonusRecordData[],
  periodStart: string,
  periodEnd: string
): ChatterPayrollData[] {
  return chatters.map((chatter) => {
    const shifts = allShifts
      .filter((s) => s.chatter_id === chatter.id)
      .filter((s) => isShiftInPeriod(s, periodStart, periodEnd));

    const bonuses = allBonuses
      .filter((b) => b.chatter_id === chatter.id)
      .filter((b) => isBonusInPeriod(b, periodStart, periodEnd));

    const breakdown = aggregateChatterPay(chatter, shifts, bonuses);

    return { chatter, breakdown, shifts, bonuses };
  });
}

/**
 * Calculate a pay run summary from chatter payroll data
 */
export function calculatePayRunSummary(
  data: ChatterPayrollData[]
): PayRunSummary {
  return {
    totalGross: data.reduce((sum, d) => sum + d.breakdown.grossPay, 0),
    totalNet: data.reduce((sum, d) => sum + d.breakdown.netPay, 0),
    chatterCount: data.length,
    totalHours: data.reduce((sum, d) => sum + d.breakdown.hoursWorked, 0),
  };
}

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
    year:
      start.getFullYear() !== end.getFullYear() ? "numeric" : undefined,
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
