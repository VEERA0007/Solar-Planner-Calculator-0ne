import React, { useState, useEffect } from 'react';
import {
  ChevronRight,
  Settings,
  Calendar,
  Sun,
  Moon,
  History,
  Cloud,
  LogIn,
  LogOut,
} from 'lucide-react';
import {
  ScreenId,
  WeatherCondition,
  CustomerInstallationProfile,
  FinancialSavingsEstimate,
  SolarSystemRequirements,
  CurrencyCode,
  EstimatorInputs,
  UscHistoryEntry,
} from '../types/solar';
import { ResolvedInverterTelemetry } from '../types/inverter';
import { resolveHistory12MonthAverage } from '../utils/monthlyAverage';
import { useFirebaseAuth } from '../context/FirebaseContext';
import { DEFAULT_ESTIMATOR_INPUTS } from '../data/defaultData';
import { RealtimeTariffSyncResult } from '../services/tariffService';
import { useTheme } from '../context/ThemeContext';
import { SolarHeroCard } from '../components/SolarHeroCard';
import {
  SettingsModal,
  ProfileModal,
} from '../components/TopBarModals';
import { TodayEnergySummaryWidgets } from '../components/TodayEnergySummaryWidgets';

import { LiveSyncControlBar } from '../components/LiveSyncControlBar';

