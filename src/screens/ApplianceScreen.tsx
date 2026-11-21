import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Cpu,
  Plus,
  Trash2,
  Edit2,
  Zap,
  ArrowRight,
  Sparkles,
  X,
  Link2,
  BatteryCharging,
  ShieldCheck,
  CheckCircle2,
  Sun,
  Calculator,
} from 'lucide-react';
import {
  Appliance,
  CurrencyCode,
  ScreenId,
  SystemType,
  WeatherCondition,
} from '../types/solar';
import { PRESET_APPLIANCES } from '../data/defaultData';
import {
  CURRENCY_SYMBOLS,
  analyzeConsumptionSystemOptions,
  calculateApplianceEnergy,
  generateSystemBom,
  getApplianceEffectiveMetrics,
} from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';
import { BomAndInterlinkPanel } from '../components/BomAndInterlinkPanel';
import { DcrToggleSwitch } from '../components/DcrToggleSwitch';

interface ApplianceScreenProps {
  appliances: Appliance[];
  onUpdateAppliances: (
    list: Appliance[],
    phaseOverride?: 'single_phase' | 'three_phase'
  ) => void;
  onTransferToEstimator: (monthlyKwh: number) => void;
  phaseType: 'single_phase' | 'three_phase';
  consumerCategory: 'residential' | 'commercial' | 'agricultural';
  moduleStandard?: 'DCR' | 'NON_DCR';
  systemType?: SystemType;
  batteryBackupHours?: number;
  currency?: CurrencyCode;
  tariffPerKwh?: number;
  peakSunHours?: number;
  panelWattage?: number;
  onUpdatePhaseType: (phase: 'single_phase' | 'three_phase') => void;
  onUpdateApplicationCategory: (
    cat: 'residential' | 'commercial' | 'agricultural',
    nextPhase: 'single_phase' | 'three_phase'
  ) => void;
  onUpdateModuleStandard?: (standard: 'DCR' | 'NON_DCR') => void;
  onUpdateSystemOption?: (systemType: SystemType, backupHours?: number) => void;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
}

