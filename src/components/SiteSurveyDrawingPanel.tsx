import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Camera,
  Compass,
  Image as ImageIcon,
  Layers,
  MapPin,
  Navigation,
  Ruler,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  RoofStructureType,
  SiteMeasurements,
  SiteMediaAsset,
  UploadedDrawingOverlay,
} from '../types/siteSurvey';

interface SiteSurveyDrawingPanelProps {
  siteLocationName: string;
  siteLat: number;
  siteLon: number;
  latStr: string;
  lonStr: string;
  elevStr: string;
  tzStr: string;
  onChangeLatStr: (val: string) => void;
  onChangeLonStr: (val: string) => void;
  onChangeElevStr: (val: string) => void;
  onChangeTzStr: (val: string) => void;
  onApplyCoordinates: (lat: number, lon: number) => void;
  onSyncGps: () => void;
  isDetectingGps: boolean;
  isFetchingSiteData: boolean;
  mediaAssets: SiteMediaAsset[];
  onAddMediaAssets: (items: SiteMediaAsset[]) => void;
  onUpdateMediaAsset: (id: string, patch: Partial<SiteMediaAsset>) => void;
  onRemoveMediaAsset: (id: string) => void;
  activeDrawingId: string | null;
  onSelectActiveDrawing: (id: string | null) => void;
  drawingOverlay: UploadedDrawingOverlay | null;
  onUpdateDrawingOverlay: (patch: Partial<UploadedDrawingOverlay>) => void;
  measurements: SiteMeasurements;
  onUpdateMeasurements: (patch: Partial<SiteMeasurements>) => void;
  onProceedToRoofPolygon?: () => void;
  onProceedToCad2D?: () => void;
  onProceedToAutoCad3D?: () => void;
  onProceedToR3FOverlay?: () => void;
  onNextStep?: () => void;
}

