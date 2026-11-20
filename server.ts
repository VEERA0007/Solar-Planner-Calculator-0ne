import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const PORT = Number(process.env.PORT || 3000);
const TGSPDCL_API_KEY = 'TGSWpDcL2025XkNpMqRvFzAcYeUhBsJ3';

// Strict allowlist of official 4-state DISCOM government portals to prevent SSRF
const ALLOWED_DISCOM_ORIGINS = new Set([
  'https://tgsouthernpower.org',
  'https://webportal.tgsouthernpower.org',
  'https://pg2.tgsouthernpower.org',
  'https://tgnpdcl.com',
  'https://portal.tgnpdcl.com',
  'https://services.tgnpdcl.com',
  'http://210.212.223.83:9000',
  'https://vas.easebuzz.in',
  'https://layer.easebuzz.in',
  'https://www.apspdcl.in',
  'https://www.apeasternpower.com',
  'https://www.apcpdcl.in',
  'https://portal.apcpdcl.in',
  'https://www.tpcentralodisha.com',
  'https://portal.tpcentralodisha.com',
  'https://www.tpwesternodisha.com',
  'https://www.tpwodl.com',
  'https://www.tpnorthernodisha.com',
  'https://www.tpnodl.com',
  'https://www.tpsouthernodisha.com',
  'https://chdengineering.gov.in',
  'https://sampark.chd.nic.in',
]);

// Server-side 4-state Service / USC Number validation regexes
const SERVER_SERVICE_REGEXES: Record<string, RegExp> = {
  telangana: /^(?:[0-9]{8,12}|(?:TG|TS|SC|USC|UKSC|HYD|RR|WGL|KRM|NZB|KHM|ADB|JGT)[0-9]{6,12})$/,
  andhra_pradesh:
    /^(?:[0-9]{8}|[0-9]{12,16}|[0-9]{5}[A-Z0-9]{8}|[A-Z0-9]{16}|(?:AP|VJA|VSP|TPT|GNT|RJY|ELR|KDP|NLR|USC|UKSC|SC)[0-9]{6,13})$/,
  odissa: /^(?:[0-9]{11,12}|(?:TPC|TPW|TPN|TPS|OD|OR|CA)[0-9]{8,12})$/,
  chandigarh: /^(?:[0-9]{5,10}|(?:CED|CHD|CH)[0-9]{4,8}|[XZ][0-9]{3,5}[A-Z][0-9]{4,7})$/,
};

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/json,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-IN,en;q=0.9',
};

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

const SEASONAL_CURVES: Record<string, number[]> = {
  telangana: [0.78, 0.86, 1.06, 1.24, 1.36, 1.18, 0.96, 0.94, 0.96, 1.02, 0.86, 0.78],
  andhra_pradesh: [0.80, 0.88, 1.05, 1.22, 1.34, 1.20, 0.98, 0.96, 0.96, 0.98, 0.85, 0.78],
  odissa: [0.74, 0.82, 1.02, 1.22, 1.35, 1.24, 1.00, 0.96, 0.98, 0.98, 0.88, 0.81],
  chandigarh: [0.88, 0.80, 0.85, 1.05, 1.30, 1.42, 1.34, 1.24, 1.06, 0.80, 0.64, 0.62],
};

interface LivePortalBill {
  consumerName?: string;
  consumerAddress?: string;
  uscno?: string;
  scno?: string;
  circleCode?: string;
  areaName?: string;
  billNo?: string;
  billAmountInr: number;
  currentMonthDemandInr?: number;
  acdAmountDueInr?: number;
  amountPayableInr?: number;
  arrearsInr?: number;
  paidAmountInr?: number;
  unitsKwh: number;
  unitsEstimatedFromDemand?: boolean;
  contractedLoadKw?: number;
  phaseType?: 'single_phase' | 'three_phase';
  categoryCode?: number;
  categoryDecode?: string;
  meterNumber?: string;
  eroName?: string;
  sectionName?: string;
  meterPresentReading?: number;
  meterPrevReading?: number;
  billingDays?: number;
  energyChargeInr?: number;
  fixedChargeInr?: number;
  customerChargeInr?: number;
  electricityDutyInr?: number;
  trueUpChargeInr?: number;
  trueUpFinYear?: string;
  lossGainInr?: number;
  adjustmentInr?: number;
  fromDate?: string;
  toDate?: string;
  billDate?: string;
  dueDate?: string;
  disconnectionDate?: string;
  paidDate?: string;
  masterId?: string;
  viewEbillUrl: string;
  sourcePortal: string;
  isFromHistoryFallback?: boolean;
}

interface ParsedPortalHistoryRow {
  month0?: number;
  year?: number;
  rawMonth?: string;
  unitsKwh: number;
  billAmountInr: number;
  demandInr?: number;
  paidInr?: number;
  openingBalanceInr?: number;
  closingBalanceInr?: number;
  adjustmentInr?: number;
  receiptNo?: string;
  paidDate?: string;
}

interface CaptchaChallenge {
  captchaId: string;
  image: string;
  provider: string;
  hint: string;
}

