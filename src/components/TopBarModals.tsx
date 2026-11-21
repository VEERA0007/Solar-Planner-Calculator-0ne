import React, { useState, useEffect } from 'react';
import {
  X,
  Sun,
  Moon,
  Sparkles,
  Zap,
  TrendingUp,
  Award,
  ShieldCheck,
  Building,
  User,
  Settings,
  HelpCircle,
  ExternalLink,
  Check,
  Phone,
  Mail,
  MapPin,
  Clock,
  Bell,
  Sliders,
  DollarSign,
  Layers,
  Battery,
  RotateCcw,
  Save,
  CheckCircle2,
  FileText,
  Percent,
  Globe,
  Activity,
  CheckCircle,
  ChevronDown,
  RefreshCw,
  Radio,
} from 'lucide-react';
import { CurrencyCode, CustomerInstallationProfile } from '../types/solar';
import { CURRENCIES, DISCOM_PRESETS } from '../data/defaultData';
import { STATE_GRID_DATABASE, SUPPORTED_LANGUAGES, GridCategory } from '../data/gridTariffs';
import { useTheme } from '../context/ThemeContext';
import { useLanguage, LanguageCode } from '../context/LanguageContext';

// 1. AD / Subsidy Modal (retained for backward compatibility or direct access)
interface SubsidyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubsidyModal: React.FC<SubsidyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-sky-100 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold text-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                PM Surya Ghar Scheme
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                National Rooftop Solar Subsidy (DBT)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs">
          <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 rounded-2xl border border-amber-200 dark:border-amber-900/50">
            <div className="font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Direct Benefit Transfer (DBT)</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300 text-[11px] mt-1 leading-relaxed">
              Get up to <strong>₹78,000</strong> direct subsidy deposited into your bank account for rooftop solar systems of 3kWp and above.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] text-slate-400">1 kWp System</div>
              <div className="font-extrabold text-amber-600 dark:text-amber-400 text-xs mt-0.5">₹30,000</div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] text-slate-400">2 kWp System</div>
              <div className="font-extrabold text-amber-600 dark:text-amber-400 text-xs mt-0.5">₹60,000</div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="text-[10px] text-slate-400">3+ kWp System</div>
              <div className="font-extrabold text-emerald-600 dark:text-emerald-400 text-xs mt-0.5">₹78,000</div>
            </div>
          </div>

          <div className="space-y-1.5 text-[11px] text-slate-600 dark:text-slate-300">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-sky-500 shrink-0" />
              <span>Free power generation: up to 300 units/month</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>Net Metering with Grid Export credits</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition cursor-pointer"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

