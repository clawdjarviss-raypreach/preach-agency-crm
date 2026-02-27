# Preach CRM — OnlyFans API Integration & OM Excel Upload Spec
**Date:** February 21, 2026 | **Planner:** @planner  
**Task:** jx71qemq5s2361w3qv8n4zrtd981hk58 | **Status:** IN PROGRESS  
**Priority:** URGENT

---

## Overview

**Goal:** Design infrastructure to ingest OnlyFans (OF) & OnlyMonster (OM) data, powering real-time dashboards and analytics.

**Scope:**
1. **OnlyFans API Integration** — Direct API calls (messages, earnings, fans, transactions, webhooks)
2. **OnlyMonster Excel Upload Parser** — Parse OM exports, validate, store in Convex
3. **Live Sales Feed** — Real-time transaction streaming (OnlyFans + OM)
4. **Chatter Performance Dashboard** — Aggregated metrics per chatter, updated on import
5. **Message Dashboard** — Message-level analytics with shift-based response time attribution

**Context:**
- OnlyFans API docs: https://docs.onlyfansapi.com (third-party reverse-engineered API)
- OnlyMonster API: Already integrated (sales sync every 20 min)
- Current schema: `crm_om_*` tables ready
- No API keys yet (will be provided by Jarvis; build infrastructure first)

---

## Part 1: Data Sources & Ingestion Flows

### 1.1 Data Source 1: OnlyFans API (Third-Party)

**Endpoint:** https://onlyfansapi.com/api

**Available Methods:**
- `GET /accounts` — List creator accounts associated with API key
- `GET /accounts/{accountId}/posts` — Fetch posts (for preview/teaser content)
- `GET /accounts/{accountId}/messages` — Fetch DMs (paginated)
- `GET /accounts/{accountId}/earnings` — Monthly earnings breakdown
- `GET /accounts/{accountId}/fans` — Subscriber list with metadata
- `GET /accounts/{accountId}/transactions` — Detailed transaction log
- `POST /webhooks` — Register webhook for real-time updates (messages, tips, PPV sales)

**Schema Mapping (OF → Preach):**

| OnlyFans Field | Preach Table | Notes |
|---|---|---|
| account.username | crm_creators.name | Creator handle |
| account.id | crm_creators.onlyFansId | Platform ID |
| message.id | crm_messages.messageId | Message ID |
| message.text | crm_messages.content | Message body |
| message.timestamp | crm_messages.createdAt | When sent |
| message.userId | crm_messages.fanId | Fan identifier |
| earnings.amount | crm_om_transactions.amount | Revenue $$ |
| earnings.type | crm_om_transactions.type | PPV / Tip / Subscription |
| fans.userId | crm_fans.fanId | Unique fan ID |
| fans.username | crm_fans.username | Fan handle |
| fans.joinDate | crm_fans.firstPurchaseAt | When subscribed |

**Rate Limits & Pagination:**
- 1000 requests/hour per API key
- Messages paginated: 50 per request, use `offset` + `limit`
- Transactions paginated: 100 per request
- **Strategy:** Batch sync daily (not real-time); cursor-based pagination

---

### 1.2 Data Source 2: OnlyMonster Excel Upload

**File Format (Current):**
- **Transactions file:** 426 rows × 9 columns (Date, Creator, Net, Type, Assignee, Assigned by, Status, Fan, Chat)
- **Dashboard file:** 10 rows × 26 columns (Per-chatter summary: Sales, PPV, Tips, Response Time, AI%, Templates, etc.)

**Upload Flow:**
1. Admin logs in to Preach CRM
2. Uploads Excel file (via UI file picker)
3. Parser validates schema (checks header row, column count)
4. Parses both sheets into structured JSON
5. Stores import record + raw data in `crm_om_imports` table
6. Triggers aggregation pipeline (compute `crm_fans`, `crm_chatter_performance`, etc.)

