import React, { useState, useEffect, useMemo } from 'react';
import {
  ScreenId,
  EstimatorInputs,
  Appliance,
  MaintenanceRecord,
  CustomerInstallationProfile,
  ExistingSystemInputs,
  WeatherCondition,
  UscHistoryEntry,
} from './types/solar';
import {
  DEFAULT_ESTIMATOR_INPUTS,
  INITIAL_APPLIANCES,
  INITIAL_MAINTENANCE_RECORDS,
  DEFAULT_CUSTOMER_PROFILE,
  DEFAULT_EXISTING_SYSTEM_INPUTS,
} from './data/defaultData';
import {
  calculateSolarSystemRequirements,
  calculateFinancialSavings,
  calculateApplianceEnergy,
} from './utils/solarMath';
import { fetchLiveSolarWeather, detectExactLocation } from './services/weatherService';
import {
  RealtimeTariffSyncResult,
  fetchRealtimeLocalTariff,
} from './services/tariffService';
import {
  FourStateId,
  computeExactDiscomBill,
  estimateUnitsFromExactBill,
} from './data/uscPortals';
import { AndroidFrame } from './components/AndroidFrame';
import { WeatherModal } from './components/WeatherModal';
import { ChangeLocationModal } from './components/ChangeLocationModal';
import { InverterSyncModal } from './components/InverterSyncModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { useFirebaseAuth } from './context/FirebaseContext';
import {
  canDeleteSharedUscEntry,
  deleteSharedUscHistoryEntry,
  saveSharedUscHistoryEntry,
  subscribeSharedUscHistory,
  toValidUscDocId,
} from './services/uscHistoryService';
import {
  canManageInverterPlant,
  deleteInverterPlantProfile,
  formatIstTimestamp,
  getLocalDateKey,
  resolveInverterTelemetry,
  saveInverterDailyLogs,
  saveInverterPlantProfile,
  subscribeInverterDailyLogs,
  subscribeSharedInverterPlants,
  toValidInverterPlantId,
  triggerCloudInverterSync,
} from './services/inverterSyncService';
import {
  InverterDailyLog,
  InverterPlantProfile,
} from './types/inverter';
import { resolveHistory12MonthAverage } from './utils/monthlyAverage';

// Screens
import { WelcomeScreen } from './screens/WelcomeScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { EstimatorScreen } from './screens/EstimatorScreen';
import { RequirementsScreen } from './screens/RequirementsScreen';
import { SavingsScreen } from './screens/SavingsScreen';
import { ApplianceScreen } from './screens/ApplianceScreen';
import { ShadowTrackerScreen } from './screens/ShadowTrackerScreen';
import { MaintenanceScreen } from './screens/MaintenanceScreen';
import { ExistingSystemScreen } from './screens/ExistingSystemScreen';
import { AndroidSourceExportScreen } from './screens/AndroidSourceExportScreen';
import { PowerGenerationCalcScreen } from './screens/PowerGenerationCalcScreen';
import { SunTrackerSuiteScreen } from './screens/SunTrackerSuiteScreen';

