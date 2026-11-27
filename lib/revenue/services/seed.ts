import { PGlite } from '@electric-sql/pglite';
import ExcelJS from 'exceljs';
import path from 'path';

export const SEED_USERS = {
  SUPER_ADMIN: {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'admin@polsci.cmu.ac.th',
    full_name: 'ผู้ดูแลระบบสูงสุด (Super Admin)',
    role: 'SUPER_ADMIN',
  },
  PLANNING_OFFICER: {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'planning@polsci.cmu.ac.th',
    full_name: 'เจ้าหน้าที่แผนและงบประมาณ',
    role: 'PLANNING_OFFICER',
  },
  FINANCE_OFFICER: {
    id: '33333333-3333-4333-8333-333333333333',
    email: 'finance@polsci.cmu.ac.th',
    full_name: 'เจ้าหน้าที่การเงินและบัญชี',
    role: 'FINANCE_OFFICER',
  },
  EXECUTIVE: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'dean@polsci.cmu.ac.th',
    full_name: 'ผู้บริหารคณะ (คณบดี/รองคณบดี)',
    role: 'EXECUTIVE',
  },
  PROJECT_OWNER: {
    id: '55555555-5555-4555-8555-555555555555',
    email: 'owner@polsci.cmu.ac.th',
    full_name: 'หัวหน้าโครงการบริการวิชาการ/วิจัย',
    role: 'PROJECT_OWNER',
  },
  EVALUATOR: {
    id: '66666666-6666-4666-8666-666666666666',
    email: 'evaluator@polsci.cmu.ac.th',
    full_name: 'ผู้ประเมิน/ตรวจสอบภายใน',
    role: 'EVALUATOR',
  },
} as const;

const THAI_MONTH_TO_SEQ: Record<string, number> = {
  'ต.ค.': 1,
  'พ.ย.': 2,
  'ธ.ค.': 3,
  'ม.ค.': 4,
  'ก.พ.': 5,
  'มี.ค.': 6,
  'เม.ย.': 7,
  'พ.ค.': 8,
  'มิ.ย.': 9,
  'ก.ค.': 10,
  'ส.ค.': 11,
  'ก.ย.': 12,
};

function getCellNum(cell: ExcelJS.Cell): number {
  const v = cell.value;
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const parsed = Number(v.replace(/,/g, '').trim());
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof v === 'object') {
    if ('result' in v && typeof v.result === 'number') return v.result;
  }
  return 0;
}

function getCellStr(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') {
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((rt: any) => rt.text).join('').trim();
    }
    if ('result' in v && v.result !== undefined && v.result !== null) {
      return String(v.result).trim();
    }
  }
  return '';
}

export interface SeedSummary {
  fiscalYearBe: number;
  versionId: string;
  parametersCount: number;
  monthDistributionCount: number;
  feeSchedulesCount: number;
  programsCount: number;
  tuitionLinesCount: number;
  serviceProjectsCount: number;
  researchProjectsCount: number;
  rentalItemsCount: number;
  carryoverAmount: number;
  allocationItemsCount: number;
  allocationPctsCount: number;
  historicalUsageCount: number;
}

