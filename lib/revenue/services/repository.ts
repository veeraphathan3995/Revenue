import { PGlite } from '@electric-sql/pglite';
import {
  AllocationBaseAmounts,
  AllocationDimensionCode,
  AllocationDimensionInput,
  AllocationPercentageRow,
  calculateAllocation,
  calculateCarryoverTracker,
  calculateCompare,
  calculateMonthlySummary,
  calculateRental,
  calculateResearch,
  calculateService,
  calculateTuition,
  CompareMonthlySeries,
  FeeScheduleConfig,
  MonthDistributionConfig,
  ProgramLevelCode,
  RentalItemInput,
  ReportGroupCode,
  ResearchProjectInput,
  RevenueTypeCode,
  RoundingModeCode,
  RoundingRuleConfig,
  ServiceCategoryCode,
  ServiceProjectInput,
  TuitionLineInput,
  TuitionLineTypeCode,
} from '../calc';
import { applyRounding } from '../calc/rounding';
import {
  AllocationPctBatchUpdateSchema,
  CarryoverUpdateSchema,
  CreateFiscalYearSchema,
  ExpenditureActualUpsertSchema,
  FeeScheduleUpdateSchema,
  MonthDistributionUpdateSchema,
  OtherIncomeUpsertSchema,
  RentalItemUpsertSchema,
  ResearchProjectUpsertSchema,
  RevenueActualUpsertSchema,
  ServiceProjectUpsertSchema,
  TuitionLineUpsertSchema,
  UpdateParameterInputSchema,
  VersionTransitionSchema,
} from '../schemas';
import { createOrOpenDb, execAsUser, runMigrations } from './db';
import { SEED_USERS, seedFromExcel2571 } from './seed';

declare global {
  // eslint-disable-next-line no-var
  var __revenuePglitePromise: Promise<PGlite> | undefined;
}

