import React, { useState } from 'react';
import {
  Sun,
  Activity,
  ArrowUpRight,
  TrendingDown,
  Sparkles,
  CloudSun,
  ChevronRight,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { WeatherCondition, CurrencyCode, ScreenId } from '../types/solar';
import { ResolvedInverterTelemetry } from '../types/inverter';
import { CURRENCY_SYMBOLS } from '../utils/solarMath';
import { resolveInverterTelemetry } from '../services/inverterSyncService';
import { useLanguage } from '../context/LanguageContext';
import { PotentialGainModal } from './energyDetails/PotentialGainModal';
import { ActualUsageModal } from './energyDetails/ActualUsageModal';
import { NetEnergyBalanceModal } from './energyDetails/NetEnergyBalanceModal';
import { FinancialValueModal } from './energyDetails/FinancialValueModal';

interface TodayEnergySummaryWidgetsProps {
  weather: WeatherCondition;
  systemCapacityKwp?: number;
  applianceDailyKwh?: number;
  electricityRate?: number;
  currency?: CurrencyCode;
  applianceCount?: number;
  onOpenWeather?: () => void;
  onNavigate?: (screen: ScreenId) => void;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: (tab?: 'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs') => void;
  onQuickInverterSync?: () => void;
  isSyncingInverter?: boolean;
  className?: string;
}

export const TodayEnergySummaryWidgets: React.FC<TodayEnergySummaryWidgetsProps> = ({
  weather,
  systemCapacityKwp = 5.0,
  applianceDailyKwh = 18.2,
  electricityRate = 7.5,
  currency = 'INR',
  applianceCount = 8,
  onOpenWeather,
  inverterTelemetry,
  onOpenInverterHub,
  onQuickInverterSync,
  isSyncingInverter = false,
  className = '',
}) => {
  const { t } = useLanguage();
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  // Dedicated interactive modals for the 4 core options
  const [activeModal, setActiveModal] = useState<
    'none' | 'potential_gain' | 'actual_usage' | 'net_balance' | 'financial_value'
  >('none');

  // Always resolve unified telemetry (uses live synced inverter when connected, weather model otherwise)
  const telemetry =
    inverterTelemetry ||
    resolveInverterTelemetry({
      plant: null,
      dailyLogs: [],
      weather,
      fallbackCapacityKwp: systemCapacityKwp,
      applianceDailyKwh,
      electricityRate,
    });

  const isConnected = telemetry.isConnected;
  const effectiveCapKwp = telemetry.effectiveCapacityKwp;
  const displayGenKwh = telemetry.displayGenKwh;
  const displayLiveKw = telemetry.displayLiveKw;
  const displayUsageKwh = telemetry.displayUsageKwh;
  const displayLiveUsageKw = telemetry.displayLiveUsageKw;
  const netBalanceKwh = telemetry.netBalanceKwh;
  const isSurplus = telemetry.isSurplus;
  const solarCoveragePercent = telemetry.solarCoveragePercent;
  const todaySavingsVal = telemetry.todayTotalSavingsInr;
  const todayCo2Kg = telemetry.todayCo2AvoidedKg;

  const weatherLabel =
    weather.weatherDescription || (weather.cloudCoverPercent < 20 ? 'Clear Sun' : 'Partly Cloudy');

  const totalBarDenom = Math.max(0.1, displayGenKwh + displayUsageKwh);

  return (
    <div className={`space-y-3 select-none ${className}`}>
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-bold text-slate-900 dark:text-white tracking-tight">
            {t('todays_balance', 'Plant Generation & Consumption')}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-normal truncate">
            · {isConnected ? `${telemetry.brandLabel} Synced` : 'Tap any card for analysis'}
          </span>
        </div>

        <button
          type="button"
          onClick={onOpenWeather}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
        >
          <CloudSun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="truncate max-w-[100px] sm:max-w-[140px]">{weatherLabel}</span>
          <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {weather.peakSunHoursEstimated} PSH
          </span>
        </button>
      </div>

      {/* Connected Inverter Telemetry Strip (Zero-pill clean surface) */}
      {onOpenInverterHub && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl px-3.5 py-2.5 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2.5 flex-wrap">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isConnected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              <Cpu className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white truncate">
                <span className="truncate">
                  {isConnected
                    ? telemetry.plant?.plantName || 'Connected Solar Inverter'
                    : 'Connect Your Installed Solar Inverter'}
                </span>
                {isConnected && (
                  <span className="font-mono tabular-nums text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                    · {effectiveCapKwp} kWp
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isConnected ? (
                  <>
                    <span>{telemetry.brandLabel}</span>
                    <span> · </span>
                    <span>{telemetry.syncSourceLabel}</span>
                    <span> · </span>
                    <span>{telemetry.meterModeLabel}</span>
                    {telemetry.plant?.lastSyncedAtIst && (
                      <>
                        <span> · </span>
                        <span className="font-mono">{telemetry.plant.lastSyncedAtIst}</span>
                      </>
                    )}
                  </>
                ) : (
                  <span>
                    Sync Cloud API, CSV export, or meter reading to drive all 4 cards with real plant generation
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 ml-auto">
            {isConnected && onQuickInverterSync && telemetry.plant?.syncSource === 'cloud_api' && (
              <button
                type="button"
                onClick={onQuickInverterSync}
                disabled={isSyncingInverter}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-semibold transition cursor-pointer disabled:opacity-60"
                title="Refresh live inverter telemetry from Cloud API"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingInverter ? 'animate-spin' : ''}`} />
                <span>{isSyncingInverter ? 'Syncing' : 'Sync'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenInverterHub(isConnected ? 'manual_entry' : 'cloud_api')}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-[11px] font-bold transition cursor-pointer"
            >
              <span>{isConnected ? 'Sync Hub' : 'Connect Inverter'}</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* 4 Dedicated Core Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* ============================================================== */}
        {/* OPTION 1: POTENTIAL GAIN / ACTUAL INVERTER GENERATION          */}
        {/* ============================================================== */}
        <div
          onClick={() => setActiveModal('potential_gain')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-amber-400 dark:hover:border-amber-500/80 transition cursor-pointer group flex flex-col justify-between min-h-[154px]"
          title="Click to view actual vs potential plant gain, generation curve, and daily logs"
        >
          <div className="flex items-start justify-between gap-1">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Sun className="w-4 h-4 fill-current" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-amber-600 transition flex items-center gap-0.5 text-right">
              <span>{isConnected ? 'Actual / Potential' : t('potential_gain', 'Potential Gain')}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition shrink-0" />
            </span>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
                {displayGenKwh}
              </span>
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">kWh</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
              {isConnected && telemetry.performanceRatioPct !== null
                ? `${telemetry.performanceRatioPct}% of ${telemetry.weatherPotentialGenKwh} kWh potential`
                : `Yield from ${effectiveCapKwp} kWp plant`}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>{displayLiveKw > 0 ? `${displayLiveKw} kW live` : isConnected ? '0.0 kW now' : 'Night (0 kW)'}</span>
            <span className={isConnected ? 'text-emerald-600 dark:text-emerald-400 font-sans font-semibold' : ''}>
              {isConnected ? telemetry.syncSourceLabel : `${weather.globalHorizontalIrradianceWpm2 || 850} W/m²`}
            </span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* OPTION 2: ACTUAL USAGE (Auto-Detected CT Meter vs Appliances)  */}
        {/* ============================================================== */}
        <div
          onClick={() => setActiveModal('actual_usage')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-sky-400 dark:hover:border-sky-500/80 transition cursor-pointer group flex flex-col justify-between min-h-[154px]"
          title="Click to view 24h consumption profile and smart solar load shifting"
        >
          <div className="flex items-start justify-between gap-1">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-sky-600 transition flex items-center gap-0.5 text-right">
              <span>{t('actual_usage', 'Actual Usage')}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition shrink-0" />
            </span>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
                {displayUsageKwh}
              </span>
              <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">kWh</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {telemetry.hasSmartMeterActive && telemetry.meteredUsageKwh !== null
                ? 'CT smart-metered home load'
                : 'Household appliance load'}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>{displayLiveUsageKw} kW avg</span>
            <span className="font-sans">
              {telemetry.hasSmartMeterActive && telemetry.meteredUsageKwh !== null
                ? 'CT Metered'
                : `${applianceCount} appliances`}
            </span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* OPTION 3: NET ENERGY BALANCE                                   */}
        {/* ============================================================== */}
        <div
          onClick={() => setActiveModal('net_balance')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-emerald-400 dark:hover:border-emerald-500/80 transition cursor-pointer group flex flex-col justify-between min-h-[154px]"
          title="Click to view bidirectional grid energy flow and battery storage simulation"
        >
          <div className="flex items-start justify-between gap-1">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                isSurplus
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              }`}
            >
              {isSurplus ? <ArrowUpRight className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 transition flex items-center gap-0.5 text-right">
              <span>{isSurplus ? t('net_balance', 'Net Surplus') : 'Grid Deficit'}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition shrink-0" />
            </span>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span
                className={`text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight ${
                  isSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {isSurplus ? `+${netBalanceKwh}` : netBalanceKwh}
              </span>
              <span
                className={`text-xs font-semibold ${
                  isSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                kWh
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
              {telemetry.hasSmartMeterActive &&
              (telemetry.meteredExportKwh !== null || telemetry.meteredImportKwh !== null)
                ? `Exp ${telemetry.exportedKwh} · Imp ${telemetry.importedKwh} kWh`
                : isSurplus
                  ? 'Surplus exported to grid'
                  : 'Deficit drawn from grid'}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-mono tabular-nums">Offset: {solarCoveragePercent}%</span>
            <span
              className={`font-semibold ${
                isSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {telemetry.hasSmartMeterActive ? 'Metered Grid' : isSurplus ? 'Clean Export' : 'Grid Reliance'}
            </span>
          </div>
        </div>

        {/* ============================================================== */}
        {/* OPTION 4: TODAY'S FINANCIAL & CARBON VALUE                     */}
        {/* ============================================================== */}
        <div
          onClick={() => setActiveModal('financial_value')}
          className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 hover:border-purple-400 dark:hover:border-purple-500/80 transition cursor-pointer group flex flex-col justify-between min-h-[154px]"
          title="Click to view tariff rate savings, feed-in income, and CO2 ledger"
        >
          <div className="flex items-start justify-between gap-1">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 group-hover:text-purple-600 transition flex items-center gap-0.5 text-right">
              <span>{t('financial_value', 'Financial Value')}</span>
              <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition shrink-0" />
            </span>
          </div>

          <div className="my-1.5">
            <div className="flex items-baseline gap-1">
              <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white tracking-tight">
                {currencySymbol}
                {todaySavingsVal}
              </span>
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {isConnected ? 'earned' : 'saved'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums truncate">
              @ {currencySymbol}
              {electricityRate.toFixed(1)} · Exp {currencySymbol}
              {telemetry.exportTariffInr.toFixed(1)}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            <span>{todayCo2Kg} kg CO₂</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-sans font-semibold">
              {isConnected ? 'Actual offset' : 'Clean offset'}
            </span>
          </div>
        </div>
      </div>

      {/* Clean Comparative Energy Flow Balance Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-600 dark:text-slate-400 font-medium">
            {isConnected ? 'Inverter Solar:' : 'Solar Potential:'}{' '}
            <strong className="text-slate-900 dark:text-white font-mono tabular-nums">
              {displayGenKwh} kWh
            </strong>
          </span>
          <span className="text-slate-600 dark:text-slate-400 font-medium">
            {telemetry.hasSmartMeterActive && telemetry.meteredUsageKwh !== null
              ? 'Metered Load:'
              : 'Load:'}{' '}
            <strong className="text-slate-900 dark:text-white font-mono tabular-nums">
              {displayUsageKwh} kWh
            </strong>
          </span>
        </div>

        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex gap-0.5">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{
              width: `${Math.min(100, (displayGenKwh / totalBarDenom) * 100)}%`,
            }}
          />
          <div
            className="h-full rounded-full bg-sky-500 transition-all duration-500"
            style={{
              width: `${Math.min(100, (displayUsageKwh / totalBarDenom) * 100)}%`,
            }}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-0.5 font-mono tabular-nums">
          <span>
            {isConnected
              ? `Potential ${telemetry.weatherPotentialGenKwh} kWh · PR ${telemetry.performanceRatioPct ?? '—'}%`
              : `${weather.directNormalIrradianceWpm2} DNI · ${weather.globalHorizontalIrradianceWpm2} GHI`}
          </span>
          <span
            className={`font-sans font-semibold ${
              isSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {isSurplus ? `+${netBalanceKwh} kWh Net Export` : `${netBalanceKwh} kWh Net Import`}
          </span>
        </div>
      </div>

      {/* Dedicated Interactive Feature Modals */}
      <PotentialGainModal
        isOpen={activeModal === 'potential_gain'}
        onClose={() => setActiveModal('none')}
        systemCapacityKwp={effectiveCapKwp}
        weather={weather}
        currency={currency}
        electricityRate={electricityRate}
        inverterTelemetry={telemetry}
        onOpenInverterHub={onOpenInverterHub ? () => onOpenInverterHub('cloud_api') : undefined}
      />

      <ActualUsageModal
        isOpen={activeModal === 'actual_usage'}
        onClose={() => setActiveModal('none')}
        dailyUsageKwh={displayUsageKwh}
        applianceCount={applianceCount}
        electricityRate={electricityRate}
        currency={currency}
        systemCapacityKwp={effectiveCapKwp}
        inverterTelemetry={telemetry}
        onOpenInverterHub={onOpenInverterHub ? () => onOpenInverterHub('cloud_api') : undefined}
      />

      <NetEnergyBalanceModal
        isOpen={activeModal === 'net_balance'}
        onClose={() => setActiveModal('none')}
        potentialGenKwh={displayGenKwh}
        actualUsageKwh={displayUsageKwh}
        currency={currency}
        electricityRate={electricityRate}
        exportFeedInRate={telemetry.exportTariffInr}
        inverterTelemetry={telemetry}
        onOpenInverterHub={onOpenInverterHub ? () => onOpenInverterHub('cloud_api') : undefined}
      />

      <FinancialValueModal
        isOpen={activeModal === 'financial_value'}
        onClose={() => setActiveModal('none')}
        potentialGenKwh={displayGenKwh}
        actualUsageKwh={displayUsageKwh}
        initialTariff={electricityRate}
        exportFeedInRate={telemetry.exportTariffInr}
        currency={currency}
        inverterTelemetry={telemetry}
        onOpenInverterHub={onOpenInverterHub ? () => onOpenInverterHub('cloud_api') : undefined}
      />
    </div>
  );
};
