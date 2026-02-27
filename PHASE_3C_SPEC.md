# Phase 3C: Alert Config Panel (0.5h)

## Deliverables
- `src/app/dashboard/settings/alerts/page.tsx` — Admin config form
- `src/app/api/settings/alerts/route.ts` — GET/PUT alert thresholds
- Convex function to read/update alert settings in `AlertConfig` table

## Components
1. **Page** — Server component wrapping client form
2. **Form** — Client component with:
   - Response Time thresholds (warning/critical in seconds)
   - VIP Queue Backup thresholds (count, minutes)
   - Queue Overload threshold (pending per chatter)
   - Toggle switches for enable/disable per rule type
   - Save button

## API Contract
```
GET /api/settings/alerts → { config: AlertConfig, rules: AlertRule[] }
PUT /api/settings/alerts → { updated: true, config: AlertConfig }
```

## Schema (Convex)
```typescript
export const alertConfig = defineTable({
  vipQueueThreshold: v.number(),
  vipQueueMinutes: v.number(),
  responseTimeWarning: v.number(),
  responseTimeCritical: v.number(),
  queueOverloadThreshold: v.number(),
  enabledRules: v.array(v.string()),
  updatedAt: v.number(),
  updatedBy: v.string(),
})
```

## Auth
- Server-side role check (supervisor/admin only)
- Returns 403 if not authorized

## Testing
- Load form, verify current thresholds display
- Modify value, save, refresh → verify persists
- TypeScript check: 0 errors
