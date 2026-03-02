-- 002_rls_policies.sql
-- Full RLS model for CRM tables using Supabase Auth JWT identity (auth.uid)

BEGIN;

ALTER TABLE public.crm_chatters
  ADD COLUMN IF NOT EXISTS supabase_auth_id UUID UNIQUE;

CREATE INDEX IF NOT EXISTS idx_chatters_supabase_auth_id
  ON public.crm_chatters (supabase_auth_id);

CREATE OR REPLACE FUNCTION public.crm_current_chatter_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT c.id
  FROM public.crm_chatters c
  WHERE c.supabase_auth_id = auth.uid()
    AND c.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crm_current_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT c.role
  FROM public.crm_chatters c
  WHERE c.id = public.crm_current_chatter_id()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crm_has_role(p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_current_role() = ANY(p_roles);
$$;

CREATE OR REPLACE FUNCTION public.crm_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_has_role(ARRAY['admin']);
$$;

CREATE OR REPLACE FUNCTION public.crm_is_marketing_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_has_role(ARRAY['marketing_manager']);
$$;

CREATE OR REPLACE FUNCTION public.crm_is_manager_or_supervisor()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_has_role(ARRAY['manager', 'supervisor']);
$$;

CREATE OR REPLACE FUNCTION public.crm_is_chatter()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_has_role(ARRAY['chatter']);
$$;

CREATE OR REPLACE FUNCTION public.crm_can_access_creator(p_creator_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN public.crm_is_admin() THEN TRUE
    WHEN public.crm_is_marketing_manager() THEN EXISTS (
      SELECT 1
      FROM public.crm_user_creator_access uca
      WHERE uca.user_id = public.crm_current_chatter_id()
        AND uca.creator_id = p_creator_id
    )
    WHEN public.crm_is_manager_or_supervisor() THEN EXISTS (
      SELECT 1
      FROM public.crm_user_creator_access uca
      WHERE uca.user_id = public.crm_current_chatter_id()
        AND uca.creator_id = p_creator_id
    )
    WHEN public.crm_is_chatter() THEN EXISTS (
      SELECT 1
      FROM public.crm_user_creator_access uca
      WHERE uca.user_id = public.crm_current_chatter_id()
        AND uca.creator_id = p_creator_id
    )
    ELSE FALSE
  END;
$$;

-- Enable + force RLS for all crm_* tables
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'crm\_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;

-- Base policies on every table
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'crm\_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tablename || '_service_role_all', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tablename || '_admin_all', r.tablename);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.tablename || '_manager_scope_select', r.tablename);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')',
      r.tablename || '_service_role_all',
      r.tablename
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (auth.role() = ''authenticated'' AND public.crm_is_admin()) WITH CHECK (auth.role() = ''authenticated'' AND public.crm_is_admin())',
      r.tablename || '_admin_all',
      r.tablename
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.role() = ''authenticated'' AND (public.crm_is_admin() OR public.crm_is_marketing_manager() OR public.crm_is_manager_or_supervisor()))',
      r.tablename || '_manager_scope_select',
      r.tablename
    );
  END LOOP;
END $$;

-- Self-owned rows
DROP POLICY IF EXISTS crm_chatters_self_select ON public.crm_chatters;
CREATE POLICY crm_chatters_self_select
ON public.crm_chatters
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR id = public.crm_current_chatter_id()
  )
);

DROP POLICY IF EXISTS crm_chatters_self_update ON public.crm_chatters;
CREATE POLICY crm_chatters_self_update
ON public.crm_chatters
FOR UPDATE
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR id = public.crm_current_chatter_id()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR id = public.crm_current_chatter_id()
  )
);

DROP POLICY IF EXISTS crm_sessions_self_all ON public.crm_sessions;
CREATE POLICY crm_sessions_self_all
ON public.crm_sessions
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR chatter_id = public.crm_current_chatter_id()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR chatter_id = public.crm_current_chatter_id()
  )
);

DROP POLICY IF EXISTS crm_user_creator_access_self_select ON public.crm_user_creator_access;
CREATE POLICY crm_user_creator_access_self_select
ON public.crm_user_creator_access
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR user_id = public.crm_current_chatter_id()
  )
);

