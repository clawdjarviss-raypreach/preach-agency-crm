# Phase 5: Creator Leaderboard (2h)

## Goal
Display creator performance rankings with YTD/MTD/WTD filters and achievement badges.

## Components & Routes

### 1. Leaderboard Page (`/leaderboard`) (1h)
- **View by metric:** Response Rate, Avg Response Time, Earnings
- **Time filters:** YTD (Year-to-Date), MTD (Month-to-Date), WTD (Week-to-Date)
- **Sortable table:**
  - Rank (1–N)
  - Creator name/avatar
  - Response rate (%)
  - Avg response time (minutes)
  - Earnings (current period)
  - Badges (Speedster, Top Earner, VIP Favorite)

### 2. Badges Engine (0.5h)
- **Speedster** — avg response time <1 min
- **Top Earner** — top 3 earnings (period)
- **VIP Favorite** — handled 10+ VIP messages (period)
- **Consistency** — 95%+ response rate for 7+ days

### 3. Leaderboard Stats Endpoint (`GET /api/leaderboard`) (0.5h)
- Query window: period (ytd/mtd/wtd)
- Compute rankings: group by creator, aggregate metrics
- Award badges based on thresholds
- Sort by selected metric
- Return: Array of `{ rank, creator, responseRate, avgResponseTime, earnings, badges }`

## Schema Changes (Convex)

```typescript
// New: LeaderboardEntry (cached computed data, refreshed hourly)
crm_leaderboard_entry = defineTable({
  period: v.string(), // "ytd" | "mtd" | "wtd"
  creatorId: v.id('crm_creators'),
  rank: v.number(),
  responseRate: v.number(), // 0–100
  avgResponseTimeSec: v.number(),
  earnings: v.number(),
  badges: v.array(v.string()), // ["speedster", "top_earner", ...]
  computedAt: v.number(),
})
  .index('by_period_rank', ['period', 'rank'])
```

## API Contract

```
GET /api/leaderboard?period=ytd
→ {
    period: "ytd",
    updated: 1234567890,
    entries: [
      {
        rank: 1,
        creatorId: "crm_...",
        creatorName: "...",
        creatorAvatar: "...",
        responseRate: 98.5,
        avgResponseTimeSec: 45,
        earnings: 2500.00,
        badges: ["speedster", "top_earner", "vip_favorite"]
      },
      ...
    ]
  }
```

## Files to Create

| File | Purpose |
|------|---------|
| `convex/crm/leaderboard.ts` | Query functions, badge calculation |
| `app/api/leaderboard/route.ts` | API endpoint |
| `app/(crm)/leaderboard/page.tsx` | Leaderboard UI (table + filters) |
| `lib/leaderboard-engine.ts` | Badge logic, rank computation |

## Performance Notes

- **Caching:** Compute leaderboard hourly (cron: `leaderboard:compute`)
- **Indexing:** Use `by_period_rank` to fetch rankings fast
- **Real-time updates:** Optional live badge count badge on sidebar

## Testing Checklist

- [ ] Load `/leaderboard` with no parameters → defaults to MTD
- [ ] Switch between YTD/MTD/WTD → rankings update
- [ ] Click metric toggle (Response Rate/Time/Earnings) → sort order changes
- [ ] Badges display correctly for top creators
- [ ] Rankings are accurate (manually verify top 3 vs. DB)
- [ ] No TypeScript errors
- [ ] Build clean

## Acceptance Criteria

- [ ] All endpoints respond with correct data structure
- [ ] Table displays creators ranked 1–N
- [ ] Badges render based on achievement
- [ ] Filter controls work without errors
- [ ] npx tsc --noEmit → 0 errors
- [ ] npm run build → clean
- [ ] Manual test: verify top 3 creators by earnings match DB query
