# Phase 9: Supervisor Coaching Hub (8–12h)

**Status**: Ready for Implementation  
**Priority**: P1  
**Dependencies**: None (standalone module)  
**ROI Score**: 7/10  

---

## Overview

Structured performance management system enabling supervisors to coach chatters effectively. Includes 1:1 meeting notes, performance improvement plans (PIPs), training material tracking, feedback logging, and SMART goal setting.

**Why It Matters**: Leaderboards show *who* is performing—this module helps supervisors *improve* performance and retain top talent through structured coaching.

---

## Sub-Phase Breakdown

| Phase | Focus | Hours | Cumulative |
|-------|-------|-------|------------|
| 9A | Schema & Core Functions | 3h | 3h |
| 9B | 1:1 Meeting Notes | 2h | 5h |
| 9C | Performance Goals (SMART) | 2h | 7h |
| 9D | Feedback & Praise System | 2h | 9h |
| 9E | Training Materials & PIPs | 2h | 11h |

**Total**: 9–11 hours (within 8–12h estimate)

---

## Phase 9A: Schema & Core Functions (3h)

### Goal
Define coaching data model and CRUD operations for all coaching features.

### Schema Additions (`convex/schema.ts`)

```typescript
// ============ 1:1 MEETING NOTES ============

crm_coaching_meetings: defineTable({
  // Relationships
  supervisorId: v.id('crm_chatters'),
  chatterId: v.id('crm_chatters'),
  
  // Meeting Details
  meetingDate: v.number(),              // Unix timestamp
  meetingType: v.union(
    v.literal('one_on_one'),
    v.literal('performance_review'),
    v.literal('pip_checkin'),
    v.literal('onboarding'),
    v.literal('exit_interview')
  ),
  duration: v.optional(v.number()),     // Minutes
  location: v.optional(v.string()),     // "Zoom", "Slack Call", etc.
  
  // Content
  agenda: v.optional(v.string()),
  notes: v.string(),
  privateNotes: v.optional(v.string()), // Supervisor-only notes
  
  // Action Items
  actionItems: v.array(v.object({
    id: v.string(),                     // UUID
    item: v.string(),
    assignee: v.union(v.literal('chatter'), v.literal('supervisor')),
    dueDate: v.optional(v.number()),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  })),
  
  // Follow-up
  followUpDate: v.optional(v.number()),
  followUpNotes: v.optional(v.string()),
  followUpCompleted: v.boolean(),
  
  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_supervisor', ['supervisorId', 'meetingDate'])
  .index('by_chatter', ['chatterId', 'meetingDate'])
  .index('by_date', ['meetingDate'])
  .index('by_follow_up', ['followUpDate', 'followUpCompleted']),


// ============ PERFORMANCE GOALS ============

crm_coaching_goals: defineTable({
  // Relationships
  chatterId: v.id('crm_chatters'),
  createdBy: v.id('crm_chatters'),       // Supervisor who set it
  
  // SMART Goal Definition
  title: v.string(),
  description: v.optional(v.string()),
  
  // Metric-based goal
  metric: v.optional(v.union(
    v.literal('response_time'),           // Avg response time (seconds)
    v.literal('earnings'),                // Total earnings ($)
    v.literal('messages_handled'),        // Message count
    v.literal('vip_retention'),           // VIP retention rate (%)
    v.literal('shift_hours'),             // Hours worked
    v.literal('ppv_sales'),               // PPV revenue
    v.literal('tip_amount'),              // Tips received
    v.literal('custom')                   // Custom text-based goal
  )),
  
  // Targets (for metric-based goals)
  targetValue: v.optional(v.number()),
  currentValue: v.optional(v.number()),
  startValue: v.optional(v.number()),     // Baseline at goal creation
  unit: v.optional(v.string()),           // "seconds", "$", "messages", "%"
  
  // Time Period
  periodStart: v.number(),
  periodEnd: v.number(),
  
  // Status
  status: v.union(
    v.literal('active'),
    v.literal('achieved'),
    v.literal('missed'),
    v.literal('cancelled')
  ),
  achievedAt: v.optional(v.number()),
  
  // Progress tracking
  progressPercent: v.optional(v.number()), // 0-100
  checkIns: v.array(v.object({
    date: v.number(),
    value: v.optional(v.number()),
    note: v.string(),
    recordedBy: v.id('crm_chatters'),
  })),
  
  // Visibility
  visibility: v.union(
    v.literal('private'),                 // Supervisor only
    v.literal('shared'),                  // Supervisor + chatter
    v.literal('team')                     // Visible to team leads
  ),
  
  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_chatter', ['chatterId', 'status'])
  .index('by_period', ['periodStart', 'periodEnd'])
  .index('by_status', ['status'])
  .index('by_deadline', ['periodEnd', 'status']),


// ============ FEEDBACK SYSTEM ============

crm_coaching_feedback: defineTable({
  // Relationships
  chatterId: v.id('crm_chatters'),        // Who it's about
  givenBy: v.id('crm_chatters'),          // Who gave it (supervisor)
  
  // Feedback Type
  type: v.union(
    v.literal('praise'),                  // Positive recognition
    v.literal('constructive'),            // Improvement area
    v.literal('observation'),             // Neutral note
    v.literal('warning')                  // Formal warning
  ),
  
  // Content
  title: v.optional(v.string()),
  content: v.string(),
  category: v.optional(v.union(
    v.literal('response_quality'),
    v.literal('response_speed'),
    v.literal('fan_handling'),
    v.literal('teamwork'),
    v.literal('reliability'),
    v.literal('earnings'),
    v.literal('attitude'),
    v.literal('other')
  )),
  
  // Context (optional)
  relatedCreatorId: v.optional(v.id('crm_creators')),
  relatedMeetingId: v.optional(v.id('crm_coaching_meetings')),
  
  // Visibility
  visibility: v.union(
    v.literal('private'),                 // Supervisor file only
    v.literal('shared'),                  // Visible to chatter
    v.literal('team')                     // Visible to all supervisors
  ),
  
  // Chatter acknowledgment (if shared)
  acknowledged: v.optional(v.boolean()),
  acknowledgedAt: v.optional(v.number()),
  chatterResponse: v.optional(v.string()),
  
  // Metadata
  feedbackDate: v.number(),               // When event occurred
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_chatter', ['chatterId', 'feedbackDate'])
  .index('by_type', ['type', 'feedbackDate'])
  .index('by_supervisor', ['givenBy', 'feedbackDate'])
  .index('by_visibility', ['visibility', 'chatterId']),


// ============ PERFORMANCE IMPROVEMENT PLANS ============

crm_coaching_pips: defineTable({
  // Relationships
  chatterId: v.id('crm_chatters'),
  supervisorId: v.id('crm_chatters'),
  
  // PIP Details
  title: v.string(),
  reason: v.string(),                     // Why PIP was initiated
  startDate: v.number(),
  endDate: v.number(),
  
  // Status
  status: v.union(
    v.literal('draft'),                   // Being created
    v.literal('active'),                  // In progress
    v.literal('completed'),               // Successfully finished
    v.literal('extended'),                // Extended timeline
    v.literal('failed'),                  // Did not meet expectations
    v.literal('cancelled')                // Cancelled
  ),
  
  // Requirements
  requirements: v.array(v.object({
    id: v.string(),                       // UUID
    description: v.string(),
    targetValue: v.optional(v.number()),
    currentValue: v.optional(v.number()),
    met: v.boolean(),
    metAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  })),
  
  // Milestones
  milestones: v.array(v.object({
    id: v.string(),                       // UUID
    title: v.string(),
    dueDate: v.number(),
    status: v.union(
      v.literal('pending'),
      v.literal('met'),
      v.literal('missed'),
      v.literal('extended')
    ),
    notes: v.optional(v.string()),
  })),
  
  // Check-ins
  checkIns: v.array(v.object({
    date: v.number(),
    notes: v.string(),
    supervisorId: v.id('crm_chatters'),
    overallProgress: v.union(
      v.literal('on_track'),
      v.literal('needs_attention'),
      v.literal('off_track')
    ),
  })),
  
  // Support provided
  supportProvided: v.optional(v.string()),
  
  // Outcome
  outcome: v.optional(v.string()),
  completedAt: v.optional(v.number()),
  
  // Visibility (PIPs are typically private)
  visibility: v.union(
    v.literal('confidential'),            // Supervisor + HR only
    v.literal('shared')                   // Supervisor + chatter
  ),
  
  // Chatter acknowledgment
  chatterAcknowledged: v.boolean(),
  chatterAcknowledgedAt: v.optional(v.number()),
  chatterComments: v.optional(v.string()),
  
  // Metadata
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_chatter', ['chatterId', 'status'])
  .index('by_supervisor', ['supervisorId', 'status'])
  .index('by_status', ['status'])
  .index('by_end_date', ['endDate', 'status']),


// ============ TRAINING MATERIALS ============

crm_training_materials: defineTable({
  // Content
  title: v.string(),
  description: v.optional(v.string()),
  type: v.union(
    v.literal('document'),
    v.literal('video'),
    v.literal('course'),
    v.literal('quiz'),
    v.literal('template'),
    v.literal('link')
  ),
  url: v.optional(v.string()),
  content: v.optional(v.string()),        // For inline content
  estimatedMinutes: v.optional(v.number()),
  
  // Categorization
  category: v.union(
    v.literal('onboarding'),
    v.literal('sales_techniques'),
    v.literal('fan_engagement'),
    v.literal('ppv_strategies'),
    v.literal('time_management'),
    v.literal('platform_rules'),
    v.literal('creator_specific'),
    v.literal('other')
  ),
  tags: v.optional(v.array(v.string())),
  
  // Target audience
  requiredFor: v.optional(v.array(v.string())), // Roles: 'all', 'new_hire', 'underperformer'
  relatedCreatorId: v.optional(v.id('crm_creators')),
  
  // Status
  isActive: v.boolean(),
  
  // Metadata
  createdBy: v.id('crm_chatters'),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index('by_category', ['category', 'isActive'])
  .index('by_type', ['type', 'isActive'])
  .index('by_active', ['isActive']),


// ============ TRAINING ASSIGNMENTS ============

crm_training_assignments: defineTable({
  // Relationships
  chatterId: v.id('crm_chatters'),
  materialId: v.id('crm_training_materials'),
  assignedBy: v.id('crm_chatters'),
  
  // Assignment details
  dueDate: v.optional(v.number()),
  priority: v.union(
    v.literal('required'),
    v.literal('recommended'),
    v.literal('optional')
  ),
  reason: v.optional(v.string()),         // Why this was assigned
  
  // Completion tracking
  status: v.union(
    v.literal('assigned'),
    v.literal('in_progress'),
    v.literal('completed'),
    v.literal('overdue')
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  
  // Quiz/assessment results (if applicable)
  score: v.optional(v.number()),          // 0-100
  passed: v.optional(v.boolean()),
  attempts: v.optional(v.number()),
  
  // Chatter notes
  chatterNotes: v.optional(v.string()),
  
  // Metadata
  assignedAt: v.number(),
})
  .index('by_chatter', ['chatterId', 'status'])
  .index('by_material', ['materialId'])
  .index('by_status', ['status'])
  .index('by_due_date', ['dueDate', 'status']),
```