-- Creator-scoped tables: chatter/manager/supervisor/marketing_manager can read-write only with creator access
DO $$
DECLARE
  t TEXT;
  creator_scoped_tables TEXT[] := ARRAY[
    'crm_of_accounts',
    'crm_shifts',
    'crm_schedules',
    'crm_message_queue',
    'crm_of_tracking_links',
    'crm_ig_accounts',
    'crm_weekly_targets',
    'crm_target_progress',
    'crm_queue_sla_config',
    'crm_queue_routing_config'
  ];
BEGIN
  FOREACH t IN ARRAY creator_scoped_tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_select_by_creator', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_write_by_creator', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR public.crm_can_access_creator(creator_id)
         )
      )',
      t || '_role_select_by_creator', t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR public.crm_can_access_creator(creator_id)
         )
      ) WITH CHECK (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR public.crm_can_access_creator(creator_id)
         )
      )',
      t || '_role_write_by_creator', t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS crm_roles_role_read ON public.crm_roles;
CREATE POLICY crm_roles_role_read
ON public.crm_roles
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
    OR public.crm_is_chatter()
  )
);

DROP POLICY IF EXISTS crm_creators_role_read ON public.crm_creators;
CREATE POLICY crm_creators_role_read
ON public.crm_creators
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR (
      public.crm_has_role(ARRAY['marketing_manager', 'manager', 'supervisor', 'chatter'])
      AND EXISTS (
        SELECT 1 FROM public.crm_user_creator_access uca
        WHERE uca.user_id = public.crm_current_chatter_id()
          AND uca.creator_id = crm_creators.id
      )
    )
  )
);

DROP POLICY IF EXISTS crm_invite_tokens_admin_mm_mgr_all ON public.crm_invite_tokens;
CREATE POLICY crm_invite_tokens_admin_mm_mgr_all
ON public.crm_invite_tokens
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
);

DROP POLICY IF EXISTS crm_invite_link_admin_mm_mgr_all ON public.crm_invite_link;
CREATE POLICY crm_invite_link_admin_mm_mgr_all
ON public.crm_invite_link
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
);

DROP POLICY IF EXISTS crm_of_api_config_admin_mm_mgr_all ON public.crm_of_api_config;
CREATE POLICY crm_of_api_config_admin_mm_mgr_all
ON public.crm_of_api_config
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
);

DROP POLICY IF EXISTS crm_of_sync_state_admin_mm_mgr_all ON public.crm_of_sync_state;
CREATE POLICY crm_of_sync_state_admin_mm_mgr_all
ON public.crm_of_sync_state
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
    OR public.crm_is_manager_or_supervisor()
  )
);

-- Account-scoped tables that reference OF account_id instead of creator_id
DO $$
DECLARE
  t TEXT;
  account_scoped_tables TEXT[] := ARRAY[
    'crm_of_transactions',
    'crm_of_daily_earnings',
    'crm_of_fans',
    'crm_of_chat_stats',
    'crm_of_messages',
    'crm_of_forecast_cache',
    'crm_of_credit_usage'
  ];
BEGIN
  FOREACH t IN ARRAY account_scoped_tables
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_select_by_account', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_role_write_by_account', t);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR EXISTS (
             SELECT 1
             FROM public.crm_of_accounts a
             WHERE a.account_id = %I.account_id
               AND public.crm_can_access_creator(a.creator_id)
           )
         )
      )',
      t || '_role_select_by_account', t, t
    );

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR EXISTS (
             SELECT 1
             FROM public.crm_of_accounts a
             WHERE a.account_id = %I.account_id
               AND public.crm_can_access_creator(a.creator_id)
           )
         )
      ) WITH CHECK (
         auth.role() = ''authenticated''
         AND (
           public.crm_is_admin()
           OR EXISTS (
             SELECT 1
             FROM public.crm_of_accounts a
             WHERE a.account_id = %I.account_id
               AND public.crm_can_access_creator(a.creator_id)
           )
         )
      )',
      t || '_role_write_by_account', t, t, t
    );
  END LOOP;
END $$;

COMMIT;
