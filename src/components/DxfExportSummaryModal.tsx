import React, { useMemo } from 'react';
import {
  CheckCircle2,
  Download,
  FileCode2,
  Layers,
  Sun,
  X,
  Zap,
} from 'lucide-react';
import { StandardizedDxfPayload, buildStandardizedDxf, downloadDxfFile } from '../utils/dxfExporter';
import { DxfYieldSummaryData } from '../utils/rooftopZoneClamper';

export interface DxfPreviewRequest {
  fileNameBase: string;
  payload: StandardizedDxfPayload;
  yieldSummary: DxfYieldSummaryData;
}

interface DxfExportSummaryModalProps {
  request: DxfPreviewRequest | null;
  onClose: () => void;
  onDownloaded?: (fileName: string) => void;
}

export const DxfExportSummaryModal: React.FC<DxfExportSummaryModalProps> = ({
  request,
  onClose,
  onDownloaded,
}) => {
  const svgGeometry = useMemo(() => {
    if (!request) return null;
    const { payload } = request;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const track = (pts?: Array<{ x: number; y: number }>) => {
      if (!pts) return;
      pts.forEach((p) => {
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      });
    };

    track(payload.buildingFootprintENU);
    (payload.roofBoundaries || []).forEach((rb) => {
      track(rb.boundaryENU);
      track(rb.setbackENU);
    });
    (payload.arraySegments || []).forEach((seg) => {
      track(seg.segmentCornersENU);
      seg.panelsCornersENU.forEach((cell) => track(cell));
    });
    (payload.shedRowsENU || []).forEach((r) => track(r.cornersENU));
    (payload.obstacles || []).forEach((o) => track(o.polygonENU));

    if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) {
      minX = -10;
      maxX = 10;
      minY = -10;
      maxY = 10;
    }

    const spanX = maxX - minX;
    const spanY = maxY - minY;
    const pad = Math.max(2, Math.max(spanX, spanY) * 0.14);
    const vbW = 360;
    const vbH = 220;
    const scale = Math.min((vbW - 28) / (spanX + pad * 2), (vbH - 28) / (spanY + pad * 2));
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const toSvgPt = (p: { x: number; y: number }) => ({
      sx: vbW / 2 + (p.x - midX) * scale,
      sy: vbH / 2 - (p.y - midY) * scale,
    });
    const toSvgPointsStr = (pts: Array<{ x: number; y: number }>) =>
      pts
        .map((p) => {
          const { sx, sy } = toSvgPt(p);
          return `${sx.toFixed(1)},${sy.toFixed(1)}`;
        })
        .join(' ');

    return {
      vbW,
      vbH,
      spanX: Number(spanX.toFixed(1)),
      spanY: Number(spanY.toFixed(1)),
      toSvgPointsStr,
    };
  }, [request]);

  if (!request || !svgGeometry) return null;

  const { payload, yieldSummary, fileNameBase } = request;
  const safeBase =
    (fileNameBase || 'solar_roof_cad')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase() || 'solar_roof_cad';
  const finalFileName = `${safeBase}.dxf`;

  const layerBadges = [
    { name: 'BUILDING_FOOTPRINT', count: payload.buildingFootprintENU.length >= 3 ? 1 : 0, color: 'text-slate-200 border-slate-600' },
    { name: 'ROOF_BOUNDARY', count: payload.roofBoundaries?.length ?? 0, color: 'text-amber-300 border-amber-700/60' },
    { name: 'ROOF_SETBACK', count: (payload.roofBoundaries || []).filter((b) => (b.setbackENU?.length ?? 0) >= 3).length, color: 'text-yellow-300 border-yellow-700/60' },
    {
      name: 'PV_MODULES',
      count:
        (payload.arraySegments || []).reduce((s, seg) => s + seg.panelsCornersENU.length, 0) +
        (payload.shedRowsENU?.length ?? 0),
      color: 'text-sky-300 border-sky-700/60',
    },
    { name: 'ROOF_OBSTACLES', count: payload.obstacles?.length ?? 0, color: 'text-rose-300 border-rose-700/60' },
    { name: 'OM_WALKWAYS', count: payload.walkways?.length ?? 0, color: 'text-emerald-300 border-emerald-700/60' },
  ].filter((l) => l.count > 0);

  const handleConfirm = () => {
    const dxf = buildStandardizedDxf(payload);
    downloadDxfFile(dxf, fileNameBase);
    onDownloaded?.(finalFileName);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[1500] bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dxf-summary-modal-title"
    >
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 py-3 bg-slate-950 text-white border-b border-slate-800 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3
              id="dxf-summary-modal-title"
              className="text-sm font-extrabold flex items-center gap-2 truncate"
            >
              <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>AutoCAD .DXF Layout &amp; Annual Yield Summary</span>
            </h3>
            <p className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
              {payload.siteName} · {payload.latitude.toFixed(5)}°, {payload.longitude.toFixed(5)}° ·{' '}
              {finalFileName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Close DXF export summary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-3.5">
          {/* Primary Yield Callout Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950 via-slate-900 to-sky-950 border border-emerald-600/40 text-white flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span>Total Projected Annual Yield (Current Rooftop Layout)</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2 font-mono tabular-nums">
                <span className="text-2xl sm:text-3xl font-black text-white">
                  {yieldSummary.projectedAnnualYieldKwh.toLocaleString()}
                </span>
                <span className="text-xs font-bold text-emerald-300">kWh / year</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-300 font-mono tabular-nums flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <span>Avg {yieldSummary.monthlyAverageKwh.toLocaleString()} kWh/mo</span>
                <span>· Specific Yield {yieldSummary.specificYieldKwhPerKwp.toLocaleString()} kWh/kWp</span>
                <span>· CO₂ Offset {yieldSummary.co2OffsetTonnesYr} t/yr</span>
              </div>
            </div>

            <div className="text-right font-mono tabular-nums bg-slate-950/70 px-3 py-2 rounded-xl border border-slate-700/80">
              <div className="text-[10px] text-slate-400 uppercase font-bold">DC Array Size</div>
              <div className="text-lg font-black text-sky-400">{yieldSummary.totalCapacityKw} kWp</div>
              <div className="text-[10.5px] text-slate-200 font-bold">
                {yieldSummary.totalPanels} × {yieldSummary.panelWattage}W ({yieldSummary.orientationLabel})
              </div>
            </div>
          </div>

          {/* 4-Metric Engineering Spec Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono tabular-nums">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400">
                Effective POA
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                {yieldSummary.effectivePoaKwhM2.toLocaleString()} kWh/m²
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400">
                Solar Retention
              </div>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" />
                <span>{yieldSummary.shadingRetentionPct}%</span>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400">
                Building Footprint
              </div>
              <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
                {yieldSummary.grossRoofAreaSqM} m²
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
              <div className="text-[10px] font-sans font-bold text-slate-500 dark:text-slate-400">
                Array Segments
              </div>
              <div className="text-sm font-extrabold text-sky-600 dark:text-sky-400 mt-0.5">
                {yieldSummary.segmentsCount} Rooftop Bay{yieldSummary.segmentsCount === 1 ? '' : 's'}
              </div>
            </div>
          </div>

          {/* Live Vector Preview of Exported CAD Geometry */}
          <div className="rounded-2xl bg-[#091224] border border-slate-800 p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
              <span>AC1009 Vector Preview (Metric ENU · {svgGeometry.spanX}m × {svgGeometry.spanY}m)</span>
              <span className="text-amber-400">N ↑</span>
            </div>
            <svg
              viewBox={`0 0 ${svgGeometry.vbW} ${svgGeometry.vbH}`}
              className="w-full h-44 rounded-xl bg-[#050a14] border border-slate-800/80"
            >
              {/* Building Footprint */}
              {payload.buildingFootprintENU.length >= 3 && (
                <polygon
                  points={svgGeometry.toSvgPointsStr(payload.buildingFootprintENU)}
                  fill="rgba(30, 41, 59, 0.55)"
                  stroke="#f8fafc"
                  strokeWidth="1.5"
                />
              )}

              {/* Roof Boundaries & Setbacks */}
              {(payload.roofBoundaries || []).map((rb, idx) => (
                <g key={`dxf-prev-rb-${idx}`}>
                  {rb.boundaryENU.length >= 3 && (
                    <polygon
                      points={svgGeometry.toSvgPointsStr(rb.boundaryENU)}
                      fill="none"
                      stroke="#fb923c"
                      strokeWidth="1.2"
                    />
                  )}
                  {rb.setbackENU && rb.setbackENU.length >= 3 && (
                    <polygon
                      points={svgGeometry.toSvgPointsStr(rb.setbackENU)}
                      fill="none"
                      stroke="#eab308"
                      strokeWidth="1"
                      strokeDasharray="4 3"
                    />
                  )}
                </g>
              ))}

              {/* Walkways */}
              {(payload.walkways || []).map((wk, idx) => (
                <polygon
                  key={`dxf-prev-wk-${idx}`}
                  points={svgGeometry.toSvgPointsStr(wk.cornersENU)}
                  fill="rgba(16, 185, 129, 0.25)"
                  stroke="#34d399"
                  strokeWidth="0.8"
                />
              ))}

              {/* Shed Rows fallback */}
              {(payload.shedRowsENU || []).map((row, idx) => (
                <polygon
                  key={`dxf-prev-row-${idx}`}
                  points={svgGeometry.toSvgPointsStr(row.cornersENU)}
                  fill="#0284c7"
                  fillOpacity="0.82"
                  stroke="#7dd3fc"
                  strokeWidth="0.9"
                />
              ))}

              {/* Array Segments & Packed 550W Modules */}
              {(payload.arraySegments || []).map((seg, sIdx) => (
                <g key={`dxf-prev-seg-${sIdx}`}>
                  {seg.segmentCornersENU.length >= 3 && (
                    <polygon
                      points={svgGeometry.toSvgPointsStr(seg.segmentCornersENU)}
                      fill="rgba(6, 182, 212, 0.14)"
                      stroke="#22d3ee"
                      strokeWidth="1"
                      strokeDasharray="3 2"
                    />
                  )}
                  {seg.panelsCornersENU.map((cell, cIdx) => (
                    <polygon
                      key={`dxf-prev-cell-${sIdx}-${cIdx}`}
                      points={svgGeometry.toSvgPointsStr(cell)}
                      fill="#0284c7"
                      fillOpacity="0.88"
                      stroke="#bae6fd"
                      strokeWidth="0.45"
                    />
                  ))}
                </g>
              ))}

              {/* Obstacles */}
              {(payload.obstacles || []).map((obs, idx) => (
                <polygon
                  key={`dxf-prev-obs-${idx}`}
                  points={svgGeometry.toSvgPointsStr(obs.polygonENU)}
                  fill="rgba(244, 63, 94, 0.45)"
                  stroke="#fb7185"
                  strokeWidth="0.9"
                />
              ))}
            </svg>
          </div>

          {/* Included Standardized Layers */}
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-sky-500" />
              <span>Included AutoCAD R12 (AC1009) Layers</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {layerBadges.map((lyr) => (
                <span
                  key={lyr.name}
                  className={`px-2 py-0.5 rounded-lg bg-slate-900 border text-[10px] font-mono font-bold inline-flex items-center gap-1 ${lyr.color}`}
                >
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>{lyr.name}</span>
                  <span className="text-slate-400">({lyr.count})</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download {finalFileName}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
