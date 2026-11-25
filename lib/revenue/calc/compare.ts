import Decimal from 'decimal.js';
import { toDecimal } from './rounding';
import { DecimalValue, RevenueTypeCode } from './types';

export type ComparisonBasis = 'net' | 'gross';

export type TargetStatus = 'HIT' | 'NEAR' | 'MISS' | 'NO_ESTIMATE';

export interface CompareMonthlySeries {
  revenueType: RevenueTypeCode;
  label: string;
  monthlyEstimate: number[]; // 12 months
  monthlyActual: number[]; // 12 months
  annualEstimate: number;
}

export interface CompareCalculationInput {
  basis: ComparisonBasis;
  asOfMonthSeq: number; // 1..12
  seriesByType: Record<RevenueTypeCode, CompareMonthlySeries>;
  statusHitThreshold?: DecimalValue; // default 1.00 (100%)
  statusNearThreshold?: DecimalValue; // default 0.90 (90%)
}

export interface CompareTypeResult {
  revenueType: RevenueTypeCode;
  label: string;
  annualEstimate: number;
  cumulativeEstimate: number; // Σ estimate[1..m]
  cumulativeActual: number; // Σ actual[1..m]
  difference: number; // actual - estimate
  achievementPct: number | null; // actual / estimate
  status: TargetStatus;
  statusLabelTh: string;
  monthlyEstimate: number[];
  monthlyActual: number[];
}

export interface CompareSummaryResult {
  basis: ComparisonBasis;
  asOfMonthSeq: number;
  byType: Record<RevenueTypeCode, CompareTypeResult>;
  totals: {
    annualEstimate: number;
    cumulativeEstimate: number;
    cumulativeActual: number;
    difference: number;
    achievementPct: number | null;
    status: TargetStatus;
    statusLabelTh: string;
  };
}

export function calculateCompare(input: CompareCalculationInput): CompareSummaryResult {
  const m = Math.max(1, Math.min(12, input.asOfMonthSeq));
  const hitThresh = toDecimal(input.statusHitThreshold ?? 1.0);
  const nearThresh = toDecimal(input.statusNearThreshold ?? 0.9);

  const byType: Record<RevenueTypeCode, CompareTypeResult> = {} as any;

  let totalAnnualEst = new Decimal(0);
  let totalCumEst = new Decimal(0);
  let totalCumAct = new Decimal(0);

  const revTypes: RevenueTypeCode[] = [
    'TUITION',
    'ACAD_SERVICE',
    'RESEARCH_OH',
    'RENT',
    'CARRYOVER',
    'OTHER',
  ];

  for (const rt of revTypes) {
    const s = input.seriesByType[rt] ?? {
      revenueType: rt,
      label: rt,
      monthlyEstimate: Array.from({ length: 12 }, () => 0),
      monthlyActual: Array.from({ length: 12 }, () => 0),
      annualEstimate: 0,
    };

    let cumEst = new Decimal(0);
    let cumAct = new Decimal(0);

    for (let i = 0; i < m; i++) {
      cumEst = cumEst.plus(toDecimal(s.monthlyEstimate[i] ?? 0));
      cumAct = cumAct.plus(toDecimal(s.monthlyActual[i] ?? 0));
    }

    const diff = cumAct.minus(cumEst);
    let pct: number | null = null;
    let status: TargetStatus = 'NO_ESTIMATE';
    let statusLabelTh = '-';

    if (cumEst.gt(0)) {
      const ratio = cumAct.div(cumEst);
      pct = ratio.toNumber();

      if (ratio.gte(hitThresh)) {
        status = 'HIT';
        statusLabelTh = 'ถึงเป้าหมาย (≥ 100%)';
      } else if (ratio.gte(nearThresh)) {
        status = 'NEAR';
        statusLabelTh = 'ใกล้เป้าหมาย (90%–99%)';
      } else {
        status = 'MISS';
        statusLabelTh = 'ต่ำกว่าเป้าหมาย (< 90%)';
      }
    } else if (cumAct.gt(0)) {
      status = 'HIT';
      statusLabelTh = 'เกินเป้าหมาย (ไม่มีประมาณการ)';
    }

    const annEst = toDecimal(s.annualEstimate);
    totalAnnualEst = totalAnnualEst.plus(annEst);
    totalCumEst = totalCumEst.plus(cumEst);
    totalCumAct = totalCumAct.plus(cumAct);

    byType[rt] = {
      revenueType: rt,
      label: s.label,
      annualEstimate: annEst.toNumber(),
      cumulativeEstimate: cumEst.toNumber(),
      cumulativeActual: cumAct.toNumber(),
      difference: diff.toNumber(),
      achievementPct: pct,
      status,
      statusLabelTh,
      monthlyEstimate: s.monthlyEstimate,
      monthlyActual: s.monthlyActual,
    };
  }

  const grandDiff = totalCumAct.minus(totalCumEst);
  let grandPct: number | null = null;
  let grandStatus: TargetStatus = 'NO_ESTIMATE';
  let grandLabelTh = '-';

  if (totalCumEst.gt(0)) {
    const ratio = totalCumAct.div(totalCumEst);
    grandPct = ratio.toNumber();
    if (ratio.gte(hitThresh)) {
      grandStatus = 'HIT';
      grandLabelTh = 'ถึงเป้าหมาย (≥ 100%)';
    } else if (ratio.gte(nearThresh)) {
      grandStatus = 'NEAR';
      grandLabelTh = 'ใกล้เป้าหมาย (90%–99%)';
    } else {
      grandStatus = 'MISS';
      grandLabelTh = 'ต่ำกว่าเป้าหมาย (< 90%)';
    }
  }

  return {
    basis: input.basis,
    asOfMonthSeq: m,
    byType,
    totals: {
      annualEstimate: totalAnnualEst.toNumber(),
      cumulativeEstimate: totalCumEst.toNumber(),
      cumulativeActual: totalCumAct.toNumber(),
      difference: grandDiff.toNumber(),
      achievementPct: grandPct,
      status: grandStatus,
      statusLabelTh: grandLabelTh,
    },
  };
}
