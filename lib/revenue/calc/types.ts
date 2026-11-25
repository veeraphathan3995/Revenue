import Decimal from 'decimal.js';

// Configure Decimal for high-precision financial arithmetic
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type DecimalValue = Decimal | number | string;

export type RevenueTypeCode =
  | 'TUITION'
  | 'ACAD_SERVICE'
  | 'RESEARCH_OH'
  | 'RENT'
  | 'CARRYOVER'
  | 'OTHER';

export type ProgramLevelCode = 'bachelor' | 'master' | 'doctoral';

export type ReportGroupCode =
  | '1.1.1'
  | '1.1.2'
  | '1.1.3'
  | '1.1.4'
  | '1.1.5'
  | '1.1.6'
  | '1.1.7';

export type TuitionLineTypeCode = 'regular' | 'gen_ed_in' | 'gen_ed_out';

export type ServiceCategoryCode =
  | 'short_course'
  | 'usac'
  | 'le'
  | 'school_activity';

export type AllocationDimensionCode = 'plan' | 'expense_category' | 'strategic';

export type RoundingModeCode = 'trunc' | 'round' | 'floor' | 'none';

export interface RoundingRuleConfig {
  scope: string;
  mode: RoundingModeCode;
  digits: number; // e.g., -3 = thousands, -2 = hundreds, 0 = integer
}

export interface FeeScheduleConfig {
  level: ProgramLevelCode;
  libraryFee: DecimalValue;
  itFee: DecimalValue;
  healthFee: DecimalValue;
  registrationFee: DecimalValue;
  totalDeductionPerHead: DecimalValue;
  libraryRefundPct: DecimalValue;
}

export interface TuitionCalculationParams {
  beYear: number;
  cmuPct: DecimalValue; // e.g. 0.10
  scholarshipPct: DecimalValue; // e.g. 0.20
  feeSchedules: Record<ProgramLevelCode, FeeScheduleConfig>;
  yearTotalRounding?: RoundingRuleConfig;
}

export interface TuitionLineInput {
  id: string;
  programId: string;
  programCode: string;
  programName: string;
  level: ProgramLevelCode;
  reportGroup: ReportGroupCode;
  cohortCode: string | null;
  lineType: TuitionLineTypeCode;
  headcountSem2: number;
  headcountSem1: number;
  feePerHead: DecimalValue;
}

export interface TuitionLineCalcResult {
  id: string;
  programId: string;
  programCode: string;
  programName: string;
  level: ProgramLevelCode;
  reportGroup: ReportGroupCode;
  cohortCode: string | null;
  lineType: TuitionLineTypeCode;
  headcountSem2: number;
  headcountSem1: number;
  totalHeadcount: number;
  feePerHead: number;
  libraryFeeTotal: number;
  itFeeTotal: number;
  healthFeeTotal: number;
  registrationFeeTotal: number;
  developmentFeeTotal: number;
  deductionBeforeCmu: number;
  netBeforeCmu: number;
  grossSem2: number;
  grossSem1: number;
  grossYear: number;
  deductionSem2: number;
  deductionSem1: number;
  deductionYear: number;
  cmuShareSem2: number;
  cmuShareSem1: number;
  cmuShareYear: number;
  libraryRefundSem2: number;
  libraryRefundSem1: number;
  libraryRefundYear: number;
  netSem2: number;
  netSem1: number;
  netYear: number;
}

export interface TuitionSummaryResult {
  lines: TuitionLineCalcResult[];
  totals: {
    headcountSem2: number;
    headcountSem1: number;
    libraryFeeTotal: number;
    itFeeTotal: number;
    healthFeeTotal: number;
    registrationFeeTotal: number;
    developmentFeeTotal: number;
    deductionBeforeCmu: number;
    netBeforeCmu: number;
    grossSem2: number;
    grossSem1: number;
    grossYear: number;
    cmuShareSem2: number;
    cmuShareSem1: number;
    cmuShareYear: number;
    totalDeductionWithCmuSem2: number;
    totalDeductionWithCmuSem1: number;
    totalDeductionWithCmuYear: number;
    libraryRefundSem2: number;
    libraryRefundSem1: number;
    libraryRefundYear: number;
    netSem2: number;
    netSem1: number;
    netYearExact: number;
    netYearRounded: number;
  };
  byProgram: Array<{
    programCode: string;
    programName: string;
    level: ProgramLevelCode;
    reportGroup: ReportGroupCode;
    grossYear: number;
    deductionYear: number;
    cmuShareYear: number;
    libraryRefundYear: number;
    netYear: number;
    scholarshipAmount: number;
  }>;
  byReportGroup: Record<ReportGroupCode, number>;
}

export interface ServiceProjectInput {
  id: string;
  name: string;
  partner?: string | null;
  category: ServiceCategoryCode;
  batches: number;
  attendeesPerBatch: number;
  feePerHead: DecimalValue;
  applyMgmtDeduction: boolean;
  monthSeq: number; // 1..12
  note?: string | null;
}

