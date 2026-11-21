import { AccountCorrectionFactor, MonthlyBillRecord } from '../types/solar';
import { STATE_GRID_DATABASE, GridCategory } from './gridTariffs';

export type FourStateId = 'telangana' | 'andhra_pradesh' | 'odissa' | 'chandigarh';

export interface DiscomPortalSpec {
  discomId: string;
  shortName: string;
  fullName: string;
  stateId: FourStateId;
  stateName: string;
  portalUrl: string;
  billHistoryUrl: string;
  uscLabel: string;
  formatHint: string;
  exampleNumbers: string[];
  coverage: string;
}

export interface InbuiltUscProfile {
  uscNumber: string;
  consumerAlias: string;
  stateId: FourStateId;
  discomId: string;
  category: GridCategory;
  sanctionedLoadKw: number;
  circleOrDistrict: string;
  tariffRate: number;
  baseMonthlyUnits: number;
  seedOffset: number;
  months: MonthlyBillRecord[];
}

export type ConnectionNumberType = 'USC' | 'CA' | 'ACCOUNT';

export interface IdentifiedUscMatch {
  normalizedUsc: string;
  numberType: ConnectionNumberType;
  numberTypeLabel: string;
  stateId: FourStateId;
  stateName: string;
  discom: DiscomPortalSpec;
  category: GridCategory;
  tariffRate: number;
  confidence: 'inbuilt_exact' | 'format_prefix' | 'format_length' | 'state_fallback';
  matchReason: string;
  inbuiltProfile: InbuiltUscProfile | null;
}

export interface RollingMonthSlot {
  sequenceNo: number; // 1 .. 12 (12 is present running month)
  calendarMonth0: number; // 0 .. 11
  year: number;
  month: string; // e.g. 'Dec 2025' .. 'Nov 2026'
  shortLabel: string; // e.g. "Dec '25" .. "Nov '26"
  isRunningMonth: boolean;
}

export interface IndiaClockInfo {
  year: number;
  month0: number;
  day: number;
  daysInMonth: number;
  monthProgressPercent: number;
  formattedIst: string;
}

export interface ServiceNumberValidationSpec {
  stateId: FourStateId;
  stateName: string;
  regex: RegExp;
  expectedFormat: string;
  example: string;
}

export interface ServiceNumberValidationResult {
  isValid: boolean;
  normalized: string;
  numberType: ConnectionNumberType;
  numberTypeLabel: string;
  matchedStateId: FourStateId | null;
  expectedFormat: string;
  errorMessage: string | null;
}

export const SERVICE_NUMBER_REGEX_BY_STATE: Record<FourStateId, ServiceNumberValidationSpec> = {
  telangana: {
    stateId: 'telangana',
    stateName: 'Telangana',
    regex: /^(?:[0-9]{8,12}|(?:TG|TS|SC|USC|UKSC|HYD|RR|WGL|KRM|NZB|KHM|ADB|JGT)[0-9]{6,12})$/,
    expectedFormat: '8-digit TGNPDCL or 9–12 digit TGSPDCL USC No (e.g. 10458291 or 102603120)',
    example: '10458291',
  },
  andhra_pradesh: {
    stateId: 'andhra_pradesh',
    stateName: 'Andhra Pradesh',
    regex:
      /^(?:[0-9]{8}|[0-9]{12,16}|[0-9]{5}[A-Z0-9]{8}|[A-Z0-9]{16}|(?:AP|VJA|VSP|TPT|GNT|RJY|ELR|KDP|NLR|USC|UKSC)[0-9]{6,13})$/,
    expectedFormat: '8-digit USC/UKSC or 12–16 char AP USC Number (e.g. 1321104005678)',
    example: '1321104005678',
  },
  odissa: {
    stateId: 'odissa',
    stateName: 'Odisha',
    regex: /^(?:[0-9]{11,12}|(?:TPC|TPW|TPN|TPS|OD|OR|CA)[0-9]{8,12})$/,
    expectedFormat:
      '11–12 digit USC / CA No starting 800/100/200/300/400 (e.g. 80014589231)',
    example: '80014589231',
  },
  chandigarh: {
    stateId: 'chandigarh',
    stateName: 'Chandigarh (UT)',
    regex: /^(?:[0-9]{5,10}|(?:CED|CHD|CH)[0-9]{4,8}|[XZ][0-9]{3,5}[A-Z][0-9]{4,7})$/,
    expectedFormat: '5–10 digit USC / Account No (e.g. 451209 or CED104523)',
    example: 'CED104523',
  },
};

export const FOUR_STATES_LIST: { id: FourStateId; name: string; badge: string }[] = [
  { id: 'telangana', name: 'Telangana', badge: 'TG' },
  { id: 'andhra_pradesh', name: 'Andhra Pradesh', badge: 'AP' },
  { id: 'odissa', name: 'Odisha', badge: 'OD' },
  { id: 'chandigarh', name: 'Chandigarh (UT)', badge: 'CHD' },
];

