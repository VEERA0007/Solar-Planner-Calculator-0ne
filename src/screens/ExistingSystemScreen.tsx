import React, { useState } from 'react';
import {
  Award,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Zap,
  Activity,
  DollarSign,
  Layers,
  Sparkles,
  Search,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  AlertCircle,
  ExternalLink,
  History,
  Receipt,
  ChevronDown,
} from 'lucide-react';
import {
  ExistingSystemInputs,
  ScreenId,
  WeatherCondition,
  UscHistoryEntry,
} from '../types/solar';
import { analyzeExistingSystem, CURRENCY_SYMBOLS } from '../utils/solarMath';
import { computeLatest12MonthSummary, resolveHistory12MonthAverage } from '../utils/monthlyAverage';
import { MaterialTopBar } from '../components/MaterialTopBar';
import {
  FOUR_STATES_LIST,
  FourStateId,
  DISCOM_PORTAL_SPECS,
  getIndiaClockInfo,
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

interface ExistingSystemScreenProps {
  inputs: ExistingSystemInputs;
  onUpdateInputs: (updated: Partial<ExistingSystemInputs>) => void;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  hideTopBar?: boolean;
  uscHistory?: UscHistoryEntry[];
  onRecordUscHistory?: (entry: UscHistoryEntry) => void;
}

export const ExistingSystemScreen: React.FC<ExistingSystemScreenProps> = ({
  inputs,
  onUpdateInputs,
  onNavigate,
  weather,
  onOpenWeather,
  hideTopBar = false,
  uscHistory = [],
  onRecordUscHistory,
}) => {
  const analysis = analyzeExistingSystem(inputs);
  const sym = CURRENCY_SYMBOLS[inputs.currency] || '₹';

  const initialAuditState: FourStateId =
    inputs.stateId === 'andhra_pradesh' ||
    inputs.stateId === 'odissa' ||
    inputs.stateId === 'chandigarh'
      ? inputs.stateId
      : 'telangana';

  const [auditStateId, setAuditStateId] = useState<FourStateId>(initialAuditState);
  const [isSyncingMeter, setIsSyncingMeter] = useState(false);
  const [meterSyncError, setMeterSyncError] = useState<string | null>(null);
  const [meterSyncMsg, setMeterSyncMsg] = useState<string | null>(null);
  const [verificationStep, setVerificationStep] = useState<PortalVerificationStep>('none');
  const [captchaChallenge, setCaptchaChallenge] = useState<PortalCaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [mobileInput, setMobileInput] = useState('');
  const [syncedConsumerName, setSyncedConsumerName] = useState<string | null>(null);
  const [syncedConsumerDetails, setSyncedConsumerDetails] = useState<string | null>(null);
  const [syncedLiveBill, setSyncedLiveBill] = useState<LivePortalBillRecord | null>(null);
  const [showAuditBills, setShowAuditBills] = useState<boolean>(false);

  const uscStr = inputs.uscNumber || '';
  const hasAnyConnId = uscStr.trim().length > 0;
  const resolvedConn = resolveUscParameter(uscStr, auditStateId);
  const uscCheck = uscStr.trim() ? validateServiceNumber(uscStr, auditStateId) : null;
  const activeDiscom =
    DISCOM_PORTAL_SPECS.find((d) => d.stateId === auditStateId) || DISCOM_PORTAL_SPECS[0];
  const verifiedAuditMonths = (inputs.auditedMonths || []).filter(
    (m) => m.isVerifiedPortalData && (m.unitsKwh > 0 || m.billAmountInr > 0)
  );
  const hasVerifiedDiscomAudit = Boolean(
    inputs.uscNumber && verifiedAuditMonths.length > 0
  );

  const handleClearDiscomLock = () => {
    setSyncedLiveBill(null);
    setSyncedConsumerName(null);
    setSyncedConsumerDetails(null);
    setMeterSyncMsg(null);
    onUpdateInputs({
      uscNumber: undefined,
      auditedMonths: undefined,
    });
  };

  const handleAuditMeterFetch = async (opts?: {
    overrideUsc?: string;
    overrideStateId?: FourStateId;
    withCaptcha?: boolean;
  }) => {
    const targetState = opts?.overrideStateId || auditStateId;
    const targetUsc = (opts?.overrideUsc !== undefined ? opts.overrideUsc : uscStr).trim();

    if (!targetUsc) {
      setMeterSyncError('Enter your USC Number to fetch live meter data.');
      return;
    }

    const uVal = validateServiceNumber(targetUsc, targetState);
    if (!uVal.isValid) {
      setMeterSyncError(`USC Number: ${uVal.errorMessage}`);
      return;
    }

    if (opts?.overrideStateId) setAuditStateId(opts.overrideStateId);
    if (opts?.overrideUsc !== undefined) {
      onUpdateInputs({
        uscNumber: targetUsc,
        stateId: targetState,
      });
    }

    setMeterSyncError(null);
    setMeterSyncMsg(null);
    setSyncedConsumerName(null);
    setSyncedConsumerDetails(null);
    setSyncedLiveBill(null);
    setIsSyncingMeter(true);

    const now = new Date();
    const cleanMob = mobileInput.replace(/\D/g, '');
    const res = await fetchLast12MonthsUsageByServiceNumber(targetUsc, {
      preferredStateId: targetState,
      requestedMonths: 13,
      captchaId: opts?.withCaptcha && captchaChallenge ? captchaChallenge.captchaId : undefined,
      captchaAnswer: opts?.withCaptcha ? captchaAnswer.trim() : undefined,
      mobileNumber: cleanMob.length === 10 ? cleanMob : undefined,
      referenceDate: now,
    });

    setIsSyncingMeter(false);

    if (!res.ok || !res.match) {
      setMeterSyncError(res.error || 'Could not validate USC Number.');
      return;
    }

    setCaptchaChallenge(res.captchaChallenge || null);
    if (opts?.withCaptcha && res.captchaChallenge) {
      setCaptchaAnswer('');
    } else if (!res.captchaChallenge) {
      setCaptchaAnswer('');
    }
    setVerificationStep(res.verificationStep || 'none');

    if (res.livePortalBill?.consumerName) {
      setSyncedConsumerName(res.livePortalBill.consumerName);
    }
    if (res.livePortalBill) {
      setSyncedLiveBill(res.livePortalBill);
      const lb = res.livePortalBill;
      const metaParts = [
        lb.uscno ? `USC ${lb.uscno}` : '',
        lb.billNo ? `Bill #${lb.billNo}` : '',
        lb.contractedLoadKw ? `Load ${lb.contractedLoadKw} kW` : '',
        lb.phaseType === 'three_phase' ? '3-Phase' : lb.phaseType === 'single_phase' ? '1-Phase' : '',
        lb.eroName ? `ERO ${lb.eroName}` : '',
        lb.consumerAddress || '',
      ].filter(Boolean);
      if (metaParts.length > 0) setSyncedConsumerDetails(metaParts.join(' · '));
    }

    if (res.months && res.months.length > 0) {
      const latest12 = computeLatest12MonthSummary(res.months);
      const avgUnits = res.avgMonthlyUnits || latest12.avgUnits;
      const avgBill = res.avgMonthlyBill || latest12.avgBill;
      const latestRow =
        latest12.basisRows[latest12.basisRows.length - 1] || res.months[res.months.length - 1];
      const verifiedCnt = latest12.totalVerifiedInDataset;
      const netImport = res.livePortalBill?.unitsKwh || latestRow.unitsKwh || avgUnits;
      const latestBill = res.livePortalBill?.billAmountInr || latestRow.billAmountInr || avgBill;

      const resolvedUsc = res.uscNumber || res.match.normalizedUsc || targetUsc;
      onUpdateInputs({
        uscNumber: resolvedUsc,
        stateId: res.match.stateId,
        discomId: res.match.discom.discomId,
        gridImportKwh: netImport,
        currentMonthlyBill: latestBill,
        monthlyConsumptionKwh: Math.max(
          inputs.monthlyGenerationKwh - inputs.gridExportKwh + netImport,
          netImport
        ),
        auditedMonths: res.months,
      });

      setMeterSyncMsg(
        `Synced ${res.months.length} months (${verifiedCnt}/${res.months.length} Portal Verified) · Latest: ${netImport} kWh (₹${latestBill.toLocaleString('en-IN')}) · ${latest12.basisCount}-Mo Avg ${avgUnits} kWh/mo`
      );

      if (onRecordUscHistory) {
        onRecordUscHistory({
          id: `${resolvedUsc}|${res.match.stateId}`,
          uscNumber: resolvedUsc,
          consumerName: res.livePortalBill?.consumerName,
          discomShortName: res.match.discom.shortName,
          discomId: res.match.discom.discomId,
          stateId: res.match.stateId,
          stateName: res.match.stateName,
          sanctionedLoadKw: res.sanctionedLoadKw ?? res.livePortalBill?.contractedLoadKw,
          avgMonthlyUnits: avgUnits,
          avgMonthlyBill: avgBill,
          monthsCount: res.months.length,
          verifiedMonthsCount: verifiedCnt,
          lastFetchedAtIst: res.syncedAtIst || getIndiaClockInfo(now).formattedIst,
          timestampIso: now.toISOString(),
          months: res.months,
        });
      }
    } else if (res.portalMessage) {
      setMeterSyncMsg(res.portalMessage);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-sky-50/60 dark:bg-slate-950 pb-8 transition-colors">
      {!hideTopBar && (
        <MaterialTopBar
          title="Existing Solar Plant Audit"
          subtitle={`System Performance & Generation Analysis`}
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
        />
      )}

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Performance Ratio Banner */}
        <div
          className={`rounded-3xl p-5 border text-white shadow-xl space-y-4 ${
            analysis.healthStatus === 'OPTIMAL'
              ? 'bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900 border-emerald-600/40'
              : analysis.healthStatus === 'MODERATE_ATTENTION'
              ? 'bg-gradient-to-br from-amber-950 via-yellow-950 to-slate-900 border-amber-600/40'
              : 'bg-gradient-to-br from-red-950 via-rose-950 to-slate-900 border-red-600/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wide uppercase text-amber-300">
              Solar Health Index
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 border border-white/30 text-[11px] font-bold">
              {analysis.healthStatus === 'OPTIMAL'
                ? 'Healthy Operation'
                : analysis.healthStatus === 'MODERATE_ATTENTION'
                ? 'Maintenance Needed'
                : 'Underperforming Alert'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-white">
              {analysis.performanceRatioPercent}%
            </span>
            <span className="text-lg font-bold text-slate-300">Performance Ratio (PR)</span>
          </div>

          {/* 3 Metrics */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
            <div className="bg-white/5 rounded-xl p-2.5 backdrop-blur-xs border border-white/10">
              <div className="text-[10px] text-slate-300">Specific Yield</div>
              <div className="text-sm font-bold text-amber-300 mt-0.5">
                {analysis.specificYieldKwhPerKwpPerDay}
              </div>
              <div className="text-[9px] text-slate-400">kWh/kWp/day</div>
            </div>

            <div className="bg-white/5 rounded-xl p-2.5 backdrop-blur-xs border border-white/10">
              <div className="text-[10px] text-slate-300">Self-Consumption</div>
              <div className="text-sm font-bold text-emerald-300 mt-0.5">
                {analysis.selfConsumptionRatePercent}%
              </div>
              <div className="text-[9px] text-slate-400">Used On-Site</div>
            </div>

            <div className="bg-white/5 rounded-xl p-2.5 backdrop-blur-xs border border-white/10">
              <div className="text-[10px] text-slate-300">Bill Drop</div>
              <div className="text-sm font-bold text-sky-200 mt-0.5">
                {analysis.billReductionPercent}%
              </div>
              <div className="text-[9px] text-slate-400">Reduced</div>
            </div>
          </div>
        </div>

        {/* Utility Account Lookup: Strict USC Number Only */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950 text-[#FF6F00] flex items-center justify-center font-bold text-xs">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                  Utility Account &amp; Meter Audit Sync
                </h3>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Enter your USC Number to fetch official grid units &amp; bills
                </p>
              </div>
            </div>
            {hasAnyConnId && (
              <span className="text-[10px] font-extrabold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800 shrink-0">
                {resolvedConn.primaryType} Ready
              </span>
            )}
          </div>

          {/* 4-State Grid Selector */}
          <div className="grid grid-cols-4 gap-1">
            {FOUR_STATES_LIST.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setAuditStateId(st.id);
                  onUpdateInputs({ stateId: st.id });
                }}
                className={`py-1.5 px-1 rounded-xl text-[10.5px] font-bold transition cursor-pointer border text-center ${
                  auditStateId === st.id
                    ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {st.badge}
              </button>
            ))}
          </div>

          {/* Strict Single USC Number Input */}
          <div>
            <label
              htmlFor="audit-usc-number"
              className="block text-slate-600 dark:text-slate-300 font-semibold mb-1 text-[11px]"
            >
              USC Number (Unique Service Number)
            </label>
            <input
              id="audit-usc-number"
              type="text"
              value={uscStr}
              onChange={(e) => {
                onUpdateInputs({ uscNumber: e.target.value });
                if (meterSyncError) setMeterSyncError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAuditMeterFetch();
                }
              }}
              placeholder={`e.g. ${activeDiscom.exampleNumbers[0] || '102603120'}`}
              className={`w-full p-2.5 rounded-xl border bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100 ${
                uscCheck && !uscCheck.isValid
                  ? 'border-rose-400'
                  : uscCheck?.isValid
                  ? 'border-emerald-400'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
              Portal: <strong className="text-slate-700 dark:text-slate-200">{activeDiscom.shortName}</strong>{' '}
              <a
                href={activeDiscom.billHistoryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-600 dark:text-sky-400 font-bold hover:underline inline-flex items-center gap-0.5 ml-1"
              >
                <span>View History</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </span>

            <button
              type="button"
              onClick={() => handleAuditMeterFetch()}
              disabled={isSyncingMeter || !hasAnyConnId}
              className="px-3.5 py-2 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition shadow-2xs"
            >
              {isSyncingMeter ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{isSyncingMeter ? 'Syncing Portal...' : 'Fetch & Sync Audit'}</span>
            </button>
          </div>

          {/* APSPDCL optional mobile */}
          {(auditStateId === 'andhra_pradesh' || verificationStep === 'mobile_required') && (
            <div className="rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 flex items-center gap-2">
              <Smartphone className="w-3.5 h-3.5 text-[#FF6F00] shrink-0" />
              <input
                type="tel"
                maxLength={10}
                value={mobileInput}
                onChange={(e) => setMobileInput(e.target.value.replace(/\D/g, ''))}
                placeholder="10-digit linked mobile (for APSPDCL USC No)"
                className="flex-1 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-xs font-bold text-slate-800 dark:text-white"
              />
            </div>
          )}

          {/* Inline CAPTCHA verification when TGSPDCL returns challenge */}
          {captchaChallenge && (
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-sky-900 dark:text-sky-200 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
                  Official {captchaChallenge.provider} CAPTCHA Check
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const fresh = await refreshPortalCaptcha();
                    if (fresh) {
                      setCaptchaChallenge(fresh);
                      setCaptchaAnswer('');
                    }
                  }}
                  className="text-[10.5px] font-bold text-sky-600 dark:text-sky-300 hover:underline cursor-pointer"
                >
                  New Code
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <img
                  src={captchaChallenge.image}
                  alt="DISCOM Security Code"
                  className="h-10 rounded-lg border border-sky-200 bg-white px-1"
                />
                <input
                  type="text"
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 min-w-[100px] px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-xs font-bold"
                />
                <button
                  type="button"
                  onClick={() => handleAuditMeterFetch({ withCaptcha: true })}
                  disabled={isSyncingMeter || !captchaAnswer.trim()}
                  className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                >
                  Verify &amp; Sync
                </button>
              </div>
            </div>
          )}

          {meterSyncError && (
            <p className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{meterSyncError}</span>
            </p>
          )}

          {(meterSyncMsg || hasVerifiedDiscomAudit) && (
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-3 py-2.5 text-[11px] font-semibold text-emerald-800 dark:text-emerald-200 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 font-extrabold text-emerald-900 dark:text-emerald-100">
                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                  <span>
                    {syncedConsumerName
                      ? `${syncedConsumerName} · Official DISCOM Record`
                      : `Official DISCOM Bills Synced (USC #${inputs.uscNumber})`}
                  </span>
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  {verifiedAuditMonths.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAuditBills((prev) => !prev)}
                      className="text-sky-700 dark:text-sky-300 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Receipt className="w-3 h-3" />
                      <span>{showAuditBills ? 'Hide Bills' : `View ${verifiedAuditMonths.length} Bills`}</span>
                      <ChevronDown className={`w-3 h-3 transition-transform ${showAuditBills ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  {hasVerifiedDiscomAudit && (
                    <button
                      type="button"
                      onClick={handleClearDiscomLock}
                      className="text-slate-600 dark:text-slate-300 hover:text-rose-600 font-bold cursor-pointer"
                    >
                      Clear USC
                    </button>
                  )}
                </div>
              </div>
              {syncedConsumerDetails && (
                <div className="text-[10px] opacity-90">{syncedConsumerDetails}</div>
              )}
              {meterSyncMsg && <div>{meterSyncMsg}</div>}

              {syncedLiveBill &&
                (typeof syncedLiveBill.energyChargeInr === 'number' ||
                  typeof syncedLiveBill.fixedChargeInr === 'number') && (
                  <div className="rounded-lg bg-white/80 dark:bg-slate-900/70 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-1.5 text-[10px] grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-0.5 text-slate-700 dark:text-slate-200">
                    {typeof syncedLiveBill.energyChargeInr === 'number' && (
                      <span>Energy: <strong>₹{syncedLiveBill.energyChargeInr.toFixed(2)}</strong></span>
                    )}
                    {typeof syncedLiveBill.fixedChargeInr === 'number' && (
                      <span>Fixed: <strong>₹{syncedLiveBill.fixedChargeInr.toFixed(2)}</strong></span>
                    )}
                    {typeof syncedLiveBill.customerChargeInr === 'number' && (
                      <span>Cust Chg: <strong>₹{syncedLiveBill.customerChargeInr.toFixed(2)}</strong></span>
                    )}
                    {typeof syncedLiveBill.electricityDutyInr === 'number' && (
                      <span>ED: <strong>₹{syncedLiveBill.electricityDutyInr.toFixed(2)}</strong></span>
                    )}
                    {typeof syncedLiveBill.trueUpChargeInr === 'number' && syncedLiveBill.trueUpChargeInr !== 0 && (
                      <span>True-Up: <strong>₹{syncedLiveBill.trueUpChargeInr.toFixed(2)}</strong></span>
                    )}
                    {syncedLiveBill.dueDate && (
                      <span>Due: <strong>{syncedLiveBill.dueDate}</strong></span>
                    )}
                  </div>
                )}

              {showAuditBills && verifiedAuditMonths.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 divide-y divide-slate-100 dark:divide-slate-800 text-[10px] text-slate-800 dark:text-slate-200">
                  {verifiedAuditMonths.map((row, idx) => (
                    <div key={`${row.month}-${idx}`} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold">{row.month}</span>
                        {row.receiptNo && (
                          <span className="ml-1.5 font-mono text-[9px] text-sky-600 dark:text-sky-400">
                            PR #{row.receiptNo}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-bold">
                        <span>{row.unitsKwh} kWh</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          ₹{row.billAmountInr.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Quick-Pick from USC History for Recurring Audits */}
          {uscHistory.length > 0 && (
            <div className="pt-1 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                <History className="w-3 h-3" />
                <span>Shared USC History · Quick Re-Run ({uscHistory.length})</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {uscHistory.slice(0, 8).map((h) => {
                  const avg12 = resolveHistory12MonthAverage(h);
                  return (
                    <button
                      key={h.id}
                      type="button"
                      onClick={() =>
                        handleAuditMeterFetch({
                          overrideUsc: h.uscNumber || '',
                          overrideStateId: (h.stateId as FourStateId) || 'telangana',
                        })
                      }
                      className="px-2.5 py-1 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition"
                    >
                      USC {h.uscNumber} · {avg12.avgMonthlyUnits} kWh
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Existing System Specifications Input Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 flex items-center justify-center font-bold text-xs">
              <Layers className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Installed Equipment Specifications</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Total Capacity (kWp)</label>
              <input
                type="number"
                step="0.1"
                value={inputs.installedCapacityKwp}
                onChange={(e) =>
                  onUpdateInputs({ installedCapacityKwp: parseFloat(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Inverter Capacity (kW)</label>
              <input
                type="number"
                step="0.1"
                value={inputs.inverterCapacityKw}
                onChange={(e) =>
                  onUpdateInputs({ inverterCapacityKw: parseFloat(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Panel Wattage (W)</label>
              <input
                type="number"
                value={inputs.panelWattage}
                onChange={(e) =>
                  onUpdateInputs({ panelWattage: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Panel Quantity</label>
              <input
                type="number"
                value={inputs.panelQuantity}
                onChange={(e) =>
                  onUpdateInputs({ panelQuantity: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-medium text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Inverter Architecture</label>
            <select
              value={inputs.inverterType}
              onChange={(e) => onUpdateInputs({ inverterType: e.target.value as any })}
              className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
            >
              <option value="String">String Inverter (Central MPPT)</option>
              <option value="Microinverter">Microinverters (Panel-level MPPT)</option>
              <option value="Hybrid">Hybrid Energy Storage Inverter</option>
            </select>
          </div>
        </div>

        {/* Real Generation & Net Metering Data Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
              <Activity className="w-4 h-4" />
            </div>
            <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Monthly Generation & Utility Billing</h3>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Monthly Generation (kWh)</label>
              <input
                type="number"
                value={inputs.monthlyGenerationKwh}
                onChange={(e) =>
                  onUpdateInputs({ monthlyGenerationKwh: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-emerald-700 dark:text-emerald-400"
              />
            </div>

            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Monthly Consumption (kWh)</label>
              <input
                type="number"
                value={inputs.monthlyConsumptionKwh}
                onChange={(e) =>
                  onUpdateInputs({ monthlyConsumptionKwh: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">Grid Exported (kWh)</label>
              <input
                type="number"
                value={inputs.gridExportKwh}
                onChange={(e) =>
                  onUpdateInputs({ gridExportKwh: parseInt(e.target.value) || 0 })
                }
                className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
              />
            </div>

            <div>
              <label className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-medium mb-1">
                <span>Grid Imported (kWh)</span>
                {hasVerifiedDiscomAudit && (
                  <span className="inline-flex items-center gap-0.5 text-[9.5px] font-extrabold text-emerald-700 dark:text-emerald-400">
                    Govt DISCOM
                  </span>
                )}
              </label>
              <input
                type="number"
                readOnly={hasVerifiedDiscomAudit}
                value={inputs.gridImportKwh}
                onChange={(e) => {
                  if (!hasVerifiedDiscomAudit) {
                    onUpdateInputs({ gridImportKwh: parseInt(e.target.value) || 0 });
                  }
                }}
                className={`w-full p-2.5 rounded-xl border font-bold ${
                  hasVerifiedDiscomAudit
                    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 text-slate-800 dark:text-slate-100 cursor-not-allowed'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
                }`}
              />
            </div>
          </div>

          {/* Electricity Bills Pre & Post */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <div className="p-2.5 bg-slate-50 dark:bg-slate-800/80 rounded-xl">
              <label className="block text-slate-500 dark:text-slate-400 text-[11px] font-medium mb-1">
                Bill Before Solar ({inputs.currency})
              </label>
              <input
                type="number"
                value={inputs.preSolarMonthlyBill}
                onChange={(e) =>
                  onUpdateInputs({ preSolarMonthlyBill: parseFloat(e.target.value) || 0 })
                }
                className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
              />
            </div>

            <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
              <label className="flex items-center justify-between text-emerald-900 dark:text-emerald-300 text-[11px] font-medium mb-1">
                <span>Current Bill ({inputs.currency})</span>
              </label>
              <input
                type="number"
                readOnly={hasVerifiedDiscomAudit}
                value={inputs.currentMonthlyBill}
                onChange={(e) => {
                  if (!hasVerifiedDiscomAudit) {
                    onUpdateInputs({ currentMonthlyBill: parseFloat(e.target.value) || 0 });
                  }
                }}
                className={`w-full p-1.5 rounded-lg border font-bold text-emerald-700 dark:text-emerald-400 ${
                  hasVerifiedDiscomAudit
                    ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-100/50 dark:bg-emerald-950/60 cursor-not-allowed'
                    : 'border-emerald-200 dark:border-emerald-700 bg-white dark:bg-slate-800'
                }`}
              />
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/50 flex justify-between items-center text-xs">
            <span className="font-semibold text-sky-900 dark:text-sky-300">Calculated Monthly Bill Savings:</span>
            <span className="font-extrabold text-sky-800 dark:text-sky-300 text-sm">
              {sym} {analysis.actualMonthlySavings.toLocaleString()} / month
            </span>
          </div>
        </div>

        {/* Diagnostic Recommendations */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-2.5 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Diagnostic & Maintenance Recommendations
            </h3>
          </div>

          <div className="space-y-2">
            {analysis.diagnosticRecommendations.map((rec, i) => (
              <div
                key={i}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-300 flex items-start gap-2.5"
              >
                <span className="w-5 h-5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 flex items-center justify-center font-bold text-[10px] shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{rec}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => onNavigate('dashboard')}
            className="flex-1 py-3 px-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          >
            Dashboard
          </button>

          <button
            onClick={() => onNavigate('maintenance')}
            className="flex-1 py-3 px-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition"
          >
            Log Maintenance
          </button>
        </div>
      </div>
    </div>
  );
};
