/**
 * Solar Photovoltaic Panel Catalog & Engineering Specifications
 * Active Estimator Range: 540 W starting module up to 750 W utility maximum
 *
 * 540 W: 2278 × 1134 mm -> 2.58 m²
 * 550 W: 2278 × 1134 mm -> 2.58 m²
 * 580 W: 2278 × 1134 mm -> 2.58 m²
 * 600 W: 2278 × 1134 mm -> 2.58 m²
 * 620 W: 2382 × 1134 mm -> 2.70 m²
 * 650 W: 2382 × 1303 mm -> 3.10 m²
 * 680 W: 2384 × 1303 mm -> 3.11 m²
 * 700 W: 2384 × 1303 mm -> 3.11 m²
 * 720 W: 2384 × 1303 mm -> 3.11 m²
 * 750 W: 2384 × 1303 mm -> 3.11 m²
 */

export interface SolarPanelModel {
  wattage: number; // Watts (W)
  lengthMm: number; // Millimeters (mm)
  widthMm: number; // Millimeters (mm)
  thicknessMm: number; // Millimeters (mm)
  dimensionsMm: string; // e.g. "2278 × 1134 mm"
  dimensions: string; // "2278 x 1134 x 35 mm" for backward compatibility
  areaSqm: number; // Square Meters (m²)
  areaSqFt: number; // Square Feet (sq ft)
  efficiencyPercent: number; // Typical cell/module efficiency %
  weightKg: number; // Typical panel weight in kg
  tier: string;
  description: string;
  dcrEligible: boolean; // True = MNRE ALMM Domestic Cell & Module (DCR)
  nonDcrEligible: boolean; // True = Available in Open-Category Global Supply (Non-DCR)
  cellTechnology: string;
  recommendedBrands: string[];
}

