-- Migration: Add unique constraint for daily snapshot upsert
CREATE UNIQUE INDEX IF NOT EXISTS uq_reel_daily_snap_reel_date ON crm_ig_reel_daily_snapshots (ig_reel_id, snapshot_date);
