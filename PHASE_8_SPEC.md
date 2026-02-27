# Phase 8: Real-Time Chat Queue (16–24h)

**Status**: Ready for Implementation  
**Priority**: P1  
**Dependencies**: Phase 6 (Automation Rules) ✅  
**ROI Score**: 8/10  

---

## Overview

Real-time message queue system providing live visibility into fan conversations across all creators. Enables supervisors to monitor response times, identify overloaded chatters, and intervene before SLA breaches.

---

## Strategic Decision: Which Approach?

### Option A: OnlyFans API Integration

| Pros | Cons |
|------|------|
| Real data, no manual entry | OF API access unclear/risky |
| Accurate timestamps | Potential ToS compliance issues |
| Automatic sync | Rate limiting, error handling complexity |
| Fan metadata included | Requires reverse-engineering or unofficial API |

**Estimated Scope**: 24–32h (including integration, error handling, rate limits)

### Option B: Manual Queue Entry

| Pros | Cons |
|------|------|
| Works today, no external deps | Requires chatter discipline |
| Full control over data model | Potential data entry lag (30s–2min) |
| No compliance risk | Won't capture 100% of messages |
| Simpler architecture | Extra clicks for chatters |

**Estimated Scope**: 16–20h

### ✅ Recommendation: Start with Option B

**Rationale**:
1. **No blockers** — Can ship immediately without waiting for API access
2. **Validates the concept** — Proves value before investing in integration
3. **Upgrade path clear** — Schema designed to support API sync later
4. **Good enough for ops** — Even 80% coverage provides actionable visibility

**Migration Strategy**: When OF API access is confirmed:
- Add `crm_of_sync_config` table for API credentials
- Create background sync job that populates same `crm_message_queue` table
- Deprecate manual entry (or keep as fallback)
- Zero UI changes required

---

## Sub-Phase Breakdown

| Phase | Focus | Hours | Cumulative |
|-------|-------|-------|------------|
| 8A | Queue Schema & Core Functions | 4h | 4h |
| 8B | Chatter Message Intake | 4h | 8h |
| 8C | Supervisor Queue Dashboard | 5h | 13h |
| 8D | Real-Time Updates & Alerts | 4h | 17h |
| 8E | VIP Routing & Escalation | 3h | 20h |

**Total**: 17–20 hours (within 16–24h estimate)

---

## Phase 8A: Queue Schema & Core Functions (4h)

### Goal
Define queue data model and CRUD operations for message tracking.

### Schema Additions (`convex/schema.ts`)

