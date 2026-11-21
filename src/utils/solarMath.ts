import {
  Appliance,
  CurrencyCode,
  EstimatorInputs,
  ExistingSystemAnalysis,
  ExistingSystemInputs,
  FinancialSavingsEstimate,
  PanelWattage,
  ShadowCalculationInputs,
  ShadowCalculationResults,
  SolarSystemRequirements,
  SystemType,
} from '../types/solar';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  INR: '₹',
};

import {
  InverterHardwareModel,
  SOLAR_PANEL_CATALOG,
  SolarPanelModel,
  getPanelSpecification,
} from '../data/panelDatabase';
import {
  FourStateId,
  computeExactDiscomBill,
  estimateUnitsFromExactBill,
} from '../data/uscPortals';

function resolveFourStateFromInputs(inputs: EstimatorInputs): FourStateId {
  const st = (inputs.uscStateId || inputs.state || inputs.locationName || '').toLowerCase();
  if (st.includes('andhra')) return 'andhra_pradesh';
  if (st.includes('odis') || st.includes('orissa')) return 'odissa';
  if (st.includes('chandigarh')) return 'chandigarh';
  return 'telangana';
}

export { SOLAR_PANEL_CATALOG, getPanelSpecification };
export type { SolarPanelModel, InverterHardwareModel };

export const PANEL_SPECS: Record<PanelWattage, SolarPanelModel> = {
  330: {
    wattage: 330,
    lengthMm: 1960,
    widthMm: 992,
    thicknessMm: 35,
    dimensionsMm: '1960 × 992 mm',
    dimensions: '1960 x 992 x 35 mm',
    areaSqm: 1.95,
    areaSqFt: 21.0,
    efficiencyPercent: 17.2,
    weightKg: 21.5,
    tier: 'Legacy Residential',
    description: '330 W • 1960 × 992 mm • 1.95 m²',
    dcrEligible: true,
    nonDcrEligible: true,
    cellTechnology: 'Legacy Poly / Mono PERC',
    recommendedBrands: ['Vikram Solar', 'Luminous'],
  },
  400: getPanelSpecification(400) as SolarPanelModel,
  450: getPanelSpecification(450) as SolarPanelModel,
  500: getPanelSpecification(500) as SolarPanelModel,
  540: getPanelSpecification(540) as SolarPanelModel,
  550: getPanelSpecification(550) as SolarPanelModel,
  580: getPanelSpecification(580) as SolarPanelModel,
  600: getPanelSpecification(600) as SolarPanelModel,
  620: getPanelSpecification(620) as SolarPanelModel,
  650: getPanelSpecification(650) as SolarPanelModel,
  680: getPanelSpecification(680) as SolarPanelModel,
  700: getPanelSpecification(700) as SolarPanelModel,
  720: getPanelSpecification(720) as SolarPanelModel,
  750: getPanelSpecification(750) as SolarPanelModel,
};

export function getPanelSpec(wattage: number): SolarPanelModel {
  return getPanelSpecification(wattage);
}

/**
 * Calculates Solar System Requirements based on user inputs
 */
