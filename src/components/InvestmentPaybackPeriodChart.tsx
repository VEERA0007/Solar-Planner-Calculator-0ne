import React, { useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import {
  TrendingUp,
  Clock,
  Sparkles,
  Zap,
  Info,
  Calendar,
  Layers,
  Sliders,
  DollarSign,
  CheckCircle2,
  ChevronDown,
  ArrowUpRight,
} from 'lucide-react';
import { BarChart3 } from 'lucide-react';
import { CurrencyCode, FinancialSavingsEstimate, SolarSystemRequirements } from '../types/solar';
import { CURRENCY_SYMBOLS, calculate25YearSensitivityRoi } from '../utils/solarMath';

interface InvestmentPaybackPeriodChartProps {
  installationCost: number;
  annualSavings: number;
  currency?: CurrencyCode;
  requirements?: SolarSystemRequirements;
  savings?: FinancialSavingsEstimate;
  subsidyAmount?: number;
  systemCapacityKwp?: number;
  moduleStandard?: 'DCR' | 'NON_DCR';
  tariffPerKwh?: number;
  expectedTariffIncreasePct?: number;
  onExpectedTariffIncreasePctChange?: (pct: number) => void;
  maintenanceCostPct?: number;
  onMaintenanceCostPctChange?: (pct: number) => void;
  showSensitivitySliders?: boolean;
  className?: string;
}

export const InvestmentPaybackPeriodChart: React.FC<InvestmentPaybackPeriodChartProps> = ({
  installationCost,
  annualSavings,
  currency = 'INR',
  subsidyAmount = 0,
  systemCapacityKwp,
  moduleStandard,
  tariffPerKwh,
  expectedTariffIncreasePct,
  onExpectedTariffIncreasePctChange,
  maintenanceCostPct,
  onMaintenanceCostPctChange,
  showSensitivitySliders = true,
  className = '',
}) => {
  const sym = CURRENCY_SYMBOLS[currency] || '₹';

  // Interactive Scenario State
  const [chartStyle, setChartStyle] = useState<'bar' | 'cashflow'>('bar');
  const [timeHorizon, setTimeHorizon] = useState<'focus' | 10 | 25>(25);
  const [internalTariffIncreasePct, setInternalTariffIncreasePct] = useState<number>(2.5);
  const [internalMaintenanceCostPct, setInternalMaintenanceCostPct] = useState<number>(1.0);
  const [includeInverterReplacement, setIncludeInverterReplacement] = useState<boolean>(true);
  const [showScenarioControls, setShowScenarioControls] = useState<boolean>(false);

  const activeTariffIncreasePct = expectedTariffIncreasePct ?? internalTariffIncreasePct;
  const activeMaintenanceCostPct = maintenanceCostPct ?? internalMaintenanceCostPct;

  const handleTariffSliderChange = (val: number) => {
    setInternalTariffIncreasePct(val);
    onExpectedTariffIncreasePctChange?.(val);
  };

  const handleMaintenanceSliderChange = (val: number) => {
    setInternalMaintenanceCostPct(val);
    onMaintenanceCostPctChange?.(val);
  };

  // Generate 25-year financial trajectory data via shared sensitivity projection model
  const {
    netSystemCost: netCost,
    inverterAllowance,
    annualMaintenanceCost,
    chartData,
    breakEvenYear,
    breakEvenBeyondHorizon,
    breakEvenFormatted,
    lifetimeNetProfit,
    lifetimeRoiPercent,
  } = useMemo(
    () =>
      calculate25YearSensitivityRoi({
        installationCost,
        subsidyAmount,
        annualSavings,
        expectedTariffIncreasePct: activeTariffIncreasePct,
        maintenanceCostPct: activeMaintenanceCostPct,
        includeInverterReplacement,
      }),
    [
      installationCost,
      subsidyAmount,
      annualSavings,
      activeTariffIncreasePct,
      activeMaintenanceCostPct,
      includeInverterReplacement,
    ]
  );

  const effectiveFocusYears = Math.min(25, Math.max(10, Math.ceil(breakEvenYear) + 3));
  const activeMaxYear = timeHorizon === 'focus' ? effectiveFocusYears : timeHorizon;
  const breakEvenProgressPct = Math.min(100, Math.max(4, Math.round((breakEvenYear / 25) * 100)));

  // Filter for Focus / 10 vs 25 year display
  const displayData = useMemo(() => {
    return chartData.filter((d) => d.year <= activeMaxYear);
  }, [chartData, activeMaxYear]);

  const barChartData = useMemo(() => {
    return chartData.filter((d) => d.year >= 1 && d.year <= activeMaxYear);
  }, [chartData, activeMaxYear]);

  // Y-axis formatting in thousands or lakhs
  const formatYAxis = (val: number) => {
    if (val === 0) return '0';
    const absVal = Math.abs(val);
    if (currency === 'INR') {
      if (absVal >= 100000) {
        return `${val < 0 ? '-' : ''}${sym}${(absVal / 100000).toFixed(1)}L`;
      }
      return `${val < 0 ? '-' : ''}${sym}${(absVal / 1000).toFixed(0)}k`;
    }
    if (absVal >= 1000000) {
      return `${val < 0 ? '-' : ''}${sym}${(absVal / 1000000).toFixed(1)}M`;
    }
    return `${val < 0 ? '-' : ''}${sym}${(absVal / 1000).toFixed(0)}k`;
  };

  // Custom Recharts Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0].payload;
      const isProfitable = dataPoint.netCashFlow >= 0;

      return (
        <div className="bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 backdrop-blur-md text-xs space-y-1.5 min-w-[220px] select-none">
          <div className="flex items-center justify-between border-b border-slate-700/80 pb-1.5">
            <span className="font-extrabold text-amber-400">
              {dataPoint.year === 0 ? 'Initial System Installation' : `Year ${dataPoint.year} Projection`}
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              {dataPoint.panelEfficiency}% Output
            </span>
          </div>

          <div className="space-y-1 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Net Position:</span>
              <span className={`font-mono font-black text-sm ${isProfitable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isProfitable ? `+${sym}${dataPoint.netCashFlow.toLocaleString()}` : `-${sym}${Math.abs(dataPoint.netCashFlow).toLocaleString()}`}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Cumulative Savings:</span>
              <span className="font-mono font-bold text-sky-300">
                {sym}{dataPoint.cumulativeSavings.toLocaleString()}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-400">System Cost:</span>
              <span className="font-mono font-bold text-slate-200">
                {sym}{netCost.toLocaleString()}
              </span>
            </div>

            {dataPoint.year > 0 && (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Net Annual Return:</span>
                  <span className="font-mono text-emerald-300">
                    {sym}{dataPoint.annualSavings.toLocaleString()}/yr
                  </span>
                </div>
                {dataPoint.maintenanceCost > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-500">Maintenance ({activeMaintenanceCostPct.toFixed(2)}%):</span>
                    <span className="font-mono text-rose-300">
                      -{sym}{dataPoint.maintenanceCost.toLocaleString()}/yr
                    </span>
                  </div>
                )}
              </>
            )}

            <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[10px]">
              <span className="text-slate-400">Status:</span>
              <span className={`font-bold ${isProfitable ? 'text-emerald-400' : 'text-amber-400'}`}>
                {dataPoint.isCrossoverYear
                  ? '● Break-Even Year'
                  : isProfitable
                    ? '● Pure Profit Phase'
                    : '● Capital Recovery Phase'}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className={`space-y-4 select-none ${className}`}>
      {/* Optional System + Tariff Summary Strip */}
      {(systemCapacityKwp || tariffPerKwh) && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 text-[11px]">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {systemCapacityKwp ? `${systemCapacityKwp.toFixed(1)} kWp (${moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'})` : 'Solar PV System'}
          </span>
          {tariffPerKwh !== undefined && (
            <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
              Tariff {sym}{tariffPerKwh.toFixed(1)}/kWh · Escalation +{activeTariffIncreasePct.toFixed(1)}%/yr
            </span>
          )}
        </div>
      )}

      {/* Highlighted Estimated Break-Even Point Banner */}
      <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/30 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between gap-3">
        <div>
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
            Estimated Break-Even Point
          </span>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
            Time to recover net system cost ({breakEvenFormatted})
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="font-mono font-black text-2xl text-emerald-700 dark:text-emerald-400">
            {breakEvenBeyondHorizon ? '25+' : breakEvenYear}
          </span>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 ml-1">
            Years
          </span>
        </div>
      </div>

      {/* 1. TOP METRIC RIBBONS: Break-Even, Lifetime Profit, ROI */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Card 1: Break-Even Period */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800/80 rounded-2xl p-3 border border-blue-200/60 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-sky-400">
            <Clock className="w-3.5 h-3.5" />
            <span>Payback Period</span>
          </div>
          <div className="my-1">
            <span className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {breakEvenBeyondHorizon ? '25+' : breakEvenYear} <span className="text-xs font-bold text-slate-500">Yrs</span>
            </span>
            <p className="text-[10px] text-slate-400 font-medium">
              {breakEvenFormatted}
            </p>
          </div>
          <div className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>Break-Even</span>
          </div>
        </div>

        {/* Card 2: 25-Year Net Profit */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-slate-800 dark:to-slate-800/80 rounded-2xl p-3 border border-emerald-200/60 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>25-Yr Net Gain</span>
          </div>
          <div className="my-1">
            <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
              {currency === 'INR' && Math.abs(lifetimeNetProfit) >= 100000
                ? `${lifetimeNetProfit >= 0 ? '+' : '-'}${sym}${(Math.abs(lifetimeNetProfit) / 100000).toFixed(2)}L`
                : `${lifetimeNetProfit >= 0 ? '+' : '-'}${sym}${Math.round(Math.abs(lifetimeNetProfit) / 1000).toLocaleString()}k`}
            </span>
            <p className="text-[10px] text-slate-400 font-medium">
              Pure cumulative profit
            </p>
          </div>
          <div className="text-[9px] font-bold text-slate-500 dark:text-slate-400">
            After O&amp;M &amp; system cost
          </div>
        </div>

        {/* Card 3: Lifetime ROI */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-slate-800 dark:to-slate-800/80 rounded-2xl p-3 border border-amber-200/60 dark:border-slate-700 flex flex-col justify-between">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Lifetime ROI</span>
          </div>
          <div className="my-1">
            <span className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tracking-tight">
              {lifetimeRoiPercent}%
            </span>
            <p className="text-[10px] text-slate-400 font-medium">
              ~{(lifetimeRoiPercent / 25).toFixed(1)}% annual avg
            </p>
          </div>
          <div className="text-[9px] font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
            <ArrowUpRight className="w-3 h-3" />
            <span>{Math.max(0, (lifetimeNetProfit + netCost) / netCost).toFixed(1)}x Initial Capital</span>
          </div>
        </div>
      </div>

      {/* Inline Sensitivity Sliders (when enabled directly inside chart component) */}
      {showSensitivitySliders && (
        <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-[#FF6F00]" />
              <span>ROI Sensitivity Sliders</span>
            </span>
            <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
              Payback: {breakEvenBeyondHorizon ? '25+' : breakEvenYear} Yrs
            </span>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Expected Annual Tariff Increase (%)
              </span>
              <span className="font-mono font-extrabold text-sky-600 dark:text-sky-400">
                {activeTariffIncreasePct.toFixed(1)}% / yr
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="10"
              step="0.5"
              value={activeTariffIncreasePct}
              onChange={(e) => handleTariffSliderChange(parseFloat(e.target.value))}
              className="w-full accent-sky-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                System Maintenance Cost (%)
              </span>
              <span className="font-mono font-extrabold text-amber-600 dark:text-amber-400">
                {activeMaintenanceCostPct.toFixed(2)}% ({sym}{annualMaintenanceCost.toLocaleString()}/yr)
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="5"
              step="0.25"
              value={activeMaintenanceCostPct}
              onChange={(e) => handleMaintenanceSliderChange(parseFloat(e.target.value))}
              className="w-full accent-[#FF6F00] h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* 2. CHART MODE, TIMEFRAME & SCENARIO TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
        {/* Chart Style Toggle: Bar Comparison vs Net Cashflow Curve */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setChartStyle('bar')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
              chartStyle === 'bar'
                ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-3 h-3" />
            <span>Cumulative Savings vs System Cost</span>
          </button>
          <button
            type="button"
            onClick={() => setChartStyle('cashflow')}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
              chartStyle === 'cashflow'
                ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Cashflow Curve</span>
          </button>
        </div>

        {/* Horizon & Scenario Controls */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => setTimeHorizon('focus')}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                timeHorizon === 'focus'
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              {effectiveFocusYears}Y
            </button>
            <button
              type="button"
              onClick={() => setTimeHorizon(10)}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                timeHorizon === 10
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              10Y
            </button>
            <button
              type="button"
              onClick={() => setTimeHorizon(25)}
              className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition cursor-pointer ${
                timeHorizon === 25
                  ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              25Y
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowScenarioControls(!showScenarioControls)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
            <span>Inverter</span>
            <ChevronDown className={`w-3 h-3 transition transform ${showScenarioControls ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* Optional Financial Assumptions Drawer */}
      {showScenarioControls && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-2.5 text-xs animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-700 dark:text-slate-300 block">
                Year 12 Inverter Replacement Allowance
              </span>
              <span className="text-[10px] text-slate-400">
                15% of initial equipment cost ({sym}{inverterAllowance.toLocaleString()})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIncludeInverterReplacement(!includeInverterReplacement)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                includeInverterReplacement
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {includeInverterReplacement ? 'Included' : 'Excluded'}
            </button>
          </div>
        </div>
      )}

      {/* 3. RECHARTS INTERACTIVE VISUALIZATION (BAR COMPARISON OR CASHFLOW CURVE) */}
      <div className="w-full bg-slate-50 dark:bg-slate-900/60 p-3 pt-4 rounded-3xl border border-slate-200/90 dark:border-slate-800 space-y-3">
        {chartStyle === 'bar' ? (
          <>
            <div className="h-60 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barChartData}
                  margin={{ top: 14, right: 8, left: -8, bottom: 2 }}
                  barGap={2}
                  barCategoryGap={activeMaxYear >= 20 ? '18%' : '22%'}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#94a3b8"
                    opacity={0.18}
                  />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    interval={activeMaxYear >= 20 ? 3 : 0}
                  />
                  <YAxis
                    tickFormatter={formatYAxis}
                    tick={{ fill: '#94a3b8', fontSize: 9.5, fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    width={48}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                    content={<CustomTooltip />}
                  />
                  {netCost > 0 && (
                    <ReferenceLine
                      y={netCost}
                      stroke="#ef4444"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: 'System Cost Target',
                        position: 'insideTopRight',
                        fill: '#ef4444',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    />
                  )}
                  <Bar
                    dataKey="initialInvestment"
                    name="System Cost"
                    fill="#94a3b8"
                    opacity={0.6}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={activeMaxYear >= 20 ? 10 : 14}
                  />
                  <Bar
                    dataKey="cumulativeSavings"
                    name="Cumulative Savings"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={activeMaxYear >= 20 ? 12 : 18}
                  >
                    {barChartData.map((entry) => (
                      <Cell
                        key={`roi-bar-${entry.year}`}
                        fill={entry.isBreakEvenReached ? '#10B981' : '#FF6F00'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-400/75 inline-block" />
                System Cost
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#FF6F00] inline-block" />
                Cumulative Savings (Recovering)
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                Cumulative Savings (Profit)
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="h-60 sm:h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={displayData}
                  margin={{ top: 15, right: 12, left: 0, bottom: 5 }}
                >
                  <defs>
                    <linearGradient id="profitAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                      <stop offset="85%" stopColor="#10b981" stopOpacity="0.05" />
                      <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                    </linearGradient>

                    <linearGradient id="recoveryAreaGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.05" />
                    </linearGradient>

                    <linearGradient id="savingsAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#94a3b8"
                    opacity={0.15}
                  />

                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={{ stroke: '#94a3b8', strokeWidth: 1, opacity: 0.3 }}
                    tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                    tickFormatter={(val) => (val === 0 ? 'Install' : `Yr ${val}`)}
                    interval={activeMaxYear >= 20 ? 4 : 1}
                  />

                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 600 }}
                    tickFormatter={formatYAxis}
                    width={48}
                  />

                  <Tooltip content={<CustomTooltip />} />

                  <ReferenceLine
                    y={0}
                    stroke="#64748b"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    label={{
                      value: `Break-Even (${sym}0)`,
                      position: 'insideBottomRight',
                      fill: '#64748b',
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  />

                  {breakEvenYear <= activeMaxYear && (
                    <ReferenceLine
                      x={breakEvenYear}
                      stroke="#2563eb"
                      strokeWidth={2}
                      strokeDasharray="3 3"
                      label={{
                        value: `Break-Even: ${breakEvenYear} Yrs`,
                        position: 'top',
                        fill: '#2563eb',
                        fontSize: 10,
                        fontWeight: 800,
                      }}
                    />
                  )}

                  {breakEvenYear <= activeMaxYear && (
                    <ReferenceDot
                      x={breakEvenYear}
                      y={0}
                      r={5}
                      fill="#2563eb"
                      stroke="#ffffff"
                      strokeWidth={2}
                    />
                  )}

                  <Line
                    type="monotone"
                    dataKey="cumulativeSavings"
                    name="Cumulative Energy Savings"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    strokeDasharray="3 2"
                    dot={false}
                    activeDot={{ r: 4, fill: '#38bdf8' }}
                  />

                  <Area
                    type="monotone"
                    dataKey="profitArea"
                    name="Net Profit"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#profitAreaGrad)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#10b981', stroke: '#ffffff', strokeWidth: 2 }}
                  />

                  <Area
                    type="monotone"
                    dataKey="recoveryArea"
                    name="Capital Recovery"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    fill="url(#recoveryAreaGrad)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
                <span>Recovery Phase</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                <span>Net Profit Phase</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-0.5 bg-sky-400 border-t border-dashed border-sky-400"></span>
                <span>Cumulative Energy Savings</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 ring-2 ring-blue-300"></span>
                <span>Break-Even ({breakEvenYear} Yrs)</span>
              </div>
            </div>
          </>
        )}

        {/* 25-Year Payback Horizon Progress Summary Bar */}
        <div className="space-y-1 pt-2 border-t border-slate-200/60 dark:border-slate-800">
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span>Yr 0 (Install)</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-bold">
              Break-even at {breakEvenYear} yrs
            </span>
            <span>Yr 25</span>
          </div>
          <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#FF6F00] to-emerald-500 transition-all duration-300"
              style={{ width: `${breakEvenProgressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
