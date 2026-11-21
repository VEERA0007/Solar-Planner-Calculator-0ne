import React, { useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Building,
  CheckCircle2,
  Cpu,
  Grid,
  Layers,
  ShieldAlert,
  Sliders,
  Sun,
  Wrench,
} from 'lucide-react';
import {
  ALBEDO_PRESETS,
  AnnualSimulationSummary,
  HORIZON_PRESETS,
  InstantaneousShadingState,
  STRING_TOPOLOGY_INFO,
  SiteSimulationConfig,
  StringTopology,
  SunPoint,
  computeRowOffsetsAndWalkways,
} from '../utils/shadingSimulationEngine';
import { ShadowCalculationInputs, ShadowCalculationResults } from '../types/solar';
import { SiteMeasurements } from '../types/siteSurvey';
import { SunPathHorizonChart } from './SunPathHorizonChart';

interface PvSystEngineeringPanelProps {
  config: SiteSimulationConfig;
  instantState: InstantaneousShadingState;
  annualSummary: AnnualSimulationSummary;
  sunPaths: {
    summerSolstice: SunPoint[];
    equinox: SunPoint[];
    winterSolstice: SunPoint[];
    hourlyCurves: { hour: number; points: SunPoint[] }[];
  };
  measurements: SiteMeasurements;
  onUpdateMeasurements: (patch: Partial<SiteMeasurements>) => void;
  tiltDeg: number;
  onChangeTilt: (v: number) => void;
  azimuthCompassDeg: number;
  onChangeAzimuth: (v: number) => void;
  collectorWidthM: number;
  onChangeCollectorWidth: (v: number) => void;
  rowPitchM: number;
  onChangeRowPitch: (v: number) => void;
  numRows: number;
  onChangeNumRows: (v: number) => void;
  arrayWidthM: number;
  onChangeArrayWidth: (v: number) => void;
  stringTopology: StringTopology;
  onChangeStringTopology: (v: StringTopology) => void;
  albedo: number;
  onChangeAlbedo: (v: number) => void;
  onApplyHorizonPreset: (profile: number[]) => void;
  onUpdateHorizonPoint: (idx: number, elevDeg: number) => void;
  setbackInputs: ShadowCalculationInputs;
  onUpdateSetbackInputs: (patch: Partial<ShadowCalculationInputs>) => void;
  setbackResults: ShadowCalculationResults;
  onProceedToInspection: () => void;
}