export function calculateSolarSystemRequirements(
  inputs: EstimatorInputs
): SolarSystemRequirements {
  // 1. Determine monthly consumption in kWh using exact state DISCOM tariff slabs when bill-based
  let monthlyUnits = inputs.monthlyUnits;
  if (inputs.calculationBasis === 'bill' && inputs.monthlyBill > 0) {
    const stateId = resolveFourStateFromInputs(inputs);
    const gridCat = inputs.consumerCategory === 'commercial' ? 'commercial' : 'domestic';
    const sanctionedKw = Math.max(1, inputs.sanctionedLoadKw || 2);
    const slabUnits = estimateUnitsFromExactBill(
      inputs.monthlyBill,
      stateId,
      gridCat,
      sanctionedKw,
      {
        accountNumber: inputs.uscNumber || 'DEFAULT-METER',
      }
    );
    monthlyUnits =
      slabUnits > 0
        ? slabUnits
        : Math.round(inputs.monthlyBill / Math.max(inputs.tariffPerKwh || 7.15, 0.1));
  }
  monthlyUnits = Math.max(monthlyUnits, 30); // minimum baseline 30 kWh

  const dailyConsumptionKwh = monthlyUnits / 30;
  const annualConsumptionKwh = monthlyUnits * 12;

  // 2. Solar sizing math:
  // Required Capacity (kWp) = Daily Consumption (kWh) / (Peak Sun Hours * Performance Ratio)
  const pr = inputs.performanceRatio || 0.78;
  const peakSun = Math.max(inputs.peakSunHours || 5.0, 2.5);

  const rawRecommendedKwp = dailyConsumptionKwh / (peakSun * pr);

  // 3. Panel count based on selected wattage
  const panelWattageKw = inputs.panelWattage / 1000;
  // Calculate exact integer panels required to meet or slightly exceed recommendation
  let panelCount = Math.ceil(rawRecommendedKwp / panelWattageKw);
  if (panelCount < 2) panelCount = 2; // minimum dual panel string for string/micro inverters

  const totalDcCapacityKwp = Number((panelCount * panelWattageKw).toFixed(2));
  const recommendedCapacityKwp = Number(rawRecommendedKwp.toFixed(2));

  // 4. Roof area estimation:
  // Panel area + 28% for row tilt shading distance and maintenance walkways
  const panelSpec = PANEL_SPECS[inputs.panelWattage];
  const netPanelsAreaSqm = panelCount * panelSpec.areaSqm;
  const requiredRoofAreaSqm = Number((netPanelsAreaSqm * 1.28).toFixed(1));
  const requiredRoofAreaSqft = Math.round(requiredRoofAreaSqm * 10.7639);

  // 5. Generation modeling:
  // Daily generation = DC Capacity * Peak Sun Hours * PR
  const dailyGenKwh = totalDcCapacityKwp * peakSun * pr;
  const monthlyGenerationKwh = Math.round(dailyGenKwh * 30);
  const annualGenerationKwh = Math.round(dailyGenKwh * 365);

  // 6. Inverter sizing:
  // Typically DC:AC ratio is 1.15 to 1.25
  const suggestedInverterCapacityKw = Number((totalDcCapacityKwp / 1.18).toFixed(1));

  // 7. Energy coverage percentage
  const energyCoveragePercent = Math.min(
    Math.round((monthlyGenerationKwh / monthlyUnits) * 100),
    120
  );

  // 8. Grid export allocation
  let estimatedExportKwh = 0;
  let estimatedSelfConsumptionKwh = monthlyGenerationKwh;
  let exportFractionPercent = 0;

  if (inputs.enableGridExport && inputs.systemType !== 'off-grid') {
    if (inputs.gridExportMode === 'value') {
      estimatedExportKwh = Math.min(
        Math.max(inputs.gridExportKwh ?? 0, 0),
        monthlyGenerationKwh
      );
      exportFractionPercent = monthlyGenerationKwh > 0
        ? Math.round((estimatedExportKwh / monthlyGenerationKwh) * 100)
        : 0;
      estimatedSelfConsumptionKwh = monthlyGenerationKwh - estimatedExportKwh;
    } else {
      exportFractionPercent = Math.min(
        Math.max(inputs.gridExportPercent ?? 25, 0),
        100
      );
      estimatedExportKwh = Math.round(
        monthlyGenerationKwh * (exportFractionPercent / 100)
      );
      estimatedSelfConsumptionKwh = monthlyGenerationKwh - estimatedExportKwh;
    }
  }

  // 9. Battery capacity if required
  let batteryCapacityKwh: number | undefined;
  const backupHours = inputs.batteryBackupHours ?? 0;
  if (inputs.requiresBattery && backupHours > 0) {
    // Critical load kWh for requested backup hours
    const criticalFraction = (inputs.batteryCriticalLoadPercent || 60) / 100;
    const hourlyConsumption = dailyConsumptionKwh / 24;
    // With 80% depth of discharge (DoD) for LiFePO4 or 50% for Lead Acid
    batteryCapacityKwh = Number(
      ((hourlyConsumption * criticalFraction * backupHours) / 0.85).toFixed(1)
    );
  }

    // 10. DCR / Non-DCR multiplier and pricing adjustment:
    const moduleStandard = inputs.moduleStandard || 'DCR';
    const isDCR = moduleStandard !== 'NON_DCR';

    // DCR multiplier: 1.15x for DCR (domestic cell & ALMM compliance premium), 0.88x for Non-DCR (open category commodity module)
    const dcrPricingMultiplier = isDCR ? 1.15 : 0.88;
    const pricingAdjustmentPerKwp = isDCR ? 6000 : -6000;
    
    // Base turnkey cost per kWp before/after multiplier (INR):
    // Baseline: ₹48,000 -> DCR: ₹54,000 / kWp; Non-DCR: ₹42,000 / kWp
    const baseRate = 48000;
    const estimatedCostPerKwp = Math.round(baseRate * dcrPricingMultiplier);

    const estimatedGrossCost = Math.round(totalDcCapacityKwp * estimatedCostPerKwp);
    
    // PM Surya Ghar subsidy is eligible ONLY for DCR grid-tied / hybrid residential systems
    const subsidyEligible =
      isDCR &&
      inputs.consumerCategory !== 'commercial' &&
      inputs.systemType !== 'off-grid';
    let estimatedSubsidy = 0;
    if (subsidyEligible) {
      if (totalDcCapacityKwp < 1.0) {
        estimatedSubsidy = Math.round(totalDcCapacityKwp * 30000);
      } else if (totalDcCapacityKwp < 2.0) {
        estimatedSubsidy = 30000 + Math.round((totalDcCapacityKwp - 1.0) * 30000);
      } else if (totalDcCapacityKwp < 3.0) {
        estimatedSubsidy = 60000 + Math.round((totalDcCapacityKwp - 2.0) * 18000);
      } else {
        estimatedSubsidy = 78000;
      }
    }

    const estimatedNetCost = Math.max(estimatedGrossCost - estimatedSubsidy, 1000);

    return {
      dailyConsumptionKwh: Number(dailyConsumptionKwh.toFixed(2)),
      monthlyConsumptionKwh: Math.round(monthlyUnits),
      annualConsumptionKwh: Math.round(annualConsumptionKwh),
      recommendedCapacityKwp,
      requiredPanelCount: panelCount,
      selectedWattage: inputs.panelWattage,
      totalDcCapacityKwp,
      requiredRoofAreaSqm,
      requiredRoofAreaSqft,
      monthlyGenerationKwh,
      annualGenerationKwh,
      suggestedInverterCapacityKw,
      inverterDcAcRatio: 1.18,
      energyCoveragePercent,
      estimatedExportKwh,
      estimatedSelfConsumptionKwh,
      exportFractionPercent,
      batteryCapacityKwh,
      moduleStandard,
      dcrPricingMultiplier,
      pricingAdjustmentPerKwp,
      estimatedCostPerKwp,
      estimatedGrossCost,
      subsidyEligible,
      estimatedSubsidy,
      estimatedNetCost,
      assumptions: {
        performanceRatio: pr,
        solarInsolation: peakSun,
        tempLossFactor: 0.08,
        soilingLossFactor: 0.04,
        areaPerPanelSqm: panelSpec.areaSqm,
        maintenanceSpacingPercent: 28,
        panelDimensions: panelSpec.dimensions,
      },
    };
  }

  /**
   * Calculates financial savings, government subsidies (PM Surya Ghar for India),
   * net investment, payback period, and 25-year returns.
   * Accounts for avoided retail utility costs AND revenue from excess grid export.
   */
  export function calculateFinancialSavings(
    inputs: EstimatorInputs,
    reqs: SolarSystemRequirements
  ): FinancialSavingsEstimate {
    const kwp = reqs.totalDcCapacityKwp;

    // Approximate turnkey cost per kWp incorporating DCR status and pricing multiplier (INR):
    const isDCR = (inputs.moduleStandard || reqs.moduleStandard) !== 'NON_DCR';
    const costPerKwp = reqs.estimatedCostPerKwp || (isDCR ? 54000 : 42000);

    let grossInstallationCost = reqs.estimatedGrossCost || Math.round(kwp * costPerKwp);
    if (inputs.requiresBattery && reqs.batteryCapacityKwh) {
      const batteryCostPerKwh = 22000;
      grossInstallationCost += Math.round(reqs.batteryCapacityKwh * batteryCostPerKwh);
    }

    // Government subsidy calculation:
    // In India: PM Surya Ghar Muft Bijli Yojana applies ONLY if DCR is selected and not standalone off-grid!
    let governmentSubsidy = 0;
    if (isDCR && inputs.systemType !== 'off-grid' && inputs.consumerCategory !== 'commercial') {
      if (kwp < 1.0) {
        governmentSubsidy = Math.round(kwp * 30000);
      } else if (kwp < 2.0) {
        governmentSubsidy = 30000 + Math.round((kwp - 1.0) * 30000);
      } else if (kwp < 3.0) {
        governmentSubsidy = 60000 + Math.round((kwp - 2.0) * 18000);
      } else {
        governmentSubsidy = 78000; // max cap for residential
      }
    } else {
      // Non-DCR is strictly 0 subsidy under PM Surya Ghar
      governmentSubsidy = 0;
    }

    const netInstallationCost = Math.max(grossInstallationCost - governmentSubsidy, 1000);

  // Tariffs: Retail electricity tariff & Feed-in Tariff (FiT)
  const resolvedState = resolveFourStateFromInputs(inputs);
  const resolvedCat = inputs.consumerCategory === 'commercial' ? 'commercial' : 'domestic';
  const exactSlabBillForUnits = computeExactDiscomBill(
    reqs.monthlyConsumptionKwh,
    resolvedState,
    resolvedCat,
    inputs.sanctionedLoadKw || 2,
    {
      accountNumber: inputs.uscNumber || 'DEFAULT-METER',
    }
  );
  const blendedSlabTariff =
    reqs.monthlyConsumptionKwh > 0
      ? Number((exactSlabBillForUnits / reqs.monthlyConsumptionKwh).toFixed(2))
      : 7.15;
  const tariff = inputs.tariffPerKwh && inputs.tariffPerKwh > 0 ? inputs.tariffPerKwh : blendedSlabTariff;
  const feedInTariff = inputs.feedInTariffPerKwh && inputs.feedInTariffPerKwh > 0
    ? inputs.feedInTariffPerKwh
    : 3.1;

  // Export and Self-consumption quantities
  const exportedMonthlyUnits = reqs.estimatedExportKwh;
  const selfConsumedMonthlyUnits = reqs.estimatedSelfConsumptionKwh;

  // 1. Avoided cost from self-consumption (cannot exceed actual consumption / monthly bill)
  const rawSelfSavings = Math.round(
    Math.min(selfConsumedMonthlyUnits, reqs.monthlyConsumptionKwh) * tariff
  );
  const monthlySelfConsumptionSavings =
    selfConsumedMonthlyUnits >= reqs.monthlyConsumptionKwh
      ? Math.max(rawSelfSavings, exactSlabBillForUnits > 0 && Math.abs(tariff - blendedSlabTariff) < 0.25 ? exactSlabBillForUnits : rawSelfSavings)
      : rawSelfSavings;
  const annualSelfConsumptionSavings = monthlySelfConsumptionSavings * 12;

  // 2. Revenue from excess energy returned to grid (at Feed-in Tariff)
  const monthlyExportRevenue = Math.round(exportedMonthlyUnits * feedInTariff);
  const annualExportRevenue = monthlyExportRevenue * 12;

  // Total Combined Economic Benefit (Savings + Revenue)
  const monthlySavings = monthlySelfConsumptionSavings + monthlyExportRevenue;
  const annualSavings = annualSelfConsumptionSavings + annualExportRevenue;

  // Simple payback period
  const rawPaybackYears = annualSavings > 0 ? netInstallationCost / annualSavings : 99;
  const simplePaybackYears = Math.floor(rawPaybackYears);
  const paybackMonthsRemainder = Math.round((rawPaybackYears - simplePaybackYears) * 12);

  // 25-year financial outlook:
  // Takes into account 0.5% yearly degradation, 2.5% annual tariff escalation,
  // and a mid-life inverter replacement allowance at Year 12.
  let cumulativeSavings = 0;
  let currentTariff = tariff;
  let currentFeedIn = feedInTariff;
  let degradation = 1.0;
  const annualBaseGen = reqs.annualGenerationKwh;
  const exportFraction = reqs.exportFractionPercent / 100;

  for (let year = 1; year <= 25; year++) {
    const yearGen = annualBaseGen * degradation;
    const yearExportKwh = yearGen * exportFraction;
    const yearSelfKwh = yearGen - yearExportKwh;

    const yearSelfSavings = Math.min(yearSelfKwh, reqs.annualConsumptionKwh) * currentTariff;
    const yearExportRevenue = yearExportKwh * currentFeedIn;

    cumulativeSavings += (yearSelfSavings + yearExportRevenue);

    // Apply degradation & tariff hike
    degradation *= 0.995; // 0.5% drop
    currentTariff *= 1.025; // 2.5% retail escalation
    currentFeedIn *= 1.015; // 1.5% feed-in tariff adjustment
  }

  // Deduct inverter replacement at year 12
  const inverterReplacementAllowance = grossInstallationCost * 0.15;
  const twentyFiveYearSavings = Math.round(
    cumulativeSavings - netInstallationCost - inverterReplacementAllowance
  );

  const roiPercentage = Math.round(
    ((cumulativeSavings - netInstallationCost) / netInstallationCost) * 100
  );

  // 12-month generation seasonality curve (higher in Spring/Summer, lower in monsoon/winter)
  const monthWeights = [0.85, 0.92, 1.15, 1.25, 1.22, 0.88, 0.78, 0.82, 0.95, 1.05, 0.92, 0.8];
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const monthlyGenerationBreakdown = monthNames.map((m, idx) => {
    const weight = monthWeights[idx];
    const gen = Math.round((reqs.monthlyGenerationKwh * weight) / 0.97);
    const cons = Math.round(reqs.monthlyConsumptionKwh * (idx >= 3 && idx <= 5 ? 1.15 : 0.95));

    const expKwh = Math.round(gen * exportFraction);
    const selfKwh = gen - expKwh;

    const selfSavings = Math.round(Math.min(selfKwh, cons) * tariff);
    const exportRev = Math.round(expKwh * feedInTariff);
    const netSavings = selfSavings + exportRev;

    return {
      month: m,
      generationKwh: gen,
      consumptionKwh: cons,
      selfConsumedKwh: selfKwh,
      exportedKwh: expKwh,
      exportRevenue: exportRev,
      selfSavings: selfSavings,
      netSavings: netSavings,
    };
  });

  return {
    monthlySavings,
    annualSavings,
    monthlySelfConsumptionSavings,
    annualSelfConsumptionSavings,
    monthlyExportRevenue,
    annualExportRevenue,
    exportedMonthlyUnits,
    selfConsumedMonthlyUnits,
    feedInTariffUsed: feedInTariff,
    grossInstallationCost,
    governmentSubsidy,
    netInstallationCost,
    simplePaybackYears,
    paybackMonthsRemainder,
    twentyFiveYearSavings,
    roiPercentage,
    monthlyGenerationBreakdown,
  };
}

/**
 * Returns per-appliance operating voltage (V), line current (A), and phase-adjusted energy usage
 */
export function getApplianceEffectiveMetrics(
  item: Appliance,
  phaseType: 'single_phase' | 'three_phase' = 'single_phase'
) {
  const totalWatts = Math.max(0, item.quantity * item.ratedWatts);
  const isHeavyOr3PhaseItem =
    item.operatingPhase === 'three_phase' ||
    item.ratedVoltage === 415 ||
    (item.operatingPhase !== 'single_phase' &&
      (item.category === 'heavy' || totalWatts >= 2000));

  const effectiveVoltageV: 230 | 415 =
    phaseType === 'three_phase' && isHeavyOr3PhaseItem ? 415 : 230;

  // Balanced 415V 3-phase heavy loads avoid ~4% single-line I^2R & inductive drop;
  // forcing heavy >1.5kW loads onto 230V 1-phase incurs ~4% distribution/line drop overhead.
  const phaseUsageMultiplier =
    phaseType === 'three_phase'
      ? isHeavyOr3PhaseItem
        ? 0.96
        : 0.98
      : totalWatts >= 1500
      ? 1.04
      : 1.0;

  const baseDailyKwh = (totalWatts * item.hoursPerDay) / 1000;
  const dailyKwh = baseDailyKwh * phaseUsageMultiplier;
  const monthlyKwh = dailyKwh * item.daysPerMonth;
  const currentAmps =
    effectiveVoltageV === 415
      ? totalWatts / (Math.sqrt(3) * 415 * 0.88)
      : totalWatts / (230 * 0.9);

  return {
    totalWatts,
    voltageV: effectiveVoltageV,
    currentAmps: Number(currentAmps.toFixed(1)),
    dailyKwh: Number(dailyKwh.toFixed(2)),
    monthlyKwh: Number(monthlyKwh.toFixed(1)),
    phaseUsageMultiplier,
  };
}