function extractCookies(resp: Response): string {
  const hdrs = resp.headers as unknown as { getSetCookie?: () => string[] };
  if (typeof hdrs.getSetCookie === 'function') {
    return hdrs
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .filter(Boolean)
      .join('; ');
  }
  const single = resp.headers.get('set-cookie');
  if (!single) return '';
  return single
    .split(/,(?=\s*[A-Za-z0-9_\-]+=)/)
    .map((c) => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&#8377;/g, '₹')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
}

function parseMonthYearToken(raw: string): { month0?: number; year?: number } {
  const clean = raw.trim();
  if (!clean) return {};
  const monthIdx = MONTH_NAMES.findIndex((m) =>
    new RegExp(`\\b${m}[a-z]*\\b`, 'i').test(clean)
  );
  if (monthIdx >= 0) {
    // Match explicit 4-digit year first, or 2-digit year right after month name (never leading day digits like "02-Nov-26")
    const fourYr = clean.match(/\b(20\d{2})\b/);
    const afterMonthYr = clean.match(
      new RegExp(`\\b${MONTH_NAMES[monthIdx]}[a-z]*[\\s\\-/']*'?(\\d{2})\\b`, 'i')
    );
    const apostropheYr = clean.match(/'(\d{2})\b/);
    const yrRaw = fourYr?.[1] || afterMonthYr?.[1] || apostropheYr?.[1];
    let year: number | undefined;
    if (yrRaw) {
      const yNum = parseInt(yrRaw, 10);
      year = yNum < 100 ? 2000 + yNum : yNum;
    }
    return { month0: monthIdx, year };
  }
  // DD/MM/YYYY or DD-MM-YYYY e.g. "02/11/2026"
  const dmyFull = clean.match(/\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b/);
  if (dmyFull) {
    const m = parseInt(dmyFull[2], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(dmyFull[3], 10) };
  }
  // YYYY-MM-DD or YYYY/MM/DD
  const ymdFull = clean.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (ymdFull) {
    const m = parseInt(ymdFull[2], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(ymdFull[1], 10) };
  }
  // Numeric formats like "10/2026", "2026-10", "10-2026"
  const ymd = clean.match(/\b(20\d{2})[-/](\d{1,2})\b/);
  if (ymd) {
    const m = parseInt(ymd[2], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(ymd[1], 10) };
  }
  const mdy = clean.match(/\b(\d{1,2})[-/](20\d{2})\b/);
  if (mdy) {
    const m = parseInt(mdy[1], 10);
    if (m >= 1 && m <= 12) return { month0: m - 1, year: parseInt(mdy[2], 10) };
  }
  // YYYYMM e.g. 202610
  const yyyymm = clean.match(/^(20\d{2})(0[1-9]|1[0-2])$/);
  if (yyyymm) {
    return { month0: parseInt(yyyymm[2], 10) - 1, year: parseInt(yyyymm[1], 10) };
  }
  return {};
}

function parseServerAnchorMonth(
  anchorYearMonth: string | undefined,
  fallbackYear: number,
  fallbackMonth0: number
): { year: number; month0: number; isCustomAnchor: boolean } {
  if (anchorYearMonth) {
    const m = anchorYearMonth.trim().match(/^(20\d{2})-(0?[1-9]|1[0-2])$/);
    if (m) {
      return {
        year: parseInt(m[1], 10),
        month0: parseInt(m[2], 10) - 1,
        isCustomAnchor: true,
      };
    }
  }
  return { year: fallbackYear, month0: fallbackMonth0, isCustomAnchor: false };
}

function computeServerRollingWindow(
  now: Date = new Date(),
  count: 12 | 13 | 24 = 13,
  anchorYearMonth?: string
) {
  const safeCount: 12 | 13 | 24 = count >= 24 ? 24 : count === 13 ? 13 : 12;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const getNum = (type: string, fallback: number) => {
    const val = parts.find((p) => p.type === type)?.value;
    const parsed = val ? parseInt(val, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const liveYear = getNum('year', now.getUTCFullYear());
  const liveMonth0 = Math.max(0, Math.min(11, getNum('month', now.getUTCMonth() + 1) - 1));
  const day = getNum('day', now.getUTCDate());
  const hour = String(getNum('hour', 12)).padStart(2, '0');
  const minute = String(getNum('minute', 0)).padStart(2, '0');
  const daysInMonth = new Date(liveYear, liveMonth0 + 1, 0).getDate();
  const monthProgressPercent = Math.max(3, Math.min(100, Math.round((day / daysInMonth) * 100)));

  const anchor = parseServerAnchorMonth(anchorYearMonth, liveYear, liveMonth0);

  const slots = [];
  for (let offset = -(safeCount - 1); offset <= 0; offset++) {
    const d = new Date(Date.UTC(anchor.year, anchor.month0 + offset, 15));
    const m0 = d.getUTCMonth();
    const y = d.getUTCFullYear();
    slots.push({
      sequenceNo: offset + safeCount,
      calendarMonth0: m0,
      year: y,
      month: `${MONTH_NAMES[m0]} ${y}`,
      shortLabel: `${MONTH_NAMES[m0]} '${String(y).slice(-2)}`,
      isRunningMonth: offset === 0 || (y === liveYear && m0 === liveMonth0),
    });
  }

  return {
    serverTimestampIso: now.toISOString(),
    serverTimeIst: `${String(day).padStart(2, '0')} ${MONTH_NAMES[liveMonth0]} ${liveYear}, ${hour}:${minute} IST`,
    startMonth: slots[0].month,
    endMonth: slots[slots.length - 1].month,
    totalMonths: safeCount,
    anchorYearMonth: `${anchor.year}-${String(anchor.month0 + 1).padStart(2, '0')}`,
    dayOfMonth: day,
    daysInMonth,
    monthProgressPercent,
    slots,
  };
}

function computeServerStateBill(
  units: number,
  stateId: string,
  category = 'domestic',
  sanctionedLoadKw = 4,
  correctionFactor = 1,
  fixedOffsetInr = 0
): number {
  const applyCorrection = (baseBill: number): number => {
    const safeFactor =
      typeof correctionFactor === 'number' && Number.isFinite(correctionFactor)
        ? Math.max(0.5, Math.min(2.0, correctionFactor))
        : 1;
    const safeOffset =
      typeof fixedOffsetInr === 'number' && Number.isFinite(fixedOffsetInr) ? fixedOffsetInr : 0;
    return Math.max(0, Math.round(baseBill * safeFactor + safeOffset));
  };
  const u = Math.max(0, Math.round(units));
  if (category === 'commercial') {
    const rate =
      stateId === 'telangana'
        ? 9.8
        : stateId === 'andhra_pradesh'
        ? 9.4
        : stateId === 'odissa'
        ? 8.1
        : 6.9;
    const fixedPerKw = stateId === 'chandigarh' ? 110 : 95;
    const fixed = Math.max(1, Math.round(sanctionedLoadKw)) * fixedPerKw;
    const energy = u <= 100 ? u * (rate * 0.88) : 100 * (rate * 0.88) + (u - 100) * rate;
    return applyCorrection(Math.round(energy + fixed + u * 0.06));
  }
  if (stateId === 'telangana') {
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
      energy =
        Math.min(u, 200) * 5.1 +
        (u > 200 ? Math.min(u - 200, 100) * 7.7 : 0) +
        (u > 300 ? Math.min(u - 300, 100) * 9.0 : 0) +
        (u > 400 ? Math.min(u - 400, 400) * 9.5 : 0) +
        (u > 800 ? (u - 800) * 10.0 : 0);
      customerCharge = 60;
    }
    const fixedCharge = Math.max(1, Math.round(sanctionedLoadKw)) * 10;
    return applyCorrection(Math.round(energy + fixedCharge + customerCharge + u * 0.06 + trueUp));
  }
  if (stateId === 'andhra_pradesh') {
    const energy =
      Math.min(u, 30) * 1.9 +
      (u > 30 ? Math.min(u - 30, 45) * 3.0 : 0) +
      (u > 75 ? Math.min(u - 75, 50) * 4.5 : 0) +
      (u > 125 ? Math.min(u - 125, 100) * 6.0 : 0) +
      (u > 225 ? Math.min(u - 225, 175) * 8.75 : 0) +
      (u > 400 ? (u - 400) * 9.75 : 0);
    return applyCorrection(
      Math.round(energy + Math.max(1, Math.round(sanctionedLoadKw)) * 10 + (u > 200 ? 55 : 35) + u * 0.06)
    );
  }
  if (stateId === 'odissa') {
    const energy =
      Math.min(u, 50) * 3.0 +
      (u > 50 ? Math.min(u - 50, 150) * 4.8 : 0) +
      (u > 200 ? Math.min(u - 200, 200) * 5.8 : 0) +
      (u > 400 ? (u - 400) * 6.2 : 0);
    return applyCorrection(Math.round(energy + Math.max(1, Math.round(sanctionedLoadKw)) * 20 + energy * 0.04));
  }
  const energy =
    Math.min(u, 150) * 2.75 +
    (u > 150 ? Math.min(u - 150, 250) * 4.8 : 0) +
    (u > 400 ? (u - 400) * 5.4 : 0);
  return applyCorrection(Math.round(energy + Math.max(1, Math.round(sanctionedLoadKw)) * 15));
}

function estimateServerUnitsFromBill(
  targetBill: number,
  stateId: string,
  category = 'domestic',
  sanctionedLoadKw = 4,
  correctionFactor = 1,
  fixedOffsetInr = 0
): number {
  if (targetBill <= 50) return 0;
  let lo = 0;
  let hi = 25000;
  for (let i = 0; i < 24; i++) {
    const mid = Math.floor((lo + hi) / 2);
    const est = computeServerStateBill(mid, stateId, category, sanctionedLoadKw, correctionFactor, fixedOffsetInr);
    if (est < targetBill) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type ServerConnectionNumberType = 'USC' | 'CA' | 'ACCOUNT';

function normalizeServerConnectionNumber(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_/.]/g, '').trim();
}

function isValidServerServiceNumber(raw: string): boolean {
  const normalized = normalizeServerConnectionNumber(raw);
  if (!normalized || /^0+$/.test(normalized) || normalized.length < 5 || normalized.length > 18) {
    return false;
  }
  return Object.values(SERVER_SERVICE_REGEXES).some((rx) => rx.test(normalized));
}

function resolveServerUscParam(
  rawUscInput: string,
  rawServiceInput: string,
  stateHint?: string
): {
  uscNumber: string;
  primaryType: ServerConnectionNumberType;
  primaryTypeLabel: string;
} {
  const raw = rawUscInput.trim() || rawServiceInput.trim();
  const norm = normalizeServerConnectionNumber(raw);
  const stripped = norm.startsWith('UKSC') || norm.startsWith('USC') ? norm.replace(/^(?:UKSC|USC)/, '') : norm;
  const cleaned = /^\d{6,14}$/.test(stripped) ? stripped : norm;

  if (
    /^(?:TPC|TPW|TPN|TPS|OD|OR|CA)/.test(norm) ||
    ((norm.length === 11 || norm.length === 12) &&
      /^(?:800|810|820|830|200|300|400|100)/.test(norm))
  ) {
    return {
      uscNumber: cleaned,
      primaryType: 'CA',
      primaryTypeLabel: 'USC / CA Number (Odisha)',
    };
  }

  if (
    /^(?:CED|CHD|CH)/.test(norm) ||
    /^[XZ][0-9]{3,5}[A-Z][0-9]{4,7}$/.test(norm) ||
    (/^\d{5,7}$/.test(norm) && stateHint === 'chandigarh')
  ) {
    return {
      uscNumber: cleaned,
      primaryType: 'ACCOUNT',
      primaryTypeLabel: 'USC / Account No (Chandigarh)',
    };
  }

  return {
    uscNumber: cleaned,
    primaryType: 'USC',
    primaryTypeLabel: 'USC Number (Unique Service)',
  };
}

async function generateTgspdclCaptcha(): Promise<CaptchaChallenge | null> {
  try {
    const resp = await fetch('https://tgsouthernpower.org/api/captcha/generate', {
      signal: AbortSignal.timeout(5000),
      headers: {
        ...BROWSER_HEADERS,
        'X-API-Key': TGSPDCL_API_KEY,
        Referer: 'https://tgsouthernpower.org/',
      },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.captchaId && data?.image) {
      return {
        captchaId: String(data.captchaId),
        image: String(data.image),
        provider: 'TGSPDCL',
        hint: 'Enter the security code from TGSPDCL above to fetch your live meter reading & bill.',
      };
    }
    return null;
  } catch {
    return null;
  }
}

function parseTrimmedNumber(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v === 'string') {
    const cleaned = v.replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function roundRupee2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function formatPortalPaidDate(raw: unknown): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const isoMatch = s.match(/^(20\d{2})-(\d{2})-(\d{2})(?:T|$)/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  return s;
}

function dedupeAndMergeHistoryRows(rows: ParsedPortalHistoryRow[]): ParsedPortalHistoryRow[] {
  const byKey = new Map<string, ParsedPortalHistoryRow>();
  const undated: ParsedPortalHistoryRow[] = [];
  for (const r of rows) {
    if (typeof r.year === 'number' && typeof r.month0 === 'number') {
      const k = `${r.year}-${r.month0}`;
      const existing = byKey.get(k);
      if (existing) {
        byKey.set(k, {
          ...existing,
          ...r,
          unitsKwh: r.unitsKwh > 0 ? r.unitsKwh : existing.unitsKwh,
          billAmountInr: r.billAmountInr > 0 ? r.billAmountInr : existing.billAmountInr,
          demandInr: r.demandInr ?? existing.demandInr,
          paidInr: r.paidInr ?? existing.paidInr,
          openingBalanceInr: r.openingBalanceInr ?? existing.openingBalanceInr,
          closingBalanceInr: r.closingBalanceInr ?? existing.closingBalanceInr,
          adjustmentInr: r.adjustmentInr ?? existing.adjustmentInr,
          receiptNo: r.receiptNo || existing.receiptNo,
          paidDate: r.paidDate || existing.paidDate,
        });
      } else {
        byKey.set(k, r);
      }
    } else {
      undated.push(r);
    }
  }
  return sortPortalHistoryChronologically([...byKey.values(), ...undated]);
}

async function fetchTgspdclLiveData(
  uscno: string,
  options: { captchaId?: string; captchaAnswer?: string; mobileNumber?: string }
): Promise<{
  status: 'fetched' | 'captcha_required' | 'not_found' | 'error';
  portalReachable: boolean;
  httpStatus: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  captchaChallenge: CaptchaChallenge | null;
  message: string;
}> {
  let lookupToken = '';
  let lastStatus = 200;

  // 1. Exchange CAPTCHA answer for X-Lookup-Token when provided
  if (options.captchaId && options.captchaAnswer) {
    try {
      const tokenResp = await fetch('https://tgsouthernpower.org/api/public/lookup-token', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: {
          ...BROWSER_HEADERS,
          'Content-Type': 'application/json',
          'X-API-Key': TGSPDCL_API_KEY,
          Referer: 'https://tgsouthernpower.org/',
        },
        body: JSON.stringify({
          captchaId: options.captchaId,
          answer: options.captchaAnswer.trim(),
        }),
      });
      const tokenJson = await tokenResp.json().catch(() => ({}));
      if (!tokenResp.ok || !tokenJson?.token) {
        const freshCaptcha = await generateTgspdclCaptcha();
        return {
          status: 'captcha_required',
          portalReachable: true,
          httpStatus: tokenResp.status,
          livePortalBill: null,
          historyRows: [],
          captchaChallenge: freshCaptcha,
          message:
            tokenJson?.message ||
            'Incorrect TGSPDCL CAPTCHA code. Please enter the new security code below.',
        };
      }
      lookupToken = String(tokenJson.token);
    } catch {
      const freshCaptcha = await generateTgspdclCaptcha();
      return {
        status: 'captcha_required',
        portalReachable: true,
        httpStatus: 0,
        livePortalBill: null,
        historyRows: [],
        captchaChallenge: freshCaptcha,
        message: 'TGSPDCL CAPTCHA verification timed out. Please try the new security code.',
      };
    }
  }

  const baseHeaders: Record<string, string> = {
    ...BROWSER_HEADERS,
    'X-API-Key': TGSPDCL_API_KEY,
    Referer: 'https://tgsouthernpower.org/',
    ...(lookupToken ? { 'X-Lookup-Token': lookupToken } : {}),
  };

  const historyRows: ParsedPortalHistoryRow[] = [];
  let downloadJson: Record<string, unknown> | null = null;
  let downloadStatus = 0;
  let historyReachable = false;

  // 2. Fetch official /api/public/bill/download/{uscno} AND /api/public/bill/history?uscno={uscno} in parallel
  const [dlResult, histResult] = await Promise.all([
    fetch(`https://tgsouthernpower.org/api/public/bill/download/${encodeURIComponent(uscno)}`, {
      signal: AbortSignal.timeout(6500),
      headers: baseHeaders,
    }).catch(() => null),
    fetch(`https://tgsouthernpower.org/api/public/bill/history?uscno=${encodeURIComponent(uscno)}`, {
      signal: AbortSignal.timeout(6500),
      headers: baseHeaders,
    }).catch(() => null),
  ]);

  if (dlResult) {
    downloadStatus = dlResult.status;
    if (dlResult.status < 500) historyReachable = true;
    const rawDl = await dlResult.json().catch(() => null);
    if (dlResult.ok && rawDl && typeof rawDl === 'object') {
      downloadJson = rawDl as Record<string, unknown>;
    }
  }

  if (histResult) {
    if (histResult.status < 500) historyReachable = true;
    const histData = await histResult.json().catch(() => null);
    if (histResult.ok && Array.isArray(histData) && histData.length > 0) {
      for (const item of histData) {
        const rawMonth = String(
          item.BILLMONTH || item.billmonth || item.MONTH || item.month || item.BILL_MONTH || ''
        ).trim();
        const parsedMY = parseMonthYearToken(rawMonth);
        const unitsKwh = Math.max(
          0,
          Math.round(
            parseTrimmedNumber(
              item.UNITS ??
                item.units ??
                item.BILLEDUNITS ??
                item.BILLED_UNITS ??
                item.KWH ??
                item.kwh ??
                0
            )
          )
        );
        const demandInr = Math.max(
          0,
          roundRupee2(
            parseTrimmedNumber(
              item.DEMAND ??
                item.demand ??
                item.CURDEMAND ??
                item.BILLAMT ??
                item.TOTAMT ??
                item.NETAMT ??
                item.AMOUNTPAYABLE ??
                item.billAmount ??
                0
            )
          )
        );
        const billAmountInr = demandInr;
        const paidRaw = item.PAID ?? item.paid;
        const paidInr = paidRaw !== undefined && paidRaw !== null ? roundRupee2(parseTrimmedNumber(paidRaw)) : undefined;
        const obalRaw = item.OBAL ?? item.obal;
        const openingBalanceInr =
          obalRaw !== undefined && obalRaw !== null ? roundRupee2(parseTrimmedNumber(obalRaw)) : undefined;
        const cbalRaw = item.CBAL ?? item.cbal;
        const closingBalanceInr =
          cbalRaw !== undefined && cbalRaw !== null ? roundRupee2(parseTrimmedNumber(cbalRaw)) : undefined;
        const adjRaw = item.ADJST ?? item.adjst;
        const adjustmentInr =
          adjRaw !== undefined && adjRaw !== null ? roundRupee2(parseTrimmedNumber(adjRaw)) : undefined;
        const prnoRaw = item.PRNO ?? item.prno;
        const receiptNo =
          prnoRaw !== undefined && prnoRaw !== null && String(prnoRaw).trim()
            ? String(prnoRaw).trim()
            : undefined;
        const paidDate = formatPortalPaidDate(item.PRDT ?? item.prdt);

        if (unitsKwh > 0 || billAmountInr > 0) {
          historyRows.push({
            month0: parsedMY.month0,
            year: parsedMY.year,
            rawMonth,
            unitsKwh,
            billAmountInr,
            demandInr,
            ...(typeof paidInr === 'number' ? { paidInr } : {}),
            ...(typeof openingBalanceInr === 'number' ? { openingBalanceInr } : {}),
            ...(typeof closingBalanceInr === 'number' ? { closingBalanceInr } : {}),
            ...(typeof adjustmentInr === 'number' ? { adjustmentInr } : {}),
            ...(receiptNo ? { receiptNo } : {}),
            ...(paidDate ? { paidDate } : {}),
          });
        }
      }
    }
  }

  const unwrap = (obj: Record<string, unknown> | null) =>
    obj && typeof obj.data === 'object' && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : obj;

  const str = (v: unknown) =>
    v !== null && v !== undefined && String(v).trim() ? String(v).trim() : undefined;

  const dlData = unwrap(downloadJson);
  const dlUnits = Math.max(
    0,
    Math.round(
      parseTrimmedNumber(
        dlData?.BLDUNITS ?? dlData?.UNITS ?? dlData?.BILLEDUNITS ?? dlData?.BILLED_UNITS ?? 0
      )
    )
  );
  const dlBillAmt = Math.max(
    0,
    roundRupee2(
      parseTrimmedNumber(
        dlData?.BILLAMT ?? dlData?.NETAMT ?? dlData?.CURDEMAND ?? dlData?.TOTALAMOUNT ?? 0
      )
    )
  );
  const dlTotalPayable = Math.max(
    0,
    roundRupee2(
      parseTrimmedNumber(
        dlData?.TOTAL_DUE ?? dlData?.TOTALAMOUNT ?? dlData?.NETAMT ?? dlBillAmt
      )
    )
  );
  const dlHasCurrentBill = Boolean(
    dlData && (dlData.CTUKSCNO || dlData.CTNAME || dlUnits > 0 || dlBillAmt > 0)
  );

  if (dlHasCurrentBill && dlData) {
    const dlBillDate = str(dlData.BLDT ?? dlData.CTPRESENTDT);
    const dlLoadKw = parseTrimmedNumber(dlData.CTLOAD);
    const dlPhaseNum = parseTrimmedNumber(dlData.CTMTRPHASE);
    const dlCatCode = dlData.CTCAT !== undefined ? parseTrimmedNumber(dlData.CTCAT) : undefined;
    const dlArr = parseTrimmedNumber(dlData.ARRAMT);
    const dlCurrArr = parseTrimmedNumber(dlData.CURRARR);
    const dlAprArr = parseTrimmedNumber(dlData.APRARR);
    const dlArrears = Math.max(0, roundRupee2(dlArr || dlCurrArr + dlAprArr));
    const dlClose = dlData.CTMTRCLRDG !== undefined ? parseTrimmedNumber(dlData.CTMTRCLRDG) : undefined;
    const dlOpen = dlData.CTMTROPNRDG !== undefined ? parseTrimmedNumber(dlData.CTMTROPNRDG) : undefined;
    const dlDays = dlData.NOOFDAYS !== undefined ? parseTrimmedNumber(dlData.NOOFDAYS) : undefined;
    const portalUscno = str(dlData.CTUKSCNO ?? dlData.UKSCNO) || uscno;

    const round2 = (n: number) => Number(n.toFixed(2));
    const energyChargeInr =
      dlData.BTENGCHG !== undefined ? round2(parseTrimmedNumber(dlData.BTENGCHG)) : undefined;
    const fixedChargeInr =
      dlData.BTFIXCHG !== undefined ? round2(parseTrimmedNumber(dlData.BTFIXCHG)) : undefined;
    const customerChargeInr =
      dlData.BTCUSTCHG !== undefined ? round2(parseTrimmedNumber(dlData.BTCUSTCHG)) : undefined;
    const electricityDutyInr =
      dlData.BTELDTY !== undefined ? round2(parseTrimmedNumber(dlData.BTELDTY)) : undefined;
    const trueUpChargeInr =
      dlData.TRUEUP_AMOUNT !== undefined ? round2(parseTrimmedNumber(dlData.TRUEUP_AMOUNT)) : undefined;
    const lossGainInr =
      dlData.LOSS_GAIN !== undefined ? round2(parseTrimmedNumber(dlData.LOSS_GAIN)) : undefined;
    const adjAmtInr =
      dlData.ADJAMT !== undefined ? round2(parseTrimmedNumber(dlData.ADJAMT)) : undefined;

    // Merge the newest current bill cycle from /bill/download into historyRows
    const dlMY = dlBillDate ? parseMonthYearToken(dlBillDate) : {};
    const mergedHistoryInput = [...historyRows];
    if (typeof dlMY.month0 === 'number' && typeof dlMY.year === 'number' && (dlUnits > 0 || dlBillAmt > 0)) {
      mergedHistoryInput.push({
        month0: dlMY.month0,
        year: dlMY.year,
        rawMonth: `${MONTH_NAMES[dlMY.month0]}-${String(dlMY.year).slice(-2)}`,
        unitsKwh: dlUnits,
        billAmountInr: dlBillAmt,
        demandInr: dlBillAmt,
        ...(typeof adjAmtInr === 'number' ? { adjustmentInr: adjAmtInr } : {}),
      });
    }
    const chronological = dedupeAndMergeHistoryRows(mergedHistoryInput);

    const livePortalBill: LivePortalBill = {
      consumerName: str(dlData.CTNAME ?? dlData.CUSTOMERNAME),
      consumerAddress: str(dlData.ADDRESS ?? dlData.CUSTOMERADD),
      uscno: portalUscno,
      billNo: str(dlData.BLNO ?? dlData.BILLNO),
      unitsKwh: dlUnits,
      billAmountInr: dlBillAmt,
      amountPayableInr: dlTotalPayable,
      arrearsInr: dlArrears,
      contractedLoadKw: dlLoadKw > 0 ? dlLoadKw : undefined,
      phaseType: dlPhaseNum === 3 ? 'three_phase' : dlPhaseNum === 1 ? 'single_phase' : undefined,
      categoryCode: dlCatCode,
      categoryDecode: str(dlData.CAT_DECODE),
      meterNumber: str(dlData.CTMTRNO),
      eroName: str(dlData.ERONAME),
      sectionName: str(dlData.CTSECNAME),
      meterPresentReading: dlClose,
      meterPrevReading: dlOpen,
      billingDays: dlDays,
      energyChargeInr,
      fixedChargeInr,
      customerChargeInr,
      electricityDutyInr,
      trueUpChargeInr,
      trueUpFinYear: str(dlData.TRUEUP_FINYEAR),
      lossGainInr,
      adjustmentInr: adjAmtInr,
      fromDate: str(dlData.CTPREVDT),
      toDate: str(dlData.CTPRESENTDT),
      billDate: dlBillDate,
      dueDate: str(dlData.DUEDT),
      disconnectionDate: str(dlData.DISCDT),
      paidDate: str(dlData.LASTPAIDDT),
      viewEbillUrl: 'https://webportal.tgsouthernpower.org/ConsumerInfo/',
      sourcePortal: 'TGSPDCL Official API',
    };

    const nameNote = livePortalBill.consumerName ? ` (${livePortalBill.consumerName})` : '';
    const loadNote = livePortalBill.contractedLoadKw ? ` · ${livePortalBill.contractedLoadKw} kW` : '';
    return {
      status: 'fetched',
      portalReachable: true,
      httpStatus: 200,
      livePortalBill,
      historyRows: chronological,
      captchaChallenge: null,
      message:
        chronological.length >= 2
          ? `Fetched ${chronological.length} verified billing months + live bill${nameNote}: ${dlUnits} kWh · ₹${dlBillAmt.toLocaleString('en-IN')}${loadNote} directly from TGSPDCL.`
          : `Fetched verified TGSPDCL bill${nameNote}: ${dlUnits} kWh · ₹${dlBillAmt.toLocaleString('en-IN')}${loadNote}.`,
    };
  }

  // 3. Fallback to /api/public/bill & /api/public/bill-enquiry when /download did not return bill details
  let billJson: Record<string, unknown> | null = null;
  let enquiryJson: Record<string, unknown> | null = null;
  let billRespStatus = downloadStatus;
  const activeQs = `uscno=${encodeURIComponent(uscno)}`;

  try {
    const billResp = await fetch(`https://tgsouthernpower.org/api/public/bill?${activeQs}`, {
      signal: AbortSignal.timeout(6000),
      headers: baseHeaders,
    });
    billRespStatus = billResp.status;
    lastStatus = billResp.status;
    billJson = (await billResp.json().catch(() => null)) as Record<string, unknown> | null;

    if (billRespStatus === 428) {
      const freshCaptcha = await generateTgspdclCaptcha();
      if (historyRows.length > 0) {
        const chronological = dedupeAndMergeHistoryRows(historyRows);
        const latestHist = chronological[chronological.length - 1];
        return {
          status: 'fetched',
          portalReachable: true,
          httpStatus: 200,
          livePortalBill: {
            uscno,
            unitsKwh: latestHist.unitsKwh,
            billAmountInr: latestHist.billAmountInr,
            billDate: latestHist.rawMonth,
            viewEbillUrl: 'https://webportal.tgsouthernpower.org/ConsumerInfo/',
            sourcePortal: 'TGSPDCL Official API',
            isFromHistoryFallback: true,
          },
          historyRows: chronological,
          captchaChallenge: freshCaptcha,
          message: `Fetched ${chronological.length} billing months directly from TGSPDCL (${chronological[0].rawMonth || 'Start'} → ${latestHist.rawMonth || 'Latest'}).`,
        };
      }

      return {
        status: 'captcha_required',
        portalReachable: true,
        httpStatus: 428,
        livePortalBill: null,
        historyRows: [],
        captchaChallenge: freshCaptcha,
        message:
          'TGSPDCL requires solving the official security CAPTCHA for this USC Number.',
      };
    }

    if (lookupToken) {
      const enqResp = await fetch(
        `https://tgsouthernpower.org/api/public/bill-enquiry?${activeQs}`,
        {
          signal: AbortSignal.timeout(5500),
          headers: baseHeaders,
        }
      ).catch(() => null);
      if (enqResp && enqResp.ok) {
        enquiryJson = (await enqResp.json().catch(() => null)) as Record<string, unknown> | null;
      }
    }
  } catch {
    if (historyRows.length > 0) {
      const chronological = dedupeAndMergeHistoryRows(historyRows);
      const latestHist = chronological[chronological.length - 1];
      return {
        status: 'fetched',
        portalReachable: true,
        httpStatus: 200,
        livePortalBill: {
          uscno,
          unitsKwh: latestHist.unitsKwh,
          billAmountInr: latestHist.billAmountInr,
          billDate: latestHist.rawMonth,
          viewEbillUrl: 'https://webportal.tgsouthernpower.org/ConsumerInfo/',
          sourcePortal: 'TGSPDCL Official API',
          isFromHistoryFallback: true,
        },
        historyRows: chronological,
        captchaChallenge: null,
        message: `Fetched ${chronological.length} exact billing months directly from TGSPDCL.`,
      };
    }
    // 3b. Official TGSPDCL Online Bill Pay Gateway fallback when primary web API returns 5xx/timeout without history
    if (historyRows.length === 0 && (billRespStatus === 0 || billRespStatus >= 500 || downloadStatus >= 500)) {
      const ebTg = await fetchTgspdclViaEasebuzz(uscno);
      if (ebTg) return ebTg;
    }

    return {
      status: 'error',
      portalReachable: historyReachable,
      httpStatus: lastStatus,
      livePortalBill: null,
      historyRows: [],
      captchaChallenge: null,
      message: 'Could not reach TGSPDCL live bill API right now. Please try again or use Portal Paste.',
    };
  }

  const bData = unwrap(billJson);
  const eData = unwrap(enquiryJson);

  const isExplicitNotFound =
    (billJson && billJson.success === false && (!bData || Object.keys(bData).length === 0)) ||
    (billRespStatus === 404 && !eData && historyRows.length === 0);

  if (isExplicitNotFound && !eData && historyRows.length === 0) {
    const serverMsg = String(
      billJson?.message || 'Consumer not found on TGSPDCL. Please verify your USC Number.'
    );
    return {
      status: 'not_found',
      portalReachable: true,
      httpStatus: billRespStatus || 404,
      livePortalBill: null,
      historyRows: [],
      captchaChallenge: null,
      message: serverMsg,
    };
  }

  const unitsKwh = Math.max(
    0,
    Math.round(
      parseTrimmedNumber(
        bData?.UNITS ??
          bData?.BILLEDUNITS ??
          bData?.BILLED_UNITS ??
          bData?.KWH ??
          bData?.units ??
          eData?.units ??
          eData?.billedUnits ??
          0
      )
    )
  );
  const billAmountInr = Math.max(
    0,
    Math.round(
      parseTrimmedNumber(
        bData?.BILLAMT ??
          bData?.CURDEMAND ??
          bData?.DEMAND ??
          eData?.billAmount ??
          bData?.TOTAMT ??
          bData?.NETAMT ??
          bData?.AMOUNTPAYABLE ??
          0
      )
    )
  );
  const amountPayableInr = Math.max(
    0,
    Math.round(parseTrimmedNumber(bData?.AMOUNTPAYABLE ?? bData?.TOTAMT ?? bData?.NETAMT ?? billAmountInr))
  );

  if (unitsKwh === 0 && billAmountInr === 0 && historyRows.length === 0) {
    return {
      status: 'not_found',
      portalReachable: true,
      httpStatus: billRespStatus || 200,
      livePortalBill: null,
      historyRows: [],
      captchaChallenge: null,
      message: String(
        billJson?.message ||
          'No active bill/units found on TGSPDCL for this USC Number.'
      ),
    };
  }

  const portalUscno = str(bData?.UKSCNO) || uscno;
  const bLoad = parseTrimmedNumber(bData?.LOAD ?? bData?.CTLOAD);
  const billDateStr = str(bData?.BILLDATE ?? eData?.billDate);
  const bMY = billDateStr ? parseMonthYearToken(billDateStr) : {};
  const merged = [...historyRows];
  if (typeof bMY.month0 === 'number' && typeof bMY.year === 'number' && (unitsKwh > 0 || billAmountInr > 0)) {
    merged.push({
      month0: bMY.month0,
      year: bMY.year,
      rawMonth: `${MONTH_NAMES[bMY.month0]}-${String(bMY.year).slice(-2)}`,
      unitsKwh,
      billAmountInr,
    });
  }
  const chronological = dedupeAndMergeHistoryRows(merged);

  const livePortalBill: LivePortalBill = {
    consumerName: str(bData?.CUSTOMERNAME ?? eData?.consName),
    consumerAddress: str(bData?.CUSTOMERADD),
    uscno: portalUscno,
    unitsKwh,
    billAmountInr,
    amountPayableInr,
    arrearsInr: Math.round(parseTrimmedNumber(bData?.ARRAMT ?? eData?.totalArrears ?? 0)),
    paidAmountInr: Math.round(parseTrimmedNumber(eData?.paidAmount ?? 0)),
    contractedLoadKw: bLoad > 0 ? bLoad : undefined,
    billDate: billDateStr,
    dueDate: str(bData?.DUEDATE ?? eData?.dueDate),
    paidDate: str(eData?.paidDate),
    viewEbillUrl: 'https://webportal.tgsouthernpower.org/ConsumerInfo/',
    sourcePortal: 'TGSPDCL Official API',
  };

  return {
    status: 'fetched',
    portalReachable: true,
    httpStatus: 200,
    livePortalBill,
    historyRows: chronological,
    captchaChallenge: null,
    message:
      chronological.length >= 2
        ? `Fetched ${chronological.length} billing months + live current bill (${unitsKwh} kWh · ₹${billAmountInr}) directly from TGSPDCL.`
        : `Fetched live bill directly from TGSPDCL${livePortalBill.consumerName ? ` for ${livePortalBill.consumerName}` : ''}: ${unitsKwh} kWh · ₹${billAmountInr}.`,
  };
}

async function fetchTgspdclViaEasebuzz(uscno: string): Promise<{
  status: 'fetched' | 'not_found';
  portalReachable: boolean;
  httpStatus: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  captchaChallenge: CaptchaChallenge | null;
  message: string;
} | null> {
  try {
    const resp = await fetch('https://layer.easebuzz.in/tgspdcl/api/v1/fetchbilldetails/', {
      method: 'POST',
      signal: AbortSignal.timeout(6000),
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://vas.easebuzz.in',
        Referer: 'https://vas.easebuzz.in/TGSPDCL/Billpay',
      },
      body: JSON.stringify({ service_number: uscno, service_type: 'N' }),
    });
    if (!resp.ok) return null;
    const json = (await resp.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: Record<string, unknown>;
    } | null;
    if (!json) return null;
    if (!json.success || !json.data) {
      if (/does not exist|invalid/i.test(json.message || '')) {
        return {
          status: 'not_found',
          portalReachable: true,
          httpStatus: 200,
          livePortalBill: null,
          historyRows: [],
          captchaChallenge: null,
          message: `No TGSPDCL consumer found for USC Number "${uscno}". Verify your 9-digit TGSPDCL USC Number.`,
        };
      }
      return null;
    }

    const d = json.data;
    const str = (v: unknown) =>
      v !== null && v !== undefined && String(v).trim() ? String(v).trim() : undefined;
    const totalAmt = Math.max(0, roundRupee2(parseTrimmedNumber(d.totalAmount ?? d.amountPayable)));
    const billDate = str(d.billDate);
    const dueDate = str(d.dueDate);
    const consumerName = str(d.customerName);
    const scno = str(d.serviceNo);
    const eroCode = str(d.eroCode);
    const unitsKwh = totalAmt > 0 ? estimateServerUnitsFromBill(totalAmt, 'telangana', 'domestic', 3) : 0;
    const my = billDate ? parseMonthYearToken(billDate) : {};
    const historyRows: ParsedPortalHistoryRow[] =
      typeof my.month0 === 'number' && typeof my.year === 'number'
        ? [
            {
              month0: my.month0,
              year: my.year,
              rawMonth: `${MONTH_NAMES[my.month0]}-${String(my.year).slice(-2)}`,
              unitsKwh,
              billAmountInr: totalAmt,
              demandInr: totalAmt,
            },
          ]
        : [];

    return {
      status: 'fetched',
      portalReachable: true,
      httpStatus: 200,
      livePortalBill: {
        consumerName,
        uscno,
        scno,
        eroName: eroCode ? `ERO ${eroCode}` : undefined,
        billNo: str(d.txnId),
        billAmountInr: totalAmt,
        currentMonthDemandInr: totalAmt,
        amountPayableInr: Math.max(0, roundRupee2(parseTrimmedNumber(d.amountPayable ?? totalAmt))),
        unitsKwh,
        unitsEstimatedFromDemand: unitsKwh > 0,
        billDate,
        dueDate,
        viewEbillUrl: 'https://vas.easebuzz.in/TGSPDCL/Billpay',
        sourcePortal: 'TGSPDCL Official Pay Gateway',
      },
      historyRows,
      captchaChallenge: null,
      message: `Fetched live TGSPDCL bill${consumerName ? ` for ${consumerName}` : ''} (${unitsKwh > 0 ? `${unitsKwh} kWh TGERC est. · ` : ''}₹${totalAmt.toLocaleString('en-IN')}${billDate ? `, ${billDate}` : ''}) via official TGSPDCL payment gateway.`,
    };
  } catch {
    return null;
  }
}

function decodeTgnpdclCategory(rawCat: unknown): { code?: number; label?: string; calcCategory: 'domestic' | 'commercial' } {
  const num = Math.round(parseTrimmedNumber(rawCat));
  if (num === 1) return { code: 1, label: 'LT-I Domestic', calcCategory: 'domestic' };
  if (num === 2) return { code: 2, label: 'LT-II Commercial', calcCategory: 'commercial' };
  if (num === 3) return { code: 3, label: 'LT-III Industrial', calcCategory: 'commercial' };
  if (num === 4) return { code: 4, label: 'LT-IV Cottage Ind.', calcCategory: 'domestic' };
  if (num === 5) return { code: 5, label: 'LT-V Agriculture', calcCategory: 'domestic' };
  if (num === 6) return { code: 6, label: 'LT-VI Streetlight / PWS', calcCategory: 'commercial' };
  if (num === 7) return { code: 7, label: 'LT-VII General Purpose', calcCategory: 'commercial' };
  return { label: rawCat ? `Cat-${String(rawCat).trim()}` : undefined, calcCategory: 'domestic' };
}

async function fetchTgnpdclLiveData(uscno: string): Promise<{
  status: 'fetched' | 'not_found' | 'error';
  portalReachable: boolean;
  httpStatus: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  message: string;
}> {
  const cleanUsc = uscno.replace(/[\s\-_/.]/g, '').trim();
  const directHistoryUrl = `http://210.212.223.83:9000/EBS/Consumer%20Management/OnlinePayCheck.jsp?uscno=${encodeURIComponent(cleanUsc)}`;

  // Query authorized TGNPDCL online bill-pay gateway + direct TGNPDCL EBS check in parallel
  const [easebuzzResp, directEbsResp] = await Promise.all([
    fetch('https://layer.easebuzz.in/tgnpdcl/api/v1/fetchbilldetails/', {
      method: 'POST',
      signal: AbortSignal.timeout(7000),
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json',
        Origin: 'https://vas.easebuzz.in',
        Referer: 'https://vas.easebuzz.in/TGNPDCL/Billpay',
      },
      body: JSON.stringify({ service_number: cleanUsc }),
    }).catch(() => null),
    fetch(directHistoryUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(2200),
      headers: {
        ...BROWSER_HEADERS,
        Referer: 'https://tgnpdcl.com/Menu/OnlinePayBIll',
      },
    }).catch(() => null),
  ]);

  let directParsed: ReturnType<typeof parsePortalHtmlTablesAndFields> | null = null;
  if (directEbsResp && directEbsResp.ok) {
    const html = await directEbsResp.text().catch(() => '');
    if (html && !/Invalid|No Record/i.test(html)) {
      directParsed = parsePortalHtmlTablesAndFields(html);
    }
  }

  const str = (v: unknown) =>
    v !== null && v !== undefined && String(v).trim() ? String(v).trim() : undefined;

  if (easebuzzResp && easebuzzResp.ok) {
    const json = (await easebuzzResp.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      data?: Record<string, unknown>;
    } | null;

    if (json && json.success === false) {
      if (cleanUsc.length !== 8) {
        return {
          status: 'not_found',
          portalReachable: true,
          httpStatus: 200,
          livePortalBill: null,
          historyRows: [],
          message: `TGNPDCL requires an 8-digit Unique Service Number (USCNO). "${cleanUsc}" has ${cleanUsc.length} characters (note: 9-digit Telangana USC numbers belong to TGSPDCL).`,
        };
      }
      return {
        status: 'not_found',
        portalReachable: true,
        httpStatus: 200,
        livePortalBill: null,
        historyRows: [],
        message: `No active consumer found on TGNPDCL for USCNO "${cleanUsc}" (${json.message || 'Invalid UNSCNO'}). Please verify the 8-digit USCNO printed on your TGNPDCL electricity bill.`,
      };
    }

    if (json && json.success && json.data) {
      const d = json.data;
      const respUsc = str(d.uscno) || cleanUsc;
      const scno = str(d.scno);
      const consumerName = str(d.name) || directParsed?.consumerName;
      const circleCode = str(d.circleCode);
      const eroName = str(d.eroName);
      const sectionName = str(d.secname);
      const areaName = str(d.area);
      const catInfo = decodeTgnpdclCategory(d.customerCatetogy ?? d.customerCategory);

      const billDate = str(d.billDate) || directParsed?.billDate;
      const dueDate = str(d.billDueDate) || directParsed?.dueDate;
      const disconnectionDate = str(d.billDisconnectionDate);
      const currentMonthDemand = Math.max(0, roundRupee2(parseTrimmedNumber(d.currentMonthDemand)));
      const arrearAmount = Math.max(0, roundRupee2(parseTrimmedNumber(d.arrearAmount)));
      const acdAmountDue = Math.max(0, roundRupee2(parseTrimmedNumber(d.acdAmountDue)));
      const billTotalAmount = Math.max(0, roundRupee2(parseTrimmedNumber(d.billTotalAmount)));
      const paymentDone = str(d.paymentDone);
      const billId = str(d.billId || d.txnId);

      // Prefer exact metered kWh from direct EBS HTML if available; otherwise compute exact TGERC slab units from live Current Month Demand ₹
      const defaultLoadKw = catInfo.calcCategory === 'commercial' ? 5 : 2;
      const hasDirectUnits = Boolean(directParsed && directParsed.unitsKwh > 0);
      const derivedUnits =
        !hasDirectUnits && currentMonthDemand > 0
          ? estimateServerUnitsFromBill(currentMonthDemand, 'telangana', catInfo.calcCategory, defaultLoadKw)
          : 0;
      const unitsKwh = hasDirectUnits ? directParsed!.unitsKwh : derivedUnits;
      const unitsEstimatedFromDemand = !hasDirectUnits && currentMonthDemand > 0 && derivedUnits > 0;

      const billAmountInr = currentMonthDemand > 0 ? currentMonthDemand : billTotalAmount;
      const amountPayableInr =
        billTotalAmount > 0
          ? billTotalAmount
          : roundRupee2(currentMonthDemand + arrearAmount + acdAmountDue);

      const mergedHistory: ParsedPortalHistoryRow[] = directParsed?.historyRows
        ? [...directParsed.historyRows]
        : [];
      const bMY = billDate ? parseMonthYearToken(billDate) : {};
      if (typeof bMY.month0 === 'number' && typeof bMY.year === 'number') {
        mergedHistory.push({
          month0: bMY.month0,
          year: bMY.year,
          rawMonth: `${MONTH_NAMES[bMY.month0]}-${String(bMY.year).slice(-2)}`,
          unitsKwh,
          billAmountInr,
          demandInr: currentMonthDemand,
          ...(arrearAmount > 0 ? { openingBalanceInr: arrearAmount } : {}),
          closingBalanceInr: amountPayableInr,
          ...(paymentDone === 'Y' && billDate ? { paidDate: billDate } : {}),
        });
      }
      const chronological = dedupeAndMergeHistoryRows(mergedHistory);

      const addressParts = [areaName, sectionName, circleCode].filter(Boolean);
      const livePortalBill: LivePortalBill = {
        consumerName,
        consumerAddress: addressParts.length > 0 ? addressParts.join(', ') : undefined,
        uscno: respUsc,
        scno,
        circleCode,
        areaName,
        billNo: billId,
        billAmountInr,
        currentMonthDemandInr: currentMonthDemand,
        acdAmountDueInr: acdAmountDue > 0 ? acdAmountDue : undefined,
        amountPayableInr,
        arrearsInr: arrearAmount,
        unitsKwh,
        unitsEstimatedFromDemand,
        categoryCode: catInfo.code,
        categoryDecode: catInfo.label,
        eroName,
        sectionName,
        billDate,
        dueDate,
        disconnectionDate,
        paidDate: paymentDone === 'Y' ? billDate : undefined,
        viewEbillUrl: 'https://vas.easebuzz.in/TGNPDCL/Billpay',
        sourcePortal: hasDirectUnits
          ? 'TGNPDCL EBS Portal & Pay Gateway'
          : 'TGNPDCL Official Pay Gateway',
      };

      const demandText =
        currentMonthDemand > 0
          ? `${unitsKwh} kWh${unitsEstimatedFromDemand ? ' (TGERC slab-matched)' : ''} · ₹${currentMonthDemand.toLocaleString('en-IN')} current demand`
          : arrearAmount > 0
          ? `₹0 current demand · ₹${arrearAmount.toLocaleString('en-IN')} arrears due`
          : `₹0 due (${paymentDone === 'Y' ? 'Paid' : 'Zero Demand / Subsidy'})`;

      return {
        status: 'fetched',
        portalReachable: true,
        httpStatus: 200,
        livePortalBill,
        historyRows: chronological,
        message: `Fetched live TGNPDCL account${consumerName ? ` (${consumerName})` : ''}${scno ? ` · SC ${scno}` : ''}: ${demandText}${billDate ? ` (Bill ${billDate})` : ''}.`,
      };
    }
  }

  // Direct TGNPDCL EBS fallback if reachable without Easebuzz
  if (directParsed && (directParsed.unitsKwh > 0 || directParsed.billAmountInr > 0 || directParsed.historyRows.length > 0)) {
    const livePortalBill: LivePortalBill = {
      consumerName: directParsed.consumerName,
      uscno: cleanUsc,
      billAmountInr: directParsed.billAmountInr,
      unitsKwh: directParsed.unitsKwh,
      billDate: directParsed.billDate,
      dueDate: directParsed.dueDate,
      viewEbillUrl: 'https://tgnpdcl.com/Menu/OnlinePayBIll',
      sourcePortal: 'TGNPDCL Direct EBS Portal',
    };
    return {
      status: 'fetched',
      portalReachable: true,
      httpStatus: 200,
      livePortalBill,
      historyRows: dedupeAndMergeHistoryRows(directParsed.historyRows),
      message: `Fetched live TGNPDCL bill (${directParsed.unitsKwh} kWh · ₹${directParsed.billAmountInr}) directly from TGNPDCL EBS.`,
    };
  }

  return {
    status: 'error',
    portalReachable: Boolean(easebuzzResp && easebuzzResp.status < 500),
    httpStatus: easebuzzResp?.status || directEbsResp?.status || 0,
    livePortalBill: null,
    historyRows: [],
    message:
      'Could not reach TGNPDCL live bill gateway right now. Open TGNPDCL Online Bill Pay / EBS History directly or paste your portal rows below.',
  };
}

function parsePortalHtmlTablesAndFields(html: string): {
  consumerName?: string;
  unitsKwh: number;
  billAmountInr: number;
  billDate?: string;
  dueDate?: string;
  historyRows: ParsedPortalHistoryRow[];
} {
  const plainText = stripTags(html);

  const matchField = (rx: RegExp): string | undefined => {
    const m = plainText.match(rx);
    return m && m[1] ? m[1].trim() : undefined;
  };

  const consumerName = matchField(
    /(?:Consumer\s*Name|Name\s*of\s*Consumer|Customer\s*Name)\s*[:\-]?\s*([A-Za-z][A-Za-z\s.]{2,45})(?=\s+(?:SCNO|UKSCNO|Service|Category|Address|Bill|Mobile|$))/i
  );

  const unitsMatch = plainText.match(
    /(?:Billed\s*Units|Consumption\s*Units|Units\s*Consumed|Total\s*Units|KWH\s*Units|Units)\s*[:\-]?\s*([\d,]+(?:\.\d+)?)/i
  );
  let unitsKwh = unitsMatch ? Math.round(parseFloat(unitsMatch[1].replace(/,/g, ''))) : 0;

  // Fallback: closing reading - opening reading if explicitly shown
  if (unitsKwh === 0) {
    const openM = plainText.match(/(?:Opening|Previous|Prev)\s*(?:Reading|KWH)\s*[:\-]?\s*([\d,]+)/i);
    const closeM = plainText.match(/(?:Closing|Current|Present)\s*(?:Reading|KWH)\s*[:\-]?\s*([\d,]+)/i);
    if (openM && closeM) {
      const diff =
        parseInt(closeM[1].replace(/,/g, ''), 10) - parseInt(openM[1].replace(/,/g, ''), 10);
      if (diff > 0 && diff < 100000) unitsKwh = diff;
    }
  }

  const billAmtMatch = plainText.match(
    /(?:Total\s*Bill\s*Amount|Net\s*Payable|Bill\s*Amount|Total\s*Amount\s*Due|Amount\s*Payable|Current\s*Bill)\s*[:\-]?\s*(?:Rs\.?|₹|INR)?\s*([\d,]+(?:\.\d+)?)/i
  );
  const billAmountInr = billAmtMatch
    ? Math.round(parseFloat(billAmtMatch[1].replace(/,/g, '')))
    : 0;

  const billDate = matchField(/(?:Bill\s*Date|Billing\s*Date)\s*[:\-]?\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4})/i);
  const dueDate = matchField(/(?:Due\s*Date)\s*[:\-]?\s*(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{2,4})/i);

  const historyRows: ParsedPortalHistoryRow[] = [];
  const parseCellNumber = (cellText: string): number => {
    const cleaned = cellText.replace(/(\d),(\d)/g, '$1$2');
    const m = cleaned.match(/\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : NaN;
  };

  let monthCol = -1;
  let unitsCol = -1;
  let billCol = -1;
  let openRdgCol = -1;
  let closeRdgCol = -1;

  const rowMatches = html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  for (const rMatch of rowMatches) {
    const hasTh = /<th\b/i.test(rMatch[1]);
    const cells = [...rMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) =>
      stripTags(c[1])
    );
    if (cells.length < 2) continue;

    // Detect table header columns dynamically to avoid mistaking S.No or meter readings for Units
    const looksLikeHeader =
      hasTh ||
      cells.some((c) => /\b(units|kwh|billed|demand|bill\s*amt|amount\s*due|payable)\b/i.test(c));

    if (looksLikeHeader) {
      const nextMonth = cells.findIndex((c) =>
        /\b(month|period|bill\s*date|cycle)\b/i.test(c)
      );
      const nextUnits = cells.findIndex(
        (c) =>
          /\b(billed\s*units|units|kwh|consumption)\b/i.test(c) &&
          !/\b(open|close|prev|pres|initial|final|reading)\b/i.test(c)
      );
      const nextBill = cells.findIndex(
        (c) =>
          /\b(bill\s*amt|bill\s*amount|demand|total\s*amt|net\s*amt|payable|amount)\b/i.test(c) &&
          !/\b(date|no|units|kwh)\b/i.test(c)
      );
      const nextOpen = cells.findIndex((c) =>
        /\b(open|prev|previous|initial).*(reading|kwh|rdg)?\b/i.test(c)
      );
      const nextClose = cells.findIndex((c) =>
        /\b(close|closing|pres|present|current|final).*(reading|kwh|rdg)?\b/i.test(c)
      );

      if (nextUnits >= 0 || nextBill >= 0) {
        monthCol = nextMonth;
        unitsCol = nextUnits;
        billCol = nextBill;
        openRdgCol = nextOpen;
        closeRdgCol = nextClose;
        continue;
      }
    }

    const monthCell =
      monthCol >= 0 && cells[monthCol]
        ? cells[monthCol]
        : cells.find((c) => typeof parseMonthYearToken(c).month0 === 'number');
    if (!monthCell) continue;
    const parsedMY = parseMonthYearToken(monthCell);
    if (typeof parsedMY.month0 !== 'number') continue;

    let rowUnits = 0;
    let rowAmt = 0;

    if (unitsCol >= 0 && billCol >= 0 && cells[unitsCol] !== undefined && cells[billCol] !== undefined) {
      const uVal = parseCellNumber(cells[unitsCol]);
      const bVal = parseCellNumber(cells[billCol]);
      rowUnits = Number.isFinite(uVal) ? Math.max(0, Math.round(uVal)) : 0;
      rowAmt = Number.isFinite(bVal) ? Math.max(0, Math.round(bVal)) : 0;
    } else if (openRdgCol >= 0 && closeRdgCol >= 0 && billCol >= 0) {
      const openVal = parseCellNumber(cells[openRdgCol] || '');
      const closeVal = parseCellNumber(cells[closeRdgCol] || '');
      const bVal = parseCellNumber(cells[billCol] || '');
      if (Number.isFinite(openVal) && Number.isFinite(closeVal) && closeVal >= openVal) {
        rowUnits = Math.round(closeVal - openVal);
      }
      rowAmt = Number.isFinite(bVal) ? Math.max(0, Math.round(bVal)) : 0;
    } else {
      // Fallback without explicit <th> headers: filter out dates, S.No (1..24), and meter readings
      const numericCells = cells
        .filter((c) => c !== monthCell && !/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(c.trim()))
        .map((c) => ({
          raw: c,
          val: parseCellNumber(c.replace(/\b20\d{2}\b/g, '')),
          isCurrency: /(?:₹|Rs\.?|INR)/i.test(c),
        }))
        .filter((x) => Number.isFinite(x.val) && x.val >= 0);

      let candidates = numericCells;
      if (
        candidates.length >= 3 &&
        Number.isInteger(candidates[0].val) &&
        candidates[0].val >= 1 &&
        candidates[0].val <= 24 &&
        !candidates[0].isCurrency
      ) {
        candidates = candidates.slice(1);
      }

      if (candidates.length >= 3) {
        const d0 = candidates[0].val;
        const d1 = candidates[1].val;
        const d2 = candidates[2].val;
        if (d1 >= d0 && Math.abs((d1 - d0) - d2) <= 2) {
          candidates = candidates.slice(2);
        }
      }

      if (candidates.length >= 2) {
        const currIdx = candidates.findIndex((c) => c.isCurrency);
        if (currIdx > 0) {
          rowUnits = Math.round(candidates[0].val);
          rowAmt = Math.round(candidates[currIdx].val);
        } else {
          rowUnits = Math.round(candidates[0].val);
          rowAmt = Math.round(candidates[candidates.length - 1].val);
        }
      }
    }

    if (rowUnits > 0 || rowAmt > 0) {
      historyRows.push({
        month0: parsedMY.month0,
        year: parsedMY.year,
        rawMonth: monthCell,
        unitsKwh: rowUnits,
        billAmountInr: rowAmt,
      });
    }
  }

  return { consumerName, unitsKwh, billAmountInr, billDate, dueDate, historyRows };
}

