import React, { useState } from 'react';
import {
  Zap,
  Sun,
  BatteryCharging,
  DollarSign,
  ArrowRight,
  TrendingUp,
  Sliders,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { ScreenId, WeatherCondition, CurrencyCode } from '../types/solar';
import { CURRENCY_SYMBOLS } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface PowerGenerationCalcScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  currency?: CurrencyCode;
  hideTopBar?: boolean;
}

export const PowerGenerationCalcScreen: React.FC<PowerGenerationCalcScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  currency = 'INR',
  hideTopBar = false,
}) => {
  const sym = CURRENCY_SYMBOLS[currency] || '₹';

  // Calculator state
  const [capacityKw, setCapacityKw] = useState(5.0); // kW
  const [peakSunHours, setPeakSunHours] = useState(weather.peakSunHoursEstimated || 5.2);
  const [performanceRatio, setPerformanceRatio] = useState(0.78); // 78%
  const [monthlyConsumptionKwh, setMonthlyConsumptionKwh] = useState(500); // kWh
  const [tariffPerKwh, setTariffPerKwh] = useState(8.5); // per unit
  const [feedInTariffPerKwh, setFeedInTariffPerKwh] = useState(3.5); // per unit exported

  // Output calculations
  const dailyGenKwh = capacityKw * peakSunHours * performanceRatio;
  const monthlyGenKwh = Math.round(dailyGenKwh * 30);
  const annualGenKwh = Math.round(dailyGenKwh * 365);

  // Self-consumption vs export allocation (typically 65% self-consumed if load allows)
  const selfConsumedKwh = Math.min(monthlyGenKwh, monthlyConsumptionKwh);
  const exportedKwh = Math.max(0, monthlyGenKwh - monthlyConsumptionKwh);
  const gridImportKwh = Math.max(0, monthlyConsumptionKwh - monthlyGenKwh);

  // Financial return
  const directSavings = selfConsumedKwh * tariffPerKwh;
  const exportRevenue = exportedKwh * feedInTariffPerKwh;
  const totalMonthlySavings = Math.round(directSavings + exportRevenue);
  const totalAnnualSavings = Math.round(totalMonthlySavings * 12);

  // Independence score
  const solarCoveragePercent = Math.min(
    Math.round((monthlyGenKwh / Math.max(monthlyConsumptionKwh, 1)) * 100),
    100
  );

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!hideTopBar && (
        <MaterialTopBar
          title="Power Generation Calculator"
          subtitle="Daily Energy Output, Grid Deficit & Export Value"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
        />
      )}

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* 1. Generation Hero Card */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-600 to-sky-700 rounded-[28px] p-5 text-white shadow-md">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 fill-current" />
              <span>Estimated Power Generation</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-black/20 text-emerald-100 text-[10px] font-extrabold">
              {capacityKw} kW System
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <h2 className="text-4xl font-black tracking-tight">{monthlyGenKwh.toLocaleString()}</h2>
            <span className="text-lg font-bold text-emerald-100">kWh / Month</span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-white/20 text-xs">
            <div>
              <span className="text-[10px] text-emerald-100">Daily Generation</span>
              <p className="font-extrabold text-white text-base">{dailyGenKwh.toFixed(1)} kWh/day</p>
            </div>
            <div>
              <span className="text-[10px] text-emerald-100">Annual Energy Output</span>
              <p className="font-extrabold text-white text-base">{annualGenKwh.toLocaleString()} kWh/yr</p>
            </div>
          </div>
        </div>

        {/* 2. Visual Energy Flow & Grid Balance Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Energy Flow & Grid Balance
            </h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600">
              {solarCoveragePercent}% Solar Powered
            </span>
          </div>

          {/* Visual Diagram */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-amber-50 dark:bg-slate-800 rounded-2xl p-3 border border-amber-100 dark:border-slate-700">
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Self-Consumed</span>
              <p className="font-mono font-black text-lg text-amber-600 mt-0.5">{selfConsumedKwh} kWh</p>
              <p className="text-[10px] text-slate-400">Avoided utility cost</p>
            </div>

            <div className="bg-sky-50 dark:bg-slate-800 rounded-2xl p-3 border border-sky-100 dark:border-slate-700">
              <span className="text-[10px] font-bold text-sky-700 dark:text-sky-400 uppercase">Grid Export</span>
              <p className="font-mono font-black text-lg text-sky-600 mt-0.5">{exportedKwh} kWh</p>
              <p className="text-[10px] text-slate-400">Sold at feed-in rate</p>
            </div>

            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-3 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Grid Import</span>
              <p className="font-mono font-black text-lg text-slate-700 dark:text-slate-300 mt-0.5">{gridImportKwh} kWh</p>
              <p className="text-[10px] text-slate-400">Night/peak balance</p>
            </div>
          </div>

          {/* Monthly Savings Result */}
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl p-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Combined Monthly Value
              </p>
              <p className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                {sym}{totalMonthlySavings.toLocaleString()}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-emerald-800/80 dark:text-emerald-400 font-semibold">
                Annual Benefit
              </p>
              <p className="text-sm font-extrabold text-emerald-900 dark:text-emerald-200">
                {sym}{totalAnnualSavings.toLocaleString()} / yr
              </p>
            </div>
          </div>
        </div>

        {/* 3. Interactive Sizing Parameters Sliders */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Sliders className="w-4 h-4 text-sky-600" />
            <span>Customize System Setup</span>
          </h3>

          {/* System Capacity Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">System Capacity:</span>
              <span className="font-mono font-bold text-sky-600 dark:text-sky-400">{capacityKw.toFixed(1)} kW</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="25.0"
              step="0.5"
              value={capacityKw}
              onChange={(e) => setCapacityKw(parseFloat(e.target.value))}
              className="w-full accent-sky-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Peak Sun Hours Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Peak Sun Hours:</span>
              <span className="font-mono font-bold text-amber-500">{peakSunHours.toFixed(1)} hrs/day</span>
            </div>
            <input
              type="range"
              min="2.5"
              max="7.0"
              step="0.1"
              value={peakSunHours}
              onChange={(e) => setPeakSunHours(parseFloat(e.target.value))}
              className="w-full accent-amber-500 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Monthly Consumption Slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Monthly Consumption:</span>
              <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{monthlyConsumptionKwh} kWh</span>
            </div>
            <input
              type="range"
              min="100"
              max="2000"
              step="25"
              value={monthlyConsumptionKwh}
              onChange={(e) => setMonthlyConsumptionKwh(parseInt(e.target.value))}
              className="w-full accent-emerald-500 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* Tariffs input row */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Utility Cost/Unit</label>
              <div className="flex items-center gap-1 mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 text-xs">
                <span>{sym}</span>
                <input
                  type="number"
                  value={tariffPerKwh}
                  onChange={(e) => setTariffPerKwh(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-bold outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold uppercase text-slate-400">Feed-In Export/Unit</label>
              <div className="flex items-center gap-1 mt-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 text-xs">
                <span>{sym}</span>
                <input
                  type="number"
                  value={feedInTariffPerKwh}
                  onChange={(e) => setFeedInTariffPerKwh(parseFloat(e.target.value) || 0)}
                  className="w-full bg-transparent font-bold outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
