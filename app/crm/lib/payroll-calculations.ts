export const AGENCY_FEE_BPS = 2000; // 20%
export const NET_SALES_MULTIPLIER_BPS = 10000 - AGENCY_FEE_BPS; // 80%

export function calculateNetSalesCents(grossSalesCents: number): number {
  // Spec: net = gross × 0.80 (rounded)
  return Math.round((grossSalesCents * NET_SALES_MULTIPLIER_BPS) / 10000);
}

export function calculateCommissionCents(netSalesCents: number, commissionBps: number): number {
  return Math.round((netSalesCents * commissionBps) / 10000);
}

export function calculateNetPayCents(opts: {
  basePayCents: number;
  commissionCents?: number | null;
  bonusTotalCents?: number | null;
  deductionsCents?: number | null;
}): number {
  return (
    opts.basePayCents +
    (opts.commissionCents ?? 0) +
    (opts.bonusTotalCents ?? 0) -
    (opts.deductionsCents ?? 0)
  );
}
