import { describe, it, expect } from 'vitest';
import {
  formatINR,
  round2,
  toPaise,
  toRupees,
  calculateLineAmount,
  calculateTimeAndOvertime,
  computeFinancialSummary,
  calculatePercentageDeduction,
} from '../src/lib/calculations';
import {
  getWeekBounds,
  getNextWeek,
  getPreviousWeek,
  formatDateDisplay,
  parseDisplayDateToISO,
} from '../src/lib/dateUtils';

describe('1. Saturday-Friday Week Management & Timezone Boundaries', () => {
  it('identifies Saturday as the start of a reporting week', () => {
    const bounds = getWeekBounds('2026-10-17');
    expect(bounds.startDate).toBe('2026-10-17');
    expect(bounds.endDate).toBe('2026-10-23');
    expect(bounds.displayRange).toBe('17/10/2026–23/10/2026');
    expect(bounds.days).toHaveLength(7);
    expect(bounds.days[0]).toBe('2026-10-17');
    expect(bounds.days[6]).toBe('2026-10-23');
  });

  it('correctly assigns a Sunday date to the preceding Saturday week', () => {
    const bounds = getWeekBounds('2026-10-18');
    expect(bounds.startDate).toBe('2026-10-17');
    expect(bounds.endDate).toBe('2026-10-23');
  });

  it('correctly handles week boundary across month transitions', () => {
    const bounds = getWeekBounds('2026-09-26');
    expect(bounds.startDate).toBe('2026-09-26');
    expect(bounds.endDate).toBe('2026-10-02');
    expect(bounds.displayRange).toBe('26/09/2026–02/10/2026');

    const oct1Bounds = getWeekBounds('2026-10-01');
    expect(oct1Bounds.startDate).toBe('2026-09-26');
    expect(oct1Bounds.endDate).toBe('2026-10-02');
  });

  it('navigates sequentially to previous and next weeks', () => {
    const current = getWeekBounds('2026-10-17');
    const next = getNextWeek(current.startDate);
    expect(next.startDate).toBe('2026-10-24');
    expect(next.endDate).toBe('2026-10-30');

    const prev = getPreviousWeek(current.startDate);
    expect(prev.startDate).toBe('2026-10-10');
    expect(prev.endDate).toBe('2026-10-16');
  });

  it('formats dates consistently as DD/MM/YYYY and parses accurately', () => {
    expect(formatDateDisplay('2026-10-27')).toBe('27/10/2026');
    expect(parseDisplayDateToISO('27/10/2026')).toBe('2026-10-27');
  });
});

