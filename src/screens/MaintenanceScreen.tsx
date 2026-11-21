import React, { useEffect, useMemo, useState } from 'react';
import {
  Wrench,
  Trash2,
  Calendar,
  Clock,
  User,
  Phone,
  X,
  Edit3,
  Sliders,
  RotateCw,
  Radio,
  CloudSun,
} from 'lucide-react';
import {
  CustomerInstallationProfile,
  MaintenanceRecord,
  ScreenId,
  WeatherCondition,
} from '../types/solar';
import { MaterialTopBar } from '../components/MaterialTopBar';
import { SolarTrackerAngleScreen } from './SolarTrackerAngleScreen';
import { BubbleLevelScreen } from './BubbleLevelScreen';
import { SolarActivityScreen } from './SolarActivityScreen';

export type ServiceSuiteTab =
  | 'maintenance'
  | 'solar_angles'
  | 'bubble_level'
  | 'solar_activity';

interface MaintenanceScreenProps {
  records: MaintenanceRecord[];
  onUpdateRecords: (records: MaintenanceRecord[]) => void;
  profile: CustomerInstallationProfile;
  onUpdateProfile: (profile: CustomerInstallationProfile) => void;
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  initialSuiteTab?: ServiceSuiteTab;
  initialActivityTab?: 'flux' | 'kp' | 'daily_report';
}

