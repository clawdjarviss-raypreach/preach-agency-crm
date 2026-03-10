-- Add backend_manager to the role check constraint
ALTER TABLE crm_chatters DROP CONSTRAINT IF EXISTS crm_chatters_role_check;
ALTER TABLE crm_chatters ADD CONSTRAINT crm_chatters_role_check
  CHECK (role IN ('admin','manager','supervisor','chatter','marketing_manager','backend_manager'));

-- Add backend_manager role entry
INSERT INTO crm_roles (name, color, permissions, is_system)
VALUES ('backend_manager', '#10b981', '{}', false)
ON CONFLICT DO NOTHING;