### Convex Functions (`convex/crm/coaching.ts`)

```typescript
// ============ QUERIES ============

// --- Meetings ---
export const getChatterMeetings = query({
  args: {
    chatterId: v.id('crm_chatters'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Return meetings for chatter, sorted by date desc
    // Include action item counts, follow-up status
  },
});

export const getSupervisorMeetings = query({
  args: {
    supervisorId: v.optional(v.id('crm_chatters')),
    upcoming: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // All meetings for supervisor (or all if admin)
    // Filter by upcoming follow-ups if requested
  },
});

export const getMeeting = query({
  args: { meetingId: v.id('crm_coaching_meetings') },
  handler: async (ctx, args) => {
    // Single meeting with full details
  },
});

export const getPendingFollowUps = query({
  args: {},
  handler: async (ctx, args) => {
    // All meetings with follow-up due and not completed
  },
});


// --- Goals ---
export const getChatterGoals = query({
  args: {
    chatterId: v.id('crm_chatters'),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Active/all goals for chatter
  },
});

export const getGoalsDashboard = query({
  args: {},
  handler: async (ctx, args) => {
    // Summary: goals by status, upcoming deadlines, team progress
  },
});

export const getGoal = query({
  args: { goalId: v.id('crm_coaching_goals') },
  handler: async (ctx, args) => {
    // Single goal with progress history
  },
});


// --- Feedback ---
export const getChatterFeedback = query({
  args: {
    chatterId: v.id('crm_chatters'),
    type: v.optional(v.string()),
    visibility: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Feedback for chatter, filtered by type/visibility
  },
});

export const getFeedbackStats = query({
  args: { chatterId: v.id('crm_chatters') },
  handler: async (ctx, args) => {
    // Counts by type, recent trends
  },
});


// --- PIPs ---
export const getActivePIPs = query({
  args: {},
  handler: async (ctx, args) => {
    // All active PIPs with progress summary
  },
});

export const getPIP = query({
  args: { pipId: v.id('crm_coaching_pips') },
  handler: async (ctx, args) => {
    // Full PIP details
  },
});

export const getChatterPIPHistory = query({
  args: { chatterId: v.id('crm_chatters') },
  handler: async (ctx, args) => {
    // All PIPs for chatter (historical)
  },
});


// --- Training ---
export const getTrainingMaterials = query({
  args: {
    category: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // All active materials, filtered
  },
});

export const getChatterTraining = query({
  args: {
    chatterId: v.id('crm_chatters'),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Assigned training for chatter
  },
});

export const getTrainingProgress = query({
  args: { chatterId: v.id('crm_chatters') },
  handler: async (ctx, args) => {
    // Completion stats: assigned, completed, overdue, by category
  },
});


// --- Coaching Dashboard ---
export const getChatterCoachingProfile = query({
  args: { chatterId: v.id('crm_chatters') },
  handler: async (ctx, args) => {
    // Aggregate view: recent meetings, active goals, feedback summary,
    // training status, PIP status (if any)
  },
});



// ============ MUTATIONS ============

// --- Meetings ---
export const createMeeting = mutation({
  args: {
    chatterId: v.id('crm_chatters'),
    meetingDate: v.number(),
    meetingType: v.string(),
    notes: v.string(),
    agenda: v.optional(v.string()),
    privateNotes: v.optional(v.string()),
    actionItems: v.optional(v.array(v.object({
      item: v.string(),
      assignee: v.string(),
      dueDate: v.optional(v.number()),
    }))),
    followUpDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Create meeting, generate action item IDs
  },
});

export const updateMeeting = mutation({
  args: {
    meetingId: v.id('crm_coaching_meetings'),
    notes: v.optional(v.string()),
    privateNotes: v.optional(v.string()),
    actionItems: v.optional(v.array(v.any())),
    followUpDate: v.optional(v.number()),
    followUpNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update meeting fields
  },
});

export const completeActionItem = mutation({
  args: {
    meetingId: v.id('crm_coaching_meetings'),
    actionItemId: v.string(),
  },
  handler: async (ctx, args) => {
    // Mark action item completed
  },
});

export const completeFollowUp = mutation({
  args: {
    meetingId: v.id('crm_coaching_meetings'),
    followUpNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Mark follow-up completed
  },
});


// --- Goals ---
export const createGoal = mutation({
  args: {
    chatterId: v.id('crm_chatters'),
    title: v.string(),
    description: v.optional(v.string()),
    metric: v.optional(v.string()),
    targetValue: v.optional(v.number()),
    startValue: v.optional(v.number()),
    unit: v.optional(v.string()),
    periodStart: v.number(),
    periodEnd: v.number(),
    visibility: v.string(),
  },
  handler: async (ctx, args) => {
    // Create goal, calculate initial progress
  },
});

export const updateGoalProgress = mutation({
  args: {
    goalId: v.id('crm_coaching_goals'),
    currentValue: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Update current value, add check-in, recalculate progress %
  },
});

export const updateGoalStatus = mutation({
  args: {
    goalId: v.id('crm_coaching_goals'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    // Change status (achieved, missed, cancelled)
  },
});


// --- Feedback ---
export const giveFeedback = mutation({
  args: {
    chatterId: v.id('crm_chatters'),
    type: v.string(),
    content: v.string(),
    title: v.optional(v.string()),
    category: v.optional(v.string()),
    visibility: v.string(),
    feedbackDate: v.optional(v.number()),
    relatedCreatorId: v.optional(v.id('crm_creators')),
  },
  handler: async (ctx, args) => {
    // Create feedback entry
  },
});

export const acknowledgeFeedback = mutation({
  args: {
    feedbackId: v.id('crm_coaching_feedback'),
    response: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Chatter acknowledges feedback, optionally responds
  },
});


// --- PIPs ---
export const createPIP = mutation({
  args: {
    chatterId: v.id('crm_chatters'),
    title: v.string(),
    reason: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    requirements: v.array(v.object({
      description: v.string(),
      targetValue: v.optional(v.number()),
    })),
    milestones: v.array(v.object({
      title: v.string(),
      dueDate: v.number(),
    })),
    visibility: v.string(),
  },
  handler: async (ctx, args) => {
    // Create PIP in draft status
  },
});

export const activatePIP = mutation({
  args: { pipId: v.id('crm_coaching_pips') },
  handler: async (ctx, args) => {
    // Move from draft to active
  },
});

export const addPIPCheckIn = mutation({
  args: {
    pipId: v.id('crm_coaching_pips'),
    notes: v.string(),
    overallProgress: v.string(),
    requirementUpdates: v.optional(v.array(v.object({
      id: v.string(),
      currentValue: v.optional(v.number()),
      met: v.optional(v.boolean()),
      notes: v.optional(v.string()),
    }))),
    milestoneUpdates: v.optional(v.array(v.object({
      id: v.string(),
      status: v.string(),
      notes: v.optional(v.string()),
    }))),
  },
  handler: async (ctx, args) => {
    // Add check-in, update requirements/milestones
  },
});

export const completePIP = mutation({
  args: {
    pipId: v.id('crm_coaching_pips'),
    status: v.string(), // completed or failed
    outcome: v.string(),
  },
  handler: async (ctx, args) => {
    // Close PIP with outcome
  },
});

export const chatterAcknowledgePIP = mutation({
  args: {
    pipId: v.id('crm_coaching_pips'),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Chatter acknowledges PIP
  },
});


// --- Training ---
export const createTrainingMaterial = mutation({
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    type: v.string(),
    category: v.string(),
    url: v.optional(v.string()),
    content: v.optional(v.string()),
    estimatedMinutes: v.optional(v.number()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    // Create training material
  },
});

export const assignTraining = mutation({
  args: {
    chatterId: v.id('crm_chatters'),
    materialId: v.id('crm_training_materials'),
    priority: v.string(),
    dueDate: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Assign material to chatter
  },
});

export const bulkAssignTraining = mutation({
  args: {
    chatterIds: v.array(v.id('crm_chatters')),
    materialId: v.id('crm_training_materials'),
    priority: v.string(),
    dueDate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Assign to multiple chatters
  },
});

export const startTraining = mutation({
  args: { assignmentId: v.id('crm_training_assignments') },
  handler: async (ctx, args) => {
    // Mark as in_progress
  },
});

export const completeTraining = mutation({
  args: {
    assignmentId: v.id('crm_training_assignments'),
    score: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Mark completed, record score if quiz
  },
});
```