export const PvSystEngineeringPanel: React.FC<PvSystEngineeringPanelProps> = ({
  config,
  instantState,
  annualSummary,
  sunPaths,
  measurements,
  onUpdateMeasurements,
  tiltDeg,
  onChangeTilt,
  azimuthCompassDeg,
  onChangeAzimuth,
  collectorWidthM,
  onChangeCollectorWidth,
  rowPitchM,
  onChangeRowPitch,
  numRows,
  onChangeNumRows,
  arrayWidthM,
  onChangeArrayWidth,
  stringTopology,
  onChangeStringTopology,
  albedo,
  onChangeAlbedo,
  onApplyHorizonPreset,
  onUpdateHorizonPoint,
  setbackInputs,
  onUpdateSetbackInputs,
  setbackResults,
  onProceedToInspection,
}) => {
  const [pvsystTab, setPvsystTab] = useState<'structure' | 'module' | 'optics' | 'losses'>(
    'structure'
  );
  const [showIsoOverlay, setShowIsoOverlay] = useState<boolean>(true);
  const [matrixMode, setMatrixMode] = useState<'loss' | 'factor'>('loss');

  const rowLayout = computeRowOffsetsAndWalkways(config);

  // Module count & kWp estimation from array geometry (portrait ~1.134m pitch)
  const modulesAcross = Math.max(1, Math.floor(arrayWidthM / 1.14));
  const modulesPerStack = Math.max(1, Math.round(collectorWidthM / 2.2));
  const totalModules = modulesAcross * modulesPerStack * numRows;
  const totalDcKwP = Number(((totalModules * measurements.moduleWp) / 1000).toFixed(2));
  const performanceRatio = Number(
    (0.84 * (annualSummary.shadingRetentionPct / 100) * (1 - annualSummary.iamLossPct / 100)).toFixed(3)
  );
  const specificYieldKwhPerKwp = Math.round(annualSummary.effectivePoaKwhM2 * 0.855);
  const annualYieldMwh = Number(((totalDcKwP * specificYieldKwhPerKwp) / 1000).toFixed(2));

  // Setback SVG sizing
  const svgWidth = 360;
  const svgHeight = 190;
  const groundY = 152;
  const obstacleX = 108;
  const scale = 20;
  const obsH_px = Math.min(setbackInputs.obstacleHeight * scale, 110);
  const dist_px = Math.min(setbackInputs.obstacleDistance * scale, 195);
  const panelX = obstacleX + dist_px;
  const shadowL_px = Math.min(setbackResults.estimatedShadowLengthMeters * scale, 225);

  return (
    <div className="space-y-4">
      {/* PVsyst Workbench Header Strip */}
      <div className="bg-slate-900 text-white rounded-3xl p-4 border border-slate-700/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
              PVsyst Engineering Engine · Structure, Module &amp; Optics
            </div>
            <h3 className="text-sm font-extrabold mt-0.5">
              {totalDcKwP} kWp ({totalModules} × {measurements.moduleWp} Wp) · PR {(performanceRatio * 100).toFixed(1)}%
            </h3>
          </div>
          <button
            type="button"
            onClick={onProceedToInspection}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer shrink-0"
          >
            Run Inspection →
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-center font-mono">
          <div className="p-2 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span className="block text-[9.5px] text-slate-400">Eff. POA</span>
            <span className="text-xs sm:text-sm font-black text-sky-400">
              {annualSummary.effectivePoaKwhM2}
            </span>
            <span className="block text-[9px] text-slate-500">kWh/m²/yr</span>
          </div>
          <div className="p-2 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span className="block text-[9.5px] text-slate-400">Spec. Yield</span>
            <span className="text-xs sm:text-sm font-black text-emerald-400">
              {specificYieldKwhPerKwp}
            </span>
            <span className="block text-[9px] text-slate-500">kWh/kWp</span>
          </div>
          <div className="p-2 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span className="block text-[9.5px] text-slate-400">Annual Gen</span>
            <span className="text-xs sm:text-sm font-black text-amber-400">
              {annualYieldMwh}
            </span>
            <span className="block text-[9px] text-slate-500">MWh/yr</span>
          </div>
          <div className="p-2 rounded-2xl bg-slate-800/80 border border-slate-700">
            <span className="block text-[9.5px] text-slate-400">Walkways</span>
            <span className="text-xs sm:text-sm font-black text-purple-300">
              {rowLayout.walkwayAisles.length} × {measurements.walkwayWidthM}m
            </span>
            <span className="block text-[9px] text-slate-500">O&amp;M Built-In</span>
          </div>
        </div>
      </div>

      {/* PVsyst Sub-Module Selector */}
      <div className="grid grid-cols-4 gap-1 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl text-[11px] font-bold">
        {(
          [
            { id: 'structure', label: 'Structure', icon: Wrench },
            { id: 'module', label: 'Module', icon: Cpu },
            { id: 'optics', label: 'Optics', icon: Sun },
            { id: 'losses', label: 'Loss Table', icon: BarChart3 },
          ] as Array<{ id: typeof pvsystTab; label: string; icon: React.ComponentType<{ className?: string }> }>
        ).map((tab) => {
          const Icon = tab.icon;
          const active = pvsystTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setPvsystTab(tab.id)}
              className={`py-2 px-1 rounded-xl flex flex-col items-center justify-center gap-0.5 transition cursor-pointer ${
                active
                  ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate max-w-full">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: STRUCTURE, MMS, WALKWAYS & INTER-ROW SETBACK */}
      {pvsystTab === 'structure' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-[#FF6F00]" />
                  <span>MMS Structure &amp; Shed Geometry</span>
                </h3>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Tilt β, Azimuth, Row Pitch, GCR {(annualSummary.gcr * 100).toFixed(0)}% &amp; In-Built O&amp;M Walkways
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeRowPitch(annualSummary.optimalPitchWinterDegM)}
                className="px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-[10.5px] font-bold text-[#FF6F00] cursor-pointer"
              >
                Optimal ({annualSummary.optimalPitchWinterDegM}m)
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span>Tilt Angle (β)</span>
                  <span className="font-mono text-[#FF6F00]">{tiltDeg}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="1"
                  value={tiltDeg}
                  onChange={(e) => onChangeTilt(parseInt(e.target.value, 10))}
                  className="w-full accent-[#FF6F00] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between font-bold mb-1">
                  <span>Azimuth</span>
                  <span className="font-mono text-sky-600 dark:text-sky-400">{azimuthCompassDeg}°</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="355"
                  step="5"
                  value={azimuthCompassDeg}
                  onChange={(e) => onChangeAzimuth(parseInt(e.target.value, 10))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Shed Slant L (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="10"
                  value={collectorWidthM}
                  onChange={(e) =>
                    onChangeCollectorWidth(Math.max(1, parseFloat(e.target.value) || 2.28))
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Row Pitch D (m)</label>
                <input
                  type="number"
                  step="0.2"
                  min="1.5"
                  max="15"
                  value={rowPitchM}
                  onChange={(e) =>
                    onChangeRowPitch(Math.max(1.5, parseFloat(e.target.value) || 4.2))
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Sheds / Rows</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="20"
                  value={numRows}
                  onChange={(e) => onChangeNumRows(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Array Width (m)</label>
                <input
                  type="number"
                  step="0.5"
                  min="2"
                  max="40"
                  value={arrayWidthM}
                  onChange={(e) =>
                    onChangeArrayWidth(Math.max(2, parseFloat(e.target.value) || 8))
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Walkway Width (m)</label>
                <input
                  type="number"
                  step="0.05"
                  min="0"
                  max="2.5"
                  value={measurements.walkwayWidthM}
                  onChange={(e) =>
                    onUpdateMeasurements({
                      walkwayWidthM: Math.max(0, parseFloat(e.target.value) || 0),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-1">Perimeter Setback (m)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.3"
                  max="3"
                  value={measurements.perimeterSetbackM}
                  onChange={(e) =>
                    onUpdateMeasurements({
                      perimeterSetbackM: Math.max(0.3, parseFloat(e.target.value) || 0.6),
                    })
                  }
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-1 text-center text-xs">
              <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <span className="block text-[10px] text-slate-500">Limit Angle</span>
                <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">
                  {annualSummary.rowShadingLimitAngleDeg}°
                </span>
              </div>
              <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <span className="block text-[10px] text-slate-500">Eff. Pitch</span>
                <span className="font-mono font-black text-slate-900 dark:text-white">
                  {rowLayout.effectivePitchM} m
                </span>
              </div>
              <div className="p-2 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
                <span className="block text-[10px] text-slate-500">N–S Footprint</span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400">
                  {rowLayout.totalNorthSouthSpanM} m
                </span>
              </div>
            </div>
          </div>

          {/* Obstacle Setback Ray & Clearance Model */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div
              className={`rounded-2xl p-3 border flex items-start gap-2.5 ${
                setbackResults.shadingRiskLevel === 'LOW_CLEAR'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50 text-emerald-950 dark:text-emerald-200'
                  : setbackResults.shadingRiskLevel === 'MODERATE_MORNING_EVENING'
                  ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/50 text-amber-950 dark:text-amber-200'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/50 text-red-950 dark:text-red-200'
              }`}
            >
              {setbackResults.shadingRiskLevel === 'LOW_CLEAR' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : setbackResults.shadingRiskLevel === 'MODERATE_MORNING_EVENING' ? (
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              )}
              <div className="text-xs">
                <div className="font-extrabold">
                  Min Setback: {setbackResults.minRecommendedClearanceMeters} m · Shadow: {setbackResults.estimatedShadowLengthMeters} m
                </div>
                <p className="text-[11px] opacity-90 mt-0.5">{setbackResults.shadingRiskMessage}</p>
              </div>
            </div>

            <div className="w-full bg-slate-950 rounded-2xl border border-slate-800 p-2 flex justify-center">
              <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full max-w-[400px] h-44 select-none">
                <line x1="20" y1={groundY} x2={svgWidth - 20} y2={groundY} stroke="#64748b" strokeWidth="2" />
                <line
                  x1={obstacleX - 38}
                  y1={Math.max(15, groundY - obsH_px - 28)}
                  x2={obstacleX + shadowL_px}
                  y2={groundY}
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                <rect
                  x={obstacleX - 20}
                  y={groundY - obsH_px}
                  width="40"
                  height={obsH_px}
                  fill="#475569"
                  stroke="#94a3b8"
                  strokeWidth="1.2"
                  rx="3"
                />
                <text x={obstacleX} y={groundY - obsH_px - 6} fontSize="8.5" fill="#cbd5e1" textAnchor="middle">
                  {setbackInputs.obstacleType} ({setbackInputs.obstacleHeight}m)
                </text>
                <rect x={obstacleX} y={groundY} width={shadowL_px} height="4.5" fill="#a855f7" rx="2" />
                <line x1={panelX} y1={groundY} x2={panelX + 30} y2={groundY - 14} stroke="#38bdf8" strokeWidth="4" strokeLinecap="round" />
                <text x={panelX + 15} y={groundY + 14} fontSize="8" fill="#38bdf8" textAnchor="middle">
                  Array ({setbackInputs.obstacleDistance}m)
                </text>
              </svg>
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <div className="flex justify-between text-[10.5px] font-bold mb-1">
                  <span>Obstacle Height</span>
                  <span className="font-mono">{setbackInputs.obstacleHeight}m</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="8"
                  step="0.2"
                  value={setbackInputs.obstacleHeight}
                  onChange={(e) =>
                    onUpdateSetbackInputs({ obstacleHeight: parseFloat(e.target.value) })
                  }
                  className="w-full accent-purple-600 cursor-pointer"
                />
              </div>
              <div>
                <div className="flex justify-between text-[10.5px] font-bold mb-1">
                  <span>Distance to Array</span>
                  <span className="font-mono">{setbackInputs.obstacleDistance}m</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.2"
                  value={setbackInputs.obstacleDistance}
                  onChange={(e) =>
                    onUpdateSetbackInputs({ obstacleDistance: parseFloat(e.target.value) })
                  }
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: STRUCTURE MODULE & STRING ELECTRICAL TOPOLOGY */}
      {pvsystTab === 'module' && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-sky-600" />
                <span>PV Module &amp; String Bypass Architecture</span>
              </h3>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                Configure module rating &amp; cell-substring bypass behavior under near shading
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[450, 540, 550, 585].map((wp) => (
              <button
                key={wp}
                type="button"
                onClick={() => onUpdateMeasurements({ moduleWp: wp })}
                className={`py-2 px-3 rounded-xl font-bold border cursor-pointer transition ${
                  measurements.moduleWp === wp
                    ? 'bg-[#FF6F00] text-white border-[#FF6F00]'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                }`}
              >
                {wp} Wp Class
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
              <span className="block text-[10px] text-slate-500">Module Array</span>
              <span className="font-mono font-black text-slate-900 dark:text-white">
                {modulesAcross} × {numRows} rows ({totalModules} mods)
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
              <span className="block text-[10px] text-slate-500">DC Capacity</span>
              <span className="font-mono font-black text-sky-600 dark:text-sky-400">
                {totalDcKwP} kWp
              </span>
            </div>
            <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60">
              <span className="block text-[10px] text-slate-500">String Mismatch</span>
              <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                -{annualSummary.electricalMismatchLossPct}% / yr
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.keys(STRING_TOPOLOGY_INFO) as StringTopology[]).map((key) => {
              const info = STRING_TOPOLOGY_INFO[key];
              const active = stringTopology === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onChangeStringTopology(key)}
                  className={`p-3 rounded-2xl border text-left transition cursor-pointer ${
                    active
                      ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-950 dark:text-sky-100 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">{info.label}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-700">
                      {info.factor}×
                    </span>
                  </div>
                  <p className="text-[11px] opacity-80 mt-1 leading-snug">{info.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: OPTICS, ALBEDO, FAR HORIZON & ISO-SHADE SUN PATH */}
      {pvsystTab === 'optics' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                  Sun-Path Iso-Shading &amp; Far Horizon
                </h3>
                <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                  Sky View Factor: {annualSummary.diffuseSkyViewFactor} · IAM Loss: -{annualSummary.iamLossPct}% (b₀=0.05)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIsoOverlay((v) => !v)}
                className={`px-2.5 py-1 rounded-xl text-[10.5px] font-bold border cursor-pointer ${
                  showIsoOverlay
                    ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-300 text-[#FF6F00]'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200'
                }`}
              >
                {showIsoOverlay ? 'Iso-Shade On' : 'Iso-Shade Off'}
              </button>
            </div>

            <SunPathHorizonChart
              config={config}
              sunPaths={sunPaths}
              currentSunAltDeg={instantState.sunAltitudeDeg}
              currentSunAzSouthDeg={instantState.sunAzimuthSouthDeg}
              onUpdateHorizonPoint={onUpdateHorizonPoint}
              showIsoShadingOverlay={showIsoOverlay}
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {(Object.keys(HORIZON_PRESETS) as Array<keyof typeof HORIZON_PRESETS>).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => onApplyHorizonPreset([...HORIZON_PRESETS[key].profile])}
                  className="py-1.5 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10.5px] font-bold text-slate-700 dark:text-slate-200 cursor-pointer truncate"
                >
                  {HORIZON_PRESETS[key].label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-slate-800 dark:text-slate-200">
                Ground Surface Optical Albedo (ρ)
              </span>
              <span className="font-mono text-[#FF6F00]">{albedo.toFixed(2)}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {ALBEDO_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => onChangeAlbedo(preset.value)}
                  className={`py-2 px-2.5 rounded-xl text-[10.5px] font-bold border cursor-pointer transition ${
                    Math.abs(albedo - preset.value) < 0.01
                      ? 'bg-amber-500 text-slate-950 border-amber-500'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  {preset.label} ({preset.value})
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 4: COMPLETE PVSYST LOSS WATERFALL, FACTOR MATRIX & MONTHLY TABLE */}
      {pvsystTab === 'losses' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              PVsyst Annual Optical &amp; Shading Loss Diagram
            </h3>
            <div className="space-y-2 text-xs">
              {[
                {
                  label: 'Horizontal Global Irradiance (GHI)',
                  val: `${annualSummary.annualGhiKwhM2.toLocaleString()} kWh/m²`,
                  pct: 'Baseline',
                  color: 'bg-slate-500',
                  width: 88,
                },
                {
                  label: 'Global Incident on Collector Plane (POA)',
                  val: `${annualSummary.annualPoaUnshadedKwhM2.toLocaleString()} kWh/m²`,
                  pct: `TF ${annualSummary.transpositionFactor}×`,
                  color: 'bg-sky-500',
                  width: 100,
                },
                {
                  label: 'IAM Optical Reflection (b₀=0.05)',
                  val: `-${annualSummary.iamLossPct}%`,
                  pct: 'Optics',
                  color: 'bg-amber-400',
                  width: Math.max(4, Math.min(40, annualSummary.iamLossPct * 2.5)),
                },
                {
                  label: 'Far Horizon Shading (Beam + Diffuse)',
                  val: `-${(annualSummary.farBeamLossPct + annualSummary.farDiffuseLossPct).toFixed(1)}%`,
                  pct: 'Horizon',
                  color: 'bg-red-500',
                  width: Math.max(
                    4,
                    Math.min(50, (annualSummary.farBeamLossPct + annualSummary.farDiffuseLossPct) * 3)
                  ),
                },
                {
                  label: 'Near Shading — Beam Linear',
                  val: `-${annualSummary.nearBeamLinearLossPct}%`,
                  pct: '3D Scenes',
                  color: 'bg-purple-500',
                  width: Math.max(4, Math.min(50, annualSummary.nearBeamLinearLossPct * 3)),
                },
                {
                  label: 'Electrical String Mismatch Loss',
                  val: `-${annualSummary.electricalMismatchLossPct}%`,
                  pct: STRING_TOPOLOGY_INFO[stringTopology].short,
                  color: 'bg-rose-500',
                  width: Math.max(4, Math.min(50, annualSummary.electricalMismatchLossPct * 3)),
                },
                {
                  label: 'Effective Global on Collectors',
                  val: `${annualSummary.effectivePoaKwhM2.toLocaleString()} kWh/m²`,
                  pct: `${annualSummary.shadingRetentionPct}% Retained`,
                  color: 'bg-emerald-500',
                  width: Math.max(20, annualSummary.shadingRetentionPct),
                },
              ].map((row, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {row.label}
                    </span>
                    <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                      <span className="text-[10px] text-slate-400">{row.pct}</span>
                      <span className="font-bold text-slate-900 dark:text-white">{row.val}</span>
                    </div>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.width}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Grid className="w-4 h-4 text-purple-500" />
                <span>PVsyst Shading Factor Table (Alt × Az)</span>
              </h3>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setMatrixMode('loss')}
                  className={`px-2 py-1 rounded-lg cursor-pointer ${
                    matrixMode === 'loss' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  Loss %
                </button>
                <button
                  type="button"
                  onClick={() => setMatrixMode('factor')}
                  className={`px-2 py-1 rounded-lg cursor-pointer ${
                    matrixMode === 'factor' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500'
                  }`}
                >
                  Factor
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px] font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-1.5 px-1 text-left">Alt\Az</th>
                    {annualSummary.matrixAzimuths.map((az) => (
                      <th key={az} className="py-1.5 px-1 text-center">
                        {az > 0 ? `+${az}°` : `${az}°`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...annualSummary.matrixElevations].reverse().map((elev) => {
                    const rowIdx = annualSummary.matrixElevations.indexOf(elev);
                    const row = annualSummary.shadingMatrix[rowIdx];
                    return (
                      <tr key={elev} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="py-1.5 px-1 font-bold">{elev}°</td>
                        {row.map((cell) => {
                          const loss = cell.electricalLossPct;
                          const bgClass =
                            loss >= 50
                              ? 'bg-red-500/25 text-red-700 dark:text-red-300 font-bold'
                              : loss >= 20
                              ? 'bg-orange-500/20 text-orange-700 dark:text-orange-300 font-bold'
                              : loss >= 5
                              ? 'bg-amber-400/20 text-amber-800 dark:text-amber-300'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
                          return (
                            <td key={cell.azimuthRelSouthDeg} className={`py-1.5 px-1 text-center rounded-sm ${bgClass}`}>
                              {matrixMode === 'loss' ? `${loss}%` : cell.retainedFactor.toFixed(2)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Monthly Effective POA &amp; Shading Loss (Jan–Dec)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-200 dark:border-slate-800 text-[10px]">
                    <th className="py-1.5 text-left">Month</th>
                    <th className="py-1.5 text-right">GHI</th>
                    <th className="py-1.5 text-right">POA</th>
                    <th className="py-1.5 text-right">Eff POA</th>
                    <th className="py-1.5 text-right">Shade Loss</th>
                  </tr>
                </thead>
                <tbody>
                  {annualSummary.monthlyRows.map((row) => (
                    <tr key={row.month} className="border-b border-slate-100 dark:border-slate-800/60">
                      <td className="py-1.5 font-sans font-bold text-slate-800 dark:text-slate-200">{row.month}</td>
                      <td className="py-1.5 text-right text-slate-500">{row.ghiKwhM2}</td>
                      <td className="py-1.5 text-right text-sky-600 dark:text-sky-400">{row.poaUnshadedKwhM2}</td>
                      <td className="py-1.5 text-right text-emerald-600 dark:text-emerald-400 font-bold">{row.effectivePoaKwhM2}</td>
                      <td className="py-1.5 text-right text-amber-600 dark:text-amber-400 font-bold">-{row.totalShadingLossPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
