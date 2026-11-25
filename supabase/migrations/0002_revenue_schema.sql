-- =============================================================================
-- 0002_revenue_schema.sql
-- Complete database schema for Revenue Estimation Module (Specification 0.5)
-- =============================================================================

-- 1. fiscal_years
CREATE TABLE IF NOT EXISTS public.fiscal_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  be_year integer UNIQUE NOT NULL CHECK (be_year BETWEEN 2550 AND 2650),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  CONSTRAINT chk_fiscal_years_dates CHECK (end_date > start_date)
);

-- 2. estimate_versions
CREATE TABLE IF NOT EXISTS public.estimate_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id),
  version_no integer NOT NULL CHECK (version_no >= 1),
  label text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'locked')),
  parent_version_id uuid REFERENCES public.estimate_versions(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (fiscal_year_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_estimate_versions_fy ON public.estimate_versions(fiscal_year_id);

-- Security-definer helper: check whether a version is editable (not approved/locked)
CREATE OR REPLACE FUNCTION public.is_version_editable(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.estimate_versions
    WHERE id = p_version_id
      AND status IN ('draft', 'submitted')
      AND deleted_at IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.is_version_draft(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.estimate_versions
    WHERE id = p_version_id
      AND status = 'draft'
      AND deleted_at IS NULL
  );
$$;

-- Trigger function to block modifications on child tables when version is approved or locked (Constitution rule 10)
CREATE OR REPLACE FUNCTION public.enforce_version_mutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.version_id;
  ELSE
    v_id := NEW.version_id;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT status INTO v_status
    FROM public.estimate_versions
    WHERE id = v_id;

    IF v_status IN ('approved', 'locked') THEN
      RAISE EXCEPTION 'Version % is % and cannot be modified (Constitution Rule 10). Create a new version instead.', v_id, v_status;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger function on estimate_versions itself to block edits once approved/locked unless SUPER_ADMIN is unlocking
CREATE OR REPLACE FUNCTION public.enforce_estimate_version_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('approved', 'locked') THEN
    -- Only SUPER_ADMIN can unlock or change an approved/locked version
    IF public.current_user_role() IS DISTINCT FROM 'SUPER_ADMIN' THEN
      RAISE EXCEPTION 'Approved or locked version % cannot be modified by role % (Constitution Rule 10).', OLD.id, public.current_user_role();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. parameters
CREATE TABLE IF NOT EXISTS public.parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.estimate_versions(id),
  key text NOT NULL,
  value_numeric numeric(14,4),
  value_text text,
  effective_be_year integer NOT NULL CHECK (effective_be_year BETWEEN 2550 AND 2650),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_parameters_version_key ON public.parameters(version_id, key);
CREATE INDEX IF NOT EXISTS idx_parameters_year_key ON public.parameters(effective_be_year, key);

-- 4. month_distribution
CREATE TABLE IF NOT EXISTS public.month_distribution (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  semester integer NOT NULL CHECK (semester IN (1, 2)),
  pct numeric(10,6) NOT NULL CHECK (pct >= 0 AND pct <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (version_id, semester, month_seq)
);

CREATE INDEX IF NOT EXISTS idx_month_distribution_version ON public.month_distribution(version_id);

-- 5. rounding_rules
CREATE TABLE IF NOT EXISTS public.rounding_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid REFERENCES public.estimate_versions(id),
  scope text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('trunc', 'round', 'floor', 'none')),
  digits integer NOT NULL DEFAULT -3,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (version_id, scope)
);

-- 6. programs
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name_th text NOT NULL,
  level text NOT NULL CHECK (level IN ('bachelor', 'master', 'doctoral')),
  report_group text NOT NULL CHECK (report_group IN ('1.1.1', '1.1.2', '1.1.3', '1.1.4', '1.1.5', '1.1.6', '1.1.7')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

-- 7. fee_schedules
CREATE TABLE IF NOT EXISTS public.fee_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('bachelor', 'master', 'doctoral')),
  library_fee numeric(14,2) NOT NULL CHECK (library_fee >= 0),
  it_fee numeric(14,2) NOT NULL CHECK (it_fee >= 0),
  health_fee numeric(14,2) NOT NULL CHECK (health_fee >= 0),
  registration_fee numeric(14,2) NOT NULL CHECK (registration_fee >= 0),
  total_deduction_per_head numeric(14,2) NOT NULL CHECK (total_deduction_per_head >= 0),
  library_refund_pct numeric(10,6) NOT NULL CHECK (library_refund_pct >= 0 AND library_refund_pct <= 1),
  effective_be_year integer NOT NULL CHECK (effective_be_year BETWEEN 2550 AND 2650),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (level, effective_be_year)
);

-- 8. tuition_lines
CREATE TABLE IF NOT EXISTS public.tuition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  program_id uuid NOT NULL REFERENCES public.programs(id),
  cohort_code text,
  line_type text NOT NULL CHECK (line_type IN ('regular', 'gen_ed_in', 'gen_ed_out')),
  headcount_sem2 integer NOT NULL DEFAULT 0 CHECK (headcount_sem2 >= 0),
  headcount_sem1 integer NOT NULL DEFAULT 0 CHECK (headcount_sem1 >= 0),
  fee_per_head numeric(14,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  CONSTRAINT chk_tuition_fee_sign CHECK (
    (line_type = 'gen_ed_out' AND fee_per_head <= 0)
    OR (line_type IN ('regular', 'gen_ed_in') AND fee_per_head >= 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_tuition_lines_version ON public.tuition_lines(version_id);
CREATE INDEX IF NOT EXISTS idx_tuition_lines_program ON public.tuition_lines(program_id);

-- 9. service_projects
CREATE TABLE IF NOT EXISTS public.service_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  name text NOT NULL,
  partner text,
  category text NOT NULL CHECK (category IN ('short_course', 'usac', 'le', 'school_activity')),
  batches integer NOT NULL DEFAULT 1 CHECK (batches >= 0),
  attendees_per_batch integer NOT NULL DEFAULT 0 CHECK (attendees_per_batch >= 0),
  fee_per_head numeric(14,2) NOT NULL DEFAULT 0 CHECK (fee_per_head >= 0),
  apply_mgmt_deduction boolean NOT NULL DEFAULT true,
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_service_projects_version ON public.service_projects(version_id);

-- 10. research_projects
CREATE TABLE IF NOT EXISTS public.research_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  name text NOT NULL,
  funder text,
  pi_name text,
  budget numeric(14,2) NOT NULL DEFAULT 0 CHECK (budget >= 0),
  overhead_rate_override numeric(10,6) CHECK (
    overhead_rate_override IS NULL OR (overhead_rate_override >= 0 AND overhead_rate_override <= 1)
  ),
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_research_projects_version ON public.research_projects(version_id);

-- 11. rental_items
CREATE TABLE IF NOT EXISTS public.rental_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  name text NOT NULL,
  tenant text,
  area_sqm numeric(10,2) CHECK (area_sqm IS NULL OR area_sqm >= 0),
  monthly_rent numeric(14,2) NOT NULL DEFAULT 0 CHECK (monthly_rent >= 0),
  start_month_seq integer NOT NULL CHECK (start_month_seq BETWEEN 1 AND 12),
  end_month_seq integer NOT NULL CHECK (end_month_seq BETWEEN 1 AND 12),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_rental_items_version ON public.rental_items(version_id);

-- 12. carryover
CREATE TABLE IF NOT EXISTS public.carryover (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid UNIQUE NOT NULL REFERENCES public.estimate_versions(id),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  source_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

-- 13. other_income_lines
CREATE TABLE IF NOT EXISTS public.other_income_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  name text NOT NULL,
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  gross numeric(14,2) NOT NULL DEFAULT 0 CHECK (gross >= 0),
  deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  CONSTRAINT chk_other_income_deduction CHECK (deduction <= gross)
);

CREATE INDEX IF NOT EXISTS idx_other_income_lines_version ON public.other_income_lines(version_id);

-- 14. revenue_actuals
CREATE TABLE IF NOT EXISTS public.revenue_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id),
  received_date date,
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  revenue_type text NOT NULL CHECK (
    revenue_type IN ('TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER', 'OTHER')
  ),
  source_name text NOT NULL,
  ref_no text,
  gross numeric(14,2) NOT NULL DEFAULT 0 CHECK (gross >= 0),
  deduction numeric(14,2) NOT NULL DEFAULT 0 CHECK (deduction >= 0),
  net numeric(14,2) GENERATED ALWAYS AS (gross - deduction) STORED,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_revenue_actuals_fy_month ON public.revenue_actuals(fiscal_year_id, month_seq);
CREATE INDEX IF NOT EXISTS idx_revenue_actuals_type ON public.revenue_actuals(fiscal_year_id, revenue_type);

-- 15. expenditure_actuals
CREATE TABLE IF NOT EXISTS public.expenditure_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year_id uuid NOT NULL REFERENCES public.fiscal_years(id),
  month_seq integer NOT NULL CHECK (month_seq BETWEEN 1 AND 12),
  amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (fiscal_year_id, month_seq)
);

-- 16. allocation_dimensions
CREATE TABLE IF NOT EXISTS public.allocation_dimensions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL CHECK (code IN ('plan', 'expense_category', 'strategic')),
  name_th text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

-- 17. allocation_items
CREATE TABLE IF NOT EXISTS public.allocation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_id uuid NOT NULL REFERENCES public.allocation_dimensions(id),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (dimension_id, name)
);

CREATE INDEX IF NOT EXISTS idx_allocation_items_dim ON public.allocation_items(dimension_id, sort_order);

-- 18. allocation_pcts
CREATE TABLE IF NOT EXISTS public.allocation_pcts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.estimate_versions(id),
  item_id uuid NOT NULL REFERENCES public.allocation_items(id),
  revenue_type text NOT NULL CHECK (
    revenue_type IN ('TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER', 'OTHER')
  ),
  pct numeric(10,6) NOT NULL DEFAULT 0 CHECK (pct >= 0 AND pct <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (version_id, item_id, revenue_type)
);

CREATE INDEX IF NOT EXISTS idx_allocation_pcts_version ON public.allocation_pcts(version_id);

-- 19. historical_usage
CREATE TABLE IF NOT EXISTS public.historical_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.allocation_items(id),
  be_year integer NOT NULL CHECK (be_year BETWEEN 2550 AND 2650),
  amount numeric(14,2) CHECK (amount IS NULL OR amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz,
  UNIQUE (item_id, be_year)
);

CREATE INDEX IF NOT EXISTS idx_historical_usage_item_year ON public.historical_usage(item_id, be_year);

-- 20. version_snapshots
CREATE TABLE IF NOT EXISTS public.version_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid UNIQUE NOT NULL REFERENCES public.estimate_versions(id),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  deleted_at timestamptz
);

