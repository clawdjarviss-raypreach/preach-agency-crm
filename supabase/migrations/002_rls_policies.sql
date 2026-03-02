-- 002_rls_policies.sql
-- Full RLS model for CRM tables by role: admin, marketing_manager, chatter

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_current_chatter_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT s.chatter_id
  FROM public.crm_sessions s
  WHERE s.token = current_setting('request.header.x-crm-token', true)
    AND s.expires_at > now()
  ORDER BY s.created_at DESC
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
    AND c.status = 'active'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crm_is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_current_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.crm_is_marketing_manager()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_current_role() = 'marketing_manager';
$$;

CREATE OR REPLACE FUNCTION public.crm_is_chatter()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT public.crm_current_role() = 'chatter';
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
do $$
declare r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'crm\_%'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('alter table public.%I force row level security', r.tablename);
  end loop;
end $$;

-- Base policies on every table
do $$
declare r record;
begin
  for r in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename like 'crm\_%'
  loop
    execute format('drop policy if exists %I on public.%I', r.tablename || '_service_role_all', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_admin_all', r.tablename);
    execute format('drop policy if exists %I on public.%I', r.tablename || '_marketing_manager_select', r.tablename);

    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      r.tablename || '_service_role_all',
      r.tablename
    );

    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''authenticated'' and public.crm_is_admin()) with check (auth.role() = ''authenticated'' and public.crm_is_admin())',
      r.tablename || '_admin_all',
      r.tablename
    );

    execute format(
      'create policy %I on public.%I for select using (auth.role() = ''authenticated'' and (public.crm_is_admin() or public.crm_is_marketing_manager()))',
      r.tablename || '_marketing_manager_select',
      r.tablename
    );
  end loop;
end $$;

-- chatter + marketing_manager role-specific policies by table type

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

-- Creator-scoped tables: chatter + marketing_manager can read/write only if creator access exists
DO $$
DECLARE
  t TEXT;
  creator_scoped_tables TEXT[] := ARRAY[
    'crm_of_accounts',
    'crm_of_transactions',
    'crm_of_daily_earnings',
    'crm_shifts',
    'crm_schedules',
    'crm_message_queue'
  ];
BEGIN
  FOREACH t IN ARRAY creator_scoped_tables
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I', t || '_role_select_by_creator', t);
    EXECUTE format('drop policy if exists %I on public.%I', t || '_role_write_by_creator', t);

    EXECUTE format(
      'create policy %I on public.%I for select using (
         auth.role() = ''authenticated''
         and (
           public.crm_is_admin()
           or (
             public.crm_is_marketing_manager()
             and public.crm_can_access_creator(creator_id)
           )
           or (
             public.crm_is_chatter()
             and public.crm_can_access_creator(creator_id)
           )
         )
      )',
      t || '_role_select_by_creator', t
    );

    EXECUTE format(
      'create policy %I on public.%I for all using (
         auth.role() = ''authenticated''
         and (
           public.crm_is_admin()
           or (
             public.crm_is_marketing_manager()
             and public.crm_can_access_creator(creator_id)
           )
           or (
             public.crm_is_chatter()
             and public.crm_can_access_creator(creator_id)
           )
         )
      ) with check (
         auth.role() = ''authenticated''
         and (
           public.crm_is_admin()
           or (
             public.crm_is_marketing_manager()
             and public.crm_can_access_creator(creator_id)
           )
           or (
             public.crm_is_chatter()
             and public.crm_can_access_creator(creator_id)
           )
         )
      )',
      t || '_role_write_by_creator', t
    );
  END LOOP;
END $$;

-- Non creator-scoped shared tables
DROP POLICY IF EXISTS crm_roles_admin_mm_read ON public.crm_roles;
CREATE POLICY crm_roles_admin_mm_read
ON public.crm_roles
FOR SELECT
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
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
      public.crm_is_marketing_manager()
      AND EXISTS (
        SELECT 1 FROM public.crm_user_creator_access uca
        WHERE uca.user_id = public.crm_current_chatter_id()
          AND uca.creator_id = crm_creators.id
      )
    )
    OR (
      public.crm_is_chatter()
      AND EXISTS (
        SELECT 1 FROM public.crm_user_creator_access uca
        WHERE uca.user_id = public.crm_current_chatter_id()
          AND uca.creator_id = crm_creators.id
      )
    )
  )
);

DROP POLICY IF EXISTS crm_invite_tokens_admin_mm_all ON public.crm_invite_tokens;
CREATE POLICY crm_invite_tokens_admin_mm_all
ON public.crm_invite_tokens
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
);

DROP POLICY IF EXISTS crm_invite_link_admin_mm_all ON public.crm_invite_link;
CREATE POLICY crm_invite_link_admin_mm_all
ON public.crm_invite_link
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
);

DROP POLICY IF EXISTS crm_of_api_config_admin_mm_all ON public.crm_of_api_config;
CREATE POLICY crm_of_api_config_admin_mm_all
ON public.crm_of_api_config
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
);

DROP POLICY IF EXISTS crm_of_sync_state_admin_mm_all ON public.crm_of_sync_state;
CREATE POLICY crm_of_sync_state_admin_mm_all
ON public.crm_of_sync_state
FOR ALL
USING (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
)
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    public.crm_is_admin()
    OR public.crm_is_marketing_manager()
  )
);

COMMIT;