```typescript
// Message Queue - Core tracking table
crm_message_queue: defineTable({
  // Relationships
  creatorId: v.id('crm_creators'),
  chatterId: v.id('crm_chatters'),        // Assigned chatter (can be reassigned)
  originalChatterId: v.id('crm_chatters'), // Who first received it
  
  // Fan Info
  fanUsername: v.string(),
  fanDisplayName: v.optional(v.string()),
  fanSegment: v.union(
    v.literal('vip'),
    v.literal('whale'),
    v.literal('core'),
    v.literal('casual'),
    v.literal('new'),
    v.literal('unknown')
  ),
  fanSpendTier: v.optional(v.number()),   // Monthly spend estimate (if known)
  
  // Message Context
  messagePreview: v.optional(v.string()), // First 100 chars (optional, for context)
  messageType: v.union(
    v.literal('dm'),
    v.literal('tip'),
    v.literal('ppv_unlock'),
    v.literal('subscription'),
    v.literal('renewal'),
    v.literal('custom_request'),
    v.literal('other')
  ),
  priority: v.union(
    v.literal('critical'),  // VIP/Whale needing immediate attention
    v.literal('high'),      // Paying fan, time-sensitive
    v.literal('normal'),    // Standard message
    v.literal('low')        // Casual, can wait
  ),
  
  // Status Workflow
  status: v.union(
    v.literal('pending'),     // Waiting for response
    v.literal('in_progress'), // Chatter is actively working on it
    v.literal('responded'),   // Response sent
    v.literal('escalated'),   // Escalated to supervisor
    v.literal('reassigned'),  // Moved to different chatter
    v.literal('expired'),     // SLA breached, auto-closed
    v.literal('spam')         // Marked as spam/irrelevant
  ),
  
  // Timestamps
  receivedAt: v.number(),     // When message came in (Unix ms)
  firstViewedAt: v.optional(v.number()),   // When chatter opened it
  respondedAt: v.optional(v.number()),     // When response sent
  
  // Calculated Metrics (updated on response)
  waitTimeSec: v.optional(v.number()),     // receivedAt → respondedAt
  handleTimeSec: v.optional(v.number()),   // firstViewedAt → respondedAt
  
  // Escalation
  escalatedAt: v.optional(v.number()),
  escalatedTo: v.optional(v.id('crm_chatters')),
  escalationReason: v.optional(v.string()),
  
  // Metadata
  source: v.union(
    v.literal('manual'),      // Chatter logged it
    v.literal('api'),         // OF API sync (future)
    v.literal('import')       // Bulk import
  ),
  notes: v.optional(v.string()),
  tags: v.optional(v.array(v.string())),
})
  .index('by_status', ['status'])
  .index('by_chatter', ['chatterId', 'status'])
  .index('by_creator', ['creatorId', 'status'])
  .index('by_priority', ['priority', 'status'])
  .index('by_received', ['receivedAt'])
  .index('by_fan_segment', ['fanSegment', 'status'])
  .index('by_escalated', ['escalatedTo', 'status']),

// Queue SLA Configuration per Creator
crm_queue_sla_config: defineTable({
  creatorId: v.id('crm_creators'),
  
  // SLA Thresholds (seconds)
  vipMaxWait: v.number(),       // Default: 300 (5 min)
  whaleMaxWait: v.number(),     // Default: 600 (10 min)
  coreMaxWait: v.number(),      // Default: 1800 (30 min)
  casualMaxWait: v.number(),    // Default: 3600 (1 hour)
  
  // Auto-escalation
  autoEscalateEnabled: v.boolean(),
  escalateToSupervisor: v.optional(v.id('crm_chatters')),
  
  // Working hours (optional, SLA only counts during these)
  workingHoursEnabled: v.boolean(),
  workingHoursStart: v.optional(v.number()), // Hour 0-23
  workingHoursEnd: v.optional(v.number()),
  timezone: v.optional(v.string()),          // e.g., "America/New_York"
  
  updatedAt: v.number(),
  updatedBy: v.id('crm_chatters'),
})
  .index('by_creator', ['creatorId']),

// Queue Statistics Snapshots (for historical tracking)
crm_queue_stats: defineTable({
  creatorId: v.optional(v.id('crm_creators')), // null = global stats
  chatterId: v.optional(v.id('crm_chatters')), // null = creator-level stats
  
  // Time bucket
  timestamp: v.number(),        // Snapshot time (hourly buckets)
  period: v.union(
    v.literal('hourly'),
    v.literal('daily'),
    v.literal('weekly')
  ),
  
  // Metrics
  totalPending: v.number(),
  totalResponded: v.number(),
  avgWaitTimeSec: v.number(),
  maxWaitTimeSec: v.number(),
  slaBreaches: v.number(),
  escalations: v.number(),
  
  // Segment breakdown
  vipPending: v.number(),
  whalePending: v.number(),
  corePending: v.number(),
})
  .index('by_timestamp', ['timestamp'])
  .index('by_creator', ['creatorId', 'timestamp'])
  .index('by_chatter', ['chatterId', 'timestamp']),
```

### Convex Functions (`convex/crm/queue.ts`)

