import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  ExternalLink,
  CheckCircle2,
  Building2,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  Globe,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
  ShieldCheck,
  Smartphone,
  Receipt,
} from 'lucide-react';
import { MonthlyBillRecord, UscHistoryEntry } from '../types/solar';
import {
  DISCOM_PORTAL_SPECS,
  FOUR_STATES_LIST,
  FourStateId,
  alignRecordsToRolling12Months,
  getIndiaClockInfo,
  getRollingMonths,
  identifyConnectionNumberType,
  identifyServiceFromUsc,
  parsePasted12MonthBills,
  resolveUscParameter,
  validateServiceNumber,
} from '../data/uscPortals';
import {
  LivePortalBillRecord,
  PortalCaptchaChallenge,
  PortalVerificationStep,
  fetchLast12MonthsUsageByServiceNumber,
  refreshPortalCaptcha,
} from '../services/utilityService';
import { computeLatest12MonthSummary } from '../utils/monthlyAverage';

interface UscBillFetchPanelProps {
  initialUscNumber?: string;
  initialStateId?: string;
  initialHistory?: MonthlyBillRecord[];
  currentTariffPerKwh: number;
  onApply12MonthData: (payload: {
    uscNumber: string;
    stateId: FourStateId;
    stateName: string;
    discomId: string;
    discomShortName: string;
    consumerCategory: 'residential' | 'commercial' | 'agricultural';
    tariffPerKwh: number;
    sanctionedLoadKw?: number;
    phaseType?: 'single_phase' | 'three_phase';
    avgMonthlyUnits: number;
    avgMonthlyBill: number;
    months: MonthlyBillRecord[];
  }) => void;
  onRecordUscHistory?: (entry: UscHistoryEntry) => void;
  autoFetchSignal?: {
    uscNumber?: string;
    stateId?: FourStateId;
    nonce: number;
  } | null;
}

interface PortalLookupStatus {
  loading: boolean;
  sourceLabel: string;
  portalMessage: string | null;
  portalReachable: boolean | null;
  verificationStep: PortalVerificationStep;
  syncedAtIst: string;
}

