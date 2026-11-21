import React from 'react';
import { ArrowLeft, CloudSun, Moon, Sun } from 'lucide-react';
import { WeatherCondition } from '../types/solar';
import { useTheme } from '../context/ThemeContext';

interface MaterialTopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  weather?: WeatherCondition;
  onOpenWeather?: () => void;
  actionButton?: React.ReactNode;
}

export const MaterialTopBar: React.FC<MaterialTopBarProps> = ({
  title,
  subtitle,
  showBack = false,
  onBack,
  weather,
  onOpenWeather,
  actionButton,
}) => {
  const { isDark, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-sky-100/80 dark:border-slate-800 px-4 py-3 shrink-0 shadow-xs dark:shadow-none transition-colors duration-200">
      <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          {showBack && onBack && (
            <button
              onClick={onBack}
              className="w-8 h-8 rounded-full hover:bg-sky-50 dark:hover:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300 hover:text-sky-700 dark:hover:text-sky-400 transition cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate tracking-tight">
              {title}
            </h1>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick Theme Toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 transition cursor-pointer"
            title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          >
            {isDark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-500" />}
          </button>

          {weather && onOpenWeather && (
            <button
              onClick={onOpenWeather}
              className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-sky-50 dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 border border-sky-200/70 dark:border-slate-700 text-sky-800 dark:text-sky-300 text-xs transition cursor-pointer"
              title="View Weather & Solar Conditions"
            >
              <CloudSun className="w-3.5 h-3.5 text-amber-500" />
              <span className="font-semibold text-[11px]">{weather.peakSunHoursEstimated}h</span>
            </button>
          )}
          {actionButton}
        </div>
      </div>
    </header>
  );
};
