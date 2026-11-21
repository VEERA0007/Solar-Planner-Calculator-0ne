import React, { useMemo, useRef, useState } from 'react';
import {
  Building2,
  Camera,
  Check,
  Compass,
  Image as ImageIcon,
  Layers,
  Maximize2,
  Plus,
  Ruler,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { NearObstacle, SiteSimulationConfig } from '../utils/shadingSimulationEngine';
import { SiteMediaAsset, UploadedDrawingOverlay } from '../types/siteSurvey';

interface CadMediaReferenceDrawerProps {
  mediaAssets: SiteMediaAsset[];
  onAddMediaAssets: (items: SiteMediaAsset[]) => void;
  onRemoveMediaAsset: (id: string) => void;
  activeDrawingId: string | null;
  onSelectActiveDrawing: (id: string | null) => void;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  onImportDrawingFile?: (file: File) => void;
  onUpdateDrawingOverlay?: (patch: Partial<UploadedDrawingOverlay>) => void;
  config: SiteSimulationConfig;
  onAddPresetObstacle: (obs: NearObstacle) => void;
  onJumpToView?: (view: 'roof_polygon' | 'isometric' | 'r3f_overlay') => void;
  onClose?: () => void;
}

export const CadMediaReferenceDrawer: React.FC<CadMediaReferenceDrawerProps> = ({
  mediaAssets,
  onAddMediaAssets,
  onRemoveMediaAsset,
  activeDrawingId,
  onSelectActiveDrawing,
  uploadedDrawing,
  onImportDrawingFile,
  onUpdateDrawingOverlay,
  config,
  onAddPresetObstacle,
  onJumpToView,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'media' | 'drawing' | 'structures'>('media');
  const [lightboxPhoto, setLightboxPhoto] = useState<SiteMediaAsset | null>(null);
  const [videoBearingDeg, setVideoBearingDeg] = useState<number>(180);
  const [capturedMsg, setCapturedMsg] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const drawingInputRef = useRef<HTMLInputElement | null>(null);
  const videoElementRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const drawings = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'drawing'),
    [mediaAssets]
  );
  const photos = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'photo'),
    [mediaAssets]
  );
  const videos = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'video360'),
    [mediaAssets]
  );

  const handleUploadFiles = (files: FileList | null, kind: 'photo' | 'video360') => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const id = `media-${kind}-${Date.now()}-${idx}`;
      if (kind === 'video360') {
        onAddMediaAssets([
          {
            id,
            kind: 'video360',
            name: file.name,
            url,
            mimeType: file.type || 'video/mp4',
            addedAtIso: new Date().toISOString(),
          },
        ]);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        onAddMediaAssets([
          {
            id,
            kind: 'photo',
            name: file.name,
            url,
            mimeType: file.type || 'image/jpeg',
            addedAtIso: new Date().toISOString(),
            naturalWidth: img.naturalWidth,
            naturalHeight: img.naturalHeight,
          },
        ]);
      };
      img.onerror = () => {
        onAddMediaAssets([
          {
            id,
            kind: 'photo',
            name: file.name,
            url,
            mimeType: file.type || 'image/jpeg',
            addedAtIso: new Date().toISOString(),
          },
        ]);
      };
      img.src = url;
    });
  };

  const handleCaptureVideoFrame = (vid: SiteMediaAsset) => {
    const el = videoElementRefs.current[vid.id];
    if (!el || el.videoWidth === 0 || el.videoHeight === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = el.videoWidth;
    canvas.height = el.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const tSec = Math.round(el.currentTime);
        onAddMediaAssets([
          {
            id: `media-photo-frame-${Date.now()}`,
            kind: 'photo',
            name: `Frame ${tSec}s @ ${videoBearingDeg}° (${vid.name.slice(0, 14)})`,
            url,
            mimeType: 'image/jpeg',
            addedAtIso: new Date().toISOString(),
            naturalWidth: canvas.width,
            naturalHeight: canvas.height,
            notes: `Captured at ${tSec}s · Bearing ${videoBearingDeg}°`,
          },
        ]);
        setCapturedMsg(`Saved video frame (${tSec}s @ ${videoBearingDeg}°)`);
        window.setTimeout(() => setCapturedMsg(null), 2600);
      },
      'image/jpeg',
      0.92
    );
  };

  const addQuickStructure = (
    preset: 'stair' | 'lift' | 'tank_tower' | 'pergola' | 'neighbor'
  ) => {
    const id = `cad-preset-${preset}-${Date.now()}`;
    const roofL = Math.max(8, config.roofLengthM ?? 16);
    const roofW = Math.max(6, config.roofWidthM ?? 14);

    let obs: NearObstacle;
    if (preset === 'stair') {
      obs = {
        id,
        name: 'Staircase Headroom Core',
        category: 'Building',
        shape: 'box',
        heightM: 2.8,
        widthM: 3.2,
        depthM: 3.0,
        distanceM: Number(Math.hypot(roofL * 0.34, roofW * 0.32).toFixed(1)),
        bearingDeg: 315,
        offsetX: Number((-roofL * 0.34).toFixed(2)),
        offsetY: Number((roofW * 0.32).toFixed(2)),
        rotationDeg: 0,
      };
    } else if (preset === 'lift') {
      obs = {
        id,
        name: 'Lift Machine Room',
        category: 'Building',
        shape: 'box',
        heightM: 3.6,
        widthM: 2.6,
        depthM: 2.6,
        distanceM: Number(Math.hypot(roofL * 0.25, roofW * 0.3).toFixed(1)),
        bearingDeg: 40,
        offsetX: Number((roofL * 0.25).toFixed(2)),
        offsetY: Number((roofW * 0.3).toFixed(2)),
        rotationDeg: 0,
      };
    } else if (preset === 'tank_tower') {
      obs = {
        id,
        name: 'OH Tank Staging',
        category: 'Water Tank',
        shape: 'cylinder',
        heightM: 3.0,
        widthM: 2.0,
        depthM: 2.0,
        distanceM: 5.2,
        bearingDeg: 210,
        offsetX: -2.6,
        offsetY: -4.5,
        rotationDeg: 0,
      };
    } else if (preset === 'pergola') {
      obs = {
        id,
        name: 'Roof Pergola / Shed',
        category: 'Building',
        shape: 'box',
        heightM: 2.5,
        widthM: 4.5,
        depthM: 3.2,
        distanceM: 4.0,
        bearingDeg: 110,
        offsetX: 3.8,
        offsetY: -1.4,
        rotationDeg: 0,
      };
    } else {
      obs = {
        id,
        name: 'Adjacent Tall Building',
        category: 'Building',
        shape: 'box',
        heightM: 11.0,
        widthM: 9.0,
        depthM: 7.0,
        distanceM: 14.0,
        bearingDeg: 250,
        offsetX: -13.1,
        offsetY: -4.8,
        rotationDeg: 0,
      };
    }

    onAddPresetObstacle(obs);
    setCapturedMsg(`Added ${obs.name} (${obs.heightM}m) to 2D/3D scene`);
    window.setTimeout(() => setCapturedMsg(null), 2600);
  };

  return (
    <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-700/90 flex flex-col h-full overflow-hidden">
      {/* Drawer Header */}
      <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">Site Reference &amp; Structure Studio</span>
          </div>
          <p className="text-[10px] text-slate-400 truncate">
            Match roof shape &amp; 3D structures from site photos, video &amp; drawings
          </p>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center cursor-pointer shrink-0"
            title="Close Reference Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Section Switcher */}
      <div className="grid grid-cols-3 gap-1 p-1.5 bg-slate-950/70 border-b border-slate-800 text-[10.5px] font-bold shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('media')}
          className={`py-1.5 px-2 rounded-lg cursor-pointer transition ${
            activeTab === 'media'
              ? 'bg-sky-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Photos &amp; Video ({photos.length + videos.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drawing')}
          className={`py-1.5 px-2 rounded-lg cursor-pointer transition ${
            activeTab === 'drawing'
              ? 'bg-[#FF6F00] text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          2D Drawing ({drawings.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('structures')}
          className={`py-1.5 px-2 rounded-lg cursor-pointer transition ${
            activeTab === 'structures'
              ? 'bg-emerald-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          Add Structures
        </button>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleUploadFiles(e.target.files, 'photo');
          e.target.value = '';
        }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          handleUploadFiles(e.target.files, 'video360');
          e.target.value = '';
        }}
      />
      <input
        ref={drawingInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onImportDrawingFile) onImportDrawingFile(f);
          e.target.value = '';
        }}
      />

      {capturedMsg && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/50 text-emerald-300 text-[10.5px] font-semibold flex items-center gap-1.5 shrink-0">
          <Check className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{capturedMsg}</span>
        </div>
      )}

      {/* Body */}
      <div className="p-3 space-y-3 overflow-y-auto flex-1">
        {activeTab === 'media' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="p-2.5 rounded-xl border border-dashed border-sky-500/70 bg-sky-950/30 hover:bg-sky-950/60 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-sky-300">
                  <Camera className="w-3.5 h-3.5" />
                  <span>+ Site Photos</span>
                </div>
                <div className="text-[9.5px] text-slate-400 mt-0.5">
                  Rooftop views, parapets, tanks
                </div>
              </button>

              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="p-2.5 rounded-xl border border-dashed border-purple-500/70 bg-purple-950/30 hover:bg-purple-950/60 text-left cursor-pointer transition"
              >
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-purple-300">
                  <Video className="w-3.5 h-3.5" />
                  <span>+ Site Video</span>
                </div>
                <div className="text-[9.5px] text-slate-400 mt-0.5">
                  360° walkthrough / drone clip
                </div>
              </button>
            </div>

            {videos.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-300">
                  Walkthrough / Drone Videos ({videos.length})
                </div>
                {videos.map((vid) => (
                  <div
                    key={vid.id}
                    className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10.5px]">
                      <span className="font-bold text-slate-200 truncate">{vid.name}</span>
                      <button
                        type="button"
                        onClick={() => onRemoveMediaAsset(vid.id)}
                        className="text-rose-400 hover:text-rose-300 cursor-pointer shrink-0"
                        title="Remove video"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <video
                      ref={(el) => {
                        videoElementRefs.current[vid.id] = el;
                      }}
                      src={vid.url}
                      controls
                      playsInline
                      className="w-full max-h-44 rounded-lg bg-black"
                    />
                    <div className="flex items-center gap-2 text-[10px]">
                      <Compass className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <input
                        type="range"
                        min="0"
                        max="355"
                        step="5"
                        value={videoBearingDeg}
                        onChange={(e) => setVideoBearingDeg(parseInt(e.target.value, 10))}
                        className="flex-1 accent-purple-500 cursor-pointer"
                      />
                      <span className="font-mono font-bold text-purple-300 w-9 text-right">
                        {videoBearingDeg}°
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCaptureVideoFrame(vid)}
                        className="px-2 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-bold cursor-pointer shrink-0"
                      >
                        Grab Still
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {photos.length > 0 ? (
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
                  Site Reference Photos ({photos.length})
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((ph) => (
                    <div
                      key={ph.id}
                      className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950"
                    >
                      <button
                        type="button"
                        onClick={() => setLightboxPhoto(ph)}
                        className="relative w-full h-24 block cursor-pointer group"
                      >
                        <img
                          src={ph.url}
                          alt={ph.name}
                          className="w-full h-full object-cover"
                        />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-950/80 text-[9px] text-white font-bold flex items-center gap-0.5">
                          <Maximize2 className="w-2.5 h-2.5" />
                          <span>Zoom</span>
                        </span>
                      </button>
                      <div className="px-2 py-1 flex items-center justify-between gap-1 text-[10px]">
                        <span className="truncate text-slate-300">{ph.name}</span>
                        <button
                          type="button"
                          onClick={() => onRemoveMediaAsset(ph.id)}
                          className="text-rose-400 hover:text-rose-300 cursor-pointer shrink-0"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              videos.length === 0 && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 text-center text-[11px] text-slate-400 space-y-1">
                  <p className="font-semibold text-slate-300">No site photos or video uploaded yet</p>
                  <p className="text-[10px]">
                    Upload rooftop photos or walkthrough video to visually verify wing geometry, parapets, water tanks, and staircase cores while tracing your 2D/3D model.
                  </p>
                </div>
              )
            )}
          </>
        )}

        {activeTab === 'drawing' && (
          <div className="space-y-3">
            {onImportDrawingFile && (
              <button
                type="button"
                onClick={() => drawingInputRef.current?.click()}
                className="w-full py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadedDrawing?.url ? 'Upload Another 2D Drawing' : 'Upload Architectural / CAD Drawing'}</span>
              </button>
            )}

            {drawings.length > 0 && (
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Uploaded Plans ({drawings.length})
                </span>
                <div className="space-y-1">
                  {drawings.map((d) => {
                    const isActive =
                      activeDrawingId === d.id || uploadedDrawing?.url === d.url;
                    return (
                      <div
                        key={d.id}
                        className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-[10.5px] ${
                          isActive
                            ? 'bg-amber-950/40 border-amber-500/70 text-amber-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectActiveDrawing(d.id);
                            onUpdateDrawingOverlay?.({
                              url: d.url,
                              name: d.name,
                              widthM: d.estimatedSpanWidthM ?? config.roofLengthM ?? 16,
                              depthM: d.estimatedSpanHeightM ?? config.roofWidthM ?? 14,
                              visible: true,
                            });
                          }}
                          className="flex-1 text-left flex items-center gap-1.5 truncate cursor-pointer font-semibold"
                        >
                          <ImageIcon className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">{d.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onRemoveMediaAsset(d.id)}
                          className="text-rose-400 hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {uploadedDrawing?.url && onUpdateDrawingOverlay ? (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-[10.5px]">
                <label className="flex items-center justify-between cursor-pointer font-bold text-slate-200">
                  <span>Show Underlay in 2D / 3D CAD</span>
                  <input
                    type="checkbox"
                    checked={uploadedDrawing.visible}
                    onChange={(e) => onUpdateDrawingOverlay({ visible: e.target.checked })}
                    className="accent-[#FF6F00]"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>Width (m)</span>
                      <span className="text-sky-300">{uploadedDrawing.widthM.toFixed(1)}m</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="90"
                      step="0.5"
                      value={uploadedDrawing.widthM}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ widthM: parseFloat(e.target.value) })
                      }
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>Depth (m)</span>
                      <span className="text-sky-300">{uploadedDrawing.depthM.toFixed(1)}m</span>
                    </div>
                    <input
                      type="range"
                      min="6"
                      max="90"
                      step="0.5"
                      value={uploadedDrawing.depthM}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ depthM: parseFloat(e.target.value) })
                      }
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>Opacity</span>
                      <span className="text-emerald-300">{Math.round(uploadedDrawing.opacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={uploadedDrawing.opacity}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ opacity: parseFloat(e.target.value) })
                      }
                      className="w-full accent-emerald-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>North Rotation</span>
                      <span className="text-amber-300">{uploadedDrawing.rotationDeg}°</span>
                    </div>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      step="1"
                      value={uploadedDrawing.rotationDeg}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ rotationDeg: parseInt(e.target.value, 10) })
                      }
                      className="w-full accent-[#FF6F00] cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>Offset E/W</span>
                      <span className="text-slate-300">{(uploadedDrawing.offsetX ?? 0).toFixed(1)}m</span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={uploadedDrawing.offsetX ?? 0}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ offsetX: parseFloat(e.target.value) })
                      }
                      className="w-full accent-slate-400 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[9.5px] text-slate-400 font-mono">
                      <span>Offset N/S</span>
                      <span className="text-slate-300">{(uploadedDrawing.offsetY ?? 0).toFixed(1)}m</span>
                    </div>
                    <input
                      type="range"
                      min="-20"
                      max="20"
                      step="0.5"
                      value={uploadedDrawing.offsetY ?? 0}
                      onChange={(e) =>
                        onUpdateDrawingOverlay({ offsetY: parseFloat(e.target.value) })
                      }
                      className="w-full accent-slate-400 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-[10.5px] text-slate-400">
                Upload a site sketch, PDF snapshot, or architect plan above to project it directly under the Roof Polygon &amp; 3D visualizers.
              </div>
            )}
          </div>
        )}

        {activeTab === 'structures' && (
          <div className="space-y-2.5">
            <p className="text-[10.5px] text-slate-400">
              Quickly place accurate rooftop structures observed in your site photos &amp; videos into the 2D/3D model:
            </p>
            <div className="grid grid-cols-1 gap-1.5 text-[11px]">
              {[
                {
                  key: 'stair' as const,
                  title: 'Staircase Headroom Room',
                  spec: '3.2 × 3.0m · H 2.8m (NW terrace)',
                },
                {
                  key: 'lift' as const,
                  title: 'Elevator / Lift Machine Room',
                  spec: '2.6 × 2.6m · H 3.6m',
                },
                {
                  key: 'tank_tower' as const,
                  title: 'Overhead Water Tank on Frame',
                  spec: 'Ø 2.0m · H 3.0m staged cylinder',
                },
                {
                  key: 'pergola' as const,
                  title: 'Rooftop Pergola / Sheet Shed',
                  spec: '4.5 × 3.2m · H 2.5m',
                },
                {
                  key: 'neighbor' as const,
                  title: 'Adjacent Neighbor Building',
                  spec: '9.0 × 7.0m · H 11.0m (West block)',
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => addQuickStructure(item.key)}
                  className="p-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left flex items-center justify-between gap-2 cursor-pointer transition"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{item.title}</span>
                    </div>
                    <div className="text-[9.5px] font-mono text-slate-400 mt-0.5">{item.spec}</div>
                  </div>
                  <Plus className="w-4 h-4 text-emerald-400 shrink-0" />
                </button>
              ))}
            </div>

            {onJumpToView && (
              <div className="pt-2 border-t border-slate-800 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onJumpToView('roof_polygon')}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-amber-600/20 border border-amber-500/50 text-amber-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Ruler className="w-3 h-3" />
                  <span>Edit Roof Polygon</span>
                </button>
                <button
                  type="button"
                  onClick={() => onJumpToView('isometric')}
                  className="flex-1 py-1.5 px-2 rounded-xl bg-sky-600/20 border border-sky-500/50 text-sky-300 text-[10px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Layers className="w-3 h-3" />
                  <span>View in 3D</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox Photo Preview Modal */}
      {lightboxPhoto && (
        <div
          className="fixed inset-0 z-[1400] bg-black/90 flex flex-col items-center justify-center p-4"
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            className="max-w-4xl w-full bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-bold text-white truncate">{lightboxPhoto.name}</span>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[76vh]">
              <img
                src={lightboxPhoto.url}
                alt={lightboxPhoto.name}
                className="max-h-[76vh] w-auto object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