```typescript
// ============ QUERIES ============

// Get pending queue for a chatter
export const getChatterQueue = query({
  args: { 
    chatterId: v.id('crm_chatters'),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Return messages assigned to chatter, sorted by priority then receivedAt
    // Include SLA status (green/amber/red based on wait time)
  },
});

// Get full queue for supervisor (all creators or filtered)
export const getSupervisorQueue = query({
  args: {
    creatorId: v.optional(v.id('crm_creators')),
    status: v.optional(v.string()),
    priority: v.optional(v.string()),
    segment: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Return all pending messages across creators
    // Include chatter info, wait time, SLA status
    // Sort: priority desc, waitTime desc
  },
});

// Get queue statistics (real-time)
export const getQueueStats = query({
  args: {
    creatorId: v.optional(v.id('crm_creators')),
  },
  handler: async (ctx, args) => {
    // Return: totalPending, avgWaitTime, slaBreaches, bySegment, byChatter
  },
});

// Get chatter workload distribution
export const getChatterWorkloads = query({
  args: {},
  handler: async (ctx, args) => {
    // Return: per-chatter pending count, avg response time, capacity status
  },
});

// Get SLA config for creator
export const getSlaConfig = query({
  args: { creatorId: v.id('crm_creators') },
  handler: async (ctx, args) => {
    // Return SLA thresholds or defaults
  },
});

// Get queue history/trends
export const getQueueTrends = query({
  args: {
    creatorId: v.optional(v.id('crm_creators')),
    period: v.union(v.literal('day'), v.literal('week'), v.literal('month')),
  },
  handler: async (ctx, args) => {
    // Return historical stats for charting
  },
});


// ============ MUTATIONS ============

// Log new message (manual entry)
export const logMessage = mutation({
  args: {
    creatorId: v.id('crm_creators'),
    fanUsername: v.string(),
    fanDisplayName: v.optional(v.string()),
    fanSegment: v.string(),
    messageType: v.string(),
    priority: v.optional(v.string()),
    messagePreview: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Get current user as chatterId
    // 2. Auto-calculate priority based on segment if not provided
    // 3. Create queue entry with status='pending', receivedAt=now
    // 4. Return queueId
  },
});

// Mark message as being worked on
export const startWorking = mutation({
  args: { queueId: v.id('crm_message_queue') },
  handler: async (ctx, args) => {
    // Update status='in_progress', firstViewedAt=now
  },
});

// Mark message as responded
export const markResponded = mutation({
  args: {
    queueId: v.id('crm_message_queue'),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Update status='responded', respondedAt=now
    // 2. Calculate waitTimeSec and handleTimeSec
    // 3. Return updated record
  },
});

// Reassign message to different chatter
export const reassignMessage = mutation({
  args: {
    queueId: v.id('crm_message_queue'),
    newChatterId: v.id('crm_chatters'),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update chatterId, status='reassigned' then 'pending'
    // Log the reassignment
  },
});

// Escalate message to supervisor
export const escalateMessage = mutation({
  args: {
    queueId: v.id('crm_message_queue'),
    escalateTo: v.id('crm_chatters'),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    // Update status='escalated', escalatedTo, escalatedAt, reason
  },
});

// Mark as spam/irrelevant
export const markSpam = mutation({
  args: { queueId: v.id('crm_message_queue') },
  handler: async (ctx, args) => {
    // Update status='spam'
  },
});

// Bulk respond (mark multiple as responded)
export const bulkRespond = mutation({
  args: { 
    queueIds: v.array(v.id('crm_message_queue')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Loop and mark all as responded
  },
});

// Update SLA config
export const updateSlaConfig = mutation({
  args: {
    creatorId: v.id('crm_creators'),
    vipMaxWait: v.optional(v.number()),
    whaleMaxWait: v.optional(v.number()),
    coreMaxWait: v.optional(v.number()),
    casualMaxWait: v.optional(v.number()),
    autoEscalateEnabled: v.optional(v.boolean()),
    escalateToSupervisor: v.optional(v.id('crm_chatters')),
  },
  handler: async (ctx, args) => {
    // Upsert SLA config
  },
});


// ============ SCHEDULED JOBS ============

// Cron: Check for SLA breaches and auto-escalate
export const checkSlaBreaches = mutation({
  args: {},
  handler: async (ctx, args) => {
    // 1. Get all pending messages
    // 2. For each, check if waitTime > SLA threshold for segment
    // 3. If breached and autoEscalate enabled, escalate
    // 4. Update queue stats snapshot
  },
});

// Cron: Snapshot queue stats (hourly)
export const snapshotQueueStats = mutation({
  args: {},
  handler: async (ctx, args) => {
    // Calculate and store hourly stats for trending
  },
});
```

### Cron Registration (`convex/crons.ts`)

```typescript
// Add to existing crons
crons.interval(
  "check-queue-sla",
  { minutes: 2 },  // Every 2 minutes
  internal.crm.queue.checkSlaBreaches
);

crons.interval(
  "snapshot-queue-stats",
  { hours: 1 },  // Hourly
  internal.crm.queue.snapshotQueueStats
);
```

### Queue Engine (`lib/queue-engine.ts`)