### Coaching Engine (`lib/coaching-engine.ts`)

```typescript
// ============ GOAL HELPERS ============

export type GoalMetric = 
  | 'response_time' 
  | 'earnings' 
  | 'messages_handled'
  | 'vip_retention'
  | 'shift_hours'
  | 'ppv_sales'
  | 'tip_amount'
  | 'custom';

export interface SMARTGoal {
  specific: string;      // Clear description
  measurable: boolean;   // Has numeric target
  achievable: boolean;   // Within reasonable range
  relevant: string;      // How it connects to role
  timeBound: boolean;    // Has deadline
}

export function calculateGoalProgress(
  current: number,
  target: number,
  start: number
): number {
  if (target === start) return 100;
  const progress = ((current - start) / (target - start)) * 100;
  return Math.min(100, Math.max(0, Math.round(progress)));
}

export function getGoalStatus(
  progress: number,
  periodEnd: number
): 'on_track' | 'at_risk' | 'behind' {
  const now = Date.now();
  const timeProgress = (now - Date.now()) / (periodEnd - Date.now()) * 100;
  
  if (progress >= timeProgress) return 'on_track';
  if (progress >= timeProgress * 0.7) return 'at_risk';
  return 'behind';
}

export function formatGoalDeadline(periodEnd: number): string {
  const days = Math.ceil((periodEnd - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'Overdue';
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days <= 7) return `${days} days left`;
  return `${Math.ceil(days / 7)} weeks left`;
}


// ============ PIP HELPERS ============

export type PIPStatus = 'draft' | 'active' | 'completed' | 'extended' | 'failed' | 'cancelled';

export interface PIPProgress {
  requirementsMet: number;
  requirementsTotal: number;
  milestonesMet: number;
  milestonesTotal: number;
  daysRemaining: number;
  overallHealth: 'on_track' | 'needs_attention' | 'off_track';
}

export function calculatePIPProgress(pip: any): PIPProgress {
  const requirementsMet = pip.requirements.filter((r: any) => r.met).length;
  const milestonesMet = pip.milestones.filter((m: any) => m.status === 'met').length;
  const daysRemaining = Math.ceil((pip.endDate - Date.now()) / (1000 * 60 * 60 * 24));
  
  // Determine health based on progress vs time
  const progressPercent = (requirementsMet + milestonesMet) / 
    (pip.requirements.length + pip.milestones.length) * 100;
  const timePercent = (Date.now() - pip.startDate) / (pip.endDate - pip.startDate) * 100;
  
  let overallHealth: 'on_track' | 'needs_attention' | 'off_track';
  if (progressPercent >= timePercent) overallHealth = 'on_track';
  else if (progressPercent >= timePercent * 0.7) overallHealth = 'needs_attention';
  else overallHealth = 'off_track';
  
  return {
    requirementsMet,
    requirementsTotal: pip.requirements.length,
    milestonesMet,
    milestonesTotal: pip.milestones.length,
    daysRemaining,
    overallHealth,
  };
}


// ============ FEEDBACK HELPERS ============

export type FeedbackType = 'praise' | 'constructive' | 'observation' | 'warning';

export interface FeedbackSummary {
  praise: number;
  constructive: number;
  observation: number;
  warning: number;
  last30Days: number;
  trend: 'improving' | 'stable' | 'declining';
}

export function calculateFeedbackTrend(
  recentPraise: number,
  recentConstructive: number,
  olderPraise: number,
  olderConstructive: number
): 'improving' | 'stable' | 'declining' {
  const recentRatio = recentPraise / (recentConstructive || 1);
  const olderRatio = olderPraise / (olderConstructive || 1);
  
  if (recentRatio > olderRatio * 1.2) return 'improving';
  if (recentRatio < olderRatio * 0.8) return 'declining';
  return 'stable';
}


// ============ TRAINING HELPERS ============

export interface TrainingProgress {
  assigned: number;
  inProgress: number;
  completed: number;
  overdue: number;
  completionRate: number;
}

export function calculateTrainingProgress(assignments: any[]): TrainingProgress {
  const now = Date.now();
  
  const assigned = assignments.filter(a => a.status === 'assigned').length;
  const inProgress = assignments.filter(a => a.status === 'in_progress').length;
  const completed = assignments.filter(a => a.status === 'completed').length;
  const overdue = assignments.filter(a => 
    a.dueDate && a.dueDate < now && a.status !== 'completed'
  ).length;
  
  const total = assignments.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  
  return { assigned, inProgress, completed, overdue, completionRate };
}


// ============ COACHING PROFILE ============

export interface ChatterCoachingProfile {
  // Meetings
  totalMeetings: number;
  lastMeetingDate: number | null;
  pendingActionItems: number;
  upcomingFollowUp: number | null;
  
  // Goals
  activeGoals: number;
  goalsAchieved: number;
  goalsMissed: number;
  
  // Feedback
  feedbackSummary: FeedbackSummary;
  
  // Training
  trainingProgress: TrainingProgress;
  
  // PIP
  hasActivePIP: boolean;
  pipProgress: PIPProgress | null;
}
```

