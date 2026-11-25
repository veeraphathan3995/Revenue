import Decimal from 'decimal.js';
import { applyRoundingRule, toDecimal } from './rounding';
import {
  ProgramLevelCode,
  ReportGroupCode,
  TuitionCalculationParams,
  TuitionLineCalcResult,
  TuitionLineInput,
  TuitionSummaryResult,
} from './types';

export function calculateTuitionLine(
  line: TuitionLineInput,
  params: TuitionCalculationParams
): TuitionLineCalcResult {
  const h2 = new Decimal(line.headcountSem2 || 0);
  const h1 = new Decimal(line.headcountSem1 || 0);
  const totalHeadcount = h2.plus(h1);
  const fee = toDecimal(line.feePerHead);

  const grossS2 = h2.mul(fee);
  const grossS1 = h1.mul(fee);
  const grossYear = grossS2.plus(grossS1);

  if (line.lineType !== 'regular') {
    // General Education (in or out) has no per-head deductions, no CMU share, no refund
    return {
      id: line.id,
      programId: line.programId,
      programCode: line.programCode,
      programName: line.programName,
      level: line.level,
      reportGroup: line.reportGroup,
      cohortCode: line.cohortCode,
      lineType: line.lineType,
      headcountSem2: h2.toNumber(),
      headcountSem1: h1.toNumber(),
      totalHeadcount: totalHeadcount.toNumber(),
      feePerHead: fee.toNumber(),
      libraryFeeTotal: 0,
      itFeeTotal: 0,
      healthFeeTotal: 0,
      registrationFeeTotal: 0,
      developmentFeeTotal: 0,
      deductionBeforeCmu: 0,
      netBeforeCmu: grossYear.toNumber(),
      grossSem2: grossS2.toNumber(),
      grossSem1: grossS1.toNumber(),
      grossYear: grossYear.toNumber(),
      deductionSem2: 0,
      deductionSem1: 0,
      deductionYear: 0,
      cmuShareSem2: 0,
      cmuShareSem1: 0,
      cmuShareYear: 0,
      libraryRefundSem2: 0,
      libraryRefundSem1: 0,
      libraryRefundYear: 0,
      netSem2: grossS2.toNumber(),
      netSem1: grossS1.toNumber(),
      netYear: grossYear.toNumber(),
    };
  }

  const sched = params.feeSchedules[line.level];
  if (!sched) {
    throw new Error(`Fee schedule not configured for program level: ${line.level}`);
  }

  const libraryFee = toDecimal(sched.libraryFee);
  const itFee = toDecimal(sched.itFee);
  const healthFee = toDecimal(sched.healthFee);
  const regFeeRate = toDecimal(sched.registrationFee);
  const totalDeductRate = toDecimal(sched.totalDeductionPerHead);
  const libraryRefundPct = toDecimal(sched.libraryRefundPct);
  const cmuPct = toDecimal(params.cmuPct);

  const newCohortCode = String(params.beYear % 100);
  const isNewCohort = line.cohortCode !== null && String(line.cohortCode).trim() === newCohortCode;

  const libraryFeeTotal = totalHeadcount.mul(libraryFee);
  const itFeeTotal = totalHeadcount.mul(itFee);
  const healthFeeTotal = totalHeadcount.mul(healthFee);
  const registrationFeeTotal = isNewCohort ? h1.mul(regFeeRate) : new Decimal(0);

  const deductionBeforeCmu = totalHeadcount.mul(totalDeductRate);
  const devFeeTotal = deductionBeforeCmu
    .minus(libraryFeeTotal)
    .minus(itFeeTotal)
    .minus(healthFeeTotal)
    .minus(registrationFeeTotal);

  const netBeforeCmu = grossYear.minus(deductionBeforeCmu);
  const cmuShareYear = netBeforeCmu.mul(cmuPct);

  const refundS2 = h2.mul(libraryFee).mul(libraryRefundPct);
  const refundS1 = h1.mul(libraryFee).mul(libraryRefundPct);
  const refundYear = refundS2.plus(refundS1);

  let netS2 = new Decimal(0);
  let netS1 = new Decimal(0);
  let cmuShareS2 = new Decimal(0);
  let cmuShareS1 = new Decimal(0);
  let deductS2 = new Decimal(0);
  let deductS1 = new Decimal(0);

  if (totalHeadcount.gt(0)) {
    const ratioS2 = h2.div(totalHeadcount);
    const ratioS1 = h1.div(totalHeadcount);

    cmuShareS2 = cmuShareYear.mul(ratioS2);
    cmuShareS1 = cmuShareYear.mul(ratioS1);

    netS2 = netBeforeCmu.mul(ratioS2).mul(new Decimal(1).minus(cmuPct)).plus(refundS2);
    netS1 = netBeforeCmu.mul(ratioS1).mul(new Decimal(1).minus(cmuPct)).plus(refundS1);

    deductS2 = deductionBeforeCmu.mul(ratioS2).plus(cmuShareS2);
    deductS1 = deductionBeforeCmu.mul(ratioS1).plus(cmuShareS1);
  }

  const netYear = netS2.plus(netS1);
  const deductionYear = deductS2.plus(deductS1);

  return {
    id: line.id,
    programId: line.programId,
    programCode: line.programCode,
    programName: line.programName,
    level: line.level,
    reportGroup: line.reportGroup,
    cohortCode: line.cohortCode,
    lineType: line.lineType,
    headcountSem2: h2.toNumber(),
    headcountSem1: h1.toNumber(),
    totalHeadcount: totalHeadcount.toNumber(),
    feePerHead: fee.toNumber(),
    libraryFeeTotal: libraryFeeTotal.toNumber(),
    itFeeTotal: itFeeTotal.toNumber(),
    healthFeeTotal: healthFeeTotal.toNumber(),
    registrationFeeTotal: registrationFeeTotal.toNumber(),
    developmentFeeTotal: devFeeTotal.toNumber(),
    deductionBeforeCmu: deductionBeforeCmu.toNumber(),
    netBeforeCmu: netBeforeCmu.toNumber(),
    grossSem2: grossS2.toNumber(),
    grossSem1: grossS1.toNumber(),
    grossYear: grossYear.toNumber(),
    deductionSem2: deductS2.toNumber(),
    deductionSem1: deductS1.toNumber(),
    deductionYear: deductionYear.toNumber(),
    cmuShareSem2: cmuShareS2.toNumber(),
    cmuShareSem1: cmuShareS1.toNumber(),
    cmuShareYear: cmuShareYear.toNumber(),
    libraryRefundSem2: refundS2.toNumber(),
    libraryRefundSem1: refundS1.toNumber(),
    libraryRefundYear: refundYear.toNumber(),
    netSem2: netS2.toNumber(),
    netSem1: netS1.toNumber(),
    netYear: netYear.toNumber(),
  };
}

