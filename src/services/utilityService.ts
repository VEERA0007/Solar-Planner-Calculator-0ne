import { MonthlyBillRecord } from '../types/solar';
import { GridCategory } from '../data/gridTariffs';
import {
  ConnectionNumberType,
  FourStateId,
  IdentifiedUscMatch,
  ServiceNumberValidationResult,
  alignRecordsToRolling12Months,
  buildStateSeasonal12MonthTemplate,
  computeExactDiscomBill,
  estimateUnitsFromExactBill,
  getCorrectionFactorForAccount,
  getIndiaClockInfo,
  getRollingMonths,
  identifyServiceFromUsc,
  resolveUscParameter,
  validateServiceNumber,
} from '../data/uscPortals';
import { computeLatest12MonthSummary } from '../utils/monthlyAverage';

export interface FetchServiceUsageOptions {
  preferredStateId?: FourStateId;
  categoryHint?: GridCategory;
  currentMonthlyUnits?: number;
  latestBillInr?: number;
  latestUnitsKwh?: number;
  anchorYearMonth?: string;
  requestedMonths?: 12 | 13 | 24;
  captchaId?: string;
  captchaAnswer?: string;
  mobileNumber?: string;
  useCustomAnchor?: boolean;
  isSamplePreset?: boolean;
  referenceDate?: Date;
}

export interface LivePortalBillRecord {
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
  sourcePortal?: string;
  isFromHistoryFallback?: boolean;
}

export interface PortalCaptchaChallenge {
  captchaId: string;
  image: string;
  provider: string;
  hint: string;
}

export type PortalVerificationStep =
  | 'none'
  | 'captcha_required'
  | 'mobile_required'
  | 'not_found'
  | 'portal_manual_or_paste';

export interface Utility12MonthFetchResult {
  ok: boolean;
  validation: ServiceNumberValidationResult;
  match?: IdentifiedUscMatch;
  serviceNumber?: string;
  uscNumber?: string;
  identifiedNumberType?: ConnectionNumberType;
  consumerAlias?: string;
  sourceLabel?: string;
  portalMessage?: string;
  portalReachable?: boolean | null;
  requiresPortalVerification?: boolean;
  verificationStep?: PortalVerificationStep;
  captchaChallenge?: PortalCaptchaChallenge | null;
  verifiedMonthsCount?: number;
  dataSourceMode?:
    | 'live_portal_history'
    | 'live_portal_bill'
    | 'user_bill_calibrated'
    | 'inbuilt_reference'
    | 'portal_auth_required';
  livePortalBill?: LivePortalBillRecord | null;
  syncedAtIst?: string;
  sanctionedLoadKw?: number;
  phaseType?: 'single_phase' | 'three_phase';
  rollingWindow?: {
    startMonth: string;
    endMonth: string;
    totalMonths: number;
    anchorYearMonth?: string;
    previousYearMonthsCount: number;
    runningMonthLabel: string;
  };
  months?: MonthlyBillRecord[];
  avgMonthlyUnits?: number;
  avgMonthlyBill?: number;
  error?: string;
}

