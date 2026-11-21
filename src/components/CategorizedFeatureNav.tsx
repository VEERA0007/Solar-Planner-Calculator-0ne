import React from 'react';
import { ChevronRight } from 'lucide-react';
import { ScreenId } from '../types/solar';
import { ApplianceAnalysisIcon } from './SolarFeatureIcons';

interface CategorizedFeatureNavProps {
  onNavigate: (screen: ScreenId) => void;
  className?: string;
}

export const CategorizedFeatureNav: React.FC<CategorizedFeatureNavProps> = ({
  onNavigate,
  className = '',
}) => {
  return (
    <section className={`space-y-3 ${className}`}>
      <div className="flex items-baseline justify-between border-b border-slate-100 dark:border-slate-800 pb-1.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
            Household Load & Consumption
          </h2>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Audit appliances & sync consumption · Use bottom bar for Estimator, Solar Analysis & Service
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onNavigate('appliances')}
        className="w-full bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-2xs hover:border-slate-400 dark:hover:border-slate-600 flex items-center justify-between gap-3.5 text-left group transition cursor-pointer"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="shrink-0">
            <ApplianceAnalysisIcon className="w-11 h-11 transition transform duration-200 group-hover:scale-105" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-medium text-slate-400 dark:text-slate-500">
              <span>Household Consumption</span>
              <span aria-hidden="true">·</span>
              <span>DCR / System Sizing</span>
            </div>
            <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base tracking-tight leading-snug group-hover:text-amber-600 dark:group-hover:text-amber-400 transition mt-0.5">
              Appliance Analysis
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed line-clamp-2">
              Audit household appliances, power ratings & daily runtime to plan electricity usage.
            </p>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition">
          <span className="hidden sm:inline">Open</span>
          <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
        </div>
      </button>
    </section>
  );
};
