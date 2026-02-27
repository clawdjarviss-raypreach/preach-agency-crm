# Phase 6: Queue Automation Rules (3h)

## Goal
Automated queue management with escalation, reassignment, and smart routing rules.

## Components

### 1. Auto-Escalation (1h)
- **Trigger**: VIP message unresponded for >30 minutes
- **Action**: Escalate to supervisor queue
- **Config**: Threshold configurable per admin
- **Notification**: Alert supervisor via dashboard + optional push

### 2. Auto-Reassignment (1h)
- **Trigger**: Message stale for >60 minutes with no activity
- **Action**: Reassign to next available creator (round-robin or load-balanced)
- **Config**: Threshold configurable, exclude certain creators
- **Audit**: Log reassignment with reason

### 3. Smart Routing (1h)
- **Logic**: Match high-value chatters (VIP/Whale) to best performers
- **Metrics**: Use response rate, response time, earnings from leaderboard
- **Fallback**: If top performer unavailable, route to next best
- **Config**: Enable/disable per segment

## Schema (Convex)

```typescript
// Automation rules
crm_automation_rules = defineTable({
  type: v.union(
    v.literal('escalation'),
    v.literal('reassignment'),
    v.literal('smart_routing')
  ),
  enabled: v.boolean(),
  config: v.object({
    thresholdMinutes: v.optional(v.number()),
    targetRole: v.optional(v.string()),
    excludeCreators: v.optional(v.array(v.id('crm_creators'))),
    segments: v.optional(v.array(v.string())),
  }),
  createdAt: v.number(),
  updatedAt: v.number(),
  updatedBy: v.id('crm_chatters'),
})

// Automation log (audit trail)
crm_automation_log = defineTable({
  ruleId: v.id('crm_automation_rules'),
  ruleType: v.string(),
  triggeredAt: v.number(),
  messageId: v.optional(v.string()),
  chatterId: v.optional(v.id('crm_chatters')),
  fromCreator: v.optional(v.id('crm_creators')),
  toCreator: v.optional(v.id('crm_creators')),
  reason: v.string(),
})
  .index('by_rule', ['ruleId'])
  .index('by_time', ['triggeredAt'])
```

## API Endpoints

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/automation/rules` | GET | List all automation rules |
| `/api/automation/rules` | POST | Create new rule |
| `/api/automation/rules/[id]` | PUT | Update rule config |
| `/api/automation/rules/[id]` | DELETE | Delete rule |
| `/api/automation/log` | GET | Get automation audit log |
| `/api/cron/run-automation` | POST | Cron endpoint to evaluate rules |

## Files to Create

| File | Purpose |
|------|---------|
| `convex/crm/automation.ts` | CRUD for rules, log queries |
| `lib/automation-engine.ts` | Rule evaluation, action execution |
| `app/api/automation/rules/route.ts` | Rules API |
| `app/api/automation/log/route.ts` | Log API |
| `app/api/cron/run-automation/route.ts` | Cron trigger |
| `app/(crm)/automation/page.tsx` | Admin config UI |
| `components/AutomationRuleCard.tsx` | Rule display/edit card |
| `components/AutomationLog.tsx` | Audit log table |

## Cron Schedule

- **Run frequency**: Every 5 minutes
- **Cron name**: `automation:evaluate`
- **Actions**:
  1. Query all enabled rules
  2. For escalation: Find VIP messages older than threshold, escalate
  3. For reassignment: Find stale messages, reassign
  4. For smart routing: (Run on new message creation, not cron)

## UI Design

### Automation Config Page (`/automation`)
- 3 cards for each rule type
- Toggle switch to enable/disable
- Threshold input (minutes)
- Target role selector (for escalation)
- Exclude creators multi-select (for reassignment)
- Segment checkboxes (for smart routing)
- Save button per card
- Recent activity log at bottom

## Testing Checklist

- [ ] Create escalation rule, wait 30min with VIP message → verify escalation
- [ ] Create reassignment rule, wait 60min with stale message → verify reassignment
- [ ] Enable smart routing, create VIP chatter → verify routed to top performer
- [ ] Disable rule → verify no action taken
- [ ] Check audit log → verify entries created
- [ ] TypeScript 0 errors
- [ ] Build clean

## Acceptance Criteria

- [ ] All 3 rule types configurable via UI
- [ ] Cron runs every 5 minutes
- [ ] Actions execute correctly based on thresholds
- [ ] Audit log captures all automation events
- [ ] Admin-only access
- [ ] No duplicate actions (idempotent)
- [ ] Build clean, TypeScript 0 errors