async function fetchApepdclLiveData(uscno: string): Promise<{
  status: 'fetched' | 'not_found' | 'error';
  portalReachable: boolean;
  httpStatus: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  message: string;
}> {
  const querySingleApepdcl = async (lookupKey: string) => {
    const pageResp = await fetch('https://www.apeasternpower.com/viewBillDetailsMain', {
      signal: AbortSignal.timeout(5000),
      headers: BROWSER_HEADERS,
    });
    const cookies = extractCookies(pageResp);

    const commonHdrs = {
      ...BROWSER_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookies ? { Cookie: cookies } : {}),
      Referer: 'https://www.apeasternpower.com/viewBillDetailsMain',
    };

    const [chatResp, capResp] = await Promise.all([
      fetch('https://www.apeasternpower.com/getChatboxBill', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: commonHdrs,
        body: `ltscno=${encodeURIComponent(lookupKey)}`,
      }).catch(() => null),
      fetch('https://www.apeasternpower.com/generateCaptcha', {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        headers: commonHdrs,
        body: '',
      }).catch(() => null),
    ]);

    let chatData: Record<string, unknown> | null = null;
    if (chatResp && chatResp.ok) {
      const raw = (await chatResp.text()).trim();
      if (raw && raw !== 'null' && raw !== '""') {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') chatData = parsed;
        } catch {
          // ignore invalid json
        }
      }
    }

    const captchaCode = capResp && capResp.ok ? (await capResp.text()).trim() : '';
    let htmlBillResp: Response | null = null;
    let parsedHtml: ReturnType<typeof parsePortalHtmlTablesAndFields> | null = null;

    if (captchaCode) {
      htmlBillResp = await fetch('https://www.apeasternpower.com/getbillDetailsPage', {
        method: 'POST',
        signal: AbortSignal.timeout(5500),
        headers: commonHdrs,
        body: `ltscno=${encodeURIComponent(lookupKey)}&zdeujfswey=${encodeURIComponent(captchaCode)}`,
      }).catch(() => null);

      if (htmlBillResp && htmlBillResp.ok) {
        const htmlBody = await htmlBillResp.text();
        parsedHtml = parsePortalHtmlTablesAndFields(htmlBody);
      }
    }

    const chatAmt = Math.round(Number(chatData?.TOT_BILL_AMT ?? chatData?.BILL_AMT ?? 0) || 0);
    const chatUnits = Math.round(Number(chatData?.BILLED_UNITS ?? chatData?.UNITS ?? 0) || 0);
    const chatBillDate = chatData?.BILL_DATE ? String(chatData.BILL_DATE) : undefined;
    const chatDueDate = chatData?.DUE_DATE ? String(chatData.DUE_DATE) : undefined;
    const masterId = chatData?.SCMASTERID ? String(chatData.SCMASTERID) : undefined;

    const finalBillAmt = chatAmt || parsedHtml?.billAmountInr || 0;
    const finalUnits = chatUnits || parsedHtml?.unitsKwh || 0;
    const finalBillDate = chatBillDate || parsedHtml?.billDate;
    const finalDueDate = chatDueDate || parsedHtml?.dueDate;
    const hist = parsedHtml?.historyRows || [];

    return {
      lookupKey,
      htmlBillResp,
      parsedHtml,
      finalBillAmt,
      finalUnits,
      finalBillDate,
      finalDueDate,
      masterId,
      hist,
    };
  };

  try {
    const attempt = await querySingleApepdcl(uscno);
    if (attempt.finalBillAmt > 0 || attempt.finalUnits > 0 || attempt.hist.length > 0) {
      const eBillMonth =
        attempt.finalBillDate && attempt.finalBillDate.length >= 4
          ? attempt.finalBillDate.substring(3)
          : '';
      const livePortalBill: LivePortalBill = {
        consumerName: attempt.parsedHtml?.consumerName,
        uscno,
        billAmountInr: attempt.finalBillAmt,
        unitsKwh: attempt.finalUnits,
        billDate: attempt.finalBillDate,
        dueDate: attempt.finalDueDate,
        masterId: attempt.masterId,
        viewEbillUrl: eBillMonth
          ? `https://www.apeasternpower.com/viewEbill?scno=${encodeURIComponent(attempt.lookupKey)}&month=${encodeURIComponent(eBillMonth)}`
          : 'https://www.apeasternpower.com/viewBillDetailsMain',
        sourcePortal: 'APEPDCL Official Portal',
      };
      return {
        status: 'fetched',
        portalReachable: true,
        httpStatus: 200,
        livePortalBill,
        historyRows: attempt.hist,
        message: `Fetched live APEPDCL bill (${attempt.finalUnits > 0 ? `${attempt.finalUnits} kWh · ` : ''}₹${attempt.finalBillAmt}${attempt.finalBillDate ? `, ${attempt.finalBillDate}` : ''}) directly from official portal.`,
      };
    }

    return {
      status: 'not_found',
      portalReachable: true,
      httpStatus: attempt.htmlBillResp?.status || 404,
      livePortalBill: null,
      historyRows: [],
      message: `No consumer bill found on official APEPDCL portal for USC Number "${uscno}".`,
    };
  } catch {
    return {
      status: 'error',
      portalReachable: false,
      httpStatus: 0,
      livePortalBill: null,
      historyRows: [],
      message: 'Official APEPDCL portal request timed out. Try again or paste your portal rows.',
    };
  }
}

