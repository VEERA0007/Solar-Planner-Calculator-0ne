import React, { useState } from 'react';
import {
  X,
  Check,
  Layers,
  Sparkles,
  Ruler,
  Maximize2,
  Zap,
  Calculator,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  SOLAR_PANEL_CATALOG,
  SolarPanelModel,
  SYSTEM_CAPACITY_PRESETS,
  calculateFromSystemKw,
  calculateFromPanelCount,
  calculateFromRoofArea,
  getPanelSpecification,
} from '../data/panelDatabase';

interface PanelSpecsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedWattage: number;
  onSelectWattage?: (wattage: number) => void;
  roofAreaM2?: number;
  onApplyCapacity?: (kw: number, panels: number, areaM2: number) => void;
}

export const PanelSpecsModal: React.FC<PanelSpecsModalProps> = ({
  isOpen,
  onClose,
  selectedWattage,
  onSelectWattage,
  roofAreaM2 = 0,
  onApplyCapacity,
}) => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'panels'>('matrix');
  const [activeWattage, setActiveWattage] = useState<number>(
    selectedWattage && selectedWattage >= 540 ? selectedWattage : 550
  );

  // Interactive Live Interlinked Inputs (supports empty string when deleting)
  const [interactiveKw, setInteractiveKw] = useState<number | ''>(10);
  const [interactivePanels, setInteractivePanels] = useState<number | ''>(19);
  const [interactiveAreaM2, setInteractiveAreaM2] = useState<number | ''>(49.1);

  if (!isOpen) return null;

  // Active panel spec
  const currentSpec = getPanelSpecification(activeWattage);

  // Handlers for bidirectional interlinking (allowing deletion of 0 without error):
  const handleKwChange = (valStr: string) => {
    if (valStr === '') {
      setInteractiveKw('');
      setInteractivePanels('');
      setInteractiveAreaM2('');
      return;
    }
    const kw = parseFloat(valStr);
    if (isNaN(kw)) {
      setInteractiveKw('');
      return;
    }
    setInteractiveKw(kw);
    if (kw > 0) {
      const result = calculateFromSystemKw(kw, activeWattage);
      setInteractivePanels(result.panelCount);
      setInteractiveAreaM2(result.requiredAreaM2);
    } else {
      setInteractivePanels(0);
      setInteractiveAreaM2(0);
    }
  };

  const handlePanelsChange = (valStr: string) => {
    if (valStr === '') {
      setInteractivePanels('');
      setInteractiveKw('');
      setInteractiveAreaM2('');
      return;
    }
    const count = parseInt(valStr, 10);
    if (isNaN(count)) {
      setInteractivePanels('');
      return;
    }
    setInteractivePanels(count);
    if (count > 0) {
      const result = calculateFromPanelCount(count, activeWattage);
      setInteractiveKw(result.systemKw);
      setInteractiveAreaM2(result.requiredAreaM2);
    } else {
      setInteractiveKw(0);
      setInteractiveAreaM2(0);
    }
  };

  const handleAreaChange = (valStr: string) => {
    if (valStr === '') {
      setInteractiveAreaM2('');
      setInteractivePanels('');
      setInteractiveKw('');
      return;
    }
    const area = parseFloat(valStr);
    if (isNaN(area)) {
      setInteractiveAreaM2('');
      return;
    }
    setInteractiveAreaM2(area);
    if (area > 0) {
      const result = calculateFromRoofArea(area, activeWattage);
      setInteractivePanels(result.maxPanels);
      setInteractiveKw(result.systemKw);
    } else {
      setInteractivePanels(0);
      setInteractiveKw(0);
    }
  };

  const handleWattageChange = (newWattage: number) => {
    setActiveWattage(newWattage);
    onSelectWattage?.(newWattage);
    // Recalculate using current kW if valid
    const kwNum = typeof interactiveKw === 'number' && interactiveKw > 0 ? interactiveKw : 10;
    const result = calculateFromSystemKw(kwNum, newWattage);
    setInteractiveKw(kwNum);
    setInteractivePanels(result.panelCount);
    setInteractiveAreaM2(result.requiredAreaM2);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20 text-[#F97316] flex items-center justify-center">
              <Zap className="w-5 h-5 text-[#F97316]" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Capacity, Panels & Roof Area Matrix
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Interlinked solar system sizing with official module specs
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher: Matrix vs Panel Catalog */}
        <div className="px-4 pt-3 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-850/50">
          <button
            onClick={() => setActiveTab('matrix')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'matrix'
                ? 'border-[#F97316] text-[#F97316]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Capacity &amp; Area Guide</span>
          </button>

          <button
            onClick={() => setActiveTab('panels')}
            className={`pb-2.5 px-3 text-xs font-bold transition border-b-2 flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'panels'
                ? 'border-[#F97316] text-[#F97316]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>{SOLAR_PANEL_CATALOG.length} Module Specs (540W–750W)</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Active Panel Model Selector Pill Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Select Panel Model:
              </span>
              <span className="font-mono font-semibold text-[#F97316]">
                {currentSpec.wattage}W • {currentSpec.dimensionsMm} • {currentSpec.areaSqm} m²
              </span>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
              {SOLAR_PANEL_CATALOG.map((p) => (
                <button
                  key={p.wattage}
                  onClick={() => handleWattageChange(p.wattage)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold shrink-0 transition cursor-pointer border ${
                    activeWattage === p.wattage
                      ? 'bg-[#F97316] text-white border-[#F97316] shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {p.wattage}W
                </button>
              ))}
            </div>
          </div>

          {activeTab === 'matrix' ? (
            <div className="space-y-3.5">
              {/* Interactive Bidirectional Interlinked Sizer */}
              <div className="p-3.5 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/40 dark:via-slate-850 dark:to-slate-900 rounded-2xl border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-[#F97316]" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      Live Capacity Calculator ({activeWattage}W Panel)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Edit any value to recalculate
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Field 1: kW */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">
                      System Size (kW)
                    </label>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <input
                        type="number"
                        min="1"
                        max="300000"
                        step="1"
                        value={interactiveKw}
                        onChange={(e) => handleKwChange(e.target.value)}
                        placeholder="1 - 300000"
                        className="w-full font-mono font-extrabold text-sm text-slate-900 dark:text-white bg-transparent focus:outline-hidden"
                      />
                      <span className="text-xs font-bold text-slate-500">kW</span>
                    </div>
                  </div>

                  {/* Field 2: Panels */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">
                      Panel Count
                    </label>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <input
                        type="number"
                        min="1"
                        max="1000000"
                        step="1"
                        value={interactivePanels}
                        onChange={(e) => handlePanelsChange(e.target.value)}
                        placeholder="nos"
                        className="w-full font-mono font-extrabold text-sm text-[#F97316] bg-transparent focus:outline-hidden"
                      />
                      <span className="text-xs font-bold text-slate-500">nos</span>
                    </div>
                  </div>

                  {/* Field 3: Surface Area */}
                  <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <label className="block text-[10px] uppercase font-bold text-slate-400">
                      Roof Area (m²)
                    </label>
                    <div className="flex items-baseline gap-1 mt-0.5">
                      <input
                        type="number"
                        min="1"
                        max="5000000"
                        step="0.1"
                        value={interactiveAreaM2}
                        onChange={(e) => handleAreaChange(e.target.value)}
                        placeholder="m²"
                        className="w-full font-mono font-extrabold text-sm text-emerald-600 dark:text-emerald-400 bg-transparent focus:outline-hidden"
                      />
                      <span className="text-xs font-bold text-slate-500">m²</span>
                    </div>
                  </div>
                </div>

                {/* Validation message if invalid value or 0 */}
                {(interactiveKw === '' || interactiveKw <= 0) && (
                  <div className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900 flex items-center justify-between">
                    <span>Invalid value: Please enter a valid capacity between 1 kW and 300 MW (300,000 kW).</span>
                  </div>
                )}

                {onApplyCapacity && typeof interactiveKw === 'number' && interactiveKw > 0 && (
                  <button
                    onClick={() => {
                      onApplyCapacity(
                        interactiveKw,
                        typeof interactivePanels === 'number' ? interactivePanels : 1,
                        typeof interactiveAreaM2 === 'number' ? interactiveAreaM2 : 1
                      );
                      onClose();
                    }}
                    className="w-full py-2.5 rounded-xl bg-[#F97316] hover:bg-[#EA580C] text-white font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <span>
                      Apply {interactiveKw >= 1000 ? `${(interactiveKw / 1000).toFixed(1)} MW (${interactiveKw.toLocaleString()} kW)` : `${interactiveKw} kW`}
                      {' '}({typeof interactivePanels === 'number' ? interactivePanels.toLocaleString() : 0} panels • {typeof interactiveAreaM2 === 'number' ? interactiveAreaM2.toLocaleString() : 0} m²)
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Official Benchmark Capacity Table */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Benchmark Capacities
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">
                    1 panel = {currentSpec.areaSqm} m²
                  </span>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 max-h-64 overflow-y-auto">
                  <div className="bg-slate-100/70 dark:bg-slate-800/80 px-3.5 py-2 text-[10px] font-bold text-slate-500 uppercase grid grid-cols-4 tracking-wider sticky top-0 z-10">
                    <span>System Capacity</span>
                    <span className="text-center">Panels (nos)</span>
                    <span className="text-center">Area (m²)</span>
                    <span className="text-right">Area (sq ft)</span>
                  </div>

                  {SYSTEM_CAPACITY_PRESETS.map((preset) => {
                    const row = calculateFromSystemKw(preset.kw, activeWattage);
                    const isCurrent = interactiveKw === preset.kw;

                    return (
                      <div
                        key={preset.label}
                        onClick={() => {
                          handleKwChange(preset.kw.toString());
                          if (onApplyCapacity) {
                            onApplyCapacity(preset.kw, row.panelCount, row.requiredAreaM2);
                            onClose();
                          }
                        }}
                        className={`px-3.5 py-2.5 text-xs transition cursor-pointer grid grid-cols-4 items-center ${
                          isCurrent
                            ? 'bg-amber-500/15 dark:bg-amber-950/40 font-bold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                        }`}
                      >
                        <div className="font-extrabold text-slate-900 dark:text-white font-mono flex items-center gap-1.5">
                          <span>{preset.label}</span>
                          {isCurrent && (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#F97316]"></span>
                          )}
                        </div>
                        <div className="text-center font-mono font-bold text-[#F97316]">
                          {row.panelCount.toLocaleString()}
                        </div>
                        <div className="text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                          {row.requiredAreaM2.toLocaleString()} m²
                        </div>
                        <div className="text-right font-mono text-slate-500 dark:text-slate-400 text-[11px]">
                          {row.requiredAreaSqFt.toLocaleString()} sq ft
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            /* Panel Models Catalog List */
            <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
              {SOLAR_PANEL_CATALOG.map((panel) => {
                const isSelected = activeWattage === panel.wattage;
                const maxFit =
                  roofAreaM2 > 0 ? Math.floor(roofAreaM2 / panel.areaSqm) : null;

                return (
                  <div
                    key={panel.wattage}
                    onClick={() => handleWattageChange(panel.wattage)}
                    className={`p-3 transition cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-amber-500/10 dark:bg-amber-950/40 border-l-4 border-l-[#F97316]'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">
                          {panel.wattage} W
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          {panel.tier}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                        <div className="flex items-center gap-1 font-mono">
                          <Ruler className="w-3.5 h-3.5 text-slate-400" />
                          <span>{panel.dimensionsMm}</span>
                        </div>
                        <div className="flex items-center gap-1 font-mono font-semibold text-[#F97316]">
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>{panel.areaSqm.toFixed(2)} m²</span>
                          <span className="text-[10.5px] text-slate-400">({panel.areaSqFt} sq ft)</span>
                        </div>
                      </div>

                      {maxFit !== null && (
                        <div className="text-[10.5px] text-emerald-600 dark:text-emerald-400 font-medium">
                          Fits up to ~{maxFit} panels ({((maxFit * panel.wattage) / 1000).toFixed(1)} kW) on your {roofAreaM2} m² roof
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center">
                      {isSelected ? (
                        <span className="w-6 h-6 rounded-full bg-[#F97316] text-white flex items-center justify-center shadow-xs">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-slate-400 hover:text-slate-700">
                          Select
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {activeWattage}W • {currentSpec.dimensionsMm} • {currentSpec.areaSqm} m²
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
