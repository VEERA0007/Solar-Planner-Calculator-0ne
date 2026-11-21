import React, { useEffect, useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  MapPin,
  Zap,
  CheckCircle,
  TrendingUp,
  Sun,
  Leaf,
  Layers,
  Sparkles,
  Navigation,
  Sliders,
  ShieldCheck,
  Award,
  Info,
  Building,
  Home,
  Check,
  RotateCcw,
  X,
  AlertCircle,
  FileDown,
  BatteryCharging,
  History,
  Trash2,
  Play,
  Cloud,
  LogIn,
  LogOut,
} from 'lucide-react';
import { EstimatorPdfReportData } from '../utils/pdfReportGenerator';
import { resolveHistory12MonthAverage } from '../utils/monthlyAverage';
import { useFirebaseAuth } from '../context/FirebaseContext';
import { canDeleteSharedUscEntry } from '../services/uscHistoryService';
import { PdfExportModal } from '../components/PdfExportModal';
import {
  CurrencyCode,
  EstimatorInputs,
  ExistingSystemInputs,
  PanelWattage,
  ScreenId,
  SystemType,
  WeatherCondition,
  RoofLayoutConfig,
} from '../types/solar';
import { DEFAULT_EXISTING_SYSTEM_INPUTS } from '../data/defaultData';
import {
  SOLAR_PANEL_CATALOG,
  POPULAR_INVERTER_BRANDS,
  getFilteredInverterHardware,
  getFilteredPanelHardware,
  getInverterEngineeringSuggestions,
  getPanelSpecification,
} from '../data/panelDatabase';
import { PanelSpecsModal } from '../components/PanelSpecsModal';
import { EngineeringLayoutSettingsModal } from '../components/EngineeringLayoutSettingsModal';
import {
  DEFAULT_ROOF_LAYOUT_CONFIG,
  solveRooftopLayout,
} from '../utils/roofLayoutEngine';
import {
  DailyUsageGaugeIcon,
  SystemSizeSolarIcon,
  PanelArrayIcon,
  RoofAreaHouseIcon,
  RoofSunHouseBannerIcon,
  SolarPanelPedestalIcon,
  WalletSavingsIcon,
  EcoLeafSolarIcon,
} from '../components/EstimatorIllustrations';
import {
  RoofCalculationModal,
} from '../components/RoofCalculationModal';
import { InvestmentPaybackPeriodChart } from '../components/InvestmentPaybackPeriodChart';
import { ExistingSystemScreen } from './ExistingSystemScreen';
import { PowerGenerationCalcScreen } from './PowerGenerationCalcScreen';
import {
  CURRENCY_SYMBOLS,
  calculate25YearSensitivityRoi,
  calculateSystemArchitectureOption,
  generateConditionalBom,
} from '../utils/solarMath';
import { BomAndInterlinkPanel } from '../components/BomAndInterlinkPanel';
import { DcrToggleSwitch } from '../components/DcrToggleSwitch';
import { HistoricalUsageTrendChart } from '../components/HistoricalUsageTrendChart';
import { UscBillFetchPanel } from '../components/UscBillFetchPanel';
import { MonthlyBillRecord, UscHistoryEntry } from '../types/solar';
import { RealtimeTariffSyncResult } from '../services/tariffService';
import {
  DISCOM_PORTAL_SPECS,
  FourStateId,
  computeExactDiscomBill,
  estimateUnitsFromExactBill,
} from '../data/uscPortals';

interface EstimatorScreenProps {
  inputs: EstimatorInputs;
  onUpdateInputs: (updated: Partial<EstimatorInputs>) => void;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  applianceMonthlyKwh?: number;
  onDetectLocation?: () => void;
  isDetectingLocation?: boolean;
  onOpenChangeLocation?: () => void;
  onUpdateLocation?: (lat: number, lon: number, cityName?: string) => void;
  existingInputs?: ExistingSystemInputs;
  onUpdateExistingInputs?: (updated: Partial<ExistingSystemInputs>) => void;
  initialOption?: 'new_installation' | 'existing_system' | 'power_calc';
  initialNewInstallStep?: 'enquiry' | 'results' | 'roi_dashboard';
  roiTriggerNonce?: number;
  liveTariff?: RealtimeTariffSyncResult | null;
  isSyncingTariff?: boolean;
  onSyncLocalTariff?: () => void;
  onCalibrateFromAudit?: (avgUnits: number, avgBill: number, blendedTariff: number) => void;
  uscHistory?: UscHistoryEntry[];
  onRecordUscHistory?: (entry: UscHistoryEntry) => void;
  onRemoveUscHistory?: (id: string) => void;
}