/**
 * Calculates total energy, supply volts (230V/415V), current (A), and phase recommendations
 */
export function calculateApplianceEnergy(
  appliances: Appliance[],
  phaseType: 'single_phase' | 'three_phase' = 'single_phase',
  consumerCategory: 'residential' | 'commercial' | 'agricultural' = 'residential'
) {
  let baseDailyKwh = 0;
  let baseMonthlyKwh = 0;
  let dailyKwh = 0;
  let monthlyKwh = 0;
  let connectedLoadWatts = 0;
  let hasThreePhaseAppliance = false;

  for (const item of appliances) {
    const rawWatts = Math.max(0, item.quantity * item.ratedWatts);
    connectedLoadWatts += rawWatts;
    baseDailyKwh += (rawWatts * item.hoursPerDay) / 1000;
    baseMonthlyKwh += (rawWatts * item.hoursPerDay * item.daysPerMonth) / 1000;

    if (
      item.operatingPhase === 'three_phase' ||
      item.ratedVoltage === 415 ||
      item.category === 'heavy'
    ) {
      hasThreePhaseAppliance = true;
    }

    const eff = getApplianceEffectiveMetrics(item, phaseType);
    dailyKwh += eff.dailyKwh;
    monthlyKwh += eff.monthlyKwh;
  }

  // Commercial / Agricultural applications carry duty-cycle continuous shift utilization
  const applicationFactor =
    consumerCategory === 'commercial'
      ? 1.12
      : consumerCategory === 'agricultural'
      ? 1.18
      : 1.0;

  dailyKwh *= applicationFactor;
  monthlyKwh *= applicationFactor;

  const supplyVoltageV: 230 | 415 = phaseType === 'three_phase' ? 415 : 230;
  const connectedLoadKw = Number((connectedLoadWatts / 1000).toFixed(2));
  const powerFactor = phaseType === 'three_phase' ? 0.88 : 0.9;
  const lineCurrentAmps =
    phaseType === 'three_phase'
      ? Number((connectedLoadWatts / (Math.sqrt(3) * 415 * powerFactor)).toFixed(1))
      : Number((connectedLoadWatts / (230 * powerFactor)).toFixed(1));

  const recommendedPhase: 'single_phase' | 'three_phase' =
    connectedLoadWatts > 5000 ||
    hasThreePhaseAppliance ||
    consumerCategory === 'commercial' ||
    consumerCategory === 'agricultural'
      ? 'three_phase'
      : 'single_phase';

  const isPhaseOverloaded = phaseType === 'single_phase' && connectedLoadWatts > 5000;

  return {
    dailyKwh: Number(dailyKwh.toFixed(2)),
    monthlyKwh: Math.round(monthlyKwh),
    annualKwh: Math.round(monthlyKwh * 12),
    baseDailyKwh: Number(baseDailyKwh.toFixed(2)),
    baseMonthlyKwh: Math.round(baseMonthlyKwh),
    supplyVoltageV,
    connectedLoadWatts,
    connectedLoadKw,
    lineCurrentAmps,
    powerFactor,
    recommendedPhase,
    isPhaseOverloaded,
  };
}

/**
 * Shadow Tracker Geometry Engine
 */
export function calculateShadowGeometry(
  inputs: ShadowCalculationInputs
): ShadowCalculationResults {
  const H = Math.max(inputs.obstacleHeight, 0.1);
  const D = Math.max(inputs.obstacleDistance, 0.1);

  // 1. Obstacle elevation angle from panels = atan(H / D)
  const obstacleElevationAngleDeg = Number(
    ((Math.atan(H / D) * 180) / Math.PI).toFixed(1)
  );

  // 2. Solar sun elevation angle estimation
  // In winter solstice (Dec 21 Northern Hemisphere / June 21 Southern Hemisphere),
  // Sun noon altitude = 90 - latitude - 23.45
  const lat = Math.abs(inputs.latitude || 22.0);
  let solarNoonAltitude = 90 - lat;
  if (inputs.season === 'winter') {
    solarNoonAltitude -= 23.45;
  } else if (inputs.season === 'summer') {
    solarNoonAltitude = Math.min(90 - lat + 23.45, 88);
  }

  // Adjust for hour of day (peaks at noon 12, drops toward 9am/4pm)
  const hourDiffFromNoon = Math.abs((inputs.timeOfDayHour || 12) - 12);
  const hourFactor = Math.cos((hourDiffFromNoon / 6) * (Math.PI / 2));
  const sunElevationAngleDeg = Math.max(
    Number((solarNoonAltitude * hourFactor).toFixed(1)),
    8
  );

  // Solar azimuth estimate based on orientation
  const sunAzimuthDeg = 180 + (inputs.timeOfDayHour - 12) * 15;

  // 3. Shadow length = H / tan(sunAltitude)
  const sunAltRad = (sunElevationAngleDeg * Math.PI) / 180;
  const estimatedShadowLengthMeters = Number((H / Math.tan(sunAltRad)).toFixed(2));

  // 4. Minimum recommended clearance distance for winter 9 AM to 3 PM
  // At winter 9 AM / 3 PM solar altitude is ~ 22-25°
  const winterMinAltRad = (24 * Math.PI) / 180;
  const minRecommendedClearanceMeters = Number(
    (H / Math.tan(winterMinAltRad) * 1.15).toFixed(2)
  );

  // 5. Risk classification
  let shadingRiskLevel: 'LOW_CLEAR' | 'MODERATE_MORNING_EVENING' | 'HIGH_SHADE_RISK' =
    'LOW_CLEAR';
  let shadingRiskMessage =
    'Clearance is optimal. The obstacle will not cast significant shade on panels during prime generation hours (9 AM - 4 PM).';

  if (D < estimatedShadowLengthMeters) {
    shadingRiskLevel = 'HIGH_SHADE_RISK';
    shadingRiskMessage = `Warning: Shadow length (${estimatedShadowLengthMeters}m) exceeds distance (${D}m). Panels will be shaded at this sun angle!`;
  } else if (D < minRecommendedClearanceMeters) {
    shadingRiskLevel = 'MODERATE_MORNING_EVENING';
    shadingRiskMessage = `Caution: Clearance is adequate for mid-day, but panels may receive shadows during early morning or winter afternoons.`;
  }

  const guidanceSteps = [
    `Maintain at least ${minRecommendedClearanceMeters}m setback from the ${inputs.obstacleType.toLowerCase()} to prevent winter peak loss.`,
    `If roof area is limited, position microinverters or bypass diodes on strings facing the obstacle to isolate shade losses.`,
    `Ensure the roof pitch / panel tilt angle (${inputs.tiltAngle}°) is tilted towards true South in Northern latitudes.`,
  ];

  return {
    obstacleElevationAngleDeg,
    sunElevationAngleDeg,
    sunAzimuthDeg: Number(sunAzimuthDeg.toFixed(1)),
    estimatedShadowLengthMeters,
    minRecommendedClearanceMeters,
    shadingRiskLevel,
    shadingRiskMessage,
    guidanceSteps,
  };
}

/**
 * Existing Solar System Performance Audit
 */
export function analyzeExistingSystem(
  inputs: ExistingSystemInputs
): ExistingSystemAnalysis {
  const kwp = Math.max(inputs.installedCapacityKwp, 0.5);
  const gen = Math.max(inputs.monthlyGenerationKwh, 1);
  const cons = Math.max(inputs.monthlyConsumptionKwh, 1);

  // Specific yield = Monthly gen / (kWp * 30 days)
  const specificYield = Number((gen / (kwp * 30)).toFixed(2));

  // Benchmark expected generation in moderate sun: ~4.0 - 4.5 kWh/kWp/day
  // Performance Ratio PR = (Actual Specific Yield / 4.5) * 100
  const prPercent = Math.min(Math.round((specificYield / 4.4) * 100), 98);

  // Self-consumption rate:
  // If net metering export is provided:
  let selfConsumptionPercent = 75;
  if (inputs.gridExportKwh > 0 && gen > 0) {
    const exported = Math.min(inputs.gridExportKwh, gen);
    selfConsumptionPercent = Math.round(((gen - exported) / gen) * 100);
  } else {
    selfConsumptionPercent = Math.min(Math.round((cons / gen) * 85), 100);
  }

  // Monthly savings = Pre-solar bill - current bill
  const actualMonthlySavings = Math.max(
    inputs.preSolarMonthlyBill - inputs.currentMonthlyBill,
    0
  );
  const actualAnnualSavingsRate = actualMonthlySavings * 12;

  const billReductionPercent = inputs.preSolarMonthlyBill > 0
    ? Math.round((actualMonthlySavings / inputs.preSolarMonthlyBill) * 100)
    : 0;

  // Diagnostic classification
  let healthStatus: 'OPTIMAL' | 'MODERATE_ATTENTION' | 'UNDERPERFORMING' =
    'OPTIMAL';
  const recommendations: string[] = [];

  if (prPercent >= 75) {
    healthStatus = 'OPTIMAL';
    recommendations.push(
      'System is operating within prime efficiency benchmarks (PR ≥ 75%). Continue scheduled quarterly wipe-downs.'
    );
    recommendations.push(
      'Inverter conversion efficiency looks healthy with minimal clipping.'
    );
  } else if (prPercent >= 60) {
    healthStatus = 'MODERATE_ATTENTION';
    recommendations.push(
      'Performance Ratio is lower than benchmark (60-74%). Check for surface soiling, dust accumulation, or bird droppings.'
    );
    recommendations.push(
      'Inspect trees or newly constructed rooftop obstacles casting partial string shading.'
    );
  } else {
    healthStatus = 'UNDERPERFORMING';
    recommendations.push(
      'Severe underperformance detected (PR < 60%). Inspect inverter for tripped MPPT strings or blown DC fuses.'
    );
    recommendations.push(
      'Perform thermal inspection with an IR camera to identify defective bypass diodes or hot-spots.'
    );
    recommendations.push(
      'Verify AC isolator switch and utility net meter calibration with your DISCOM.'
    );
  }

  return {
    performanceRatioPercent: prPercent,
    specificYieldKwhPerKwpPerDay: specificYield,
    selfConsumptionRatePercent: selfConsumptionPercent,
    actualMonthlySavings,
    actualAnnualSavingsRate,
    billReductionPercent,
    healthStatus,
    diagnosticRecommendations: recommendations,
  };
}

