import React, { useState } from 'react';
import {
  X,
  Sparkles,
  TrendingUp,
  Leaf,
  DollarSign,
  Calendar,
  CheckCircle2,
  TreePine,
  Car,
  Flame,
  Sliders,
} from 'lucide-react';
import { CurrencyCode } from '../../types/solar';
import { ResolvedInverterTelemetry } from '../../types/inverter';
import { CURRENCY_SYMBOLS } from '../../utils/solarMath';

interface FinancialValueModalProps {
  isOpen: boolean;
  onClose: () => void;
  potentialGenKwh: number;
  actualUsageKwh: number;
  initialTariff?: number;
  exportFeedInRate?: number;
  currency?: CurrencyCode;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: () => void;
}

export const FinancialValueModal: React.FC<FinancialValueModalProps> = ({
  isOpen,
  onClose,
  potentialGenKwh = 24.8,
  actualUsageKwh = 18.2,
  initialTariff = 7.5,
  exportFeedInRate,
  currency = 'INR',
  inverterTelemetry,
  onOpenInverterHub,
}) => {
  const [tariffRate, setTariffRate] = useState<number>(initialTariff);
  const [feedInRate, setFeedInRate] = useState<number>(
    typeof exportFeedInRate === 'number'
      ? exportFeedInRate
      : parseFloat((initialTariff * 0.45).toFixed(1))
  );
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  if (!isOpen) return null;

  // Energy flows (uses real metered export & self-consumption when CT smart meter is detected)
  const hasMeteredExport = Boolean(
    inverterTelemetry?.hasSmartMeterActive && inverterTelemetry.meteredExportKwh !== null
  );
  const selfConsumedKwh = hasMeteredExport
    ? inverterTelemetry!.selfConsumedKwh
    : Math.min(potentialGenKwh, actualUsageKwh);
  const exportedKwh = hasMeteredExport
    ? inverterTelemetry!.exportedKwh
    : Math.max(0, potentialGenKwh - actualUsageKwh);

  // Financial gains
  const selfConsumptionSavings = Math.round(selfConsumedKwh * tariffRate);
  const exportEarnings = Math.round(exportedKwh * feedInRate);
  const todayTotalSavings = selfConsumptionSavings + exportEarnings;
  const cumulativeLoggedSavingsInr = inverterTelemetry
    ? Math.round(inverterTelemetry.cumulativeLoggedGenKwh * tariffRate)
    : 0;

  const monthlySavings = todayTotalSavings * 30;
  const annualSavings = todayTotalSavings * 365;
  // 10-year savings compounding 5% average electricity tariff inflation
  const tenYearCumulative = Math.round(
    Array.from({ length: 10 }).reduce<number>((acc, _, idx) => {
      const yearFactor = Math.pow(1.05, idx) * Math.pow(0.994, idx); // 5% inflation, 0.6% panel degradation
      return acc + annualSavings * yearFactor;
    }, 0)
  );

  // Carbon and environmental equivalents
  // 1 kWh solar = ~0.82 kg CO2 avoided in standard grid mix
  const co2AvoidedKg = parseFloat((potentialGenKwh * 0.82).toFixed(1));
  // 1 kWh solar = ~0.4 kg coal burned avoided in thermal plants
  const coalAvoidedKg = parseFloat((potentialGenKwh * 0.4).toFixed(1));
  // 1 mature tree absorbs ~22 kg CO2 per year (~0.06 kg per day)
  const treesEquivalent = parseFloat((co2AvoidedKg / 0.06 / 30).toFixed(1));
  // Average EV efficiency: 6.5 km per kWh
  const evKmEquivalent = Math.round(potentialGenKwh * 6.5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Today's Financial Value & Carbon Ledger
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Electricity bill savings, export earnings & environmental green offset
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6">
          {inverterTelemetry && (
            <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <span className="text-xs font-bold text-slate-900 dark:text-white block">
                  {inverterTelemetry.isConnected
                    ? `Real Earnings from Synced Inverter Generation (${potentialGenKwh} kWh)`
                    : 'Estimated Financial Value (Weather Model)'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {inverterTelemetry.isConnected
                    ? `Self-used ${selfConsumedKwh} kWh (${currencySymbol}${selfConsumptionSavings}) · Export ${exportedKwh} kWh (${currencySymbol}${exportEarnings})${
                        inverterTelemetry.cumulativeLoggedDays > 0
                          ? ` · ${inverterTelemetry.cumulativeLoggedDays}d logged ≈ ${currencySymbol}${cumulativeLoggedSavingsInr.toLocaleString('en-IN')}`
                          : ''
                      }`
                    : 'Connect your solar inverter to track real daily bill savings & feed-in earnings.'}
                </span>
              </div>
              {onOpenInverterHub && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenInverterHub();
                  }}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-800 text-[11px] font-semibold transition cursor-pointer shrink-0"
                >
                  {inverterTelemetry.isConnected ? 'Sync Hub' : 'Connect Inverter'}
                </button>
              )}
            </div>
          )}

          {/* Key Metrics 4-Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Today's Savings
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {currencySymbol}{todayTotalSavings}
                </span>
                <span className="text-xs font-semibold text-emerald-600">saved</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                30-Day Projected
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {currencySymbol}{monthlySavings.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                CO₂ Prevented
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {co2AvoidedKg}
                </span>
                <span className="text-xs font-semibold text-slate-500">kg</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Trees Equivalent
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-teal-600 dark:text-teal-400">
                  {treesEquivalent}
                </span>
                <span className="text-xs font-semibold text-slate-500">trees/mo</span>
              </div>
            </div>
          </div>

          {/* Interactive Tariff Rate Adjusters */}
          <div className="p-4.5 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3.5">
            <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-purple-500" />
              <span>Electricity Utility Tariff Adjusters</span>
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>Grid Retail Tariff ({currencySymbol}/kWh)</span>
                  <span className="font-mono font-bold">{currencySymbol}{tariffRate.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="3.0"
                  max="20.0"
                  step="0.5"
                  value={tariffRate}
                  onChange={(e) => setTariffRate(parseFloat(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-slate-700 dark:text-slate-300">
                  <span>Grid Feed-in Tariff ({currencySymbol}/kWh)</span>
                  <span className="font-mono font-bold">{currencySymbol}{feedInRate.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="1.5"
                  max="15.0"
                  step="0.5"
                  value={feedInRate}
                  onChange={(e) => setFeedInRate(parseFloat(e.target.value))}
                  className="w-full accent-purple-600 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
                />
              </div>
            </div>
          </div>

          {/* Cumulative Financial Projection Table */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white block">
              Cumulative Wealth Generated from Solar
            </span>
            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">1st Month</span>
                <p className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {currencySymbol}{monthlySavings.toLocaleString()}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">Year 1 Total</span>
                <p className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {currencySymbol}{annualSavings.toLocaleString()}
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 uppercase font-semibold">10-Year Cumulative</span>
                <p className="text-base font-bold font-mono text-purple-600 dark:text-purple-400 mt-0.5">
                  {currencySymbol}{tenYearCumulative.toLocaleString()}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-center">
              *10-Year model accounts for 5% annual grid tariff inflation and 0.6% panel degradation.
            </p>
          </div>

          {/* Environmental Carbon Ledger */}
          <div className="space-y-2.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
              Today's Environmental Clean Energy Ledger
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Leaf className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{co2AvoidedKg} kg CO₂</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Greenhouse gas avoided</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/60 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{coalAvoidedKg} kg Coal</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Thermal fuel saved</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-sky-50/70 dark:bg-sky-950/30 border border-sky-200/70 dark:border-sky-800/60 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Car className="w-4 h-4" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{evKmEquivalent} km EV</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Zero-emission driving</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
