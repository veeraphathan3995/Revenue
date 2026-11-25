import Decimal from 'decimal.js';
import { applyRounding, applyRoundingRule, toDecimal } from './rounding';
import {
  AllocationDimensionCode,
  DecimalValue,
  RevenueTypeCode,
  RoundingRuleConfig,
} from './types';

export interface AllocationItemDefinition {
  id: string;
  name: string;
  sortOrder: number;
}

export interface AllocationPercentageRow {
  itemId: string;
  itemName: string;
  sortOrder: number;
  percentages: Record<RevenueTypeCode, DecimalValue>; // 0..1
}

export interface AllocationBaseAmounts {
  TUITION: DecimalValue;
  ACAD_SERVICE: DecimalValue;
  RESEARCH_OH: DecimalValue;
  RENT: DecimalValue;
  CARRYOVER: DecimalValue;
  OTHER?: DecimalValue;
}

export interface AllocationDimensionInput {
  dimensionCode: AllocationDimensionCode;
  dimensionName: string;
  items: AllocationPercentageRow[];
  roundingRule?: RoundingRuleConfig;
  historicalUsage?: Record<string, Record<number, number | null>>; // itemId -> year -> amount
}

export interface AllocationDimensionResultItem {
  itemId: string;
  itemName: string;
  sortOrder: number;
  amounts: Record<RevenueTypeCode, number>;
  totalAmount: number;
  weightedPct: number; // itemTotal / totalAllocation (0..1)
  historicalUsage?: Record<number, number | null>;
  historicalAverage?: number | null;
}

export interface AllocationDimensionResult {
  dimensionCode: AllocationDimensionCode;
  dimensionName: string;
  items: AllocationDimensionResultItem[];
  columnSums: Record<RevenueTypeCode, { amount: number; pct: number }>;
  columnValidation: Record<RevenueTypeCode, { sumPct: number; isValid: boolean }>;
  allColumnsValid: boolean;
  totalAllocated: number;
  differenceFromBase: number;
  isFullyAllocated: boolean;
}

export interface AllocationSummaryResult {
  baseAmounts: Record<RevenueTypeCode, number>;
  totalBase: number;
  dimensions: Record<AllocationDimensionCode, AllocationDimensionResult>;
  allDimensionsValid: boolean;
}