export async function seedFromExcel2571(
  db: PGlite,
  excelPath: string = path.join(process.cwd(), 'reference', 'Revenue_Estimate_Template2571.xlsx')
): Promise<SeedSummary> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(excelPath);

  // Set session user to SUPER_ADMIN for audit trail
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${SEED_USERS.SUPER_ADMIN.id}', false);`);

  // 1. Seed 6 role profiles
  for (const u of Object.values(SEED_USERS)) {
    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [u.id, u.email, u.full_name, u.role]
    );
  }

  // 2. Read 'ตั้งค่า' sheet
  const wsSettings = wb.getWorksheet('ตั้งค่า');
  if (!wsSettings) {
    throw new Error('Missing worksheet: ตั้งค่า');
  }

  const beYear = getCellNum(wsSettings.getCell('B3')) || 2571;
  const ceStartYear = beYear - 543 - 1; // 2571 -> Oct 1, 2027 (2570 BE)
  const ceEndYear = beYear - 543; // Sep 30, 2028 (2571 BE)

  const fyRes = await db.query<{ id: string }>(
    `INSERT INTO public.fiscal_years (be_year, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (be_year) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date
     RETURNING id`,
    [beYear, `${ceStartYear}-10-01`, `${ceEndYear}-09-30`, SEED_USERS.SUPER_ADMIN.id]
  );
  const fiscalYearId = fyRes.rows[0].id;

  const verRes = await db.query<{ id: string }>(
    `INSERT INTO public.estimate_versions (fiscal_year_id, version_no, label, status, created_by)
     VALUES ($1, 1, 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)', 'draft', $2)
     ON CONFLICT (fiscal_year_id, version_no) DO UPDATE SET label = EXCLUDED.label
     RETURNING id`,
    [fiscalYearId, SEED_USERS.PLANNING_OFFICER.id]
  );
  const versionId = verRes.rows[0].id;

  // 3. Seed parameters (from 'ตั้งค่า' + business parameters from Constitution 0.3 & 0.6)
  const serviceDeduct1 = getCellNum(wsSettings.getCell('B7')); // 0.10
  const serviceDeduct2 = getCellNum(wsSettings.getCell('B8')); // 0.40
  const ohDefaultRate = getCellNum(wsSettings.getCell('B9')); // 0.00
  const ohCentralPct = getCellNum(wsSettings.getCell('B10')); // 0.00
  const rentDeduct = getCellNum(wsSettings.getCell('B11')); // 0.10
  const cmuPct = getCellNum(wsSettings.getCell('B12')); // 0.10
  const orgName = getCellStr(wsSettings.getCell('B4'));

  const paramsToInsert: Array<{
    key: string;
    value_numeric: number | null;
    value_text: string | null;
    note: string;
  }> = [
    {
      key: 'ORG_NAME',
      value_numeric: null,
      value_text: orgName,
      note: 'ชื่อหน่วยงานจากแผ่นตั้งค่า B4',
    },
    {
      key: 'SERVICE_DEDUCT_1',
      value_numeric: serviceDeduct1,
      value_text: null,
      note: 'บริการวิชาการ – หักที่ 1 (ส่วนกลาง) % ของรายรับ (ตั้งค่า B7)',
    },
    {
      key: 'SERVICE_DEDUCT_2',
      value_numeric: serviceDeduct2,
      value_text: null,
      note: 'บริการวิชาการ – หักที่ 2 (บริหารจัดการ) % (ตั้งค่า B8)',
    },
    {
      key: 'SERVICE_DEDUCT_2_BASE',
      value_numeric: null,
      value_text: 'after_d1',
      note: 'ฐานการคำนวณหักบริหารจัดการ 40%: after_d1 (หักจากยอดหลังหัก 10% ตามสูตร Excel) หรือ gross',
    },
    {
      key: 'OH_DEFAULT_RATE',
      value_numeric: ohDefaultRate,
      value_text: null,
      note: 'งานวิจัย – อัตรา Overhead เริ่มต้น (ตั้งค่า B9)',
    },
    {
      key: 'OH_CENTRAL_PCT',
      value_numeric: ohCentralPct,
      value_text: null,
      note: 'งานวิจัย – อัตราหักส่งส่วนกลางจาก Overhead (ตั้งค่า B10)',
    },
    {
      key: 'RENT_DEDUCT',
      value_numeric: rentDeduct,
      value_text: null,
      note: 'ค่าเช่าราชพัสดุ – อัตราหักส่งส่วนกลาง (ตั้งค่า B11)',
    },
    {
      key: 'CMU_PCT',
      value_numeric: cmuPct,
      value_text: null,
      note: 'ค่าธรรมเนียมการศึกษา – หักให้ มช. % ของรายรับสุทธิหลังหักค่าใช้จ่าย (ตั้งค่า B12)',
    },
    {
      key: 'GEN_ED_RATE_IN',
      value_numeric: 540,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษาทั่วไป Pay-in ต่อหัว (บาท)',
    },
    {
      key: 'GEN_ED_RATE_OUT_DEFAULT',
      value_numeric: -540,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษานอกคณะ Pay-out ต่อหัว มาตรฐาน (บาท)',
    },
    {
      key: 'GEN_ED_RATE_OUT_STB',
      value_numeric: -500,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษานอกคณะ Pay-out หลักสูตร STB ต่อหัว (บาท)',
    },
    {
      key: 'SCHOLARSHIP_PCT',
      value_numeric: 0.2,
      value_text: null,
      note: 'สัดส่วนทุนการศึกษาและพัฒนา นศ. (20% ในแผ่น Dashboard)',
    },
    {
      key: 'STATUS_HIT',
      value_numeric: 1.0,
      value_text: null,
      note: 'เกณฑ์สถานะเทียบรับจริง ถึงเป้า (>= 100%)',
    },
    {
      key: 'STATUS_NEAR',
      value_numeric: 0.9,
      value_text: null,
      note: 'เกณฑ์สถานะเทียบรับจริง ใกล้เป้า (>= 90%)',
    },
  ];

  for (const p of paramsToInsert) {
    await db.query(
      `INSERT INTO public.parameters (version_id, key, value_numeric, value_text, effective_be_year, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [versionId, p.key, p.value_numeric, p.value_text, beYear, p.note]
    );
  }

  // 4. Seed month_distribution (rows 16..27 in 'ตั้งค่า': col D = semester 2, col E = semester 1)
  let monthDistributionCount = 0;
  for (let m = 1; m <= 12; m++) {
    const rowIdx = 15 + m;
    const pctSem2 = getCellNum(wsSettings.getCell(`D${rowIdx}`));
    const pctSem1 = getCellNum(wsSettings.getCell(`E${rowIdx}`));

    await db.query(
      `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct)
       VALUES ($1, $2, 2, $3)
       ON CONFLICT (version_id, semester, month_seq) DO UPDATE SET pct = EXCLUDED.pct`,
      [versionId, m, pctSem2]
    );
    await db.query(
      `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct)
       VALUES ($1, $2, 1, $3)
       ON CONFLICT (version_id, semester, month_seq) DO UPDATE SET pct = EXCLUDED.pct`,
      [versionId, m, pctSem1]
    );
    monthDistributionCount += 2;
  }

  // 5. Seed rounding_rules (matching Excel formulas across sheets)
  const roundingRules = [
    { scope: 'TUITION_YEAR_TOTAL', mode: 'trunc', digits: -3 },
    { scope: 'ACAD_SERVICE_YEAR_TOTAL', mode: 'floor', digits: -3 },
    { scope: 'RESEARCH_OH_LINE', mode: 'round', digits: -3 },
    { scope: 'RESEARCH_OH_YEAR_TOTAL', mode: 'trunc', digits: -3 },
    { scope: 'RENT_YEAR_TOTAL', mode: 'floor', digits: -3 },
    { scope: 'ALLOCATION_BASE_TUITION', mode: 'trunc', digits: -3 },
    { scope: 'ALLOCATION_BASE_OTHER', mode: 'trunc', digits: -2 },
    { scope: 'ALLOCATION_PLAN_ITEM', mode: 'round', digits: -2 },
    { scope: 'ALLOCATION_EXPENSE_ITEM', mode: 'none', digits: 0 },
    { scope: 'ALLOCATION_STRATEGIC_ITEM', mode: 'none', digits: 0 },
  ];
  for (const r of roundingRules) {
    await db.query(
      `INSERT INTO public.rounding_rules (version_id, scope, mode, digits)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (version_id, scope) DO UPDATE SET mode = EXCLUDED.mode, digits = EXCLUDED.digits`,
      [versionId, r.scope, r.mode, r.digits]
    );
  }

  // 6. Seed fee_schedules (Bachelor & Master for 2571)
  const feeSchedules = [
    {
      level: 'bachelor',
      library_fee: 700,
      it_fee: 500,
      health_fee: 200,
      registration_fee: 1000,
      total_deduction_per_head: 4500,
      library_refund_pct: 0.6,
      effective_be_year: beYear,
    },
    {
      level: 'master',
      library_fee: 1000,
      it_fee: 1000,
      health_fee: 200,
      registration_fee: 1000,
      total_deduction_per_head: 5000,
      library_refund_pct: 0.6,
      effective_be_year: beYear,
    },
  ];
  for (const fsItem of feeSchedules) {
    await db.query(
      `INSERT INTO public.fee_schedules (
         level, library_fee, it_fee, health_fee, registration_fee,
         total_deduction_per_head, library_refund_pct, effective_be_year
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (level, effective_be_year) DO UPDATE SET
         library_fee = EXCLUDED.library_fee,
         it_fee = EXCLUDED.it_fee,
         health_fee = EXCLUDED.health_fee,
         registration_fee = EXCLUDED.registration_fee,
         total_deduction_per_head = EXCLUDED.total_deduction_per_head,
         library_refund_pct = EXCLUDED.library_refund_pct`,
      [
        fsItem.level,
        fsItem.library_fee,
        fsItem.it_fee,
        fsItem.health_fee,
        fsItem.registration_fee,
        fsItem.total_deduction_per_head,
        fsItem.library_refund_pct,
        fsItem.effective_be_year,
      ]
    );
  }

  // 7. Seed 8 academic programs (4 bachelor, 4 master) + General Education items
  const programCatalog = [
    {
      code: 'GOV',
      name_th: 'หลักสูตรการเมืองการปกครอง (GOV)',
      level: 'bachelor',
      report_group: '1.1.1',
    },
    {
      code: 'PA',
      name_th: 'หลักสูตรรัฐประศาสนศาสตร์ (PA)',
      level: 'bachelor',
      report_group: '1.1.2',
    },
    {
      code: 'IA',
      name_th: 'หลักสูตรการระหว่างประเทศ (IA)',
      level: 'bachelor',
      report_group: '1.1.3',
    },
    {
      code: 'STB',
      name_th: 'หลักสูตรศาสตร์แห่งความยั่งยืน (STB)',
      level: 'bachelor',
      report_group: '1.1.4',
    },
    {
      code: 'MGOV_REG',
      name_th: 'หลักสูตรรัฐศาสตรมหาบัณทิต ภาคปกติ (MGOV)',
      level: 'master',
      report_group: '1.1.5',
    },
    {
      code: 'MGOV_SPEC',
      name_th: 'หลักสูตรรัฐศาสตรมหาบัณทิต ภาคพิเศษ (MGOV)',
      level: 'master',
      report_group: '1.1.5',
    },
    {
      code: 'MPA_REG',
      name_th: 'หลักสูตรรัฐประศาสนศาสตรมหาบัณฑิต (ภาคปกติ) (MPA)',
      level: 'master',
      report_group: '1.1.6',
    },
    {
      code: 'MPA_SPEC',
      name_th: 'หลักสูตรรัฐประศาสนศาสตรมหาบัณฑิต (ภาคพิเศษ) (MPA)',
      level: 'master',
      report_group: '1.1.6',
    },
    // General education items (report_group 1.1.7)
    {
      code: 'GEN_ED_140104',
      name_th: 'กระบวนวิชาศึกษาทั่วไป 140104',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_GOV_IN',
      name_th: 'กระบวนวิชาศึกษาทั่วไป (GOV) Pay-in',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_GOV_OUT',
      name_th: 'กระบวนวิชาศึกษานอกคณะ (GOV) Pay-out',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_PA_IN',
      name_th: 'กระบวนวิชาศึกษาทั่วไป (PA) Pay-in',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_PA_OUT',
      name_th: 'กระบวนวิชาศึกษานอกคณะ (PA) Pay-out',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_IA_IN',
      name_th: 'กระบวนวิชาศึกษาทั่วไป (IA) Pay-in',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_IA_OUT',
      name_th: 'กระบวนวิชาศึกษานอกคณะ (IA) Pay-out',
      level: 'bachelor',
      report_group: '1.1.7',
    },
    {
      code: 'GEN_ED_STB_OUT',
      name_th: 'กระบวนวิชาศึกษานอกคณะ (STB) Pay-out',
      level: 'bachelor',
      report_group: '1.1.7',
    },
  ];

  const programIdByName = new Map<string, string>();
  for (const prog of programCatalog) {
    const res = await db.query<{ id: string }>(
      `INSERT INTO public.programs (code, name_th, level, report_group)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, level = EXCLUDED.level, report_group = EXCLUDED.report_group
       RETURNING id`,
      [prog.code, prog.name_th, prog.level, prog.report_group]
    );
    programIdByName.set(prog.name_th, res.rows[0].id);
  }

  // 8. Seed tuition_lines from '1_ค่าธรรมเนียม' (rows 6..45)
  const wsTuition = wb.getWorksheet('1_ค่าธรรมเนียม');
  if (!wsTuition) throw new Error('Missing worksheet: 1_ค่าธรรมเนียม');

  let tuitionLinesCount = 0;
  for (let r = 6; r <= 45; r++) {
    const progName = getCellStr(wsTuition.getCell(`B${r}`));
    if (!progName) continue;
    const programId = programIdByName.get(progName);
    if (!programId) {
      throw new Error(`Program name "${progName}" on row ${r} not found in catalog`);
    }
    const cohortRaw = getCellStr(wsTuition.getCell(`C${r}`));
    const cohortCode = cohortRaw !== '' ? cohortRaw : null;
    const h2 = getCellNum(wsTuition.getCell(`E${r}`));
    const h1 = getCellNum(wsTuition.getCell(`F${r}`));
    const fee = getCellNum(wsTuition.getCell(`G${r}`));

    let lineType: 'regular' | 'gen_ed_in' | 'gen_ed_out' = 'regular';
    if (r >= 37) {
      lineType = fee < 0 || progName.includes('Pay-out') ? 'gen_ed_out' : 'gen_ed_in';
    }

    await db.query(
      `INSERT INTO public.tuition_lines (
         version_id, program_id, cohort_code, line_type, headcount_sem2, headcount_sem1, fee_per_head
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [versionId, programId, cohortCode, lineType, h2, h1, fee]
    );
    tuitionLinesCount++;
  }

  // 9. Seed service_projects from '2_บริการวิชาการ' (rows 6..25)
  const wsService = wb.getWorksheet('2_บริการวิชาการ');
  if (!wsService) throw new Error('Missing worksheet: 2_บริการวิชาการ');

  let serviceProjectsCount = 0;
  for (let r = 6; r <= 26; r++) {
    const name = getCellStr(wsService.getCell(`B${r}`));
    if (!name) continue;
    const batches = getCellNum(wsService.getCell(`C${r}`));
    const attendees = getCellNum(wsService.getCell(`D${r}`));
    const feePerHead = getCellNum(wsService.getCell(`E${r}`));
    const mgmtDeductVal = getCellNum(wsService.getCell(`H${r}`));
    const applyMgmt = mgmtDeductVal > 0;
    const monthStr = getCellStr(wsService.getCell(`J${r}`));
    const monthSeq = THAI_MONTH_TO_SEQ[monthStr] || 1;
    const note = getCellStr(wsService.getCell(`K${r}`)) || null;

    // Classify category matching report items 1.2.1 (short_course), 1.2.2 (usac), 1.2.3 (le / school_activity)
    // In 'สรุปรายรับ-รายจ่าย71':
    // G17 (1.2.1) = I6:I10, I20:I23 -> short_course
    // G18 (1.2.2) = I11:I13 -> usac
    // G19 (1.2.3) = I14:I19, I24:I25 -> le (rows 14-19) and school_activity (rows 24-25)
    let category: 'short_course' | 'usac' | 'le' | 'school_activity' = 'short_course';
    if (r >= 11 && r <= 13) {
      category = 'usac';
    } else if (r >= 14 && r <= 19) {
      category = 'le';
    } else if (r >= 24 && r <= 25) {
      category = 'school_activity';
    }

    await db.query(
      `INSERT INTO public.service_projects (
         version_id, name, category, batches, attendees_per_batch, fee_per_head,
         apply_mgmt_deduction, month_seq, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [versionId, name, category, batches, attendees, feePerHead, applyMgmt, monthSeq, note]
    );
    serviceProjectsCount++;
  }

  // 10. Seed research_projects from '3_Overhead' (rows 6..25)
  const wsResearch = wb.getWorksheet('3_Overhead');
  if (!wsResearch) throw new Error('Missing worksheet: 3_Overhead');

  let researchProjectsCount = 0;
  for (let r = 6; r <= 25; r++) {
    const name = getCellStr(wsResearch.getCell(`B${r}`));
    if (!name) continue;
    const funder = getCellStr(wsResearch.getCell(`C${r}`)) || null;
    const piName = getCellStr(wsResearch.getCell(`D${r}`)) || null;
    const budget = getCellNum(wsResearch.getCell(`E${r}`));
    const rateStr = getCellStr(wsResearch.getCell(`F${r}`));
    const rateOverride = rateStr !== '' ? getCellNum(wsResearch.getCell(`F${r}`)) : null;
    const monthStr = getCellStr(wsResearch.getCell(`J${r}`));
    const monthSeq = THAI_MONTH_TO_SEQ[monthStr] || 8;
    const note = getCellStr(wsResearch.getCell(`K${r}`)) || null;

    await db.query(
      `INSERT INTO public.research_projects (
         version_id, name, funder, pi_name, budget, overhead_rate_override, month_seq, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [versionId, name, funder, piName, budget, rateOverride, monthSeq, note]
    );
    researchProjectsCount++;
  }

  // 11. Seed rental_items from '4_ค่าเช่า' (rows 6..34)
  const wsRent = wb.getWorksheet('4_ค่าเช่า');
  if (!wsRent) throw new Error('Missing worksheet: 4_ค่าเช่า');

  let rentalItemsCount = 0;
  for (let r = 6; r <= 34; r++) {
    const name = getCellStr(wsRent.getCell(`B${r}`));
    if (!name) continue;
    const areaStr = getCellStr(wsRent.getCell(`C${r}`));
    const areaSqm = areaStr !== '' ? getCellNum(wsRent.getCell(`C${r}`)) : null;
    const monthlyRent = getCellNum(wsRent.getCell(`D${r}`));
    const startMonthStr = getCellStr(wsRent.getCell(`E${r}`));
    const endMonthStr = getCellStr(wsRent.getCell(`F${r}`));
    const startSeq = THAI_MONTH_TO_SEQ[startMonthStr] || 1;
    const endSeq = THAI_MONTH_TO_SEQ[endMonthStr] || 12;
    const note = getCellStr(wsRent.getCell(`K${r}`)) || null;

    await db.query(
      `INSERT INTO public.rental_items (
         version_id, name, tenant, area_sqm, monthly_rent, start_month_seq, end_month_seq, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [versionId, name, name, areaSqm, monthlyRent, startSeq, endSeq, note]
    );
    rentalItemsCount++;
  }

  // 12. Seed carryover from 'เงินเหลือจ่ายสะสม' (D4 = 4,006,000, E4 = note)
  const wsCarryover = wb.getWorksheet('เงินเหลือจ่ายสะสม');
  if (!wsCarryover) throw new Error('Missing worksheet: เงินเหลือจ่ายสะสม');

  const carryoverAmount = getCellNum(wsCarryover.getCell('D4'));
  const carryoverNote = getCellStr(wsCarryover.getCell('E4'));
  await db.query(
    `INSERT INTO public.carryover (version_id, amount, source_note)
     VALUES ($1, $2, $3)
     ON CONFLICT (version_id) DO UPDATE SET amount = EXCLUDED.amount, source_note = EXCLUDED.source_note`,
    [versionId, carryoverAmount, carryoverNote]
  );

  // 13. Seed allocation_dimensions, allocation_items, allocation_pcts, and historical_usage (2565-2569)
  const wsAlloc = wb.getWorksheet('จัดสรรกรอบงบประมาณ');
  if (!wsAlloc) throw new Error('Missing worksheet: จัดสรรกรอบงบประมาณ');

  const dimensionsConfig = [
    {
      code: 'plan',
      name_th: 'มิติแผนงาน',
      pctStartRow: 9,
      pctEndRow: 14,
      histStartRow: 20,
    },
    {
      code: 'expense_category',
      name_th: 'มิติหมวดรายจ่าย',
      pctStartRow: 32,
      pctEndRow: 36,
      histStartRow: 42,
    },
    {
      code: 'strategic',
      name_th: 'มิติหมวดงบเชิงยุทธศาสตร์',
      pctStartRow: 53,
      pctEndRow: 57,
      histStartRow: 63,
    },
  ] as const;

  const revColMap: Array<{ col: string; type: string }> = [
    { col: 'C', type: 'TUITION' },
    { col: 'D', type: 'ACAD_SERVICE' },
    { col: 'E', type: 'RESEARCH_OH' },
    { col: 'F', type: 'RENT' },
    { col: 'G', type: 'CARRYOVER' },
  ];

  const histYearColMap: Array<{ col: string; year: number }> = [
    { col: 'K', year: 2565 },
    { col: 'L', year: 2566 },
    { col: 'M', year: 2567 },
    { col: 'N', year: 2568 },
    { col: 'O', year: 2569 },
  ];

  let allocationItemsCount = 0;
  let allocationPctsCount = 0;
  let historicalUsageCount = 0;

  for (const dim of dimensionsConfig) {
    const dimRes = await db.query<{ id: string }>(
      `INSERT INTO public.allocation_dimensions (code, name_th)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th
       RETURNING id`,
      [dim.code, dim.name_th]
    );
    const dimensionId = dimRes.rows[0].id;

    const count = dim.pctEndRow - dim.pctStartRow + 1;
    for (let i = 0; i < count; i++) {
      const pctRow = dim.pctStartRow + i;
      const histRow = dim.histStartRow + i;
      const itemName = getCellStr(wsAlloc.getCell(`B${pctRow}`));
      const sortOrder = i + 1;

      const itemRes = await db.query<{ id: string }>(
        `INSERT INTO public.allocation_items (dimension_id, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (dimension_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order
         RETURNING id`,
        [dimensionId, itemName, sortOrder]
      );
      const itemId = itemRes.rows[0].id;
      allocationItemsCount++;

      // Allocation percentages across the 5 revenue types
      for (const rc of revColMap) {
        const pctVal = getCellNum(wsAlloc.getCell(`${rc.col}${pctRow}`));
        await db.query(
          `INSERT INTO public.allocation_pcts (version_id, item_id, revenue_type, pct)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (version_id, item_id, revenue_type) DO UPDATE SET pct = EXCLUDED.pct`,
          [versionId, itemId, rc.type, pctVal]
        );
        allocationPctsCount++;
      }

      // Historical usage 2565..2569 (leave empty cells as null per PROMPT 1 item 4)
      for (const hc of histYearColMap) {
        const rawCell = wsAlloc.getCell(`${hc.col}${histRow}`);
        const rawStr = getCellStr(rawCell);
        const amountVal = rawStr === '' ? null : getCellNum(rawCell);

        await db.query(
          `INSERT INTO public.historical_usage (item_id, be_year, amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (item_id, be_year) DO UPDATE SET amount = EXCLUDED.amount`,
          [itemId, hc.year, amountVal]
        );
        historicalUsageCount++;
      }
    }
  }

  return {
    fiscalYearBe: beYear,
    versionId,
    parametersCount: paramsToInsert.length,
    monthDistributionCount,
    feeSchedulesCount: feeSchedules.length,
    programsCount: programCatalog.length,
    tuitionLinesCount,
    serviceProjectsCount,
    researchProjectsCount,
    rentalItemsCount,
    carryoverAmount,
    allocationItemsCount,
    allocationPctsCount,
    historicalUsageCount,
  };
}

export async function clearAllRevenueData(db: PGlite): Promise<void> {
  await db.exec(`
    TRUNCATE TABLE
      public.tuition_lines,
      public.service_projects,
      public.rental_items,
      public.research_projects,
      public.other_income_lines,
      public.revenue_actuals,
      public.expenditure_actuals,
      public.carryover,
      public.allocation_pcts,
      public.historical_usage,
      public.version_snapshots,
      public.audit_logs,
      public.parameters,
      public.month_distribution,
      public.rounding_rules,
      public.fee_schedules,
      public.estimate_versions,
      public.fiscal_years
    CASCADE;
  `);
}

export async function seedCleanBaseline(db: PGlite, beYear = 2571): Promise<SeedSummary> {
  // 1. Wipe all data cleanly
  await clearAllRevenueData(db);

  // Set session user to SUPER_ADMIN for audit trail
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${SEED_USERS.SUPER_ADMIN.id}', false);`);

  // 2. Seed 6 role profiles
  for (const u of Object.values(SEED_USERS)) {
    await db.query(
      `INSERT INTO public.profiles (id, email, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role`,
      [u.id, u.email, u.full_name, u.role]
    );
  }

  // 3. Create clean fiscal year and initial draft version
  const ceStartYear = beYear - 543 - 1;
  const ceEndYear = beYear - 543;

  const fyRes = await db.query<{ id: string }>(
    `INSERT INTO public.fiscal_years (be_year, start_date, end_date, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [beYear, `${ceStartYear}-10-01`, `${ceEndYear}-09-30`, SEED_USERS.SUPER_ADMIN.id]
  );
  const fiscalYearId = fyRes.rows[0].id;

  const verRes = await db.query<{ id: string }>(
    `INSERT INTO public.estimate_versions (fiscal_year_id, version_no, label, status, created_by)
     VALUES ($1, 1, 'ประมาณการรายรับ ครั้งที่ 1 (ต้นปีงบประมาณ)', 'draft', $2)
     RETURNING id`,
    [fiscalYearId, SEED_USERS.PLANNING_OFFICER.id]
  );
  const versionId = verRes.rows[0].id;

  // 4. Seed baseline parameters
  const paramsToInsert: Array<{
    key: string;
    value_numeric: number | null;
    value_text: string | null;
    note: string;
  }> = [
    {
      key: 'ORG_NAME',
      value_numeric: null,
      value_text: 'คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่',
      note: 'ชื่อหน่วยงาน',
    },
    {
      key: 'SERVICE_DEDUCT_1',
      value_numeric: 0.10,
      value_text: null,
      note: 'บริการวิชาการ – หักที่ 1 (ส่วนกลาง) % ของรายรับ',
    },
    {
      key: 'SERVICE_DEDUCT_2',
      value_numeric: 0.40,
      value_text: null,
      note: 'บริการวิชาการ – หักที่ 2 (บริหารจัดการ) %',
    },
    {
      key: 'SERVICE_DEDUCT_2_BASE',
      value_numeric: null,
      value_text: 'after_d1',
      note: 'ฐานการคำนวณหักบริหารจัดการ 40%: after_d1 หรือ gross',
    },
    {
      key: 'OH_DEFAULT_RATE',
      value_numeric: 0.00,
      value_text: null,
      note: 'งานวิจัย – อัตรา Overhead เริ่มต้น',
    },
    {
      key: 'OH_CENTRAL_PCT',
      value_numeric: 0.00,
      value_text: null,
      note: 'งานวิจัย – อัตราหักส่งส่วนกลางจาก Overhead',
    },
    {
      key: 'RENT_DEDUCT',
      value_numeric: 0.10,
      value_text: null,
      note: 'ค่าเช่าราชพัสดุ – อัตราหักส่งส่วนกลาง',
    },
    {
      key: 'CMU_PCT',
      value_numeric: 0.10,
      value_text: null,
      note: 'ค่าธรรมเนียมการศึกษา – หักให้ มช. % ของรายรับสุทธิหลังหักค่าใช้จ่าย',
    },
    {
      key: 'GEN_ED_RATE_IN',
      value_numeric: 540,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษาทั่วไป Pay-in ต่อหัว (บาท)',
    },
    {
      key: 'GEN_ED_RATE_OUT_DEFAULT',
      value_numeric: -540,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษานอกคณะ Pay-out ต่อหัว มาตรฐาน (บาท)',
    },
    {
      key: 'GEN_ED_RATE_OUT_STB',
      value_numeric: -500,
      value_text: null,
      note: 'อัตราค่าธรรมเนียมกระบวนวิชาศึกษานอกคณะ Pay-out หลักสูตร STB ต่อหัว (บาท)',
    },
    {
      key: 'SCHOLARSHIP_PCT',
      value_numeric: 0.20,
      value_text: null,
      note: 'สัดส่วนทุนการศึกษาและพัฒนา นศ.',
    },
    {
      key: 'STATUS_HIT',
      value_numeric: 1.0,
      value_text: null,
      note: 'เกณฑ์สถานะเทียบรับจริง ถึงเป้า (>= 100%)',
    },
    {
      key: 'STATUS_NEAR',
      value_numeric: 0.90,
      value_text: null,
      note: 'เกณฑ์สถานะเทียบรับจริง ใกล้เคียง (>= 90%)',
    },
  ];

  for (const p of paramsToInsert) {
    await db.query(
      `INSERT INTO public.parameters (version_id, key, value_numeric, value_text, effective_be_year, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [versionId, p.key, p.value_numeric, p.value_text, beYear, p.note]
    );
  }

  // 5. Month distributions (12 months x 2 semesters)
  const sem2Pcts: Record<number, number> = { 7: 0.70, 8: 0.30 };
  const sem1Pcts: Record<number, number> = { 11: 0.70, 12: 0.30 };

  let monthDistributionCount = 0;
  for (let m = 1; m <= 12; m++) {
    await db.query(
      `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct)
       VALUES ($1, $2, 2, $3)`,
      [versionId, m, sem2Pcts[m] || 0]
    );
    await db.query(
      `INSERT INTO public.month_distribution (version_id, month_seq, semester, pct)
       VALUES ($1, $2, 1, $3)`,
      [versionId, m, sem1Pcts[m] || 0]
    );
    monthDistributionCount += 2;
  }

  // 6. Rounding rules
  const roundingRules = [
    { scope: 'TUITION_YEAR_TOTAL', mode: 'trunc', digits: -3 },
    { scope: 'ACAD_SERVICE_YEAR_TOTAL', mode: 'floor', digits: -3 },
    { scope: 'RESEARCH_OH_LINE', mode: 'round', digits: -3 },
    { scope: 'RESEARCH_OH_YEAR_TOTAL', mode: 'trunc', digits: -3 },
    { scope: 'RENT_YEAR_TOTAL', mode: 'floor', digits: -3 },
    { scope: 'ALLOCATION_BASE_TUITION', mode: 'trunc', digits: -3 },
    { scope: 'ALLOCATION_BASE_OTHER', mode: 'trunc', digits: -2 },
    { scope: 'ALLOCATION_PLAN_ITEM', mode: 'round', digits: -2 },
    { scope: 'ALLOCATION_EXPENSE_ITEM', mode: 'none', digits: 0 },
    { scope: 'ALLOCATION_STRATEGIC_ITEM', mode: 'none', digits: 0 },
  ];
  for (const r of roundingRules) {
    await db.query(
      `INSERT INTO public.rounding_rules (version_id, scope, mode, digits)
       VALUES ($1, $2, $3, $4)`,
      [versionId, r.scope, r.mode, r.digits]
    );
  }

  // 7. Fee schedules
  const feeSchedules = [
    {
      level: 'bachelor',
      library_fee: 700,
      it_fee: 500,
      health_fee: 200,
      registration_fee: 1000,
      total_deduction_per_head: 4500,
      library_refund_pct: 0.6,
      effective_be_year: beYear,
    },
    {
      level: 'master',
      library_fee: 1000,
      it_fee: 1000,
      health_fee: 200,
      registration_fee: 1000,
      total_deduction_per_head: 5000,
      library_refund_pct: 0.6,
      effective_be_year: beYear,
    },
  ];
  for (const fsItem of feeSchedules) {
    await db.query(
      `INSERT INTO public.fee_schedules (
         level, library_fee, it_fee, health_fee, registration_fee,
         total_deduction_per_head, library_refund_pct, effective_be_year
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        fsItem.level,
        fsItem.library_fee,
        fsItem.it_fee,
        fsItem.health_fee,
        fsItem.registration_fee,
        fsItem.total_deduction_per_head,
        fsItem.library_refund_pct,
        fsItem.effective_be_year,
      ]
    );
  }

  // 8. Academic programs
  const programCatalog = [
    { code: 'GOV', name_th: 'หลักสูตรการเมืองการปกครอง (GOV)', level: 'bachelor', report_group: '1.1.1' },
    { code: 'PA', name_th: 'หลักสูตรรัฐประศาสนศาสตร์ (PA)', level: 'bachelor', report_group: '1.1.2' },
    { code: 'IA', name_th: 'หลักสูตรการระหว่างประเทศ (IA)', level: 'bachelor', report_group: '1.1.3' },
    { code: 'STB', name_th: 'หลักสูตรศาสตร์แห่งความยั่งยืน (STB)', level: 'bachelor', report_group: '1.1.4' },
    { code: 'MGOV_REG', name_th: 'หลักสูตรรัฐศาสตรมหาบัณทิต ภาคปกติ (MGOV)', level: 'master', report_group: '1.1.5' },
    { code: 'MGOV_SPEC', name_th: 'หลักสูตรรัฐศาสตรมหาบัณทิต ภาคพิเศษ (MGOV)', level: 'master', report_group: '1.1.5' },
    { code: 'MPA_REG', name_th: 'หลักสูตรรัฐประศาสนศาสตรมหาบัณฑิต (ภาคปกติ) (MPA)', level: 'master', report_group: '1.1.6' },
    { code: 'MPA_SPEC', name_th: 'หลักสูตรรัฐประศาสนศาสตรมหาบัณฑิต (ภาคพิเศษ) (MPA)', level: 'master', report_group: '1.1.6' },
    { code: 'GEN_ED_140104', name_th: 'กระบวนวิชาศึกษาทั่วไป 140104', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_GOV_IN', name_th: 'กระบวนวิชาศึกษาทั่วไป (GOV) Pay-in', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_GOV_OUT', name_th: 'กระบวนวิชาศึกษานอกคณะ (GOV) Pay-out', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_PA_IN', name_th: 'กระบวนวิชาศึกษาทั่วไป (PA) Pay-in', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_PA_OUT', name_th: 'กระบวนวิชาศึกษานอกคณะ (PA) Pay-out', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_IA_IN', name_th: 'กระบวนวิชาศึกษาทั่วไป (IA) Pay-in', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_IA_OUT', name_th: 'กระบวนวิชาศึกษานอกคณะ (IA) Pay-out', level: 'bachelor', report_group: '1.1.7' },
    { code: 'GEN_ED_STB_OUT', name_th: 'กระบวนวิชาศึกษานอกคณะ (STB) Pay-out', level: 'bachelor', report_group: '1.1.7' },
  ];
  for (const prog of programCatalog) {
    await db.query(
      `INSERT INTO public.programs (code, name_th, level, report_group)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th, level = EXCLUDED.level, report_group = EXCLUDED.report_group`,
      [prog.code, prog.name_th, prog.level, prog.report_group]
    );
  }

  // 9. Allocation dimensions & items
  const dimensionsConfig = [
    {
      code: 'plan',
      name_th: 'มิติแผนงาน',
      items: [
        'แผนงานการเรียนการสอน',
        'แผนงานวิจัย',
        'แผนงานบริการวิชาการแก่สังคม',
        'แผนงานการศาสนา ศิลปะ วัฒนธรรมฯ',
        'แผนงานสนับสนุนวิชาการ',
        'แผนงานบริหารมหาวิทยาลัย',
      ],
    },
    {
      code: 'expense_category',
      name_th: 'มิติหมวดรายจ่าย',
      items: [
        'งบบุคลากร',
        'งบดำเนินงาน',
        'งบเงินอุดหนุน',
        'งบลงทุน',
        'งบรายจ่ายอื่น',
      ],
    },
    {
      code: 'strategic',
      name_th: 'มิติหมวดงบเชิงยุทธศาสตร์',
      items: [
        'ยุทธศาสตร์ที่ 1 นวัตกรรมการศึกษาเพื่อพัฒนาบุคลากร',
        'ยุทธศาสตร์ที่ 2 งานวิจัยและนวัตกรรมเพื่อสังคม',
        'ยุทธศาสตร์ที่ 3 การบริหารจัดการองค์กรสู่ความยั่งยืน',
      ],
    },
  ];

  let allocationItemsCount = 0;
  for (const dim of dimensionsConfig) {
    const dimRes = await db.query<{ id: string }>(
      `INSERT INTO public.allocation_dimensions (code, name_th)
       VALUES ($1, $2)
       ON CONFLICT (code) DO UPDATE SET name_th = EXCLUDED.name_th
       RETURNING id`,
      [dim.code, dim.name_th]
    );
    const dimId = dimRes.rows[0].id;

    for (let i = 0; i < dim.items.length; i++) {
      await db.query(
        `INSERT INTO public.allocation_items (dimension_id, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (dimension_id, name) DO UPDATE SET sort_order = EXCLUDED.sort_order`,
        [dimId, dim.items[i], i + 1]
      );
      allocationItemsCount++;
    }
  }

  // Baseline allocation percentages
  const itemsRes = await db.query<{ id: string; dimension_code: string; sort_order: number }>(
    `SELECT ai.id, ad.code AS dimension_code, ai.sort_order
     FROM public.allocation_items ai
     JOIN public.allocation_dimensions ad ON ad.id = ai.dimension_id
     ORDER BY ad.code, ai.sort_order`
  );

  const revTypes = ['TUITION', 'ACAD_SERVICE', 'RESEARCH_OH', 'RENT', 'CARRYOVER'] as const;
  let allocationPctsCount = 0;

  for (const dimCode of ['plan', 'expense_category', 'strategic']) {
    const dimItems = itemsRes.rows.filter((it) => it.dimension_code === dimCode);
    if (dimItems.length > 0) {
      for (const rt of revTypes) {
        for (let i = 0; i < dimItems.length; i++) {
          const pct = i === 0 ? 1.0 : 0.0;
          await db.query(
            `INSERT INTO public.allocation_pcts (version_id, item_id, revenue_type, pct)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (version_id, item_id, revenue_type) DO UPDATE SET pct = EXCLUDED.pct`,
            [versionId, dimItems[i].id, rt, pct]
          );
          allocationPctsCount++;
        }
      }
    }
  }

  return {
    fiscalYearBe: beYear,
    versionId,
    parametersCount: paramsToInsert.length,
    monthDistributionCount,
    feeSchedulesCount: feeSchedules.length,
    programsCount: programCatalog.length,
    tuitionLinesCount: 0,
    serviceProjectsCount: 0,
    researchProjectsCount: 0,
    rentalItemsCount: 0,
    carryoverAmount: 0,
    allocationItemsCount,
    allocationPctsCount,
    historicalUsageCount: 0,
  };
}