```typescript
// SLA status calculation
type SlaStatus = 'ok' | 'warning' | 'breach';

interface SlaThresholds {
  vip: number;
  whale: number;
  core: number;
  casual: number;
}

const DEFAULT_SLA: SlaThresholds = {
  vip: 300,     // 5 minutes
  whale: 600,   // 10 minutes
  core: 1800,   // 30 minutes
  casual: 3600, // 1 hour
};

export function getSlaThreshold(segment: string, config?: SlaThresholds): number {
  const thresholds = config || DEFAULT_SLA;
  switch (segment) {
    case 'vip': return thresholds.vip;
    case 'whale': return thresholds.whale;
    case 'core': return thresholds.core;
    default: return thresholds.casual;
  }
}

export function calculateSlaStatus(
  waitTimeSec: number,
  maxWaitSec: number
): SlaStatus {
  const ratio = waitTimeSec / maxWaitSec;
  if (ratio >= 1) return 'breach';
  if (ratio >= 0.7) return 'warning';  // 70% of SLA = amber
  return 'ok';
}

export function calculatePriority(segment: string, messageType: string): string {
  // VIP/Whale + tip/PPV = critical
  if ((segment === 'vip' || segment === 'whale') && 
      (messageType === 'tip' || messageType === 'ppv_unlock' || messageType === 'custom_request')) {
    return 'critical';
  }
  // VIP/Whale = high
  if (segment === 'vip' || segment === 'whale') return 'high';
  // Tips from anyone = high
  if (messageType === 'tip' || messageType === 'ppv_unlock') return 'high';
  // Core = normal
  if (segment === 'core') return 'normal';
  // Everyone else = low
  return 'low';
}

export function formatWaitTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function getQueueHealthScore(stats: QueueStats): number {
  // Health based on: pending count, avg wait time, SLA breaches
  // 100 = perfect, 0 = crisis
  let score = 100;
  
  // Penalize for pending messages (max -30)
  score -= Math.min(30, stats.totalPending * 2);
  
  // Penalize for avg wait time (max -30)
  const avgWaitMinutes = stats.avgWaitTimeSec / 60;
  score -= Math.min(30, avgWaitMinutes);
  
  // Penalize heavily for SLA breaches (max -40)
  score -= Math.min(40, stats.slaBreaches * 10);
  
  return Math.max(0, score);
}
```

---

## Phase 8B: Chatter Message Intake (4h)

### Goal
Simple, fast UI for chatters to log incoming messages with minimal friction.

### Route: `/queue/new`

**Design Principle**: < 5 seconds to log a message. Minimize required fields.

### Quick-Log Widget (Floating Button)

```
┌─────────────────────────────────────────────────┐
│ [+] Quick Log                                   │ ← Floating action button
└─────────────────────────────────────────────────┘

Expands to:
┌─────────────────────────────────────────────────┐
│ 📩 Log New Message                              │
├─────────────────────────────────────────────────┤
│ Creator:  [Luna ▼]                              │
│ Fan:      [@username____________]               │
│ Type:     [DM] [Tip] [PPV] [Sub] [Other]       │
│ Segment:  [VIP] [Whale] [Core] [Casual] [New]  │
│                                                 │
│ Preview (optional):                             │
│ [_______________________________________]       │
│                                                 │
│            [Cancel]  [Log & Continue]           │
│                      [Log & Mark Responded]     │
└─────────────────────────────────────────────────┘
```

### My Queue View: `/queue`

```
┌──────────────────────────────────────────────────────────┐
│ 📬 My Queue                    [+ Log Message]  [⚙️]     │
├──────────────────────────────────────────────────────────┤
│ Filter: [All ▼] [Luna ▼]     Sort: [Wait Time ▼]        │
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🔴 @VIPFan123               5:32 waiting           │   │
│ │ Luna • VIP • Tip $50        "Hey babe, when..."    │   │
│ │                    [Start] [Respond] [Escalate]    │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🟡 @WhaleGuy                12:15 waiting          │   │
│ │ Luna • Whale • DM           "Can you send..."      │   │
│ │                    [Start] [Respond] [Escalate]    │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 🟢 @NewFan                  2:45 waiting           │   │
│ │ Mia • New • DM                                     │   │
│ │                    [Start] [Respond] [Escalate]    │   │
│ └────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────┤
│ Showing 3 pending • Avg wait: 6:50 • 0 SLA breaches      │
└──────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `QuickLogButton.tsx` | Floating action button (bottom-right) |
| `LogMessageModal.tsx` | Quick entry form |
| `QueueList.tsx` | Paginated list of queue items |
| `QueueItem.tsx` | Single queue card with actions |
| `QueueFilters.tsx` | Status/creator/priority filters |
| `SlaIndicator.tsx` | Color-coded wait time badge (🟢🟡🔴) |
| `FanAutocomplete.tsx` | Username autocomplete (remembers recent fans) |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/queue/page.tsx` | My queue view |
| `app/(crm)/queue/new/page.tsx` | Full log form (mobile-friendly) |
| `components/queue/QuickLogButton.tsx` | FAB component |
| `components/queue/LogMessageModal.tsx` | Quick log modal |
| `components/queue/QueueList.tsx` | List component |
| `components/queue/QueueItem.tsx` | Item card |
| `components/queue/QueueFilters.tsx` | Filter bar |
| `components/queue/SlaIndicator.tsx` | Status badge |
| `components/queue/FanAutocomplete.tsx` | Fan lookup |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `N` | Open quick log modal |
| `R` | Mark selected as responded |
| `E` | Escalate selected |
| `↑/↓` | Navigate queue items |
| `Enter` | Expand selected item |