const STORAGE_KEYS = {
  INPUTS: 'solar_planner_inputs_v2',
  APPLIANCES: 'solar_planner_appliances_v2',
  MAINTENANCE: 'solar_planner_maintenance_v2',
  PROFILE: 'solar_planner_profile_v2',
  EXISTING: 'solar_planner_existing_v2',
  USC_HISTORY: 'solar_planner_usc_history_v1',
  INVERTER_PLANT: 'solar_planner_inverter_plant_v1',
  INVERTER_LOGS: 'solar_planner_inverter_logs_v1',
  WELCOME_SHOWN: 'solar_welcome_shown_v2',
};

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenId>('dashboard');
  const [roiTriggerNonce, setRoiTriggerNonce] = useState<number>(0);

  // Estimator Inputs State
  const [inputs, setInputs] = useState<EstimatorInputs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INPUTS);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_ESTIMATOR_INPUTS, ...parsed, currency: 'INR' };
      }
    } catch (e) {
      console.warn('Error reading stored inputs:', e);
    }
    return DEFAULT_ESTIMATOR_INPUTS;
  });

  // Appliances State
  const [appliances, setAppliances] = useState<Appliance[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.APPLIANCES);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading stored appliances:', e);
    }
    return INITIAL_APPLIANCES;
  });

  // Maintenance Records State
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MAINTENANCE);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading stored maintenance:', e);
    }
    return INITIAL_MAINTENANCE_RECORDS;
  });

  // Customer Profile State
  const [customerProfile, setCustomerProfile] = useState<CustomerInstallationProfile>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.PROFILE);
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.warn('Error reading stored profile:', e);
    }
    return DEFAULT_CUSTOMER_PROFILE;
  });

  // Existing System Audit Inputs State
  const [existingInputs, setExistingInputs] = useState<ExistingSystemInputs>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.EXISTING);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_EXISTING_SYSTEM_INPUTS, ...parsed, currency: 'INR' };
      }
    } catch (e) {
      console.warn('Error reading stored existing system inputs:', e);
    }
    return DEFAULT_EXISTING_SYSTEM_INPUTS;
  });

  const { user: firebaseUser, isAuthReady } = useFirebaseAuth();

  // Local cache of USC lookup history (offline / pre-sign-in buffer)
  const [localUscHistory, setLocalUscHistory] = useState<UscHistoryEntry[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.USC_HISTORY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {
      console.warn('Error reading stored USC history:', e);
    }
    return [];
  });

  // Real-time shared Firestore USC history visible across every browser & screen
  const [cloudUscHistory, setCloudUscHistory] = useState<UscHistoryEntry[]>([]);

  useEffect(() => {
    if (!isAuthReady) return;
    const unsubscribe = subscribeSharedUscHistory((sharedItems) => {
      setCloudUscHistory(sharedItems);
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  // Unified shared USC history: cloud entries merged with any unsynced local entries
  const uscHistory = useMemo<UscHistoryEntry[]>(() => {
    const byKey = new Map<string, UscHistoryEntry>();
    for (const item of cloudUscHistory) {
      const key = toValidUscDocId(item.uscNumber || item.id, item.stateId || 'telangana');
      byKey.set(key, { ...item, id: key, isCloudSynced: true });
    }
    for (const localItem of localUscHistory) {
      const key = toValidUscDocId(localItem.uscNumber || localItem.id, localItem.stateId || 'telangana');
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...localItem, id: key, isCloudSynced: false });
      } else if ((localItem.timestampIso || '') > (existing.timestampIso || '')) {
        byKey.set(key, { ...localItem, id: key, ownerId: existing.ownerId, isCloudSynced: existing.isCloudSynced });
      }
    }
    return Array.from(byKey.values())
      .sort((a, b) => (b.timestampIso || '').localeCompare(a.timestampIso || ''))
      .slice(0, 50);
  }, [cloudUscHistory, localUscHistory]);

  // Universal Solar Inverter Sync Hub state (local offline cache + Firestore cloud sync)
  const [localInverterPlant, setLocalInverterPlant] = useState<InverterPlantProfile | null>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INVERTER_PLANT);
      if (saved) return JSON.parse(saved) as InverterPlantProfile;
    } catch (e) {
      console.warn('Error reading stored inverter plant:', e);
    }
    return null;
  });

  const [localInverterLogs, setLocalInverterLogs] = useState<InverterDailyLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.INVERTER_LOGS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed as InverterDailyLog[];
      }
    } catch (e) {
      console.warn('Error reading stored inverter logs:', e);
    }
    return [];
  });

  const [cloudInverterPlants, setCloudInverterPlants] = useState<InverterPlantProfile[]>([]);
  const [cloudInverterLogs, setCloudInverterLogs] = useState<InverterDailyLog[]>([]);
  const [isInverterModalOpen, setIsInverterModalOpen] = useState(false);
  const [inverterModalInitialTab, setInverterModalInitialTab] = useState<
    'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs'
  >('cloud_api');
  const [isSyncingInverter, setIsSyncingInverter] = useState(false);

  // Real-time Firestore subscription to shared inverter plant profiles
  useEffect(() => {
    if (!isAuthReady) return;
    const unsubscribe = subscribeSharedInverterPlants((plants) => {
      setCloudInverterPlants(plants);
    });
    return () => unsubscribe();
  }, [isAuthReady]);

  // Resolved active inverter plant (prefers newest timestamp between local and Firestore cloud)
  const activeInverterPlant = useMemo<InverterPlantProfile | null>(() => {
    const cloudPrimary = cloudInverterPlants[0] || null;
    if (!localInverterPlant) return cloudPrimary;
    if (!cloudPrimary) return localInverterPlant;

    const matchingCloud = cloudInverterPlants.find((p) => p.id === localInverterPlant.id);
    if (matchingCloud) {
      return (matchingCloud.lastSyncedAtIso || '') >= (localInverterPlant.lastSyncedAtIso || '')
        ? matchingCloud
        : {
            ...localInverterPlant,
            ownerId: matchingCloud.ownerId,
            isCloudSynced: matchingCloud.isCloudSynced,
          };
    }

    return (cloudPrimary.lastSyncedAtIso || '') > (localInverterPlant.lastSyncedAtIso || '')
      ? cloudPrimary
      : localInverterPlant;
  }, [cloudInverterPlants, localInverterPlant]);

  const activeCloudPlantId = useMemo(() => {
    if (!activeInverterPlant?.id) return null;
    const match = cloudInverterPlants.find((p) => p.id === activeInverterPlant.id);
    return match ? match.id : null;
  }, [activeInverterPlant, cloudInverterPlants]);

  // Real-time Firestore subscription to date-keyed daily logs for the active cloud plant
  useEffect(() => {
    if (!isAuthReady || !activeCloudPlantId) {
      setCloudInverterLogs([]);
      return;
    }
    const unsubscribe = subscribeInverterDailyLogs(activeCloudPlantId, (logs) => {
      setCloudInverterLogs(logs);
    });
    return () => unsubscribe();
  }, [isAuthReady, activeCloudPlantId]);

  // Unified daily generation logs merged by dateKey (newest recordedAtIso wins)
  const mergedInverterLogs = useMemo<InverterDailyLog[]>(() => {
    const activeId = activeInverterPlant?.id;
    const byDate = new Map<string, InverterDailyLog>();

    for (const item of cloudInverterLogs) {
      if (activeId && item.plantId && item.plantId !== activeId) continue;
      byDate.set(item.dateKey, { ...item, isCloudSynced: true });
    }
    for (const item of localInverterLogs) {
      if (activeId && item.plantId && item.plantId !== activeId) continue;
      const existing = byDate.get(item.dateKey);
      if (!existing) {
        byDate.set(item.dateKey, { ...item, isCloudSynced: false });
      } else if ((item.recordedAtIso || '') > (existing.recordedAtIso || '')) {
        byDate.set(item.dateKey, {
          ...item,
          ownerId: existing.ownerId,
          isCloudSynced: existing.isCloudSynced,
        });
      }
    }

    return Array.from(byDate.values())
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
      .slice(0, 120);
  }, [cloudInverterLogs, localInverterLogs, activeInverterPlant]);

  // Live Weather & Solar Irradiance State
  const [weather, setWeather] = useState<WeatherCondition>({
    city: 'Hyderabad, Telangana',
    latitude: 17.41,
    longitude: 78.44,
    temperatureC: 28,
    apparentTempC: 30,
    cloudCoverPercent: 18,
    uvIndex: 7.8,
    weatherCode: 1,
    weatherDescription: 'Clear / Optimal Sun',
    directNormalIrradianceWpm2: 850,
    globalHorizontalIrradianceWpm2: 910,
    sunshineDurationHours: 8.8,
    sunrise: '06:15',
    sunset: '18:25',
    peakSunHoursEstimated: 5.5,
    cloudImpactRatio: 0.9,
    isLive: false,
    lastUpdated: 'Initialising...',
  });

  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState(false);
  const [isChangeLocationOpen, setIsChangeLocationOpen] = useState(false);
  const [isWeatherLoading, setIsWeatherLoading] = useState(false);

  // Persistence effects
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.INPUTS, JSON.stringify(inputs));
    } catch {}
  }, [inputs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.APPLIANCES, JSON.stringify(appliances));
    } catch {}
  }, [appliances]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(maintenanceRecords));
    } catch {}
  }, [maintenanceRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(customerProfile));
    } catch {}
  }, [customerProfile]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.EXISTING, JSON.stringify(existingInputs));
    } catch {}
  }, [existingInputs]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.USC_HISTORY, JSON.stringify(localUscHistory));
    } catch {}
  }, [localUscHistory]);

  useEffect(() => {
    try {
      if (localInverterPlant) {
        localStorage.setItem(STORAGE_KEYS.INVERTER_PLANT, JSON.stringify(localInverterPlant));
      } else {
        localStorage.removeItem(STORAGE_KEYS.INVERTER_PLANT);
      }
    } catch {}
  }, [localInverterPlant]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.INVERTER_LOGS, JSON.stringify(localInverterLogs));
    } catch {}
  }, [localInverterLogs]);

  // Auto-migrate local-only inverter plant & daily logs to Firestore when a verified Google user signs in
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || !localInverterPlant) return;
    const cloudMatch = cloudInverterPlants.find((p) => p.id === localInverterPlant.id);
    const needsPlantSync =
      !cloudMatch ||
      (localInverterPlant.lastSyncedAtIso || '') > (cloudMatch.lastSyncedAtIso || '');

    const cloudLogMap = new Map(cloudInverterLogs.map((l) => [l.dateKey, l]));
    const unsyncedLogs = localInverterLogs.filter((l) => {
      if (l.plantId && l.plantId !== localInverterPlant.id) return false;
      const match = cloudLogMap.get(l.dateKey);
      if (!match) return true;
      return (l.recordedAtIso || '') > (match.recordedAtIso || '');
    });

    if (!needsPlantSync && unsyncedLogs.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        let plantIdToUse = localInverterPlant.id;
        if (needsPlantSync) {
          const res = await saveInverterPlantProfile(localInverterPlant);
          if (cancelled) return;
          if (!res.saved) return;
          plantIdToUse = res.plantId || localInverterPlant.id;
        }
        if (unsyncedLogs.length > 0 && !cancelled) {
          await saveInverterDailyLogs(plantIdToUse, unsyncedLogs);
        }
        if (!cancelled) {
          setSyncToast('Synced inverter plant & daily logs to Firestore cloud');
          setTimeout(() => setSyncToast(null), 3500);
        }
      } catch (err) {
        console.warn('Failed to migrate local inverter data to Firestore:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    firebaseUser,
    localInverterPlant,
    localInverterLogs,
    cloudInverterPlants,
    cloudInverterLogs,
  ]);

  // Automatically publish any local-only USC history entries to shared Firestore when a verified Google user signs in
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified || localUscHistory.length === 0) return;
    const cloudKeyMap = new Map(
      cloudUscHistory.map((item) => [
        toValidUscDocId(item.uscNumber || item.id, item.stateId || 'telangana'),
        item,
      ])
    );
    const unsynced = localUscHistory.filter((localItem) => {
      if (!localItem.uscNumber) return false;
      const key = toValidUscDocId(localItem.uscNumber, localItem.stateId || 'telangana');
      const cloudMatch = cloudKeyMap.get(key);
      if (!cloudMatch) return true;
      return (localItem.timestampIso || '') > (cloudMatch.timestampIso || '');
    });
    if (unsynced.length === 0) return;

    let cancelled = false;
    (async () => {
      let syncedCount = 0;
      for (const item of unsynced) {
        if (cancelled) break;
        try {
          const res = await saveSharedUscHistoryEntry(item);
          if (res.saved) syncedCount++;
        } catch (err) {
          console.warn('Failed to migrate local USC history item to Firestore:', err);
        }
      }
      if (!cancelled && syncedCount > 0) {
        setSyncToast(`Synced ${syncedCount} USC account${syncedCount > 1 ? 's' : ''} to shared cloud history`);
        setTimeout(() => setSyncToast(null), 3500);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [firebaseUser, localUscHistory, cloudUscHistory]);

  const recordUscHistory = (entry: UscHistoryEntry) => {
    const keyUsc = (entry.uscNumber || '').trim().toUpperCase();
    if (!keyUsc) return;
    const normalizedId = toValidUscDocId(keyUsc, entry.stateId || 'telangana');
    const normalizedEntry: UscHistoryEntry = {
      ...entry,
      id: normalizedId,
      uscNumber: keyUsc,
    };

    setLocalUscHistory((prev) => {
      const filtered = prev.filter((item) => {
        const itemId = toValidUscDocId(item.uscNumber || item.id, item.stateId || 'telangana');
        return itemId !== normalizedId;
      });
      return [normalizedEntry, ...filtered].slice(0, 30);
    });

    if (firebaseUser && firebaseUser.emailVerified) {
      saveSharedUscHistoryEntry(normalizedEntry)
        .then((res) => {
          if (res.saved) {
            setSyncToast(`Saved USC #${keyUsc} to shared history (visible across all browsers)`);
            setTimeout(() => setSyncToast(null), 3200);
          }
        })
        .catch((err) => {
          console.error('Error syncing USC history to Firestore:', err);
        });
    } else {
      setSyncToast(`Saved USC #${keyUsc} locally · Sign in with Google to share across browsers`);
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  const removeUscHistory = (id: string) => {
    const target = uscHistory.find((item) => item.id === id);
    setLocalUscHistory((prev) =>
      prev.filter((item) => {
        const itemId = toValidUscDocId(item.uscNumber || item.id, item.stateId || 'telangana');
        return item.id !== id && itemId !== id;
      })
    );
    if (target?.isCloudSynced && canDeleteSharedUscEntry(target, firebaseUser)) {
      deleteSharedUscHistoryEntry(target.id).catch((err) => {
        console.error('Error deleting shared USC history entry:', err);
      });
    }
  };

  const handleOpenUscHistoryInEstimator = (item: UscHistoryEntry) => {
    const avg12 = resolveHistory12MonthAverage(item);
    const effectiveRate =
      avg12.avgMonthlyUnits > 0 && avg12.avgMonthlyBill > 0
        ? Number((avg12.avgMonthlyBill / avg12.avgMonthlyUnits).toFixed(2))
        : undefined;
    setInputs((prev) => ({
      ...prev,
      uscNumber: item.uscNumber || prev.uscNumber,
      uscStateId: item.stateId || prev.uscStateId,
      uscDiscomId: item.discomId || prev.uscDiscomId,
      state: item.stateName || prev.state,
      discom: item.discomShortName || prev.discom,
      monthlyUnits: avg12.avgMonthlyUnits || prev.monthlyUnits,
      monthlyBill: avg12.avgMonthlyBill || prev.monthlyBill,
      ...(effectiveRate ? { tariffPerKwh: effectiveRate } : {}),
      ...(item.sanctionedLoadKw ? { sanctionedLoadKw: item.sanctionedLoadKw } : {}),
      ...(item.months && item.months.length > 0 ? { monthlyHistory12: item.months } : {}),
    }));
    setCurrentScreen('estimator');
  };

  const handleOpenUscHistoryInAudit = (item: UscHistoryEntry) => {
    const avg12 = resolveHistory12MonthAverage(item);
    const latest =
      item.months && item.months.length > 0
        ? [...item.months].reverse().find((m) => m.unitsKwh > 0 || m.billAmountInr > 0) ||
          item.months[item.months.length - 1]
        : null;
    setExistingInputs((prev) => ({
      ...prev,
      uscNumber: item.uscNumber || '',
      stateId: item.stateId,
      discomId: item.discomId,
      gridImportKwh: latest?.unitsKwh || avg12.avgMonthlyUnits,
      currentMonthlyBill: latest?.billAmountInr || avg12.avgMonthlyBill,
      auditedMonths: item.months,
    }));
    setCurrentScreen('existing');
  };

  // Hourly auto-sync state and last updated timestamp
  const [isHourlySyncEnabled, setIsHourlySyncEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem('solar_auto_sync_hourly') !== 'false';
    } catch {
      return true;
    }
  });

  const [lastSyncedTime, setLastSyncedTime] = useState<string>(() => {
    try {
      return (
        localStorage.getItem('solar_last_synced_time') ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  });

  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [liveTariff, setLiveTariff] = useState<RealtimeTariffSyncResult | null>(null);
  const [isSyncingTariff, setIsSyncingTariff] = useState<boolean>(false);

  const syncLocalUtilityTariff = async (opts?: {
    city?: string;
    lat?: number;
    lon?: number;
    providerId?: string;
    category?: 'residential' | 'commercial' | 'agricultural';
    monthlyUnits?: number;
    sanctionedLoadKw?: number;
    applyRate?: boolean;
  }) => {
    setIsSyncingTariff(true);
    try {
      const result = await fetchRealtimeLocalTariff({
        city: opts?.city ?? weather.city,
        stateName: inputs.state,
        providerId: opts?.providerId ?? inputs.uscDiscomId ?? inputs.discom,
        consumerCategory: opts?.category ?? inputs.consumerCategory,
        monthlyUnits: opts?.monthlyUnits ?? inputs.monthlyUnits,
        sanctionedLoadKw: opts?.sanctionedLoadKw ?? inputs.sanctionedLoadKw,
        latitude: opts?.lat ?? weather.latitude,
        longitude: opts?.lon ?? weather.longitude,
      });
      setLiveTariff(result);
      setInputs((prev) => {
        const shouldApplyRate = opts?.applyRate !== false;
        if (!shouldApplyRate) {
          return {
            ...prev,
            state: result.stateName,
            discom: result.providerShortName,
            uscStateId: result.stateId,
            uscDiscomId: result.providerId,
            feedInTariffPerKwh: result.feedInTariffPerKwh,
          };
        }

        const gridCat = prev.consumerCategory === 'commercial' ? 'commercial' : 'domestic';
        const sanctionedKw = Math.max(1, prev.sanctionedLoadKw || 4);
        if (prev.calculationBasis === 'bill' && prev.monthlyBill > 0) {
          const syncedUnits = Math.max(
            1,
            estimateUnitsFromExactBill(
              prev.monthlyBill,
              result.stateId as FourStateId,
              gridCat,
              sanctionedKw
            )
          );
          const syncedRate = Number((prev.monthlyBill / syncedUnits).toFixed(2));
          return {
            ...prev,
            state: result.stateName,
            discom: result.providerShortName,
            uscStateId: result.stateId,
            uscDiscomId: result.providerId,
            feedInTariffPerKwh: result.feedInTariffPerKwh,
            monthlyUnits: syncedUnits,
            tariffPerKwh: syncedRate,
          };
        }

        return {
          ...prev,
          state: result.stateName,
          discom: result.providerShortName,
          uscStateId: result.stateId,
          uscDiscomId: result.providerId,
          feedInTariffPerKwh: result.feedInTariffPerKwh,
          tariffPerKwh: result.blendedRatePerKwh,
          monthlyBill: result.estimatedMonthlyBillInr,
        };
      });
      return result;
    } finally {
      setIsSyncingTariff(false);
    }
  };

  // Initial and on-demand live weather & solar radiation + local utility tariff fetch
  const refreshWeather = async (lat = weather.latitude, lon = weather.longitude, city = weather.city) => {
    setIsWeatherLoading(true);
    try {
      const data = await fetchLiveSolarWeather(lat, lon, city);
      setWeather(data);
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setLastSyncedTime(timeStr);
      try {
        localStorage.setItem('solar_last_synced_time', timeStr);
      } catch {}
      // Fine-tune peak sun hours in estimator if untouched
      setInputs((prev) => ({
        ...prev,
        peakSunHours: data.peakSunHoursEstimated,
        locationName: city,
      }));
      setCustomerProfile((prev) => ({
        ...prev,
        city: city,
      }));
      // Synchronize local utility provider & real-time regulatory tariff for the new location
      await syncLocalUtilityTariff({
        city,
        lat,
        lon,
        applyRate: !inputs.monthlyHistory12?.length && !inputs.uscNumber,
      });
    } finally {
      setIsWeatherLoading(false);
    }
  };

  const handleManualSync = async () => {
    await refreshWeather();
    if (activeInverterPlant && activeInverterPlant.syncSource === 'cloud_api') {
      await handleQuickInverterSync({ silentIfUnconfigured: true });
      setSyncToast('Weather, Peak Sun, Tariff & Inverter Synchronized');
    } else {
      setSyncToast('Weather, Peak Sun & Govt Tariff Synchronized Live');
    }
    setTimeout(() => setSyncToast(null), 3000);
  };

  const handleExplicitTariffSync = async () => {
    const res = await syncLocalUtilityTariff({ applyRate: true });
    if (res) {
      setSyncToast(`Synced ${res.providerShortName} (${res.regulatorName}): ₹${res.blendedRatePerKwh}/kWh`);
      setTimeout(() => setSyncToast(null), 3000);
    }
  };

  const handleToggleHourlySync = (enabled: boolean) => {
    setIsHourlySyncEnabled(enabled);
    try {
      localStorage.setItem('solar_auto_sync_hourly', enabled ? 'true' : 'false');
    } catch {}
    setSyncToast(enabled ? 'Hourly Auto-Sync Enabled (every 60 min)' : 'Hourly Auto-Sync Disabled');
    setTimeout(() => setSyncToast(null), 3000);
  };

  useEffect(() => {
    refreshWeather();
  }, []);

  // Recurring 1-hour interval for auto-refreshing weather and peak sun data
  useEffect(() => {
    if (!isHourlySyncEnabled) return;
    const ONE_HOUR_MS = 60 * 60 * 1000;
    const timer = setInterval(() => {
      refreshWeather();
    }, ONE_HOUR_MS);
    return () => clearInterval(timer);
  }, [isHourlySyncEnabled, weather.latitude, weather.longitude, weather.city]);

  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [locationDetectToast, setLocationDetectToast] = useState<string | null>(null);

  const handleDetectLocation = async () => {
    if (isDetectingLocation) return;
    setIsDetectingLocation(true);
    setLocationDetectToast('Detecting location...');
    try {
      const res = await detectExactLocation();
      setLocationDetectToast(`Located: ${res.cityName}`);
      await refreshWeather(res.latitude, res.longitude, res.cityName);
      setTimeout(() => setLocationDetectToast(null), 3000);
    } catch (err) {
      console.warn('Location detection failed:', err);
      setLocationDetectToast('Location detection error. Please select manually.');
      setTimeout(() => setLocationDetectToast(null), 3000);
    } finally {
      setIsDetectingLocation(false);
    }
  };

  // Sizing & Financial Math
  const requirements = calculateSolarSystemRequirements(inputs);
  const savings = calculateFinancialSavings(inputs, requirements);
  const applianceTotals = calculateApplianceEnergy(
    appliances,
    inputs.phaseType || 'single_phase',
    inputs.consumerCategory || 'residential'
  );

  // Unified Inverter Telemetry (drives WelcomeScreen, DashboardScreen, Hero, 4 cards & 4 detail modals)
  const resolvedInverterTelemetry = useMemo(
    () =>
      resolveInverterTelemetry({
        plant: activeInverterPlant,
        dailyLogs: mergedInverterLogs,
        weather,
        fallbackCapacityKwp:
          requirements.recommendedCapacityKwp || customerProfile.systemCapacityKwp || 5.0,
        applianceDailyKwh: applianceTotals.dailyKwh,
        electricityRate: inputs.tariffPerKwh || 7.5,
        defaultExportTariffInr: inputs.feedInTariffPerKwh || 3.1,
      }),
    [
      activeInverterPlant,
      mergedInverterLogs,
      weather,
      requirements.recommendedCapacityKwp,
      customerProfile.systemCapacityKwp,
      applianceTotals.dailyKwh,
      inputs.tariffPerKwh,
      inputs.feedInTariffPerKwh,
    ]
  );

  const handleOpenInverterHub = (
    tab?: 'cloud_api' | 'csv_import' | 'manual_entry' | 'daily_logs'
  ) => {
    setInverterModalInitialTab(tab || 'cloud_api');
    setIsInverterModalOpen(true);
  };

  const handleSaveInverterPlantAndLogs = async (
    nextPlant: InverterPlantProfile,
    newLogs?: InverterDailyLog[]
  ) => {
    const normalizedId =
      nextPlant.id ||
      toValidInverterPlantId(
        nextPlant.brand,
        nextPlant.stationId || nextPlant.loggerSerial,
        nextPlant.plantName
      );
    const normalizedPlant: InverterPlantProfile = {
      ...nextPlant,
      id: normalizedId,
      visibility: 'public',
    };

    const normalizedNewLogs: InverterDailyLog[] = (newLogs || []).map((log) => ({
      ...log,
      plantId: normalizedId,
      visibility: 'public',
    }));

    setLocalInverterPlant(normalizedPlant);
    if (normalizedNewLogs.length > 0) {
      setLocalInverterLogs((prev) => {
        const byDate = new Map<string, InverterDailyLog>();
        for (const existing of prev) {
          if (existing.plantId === normalizedId || !existing.plantId) {
            byDate.set(existing.dateKey, existing);
          }
        }
        for (const incoming of normalizedNewLogs) {
          byDate.set(incoming.dateKey, incoming);
        }
        return Array.from(byDate.values())
          .sort((a, b) => b.dateKey.localeCompare(a.dateKey))
          .slice(0, 120);
      });
    }

    if (typeof normalizedPlant.exportTariffInr === 'number' && normalizedPlant.exportTariffInr >= 0) {
      setInputs((prev) =>
        prev.feedInTariffPerKwh === normalizedPlant.exportTariffInr
          ? prev
          : { ...prev, feedInTariffPerKwh: normalizedPlant.exportTariffInr }
      );
    }
    if (normalizedPlant.installedCapacityKwp > 0) {
      setCustomerProfile((prev) =>
        prev.systemCapacityKwp === normalizedPlant.installedCapacityKwp
          ? prev
          : { ...prev, systemCapacityKwp: normalizedPlant.installedCapacityKwp }
      );
    }

    if (firebaseUser && firebaseUser.emailVerified) {
      try {
        const plantRes = await saveInverterPlantProfile(normalizedPlant);
        if (plantRes.saved) {
          let logsSaved = 0;
          if (normalizedNewLogs.length > 0) {
            const logsRes = await saveInverterDailyLogs(
              plantRes.plantId || normalizedId,
              normalizedNewLogs
            );
            logsSaved = logsRes.savedCount;
          }
          setSyncToast(
            logsSaved > 0
              ? `Inverter synced to Firestore (${logsSaved} daily log${logsSaved > 1 ? 's' : ''} saved)`
              : `Inverter plant synced to Firestore across devices`
          );
          setTimeout(() => setSyncToast(null), 3500);
        } else if (plantRes.reason === 'not_owner') {
          setSyncToast('Saved locally · Sign in as plant owner to update shared cloud record');
          setTimeout(() => setSyncToast(null), 4000);
        }
      } catch (err) {
        console.error('Error syncing inverter plant to Firestore:', err);
        setSyncToast('Saved locally · Firestore sync retry pending');
        setTimeout(() => setSyncToast(null), 3500);
      }
    } else {
      setSyncToast('Inverter telemetry saved locally · Sign in with Google to sync across devices');
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  const handleQuickInverterSync = async (opts?: { silentIfUnconfigured?: boolean }) => {
    if (!activeInverterPlant) {
      if (!opts?.silentIfUnconfigured) {
        handleOpenInverterHub('cloud_api');
      }
      return;
    }

    if (activeInverterPlant.syncSource !== 'cloud_api') {
      if (!opts?.silentIfUnconfigured) {
        handleOpenInverterHub(activeInverterPlant.syncSource);
      }
      return;
    }

    setIsSyncingInverter(true);
    try {
      const res = await triggerCloudInverterSync({
        brand: activeInverterPlant.brand,
        stationId: activeInverterPlant.stationId,
        loggerSerial: activeInverterPlant.loggerSerial,
        installedCapacityKwp: activeInverterPlant.installedCapacityKwp,
        meterMode: activeInverterPlant.meterMode,
      });

      if (res.ok && res.telemetry) {
        const t = res.telemetry;
        const now = new Date();
        const nowIso = t.syncedAtIso || now.toISOString();
        const dateKey = t.dateKey || getLocalDateKey(now);
        const weatherPot = resolvedInverterTelemetry.weatherPotentialGenKwh;
        const prPct =
          weatherPot > 0
            ? Number(Math.min(200, (t.todayGenKwh / weatherPot) * 100).toFixed(1))
            : undefined;

        const updatedPlant: InverterPlantProfile = {
          ...activeInverterPlant,
          hasSyncedData: true,
          todayDateKey: dateKey,
          todayGenKwh: t.todayGenKwh,
          livePowerKw: t.livePowerKw,
          todayUsageKwh: t.todayUsageKwh,
          todayExportKwh: t.todayExportKwh,
          todayImportKwh: t.todayImportKwh,
          lifetimeKwh: t.lifetimeKwh ?? activeInverterPlant.lifetimeKwh,
          hasSmartMeter: t.hasSmartMeter,
          syncSource: 'cloud_api',
          lastSyncedAtIso: nowIso,
          lastSyncedAtIst: t.syncedAtIst || formatIstTimestamp(now),
          statusNote: t.statusNote || 'Live Cloud API Sync',
        };

        const todayLog: InverterDailyLog = {
          dateKey,
          plantId: updatedPlant.id,
          generationKwh: t.todayGenKwh,
          consumptionKwh: t.todayUsageKwh,
          exportKwh: t.todayExportKwh,
          importKwh: t.todayImportKwh,
          peakPowerKw: t.livePowerKw,
          weatherPotentialKwh: weatherPot,
          performanceRatioPct: prPct,
          hasSmartMeter: t.hasSmartMeter,
          syncSource: 'cloud_api',
          recordedAtIso: nowIso,
          visibility: 'public',
        };

        await handleSaveInverterPlantAndLogs(updatedPlant, [todayLog]);
      } else if (res.needsServerCredentials) {
        if (!opts?.silentIfUnconfigured) {
          setSyncToast(
            'Cloud API credentials not set on server yet · Use CSV Import or Quick Meter Entry'
          );
          setTimeout(() => setSyncToast(null), 4200);
          handleOpenInverterHub('cloud_api');
        }
      } else if (!opts?.silentIfUnconfigured) {
        setSyncToast(res.error || 'Inverter sync could not reach cloud portal');
        setTimeout(() => setSyncToast(null), 4000);
      }
    } finally {
      setIsSyncingInverter(false);
    }
  };

  const handleDisconnectInverterPlant = async () => {
    const target = activeInverterPlant;
    setLocalInverterPlant(null);
    setLocalInverterLogs([]);
    setCloudInverterLogs([]);
    if (target?.isCloudSynced && canManageInverterPlant(target, firebaseUser)) {
      try {
        await deleteInverterPlantProfile(target.id);
      } catch (err) {
        console.error('Error removing inverter plant from Firestore:', err);
      }
    }
    setIsInverterModalOpen(false);
    setSyncToast('Disconnected inverter plant · Returned to live weather estimate');
    setTimeout(() => setSyncToast(null), 3500);
  };

  // Optional background Cloud API auto-sync interval when user configures autoSyncMinutes > 0
  useEffect(() => {
    if (
      !activeInverterPlant ||
      activeInverterPlant.syncSource !== 'cloud_api' ||
      !activeInverterPlant.autoSyncMinutes ||
      activeInverterPlant.autoSyncMinutes <= 0
    ) {
      return;
    }
    const intervalMs = activeInverterPlant.autoSyncMinutes * 60 * 1000;
    const timer = setInterval(() => {
      handleQuickInverterSync({ silentIfUnconfigured: true });
    }, intervalMs);
    return () => clearInterval(timer);
  }, [
    activeInverterPlant?.id,
    activeInverterPlant?.syncSource,
    activeInverterPlant?.autoSyncMinutes,
  ]);

  const handleUpdateInputs = (updated: Partial<EstimatorInputs>) => {
    setInputs((prev) => ({ ...prev, ...updated, currency: 'INR' }));
  };

  const handleTransferAppliances = (monthlyKwh: number) => {
    setInputs((prev) => {
      const st = (prev.uscStateId || prev.state || '').toLowerCase();
      const stateId: FourStateId = st.includes('andhra')
        ? 'andhra_pradesh'
        : st.includes('odis') || st.includes('orissa')
        ? 'odissa'
        : st.includes('chandigarh')
        ? 'chandigarh'
        : 'telangana';
      const gridCat = prev.consumerCategory === 'commercial' ? 'commercial' : 'domestic';
      const sanctionedKw = Math.max(3, Math.ceil(applianceTotals.connectedLoadKw));
      const exactBill = computeExactDiscomBill(monthlyKwh, stateId, gridCat, sanctionedKw);
      const blendedRate =
        monthlyKwh > 0 ? Number((exactBill / monthlyKwh).toFixed(2)) : prev.tariffPerKwh || 7.15;
      return {
        ...prev,
        currency: 'INR',
        calculationBasis: 'units',
        monthlyUnits: monthlyKwh,
        monthlyBill: exactBill,
        tariffPerKwh: blendedRate,
        sanctionedLoadKw: sanctionedKw,
      };
    });
  };

  const handleUpdateApplianceModuleStandard = (standard: 'DCR' | 'NON_DCR') => {
    setInputs((prev) => ({
      ...prev,
      moduleStandard: standard,
    }));
  };

  const handleUpdateApplianceSystemOption = (
    nextSystemType: 'on-grid' | 'off-grid' | 'hybrid',
    backupHours?: number
  ) => {
    setInputs((prev) => {
      const resolvedBackup =
        typeof backupHours === 'number'
          ? backupHours
          : nextSystemType === 'on-grid'
          ? 0
          : prev.batteryBackupHours > 0
          ? prev.batteryBackupHours
          : 0;

      return {
        ...prev,
        systemType: nextSystemType,
        requiresBattery: nextSystemType !== 'on-grid',
        enableGridExport: nextSystemType !== 'off-grid',
        batteryBackupHours: nextSystemType === 'on-grid' ? 0 : Math.max(0, resolvedBackup),
      };
    });
  };

  const handleUpdateAppliancePhase = (phase: 'single_phase' | 'three_phase') => {
    const nextTotals = calculateApplianceEnergy(
      appliances,
      phase,
      inputs.consumerCategory || 'residential'
    );
    setInputs((prev) => ({
      ...prev,
      phaseType: phase,
      monthlyUnits: nextTotals.monthlyKwh,
      monthlyBill: Math.round(nextTotals.monthlyKwh * (prev.tariffPerKwh || 7.8)),
      sanctionedLoadKw: Math.max(3, Math.ceil(nextTotals.connectedLoadKw)),
    }));
    setCustomerProfile((prev) => ({
      ...prev,
      phaseType: phase === 'three_phase' ? 'Three Phase' : 'Single Phase',
    }));
  };

  const handleUpdateApplianceApplication = (
    cat: 'residential' | 'commercial' | 'agricultural',
    nextPhase: 'single_phase' | 'three_phase'
  ) => {
    const nextTotals = calculateApplianceEnergy(appliances, nextPhase, cat);
    setInputs((prev) => ({
      ...prev,
      consumerCategory: cat,
      phaseType: nextPhase,
      monthlyUnits: nextTotals.monthlyKwh,
      monthlyBill: Math.round(nextTotals.monthlyKwh * (prev.tariffPerKwh || 7.8)),
      sanctionedLoadKw: Math.max(3, Math.ceil(nextTotals.connectedLoadKw)),
    }));
    setCustomerProfile((prev) => ({
      ...prev,
      phaseType: nextPhase === 'three_phase' ? 'Three Phase' : 'Single Phase',
    }));
  };

  const handleSyncApplianceList = (
    nextList: Appliance[],
    phaseOverride?: 'single_phase' | 'three_phase'
  ) => {
    setAppliances(nextList);
    const activePhase = phaseOverride || inputs.phaseType || 'single_phase';
    const nextTotals = calculateApplianceEnergy(
      nextList,
      activePhase,
      inputs.consumerCategory || 'residential'
    );
    setInputs((prev) => ({
      ...prev,
      phaseType: activePhase,
      monthlyUnits: nextTotals.monthlyKwh,
      monthlyBill: Math.round(nextTotals.monthlyKwh * (prev.tariffPerKwh || 7.8)),
      sanctionedLoadKw: Math.max(3, Math.ceil(nextTotals.connectedLoadKw)),
    }));
    if (phaseOverride) {
      setCustomerProfile((prev) => ({
        ...prev,
        phaseType: phaseOverride === 'three_phase' ? 'Three Phase' : 'Single Phase',
      }));
    }
  };

  const handleSelectLocation = (lat: number, lon: number, cityName?: string) => {
    refreshWeather(lat, lon, cityName || `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`);
  };

  const handleUpdateTariff = (rate: number, _pr: number, _stateName: string) => {
    setInputs((prev) => ({
      ...prev,
      tariffPerKwh: rate,
    }));
  };

  return (
    <>
      {locationDetectToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 text-white text-xs px-4 py-2.5 rounded-2xl shadow-2xl border border-sky-500/50 flex items-center gap-2 backdrop-blur-md animate-bounce-once">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{locationDetectToast}</span>
        </div>
      )}

      {syncToast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-sky-900/95 text-white text-xs px-4 py-2 rounded-2xl shadow-2xl border border-sky-400/50 flex items-center gap-2 backdrop-blur-md animate-bounce-once">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-semibold">{syncToast}</span>
        </div>
      )}

      <AndroidFrame
        currentScreen={currentScreen}
        onNavigate={setCurrentScreen}
        weather={weather}
        onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
      >
        {currentScreen === 'welcome' && (
          <WelcomeScreen
            onStart={() => setCurrentScreen('dashboard')}
            onNavigate={setCurrentScreen}
            weather={weather}
            customerProfile={customerProfile}
            applianceDailyKwh={applianceTotals.dailyKwh}
            electricityRate={inputs.tariffPerKwh}
            systemCapacityKwp={requirements.recommendedCapacityKwp}
            currency={inputs.currency}
            applianceCount={appliances.length}
            isSyncing={isWeatherLoading}
            onSyncNow={handleManualSync}
            isHourlySyncEnabled={isHourlySyncEnabled}
            onToggleHourlySync={handleToggleHourlySync}
            lastSyncedTime={lastSyncedTime}
            onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
            onOpenChangeLocation={() => setIsChangeLocationOpen(true)}
            onOpenAndroidCode={() => setCurrentScreen('android_code')}
            onUpdateProfile={setCustomerProfile}
            onUpdateTariff={handleUpdateTariff}
            inverterTelemetry={resolvedInverterTelemetry}
            onOpenInverterHub={handleOpenInverterHub}
            onQuickInverterSync={() => handleQuickInverterSync()}
            isSyncingInverter={isSyncingInverter}
          />
        )}

        {currentScreen === 'dashboard' && (
          <DashboardScreen
            weather={weather}
            onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
            onOpenChangeLocation={() => setIsChangeLocationOpen(true)}
            onNavigate={setCurrentScreen}
            customerProfile={customerProfile}
            applianceCount={appliances.length}
            maintenanceRecordCount={maintenanceRecords.length}
            savings={savings}
            requirements={requirements}
            currency={inputs.currency}
            applianceDailyKwh={applianceTotals.dailyKwh}
            electricityRate={inputs.tariffPerKwh}
            onDetectLocation={handleDetectLocation}
            isDetectingLocation={isDetectingLocation}
            isSyncing={isWeatherLoading}
            onSyncNow={handleManualSync}
            isHourlySyncEnabled={isHourlySyncEnabled}
            onToggleHourlySync={handleToggleHourlySync}
            lastSyncedTime={lastSyncedTime}
            onUpdateCurrency={() => setInputs((prev) => ({ ...prev, currency: 'INR' }))}
            onUpdateProfile={setCustomerProfile}
            onUpdateTariff={handleUpdateTariff}
            estimatorInputs={inputs}
            onUpdateInputs={handleUpdateInputs}
            liveTariff={liveTariff}
            isSyncingTariff={isSyncingTariff}
            onSyncTariff={handleExplicitTariffSync}
            uscHistory={uscHistory}
            onOpenUscInEstimator={handleOpenUscHistoryInEstimator}
            onOpenUscInAudit={handleOpenUscHistoryInAudit}
            inverterTelemetry={resolvedInverterTelemetry}
            onOpenInverterHub={handleOpenInverterHub}
            onQuickInverterSync={() => handleQuickInverterSync()}
            isSyncingInverter={isSyncingInverter}
            onResetData={() => {
              localStorage.clear();
              window.location.reload();
            }}
          />
        )}

        {currentScreen === 'estimator' && (
          <EstimatorScreen
            inputs={inputs}
            onUpdateInputs={handleUpdateInputs}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            onOpenChangeLocation={() => setIsChangeLocationOpen(true)}
            applianceMonthlyKwh={applianceTotals.monthlyKwh}
            onDetectLocation={handleDetectLocation}
            isDetectingLocation={isDetectingLocation}
            onUpdateLocation={handleSelectLocation}
            existingInputs={existingInputs}
            onUpdateExistingInputs={(up) => setExistingInputs((prev) => ({ ...prev, ...up }))}
            uscHistory={uscHistory}
            onRecordUscHistory={recordUscHistory}
            onRemoveUscHistory={removeUscHistory}
            roiTriggerNonce={roiTriggerNonce}
            liveTariff={liveTariff}
            isSyncingTariff={isSyncingTariff}
            onSyncLocalTariff={handleExplicitTariffSync}
            onCalibrateFromAudit={(avgUnits, avgBill, blendedTariff) => {
              setInputs((prev) => ({
                ...prev,
                monthlyUnits: avgUnits,
                monthlyBill: avgBill,
                tariffPerKwh: blendedTariff,
              }));
              setSyncToast(`Audit calibrated estimator: ${avgUnits} kWh/mo · ₹${blendedTariff}/kWh`);
              setTimeout(() => setSyncToast(null), 3000);
            }}
          />
        )}

        {currentScreen === 'requirements' && (
          <RequirementsScreen
            inputs={inputs}
            requirements={requirements}
            savings={savings}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            onUpdateInputs={handleUpdateInputs}
          />
        )}

        {currentScreen === 'savings' && (
          <SavingsScreen
            inputs={inputs}
            requirements={requirements}
            savings={savings}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            onOpenRoiDashboard={() => {
              setRoiTriggerNonce((n) => n + 1);
              setCurrentScreen('estimator');
            }}
          />
        )}

        {currentScreen === 'appliances' && (
          <ApplianceScreen
            appliances={appliances}
            onUpdateAppliances={handleSyncApplianceList}
            onTransferToEstimator={handleTransferAppliances}
            phaseType={inputs.phaseType || 'single_phase'}
            consumerCategory={inputs.consumerCategory || 'residential'}
            moduleStandard={inputs.moduleStandard || 'DCR'}
            systemType={inputs.systemType || 'on-grid'}
            batteryBackupHours={inputs.batteryBackupHours ?? 0}
            currency="INR"
            tariffPerKwh={inputs.tariffPerKwh || 7.8}
            peakSunHours={inputs.peakSunHours || 5.5}
            panelWattage={inputs.panelWattage || 550}
            onUpdatePhaseType={handleUpdateAppliancePhase}
            onUpdateApplicationCategory={handleUpdateApplianceApplication}
            onUpdateModuleStandard={handleUpdateApplianceModuleStandard}
            onUpdateSystemOption={handleUpdateApplianceSystemOption}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
          />
        )}

        {currentScreen === 'shadow' && (
          <ShadowTrackerScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
          />
        )}

        {currentScreen === 'maintenance' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
          />
        )}

        {currentScreen === 'existing' && (
          <ExistingSystemScreen
            inputs={existingInputs}
            onUpdateInputs={(up) => setExistingInputs((prev) => ({ ...prev, ...up }))}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            uscHistory={uscHistory}
            onRecordUscHistory={recordUscHistory}
          />
        )}

        {currentScreen === 'android_code' && (
          <AndroidSourceExportScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
          />
        )}

        {currentScreen === 'sun_tracker_suite' && (
          <SunTrackerSuiteScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialTab="compass"
          />
        )}

        {currentScreen === 'ar_view' && (
          <ShadowTrackerScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="ar_view"
          />
        )}

        {currentScreen === 'sun_compass' && (
          <ShadowTrackerScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="sun_compass"
          />
        )}

        {currentScreen === 'sun_timer' && (
          <ShadowTrackerScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="sun_timer"
          />
        )}

        {currentScreen === 'solar_angles' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="solar_angles"
          />
        )}

        {currentScreen === 'bubble_level' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="bubble_level"
          />
        )}

        {currentScreen === 'solar_activity' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="solar_activity"
            initialActivityTab="flux"
          />
        )}

        {currentScreen === 'solar_flux' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="solar_activity"
            initialActivityTab="flux"
          />
        )}

        {currentScreen === 'kp_index' && (
          <MaintenanceScreen
            records={maintenanceRecords}
            onUpdateRecords={setMaintenanceRecords}
            profile={customerProfile}
            onUpdateProfile={setCustomerProfile}
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            initialSuiteTab="solar_activity"
            initialActivityTab="kp"
          />
        )}

        {currentScreen === 'power_calc' && (
          <PowerGenerationCalcScreen
            onNavigate={setCurrentScreen}
            weather={weather}
            onOpenWeather={() => setIsWeatherModalOpen(true)}
            currency={inputs.currency}
          />
        )}
      </AndroidFrame>

      {/* Global Weather & Solar Radiation Modal */}
      <WeatherModal
        weather={weather}
        isOpen={isWeatherModalOpen}
        onClose={() => setIsWeatherModalOpen(false)}
        onSelectLocation={handleSelectLocation}
        onRefresh={() => refreshWeather()}
        isLoading={isWeatherLoading}
        onOpenChangeLocation={() => setIsChangeLocationOpen(true)}
        isHourlySyncEnabled={isHourlySyncEnabled}
        onToggleHourlySync={handleToggleHourlySync}
        lastSyncedTime={lastSyncedTime}
      />

      {/* Interactive Map Pin-Drop Change Location Modal (Matching Screenshot) */}
      <ChangeLocationModal
        isOpen={isChangeLocationOpen}
        onClose={() => setIsChangeLocationOpen(false)}
        currentLat={weather.latitude}
        currentLon={weather.longitude}
        currentCity={weather.city}
        onConfirmLocation={(lat, lon, cityName) => {
          refreshWeather(lat, lon, cityName);
          setLocationDetectToast(`High accuracy position confirmed: ${cityName}`);
          setTimeout(() => setLocationDetectToast(null), 3500);
        }}
        weather={weather}
      />

      {/* Universal Multi-Brand Solar Inverter Sync Hub Modal */}
      <InverterSyncModal
        isOpen={isInverterModalOpen}
        onClose={() => setIsInverterModalOpen(false)}
        initialTab={inverterModalInitialTab}
        plant={activeInverterPlant}
        dailyLogs={mergedInverterLogs}
        telemetry={resolvedInverterTelemetry}
        defaultCapacityKwp={
          requirements.recommendedCapacityKwp || customerProfile.systemCapacityKwp || 5.0
        }
        defaultExportTariffInr={inputs.feedInTariffPerKwh || 3.1}
        weatherPotentialGenKwh={resolvedInverterTelemetry.weatherPotentialGenKwh}
        onSavePlantAndLogs={handleSaveInverterPlantAndLogs}
        onDisconnectPlant={activeInverterPlant ? handleDisconnectInverterPlant : undefined}
      />

      {/* Real-time Sync Toast Notification */}
      {syncToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 dark:bg-slate-800/95 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-xl border border-sky-400/40 backdrop-blur-md flex items-center gap-2 animate-bounce-short">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>{syncToast}</span>
        </div>
      )}

      {/* Offline PWA connectivity notice */}
      <OfflineIndicator />
    </>
  );
}
