import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  CloudInverterSyncResponse,
  InverterBrandId,
  InverterDailyLog,
  InverterMeterMode,
  InverterPlantProfile,
  InverterProviderCatalogItem,
  InverterSyncSource,
  ResolvedInverterTelemetry,
} from '../types/inverter';
import { WeatherCondition } from '../types/solar';
import { calculateDetailedSunAngles } from '../utils/solarMath';

export const INVERTER_PLANTS_COLLECTION = 'inverter_plants';
export const INVERTER_DAILY_LOGS_SUBCOLLECTION = 'daily_logs';
export const ADMIN_EMAIL = 'veera.official1997@gmail.com';

const VALID_BRANDS = new Set<InverterBrandId>([
  'solarman',
  'growatt',
  'soliscloud',
  'sungrow',
  'goodwe',
  'fronius',
  'enphase',
  'custom_bridge',
]);

const VALID_METER_MODES = new Set<InverterMeterMode>(['auto', 'generation_only', 'full_meter']);
const VALID_SYNC_SOURCES = new Set<InverterSyncSource>(['cloud_api', 'csv_import', 'manual_entry']);
const VALID_AUTO_SYNC = new Set([0, 5, 15, 30, 60]);

export const INVERTER_BRAND_LABELS: Record<InverterBrandId, string> = {
  solarman: 'Solarman (Deye / V-Sole / KSolare / Sofar)',
  growatt: 'Growatt ShineServer',
  soliscloud: 'SolisCloud',
  sungrow: 'Sungrow iSolarCloud',
  goodwe: 'GoodWe SEMS',
  fronius: 'Fronius Solar.web',
  enphase: 'Enphase Enlighten',
  custom_bridge: 'Custom JSON / Home Assistant Bridge',
};

export const INVERTER_BRAND_SHORT: Record<InverterBrandId, string> = {
  solarman: 'Solarman',
  growatt: 'Growatt',
  soliscloud: 'SolisCloud',
  sungrow: 'Sungrow',
  goodwe: 'GoodWe',
  fronius: 'Fronius',
  enphase: 'Enphase',
  custom_bridge: 'Custom Bridge',
};

export const SYNC_SOURCE_LABELS: Record<InverterSyncSource, string> = {
  cloud_api: 'Cloud API',
  csv_import: 'CSV Import',
  manual_entry: 'Meter Entry',
};

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIstTimestamp(date: Date = new Date()): string {
  try {
    return (
      date.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }) + ' IST'
    );
  } catch {
    return date.toLocaleString();
  }
}

/**
 * Deterministic Firestore document ID matching `^[a-zA-Z0-9_\-]+$` (1..128 chars)
 */
export function toValidInverterPlantId(
  brand: InverterBrandId,
  stationOrSerial?: string,
  plantName?: string
): string {
  const cleanBrand = VALID_BRANDS.has(brand) ? brand : 'solarman';
  const rawKey = (stationOrSerial || plantName || 'primary_plant')
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9_\-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const composed = `${cleanBrand}_${rawKey || 'primary_plant'}`;
  return composed.slice(0, 128);
}

function clampStr(val: string | undefined, maxLen: number): string {
  return (val || '').trim().slice(0, maxLen);
}

function clampNum(val: unknown, min: number, max: number): number {
  const n = Number(val);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function sanitizeDateKey(raw: string | undefined): string {
  if (raw && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw)) return raw;
  return getLocalDateKey();
}

