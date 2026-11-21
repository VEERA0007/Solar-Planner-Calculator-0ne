/**
 * Solar Planner & Calculator - Core Domain Models & Types
 */

export type ScreenId =
  | 'welcome'
  | 'dashboard'
  | 'estimator'
  | 'requirements'
  | 'savings'
  | 'appliances'
  | 'shadow'
  | 'maintenance'
  | 'existing'
  | 'ar_view'
  | 'sun_compass'
  | 'sun_timer'
  | 'solar_angles'
  | 'bubble_level'
  | 'solar_flux'
  | 'kp_index'
  | 'power_calc'
  | 'sun_tracker_suite'
  | 'solar_activity'
  | 'android_code';

export type CurrencyCode = 'INR';

export interface CurrencyConfig {
  code: CurrencyCode;
  symbol: string;
  name: string;
  rateToInr: number; // For baseline calculations
}

export type SystemType = 'on-grid' | 'off-grid' | 'hybrid';

export type PanelWattage =
  | 330
  | 400
  | 450
  | 500
  | 540
  | 550
  | 580
  | 600
  | 620
  | 650
  | 680
  | 700
  | 720
  | 750;

export interface DiscomOption {
  id: string;
  state: string;
  discom: string;
  defaultTariff: number; // per kWh in local currency
  currency: CurrencyCode;
  peakSunHours: number;
  latitude: number;
  longitude: number;
}

export interface MonthlyBillRecord {
  month: string; // e.g. 'Dec 2025' .. 'Nov 2026'
  shortLabel?: string; // e.g. "Dec '25" .. "Nov '26"
  calendarMonth0?: number; // 0-11 (Jan=0 .. Dec=11)
  year?: number;
  sequenceNo?: number; // 1 (oldest) .. 12 (present running month)
  isRunningMonth?: boolean; // true for month #12
  isVerifiedPortalData?: boolean; // true when fetched directly from official DISCOM API/table
  unitsKwh: number;
  billAmountInr: number;
  // Official Govt DISCOM Bill & Receipt Ledger Details (read-only)
  demandInr?: number;
  paidInr?: number;
  openingBalanceInr?: number;
  closingBalanceInr?: number;
  adjustmentInr?: number;
  receiptNo?: string;
  paidDate?: string;
}

export interface UscHistoryEntry {
  id: string;
  uscNumber?: string;
  consumerName?: string;
  discomShortName: string;
  discomId?: string;
  stateId: string;
  stateName: string;
  sanctionedLoadKw?: number;
  avgMonthlyUnits: number;
  avgMonthlyBill: number;
  monthsCount: number;
  verifiedMonthsCount: number;
  lastFetchedAtIst: string;
  timestampIso: string;
  months?: MonthlyBillRecord[];
  ownerId?: string;
  isCloudSynced?: boolean;
}

export interface EstimatorInputs {
  mode: 'new' | 'existing';
  locationName: string;
  state: string;
  discom: string;
  tariffPerKwh: number;
  calculationBasis: 'units' | 'bill';
  monthlyUnits: number;
  monthlyBill: number;
  roofArea: number;
  roofAreaUnit: 'sqm' | 'sqft';
  currency: CurrencyCode;
  panelWattage: PanelWattage;
  peakSunHours: number; // e.g. 5.2 hrs/day
  systemType: SystemType;
  requiresBattery: boolean;
  batteryBackupHours: number;
  batteryCriticalLoadPercent: number;
  performanceRatio: number; // 0.75 - 0.82
  // Grid export configuration
  enableGridExport: boolean;
  gridExportMode: 'percent' | 'value';
  gridExportPercent: number; // e.g. 25% of generation
  gridExportKwh: number; // e.g. 100 kWh
  feedInTariffPerKwh: number; // Buyback rate / export credit per kWh
  // DCR (Domestic Content Requirement) and Enquiry fields
  moduleStandard?: 'DCR' | 'NON_DCR';
  consumerCategory?: 'residential' | 'commercial' | 'agricultural';
  phaseType?: 'single_phase' | 'three_phase';
  sanctionedLoadKw?: number;
  // Optional user-specified Inverter Brand & Power Rating (kW)
  inverterBrand?: string;
  inverterPowerKw?: number;
  // 4-State DISCOM USC Service & 12-Month Billing History
  uscNumber?: string;
  uscStateId?: string;
  uscDiscomId?: string;
  monthlyHistory12?: MonthlyBillRecord[];
}