export const SOLAR_PANEL_CATALOG: SolarPanelModel[] = [
  {
    wattage: 540,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '2278 × 1134 mm',
    dimensions: '2278 x 1134 x 35 mm',
    areaSqm: 2.58,
    areaSqFt: 27.8,
    efficiencyPercent: 20.9,
    weightKg: 27.5,
    tier: 'ALMM Base Start (540W)',
    description: '540 W • 2278 × 1134 mm • 2.58 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'Mono PERC 144-Cell M10',
    recommendedBrands: ['Adani Solar', 'Waaree Energies'],
  },
  {
    wattage: 550,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '2278 × 1134 mm',
    dimensions: '2278 x 1134 x 35 mm',
    areaSqm: 2.58,
    areaSqFt: 27.8,
    efficiencyPercent: 21.3,
    weightKg: 28.0,
    tier: 'Benchmark Mono PERC',
    description: '550 W • 2278 × 1134 mm • 2.58 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'Mono PERC M10 Half-Cut',
    recommendedBrands: ['Tata Power Solar', 'Longi Hi-MO'],
  },
  {
    wattage: 580,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '2278 × 1134 mm',
    dimensions: '2278 x 1134 x 35 mm',
    areaSqm: 2.58,
    areaSqFt: 27.8,
    efficiencyPercent: 22.5,
    weightKg: 28.5,
    tier: 'High Output N-Type TOPCon',
    description: '580 W • 2278 × 1134 mm • 2.58 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'DCR N-Type TOPCon Bifacial',
    recommendedBrands: ['Waaree Elite DCR', 'Goldi Green'],
  },
  {
    wattage: 600,
    lengthMm: 2278,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '2278 × 1134 mm',
    dimensions: '2278 x 1134 x 35 mm',
    areaSqm: 2.58,
    areaSqFt: 27.8,
    efficiencyPercent: 23.3,
    weightKg: 29.0,
    tier: 'TOPCon High Efficiency',
    description: '600 W • 2278 × 1134 mm • 2.58 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'N-Type TOPCon M10R (ALMM/Tier-1)',
    recommendedBrands: ['Waaree TOPCon DCR', 'Jinko Tiger Neo'],
  },
  {
    wattage: 620,
    lengthMm: 2382,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '2382 × 1134 mm',
    dimensions: '2382 x 1134 x 35 mm',
    areaSqm: 2.7,
    areaSqFt: 29.1,
    efficiencyPercent: 23.0,
    weightKg: 31.0,
    tier: 'Commercial High-Yield',
    description: '620 W • 2382 × 1134 mm • 2.70 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'N-Type TOPCon Bifacial Dual-Glass',
    recommendedBrands: ['Premier Energies', 'Trina Vertex N'],
  },
  {
    wattage: 650,
    lengthMm: 2382,
    widthMm: 1303,
    thicknessMm: 35,
    dimensionsMm: '2382 × 1303 mm',
    dimensions: '2382 x 1303 x 35 mm',
    areaSqm: 3.1,
    areaSqFt: 33.4,
    efficiencyPercent: 21.0,
    weightKg: 34.0,
    tier: 'Ultra-High Power G12 Series',
    description: '650 W • 2382 × 1303 mm • 3.10 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'G12 210mm Bifacial Dual-Glass',
    recommendedBrands: ['Vikram Hypersol', 'Trina Vertex'],
  },
  {
    wattage: 680,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 35,
    dimensionsMm: '2384 × 1303 mm',
    dimensions: '2384 x 1303 x 35 mm',
    areaSqm: 3.11,
    areaSqFt: 33.5,
    efficiencyPercent: 21.9,
    weightKg: 34.5,
    tier: 'Commercial Utility G12 TOPCon',
    description: '680 W • 2384 × 1303 mm • 3.11 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'G12 N-Type TOPCon Bifacial',
    recommendedBrands: ['Adani Eternal', 'JA Solar DeepBlue'],
  },
  {
    wattage: 700,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 35,
    dimensionsMm: '2384 × 1303 mm',
    dimensions: '2384 x 1303 x 35 mm',
    areaSqm: 3.11,
    areaSqFt: 33.5,
    efficiencyPercent: 22.5,
    weightKg: 35.0,
    tier: 'Utility G12 High Power',
    description: '700 W • 2384 × 1303 mm • 3.11 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'G12 N-Type TOPCon Utility',
    recommendedBrands: ['Waaree Ahnay DCR', 'Trina Vertex N 700'],
  },
  {
    wattage: 720,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    dimensionsMm: '2384 × 1303 mm',
    dimensions: '2384 x 1303 x 33 mm',
    areaSqm: 3.11,
    areaSqFt: 33.5,
    efficiencyPercent: 23.2,
    weightKg: 35.5,
    tier: 'Max DCR / Utility Flagship',
    description: '720 W • 2384 × 1303 mm • 3.11 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'G12 N-Type TOPCon / HJT Bifacial',
    recommendedBrands: ['Emmvee TopCon', 'Canadian Solar BiHiKu'],
  },
  {
    wattage: 750,
    lengthMm: 2384,
    widthMm: 1303,
    thicknessMm: 33,
    dimensionsMm: '2384 × 1303 mm',
    dimensions: '2384 x 1303 x 33 mm',
    areaSqm: 3.11,
    areaSqFt: 33.5,
    efficiencyPercent: 24.1,
    weightKg: 36.0,
    tier: 'Maximum Panel W Available',
    description: '750 W • 2384 × 1303 mm • 3.11 m²',
    dcrEligible: false,
    nonDcrEligible: true,
    cellTechnology: 'G12 HJT Heterojunction Utility',
    recommendedBrands: ['Risen Hyper-ion', 'Tongwei G12 HJT'],
  },
];