**Validation Rules:**
- Transaction file must have columns: Date, Creator, Net, Type, Assignee, Status, Fan, Chat
- Dashboard file must have columns: Chatter, Total Sales, PPV%, Tips%, Response Time, AI%, Templates, PPV Sent, PPV Sold, PPV Open Rate, Avg PPV Price, Impact%, Messages Sent, etc.
- Date format: "DD Mon, YYYY HH:MM AM/PM" (e.g., "20 Feb, 2026 06:35 PM")
- Creator field: "handle (id: XXXXX)"
- Fan field: "username (id: XXXXXXXXX)"
- Net value: Float (allow negative for refunds)
- Status: Always "Complete" (enum validation)

**Parser Pseudocode:**
```typescript
function parseOnlyMonsterExport(buffer: ArrayBuffer) {
  const workbook = readExcelFile(buffer);
  const transactionsSheet = workbook.getSheet("Transactions");
  const dashboardSheet = workbook.getSheet("Dashboard");
  
  // Validate headers
  assertHeaders(transactionsSheet, ["Date", "Creator", "Net", "Type", "Assignee", "Status", "Fan", "Chat"]);
  assertHeaders(dashboardSheet, ["Chatter", "Total Sales", "PPV%", ...]);
  
  // Parse transactions
  const transactions = [];
  for (let i = 1; i < transactionsSheet.rowCount; i++) {
    const row = transactionsSheet.getRow(i);
    const creatorMatch = row["Creator"].match(/(.+?) \(id: (\d+)\)/);
    const fanMatch = row["Fan"].match(/(.+?) \(id: (\d+)\)/);
    
    transactions.push({
      date: parseDateTime(row["Date"]),
      creatorHandle: creatorMatch[1],
      creatorId: creatorMatch[2],
      net: parseFloat(row["Net"]),
      type: row["Type"],  // PPV or Tip
      assignee: row["Assignee"] === "-" ? null : row["Assignee"],
      status: row["Status"],
      fanUsername: fanMatch[1],
      fanId: fanMatch[2],
      chatUrl: row["Chat"],
    });
  }
  
  // Parse dashboard
  const dashboardMetrics = [];
  for (let i = 1; i < dashboardSheet.rowCount; i++) {
    const row = dashboardSheet.getRow(i);
    dashboardMetrics.push({
      chatter: row["Chatter"],
      totalSales: parseFloat(row["Total Sales"]),
      ppvPercent: parseFloat(row["PPV%"]),
      tipsPercent: parseFloat(row["Tips%"]),
      avgResponseTimeMin: parseFloat(row["Response Time (min)"]),
      aiUsagePercent: parseFloat(row["AI%"]),
      templatesUsed: parseInt(row["Templates"]),
      ppvSent: parseInt(row["PPV Sent"]),
      ppvSold: parseInt(row["PPV Sold"]),
      ppvOpenRate: parseFloat(row["PPV Open Rate"]),
      avgPpvPrice: parseFloat(row["Avg PPV Price"]),
      messagesSent: parseInt(row["Messages Sent"]),
      // ... other fields
    });
  }
  
  return { transactions, dashboardMetrics };
}
```

---

### 1.3 Data Source 3: OnlyMonster API (Live Sync)

**Currently Integrated (per description: "OM API already integrated, sales every 20min").**

**Assumption:** A cron job already exists that calls OM API every 20 minutes and updates `crm_om_sync_state`.

**Our Role:** Keep this running; use its data to populate `crm_om_transactions` and `crm_om_daily_aggregates` tables.

---

## Part 2: Convex Data Model

### 2.1 Import Metadata Table