/**
 * Astronomical Solar Ephemeris & Angle Calculations (SPA)
 */
export interface DetailedSunAngles {
  altitudeDeg: number;
  azimuthDeg: number;
  zenithDeg: number;
  declinationDeg: number;
  equationOfTimeMinutes: number;
  timeCorrectionMinutes: number;
  localSolarTimeHours: number;
  localSolarTimeString: string;
  hourAngleDeg: number;
  airMass: number;
  sunStatus: string;
  cardinalDirection: string;
  sunriseTime: string;
  sunsetTime: string;
  solarNoonTime: string;
  dayLengthHours: number;
  dayLengthFormatted: string;
  goldenHourMorning: string;
  goldenHourEvening: string;
  civilDawn: string;
  civilDusk: string;
  nauticalDawn: string;
  nauticalDusk: string;
  isDaytime: boolean;
  shadowFactor: number; // Length multiplier: 1 / tan(altitude)
}

export function calculateDetailedSunAngles(
  lat: number,
  lon: number,
  date: Date
): DetailedSunAngles {
  // Day of year (1-366)
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diffMs = date.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / 86400000) + 1;

  // Solar Declination in radians (Spencer / Cooper formula)
  const declinationRad =
    23.45 *
    Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180) *
    (Math.PI / 180);
  const declinationDeg = declinationRad * (180 / Math.PI);

  // Equation of Time (minutes)
  const b = ((360 / 365) * (dayOfYear - 81) * Math.PI) / 180;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Time zone offset in hours
  const tzOffsetHours = -date.getTimezoneOffset() / 60;
  const lstm = 15 * tzOffsetHours;

  // Time Correction Factor (minutes)
  const timeCorrection = 4 * (lon - lstm) + eot;

  // Local clock time in decimal hours
  const localClockHours =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;

  // Local Solar Time (LST)
  const localSolarTime = (localClockHours + timeCorrection / 60 + 24) % 24;

  // Hour Angle (HRA) in degrees: 0° at solar noon, negative in morning, positive in afternoon
  const hra = 15 * (localSolarTime - 12);
  const hraRad = hra * (Math.PI / 180);
  const latRad = lat * (Math.PI / 180);

  // Solar Altitude (Elevation)
  const sinAltitude =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hraRad);
  const altitudeRad = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const altitudeDeg = altitudeRad * (180 / Math.PI);

  // Solar Zenith Angle
  const zenithDeg = Math.max(0, 90 - altitudeDeg);
  const zenithRad = (zenithDeg * Math.PI) / 180;

  // Solar Azimuth (measured from True North clockwise: 0° = N, 90° = E, 180° = S, 270° = W)
  const cosAzimuth =
    (Math.sin(declinationRad) * Math.cos(latRad) -
      Math.cos(declinationRad) * Math.sin(latRad) * Math.cos(hraRad)) /
    Math.cos(altitudeRad);
  let azimuthDeg = Math.acos(Math.max(-1, Math.min(1, cosAzimuth))) * (180 / Math.PI);
  if (hra > 0) {
    azimuthDeg = 360 - azimuthDeg;
  }
  // Convert convention so 0° is North, 90° is East, 180° is South
  azimuthDeg = (azimuthDeg + 180) % 360;

  // Air Mass (Kasten and Young, 1989)
  let airMass = 1.0;
  if (altitudeDeg > 0) {
    airMass =
      1 /
      (Math.cos(zenithRad) +
        0.50572 * Math.pow(Math.max(96.07995 - zenithDeg, 0.01), -1.6364));
    airMass = Math.max(1.0, Math.min(Number(airMass.toFixed(2)), 38.0));
  } else {
    airMass = 38.0;
  }

  // Shadow length factor = 1 / tan(altitude)
  let shadowFactor = 99;
  if (altitudeDeg > 0.5) {
    shadowFactor = Number((1 / Math.tan(altitudeRad)).toFixed(2));
  }

  // Sunrise, Sunset, and Day Length estimation
  // Hour angle at horizon (altitude = -0.833° accounting for refraction and solar radius)
  const h0Rad = (-0.833 * Math.PI) / 180;
  const cosSunriseHra =
    (Math.sin(h0Rad) - Math.sin(latRad) * Math.sin(declinationRad)) /
    (Math.cos(latRad) * Math.cos(declinationRad));

  let halfDayHours = 6;
  if (cosSunriseHra < -1) {
    halfDayHours = 12; // Polar day
  } else if (cosSunriseHra > 1) {
    halfDayHours = 0; // Polar night
  } else {
    halfDayHours = (Math.acos(cosSunriseHra) * (180 / Math.PI)) / 15;
  }

  // Solar noon in clock time (hours)
  const solarNoonClockHours = 12 - timeCorrection / 60;
  const sunriseClockHours = (solarNoonClockHours - halfDayHours + 24) % 24;
  const sunsetClockHours = (solarNoonClockHours + halfDayHours + 24) % 24;
  const dayLengthHours = halfDayHours * 2;

  // Format helper
  const fmtHours = (decHours: number): string => {
    const h = Math.floor((decHours + 24) % 24);
    const m = Math.floor((((decHours + 24) % 24) - h) * 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;
  };

  const fmtDuration = (hrs: number): string => {
    const h = Math.floor(hrs);
    const m = Math.floor((hrs - h) * 60);
    return `${h}h ${m}m`;
  };

  // Cardinal direction label from Azimuth
  const directions = [
    'North (N)',
    'North-Northeast (NNE)',
    'Northeast (NE)',
    'East-Northeast (ENE)',
    'East (E)',
    'East-Southeast (ESE)',
    'Southeast (SE)',
    'South-Southeast (SSE)',
    'South (S)',
    'South-Southwest (SSW)',
    'Southwest (SW)',
    'West-Southwest (WSW)',
    'West (W)',
    'West-Northwest (WNW)',
    'Northwest (NW)',
    'North-Northwest (NNW)',
  ];
  const dirIndex = Math.round(azimuthDeg / 22.5) % 16;
  const cardinalDirection = directions[dirIndex];

  // Sun Status description
  let sunStatus = 'West';
  if (altitudeDeg > 0) {
    if (localSolarTime < 11.2) {
      sunStatus = 'East';
    } else if (localSolarTime <= 12.8) {
      sunStatus = 'Zenith';
    } else {
      sunStatus = 'West';
    }
  } else {
    sunStatus = localSolarTime >= 12 ? 'West' : 'East';
  }

  return {
    altitudeDeg: Number(altitudeDeg.toFixed(2)),
    azimuthDeg: Number(azimuthDeg.toFixed(2)),
    zenithDeg: Number(zenithDeg.toFixed(2)),
    declinationDeg: Number(declinationDeg.toFixed(2)),
    equationOfTimeMinutes: Number(eot.toFixed(2)),
    timeCorrectionMinutes: Number(timeCorrection.toFixed(2)),
    localSolarTimeHours: Number(localSolarTime.toFixed(2)),
    localSolarTimeString: fmtHours(localSolarTime),
    hourAngleDeg: Number(hra.toFixed(2)),
    airMass,
    sunStatus,
    cardinalDirection,
    sunriseTime: fmtHours(sunriseClockHours),
    sunsetTime: fmtHours(sunsetClockHours),
    solarNoonTime: fmtHours(solarNoonClockHours),
    dayLengthHours: Number(dayLengthHours.toFixed(2)),
    dayLengthFormatted: fmtDuration(dayLengthHours),
    goldenHourMorning: fmtHours(sunriseClockHours + 0.8),
    goldenHourEvening: fmtHours(sunsetClockHours - 0.8),
    civilDawn: fmtHours(sunriseClockHours - 0.45),
    civilDusk: fmtHours(sunsetClockHours + 0.45),
    nauticalDawn: fmtHours(sunriseClockHours - 0.9),
    nauticalDusk: fmtHours(sunsetClockHours + 0.9),
    isDaytime: altitudeDeg > 0,
    shadowFactor,
  };
}

/**
 * Solar Optimal Tilt & Tracker Angles Engine
 */
export interface SolarTiltRecommendations {
  latitude: number;
  fixedYearRoundTiltDeg: number;
  summerTiltDeg: number;
  winterTiltDeg: number;
  springAutumnTiltDeg: number;
  optimalAzimuthDeg: number;
  optimalAzimuthFacing: string;
  singleAxisAngleNowDeg: number;
  dualAxisTiltNowDeg: number;
  dualAxisAzimuthNowDeg: number;
  annualYieldGainPercent: {
    fixedOptimal: number;
    seasonalAdjusted: number;
    singleAxisTracking: number;
    dualAxisTracking: number;
  };
}

export function calculateOptimalTiltAngles(
  lat: number,
  lon: number,
  date: Date
): SolarTiltRecommendations {
  const absLat = Math.abs(lat);
  const isNorthern = lat >= 0;

  // Year-round optimal fixed tilt = abs(lat) * 0.87 + 3.1
  const fixedYearRoundTiltDeg = Math.round(absLat * 0.87 + 3.1);

  // Summer tilt = max(abs(lat) - 15, 5)
  const summerTiltDeg = Math.max(Math.round(absLat - 15), 5);

  // Winter tilt = min(abs(lat) + 15, 60)
  const winterTiltDeg = Math.min(Math.round(absLat + 15), 60);

  // Spring/Autumn = latitude
  const springAutumnTiltDeg = Math.round(absLat);

  // Optimal azimuth facing
  const optimalAzimuthDeg = isNorthern ? 180 : 0;
  const optimalAzimuthFacing = isNorthern ? 'True South (180°)' : 'True North (0°)';

  // Current sun angles
  const sun = calculateDetailedSunAngles(lat, lon, date);

  // Single-axis horizontal tracking angle: rotates E to W between -60° and +60°
  let singleAxisAngleNowDeg = 0;
  if (sun.altitudeDeg > 0) {
    const rawSingle = (sun.localSolarTimeHours - 12) * 15;
    singleAxisAngleNowDeg = Math.max(-60, Math.min(60, Math.round(rawSingle)));
  }

  return {
    latitude: lat,
    fixedYearRoundTiltDeg,
    summerTiltDeg,
    winterTiltDeg,
    springAutumnTiltDeg,
    optimalAzimuthDeg,
    optimalAzimuthFacing,
    singleAxisAngleNowDeg,
    dualAxisTiltNowDeg: Math.round(sun.zenithDeg),
    dualAxisAzimuthNowDeg: Math.round(sun.azimuthDeg),
    annualYieldGainPercent: {
      fixedOptimal: 0,
      seasonalAdjusted: 6,
      singleAxisTracking: 22,
      dualAxisTracking: 34,
    },
  };
}

