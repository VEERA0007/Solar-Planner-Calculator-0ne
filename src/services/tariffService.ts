import { STATE_GRID_DATABASE, GridCategory } from '../data/gridTariffs';
import {
  DISCOM_PORTAL_SPECS,
  FourStateId,
  computeExactDiscomBill,
} from '../data/uscPortals';

export interface TariffSlabEntry {
  rangeLabel: string;
  rateInr: number;
}

export interface RealtimeTariffSyncResult {
  stateId: FourStateId;
  stateName: string;
  providerId: string;
  providerShortName: string;
  providerFullName: string;
  regulatorName: string;
  regulatorUrl: string;
  effectivePeriod: string;
  category: GridCategory;
  blendedRatePerKwh: number;
  baseSlabRatePerKwh: number;
  feedInTariffPerKwh: number;
  performanceRatioPct: number;
  fixedChargePerKwInr: number;
  electricityDutyNote: string;
  estimatedMonthlyBillInr: number;
  slabs: TariffSlabEntry[];
  portalReachable: boolean;
  syncedAtIst: string;
  sourceNote: string;
}

export interface FetchRealtimeTariffParams {
  city?: string;
  stateName?: string;
  providerId?: string;
  consumerCategory?: 'residential' | 'commercial' | 'agricultural' | 'industrial';
  monthlyUnits?: number;
  sanctionedLoadKw?: number;
  latitude?: number;
  longitude?: number;
}

export function resolveLocationToStateAndProvider(
  cityOrState = '',
  providerHint = '',
  latitude?: number,
  longitude?: number
): { stateId: FourStateId; providerId: string } {
  const hay = `${cityOrState} ${providerHint}`.toLowerCase();

  if (
    providerHint === 'tgspdcl' ||
    providerHint === 'tsspdcl' ||
    providerHint === 'tgnpdcl' ||
    hay.includes('telangana') ||
    hay.includes('hyderabad') ||
    hay.includes('banjara') ||
    hay.includes('shaikpet') ||
    hay.includes('secunderabad') ||
    hay.includes('rangareddy') ||
    hay.includes('warangal') ||
    hay.includes('karimnagar') ||
    hay.includes('nizamabad') ||
    hay.includes('khammam') ||
    hay.includes('nalgonda') ||
    hay.includes('mahabubnagar')
  ) {
    const isNorth =
      providerHint === 'tgnpdcl' ||
      hay.includes('warangal') ||
      hay.includes('karimnagar') ||
      hay.includes('nizamabad') ||
      hay.includes('khammam') ||
      hay.includes('adilabad');
    return { stateId: 'telangana', providerId: isNorth ? 'tgnpdcl' : 'tgspdcl' };
  }

  if (
    providerHint === 'apspdcl' ||
    providerHint === 'apepdcl' ||
    providerHint === 'apcpdcl' ||
    hay.includes('andhra') ||
    hay.includes('visakhapatnam') ||
    hay.includes('vizag') ||
    hay.includes('vijayawada') ||
    hay.includes('tirupati') ||
    hay.includes('guntur') ||
    hay.includes('kakinada') ||
    hay.includes('rajahmundry') ||
    hay.includes('nellore') ||
    hay.includes('kadapa') ||
    hay.includes('kurnool') ||
    hay.includes('amaravati')
  ) {
    const prov =
      providerHint === 'apepdcl' ||
      hay.includes('visakhapatnam') ||
      hay.includes('vizag') ||
      hay.includes('kakinada') ||
      hay.includes('rajahmundry') ||
      hay.includes('srikakulam')
        ? 'apepdcl'
        : providerHint === 'apcpdcl' ||
          hay.includes('vijayawada') ||
          hay.includes('guntur') ||
          hay.includes('amaravati')
        ? 'apcpdcl'
        : 'apspdcl';
    return { stateId: 'andhra_pradesh', providerId: prov };
  }

  if (
    providerHint.startsWith('tp') ||
    hay.includes('odisha') ||
    hay.includes('odissa') ||
    hay.includes('bhubaneswar') ||
    hay.includes('cuttack') ||
    hay.includes('puri') ||
    hay.includes('rourkela') ||
    hay.includes('sambalpur') ||
    hay.includes('balasore') ||
    hay.includes('berhampur')
  ) {
    const prov =
      providerHint === 'tpwodl' || hay.includes('rourkela') || hay.includes('sambalpur')
        ? 'tpwodl'
        : providerHint === 'tpnodl' || hay.includes('balasore') || hay.includes('baripada')
        ? 'tpnodl'
        : providerHint === 'tpsodl' || hay.includes('berhampur')
        ? 'tpsodl'
        : 'tpcodl';
    return { stateId: 'odissa', providerId: prov };
  }

  if (
    providerHint === 'ced' ||
    hay.includes('chandigarh') ||
    hay.includes('mohali') ||
    hay.includes('panchkula') ||
    hay.includes('manimajra')
  ) {
    return { stateId: 'chandigarh', providerId: 'ced' };
  }

  // Geographic bounding fallback if coordinates point cleanly to Odisha/Chandigarh/AP/TG
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    if (latitude >= 29.5) return { stateId: 'chandigarh', providerId: 'ced' };
    if (latitude >= 19.0 && longitude >= 82.0) return { stateId: 'odissa', providerId: 'tpcodl' };
    if (latitude <= 16.5) return { stateId: 'andhra_pradesh', providerId: 'apspdcl' };
  }

  return { stateId: 'telangana', providerId: 'tgspdcl' };
}

