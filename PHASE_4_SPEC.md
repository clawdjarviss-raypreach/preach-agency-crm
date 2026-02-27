# Phase 4: Queue Insights Dashboard (4h)

## Goal
Provide deep-dive analytics on queue performance, chatter lifetime value (LTV), seasonality patterns, and chatter segmentation. Self-serve analytics for supervisors/admins.

## Key Sections

### 1. Chatter LTV Projection (1.5h)
- **Metric:** Projected 90-day revenue per chatter based on:
  - Historical response rate
  - Average message rate
  - Average tip/subscription value
  - Churn probability
- **Component:** `LTVProjection.tsx` — chart + table
- **Data:** `GET /api/insights/ltv-projection` (computes per-chatter projections)

### 2. Seasonality Patterns (1.5h)
- **Heatmap:** Peak activity by:
  - Day of week (Mon–Sun)
  - Hour of day (00–23)
  - Combined: day × hour matrix showing avg message count
- **Component:** `SeasonalityHeatmap.tsx` — colored grid
- **Data:** `GET /api/insights/seasonality` (aggregates 90-day history)

### 3. Chatter Segmentation Dashboard (1h)
- **Segments:** VIP (top 10% spenders), Whale (50–90%), Core (10–50%), Casual (<10%)
- **Metrics per segment:**
  - Count of chatters
  - Avg LTV projection
  - Avg response time
  - Churn rate (30-day)
- **Component:** `SegmentationDashboard.tsx` — cards + mini charts
- **Data:** `GET /api/insights/segmentation`

## Schema Changes (Convex)

```typescript
// New table: ChatterInsights (cached computed data)
chatterInsights = defineTable({
  chatterId: v.id('chatters'),
  ltv90d: v.number(),        // Projected 90-day revenue
  segment: v.union(
    v.literal('vip'),
    v.literal('whale'),
    v.literal('core'),
    v.literal('casual')
  ),
  churnRisk: v.number(),      // 0–1 probability of churn in 30d
  updatedAt: v.number(),
})
```

## API Endpoints

| Route | Method | Response |
|-------|--------|----------|
| `/api/insights/ltv-projection` | GET | `Array<{ chatterId, name, ltv90d, confidence }>` |
| `/api/insights/seasonality` | GET | `Array<{ dayOfWeek, hour, avgMessages, peakFlag }>` |
| `/api/insights/segmentation` | GET | `Array<{ segment, count, avgLTV, avgResponseTime, churnRate }>` |

## Database Queries
- **LTV:** Join chatters + messageHistory, aggregate response rate + tip totals, apply weighting model
- **Seasonality:** Group messageHistory by created_at day/hour, average across all days in window
- **Segmentation:** Rank chatters by LTV, assign bins

## Performance Notes
- Cache ChatterInsights hourly (cron: `insights:compute`)
- Seasonality query spans 90 days — index on messageHistory.created_at
- LTV uses historical confidence scores (>50 messages = high confidence)

## Files to Create
- `convex/crm/insights.ts` — Convex functions
- `app/api/insights/ltv-projection/route.ts`
- `app/api/insights/seasonality/route.ts`
- `app/api/insights/segmentation/route.ts`
- `app/(crm)/insights/page.tsx` — Main dashboard layout
- `components/LTVProjection.tsx`
- `components/SeasonalityHeatmap.tsx`
- `components/SegmentationDashboard.tsx`
- `lib/insights-engine.ts` — Compute logic

## Testing
- Load `/dashboard/insights` → all 3 sections render
- Verify LTV projections change when chatter message history updates
- Check heatmap shows correct peaks (evenings for chat)
- Segment counts sum to total chatters

## Acceptance Criteria
- [ ] All endpoints respond with correct data structure
- [ ] Heatmaps render without errors
- [ ] LTV projections within reasonable bounds (±20% of historical avg)
- [ ] npx tsc --noEmit → 0 errors
- [ ] npm run build → clean