// Legacy sub-540W panel lookup retained solely for backwards compatibility with older saved records
const LEGACY_PANEL_SPECS: SolarPanelModel[] = [
  {
    wattage: 400,
    lengthMm: 2000,
    widthMm: 1000,
    thicknessMm: 35,
    dimensionsMm: '2000 × 1000 mm',
    dimensions: '2000 x 1000 x 35 mm',
    areaSqm: 2.0,
    areaSqFt: 21.5,
    efficiencyPercent: 20.0,
    weightKg: 21.5,
    tier: 'Legacy Residential',
    description: '400 W • 2000 × 1000 mm • 2.00 m²',
    dcrEligible: false,
    nonDcrEligible: true,
    cellTechnology: 'Mono PERC (Legacy)',
    recommendedBrands: ['Jinko Solar', 'Trina Solar'],
  },
  {
    wattage: 450,
    lengthMm: 1900,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '1900 × 1134 mm',
    dimensions: '1900 x 1134 x 35 mm',
    areaSqm: 2.15,
    areaSqFt: 23.1,
    efficiencyPercent: 20.9,
    weightKg: 23.5,
    tier: 'Legacy Residential DCR',
    description: '450 W • 1900 × 1134 mm • 2.15 m²',
    dcrEligible: true,
    nonDcrEligible: false,
    cellTechnology: 'Mono PERC (Legacy)',
    recommendedBrands: ['Tata Power Solar', 'Luminous DCR'],
  },
  {
    wattage: 500,
    lengthMm: 1950,
    widthMm: 1134,
    thicknessMm: 35,
    dimensionsMm: '1950 × 1134 mm',
    dimensions: '1950 x 1134 x 35 mm',
    areaSqm: 2.21,
    areaSqFt: 23.8,
    efficiencyPercent: 22.6,
    weightKg: 24.5,
    tier: 'Legacy Mono PERC',
    description: '500 W • 1950 × 1134 mm • 2.21 m²',
    dcrEligible: true,
    nonDcrEligible: false,
    cellTechnology: 'Mono PERC Half-Cut (Legacy)',
    recommendedBrands: ['Waaree DCR', 'Vikram Solar'],
  },
];

export interface InverterHardwareModel {
  id: string;
  brand: string;
  modelSeries: string;
  systemType: 'on-grid' | 'hybrid' | 'off-grid';
  dcrApproved: boolean;
  efficiencyPct: number;
  warrantyYears: number;
  costDeltaPerKwInr: number;
  specNote: string;
}

