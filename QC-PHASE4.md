# QC Review — Preach CRM Phase 4

**Reviewer:** QC (automated)
**Date:** 2026-02-06
**Scope:** Full codebase — frontend (`app/`) + Convex backend (`crm/`)

---

## ✅ Passes (What's Good)

### Architecture & Code Quality
- **Zero TypeScript errors.** `tsc --noEmit` compiles clean — no type mismatches, no unused-import errors at the compiler level.
- **Consistent coding patterns.** Every page follows the same `useState` → `localStorage` → `useQuery/useMutation` bootstrap pattern. Style objects are consistent across files.
- **Clean file layout.** Next.js App Router with `(crm)` route group works well. Auth layout wraps all protected pages centrally.
- **Shared auth helper.** Backend uses a consistent `getSessionUser()` helper in every Convex file — DRY, readable, and hard to forget.

### Auth & Security
- **Every single Convex query/mutation validates the token server-side.** No function is callable without a valid `crm_sessions` token lookup + expiry check. This is the most important security property and it holds everywhere.
- **Admin-only functions check admin role.** `chatters.create`, `chatters.update`, `chatters.resetPin`, `chatters.deactivate`, `chatters.reactivate`, `creators.create`, `creators.update` — all properly gated with `checkPermission(["admin"])` or `checkAdmin()`.
- **Role-based view filtering works.** `NAV_ITEMS` correctly filters `/performance` to admin/manager/supervisor and `/analytics` to admin/manager. Admin link rendered only for `role === "admin"`. Client-side gate + server-side gate = defense in depth.
- **Session invalidation on deactivation.** When a chatter is deactivated, all their sessions are deleted — good, prevents ghost sessions.
- **PIN not leaked in any query response.** The `chatters.list`, `chatters.get` queries never return `pinHash`. Login response only returns token + user metadata. ✅
- **Chatter data isolation.** `salesReports.listByChatter` defaults to own data; viewing others' data requires supervisor+ role. `shifts.listByChatter` also permission-gated. Chatters cannot see other chatters' reports.

### Functionality
- **Clock in/out flow is solid.** Prevents double clock-in, validates creator status, calculates elapsed time with breaks. Break start/end logic handles edge cases (already on break, not on break).
- **Report submission prevents duplicates.** `by_chatter_date` index check in `salesReports.submit` — good guard.
- **Day-off request workflow works.** Request → pending → approve/deny flow is clean. Only admin/manager can approve. All chatters can request.
- **Schedule CRUD is complete.** Create, list by range, remove, request day off, approve/deny — all present and permission-gated.

### UX
- **Loading states present on every page.** Login has loading spinner on submit. Dashboard shows "Loading..." fallback. Creators page shows "Loading creators..." state. Reports shows empty-state with CTA.
- **Empty states handled everywhere.** "No one is clocked in right now", "No reports found", "No team members found", "No data for this period", "No shifts scheduled this week" — all present.
- **Mobile responsive.** CRM layout has proper mobile sidebar (hamburger menu, overlay, `@media (max-width: 768px)` breakpoints). Schedule page detects `isMobile` with resize listener and switches between 1-week/2-week views.
- **Good use of CSS custom properties.** Design system via CSS variables in `globals.css` means consistent theming across all pages.

### Schema & Indexing
- **All major query patterns have indexes.** `crm_sessions.by_token`, `crm_chatters.by_username`, `crm_shifts.by_active`, `crm_shifts.by_chatter`, `crm_shifts.by_date`, `crm_schedules.by_date`, `crm_schedules.by_chatter_date`, `crm_schedules.by_status`, `crm_sales_reports.by_chatter`, `crm_sales_reports.by_date`, `crm_sales_reports.by_chatter_date`, `crm_om_imports.by_imported_at` — comprehensive coverage.
- **`crm_om_imports` table properly indexed** by `importedAt` for the desc-ordered listing query. ✅

