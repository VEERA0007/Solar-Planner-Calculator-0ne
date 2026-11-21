import React, { useMemo, useState } from 'react';
import {
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  FileCheck2,
  Link2,
  PackageCheck,
  ShieldCheck,
  XCircle,
  Zap,
} from 'lucide-react';
import { SystemType } from '../types/solar';
import { BomCategory, SystemBomResult } from '../utils/solarMath';
import { DcrToggleSwitch } from './DcrToggleSwitch';

interface BomAndInterlinkPanelProps {
  bom: SystemBomResult;
  consumerCategory: 'residential' | 'commercial' | 'agricultural';
  monthlyUnits: number;
  connectedLoadKw: number;
  moduleStandard: 'DCR' | 'NON_DCR';
  systemType: SystemType;
  pvCapacityKw: number;
  panelCount: number;
  batteryKwh: number;
  onChangeConsumerCategory?: (cat: 'residential' | 'commercial' | 'agricultural') => void;
  onChangeModuleStandard?: (std: 'DCR' | 'NON_DCR') => void;
  onChangeSystemType?: (type: SystemType) => void;
  onNavigateToAppliances?: () => void;
  defaultExpanded?: boolean;
}

const CORE_CATEGORIES: BomCategory[] = ['PV Modules', 'Inverter / PCU', 'Battery Bank'];
const BOS_CATEGORIES: BomCategory[] = ['Structure & Cabling', 'BOS & Protection'];
const DOCS_CATEGORIES: BomCategory[] = ['Metering & Compliance'];

