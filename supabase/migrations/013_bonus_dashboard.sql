-- Add bonus_enabled column to crm_chatters for gamified bonus tracker
ALTER TABLE crm_chatters ADD COLUMN IF NOT EXISTS bonus_enabled boolean NOT NULL DEFAULT false;
