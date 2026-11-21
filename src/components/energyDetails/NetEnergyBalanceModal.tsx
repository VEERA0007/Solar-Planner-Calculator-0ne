import React, { useState } from 'react';
import {
  X,
  ArrowUpRight,
  TrendingDown,
  Zap,
  Battery,
  BatteryCharging,
  Home,
  Sun,
  Layers,
  CheckCircle2,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { CurrencyCode } from '../../types/solar';
import { ResolvedInverterTelemetry } from '../../types/inverter';
import { CURRENCY_SYMBOLS } from '../../utils/solarMath';

interface NetEnergyBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  potentialGenKwh: number;
  actualUsageKwh: number;
  currency?: CurrencyCode;
  electricityRate?: number;
  exportFeedInRate?: number;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: () => void;
}

export const NetEnergyBalanceModal: React.FC<NetEnergyBalanceModalProps> = ({
  isOpen,
  onClose,
  potentialGenKwh = 24.8,
  actualUsageKwh = 18.2,
  currency = 'INR',
  electricityRate = 7.5,
  exportFeedInRate = 4.5,
  inverterTelemetry,
  onOpenInverterHub,
}) => {
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  // Battery storage simulator state (defaults to 0 when connected to a real on-grid inverter)
  const [selectedBatteryKwh, setSelectedBatteryKwh] = useState<number>(
    inverterTelemetry?.isConnected ? 0 : 5.0
  );

  if (!isOpen) return null;

  const hasMeteredGrid = Boolean(
    inverterTelemetry?.hasSmartMeterActive &&
      (inverterTelemetry.meteredExportKwh !== null || inverterTelemetry.meteredImportKwh !== null)
  );

  // Real-time calculations (uses exact metered export/import when CT/smart meter is active)
  const rawExportKwh = hasMeteredGrid
    ? inverterTelemetry!.exportedKwh
    : Math.max(0, potentialGenKwh - Math.min(potentialGenKwh * 0.65, actualUsageKwh * 0.75));
  const rawImportKwh = hasMeteredGrid
    ? inverterTelemetry!.importedKwh
    : Math.max(0, actualUsageKwh - Math.min(potentialGenKwh * 0.65, actualUsageKwh * 0.75));
  const directSelfConsumedKwh = hasMeteredGrid
    ? inverterTelemetry!.selfConsumedKwh
    : Math.min(potentialGenKwh * 0.65, actualUsageKwh * 0.75);

  // Battery impact
  const storedInBatteryKwh = Math.min(selectedBatteryKwh * 0.9, rawExportKwh);
  const netExportKwh = parseFloat((rawExportKwh - storedInBatteryKwh).toFixed(1));
  const netImportKwh = parseFloat(Math.max(0, rawImportKwh - storedInBatteryKwh).toFixed(1));
  const isNetSurplus = netExportKwh >= netImportKwh;
  const netBalanceKwh = parseFloat((netExportKwh - netImportKwh).toFixed(1));

  // Self-sufficiency index with battery
  const solarIndependencePct = Math.min(
    98,
    Math.round(((directSelfConsumedKwh + storedInBatteryKwh) / Math.max(0.1, actualUsageKwh)) * 100)
  );

  // Net billing calculations
  const exportCredit = Math.round(netExportKwh * exportFeedInRate);
  const importCharge = Math.round(netImportKwh * electricityRate);
  const netFinancialBenefit = Math.round(directSelfConsumedKwh * electricityRate + exportCredit - importCharge);

  // Hourly flow simulation
  const flowHourlyData = [
    { time: '06:00', solar: 0.1, load: 0.8, batterySoc: 20 },
    { time: '08:00', solar: 1.6, load: 1.4, batterySoc: 25 },
    { time: '10:00', solar: 3.4, load: 1.8, batterySoc: selectedBatteryKwh > 0 ? 55 : 0 },
    { time: '12:00', solar: 4.2, load: 1.9, batterySoc: selectedBatteryKwh > 0 ? 90 : 0 },
    { time: '14:00', solar: 3.6, load: 1.8, batterySoc: selectedBatteryKwh > 0 ? 98 : 0 },
    { time: '16:00', solar: 2.1, load: 1.7, batterySoc: selectedBatteryKwh > 0 ? 92 : 0 },
    { time: '18:00', solar: 0.2, load: 2.4, batterySoc: selectedBatteryKwh > 0 ? 65 : 0 },
    { time: '20:00', solar: 0, load: 2.8, batterySoc: selectedBatteryKwh > 0 ? 35 : 0 },
    { time: '22:00', solar: 0, load: 1.2, batterySoc: selectedBatteryKwh > 0 ? 20 : 0 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ArrowUpRight className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Net Energy Balance & Grid Flow
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Bidirectional grid exchange, net billing units & battery storage simulation
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
                  {hasMeteredGrid
                    ? 'Metered Bidirectional Grid Exchange Active'
                    : inverterTelemetry.isConnected
                      ? 'Synced Inverter Generation vs. Household Load'
                      : 'Simulated Grid Exchange (Weather Model)'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {inverterTelemetry.isConnected
                    ? `${inverterTelemetry.plant?.plantName} · ${inverterTelemetry.meterModeLabel} · Feed-in ₹${exportFeedInRate}/kWh`
                    : 'Connect your inverter to drive Net Balance from real kWh generation.'}
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
                Net Grid Balance
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className={`text-2xl font-bold font-mono tabular-nums ${
                  isNetSurplus ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                }`}>
                  {isNetSurplus ? `+${netBalanceKwh}` : netBalanceKwh}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Solar Independence
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {solarIndependencePct}%
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Grid Export
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-sky-600 dark:text-sky-400">
                  {netExportKwh}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Grid Import
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {netImportKwh}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh</span>
              </div>
            </div>
          </div>

          {/* Interactive Bidirectional Energy Flow Diagram */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-700/70 space-y-4">
            <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider block">
              Active Energy Routing Flow
            </span>

            <div className="grid grid-cols-3 gap-2.5 items-center text-center">
              {/* Solar PV Node */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-amber-300/80 dark:border-amber-700/80 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 mx-auto flex items-center justify-center mb-1">
                  <Sun className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Solar Array</span>
                <span className="font-mono text-xs font-extrabold text-amber-600">{potentialGenKwh} kWh</span>
              </div>

              {/* Central Inverter / Home Hub */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-sky-300/80 dark:border-sky-700/80 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-sky-500/10 text-sky-500 mx-auto flex items-center justify-center mb-1">
                  <Home className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Home Load</span>
                <span className="font-mono text-xs font-extrabold text-sky-600">{actualUsageKwh} kWh</span>
              </div>

              {/* Grid / Utility Node */}
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800 border border-emerald-300/80 dark:border-emerald-700/80 shadow-2xs">
                <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center mb-1">
                  <Zap className="w-4 h-4" />
                </div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Utility Grid</span>
                <span className={`font-mono text-xs font-extrabold ${isNetSurplus ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {isNetSurplus ? `+${netExportKwh} export` : `-${netImportKwh} import`}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 text-center">
              Direct self-consumption powers <strong className="text-slate-900 dark:text-white font-mono">{directSelfConsumedKwh.toFixed(1)} kWh</strong> on-site without touching the utility grid.
            </p>
          </div>

          {/* Battery Storage Integration Simulator */}
          <div className="p-4.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <BatteryCharging className="w-4 h-4 text-emerald-500" />
                  <span>Battery Storage Simulator</span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Store surplus midday solar to power evening consumption
                </p>
              </div>
              <span className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {selectedBatteryKwh > 0 ? `${selectedBatteryKwh} kWh Battery` : 'No Battery'}
              </span>
            </div>

            {/* Battery Size Selector Buttons */}
            <div className="grid grid-cols-4 gap-2">
              {[0, 5, 10, 15].map((kwh) => (
                <button
                  key={kwh}
                  onClick={() => setSelectedBatteryKwh(kwh)}
                  className={`py-2 px-1 text-center rounded-xl text-xs font-bold transition cursor-pointer ${
                    selectedBatteryKwh === kwh
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  {kwh === 0 ? 'None (Grid Only)' : `${kwh} kWh`}
                </button>
              ))}
            </div>

            {selectedBatteryKwh > 0 && (
              <div className="p-3 rounded-xl bg-white dark:bg-slate-800/80 border border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Evening Independence</span>
                  <span className="text-[11px] text-slate-400">Eliminates evening peak grid imports</span>
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 block">
                    {storedInBatteryKwh.toFixed(1)} kWh stored
                  </span>
                  <span className="text-[10px] text-slate-400">90% roundtrip efficiency</span>
                </div>
              </div>
            )}
          </div>

          {/* Net Metering Billing Summary */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 space-y-2.5">
            <span className="text-xs font-bold text-slate-900 dark:text-white block">
              Today's Net Billing Credit Breakdown
            </span>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Self-Consumption Offset Value</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  +{currencySymbol}{Math.round(directSelfConsumedKwh * electricityRate)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Feed-in Export Credit (@ {currencySymbol}{exportFeedInRate}/kWh)</span>
                <span className="font-mono font-bold text-emerald-600">
                  +{currencySymbol}{exportCredit}
                </span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Grid Import Cost (@ {currencySymbol}{electricityRate}/kWh)</span>
                <span className="font-mono font-bold text-amber-600">
                  -{currencySymbol}{importCharge}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white">
                <span>Net Daily Financial Advantage</span>
                <span className="font-mono text-emerald-600 text-sm">
                  +{currencySymbol}{netFinancialBenefit}/day
                </span>
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