interface DashboardScreenProps {
  weather: WeatherCondition;
  onOpenWeatherModal: () => void;
  onNavigate: (screen: ScreenId) => void;
  customerProfile: CustomerInstallationProfile;
  applianceCount: number;
  maintenanceRecordCount: number;
  savings: FinancialSavingsEstimate;
  requirements: SolarSystemRequirements;
  currency: CurrencyCode;
  applianceDailyKwh?: number;
  electricityRate?: number;
  onDetectLocation?: () => void;
  isDetectingLocation?: boolean;
  onOpenChangeLocation?: () => void;
  onUpdateCurrency?: (c: CurrencyCode) => void;
  onUpdateProfile?: (p: CustomerInstallationProfile) => void;
  onUpdateTariff?: (tariff: number, pr: number, stateName: string) => void;
  onResetData?: () => void;
  // Live Weather & Peak Sun Sync props
  isSyncing?: boolean;
  onSyncNow?: () => void;
  isHourlySyncEnabled?: boolean;
  onToggleHourlySync?: (enabled: boolean) => void;
  lastSyncedTime?: string;
  // Historical Usage Analysis & Real-time Local Tariff props
  estimatorInputs?: EstimatorInputs;
  onUpdateInputs?: (updated: Partial<EstimatorInputs>) => void;
  liveTariff?: RealtimeTariffSyncResult | null;
  isSyncingTariff?: boolean;
  onSyncTariff?: () => void;
  // Shared Cross-Browser USC History
  uscHistory?: UscHistoryEntry[];
  onOpenUscInEstimator?: (entry: UscHistoryEntry) => void;
  onOpenUscInAudit?: (entry: UscHistoryEntry) => void;
  // Universal Solar Inverter Sync Hub props
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: (tab?: 'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs') => void;
  onQuickInverterSync?: () => void;
  isSyncingInverter?: boolean;
}

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  weather,
  onOpenWeatherModal,
  onNavigate,
  customerProfile,
  applianceCount,
  maintenanceRecordCount,
  savings,
  requirements,
  currency,
  applianceDailyKwh,
  electricityRate = 7.5,
  onDetectLocation,
  isDetectingLocation,
  onOpenChangeLocation,
  onUpdateCurrency = () => {},
  onUpdateProfile = () => {},
  onUpdateTariff,
  onResetData = () => {},
  isSyncing = false,
  onSyncNow = () => {},
  isHourlySyncEnabled = true,
  onToggleHourlySync = () => {},
  lastSyncedTime = '',
  estimatorInputs = DEFAULT_ESTIMATOR_INPUTS,
  onUpdateInputs = () => {},
  liveTariff = null,
  isSyncingTariff = false,
  onSyncTariff,
  uscHistory = [],
  onOpenUscInEstimator,
  onOpenUscInAudit,
  inverterTelemetry,
  onOpenInverterHub,
  onQuickInverterSync,
  isSyncingInverter = false,
}) => {
  const { isDark, toggleTheme } = useTheme();
  const { user: firebaseUser, isSigningIn, signInWithGoogle, signOutUser } = useFirebaseAuth();

  // Live ticking date and time with seconds (Updated every 1000ms)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [is24Hour, setIs24Hour] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDate(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format date and time with seconds
  const formattedDate = currentDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  const formattedTimeWithSeconds = currentDate.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: !is24Hour,
  });

  // Top action modals
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Format city display & address subtitle matching the reference screenshot
  const cityName = weather.city.split(',')[0].trim() || 'Shaikpet';
  const locationSubtitle =
    customerProfile.address ||
    (weather.city.includes('Hyderabad') || weather.city.includes('Shaikpet')
      ? 'CC7Q+J9J, Gouri Shankar Nagar Colony, Banjara Hills, Hyd...'
      : `${weather.latitude.toFixed(3)}°N, ${weather.longitude.toFixed(3)}°E · ${weather.city}`);

  return (
    <div className="flex-1 flex flex-col transition-colors bg-[#F2F5F9] dark:bg-slate-950">
      <div className="px-4 py-4 space-y-4 pb-8 max-w-2xl mx-auto w-full">
        {/* 1. TOP HEADER: Location on Left, Settings & Profile on Right (AD removed per request) */}
        <div className="flex items-center justify-between gap-2 pt-1">
        {/* Left: Location Pin + City Name + Subtitle (Clickable to change location) */}
        <button
          onClick={onOpenChangeLocation || onOpenWeatherModal}
          className="flex items-center gap-2 text-left group min-w-0 flex-1 cursor-pointer transition"
          title="Click to Change Location or Drop Pin on Map"
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
            <p className="text-[11px] text-slate-400 dark:text-slate-400 truncate max-w-[210px] sm:max-w-[270px] leading-tight font-normal">
              {locationSubtitle}
            </p>
          </div>
        </button>

        {/* Right: Day/Dark Mode, Settings & User Profile with 3 Stars */}
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
            onClick={() => setIsSettingsModalOpen(true)}
            className="w-10 h-10 rounded-full bg-[#EBF2FE] dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 flex items-center justify-center text-[#1E3A8A] dark:text-sky-300 shadow-xs border border-[#D0E2FF] dark:border-slate-700 transition cursor-pointer group"
            title="Settings & Tariffs"
          >
            <Settings className="w-5 h-5 text-[#1E3A8A] dark:text-sky-300 group-hover:rotate-45 transition duration-300" />
          </button>

          {/* Button 2: User Profile Avatar with 3 Stars */}
          <button
            onClick={() => setIsProfileModalOpen(true)}
            className="w-10 h-10 rounded-full bg-[#EBF2FE] dark:bg-slate-800 hover:bg-sky-100 dark:hover:bg-slate-700 flex items-center justify-center text-[#1E3A8A] dark:text-sky-300 shadow-xs border border-[#D0E2FF] dark:border-slate-700 transition cursor-pointer group relative"
            title="Customer Installation Profile"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-[#1E3A8A] dark:text-sky-300 fill-current"
            >
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
            {/* 3 Blue Sparkle Stars around profile icon */}
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

      {/* 2. REAL-TIME LIVE CLOCK: Date and Time with Seconds Display */}
      <div className="w-full bg-white dark:bg-slate-900 rounded-2xl p-2.5 px-3.5 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold min-w-0">
          <Calendar className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
          <span className="truncate">{formattedDate}</span>
        </div>

        <button
          onClick={() => setIs24Hour(!is24Hour)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-slate-800 border border-sky-200/60 dark:border-slate-700 text-sky-900 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-slate-700 transition cursor-pointer shrink-0"
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
        systemCapacityKwp={
          inverterTelemetry?.effectiveCapacityKwp ||
          requirements.recommendedCapacityKwp ||
          customerProfile.systemCapacityKwp ||
          5.0
        }
        cloudCoverPercent={weather.cloudCoverPercent || 10}
        co2AvoidedKg={
          inverterTelemetry?.isConnected
            ? inverterTelemetry.todayCo2AvoidedKg
            : (requirements.recommendedCapacityKwp || customerProfile.systemCapacityKwp || 5.0) *
              (weather.peakSunHoursEstimated || 5.2) *
              0.82
        }
        dailyGenerationKwh={
          inverterTelemetry?.isConnected
            ? inverterTelemetry.displayGenKwh
            : (requirements.recommendedCapacityKwp || customerProfile.systemCapacityKwp || 5.0) *
              (weather.peakSunHoursEstimated || 5.2)
        }
        inverterTelemetry={inverterTelemetry}
      />

      {/* 3b. TODAY'S ENERGY BALANCE WIDGET SUITE: Potential Generation vs Actual Usage */}
      <TodayEnergySummaryWidgets
        weather={weather}
        systemCapacityKwp={requirements.recommendedCapacityKwp || customerProfile.systemCapacityKwp || 5.0}
        applianceDailyKwh={applianceDailyKwh || requirements.dailyConsumptionKwh || 18.2}
        electricityRate={electricityRate}
        currency={currency}
        applianceCount={applianceCount}
        onOpenWeather={onOpenWeatherModal}
        onNavigate={onNavigate}
        inverterTelemetry={inverterTelemetry}
        onOpenInverterHub={onOpenInverterHub}
        onQuickInverterSync={onQuickInverterSync}
        isSyncingInverter={isSyncingInverter}
      />

      {/* 3c. SHARED USC HISTORY (VISIBLE ACROSS ALL BROWSERS & DEVICES) */}
      <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  Shared USC History
                </h2>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[9.5px] font-bold border border-emerald-200/70 dark:border-emerald-800 shrink-0">
                  <Cloud className="w-2.5 h-2.5" />
                  <span>{uscHistory.length} Saved</span>
                </span>
              </div>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Visible across all browsers and screens for 1-click estimates & audits
              </p>
            </div>
          </div>

          {firebaseUser ? (
            <button
              type="button"
              onClick={() => signOutUser()}
              title={`Signed in as ${firebaseUser.email || 'Google user'} — click to sign out`}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition shrink-0"
            >
              <LogOut className="w-3 h-3 text-slate-500" />
              <span className="max-w-[110px] truncate">{firebaseUser.displayName || firebaseUser.email}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              disabled={isSigningIn}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white text-[10.5px] font-bold shadow-xs cursor-pointer transition disabled:opacity-60 shrink-0"
            >
              <LogIn className="w-3 h-3" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in to Sync'}</span>
            </button>
          )}
        </div>

        {uscHistory.length === 0 ? (
          <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              No shared USC accounts yet. Fetch a USC number in the Estimator to share it across all devices.
            </p>
            <button
              type="button"
              onClick={() => onNavigate('estimator')}
              className="px-3 py-1.5 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-[#FF6F00] text-[11px] font-bold hover:bg-amber-200/70 transition cursor-pointer shrink-0 flex items-center gap-1"
            >
              <span>Fetch USC</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-0.5">
            {uscHistory.slice(0, 8).map((item) => {
              const avg12 = resolveHistory12MonthAverage(item);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 p-2.5 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                        USC #{item.uscNumber}
                      </span>
                      <span className="text-[9.5px] font-bold bg-amber-100 dark:bg-amber-950/70 text-[#FF6F00] px-1.5 py-0.5 rounded-md">
                        {item.discomShortName}
                      </span>
                      {item.isCloudSynced && (
                        <span className="text-[9px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-md">
                          Shared
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {item.consumerName ? `${item.consumerName} · ` : ''}
                      {avg12.basisCount}M Avg {avg12.avgMonthlyUnits} kWh/mo · ₹{avg12.avgMonthlyBill.toLocaleString('en-IN')}/mo
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {onOpenUscInEstimator && (
                      <button
                        type="button"
                        onClick={() => onOpenUscInEstimator(item)}
                        className="px-2.5 py-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white text-[10.5px] font-bold cursor-pointer transition"
                      >
                        Estimate
                      </button>
                    )}
                    {onOpenUscInAudit && (
                      <button
                        type="button"
                        onClick={() => onOpenUscInAudit(item)}
                        className="px-2 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[10.5px] font-bold cursor-pointer transition"
                      >
                        Audit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODALS */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        currency={currency}
        onUpdateCurrency={onUpdateCurrency}
        onUpdateTariff={onUpdateTariff}
        onResetData={onResetData}
        isSyncing={isSyncing}
        onSyncNow={onSyncNow}
        isHourlySyncEnabled={isHourlySyncEnabled}
        onToggleHourlySync={onToggleHourlySync}
        lastSyncedTime={lastSyncedTime}
      />

        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          profile={customerProfile}
          onUpdateProfile={onUpdateProfile}
        />
      </div>
    </div>
  );
};