export const DISCOM_PORTAL_SPECS: DiscomPortalSpec[] = [
  // 1. Telangana
  {
    discomId: 'tgspdcl',
    shortName: 'TGSPDCL',
    fullName: 'Southern Power Distribution Company of Telangana Ltd',
    stateId: 'telangana',
    stateName: 'Telangana',
    portalUrl: 'https://tgsouthernpower.org/',
    billHistoryUrl: 'https://webportal.tgsouthernpower.org/ConsumerInfo/',
    uscLabel: 'USC Number (Unique Service 8–12 digits)',
    formatHint: '9–12 digit USC Number (e.g. 102603120)',
    exampleNumbers: ['102603120', '104582910'],
    coverage: 'Hyderabad, Rangareddy, Medchal, Mahabubnagar, Nalgonda',
  },
  {
    discomId: 'tgnpdcl',
    shortName: 'TGNPDCL',
    fullName: 'Northern Power Distribution Company of Telangana Ltd',
    stateId: 'telangana',
    stateName: 'Telangana',
    portalUrl: 'https://tgnpdcl.com/Menu/OnlinePayBIll',
    billHistoryUrl: 'https://vas.easebuzz.in/TGNPDCL/Billpay',
    uscLabel: 'USC Number (8-digit USCNO)',
    formatHint: '8-digit TGNPDCL USCNO (e.g. 10458291 or 10260312)',
    exampleNumbers: ['10458291', '10260312'],
    coverage: 'Warangal, Hanamkonda, Karimnagar, Nizamabad, Khammam, Adilabad',
  },

  // 2. Andhra Pradesh
  {
    discomId: 'apspdcl',
    shortName: 'APSPDCL',
    fullName: 'Southern Power Distribution Company of A.P. Ltd',
    stateId: 'andhra_pradesh',
    stateName: 'Andhra Pradesh',
    portalUrl: 'https://www.apspdcl.in/',
    billHistoryUrl: 'https://www.apspdcl.in/ConsumerDashboard/serviceDetails.jsp',
    uscLabel: 'USC / UKSC Number (8 or 13 chars)',
    formatHint: '8-digit or 13-char USC Number (e.g. 1321104005678)',
    exampleNumbers: ['1321104005678'],
    coverage: 'Tirupati, Nellore, Kadapa, Chittoor, Anantapur, Kurnool',
  },
  {
    discomId: 'apepdcl',
    shortName: 'APEPDCL',
    fullName: 'Eastern Power Distribution Company of A.P. Ltd',
    stateId: 'andhra_pradesh',
    stateName: 'Andhra Pradesh',
    portalUrl: 'https://www.apeasternpower.com/',
    billHistoryUrl: 'https://www.apeasternpower.com/viewBillDetailsMain',
    uscLabel: 'USC / UKSCNO Number (8–16 chars)',
    formatHint: '8-digit or 13–16 char USC Number (e.g. 1112040089123)',
    exampleNumbers: ['1112040089123'],
    coverage: 'Visakhapatnam, Kakinada, Rajahmundry, Srikakulam, Eluru',
  },
  {
    discomId: 'apcpdcl',
    shortName: 'APCPDCL',
    fullName: 'Central Power Distribution Corporation of A.P. Ltd',
    stateId: 'andhra_pradesh',
    stateName: 'Andhra Pradesh',
    portalUrl: 'https://www.apcpdcl.in/',
    billHistoryUrl: 'https://portal.apcpdcl.in/',
    uscLabel: 'USC Number (13 digits)',
    formatHint: '13-digit USC Number starting 21/22/52',
    exampleNumbers: ['2145030012456'],
    coverage: 'Vijayawada, Guntur, Krishna, Prakasam, Bapatla',
  },

  // 3. Odisha / Odissa
  {
    discomId: 'tpcodl',
    shortName: 'TPCODL',
    fullName: 'TP Central Odisha Distribution Ltd',
    stateId: 'odissa',
    stateName: 'Odisha',
    portalUrl: 'https://www.tpcentralodisha.com/',
    billHistoryUrl: 'https://portal.tpcentralodisha.com/ConsumerPortal/',
    uscLabel: 'CA Number (11–12 digits)',
    formatHint: '11-digit CA No starting 800/100 (e.g. 80014589231) or TPC/OD',
    exampleNumbers: ['80014589231'],
    coverage: 'Bhubaneswar, Cuttack, Puri, Dhenkanal, Kendrapara',
  },
  {
    discomId: 'tpwodl',
    shortName: 'TPWODL',
    fullName: 'TP Western Odisha Distribution Ltd',
    stateId: 'odissa',
    stateName: 'Odisha',
    portalUrl: 'https://www.tpwodl.com/',
    billHistoryUrl: 'https://www.tpwesternodisha.com/customer-zone/view-bill.aspx',
    uscLabel: 'CA Number (11–12 digits)',
    formatHint: '11-digit CA No starting 200/810 (e.g. 20045678912) or TPW',
    exampleNumbers: ['20045678912'],
    coverage: 'Sambalpur, Rourkela, Jharsuguda, Bargarh, Balangir',
  },
  {
    discomId: 'tpnodl',
    shortName: 'TPNODL',
    fullName: 'TP Northern Odisha Distribution Ltd',
    stateId: 'odissa',
    stateName: 'Odisha',
    portalUrl: 'https://www.tpnodl.com/',
    billHistoryUrl: 'https://www.tpnorthernodisha.com/customer-zone/view-bill.aspx',
    uscLabel: 'CA Number (11–12 digits)',
    formatHint: '11-digit CA No starting 300/820 (e.g. 30067891234) or TPN',
    exampleNumbers: ['30067891234'],
    coverage: 'Balasore, Bhadrak, Baripada, Keonjhar, Mayurbhanj',
  },
  {
    discomId: 'tpsodl',
    shortName: 'TPSODL',
    fullName: 'TP Southern Odisha Distribution Ltd',
    stateId: 'odissa',
    stateName: 'Odisha',
    portalUrl: 'https://www.tpsouthernodisha.com/',
    billHistoryUrl: 'https://www.tpsouthernodisha.com/customer-zone/view-bill.aspx',
    uscLabel: 'CA Number (11–12 digits)',
    formatHint: '11-digit CA No starting 400/830 (e.g. 40023456789) or TPS',
    exampleNumbers: ['40023456789'],
    coverage: 'Berhampur, Ganjam, Gajapati, Koraput, Rayagada',
  },

  // 4. Chandigarh (UT)
  {
    discomId: 'ced',
    shortName: 'CED Chandigarh',
    fullName: 'Chandigarh Electricity Department (Engineering Dept)',
    stateId: 'chandigarh',
    stateName: 'Chandigarh (UT)',
    portalUrl: 'https://chdengineering.gov.in/',
    billHistoryUrl: 'https://sampark.chd.nic.in/Epayment/index.aspx',
    uscLabel: 'Account / Consumer No (5–10 chars)',
    formatHint: '6–8 digit Account No or CED/CHD prefix (e.g. CED104523)',
    exampleNumbers: ['CED104523', '451209'],
    coverage: 'Chandigarh Sectors 1–63, Manimajra & Industrial Area',
  },
];

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Returns live Indian Standard Time (Asia/Kolkata) calendar components so that
 * month #12 is ALWAYS the present running month (e.g. Nov 2026) and month #1 is
 * 11 months prior (e.g. Dec 2025).
 */
export function getIndiaClockInfo(referenceDate: Date = new Date()): IndiaClockInfo {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const getNum = (type: string, fallback: number) => {
    const val = parts.find((p) => p.type === type)?.value;
    const parsed = val ? parseInt(val, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const year = getNum('year', referenceDate.getFullYear());
  const month1 = getNum('month', referenceDate.getMonth() + 1);
  const month0 = Math.max(0, Math.min(11, month1 - 1));
  const day = getNum('day', referenceDate.getDate());
  const hour = String(getNum('hour', 12)).padStart(2, '0');
  const minute = String(getNum('minute', 0)).padStart(2, '0');

  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const monthProgressPercent = Math.max(3, Math.min(100, Math.round((day / daysInMonth) * 100)));

  return {
    year,
    month0,
    day,
    daysInMonth,
    monthProgressPercent,
    formattedIst: `${String(day).padStart(2, '0')} ${MONTH_NAMES[month0]} ${year}, ${hour}:${minute} IST`,
  };
}

/**
 * Parses an optional YYYY-MM search month string into { year, month0 }.
 */
export function parseSearchAnchorMonth(
  anchorYearMonth?: string,
  referenceDate: Date = new Date()
): { year: number; month0: number } {
  if (anchorYearMonth) {
    const m = anchorYearMonth.trim().match(/^(20\d{2})-(0?[1-9]|1[0-2])$/);
    if (m) {
      return { year: parseInt(m[1], 10), month0: parseInt(m[2], 10) - 1 };
    }
  }
  const clock = getIndiaClockInfo(referenceDate);
  return { year: clock.year, month0: clock.month0 };
}

/**
 * Generates the exact rolling N-month (12, 13, or 24) window in chronological order
 * ending at the searching month (defaulting to current IST month):
 * - e.g. Searching Nov 2026 (13M: last year same month to this month) -> Nov 2025 .. Nov 2026
 * - e.g. Searching Nov 2026 (12M) -> Dec 2025 .. Nov 2026
 * - e.g. Searching Oct 2026 (24M) -> Nov 2024 .. Oct 2026
 */
export function getRollingMonths(
  count: number = 13,
  referenceDate: Date = new Date(),
  anchorYearMonth?: string
): RollingMonthSlot[] {
  const safeCount = count >= 24 ? 24 : count === 13 ? 13 : 12;
  const { year: anchorYear, month0: anchorMonth0 } = parseSearchAnchorMonth(
    anchorYearMonth,
    referenceDate
  );
  const liveClock = getIndiaClockInfo(referenceDate);
  const slots: RollingMonthSlot[] = [];

  for (let offset = -(safeCount - 1); offset <= 0; offset++) {
    const d = new Date(Date.UTC(anchorYear, anchorMonth0 + offset, 15));
    const m0 = d.getUTCMonth();
    const y = d.getUTCFullYear();
    const shortYr = String(y).slice(-2);
    slots.push({
      sequenceNo: offset + safeCount, // 1 .. 12, 13, or 24
      calendarMonth0: m0,
      year: y,
      month: `${MONTH_NAMES[m0]} ${y}`,
      shortLabel: `${MONTH_NAMES[m0]} '${shortYr}`,
      isRunningMonth: y === liveClock.year && m0 === liveClock.month0,
    });
  }

  return slots;
}

export function getRolling12Months(
  referenceDate: Date = new Date(),
  anchorYearMonth?: string
): RollingMonthSlot[] {
  return getRollingMonths(12, referenceDate, anchorYearMonth);
}

// Seasonal climate consumption multipliers indexed by calendarMonth0 (0=Jan .. 11=Dec)
const STATE_SEASONAL_FACTORS: Record<FourStateId, number[]> = {
  telangana: [0.78, 0.86, 1.06, 1.24, 1.36, 1.18, 0.96, 0.94, 0.96, 1.02, 0.86, 0.78],
  andhra_pradesh: [0.80, 0.88, 1.05, 1.22, 1.34, 1.20, 0.98, 0.96, 0.96, 0.98, 0.85, 0.78],
  odissa: [0.74, 0.82, 1.02, 1.22, 1.35, 1.24, 1.00, 0.96, 0.98, 0.98, 0.88, 0.81],
  chandigarh: [0.88, 0.80, 0.85, 1.05, 1.30, 1.42, 1.34, 1.24, 1.06, 0.80, 0.64, 0.62],
};

/**
 * Options for exact DISCOM slab billing including per-account Correction Factor overrides.
 */
export interface ComputeExactBillOptions {
  accountNumber?: string; // Primary USC number for persisted correction factor lookup
  correctionFactor?: number; // Direct override multiplier (e.g. 1.05 = +5%)
  fixedOffsetInr?: number; // Optional fixed adjustment ₹ (e.g. +30 AGL dues)
}

const CORRECTION_FACTORS_STORAGE_KEY = 'solar_discom_correction_factors_v1';
const correctionFactorStore = new Map<string, AccountCorrectionFactor>();
let correctionStoreLoaded = false;

function normalizeAccountKey(raw?: string): string {
  return (raw || '').toUpperCase().replace(/[\s\-_/.]/g, '').trim();
}

function ensureCorrectionStoreLoaded(): void {
  if (correctionStoreLoaded) return;
  correctionStoreLoaded = true;
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const saved = window.localStorage.getItem(CORRECTION_FACTORS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item.accountKey === 'string' && typeof item.factor === 'number') {
            correctionFactorStore.set(item.accountKey, item as AccountCorrectionFactor);
          }
        }
      }
    }
  } catch {
    // ignore storage read failure
  }
}