---

## Phase 9B: 1:1 Meeting Notes (2h)

### Goal
Easy logging and tracking of 1:1 meetings with action items and follow-ups.

### Route: `/coaching/meetings`

### Meeting List View

```
┌───────────────────────────────────────────────────────────────────┐
│ 📋 1:1 Meetings                             [+ Schedule Meeting]  │
├───────────────────────────────────────────────────────────────────┤
│ Filter: [All Chatters ▼] [All Types ▼]     [📅 This Month]       │
├───────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Alice Chen          Feb 5, 2026 • 1:1                   │   │
│ │ Performance review - discussed Q1 goals                     │   │
│ │ ⬜ 2 action items  •  📅 Follow-up: Feb 12                 │   │
│ │                                          [View] [Edit]      │   │
│ └─────────────────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Bob Martinez        Feb 3, 2026 • PIP Check-in          │   │
│ │ Week 2 of PIP - showing improvement                         │   │
│ │ ✅ 3/3 action items  •  ✅ Follow-up completed              │   │
│ │                                          [View] [Edit]      │   │
│ └─────────────────────────────────────────────────────────────┘   │
├───────────────────────────────────────────────────────────────────┤
│ 📌 PENDING FOLLOW-UPS                                [View All]  │
│ • Alice Chen - Due Feb 12 (in 5 days)                            │
│ • Carol Davis - Due Feb 8 (in 1 day) ⚠️                          │
└───────────────────────────────────────────────────────────────────┘
```

### New Meeting Form