export interface SolarSystemRequirements {
  dailyConsumptionKwh: number;
  monthlyConsumptionKwh: number;
  annualConsumptionKwh: number;
  recommendedCapacityKwp: number;
  requiredPanelCount: number;
  selectedWattage: PanelWattage;
  totalDcCapacityKwp: number;
  requiredRoofAreaSqm: number;
  requiredRoofAreaSqft: number;
  monthlyGenerationKwh: number;
  annualGenerationKwh: number;
  suggestedInverterCapacityKw: number;
  inverterDcAcRatio: number;
  energyCoveragePercent: number;
  estimatedExportKwh: number;
  estimatedSelfConsumptionKwh: number;
  exportFractionPercent: number;
  batteryCapacityKwh?: number;
  // DCR / Non-DCR calculation attributes
  moduleStandard?: 'DCR' | 'NON_DCR';
  dcrPricingMultiplier?: number;
  pricingAdjustmentPerKwp?: number;
  estimatedCostPerKwp?: number;
  estimatedGrossCost?: number;
  subsidyEligible?: boolean;
  estimatedSubsidy?: number;
  estimatedNetCost?: number;
  assumptions: {
    performanceRatio: number;
    solarInsolation: number;
    tempLossFactor: number;
    soilingLossFactor: number;
    areaPerPanelSqm: number;
    maintenanceSpacingPercent: number;
    panelDimensions: string;
  };
}

export interface FinancialSavingsEstimate {
  monthlySavings: number; // Total combined savings (avoided costs + export revenue)
  annualSavings: number;
  monthlySelfConsumptionSavings: number; // Value of energy used directly
  annualSelfConsumptionSavings: number;
  monthlyExportRevenue: number; // Cash or credit from exported energy
  annualExportRevenue: number;
  exportedMonthlyUnits: number;
  selfConsumedMonthlyUnits: number;
  feedInTariffUsed: number;
  grossInstallationCost: number;
  governmentSubsidy: number;
  netInstallationCost: number;
  simplePaybackYears: number;
  paybackMonthsRemainder: number;
  twentyFiveYearSavings: number;
  roiPercentage: number;
  monthlyGenerationBreakdown: {
    month: string;
    generationKwh: number;
    consumptionKwh: number;
    selfConsumedKwh: number;
    exportedKwh: number;
    exportRevenue: number;
    selfSavings: number;
    netSavings: number;
  }[];
}

export interface Appliance {
  id: string;
  name: string;
  category: 'cooling' | 'kitchen' | 'entertainment' | 'lighting' | 'utility' | 'heavy' | 'other';
  quantity: number;
  ratedWatts: number;
  hoursPerDay: number;
  daysPerMonth: number;
  iconName?: string;
  operatingPhase?: 'auto' | 'single_phase' | 'three_phase';
  ratedVoltage?: 230 | 415;
}

export interface ShadowCalculationInputs {
  locationName: string;
  roofOrientation: 'South' | 'South-East' | 'South-West' | 'East' | 'West' | 'North';
  latitude: number;
  obstacleType: 'Parapet Wall' | 'Water Tank' | 'Chimney' | 'Adjacent Building' | 'Tree' | 'Custom';
  obstacleHeight: number; // meters
  obstacleDistance: number; // meters from panel edge
  tiltAngle: number; // degrees
  timeOfDayHour: number; // 9 to 16
  season: 'winter' | 'equinox' | 'summer';
}

export interface ShadowCalculationResults {
  obstacleElevationAngleDeg: number;
  sunElevationAngleDeg: number;
  sunAzimuthDeg: number;
  estimatedShadowLengthMeters: number;
  minRecommendedClearanceMeters: number;
  shadingRiskLevel: 'LOW_CLEAR' | 'MODERATE_MORNING_EVENING' | 'HIGH_SHADE_RISK';
  shadingRiskMessage: string;
  guidanceSteps: string[];
}

export interface MaintenanceRecord {
  id: string;
  type: 'cleaning' | 'inverter_inspection' | 'electrical_check' | 'other';
  date: string;
  title: string;
  soilingLevel?: 'Light Dust' | 'Moderate Dirt' | 'Heavy Pollen/Bird Droppings';
  efficiencyGainPercent?: number;
  inverterStatus?: 'Healthy / Normal' | 'Warning' | 'Error Code Found';
  errorCode?: string;
  technicianName?: string;
  notes: string;
  cost?: number;
  nextScheduledDate?: string;
}

export interface CustomerInstallationProfile {
  customerName: string;
  installationDate: string;
  systemCapacityKwp: number;
  inverterModel: string;
  panelBrand: string;
  installerContact: string;
  warrantyYears: number;
  city: string;
  address?: string;
  sanctionedLoadKw?: number;
  discomName?: string;
  consumerNumber?: string;
  mobileNumber?: string;
  email?: string;
  pinCode?: string;
  phaseType?: 'Single Phase' | 'Three Phase';
  tariffCategory?: 'Domestic / Residential' | 'Commercial' | 'Industrial' | 'Agricultural';
  averageMonthlyBill?: number;
  roofAreaSqft?: number;
  roofType?: 'RCC Flat' | 'Tin / Metal Sheet' | 'Tiled / Slanted' | 'Elevated Superstructure';
  dbtBankLinked?: boolean;
  subsidyApplicationStatus?: 'Eligible' | 'Applied / In Review' | 'Approved & Sanctioned';
  subsidyAmountInr?: number;
}