### Phase 4 Specifics
- **Performance page stats calculation is correct.** `getPerformanceByPeriod` properly computes total shift minutes, subtracts break minutes for net work, divides sales by net hours. Attendance rate uses scheduled vs completed shifts ratio. Rounding is appropriate.
- **Schedule shift times are correct.** Morning 06:00–14:00, Afternoon 14:00–22:00, Night 22:00–06:00 — proper 3×8h coverage. Legacy "evening" mapped to "night" in both frontend display and backend creation.
- **Bulk continuous shifts "ongoing" works.** Sets end date 3 months ahead from start, creates individual schedule entries for each date × chatter combination. Preview step shows total count before committing.
- **CSV import parses quoted fields.** The `handleImportCSV` function handles basic quoted-field CSV parsing (toggles `inQuotes` on `"` chars, splits on `,` only when not in quotes).

---

## ⚠️ Warnings (Not Blocking — Should Fix)

### W1: PIN Stored in Plaintext
**File:** `crm/auth.ts`, `crm/chatters.ts`, schema field `pinHash`
**Issue:** Despite the field being named `pinHash`, PINs are stored and compared as plaintext strings. The code comments say "TODO: add hashing later."
**Impact:** If the database is ever compromised, all PINs are immediately readable. For a 4-6 digit PIN this isn't catastrophic (they're weak by nature), but it's misleading and bad practice.
**Recommendation:** Use `bcrypt` or `scrypt` hashing. At minimum, use SHA-256 with a salt.

### W2: Token Generation Uses `Math.random()` — Not Cryptographically Secure
**File:** `crm/auth.ts` line ~37
**Code:** `Math.random().toString(36).charAt(2)` repeated 32 times
**Impact:** `Math.random()` is not cryptographically secure. Session tokens could theoretically be predicted. In a Convex server context the risk is low, but for session tokens this is a known anti-pattern.
**Recommendation:** Use `crypto.getRandomValues()` or `crypto.randomUUID()` in the Convex runtime.

### W3: `getAgencyStats` and `getSupervisorTeamStats` Don't Use Indexes
**File:** `crm/analytics.ts`
**Issue:** `getAgencyStats` queries `crm_sessions` with `.filter(q => q.eq(q.field("token"), token))` instead of `.withIndex("by_token", ...)`. Same pattern for `crm_sales_reports` and `crm_shifts` — using `.filter()` on `date`, `chatterId`, `clockOut` fields instead of the existing indexes.
**Impact:** Full table scans on every dashboard load. Currently fine with small data, but will degrade as shifts/reports grow to thousands of rows.
**Recommendation:** Replace all `.filter()` calls with `.withIndex()` where indexes exist. This is a low-effort, high-impact fix.

### W4: `getPerformanceByPeriod` Is O(N×M) — Potential Performance Bomb
**File:** `crm/analytics.ts` — `getPerformanceByPeriod`
**Issue:** For each active chatter, it queries all shifts (full table via index), then filters in JS. Then queries all reports (full table via index), then filters in JS. Then queries all schedules (full table via index), then filters in JS. That's 3 full-table-per-chatter queries.
**Impact:** With 14 chatters × 3 queries each = 42 queries per page load. Scales linearly with team size and data volume.
**Recommendation:** Use compound indexes (`by_chatter_date`) with range queries instead of collecting all + filtering.

### W5: `getSessionUser` Helper Duplicated Across 6 Files
**Files:** `chatters.ts`, `creators.ts`, `shifts.ts`, `schedule.ts`, `salesReports.ts`, `analytics.ts`
**Issue:** The exact same `getSessionUser()` function is copy-pasted in every file. The `analytics.ts` version is slightly different (uses `.filter()` instead of `.withIndex()`).
**Impact:** Maintenance burden. If the session model changes, you need to update 6 files. The analytics version is already diverged (worse performance).
**Recommendation:** Extract to a shared `crm/_helpers.ts` utility file.

### W6: Bulk Add Creates Shifts Sequentially — No Batch API
**File:** `app/(crm)/schedule/page.tsx` — `BulkAddModal.handleCreate()`
**Issue:** Creates shifts one at a time in a nested loop: `for chatter of selectedChatterList → for date of dates → await createSchedule(...)`. For "ongoing" (3 months × multiple chatters) this could be 90+ sequential mutations.
**Impact:** Very slow UX for large bulk adds. Each mutation is a separate round-trip. No progress indicator during creation.
**Recommendation:** Create a server-side `bulkCreateSchedule` mutation that accepts arrays and inserts in one transaction. Add a progress bar or at minimum a count.

