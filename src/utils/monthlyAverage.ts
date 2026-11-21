import { MonthlyBillRecord } from '../types/solar';

export const MAX_AVERAGE_MONTHS = 12;

export interface BillLikeRow {
  month?: string;
  unitsKwh: number;
  billAmountInr: number;
  isVerifiedPortalData?: boolean;
}

export interface Latest12MonthSummary<T extends BillLikeRow> {
  basisRows: T[];
  basisCount: number;
  totalUnits: number;
  totalBill: number;
  avgUnits: number;
  avgBill: number;
  effectiveRate: number;
  peakRow: T | undefined;
  startMonth: string;
  endMonth: string;
  verifiedCount: number;
  totalVerifiedInDataset: number;
}

/**
 * Selects up to the latest 12 billed months (in chronological order) for averaging.
 * - Prioritizes verified DISCOM portal rows with non-zero usage/bill so unbilled
 *   running months or unverified baseline slots never consume one of the 12 slots
 *   or dilute real consumption.
 * - When 13+ billed months exist (e.g. 13-month rolling fetch or 24-month YoY fetch),
 *   strictly takes only the latest 12 billed months.
 * - When fewer than 12 billed months exist, returns all available billed months so
 *   the average divides by the available count (up to 12).
 */
export function selectLatestBilledMonths<T extends BillLikeRow>(
  records: readonly T[] | undefined | null,
  maxMonths: number = MAX_AVERAGE_MONTHS
): T[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const cap = Math.max(1, Math.floor(maxMonths));

  const allVerified = records.filter((r) => Boolean(r.isVerifiedPortalData));
  const verifiedBilled = allVerified.filter(
    (r) => (Number(r.unitsKwh) || 0) > 0 || (Number(r.billAmountInr) || 0) > 0
  );
  const nonEmptyBilled = records.filter(
    (r) => (Number(r.unitsKwh) || 0) > 0 || (Number(r.billAmountInr) || 0) > 0
  );

  const pool =
    verifiedBilled.length > 0
      ? verifiedBilled
      : allVerified.length > 0
      ? allVerified
      : nonEmptyBilled.length > 0
      ? nonEmptyBilled
      : records;

  return pool.slice(-cap);
}

/**
 * Computes consistent 12-month-capped totals, monthly averages, blended tariff rate,
 * peak month, and window bounds from any monthly billing dataset (1..24+ months).
 */
export function computeLatest12MonthSummary<T extends BillLikeRow>(
  records: readonly T[] | undefined | null,
  fallbackRate: number = 0,
  maxMonths: number = MAX_AVERAGE_MONTHS
): Latest12MonthSummary<T> {
  const safeRecords = Array.isArray(records) ? records : [];
  const totalVerifiedInDataset = safeRecords.filter((r) => Boolean(r.isVerifiedPortalData)).length;
  const basisRows = selectLatestBilledMonths(safeRecords, maxMonths);
  const basisCount = basisRows.length;

  if (basisCount === 0) {
    return {
      basisRows: [],
      basisCount: 0,
      totalUnits: 0,
      totalBill: 0,
      avgUnits: 0,
      avgBill: 0,
      effectiveRate: fallbackRate,
      peakRow: undefined,
      startMonth: '',
      endMonth: '',
      verifiedCount: 0,
      totalVerifiedInDataset,
    };
  }

  const totalUnits = basisRows.reduce((acc, m) => acc + (Number(m.unitsKwh) || 0), 0);
  const totalBill = Number(
    basisRows.reduce((acc, m) => acc + (Number(m.billAmountInr) || 0), 0).toFixed(2)
  );
  const avgUnits = Math.max(0, Math.round(totalUnits / basisCount));
  const avgBill = Math.max(0, Math.round(totalBill / basisCount));
  const effectiveRate =
    totalUnits > 0 ? Number((totalBill / totalUnits).toFixed(2)) : fallbackRate;

  const peakRow = basisRows.reduce(
    (best, row) => ((Number(row.unitsKwh) || 0) > (Number(best.unitsKwh) || 0) ? row : best),
    basisRows[0]
  );

  const verifiedCount = basisRows.filter((r) => Boolean(r.isVerifiedPortalData)).length;

  return {
    basisRows,
    basisCount,
    totalUnits,
    totalBill,
    avgUnits,
    avgBill,
    effectiveRate,
    peakRow,
    startMonth: basisRows[0]?.month || '',
    endMonth: basisRows[basisCount - 1]?.month || '',
    verifiedCount,
    totalVerifiedInDataset,
  };
}

/**
 * Resolves the latest-12-billed-months average for a saved USC history record,
 * recomputing dynamically from its stored monthly rows when available so legacy
 * 13-month cached entries immediately match the 12-month averaging rule.
 */
export function resolveHistory12MonthAverage(entry: {
  months?: MonthlyBillRecord[];
  avgMonthlyUnits: number;
  avgMonthlyBill: number;
}): { avgMonthlyUnits: number; avgMonthlyBill: number; basisCount: number } {
  if (Array.isArray(entry.months) && entry.months.length > 0) {
    const summary = computeLatest12MonthSummary(entry.months);
    if (summary.basisCount > 0 && (summary.avgUnits > 0 || summary.avgBill > 0)) {
      return {
        avgMonthlyUnits: summary.avgUnits,
        avgMonthlyBill: summary.avgBill,
        basisCount: summary.basisCount,
      };
    }
  }
  return {
    avgMonthlyUnits: entry.avgMonthlyUnits,
    avgMonthlyBill: entry.avgMonthlyBill,
    basisCount: MAX_AVERAGE_MONTHS,
  };
}
