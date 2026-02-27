# Phase 7: Payroll & Payments Dashboard (12–16h)

**Status**: Ready for Implementation  
**Priority**: P0  
**Dependencies**: Phase 5D (Bonuses/Commissions) ✅  

---

## Overview

Centralized payroll management system that aggregates all compensation data (hours, bonuses, commissions), generates pay runs, tracks payment status, and exports for external payment processors.

---

## Sub-Phase Breakdown

### Phase 7A: Payroll Aggregation Engine (4h)

#### Goal
Compute total pay per chatter for any date range.

#### Schema Additions (`convex/schema.ts`)

```typescript
// Add to existing schema

// Pay Run (header record for a payroll batch)
crm_pay_runs: defineTable({
  periodStart: v.number(),         // Unix timestamp
  periodEnd: v.number(),           // Unix timestamp
  status: v.union(
    v.literal('draft'),
    v.literal('approved'),
    v.literal('paid'),
    v.literal('cancelled')
  ),
  totalGross: v.number(),          // Sum of all line items
  totalNet: v.number(),            // After deductions
  lineItemCount: v.number(),       // Number of chatters
  createdBy: v.id('crm_chatters'),
  createdAt: v.number(),
  approvedBy: v.optional(v.id('crm_chatters')),
  approvedAt: v.optional(v.number()),
  paidAt: v.optional(v.number()),
  notes: v.optional(v.string()),
})
  .index('by_status', ['status'])
  .index('by_period', ['periodStart'])
  .index('by_created', ['createdAt']),

// Pay Run Line Items (one per chatter per pay run)
crm_pay_run_items: defineTable({
  payRunId: v.id('crm_pay_runs'),
  chatterId: v.id('crm_chatters'),
  chatterName: v.string(),         // Denormalized for export
  
  // Hours & Base Pay
  hoursWorked: v.number(),
  basePayRate: v.number(),         // $/hour
  basePay: v.number(),             // hoursWorked × basePayRate
  
  // Bonuses
  bonusIds: v.array(v.id('crm_bonuses')),  // Reference to included bonuses
  bonusTotal: v.number(),
  
  // Commissions
  commissionIds: v.array(v.id('crm_bonuses')),  // Reference to included commissions
  commissionTotal: v.number(),
  
  // Deductions (penalties, advances, etc.)
  deductions: v.number(),
  deductionNotes: v.optional(v.string()),
  
  // Totals
  grossPay: v.number(),            // base + bonuses + commissions
  netPay: v.number(),              // gross - deductions
  
  // Payment Info
  paymentMethod: v.optional(v.string()),  // usdc, usdt, wise, bank
  paymentAddress: v.optional(v.string()), // Wallet address or bank details ref
  paymentStatus: v.union(
    v.literal('pending'),
    v.literal('processing'),
    v.literal('paid'),
    v.literal('failed')
  ),
  paymentRef: v.optional(v.string()),     // TX hash or wire reference
  paidAt: v.optional(v.number()),
  
  // Metadata
  notes: v.optional(v.string()),
})
  .index('by_pay_run', ['payRunId'])
  .index('by_chatter', ['chatterId'])
  .index('by_payment_status', ['paymentStatus']),

// Optional: Chatter payment preferences (if not already in chatter table)
crm_payment_preferences: defineTable({
  chatterId: v.id('crm_chatters'),
  preferredMethod: v.string(),       // usdc, usdt, wise, bank
  walletAddress: v.optional(v.string()),
  wiseEmail: v.optional(v.string()),
  bankDetails: v.optional(v.string()), // Encrypted/redacted
  updatedAt: v.number(),
})
  .index('by_chatter', ['chatterId']),
```

#### Convex Functions (`convex/crm/payroll.ts`)

```typescript
// Queries
export const getPayRuns = query({
  args: { status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Return pay runs, optionally filtered by status
  },
});

export const getPayRunById = query({
  args: { payRunId: v.id('crm_pay_runs') },
  handler: async (ctx, args) => {
    // Return pay run with all line items
  },
});

export const getPayRunItems = query({
  args: { payRunId: v.id('crm_pay_runs') },
  handler: async (ctx, args) => {
    // Return all line items for a pay run
  },
});

export const getChatterPaymentHistory = query({
  args: { chatterId: v.id('crm_chatters'), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    // Return payment history for a specific chatter
  },
});

// Mutations
export const createPayRun = mutation({
  args: { 
    periodStart: v.number(), 
    periodEnd: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Create pay run header (status: draft)
    // 2. Query all chatters with approved bonuses/commissions in period
    // 3. Query all shifts in period
    // 4. Calculate line items for each chatter
    // 5. Insert line items
    // 6. Update pay run totals
    // Return payRunId
  },
});

export const updatePayRunItem = mutation({
  args: {
    itemId: v.id('crm_pay_run_items'),
    deductions: v.optional(v.number()),
    deductionNotes: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update line item, recalculate net pay
  },
});

export const approvePayRun = mutation({
  args: { payRunId: v.id('crm_pay_runs') },
  handler: async (ctx, args) => {
    // Set status to approved, record approver and timestamp
  },
});

export const cancelPayRun = mutation({
  args: { payRunId: v.id('crm_pay_runs') },
  handler: async (ctx, args) => {
    // Set status to cancelled (only if draft or approved, not paid)
  },
});

export const markItemPaid = mutation({
  args: {
    itemId: v.id('crm_pay_run_items'),
    paymentRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update payment status to paid, record ref and timestamp
    // Check if all items in pay run are paid → update pay run status
  },
});

export const batchMarkPaid = mutation({
  args: {
    itemIds: v.array(v.id('crm_pay_run_items')),
    paymentRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Batch update all items to paid
  },
});
```

