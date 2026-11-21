import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Cpu,
  RefreshCw,
  Upload,
  Gauge,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Cloud,
  LogIn,
  Download,
  Trash2,
  Info,
} from 'lucide-react';
import {
  InverterBrandId,
  InverterDailyLog,
  InverterMeterMode,
  InverterPlantProfile,
  InverterProviderCatalogItem,
  ResolvedInverterTelemetry,
} from '../types/inverter';
import {
  fetchInverterProviders,
  formatIstTimestamp,
  getLocalDateKey,
  INVERTER_BRAND_LABELS,
  INVERTER_BRAND_SHORT,
  SYNC_SOURCE_LABELS,
  toValidInverterPlantId,
  triggerCloudInverterSync,
} from '../services/inverterSyncService';
import { parseInverterCsvText, ParsedInverterCsvResult } from '../utils/inverterCsvParser';
import { useFirebaseAuth } from '../context/FirebaseContext';

type HubTab = 'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs';

interface InverterSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: HubTab;
  plant: InverterPlantProfile | null;
  dailyLogs: InverterDailyLog[];
  telemetry: ResolvedInverterTelemetry;
  defaultCapacityKwp: number;
  defaultExportTariffInr: number;
  weatherPotentialGenKwh: number;
  onSavePlantAndLogs: (
    nextPlant: InverterPlantProfile,
    newLogs?: InverterDailyLog[]
  ) => Promise<void>;
  onDisconnectPlant?: () => Promise<void>;
}

const DEFAULT_BRAND_OPTIONS: Array<{ id: InverterBrandId; label: string; sub: string }> = [
  { id: 'solarman', label: 'Solarman', sub: 'Deye, V-Sole, KSolare, Sofar, Havells, Polycab' },
  { id: 'growatt', label: 'Growatt', sub: 'ShinePhone / ShineServer' },
  { id: 'soliscloud', label: 'SolisCloud', sub: 'Ginlong Solis Inverters' },
  { id: 'sungrow', label: 'Sungrow', sub: 'iSolarCloud' },
  { id: 'goodwe', label: 'GoodWe', sub: 'SEMS Portal' },
  { id: 'fronius', label: 'Fronius', sub: 'Solar.web' },
  { id: 'enphase', label: 'Enphase', sub: 'Enlighten IQ7/IQ8' },
  { id: 'custom_bridge', label: 'Custom Bridge', sub: 'Home Assistant / JSON URL' },
];