### W7: No `useCallback` on Mutation Handlers
**File:** Multiple pages (dashboard, schedule, admin)
**Issue:** Mutation handler functions (e.g., `handleClockIn`, `handleClockOut`, `handleAddSchedule`) are recreated on every render. Not a bug, but causes unnecessary re-renders in child components.
**Recommendation:** Wrap with `useCallback` where the functions are passed as props or used in dependency arrays.

### W8: Analytics Two-Column Layout Not Responsive
**File:** `app/(crm)/analytics/page.tsx`
**Code:** `gridTemplateColumns: "1fr 1fr"` (hardcoded)
**Impact:** On mobile screens, the "Revenue by Creator" and "Revenue by Chatter" cards will be squeezed into tiny columns.
**Recommendation:** Use `repeat(auto-fit, minmax(300px, 1fr))` like the other grid layouts do.

### W9: `user.assignedCreators` Not Available on CRM Layout's User Object
**File:** `app/(crm)/layout.tsx` — `CrmUser` interface has `assignedCreators: string[]`
**Issue:** In `login/page.tsx`, `localStorage` stores `crm_user` with fields `_id, name, username, role, emoji` but NOT `assignedCreators`. However, `ChatterDashboard` reads `user.assignedCreators` — this will always be `undefined`.
**Impact:** The "Your creators:" tag list on the chatter dashboard will never render.
**Recommendation:** Include `assignedCreators` in the localStorage data on login.

### W10: `useCallback` Imported but Only Used in Some Files
**File:** `app/(crm)/schedule/page.tsx` imports `useCallback` but only uses it sparingly. `analytics/page.tsx` correctly uses `useCallback` for `handleImportCSV`. Inconsistent.

### W11: Seed Data Uses Identical PINs
**File:** `crm/seed.ts`
**Issue:** Every seeded user has `pinHash: "1234"`. While this is dev-only, if seed data ever runs in production (or staging), every account is trivially compromisable.
**Recommendation:** At minimum, generate random PINs and log them. Or require PIN change on first login.

### W12: No CSRF Protection on Mutations
**Issue:** All mutations accept a `token` string parameter. If an attacker knows a user's token (e.g., via XSS on `localStorage`), they can call any mutation.
**Impact:** Medium. `localStorage` tokens are inherently vulnerable to XSS. This is standard for SPAs but worth noting.
**Recommendation:** Add `HttpOnly` cookie-based sessions for production. Consider CSP headers.

---

## ❌ Failures (Must Fix Before Shipping)

### F1: Login Page Does NOT Store `assignedCreators` — Chatter Dashboard Broken
**File:** `app/login/page.tsx` line 27–33
**Code:**
```js
localStorage.setItem("crm_user", JSON.stringify({
  _id: result.chatter.id,
  name: result.chatter.name,
  username: result.chatter.username,
  role: result.chatter.role,
  emoji: result.chatter.avatarEmoji,  // ← stored as "emoji"
}));
```
**Problem 1:** `assignedCreators` is returned by the login mutation but not stored in localStorage. The `ChatterDashboard` component reads `user.assignedCreators` and tries to map over it — this will be `undefined` and the creators tag list won't render.
**Problem 2:** Avatar emoji is stored as `emoji` but the layout/dashboard reads `user.avatarEmoji`. The avatar will always fall back to "👤".
**Fix:** Change localStorage to:
```js
localStorage.setItem("crm_user", JSON.stringify({
  _id: result.chatter.id,
  name: result.chatter.name,
  username: result.chatter.username,
  role: result.chatter.role,
  avatarEmoji: result.chatter.avatarEmoji,
  assignedCreators: result.chatter.assignedCreators,
}));
```

