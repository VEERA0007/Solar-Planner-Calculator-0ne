import React, { useState, useMemo } from 'react';
import {
  X,
  Sliders,
  RotateCw,
  Maximize2,
  ShieldAlert,
  Footprints,
  Compass,
  Zap,
  Check,
  Plus,
  Trash2,
  Info,
  Layers,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import {
  LayoutAnalysisResult,
  PanelOrientation,
  RoofLayoutConfig,
  RoofObstacle,
} from '../types/solar';
import { SolarPanelModel, getPanelSpecification } from '../data/panelDatabase';
import {
  COMMON_ROOF_OBSTACLES,
  DEFAULT_ROOF_LAYOUT_CONFIG,
  deriveRoofDimensionsMm,
  solveRooftopLayout,
} from '../utils/roofLayoutEngine';

interface EngineeringLayoutSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roofAreaM2: number;
  panelWattage: number;
  config: RoofLayoutConfig;
  onUpdateConfig: (config: RoofLayoutConfig) => void;
  onApplyLayout?: (result: LayoutAnalysisResult) => void;
}

export const EngineeringLayoutSettingsModal: React.FC<EngineeringLayoutSettingsModalProps> = ({
  isOpen,
  onClose,
  roofAreaM2,
  panelWattage,
  config,
  onUpdateConfig,
  onApplyLayout,
}) => {
  const [localConfig, setLocalConfig] = useState<RoofLayoutConfig>(config || DEFAULT_ROOF_LAYOUT_CONFIG);
  const [activeTab, setActiveTab] = useState<'blueprint' | 'parameters' | 'obstacles'>('blueprint');

  const panelSpec = useMemo(() => getPanelSpecification(panelWattage), [panelWattage]);
  const roofDimensions = useMemo(() => deriveRoofDimensionsMm(roofAreaM2, 1.35), [roofAreaM2]);

  // Compute live layout simulation
  const layoutResult = useMemo(
    () => solveRooftopLayout(roofAreaM2, panelWattage, localConfig, roofDimensions),
    [roofAreaM2, panelWattage, localConfig, roofDimensions]
  );

  if (!isOpen) return null;

  const handleConfigChange = <K extends keyof RoofLayoutConfig>(
    key: K,
    val: RoofLayoutConfig[K]
  ) => {
    const updated = { ...localConfig, [key]: val };
    setLocalConfig(updated);
    onUpdateConfig(updated);
  };

  const handleAddPresetObstacle = (preset: (typeof COMMON_ROOF_OBSTACLES)[number]) => {
    const newObstacle: RoofObstacle = {
      id: `obs-${Date.now()}`,
      ...preset,
    };
    const updatedList = [...(localConfig.obstacles || []), newObstacle];
    handleConfigChange('obstacles', updatedList);
  };

  const handleRemoveObstacle = (id: string) => {
    const updatedList = (localConfig.obstacles || []).filter((o) => o.id !== id);
    handleConfigChange('obstacles', updatedList);
  };

  const handleResetDefaults = () => {
    setLocalConfig(DEFAULT_ROOF_LAYOUT_CONFIG);
    onUpdateConfig(DEFAULT_ROOF_LAYOUT_CONFIG);
  };

  const handleApply = () => {
    onUpdateConfig(localConfig);
    onApplyLayout?.(layoutResult);
    onClose();
  };

  // Dimensions for SVG Canvas preview
  const svgViewWidth = 800;
  const svgViewHeight = Math.round(
    (roofDimensions.lengthMm / (roofDimensions.widthMm || 1)) * svgViewWidth
  );
  const scale = svgViewWidth / roofDimensions.widthMm;

  const edgeSetbackPx =
    (localConfig.roofBoundaryClearanceMm + localConfig.fabricationEdgeClearanceMm) * scale;
  const boundaryOnlyPx = localConfig.roofBoundaryClearanceMm * scale;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-black/80 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="relative w-full max-w-4xl max-h-[94vh] flex flex-col bg-slate-900 border border-slate-700/80 rounded-2xl sm:rounded-3xl shadow-2xl text-slate-100 overflow-hidden">
        {/* Top Header */}
        <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/80 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Sliders className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Roof Engineering Layout
                </h2>
                <span className="text-[9.5px] font-mono font-bold px-1.5 py-0.2 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                  {panelSpec.wattage}W
                </span>
              </div>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                Clearances, inter-row pitch, walkways & setbacks
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation & Orientation Selector */}
        <div className="px-3 sm:px-5 py-2.5 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-2.5 shrink-0">
          {/* Tab Navigation (Horizontal scrolling on small screens with no overflow) */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5 md:pb-0">
            {[
              { id: 'blueprint', label: '2D Layout', icon: Maximize2 },
              { id: 'parameters', label: 'Clearance Controls', icon: Sliders },
              {
                id: 'obstacles',
                label: `Obstacles (${localConfig.obstacles?.length || 0})`,
                icon: ShieldAlert,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="whitespace-nowrap">{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Orientation Solver Selector */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 overflow-x-auto scrollbar-none self-start md:self-auto w-full md:w-auto justify-between md:justify-start">
            {[
              { id: 'auto', label: 'Auto Optimal' },
              { id: 'portrait', label: 'Portrait' },
              { id: 'landscape', label: 'Landscape' },
            ].map((mode) => {
              const isSelected = localConfig.orientation === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleConfigChange('orientation', mode.id as PanelOrientation)}
                  className={`px-2 sm:px-2.5 py-1 rounded-lg text-[10.5px] sm:text-[11px] font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-[#FF6F00] text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {mode.label}
                  {mode.id === 'auto' && layoutResult.isOptimal && (
                    <span className="ml-1 text-[9px] px-1 py-0.2 rounded bg-emerald-500/30 text-emerald-300">
                      ★ {layoutResult.orientation.slice(0, 4)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* TAB 1: 2D BLUEPRINT VIEW */}
          {activeTab === 'blueprint' && (
            <div className="space-y-4">
              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Panels Fitted
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5">
                    {layoutResult.panelsCount}{' '}
                    <span className="text-xs text-slate-400 font-semibold font-sans">
                      ({layoutResult.rows}R × {layoutResult.cols}C)
                    </span>
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-medium capitalize">
                    {layoutResult.orientation} Layout
                  </span>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Total Capacity
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">
                    {layoutResult.systemKw} <span className="text-xs font-sans">kW</span>
                  </div>
                  <span className="text-[10.5px] text-emerald-500/90 font-medium">
                    {layoutResult.occupiedAreaM2} m² module area
                  </span>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Space Utilization
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-sky-400 mt-0.5">
                    {layoutResult.areaUtilizationPercent}%
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-medium">
                    {layoutResult.usableAreaM2} m² usable net
                  </span>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-2xl border border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                    Setbacks & Walkways
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-slate-300 mt-0.5">
                    {(layoutResult.setbackAreaM2 + layoutResult.walkwayAreaM2).toFixed(1)}{' '}
                    <span className="text-xs font-sans">m²</span>
                  </div>
                  <span className="text-[10.5px] text-slate-400 font-medium">
                    {layoutResult.walkwayAreaM2} m² walkway corridor
                  </span>
                </div>
              </div>

              {/* Automatic Solver Comparison Callout */}
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300 font-medium">
                    Portrait fits <strong>{layoutResult.comparison.portraitPanels} panels ({layoutResult.comparison.portraitKw} kW)</strong> vs Landscape fits{' '}
                    <strong>{layoutResult.comparison.landscapePanels} panels ({layoutResult.comparison.landscapeKw} kW)</strong>.
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Recommended: {layoutResult.comparison.recommended.toUpperCase()} (
                    +{layoutResult.comparison.diffPercent}% yield)
                  </span>
                </div>
              </div>

              {/* Interactive 2D Layout Blueprint SVG */}
              <div className="relative bg-slate-950 rounded-2xl p-4 border border-slate-800 overflow-x-auto flex justify-center">
                <svg
                  viewBox={`0 0 ${svgViewWidth} ${svgViewHeight}`}
                  className="w-full max-w-2xl h-auto rounded-xl shadow-inner border border-slate-800"
                  style={{ maxHeight: '420px', background: '#0B1120' }}
                >
                  <defs>
                    {/* Pattern for boundary setback buffer */}
                    <pattern
                      id="setbackHatch"
                      width="12"
                      height="12"
                      patternTransform="rotate(45 0 0)"
                      patternUnits="userSpaceOnUse"
                    >
                      <line x1="0" y1="0" x2="0" y2="12" stroke="#F59E0B" strokeWidth="1.2" opacity="0.3" />
                    </pattern>

                    {/* Pattern for Solar Panel Cell Texture */}
                    <pattern id="panelCells" width="10" height="18" patternUnits="userSpaceOnUse">
                      <rect width="10" height="18" fill="#1E3A8A" />
                      <rect width="10" height="18" fill="none" stroke="#3B82F6" strokeWidth="0.5" opacity="0.4" />
                      <line x1="0" y1="9" x2="10" y2="9" stroke="#60A5FA" strokeWidth="0.5" opacity="0.6" />
                    </pattern>

                    {/* Obstacle Hazard Pattern */}
                    <pattern
                      id="obstacleHatch"
                      width="8"
                      height="8"
                      patternTransform="rotate(45 0 0)"
                      patternUnits="userSpaceOnUse"
                    >
                      <line x1="0" y1="0" x2="0" y2="8" stroke="#EF4444" strokeWidth="1.8" opacity="0.7" />
                    </pattern>
                  </defs>

                  {/* 1. Full Outer Rooftop Boundary */}
                  <rect
                    x="0"
                    y="0"
                    width={svgViewWidth}
                    height={svgViewHeight}
                    fill="#0F172A"
                    stroke="#475569"
                    strokeWidth="3"
                  />

                  {/* 2. Roof Boundary Setback Zone (Parapet & Fire setback) */}
                  <rect
                    x="0"
                    y="0"
                    width={svgViewWidth}
                    height={svgViewHeight}
                    fill="url(#setbackHatch)"
                  />

                  {/* 3. Usable Structural Area (Within setback + fabrication clearance) */}
                  <rect
                    x={edgeSetbackPx}
                    y={edgeSetbackPx}
                    width={Math.max(0, svgViewWidth - 2 * edgeSetbackPx)}
                    height={Math.max(0, svgViewHeight - 2 * edgeSetbackPx)}
                    fill="#0B132B"
                    stroke="#F59E0B"
                    strokeWidth="1.8"
                    strokeDasharray="4 4"
                  />

                  {/* 4. Render Solar Panels Array */}
                  {layoutResult.panelPositions.map((panel) => {
                    const pX = edgeSetbackPx + panel.xMm * scale;
                    const pY = edgeSetbackPx + panel.yMm * scale;
                    const pW = panel.widthMm * scale;
                    const pL = panel.lengthMm * scale;

                    return (
                      <g key={panel.id} className="transition-all hover:opacity-85">
                        <rect
                          x={pX}
                          y={pY}
                          width={pW}
                          height={pL}
                          fill="url(#panelCells)"
                          stroke="#93C5FD"
                          strokeWidth="0.8"
                          rx="1.5"
                        />
                        {/* Panel Cell Busbar Grid highlight */}
                        <line
                          x1={pX + pW / 2}
                          y1={pY}
                          x2={pX + pW / 2}
                          y2={pY + pL}
                          stroke="#FFFFFF"
                          strokeWidth="0.6"
                          opacity="0.5"
                        />
                      </g>
                    );
                  })}

                  {/* 5. Render Obstacles with Clearance Buffer */}
                  {(localConfig.obstacles || []).map((obs) => {
                    const usableWidthMm = Math.max(
                      0,
                      roofDimensions.widthMm -
                        2 *
                          (localConfig.roofBoundaryClearanceMm +
                            localConfig.fabricationEdgeClearanceMm)
                    );
                    const usableLengthMm = Math.max(
                      0,
                      roofDimensions.lengthMm -
                        2 *
                          (localConfig.roofBoundaryClearanceMm +
                            localConfig.fabricationEdgeClearanceMm)
                    );

                    const centerX =
                      edgeSetbackPx +
                      (((obs.xOffsetPercent ?? 50) / 100) * usableWidthMm) * scale;
                    const centerY =
                      edgeSetbackPx +
                      (((obs.yOffsetPercent ?? 50) / 100) * usableLengthMm) * scale;

                    const rawWidthPx = obs.widthM * 1000 * scale;
                    const rawLengthPx = obs.lengthM * 1000 * scale;
                    const bufferPx = localConfig.obstacleClearanceMm * scale;

                    return (
                      <g key={obs.id}>
                        {/* Clearance Buffer Zone around obstacle */}
                        <rect
                          x={centerX - rawWidthPx / 2 - bufferPx}
                          y={centerY - rawLengthPx / 2 - bufferPx}
                          width={rawWidthPx + 2 * bufferPx}
                          height={rawLengthPx + 2 * bufferPx}
                          fill="rgba(239, 68, 68, 0.15)"
                          stroke="#EF4444"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          rx="4"
                        />

                        {/* Physical Obstacle Body */}
                        <rect
                          x={centerX - rawWidthPx / 2}
                          y={centerY - rawLengthPx / 2}
                          width={rawWidthPx}
                          height={rawLengthPx}
                          fill="#7F1D1D"
                          stroke="#DC2626"
                          strokeWidth="1.8"
                          rx="2"
                        />

                        {/* Obstacle Label */}
                        <text
                          x={centerX}
                          y={centerY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="#FFFFFF"
                          fontSize="10"
                          fontWeight="bold"
                          fontFamily="sans-serif"
                        >
                          {obs.name}
                        </text>
                      </g>
                    );
                  })}

                  {/* Legend / Compass Indicator */}
                  <g transform="translate(20, 20)">
                    <circle cx="16" cy="16" r="14" fill="#0F172A" stroke="#334155" strokeWidth="1" />
                    <text x="16" y="11" textAnchor="middle" fill="#EF4444" fontSize="9" fontWeight="bold">
                      N
                    </text>
                    <line x1="16" y1="12" x2="16" y2="20" stroke="#EF4444" strokeWidth="1.5" />
                  </g>
                </svg>

                {/* Blueprint Dimension Tags */}
                <div className="absolute bottom-6 right-6 bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 text-[11px] font-mono text-slate-300">
                  Roof: {(roofDimensions.widthMm / 1000).toFixed(1)}m × {(roofDimensions.lengthMm / 1000).toFixed(1)}m • {roofAreaM2} m²
                </div>
              </div>

              {/* Blueprint Legend */}
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded bg-blue-700 border border-blue-400"></span>
                  <span>Solar PV Modules</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded border border-dashed border-amber-500 bg-amber-500/10"></span>
                  <span>Boundary Setback ({localConfig.roofBoundaryClearanceMm} mm)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded border border-red-500 bg-red-950/60"></span>
                  <span>Obstacles ({localConfig.obstacleClearanceMm} mm buffer)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3.5 h-3.5 rounded border border-cyan-400 bg-cyan-950/30"></span>
                  <span>Row Pitch Gap ({localConfig.interRowGapMm} mm)</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CLEARANCE & SPACING PARAMETERS */}
          {activeTab === 'parameters' && (
            <div className="space-y-4">
              <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Adjusting clearances updates module packing and string capacities in real-time according to industrial IEC & NEC rooftop standards.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Gap between panels (0–500 mm) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">1. Gap Between Panels</span>
                      <span className="text-[10.5px] text-slate-400">
                        Inter-module clamp spacing (column)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={localConfig.interPanelGapMm}
                        onChange={(e) =>
                          handleConfigChange('interPanelGapMm', Number(e.target.value) || 0)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="5"
                    value={localConfig.interPanelGapMm}
                    onChange={(e) =>
                      handleConfigChange('interPanelGapMm', Number(e.target.value))
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 mm (Tight)</span>
                    <span>25 mm (Standard)</span>
                    <span>500 mm</span>
                  </div>
                </div>

                {/* 2. Gap between panel rows (0–2000 mm, separately configurable) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">2. Gap Between Panel Rows</span>
                      <span className="text-[10.5px] text-slate-400">
                        Row pitch spacing (prevents self-shading)
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="2000"
                        value={localConfig.interRowGapMm}
                        onChange={(e) =>
                          handleConfigChange('interRowGapMm', Number(e.target.value) || 0)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2000"
                    step="25"
                    value={localConfig.interRowGapMm}
                    onChange={(e) =>
                      handleConfigChange('interRowGapMm', Number(e.target.value))
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 mm (Flush)</span>
                    <span>450 mm (Optimal)</span>
                    <span>2000 mm</span>
                  </div>
                </div>

                {/* 3. Fabrication clearance at structure edges (0–500 mm) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">3. Fabrication Clearance</span>
                      <span className="text-[10.5px] text-slate-400">
                        Rail overhang & purlin edge margin
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="500"
                        value={localConfig.fabricationEdgeClearanceMm}
                        onChange={(e) =>
                          handleConfigChange(
                            'fabricationEdgeClearanceMm',
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={localConfig.fabricationEdgeClearanceMm}
                    onChange={(e) =>
                      handleConfigChange(
                        'fabricationEdgeClearanceMm',
                        Number(e.target.value)
                      )
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 mm</span>
                    <span>100 mm (Standard)</span>
                    <span>500 mm</span>
                  </div>
                </div>

                {/* 4. Walkway width (0–1500 mm) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">4. Walkway Width</span>
                      <span className="text-[10.5px] text-slate-400">
                        Cleaning & safety maintenance corridor
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="1500"
                        value={localConfig.walkwayWidthMm}
                        onChange={(e) =>
                          handleConfigChange('walkwayWidthMm', Number(e.target.value) || 0)
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1500"
                    step="50"
                    value={localConfig.walkwayWidthMm}
                    onChange={(e) =>
                      handleConfigChange('walkwayWidthMm', Number(e.target.value))
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[10.5px] text-slate-400 pt-1">
                    <span>Insert Walkway:</span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4].map((freq) => (
                        <button
                          key={freq}
                          onClick={() => handleConfigChange('walkwayFrequencyRows', freq)}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            localConfig.walkwayFrequencyRows === freq
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          Every {freq} rows
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 5. Roof boundary clearance (0–1500 mm) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">5. Roof Boundary Clearance</span>
                      <span className="text-[10.5px] text-slate-400">
                        Parapet & perimeter wind/fire setback
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="1500"
                        value={localConfig.roofBoundaryClearanceMm}
                        onChange={(e) =>
                          handleConfigChange(
                            'roofBoundaryClearanceMm',
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1500"
                    step="50"
                    value={localConfig.roofBoundaryClearanceMm}
                    onChange={(e) =>
                      handleConfigChange(
                        'roofBoundaryClearanceMm',
                        Number(e.target.value)
                      )
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 mm</span>
                    <span>500 mm (Standard)</span>
                    <span>1500 mm</span>
                  </div>
                </div>

                {/* 6. Obstacle clearance (0–2000 mm) */}
                <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-white block">6. Obstacle Clearance</span>
                      <span className="text-[10.5px] text-slate-400">
                        Buffer around vents, tanks, mumty
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="2000"
                        value={localConfig.obstacleClearanceMm}
                        onChange={(e) =>
                          handleConfigChange(
                            'obstacleClearanceMm',
                            Number(e.target.value) || 0
                          )
                        }
                        className="w-16 px-2 py-1 rounded-lg bg-slate-850 border border-slate-700 text-amber-400 text-right font-mono font-bold text-xs"
                      />
                      <span className="text-[11px] text-slate-400">mm</span>
                    </div>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="2000"
                    step="50"
                    value={localConfig.obstacleClearanceMm}
                    onChange={(e) =>
                      handleConfigChange('obstacleClearanceMm', Number(e.target.value))
                    }
                    className="w-full accent-[#F97316] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>0 mm</span>
                    <span>500 mm (Standard)</span>
                    <span>2000 mm</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: OBSTACLES MANAGER */}
          {activeTab === 'obstacles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Rooftop Obstructions</h3>
                  <p className="text-xs text-slate-400">
                    Add architectural obstacles to automatically deduct shaded and unbuildable zones.
                  </p>
                </div>
              </div>

              {/* Quick Add Preset Buttons */}
              <div className="flex flex-wrap gap-2">
                {COMMON_ROOF_OBSTACLES.map((obs) => (
                  <button
                    key={obs.name}
                    onClick={() => handleAddPresetObstacle(obs)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-amber-400" />
                    <span>{obs.name} ({obs.widthM}m × {obs.lengthM}m)</span>
                  </button>
                ))}
              </div>

              {/* Active Obstacles List */}
              <div className="space-y-2">
                {(!localConfig.obstacles || localConfig.obstacles.length === 0) ? (
                  <div className="text-center py-8 text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
                    No obstacles defined. Tap any preset above to add water tanks, vents, or stair rooms.
                  </div>
                ) : (
                  localConfig.obstacles.map((obs) => (
                    <div
                      key={obs.id}
                      className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center">
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-xs text-white">{obs.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {obs.widthM}m × {obs.lengthM}m ({obs.areaM2} m²) • +{localConfig.obstacleClearanceMm}mm safety buffer
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRemoveObstacle(obs.id)}
                        className="p-2 text-slate-500 hover:text-red-400 transition cursor-pointer"
                        title="Remove obstacle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-3.5 sm:px-5 py-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0 bg-slate-950">
          <button
            onClick={handleResetDefaults}
            className="text-xs text-slate-400 hover:text-slate-200 transition font-semibold cursor-pointer py-1"
          >
            Reset Defaults
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              className="px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl bg-[#FF6F00] hover:bg-[#F57C00] active:scale-[0.99] text-white text-xs font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Apply {layoutResult.panelsCount} Panels ({layoutResult.systemKw} kW)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
