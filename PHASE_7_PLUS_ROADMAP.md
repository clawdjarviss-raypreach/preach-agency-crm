# Preach CRM — Phase 7+ Roadmap

**Created**: 2026-02-07  
**Status**: Planning Complete  
**Author**: Subagent (Planning)

---

## Executive Summary

Preach CRM v0 (Phases 1–6) shipped today with:
- Queue Analytics (Cohort Matrix, Health Scores)
- Alert System (Rules Engine, Banners, Config)
- Insights Dashboard (LTV, Seasonality, Segmentation)
- Creator Leaderboard (Rankings, Badges)
- Automation Rules (Escalation, Reassignment, Smart Routing)

**Phase 7+ Goal**: Transform Preach from an *analytics CRM* into a **full operational platform** that handles the complete agency lifecycle: revenue collection → team payroll → performance coaching.

---

## Top 3 Feature Ideas (Ranked by ROI)

### 🥇 #1: Payroll & Payments Dashboard (Phase 7)

**Why it's #1**: They have all the data (bonuses, commissions, shifts, targets) but no way to actually **pay people**. This is a weekly pain point for any agency. Right now Rayan is probably exporting data manually and calculating payroll in a spreadsheet.

| Metric | Value |
|--------|-------|
| **ROI Score** | 9/10 |
| **Time to Value** | Immediate (solves weekly pain) |
| **Complexity** | Medium (builds on existing data) |
| **Scope** | 12–16 hours |

**What it solves**:
- Manual payroll calculation each week/bi-weekly
- Tracking who's been paid vs pending
- Multiple payment methods (crypto, Wise, bank)
- Payment history for disputes/taxes
- Aggregate view of labor costs

---

### 🥈 #2: Real-Time Chat Queue (Phase 8)

**Why it's #2**: Currently all metrics are retrospective (submitted via reports). A real-time queue system would give supervisors live visibility into:
- Who's waiting for a response
- How long VIPs have been waiting
- Which chatters are overloaded
- Which messages need escalation

| Metric | Value |
|--------|-------|
| **ROI Score** | 8/10 |
| **Time to Value** | High (real-time ops visibility) |
| **Complexity** | High (requires OF API or manual data entry) |
| **Scope** | 16–24 hours |

**Two approaches**:
1. **OF API Integration** (ideal, but TBD on API access)
2. **Manual Queue Entry** (chatters log messages as they work)

---

### 🥉 #3: Supervisor Coaching Hub (Phase 9)

**Why it's #3**: They have leaderboards but no structured coaching. For team retention and performance improvement:
- 1:1 meeting notes with chatters
- Performance improvement plans (PIPs)
- Training material tracking
- Feedback/praise logging
- Goal setting

| Metric | Value |
|--------|-------|
| **ROI Score** | 7/10 |
| **Time to Value** | Medium (helps with churn) |
| **Complexity** | Low (mostly CRUD) |
| **Scope** | 8–12 hours |

---

## Roadmap Summary (Phases 7–11)

| Phase | Feature | Est. Hours | Priority | Dependencies |
|-------|---------|------------|----------|--------------|
| **7** | Payroll & Payments Dashboard | 12–16h | P0 | Phase 5D (bonuses) ✅ |
| **8** | Real-Time Chat Queue | 16–24h | P1 | None |
| **9** | Supervisor Coaching Hub | 8–12h | P1 | None |
| **10** | Mobile Push Notifications | 8–10h | P2 | PWA or native shell |
| **11** | Advanced Analytics & Forecasting | 12–16h | P2 | Phase 4 (insights) ✅ |

---

## Phase 7: Payroll & Payments Dashboard (DETAILED SPEC)

### Goal
Centralized payroll management: aggregate all compensation data, generate pay runs, track payment status, export for external processors.

### Why Phase 7 First?
1. **Immediate pain relief** — Rayan is doing this manually every pay period
2. **Builds on existing data** — Bonuses, commissions, shifts already calculated (Phase 5D)
3. **Clear deliverable** — "Pay everyone" is a concrete, testable outcome
4. **Low integration risk** — No external API dependencies

### Sub-Phases

#### Phase 7A: Payroll Aggregation Engine (4h)

**Goal**: Compute total pay per chatter per pay period.

**Components**:
- `payrollEngine.ts` — Aggregation logic
  - Sum: base hourly × hours worked (from shifts)
  - Add: bonuses (from `crm_bonuses` where status = approved)
  - Add: commissions (from `crm_bonuses` type = commission)
  - Deduct: penalties/fines (new field or separate table)
- Convex functions:
  - `computePayrollSummary(periodStart, periodEnd)` → Array<ChatterPayroll>
  - `getPayrollHistory(chatterId, limit)` → historical pay runs

