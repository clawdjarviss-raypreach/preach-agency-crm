import { cronJobs } from "convex/server";
import { internal as _internal } from "./_generated/api";
const internal = _internal as any;

// ═══════════════════════════════════════════════════════════════════════════
// PREACH CRM CRON JOBS
// ═══════════════════════════════════════════════════════════════════════════
//
// All cron times are in UTC.
// 
// ERROR HANDLING:
// - Each cron handler has its own try/catch with logging
// - Idempotency guards prevent duplicate processing
// - Failed runs are logged but don't block subsequent runs
//
// DEPENDENCIES:
// - Streaks & Achievements: Independent, no external deps
// - Target Progress (5D-2): Requires crm_om_chatter_metrics populated
// - Weekly Bonuses (5D-3a): Requires target progress computed
// - Sales Commission (5D-3c): Requires crm_sales_reports submitted
//
// ═══════════════════════════════════════════════════════════════════════════

const crons = cronJobs();

// ─── STREAKS & GAMIFICATION ───────────────────────────────────────────────

// Daily at 06:00 UTC: evaluate streaks, break stale ones
// Checks if chatters worked yesterday; breaks streaks if not
crons.daily(
  "evaluate-streaks",
  { hourUTC: 6, minuteUTC: 0 },
  internal.crm.streaks.evaluateStreaksDaily
);

// Monday at 00:00 UTC: reset weekly freezes
// Each chatter gets fresh freeze allowances for the new week
crons.weekly(
  "reset-freezes",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.crm.streaks.resetWeeklyFreezes
);

// Daily at 02:00 UTC: evaluate time-bounded achievements
// Checks achievements that depend on calendar time (e.g., monthly rankings)
crons.daily(
  "evaluate-achievements",
  { hourUTC: 2, minuteUTC: 0 },
  internal.crm.achievements.evaluateAllAchievementsDaily
);

// Daily at 03:00 UTC: expire invite tokens older than 72h
crons.daily(
  "expire-invite-tokens",
  { hourUTC: 3, minuteUTC: 0 },
  internal.crm.invites.expireInviteTokens
);

// ─── PHASE 5D: TARGETS & BONUSES ──────────────────────────────────────────

// Daily at 06:00 UTC: update chatter target progress for current week
// Reads crm_om_chatter_metrics + crm_sales_reports to compute progress
// against weekly targets. Populates crm_target_progress records.
// IDEMPOTENCY: Upserts records keyed by (chatterId, creatorId, weekStart)
crons.daily(
  "update-target-progress",
  { hourUTC: 6, minuteUTC: 0 },
  internal.crm.progress.updateAllTargetProgress
);

// Monday at 00:00 UTC: evaluate weekly target bonuses
// Runs after week ends to check who met all 3 targets.
// Creates pending bonus records for approval.
// IDEMPOTENCY: Skips if bonus already exists for (chatterId, creatorId, weekStart)
// HOLIDAY MULTIPLIER: Applies 2x (or configured) multiplier if week contains holiday
crons.weekly(
  "evaluate-weekly-bonuses",
  { dayOfWeek: "monday", hourUTC: 0, minuteUTC: 0 },
  internal.crm.bonusEngine.evaluateWeeklyBonusesCron
);

// Daily at 06:05 UTC: calculate sales commissions (5 min after progress)
// Processes previous day's crm_sales_reports.
// Rate: 3% standard, 6% on holidays (from crm_holidays)
// IDEMPOTENCY: Skips if commission bonus exists for (chatterId, date)
crons.daily(
  "compute-sales-commission",
  { hourUTC: 6, minuteUTC: 5 },
  internal.crm.bonusEngine.computeSalesCommissionCron
);

// ─── PHASE 4A: WARNINGS / DISCIPLINE ─────────────────────────────────────

// Every 5 minutes: check for (per-chatter timezone) late clock-ins at ~10:30
crons.interval(
  "warnings-late-clock-in-check",
  { minutes: 5 },
  internal.warningsCron.lateClockInCheck
);

// Every 5 minutes: check for (per-chatter timezone) missed reports at ~23:00
crons.interval(
  "warnings-missed-report-check",
  { minutes: 5 },
  internal.warningsCron.missedReportCheck
);

// ─── PHASE 8: REAL-TIME QUEUE ─────────────────────────────────────────────

// Every 2 minutes: check for SLA breaches and auto-escalate/expire
crons.interval(
  "check-queue-sla",
  { minutes: 2 },
  internal.crm.queue.checkSlaBreaches
);

// Hourly: snapshot queue stats for trending
crons.interval(
  "snapshot-queue-stats",
  { hours: 1 },
  internal.crm.queue.snapshotQueueStats
);


// Daily at 06:00 UTC: sync Instagram/Supabase social analytics
crons.daily(
  "ig-supabase-sync",
  { hourUTC: 6, minuteUTC: 0 },
  internal.crm.supabaseSync.syncAll
);

// ─── OF API: AUTO-SYNC DATA ───────────────────────────────────────────────

// Replaced by webhook-driven sync — see /webhooks/ofapi
// crons.interval(
//   "of-sync-earnings",
//   { minutes: 20 },
//   internal.crm.ofSyncJobs.syncEarnings
// );

// Replaced by webhook-driven sync — see /webhooks/ofapi
// crons.interval(
//   "of-sync-transactions",
//   { minutes: 20 },
//   internal.crm.ofSyncJobs.syncTransactions
// );

// Daily at 04:00 UTC: reconcile yesterday webhooks vs API summary (and backfill if needed)
crons.daily(
  "of-daily-reconciliation",
  { hourUTC: 4, minuteUTC: 0 },
  internal.crm.ofSyncJobs.reconcileDaily
);

crons.interval(
  "of-sync-fans",
  { hours: 24 },
  internal.crm.ofSyncJobs.syncFans
);

crons.interval(
  "of-sync-chats",
  { hours: 1 },
  internal.crm.ofSyncJobs.syncChats
);

crons.interval(
  "of-sync-forecast",
  { hours: 6 },
  internal.crm.ofSyncJobs.syncForecast
);

crons.interval(
  "of-sync-tracking-links",
  { hours: 3 },
  internal.crm.ofSyncJobs.syncTrackingLinks
);

// ─── OM API: AUTO-SYNC REVENUE DATA ───────────────────────────────────────

// Every 30 minutes: sync transactions from OnlyMonster API + recompute aggregates
crons.interval(
  "om-revenue-sync",
  { minutes: 30 },
  internal.crm.omSyncActions.syncAllCreators
);

// Every 30 minutes (offset by 2 min): recompute daily aggregates after sync
crons.interval(
  "om-aggregate-recompute",
  { minutes: 30 },
  internal.crm.omAggregation.recomputeTodayAggregates
);

// ═══════════════════════════════════════════════════════════════════════════
// CRON SCHEDULE SUMMARY (UTC)
// ═══════════════════════════════════════════════════════════════════════════
//
// 00:00  Mon     reset-freezes           Weekly freeze reset
// 00:00  Mon     evaluate-weekly-bonuses Weekly target bonuses
// 02:00  Daily   evaluate-achievements   Time-bounded achievements
// 06:00  Daily   evaluate-streaks        Streak evaluation
// 06:00  Daily   update-target-progress  Target progress computation
// 06:05  Daily   compute-sales-commission Sales commission (3%/6%)
//
// ═══════════════════════════════════════════════════════════════════════════

export default crons;