```
┌───────────────────────────────────────────────────────────────────┐
│ 📝 Log 1:1 Meeting                                    [✕]        │
├───────────────────────────────────────────────────────────────────┤
│ Chatter:     [Alice Chen ▼]                                      │
│ Date:        [Feb 7, 2026] [2:00 PM]                             │
│ Type:        [1:1] [Review] [PIP] [Onboard] [Exit]               │
│ Duration:    [30 min ▼]                                          │
├───────────────────────────────────────────────────────────────────┤
│ Agenda (optional):                                               │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ - Review last week's performance                            │  │
│ │ - Discuss VIP handling feedback                             │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ Meeting Notes:                                                   │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ Discussed response time improvements. Alice has reduced     │  │
│ │ avg from 12min to 8min. VIP handling is strong.            │  │
│ │                                                             │  │
│ │ Areas to work on:                                           │  │
│ │ - PPV close rate (currently 15%, target 25%)                │  │
│ │ - Night shift coverage...                                   │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ 🔒 Private Notes (supervisor only):                              │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ Consider for team lead role if improvement continues        │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ ACTION ITEMS                                           [+ Add]   │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ ⬜ Review PPV training video        [Alice ▼] Due: Feb 10   │  │
│ │ ⬜ Share VIP handling tips doc      [Me ▼]    Due: Feb 8    │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ Follow-up:   [📅 Feb 14, 2026]                                   │
│ Follow-up notes: [Discuss PPV progress]                          │
├───────────────────────────────────────────────────────────────────┤
│                           [Cancel]  [Save Meeting]               │
└───────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `MeetingsList.tsx` | Paginated meeting list with filters |
| `MeetingCard.tsx` | Single meeting preview card |
| `MeetingForm.tsx` | Create/edit meeting form |
| `ActionItemsList.tsx` | Checkable action items with assignee |
| `FollowUpBanner.tsx` | Pending follow-ups alert |
| `MeetingDetail.tsx` | Full meeting view |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/coaching/meetings/page.tsx` | Meetings list page |
| `app/(crm)/coaching/meetings/[id]/page.tsx` | Meeting detail |
| `app/(crm)/coaching/meetings/new/page.tsx` | New meeting form |
| `components/coaching/MeetingsList.tsx` | List component |
| `components/coaching/MeetingCard.tsx` | Card component |
| `components/coaching/MeetingForm.tsx` | Form component |
| `components/coaching/ActionItemsList.tsx` | Action items |
| `components/coaching/FollowUpBanner.tsx` | Follow-up alerts |

---

## Phase 9C: Performance Goals (SMART) (2h)

### Goal
Set and track measurable performance goals using SMART framework.

### Route: `/coaching/goals`

### Goals Dashboard

```
┌───────────────────────────────────────────────────────────────────┐
│ 🎯 Performance Goals                              [+ New Goal]   │
├───────────────────────────────────────────────────────────────────┤
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐    │
│ │ Active Goals │ On Track     │ At Risk      │ Achieved     │    │
│ │      12      │      8       │      3       │      24      │    │
│ └──────────────┴──────────────┴──────────────┴──────────────┘    │
├───────────────────────────────────────────────────────────────────┤
│ Filter: [All Chatters ▼] [Active ▼] [All Metrics ▼]              │
├───────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Alice Chen                                               │   │
│ │ ┌───────────────────────────────────────────────────────┐   │   │
│ │ │ 📉 Reduce avg response time to < 5 min                │   │   │
│ │ │ Progress: ████████████░░░░░░░░ 65% (8min → 5.6min)    │   │   │
│ │ │ 🟢 On track • Due: Feb 28 (21 days)                   │   │   │
│ │ └───────────────────────────────────────────────────────┘   │   │
│ │ ┌───────────────────────────────────────────────────────┐   │   │
│ │ │ 💰 Hit $5,000 monthly earnings                        │   │   │
│ │ │ Progress: ████████░░░░░░░░░░░░ 40% ($2,000 / $5,000)  │   │   │
│ │ │ 🟡 At risk • Due: Feb 28 (21 days)                    │   │   │
│ │ └───────────────────────────────────────────────────────┘   │   │
│ └─────────────────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Bob Martinez                                             │   │
│ │ ┌───────────────────────────────────────────────────────┐   │   │
│ │ │ 📊 Handle 50+ VIP conversations                       │   │   │
│ │ │ Progress: ██████████████████░░ 90% (45/50)            │   │   │
│ │ │ 🟢 On track • Due: Feb 14 (7 days)                    │   │   │
│ │ └───────────────────────────────────────────────────────┘   │   │
│ └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### Goal Creation Form

```
┌───────────────────────────────────────────────────────────────────┐
│ 🎯 Set New Goal                                       [✕]        │
├───────────────────────────────────────────────────────────────────┤
│ Chatter:     [Alice Chen ▼]                                      │
├───────────────────────────────────────────────────────────────────┤
│ Goal Title:  [Reduce response time to under 5 minutes        ]   │
│ Description: [Focus on VIP messages, aim for < 3min for VIPs]    │
├───────────────────────────────────────────────────────────────────┤
│ MEASUREMENT                                                      │
│ Type:        [⏱️ Response Time ▼]                                │
│              [Custom] [Earnings] [Messages] [Hours] [VIP] [PPV]  │
│                                                                  │
│ Current:     [8] minutes (auto-filled from data)                │
│ Target:      [5] minutes                                        │
├───────────────────────────────────────────────────────────────────┤
│ TIMEFRAME                                                        │
│ Start:       [Feb 7, 2026]                                       │
│ End:         [Feb 28, 2026]                                      │
├───────────────────────────────────────────────────────────────────┤
│ VISIBILITY                                                       │
│ [🔒 Private] [👥 Shared with chatter] [👁️ Team visible]         │
├───────────────────────────────────────────────────────────────────┤
│ ✅ SMART Check:                                                  │
│ ✓ Specific: Clear target defined                                │
│ ✓ Measurable: Numeric goal with tracking                        │
│ ✓ Achievable: Within historical range                           │
│ ✓ Relevant: Ties to response quality KPI                        │
│ ✓ Time-bound: 3-week deadline set                               │
├───────────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Create Goal]             │
└───────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `GoalsDashboard.tsx` | Overview with stats cards |
| `GoalsList.tsx` | Grouped by chatter with progress bars |
| `GoalCard.tsx` | Single goal with visual progress |
| `GoalForm.tsx` | SMART goal creation form |
| `GoalProgressModal.tsx` | Update progress, add check-in |
| `GoalHistory.tsx` | Historical check-ins and notes |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/coaching/goals/page.tsx` | Goals dashboard |
| `app/(crm)/coaching/goals/[id]/page.tsx` | Goal detail |
| `app/(crm)/coaching/goals/new/page.tsx` | Create goal |
| `components/coaching/GoalsDashboard.tsx` | Dashboard |
| `components/coaching/GoalsList.tsx` | List component |
| `components/coaching/GoalCard.tsx` | Card with progress bar |
| `components/coaching/GoalForm.tsx` | Creation form |
| `components/coaching/GoalProgressModal.tsx` | Progress update |

---

## Phase 9D: Feedback & Praise System (2h)

### Goal
Log and track feedback (praise, constructive, warnings) with visibility controls.

### Route: `/coaching/feedback`

### Feedback Timeline

```
┌───────────────────────────────────────────────────────────────────┐
│ 💬 Feedback Log                                  [+ Give Feedback]│
├───────────────────────────────────────────────────────────────────┤
│ Filter: [All Chatters ▼] [All Types ▼]    [🔍 Search...]         │
│ Types:  [All] [🌟 Praise] [💡 Constructive] [👁️ Observation] [⚠️]│
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ Feb 7, 2026                                                       │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 🌟 PRAISE                                          👤 Alice │   │
│ │ "Excellent VIP handling this week"                          │   │
│ │ ───────────────────────────────────────────                 │   │
│ │ Handled @BigSpender perfectly - converted $500 PPV.         │   │
│ │ Response time under 2 min. Great work!                      │   │
│ │                                                             │   │
│ │ 📁 Fan Handling  •  👁️ Shared  •  ✅ Acknowledged          │   │
│ │                                            [Edit] [Delete]  │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│ Feb 5, 2026                                                       │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 💡 CONSTRUCTIVE                                     👤 Bob  │   │
│ │ "Night shift coverage gaps"                                 │   │
│ │ ───────────────────────────────────────────                 │   │
│ │ Noticed several VIPs weren't responded to between 2-4 AM.   │   │
│ │ Please ensure you're checking queue during night shifts.    │   │
│ │                                                             │   │
│ │ 📁 Reliability  •  👥 Team  •  ⏳ Pending acknowledgment    │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Give Feedback Modal

