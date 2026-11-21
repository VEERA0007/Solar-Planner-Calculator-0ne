import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronUp,
  CheckCircle,
  Leaf,
  Pencil,
  FileDown,
} from 'lucide-react';
import { exportFinancialSavingsPdfReport } from '../utils/pdfReportGenerator';
import {
  EstimatorInputs,
  FinancialSavingsEstimate,
  ScreenId,
  SolarSystemRequirements,
  WeatherCondition,
} from '../types/solar';
import { CURRENCY_SYMBOLS } from '../utils/solarMath';
import {
  RoofSunHouseBannerIcon,
  SolarPanelPedestalIcon,
  EcoLeafSolarIcon,
} from '../components/EstimatorIllustrations';
import { InvestmentPaybackPeriodChart } from '../components/InvestmentPaybackPeriodChart';

interface SavingsScreenProps {
  inputs: EstimatorInputs;
  requirements: SolarSystemRequirements;
  savings: FinancialSavingsEstimate;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  onOpenRoiDashboard?: () => void;
}

export const SavingsScreen: React.FC<SavingsScreenProps> = ({
  inputs,
  requirements,
  savings,
  onNavigate,
  weather,
  onOpenRoiDashboard,
}) => {
  const [savingsFrequency, setSavingsFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [installationCostInput, setInstallationCostInput] = useState<string>(
    savings.grossInstallationCost ? savings.grossInstallationCost.toString() : '250000'
  );
  const [isPaybackCalculated, setIsPaybackCalculated] = useState(true);

  const sym = CURRENCY_SYMBOLS[inputs.currency] || '₹';

  // Computed consumption & savings values across Monthly / Yearly selection
  const monthlyUnits = inputs.monthlyUnits || 600;
  const yearlyUnits = monthlyUnits * 12;
  const displayedUnits = savingsFrequency === 'yearly' ? yearlyUnits : monthlyUnits;
  const monthlySavings = savings.monthlySavings || Math.round(monthlyUnits * inputs.tariffPerKwh);
  const annualSavings = savings.annualSavings || monthlySavings * 12;

  const handleExportSavingsPdf = () => {
    exportFinancialSavingsPdfReport({
      locationName: weather.city || inputs.locationName || 'Site Location',
      latitude: weather.latitude,
      longitude: weather.longitude,
      currency: inputs.currency,
      monthlyUnitsKwh: monthlyUnits,
      tariffPerKwh: inputs.tariffPerKwh || 7.5,
      installationCost: parseFloat(installationCostInput) || savings.grossInstallationCost || 250000,
      monthlySavings,
      annualSavings,
      requirements,
      savings,
    });
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F4F7FC] dark:bg-slate-950 pb-10 transition-colors">
      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Top Bar with House & Sun Illustration */}
        <div className="flex items-center justify-between py-1 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => onNavigate('dashboard')}
              className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer shrink-0"
              title="Back to Dashboard"
            >
              <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
            </button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Estimation
              </h1>
              <p className="text-[11px] text-slate-400 font-medium truncate">
                Here's your solar saving Overview
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportSavingsPdf}
              className="px-3 py-1.5 rounded-full bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-500 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="Download Financial Return PDF Report"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>PDF</span>
            </button>
            <div className="shrink-0 -my-2 hidden xs:block">
              <RoofSunHouseBannerIcon className="w-20 h-14" />
            </div>
          </div>
        </div>

        {/* Card 1: Your Solar Estimation */}
        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <CheckCircle className="w-4 h-4 text-amber-500 fill-amber-500/20" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Your Solar Estimation
              </h2>
              <p className="text-[11px] text-slate-400">
                Based on your inputs, here's your potential
              </p>
            </div>
          </div>

          {/* Consumption unit banner with 3D solar panel */}
          <div className="bg-[#F8FAFC] dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {savingsFrequency === 'yearly'
                  ? 'Total Consumption Unit / Year'
                  : 'Total Consumption Unit / Month'}
              </p>
              <div className="text-2xl font-black text-[#16A34A] mt-0.5 tabular-nums">
                {displayedUnits.toLocaleString()}{' '}
                <span className="text-sm font-bold">
                  {displayedUnits === 1 ? 'Unit' : 'Units'}
                </span>
              </div>
              <p className="text-[10.5px] font-medium text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {savingsFrequency === 'yearly'
                  ? `${monthlyUnits.toLocaleString()} Units/mo × 12 months`
                  : `${yearlyUnits.toLocaleString()} Units/year total`}
              </p>

              {/* Monthly / Yearly Toggle Pills */}
              <div className="flex items-center gap-1 mt-3 bg-slate-200/60 dark:bg-slate-700/60 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setSavingsFrequency('monthly')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    savingsFrequency === 'monthly'
                      ? 'bg-[#16A34A] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setSavingsFrequency('yearly')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    savingsFrequency === 'yearly'
                      ? 'bg-[#16A34A] text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Yearly
                </button>
              </div>
            </div>

            {/* 3D Solar Panel on Pedestal */}
            <div className="shrink-0">
              <SolarPanelPedestalIcon className="w-18 h-18" />
            </div>
          </div>

          {/* 2 Sub-Cards: Monthly Savings & Annual Savings */}
          <div className="grid grid-cols-2 gap-3">
            {/* Monthly Savings Card */}
            <div
              className={`bg-[#FFF8F0] dark:bg-amber-950/20 rounded-2xl p-3.5 border space-y-1 transition ${
                savingsFrequency === 'monthly'
                  ? 'border-[#F97316] ring-1 ring-[#F97316]/40'
                  : 'border-amber-200/60 dark:border-amber-900/40'
              }`}
            >
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Monthly Savings
              </p>
              <div className="text-xl font-extrabold text-[#F97316]">
                {sym} {monthlySavings.toLocaleString()}
              </div>
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Save more every month!</span>
                <span className="text-[#F97316] font-bold text-sm">↗</span>
              </div>
            </div>

            {/* Annual Savings Card */}
            <div
              className={`bg-[#F0FDF4] dark:bg-emerald-950/20 rounded-2xl p-3.5 border space-y-1 transition ${
                savingsFrequency === 'yearly'
                  ? 'border-[#16A34A] ring-1 ring-[#16A34A]/40'
                  : 'border-emerald-200/60 dark:border-emerald-900/40'
              }`}
            >
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Annual Savings
              </p>
              <div className="text-xl font-extrabold text-[#16A34A]">
                {sym} {annualSavings.toLocaleString()}
              </div>
              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>more savings, more freedom!</span>
                <span className="text-[#16A34A] font-bold text-sm">📈</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Clean Energy. Bigger Savings. (Leaf graphic) */}
        <div className="bg-[#F8FAFC] dark:bg-slate-900 rounded-[26px] p-4 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center shrink-0">
              <Leaf className="w-4 h-4 fill-emerald-500 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                Clean Energy. Bigger Savings.
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                You'll save money while contributing to a greener tomorrow.
              </p>
            </div>
          </div>

          <div className="shrink-0">
            <EcoLeafSolarIcon className="w-14 h-12" />
          </div>
        </div>

        {/* Card 3: Payback Period */}
        {!isPaybackCalculated ? (
          // Input State (Screenshot 4 & 5)
          <div className="bg-[#FFF7ED] dark:bg-amber-950/30 rounded-[28px] p-5 border border-amber-200 dark:border-amber-900/50 space-y-3.5">
            <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
              <span>Want to know about your Payback period?</span>
              <ChevronUp className="w-4 h-4 text-slate-700" />
            </div>

            <p className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              Add your installation cost and see how quickly you'll start saving.
            </p>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Installation Cost
              </label>
              <input
                type="number"
                value={installationCostInput}
                onChange={(e) => setInstallationCostInput(e.target.value)}
                placeholder="00"
                className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm focus:outline-none"
              />
            </div>

            <button
              onClick={() => setIsPaybackCalculated(true)}
              className="w-full py-3.5 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] text-white font-bold text-sm shadow-md transition cursor-pointer"
            >
              Calculate
            </button>
          </div>
        ) : (
          // Calculated State with Break-even & Graph (Screenshot 8)
          <div className="space-y-3">
            {/* Installation Cost Summary Banner with edit pencil */}
            <div className="bg-[#EBF3FF] dark:bg-slate-900 rounded-[22px] p-3.5 border border-sky-200/80 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Installation Cost
                </span>
                <span className="text-xs text-sky-600">🏠</span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-base font-extrabold text-[#2563EB] dark:text-sky-400">
                  {sym} {parseFloat(installationCostInput || '250000').toLocaleString()}
                </span>
                <button
                  onClick={() => setIsPaybackCalculated(false)}
                  className="w-6 h-6 rounded-full hover:bg-sky-100 flex items-center justify-center text-slate-500 hover:text-sky-600 transition cursor-pointer"
                  title="Edit Installation Cost"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Investment Payback Period Card (25-Year Recharts Model) */}
            <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Investment Payback Period
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    25-Year Break-Even & Financial Return Model
                  </p>
                </div>
                {onOpenRoiDashboard ? (
                  <button
                    type="button"
                    onClick={onOpenRoiDashboard}
                    className="text-[10.5px] font-bold text-[#FF6F00] hover:underline bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-full border border-amber-200/70 dark:border-amber-800 cursor-pointer shrink-0"
                  >
                    ROI Dashboard →
                  </button>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800">
                    ROI MODEL
                  </span>
                )}
              </div>

              {/* Interactive Recharts Break-Even Curve Chart */}
              <InvestmentPaybackPeriodChart
                installationCost={parseFloat(installationCostInput) || savings.netInstallationCost || 250000}
                annualSavings={annualSavings}
                currency={inputs.currency}
                requirements={requirements}
                savings={savings}
                subsidyAmount={savings.governmentSubsidy || 0}
              />
            </div>

            {/* Full-Width Export PDF Financial Report CTA */}
            <button
              type="button"
              onClick={handleExportSavingsPdf}
              className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition cursor-pointer flex items-center justify-center gap-2"
            >
              <FileDown className="w-4 h-4" />
              <span>Download Financial Return PDF Report</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
