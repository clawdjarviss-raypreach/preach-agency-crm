# OF Sync Fix Spec — Structured Plan

## Status: READY FOR CODER

## Context
The Edge Functions (of-sync, of-webhook) were ported from Convex but have several bugs.
This spec lists EVERY issue, the exact fix, and the file/line to change.

Reference code: `docs/convex-reference/` — the WORKING Convex version.

---

## Issue 1: syncEarnings — looping per-day instead of one call

### Problem
Current `syncEarnings()` in `supabase/functions/of-sync/index.ts` loops through 91 days 
and makes 3 API calls PER DAY = 273 calls per account = 1,638 calls for 6 accounts.
This is insane. The Convex version called the analytics endpoints with `start_date=today, end_date=today` 
(single day, single call). It ran on a 20-minute interval cron, NOT as a 90-day backfill every time.

### Fix
Split into TWO modes:
1. **Daily sync (default)**: Call 3 analytics endpoints for TODAY only. This is what runs on cron.
2. **Backfill mode**: When `body.startDate` and `body.endDate` are provided, loop through dates.

```typescript
async function syncEarnings(accountId: string, startDate?: string, endDate?: string) {
  const date = startDate ?? new Date().toISOString().slice(0, 10);
  const end = endDate ?? date;
  const dates = listDates(date, end);
  
  // For daily sync (1 date), this is just 3 API calls
  // For backfill, it loops — but that's intentional one-time use
  // ... rest stays the same
}
```

In the main handler:
```typescript
if (job === 'earnings') {
  results.push({ accountId, ...(await syncEarnings(accountId, body.startDate, body.endDate)) });
}
```

### Verification
- `POST /functions/v1/of-sync {"job":"earnings"}` → syncs TODAY only (3 calls per account)
- `POST /functions/v1/of-sync {"job":"earnings","startDate":"2025-12-01","endDate":"2026-03-03"}` → backfill

---

## Issue 2: syncTrackingLinks — name/url fields wrong

