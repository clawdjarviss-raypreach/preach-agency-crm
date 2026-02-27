# QC — CRM Analytics V2 (Phases 1-4)

**Reviewer:** QC (subagent)
**Date:** 2026-02-06
**Files reviewed:** omTransactionSync.ts, omSyncActions.ts, omAggregation.ts, analyticsV2.ts, http.ts, analytics/page.tsx

---

## 🔴 MUST-FIX (Blocking)

### 1. CRON ENDPOINTS: Auth bypass when `CRON_SECRET` is unset
**File:** `convex/http.ts` — lines for `/cron/om-sync` and `/cron/om-sync-transactions`
**Issue:** The auth check is wrapped in `if (cronSecret) { ... }`. If `CRON_SECRET` env var is not set (empty/undefined), **anyone can POST to these endpoints** and trigger full syncs + API calls at will.
**Impact:** Unauthenticated access, API token abuse, potential cost/rate-limit exhaustion.
**Fix:** Fail closed — if `cronSecret` is falsy, return 401 immediately. Never skip auth.
```ts
if (!cronSecret) return new Response('{"error":"CRON_SECRET not configured"}', { status: 500 });
```

### 2. `syncAllCreators` and `backfillAllCreators` are public actions (no auth)
**File:** `convex/crm/omSyncActions.ts` — lines 342, 426
**Issue:** Both are exported as `action({})` (not `internalAction`), and take no auth token argument. They're callable by **any Convex client** directly via `api.crm.omSyncActions.syncAllCreators()`. The HTTP routes add auth, but the actions themselves are wide open.
**Impact:** Any client with the Convex deployment URL can trigger full syncs.
**Fix:** Change both to `internalAction` and call them via `internal.crm.omSyncActions.*` in http.ts. Same for `recomputeAggregatesRange` in omAggregation.ts.

### 3. `getDashboard` fetches ALL raw transactions for unique-spender count — full table scan
**File:** `convex/crm/analyticsV2.ts` — `getDashboard`, around line 60-70
**Issue:** After reading aggregates, the query fetches **all raw transactions** in the date range using `by_timestamp` index with a filter. For a 90-day range this could be hundreds of thousands of rows. This runs on every dashboard load.
**Impact:** Slow queries, Convex function timeouts, excessive DB reads billed.
**Fix:** Add `uniqueFanCount` to the daily aggregates (it's already there! — it's computed in `omAggregation.ts`). Sum it from aggregates instead of scanning raw transactions. Same issue in `getCreatorBreakdown` (line ~160) — it re-fetches all creator transactions just for unique fan count, which is already in the aggregate.

### 4. `getTopFans` fetches ALL transactions in range — unbounded
**File:** `convex/crm/analyticsV2.ts` — `getTopFans`
**Issue:** Collects every transaction in the date range into memory, groups by fan, sorts. For 90 days with 100k+ transactions this will OOM or timeout.
**Impact:** Query crash on large date ranges.
**Fix:** This needs a pre-computed `crm_om_fan_aggregates` table (or paginated approach). Short-term, add a hard limit on the collect (e.g., `.take(50000)`) and document the limitation.

### 5. `formatDelta` division by zero not fully guarded on frontend
**File:** `app/(crm)/analytics/page.tsx` — `formatDelta` function
**Issue:** `previous === 0` is checked, but `previous` can be `undefined` when `prevDashboard` is still loading (query returns `undefined`). The calling code does `stat.prev !== undefined` but TypeScript won't catch this at runtime if the query shape changes.
**Current guard:** Partial — the `delta` is only computed when both are `!== undefined`. This is OK *for now* but fragile. **Downgraded to WARNING.**

---

## 🟡 WARNINGS (Fix Later)

### W1. Revenue donut excludes "other" category
**File:** `analytics/page.tsx` — `totalTypeRevenue` calculation
**Issue:** `totalTypeRevenue = sub + msg + tip` — deliberately excludes `otherRevenue`. The donut percentages therefore don't represent the full picture. If "other" is significant, users see misleading percentages.
**Fix:** Either include "other" as a fourth slice, or label the donut "Revenue by Type (excl. other)".

### W2. ARPPU card is duplicate of APC
**File:** `analytics/page.tsx` — KPI Row 2
**Issue:** Both "APC (Avg/Customer)" and "ARPPU" display `avgPerCustomer`. ARPPU (Average Revenue Per Paying User) is the same metric. Wastes a card slot and confuses users.
**Fix:** Remove duplicate or compute a different metric (e.g., net revenue per customer).

### W3. `by_date` index on aggregates only has `["date"]` — dashboard queries filter by date range
**File:** `analyticsV2.ts` — `getDashboard`, `getRevenueTrend`, `getCreatorBreakdown`
**Issue:** These queries use `.withIndex("by_date")` then `.filter(gte/lte)`. Convex index range queries need the filter fields *in* the index. The `filter()` after `withIndex` scans all docs returned by the index prefix. Since `by_date` is `["date"]`, using `.gte/.lte` on `date` in `.filter()` means Convex scans the whole index.
**Fix:** Use `.withIndex("by_date", q => q.gte("date", start).lte("date", end))` to push the range into the index scan. This is a correctness + performance issue but won't produce wrong results — just slower.

### W4. `normalizeRevenueCategory` may mis-categorize
**File:** `omSyncActions.ts` — `normalizeRevenueCategory`
**Issue:** `"post purchase"` maps to `"message"`. Is that accurate? Also `"live stream"` maps to `"tip"`. These may need validation against actual OM API values.
**Fix:** Log unknown types, audit against real data.

### W5. Aggregation new-fan detection is per-creator-agnostic
**File:** `omAggregation.ts` — `computeAndUpsertForCreatorDate`
**Issue:** "New fan" check queries `by_fan` index for *any* earlier transaction, regardless of creator. A fan who subscribed to Creator A last month shows as "returning" for Creator B today. This may or may not be the desired behavior.
**Fix:** Clarify intent. If per-creator new fans are wanted, add a `by_creator_fan` compound index.

### W6. No error boundary on dashboard page
**File:** `analytics/page.tsx`
**Issue:** If any query throws (e.g., expired token), the page will crash with an unhandled error. No React error boundary wraps the component.
**Fix:** Add error boundary or try/catch around query results.

---

## ✅ Looks Good

- Token-based auth on all `analyticsV2` queries — properly checks role + expiry
- Manual sync/backfill HTTP endpoints require admin token
- Upsert logic uses proper indexes (`by_om_id`) to dedupe
- Rate-limit retry with backoff on OM API calls
- Aggregation math is correct (revenue categories sum properly, chargebacks subtracted)
- Frontend loading states handled via conditional `"skip"` on queries
- Batch processing (100 per mutation) avoids Convex mutation size limits

---

**Summary:** 4 must-fix issues (2 security, 2 performance/crash). The security ones (#1, #2) should block deploy. The performance ones (#3, #4) will bite as data grows but may be OK for initial launch with small datasets.