```typescript
crm_om_imports: defineTable({
  id: v.string(),                       // Unique import ID
  importType: v.enum("excel_upload", "om_api_sync", "ofapi_sync"),
  createdAt: v.number(),
  createdBy: v.optional(v.string()),    // User/agent name
  
  // For Excel uploads
  fileName: v.optional(v.string()),
  uploadedFileSize: v.optional(v.number()),
  
  // Status & Results
  status: v.enum("pending", "processing", "success", "failed"),
  statusMessage: v.optional(v.string()),
  
  // Import metadata
  periodStart: v.string(),              // "2026-02-01"
  periodEnd: v.string(),                // "2026-02-20"
  recordsImported: v.optional(v.number()),
  recordsFailed: v.optional(v.number()),
  
  // Raw data (stored for audit trail, purged after 90 days)
  rawData: v.optional(v.string()),      // JSON string of parsed data
  
  // Aggregation state
  aggregationStatus: v.enum("pending", "completed", "failed"),
  aggregationStartedAt: v.optional(v.number()),
  aggregationCompletedAt: v.optional(v.number()),
})
  .index("by_type_date", ["importType", "createdAt"])
  .index("by_status", ["status"]),
```

### 2.2 OnlyFans Message Table (Enhanced)

```typescript
crm_ofapi_messages: defineTable({
  // Metadata
  messageId: v.string(),                // OnlyFans message ID
  conversationId: v.string(),           // Unique chat thread ID
  
  // Participants
  creatorId: v.string(),                // OnlyFans creator account ID (e.g., abby.smithh)
  fanId: v.string(),                    // Fan's OnlyFans user ID
  
  // Message content
  content: v.string(),
  type: v.enum("text", "media", "ppv_offer", "tip_request"),
  mediaUrls: v.optional(v.array(v.string())),  // Image/video URLs
  
  // Timing
  sentAt: v.number(),                   // UNIX timestamp
  deliveredAt: v.optional(v.number()),
  readAt: v.optional(v.number()),
  
  // Response tracking
  senderRole: v.enum("creator", "fan"),
  responseLatencyMin: v.optional(v.number()),  // Minutes to first creator response
  
  // AI tagging (computed)
  sentiment: v.optional(v.enum("positive", "neutral", "frustrated", "angry")),
  topic: v.optional(v.enum("greeting", "question", "ppv_interest", "tip", "complaint", "other")),
  isAiGenerated: v.optional(v.bool()),
  
  // Analytics
  linkedTransactionId: v.optional(v.id("crm_om_transactions")),  // If this message led to a purchase
  
  // Sync metadata
  importId: v.id("crm_om_imports"),
  syncedAt: v.number(),
})
  .index("by_creator_date", ["creatorId", "sentAt"])
  .index("by_conversation", ["conversationId"])
  .index("by_fan", ["fanId"]),
```

### 2.3 OnlyFans Transaction Table (Enhanced)

```typescript
crm_ofapi_transactions: defineTable({
  transactionId: v.string(),            // OnlyFans transaction ID
  creatorId: v.string(),                // Creator account (abby.smithh)
  fanId: v.string(),                    // Fan's OnlyFans ID
  
  // Transaction details
  amount: v.number(),                   // Net amount received
  currency: v.string(),                 // USD, etc.
  type: v.enum("ppv_message", "subscription", "tip", "custom_content"),
  
  // Timing
  createdAt: v.number(),
  completedAt: v.number(),
  
  // Assignment (Preach CRM specific)
  chatterId: v.optional(v.id("crm_chatters")),  // Who handled this fan?
  isAssigned: v.bool(),
  
  // Metadata
  ppvMediaId: v.optional(v.string()),   // ID of PPV content (if applicable)
  ppvPrice: v.optional(v.number()),
  
  // Analytics
  messageCount: v.optional(v.number()),  // Messages in conversation before purchase
  timeToConversionMin: v.optional(v.number()),  // Minutes from first message to purchase
  
  // Sync
  source: v.enum("ofapi", "om_api", "excel_upload"),
  importId: v.id("crm_om_imports"),
  syncedAt: v.number(),
})
  .index("by_creator_date", ["creatorId", "createdAt"])
  .index("by_fan", ["fanId"])
  .index("by_chatter", ["chatterId"]),
```