/**
 * Solar Space Weather & Flare Classification Types
 */
export interface SolarFluxData {
  f107RadioFluxSfu: number; // Solar Flux Units
  radioFluxRating: 'Low / Quiet' | 'Moderate' | 'Elevated' | 'High' | 'Extreme';
  xrayFluxWattsM2: number; // e.g. 3.2e-6
  xrayFlareClass: 'A' | 'B' | 'C' | 'M' | 'X';
  xrayClassSublevel: number; // e.g. 4.2 -> C4.2
  flareIntensityDescription: string;
  activeRegionsCount: number;
  flareProbability24h: {
    cClassPercent: number;
    mClassPercent: number;
    xClassPercent: number;
  };
  forecast3DaySfu: { day: string; flux: number }[];
  recentFlares: {
    time: string;
    class: string;
    region: string;
    duration: string;
  }[];
}

export function getSolarFluxState(date = new Date()): SolarFluxData {
  // Semi-deterministic realistic flux based on current day
  const day = date.getDate();
  const baseFlux = 142 + (day % 17) * 4;
  const xraySublevel = Number((2.1 + (day % 7) * 0.8).toFixed(1));

  let rating: 'Low / Quiet' | 'Moderate' | 'Elevated' | 'High' | 'Extreme' = 'Moderate';
  if (baseFlux < 100) rating = 'Low / Quiet';
  else if (baseFlux < 150) rating = 'Moderate';
  else if (baseFlux < 200) rating = 'Elevated';
  else rating = 'High';

  return {
    f107RadioFluxSfu: baseFlux,
    radioFluxRating: rating,
    xrayFluxWattsM2: xraySublevel * 1e-6,
    xrayFlareClass: 'C',
    xrayClassSublevel: xraySublevel,
    flareIntensityDescription: `C${xraySublevel} Flare Level · Low radio blackout impact`,
    activeRegionsCount: 6,
    flareProbability24h: {
      cClassPercent: 90,
      mClassPercent: 35,
      xClassPercent: 5,
    },
    forecast3DaySfu: [
      { day: 'Today', flux: baseFlux },
      { day: 'Tomorrow', flux: baseFlux + 3 },
      { day: '+2 Days', flux: baseFlux - 2 },
    ],
    recentFlares: [
      { time: '04:12 UTC', class: `C${xraySublevel}`, region: 'AR3883', duration: '18 min' },
      { time: 'Yesterday', class: 'C1.8', region: 'AR3880', duration: '24 min' },
      { time: '2 Days Ago', class: 'M1.1', region: 'AR3878', duration: '32 min' },
    ],
  };
}

/**
 * Geomagnetic Kp-Index Space Weather Model
 */
export interface GeomagneticKpData {
  kpIndex: number; // 0 to 9
  stormScale: 'G0' | 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  stormLevelName: 'Quiet' | 'Unsettled' | 'Active' | 'Minor Storm' | 'Moderate Storm' | 'Strong Storm' | 'Severe Storm' | 'Extreme Storm';
  auroraCutoffLatitudeDeg: number;
  auroraVisibilityScope: string;
  gridImpactWarning: string;
  hfRadioImpact: string;
  satelliteImpact: string;
  hourlyHistory: { hour: string; kp: number }[];
}

export function getGeomagneticKpState(currentHour = new Date().getHours()): GeomagneticKpData {
  // Realistic moderate space weather state
  const currentKp = 2.67; // Kp ~ 2.7 (Quiet to Active)
  const cutoffLat = Math.round(66.5 - currentKp * 2.8);

  return {
    kpIndex: currentKp,
    stormScale: 'G0',
    stormLevelName: 'Quiet',
    auroraCutoffLatitudeDeg: cutoffLat,
    auroraVisibilityScope: `Visible poleward of ${cutoffLat}° latitude (Alaska, Scandinavia, Northern Canada)`,
    gridImpactWarning: 'Nominal. Weak or negligible geomagnetically induced currents (GIC).',
    hfRadioImpact: 'Normal high-frequency radio wave propagation.',
    satelliteImpact: 'No significant surface charging or atmospheric drag anomaly.',
    hourlyHistory: [
      { hour: '00:00', kp: 2.0 },
      { hour: '03:00', kp: 2.3 },
      { hour: '06:00', kp: 3.0 },
      { hour: '09:00', kp: 2.7 },
      { hour: '12:00', kp: 3.3 },
      { hour: '15:00', kp: 2.3 },
      { hour: '18:00', kp: 2.0 },
      { hour: '21:00', kp: 2.7 },
    ],
  };
}

export interface SensitivityRoiParams {
  installationCost: number;
  subsidyAmount?: number;
  annualSavings: number;
  expectedTariffIncreasePct?: number; // e.g., 2.5 (% per year)
  maintenanceCostPct?: number; // e.g., 1.0 (% of net system cost per year)
  includeInverterReplacement?: boolean;
}

export interface YearlySensitivityRoiPoint {
  year: number;
  yearLabel: string;
  shortLabel: string;
  grossAnnualSavings: number;
  maintenanceCost: number;
  annualSavings: number;
  cumulativeSavings: number;
  initialInvestment: number;
  netCashFlow: number;
  panelEfficiency: number;
  isProfit: boolean;
  profitArea: number;
  recoveryArea: number;
  isBreakEvenReached: boolean;
  isCrossoverYear: boolean;
}

export interface SensitivityRoiProjection {
  netSystemCost: number;
  inverterAllowance: number;
  annualMaintenanceCost: number;
  chartData: YearlySensitivityRoiPoint[];
  breakEvenYear: number;
  breakEvenBeyondHorizon: boolean;
  breakEvenFormatted: string;
  lifetimeCumulativeSavings: number;
  lifetimeNetProfit: number;
  lifetimeRoiPercent: number;
}

/**
 * Computes 25-year sensitivity-adjusted solar ROI timeline factoring in
 * Expected Annual Tariff Increase (%) and System Maintenance Cost (%).
 */
export function calculate25YearSensitivityRoi({
  installationCost,
  subsidyAmount = 0,
  annualSavings,
  expectedTariffIncreasePct = 2.5,
  maintenanceCostPct = 1.0,
  includeInverterReplacement = true,
}: SensitivityRoiParams): SensitivityRoiProjection {
  const netCost = Math.max(1000, installationCost - subsidyAmount);
  const inverterAllowance = includeInverterReplacement ? Math.round(installationCost * 0.15) : 0;
  const baseSavings = annualSavings > 0 ? annualSavings : Math.round(netCost / 4.3);
  const annualMaintenance = Math.round(netCost * (Math.max(0, maintenanceCostPct) / 100));
  const tariffRate = Math.max(0, expectedTariffIncreasePct) / 100;

  const data: YearlySensitivityRoiPoint[] = [];
  let cumulativeSavings = 0;
  let breakEven: number | null = null;
  let crossoverAssigned = false;

  data.push({
    year: 0,
    yearLabel: 'Yr 0 (Install)',
    shortLabel: 'Y0',
    grossAnnualSavings: 0,
    maintenanceCost: 0,
    annualSavings: 0,
    cumulativeSavings: 0,
    initialInvestment: netCost,
    netCashFlow: -netCost,
    panelEfficiency: 100,
    isProfit: false,
    profitArea: 0,
    recoveryArea: -netCost,
    isBreakEvenReached: false,
    isCrossoverYear: false,
  });

  for (let yr = 1; yr <= 25; yr++) {
    const degradation = Math.pow(0.995, yr - 1);
    const tariffMultiplier = Math.pow(1 + tariffRate, yr - 1);
    const grossYearSavings = Math.round(baseSavings * degradation * tariffMultiplier);
    const netYearSavings = Math.round(grossYearSavings - annualMaintenance);
    cumulativeSavings += netYearSavings;

    const inverterCostApplied = yr >= 12 && includeInverterReplacement ? inverterAllowance : 0;
    const netCashFlow = Math.round(cumulativeSavings - netCost - inverterCostApplied);

    if (breakEven === null && netCashFlow >= 0) {
      const prevNet = data[yr - 1].netCashFlow;
      const yearlyGain = netCashFlow - prevNet;
      const fraction = prevNet < 0 && yearlyGain > 0 ? Math.abs(prevNet) / yearlyGain : 0;
      breakEven = parseFloat(((yr - 1) + Math.min(0.99, Math.max(0.01, fraction))).toFixed(1));
    }

    const isBreakEvenReached = cumulativeSavings >= netCost && netCashFlow >= 0;
    const isCrossoverYear = isBreakEvenReached && !crossoverAssigned;
    if (isCrossoverYear) crossoverAssigned = true;

    data.push({
      year: yr,
      yearLabel: `Yr ${yr}`,
      shortLabel: `Y${yr}`,
      grossAnnualSavings: grossYearSavings,
      maintenanceCost: annualMaintenance,
      annualSavings: netYearSavings,
      cumulativeSavings: Math.round(cumulativeSavings),
      initialInvestment: netCost,
      netCashFlow,
      panelEfficiency: parseFloat((degradation * 100).toFixed(1)),
      isProfit: netCashFlow >= 0,
      profitArea: netCashFlow >= 0 ? netCashFlow : 0,
      recoveryArea: netCashFlow < 0 ? netCashFlow : 0,
      isBreakEvenReached,
      isCrossoverYear,
    });
  }

  const breakEvenBeyondHorizon = breakEven === null;
  const yr1Net = Math.max(1, data[1]?.annualSavings || baseSavings - annualMaintenance);
  const calculatedBreakEven =
    breakEven !== null
      ? breakEven
      : Math.min(40, parseFloat((netCost / yr1Net).toFixed(1)));

  const breakEvenYearsInt = Math.floor(calculatedBreakEven);
  const breakEvenMonths = Math.round((calculatedBreakEven - breakEvenYearsInt) * 12);
  const breakEvenText = breakEvenBeyondHorizon
    ? '> 25 Yrs'
    : `${breakEvenYearsInt} Yrs${breakEvenMonths > 0 ? `, ${breakEvenMonths} Mos` : ''}`;

  const finalPoint = data[data.length - 1];
  const totalLifetimeProfit = finalPoint.netCashFlow;
  const roi = Math.round((totalLifetimeProfit / netCost) * 100);

  return {
    netSystemCost: netCost,
    inverterAllowance,
    annualMaintenanceCost: annualMaintenance,
    chartData: data,
    breakEvenYear: calculatedBreakEven,
    breakEvenBeyondHorizon,
    breakEvenFormatted: breakEvenText,
    lifetimeCumulativeSavings: finalPoint.cumulativeSavings,
    lifetimeNetProfit: totalLifetimeProfit,
    lifetimeRoiPercent: roi,
  };
}