// 2. Comprehensive Settings Modal
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currency?: CurrencyCode;
  onUpdateCurrency?: (c: CurrencyCode) => void;
  onResetData: () => void;
  onUpdateTariff?: (tariff: number, pr: number, stateName: string) => void;
  isSyncing?: boolean;
  onSyncNow?: () => void;
  isHourlySyncEnabled?: boolean;
  onToggleHourlySync?: (enabled: boolean) => void;
  lastSyncedTime?: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onResetData,
  onUpdateTariff,
  isSyncing = false,
  onSyncNow = () => {},
  isHourlySyncEnabled = true,
  onToggleHourlySync = () => {},
  lastSyncedTime = '',
}) => {
  const { language, setLanguage, t } = useLanguage();

  // Active settings tab (Display, Tariffs, Alerts)
  const [activeTab, setActiveTab] = useState<'display' | 'tariffs' | 'alerts'>('display');

  // Language state (persisted)
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    return language || localStorage.getItem('solar_setting_language') || 'en';
  });

  useEffect(() => {
    if (language) {
      setSelectedLanguage(language);
    }
  }, [language]);

  // Battery Storage Simulation
  const [batterySimulation, setBatterySimulation] = useState<boolean>(() => {
    return localStorage.getItem('solar_setting_battery_sim') === 'true';
  });

  // State & Grid Power Tariff State
  const [selectedState, setSelectedState] = useState<string>(() => {
    return localStorage.getItem('solar_setting_state') || 'telangana';
  });

  const stateData = STATE_GRID_DATABASE[selectedState] || STATE_GRID_DATABASE.telangana;

  const [selectedGrid, setSelectedGrid] = useState<string>(() => {
    return (
      localStorage.getItem('solar_setting_grid') ||
      (stateData.grids[0] ? stateData.grids[0].id : 'tgspdcl')
    );
  });

  const [selectedCategory, setSelectedCategory] = useState<GridCategory>(() => {
    return (localStorage.getItem('solar_setting_category') as GridCategory) || 'domestic';
  });

  // Real-time Tariff rate and Solar PR
  const currentCategoryData = stateData.tariffs[selectedCategory];

  const [gridTariffRate, setGridTariffRate] = useState<number>(() => {
    const val = localStorage.getItem('solar_setting_grid_tariff');
    return val ? parseFloat(val) : currentCategoryData.rate;
  });

  const [solarPrRate, setSolarPrRate] = useState<number>(() => {
    const val = localStorage.getItem('solar_setting_solar_pr');
    return val ? parseFloat(val) : currentCategoryData.pr;
  });

  const [feedInTariffRate, setFeedInTariffRate] = useState<number>(() => {
    const val = localStorage.getItem('solar_setting_feed_in_tariff');
    return val ? parseFloat(val) : currentCategoryData.feedInRate;
  });

  // When State or Category changes, automatically synchronize unit prices and state PR
  const handleStateChange = (newState: string) => {
    setSelectedState(newState);
    const newStateData = STATE_GRID_DATABASE[newState] || STATE_GRID_DATABASE.telangana;
    const firstGrid = newStateData.grids[0]?.id || '';
    setSelectedGrid(firstGrid);

    const newTariff = newStateData.tariffs[selectedCategory];
    setGridTariffRate(newTariff.rate);
    setSolarPrRate(newTariff.pr);
    setFeedInTariffRate(newTariff.feedInRate);

    if (onUpdateTariff) {
      onUpdateTariff(newTariff.rate, newTariff.pr, newStateData.stateName);
    }
  };

  const handleCategoryChange = (newCategory: GridCategory) => {
    setSelectedCategory(newCategory);
    const newTariff = stateData.tariffs[newCategory];
    setGridTariffRate(newTariff.rate);
    setSolarPrRate(newTariff.pr);
    setFeedInTariffRate(newTariff.feedInRate);

    if (onUpdateTariff) {
      onUpdateTariff(newTariff.rate, newTariff.pr, stateData.stateName);
    }
  };

  // Alerts Tab state
  const [cleaningReminderDays, setCleaningReminderDays] = useState<number>(() => {
    const val = localStorage.getItem('solar_setting_cleaning_days');
    return val ? parseInt(val) : 30;
  });
  const [cloudAlertsEnabled, setCloudAlertsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('solar_setting_cloud_alerts') !== 'false';
  });

  const [savedToast, setSavedToast] = useState(false);

  const handleSaveSettings = () => {
    setLanguage(selectedLanguage as LanguageCode);
    localStorage.setItem('solar_setting_language', selectedLanguage);
    localStorage.setItem('solar_setting_battery_sim', batterySimulation ? 'true' : 'false');
    localStorage.setItem('solar_setting_state', selectedState);
    localStorage.setItem('solar_setting_grid', selectedGrid);
    localStorage.setItem('solar_setting_category', selectedCategory);
    localStorage.setItem('solar_setting_grid_tariff', gridTariffRate.toString());
    localStorage.setItem('solar_setting_solar_pr', solarPrRate.toString());
    localStorage.setItem('solar_setting_feed_in_tariff', feedInTariffRate.toString());
    localStorage.setItem('solar_setting_cleaning_days', cleaningReminderDays.toString());
    localStorage.setItem('solar_setting_cloud_alerts', cloudAlertsEnabled ? 'true' : 'false');

    if (onUpdateTariff) {
      onUpdateTariff(gridTariffRate, solarPrRate, stateData.stateName);
    }

    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-sky-100 dark:border-slate-800 space-y-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-400 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t('application_settings', 'Application Settings')}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('settings_sub', 'Languages, Grid Tariffs & Alerts')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3 Clean Settings Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl shrink-0 text-[11px] font-semibold">
          <button
            onClick={() => setActiveTab('display')}
            className={`flex-1 py-1.5 rounded-xl transition text-center cursor-pointer ${
              activeTab === 'display'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('tab_display', 'Display')}
          </button>
          <button
            onClick={() => setActiveTab('tariffs')}
            className={`flex-1 py-1.5 rounded-xl transition text-center cursor-pointer ${
              activeTab === 'tariffs'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('tab_tariffs', 'Tariffs & Grid')}
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`flex-1 py-1.5 rounded-xl transition text-center cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            {t('tab_alerts', 'Alerts')}
          </button>
        </div>

        {/* Tab Content - Scrollable */}
        <div className="flex-1 overflow-y-auto space-y-3 text-xs pr-0.5">
          {/* TAB 1: DISPLAY & LANGUAGES */}
          {activeTab === 'display' && (
            <div className="space-y-3">
              {/* Single Scrollable Dropdown Selector for Languages */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="flex items-center justify-between">
                  <label htmlFor="settings-language-dropdown" className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <span>{t('select_language', 'Select Language')}</span>
                  </label>
                  <span className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold bg-sky-50 dark:bg-sky-950/60 px-2 py-0.5 rounded-full border border-sky-200 dark:border-sky-800">
                    Dropdown Menu
                  </span>
                </div>

                <div className="relative">
                  <select
                    id="settings-language-dropdown"
                    value={selectedLanguage}
                    onChange={(e) => {
                      const newLang = e.target.value as LanguageCode;
                      setSelectedLanguage(newLang);
                      setLanguage(newLang);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-xs shadow-xs focus:ring-2 focus:ring-sky-500 focus:outline-hidden transition cursor-pointer appearance-none pr-9"
                  >
                    <option value="en">English (English)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="or">Odissa (ଓଡ଼ିଆ)</option>
                    <option value="pa">Punjabi (ਪੰਜਾਬੀ)</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-400">
                  {t('language_dropdown_hint', 'Select your preferred regional language (English, Telugu, Hindi, Odissa, Punjabi).')}
                </p>
              </div>

              {/* Battery simulation toggle */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                    <Battery className="w-3.5 h-3.5 text-emerald-500" />
                    <span>{t('battery_sim', 'Battery Storage Simulation')}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t('battery_sim_desc', 'Calculate night battery backup in estimator')}
                  </div>
                </div>
                <button
                  onClick={() => setBatterySimulation(!batterySimulation)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    batterySimulation ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      batterySimulation ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Hourly Weather & Peak Sun Auto-Sync + Sync Now */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                      <span>{t('hourly_auto_sync', 'Hourly Auto-Sync')}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t('hourly_auto_sync_desc', 'Auto-refresh weather & peak sun data every 60 minutes')}
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isHourlySyncEnabled}
                    onClick={() => onToggleHourlySync(!isHourlySyncEnabled)}
                    className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                      isHourlySyncEnabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                        isHourlySyncEnabled ? 'left-6' : 'left-1'
                      }`}
                    />
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span>
                      {t('last_synced', 'Updated')}: <strong className="text-slate-700 dark:text-slate-300 font-semibold">{lastSyncedTime || 'Live'}</strong>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={onSyncNow}
                    disabled={isSyncing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs shadow-xs transition active:scale-95 disabled:opacity-60 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-white ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? t('syncing', 'Syncing...') : t('sync_now', 'Sync Now')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TARIFFS & REALTIME GRID SYNCHRONIZATION */}
          {activeTab === 'tariffs' && (
            <div className="space-y-3">
              {/* State Selection */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-1.5">
                <label className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                    <span>{t('select_state', 'Select Indian State')}</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    {t('auto_sync', 'Realtime Auto-Sync')}
                  </span>
                </label>
                <div className="relative">
                  <select
                    value={selectedState === 'odisha' ? 'odissa' : selectedState}
                    onChange={(e) => handleStateChange(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-xs appearance-none pr-9"
                  >
                    <option value="telangana">Telangana</option>
                    <option value="andhra_pradesh">Andhra Pradesh</option>
                    <option value="odissa">Odissa</option>
                    <option value="chandigarh">Chandigarh</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              {/* Grid / DISCOM Power Provider for Selected State */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-1.5">
                <label className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{t('available_grids', 'Available Grids in')} {stateData.stateName}</span>
                  </span>
                  <span className="text-[10px] text-slate-400">DISCOM</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedGrid}
                    onChange={(e) => setSelectedGrid(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-xs appearance-none pr-9"
                  >
                    {stateData.grids.map((grid) => (
                      <option key={grid.id} value={grid.id}>
                        {grid.shortName}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </div>
                {stateData.grids.find((g) => g.id === selectedGrid)?.coverage && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Coverage: {stateData.grids.find((g) => g.id === selectedGrid)?.coverage}
                  </p>
                )}
              </div>

              {/* Grid Power Type / Category */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-1.5">
                <label className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  {t('connection_category', 'Connection Category')}
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('domestic')}
                    className={`py-2 px-1 text-center rounded-xl font-bold text-xs transition cursor-pointer border ${
                      selectedCategory === 'domestic'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {t('domestic', 'Domestic')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('commercial')}
                    className={`py-2 px-1 text-center rounded-xl font-bold text-xs transition cursor-pointer border ${
                      selectedCategory === 'commercial'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {t('commercial', 'Commercial')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCategoryChange('industrial')}
                    className={`py-2 px-1 text-center rounded-xl font-bold text-xs transition cursor-pointer border ${
                      selectedCategory === 'industrial'
                        ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {t('industrial', 'Industrial')}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {currentCategoryData.slabLabel}
                </p>
              </div>

              {/* Synchronized Realtime Unit Price */}
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-emerald-900 dark:text-emerald-300 text-xs flex items-center gap-1.5">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>{t('unit_price', 'Realtime Unit Price (₹/kWh)')}</span>
                  </div>
                  <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100 font-bold px-2 py-0.5 rounded-full">
                    {t('auto_sync', 'Auto-Synchronized')}
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    step="0.05"
                    min="1"
                    max="50"
                    value={gridTariffRate}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setGridTariffRate(val);
                      if (onUpdateTariff) onUpdateTariff(val, solarPrRate, stateData.stateName);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-black text-sm"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-slate-400 font-semibold">
                    ₹ / Unit
                  </span>
                </div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">
                  Approved tariff for {stateData.stateName} ({selectedCategory.toUpperCase()})
                </p>
              </div>

              {/* State Solar Performance Ratio (PR) */}
              <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-900 dark:text-amber-300 text-xs flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-600" />
                    <span>{t('solar_pr', 'Solar PR (Performance Ratio)')}</span>
                  </div>
                  <div className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                    State irradiance factor for {stateData.stateName}
                  </div>
                </div>
                <span className="font-extrabold text-amber-900 dark:text-amber-200 bg-amber-200/80 dark:bg-amber-900 px-2.5 py-1 rounded-xl text-xs">
                  {solarPrRate.toFixed(1)}%
                </span>
              </div>

              {/* Feed-In Net Metering Tariff */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-sky-500" />
                    <span>{t('feed_in', 'Feed-in Export Credit')}</span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Net-metering buyback rate
                  </div>
                </div>
                <span className="font-bold text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-950 px-2.5 py-1 rounded-xl text-xs">
                  ₹{feedInTariffRate.toFixed(2)} / kWh
                </span>
              </div>
            </div>
          )}

          {/* TAB 3: ALERTS & MAINTENANCE (Untouched per requirement) */}
          {activeTab === 'alerts' && (
            <div className="space-y-3">
              {/* Cleaning reminders interval */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 space-y-2">
                <div className="font-bold text-slate-900 dark:text-slate-100 text-xs flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>{t('cleaning_reminder', 'Panel Dust Cleaning Reminder')}</span>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-center">
                  {[15, 30, 45, 60].map((days) => (
                    <button
                      key={days}
                      onClick={() => setCleaningReminderDays(days)}
                      className={`py-1.5 px-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        cleaningReminderDays === days
                          ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'
                      }`}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {/* Cloud cover weather alerts */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                    {t('cloud_alerts', 'Weather Cloud Alerts')}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Notify when radiation drops &gt;50%
                  </div>
                </div>
                <button
                  onClick={() => setCloudAlertsEnabled(!cloudAlertsEnabled)}
                  className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                    cloudAlertsEnabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-4 h-4 rounded-full bg-white transition-transform absolute top-1 ${
                      cloudAlertsEnabled ? 'left-6' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              {/* Reset All Data */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => {
                    if (window.confirm('Reset all custom settings, profile, appliances and cache to default?')) {
                      onResetData();
                      onClose();
                    }
                  }}
                  className="w-full py-2.5 rounded-2xl text-rose-600 dark:text-rose-400 text-xs font-bold hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>{t('reset_data', 'Reset All Applet Data to Defaults')}</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            {t('cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSaveSettings}
            className="flex-1 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            {savedToast ? (
              <>
                <Check className="w-4 h-4" />
                <span>{t('saved', 'Saved!')}</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>{t('save_settings', 'Save Settings')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// 3. Comprehensive Customer Profile Modal (Avatar with 3 Stars Icon)
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: CustomerInstallationProfile;
  onUpdateProfile: (p: CustomerInstallationProfile) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
}) => {
  // Navigation tabs for profile (Owner & Solar Specs only)
  const [activeSection, setActiveSection] = useState<'consumer' | 'solar'>('consumer');

  // Local draft state for editing
  const [formData, setFormData] = useState<CustomerInstallationProfile>(profile);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setFormData(profile);
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    onUpdateProfile(formData);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-sky-100 dark:border-slate-800 space-y-3.5 max-h-[92vh] flex flex-col">
        {/* Header with Avatar & 3 Stars */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                <User className="w-5 h-5" />
              </div>
              {/* 3 Blue Sparkle Stars */}
              <span className="absolute -top-0.5 -right-0.5 text-sky-400 text-[8px] font-black leading-none">
                ★
              </span>
              <span className="absolute bottom-0 -right-1 text-sky-400 text-[7px] font-black leading-none">
                ★
              </span>
              <span className="absolute bottom-0 -left-1 text-sky-400 text-[7px] font-black leading-none">
                ★
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formData.customerName || 'Consumer Profile'}
              </h3>
              <p className="text-[11px] text-amber-500 font-semibold flex items-center gap-1">
                <span>★★★</span>
                <span>Pro Solar Consumer Tier</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl shrink-0 text-[11px] font-semibold">
          <button
            type="button"
            onClick={() => setActiveSection('consumer')}
            className={`flex-1 py-1.5 rounded-xl transition text-center cursor-pointer ${
              activeSection === 'consumer'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Owner
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('solar')}
            className={`flex-1 py-1.5 rounded-xl transition text-center cursor-pointer ${
              activeSection === 'solar'
                ? 'bg-white dark:bg-slate-700 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Solar Specs
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto space-y-3 text-xs pr-0.5">
          {/* SECTION 1: CONSUMER & CONTACT */}
          {activeSection === 'consumer' && (
            <div className="space-y-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Consumer / Owner Full Name
                </label>
                <input
                  type="text"
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="e.g. Suresh Kumar"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Consumer / CA / Service Connection No.
                </label>
                <input
                  type="text"
                  value={formData.consumerNumber || ''}
                  onChange={(e) => setFormData({ ...formData, consumerNumber: e.target.value })}
                  placeholder="e.g. TG-HYD-0492810"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>Mobile No.</span>
                  </label>
                  <input
                    type="text"
                    value={formData.mobileNumber || ''}
                    onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                    placeholder="+91 98450 12345"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Postal PIN</span>
                  </label>
                  <input
                    type="text"
                    value={formData.pinCode || ''}
                    onChange={(e) => setFormData({ ...formData, pinCode: e.target.value })}
                    placeholder="500034"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Mail className="w-3 h-3 text-slate-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="suresh.kumar@solargrid.in"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Installation / House Address
                </label>
                <textarea
                  rows={2}
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Door No, Street name, Colony, Landmark..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>
            </div>
          )}

          {/* SECTION 2: SOLAR SYSTEM SPECS */}
          {activeSection === 'solar' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    System Capacity (kWp)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.5"
                    value={formData.systemCapacityKwp || 3.3}
                    onChange={(e) =>
                      setFormData({ ...formData, systemCapacityKwp: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Roof Area (sq ft)
                  </label>
                  <input
                    type="number"
                    step="10"
                    value={formData.roofAreaSqft || 700}
                    onChange={(e) =>
                      setFormData({ ...formData, roofAreaSqft: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Roof Construction Type
                </label>
                <select
                  value={formData.roofType || 'RCC Flat'}
                  onChange={(e) => setFormData({ ...formData, roofType: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold text-xs"
                >
                  <option value="RCC Flat">RCC Flat Concrete (Terrace)</option>
                  <option value="Tin / Metal Sheet">Tin / Trapezoidal Metal Sheet</option>
                  <option value="Tiled / Slanted">Mangalore / Clay Tiled Slanted</option>
                  <option value="Elevated Superstructure">Elevated Superstructure (Gazebo / Balcony)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Solar Panel Brand & Rating
                </label>
                <input
                  type="text"
                  value={formData.panelBrand || 'Waaree 550W Mono PERC Bifacial'}
                  onChange={(e) => setFormData({ ...formData, panelBrand: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Inverter Model & Specification
                </label>
                <input
                  type="text"
                  value={formData.inverterModel || 'Growatt 3.3kW On-Grid Dual MPPT'}
                  onChange={(e) => setFormData({ ...formData, inverterModel: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Commission Date
                  </label>
                  <input
                    type="date"
                    value={formData.installationDate || '2025-04-18'}
                    onChange={(e) => setFormData({ ...formData, installationDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-semibold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Warranty (Years)
                  </label>
                  <input
                    type="number"
                    value={formData.warrantyYears || 25}
                    onChange={(e) =>
                      setFormData({ ...formData, warrantyYears: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold text-xs"
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Footer Buttons */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs transition cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow-md transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            {saveSuccess ? (
              <>
                <Check className="w-4 h-4" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Profile</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