const formatInr = (val: number | undefined): string =>
  Number(val || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const UscBillFetchPanel: React.FC<UscBillFetchPanelProps> = ({
  initialUscNumber = '',
  initialStateId,
  initialHistory,
  currentTariffPerKwh,
  onApply12MonthData,
  onRecordUscHistory,
  autoFetchSignal = null,
}) => {
  const validInitialState: FourStateId =
    initialStateId === 'telangana' ||
    initialStateId === 'andhra_pradesh' ||
    initialStateId === 'odissa' ||
    initialStateId === 'chandigarh'
      ? initialStateId
      : 'telangana';

  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const clockInfo = useMemo(() => getIndiaClockInfo(liveNow), [liveNow]);
  const defaultAnchorYm = useMemo(
    () => `${clockInfo.year}-${String(clockInfo.month0 + 1).padStart(2, '0')}`,
    [clockInfo.year, clockInfo.month0]
  );

  const [hasUserEditedAnchor, setHasUserEditedAnchor] = useState<boolean>(false);
  const [searchAnchorMonth, setSearchAnchorMonth] = useState<string>(() => {
    if (initialHistory && initialHistory.length > 0) {
      const last = initialHistory[initialHistory.length - 1];
      if (typeof last.year === 'number' && typeof last.calendarMonth0 === 'number') {
        return `${last.year}-${String(last.calendarMonth0 + 1).padStart(2, '0')}`;
      }
    }
    const c = getIndiaClockInfo(new Date());
    return `${c.year}-${String(c.month0 + 1).padStart(2, '0')}`;
  });
  const requestedMonths = 13 as const;

  const rollingSlots = useMemo(
    () => getRollingMonths(requestedMonths, liveNow, searchAnchorMonth),
    [liveNow, searchAnchorMonth]
  );

  // Keep real-time clock fresh every 60 seconds so month clock stays synced live
  useEffect(() => {
    const timer = setInterval(() => {
      setLiveNow(new Date());
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const [selectedStateId, setSelectedStateId] = useState<FourStateId>(validInitialState);
  const [uscInput, setUscInput] = useState<string>(initialUscNumber);
  const [monthsData, setMonthsData] = useState<MonthlyBillRecord[]>(() => {
    const now = new Date();
    if (initialHistory && initialHistory.length >= 1) {
      if (initialHistory.every((r) => Boolean(r.month) && typeof r.year === 'number')) {
        return initialHistory;
      }
      const last = initialHistory[initialHistory.length - 1];
      const anchor =
        typeof last.year === 'number' && typeof last.calendarMonth0 === 'number'
          ? `${last.year}-${String(last.calendarMonth0 + 1).padStart(2, '0')}`
          : undefined;
      return alignRecordsToRolling12Months(initialHistory, validInitialState, 'domestic', now, 13, anchor);
    }
    return [];
  });
  const [hasLoadedService, setHasLoadedService] = useState<boolean>(
    Boolean(initialHistory && initialHistory.length >= 1)
  );
  const [activeServiceAlias, setActiveServiceAlias] = useState<string>(
    initialUscNumber ? `USC #${initialUscNumber}` : ''
  );
  const [lookupStatus, setLookupStatus] = useState<PortalLookupStatus>(() => ({
    loading: false,
    sourceLabel:
      initialHistory && initialHistory.length > 13
        ? `Saved ${initialHistory.length}-Month Record`
        : initialHistory && initialHistory.length >= 12
        ? `Saved ${initialHistory.length}-Month Record`
        : '',
    portalMessage: null,
    portalReachable: null,
    verificationStep: 'none',
    syncedAtIst: getIndiaClockInfo(new Date()).formattedIst,
  }));

  // Live portal challenge & optional verification inputs
  const [captchaChallenge, setCaptchaChallenge] = useState<PortalCaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState<string>('');
  const [captchaRefreshing, setCaptchaRefreshing] = useState<boolean>(false);
  const [registeredMobileStr, setRegisteredMobileStr] = useState<string>('');
  const [livePortalBill, setLivePortalBill] = useState<LivePortalBillRecord | null>(null);

  // Portal paste fallback (only when an external portal blocks API fetch) & DISCOM ledger state
  const [isPasteOpen, setIsPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [showAll12Rows, setShowAll12Rows] = useState(true);
  const [expandedBillIdx, setExpandedBillIdx] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Normalize USC Number & auto-identify format
  const paramResolution = useMemo(
    () => resolveUscParameter(uscInput, selectedStateId),
    [uscInput, selectedStateId]
  );

  const primaryTypeDetection = useMemo(
    () => identifyConnectionNumberType(uscInput, selectedStateId),
    [uscInput, selectedStateId]
  );

  const effectivePrimaryInput = uscInput.trim();

  // Real-time regex validation for USC Number
  const serviceValidation = useMemo(
    () => validateServiceNumber(effectivePrimaryInput, selectedStateId),
    [effectivePrimaryInput, selectedStateId]
  );

  // Auto-identify state, DISCOM, tariff, & portal URL live from entered USC number
  const identified = useMemo(
    () =>
      identifyServiceFromUsc(
        paramResolution.uscNumber || effectivePrimaryInput,
        selectedStateId,
        liveNow
      ),
    [paramResolution.uscNumber, effectivePrimaryInput, selectedStateId, liveNow]
  );

  const stateDiscoms = useMemo(
    () => DISCOM_PORTAL_SPECS.filter((d) => d.stateId === identified.stateId),
    [identified.stateId]
  );

  // Summary analytics computed strictly from the latest 12 billed months (dividing by available billed months up to 12)
  const summary = useMemo(() => {
    if (monthsData.length === 0) {
      return {
        basisCount: 0,
        totalUnits: 0,
        totalBill: 0,
        avgUnits: 0,
        avgBill: 0,
        maxUnits: 1,
        peakRow: { month: rollingSlots[0].month, unitsKwh: 0, billAmountInr: 0 },
        runningRow: undefined,
        effectiveRate: currentTariffPerKwh,
        startMonth: rollingSlots[0].month,
        endMonth: rollingSlots[rollingSlots.length - 1].month,
        verifiedCount: 0,
        totalVerifiedInDataset: 0,
      };
    }
    const latest12 = computeLatest12MonthSummary(monthsData, currentTariffPerKwh);
    const maxUnits = Math.max(1, ...monthsData.map((m) => m.unitsKwh || 0));
    const peakRow = latest12.peakRow || {
      month: rollingSlots[0].month,
      unitsKwh: 0,
      billAmountInr: 0,
    };
    const runningRow = latest12.basisRows[latest12.basisRows.length - 1];
    return {
      basisCount: latest12.basisCount,
      totalUnits: latest12.totalUnits,
      totalBill: latest12.totalBill,
      avgUnits: latest12.avgUnits,
      avgBill: latest12.avgBill,
      maxUnits,
      peakRow,
      runningRow,
      effectiveRate: latest12.effectiveRate,
      startMonth: latest12.startMonth || rollingSlots[0].month,
      endMonth: latest12.endMonth || rollingSlots[rollingSlots.length - 1].month,
      verifiedCount: latest12.verifiedCount,
      totalVerifiedInDataset: latest12.totalVerifiedInDataset,
    };
  }, [monthsData, currentTariffPerKwh, rollingSlots]);

  const emitSync = (
    uscNum: string,
    matchInfo: ReturnType<typeof identifyServiceFromUsc>,
    records: MonthlyBillRecord[],
    sanctionedLoad?: number,
    portalBill?: LivePortalBillRecord | null,
    phaseType?: 'single_phase' | 'three_phase'
  ) => {
    if (records.length === 0) return;
    const latest12 = computeLatest12MonthSummary(records, matchInfo.tariffRate);
    const useLatestExact =
      latest12.verifiedCount === 1 &&
      latest12.basisCount === 1 &&
      portalBill &&
      (portalBill.unitsKwh > 0 || portalBill.billAmountInr > 0);
    const syncUnits =
      useLatestExact && portalBill!.unitsKwh > 0
        ? portalBill!.unitsKwh
        : latest12.avgUnits;
    const syncBill =
      useLatestExact && portalBill!.billAmountInr > 0
        ? portalBill!.billAmountInr
        : latest12.avgBill;
    const mappedCategory: 'residential' | 'commercial' | 'agricultural' =
      (portalBill?.categoryCode && portalBill.categoryCode >= 2 && portalBill.categoryCode !== 5) ||
      matchInfo.category === 'commercial'
        ? 'commercial'
        : 'residential';
    const effectiveBlendedRate =
      syncUnits > 0 && syncBill > 0 ? Number((syncBill / syncUnits).toFixed(2)) : matchInfo.tariffRate;

    onApply12MonthData({
      uscNumber: uscNum,
      stateId: matchInfo.stateId,
      stateName: matchInfo.stateName,
      discomId: matchInfo.discom.discomId,
      discomShortName: matchInfo.discom.shortName,
      consumerCategory: mappedCategory,
      tariffPerKwh: effectiveBlendedRate,
      sanctionedLoadKw: sanctionedLoad ?? portalBill?.contractedLoadKw,
      phaseType: phaseType ?? portalBill?.phaseType,
      avgMonthlyUnits: syncUnits,
      avgMonthlyBill: syncBill,
      months: records,
    });
  };

  const handleRefreshCaptcha = async () => {
    setCaptchaRefreshing(true);
    const fresh = await refreshPortalCaptcha();
    if (fresh) {
      setCaptchaChallenge(fresh);
      setCaptchaAnswer('');
    }
    setCaptchaRefreshing(false);
  };

  const handleFetchServiceBills = async (opts?: {
    overrideUsc?: string;
    overrideStateId?: FourStateId;
    isSamplePreset?: boolean;
    withCaptcha?: boolean;
  }) => {
    const now = new Date();
    setLiveNow(now);
    const activeState = opts?.overrideStateId || selectedStateId;
    const targetRaw = opts?.overrideUsc !== undefined ? opts.overrideUsc : uscInput;
    const lookupPrimary = targetRaw.trim();

    const preCheck = validateServiceNumber(lookupPrimary, activeState);
    if (!preCheck.isValid) {
      setValidationError(preCheck.errorMessage || 'Invalid USC Number format.');
      return;
    }

    setValidationError(null);
    if (opts?.overrideUsc !== undefined) {
      setUscInput(opts.overrideUsc);
    }
    if (opts?.overrideStateId) {
      setSelectedStateId(opts.overrideStateId);
    }

    setLookupStatus({
      loading: true,
      sourceLabel: 'Connecting to Official DISCOM Portal...',
      portalMessage: null,
      portalReachable: null,
      verificationStep: 'none',
      syncedAtIst: getIndiaClockInfo(now).formattedIst,
    });

    const cleanMobile = registeredMobileStr.replace(/\D/g, '');
    const isCustomAnchorSelected = hasUserEditedAnchor && searchAnchorMonth !== defaultAnchorYm;

    const result = await fetchLast12MonthsUsageByServiceNumber(targetRaw, {
      preferredStateId: activeState,
      anchorYearMonth: searchAnchorMonth || defaultAnchorYm,
      useCustomAnchor: isCustomAnchorSelected,
      requestedMonths,
      captchaId: opts?.withCaptcha && captchaChallenge ? captchaChallenge.captchaId : undefined,
      captchaAnswer: opts?.withCaptcha ? captchaAnswer.trim() : undefined,
      mobileNumber: cleanMobile.length === 10 ? cleanMobile : undefined,
      referenceDate: now,
    });

    if (!result.ok || !result.match) {
      setValidationError(result.error || 'USC Number validation failed.');
      setLookupStatus((prev) => ({
        ...prev,
        loading: false,
      }));
      return;
    }

    setSelectedStateId(result.match.stateId);
    setLivePortalBill(result.livePortalBill || null);
    setCaptchaChallenge(result.captchaChallenge || null);
    if (opts?.withCaptcha && result.captchaChallenge) {
      setCaptchaAnswer('');
    } else if (!result.captchaChallenge) {
      setCaptchaAnswer('');
    }

    const vStep = result.verificationStep || 'none';
    const resolvedUsc = result.uscNumber || result.serviceNumber || result.match.normalizedUsc;
    setActiveServiceAlias(
      result.consumerAlias || `${result.match.discom.shortName} USC #${resolvedUsc}`
    );

    if (result.months && result.months.length >= 1) {
      if (result.months.length > 0) {
        const lastRow = result.months[result.months.length - 1];
        if (typeof lastRow.year === 'number' && typeof lastRow.calendarMonth0 === 'number') {
          const syncedEndYm = `${lastRow.year}-${String(lastRow.calendarMonth0 + 1).padStart(2, '0')}`;
          if (!isCustomAnchorSelected) {
            setSearchAnchorMonth(syncedEndYm);
          }
        }
      }
      setMonthsData(result.months);
      setHasLoadedService(true);
      setLookupStatus({
        loading: false,
        sourceLabel: result.sourceLabel || `${result.match.discom.shortName} Ledger`,
        portalMessage: result.portalMessage || null,
        portalReachable: result.portalReachable ?? null,
        verificationStep: vStep,
        syncedAtIst: result.syncedAtIst || getIndiaClockInfo(now).formattedIst,
      });

      emitSync(
        resolvedUsc,
        result.match,
        result.months,
        result.sanctionedLoadKw ?? result.livePortalBill?.contractedLoadKw,
        result.livePortalBill,
        result.phaseType ?? result.livePortalBill?.phaseType
      );

      if (onRecordUscHistory) {
        const latest12 = computeLatest12MonthSummary(result.months);
        onRecordUscHistory({
          id: `${resolvedUsc}|${result.match.stateId}`,
          uscNumber: resolvedUsc,
          consumerName: result.livePortalBill?.consumerName,
          discomShortName: result.match.discom.shortName,
          discomId: result.match.discom.discomId,
          stateId: result.match.stateId,
          stateName: result.match.stateName,
          sanctionedLoadKw: result.sanctionedLoadKw ?? result.livePortalBill?.contractedLoadKw,
          avgMonthlyUnits: result.avgMonthlyUnits || latest12.avgUnits,
          avgMonthlyBill: result.avgMonthlyBill || latest12.avgBill,
          monthsCount: result.months.length,
          verifiedMonthsCount: latest12.totalVerifiedInDataset,
          lastFetchedAtIst: result.syncedAtIst || getIndiaClockInfo(now).formattedIst,
          timestampIso: now.toISOString(),
          months: result.months,
        });
      }
    } else {
      // Do NOT show or sync fake/fabricated 420 kWh meter data!
      setMonthsData([]);
      setHasLoadedService(false);
      setExpandedBillIdx(null);
      setLookupStatus({
        loading: false,
        sourceLabel: result.sourceLabel || 'Portal Verification Needed',
        portalMessage: result.portalMessage || null,
        portalReachable: result.portalReachable ?? null,
        verificationStep: vStep,
        syncedAtIst: result.syncedAtIst || getIndiaClockInfo(now).formattedIst,
      });
    }
  };

  useEffect(() => {
    if (!autoFetchSignal || autoFetchSignal.nonce <= 0) return;
    handleFetchServiceBills({
      overrideUsc: autoFetchSignal.uscNumber ?? '',
      overrideStateId: autoFetchSignal.stateId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFetchSignal?.nonce]);

  const handleApplyPastedRows = () => {
    const now = new Date();
    setLiveNow(now);
    const parsed = parsePasted12MonthBills(
      pasteText,
      identified.stateId,
      identified.category,
      now,
      requestedMonths,
      searchAnchorMonth || defaultAnchorYm
    );
    if (parsed.length === 0) {
      setPasteError('Could not detect units or bill amounts. Example line: "Nov 2025 360 2580"');
      return;
    }
    setPasteError(null);
    setMonthsData(parsed);
    setHasLoadedService(true);
    setIsPasteOpen(false);
    setLookupStatus({
      loading: false,
      sourceLabel: `Exact Portal Import (${parsed[0].month} → ${parsed[parsed.length - 1].month})`,
      portalMessage: `Imported ${parsed.length} exact usage & bill rows from ${identified.discom.shortName} (${parsed[0].month} through ${parsed[parsed.length - 1].month}).`,
      portalReachable: true,
      verificationStep: 'none',
      syncedAtIst: getIndiaClockInfo(now).formattedIst,
    });
    emitSync(identified.normalizedUsc || uscInput || 'PORTAL-IMPORT', identified, parsed);
  };

  return (
    <div className="space-y-3 pt-1">
      {/* 1. 4-State Quick Selector & Official Government Portal Interlink */}
      <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/90 dark:border-slate-700 p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-[#FF6F00]" />
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
              4-State DISCOM Portal Interlink
            </span>
          </div>
          {identified.confidence !== 'state_fallback' && uscInput.trim().length >= 4 && (
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              Auto-Detected: {identified.discom.shortName}
            </span>
          )}
        </div>

        {/* Search-Month Anchor & 13-Month (Last 12 Mo + Current) Range Control */}
        <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 p-2 space-y-1.5 text-[10px]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-300 font-bold">
              <Clock className="w-3 h-3 text-[#FF6F00] shrink-0" />
              <span>
                {rollingSlots.length}-Mo Range: {rollingSlots[0].month} →{' '}
                {rollingSlots[rollingSlots.length - 1].month}
              </span>
            </div>
            <span className="px-2 py-0.5 rounded-md font-extrabold bg-[#FF6F00] text-white shrink-0">
              12 Mo + Current ({rollingSlots.length} Mo)
            </span>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor="search-anchor-month"
              className="text-[10px] font-semibold text-amber-800 dark:text-amber-200"
            >
              Searching End Month:
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="search-anchor-month"
                type="month"
                value={searchAnchorMonth}
                onChange={(e) => {
                  if (e.target.value) {
                    setSearchAnchorMonth(e.target.value);
                    setHasUserEditedAnchor(true);
                  }
                }}
                className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-slate-700 text-[10.5px] font-bold text-slate-900 dark:text-white"
              />
              {searchAnchorMonth !== defaultAnchorYm && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchAnchorMonth(defaultAnchorYm);
                    setHasUserEditedAnchor(false);
                  }}
                  className="text-[9.5px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4 States Selector Grid */}
        <div className="grid grid-cols-4 gap-1">
          {FOUR_STATES_LIST.map((st) => {
            const isActive = identified.stateId === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStateId(st.id)}
                className={`py-1.5 px-1 rounded-xl text-[10.5px] font-bold transition cursor-pointer border text-center ${
                  isActive
                    ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {st.badge}
              </button>
            );
          })}
        </div>

        {/* Official State DISCOM Website Links */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 text-[10.5px]">
          <span className="text-slate-600 dark:text-slate-300 font-medium">
            {identified.stateName}: <strong>{identified.discom.shortName}</strong> (₹{identified.tariffRate}/kWh)
          </span>
          <a
            href={identified.discom.billHistoryUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-bold text-sky-600 dark:text-sky-400 hover:underline"
          >
            <span>Bill History Portal</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* All DISCOM Websites in Selected State */}
        {stateDiscoms.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
            {stateDiscoms.map((d) => (
              <a
                key={d.discomId}
                href={d.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600 dark:text-slate-300 hover:text-[#FF6F00] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg"
              >
                <span>{d.shortName}</span>
                <ExternalLink className="w-2.5 h-2.5 opacity-70" />
              </a>
            ))}
          </div>
        )}
      </div>

      {/* 2. Strict USC Number Lookup */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 px-1">
          <label className="text-[10.5px] font-bold text-slate-700 dark:text-slate-200">
            Unique Service Number (USC No.)
          </label>
          {uscInput.trim().length >= 4 && (
            <span className="text-[9.5px] font-extrabold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
              {primaryTypeDetection.numberType} Format Ready
            </span>
          )}
        </div>

        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={uscInput}
              onChange={(e) => {
                setUscInput(e.target.value);
                if (validationError) setValidationError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleFetchServiceBills();
                }
              }}
              placeholder={`Enter USC Number (e.g. ${identified.discom.exampleNumbers[0] || '102603120'})`}
              aria-invalid={
                Boolean(validationError) ||
                (effectivePrimaryInput.length > 0 && !serviceValidation.isValid)
              }
              className={`w-full pl-9 pr-3 py-2.5 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border text-slate-900 dark:text-white font-bold text-xs focus:outline-hidden focus:ring-2 ${
                validationError ||
                (effectivePrimaryInput.length > 0 && !serviceValidation.isValid)
                  ? 'border-rose-400 focus:ring-rose-400'
                  : effectivePrimaryInput.length > 0 && serviceValidation.isValid
                  ? 'border-emerald-400 focus:ring-emerald-500'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-[#FF6F00]'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => handleFetchServiceBills()}
            disabled={
              lookupStatus.loading ||
              !effectivePrimaryInput ||
              (effectivePrimaryInput.length > 0 && !serviceValidation.isValid)
            }
            className="px-3.5 py-2.5 rounded-2xl bg-[#FF6F00] hover:bg-[#e66400] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs flex items-center gap-1.5 shrink-0 transition cursor-pointer shadow-xs"
          >
            {lookupStatus.loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>Fetch Govt Bill</span>
          </button>
        </div>

        {(validationError ||
          (effectivePrimaryInput.length > 0 && !serviceValidation.isValid)) ? (
          <p className="text-[10.5px] font-semibold text-rose-600 dark:text-rose-400 px-1 flex items-start gap-1">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{validationError || serviceValidation.errorMessage}</span>
          </p>
        ) : (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 px-1">
            {effectivePrimaryInput.length > 0 && serviceValidation.isValid && (
              <span className="text-emerald-600 dark:text-emerald-400 font-bold mr-1">
                ✓ Valid USC format ·
              </span>
            )}
            {identified.matchReason} ·{' '}
            <span className="font-semibold">{identified.discom.uscLabel}</span>
          </p>
        )}

        {/* Inline Live Official TGSPDCL CAPTCHA Verification Box */}
        {captchaChallenge && (
          <div className="rounded-2xl bg-sky-50/90 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span className="text-xs font-extrabold text-sky-950 dark:text-sky-100">
                  Official {captchaChallenge.provider} Portal Security Check
                </span>
              </div>
              <button
                type="button"
                onClick={handleRefreshCaptcha}
                disabled={captchaRefreshing}
                className="text-[10.5px] font-bold text-sky-700 dark:text-sky-300 inline-flex items-center gap-1 hover:underline cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${captchaRefreshing ? 'animate-spin' : ''}`} />
                <span>New Code</span>
              </button>
            </div>
            <p className="text-[10.5px] text-sky-900/90 dark:text-sky-200">
              {captchaChallenge.hint}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <img
                src={captchaChallenge.image}
                alt="Official DISCOM Security Code"
                className="h-11 rounded-lg border border-sky-200 dark:border-sky-700 bg-white px-1"
              />
              <input
                type="text"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && captchaAnswer.trim()) {
                    e.preventDefault();
                    handleFetchServiceBills({ withCaptcha: true });
                  }
                }}
                placeholder="Type code shown"
                className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-xs font-extrabold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={() => handleFetchServiceBills({ withCaptcha: true })}
                disabled={lookupStatus.loading || !captchaAnswer.trim()}
                className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white font-bold text-xs cursor-pointer transition shrink-0"
              >
                {lookupStatus.loading ? 'Verifying...' : 'Verify & Fetch Live'}
              </button>
            </div>
          </div>
        )}

        {/* Inline APSPDCL Linked 10-Digit Mobile Prompt (when required by portal) */}
        {(identified.discom.discomId === 'apspdcl' ||
          lookupStatus.verificationStep === 'mobile_required') && (
          <div
            className={`rounded-2xl p-2.5 border space-y-1.5 ${
              lookupStatus.verificationStep === 'mobile_required'
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
            }`}
          >
            <label className="flex items-center gap-1.5 text-[10.5px] font-bold text-slate-700 dark:text-slate-200">
              <Smartphone className="w-3.5 h-3.5 text-[#FF6F00]" />
              <span>
                Linked 10-Digit Mobile No{' '}
                {lookupStatus.verificationStep === 'mobile_required'
                  ? '(Required by APSPDCL)'
                  : '(Optional for APSPDCL USC No)'}
              </span>
            </label>
            <div className="flex gap-1.5">
              <input
                type="tel"
                maxLength={10}
                value={registeredMobileStr}
                onChange={(e) => setRegisteredMobileStr(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit mobile linked to Service No"
                className="flex-1 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              />
              {lookupStatus.verificationStep === 'mobile_required' && (
                <button
                  type="button"
                  onClick={() => handleFetchServiceBills()}
                  disabled={lookupStatus.loading || registeredMobileStr.length !== 10}
                  className="px-3 py-1.5 rounded-xl bg-[#FF6F00] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  Fetch Live
                </button>
              )}
            </div>
          </div>
        )}

        {/* Portal Status / Not-Found / Action Banner when 12-mo ledger not yet fetched */}
        {!hasLoadedService && lookupStatus.portalMessage && !captchaChallenge && (
          <div
            className={`rounded-2xl p-3 border text-[11px] space-y-2 ${
              lookupStatus.verificationStep === 'not_found'
                ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                : 'bg-amber-50/90 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
            }`}
          >
            <div className="flex items-start gap-2 font-semibold">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{lookupStatus.portalMessage}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              <a
                href={identified.discom.billHistoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sky-700 dark:text-sky-300 font-bold text-[10.5px] inline-flex items-center gap-1"
              >
                <span>Open {identified.discom.shortName} Portal</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                type="button"
                onClick={() => setIsPasteOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-sky-600 text-white font-bold text-[10.5px] inline-flex items-center gap-1 cursor-pointer"
              >
                <FileSpreadsheet className="w-3 h-3" />
                <span>Paste Portal Table</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick 1-click Official Portal Paste when user wants to paste directly without waiting */}
        {isPasteOpen && (
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-600 dark:text-slate-300">
                Copy bill rows from your {identified.discom.shortName} portal ({rollingSlots[0].month} to{' '}
                {rollingSlots[rollingSlots.length - 1].month}) &amp; paste below:
              </p>
              <button
                type="button"
                onClick={() => setIsPasteOpen(false)}
                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer shrink-0"
              >
                Close
              </button>
            </div>
            <textarea
              rows={4}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={`${rollingSlots[0].month} 180 1120\n...\n${rollingSlots[rollingSlots.length - 1].month} 210 1350`}
              className="w-full p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-mono text-slate-800 dark:text-slate-100"
            />
            {pasteError && <p className="text-[10px] text-rose-500 font-semibold">{pasteError}</p>}
            <button
              type="button"
              onClick={handleApplyPastedRows}
              className="w-full py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold cursor-pointer"
            >
              Parse &amp; Apply Exact Portal Bills
            </button>
          </div>
        )}

        {/* Official Govt DISCOM Note */}
        <div className="rounded-xl bg-emerald-50/75 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-900/50 px-2.5 py-2 flex items-center gap-2 text-[10.5px] text-emerald-900 dark:text-emerald-200">
          <Receipt className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span>
            Monthly units &amp; bills are synced automatically from official government DISCOM portals.
          </span>
        </div>
      </div>

      {/* 3. Verified Live Portal Result & Synchronized Official Govt DISCOM Usage/Bill Summary */}
      {hasLoadedService && monthsData.length >= 1 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-900/60 p-3 space-y-3 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                  <span>{activeServiceAlias || `Service #${identified.normalizedUsc}`}</span>
                  {summary.verifiedCount > 0 && (
                    <span className="text-[9.5px] font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                      {summary.verifiedCount}/{monthsData.length} Portal Verified
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  {identified.discom.shortName} ({identified.stateName})
                  {lookupStatus.sourceLabel ? ` · ${lookupStatus.sourceLabel}` : ''}
                </p>
                <p className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                  Live Sync: {lookupStatus.syncedAtIst}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => handleFetchServiceBills()}
                title="Refresh real-time data from portal"
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                <RefreshCw className={`w-3 h-3 ${lookupStatus.loading ? 'animate-spin' : ''}`} />
              </button>
              <a
                href={identified.discom.billHistoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2 py-1 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 text-[10px] font-bold inline-flex items-center gap-1 border border-sky-200 dark:border-sky-800 hover:bg-sky-100"
              >
                <span>Portal</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
          </div>

          {lookupStatus.portalMessage && (
            <div className="text-[10.5px] rounded-xl bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700/70 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span>{lookupStatus.portalMessage}</span>
            </div>
          )}

          {livePortalBill && (
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-3 space-y-2.5 text-[11px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-sky-600 text-white text-[9px] font-extrabold uppercase tracking-wide">
                      <Receipt className="w-2.5 h-2.5" />
                      Official DISCOM Bill
                    </span>
                    {livePortalBill.billNo && (
                      <span className="text-[10px] font-bold text-sky-800 dark:text-sky-200">
                        Bill #{livePortalBill.billNo}
                      </span>
                    )}
                  </div>
                  <div className="font-extrabold text-sm text-sky-950 dark:text-sky-50 pt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>
                      {livePortalBill.unitsKwh > 0
                        ? `${livePortalBill.unitsKwh} kWh${livePortalBill.unitsEstimatedFromDemand ? ' (TGERC Est.)' : ''} · `
                        : ''}
                      ₹{formatInr(livePortalBill.billAmountInr)}
                    </span>
                    {typeof livePortalBill.currentMonthDemandInr === 'number' &&
                      livePortalBill.currentMonthDemandInr === 0 && (
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                          Current Demand ₹0
                        </span>
                      )}
                  </div>
                  {livePortalBill.consumerName && (
                    <div className="text-[10.5px] font-bold text-sky-900 dark:text-sky-200">
                      {livePortalBill.consumerName}
                      {livePortalBill.uscno ? ` · USC ${livePortalBill.uscno}` : ''}
                      {livePortalBill.scno ? ` · SC ${livePortalBill.scno}` : ''}
                    </div>
                  )}
                  {(livePortalBill.circleCode ||
                    livePortalBill.eroName ||
                    livePortalBill.sectionName ||
                    livePortalBill.meterNumber) && (
                    <div className="text-[10px] text-sky-800/90 dark:text-sky-300/90">
                      {[
                        livePortalBill.circleCode ? `Circle: ${livePortalBill.circleCode}` : '',
                        livePortalBill.eroName ? `ERO: ${livePortalBill.eroName}` : '',
                        livePortalBill.sectionName ? `Sec: ${livePortalBill.sectionName}` : '',
                        livePortalBill.meterNumber ? `Meter: ${livePortalBill.meterNumber}` : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                  {livePortalBill.consumerAddress && (
                    <div className="text-[10px] text-sky-700/90 dark:text-sky-300/90 truncate">
                      {livePortalBill.consumerAddress}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <a
                    href={livePortalBill.viewEbillUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] inline-flex items-center gap-1 shrink-0"
                  >
                    <span>Official e-Bill</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  {summary.verifiedCount <= 1 && (
                    <button
                      type="button"
                      onClick={() => setIsPasteOpen((prev) => !prev)}
                      className="text-[9.5px] font-bold text-sky-700 dark:text-sky-300 hover:underline cursor-pointer"
                    >
                      + Paste 12-Mo History
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-2 border-t border-sky-200/70 dark:border-sky-800/70 text-[10px] text-sky-800 dark:text-sky-200">
                {livePortalBill.categoryDecode && (
                  <div className="truncate">
                    <span className="opacity-75">Category: </span>
                    <strong>{livePortalBill.categoryDecode}</strong>
                  </div>
                )}
                {(livePortalBill.contractedLoadKw || livePortalBill.phaseType) && (
                  <div className="truncate">
                    <span className="opacity-75">Load/Phase: </span>
                    <strong>
                      {livePortalBill.contractedLoadKw ? `${livePortalBill.contractedLoadKw} kW` : ''}
                      {livePortalBill.contractedLoadKw && livePortalBill.phaseType ? ' · ' : ''}
                      {livePortalBill.phaseType === 'three_phase'
                        ? '3-Phase'
                        : livePortalBill.phaseType === 'single_phase'
                        ? '1-Phase'
                        : ''}
                    </strong>
                  </div>
                )}
                {typeof livePortalBill.meterPrevReading === 'number' &&
                  typeof livePortalBill.meterPresentReading === 'number' && (
                    <div className="truncate">
                      <span className="opacity-75">Meter: </span>
                      <strong>
                        {livePortalBill.meterPrevReading} → {livePortalBill.meterPresentReading}
                      </strong>
                      {livePortalBill.billingDays ? ` (${livePortalBill.billingDays}d)` : ''}
                    </div>
                  )}
                {livePortalBill.billDate && (
                  <div className="truncate">
                    <span className="opacity-75">Bill Date: </span>
                    <strong>{livePortalBill.billDate}</strong>
                  </div>
                )}
                {livePortalBill.dueDate && (
                  <div className="truncate">
                    <span className="opacity-75">Due Date: </span>
                    <strong>{livePortalBill.dueDate}</strong>
                  </div>
                )}
                {livePortalBill.paidDate && (
                  <div className="truncate">
                    <span className="opacity-75">Last Paid: </span>
                    <strong>{livePortalBill.paidDate}</strong>
                  </div>
                )}
                {livePortalBill.disconnectionDate && (
                  <div className="truncate">
                    <span className="opacity-75">Disconn. Date: </span>
                    <strong>{livePortalBill.disconnectionDate}</strong>
                  </div>
                )}
                {typeof livePortalBill.currentMonthDemandInr === 'number' && (
                  <div className="truncate">
                    <span className="opacity-75">Current Demand: </span>
                    <strong>₹{formatInr(livePortalBill.currentMonthDemandInr)}</strong>
                  </div>
                )}
                {typeof livePortalBill.arrearsInr === 'number' &&
                  livePortalBill.arrearsInr > 0 && (
                    <div className="truncate">
                      <span className="opacity-75">Arrears: </span>
                      <strong>₹{formatInr(livePortalBill.arrearsInr)}</strong>
                    </div>
                  )}
                {typeof livePortalBill.acdAmountDueInr === 'number' &&
                  livePortalBill.acdAmountDueInr > 0 && (
                    <div className="truncate">
                      <span className="opacity-75">ACD Due: </span>
                      <strong>₹{formatInr(livePortalBill.acdAmountDueInr)}</strong>
                    </div>
                  )}
                {livePortalBill.amountPayableInr !== undefined &&
                  livePortalBill.amountPayableInr > 0 && (
                    <div className="truncate">
                      <span className="opacity-75">Total Payable: </span>
                      <strong>₹{formatInr(livePortalBill.amountPayableInr)}</strong>
                    </div>
                  )}
              </div>

              {/* Official Govt DISCOM Charge Breakup */}
              {(typeof livePortalBill.energyChargeInr === 'number' ||
                typeof livePortalBill.fixedChargeInr === 'number' ||
                typeof livePortalBill.customerChargeInr === 'number' ||
                typeof livePortalBill.electricityDutyInr === 'number') && (
                <div className="rounded-lg bg-white/85 dark:bg-slate-900/75 border border-sky-200/80 dark:border-sky-800/80 p-2 space-y-1.5">
                  <div className="text-[9.5px] font-extrabold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                    Govt Bill Charge Breakup ({livePortalBill.sourcePortal || 'DISCOM'})
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-[10px]">
                    {typeof livePortalBill.energyChargeInr === 'number' && (
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Energy Chg:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          ₹{livePortalBill.energyChargeInr.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {typeof livePortalBill.fixedChargeInr === 'number' && (
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Fixed Chg:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          ₹{livePortalBill.fixedChargeInr.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {typeof livePortalBill.customerChargeInr === 'number' && (
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Customer Chg:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          ₹{livePortalBill.customerChargeInr.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {typeof livePortalBill.electricityDutyInr === 'number' && (
                      <div className="flex justify-between gap-1">
                        <span className="text-slate-500 dark:text-slate-400">Elec. Duty:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">
                          ₹{livePortalBill.electricityDutyInr.toFixed(2)}
                        </span>
                      </div>
                    )}
                    {typeof livePortalBill.trueUpChargeInr === 'number' &&
                      livePortalBill.trueUpChargeInr !== 0 && (
                        <div className="flex justify-between gap-1">
                          <span className="text-slate-500 dark:text-slate-400">
                            True-Up{livePortalBill.trueUpFinYear ? ` (${livePortalBill.trueUpFinYear})` : ''}:
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            ₹{livePortalBill.trueUpChargeInr.toFixed(2)}
                          </span>
                        </div>
                      )}
                    {typeof livePortalBill.lossGainInr === 'number' &&
                      livePortalBill.lossGainInr !== 0 && (
                        <div className="flex justify-between gap-1">
                          <span className="text-slate-500 dark:text-slate-400">Loss/Gain:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            ₹{livePortalBill.lossGainInr.toFixed(2)}
                          </span>
                        </div>
                      )}
                    {typeof livePortalBill.adjustmentInr === 'number' &&
                      livePortalBill.adjustmentInr !== 0 && (
                        <div className="flex justify-between gap-1">
                          <span className="text-slate-500 dark:text-slate-400">Adjustment:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            ₹{livePortalBill.adjustmentInr.toFixed(2)}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Key Official Period Metrics (strictly latest 12 billed months) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 p-2.5">
              <div className="text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                {summary.verifiedCount > 0
                  ? `${summary.basisCount}-Mo Verified Avg Units`
                  : `${summary.basisCount}-Mo Avg Monthly Units`}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                {summary.avgUnits.toLocaleString('en-IN')} kWh
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {summary.basisCount}M Total ({summary.startMonth}–{summary.endMonth}): {summary.totalUnits.toLocaleString('en-IN')} kWh
              </div>
            </div>
            <div className="rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50 p-2.5">
              <div className="text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                {summary.verifiedCount > 0
                  ? `${summary.basisCount}-Mo Verified Avg Bill`
                  : `${summary.basisCount}-Mo Avg Monthly Bill`}
              </div>
              <div className="text-base font-extrabold text-slate-900 dark:text-white">
                ₹{summary.avgBill.toLocaleString('en-IN')}
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                {summary.basisCount}M Total ₹{formatInr(summary.totalBill)} · Peak {summary.peakRow.month}
              </div>
            </div>
          </div>

          {/* Synchronized Sparkline */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-[#FF6F00]" />
                {summary.startMonth} → {summary.endMonth} ({summary.verifiedCount > 0 ? `${summary.basisCount}M Live Avg` : `${summary.basisCount}M Avg`})
              </span>
              <span>Blended ₹{summary.effectiveRate}/kWh</span>
            </div>
            <div
              className={`grid gap-1 items-end pt-1 px-1 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 ${
                monthsData.length > 13 ? 'grid-cols-12 h-28 gap-y-2 py-1.5' : 'h-16'
              }`}
              style={
                monthsData.length <= 13
                  ? { gridTemplateColumns: `repeat(${monthsData.length}, minmax(0, 1fr))` }
                  : undefined
              }
            >
              {monthsData.map((row, idx) => {
                const isUnavailableSlot =
                  summary.totalVerifiedInDataset > 0 && !row.isVerifiedPortalData && row.unitsKwh === 0 && row.billAmountInr === 0;
                const pct = isUnavailableSlot
                  ? 8
                  : Math.max(12, Math.round((row.unitsKwh / summary.maxUnits) * 100));
                const isPeak = !isUnavailableSlot && row.unitsKwh === summary.maxUnits;
                const isRunning = idx === monthsData.length - 1 || row.isRunningMonth;
                return (
                  <div
                    key={`${row.month}-${idx}`}
                    className="flex flex-col items-center gap-0.5 h-full justify-end"
                  >
                    <div
                      title={
                        isUnavailableSlot
                          ? `${idx + 1}. ${row.month}: Not exposed on public portal API`
                          : `${idx + 1}. ${row.month}: ${row.unitsKwh} kWh · ₹${formatInr(row.billAmountInr)}`
                      }
                      className={`w-full rounded-t-sm transition-all ${
                        isUnavailableSlot
                          ? 'bg-slate-200 dark:bg-slate-700/70'
                          : row.isVerifiedPortalData
                          ? 'bg-emerald-500'
                          : isRunning
                          ? 'bg-emerald-500'
                          : isPeak
                          ? 'bg-[#FF6F00]'
                          : 'bg-amber-400/80 dark:bg-amber-500/75'
                      }`}
                      style={{ height: `${isUnavailableSlot ? 10 : Math.max(16, Math.round(pct * 0.65))}%` }}
                    />
                    <span
                      className={`text-[7.5px] font-bold leading-none pb-0.5 ${
                        isRunning
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {row.month.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[9.5px] text-slate-400 px-0.5">
              <span>#1 Verified: {summary.startMonth}</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                Latest: {summary.endMonth}
              </span>
            </div>
          </div>

          {/* Non-Editable Official Govt DISCOM Bills Ledger Header */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300">
              <Receipt className="w-3 h-3" />
              <span>Govt DISCOM Bills</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAll12Rows((prev) => !prev)}
              className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-0.5 hover:text-[#FF6F00] cursor-pointer"
            >
              <span>
                {showAll12Rows
                  ? `Hide ${monthsData.length}-Mo DISCOM Bills`
                  : `View ${monthsData.length}-Mo DISCOM Bills`}
              </span>
              {showAll12Rows ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {showAll12Rows && (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
              <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 font-bold text-slate-500 dark:text-slate-400 sticky top-0 z-10">
                <span className="col-span-5">Month (Govt Ledger)</span>
                <span className="col-span-3 text-right">Units (kWh)</span>
                <span className="col-span-4 text-right">DISCOM Bill (₹)</span>
              </div>
              {monthsData.map((row, idx) => {
                const isRunning = idx === monthsData.length - 1 || row.isRunningMonth;
                const isUnavailableSlot =
                  summary.verifiedCount > 0 && !row.isVerifiedPortalData && row.unitsKwh === 0 && row.billAmountInr === 0;
                const hasReceiptDetails =
                  typeof row.paidInr === 'number' ||
                  Boolean(row.receiptNo) ||
                  typeof row.openingBalanceInr === 'number' ||
                  typeof row.closingBalanceInr === 'number' ||
                  typeof row.adjustmentInr === 'number';
                const isExpanded = expandedBillIdx === idx;
                return (
                  <div
                    key={`${row.month}-${idx}`}
                    className={`${
                      row.isVerifiedPortalData
                        ? 'bg-emerald-50/75 dark:bg-emerald-950/30'
                        : isUnavailableSlot
                        ? 'bg-slate-50/70 dark:bg-slate-900/50 opacity-75'
                        : isRunning
                        ? 'bg-amber-50/50 dark:bg-amber-950/20'
                        : 'bg-white dark:bg-slate-900'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedBillIdx((prev) => (prev === idx ? null : idx))
                      }
                      className="w-full grid grid-cols-12 items-center px-2.5 py-2 text-left hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition cursor-pointer"
                    >
                      <div className="col-span-5 flex items-center gap-1 min-w-0">
                        <span className="text-[9.5px] font-bold text-slate-400 w-4 shrink-0">
                          {idx + 1}.
                        </span>
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {row.month}
                        </span>
                        {row.isVerifiedPortalData ? (
                          <span className="inline-flex items-center gap-0.5 text-[8.5px] font-extrabold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/60 px-1 py-0.5 rounded-sm shrink-0">
                            <span>{isRunning && livePortalBill && !livePortalBill.isFromHistoryFallback ? 'Present' : 'Govt'}</span>
                          </span>
                        ) : (
                          <span className="text-[8.5px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded-sm shrink-0">
                            {isUnavailableSlot ? 'App Only' : isRunning ? 'Now' : 'Demo'}
                          </span>
                        )}
                      </div>
                      <div className="col-span-3 text-right font-extrabold text-slate-900 dark:text-white">
                        {isUnavailableSlot ? (
                          <span className="text-slate-400 font-semibold">—</span>
                        ) : (
                          <>
                            {row.unitsKwh.toLocaleString('en-IN')}{' '}
                            <span className="text-[9px] font-semibold text-slate-400">kWh</span>
                          </>
                        )}
                      </div>
                      <div className="col-span-4 flex items-center justify-end gap-1 font-extrabold text-emerald-700 dark:text-emerald-400">
                        {isUnavailableSlot ? (
                          <span className="text-[9.5px] font-semibold text-slate-400">Public API N/A</span>
                        ) : (
                          <>
                            <span>₹{formatInr(row.billAmountInr)}</span>
                            {hasReceiptDetails && (
                              <ChevronDown
                                className={`w-3 h-3 text-slate-400 transition-transform ${
                                  isExpanded ? 'rotate-180' : ''
                                }`}
                              />
                            )}
                          </>
                        )}
                      </div>
                    </button>

                    {(hasReceiptDetails || isExpanded) && !isUnavailableSlot && (
                      <div
                        className={`px-2.5 pb-2 pl-7 text-[9.5px] text-slate-600 dark:text-slate-300 ${
                          isExpanded ? 'space-y-1' : 'flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          {typeof row.openingBalanceInr === 'number' && row.openingBalanceInr !== 0 && (
                            <span>
                              Arrears: <strong>₹{formatInr(row.openingBalanceInr)}</strong>
                            </span>
                          )}
                          {typeof row.demandInr === 'number' && (
                            <span>
                              Bill: <strong>₹{formatInr(row.demandInr)}</strong>
                            </span>
                          )}
                          {typeof row.paidInr === 'number' && (
                            <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                              Paid: ₹{formatInr(row.paidInr)}
                              {row.paidDate ? ` (${row.paidDate})` : ''}
                            </span>
                          )}
                          {typeof row.adjustmentInr === 'number' && row.adjustmentInr !== 0 && (
                            <span className="text-amber-700 dark:text-amber-300 font-semibold">
                              Adjst: ₹{formatInr(row.adjustmentInr)}
                            </span>
                          )}
                          {typeof row.closingBalanceInr === 'number' && (
                            <span>
                              Bal: <strong>₹{formatInr(row.closingBalanceInr)}</strong>
                            </span>
                          )}
                          {row.receiptNo && (
                            <span className="font-mono text-sky-700 dark:text-sky-300">
                              PR #{row.receiptNo}
                            </span>
                          )}
                        </div>
                        {isExpanded &&
                          (typeof row.openingBalanceInr === 'number' ||
                            typeof row.closingBalanceInr === 'number' ||
                            typeof row.adjustmentInr === 'number') && (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 dark:text-slate-400 pt-0.5">
                              {typeof row.openingBalanceInr === 'number' && (
                                <span>Arrears / Opening Bal: ₹{formatInr(row.openingBalanceInr)}</span>
                              )}
                              {typeof row.closingBalanceInr === 'number' && (
                                <span>Closing Bal: ₹{formatInr(row.closingBalanceInr)}</span>
                              )}
                              {typeof row.adjustmentInr === 'number' && (
                                <span>Adjustment: ₹{formatInr(row.adjustmentInr)}</span>
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() =>
              emitSync(
                identified.normalizedUsc || uscInput || 'USC-ACCOUNT',
                identified,
                monthsData,
                livePortalBill?.contractedLoadKw ?? identified.inbuiltProfile?.sanctionedLoadKw,
                livePortalBill,
                livePortalBill?.phaseType
              )
            }
            className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Synced ({summary.basisCount}-Mo Avg · {summary.startMonth}–{summary.endMonth}): {summary.avgUnits} kWh/mo · ₹{summary.avgBill.toLocaleString('en-IN')}/mo
          </button>
        </div>
      )}
    </div>
  );
};
