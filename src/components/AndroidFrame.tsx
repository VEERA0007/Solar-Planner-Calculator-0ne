import React, { useState, useEffect } from 'react';
import {
  Home,
  Calculator,
  Cpu,
  Sun,
  Moon,
  Wrench,
  Smartphone,
  Monitor,
  Code2,
  CloudSun,
  Battery,
  Wifi,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { useTheme } from '../context/ThemeContext';

interface AndroidFrameProps {
  currentScreen: ScreenId;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeatherModal: () => void;
  children: React.ReactNode;
}

export const AndroidFrame: React.FC<AndroidFrameProps> = ({
  currentScreen,
  onNavigate,
  weather,
  onOpenWeatherModal,
  children,
}) => {
  const [isPhoneFrame, setIsPhoneFrame] = useState(true);
  const [currentTime, setCurrentTime] = useState('09:41');
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 30000);
    return () => clearInterval(interval);
  }, []);

  // Bottom navigation tabs (locked at bottom across all views)
  const navItems = [
    { id: 'dashboard' as ScreenId, label: 'Home', icon: Home },
    { id: 'estimator' as ScreenId, label: 'Estimator', icon: Calculator },
    { id: 'appliances' as ScreenId, label: 'Appliance Analysis', icon: Cpu },
    { id: 'shadow' as ScreenId, label: 'Solar Analysis', icon: Sun },
    { id: 'maintenance' as ScreenId, label: 'Service', icon: Wrench },
  ];

  const isTabActive = (tabId: ScreenId): boolean => {
    if (tabId === 'dashboard') {
      return currentScreen === 'dashboard' || currentScreen === 'welcome';
    }
    if (tabId === 'estimator') {
      return (
        currentScreen === 'estimator' ||
        currentScreen === 'requirements' ||
        currentScreen === 'savings' ||
        currentScreen === 'existing' ||
        currentScreen === 'power_calc'
      );
    }
    if (tabId === 'appliances') {
      return currentScreen === 'appliances';
    }
    if (tabId === 'shadow') {
      return (
        currentScreen === 'shadow' ||
        currentScreen === 'sun_tracker_suite' ||
        currentScreen === 'ar_view' ||
        currentScreen === 'sun_compass' ||
        currentScreen === 'sun_timer'
      );
    }
    if (tabId === 'maintenance') {
      return (
        currentScreen === 'maintenance' ||
        currentScreen === 'solar_angles' ||
        currentScreen === 'bubble_level' ||
        currentScreen === 'solar_activity' ||
        currentScreen === 'solar_flux' ||
        currentScreen === 'kp_index'
      );
    }
    return currentScreen === tabId;
  };

  const showBottomNav = true;

  return (
    <div className="h-[100dvh] overflow-hidden bg-slate-900 text-slate-100 flex flex-col items-center justify-start p-0 sm:p-4 md:p-6 transition-all">
      {/* Top AI Studio Build Toolbar / Android Mode Controller */}
      <header className="w-full max-w-4xl flex items-center justify-between py-2 px-3 sm:px-4 text-xs text-slate-300 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/30">
            ☀️
          </div>
          <div>
            <span className="font-semibold text-white tracking-wide">
              Solar Planner & Calculator
            </span>
            <span className="hidden sm:inline text-slate-400 text-[11px] ml-2">
              Material 3 Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dark / Light Mode Toggle */}
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border transition cursor-pointer ${
              isDark
                ? 'bg-amber-950/50 border-amber-500/40 text-amber-300 hover:bg-amber-900/50'
                : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700/80'
            }`}
            title={isDark ? 'Switch to Day Mode (Light Theme)' : 'Switch to Night Mode (Dark Theme)'}
          >
            {isDark ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-sky-300" />
            )}
            <span className="text-[11px] font-medium hidden sm:inline">
              {isDark ? 'Light' : 'Dark'}
            </span>
          </button>

          {/* Weather Button */}
          <button
            onClick={onOpenWeatherModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-slate-200 transition cursor-pointer"
            title="View Live Solar Meteorological Data"
          >
            <CloudSun className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium text-[11px]">{weather.city.split(',')[0]}</span>
            <span className="text-amber-300 font-semibold text-[11px]">
              {weather.peakSunHoursEstimated}h Sun
            </span>
          </button>

          {/* Android APK, PWA & GitHub Build Center */}
          <button
            onClick={() => onNavigate('android_code')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition cursor-pointer ${
              currentScreen === 'android_code'
                ? 'bg-emerald-500 text-slate-950 shadow-md'
                : 'bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-700/60 text-emerald-300'
            }`}
            title="Install Android App (PWA), Download GitHub APK Workflow, or Export Native Kotlin Source"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">APK &amp; GitHub</span>
            <span className="sm:hidden">APK</span>
          </button>

          {/* Frame Toggle */}
          <div className="hidden sm:flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700">
            <button
              onClick={() => setIsPhoneFrame(true)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                isPhoneFrame
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="View in Android Phone Frame (Pixel/Galaxy)"
            >
              <Smartphone className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsPhoneFrame(false)}
              className={`p-1.5 rounded-lg transition cursor-pointer ${
                !isPhoneFrame
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="View in Responsive Expanded Mode"
            >
              <Monitor className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container - Either Phone Frame or Fluid Screen */}
      <div
        className={`w-full flex-1 min-h-0 transition-all duration-300 flex flex-col overflow-hidden ${isDark ? 'dark' : ''} ${
          isPhoneFrame
            ? 'max-w-[420px] rounded-[44px] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] border-[9px] border-slate-800/95 ring-1 ring-white/10 bg-sky-50 dark:bg-slate-950 max-h-[840px]'
            : 'max-w-4xl rounded-3xl shadow-2xl border border-slate-700/60 bg-sky-50 dark:bg-slate-950'
        }`}
      >
        {/* Android Status Bar (shown when in phone frame) */}
        {isPhoneFrame && (
          <div className="w-full bg-slate-900 text-white px-6 pt-3 pb-2 flex items-center justify-between text-xs select-none shrink-0 relative z-30 border-b border-slate-800/50">
            <span className="font-semibold tracking-tight text-[11px]">{currentTime}</span>

            {/* Front Camera Cutout */}
            <div className="absolute left-1/2 -translate-x-1/2 top-2.5 w-3.5 h-3.5 bg-black rounded-full ring-1 ring-slate-700/50 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-900"></div>
            </div>

            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-[10px] font-semibold text-emerald-400">5G</span>
              <Wifi className="w-3 h-3" />
              <div className="flex items-center gap-0.5">
                <span className="text-[9px] font-semibold">94%</span>
                <Battery className="w-3.5 h-3.5 rotate-90 text-emerald-400" />
              </div>
            </div>
          </div>
        )}

        {/* Screen Content Viewport */}
        <main className="flex-1 min-h-0 overflow-y-auto bg-[#F0F7FF] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col relative transition-colors duration-200">
          {children}
        </main>

        {/* Material 3 Locked Bottom Navigation Bar */}
        {showBottomNav && (
          <nav
            aria-label="Primary Navigation"
            className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-sky-100/80 dark:border-slate-800 px-1 py-1.5 grid grid-cols-5 items-stretch shrink-0 sticky bottom-0 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.03)] dark:shadow-none transition-colors duration-200"
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = isTabActive(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  className={`flex flex-col items-center justify-center min-h-[44px] py-1 px-0.5 min-w-0 rounded-2xl transition-all duration-200 group relative cursor-pointer ${
                    isActive
                      ? 'text-sky-700 dark:text-sky-400 font-semibold'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {/* Material 3 Active Pill Indicator */}
                  <div
                    className={`px-2.5 sm:px-3.5 py-1 rounded-full transition-all duration-200 flex items-center justify-center ${
                      isActive
                        ? 'bg-sky-100 dark:bg-sky-950/70 text-sky-800 dark:text-sky-300'
                        : 'bg-transparent text-slate-500 dark:text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-[8.5px] sm:text-[9.5px] mt-0.5 tracking-tighter leading-tight text-center whitespace-nowrap max-w-full truncate">
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Android Gesture Bar */}
        {isPhoneFrame && (
          <div className="bg-white dark:bg-slate-900 w-full py-1.5 flex justify-center items-center shrink-0 border-t border-slate-100 dark:border-slate-800/40 transition-colors">
            <div className="w-32 h-1 bg-slate-300 dark:bg-slate-700 rounded-full"></div>
          </div>
        )}
      </div>
    </div>
  );
};