function sanitizePlantFields(plant: InverterPlantProfile) {
  const brand: InverterBrandId = VALID_BRANDS.has(plant.brand) ? plant.brand : 'solarman';
  const id =
    plant.id && /^[a-zA-Z0-9_\-]+$/.test(plant.id)
      ? plant.id.slice(0, 128)
      : toValidInverterPlantId(brand, plant.loggerSerial || plant.stationId, plant.plantName);

  const meterMode: InverterMeterMode = VALID_METER_MODES.has(plant.meterMode)
    ? plant.meterMode
    : 'auto';
  const syncSource: InverterSyncSource = VALID_SYNC_SOURCES.has(plant.syncSource)
    ? plant.syncSource
    : 'manual_entry';
  const autoSyncMinutes = VALID_AUTO_SYNC.has(plant.autoSyncMinutes)
    ? plant.autoSyncMinutes
    : 0;

  const payload: Record<string, unknown> = {
    id,
    brand,
    plantName: clampStr(plant.plantName || 'My Solar Plant', 80) || 'My Solar Plant',
    installedCapacityKwp: Number(clampNum(plant.installedCapacityKwp, 0.1, 5000).toFixed(2)),
    exportTariffInr: Number(clampNum(plant.exportTariffInr, 0, 50).toFixed(2)),
    meterMode,
    autoSyncMinutes,
    hasSyncedData: Boolean(plant.hasSyncedData),
    todayDateKey: sanitizeDateKey(plant.todayDateKey),
    todayGenKwh: Number(clampNum(plant.todayGenKwh, 0, 100000).toFixed(2)),
    livePowerKw: Number(clampNum(plant.livePowerKw, 0, 10000).toFixed(2)),
    hasSmartMeter: Boolean(plant.hasSmartMeter),
    syncSource,
    lastSyncedAtIso: clampStr(plant.lastSyncedAtIso || new Date().toISOString(), 40),
    lastSyncedAtIst: clampStr(plant.lastSyncedAtIst || formatIstTimestamp(), 60),
    visibility: 'public',
  };

  const stationId = clampStr(plant.stationId, 80);
  if (stationId) payload.stationId = stationId;

  const loggerSerial = clampStr(plant.loggerSerial, 80);
  if (loggerSerial) payload.loggerSerial = loggerSerial;

  if (typeof plant.todayUsageKwh === 'number' && Number.isFinite(plant.todayUsageKwh) && plant.todayUsageKwh >= 0) {
    payload.todayUsageKwh = Number(clampNum(plant.todayUsageKwh, 0, 100000).toFixed(2));
  }
  if (typeof plant.todayExportKwh === 'number' && Number.isFinite(plant.todayExportKwh) && plant.todayExportKwh >= 0) {
    payload.todayExportKwh = Number(clampNum(plant.todayExportKwh, 0, 100000).toFixed(2));
  }
  if (typeof plant.todayImportKwh === 'number' && Number.isFinite(plant.todayImportKwh) && plant.todayImportKwh >= 0) {
    payload.todayImportKwh = Number(clampNum(plant.todayImportKwh, 0, 100000).toFixed(2));
  }
  if (typeof plant.lifetimeKwh === 'number' && Number.isFinite(plant.lifetimeKwh) && plant.lifetimeKwh >= 0) {
    payload.lifetimeKwh = Number(clampNum(plant.lifetimeKwh, 0, 100000000).toFixed(2));
  }

  const statusNote = clampStr(plant.statusNote, 160);
  if (statusNote) payload.statusNote = statusNote;

  return { id, payload };
}