export interface ServiceCalculationParams {
  serviceDeduct1: DecimalValue; // e.g. 0.10
  serviceDeduct2: DecimalValue; // e.g. 0.40
  serviceDeduct2Base: 'after_d1' | 'gross';
  yearTotalRounding?: RoundingRuleConfig;
}

export interface ServiceProjectCalcResult {
  id: string;
  name: string;
  partner?: string | null;
  category: ServiceCategoryCode;
  batches: number;
  attendeesPerBatch: number;
  feePerHead: number;
  applyMgmtDeduction: boolean;
  monthSeq: number;
  note?: string | null;
  gross: number;
  centralDeduction: number; // d1
  mgmtDeduction: number; // d2
  totalDeduction: number; // d1 + d2
  net: number;
}

export interface ServiceSummaryResult {
  lines: ServiceProjectCalcResult[];
  totals: {
    gross: number;
    centralDeduction: number;
    mgmtDeduction: number;
    totalDeduction: number;
    netExact: number;
    netRounded: number;
  };
  byReportCategory: {
    shortCourse_1_2_1: number; // truncated to hundreds in budget request report
    usac_1_2_2: number;
    le_1_2_3: number;
  };
}

export interface ResearchProjectInput {
  id: string;
  name: string;
  funder?: string | null;
  piName?: string | null;
  budget: DecimalValue;
  overheadRateOverride?: DecimalValue | null;
  monthSeq: number;
  note?: string | null;
}

export interface ResearchCalculationParams {
  ohDefaultRate: DecimalValue;
  ohCentralPct: DecimalValue;
  lineRounding?: RoundingRuleConfig;
  yearTotalRounding?: RoundingRuleConfig;
}

export interface ResearchProjectCalcResult {
  id: string;
  name: string;
  funder?: string | null;
  piName?: string | null;
  budget: number;
  effectiveRate: number;
  overheadRateOverride: number | null;
  monthSeq: number;
  note?: string | null;
  grossOverhead: number;
  centralDeduction: number;
  netOverhead: number;
}

export interface ResearchSummaryResult {
  lines: ResearchProjectCalcResult[];
  totals: {
    budget: number;
    grossOverhead: number;
    centralDeduction: number;
    netExact: number;
    netRounded: number;
  };
}

export interface RentalItemInput {
  id: string;
  name: string;
  tenant?: string | null;
  areaSqm?: DecimalValue | null;
  monthlyRent: DecimalValue;
  startMonthSeq: number;
  endMonthSeq: number;
  note?: string | null;
}

export interface RentalCalculationParams {
  rentDeductPct: DecimalValue; // e.g. 0.10
  yearTotalRounding?: RoundingRuleConfig;
}

export interface RentalItemCalcResult {
  id: string;
  name: string;
  tenant?: string | null;
  areaSqm: number | null;
  monthlyRent: number;
  startMonthSeq: number;
  endMonthSeq: number;
  activeMonths: number;
  isValidMonthRange: boolean;
  warning: string | null;
  grossYear: number;
  deductionYear: number;
  netYear: number;
  monthlyGross: number[]; // length 12 (index 0 = month 1)
  monthlyDeduction: number[];
  monthlyNet: number[];
  note?: string | null;
}

export interface RentalSummaryResult {
  lines: RentalItemCalcResult[];
  totals: {
    monthlyRentSum: number;
    grossYear: number;
    deductionYear: number;
    netExact: number;
    netRounded: number;
  };
}

export interface MonthDistributionConfig {
  monthSeq: number; // 1..12
  semester2Pct: DecimalValue;
  semester1Pct: DecimalValue;
}

export interface MonthlyMatrixRow {
  revenueType: RevenueTypeCode;
  label: string;
  months: number[]; // 12 items (1..12)
  yearTotalExact: number;
  yearTotalRounded: number;
  monthlySumCheck: boolean; // Σ months == yearTotalExact
}

export interface MonthlySummaryResult {
  distributionValidation: {
    sem2Sum: number;
    sem1Sum: number;
    sem2Valid: boolean;
    sem1Valid: boolean;
  };
  grossByType: Record<RevenueTypeCode, MonthlyMatrixRow>;
  deductionByType: Record<RevenueTypeCode, MonthlyMatrixRow>;
  libraryRefundMonthly: number[]; // 12 months
  libraryRefundYear: number;
  netByType: Record<RevenueTypeCode, MonthlyMatrixRow>;
  monthlyGrossTotals: number[]; // 12 months
  monthlyDeductionTotals: number[]; // 12 months
  monthlyNetTotalsExact: number[]; // 12 months
  monthlyNetTotalsRounded: number[]; // 12 months (each month truncated to thousands like Excel B28:M28)
  cumulativeNetExact: number[]; // 12 months true cumulative sum
  cumulativeNetRounded: number[]; // 12 months cumulative sum
  grandTotals: {
    grossExact: number;
    grossRounded: number;
    deductionExact: number;
    deductionRounded: number;
    libraryRefund: number;
    netExact: number;
    netRounded: number;
    sumOfMonthlyNetRounded: number; // 48,065,000 in Excel
    roundingDifference: number; // 48,067,000 - 48,065,000 = 2,000
  };
}