async function fetchApspdclLiveData(
  uscno: string,
  mobileNumber?: string
): Promise<{
  status: 'fetched' | 'mobile_required' | 'not_found' | 'error';
  portalReachable: boolean;
  httpStatus: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  message: string;
}> {
  const cleanMob = (mobileNumber || '').replace(/\D/g, '');
  const queryOption = 'uscno';

  try {
    const formPage = await fetch('https://www.apspdcl.in/ConsumerDashboard/serviceDetails.jsp', {
      signal: AbortSignal.timeout(5000),
      headers: BROWSER_HEADERS,
    });
    const cookies = extractCookies(formPage);
    const html = await formPage.text();
    const csrfToken = html.match(/name="X-CSRF-TOKEN"[^>]*value="([^"]+)"/i)?.[1] || '';

    const params: Record<string, string> = {
      'X-CSRF-TOKEN': csrfToken,
      option: queryOption,
      uscno,
      ...(cleanMob ? { mobile: cleanMob } : {}),
      ans: '10',
    };

    const postResp = await fetch('https://www.apspdcl.in/ConsumerDashboard/public/consumerdetail', {
      method: 'POST',
      signal: AbortSignal.timeout(6000),
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(cookies ? { Cookie: cookies } : {}),
        Referer: 'https://www.apspdcl.in/ConsumerDashboard/serviceDetails.jsp',
      },
      body: new URLSearchParams(params).toString(),
    });

    const resHtml = await postResp.text();
    const resPlain = stripTags(resHtml);

    if (!(/Invalid Details/i.test(resPlain) || resHtml.includes('id="uscsec"'))) {
      const parsed = parsePortalHtmlTablesAndFields(resHtml);
      if (parsed.unitsKwh > 0 || parsed.billAmountInr > 0 || parsed.historyRows.length > 0) {
        const livePortalBill: LivePortalBill = {
          consumerName: parsed.consumerName,
          uscno,
          unitsKwh: parsed.unitsKwh,
          billAmountInr: parsed.billAmountInr,
          billDate: parsed.billDate,
          dueDate: parsed.dueDate,
          viewEbillUrl: 'https://www.apspdcl.in/ConsumerDashboard/serviceDetails.jsp',
          sourcePortal: 'APSPDCL Official Portal',
        };

        return {
          status: 'fetched',
          portalReachable: true,
          httpStatus: postResp.status,
          livePortalBill,
          historyRows: parsed.historyRows,
          message: `Fetched live consumer bill directly from APSPDCL (${parsed.unitsKwh} kWh · ₹${parsed.billAmountInr}).`,
        };
      }
    }

    return {
      status: 'not_found',
      portalReachable: true,
      httpStatus: postResp.status,
      livePortalBill: null,
      historyRows: [],
      message:
        'APSPDCL returned no active bill rows. Verify your 8-digit USC Number and optional 10-digit linked mobile number.',
    };
  } catch {
    return {
      status: 'error',
      portalReachable: false,
      httpStatus: 0,
      livePortalBill: null,
      historyRows: [],
      message: 'APSPDCL portal request timed out. Try again or paste your portal rows.',
    };
  }
}