### 2.4 Chatter Performance Snapshot (from OF API + OM Dashboard)

```typescript
crm_chatter_ofapi_metrics: defineTable({
  chatterId: v.id("crm_chatters"),
  period: v.string(),                   // "2026-02-21"
  
  // Revenue
  totalRevenue: v.number(),
  ppvRevenue: v.number(),
  tipRevenue: v.number(),
  avgTransactionValue: v.number(),
  
  // PPV Performance (from OM dashboard)
  ppvSent: v.number(),
  ppvSold: v.number(),
  ppvOpenRate: v.number(),              // sold ÷ sent
  avgPpvPrice: v.number(),
  
  // Response Time
  avgResponseTimeMin: v.number(),       // Computed from OF API messages
  medianResponseTimeMin: v.number(),
  p95ResponseTimeMin: v.number(),       // 95th percentile
  
  // Messages & Engagement
  messagesSent: v.number(),
  uniqueFans: v.number(),
  avgMessagesPerFan: v.number(),
  
  // Efficiency
  revPerMessage: v.number(),
  revPerChat: v.number(),
  efficiencyScore: v.number(),          // Composite (0–100)
  
  // AI & Automation
  aiGeneratedMessages: v.number(),
  aiAssistedMessages: v.number(),
  aiAdoptionRate: v.number(),           // (ai + aiAssisted) ÷ total
  
  // Metadata
  importId: v.id("crm_om_imports"),
  computedAt: v.number(),
})
  .index("by_chatter_period", ["chatterId", "period"])
  .index("by_period", ["period"]),
```

---

## Part 3: Ingestion Pipelines

### 3.1 Excel Upload Pipeline

**Trigger:** Admin uploads file via UI

**Steps:**
1. **Validate file** (schema, headers, data types)
2. **Parse Excel** (extract transactions + dashboard)
3. **Create import record** (status: "processing")
4. **Store transactions** → `crm_ofapi_transactions`
5. **Store metrics** → `crm_chatter_ofapi_metrics`
6. **Aggregate** (compute `crm_fans`, update `crm_chatter_performance`)
7. **Update import status** (status: "success" or "failed")

**Convex Mutation:**
```typescript
export const mutation importOnlyMonsterExcel = internalMutation({
  args: { fileBuffer: v.bytes(), fileName: v.string() },
  handler: async (ctx, args) => {
    // 1. Create import record
    const importId = await ctx.db.insert("crm_om_imports", {
      importType: "excel_upload",
      createdAt: Date.now(),
      fileName: args.fileName,
      uploadedFileSize: args.fileBuffer.byteLength,
      status: "processing",
      periodStart: "", // Will be set during parsing
      periodEnd: "",
      aggregationStatus: "pending",
    });
    
    try {
      // 2. Parse Excel
      const { transactions, dashboardMetrics } = parseOnlyMonsterExcel(args.fileBuffer);
      
      // 3. Determine period
      const dates = transactions.map(t => t.date).sort((a, b) => a - b);
      const periodStart = new Date(dates[0]).toISOString().split('T')[0];
      const periodEnd = new Date(dates[dates.length - 1]).toISOString().split('T')[0];
      
      // 4. Store transactions
      let successCount = 0, failCount = 0;
      for (const tx of transactions) {
        try {
          await ctx.db.insert("crm_ofapi_transactions", {
            transactionId: `om_${tx.creatorId}_${tx.fanId}_${tx.date}`,
            creatorId: tx.creatorHandle,
            fanId: tx.fanId,
            amount: tx.net,
            currency: "USD",
            type: tx.type === "PPV" ? "ppv_message" : "tip",
            createdAt: tx.date,
            completedAt: tx.date,
            chatterId: tx.assignee ? (await getChatterIdByName(ctx, tx.assignee)) : null,
            isAssigned: !!tx.assignee,
            source: "excel_upload",
            importId,
            syncedAt: Date.now(),
          });
          successCount++;
        } catch (err) {
          console.error(`Failed to insert transaction: ${err}`);
          failCount++;
        }
      }
      
      // 5. Store metrics
      for (const metric of dashboardMetrics) {
        const chatterId = await getChatterIdByName(ctx, metric.chatter);
        if (chatterId) {
          await ctx.db.insert("crm_chatter_ofapi_metrics", {
            chatterId,
            period: periodEnd,
            totalRevenue: metric.totalSales,
            ppvRevenue: metric.totalSales * (metric.ppvPercent / 100),
            tipRevenue: metric.totalSales * (metric.tipsPercent / 100),
            ppvSent: metric.ppvSent,
            ppvSold: metric.ppvSold,
            ppvOpenRate: metric.ppvOpenRate,
            avgPpvPrice: metric.avgPpvPrice,
            avgResponseTimeMin: metric.avgResponseTimeMin,
            messagesSent: metric.messagesSent,
            aiGeneratedMessages: 0,  // Will be computed from crm_ofapi_messages
            importId,
            computedAt: Date.now(),
          });
        }
      }
      
      // 6. Trigger aggregation (separate mutation/action)
      await ctx.scheduler.runAfter(0, internal.aggregation.computeChatterPerformance, {
        importId,
      });
      
      // 7. Update import status
      await ctx.db.patch(importId, {
        status: "success",
        recordsImported: successCount,
        recordsFailed: failCount,
        periodStart,
        periodEnd,
        aggregationStatus: "pending",
      });
      
    } catch (err) {
      await ctx.db.patch(importId, {
        status: "failed",
        statusMessage: err.message,
      });
      throw err;
    }
  }
});
```

