import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Zap,
  Sun,
  Leaf,
  Layers,
  Sliders,
  ShieldCheck,
  BatteryCharging,
  Calculator,
} from 'lucide-react';
import {
  EstimatorInputs,
  FinancialSavingsEstimate,
  PanelWattage,
  ScreenId,
  SolarSystemRequirements,
  WeatherCondition,
  RoofLayoutConfig,
} from '../types/solar';
import {
  DailyUsageGaugeIcon,
  SystemSizeSolarIcon,
  PanelArrayIcon,
  RoofAreaHouseIcon,
  WalletSavingsIcon,
} from '../components/EstimatorIllustrations';
import {
  SOLAR_PANEL_CATALOG,
  getFilteredInverterHardware,
  getFilteredPanelHardware,
  getPanelSpecification,
  SYSTEM_CAPACITY_PRESETS,
} from '../data/panelDatabase';
import { PanelSpecsModal } from '../components/PanelSpecsModal';
import { EngineeringLayoutSettingsModal } from '../components/EngineeringLayoutSettingsModal';
import { DEFAULT_ROOF_LAYOUT_CONFIG } from '../utils/roofLayoutEngine';
import {
  CURRENCY_SYMBOLS,
  calculateSystemArchitectureOption,
  generateConditionalBom,
} from '../utils/solarMath';
import { BomAndInterlinkPanel } from '../components/BomAndInterlinkPanel';
import { DcrToggleSwitch } from '../components/DcrToggleSwitch';

interface RequirementsScreenProps {
  inputs: EstimatorInputs;
  requirements: SolarSystemRequirements;
  savings: FinancialSavingsEstimate;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  onUpdateInputs?: (updated: Partial<EstimatorInputs>) => void;
}