function sortPortalHistoryChronologically(rows: ParsedPortalHistoryRow[]): ParsedPortalHistoryRow[] {
  return [...rows].sort((a, b) => {
    const aKey = (a.year ?? 0) * 12 + (a.month0 ?? 0);
    const bKey = (b.year ?? 0) * 12 + (b.month0 ?? 0);
    return aKey - bKey;
  });
}

function buildCalibrated12Months(params: {
  rollingWindow: ReturnType<typeof computeServerRollingWindow>;
  stateId: string;
  category: string;
  sanctionedLoadKw: number;
  correctionFactor?: number;
  fixedOffsetInr?: number;
  livePortalBill: LivePortalBill | null;
  historyRows: ParsedPortalHistoryRow[];
  latestUnitsKwh: number;
  latestBillInr: number;
  sampleAnchorUnits: number;
}) {
  const {
    rollingWindow,
    stateId,
    category,
    sanctionedLoadKw,
    correctionFactor = 1,
    fixedOffsetInr = 0,
    livePortalBill,
    historyRows,
    latestUnitsKwh,
    latestBillInr,
    sampleAnchorUnits,
  } = params;

  const curve = SEASONAL_CURVES[stateId] || SEASONAL_CURVES.telangana;
  // Build effective slot list: when the government portal returns 13+ continuous verified months
  // (e.g. 12-month Bill History Ledger + current Present Month), preserve all returned verified months
  // instead of truncating the earliest returned month.
  let effectiveSlots = rollingWindow.slots.slice();
  if (effectiveSlots.length === 12 && historyRows.length > 12) {
    const oldestSlot = effectiveSlots[0];
    const oldestSlotYm = oldestSlot.year * 12 + oldestSlot.calendarMonth0;
    const olderVerifiedRows = historyRows.filter(
      (r) =>
        typeof r.year === 'number' &&
        typeof r.month0 === 'number' &&
        r.year * 12 + r.month0 < oldestSlotYm
    );
    if (olderVerifiedRows.length > 0 && olderVerifiedRows.length <= 12) {
      const extraSlots = olderVerifiedRows.map((r, i) => ({
        sequenceNo: i + 1,
        calendarMonth0: r.month0!,
        year: r.year!,
        month: `${MONTH_NAMES[r.month0!]} ${r.year!}`,
        shortLabel: `${MONTH_NAMES[r.month0!]} '${String(r.year!).slice(-2)}`,
        isRunningMonth: false,
      }));
      effectiveSlots = [...extraSlots, ...effectiveSlots].map((s, idx, arr) => ({
        ...s,
        sequenceNo: idx + 1,
        isRunningMonth: idx === arr.length - 1,
      }));
    }
  }

  const totalSlots = effectiveSlots.length;
  const endSlot = effectiveSlots[totalSlots - 1];
  const runningFactor = curve[endSlot.calendarMonth0] || 0.86;

  // Map any real portal history rows onto effective slots
  const matchedBySlot = new Map<number, ParsedPortalHistoryRow>();
  if (historyRows.length > 0) {
    historyRows.forEach((row) => {
      const exactIdx = effectiveSlots.findIndex(
        (s) =>
          s.calendarMonth0 === row.month0 &&
          (row.year === undefined || s.year === row.year)
      );
      if (exactIdx >= 0) {
        matchedBySlot.set(exactIdx, row);
      }
    });
    // If month strings had no exact year/month match, align trailing rows ending at last slot
    if (matchedBySlot.size === 0) {
      const sliced = historyRows.slice(-totalSlots);
      const startIdx = Math.max(0, totalSlots - sliced.length);
      sliced.forEach((row, i) => {
        matchedBySlot.set(startIdx + i, row);
      });
    }
  }

  const hasLivePortalData = Boolean(livePortalBill) || historyRows.length > 0;

  // Determine exact baseline units for sample/manual fallback (never fabricated for live portal accounts)
  let anchorUnits = sampleAnchorUnits;
  if (historyRows.length > 0) {
    const billedHist = historyRows.filter((r) => r.unitsKwh > 0);
    const basisHist = (billedHist.length > 0 ? billedHist : historyRows).slice(-12);
    const avgHistU =
      basisHist.reduce((s, r) => s + r.unitsKwh, 0) / Math.max(1, basisHist.length);
    if (avgHistU > 0) anchorUnits = Math.max(20, Math.round(avgHistU));
  } else if (livePortalBill) {
    const liveU =
      livePortalBill.unitsKwh > 0
        ? livePortalBill.unitsKwh
        : livePortalBill.billAmountInr > 0
        ? estimateServerUnitsFromBill(
            livePortalBill.billAmountInr,
            stateId,
            category,
            sanctionedLoadKw,
            correctionFactor,
            fixedOffsetInr
          )
        : 0;
    if (liveU > 0) anchorUnits = Math.max(20, Math.round(liveU / runningFactor));
  } else if (latestUnitsKwh > 0) {
    anchorUnits = Math.max(20, Math.round(latestUnitsKwh / runningFactor));
  } else if (latestBillInr > 0) {
    const u = estimateServerUnitsFromBill(
      latestBillInr,
      stateId,
      category,
      sanctionedLoadKw,
      correctionFactor,
      fixedOffsetInr
    );
    anchorUnits = Math.max(20, Math.round(u / runningFactor));
  }

  const parsedLiveBillMY = livePortalBill?.billDate
    ? parseMonthYearToken(livePortalBill.billDate)
    : {};

  return effectiveSlots.map((slot) => {
    const slotIdx = slot.sequenceNo - 1;
    const portalRow = matchedBySlot.get(slotIdx);
    if (portalRow) {
      const unitsKwh =
        portalRow.unitsKwh > 0
          ? portalRow.unitsKwh
          : portalRow.demandInr === 0
          ? 0
          : estimateServerUnitsFromBill(
              portalRow.billAmountInr,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      const billAmountInr =
        portalRow.billAmountInr > 0
          ? portalRow.billAmountInr
          : portalRow.demandInr === 0
          ? 0
          : computeServerStateBill(
              unitsKwh,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      return {
        ...slot,
        unitsKwh,
        billAmountInr,
        isVerifiedPortalData: true,
        ...(typeof portalRow.demandInr === 'number' ? { demandInr: portalRow.demandInr } : {}),
        ...(typeof portalRow.paidInr === 'number' ? { paidInr: portalRow.paidInr } : {}),
        ...(typeof portalRow.openingBalanceInr === 'number'
          ? { openingBalanceInr: portalRow.openingBalanceInr }
          : {}),
        ...(typeof portalRow.closingBalanceInr === 'number'
          ? { closingBalanceInr: portalRow.closingBalanceInr }
          : {}),
        ...(typeof portalRow.adjustmentInr === 'number'
          ? { adjustmentInr: portalRow.adjustmentInr }
          : {}),
        ...(portalRow.receiptNo ? { receiptNo: portalRow.receiptNo } : {}),
        ...(portalRow.paidDate ? { paidDate: portalRow.paidDate } : {}),
      };
    }

    const liveBillMatchesSlot =
      Boolean(livePortalBill) &&
      !livePortalBill?.isFromHistoryFallback &&
      (typeof parsedLiveBillMY.month0 !== 'number' ||
        (parsedLiveBillMY.month0 === slot.calendarMonth0 &&
          (typeof parsedLiveBillMY.year !== 'number' || parsedLiveBillMY.year === slot.year)));

    if (slot.isRunningMonth && livePortalBill && liveBillMatchesSlot) {
      const unitsKwh =
        livePortalBill.unitsKwh > 0
          ? livePortalBill.unitsKwh
          : livePortalBill.currentMonthDemandInr === 0
          ? 0
          : estimateServerUnitsFromBill(
              livePortalBill.billAmountInr,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      const billAmountInr =
        livePortalBill.billAmountInr > 0
          ? livePortalBill.billAmountInr
          : computeServerStateBill(
              unitsKwh,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      return {
        ...slot,
        unitsKwh,
        billAmountInr,
        isVerifiedPortalData: true,
      };
    }

    // Never fabricate seasonal numbers for unreturned slots when a real DISCOM portal account was queried!
    if (hasLivePortalData) {
      return {
        ...slot,
        unitsKwh: 0,
        billAmountInr: 0,
        isVerifiedPortalData: false,
      };
    }

    // Only apply manual latestUnits/Bill to running slot when there is NO live portal data
    if (slot.isRunningMonth && (latestUnitsKwh > 0 || latestBillInr > 0)) {
      const unitsKwh =
        latestUnitsKwh > 0
          ? Math.round(latestUnitsKwh)
          : estimateServerUnitsFromBill(
              latestBillInr,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      const billAmountInr =
        latestBillInr > 0
          ? Math.round(latestBillInr)
          : computeServerStateBill(
              unitsKwh,
              stateId,
              category,
              sanctionedLoadKw,
              correctionFactor,
              fixedOffsetInr
            );
      return {
        ...slot,
        unitsKwh,
        billAmountInr,
        isVerifiedPortalData: false,
      };
    }

    const seasonalFactor = curve[slot.calendarMonth0];
    const unitsKwh = Math.max(20, Math.round(anchorUnits * seasonalFactor));
    const billAmountInr = computeServerStateBill(
      unitsKwh,
      stateId,
      category,
      sanctionedLoadKw,
      correctionFactor,
      fixedOffsetInr
    );
    return {
      ...slot,
      unitsKwh,
      billAmountInr,
      isVerifiedPortalData: false,
    };
  });
}

async function handleServiceUsageLookup(req: express.Request, res: express.Response) {
  const body = req.body || {};
  const rawUscInput = body.uscNumber ? String(body.uscNumber) : '';
  const rawServiceInput = body.serviceNumber ? String(body.serviceNumber) : '';
  const stateId = String(body.stateId || 'telangana');
  const discomId = String(body.discomId || '');
  const category = String(body.category || 'domestic');
  const requestedSanctionedLoadKw = Number(body.sanctionedLoadKw || 4);
  const correctionFactor = Number(body.correctionFactor ?? 1);
  const fixedOffsetInr = Number(body.fixedOffsetInr ?? 0);
  const latestBillInr = Number(body.latestBillInr || 0);
  const latestUnitsKwh = Number(body.latestUnitsKwh || 0);
  const sampleAnchorUnits = Number(body.anchorMonthlyUnits || 0);
  const isSamplePreset = Boolean(body.isSamplePreset);
  const anchorYearMonth = body.anchorYearMonth ? String(body.anchorYearMonth) : undefined;
  const useCustomAnchor = Boolean(body.useCustomAnchor);
  const requestedMonths: 12 | 13 | 24 =
    Number(body.requestedMonths) >= 24 ? 24 : Number(body.requestedMonths) === 13 ? 13 : 12;
  const captchaId = body.captchaId ? String(body.captchaId) : undefined;
  const captchaAnswer = body.captchaAnswer ? String(body.captchaAnswer) : undefined;
  const mobileNumber = body.mobileNumber ? String(body.mobileNumber) : undefined;
  const portalUrl = body.portalUrl;
  const billHistoryUrl = body.billHistoryUrl;

  const primaryInput = rawUscInput.trim() || rawServiceInput.trim();
  if (!primaryInput || !isValidServerServiceNumber(primaryInput)) {
    res.status(400).json({
      ok: false,
      error: 'Invalid USC Number format. Rejected before portal request.',
    });
    return;
  }

  const targetUrl = String(billHistoryUrl || portalUrl || '');
  let parsedOrigin = '';
  try {
    parsedOrigin = new URL(targetUrl).origin;
  } catch {
    res.status(400).json({ ok: false, error: 'Invalid DISCOM portal URL.' });
    return;
  }

  if (!ALLOWED_DISCOM_ORIGINS.has(parsedOrigin)) {
    res.status(403).json({ ok: false, error: 'URL is outside the 4-state DISCOM registry.' });
    return;
  }

  const resolvedParams = resolveServerUscParam(rawUscInput, rawServiceInput, stateId);
  const uscno = resolvedParams.uscNumber;
  const initialWindow = computeServerRollingWindow(new Date(), requestedMonths, anchorYearMonth);
  const hasUserManualCalibration = latestUnitsKwh > 0 || latestBillInr > 0;

  // Path A: User explicitly clicked a 4-state Demo Sample Preset
  if (isSamplePreset && !captchaId && !hasUserManualCalibration) {
    const usage12Months = buildCalibrated12Months({
      rollingWindow: initialWindow,
      stateId,
      category,
      sanctionedLoadKw: requestedSanctionedLoadKw,
      livePortalBill: null,
      historyRows: [],
      latestUnitsKwh: 0,
      latestBillInr: 0,
      sampleAnchorUnits: sampleAnchorUnits || 420,
    });
    res.json({
      ok: true,
      serviceNumber: uscno,
      uscNumber: uscno,
      identifiedNumberType: resolvedParams.primaryType,
      identifiedNumberTypeLabel: resolvedParams.primaryTypeLabel,
      stateId,
      discomId,
      portalReachable: true,
      httpStatus: 200,
      requiresPortalVerification: false,
      verificationStep: 'none',
      dataSourceMode: 'inbuilt_reference',
      livePortalBill: null,
      captchaChallenge: null,
      sanctionedLoadKw: requestedSanctionedLoadKw,
      checkedAt: initialWindow.serverTimestampIso,
      rollingWindow: initialWindow,
      usage12Months,
      message: `Loaded ${discomId.toUpperCase()} demo ${initialWindow.totalMonths}-month tariff sample (${initialWindow.startMonth} → ${initialWindow.endMonth}). Enter your real USC Number to fetch actual meter usage.`,
    });
    return;
  }

  // Path B: Live portal fetch using strict USC Number only
  let livePortalBill: LivePortalBill | null = null;
  let historyRows: ParsedPortalHistoryRow[] = [];
  let verificationStep:
    | 'none'
    | 'captcha_required'
    | 'mobile_required'
    | 'not_found'
    | 'portal_manual_or_paste' = 'none';
  let captchaChallenge: CaptchaChallenge | null = null;
  let portalReachable = false;
  let httpStatus = 0;
  let message = '';

  if (discomId === 'tgspdcl') {
    const tg = await fetchTgspdclLiveData(uscno, {
      captchaId,
      captchaAnswer,
      mobileNumber,
    });
    portalReachable = tg.portalReachable;
    httpStatus = tg.httpStatus;
    livePortalBill = tg.livePortalBill;
    historyRows = tg.historyRows;
    captchaChallenge = tg.captchaChallenge;
    message = tg.message;
    if (tg.status === 'captcha_required') verificationStep = 'captcha_required';
    else if (tg.status === 'not_found') verificationStep = 'not_found';
    else if (tg.status === 'error') verificationStep = 'portal_manual_or_paste';
  } else if (discomId === 'tgnpdcl') {
    const tgn = await fetchTgnpdclLiveData(uscno);
    portalReachable = tgn.portalReachable;
    httpStatus = tgn.httpStatus;
    livePortalBill = tgn.livePortalBill;
    historyRows = tgn.historyRows;
    message = tgn.message;
    if (tgn.status === 'not_found') verificationStep = 'not_found';
    else if (tgn.status === 'error') verificationStep = 'portal_manual_or_paste';
  } else if (discomId === 'apepdcl') {
    const ep = await fetchApepdclLiveData(uscno);
    portalReachable = ep.portalReachable;
    httpStatus = ep.httpStatus;
    livePortalBill = ep.livePortalBill;
    historyRows = ep.historyRows;
    message = ep.message;
    if (ep.status === 'not_found') verificationStep = 'not_found';
    else if (ep.status === 'error') verificationStep = 'portal_manual_or_paste';
  } else if (discomId === 'apspdcl') {
    const sp = await fetchApspdclLiveData(uscno, mobileNumber);
    portalReachable = sp.portalReachable;
    httpStatus = sp.httpStatus;
    livePortalBill = sp.livePortalBill;
    historyRows = sp.historyRows;
    message = sp.message;
    if (sp.status === 'mobile_required') verificationStep = 'mobile_required';
    else if (sp.status === 'not_found') verificationStep = 'not_found';
    else if (sp.status === 'error') verificationStep = 'portal_manual_or_paste';
  } else {
    // APCPDCL / Odisha / Chandigarh live portal reachability check
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: {
          ...BROWSER_HEADERS,
          Referer: String(portalUrl || targetUrl),
        },
      });
      httpStatus = response.status;
      portalReachable = response.ok || response.status < 500;
      verificationStep = 'portal_manual_or_paste';
      message = portalReachable
        ? `Connected to official ${discomId.toUpperCase()} portal (HTTP ${response.status}). Consumer portal login/CAPTCHA is required for personal history — enter your actual Latest Bill ₹ / Units or paste your 12-month portal rows below.`
        : `Official ${discomId.toUpperCase()} portal returned HTTP ${response.status}. Paste your portal rows or enter your Latest Bill ₹ / Units below.`;
    } catch {
      portalReachable = false;
      httpStatus = 0;
      verificationStep = 'portal_manual_or_paste';
      message = `Official ${discomId.toUpperCase()} portal unreachable from cloud proxy right now. Open portal link directly & paste rows, or enter your actual Latest Bill ₹ / Units below.`;
    }
  }

  // Determine honest data source mode & NEVER fabricate fake 420 kWh meter data!
  let dataSourceMode:
    | 'live_portal_history'
    | 'live_portal_bill'
    | 'user_bill_calibrated'
    | 'portal_auth_required' = 'portal_auth_required';

  if (historyRows.length >= 6) {
    dataSourceMode = 'live_portal_history';
  } else if (livePortalBill) {
    dataSourceMode = 'live_portal_bill';
  } else if (hasUserManualCalibration) {
    dataSourceMode = 'user_bill_calibrated';
    verificationStep = 'none';
  }

  const sortedHistory = dedupeAndMergeHistoryRows(historyRows);
  const effectiveMonthsCount: 12 | 13 | 24 =
    requestedMonths === 24 ? 24 : requestedMonths === 13 ? 13 : 12;

  const portalSanctionedLoadKw =
    typeof livePortalBill?.contractedLoadKw === 'number' && livePortalBill.contractedLoadKw > 0
      ? livePortalBill.contractedLoadKw
      : requestedSanctionedLoadKw;
  const resolvedCategory =
    typeof livePortalBill?.categoryCode === 'number' &&
    livePortalBill.categoryCode >= 2 &&
    livePortalBill.categoryCode !== 5
      ? 'commercial'
      : category;

  // Anchor rolling window to latest verified portal bill / history month when no custom historical anchor is picked
  let resolvedAnchor = useCustomAnchor ? anchorYearMonth : undefined;
  if (!resolvedAnchor) {
    const liveMY =
      livePortalBill && !livePortalBill.isFromHistoryFallback && livePortalBill.billDate
        ? parseMonthYearToken(livePortalBill.billDate)
        : {};
    const liveYMKey =
      typeof liveMY.year === 'number' && typeof liveMY.month0 === 'number'
        ? liveMY.year * 12 + liveMY.month0
        : -1;
    const latestHist = sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1] : null;
    const histYMKey =
      latestHist && typeof latestHist.year === 'number' && typeof latestHist.month0 === 'number'
        ? latestHist.year * 12 + latestHist.month0
        : -1;

    if (liveYMKey >= histYMKey && typeof liveMY.year === 'number' && typeof liveMY.month0 === 'number') {
      resolvedAnchor = `${liveMY.year}-${String(liveMY.month0 + 1).padStart(2, '0')}`;
    } else if (latestHist && typeof latestHist.year === 'number' && typeof latestHist.month0 === 'number') {
      resolvedAnchor = `${latestHist.year}-${String(latestHist.month0 + 1).padStart(2, '0')}`;
    } else {
      resolvedAnchor = anchorYearMonth;
    }
  }

  const finalWindow = computeServerRollingWindow(new Date(), effectiveMonthsCount, resolvedAnchor);

  const canEmitUsage =
    Boolean(livePortalBill) || sortedHistory.length > 0 || hasUserManualCalibration;

  const usage12Months = canEmitUsage
    ? buildCalibrated12Months({
        rollingWindow: finalWindow,
        stateId,
        category: resolvedCategory,
        sanctionedLoadKw: portalSanctionedLoadKw,
        correctionFactor,
        fixedOffsetInr,
        livePortalBill,
        historyRows: sortedHistory,
        latestUnitsKwh: livePortalBill || sortedHistory.length > 0 ? 0 : latestUnitsKwh,
        latestBillInr: livePortalBill || sortedHistory.length > 0 ? 0 : latestBillInr,
        sampleAnchorUnits: 0,
      })
    : null;

  const verifiedMonthsCount = usage12Months
    ? usage12Months.filter((m) => m.isVerifiedPortalData).length
    : 0;

  const emittedWindow =
    usage12Months && usage12Months.length > 0
      ? {
          ...finalWindow,
          startMonth: usage12Months[0].month,
          endMonth: usage12Months[usage12Months.length - 1].month,
          totalMonths: usage12Months.length,
          runningMonthLabel: usage12Months[usage12Months.length - 1].month,
        }
      : finalWindow;

  res.json({
    ok: true,
    serviceNumber: livePortalBill?.uscno || uscno,
    uscNumber: livePortalBill?.uscno || uscno,
    identifiedNumberType: resolvedParams.primaryType,
    identifiedNumberTypeLabel: resolvedParams.primaryTypeLabel,
    stateId,
    discomId,
    portalReachable,
    httpStatus,
    requiresPortalVerification: verificationStep !== 'none',
    verificationStep,
    captchaChallenge,
    dataSourceMode,
    livePortalBill,
    sanctionedLoadKw: portalSanctionedLoadKw,
    phaseType: livePortalBill?.phaseType,
    verifiedMonthsCount,
    checkedAt: finalWindow.serverTimestampIso,
    rollingWindow: emittedWindow,
    usage12Months,
    message,
  });
}

async function handleRealtimeTariffLookup(req: express.Request, res: express.Response) {
  const stateId = String(req.query.stateId || 'telangana');
  const providerId = String(req.query.providerId || 'tgspdcl');
  const category = String(req.query.category || 'domestic');
  const monthlyUnits = Math.max(50, Math.round(Number(req.query.monthlyUnits || 400)));
  const sanctionedLoadKw = Math.max(1, Number(req.query.sanctionedLoadKw || 4));
  const city = String(req.query.city || '').trim();

  const regulatorMap: Record<string, { name: string; url: string; dutyNote: string }> = {
    telangana: {
      name: 'TGERC (Telangana ERC)',
      url: 'https://www.tgerc.telangana.gov.in/',
      dutyNote: '₹0.06/kWh ED + Customer Charge',
    },
    andhra_pradesh: {
      name: 'APERC (Andhra Pradesh ERC)',
      url: 'https://www.aperc.gov.in/',
      dutyNote: '₹0.06/kWh ED + Customer Charge',
    },
    odissa: {
      name: 'OERC (Odisha ERC)',
      url: 'https://www.orierc.org/',
      dutyNote: '4% Electricity Duty',
    },
    chandigarh: {
      name: 'JERC (Chandigarh / UT)',
      url: 'https://jercuts.gov.in/',
      dutyNote: 'JERC Retail Tariff',
    },
  };

  const reg = regulatorMap[stateId] || regulatorMap.telangana;
  const estBill = computeServerStateBill(monthlyUnits, stateId, category, sanctionedLoadKw);
  const blendedRatePerKwh = Number((estBill / monthlyUnits).toFixed(2));
  const feedInMap: Record<string, number> = {
    telangana: 3.1,
    andhra_pradesh: 2.95,
    odissa: 2.8,
    chandigarh: 3.25,
  };
  const baseSlabMap: Record<string, { domestic: number; commercial: number }> = {
    telangana: { domestic: 7.7, commercial: 9.8 },
    andhra_pradesh: { domestic: 7.45, commercial: 9.4 },
    odissa: { domestic: 5.4, commercial: 8.1 },
    chandigarh: { domestic: 4.8, commercial: 6.9 },
  };
  const baseSlab =
    category === 'commercial'
      ? (baseSlabMap[stateId] || baseSlabMap.telangana).commercial
      : (baseSlabMap[stateId] || baseSlabMap.telangana).domestic;

  let portalReachable = false;
  try {
    const probe = await fetch(reg.url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(2500),
      headers: BROWSER_HEADERS,
    });
    portalReachable = probe.ok || probe.status < 500;
  } catch {
    portalReachable = false;
  }

  const now = new Date();
  const rw = computeServerRollingWindow(now, 12);

  res.json({
    ok: true,
    stateId,
    providerId,
    category,
    city,
    monthlyUnits,
    sanctionedLoadKw,
    blendedRatePerKwh,
    baseSlabRatePerKwh: baseSlab,
    feedInTariffPerKwh: feedInMap[stateId] || 3.1,
    estimatedMonthlyBillInr: estBill,
    effectivePeriod: 'FY 2025–26 Retail Supply Tariff Order',
    regulatorName: reg.name,
    regulatorUrl: reg.url,
    portalReachable,
    syncedAtIst: rw.serverTimeIst,
    sourceNote: `${providerId.toUpperCase()} (${reg.name}) · ${monthlyUnits} kWh slab rate ₹${blendedRatePerKwh}/kWh`,
  });
}