-- =============================================================================
-- Attach timestamp/author, soft-delete enforcement, version-lock, and audit triggers
-- =============================================================================

DO $$
DECLARE
  t text;
  all_tables text[] := ARRAY[
    'profiles',
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
  versioned_tables text[] := ARRAY[
    'parameters',
    'month_distribution',
    'rounding_rules',
    'tuition_lines',
    'service_projects',
    'research_projects',
    'rental_items',
    'carryover',
    'other_income_lines',
    'allocation_pcts'
  ];
BEGIN
  FOREACH t IN ARRAY all_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_timestamps ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_timestamps BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_timestamps_and_author()',
      t, t
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_no_hard_delete ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_no_hard_delete BEFORE DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.prevent_hard_delete()',
      t, t
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_audit ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_audit AFTER INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_financial_audit()',
      t, t
    );
  END LOOP;

  FOREACH t IN ARRAY versioned_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_version_mutable ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_version_mutable BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_version_mutable()',
      t, t
    );
  END LOOP;
END
$$;

DROP TRIGGER IF EXISTS trg_estimate_versions_lock ON public.estimate_versions;
CREATE TRIGGER trg_estimate_versions_lock
BEFORE UPDATE ON public.estimate_versions
FOR EACH ROW EXECUTE FUNCTION public.enforce_estimate_version_lock();

-- Grant table permissions to authenticated role so RLS policies govern row access
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