### F2: `getAgencyStats` Session Validation Doesn't Use Index — Could Fail at Scale
**File:** `crm/analytics.ts` — `getAgencyStats`, `getSupervisorTeamStats`, `getSessionUser` (the local version in analytics.ts)
**Code:** `.filter((q) => q.eq(q.field("token"), token))` instead of `.withIndex("by_token", ...)`
**Why this is a failure, not a warning:** Convex will perform a full table scan of `crm_sessions` on every call to `getAgencyStats`, `getDashboardStats`, `getSalesByPeriod`, and `getPerformanceByPeriod`. With 30-day session TTL and active users, this table grows continuously. Sessions are never cleaned up (expired sessions are not deleted). This will cause Convex read limits to be hit quickly.
**Fix:** Change the local `getSessionUser` in analytics.ts to use `.withIndex("by_token", (q) => q.eq("token", token))`.
**Also:** Add a cron job or background task to clean up expired sessions.

### F3: Expired Sessions Never Cleaned Up
**File:** `crm/auth.ts`, schema
**Issue:** Sessions expire after 30 days (`expiresAt = Date.now() + 30d`), but expired sessions are never deleted from `crm_sessions`. The validation code just returns `null` — the row persists forever.
**Impact:** `crm_sessions` table grows unboundedly. Every login creates a new session. With 14 users logging in daily, that's ~400 orphaned sessions per month, plus full-table-scan queries hitting all of them.
**Fix:** Either (a) delete expired sessions on login/validation, or (b) add a scheduled cleanup cron.

---

## 📋 Recommendations (Nice to Have)

### R1: Extract Shared Components
The `ClockInOutCard` component in `dashboard/page.tsx` is well-factored, but inputStyle/labelStyle/overlayStyle/modalStyle objects are duplicated across admin, schedule, and other pages. Extract to a shared `styles.ts` or a `<Modal>` component.

### R2: Add Report Review UI for Admins
The backend has a `salesReports.review` mutation (mark as reviewed/flagged with a note), but the Reports page has no UI to trigger it. Admins can see reports but can't review them from the CRM.

### R3: Add Toast/Notification System
Currently, errors use `alert()` in several places (clock in/out failures, schedule removal). Success messages use inline state. A unified toast system would be more polished.

### R4: Add Date Range Validation for CSV Import
**File:** `analytics/page.tsx` — `handleImportCSV`
The CSV parser handles basic quoting but doesn't validate data types, check for empty required fields, or handle CSVs with BOM markers. It also doesn't limit file size — a user could upload a 100MB CSV and try to send it all to Convex in one mutation.
**Recommendation:** Add file size limit (e.g., 5MB), validate expected columns, handle BOM, and show a preview before importing.

### R5: Add Pagination for Reports
Currently `listByChatter` collects all reports then slices. For chatters with months of daily reports, this becomes inefficient. Consider cursor-based pagination.

### R6: Add Dark Mode Support
The CSS variables in `globals.css` are set up perfectly for dark mode — just add a `@media (prefers-color-scheme: dark)` block or a toggle.

### R7: Keyboard Navigation & Focus Management
Modals don't trap focus. Date inputs don't have `aria-label`s. The busyness rating buttons aren't in an `aria-radiogroup`. Not critical for MVP but important for accessibility.

### R8: Add `startTime`/`endTime` Display on Schedule
The backend stores `startTime` and `endTime` on schedule entries, but the frontend displays shift type times from a hardcoded `SHIFT_TYPES` constant. These should match, or the stored times should be displayed directly.

### R9: Consider Server-Side Session Validation
Currently, auth is purely client-side — the layout checks `localStorage` and redirects. A determined user could manipulate `localStorage` to see the UI skeleton (though no data would load since Convex validates server-side). Consider using Next.js middleware for an additional layer.

---

## Summary

| Category | Count |
|---|---|
| ✅ Passes | 18 |
| ⚠️ Warnings | 12 |
| ❌ Failures | 3 |
| 📋 Recommendations | 9 |

**Overall Verdict:** Phase 4 is **functionally solid** with good security fundamentals (server-side token validation on every function is the big one, and it's done right). The three failures are real but localized — F1 is a data-not-stored bug that breaks chatter avatars and creator tags, F2/F3 are performance/cleanup issues that will bite at scale. All three are quick fixes (< 30 min total). The warnings are real improvements that should be scheduled for Phase 5.

**Recommendation:** Fix F1, F2, and F3 → ship.