```
┌───────────────────────────────────────────────────────────────────┐
│ 💬 Give Feedback                                      [✕]        │
├───────────────────────────────────────────────────────────────────┤
│ Chatter:     [Bob Martinez ▼]                                    │
├───────────────────────────────────────────────────────────────────┤
│ Type:                                                            │
│ [🌟 Praise] [💡 Constructive] [👁️ Observation] [⚠️ Warning]     │
├───────────────────────────────────────────────────────────────────┤
│ Title (optional):                                                │
│ [Great upsell on PPV                                         ]   │
├───────────────────────────────────────────────────────────────────┤
│ Feedback:                                                        │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ Noticed your conversation with @FanName - great job        │  │
│ │ building rapport before the PPV offer. The casual "btw     │  │
│ │ I have something special for you" approach worked well.    │  │
│ │ Keep it up!                                                │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ Category:    [Sales Techniques ▼]                                │
│ Creator:     [Luna (optional) ▼]                                 │
│ Date:        [Feb 7, 2026] (defaults to today)                   │
├───────────────────────────────────────────────────────────────────┤
│ Visibility:                                                      │
│ [🔒 Private file] [👤 Share with chatter] [👥 Team visible]      │
├───────────────────────────────────────────────────────────────────┤
│                           [Cancel]  [Submit Feedback]            │
└───────────────────────────────────────────────────────────────────┘
```

### Chatter Feedback View (their perspective)

```
┌───────────────────────────────────────────────────────────────────┐
│ 📬 Your Feedback                                                 │
├───────────────────────────────────────────────────────────────────┤
│ SUMMARY                                                          │
│ ┌─────────┬─────────┬─────────┬─────────┐                        │
│ │ 🌟 12   │ 💡 3    │ 👁️ 5    │ ⚠️ 0    │                        │
│ │ Praise  │ Constr. │ Notes   │ Warnings│  📈 Improving          │
│ └─────────┴─────────┴─────────┴─────────┘                        │
├───────────────────────────────────────────────────────────────────┤
│ ⏳ PENDING ACKNOWLEDGMENT (1)                                    │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ 💡 Night shift coverage gaps - Feb 5                        │  │
│ │ [Read & Acknowledge]                                        │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ RECENT FEEDBACK                                                  │
│ ... (timeline view) ...                                          │
└───────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `FeedbackTimeline.tsx` | Chronological feedback list |
| `FeedbackCard.tsx` | Single feedback entry |
| `GiveFeedbackModal.tsx` | Create feedback form |
| `FeedbackSummaryCards.tsx` | Type counts + trend |
| `AcknowledgeFeedbackModal.tsx` | Chatter acknowledgment |
| `ChatterFeedbackView.tsx` | Chatter's perspective |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/coaching/feedback/page.tsx` | Feedback timeline |
| `app/(crm)/coaching/feedback/mine/page.tsx` | Chatter's own feedback |
| `components/coaching/FeedbackTimeline.tsx` | Timeline |
| `components/coaching/FeedbackCard.tsx` | Card |
| `components/coaching/GiveFeedbackModal.tsx` | Create form |
| `components/coaching/FeedbackSummaryCards.tsx` | Stats |
| `components/coaching/AcknowledgeFeedbackModal.tsx` | Acknowledge UI |

---

## Phase 9E: Training Materials & PIPs (2h)

### Goal
Training content library with assignments, plus PIP workflow for underperformers.

### Route: `/coaching/training` and `/coaching/pips`

### Training Library

