# SPEC: Extract IG Analytics to separate /ig-stats page

## Overview
Move ALL Instagram analytics from `manager-dashboard/page.tsx` into a new `/ig-stats` page. The manager dashboard keeps only OF revenue, subs, and tracking links.

## File: `app/(crm)/manager-dashboard/page.tsx` (1,277 lines)

### REMOVE from manager-dashboard:
1. **All IG state variables** (lines ~178-196): `igDateRange`, `igMaxDate`, `igRows`, `igDailyGains`, `igReelCurves`, `igCreatorOptions`, `selectedIgCreator`, `showAllIgAccounts`, `selectedIgAccount`, `selectedIgAccountReels`, `selectedIgAccountCurve30d`
2. **All IG data fetching** inside the main `useEffect` (lines ~349-540): the `igEndPlusOne` calculation, the 4 parallel queries (`crm_ig_accounts`, `crm_ig_daily_snapshots`, `ig_active_reels`, `ig_account_reel_stats`), all IG data processing (`reelStatsByAccount`, `snapByAccount`, `reelCountByAccount`, `igRowsData`, `accountDailyGainRows`, reel curves logic), and the IG state setters (`setIgRows`, `setIgDailyGains`, etc.)
3. **IG creator filter useEffect** (~lines 553-563)
4. **IG account modal useEffect** (~lines 565-690)
5. **`maxIgEnd`** computation and `igRangeLabelText`
6. **`igDonutData` useMemo** (~lines 717-755)
7. **`filteredReelCurves` useMemo** (~lines 704-716)
8. **ALL IG JSX** starting from `📸 Instagram Analytics` header (~line 929) through the end of the IG section (reel modal inclusive, through ~line 1250)
   - This includes: header + date picker + creator filter, "Accounts summarized" card, donut charts, IG accounts table, IG daily gains chart (REMOVE entirely), reel 30-day curves (REMOVE entirely), reel modal popup
9. **`DonutWithLegend` component** (move to new page or shared component)

### KEEP in manager-dashboard:
- OF revenue section (date range, trend chart, revenue cards)
- Tracking links section
- All OF-related state and data fetching
- The page layout wrapper, auth check, loading state

### REMOVE ENTIRELY (do not move to new page):
- **IG Account Daily Gains chart** (`igDailyGains` state, the `enumerateDates` computation at ~line 433, and the `<LineChart data={igDailyGains}>` JSX at ~line 1062)
- **Reel 30-Day Performance Curves** (`igReelCurves` state, the reel curves computation at ~line 460, `filteredReelCurves` memo, and the curves JSX section)

## New File: `app/(crm)/ig-stats/page.tsx`

### Create this page with:
1. Same auth check pattern as manager-dashboard (redirect to /login if not authenticated)
2. Role check: `admin` and `marketing_manager` only
3. IG date range picker with `igMaxDate` from `ig_max_selectable_date()` RPC
4. Creator filter dropdown
5. **"Accounts summarized" card** — 6 KPIs (All Views, All Likes, New Followers, All Shares, Reels Posted, All Comments) in 2-column grid
6. **Donut/pie charts** — Views Comparison + New Followers Comparison (use the `DonutWithLegend` component, copy it into this file)
7. **IG accounts table** — sortable, with creator name, username, followers, views, likes, comments, shares, growth %, reels count. Show top 10 with "Show More" button
8. **Reel modal** — click an account row to see its reels with thumbnails, views gained, likes gained, comments gained
9. Follow the same dark theme (`#111`, `#1C2A3A`, `#253545` borders, etc.)

### Data queries (same as current):
- `crm_ig_accounts` — `.neq("is_active", false)` filter
- `crm_ig_daily_snapshots` — for follower delta
- `ig_active_reels` RPC — for reel modal
- `ig_account_reel_stats` RPC — for views/likes/comments/shares per account
- `ig_max_selectable_date` RPC — for date picker max

### Helper functions to copy:
- `toDateOnly`, `addDays`, `getLast7DaysEndingYesterday`, `clampRangeToMax`, `formatNumber`, `getYesterdayDateOnly`, `enumerateDates`
- `DonutWithLegend` component
- `DateRangePicker` import from `../../../components/DateRangePicker`

## Update: `app/(crm)/layout.tsx`

Add nav item:
```tsx
{ href: "/ig-stats", label: "IG Stats", emoji: "📸", roles: ["admin", "marketing_manager"] }
```

Place it after "Traffic Analytics" in the nav order.

## Constraints
- `npm run build` must pass
- Do NOT include IG daily gains chart or reel 30-day curves (removed features)
- Keep the same dark theme styling
- The reel modal should still work (click account → see reels)
- Shares column in the accounts table (new addition from today)
- Use `"use client"` directive at top
- Import supabase from `@/lib/supabase`

## Working directory
`/Users/jarvis/.openclaw/workspace/projects/preach-crm`