export function calculateAllocationDimension(
  dimension: AllocationDimensionInput,
  baseAmounts: AllocationBaseAmounts
): AllocationDimensionResult {
  const revTypes: RevenueTypeCode[] = [
    'TUITION',
    'ACAD_SERVICE',
    'RESEARCH_OH',
    'RENT',
    'CARRYOVER',
  ];
  if (baseAmounts.OTHER !== undefined) {
    revTypes.push('OTHER');
  }

  // Base Decimals
  const bases: Record<RevenueTypeCode, Decimal> = {
    TUITION: toDecimal(baseAmounts.TUITION),
    ACAD_SERVICE: toDecimal(baseAmounts.ACAD_SERVICE),
    RESEARCH_OH: toDecimal(baseAmounts.RESEARCH_OH),
    RENT: toDecimal(baseAmounts.RENT),
    CARRYOVER: toDecimal(baseAmounts.CARRYOVER),
    OTHER: toDecimal(baseAmounts.OTHER ?? 0),
  };

  const colSumPcts: Record<RevenueTypeCode, Decimal> = {
    TUITION: new Decimal(0),
    ACAD_SERVICE: new Decimal(0),
    RESEARCH_OH: new Decimal(0),
    RENT: new Decimal(0),
    CARRYOVER: new Decimal(0),
    OTHER: new Decimal(0),
  };

  const colSumAmounts: Record<RevenueTypeCode, Decimal> = {
    TUITION: new Decimal(0),
    ACAD_SERVICE: new Decimal(0),
    RESEARCH_OH: new Decimal(0),
    RENT: new Decimal(0),
    CARRYOVER: new Decimal(0),
    OTHER: new Decimal(0),
  };

  const resultItems: AllocationDimensionResultItem[] = [];

  for (const item of dimension.items) {
    const itemAmounts: Record<RevenueTypeCode, number> = {
      TUITION: 0,
      ACAD_SERVICE: 0,
      RESEARCH_OH: 0,
      RENT: 0,
      CARRYOVER: 0,
      OTHER: 0,
    };
    let rowSum = new Decimal(0);

    for (const rt of revTypes) {
      const pct = toDecimal(item.percentages[rt] ?? 0);
      colSumPcts[rt] = colSumPcts[rt].plus(pct);

      let amt = bases[rt].mul(pct);
      if (dimension.roundingRule && dimension.roundingRule.mode !== 'none') {
        amt = applyRoundingRule(amt, dimension.roundingRule);
      }

      itemAmounts[rt] = amt.toNumber();
      rowSum = rowSum.plus(amt);
      colSumAmounts[rt] = colSumAmounts[rt].plus(amt);
    }

    // Historical usage if provided
    let histUsage: Record<number, number | null> | undefined;
    let histAvg: number | null = null;
    if (dimension.historicalUsage && dimension.historicalUsage[item.itemId]) {
      histUsage = dimension.historicalUsage[item.itemId];
      const validVals = Object.values(histUsage).filter(
        (v): v is number => v !== null && v !== undefined
      );
      if (validVals.length > 0) {
        const sum = validVals.reduce((acc, v) => acc + v, 0);
        histAvg = sum / validVals.length;
      }
    }

    resultItems.push({
      itemId: item.itemId,
      itemName: item.itemName,
      sortOrder: item.sortOrder,
      amounts: itemAmounts,
      totalAmount: rowSum.toNumber(),
      weightedPct: 0, // calculated below after total is known
      historicalUsage: histUsage,
      historicalAverage: histAvg,
    });
  }

  const totalAllocated = resultItems.reduce((acc, r) => acc + r.totalAmount, 0);
  const totalBase = revTypes.reduce((acc, rt) => acc.plus(bases[rt]), new Decimal(0)).toNumber();

  // Calculate weighted percentages (itemTotal / totalAllocated)
  for (const item of resultItems) {
    item.weightedPct = totalAllocated > 0 ? item.totalAmount / totalAllocated : 0;
  }

  const columnSums: Record<RevenueTypeCode, { amount: number; pct: number }> = {
    TUITION: { amount: colSumAmounts.TUITION.toNumber(), pct: colSumPcts.TUITION.toNumber() },
    ACAD_SERVICE: { amount: colSumAmounts.ACAD_SERVICE.toNumber(), pct: colSumPcts.ACAD_SERVICE.toNumber() },
    RESEARCH_OH: { amount: colSumAmounts.RESEARCH_OH.toNumber(), pct: colSumPcts.RESEARCH_OH.toNumber() },
    RENT: { amount: colSumAmounts.RENT.toNumber(), pct: colSumPcts.RENT.toNumber() },
    CARRYOVER: { amount: colSumAmounts.CARRYOVER.toNumber(), pct: colSumPcts.CARRYOVER.toNumber() },
    OTHER: { amount: colSumAmounts.OTHER.toNumber(), pct: colSumPcts.OTHER.toNumber() },
  };

  const columnValidation: Record<RevenueTypeCode, { sumPct: number; isValid: boolean }> = {
    TUITION: {
      sumPct: colSumPcts.TUITION.toNumber(),
      isValid: colSumPcts.TUITION.minus(1).abs().lte(0.0001),
    },
    ACAD_SERVICE: {
      sumPct: colSumPcts.ACAD_SERVICE.toNumber(),
      isValid: colSumPcts.ACAD_SERVICE.minus(1).abs().lte(0.0001),
    },
    RESEARCH_OH: {
      sumPct: colSumPcts.RESEARCH_OH.toNumber(),
      isValid: colSumPcts.RESEARCH_OH.minus(1).abs().lte(0.0001),
    },
    RENT: {
      sumPct: colSumPcts.RENT.toNumber(),
      isValid: colSumPcts.RENT.minus(1).abs().lte(0.0001),
    },
    CARRYOVER: {
      sumPct: colSumPcts.CARRYOVER.toNumber(),
      isValid: colSumPcts.CARRYOVER.minus(1).abs().lte(0.0001),
    },
    OTHER: {
      sumPct: colSumPcts.OTHER.toNumber(),
      isValid: colSumPcts.OTHER.minus(1).abs().lte(0.0001) || colSumPcts.OTHER.isZero(),
    },
  };

  const allColumnsValid = revTypes.every((rt) => columnValidation[rt].isValid);
  const differenceFromBase = Math.abs(totalAllocated - totalBase);
  const isFullyAllocated = differenceFromBase < 1;

  return {
    dimensionCode: dimension.dimensionCode,
    dimensionName: dimension.dimensionName,
    items: resultItems,
    columnSums,
    columnValidation,
    allColumnsValid,
    totalAllocated,
    differenceFromBase,
    isFullyAllocated,
  };
}

export function calculateAllocation(
  dimensions: AllocationDimensionInput[],
  baseAmounts: AllocationBaseAmounts
): AllocationSummaryResult {
  const revTypes: RevenueTypeCode[] = [
    'TUITION',
    'ACAD_SERVICE',
    'RESEARCH_OH',
    'RENT',
    'CARRYOVER',
  ];
  if (baseAmounts.OTHER !== undefined) {
    revTypes.push('OTHER');
  }

  const bases: Record<RevenueTypeCode, number> = {
    TUITION: toDecimal(baseAmounts.TUITION).toNumber(),
    ACAD_SERVICE: toDecimal(baseAmounts.ACAD_SERVICE).toNumber(),
    RESEARCH_OH: toDecimal(baseAmounts.RESEARCH_OH).toNumber(),
    RENT: toDecimal(baseAmounts.RENT).toNumber(),
    CARRYOVER: toDecimal(baseAmounts.CARRYOVER).toNumber(),
    OTHER: toDecimal(baseAmounts.OTHER ?? 0).toNumber(),
  };

  const totalBase = revTypes.reduce((acc, rt) => acc + bases[rt], 0);

  const dimensionResults: Record<AllocationDimensionCode, AllocationDimensionResult> = {
    plan: {} as any,
    expense_category: {} as any,
    strategic: {} as any,
  };

  let allDimensionsValid = true;

  for (const dim of dimensions) {
    const res = calculateAllocationDimension(dim, baseAmounts);
    dimensionResults[dim.dimensionCode] = res;
    if (!res.allColumnsValid || !res.isFullyAllocated) {
      allDimensionsValid = false;
    }
  }

  return {
    baseAmounts: bases,
    totalBase,
    dimensions: dimensionResults,
    allDimensionsValid,
  };
}