---

## Phase 8C: Supervisor Queue Dashboard (5h)

### Goal
Real-time bird's-eye view of all queues with drill-down capability.

### Route: `/queue/supervisor`

**Role Requirement**: `supervisor` or `admin`

### Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ 👁️ Queue Command Center                     Last updated: 2s ago   │
├──────────────────────────────────────────────────────────────────────┤
│ ┌────────────┬────────────┬────────────┬────────────┐                │
│ │ 📬 Pending │ ⏱️ Avg Wait │ 🔥 Critical│ ⚠️ Breaches│                │
│ │     23     │   8:45     │     5      │     2      │                │
│ │   +3 ↑     │  +1:20 ↑   │            │   -1 ↓     │                │
│ └────────────┴────────────┴────────────┴────────────┘                │
├──────────────────────────────────────────────────────────────────────┤
│ CHATTER WORKLOADS                              [Rebalance]           │
│ ┌───────────────────────────────────────────────────────────────┐    │
│ │ Alice      ████████████████░░░░░ 12 msgs  avg 4:30  🟢 OK    │    │
│ │ Bob        ████████░░░░░░░░░░░░░  6 msgs  avg 3:15  🟢 OK    │    │
│ │ Carol      ████████████████████░ 15 msgs  avg 12:30 🔴 OVER  │    │
│ │ David      ██░░░░░░░░░░░░░░░░░░░  2 msgs  avg 2:00  🟢 OK    │    │
│ └───────────────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────────────┤
│ BY CREATOR                                                           │
│ ┌──────────────────┬──────────────────┬──────────────────┐           │
│ │ Luna             │ Mia              │ Sophie           │           │
│ │ 14 pending       │ 6 pending        │ 3 pending        │           │
│ │ 🔴 2 VIP waiting │ 🟢 All OK        │ 🟡 1 whale wait  │           │
│ │ [View Queue]     │ [View Queue]     │ [View Queue]     │           │
│ └──────────────────┴──────────────────┴──────────────────┘           │
├──────────────────────────────────────────────────────────────────────┤
│ CRITICAL QUEUE (VIP/Whale needing attention)            [View All]  │
│ ┌────────────────────────────────────────────────────────────────┐   │
│ │ 🔴 @BigSpender • Luna • VIP • 8:45 wait   [Reassign] [Escalate]│   │
│ │ 🔴 @WhaleWatch • Luna • Whale • 6:30 wait [Reassign] [Escalate]│   │
│ │ 🟡 @VIPKing    • Mia  • VIP • 4:15 wait   [Reassign] [Escalate]│   │
│ └────────────────────────────────────────────────────────────────┘   │
├──────────────────────────────────────────────────────────────────────┤
│ WAIT TIME DISTRIBUTION                  SLA TREND (24h)              │
│ ┌─────────────────────────┐            ┌─────────────────────────┐   │
│ │ 0-5m   ████████████ 45% │            │         /\              │   │
│ │ 5-15m  ██████ 25%       │            │   /\   /  \    /\       │   │
│ │ 15-30m ████ 18%         │            │  /  \_/    \__/  \      │   │
│ │ 30m+   ███ 12%          │            │ /                 \___  │   │
│ └─────────────────────────┘            └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

### Real-Time Features