**Schema additions**:
```typescript
// New table: Pay Run
crm_pay_runs = defineTable({
  periodStart: v.number(), // timestamp
  periodEnd: v.number(),
  status: v.union(v.literal('draft'), v.literal('approved'), v.literal('paid')),
  createdBy: v.id('crm_chatters'),
  createdAt: v.number(),
  approvedBy: v.optional(v.id('crm_chatters')),
  approvedAt: v.optional(v.number()),
  paidAt: v.optional(v.number()),
  notes: v.optional(v.string()),
})
  .index('by_status', ['status'])
  .index('by_period', ['periodStart'])

// New table: Pay Run Line Items
crm_pay_run_items = defineTable({
  payRunId: v.id('crm_pay_runs'),
  chatterId: v.id('crm_chatters'),
  hoursWorked: v.number(),
  basePayRate: v.number(), // hourly rate
  basePay: v.number(),
  bonusTotal: v.number(),
  commissionTotal: v.number(),
  deductions: v.number(),
  grossPay: v.number(),
  netPay: v.number(), // after deductions
  paymentMethod: v.optional(v.string()), // usdc, usdt, wise, bank
  paymentStatus: v.union(v.literal('pending'), v.literal('paid'), v.literal('failed')),
  paymentRef: v.optional(v.string()), // tx hash, wire ref
  paidAt: v.optional(v.number()),
})
  .index('by_pay_run', ['payRunId'])
  .index('by_chatter', ['chatterId'])
  .index('by_status', ['paymentStatus'])
```

#### Phase 7B: Payroll Admin UI (4h)

**Goal**: Admin page to create, review, and approve pay runs.

**Route**: `/payroll`

**Views**:
1. **Pay Runs List** — Table of all pay runs (date range, status, total, actions)
2. **Create Pay Run** — Select period, preview totals, save as draft
3. **Pay Run Detail** — Line-by-line breakdown per chatter
   - Name, hours, base, bonuses, commissions, deductions, gross, net
   - Edit line items if needed
   - Approve / reject individual lines
4. **Bulk Actions** — Approve all, mark all paid, export CSV

**Components**:
- `PayRunsList.tsx` — Paginated list
- `CreatePayRunModal.tsx` — Period picker + preview
- `PayRunDetail.tsx` — Line item table
- `PayrollExportButton.tsx` — CSV download

#### Phase 7C: Payment Tracking (3h)

**Goal**: Track payment status per line item.

**Features**:
- Payment method per chatter (stored in chatter profile or per line item)
- Status workflow: `pending` → `paid` / `failed`
- Manual "Mark as Paid" with optional ref (tx hash, wire confirmation)
- Batch update: "Mark all as Paid"
- Payment history per chatter

**API**:
- `markItemPaid(itemId, paymentRef)` — Update status
- `batchMarkPaid(itemIds, paymentRef)` — Bulk update
- `getPaymentHistory(chatterId)` — Historical payments

#### Phase 7D: Export & Integrations (3h)

**Goal**: Export payroll data for external processors.

**Exports**:
1. **CSV Export** — Standard payroll CSV (name, email, amount, currency)
2. **Wise Batch CSV** — Formatted for Wise batch payments
3. **Gusto/Deel format** (if applicable)

**Future integrations** (out of scope for Phase 7):
- Crypto payment automation (USDC/USDT via wallet)
- Wise API direct payments
- Accounting software sync (QuickBooks, Xero)

### Files to Create

| File | Purpose |
|------|---------|
| `convex/crm/payroll.ts` | CRUD, aggregation, status updates |
| `lib/payroll-engine.ts` | Aggregation logic, pay calculations |
| `app/(crm)/payroll/page.tsx` | Pay runs list + create |
| `app/(crm)/payroll/[id]/page.tsx` | Pay run detail |
| `components/PayRunsList.tsx` | List component |
| `components/PayRunDetail.tsx` | Line items table |
| `components/CreatePayRunModal.tsx` | Period picker + preview |
| `components/PayrollExportButton.tsx` | CSV downloads |
| `app/api/payroll/export/route.ts` | Export endpoint |

### Testing Checklist

- [ ] Create pay run for current bi-weekly period
- [ ] Verify hours aggregation matches shift data
- [ ] Verify bonus totals match approved bonuses
- [ ] Verify commission totals match approved commissions
- [ ] Edit a line item → recalculates totals
- [ ] Approve pay run → status updates
- [ ] Mark as paid → payment status updates
- [ ] Export CSV → valid format, correct data
- [ ] TypeScript 0 errors
- [ ] Build clean

### Acceptance Criteria

- [ ] Admin can create pay runs for any date range
- [ ] All compensation data aggregated correctly
- [ ] Approve/reject workflow functional
- [ ] Payment tracking per line item
- [ ] CSV export downloads correctly
- [ ] Role-gated (admin only)
- [ ] Build passes, 0 TS errors

---

## Phase 8: Real-Time Chat Queue (BRIEF SPEC)

### Goal
Live visibility into message queue across all creators, enabling supervisors to intervene before SLA breaches.

### Approach Options

#### Option A: OnlyFans API Integration (Ideal)
- **Pros**: Real data, no manual entry, accurate response times
- **Cons**: OF API access unclear, may require scraping, compliance risk
- **Scope**: 20–30h (including integration, error handling, rate limits)

#### Option B: Manual Queue Entry (Pragmatic)
- **Pros**: Works today, no external dependencies
- **Cons**: Requires chatter discipline, potential data lag
- **Scope**: 12–16h