function getLocalTariffFallback(
  params: FetchRealtimeTariffParams
): RealtimeTariffSyncResult {
  const resolved = resolveLocationToStateAndProvider(
    `${params.city || ''} ${params.stateName || ''}`,
    params.providerId || '',
    params.latitude,
    params.longitude
  );
  const gridCategory: GridCategory =
    params.consumerCategory === 'commercial'
      ? 'commercial'
      : params.consumerCategory === 'industrial'
      ? 'industrial'
      : 'domestic';

  const stateMeta = STATE_GRID_DATABASE[resolved.stateId] || STATE_GRID_DATABASE.telangana;
  const discomSpec =
    DISCOM_PORTAL_SPECS.find((d) => d.discomId === resolved.providerId) ||
    DISCOM_PORTAL_SPECS.find((d) => d.stateId === resolved.stateId) ||
    DISCOM_PORTAL_SPECS[0];
  const tariffBucket = stateMeta.tariffs[gridCategory];
  const refUnits = Math.max(100, Math.round(params.monthlyUnits || 400));
  const loadKw = Math.max(1, params.sanctionedLoadKw || 4);
  const estBill = computeExactDiscomBill(refUnits, resolved.stateId, gridCategory, loadKw);
  const blendedRate = Number((estBill / refUnits).toFixed(2));

  const regulatorMap: Record<FourStateId, { name: string; url: string }> = {
    telangana: { name: 'TGERC (Telangana ERC)', url: 'https://www.tgerc.telangana.gov.in/' },
    andhra_pradesh: { name: 'APERC (Andhra Pradesh ERC)', url: 'https://www.aperc.gov.in/' },
    odissa: { name: 'OERC (Odisha ERC)', url: 'https://www.orierc.org/' },
    chandigarh: { name: 'JERC (Chandigarh / UT)', url: 'https://jercuts.gov.in/' },
  };

  const slabTables: Record<FourStateId, TariffSlabEntry[]> = {
    telangana: [
      { rangeLabel: '0–100 kWh', rateInr: 3.4 },
      { rangeLabel: '101–200 kWh', rateInr: 5.1 },
      { rangeLabel: '201–300 kWh', rateInr: 7.7 },
      { rangeLabel: '301–400 kWh', rateInr: 9.0 },
      { rangeLabel: '>400 kWh', rateInr: 9.5 },
    ],
    andhra_pradesh: [
      { rangeLabel: '0–75 kWh', rateInr: 3.0 },
      { rangeLabel: '76–125 kWh', rateInr: 4.5 },
      { rangeLabel: '126–225 kWh', rateInr: 6.0 },
      { rangeLabel: '226–400 kWh', rateInr: 8.75 },
      { rangeLabel: '>400 kWh', rateInr: 9.75 },
    ],
    odissa: [
      { rangeLabel: '0–50 kWh', rateInr: 3.0 },
      { rangeLabel: '51–200 kWh', rateInr: 4.8 },
      { rangeLabel: '201–400 kWh', rateInr: 5.8 },
      { rangeLabel: '>400 kWh', rateInr: 6.2 },
    ],
    chandigarh: [
      { rangeLabel: '0–150 kWh', rateInr: 2.75 },
      { rangeLabel: '151–400 kWh', rateInr: 4.8 },
      { rangeLabel: '>400 kWh', rateInr: 5.4 },
    ],
  };

  return {
    stateId: resolved.stateId,
    stateName: stateMeta.stateName,
    providerId: discomSpec.discomId,
    providerShortName: discomSpec.shortName,
    providerFullName: discomSpec.fullName,
    regulatorName: regulatorMap[resolved.stateId].name,
    regulatorUrl: regulatorMap[resolved.stateId].url,
    effectivePeriod: 'FY 2025–26 Retail Supply Tariff Order',
    category: gridCategory,
    blendedRatePerKwh: blendedRate,
    baseSlabRatePerKwh: tariffBucket.rate,
    feedInTariffPerKwh: tariffBucket.feedInRate,
    performanceRatioPct: tariffBucket.pr,
    fixedChargePerKwInr:
      gridCategory === 'commercial' ? 95 : resolved.stateId === 'odissa' ? 20 : 10,
    electricityDutyNote:
      resolved.stateId === 'odissa'
        ? '4% Electricity Duty'
        : resolved.stateId === 'chandigarh'
        ? 'No extra ED'
        : '₹0.06/kWh ED + Customer Charge',
    estimatedMonthlyBillInr: estBill,
    slabs: slabTables[resolved.stateId],
    portalReachable: false,
    syncedAtIst: new Date().toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }),
    sourceNote: `${discomSpec.shortName} · ${tariffBucket.slabLabel}`,
  };
}