function persistCorrectionStore(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(
      CORRECTION_FACTORS_STORAGE_KEY,
      JSON.stringify(Array.from(correctionFactorStore.values()))
    );
  } catch {
    // ignore storage write failure
  }
}

export function getCorrectionFactorForAccount(
  uscNumber?: string
): AccountCorrectionFactor | null {
  ensureCorrectionStoreLoaded();
  const uscKey = normalizeAccountKey(uscNumber);
  if (!uscKey) return null;
  if (correctionFactorStore.has(uscKey)) {
    return correctionFactorStore.get(uscKey) || null;
  }
  for (const entry of correctionFactorStore.values()) {
    const eUsc = normalizeAccountKey(entry.uscNumber || entry.accountKey.split('|')[0]);
    if (eUsc === uscKey) {
      return entry;
    }
  }
  return null;
}

export function getAllCorrectionFactors(): AccountCorrectionFactor[] {
  ensureCorrectionStoreLoaded();
  return Array.from(correctionFactorStore.values());
}

export function setCorrectionFactorForAccount(params: {
  uscNumber?: string;
  factor: number;
  fixedOffsetInr?: number;
  sampleMonthsCount?: number;
  avgVariancePct?: number;
  note?: string;
}): AccountCorrectionFactor | null {
  ensureCorrectionStoreLoaded();
  const uscClean = normalizeAccountKey(params.uscNumber);
  if (!uscClean) return null;

  const clampedFactor = Number(
    Math.max(0.5, Math.min(2.0, Number.isFinite(params.factor) ? params.factor : 1.0)).toFixed(4)
  );
  const fixedOffsetInr = Math.round(Number(params.fixedOffsetInr || 0));
  const avgVariancePct =
    typeof params.avgVariancePct === 'number'
      ? Number(params.avgVariancePct.toFixed(1))
      : Number(((clampedFactor - 1) * 100).toFixed(1));

  const record: AccountCorrectionFactor = {
    accountKey: uscClean,
    uscNumber: uscClean,
    factor: clampedFactor,
    fixedOffsetInr,
    sampleMonthsCount: Math.max(0, Math.round(params.sampleMonthsCount ?? 0)),
    avgVariancePct,
    note: params.note,
    updatedAtIso: new Date().toISOString(),
  };

  correctionFactorStore.set(uscClean, record);
  persistCorrectionStore();
  return record;
}

export function removeCorrectionFactorForAccount(uscNumber?: string): void {
  ensureCorrectionStoreLoaded();
  const uscClean = normalizeAccountKey(uscNumber);
  if (!uscClean) return;
  correctionFactorStore.delete(uscClean);
  for (const [k, entry] of Array.from(correctionFactorStore.entries())) {
    const eUsc = normalizeAccountKey(entry.uscNumber || k.split('|')[0]);
    if (eUsc === uscClean) {
      correctionFactorStore.delete(k);
    }
  }
  persistCorrectionStore();
}

/**
 * Computes base regulatory slab bill (before any account-level Correction Factor).
 */
export function computeBaseDiscomSlabBill(
  units: number,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  sanctionedLoadKw = 4
): number {
  const u = Math.max(0, Math.round(units));

  if (category === 'commercial') {
    const rate = STATE_GRID_DATABASE[stateId]?.tariffs.commercial.rate || 8.5;
    const fixedPerKw = stateId === 'chandigarh' ? 110 : 95;
    const fixed = Math.max(1, Math.round(sanctionedLoadKw)) * fixedPerKw;
    const energy = u <= 100 ? u * (rate * 0.88) : 100 * (rate * 0.88) + (u - 100) * rate;
    return Math.round(energy + fixed + u * 0.06);
  }

  if (stateId === 'telangana') {
    // TGERC / TGSPDCL LT-I Domestic & Common Service Slab structure
    let energy = 0;
    let customerCharge = 40;
    let trueUp = 0;
    if (u <= 50) {
      energy = u * 1.95;
      customerCharge = 40;
    } else if (u <= 200) {
      energy = u * 5.1;
      customerCharge = u <= 100 ? 70 : 90;
      trueUp = Math.round(u <= 100 ? u * 0.11 : 24);
    } else {
      const s1 = Math.min(u, 200) * 5.1;
      const s2 = u > 200 ? Math.min(u - 200, 100) * 7.7 : 0;
      const s3 = u > 300 ? Math.min(u - 300, 100) * 9.0 : 0;
      const s4 = u > 400 ? Math.min(u - 400, 400) * 9.5 : 0;
      const s5 = u > 800 ? (u - 800) * 10.0 : 0;
      energy = s1 + s2 + s3 + s4 + s5;
      customerCharge = 60;
    }
    const fixedCharge = Math.max(1, Math.round(sanctionedLoadKw)) * 10;
    const duty = u * 0.06;
    return Math.round(energy + fixedCharge + customerCharge + duty + trueUp);
  }

  if (stateId === 'andhra_pradesh') {
    // APERC Domestic Slab structure
    const s1 = Math.min(u, 30) * 1.9;
    const s2 = u > 30 ? Math.min(u - 30, 45) * 3.0 : 0;
    const s3 = u > 75 ? Math.min(u - 75, 50) * 4.5 : 0;
    const s4 = u > 125 ? Math.min(u - 125, 100) * 6.0 : 0;
    const s5 = u > 225 ? Math.min(u - 225, 175) * 8.75 : 0;
    const s6 = u > 400 ? (u - 400) * 9.75 : 0;
    const fixedCharge = Math.max(1, Math.round(sanctionedLoadKw)) * 10;
    const customerCharge = u > 200 ? 55 : 35;
    const duty = u * 0.06;
    return Math.round(s1 + s2 + s3 + s4 + s5 + s6 + fixedCharge + customerCharge + duty);
  }

  if (stateId === 'odissa') {
    // OERC Domestic Slab structure
    const s1 = Math.min(u, 50) * 3.0;
    const s2 = u > 50 ? Math.min(u - 50, 150) * 4.8 : 0;
    const s3 = u > 200 ? Math.min(u - 200, 200) * 5.8 : 0;
    const s4 = u > 400 ? (u - 400) * 6.2 : 0;
    const energy = s1 + s2 + s3 + s4;
    const fixedCharge = Math.max(1, Math.round(sanctionedLoadKw)) * 20;
    const duty = energy * 0.04;
    return Math.round(energy + fixedCharge + duty);
  }

  // Chandigarh JERC CED Domestic Slab structure
  const s1 = Math.min(u, 150) * 2.75;
  const s2 = u > 150 ? Math.min(u - 150, 250) * 4.8 : 0;
  const s3 = u > 400 ? (u - 400) * 5.4 : 0;
  const fixedCharge = Math.max(1, Math.round(sanctionedLoadKw)) * 15;
  return Math.round(s1 + s2 + s3 + fixedCharge);
}

/**
 * Derives an empirical Correction Factor & Variance summary from user-provided historical bills.
 */