---

### 3.2 OnlyFans API Sync Pipeline (Daily Cron)

**Trigger:** Daily at 02:00 AM UTC (1 hour after OM API sync)

**Steps:**
1. For each creator account:
   - Fetch all messages since last sync (pagination)
   - Fetch all transactions since last sync
   - Store messages → `crm_ofapi_messages`
   - Store transactions → `crm_ofapi_transactions`
2. Compute response times (messages → aggregation)
3. Tag messages with sentiment/topic (AI)
4. Update `crm_chatter_ofapi_metrics`
5. Create import record for audit

**Convex Action:**
```typescript
export const action syncOnlyFansApi = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get API keys from environment (will be set by Jarvis)
    const apiKey = process.env.ONLYFANS_API_KEY;
    if (!apiKey) throw new Error("ONLYFANS_API_KEY not set");
    
    const client = new OnlyFansApiClient(apiKey);
    
    // Create import record
    const importId = await ctx.runMutation(internal.imports.createImport, {
      importType: "ofapi_sync",
      periodStart: new Date().toISOString().split('T')[0],
      periodEnd: new Date().toISOString().split('T')[0],
    });
    
    try {
      // Get all creator accounts
      const accounts = await client.getAccounts();
      
      for (const account of accounts) {
        // Fetch messages
        const messages = await client.getMessages(account.id, {
          limit: 50,
          offset: 0,
          // TODO: Add "since" parameter to fetch only new messages
        });
        
        // Store messages
        for (const msg of messages) {
          await ctx.runMutation(internal.ofapi.storeMessage, {
            messageId: msg.id,
            conversationId: msg.threadId,
            creatorId: account.username,
            fanId: msg.fromUserId,
            content: msg.text,
            type: msg.mediaUrl ? "media" : "text",
            sentAt: new Date(msg.createdAt).getTime(),
            senderRole: msg.fromUserId === account.id ? "creator" : "fan",
            importId,
          });
        }
        
        // Fetch transactions
        const transactions = await client.getTransactions(account.id, {
          limit: 100,
          offset: 0,
        });
        
        for (const tx of transactions) {
          await ctx.runMutation(internal.ofapi.storeTransaction, {
            transactionId: tx.id,
            creatorId: account.username,
            fanId: tx.fanId,
            amount: tx.netAmount,
            type: tx.type,  // ppv_message, subscription, tip, etc.
            createdAt: new Date(tx.createdAt).getTime(),
            completedAt: new Date(tx.completedAt).getTime(),
            importId,
          });
        }
      }
      
      // Trigger aggregation
      await ctx.scheduler.runAfter(0, internal.aggregation.computeMetricsFromOfapi, {
        importId,
      });
      
      // Mark import as success
      await ctx.runMutation(internal.imports.updateImport, {
        importId,
        status: "success",
        aggregationStatus: "pending",
      });
      
    } catch (err) {
      await ctx.runMutation(internal.imports.updateImport, {
        importId,
        status: "failed",
        statusMessage: err.message,
      });
      throw err;
    }
  }
});

// Schedule this action to run daily at 02:00 UTC
crons.interval("ofapi_daily_sync", {
  intervalMs: 24 * 60 * 60 * 1000,  // 24 hours
  stopAt: undefined,
  handler: internal.actions.syncOnlyFansApi,
});
```

