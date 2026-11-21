import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Settings,
  Calendar,
  Sun,
  Moon,
} from 'lucide-react';
import { ScreenId, WeatherCondition, CustomerInstallationProfile } from '../types/solar';
import { useTheme } from '../context/ThemeContext';
import { SolarHeroCard } from '../components/SolarHeroCard';
import {
  SettingsModal,
  ProfileModal,
} from '../components/TopBarModals';
import { TodayEnergySummaryWidgets } from '../components/TodayEnergySummaryWidgets';
import { LiveSyncControlBar } from '../components/LiveSyncControlBar';
import { CurrencyCode } from '../types/solar';
import { ResolvedInverterTelemetry } from '../types/inverter';

interface WelcomeScreenProps {
  onStart?: () => void;
  onOpenAndroidCode?: () => void;
  onNavigate?: (screen: ScreenId) => void;
  weather?: WeatherCondition;
  customerProfile?: CustomerInstallationProfile;
  applianceDailyKwh?: number;
  electricityRate?: number;
  systemCapacityKwp?: number;
  currency?: CurrencyCode;
  applianceCount?: number;
  onOpenWeatherModal?: () => void;
  onOpenChangeLocation?: () => void;
  onUpdateProfile?: (p: CustomerInstallationProfile) => void;
  onUpdateTariff?: (tariff: number, pr: number, stateName: string) => void;
  // Live Weather & Peak Sun Sync props
  isSyncing?: boolean;
  onSyncNow?: () => void;
  isHourlySyncEnabled?: boolean;
  onToggleHourlySync?: (enabled: boolean) => void;
  lastSyncedTime?: string;
  // Universal Solar Inverter Sync Hub props
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: (tab?: 'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs') => void;
  onQuickInverterSync?: () => void;
  isSyncingInverter?: boolean;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onStart,
  onNavigate,
  weather = {
    city: 'Hyderabad, Telangana',
    latitude: 17.41,
    longitude: 78.44,
    temperatureC: 28,
    weatherDescription: 'Clear Sky',
    cloudCoverPercent: 12,
    directNormalIrradianceWpm2: 780,
    peakSunHoursEstimated: 5.4,
  } as WeatherCondition,
  customerProfile = {
    address: 'CC7Q+J9J, Gouri Shankar Nagar Colony, Banjara Hills, Hyd...',
    systemCapacityKwp: 5.0,
  } as CustomerInstallationProfile,
  applianceDailyKwh = 18.2,
  electricityRate = 7.5,
  systemCapacityKwp = 5.0,
  currency = 'INR',
  applianceCount = 8,
  onOpenWeatherModal,
  onOpenChangeLocation,
  onUpdateProfile = () => {},
  onUpdateTariff,
  isSyncing = false,
  onSyncNow = () => {},
  isHourlySyncEnabled = true,
  onToggleHourlySync = () => {},
  lastSyncedTime = '',
  inverterTelemetry,
  onOpenInverterHub,
  onQuickInverterSync,
  isSyncingInverter = false,
}) => {
  const { isDark, toggleTheme } = useTheme();

  // Live ticking clock with seconds
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [is24Hour, setIs24Hour] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = currentDate.toLocaleDateString('en-US', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  const formattedTimeWithSeconds = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24Hour,
  });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleNavigate = (target: ScreenId) => {
    if (onNavigate) {
      onNavigate(target);
    } else if (onStart) {
      onStart();
    }
  };

  const cityName = weather.city?.split(',')[0].trim() || 'Hyderabad';
  const locationSubtitle =
    customerProfile?.address ||
    (weather.city?.includes('Hyderabad')
      ? 'CC7Q+J9J, Gouri Shankar Nagar Colony, Banjara Hills, Hyd...'
      : `${weather.latitude.toFixed(3)}°N, ${weather.longitude.toFixed(3)}°E · ${weather.city}`);

  return (
    <div className="flex-1 flex flex-col transition-colors bg-[#F2F5F9] dark:bg-slate-950">
      <div className="px-4 py-4 space-y-4 pb-8 max-w-2xl mx-auto w-full">
        {/* 1. TOP HEADER: Location Pin + Action Buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
        {/* Left: Location Pin + City Name + Subtitle */}
        <button
          onClick={onOpenChangeLocation || onOpenWeatherModal}
          className="flex items-center gap-2 text-left group min-w-0 flex-1 cursor-pointer transition"
          title="Click to Change Location"
        >
          {/* Vibrant Solid Orange Map Pin Icon */}
          <div className="w-6 h-6 shrink-0 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 fill-[#FF6F00] text-[#FF6F00]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate tracking-tight">
                {cityName}
              </h2>
              <ChevronRight className="w-4 h-4 text-slate-700 dark:text-slate-300 stroke-[2.5] group-hover:translate-x-0.5 transition shrink-0" />
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 truncate max-w-[195px] sm:max-w-[250px] leading-tight font-normal">
              {locationSubtitle}
            </p>
          </div>
        </button>

        {/* Right: Day/Dark Mode, Settings & User Profile */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Day / Dark Mode Toggle Button */}
          <button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-full bg-[#EBF2FE] dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 flex items-center justify-center text-[#1E3A8A] dark:text-sky-300 shadow-xs border border-[#D0E2FF] dark:border-slate-700 transition cursor-pointer"
            title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme appearance"
          >
            {isDark ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-[#1E3A8A]" />}
          </button>

          {/* Button 1: Settings Gear */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="w-10 h-10 rounded-full bg-[#EBF2FE] dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 flex items-center justify-center text-[#1E3A8A] dark:text-sky-300 shadow-xs border border-[#D0E2FF] dark:border-slate-700 transition cursor-pointer group"
            title="Settings & Tariffs"
          >
            <Settings className="w-5 h-5 text-[#1E3A8A] dark:text-sky-300 group-hover:rotate-45 transition duration-300" />
          </button>

          {/* Button 2: User Profile Avatar with 3 Stars */}
          <button
            onClick={() => setIsProfileOpen(true)}
            className="w-10 h-10 rounded-full bg-[#EBF2FE] dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 flex items-center justify-center text-[#1E3A8A] dark:text-sky-300 shadow-xs border border-[#D0E2FF] dark:border-slate-700 transition cursor-pointer group relative"
            title="Customer Installation Profile"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-[#1E3A8A] dark:text-sky-300 fill-current"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            <span className="absolute top-1 right-1 text-[#3B82F6] text-[7px] font-black leading-none pointer-events-none">
              ★
            </span>
            <span className="absolute bottom-1.5 right-1 text-[#3B82F6] text-[6px] font-black leading-none pointer-events-none">
              ★
            </span>
            <span className="absolute bottom-1.5 left-1 text-[#3B82F6] text-[6px] font-black leading-none pointer-events-none">
              ★
            </span>
          </button>
        </div>
      </div>

      {/* 2. REAL-TIME LIVE CLOCK & METEOROLOGICAL RIBBON */}
      <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-2.5 px-3.5 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold min-w-0">
          <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{formattedDate}</span>
          <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">|</span>
          <button
            onClick={onOpenWeatherModal}
            className="hidden sm:flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-amber-500 transition cursor-pointer"
            title="Open 7-day meteorological forecast"
          >
            <Sun className="w-3.5 h-3.5 text-amber-500" />
            <span>{weather.temperatureC ?? 28}°C</span>
            <span className="text-slate-400 text-[11px]">({weather.weatherDescription ?? 'Clear'})</span>
          </button>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenWeatherModal}
            className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 text-[11px] font-bold cursor-pointer"
          >
            <Sun className="w-3 h-3 text-amber-500" />
            <span>{weather.temperatureC ?? 28}°C</span>
          </button>

          <button
            onClick={() => setIs24Hour(!is24Hour)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200/60 dark:border-slate-700 text-sky-900 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Click to toggle 12h / 24h clock format"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span className="font-mono font-bold text-xs tracking-wider">
              {formattedTimeWithSeconds}
            </span>
            <span className="text-[9px] font-semibold text-slate-400 dark:text-slate-400">
              {is24Hour ? '24H' : 'LIVE'}
            </span>
          </button>
        </div>
      </div>

      {/* 2b. LIVE ACCURACY CONTROL BAR: Sync Now & Hourly Auto-Refresh Toggle */}
      <LiveSyncControlBar
        isSyncing={isSyncing}
        onSyncNow={onSyncNow}
        isHourlySyncEnabled={isHourlySyncEnabled}
        onToggleHourlySync={onToggleHourlySync}
        lastSyncedTime={lastSyncedTime}
        inverterTelemetry={inverterTelemetry}
        onOpenInverterHub={onOpenInverterHub ? () => onOpenInverterHub() : undefined}
      />

      {/* 3. HERO SOLAR CARD: Exact Landscape Scenery, Trajectory Arc, Altitude & Sun Status */}
      <SolarHeroCard
        latitude={weather.latitude}
        longitude={weather.longitude}
        currentDate={currentDate}
        is24Hour={is24Hour}
        systemCapacityKwp={inverterTelemetry?.effectiveCapacityKwp || systemCapacityKwp}
        cloudCoverPercent={weather.cloudCoverPercent || 12}
        co2AvoidedKg={
          inverterTelemetry?.isConnected
            ? inverterTelemetry.todayCo2AvoidedKg
            : systemCapacityKwp * (weather.peakSunHoursEstimated || 5.2) * 0.82
        }
        dailyGenerationKwh={
          inverterTelemetry?.isConnected
            ? inverterTelemetry.displayGenKwh
            : systemCapacityKwp * (weather.peakSunHoursEstimated || 5.2)
        }
        inverterTelemetry={inverterTelemetry}
      />

      {/* 4. TODAY'S POTENTIAL GENERATION VS ACTUAL USAGE WIDGETS */}
      <TodayEnergySummaryWidgets
        weather={weather}
        systemCapacityKwp={systemCapacityKwp}
        applianceDailyKwh={applianceDailyKwh}
        electricityRate={electricityRate}
        currency={currency}
        applianceCount={applianceCount}
        onOpenWeather={onOpenWeatherModal}
        onNavigate={handleNavigate}
        inverterTelemetry={inverterTelemetry}
        onOpenInverterHub={onOpenInverterHub}
        onQuickInverterSync={onQuickInverterSync}
        isSyncingInverter={isSyncingInverter}
      />

      {/* Modals */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currency={currency}
        onUpdateTariff={onUpdateTariff}
        onResetData={() => {
          localStorage.clear();
          window.location.reload();
        }}
        isSyncing={isSyncing}
        onSyncNow={onSyncNow}
        isHourlySyncEnabled={isHourlySyncEnabled}
        onToggleHourlySync={onToggleHourlySync}
        lastSyncedTime={lastSyncedTime}
      />
        <ProfileModal
          isOpen={isProfileOpen}
          onClose={() => setIsProfileOpen(false)}
          profile={customerProfile}
          onUpdateProfile={onUpdateProfile}
        />
      </div>
    </div>
  );
};