export function calculateTuition(
  lines: TuitionLineInput[],
  params: TuitionCalculationParams
): TuitionSummaryResult {
  const calculatedLines = lines.map((line) => calculateTuitionLine(line, params));

  let headcountSem2 = 0;
  let headcountSem1 = 0;
  let libraryFeeTotal = new Decimal(0);
  let itFeeTotal = new Decimal(0);
  let healthFeeTotal = new Decimal(0);
  let registrationFeeTotal = new Decimal(0);
  let developmentFeeTotal = new Decimal(0);
  let deductionBeforeCmu = new Decimal(0);
  let netBeforeCmu = new Decimal(0);
  let grossSem2 = new Decimal(0);
  let grossSem1 = new Decimal(0);
  let grossYear = new Decimal(0);
  let cmuShareSem2 = new Decimal(0);
  let cmuShareSem1 = new Decimal(0);
  let cmuShareYear = new Decimal(0);
  let totalDeductionWithCmuSem2 = new Decimal(0);
  let totalDeductionWithCmuSem1 = new Decimal(0);
  let totalDeductionWithCmuYear = new Decimal(0);
  let libraryRefundSem2 = new Decimal(0);
  let libraryRefundSem1 = new Decimal(0);
  let libraryRefundYear = new Decimal(0);
  let netSem2 = new Decimal(0);
  let netSem1 = new Decimal(0);
  let netYearExact = new Decimal(0);

  // Aggregation by program
  const progMap = new Map<
    string,
    {
      programCode: string;
      programName: string;
      level: ProgramLevelCode;
      reportGroup: ReportGroupCode;
      grossYear: Decimal;
      deductionYear: Decimal;
      cmuShareYear: Decimal;
      libraryRefundYear: Decimal;
      netYear: Decimal;
    }
  >();

  // Aggregation by report group (1.1.1 to 1.1.7)
  const reportGroupSums: Record<ReportGroupCode, Decimal> = {
    '1.1.1': new Decimal(0),
    '1.1.2': new Decimal(0),
    '1.1.3': new Decimal(0),
    '1.1.4': new Decimal(0),
    '1.1.5': new Decimal(0),
    '1.1.6': new Decimal(0),
    '1.1.7': new Decimal(0),
  };

  for (const line of calculatedLines) {
    headcountSem2 += line.headcountSem2;
    headcountSem1 += line.headcountSem1;
    libraryFeeTotal = libraryFeeTotal.plus(line.libraryFeeTotal);
    itFeeTotal = itFeeTotal.plus(line.itFeeTotal);
    healthFeeTotal = healthFeeTotal.plus(line.healthFeeTotal);
    registrationFeeTotal = registrationFeeTotal.plus(line.registrationFeeTotal);
    developmentFeeTotal = developmentFeeTotal.plus(line.developmentFeeTotal);
    deductionBeforeCmu = deductionBeforeCmu.plus(line.deductionBeforeCmu);
    netBeforeCmu = netBeforeCmu.plus(line.netBeforeCmu);
    grossSem2 = grossSem2.plus(line.grossSem2);
    grossSem1 = grossSem1.plus(line.grossSem1);
    grossYear = grossYear.plus(line.grossYear);
    cmuShareSem2 = cmuShareSem2.plus(line.cmuShareSem2);
    cmuShareSem1 = cmuShareSem1.plus(line.cmuShareSem1);
    cmuShareYear = cmuShareYear.plus(line.cmuShareYear);
    totalDeductionWithCmuSem2 = totalDeductionWithCmuSem2.plus(line.deductionSem2);
    totalDeductionWithCmuSem1 = totalDeductionWithCmuSem1.plus(line.deductionSem1);
    totalDeductionWithCmuYear = totalDeductionWithCmuYear.plus(line.deductionYear);
    libraryRefundSem2 = libraryRefundSem2.plus(line.libraryRefundSem2);
    libraryRefundSem1 = libraryRefundSem1.plus(line.libraryRefundSem1);
    libraryRefundYear = libraryRefundYear.plus(line.libraryRefundYear);
    netSem2 = netSem2.plus(line.netSem2);
    netSem1 = netSem1.plus(line.netSem1);
    netYearExact = netYearExact.plus(line.netYear);

    // Group by program
    const progKey = line.programCode;
    let existingProg = progMap.get(progKey);
    if (!existingProg) {
      existingProg = {
        programCode: line.programCode,
        programName: line.programName,
        level: line.level,
        reportGroup: line.reportGroup,
        grossYear: new Decimal(0),
        deductionYear: new Decimal(0),
        cmuShareYear: new Decimal(0),
        libraryRefundYear: new Decimal(0),
        netYear: new Decimal(0),
      };
      progMap.set(progKey, existingProg);
    }
    existingProg.grossYear = existingProg.grossYear.plus(line.grossYear);
    existingProg.deductionYear = existingProg.deductionYear.plus(line.deductionYear);
    existingProg.cmuShareYear = existingProg.cmuShareYear.plus(line.cmuShareYear);
    existingProg.libraryRefundYear = existingProg.libraryRefundYear.plus(line.libraryRefundYear);
    existingProg.netYear = existingProg.netYear.plus(line.netYear);

    // Group by reportGroup
    if (reportGroupSums[line.reportGroup]) {
      reportGroupSums[line.reportGroup] = reportGroupSums[line.reportGroup].plus(line.netYear);
    }
  }

  const roundingRule = params.yearTotalRounding ?? {
    scope: 'TUITION_YEAR_TOTAL',
    mode: 'trunc',
    digits: -3,
  };
  const netYearRounded = applyRoundingRule(netYearExact, roundingRule);

  const scholarshipPct = toDecimal(params.scholarshipPct);
  const byProgram = Array.from(progMap.values()).map((p) => ({
    programCode: p.programCode,
    programName: p.programName,
    level: p.level,
    reportGroup: p.reportGroup,
    grossYear: p.grossYear.toNumber(),
    deductionYear: p.deductionYear.toNumber(),
    cmuShareYear: p.cmuShareYear.toNumber(),
    libraryRefundYear: p.libraryRefundYear.toNumber(),
    netYear: p.netYear.toNumber(),
    scholarshipAmount: p.netYear.mul(scholarshipPct).toNumber(),
  }));

  const byReportGroup: Record<ReportGroupCode, number> = {
    '1.1.1': reportGroupSums['1.1.1'].toNumber(),
    '1.1.2': reportGroupSums['1.1.2'].toNumber(),
    '1.1.3': reportGroupSums['1.1.3'].toNumber(),
    '1.1.4': reportGroupSums['1.1.4'].toNumber(),
    '1.1.5': reportGroupSums['1.1.5'].toNumber(),
    '1.1.6': reportGroupSums['1.1.6'].toNumber(),
    '1.1.7': reportGroupSums['1.1.7'].toNumber(),
  };

  return {
    lines: calculatedLines,
    totals: {
      headcountSem2,
      headcountSem1,
      libraryFeeTotal: libraryFeeTotal.toNumber(),
      itFeeTotal: itFeeTotal.toNumber(),
      healthFeeTotal: healthFeeTotal.toNumber(),
      registrationFeeTotal: registrationFeeTotal.toNumber(),
      developmentFeeTotal: developmentFeeTotal.toNumber(),
      deductionBeforeCmu: deductionBeforeCmu.toNumber(),
      netBeforeCmu: netBeforeCmu.toNumber(),
      grossSem2: grossSem2.toNumber(),
      grossSem1: grossSem1.toNumber(),
      grossYear: grossYear.toNumber(),
      cmuShareSem2: cmuShareSem2.toNumber(),
      cmuShareSem1: cmuShareSem1.toNumber(),
      cmuShareYear: cmuShareYear.toNumber(),
      totalDeductionWithCmuSem2: totalDeductionWithCmuSem2.toNumber(),
      totalDeductionWithCmuSem1: totalDeductionWithCmuSem1.toNumber(),
      totalDeductionWithCmuYear: totalDeductionWithCmuYear.toNumber(),
      libraryRefundSem2: libraryRefundSem2.toNumber(),
      libraryRefundSem1: libraryRefundSem1.toNumber(),
      libraryRefundYear: libraryRefundYear.toNumber(),
      netSem2: netSem2.toNumber(),
      netSem1: netSem1.toNumber(),
      netYearExact: netYearExact.toNumber(),
      netYearRounded: netYearRounded.toNumber(),
    },
    byProgram,
    byReportGroup,
  };
}
