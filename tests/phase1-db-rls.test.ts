import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createOrOpenDb, execAsUser, runMigrations } from '../lib/revenue/services/db';
import { SEED_USERS, seedFromExcel2571, SeedSummary } from '../lib/revenue/services/seed';

describe('Phase 1 — Database Schema, Seed Data, RLS Policies (6 Roles), Version Lock & Audit Log', () => {
  let db: PGlite;
  let seedSummary: SeedSummary;

  beforeAll(async () => {
    db = await createOrOpenDb('memory');
    const applied = await runMigrations(db);
    expect(applied).toEqual([
      '0001_shared_profiles_audit.sql',
      '0002_revenue_schema.sql',
      '0003_revenue_rls.sql',
    ]);
    seedSummary = await seedFromExcel2571(db);
  });

  afterAll(async () => {
    await db.close();
  });

  describe('1. Seed Data Verification from 2571 Excel', () => {
    it('seeds fiscal year 2571, version 1, parameters, month_distribution, fee_schedules, programs, and all 5 revenue types', async () => {
      expect(seedSummary.fiscalYearBe).toBe(2571);
      expect(seedSummary.parametersCount).toBe(14);
      expect(seedSummary.monthDistributionCount).toBe(24);
      expect(seedSummary.feeSchedulesCount).toBe(2);
      expect(seedSummary.programsCount).toBe(16); // 8 degree programs + 8 gen-ed items
      expect(seedSummary.tuitionLinesCount).toBe(40);
      expect(seedSummary.serviceProjectsCount).toBe(20);
      expect(seedSummary.researchProjectsCount).toBe(3);
      expect(seedSummary.rentalItemsCount).toBe(29);
      expect(seedSummary.carryoverAmount).toBe(4006000);
      expect(seedSummary.allocationItemsCount).toBe(16); // 6 plan + 5 expense + 5 strategic
      expect(seedSummary.allocationPctsCount).toBe(80); // 16 items * 5 revenue types
      expect(seedSummary.historicalUsageCount).toBe(80); // 16 items * 5 years (2565-2569)
    });

    it('verifies month_distribution sums to 1.00 (100%) per semester (Sem 2: Mar 100%, Sem 1: Oct 25% + Sep 75%)', async () => {
      const sem2 = await db.query<{ month_seq: number; pct: string }>(
        `SELECT month_seq, pct FROM public.month_distribution WHERE version_id = $1 AND semester = 2 AND pct > 0`,
        [seedSummary.versionId]
      );
      expect(sem2.rows).toHaveLength(1);
      expect(sem2.rows[0].month_seq).toBe(6); // มี.ค.
      expect(Number(sem2.rows[0].pct)).toBeCloseTo(1.0, 6);

      const sem1 = await db.query<{ month_seq: number; pct: string }>(
        `SELECT month_seq, pct FROM public.month_distribution WHERE version_id = $1 AND semester = 1 AND pct > 0 ORDER BY month_seq`,
        [seedSummary.versionId]
      );
      expect(sem1.rows).toHaveLength(2);
      expect(sem1.rows[0].month_seq).toBe(1); // ต.ค. 25%
      expect(Number(sem1.rows[0].pct)).toBeCloseTo(0.25, 6);
      expect(sem1.rows[1].month_seq).toBe(12); // ก.ย. 75%
      expect(Number(sem1.rows[1].pct)).toBeCloseTo(0.75, 6);
    });

    it('stores null for empty historical_usage cells in strategic dimension (2565-2569)', async () => {
      const strategicNulls = await db.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt
         FROM public.historical_usage hu
         JOIN public.allocation_items ai ON ai.id = hu.item_id
         JOIN public.allocation_dimensions ad ON ad.id = ai.dimension_id
         WHERE ad.code = 'strategic' AND hu.amount IS NULL`
      );
      expect(Number(strategicNulls.rows[0].cnt)).toBe(25); // 5 items * 5 years all null in strategic table
    });
  });

  describe('2. Constraint Verification (pct 0..1, month_seq 1..12, amounts >= 0 except gen_ed_out)', () => {
    it('rejects month_seq outside 1..12 and pct outside 0..1', async () => {
      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct)
           VALUES ($1, 13, 1, 0.5)`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();

      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `UPDATE public.month_distribution SET pct = 1.5 WHERE version_id = $1 AND month_seq = 1 AND semester = 1`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();
    });

    it('rejects negative fee_per_head on regular tuition lines, but allows negative fee_per_head on gen_ed_out lines', async () => {
      const progRes = await db.query<{ id: string }>(
        `SELECT id FROM public.programs WHERE code = 'GOV' LIMIT 1`
      );
      const govId = progRes.rows[0].id;

      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `INSERT INTO public.tuition_lines (version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head)
           VALUES ($1, $2, '71', 'regular', 10, 10, -500)`,
          [seedSummary.versionId, govId]
        )
      ).rejects.toThrow();

      // gen_ed_out with negative fee_per_head is valid
      const insertGenOut = await execAsUser<{ id: string }>(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `INSERT INTO public.tuition_lines (version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head)
         VALUES ($1, $2, NULL, 'gen_ed_out', 10, 10, -540)
         RETURNING id`,
        [seedSummary.versionId, govId]
      );
      expect(insertGenOut.rows[0].id).toBeTruthy();
    });
  });

  describe('3. Criterion (ก): RLS Role Matrix Verification across all 6 Roles (Specification 0.7)', () => {
    it('EVALUATOR: read-only access across tables; cannot insert or update any table', async () => {
      const readRes = await execAsUser(
        db,
        SEED_USERS.EVALUATOR.id,
        `SELECT COUNT(*)::int AS cnt FROM public.tuition_lines WHERE version_id = $1`,
        [seedSummary.versionId]
      );
      expect(readRes.rows[0].cnt).toBeGreaterThanOrEqual(40);

      await expect(
        execAsUser(
          db,
          SEED_USERS.EVALUATOR.id,
          `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction)
           VALUES ($1, 'ดอกเบี้ยเงินฝาก', 1, 10000, 0)`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();

      const evalUpd = await execAsUser(
        db,
        SEED_USERS.EVALUATOR.id,
        `UPDATE public.carryover SET amount = 5000000 WHERE version_id = $1 RETURNING id`,
        [seedSummary.versionId]
      );
      expect(evalUpd.rows).toHaveLength(0);
    });

    it('PLANNING_OFFICER: can write estimate lines and allocation_pcts, but CANNOT edit parameters or revenue_actuals or approve version', async () => {
      // Can insert other_income_lines
      const ins = await execAsUser<{ id: string }>(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction)
         VALUES ($1, 'รายได้เบ็ดเตล็ด', 2, 25000, 0)
         RETURNING id`,
        [seedSummary.versionId]
      );
      expect(ins.rows[0].id).toBeTruthy();

      // Cannot update parameters (SUPER_ADMIN only)
      const paramUpdate = await execAsUser(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `UPDATE public.parameters SET value_numeric = 0.15 WHERE key = 'RENT_DEDUCT' RETURNING id`
      );
      expect(paramUpdate.rows).toHaveLength(0);

      // Cannot insert revenue_actuals (FINANCE_OFFICER / SUPER_ADMIN only)
      const fyRes = await db.query<{ id: string }>(`SELECT id FROM public.fiscal_years WHERE be_year = 2571`);
      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `INSERT INTO public.revenue_actuals (fiscal_year_id, month_seq, revenue_type, source_name, gross, deduction)
           VALUES ($1, 1, 'RENT', 'ร้านค้า', 10000, 1000)`,
          [fyRes.rows[0].id]
        )
      ).rejects.toThrow();

      // Cannot approve estimate_versions (EXECUTIVE / SUPER_ADMIN only)
      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `UPDATE public.estimate_versions SET status = 'approved' WHERE id = $1`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();
    });

    it('FINANCE_OFFICER: can record revenue_actuals, expenditure_actuals, and carryover, but CANNOT edit tuition_lines or parameters', async () => {
      const fyRes = await db.query<{ id: string }>(`SELECT id FROM public.fiscal_years WHERE be_year = 2571`);
      const fyId = fyRes.rows[0].id;

      // Insert revenue_actuals and verify generated net column
      const actRes = await execAsUser<{ id: string; net: string }>(
        db,
        SEED_USERS.FINANCE_OFFICER.id,
        `INSERT INTO public.revenue_actuals (fiscal_year_id, received_date, month_seq, revenue_type, source_name, ref_no, gross, deduction)
         VALUES ($1, '2027-10-15', 1, 'RENT', 'ค่าเช่าร้านกาแฟ ต.ค.', 'RC-001', 3000, 300)
         RETURNING id, net`,
        [fyId]
      );
      expect(Number(actRes.rows[0].net)).toBe(2700);

      // Insert expenditure_actuals
      const expRes = await execAsUser<{ id: string }>(
        db,
        SEED_USERS.FINANCE_OFFICER.id,
        `INSERT INTO public.expenditure_actuals (fiscal_year_id, month_seq, amount, note)
         VALUES ($1, 1, 1200000, 'รายจ่ายจริงเดือน ต.ค.')
         RETURNING id`,
        [fyId]
      );
      expect(expRes.rows[0].id).toBeTruthy();

      // Cannot update tuition_lines
      const tuitionUpd = await execAsUser(
        db,
        SEED_USERS.FINANCE_OFFICER.id,
        `UPDATE public.tuition_lines SET fee_per_head = 99999 WHERE version_id = $1 RETURNING id`,
        [seedSummary.versionId]
      );
      expect(tuitionUpd.rows).toHaveLength(0);
    });

    it('PROJECT_OWNER: can propose own service_projects / research_projects in draft version, cannot edit others rows or tuition_lines', async () => {
      // Can insert own service project in draft version
      const ownProj = await execAsUser<{ id: string; created_by: string }>(
        db,
        SEED_USERS.PROJECT_OWNER.id,
        `INSERT INTO public.service_projects (
           version_id, name, category, batches, attendees_per_batch, fee_per_head, apply_mgmt_deduction, month_seq
         ) VALUES ($1, 'โครงการอบรมเสนอโดยหัวหน้าโครงการ', 'short_course', 1, 30, 2000, true, 5)
         RETURNING id, created_by`,
        [seedSummary.versionId]
      );
      expect(ownProj.rows[0].created_by).toBe(SEED_USERS.PROJECT_OWNER.id);

      // Can update own row
      const updOwn = await execAsUser<{ id: string }>(
        db,
        SEED_USERS.PROJECT_OWNER.id,
        `UPDATE public.service_projects SET attendees_per_batch = 35 WHERE id = $1 RETURNING id`,
        [ownProj.rows[0].id]
      );
      expect(updOwn.rows).toHaveLength(1);

      // Cannot update rows created by SUPER_ADMIN / PLANNING_OFFICER
      const updOthers = await execAsUser(
        db,
        SEED_USERS.PROJECT_OWNER.id,
        `UPDATE public.service_projects SET attendees_per_batch = 999 WHERE id <> $1 RETURNING id`,
        [ownProj.rows[0].id]
      );
      expect(updOthers.rows).toHaveLength(0);

      // Cannot insert rental_items
      await expect(
        execAsUser(
          db,
          SEED_USERS.PROJECT_OWNER.id,
          `INSERT INTO public.rental_items (version_id, name, monthly_rent, start_month_seq, end_month_seq)
           VALUES ($1, 'ร้านค้าใหม่', 5000, 1, 12)`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();
    });

    it('SUPER_ADMIN: can update parameters and all system tables', async () => {
      const updParam = await execAsUser<{ id: string; value_numeric: string }>(
        db,
        SEED_USERS.SUPER_ADMIN.id,
        `UPDATE public.parameters
         SET value_numeric = 0.10
         WHERE version_id = $1 AND key = 'RENT_DEDUCT'
         RETURNING id, value_numeric`,
        [seedSummary.versionId]
      );
      expect(updParam.rows).toHaveLength(1);
      expect(Number(updParam.rows[0].value_numeric)).toBeCloseTo(0.1, 4);
    });
  });

  describe('4. Criterion (ข): Approved / Locked Version Immutability (Constitution Rule 10)', () => {
    it('blocks editing estimate lines and version metadata once EXECUTIVE approves the version, until SUPER_ADMIN unlocks or creates version 2', async () => {
      // Planning officer submits version
      const subRes = await execAsUser<{ status: string }>(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `UPDATE public.estimate_versions SET status = 'submitted' WHERE id = $1 RETURNING status`,
        [seedSummary.versionId]
      );
      expect(subRes.rows[0].status).toBe('submitted');

      // EXECUTIVE approves version
      const appRes = await execAsUser<{ status: string }>(
        db,
        SEED_USERS.EXECUTIVE.id,
        `UPDATE public.estimate_versions
         SET status = 'approved', approved_by = $2, approved_at = now()
         WHERE id = $1
         RETURNING status`,
        [seedSummary.versionId, SEED_USERS.EXECUTIVE.id]
      );
      expect(appRes.rows[0].status).toBe('approved');

      // Now PLANNING_OFFICER cannot insert or update any line in the approved version
      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction)
           VALUES ($1, 'รายการหลังอนุมัติ', 3, 5000, 0)`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();

      // Even SUPER_ADMIN is blocked by trigger from mutating child lines while version is still 'approved'
      await expect(
        execAsUser(
          db,
          SEED_USERS.SUPER_ADMIN.id,
          `UPDATE public.carryover SET amount = 9999999 WHERE version_id = $1`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow(/cannot be modified/i);

      // EXECUTIVE or PLANNING_OFFICER cannot unlock an approved version
      await expect(
        execAsUser(
          db,
          SEED_USERS.PLANNING_OFFICER.id,
          `UPDATE public.estimate_versions SET status = 'draft' WHERE id = $1`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow();

      // SUPER_ADMIN can unlock the version back to 'draft' for remaining tests
      const unlockRes = await execAsUser<{ status: string }>(
        db,
        SEED_USERS.SUPER_ADMIN.id,
        `UPDATE public.estimate_versions SET status = 'draft' WHERE id = $1 RETURNING status`,
        [seedSummary.versionId]
      );
      expect(unlockRes.rows[0].status).toBe('draft');
    });
  });

  describe('5. Criterion (ค): Soft Delete & Audit Logs Verification (Constitution Rules 3 & 5)', () => {
    it('prevents hard DELETE on financial tables and records SOFT_DELETE, INSERT, UPDATE, APPROVE, and UNLOCK in audit_logs', async () => {
      // Hard delete must fail
      await expect(
        execAsUser(
          db,
          SEED_USERS.SUPER_ADMIN.id,
          `DELETE FROM public.other_income_lines WHERE version_id = $1`,
          [seedSummary.versionId]
        )
      ).rejects.toThrow(/Hard delete is forbidden/i);

      // Soft delete by setting deleted_at = now()
      const targetLine = await execAsUser<{ id: string }>(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `SELECT id FROM public.other_income_lines WHERE version_id = $1 AND deleted_at IS NULL LIMIT 1`,
        [seedSummary.versionId]
      );
      const lineId = targetLine.rows[0].id;

      await execAsUser(
        db,
        SEED_USERS.PLANNING_OFFICER.id,
        `UPDATE public.other_income_lines SET deleted_at = now() WHERE id = $1`,
        [lineId]
      );

      // Verify audit_logs entry for SOFT_DELETE with old_data, new_data, performed_by, performed_at
      const auditSoftDel = await execAsUser<{
        action: string;
        performed_by: string;
        old_data: any;
        new_data: any;
      }>(
        db,
        SEED_USERS.EVALUATOR.id,
        `SELECT action, performed_by, old_data, new_data
         FROM public.audit_logs
         WHERE table_name = 'other_income_lines' AND record_id = $1 AND action = 'SOFT_DELETE'`,
        [lineId]
      );
      expect(auditSoftDel.rows).toHaveLength(1);
      expect(auditSoftDel.rows[0].performed_by).toBe(SEED_USERS.PLANNING_OFFICER.id);
      expect(auditSoftDel.rows[0].old_data.deleted_at).toBeNull();
      expect(auditSoftDel.rows[0].new_data.deleted_at).toBeTruthy();

      // Verify APPROVE and UNLOCK actions were recorded in audit_logs for estimate_versions
      const versionAudits = await execAsUser<{ action: string }>(
        db,
        SEED_USERS.EVALUATOR.id,
        `SELECT action FROM public.audit_logs WHERE table_name = 'estimate_versions' AND record_id = $1 ORDER BY performed_at`,
        [seedSummary.versionId]
      );
      const actions = versionAudits.rows.map((r) => r.action);
      expect(actions).toContain('INSERT');
      expect(actions).toContain('APPROVE');
      expect(actions).toContain('UNLOCK');
    });
  });
});