---

## Part 4: Dashboards

### 4.1 Live Sales Feed Dashboard

**Purpose:** Real-time visibility into incoming revenue.

**Data Source:** `crm_ofapi_transactions` (updated on import)

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  LIVE SALES FEED — Last 24 Hours                │
├─────────────────────────────────────────────────┤
│                                                 │
│  Transaction 1                  14:32  $42.00  │
│  Fan: pfcvitalis (ID: 541581)                  │
│  Type: PPV Message               Chatter: Bernard
│  ──────────────────────────────────────────────│
│                                                 │
│  Transaction 2                  14:28  $15.00  │
│  Fan: jr13883 (ID: 123456)                     │
│  Type: Tip                       Chatter: Jyy
│  ──────────────────────────────────────────────│
│                                                 │
│  [Show more...]  Total: $587 (12 transactions) │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Metrics:**
- Total revenue (24h, 7d, 30d)
- Transaction count
- Avg transaction value
- Most active chatter (today)
- Top fan (today)

**Update Frequency:** Real-time (via Convex query subscription)

---

### 4.2 Chatter Performance Dashboard (OF API + OM Data)

**Purpose:** Unified view of chatter performance from both platforms.

**Data Source:** `crm_chatter_ofapi_metrics` + `crm_om_chatter_metrics`

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│  CHATTER PERFORMANCE — Period: Feb 1–21, 2026                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Rank  Chatter    Revenue   Eff. Score   Response Time  AI%   │
│  ────────────────────────────────────────────────────────────  │
│   1    Bernard    $3,140      78/100        116 min     0.1%  │
│   2    Jyy        $2,701      72/100        142 min     0.04% │
│   3    Tanya      $2,610      66/100        117 min     0.7%  │
│   4    Rain       $686        76/100        125 min     0.4%  │
│   5    Josh       $91         19/100        251 min     0%    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  DETAILS (Click to expand)                                      │
│                                                                 │
│  Bernard:                                                       │
│    • Revenue breakdown: PPV $3,046 (97%) | Tips $94 (3%)      │
│    • PPV performance: 66 sold of 95 sent (69.5% rate)         │
│    • Avg PPV price: $50.83                                     │
│    • Response time distribution: 50% < 80 min, 95% < 200 min │
│    • Message volume: 2,451 messages, 156 conversations        │
│    • Fan segments: 12 whales, 34 VIPs, 110 core              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Export:** Download chatter report (PDF, CSV)

---

### 4.3 Message Dashboard with Shift Attribution

**Purpose:** Understand which shifts generate the most revenue; attribute messages to shift-working chatters.

**Data Source:** `crm_ofapi_messages` + `crm_shifts` (existing)