export const InverterSyncModal: React.FC<InverterSyncModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'cloud_api',
  plant,
  dailyLogs,
  telemetry,
  defaultCapacityKwp,
  defaultExportTariffInr,
  weatherPotentialGenKwh,
  onSavePlantAndLogs,
  onDisconnectPlant,
}) => {
  const { user: firebaseUser, isSigningIn, signInWithGoogle } = useFirebaseAuth();

  const [activeTab, setActiveTab] = useState<HubTab>(initialTab);
  const [providers, setProviders] = useState<InverterProviderCatalogItem[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);

  // Plant Hardware Config (Non-Secret Metadata Only)
  const [brand, setBrand] = useState<InverterBrandId>(plant?.brand || 'solarman');
  const [plantName, setPlantName] = useState<string>(plant?.plantName || 'My Rooftop Solar Plant');
  const [stationId, setStationId] = useState<string>(plant?.stationId || '');
  const [loggerSerial, setLoggerSerial] = useState<string>(plant?.loggerSerial || '');
  const [capacityKwp, setCapacityKwp] = useState<string>(
    String(plant?.installedCapacityKwp || defaultCapacityKwp || 5.0)
  );
  const [exportTariffInr, setExportTariffInr] = useState<string>(
    String(plant?.exportTariffInr ?? defaultExportTariffInr ?? 3.1)
  );
  const [meterMode, setMeterMode] = useState<InverterMeterMode>(plant?.meterMode || 'auto');
  const [autoSyncMinutes, setAutoSyncMinutes] = useState<0 | 5 | 15 | 30 | 60>(
    plant?.autoSyncMinutes ?? 15
  );

  // Cloud Sync State
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [cloudFeedback, setCloudFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
    envVars?: string[];
  } | null>(null);

  // CSV Import State
  const [csvRawText, setCsvRawText] = useState('');
  const [csvFileName, setCsvFileName] = useState('');
  const [isImportingCsv, setIsImportingCsv] = useState(false);
  const [csvNotice, setCsvNotice] = useState<string | null>(null);

  // Quick Meter Entry State
  const [entryDateKey, setEntryDateKey] = useState<string>(getLocalDateKey());
  const [entryGenKwh, setEntryGenKwh] = useState<string>(
    plant?.hasSyncedData ? String(plant.todayGenKwh) : ''
  );
  const [entryLiveKw, setEntryLiveKw] = useState<string>(
    plant?.hasSyncedData ? String(plant.livePowerKw) : ''
  );
  const [entryUsageKwh, setEntryUsageKwh] = useState<string>(
    typeof plant?.todayUsageKwh === 'number' ? String(plant.todayUsageKwh) : ''
  );
  const [entryExportKwh, setEntryExportKwh] = useState<string>(
    typeof plant?.todayExportKwh === 'number' ? String(plant.todayExportKwh) : ''
  );
  const [entryImportKwh, setEntryImportKwh] = useState<string>(
    typeof plant?.todayImportKwh === 'number' ? String(plant.todayImportKwh) : ''
  );
  const [entryLifetimeKwh, setEntryLifetimeKwh] = useState<string>(
    typeof plant?.lifetimeKwh === 'number' ? String(plant.lifetimeKwh) : ''
  );
  const [isSavingManual, setIsSavingManual] = useState(false);
  const [manualFeedback, setManualFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    setLoadingProviders(true);
    fetchInverterProviders()
      .then((list) => setProviders(list))
      .finally(() => setLoadingProviders(false));
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen || !plant) return;
    setBrand(plant.brand);
    setPlantName(plant.plantName);
    setStationId(plant.stationId || '');
    setLoggerSerial(plant.loggerSerial || '');
    setCapacityKwp(String(plant.installedCapacityKwp));
    setExportTariffInr(String(plant.exportTariffInr));
    setMeterMode(plant.meterMode);
    setAutoSyncMinutes(plant.autoSyncMinutes);
    if (plant.hasSyncedData) {
      setEntryGenKwh(String(plant.todayGenKwh));
      setEntryLiveKw(String(plant.livePowerKw));
      setEntryUsageKwh(typeof plant.todayUsageKwh === 'number' ? String(plant.todayUsageKwh) : '');
      setEntryExportKwh(typeof plant.todayExportKwh === 'number' ? String(plant.todayExportKwh) : '');
      setEntryImportKwh(typeof plant.todayImportKwh === 'number' ? String(plant.todayImportKwh) : '');
      setEntryLifetimeKwh(typeof plant.lifetimeKwh === 'number' ? String(plant.lifetimeKwh) : '');
    }
  }, [isOpen, plant]);

  const activeProvider = useMemo(
    () => providers.find((p) => p.id === brand) || null,
    [providers, brand]
  );

  const resolvedPlantId = useMemo(
    () => plant?.id || toValidInverterPlantId(brand, loggerSerial || stationId, plantName),
    [plant?.id, brand, loggerSerial, stationId, plantName]
  );

  const csvPreview = useMemo<ParsedInverterCsvResult | null>(() => {
    if (!csvRawText.trim()) return null;
    return parseInverterCsvText(csvRawText, resolvedPlantId, weatherPotentialGenKwh);
  }, [csvRawText, resolvedPlantId, weatherPotentialGenKwh]);

  if (!isOpen) return null;

  const parsedCapacity = Math.max(0.1, Math.min(5000, Number(capacityKwp) || defaultCapacityKwp || 5.0));
  const parsedExportRate = Math.max(0, Math.min(50, Number(exportTariffInr) || 0));

  const buildBasePlant = (overrides: Partial<InverterPlantProfile>): InverterPlantProfile => {
    const now = new Date();
    return {
      id: resolvedPlantId,
      brand,
      plantName: plantName.trim() || `${INVERTER_BRAND_SHORT[brand]} Plant`,
      stationId: stationId.trim() || undefined,
      loggerSerial: loggerSerial.trim() || undefined,
      installedCapacityKwp: Number(parsedCapacity.toFixed(2)),
      exportTariffInr: Number(parsedExportRate.toFixed(2)),
      meterMode,
      autoSyncMinutes,
      hasSyncedData: plant?.hasSyncedData ?? false,
      todayDateKey: plant?.todayDateKey || getLocalDateKey(now),
      todayGenKwh: plant?.todayGenKwh ?? 0,
      livePowerKw: plant?.livePowerKw ?? 0,
      todayUsageKwh: plant?.todayUsageKwh,
      todayExportKwh: plant?.todayExportKwh,
      todayImportKwh: plant?.todayImportKwh,
      lifetimeKwh: plant?.lifetimeKwh,
      hasSmartMeter: plant?.hasSmartMeter ?? false,
      syncSource: plant?.syncSource || 'manual_entry',
      lastSyncedAtIso: now.toISOString(),
      lastSyncedAtIst: formatIstTimestamp(now),
      visibility: 'public',
      ownerId: plant?.ownerId,
      ...overrides,
    };
  };

  const handleSaveConfigOnly = async () => {
    setCloudFeedback(null);
    const updatedPlant = buildBasePlant({});
    await onSavePlantAndLogs(updatedPlant);
    setCloudFeedback({
      type: 'success',
      text: `Saved ${updatedPlant.plantName} (${INVERTER_BRAND_SHORT[brand]} · ${updatedPlant.installedCapacityKwp} kWp).`,
    });
  };

  const handleCloudApiSync = async () => {
    setIsSyncingCloud(true);
    setCloudFeedback(null);
    try {
      const resp = await triggerCloudInverterSync({
        brand,
        stationId: stationId.trim() || undefined,
        loggerSerial: loggerSerial.trim() || undefined,
        installedCapacityKwp: parsedCapacity,
        meterMode,
      });

      if (!resp.ok || !resp.telemetry) {
        setCloudFeedback({
          type: resp.needsServerCredentials ? 'info' : 'error',
          text:
            resp.message ||
            resp.error ||
            'Cloud API sync could not complete. Try CSV Import or Quick Meter Entry.',
          envVars: resp.requiredEnvVars,
        });
        return;
      }

      const t = resp.telemetry;
      const prPct =
        weatherPotentialGenKwh > 0
          ? Number(Math.min(250, (t.todayGenKwh / weatherPotentialGenKwh) * 100).toFixed(1))
          : undefined;

      const updatedPlant = buildBasePlant({
        hasSyncedData: true,
        todayDateKey: t.dateKey,
        todayGenKwh: t.todayGenKwh,
        livePowerKw: t.livePowerKw,
        todayUsageKwh: t.todayUsageKwh,
        todayExportKwh: t.todayExportKwh,
        todayImportKwh: t.todayImportKwh,
        lifetimeKwh: t.lifetimeKwh,
        hasSmartMeter: t.hasSmartMeter,
        syncSource: 'cloud_api',
        lastSyncedAtIso: t.syncedAtIso,
        lastSyncedAtIst: t.syncedAtIst,
        statusNote: t.statusNote,
      });

      const todayLog: InverterDailyLog = {
        dateKey: t.dateKey,
        plantId: updatedPlant.id,
        generationKwh: t.todayGenKwh,
        ...(t.todayUsageKwh !== undefined ? { consumptionKwh: t.todayUsageKwh } : {}),
        ...(t.todayExportKwh !== undefined ? { exportKwh: t.todayExportKwh } : {}),
        ...(t.todayImportKwh !== undefined ? { importKwh: t.todayImportKwh } : {}),
        peakPowerKw: t.livePowerKw,
        weatherPotentialKwh: weatherPotentialGenKwh,
        ...(prPct !== undefined ? { performanceRatioPct: prPct } : {}),
        hasSmartMeter: t.hasSmartMeter,
        syncSource: 'cloud_api',
        recordedAtIso: t.syncedAtIso,
        visibility: 'public',
      };

      await onSavePlantAndLogs(updatedPlant, [todayLog]);
      setCloudFeedback({
        type: 'success',
        text: `Synced ${t.todayGenKwh} kWh today (${t.livePowerKw} kW live)${
          t.hasSmartMeter ? ' · CT Smart Meter auto-detected' : ' · Generation-only feed'
        }.`,
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleCsvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCsvNotice(null);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvRawText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  };

  const handleConfirmCsvImport = async () => {
    if (!csvPreview || !csvPreview.ok || csvPreview.rows.length === 0) return;
    setIsImportingCsv(true);
    setCsvNotice(null);
    try {
      const todayKey = getLocalDateKey();
      const latestRow =
        csvPreview.rows.find((r) => r.dateKey === todayKey) || csvPreview.rows[0];
      const now = new Date();

      const updatedPlant = buildBasePlant({
        hasSyncedData: true,
        todayDateKey: latestRow.dateKey,
        todayGenKwh: latestRow.generationKwh,
        livePowerKw: latestRow.peakPowerKw ?? 0,
        todayUsageKwh: latestRow.consumptionKwh,
        todayExportKwh: latestRow.exportKwh,
        todayImportKwh: latestRow.importKwh,
        hasSmartMeter: csvPreview.detectedSmartMeter,
        syncSource: 'csv_import',
        lastSyncedAtIso: now.toISOString(),
        lastSyncedAtIst: formatIstTimestamp(now),
        statusNote: `Imported ${csvPreview.rows.length} day${csvPreview.rows.length > 1 ? 's' : ''} from ${
          csvFileName || 'CSV export'
        }`,
      });

      const normalizedLogs = csvPreview.rows.map((row) => ({
        ...row,
        plantId: updatedPlant.id,
      }));

      await onSavePlantAndLogs(updatedPlant, normalizedLogs);
      setCsvNotice(
        `Synced ${normalizedLogs.length} daily generation log${
          normalizedLogs.length > 1 ? 's' : ''
        } (${csvPreview.totalGenerationKwh} kWh total). Welcome & Dashboard cards updated.`
      );
      setActiveTab('daily_logs');
    } finally {
      setIsImportingCsv(false);
    }
  };

  const handleSaveManualEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    const genVal = Number(entryGenKwh);
    if (!Number.isFinite(genVal) || genVal < 0) {
      setManualFeedback('Enter a valid generation value in kWh (0 or greater).');
      return;
    }

    setIsSavingManual(true);
    setManualFeedback(null);
    try {
      const now = new Date();
      const liveVal = Math.max(0, Number(entryLiveKw) || 0);
      const usageVal = entryUsageKwh.trim() !== '' && Number.isFinite(Number(entryUsageKwh))
        ? Math.max(0, Number(entryUsageKwh))
        : undefined;
      const exportVal = entryExportKwh.trim() !== '' && Number.isFinite(Number(entryExportKwh))
        ? Math.max(0, Number(entryExportKwh))
        : undefined;
      const importVal = entryImportKwh.trim() !== '' && Number.isFinite(Number(entryImportKwh))
        ? Math.max(0, Number(entryImportKwh))
        : undefined;
      const lifetimeVal = entryLifetimeKwh.trim() !== '' && Number.isFinite(Number(entryLifetimeKwh))
        ? Math.max(0, Number(entryLifetimeKwh))
        : undefined;

      const hasSmartMeter =
        usageVal !== undefined || exportVal !== undefined || importVal !== undefined;
      const prPct =
        weatherPotentialGenKwh > 0
          ? Number(Math.min(250, (genVal / weatherPotentialGenKwh) * 100).toFixed(1))
          : undefined;

      const updatedPlant = buildBasePlant({
        hasSyncedData: true,
        todayDateKey: entryDateKey || getLocalDateKey(now),
        todayGenKwh: Number(genVal.toFixed(2)),
        livePowerKw: Number(liveVal.toFixed(2)),
        todayUsageKwh: usageVal !== undefined ? Number(usageVal.toFixed(2)) : undefined,
        todayExportKwh: exportVal !== undefined ? Number(exportVal.toFixed(2)) : undefined,
        todayImportKwh: importVal !== undefined ? Number(importVal.toFixed(2)) : undefined,
        lifetimeKwh: lifetimeVal !== undefined ? Number(lifetimeVal.toFixed(1)) : undefined,
        hasSmartMeter,
        syncSource: 'manual_entry',
        lastSyncedAtIso: now.toISOString(),
        lastSyncedAtIst: formatIstTimestamp(now),
        statusNote: `Synced meter reading (${entryDateKey})`,
      });

      const dailyLog: InverterDailyLog = {
        dateKey: updatedPlant.todayDateKey,
        plantId: updatedPlant.id,
        generationKwh: updatedPlant.todayGenKwh,
        ...(usageVal !== undefined ? { consumptionKwh: usageVal } : {}),
        ...(exportVal !== undefined ? { exportKwh: exportVal } : {}),
        ...(importVal !== undefined ? { importKwh: importVal } : {}),
        ...(liveVal > 0 ? { peakPowerKw: liveVal } : {}),
        weatherPotentialKwh: weatherPotentialGenKwh,
        ...(prPct !== undefined ? { performanceRatioPct: prPct } : {}),
        hasSmartMeter,
        syncSource: 'manual_entry',
        recordedAtIso: now.toISOString(),
        visibility: 'public',
      };

      await onSavePlantAndLogs(updatedPlant, [dailyLog]);
      setManualFeedback(
        `Synced ${updatedPlant.todayGenKwh} kWh for ${updatedPlant.todayDateKey}. All 4 Welcome & Dashboard cards are now updated.`
      );
    } finally {
      setIsSavingManual(false);
    }
  };

  const handleExportLogsCsv = () => {
    if (dailyLogs.length === 0) return;
    const header = [
      'Date',
      'Generation (kWh)',
      'Weather Potential (kWh)',
      'Performance Ratio (%)',
      'Consumption (kWh)',
      'Grid Export (kWh)',
      'Grid Import (kWh)',
      'Peak Power (kW)',
      'Sync Source',
    ];
    const lines = dailyLogs.map((l) =>
      [
        l.dateKey,
        l.generationKwh,
        l.weatherPotentialKwh ?? '',
        l.performanceRatioPct ?? '',
        l.consumptionKwh ?? '',
        l.exportKwh ?? '',
        l.importKwh ?? '',
        l.peakPowerKw ?? '',
        l.syncSource,
      ].join(',')
    );
    const blob = new Blob([[header.join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${resolvedPlantId}_generation_logs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/65 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate">
                Universal Solar Inverter Sync Hub
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              <span>{telemetry.isConnected ? telemetry.plant?.plantName : 'Not Connected'}</span>
              <span>·</span>
              <span className="font-mono tabular-nums">
                {telemetry.isConnected
                  ? `${telemetry.displayGenKwh} kWh synced (${telemetry.displayLiveKw} kW)`
                  : `Weather baseline ${weatherPotentialGenKwh} kWh`}
              </span>
              <span>·</span>
              <span>{telemetry.meterModeLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inverter sync hub"
            className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Cloud Persistence Status Strip */}
        <div className="px-5 py-2.5 bg-slate-50 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 min-w-0">
            <Cloud className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="truncate">
              {firebaseUser?.emailVerified
                ? `Cloud Firestore sync active · Signed in as ${firebaseUser.email}`
                : 'Local browser cache active · Sign in with Google to sync plant & logs across devices'}
            </span>
          </div>
          {!firebaseUser && (
            <button
              type="button"
              onClick={() => signInWithGoogle()}
              disabled={isSigningIn}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[11px] font-semibold hover:opacity-90 transition cursor-pointer shrink-0 disabled:opacity-60"
            >
              <LogIn className="w-3 h-3" />
              <span>{isSigningIn ? 'Signing in...' : 'Sign in'}</span>
            </button>
          )}
        </div>

        {/* Segmented Navigation Tabs */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'cloud_api', label: 'Cloud API & Setup', icon: Cpu },
              { id: 'csv_import', label: 'CSV Import', icon: Upload },
              { id: 'manual_entry', label: 'Quick Meter Entry', icon: Gauge },
              { id: 'daily_logs', label: `Daily Logs (${dailyLogs.length})`, icon: CalendarDays },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {/* ========================================================== */}
          {/* TAB 1: CLOUD API SYNC & HARDWARE DETAILS                   */}
          {/* ========================================================== */}
          {activeTab === 'cloud_api' && (
            <div className="space-y-5">
              {/* Brand Selector Grid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 dark:text-white">
                    1. Select Inverter Brand / Monitoring Portal
                  </label>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">
                    {loadingProviders
                      ? 'Checking server connectors...'
                      : activeProvider?.cloudApiConfigured
                        ? 'Server Cloud API ready'
                        : 'Server API keys not set · CSV & Meter Entry ready'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {DEFAULT_BRAND_OPTIONS.map((opt) => {
                    const serverInfo = providers.find((p) => p.id === opt.id);
                    const selected = brand === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setBrand(opt.id);
                          setCloudFeedback(null);
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          selected
                            ? 'border-amber-500 bg-amber-500/5 dark:bg-amber-500/10'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {opt.label}
                          </span>
                          {serverInfo?.cloudApiConfigured && (
                            <span
                              className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"
                              title="Server Cloud API credentials active"
                            />
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {opt.sub}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Hardware Metadata Form (No Secret Keys) */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-slate-900 dark:text-white">
                  2. Required Plant & Inverter Details (Non-Secret Hardware Metadata)
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Plant / Site Name
                    </label>
                    <input
                      type="text"
                      value={plantName}
                      onChange={(e) => setPlantName(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. Home Rooftop 5 kW"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Installed Capacity (kWp)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      max="5000"
                      value={capacityKwp}
                      onChange={(e) => setCapacityKwp(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Station / Plant ID ({INVERTER_BRAND_SHORT[brand]})
                    </label>
                    <input
                      type="text"
                      value={stationId}
                      onChange={(e) => setStationId(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. 61482930"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Inverter / Wi-Fi Logger Serial No. (SN)
                    </label>
                    <input
                      type="text"
                      value={loggerSerial}
                      onChange={(e) => setLoggerSerial(e.target.value)}
                      maxLength={80}
                      placeholder="e.g. 2748192011"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      CT Clamp / Smart Meter Detection
                    </label>
                    <select
                      value={meterMode}
                      onChange={(e) => setMeterMode(e.target.value as InverterMeterMode)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    >
                      <option value="auto">Auto-Detect from Inverter Feed (Recommended)</option>
                      <option value="generation_only">Generation Only (Use Appliance Load)</option>
                      <option value="full_meter">Full CT / Smart Meter (Load + Export/Import)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Export Rate (₹/kWh)
                      </label>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        max="50"
                        value={exportTariffInr}
                        onChange={(e) => setExportTariffInr(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Auto-Sync
                      </label>
                      <select
                        value={autoSyncMinutes}
                        onChange={(e) =>
                          setAutoSyncMinutes(Number(e.target.value) as 0 | 5 | 15 | 30 | 60)
                        }
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                      >
                        <option value={0}>Manual Only</option>
                        <option value={5}>Every 5 min</option>
                        <option value={15}>Every 15 min</option>
                        <option value={30}>Every 30 min</option>
                        <option value={60}>Every 60 min</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Row */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCloudApiSync}
                  disabled={isSyncingCloud}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSyncingCloud ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCloud ? 'Syncing Live Cloud API...' : 'Sync Now via Cloud API'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveConfigOnly}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold transition cursor-pointer"
                >
                  <span>Save Plant Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('csv_import')}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sky-700 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-xs font-semibold transition cursor-pointer ml-auto"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Import CSV Instead</span>
                </button>
              </div>

              {/* Feedback / Honest Server Env Guidance */}
              {cloudFeedback && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    cloudFeedback.type === 'success'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : cloudFeedback.type === 'info'
                        ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                        : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {cloudFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : cloudFeedback.type === 'info' ? (
                      <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1.5">
                      <p className="leading-relaxed">{cloudFeedback.text}</p>
                      {cloudFeedback.envVars && cloudFeedback.envVars.length > 0 && (
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Server secrets required:{' '}
                          <span className="font-mono text-slate-800 dark:text-slate-200">
                            {cloudFeedback.envVars.join(', ')}
                          </span>
                        </div>
                      )}
                      {cloudFeedback.type !== 'success' && (
                        <div className="flex items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveTab('csv_import')}
                            className="text-xs font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                          >
                            Upload Inverter CSV Export →
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveTab('manual_entry')}
                            className="text-xs font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                          >
                            Enter Today's Meter Reading →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Provider Export Tip */}
              {activeProvider && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 flex items-start justify-between gap-3">
                  <div>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {INVERTER_BRAND_LABELS[brand]}
                    </span>
                    <span className="mx-1.5">·</span>
                    <span>CSV path: {activeProvider.csvExportHint}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 2: MULTI-BRAND CSV IMPORT                              */}
          {/* ========================================================== */}
          {activeTab === 'csv_import' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950/40 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                      Upload Inverter Portal Daily CSV Export
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Supports Solarman, SolisCloud, Growatt, Sungrow, GoodWe, Fronius, Enphase &amp; generic CSVs. Automatically detects CT consumption &amp; grid export/import columns.
                    </p>
                  </div>
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer hover:opacity-90 transition shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{csvFileName ? 'Replace CSV File' : 'Choose CSV File'}</span>
                    <input
                      type="file"
                      accept=".csv,.txt,.tsv,text/csv"
                      onChange={handleCsvFileChange}
                      className="hidden"
                    />
                  </label>
                </div>

                {csvFileName && (
                  <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400">
                    Loaded file: {csvFileName}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Or paste CSV rows directly
                  </label>
                  <span className="text-[10px] font-mono text-slate-400">
                    Date, Generation (kWh), Consumption (kWh), Export (kWh), Import (kWh)
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={csvRawText}
                  onChange={(e) => setCsvRawText(e.target.value)}
                  placeholder={`Date,Generation (kWh),Consumption (kWh),Export (kWh),Import (kWh)\n${getLocalDateKey()},21.8,17.4,8.6,4.2`}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-hidden focus:border-amber-500"
                />
              </div>

              {/* Live Parse Preview */}
              {csvPreview && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  {!csvPreview.ok ? (
                    <div className="p-3 bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{csvPreview.error}</span>
                    </div>
                  ) : (
                    <div className="space-y-3 p-3.5 bg-slate-50 dark:bg-slate-800/40">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          Detected <span className="font-mono tabular-nums">{csvPreview.rows.length}</span> daily rows · Total{' '}
                          <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                            {csvPreview.totalGenerationKwh} kWh
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-600 dark:text-slate-300">
                          {csvPreview.detectedSmartMeter
                            ? 'CT Smart Meter columns detected'
                            : 'Generation-only CSV (pairs with Appliance Load)'}
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-[11px] font-mono tabular-nums">
                          <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500">
                              <th className="py-1.5 pr-3 font-sans font-semibold">Date</th>
                              <th className="py-1.5 px-2 font-sans font-semibold text-right">Gen kWh</th>
                              <th className="py-1.5 px-2 font-sans font-semibold text-right">Load kWh</th>
                              <th className="py-1.5 px-2 font-sans font-semibold text-right">Export kWh</th>
                              <th className="py-1.5 pl-2 font-sans font-semibold text-right">Import kWh</th>
                            </tr>
                          </thead>
                          <tbody>
                            {csvPreview.rows.slice(0, 6).map((row) => (
                              <tr
                                key={row.dateKey}
                                className="border-b border-slate-100 dark:border-slate-800/70 text-slate-800 dark:text-slate-200"
                              >
                                <td className="py-1.5 pr-3">{row.dateKey}</td>
                                <td className="py-1.5 px-2 text-right font-bold text-amber-600 dark:text-amber-400">
                                  {row.generationKwh}
                                </td>
                                <td className="py-1.5 px-2 text-right">
                                  {row.consumptionKwh !== undefined ? row.consumptionKwh : '—'}
                                </td>
                                <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">
                                  {row.exportKwh !== undefined ? row.exportKwh : '—'}
                                </td>
                                <td className="py-1.5 pl-2 text-right">
                                  {row.importKwh !== undefined ? row.importKwh : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {csvPreview.rows.length > 6 && (
                          <p className="text-[10px] text-slate-500 pt-1.5">
                            + {csvPreview.rows.length - 6} additional daily rows ready to sync
                          </p>
                        )}
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={handleConfirmCsvImport}
                          disabled={isImportingCsv}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            {isImportingCsv
                              ? 'Syncing to Dashboard & Cloud...'
                              : `Sync ${csvPreview.rows.length} Days to Dashboard & Firestore`}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {csvNotice && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                  {csvNotice}
                </div>
              )}
            </div>
          )}

          {/* ========================================================== */}
          {/* TAB 3: QUICK LIVE METER READING ENTRY                      */}
          {/* ========================================================== */}
          {activeTab === 'manual_entry' && (
            <form onSubmit={handleSaveManualEntry} className="space-y-4">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Record readings straight from your inverter LCD screen or mobile monitoring app. All 4 Welcome &amp; Dashboard cards update immediately and save to Firestore.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Reading Date
                  </label>
                  <input
                    type="date"
                    value={entryDateKey}
                    onChange={(e) => setEntryDateKey(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Today's Generation (kWh) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100000"
                    required
                    value={entryGenKwh}
                    onChange={(e) => setEntryGenKwh(e.target.value)}
                    placeholder={`e.g. ${weatherPotentialGenKwh}`}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Live AC Output (kW)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="10000"
                    value={entryLiveKw}
                    onChange={(e) => setEntryLiveKw(e.target.value)}
                    placeholder="e.g. 3.40"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Optional CT Clamp / Bidirectional Net Meter Readings
                  </span>
                  <span className="text-[10px] text-slate-400">Leave blank if generation-only</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Home Load (kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entryUsageKwh}
                      onChange={(e) => setEntryUsageKwh(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-sky-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Grid Export (kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entryExportKwh}
                      onChange={(e) => setEntryExportKwh(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Grid Import (kWh)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={entryImportKwh}
                      onChange={(e) => setEntryImportKwh(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Lifetime Total (kWh)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={entryLifetimeKwh}
                      onChange={(e) => setEntryLifetimeKwh(e.target.value)}
                      placeholder="Optional"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono tabular-nums text-slate-900 dark:text-white focus:outline-hidden focus:border-slate-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  Today's weather potential benchmark:{' '}
                  <strong className="font-mono text-slate-800 dark:text-slate-200">
                    {weatherPotentialGenKwh} kWh
                  </strong>
                </span>
                <button
                  type="submit"
                  disabled={isSavingManual}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-60"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isSavingManual ? 'Syncing...' : 'Sync Reading to Dashboard'}</span>
                </button>
              </div>

              {manualFeedback && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200">
                  {manualFeedback}
                </div>
              )}
            </form>
          )}

          {/* ========================================================== */}
          {/* TAB 4: DAILY GENERATION LOG LEDGER                         */}
          {/* ========================================================== */}
          {activeTab === 'daily_logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                    {dailyLogs.length}
                  </strong>{' '}
                  logged days · Cumulative{' '}
                  <strong className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                    {telemetry.cumulativeLoggedGenKwh.toLocaleString('en-IN')} kWh
                  </strong>
                </div>

                {dailyLogs.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportLogsCsv}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                )}
              </div>

              {dailyLogs.length === 0 ? (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center space-y-2">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    No daily inverter generation logs synced yet
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sync via Cloud API, upload a portal CSV export, or enter today's inverter reading to start your real generation ledger.
                  </p>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab('csv_import')}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                    >
                      Import CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('manual_entry')}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                    >
                      Quick Meter Entry
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs font-mono tabular-nums">
                    <thead className="bg-slate-50 dark:bg-slate-800/70 text-[11px] text-slate-500 dark:text-slate-400 font-sans">
                      <tr>
                        <th className="py-2 px-3 font-semibold">Date</th>
                        <th className="py-2 px-2.5 font-semibold text-right">Actual kWh</th>
                        <th className="py-2 px-2.5 font-semibold text-right">PR %</th>
                        <th className="py-2 px-2.5 font-semibold text-right">Load / Exp</th>
                        <th className="py-2 px-3 font-semibold text-right">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {dailyLogs.slice(0, 45).map((log) => (
                        <tr key={log.dateKey} className="text-slate-800 dark:text-slate-200">
                          <td className="py-2 px-3">{log.dateKey}</td>
                          <td className="py-2 px-2.5 text-right font-bold text-amber-600 dark:text-amber-400">
                            {log.generationKwh.toFixed(1)}
                          </td>
                          <td className="py-2 px-2.5 text-right text-emerald-600 dark:text-emerald-400">
                            {typeof log.performanceRatioPct === 'number'
                              ? `${log.performanceRatioPct.toFixed(0)}%`
                              : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-[11px] text-slate-500 dark:text-slate-400">
                            {log.consumptionKwh !== undefined || log.exportKwh !== undefined
                              ? `${log.consumptionKwh ?? '—'} / ${log.exportKwh ?? '—'}`
                              : 'Gen only'}
                          </td>
                          <td className="py-2 px-3 text-right font-sans text-[11px] text-slate-500 dark:text-slate-400">
                            {SYNC_SOURCE_LABELS[log.syncSource]}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-2">
          <div>
            {plant && onDisconnectPlant && (
              <button
                type="button"
                onClick={async () => {
                  await onDisconnectPlant();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect Plant</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
