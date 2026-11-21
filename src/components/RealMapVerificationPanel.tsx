import React, { useMemo, useRef, useState } from 'react';
import {
  Box,
  Building2,
  Camera,
  CheckCircle2,
  Compass,
  Hexagon,
  Layers,
  MapPin,
  RefreshCw,
  Satellite,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  NearObstacle,
  SiteSimulationConfig,
  computePolygonMetricsENU,
  getHostRoofFootprintENU,
} from '../utils/shadingSimulationEngine';
import {
  RealMapGroundOverlay,
  RealMapSource,
  RoofStructureType,
  SiteMeasurements,
  SiteMediaAsset,
  SiteVerificationStatus,
} from '../types/siteSurvey';

interface RealMapVerificationPanelProps {
  siteLocationName: string;
  siteLat: number;
  siteLon: number;
  config: SiteSimulationConfig;
  measurements: SiteMeasurements;
  onUpdateMeasurements: (patch: Partial<SiteMeasurements>) => void;
  mediaAssets: SiteMediaAsset[];
  onAddMediaAssets: (items: SiteMediaAsset[]) => void;
  onRemoveMediaAsset: (id: string) => void;
  realMapGround: RealMapGroundOverlay | null;
  isFetchingMap: boolean;
  isScanningBuildings: boolean;
  osmScanMessage: string | null;
  onFetchRealMap: (source?: RealMapSource) => Promise<void>;
  onScanOsmBuildings: () => Promise<void>;
  obstacles: NearObstacle[];
  onUpdateObstacle: (id: string, patch: Partial<NearObstacle>) => void;
  onRemoveObstacle: (id: string) => void;
  verification: SiteVerificationStatus;
  onUpdateVerification: (patch: Partial<SiteVerificationStatus>) => void;
  onOpenRoofPolygon: () => void;
  onLaunchAutoCad3D: () => void;
  onLaunchR3F3D: () => void;
  compact?: boolean;
}