export const ApplianceScreen: React.FC<ApplianceScreenProps> = ({
  appliances,
  onUpdateAppliances,
  onTransferToEstimator,
  phaseType,
  consumerCategory,
  moduleStandard = 'DCR',
  systemType = 'on-grid',
  batteryBackupHours = 0,
  currency = 'INR',
  tariffPerKwh = 7.8,
  peakSunHours = 5.5,
  panelWattage = 550,
  onUpdateApplicationCategory,
  onUpdateModuleStandard = () => {},
  onUpdateSystemOption = () => {},
  onNavigate,
  weather,
  onOpenWeather,
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phaseAutoToast, setPhaseAutoToast] = useState<string | null>(null);
  const [hasCalculatedApplication, setHasCalculatedApplication] = useState<boolean>(false);
  const analysisResultsRef = useRef<HTMLDivElement | null>(null);
  const [batteryBackupStr, setBatteryBackupStr] = useState<string>(
    batteryBackupHours > 0 ? String(batteryBackupHours) : ''
  );

  useEffect(() => {
    setBatteryBackupStr(batteryBackupHours > 0 ? String(batteryBackupHours) : '');
  }, [batteryBackupHours]);

  const handleSelectMode = (mode: SystemType) => {
    if (mode === 'on-grid') {
      onUpdateSystemOption('on-grid', 0);
    } else {
      const parsed = parseFloat(batteryBackupStr);
      const entered = Number.isFinite(parsed) && parsed > 0 ? Math.min(24, parsed) : 0;
      onUpdateSystemOption(mode, entered);
    }
  };

  const handleManualBatteryChange = (raw: string) => {
    setBatteryBackupStr(raw);
    const parsed = parseFloat(raw);
    const clamped = Number.isFinite(parsed) && parsed > 0 ? Math.min(24, parsed) : 0;
    onUpdateSystemOption(systemType, clamped);
  };

  // Form state
  const [formName, setFormName] = useState('');
  const [formCategory, setFormCategory] = useState<Appliance['category']>('cooling');
  const [formQuantity, setFormQuantity] = useState(1);
  const [formWatts, setFormWatts] = useState(100);
  const [formHours, setFormHours] = useState(6);
  const [formDays, setFormDays] = useState(30);
  const [formOperatingPhase, setFormOperatingPhase] = useState<
    'auto' | 'single_phase' | 'three_phase'
  >('auto');

  const energyTotals = calculateApplianceEnergy(appliances, phaseType, consumerCategory);
  const currencySymbol = CURRENCY_SYMBOLS[currency] || '₹';

  const hasHeavyLoad = appliances.some(
    (a) => a.category === 'heavy' || a.ratedWatts * a.quantity >= 2000
  );

  const systemAnalysis = useMemo(
    () =>
      analyzeConsumptionSystemOptions({
        monthlyKwh: energyTotals.monthlyKwh,
        connectedLoadKw: energyTotals.connectedLoadKw,
        moduleStandard,
        consumerCategory,
        currency,
        tariffPerKwh,
        peakSunHours: weather.peakSunHoursEstimated || peakSunHours,
        panelWattage,
        backupHours: batteryBackupHours,
        hasHeavyOrCriticalLoad: hasHeavyLoad,
      }),
    [
      energyTotals.monthlyKwh,
      energyTotals.connectedLoadKw,
      moduleStandard,
      consumerCategory,
      currency,
      tariffPerKwh,
      weather.peakSunHoursEstimated,
      peakSunHours,
      panelWattage,
      batteryBackupHours,
      hasHeavyLoad,
    ]
  );

  const activeSystemOption = systemAnalysis.options[systemType];

  const activeBom = useMemo(
    () =>
      generateSystemBom({
        systemType,
        moduleStandard,
        consumerCategory,
        phaseType,
        pvCapacityKw: activeSystemOption.pvCapacityKw,
        panelCount: activeSystemOption.panelCount,
        panelWattage: activeSystemOption.panelWattage,
        inverterCapacityKw: activeSystemOption.inverterCapacityKw,
        inverterLabel: activeSystemOption.inverterLabel,
        batteryKwh: activeSystemOption.batteryKwh,
        batteryUnits: activeSystemOption.batteryUnits,
        batteryPackLabel: activeSystemOption.batteryPackLabel,
        backupHours: batteryBackupHours,
        connectedLoadKw: energyTotals.connectedLoadKw,
      }),
    [
      systemType,
      moduleStandard,
      consumerCategory,
      phaseType,
      activeSystemOption,
      batteryBackupHours,
      energyTotals.connectedLoadKw,
    ]
  );

  const showToast = (msg: string) => {
    setPhaseAutoToast(msg);
    setTimeout(() => setPhaseAutoToast(null), 3500);
  };

  // Detect whether adding/updating list crosses into 3-phase requirement (>5 kW or 3-phase equipment)
  const applyApplianceChangeWithPhaseLink = (nextList: Appliance[]) => {
    const evalIfSingle = calculateApplianceEnergy(nextList, 'single_phase', consumerCategory);
    const shouldAutoUpgrade =
      phaseType === 'single_phase' && evalIfSingle.recommendedPhase === 'three_phase';

    if (shouldAutoUpgrade) {
      onUpdateAppliances(nextList, 'three_phase');
      showToast('Switched to Three Phase (415V) to match connected appliance load');
    } else {
      onUpdateAppliances(nextList);
    }
  };

  const handleSelectApplication = (cat: 'residential' | 'commercial' | 'agricultural') => {
    if (cat === 'commercial' || cat === 'agricultural') {
      onUpdateApplicationCategory(cat, 'three_phase');
      showToast(
        `${cat === 'commercial' ? 'Commercial' : 'Agricultural'} load set to Three Phase (415V)`
      );
      return;
    }
    const evalSingle = calculateApplianceEnergy(appliances, 'single_phase', 'residential');
    const nextPhase = evalSingle.recommendedPhase;
    onUpdateApplicationCategory('residential', nextPhase);
    showToast(
      nextPhase === 'three_phase'
        ? 'Residential load > 5 kW — keeping Three Phase (415V)'
        : 'Residential mode set to Single Phase (230V)'
    );
  };

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormName('');
    setFormCategory('cooling');
    setFormQuantity(1);
    setFormWatts(150);
    setFormHours(6);
    setFormDays(30);
    setFormOperatingPhase('auto');
    setShowAddModal(true);
  };

  const handleEdit = (item: Appliance) => {
    setEditingId(item.id);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormQuantity(item.quantity);
    setFormWatts(item.ratedWatts);
    setFormHours(item.hoursPerDay);
    setFormDays(item.daysPerMonth);
    setFormOperatingPhase(item.operatingPhase || 'auto');
    setShowAddModal(true);
  };

  const handleDelete = (id: string) => {
    const nextList = appliances.filter((a) => a.id !== id);
    onUpdateAppliances(nextList);
  };

  const handleSelectPreset = (presetName: string) => {
    const found = PRESET_APPLIANCES.find((p) => p.name === presetName);
    if (found) {
      setFormName(found.name);
      setFormCategory(found.category);
      setFormQuantity(found.quantity);
      setFormWatts(found.ratedWatts);
      setFormHours(found.hoursPerDay);
      setFormDays(found.daysPerMonth);
      setFormOperatingPhase(found.category === 'heavy' ? 'three_phase' : 'auto');
    }
  };

  const handleSaveAppliance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    const resolvedVoltage: 230 | 415 | undefined =
      formOperatingPhase === 'three_phase'
        ? 415
        : formOperatingPhase === 'single_phase'
        ? 230
        : undefined;

    if (editingId) {
      const nextList = appliances.map((a) =>
        a.id === editingId
          ? {
              ...a,
              name: formName.trim(),
              category: formCategory,
              quantity: Math.max(1, formQuantity),
              ratedWatts: Math.max(1, formWatts),
              hoursPerDay: Math.min(24, Math.max(0.1, formHours)),
              daysPerMonth: Math.min(31, Math.max(1, formDays)),
              operatingPhase: formOperatingPhase,
              ratedVoltage: resolvedVoltage,
            }
          : a
      );
      applyApplianceChangeWithPhaseLink(nextList);
    } else {
      const newItem: Appliance = {
        id: `app-${Date.now()}`,
        name: formName.trim(),
        category: formCategory,
        quantity: Math.max(1, formQuantity),
        ratedWatts: Math.max(1, formWatts),
        hoursPerDay: Math.min(24, Math.max(0.1, formHours)),
        daysPerMonth: Math.min(31, Math.max(1, formDays)),
        operatingPhase: formOperatingPhase,
        ratedVoltage: resolvedVoltage,
      };
      applyApplianceChangeWithPhaseLink([...appliances, newItem]);
    }

    setShowAddModal(false);
  };

  const handleTransfer = () => {
    onTransferToEstimator(energyTotals.monthlyKwh);
    onNavigate('estimator');
  };

  const modalPreviewMetrics = getApplianceEffectiveMetrics(
    {
      id: 'preview',
      name: formName || 'Preview',
      category: formCategory,
      quantity: Math.max(1, formQuantity),
      ratedWatts: Math.max(1, formWatts),
      hoursPerDay: Math.min(24, Math.max(0.1, formHours)),
      daysPerMonth: Math.min(31, Math.max(1, formDays)),
      operatingPhase: formOperatingPhase,
      ratedVoltage:
        formOperatingPhase === 'three_phase'
          ? 415
          : formOperatingPhase === 'single_phase'
          ? 230
          : undefined,
    },
    formOperatingPhase === 'three_phase' ? 'three_phase' : phaseType
  );

  return (
    <div className="flex-1 flex flex-col bg-sky-50/60 dark:bg-slate-950 pb-8 transition-colors">
      <MaterialTopBar
        title="Appliance Load Analysis"
        subtitle={
          hasCalculatedApplication
            ? `${activeSystemOption.title} · ${
                moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'
              } · ${energyTotals.monthlyKwh} kWh/mo`
            : `${consumerCategory.toUpperCase()} · ${energyTotals.monthlyKwh} kWh/mo`
        }
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={weather}
        onOpenWeather={onOpenWeather}
        actionButton={
          <button
            onClick={handleOpenAdd}
            className="w-8 h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-sm transition cursor-pointer"
            title="Add Appliance"
          >
            <Plus className="w-4 h-4" />
          </button>
        }
      />

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Total Energy Consumption Hero */}
        <div className="bg-gradient-to-br from-emerald-950 via-teal-900 to-slate-900 rounded-3xl p-5 text-white shadow-xl border border-emerald-700/40 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-emerald-300 tracking-wide uppercase">
              {hasCalculatedApplication
                ? 'Calculated Consumption & Sizing'
                : 'Application Energy Consumption'}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[11px] font-bold font-mono tabular-nums capitalize">
              {hasCalculatedApplication
                ? `${activeSystemOption.title} · ${moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'}`
                : `${consumerCategory} Load`}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold font-mono tabular-nums text-white">
              {energyTotals.monthlyKwh}
            </span>
            <span className="text-xl font-bold text-emerald-300">kWh/mo</span>
            <span className="text-xs text-slate-300 ml-auto font-mono tabular-nums">
              Daily: <strong className="text-white">{energyTotals.dailyKwh} kWh</strong>
            </span>
          </div>

          {hasCalculatedApplication ? (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Connected Load
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-sky-300">
                  {energyTotals.connectedLoadKw} kW
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Inverter
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-white">
                  {activeSystemOption.inverterCapacityKw} kW
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Battery Bank
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-amber-300">
                  {activeSystemOption.batteryKwh > 0
                    ? `${activeSystemOption.batteryKwh} kWh`
                    : 'Grid-Only'}
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 pt-1 text-center">
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Connected Load
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-sky-300">
                  {energyTotals.connectedLoadKw} kW
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Appliances
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-white">
                  {appliances.length} Items
                </span>
              </div>
              <div className="p-2 rounded-xl bg-white/5 border border-white/10">
                <span className="block text-[9.5px] text-emerald-300/80 uppercase font-bold">
                  Annual Usage
                </span>
                <span className="font-mono tabular-nums font-extrabold text-sm text-amber-300">
                  {(energyTotals.monthlyKwh * 12).toLocaleString()} kWh
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-emerald-800/60 flex items-center justify-between gap-2">
            <span className="text-[11px] text-emerald-200 flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                {hasCalculatedApplication
                  ? 'Synced live with Solar Estimator'
                  : 'Configure appliances & calculate below'}
              </span>
            </span>
            {hasCalculatedApplication ? (
              <button
                onClick={handleTransfer}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
              >
                <span>Open Estimator</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setHasCalculatedApplication(true);
                  setTimeout(
                    () =>
                      analysisResultsRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start',
                      }),
                    60
                  );
                }}
                disabled={appliances.length === 0}
                className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer shrink-0"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Calculate</span>
              </button>
            )}
          </div>
        </div>

        {/* Application Selector (Interlinked with Estimator) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  Application Profile
                </h3>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Adjusts load profile &amp; monthly energy usage across Solar Estimator
                </p>
              </div>
            </div>
          </div>

          {/* Application Selector */}
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'residential', label: 'Residential', sub: 'Home Load' },
                { id: 'commercial', label: 'Commercial', sub: 'Business · +12%' },
                { id: 'agricultural', label: 'Agricultural', sub: 'Farm / Heavy' },
              ] as const
            ).map((appMode) => (
              <button
                key={appMode.id}
                type="button"
                onClick={() => handleSelectApplication(appMode.id)}
                className={`py-2 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                  consumerCategory === appMode.id
                    ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="text-xs font-bold leading-tight">{appMode.label}</span>
                <span className="text-[9.5px] font-medium opacity-85 leading-tight">
                  {appMode.sub}
                </span>
              </button>
            ))}
          </div>

          {/* System Mode Selection + Conditional Self-Entered Battery Backup */}
          <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                System Type
              </span>
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {systemType === 'on-grid'
                  ? 'Grid Net-Metered'
                  : systemType === 'hybrid'
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
                  onClick={() => handleSelectMode(mode.id)}
                  className={`py-2 px-1.5 rounded-xl text-center transition cursor-pointer border flex flex-col items-center gap-0.5 ${
                    systemType === mode.id
                      ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
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
                    <BatteryCharging className="w-3.5 h-3.5 text-[#FF6F00]" />
                    <label
                      htmlFor="app-battery-backup-input"
                      className="text-xs font-bold text-slate-800 dark:text-slate-100"
                    >
                      Battery Backup (Hours)
                    </label>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    Based on Inverter
                  </span>
                </div>
                <input
                  id="app-battery-backup-input"
                  type="number"
                  min="1"
                  max="24"
                  step="0.5"
                  value={batteryBackupStr}
                  onChange={(e) => handleManualBatteryChange(e.target.value)}
                  placeholder="Enter backup hours based on inverter"
                  className="w-full px-3.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                />
              </div>
            )}
          </div>

          {phaseAutoToast && (
            <div className="px-3 py-2 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-[11px] font-semibold text-sky-800 dark:text-sky-200">
              {phaseAutoToast}
            </div>
          )}
        </div>

        {/* Quick Add Presets Row */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Common Appliance Presets</span>
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">1-Click Add</span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 text-xs">
            {PRESET_APPLIANCES.map((preset) => (
              <button
                key={preset.name}
                onClick={() => {
                  const newItem: Appliance = {
                    id: `app-${Date.now()}-${Math.random()}`,
                    ...preset,
                    operatingPhase: preset.category === 'heavy' ? 'three_phase' : 'auto',
                  };
                  applyApplianceChangeWithPhaseLink([...appliances, newItem]);
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-300 dark:hover:border-sky-700 text-slate-700 dark:text-slate-300 transition flex items-center gap-1.5 text-[11px] cursor-pointer"
              >
                <Plus className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                <span>{preset.name.split('(')[0]}</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500">({preset.ratedWatts}W)</span>
              </button>
            ))}
          </div>
        </div>

        {/* Appliance List */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              Configured Appliances ({appliances.length})
            </h3>
            <button
              onClick={handleOpenAdd}
              className="text-xs text-sky-600 dark:text-sky-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Add Custom Appliance
            </button>
          </div>

          {appliances.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <Cpu className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
              <p className="text-xs text-slate-500 dark:text-slate-400">No appliances added yet.</p>
              <button
                onClick={handleOpenAdd}
                className="px-3 py-1.5 bg-sky-600 text-white rounded-xl text-xs font-medium cursor-pointer"
              >
                Add Your First Appliance
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {appliances.map((app) => {
                const eff = getApplianceEffectiveMetrics(app, phaseType);

                return (
                  <div
                    key={app.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 border border-sky-100 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3 hover:border-sky-200 dark:hover:border-slate-700 transition"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100 truncate">
                          {app.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                          Qty: {app.quantity}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-mono font-bold">
                          {eff.voltageV}V · {eff.currentAmps}A
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {app.ratedWatts} W · {app.hoursPerDay} hrs/day · {app.daysPerMonth} days/mo
                      </div>
                    </div>

                    <div className="text-right shrink-0 font-mono tabular-nums">
                      <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                        {eff.monthlyKwh} <span className="text-[10px] font-sans font-normal">kWh/mo</span>
                      </div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">
                        {eff.dailyKwh} kWh/day
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 pl-1">
                      <button
                        onClick={() => handleEdit(app)}
                        className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
                        title="Edit Appliance"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(app.id)}
                        className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/50 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition cursor-pointer"
                        title="Delete Appliance"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Step Trigger: Calculate Application Consumption before showing DCR / On-Grid / Off-Grid / Hybrid */}
        {!hasCalculatedApplication && (
          <button
            type="button"
            disabled={appliances.length === 0}
            onClick={() => {
              setHasCalculatedApplication(true);
              setTimeout(
                () =>
                  analysisResultsRef.current?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                  }),
                60
              );
            }}
            className="w-full py-4 px-4 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] disabled:opacity-50 text-white font-bold text-sm shadow-md transition active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            <span>Calculate Application &amp; View System Options</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {/* POST-CALCULATION ONLY: DCR/Non-DCR + Consumption-Based On-Grid, Off-Grid & Hybrid Options */}
        {hasCalculatedApplication && appliances.length > 0 && (
          <div ref={analysisResultsRef} className="space-y-4 pt-1">
            {/* POST-CALC STEP 1: DCR vs Non-DCR Module Standard Selection */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      Module Standard: DCR vs Non-DCR
                    </h3>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      Controls PM Surya Ghar subsidy eligibility &amp; per-kW panel Capex
                    </p>
                  </div>
                </div>
                <span
                  className={`text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 ${
                    moduleStandard === 'DCR'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                      : 'bg-sky-100 text-sky-800 dark:bg-sky-950/80 dark:text-sky-300'
                  }`}
                >
                  {moduleStandard === 'DCR' ? 'Subsidy Eligible' : 'Open Category'}
                </span>
              </div>

              <DcrToggleSwitch
                id="appliance-dcr-toggle"
                moduleStandard={moduleStandard}
                onChange={onUpdateModuleStandard}
              />
            </div>

            {/* POST-CALC STEP 2: Consumption-Based On-Grid, Off-Grid & Hybrid System Options */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/60 text-[#FF6F00] flex items-center justify-center shrink-0">
                    <BatteryCharging className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                      System Options by Consumption ({energyTotals.dailyKwh} kWh/day)
                    </h3>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                      Compare inverter type, added battery bank &amp; net cost for On-Grid, Off-Grid &amp; Hybrid
                    </p>
                  </div>
                </div>
              </div>

              {/* Consumption Analysis Insight */}
              <div className="p-2.5 px-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50 text-[11px] text-slate-700 dark:text-slate-200 flex items-start gap-2">
                <Sun className="w-4 h-4 text-[#FF6F00] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-800 dark:text-amber-300">
                    Recommended ({systemAnalysis.options[systemAnalysis.recommendedType].title}):{' '}
                  </span>
                  <span>{systemAnalysis.recommendationReason}</span>
                </div>
              </div>

              {/* Backup Hours Input: ONLY visible for Hybrid or Off-Grid (hidden for On-Grid) */}
              {(systemType === 'hybrid' || systemType === 'off-grid') && (
                <div className="flex items-center justify-between gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70">
                  <label
                    htmlFor="app-post-battery-backup-input"
                    className="text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0"
                  >
                    Battery Backup:
                  </label>
                  <input
                    id="app-post-battery-backup-input"
                    type="number"
                    min="1"
                    max="24"
                    step="0.5"
                    value={batteryBackupStr}
                    onChange={(e) => handleManualBatteryChange(e.target.value)}
                    placeholder="Enter hrs (inverter)"
                    className="w-40 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white text-right focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
                  />
                </div>
              )}

              {/* 3 Side-by-Side Architecture Option Cards */}
              <div className="space-y-2.5">
                {(['on-grid', 'hybrid', 'off-grid'] as const).map((typeKey) => {
                  const opt = systemAnalysis.options[typeKey];
                  const isSelected = systemType === typeKey;
                  const isRecommended = systemAnalysis.recommendedType === typeKey;

                  return (
                    <button
                      key={typeKey}
                      type="button"
                      onClick={() => handleSelectMode(typeKey)}
                      className={`w-full text-left p-3.5 rounded-2xl border-2 transition cursor-pointer space-y-2.5 ${
                        isSelected
                          ? 'border-[#FF6F00] bg-orange-50/40 dark:bg-orange-950/20 shadow-sm'
                          : 'border-slate-200/90 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2
                            className={`w-4 h-4 shrink-0 ${
                              isSelected ? 'text-[#FF6F00]' : 'text-slate-300 dark:text-slate-600'
                            }`}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                                {opt.title} System
                              </span>
                              {isRecommended && (
                                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300">
                                  Best Match
                                </span>
                              )}
                              {isSelected && (
                                <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-[#FF6F00] text-white">
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                              {opt.tagline}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm font-black font-mono tabular-nums text-slate-900 dark:text-white">
                            {currencySymbol}
                            {opt.netCost.toLocaleString()}
                          </div>
                          <div className="text-[9.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {opt.governmentSubsidy > 0
                              ? `Net after -${currencySymbol}${opt.governmentSubsidy.toLocaleString()} subsidy`
                              : opt.systemType === 'off-grid'
                              ? 'Standalone (0 Subsidy)'
                              : moduleStandard === 'NON_DCR'
                              ? 'Non-DCR (0 Subsidy)'
                              : 'Turnkey Cost'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70">
                          <span className="block text-[9px] font-bold uppercase text-slate-400">
                            PV Array ({opt.moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'})
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 block truncate">
                            {opt.pvCapacityKw} kWp ({opt.panelCount} nos)
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70">
                          <span className="block text-[9px] font-bold uppercase text-slate-400">
                            Inverter
                          </span>
                          <span className="font-bold text-sky-700 dark:text-sky-300 block truncate">
                            {opt.inverterCapacityKw} kW {opt.systemType === 'on-grid' ? 'Grid-Tie' : opt.systemType === 'hybrid' ? 'Hybrid' : 'PCU'}
                          </span>
                        </div>

                        <div className="p-2 rounded-xl bg-white dark:bg-slate-900/80 border border-slate-200/70 dark:border-slate-700/70">
                          <span className="block text-[9px] font-bold uppercase text-slate-400">
                            Batteries
                          </span>
                          <span
                            className={`font-bold block truncate ${
                              opt.batteryKwh > 0
                                ? 'text-amber-700 dark:text-amber-300'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {opt.batteryKwh > 0 ? `${opt.batteryKwh} kWh LFP` : 'None (0 kWh)'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10px] pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-slate-600 dark:text-slate-300">
                        <span className="truncate">
                          {opt.inverterLabel} · {opt.batteryPackLabel}
                        </span>
                        <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400 shrink-0">
                          Save {currencySymbol}
                          {opt.monthlySavings.toLocaleString()}/mo · {opt.paybackYears} Yrs
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* POST-CALC STEP 3: 3-Way Interlink + Battery Requirement Guide + Live BOM Material List */}
            <BomAndInterlinkPanel
              bom={activeBom}
              consumerCategory={consumerCategory}
              monthlyUnits={energyTotals.monthlyKwh}
              connectedLoadKw={energyTotals.connectedLoadKw}
              moduleStandard={moduleStandard}
              systemType={systemType}
              pvCapacityKw={activeSystemOption.pvCapacityKw}
              panelCount={activeSystemOption.panelCount}
              batteryKwh={activeSystemOption.batteryKwh}
              onChangeConsumerCategory={handleSelectApplication}
              onChangeModuleStandard={onUpdateModuleStandard}
              onChangeSystemType={(st) => onUpdateSystemOption(st, batteryBackupHours)}
            />

            {/* Transfer Button Bottom Action */}
            <button
              onClick={handleTransfer}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-xs rounded-2xl shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition active:scale-[0.99] cursor-pointer"
            >
              <span>
                Open {activeSystemOption.title} ({moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'} ·{' '}
                {energyTotals.monthlyKwh} kWh) in Estimator
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-sky-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingId ? 'Edit Appliance' : 'Add New Appliance'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAppliance} className="space-y-3 text-xs">
              {!editingId && (
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Choose from Presets (Optional)
                  </label>
                  <select
                    onChange={(e) => handleSelectPreset(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="">Custom Appliance (Blank)</option>
                    {PRESET_APPLIANCES.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.ratedWatts}W)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Appliance Name
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Inverter Air Conditioner 1.5 Ton"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => {
                      const cat = e.target.value as Appliance['category'];
                      setFormCategory(cat);
                      if (cat === 'heavy') setFormOperatingPhase('three_phase');
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="cooling">Cooling</option>
                    <option value="kitchen">Kitchen</option>
                    <option value="lighting">Lighting</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="utility">Utility / Heater / Pump</option>
                    <option value="heavy">Heavy / EV / 3-Phase</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Phase / Voltage
                  </label>
                  <select
                    value={formOperatingPhase}
                    onChange={(e) =>
                      setFormOperatingPhase(
                        e.target.value as 'auto' | 'single_phase' | 'three_phase'
                      )
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="auto">Auto by Load</option>
                    <option value="single_phase">Single Phase (230V)</option>
                    <option value="three_phase">Three Phase (415V)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Rated Power (Watts)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="25000"
                    value={formWatts}
                    onChange={(e) => setFormWatts(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Hours / Day (0.1 - 24)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="24"
                    value={formHours}
                    onChange={(e) => setFormHours(parseFloat(e.target.value) || 1)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Days / Month (1 - 31)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formDays}
                    onChange={(e) => setFormDays(parseInt(e.target.value, 10) || 30)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-100 dark:border-sky-900/50 flex justify-between items-center text-xs">
                <div>
                  <span className="block text-sky-900 dark:text-sky-300 font-medium">
                    Estimated Monthly Load
                  </span>
                  <span className="text-[10px] font-mono text-sky-700 dark:text-sky-400">
                    {modalPreviewMetrics.voltageV}V · {modalPreviewMetrics.currentAmps}A draw
                  </span>
                </div>
                <span className="font-extrabold font-mono text-sky-800 dark:text-sky-300">
                  {modalPreviewMetrics.monthlyKwh} kWh/mo
                </span>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm cursor-pointer"
                >
                  {editingId ? 'Save Changes' : 'Add Appliance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
