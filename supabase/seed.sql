-- seed.sql
-- Minimal Phase 1 fixture data for local/dev environments

BEGIN;

-- Roles
INSERT INTO public.crm_roles (id, name, description, color, permissions, is_system)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'admin', 'System administrator', '#ef4444', ARRAY['*'], true),
  ('22222222-2222-2222-2222-222222222222', 'marketing_manager', 'Marketing manager', '#3b82f6', ARRAY['crm.read','crm.write','analytics.read'], true),
  ('33333333-3333-3333-3333-333333333333', 'chatter', 'Chatter operator', '#10b981', ARRAY['crm.read','queue.read','queue.write'], true)
ON CONFLICT (name) DO NOTHING;

-- Chatters
INSERT INTO public.crm_chatters (
  id, name, username, pin_hash, role_id, role, email, status, assigned_creators, joined_at
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'Admin User',
    'admin1',
    crypt('123456', gen_salt('bf')),
    '11111111-1111-1111-1111-111111111111',
    'admin',
    'admin@preachcrm.local',
    'active',
    ARRAY[]::text[],
    now()
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'Marketing Manager',
    'mm1',
    crypt('123456', gen_salt('bf')),
    '22222222-2222-2222-2222-222222222222',
    'marketing_manager',
    'mm@preachcrm.local',
    'active',
    ARRAY[]::text[],
    now()
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'Chatter One',
    'chatter1',
    crypt('123456', gen_salt('bf')),
    '33333333-3333-3333-3333-333333333333',
    'chatter',
    'chatter1@preachcrm.local',
    'active',
    ARRAY[]::text[],
    now()
  )
ON CONFLICT (username) DO NOTHING;

-- Creators
INSERT INTO public.crm_creators (
  id, name, only_fans_handle, status, created_at
)
VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'Creator Alpha', 'creator_alpha', 'active', now()),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'Creator Beta', 'creator_beta', 'active', now())
ON CONFLICT DO NOTHING;

-- Access map
INSERT INTO public.crm_user_creator_access (user_id, creator_id, axes)
VALUES
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '{"socials": true, "revenue": true, "trackingLinks": true, "subs": true}'::jsonb
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '{"socials": true, "revenue": true, "trackingLinks": false, "subs": true}'::jsonb
  )
ON CONFLICT (user_id, creator_id) DO NOTHING;

-- OF account
INSERT INTO public.crm_of_accounts (account_id, creator_id, display_name, status)
VALUES
  ('of_acc_alpha', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 'OF Alpha', 'active')
ON CONFLICT (account_id) DO NOTHING;

-- Queue sample
INSERT INTO public.crm_message_queue (
  creator_id,
  chatter_id,
  fan_username,
  fan_display_name,
  fan_segment,
  message_preview,
  message_type,
  priority,
  status,
  received_at,
  source
)
VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'fan_legend',
    'Fan Legend',
    'vip',
    'Can you send me tonight''s bundle?',
    'dm',
    'high',
    'pending',
    now(),
    'manual'
  )
ON CONFLICT DO NOTHING;

COMMIT;
