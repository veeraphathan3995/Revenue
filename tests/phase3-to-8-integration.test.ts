import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import {
  getRevenueWorkspaceData,
  mutateRevenueData,
} from '../lib/revenue/services/repository';
import { SEED_USERS } from '../lib/revenue/services/seed';

describe('Phases 3–8 — Full Repository, Dynamic Parameters, Workflow & Security QA', () => {
  it('1. Loads seeded 2571 workspace from DB and computes exact Golden Values through Pure Calc Engine', async () => {
    const ws = await getRevenueWorkspaceData();

    expect(ws.activeVersion.be_year).toBe(2571);
    expect(ws.calc.tuition.totals.grossYear).toBe(52996000);
    expect(ws.calc.tuition.totals.netYearRounded).toBe(39981000);
    expect(ws.calc.service.totals.gross).toBe(4059400);
    expect(ws.calc.service.totals.netRounded).toBe(2886000);
    expect(ws.calc.research.totals.netRounded).toBe(206000);
    expect(ws.calc.rental.totals.netRounded).toBe(988000);
    expect(ws.carryover.amount).toBe(4006000);
    expect(ws.calc.monthly.grandTotals.grossRounded).toBe(62365000);
    expect(ws.calc.monthly.grandTotals.netRounded).toBe(48067000);
    expect(ws.calc.allocation.totalBase).toBe(48067000);
    expect(ws.calc.allocation.allDimensionsValid).toBe(true);
  });

  it('2. PROMPT 3 Criterion: Changing deduction rate parameter (10% -> 12%) updates calculation results dynamically without code change, and blocks non-admin roles', async () => {
    const wsBefore = await getRevenueWorkspaceData();
    const rentParam = wsBefore.parameters.find((p: any) => p.key === 'RENT_DEDUCT');
    expect(rentParam).toBeTruthy();
    if (!rentParam) throw new Error('Missing RENT_DEDUCT');

    // PLANNING_OFFICER cannot edit parameters
    const denied = await mutateRevenueData(
      SEED_USERS.PLANNING_OFFICER.id,
      'update_parameter',
      { id: rentParam.id, valueNumeric: 0.12, valueText: null }
    );
    expect(denied.ok).toBe(false);

    // SUPER_ADMIN changes RENT_DEDUCT from 0.10 to 0.12
    const allowed = await mutateRevenueData(
      SEED_USERS.SUPER_ADMIN.id,
      'update_parameter',
      { id: rentParam.id, valueNumeric: 0.12, valueText: null }
    );
    expect(allowed.ok).toBe(true);

    const wsAfter = await getRevenueWorkspaceData();
    // With 12% deduction on 1,098,000 gross rent: deduction = 131,760, net = 966,240 -> rounded -3 = 966,000
    expect(wsAfter.calc.rental.totals.deductionYear).toBe(131760);
    expect(wsAfter.calc.rental.totals.netExact).toBe(966240);
    expect(wsAfter.calc.rental.totals.netRounded).toBe(966000);

    // Restore RENT_DEDUCT back to 0.10
    await mutateRevenueData(SEED_USERS.SUPER_ADMIN.id, 'update_parameter', {
      id: rentParam.id,
      valueNumeric: 0.1,
      valueText: null,
    });
  });

  it('3. PROMPT 7 & 8 Criterion: Approving version freezes snapshot, blocks edits, and allows cloning Version 2 ("ครั้งที่ 2")', async () => {
    const ws1 = await getRevenueWorkspaceData();
    const v1Id = ws1.activeVersion.id;

    // Submit and approve version 1
    const sub = await mutateRevenueData(
      SEED_USERS.PLANNING_OFFICER.id,
      'transition_version_status',
      { versionId: v1Id, targetStatus: 'submitted' }
    );
    expect(sub.ok).toBe(true);

    const app = await mutateRevenueData(
      SEED_USERS.EXECUTIVE.id,
      'transition_version_status',
      { versionId: v1Id, targetStatus: 'approved' }
    );
    expect(app.ok).toBe(true);

    // Editing approved version 1 must fail
    const editBlocked = await mutateRevenueData(
      SEED_USERS.PLANNING_OFFICER.id,
      'update_carryover',
      { versionId: v1Id, amount: 5000000 }
    );
    expect(editBlocked.ok).toBe(false);

    // Create Version 2 ("ครั้งที่ 2") from approved Version 1
    const cloneRes = await mutateRevenueData(
      SEED_USERS.PLANNING_OFFICER.id,
      'create_next_version',
      { sourceVersionId: v1Id }
    );
    expect(cloneRes.ok).toBe(true);
    const v2Id = cloneRes.data.newVersionId;
    expect(v2Id).toBeTruthy();

    const ws2 = await getRevenueWorkspaceData({ versionId: v2Id });
    expect(ws2.activeVersion.version_no).toBeGreaterThanOrEqual(2);
    expect(ws2.activeVersion.status).toBe('draft');
    expect(ws2.calc.monthly.grandTotals.netRounded).toBe(48067000);

    // Unlock v1 back to draft so default view remains editable for interactive demo
    await mutateRevenueData(SEED_USERS.SUPER_ADMIN.id, 'transition_version_status', {
      versionId: v1Id,
      targetStatus: 'draft',
    });
  });

  it('4. Multi-Year Estimation: Creates new Fiscal Year 2572 by copying from 2571 with automatic cohort shifting (67..71 -> 68..72)', async () => {
    const ws2571 = await getRevenueWorkspaceData();
    const v2571Id = ws2571.versions.find((v: any) => v.be_year === 2571 && v.version_no === 1)?.id;
    expect(v2571Id).toBeTruthy();

    // EVALUATOR cannot create a new fiscal year
    const evalDenied = await mutateRevenueData(
      SEED_USERS.EVALUATOR.id,
      'create_fiscal_year',
      {
        beYear: 2572,
        copyFromVersionId: v2571Id,
        copyEstimateLines: true,
        autoShiftCohorts: true,
      }
    );
    expect(evalDenied.ok).toBe(false);

    // PLANNING_OFFICER creates Fiscal Year 2572 copying from 2571 v1
    const create2572 = await mutateRevenueData(
      SEED_USERS.PLANNING_OFFICER.id,
      'create_fiscal_year',
      {
        beYear: 2572,
        label: 'ประมาณการรายรับ ปี 2572 ครั้งที่ 1',
        copyFromVersionId: v2571Id,
        copyEstimateLines: true,
        autoShiftCohorts: true,
      }
    );
    expect(create2572.ok).toBe(true);
    const v2572Id = create2572.data.newVersionId;
    expect(v2572Id).toBeTruthy();

    const ws2572 = await getRevenueWorkspaceData({ versionId: v2572Id });
    expect(ws2572.activeVersion.be_year).toBe(2572);
    expect(ws2572.activeVersion.version_no).toBe(1);

    // Verify cohort codes shifted from 71 to 72 (new cohort of 2572) and registration fee 314,000 is preserved
    const newCohort72Lines = ws2572.calc.tuition.lines.filter(
      (l: any) => l.cohortCode === '72'
    );
    expect(newCohort72Lines.length).toBeGreaterThan(0);
    expect(ws2572.calc.tuition.totals.registrationFeeTotal).toBe(314000);
    expect(ws2572.calc.monthly.grandTotals.netRounded).toBe(48067000);
    expect(ws2572.multiYearSummaries.some((s: any) => s.beYear === 2572)).toBe(true);
  });

  it('5. PROMPT 8 Criterion: Codebase grep check verifies no hardcoded business fee constants inside /lib/revenue/calc/*.ts', () => {
    const calcDir = path.join(process.cwd(), 'lib', 'revenue', 'calc');
    const files = fs.readdirSync(calcDir).filter((f) => f.endsWith('.ts'));
    const forbiddenLiterals = ['4500', '5000', '700', '540', '4006000'];

    for (const file of files) {
      const content = fs
        .readFileSync(path.join(calcDir, file), 'utf-8')
        // Strip comments before checking code literals
        .replace(/\/\/.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');

      for (const lit of forbiddenLiterals) {
        const regex = new RegExp(`\\b${lit}\\b`);
        expect(
          regex.test(content),
          `Found hardcoded business constant ${lit} in lib/revenue/calc/${file}`
        ).toBe(false);
      }
    }
  });
});