export const INVERTER_HARDWARE_CATALOG: InverterHardwareModel[] = [
  {
    id: 'havells-ongrid-dcr',
    brand: 'Havells',
    modelSeries: 'Enviro GT Dual-MPPT (BIS/DISCOM)',
    systemType: 'on-grid',
    dcrApproved: true,
    efficiencyPct: 98.1,
    warrantyYears: 10,
    costDeltaPerKwInr: 0,
    specNote: 'PM Surya Ghar Portal Approved · IEEE 1547 · Zero Battery Port',
  },
  {
    id: 'luminous-ongrid-dcr',
    brand: 'Luminous',
    modelSeries: 'NXi Grid-Tie String (BIS)',
    systemType: 'on-grid',
    dcrApproved: true,
    efficiencyPct: 97.8,
    warrantyYears: 7,
    costDeltaPerKwInr: -800,
    specNote: 'BIS IS-16221 Certified · Wi-Fi Net-Meter Ready',
  },
  {
    id: 'polycab-ongrid-dcr',
    brand: 'Polycab',
    modelSeries: 'PSIS On-Grid 16A MPPT',
    systemType: 'on-grid',
    dcrApproved: true,
    efficiencyPct: 98.2,
    warrantyYears: 10,
    costDeltaPerKwInr: 400,
    specNote: 'High-Current 16A/String MPPT · Built for 540W–720W Panels',
  },
  {
    id: 'sungrow-ongrid-nondcr',
    brand: 'Sungrow',
    modelSeries: 'SG RT/RS High-Current String',
    systemType: 'on-grid',
    dcrApproved: false,
    efficiencyPct: 98.5,
    warrantyYears: 10,
    costDeltaPerKwInr: 1200,
    specNote: 'IP65 AFCI Arc-Fault · Supports 600W–750W High-Imp Modules',
  },
  {
    id: 'growatt-ongrid-nondcr',
    brand: 'Growatt',
    modelSeries: 'MIN / MID TL3-X Open Series',
    systemType: 'on-grid',
    dcrApproved: false,
    efficiencyPct: 98.4,
    warrantyYears: 10,
    costDeltaPerKwInr: -500,
    specNote: 'High PV Oversizing 1.5× · Cost-Optimized Non-DCR Array',
  },
  {
    id: 'goodwe-ongrid-nondcr',
    brand: 'GoodWe',
    modelSeries: 'DNS / SDT G3 Wide-MPPT',
    systemType: 'on-grid',
    dcrApproved: false,
    efficiencyPct: 98.3,
    warrantyYears: 10,
    costDeltaPerKwInr: 700,
    specNote: '16A/20A MPPT Input · Type-II DC/AC SPD Built-In',
  },
  {
    id: 'havells-hybrid-dcr',
    brand: 'Havells',
    modelSeries: 'Hybrid-BiDir Pro (DISCOM + LFP)',
    systemType: 'hybrid',
    dcrApproved: true,
    efficiencyPct: 97.6,
    warrantyYears: 7,
    costDeltaPerKwInr: 1500,
    specNote: 'ALMM / Subsidy Eligible Hybrid · <10ms UPS Transfer + CAN BMS',
  },
  {
    id: 'loom-hybrid-dcr',
    brand: 'Loom Solar',
    modelSeries: 'Fusion Bi-Directional MPPT',
    systemType: 'hybrid',
    dcrApproved: true,
    efficiencyPct: 97.2,
    warrantyYears: 5,
    costDeltaPerKwInr: 0,
    specNote: 'Net Metering + 48V LiFePO₄ Dual Output Support',
  },
  {
    id: 'deye-hybrid-nondcr',
    brand: 'Deye',
    modelSeries: 'SUN-SG04LP3 High-Current Hybrid',
    systemType: 'hybrid',
    dcrApproved: false,
    efficiencyPct: 97.8,
    warrantyYears: 10,
    costDeltaPerKwInr: 2200,
    specNote: '4ms Transfer · Parallelable up to 10 Units · Gen + 18A MPPT',
  },
  {
    id: 'solis-hybrid-nondcr',
    brand: 'Solis',
    modelSeries: 'S6 Pro Bidirectional HV/LV',
    systemType: 'hybrid',
    dcrApproved: false,
    efficiencyPct: 97.5,
    warrantyYears: 10,
    costDeltaPerKwInr: 800,
    specNote: 'Peak-Shaving + Critical Backup · Supports 540W–720W Strings',
  },
  {
    id: 'luminous-offgrid-dcr',
    brand: 'Luminous',
    modelSeries: 'Solar NXG PRO+ rMPPT PCU',
    systemType: 'off-grid',
    dcrApproved: true,
    efficiencyPct: 95.8,
    warrantyYears: 5,
    costDeltaPerKwInr: 0,
    specNote: 'Heavy Surge Support · Pure Sine Off-Grid Standalone PCU',
  },
  {
    id: 'utl-offgrid-dcr',
    brand: 'UTL Solar',
    modelSeries: 'Gamma+ High-Efficiency PCU',
    systemType: 'off-grid',
    dcrApproved: true,
    efficiencyPct: 96.0,
    warrantyYears: 5,
    costDeltaPerKwInr: -600,
    specNote: 'Agricultural & Rural Standalone Pump/Home PCU',
  },
  {
    id: 'victron-offgrid-nondcr',
    brand: 'Victron',
    modelSeries: 'MultiPlus-II + SmartSolar MPPT',
    systemType: 'off-grid',
    dcrApproved: false,
    efficiencyPct: 96.5,
    warrantyYears: 5,
    costDeltaPerKwInr: 3500,
    specNote: 'Industrial Copper Transformer · Zero-Failure Remote Autonomy',
  },
  {
    id: 'growatt-offgrid-nondcr',
    brand: 'Growatt',
    modelSeries: 'SPF ES Standalone Solar Inverter',
    systemType: 'off-grid',
    dcrApproved: false,
    efficiencyPct: 95.5,
    warrantyYears: 5,
    costDeltaPerKwInr: 0,
    specNote: 'Lithium BMS Direct Sync · High-Voltage PV String Input',
  },
];

