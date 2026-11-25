import Decimal from 'decimal.js';
import { toDecimal } from './rounding';
import { DecimalValue } from './types';

export interface CarryoverTrackerInput {
  openingBalance: DecimalValue; // เงินเหลือจ่ายสะสมยกมา (ลงเดือนที่ 1)
  monthlyActualNetWithoutCarryover: DecimalValue[]; // 12 months actual net (excluding CARRYOVER type)
  monthlyExpenditure: (DecimalValue | null | undefined)[]; // 12 months expenditure
}

export interface CarryoverMonthStatus {
  monthSeq: number;
  actualNetInMonth: number;
  expenditureInMonth: number;
  cumulativeNetWithoutCarryover: number;
  cumulativeExpenditure: number;
  closingBalance: number;
  hasExpenditureRecorded: boolean;
}

export interface CarryoverTrackerResult {
  openingBalance: number;
  months: CarryoverMonthStatus[];
  totalActualNetWithoutCarryover: number;
  totalExpenditure: number;
  yearEndClosingBalance: number;
  closingToNetRatioPct: number | null; // closingBalance / totalActualNet
  hasAnyExpenditureRecorded: boolean;
  statusMessage: string;
}

export function calculateCarryoverTracker(input: CarryoverTrackerInput): CarryoverTrackerResult {
  const opening = toDecimal(input.openingBalance);

  let cumNet = new Decimal(0);
  let cumExp = new Decimal(0);
  let hasAnyExpenditure = false;

  const months: CarryoverMonthStatus[] = [];

  for (let m = 1; m <= 12; m++) {
    const idx = m - 1;
    const netMonth = toDecimal(input.monthlyActualNetWithoutCarryover[idx] ?? 0);
    cumNet = cumNet.plus(netMonth);

    const rawExp = input.monthlyExpenditure[idx];
    const hasExp = rawExp !== null && rawExp !== undefined && rawExp !== '';
    if (hasExp) hasAnyExpenditure = true;

    const expMonth = toDecimal(rawExp ?? 0);
    cumExp = cumExp.plus(expMonth);

    // closing[m] = opening + Σ(actual_net[1..m], ไม่นับประเภท CARRYOVER) - Σ(expenditure[1..m])
    const closing = opening.plus(cumNet).minus(cumExp);

    months.push({
      monthSeq: m,
      actualNetInMonth: netMonth.toNumber(),
      expenditureInMonth: expMonth.toNumber(),
      cumulativeNetWithoutCarryover: cumNet.toNumber(),
      cumulativeExpenditure: cumExp.toNumber(),
      closingBalance: closing.toNumber(),
      hasExpenditureRecorded: hasExp,
    });
  }

  const yearEndClosing = months[11].closingBalance;
  const closingToNetRatioPct = cumNet.gt(0)
    ? new Decimal(yearEndClosing).div(cumNet).mul(100).toNumber()
    : null;

  const statusMessage = hasAnyExpenditure
    ? '✓ มีรายจ่ายจริงกรอกแล้ว'
    : '⚠ ยังไม่ได้กรอกรายจ่ายจริง — ยอดคงเหลือเป็นเพียงยกมา + รับจริงเท่านั้น';

  return {
    openingBalance: opening.toNumber(),
    months,
    totalActualNetWithoutCarryover: cumNet.toNumber(),
    totalExpenditure: cumExp.toNumber(),
    yearEndClosingBalance: yearEndClosing,
    closingToNetRatioPct,
    hasAnyExpenditureRecorded: hasAnyExpenditure,
    statusMessage,
  };
}
