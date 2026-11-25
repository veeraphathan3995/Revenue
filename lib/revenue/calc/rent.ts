import Decimal from 'decimal.js';
import { applyRoundingRule, toDecimal } from './rounding';
import {
  RentalCalculationParams,
  RentalItemCalcResult,
  RentalItemInput,
  RentalSummaryResult,
} from './types';

export function calculateRentalItem(
  item: RentalItemInput,
  params: RentalCalculationParams
): RentalItemCalcResult {
  const monthlyRent = toDecimal(item.monthlyRent);
  const start = item.startMonthSeq;
  const end = item.endMonthSeq;

  let isValidMonthRange = true;
  let warning: string | null = null;
  let activeMonths = 0;

  if (start < 1 || start > 12 || end < 1 || end > 12) {
    isValidMonthRange = false;
    warning = 'ลำดับเดือนต้องอยู่ระหว่าง 1 ถึง 12';
  } else if (end < start) {
    isValidMonthRange = false;
    warning = 'เดือนสิ้นสุดต้องไม่ก่อนเดือนเริ่มต้น';
  } else {
    activeMonths = end - start + 1;
  }

  const rentDeductPct = toDecimal(params.rentDeductPct);
  const grossYear = monthlyRent.mul(activeMonths);
  const deductionYear = grossYear.mul(rentDeductPct);
  const netYear = grossYear.minus(deductionYear);

  const monthlyGross = Array.from({ length: 12 }, () => 0);
  const monthlyDeduction = Array.from({ length: 12 }, () => 0);
  const monthlyNet = Array.from({ length: 12 }, () => 0);

  if (isValidMonthRange && activeMonths > 0) {
    const monthlyDeduct = monthlyRent.mul(rentDeductPct);
    const monthlyNetVal = monthlyRent.minus(monthlyDeduct);

    for (let m = start; m <= end; m++) {
      const idx = m - 1;
      monthlyGross[idx] = monthlyRent.toNumber();
      monthlyDeduction[idx] = monthlyDeduct.toNumber();
      monthlyNet[idx] = monthlyNetVal.toNumber();
    }
  }

  const area = item.areaSqm !== null && item.areaSqm !== undefined ? toDecimal(item.areaSqm).toNumber() : null;

  return {
    id: item.id,
    name: item.name,
    tenant: item.tenant ?? null,
    areaSqm: area,
    monthlyRent: monthlyRent.toNumber(),
    startMonthSeq: start,
    endMonthSeq: end,
    activeMonths,
    isValidMonthRange,
    warning,
    grossYear: grossYear.toNumber(),
    deductionYear: deductionYear.toNumber(),
    netYear: netYear.toNumber(),
    monthlyGross,
    monthlyDeduction,
    monthlyNet,
    note: item.note ?? null,
  };
}

export function calculateRental(
  items: RentalItemInput[],
  params: RentalCalculationParams
): RentalSummaryResult {
  const calculatedLines = items.map((i) => calculateRentalItem(i, params));

  let monthlyRentSum = new Decimal(0);
  let grossSum = new Decimal(0);
  let deductSum = new Decimal(0);
  let netExact = new Decimal(0);

  for (const line of calculatedLines) {
    monthlyRentSum = monthlyRentSum.plus(line.monthlyRent);
    grossSum = grossSum.plus(line.grossYear);
    deductSum = deductSum.plus(line.deductionYear);
    netExact = netExact.plus(line.netYear);
  }

  const roundingRule = params.yearTotalRounding ?? {
    scope: 'RENT_YEAR_TOTAL',
    mode: 'floor',
    digits: -3,
  };
  const netRounded = applyRoundingRule(netExact, roundingRule);

  return {
    lines: calculatedLines,
    totals: {
      monthlyRentSum: monthlyRentSum.toNumber(),
      grossYear: grossSum.toNumber(),
      deductionYear: deductSum.toNumber(),
      netExact: netExact.toNumber(),
      netRounded: netRounded.toNumber(),
    },
  };
}
