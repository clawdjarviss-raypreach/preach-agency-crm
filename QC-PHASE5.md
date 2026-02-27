# QC Report — Phase 5: Leaderboard & Gamification

**Reviewer:** QC subagent  
**Date:** 2026-02-06  
**Scope:** streaks.ts, achievements.ts, leaderboard.ts, shifts.ts (mod), salesReports.ts (mod), crons.ts, leaderboard/page.tsx

---

## 🔴 MUST-FIX

### 1. Full table scans in leaderboard queries — `leaderboard.ts`
**Severity: HIGH (performance)**

Every leaderboard data-fetcher does `.collect()` on entire tables and filters in JS:
- `getSalesValues()` → `crm_sales_reports.withIndex("by_date").collect()` then JS `.filter()` by date range
- `getHoursValues()` → `crm_shifts.collect()` (no index at all!) then JS filter
- `getPpvValues()` → `crm_om_chatter_metrics.collect()` (no index at all!) then JS filter
- `getStreakValues()` → `crm_streaks.collect()`

This runs **6 full-table scans per leaderboard load** (current + previous period for each). With growing data these queries will hit Convex limits or become very slow.

**Fix:** Use `.withIndex("by_date")` with range bounds (`.gte(start).lte(end)`), or at minimum use a range-capable index. For `crm_shifts`, use `by_date` index.

---

### 2. Full table scans in achievement evaluation — `achievements.ts`
**Severity: HIGH (performance)**

`evaluateChatterAchievements()`:
- Fetches ALL of a chatter's sales reports (`by_chatter` index, `.collect()`) just to filter by week/month in JS
- Fetches ALL sales reports by date for weekly/monthly ranking: `.withIndex("by_date").collect()` → JS filter

This is called once per chatter per day AND on every sales report submission. At N chatters × M reports, this scales badly.

**Fix:** Use `by_chatter_date` composite index with date-range bounds for per-chatter queries. For all-chatter ranking queries, use `by_date` with bounds.

---

### 3. Full table scans in streak crons — `streaks.ts`
**Severity: MEDIUM**

Both `evaluateStreaksDaily` and `resetWeeklyFreezes` do `ctx.db.query("crm_streaks").collect()` — full table scan. Acceptable at <50 users, will become a problem at scale.

**Fix (later):** Acceptable for now if team is small. Add a `by_lastWorkDate` index if team grows past ~100.

---

### 4. Double-freeze on clock-in + daily cron race — `streaks.ts`
**Severity: MEDIUM (logic bug)**

If a user misses 1 day and clocks in the *next* day, `updateStreakOnClockIn` applies a freeze (`gap === 2`). But `evaluateStreaksDaily` (runs 06:00 UTC) also checks the same gap and can apply a *second* freeze for the same missed day. This could:
- Count 2 freeze uses from 1 allowed per week (wasting the quota)
- Or contradict each other if the cron runs first and resets the streak, then clock-in tries to continue it

**Scenario:** User works Mon, skips Tue, cron runs Wed 06:00 (applies freeze for Tue), user clocks in Wed 10:00 (tries to apply freeze again — `freezesUsed` is now already incremented).

The clock-in handler checks `gap === 2` from `lastWorkDate` to `clockInDate`, but after the cron has already run, the streak record may already have `lastFreezeDate` set — but the streak count was NOT incremented by the cron, so the clock-in will still see `gap === 2` and increment `freezesUsed` again. Net result: **2 freeze uses deducted for 1 missed day**.

**Fix:** In `updateStreakOnClockIn`, check if `lastFreezeDate` equals yesterday before applying another freeze. Or: remove the freeze logic from the cron entirely and let clock-in be the sole freeze handler.

---

### 5. `Date.now()` / `new Date()` used in Convex queries — multiple files
**Severity: MEDIUM (determinism)**

Convex requires queries to be deterministic. Using `new Date()` / `Date.now()` inside `query` handlers violates this:
- `getMyStreak` → `getTodayDateString()` uses `new Date()`
- `getLeaderboard` → `getTodayDateString()` via `getPeriodRange()`
- `getAchievements` → `getTodayDateString()`
- `getSessionUser` → `Date.now()` for expiry check