export const RealMapVerificationPanel: React.FC<RealMapVerificationPanelProps> = ({
  siteLocationName,
  siteLat,
  siteLon,
  config,
  measurements,
  onUpdateMeasurements,
  mediaAssets,
  onAddMediaAssets,
  onRemoveMediaAsset,
  realMapGround,
  isFetchingMap,
  isScanningBuildings,
  osmScanMessage,
  onFetchRealMap,
  onScanOsmBuildings,
  obstacles,
  onUpdateObstacle,
  onRemoveObstacle,
  verification,
  onUpdateVerification,
  onOpenRoofPolygon,
  onLaunchAutoCad3D,
  onLaunchR3F3D,
  compact = false,
}) => {
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedSource, setSelectedSource] = useState<RealMapSource>(
    realMapGround?.source || 'hybrid'
  );

  const photosAndDrawings = useMemo(
    () => mediaAssets.filter((m) => m.kind === 'photo' || m.kind === 'drawing'),
    [mediaAssets]
  );

  const roofPoly = useMemo(() => getHostRoofFootprintENU(config), [config]);
  const polyMetrics = useMemo(() => computePolygonMetricsENU(roofPoly), [roofPoly]);

  const verifiedCount =
    (verification.mapImageVerified ? 1 : 0) +
    (verification.buildingPhotosVerified ? 1 : 0) +
    (verification.surroundingBuildingsVerified ? 1 : 0);
  const allVerified = verifiedCount === 3;

  const surroundingBuildings = useMemo(
    () => obstacles.filter((o) => o.category === 'Building' || o.id.startsWith('osm-bldg-')),
    [obstacles]
  );
  const rooftopObstacles = useMemo(
    () => obstacles.filter((o) => o.category !== 'Building' && !o.id.startsWith('osm-bldg-')),
    [obstacles]
  );

  const handleUploadPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((file, idx) => {
      const url = URL.createObjectURL(file);
      const id = `media-photo-${Date.now()}-${idx}`;
      const img = new Image();
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

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4 ${
        compact ? 'p-3.5' : 'p-4'
      }`}
    >
      {/* Hidden Photo Uploader */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          handleUploadPhotos(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div className="min-w-0">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-1.5">
            <ShieldCheck
              className={`w-4 h-4 shrink-0 ${
                allVerified ? 'text-emerald-500' : 'text-[#FF6F00]'
              }`}
            />
            <span>Pre-3D Real Map, Building &amp; Surroundings Verification</span>
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Verify satellite aerial image, rooftop/building photos &amp; surrounding structures before 3D shadow launch
          </p>
        </div>

        <span
          className={`px-2.5 py-1 rounded-xl text-[10.5px] font-mono font-extrabold ${
            allVerified
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
          }`}
        >
          {verifiedCount}/3 Verified
        </span>
      </div>

      {/* CHECK 1: Real Satellite Map Image */}
      <div
        className={`rounded-2xl p-3 border space-y-2.5 transition ${
          verification.mapImageVerified
            ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-300/80 dark:border-emerald-800/70'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <Satellite className="w-4 h-4 text-sky-600 shrink-0" />
            <span>1. Real Satellite Map Image &amp; Geo-Alignment</span>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              value={selectedSource}
              onChange={(e) => {
                const next = e.target.value as RealMapSource;
                setSelectedSource(next);
                onFetchRealMap(next);
              }}
              className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-bold cursor-pointer"
            >
              <option value="hybrid">Google Hybrid HD</option>
              <option value="satellite">Google Satellite</option>
              <option value="esri">Esri World Imagery</option>
            </select>
            <button
              type="button"
              onClick={() => onFetchRealMap(selectedSource)}
              disabled={isFetchingMap}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3 h-3 ${isFetchingMap ? 'animate-spin' : ''}`} />
              <span>{realMapGround ? 'Refresh Tile' : 'Load Real Map'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          <div className="sm:col-span-5 relative rounded-xl overflow-hidden border border-slate-300 dark:border-slate-700 bg-slate-950 aspect-square max-h-40 flex items-center justify-center">
            {realMapGround?.dataUrl ? (
              <>
                <img
                  src={realMapGround.dataUrl}
                  alt="Real Satellite Aerial Tile"
                  className="w-full h-full object-cover"
                />
                {/* Overlaid SVG showing exact Host Roof Polygon Footprint against Aerial Tile */}
                <svg
                  viewBox="-45 -45 90 90"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <polygon
                    points={roofPoly.map((p) => `${p.x},${-p.y}`).join(' ')}
                    fill="rgba(16, 185, 129, 0.22)"
                    stroke="#10b981"
                    strokeWidth="1.4"
                  />
                  <circle cx="0" cy="0" r="1.8" fill="#FF6F00" stroke="#ffffff" strokeWidth="0.6" />
                </svg>
              </>
            ) : (
              <div className="text-center p-3 text-[10.5px] text-slate-400 space-y-1.5">
                <Satellite className="w-6 h-6 text-slate-500 mx-auto" />
                <p>Click "Load Real Map" to fetch aerial satellite imagery for {siteLocationName}</p>
              </div>
            )}
          </div>

          <div className="sm:col-span-7 space-y-2 text-[11px]">
            <div className="font-mono text-[10px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700 space-y-0.5">
              <div className="flex items-center gap-1 font-bold text-slate-900 dark:text-white">
                <MapPin className="w-3 h-3 text-[#FF6F00]" />
                <span>{siteLocationName}</span>
              </div>
              <div>
                Coords: {siteLat.toFixed(5)}°, {siteLon.toFixed(5)}° ·{' '}
                {realMapGround
                  ? `Tile Span ${(realMapGround.boundsENU.maxX - realMapGround.boundsENU.minX).toFixed(0)}×${(
                      realMapGround.boundsENU.maxY - realMapGround.boundsENU.minY
                    ).toFixed(0)}m`
                  : 'Zoom 19 Mosaic Ready'}
              </div>
            </div>

            <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer font-bold text-slate-800 dark:text-slate-100">
              <input
                type="checkbox"
                checked={verification.mapImageVerified}
                onChange={(e) =>
                  onUpdateVerification({
                    mapImageVerified: e.target.checked,
                    verifiedAtIso: new Date().toISOString(),
                  })
                }
                className="w-4 h-4 accent-emerald-600 cursor-pointer"
              />
              <span>Map satellite image &amp; roof center verified</span>
              {verification.mapImageVerified && (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
              )}
            </label>
          </div>
        </div>
      </div>

      {/* CHECK 2: Building & Roof Images + Roof Structure */}
      <div
        className={`rounded-2xl p-3 border space-y-2.5 transition ${
          verification.buildingPhotosVerified
            ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-300/80 dark:border-emerald-800/70'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>2. Building Photos &amp; Real Roof Structure</span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="px-2.5 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Upload className="w-3 h-3" />
              <span>Add Building Photo</span>
            </button>
            <button
              type="button"
              onClick={onOpenRoofPolygon}
              className="px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Hexagon className="w-3 h-3" />
              <span>Edit Roof Poly</span>
            </button>
          </div>
        </div>

        {/* Uploaded Photos Thumbnails or Empty Callout */}
        {photosAndDrawings.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photosAndDrawings.map((asset) => (
              <div
                key={asset.id}
                className="relative shrink-0 w-24 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900"
              >
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="w-24 h-16 object-cover"
                />
                <div className="px-1.5 py-1 bg-white dark:bg-slate-900 flex items-center justify-between gap-1 text-[9px]">
                  <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                    {asset.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveMediaAsset(asset.id)}
                    className="text-rose-500 hover:text-rose-700 cursor-pointer shrink-0"
                    title="Remove photo"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-between gap-2 text-[10.5px] text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <Camera className="w-4 h-4 text-sky-500 shrink-0" />
              <span>No site photos attached yet — upload rooftop/elevation photo or verify blueprint profile below.</span>
            </div>
          </div>
        )}

        {/* Quick Roof Structure Parameters */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-[10.5px]">
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="block text-[9.5px] text-slate-400 font-bold">Roof Area</span>
            <span className="font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
              {polyMetrics.areaSqM.toFixed(0)} m² ({roofPoly.length} pts)
            </span>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="block text-[9.5px] text-slate-400 font-bold">Bldg Height (m)</label>
            <input
              type="number"
              step="0.5"
              min="2.5"
              max="50"
              value={measurements.buildingHeightM}
              onChange={(e) =>
                onUpdateMeasurements({
                  buildingHeightM: Math.max(2.5, parseFloat(e.target.value) || 5.4),
                })
              }
              className="w-full font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
            />
          </div>
          <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="block text-[9.5px] text-slate-400 font-bold">Parapet (m)</label>
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
              className="w-full font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
            />
          </div>
          <div className="col-span-3 sm:col-span-1 bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-700">
            <label className="block text-[9.5px] text-slate-400 font-bold">Roof Profile</label>
            <select
              value={measurements.roofStructureType}
              onChange={(e) =>
                onUpdateMeasurements({
                  roofStructureType: e.target.value as RoofStructureType,
                })
              }
              className="w-full font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none cursor-pointer"
            >
              <option value="rcc_flat">Flat RCC</option>
              <option value="gabled">Pitched Gable</option>
              <option value="shed_slope">Monopitch Shed</option>
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer font-bold text-[11px] text-slate-800 dark:text-slate-100">
          <input
            type="checkbox"
            checked={verification.buildingPhotosVerified}
            onChange={(e) =>
              onUpdateVerification({
                buildingPhotosVerified: e.target.checked,
                verifiedAtIso: new Date().toISOString(),
              })
            }
            className="w-4 h-4 accent-emerald-600 cursor-pointer"
          />
          <span>
            Building photos ({photosAndDrawings.length}), roof boundary ({roofPoly.length} vertices) &amp; {measurements.buildingHeightM}m height verified
          </span>
          {verification.buildingPhotosVerified && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
          )}
        </label>
      </div>

      {/* CHECK 3: Surrounding Buildings & Rooftop Obstacles */}
      <div
        className={`rounded-2xl p-3 border space-y-2.5 transition ${
          verification.surroundingBuildingsVerified
            ? 'bg-emerald-50/40 dark:bg-emerald-950/15 border-emerald-300/80 dark:border-emerald-800/70'
            : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
            <Compass className="w-4 h-4 text-purple-600 shrink-0" />
            <span>3. Surrounding Buildings &amp; Near Obstacles</span>
          </div>
          <button
            type="button"
            onClick={onScanOsmBuildings}
            disabled={isScanningBuildings}
            className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3 h-3 ${isScanningBuildings ? 'animate-spin' : ''}`} />
            <span>
              {isScanningBuildings ? 'Scanning OSM...' : 'Scan Real Buildings (OSM)'}
            </span>
          </button>
        </div>

        {osmScanMessage && (
          <div className="px-2.5 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-[10.5px] font-semibold text-purple-900 dark:text-purple-200">
            {osmScanMessage}
          </div>
        )}

        <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
          {obstacles.length === 0 ? (
            <div className="text-[10.5px] text-slate-500 dark:text-slate-400 p-2 text-center bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              No obstacles mapped — click "Scan Real Buildings (OSM)" or trace neighbors in 2D/Satellite CAD.
            </div>
          ) : (
            obstacles.map((obs) => {
              const displayH = obs.totalHeightFromGroundM ?? obs.heightM;
              return (
                <div
                  key={obs.id}
                  className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-[10.5px]"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                      {obs.name}
                      {obs.id.startsWith('osm-bldg-') && (
                        <span className="ml-1.5 text-[9px] font-mono text-purple-600 dark:text-purple-400">
                          OSM
                        </span>
                      )}
                    </div>
                    <div className="text-[9.5px] font-mono text-slate-500">
                      {obs.category} · Dist {obs.distanceM}m @ {obs.bearingDeg}°
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9.5px] text-slate-400 font-bold">H</span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.3"
                      max="60"
                      value={displayH}
                      onChange={(e) => {
                        const val = Math.max(0.3, parseFloat(e.target.value) || 0.3);
                        if (typeof obs.totalHeightFromGroundM === 'number') {
                          const relH = Math.max(
                            0.2,
                            Number((val - measurements.buildingHeightM).toFixed(1))
                          );
                          onUpdateObstacle(obs.id, {
                            totalHeightFromGroundM: val,
                            heightM: relH,
                          });
                        } else {
                          onUpdateObstacle(obs.id, { heightM: val });
                        }
                      }}
                      className="w-12 px-1.5 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold text-center text-[10.5px]"
                    />
                    <span className="text-[9.5px] text-slate-400">m</span>
                    <button
                      type="button"
                      onClick={() => onRemoveObstacle(obs.id)}
                      className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                      title="Remove obstacle"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 cursor-pointer font-bold text-[11px] text-slate-800 dark:text-slate-100">
          <input
            type="checkbox"
            checked={verification.surroundingBuildingsVerified}
            onChange={(e) =>
              onUpdateVerification({
                surroundingBuildingsVerified: e.target.checked,
                verifiedAtIso: new Date().toISOString(),
              })
            }
            className="w-4 h-4 accent-emerald-600 cursor-pointer"
          />
          <span>
            Surrounding buildings ({surroundingBuildings.length}) &amp; rooftop items ({rooftopObstacles.length}) heights verified
          </span>
          {verification.surroundingBuildingsVerified && (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />
          )}
        </label>
      </div>

      {/* Launch 3D Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        {!allVerified ? (
          <button
            type="button"
            onClick={async () => {
              if (!realMapGround) {
                await onFetchRealMap(selectedSource);
              }
              if (verification.osmBuildingsCount === 0 && !isScanningBuildings) {
                await onScanOsmBuildings();
              }
              onUpdateVerification({
                mapImageVerified: true,
                buildingPhotosVerified: true,
                surroundingBuildingsVerified: true,
                verifiedAtIso: new Date().toISOString(),
              });
            }}
            className="px-3.5 py-2 rounded-2xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Sync Real Map, Scan Buildings &amp; Verify All (3/3)</span>
          </button>
        ) : (
          <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>All Map, Building &amp; Surroundings Verified — 3D Unlocked</span>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            disabled={!allVerified}
            onClick={onLaunchR3F3D}
            className="px-3 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>3D R3F Bldg</span>
          </button>
          <button
            type="button"
            disabled={!allVerified}
            onClick={onLaunchAutoCad3D}
            className="px-3.5 py-2 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition shadow-sm"
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D AutoCAD View</span>
          </button>
        </div>
      </div>
    </div>
  );
};
