/**
 * Centralized Financial and Attendance Calculation Engine.
 *
 * Enforces decimal-safe precision (using integer paise / exact rounding),
 * historical override preservation, and Indian currency formatting (INR ₹).
 */

export function formatINR(amount: number | null | undefined, includeSymbol = true): string {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return includeSymbol ? '₹0.00' : '0.00';
  }
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  
  // Round to 2 decimal places
  const rounded = (Math.round(absAmount * 100) / 100).toFixed(2);
  const [integerPart, decimalPart] = rounded.split('.');

  // Indian numbering grouping: last 3 digits, then groups of 2
  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;
  const sign = isNegative ? '-' : '';
  const prefix = includeSymbol ? '₹' : '';

  return `${sign}${prefix}${formattedInteger}.${decimalPart}`;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function toPaise(rupees: number): number {
  return Math.round((rupees + Number.EPSILON) * 100);
}

export function toRupees(paise: number): number {
  return round2(paise / 100);
}

export type RateType = 'daily' | 'hourly' | 'unit' | 'fixed' | 'manual';

export interface CalculationLineInput {
  countOrQuantity: number;
  rate: number;
  rateType: RateType;
  manualAmount?: number;
  hoursWorked?: number;
}

export interface CalculationLineResult {
  calculatedAmount: number;
  finalAmount: number;
  isOverridden: boolean;
  overrideDifference: number;
}

export function calculateLineAmount(
  input: CalculationLineInput,
  manualOverride?: { finalAmount: number; reason?: string }
): CalculationLineResult {
  const { countOrQuantity, rate, rateType, hoursWorked } = input;
  let calculated = 0;

  switch (rateType) {
    case 'daily':
    case 'unit':
      calculated = round2(countOrQuantity * rate);
      break;
    case 'hourly':
      calculated = round2((hoursWorked ?? countOrQuantity) * rate);
      break;
    case 'fixed':
      calculated = round2(rate);
      break;
    case 'manual':
      calculated = round2(input.manualAmount ?? 0);
      break;
    default:
      calculated = round2(countOrQuantity * rate);
  }

  if (manualOverride && typeof manualOverride.finalAmount === 'number' && !isNaN(manualOverride.finalAmount)) {
    const final = round2(manualOverride.finalAmount);
    return {
      calculatedAmount: calculated,
      finalAmount: final,
      isOverridden: true,
      overrideDifference: round2(final - calculated),
    };
  }

  return {
    calculatedAmount: calculated,
    finalAmount: calculated,
    isOverridden: false,
    overrideDifference: 0,
  };
}

export interface TimeRuleConfig {
  standardStartTime: string;
  standardEndTime: string;
  standardHours: number;
  unpaidBreakMinutes: number;
  graceMinutes: number;
  overtimeRatePerHour: number;
  minimumBillableOtMinutes: number;
}