**Schema Extension:**
```typescript
crm_ofapi_messages: defineTable({
  // ... existing fields
  
  // Shift attribution (computed on ingest)
  shiftId: v.optional(v.id("crm_shifts")),
  chatterId: v.optional(v.id("crm_chatters")),
  linkedTransactionId: v.optional(v.id("crm_ofapi_transactions")),
})
```

**Calculation Logic:**
1. When a message is ingested, check: "Which shift was active when this message was received?"
2. Look up shift record with overlapping time window
3. Get chatter assigned to that shift
4. Link message to chatter + shift

```typescript
function attributeMessageToShift(ctx, message) {
  const shifts = ctx.db.query("crm_shifts")
    .withIndex("by_date_time", (q) =>
      q.eq("date", message.sentDate)
        .gte("startTime", message.sentTime - 5 * 60 * 1000)  // 5 min buffer
        .lte("endTime", message.sentTime + 5 * 60 * 1000)
    )
    .collect();
  
  if (shifts.length === 0) {
    console.warn(`No shift found for message ${message.messageId}`);
    return null;  // Unattributed
  }
  
  // Pick the most recent shift (in case of overlap)
  const shift = shifts.sort((a, b) => b.startTime - a.startTime)[0];
  
  return {
    shiftId: shift._id,
    chatterId: shift.chatterId,
  };
}
```