export const MaintenanceScreen: React.FC<MaintenanceScreenProps> = ({
  records,
  onUpdateRecords,
  profile,
  onUpdateProfile,
  onNavigate,
  weather,
  onOpenWeather,
  initialSuiteTab = 'maintenance',
  initialActivityTab = 'flux',
}) => {
  const [suiteTab, setSuiteTab] = useState<ServiceSuiteTab>(initialSuiteTab);
  const [historyFilter, setHistoryFilter] = useState<
    'all' | 'cleaning' | 'inverter_inspection' | 'electrical_check'
  >('all');

  useEffect(() => {
    setSuiteTab(initialSuiteTab);
  }, [initialSuiteTab]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<MaintenanceRecord | null>(null);

  // Form state for Record
  const [formType, setFormType] = useState<MaintenanceRecord['type']>('cleaning');
  const [formTitle, setFormTitle] = useState('');
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formSoiling, setFormSoiling] = useState<MaintenanceRecord['soilingLevel']>('Light Dust');
  const [formEfficiencyGain, setFormEfficiencyGain] = useState(5.0);
  const [formInverterStatus, setFormInverterStatus] =
    useState<MaintenanceRecord['inverterStatus']>('Healthy / Normal');
  const [formTech, setFormTech] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formCost, setFormCost] = useState(500);
  const [formNextDate, setFormNextDate] = useState('');

  // Profile Form state
  const [profName, setProfName] = useState(profile.customerName);
  const [profDate, setProfDate] = useState(profile.installationDate);
  const [profCapacity, setProfCapacity] = useState(profile.systemCapacityKwp);
  const [profInverter, setProfInverter] = useState(profile.inverterModel);
  const [profPanels, setProfPanels] = useState(profile.panelBrand);
  const [profPhone, setProfPhone] = useState(profile.installerContact);

  // Real-time O&M cleaning schedule & soiling diagnostics derived from records + weather
  const cleaningDiagnostics = useMemo(() => {
    const cleaningLogs = records
      .filter((r) => r.type === 'cleaning')
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const latestWash = cleaningLogs[0];
    let daysSinceLastWash = 14;
    if (latestWash?.date) {
      const washDate = new Date(latestWash.date);
      washDate.setHours(0, 0, 0, 0);
      if (!isNaN(washDate.getTime())) {
        daysSinceLastWash = Math.max(
          0,
          Math.round((today.getTime() - washDate.getTime()) / (1000 * 60 * 60 * 24))
        );
      }
    }

    let daysUntilNextClean = 28 - daysSinceLastWash;
    let nextDueLabel = 'Recommended cycle: Every 28 days';
    if (latestWash?.nextScheduledDate) {
      const nextDate = new Date(latestWash.nextScheduledDate);
      nextDate.setHours(0, 0, 0, 0);
      if (!isNaN(nextDate.getTime())) {
        daysUntilNextClean = Math.round(
          (nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        nextDueLabel = `Scheduled due date: ${latestWash.nextScheduledDate}`;
      }
    }

    const estimatedSoilingLossPct = parseFloat(
      Math.min(12.0, Math.max(0.4, daysSinceLastWash * 0.16)).toFixed(1)
    );

    const isRainExpected =
      weather.weatherCode >= 51 ||
      weather.weatherDescription.toLowerCase().includes('rain') ||
      weather.weatherDescription.toLowerCase().includes('shower');

    const washWindowAdvice = isRainExpected
      ? 'Natural rain wash expected — inspect array after rain clears'
      : weather.temperatureC >= 36
      ? 'Schedule early morning wash (before 8:30 AM) to avoid thermal shock'
      : 'Good weather window for soft-water microfiber panel cleaning';

    return {
      latestWash,
      daysSinceLastWash,
      daysUntilNextClean,
      nextDueLabel,
      estimatedSoilingLossPct,
      washWindowAdvice,
    };
  }, [records, weather.weatherCode, weather.weatherDescription, weather.temperatureC]);

  // Real-time warranty coverage computation
  const warrantySummary = useMemo(() => {
    const installed = new Date(profile.installationDate);
    if (isNaN(installed.getTime())) {
      return `${profile.warrantyYears} Years Active`;
    }
    const yearsElapsed = Math.max(
      0,
      (Date.now() - installed.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    );
    const remaining = Math.max(0, Math.round(profile.warrantyYears - yearsElapsed));
    return remaining > 0
      ? `${remaining} of ${profile.warrantyYears} yrs remaining`
      : 'Warranty period completed';
  }, [profile.installationDate, profile.warrantyYears]);

  const filteredRecords = useMemo(() => {
    if (historyFilter === 'all') return records;
    return records.filter((r) => r.type === historyFilter);
  }, [records, historyFilter]);

  const handleOpenAdd = (presetType: MaintenanceRecord['type'] = 'cleaning') => {
    setEditingRecord(null);
    setFormType(presetType);
    setFormTitle(
      presetType === 'cleaning'
        ? 'Quarterly Panel Washing & Inspection'
        : presetType === 'inverter_inspection'
        ? 'Inverter Health & MPPT Diagnostics'
        : 'DC/AC Earthing & SPD Check'
    );
    setFormDate(new Date().toISOString().split('T')[0]);
    setFormSoiling('Moderate Dirt');
    setFormEfficiencyGain(cleaningDiagnostics.estimatedSoilingLossPct || 5.0);
    setFormInverterStatus('Healthy / Normal');
    setFormTech('Self / Certified O&M Tech');
    setFormNotes('Microfiber wiper wash with treated soft water.');
    setFormCost(600);
    const next = new Date();
    next.setDate(next.getDate() + 28);
    setFormNextDate(next.toISOString().split('T')[0]);
    setShowAddModal(true);
  };

  const handleEditRecord = (rec: MaintenanceRecord) => {
    setEditingRecord(rec);
    setFormType(rec.type);
    setFormTitle(rec.title);
    setFormDate(rec.date);
    setFormSoiling(rec.soilingLevel || 'Moderate Dirt');
    setFormEfficiencyGain(rec.efficiencyGainPercent || 5.0);
    setFormInverterStatus(rec.inverterStatus || 'Healthy / Normal');
    setFormTech(rec.technicianName || '');
    setFormNotes(rec.notes);
    setFormCost(rec.cost || 0);
    setFormNextDate(rec.nextScheduledDate || '');
    setShowAddModal(true);
  };

  const handleDeleteRecord = (id: string) => {
    onUpdateRecords(records.filter((r) => r.id !== id));
  };

  const handleSaveRecord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;

    if (editingRecord) {
      onUpdateRecords(
        records.map((r) =>
          r.id === editingRecord.id
            ? {
                ...r,
                type: formType,
                title: formTitle,
                date: formDate,
                soilingLevel: formType === 'cleaning' ? formSoiling : undefined,
                efficiencyGainPercent: formType === 'cleaning' ? formEfficiencyGain : undefined,
                inverterStatus: formType !== 'cleaning' ? formInverterStatus : undefined,
                technicianName: formTech,
                notes: formNotes,
                cost: formCost,
                nextScheduledDate: formNextDate,
              }
            : r
        )
      );
    } else {
      const newRec: MaintenanceRecord = {
        id: `maint-${Date.now()}`,
        type: formType,
        title: formTitle,
        date: formDate,
        soilingLevel: formType === 'cleaning' ? formSoiling : undefined,
        efficiencyGainPercent: formType === 'cleaning' ? formEfficiencyGain : undefined,
        inverterStatus: formType !== 'cleaning' ? formInverterStatus : undefined,
        technicianName: formTech,
        notes: formNotes,
        cost: formCost,
        nextScheduledDate: formNextDate,
      };
      onUpdateRecords([newRec, ...records]);
    }
    setShowAddModal(false);
  };

  const handleOpenProfile = () => {
    setProfName(profile.customerName);
    setProfDate(profile.installationDate);
    setProfCapacity(profile.systemCapacityKwp);
    setProfInverter(profile.inverterModel);
    setProfPanels(profile.panelBrand);
    setProfPhone(profile.installerContact);
    setShowProfileModal(true);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateProfile({
      ...profile,
      customerName: profName,
      installationDate: profDate,
      systemCapacityKwp: profCapacity,
      inverterModel: profInverter,
      panelBrand: profPanels,
      installerContact: profPhone,
    });
    setShowProfileModal(false);
  };

  return (
    <div className="flex-1 flex flex-col bg-sky-50/60 dark:bg-slate-950 pb-8 transition-colors">
      <MaterialTopBar
        title="Service & Field Tools"
        subtitle="System Maintenance, Tilt, Level & Space Weather"
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={weather}
        onOpenWeather={onOpenWeather}
      />

      {/* Unified Service Suite Tabs (4 non-duplicated tools) */}
      <div className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 sticky top-[52px] z-20 backdrop-blur-md">
        <div className="max-w-2xl mx-auto grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl text-[10.5px] font-bold">
          <button
            type="button"
            onClick={() => setSuiteTab('maintenance')}
            className={`min-h-[44px] py-1.5 px-1 rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${
              suiteTab === 'maintenance'
                ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Maintenance</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('solar_angles')}
            className={`min-h-[44px] py-1.5 px-1 rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${
              suiteTab === 'solar_angles'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Tilt & Angles</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('bubble_level')}
            className={`min-h-[44px] py-1.5 px-1 rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${
              suiteTab === 'bubble_level'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Bubble Level</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('solar_activity')}
            className={`min-h-[44px] py-1.5 px-1 rounded-xl transition cursor-pointer flex flex-col items-center justify-center gap-0.5 whitespace-nowrap ${
              suiteTab === 'solar_activity'
                ? 'bg-white dark:bg-slate-900 text-orange-600 dark:text-orange-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Space Weather</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: SOLAR MAINTENANCE (Profile -> Cleaning Schedule -> Logs)       */}
      {/* ===================================================================== */}
      {suiteTab === 'maintenance' && (
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {/* 1. Customer, Warranty & Installation Asset Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400 flex items-center justify-center font-bold text-xs shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {profile.customerName}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Commissioned {profile.installationDate} · {profile.city}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenProfile}
                className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Profile
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                <div className="text-slate-400 text-[10px]">Installed Plant Capacity</div>
                <div className="font-bold font-mono text-slate-800 dark:text-slate-100 text-sm mt-0.5">
                  {profile.systemCapacityKwp} kWp
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                  {profile.panelBrand}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                <div className="text-slate-400 text-[10px]">Inverter & Warranty</div>
                <div className="font-bold text-slate-800 dark:text-slate-100 text-xs mt-0.5 truncate">
                  {profile.inverterModel}
                </div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
                  {warrantySummary}
                </div>
              </div>
            </div>

            {profile.installerContact && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Installer / O&M Helpline</span>
                </span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {profile.installerContact}
                </span>
              </div>
            )}
          </div>

          {/* 2. Real-Time Cleaning Schedule & Soiling Diagnostics */}
          <div className="bg-gradient-to-r from-sky-900 via-blue-900 to-slate-900 rounded-3xl p-4 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-amber-300 font-semibold">
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Panel Cleaning & Soiling Monitor</span>
                </div>
                <h4 className="text-sm font-bold">
                  {cleaningDiagnostics.daysUntilNextClean <= 0
                    ? `Cleaning Due (${Math.abs(cleaningDiagnostics.daysUntilNextClean)} days overdue)`
                    : cleaningDiagnostics.daysSinceLastWash === 0
                    ? 'Panels Cleaned Today · Optimal Transmittance'
                    : `Next Cleaning in ${cleaningDiagnostics.daysUntilNextClean} Days`}
                </h4>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {cleaningDiagnostics.daysSinceLastWash} days since last wash · Estimated soiling loss{' '}
                  <strong className="text-amber-300 font-mono">
                    ~{cleaningDiagnostics.estimatedSoilingLossPct}%
                  </strong>
                  . {cleaningDiagnostics.nextDueLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenAdd('cleaning')}
                className="shrink-0 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-sm transition active:scale-95 cursor-pointer"
              >
                + Log Wash
              </button>
            </div>

            <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2 text-[11px] text-slate-200">
              <span className="flex items-center gap-1.5 min-w-0">
                <CloudSun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate">{cleaningDiagnostics.washWindowAdvice}</span>
              </span>
              <span className="font-mono text-sky-200 shrink-0">{weather.temperatureC}°C</span>
            </div>
          </div>

          {/* 3. Service & Inspection History */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Service & Inspection History ({filteredRecords.length})
              </h3>
              <button
                type="button"
                onClick={() => handleOpenAdd('inverter_inspection')}
                className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                + Log Service
              </button>
            </div>

            {/* Category Filter Controls */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl overflow-x-auto scrollbar-none text-[11px] font-semibold">
              {[
                { key: 'all' as const, label: `All (${records.length})` },
                { key: 'cleaning' as const, label: 'Cleaning' },
                { key: 'inverter_inspection' as const, label: 'Inverter' },
                { key: 'electrical_check' as const, label: 'Electrical' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setHistoryFilter(tab.key)}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg transition cursor-pointer whitespace-nowrap ${
                    historyFilter === tab.key
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {filteredRecords.length === 0 ? (
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
                <Wrench className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No service records found for this filter.
                </p>
                <button
                  type="button"
                  onClick={() => handleOpenAdd('cleaning')}
                  className="px-3 py-1.5 bg-sky-600 text-white rounded-xl text-xs font-medium cursor-pointer"
                >
                  Log Service Event
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredRecords.map((rec) => {
                  const isCleaning = rec.type === 'cleaning';
                  const isInverter = rec.type === 'inverter_inspection';

                  return (
                    <div
                      key={rec.id}
                      className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs hover:border-sky-200 dark:hover:border-slate-700 transition space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isCleaning
                                ? 'bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-400'
                                : isInverter
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400'
                            }`}
                          >
                            <Wrench className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {rec.title}
                            </div>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>{rec.date}</span>
                              {rec.technicianName && <span>· By {rec.technicianName}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleEditRecord(rec)}
                            className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                            title="Edit Record"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec.id)}
                            className="w-7 h-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center justify-center text-slate-400 hover:text-red-600 dark:hover:text-red-400 cursor-pointer"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Clean unboxed metadata strip */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        {rec.soilingLevel && <span>Soiling: {rec.soilingLevel}</span>}
                        {rec.efficiencyGainPercent && (
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                            · +{rec.efficiencyGainPercent}% Yield Restored
                          </span>
                        )}
                        {rec.inverterStatus && (
                          <span className="font-semibold text-sky-700 dark:text-sky-400">
                            Status: {rec.inverterStatus}
                          </span>
                        )}
                        {rec.cost && rec.cost > 0 && (
                          <span className="font-mono">· ₹{rec.cost}</span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50/70 dark:bg-slate-800/60 p-2 rounded-xl">
                        {rec.notes}
                      </p>

                      {rec.nextScheduledDate && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-sky-500" />
                          <span>
                            Next Due Date: <strong>{rec.nextScheduledDate}</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: TILT & ORIENTATION TRACKER ANGLES                              */}
      {/* ===================================================================== */}
      {suiteTab === 'solar_angles' && (
        <SolarTrackerAngleScreen
          onNavigate={onNavigate}
          weather={weather}
          onOpenWeather={onOpenWeather}
          hideTopBar={true}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 3: PRECISION BUBBLE LEVEL & INCLINOMETER                          */}
      {/* ===================================================================== */}
      {suiteTab === 'bubble_level' && (
        <BubbleLevelScreen
          onNavigate={onNavigate}
          weather={weather}
          onOpenWeather={onOpenWeather}
          hideTopBar={true}
        />
      )}

      {/* ===================================================================== */}
      {/* TAB 4: SPACE WEATHER, RADIO FLUX, KP-INDEX & DAILY SUN REPORT         */}
      {/* ===================================================================== */}
      {suiteTab === 'solar_activity' && (
        <SolarActivityScreen
          onNavigate={onNavigate}
          weather={weather}
          onOpenWeather={onOpenWeather}
          initialTab={initialActivityTab}
          hideTopBar={true}
        />
      )}

      {/* Add / Edit Record Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-sky-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {editingRecord ? 'Edit Maintenance Record' : 'Log Maintenance Event'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Service Type
                  </label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as MaintenanceRecord['type'])}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="cleaning">Panel Cleaning</option>
                    <option value="inverter_inspection">Inverter Inspection</option>
                    <option value="electrical_check">Electrical / Earthing Check</option>
                    <option value="other">General Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Service Title / Summary
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Pre-Summer Deep Wash & String Voc Audit"
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              {formType === 'cleaning' ? (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                      Soiling Level
                    </label>
                    <select
                      value={formSoiling}
                      onChange={(e) =>
                        setFormSoiling(e.target.value as MaintenanceRecord['soilingLevel'])
                      }
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                    >
                      <option value="Light Dust">Light Dust Layer</option>
                      <option value="Moderate Dirt">Moderate Dirt</option>
                      <option value="Heavy Pollen/Bird Droppings">Heavy Droppings / Soot</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                      Est. Yield Gain (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formEfficiencyGain}
                      onChange={(e) => setFormEfficiencyGain(parseFloat(e.target.value) || 0)}
                      className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Inverter / Equipment Health
                  </label>
                  <select
                    value={formInverterStatus}
                    onChange={(e) =>
                      setFormInverterStatus(e.target.value as MaintenanceRecord['inverterStatus'])
                    }
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  >
                    <option value="Healthy / Normal">Healthy / Normal Operation</option>
                    <option value="Warning">Warning / Minor Heat Throttling</option>
                    <option value="Error Code Found">Error Code Detected / Fault</option>
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Technician / Agency
                  </label>
                  <input
                    type="text"
                    value={formTech}
                    onChange={(e) => setFormTech(e.target.value)}
                    placeholder="e.g. Self or GreenSolar Tech"
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Service Cost (₹)
                  </label>
                  <input
                    type="number"
                    value={formCost}
                    onChange={(e) => setFormCost(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Next Due Date (Reminder)
                </label>
                <input
                  type="date"
                  value={formNextDate}
                  onChange={(e) => setFormNextDate(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Technician Observations & Notes
                </label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Details of water pressure, earthing reading, MC4 tightness..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-sm"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-sky-100 dark:border-slate-800">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Customer & Plant Profile
              </h3>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={profName}
                  onChange={(e) => setProfName(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Commissioning Date
                  </label>
                  <input
                    type="date"
                    value={profDate}
                    onChange={(e) => setProfDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                    Capacity (kWp)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={profCapacity}
                    onChange={(e) => setProfCapacity(parseFloat(e.target.value) || 0)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Inverter Model
                </label>
                <input
                  type="text"
                  value={profInverter}
                  onChange={(e) => setProfInverter(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Panel Make & Model
                </label>
                <input
                  type="text"
                  value={profPanels}
                  onChange={(e) => setProfPanels(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-medium mb-1">
                  Installer Helpline / Contact
                </label>
                <input
                  type="text"
                  value={profPhone}
                  onChange={(e) => setProfPhone(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold shadow-sm"
                >
                  Update Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
