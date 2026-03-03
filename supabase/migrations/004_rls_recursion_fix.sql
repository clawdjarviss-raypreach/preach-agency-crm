-- 004_rls_recursion_fix.sql
-- Fix infinite recursion in CRM RLS helper functions by bypassing crm_chatters RLS
-- for identity/role resolution helpers.

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_current_chatter_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_chatter_id UUID;
BEGIN
  SELECT c.id
  INTO v_chatter_id
  FROM public.crm_chatters c
  WHERE c.supabase_auth_id = auth.uid()
    AND c.status = 'active'
  LIMIT 1;

  RETURN v_chatter_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_current_role()
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT c.role
  INTO v_role
  FROM public.crm_chatters c
  WHERE c.id = public.crm_current_chatter_id()
  LIMIT 1;

  RETURN v_role;
END;
$$;

COMMIT;