export const POPULAR_INVERTER_BRANDS: string[] = [
  'Sungrow',
  'Havells',
  'Growatt',
  'Deye',
  'Solis',
  'GoodWe',
  'Luminous',
  'Fronius',
  'Polycab',
  'UTL Solar',
];

export const STANDARD_INVERTER_KW_RATINGS: number[] = [
  3, 3.3, 3.6, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 33, 40, 50, 60, 80, 100, 125,
];

export interface InverterSuggestionResult {
  recommendedAcKw: number;
  recommendedMinAcKw: number;
  recommendedMaxAcKw: number;
  nearbyStandardSizesKw: number[];
  recommendedPhaseLabel: string;
  mpptCurrentNote: string;
  dcAcRatio: number;
  ratioStatus: 'optimal' | 'undersized' | 'oversized';
  ratioHeadline: string;
  ratioAdvice: string;
  brandNote: string;
  suggestedModels: InverterHardwareModel[];
}

/**
 * Generates engineering recommendations for inverter AC capacity, phase, DC/AC loading,
 * MPPT current compatibility with 540W–750W panels, and brand/model suggestions.
 */
export function getInverterEngineeringSuggestions(params: {
  pvDcKw: number;
  systemType: 'on-grid' | 'hybrid' | 'off-grid';
  moduleStandard: 'DCR' | 'NON_DCR';
  panelWattage: number;
  connectedLoadKw?: number;
  customBrand?: string;
  customPowerKw?: number | null;
}): InverterSuggestionResult {
  const {
    pvDcKw,
    systemType,
    moduleStandard,
    panelWattage,
    connectedLoadKw = 0,
    customBrand = '',
    customPowerKw = null,
  } = params;

  const safePvKw = Math.max(1, pvDcKw || 3);

  // Ideal AC sizing target differs by architecture:
  // - On-Grid: slight DC oversizing (DC/AC ~ 1.10) maximizes morning/evening yield
  // - Hybrid / Off-Grid: size AC to handle PV array or surge/connected load cleanly
  const targetRawAcKw =
    systemType === 'on-grid'
      ? Math.max(3, safePvKw / 1.1)
      : Math.max(3, safePvKw * 0.98, connectedLoadKw * (systemType === 'off-grid' ? 1.15 : 1.0));

  const pickNearestStandard = (raw: number): number => {
    const upper = STANDARD_INVERTER_KW_RATINGS.find((s) => s >= raw * 0.96);
    if (upper) return upper;
    return Math.ceil(raw / 25) * 25;
  };

  const recommendedAcKw = pickNearestStandard(targetRawAcKw);
  const recommendedMinAcKw = Number((safePvKw / 1.25).toFixed(1));
  const recommendedMaxAcKw = Number(
    (systemType === 'on-grid' ? safePvKw * 1.05 : Math.max(safePvKw * 1.2, connectedLoadKw * 1.25)).toFixed(1)
  );

  // Build 4 nearby standard market sizes for 1-click selection
  const idx = STANDARD_INVERTER_KW_RATINGS.findIndex((s) => s >= recommendedAcKw);
  let nearbyStandardSizesKw: number[] = [];
  if (idx >= 0) {
    const start = Math.max(0, idx - 1);
    nearbyStandardSizesKw = STANDARD_INVERTER_KW_RATINGS.slice(start, start + 4);
  } else {
    nearbyStandardSizesKw = [
      Math.max(50, Math.round(recommendedAcKw * 0.8 / 10) * 10),
      recommendedAcKw,
      Math.round((recommendedAcKw * 1.2) / 10) * 10,
    ];
  }

  const activeInverterKw =
    customPowerKw && customPowerKw > 0 ? customPowerKw : recommendedAcKw;
  const dcAcRatio = Number((safePvKw / Math.max(0.5, activeInverterKw)).toFixed(2));

  let ratioStatus: 'optimal' | 'undersized' | 'oversized' = 'optimal';
  let ratioHeadline = `Optimal DC/AC Ratio (${dcAcRatio.toFixed(2)}×)`;
  let ratioAdvice = `A ${activeInverterKw} kW inverter pairs cleanly with ${safePvKw} kWp PV DC for balanced peak harvesting and minimal clipping.`;

  if (dcAcRatio > 1.35) {
    ratioStatus = 'undersized';
    ratioHeadline = `Undersized Inverter — High Clipping (${dcAcRatio.toFixed(2)}× DC/AC)`;
    ratioAdvice = `${safePvKw} kWp DC exceeds 135% of your ${activeInverterKw} kW AC inverter. Upgrade to ${recommendedAcKw} kW to avoid afternoon power clipping.`;
  } else if (dcAcRatio < 0.85) {
    ratioStatus = 'oversized';
    ratioHeadline = `Oversized Inverter Headroom (${dcAcRatio.toFixed(2)}× DC/AC)`;
    ratioAdvice = `${activeInverterKw} kW inverter has extra capacity (+${Math.max(
      0,
      Math.round((activeInverterKw - safePvKw) * 10) / 10
    )} kW headroom) — ideal for future panel expansion or heavy surge loads.`;
  }

  const recommendedPhaseLabel =
    activeInverterKw > 5.5 || recommendedAcKw > 5.5
      ? '3-Phase 415V Recommended'
      : '1-Phase 230V (or 3-Phase 415V)';

  const mpptCurrentNote =
    panelWattage >= 650
      ? `${panelWattage}W G12 (210mm) modules deliver ~17.5–19A Imp: ensure inverter MPPT input is rated ≥20A per string.`
      : `${panelWattage}W M10/TOPCon modules run ~13.5–15A Imp: choose an inverter with ≥15A–16A MPPT input current.`;

  // Match catalog suggestions by architecture + DCR standard + optional brand search
  const wantDcr = moduleStandard === 'DCR';
  const primaryMatches = INVERTER_HARDWARE_CATALOG.filter(
    (inv) => inv.systemType === systemType && inv.dcrApproved === wantDcr
  );
  const secondaryMatches = INVERTER_HARDWARE_CATALOG.filter(
    (inv) => inv.systemType === systemType && inv.dcrApproved !== wantDcr
  );
  const trimmedBrand = customBrand.trim().toLowerCase();
  const orderedMatches = [...primaryMatches, ...secondaryMatches].sort((a, b) => {
    const aHit = trimmedBrand && a.brand.toLowerCase().includes(trimmedBrand) ? -1 : 0;
    const bHit = trimmedBrand && b.brand.toLowerCase().includes(trimmedBrand) ? -1 : 0;
    if (aHit !== bHit) return aHit - bHit;
    return b.efficiencyPct - a.efficiencyPct;
  });

  const brandMatch = INVERTER_HARDWARE_CATALOG.find(
    (inv) =>
      trimmedBrand.length >= 2 &&
      inv.brand.toLowerCase().includes(trimmedBrand) &&
      inv.systemType === systemType
  );

  const brandNote = trimmedBrand
    ? brandMatch
      ? `${brandMatch.brand} ${brandMatch.modelSeries} (${brandMatch.efficiencyPct}% Eff · ${brandMatch.warrantyYears}Yr Warranty) matches your ${systemType.toUpperCase()} setup.`
      : `Using custom "${customBrand.trim()}" ${activeInverterKw} kW ${systemType.toUpperCase()} inverter — verify ≥${
          panelWattage >= 650 ? '20A' : '16A'
        } MPPT & BIS IS-16221 compliance.`
    : `Top ${wantDcr ? 'DCR/BIS-approved' : 'Tier-1 Open'} picks for ${recommendedAcKw} kW ${systemType.toUpperCase()}: ${primaryMatches
        .slice(0, 2)
        .map((m) => m.brand)
        .join(' / ')}.`;

  return {
    recommendedAcKw,
    recommendedMinAcKw,
    recommendedMaxAcKw,
    nearbyStandardSizesKw,
    recommendedPhaseLabel,
    mpptCurrentNote,
    dcAcRatio,
    ratioStatus,
    ratioHeadline,
    ratioAdvice,
    brandNote,
    suggestedModels: orderedMatches.slice(0, 4),
  };
}

