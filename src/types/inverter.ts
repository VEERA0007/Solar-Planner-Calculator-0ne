/**
 * Universal Multi-Brand Solar Inverter Sync Hub — Domain Types
 */

export type InverterBrandId =
  | 'solarman'
  | 'growatt'
  | 'soliscloud'
  | 'sungrow'
  | 'goodwe'
  | 'fronius'
  | 'enphase'
  | 'custom_bridge';

export type InverterMeterMode = 'auto' | 'generation_only' | 'full_meter';

export type InverterSyncSource = 'cloud_api' | 'csv_import' | 'manual_entry';

export interface InverterProviderCatalogItem {
  id: InverterBrandId;
  name: string;
  portalName: string;
  subBrands: string;
  cloudApiConfigured: boolean;
  cloudApiMode: 'native_api' | 'custom_bridge';
  requiredFields: Array<'stationId' | 'loggerSerial'>;
  envVars: string[];
  csvExportHint: string;
}

export interface InverterPlantProfile {
  id: string;
  brand: InverterBrandId;
  plantName: string;
  stationId?: string;
  loggerSerial?: string;
  installedCapacityKwp: number;
  exportTariffInr: number;
  meterMode: InverterMeterMode;
  autoSyncMinutes: 0 | 5 | 15 | 30 | 60;
  hasSyncedData: boolean;
  todayDateKey: string; // YYYY-MM-DD
  todayGenKwh: number;
  livePowerKw: number;
  todayUsageKwh?: number;
  todayExportKwh?: number;
  todayImportKwh?: number;
  lifetimeKwh?: number;
  hasSmartMeter: boolean;
  syncSource: InverterSyncSource;
  lastSyncedAtIso: string;
  lastSyncedAtIst: string;
  statusNote?: string;
  visibility?: 'public';
  ownerId?: string;
  isCloudSynced?: boolean;
}

export interface InverterDailyLog {
  dateKey: string; // YYYY-MM-DD
  plantId: string;
  generationKwh: number;
  consumptionKwh?: number;
  exportKwh?: number;
  importKwh?: number;
  peakPowerKw?: number;
  weatherPotentialKwh?: number;
  performanceRatioPct?: number;
  hasSmartMeter: boolean;
  syncSource: InverterSyncSource;
  recordedAtIso: string;
  visibility?: 'public';
  ownerId?: string;
  isCloudSynced?: boolean;
}

export interface CloudInverterSyncResponse {
  ok: boolean;
  brand: InverterBrandId;
  providerName?: string;
  needsServerCredentials?: boolean;
  requiredEnvVars?: string[];
  error?: string;
  message?: string;
  telemetry?: {
    dateKey: string;
    todayGenKwh: number;
    livePowerKw: number;
    todayUsageKwh?: number;
    todayExportKwh?: number;
    todayImportKwh?: number;
    lifetimeKwh?: number;
    hasSmartMeter: boolean;
    syncedAtIso: string;
    syncedAtIst: string;
    statusNote?: string;
  };
}

/**
 * Unified telemetry snapshot consumed by WelcomeScreen, DashboardScreen,
 * SolarHeroCard, LiveSyncControlBar, TodayEnergySummaryWidgets, and all 4 detail modals.
 */
export interface ResolvedInverterTelemetry {
  isConnected: boolean;
  isTodayReading: boolean;
  plant: InverterPlantProfile | null;
  dailyLogs: InverterDailyLog[];
  brandLabel: string;
  syncSourceLabel: string;
  effectiveCapacityKwp: number;

  // Weather benchmark vs actual inverter generation
  weatherPotentialGenKwh: number;
  weatherLiveKw: number;
  actualGenKwh: number | null;
  displayGenKwh: number;
  displayLiveKw: number;
  performanceRatioPct: number | null;

  // Auto-detected CT / Smart Meter consumption & grid exchange
  hasSmartMeterActive: boolean;
  meterModeLabel: string;
  displayUsageKwh: number;
  displayLiveUsageKw: number;
  meteredUsageKwh: number | null;
  meteredExportKwh: number | null;
  meteredImportKwh: number | null;

  // Net balance & financial metrics
  selfConsumedKwh: number;
  exportedKwh: number;
  importedKwh: number;
  netBalanceKwh: number;
  isSurplus: boolean;
  solarCoveragePercent: number;

  // Real financial & carbon value
  exportTariffInr: number;
  todaySelfSavingsInr: number;
  todayExportEarningsInr: number;
  todayTotalSavingsInr: number;
  todayCo2AvoidedKg: number;
  cumulativeLoggedGenKwh: number;
  cumulativeLoggedDays: number;
}