1. **Auto-refresh**: Query subscriptions update every 5 seconds
2. **Live counters**: Pending count, wait times animate on change
3. **Alert toast**: Pop-up when SLA breach occurs
4. **Sound notification**: Optional audio alert for critical items

### Supervisor Actions

| Action | Description |
|--------|-------------|
| **Reassign** | Move message to different chatter |
| **Escalate** | Flag for supervisor handling |
| **Rebalance** | Auto-redistribute based on workload |
| **View Chatter** | Drill into chatter's queue |
| **Pause Chatter** | Temporarily stop routing to them |

### Components

| Component | Purpose |
|-----------|---------|
| `QueueCommandCenter.tsx` | Main dashboard layout |
| `QueueStatsCards.tsx` | Summary metric cards |
| `ChatterWorkloadChart.tsx` | Horizontal bar chart of workloads |
| `CreatorQueueCards.tsx` | Per-creator summary cards |
| `CriticalQueueTable.tsx` | VIP/Whale items needing attention |
| `WaitTimeDistribution.tsx` | Histogram of wait times |
| `SlaTrendChart.tsx` | 24h line chart of SLA compliance |
| `ReassignModal.tsx` | Chatter picker for reassignment |
| `RebalanceModal.tsx` | Auto-rebalance preview + confirm |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/queue/supervisor/page.tsx` | Command center page |
| `components/queue/supervisor/QueueCommandCenter.tsx` | Main layout |
| `components/queue/supervisor/QueueStatsCards.tsx` | Stats cards |
| `components/queue/supervisor/ChatterWorkloadChart.tsx` | Workload bars |
| `components/queue/supervisor/CreatorQueueCards.tsx` | Creator cards |
| `components/queue/supervisor/CriticalQueueTable.tsx` | Critical items |
| `components/queue/supervisor/WaitTimeDistribution.tsx` | Wait histogram |
| `components/queue/supervisor/SlaTrendChart.tsx` | SLA chart |
| `components/queue/supervisor/ReassignModal.tsx` | Reassign UI |
| `components/queue/supervisor/RebalanceModal.tsx` | Rebalance UI |

---

## Phase 8D: Real-Time Updates & Alerts (4h)

### Goal
Live updates without page refresh, proactive SLA alerts.

### Real-Time Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Chatter    │────▶│   Convex    │◀────│ Supervisor  │
│   Logs      │     │  Reactivity │     │  Dashboard  │
│  Message    │     └──────┬──────┘     │  Subscribes │
└─────────────┘            │            └─────────────┘
                           │
                    ┌──────▼──────┐
                    │  SLA Cron   │
                    │  (2 min)    │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   Alerts    │
                    │  (Banner +  │
                    │   Toast)    │
                    └─────────────┘
```

### Convex Subscriptions

```typescript
// useQuery with automatic reactivity
const myQueue = useQuery(api.crm.queue.getChatterQueue, { 
  chatterId: currentUser._id 
});

const supervisorQueue = useQuery(api.crm.queue.getSupervisorQueue, {
  status: 'pending',
});

const queueStats = useQuery(api.crm.queue.getQueueStats, {});
```

### Alert Integration

Leverage existing Phase 3 Alert system:

```typescript
// New alert rules for queue
const QUEUE_ALERT_RULES = [
  {
    id: 'vip_waiting_5min',
    name: 'VIP Waiting >5 Minutes',
    condition: (stats) => stats.vipPending > 0 && stats.maxVipWait > 300,
    severity: 'critical',
    message: (stats) => `${stats.vipPending} VIP fan(s) waiting over 5 minutes`,
  },
  {
    id: 'queue_overload',
    name: 'Queue Overload',
    condition: (stats) => stats.totalPending > 50,
    severity: 'warning',
    message: (stats) => `Queue backup: ${stats.totalPending} messages pending`,
  },
  {
    id: 'chatter_overloaded',
    name: 'Chatter Overloaded',
    condition: (stats) => stats.maxChatterLoad > 20,
    severity: 'warning',
    message: (stats) => `${stats.overloadedChatter} has ${stats.maxChatterLoad} pending messages`,
  },
];
```

### Toast Notifications

```typescript
// components/queue/QueueAlertToast.tsx
// Pops up when critical items detected
// Uses existing toast infrastructure

useEffect(() => {
  if (criticalItems.length > prevCritical.current) {
    toast.error(`🔴 ${criticalItems.length} critical items need attention!`, {
      duration: 10000,
      action: {
        label: 'View',
        onClick: () => router.push('/queue/supervisor'),
      },
    });
  }
}, [criticalItems]);
```

