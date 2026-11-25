-- =============================================================================
-- 0003_revenue_rls.sql
-- Row-Level Security (RLS) policies for all tables & 6 roles (Specification 0.7)
-- =============================================================================

-- Enable & Force RLS on all tables
DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'profiles',
    'audit_logs',
    'fiscal_years',
    'estimate_versions',
    'parameters',
    'month_distribution',
    'rounding_rules',
    'programs',
    'fee_schedules',
    'tuition_lines',
    'service_projects',
    'research_projects',
    'rental_items',
    'carryover',
    'other_income_lines',
    'revenue_actuals',
    'expenditure_actuals',
    'allocation_dimensions',
    'allocation_items',
    'allocation_pcts',
    'historical_usage',
    'version_snapshots'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Helper: any active authenticated user with one of the 6 valid roles
CREATE OR REPLACE FUNCTION public.is_valid_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_any_role(ARRAY[
    'SUPER_ADMIN',
    'PLANNING_OFFICER',
    'FINANCE_OFFICER',
    'EXECUTIVE',
    'PROJECT_OWNER',
    'EVALUATOR'
  ]);
$$;

-- 1. profiles & audit_logs
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_valid_staff());

DROP POLICY IF EXISTS profiles_write_admin ON public.profiles;
CREATE POLICY profiles_write_admin ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['SUPER_ADMIN']))
  WITH CHECK (public.has_any_role(ARRAY['SUPER_ADMIN']));

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.is_valid_staff());

-- 2. System Configuration & Master Data:
-- parameters, rounding_rules, programs, fee_schedules, allocation_dimensions, allocation_items
-- Editable by SUPER_ADMIN (and PLANNING_OFFICER for month_distribution / master items when needed,
-- while parameters are strictly SUPER_ADMIN per 0.7: "SUPER_ADMIN: ทุกอย่าง รวมถึงแก้ parameters, ปลดล็อกเวอร์ชัน")
DO $$
DECLARE
  t text;
  admin_only_tables text[] := ARRAY[
    'parameters',
    'rounding_rules',
    'programs',
    'fee_schedules',
    'allocation_dimensions',
    'allocation_items'
  ];
BEGIN
  FOREACH t IN ARRAY admin_only_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_valid_staff())',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (public.has_any_role(ARRAY[''SUPER_ADMIN''])) WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'']))',
      t, t
    );
  END LOOP;
END
$$;

-- 3. fiscal_years & historical_usage (SUPER_ADMIN, PLANNING_OFFICER)
DO $$
DECLARE
  t text;
  planning_master_tables text[] := ARRAY['fiscal_years', 'historical_usage'];
BEGIN
  FOREACH t IN ARRAY planning_master_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_valid_staff())',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER''])) WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER'']))',
      t, t
    );
  END LOOP;
END
$$;

-- 4. estimate_versions
-- Read: all 6 roles
-- Insert: SUPER_ADMIN, PLANNING_OFFICER
-- Update:
--   - SUPER_ADMIN (all actions including unlock)
--   - PLANNING_OFFICER (update draft/submitted versions, submit for approval, cannot set status = approved/locked)
--   - EXECUTIVE (approve or reject/return submitted/draft versions)
DROP POLICY IF EXISTS estimate_versions_select ON public.estimate_versions;
CREATE POLICY estimate_versions_select ON public.estimate_versions
  FOR SELECT TO authenticated
  USING (public.is_valid_staff());

DROP POLICY IF EXISTS estimate_versions_insert ON public.estimate_versions;
CREATE POLICY estimate_versions_insert ON public.estimate_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(ARRAY['SUPER_ADMIN', 'PLANNING_OFFICER'])
    AND status IN ('draft', 'submitted')
  );

DROP POLICY IF EXISTS estimate_versions_update_admin ON public.estimate_versions;
CREATE POLICY estimate_versions_update_admin ON public.estimate_versions
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['SUPER_ADMIN']))
  WITH CHECK (public.has_any_role(ARRAY['SUPER_ADMIN']));

DROP POLICY IF EXISTS estimate_versions_update_planning ON public.estimate_versions;
CREATE POLICY estimate_versions_update_planning ON public.estimate_versions
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(ARRAY['PLANNING_OFFICER'])
  )
  WITH CHECK (
    public.has_any_role(ARRAY['PLANNING_OFFICER'])
    AND status IN ('draft', 'submitted')
  );

DROP POLICY IF EXISTS estimate_versions_update_executive ON public.estimate_versions;
CREATE POLICY estimate_versions_update_executive ON public.estimate_versions
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(ARRAY['EXECUTIVE'])
  )
  WITH CHECK (
    public.has_any_role(ARRAY['EXECUTIVE'])
    AND status IN ('draft', 'submitted', 'approved')
  );

-- 5. version_snapshots (Created on approval by EXECUTIVE or SUPER_ADMIN)
DROP POLICY IF EXISTS version_snapshots_select ON public.version_snapshots;
CREATE POLICY version_snapshots_select ON public.version_snapshots
  FOR SELECT TO authenticated
  USING (public.is_valid_staff());

