import Decimal from 'decimal.js';
import { applyRounding, applyRoundingRule, toDecimal } from './rounding';
import {
  DecimalValue,
  MonthDistributionConfig,
  MonthlyMatrixRow,
  MonthlySummaryResult,
  RentalSummaryResult,
  ResearchSummaryResult,
  RevenueTypeCode,
  ServiceSummaryResult,
  TuitionSummaryResult,
} from './types';

export interface OtherIncomeInput {
  name: string;
  monthSeq: number;
  gross: DecimalValue;
  deduction: DecimalValue;
}

export interface MonthlyCalculationInput {
  tuition: TuitionSummaryResult;
  service: ServiceSummaryResult;
  research: ResearchSummaryResult;
  rental: RentalSummaryResult;
  carryoverAmount: DecimalValue;
  otherIncome?: OtherIncomeInput[];
  monthDistribution: MonthDistributionConfig[];
  month1RoundingMode?: 'round' | 'trunc' | 'floor' | 'none';
  otherMonthsRoundingMode?: 'round' | 'trunc' | 'floor' | 'none';
}

export function calculateMonthlySummary(input: MonthlyCalculationInput): MonthlySummaryResult {
  // 1. Validate Month Distribution sums to 1.00 per semester
  let sem2Sum = new Decimal(0);
  let sem1Sum = new Decimal(0);
  const distSem2 = Array.from({ length: 12 }, () => new Decimal(0));
  const distSem1 = Array.from({ length: 12 }, () => new Decimal(0));

  for (const d of input.monthDistribution) {
    if (d.monthSeq >= 1 && d.monthSeq <= 12) {
      const idx = d.monthSeq - 1;
      const s2 = toDecimal(d.semester2Pct);
      const s1 = toDecimal(d.semester1Pct);
      distSem2[idx] = s2;
      distSem1[idx] = s1;
      sem2Sum = sem2Sum.plus(s2);
      sem1Sum = sem1Sum.plus(s1);
    }
  }

  const sem2Valid = sem2Sum.minus(1).abs().lte(0.0001);
  const sem1Valid = sem1Sum.minus(1).abs().lte(0.0001);

  // 2. Prepare 12-month arrays for each revenue type
  const empty12 = () => Array.from({ length: 12 }, () => new Decimal(0));

  const grossTuition = empty12();
  const deductTuition = empty12();
  const refundTuition = empty12();
  const netTuition = empty12();

  const grossService = empty12();
  const deductService = empty12();
  const netService = empty12();

  const grossResearch = empty12();
  const deductResearch = empty12();
  const netResearch = empty12();

  const grossRent = empty12();
  const deductRent = empty12();
  const netRent = empty12();

  const grossCarry = empty12();
  const deductCarry = empty12();
  const netCarry = empty12();

  const grossOther = empty12();
  const deductOther = empty12();
  const netOther = empty12();

  // (a) Tuition monthly distribution
  const tGrossS2 = toDecimal(input.tuition.totals.grossSem2);
  const tGrossS1 = toDecimal(input.tuition.totals.grossSem1);
  const tDeductS2 = toDecimal(input.tuition.totals.totalDeductionWithCmuSem2);
  const tDeductS1 = toDecimal(input.tuition.totals.totalDeductionWithCmuSem1);
  const tRefundS2 = toDecimal(input.tuition.totals.libraryRefundSem2);
  const tRefundS1 = toDecimal(input.tuition.totals.libraryRefundSem1);
  const tNetS2 = toDecimal(input.tuition.totals.netSem2);
  const tNetS1 = toDecimal(input.tuition.totals.netSem1);

  for (let m = 0; m < 12; m++) {
    const p2 = distSem2[m];
    const p1 = distSem1[m];

    grossTuition[m] = tGrossS2.mul(p2).plus(tGrossS1.mul(p1));
    deductTuition[m] = tDeductS2.mul(p2).plus(tDeductS1.mul(p1));
    refundTuition[m] = tRefundS2.mul(p2).plus(tRefundS1.mul(p1));
    netTuition[m] = tNetS2.mul(p2).plus(tNetS1.mul(p1));
  }

  // (b) Service monthly distribution
  for (const p of input.service.lines) {
    if (p.monthSeq >= 1 && p.monthSeq <= 12) {
      const idx = p.monthSeq - 1;
      grossService[idx] = grossService[idx].plus(p.gross);
      deductService[idx] = deductService[idx].plus(p.totalDeduction);
      netService[idx] = netService[idx].plus(p.net);
    }
  }

  // (c) Research Overhead monthly distribution
  for (const r of input.research.lines) {
    if (r.monthSeq >= 1 && r.monthSeq <= 12) {
      const idx = r.monthSeq - 1;
      grossResearch[idx] = grossResearch[idx].plus(r.grossOverhead);
      deductResearch[idx] = deductResearch[idx].plus(r.centralDeduction);
      netResearch[idx] = netResearch[idx].plus(r.netOverhead);
    }
  }

  // (d) Rental monthly distribution
  for (const rentItem of input.rental.lines) {
    for (let m = 0; m < 12; m++) {
      grossRent[m] = grossRent[m].plus(rentItem.monthlyGross[m]);
      deductRent[m] = deductRent[m].plus(rentItem.monthlyDeduction[m]);
      netRent[m] = netRent[m].plus(rentItem.monthlyNet[m]);
    }
  }

  // (e) Carryover (Month 1 only)
  const carryAmt = toDecimal(input.carryoverAmount);
  grossCarry[0] = carryAmt;
  netCarry[0] = carryAmt;

  // (f) Other income
  if (input.otherIncome) {
    for (const o of input.otherIncome) {
      if (o.monthSeq >= 1 && o.monthSeq <= 12) {
        const idx = o.monthSeq - 1;
        const g = toDecimal(o.gross);
        const d = toDecimal(o.deduction);
        grossOther[idx] = grossOther[idx].plus(g);
        deductOther[idx] = deductOther[idx].plus(d);
        netOther[idx] = netOther[idx].plus(g.minus(d));
      }
    }
  }

  // Helper to build matrix row
  const makeRow = (
    revenueType: RevenueTypeCode,
    label: string,
    arr: Decimal[],
    roundedYearTotal: number
  ): MonthlyMatrixRow => {
    const months = arr.map((d) => d.toNumber());
    const yearTotalExact = arr.reduce((acc, d) => acc.plus(d), new Decimal(0)).toNumber();
    const sumMonths = months.reduce((acc, v) => acc + v, 0);
    const monthlySumCheck = Math.abs(sumMonths - yearTotalExact) < 0.01;

    return {
      revenueType,
      label,
      months,
      yearTotalExact,
      yearTotalRounded: roundedYearTotal,
      monthlySumCheck,
    };
  };

  const grossByType: Record<RevenueTypeCode, MonthlyMatrixRow> = {
    TUITION: makeRow('TUITION', '1. ค่าธรรมเนียมการศึกษา', grossTuition, input.tuition.totals.grossYear),
    ACAD_SERVICE: makeRow('ACAD_SERVICE', '2. บริการวิชาการ', grossService, input.service.totals.gross),
    RESEARCH_OH: makeRow('RESEARCH_OH', '3. ค่า Overhead งานวิจัย', grossResearch, input.research.totals.grossOverhead),
    RENT: makeRow('RENT', '4. ค่าเช่าพื้นที่ราชพัสดุ', grossRent, input.rental.totals.grossYear),
    CARRYOVER: makeRow('CARRYOVER', '5. เงินเหลือจ่ายสะสมยกมา', grossCarry, carryAmt.toNumber()),
    OTHER: makeRow(
      'OTHER',
      '6. รายได้อื่น',
      grossOther,
      grossOther.reduce((acc, d) => acc.plus(d), new Decimal(0)).toNumber()
    ),
  };

  const deductionByType: Record<RevenueTypeCode, MonthlyMatrixRow> = {
    TUITION: makeRow(
      'TUITION',
      '1. ค่าธรรมเนียมการศึกษา',
      deductTuition,
      input.tuition.totals.totalDeductionWithCmuYear
    ),
    ACAD_SERVICE: makeRow(
      'ACAD_SERVICE',
      '2. บริการวิชาการ',
      deductService,
      input.service.totals.totalDeduction
    ),
    RESEARCH_OH: makeRow(
      'RESEARCH_OH',
      '3. ค่า Overhead งานวิจัย',
      deductResearch,
      input.research.totals.centralDeduction
    ),
    RENT: makeRow('RENT', '4. ค่าเช่าพื้นที่ราชพัสดุ', deductRent, input.rental.totals.deductionYear),
    CARRYOVER: makeRow('CARRYOVER', '5. เงินเหลือจ่ายสะสมยกมา', deductCarry, 0),
    OTHER: makeRow(
      'OTHER',
      '6. รายได้อื่น',
      deductOther,
      deductOther.reduce((acc, d) => acc.plus(d), new Decimal(0)).toNumber()
    ),
  };

  const netByType: Record<RevenueTypeCode, MonthlyMatrixRow> = {
    TUITION: makeRow('TUITION', '1. ค่าธรรมเนียมการศึกษา', netTuition, input.tuition.totals.netYearRounded),
    ACAD_SERVICE: makeRow('ACAD_SERVICE', '2. บริการวิชาการ', netService, input.service.totals.netRounded),
    RESEARCH_OH: makeRow('RESEARCH_OH', '3. ค่า Overhead งานวิจัย', netResearch, input.research.totals.netRounded),
    RENT: makeRow('RENT', '4. ค่าเช่าพื้นที่ราชพัสดุ', netRent, input.rental.totals.netRounded),
    CARRYOVER: makeRow('CARRYOVER', '5. เงินเหลือจ่ายสะสมยกมา', netCarry, carryAmt.toNumber()),
    OTHER: makeRow(
      'OTHER',
      '6. รายได้อื่น',
      netOther,
      netOther.reduce((acc, d) => acc.plus(d), new Decimal(0)).toNumber()
    ),
  };

  // Monthly totals across types
  const monthlyGrossTotals: number[] = [];
  const monthlyDeductionTotals: number[] = [];
  const monthlyNetTotalsExact: number[] = [];
  const monthlyNetTotalsRounded: number[] = [];

  const cumulativeNetExact: number[] = [];
  const cumulativeNetRounded: number[] = [];

  let cumExact = new Decimal(0);
  let cumRounded = new Decimal(0);

  for (let m = 0; m < 12; m++) {
    const mg = grossTuition[m]
      .plus(grossService[m])
      .plus(grossResearch[m])
      .plus(grossRent[m])
      .plus(grossCarry[m])
      .plus(grossOther[m]);

    const md = deductTuition[m]
      .plus(deductService[m])
      .plus(deductResearch[m])
      .plus(deductRent[m])
      .plus(deductCarry[m])
      .plus(deductOther[m]);

    const mn = netTuition[m]
      .plus(netService[m])
      .plus(netResearch[m])
      .plus(netRent[m])
      .plus(netCarry[m])
      .plus(netOther[m]);

    // In Excel row 28, B28 (Month 1) uses ROUND(SUM(B23:B27),-3) while C28:M28 (Months 2..12) use TRUNC(SUM(...),-3)
    const monthMode =
      m === 0
        ? (input.month1RoundingMode ?? 'round')
        : (input.otherMonthsRoundingMode ?? 'trunc');
    const mnRounded = applyRounding(mn, monthMode, -3);

    monthlyGrossTotals.push(mg.toNumber());
    monthlyDeductionTotals.push(md.toNumber());
    monthlyNetTotalsExact.push(mn.toNumber());
    monthlyNetTotalsRounded.push(mnRounded.toNumber());

    cumExact = cumExact.plus(mn);
    cumRounded = cumRounded.plus(mnRounded);
    cumulativeNetExact.push(cumExact.toNumber());
    cumulativeNetRounded.push(cumRounded.toNumber());
  }

  const grossExact = Object.values(grossByType).reduce((acc, r) => acc + r.yearTotalExact, 0);
  const deductionExact = Object.values(deductionByType).reduce((acc, r) => acc + r.yearTotalExact, 0);
  const netExact = Object.values(netByType).reduce((acc, r) => acc + r.yearTotalExact, 0);

  // Grand total net rounded is sum of each type's rounded year total: 39,981,000 + 2,886,000 + 206,000 + 988,000 + 4,006,000 = 48,067,000
  const netRounded =
    input.tuition.totals.netYearRounded +
    input.service.totals.netRounded +
    input.research.totals.netRounded +
    input.rental.totals.netRounded +
    carryAmt.toNumber();

  const sumOfMonthlyNetRounded = monthlyNetTotalsRounded.reduce((acc, v) => acc + v, 0); // 48,065,000
  const roundingDifference = netRounded - sumOfMonthlyNetRounded; // 2,000

  return {
    distributionValidation: {
      sem2Sum: sem2Sum.toNumber(),
      sem1Sum: sem1Sum.toNumber(),
      sem2Valid,
      sem1Valid,
    },
    grossByType,
    deductionByType,
    libraryRefundMonthly: refundTuition.map((d) => d.toNumber()),
    libraryRefundYear: input.tuition.totals.libraryRefundYear,
    netByType,
    monthlyGrossTotals,
    monthlyDeductionTotals,
    monthlyNetTotalsExact,
    monthlyNetTotalsRounded,
    cumulativeNetExact,
    cumulativeNetRounded,
    grandTotals: {
      grossExact,
      grossRounded: applyRounding(grossExact, 'trunc', -3).toNumber(),
      deductionExact,
      deductionRounded: applyRounding(deductionExact, 'trunc', -3).toNumber(),
      libraryRefund: input.tuition.totals.libraryRefundYear,
      netExact,
      netRounded,
      sumOfMonthlyNetRounded,
      roundingDifference,
    },
  };
}
