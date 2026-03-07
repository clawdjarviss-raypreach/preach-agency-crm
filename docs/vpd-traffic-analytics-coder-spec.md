# Coder Spec: Wire VPD Data into Traffic Analytics UI

## File to edit
`app/(crm)/traffic-analytics/page.tsx`

## Overview
The Traffic Analytics page currently uses the old `performance_ratio` (views / account_avg_views) to rank and badge reels. We've now switched to VPD-based outlier detection. The new VPD fields are already populated on `crm_ig_reels` by the Render scraper. This task updates the UI to use VPD data.

## Database columns available on `crm_ig_reels`
These VPD columns already exist and are populated:
- `lifetime_vpd` (float) — views ÷ age_in_days
- `effective_vpd` (float) — MAX(lifetime_vpd, delta_vpd)
- `delta_vpd` (float, nullable) — VPD from last 6-hour delta (null until 2nd scrape cycle)
- `performance_ratio` (float) — effective_vpd ÷ account_median_vpd (KEEP THIS — it's already VPD-based now)
- `is_winner` (boolean) — performance_ratio >= threshold AND projected_views >= 100K
- `is_trending` (boolean) — delta_vpd >= 5x account median delta
- `projected_views` (float, nullable) — effective_vpd × 14 (projected 14-day views)
- `account_avg_views` (float) — currently 0 for most reels (old system), ignore this field

## Changes Required

### 1. Update the `WinningReel` type
Add VPD fields to the type:
```typescript
type WinningReel = {
  // ... existing fields ...
  lifetime_vpd?: number | null;
  effective_vpd?: number | null;
  delta_vpd?: number | null;
  is_trending?: boolean | null;
  projected_views?: number | null;
};
```

### 2. Update the Supabase query (in `loadBase()`)
Change the select to include VPD fields:
```
.select("id,ig_account_id,thumbnail_url,video_url,caption,posted_at,views,likes,comments,performance_ratio,is_winner,account_avg_views,analysis_status,matched_pattern_id,shortcode,lifetime_vpd,effective_vpd,delta_vpd,is_trending,projected_views,crm_ig_accounts!inner(username)")
```

Sort by `effective_vpd` descending instead of `performance_ratio`:
```
.order("effective_vpd", { ascending: false, nullsFirst: false })
```

Map the new fields in the result mapper:
```typescript
lifetime_vpd: reel.lifetime_vpd == null ? null : Number(reel.lifetime_vpd),
effective_vpd: reel.effective_vpd == null ? null : Number(reel.effective_vpd),
delta_vpd: reel.delta_vpd == null ? null : Number(reel.delta_vpd),
is_trending: Boolean(reel.is_trending),
projected_views: reel.projected_views == null ? null : Number(reel.projected_views),
```

Sort the final array by `effective_vpd` desc:
```typescript
.sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));
```

### 3. Update `winningFiltered` sort
Change from `performance_ratio` to `effective_vpd`:
```typescript
.sort((a, b) => Number(b.effective_vpd || 0) - Number(a.effective_vpd || 0));
```

### 4. Update IdeaCard component

#### 4a. Add VPD props
Add these props to the IdeaCard function signature:
```typescript
vpd?: number | null;
projectedViews?: number | null;
isTrending?: boolean | null;
```

#### 4b. Update the performance badge area in IdeaCard header
Replace the single ratio badge with a richer display. In the header div (after likes/comments), show:

```tsx
{/* VPD badge */}
<span style={{ background: "#1e293b", color: "#93c5fd", fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
  {formatNumber(Math.round(vpd || 0))} VPD
</span>

{/* Ratio badge (keep existing) */}
<span style={{ background: ratioStyle.bg, color: ratioStyle.text, fontSize: 12, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
  {Number(ratio || 0).toFixed(1)}x
</span>

{/* Projected views */}
{projectedViews && projectedViews > 0 ? (
  <span style={{ background: "#1a1a2e", color: "#a78bfa", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "4px 8px" }}>
    → {formatNumber(Math.round(projectedViews))} projected
  </span>
) : null}

{/* TRENDING badge */}
{isTrending ? (
  <span style={{ background: "#7c2d12", color: "#fdba74", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>
    🔥 TRENDING
  </span>
) : null}

{/* WINNER badge (existing) */}
{badge ? <span style={{ background: "#1f2937", color: "#cbd5e1", fontSize: 11, fontWeight: 800, borderRadius: 999, padding: "4px 8px" }}>{badge}</span> : null}
```

### 5. Update IdeaCard call sites

Where IdeaCard is rendered for winning reels (~line 906), add:
```tsx
vpd={reel.effective_vpd}
projectedViews={reel.projected_views}
isTrending={reel.is_trending}
```

### 6. Update ThumbnailCard component
Add VPD + trending props to ThumbnailCard as well.

Find the ThumbnailCard function and add:
```typescript
vpd?: number | null;
isTrending?: boolean | null;
```

In the ThumbnailCard body, add a VPD line and trending indicator:
```tsx
{/* After the ratio badge */}
{vpd ? (
  <span style={{ color: "#93c5fd", fontSize: 10, fontWeight: 700 }}>
    {formatNumber(Math.round(vpd))} VPD
  </span>
) : null}
{isTrending ? (
  <span style={{ color: "#fdba74", fontSize: 10, fontWeight: 700 }}>🔥</span>
) : null}
```

Update the ThumbnailCard call site (~line 935) to pass:
```tsx
vpd={reel.effective_vpd}
isTrending={reel.is_trending}
```

### 7. Update summary stats bar
In the `winningStats` useMemo (~line 640), add:
```typescript
const trendingCount = winningReels.filter((reel) => reel.is_trending).length;
const winnerCount = winningReels.filter((reel) => reel.is_winner).length;
const avgVpd = winningReels.length > 0
  ? winningReels.reduce((sum, reel) => sum + Number(reel.effective_vpd || 0), 0) / winningReels.length
  : 0;

return { totalFollowers, totalReels, avgViews, trendingCount, winnerCount, avgVpd };
```

Then in the stats display area (~line 830), add stats cards for:
- Winners: `{winningStats.winnerCount}`
- Trending: `{winningStats.trendingCount}` (with 🔥)
- Avg VPD: `{formatNumber(Math.round(winningStats.avgVpd))}`

### 8. Add "Trending Only" filter toggle
Next to the existing "Winners Only" button, add a "Trending" toggle:

```tsx
<button
  onClick={() => setTrendingOnly(!trendingOnly)}
  style={{
    border: "1px solid #2b2b2b",
    background: trendingOnly ? "#7c2d12" : "#18181b",
    color: trendingOnly ? "#fdba74" : "#a1a1a1",
    borderRadius: 999,
    padding: "6px 12px",
    fontWeight: 700,
    cursor: "pointer",
  }}
>
  🔥 Trending
</button>
```

Add state: `const [trendingOnly, setTrendingOnly] = useState(false);`

Update `winningFiltered` to include trending filter:
```typescript
.filter((reel) => (!trendingOnly || Boolean(reel.is_trending)))
```

## DO NOT change
- The `performance_ratio` field — it's already VPD-based (effective_vpd ÷ account_median_vpd). Keep displaying it as the "Nx" multiplier.
- The `is_winner` field — it's already VPD-based (ratio >= threshold AND projected >= 100K).
- The "Winners Only" button — keep it.
- The competitor tab — don't touch it in this task.
- Analysis display (AnalysisRows, DifficultyDots) — leave unchanged.
- The IdeaCard layout structure — keep the horizontal card design.

## Test
- `npm run build` must pass
- Load `/traffic-analytics`, select a creator
- Winning Patterns tab should show:
  - Reels sorted by VPD (highest first)
  - VPD badge on each card (blue)
  - Projected views badge (purple)
  - 🔥 TRENDING badge on trending reels
  - Ratio badge still shows Nx multiplier
  - "Trending" filter button works
  - Stats bar shows winner count, trending count, avg VPD
