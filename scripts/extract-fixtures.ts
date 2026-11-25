import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

function getVal(cell: ExcelJS.Cell): any {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if ('result' in v) {
      return v.result;
    }
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((rt: any) => rt.text).join('').trim();
    }
  }
  return v;
}

function getNum(cell: ExcelJS.Cell): number {
  const val = getVal(cell);
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  const parsed = Number(String(val).replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function getStr(cell: ExcelJS.Cell): string {
  const val = getVal(cell);
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

async function extract() {
  const filePath = path.join(process.cwd(), 'reference', 'Revenue_Estimate_Template2571.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);

  // 1. Settings
  const wsSettings = wb.getWorksheet('ตั้งค่า')!;
  const beYear = getNum(wsSettings.getCell('B3'));
  const serviceDeduct1 = getNum(wsSettings.getCell('B7'));
  const serviceDeduct2 = getNum(wsSettings.getCell('B8'));
  const ohDefaultRate = getNum(wsSettings.getCell('B9'));
  const ohCentralPct = getNum(wsSettings.getCell('B10'));
  const rentDeduct = getNum(wsSettings.getCell('B11'));
  const cmuPct = getNum(wsSettings.getCell('B12'));

  const monthDistributionSem2: number[] = [];
  const monthDistributionSem1: number[] = [];
  for (let m = 1; m <= 12; m++) {
    const row = 15 + m;
    monthDistributionSem2.push(getNum(wsSettings.getCell(`D${row}`)));
    monthDistributionSem1.push(getNum(wsSettings.getCell(`E${row}`)));
  }

  // 2. Tuition Sheet
  const wsTuition = wb.getWorksheet('1_ค่าธรรมเนียม')!;
  const tuitionLines: any[] = [];
  for (let r = 6; r <= 45; r++) {
    const prog = getStr(wsTuition.getCell(`B${r}`));
    if (!prog) continue;
    tuitionLines.push({
      row: r,
      progName: prog,
      cohort: getStr(wsTuition.getCell(`C${r}`)) || null,
      level: getStr(wsTuition.getCell(`D${r}`)),
      h2: getNum(wsTuition.getCell(`E${r}`)),
      h1: getNum(wsTuition.getCell(`F${r}`)),
      fee: getNum(wsTuition.getCell(`G${r}`)),
      h_library: getNum(wsTuition.getCell(`H${r}`)),
      i_it: getNum(wsTuition.getCell(`I${r}`)),
      j_health: getNum(wsTuition.getCell(`J${r}`)),
      k_reg: getNum(wsTuition.getCell(`K${r}`)),
      l_dev: getNum(wsTuition.getCell(`L${r}`)),
      m_deduct_sum: getNum(wsTuition.getCell(`M${r}`)),
      n_net_before_cmu: getNum(wsTuition.getCell(`N${r}`)),
      o_gross_sem2: getNum(wsTuition.getCell(`O${r}`)),
      p_gross_sem1: getNum(wsTuition.getCell(`P${r}`)),
      q_gross_year: getNum(wsTuition.getCell(`Q${r}`)),
      r_deduct_year: getNum(wsTuition.getCell(`R${r}`)),
      s_cmu_sem2: getNum(wsTuition.getCell(`S${r}`)),
      t_net_sem2: getNum(wsTuition.getCell(`T${r}`)),
      u_cmu_sem1: getNum(wsTuition.getCell(`U${r}`)),
      v_net_sem1: getNum(wsTuition.getCell(`V${r}`)),
      w_cmu_year: getNum(wsTuition.getCell(`W${r}`)),
      x_net_year: getNum(wsTuition.getCell(`X${r}`)),
      y_note: getStr(wsTuition.getCell(`Y${r}`)),
    });
  }

  const tuitionTotals = {
    h2: getNum(wsTuition.getCell('E46')),
    h1: getNum(wsTuition.getCell('F46')),
    h_library: getNum(wsTuition.getCell('H46')),
    i_it: getNum(wsTuition.getCell('I46')),
    j_health: getNum(wsTuition.getCell('J46')),
    k_reg: getNum(wsTuition.getCell('K46')),
    l_dev: getNum(wsTuition.getCell('L46')),
    m_deduct_sum: getNum(wsTuition.getCell('M46')),
    n_net_before_cmu: getNum(wsTuition.getCell('N46')),
    o_gross_sem2: getNum(wsTuition.getCell('O46')),
    p_gross_sem1: getNum(wsTuition.getCell('P46')),
    q_gross_year: getNum(wsTuition.getCell('Q46')),
    r_deduct_year: getNum(wsTuition.getCell('R46')),
    s_cmu_sem2: getNum(wsTuition.getCell('S46')),
    t_net_sem2: getNum(wsTuition.getCell('T46')),
    u_cmu_sem1: getNum(wsTuition.getCell('U46')),
    v_net_sem1: getNum(wsTuition.getCell('V46')),
    w_cmu_year: getNum(wsTuition.getCell('W46')),
    x_net_year: getNum(wsTuition.getCell('X46')),
  };

  // 3. Service Sheet
  const wsService = wb.getWorksheet('2_บริการวิชาการ')!;
  const serviceLines: any[] = [];
  for (let r = 6; r <= 26; r++) {
    const name = getStr(wsService.getCell(`B${r}`));
    if (!name) continue;
    serviceLines.push({
      row: r,
      name,
      batches: getNum(wsService.getCell(`C${r}`)),
      attendees: getNum(wsService.getCell(`D${r}`)),
      feePerHead: getNum(wsService.getCell(`E${r}`)),
      gross: getNum(wsService.getCell(`F${r}`)),
      d1: getNum(wsService.getCell(`G${r}`)),
      d2: getNum(wsService.getCell(`H${r}`)),
      net: getNum(wsService.getCell(`I${r}`)),
      month: getStr(wsService.getCell(`J${r}`)),
      note: getStr(wsService.getCell(`K${r}`)),
    });
  }
  const serviceTotals = {
    gross: getNum(wsService.getCell('F27')),
    d1: getNum(wsService.getCell('G27')),
    d2: getNum(wsService.getCell('H27')),
    net: getNum(wsService.getCell('I27')),
  };

  // 4. Overhead Sheet
  const wsOH = wb.getWorksheet('3_Overhead')!;
  const researchLines: any[] = [];
  for (let r = 6; r <= 25; r++) {
    const name = getStr(wsOH.getCell(`B${r}`));
    if (!name) continue;
    researchLines.push({
      row: r,
      name,
      funder: getStr(wsOH.getCell(`C${r}`)),
      piName: getStr(wsOH.getCell(`D${r}`)),
      budget: getNum(wsOH.getCell(`E${r}`)),
      rate: getNum(wsOH.getCell(`F${r}`)),
      oh: getNum(wsOH.getCell(`G${r}`)),
      central: getNum(wsOH.getCell(`H${r}`)),
      net: getNum(wsOH.getCell(`I${r}`)),
      month: getStr(wsOH.getCell(`J${r}`)),
    });
  }
  const researchTotals = {
    budget: getNum(wsOH.getCell('E26')),
    oh: getNum(wsOH.getCell('G26')),
    central: getNum(wsOH.getCell('H26')),
    net: getNum(wsOH.getCell('I26')),
  };

  // 5. Rent Sheet
  const wsRent = wb.getWorksheet('4_ค่าเช่า')!;
  const rentalLines: any[] = [];
  for (let r = 6; r <= 34; r++) {
    const name = getStr(wsRent.getCell(`B${r}`));
    if (!name) continue;
    rentalLines.push({
      row: r,
      name,
      area: getNum(wsRent.getCell(`C${r}`)),
      monthlyRent: getNum(wsRent.getCell(`D${r}`)),
      startMonth: getStr(wsRent.getCell(`E${r}`)),
      endMonth: getStr(wsRent.getCell(`F${r}`)),
      months: getNum(wsRent.getCell(`G${r}`)),
      gross: getNum(wsRent.getCell(`H${r}`)),
      deduct: getNum(wsRent.getCell(`I${r}`)),
      net: getNum(wsRent.getCell(`J${r}`)),
    });
  }
  const rentalTotals = {
    monthlyRent: getNum(wsRent.getCell('D35')),
    gross: getNum(wsRent.getCell('H35')),
    deduct: getNum(wsRent.getCell('I35')),
    net: getNum(wsRent.getCell('J35')),
  };

  // 6. Carryover Sheet
  const wsCarry = wb.getWorksheet('เงินเหลือจ่ายสะสม')!;
  const carryoverAmount = getNum(wsCarry.getCell('D4'));
  const carryoverMonthly: any[] = [];
  for (let r = 6; r <= 17; r++) {
    carryoverMonthly.push({
      monthSeq: r - 5,
      month: getStr(wsCarry.getCell(`B${r}`)),
      closing: getNum(wsCarry.getCell(`F${r}`)),
    });
  }

  // 7. Monthly Summary Sheet
  const wsSummary = wb.getWorksheet('สรุปรายเดือน')!;
  const monthlySummary = {
    // Gross: rows 8..13
    grossTuition: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(8).getCell(2 + i))),
    grossService: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(9).getCell(2 + i))),
    grossOverhead: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(10).getCell(2 + i))),
    grossRent: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(11).getCell(2 + i))),
    grossCarryover: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(12).getCell(2 + i))),
    grossTotal: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(13).getCell(2 + i))),
    grossTotalYear: getNum(wsSummary.getRow(13).getCell(14)),

    // Deductions: rows 16..20
    deductTuition: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(16).getCell(2 + i))),
    deductService: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(17).getCell(2 + i))),
    deductOverhead: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(18).getCell(2 + i))),
    deductRent: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(19).getCell(2 + i))),
    deductTotal: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(20).getCell(2 + i))),
    deductTotalYear: getNum(wsSummary.getRow(20).getCell(14)),

    // Net: rows 23..28
    netTuition: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(23).getCell(2 + i))),
    netService: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(24).getCell(2 + i))),
    netOverhead: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(25).getCell(2 + i))),
    netRent: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(26).getCell(2 + i))),
    netCarryover: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(27).getCell(2 + i))),
    netTotal: Array.from({ length: 12 }, (_, i) => getNum(wsSummary.getRow(28).getCell(2 + i))),
    netTotalYear: getNum(wsSummary.getRow(28).getCell(14)),
  };

  // 8. Allocation Sheet
  const wsAlloc = wb.getWorksheet('จัดสรรกรอบงบประมาณ')!;
  const allocBase = {
    tuition: getNum(wsAlloc.getCell('C5')),
    service: getNum(wsAlloc.getCell('D5')),
    overhead: getNum(wsAlloc.getCell('E5')),
    rent: getNum(wsAlloc.getCell('F5')),
    carryover: getNum(wsAlloc.getCell('G5')),
    total: getNum(wsAlloc.getCell('H5')),
  };

  const planAmounts: any[] = [];
  for (let r = 20; r <= 25; r++) {
    planAmounts.push({
      name: getStr(wsAlloc.getCell(`B${r}`)),
      tuition: getNum(wsAlloc.getCell(`C${r}`)),
      service: getNum(wsAlloc.getCell(`D${r}`)),
      overhead: getNum(wsAlloc.getCell(`E${r}`)),
      rent: getNum(wsAlloc.getCell(`F${r}`)),
      carryover: getNum(wsAlloc.getCell(`G${r}`)),
      total: getNum(wsAlloc.getCell(`H${r}`)),
    });
  }

  const strategicAmounts: any[] = [];
  for (let r = 63; r <= 67; r++) {
    strategicAmounts.push({
      name: getStr(wsAlloc.getCell(`B${r}`)),
      tuition: getNum(wsAlloc.getCell(`C${r}`)),
      service: getNum(wsAlloc.getCell(`D${r}`)),
      overhead: getNum(wsAlloc.getCell(`E${r}`)),
      rent: getNum(wsAlloc.getCell(`F${r}`)),
      carryover: getNum(wsAlloc.getCell(`G${r}`)),
      total: getNum(wsAlloc.getCell(`H${r}`)),
    });
  }

  const fixtures = {
    settings: {
      beYear,
      serviceDeduct1,
      serviceDeduct2,
      ohDefaultRate,
      ohCentralPct,
      rentDeduct,
      cmuPct,
      monthDistributionSem2,
      monthDistributionSem1,
    },
    tuition: {
      lines: tuitionLines,
      totals: tuitionTotals,
    },
    service: {
      lines: serviceLines,
      totals: serviceTotals,
    },
    research: {
      lines: researchLines,
      totals: researchTotals,
    },
    rental: {
      lines: rentalLines,
      totals: rentalTotals,
    },
    carryover: {
      amount: carryoverAmount,
      monthly: carryoverMonthly,
    },
    monthlySummary,
    allocation: {
      base: allocBase,
      planAmounts,
      strategicAmounts,
    },
  };

  const outDir = path.join(process.cwd(), 'fixtures');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'golden-2571.json');
  fs.writeFileSync(outPath, JSON.stringify(fixtures, null, 2), 'utf-8');
  console.log(`Successfully extracted golden fixtures to: ${outPath}`);
}

extract().catch((err) => {
  console.error('Extraction failed:', err);
  process.exit(1);
});
