import React, { useState } from 'react';
import {
  X,
  Sun,
  Zap,
  TrendingUp,
  Activity,
  Sliders,
  CheckCircle2,
  Info,
  Calendar,
  Layers,
  ArrowUpRight,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { WeatherCondition, CurrencyCode } from '../../types/solar';
import { ResolvedInverterTelemetry } from '../../types/inverter';
import { CURRENCY_SYMBOLS } from '../../utils/solarMath';

interface PotentialGainModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemCapacityKwp: number;
  weather: WeatherCondition;
  currency?: CurrencyCode;
  electricityRate?: number;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: () => void;
}

export const PotentialGainModal: React.FC<PotentialGainModalProps> = ({
  isOpen,
  onClose,
  systemCapacityKwp: initialCapacity = 5.0,
  weather,
  currency = 'INR',
  electricityRate = 7.5,
  inverterTelemetry,
  onOpenInverterHub,
}) => {
  const [capacityKwp, setCapacityKwp] = useState<number>(
    inverterTelemetry?.effectiveCapacityKwp || initialCapacity || 5.0
  );
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  if (!isOpen) return null;

  // Temperature & derating calculation
  const cellTemp = (weather.temperatureC || 28) + (weather.globalHorizontalIrradianceWpm2 / 800) * 25;
  const tempDeratingLossPct = Math.max(0, Math.min(15, (cellTemp - 25) * 0.38));
  const tempDeratingFactor = 1 - tempDeratingLossPct / 100;
  const cloudRatio = weather.cloudImpactRatio || Math.max(0.4, 1 - ((weather.cloudCoverPercent || 15) / 100) * 0.7);
  const effectivePsh = Math.max(2.5, Math.min(7.5, (weather.peakSunHoursEstimated || 5.5) * cloudRatio));

  // Inverter & balance of system efficiency
  const inverterEff = 0.972;
  const wiringLossPct = 2.1;
  const tiltGainPct = 8.4; // optimal seasonal tilt boost

  // Total daily potential generation
  const dailyGenKwh = parseFloat(
    (capacityKwp * effectivePsh * tempDeratingFactor * inverterEff * (1 + tiltGainPct / 100)).toFixed(1)
  );
  const specificYield = parseFloat((dailyGenKwh / capacityKwp).toFixed(2));
  const performanceRatio = parseFloat(((tempDeratingFactor * inverterEff * cloudRatio) * 100).toFixed(1));
  const peakOutputKw = parseFloat((capacityKwp * inverterEff * (weather.directNormalIrradianceWpm2 / 1000)).toFixed(2));

  // Hourly curve generation for installed plant (6:00 to 18:00)
  const hourlyData = [
    { time: '06:00', generationKw: 0.05, irradiance: 60 },
    { time: '07:00', generationKw: parseFloat((capacityKwp * 0.18).toFixed(2)), irradiance: 180 },
    { time: '08:00', generationKw: parseFloat((capacityKwp * 0.42).toFixed(2)), irradiance: 390 },
    { time: '09:00', generationKw: parseFloat((capacityKwp * 0.68).toFixed(2)), irradiance: 610 },
    { time: '10:00', generationKw: parseFloat((capacityKwp * 0.85).toFixed(2)), irradiance: 750 },
    { time: '11:00', generationKw: parseFloat((capacityKwp * 0.95).toFixed(2)), irradiance: 840 },
    { time: '12:00', generationKw: peakOutputKw, irradiance: weather.directNormalIrradianceWpm2 || 880 },
    { time: '13:00', generationKw: parseFloat((peakOutputKw * 0.98).toFixed(2)), irradiance: 860 },
    { time: '14:00', generationKw: parseFloat((capacityKwp * 0.88).toFixed(2)), irradiance: 770 },
    { time: '15:00', generationKw: parseFloat((capacityKwp * 0.72).toFixed(2)), irradiance: 630 },
    { time: '16:00', generationKw: parseFloat((capacityKwp * 0.48).toFixed(2)), irradiance: 420 },
    { time: '17:00', generationKw: parseFloat((capacityKwp * 0.22).toFixed(2)), irradiance: 210 },
    { time: '18:00', generationKw: 0.02, irradiance: 40 },
  ];

  // Projected lifetime yields
  const monthlyKwh = Math.round(dailyGenKwh * 30);
  const annualKwh = Math.round(dailyGenKwh * 365);
  const twentyFiveYearMwh = parseFloat(((annualKwh * 25 * 0.92) / 1000).toFixed(1)); // factoring 0.6% annual degradation

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Sun className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                Completed Plant Potential Gain
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generation yield, solar power curve & losses for your installed array
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
          {/* Live Inverter Actual vs Weather Potential Telemetry Strip */}
          {inverterTelemetry && (
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    {inverterTelemetry.isConnected
                      ? `Synced Inverter Actual vs. Weather Potential`
                      : 'Connect Your Installed Inverter'}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {inverterTelemetry.isConnected
                      ? `${inverterTelemetry.plant?.plantName} · ${inverterTelemetry.brandLabel} · ${inverterTelemetry.syncSourceLabel} · ${inverterTelemetry.plant?.lastSyncedAtIst}`
                      : 'Showing weather-adjusted theoretical potential. Sync your inverter for live kWh & Performance Ratio.'}
                  </span>
                </div>
                {onOpenInverterHub && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenInverterHub();
                    }}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold transition cursor-pointer shrink-0"
                  >
                    {inverterTelemetry.isConnected ? 'Sync Hub' : 'Connect Inverter'}
                  </button>
                )}
              </div>

              {inverterTelemetry.isConnected && inverterTelemetry.actualGenKwh !== null && (
                <div className="grid grid-cols-3 gap-2.5 pt-1 border-t border-slate-200/80 dark:border-slate-700/80">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Actual Inverter ({inverterTelemetry.plant?.todayDateKey})
                    </span>
                    <span className="text-lg font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
                      {inverterTelemetry.actualGenKwh} kWh
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Live AC Output
                    </span>
                    <span className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {inverterTelemetry.displayLiveKw} kW
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                      Actual vs Potential PR
                    </span>
                    <span className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {inverterTelemetry.performanceRatioPct ?? performanceRatio}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Key Metrics 4-Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                {inverterTelemetry?.isConnected ? 'Weather Potential' : "Today's Generation"}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {dailyGenKwh}
                </span>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">kWh</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Specific Yield
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {inverterTelemetry?.isConnected && inverterTelemetry.actualGenKwh !== null
                    ? Number((inverterTelemetry.actualGenKwh / Math.max(0.1, capacityKwp)).toFixed(2))
                    : specificYield}
                </span>
                <span className="text-xs font-semibold text-slate-500">kWh/kWp</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                Performance Ratio
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {inverterTelemetry?.isConnected && inverterTelemetry.performanceRatioPct !== null
                    ? inverterTelemetry.performanceRatioPct
                    : performanceRatio}%
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 block">
                {inverterTelemetry?.isConnected ? 'Live Inverter AC' : 'Peak AC Power'}
              </span>
              <div className="mt-1 flex items-baseline gap-1">
                <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {inverterTelemetry?.isConnected ? inverterTelemetry.displayLiveKw : peakOutputKw}
                </span>
                <span className="text-xs font-semibold text-slate-500">kW</span>
              </div>
            </div>
          </div>

          {/* Synced Recent Daily Generation History Bar Chart (when inverter logs exist) */}
          {inverterTelemetry && inverterTelemetry.dailyLogs.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                <span>Synced Daily Inverter Generation (Recent Days)</span>
                <span className="text-[11px] font-mono font-normal text-slate-500">
                  {inverterTelemetry.cumulativeLoggedDays} days · {inverterTelemetry.cumulativeLoggedGenKwh} kWh logged
                </span>
              </div>
              <div className="h-44 w-full rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-2 border border-slate-100 dark:border-slate-800">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={[...inverterTelemetry.dailyLogs].slice(0, 14).reverse()}
                    margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" opacity={0.15} />
                    <XAxis
                      dataKey="dateKey"
                      tickFormatter={(v: string) => v.slice(5)}
                      tick={{ fontSize: 10, fill: '#64748B' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const row = payload[0].payload;
                          return (
                            <div className="p-2 bg-slate-900 text-white rounded-lg text-xs shadow-lg space-y-0.5 font-mono">
                              <p className="font-sans font-bold">{row.dateKey}</p>
                              <p className="text-amber-400">Actual: {row.generationKwh} kWh</p>
                              {row.performanceRatioPct !== undefined && (
                                <p className="text-emerald-400">PR: {row.performanceRatioPct}%</p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Bar dataKey="generationKwh" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Interactive Capacity Slider for the Installed Plant */}
          <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-amber-500" />
                <span>Installed Plant Capacity</span>
              </span>
              <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md">
                {capacityKwp.toFixed(1)} kWp
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="25"
              step="0.5"
              value={capacityKwp}
              onChange={(e) => setCapacityKwp(parseFloat(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer h-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>1 kWp (Small Rooftop)</span>
              <span>10 kWp (Commercial Villa)</span>
              <span>25 kWp (Mini-Plant)</span>
            </div>
          </div>

          {/* Hourly Generation Curve Chart */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>Today's Hourly Generation Profile (kW AC)</span>
              <span className="text-[11px] font-normal text-slate-400">Peak at 12:00 PM</span>
            </div>
            <div className="h-56 w-full rounded-2xl bg-slate-50 dark:bg-slate-800/40 p-2 border border-slate-100 dark:border-slate-800">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gainSolarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" opacity={0.15} />
                  <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} tickLine={false} axisLine={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="p-2 bg-slate-900 text-white rounded-lg text-xs shadow-lg space-y-1">
                            <p className="font-bold">{payload[0].payload.time}</p>
                            <p className="text-amber-400 font-mono">{payload[0].value} kW output</p>
                            <p className="text-slate-400 text-[10px]">{payload[0].payload.irradiance} W/m² irradiance</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="generationKw"
                    stroke="#F59E0B"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#gainSolarGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Plant Efficiency & Loss Breakdown */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
              Installed System Efficiency Factors
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Cell Temp Derating</span>
                  <span className="text-[11px] text-slate-400">{cellTemp.toFixed(1)}°C cell temperature</span>
                </div>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  -{tempDeratingLossPct.toFixed(1)}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Optimal Tilt Bonus</span>
                  <span className="text-[11px] text-slate-400">Optimal angle alignment</span>
                </div>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  +{tiltGainPct}%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Inverter Efficiency</span>
                  <span className="text-[11px] text-slate-400">Pure sine wave MPPT conversion</span>
                </div>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  97.2%
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">Solar Irradiance (GHI)</span>
                  <span className="text-[11px] text-slate-400">Peak sunlight today</span>
                </div>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                  {weather.globalHorizontalIrradianceWpm2 || 910} W/m²
                </span>
              </div>
            </div>
          </div>

          {/* Long-Term Potential Forecast Table */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70">
            <span className="text-xs font-bold text-slate-900 dark:text-white block mb-2.5">
              Cumulative Clean Energy Gain Forecast
            </span>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium">30-Day Monthly</span>
                <p className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {monthlyKwh.toLocaleString()} <span className="text-xs font-normal">kWh</span>
                </p>
                <span className="text-[10px] text-emerald-600 font-medium">
                  {currencySymbol}{Math.round(monthlyKwh * electricityRate).toLocaleString()} value
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium">Annual Year 1</span>
                <p className="text-base font-bold font-mono text-slate-900 dark:text-white mt-0.5">
                  {annualKwh.toLocaleString()} <span className="text-xs font-normal">kWh</span>
                </p>
                <span className="text-[10px] text-emerald-600 font-medium">
                  {currencySymbol}{Math.round(annualKwh * electricityRate).toLocaleString()} value
                </span>
              </div>

              <div>
                <span className="text-[10px] text-slate-400 uppercase font-medium">25-Year Life</span>
                <p className="text-base font-bold font-mono text-amber-600 dark:text-amber-400 mt-0.5">
                  {twentyFiveYearMwh} <span className="text-xs font-normal">MWh</span>
                </p>
                <span className="text-[10px] text-slate-400 font-medium">Zero emissions</span>
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