export interface SystemArchitectureOptionResult {
  systemType: SystemType;
  title: string;
  tagline: string;
  pvCapacityKw: number;
  panelCount: number;
  panelWattage: number;
  moduleStandard: 'DCR' | 'NON_DCR';
  inverterLabel: string;
  inverterCapacityKw: number;
  inverterUpgradeCost: number;
  batteryKwh: number;
  batteryUnits: number;
  batteryPackLabel: string;
  batteryCost: number;
  pvBaseCost: number;
  grossCost: number;
  governmentSubsidy: number;
  subsidyEligible: boolean;
  netCost: number;
  monthlyGenerationKwh: number;
  monthlySavings: number;
  annualSavings: number;
  paybackYears: number;
  isGridExportActive: boolean;
}

export interface ConsumptionSystemAnalysis {
  recommendedType: SystemType;
  recommendationReason: string;
  dailyKwh: number;
  monthlyKwh: number;
  connectedLoadKw: number;
  options: Record<SystemType, SystemArchitectureOptionResult>;
}

/**
 * Evaluates a specific solar system architecture (On-Grid, Off-Grid, or Hybrid)
 * with exact Inverter changes, Battery bank sizing, DCR/Non-DCR pricing, and subsidies.
 */
export function calculateSystemArchitectureOption(params: {
  systemType: SystemType;
  monthlyKwh: number;
  connectedLoadKw: number;
  moduleStandard: 'DCR' | 'NON_DCR';
  consumerCategory: 'residential' | 'commercial' | 'agricultural';
  currency: CurrencyCode;
  tariffPerKwh: number;
  peakSunHours: number;
  panelWattage: number;
  effectivePR?: number;
  backupHours?: number;
  explicitPvKw?: number;
  explicitPanelCount?: number;
  selectedInverterModel?: InverterHardwareModel;
  customInverterBrand?: string;
  customInverterPowerKw?: number;
  feedInTariffPerKwh?: number;
}): SystemArchitectureOptionResult {
  const {
    systemType,
    monthlyKwh,
    connectedLoadKw,
    moduleStandard,
    consumerCategory,
    tariffPerKwh,
    peakSunHours,
    panelWattage,
    effectivePR = 0.78,
    backupHours = 0,
    explicitPvKw,
    explicitPanelCount,
    selectedInverterModel,
    customInverterBrand,
    customInverterPowerKw,
    feedInTariffPerKwh = 3.1,
  } = params;

  const isDCR = moduleStandard === 'DCR';
  const safeMonthlyKwh = Math.max(30, monthlyKwh);
  const dailyKwh = safeMonthlyKwh / 30;
  const peakSun = Math.max(3.0, peakSunHours || 5.2);
  const pr = Math.max(0.65, Math.min(0.88, effectivePR || 0.78));
  const tariff = Math.max(0.1, tariffPerKwh || 7.15);

  // Indian Rupee (INR) hardware & installation rates
  const baseModulePerKw = isDCR ? 54000 : 42000;
  const batteryRatePerKwh = 18500;
  const hybridInverterDeltaPerKw = 8500;
  const offGridInverterDeltaPerKw = 5500;

  // PV multiplier accounts for battery round-trip losses in Off-Grid (+15%) and Hybrid (+5%)
  const pvMultiplier =
    systemType === 'off-grid' ? 1.15 : systemType === 'hybrid' ? 1.05 : 1.0;

  let panelCount: number;
  let pvCapacityKw: number;

  if (explicitPanelCount && explicitPanelCount >= 1) {
    panelCount = explicitPanelCount;
    pvCapacityKw = Number(((panelCount * panelWattage) / 1000).toFixed(2));
  } else if (explicitPvKw && explicitPvKw >= 1) {
    pvCapacityKw = Number(explicitPvKw.toFixed(2));
    panelCount = Math.max(1, Math.ceil((pvCapacityKw * 1000) / panelWattage));
  } else {
    const rawKw = Math.max(3, (dailyKwh * pvMultiplier) / (peakSun * pr));
    const minPanels3Kw = Math.max(1, Math.ceil(3000 / panelWattage));
    panelCount = Math.max(minPanels3Kw, Math.ceil((rawKw * 1000) / panelWattage));
    pvCapacityKw = Number(((panelCount * panelWattage) / 1000).toFixed(2));
  }

  // Inverter changes automatically based on On-Grid vs Off-Grid vs Hybrid & connected load
  let inverterLabel = 'Grid-Tied String MPPT Inverter';
  let inverterCapacityKw = Number(Math.max(3, pvCapacityKw / 1.1).toFixed(1));
  let inverterUpgradeCost = 0;

  // Battery bank sizing
  let batteryKwh = 0;
  let batteryUnits = 0;
  let batteryPackLabel = 'No Battery (Grid Net Metering)';
  let batteryCost = 0;

  if (systemType === 'off-grid') {
    inverterLabel = 'Off-Grid Pure Sine MPPT PCU';
    inverterCapacityKw = Number(
      Math.max(3, Math.ceil(Math.max(pvCapacityKw, connectedLoadKw * 1.15) * 2) / 2).toFixed(1)
    );
    inverterUpgradeCost = Math.round(inverterCapacityKw * offGridInverterDeltaPerKw);

    if (backupHours > 0) {
      const rawBatteryKwh = Math.max(2.56, ((dailyKwh / 24) * backupHours * 1.15) / 0.85);
      batteryUnits = Math.max(1, Math.ceil(rawBatteryKwh / 5.12));
      batteryKwh = Number((batteryUnits * 5.12).toFixed(2));
      batteryPackLabel = `${batteryUnits} × 5.12 kWh LiFePO₄ Bank`;
      batteryCost = Math.round(batteryKwh * batteryRatePerKwh);
    } else {
      batteryUnits = 0;
      batteryKwh = 0;
      batteryPackLabel = 'Enter battery backup value based on inverter';
      batteryCost = 0;
    }
  } else if (systemType === 'hybrid') {
    inverterLabel = 'Bidirectional Hybrid MPPT (<10ms UPS)';
    inverterCapacityKw = Number(
      Math.max(3, Math.ceil(Math.max(pvCapacityKw, connectedLoadKw) * 2) / 2).toFixed(1)
    );
    inverterUpgradeCost = Math.round(inverterCapacityKw * hybridInverterDeltaPerKw);

    if (backupHours > 0) {
      const criticalShare = 0.65;
      const rawBatteryKwh = Math.max(2.0, ((dailyKwh / 24) * criticalShare * backupHours) / 0.85);
      batteryUnits = Math.max(1, Math.ceil(rawBatteryKwh / 2.56));
      batteryKwh = Number((batteryUnits * 2.56).toFixed(2));
      batteryPackLabel = `${batteryUnits} × 2.56 kWh LFP Backup`;
      batteryCost = Math.round(batteryKwh * batteryRatePerKwh);
    } else {
      batteryUnits = 0;
      batteryKwh = 0;
      batteryPackLabel = 'Enter battery backup value based on inverter';
      batteryCost = 0;
    }
  }

  const trimmedCustomBrand = customInverterBrand?.trim() || '';
  const hasCustomPower =
    typeof customInverterPowerKw === 'number' && Number.isFinite(customInverterPowerKw) && customInverterPowerKw > 0;

  if (hasCustomPower) {
    inverterCapacityKw = Number(customInverterPowerKw!.toFixed(2));
    if (systemType === 'off-grid') {
      inverterUpgradeCost = Math.round(inverterCapacityKw * offGridInverterDeltaPerKw);
    } else if (systemType === 'hybrid') {
      inverterUpgradeCost = Math.round(inverterCapacityKw * hybridInverterDeltaPerKw);
    }
  }

  const matchedBrandSeries =
    trimmedCustomBrand &&
    selectedInverterModel &&
    selectedInverterModel.brand.toLowerCase() === trimmedCustomBrand.toLowerCase();

  const modelCostAdjPerKw = selectedInverterModel && (!trimmedCustomBrand || matchedBrandSeries)
    ? selectedInverterModel.costDeltaPerKwInr
    : 0;
  inverterUpgradeCost = Math.max(
    0,
    inverterUpgradeCost + Math.round(inverterCapacityKw * modelCostAdjPerKw)
  );
  if (trimmedCustomBrand) {
    inverterLabel = matchedBrandSeries && selectedInverterModel
      ? `${trimmedCustomBrand} ${selectedInverterModel.modelSeries}`
      : `${trimmedCustomBrand} ${
          systemType === 'hybrid'
            ? 'Hybrid MPPT Inverter'
            : systemType === 'off-grid'
            ? 'Off-Grid Solar PCU'
            : 'Grid-Tie MPPT Inverter'
        }`;
  } else if (selectedInverterModel) {
    inverterLabel = `${selectedInverterModel.brand} ${selectedInverterModel.modelSeries}`;
  }

  const pvBaseCost = Math.round(pvCapacityKw * baseModulePerKw);
  const grossCost = pvBaseCost + inverterUpgradeCost + batteryCost;

  // Subsidy rules: PM Surya Ghar applies ONLY to DCR residential grid-connected (On-Grid / Hybrid)
  const subsidyEligible =
    isDCR && consumerCategory === 'residential' && systemType !== 'off-grid';

  let governmentSubsidy = 0;
  if (subsidyEligible) {
    if (pvCapacityKw < 1.0) {
      governmentSubsidy = Math.round(pvCapacityKw * 30000);
    } else if (pvCapacityKw < 2.0) {
      governmentSubsidy = 30000 + Math.round((pvCapacityKw - 1.0) * 30000);
    } else if (pvCapacityKw < 3.0) {
      governmentSubsidy = 60000 + Math.round((pvCapacityKw - 2.0) * 18000);
    } else {
      governmentSubsidy = 78000;
    }
  }

  const netCost = Math.max(1000, grossCost - governmentSubsidy);

  // Generation & Monthly Savings
  const storageLossFactor =
    systemType === 'off-grid' ? 0.9 : systemType === 'hybrid' ? 0.96 : 1.0;
  const monthlyGenerationKwh = Math.round(pvCapacityKw * peakSun * 30 * pr * storageLossFactor);
  const replacedUnits = Math.min(safeMonthlyKwh, monthlyGenerationKwh);
  const exportedUnits =
    systemType === 'off-grid' ? 0 : Math.max(0, monthlyGenerationKwh - safeMonthlyKwh);
  const feedInRate = feedInTariffPerKwh > 0 ? feedInTariffPerKwh : 3.1;

  const monthlySavings = Math.round(replacedUnits * tariff + exportedUnits * feedInRate);
  const annualSavings = monthlySavings * 12;
  const paybackYears =
    annualSavings > 0 ? Number((netCost / annualSavings).toFixed(1)) : 25;

  const meta =
    systemType === 'on-grid'
      ? { title: 'On-Grid', tagline: 'Lowest Capex · Net Metering Export' }
      : systemType === 'off-grid'
      ? { title: 'Off-Grid', tagline: '100% Standalone · Zero Grid Dependency' }
      : { title: 'Hybrid', tagline: 'Grid Export + Instant Battery Backup' };

  return {
    systemType,
    title: meta.title,
    tagline: meta.tagline,
    pvCapacityKw,
    panelCount,
    panelWattage,
    moduleStandard,
    inverterLabel,
    inverterCapacityKw,
    inverterUpgradeCost,
    batteryKwh,
    batteryUnits,
    batteryPackLabel,
    batteryCost,
    pvBaseCost,
    grossCost,
    governmentSubsidy,
    subsidyEligible,
    netCost,
    monthlyGenerationKwh,
    monthlySavings,
    annualSavings,
    paybackYears,
    isGridExportActive: systemType !== 'off-grid',
  };
}

