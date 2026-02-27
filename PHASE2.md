# Preach CRM — Phase 2 Summary

**Built:** 2026-02-06
**Status:** ✅ Complete — build passes clean

---

## Features Delivered

### 1. Creator-Chatter Assignment UI ✅
- Admin page now shows assigned creators per team member as colored tags
- 🎯 button opens assignment modal with checkboxes for each active creator
- Uses existing `crm.chatters.update` mutation with `assignedCreators` field
- Dashboard welcome section shows "Your creators: [tags]" for logged-in user

### 2. Team Management Board ✅
- **➕ Add Member** button → modal with: name, username, PIN, role, emoji picker, hourly rate, commission %
- **✏️ Edit** button → modal to update name, role, emoji, rates
- **🔑 Reset PIN** button → modal to set new 4-6 digit PIN
- **⏸️/▶️ Toggle status** — deactivate/reactivate members with confirmation
- New Convex mutations added: `crm.chatters.resetPin`, `crm.chatters.reactivate`

### 3. Break Tracking ✅
- Schema changes: `breaks` array + `totalBreakMinutes` added to `crm_shifts`
- New Convex mutations: `crm.shifts.startBreak`, `crm.shifts.endBreak`
- `getActive` query now returns break state: `onBreak`, `currentBreakStart`, `breaks`, `totalBreakMinutes`
- Dashboard shows:
  - ☕ "Take Break" / "End Break" button alongside Clock Out
  - Break timer when on break (orange theme)
  - Shift summary: Total time, Break time, Net work time
  - Clock Out disabled during break (must end break first)

### 4. Schedule Page ✅ (`/schedule`)
- Schema: `crm_schedules` table with date, shiftType, creatorId, status, notes
- Convex functions in `crm/schedule.ts`:
  - `create`, `listByDateRange`, `listMine`, `update`, `remove`
  - `requestDayOff`, `approveDayOff`, `denyDayOff`, `getPendingRequests`
- UI features:
  - **Weekly calendar grid** — 7-day view with prev/next navigation
  - Today highlighted in green
  - Past days dimmed
  - Each entry shows: chatter emoji + name, shift type, creator, status badge
  - **Admin: + button** to add schedule entries per day (member, shift type, creator, notes)
  - **All users: 🏖️ button** to request day off per day
  - **Pending off-day requests panel** (admin/manager only) with Approve/Deny buttons
  - Color-coded status: scheduled (gold), confirmed (green), off_requested (orange), off_approved (purple), off_denied (red)
  - Shift types: Morning 🌅, Afternoon ☀️, Evening 🌙, Full Day 📅
  - Legend at bottom
  - Mobile responsive with list view fallback

### 5. Schedule Nav Link Enabled ✅
- Schedule link in sidebar changed from disabled ("soon") to active

---

## Schema Changes
- `crm_shifts`: added `breaks` (array of {startTime, endTime}) + `totalBreakMinutes`
- `crm_schedules`: new table with indexes `by_date`, `by_chatter`, `by_chatter_date`, `by_status`

## New Convex Functions
- `crm/chatters.ts`: `resetPin`, `reactivate`
- `crm/shifts.ts`: `startBreak`, `endBreak` (+ updated `getActive`)
- `crm/schedule.ts`: `create`, `listByDateRange`, `listMine`, `update`, `remove`, `requestDayOff`, `approveDayOff`, `denyDayOff`, `getPendingRequests`

## Files Modified
- `convex/schema.ts` — breaks fields + crm_schedules table
- `convex/crm/chatters.ts` — resetPin + reactivate mutations
- `convex/crm/shifts.ts` — break tracking + updated getActive
- `convex/crm/schedule.ts` — NEW: all schedule functions
- `app/(crm)/admin/page.tsx` — full rewrite: team mgmt + assignments
- `app/(crm)/dashboard/page.tsx` — break UI + assigned creators display
- `app/(crm)/schedule/page.tsx` — NEW: weekly schedule calendar
- `app/(crm)/layout.tsx` — enabled Schedule nav link