```
┌───────────────────────────────────────────────────────────────────┐
│ 📚 Training Materials                         [+ Add Material]   │
├───────────────────────────────────────────────────────────────────┤
│ Filter: [All Categories ▼] [All Types ▼]   [🔍 Search...]        │
├───────────────────────────────────────────────────────────────────┤
│                                                                   │
│ 📂 ONBOARDING                                                    │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 📹 Platform Overview Video           15 min  •  Required    │   │
│ │ 📄 Chat Guidelines & Rules           10 min  •  Required    │   │
│ │ 📹 PPV Pricing Strategies            20 min  •  Recommended │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
│ 📂 SALES TECHNIQUES                                              │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 📹 Upselling 101                     25 min  •  Recommended │   │
│ │ 📄 PPV Message Templates             5 min   •  Optional    │   │
│ │ 🧪 Sales Quiz                        10 min  •  Required    │   │
│ └─────────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Assign Training

```
┌───────────────────────────────────────────────────────────────────┐
│ 📚 Assign Training                                    [✕]        │
├───────────────────────────────────────────────────────────────────┤
│ Material:    PPV Pricing Strategies (20 min)                     │
├───────────────────────────────────────────────────────────────────┤
│ Assign to:   [Select chatters...]                                │
│              ☑️ Alice Chen                                       │
│              ☑️ Bob Martinez                                     │
│              ☐ Carol Davis                                       │
├───────────────────────────────────────────────────────────────────┤
│ Priority:    [Required] [Recommended] [Optional]                 │
│ Due date:    [Feb 14, 2026]                                      │
│ Reason:      [Based on PPV performance review              ]     │
├───────────────────────────────────────────────────────────────────┤
│                           [Cancel]  [Assign Training]            │
└───────────────────────────────────────────────────────────────────┘
```

### Chatter Training View

```
┌───────────────────────────────────────────────────────────────────┐
│ 📚 My Training                                                   │
├───────────────────────────────────────────────────────────────────┤
│ ┌─────────────┬─────────────┬─────────────┬─────────────┐        │
│ │ Assigned    │ In Progress │ Completed   │ Overdue     │        │
│ │     3       │      1      │      8      │     0       │        │
│ └─────────────┴─────────────┴─────────────┴─────────────┘        │
├───────────────────────────────────────────────────────────────────┤
│ ⏳ TO COMPLETE                                                   │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ 📹 PPV Pricing Strategies                                   │  │
│ │ Due: Feb 14  •  Required  •  20 min                         │  │
│ │ Reason: Based on PPV performance review                     │  │
│ │                                    [Start] [Mark Complete]  │  │
│ └─────────────────────────────────────────────────────────────┘  │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ 🧪 Sales Quiz                        ⏸️ In Progress         │  │
│ │ Due: Feb 10  •  Required  •  10 min  •  Attempt 1           │  │
│ │                                        [Continue] [Restart] │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ ✅ COMPLETED (8)                                   [View All]    │
│ ...                                                              │
└───────────────────────────────────────────────────────────────────┘
```

### PIP Management

```
┌───────────────────────────────────────────────────────────────────┐
│ 📋 Performance Improvement Plans                      [+ New PIP]│
├───────────────────────────────────────────────────────────────────┤
│ Active PIPs: 2   |   Completed: 5   |   Success Rate: 80%        │
├───────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Bob Martinez                               🟡 Active     │   │
│ │ "Response Time Improvement Plan"                            │   │
│ │ ───────────────────────────────────────────                 │   │
│ │ Started: Jan 20  •  Ends: Feb 20  •  21 days remaining      │   │
│ │                                                             │   │
│ │ Requirements: ██████████░░░░░░░░░░ 2/4 met                  │   │
│ │ Milestones:   ████████████████░░░░ 2/3 met                  │   │
│ │                                                             │   │
│ │ Last check-in: Feb 3 - "Needs attention"                    │   │
│ │                                                             │   │
│ │                    [View Details] [Add Check-in]            │   │
│ └─────────────────────────────────────────────────────────────┘   │
│ ┌─────────────────────────────────────────────────────────────┐   │
│ │ 👤 Carol Davis                                🟢 Active     │   │
│ │ "Attendance & Shift Coverage Plan"                          │   │
│ │ ───────────────────────────────────────────                 │   │
│ │ Started: Feb 1  •  Ends: Mar 1  •  22 days remaining        │   │
│ │                                                             │   │
│ │ Requirements: ████████░░░░░░░░░░░░ 1/3 met                  │   │
│ │ Milestones:   ████░░░░░░░░░░░░░░░░ 1/4 met                  │   │
│ │                                                             │   │
│ │ Last check-in: Feb 5 - "On track"                           │   │
│ │                                                             │   │
│ │                    [View Details] [Add Check-in]            │   │
│ └─────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────┘
```

### PIP Detail View

```
┌───────────────────────────────────────────────────────────────────┐
│ 📋 PIP: Response Time Improvement Plan                           │
│ 👤 Bob Martinez                                                  │
├───────────────────────────────────────────────────────────────────┤
│ Status: 🟡 Active (Needs Attention)                              │
│ Duration: Jan 20 - Feb 20 (30 days)  •  21 days remaining        │
├───────────────────────────────────────────────────────────────────┤
│ REASON FOR PIP                                                   │
│ Consistent failure to meet response time SLAs over past 3 weeks. │
│ VIP messages averaging 15+ minutes response time.                │
├───────────────────────────────────────────────────────────────────┤
│ REQUIREMENTS                                              2/4    │
│ ✅ Reduce VIP response time to < 5 min (Current: 4.2 min)        │
│ ✅ Complete response time training module                        │
│ ⬜ Maintain < 10 min avg for all fans (Current: 12.3 min)        │
│ ⬜ Zero SLA breaches for 7 consecutive days (Current: 5 days)    │
├───────────────────────────────────────────────────────────────────┤
│ MILESTONES                                                2/3    │
│ ✅ Week 1 (Jan 27): Complete training - MET                      │
│ ✅ Week 2 (Feb 3): VIP response < 8 min - MET                    │
│ ⬜ Week 3 (Feb 10): All targets met - PENDING                    │
├───────────────────────────────────────────────────────────────────┤
│ CHECK-IN HISTORY                                   [+ Check-in]  │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ Feb 3, 2026 - 🟡 Needs Attention                            │  │
│ │ VIP target met, but overall average still high. Bob         │  │
│ │ struggling with night shift volume. Suggested batching.     │  │
│ ├─────────────────────────────────────────────────────────────┤  │
│ │ Jan 27, 2026 - 🟢 On Track                                  │  │
│ │ Training completed. Initial improvement seen. Continue      │  │
│ │ monitoring.                                                 │  │
│ └─────────────────────────────────────────────────────────────┘  │
├───────────────────────────────────────────────────────────────────┤
│ SUPPORT PROVIDED                                                 │
│ - Assigned response time training module                         │
│ - Weekly 1:1 check-ins                                           │
│ - Paired with Alice for VIP handling tips                        │
├───────────────────────────────────────────────────────────────────┤
│ CHATTER ACKNOWLEDGMENT                                           │
│ ✅ Acknowledged on Jan 21, 2026                                  │
│ "I understand and will work on improving my response times."     │
├───────────────────────────────────────────────────────────────────┤
│        [Edit PIP]  [Extend Deadline]  [Complete PIP]             │
└───────────────────────────────────────────────────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| `TrainingLibrary.tsx` | Material catalog with categories |
| `TrainingMaterialCard.tsx` | Single material preview |
| `TrainingMaterialForm.tsx` | Create/edit material |
| `AssignTrainingModal.tsx` | Assign to chatters |
| `ChatterTrainingList.tsx` | Chatter's assignments |
| `TrainingProgressBar.tsx` | Completion visualization |
| `PIPList.tsx` | Active PIPs list |
| `PIPCard.tsx` | PIP summary card |
| `PIPDetail.tsx` | Full PIP view |
| `PIPForm.tsx` | Create/edit PIP |
| `PIPCheckInModal.tsx` | Add check-in |
| `PIPMilestoneTracker.tsx` | Visual milestone progress |

### Files

| File | Purpose |
|------|---------|
| `app/(crm)/coaching/training/page.tsx` | Training library |
| `app/(crm)/coaching/training/mine/page.tsx` | My assignments |
| `app/(crm)/coaching/training/[id]/page.tsx` | Material detail |
| `app/(crm)/coaching/pips/page.tsx` | PIP list |
| `app/(crm)/coaching/pips/[id]/page.tsx` | PIP detail |
| `app/(crm)/coaching/pips/new/page.tsx` | Create PIP |
| `components/coaching/TrainingLibrary.tsx` | Library view |
| `components/coaching/TrainingMaterialCard.tsx` | Card |
| `components/coaching/AssignTrainingModal.tsx` | Assign UI |
| `components/coaching/PIPList.tsx` | PIP list |
| `components/coaching/PIPCard.tsx` | PIP card |
| `components/coaching/PIPDetail.tsx` | Full detail |
| `components/coaching/PIPForm.tsx` | Create form |
| `components/coaching/PIPCheckInModal.tsx` | Check-in |