### Sound Alerts (Optional)

```typescript
// lib/queue-sounds.ts
const ALERT_SOUND = '/sounds/alert.mp3';

export function playAlertSound() {
  if (typeof Audio !== 'undefined') {
    const audio = new Audio(ALERT_SOUND);
    audio.volume = 0.5;
    audio.play().catch(() => {}); // Ignore if blocked
  }
}
```

---

## Phase 8E: VIP Routing & Escalation (3h)

### Goal
Smart routing of high-priority messages to best-suited chatters.

### VIP Routing Logic

```typescript
// lib/queue-routing.ts

interface RoutingScore {
  chatterId: string;
  score: number;
  reasons: string[];
}

export function calculateRoutingScore(
  message: QueueMessage,
  chatter: Chatter,
  workload: ChatterWorkload
): RoutingScore {
  let score = 100;
  const reasons: string[] = [];
  
  // Workload factor (-30 max)
  const loadPenalty = Math.min(30, workload.pending * 3);
  score -= loadPenalty;
  reasons.push(`Workload: -${loadPenalty}`);
  
  // Response time factor (-20 max)
  const avgResponseMin = workload.avgResponseTime / 60;
  const timePenalty = Math.min(20, avgResponseMin * 2);
  score -= timePenalty;
  reasons.push(`Avg response: -${timePenalty}`);
  
  // Creator familiarity bonus (+15)
  if (chatter.assignedCreators?.includes(message.creatorId)) {
    score += 15;
    reasons.push('Creator match: +15');
  }
  
  // VIP handling experience bonus (+10)
  if (message.fanSegment === 'vip' && chatter.vipHandlingRate > 0.2) {
    score += 10;
    reasons.push('VIP experience: +10');
  }
  
  // Online status (+20 if online, 0 if not)
  if (workload.isOnline) {
    score += 20;
    reasons.push('Online: +20');
  }
  
  return { chatterId: chatter._id, score, reasons };
}

export function findBestChatter(
  message: QueueMessage,
  availableChatters: Chatter[],
  workloads: Map<string, ChatterWorkload>
): string | null {
  const scores = availableChatters
    .map(c => calculateRoutingScore(message, c, workloads.get(c._id)!))
    .sort((a, b) => b.score - a.score);
  
  if (scores.length === 0) return null;
  if (scores[0].score < 30) return null; // No good option
  
  return scores[0].chatterId;
}
```

### Auto-Escalation Rules

```typescript
// Escalation triggers (checked by cron)
const ESCALATION_TRIGGERS = [
  {
    name: 'VIP breach',
    check: (msg) => msg.fanSegment === 'vip' && msg.waitTimeSec > 600, // 10min
    action: 'escalate_to_supervisor',
  },
  {
    name: 'Whale breach',
    check: (msg) => msg.fanSegment === 'whale' && msg.waitTimeSec > 900, // 15min
    action: 'escalate_to_supervisor',
  },
  {
    name: 'High-value tip',
    check: (msg) => msg.messageType === 'tip' && msg.waitTimeSec > 300, // 5min
    action: 'escalate_to_supervisor',
  },
  {
    name: 'Chatter overload',
    check: (msg, workload) => workload.pending > 15 && msg.waitTimeSec > 600,
    action: 'auto_reassign',
  },
];
```

### Supervisor Escalation View

