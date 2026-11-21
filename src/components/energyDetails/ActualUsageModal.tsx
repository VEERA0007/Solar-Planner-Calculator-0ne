import React, { useState } from 'react';
import {
  X,
  Activity,
  Zap,
  Clock,
  CheckCircle2,
  Sliders,
  Sparkles,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { CurrencyCode } from '../../types/solar';
import { ResolvedInverterTelemetry } from '../../types/inverter';
import { CURRENCY_SYMBOLS } from '../../utils/solarMath';

interface ActualUsageModalProps {
  isOpen: boolean;
  onClose: () => void;
  dailyUsageKwh: number;
  applianceCount?: number;
  electricityRate?: number;
  currency?: CurrencyCode;
  systemCapacityKwp?: number;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: () => void;
}

export const ActualUsageModal: React.FC<ActualUsageModalProps> = ({
  isOpen,
  onClose,
  dailyUsageKwh = 18.2,
  applianceCount = 8,
  electricityRate = 7.5,
  currency = 'INR',
  systemCapacityKwp = 5.0,
  inverterTelemetry,
  onOpenInverterHub,
}) => {
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  // State for smart load shifting simulation
  const [shiftWashingMachine, setShiftWashingMachine] = useState(true);
  const [shiftWaterHeater, setShiftWaterHeater] = useState(true);
  const [shiftEvCharger, setShiftEvCharger] = useState(false);

  if (!isOpen) return null;

  // Calculated load breakdown
  const daytimeRatio = 0.62;
  const daytimeLoadKwh = parseFloat((dailyUsageKwh * daytimeRatio).toFixed(1));
  const nighttimeLoadKwh = parseFloat((dailyUsageKwh * (1 - daytimeRatio)).toFixed(1));
  const peakLoadKw = parseFloat((Math.max(2.8, dailyUsageKwh * 0.18)).toFixed(2));
  const baseLoadKw = parseFloat((Math.max(0.3, dailyUsageKwh * 0.03)).toFixed(2));

  // Shifted savings calculation
  let shiftedUnits = 0;
  if (shiftWashingMachine) shiftedUnits += 1.8;
  if (shiftWaterHeater) shiftedUnits += 2.5;
  if (shiftEvCharger) shiftedUnits += 6.5;

  const solarDirectCoveragePct = Math.min(
    95,
    Math.round(((daytimeLoadKwh + shiftedUnits) / dailyUsageKwh) * 100)
  );
  const dailyShiftSavings = Math.round(shiftedUnits * electricityRate);

  // 24-hour load and solar curve
  const hourlyProfile = [
    { hour: '00:00', loadKw: 0.45, solarKw: 0 },
    { hour: '02:00', loadKw: 0.38, solarKw: 0 },
    { hour: '04:00', loadKw: 0.35, solarKw: 0 },
    { hour: '06:00', loadKw: 0.85, solarKw: 0.1 },
    { hour: '08:00', loadKw: 1.45, solarKw: 1.6 },
    { hour: '10:00', loadKw: shiftWashingMachine ? 2.65 : 1.65, solarKw: 3.4 },
    { hour: '12:00', loadKw: shiftWaterHeater ? 3.45 : 1.95, solarKw: 4.2 },
    { hour: '14:00', loadKw: shiftEvCharger ? 4.1 : 1.85, solarKw: 3.6 },
    { hour: '16:00', loadKw: 1.75, solarKw: 2.1 },
    { hour: '18:00', loadKw: 2.45, solarKw: 0.2 },
    { hour: '20:00', loadKw: 2.85, solarKw: 0 },
    { hour: '22:00', loadKw: 1.25, solarKw: 0 },
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
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Actual Usage & Consumption Breakdown
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                24h consumption profile, peak load demand & solar self-consumption
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
                  {inverterTelemetry.hasSmartMeterActive && inverterTelemetry.meteredUsageKwh !== null
                    ? 'CT Clamp / Smart Meter Live Home Consumption'
                    : inverterTelemetry.isConnected
                      ? 'Generation-Only Inverter · Paired with Appliance Load'
                      : 'Appliance & DISCOM Consumption Estimate'}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {inverterTelemetry.hasSmartMeterActive && inverterTelemetry.meteredUsageKwh !== null
                    ? `Auto-detected from ${inverterTelemetry.plant?.plantName} (${inverterTelemetry.syncSourceLabel}) · ${inverterTelemetry.meteredUsageKwh} kWh metered`
                    : `${applianceCount} tracked appliances · ${dailyUsageKwh} kWh/day baseline`}
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
                  Inverter Settings
                </button>
              )}
            </div>
          )}

          {/* Key Metrics 4-Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Daily Consumption
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {dailyUsageKwh}
                </span>
                <span className="text-xs font-semibold text-sky-600 dark:text-sky-400">kWh</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Daytime Load
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {daytimeLoadKwh}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh ({Math.round(daytimeRatio * 100)}%)</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Night Grid Load
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {nighttimeLoadKwh}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Peak Demand
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {peakLoadKw}
                </span>
                <span className="text-xs font-semibold text-slate-500">kW</span>
              </div>
            </div>
          </div>

          {/* 24h Hourly Load vs Solar Generation Curve */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>24-Hour Load Curve vs Solar Generation</span>
              <div className="flex items-center gap-3 text-[11px] font-normal">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                  <span>Home Load</span>
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>Solar Output</span>
                </span>
              </div>
            </div>
            <div className="h-56 w-full rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-2 border border-slate-100 dark:border-slate-800">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyProfile} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="loadCurveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="solarOverlapGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" opacity={0.15} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-2.5 bg-slate-900 text-white rounded-lg text-xs shadow-lg space-y-1">
                            <p className="font-bold">{payload[0].payload.hour}</p>
                            <p className="text-sky-400 font-mono">Load: {payload[0].value} kW</p>
                            <p className="text-amber-400 font-mono">Solar: {payload[1]?.value} kW</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="loadKw"
                    stroke="#0EA5E9"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#loadCurveGrad)"
                    name="Home Load"
                  />
                  <Area
                    type="monotone"
                    dataKey="solarKw"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#solarOverlapGrad)"
                    name="Solar"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Interactive Smart Solar Load Shifter */}
          <div className="p-4.5 rounded-2xl bg-sky-500/5 border border-sky-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-900 dark:text-white text-xs flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-500" />
                  <span>Smart Solar Load Shifter (Maximize Free Solar)</span>
                </span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Shift heavy power draws into the peak sunlight window (10:00 AM – 3:00 PM)
                </p>
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Direct Solar Offset</span>
                <span className="text-base font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  {solarDirectCoveragePct}%
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:border-sky-400 transition">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={shiftWashingMachine}
                    onChange={(e) => setShiftWashingMachine(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 accent-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Washing Machine & Dryer
                    </span>
                    <span className="text-[10px] text-slate-400">Shift cycle to 10:30 AM (1.8 kWh)</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +1.8 kWh solar
                </span>
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:border-sky-400 transition">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={shiftWaterHeater}
                    onChange={(e) => setShiftWaterHeater(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 accent-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Water Heater / Geyser Timer
                    </span>
                    <span className="text-[10px] text-slate-400">Pre-heat tank at 12:30 PM (2.5 kWh)</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +2.5 kWh solar
                </span>
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 cursor-pointer hover:border-sky-400 transition">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={shiftEvCharger}
                    onChange={(e) => setShiftEvCharger(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 accent-sky-500"
                  />
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                      Electric Vehicle (EV) Smart Charger
                    </span>
                    <span className="text-[10px] text-slate-400">Solar-only daytime charging (6.5 kWh)</span>
                  </div>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +6.5 kWh solar
                </span>
              </label>
            </div>

            {/* Savings impact box */}
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/80 flex items-center justify-between text-xs">
              <span className="text-emerald-800 dark:text-emerald-300 font-medium">
                Additional Daily Savings by Shifting Load:
              </span>
              <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">
                +{currencySymbol}{dailyShiftSavings}/day ({currencySymbol}{Math.round(dailyShiftSavings * 30)}/mo)
              </span>
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