export const RequirementsScreen: React.FC<RequirementsScreenProps> = ({
  inputs,
  requirements,
  onNavigate,
  weather,
  onUpdateInputs = () => {},
}) => {
  const [peakSunHours, setPeakSunHours] = useState<number>(inputs.peakSunHours || 5);
  const [selectedWattage, setSelectedWattage] = useState<PanelWattage>(inputs.panelWattage || 550);
  const [isPanelSpecsOpen, setIsPanelSpecsOpen] = useState(false);
  const [targetSystemKw, setTargetSystemKw] = useState<number | null>(null);
  const [overridePanelCount, setOverridePanelCount] = useState<number | null>(null);
  const [roofLayoutConfig, setRoofLayoutConfig] = useState<RoofLayoutConfig>(DEFAULT_ROOF_LAYOUT_CONFIG);
  const [isEngineeringModalOpen, setIsEngineeringModalOpen] = useState(false);
  const [hasPerformedInitialCalc, setHasPerformedInitialCalc] = useState<boolean>(false);
  const [selectedInverterId, setSelectedInverterId] = useState<string | null>(null);
  const postCalcRef = useRef<HTMLDivElement | null>(null);

  const addressText =
    weather.city?.includes('Banjara Hills') || weather.city?.includes('Hyderabad')
      ? '8-2-603/E/26, Gouri Shankar Nagar Colony, Banjara Hills, Hyderabad'
      : weather.city || '8-2-603/E/26, Gouri Shankar Nagar Colony, Banjara Hills, Hyderabad';

  const dailyUsage = parseFloat((inputs.monthlyUnits / 30).toFixed(0)) || 20;
  const activeSystemType = inputs.systemType || 'on-grid';
  const isDCR = (inputs.moduleStandard || requirements.moduleStandard) !== 'NON_DCR';
  const activeModuleStandard: 'DCR' | 'NON_DCR' = isDCR ? 'DCR' : 'NON_DCR';
  const activeCategory = inputs.consumerCategory || 'residential';
  const activeBackupHours = inputs.batteryBackupHours ?? 0;
  const currencySymbol = CURRENCY_SYMBOLS[inputs.currency] || '₹';

  const [batteryBackupStr, setBatteryBackupStr] = useState<string>(
    activeBackupHours > 0 ? String(activeBackupHours) : ''
  );

  useEffect(() => {
    setBatteryBackupStr(activeBackupHours > 0 ? String(activeBackupHours) : '');
  }, [activeBackupHours]);

  const handleSelectSystemMode = (mode: 'on-grid' | 'hybrid' | 'off-grid') => {
    setSelectedInverterId(null);
    if (mode === 'on-grid') {
      onUpdateInputs({
        systemType: 'on-grid',
        requiresBattery: false,
        enableGridExport: true,
        batteryBackupHours: 0,
      });
    } else {
      const parsed = parseFloat(batteryBackupStr);
      const entered = Number.isFinite(parsed) && parsed > 0 ? Math.min(24, parsed) : 0;
      onUpdateInputs({
        systemType: mode,
        requiresBattery: true,
        enableGridExport: mode !== 'off-grid',
        batteryBackupHours: entered,
      });
    }
  };

  const handleManualBackupChange = (raw: string) => {
    setBatteryBackupStr(raw);
    const parsed = parseFloat(raw);
    const clamped = Number.isFinite(parsed) && parsed > 0 ? Math.min(24, parsed) : 0;
    onUpdateInputs({
      batteryBackupHours: clamped,
      requiresBattery: activeSystemType !== 'on-grid',
    });
  };

  const pvFactor =
    activeSystemType === 'off-grid' ? 1.15 : activeSystemType === 'hybrid' ? 1.05 : 1.0;
  const calculatedSystemKw =
    targetSystemKw !== null
      ? targetSystemKw
      : Math.max(1, Math.round((dailyUsage * pvFactor) / (peakSunHours * 0.78)));

  const filteredPanels = useMemo(
    () => getFilteredPanelHardware(activeModuleStandard),
    [activeModuleStandard]
  );
  const filteredInverters = useMemo(
    () => getFilteredInverterHardware(activeModuleStandard, activeSystemType),
    [activeModuleStandard, activeSystemType]
  );
  const selectedInverterModel = useMemo(
    () =>
      filteredInverters.find((inv) => inv.id === selectedInverterId) ||
      filteredInverters[0],
    [filteredInverters, selectedInverterId]
  );

  const selectedPanelSpec = getPanelSpecification(selectedWattage);
  const moduleAreaPerPanel = (selectedPanelSpec.lengthMm * selectedPanelSpec.widthMm) / 1000000;
  const panelCount =
    overridePanelCount !== null
      ? overridePanelCount
      : Math.max(1, Math.ceil((calculatedSystemKw * 1000) / selectedWattage));
  const calculatedRoofAreaNeeded = parseFloat((panelCount * moduleAreaPerPanel).toFixed(1));
  const availableRoofM2 = inputs.roofArea || 27.46;
  const isRoofAdequate = availableRoofM2 >= calculatedRoofAreaNeeded;

  const handleToggleDcrStandard = (nextStandard: 'DCR' | 'NON_DCR') => {
    const nextPanels = getFilteredPanelHardware(nextStandard);
    const nextInverters = getFilteredInverterHardware(nextStandard, activeSystemType);
    const supportsCurrentWattage = nextPanels.some((p) => p.wattage === selectedWattage);
    const nextWattage = (
      supportsCurrentWattage ? selectedWattage : (nextPanels[2]?.wattage || nextPanels[0]?.wattage || 550)
    ) as PanelWattage;
    setSelectedWattage(nextWattage);
    setSelectedInverterId(nextInverters[0]?.id || null);
    onUpdateInputs({ moduleStandard: nextStandard, panelWattage: nextWattage });
  };

  const architectureSpec = useMemo(
    () =>
      calculateSystemArchitectureOption({
        systemType: activeSystemType,
        monthlyKwh: inputs.monthlyUnits || 420,
        connectedLoadKw: Math.max(
          inputs.sanctionedLoadKw || 4,
          Number(((inputs.monthlyUnits || 420) / 120).toFixed(1))
        ),
        moduleStandard: activeModuleStandard,
        consumerCategory: activeCategory,
        currency: inputs.currency,
        tariffPerKwh: inputs.tariffPerKwh,
        peakSunHours,
        panelWattage: selectedWattage,
        backupHours: activeBackupHours,
        explicitPvKw: calculatedSystemKw,
        explicitPanelCount: panelCount,
        selectedInverterModel,
      }),
    [
      activeSystemType,
      inputs.monthlyUnits,
      inputs.sanctionedLoadKw,
      activeModuleStandard,
      activeCategory,
      inputs.currency,
      inputs.tariffPerKwh,
      peakSunHours,
      selectedWattage,
      activeBackupHours,
      calculatedSystemKw,
      panelCount,
      selectedInverterModel,
    ]
  );

  // Conditional BOM generator that automatically removes battery components for On-Grid
  // and adds LiFePO4 battery bank + BMS + DC breaker for Off-Grid / Hybrid
  const reqBom = useMemo(
    () =>
      generateConditionalBom({
        systemType: activeSystemType,
        moduleStandard: activeModuleStandard,
        consumerCategory: activeCategory,
        phaseType: inputs.phaseType,
        pvCapacityKw: calculatedSystemKw,
        panelCount,
        panelWattage: selectedWattage,
        inverterCapacityKw: architectureSpec.inverterCapacityKw,
        inverterLabel: architectureSpec.inverterLabel,
        batteryKwh: architectureSpec.batteryKwh,
        batteryUnits: architectureSpec.batteryUnits,
        batteryPackLabel: architectureSpec.batteryPackLabel,
        backupHours: activeBackupHours,
        connectedLoadKw: Math.max(
          inputs.sanctionedLoadKw || 4,
          Number(((inputs.monthlyUnits || 420) / 120).toFixed(1))
        ),
        roofAreaNeededSqm: calculatedRoofAreaNeeded,
        selectedInverterModel,
      }),
    [
      activeSystemType,
      activeModuleStandard,
      activeCategory,
      inputs.phaseType,
      calculatedSystemKw,
      panelCount,
      selectedWattage,
      architectureSpec,
      activeBackupHours,
      inputs.sanctionedLoadKw,
      inputs.monthlyUnits,
      calculatedRoofAreaNeeded,
      selectedInverterModel,
    ]
  );

  return (
    <div className="flex-1 flex flex-col bg-[#F4F7FC] dark:bg-slate-950 pb-10 transition-colors">
      <div className="p-4 space-y-4 max-w-lg mx-auto w-full">
        {/* Top Bar: [<] Estimated Solar System Requirement */}
        <div className="flex items-center gap-3 py-1">
          <button
            onClick={() => onNavigate('estimator')}
            className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
            title="Back to Estimator"
          >
            <ChevronLeft className="w-5 h-5 stroke-[2.5]" />
          </button>
          <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Estimated Solar System Requirement
          </h1>
        </div>

        {/* Calculation Mode Visual Indicator */}
        <div className="flex items-center justify-between gap-2 p-3.5 px-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">Module:</span>
            <span
              className={`text-[10.5px] font-semibold truncate ${
                isDCR ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400'
              }`}
            >
              {isDCR ? '1.15× Subsidy Eligible' : '0.88× Open Category'}
            </span>
          </div>
          <DcrToggleSwitch
            compact
            id="req-top-dcr-toggle"
            moduleStandard={activeModuleStandard}
            onChange={handleToggleDcrStandard}
          />
        </div>

        {/* 2x2 Metric Cards Grid with 3D Illustrations (Matching Screenshot 2) */}
        <div className="grid grid-cols-2 gap-3.5">
          {/* Card 1: Daily Usage */}
          <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                1. Daily Usage
              </p>
              <div className="text-2xl font-black text-[#F97316] mt-0.5">
                {dailyUsage}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Unit / Day</p>
            </div>
            <div className="shrink-0">
              <DailyUsageGaugeIcon className="w-13 h-13" />
            </div>
          </div>

          {/* Card 2: System Size with DCR / Non-DCR Active Indicator */}
          <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between relative overflow-hidden">
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  2. System Size
                </p>
                <span
                  className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                    isDCR
                      ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                      : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                  }`}
                >
                  {isDCR ? 'DCR Active' : 'Non-DCR Active'}
                </span>
              </div>
              <div className="text-2xl font-black text-[#2563EB] mt-0.5">
                {calculatedSystemKw}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">KW</p>
            </div>
            <div className="shrink-0">
              <SystemSizeSolarIcon className="w-13 h-13" />
            </div>
          </div>

          {/* Card 3: No. of panels */}
          <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                3. No. of panels
              </p>
              <div className="text-2xl font-black text-[#16A34A] mt-0.5">
                {panelCount}
              </div>
              <p className="text-[10px] text-slate-400 font-medium">Panels</p>
            </div>
            <div className="shrink-0">
              <PanelArrayIcon className="w-13 h-13" />
            </div>
          </div>

          {/* Card 4: Roof Area Needed */}
          <div
            onClick={() => onNavigate('estimator')}
            className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between cursor-pointer hover:border-amber-300 transition group"
            title="Click to adjust available roof area in Estimator"
          >
            <div>
              <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                4. Roof Area Needed
              </p>
              <div className="text-2xl font-black text-[#2563EB] mt-0.5">
                {calculatedRoofAreaNeeded}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-[10px] text-slate-400 font-medium">m²</span>
                {availableRoofM2 > 0 && (
                  <span
                    className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded-md ${
                      isRoofAdequate
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {isRoofAdequate ? `✓ ${availableRoofM2}m² fits` : `⚠️ ${availableRoofM2}m² limit`}
                  </span>
                )}
              </div>
            </div>
            <div className="shrink-0 group-hover:scale-105 transition transform">
              <RoofAreaHouseIcon className="w-13 h-13" />
            </div>
          </div>
        </div>

        {/* Interlinked System Capacity Quick Presets (3 kW to 1 MW) */}
        <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-[#F97316]" />
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Interlinked Capacity Presets ({selectedPanelSpec.wattage}W Module)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsEngineeringModalOpen(true)}
                className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer flex items-center gap-0.5"
                title="Configure panel gaps, row pitch, walkways, and boundary setbacks"
              >
                <Sliders className="w-3 h-3" />
                <span>Clearances</span>
              </button>
              <button
                type="button"
                onClick={() => setIsPanelSpecsOpen(true)}
                className="text-[11px] font-bold text-[#F97316] hover:underline cursor-pointer"
              >
                Matrix Guide
              </button>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
            {SYSTEM_CAPACITY_PRESETS.map((preset) => {
              const isSelected = calculatedSystemKw === preset.kw;
              const count = Math.ceil((preset.kw * 1000) / selectedWattage);
              const area = parseFloat((count * moduleAreaPerPanel).toFixed(1));

              return (
                <button
                  key={preset.label}
                  onClick={() => {
                    setTargetSystemKw(preset.kw);
                    setOverridePanelCount(null);
                  }}
                  className={`px-2.5 py-2 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer border flex flex-col items-center min-w-[68px] ${
                    isSelected
                      ? 'bg-[#F97316] text-white border-[#F97316] shadow-xs'
                      : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750'
                  }`}
                >
                  <span className="font-mono text-[11px] font-extrabold">{preset.label}</span>
                  <span className="text-[9.5px] font-normal opacity-85">{count} panels</span>
                  <span className="text-[9px] font-medium opacity-75">{area} m²</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Card: Solar System Details */}
        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Sun className="w-4 h-4 text-amber-500" />
            </div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Solar System Details
            </h2>
          </div>

          {/* Slider: Peak Sun Hours Per Day */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 dark:text-slate-300">
                Peak Sun Hours Per Day
              </span>
              <span className="text-amber-500 font-bold text-sm">
                {peakSunHours} Hrs
              </span>
            </div>
            <input
              type="range"
              min="3"
              max="7"
              step="0.5"
              value={peakSunHours}
              onChange={(e) => setPeakSunHours(parseFloat(e.target.value))}
              className="w-full accent-[#F97316] cursor-pointer"
            />
          </div>

          <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

          {/* Panel Wattage Selector Pills & Physical Specifications */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Panel Wattage & Size
              </span>
              <button
                type="button"
                onClick={() => setIsPanelSpecsOpen(true)}
                className="text-[11px] font-bold text-[#F97316] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Specs Guide (540W–750W)</span>
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>

            {/* Grid of official catalog models */}
            <div className="grid grid-cols-5 gap-1.5">
              {SOLAR_PANEL_CATALOG.map((panel) => (
                <button
                  key={panel.wattage}
                  onClick={() => setSelectedWattage(panel.wattage as PanelWattage)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer border flex flex-col items-center justify-center ${
                    selectedWattage === panel.wattage
                      ? 'bg-[#F97316] text-white border-[#F97316] shadow-xs'
                      : 'bg-[#F1F5F9] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-transparent hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  <span className="font-mono">{panel.wattage}W</span>
                  <span className="text-[9px] font-normal opacity-80">{panel.areaSqm}m²</span>
                </button>
              ))}
            </div>

            {/* Active Panel Dimensions & Area Specification Card */}
            <div className="p-3 bg-amber-500/10 dark:bg-amber-950/30 rounded-2xl border border-amber-500/25 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-[#F97316]" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {selectedPanelSpec.wattage}W Solar Module
                  </span>
                </div>
                <span className="text-xs font-mono font-extrabold text-[#F97316]">
                  {selectedPanelSpec.areaSqm} m² / panel
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-400">
                <div>
                  <span className="block text-[9.5px] uppercase font-semibold text-slate-400">Dimensions</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {selectedPanelSpec.dimensionsMm}
                  </span>
                </div>
                <div>
                  <span className="block text-[9.5px] uppercase font-semibold text-slate-400">Required Array Space</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {calculatedRoofAreaNeeded} m² ({Math.round(calculatedRoofAreaNeeded * 10.7639)} sq ft)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="h-[1px] bg-slate-100 dark:bg-slate-800" />

          {/* System Type Selection + Conditional Self-Entered Battery Backup */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                System Type
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {activeSystemType === 'on-grid'
                  ? 'Grid Net-Metered'
                  : activeSystemType === 'hybrid'
                  ? 'Grid + Backup'
                  : 'Standalone Battery'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'on-grid', label: 'On-Grid', sub: 'Grid Export' },
                  { id: 'hybrid', label: 'Hybrid', sub: 'Grid + Backup' },
                  { id: 'off-grid', label: 'Off-Grid', sub: 'Battery Bank' },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => handleSelectSystemMode(mode.id)}
                  className={`py-2 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                    activeSystemType === mode.id
                      ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                      : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-[11px] font-bold leading-tight">{mode.label}</span>
                  <span className="text-[9px] font-medium opacity-85 leading-tight">
                    {mode.sub}
                  </span>
                </button>
              ))}
            </div>

            {(activeSystemType === 'hybrid' || activeSystemType === 'off-grid') && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <BatteryCharging className="w-3.5 h-3.5 text-[#FF6F00]" />
                    <label
                      htmlFor="req-battery-backup-input"
                      className="text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      Battery Backup (Hours)
                    </label>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Based on Inverter
                  </span>
                </div>
                <input
                  id="req-battery-backup-input"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={batteryBackupStr}
                  onChange={(e) => handleManualBackupChange(e.target.value)}
                  placeholder="Enter backup hours based on inverter"
                  className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                />
              </div>
            )}
          </div>
        </div>

        {/* Card: Electricity Details */}
        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
              </div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Electricity Details
              </h2>
            </div>

            <button
              onClick={() => onNavigate('estimator')}
              className="px-3.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
            >
              Edit
            </button>
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
            <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 fill-slate-400" />
            <p className="line-clamp-2 leading-relaxed">{addressText}</p>
          </div>

          {/* Green Highlight Container: Wallet icon + 600 Units + Go Solar Save More */}
          <div className="bg-[#F0FDF4] dark:bg-emerald-950/30 rounded-2xl p-3.5 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <WalletSavingsIcon className="w-10 h-10 shrink-0" />
              <div>
                <div className="text-base font-extrabold text-[#16A34A] leading-tight">
                  {inputs.monthlyUnits} Units
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Monthly Consumption Unit
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-bold text-[#16A34A]">
              <Leaf className="w-3.5 h-3.5 text-emerald-500 fill-emerald-500" />
              <div className="text-right">
                <div className="leading-tight">Go Solar</div>
                <div className="text-[10px] text-emerald-600 font-semibold">Save More</div>
              </div>
            </div>
          </div>
        </div>

        {/* Initial Calculation Trigger (unlocks reactive System Type selector, DCR hardware filter & Conditional BOM) */}
        {!hasPerformedInitialCalc && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => {
                setHasPerformedInitialCalc(true);
                onUpdateInputs({
                  peakSunHours,
                  panelWattage: selectedWattage,
                });
                setTimeout(
                  () =>
                    postCalcRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    }),
                  60
                );
              }}
              className="w-full py-4 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] active:scale-[0.99] text-white font-bold text-sm shadow-md transition duration-150 cursor-pointer flex items-center justify-center gap-2"
            >
              <Calculator className="w-4 h-4" />
              <span>Calculate System Requirements &amp; Generate BOM</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* POST-CALCULATION: Reactive System Type Selector + DCR Hardware Filter + Conditional BOM */}
        {hasPerformedInitialCalc && (
          <div ref={postCalcRef} className="space-y-4">
            {/* 1. Reactive System Type Selector (On-Grid, Hybrid, Off-Grid) */}
            <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-[#FF6F00] flex items-center justify-center shrink-0">
                    <BatteryCharging className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      System Type &amp; Battery Control
                    </h2>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      Automatically adds or removes BOM battery parts
                    </p>
                  </div>
                </div>
                <span className="text-[10.5px] font-mono font-bold text-sky-700 dark:text-sky-300 shrink-0">
                  {activeSystemType !== 'on-grid' && architectureSpec.batteryKwh > 0
                    ? `${architectureSpec.batteryKwh} kWh Battery`
                    : `${architectureSpec.inverterCapacityKw} kW Inverter`}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    { id: 'on-grid', label: 'On-Grid', sub: 'Grid Export' },
                    { id: 'hybrid', label: 'Hybrid', sub: 'Grid + LFP' },
                    { id: 'off-grid', label: 'Off-Grid', sub: 'Mandatory Bank' },
                  ] as const
                ).map((arch) => (
                  <button
                    key={arch.id}
                    type="button"
                    onClick={() => handleSelectSystemMode(arch.id)}
                    className={`py-2.5 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                      activeSystemType === arch.id
                        ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-extrabold">{arch.label}</span>
                    <span className="text-[9.5px] opacity-85">{arch.sub}</span>
                  </button>
                ))}
              </div>

              {(activeSystemType === 'hybrid' || activeSystemType === 'off-grid') && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50">
                  <label
                    htmlFor="req-post-battery-backup-input"
                    className="text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0"
                  >
                    Battery Backup{architectureSpec.batteryKwh > 0 ? ` (${architectureSpec.batteryKwh} kWh)` : ''}:
                  </label>
                  <input
                    id="req-post-battery-backup-input"
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    value={batteryBackupStr}
                    onChange={(e) => handleManualBackupChange(e.target.value)}
                    placeholder="Enter hrs (inverter)"
                    className="w-40 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white text-right focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                  />
                </div>
              )}
            </div>

            {/* 2. DCR Hardware Filter & Cost Estimation Card */}
            <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    DCR Hardware Filter &amp; Cost Estimate
                  </span>
                </div>
                <DcrToggleSwitch
                  compact
                  id="req-postcalc-dcr-toggle"
                  moduleStandard={activeModuleStandard}
                  onChange={handleToggleDcrStandard}
                />
              </div>

              {/* Filtered Panel Hardware Strip */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-bold text-slate-600 dark:text-slate-300">
                    Available {isDCR ? 'DCR' : 'Non-DCR'} Solar Panels ({filteredPanels.length})
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {selectedPanelSpec.recommendedBrands[0]}
                  </span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {filteredPanels.map((panel) => (
                    <button
                      key={panel.wattage}
                      type="button"
                      onClick={() => {
                        const w = panel.wattage as PanelWattage;
                        setSelectedWattage(w);
                        onUpdateInputs({ panelWattage: w });
                      }}
                      className={`px-2.5 py-1.5 rounded-xl border text-left transition cursor-pointer shrink-0 min-w-[88px] ${
                        panel.wattage === selectedWattage
                          ? isDCR
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="font-mono text-xs font-extrabold">{panel.wattage}W</div>
                      <div className="text-[9.5px] opacity-85 truncate">
                        {panel.recommendedBrands[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Filtered Inverter Hardware Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-bold text-slate-600 dark:text-slate-300">
                    Filtered {architectureSpec.title} Inverters ({filteredInverters.length})
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#FF6F00]">
                    {selectedInverterModel?.efficiencyPct}% Eff
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {filteredInverters.map((inv) => (
                    <button
                      key={inv.id}
                      type="button"
                      onClick={() => setSelectedInverterId(inv.id)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        selectedInverterModel?.id === inv.id
                          ? 'bg-orange-50/70 dark:bg-orange-950/30 border-[#FF6F00]'
                          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {inv.brand}
                        </span>
                        <span className="text-[9.5px] font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                          {inv.costDeltaPerKwInr === 0
                            ? 'Base'
                            : inv.costDeltaPerKwInr > 0
                            ? `+₹${inv.costDeltaPerKwInr}/kW`
                            : `-₹${Math.abs(inv.costDeltaPerKwInr)}/kW`}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                        {inv.modelSeries}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Updated Cost Estimation Summary */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70">
                  <span className="block text-[9.5px] font-bold text-slate-400 uppercase">Gross Cost</span>
                  <span className="font-mono text-xs font-extrabold text-slate-900 dark:text-white">
                    {currencySymbol}{architectureSpec.grossCost.toLocaleString()}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30">
                  <span className="block text-[9.5px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Subsidy</span>
                  <span className="font-mono text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                    -{currencySymbol}{architectureSpec.governmentSubsidy.toLocaleString()}
                  </span>
                </div>
                <div className="p-2 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-800/50">
                  <span className="block text-[9.5px] font-bold text-amber-800 dark:text-amber-300 uppercase">Net Cost</span>
                  <span className="font-mono text-xs font-black text-[#FF6F00]">
                    {currencySymbol}{architectureSpec.netCost.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Interlinked Conditional BOM, Battery Clarity & 3-Way Axis Control */}
            <BomAndInterlinkPanel
              bom={reqBom}
              consumerCategory={activeCategory}
              monthlyUnits={inputs.monthlyUnits || 420}
              connectedLoadKw={Math.max(
                inputs.sanctionedLoadKw || 4,
                Number(((inputs.monthlyUnits || 420) / 120).toFixed(1))
              )}
              moduleStandard={activeModuleStandard}
              systemType={activeSystemType}
              pvCapacityKw={calculatedSystemKw}
              panelCount={panelCount}
              batteryKwh={architectureSpec.batteryKwh}
              onChangeConsumerCategory={(cat) =>
                onUpdateInputs({
                  consumerCategory: cat,
                  ...(cat !== 'residential' ? { phaseType: 'three_phase' } : {}),
                })
              }
              onChangeModuleStandard={handleToggleDcrStandard}
              onChangeSystemType={(st) => {
                onUpdateInputs({
                  systemType: st,
                  requiresBattery: st !== 'on-grid',
                  enableGridExport: st !== 'off-grid',
                });
                setSelectedInverterId(null);
              }}
              onNavigateToAppliances={() => onNavigate('appliances')}
              defaultExpanded={true}
            />

            {/* Bottom Action Button: Proceed to Estimation & Savings */}
            <div className="pt-1">
              <button
                onClick={() => onNavigate('savings')}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.99] text-white font-bold text-sm shadow-md transition duration-150 cursor-pointer"
              >
                View Full Financial Savings &amp; ROI
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Official Solar Panel Dimensions & Area Specs Comparison Modal */}
      <PanelSpecsModal
        isOpen={isPanelSpecsOpen}
        onClose={() => setIsPanelSpecsOpen(false)}
        selectedWattage={selectedWattage}
        roofAreaM2={availableRoofM2}
        onSelectWattage={(wattage) => {
          setSelectedWattage(wattage as PanelWattage);
        }}
        onApplyCapacity={(kw, panels) => {
          setTargetSystemKw(kw);
          setOverridePanelCount(panels);
        }}
      />

      {/* Engineering Rooftop Clearances & Setback Settings Modal */}
      <EngineeringLayoutSettingsModal
        isOpen={isEngineeringModalOpen}
        onClose={() => setIsEngineeringModalOpen(false)}
        roofAreaM2={availableRoofM2}
        panelWattage={selectedWattage}
        config={roofLayoutConfig}
        onUpdateConfig={(cfg) => setRoofLayoutConfig(cfg)}
        onApplyLayout={(res) => {
          setTargetSystemKw(res.systemKw);
          setOverridePanelCount(res.panelsCount);
        }}
      />
    </div>
  );
};