/**
 * Filter solar panel hardware catalog by DCR vs Non-DCR module standard (540W to max available)
 */
export function getFilteredPanelHardware(
  moduleStandard: 'DCR' | 'NON_DCR'
): SolarPanelModel[] {
  return SOLAR_PANEL_CATALOG.filter((panel) =>
    moduleStandard === 'DCR' ? panel.dcrEligible : panel.nonDcrEligible
  );
}

/**
 * Filter inverter hardware catalog by DCR vs Non-DCR and optional system architecture
 */
export function getFilteredInverterHardware(
  moduleStandard: 'DCR' | 'NON_DCR',
  systemType?: 'on-grid' | 'off-grid' | 'hybrid'
): InverterHardwareModel[] {
  const wantDcr = moduleStandard === 'DCR';
  return INVERTER_HARDWARE_CATALOG.filter(
    (inv) => inv.dcrApproved === wantDcr && (!systemType || inv.systemType === systemType)
  );
}

/**
 * Retrieve exact specification for a given panel wattage
 */
export function getPanelSpecification(wattage: number): SolarPanelModel {
  const exact =
    SOLAR_PANEL_CATALOG.find((p) => p.wattage === wattage) ||
    LEGACY_PANEL_SPECS.find((p) => p.wattage === wattage);
  if (exact) return exact;

  // Fallback to closest wattage in active catalog
  return SOLAR_PANEL_CATALOG.reduce((prev, curr) =>
    Math.abs(curr.wattage - wattage) < Math.abs(prev.wattage - wattage) ? curr : prev
  );
}