describe('2. Financial Calculations & Specification Reference Cases', () => {
  it('Example 1: Painter calculation: 33 × ₹950 = ₹31,350', () => {
    const res = calculateLineAmount({
      countOrQuantity: 33,
      rate: 950,
      rateType: 'daily',
    });
    expect(res.calculatedAmount).toBe(31350);
    expect(res.finalAmount).toBe(31350);
    expect(res.isOverridden).toBe(false);
  });

  it('Example 2: Heeralal / Lumia Building: 59 × ₹1,400 = ₹82,600 and 35 × ₹1,000 = ₹35,000, Total = ₹1,17,600', () => {
    const masons = calculateLineAmount({ countOrQuantity: 59, rate: 1400, rateType: 'daily' });
    const helpers = calculateLineAmount({ countOrQuantity: 35, rate: 1000, rateType: 'daily' });

    expect(masons.finalAmount).toBe(82600);
    expect(helpers.finalAmount).toBe(35000);

    const summary = computeFinancialSummary({
      labourAmounts: [masons.finalAmount, helpers.finalAmount],
    });

    expect(summary.labourSubtotal).toBe(117600);
    expect(summary.grossAmount).toBe(117600);
    expect(summary.finalPayable).toBe(117600);
  });

  it('Example 3: Museum Cleaning: Labour ₹15,600 + auto charge ₹2,400 = ₹18,000', () => {
    const summary = computeFinancialSummary({
      labourAmounts: [15600],
      additionalChargeAmounts: [2400],
    });
    expect(summary.labourSubtotal).toBe(15600);
    expect(summary.additionalChargesSubtotal).toBe(2400);
    expect(summary.grossAmount).toBe(18000);
    expect(summary.finalPayable).toBe(18000);
  });

  it('Example 4: Anburaj Painter: Gross ₹17,100, 6.25% deduction = ₹1,068.75, Payable = ₹16,031.25', () => {
    const gross = 17100;
    const deduction = calculatePercentageDeduction(gross, 6.25);
    expect(deduction).toBe(1068.75);

    const summary = computeFinancialSummary({
      labourAmounts: [gross],
      deductions: [deduction],
    });
    expect(summary.grossAmount).toBe(17100);
    expect(summary.deductionsSubtotal).toBe(1068.75);
    expect(summary.finalPayable).toBe(16031.25);
  });

  it('Example 5: Pankaj supplier bill: Gross ₹2,84,800 - Advance ₹2,10,000 = Balance ₹74,800', () => {
    const gross = 284800;
    const advance = 210000;
    const net = round2(gross - advance);
    expect(net).toBe(74800);
  });

  it('correctly handles zero counts producing zero labour amounts while remaining valid', () => {
    const res = calculateLineAmount({ countOrQuantity: 0, rate: 1400, rateType: 'daily' });
    expect(res.calculatedAmount).toBe(0);
    expect(res.finalAmount).toBe(0);
  });

  it('accurately preserves manual staff overrides and records difference', () => {
    const res = calculateLineAmount(
      { countOrQuantity: 10, rate: 1000, rateType: 'daily' },
      { finalAmount: 10500, reason: 'Approved bonus for urgent evening concrete pour' }
    );
    expect(res.calculatedAmount).toBe(10000);
    expect(res.finalAmount).toBe(10500);
    expect(res.isOverridden).toBe(true);
    expect(res.overrideDifference).toBe(500);
  });

  it('formats INR numbers using Indian grouping and ₹ symbol', () => {
    expect(formatINR(117600)).toBe('₹1,17,600.00');
    expect(formatINR(31350)).toBe('₹31,350.00');
    expect(formatINR(1068.75)).toBe('₹1,068.75');
    expect(formatINR(0)).toBe('₹0.00');
    expect(formatINR(-500)).toBe('-₹500.00');
  });

  it('uses safe integer paise conversion without floating point drift', () => {
    expect(toPaise(1068.75)).toBe(106875);
    expect(toRupees(106875)).toBe(1068.75);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('3. Time, Overtime & Late-Coming Rules', () => {
  it('calculates overtime correctly when net working hours exceed 8 hours standard', () => {
    const timeRes = calculateTimeAndOvertime('08:30', '19:30');
    expect(timeRes.regularHours).toBe(8);
    expect(timeRes.overtimeHours).toBe(2);
    expect(timeRes.overtimeAmount).toBe(300);
    expect(timeRes.isLate).toBe(false);
  });

  it('flags late coming when arrival exceeds standard start time plus grace period', () => {
    const timeRes = calculateTimeAndOvertime('09:15', '17:30');
    expect(timeRes.isLate).toBe(true);
    expect(timeRes.lateMinutes).toBe(45);
  });
});

describe('4. Deductions, Advances & Reconciled Totals', () => {
  it('deducts advance payments exactly once and prevents double deductions', () => {
    const summary = computeFinancialSummary({
      labourAmounts: [10000],
      advancesApplied: [2000],
    });
    expect(summary.finalPayable).toBe(8000);
    expect(summary.advancesAppliedSubtotal).toBe(2000);
  });

  it('reconciles consolidated grand totals with sum of individual team summaries', () => {
    const team1 = computeFinancialSummary({ labourAmounts: [24500] });
    const team2 = computeFinancialSummary({ labourAmounts: [33300] });

    const combined = computeFinancialSummary({
      labourAmounts: [team1.labourSubtotal, team2.labourSubtotal],
    });

    expect(combined.grossAmount).toBe(57800);
    expect(combined.finalPayable).toBe(57800);
    expect(team1.labourSubtotal + team2.labourSubtotal).toBe(combined.grossAmount);
  });
});