export interface ExistingSystemInputs {
  uscNumber?: string;
  stateId?: string;
  discomId?: string;
  auditedMonths?: MonthlyBillRecord[];
  installedCapacityKwp: number;
  panelWattage: number;
  panelQuantity: number;
  inverterCapacityKw: number;
  inverterType: 'String' | 'Microinverter' | 'Hybrid';
  monthlyGenerationKwh: number;
  monthlyConsumptionKwh: number;
  gridImportKwh: number;
  gridExportKwh: number;
  preSolarMonthlyBill: number;
  currentMonthlyBill: number;
  currency: CurrencyCode;
}

export interface ExistingSystemAnalysis {
  performanceRatioPercent: number; // actual vs theoretical
  specificYieldKwhPerKwpPerDay: number;
  selfConsumptionRatePercent: number;
  actualMonthlySavings: number;
  actualAnnualSavingsRate: number;
  billReductionPercent: number;
  healthStatus: 'OPTIMAL' | 'MODERATE_ATTENTION' | 'UNDERPERFORMING';
  diagnosticRecommendations: string[];
}

export interface WeatherCondition {
  city: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  apparentTempC: number;
  cloudCoverPercent: number;
  uvIndex: number;
  weatherCode: number;
  weatherDescription: string;
  directNormalIrradianceWpm2: number;
  globalHorizontalIrradianceWpm2: number;
  sunshineDurationHours: number;
  sunrise: string;
  sunset: string;
  peakSunHoursEstimated: number;
  cloudImpactRatio: number; // 0.6 - 1.0 multiplier on theoretical sun
  isLive: boolean;
  lastUpdated: string;
}

/**
 * Engineering Rooftop Layout & Setback Specifications
 * Supports:
 * - Gap between panels: 0–500 mm
 * - Gap between panel rows: separately configurable (0–2000 mm)
 * - Fabrication clearance at structure edges
 * - Walkway width (maintenance pathways)
 * - Roof boundary clearance (parapet setbacks)
 * - Obstacle clearance (buffers around vents, tanks, mumty)
 * - Automatic portrait/landscape layout
 */
export type PanelOrientation = 'auto' | 'portrait' | 'landscape';

export interface RoofObstacle {
  id: string;
  name: string;
  type: 'water_tank' | 'hvac' | 'vent' | 'mumty_stair' | 'chimney' | 'skylight' | 'other';
  widthM: number;
  lengthM: number;
  areaM2: number;
  xOffsetPercent?: number; // 0-100% position on roof
  yOffsetPercent?: number;
}

export interface RoofLayoutConfig {
  interPanelGapMm: number; // 0–500 mm
  interRowGapMm: number; // Separately configurable, 0–2000 mm
  fabricationEdgeClearanceMm: number; // 0–500 mm
  walkwayWidthMm: number; // 0–1500 mm
  walkwayFrequencyRows: number; // Insert walkway corridor every N rows
  roofBoundaryClearanceMm: number; // 0–1500 mm
  obstacleClearanceMm: number; // 0–2000 mm
  orientation: PanelOrientation; // 'auto' | 'portrait' | 'landscape'
  obstacles: RoofObstacle[];
}

export interface PanelPosition {
  id: string;
  row: number;
  col: number;
  xMm: number;
  yMm: number;
  widthMm: number;
  lengthMm: number;
  orientation: 'portrait' | 'landscape';
  isWalkwayAdjacent?: boolean;
}

export interface LayoutAnalysisResult {
  orientation: 'portrait' | 'landscape';
  isOptimal: boolean;
  panelsCount: number;
  systemKw: number;
  rows: number;
  cols: number;
  usableAreaM2: number;
  occupiedAreaM2: number;
  setbackAreaM2: number;
  walkwayAreaM2: number;
  obstacleAreaM2: number;
  obstacleBufferAreaM2: number;
  totalAreaM2: number;
  areaUtilizationPercent: number;
  panelPositions: PanelPosition[];
  comparison: {
    portraitPanels: number;
    portraitKw: number;
    landscapePanels: number;
    landscapeKw: number;
    diffPercent: number;
    recommended: 'portrait' | 'landscape';
  };
}

export interface AccountCorrectionFactor {
  accountKey: string;
  uscNumber?: string;
  factor: number; // Multiplier (e.g. 1.045 = +4.5% adjustment vs base govt slab)
  fixedOffsetInr?: number; // Optional recurring fixed surcharge/arrears adjustment (e.g. ₹30 AGL dues)
  sampleMonthsCount: number;
  avgVariancePct: number;
  note?: string;
  updatedAtIso: string;
}