/**
 * Calculate required roof area for a target number of panels with standard inter-row and maintenance spacing
 * @param count Number of panels
 * @param wattage Panel wattage in Watts
 * @param spacingMultiplier Spacing & maintenance clearance buffer (default 1.15 = +15% walkway/clearance)
 */
export function calculatePanelsRequiredArea(
  count: number,
  wattage: number,
  spacingMultiplier = 1.0
): { netAreaM2: number; grossAreaM2: number; areaSqFt: number } {
  const spec = getPanelSpecification(wattage);
  const netAreaM2 = parseFloat((count * spec.areaSqm).toFixed(2));
  const grossAreaM2 = parseFloat((netAreaM2 * spacingMultiplier).toFixed(2));
  const areaSqFt = Math.round(grossAreaM2 * 10.7639);
  return { netAreaM2, grossAreaM2, areaSqFt };
}

/**
 * Calculate how many panels of a chosen wattage can physically fit on a given rooftop area
 */
export function calculatePanelsFitOnRoof(
  roofAreaM2: number,
  wattage: number,
  usableRatio = 0.85
): { maxPanels: number; totalKw: number; panelSpec: SolarPanelModel } {
  const spec = getPanelSpecification(wattage);
  const usableArea = roofAreaM2 * usableRatio;
  const maxPanels = Math.max(0, Math.floor(usableArea / spec.areaSqm));
  const totalKw = parseFloat(((maxPanels * spec.wattage) / 1000).toFixed(2));
  return { maxPanels, totalKw, panelSpec: spec };
}

export interface CapacityPreset {
  label: string;
  kw: number;
}

