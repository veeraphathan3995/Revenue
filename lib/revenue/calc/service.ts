import Decimal from 'decimal.js';
import { applyRounding, applyRoundingRule, toDecimal } from './rounding';
import {
  ServiceCalculationParams,
  ServiceProjectCalcResult,
  ServiceProjectInput,
  ServiceSummaryResult,
} from './types';

export function calculateServiceProject(
  project: ServiceProjectInput,
  params: ServiceCalculationParams
): ServiceProjectCalcResult {
  const batches = new Decimal(project.batches || 0);
  const attendees = new Decimal(project.attendeesPerBatch || 0);
  const feePerHead = toDecimal(project.feePerHead);

  const gross = batches.mul(attendees).mul(feePerHead);
  const d1Rate = toDecimal(params.serviceDeduct1);
  const d2Rate = toDecimal(params.serviceDeduct2);

  const centralDeduction = gross.mul(d1Rate);

  let mgmtDeduction = new Decimal(0);
  if (project.applyMgmtDeduction) {
    const base = params.serviceDeduct2Base === 'after_d1' ? gross.minus(centralDeduction) : gross;
    mgmtDeduction = base.mul(d2Rate);
  }

  const totalDeduction = centralDeduction.plus(mgmtDeduction);
  const net = gross.minus(totalDeduction);

  return {
    id: project.id,
    name: project.name,
    partner: project.partner ?? null,
    category: project.category,
    batches: batches.toNumber(),
    attendeesPerBatch: attendees.toNumber(),
    feePerHead: feePerHead.toNumber(),
    applyMgmtDeduction: project.applyMgmtDeduction,
    monthSeq: project.monthSeq,
    note: project.note ?? null,
    gross: gross.toNumber(),
    centralDeduction: centralDeduction.toNumber(),
    mgmtDeduction: mgmtDeduction.toNumber(),
    totalDeduction: totalDeduction.toNumber(),
    net: net.toNumber(),
  };
}

export function calculateService(
  projects: ServiceProjectInput[],
  params: ServiceCalculationParams
): ServiceSummaryResult {
  const calculatedLines = projects.map((p) => calculateServiceProject(p, params));

  let grossTotal = new Decimal(0);
  let d1Total = new Decimal(0);
  let d2Total = new Decimal(0);
  let totalDeductSum = new Decimal(0);
  let netExact = new Decimal(0);

  let sumShortCourse = new Decimal(0);
  let sumUsac = new Decimal(0);
  let sumLe = new Decimal(0);

  for (const line of calculatedLines) {
    grossTotal = grossTotal.plus(line.gross);
    d1Total = d1Total.plus(line.centralDeduction);
    d2Total = d2Total.plus(line.mgmtDeduction);
    totalDeductSum = totalDeductSum.plus(line.totalDeduction);
    netExact = netExact.plus(line.net);

    if (line.category === 'short_course') {
      sumShortCourse = sumShortCourse.plus(line.net);
    } else if (line.category === 'usac') {
      sumUsac = sumUsac.plus(line.net);
    } else if (line.category === 'le' || line.category === 'school_activity') {
      sumLe = sumLe.plus(line.net);
    }
  }

  const roundingRule = params.yearTotalRounding ?? {
    scope: 'ACAD_SERVICE_YEAR_TOTAL',
    mode: 'floor',
    digits: -3,
  };
  const netRounded = applyRoundingRule(netExact, roundingRule);

  // In budget request report (แผ่นสรุปรายรับ-รายจ่าย71):
  // 1.2.1 is truncated to hundreds (-2)
  // 1.2.2 is truncated to hundreds (-2)
  // 1.2.3 is truncated to hundreds (-2)
  const shortCourse_1_2_1 = applyRounding(sumShortCourse, 'trunc', -2).toNumber();
  const usac_1_2_2 = applyRounding(sumUsac, 'trunc', -2).toNumber();
  const le_1_2_3 = applyRounding(sumLe, 'trunc', -2).toNumber();

  return {
    lines: calculatedLines,
    totals: {
      gross: grossTotal.toNumber(),
      centralDeduction: d1Total.toNumber(),
      mgmtDeduction: d2Total.toNumber(),
      totalDeduction: totalDeductSum.toNumber(),
      netExact: netExact.toNumber(),
      netRounded: netRounded.toNumber(),
    },
    byReportCategory: {
      shortCourse_1_2_1,
      usac_1_2_2,
      le_1_2_3,
    },
  };
}
