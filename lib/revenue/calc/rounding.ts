import Decimal from 'decimal.js';
import { DecimalValue, RoundingModeCode, RoundingRuleConfig } from './types';

export function toDecimal(val: DecimalValue | null | undefined, defaultVal = 0): Decimal {
  if (val === null || val === undefined) return new Decimal(defaultVal);
  if (val instanceof Decimal) return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return new Decimal(defaultVal);
    return new Decimal(val);
  }
  const str = String(val).replace(/,/g, '').trim();
  if (str === '') return new Decimal(defaultVal);
  return new Decimal(str);
}

/**
 * Applies rounding rule to a Decimal or numeric value according to mode and digits.
 * digits:
 *   -3 = thousands (e.g. 39,981,600 -> 39,981,000)
 *   -2 = hundreds (e.g. 2,886,660 -> 2,886,600)
 *    0 = integer (1)
 *    2 = two decimals (0.01)
 */
export function applyRounding(val: DecimalValue, mode: RoundingModeCode, digits: number): Decimal {
  const d = toDecimal(val);
  if (mode === 'none') {
    return d;
  }

  // Factor = 10^(-digits). For digits = -3, factor = 10^3 = 1000.
  const factor = new Decimal(10).pow(-digits);

  switch (mode) {
    case 'trunc':
      // Truncate towards zero (like Excel TRUNC)
      return d.div(factor).trunc().mul(factor);

    case 'floor':
      // Round towards negative infinity (like Excel FLOOR / Math.floor)
      return d.div(factor).floor().mul(factor);

    case 'round':
      // Standard half-up rounding (like Excel ROUND)
      return d.div(factor).round().mul(factor);

    default:
      return d;
  }
}

export function applyRoundingRule(val: DecimalValue, rule?: RoundingRuleConfig | null): Decimal {
  if (!rule || rule.mode === 'none') {
    return toDecimal(val);
  }
  return applyRounding(val, rule.mode, rule.digits);
}

export function roundToNumber(val: DecimalValue, mode: RoundingModeCode, digits: number): number {
  return applyRounding(val, mode, digits).toNumber();
}