#### Payroll Engine (`lib/payroll-engine.ts`)

```typescript
interface ChatterPayrollData {
  chatterId: string;
  chatterName: string;
  
  // From shifts
  shifts: Shift[];
  hoursWorked: number;
  basePayRate: number;
  basePay: number;
  
  // From bonuses (type = target_bonus, shift_bonus, manual)
  bonuses: Bonus[];
  bonusTotal: number;
  
  // From bonuses (type = commission)
  commissions: Bonus[];
  commissionTotal: number;
  
  // Calculated
  grossPay: number;
}

export async function aggregatePayrollData(
  periodStart: Date,
  periodEnd: Date,
  chatters: Chatter[]
): Promise<ChatterPayrollData[]> {
  // 1. For each chatter:
  //    - Query shifts where clockIn >= periodStart AND clockOut <= periodEnd
  //    - Calculate hours worked (sum of shift durations)
  //    - Get base pay rate from chatter profile
  //    - Calculate base pay
  //    
  //    - Query approved bonuses in period (by type)
  //    - Sum target bonuses, shift bonuses, manual bonuses
  //    - Sum commissions separately
  //    
  //    - Calculate gross pay
  //
  // 2. Return array sorted by chatter name
}

export function calculateNetPay(gross: number, deductions: number): number {
  return Math.max(0, gross - deductions);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}
```

---

### Phase 7B: Payroll Admin UI (4h)

#### Route: `/payroll`

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│ 💰 Payroll                               [+ New Pay Run] │
├──────────────────────────────────────────────────────────┤
│ Filters: [All ▼] [Status ▼] [Date Range]                 │
├──────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Pay Run #23                                         │  │
│ │ Feb 1–14, 2026 • 12 chatters • $8,450 gross         │  │
│ │ Status: ● Approved                    [View] [Pay]  │  │
│ └─────────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ Pay Run #22                                         │  │
│ │ Jan 18–31, 2026 • 11 chatters • $7,890 gross        │  │
│ │ Status: ✓ Paid                        [View]        │  │
│ └─────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### Route: `/payroll/[id]`

**Layout**:
```
┌──────────────────────────────────────────────────────────┐
│ ← Back to Payroll    Pay Run #23                         │
│ Feb 1–14, 2026       Status: Draft                       │
├──────────────────────────────────────────────────────────┤
│ Summary                                                  │
│ ┌────────┬────────┬────────┬────────┐                    │
│ │ Total  │ Bonuses│ Commis.│ Deduct │                    │
│ │$8,450  │ $1,200 │ $2,100 │ $150   │                    │
│ └────────┴────────┴────────┴────────┘                    │
├──────────────────────────────────────────────────────────┤
│ Line Items                                    [Export ▼] │
├────────┬───────┬───────┬───────┬───────┬───────┬────────┤
│ Name   │ Hours │ Base  │Bonuses│Commis.│ Net   │ Status │
├────────┼───────┼───────┼───────┼───────┼───────┼────────┤
│ Alice  │ 42.5  │ $425  │ $150  │ $320  │ $895  │ ○ Pend │
│ Bob    │ 38.0  │ $380  │ $100  │ $280  │ $760  │ ○ Pend │
│ Carol  │ 45.0  │ $450  │ $200  │ $350  │ $1000 │ ✓ Paid │
├────────┴───────┴───────┴───────┴───────┴───────┴────────┤
│ [Select All]                     [Mark Selected as Paid] │
├──────────────────────────────────────────────────────────┤
│ Actions: [Approve Pay Run] [Cancel] [Export CSV]         │
└──────────────────────────────────────────────────────────┘
```

#### Components

| Component | Purpose |
|-----------|---------|
| `PayRunsList.tsx` | Paginated list of pay runs with status badges |
| `PayRunCard.tsx` | Single pay run summary card |
| `CreatePayRunModal.tsx` | Date range picker, preview totals, confirm create |
| `PayRunDetail.tsx` | Full detail view with line items table |
| `PayRunItemRow.tsx` | Single line item with edit/pay actions |
| `PayrollExportMenu.tsx` | Dropdown for export formats |
| `PaymentStatusBadge.tsx` | Color-coded status indicator |

#### Files