async function handleMapTileProxy(req: express.Request, res: express.Response) {
  const source = String(req.query.source || 'hybrid');
  const z = Number(req.query.z);
  const x = Number(req.query.x);
  const y = Number(req.query.y);

  if (
    !Number.isInteger(z) ||
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    z < 14 ||
    z > 21
  ) {
    res.status(400).json({ ok: false, error: 'Invalid tile coordinates.' });
    return;
  }

  const maxIdx = 1 << z;
  if (x < 0 || x >= maxIdx || y < 0 || y >= maxIdx) {
    res.status(400).json({ ok: false, error: 'Tile index out of Web Mercator bounds.' });
    return;
  }

  let tileUrl = '';
  let fallbackUrl = '';
  if (source === 'hybrid') {
    tileUrl = `https://mt1.google.com/vt/lyrs=y&x=${x}&y=${y}&z=${z}`;
    fallbackUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  } else if (source === 'satellite') {
    tileUrl = `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
    fallbackUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  } else if (source === 'esri') {
    tileUrl = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
    fallbackUrl = `https://mt1.google.com/vt/lyrs=s&x=${x}&y=${y}&z=${z}`;
  } else if (source === 'streets') {
    tileUrl = `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  } else {
    res.status(400).json({ ok: false, error: 'Unsupported map source.' });
    return;
  }

  const tryFetchTile = async (url: string) => {
    const resp = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(7000),
      headers: {
        'User-Agent': BROWSER_HEADERS['User-Agent'],
        Accept: 'image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) return null;
    const arrBuf = await resp.arrayBuffer();
    if (!arrBuf || arrBuf.byteLength < 64) return null;
    return { contentType, buffer: Buffer.from(arrBuf) };
  };

  try {
    let result = await tryFetchTile(tileUrl);
    if (!result && fallbackUrl) {
      result = await tryFetchTile(fallbackUrl);
    }
    if (!result) {
      res.status(502).json({ ok: false, error: 'Satellite tile unavailable.' });
      return;
    }
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(result.buffer);
  } catch {
    res.status(502).json({ ok: false, error: 'Tile fetch timeout.' });
  }
}

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  tags?: Record<string, string>;
}

async function handleOsmBuildingsLookup(req: express.Request, res: express.Response) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const rawRadius = Number(req.query.radius || 95);
  const radius = Math.max(30, Math.min(150, Number.isFinite(rawRadius) ? Math.round(rawRadius) : 95));

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) {
    res.status(400).json({ ok: false, error: 'Invalid latitude or longitude.' });
    return;
  }

  // Compute geographic bounding box around (lat, lon) for radius in meters
  const dLat = radius / 111320;
  const cosLat = Math.max(0.15, Math.cos((lat * Math.PI) / 180));
  const dLon = radius / (111320 * cosLat);
  const minLon = (lon - dLon).toFixed(6);
  const minLat = (lat - dLat).toFixed(6);
  const maxLon = (lon + dLon).toFixed(6);
  const maxLat = (lat + dLat).toFixed(6);

  const osmMapUrl = `https://api.openstreetmap.org/api/0.6/map.json?bbox=${minLon},${minLat},${maxLon},${maxLat}`;
  const overpassQuery = `[out:json][timeout:10];(way["building"](around:${radius},${lat.toFixed(6)},${lon.toFixed(6)}););out body;>;out skel qt;`;

  let payload: { elements?: OsmElement[] } | null = null;
  let usedMirror = '';

  // Primary: Official OpenStreetMap v0.6 map.json REST endpoint (fast, no Overpass 406/504 congestion)
  try {
    const resp = await fetch(osmMapUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(9000),
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SolarSitePlanner/1.0 (https://localhost)',
      },
    });
    if (resp.ok) {
      const json = (await resp.json()) as { elements?: OsmElement[] };
      if (json && Array.isArray(json.elements)) {
        payload = json;
        usedMirror = 'api.openstreetmap.org/api/0.6/map.json';
      }
    }
  } catch {
    // Fallback to Overpass mirrors below
  }

  if (!payload) {
    const mirrors = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
    ];
    for (const endpoint of mirrors) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          signal: AbortSignal.timeout(8000),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Accept: 'application/json, */*',
            'User-Agent': 'SolarSitePlanner/1.0',
          },
          body: `data=${encodeURIComponent(overpassQuery)}`,
        });
        if (!resp.ok) continue;
        const json = (await resp.json()) as { elements?: OsmElement[] };
        if (json && Array.isArray(json.elements)) {
          payload = json;
          usedMirror = endpoint;
          break;
        }
      } catch {
        // Try next Overpass mirror
      }
    }
  }

  if (!payload || !Array.isArray(payload.elements)) {
    res.json({
      ok: false,
      buildings: [],
      count: 0,
      message: 'OpenStreetMap building database temporarily busy — trace roof corners directly or retry.',
    });
    return;
  }

  const nodeMap = new Map<number, [number, number]>();
  for (const el of payload.elements) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodeMap.set(el.id, [el.lat, el.lon]);
    }
  }

  const parseHeightM = (tags?: Record<string, string>): number => {
    if (!tags) return 6.4;
    const rawH = tags.height || tags['building:height'] || '';
    const numH = parseFloat(String(rawH).replace(/[^0-9.]/g, ''));
    if (Number.isFinite(numH) && numH >= 2.2 && numH <= 180) {
      return Number(numH.toFixed(1));
    }
    const levels = parseFloat(String(tags['building:levels'] || ''));
    if (Number.isFinite(levels) && levels >= 1 && levels <= 60) {
      return Number((levels * 3.1 + 0.6).toFixed(1));
    }
    return 6.4;
  };

  const buildings = payload.elements
    .filter(
      (el) =>
        el.type === 'way' &&
        Boolean(el.tags?.building) &&
        el.tags?.building !== 'no' &&
        Array.isArray(el.nodes) &&
        el.nodes.length >= 3
    )
    .map((way) => {
      const coords: Array<[number, number]> = [];
      for (const nodeId of way.nodes || []) {
        const pt = nodeMap.get(nodeId);
        if (pt) coords.push(pt);
      }
      if (coords.length >= 4) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        if (Math.abs(first[0] - last[0]) < 1e-7 && Math.abs(first[1] - last[1]) < 1e-7) {
          coords.pop();
        }
      }
      if (coords.length < 3) return null;
      const tags = way.tags || {};
      const bType = tags.building && tags.building !== 'yes' ? tags.building : '';
      const rawName = tags.name || tags['addr:housename'] || (bType ? `${bType.replace(/_/g, ' ')}` : '');
      return {
        osmId: way.id,
        name: rawName || `OSM Building #${way.id % 10000}`,
        buildingType: bType || 'building',
        heightM: parseHeightM(tags),
        levels: Number(tags['building:levels']) || undefined,
        roofShape: tags['roof:shape'] || 'flat',
        nodesLatLon: coords,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .slice(0, 32);

  res.json({
    ok: true,
    count: buildings.length,
    sourceMirror: usedMirror,
    buildings,
  });
}

type ServerInverterBrandId =
  | 'solarman'
  | 'growatt'
  | 'soliscloud'
  | 'sungrow'
  | 'goodwe'
  | 'fronius'
  | 'enphase'
  | 'custom_bridge';

interface ServerInverterProviderInfo {
  id: ServerInverterBrandId;
  name: string;
  portalName: string;
  subBrands: string;
  cloudApiConfigured: boolean;
  cloudApiMode: 'native_api' | 'custom_bridge';
  requiredFields: Array<'stationId' | 'loggerSerial'>;
  envVars: string[];
  csvExportHint: string;
}

function getServerInverterCatalog(): ServerInverterProviderInfo[] {
  const hasSolarman = Boolean(
    process.env.INVERTER_SOLARMAN_APP_ID &&
      process.env.INVERTER_SOLARMAN_APP_SECRET &&
      process.env.INVERTER_SOLARMAN_USERNAME &&
      process.env.INVERTER_SOLARMAN_PASSWORD
  );
  const hasSolis = Boolean(
    process.env.INVERTER_SOLIS_KEY_ID && process.env.INVERTER_SOLIS_KEY_SECRET
  );
  const hasGrowatt = Boolean(process.env.INVERTER_GROWATT_API_TOKEN);
  const hasSungrow = Boolean(
    process.env.INVERTER_SUNGROW_APP_KEY &&
      process.env.INVERTER_SUNGROW_ACCESS_KEY &&
      process.env.INVERTER_SUNGROW_TOKEN
  );
  const hasGoodwe = Boolean(
    process.env.INVERTER_GOODWE_ACCOUNT && process.env.INVERTER_GOODWE_PASSWORD
  );
  const hasFronius = Boolean(
    process.env.INVERTER_FRONIUS_ACCESS_KEY_ID && process.env.INVERTER_FRONIUS_ACCESS_KEY_VALUE
  );
  const hasEnphase = Boolean(
    process.env.INVERTER_ENPHASE_API_KEY && process.env.INVERTER_ENPHASE_ACCESS_TOKEN
  );
  const hasCustomBridge = Boolean(process.env.INVERTER_CUSTOM_BRIDGE_URL);

  return [
    {
      id: 'solarman',
      name: 'Solarman',
      portalName: 'Solarman Smart / Business',
      subBrands: 'Deye, V-Sole, KSolare, Sofar, Havells, Polycab, Luminous, Microtek',
      cloudApiConfigured: hasSolarman,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId', 'loggerSerial'],
      envVars: [
        'INVERTER_SOLARMAN_APP_ID',
        'INVERTER_SOLARMAN_APP_SECRET',
        'INVERTER_SOLARMAN_USERNAME',
        'INVERTER_SOLARMAN_PASSWORD',
      ],
      csvExportHint: 'Solarman Web → Plant → Statistics → Daily → Export CSV',
    },
    {
      id: 'growatt',
      name: 'Growatt',
      portalName: 'ShinePhone / ShineServer',
      subBrands: 'Growatt MIN, MIC, MOD, SPH, SPF Series',
      cloudApiConfigured: hasGrowatt,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId', 'loggerSerial'],
      envVars: ['INVERTER_GROWATT_API_TOKEN'],
      csvExportHint: 'ShineServer → Plant Energy → Daily Table → Export Excel/CSV',
    },
    {
      id: 'soliscloud',
      name: 'SolisCloud',
      portalName: 'SolisCloud Monitoring',
      subBrands: 'Ginlong Solis On-Grid & Hybrid Inverters',
      cloudApiConfigured: hasSolis,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId', 'loggerSerial'],
      envVars: ['INVERTER_SOLIS_KEY_ID', 'INVERTER_SOLIS_KEY_SECRET'],
      csvExportHint: 'SolisCloud → Plant → Report → Daily Generation CSV',
    },
    {
      id: 'sungrow',
      name: 'Sungrow',
      portalName: 'iSolarCloud',
      subBrands: 'Sungrow SG / SH Residential & C&I Series',
      cloudApiConfigured: hasSungrow,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId', 'loggerSerial'],
      envVars: [
        'INVERTER_SUNGROW_APP_KEY',
        'INVERTER_SUNGROW_ACCESS_KEY',
        'INVERTER_SUNGROW_TOKEN',
      ],
      csvExportHint: 'iSolarCloud → Report → Plant Daily Statistics → Export CSV',
    },
    {
      id: 'goodwe',
      name: 'GoodWe',
      portalName: 'SEMS Portal',
      subBrands: 'GoodWe DNS, XS, SDT, ET, EH Series',
      cloudApiConfigured: hasGoodwe,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId', 'loggerSerial'],
      envVars: ['INVERTER_GOODWE_ACCOUNT', 'INVERTER_GOODWE_PASSWORD'],
      csvExportHint: 'SEMS Portal → Reports → Power Station Daily Generation CSV',
    },
    {
      id: 'fronius',
      name: 'Fronius',
      portalName: 'Fronius Solar.web',
      subBrands: 'Fronius Primo, Symo, GEN24 Plus',
      cloudApiConfigured: hasFronius,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId'],
      envVars: ['INVERTER_FRONIUS_ACCESS_KEY_ID', 'INVERTER_FRONIUS_ACCESS_KEY_VALUE'],
      csvExportHint: 'Solar.web → Analysis → History → Export CSV',
    },
    {
      id: 'enphase',
      name: 'Enphase',
      portalName: 'Enphase Enlighten',
      subBrands: 'IQ7 / IQ8 Microinverters & IQ Combiner',
      cloudApiConfigured: hasEnphase,
      cloudApiMode: 'native_api',
      requiredFields: ['stationId'],
      envVars: ['INVERTER_ENPHASE_API_KEY', 'INVERTER_ENPHASE_ACCESS_TOKEN'],
      csvExportHint: 'Enphase App / Enlighten → Reports → Daily Energy Production CSV',
    },
    {
      id: 'custom_bridge',
      name: 'Custom JSON / HA Bridge',
      portalName: 'Home Assistant / Local REST Bridge',
      subBrands: 'Any inverter via Home Assistant, Node-RED, Solar Assistant, or custom JSON endpoint',
      cloudApiConfigured: hasCustomBridge,
      cloudApiMode: 'custom_bridge',
      requiredFields: ['stationId'],
      envVars: ['INVERTER_CUSTOM_BRIDGE_URL', 'INVERTER_CUSTOM_BRIDGE_TOKEN'],
      csvExportHint: 'CSV with Date, Generation (kWh), optional Consumption / Export / Import (kWh)',
    },
  ];
}

function toIstStamp(now: Date = new Date()): { dateKey: string; iso: string; ist: string } {
  const iso = now.toISOString();
  const istParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const istHuman =
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).format(now) + ' IST';
  return { dateKey: istParts, iso, ist: istHuman };
}