export const SYSTEM_CAPACITY_PRESETS: CapacityPreset[] = [
  { label: '1 kW', kw: 1 },
  { label: '2 kW', kw: 2 },
  { label: '3 kW', kw: 3 },
  { label: '5 kW', kw: 5 },
  { label: '10 kW', kw: 10 },
  { label: '20 kW', kw: 20 },
  { label: '25 kW', kw: 25 },
  { label: '50 kW', kw: 50 },
  { label: '100 kW', kw: 100 },
  { label: '250 kW', kw: 250 },
  { label: '500 kW', kw: 500 },
  { label: '1 MW', kw: 1000 },
  { label: '5 MW', kw: 5000 },
  { label: '10 MW', kw: 10000 },
  { label: '25 MW', kw: 25000 },
  { label: '50 MW', kw: 50000 },
  { label: '100 MW', kw: 100000 },
  { label: '200 MW', kw: 200000 },
  { label: '300 MW (300MG)', kw: 300000 },
];

/**
 * Interlinked calculation: From target System Capacity (kW) to Panel Count and Rooftop Area (m²)
 */
export function calculateFromSystemKw(
  targetKw: number,
  panelWattage: number
): {
  targetKw: number;
  actualKw: number;
  panelCount: number;
  requiredAreaM2: number;
  requiredAreaSqFt: number;
  panelSpec: SolarPanelModel;
} {
  const spec = getPanelSpecification(panelWattage);
  const panelCount = Math.max(1, Math.ceil((targetKw * 1000) / spec.wattage));
  const actualKw = parseFloat(((panelCount * spec.wattage) / 1000).toFixed(2));
  const moduleAreaPerPanel = (spec.lengthMm * spec.widthMm) / 1000000;
  const requiredAreaM2 = parseFloat((panelCount * moduleAreaPerPanel).toFixed(1));
  const requiredAreaSqFt = Math.round(requiredAreaM2 * 10.7639);

  return {
    targetKw,
    actualKw,
    panelCount,
    requiredAreaM2,
    requiredAreaSqFt,
    panelSpec: spec,
  };
}

/**
 * Interlinked calculation: From Panel Count to System Capacity (kW) and Rooftop Area (m²)
 */
export function calculateFromPanelCount(
  panelCount: number,
  panelWattage: number
): {
  systemKw: number;
  panelCount: number;
  requiredAreaM2: number;
  requiredAreaSqFt: number;
  panelSpec: SolarPanelModel;
} {
  const spec = getPanelSpecification(panelWattage);
  const safeCount = Math.max(1, Math.round(panelCount));
  const systemKw = parseFloat(((safeCount * spec.wattage) / 1000).toFixed(2));
  const moduleAreaPerPanel = (spec.lengthMm * spec.widthMm) / 1000000;
  const requiredAreaM2 = parseFloat((safeCount * moduleAreaPerPanel).toFixed(1));
  const requiredAreaSqFt = Math.round(requiredAreaM2 * 10.7639);

  return {
    systemKw,
    panelCount: safeCount,
    requiredAreaM2,
    requiredAreaSqFt,
    panelSpec: spec,
  };
}

/**
 * Interlinked calculation: From Rooftop/Surface Area (m²) to Max Panels Fit and System Capacity (kW)
 */
export function calculateFromRoofArea(
  surfaceAreaM2: number,
  panelWattage: number
): {
  maxPanels: number;
  systemKw: number;
  actualOccupiedAreaM2: number;
  surfaceAreaM2: number;
  areaSqFt: number;
  panelSpec: SolarPanelModel;
} {
  const spec = getPanelSpecification(panelWattage);
  const moduleAreaPerPanel = (spec.lengthMm * spec.widthMm) / 1000000;
  const maxPanels = Math.max(0, Math.floor(surfaceAreaM2 / moduleAreaPerPanel));
  const systemKw = parseFloat(((maxPanels * spec.wattage) / 1000).toFixed(2));
  const actualOccupiedAreaM2 = parseFloat((maxPanels * moduleAreaPerPanel).toFixed(1));
  const areaSqFt = Math.round(surfaceAreaM2 * 10.7639);

  return {
    maxPanels,
    systemKw,
    actualOccupiedAreaM2,
    surfaceAreaM2,
    areaSqFt,
    panelSpec: spec,
  };
}