**Dashboard Layout:**
```
┌──────────────────────────────────────────────────────────────┐
│  MESSAGE DASHBOARD — Shift-Based Attribution                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  SHIFT PERFORMANCE (Feb 1–21, 2026)                         │
│  ────────────────────────────────────────────────────────── │
│                                                              │
│  Shift            Chatter      Revenue   Messages   Conv.%  │
│  ──────────────────────────────────────────────────────────  │
│  Morning (6-12)   Tanya        $834      356        18%     │
│  Afternoon (12-6) Bernard      $1,542    612        25%     │
│  Evening (6-12)   Jyy          $987      434        23%     │
│  Night (12-6)     Rain         $456      189        14%     │
│  Unattributed     —            $191      72         —       │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  SHIFT EFFICIENCY (Revenue per Message)                     │
│  ────────────────────────────────────────────────────────── │
│  Afternoon (12-6): $2.52/msg  ⭐⭐⭐ (Top)                    │
│  Evening (6-12):   $2.27/msg  ⭐⭐⭐                          │
│  Morning (6-12):   $2.34/msg  ⭐⭐⭐                          │
│  Night (12-6):     $2.41/msg  ⭐⭐⭐                          │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  RECOMMENDED ACTION:                                         │
│  Afternoon shift (Bernard, Jyy) generates 56% of revenue    │
│  with only 48% of messages. Increase afternoon coverage.    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Analytics:**
- Revenue per shift
- Messages per shift
- Conversion % by shift
- Chatter efficiency by shift
- Peak hours (heatmap)
- Recommendations for scheduling

---

## Part 5: Error Handling & Data Reconciliation

### 5.1 Duplicate Detection

**Problem:** Messages/transactions could be imported multiple times (e.g., if cron job runs twice).

**Solution:** Use unique constraint on `(transactionId, importId)` and `(messageId, importId)`.

```typescript
crm_ofapi_transactions: defineTable({
  // ...
}).index("by_unique_transaction", ["transactionId", "importId"]);  // Unique pair
```

### 5.2 Data Mismatch Resolution

**Problem:** OM Excel reports $14K revenue, but OnlyFans API reports $14.2K (due to rounding, timing, refunds).

**Solution:** 
- Log all imports with detailed reconciliation report
- Alert if variance > 5% with detailed diff
- Allow manual override (set "canonical" data source)

```typescript
export const query reconciliationReport = query({
  args: { importId: v.id("crm_om_imports") },
  handler: async (ctx, args) => {
    const omData = await ctx.db.query("crm_om_transactions")
      .filter((q) => q.eq(q.field("importId"), args.importId))
      .collect();
    
    const ofData = await ctx.db.query("crm_ofapi_transactions")
      .filter((q) => q.eq(q.field("importId"), args.importId))
      .collect();
    
    const omTotal = omData.reduce((sum, tx) => sum + tx.amount, 0);
    const ofTotal = ofData.reduce((sum, tx) => sum + tx.amount, 0);
    
    const variance = Math.abs(omTotal - ofTotal) / Math.max(omTotal, ofTotal);
    
    return {
      omTotal,
      ofTotal,
      variance: (variance * 100).toFixed(2) + "%",
      alert: variance > 0.05,  // 5% threshold
      reconciled: variance < 0.01,
    };
  }
});
```

---

## Part 6: Implementation Roadmap

### Week 1: Schema & OM Excel Parser
- [ ] Create `crm_om_imports`, `crm_ofapi_messages`, `crm_ofapi_transactions`, `crm_chatter_ofapi_metrics` tables
- [ ] Write Excel parser + validation
- [ ] Build upload UI (file picker, progress indicator)
- [ ] Test with sample OM export

### Week 2: Live Sales Feed Dashboard
- [ ] Implement real-time feed (Convex query subscription)
- [ ] Add filtering (by creator, chatter, fan type)
- [ ] Metrics: 24h/7d/30d totals, avg transaction
- [ ] Export to CSV

### Week 3: OnlyFans API Integration (Mock)
- [ ] Set up API client (onlyfansapi.com library or custom)
- [ ] Implement message sync (pagination, error handling)
- [ ] Implement transaction sync
- [ ] Build reconciliation logic

### Week 4: Chatter Performance Dashboard + Message Dashboard
- [ ] Aggregate `crm_ofapi_messages` into conversation analytics
- [ ] Compute response times (fan → creator latency)
- [ ] Build chatter leaderboard UI
- [ ] Implement shift attribution for messages
- [ ] Build shift performance dashboard

### Week 5: Testing & Hardening
- [ ] Load test with full OM data (426 transactions)
- [ ] Test error scenarios (bad uploads, API failures)
- [ ] Reconciliation reporting
- [ ] Data retention policy (90-day purge for raw data)

### Week 6: Handoff to Coder
- [ ] Documentation complete
- [ ] UI mockups + flows
- [ ] All queries/mutations specified
- [ ] Test data prepared

---

## Part 7: Success Metrics

| Metric | Target |
|--------|--------|
| **Data Freshness** | Daily (excel), hourly (OM API), real-time dashboards |
| **Upload Success Rate** | 99% (valid files parse without error) |
| **Data Reconciliation Variance** | <1% between OM + OF data |
| **Dashboard Load Time** | <2 seconds (Convex query cached) |
| **Message Attribution Accuracy** | 95% (shift assignment validated manually) |
| **API Rate Limit Usage** | <500 calls/day per creator (1000/hour limit) |

---

## Conclusion

This spec provides **complete architecture for OnlyFans + OnlyMonster data ingestion**, powering the 3 core v2 modules (Revenue Intelligence Dashboard, AI-Assisted Message Handling, Message Analytics).

**Key Design Decisions:**
- **Daily (not real-time) sync** for cost/simplicity; scales to real-time later
- **Excel upload + API sync** = flexible, user-friendly, + reliable
- **Shift attribution** = revenue optimization insights
- **Detailed reconciliation** = data trust
- **Tiered storage** (raw data purged; aggregates forever) = compliance + cost

**Next Step:** @coder implementation. Once OF API keys provided, activate live sync.

---

## Deliverables Checklist

- [x] OnlyFans API mapping (Part 1)
- [x] OnlyMonster Excel parser spec (Part 1)
- [x] Convex schema tables (Part 2)
- [x] Ingestion pipelines (Part 3)
- [x] Dashboard designs (Part 4)
- [x] Error handling & reconciliation (Part 5)
- [x] Implementation roadmap (Part 6)
- [x] Success metrics (Part 7)

**Status:** ✅ SPEC COMPLETE — Ready for implementation