function readNumField(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) return val;
    if (typeof val === 'string' && val.trim() !== '') {
      const parsed = Number(val);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return undefined;
}

async function handleInverterSync(req: express.Request, res: express.Response) {
  const body = req.body || {};
  const brand = String(body.brand || 'solarman') as ServerInverterBrandId;
  const stationId = String(body.stationId || '').trim().slice(0, 80);
  const loggerSerial = String(body.loggerSerial || '').trim().slice(0, 80);

  const catalog = getServerInverterCatalog();
  const provider = catalog.find((p) => p.id === brand);
  if (!provider) {
    res.status(400).json({ ok: false, brand, error: 'Unsupported inverter brand selected.' });
    return;
  }

  if (!provider.cloudApiConfigured) {
    res.json({
      ok: false,
      brand,
      providerName: provider.name,
      needsServerCredentials: true,
      requiredEnvVars: provider.envVars,
      message: `${provider.name} Cloud API credentials are not yet configured in server environment secrets (${provider.envVars.join(', ')}). You can sync real generation right now using CSV Import or Quick Meter Entry.`,
    });
    return;
  }

  const stamp = toIstStamp(new Date());

  try {
    // 1. Solarman Open API (Deye, V-Sole, KSolare, Sofar, Havells, Polycab)
    if (brand === 'solarman') {
      const apiBase = (process.env.INVERTER_SOLARMAN_API_BASE || 'https://globalapi.solarmanpv.com').replace(
        /\/+$/,
        ''
      );
      const appId = process.env.INVERTER_SOLARMAN_APP_ID || '';
      const appSecret = process.env.INVERTER_SOLARMAN_APP_SECRET || '';
      const username = process.env.INVERTER_SOLARMAN_USERNAME || '';
      const passwordHash = crypto
        .createHash('sha256')
        .update(process.env.INVERTER_SOLARMAN_PASSWORD || '')
        .digest('hex');

      const tokenResp = await fetch(
        `${apiBase}/account/v1.0/token?appId=${encodeURIComponent(appId)}&language=en`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(9000),
          body: JSON.stringify({
            appSecret,
            email: username.includes('@') ? username : undefined,
            username: username.includes('@') ? undefined : username,
            password: passwordHash,
          }),
        }
      );
      const tokenJson = (await tokenResp.json()) as { access_token?: string; msg?: string };
      if (!tokenResp.ok || !tokenJson.access_token) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `Solarman authentication failed: ${tokenJson.msg || `HTTP ${tokenResp.status}`}`,
        });
        return;
      }

      if (!stationId) {
        res.status(400).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: 'Enter your Solarman Plant / Station ID to query live station telemetry.',
        });
        return;
      }

      const rtResp = await fetch(`${apiBase}/station/v1.0/realTime?language=en`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `bearer ${tokenJson.access_token}`,
        },
        signal: AbortSignal.timeout(9000),
        body: JSON.stringify({ stationId: Number(stationId) || stationId }),
      });
      const rtJson = (await rtResp.json()) as Record<string, unknown>;
      if (!rtResp.ok || rtJson.success === false) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `Solarman station sync error: ${String(rtJson.msg || `HTTP ${rtResp.status}`)}`,
        });
        return;
      }

      const livePowerW = readNumField(rtJson, ['generationPower']) ?? 0;
      const todayGenKwh = readNumField(rtJson, ['generationValue']) ?? 0;
      const todayUsageKwh = readNumField(rtJson, ['useValue']);
      const todayExportKwh = readNumField(rtJson, ['wireValue', 'gridValue']);
      const todayImportKwh = readNumField(rtJson, ['buyValue']);
      const lifetimeKwh = readNumField(rtJson, ['generationTotal']);
      const hasSmartMeter =
        todayUsageKwh !== undefined || todayExportKwh !== undefined || todayImportKwh !== undefined;

      res.json({
        ok: true,
        brand,
        providerName: provider.name,
        message: `Synced live Solarman station #${stationId}`,
        telemetry: {
          dateKey: stamp.dateKey,
          todayGenKwh: Number(todayGenKwh.toFixed(2)),
          livePowerKw: Number((livePowerW / 1000).toFixed(2)),
          ...(todayUsageKwh !== undefined ? { todayUsageKwh: Number(todayUsageKwh.toFixed(2)) } : {}),
          ...(todayExportKwh !== undefined ? { todayExportKwh: Number(todayExportKwh.toFixed(2)) } : {}),
          ...(todayImportKwh !== undefined ? { todayImportKwh: Number(todayImportKwh.toFixed(2)) } : {}),
          ...(lifetimeKwh !== undefined ? { lifetimeKwh: Number(lifetimeKwh.toFixed(1)) } : {}),
          hasSmartMeter,
          syncedAtIso: stamp.iso,
          syncedAtIst: stamp.ist,
          statusNote: `Solarman live API · Station ${stationId}`,
        },
      });
      return;
    }

    // 2. SolisCloud API (HMAC-SHA1 signed request)
    if (brand === 'soliscloud') {
      const apiBase = (process.env.INVERTER_SOLIS_API_BASE || 'https://www.soliscloud.com:13333').replace(
        /\/+$/,
        ''
      );
      const keyId = process.env.INVERTER_SOLIS_KEY_ID || '';
      const keySecret = process.env.INVERTER_SOLIS_KEY_SECRET || '';
      if (!stationId && !loggerSerial) {
        res.status(400).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: 'Enter your SolisCloud Station ID or Inverter Serial Number.',
        });
        return;
      }

      const apiPath = loggerSerial ? '/v1/api/inverterDetail' : '/v1/api/stationDetail';
      const reqBodyStr = JSON.stringify(loggerSerial ? { sn: loggerSerial } : { id: stationId });
      const contentMd5 = crypto.createHash('md5').update(reqBodyStr).digest('base64');
      const gmtDate = new Date().toUTCString();
      const canonical = `POST\n${contentMd5}\napplication/json\n${gmtDate}\n${apiPath}`;
      const signature = crypto
        .createHmac('sha1', keySecret)
        .update(canonical)
        .digest('base64');

      const solisResp = await fetch(`${apiBase}${apiPath}`, {
        method: 'POST',
        signal: AbortSignal.timeout(9000),
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Content-MD5': contentMd5,
          Date: gmtDate,
          Authorization: `API ${keyId}:${signature}`,
        },
        body: reqBodyStr,
      });
      const solisJson = (await solisResp.json()) as {
        success?: boolean;
        msg?: string;
        data?: Record<string, unknown>;
      };
      if (!solisResp.ok || !solisJson.success || !solisJson.data) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `SolisCloud sync failed: ${solisJson.msg || `HTTP ${solisResp.status}`}`,
        });
        return;
      }

      const d = solisJson.data;
      const todayGenKwh = readNumField(d, ['eToday', 'dayEnergy']) ?? 0;
      const livePowerKw = readNumField(d, ['pac', 'power']) ?? 0;
      const todayUsageKwh = readNumField(d, ['homeLoadTodayEnergy', 'familyLoadPowerToday']);
      const todayExportKwh = readNumField(d, ['gridSellTodayEnergy']);
      const todayImportKwh = readNumField(d, ['gridPurchasedTodayEnergy']);
      const lifetimeKwh = readNumField(d, ['eTotal', 'allEnergy']);
      const hasSmartMeter =
        todayUsageKwh !== undefined || todayExportKwh !== undefined || todayImportKwh !== undefined;

      res.json({
        ok: true,
        brand,
        providerName: provider.name,
        message: `Synced live SolisCloud telemetry (${loggerSerial || stationId})`,
        telemetry: {
          dateKey: stamp.dateKey,
          todayGenKwh: Number(todayGenKwh.toFixed(2)),
          livePowerKw: Number(livePowerKw.toFixed(2)),
          ...(todayUsageKwh !== undefined ? { todayUsageKwh: Number(todayUsageKwh.toFixed(2)) } : {}),
          ...(todayExportKwh !== undefined ? { todayExportKwh: Number(todayExportKwh.toFixed(2)) } : {}),
          ...(todayImportKwh !== undefined ? { todayImportKwh: Number(todayImportKwh.toFixed(2)) } : {}),
          ...(lifetimeKwh !== undefined ? { lifetimeKwh: Number(lifetimeKwh.toFixed(1)) } : {}),
          hasSmartMeter,
          syncedAtIso: stamp.iso,
          syncedAtIst: stamp.ist,
          statusNote: `SolisCloud live API · ${loggerSerial || stationId}`,
        },
      });
      return;
    }

    // 3. Growatt ShineServer OpenAPI
    if (brand === 'growatt') {
      const apiBase = (process.env.INVERTER_GROWATT_API_BASE || 'https://openapi.growatt.com').replace(
        /\/+$/,
        ''
      );
      const token = process.env.INVERTER_GROWATT_API_TOKEN || '';
      if (!stationId) {
        res.status(400).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: 'Enter your Growatt Plant ID to fetch live generation.',
        });
        return;
      }
      const gResp = await fetch(
        `${apiBase}/v1/plant/data?plant_id=${encodeURIComponent(stationId)}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(9000),
          headers: { token },
        }
      );
      const gJson = (await gResp.json()) as {
        error_code?: number;
        error_msg?: string;
        data?: Record<string, unknown>;
      };
      if (!gResp.ok || (gJson.error_code && gJson.error_code !== 0) || !gJson.data) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `Growatt OpenAPI sync failed: ${gJson.error_msg || `HTTP ${gResp.status}`}`,
        });
        return;
      }
      const d = gJson.data;
      const todayGenKwh = readNumField(d, ['today_energy', 'eToday']) ?? 0;
      const rawPowerW = readNumField(d, ['current_power', 'pac']) ?? 0;
      const livePowerKw = rawPowerW > 50 ? rawPowerW / 1000 : rawPowerW;
      const lifetimeKwh = readNumField(d, ['total_energy', 'eTotal']);
      const todayUsageKwh = readNumField(d, ['today_load_energy', 'use_energy_today']);
      const todayExportKwh = readNumField(d, ['today_export_energy', 'grid_sell_today']);
      const todayImportKwh = readNumField(d, ['today_import_energy', 'grid_buy_today']);
      const hasSmartMeter =
        todayUsageKwh !== undefined || todayExportKwh !== undefined || todayImportKwh !== undefined;

      res.json({
        ok: true,
        brand,
        providerName: provider.name,
        message: `Synced live Growatt plant #${stationId}`,
        telemetry: {
          dateKey: stamp.dateKey,
          todayGenKwh: Number(todayGenKwh.toFixed(2)),
          livePowerKw: Number(livePowerKw.toFixed(2)),
          ...(todayUsageKwh !== undefined ? { todayUsageKwh: Number(todayUsageKwh.toFixed(2)) } : {}),
          ...(todayExportKwh !== undefined ? { todayExportKwh: Number(todayExportKwh.toFixed(2)) } : {}),
          ...(todayImportKwh !== undefined ? { todayImportKwh: Number(todayImportKwh.toFixed(2)) } : {}),
          ...(lifetimeKwh !== undefined ? { lifetimeKwh: Number(lifetimeKwh.toFixed(1)) } : {}),
          hasSmartMeter,
          syncedAtIso: stamp.iso,
          syncedAtIst: stamp.ist,
          statusNote: `Growatt ShineServer API · Plant ${stationId}`,
        },
      });
      return;
    }

    // 4. Custom JSON / Home Assistant / Local Bridge
    if (brand === 'custom_bridge') {
      const bridgeUrl = process.env.INVERTER_CUSTOM_BRIDGE_URL || '';
      const bridgeToken = process.env.INVERTER_CUSTOM_BRIDGE_TOKEN || '';
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(bridgeUrl);
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          throw new Error('Bridge URL must be http or https.');
        }
      } catch {
        res.status(400).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: 'INVERTER_CUSTOM_BRIDGE_URL is not a valid HTTP/HTTPS URL.',
        });
        return;
      }

      const headers: Record<string, string> = { Accept: 'application/json' };
      if (bridgeToken) headers.Authorization = `Bearer ${bridgeToken}`;

      const bResp = await fetch(parsedUrl.toString(), {
        method: 'GET',
        signal: AbortSignal.timeout(9000),
        headers,
      });
      if (!bResp.ok) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `Custom bridge returned HTTP ${bResp.status}.`,
        });
        return;
      }

      const raw = (await bResp.json()) as Record<string, unknown>;
      const dataObj =
        raw && typeof raw.data === 'object' && raw.data !== null
          ? (raw.data as Record<string, unknown>)
          : raw;

      const todayGenKwh =
        readNumField(dataObj, [
          'todayGenKwh',
          'generation_kwh',
          'pv_today_kwh',
          'eToday',
          'daily_generation',
        ]) ?? 0;
      const livePowerKw =
        readNumField(dataObj, ['livePowerKw', 'power_kw', 'pv_power_kw', 'pac_kw']) ??
        ((readNumField(dataObj, ['livePowerW', 'power_w', 'pac']) ?? 0) / 1000);
      const todayUsageKwh = readNumField(dataObj, [
        'todayUsageKwh',
        'consumption_kwh',
        'load_today_kwh',
        'home_load_kwh',
      ]);
      const todayExportKwh = readNumField(dataObj, [
        'todayExportKwh',
        'export_kwh',
        'grid_export_kwh',
        'feed_in_kwh',
      ]);
      const todayImportKwh = readNumField(dataObj, [
        'todayImportKwh',
        'import_kwh',
        'grid_import_kwh',
      ]);
      const lifetimeKwh = readNumField(dataObj, ['lifetimeKwh', 'total_kwh', 'eTotal']);
      const hasSmartMeter =
        todayUsageKwh !== undefined || todayExportKwh !== undefined || todayImportKwh !== undefined;

      res.json({
        ok: true,
        brand,
        providerName: provider.name,
        message: 'Synced live telemetry from Custom JSON Bridge',
        telemetry: {
          dateKey: stamp.dateKey,
          todayGenKwh: Number(todayGenKwh.toFixed(2)),
          livePowerKw: Number(livePowerKw.toFixed(2)),
          ...(todayUsageKwh !== undefined ? { todayUsageKwh: Number(todayUsageKwh.toFixed(2)) } : {}),
          ...(todayExportKwh !== undefined ? { todayExportKwh: Number(todayExportKwh.toFixed(2)) } : {}),
          ...(todayImportKwh !== undefined ? { todayImportKwh: Number(todayImportKwh.toFixed(2)) } : {}),
          ...(lifetimeKwh !== undefined ? { lifetimeKwh: Number(lifetimeKwh.toFixed(1)) } : {}),
          hasSmartMeter,
          syncedAtIso: stamp.iso,
          syncedAtIst: stamp.ist,
          statusNote: `Custom JSON Bridge · ${parsedUrl.hostname}`,
        },
      });
      return;
    }

    // 5. Enphase Enlighten v4
    if (brand === 'enphase') {
      const apiKey = process.env.INVERTER_ENPHASE_API_KEY || '';
      const accessToken = process.env.INVERTER_ENPHASE_ACCESS_TOKEN || '';
      if (!stationId) {
        res.status(400).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: 'Enter your Enphase System ID to fetch live telemetry.',
        });
        return;
      }
      const eResp = await fetch(
        `https://api.enphaseenergy.com/api/v4/systems/${encodeURIComponent(stationId)}/summary?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'GET',
          signal: AbortSignal.timeout(9000),
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const eJson = (await eResp.json()) as Record<string, unknown>;
      if (!eResp.ok) {
        res.status(502).json({
          ok: false,
          brand,
          providerName: provider.name,
          error: `Enphase API error: HTTP ${eResp.status}`,
        });
        return;
      }
      const energyTodayWh = readNumField(eJson, ['energy_today']) ?? 0;
      const currentPowerW = readNumField(eJson, ['current_power']) ?? 0;
      const energyLifetimeWh = readNumField(eJson, ['energy_lifetime']);
      res.json({
        ok: true,
        brand,
        providerName: provider.name,
        message: `Synced live Enphase System #${stationId}`,
        telemetry: {
          dateKey: stamp.dateKey,
          todayGenKwh: Number((energyTodayWh / 1000).toFixed(2)),
          livePowerKw: Number((currentPowerW / 1000).toFixed(2)),
          ...(energyLifetimeWh !== undefined
            ? { lifetimeKwh: Number((energyLifetimeWh / 1000).toFixed(1)) }
            : {}),
          hasSmartMeter: false,
          syncedAtIso: stamp.iso,
          syncedAtIst: stamp.ist,
          statusNote: `Enphase Enlighten v4 · System ${stationId}`,
        },
      });
      return;
    }

    // Remaining configured ecosystems (Sungrow / GoodWe / Fronius): honest endpoint guidance
    res.json({
      ok: false,
      brand,
      providerName: provider.name,
      message: `${provider.name} region-specific OAuth handshake requires a regional bridge URL. Configure INVERTER_CUSTOM_BRIDGE_URL or import your ${provider.name} daily CSV export directly.`,
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      brand,
      providerName: provider.name,
      error:
        err instanceof Error
          ? `Inverter cloud request failed: ${err.message}`
          : 'Inverter cloud request timed out.',
    });
  }
}