function sanitizeDailyLogFields(log: InverterDailyLog, plantId: string) {
  const dateKey = sanitizeDateKey(log.dateKey);
  const safePlantId = plantId.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  const syncSource: InverterSyncSource = VALID_SYNC_SOURCES.has(log.syncSource)
    ? log.syncSource
    : 'manual_entry';

  const payload: Record<string, unknown> = {
    dateKey,
    plantId: safePlantId,
    generationKwh: Number(clampNum(log.generationKwh, 0, 100000).toFixed(2)),
    hasSmartMeter: Boolean(log.hasSmartMeter),
    syncSource,
    recordedAtIso: clampStr(log.recordedAtIso || new Date().toISOString(), 40),
    visibility: 'public',
  };

  if (typeof log.consumptionKwh === 'number' && Number.isFinite(log.consumptionKwh) && log.consumptionKwh >= 0) {
    payload.consumptionKwh = Number(clampNum(log.consumptionKwh, 0, 100000).toFixed(2));
  }
  if (typeof log.exportKwh === 'number' && Number.isFinite(log.exportKwh) && log.exportKwh >= 0) {
    payload.exportKwh = Number(clampNum(log.exportKwh, 0, 100000).toFixed(2));
  }
  if (typeof log.importKwh === 'number' && Number.isFinite(log.importKwh) && log.importKwh >= 0) {
    payload.importKwh = Number(clampNum(log.importKwh, 0, 100000).toFixed(2));
  }
  if (typeof log.peakPowerKw === 'number' && Number.isFinite(log.peakPowerKw) && log.peakPowerKw >= 0) {
    payload.peakPowerKw = Number(clampNum(log.peakPowerKw, 0, 10000).toFixed(2));
  }
  if (typeof log.weatherPotentialKwh === 'number' && Number.isFinite(log.weatherPotentialKwh) && log.weatherPotentialKwh >= 0) {
    payload.weatherPotentialKwh = Number(clampNum(log.weatherPotentialKwh, 0, 100000).toFixed(2));
  }
  if (typeof log.performanceRatioPct === 'number' && Number.isFinite(log.performanceRatioPct) && log.performanceRatioPct >= 0) {
    payload.performanceRatioPct = Number(clampNum(log.performanceRatioPct, 0, 250).toFixed(1));
  }

  return { dateKey, safePlantId, payload };
}

export function canManageInverterPlant(plant: InverterPlantProfile | null, user: User | null): boolean {
  if (!plant) return true;
  if (!plant.isCloudSynced) return true;
  if (!user || !user.emailVerified) return false;
  if (user.email === ADMIN_EMAIL) return true;
  return Boolean(plant.ownerId && plant.ownerId === user.uid);
}

/**
 * Real-time subscription to shared inverter plants in Firestore.
 * Uses `where('visibility', '==', 'public')` and sorts newest-synced first in memory.
 */
export function subscribeSharedInverterPlants(
  onData: (plants: InverterPlantProfile[]) => void,
  onNonFatalError?: (message: string) => void
): () => void {
  const q = query(
    collection(db, INVERTER_PLANTS_COLLECTION),
    where('visibility', '==', 'public'),
    limit(20)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: InverterPlantProfile[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: typeof d.id === 'string' && d.id ? d.id : docSnap.id,
          brand: VALID_BRANDS.has(d.brand) ? (d.brand as InverterBrandId) : 'solarman',
          plantName: typeof d.plantName === 'string' ? d.plantName : 'My Solar Plant',
          stationId: typeof d.stationId === 'string' ? d.stationId : undefined,
          loggerSerial: typeof d.loggerSerial === 'string' ? d.loggerSerial : undefined,
          installedCapacityKwp: Number(d.installedCapacityKwp) || 5.0,
          exportTariffInr: Number(d.exportTariffInr) || 3.1,
          meterMode: VALID_METER_MODES.has(d.meterMode) ? (d.meterMode as InverterMeterMode) : 'auto',
          autoSyncMinutes: VALID_AUTO_SYNC.has(Number(d.autoSyncMinutes))
            ? (Number(d.autoSyncMinutes) as 0 | 5 | 15 | 30 | 60)
            : 0,
          hasSyncedData: Boolean(d.hasSyncedData),
          todayDateKey: sanitizeDateKey(typeof d.todayDateKey === 'string' ? d.todayDateKey : undefined),
          todayGenKwh: Number(d.todayGenKwh) || 0,
          livePowerKw: Number(d.livePowerKw) || 0,
          todayUsageKwh: typeof d.todayUsageKwh === 'number' ? d.todayUsageKwh : undefined,
          todayExportKwh: typeof d.todayExportKwh === 'number' ? d.todayExportKwh : undefined,
          todayImportKwh: typeof d.todayImportKwh === 'number' ? d.todayImportKwh : undefined,
          lifetimeKwh: typeof d.lifetimeKwh === 'number' ? d.lifetimeKwh : undefined,
          hasSmartMeter: Boolean(d.hasSmartMeter),
          syncSource: VALID_SYNC_SOURCES.has(d.syncSource)
            ? (d.syncSource as InverterSyncSource)
            : 'manual_entry',
          lastSyncedAtIso:
            typeof d.lastSyncedAtIso === 'string' ? d.lastSyncedAtIso : new Date(0).toISOString(),
          lastSyncedAtIst: typeof d.lastSyncedAtIst === 'string' ? d.lastSyncedAtIst : '',
          statusNote: typeof d.statusNote === 'string' ? d.statusNote : undefined,
          visibility: 'public',
          ownerId: typeof d.ownerId === 'string' ? d.ownerId : undefined,
          isCloudSynced: true,
        };
      });

      items.sort((a, b) => (b.lastSyncedAtIso || '').localeCompare(a.lastSyncedAtIso || ''));
      onData(items);
    },
    (error) => {
      if (onNonFatalError) {
        onNonFatalError(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.LIST, INVERTER_PLANTS_COLLECTION);
    }
  );
}