DROP POLICY IF EXISTS version_snapshots_write ON public.version_snapshots;
CREATE POLICY version_snapshots_write ON public.version_snapshots
  FOR ALL TO authenticated
  USING (public.has_any_role(ARRAY['SUPER_ADMIN', 'EXECUTIVE']))
  WITH CHECK (public.has_any_role(ARRAY['SUPER_ADMIN', 'EXECUTIVE']));

-- 6. Planning estimate tables: month_distribution, tuition_lines, rental_items, other_income_lines, allocation_pcts
-- Editable by SUPER_ADMIN and PLANNING_OFFICER only when version is editable (not approved/locked)
DO $$
DECLARE
  t text;
  planning_version_tables text[] := ARRAY[
    'month_distribution',
    'tuition_lines',
    'rental_items',
    'other_income_lines',
    'allocation_pcts'
  ];
BEGIN
  FOREACH t IN ARRAY planning_version_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_valid_staff())',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY %I_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER'']) AND public.is_version_editable(version_id))',
      t, t
    );

    EXECUTE format(
      'CREATE POLICY %I_update ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER''])) WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER'']) AND public.is_version_editable(version_id))',
      t, t
    );
    EXECUTE format('DROP POLICY IF EXISTS %I_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_delete ON public.%I FOR DELETE TO authenticated USING (public.is_valid_staff())',
      t, t
    );
  END LOOP;
END
$$;

-- 7. service_projects & research_projects
-- Editable by:
--   - SUPER_ADMIN, PLANNING_OFFICER (when version is editable)
--   - PROJECT_OWNER (only own rows created_by = auth.uid() AND version status = 'draft')
DO $$
DECLARE
  t text;
  project_tables text[] := ARRAY['service_projects', 'research_projects'];
BEGIN
  FOREACH t IN ARRAY project_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_valid_staff())',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write_planning ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_insert_planning ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS %I_update_planning ON public.%I', t, t);

    EXECUTE format(
      'CREATE POLICY %I_insert_planning ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER'']) AND public.is_version_editable(version_id))',
      t, t
    );

    EXECUTE format(
      'CREATE POLICY %I_update_planning ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER''])) WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''PLANNING_OFFICER'']) AND public.is_version_editable(version_id))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_insert_owner ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_insert_owner ON public.%I FOR INSERT TO authenticated WITH CHECK (public.has_any_role(ARRAY[''PROJECT_OWNER'']) AND public.is_version_draft(version_id) AND (created_by IS NULL OR created_by = auth.uid()))',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_update_owner ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_update_owner ON public.%I FOR UPDATE TO authenticated USING (public.has_any_role(ARRAY[''PROJECT_OWNER'']) AND created_by = auth.uid()) WITH CHECK (public.has_any_role(ARRAY[''PROJECT_OWNER'']) AND public.is_version_draft(version_id) AND created_by = auth.uid())',
      t, t
    );
  END LOOP;
END
$$;

-- 8. Finance tables: carryover, revenue_actuals, expenditure_actuals
-- per 0.7: "FINANCE_OFFICER: บันทึกรายรับจริง รายจ่ายจริง เงินเหลือจ่ายยกมา"
DROP POLICY IF EXISTS carryover_select ON public.carryover;
CREATE POLICY carryover_select ON public.carryover
  FOR SELECT TO authenticated
  USING (public.is_valid_staff());

DROP POLICY IF EXISTS carryover_write ON public.carryover;
DROP POLICY IF EXISTS carryover_insert ON public.carryover;
DROP POLICY IF EXISTS carryover_update ON public.carryover;

CREATE POLICY carryover_insert ON public.carryover
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_any_role(ARRAY['SUPER_ADMIN', 'FINANCE_OFFICER', 'PLANNING_OFFICER'])
    AND public.is_version_editable(version_id)
  );

CREATE POLICY carryover_update ON public.carryover
  FOR UPDATE TO authenticated
  USING (
    public.has_any_role(ARRAY['SUPER_ADMIN', 'FINANCE_OFFICER', 'PLANNING_OFFICER'])
  )
  WITH CHECK (
    public.has_any_role(ARRAY['SUPER_ADMIN', 'FINANCE_OFFICER', 'PLANNING_OFFICER'])
    AND public.is_version_editable(version_id)
  );

DO $$
DECLARE
  t text;
  actual_tables text[] := ARRAY['revenue_actuals', 'expenditure_actuals'];
BEGIN
  FOREACH t IN ARRAY actual_tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_select ON public.%I FOR SELECT TO authenticated USING (public.is_valid_staff())',
      t, t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I_write ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_write ON public.%I FOR ALL TO authenticated USING (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''FINANCE_OFFICER''])) WITH CHECK (public.has_any_role(ARRAY[''SUPER_ADMIN'', ''FINANCE_OFFICER'']))',
      t, t
    );
  END LOOP;
END
$$;