```
┌──────────────────────────────────────────────────────────┐
│ 🚨 Escalated Items (5)                       [Handle All]│
├──────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────┐   │
│ │ @VIPKing • Luna • 12:30 waiting                    │   │
│ │ Reason: VIP SLA breach (>10 min)                   │   │
│ │ Escalated by: Auto (2 min ago)                     │   │
│ │ [Reassign to Alice ▼] [Take Over] [Dismiss]        │   │
│ └────────────────────────────────────────────────────┘   │
│ ┌────────────────────────────────────────────────────┐   │
│ │ @BigTipper • Mia • 8:45 waiting                    │   │
│ │ Reason: $200 tip waiting                           │   │
│ │ Escalated by: Bob (5 min ago)                      │   │
│ │ [Reassign to Carol ▼] [Take Over] [Dismiss]        │   │
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

---

## Navigation Updates

### Sidebar Addition

```typescript
// Add to sidebar nav
{
  label: 'Queue',
  icon: MessageSquare,
  href: '/queue',
  children: [
    { label: 'My Queue', href: '/queue' },
    { label: 'Command Center', href: '/queue/supervisor', role: ['supervisor', 'admin'] },
    { label: 'SLA Settings', href: '/queue/settings', role: ['admin'] },
  ],
}
```

---

## Testing Checklist

### Phase 8A (Schema & Functions)
- [ ] Schema migrates without errors
- [ ] `logMessage` creates queue entry correctly
- [ ] `markResponded` calculates wait time correctly
- [ ] `reassignMessage` updates chatter and logs
- [ ] `escalateMessage` updates status and assigns
- [ ] `getSupervisorQueue` returns sorted by priority
- [ ] `getQueueStats` calculates correct totals
- [ ] SLA cron triggers escalation

### Phase 8B (Chatter Intake)
- [ ] Quick log modal opens with `N` key
- [ ] Creator dropdown shows assigned creators
- [ ] Fan autocomplete suggests recent usernames
- [ ] Segment buttons work correctly
- [ ] "Log & Mark Responded" creates + closes in one action
- [ ] Queue list updates in real-time
- [ ] Filters work (status, creator, priority)

### Phase 8C (Supervisor Dashboard)
- [ ] Stats cards show correct totals
- [ ] Workload chart shows per-chatter breakdown
- [ ] Creator cards show pending + SLA status
- [ ] Critical queue shows only VIP/Whale items
- [ ] Reassign modal works
- [ ] Rebalance preview shows redistribution

### Phase 8D (Real-Time)
- [ ] Queue updates without page refresh
- [ ] Toast appears on new critical item
- [ ] Sound plays on breach (if enabled)
- [ ] Alert banner integrates with Phase 3 system

### Phase 8E (VIP Routing)
- [ ] Routing score calculation correct
- [ ] Auto-escalation triggers at thresholds
- [ ] Supervisor can take over escalated items
- [ ] Reassignment logs reason

### Integration
- [ ] Role checks: chatter sees own queue, supervisor sees all
- [ ] Build passes (0 TS errors)
- [ ] Sidebar nav added
- [ ] Mobile responsive (especially quick log)

---

## Acceptance Criteria

- [ ] Chatters can log messages in < 5 seconds
- [ ] Real-time queue visibility (< 10 second latency)
- [ ] SLA thresholds configurable per creator
- [ ] Automatic escalation on SLA breach
- [ ] Supervisor can reassign messages
- [ ] Workload distribution visible
- [ ] Historical trends available
- [ ] Integrates with existing alert system
- [ ] TypeScript 0 errors
- [ ] `npm run build` clean
- [ ] Mobile-friendly quick log

---

## Blockers & Unknowns

| Item | Status | Impact | Mitigation |
|------|--------|--------|------------|
| OF API access | ❓ Unknown | Blocks automatic sync | Start with manual entry (Option B) |
| Fan segment data | ❓ Unclear | May need manual tagging | Allow override in log form |
| Chatter online status | ❓ TBD | Affects routing accuracy | Use last activity timestamp as proxy |
| Real fan usernames | ✅ Low risk | Privacy consideration | Store username only, not full profile |

### Open Questions for Product

1. **SLA by time of day?** — Should SLA thresholds be different during peak hours?
2. **Auto-assignment?** — When message comes in, auto-assign to best chatter vs. supervisor assigns?
3. **Chatter capacity limits?** — Hard cap on pending messages per chatter?
4. **Fan history?** — Store previous interactions for context?

---

## Future Enhancements (Out of Scope)

- [ ] OnlyFans API integration (auto-sync messages)
- [ ] Fan conversation history
- [ ] AI-suggested responses
- [ ] Canned response library
- [ ] Fan sentiment detection
- [ ] Message translation
- [ ] Voice message transcription
- [ ] Integration with PPV pricing engine

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Message logging rate | > 80% coverage | Messages logged vs. reported in daily report |
| Average entry time | < 5 seconds | Track `logMessage` call duration |
| SLA compliance | > 95% VIP within 5min | Query historical breaches |
| Response time reduction | -20% | Compare avg before/after |
| Supervisor intervention time | < 2 minutes from breach | Measure escalation → action gap |

---

*End of Phase 8 Spec*