/**
 * Real-time subscription to a plant's date-keyed daily generation logs in Firestore.
 */
export function subscribeInverterDailyLogs(
  plantId: string,
  onData: (logs: InverterDailyLog[]) => void,
  onNonFatalError?: (message: string) => void
): () => void {
  const safePlantId = plantId.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  const path = `${INVERTER_PLANTS_COLLECTION}/${safePlantId}/${INVERTER_DAILY_LOGS_SUBCOLLECTION}`;
  const q = query(
    collection(db, INVERTER_PLANTS_COLLECTION, safePlantId, INVERTER_DAILY_LOGS_SUBCOLLECTION),
    where('visibility', '==', 'public'),
    limit(120)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const logs: InverterDailyLog[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          dateKey: typeof d.dateKey === 'string' ? d.dateKey : docSnap.id,
          plantId: typeof d.plantId === 'string' ? d.plantId : safePlantId,
          generationKwh: Number(d.generationKwh) || 0,
          consumptionKwh: typeof d.consumptionKwh === 'number' ? d.consumptionKwh : undefined,
          exportKwh: typeof d.exportKwh === 'number' ? d.exportKwh : undefined,
          importKwh: typeof d.importKwh === 'number' ? d.importKwh : undefined,
          peakPowerKw: typeof d.peakPowerKw === 'number' ? d.peakPowerKw : undefined,
          weatherPotentialKwh:
            typeof d.weatherPotentialKwh === 'number' ? d.weatherPotentialKwh : undefined,
          performanceRatioPct:
            typeof d.performanceRatioPct === 'number' ? d.performanceRatioPct : undefined,
          hasSmartMeter: Boolean(d.hasSmartMeter),
          syncSource: VALID_SYNC_SOURCES.has(d.syncSource)
            ? (d.syncSource as InverterSyncSource)
            : 'manual_entry',
          recordedAtIso:
            typeof d.recordedAtIso === 'string' ? d.recordedAtIso : new Date(0).toISOString(),
          visibility: 'public',
          ownerId: typeof d.ownerId === 'string' ? d.ownerId : undefined,
          isCloudSynced: true,
        };
      });

      logs.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
      onData(logs);
    },
    (error) => {
      if (onNonFatalError) {
        onNonFatalError(error instanceof Error ? error.message : String(error));
      }
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

/**
 * Creates or updates an InverterPlantProfile in Firestore (verified owner/admin only).
 */
export async function saveInverterPlantProfile(
  plant: InverterPlantProfile
): Promise<{ saved: boolean; plantId?: string; reason?: 'unauthenticated' | 'not_owner' }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { saved: false, reason: 'unauthenticated' };
  }

  const { id, payload } = sanitizePlantFields(plant);
  const path = `${INVERTER_PLANTS_COLLECTION}/${id}`;
  const docRef = doc(db, INVERTER_PLANTS_COLLECTION, id);

  let existsAlready = false;
  let existingOwnerId: string | undefined;
  try {
    const snap = await getDoc(docRef);
    existsAlready = snap.exists();
    existingOwnerId = snap.data()?.ownerId;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  if (!existsAlready) {
    try {
      await setDoc(docRef, {
        ...payload,
        ownerId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return { saved: true, plantId: id };
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
  } else {
    const isOwnerOrAdmin = existingOwnerId === user.uid || user.email === ADMIN_EMAIL;
    if (!isOwnerOrAdmin) {
      return { saved: false, reason: 'not_owner' };
    }

    const updatePayload: Record<string, unknown> = {
      brand: payload.brand,
      plantName: payload.plantName,
      installedCapacityKwp: payload.installedCapacityKwp,
      exportTariffInr: payload.exportTariffInr,
      meterMode: payload.meterMode,
      autoSyncMinutes: payload.autoSyncMinutes,
      hasSyncedData: payload.hasSyncedData,
      todayDateKey: payload.todayDateKey,
      todayGenKwh: payload.todayGenKwh,
      livePowerKw: payload.livePowerKw,
      hasSmartMeter: payload.hasSmartMeter,
      syncSource: payload.syncSource,
      lastSyncedAtIso: payload.lastSyncedAtIso,
      lastSyncedAtIst: payload.lastSyncedAtIst,
      updatedAt: serverTimestamp(),
    };

    if (payload.stationId !== undefined) updatePayload.stationId = payload.stationId;
    if (payload.loggerSerial !== undefined) updatePayload.loggerSerial = payload.loggerSerial;
    if (payload.todayUsageKwh !== undefined) updatePayload.todayUsageKwh = payload.todayUsageKwh;
    if (payload.todayExportKwh !== undefined) updatePayload.todayExportKwh = payload.todayExportKwh;
    if (payload.todayImportKwh !== undefined) updatePayload.todayImportKwh = payload.todayImportKwh;
    if (payload.lifetimeKwh !== undefined) updatePayload.lifetimeKwh = payload.lifetimeKwh;
    if (payload.statusNote !== undefined) updatePayload.statusNote = payload.statusNote;

    try {
      await updateDoc(docRef, updatePayload);
      return { saved: true, plantId: id };
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
}

/**
 * Upserts one or more date-keyed daily generation logs under `/inverter_plants/{plantId}/daily_logs/{dateKey}`.
 */
export async function saveInverterDailyLogs(
  plantId: string,
  logs: InverterDailyLog[]
): Promise<{ savedCount: number; reason?: 'unauthenticated' }> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) {
    return { savedCount: 0, reason: 'unauthenticated' };
  }
  if (!logs || logs.length === 0) return { savedCount: 0 };

  const safePlantId = plantId.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  const capped = logs.slice(0, 90);
  let savedCount = 0;

  // Check existence in small chunks so create vs update respects immutable createdAt/ownerId rules
  const CHUNK_SIZE = 20;
  for (let i = 0; i < capped.length; i += CHUNK_SIZE) {
    const chunk = capped.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const item of chunk) {
      const { dateKey, payload } = sanitizeDailyLogFields(item, safePlantId);
      const logRef = doc(
        db,
        INVERTER_PLANTS_COLLECTION,
        safePlantId,
        INVERTER_DAILY_LOGS_SUBCOLLECTION,
        dateKey
      );
      const logPath = `${INVERTER_PLANTS_COLLECTION}/${safePlantId}/${INVERTER_DAILY_LOGS_SUBCOLLECTION}/${dateKey}`;

      let existsAlready = false;
      try {
        const snap = await getDoc(logRef);
        existsAlready = snap.exists();
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, logPath);
      }

      if (!existsAlready) {
        batch.set(logRef, {
          ...payload,
          ownerId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        const updateData: Record<string, unknown> = {
          generationKwh: payload.generationKwh,
          hasSmartMeter: payload.hasSmartMeter,
          syncSource: payload.syncSource,
          recordedAtIso: payload.recordedAtIso,
          updatedAt: serverTimestamp(),
        };
        if (payload.consumptionKwh !== undefined) updateData.consumptionKwh = payload.consumptionKwh;
        if (payload.exportKwh !== undefined) updateData.exportKwh = payload.exportKwh;
        if (payload.importKwh !== undefined) updateData.importKwh = payload.importKwh;
        if (payload.peakPowerKw !== undefined) updateData.peakPowerKw = payload.peakPowerKw;
        if (payload.weatherPotentialKwh !== undefined) {
          updateData.weatherPotentialKwh = payload.weatherPotentialKwh;
        }
        if (payload.performanceRatioPct !== undefined) {
          updateData.performanceRatioPct = payload.performanceRatioPct;
        }
        batch.update(logRef, updateData);
      }
      savedCount++;
    }

    const batchPath = `${INVERTER_PLANTS_COLLECTION}/${safePlantId}/${INVERTER_DAILY_LOGS_SUBCOLLECTION}`;
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, batchPath);
    }
  }

  return { savedCount };
}

export async function deleteInverterPlantProfile(plantId: string): Promise<boolean> {
  const user = auth.currentUser;
  if (!user || !user.emailVerified) return false;
  const safeId = plantId.replace(/[^a-zA-Z0-9_\-]+/g, '_').slice(0, 128);
  const path = `${INVERTER_PLANTS_COLLECTION}/${safeId}`;
  try {
    await deleteDoc(doc(db, INVERTER_PLANTS_COLLECTION, safeId));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Fetches server-side inverter provider catalog and live credential readiness.
 */
export async function fetchInverterProviders(): Promise<InverterProviderCatalogItem[]> {
  try {
    const resp = await fetch('/api/inverter/providers');
    if (!resp.ok) return [];
    const data = await resp.json();
    return Array.isArray(data?.providers) ? (data.providers as InverterProviderCatalogItem[]) : [];
  } catch {
    return [];
  }
}

/**
 * Triggers a real server-side Cloud API sync via `/api/inverter/sync` using non-secret plant IDs.
 */
export async function triggerCloudInverterSync(params: {
  brand: InverterBrandId;
  stationId?: string;
  loggerSerial?: string;
  installedCapacityKwp: number;
  meterMode: InverterMeterMode;
}): Promise<CloudInverterSyncResponse> {
  try {
    const resp = await fetch('/api/inverter/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = (await resp.json()) as CloudInverterSyncResponse;
    return data;
  } catch (err) {
    return {
      ok: false,
      brand: params.brand,
      error: err instanceof Error ? err.message : 'Unable to reach server inverter proxy.',
    };
  }
}

/**
 * Unified single source of truth computing live weather potential, actual synced inverter
 * generation, Performance Ratio %, CT/smart-meter vs appliance usage, net export/import,
 * and real financial + carbon savings for WelcomeScreen, DashboardScreen, Hero, and all 4 cards/modals.
 */
export function resolveInverterTelemetry(opts: {
  plant: InverterPlantProfile | null;
  dailyLogs: InverterDailyLog[];
  weather: WeatherCondition;
  fallbackCapacityKwp: number;
  applianceDailyKwh: number;
  electricityRate: number;
  defaultExportTariffInr?: number;
}): ResolvedInverterTelemetry {
  const {
    plant,
    dailyLogs,
    weather,
    fallbackCapacityKwp,
    applianceDailyKwh,
    electricityRate,
    defaultExportTariffInr = 3.1,
  } = opts;

  const effectiveCapacityKwp =
    plant && plant.installedCapacityKwp > 0
      ? plant.installedCapacityKwp
      : Math.max(0.5, fallbackCapacityKwp || 5.0);

  const exportTariffInr =
    plant && typeof plant.exportTariffInr === 'number' && plant.exportTariffInr >= 0
      ? plant.exportTariffInr
      : defaultExportTariffInr;

  // 1. Weather-adjusted theoretical potential benchmark
  const now = new Date();
  const sunData = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    now
  );
  const isSunUp = sunData.altitudeDeg > 0;
  const cellTemp = (weather.temperatureC || 28) + ((weather.globalHorizontalIrradianceWpm2 || 850) / 800) * 25;
  const tempDeratingFactor = Math.max(0.85, Math.min(1.02, 1 - Math.max(0, cellTemp - 25) * 0.0038));
  const cloudRatio =
    weather.cloudImpactRatio || Math.max(0.4, 1 - ((weather.cloudCoverPercent || 15) / 100) * 0.7);
  const effectivePsh = Math.max(2.5, Math.min(7.5, (weather.peakSunHoursEstimated || 5.5) * cloudRatio));
  const inverterEff = 0.96;

  const weatherPotentialGenKwh = Math.max(
    1.0,
    Number((effectiveCapacityKwp * effectivePsh * tempDeratingFactor * inverterEff).toFixed(1))
  );

  const sunElevationFactor = isSunUp ? Math.sin((sunData.altitudeDeg * Math.PI) / 180) : 0;
  const normalizedGhi = (weather.globalHorizontalIrradianceWpm2 || 850) / 1000;
  const weatherLiveKw = isSunUp
    ? Number(
        Math.max(
          0.1,
          Math.min(
            effectiveCapacityKwp * 0.98,
            effectiveCapacityKwp * normalizedGhi * sunElevationFactor * tempDeratingFactor * cloudRatio
          )
        ).toFixed(2)
      )
    : 0.0;

  // 2. Check synced inverter telemetry
  const todayKey = getLocalDateKey(now);
  const isConnected = Boolean(plant && plant.hasSyncedData);
  const isTodayReading = Boolean(isConnected && plant?.todayDateKey === todayKey);

  const actualGenKwh = isConnected && plant ? Number(plant.todayGenKwh.toFixed(1)) : null;
  const displayGenKwh = actualGenKwh !== null ? actualGenKwh : weatherPotentialGenKwh;
  const displayLiveKw =
    isConnected && plant ? Number(plant.livePowerKw.toFixed(2)) : weatherLiveKw;

  const performanceRatioPct =
    actualGenKwh !== null && weatherPotentialGenKwh > 0
      ? Number(Math.min(200, (actualGenKwh / weatherPotentialGenKwh) * 100).toFixed(1))
      : null;

  // 3. Auto-detect CT / Smart Meter consumption & grid exchange
  const hasRawMeterChannels = Boolean(
    isConnected &&
      plant &&
      (plant.hasSmartMeter ||
        typeof plant.todayUsageKwh === 'number' ||
        typeof plant.todayExportKwh === 'number' ||
        typeof plant.todayImportKwh === 'number')
  );

  const hasSmartMeterActive = Boolean(
    isConnected &&
      plant &&
      plant.meterMode !== 'generation_only' &&
      (plant.meterMode === 'full_meter' ? hasRawMeterChannels : hasRawMeterChannels)
  );

  const meteredUsageKwh =
    hasSmartMeterActive && typeof plant?.todayUsageKwh === 'number'
      ? Number(plant.todayUsageKwh.toFixed(1))
      : hasSmartMeterActive &&
          actualGenKwh !== null &&
          typeof plant?.todayExportKwh === 'number' &&
          typeof plant?.todayImportKwh === 'number'
        ? Number(Math.max(0.1, actualGenKwh - plant.todayExportKwh + plant.todayImportKwh).toFixed(1))
        : null;

  const fallbackUsageKwh = Math.max(1.0, Number((applianceDailyKwh || 18.2).toFixed(1)));
  const displayUsageKwh = meteredUsageKwh !== null ? meteredUsageKwh : fallbackUsageKwh;

  const currentHour = now.getHours();
  const loadMultiplier =
    currentHour >= 18 && currentHour <= 22
      ? 1.45
      : currentHour >= 7 && currentHour <= 10
        ? 1.25
        : currentHour >= 11 && currentHour <= 16
          ? 1.1
          : 0.65;
  const displayLiveUsageKw = Number(((displayUsageKwh / 24) * loadMultiplier).toFixed(2));

  // 4. Grid export / import & net energy balance
  const meteredExportKwh =
    hasSmartMeterActive && typeof plant?.todayExportKwh === 'number'
      ? Number(plant.todayExportKwh.toFixed(1))
      : null;
  const meteredImportKwh =
    hasSmartMeterActive && typeof plant?.todayImportKwh === 'number'
      ? Number(plant.todayImportKwh.toFixed(1))
      : null;

  let selfConsumedKwh: number;
  let exportedKwh: number;
  let importedKwh: number;
  let netBalanceKwh: number;

  if (meteredExportKwh !== null || meteredImportKwh !== null) {
    exportedKwh = meteredExportKwh ?? Math.max(0, Number((displayGenKwh - displayUsageKwh).toFixed(1)));
    importedKwh = meteredImportKwh ?? Math.max(0, Number((displayUsageKwh - displayGenKwh).toFixed(1)));
    selfConsumedKwh = Number(Math.max(0, displayGenKwh - exportedKwh).toFixed(1));
    netBalanceKwh = Number((exportedKwh - importedKwh).toFixed(1));
  } else {
    selfConsumedKwh = Number(Math.min(displayGenKwh, displayUsageKwh).toFixed(1));
    exportedKwh = Number(Math.max(0, displayGenKwh - displayUsageKwh).toFixed(1));
    importedKwh = Number(Math.max(0, displayUsageKwh - displayGenKwh).toFixed(1));
    netBalanceKwh = Number((displayGenKwh - displayUsageKwh).toFixed(1));
  }

  const isSurplus = netBalanceKwh >= 0;
  const solarCoveragePercent =
    displayUsageKwh > 0 ? Math.min(300, Math.round((displayGenKwh / displayUsageKwh) * 100)) : 0;

  // 5. Real financial value & carbon offset
  const todaySelfSavingsInr = Math.round(selfConsumedKwh * electricityRate);
  const todayExportEarningsInr = Math.round(exportedKwh * exportTariffInr);
  const todayTotalSavingsInr = todaySelfSavingsInr + todayExportEarningsInr;
  const todayCo2AvoidedKg = Number((displayGenKwh * 0.82).toFixed(1));

  const cumulativeLoggedGenKwh = Number(
    dailyLogs.reduce((acc, log) => acc + (log.generationKwh || 0), 0).toFixed(1)
  );

  const meterModeLabel = !isConnected
    ? 'Weather Estimate'
    : hasSmartMeterActive
      ? 'CT Smart Meter Detected'
      : 'Generation-Only · Appliance Load';

  return {
    isConnected,
    isTodayReading,
    plant,
    dailyLogs,
    brandLabel: plant ? INVERTER_BRAND_SHORT[plant.brand] : 'Not Connected',
    syncSourceLabel: plant ? SYNC_SOURCE_LABELS[plant.syncSource] : 'Weather Model',
    effectiveCapacityKwp,
    weatherPotentialGenKwh,
    weatherLiveKw,
    actualGenKwh,
    displayGenKwh,
    displayLiveKw,
    performanceRatioPct,
    hasSmartMeterActive,
    meterModeLabel,
    displayUsageKwh,
    displayLiveUsageKw,
    meteredUsageKwh,
    meteredExportKwh,
    meteredImportKwh,
    selfConsumedKwh,
    exportedKwh,
    importedKwh,
    netBalanceKwh,
    isSurplus,
    solarCoveragePercent,
    exportTariffInr,
    todaySelfSavingsInr,
    todayExportEarningsInr,
    todayTotalSavingsInr,
    todayCo2AvoidedKg,
    cumulativeLoggedGenKwh,
    cumulativeLoggedDays: dailyLogs.length,
  };
}
