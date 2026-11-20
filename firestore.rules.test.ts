/**
 * Phase 0 Security Rules Verification Suite (Dirty Dozen + Legitimate Flows)
 * Covers:
 *   - /usc_history/{entryId}
 *   - /inverter_plants/{plantId}
 *   - /inverter_plants/{plantId}/daily_logs/{dateKey}
 */

export interface DirtyDozenCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  auth: { uid: string; email?: string; email_verified?: boolean } | null;
  payload?: Record<string, unknown>;
  expected: 'ALLOW' | 'PERMISSION_DENIED';
}

const VALID_USC_PAYLOAD = {
  id: '102603120_telangana',
  uscNumber: '102603120',
  consumerName: 'Sri Lakshmi Nilayam',
  discomShortName: 'TGSPDCL',
  discomId: 'tgspdcl',
  stateId: 'telangana',
  stateName: 'Telangana',
  sanctionedLoadKw: 5,
  avgMonthlyUnits: 420,
  avgMonthlyBill: 3450,
  monthsCount: 12,
  verifiedMonthsCount: 12,
  lastFetchedAtIst: '19 Nov 2026, 09:00 PM IST',
  timestampIso: '2026-11-19T15:30:00.000Z',
  months: [{ month: 'Nov 2026', unitsKwh: 420, billAmountInr: 3450, isVerifiedPortalData: true }],
  visibility: 'public',
  ownerId: 'user_a',
  createdAt: '<SERVER_TIMESTAMP>',
  updatedAt: '<SERVER_TIMESTAMP>',
};

const VALID_PLANT_PAYLOAD = {
  id: 'rooftop_5kw_solarman',
  brand: 'solarman',
  plantName: 'Home Rooftop 5 kW',
  stationId: 'ST-99812',
  loggerSerial: '2748192011',
  installedCapacityKwp: 5.0,
  exportTariffInr: 3.1,
  meterMode: 'auto',
  autoSyncMinutes: 15,
  hasSyncedData: true,
  todayDateKey: '2026-11-20',
  todayGenKwh: 22.4,
  livePowerKw: 3.45,
  hasSmartMeter: false,
  syncSource: 'manual_entry',
  lastSyncedAtIso: '2026-11-20T09:30:00.000Z',
  lastSyncedAtIst: '20 Nov 2026, 03:00 PM IST',
  visibility: 'public',
  ownerId: 'user_a',
  createdAt: '<SERVER_TIMESTAMP>',
  updatedAt: '<SERVER_TIMESTAMP>',
};

const VALID_DAILY_LOG_PAYLOAD = {
  dateKey: '2026-11-20',
  plantId: 'rooftop_5kw_solarman',
  generationKwh: 22.4,
  peakPowerKw: 4.1,
  weatherPotentialKwh: 24.0,
  performanceRatioPct: 93.3,
  hasSmartMeter: false,
  syncSource: 'manual_entry',
  recordedAtIso: '2026-11-20T09:30:00.000Z',
  visibility: 'public',
  ownerId: 'user_a',
  createdAt: '<SERVER_TIMESTAMP>',
  updatedAt: '<SERVER_TIMESTAMP>',
};

export const DIRTY_DOZEN_TESTS: DirtyDozenCase[] = [
  {
    id: 1,
    name: 'Unauthenticated create on USC history is denied',
    operation: 'create',
    path: '/usc_history/102603120_telangana',
    auth: null,
    payload: VALID_USC_PAYLOAD,
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 2,
    name: 'Unverified admin email spoofing on inverter plant delete is denied',
    operation: 'delete',
    path: '/inverter_plants/rooftop_5kw_solarman',
    auth: { uid: 'spoof_uid', email: 'veera.official1997@gmail.com', email_verified: false },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 3,
    name: 'Identity spoofing via mismatched ownerId on inverter plant create is denied',
    operation: 'create',
    path: '/inverter_plants/rooftop_5kw_solarman',
    auth: { uid: 'attacker_uid', email: 'attacker@example.com', email_verified: true },
    payload: { ...VALID_PLANT_PAYLOAD, ownerId: 'user_a' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 4,
    name: 'Shadow/secret field injection (apiSecret) on inverter plant is denied',
    operation: 'create',
    path: '/inverter_plants/rooftop_5kw_solarman',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_PLANT_PAYLOAD, apiSecret: 'leaked_key' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 5,
    name: 'Path variable ID poisoning on inverter plant is denied',
    operation: 'create',
    path: '/inverter_plants/bad$id!poison',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_PLANT_PAYLOAD, id: 'bad$id!poison' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 6,
    name: 'Client-forged createdAt timestamp on inverter plant is denied',
    operation: 'create',
    path: '/inverter_plants/rooftop_5kw_solarman',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_PLANT_PAYLOAD, createdAt: '2020-01-01T00:00:00Z' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 7,
    name: 'Months array exceeding 24 elements on USC history is denied',
    operation: 'create',
    path: '/usc_history/102603120_telangana',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: {
      ...VALID_USC_PAYLOAD,
      months: Array.from({ length: 25 }, (_, i) => ({ month: `M${i}`, unitsKwh: 100, billAmountInr: 700 })),
    },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 8,
    name: 'Invalid non-YYYY-MM-DD dateKey on daily_logs is denied',
    operation: 'create',
    path: '/inverter_plants/rooftop_5kw_solarman/daily_logs/today',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_DAILY_LOG_PAYLOAD, dateKey: 'today' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 9,
    name: 'Orphaned daily_logs create for nonexistent parent plant is denied by Master Gate',
    operation: 'create',
    path: '/inverter_plants/nonexistent_plant/daily_logs/2026-11-20',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_DAILY_LOG_PAYLOAD, plantId: 'nonexistent_plant' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 10,
    name: 'Cross-owner daily_logs write under another users plant is denied by Master Gate',
    operation: 'create',
    path: '/inverter_plants/rooftop_5kw_solarman/daily_logs/2026-11-20',
    auth: { uid: 'user_b', email: 'user_b@example.com', email_verified: true },
    payload: { ...VALID_DAILY_LOG_PAYLOAD, ownerId: 'user_b' },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 11,
    name: 'Value poisoning on todayGenKwh (negative number) during update is denied',
    operation: 'update',
    path: '/inverter_plants/rooftop_5kw_solarman',
    auth: { uid: 'user_a', email: 'user_a@example.com', email_verified: true },
    payload: { ...VALID_PLANT_PAYLOAD, todayGenKwh: -12.5 },
    expected: 'PERMISSION_DENIED',
  },
  {
    id: 12,
    name: 'Access to undeclared collection is denied by global catch-all',
    operation: 'get',
    path: '/private_secrets/config',
    auth: { uid: 'user_a', email: 'veera.official1997@gmail.com', email_verified: true },
    expected: 'PERMISSION_DENIED',
  },
];