export async function getSingletonDb(): Promise<PGlite> {
  if (!global.__revenuePglitePromise) {
    global.__revenuePglitePromise = (async () => {
      const db = await createOrOpenDb();
      await runMigrations(db);
      const countRes = await db.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM public.fiscal_years WHERE deleted_at IS NULL`
      );
      if ((countRes.rows[0]?.cnt ?? 0) === 0) {
        await seedFromExcel2571(db);
      }
      return db;
    })();
  }
  return global.__revenuePglitePromise;
}

export const THAI_MONTHS = [
  { seq: 1, short: 'ต.ค.', full: 'ตุลาคม' },
  { seq: 2, short: 'พ.ย.', full: 'พฤศจิกายน' },
  { seq: 3, short: 'ธ.ค.', full: 'ธันวาคม' },
  { seq: 4, short: 'ม.ค.', full: 'มกราคม' },
  { seq: 5, short: 'ก.พ.', full: 'กุมภาพันธ์' },
  { seq: 6, short: 'มี.ค.', full: 'มีนาคม' },
  { seq: 7, short: 'เม.ย.', full: 'เมษายน' },
  { seq: 8, short: 'พ.ค.', full: 'พฤษภาคม' },
  { seq: 9, short: 'มิ.ย.', full: 'มิถุนายน' },
  { seq: 10, short: 'ก.ค.', full: 'กรกฎาคม' },
  { seq: 11, short: 'ส.ค.', full: 'สิงหาคม' },
  { seq: 12, short: 'ก.ย.', full: 'กันยายน' },
];

export function getMonthBeYear(fiscalBeYear: number, monthSeq: number): number {
  return monthSeq <= 3 ? fiscalBeYear - 1 : fiscalBeYear;
}

// Prior year 2570 reference data from sheet 'สรุปรายรับ-รายจ่าย71' (stored internally, no external Excel links)
export const PRIOR_YEAR_2570_COMPARISON = {
  beYear: 2570,
  v1: {
    tuitionTotal: 33290000,
    groups: {
      '1.1.1': 5465000,
      '1.1.2': 5933000,
      '1.1.3': 6153000,
      '1.1.4': 6374000,
      '1.1.5': 1576000,
      '1.1.6': 3793000,
      '1.1.7': 3996000,
    },
    serviceTotal: 2844000,
    serviceCategories: {
      '1.2.1': 877500,
      '1.2.2': 1012500,
      '1.2.3': 954000,
    },
    otherAssetTotal: 1427000,
    rent_1_3_1: 927000,
    overhead_1_3_2: 500000,
    carryover_1_4: 6598300,
    grandTotal: 44159300,
    plans: {
      'แผนงานการเรียนการสอน': 22986900,
      'แผนงานวิจัย': 3920000,
      'แผนงานบริการวิชาการแก่สังคม': 1685200,
      'แผนงานการศาสนา ศิลปะ วัฒนธรรมฯ': 194300,
      'แผนงานสนับสนุนวิชาการ': 526000,
      'แผนงานบริหารมหาวิทยาลัย': 14846900,
    },
    expenses: {
      'งบบุคลากร': 8840300,
      'งบดำเนินงาน': 10286000,
      'งบเงินอุดหนุน': 15873300,
      'งบลงทุน': 6598300,
      'งบรายจ่ายอื่น': 2561400,
    },
  },
  v2: {
    tuitionTotal: 33290000,
    groups: {
      '1.1.1': 5465000,
      '1.1.2': 5933000,
      '1.1.3': 6153000,
      '1.1.4': 6374000,
      '1.1.5': 1576000,
      '1.1.6': 3793000,
      '1.1.7': 3996000,
    },
    serviceTotal: 2844000,
    serviceCategories: {
      '1.2.1': 877500,
      '1.2.2': 1012500,
      '1.2.3': 954000,
    },
    otherAssetTotal: 1427000,
    rent_1_3_1: 927000,
    overhead_1_3_2: 500000,
    carryover_1_4: 0,
    grandTotal: 37561000,
  },
};

export async function getRevenueWorkspaceData(options?: {
  versionId?: string;
  userId?: string;
  compareBasis?: 'net' | 'gross';
  compareMonthSeq?: number;
}) {
  const db = await getSingletonDb();
  const userId = options?.userId || SEED_USERS.SUPER_ADMIN.id;

  // 1. Load profiles
  const profilesRes = await db.query<{
    id: string;
    email: string;
    full_name: string;
    role: string;
  }>(`SELECT id, email, full_name, role FROM public.profiles WHERE deleted_at IS NULL ORDER BY role`);
  const activeUser =
    profilesRes.rows.find((p) => p.id === userId) ||
    profilesRes.rows[0] ||
    SEED_USERS.SUPER_ADMIN;

  // 2. Load fiscal years and versions
  const fyRes = await db.query<{
    id: string;
    be_year: number;
    start_date: string;
    end_date: string;
  }>(`SELECT id, be_year, start_date::text, end_date::text FROM public.fiscal_years WHERE deleted_at IS NULL ORDER BY be_year DESC`);

  const versionsRes = await db.query<{
    id: string;
    fiscal_year_id: string;
    be_year: number;
    version_no: number;
    label: string;
    status: string;
    parent_version_id: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT ev.id, ev.fiscal_year_id, fy.be_year, ev.version_no, ev.label, ev.status,
            ev.parent_version_id, ev.approved_by, ev.approved_at::text, ev.created_at::text, ev.updated_at::text
     FROM public.estimate_versions ev
     JOIN public.fiscal_years fy ON fy.id = ev.fiscal_year_id
     WHERE ev.deleted_at IS NULL
     ORDER BY fy.be_year DESC, ev.version_no DESC`
  );

  const activeVersion =
    (options?.versionId && versionsRes.rows.find((v) => v.id === options.versionId)) ||
    versionsRes.rows[0];

  if (!activeVersion) {
    throw new Error('ไม่พบข้อมูลเวอร์ชันประมาณการในฐานข้อมูล');
  }

  const versionId = activeVersion.id;
  const fiscalYearId = activeVersion.fiscal_year_id;
  const beYear = activeVersion.be_year;

  // 3. Load parameters, month_distribution, rounding_rules, fee_schedules, programs
  const paramsRes = await db.query<{
    id: string;
    version_id: string | null;
    key: string;
    value_numeric: string | null;
    value_text: string | null;
    effective_be_year: number;
    note: string | null;
    updated_at: string;
  }>(
    `SELECT id, version_id, key, value_numeric::text, value_text, effective_be_year, note, updated_at::text
     FROM public.parameters
     WHERE (version_id = $1 OR (version_id IS NULL AND effective_be_year = $2))
       AND deleted_at IS NULL
     ORDER BY key`,
    [versionId, beYear]
  );

  const paramNum = (key: string, fallback: number): number => {
    const row = paramsRes.rows.find((r) => r.key === key);
    if (!row || row.value_numeric === null) return fallback;
    return Number(row.value_numeric);
  };
  const paramStr = (key: string, fallback: string): string => {
    const row = paramsRes.rows.find((r) => r.key === key);
    if (!row || !row.value_text) return fallback;
    return row.value_text;
  };

  const distRes = await db.query<{
    id: string;
    month_seq: number;
    semester: number;
    pct: string;
  }>(
    `SELECT id, month_seq, semester, pct::text
     FROM public.month_distribution
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY month_seq, semester`,
    [versionId]
  );

  const monthDistribution: MonthDistributionConfig[] = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const s2 = distRes.rows.find((r) => r.month_seq === m && r.semester === 2);
    const s1 = distRes.rows.find((r) => r.month_seq === m && r.semester === 1);
    return {
      monthSeq: m,
      semester2Pct: s2 ? Number(s2.pct) : 0,
      semester1Pct: s1 ? Number(s1.pct) : 0,
    };
  });

  const roundingRes = await db.query<{
    id: string;
    scope: string;
    mode: RoundingModeCode;
    digits: number;
  }>(
    `SELECT id, scope, mode, digits
     FROM public.rounding_rules
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY scope`,
    [versionId]
  );
  const roundingMap = new Map<string, RoundingRuleConfig>();
  for (const r of roundingRes.rows) {
    roundingMap.set(r.scope, { scope: r.scope, mode: r.mode, digits: r.digits });
  }

  const feeSchedRes = await db.query<{
    id: string;
    level: ProgramLevelCode;
    library_fee: string;
    it_fee: string;
    health_fee: string;
    registration_fee: string;
    total_deduction_per_head: string;
    library_refund_pct: string;
    effective_be_year: number;
  }>(
    `SELECT id, level, library_fee::text, it_fee::text, health_fee::text, registration_fee::text,
            total_deduction_per_head::text, library_refund_pct::text, effective_be_year
     FROM public.fee_schedules
     WHERE effective_be_year = $1 AND deleted_at IS NULL
     ORDER BY level`,
    [beYear]
  );

  const defaultBachelorSched: FeeScheduleConfig = {
    level: 'bachelor',
    libraryFee: 700,
    itFee: 500,
    healthFee: 200,
    registrationFee: 1000,
    totalDeductionPerHead: 4500,
    libraryRefundPct: 0.6,
  };
  const defaultMasterSched: FeeScheduleConfig = {
    level: 'master',
    libraryFee: 1000,
    itFee: 1000,
    healthFee: 200,
    registrationFee: 1000,
    totalDeductionPerHead: 5000,
    libraryRefundPct: 0.6,
  };
  const feeSchedulesMap: Record<ProgramLevelCode, FeeScheduleConfig> = {
    bachelor: defaultBachelorSched,
    master: defaultMasterSched,
    doctoral: { ...defaultMasterSched, level: 'doctoral' },
  };
  for (const fsRow of feeSchedRes.rows) {
    feeSchedulesMap[fsRow.level] = {
      level: fsRow.level,
      libraryFee: Number(fsRow.library_fee),
      itFee: Number(fsRow.it_fee),
      healthFee: Number(fsRow.health_fee),
      registrationFee: Number(fsRow.registration_fee),
      totalDeductionPerHead: Number(fsRow.total_deduction_per_head),
      libraryRefundPct: Number(fsRow.library_refund_pct),
    };
  }

  const programsRes = await db.query<{
    id: string;
    code: string;
    name_th: string;
    level: ProgramLevelCode;
    report_group: ReportGroupCode;
  }>(
    `SELECT id, code, name_th, level, report_group
     FROM public.programs
     WHERE deleted_at IS NULL
     ORDER BY report_group, code`
  );

  // 4. Load 5 Revenue Type Lines
  const tuitionLinesRes = await db.query<{
    id: string;
    program_id: string;
    program_code: string;
    program_name: string;
    level: ProgramLevelCode;
    report_group: ReportGroupCode;
    cohort_code: string | null;
    line_type: TuitionLineTypeCode;
    headcount_sem2: number;
    headcount_sem1: number;
    fee_per_head: string;
  }>(
    `SELECT tl.id, tl.program_id, p.code AS program_code, p.name_th AS program_name,
            p.level, p.report_group, tl.cohort_code, tl.line_type,
            tl.headcount_sem2, tl.headcount_sem1, tl.fee_per_head::text
     FROM public.tuition_lines tl
     JOIN public.programs p ON p.id = tl.program_id
     WHERE tl.version_id = $1 AND tl.deleted_at IS NULL
     ORDER BY tl.created_at, p.report_group, tl.cohort_code NULLS LAST`,
    [versionId]
  );

  const tuitionInputs: TuitionLineInput[] = tuitionLinesRes.rows.map((r) => ({
    id: r.id,
    programId: r.program_id,
    programCode: r.program_code,
    programName: r.program_name,
    level: r.level,
    reportGroup: r.report_group,
    cohortCode: r.cohort_code,
    lineType: r.line_type,
    headcountSem2: r.headcount_sem2,
    headcountSem1: r.headcount_sem1,
    feePerHead: Number(r.fee_per_head),
  }));

  const serviceRes = await db.query<{
    id: string;
    name: string;
    partner: string | null;
    category: ServiceCategoryCode;
    batches: number;
    attendees_per_batch: number;
    fee_per_head: string;
    apply_mgmt_deduction: boolean;
    month_seq: number;
    note: string | null;
    created_by: string | null;
  }>(
    `SELECT id, name, partner, category, batches, attendees_per_batch, fee_per_head::text,
            apply_mgmt_deduction, month_seq, note, created_by
     FROM public.service_projects
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, id`,
    [versionId]
  );

  const serviceInputs: ServiceProjectInput[] = serviceRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    partner: r.partner,
    category: r.category,
    batches: r.batches,
    attendeesPerBatch: r.attendees_per_batch,
    feePerHead: Number(r.fee_per_head),
    applyMgmtDeduction: r.apply_mgmt_deduction,
    monthSeq: r.month_seq,
    note: r.note,
  }));

  const researchRes = await db.query<{
    id: string;
    name: string;
    funder: string | null;
    pi_name: string | null;
    budget: string;
    overhead_rate_override: string | null;
    month_seq: number;
    note: string | null;
    created_by: string | null;
  }>(
    `SELECT id, name, funder, pi_name, budget::text, overhead_rate_override::text,
            month_seq, note, created_by
     FROM public.research_projects
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, id`,
    [versionId]
  );

  const researchInputs: ResearchProjectInput[] = researchRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    funder: r.funder,
    piName: r.pi_name,
    budget: Number(r.budget),
    overheadRateOverride:
      r.overhead_rate_override !== null ? Number(r.overhead_rate_override) : null,
    monthSeq: r.month_seq,
    note: r.note,
  }));

  const rentalRes = await db.query<{
    id: string;
    name: string;
    tenant: string | null;
    area_sqm: string | null;
    monthly_rent: string;
    start_month_seq: number;
    end_month_seq: number;
    note: string | null;
  }>(
    `SELECT id, name, tenant, area_sqm::text, monthly_rent::text, start_month_seq, end_month_seq, note
     FROM public.rental_items
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY created_at, id`,
    [versionId]
  );

  const rentalInputs: RentalItemInput[] = rentalRes.rows.map((r) => ({
    id: r.id,
    name: r.name,
    tenant: r.tenant,
    areaSqm: r.area_sqm !== null ? Number(r.area_sqm) : null,
    monthlyRent: Number(r.monthly_rent),
    startMonthSeq: r.start_month_seq,
    endMonthSeq: r.end_month_seq,
    note: r.note,
  }));

  const carryoverRes = await db.query<{
    id: string;
    amount: string;
    source_note: string | null;
  }>(
    `SELECT id, amount::text, source_note
     FROM public.carryover
     WHERE version_id = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [versionId]
  );
  const carryoverRow = carryoverRes.rows[0] ?? {
    id: '',
    amount: '0',
    source_note: '',
  };
  const carryoverAmount = Number(carryoverRow.amount);

  const otherIncomeRes = await db.query<{
    id: string;
    name: string;
    month_seq: number;
    gross: string;
    deduction: string;
  }>(
    `SELECT id, name, month_seq, gross::text, deduction::text
     FROM public.other_income_lines
     WHERE version_id = $1 AND deleted_at IS NULL
     ORDER BY month_seq, created_at`,
    [versionId]
  );

  // 5. Execute Pure Calculation Engine
  const tuitionCalc = calculateTuition(tuitionInputs, {
    beYear,
    cmuPct: paramNum('CMU_PCT', 0.1),
    scholarshipPct: paramNum('SCHOLARSHIP_PCT', 0.2),
    feeSchedules: feeSchedulesMap,
    yearTotalRounding: roundingMap.get('TUITION_YEAR_TOTAL'),
  });

  const serviceCalc = calculateService(serviceInputs, {
    serviceDeduct1: paramNum('SERVICE_DEDUCT_1', 0.1),
    serviceDeduct2: paramNum('SERVICE_DEDUCT_2', 0.4),
    serviceDeduct2Base: paramStr('SERVICE_DEDUCT_2_BASE', 'after_d1') === 'gross' ? 'gross' : 'after_d1',
    yearTotalRounding: roundingMap.get('ACAD_SERVICE_YEAR_TOTAL'),
  });

  const researchCalc = calculateResearch(researchInputs, {
    ohDefaultRate: paramNum('OH_DEFAULT_RATE', 0),
    ohCentralPct: paramNum('OH_CENTRAL_PCT', 0),
    lineRounding: roundingMap.get('RESEARCH_OH_LINE'),
    yearTotalRounding: roundingMap.get('RESEARCH_OH_YEAR_TOTAL'),
  });

  const rentalCalc = calculateRental(rentalInputs, {
    rentDeductPct: paramNum('RENT_DEDUCT', 0.1),
    yearTotalRounding: roundingMap.get('RENT_YEAR_TOTAL'),
  });

  const monthlyCalc = calculateMonthlySummary({
    tuition: tuitionCalc,
    service: serviceCalc,
    research: researchCalc,
    rental: rentalCalc,
    carryoverAmount,
    otherIncome: otherIncomeRes.rows.map((o) => ({
      name: o.name,
      monthSeq: o.month_seq,
      gross: Number(o.gross),
      deduction: Number(o.deduction),
    })),
    monthDistribution,
  });

  // 6. Allocation across 3 dimensions
  const allocDimsRes = await db.query<{
    id: string;
    code: AllocationDimensionCode;
    name_th: string;
  }>(`SELECT id, code, name_th FROM public.allocation_dimensions WHERE deleted_at IS NULL ORDER BY id`);

  const allocItemsRes = await db.query<{
    id: string;
    dimension_id: string;
    dimension_code: AllocationDimensionCode;
    name: string;
    sort_order: number;
  }>(
    `SELECT ai.id, ai.dimension_id, ad.code AS dimension_code, ai.name, ai.sort_order
     FROM public.allocation_items ai
     JOIN public.allocation_dimensions ad ON ad.id = ai.dimension_id
     WHERE ai.deleted_at IS NULL
     ORDER BY ad.id, ai.sort_order`
  );

  const allocPctsRes = await db.query<{
    item_id: string;
    revenue_type: RevenueTypeCode;
    pct: string;
  }>(
    `SELECT item_id, revenue_type, pct::text
     FROM public.allocation_pcts
     WHERE version_id = $1 AND deleted_at IS NULL`,
    [versionId]
  );

  const histRes = await db.query<{
    item_id: string;
    be_year: number;
    amount: string | null;
  }>(
    `SELECT item_id, be_year, amount::text
     FROM public.historical_usage
     WHERE deleted_at IS NULL
     ORDER BY be_year`
  );

  const histMap: Record<string, Record<number, number | null>> = {};
  for (const h of histRes.rows) {
    if (!histMap[h.item_id]) histMap[h.item_id] = {};
    histMap[h.item_id][h.be_year] = h.amount !== null ? Number(h.amount) : null;
  }

  const baseAmounts: AllocationBaseAmounts = {
    TUITION: applyRounding(
      monthlyCalc.netByType.TUITION.yearTotalRounded,
      roundingMap.get('ALLOCATION_BASE_TUITION')?.mode ?? 'trunc',
      roundingMap.get('ALLOCATION_BASE_TUITION')?.digits ?? -3
    ).toNumber(),
    ACAD_SERVICE: applyRounding(
      monthlyCalc.netByType.ACAD_SERVICE.yearTotalRounded,
      roundingMap.get('ALLOCATION_BASE_OTHER')?.mode ?? 'trunc',
      roundingMap.get('ALLOCATION_BASE_OTHER')?.digits ?? -2
    ).toNumber(),
    RESEARCH_OH: applyRounding(
      monthlyCalc.netByType.RESEARCH_OH.yearTotalRounded,
      roundingMap.get('ALLOCATION_BASE_OTHER')?.mode ?? 'trunc',
      roundingMap.get('ALLOCATION_BASE_OTHER')?.digits ?? -2
    ).toNumber(),
    RENT: applyRounding(
      monthlyCalc.netByType.RENT.yearTotalRounded,
      roundingMap.get('ALLOCATION_BASE_OTHER')?.mode ?? 'trunc',
      roundingMap.get('ALLOCATION_BASE_OTHER')?.digits ?? -2
    ).toNumber(),
    CARRYOVER: applyRounding(
      monthlyCalc.netByType.CARRYOVER.yearTotalRounded,
      roundingMap.get('ALLOCATION_BASE_OTHER')?.mode ?? 'trunc',
      roundingMap.get('ALLOCATION_BASE_OTHER')?.digits ?? -2
    ).toNumber(),
  };

  const dimInputs: AllocationDimensionInput[] = allocDimsRes.rows.map((dim) => {
    const dimItems = allocItemsRes.rows.filter((i) => i.dimension_id === dim.id);
    const items: AllocationPercentageRow[] = dimItems.map((item) => {
      const pcts: Record<RevenueTypeCode, number> = {
        TUITION: 0,
        ACAD_SERVICE: 0,
        RESEARCH_OH: 0,
        RENT: 0,
        CARRYOVER: 0,
        OTHER: 0,
      };
      for (const p of allocPctsRes.rows) {
        if (p.item_id === item.id) {
          pcts[p.revenue_type] = Number(p.pct);
        }
      }
      return {
        itemId: item.id,
        itemName: item.name,
        sortOrder: item.sort_order,
        percentages: pcts,
      };
    });

    const scopeMap: Record<AllocationDimensionCode, string> = {
      plan: 'ALLOCATION_PLAN_ITEM',
      expense_category: 'ALLOCATION_EXPENSE_ITEM',
      strategic: 'ALLOCATION_STRATEGIC_ITEM',
    };

    return {
      dimensionCode: dim.code,
      dimensionName: dim.name_th,
      items,
      roundingRule: roundingMap.get(scopeMap[dim.code]),
      historicalUsage: histMap,
    };
  });

  const allocationCalc = calculateAllocation(dimInputs, baseAmounts);

  // 7. Actual Revenue & Expenditure + Carryover Tracker + Comparison
  const actualsRes = await db.query<{
    id: string;
    received_date: string | null;
    month_seq: number;
    revenue_type: RevenueTypeCode;
    source_name: string;
    ref_no: string | null;
    gross: string;
    deduction: string;
    net: string;
    note: string | null;
  }>(
    `SELECT id, received_date::text, month_seq, revenue_type, source_name, ref_no,
            gross::text, deduction::text, net::text, note
     FROM public.revenue_actuals
     WHERE fiscal_year_id = $1 AND deleted_at IS NULL
     ORDER BY month_seq, received_date NULLS LAST, created_at DESC`,
    [fiscalYearId]
  );

  const expendituresRes = await db.query<{
    id: string;
    month_seq: number;
    amount: string;
    note: string | null;
  }>(
    `SELECT id, month_seq, amount::text, note
     FROM public.expenditure_actuals
     WHERE fiscal_year_id = $1 AND deleted_at IS NULL
     ORDER BY month_seq`,
    [fiscalYearId]
  );

  const monthlyActualNetWithoutCarryover = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    return actualsRes.rows
      .filter((a) => a.month_seq === m && a.revenue_type !== 'CARRYOVER')
      .reduce((acc, a) => acc + Number(a.net), 0);
  });

  const monthlyExpenditure: (number | null)[] = Array.from({ length: 12 }, (_, idx) => {
    const m = idx + 1;
    const row = expendituresRes.rows.find((e) => e.month_seq === m);
    return row ? Number(row.amount) : null;
  });

  const carryoverTrackerCalc = calculateCarryoverTracker({
    openingBalance: carryoverAmount,
    monthlyActualNetWithoutCarryover,
    monthlyExpenditure,
  });

  // Build Compare series for net and gross
  const compareBasis = options?.compareBasis ?? 'net';
  const compareMonthSeq = options?.compareMonthSeq ?? 12;

  const revTypeLabels: Record<RevenueTypeCode, string> = {
    TUITION: '1. ค่าธรรมเนียมการศึกษา',
    ACAD_SERVICE: '2. บริการวิชาการ',
    RESEARCH_OH: '3. ค่า Overhead งานวิจัย',
    RENT: '4. ค่าเช่าพื้นที่ราชพัสดุ',
    CARRYOVER: '5. เงินเหลือจ่ายสะสมยกมา',
    OTHER: '6. รายได้อื่น',
  };

  const seriesByType: Record<RevenueTypeCode, CompareMonthlySeries> = {} as any;
  const allRevTypes: RevenueTypeCode[] = [
    'TUITION',
    'ACAD_SERVICE',
    'RESEARCH_OH',
    'RENT',
    'CARRYOVER',
    'OTHER',
  ];

  for (const rt of allRevTypes) {
    const estMatrix =
      compareBasis === 'net' ? monthlyCalc.netByType[rt] : monthlyCalc.grossByType[rt];
    const monthlyActual = Array.from({ length: 12 }, (_, idx) => {
      const m = idx + 1;
      return actualsRes.rows
        .filter((a) => a.month_seq === m && a.revenue_type === rt)
        .reduce((acc, a) => acc + Number(compareBasis === 'net' ? a.net : a.gross), 0);
    });

    seriesByType[rt] = {
      revenueType: rt,
      label: revTypeLabels[rt],
      monthlyEstimate: estMatrix.months,
      monthlyActual,
      annualEstimate: estMatrix.yearTotalRounded,
    };
  }

  const compareCalc = calculateCompare({
    basis: compareBasis,
    asOfMonthSeq: compareMonthSeq,
    seriesByType,
    statusHitThreshold: paramNum('STATUS_HIT', 1.0),
    statusNearThreshold: paramNum('STATUS_NEAR', 0.9),
  });

  // 8. Audit logs
  const auditLogsRes = await db.query<{
    id: string;
    table_name: string;
    record_id: string;
    action: string;
    old_data: any;
    new_data: any;
    performed_by: string | null;
    performer_name: string | null;
    performer_role: string | null;
    performed_at: string;
  }>(
    `SELECT al.id, al.table_name, al.record_id::text, al.action, al.old_data, al.new_data,
            al.performed_by::text, p.full_name AS performer_name, p.role AS performer_role,
            al.performed_at::text
     FROM public.audit_logs al
     LEFT JOIN public.profiles p ON p.id = al.performed_by
     ORDER BY al.performed_at DESC
     LIMIT 150`
  );

  // 9. Multi-year summary across all versions
  const multiYearSummariesRes = await db.query<{
    version_id: string;
    be_year: number;
    version_no: number;
    label: string;
    status: string;
    tuition_gross: string;
    service_gross: string;
    research_budget: string;
    rental_monthly_sum: string;
    carryover_amount: string;
    tuition_count: number;
    service_count: number;
    research_count: number;
    rental_count: number;
  }>(
    `SELECT
       ev.id AS version_id,
       fy.be_year,
       ev.version_no,
       ev.label,
       ev.status,
       COALESCE((SELECT SUM((headcount_sem2 + headcount_sem1) * fee_per_head) FROM public.tuition_lines tl WHERE tl.version_id = ev.id AND tl.deleted_at IS NULL), 0)::text AS tuition_gross,
       COALESCE((SELECT SUM(batches * attendees_per_batch * fee_per_head) FROM public.service_projects sp WHERE sp.version_id = ev.id AND sp.deleted_at IS NULL), 0)::text AS service_gross,
       COALESCE((SELECT SUM(budget) FROM public.research_projects rp WHERE rp.version_id = ev.id AND rp.deleted_at IS NULL), 0)::text AS research_budget,
       COALESCE((SELECT SUM(monthly_rent * GREATEST(0, end_month_seq - start_month_seq + 1)) FROM public.rental_items ri WHERE ri.version_id = ev.id AND ri.deleted_at IS NULL), 0)::text AS rental_monthly_sum,
       COALESCE((SELECT SUM(amount) FROM public.carryover c WHERE c.version_id = ev.id AND c.deleted_at IS NULL), 0)::text AS carryover_amount,
       (SELECT COUNT(*)::int FROM public.tuition_lines tl WHERE tl.version_id = ev.id AND tl.deleted_at IS NULL) AS tuition_count,
       (SELECT COUNT(*)::int FROM public.service_projects sp WHERE sp.version_id = ev.id AND sp.deleted_at IS NULL) AS service_count,
       (SELECT COUNT(*)::int FROM public.research_projects rp WHERE rp.version_id = ev.id AND rp.deleted_at IS NULL) AS research_count,
       (SELECT COUNT(*)::int FROM public.rental_items ri WHERE ri.version_id = ev.id AND ri.deleted_at IS NULL) AS rental_count
     FROM public.estimate_versions ev
     JOIN public.fiscal_years fy ON fy.id = ev.fiscal_year_id
     WHERE ev.deleted_at IS NULL
     ORDER BY fy.be_year DESC, ev.version_no DESC`
  );

  return {
    activeUser,
    profiles: profilesRes.rows,
    fiscalYears: fyRes.rows,
    versions: versionsRes.rows,
    multiYearSummaries: multiYearSummariesRes.rows.map((r) => ({
      versionId: r.version_id,
      beYear: r.be_year,
      versionNo: r.version_no,
      label: r.label,
      status: r.status,
      tuitionGross: Number(r.tuition_gross),
      serviceGross: Number(r.service_gross),
      researchBudget: Number(r.research_budget),
      rentalGross: Number(r.rental_monthly_sum),
      carryoverAmount: Number(r.carryover_amount),
      totalGross:
        Number(r.tuition_gross) +
        Number(r.service_gross) +
        Number(r.rental_monthly_sum) +
        Number(r.carryover_amount),
      tuitionCount: r.tuition_count,
      serviceCount: r.service_count,
      researchCount: r.research_count,
      rentalCount: r.rental_count,
    })),
    activeVersion,
    parameters: paramsRes.rows.map((r) => ({
      ...r,
      value_numeric: r.value_numeric !== null ? Number(r.value_numeric) : null,
    })),
    monthDistribution,
    roundingRules: roundingRes.rows,
    feeSchedules: feeSchedRes.rows.map((r) => ({
      id: r.id,
      level: r.level,
      libraryFee: Number(r.library_fee),
      itFee: Number(r.it_fee),
      healthFee: Number(r.health_fee),
      registrationFee: Number(r.registration_fee),
      totalDeductionPerHead: Number(r.total_deduction_per_head),
      libraryRefundPct: Number(r.library_refund_pct),
      effectiveBeYear: r.effective_be_year,
    })),
    programs: programsRes.rows,
    carryover: {
      id: carryoverRow.id,
      amount: carryoverAmount,
      sourceNote: carryoverRow.source_note ?? '',
    },
    otherIncomeLines: otherIncomeRes.rows.map((o) => ({
      id: o.id,
      name: o.name,
      monthSeq: o.month_seq,
      gross: Number(o.gross),
      deduction: Number(o.deduction),
      net: Number(o.gross) - Number(o.deduction),
    })),
    revenueActuals: actualsRes.rows.map((a) => ({
      id: a.id,
      receivedDate: a.received_date,
      monthSeq: a.month_seq,
      revenueType: a.revenue_type,
      sourceName: a.source_name,
      refNo: a.ref_no,
      gross: Number(a.gross),
      deduction: Number(a.deduction),
      net: Number(a.net),
      note: a.note,
    })),
    expenditureActuals: expendituresRes.rows.map((e) => ({
      id: e.id,
      monthSeq: e.month_seq,
      amount: Number(e.amount),
      note: e.note,
    })),
    calc: {
      tuition: tuitionCalc,
      service: serviceCalc,
      research: researchCalc,
      rental: rentalCalc,
      monthly: monthlyCalc,
      allocation: allocationCalc,
      carryoverTracker: carryoverTrackerCalc,
      compare: compareCalc,
    },
    priorYearComparison: PRIOR_YEAR_2570_COMPARISON,
    auditLogs: auditLogsRes.rows,
  };
}

// =============================================================================
// Server Mutations (Zod-validated + executed with RLS user session)
// =============================================================================

export async function mutateRevenueData(
  userId: string,
  action: string,
  payload: any
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const db = await getSingletonDb();

  try {
    switch (action) {
      case 'update_parameter': {
        const parsed = UpdateParameterInputSchema.parse(payload);
        const res = await execAsUser(
          db,
          userId,
          `UPDATE public.parameters
           SET value_numeric = $1, value_text = $2, note = COALESCE($3, note)
           WHERE id = $4
           RETURNING id`,
          [parsed.valueNumeric ?? null, parsed.valueText ?? null, parsed.note ?? null, parsed.id]
        );
        if (res.rows.length === 0) {
          throw new Error('ไม่มีสิทธิ์แก้ไขพารามิเตอร์ (ต้องเป็น SUPER_ADMIN) หรือไม่พบรายการ');
        }
        return { ok: true, data: res.rows[0] };
      }

      case 'update_month_distribution': {
        const parsed = MonthDistributionUpdateSchema.parse(payload);
        const sum2 = parsed.items.reduce((acc, i) => acc + i.semester2Pct, 0);
        const sum1 = parsed.items.reduce((acc, i) => acc + i.semester1Pct, 0);
        if (Math.abs(sum2 - 1) > 0.0001 || Math.abs(sum1 - 1) > 0.0001) {
          throw new Error(
            `สัดส่วนรายเดือนของแต่ละภาคเรียนต้องรวมเท่ากับ 100% (ภาค 2 = ${(sum2 * 100).toFixed(2)}%, ภาค 1 = ${(sum1 * 100).toFixed(2)}%)`
          );
        }
        for (const item of parsed.items) {
          await execAsUser(
            db,
            userId,
            `UPDATE public.month_distribution
             SET pct = $1
             WHERE version_id = $2 AND month_seq = $3 AND semester = 2`,
            [item.semester2Pct, parsed.versionId, item.monthSeq]
          );
          await execAsUser(
            db,
            userId,
            `UPDATE public.month_distribution
             SET pct = $1
             WHERE version_id = $2 AND month_seq = $3 AND semester = 1`,
            [item.semester1Pct, parsed.versionId, item.monthSeq]
          );
        }
        return { ok: true };
      }

      case 'update_fee_schedule': {
        const parsed = FeeScheduleUpdateSchema.parse(payload);
        const res = await execAsUser(
          db,
          userId,
          `UPDATE public.fee_schedules
           SET library_fee = $1, it_fee = $2, health_fee = $3, registration_fee = $4,
               total_deduction_per_head = $5, library_refund_pct = $6
           WHERE id = $7
           RETURNING id`,
          [
            parsed.libraryFee,
            parsed.itFee,
            parsed.healthFee,
            parsed.registrationFee,
            parsed.totalDeductionPerHead,
            parsed.libraryRefundPct,
            parsed.id,
          ]
        );
        if (res.rows.length === 0) {
          throw new Error('ไม่มีสิทธิ์แก้ไขอัตราหักค่าธรรมเนียม (ต้องเป็น SUPER_ADMIN)');
        }
        return { ok: true };
      }

      case 'upsert_tuition_line': {
        const parsed = TuitionLineUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.tuition_lines
             SET program_id = $1, cohort_code = $2, line_type = $3,
                 headcount_sem2 = $4, headcount_sem1 = $5, fee_per_head = $6
             WHERE id = $7
             RETURNING id`,
            [
              parsed.programId,
              parsed.cohortCode ?? null,
              parsed.lineType,
              parsed.headcountSem2,
              parsed.headcountSem1,
              parsed.feePerHead,
              parsed.id,
            ]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขข้อมูลค่าธรรมเนียม');
          return { ok: true, data: res.rows[0] };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.tuition_lines (
               version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head
             ) VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [
              parsed.versionId,
              parsed.programId,
              parsed.cohortCode ?? null,
              parsed.lineType,
              parsed.headcountSem2,
              parsed.headcountSem1,
              parsed.feePerHead,
            ]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'soft_delete_row': {
        const { table, id } = payload as { table: string; id: string };
        const allowedTables = [
          'tuition_lines',
          'service_projects',
          'research_projects',
          'rental_items',
          'other_income_lines',
          'revenue_actuals',
        ];
        if (!allowedTables.includes(table)) {
          throw new Error(`ไม่อนุญาตให้ลบข้อมูลจากตาราง ${table}`);
        }
        const res = await execAsUser(
          db,
          userId,
          `UPDATE public.${table} SET deleted_at = now() WHERE id = $1 RETURNING id`,
          [id]
        );
        if (res.rows.length === 0) {
          throw new Error('ไม่มีสิทธิ์ลบรายการนี้ หรือเวอร์ชันถูกล็อกแล้ว');
        }
        return { ok: true };
      }

      case 'upsert_service_project': {
        const parsed = ServiceProjectUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.service_projects
             SET name = $1, partner = $2, category = $3, batches = $4,
                 attendees_per_batch = $5, fee_per_head = $6, apply_mgmt_deduction = $7,
                 month_seq = $8, note = $9
             WHERE id = $10
             RETURNING id`,
            [
              parsed.name,
              parsed.partner ?? null,
              parsed.category,
              parsed.batches,
              parsed.attendeesPerBatch,
              parsed.feePerHead,
              parsed.applyMgmtDeduction,
              parsed.monthSeq,
              parsed.note ?? null,
              parsed.id,
            ]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขโครงการบริการวิชาการนี้');
          return { ok: true, data: res.rows[0] };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.service_projects (
               version_id, name, partner, category, batches, attendees_per_batch,
               fee_per_head, apply_mgmt_deduction, month_seq, note
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             RETURNING id`,
            [
              parsed.versionId,
              parsed.name,
              parsed.partner ?? null,
              parsed.category,
              parsed.batches,
              parsed.attendeesPerBatch,
              parsed.feePerHead,
              parsed.applyMgmtDeduction,
              parsed.monthSeq,
              parsed.note ?? null,
            ]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'upsert_research_project': {
        const parsed = ResearchProjectUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.research_projects
             SET name = $1, funder = $2, pi_name = $3, budget = $4,
                 overhead_rate_override = $5, month_seq = $6, note = $7
             WHERE id = $8
             RETURNING id`,
            [
              parsed.name,
              parsed.funder ?? null,
              parsed.piName ?? null,
              parsed.budget,
              parsed.overheadRateOverride ?? null,
              parsed.monthSeq,
              parsed.note ?? null,
              parsed.id,
            ]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขโครงการวิจัยนี้');
          return { ok: true, data: res.rows[0] };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.research_projects (
               version_id, name, funder, pi_name, budget, overhead_rate_override, month_seq, note
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              parsed.versionId,
              parsed.name,
              parsed.funder ?? null,
              parsed.piName ?? null,
              parsed.budget,
              parsed.overheadRateOverride ?? null,
              parsed.monthSeq,
              parsed.note ?? null,
            ]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'upsert_rental_item': {
        const parsed = RentalItemUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.rental_items
             SET name = $1, tenant = $2, area_sqm = $3, monthly_rent = $4,
                 start_month_seq = $5, end_month_seq = $6, note = $7
             WHERE id = $8
             RETURNING id`,
            [
              parsed.name,
              parsed.tenant ?? parsed.name,
              parsed.areaSqm ?? null,
              parsed.monthlyRent,
              parsed.startMonthSeq,
              parsed.endMonthSeq,
              parsed.note ?? null,
              parsed.id,
            ]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขรายการค่าเช่า');
          return { ok: true, data: res.rows[0] };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.rental_items (
               version_id, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id`,
            [
              parsed.versionId,
              parsed.name,
              parsed.tenant ?? parsed.name,
              parsed.areaSqm ?? null,
              parsed.monthlyRent,
              parsed.startMonthSeq,
              parsed.endMonthSeq,
              parsed.note ?? null,
            ]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'update_carryover': {
        const parsed = CarryoverUpdateSchema.parse(payload);
        const res = await execAsUser(
          db,
          userId,
          `UPDATE public.carryover
           SET amount = $1, source_note = COALESCE($2, source_note)
           WHERE version_id = $3
           RETURNING id`,
          [parsed.amount, parsed.sourceNote ?? null, parsed.versionId]
        );
        if (res.rows.length === 0) {
          throw new Error('ไม่มีสิทธิ์แก้ไขเงินเหลือจ่ายสะสมยกมา (ต้องเป็น FINANCE_OFFICER, PLANNING_OFFICER หรือ SUPER_ADMIN)');
        }
        return { ok: true };
      }

      case 'upsert_other_income': {
        const parsed = OtherIncomeUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.other_income_lines
             SET name = $1, month_seq = $2, gross = $3, deduction = $4
             WHERE id = $5
             RETURNING id`,
            [parsed.name, parsed.monthSeq, parsed.gross, parsed.deduction, parsed.id]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขรายได้อื่น');
          return { ok: true };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [parsed.versionId, parsed.name, parsed.monthSeq, parsed.gross, parsed.deduction]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'update_allocation_pcts': {
        const parsed = AllocationPctBatchUpdateSchema.parse(payload);
        // Group by revenueType and validate sum == 1.00
        const sumsByType: Record<string, number> = {};
        for (const entry of parsed.entries) {
          sumsByType[entry.revenueType] = (sumsByType[entry.revenueType] ?? 0) + entry.pct;
        }
        for (const [rt, sum] of Object.entries(sumsByType)) {
          if (Math.abs(sum - 1) > 0.0001) {
            throw new Error(
              `สัดส่วนการจัดสรรของคอลัมน์ ${rt} รวมได้ ${(sum * 100).toFixed(2)}% (ต้องรวมเท่ากับ 100% พอดี)`
            );
          }
        }
        for (const entry of parsed.entries) {
          await execAsUser(
            db,
            userId,
            `INSERT INTO public.allocation_pcts (version_id, item_id, revenue_type, pct)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (version_id, item_id, revenue_type)
             DO UPDATE SET pct = EXCLUDED.pct`,
            [parsed.versionId, entry.itemId, entry.revenueType, entry.pct]
          );
        }
        return { ok: true };
      }

      case 'upsert_revenue_actual': {
        const parsed = RevenueActualUpsertSchema.parse(payload);
        if (parsed.id) {
          const res = await execAsUser(
            db,
            userId,
            `UPDATE public.revenue_actuals
             SET received_date = $1, month_seq = $2, revenue_type = $3,
                 source_name = $4, ref_no = $5, gross = $6, deduction = $7, note = $8
             WHERE id = $9
             RETURNING id`,
            [
              parsed.receivedDate || null,
              parsed.monthSeq,
              parsed.revenueType,
              parsed.sourceName,
              parsed.refNo || null,
              parsed.gross,
              parsed.deduction,
              parsed.note || null,
              parsed.id,
            ]
          );
          if (res.rows.length === 0) throw new Error('ไม่มีสิทธิ์แก้ไขรายรับจริง (ต้องเป็น FINANCE_OFFICER หรือ SUPER_ADMIN)');
          return { ok: true };
        } else {
          const res = await execAsUser(
            db,
            userId,
            `INSERT INTO public.revenue_actuals (
               fiscal_year_id, received_date, month_seq, revenue_type, source_name, ref_no, gross, deduction, note
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              parsed.fiscalYearId,
              parsed.receivedDate || null,
              parsed.monthSeq,
              parsed.revenueType,
              parsed.sourceName,
              parsed.refNo || null,
              parsed.gross,
              parsed.deduction,
              parsed.note || null,
            ]
          );
          return { ok: true, data: res.rows[0] };
        }
      }

      case 'upsert_expenditure_actual': {
        const parsed = ExpenditureActualUpsertSchema.parse(payload);
        await execAsUser(
          db,
          userId,
          `INSERT INTO public.expenditure_actuals (fiscal_year_id, month_seq, amount, note)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (fiscal_year_id, month_seq)
           DO UPDATE SET amount = EXCLUDED.amount, note = COALESCE(EXCLUDED.note, public.expenditure_actuals.note)`,
          [parsed.fiscalYearId, parsed.monthSeq, parsed.amount, parsed.note || null]
        );
        return { ok: true };
      }

      case 'transition_version_status': {
        const parsed = VersionTransitionSchema.parse(payload);
        // Validate allocation and month distribution before submitting or approving
        if (parsed.targetStatus === 'submitted' || parsed.targetStatus === 'approved') {
          const ws = await getRevenueWorkspaceData({ versionId: parsed.versionId, userId });
          if (
            !ws.calc.monthly.distributionValidation.sem1Valid ||
            !ws.calc.monthly.distributionValidation.sem2Valid
          ) {
            throw new Error('ไม่สามารถส่งอนุมัติได้ เนื่องจากสัดส่วนการรับเงินรายเดือนยังไม่ครบ 100%');
          }
          if (!ws.calc.allocation.allDimensionsValid) {
            throw new Error('ไม่สามารถส่งอนุมัติได้ เนื่องจากสัดส่วนการจัดสรรงบประมาณบางคอลัมน์ยังไม่ครบ 100%');
          }
        }

        const isApproving = parsed.targetStatus === 'approved';
        const res = await execAsUser(
          db,
          userId,
          `UPDATE public.estimate_versions
           SET status = $1,
               approved_by = CASE WHEN $2 THEN $3::uuid ELSE approved_by END,
               approved_at = CASE WHEN $2 THEN now() ELSE approved_at END
           WHERE id = $4
           RETURNING id, status`,
          [parsed.targetStatus, isApproving, userId, parsed.versionId]
        );
        if (res.rows.length === 0) {
          throw new Error('ไม่มีสิทธิ์เปลี่ยนสถานะเวอร์ชันนี้');
        }

        if (isApproving) {
          const ws = await getRevenueWorkspaceData({ versionId: parsed.versionId, userId });
          await execAsUser(
            db,
            userId,
            `INSERT INTO public.version_snapshots (version_id, payload)
             VALUES ($1, $2::jsonb)
             ON CONFLICT (version_id) DO UPDATE SET payload = EXCLUDED.payload`,
            [parsed.versionId, JSON.stringify(ws.calc)]
          );
        }
        return { ok: true, data: res.rows[0] };
      }

      case 'create_next_version': {
        const { sourceVersionId, label } = payload as { sourceVersionId: string; label?: string };
        const srcVerRes = await db.query<{
          id: string;
          fiscal_year_id: string;
          version_no: number;
        }>(`SELECT id, fiscal_year_id, version_no FROM public.estimate_versions WHERE id = $1`, [
          sourceVersionId,
        ]);
        const srcVer = srcVerRes.rows[0];
        if (!srcVer) throw new Error('ไม่พบเวอร์ชันต้นทาง');

        const maxVerRes = await db.query<{ max_no: number }>(
          `SELECT COALESCE(MAX(version_no), 1)::int AS max_no FROM public.estimate_versions WHERE fiscal_year_id = $1`,
          [srcVer.fiscal_year_id]
        );
        const nextNo = (maxVerRes.rows[0]?.max_no ?? 1) + 1;
        const newLabel = label || `ประมาณการรายรับ ครั้งที่ ${nextNo} (ปรับปรุงระหว่างปี)`;

        const newVerRes = await execAsUser<{ id: string }>(
          db,
          userId,
          `INSERT INTO public.estimate_versions (
             fiscal_year_id, version_no, label, status, parent_version_id
           ) VALUES ($1, $2, $3, 'draft', $4)
           RETURNING id`,
          [srcVer.fiscal_year_id, nextNo, newLabel, sourceVersionId]
        );
        const newVersionId = newVerRes.rows[0].id;

        // Clone all child tables from sourceVersionId to newVersionId
        await db.query(
          `INSERT INTO public.parameters (version_id, key, value_numeric, value_text, effective_be_year, note, created_by)
           SELECT $1, key, value_numeric, value_text, effective_be_year, note, $3
           FROM public.parameters WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct, created_by)
           SELECT $1, month_seq, semester, pct, $3
           FROM public.month_distribution WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.rounding_rules (version_id, scope, mode, digits, created_by)
           SELECT $1, scope, mode, digits, $3
           FROM public.rounding_rules WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.tuition_lines (version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head, created_by)
           SELECT $1, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head, $3
           FROM public.tuition_lines WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.service_projects (version_id, name, partner, category, batches, attendees_per_batch, fee_per_head, apply_mgmt_deduction, month_seq, note, created_by)
           SELECT $1, name, partner, category, batches, attendees_per_batch, fee_per_head, apply_mgmt_deduction, month_seq, note, $3
           FROM public.service_projects WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.research_projects (version_id, name, funder, pi_name, budget, overhead_rate_override, month_seq, note, created_by)
           SELECT $1, name, funder, pi_name, budget, overhead_rate_override, month_seq, note, $3
           FROM public.research_projects WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.rental_items (version_id, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note, created_by)
           SELECT $1, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note, $3
           FROM public.rental_items WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.carryover (version_id, amount, source_note, created_by)
           SELECT $1, amount, source_note, $3
           FROM public.carryover WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction, created_by)
           SELECT $1, name, month_seq, gross, deduction, $3
           FROM public.other_income_lines WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );
        await db.query(
          `INSERT INTO public.allocation_pcts (version_id, item_id, revenue_type, pct, created_by)
           SELECT $1, item_id, revenue_type, pct, $3
           FROM public.allocation_pcts WHERE version_id = $2 AND deleted_at IS NULL`,
          [newVersionId, sourceVersionId, userId]
        );

        return { ok: true, data: { newVersionId } };
      }

      case 'create_fiscal_year': {
        const parsed = CreateFiscalYearSchema.parse(payload);
        const targetBeYear = parsed.beYear;
        const ceStartYear = targetBeYear - 543 - 1;
        const ceEndYear = targetBeYear - 543;

        // Verify role permission via execAsUser on fiscal_years
        const existingFy = await db.query<{ id: string }>(
          `SELECT id FROM public.fiscal_years WHERE be_year = $1 AND deleted_at IS NULL LIMIT 1`,
          [targetBeYear]
        );

        let targetFyId: string;
        if (existingFy.rows.length > 0) {
          targetFyId = existingFy.rows[0].id;
        } else {
          const insFy = await execAsUser<{ id: string }>(
            db,
            userId,
            `INSERT INTO public.fiscal_years (be_year, start_date, end_date)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [targetBeYear, `${ceStartYear}-10-01`, `${ceEndYear}-09-30`]
          );
          if (insFy.rows.length === 0) {
            throw new Error('ไม่มีสิทธิ์สร้างปีงบประมาณใหม่ (ต้องเป็น PLANNING_OFFICER หรือ SUPER_ADMIN)');
          }
          targetFyId = insFy.rows[0].id;
        }

        // Determine next version_no in target fiscal year
        const maxVerRes = await db.query<{ max_no: number }>(
          `SELECT COALESCE(MAX(version_no), 0)::int AS max_no
           FROM public.estimate_versions
           WHERE fiscal_year_id = $1 AND deleted_at IS NULL`,
          [targetFyId]
        );
        const nextVerNo = (maxVerRes.rows[0]?.max_no ?? 0) + 1;
        const verLabel =
          parsed.label?.trim() ||
          (nextVerNo === 1
            ? 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)'
            : `ประมาณการรายรับ ครั้งที่ ${nextVerNo} (ปรับปรุงระหว่างปี)`);

        // Determine source version to copy baseline settings from
        let sourceVersionId = parsed.copyFromVersionId || null;
        let sourceBeYear = 2571;
        if (sourceVersionId) {
          const srcInfo = await db.query<{ be_year: number }>(
            `SELECT fy.be_year
             FROM public.estimate_versions ev
             JOIN public.fiscal_years fy ON fy.id = ev.fiscal_year_id
             WHERE ev.id = $1 LIMIT 1`,
            [sourceVersionId]
          );
          if (srcInfo.rows[0]) {
            sourceBeYear = srcInfo.rows[0].be_year;
          }
        } else {
          const latestVer = await db.query<{ id: string; be_year: number }>(
            `SELECT ev.id, fy.be_year
             FROM public.estimate_versions ev
             JOIN public.fiscal_years fy ON fy.id = ev.fiscal_year_id
             WHERE ev.deleted_at IS NULL
             ORDER BY fy.be_year DESC, ev.version_no DESC
             LIMIT 1`
          );
          if (latestVer.rows[0]) {
            sourceVersionId = latestVer.rows[0].id;
            sourceBeYear = latestVer.rows[0].be_year;
          }
        }

        const newVerRes = await execAsUser<{ id: string }>(
          db,
          userId,
          `INSERT INTO public.estimate_versions (
             fiscal_year_id, version_no, label, status, parent_version_id
           ) VALUES ($1, $2, $3, 'draft', $4)
           RETURNING id`,
          [targetFyId, nextVerNo, verLabel, parsed.copyFromVersionId || null]
        );
        const newVersionId = newVerRes.rows[0].id;

        // Ensure fee_schedules exist for targetBeYear
        await db.query(
          `INSERT INTO public.fee_schedules (
             level, library_fee, it_fee, health_fee, registration_fee,
             total_deduction_per_head, library_refund_pct, effective_be_year, created_by
           )
           SELECT level, library_fee, it_fee, health_fee, registration_fee,
                  total_deduction_per_head, library_refund_pct, $1, $3
           FROM public.fee_schedules
           WHERE effective_be_year = $2 AND deleted_at IS NULL
           ON CONFLICT (level, effective_be_year) DO NOTHING`,
          [targetBeYear, sourceBeYear, userId]
        );

        if (sourceVersionId) {
          // Copy baseline parameters, month_distribution, rounding_rules, allocation_pcts
          await db.query(
            `INSERT INTO public.parameters (version_id, key, value_numeric, value_text, effective_be_year, note, created_by)
             SELECT $1, key, value_numeric, value_text, $3, note, $4
             FROM public.parameters WHERE version_id = $2 AND deleted_at IS NULL`,
            [newVersionId, sourceVersionId, targetBeYear, userId]
          );
          await db.query(
            `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct, created_by)
             SELECT $1, month_seq, semester, pct, $3
             FROM public.month_distribution WHERE version_id = $2 AND deleted_at IS NULL`,
            [newVersionId, sourceVersionId, userId]
          );
          await db.query(
            `INSERT INTO public.rounding_rules (version_id, scope, mode, digits, created_by)
             SELECT $1, scope, mode, digits, $3
             FROM public.rounding_rules WHERE version_id = $2 AND deleted_at IS NULL`,
            [newVersionId, sourceVersionId, userId]
          );
          await db.query(
            `INSERT INTO public.allocation_pcts (version_id, item_id, revenue_type, pct, created_by)
             SELECT $1, item_id, revenue_type, pct, $3
             FROM public.allocation_pcts WHERE version_id = $2 AND deleted_at IS NULL`,
            [newVersionId, sourceVersionId, userId]
          );

          if (parsed.copyEstimateLines) {
            const yearDiff = parsed.autoShiftCohorts ? targetBeYear - sourceBeYear : 0;
            const srcTuition = await db.query<{
              program_id: string;
              cohort_code: string | null;
              line_type: string;
              headcount_sem2: number;
              headcount_sem1: number;
              fee_per_head: string;
            }>(
              `SELECT program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head::text
               FROM public.tuition_lines
               WHERE version_id = $1 AND deleted_at IS NULL
               ORDER BY created_at`,
              [sourceVersionId]
            );

            for (const tl of srcTuition.rows) {
              let shiftedCohort = tl.cohort_code;
              if (
                yearDiff !== 0 &&
                tl.cohort_code &&
                /^\d+$/.test(tl.cohort_code.trim())
              ) {
                const num = Number(tl.cohort_code.trim());
                shiftedCohort = String((num + yearDiff + 100) % 100).padStart(2, '0');
              }
              await db.query(
                `INSERT INTO public.tuition_lines (
                   version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head, created_by
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [
                  newVersionId,
                  tl.program_id,
                  shiftedCohort,
                  tl.line_type,
                  tl.headcount_sem2,
                  tl.headcount_sem1,
                  Number(tl.fee_per_head),
                  userId,
                ]
              );
            }

            await db.query(
              `INSERT INTO public.service_projects (version_id, name, partner, category, batches, attendees_per_batch, fee_per_head, apply_mgmt_deduction, month_seq, note, created_by)
               SELECT $1, name, partner, category, batches, attendees_per_batch, fee_per_head, apply_mgmt_deduction, month_seq, note, $3
               FROM public.service_projects WHERE version_id = $2 AND deleted_at IS NULL`,
              [newVersionId, sourceVersionId, userId]
            );
            await db.query(
              `INSERT INTO public.research_projects (version_id, name, funder, pi_name, budget, overhead_rate_override, month_seq, note, created_by)
               SELECT $1, name, funder, pi_name, budget, overhead_rate_override, month_seq, note, $3
               FROM public.research_projects WHERE version_id = $2 AND deleted_at IS NULL`,
              [newVersionId, sourceVersionId, userId]
            );
            await db.query(
              `INSERT INTO public.rental_items (version_id, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note, created_by)
               SELECT $1, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note, $3
               FROM public.rental_items WHERE version_id = $2 AND deleted_at IS NULL`,
              [newVersionId, sourceVersionId, userId]
            );
            await db.query(
              `INSERT INTO public.carryover (version_id, amount, source_note, created_by)
               SELECT $1, amount, source_note, $3
               FROM public.carryover WHERE version_id = $2 AND deleted_at IS NULL`,
              [newVersionId, sourceVersionId, userId]
            );
            await db.query(
              `INSERT INTO public.other_income_lines (version_id, name, month_seq, gross, deduction, created_by)
               SELECT $1, name, month_seq, gross, deduction, $3
               FROM public.other_income_lines WHERE version_id = $2 AND deleted_at IS NULL`,
              [newVersionId, sourceVersionId, userId]
            );
          } else {
            // Blank estimate lines with 0 carryover
            await db.query(
              `INSERT INTO public.carryover (version_id, amount, source_note, created_by)
               VALUES ($1, 0, $2, $3)`,
              [newVersionId, `ยอดยกมาตั้งต้นปีงบประมาณ พ.ศ. ${targetBeYear}`, userId]
            );
          }
        }

        return { ok: true, data: { newVersionId, beYear: targetBeYear } };
      }

      default:
        throw new Error(`ไม่รู้จักคำสั่ง: ${action}`);
    }
  } catch (err: any) {
    if (err?.issues && Array.isArray(err.issues)) {
      const msg = err.issues.map((i: any) => `${i.path.join('.')}: ${i.message}`).join(', ');
      return { ok: false, error: `ข้อมูลไม่ผ่านการตรวจสอบ (Zod): ${msg}` };
    }
    return { ok: false, error: err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล' };
  }
}