export function computeCorrectionFactorFromVariance(
  records: Array<{ unitsKwh: number; billAmountInr: number }>,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  sanctionedLoadKw = 4
): {
  factor: number;
  fixedOffsetInr: number;
  sampleMonthsCount: number;
  avgVariancePct: number;
  baseEstimatedAvgInr: number;
  actualAvgInr: number;
} {
  const validRows = records.filter((r) => r.unitsKwh > 0 && r.billAmountInr > 0);
  if (validRows.length === 0) {
    return {
      factor: 1,
      fixedOffsetInr: 0,
      sampleMonthsCount: 0,
      avgVariancePct: 0,
      baseEstimatedAvgInr: 0,
      actualAvgInr: 0,
    };
  }

  let totalBase = 0;
  let totalActual = 0;
  for (const row of validRows) {
    totalBase += computeBaseDiscomSlabBill(row.unitsKwh, stateId, category, sanctionedLoadKw);
    totalActual += row.billAmountInr;
  }

  const baseAvg = totalBase / validRows.length;
  const actualAvg = totalActual / validRows.length;
  const rawRatio = baseAvg > 0 ? actualAvg / baseAvg : 1;
  const factor = Number(Math.max(0.5, Math.min(2.0, rawRatio)).toFixed(4));
  const avgVariancePct = Number(((rawRatio - 1) * 100).toFixed(1));

  return {
    factor,
    fixedOffsetInr: 0,
    sampleMonthsCount: validRows.length,
    avgVariancePct,
    baseEstimatedAvgInr: Math.round(baseAvg),
    actualAvgInr: Math.round(actualAvg),
  };
}

/**
 * Computes exact state-DISCOM tariff slab bill (Energy Charges + Fixed/Customer Charges + ED)
 * for all 4 supported Indian states, optionally adjusted by the account's Correction Factor state.
 */
export function computeExactDiscomBill(
  units: number,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  sanctionedLoadKw = 4,
  options?: ComputeExactBillOptions | number
): number {
  const baseBill = computeBaseDiscomSlabBill(units, stateId, category, sanctionedLoadKw);
  if (options === undefined) return baseBill;

  const opts: ComputeExactBillOptions =
    typeof options === 'number' ? { correctionFactor: options } : options;

  const stored = opts.accountNumber
    ? getCorrectionFactorForAccount(opts.accountNumber)
    : null;

  const rawFactor =
    typeof opts.correctionFactor === 'number' && Number.isFinite(opts.correctionFactor)
      ? opts.correctionFactor
      : stored?.factor ?? 1;
  const clampedFactor = Math.max(0.5, Math.min(2.0, rawFactor));

  const offsetInr =
    typeof opts.fixedOffsetInr === 'number' && Number.isFinite(opts.fixedOffsetInr)
      ? opts.fixedOffsetInr
      : stored?.fixedOffsetInr ?? 0;

  return Math.max(0, Math.round(baseBill * clampedFactor + offsetInr));
}

/**
 * Inverse-solves monthly Units (kWh) from an exact INR bill amount via binary search
 * against the state's exact DISCOM slab formula (honoring any Correction Factor state).
 */
export function estimateUnitsFromExactBill(
  targetBillInr: number,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  sanctionedLoadKw = 4,
  options?: ComputeExactBillOptions | number
): number {
  const bill = Math.max(0, targetBillInr);
  if (bill <= 50) return 0;
  let lo = 0;
  let hi = 25000;
  for (let i = 0; i < 24; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const est = computeExactDiscomBill(mid, stateId, category, sanctionedLoadKw, options);
    if (est < bill) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function build12MonthSeries(
  baseMonthlyUnits: number,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  sanctionedLoadKw = 4,
  seedOffset = 0,
  referenceDate: Date = new Date(),
  monthCount: 12 | 13 | 24 = 13,
  anchorYearMonth?: string
): MonthlyBillRecord[] {
  const slots = getRollingMonths(monthCount, referenceDate, anchorYearMonth);
  const factors = STATE_SEASONAL_FACTORS[stateId];

  return slots.map((slot) => {
    const seasonalFactor = factors[slot.calendarMonth0];
    const wave = 1 + ((((seedOffset + slot.calendarMonth0 * 7) % 9) - 4) * 0.01);
    const unitsKwh = Math.max(40, Math.round(baseMonthlyUnits * seasonalFactor * wave));
    const billAmountInr = computeExactDiscomBill(unitsKwh, stateId, category, sanctionedLoadKw);

    return {
      month: slot.month,
      shortLabel: slot.shortLabel,
      calendarMonth0: slot.calendarMonth0,
      year: slot.year,
      sequenceNo: slot.sequenceNo,
      isRunningMonth: slot.isRunningMonth,
      unitsKwh,
      billAmountInr,
    };
  });
}

interface RawUscSeed {
  uscNumber: string;
  consumerAlias: string;
  stateId: FourStateId;
  discomId: string;
  category: GridCategory;
  sanctionedLoadKw: number;
  circleOrDistrict: string;
  tariffRate: number;
  baseMonthlyUnits: number;
  seedOffset: number;
}

const INBUILT_USC_SEEDS: RawUscSeed[] = [
  {
    uscNumber: '104582910',
    consumerAlias: 'Banjara Hills LT-I Domestic Service',
    stateId: 'telangana',
    discomId: 'tgspdcl',
    category: 'domestic',
    sanctionedLoadKw: 5,
    circleOrDistrict: 'Hyderabad Central Circle',
    tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
    baseMonthlyUnits: 440,
    seedOffset: 2,
  },
  {
    uscNumber: '108934215',
    consumerAlias: 'Madhapur LT-II Commercial Complex',
    stateId: 'telangana',
    discomId: 'tgspdcl',
    category: 'commercial',
    sanctionedLoadKw: 12,
    circleOrDistrict: 'Cyberabad Circle',
    tariffRate: STATE_GRID_DATABASE.telangana.tariffs.commercial.rate,
    baseMonthlyUnits: 1120,
    seedOffset: 5,
  },
  {
    uscNumber: '1120456789',
    consumerAlias: 'Hanamkonda LT-I Residential Service',
    stateId: 'telangana',
    discomId: 'tgnpdcl',
    category: 'domestic',
    sanctionedLoadKw: 4,
    circleOrDistrict: 'Warangal Circle',
    tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
    baseMonthlyUnits: 360,
    seedOffset: 3,
  },
  {
    uscNumber: '1321104005678',
    consumerAlias: 'Tirupati Urban LT-I Domestic',
    stateId: 'andhra_pradesh',
    discomId: 'apspdcl',
    category: 'domestic',
    sanctionedLoadKw: 5,
    circleOrDistrict: 'Tirupati ERO',
    tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
    baseMonthlyUnits: 410,
    seedOffset: 1,
  },
  {
    uscNumber: '1112040089123',
    consumerAlias: 'MVP Colony Visakhapatnam LT-I',
    stateId: 'andhra_pradesh',
    discomId: 'apepdcl',
    category: 'domestic',
    sanctionedLoadKw: 6,
    circleOrDistrict: 'Visakhapatnam Zone-II',
    tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
    baseMonthlyUnits: 490,
    seedOffset: 4,
  },
  {
    uscNumber: '2145030012456',
    consumerAlias: 'Benz Circle Vijayawada Commercial',
    stateId: 'andhra_pradesh',
    discomId: 'apcpdcl',
    category: 'commercial',
    sanctionedLoadKw: 10,
    circleOrDistrict: 'Vijayawada Central',
    tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.commercial.rate,
    baseMonthlyUnits: 950,
    seedOffset: 6,
  },
  {
    uscNumber: '80014589231',
    consumerAlias: 'Patia Bhubaneswar OERC Domestic',
    stateId: 'odissa',
    discomId: 'tpcodl',
    category: 'domestic',
    sanctionedLoadKw: 4,
    circleOrDistrict: 'Bhubaneswar City Div-II',
    tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
    baseMonthlyUnits: 385,
    seedOffset: 2,
  },
  {
    uscNumber: '20045678912',
    consumerAlias: 'Rourkela Civil Township LT Domestic',
    stateId: 'odissa',
    discomId: 'tpwodl',
    category: 'domestic',
    sanctionedLoadKw: 5,
    circleOrDistrict: 'Rourkela Circle',
    tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
    baseMonthlyUnits: 430,
    seedOffset: 7,
  },
  {
    uscNumber: '30067891234',
    consumerAlias: 'Balasore Town Domestic CA',
    stateId: 'odissa',
    discomId: 'tpnodl',
    category: 'domestic',
    sanctionedLoadKw: 3,
    circleOrDistrict: 'Balasore Division',
    tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
    baseMonthlyUnits: 310,
    seedOffset: 3,
  },
  {
    uscNumber: '40023456789',
    consumerAlias: 'Berhampur Silk City Domestic CA',
    stateId: 'odissa',
    discomId: 'tpsodl',
    category: 'domestic',
    sanctionedLoadKw: 4,
    circleOrDistrict: 'Berhampur Circle',
    tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
    baseMonthlyUnits: 345,
    seedOffset: 5,
  },
  {
    uscNumber: 'CED104523',
    consumerAlias: 'Sector 22 Chandigarh JERC Domestic',
    stateId: 'chandigarh',
    discomId: 'ced',
    category: 'domestic',
    sanctionedLoadKw: 6,
    circleOrDistrict: 'Sub-Division 4 Sector 22',
    tariffRate: STATE_GRID_DATABASE.chandigarh.tariffs.domestic.rate,
    baseMonthlyUnits: 510,
    seedOffset: 2,
  },
  {
    uscNumber: '451209',
    consumerAlias: 'Sector 17 Commercial Showrooms CED',
    stateId: 'chandigarh',
    discomId: 'ced',
    category: 'commercial',
    sanctionedLoadKw: 10,
    circleOrDistrict: 'Central Division Sector 17',
    tariffRate: STATE_GRID_DATABASE.chandigarh.tariffs.commercial.rate,
    baseMonthlyUnits: 890,
    seedOffset: 4,
  },
];

export function getInbuiltUscProfiles(referenceDate: Date = new Date()): InbuiltUscProfile[] {
  return INBUILT_USC_SEEDS.map((seed) => ({
    ...seed,
    months: build12MonthSeries(
      seed.baseMonthlyUnits,
      seed.stateId,
      seed.category,
      seed.sanctionedLoadKw,
      seed.seedOffset,
      referenceDate
    ),
  }));
}

export const INBUILT_USC_PROFILES: InbuiltUscProfile[] = getInbuiltUscProfiles();

export function normalizeUscNumber(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_/.]/g, '').trim();
}