/**
 * Analyzes user appliance consumption profile and returns side-by-side sizing,
 * inverter selection, battery bank, and cost for On-Grid, Off-Grid, and Hybrid.
 */
export function analyzeConsumptionSystemOptions(params: {
  monthlyKwh: number;
  connectedLoadKw: number;
  moduleStandard: 'DCR' | 'NON_DCR';
  consumerCategory: 'residential' | 'commercial' | 'agricultural';
  currency: CurrencyCode;
  tariffPerKwh: number;
  peakSunHours: number;
  panelWattage: number;
  backupHours?: number;
  hasHeavyOrCriticalLoad?: boolean;
}): ConsumptionSystemAnalysis {
  const safeMonthlyKwh = Math.max(30, params.monthlyKwh);
  const dailyKwh = Number((safeMonthlyKwh / 30).toFixed(1));

  const onGrid = calculateSystemArchitectureOption({ ...params, systemType: 'on-grid' });
  const offGrid = calculateSystemArchitectureOption({ ...params, systemType: 'off-grid' });
  const hybrid = calculateSystemArchitectureOption({ ...params, systemType: 'hybrid' });

  let recommendedType: SystemType = 'on-grid';
  let recommendationReason = `At ${dailyKwh} kWh/day, On-Grid delivers the fastest payback (${onGrid.paybackYears} yrs) via net metering with zero battery cost.`;

  if (params.consumerCategory === 'agricultural' && params.connectedLoadKw >= 3.5) {
    recommendedType = 'off-grid';
    recommendationReason = `Heavy agricultural load (${params.connectedLoadKw} kW) suits Off-Grid PCU + ${offGrid.batteryKwh} kWh storage for daytime/rural autonomy.`;
  } else if (dailyKwh >= 18 || params.connectedLoadKw >= 5 || params.hasHeavyOrCriticalLoad) {
    recommendedType = 'hybrid';
    recommendationReason = `High ${dailyKwh} kWh/day demand (${params.connectedLoadKw} kW peak) pairs best with a ${hybrid.inverterCapacityKw} kW Hybrid Inverter & ${hybrid.batteryKwh} kWh backup.`;
  }

  return {
    recommendedType,
    recommendationReason,
    dailyKwh,
    monthlyKwh: Math.round(safeMonthlyKwh),
    connectedLoadKw: Number(params.connectedLoadKw.toFixed(2)),
    options: {
      'on-grid': onGrid,
      'off-grid': offGrid,
      hybrid,
    },
  };
}

export type BomCategory =
  | 'PV Modules'
  | 'Inverter / PCU'
  | 'Battery Bank'
  | 'BOS & Protection'
  | 'Structure & Cabling'
  | 'Metering & Compliance';

export interface BomMaterialItem {
  id: string;
  category: BomCategory;
  name: string;
  specification: string;
  quantity: string;
  status: 'Required' | 'Not Required';
  reason: string;
}

export interface SystemBomResult {
  batteryRequired: boolean;
  batteryRequirementStatus: 'NOT_REQUIRED' | 'OPTIONAL_BACKUP' | 'MANDATORY';
  batteryRequirementHeadline: string;
  batteryRequirementExplanation: string;
  supplyPhaseLabel: string;
  items: BomMaterialItem[];
  removedComponents: string[];
  requiredCount: number;
  omittedCount: number;
}

/**
 * Conditional Bill of Materials (BOM) Generator:
 * - Automatically REMOVES battery components when 'on-grid' is selected
 * - Automatically ADDS LiFePO4 battery bank, BMS & DC protection when 'off-grid' or 'hybrid' is chosen
 * - Filters PV Module & Inverter specs based on DCR vs Non-DCR and Application Analysis
 */
