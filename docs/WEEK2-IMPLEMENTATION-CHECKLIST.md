# Week 2 Implementation Checklist

**Planning Date:** 2026-02-07  
**Sprint Duration:** Feb 7-13, 2026  
**Focus:** Phase 5D (Targets & Bonuses) + Smart Reply Suggestions (Quick Win)

---

## 📊 Week 1 Completion Summary

### Shipped (19,370+ lines)
- ✅ Phase 1: MVP (PIN auth, clock in/out, sales reports)
- ✅ Phase 2: Team & Scheduling (assignments, breaks, calendar)
- ✅ Phase 3: Role-Based Views (admin/supervisor/chatter dashboards)
- ✅ Phase 4: Analytics (OM API integration, revenue charts, performance)
- ✅ Phase 5A-5C: Gamification (leaderboard, 19 badges, streaks)

### Deferred
- 🔄 Phase 5D: Targets & Bonuses → **Week 2 Priority 1**
- 🔄 Smart Reply Suggestions → **Week 2 Priority 2**

---

## 🎯 Week 2 Feature Selection

| Priority | Feature | Est. Hours | ROI | Status |
|----------|---------|-----------|-----|--------|
| 🥇 P0 | **Phase 5D: Targets & Bonuses** | 32-40h | ⭐⭐⭐⭐⭐ | Ready |
| 🥈 P1 | **Smart Reply Suggestions** | 12-16h | ⭐⭐⭐⭐ | Needs Design |
| 🥉 P2 | Birthday Tracking (Phase 6) | 4h | ⭐⭐⭐ | Quick Win |

**Total Week 2 Estimate:** 48-60 hours

---

## Phase 5D: Targets & Bonuses — Detailed Checklist

### Phase 5D-1: Schema & Targets CRUD (8h)
**Goal:** Database foundation + admin target management

#### Schema (2h)
- [ ] Add `crm_weekly_targets` table
- [ ] Add `crm_target_progress` table
- [ ] Add `crm_bonuses` table
- [ ] Add `crm_holidays` table
- [ ] Add `crm_shift_bonus_tracker` table
- [ ] Add compound indexes for queries
- [ ] Deploy schema: `npx convex dev --once`

#### Backend (3h)
- [ ] `bonuses.ts`: `upsertWeeklyTarget` mutation
- [ ] `bonuses.ts`: `getWeeklyTargets` query
- [ ] `bonuses.ts`: `copyTargetsFromPreviousWeek` mutation
- [ ] `bonuses.ts`: `deleteWeeklyTarget` mutation
- [ ] Validation: target values in valid ranges

#### Frontend (3h)
- [ ] `/targets` page route (admin only)
- [ ] `TargetCard.tsx` component
- [ ] `TargetEditModal.tsx` component
- [ ] Week picker for target management
- [ ] "Copy from Last Week" button
- [ ] Empty state when no targets configured
- [ ] Mobile responsive layout

**Checkpoint:** Admin can set/edit weekly targets per creator ✓

---

### Phase 5D-2: Progress Computation Engine (8h)
**Goal:** Daily progress tracking + chatter visibility

#### Backend (5h)
- [ ] `bonusEngine.ts`: `computeTargetProgressDaily` internal action
- [ ] OM API call for chatter-creator response time
- [ ] OM API call for chatter-creator PPV unlock %
- [ ] Query sales reports for PPV sent count (by chatter-creator-week)
- [ ] Compare metrics against weekly targets
- [ ] `crm_target_progress` upsert logic
- [ ] Cron registration: daily 06:00 UTC
- [ ] `getMyTargetProgress` query (for chatters)
- [ ] `getAllTargetProgress` query (for admin)

#### Frontend (3h)
- [ ] `/my-progress` page route (chatter view)
- [ ] `ProgressCard.tsx` component
- [ ] `ProgressBar.tsx` with percentage
- [ ] ✅/⏳/❌ status badges
- [ ] Days remaining indicator
- [ ] Bonus history section
- [ ] Sidebar nav item for chatters

**Checkpoint:** Chatters see live progress toward weekly targets ✓

---

### Phase 5D-3: Bonus Generation Engine (8h)
**Goal:** Automatic bonus computation at period end

#### Backend (6h)
- [ ] `evaluateWeeklyBonuses` internal action
- [ ] Check all target progress for previous week
- [ ] Create `weekly_target` bonuses for qualifiers
- [ ] `updateShiftBonusTracker` mutation (triggered on clock-out)
- [ ] Calculate shift revenue from sales reports
- [ ] Increment $500/$750 counters
- [ ] Create `shift_500`/`shift_750` bonuses when qualified
- [ ] `computeSalesCommission` daily action
- [ ] Holiday rate detection (6% vs 3%)
- [ ] Create commission bonus records
- [ ] Weekly cron: Monday 00:00 UTC

#### Integration (2h)
- [ ] Hook shift clock-out to bonus tracker update
- [ ] Verify OM API data freshness
- [ ] Test with historical data (backfill check)

**Checkpoint:** Bonuses auto-generated correctly ✓

---

### Phase 5D-4: Approval & Payment Flow (4h)
**Goal:** Admin workflow for bonus management

#### Backend (1.5h)
- [ ] `approveBonus` mutation
- [ ] `rejectBonus` mutation with reason
- [ ] `bulkApproveBonuses` mutation
- [ ] `markBonusPaid` mutation (method + reference)
- [ ] `getPendingBonuses` query
- [ ] `getAllBonuses` query with filters