### Problem
In `syncTrackingLinks()`, the field mapping for name and url is wrong:
```typescript
const rawName = link?.name ?? link?.title ?? link?.slug ?? link?.campaignName ?? url ?? linkId;
```
This tries `link.name` first (which doesn't exist in the API response) then falls through to `linkId`.

The OF API returns:
```json
{
  "id": 2487217,
  "campaignName": "schreiner speaking",
  "campaignUrl": "https://onlyfans.com/blondieeleni/c29",
  "clicksCount": 2953,
  "subscribersCount": 56
}
```

### Fix
Match the Convex reference EXACTLY:
```typescript
const name = String(link?.campaignName ?? link?.name ?? link?.title ?? 'Unnamed link');
const url = String(link?.campaignUrl ?? link?.url ?? link?.trackingUrl ?? '');
const clicks = Number(link?.clicksCount ?? link?.clicks ?? 0);
const subscribers = Number(link?.subscribersCount ?? link?.subscribers ?? 0);
```

Also: The analytics endpoint call per link is unnecessary — the link object itself has clicks/subscribers.
The Convex version used `link.clicksCount` and `link.subscribersCount` directly.
REMOVE the per-link analytics call — it wastes API credits and the data is already in the list response.

### Verification
- After fix: `crm_of_tracking_links` should have name="schreiner speaking", url="https://onlyfans.com/blondieeleni/c29"
- NOT name="2487217", url="2487217"

---

## Issue 3: subscription_count includes rebills

### Problem
The `subscription_count` field in `crm_of_daily_earnings` counts both new subs AND rebills.
Dashboard shows this as "New Fans" — inflated number (56 vs actual 24 new).

The Convex version had a bug here too (it used `bd?.subscription_count` which was ambiguous).
But the analytics API gives us `bd.new_subscription.count` and `bd.recurring_subscription.count` separately.

### Fix (already in current code, verify it's correct)
```typescript
subscription_count: toNumber(bd?.new_subscription?.count),  // NEW subs only
```

This IS already in the current code. But verify the dashboard reads `subscription_count` as "New Fans":
- File: `app/(crm)/admin/page.tsx` or `AdminRevenueDashboard` component
- Search for where `subscription_count` is displayed
- Make sure label says "New Subs" not "New Fans" (fans can come from free trials too)

### Verification
- Leni yesterday: subscription_count should be 24 (new_subscription only), not 56

---

## Issue 4: Stale Convex IDs in assigned_creators

### Problem
`crm_chatters.assigned_creators` contains old Convex IDs like `k57ca41jf5zj9dwrh3nc8hzsm980njs4`.
These don't match Supabase UUIDs, so creator selection appears unselected on page reload.

### Fix
Run SQL to clear stale data:
```sql
UPDATE crm_chatters SET assigned_creators = '[]'::jsonb WHERE assigned_creators != '[]'::jsonb;
```
Rayan will re-assign creators through the UI (which writes correct Supabase UUIDs).

### Verification
- After clearing: member edit → select creators → save → reload → creators should still be selected

---

## Issue 5: of-webhook transaction handling — net_amount vs amount

### Problem
In `handleTransaction()`, the webhook receives `payload.net_amount` (after OF's 20% fee) 
but the code reads `payload.amount` first, then falls back to `payload.net`.

The Convex version explicitly used `payload.net_amount ?? payload.netAmount`.

### Fix
```typescript
const amount = Number(payload?.net_amount ?? payload?.netAmount ?? payload?.net ?? payload?.amount ?? 0);
```

This ensures we store the NET amount (what creator actually receives) not the gross.

### Verification
- Send test webhook with `{amount: 10, net_amount: 8}` → should store 8, not 10

---

## Issue 6: of-webhook subscription handling — double-counting

### Problem
`handleSubscription()` calls `handleTransaction()` which inserts into both `crm_of_transactions` 
AND updates `crm_of_daily_earnings`. But `subscriptions.new` webhook may arrive alongside 
`transactions.new` for the same subscription, causing double-counting.

The Convex version handled this by:
- `handleTransactionWebhook`: Inserts tx + updates daily earnings (dedupes on ofTransactionId)
- `handleSubscriptionWebhook`: ONLY upserts the fan record (no financial write)

### Fix
Change `handleSubscription()` to NOT call `handleTransaction()`. Instead:
```typescript
async function handleSubscription(accountId: string, payload: any, isRenewal: boolean) {
  // Only upsert fan — financial tracking is handled by transactions.new
  await upsertFanFromPayload(accountId, payload);
  
  const fanId = payload?.user?.id ? String(payload.user.id) : null;
  if (fanId) {
    await supabaseAdmin.from("crm_of_fans").upsert({
      account_id: accountId,
      fan_id: fanId,
      username: payload?.user?.username ?? `fan_${fanId}`,
      display_name: payload?.user?.name ?? null,
      is_subscribed: true,
      is_active: true,
      last_seen: new Date().toISOString(),
    }, { onConflict: "fan_id" });
  }
  
  return { ok: true, action: "subscription", isRenewal };
}
```

### Verification
- A new subscription should only create ONE transaction row (from transactions.new), not two

---

## Issue 7: syncFans — not storing to database

### Problem
Current `syncFans()` fetches fans from API but only returns a count — doesn't store anything.

The Convex version stored each fan to `crm_of_fans` with full data (username, totalSpend, 
subscribedAt, expiredAt, renewsAt, subscriptionPrice, isActive, lastSeen).

### Fix
```typescript
async function syncFans(accountId: string) {
  return withSyncState(accountId, 'fans', async () => {
    let offset = 0;
    let totalSynced = 0;
    
    while (true) {
      const payload = await fetchOf(`/api/${accountId}/fans/all`, { query: { limit: 100, offset } });
      const fans = listFromPayload(payload);
      if (fans.length === 0) break;
      
      const rows = fans.map((fan: any) => ({
        account_id: accountId,
        fan_id: String(fan.id ?? fan.fan_id ?? fan.user?.id),
        username: String(fan.username ?? fan.user?.username ?? 'unknown'),
        display_name: fan.display_name ?? fan.displayName ?? fan.user?.name ?? null,
        total_spend: Number(fan.totalSpend ?? fan.total_spend ?? fan.spending?.total ?? 0),
        subscribed_at: fan.subscribed_at ? new Date(fan.subscribed_at).toISOString() : null,
        expired_at: fan.expired_at ? new Date(fan.expired_at).toISOString() : null,
        renews_at: fan.renews_at ? new Date(fan.renews_at).toISOString() : null,
        subscription_price: fan.subscription_price ? Number(fan.subscription_price) : null,
        is_subscribed: fan.is_subscribed ?? fan.isSubscribed ?? null,
        is_active: Boolean(fan.is_active ?? fan.isActive ?? true),
        last_seen: fan.last_seen ? new Date(fan.last_seen).toISOString() : null,
        synced_at: new Date().toISOString(),
      }));
      
      const { error } = await supabaseAdmin
        .from('crm_of_fans')
        .upsert(rows, { onConflict: 'fan_id' });
      if (error) throw error;
      
      totalSynced += rows.length;
      if (fans.length < 100) break;
      offset += 100;
    }
    
    return { synced: totalSynced };
  });
}
```

### Verification
- `crm_of_fans` should have rows with username, totalSpend, subscribedAt etc.

---

## Issue 8: syncForecast — not storing to database

### Problem
Current `syncForecast()` fetches forecast but doesn't store it.
The Convex version stored it to `crm_of_forecast_cache`.

### Fix
```typescript
async function syncForecast(accountId: string) {
  return withSyncState(accountId, 'forecast', async () => {
    const payload = await fetchOf('/api/analytics/financial/forecast', {
      method: 'POST',
      body: {
        account_id: accountId,
        metric: 'revenue',
        model: 'linear_regression',
        historical_days: 30,
        forecast_days: 90,
      },
    });
    
    const { error } = await supabaseAdmin
      .from('crm_of_forecast_cache')
      .upsert({
        account_id: accountId,
        forecast_data: payload,
        generated_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
      }, { onConflict: 'account_id' });
    if (error) throw error;
    
    return { ok: true };
  });
}
```

### Verification
- `crm_of_forecast_cache` should have forecast data per account

---

## Issue 9: syncChargebacks — not storing to database

### Problem
Current `syncChargebacks()` fetches chargebacks but only returns count.
The Convex version stored chargeback amounts per date to `crm_of_daily_earnings`.

### Fix
Port from Convex `syncChargebacks` — fetch chargebacks for today, update 
`crm_of_daily_earnings.chargeback_amount` and `chargeback_count` for today's date.

---

## Issue 10: Missing tables

### Required tables (create if they don't exist):
1. `crm_of_fans` — fan records (may exist from migration, verify schema)
2. `crm_of_forecast_cache` — forecast data per account  
3. `crm_of_sync_state` — sync state tracking
4. `crm_of_webhook_events` — raw webhook event log

Check each table exists and has the right columns. Create migration if needed.

---

## Execution Order

1. Fix syncTrackingLinks name/url mapping (Issue 2) — smallest, most visible
2. Fix syncEarnings daily vs backfill mode (Issue 1) — biggest impact
3. Fix of-webhook subscription double-counting (Issue 6) + net_amount (Issue 5)
4. Fix syncFans to actually store data (Issue 7)
5. Fix syncForecast to store data (Issue 8)
6. Fix syncChargebacks to store data (Issue 9)
7. Clear stale assigned_creators (Issue 4) — SQL only
8. Verify/create missing tables (Issue 10)
9. Deploy both functions
10. Run initial sync: earnings (today only), tracking_links, fans
11. Truncate + re-sync tracking links to get correct names
12. Run backfill: `{"job":"earnings","startDate":"2025-12-01","endDate":"2026-03-03"}` for all accounts
13. Verify dashboard shows today's real numbers
14. Rebuild + restart frontend

## Post-Deploy Verification Checklist
- [ ] Today's earnings show real $ amount (not $0)
- [ ] Yesterday's subscription_count = new subs only (not rebills)
- [ ] Tracking links show campaign names (not numeric IDs)
- [ ] Creator access persists after page reload (after clearing stale IDs)
- [ ] Members page loads
- [ ] Webhook test event gets processed correctly
- [ ] No double-counting from subscription + transaction webhooks
