import Decimal from 'decimal.js';
import { applyRounding, applyRoundingRule, toDecimal } from './rounding';
import {
  ResearchCalculationParams,
  ResearchProjectCalcResult,
  ResearchProjectInput,
  ResearchSummaryResult,
} from './types';

export function calculateResearchProject(
  project: ResearchProjectInput,
  params: ResearchCalculationParams
): ResearchProjectCalcResult {
  const budget = toDecimal(project.budget);
  const effectiveRate =
    project.overheadRateOverride !== null && project.overheadRateOverride !== undefined
      ? toDecimal(project.overheadRateOverride)
      : toDecimal(params.ohDefaultRate);

  const rawOverhead = budget.mul(effectiveRate);
  // Round line overhead to thousands (-3) like Excel ROUND(E*F, -3)
  const lineRounding = params.lineRounding ?? {
    scope: 'RESEARCH_OH_LINE',
    mode: 'round',
    digits: -3,
  };
  const grossOverhead = applyRoundingRule(rawOverhead, lineRounding);

  const centralPct = toDecimal(params.ohCentralPct);
  const centralDeduction = grossOverhead.mul(centralPct);

  const netOverhead = applyRoundingRule(grossOverhead.minus(centralDeduction), lineRounding);

  return {
    id: project.id,
    name: project.name,
    funder: project.funder ?? null,
    piName: project.piName ?? null,
    budget: budget.toNumber(),
    effectiveRate: effectiveRate.toNumber(),
    overheadRateOverride:
      project.overheadRateOverride !== null && project.overheadRateOverride !== undefined
        ? toDecimal(project.overheadRateOverride).toNumber()
        : null,
    monthSeq: project.monthSeq,
    note: project.note ?? null,
    grossOverhead: grossOverhead.toNumber(),
    centralDeduction: centralDeduction.toNumber(),
    netOverhead: netOverhead.toNumber(),
  };
}

export function calculateResearch(
  projects: ResearchProjectInput[],
  params: ResearchCalculationParams
): ResearchSummaryResult {
  const calculatedLines = projects.map((p) => calculateResearchProject(p, params));

  let budgetSum = new Decimal(0);
  let grossOHSum = new Decimal(0);
  let centralSum = new Decimal(0);
  let netExact = new Decimal(0);

  for (const line of calculatedLines) {
    budgetSum = budgetSum.plus(line.budget);
    grossOHSum = grossOHSum.plus(line.grossOverhead);
    centralSum = centralSum.plus(line.centralDeduction);
    netExact = netExact.plus(line.netOverhead);
  }

  const yearRounding = params.yearTotalRounding ?? {
    scope: 'RESEARCH_OH_YEAR_TOTAL',
    mode: 'trunc',
    digits: -3,
  };
  const netRounded = applyRoundingRule(netExact, yearRounding);

  return {
    lines: calculatedLines,
    totals: {
      budget: budgetSum.toNumber(),
      grossOverhead: grossOHSum.toNumber(),
      centralDeduction: centralSum.toNumber(),
      netExact: netExact.toNumber(),
      netRounded: netRounded.toNumber(),
    },
  };
}
