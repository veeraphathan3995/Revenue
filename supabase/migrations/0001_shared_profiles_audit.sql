-- =============================================================================
-- 0001_shared_profiles_audit.sql
-- Shared infrastructure: auth helper, profiles, audit_logs, and triggers.
-- Uses IF NOT EXISTS so it safely coexists with existing SBIP tables.
-- =============================================================================

-- Postgres 13+ provides gen_random_uuid() natively in core

-- 1. Create Supabase-compatible auth schema & auth.uid() if not already present
CREATE SCHEMA IF NOT EXISTS auth;

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.sub', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;

-- Create standard Postgres role used by Supabase authenticated sessions if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;

-- 2. Shared profiles table (6 roles from specification 0.7)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  full_name text NOT NULL,
  role text NOT NULL CHECK (
    role IN (
      'SUPER_ADMIN',
      'PLANNING_OFFICER',
      'FINANCE_OFFICER',
      'EXECUTIVE',
      'PROJECT_OWNER',
      'EVALUATOR'
    )
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  deleted_at timestamptz
);

-- 3. Shared audit_logs table (Constitution rule 5)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'SOFT_DELETE', 'DELETE', 'APPROVE', 'UNLOCK')),
  old_data jsonb,
  new_data jsonb,
  performed_by uuid,
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_at ON public.audit_logs(performed_at DESC);

-- 4. Security-definer helper function to inspect current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
    AND deleted_at IS NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_user_role() = ANY(allowed_roles), false);
$$;

-- 5. Generic trigger to auto-update updated_at and populate created_by
CREATE OR REPLACE FUNCTION public.handle_timestamps_and_author()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := COALESCE(NEW.created_at, now());
    NEW.updated_at := COALESCE(NEW.updated_at, now());
    IF NEW.created_by IS NULL AND auth.uid() IS NOT NULL THEN
      NEW.created_by := auth.uid();
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

-- 6. Financial audit log trigger function (Constitution rule 5)
CREATE OR REPLACE FUNCTION public.log_financial_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_record_id uuid;
  v_old jsonb := NULL;
  v_new jsonb := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'INSERT';
    v_record_id := NEW.id;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_record_id := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    IF (v_old ->> 'deleted_at') IS NULL AND (v_new ->> 'deleted_at') IS NOT NULL THEN
      v_action := 'SOFT_DELETE';
    ELSIF TG_TABLE_NAME = 'estimate_versions'
      AND ((v_old ->> 'status') IS DISTINCT FROM (v_new ->> 'status'))
      AND (v_new ->> 'status') = 'approved' THEN
      v_action := 'APPROVE';
    ELSIF TG_TABLE_NAME = 'estimate_versions'
      AND ((v_old ->> 'status') IN ('approved', 'locked'))
      AND ((v_new ->> 'status') IN ('draft', 'submitted')) THEN
      v_action := 'UNLOCK';
    ELSE
      v_action := 'UPDATE';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'DELETE';
    v_record_id := OLD.id;
    v_old := to_jsonb(OLD);
  END IF;

  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    performed_by,
    performed_at
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    v_action,
    v_old,
    v_new,
    auth.uid(),
    now()
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Trigger to prevent hard DELETE on soft-deletable tables (Constitution rule 3)
CREATE OR REPLACE FUNCTION public.prevent_hard_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Hard delete is forbidden by Constitution rule 3 on table %. Use soft delete (SET deleted_at = now()) instead.', TG_TABLE_NAME;
END;
$$;