---

## Navigation Updates

### Sidebar Addition

```typescript
// Add to sidebar nav
{
  label: 'Coaching',
  icon: Users,
  href: '/coaching',
  role: ['supervisor', 'admin'],
  children: [
    { label: 'Overview', href: '/coaching' },
    { label: '1:1 Meetings', href: '/coaching/meetings' },
    { label: 'Goals', href: '/coaching/goals' },
    { label: 'Feedback', href: '/coaching/feedback' },
    { label: 'Training', href: '/coaching/training' },
    { label: 'PIPs', href: '/coaching/pips', role: ['supervisor', 'admin'] },
  ],
}

// For chatters (limited view)
{
  label: 'My Development',
  icon: TrendingUp,
  href: '/coaching/mine',
  children: [
    { label: 'My Goals', href: '/coaching/goals/mine' },
    { label: 'My Feedback', href: '/coaching/feedback/mine' },
    { label: 'My Training', href: '/coaching/training/mine' },
  ],
}
```

### Coaching Hub Home (`/coaching`)

```
┌───────────────────────────────────────────────────────────────────┐
│ 🎯 Coaching Hub                                                  │
├───────────────────────────────────────────────────────────────────┤
│ ┌───────────────────┬───────────────────┬───────────────────┐    │
│ │ 📋 Meetings       │ 🎯 Goals          │ 💬 Feedback       │    │
│ │ 3 this week       │ 12 active         │ 5 pending ack     │    │
│ │ 2 follow-ups due  │ 3 at risk         │ 18 this month     │    │
│ └───────────────────┴───────────────────┴───────────────────┘    │
│ ┌───────────────────┬───────────────────┐                        │
│ │ 📚 Training       │ 📋 PIPs           │                        │
│ │ 8 assigned        │ 2 active          │                        │
│ │ 2 overdue         │ 80% success rate  │                        │
│ └───────────────────┴───────────────────┘                        │
├───────────────────────────────────────────────────────────────────┤
│ TEAM OVERVIEW                                                    │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ 👤 Chatter        Goals  Feedback  Training   Status        │  │
│ │ ───────────────────────────────────────────────────────────│  │
│ │ Alice Chen        2 ✅    🌟 12     ✅ 100%    🟢 Strong    │  │
│ │ Bob Martinez      1 🟡    💡 3      ⏳ 80%     🟡 PIP       │  │
│ │ Carol Davis       2 ✅    🌟 8      ✅ 90%     🟢 Good      │  │
│ │ David Kim         0 ⚪    💡 2      ⏳ 50%     🟡 New       │  │
│ └─────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

---

## Testing Checklist

### Phase 9A (Schema & Functions)
- [ ] Schema migrates without errors
- [ ] All CRUD operations work for meetings, goals, feedback, PIPs, training
- [ ] Indexes perform well on filtered queries
- [ ] Role-based query filtering works

### Phase 9B (Meetings)
- [ ] Create meeting with action items
- [ ] Complete action items individually
- [ ] Set and complete follow-ups
- [ ] Private notes only visible to supervisor
- [ ] Filter by chatter, type, date range

### Phase 9C (Goals)
- [ ] Create SMART goal with metrics
- [ ] Progress calculation correct
- [ ] Auto-update status on deadline
- [ ] Check-in history logged
- [ ] Visibility settings respected

### Phase 9D (Feedback)
- [ ] Give praise, constructive, warning feedback
- [ ] Visibility controls work
- [ ] Chatter acknowledgment flow works
- [ ] Feedback trend calculation correct
- [ ] Category filtering works

### Phase 9E (Training & PIPs)
- [ ] Create training material (all types)
- [ ] Assign to single/multiple chatters
- [ ] Track completion with scores
- [ ] Create PIP with requirements and milestones
- [ ] Add check-ins with progress updates
- [ ] Complete PIP with outcome

### Integration
- [ ] Role checks: chatter sees own data, supervisor sees all
- [ ] Coaching profile aggregates all modules
- [ ] Build passes (0 TS errors)
- [ ] Sidebar nav added
- [ ] Mobile responsive

---

## Acceptance Criteria

- [ ] Supervisors can log 1:1 meetings with action items
- [ ] Follow-up reminders visible on dashboard
- [ ] SMART goals trackable with progress visualization
- [ ] Feedback timeline with praise/constructive balance
- [ ] Chatters can view and acknowledge shared feedback
- [ ] Training library with assignment tracking
- [ ] PIP workflow with milestones and check-ins
- [ ] Coaching profile aggregates all data per chatter
- [ ] TypeScript 0 errors
- [ ] `npm run build` clean
- [ ] Mobile-friendly forms

---

## Files Summary

### Convex
| File | Tables |
|------|--------|
| `convex/schema.ts` | +6 tables (meetings, goals, feedback, pips, materials, assignments) |
| `convex/crm/coaching.ts` | All queries and mutations |

### Library
| File | Purpose |
|------|---------|
| `lib/coaching-engine.ts` | Helper functions for progress, trends, profiles |

### Pages
| Route | Purpose |
|-------|---------|
| `/coaching` | Hub overview |
| `/coaching/meetings` | Meeting list |
| `/coaching/meetings/[id]` | Meeting detail |
| `/coaching/meetings/new` | Create meeting |
| `/coaching/goals` | Goals dashboard |
| `/coaching/goals/[id]` | Goal detail |
| `/coaching/goals/new` | Create goal |
| `/coaching/feedback` | Feedback timeline |
| `/coaching/feedback/mine` | Chatter's feedback |
| `/coaching/training` | Training library |
| `/coaching/training/[id]` | Material detail |
| `/coaching/training/mine` | My assignments |
| `/coaching/pips` | PIP list |
| `/coaching/pips/[id]` | PIP detail |
| `/coaching/pips/new` | Create PIP |

### Components (20+)
- Meeting components (5)
- Goal components (6)
- Feedback components (6)
- Training components (5)
- PIP components (6)

---

## Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| 1:1 meeting frequency | Weekly per chatter | Count meetings / chatter / week |
| Goal completion rate | > 70% | Achieved / (achieved + missed) |
| Feedback ratio | 3:1 praise:constructive | Count by type |
| Training completion | > 90% on-time | Completed before due / assigned |
| PIP success rate | > 75% | Completed / (completed + failed) |

---

## Future Enhancements (Out of Scope)

- [ ] Calendar integration (sync 1:1s with Google/Outlook)
- [ ] Automated goal progress updates (pull from metrics)
- [ ] 360° feedback (peer-to-peer)
- [ ] Learning management system (LMS) integration
- [ ] Performance review cycles (quarterly/annual)
- [ ] Succession planning module
- [ ] Team health surveys
- [ ] AI coaching suggestions based on performance data

---

*End of Phase 9 Spec*
