# Tracking Link Stats & Cohort ARPS Integration

## Overview
Integrate OFAPI tracking link stats (daily clicks/subs/revenue/spenders) and cohort ARPS (revenue-per-subscriber at 48h/7d/14d/21d/30d/all-time) into the existing traffic dashboard tracking links tab.

## 1. Database Changes

### New columns on `crm_of_tracking_links`
```sql
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS revenue numeric DEFAULT 0;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS spenders integer DEFAULT 0;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS arps_48h numeric;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS arps_7d numeric;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS arps_14d numeric;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS arps_30d numeric;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS arps_all_time numeric;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS cohort_subs_count integer;
ALTER TABLE crm_of_tracking_links ADD COLUMN IF NOT EXISTS cohort_data_from timestamptz;
```

### New table: `crm_of_tracking_link_daily_stats`
```sql
CREATE TABLE IF NOT EXISTS crm_of_tracking_link_daily_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_link_id uuid REFERENCES crm_of_tracking_links(id) ON DELETE CASCADE,
  link_id text NOT NULL,
  account_id text NOT NULL,
  date date NOT NULL,
  clicks integer DEFAULT 0,
  subs integer DEFAULT 0,
  revenue numeric DEFAULT 0,
  spenders integer DEFAULT 0,
  UNIQUE(link_id, date)
);

CREATE INDEX IF NOT EXISTS idx_tl_daily_link_date ON crm_of_tracking_link_daily_stats(link_id, date);
CREATE INDEX IF NOT EXISTS idx_tl_daily_tracking_link_id ON crm_of_tracking_link_daily_stats(tracking_link_id);
```

## 2. Edge Function: Add to `of-sync/index.ts`

### New function: `syncTrackingLinkStats(accountId: string)`
Called after existing `syncTrackingLinks()`.

For each tracking link belonging to `accountId`:
1. **GET** `/api/{accountId}/tracking-links/{link_id}/stats?date_start={30_days_ago}&date_end={today}` 
   - Upsert daily_metrics rows into `crm_of_tracking_link_daily_stats`
   - Update summary fields on `crm_of_tracking_links` (clicks, subscribers, revenue, spenders from summary)
2. **GET** `/api/{accountId}/tracking-links/{link_id}/cohort-arps?revenue_basis=net`
   - Update ARPS columns on `crm_of_tracking_links` (arps_48h, arps_7d, arps_14d, arps_30d, arps_all_time, cohort_subs_count, cohort_data_from)

**Cost**: 2 credits per link (1 stats + 1 ARPS). 67 links = 134 credits per sync.

### Rate limiting
- Add 200ms delay between requests (well within 5000/min limit)
- Process links sequentially per account

### Registration
- Add `tracking_link_stats` as a new job type in the `Deno.serve` handler:
  ```
  if (job === 'tracking_link_stats') {
    for (const row of accounts) {
      results.push({ accountId: row.account_id, ...(await syncTrackingLinkStats(row.account_id)) });
    }
  }
  ```

### Cron
- Add pg_cron job: daily at 05:00 UTC (after 4AM reconciliation):
  ```sql
  SELECT cron.schedule('crm-of-tracking-link-stats', '0 5 * * *', $$
    SELECT net.http_post(
      url := 'https://hufcbxodgxinbvpqfaaw.supabase.co/functions/v1/of-sync',
      headers := jsonb_build_object('Authorization', 'Bearer SERVICE_ROLE_KEY', 'Content-Type', 'application/json'),
      body := '{"job": "tracking_link_stats"}'
    );
  $$);
  ```

## 3. Frontend: Update Traffic Dashboard Tracking Links Tab

### File: `app/(crm)/manager-dashboard/page.tsx`

### Current display (3 columns):
| Name | Clicks | Subs | Conv% |

### New display (expanded table):
| Name | Clicks | Subs | Revenue (net) | Conv% | Spenders | ARPS 7d | ARPS 30d | ARPS All |

### Changes:
1. Update the Supabase query to include new columns:
   ```ts
   .select("id,name,url,clicks,subscribers,conversion_rate,revenue,spenders,arps_7d,arps_30d,arps_all_time,last_synced_at,creator_id,link_id")
   ```

2. Add new table columns with the data:
   - **Revenue**: formatted as `$X,XXX.XX` in green
   - **Spenders**: integer count  
   - **ARPS 7d/30d/All**: formatted as `$XX.XX`
     - Color code: green if > $15, amber if $8-15, red if < $8

3. Add "Details" expand row (click to expand):
   - Shows last 14 days of daily stats as a mini sparkline or small table:
     ```
     Date | Clicks | Subs | Revenue | Spenders
     ```
   - Query from `crm_of_tracking_link_daily_stats` for that link

4. Sort options: allow sorting by Revenue, ARPS All, Clicks, Subs (default: Revenue desc)

5. Add a "Sync Stats" button (admin only) that triggers the tracking_link_stats job manually

### Styling
- Follow existing dark theme from the tracking links table
- ARPS cells: use colored badges (green/amber/red based on thresholds)
- Revenue column: bold, green text

## 4. API Response Shapes (for reference)

### Stats endpoint response:
```json
{
  "data": {
    "summary": {
      "clicks_total": 4293,
      "subs_total": 70,
      "revenue_total": 1143.74,
      "spenders_total": 69
    },
    "daily_metrics": [
      { "timestamp": "2026-03-01", "clicks": 60, "subs": 1, "revenue": 178.37, "spenders": 1 }
    ]
  }
}
```

### Cohort ARPS response:
```json
{
  "data": {
    "subscribers_count": 69,
    "revenue_48h_total": 968.59, "arps_48h": 14.04,
    "revenue_7d_total": 1040.56, "arps_7d": 15.08,
    "revenue_14d_total": 1072.54, "arps_14d": 15.54,
    "revenue_30d_total": 1088.53, "arps_30d": 15.78,
    "revenue_all_time_total": 1263.73, "arps_all_time": 18.31,
    "source_subscribers_total": 70,
    "coverage_percent": 0.9857
  }
}
```

## 5. Files to modify
1. `supabase/functions/of-sync/index.ts` — add `syncTrackingLinkStats()` function + job handler
2. `app/(crm)/manager-dashboard/page.tsx` — expand tracking links table with new columns + expandable detail rows
3. New migration SQL (apply via Management API, no migration file needed)

## 6. OF API Details
- Base URL: `https://app.onlyfansapi.com`
- Auth: `Authorization: Bearer {OF_API_KEY}` (key is in Edge Function env as `OF_API_KEY`)
- Stats: `GET /api/{account}/tracking-links/{link_id}/stats?date_start=YYYY-MM-DDTHH:mm:ssZ&date_end=YYYY-MM-DDTHH:mm:ssZ`
- ARPS: `GET /api/{account}/tracking-links/{link_id}/cohort-arps?revenue_basis=net`

## 7. Existing data
- 67 tracking links across 6 accounts (Leni 29, Abby 24, Zoe 10, Ashley 2, Lea 1, Maddy 1)
- `crm_of_tracking_links` already has: id, account_id, creator_id, link_id, name, url, clicks, subscribers, conversion_rate
- `link_id` = the OFAPI numeric tracking link ID (e.g., "2487217")