export function identifyConnectionNumberType(
  rawInput: string,
  stateHint?: FourStateId
): { numberType: ConnectionNumberType; numberTypeLabel: string; cleanedValue: string } {
  const norm = normalizeUscNumber(rawInput);
  if (!norm) {
    return {
      numberType: 'USC',
      numberTypeLabel: 'USC Number (Primary)',
      cleanedValue: '',
    };
  }

  // Explicit USC / UKSC prefixes
  if (norm.startsWith('UKSC') || norm.startsWith('USC')) {
    const stripped = norm.replace(/^(?:UKSC|USC)/, '');
    return {
      numberType: 'USC',
      numberTypeLabel: 'USC Number (Unique Service)',
      cleanedValue: /^\d{6,14}$/.test(stripped) ? stripped : norm,
    };
  }

  // Odisha CA numbers
  if (
    /^(?:TPC|TPW|TPN|TPS|OD|OR|CA)/.test(norm) ||
    ((norm.length === 11 || norm.length === 12) &&
      /^(?:800|810|820|830|200|300|400|100)/.test(norm))
  ) {
    return {
      numberType: 'CA',
      numberTypeLabel: 'USC / CA Number (Odisha)',
      cleanedValue: norm,
    };
  }

  // Chandigarh Account numbers
  if (
    /^(?:CED|CHD|CH)/.test(norm) ||
    /^[XZ][0-9]{3,5}[A-Z][0-9]{4,7}$/.test(norm) ||
    (/^\d{5,7}$/.test(norm) && stateHint === 'chandigarh')
  ) {
    return {
      numberType: 'ACCOUNT',
      numberTypeLabel: 'USC / Account No (Chandigarh)',
      cleanedValue: norm,
    };
  }

  return {
    numberType: 'USC',
    numberTypeLabel: 'USC Number (Unique Service)',
    cleanedValue: norm,
  };
}

/**
 * Normalizes a single USC Number input for strict USC-only portal queries.
 */
export function resolveUscParameter(
  rawUscInput: string,
  stateHint?: FourStateId
): {
  uscNumber?: string;
  primaryType: ConnectionNumberType;
  primaryTypeLabel: string;
} {
  const pInfo = identifyConnectionNumberType(rawUscInput.trim(), stateHint);
  return {
    uscNumber: pInfo.cleanedValue || undefined,
    primaryType: pInfo.numberType,
    primaryTypeLabel: pInfo.numberTypeLabel,
  };
}

/**
 * Validates a USC Number using official 4-state DISCOM regex rules before portal fetch requests.
 */
export function validateServiceNumber(
  rawInput: string,
  preferredStateId?: FourStateId
): ServiceNumberValidationResult {
  const trimmed = rawInput.trim();
  const typeInfo = identifyConnectionNumberType(trimmed, preferredStateId);

  if (!trimmed) {
    const fallbackSpec = preferredStateId
      ? SERVICE_NUMBER_REGEX_BY_STATE[preferredStateId]
      : SERVICE_NUMBER_REGEX_BY_STATE.telangana;
    return {
      isValid: false,
      normalized: '',
      numberType: 'USC',
      numberTypeLabel: 'USC Number (Primary)',
      matchedStateId: null,
      expectedFormat: fallbackSpec.expectedFormat,
      errorMessage: `Enter a valid USC Number (${fallbackSpec.expectedFormat}).`,
    };
  }

  // Reject unsafe characters outside alphanumeric & standard separators (-, _, /, ., space)
  if (!/^[A-Za-z0-9\s\-_/.]+$/.test(trimmed)) {
    return {
      isValid: false,
      normalized: normalizeUscNumber(trimmed),
      numberType: typeInfo.numberType,
      numberTypeLabel: typeInfo.numberTypeLabel,
      matchedStateId: null,
      expectedFormat: 'Letters and digits only (e.g. 102603120 or CED104523)',
      errorMessage: 'Special characters are not allowed in USC Number.',
    };
  }

  const normalized = normalizeUscNumber(trimmed);

  // Reject all-zero or overly short/long tokens
  if (/^0+$/.test(normalized) || normalized.length < 5 || normalized.length > 18) {
    const spec = preferredStateId
      ? SERVICE_NUMBER_REGEX_BY_STATE[preferredStateId]
      : SERVICE_NUMBER_REGEX_BY_STATE.telangana;
    return {
      isValid: false,
      normalized,
      numberType: typeInfo.numberType,
      numberTypeLabel: typeInfo.numberTypeLabel,
      matchedStateId: null,
      expectedFormat: spec.expectedFormat,
      errorMessage:
        normalized.length < 5
          ? `USC Number is too short (${normalized.length} chars). Expected: ${spec.expectedFormat}.`
          : `Invalid USC Number format. Expected: ${spec.expectedFormat}.`,
    };
  }

  // 1. Check inbuilt registered USC numbers first
  const inbuiltMatch = INBUILT_USC_SEEDS.find(
    (p) => normalizeUscNumber(p.uscNumber) === normalized
  );
  if (inbuiltMatch) {
    const spec = SERVICE_NUMBER_REGEX_BY_STATE[inbuiltMatch.stateId];
    const inbuiltType = identifyConnectionNumberType(inbuiltMatch.uscNumber, inbuiltMatch.stateId);
    return {
      isValid: true,
      normalized,
      numberType: inbuiltType.numberType,
      numberTypeLabel: inbuiltType.numberTypeLabel,
      matchedStateId: inbuiltMatch.stateId,
      expectedFormat: spec.expectedFormat,
      errorMessage: null,
    };
  }

  // 2. Check all 4 states' official regex patterns; prefer explicit prefix/state match first
  const candidateOrder: FourStateId[] = preferredStateId
    ? [
        preferredStateId,
        ...(['telangana', 'andhra_pradesh', 'odissa', 'chandigarh'] as FourStateId[]).filter(
          (id) => id !== preferredStateId
        ),
      ]
    : ['telangana', 'andhra_pradesh', 'odissa', 'chandigarh'];

  for (const stId of candidateOrder) {
    const spec = SERVICE_NUMBER_REGEX_BY_STATE[stId];
    if (spec.regex.test(normalized)) {
      const detected = identifyConnectionNumberType(normalized, stId);
      return {
        isValid: true,
        normalized,
        numberType: detected.numberType,
        numberTypeLabel: detected.numberTypeLabel,
        matchedStateId: stId,
        expectedFormat: spec.expectedFormat,
        errorMessage: null,
      };
    }
  }

  const activeSpec = preferredStateId
    ? SERVICE_NUMBER_REGEX_BY_STATE[preferredStateId]
    : SERVICE_NUMBER_REGEX_BY_STATE.telangana;

  return {
    isValid: false,
    normalized,
    numberType: typeInfo.numberType,
    numberTypeLabel: typeInfo.numberTypeLabel,
    matchedStateId: null,
    expectedFormat: activeSpec.expectedFormat,
    errorMessage: `Invalid format for ${activeSpec.stateName}: expected ${activeSpec.expectedFormat}.`,
  };
}