export function generateConditionalBom(params: {
  systemType: SystemType;
  moduleStandard: 'DCR' | 'NON_DCR';
  consumerCategory: 'residential' | 'commercial' | 'agricultural';
  phaseType?: 'single_phase' | 'three_phase';
  pvCapacityKw: number;
  panelCount: number;
  panelWattage: number;
  inverterCapacityKw: number;
  inverterLabel: string;
  batteryKwh: number;
  batteryUnits: number;
  batteryPackLabel: string;
  backupHours: number;
  connectedLoadKw: number;
  roofAreaNeededSqm?: number;
  selectedInverterModel?: InverterHardwareModel;
  customInverterBrand?: string;
}): SystemBomResult {
  const {
    systemType,
    moduleStandard,
    consumerCategory,
    phaseType,
    pvCapacityKw,
    panelCount,
    panelWattage,
    inverterCapacityKw,
    inverterLabel,
    batteryKwh,
    batteryUnits,
    batteryPackLabel,
    backupHours,
    connectedLoadKw,
    roofAreaNeededSqm,
    selectedInverterModel,
    customInverterBrand,
  } = params;

  const isDCR = moduleStandard === 'DCR';
  const panelMeta = getPanelSpecification(panelWattage);
  const isThreePhase =
    phaseType === 'three_phase' ||
    consumerCategory === 'commercial' ||
    consumerCategory === 'agricultural' ||
    pvCapacityKw > 5 ||
    inverterCapacityKw > 5.5 ||
    connectedLoadKw > 5;
  const supplyPhaseLabel = isThreePhase ? '3-Phase 415V' : '1-Phase 230V';
  const roofArea =
    roofAreaNeededSqm && roofAreaNeededSqm > 0
      ? roofAreaNeededSqm
      : Number((panelCount * panelMeta.areaSqm).toFixed(1));

  // Battery necessity assessment
  const batteryRequired = systemType !== 'on-grid';
  const batteryRequirementStatus: SystemBomResult['batteryRequirementStatus'] =
    systemType === 'on-grid'
      ? 'NOT_REQUIRED'
      : systemType === 'hybrid'
      ? 'OPTIONAL_BACKUP'
      : 'MANDATORY';

  const batteryRequirementHeadline =
    systemType === 'on-grid'
      ? 'Battery Not Required (Removed from BOM)'
      : batteryKwh <= 0
      ? 'Battery Backup Required (Enter Value Based on Inverter)'
      : systemType === 'hybrid'
      ? `Battery Added for Backup (${batteryKwh} kWh)`
      : `Battery Bank Mandatory (${batteryKwh} kWh Added)`;

  const batteryRequirementExplanation =
    systemType === 'on-grid'
      ? 'Utility grid acts as virtual storage via Bi-Directional Net Metering. All battery packs, racks, and BMS components are automatically removed from this On-Grid BOM.'
      : batteryKwh <= 0
      ? `Enter your battery backup value based on your ${inverterCapacityKw} kW inverter to size the ${systemType === 'hybrid' ? 'Hybrid' : 'Off-Grid'} battery bank.`
      : systemType === 'hybrid'
      ? `Required when blackout resilience is needed: LiFePO₄ backup battery packs (${batteryKwh} kWh for ${backupHours}h backup) + BMS/DC MCCB are automatically added while Net-Metering stays active.`
      : `Mandatory because Off-Grid operates independently of utility lines: ${batteryKwh} kWh deep-cycle LiFePO₄ battery bank (${backupHours}h reserve), heavy DC rack & busbar are automatically added.`;

  const acCableSpec = isThreePhase ? '4-Core 10 sq.mm Armoured' : '2-Core 6 sq.mm Armoured';
  const dcRunMeters = Math.max(25, Math.round(panelCount * 3.5));
  const acRunMeters = Math.max(15, Math.round(pvCapacityKw * 4));
  const earthingSets =
    systemType === 'hybrid' || isThreePhase || pvCapacityKw >= 5 ? 3 : 2;
  const needsLightningArrester = pvCapacityKw >= 5 || consumerCategory !== 'residential';

  const customBrandTrim = customInverterBrand?.trim() || '';
  const matchesSelectedBrand =
    customBrandTrim &&
    selectedInverterModel &&
    selectedInverterModel.brand.toLowerCase() === customBrandTrim.toLowerCase();

  const resolvedInverterName = customBrandTrim
    ? `${inverterCapacityKw} kW ${inverterLabel}`
    : selectedInverterModel
    ? `${inverterCapacityKw} kW ${selectedInverterModel.brand} ${selectedInverterModel.modelSeries}`
    : `${inverterCapacityKw} kW ${inverterLabel}`;

  const resolvedInverterSpec =
    selectedInverterModel && (!customBrandTrim || matchesSelectedBrand)
      ? `${supplyPhaseLabel} · ${selectedInverterModel.efficiencyPct}% Eff · ${selectedInverterModel.warrantyYears}Yr Warranty · ${selectedInverterModel.specNote}`
      : systemType === 'on-grid'
      ? `${supplyPhaseLabel} · Dual MPPT (≥${panelWattage >= 650 ? '20A' : '16A'}) · IEEE 1547 Anti-Islanding`
      : systemType === 'hybrid'
      ? `${supplyPhaseLabel} · <10ms UPS Switchover · Grid + BMS Battery Port`
      : `${supplyPhaseLabel} · Integrated MPPT Charger · High Inductive Surge Capacity`;

  // Build BOM unconditionally with base core + conditional battery / metering items
  const items: BomMaterialItem[] = [
    {
      id: 'pv-modules',
      category: 'PV Modules',
      name: isDCR
        ? `${panelWattage}W DCR Solar Modules (${panelMeta.recommendedBrands[0]})`
        : `${panelWattage}W Non-DCR Tier-1 Modules (${panelMeta.recommendedBrands[0]})`,
      specification: isDCR
        ? `${panelMeta.cellTechnology} · ALMM Made-in-India Cells · ${panelMeta.dimensionsMm}`
        : `${panelMeta.cellTechnology} · Open Supply · ${panelMeta.dimensionsMm}`,
      quantity: `${panelCount} Nos (${pvCapacityKw} kWp)`,
      status: 'Required',
      reason: isDCR
        ? systemType === 'off-grid'
          ? 'Filtered DCR ALMM domestic modules selected (Note: Off-Grid excludes grid DBT subsidy).'
          : 'Filtered DCR domestic modules required for PM Surya Ghar Govt DBT subsidy.'
        : 'Filtered Non-DCR Tier-1 modules selected for lower upfront cost.',
    },
    {
      id: 'inverter-pcu',
      category: 'Inverter / PCU',
      name: resolvedInverterName,
      specification: resolvedInverterSpec,
      quantity: '1 Unit',
      status: 'Required',
      reason:
        systemType === 'on-grid'
          ? `Filtered ${isDCR ? 'DCR/BIS-listed' : 'Open-Category'} grid-tie inverter with zero battery conversion hardware.`
          : systemType === 'hybrid'
          ? `Filtered ${isDCR ? 'DCR-compatible' : 'Open-Category'} hybrid inverter managing PV, LiFePO₄ BMS & critical loads.`
          : `Filtered ${isDCR ? 'DCR/MNRE' : 'Open-Category'} off-grid PCU sized for ${connectedLoadKw} kW ${consumerCategory} surge load.`,
    },
  ];

  const removedComponents: string[] = [];

  // Conditional Battery Components: Removed for On-Grid, Added for Hybrid / Off-Grid
  if (systemType === 'on-grid') {
    removedComponents.push(
      'Battery Storage Bank (0 kWh)',
      'Battery BMS Harness & DC Breaker (MCCB)',
      'Battery Mounting Rack'
    );
  } else {
    items.push(
      {
        id: 'battery-bank',
        category: 'Battery Bank',
        name:
          systemType === 'hybrid'
            ? 'LiFePO₄ Backup Battery Bank (Auto-Added)'
            : 'Deep-Cycle LiFePO₄ Autonomy Bank (Auto-Added)',
        specification: `${batteryPackLabel} · 51.2V LFP Chemistry · 6000+ Cycles @ 80% DoD`,
        quantity:
          batteryKwh > 0
            ? `${batteryKwh} kWh (${batteryUnits} Pack${batteryUnits > 1 ? 's' : ''})`
            : 'Pending user input',
        status: 'Required',
        reason:
          systemType === 'hybrid'
            ? batteryKwh > 0
              ? `Sized for ${backupHours}h critical outage backup in Hybrid mode.`
              : `Enter backup value based on your inverter for Hybrid mode.`
            : batteryKwh > 0
            ? `Standalone ${backupHours}h energy reserve for Off-Grid mode.`
            : `Enter backup value based on your inverter for Off-Grid mode.`,
      },
      {
        id: 'battery-bms-mccb',
        category: 'Battery Bank',
        name:
          systemType === 'off-grid'
            ? 'Battery Rack, Heavy DC Busbar & 250A MCCB'
            : 'Battery CAN/RS485 BMS Kit & 125A DC Breaker',
        specification:
          systemType === 'off-grid'
            ? 'Powder-Coated LFP Rack + High-Current DC Busbar + Twin-Pole DC Isolator'
            : 'Shielded BMS Telemetry Cable + 125A Bipolar DC MCB/MCCB Enclosure',
        quantity: '1 Complete Set',
        status: 'Required',
        reason: 'Protects battery storage terminals and syncs state-of-charge (SoC) with inverter.',
      }
    );
  }

  items.push(
    {
      id: 'mounting-structure',
      category: 'Structure & Cabling',
      name:
        consumerCategory === 'agricultural'
          ? 'Heavy-Duty Ground / Elevated HDG Structure'
          : consumerCategory === 'commercial'
          ? 'High-Wind Galvanized Industrial Truss MMS'
          : 'Hot-Dip Galvanized (HDG) Rooftop Structure',
      specification: `Wind-rated 150 km/h · Corrosion-resistant Clamps · ${roofArea} m² Array Footprint`,
      quantity: `1 Set (${panelCount}-Panel Bay)`,
      status: 'Required',
      reason: `Tailored to ${consumerCategory} site wind-load and ${roofArea} m² array geometry.`,
    },
    {
      id: 'bos-protection',
      category: 'BOS & Protection',
      name:
        systemType === 'on-grid'
          ? `DCDB + Grid-Tie ACDB (${supplyPhaseLabel})`
          : systemType === 'hybrid'
          ? `DCDB + Dual Critical/Grid ACDB + Auto Bypass`
          : `PV DCDB + Off-Grid Load ACDB + Changeover`,
      specification: `1000V DC SPD Type-II + DC Fuse + ${isThreePhase ? '4-Pole' : '2-Pole'} AC MCB/MCCB + AC SPD`,
      quantity: '1 Combined Kit',
      status: 'Required',
      reason:
        systemType === 'hybrid'
          ? 'Separates critical backup loads from heavy non-backup circuits during grid outages.'
          : `Protects ${supplyPhaseLabel} ${consumerCategory} feeders against surges & faults.`,
    },
    {
      id: 'cabling-connectors',
      category: 'Structure & Cabling',
      name: 'Solar DC & Armoured AC Cabling + MC4',
      specification: `4/6 sq.mm TUV EN50618 UV DC Cable + ${acCableSpec} + IP68 MC4`,
      quantity: `${dcRunMeters}m DC + ${acRunMeters}m AC`,
      status: 'Required',
      reason: 'Minimizes I²R voltage drop between array, inverter/PCU, and distribution board.',
    }
  );

  // Conditional Metering: Net meter only for On-Grid / Hybrid; Shunt monitor for Off-Grid
  if (systemType === 'off-grid') {
    removedComponents.push('Bi-Directional DISCOM Net Meter');
    items.push({
      id: 'offgrid-shunt-meter',
      category: 'Metering & Compliance',
      name: 'Standalone DC/AC Energy Shunt Monitor',
      specification: 'Real-Time State-of-Charge & Load kWh Logger (No DISCOM Net Meter)',
      quantity: '1 Unit',
      status: 'Required',
      reason: 'Tracks off-grid generation and battery bank state without utility net metering.',
    });
  } else {
    items.push({
      id: 'metering',
      category: 'Metering & Compliance',
      name:
        systemType === 'hybrid'
          ? 'Bi-Directional Net Meter + CT Export Limiter'
          : 'Bi-Directional Net Meter + Solar Gen Meter',
      specification: `${supplyPhaseLabel} DISCOM-Approved Smart Meter Set`,
      quantity: '1 Meter Pair',
      status: 'Required',
      reason: 'Mandatory for DISCOM net-metering billing credits & grid synchronization.',
    });
  }

  items.push(
    {
      id: 'earthing-la',
      category: 'BOS & Protection',
      name: needsLightningArrester
        ? 'Chemical Copper Earthing + Lightning Arrester'
        : 'Chemical Copper-Bonded Earthing Kit',
      specification: `${earthingSets} × Maintenance-Free Earth Pits + GI Strip${needsLightningArrester ? ' + ESE/Spike LA' : ''}`,
      quantity: `${earthingSets} Sets`,
      status: 'Required',
      reason: needsLightningArrester
        ? `Dedicated DC, AC & LA grounding for ≥5 kW / ${consumerCategory} safety.`
        : 'Separate DC structure & AC inverter grounding per IS/IEC safety norms.',
    },
    {
      id: 'compliance-docs',
      category: 'Metering & Compliance',
      name: isDCR
        ? 'DCR / ALMM & Subsidy Compliance Dossier'
        : 'Non-DCR IEC Test & Commissioning Dossier',
      specification: isDCR
        ? systemType === 'off-grid'
          ? 'MNRE ALMM Certificate + Domestic Cell Origin Invoice + Safety Test Sheet'
          : 'DCR Undertaking, ALMM Serial Barcode List, DISCOM Feasibility & DBT File'
        : 'IEC 61215 / 61730 Flash Reports, CEIG Single-Line Diagram & Warranty Certs',
      quantity: '1 Complete Pack',
      status: 'Required',
      reason: isDCR
        ? 'Required proof that solar cells & modules are domestically manufactured (DCR).'
        : 'Standard engineering commissioning pack for Non-DCR open procurement.',
    }
  );

  const requiredCount = items.filter((item) => item.status === 'Required').length;
  const omittedCount = removedComponents.length;

  return {
    batteryRequired,
    batteryRequirementStatus,
    batteryRequirementHeadline,
    batteryRequirementExplanation,
    supplyPhaseLabel,
    items,
    removedComponents,
    requiredCount,
    omittedCount,
  };
}

// Preserve backwards-compatible alias
export const generateSystemBom = generateConditionalBom;