export async function refreshPortalCaptcha(): Promise<PortalCaptchaChallenge | null> {
  try {
    const resp = await fetch('/api/utility/captcha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({}),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data?.captchaId && data?.image) {
      return {
        captchaId: String(data.captchaId),
        image: String(data.image),
        provider: String(data.provider || 'TGSPDCL'),
        hint: String(data.hint || 'Enter security code'),
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Validates the USC Number against 4-state DISCOM regex patterns and connects
 * directly to official DISCOM portal endpoints (TGSPDCL, APEPDCL, APSPDCL)
 * using strict USC-only parameters.
 */
export async function fetchLast12MonthsUsageByServiceNumber(
  uscNumberInput: string,
  options: FetchServiceUsageOptions = {}
): Promise<Utility12MonthFetchResult> {
  const referenceDate = options.referenceDate || new Date();
  const requestedMonths: 12 | 13 | 24 =
    options.requestedMonths === 24 ? 24 : options.requestedMonths === 13 ? 13 : 12;
  const anchorYearMonth = options.anchorYearMonth?.trim() || undefined;

  const lookupInput = uscNumberInput.trim();
  const validation = validateServiceNumber(lookupInput, options.preferredStateId);

  if (!validation.isValid) {
    return {
      ok: false,
      validation,
      error: validation.errorMessage || 'Invalid USC Number format.',
    };
  }

  const effectiveStateHint = validation.matchedStateId || options.preferredStateId;
  const paramResolution = resolveUscParameter(lookupInput, effectiveStateHint);
  const preferredLookupNumber = paramResolution.uscNumber || validation.normalized;

  const match = identifyServiceFromUsc(
    preferredLookupNumber,
    effectiveStateHint,
    referenceDate
  );
  const clockInfo = getIndiaClockInfo(referenceDate);
  const rollingSlots = getRollingMonths(requestedMonths, referenceDate, anchorYearMonth);
  let resolvedSanctionedLoadKw = match.inbuiltProfile?.sanctionedLoadKw;
  let resolvedPhaseType: 'single_phase' | 'three_phase' | undefined = undefined;
  const fallbackLoadKw = resolvedSanctionedLoadKw || 2;
  const effectiveCategory = options.categoryHint || match.category;

  const userActualUnits =
    options.latestUnitsKwh && options.latestUnitsKwh > 0 ? Math.round(options.latestUnitsKwh) : 0;
  const userActualBill =
    options.latestBillInr && options.latestBillInr > 0 ? Math.round(options.latestBillInr) : 0;
  const hasManualCalibration = userActualUnits > 0 || userActualBill > 0;
  const isSamplePreset = Boolean(options.isSamplePreset && match.inbuiltProfile);

  const buildLocalUserCalibrated = (): MonthlyBillRecord[] | undefined => {
    if (isSamplePreset && match.inbuiltProfile) {
      return buildStateSeasonal12MonthTemplate(
        match.inbuiltProfile.uscNumber,
        match.stateId,
        match.category,
        match.inbuiltProfile.baseMonthlyUnits,
        match.inbuiltProfile.sanctionedLoadKw,
        referenceDate,
        requestedMonths,
        anchorYearMonth
      );
    }
    if (!hasManualCalibration) return undefined;

    const accountFactorEntry = getCorrectionFactorForAccount(paramResolution.uscNumber);
    const billOpts = accountFactorEntry
      ? {
          accountNumber: paramResolution.uscNumber,
          correctionFactor: accountFactorEntry.factor,
          fixedOffsetInr: accountFactorEntry.fixedOffsetInr,
        }
      : undefined;

    const anchorU =
      userActualUnits > 0
        ? userActualUnits
        : Math.max(
            20,
            estimateUnitsFromExactBill(
              userActualBill,
              match.stateId,
              effectiveCategory,
              fallbackLoadKw,
              billOpts
            )
          );

    const template = buildStateSeasonal12MonthTemplate(
      match.normalizedUsc,
      match.stateId,
      effectiveCategory,
      anchorU,
      fallbackLoadKw,
      referenceDate,
      requestedMonths,
      anchorYearMonth
    );

    return template.map((row, idx) => {
      const isLastSlot = idx === template.length - 1;
      if (!isLastSlot) return { ...row, isVerifiedPortalData: false };
      if (userActualUnits > 0) {
        return {
          ...row,
          unitsKwh: userActualUnits,
          billAmountInr:
            userActualBill > 0
              ? userActualBill
              : computeExactDiscomBill(
                  userActualUnits,
                  match.stateId,
                  effectiveCategory,
                  fallbackLoadKw,
                  billOpts
                ),
          isVerifiedPortalData: false,
        };
      }
      return {
        ...row,
        unitsKwh: anchorU,
        billAmountInr: userActualBill,
        isVerifiedPortalData: false,
      };
    });
  };

  let portalMessage = isSamplePreset
    ? `Loaded ${match.discom.shortName} demo ${requestedMonths}-mo tariff preset (${rollingSlots[0].month} → ${rollingSlots[rollingSlots.length - 1].month}).`
    : `Connecting to official ${match.discom.shortName} portal...`;
  let portalReachable: boolean | null = null;
  let requiresPortalVerification = !isSamplePreset;
  let verificationStep: PortalVerificationStep = isSamplePreset ? 'none' : 'portal_manual_or_paste';
  let captchaChallenge: PortalCaptchaChallenge | null = null;
  let verifiedMonthsCount = 0;
  let dataSourceMode: Utility12MonthFetchResult['dataSourceMode'] = isSamplePreset
    ? 'inbuilt_reference'
    : hasManualCalibration
    ? 'user_bill_calibrated'
    : 'portal_auth_required';
  let livePortalBill: LivePortalBillRecord | null = null;
  let syncedAtIst = clockInfo.formattedIst;
  let mappedRecords: MonthlyBillRecord[] | undefined = buildLocalUserCalibrated();
  let consumerAlias = isSamplePreset && match.inbuiltProfile
    ? `${match.inbuiltProfile.consumerAlias} (Demo)`
    : `${match.discom.shortName} USC #${match.normalizedUsc}`;
  let sourceLabel = isSamplePreset
    ? `${match.discom.shortName} Demo Sample (${requestedMonths}M)`
    : hasManualCalibration
    ? `${match.discom.shortName} Slab-Calibrated (${requestedMonths}M)`
    : `${match.discom.shortName} Live Portal Verification Required`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14000);

  try {
    const response = await fetch('/api/utility/service-usage', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        serviceNumber: preferredLookupNumber,
        uscNumber: preferredLookupNumber,
        identifiedNumberType: paramResolution.primaryType,
        stateId: match.stateId,
        discomId: match.discom.discomId,
        category: effectiveCategory,
        sanctionedLoadKw: resolvedSanctionedLoadKw || 4,
        correctionFactor:
          getCorrectionFactorForAccount(paramResolution.uscNumber)?.factor ?? 1,
        fixedOffsetInr:
          getCorrectionFactorForAccount(paramResolution.uscNumber)?.fixedOffsetInr ?? 0,
        latestBillInr: userActualBill,
        latestUnitsKwh: userActualUnits,
        anchorMonthlyUnits: match.inbuiltProfile?.baseMonthlyUnits || 0,
        anchorYearMonth,
        useCustomAnchor: Boolean(options.useCustomAnchor),
        requestedMonths,
        isSamplePreset,
        captchaId: options.captchaId,
        captchaAnswer: options.captchaAnswer,
        mobileNumber: options.mobileNumber,
        portalUrl: match.discom.portalUrl,
        billHistoryUrl: match.discom.billHistoryUrl,
      }),
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = await response.json();
      portalReachable = Boolean(data.portalReachable);
      requiresPortalVerification = Boolean(data.requiresPortalVerification);
      verificationStep = (data.verificationStep as PortalVerificationStep) || 'none';
      captchaChallenge = data.captchaChallenge || null;
      livePortalBill = data.livePortalBill || null;
      verifiedMonthsCount = Number(data.verifiedMonthsCount || 0);

      if (typeof data.sanctionedLoadKw === 'number' && data.sanctionedLoadKw > 0) {
        resolvedSanctionedLoadKw = data.sanctionedLoadKw;
      } else if (
        typeof livePortalBill?.contractedLoadKw === 'number' &&
        livePortalBill.contractedLoadKw > 0
      ) {
        resolvedSanctionedLoadKw = livePortalBill.contractedLoadKw;
      }
      if (data.phaseType === 'single_phase' || data.phaseType === 'three_phase') {
        resolvedPhaseType = data.phaseType;
      } else if (livePortalBill?.phaseType) {
        resolvedPhaseType = livePortalBill.phaseType;
      }

      if (data.rollingWindow?.serverTimeIst) {
        syncedAtIst = String(data.rollingWindow.serverTimeIst);
      }

      if (livePortalBill?.consumerName) {
        consumerAlias = livePortalBill.consumerName;
      }

      if (data.dataSourceMode === 'live_portal_history') {
        dataSourceMode = 'live_portal_history';
        sourceLabel = `Verified Live · ${match.discom.shortName} Official Portal History`;
      } else if (data.dataSourceMode === 'live_portal_bill' || livePortalBill) {
        dataSourceMode = 'live_portal_bill';
        sourceLabel = `Verified Live · ${match.discom.shortName} Latest e-Bill`;
      } else if (data.dataSourceMode === 'inbuilt_reference') {
        dataSourceMode = 'inbuilt_reference';
        sourceLabel = `${match.discom.shortName} Demo Sample`;
      } else if (data.dataSourceMode === 'user_bill_calibrated' || hasManualCalibration) {
        dataSourceMode = 'user_bill_calibrated';
        sourceLabel = `${match.discom.shortName} Calibrated to Your Actual Bill`;
      } else {
        dataSourceMode = 'portal_auth_required';
        sourceLabel = `${match.discom.shortName} · Action Needed`;
      }

      if (Array.isArray(data.usage12Months) && data.usage12Months.length >= 1) {
        const apiCount: 12 | 13 | 24 =
          data.usage12Months.length > 13 || requestedMonths === 24
            ? 24
            : data.usage12Months.length === 13 || requestedMonths === 13
            ? 13
            : 12;
        const apiAnchor =
          typeof data.rollingWindow?.anchorYearMonth === 'string'
            ? data.rollingWindow.anchorYearMonth
            : anchorYearMonth;
        const fallbackSlots = getRollingMonths(apiCount, referenceDate, apiAnchor);
        const round2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
        const sanitizedFromApi: MonthlyBillRecord[] = data.usage12Months.map(
          (row: Partial<MonthlyBillRecord>, idx: number) => {
            const fbSlot = fallbackSlots[Math.min(idx, fallbackSlots.length - 1)];
            return {
              month: String(row.month || fbSlot.month),
              shortLabel: row.shortLabel || fbSlot.shortLabel,
              calendarMonth0:
                typeof row.calendarMonth0 === 'number'
                  ? row.calendarMonth0
                  : fbSlot.calendarMonth0,
              year: typeof row.year === 'number' ? row.year : fbSlot.year,
              sequenceNo: typeof row.sequenceNo === 'number' ? row.sequenceNo : idx + 1,
              isRunningMonth: Boolean(row.isRunningMonth ?? idx === data.usage12Months.length - 1),
              isVerifiedPortalData: Boolean(row.isVerifiedPortalData),
              unitsKwh: Math.max(0, Math.round(Number(row.unitsKwh) || 0)),
              billAmountInr: Math.max(0, round2(row.billAmountInr)),
              ...(typeof row.demandInr === 'number' ? { demandInr: round2(row.demandInr) } : {}),
              ...(typeof row.paidInr === 'number' ? { paidInr: round2(row.paidInr) } : {}),
              ...(typeof row.openingBalanceInr === 'number'
                ? { openingBalanceInr: round2(row.openingBalanceInr) }
                : {}),
              ...(typeof row.closingBalanceInr === 'number'
                ? { closingBalanceInr: round2(row.closingBalanceInr) }
                : {}),
              ...(typeof row.adjustmentInr === 'number'
                ? { adjustmentInr: round2(row.adjustmentInr) }
                : {}),
              ...(row.receiptNo ? { receiptNo: String(row.receiptNo) } : {}),
              ...(row.paidDate ? { paidDate: String(row.paidDate) } : {}),
            };
          }
        );
        mappedRecords =
          sanitizedFromApi.length >= 12 &&
          sanitizedFromApi.every((r) => typeof r.year === 'number' && typeof r.calendarMonth0 === 'number')
            ? sanitizedFromApi
            : alignRecordsToRolling12Months(
                sanitizedFromApi,
                match.stateId,
                effectiveCategory,
                referenceDate,
                apiCount,
                apiAnchor
              );
      } else {
        mappedRecords = hasManualCalibration ? buildLocalUserCalibrated() : undefined;
      }

      if (data.message) {
        portalMessage = String(data.message);
      }
    }
  } catch {
    clearTimeout(timeoutId);
  }

  if (!mappedRecords || mappedRecords.length === 0) {
    return {
      ok: true,
      validation,
      match,
      serviceNumber: preferredLookupNumber,
      uscNumber: preferredLookupNumber,
      identifiedNumberType: paramResolution.primaryType,
      consumerAlias,
      sourceLabel,
      portalMessage,
      portalReachable,
      requiresPortalVerification,
      verificationStep,
      captchaChallenge,
      verifiedMonthsCount,
      dataSourceMode,
      livePortalBill,
      syncedAtIst,
      sanctionedLoadKw: resolvedSanctionedLoadKw,
      phaseType: resolvedPhaseType,
      rollingWindow: {
        startMonth: rollingSlots[0].month,
        endMonth: rollingSlots[rollingSlots.length - 1].month,
        totalMonths: rollingSlots.length,
        anchorYearMonth,
        previousYearMonthsCount: rollingSlots.filter((r) => r.year < clockInfo.year).length,
        runningMonthLabel: rollingSlots[rollingSlots.length - 1].month,
      },
      months: undefined,
    };
  }

  // Calculate exact averages strictly across the latest 12 billed months (dividing by available billed months up to 12)
  const latest12Summary = computeLatest12MonthSummary(mappedRecords);
  const avgMonthlyUnits = latest12Summary.avgUnits;
  const avgMonthlyBill = latest12Summary.avgBill;
  const previousYearMonthsCount = mappedRecords.filter(
    (r) => (r.year || 0) < clockInfo.year
  ).length;

  return {
    ok: true,
    validation,
    match,
    serviceNumber: preferredLookupNumber,
    uscNumber: livePortalBill?.uscno || preferredLookupNumber,
    identifiedNumberType: paramResolution.primaryType,
    consumerAlias,
    sourceLabel,
    portalMessage,
    portalReachable,
    requiresPortalVerification,
    verificationStep,
    captchaChallenge,
    verifiedMonthsCount: latest12Summary.totalVerifiedInDataset || verifiedMonthsCount,
    dataSourceMode,
    livePortalBill,
    syncedAtIst,
    sanctionedLoadKw: resolvedSanctionedLoadKw,
    phaseType: resolvedPhaseType,
    rollingWindow: {
      startMonth: mappedRecords[0].month,
      endMonth: mappedRecords[mappedRecords.length - 1].month,
      totalMonths: mappedRecords.length,
      anchorYearMonth,
      previousYearMonthsCount,
      runningMonthLabel: mappedRecords[mappedRecords.length - 1].month,
    },
    months: mappedRecords,
    avgMonthlyUnits,
    avgMonthlyBill,
  };
}