function getDiscomById(discomId: string): DiscomPortalSpec {
  return DISCOM_PORTAL_SPECS.find((d) => d.discomId === discomId) || DISCOM_PORTAL_SPECS[0];
}

function getDefaultDiscomForState(stateId: FourStateId): DiscomPortalSpec {
  return DISCOM_PORTAL_SPECS.find((d) => d.stateId === stateId) || DISCOM_PORTAL_SPECS[0];
}

/**
 * Auto-identifies Number Type (USC vs SC vs CA vs Account), State, DISCOM, Official Portal,
 * and real-time rolling 12-Month Service Metadata from an entered USC / SC / CA / Account number.
 */
export function identifyServiceFromUsc(
  rawInput: string,
  preferredStateId?: FourStateId,
  referenceDate: Date = new Date()
): IdentifiedUscMatch {
  const normalized = normalizeUscNumber(rawInput);
  const liveProfiles = getInbuiltUscProfiles(referenceDate);

  const attachType = (
    match: Omit<IdentifiedUscMatch, 'numberType' | 'numberTypeLabel'>
  ): IdentifiedUscMatch => {
    const t = identifyConnectionNumberType(match.normalizedUsc || normalized, match.stateId);
    return {
      ...match,
      numberType: t.numberType,
      numberTypeLabel: t.numberTypeLabel,
    };
  };

  const resolveCore = (): Omit<IdentifiedUscMatch, 'numberType' | 'numberTypeLabel'> => {
    // 1. Exact inbuilt USC service record match
    const exact = liveProfiles.find((p) => normalizeUscNumber(p.uscNumber) === normalized);
    if (exact) {
      const discom = getDiscomById(exact.discomId);
      return {
        normalizedUsc: exact.uscNumber,
        stateId: exact.stateId,
        stateName: discom.stateName,
        discom,
        category: exact.category,
        tariffRate: exact.tariffRate,
        confidence: 'inbuilt_exact',
        matchReason: `Matched registered ${discom.shortName} service (${exact.circleOrDistrict})`,
        inbuiltProfile: exact,
      };
    }

  // 2. Prefix-based identification across all 4 states
  if (normalized.startsWith('CED') || normalized.startsWith('CHD') || normalized.startsWith('CH')) {
    const discom = getDiscomById('ced');
    return {
      normalizedUsc: normalized,
      stateId: 'chandigarh',
      stateName: discom.stateName,
      discom,
      category: 'domestic',
      tariffRate: STATE_GRID_DATABASE.chandigarh.tariffs.domestic.rate,
      confidence: 'format_prefix',
      matchReason: `Identified prefix (${normalized.slice(0, 3)}) → Chandigarh Electricity Dept`,
      inbuiltProfile: null,
    };
  }

  if (
    normalized.startsWith('TPC') ||
    normalized.startsWith('TPW') ||
    normalized.startsWith('TPN') ||
    normalized.startsWith('TPS') ||
    normalized.startsWith('OD') ||
    normalized.startsWith('OR')
  ) {
    const discomId = normalized.startsWith('TPW')
      ? 'tpwodl'
      : normalized.startsWith('TPN')
      ? 'tpnodl'
      : normalized.startsWith('TPS')
      ? 'tpsodl'
      : 'tpcodl';
    const discom = getDiscomById(discomId);
    return {
      normalizedUsc: normalized,
      stateId: 'odissa',
      stateName: discom.stateName,
      discom,
      category: 'domestic',
      tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
      confidence: 'format_prefix',
      matchReason: `Identified Odisha CA prefix → ${discom.shortName}`,
      inbuiltProfile: null,
    };
  }

  if (
    normalized.startsWith('AP') ||
    normalized.startsWith('VJA') ||
    normalized.startsWith('VSP') ||
    normalized.startsWith('TPT') ||
    normalized.startsWith('GNT')
  ) {
    const discomId = normalized.startsWith('VSP')
      ? 'apepdcl'
      : normalized.startsWith('VJA') || normalized.startsWith('GNT')
      ? 'apcpdcl'
      : 'apspdcl';
    const discom = getDiscomById(discomId);
    return {
      normalizedUsc: normalized,
      stateId: 'andhra_pradesh',
      stateName: discom.stateName,
      discom,
      category: 'domestic',
      tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
      confidence: 'format_prefix',
      matchReason: `Identified AP service prefix → ${discom.shortName}`,
      inbuiltProfile: null,
    };
  }

  if (
    normalized.startsWith('TG') ||
    normalized.startsWith('TS') ||
    normalized.startsWith('SC') ||
    normalized.startsWith('USC') ||
    normalized.startsWith('HYD') ||
    normalized.startsWith('WGL') ||
    normalized.startsWith('KRM') ||
    normalized.startsWith('NZB') ||
    normalized.startsWith('KHM') ||
    normalized.startsWith('ADB') ||
    normalized.startsWith('JGT')
  ) {
    const discomId =
      normalized.startsWith('TGN') ||
      normalized.startsWith('WGL') ||
      normalized.startsWith('KRM') ||
      normalized.startsWith('NZB') ||
      normalized.startsWith('KHM') ||
      normalized.startsWith('ADB') ||
      normalized.startsWith('JGT')
        ? 'tgnpdcl'
        : 'tgspdcl';
    const discom = getDiscomById(discomId);
    return {
      normalizedUsc: normalized,
      stateId: 'telangana',
      stateName: discom.stateName,
      discom,
      category: 'domestic',
      tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
      confidence: 'format_prefix',
      matchReason: `Identified Telangana circle/SC prefix → ${discom.shortName}`,
      inbuiltProfile: null,
    };
  }

  // 3. Digit-length & alphanumeric official DISCOM heuristics
  const digitsOnly = /^\d+$/.test(normalized);
  // APSPDCL 13-char alphanumeric ERO format: ^\d{5}[A-Z0-9]{8}$
  if (/^\d{5}[A-Z0-9]{8}$/.test(normalized) && !digitsOnly) {
    const discom = getDiscomById('apspdcl');
    return {
      normalizedUsc: normalized,
      stateId: 'andhra_pradesh',
      stateName: discom.stateName,
      discom,
      category: 'domestic',
      tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
      confidence: 'format_prefix',
      matchReason: `13-char AP ERO format matched Andhra Pradesh (${discom.shortName})`,
      inbuiltProfile: null,
    };
  }

  // Chandigarh commercial alphanumeric format e.g. Z41000I0082 / X205I150125
  if (/^[XZ][0-9]{3,5}[A-Z][0-9]{4,7}$/.test(normalized)) {
    const discom = getDiscomById('ced');
    return {
      normalizedUsc: normalized,
      stateId: 'chandigarh',
      stateName: discom.stateName,
      discom,
      category: 'commercial',
      tariffRate: STATE_GRID_DATABASE.chandigarh.tariffs.commercial.rate,
      confidence: 'format_prefix',
      matchReason: `Commercial Account format matched Chandigarh CED`,
      inbuiltProfile: null,
    };
  }

  if (digitsOnly) {
    // 16-digit AP SCNO belongs to APEPDCL; 13-15 digits belong to APCPDCL (21/22/52) or APSPDCL
    if (normalized.length === 16) {
      const discom = getDiscomById('apepdcl');
      return {
        normalizedUsc: normalized,
        stateId: 'andhra_pradesh',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `16-digit SCNO matched Andhra Pradesh (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    if (normalized.length >= 13 && normalized.length <= 15) {
      const discomId =
        normalized.startsWith('21') || normalized.startsWith('22') || normalized.startsWith('52')
          ? 'apcpdcl'
          : 'apspdcl';
      const discom = getDiscomById(discomId);
      return {
        normalizedUsc: normalized,
        stateId: 'andhra_pradesh',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `${normalized.length}-digit Service No matched Andhra Pradesh (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    // 11–12 digits: Odisha CA numbers start with 800/810/820/830/200/300/400/100,
    // whereas Telangana TGSPDCL also uses 12-digit USC numbers when Telangana is selected!
    if (normalized.length === 11 || normalized.length === 12) {
      const looksOdishaPrefix =
        normalized.startsWith('800') ||
        normalized.startsWith('810') ||
        normalized.startsWith('820') ||
        normalized.startsWith('830') ||
        normalized.startsWith('200') ||
        normalized.startsWith('300') ||
        normalized.startsWith('400');

      if (preferredStateId === 'telangana' && normalized.length === 12 && !looksOdishaPrefix) {
        const discom = getDiscomById('tgspdcl');
        return {
          normalizedUsc: normalized,
          stateId: 'telangana',
          stateName: discom.stateName,
          discom,
          category: 'domestic',
          tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
          confidence: 'format_length',
          matchReason: `12-digit USC No matched Telangana (${discom.shortName})`,
          inbuiltProfile: null,
        };
      }

      if (preferredStateId === 'andhra_pradesh' && normalized.length === 12 && !looksOdishaPrefix) {
        const discom = getDiscomById('apspdcl');
        return {
          normalizedUsc: normalized,
          stateId: 'andhra_pradesh',
          stateName: discom.stateName,
          discom,
          category: 'domestic',
          tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
          confidence: 'format_length',
          matchReason: `12-digit USC No matched Andhra Pradesh (${discom.shortName})`,
          inbuiltProfile: null,
        };
      }

      const discomId =
        normalized.startsWith('200') || normalized.startsWith('810')
          ? 'tpwodl'
          : normalized.startsWith('300') || normalized.startsWith('820')
          ? 'tpnodl'
          : normalized.startsWith('400') || normalized.startsWith('830')
          ? 'tpsodl'
          : 'tpcodl';
      const discom = getDiscomById(discomId);
      return {
        normalizedUsc: normalized,
        stateId: 'odissa',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.odissa.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `${normalized.length}-digit CA/USC No matched Odisha (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    if (normalized.length === 8 && preferredStateId === 'andhra_pradesh') {
      const discom = getDiscomById('apepdcl');
      return {
        normalizedUsc: normalized,
        stateId: 'andhra_pradesh',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.andhra_pradesh.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `8-digit USC/UKSCNO matched Andhra Pradesh (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    if (normalized.length === 8) {
      const discom = getDiscomById('tgnpdcl');
      return {
        normalizedUsc: normalized,
        stateId: 'telangana',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `8-digit USCNO matched Northern Telangana (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    if (normalized.length >= 9 && normalized.length <= 10) {
      const discomId =
        normalized.length === 10 && (normalized.startsWith('11') || normalized.startsWith('2'))
          ? 'tgnpdcl'
          : 'tgspdcl';
      const discom = getDiscomById(discomId);
      return {
        normalizedUsc: normalized,
        stateId: 'telangana',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.telangana.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `${normalized.length}-digit USC No matched Telangana (${discom.shortName})`,
        inbuiltProfile: null,
      };
    }

    if (normalized.length >= 5 && normalized.length <= 7) {
      const discom = getDiscomById('ced');
      return {
        normalizedUsc: normalized,
        stateId: 'chandigarh',
        stateName: discom.stateName,
        discom,
        category: 'domestic',
        tariffRate: STATE_GRID_DATABASE.chandigarh.tariffs.domestic.rate,
        confidence: 'format_length',
        matchReason: `${normalized.length}-digit USC/Account No matched Chandigarh CED`,
        inbuiltProfile: null,
      };
    }
  }

  // 4. Fallback to selected state filter
  const fallbackState: FourStateId = preferredStateId || 'telangana';
  const discom = getDefaultDiscomForState(fallbackState);
  return {
    normalizedUsc: normalized,
    stateId: fallbackState,
    stateName: discom.stateName,
    discom,
    category: 'domestic',
    tariffRate: STATE_GRID_DATABASE[fallbackState].tariffs.domestic.rate,
    confidence: 'state_fallback',
    matchReason: normalized
      ? `Mapped under ${discom.stateName} (${discom.shortName}) portal`
      : `Select a state or enter USC Number`,
    inbuiltProfile: null,
  };
  };

  return attachType(resolveCore());
}

/**
 * Generates a seasonal 12-month or 24-month billing ledger anchored to the searching month
 * using exact state DISCOM tariff slabs.
 */
export function buildStateSeasonal12MonthTemplate(
  uscNumber: string,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  anchorMonthlyUnits = 420,
  sanctionedLoadKw = 4,
  referenceDate: Date = new Date(),
  monthCount: 12 | 13 | 24 = 13,
  anchorYearMonth?: string
): MonthlyBillRecord[] {
  const safeBase = Math.max(80, Math.round(anchorMonthlyUnits));
  const seed = uscNumber
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return build12MonthSeries(
    safeBase,
    stateId,
    category,
    sanctionedLoadKw,
    seed,
    referenceDate,
    monthCount,
    anchorYearMonth
  );
}

/**
 * Ensures any 12, 13, or 24-month array is cleanly aligned onto exact (year, calendarMonth0) slots
 * without cross-year month corruption (e.g. never copying Nov 2025 into Nov 2026).
 */
export function alignRecordsToRolling12Months(
  records: MonthlyBillRecord[],
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  referenceDate: Date = new Date(),
  monthCountOverride?: 12 | 13 | 24,
  anchorYearMonth?: string
): MonthlyBillRecord[] {
  // Preserve 12-24 continuous verified months returned by official portals when not forcing 24-month padding
  if (
    records.length >= 12 &&
    records.length <= 24 &&
    monthCountOverride !== 24 &&
    records.every((r) => Boolean(r.month) && typeof r.year === 'number' && typeof r.calendarMonth0 === 'number')
  ) {
    return records;
  }

  const effectiveCount: 12 | 13 | 24 =
    monthCountOverride || (records.length > 13 ? 24 : 13);
  const slots = getRollingMonths(effectiveCount, referenceDate, anchorYearMonth);

  const alreadyAligned =
    records.length === slots.length &&
    records[0]?.month === slots[0].month &&
    records[records.length - 1]?.month === slots[slots.length - 1].month;

  if (alreadyAligned) return records;

  const byFullMonth = new Map<string, MonthlyBillRecord>();
  const byYearMonthKey = new Map<string, MonthlyBillRecord>();
  for (const r of records) {
    if (r.month) {
      byFullMonth.set(r.month.trim().toLowerCase(), r);
    }
    if (typeof r.year === 'number' && typeof r.calendarMonth0 === 'number') {
      byYearMonthKey.set(`${r.year}-${r.calendarMonth0}`, r);
    }
  }

  const hasVerifiedRows = records.some((r) => r.isVerifiedPortalData);

  return slots.map((slot, idx) => {
    const matched =
      byYearMonthKey.get(`${slot.year}-${slot.calendarMonth0}`) ||
      byFullMonth.get(slot.month.toLowerCase()) ||
      (records.length === slots.length ? records[idx] : undefined);
    const unitsKwh = matched ? Math.max(0, Math.round(matched.unitsKwh)) : 0;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const billAmountInr =
      matched && matched.billAmountInr > 0
        ? round2(matched.billAmountInr)
        : !hasVerifiedRows && unitsKwh > 0
        ? computeExactDiscomBill(unitsKwh, stateId, category)
        : 0;

    return {
      month: slot.month,
      shortLabel: slot.shortLabel,
      calendarMonth0: slot.calendarMonth0,
      year: slot.year,
      sequenceNo: slot.sequenceNo,
      isRunningMonth: slot.isRunningMonth,
      isVerifiedPortalData: Boolean(matched?.isVerifiedPortalData),
      unitsKwh,
      billAmountInr,
      ...(typeof matched?.demandInr === 'number' ? { demandInr: matched.demandInr } : {}),
      ...(typeof matched?.paidInr === 'number' ? { paidInr: matched.paidInr } : {}),
      ...(typeof matched?.openingBalanceInr === 'number'
        ? { openingBalanceInr: matched.openingBalanceInr }
        : {}),
      ...(typeof matched?.closingBalanceInr === 'number'
        ? { closingBalanceInr: matched.closingBalanceInr }
        : {}),
      ...(typeof matched?.adjustmentInr === 'number'
        ? { adjustmentInr: matched.adjustmentInr }
        : {}),
      ...(matched?.receiptNo ? { receiptNo: matched.receiptNo } : {}),
      ...(matched?.paidDate ? { paidDate: matched.paidDate } : {}),
    };
  });
}

/**
 * Parses pasted 12-month or 24-month bill rows from any DISCOM portal table and maps them
 * onto the rolling window ending at the selected searching month.
 */
function extractPastedMonthYear(raw: string): { month0?: number; year?: number; label?: string } {
  const mIdx = MONTH_NAMES.findIndex((m) =>
    new RegExp(`\\b${m}[a-z]*\\b`, 'i').test(raw)
  );
  if (mIdx >= 0) {
    // Match explicit 4-digit year first, or 2-digit year right after month name (never leading day digits like 02-Nov-26)
    const fourYr = raw.match(/\b(20\d{2})\b/);
    const afterMonthYr = raw.match(
      new RegExp(`\\b${MONTH_NAMES[mIdx]}[a-z]*[\\s\\-/']*'?(\\d{2})\\b`, 'i')
    );
    const apostropheYr = raw.match(/'(\d{2})\b/);
    const yrRaw = fourYr?.[1] || afterMonthYr?.[1] || apostropheYr?.[1];
    let year: number | undefined;
    if (yrRaw) {
      const yNum = parseInt(yrRaw, 10);
      if (yNum >= 20 && yNum <= 35) year = 2000 + yNum;
      else if (yNum >= 2015 && yNum <= 2035) year = yNum;
    }
    return {
      month0: mIdx,
      year,
      label: year ? `${MONTH_NAMES[mIdx]} ${year}` : MONTH_NAMES[mIdx],
    };
  }
  const ymd = raw.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  if (ymd) {
    const m = parseInt(ymd[2], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(ymd[1], 10) };
  }
  const mdy = raw.match(/\b(\d{1,2})[-/](20\d{2})\b/);
  if (mdy) {
    const m = parseInt(mdy[1], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(mdy[2], 10) };
  }
  return {};
}

export function parsePasted12MonthBills(
  rawText: string,
  stateId: FourStateId,
  category: GridCategory = 'domestic',
  referenceDate: Date = new Date(),
  monthCount: 12 | 13 | 24 = 13,
  anchorYearMonth?: string
): MonthlyBillRecord[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const maxRows: 12 | 13 | 24 =
    lines.length > 13 || monthCount === 24 ? 24 : monthCount === 13 || lines.length === 13 ? 13 : 12;
  const slots = getRollingMonths(maxRows, referenceDate, anchorYearMonth);
  const extracted: {
    month0?: number;
    year?: number;
    label?: string;
    unitsKwh: number;
    billAmountInr: number;
  }[] = [];

  for (let i = 0; i < lines.length && extracted.length < maxRows; i++) {
    const line = lines[i];
    // Skip column header rows like "S.No | Month | Units | Bill Amount"
    if (/^\s*(s\.?no|sl|month|period|bill\s*date|units|kwh|amount)/i.test(line) && !/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(line)) {
      continue;
    }

    const parsedMY = extractPastedMonthYear(line);

    // Explicitly check for currency-marked bill amount first
    const currencyMatch = line.match(/(?:₹|Rs\.?|INR)\s*([\d,]+(?:\.\d+)?)/i);
    const taggedBillAmt = currencyMatch
      ? Math.round(parseFloat(currencyMatch[1].replace(/,/g, '')))
      : 0;

    // Strip leading serial index, full dates (DD-MM-YYYY / YYYY-MM-DD / MM-YYYY), and year numbers
    const sanitized = line
      .replace(/^\s*\d{1,2}[.)]\s+/, ' ')
      .replace(/\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/g, ' ')
      .replace(/\b20\d{2}[-/]\d{1,2}[-/]\d{1,2}\b/g, ' ')
      .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/'']*('?\d{2,4})?\b/gi, ' ')
      .replace(/\b(?:20\d{2}|0?[1-9]\/20\d{2})\b/g, ' ')
      .replace(/(\d),(\d)/g, '$1$2');

    let nums = (sanitized.match(/\d+(?:\.\d+)?/g) || []).map((n) => parseFloat(n));
    if (nums.length === 0) continue;

    // Drop leading serial column number (1..24) if 3+ numbers remain and first is small integer
    if (nums.length >= 3 && Number.isInteger(nums[0]) && nums[0] >= 1 && nums[0] <= 24) {
      nums = nums.slice(1);
    }

    // Detect meter-reading pairs (Opening, Closing, Units, Bill) where close - open ~= units
    if (nums.length >= 3) {
      const openRdg = nums[0];
      const closeRdg = nums[1];
      const third = nums[2];
      if (closeRdg >= openRdg && Math.abs((closeRdg - openRdg) - third) <= 2) {
        nums = nums.slice(2);
      }
    }

    const unitsKwh = Math.max(0, Math.round(nums[0]));
    let billAmountInr = 0;
    if (taggedBillAmt > 0 && taggedBillAmt !== unitsKwh) {
      billAmountInr = taggedBillAmt;
    } else if (nums.length >= 2) {
      billAmountInr = Math.max(0, Math.round(nums[nums.length - 1]));
    } else {
      billAmountInr = computeExactDiscomBill(unitsKwh, stateId, category);
    }

    if (unitsKwh <= 0 && billAmountInr <= 0) continue;
    extracted.push({
      month0: parsedMY.month0,
      year: parsedMY.year,
      label: parsedMY.label,
      unitsKwh,
      billAmountInr,
    });
  }

  if (extracted.length === 0) return [];

  const slotMap = new Map<number, { unitsKwh: number; billAmountInr: number }>();

  // 1. Match rows with explicit month/year tokens to their exact rolling window slot
  const unmatched: typeof extracted = [];
  for (const item of extracted) {
    if (typeof item.month0 === 'number') {
      const idx = slots.findIndex(
        (s) =>
          s.calendarMonth0 === item.month0 &&
          (item.year === undefined || s.year === item.year) &&
          !slotMap.has(slots.indexOf(s))
      );
      if (idx >= 0) {
        slotMap.set(idx, { unitsKwh: item.unitsKwh, billAmountInr: item.billAmountInr });
        continue;
      }
    }
    unmatched.push(item);
  }

  // 2. Align remaining rows chronologically ending at last slot
  if (unmatched.length > 0) {
    const remainingSlotIndices = slots.map((_, i) => i).filter((i) => !slotMap.has(i));
    const lastSlotMonth = MONTH_NAMES[slots[slots.length - 1].calendarMonth0].toLowerCase();
    const firstIsLatest =
      unmatched.length > 1 &&
      unmatched[0].label?.toLowerCase().startsWith(lastSlotMonth) &&
      !unmatched[unmatched.length - 1].label?.toLowerCase().startsWith(lastSlotMonth);
    const ordered = firstIsLatest ? [...unmatched].reverse() : unmatched;
    const startOffset = Math.max(0, remainingSlotIndices.length - ordered.length);
    ordered.forEach((item, idx) => {
      const targetIdx = remainingSlotIndices[startOffset + idx];
      if (targetIdx !== undefined) {
        slotMap.set(targetIdx, { unitsKwh: item.unitsKwh, billAmountInr: item.billAmountInr });
      }
    });
  }

  return slots.map((slot, idx) => {
    const row = slotMap.get(idx);
    const unitsKwh = row ? row.unitsKwh : 0;
    const billAmountInr = row ? row.billAmountInr : 0;
    return {
      month: slot.month,
      shortLabel: slot.shortLabel,
      calendarMonth0: slot.calendarMonth0,
      year: slot.year,
      sequenceNo: slot.sequenceNo,
      isRunningMonth: slot.isRunningMonth,
      isVerifiedPortalData: Boolean(row),
      unitsKwh,
      billAmountInr,
    };
  });
}