| File | Purpose |
|------|---------|
| `app/(crm)/payroll/page.tsx` | Pay runs list + create button |
| `app/(crm)/payroll/[id]/page.tsx` | Pay run detail view |
| `components/payroll/PayRunsList.tsx` | List component |
| `components/payroll/PayRunCard.tsx` | Card component |
| `components/payroll/CreatePayRunModal.tsx` | Create modal |
| `components/payroll/PayRunDetail.tsx` | Detail table |
| `components/payroll/PayRunItemRow.tsx` | Row component |
| `components/payroll/PayrollExportMenu.tsx` | Export dropdown |
| `components/payroll/PaymentStatusBadge.tsx` | Status badge |

---

### Phase 7C: Payment Tracking (3h)

#### Features

1. **Payment Method Selection**
   - Per-chatter default (from preferences)
   - Override at pay run level
   - Options: USDC, USDT, Wise, Bank Transfer

2. **Status Workflow**
   ```
   pending → processing → paid
                       ↘ failed
   ```

3. **Payment Reference**
   - Optional field for TX hash or wire confirmation
   - Displayed in payment history

4. **Batch Operations**
   - Select multiple items
   - "Mark Selected as Paid"
   - Optional: add single payment ref for batch

5. **Payment History**
   - Per-chatter view of all historical payments
   - Accessible from chatter profile

#### UI Additions

```
┌───────────────────────────────────────────┐
│ Mark as Paid                              │
├───────────────────────────────────────────┤
│ Payment Method: [USDC ▼]                  │
│                                           │
│ Payment Reference (optional):             │
│ [________________________________]        │
│ e.g., TX hash or wire confirmation        │
│                                           │
│         [Cancel]  [Confirm Payment]       │
└───────────────────────────────────────────┘
```

---

### Phase 7D: Export & Integrations (3h)

#### Export Formats

1. **Standard CSV**
   ```csv
   Name,Email,Hours,Base,Bonuses,Commissions,Deductions,Net,Method,Address
   Alice,alice@example.com,42.5,425.00,150.00,320.00,0.00,895.00,USDC,0x1234...
   Bob,bob@example.com,38.0,380.00,100.00,280.00,0.00,760.00,Wise,bob@wise.com
   ```

2. **Wise Batch CSV**
   ```csv
   recipientEmail,amount,currency,reference
   alice@example.com,895.00,USD,PayRun23-Alice
   bob@wise.com,760.00,USD,PayRun23-Bob
   ```

3. **Crypto Batch JSON**
   ```json
   {
     "network": "ethereum",
     "token": "USDC",
     "transfers": [
       { "address": "0x1234...", "amount": "895.00" },
       { "address": "0x5678...", "amount": "760.00" }
     ]
   }
   ```

#### API Endpoint

```typescript
// app/api/payroll/export/route.ts

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const payRunId = searchParams.get('payRunId');
  const format = searchParams.get('format'); // csv, wise, crypto
  
  // Fetch pay run items
  // Format based on type
  // Return file download
}
```

---

## Testing Checklist

### Phase 7A
- [ ] Schema migrates without errors
- [ ] `createPayRun` creates header + line items
- [ ] Hours calculated correctly from shifts
- [ ] Bonuses aggregated (target, shift, manual types)
- [ ] Commissions aggregated separately
- [ ] Gross pay = base + bonuses + commissions
- [ ] Net pay = gross - deductions

### Phase 7B
- [ ] `/payroll` lists all pay runs
- [ ] Status filters work
- [ ] Create modal shows period picker
- [ ] Preview totals before creating
- [ ] Detail page shows all line items
- [ ] Edit deductions recalculates net

### Phase 7C
- [ ] Mark single item as paid
- [ ] Batch mark as paid
- [ ] Payment ref stored and displayed
- [ ] Status updates cascade to pay run
- [ ] Payment history shows in chatter profile

### Phase 7D
- [ ] CSV export downloads correctly
- [ ] Wise format valid
- [ ] Crypto JSON valid
- [ ] All amounts match UI

### Integration
- [ ] Role check: admin only
- [ ] Build passes (0 TS errors)
- [ ] Sidebar link added
- [ ] Mobile responsive

---

## Acceptance Criteria

- [ ] Admin can create pay runs for any date range
- [ ] All compensation data aggregated correctly (hours, bonuses, commissions)
- [ ] Approve/reject workflow functional
- [ ] Payment tracking per line item with status workflow
- [ ] Multiple export formats (CSV, Wise, Crypto)
- [ ] Payment history per chatter
- [ ] Role-gated to admin only
- [ ] TypeScript 0 errors
- [ ] `npm run build` clean
- [ ] Mobile-responsive design

---

## Future Enhancements (Out of Scope)

- [ ] Direct Wise API integration (auto-initiate payments)
- [ ] Crypto wallet integration (sign & broadcast TX)
- [ ] Accounting software sync (QuickBooks, Xero)
- [ ] Chatter self-service portal (view pay stubs)
- [ ] Tax document generation (1099s, invoices)
- [ ] Multi-currency support
- [ ] Scheduled auto-pay runs (cron-based)

---

*End of Phase 7 Spec*