/**
 * Fetches real-time electricity tariff data based on the user's location and utility provider,
 * synchronizing regulatory rates and DISCOM portal schedules via backend API.
 */
export async function fetchRealtimeLocalTariff(
  params: FetchRealtimeTariffParams = {}
): Promise<RealtimeTariffSyncResult> {
  const fallback = getLocalTariffFallback(params);

  const query = new URLSearchParams({
    stateId: fallback.stateId,
    providerId: fallback.providerId,
    category: fallback.category,
    monthlyUnits: String(Math.max(50, Math.round(params.monthlyUnits || 400))),
    sanctionedLoadKw: String(Math.max(1, params.sanctionedLoadKw || 4)),
    city: params.city || '',
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const resp = await fetch(`/api/tariff/realtime?${query.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return fallback;
    const data = await resp.json();
    if (!data?.ok) return fallback;
    return {
      ...fallback,
      blendedRatePerKwh: Number(data.blendedRatePerKwh || fallback.blendedRatePerKwh),
      baseSlabRatePerKwh: Number(data.baseSlabRatePerKwh || fallback.baseSlabRatePerKwh),
      feedInTariffPerKwh: Number(data.feedInTariffPerKwh || fallback.feedInTariffPerKwh),
      estimatedMonthlyBillInr: Number(data.estimatedMonthlyBillInr || fallback.estimatedMonthlyBillInr),
      effectivePeriod: String(data.effectivePeriod || fallback.effectivePeriod),
      regulatorName: String(data.regulatorName || fallback.regulatorName),
      regulatorUrl: String(data.regulatorUrl || fallback.regulatorUrl),
      portalReachable: Boolean(data.portalReachable),
      syncedAtIst: String(data.syncedAtIst || fallback.syncedAtIst),
      sourceNote: String(data.sourceNote || fallback.sourceNote),
    };
  } catch {
    clearTimeout(timeoutId);
    return fallback;
  }
}