**Note:** Convex may silently allow this in practice but it's flagged as non-deterministic. The session expiry check (`session.expiresAt < Date.now()`) is the most common pattern and Convex tolerates it. The date-string generation is also functionally okay since queries aren't cached across days. **Low-urgency** but worth noting for correctness.

---

### 6. Achievement ranking check is premature — `achievements.ts`
**Severity: MEDIUM (logic bug)**

`evaluateChatterAchievements` awards `rank_1_day`, `rank_1_week`, `rank_1_month` based on a snapshot taken when ONE chatter submits a report. At that moment, other chatters may not have submitted yet. This means:
- Early reporter gets `rank_1_day` even though they won't end the day #1
- The achievement is permanent (never revoked)

This is called on every `salesReports.submit()`, meaning whoever reports first in the day/week likely gets awarded #1 prematurely.

**Fix:** Only award ranking achievements in the daily cron (`evaluateAllAchievementsDaily`), not on individual report submission. Or: award ranking badges only for completed periods (yesterday's daily, last week's weekly, last month's monthly).

---

### 7. `streakStartDate: undefined` on streak break — `streaks.ts`
**Severity: LOW-MEDIUM**

In `evaluateStreaksDaily`, when a streak breaks:
```ts
await ctx.db.patch(streak._id, {
  currentStreak: 0,
  streakStartDate: undefined,
  ...
});
```
Convex `patch` with `undefined` may not clear the field (it keeps the old value). Use `null` or remove the field explicitly if the intent is to clear it.

**Fix:** Confirm behavior with Convex runtime. If field should be cleared, schema should allow `v.optional()` and the value should be set explicitly.

---

## ⚠️ WARNINGS

### W1. `evaluateAllAchievementsDaily` fans out via scheduler — `achievements.ts`
Schedules one `evaluateChatterAchievements` per active chatter with `runAfter(0)`. This is fine for small teams (<50) but will create a burst of function invocations. Each invocation itself does multiple full-table scans (see MUST-FIX #2). At scale, this is a Convex bill bomb.

### W2. No `crm_targets` with `chatterId: undefined` will match — `achievements.ts`
```ts
q.eq("chatterId", undefined as any)
```
This is a hack to query team-wide targets. The `by_chatter_period` index with `chatterId: undefined` may not match `v.optional(v.id(...))` fields correctly depending on Convex's handling of undefined in indexes. Should test this path.

### W3. Frontend: `localStorage` accessed without SSR guard in `RankingsTable` — `page.tsx`
```ts
const userData = typeof window !== "undefined" ? localStorage.getItem("crm_user") : null;
```
This is guarded but could cause hydration mismatch (server renders without `myChatterId`, client renders with it). Minor visual flicker possible.

### W4. Redundant `resetWeeklyFreezes` cron — `crons.ts`
The freeze-week-reset logic is already handled inline in both `evaluateStreaksDaily` and `updateStreakOnClockIn` (they check if `freezeWeekStart !== thisMonday` and reset). The separate Monday cron is redundant but harmless.

### W5. No minimum-data guard on efficiency — `leaderboard.ts`
The `MIN_HOURS = 10` threshold in `getEfficiencyValues` prevents division by zero. Good. But for "today" period, nobody will have 10 hours, so the efficiency leaderboard will always be empty for "today". Consider lowering the threshold for shorter periods or hiding efficiency for "today".

### W6. Streak "All Time" period disabled in UI but not in backend — `page.tsx`
UI disables "All Time" for streaks (good — streaks are point-in-time). But the backend doesn't reject `period: "all_time"` + `category: "streaks"` — it just returns current values regardless. Not a bug, just inconsistent.

---

## ✅ GOOD

- **Auth:** All queries and mutations validate token. No auth bypasses found.
- **Double-award prevention:** `awardIfNew` checks `by_chatter_achievement` index before insert. Streak milestones also check `existing` before insert. Solid.
- **Shift integration:** Clock-in correctly triggers streak update via `ctx.scheduler.runAfter(0)`. Clean.
- **Sales report integration:** Submit correctly triggers achievement eval. Clean.
- **Frontend null safety:** All query results are conditional-rendered (`leaderboard &&`, `streak &&`, etc.). No obvious crash paths.
- **Cron schedules:** Correct times, no recursion or infinite loops.