export const DEFAULT_TIME_RULES: TimeRuleConfig = {
  standardStartTime: '08:30',
  standardEndTime: '17:30',
  standardHours: 8,
  unpaidBreakMinutes: 60,
  graceMinutes: 15,
  overtimeRatePerHour: 150,
  minimumBillableOtMinutes: 30,
};

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || !timeStr.includes(':')) return null;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function calculateTimeAndOvertime(
  inTimeStr: string | null | undefined,
  outTimeStr: string | null | undefined,
  rules: TimeRuleConfig = DEFAULT_TIME_RULES,
  customOtRate?: number
): {
  totalMinutes: number;
  netWorkMinutes: number;
  regularHours: number;
  overtimeHours: number;
  overtimeAmount: number;
  isLate: boolean;
  lateMinutes: number;
} {
  if (!inTimeStr || !outTimeStr) {
    return {
      totalMinutes: 0,
      netWorkMinutes: 0,
      regularHours: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      isLate: false,
      lateMinutes: 0,
    };
  }

  const inMinutes = parseTimeToMinutes(inTimeStr);
  const outMinutes = parseTimeToMinutes(outTimeStr);

  if (inMinutes === null || outMinutes === null) {
    return {
      totalMinutes: 0,
      netWorkMinutes: 0,
      regularHours: 0,
      overtimeHours: 0,
      overtimeAmount: 0,
      isLate: false,
      lateMinutes: 0,
    };
  }

  const totalSpan = outMinutes >= inMinutes ? outMinutes - inMinutes : (24 * 60 - inMinutes) + outMinutes;
  const netMinutes = Math.max(0, totalSpan - rules.unpaidBreakMinutes);
  const netHours = netMinutes / 60;

  const regularHours = Math.min(rules.standardHours, round2(netHours));
  
  const standardWorkMinutes = rules.standardHours * 60;
  let otMinutes = Math.max(0, netMinutes - standardWorkMinutes);
  if (otMinutes < rules.minimumBillableOtMinutes) {
    otMinutes = 0;
  }
  const overtimeHours = round2(otMinutes / 60);

  const otRate = customOtRate ?? rules.overtimeRatePerHour;
  const overtimeAmount = round2(overtimeHours * otRate);

  const stdStartMinutes = parseTimeToMinutes(rules.standardStartTime) ?? 8 * 60 + 30;
  const lateMinutes = inMinutes > stdStartMinutes + rules.graceMinutes ? inMinutes - stdStartMinutes : 0;

  return {
    totalMinutes: totalSpan,
    netWorkMinutes: netMinutes,
    regularHours,
    overtimeHours,
    overtimeAmount,
    isLate: lateMinutes > 0,
    lateMinutes,
  };
}

export interface TeamFinancialSummary {
  labourSubtotal: number;
  overtimeSubtotal: number;
  additionalChargesSubtotal: number;
  grossAmount: number;
  creditsSubtotal: number;
  deductionsSubtotal: number;
  advancesAppliedSubtotal: number;
  finalPayable: number;
}

export function computeFinancialSummary(params: {
  labourAmounts: number[];
  overtimeAmounts?: number[];
  additionalChargeAmounts?: number[];
  credits?: number[];
  deductions?: number[];
  advancesApplied?: number[];
}): TeamFinancialSummary {
  let labourPaise = 0;
  for (const amt of params.labourAmounts) {
    labourPaise += toPaise(amt || 0);
  }

  let otPaise = 0;
  if (params.overtimeAmounts) {
    for (const amt of params.overtimeAmounts) {
      otPaise += toPaise(amt || 0);
    }
  }

  let chargesPaise = 0;
  if (params.additionalChargeAmounts) {
    for (const amt of params.additionalChargeAmounts) {
      chargesPaise += toPaise(amt || 0);
    }
  }

  const grossPaise = labourPaise + otPaise + chargesPaise;

  let creditsPaise = 0;
  if (params.credits) {
    for (const amt of params.credits) {
      creditsPaise += toPaise(amt || 0);
    }
  }

  let deductionsPaise = 0;
  if (params.deductions) {
    for (const amt of params.deductions) {
      deductionsPaise += toPaise(amt || 0);
    }
  }

  let advancesPaise = 0;
  if (params.advancesApplied) {
    for (const amt of params.advancesApplied) {
      advancesPaise += toPaise(amt || 0);
    }
  }

  const finalPaise = grossPaise + creditsPaise - deductionsPaise - advancesPaise;

  return {
    labourSubtotal: toRupees(labourPaise),
    overtimeSubtotal: toRupees(otPaise),
    additionalChargesSubtotal: toRupees(chargesPaise),
    grossAmount: toRupees(grossPaise),
    creditsSubtotal: toRupees(creditsPaise),
    deductionsSubtotal: toRupees(deductionsPaise),
    advancesAppliedSubtotal: toRupees(advancesPaise),
    finalPayable: toRupees(finalPaise),
  };
}

export function calculatePercentageDeduction(baseAmount: number, percentage: number): number {
  return round2(baseAmount * (percentage / 100));
}
