import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getRevenueWorkspaceData, THAI_MONTHS } from '@/lib/revenue/services/repository';
import { RevenueTypeCode } from '@/lib/revenue/calc';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get('versionId') || undefined;
    const wsData = await getRevenueWorkspaceData({ versionId });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'ระบบประมาณการรายรับเงินรายได้ คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มช.';
    wb.created = new Date();

    const revTypes: RevenueTypeCode[] = [
      'TUITION',
      'ACAD_SERVICE',
      'RESEARCH_OH',
      'RENT',
      'CARRYOVER',
    ];

    // 1. Sheet: สรุปรายเดือน
    const wsMonthly = wb.addWorksheet('สรุปรายเดือน');
    wsMonthly.addRow([
      `สรุปประมาณการรายรับเงินรายได้ รายเดือน ปีงบประมาณ พ.ศ. ${wsData.activeVersion.be_year} (${wsData.activeVersion.label})`,
    ]);
    wsMonthly.addRow([]);

    const monthHeaders = ['ประเภทรายรับ', ...THAI_MONTHS.map((m) => m.short), 'รวมทั้งปี (ปัดตามเกณฑ์)'];

    // Section A: Gross
    wsMonthly.addRow(['ก. รายรับรวมก่อนหัก (บาท)']);
    wsMonthly.addRow(monthHeaders);
    for (const rt of revTypes) {
      const row = wsData.calc.monthly.grossByType[rt];
      wsMonthly.addRow([row.label, ...row.months, row.yearTotalRounded]);
    }
    wsMonthly.addRow([
      'รวมก่อนหัก',
      ...wsData.calc.monthly.monthlyGrossTotals,
      wsData.calc.monthly.grandTotals.grossRounded,
    ]);
    wsMonthly.addRow([]);

    // Section B: Deduction + Library Refund
    wsMonthly.addRow(['ข. รายการหักค่าใช้จ่าย และเงินรับคืน (บาท)']);
    wsMonthly.addRow(monthHeaders);
    for (const rt of revTypes) {
      const row = wsData.calc.monthly.deductionByType[rt];
      wsMonthly.addRow([row.label, ...row.months, row.yearTotalRounded]);
    }
    wsMonthly.addRow([
      'รวมค่าหักทั้งหมด',
      ...wsData.calc.monthly.monthlyDeductionTotals,
      wsData.calc.monthly.grandTotals.deductionRounded,
    ]);
    wsMonthly.addRow([
      'บวกกลับ: รับคืนค่าบำรุงห้องสมุด 60% (มช. คืนให้คณะ)',
      ...wsData.calc.monthly.libraryRefundMonthly,
      wsData.calc.monthly.libraryRefundYear,
    ]);
    wsMonthly.addRow([]);

    // Section C: Net
    wsMonthly.addRow(['ค. รายรับสุทธิ (บาท)']);
    wsMonthly.addRow(monthHeaders);
    for (const rt of revTypes) {
      const row = wsData.calc.monthly.netByType[rt];
      wsMonthly.addRow([row.label, ...row.months, row.yearTotalRounded]);
    }
    wsMonthly.addRow([
      'รวมรายรับสุทธิรายเดือน (ปัดลงหลักพัน)',
      ...wsData.calc.monthly.monthlyNetTotalsRounded,
      wsData.calc.monthly.grandTotals.netRounded,
    ]);
    wsMonthly.addRow([
      'รายรับสุทธิสะสม (คำนวณสะสมจริง)',
      ...wsData.calc.monthly.cumulativeNetRounded,
      wsData.calc.monthly.grandTotals.sumOfMonthlyNetRounded,
    ]);

    // 2. Sheet: จัดสรรกรอบงบประมาณ
    const wsAlloc = wb.addWorksheet('จัดสรรกรอบงบประมาณ');
    wsAlloc.addRow([`การจัดสรรกรอบงบประมาณจากรายรับสุทธิ ปีงบประมาณ พ.ศ. ${wsData.activeVersion.be_year}`]);
    wsAlloc.addRow([
      'ฐานรายรับสุทธิที่จัดสรรได้',
      wsData.calc.allocation.baseAmounts.TUITION,
      wsData.calc.allocation.baseAmounts.ACAD_SERVICE,
      wsData.calc.allocation.baseAmounts.RESEARCH_OH,
      wsData.calc.allocation.baseAmounts.RENT,
      wsData.calc.allocation.baseAmounts.CARRYOVER,
      wsData.calc.allocation.totalBase,
    ]);
    wsAlloc.addRow([]);

    for (const dimCode of ['plan', 'expense_category', 'strategic'] as const) {
      const dim = wsData.calc.allocation.dimensions[dimCode];
      if (!dim || !dim.items) continue;
      wsAlloc.addRow([dim.dimensionName]);
      wsAlloc.addRow([
        'หมวดงบประมาณ',
        '1. ค่าธรรมเนียม',
        '2. บริการวิชาการ',
        '3. Overhead วิจัย',
        '4. ค่าเช่า',
        '5. เหลือจ่ายยกมา',
        'รวมจัดสรร (บาท)',
        'สัดส่วนถ่วงน้ำหนัก (%)',
      ]);
      for (const item of dim.items) {
        wsAlloc.addRow([
          item.itemName,
          item.amounts.TUITION,
          item.amounts.ACAD_SERVICE,
          item.amounts.RESEARCH_OH,
          item.amounts.RENT,
          item.amounts.CARRYOVER,
          item.totalAmount,
          Number((item.weightedPct * 100).toFixed(2)),
        ]);
      }
      wsAlloc.addRow(['รวมทั้งสิ้น', '', '', '', '', '', dim.totalAllocated, 100]);
      wsAlloc.addRow([]);
    }

    // 3. Sheet: สรุปรายรับ-รายจ่าย71
    const wsReq = wb.addWorksheet('สรุปรายรับ-รายจ่าย');
    wsReq.addRow(['สรุปคำขอตั้งงบประมาณรายจ่ายเงินรายได้ คณะรัฐศาสตร์และรัฐประศาสนศาสตร์ มหาวิทยาลัยเชียงใหม่']);
    wsReq.addRow([`ประจำปีงบประมาณ พ.ศ. ${wsData.activeVersion.be_year} (เปรียบเทียบปีงบประมาณ ${wsData.priorYearComparison.beYear})`]);
    wsReq.addRow([
      'รายการ',
      `ปีงบ ${wsData.priorYearComparison.beYear} (ครั้งที่ 1)`,
      `ปีงบ ${wsData.activeVersion.be_year} (ตั้งงบ)`,
      'เพิ่ม / (ลด) บาท',
      'ร้อยละ (%)',
    ]);
    const p1 = wsData.priorYearComparison.v1;
    const tGroups = wsData.calc.tuition.byReportGroup;
    const addReqRow = (label: string, oldVal: number, newVal: number) => {
      const diff = newVal - oldVal;
      const pct = oldVal !== 0 ? Number(((diff / oldVal) * 100).toFixed(2)) : 0;
      wsReq.addRow([label, oldVal, newVal, diff, pct]);
    };
    addReqRow('1.1 รายรับจากค่าธรรมเนียมการศึกษา', p1.tuitionTotal, wsData.calc.tuition.totals.netYearRounded);
    addReqRow('  1.1.1 หลักสูตรการเมืองการปกครอง ระดับปริญญาตรี', p1.groups['1.1.1'], tGroups['1.1.1']);
    addReqRow('  1.1.2 หลักสูตรรัฐประศาสนศาสตร์ ระดับปริญญาตรี', p1.groups['1.1.2'], tGroups['1.1.2']);
    addReqRow('  1.1.3 หลักสูตรการระหว่างประเทศ ระดับปริญญาตรี', p1.groups['1.1.3'], tGroups['1.1.3']);
    addReqRow('  1.1.4 หลักสูตรวิทยาศาสตรบัณฑิต (ศาสตร์แห่งความยั่งยืน)', p1.groups['1.1.4'], tGroups['1.1.4']);
    addReqRow('  1.1.5 หลักสูตรการเมืองการปกครอง ระดับบัณฑิตศึกษา', p1.groups['1.1.5'], tGroups['1.1.5']);
    addReqRow('  1.1.6 หลักสูตรรัฐประศาสนศาสตร์ ระดับบัณฑิตศึกษา', p1.groups['1.1.6'], tGroups['1.1.6']);
    addReqRow('  1.1.7 กระบวนวิชาศึกษาทั่วไป', p1.groups['1.1.7'], tGroups['1.1.7']);
    addReqRow('1.2 รายได้จากการบริการวิชาการ', p1.serviceTotal, wsData.calc.service.totals.netRounded);
    addReqRow(
      '1.3 รายได้อื่น/ผลประโยชน์จากการบริหารทรัพย์สิน',
      p1.otherAssetTotal,
      wsData.calc.rental.totals.netRounded + wsData.calc.research.totals.netRounded
    );
    addReqRow('1.4 เงินเหลือจ่ายสะสม', p1.carryover_1_4, wsData.carryover.amount);
    addReqRow('รวมประมาณการรายรับทั้งสิ้น', p1.grandTotal, wsData.calc.monthly.grandTotals.netRounded);

    const buffer = await wb.xlsx.writeBuffer();
    return new NextResponse(buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Revenue_Estimate_${wsData.activeVersion.be_year}_v${wsData.activeVersion.version_no}.xlsx"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