export const SiteSurveyDrawingPanel: React.FC<SiteSurveyDrawingPanelProps> = ({
  siteLocationName,
  siteLat,
  siteLon,
  latStr,
  lonStr,
  elevStr,
  tzStr,
  onChangeLatStr,
  onChangeLonStr,
  onChangeElevStr,
  onChangeTzStr,
  onApplyCoordinates,
  onSyncGps,
  isDetectingGps,
  isFetchingSiteData,
  mediaAssets,
  onAddMediaAssets,
  onUpdateMediaAsset,
  onRemoveMediaAsset,
  activeDrawingId,
  onSelectActiveDrawing,
  drawingOverlay,
  onUpdateDrawingOverlay,
  measurements,
  onUpdateMeasurements,
  onProceedToRoofPolygon,
  onProceedToCad2D,
  onProceedToAutoCad3D,
  onProceedToR3FOverlay,
  onNextStep,
}) => {
  const drawingInputRef = useRef<HTMLInputElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);

  const [calibratingStep, setCalibratingStep] = useState<'idle' | 'pick_a' | 'pick_b'>('idle');
  const [knownMetersStr, setKnownMetersStr] = useState<string>(
    () => String(measurements.roofLengthM || 12)
  );
  const [videoAzimuthDeg, setVideoAzimuthDeg] = useState<number>(180);

  const drawings = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'drawing'),
    [mediaAssets]
  );
  const photos = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'photo'),
    [mediaAssets]
  );
  const videos360 = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'video360'),
    [mediaAssets]
  );

  const activeDrawing = useMemo(
    () =>
      drawings.find((d) => d.id === activeDrawingId) ||
      drawings[0] ||
      null,
    [activeDrawingId, drawings]
  );

  const handleFilesSelected = (
    files: FileList | null,
    kind: SiteMediaAsset['kind']
  ) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const id = `media-${kind}-${Date.now()}-${idx}`;
      if (kind === 'video360') {
        onAddMediaAssets([
          {
            id,
            kind,
            name: file.name,
            url,
            mimeType: file.type || 'video/mp4',
            addedAtIso: new Date().toISOString(),
          },
        ]);
      } else {
        const img = new Image();
        img.onload = () => {
          const nw = img.naturalWidth || 1200;
          const nh = img.naturalHeight || 900;
          const aspect = nw / Math.max(1, nh);
          const spanW = measurements.roofLengthM || 16;
          const spanH = Number((spanW / Math.max(0.3, aspect)).toFixed(1));
          const asset: SiteMediaAsset = {
            id,
            kind,
            name: file.name,
            url,
            mimeType: file.type || 'image/png',
            addedAtIso: new Date().toISOString(),
            naturalWidth: nw,
            naturalHeight: nh,
            estimatedSpanWidthM: spanW,
            estimatedSpanHeightM: spanH,
          };
          onAddMediaAssets([asset]);
          if (kind === 'drawing') {
            onSelectActiveDrawing(id);
            onUpdateDrawingOverlay({
              url,
              name: file.name,
              widthM: spanW,
              depthM: spanH,
              visible: true,
            });
          }
        };
        img.onerror = () => {
          onAddMediaAssets([
            {
              id,
              kind,
              name: file.name,
              url,
              mimeType: file.type || 'image/png',
              addedAtIso: new Date().toISOString(),
            },
          ]);
        };
        img.src = url;
      }
    });
  };

  const handleDrawingClickForScale = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeDrawing || calibratingStep === 'idle') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const xNorm = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const yNorm = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const pt = { xNorm: Number(xNorm.toFixed(4)), yNorm: Number(yNorm.toFixed(4)) };

    if (calibratingStep === 'pick_a') {
      onUpdateMediaAsset(activeDrawing.id, { scalePointA: pt, scalePointB: undefined });
      setCalibratingStep('pick_b');
    } else if (calibratingStep === 'pick_b') {
      const pA = activeDrawing.scalePointA;
      if (!pA) {
        onUpdateMediaAsset(activeDrawing.id, { scalePointA: pt });
        return;
      }
      const nw = activeDrawing.naturalWidth || 1000;
      const nh = activeDrawing.naturalHeight || 750;
      const pxDist = Math.hypot((pt.xNorm - pA.xNorm) * nw, (pt.yNorm - pA.yNorm) * nh);
      const knownM = Math.max(0.5, parseFloat(knownMetersStr) || 10);
      const pxPerM = pxDist / knownM;
      const spanW = Number((nw / Math.max(1, pxPerM)).toFixed(1));
      const spanH = Number((nh / Math.max(1, pxPerM)).toFixed(1));

      onUpdateMediaAsset(activeDrawing.id, {
        scalePointB: pt,
        knownDistanceM: knownM,
        calibratedPxPerMeter: Number(pxPerM.toFixed(1)),
        estimatedSpanWidthM: spanW,
        estimatedSpanHeightM: spanH,
      });
      onUpdateDrawingOverlay({
        url: activeDrawing.url,
        name: activeDrawing.name,
        widthM: spanW,
        depthM: spanH,
        visible: true,
      });
      onUpdateMeasurements({
        roofLengthM: Math.max(4, Math.min(80, spanW)),
        roofWidthM: Math.max(4, Math.min(80, spanH)),
      });
      setCalibratingStep('idle');
    }
  };

  return (
    <div className="space-y-4">
      {/* Step 1: GPS Location Auto-Sync & Exact Coordinates */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#FF6F00] shrink-0" />
              <span>1. Site Coordinates &amp; GPS Survey Lock</span>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {isFetchingSiteData
                ? 'Syncing elevation & ephemeris...'
                : `${siteLocationName} · ${siteLat.toFixed(5)}°, ${siteLon.toFixed(5)}°`}
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncGps}
            disabled={isDetectingGps}
            className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-60"
          >
            <Navigation className="w-3.5 h-3.5" />
            <span>{isDetectingGps ? 'Syncing...' : 'Auto GPS Sync'}</span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const lt = parseFloat(latStr);
            const ln = parseFloat(lonStr);
            if (!isNaN(lt) && !isNaN(ln)) {
              onApplyCoordinates(lt, ln);
            }
          }}
          className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs items-end"
        >
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Latitude (°)</label>
            <input
              type="text"
              inputMode="decimal"
              value={latStr}
              onChange={(e) => onChangeLatStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Longitude (°)</label>
            <input
              type="text"
              inputMode="decimal"
              value={lonStr}
              onChange={(e) => onChangeLonStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">Elevation (m)</label>
            <input
              type="number"
              value={elevStr}
              onChange={(e) => onChangeElevStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">UTC Offset</label>
            <input
              type="number"
              step="0.5"
              value={tzStr}
              onChange={(e) => onChangeTzStr(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
            />
          </div>
          <button
            type="submit"
            className="col-span-2 sm:col-span-1 py-2 px-3 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-[11px] font-bold cursor-pointer"
          >
            Lock Coords
          </button>
        </form>
      </div>

      {/* Step 2: Upload Site Drawings, 2D Photos & 360° Walkthrough Video */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Upload className="w-4 h-4 text-sky-600 shrink-0" />
            <span>2. Upload Site Drawing, 2D Images &amp; 360° Video</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Upload hand-measured site drawings, rooftop photos, or 360° video for 2D→3D AutoCAD design
          </p>
        </div>

        {/* Hidden Inputs */}
        <input
          ref={drawingInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files, 'drawing');
            e.target.value = '';
          }}
        />
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files, 'photo');
            e.target.value = '';
          }}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            handleFilesSelected(e.target.files, 'video360');
            e.target.value = '';
          }}
        />

        {/* 3 Upload Trigger Cards */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => drawingInputRef.current?.click()}
            className="p-3 rounded-2xl border border-dashed border-amber-400/80 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-left flex flex-col gap-1.5 cursor-pointer transition"
          >
            <Ruler className="w-4 h-4 text-[#FF6F00]" />
            <div className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">
              Drawing Plan
            </div>
            <div className="text-[9.5px] text-slate-500 dark:text-slate-400">
              {drawings.length > 0 ? `${drawings.length} uploaded` : 'Sketch / CAD image'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => photoInputRef.current?.click()}
            className="p-3 rounded-2xl border border-dashed border-sky-400/80 dark:border-sky-700 bg-sky-50/60 dark:bg-sky-950/20 hover:bg-sky-50 dark:hover:bg-sky-950/40 text-left flex flex-col gap-1.5 cursor-pointer transition"
          >
            <Camera className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <div className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">
              2D Site Photos
            </div>
            <div className="text-[9.5px] text-slate-500 dark:text-slate-400">
              {photos.length > 0 ? `${photos.length} photo(s)` : 'Walls, tanks, roof'}
            </div>
          </button>

          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            className="p-3 rounded-2xl border border-dashed border-purple-400/80 dark:border-purple-700 bg-purple-50/60 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/40 text-left flex flex-col gap-1.5 cursor-pointer transition"
          >
            <Video className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            <div className="text-[11px] font-bold text-slate-900 dark:text-white leading-tight">
              360° Site Video
            </div>
            <div className="text-[9.5px] text-slate-500 dark:text-slate-400">
              {videos360.length > 0 ? `${videos360.length} video(s)` : 'Panorama walkthrough'}
            </div>
          </button>
        </div>

        {/* Interactive Drawing Preview & 2-Point Pixel-to-Meter Scale Calibrator */}
        {activeDrawing && (
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-[#FF6F00] shrink-0" />
                  <span>{activeDrawing.name}</span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  {activeDrawing.calibratedPxPerMeter
                    ? `Calibrated: ${activeDrawing.calibratedPxPerMeter} px/m · Est. ${activeDrawing.estimatedSpanWidthM}m × ${activeDrawing.estimatedSpanHeightM}m`
                    : `Default Fit: ${drawingOverlay?.widthM ?? measurements.roofLengthM}m × ${drawingOverlay?.depthM ?? measurements.roofWidthM}m`}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {drawings.length > 1 && (
                  <select
                    value={activeDrawing.id}
                    onChange={(e) => {
                      const chosen = drawings.find((d) => d.id === e.target.value);
                      if (chosen) {
                        onSelectActiveDrawing(chosen.id);
                        onUpdateDrawingOverlay({
                          url: chosen.url,
                          name: chosen.name,
                          widthM: chosen.estimatedSpanWidthM ?? measurements.roofLengthM,
                          depthM: chosen.estimatedSpanHeightM ?? measurements.roofWidthM,
                          visible: true,
                        });
                      }
                    }}
                    className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold"
                  >
                    {drawings.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => onRemoveMediaAsset(activeDrawing.id)}
                  className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  title="Remove drawing"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Calibration Controls */}
            <div className="flex flex-wrap items-center gap-2 text-[10.5px]">
              <div className="flex items-center gap-1 bg-white dark:bg-slate-900 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="text-slate-500 font-semibold">Known Span (m):</span>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  value={knownMetersStr}
                  onChange={(e) => setKnownMetersStr(e.target.value)}
                  className="w-14 font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  setCalibratingStep(calibratingStep === 'idle' ? 'pick_a' : 'idle')
                }
                className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer transition ${
                  calibratingStep !== 'idle'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-900 dark:bg-slate-700 text-white'
                }`}
              >
                <Ruler className="w-3 h-3" />
                <span>
                  {calibratingStep === 'pick_a'
                    ? 'Tap Start Point on Drawing...'
                    : calibratingStep === 'pick_b'
                    ? 'Tap End Point on Drawing...'
                    : '2-Point Scale Calibrate'}
                </span>
              </button>

              {drawingOverlay && (
                <label className="flex items-center gap-1.5 ml-auto font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={drawingOverlay.visible}
                    onChange={(e) => onUpdateDrawingOverlay({ visible: e.target.checked })}
                    className="accent-[#FF6F00]"
                  />
                  <span>Project onto 2D &amp; 3D CAD</span>
                </label>
              )}
            </div>

            {/* Interactive Drawing Image Surface */}
            <div
              onClick={handleDrawingClickForScale}
              className={`relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-950 max-h-56 flex items-center justify-center ${
                calibratingStep !== 'idle' ? 'cursor-crosshair ring-2 ring-amber-400' : ''
              }`}
            >
              <img
                src={activeDrawing.url}
                alt={activeDrawing.name}
                className="max-h-56 w-auto object-contain select-none"
              />

              {/* Visual calibration markers */}
              {activeDrawing.scalePointA && (
                <div
                  className="absolute w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full bg-amber-500 border-2 border-white shadow pointer-events-none"
                  style={{
                    left: `${activeDrawing.scalePointA.xNorm * 100}%`,
                    top: `${activeDrawing.scalePointA.yNorm * 100}%`,
                  }}
                />
              )}
              {activeDrawing.scalePointB && (
                <div
                  className="absolute w-3.5 h-3.5 -ml-1.5 -mt-1.5 rounded-full bg-emerald-500 border-2 border-white shadow pointer-events-none"
                  style={{
                    left: `${activeDrawing.scalePointB.xNorm * 100}%`,
                    top: `${activeDrawing.scalePointB.yNorm * 100}%`,
                  }}
                />
              )}
            </div>

            {/* CAD Underlay Opacity & Rotation */}
            {drawingOverlay && drawingOverlay.visible && (
              <div className="grid grid-cols-2 gap-3 text-[10.5px] pt-1">
                <div>
                  <div className="flex justify-between font-semibold text-slate-600 dark:text-slate-300">
                    <span>Underlay Opacity</span>
                    <span className="font-mono">{Math.round(drawingOverlay.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.15"
                    max="0.95"
                    step="0.05"
                    value={drawingOverlay.opacity}
                    onChange={(e) =>
                      onUpdateDrawingOverlay({ opacity: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#FF6F00] cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between font-semibold text-slate-600 dark:text-slate-300">
                    <span>North Align Rotation</span>
                    <span className="font-mono">{drawingOverlay.rotationDeg}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={drawingOverlay.rotationDeg}
                    onChange={(e) =>
                      onUpdateDrawingOverlay({ rotationDeg: parseInt(e.target.value, 10) })
                    }
                    className="w-full accent-sky-600 cursor-pointer"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Uploaded 2D Site Photos Strip */}
        {photos.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10.5px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Uploaded 2D Field Reference Photos ({photos.length})
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {photos.map((ph) => (
                <div
                  key={ph.id}
                  className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 group"
                >
                  <img
                    src={ph.url}
                    alt={ph.name}
                    className="w-full h-24 object-cover"
                  />
                  <div className="p-1.5 bg-white dark:bg-slate-900 flex items-center justify-between gap-1 text-[10px]">
                    <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                      {ph.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveMediaAsset(ph.id)}
                      className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Uploaded 360° Site Walkthrough Video Player */}
        {videos360.length > 0 && (
          <div className="space-y-2">
            {videos360.map((vid) => (
              <div
                key={vid.id}
                className="p-3 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/50 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white min-w-0">
                    <Video className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="truncate">360° Survey Video: {vid.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveMediaAsset(vid.id)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <video
                  src={vid.url}
                  controls
                  playsInline
                  className="w-full max-h-56 rounded-xl bg-black"
                />

                <div className="flex items-center gap-2 text-[10.5px]">
                  <Compass className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                  <span className="font-semibold text-slate-600 dark:text-slate-300 shrink-0">
                    360° Bearing Tag:
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="355"
                    step="5"
                    value={videoAzimuthDeg}
                    onChange={(e) => setVideoAzimuthDeg(parseInt(e.target.value, 10))}
                    className="flex-1 accent-purple-600 cursor-pointer"
                  />
                  <span className="font-mono font-bold text-purple-600 dark:text-purple-400 w-10 text-right">
                    {videoAzimuthDeg}°
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Step 3: Installer Tape Measurements, Parapet, Walkways & Clearances */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>3. Site Field Measurements &amp; Built-In Walkways</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Dimensions drive both the 2D CAD Blueprint, 3D AutoCAD Structure, and PVsyst spacing
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Roof Length E–W (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="4"
              max="100"
              value={measurements.roofLengthM}
              onChange={(e) =>
                onUpdateMeasurements({
                  roofLengthM: Math.max(4, parseFloat(e.target.value) || 4),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Roof Depth N–S (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="4"
              max="100"
              value={measurements.roofWidthM}
              onChange={(e) =>
                onUpdateMeasurements({
                  roofWidthM: Math.max(4, parseFloat(e.target.value) || 4),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Parapet Wall (m)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="4"
              value={measurements.parapetHeightM}
              onChange={(e) =>
                onUpdateMeasurements({
                  parapetHeightM: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              MMS Front Leg (m)
            </label>
            <input
              type="number"
              step="0.05"
              min="0.15"
              max="3"
              value={measurements.mmsClearanceM}
              onChange={(e) =>
                onUpdateMeasurements({
                  mmsClearanceM: Math.max(0.15, parseFloat(e.target.value) || 0.35),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              O&amp;M Walkway Width (m)
            </label>
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
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Walkway Every Rows
            </label>
            <select
              value={measurements.walkwayEveryRows}
              onChange={(e) =>
                onUpdateMeasurements({ walkwayEveryRows: parseInt(e.target.value, 10) || 2 })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value={1}>Every 1 Row</option>
              <option value={2}>Every 2 Rows</option>
              <option value={3}>Every 3 Rows</option>
              <option value={4}>Every 4 Rows</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Edge Setback (m)
            </label>
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

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Building Height (m)
            </label>
            <input
              type="number"
              step="0.5"
              min="2.5"
              max="40"
              value={measurements.buildingHeightM}
              onChange={(e) =>
                onUpdateMeasurements({
                  buildingHeightM: Math.max(2.5, parseFloat(e.target.value) || 5.4),
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Roof Profile
            </label>
            <select
              value={measurements.roofStructureType}
              onChange={(e) =>
                onUpdateMeasurements({
                  roofStructureType: e.target.value as RoofStructureType,
                })
              }
              className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold"
            >
              <option value="rcc_flat">Flat RCC</option>
              <option value="gabled">Pitched Gable</option>
              <option value="shed_slope">Monopitch Shed</option>
            </select>
          </div>

          <div className="col-span-2">
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Area Estimate
            </label>
            <div className="px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 font-mono font-extrabold text-emerald-700 dark:text-emerald-300">
              {(measurements.roofLengthM * measurements.roofWidthM).toFixed(0)} m²
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">
            Site Surveyor Notes (Slab type, Earthing Pit, ACDB route)
          </label>
          <textarea
            rows={2}
            value={measurements.surveyorNotes}
            onChange={(e) => onUpdateMeasurements({ surveyorNotes: e.target.value })}
            placeholder="E.g. RCC flat slab, waterproofing intact, stairhead room on NW corner 2.8m height..."
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
          />
        </div>

        <div className="pt-1 flex items-center justify-end">
          <button
            type="button"
            onClick={() => {
              if (onNextStep) onNextStep();
              else if (onProceedToRoofPolygon) onProceedToRoofPolygon();
              else if (onProceedToCad2D) onProceedToCad2D();
              else if (onProceedToR3FOverlay) onProceedToR3FOverlay();
              else onProceedToAutoCad3D?.();
            }}
            className="w-full sm:w-auto py-2.5 px-5 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
          >
            <span>Step 2: Open Map &amp; Trace Roof Area</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
        </div>
      </div>
    </div>
  );
};