export const EstimatorScreen: React.FC<EstimatorScreenProps> = ({
  inputs,
  onUpdateInputs,
  onNavigate,
  weather,
  onOpenWeather,
  applianceMonthlyKwh = 0,
  onOpenChangeLocation,
  onDetectLocation,
  isDetectingLocation = false,
  onUpdateLocation,
  existingInputs = DEFAULT_EXISTING_SYSTEM_INPUTS,
  onUpdateExistingInputs = () => {},
  initialOption = 'new_installation',
  initialNewInstallStep = 'enquiry',
  roiTriggerNonce = 0,
  liveTariff = null,
  isSyncingTariff = false,
  onSyncLocalTariff,
  onCalibrateFromAudit,
  uscHistory = [],
  onRecordUscHistory,
  onRemoveUscHistory,
}) => {
  const { user: firebaseUser, isSigningIn, authError, signInWithGoogle, signOutUser } = useFirebaseAuth();
  // 1. REBUILT 3 OPTIONS IN THE ESTIMATOR TAB:
  // Option 1: 'new_installation' (New Installation & Sizing with DCR / Non-DCR Enquiry)
  // Option 2: 'existing_system' (Existing Solar Plant Audit & PR)
  // Option 3: 'power_calc' (Power Generation & Yield Calculator)
  const [activeEstimatorOption, setActiveEstimatorOption] = useState<
    'new_installation' | 'existing_system' | 'power_calc'
  >(initialOption);

  // Sub-step inside Option 1 (New Installation):
  // 'enquiry': DCR / Non-DCR selection + Customer Enquiry (Units/Bill, Grid, Roof)
  // 'results': Sizing, Subsidy, Net Payable & Savings breakdown
  // 'roi_dashboard': Dedicated Return on Investment & Payback Analytics Dashboard
  const [newInstallStep, setNewInstallStep] = useState<'enquiry' | 'results' | 'roi_dashboard'>(
    initialNewInstallStep
  );

  useEffect(() => {
    if (roiTriggerNonce > 0) {
      setActiveEstimatorOption('new_installation');
      setNewInstallStep('roi_dashboard');
    }
  }, [roiTriggerNonce]);

  // Mandatory DCR vs Non-DCR Selection & System Architecture (On-Grid / Off-Grid / Hybrid):
  const [moduleStandard, setModuleStandard] = useState<'DCR' | 'NON_DCR'>(
    inputs.moduleStandard || 'DCR'
  );
  const [systemType, setSystemType] = useState<SystemType>(inputs.systemType || 'on-grid');
  const [batteryBackupHours, setBatteryBackupHours] = useState<number>(
    inputs.batteryBackupHours ?? 0
  );
  const [batteryBackupStr, setBatteryBackupStr] = useState<string>(
    inputs.batteryBackupHours && inputs.batteryBackupHours > 0
      ? String(inputs.batteryBackupHours)
      : ''
  );

  // Enquiry parameters:
  const [consumerCategory, setConsumerCategory] = useState<'residential' | 'commercial' | 'agricultural'>(
    inputs.consumerCategory || 'residential'
  );
  const [sanctionedLoadKw, setSanctionedLoadKw] = useState<number>(
    inputs.sanctionedLoadKw || 4.0
  );
  const [costPerUnitStr, setCostPerUnitStr] = useState<string>(
    String(inputs.tariffPerKwh ?? 7.15)
  );
  const [monthlyUnitsStr, setMonthlyUnitsStr] = useState<string>(
    String(inputs.monthlyUnits ?? 420)
  );
  const [consumptionInputMode, setConsumptionInputMode] = useState<'units' | 'bill' | 'usc'>('units');
  const [autoFetchSignal, setAutoFetchSignal] = useState<{
    uscNumber?: string;
    stateId?: FourStateId;
    nonce: number;
  } | null>(null);
  const [monthlyBillStr, setMonthlyBillStr] = useState<string>(
    String(inputs.monthlyBill ?? 3005)
  );
  const [roofAreaStr, setRoofAreaStr] = useState<string>(
    inputs.roofArea ? String(inputs.roofArea) : '27.5'
  );
  const [peakSunHours, setPeakSunHours] = useState<number>(inputs.peakSunHours || 5.2);
  const [selectedWattage, setSelectedWattage] = useState<PanelWattage>(
    inputs.panelWattage && inputs.panelWattage >= 540 ? inputs.panelWattage : 550
  );
  const [selectedInverterId, setSelectedInverterId] = useState<string | null>(null);
  const [customInverterBrand, setCustomInverterBrand] = useState<string>(
    inputs.inverterBrand || ''
  );
  const [customInverterPowerStr, setCustomInverterPowerStr] = useState<string>(
    inputs.inverterPowerKw && inputs.inverterPowerKw > 0 ? String(inputs.inverterPowerKw) : ''
  );

  const parsedCustomInverterKw = useMemo(() => {
    const n = parseFloat(customInverterPowerStr);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [customInverterPowerStr]);

  const handleCustomInverterBrandChange = (brand: string) => {
    setCustomInverterBrand(brand);
    onUpdateInputs({ inverterBrand: brand.trim() || undefined });
  };

  const handleCustomInverterPowerChange = (raw: string) => {
    setCustomInverterPowerStr(raw);
    const n = parseFloat(raw);
    onUpdateInputs({
      inverterPowerKw: Number.isFinite(n) && n > 0 ? n : undefined,
    });
  };

  const filteredPanels = useMemo(
    () => getFilteredPanelHardware(moduleStandard),
    [moduleStandard]
  );
  const filteredInverters = useMemo(
    () => getFilteredInverterHardware(moduleStandard, systemType),
    [moduleStandard, systemType]
  );
  const selectedInverterModel = useMemo(
    () =>
      filteredInverters.find((inv) => inv.id === selectedInverterId) ||
      filteredInverters[0],
    [filteredInverters, selectedInverterId]
  );

  const applyModuleStandardChange = (nextStandard: 'DCR' | 'NON_DCR') => {
    setModuleStandard(nextStandard);
    const nextPanelsList = getFilteredPanelHardware(nextStandard);
    const nextInvertersList = getFilteredInverterHardware(nextStandard, systemType);
    const stillSupportsWattage = nextPanelsList.some((p) => p.wattage === selectedWattage);
    const nextWattage = (
      stillSupportsWattage
        ? selectedWattage
        : nextPanelsList.find((p) => p.wattage === 550)?.wattage || nextPanelsList[0]?.wattage || 540
    ) as PanelWattage;
    if (nextWattage !== selectedWattage) {
      setSelectedWattage(nextWattage);
    }
    setSelectedInverterId(nextInvertersList[0]?.id || null);
    onUpdateInputs({ moduleStandard: nextStandard, panelWattage: nextWattage });
  };

  const applySystemTypeChange = (nextArch: SystemType) => {
    setSystemType(nextArch);
    setSelectedInverterId(null);
    if (nextArch === 'on-grid') {
      setBatteryBackupHours(0);
      onUpdateInputs({
        batteryBackupHours: 0,
        systemType: 'on-grid',
        requiresBattery: false,
        enableGridExport: true,
      });
    } else {
      const parsed = parseFloat(batteryBackupStr);
      const enteredHrs = Number.isFinite(parsed) && parsed > 0 ? Math.min(24, parsed) : 0;
      setBatteryBackupHours(enteredHrs);
      onUpdateInputs({
        batteryBackupHours: enteredHrs,
        systemType: nextArch,
        requiresBattery: true,
        enableGridExport: nextArch !== 'off-grid',
      });
    }
  };

  const handleBatteryBackupInputChange = (raw: string) => {
    setBatteryBackupStr(raw);
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      const clamped = Math.min(24, parsed);
      setBatteryBackupHours(clamped);
      onUpdateInputs({
        batteryBackupHours: clamped,
        requiresBattery: true,
      });
    } else {
      setBatteryBackupHours(0);
      onUpdateInputs({
        batteryBackupHours: 0,
      });
    }
  };

  const activeFourStateId: FourStateId = useMemo(() => {
    if (liveTariff?.stateId) return liveTariff.stateId;
    const raw = (inputs.uscStateId || inputs.state || weather.city || '').toLowerCase();
    if (raw.includes('andhra') || raw.includes('vijayawada') || raw.includes('visakhapatnam') || raw.includes('tirupati')) {
      return 'andhra_pradesh';
    }
    if (raw.includes('odis') || raw.includes('orissa') || raw.includes('bhubaneswar') || raw.includes('cuttack')) {
      return 'odissa';
    }
    if (raw.includes('chandigarh')) return 'chandigarh';
    return 'telangana';
  }, [liveTariff?.stateId, inputs.uscStateId, inputs.state, weather.city]);

  const activeGridCategory = consumerCategory === 'commercial' ? 'commercial' : 'domestic';
  const activeDiscomShortName =
    liveTariff?.providerShortName ||
    inputs.discom ||
    DISCOM_PORTAL_SPECS.find((d) => d.stateId === activeFourStateId)?.shortName ||
    'TGSPDCL';

  const hasSyncedVerifiedDiscom = Boolean(
    inputs.uscNumber &&
      Array.isArray(inputs.monthlyHistory12) &&
      inputs.monthlyHistory12.some((m) => m.isVerifiedPortalData)
  );

  const handleClearUscLock = () => {
    onUpdateInputs({
      uscNumber: undefined,
      uscStateId: undefined,
      uscDiscomId: undefined,
      monthlyHistory12: undefined,
    });
  };

  // Sync interlinked inputs whenever Appliance Load Analysis or DISCOM Portal updates standard, architecture, category, or usage
  useEffect(() => {
    if (typeof inputs.tariffPerKwh === 'number' && inputs.tariffPerKwh > 0) {
      setCostPerUnitStr(String(inputs.tariffPerKwh));
    }
    if (inputs.monthlyUnits && inputs.monthlyUnits > 0) {
      setMonthlyUnitsStr(String(inputs.monthlyUnits));
      if (typeof inputs.monthlyBill === 'number' && inputs.monthlyBill > 0) {
        setMonthlyBillStr(String(inputs.monthlyBill));
      } else {
        setMonthlyBillStr(
          String(
            computeExactDiscomBill(
              inputs.monthlyUnits,
              activeFourStateId,
              inputs.consumerCategory === 'commercial' ? 'commercial' : 'domestic',
              inputs.sanctionedLoadKw || sanctionedLoadKw || 4
            )
          )
        );
      }
    }
    if (inputs.consumerCategory) {
      setConsumerCategory(inputs.consumerCategory);
    }
    if (inputs.sanctionedLoadKw) {
      setSanctionedLoadKw(inputs.sanctionedLoadKw);
    }
    if (inputs.moduleStandard) {
      setModuleStandard(inputs.moduleStandard);
    }
    if (inputs.systemType) {
      setSystemType(inputs.systemType);
    }
    if (typeof inputs.batteryBackupHours === 'number') {
      setBatteryBackupHours(inputs.batteryBackupHours);
      setBatteryBackupStr(
        inputs.batteryBackupHours > 0 ? String(inputs.batteryBackupHours) : ''
      );
    }
    if (inputs.panelWattage && inputs.panelWattage >= 540) {
      setSelectedWattage(inputs.panelWattage);
    }
    if (inputs.peakSunHours) {
      setPeakSunHours(inputs.peakSunHours);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    inputs.monthlyUnits,
    inputs.monthlyBill,
    inputs.tariffPerKwh,
    inputs.consumerCategory,
    inputs.sanctionedLoadKw,
    inputs.moduleStandard,
    inputs.systemType,
    inputs.batteryBackupHours,
    inputs.panelWattage,
    inputs.peakSunHours,
  ]);

  // Derived numeric values with safe fallbacks and validation
  const parsedUnits = parseFloat(monthlyUnitsStr);
  const isUnitsValid = !isNaN(parsedUnits) && parsedUnits > 0;
  const monthlyUnits = isUnitsValid ? parsedUnits : (monthlyUnitsStr === '' ? 0 : 0);

  const parsedBill = parseFloat(monthlyBillStr);
  const isBillValid = !isNaN(parsedBill) && parsedBill > 0;
  const monthlyBillAmount = isBillValid ? parsedBill : 0;

  const parsedCost = parseFloat(costPerUnitStr);
  const isCostValid = !isNaN(parsedCost) && parsedCost > 0;
  const costPerUnit = isCostValid ? parsedCost : 7.15;

  const parsedRoofArea = parseFloat(roofAreaStr);
  const isRoofAreaValid =
    roofAreaStr.trim() === '' || (!isNaN(parsedRoofArea) && parsedRoofArea > 0);
  const roofAreaM2 = !isNaN(parsedRoofArea) && parsedRoofArea > 0 ? parsedRoofArea : 0;

  const parsedBatteryHrs = parseFloat(batteryBackupStr);
  const isBatteryBackupValid =
    systemType === 'on-grid' ||
    batteryBackupStr.trim() === '' ||
    (!isNaN(parsedBatteryHrs) && parsedBatteryHrs > 0 && parsedBatteryHrs <= 24);

  const isUsageDataValid =
    isUnitsValid &&
    isCostValid &&
    isRoofAreaValid &&
    isBatteryBackupValid &&
    (consumptionInputMode !== 'bill' || isBillValid) &&
    (consumptionInputMode !== 'usc' || monthlyUnits > 0);

  const usageValidationMessage = (() => {
    if (consumptionInputMode === 'usc' && monthlyUnits <= 0) {
      return 'Fetch your DISCOM USC ledger or enter valid monthly usage before calculating.';
    }
    if (consumptionInputMode === 'bill' && !isBillValid) {
      return 'Enter a valid monthly electricity bill amount greater than ₹0.';
    }
    if (!isUnitsValid) {
      return 'Enter valid monthly electricity consumption (kWh) greater than 0.';
    }
    if (!isCostValid) {
      return 'Enter a valid electricity cost per unit greater than ₹0/kWh.';
    }
    if (!isRoofAreaValid) {
      return 'Roof area must be greater than 0 m² (or leave blank).';
    }
    if (!isBatteryBackupValid) {
      return 'Battery backup hours must be between 1 and 24 hours.';
    }
    return null;
  })();

  const [enquirySubmitAttempted, setEnquirySubmitAttempted] = useState(false);

  useEffect(() => {
    if (isUsageDataValid && enquirySubmitAttempted) {
      setEnquirySubmitAttempted(false);
    }
  }, [isUsageDataValid, enquirySubmitAttempted]);

  // Helper accordion: "Don't know your monthly consumption unit?"
  const [isHelperOpen, setIsHelperOpen] = useState(false);
  const [helperBillAmount, setHelperBillAmount] = useState<string>('4800');

  // Roof calculation interactive satellite map modal
  const [isRoofMapOpen, setIsRoofMapOpen] = useState(false);

  // Panel specifications comparison modal
  const [isPanelSpecsOpen, setIsPanelSpecsOpen] = useState(false);

  // Enhanced PDF Export Studio modal
  const [isPdfExportModalOpen, setIsPdfExportModalOpen] = useState(false);

  // DCR vs Non-DCR Information Modal & Inline Tooltip Popover
  const [isModuleInfoModalOpen, setIsModuleInfoModalOpen] = useState(false);
  const [isModuleTooltipOpen, setIsModuleTooltipOpen] = useState(false);

  // Close inline tooltip when clicking outside
  useEffect(() => {
    if (!isModuleTooltipOpen) return;
    const handleOutsideClick = () => setIsModuleTooltipOpen(false);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isModuleTooltipOpen]);

  // Interlinked sizing overrides (editable kW & panel count with min 3 kW and no upper cap)
  const [targetSystemKw, setTargetSystemKw] = useState<number | null>(null);
  const [overridePanelCount, setOverridePanelCount] = useState<number | null>(null);
  const [lastEditedSizingField, setLastEditedSizingField] = useState<'kw' | 'panels' | null>(null);
  const [editableKwStr, setEditableKwStr] = useState<string>('4');
  const [editablePanelsStr, setEditablePanelsStr] = useState<string>('8');

  // Engineering Clearances & Setbacks State
  const [roofLayoutConfig, setRoofLayoutConfig] = useState<RoofLayoutConfig>(DEFAULT_ROOF_LAYOUT_CONFIG);
  const [isEngineeringModalOpen, setIsEngineeringModalOpen] = useState(false);

  // Indian Rupees (INR) fixed default currency
  const currencyCode: CurrencyCode = 'INR';
  const currencySymbol = CURRENCY_SYMBOLS[currencyCode] || '₹';

  // Estimation view toggles (Monthly vs Yearly) & ROI Sensitivity Controls
  const [savingsFrequency, setSavingsFrequency] = useState<'monthly' | 'yearly'>('monthly');
  const [expectedTariffIncreasePct, setExpectedTariffIncreasePct] = useState<number>(2.5);
  const [maintenanceCostPct, setMaintenanceCostPct] = useState<number>(1.0);

  // Address display matching screenshots
  const addressText =
    weather.city?.includes('Banjara Hills') || weather.city?.includes('Hyderabad')
      ? '8-2-603/E/26, Gouri Shankar Nagar Colony, Banjara Hills, Hyderabad'
      : weather.city || '8-2-603/E/26, Gouri Shankar Nagar Colony, Banjara Hills, Hyderabad';

  // 1. Daily usage = Monthly units / 30
  const dailyUsage = monthlyUnits > 0 ? parseFloat((monthlyUnits / 30).toFixed(2)) : 0;

  // Exact state DISCOM slab bill verification for current monthlyUnits
  const exactSlabBillForUnits = useMemo(
    () =>
      monthlyUnits > 0
        ? computeExactDiscomBill(
            monthlyUnits,
            activeFourStateId,
            activeGridCategory,
            sanctionedLoadKw
          )
        : 0,
    [monthlyUnits, activeFourStateId, activeGridCategory, sanctionedLoadKw]
  );

  // 2. Weather-modulated Solar Performance Ratio (PR):
  const tempDerating = Math.max(0, (weather.temperatureC - 25) * 0.0035);
  const effectivePR = Math.max(0.68, Math.min(0.85, 0.78 - tempDerating));

  // 3. Exact Panel-Stepped Recommended System kW (matches solarMath.calculateSolarSystemRequirements)
  const pvFactor = systemType === 'off-grid' ? 1.15 : systemType === 'hybrid' ? 1.05 : 1.0;
  const minPanels3Kw = Math.max(1, Math.ceil(3000 / selectedWattage));
  const rawRecommendedKw =
    dailyUsage > 0 ? (dailyUsage * pvFactor) / (peakSunHours * effectivePR) : 3;
  const recommendedPanelCount = Math.max(
    minPanels3Kw,
    Math.ceil((rawRecommendedKw * 1000) / selectedWattage)
  );
  const recommendedDefaultKw = Number(
    ((recommendedPanelCount * selectedWattage) / 1000).toFixed(2)
  );
  let calculatedSystemKw: number;
  let panelCount: number;

  if (targetSystemKw !== null && targetSystemKw >= 3) {
    calculatedSystemKw = targetSystemKw;
    panelCount = Math.max(1, Math.ceil((targetSystemKw * 1000) / selectedWattage));
  } else if (overridePanelCount !== null && overridePanelCount >= 1) {
    const computedFromPanels = parseFloat(((overridePanelCount * selectedWattage) / 1000).toFixed(2));
    if (computedFromPanels >= 3) {
      panelCount = overridePanelCount;
      calculatedSystemKw = computedFromPanels;
    } else {
      calculatedSystemKw = recommendedDefaultKw;
      panelCount = recommendedPanelCount;
    }
  } else {
    calculatedSystemKw = recommendedDefaultKw;
    panelCount = recommendedPanelCount;
  }

  const minPanelsFor3Kw = Math.max(1, Math.ceil(3000 / selectedWattage));
  const trimmedKw = editableKwStr.trim();
  const parsedEditableKw = trimmedKw === '' ? NaN : Number(trimmedKw);
  const isEditableKwValid = Number.isFinite(parsedEditableKw) && parsedEditableKw >= 3;

  const trimmedPanels = editablePanelsStr.trim();
  const parsedEditablePanels = trimmedPanels === '' ? NaN : Number(trimmedPanels);
  const isPanelsWholePositive =
    Number.isFinite(parsedEditablePanels) &&
    Number.isInteger(parsedEditablePanels) &&
    parsedEditablePanels >= 1;
  const isEditablePanelsValid =
    isPanelsWholePositive &&
    Number(((parsedEditablePanels * selectedWattage) / 1000).toFixed(2)) >= 3;

  const sizingValidationError = (() => {
    if (lastEditedSizingField === 'panels') {
      if (trimmedPanels === '') return `Please enter panel count (min ${minPanelsFor3Kw} panels for 3 kW)`;
      if (!Number.isFinite(parsedEditablePanels)) return 'Enter a valid whole number of panels';
      if (parsedEditablePanels <= 0) return `Panel count must be greater than 0 (min ${minPanelsFor3Kw} panels)`;
      if (!Number.isInteger(parsedEditablePanels)) return 'Number of panels must be a whole number';
      if (!isEditablePanelsValid) {
        const kwVal = ((parsedEditablePanels * selectedWattage) / 1000).toFixed(2);
        return `${parsedEditablePanels} panels = ${kwVal} kW — minimum system capacity is 3 kW (${minPanelsFor3Kw}+ panels)`;
      }
      return null;
    }
    if (trimmedKw === '') return 'Please enter system capacity (minimum 3 kW)';
    if (!Number.isFinite(parsedEditableKw)) return 'Enter a valid numeric capacity';
    if (parsedEditableKw <= 0) return 'Capacity must be greater than 0 (minimum 3 kW)';
    if (parsedEditableKw < 3) return 'Minimum system capacity is 3 kW';
    return null;
  })();

  // 4. Rooftop Area calculations
  const selectedPanelSpec = getPanelSpecification(selectedWattage);
  const moduleAreaPerPanel = (selectedPanelSpec.lengthMm * selectedPanelSpec.widthMm) / 1000000;
  const calculatedRoofAreaNeeded = parseFloat((panelCount * moduleAreaPerPanel).toFixed(1));
  const isRoofAdequate = roofAreaM2 >= calculatedRoofAreaNeeded;

  // Live engineering layout analysis when roofAreaM2 is provided
  const engineeringLayout = useMemo(() => {
    if (roofAreaM2 <= 0) return null;
    return solveRooftopLayout(roofAreaM2, selectedWattage, roofLayoutConfig);
  }, [roofAreaM2, selectedWattage, roofLayoutConfig]);

  // 5. Turnkey Cost, Inverter, Battery & PM Surya Ghar Subsidy based on System Type + DCR/Non-DCR
  const isDCR = moduleStandard === 'DCR';
  const baseCostPerKw = isDCR ? 54000 : 42000;

  const architectureSpec = useMemo(
    () =>
      calculateSystemArchitectureOption({
        systemType,
        monthlyKwh: monthlyUnits || 420,
        connectedLoadKw: Math.max(sanctionedLoadKw, Number((monthlyUnits / 120).toFixed(1))),
        moduleStandard,
        consumerCategory,
        currency: currencyCode,
        tariffPerKwh: costPerUnit,
        peakSunHours,
        panelWattage: selectedWattage,
        effectivePR,
        backupHours: batteryBackupHours,
        explicitPvKw: calculatedSystemKw,
        explicitPanelCount: panelCount,
        selectedInverterModel,
        customInverterBrand: customInverterBrand.trim() || undefined,
        customInverterPowerKw: parsedCustomInverterKw ?? undefined,
        feedInTariffPerKwh: inputs.feedInTariffPerKwh ?? liveTariff?.feedInTariffPerKwh ?? 3.1,
      }),
    [
      systemType,
      monthlyUnits,
      sanctionedLoadKw,
      moduleStandard,
      consumerCategory,
      currencyCode,
      costPerUnit,
      peakSunHours,
      selectedWattage,
      effectivePR,
      batteryBackupHours,
      calculatedSystemKw,
      panelCount,
      selectedInverterModel,
      customInverterBrand,
      parsedCustomInverterKw,
      inputs.feedInTariffPerKwh,
      liveTariff?.feedInTariffPerKwh,
    ]
  );

  const inverterSuggestions = useMemo(
    () =>
      getInverterEngineeringSuggestions({
        pvDcKw: calculatedSystemKw,
        systemType,
        moduleStandard,
        panelWattage: selectedWattage,
        connectedLoadKw: Math.max(sanctionedLoadKw, Number(((monthlyUnits || 420) / 120).toFixed(1))),
        customBrand: customInverterBrand,
        customPowerKw: parsedCustomInverterKw,
      }),
    [
      calculatedSystemKw,
      systemType,
      moduleStandard,
      selectedWattage,
      sanctionedLoadKw,
      monthlyUnits,
      customInverterBrand,
      parsedCustomInverterKw,
    ]
  );

  const grossCost = architectureSpec.grossCost;
  const governmentSubsidy = architectureSpec.governmentSubsidy;
  const netPayable = architectureSpec.netCost;

  const estimatorBom = useMemo(
    () =>
      generateConditionalBom({
        systemType,
        moduleStandard,
        consumerCategory,
        phaseType: inputs.phaseType,
        pvCapacityKw: calculatedSystemKw,
        panelCount,
        panelWattage: selectedWattage,
        inverterCapacityKw: architectureSpec.inverterCapacityKw,
        inverterLabel: architectureSpec.inverterLabel,
        batteryKwh: architectureSpec.batteryKwh,
        batteryUnits: architectureSpec.batteryUnits,
        batteryPackLabel: architectureSpec.batteryPackLabel,
        backupHours: batteryBackupHours,
        connectedLoadKw: Math.max(sanctionedLoadKw, Number(((monthlyUnits || 420) / 120).toFixed(1))),
        roofAreaNeededSqm: calculatedRoofAreaNeeded,
        selectedInverterModel,
        customInverterBrand: customInverterBrand.trim() || undefined,
      }),
    [
      systemType,
      moduleStandard,
      consumerCategory,
      inputs.phaseType,
      calculatedSystemKw,
      panelCount,
      selectedWattage,
      architectureSpec,
      batteryBackupHours,
      sanctionedLoadKw,
      monthlyUnits,
      calculatedRoofAreaNeeded,
      selectedInverterModel,
      customInverterBrand,
    ]
  );

  // 6. Generation & Financial Savings:
  const estimatedMonthlyGenKwh = architectureSpec.monthlyGenerationKwh;
  const replacedUnits = Math.min(monthlyUnits, estimatedMonthlyGenKwh);
  const exportedUnits =
    systemType === 'off-grid' ? 0 : Math.max(0, estimatedMonthlyGenKwh - monthlyUnits);
  const calculatedMonthlySavings = architectureSpec.monthlySavings;
  const calculatedAnnualSavings = architectureSpec.annualSavings;

  // Dynamic 25-Year Sensitivity Projection & Real-Time Payback Years
  const sensitivityRoi = useMemo(
    () =>
      calculate25YearSensitivityRoi({
        installationCost: grossCost,
        subsidyAmount: governmentSubsidy,
        annualSavings: calculatedAnnualSavings,
        expectedTariffIncreasePct,
        maintenanceCostPct,
        includeInverterReplacement: true,
      }),
    [
      grossCost,
      governmentSubsidy,
      calculatedAnnualSavings,
      expectedTariffIncreasePct,
      maintenanceCostPct,
    ]
  );

  const paybackYears = sensitivityRoi.breakEvenYear;
  const lifetimeSavings25Yr = sensitivityRoi.lifetimeCumulativeSavings;
  const co2AvoidedKg = Math.round(calculatedSystemKw * peakSunHours * 365 * 0.82);

  // Handlers
  const handleCalculateSolarSystem = () => {
    if (!isUsageDataValid) {
      setEnquirySubmitAttempted(true);
      return;
    }
    setEnquirySubmitAttempted(false);

    const pvFactor = systemType === 'off-grid' ? 1.15 : systemType === 'hybrid' ? 1.05 : 1.0;
    const rawKw = dailyUsage > 0 ? (dailyUsage * pvFactor) / (peakSunHours * effectivePR) : 3;
    const minP = Math.max(1, Math.ceil(3000 / selectedWattage));
    const initialPanels = Math.max(minP, Math.ceil((rawKw * 1000) / selectedWattage));
    const initialKw = Number(((initialPanels * selectedWattage) / 1000).toFixed(2));
    setTargetSystemKw(null);
    setOverridePanelCount(null);
    setLastEditedSizingField(null);
    setEditableKwStr(String(initialKw));
    setEditablePanelsStr(String(initialPanels));

    onUpdateInputs({
      tariffPerKwh: costPerUnit,
      monthlyUnits: monthlyUnits,
      monthlyBill: monthlyBillAmount,
      roofArea: roofAreaM2,
      roofAreaUnit: 'sqm',
      peakSunHours: peakSunHours,
      panelWattage: selectedWattage,
      currency: currencyCode,
      moduleStandard: moduleStandard,
      systemType: systemType,
      requiresBattery: systemType !== 'on-grid',
      batteryBackupHours: batteryBackupHours,
      enableGridExport: systemType !== 'off-grid',
      consumerCategory: consumerCategory,
      phaseType: inputs.phaseType || 'single_phase',
      sanctionedLoadKw: sanctionedLoadKw,
      inverterBrand: customInverterBrand.trim() || undefined,
      inverterPowerKw: parsedCustomInverterKw ?? undefined,
    });
    setNewInstallStep('results');
  };

  const handleResultsKwChange = (raw: string) => {
    setLastEditedSizingField('kw');
    setEditableKwStr(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setEditablePanelsStr('');
      return;
    }
    const kw = Number(trimmed);
    if (Number.isFinite(kw) && kw > 0) {
      const panels = Math.max(1, Math.ceil((kw * 1000) / selectedWattage));
      setEditablePanelsStr(String(panels));
      if (kw >= 3) {
        setTargetSystemKw(kw);
        setOverridePanelCount(null);
      }
    } else {
      setEditablePanelsStr('');
    }
  };

  const handleResultsPanelsChange = (raw: string) => {
    setLastEditedSizingField('panels');
    setEditablePanelsStr(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      setEditableKwStr('');
      return;
    }
    const panels = Number(trimmed);
    if (Number.isFinite(panels) && Number.isInteger(panels) && panels >= 1) {
      const kw = parseFloat(((panels * selectedWattage) / 1000).toFixed(2));
      setEditableKwStr(String(kw));
      if (kw >= 3) {
        setOverridePanelCount(panels);
        setTargetSystemKw(null);
      }
    } else {
      setEditableKwStr('');
    }
  };

  const handleResetRecommendedSizing = () => {
    const recPanels = Math.max(1, Math.ceil((recommendedDefaultKw * 1000) / selectedWattage));
    setTargetSystemKw(null);
    setOverridePanelCount(null);
    setLastEditedSizingField(null);
    setEditableKwStr(String(recommendedDefaultKw));
    setEditablePanelsStr(String(recPanels));
  };

  const defaultPdfCustomerName = useMemo(() => {
    if (!inputs.uscNumber) return '';
    return uscHistory.find((entry) => entry.uscNumber === inputs.uscNumber)?.consumerName || '';
  }, [inputs.uscNumber, uscHistory]);

  const pdfReportData: EstimatorPdfReportData = useMemo(
    () => ({
      locationName: weather.city || inputs.locationName || 'Site Location',
      latitude: weather.latitude,
      longitude: weather.longitude,
      currency: currencyCode,
      moduleStandard,
      consumerCategory,
      phaseType: inputs.phaseType || 'single_phase',
      systemKw: calculatedSystemKw,
      panelCount,
      panelWattage: selectedWattage,
      roofAreaNeededSqm: calculatedRoofAreaNeeded,
      availableRoofAreaSqm: roofAreaM2,
      dailyUsageKwh: dailyUsage,
      monthlyUnitsKwh: monthlyUnits,
      tariffPerKwh: costPerUnit,
      peakSunHours,
      effectivePR,
      estimatedMonthlyGenKwh,
      baseCostPerKw,
      grossCost,
      governmentSubsidy,
      netPayable,
      monthlySavings: calculatedMonthlySavings,
      annualSavings: calculatedAnnualSavings,
      paybackYears,
      lifetimeSavings25Yr,
      co2AvoidedKgPerYear: co2AvoidedKg,
      systemType,
      inverterLabel: `${architectureSpec.inverterCapacityKw} kW ${architectureSpec.inverterLabel}`,
      inverterBrand: customInverterBrand.trim() || selectedInverterModel?.brand,
      inverterPowerKw: parsedCustomInverterKw ?? architectureSpec.inverterCapacityKw,
      inverterSuggestion: inverterSuggestions,
      panelSpec: selectedPanelSpec,
      batteryKwh: architectureSpec.batteryKwh,
      bomItems: estimatorBom.items,
      removedComponents: estimatorBom.removedComponents,
      monthlyHistory12: inputs.monthlyHistory12,
      uscNumber: inputs.uscNumber,
      discomName: activeDiscomShortName,
      expectedTariffIncreasePct,
      maintenanceCostPct,
      engineeringLayout: engineeringLayout
        ? {
            placedPanels: engineeringLayout.panelsCount,
            usableRoofAreaM2: engineeringLayout.usableAreaM2,
            arrayFootprintM2: engineeringLayout.occupiedAreaM2,
            orientation: engineeringLayout.orientation,
            rows: engineeringLayout.rows,
            cols: engineeringLayout.cols,
            utilizationPercent: engineeringLayout.areaUtilizationPercent,
          }
        : null,
    }),
    [
      weather.city,
      weather.latitude,
      weather.longitude,
      inputs.locationName,
      inputs.phaseType,
      inputs.monthlyHistory12,
      inputs.uscNumber,
      currencyCode,
      moduleStandard,
      consumerCategory,
      calculatedSystemKw,
      panelCount,
      selectedWattage,
      calculatedRoofAreaNeeded,
      roofAreaM2,
      dailyUsage,
      monthlyUnits,
      costPerUnit,
      peakSunHours,
      effectivePR,
      estimatedMonthlyGenKwh,
      baseCostPerKw,
      grossCost,
      governmentSubsidy,
      netPayable,
      calculatedMonthlySavings,
      calculatedAnnualSavings,
      paybackYears,
      lifetimeSavings25Yr,
      co2AvoidedKg,
      systemType,
      architectureSpec.inverterCapacityKw,
      architectureSpec.inverterLabel,
      architectureSpec.batteryKwh,
      customInverterBrand,
      selectedInverterModel?.brand,
      parsedCustomInverterKw,
      inverterSuggestions,
      selectedPanelSpec,
      estimatorBom.items,
      estimatorBom.removedComponents,
      activeDiscomShortName,
      expectedTariffIncreasePct,
      maintenanceCostPct,
      engineeringLayout,
    ]
  );

  const handleExportPdf = () => {
    setIsPdfExportModalOpen(true);
  };

  const handleBillAmountChange = (raw: string) => {
    setMonthlyBillStr(raw);
    const amt = parseFloat(raw);
    if (!isNaN(amt) && amt > 0) {
      const roundedBill = Math.round(amt);
      const exactUnits = Math.max(
        1,
        estimateUnitsFromExactBill(
          roundedBill,
          activeFourStateId,
          activeGridCategory,
          sanctionedLoadKw
        )
      );
      const blendedRate = Number((roundedBill / exactUnits).toFixed(2));
      setMonthlyUnitsStr(String(exactUnits));
      setCostPerUnitStr(String(blendedRate));
      onUpdateInputs({
        calculationBasis: 'bill',
        monthlyBill: roundedBill,
        monthlyUnits: exactUnits,
        tariffPerKwh: blendedRate,
      });
    }
  };

  const handleMonthlyUnitsChange = (raw: string) => {
    setMonthlyUnitsStr(raw);
    const units = parseFloat(raw);
    if (!isNaN(units) && units > 0) {
      const roundedUnits = Math.round(units);
      const exactBill = computeExactDiscomBill(
        roundedUnits,
        activeFourStateId,
        activeGridCategory,
        sanctionedLoadKw
      );
      const blendedRate = Number((exactBill / roundedUnits).toFixed(2));
      setMonthlyBillStr(String(exactBill));
      setCostPerUnitStr(String(blendedRate));
      onUpdateInputs({
        calculationBasis: 'units',
        monthlyUnits: roundedUnits,
        monthlyBill: exactBill,
        tariffPerKwh: blendedRate,
      });
    }
  };

  const handleQuickUnitsSelect = (units: number) => {
    const exactBill = computeExactDiscomBill(
      units,
      activeFourStateId,
      activeGridCategory,
      sanctionedLoadKw
    );
    const blendedRate = units > 0 ? Number((exactBill / units).toFixed(2)) : costPerUnit;
    setMonthlyUnitsStr(String(units));
    setMonthlyBillStr(String(exactBill));
    setCostPerUnitStr(String(blendedRate));
    onUpdateInputs({
      calculationBasis: 'units',
      monthlyUnits: units,
      monthlyBill: exactBill,
      tariffPerKwh: blendedRate,
    });
  };

  const handleNavigateToRoiDashboard = () => {
    setActiveEstimatorOption('new_installation');
    setNewInstallStep('roi_dashboard');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="flex-1 flex flex-col bg-[#F4F7FC] dark:bg-slate-950 pb-12 transition-colors">
      {/* ========================================================================= */}
      {/* TOP BAR & REBUILT 3 OPTIONS NAVIGATION IN ESTIMATOR TAB                   */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-4 pt-3.5 pb-2.5 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-2xl mx-auto w-full">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => {
                  if (newInstallStep === 'roi_dashboard') {
                    setNewInstallStep('results');
                  } else if (newInstallStep === 'results') {
                    setNewInstallStep('enquiry');
                  } else {
                    onNavigate('dashboard');
                  }
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-200 transition cursor-pointer"
                title="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                  Solar Estimator
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {activeEstimatorOption === 'new_installation'
                    ? newInstallStep === 'roi_dashboard'
                      ? 'Return on Investment Dashboard'
                      : 'Sizing, DCR Subsidy & Savings'
                    : activeEstimatorOption === 'existing_system'
                    ? 'Existing Plant Audit & PR'
                    : 'Power Generation & Yield'}
                </p>
              </div>
            </div>

            <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200">
              INR (₹)
            </span>
          </div>

          {/* 3 PRECISELY REBUILT OPTIONS */}
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-2xl text-xs font-bold">
            <button
              onClick={() => {
                setActiveEstimatorOption('new_installation');
                if (newInstallStep === 'roi_dashboard') {
                  setNewInstallStep('results');
                }
              }}
              className={`py-2 px-1 rounded-xl text-center transition cursor-pointer flex flex-col items-center gap-0.5 ${
                activeEstimatorOption === 'new_installation'
                  ? 'bg-white dark:bg-slate-700 text-[#FF6F00] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-[11px] font-extrabold leading-tight">New Install</span>
              <span className="text-[9.5px] font-medium opacity-85">
                {moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'}
              </span>
            </button>

            <button
              onClick={() => setActiveEstimatorOption('existing_system')}
              className={`py-2 px-1 rounded-xl text-center transition cursor-pointer flex flex-col items-center gap-0.5 ${
                activeEstimatorOption === 'existing_system'
                  ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-[11px] font-extrabold leading-tight">Existing Plant</span>
              <span className="text-[9.5px] font-medium opacity-85">Audit & Health</span>
            </button>

            <button
              onClick={() => setActiveEstimatorOption('power_calc')}
              className={`py-2 px-1 rounded-xl text-center transition cursor-pointer flex flex-col items-center gap-0.5 ${
                activeEstimatorOption === 'power_calc'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span className="text-[11px] font-extrabold leading-tight">Generation</span>
              <span className="text-[9.5px] font-medium opacity-85">Yield & Export</span>
            </button>
          </div>
        </div>
      </div>

      <datalist id="popular-inverter-brands-list">
        {POPULAR_INVERTER_BRANDS.map((brand) => (
          <option key={brand} value={brand} />
        ))}
      </datalist>

      {/* ========================================================================= */}
      {/* OPTION 2: EXISTING PLANT AUDIT (EMBEDDED IN ESTIMATOR TAB)                */}
      {/* ========================================================================= */}
      {activeEstimatorOption === 'existing_system' && (
        <ExistingSystemScreen
          inputs={existingInputs}
          onUpdateInputs={onUpdateExistingInputs}
          onNavigate={(screen) => {
            if (screen === 'dashboard') setActiveEstimatorOption('new_installation');
            else onNavigate(screen);
          }}
          weather={weather}
          onOpenWeather={onOpenWeather}
          hideTopBar={true}
          uscHistory={uscHistory}
          onRecordUscHistory={onRecordUscHistory}
        />
      )}

      {/* ========================================================================= */}
      {/* OPTION 3: POWER GENERATION CALCULATOR (EMBEDDED IN ESTIMATOR TAB)         */}
      {/* ========================================================================= */}
      {activeEstimatorOption === 'power_calc' && (
        <PowerGenerationCalcScreen
          onNavigate={(screen) => {
            if (screen === 'dashboard') setActiveEstimatorOption('new_installation');
            else onNavigate(screen);
          }}
          weather={weather}
          onOpenWeather={onOpenWeather}
          currency={currencyCode}
          hideTopBar={true}
        />
      )}

      {/* ========================================================================= */}
      {/* OPTION 1: NEW INSTALLATION (DCR / NON-DCR ENQUIRY & SIZING)               */}
      {/* ========================================================================= */}
      {activeEstimatorOption === 'new_installation' && newInstallStep === 'enquiry' && (
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {/* STEP 1: BILLS, UNITS & CONSUMPTION INPUTS */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold">
                  <Building className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    Monthly Bills &amp; Units Enquiry
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Enter Units, Bill amount, or fetch DISCOM USC history
                  </p>
                </div>
              </div>
            </div>

            {/* Consumption Input Toggle: Units vs Bill vs 4-State USC 13-Mo Fetch */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Monthly Consumption
                </label>
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[10.5px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      setConsumptionInputMode('units');
                      onUpdateInputs({ calculationBasis: 'units' });
                    }}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      consumptionInputMode === 'units'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Units (kWh)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConsumptionInputMode('bill');
                      onUpdateInputs({ calculationBasis: 'bill' });
                    }}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      consumptionInputMode === 'bill'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    Bill ({currencySymbol})
                  </button>
                  <button
                    type="button"
                    onClick={() => setConsumptionInputMode('usc')}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      consumptionInputMode === 'usc'
                        ? 'bg-white dark:bg-slate-700 text-[#FF6F00] dark:text-amber-400 shadow-xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    USC Number
                  </button>
                </div>
              </div>

              {consumptionInputMode === 'units' ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <input
                      type="number"
                      step="10"
                      min="1"
                      readOnly={hasSyncedVerifiedDiscom}
                      value={monthlyUnitsStr}
                      onChange={(e) => {
                        if (!hasSyncedVerifiedDiscom) handleMonthlyUnitsChange(e.target.value);
                      }}
                      placeholder="e.g. 420"
                      className={`w-full px-4 py-3 pr-36 rounded-2xl border font-bold text-base focus:outline-hidden ${
                        hasSyncedVerifiedDiscom
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-white cursor-not-allowed'
                          : !isUnitsValid
                          ? 'bg-[#F8FAFC] dark:bg-slate-800/80 border-rose-400 focus:ring-2 focus:ring-rose-400 text-slate-900 dark:text-white'
                          : 'bg-[#F8FAFC] dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 focus:ring-2 focus:ring-[#FF6F00] text-slate-900 dark:text-white'
                      }`}
                    />
                    <span className="absolute right-4 top-3.5 text-xs font-bold inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                      <span>
                        {hasSyncedVerifiedDiscom ? 'kWh (Govt DISCOM)' : 'Units / Month (kWh)'}
                      </span>
                    </span>
                  </div>
                  {!isUnitsValid && !hasSyncedVerifiedDiscom && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {monthlyUnitsStr.trim() === ''
                          ? 'Please enter monthly units'
                          : 'Invalid value: Please enter a value greater than 0'}
                      </span>
                    </p>
                  )}
                </div>
              ) : consumptionInputMode === 'bill' ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <span className="absolute left-4 top-3.5 text-base font-bold text-slate-400">
                      {currencySymbol}
                    </span>
                    <input
                      type="number"
                      step="100"
                      min="1"
                      readOnly={hasSyncedVerifiedDiscom}
                      value={monthlyBillStr}
                      onChange={(e) => {
                        if (!hasSyncedVerifiedDiscom) handleBillAmountChange(e.target.value);
                      }}
                      placeholder="e.g. 3350"
                      className={`w-full pl-9 pr-32 py-3 rounded-2xl border font-bold text-base focus:outline-hidden ${
                        hasSyncedVerifiedDiscom
                          ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-white cursor-not-allowed'
                          : !isBillValid
                          ? 'bg-[#F8FAFC] dark:bg-slate-800/80 border-rose-400 focus:ring-2 focus:ring-rose-400 text-slate-900 dark:text-white'
                          : 'bg-[#F8FAFC] dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 focus:ring-2 focus:ring-[#FF6F00] text-slate-900 dark:text-white'
                      }`}
                    />
                    <span className="absolute right-4 top-3.5 text-xs text-slate-500 dark:text-slate-400 font-bold inline-flex items-center gap-1">
                      <span>≈ {monthlyUnits} Units</span>
                    </span>
                  </div>
                  {!isBillValid && !hasSyncedVerifiedDiscom && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {monthlyBillStr.trim() === ''
                          ? 'Please enter bill amount'
                          : 'Invalid value: Please enter a value greater than 0'}
                      </span>
                    </p>
                  )}
                </div>
              ) : (
                <UscBillFetchPanel
                  initialUscNumber={inputs.uscNumber}
                  initialStateId={inputs.uscStateId}
                  initialHistory={inputs.monthlyHistory12}
                  currentTariffPerKwh={costPerUnit}
                  onRecordUscHistory={onRecordUscHistory}
                  autoFetchSignal={autoFetchSignal}
                  onApply12MonthData={(payload: {
                    uscNumber: string;
                    stateId: string;
                    stateName: string;
                    discomId: string;
                    discomShortName: string;
                    consumerCategory: 'residential' | 'commercial' | 'agricultural';
                    tariffPerKwh: number;
                    sanctionedLoadKw?: number;
                    phaseType?: 'single_phase' | 'three_phase';
                    avgMonthlyUnits: number;
                    avgMonthlyBill: number;
                    months: MonthlyBillRecord[];
                  }) => {
                    setMonthlyUnitsStr(String(payload.avgMonthlyUnits));
                    setMonthlyBillStr(String(payload.avgMonthlyBill));
                    setCostPerUnitStr(String(payload.tariffPerKwh));
                    setConsumerCategory(payload.consumerCategory);
                    if (payload.sanctionedLoadKw) {
                      setSanctionedLoadKw(payload.sanctionedLoadKw);
                    }
                    onUpdateInputs({
                      uscNumber: payload.uscNumber,
                      uscStateId: payload.stateId,
                      uscDiscomId: payload.discomId,
                      state: payload.stateName,
                      discom: payload.discomShortName,
                      tariffPerKwh: payload.tariffPerKwh,
                      monthlyUnits: payload.avgMonthlyUnits,
                      monthlyBill: payload.avgMonthlyBill,
                      consumerCategory: payload.consumerCategory,
                      ...(payload.sanctionedLoadKw
                        ? { sanctionedLoadKw: payload.sanctionedLoadKw }
                        : {}),
                      ...(payload.phaseType ? { phaseType: payload.phaseType } : {}),
                      monthlyHistory12: payload.months,
                    });
                  }}
                />
              )}

              {consumptionInputMode !== 'usc' && inputs.uscNumber && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-[11px]">
                  <span className="text-emerald-800 dark:text-emerald-300 font-semibold flex items-center gap-1.5 min-w-0">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">
                      Official {inputs.discom || 'Govt DISCOM'} USC #{inputs.uscNumber}
                    </span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConsumptionInputMode('usc')}
                      className="text-[#FF6F00] font-bold hover:underline cursor-pointer"
                    >
                      View DISCOM Bills
                    </button>
                    {hasSyncedVerifiedDiscom && (
                      <button
                        type="button"
                        onClick={handleClearUscLock}
                        className="text-slate-500 dark:text-slate-400 font-semibold hover:text-rose-500 cursor-pointer"
                      >
                        Clear USC
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Exact DISCOM Slab <-> Solar Recommendation Verification Strip */}
              {consumptionInputMode !== 'usc' && monthlyUnits > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 rounded-xl bg-sky-50/80 dark:bg-sky-950/30 border border-sky-200/80 dark:border-sky-900/50 text-[11px]">
                  <span className="text-slate-700 dark:text-slate-200 font-semibold">
                    {activeDiscomShortName} Slab: <strong>{monthlyUnits.toLocaleString('en-IN')} kWh</strong> ↔{' '}
                    <strong>
                      ₹
                      {(consumptionInputMode === 'bill' && monthlyBillAmount > 0
                        ? monthlyBillAmount
                        : exactSlabBillForUnits
                      ).toLocaleString('en-IN')}
                    </strong>{' '}
                    <span className="text-slate-500 dark:text-slate-400">
                      (₹
                      {(monthlyUnits > 0
                        ? (consumptionInputMode === 'bill' && monthlyBillAmount > 0
                            ? monthlyBillAmount
                            : exactSlabBillForUnits) / monthlyUnits
                        : costPerUnit
                      ).toFixed(2)}
                      /kWh)
                    </span>
                  </span>
                  <span className="text-[#FF6F00] font-extrabold shrink-0">
                    Suggested: {recommendedDefaultKw} kWp ({recommendedPanelCount} × {selectedWattage}W)
                  </span>
                </div>
              )}

              {/* Quick Preset Consumption Pills (only when not locked to an official Govt DISCOM USC) */}
              {consumptionInputMode !== 'usc' && !hasSyncedVerifiedDiscom && (
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                  {[250, 400, 600, 800, 1200].map((presetUnits) => {
                    const presetBill = computeExactDiscomBill(
                      presetUnits,
                      activeFourStateId,
                      activeGridCategory,
                      sanctionedLoadKw
                    );
                    const billK = (presetBill / 1000).toFixed(1).replace(/\.0$/, '');
                    return (
                      <button
                        key={presetUnits}
                        type="button"
                        onClick={() => handleQuickUnitsSelect(presetUnits)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer border ${
                          monthlyUnits === presetUnits
                            ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                            : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {presetUnits} U (₹{billK}k)
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Helper Accordion (hidden when locked to official Govt DISCOM USC) */}
              {consumptionInputMode !== 'usc' && !hasSyncedVerifiedDiscom && (
                <div className="bg-[#FFF8EE] dark:bg-amber-950/30 rounded-2xl border border-amber-200/80 dark:border-amber-900/50 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsHelperOpen(!isHelperOpen)}
                    className="w-full p-2.5 flex items-center justify-between text-xs font-semibold text-amber-900 dark:text-amber-300 text-left transition cursor-pointer"
                  >
                    <span>Don't know your exact units? Calculate from bill</span>
                    <ChevronDown
                      className={`w-4 h-4 text-amber-700 dark:text-amber-400 transition-transform ${
                        isHelperOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isHelperOpen && (
                    <div className="p-3 pt-0 border-t border-amber-200/60 dark:border-amber-900/40 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-2 text-slate-400 font-bold">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            value={helperBillAmount}
                            onChange={(e) => setHelperBillAmount(e.target.value)}
                            placeholder="e.g. 4800"
                            className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-amber-300 dark:border-slate-700 text-slate-900 dark:text-white font-semibold text-xs"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            handleBillAmountChange(helperBillAmount);
                            setIsHelperOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition cursor-pointer"
                        >
                          Apply (
                          {estimateUnitsFromExactBill(
                            parseFloat(helperBillAmount) || 0,
                            activeFourStateId,
                            activeGridCategory,
                            sanctionedLoadKw
                          )}{' '}
                          Units)
                        </button>
                      </div>

                      {applianceMonthlyKwh > 0 && (
                        <div className="pt-1 flex items-center justify-between border-t border-amber-200/50">
                          <span className="text-[11px] text-slate-600 dark:text-slate-300">
                            From Appliance Calculator: <strong>{Math.round(applianceMonthlyKwh)} kWh</strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleMonthlyUnitsChange(String(Math.round(applianceMonthlyKwh)));
                              setIsHelperOpen(false);
                            }}
                            className="text-xs text-sky-600 font-bold hover:underline cursor-pointer"
                          >
                            Use Appliance Total
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Grid Tariff Per Unit */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Electricity Cost Per Unit ({currencySymbol}/kWh)
                </label>
                {onSyncLocalTariff ? (
                  <button
                    type="button"
                    onClick={onSyncLocalTariff}
                    disabled={isSyncingTariff}
                    className="text-[10px] font-bold text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    title="Sync electricity rate with local utility regulator"
                  >
                    <RotateCcw className={`w-2.5 h-2.5 ${isSyncingTariff ? 'animate-spin' : ''}`} />
                    <span>
                      {liveTariff
                        ? `${liveTariff.providerShortName} Live (₹${liveTariff.blendedRatePerKwh})`
                        : 'Sync Govt Rate'}
                    </span>
                  </button>
                ) : (
                  <span className="text-[10px] text-slate-400">Auto-synced with Grid Tariff</span>
                )}
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="0.5"
                  min="0.1"
                  readOnly={hasSyncedVerifiedDiscom}
                  value={costPerUnitStr}
                  onChange={(e) => {
                    if (hasSyncedVerifiedDiscom) return;
                    setCostPerUnitStr(e.target.value);
                    const cost = parseFloat(e.target.value);
                    if (!isNaN(cost) && cost > 0 && monthlyUnits > 0) {
                      const updatedBill = Math.round(monthlyUnits * cost);
                      setMonthlyBillStr(String(updatedBill));
                      onUpdateInputs({
                        tariffPerKwh: cost,
                        monthlyBill: updatedBill,
                      });
                    }
                  }}
                  placeholder="7.15"
                  className={`w-full px-4 py-3 pr-32 rounded-2xl border font-bold text-sm ${
                    hasSyncedVerifiedDiscom
                      ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-slate-900 dark:text-white cursor-not-allowed'
                      : !isCostValid
                      ? 'bg-[#F8FAFC] dark:bg-slate-800/80 border-rose-400 focus:ring-rose-400 text-slate-900 dark:text-white'
                      : 'bg-[#F8FAFC] dark:bg-slate-800/80 border-slate-200/90 dark:border-slate-700 text-slate-900 dark:text-white'
                  }`}
                />
                {hasSyncedVerifiedDiscom && (
                  <span className="absolute right-4 top-3.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
                    <span>Govt DISCOM Rate</span>
                  </span>
                )}
              </div>
              {!isCostValid && !hasSyncedVerifiedDiscom && (
                <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {costPerUnitStr.trim() === ''
                      ? 'Please enter electricity cost per unit'
                      : 'Invalid value: Please enter a value greater than 0'}
                  </span>
                </p>
              )}
            </div>

            {/* Roof Area (Optional) + Map Pin Button */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Roof Area in Square Meters (Optional)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  value={roofAreaStr}
                  onChange={(e) => setRoofAreaStr(e.target.value)}
                  placeholder="e.g. 27.5 m²"
                  className={`min-w-0 flex-1 px-4 py-3 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border text-slate-900 dark:text-white font-bold text-sm ${
                    !isRoofAreaValid
                      ? 'border-rose-400 focus:ring-rose-400'
                      : 'border-slate-200/90 dark:border-slate-700'
                  }`}
                />

                <button
                  type="button"
                  onClick={() => setIsRoofMapOpen(true)}
                  className="h-12 px-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400/80 hover:border-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex items-center gap-1.5 transition cursor-pointer shadow-xs group shrink-0 active:scale-95"
                  title="Measure Roof on Satellite Map"
                >
                  <MapPin className="w-4 h-4 text-[#FF6F00]" />
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-300">Map</span>
                </button>
              </div>
              {!isRoofAreaValid && (
                <p className="text-[11px] font-semibold text-rose-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Invalid value: Roof area must be greater than 0</span>
                </p>
              )}
            </div>

            {/* System Mode Selection + Conditional Self-Entered Battery Backup */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  System Type
                </span>
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                  {systemType === 'on-grid'
                    ? 'Grid Net-Metered'
                    : systemType === 'hybrid'
                    ? 'Grid + Battery'
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
                    onClick={() => applySystemTypeChange(mode.id)}
                    className={`py-2 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                      systemType === mode.id
                        ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                        : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-xs font-bold leading-tight">{mode.label}</span>
                    <span className="text-[9.5px] font-medium opacity-85 leading-tight">
                      {mode.sub}
                    </span>
                  </button>
                ))}
              </div>

              {(systemType === 'hybrid' || systemType === 'off-grid') && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <BatteryCharging className="w-4 h-4 text-[#FF6F00] shrink-0" />
                      <label
                        htmlFor="estimator-battery-backup-input"
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
                    id="estimator-battery-backup-input"
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    value={batteryBackupStr}
                    onChange={(e) => handleBatteryBackupInputChange(e.target.value)}
                    placeholder="Enter backup hours based on inverter"
                    className={`w-full px-3.5 py-2.5 rounded-2xl border bg-[#F8FAFC] dark:bg-slate-800/80 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 ${
                      !isBatteryBackupValid
                        ? 'border-rose-400 focus:ring-rose-400'
                        : 'border-slate-200 dark:border-slate-700 focus:ring-[#FF6F00]'
                    }`}
                  />
                  {!isBatteryBackupValid && (
                    <p className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Enter battery backup hours between 1 and 24</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* SEQUENTIAL FLOW: 1) INSTALLATION CATEGORY (BASED ON ANALYZED BILLS & UNITS) → 2) SELECT THE MODULE → 3) CALCULATE */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3.5">
            {/* Validated Analyzed Usage Basis Banner */}
            <div className="flex items-center justify-between gap-2 flex-wrap pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 min-w-0">
                {isUsageDataValid ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                )}
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                  {isUsageDataValid
                    ? hasSyncedVerifiedDiscom
                      ? `Analyzed ${activeDiscomShortName} Usage: ${Math.round(monthlyUnits).toLocaleString('en-IN')} kWh · ₹${Math.round(monthlyBillAmount).toLocaleString('en-IN')}/mo`
                      : `Analyzed Usage: ${Math.round(monthlyUnits).toLocaleString('en-IN')} kWh · ₹${Math.round(monthlyBillAmount).toLocaleString('en-IN')}/mo`
                    : 'Complete valid usage data above to proceed'}
                </span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                  isUsageDataValid
                    ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                    : 'bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300'
                }`}
              >
                {isUsageDataValid ? 'Validated' : 'Action Needed'}
              </span>
            </div>

            {/* 1. Installation Category based on analyzed bills & units */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-[#FF6F00] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                    1
                  </span>
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    Installation Category
                  </label>
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Based on {Math.round(monthlyUnits).toLocaleString('en-IN')} kWh · ₹
                  {Math.round(monthlyBillAmount).toLocaleString('en-IN')}/mo
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  {
                    id: 'residential',
                    label: 'Residential',
                    sub: moduleStandard === 'DCR' ? 'Govt Subsidy' : 'Open Capex',
                  },
                  {
                    id: 'commercial',
                    label: 'Commercial',
                    sub: moduleStandard === 'DCR' ? 'ALMM Spec' : 'Lower Cost',
                  },
                  {
                    id: 'agricultural',
                    label: 'Agricultural',
                    sub: moduleStandard === 'DCR' ? 'PM-KUSUM' : 'Captive',
                  },
                ] as const).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setConsumerCategory(cat.id);
                      if (hasSyncedVerifiedDiscom) {
                        onUpdateInputs({
                          consumerCategory: cat.id,
                          ...(cat.id !== 'residential' ? { phaseType: 'three_phase' } : {}),
                        });
                        return;
                      }
                      const nextCat = cat.id === 'commercial' ? 'commercial' : 'domestic';
                      if (consumptionInputMode === 'bill' && monthlyBillAmount > 0) {
                        const solvedUnits = estimateUnitsFromExactBill(
                          monthlyBillAmount,
                          activeFourStateId,
                          nextCat,
                          sanctionedLoadKw
                        );
                        const blendedCatRate =
                          solvedUnits > 0
                            ? Number((monthlyBillAmount / solvedUnits).toFixed(2))
                            : costPerUnit;
                        setMonthlyUnitsStr(String(solvedUnits));
                        setCostPerUnitStr(String(blendedCatRate));
                        onUpdateInputs({
                          consumerCategory: cat.id,
                          monthlyUnits: solvedUnits,
                          tariffPerKwh: blendedCatRate,
                          ...(cat.id !== 'residential' ? { phaseType: 'three_phase' } : {}),
                        });
                      } else {
                        const u = monthlyUnits > 0 ? Math.round(monthlyUnits) : 420;
                        const exactCatBill = computeExactDiscomBill(
                          u,
                          activeFourStateId,
                          nextCat,
                          sanctionedLoadKw
                        );
                        const blendedCatRate =
                          u > 0 ? Number((exactCatBill / u).toFixed(2)) : costPerUnit;
                        setMonthlyBillStr(String(exactCatBill));
                        setCostPerUnitStr(String(blendedCatRate));
                        onUpdateInputs({
                          consumerCategory: cat.id,
                          monthlyBill: exactCatBill,
                          tariffPerKwh: blendedCatRate,
                          ...(cat.id !== 'residential' ? { phaseType: 'three_phase' } : {}),
                        });
                      }
                    }}
                    className={`py-1.5 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                      consumerCategory === cat.id
                        ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                        : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="text-[11px] font-bold leading-tight">{cat.label}</span>
                    <span className="text-[9px] font-medium opacity-85 leading-tight">{cat.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Select The Module (Compact DCR / Non-DCR Toggle before Calculate) */}
            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-5 h-5 rounded-full bg-slate-900 dark:bg-slate-700 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                  2
                </span>
                <ShieldCheck className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  Select The Module
                </span>
                <div className="relative group" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setIsModuleTooltipOpen((prev) => !prev)}
                    className="w-4.5 h-4.5 rounded-full bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/80 dark:hover:bg-sky-900 text-sky-600 dark:text-sky-400 flex items-center justify-center transition cursor-pointer border border-sky-200/80 dark:border-sky-800"
                    title="DCR & Non-DCR Information"
                    aria-label="Module Information"
                    aria-expanded={isModuleTooltipOpen}
                  >
                    <Info className="w-3 h-3 stroke-[2.5]" />
                  </button>

                  <div
                    role="tooltip"
                    className={`absolute -left-24 sm:left-0 bottom-7 z-30 w-[min(18.5rem,calc(100vw-3rem))] rounded-2xl bg-slate-900 dark:bg-slate-800 text-white p-3.5 shadow-xl border border-slate-700/80 text-[11px] leading-relaxed transition-all duration-150 ${
                      isModuleTooltipOpen
                        ? 'opacity-100 visible translate-y-0'
                        : 'opacity-0 invisible translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 pointer-events-none group-hover:pointer-events-auto'
                    }`}
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-slate-700/80">
                      <span className="font-bold text-xs text-amber-400">
                        DCR vs Non-DCR Guide
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsModuleTooltipOpen(false);
                        }}
                        className="text-slate-400 hover:text-white cursor-pointer"
                        aria-label="Close tooltip"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div>
                        <p className="font-bold text-emerald-400">🇮🇳 DCR (Subsidy Eligible)</p>
                        <p className="text-slate-300">
                          100% Made-in-India cells &amp; modules (ALMM). Eligible for PM Surya Ghar subsidy up to ₹78,000 (~₹54k/kWp base).
                        </p>
                      </div>
                      <div>
                        <p className="font-bold text-sky-400">🌐 Non-DCR (Open Category)</p>
                        <p className="text-slate-300">
                          Tier-1 global modules with lower upfront cost (~₹42k/kWp base). Zero government subsidy; ideal for commercial or fast-track installs.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsModuleTooltipOpen(false);
                        setIsModuleInfoModalOpen(true);
                      }}
                      className="mt-2.5 w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white font-semibold text-[11px] transition cursor-pointer"
                    >
                      View Full Comparison
                    </button>
                  </div>
                </div>
              </div>

              <DcrToggleSwitch
                compact
                id="estimator-module-dcr-toggle"
                moduleStandard={moduleStandard}
                onChange={applyModuleStandardChange}
              />
            </div>

            {enquirySubmitAttempted && usageValidationMessage && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{usageValidationMessage}</span>
              </div>
            )}
          </div>

          {/* 3. Calculate Button (Triggered on Validated Usage Data) */}
          <div className="pt-0.5">
            <button
              type="button"
              onClick={handleCalculateSolarSystem}
              className={`w-full py-4 rounded-2xl font-bold text-base shadow-md transition duration-150 flex items-center justify-center gap-2 ${
                isUsageDataValid
                  ? 'bg-[#FF6F00] hover:bg-[#F57C00] active:scale-[0.99] text-white cursor-pointer'
                  : 'bg-slate-300 dark:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-not-allowed'
              }`}
            >
              <span>Calculate the Solar System</span>
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Shared USC History Section — Visible Across All Browsers & Devices */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center shrink-0">
                  <History className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                      Shared USC History
                    </h2>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/70 dark:border-emerald-800">
                      <Cloud className="w-2.5 h-2.5" />
                      <span>{uscHistory.length} Saved</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Visible across all browsers and devices for 1-click re-runs or audits
                  </p>
                </div>
              </div>

              {firebaseUser ? (
                <button
                  type="button"
                  onClick={() => signOutUser()}
                  title={`Signed in as ${firebaseUser.email || 'Google user'} — click to sign out`}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer transition shrink-0"
                >
                  <LogOut className="w-3 h-3 text-slate-500" />
                  <span className="max-w-[120px] truncate">{firebaseUser.displayName || firebaseUser.email}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => signInWithGoogle()}
                  disabled={isSigningIn}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white text-[10.5px] font-bold shadow-xs cursor-pointer transition disabled:opacity-60 shrink-0"
                >
                  <LogIn className="w-3 h-3" />
                  <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
                </button>
              )}
            </div>

            {!firebaseUser && (
              <div className="rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/50 px-3 py-2 text-[10.5px] text-amber-900 dark:text-amber-200">
                Everyone can view all shared USC history below. Sign in with Google to publish new USC lookups to the shared cloud database.
              </div>
            )}

            {authError && (
              <div className="rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-3 py-2 text-[10.5px] text-rose-700 dark:text-rose-300">
                {authError}
              </div>
            )}

            {uscHistory.length === 0 ? (
              <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/60 border border-dashed border-slate-200 dark:border-slate-700 p-3.5 text-center space-y-1.5">
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  No USC lookups recorded yet.
                </p>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Fetch any account in the USC Number tab or Existing Plant Audit to save it here for 1-click re-runs.
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
                {uscHistory.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.uscNumber && (
                            <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                              USC #{item.uscNumber}
                            </span>
                          )}
                          <span className="text-[9.5px] font-bold bg-amber-100 dark:bg-amber-950/70 text-[#FF6F00] px-1.5 py-0.5 rounded-md">
                            {item.discomShortName}
                          </span>
                          {item.isCloudSynced ? (
                            <span className="text-[9px] font-bold bg-sky-100 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-md">
                              Shared Cloud
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-1.5 py-0.5 rounded-md">
                              Local Only
                            </span>
                          )}
                          {item.verifiedMonthsCount > 0 && (
                            <span className="text-[9.5px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-md">
                              {item.verifiedMonthsCount}/{item.monthsCount} Verified
                            </span>
                          )}
                        </div>
                        <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {(() => {
                            const avg12 = resolveHistory12MonthAverage(item);
                            return `${item.consumerName ? `${item.consumerName} · ` : ''}${avg12.basisCount}M Avg ${avg12.avgMonthlyUnits} kWh/mo · ₹${avg12.avgMonthlyBill.toLocaleString('en-IN')}/mo · ${item.lastFetchedAtIst}`;
                          })()}
                        </p>
                      </div>
                      {onRemoveUscHistory && canDeleteSharedUscEntry(item, firebaseUser) && (
                        <button
                          type="button"
                          onClick={() => onRemoveUscHistory(item.id)}
                          title="Remove from USC History"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setConsumptionInputMode('usc');
                          onUpdateInputs({
                            uscNumber: item.uscNumber,
                            uscStateId: item.stateId,
                            uscDiscomId: item.discomId,
                          });
                          setAutoFetchSignal({
                            uscNumber: item.uscNumber || '',
                            stateId: item.stateId as FourStateId,
                            nonce: Date.now(),
                          });
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Play className="w-3 h-3" />
                        <span>Re-Run Fetch</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const avg12 = resolveHistory12MonthAverage(item);
                          const latest =
                            item.months && item.months.length > 0
                              ? [...item.months]
                                  .reverse()
                                  .find((m) => m.unitsKwh > 0 || m.billAmountInr > 0) ||
                                item.months[item.months.length - 1]
                              : null;
                          onUpdateExistingInputs({
                            uscNumber: item.uscNumber || '',
                            stateId: item.stateId,
                            discomId: item.discomId,
                            gridImportKwh: latest?.unitsKwh || avg12.avgMonthlyUnits,
                            currentMonthlyBill: latest?.billAmountInr || avg12.avgMonthlyBill,
                            auditedMonths: item.months,
                          });
                          setActiveEstimatorOption('existing_system');
                        }}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[11px] font-bold cursor-pointer transition"
                      >
                        Load in Audit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OPTION 1: RESULTS VIEW (COMPLETE SIZING & FINANCIAL BREAKDOWN)             */}
      {/* ========================================================================= */}
      {activeEstimatorOption === 'new_installation' && newInstallStep === 'results' && (
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {/* Top Bar with Back to Enquiry */}
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setNewInstallStep('enquiry')}
                className="w-8 h-8 rounded-full bg-white dark:bg-slate-800 shadow-xs border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition cursor-pointer"
                title="Back to Enquiry"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                  Solar System Estimation
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {architectureSpec.title} • {isDCR ? 'DCR' : 'Non-DCR'} • {calculatedSystemKw} kW ({architectureSpec.batteryKwh > 0 ? `${architectureSpec.batteryKwh} kWh LFP` : 'Grid-Tied'})
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportPdf}
                className="px-3 py-1.5 rounded-full bg-slate-900 dark:bg-sky-600 text-white hover:bg-slate-800 dark:hover:bg-sky-500 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
                title="Open PDF Proposal & CSV Export Studio"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span>PDF Studio</span>
              </button>
              <button
                type="button"
                onClick={() => setNewInstallStep('enquiry')}
                className="px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold transition cursor-pointer"
              >
                Edit Enquiry
              </button>
            </div>
          </div>

          {/* Interactive DCR vs Non-DCR Hardware Filter Toggle inside Results View */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                  DCR Hardware Filter &amp; Standard
                </span>
              </div>
              <DcrToggleSwitch
                compact
                id="estimator-results-dcr-toggle"
                moduleStandard={moduleStandard}
                onChange={applyModuleStandardChange}
              />
            </div>

            {/* Filtered Solar Panel Hardware List (540W Start up to Max W Available) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  {isDCR ? 'DCR ALMM' : 'Non-DCR Open'} Panels (540W–{filteredPanels[filteredPanels.length - 1]?.wattage || 720}W · {filteredPanels.length} Models)
                </span>
                <span className="text-[10px] text-slate-400">
                  {selectedPanelSpec.recommendedBrands[0]} · {selectedWattage}W ({selectedPanelSpec.efficiencyPercent}% Eff)
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {filteredPanels.map((panel) => {
                  const isActivePanel = panel.wattage === selectedWattage;
                  return (
                    <button
                      key={panel.wattage}
                      type="button"
                      onClick={() => {
                        const w = panel.wattage as PanelWattage;
                        setSelectedWattage(w);
                        onUpdateInputs({ panelWattage: w });
                        if (lastEditedSizingField === 'panels' && overridePanelCount !== null) {
                          setEditableKwStr(
                            String(parseFloat(((overridePanelCount * w) / 1000).toFixed(2)))
                          );
                        } else {
                          const panels = Math.max(1, Math.ceil((calculatedSystemKw * 1000) / w));
                          setEditablePanelsStr(String(panels));
                        }
                      }}
                      className={`px-2.5 py-1.5 rounded-xl border text-left transition cursor-pointer shrink-0 min-w-[96px] ${
                        isActivePanel
                          ? isDCR
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-sky-600 text-white border-sky-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-mono text-xs font-extrabold">{panel.wattage}W</span>
                        <span className="text-[9px] font-mono opacity-80">{panel.efficiencyPercent}%</span>
                      </div>
                      <div className="text-[9.5px] opacity-85 truncate">
                        {panel.recommendedBrands[0]}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Inverter Brand & Power + Smart Engineering Suggestions */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between text-[10.5px]">
                <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#FF6F00]" />
                  <span>Inverter Brand, Power &amp; Engineering Suggestions</span>
                </span>
                <span className="text-[10px] font-mono font-bold text-[#FF6F00]">
                  Active: {architectureSpec.inverterCapacityKw} kW
                </span>
              </div>

              {/* User Input Row: Custom Inverter Brand + Inverter Power (kW) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="results-inverter-brand-input"
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      Inverter Brand
                    </label>
                    {customInverterBrand && (
                      <button
                        type="button"
                        onClick={() => handleCustomInverterBrandChange('')}
                        className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <input
                    id="results-inverter-brand-input"
                    type="text"
                    list="popular-inverter-brands-list"
                    value={customInverterBrand}
                    onChange={(e) => handleCustomInverterBrandChange(e.target.value)}
                    placeholder="Type brand (e.g. Sungrow, Havells, Deye)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="results-inverter-power-input"
                      className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"
                    >
                      Inverter Power (kW)
                    </label>
                    {customInverterPowerStr && (
                      <button
                        type="button"
                        onClick={() => handleCustomInverterPowerChange('')}
                        className="text-[10px] font-semibold text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                      >
                        Auto ({inverterSuggestions.recommendedAcKw} kW)
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      id="results-inverter-power-input"
                      type="number"
                      min="1"
                      step="0.1"
                      value={customInverterPowerStr}
                      onChange={(e) => handleCustomInverterPowerChange(e.target.value)}
                      placeholder={`Suggested: ${inverterSuggestions.recommendedAcKw} kW`}
                      className="w-full px-3 pr-10 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs font-extrabold font-mono text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                    />
                    <span className="absolute right-3 top-2 text-[11px] font-bold text-slate-400">
                      kW
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Tap Brand & Standard Market Power Rating Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mr-0.5">
                  Standard Sizes:
                </span>
                {inverterSuggestions.nearbyStandardSizesKw.map((kwSize) => {
                  const isActiveSize =
                    Math.abs((parsedCustomInverterKw ?? architectureSpec.inverterCapacityKw) - kwSize) < 0.05;
                  return (
                    <button
                      key={kwSize}
                      type="button"
                      onClick={() => handleCustomInverterPowerChange(String(kwSize))}
                      className={`px-2 py-1 rounded-lg text-[10.5px] font-mono font-bold border transition cursor-pointer ${
                        isActiveSize
                          ? 'bg-[#FF6F00] text-white border-[#FF6F00]'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-[#FF6F00]'
                      }`}
                    >
                      {kwSize} kW{kwSize === inverterSuggestions.recommendedAcKw ? ' ★' : ''}
                    </button>
                  );
                })}
              </div>

              {/* Engineering Inverter Advisor Card */}
              <div
                className={`p-3 rounded-2xl border space-y-2 text-[11px] ${
                  inverterSuggestions.ratioStatus === 'undersized'
                    ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800/60'
                    : inverterSuggestions.ratioStatus === 'oversized'
                    ? 'bg-sky-50/70 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800/60'
                    : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 font-extrabold text-slate-900 dark:text-white">
                    <Sparkles
                      className={`w-3.5 h-3.5 shrink-0 ${
                        inverterSuggestions.ratioStatus === 'undersized'
                          ? 'text-rose-600'
                          : inverterSuggestions.ratioStatus === 'oversized'
                          ? 'text-sky-600'
                          : 'text-emerald-600'
                      }`}
                    />
                    <span>{inverterSuggestions.ratioHeadline}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white/80 dark:bg-slate-900/70 text-[10px] font-bold font-mono text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700">
                    {inverterSuggestions.recommendedPhaseLabel}
                  </span>
                </div>

                <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                  {inverterSuggestions.ratioAdvice}
                </p>

                <div className="grid grid-cols-1 gap-1 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[10.5px] text-slate-600 dark:text-slate-300">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Suggested Range: </span>
                    {inverterSuggestions.recommendedMinAcKw}–{inverterSuggestions.recommendedMaxAcKw} kW AC (Best Pick:{' '}
                    <span className="font-mono font-extrabold text-[#FF6F00]">
                      {inverterSuggestions.recommendedAcKw} kW
                    </span>
                    )
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">MPPT &amp; {selectedWattage}W Panel Match: </span>
                    {inverterSuggestions.mpptCurrentNote}
                  </div>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-100">Brand Note: </span>
                    {inverterSuggestions.brandNote}
                  </div>
                </div>
              </div>

              {/* Suggested Catalog Inverters (1-Tap Fill Brand & Recommended Power) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10.5px]">
                  <span className="font-bold text-slate-600 dark:text-slate-300">
                    Suggested {architectureSpec.title} Inverters (Tap to Select)
                  </span>
                  <span className="text-[10px] font-mono font-bold text-[#FF6F00]">
                    {selectedInverterModel?.efficiencyPct}% Eff · {selectedInverterModel?.warrantyYears}Yr
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {inverterSuggestions.suggestedModels.map((inv) => {
                    const isActiveInv =
                      customInverterBrand.trim()
                        ? inv.brand.toLowerCase() === customInverterBrand.trim().toLowerCase()
                        : selectedInverterModel?.id === inv.id;
                    return (
                      <button
                        key={inv.id}
                        type="button"
                        onClick={() => {
                          setSelectedInverterId(inv.id);
                          handleCustomInverterBrandChange(inv.brand);
                          if (!parsedCustomInverterKw) {
                            handleCustomInverterPowerChange(String(inverterSuggestions.recommendedAcKw));
                          }
                        }}
                        className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                          isActiveInv
                            ? 'bg-orange-50/70 dark:bg-orange-950/30 border-[#FF6F00] shadow-2xs'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                            {inv.brand}
                          </span>
                          <span className="text-[9.5px] font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                            {inv.efficiencyPct}% Eff
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 dark:text-slate-300 truncate">
                          {inv.modelSeries}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Post-Calculation System Architecture Selector: On-Grid vs Hybrid vs Off-Grid */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200/90 dark:border-slate-800 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <BatteryCharging className="w-4 h-4 text-[#FF6F00]" />
                <span>System Option (Inverter &amp; Batteries)</span>
              </span>
              <span className="text-[10.5px] font-mono font-bold text-sky-700 dark:text-sky-300">
                {architectureSpec.inverterCapacityKw} kW
                {systemType !== 'on-grid' && architectureSpec.batteryKwh > 0
                  ? ` · ${architectureSpec.batteryKwh} kWh LFP`
                  : ''}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: 'on-grid', label: 'On-Grid', sub: 'String Inverter' },
                { id: 'hybrid', label: 'Hybrid', sub: 'Hybrid Inv + LFP' },
                { id: 'off-grid', label: 'Off-Grid', sub: 'PCU + Full Bank' },
              ] as const).map((arch) => (
                <button
                  key={arch.id}
                  type="button"
                  onClick={() => {
                    applySystemTypeChange(arch.id);
                    if (targetSystemKw === null && overridePanelCount === null) {
                      const nextPvFactor =
                        arch.id === 'off-grid' ? 1.15 : arch.id === 'hybrid' ? 1.05 : 1.0;
                      const nextKw = Math.max(
                        3,
                        Math.round((dailyUsage * nextPvFactor) / (peakSunHours * effectivePR))
                      );
                      const nextPanels = Math.max(1, Math.ceil((nextKw * 1000) / selectedWattage));
                      setEditableKwStr(String(nextKw));
                      setEditablePanelsStr(String(nextPanels));
                    }
                  }}
                  className={`py-2 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                    systemType === arch.id
                      ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                      : 'bg-[#F8FAFC] dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="text-xs font-bold leading-tight">{arch.label}</span>
                  <span className="text-[9.5px] font-medium opacity-85 leading-tight">
                    {arch.sub}
                  </span>
                </button>
              ))}
            </div>

            {(systemType === 'hybrid' || systemType === 'off-grid') && (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50">
                <label
                  htmlFor="results-battery-backup-input"
                  className="text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0"
                >
                  Battery Backup{architectureSpec.batteryKwh > 0 ? ` (${architectureSpec.batteryKwh} kWh)` : ''}:
                </label>
                <input
                  id="results-battery-backup-input"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={batteryBackupStr}
                  onChange={(e) => handleBatteryBackupInputChange(e.target.value)}
                  placeholder="Enter hrs (inverter)"
                  className="w-40 px-3 py-1.5 rounded-xl border border-amber-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white text-right focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                />
              </div>
            )}
          </div>

          {/* Sizing Summary Header with Standard Pill */}
          <div className="flex items-center justify-between pt-0.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sizing Summary Cards
            </span>
            <span
              className={`text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 ${
                isDCR
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/90 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700'
                  : 'bg-sky-100 text-sky-800 dark:bg-sky-950/90 dark:text-sky-300 border border-sky-300 dark:border-sky-700'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${isDCR ? 'bg-emerald-500 animate-pulse' : 'bg-sky-500'}`} />
              <span>{isDCR ? 'DCR' : 'Non-DCR'}</span>
            </span>
          </div>

          {/* SIZING SUMMARY: 4 KEY CARDS (Daily Usage, System Size, Panel Count, Roof Area) */}
          <div className="grid grid-cols-2 gap-3">
            {/* Card 1: Daily Usage */}
            <div className="bg-white dark:bg-slate-900 rounded-[24px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  Daily Usage
                </p>
                <div className="text-2xl font-black text-[#F97316] mt-0.5">
                  {dailyUsage}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">Unit / Day</p>
              </div>
              <div className="shrink-0">
                <DailyUsageGaugeIcon className="w-12 h-12" />
              </div>
            </div>

            {/* Card 2: System Size with DCR / Non-DCR indicator */}
            <div className="bg-white dark:bg-slate-900 rounded-[24px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between relative overflow-hidden">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    System Size
                  </p>
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                      isDCR
                        ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-sky-100 dark:bg-sky-950/80 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                    }`}
                  >
                    {isDCR ? 'DCR' : 'Non-DCR'}
                  </span>
                </div>
                <div className="text-2xl font-black text-[#2563EB] mt-0.5">
                  {calculatedSystemKw}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">KW Capacity</p>
              </div>
              <div className="shrink-0">
                <SystemSizeSolarIcon className="w-12 h-12" />
              </div>
            </div>

            {/* Card 3: No. of Panels */}
            <div className="bg-white dark:bg-slate-900 rounded-[24px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  Panels Needed
                </p>
                <div className="text-2xl font-black text-[#16A34A] mt-0.5">
                  {panelCount}
                </div>
                <p className="text-[10px] text-slate-400 font-medium">× {selectedWattage}W {isDCR ? 'DCR' : 'Non-DCR'}</p>
              </div>
              <div className="shrink-0">
                <PanelArrayIcon className="w-12 h-12" />
              </div>
            </div>

            {/* Card 4: Roof Area Needed */}
            <div
              onClick={() => setIsRoofMapOpen(true)}
              className="bg-white dark:bg-slate-900 rounded-[24px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 flex items-center justify-between cursor-pointer hover:border-amber-300 transition"
              title="Click to view rooftop map"
            >
              <div>
                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                  Roof Area
                </p>
                <div className="text-2xl font-black text-[#2563EB] mt-0.5">
                  {calculatedRoofAreaNeeded}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-slate-400">
                  <span>m²</span>
                  <span className="font-semibold text-emerald-600">
                    ({Math.round(calculatedRoofAreaNeeded * 10.7639)} sq.ft)
                  </span>
                </div>
              </div>
              <div className="shrink-0">
                <RoofAreaHouseIcon className="w-12 h-12" />
              </div>
            </div>
          </div>

          {/* 2. DCR / NON-DCR FINANCIAL BREAKDOWN CARD */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center font-bold">
                  <WalletSavingsIcon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    {isDCR ? 'DCR Subsidy & Investment Breakdown' : 'Non-DCR Project Cost Breakdown'}
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {isDCR
                      ? 'PM Surya Ghar Direct Benefit Transfer (DBT)'
                      : 'Commercial / Open Category Turnkey Estimate'}
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                  governmentSubsidy > 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                    : 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-300'
                }`}
              >
                {governmentSubsidy > 0
                  ? `${architectureSpec.title} DCR (Subsidy Approved)`
                  : systemType === 'off-grid'
                  ? 'Off-Grid (Standalone)'
                  : 'Non-DCR (0% Subsidy)'}
              </span>
            </div>

            {/* Financial Rows */}
            <div className="space-y-2.5 text-xs">
              {/* PV Modules Turnkey Cost */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {architectureSpec.title} PV Array &amp; Mounting ({isDCR ? 'DCR' : 'Non-DCR'})
                  </span>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400">
                    {calculatedSystemKw} kW @ {currencySymbol}{baseCostPerKw.toLocaleString()}/kW
                  </div>
                </div>
                <span className="font-mono font-extrabold text-sm text-slate-800 dark:text-slate-100 shrink-0">
                  {currencySymbol}{architectureSpec.pvBaseCost.toLocaleString()}
                </span>
              </div>

              {/* Inverter + Battery Bank Hardware Adjustment */}
              <div className="p-3 rounded-2xl bg-sky-50/70 dark:bg-sky-950/25 border border-sky-200/70 dark:border-sky-800/50 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                    {architectureSpec.inverterCapacityKw} kW {architectureSpec.inverterLabel}
                  </span>
                  <div className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                    Battery: {architectureSpec.batteryKwh > 0
                      ? `${architectureSpec.batteryKwh} kWh (${architectureSpec.batteryPackLabel})`
                      : 'None (0 kWh — Grid Net-Metering)'}
                  </div>
                </div>
                <span className="font-mono font-extrabold text-sm text-sky-700 dark:text-sky-300 shrink-0">
                  {architectureSpec.inverterUpgradeCost + architectureSpec.batteryCost > 0
                    ? `+ ${currencySymbol}${(
                        architectureSpec.inverterUpgradeCost + architectureSpec.batteryCost
                      ).toLocaleString()}`
                    : 'Included'}
                </span>
              </div>

              {/* Total Gross Cost */}
              <div className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/80 flex items-center justify-between">
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Gross Turnkey Project Cost
                </span>
                <span className="font-mono font-extrabold text-sm text-slate-900 dark:text-white">
                  {currencySymbol}{grossCost.toLocaleString()}
                </span>
              </div>

              {/* PM Surya Ghar Subsidy Row */}
              <div
                className={`p-3 rounded-2xl flex items-center justify-between ${
                  governmentSubsidy > 0
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300/80 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200'
                    : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>PM Surya Ghar Govt Subsidy (DBT)</span>
                  </div>
                  <div className="text-[10.5px] opacity-85">
                    {governmentSubsidy > 0
                      ? 'Direct subsidy credited to consumer bank account by Central Govt'
                      : systemType === 'off-grid'
                      ? 'Standalone Off-Grid systems do not qualify for grid-tied DBT subsidy'
                      : !isDCR
                      ? 'Non-DCR modules do not qualify for PM Surya Ghar subsidy (₹0)'
                      : 'Subsidy applies to Residential category'}
                  </div>
                </div>
                <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                  {governmentSubsidy > 0
                    ? `- ${currencySymbol}${governmentSubsidy.toLocaleString()}`
                    : `${currencySymbol}0`}
                </span>
              </div>

              {/* Net Payable by Customer */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border border-amber-300 dark:border-amber-800/60 flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase font-extrabold tracking-wider text-amber-900 dark:text-amber-300">
                    Net Investment to Pay
                  </span>
                  <div className="text-[10.5px] text-slate-600 dark:text-slate-300">
                    Actual customer out-of-pocket investment
                  </div>
                </div>
                <span className="font-mono font-black text-xl text-amber-600 dark:text-amber-400">
                  {currencySymbol}{netPayable.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Sub-Cards: Monthly Savings & Clickable Annual / Payback ROI Summary Card */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="bg-[#FFF8F0] dark:bg-amber-950/20 rounded-2xl p-3.5 border border-amber-200/60 dark:border-amber-900/40 space-y-1">
                <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Monthly Savings
                </p>
                <div className="text-xl font-extrabold text-[#F97316]">
                  {currencySymbol}{calculatedMonthlySavings.toLocaleString()}
                </div>
                <div className="text-[10px] text-slate-400">
                  ≈ {replacedUnits} Units replaced
                </div>
              </div>

              <div
                role="button"
                tabIndex={0}
                onClick={handleNavigateToRoiDashboard}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNavigateToRoiDashboard();
                  }
                }}
                title="Open Return on Investment Dashboard"
                className="bg-[#F0FDF4] dark:bg-emerald-950/20 rounded-2xl p-3.5 border border-emerald-200/80 dark:border-emerald-800/60 hover:border-emerald-400 space-y-1 cursor-pointer transition group"
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    Annual Savings
                  </p>
                  <ChevronRight className="w-3.5 h-3.5 text-emerald-600 group-hover:translate-x-0.5 transition shrink-0" />
                </div>
                <div className="text-xl font-extrabold text-[#16A34A]">
                  {currencySymbol}{calculatedAnnualSavings.toLocaleString()}
                </div>
                <div className="text-[10px] text-emerald-600 font-semibold flex items-center justify-between">
                  <span>Payback: {paybackYears} Yrs</span>
                  <span className="underline">View ROI</span>
                </div>
              </div>
            </div>

            {/* Clickable 25-Year Lifetime Solar Return & ROI Summary Card */}
            <div
              role="button"
              tabIndex={0}
              onClick={handleNavigateToRoiDashboard}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleNavigateToRoiDashboard();
                }
              }}
              title="Open Return on Investment Dashboard"
              className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/30 border border-slate-100 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-800 flex items-center justify-between text-xs cursor-pointer transition group"
            >
              <div className="flex items-center gap-2">
                <Leaf className="w-4 h-4 text-emerald-500 fill-emerald-500 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition">
                    25-Year Lifetime Solar Return
                  </span>
                  <div className="text-[10px] text-slate-400">
                    CO₂ avoided: {(co2AvoidedKg / 1000).toFixed(1)} Tonnes / year · Tap for ROI Dashboard
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-mono font-black text-emerald-700 dark:text-emerald-400 text-sm">
                  {currencyCode === 'INR'
                    ? `${currencySymbol}${(lifetimeSavings25Yr / 100000).toFixed(2)} Lakhs`
                    : `${currencySymbol}${lifetimeSavings25Yr.toLocaleString()}`}
                </span>
                <ChevronRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition" />
              </div>
            </div>
          </div>

          {/* 2A. 13-MONTH HISTORICAL USAGE & DISCOM BILL TRENDS CHART */}
          <HistoricalUsageTrendChart
            monthlyHistory={inputs.monthlyHistory12}
            uscNumber={inputs.uscNumber}
            discomName={activeDiscomShortName}
            stateId={activeFourStateId}
            gridCategory={activeGridCategory}
            sanctionedLoadKw={sanctionedLoadKw}
            fallbackMonthlyUnits={monthlyUnits || 420}
            estimatedMonthlyGenKwh={estimatedMonthlyGenKwh}
          />

          {/* 2B. 3-WAY LIVE INTERLINK + WHEN BATTERY IS REQUIRED + REQUIRED PARTS / BOM */}
          <BomAndInterlinkPanel
            bom={estimatorBom}
            consumerCategory={consumerCategory}
            monthlyUnits={monthlyUnits || 420}
            connectedLoadKw={Math.max(sanctionedLoadKw, Number(((monthlyUnits || 420) / 120).toFixed(1)))}
            moduleStandard={moduleStandard}
            systemType={systemType}
            pvCapacityKw={calculatedSystemKw}
            panelCount={panelCount}
            batteryKwh={architectureSpec.batteryKwh}
            onChangeConsumerCategory={(cat) => {
              setConsumerCategory(cat);
              onUpdateInputs({
                consumerCategory: cat,
                ...(cat !== 'residential' ? { phaseType: 'three_phase' } : {}),
              });
            }}
            onChangeModuleStandard={(std) => applyModuleStandardChange(std)}
            onChangeSystemType={(st) => {
              setSystemType(st);
              setSelectedInverterId(null);
              onUpdateInputs({
                systemType: st,
                requiresBattery: st !== 'on-grid',
                enableGridExport: st !== 'off-grid',
              });
              if (targetSystemKw === null && overridePanelCount === null) {
                const nextPvFactor = st === 'off-grid' ? 1.15 : st === 'hybrid' ? 1.05 : 1.0;
                const nextKw = Math.max(
                  3,
                  Math.round((dailyUsage * nextPvFactor) / (peakSunHours * effectivePR))
                );
                const nextPanels = Math.max(1, Math.ceil((nextKw * 1000) / selectedWattage));
                setEditableKwStr(String(nextKw));
                setEditablePanelsStr(String(nextPanels));
              }
            }}
            onNavigateToAppliances={() => onNavigate('appliances')}
            defaultExpanded={true}
          />

          {/* 3. SYSTEM CAPACITY (kW) & PANEL COUNT (INTERLINKED EDITABLE BOXES) */}
          <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 shadow-xs border border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white min-w-0">
                <Zap className="w-4 h-4 text-amber-500 shrink-0" />
                <span className="truncate">System Capacity &amp; Panel Count</span>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                {(targetSystemKw !== null || overridePanelCount !== null || sizingValidationError !== null) && (
                  <button
                    type="button"
                    onClick={handleResetRecommendedSizing}
                    className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                    title="Reset to recommended sizing"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsPanelSpecsOpen(true)}
                  className="text-[11px] font-bold text-[#FF6F00] hover:underline cursor-pointer shrink-0"
                >
                  Panel Guide
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 items-stretch">
              {/* Box 1: Editable System Capacity (kW) */}
              <div
                className={`p-3 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border transition min-w-0 ${
                  !isEditableKwValid
                    ? 'border-rose-400 ring-1 ring-rose-400/50'
                    : 'border-slate-200/90 dark:border-slate-700 focus-within:border-[#FF6F00] focus-within:ring-2 focus-within:ring-[#FF6F00]/20'
                }`}
              >
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Capacity (kW)
                </label>
                <div className="flex items-baseline gap-1.5">
                  <input
                    type="number"
                    min="3"
                    step="any"
                    value={editableKwStr}
                    onChange={(e) => handleResultsKwChange(e.target.value)}
                    placeholder="Min 3"
                    aria-invalid={!isEditableKwValid}
                    className="min-w-0 w-full bg-transparent font-mono font-black text-lg text-slate-900 dark:text-white focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    kW
                  </span>
                </div>
              </div>

              {/* Box 2: Editable Panel Count (Interlinked with Box 1) */}
              <div
                className={`p-3 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/80 border transition min-w-0 ${
                  !isEditablePanelsValid
                    ? 'border-rose-400 ring-1 ring-rose-400/50'
                    : 'border-slate-200/90 dark:border-slate-700 focus-within:border-[#FF6F00] focus-within:ring-2 focus-within:ring-[#FF6F00]/20'
                }`}
              >
                <label className="block text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1 truncate">
                  No. of Panels ({selectedWattage}W)
                </label>
                <div className="flex items-baseline gap-1.5">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editablePanelsStr}
                    onChange={(e) => handleResultsPanelsChange(e.target.value)}
                    placeholder={`Min ${minPanelsFor3Kw}`}
                    aria-invalid={!isEditablePanelsValid}
                    className="min-w-0 w-full bg-transparent font-mono font-black text-lg text-[#F97316] focus:outline-hidden"
                  />
                  <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0">
                    nos
                  </span>
                </div>
              </div>
            </div>

            {sizingValidationError && (
              <p className="text-[11px] font-semibold text-rose-500 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{sizingValidationError}</span>
              </p>
            )}
          </div>

          {/* 4. DEDICATED VISUAL ROI DASHBOARD & REAL-TIME SENSITIVITY SLIDERS */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
            {/* Section Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center font-bold shrink-0">
                  <TrendingUp className="w-5 h-5 text-[#FF6F00]" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    25-Year ROI &amp; Savings Dashboard
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Cumulative Savings vs System Cost · Real-time Sensitivity
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleNavigateToRoiDashboard}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-800/60 text-[10.5px] font-bold text-[#FF6F00] hover:bg-amber-100 dark:hover:bg-amber-950 transition shrink-0 cursor-pointer"
              >
                <span>Full ROI View</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Sensitivity Sliders Panel: Tariff Increase (%) & Maintenance Cost (%) */}
            <div className="p-3.5 rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                  <Sliders className="w-3.5 h-3.5 text-[#FF6F00]" />
                  <span>Payback Sensitivity Controls</span>
                </div>
                <div className="flex items-center gap-2">
                  {(expectedTariffIncreasePct !== 2.5 || maintenanceCostPct !== 1.0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setExpectedTariffIncreasePct(2.5);
                        setMaintenanceCostPct(1.0);
                      }}
                      className="text-[10.5px] font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  )}
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 font-mono text-[11px] font-extrabold">
                    Payback: {sensitivityRoi.breakEvenBeyondHorizon ? '25+' : paybackYears} Yrs
                  </span>
                </div>
              </div>

              {/* Slider 1: Expected Annual Tariff Increase (%) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="tariff-increase-slider"
                    className="font-semibold text-slate-700 dark:text-slate-300"
                  >
                    Expected Annual Tariff Increase (%)
                  </label>
                  <span className="font-mono font-extrabold text-sky-600 dark:text-sky-400">
                    {expectedTariffIncreasePct.toFixed(1)}% / yr
                  </span>
                </div>
                <input
                  id="tariff-increase-slider"
                  type="range"
                  min="0"
                  max="10"
                  step="0.5"
                  value={expectedTariffIncreasePct}
                  onChange={(e) => setExpectedTariffIncreasePct(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0% (Flat)</span>
                  <span>5.0%</span>
                  <span>10.0%</span>
                </div>
              </div>

              {/* Slider 2: System Maintenance Cost (%) */}
              <div className="space-y-1 pt-1 border-t border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center justify-between text-xs">
                  <label
                    htmlFor="maintenance-cost-slider"
                    className="font-semibold text-slate-700 dark:text-slate-300"
                  >
                    System Maintenance Cost (%)
                  </label>
                  <span className="font-mono font-extrabold text-[#FF6F00]">
                    {maintenanceCostPct.toFixed(2)}% ({currencySymbol}{sensitivityRoi.annualMaintenanceCost.toLocaleString()}/yr)
                  </span>
                </div>
                <input
                  id="maintenance-cost-slider"
                  type="range"
                  min="0"
                  max="5"
                  step="0.25"
                  value={maintenanceCostPct}
                  onChange={(e) => setMaintenanceCostPct(parseFloat(e.target.value))}
                  className="w-full accent-[#FF6F00] h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>0% (No O&amp;M)</span>
                  <span>2.5%</span>
                  <span>5.0%</span>
                </div>
              </div>
            </div>

            {/* Dedicated 25-Year Recharts Bar Chart: Cumulative Savings vs System Cost */}
            <InvestmentPaybackPeriodChart
              installationCost={grossCost}
              annualSavings={calculatedAnnualSavings}
              currency={currencyCode}
              subsidyAmount={governmentSubsidy}
              systemCapacityKwp={calculatedSystemKw}
              moduleStandard={moduleStandard}
              tariffPerKwh={costPerUnit}
              expectedTariffIncreasePct={expectedTariffIncreasePct}
              onExpectedTariffIncreasePctChange={setExpectedTariffIncreasePct}
              maintenanceCostPct={maintenanceCostPct}
              onMaintenanceCostPctChange={setMaintenanceCostPct}
              showSensitivitySliders={false}
            />
          </div>

          {/* Action: Recalculate / Export PDF / Back to Enquiry */}
          <div className="pt-2 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setNewInstallStep('enquiry')}
              className="flex-1 min-w-[120px] py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
            >
              Modify Inputs
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="flex-1 min-w-[130px] py-3.5 rounded-2xl bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex-1 min-w-[130px] py-3.5 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Return Home
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DEDICATED VIEW: RETURN ON INVESTMENT (ROI) DASHBOARD                      */}
      {/* ========================================================================= */}
      {activeEstimatorOption === 'new_installation' && newInstallStep === 'roi_dashboard' && (
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {/* Header Banner */}
          <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-white leading-tight truncate">
                    Return on Investment
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Financial Return Estimation · 25-Year Payback &amp; Break-Even Model
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setNewInstallStep('results')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Sizing</span>
              </button>
            </div>

            {/* 4 Key Capital & Cashflow Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Net Investment
                </span>
                <span className="block font-mono font-extrabold text-slate-900 dark:text-white mt-0.5 truncate">
                  {currencySymbol}{netPayable.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Monthly Savings
                </span>
                <span className="block font-mono font-extrabold text-[#F97316] mt-0.5 truncate">
                  {currencySymbol}{calculatedMonthlySavings.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Annual Savings
                </span>
                <span className="block font-mono font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  {currencySymbol}{calculatedAnnualSavings.toLocaleString()}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200/60 dark:border-sky-900/40">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Govt Subsidy
                </span>
                <span className="block font-mono font-extrabold text-sky-700 dark:text-sky-400 mt-0.5 truncate">
                  {isDCR ? `${currencySymbol}${governmentSubsidy.toLocaleString()}` : `${currencySymbol}0`}
                </span>
              </div>
            </div>

            {/* Full Interactive Financial Return & 25-Year ROI Chart */}
            <InvestmentPaybackPeriodChart
              installationCost={grossCost}
              annualSavings={calculatedAnnualSavings}
              currency={currencyCode}
              subsidyAmount={governmentSubsidy}
              systemCapacityKwp={calculatedSystemKw}
              moduleStandard={moduleStandard}
              tariffPerKwh={costPerUnit}
              expectedTariffIncreasePct={expectedTariffIncreasePct}
              onExpectedTariffIncreasePctChange={setExpectedTariffIncreasePct}
              maintenanceCostPct={maintenanceCostPct}
              onMaintenanceCostPctChange={setMaintenanceCostPct}
              showSensitivitySliders={true}
            />
          </div>

          {/* Dedicated ROI Dashboard Action Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setNewInstallStep('results')}
              className="flex-1 min-w-[120px] py-3.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
            >
              Back to Results
            </button>
            <button
              type="button"
              onClick={handleExportPdf}
              className="flex-1 min-w-[130px] py-3.5 rounded-2xl bg-slate-900 dark:bg-sky-600 hover:bg-slate-800 dark:hover:bg-sky-500 text-white font-bold text-xs shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <FileDown className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('savings')}
              className="flex-1 min-w-[130px] py-3.5 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] text-white font-bold text-xs shadow-md transition cursor-pointer"
            >
              Full Savings Page
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS                                                                    */}
      {/* ========================================================================= */}
      {/* 1. Interactive Satellite Map Roof Measurement Modal */}
      <RoofCalculationModal
        isOpen={isRoofMapOpen}
        onClose={() => setIsRoofMapOpen(false)}
        latitude={weather.latitude}
        longitude={weather.longitude}
        locationName={weather.city}
        initialAreaM2={roofAreaM2}
        initialPanelWattage={selectedWattage}
        onConfirmArea={(newAreaM2) => {
          setRoofAreaStr(String(newAreaM2));
          onUpdateInputs({ roofArea: newAreaM2 });
        }}
      />

      {/* 2. Solar Panel Specifications Modal (540W–750W) */}
      <PanelSpecsModal
        isOpen={isPanelSpecsOpen}
        onClose={() => setIsPanelSpecsOpen(false)}
        selectedWattage={selectedWattage}
        onSelectWattage={(w) => {
          const newWattage = w as PanelWattage;
          setSelectedWattage(newWattage);
          if (lastEditedSizingField === 'panels' && overridePanelCount !== null && overridePanelCount >= 1) {
            const newKw = parseFloat(((overridePanelCount * newWattage) / 1000).toFixed(2));
            setEditableKwStr(String(newKw));
            setEditablePanelsStr(String(overridePanelCount));
          } else if (targetSystemKw !== null && targetSystemKw >= 3) {
            setEditableKwStr(String(targetSystemKw));
            setEditablePanelsStr(String(Math.max(1, Math.ceil((targetSystemKw * 1000) / newWattage))));
          } else {
            const defaultKw = Math.max(3, Math.round(dailyUsage / (peakSunHours * effectivePR)));
            setEditableKwStr(String(defaultKw));
            setEditablePanelsStr(String(Math.max(1, Math.ceil((defaultKw * 1000) / newWattage))));
          }
        }}
        roofAreaM2={roofAreaM2}
        onApplyCapacity={(kw, panels) => {
          const safeKw = Math.max(3, kw);
          const safePanels = Math.max(1, panels);
          setTargetSystemKw(safeKw);
          setOverridePanelCount(null);
          setLastEditedSizingField('kw');
          setEditableKwStr(String(safeKw));
          setEditablePanelsStr(String(safePanels));
        }}
      />

      {/* 3. Engineering Clearances & Setbacks Modal */}
      <EngineeringLayoutSettingsModal
        isOpen={isEngineeringModalOpen}
        onClose={() => setIsEngineeringModalOpen(false)}
        roofAreaM2={roofAreaM2}
        panelWattage={selectedWattage}
        config={roofLayoutConfig}
        onUpdateConfig={setRoofLayoutConfig}
      />

      {/* 4. DCR vs Non-DCR Information Modal (ℹ️ beside Select The Module) */}
      {isModuleInfoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6 space-y-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Module Standard Information
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Understanding DCR vs Non-DCR solar panels & subsidies
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModuleInfoModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content Comparison */}
            <div className="space-y-3.5 text-xs">
              {/* DCR Card */}
              <div className="p-4 rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <span>🇮🇳</span>
                    <span>DCR (Domestic Content Requirement)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-200/80 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 text-[10px] font-black">
                    Subsidy Eligible
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-700 dark:text-slate-300 text-[11.5px] leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>100% Made-in-India:</strong> Both solar cells and solar modules are domestically fabricated per MNRE ALMM specifications.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>PM Surya Ghar Subsidy:</strong> Mandatory requirement to receive direct government subsidy (₹30,000 for 1 kW, ₹60,000 for 2 kW, up to ₹78,000 for 3 kW+).</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Turnkey Base Pricing:</strong> 1.15× multiplier (~₹54,000/kWp base rate) due to domestic supply chain standards.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span><strong>Approved Brands:</strong> Tata Power Solar, Adani Solar, Waaree Energies, Vikram Solar, Goldi Solar.</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold">
                    Best for: Residential homes claiming central subsidy
                  </span>
                </div>
              </div>

              {/* Non-DCR Card */}
              <div className="p-4 rounded-2xl border border-sky-300 dark:border-sky-800 bg-sky-50/60 dark:bg-sky-950/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-sky-900 dark:text-sky-200 flex items-center gap-1.5">
                    <span>🌐</span>
                    <span>Non-DCR (Open Category Modules)</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-200/80 dark:bg-sky-900 text-sky-900 dark:text-sky-200 text-[10px] font-black">
                    Zero Subsidy
                  </span>
                </div>

                <div className="space-y-1.5 text-slate-700 dark:text-slate-300 text-[11.5px] leading-relaxed">
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                    <span><strong>Global Open Procurement:</strong> Uses Tier-1 global cells & high-efficiency TOPCon / Mono PERC technology.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                    <span><strong>Zero Subsidy:</strong> Ineligible for PM Surya Ghar central subsidies (₹0 government benefit).</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                    <span><strong>Capex Savings:</strong> 0.88× multiplier (~₹42,000/kWp base rate) — saves ₹12,000/kWp upfront on equipment cost.</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <Check className="w-3.5 h-3.5 text-sky-600 shrink-0 mt-0.5" />
                    <span><strong>Fast-Track Installation:</strong> No waiting for MNRE national portal inspection approvals or subsidy disbursement.</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-sky-200/60 dark:border-sky-800/60 flex items-center justify-between">
                  <span className="text-[10px] text-sky-700 dark:text-sky-400 font-semibold">
                    Best for: Commercial, industrial, farmhouses & open capex
                  </span>
                </div>
              </div>
            </div>

            {/* Unified ON/OFF Switch inside Info Modal */}
            <DcrToggleSwitch
              id="estimator-info-modal-dcr-toggle"
              moduleStandard={moduleStandard}
              onChange={applyModuleStandardChange}
            />

            {/* Modal Footer */}
            <div className="pt-1 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsModuleInfoModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Enhanced PDF Proposal, Live Preview, Print & CSV Studio Modal */}
      <PdfExportModal
        isOpen={isPdfExportModalOpen}
        onClose={() => setIsPdfExportModalOpen(false)}
        reportData={pdfReportData}
        defaultCustomerName={defaultPdfCustomerName}
      />
    </div>
  );
};