**Recommendation**: Start with Option B, upgrade to Option A when API access is available.

### Key Components (Option B)

1. **Message Intake Form** — Chatters log new messages (fan name, segment, priority)
2. **Queue Dashboard** — Real-time view of all pending messages
3. **Response Logging** — Mark message as responded, log response time
4. **SLA Indicators** — Color-coded by wait time (green/amber/red)
5. **Supervisor Actions** — Reassign, escalate, flag

### Schema

```typescript
crm_message_queue = defineTable({
  creatorId: v.id('crm_creators'),
  chatterId: v.id('crm_chatters'),
  fanName: v.string(),
  fanSegment: v.string(), // VIP, Whale, Core, Casual
  priority: v.string(), // high, normal, low
  status: v.union(v.literal('pending'), v.literal('responded'), v.literal('escalated')),
  createdAt: v.number(),
  respondedAt: v.optional(v.number()),
  responseTimeSec: v.optional(v.number()),
  escalatedTo: v.optional(v.id('crm_chatters')),
  notes: v.optional(v.string()),
})
```

---

## Phase 9: Supervisor Coaching Hub (BRIEF SPEC)

### Goal
Structured performance management with 1:1 notes, goals, and feedback tracking.

### Key Components

1. **1:1 Meeting Notes** — Log meetings with chatters, track action items
2. **Performance Goals** — Set and track individual KPIs (response time, earnings, etc.)
3. **Feedback Log** — Praise, constructive feedback, warnings
4. **Training Tracker** — Assign and track completion of training materials
5. **PIP Management** — Create/track performance improvement plans

### Schema

```typescript
crm_coaching_notes = defineTable({
  supervisorId: v.id('crm_chatters'),
  chatterId: v.id('crm_chatters'),
  meetingDate: v.number(),
  notes: v.string(),
  actionItems: v.array(v.object({
    item: v.string(),
    dueDate: v.optional(v.number()),
    completed: v.boolean(),
  })),
  followUpDate: v.optional(v.number()),
})

crm_performance_goals = defineTable({
  chatterId: v.id('crm_chatters'),
  metric: v.string(), // responseTime, earnings, shiftHours
  target: v.number(),
  current: v.number(),
  periodStart: v.number(),
  periodEnd: v.number(),
  status: v.union(v.literal('active'), v.literal('achieved'), v.literal('missed')),
})
```

---

## Phase 10 & 11 (Future)

### Phase 10: Mobile Push Notifications (8–10h)
- PWA with push notification support
- Critical alerts: VIP escalation, schedule changes
- Daily summaries: yesterday's performance
- Shift reminders: 30 min before scheduled shift

### Phase 11: Advanced Analytics & Forecasting (12–16h)
- Revenue forecasting (next 30/60/90 days)
- Churn prediction (identify at-risk chatters)
- Creator performance trends (improving/declining)
- Staffing recommendations based on seasonality

---

## Recommended Sequence

```
Phase 7 (Payroll)     ─────────────────────► Ship Week 2
                                 │
Phase 8 (Chat Queue)  ─────────────────────► Ship Week 3
                                 │
Phase 9 (Coaching)    ─────────────────────► Ship Week 3-4
                                 │
Phase 10 (Push)       ─────────────────────► Ship Week 4
                                 │
Phase 11 (Forecasting) ────────────────────► Ship Week 5
```

### Reasoning for Sequence

1. **Phase 7 first**: Immediate pain relief. Everyone gets paid properly. Builds trust with the team.

2. **Phase 8 second**: Real-time visibility is the next operational bottleneck. Once pay is sorted, focus shifts to "are we responding fast enough?"

3. **Phase 9 third**: With leaderboards and queue visibility, supervisors now need tools to act on the data (coach underperformers, retain top performers).

4. **Phases 10–11 last**: Nice-to-haves that improve polish but aren't critical for day-to-day ops.

---

## Key Assumptions

1. **Pay frequency**: Bi-weekly (every 2 weeks). Configurable if needed.
2. **Payment methods**: Primarily crypto (USDC/USDT) or Wise. Bank optional.
3. **Base hourly rate**: Stored per chatter profile. Already exists in schema.
4. **Bonus/commission data**: Complete from Phase 5D. Status = approved means ready to pay.
5. **OF API access**: Unknown. Phase 8 designed to work without it initially.

---

## Success Metrics

| Phase | Success Metric |
|-------|----------------|
| 7 | First pay run completed in <30 min (vs hours manually) |
| 8 | 95% of messages logged, response time visibility <5 min lag |
| 9 | Weekly 1:1s logged for all chatters |
| 10 | 80% of team has push notifications enabled |
| 11 | Forecast accuracy within ±10% |

---

## Conclusion

**Phase 7 (Payroll Dashboard)** is the clear next priority:
- Solves an immediate, recurring pain point
- Builds on existing data (no new integrations needed)
- Medium complexity, high confidence in delivery
- 12–16 hours total scope
- Sets the foundation for financial analytics later

**Start Phase 7 now. Ship by end of Week 2.**

---

*End of Phase 7+ Roadmap*