export const BomAndInterlinkPanel: React.FC<BomAndInterlinkPanelProps> = ({
  bom,
  consumerCategory,
  monthlyUnits,
  connectedLoadKw,
  moduleStandard,
  systemType,
  pvCapacityKw,
  panelCount,
  batteryKwh,
  onChangeConsumerCategory,
  onChangeModuleStandard,
  onChangeSystemType,
  onNavigateToAppliances,
  defaultExpanded = true,
}) => {
  const [filterGroup, setFilterGroup] = useState<'all' | 'core' | 'bos' | 'docs'>('all');
  const [isBomExpanded, setIsBomExpanded] = useState<boolean>(defaultExpanded);

  const filteredItems = useMemo(() => {
    if (filterGroup === 'core') {
      return bom.items.filter((i) => CORE_CATEGORIES.includes(i.category));
    }
    if (filterGroup === 'bos') {
      return bom.items.filter((i) => BOS_CATEGORIES.includes(i.category));
    }
    if (filterGroup === 'docs') {
      return bom.items.filter((i) => DOCS_CATEGORIES.includes(i.category));
    }
    return bom.items;
  }, [bom.items, filterGroup]);

  const isDCR = moduleStandard === 'DCR';
  const systemTitle =
    systemType === 'on-grid' ? 'On-Grid' : systemType === 'hybrid' ? 'Hybrid' : 'Off-Grid';

  return (
    <div className="space-y-3.5">
      {/* 1. 3-WAY SYSTEM INTERLINK PANEL: Application Analysis ↔ DCR / Non-DCR ↔ On-Grid / Hybrid / Off-Grid */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                3-Way Live System Interlink
              </h3>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                Application Load ↔ DCR/Non-DCR ↔ Architecture &amp; BOM
              </p>
            </div>
          </div>
          {onNavigateToAppliances && (
            <button
              type="button"
              onClick={onNavigateToAppliances}
              className="px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-[10px] font-bold hover:bg-sky-100 transition cursor-pointer shrink-0"
            >
              Edit Loads
            </button>
          )}
        </div>

        {/* Connected Pipeline Summary */}
        <div className="grid grid-cols-3 gap-1.5 text-[10.5px]">
          {/* Node 1: Application */}
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1 min-w-0">
            <div className="flex items-center gap-1 text-[9.5px] font-bold uppercase text-slate-400">
              <Cpu className="w-3 h-3 text-emerald-500 shrink-0" />
              <span className="truncate">1. Application</span>
            </div>
            <div className="font-extrabold text-slate-900 dark:text-white capitalize truncate">
              {consumerCategory}
            </div>
            <div className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
              {monthlyUnits} kWh · {connectedLoadKw} kW
            </div>
          </div>

          {/* Node 2: DCR / Non-DCR */}
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1 min-w-0">
            <div className="flex items-center gap-1 text-[9.5px] font-bold uppercase text-slate-400">
              <ShieldCheck className="w-3 h-3 text-amber-500 shrink-0" />
              <span className="truncate">2. Module</span>
            </div>
            <div
              className={`font-extrabold truncate ${
                isDCR ? 'text-emerald-700 dark:text-emerald-400' : 'text-sky-700 dark:text-sky-400'
              }`}
            >
              {isDCR ? 'DCR (ALMM)' : 'Non-DCR'}
            </div>
            <div className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
              {panelCount} × {pvCapacityKw} kWp
            </div>
          </div>

          {/* Node 3: System Architecture */}
          <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700/80 space-y-1 min-w-0">
            <div className="flex items-center gap-1 text-[9.5px] font-bold uppercase text-slate-400">
              <Zap className="w-3 h-3 text-[#FF6F00] shrink-0" />
              <span className="truncate">3. System</span>
            </div>
            <div className="font-extrabold text-[#FF6F00] truncate">{systemTitle}</div>
            <div className="font-mono text-[9.5px] text-slate-500 dark:text-slate-400 truncate">
              {bom.batteryRequired ? `${batteryKwh} kWh LFP` : '0 kWh Battery'}
            </div>
          </div>
        </div>

        {/* Optional Live Controls when handlers are passed */}
        {(onChangeConsumerCategory || onChangeModuleStandard || onChangeSystemType) && (
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            {onChangeConsumerCategory && (
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 shrink-0 w-16">
                  App Type:
                </span>
                {(['residential', 'commercial', 'agricultural'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => onChangeConsumerCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold capitalize transition cursor-pointer shrink-0 ${
                      consumerCategory === cat
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              {onChangeModuleStandard && (
                <div className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center">
                  <DcrToggleSwitch
                    compact
                    moduleStandard={moduleStandard}
                    onChange={onChangeModuleStandard}
                  />
                </div>
              )}

              {onChangeSystemType && (
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl flex-1 justify-end">
                  {(['on-grid', 'hybrid', 'off-grid'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => onChangeSystemType(st)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer ${
                        systemType === st
                          ? 'bg-[#FF6F00] text-white shadow-2xs'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {st === 'on-grid' ? 'On-Grid' : st === 'hybrid' ? 'Hybrid' : 'Off-Grid'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. WHEN IS BATTERY REQUIRED? CLARITY CARD */}
      <div
        className={`rounded-3xl p-4 border space-y-2.5 ${
          bom.batteryRequirementStatus === 'NOT_REQUIRED'
            ? 'bg-emerald-50/70 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-800/60'
            : bom.batteryRequirementStatus === 'OPTIONAL_BACKUP'
            ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/60'
            : 'bg-orange-50/80 dark:bg-orange-950/25 border-orange-200 dark:border-orange-800/60'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <BatteryCharging
              className={`w-4 h-4 shrink-0 ${
                bom.batteryRequirementStatus === 'NOT_REQUIRED'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-[#FF6F00]'
              }`}
            />
            <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
              {bom.batteryRequirementHeadline}
            </span>
          </div>
          <span
            className={`text-[9.5px] font-black px-2 py-0.5 rounded-full shrink-0 uppercase ${
              bom.batteryRequirementStatus === 'NOT_REQUIRED'
                ? 'bg-emerald-600 text-white'
                : 'bg-[#FF6F00] text-white'
            }`}
          >
            {bom.batteryRequired ? 'Battery Included' : 'No Battery Needed'}
          </span>
        </div>

        <p className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
          {bom.batteryRequirementExplanation}
        </p>

        {/* Compact Battery Decision Rules Matrix */}
        <div className="grid grid-cols-3 gap-1.5 pt-1 text-[9.5px]">
          <div
            className={`p-2 rounded-xl border ${
              systemType === 'on-grid'
                ? 'bg-white dark:bg-slate-900 border-emerald-400 font-semibold'
                : 'bg-white/60 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-700/70 opacity-80'
            }`}
          >
            <div className="font-extrabold text-emerald-700 dark:text-emerald-400">On-Grid</div>
            <div className="text-slate-600 dark:text-slate-300">Battery NOT needed (Grid Net Meter)</div>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              systemType === 'hybrid'
                ? 'bg-white dark:bg-slate-900 border-amber-400 font-semibold'
                : 'bg-white/60 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-700/70 opacity-80'
            }`}
          >
            <div className="font-extrabold text-amber-700 dark:text-amber-400">Hybrid</div>
            <div className="text-slate-600 dark:text-slate-300">Needed only for power-cut backup</div>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              systemType === 'off-grid'
                ? 'bg-white dark:bg-slate-900 border-orange-400 font-semibold'
                : 'bg-white/60 dark:bg-slate-900/50 border-slate-200/70 dark:border-slate-700/70 opacity-80'
            }`}
          >
            <div className="font-extrabold text-orange-700 dark:text-orange-400">Off-Grid</div>
            <div className="text-slate-600 dark:text-slate-300">Mandatory (No grid night power)</div>
          </div>
        </div>
      </div>

      {/* 3. DYNAMIC BILL OF MATERIALS (BOM) & REQUIRED PARTS SCHEDULE */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-sky-100 dark:border-slate-800 shadow-xs space-y-3">
        <button
          type="button"
          onClick={() => setIsBomExpanded((prev) => !prev)}
          className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <PackageCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 truncate">
                Required Parts &amp; BOM ({bom.requiredCount} Active)
              </h3>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                {systemTitle} · {isDCR ? 'DCR ALMM' : 'Non-DCR'} · {bom.supplyPhaseLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {bom.removedComponents.length > 0 && (
              <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {bom.removedComponents.length} Auto-Removed
              </span>
            )}
            {isBomExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </div>
        </button>

        {isBomExpanded && (
          <div className="space-y-2.5 pt-1">
            {bom.removedComponents.length > 0 && (
              <div className="p-2.5 px-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-dashed border-slate-300 dark:border-slate-700 text-[10.5px] text-slate-600 dark:text-slate-300 flex items-start gap-2">
                <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    Automatically Removed for {systemTitle}:{' '}
                  </span>
                  <span>{bom.removedComponents.join(' · ')}</span>
                </div>
              </div>
            )}

            {/* BOM Group Filter */}
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
              {(
                [
                  { id: 'all', label: `All Parts (${bom.items.length})` },
                  { id: 'core', label: 'PV, Inv & Battery' },
                  { id: 'bos', label: 'BOS & Structure' },
                  { id: 'docs', label: 'Meters & Docs' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterGroup(tab.id)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold transition cursor-pointer shrink-0 border ${
                    filterGroup === tab.id
                      ? 'bg-slate-900 dark:bg-sky-600 text-white border-slate-900 dark:border-sky-600'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* BOM Item List */}
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const isRequired = item.status === 'Required';
                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-2xl border transition space-y-1.5 ${
                      isRequired
                        ? 'bg-slate-50/80 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-700/80'
                        : 'bg-slate-100/70 dark:bg-slate-900/40 border-dashed border-slate-300 dark:border-slate-700 opacity-80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {isRequired ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          )}
                          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-[10.5px] text-slate-600 dark:text-slate-300 mt-0.5 pl-5">
                          {item.specification}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`inline-block text-[10px] font-mono font-extrabold px-2 py-0.5 rounded-lg ${
                            isRequired
                              ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300'
                              : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {item.quantity}
                        </span>
                        <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                          {item.category}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 pl-5 pt-1 border-t border-slate-200/60 dark:border-slate-700/60 text-[10px] text-slate-500 dark:text-slate-400">
                      <FileCheck2 className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
                      <span>{item.reason}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