#### Frontend (2.5h)
- [ ] `/bonuses` page route (admin only)
- [ ] Status tab bar (Pending/Approved/Paid/Rejected)
- [ ] `BonusTable.tsx` with bulk select
- [ ] `BonusApprovalModal.tsx`
- [ ] `BonusPaymentModal.tsx` (USDC/USDT/Bank dropdown)
- [ ] CSV export button
- [ ] KPI cards (totals by status)

**Checkpoint:** Admin can approve/pay bonuses efficiently ✓

---

### Phase 5D-5: Ad-Hoc & Holidays (4h)
**Goal:** Manual bonus creation + holiday configuration

#### Backend (1.5h)
- [ ] `createAdHocBonus` mutation
- [ ] `upsertHoliday` mutation
- [ ] `getHolidays` query
- [ ] `getBonusSummary` query (per-chatter totals)

#### Frontend (2.5h)
- [ ] `AdHocBonusModal.tsx`
- [ ] "+ Create Ad-Hoc Bonus" button on `/bonuses`
- [ ] Holiday config section (maybe in settings)
- [ ] `HolidayConfig.tsx` component
- [ ] Bonus summary view/export by chatter

**Checkpoint:** Full bonus system operational ✓

---

## Smart Reply Suggestions — Quick Win (12h)

### Phase SR-1: Template Library & Matching (6h)
**Goal:** Rule-based template suggestions

#### Backend (4h)
- [ ] `crm_reply_templates` table (category, keywords, text)
- [ ] Seed 20+ templates from existing agency scripts
- [ ] `suggestReplies` query (input: message text)
- [ ] Keyword extraction (simple tokenizer)
- [ ] Fuzzy match against template keywords
- [ ] Return top 3-5 suggestions with confidence

#### Frontend (2h)
- [ ] Template management page (admin)
- [ ] Template CRUD UI

### Phase SR-2: Chat UI Integration (6h)
**Goal:** Suggestions appear in chat flow

#### Backend (2h)
- [ ] Hook into existing chat/message queries
- [ ] Add `suggestions` field to message response

#### Frontend (4h)
- [ ] Suggestion pills below chat input
- [ ] Click to populate input
- [ ] Dismiss button
- [ ] Keyboard shortcut (1/2/3 to select)
- [ ] Mobile: swipe to select

**Checkpoint:** Chatters see relevant reply suggestions ✓

---

## Birthday Tracking — Quick Win (4h)

### Implementation (4h)
- [ ] Add `birthday` field to `crm_chatters` schema
- [ ] Birthday input in chatter profile edit
- [ ] `getUpcomingBirthdays` query (next 30 days)
- [ ] Birthday widget on admin dashboard
- [ ] Birthday badge emoji on chatter cards
- [ ] Optional: Discord notification for birthdays

**Checkpoint:** Birthdays visible and celebrated ✓

---

## Daily Execution Plan

### Day 1 (Sat Feb 7)
- [ ] Phase 5D-1: Schema & Targets CRUD (8h)
- [ ] Verify targets page working end-to-end

### Day 2 (Sun Feb 8)
- [ ] Phase 5D-2: Progress Computation Engine (8h)
- [ ] Test with 2-3 chatters, verify progress displays

### Day 3 (Mon Feb 9)
- [ ] Phase 5D-3: Bonus Generation Engine (8h)
- [ ] Test bonus generation with mock week

### Day 4 (Tue Feb 10)
- [ ] Phase 5D-4: Approval Flow (4h)
- [ ] Phase 5D-5: Ad-Hoc & Holidays (4h)
- [ ] Full Phase 5D QC review

### Day 5 (Wed Feb 11)
- [ ] Smart Reply Phase SR-1 (6h)
- [ ] Birthday Quick Win (4h)

### Day 6 (Thu Feb 12)
- [ ] Smart Reply Phase SR-2 (6h)
- [ ] Integration testing all Week 2 features

### Day 7 (Fri Feb 13)
- [ ] Buffer: Bug fixes, polish, documentation
- [ ] Week 2 demo prep
- [ ] Week 3 planning

---

## Success Criteria

### Phase 5D
- [ ] Targets configurable per creator per week
- [ ] Chatters see real-time progress
- [ ] Bonuses auto-generate correctly
- [ ] Admin can approve/pay in <5 min
- [ ] CSV export works for payroll

### Smart Replies
- [ ] 3-5 suggestions per incoming message
- [ ] Click-to-use works smoothly
- [ ] Chatters report time savings

### Birthday
- [ ] All chatters have birthdays entered
- [ ] Upcoming birthdays visible on dashboard

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| OM API rate limits | Cache metrics locally, refresh hourly max |
| Complex bonus rules | Start with simple, iterate on edge cases |
| Smart reply accuracy | Rule-based first, ML later if needed |
| Chatter resistance to gamification | Make progress view optional, not intrusive |

---

## Dependencies

### External
- OM API credentials (already in place)
- Reply templates from Rayan/supervisors

### Internal
- Sales reports populated accurately
- Shift clock-in/out working (Phase 1 ✓)

---

**Next Concrete Step:**  
🚀 **Phase 5D-1: Schema & Targets CRUD**
- Start: Deploy schema additions
- First task: Add `crm_weekly_targets` table to `convex/schema.ts`

**Assign to:** Coding Agent  
**Estimated time:** 8 hours  
**Deadline:** End of Day 1 (Feb 7)