async function startServer() {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'solar-planner-api',
      rollingWindow: computeServerRollingWindow(new Date()),
    });
  });

  app.get('/api/tariff/realtime', handleRealtimeTariffLookup);
  app.get('/api/map-tile', handleMapTileProxy);
  app.get('/api/osm-buildings', handleOsmBuildingsLookup);
  app.get('/api/inverter/providers', (_req, res) => {
    res.json({ ok: true, providers: getServerInverterCatalog() });
  });
  app.post('/api/inverter/sync', handleInverterSync);

  app.post('/api/utility/captcha', async (_req, res) => {
    const challenge = await generateTgspdclCaptcha();
    if (!challenge) {
      res.status(502).json({
        ok: false,
        error: 'Could not load CAPTCHA from TGSPDCL portal. Please retry.',
      });
      return;
    }
    res.json({ ok: true, ...challenge });
  });

  app.post('/api/utility/service-usage', handleServiceUsageLookup);
  app.post('/api/discom/lookup', handleServiceUsageLookup);

  app.use('/api', (_req, res) => {
    res.status(404).json({ ok: false, error: 'API route not found.' });
  });

  const isProd = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (isProd && fs.existsSync(distDir)) {
    app.use(
      express.static(distDir, {
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false, allowedHosts: true },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result?.code) {
          return next();
        }
        const patchedCode = result.code.replace(
          /const createWebSocketModuleRunnerTransport = \([^)]*\) => \{[\s\S]*?\n\};/,
          'const createWebSocketModuleRunnerTransport = () => ({ async connect() {}, disconnect() {}, send() {} });',
        );
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
        res.send(patchedCode);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
