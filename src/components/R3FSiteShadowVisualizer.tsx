import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { Environment, Lightformer, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  Layers,
  Pause,
  Play,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';
import {
  InstantaneousShadingState,
  NearObstacle,
  SiteSimulationConfig,
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  computeRowOffsetsAndWalkways,
  evaluateInstantaneousShading,
  getHostRoofFootprintENU,
  getObstacleCenterENU,
  isPointInPolygon2D,
} from '../utils/shadingSimulationEngine';
import {
  AssemblyLayerMode,
  MmsStructureDesignConfig,
  PotentialPvZone,
  RealMapGroundOverlay,
  RoofStructureType,
  UploadedDrawingOverlay,
} from '../types/siteSurvey';
import {
  DEFAULT_PANEL_SPACING_550W,
  packPanelsInSegmentENU,
} from '../utils/panelArrayPackingEngine';
import {
  clampZoneToRoofFootprint,
  generateRooftopZonesForFootprint,
} from '../utils/rooftopZoneClamper';
import {
  ANNUAL_SOLAR_PRESETS,
  computeDaySunArcPoints,
  filterObstaclesInsideRoofPolygon,
  formatDayOfYearLabel,
  formatSolarClockHour,
} from '../utils/solarVisualizerHelpers';

export type R3FCameraPreset = 'iso' | 'plan_top' | 'south_elev' | 'east_view' | 'tour_360';

interface R3FSiteShadowVisualizerProps {
  siteName: string;
  config: SiteSimulationConfig;
  instantState: InstantaneousShadingState;
  timeFormatted: string;
  dayOfYear?: number;
  onChangeDayOfYear?: (day: number) => void;
  timeHourDec?: number;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  realMapGround?: RealMapGroundOverlay | null;
  onImportDrawingFile?: (file: File) => void;
  onUpdateDrawingOverlay?: (patch: Partial<UploadedDrawingOverlay>) => void;
  sunArcPointsDeg?: Array<{ altitudeDeg: number; azimuthCompassDeg: number }>;
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  onApplyZoneToArray?: (zone: PotentialPvZone) => void;
  onBuildingHeightChange?: (heightM: number) => void;
  isFullscreenWorkspace?: boolean;
  zones?: PotentialPvZone[];
  onChangeZones?: (zones: PotentialPvZone[]) => void;
  assemblyLayer?: AssemblyLayerMode;
  onChangeAssemblyLayer?: (mode: AssemblyLayerMode) => void;
  structureConfig?: MmsStructureDesignConfig;
  tourMode?: boolean;
  onChangeTimeHour?: (hr: number) => void;
  hideZoneComparisonMatrix?: boolean;
}

const DEG2RAD = Math.PI / 180;

// Reusable scratch vectors (zero per-frame allocations)
const _camTargetPos = new THREE.Vector3();
const _ctrlTargetPos = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return false;
  }
}

function createConcreteFacadeTexture(
  buildingHeightM: number,
  roofStructureType?: RoofStructureType
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const floors = Math.max(1, Math.min(10, Math.round(buildingHeightM / 3.1)));
    const cols = 4;
    const colW = 512 / cols;
    const rowH = 512 / floors;

    if (roofStructureType === 'shed_slope') {
      // Industrial metal-clad shed facade with high clerestory glazing
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 512, 512);
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
      ctx.lineWidth = 3;
      for (let x = 0; x <= 512; x += 24) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 512);
        ctx.stroke();
      }
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 44, 512, 46);
      ctx.fillStyle = '#475569';
      ctx.fillRect(0, 420, 512, 92);
    } else {
      // Architectural stucco/concrete facade adapted by roof style (flat commercial/residential vs pitched)
      const wallColor = roofStructureType === 'gabled' ? '#efe5d8' : '#dde3ec';
      const bandColor = roofStructureType === 'gabled' ? '#b8a99a' : '#94a3b8';
      const trimColor = roofStructureType === 'gabled' ? '#7c2d12' : '#475569';

      ctx.fillStyle = wallColor;
      ctx.fillRect(0, 0, 512, 512);

      for (let r = 0; r < floors; r++) {
        ctx.fillStyle = bandColor;
        ctx.fillRect(0, r * rowH, 512, Math.max(6, Math.round(14 / floors + 4)));
        for (let c = 0; c < cols; c++) {
          const x = c * colW + 18;
          const y = r * rowH + Math.max(14, rowH * 0.16);
          const w = colW - 36;
          const h = Math.max(18, rowH * 0.62);
          const winGrad = ctx.createLinearGradient(x, y, x, y + h);
          winGrad.addColorStop(0, '#38bdf8');
          winGrad.addColorStop(0.25, '#475569');
          winGrad.addColorStop(1, '#1e293b');
          ctx.fillStyle = winGrad;
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = trimColor;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
          ctx.beginPath();
          ctx.moveTo(x + w * 0.5, y);
          ctx.lineTo(x + w * 0.5, y + h);
          ctx.stroke();
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function createRoofDeckTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 512; i += 64) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(512, i);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  tex.needsUpdate = true;
  return tex;
}

interface ShadowBoxVolume {
  id: string;
  minX: number;
  maxX: number;
  minY: number; // ENU North/South min
  maxY: number;
  baseZ: number;
  topZ: number;
}

interface ZoneShadowEvaluation {
  instantShadePct: number;
  dailySunlitPct: number;
  status: 'optimal' | 'moderate' | 'heavy';
  shadedCells: boolean[]; // 12 cells (4x3 grid)
}

function isRayBlockedByBox(
  px: number,
  py: number,
  pz: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  box: ShadowBoxVolume
): boolean {
  if (dirZ <= 0.01 || pz >= box.topZ) return false;
  // Intersect ray with slab z in [box.baseZ, box.topZ] and check horizontal footprint
  const invX = Math.abs(dirX) > 1e-5 ? 1 / dirX : 1e5;
  const invY = Math.abs(dirY) > 1e-5 ? 1 / dirY : 1e5;
  const invZ = 1 / dirZ;

  const t1 = (box.minX - px) * invX;
  const t2 = (box.maxX - px) * invX;
  const t3 = (box.minY - py) * invY;
  const t4 = (box.maxY - py) * invY;
  const t5 = (box.baseZ - pz) * invZ;
  const t6 = (box.topZ - pz) * invZ;

  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  return tmax >= Math.max(0.05, tmin);
}

function evaluateZoneShadowImpact(
  zone: PotentialPvZone,
  sunAltDeg: number,
  sunAzDeg: number,
  buildingHeightM: number,
  volumes: ShadowBoxVolume[],
  sunArc?: Array<{ altitudeDeg: number; azimuthCompassDeg: number }>
): ZoneShadowEvaluation {
  const cols = 4;
  const rows = 3;
  const baseElevationZ = zone.zoneType === 'rooftop' ? buildingHeightM + 0.35 : 0.45;
  const altRad = Math.max(0.5, sunAltDeg) * DEG2RAD;
  const azRad = sunAzDeg * DEG2RAD;
  const dirX = Math.cos(altRad) * Math.sin(azRad);
  const dirY = Math.cos(altRad) * Math.cos(azRad);
  const dirZ = Math.sin(altRad);

  const shadedCells: boolean[] = [];
  let shadedCount = 0;
  const sunUp = sunAltDeg > 1.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!sunUp) {
        shadedCells.push(true);
        shadedCount++;
        continue;
      }
      const lx = ((c + 0.5) / cols - 0.5) * zone.widthM;
      const ly = ((r + 0.5) / rows - 0.5) * zone.depthM;
      const wx = zone.centerX + lx;
      const wy = zone.centerY + ly;
      const wz = baseElevationZ + ((r + 0.5) / rows) * Math.sin(zone.tiltDeg * DEG2RAD) * 0.9;
      let hit = false;
      for (let v = 0; v < volumes.length; v++) {
        if (isRayBlockedByBox(wx, wy, wz, dirX, dirY, dirZ, volumes[v])) {
          hit = true;
          break;
        }
      }
      shadedCells.push(hit);
      if (hit) shadedCount++;
    }
  }

  const instantShadePct = Math.round((shadedCount / (cols * rows)) * 100);

  // Full-day solar window availability across sunArc (or 7 hourly samples)
  const samples =
    sunArc && sunArc.length > 0
      ? sunArc.filter((p) => p.altitudeDeg > 7)
      : [
          { altitudeDeg: 18, azimuthCompassDeg: 105 },
          { altitudeDeg: 32, azimuthCompassDeg: 125 },
          { altitudeDeg: 48, azimuthCompassDeg: 152 },
          { altitudeDeg: 56, azimuthCompassDeg: 180 },
          { altitudeDeg: 47, azimuthCompassDeg: 210 },
          { altitudeDeg: 30, azimuthCompassDeg: 238 },
          { altitudeDeg: 16, azimuthCompassDeg: 256 },
        ];

  let totalSampleLit = 0;
  if (samples.length > 0) {
    samples.forEach((pt) => {
      const aRad = pt.altitudeDeg * DEG2RAD;
      const zRad = pt.azimuthCompassDeg * DEG2RAD;
      const sx = Math.cos(aRad) * Math.sin(zRad);
      const sy = Math.cos(aRad) * Math.cos(zRad);
      const sz = Math.sin(aRad);
      let litPts = 0;
      const testOffsets = [
        [-0.3, -0.3],
        [0.3, -0.3],
        [0, 0],
        [-0.3, 0.3],
        [0.3, 0.3],
      ];
      testOffsets.forEach(([ox, oy]) => {
        const wx = zone.centerX + ox * zone.widthM;
        const wy = zone.centerY + oy * zone.depthM;
        let blocked = false;
        for (let v = 0; v < volumes.length; v++) {
          if (isRayBlockedByBox(wx, wy, baseElevationZ + 0.15, sx, sy, sz, volumes[v])) {
            blocked = true;
            break;
          }
        }
        if (!blocked) litPts++;
      });
      totalSampleLit += litPts / testOffsets.length;
    });
  }

  const dailySunlitPct =
    samples.length > 0 ? Math.round((totalSampleLit / samples.length) * 100) : 100 - instantShadePct;
  const effectiveShade = Math.max(100 - dailySunlitPct, instantShadePct * 0.6);
  const status: ZoneShadowEvaluation['status'] =
    effectiveShade <= 10 ? 'optimal' : effectiveShade <= 28 ? 'moderate' : 'heavy';

  return {
    instantShadePct,
    dailySunlitPct,
    status,
    shadedCells,
  };
}

function createShapeFromENU(nodes: Array<{ x: number; y: number }>): THREE.Shape {
  const shape = new THREE.Shape();
  nodes.forEach((pt, idx) => {
    if (idx === 0) shape.moveTo(pt.x, pt.y);
    else shape.lineTo(pt.x, pt.y);
  });
  shape.closePath();
  return shape;
}

/**
 * Create a planar ShapeGeometry clipped strictly to the rooftop polygon with normalized [0..1] UVs.
 */
function createNormalizedPolygonSurfaceGeometry(
  nodes: Array<{ x: number; y: number }>,
  minX: number,
  minY: number,
  widthM: number,
  depthM: number
): THREE.ShapeGeometry {
  const shape = createShapeFromENU(nodes);
  const geo = new THREE.ShapeGeometry(shape);
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const safeW = Math.max(0.5, widthM);
  const safeD = Math.max(0.5, depthM);
  if (pos && uv) {
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) - minX) / safeW, (pos.getY(i) - minY) / safeD);
    }
    uv.needsUpdate = true;
  }
  return geo;
}

interface BuildingOverlayProps {
  roofPolygon: Array<{ x: number; y: number }>;
  roofL: number;
  roofW: number;
  buildingHeightM: number;
  parapetHeightM: number;
  setbackM: number;
  buildingOpacity: number;
  showBuildingFootprint: boolean;
  showArchitecturalWalls: boolean;
  showPvStructures: boolean;
  showStairCore: boolean;
  obstacles: NearObstacle[];
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  config: SiteSimulationConfig;
  isPlacingZone: boolean;
  onRoofPlaceClick: (enuX: number, enuY: number, zoneType: 'rooftop' | 'ground') => void;
  assemblyLayer: AssemblyLayerMode;
  rooftopZoneCount: number;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  drawingOpacity: number;
}

const BuildingOverlayAssembly: React.FC<BuildingOverlayProps> = ({
  roofPolygon,
  roofL,
  roofW,
  buildingHeightM,
  parapetHeightM,
  setbackM,
  buildingOpacity,
  showBuildingFootprint,
  showArchitecturalWalls,
  showPvStructures,
  showStairCore,
  obstacles,
  selectedObstacleId,
  onSelectObstacle,
  config,
  isPlacingZone,
  onRoofPlaceClick,
  assemblyLayer,
  rooftopZoneCount,
  uploadedDrawing,
  drawingOpacity,
}) => {
  const { gl, invalidate } = useThree();
  const [deckDrawingTex, setDeckDrawingTex] = useState<THREE.Texture | null>(null);

  const facadeTex = useMemo(() => {
    const tex = createConcreteFacadeTexture(buildingHeightM, config.roofStructureType);
    tex.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    tex.repeat.set(0.08, Math.max(0.06, 0.25 / Math.max(2.5, buildingHeightM)));
    return tex;
  }, [gl, buildingHeightM, config.roofStructureType]);

  const roofTex = useMemo(() => {
    const tex = createRoofDeckTexture();
    tex.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
    tex.repeat.set(0.14, 0.14);
    return tex;
  }, [gl]);

  useEffect(() => {
    if (!uploadedDrawing?.url) {
      setDeckDrawingTex((prev) => {
        if (prev) prev.dispose();
        return null;
      });
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy());
      tex.needsUpdate = true;
      setDeckDrawingTex((prev) => {
        if (prev) prev.dispose();
        return tex;
      });
      invalidate();
    };
    img.src = uploadedDrawing.url;
    return () => {
      cancelled = true;
    };
  }, [uploadedDrawing?.url, gl, invalidate]);

  useEffect(() => {
    return () => {
      facadeTex.dispose();
      roofTex.dispose();
    };
  }, [facadeTex, roofTex]);

  useEffect(() => {
    return () => {
      if (deckDrawingTex) deckDrawingTex.dispose();
    };
  }, [deckDrawingTex]);

  const polyMetrics = useMemo(() => computePolygonMetricsENU(roofPolygon), [roofPolygon]);

  // Procedural 3D Polygon Extrusions strictly confined to exact roofPolygon footprint (zero off-roof overhang)
  const { bodyGeo, slabGeo, deckOverlayGeo, pitchedRoofGeo } = useMemo(() => {
    const baseShape = createShapeFromENU(roofPolygon);
    const bGeo = new THREE.ExtrudeGeometry(baseShape, {
      depth: Math.max(0.6, buildingHeightM - 0.12),
      bevelEnabled: false,
    });
    const sGeo = new THREE.ExtrudeGeometry(baseShape, { depth: 0.16, bevelEnabled: false });
    const dGeo = createNormalizedPolygonSurfaceGeometry(
      roofPolygon,
      polyMetrics.minX,
      polyMetrics.minY,
      polyMetrics.widthM,
      polyMetrics.depthM
    );

    // Optional Pitched Gable or Shed Roof mass confined within polygon span
    let rGeo: THREE.BufferGeometry | null = null;
    if (config.roofStructureType === 'gabled' || config.roofStructureType === 'shed_slope') {
      const w = Math.max(2, polyMetrics.widthM);
      const d = Math.max(2, polyMetrics.depthM);
      const peakH = Math.min(3.2, Math.max(1.2, d * 0.14));
      const prof = new THREE.Shape();
      if (config.roofStructureType === 'gabled') {
        prof.moveTo(-d / 2, 0);
        prof.lineTo(0, peakH);
        prof.lineTo(d / 2, 0);
        prof.closePath();
      } else {
        prof.moveTo(-d / 2, 0);
        prof.lineTo(-d / 2, peakH);
        prof.lineTo(d / 2, 0.15);
        prof.lineTo(d / 2, 0);
        prof.closePath();
      }
      rGeo = new THREE.ExtrudeGeometry(prof, { depth: w, bevelEnabled: false });
      rGeo.translate(0, 0, -w / 2);
      rGeo.rotateY(Math.PI / 2);
    }

    return { bodyGeo: bGeo, slabGeo: sGeo, deckOverlayGeo: dGeo, pitchedRoofGeo: rGeo };
  }, [roofPolygon, buildingHeightM, config.roofStructureType, polyMetrics]);

  useEffect(() => {
    return () => {
      bodyGeo.dispose();
      slabGeo.dispose();
      deckOverlayGeo.dispose();
      pitchedRoofGeo?.dispose();
    };
  }, [bodyGeo, slabGeo, deckOverlayGeo, pitchedRoofGeo]);

  // Exact Building Footprint Ground Outline Points
  const footprintOutlinePts = useMemo(() => {
    const pts = roofPolygon.map((p): [number, number, number] => [p.x, 0.02, -p.y]);
    if (pts.length > 0) pts.push(pts[0]);
    return pts;
  }, [roofPolygon]);

  // Polygon Perimeter Setback Points
  const setbackLinePts = useMemo(() => {
    const inset = computeInsetPolygonENU(roofPolygon, setbackM);
    const pts = inset.map((p): [number, number, number] => [p.x, buildingHeightM + 0.06, -p.y]);
    if (pts.length > 0) pts.push(pts[0]);
    return pts;
  }, [roofPolygon, setbackM, buildingHeightM]);

  // Polygon Perimeter Parapet Segments flushed inside boundary edge
  const parapetSegments = useMemo(() => {
    const segs: Array<{ cx: number; cz: number; len: number; yaw: number }> = [];
    for (let i = 0; i < roofPolygon.length; i++) {
      const p1 = roofPolygon[i];
      const p2 = roofPolygon[(i + 1) % roofPolygon.length];
      const dx = p2.x - p1.x;
      const dz = -p2.y - -p1.y;
      const len = Math.hypot(dx, dz);
      if (len < 0.25) continue;
      segs.push({
        cx: (p1.x + p2.x) / 2,
        cz: -(p1.y + p2.y) / 2,
        len,
        yaw: -Math.atan2(dz, dx),
      });
    }
    return segs;
  }, [roofPolygon]);

  const parapetT = 0.24;
  const parapetH = Math.max(0.25, parapetHeightM);
  const deckY = buildingHeightM;
  const xRayMode = buildingOpacity < 0.92;
  const stairW = Math.min(3.4, roofL * 0.24);
  const stairD = Math.min(3.2, roofW * 0.24);
  const stairH = 2.65;
  const stairX = polyMetrics.minX + stairW / 2 + parapetT + 0.4;
  const stairZ = -(polyMetrics.maxY - stairD / 2 - parapetT - 0.4);

  const layout = useMemo(() => computeRowOffsetsAndWalkways(config), [config]);
  const beta = config.tiltDeg * DEG2RAD;
  const collVert = config.collectorWidthM * Math.sin(beta);
  const collHoriz = config.collectorWidthM * Math.cos(beta);
  const azRad = config.azimuthCompassDeg * DEG2RAD;

  const handleRoofPointer = (e: ThreeEvent<MouseEvent>) => {
    if (!isPlacingZone) return;
    e.stopPropagation();
    onRoofPlaceClick(Number(e.point.x.toFixed(2)), Number((-e.point.z).toFixed(2)), 'rooftop');
  };

  return (
    <group>
      {/* 1. Host Building Footprint & Rooftop Slab Layer (Strictly Inside Defined Roof Polygon) */}
      {showBuildingFootprint && (
        <group position={[0, 0, 0]}>
          {footprintOutlinePts.length >= 4 && (
            <Line points={footprintOutlinePts} color="#38bdf8" lineWidth={1.8} />
          )}

          {/* Extruded Main Building Polygon Core */}
          <mesh geometry={bodyGeo} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <meshStandardMaterial
              map={facadeTex}
              color="#e2e8f0"
              roughness={0.62}
              metalness={0.18}
              transparent={xRayMode}
              opacity={buildingOpacity}
              depthWrite={!xRayMode}
            />
          </mesh>

          {/* Extruded Polygon Roof Deck Slab (Receives Real-Time Shadows) */}
          <mesh
            geometry={slabGeo}
            position={[0, deckY - 0.12, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            castShadow
            receiveShadow
            onClick={handleRoofPointer}
          >
            <meshStandardMaterial
              map={roofTex}
              color="#cbd5e1"
              roughness={0.88}
              metalness={0.06}
              transparent={xRayMode}
              opacity={Math.max(0.45, buildingOpacity)}
            />
          </mesh>

          {/* Optional Pitched Gable / Monopitch Shed Superstructure */}
          {pitchedRoofGeo && (
            <mesh
              geometry={pitchedRoofGeo}
              position={[polyMetrics.cx, deckY + 0.04, -polyMetrics.cy]}
              castShadow
              receiveShadow
            >
              <meshStandardMaterial
                color="#94a3b8"
                roughness={0.55}
                metalness={0.35}
                transparent={xRayMode}
                opacity={Math.max(0.45, buildingOpacity)}
              />
            </mesh>
          )}

          {/* Rooftop Polygon Perimeter Safety Setback Outline */}
          {setbackLinePts.length >= 4 && (
            <Line
              points={setbackLinePts}
              color="#f59e0b"
              lineWidth={1.6}
              dashed
              dashSize={0.5}
              gapSize={0.3}
            />
          )}
        </group>
      )}

      {/* 2. Architectural Wall Overlays Layer (Parapet Walls, Staircase Core Walls, Clipped Drawing Sheet, Rooftop Obstacles) */}
      {showArchitecturalWalls && (
        <group>
          {/* Polygon Perimeter Parapet Walls + Galvanized Coping Trim */}
          {config.roofStructureType !== 'gabled' &&
            parapetSegments.map((seg, idx) => (
              <group
                key={`r3f-poly-parapet-${idx}`}
                position={[seg.cx, deckY + parapetH / 2, seg.cz]}
                rotation={[0, seg.yaw, 0]}
              >
                <mesh castShadow receiveShadow>
                  <boxGeometry args={[seg.len, parapetH, parapetT]} />
                  <meshStandardMaterial
                    color="#cbd5e1"
                    roughness={0.82}
                    metalness={0.08}
                    transparent={xRayMode}
                    opacity={Math.max(0.55, buildingOpacity)}
                  />
                </mesh>
                <mesh position={[0, parapetH / 2 + 0.03, 0]} castShadow receiveShadow>
                  <boxGeometry args={[seg.len, 0.06, parapetT + 0.02]} />
                  <meshStandardMaterial color="#64748b" roughness={0.3} metalness={0.78} />
                </mesh>
              </group>
            ))}

          {/* NW Staircase Headroom / Elevator Wall Enclosure */}
          {showStairCore && (
            <group position={[stairX, deckY, stairZ]}>
              <mesh position={[0, stairH / 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[stairW, stairH, stairD]} />
                <meshStandardMaterial color="#e2e8f0" roughness={0.78} metalness={0.12} />
              </mesh>
              <mesh position={[0, stairH + 0.08, 0]} castShadow receiveShadow>
                <boxGeometry args={[stairW + 0.16, 0.16, stairD + 0.16]} />
                <meshStandardMaterial color="#475569" roughness={0.42} metalness={0.55} />
              </mesh>
              <mesh position={[stairW / 2 + 0.02, 1.05, 0]}>
                <boxGeometry args={[0.04, 2.0, 0.95]} />
                <meshStandardMaterial color="#334155" roughness={0.4} metalness={0.7} />
              </mesh>
              <mesh position={[0, 1.4, stairD / 2 + 0.2]} castShadow>
                <boxGeometry args={[0.9, 0.75, 0.38]} />
                <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.75} />
              </mesh>
            </group>
          )}

          {/* Uploaded Architectural Wall Plan Clipped Strictly to Exact Rooftop Polygon */}
          {deckDrawingTex && uploadedDrawing?.visible !== false && (
            <mesh
              geometry={deckOverlayGeo}
              position={[0, deckY + 0.048, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              receiveShadow
              onClick={handleRoofPointer}
            >
              <meshStandardMaterial
                map={deckDrawingTex}
                transparent
                opacity={Math.max(0.25, Math.min(1, drawingOpacity))}
                roughness={0.9}
                metalness={0.02}
                polygonOffset
                polygonOffsetFactor={-1}
                polygonOffsetUnits={-1}
              />
            </mesh>
          )}

          {/* Strictly Rooftop-Interior Obstacles (Zero off-building elements outside polygon) */}
          {obstacles.map((obs) => {
            const center = getObstacleCenterENU(obs);
            if (!isPointInPolygon2D(center.x, center.y, roofPolygon)) return null;
            const isSelected = obs.id === selectedObstacleId;
            const rotRad = -(obs.rotationDeg ?? 0) * DEG2RAD;
            const hasNodes = Boolean(obs.nodesENU && obs.nodesENU.length >= 3);
            const shape = hasNodes
              ? 'polygon'
              : obs.shape ||
                (obs.category === 'Water Tank' || obs.category === 'Tree' || obs.category === 'Pole'
                  ? 'cylinder'
                  : obs.category === 'Parapet'
                  ? 'wall'
                  : 'box');

            const baseY = deckY;
            const obsH = Math.max(0.3, obs.heightM);

        if (shape === 'polygon' && obs.nodesENU && obs.nodesENU.length >= 3) {
          const obsShape = createShapeFromENU(obs.nodesENU);
          return (
            <group
              key={`r3f-obs-${obs.id}`}
              position={[0, baseY, 0]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectObstacle(obs.id);
              }}
            >
              <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
                <extrudeGeometry args={[obsShape, { depth: obsH, bevelEnabled: false }]} />
                <meshStandardMaterial
                  color={isSelected ? '#f59e0b' : obs.id.startsWith('osm-bldg-') ? '#94a3b8' : '#64748b'}
                  roughness={0.72}
                  metalness={0.14}
                />
              </mesh>
            </group>
          );
        }

        if (shape === 'cylinder') {
          const rad = Math.max(0.3, Math.max(obs.widthM, obs.depthM) / 2);
          const isTree = obs.category === 'Tree';
          if (isTree) {
            return (
              <group
                key={`r3f-obs-${obs.id}`}
                position={[center.x, baseY, -center.y]}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectObstacle(obs.id);
                }}
              >
                <mesh position={[0, obsH * 0.25, 0]} castShadow receiveShadow>
                  <cylinderGeometry args={[rad * 0.18, rad * 0.28, obsH * 0.52, 10]} />
                  <meshStandardMaterial color="#78350f" roughness={0.92} metalness={0.04} />
                </mesh>
                <mesh position={[0, obsH * 0.62, 0]} castShadow receiveShadow>
                  <dodecahedronGeometry args={[rad * 0.85, 1]} />
                  <meshStandardMaterial color={isSelected ? '#f59e0b' : '#15803d'} roughness={0.86} />
                </mesh>
                <mesh position={[rad * 0.35, obsH * 0.78, -rad * 0.2]} castShadow>
                  <dodecahedronGeometry args={[rad * 0.58, 1]} />
                  <meshStandardMaterial color={isSelected ? '#fbbf24' : '#16a34a'} roughness={0.84} />
                </mesh>
              </group>
            );
          }

          // Multi-part Overhead Water Tank on Galvanized Staging Frame
          const standH = obsH * 0.34;
          const drumH = obsH * 0.62;
          return (
            <group
              key={`r3f-obs-${obs.id}`}
              position={[center.x, baseY, -center.y]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectObstacle(obs.id);
              }}
            >
              {[
                [-rad * 0.6, -rad * 0.6],
                [rad * 0.6, -rad * 0.6],
                [rad * 0.6, rad * 0.6],
                [-rad * 0.6, rad * 0.6],
              ].map(([lx, lz], li) => (
                <mesh key={`tk-leg-${li}`} position={[lx, standH / 2, lz]} castShadow>
                  <boxGeometry args={[0.1, standH, 0.1]} />
                  <meshStandardMaterial color="#94a3b8" roughness={0.35} metalness={0.8} />
                </mesh>
              ))}
              <mesh position={[0, standH, 0]} castShadow receiveShadow>
                <boxGeometry args={[rad * 1.45, 0.1, rad * 1.45]} />
                <meshStandardMaterial color="#475569" roughness={0.45} metalness={0.65} />
              </mesh>
              <mesh position={[0, standH + drumH / 2 + 0.04, 0]} castShadow receiveShadow>
                <cylinderGeometry args={[rad, rad * 1.02, drumH, 20]} />
                <meshStandardMaterial
                  color={isSelected ? '#f59e0b' : '#0891b2'}
                  roughness={0.42}
                  metalness={0.35}
                />
              </mesh>
              <mesh position={[0, standH + drumH + 0.08, 0]} castShadow>
                <cylinderGeometry args={[rad * 0.42, rad * 0.46, 0.12, 16]} />
                <meshStandardMaterial color="#0f172a" roughness={0.35} metalness={0.65} />
              </mesh>
            </group>
          );
        }

        // Box / Wall obstacle anchored cleanly on roof or ground
        return (
          <group
            key={`r3f-obs-${obs.id}`}
            position={[center.x, baseY, -center.y]}
            rotation={[0, rotRad, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelectObstacle(obs.id);
            }}
          >
            {/* Box / Wall obstacle anchored cleanly on rooftop deck */}
            <mesh position={[0, obsH / 2, 0]} castShadow receiveShadow>
              <boxGeometry args={[Math.max(0.4, obs.widthM), obsH, Math.max(0.35, obs.depthM)]} />
              <meshStandardMaterial
                color={isSelected ? '#f59e0b' : obs.category === 'Parapet' ? '#94a3b8' : '#64748b'}
                roughness={0.74}
                metalness={0.14}
              />
            </mesh>
            <mesh position={[0, obsH + 0.05, 0]} castShadow>
              <boxGeometry args={[Math.max(0.45, obs.widthM + 0.14), 0.1, Math.max(0.4, obs.depthM + 0.14)]} />
              <meshStandardMaterial color="#334155" roughness={0.48} metalness={0.5} />
            </mesh>
          </group>
        );
      })}
        </group>
      )}

      {/* 3. Fallback PV Shed Rows (ONLY when PV Array Structures active & no rooftop zones exist) */}
      {showPvStructures && assemblyLayer === 'structure_and_panels' && rooftopZoneCount === 0 && (
        <group position={[0, deckY + 0.04, 0]}>
          {layout.rowOffsetsM.map((offsetM, rIdx) => {
            const stepX = -Math.sin(azRad);
            const stepY = -Math.cos(azRad);
            const rcx = offsetM * stepX;
            const rcy = offsetM * stepY;
            if (!isPointInPolygon2D(rcx, rcy, roofPolygon)) return null;
            const rcz = -rcy;
            const rowW = Math.min(config.arrayWidthM, Math.max(2, roofL - setbackM * 2.2));
            const clearance = config.mmsClearanceM ?? 0.35;
            return (
              <group
                key={`r3f-active-row-${rIdx}`}
                position={[rcx, clearance + collVert * 0.5, rcz]}
                rotation={[0, -azRad + Math.PI, 0]}
              >
                <mesh position={[0, -collVert * 0.28, -collHoriz * 0.2]} castShadow>
                  <boxGeometry args={[rowW * 0.88, 0.06, 0.06]} />
                  <meshStandardMaterial color="#94a3b8" metalness={0.82} roughness={0.28} />
                </mesh>
                <mesh rotation={[beta, 0, 0]} castShadow receiveShadow>
                  <boxGeometry args={[rowW, 0.05, config.collectorWidthM]} />
                  <meshStandardMaterial color="#0284c7" metalness={0.58} roughness={0.22} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
};

const ZoneAnchorSprite: React.FC<{
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ label, isSelected, onSelect }) => {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 112;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const r = 24;
      const x = 8;
      const y = 12;
      const w = canvas.width - 16;
      const h = canvas.height - 24;

      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      ctx.fillStyle = isSelected ? '#0284c7' : 'rgba(15, 23, 42, 0.92)';
      ctx.fill();
      ctx.lineWidth = 5;
      ctx.strokeStyle = isSelected ? '#7dd3fc' : '#475569';
      ctx.stroke();

      ctx.fillStyle = isSelected ? '#ffffff' : '#f1f5f9';
      ctx.font = 'bold 34px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 26), canvas.width / 2, canvas.height / 2 + 1);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, [label, isSelected]);

  useEffect(() => {
    return () => {
      texture.dispose();
    };
  }, [texture]);

  return (
    <sprite
      position={[0, 1.05, 0]}
      scale={[3.2, 0.7, 1]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
};

interface PotentialZonesLayerProps {
  zones: PotentialPvZone[];
  roofPolygon: Array<{ x: number; y: number }>;
  setbackM: number;
  obstacles: NearObstacle[];
  evaluations: Record<string, ZoneShadowEvaluation>;
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
  buildingHeightM: number;
  mmsClearanceM: number;
  assemblyLayer: AssemblyLayerMode;
  structureConfig: MmsStructureDesignConfig;
}

const PotentialPvZonesLayer: React.FC<PotentialZonesLayerProps> = ({
  zones,
  roofPolygon,
  setbackM,
  obstacles,
  evaluations,
  selectedZoneId,
  onSelectZone,
  buildingHeightM,
  mmsClearanceM,
  assemblyLayer,
  structureConfig,
}) => {
  return (
    <group>
      {zones
        .filter((z) => z.enabled !== false && z.zoneType === 'rooftop')
        .map((rawZone) => {
          const zone = clampZoneToRoofFootprint(rawZone, roofPolygon, setbackM);
          const evalRes = evaluations[rawZone.id] || {
            instantShadePct: 0,
            dailySunlitPct: 100,
            status: 'optimal',
            shadedCells: Array(12).fill(false),
          };
          const isSelected = zone.id === selectedZoneId;
          const baseY = buildingHeightM + 0.04;
          const statusColor =
            evalRes.status === 'optimal'
              ? '#10b981'
              : evalRes.status === 'moderate'
              ? '#f59e0b'
              : '#ef4444';

          const styleBaseClear =
            structureConfig.structureStyle === 'elevated_pergola'
              ? Math.max(2.1, mmsClearanceM)
              : Math.max(0.45, mmsClearanceM);
          const clearH = Math.max(0.35, styleBaseClear + (zone.elevationOffsetM ?? 0));

          const packing = packPanelsInSegmentENU(
            {
              centerX: zone.centerX,
              centerY: zone.centerY,
              widthM: zone.widthM,
              depthM: zone.depthM,
              azimuthDeg: zone.azimuthDeg,
            },
            { ...DEFAULT_PANEL_SPACING_550W, azimuthDeg: zone.azimuthDeg },
            roofPolygon,
            setbackM,
            obstacles
          );
          const computedCount =
            packing.fittedPanelsCount > 0 ? packing.fittedPanelsCount : (zone.panelCount ?? 1);

          const colCount = Math.max(
            2,
            Math.round(zone.widthM / Math.max(2.0, structureConfig.columnGridSpacingM || 3.2)) + 1
          );
          const legRows = 2;
          const legXs = Array.from({ length: colCount }).map(
            (_, i) => -zone.widthM * 0.45 + (i / (colCount - 1)) * (zone.widthM * 0.9)
          );
          const legZs = Array.from({ length: legRows }).map(
            (_, i) => -zone.depthM * 0.4 + (i / (legRows - 1)) * (zone.depthM * 0.8)
          );

          const tiltRad = zone.tiltDeg * DEG2RAD;
          const azRad = zone.azimuthDeg * DEG2RAD;
          const slopeRise = Math.sin(tiltRad) * (zone.depthM * 0.85);
          const showStructure = assemblyLayer !== 'building_only';
          const showPanels = assemblyLayer === 'structure_and_panels';

          return (
            <group
              key={zone.id}
              position={[zone.centerX, baseY, -zone.centerY]}
              onClick={(e) => {
                e.stopPropagation();
                onSelectZone(zone.id);
              }}
            >
              {/* Zone Candidate Footprint Pad */}
              <mesh position={[0, 0.018, 0]} receiveShadow>
                <boxGeometry args={[zone.widthM + 0.12, 0.036, zone.depthM + 0.12]} />
                <meshStandardMaterial
                  color={isSelected ? '#38bdf8' : assemblyLayer === 'building_only' ? '#ef4444' : statusColor}
                  transparent
                  opacity={assemblyLayer === 'building_only' ? 0.38 : isSelected ? 0.28 : 0.16}
                  roughness={0.75}
                />
              </mesh>

              {/* Zone Boundary Outline */}
              <Line
                points={[
                  [-zone.widthM / 2 - 0.06, 0.04, -zone.depthM / 2 - 0.06],
                  [zone.widthM / 2 + 0.06, 0.04, -zone.depthM / 2 - 0.06],
                  [zone.widthM / 2 + 0.06, 0.04, zone.depthM / 2 + 0.06],
                  [-zone.widthM / 2 - 0.06, 0.04, zone.depthM / 2 + 0.06],
                  [-zone.widthM / 2 - 0.06, 0.04, -zone.depthM / 2 - 0.06],
                ]}
                color={isSelected ? '#38bdf8' : statusColor}
                lineWidth={isSelected ? 2.4 : 1.5}
              />

              {/* Raised Galvanized Steel MMS Pergola Superstructure */}
              {showStructure && (
                <group rotation={[0, -azRad + Math.PI, 0]}>
                  {/* Pedestal Footings + Vertical RHS Columns */}
                  {legXs.map((lx, xi) =>
                    legZs.map((lz, zi) => {
                      const colH = clearH + (zi === 0 ? slopeRise : 0);
                      return (
                        <group key={`leg-${xi}-${zi}`} position={[lx, 0, lz]}>
                          {structureConfig.includeBrickPedestals && (
                            <mesh position={[0, 0.14, 0]} castShadow receiveShadow>
                              <boxGeometry args={[0.3, 0.28, 0.3]} />
                              <meshStandardMaterial
                                color="#9a3412"
                                roughness={0.88}
                                metalness={0.05}
                              />
                            </mesh>
                          )}
                          <mesh position={[0, colH / 2, 0]} castShadow receiveShadow>
                            <boxGeometry args={[0.08, colH, 0.08]} />
                            <meshStandardMaterial
                              color="#e2e8f0"
                              metalness={0.78}
                              roughness={0.28}
                            />
                          </mesh>
                        </group>
                      );
                    })
                  )}

                  {/* Sloped Steel Rafters connecting front & rear columns */}
                  {legXs.map((lx, xi) => {
                    const midY = clearH + slopeRise * 0.5;
                    return (
                      <mesh
                        key={`rafter-${xi}`}
                        position={[lx, midY, 0]}
                        rotation={[tiltRad, 0, 0]}
                        castShadow
                      >
                        <boxGeometry args={[0.075, 0.09, zone.depthM * 0.96]} />
                        <meshStandardMaterial color="#cbd5e1" metalness={0.82} roughness={0.26} />
                      </mesh>
                    );
                  })}

                  {/* Secondary Cross Purlin Rails */}
                  {[-0.36, -0.12, 0.12, 0.36].map((frac, pi) => {
                    const pz = frac * zone.depthM;
                    const py = clearH + (0.5 - frac) * slopeRise + 0.05;
                    return (
                      <mesh key={`purlin-${pi}`} position={[0, py, pz]} castShadow>
                        <boxGeometry args={[zone.widthM + 0.1, 0.055, 0.055]} />
                        <meshStandardMaterial color="#f1f5f9" metalness={0.85} roughness={0.22} />
                      </mesh>
                    );
                  })}

                  {/* Optional Diagonal Cross-Bracing Struts along bays */}
                  {structureConfig.includeCrossBracing &&
                    legXs.slice(0, -1).map((lx, xi) => {
                      const nextX = legXs[xi + 1];
                      const span = nextX - lx;
                      const braceLen = Math.hypot(span, clearH * 0.72);
                      const angle = Math.atan2(clearH * 0.72, span);
                      return (
                        <group key={`brace-${xi}`} position={[(lx + nextX) / 2, clearH * 0.48, legZs[0]]}>
                          <mesh rotation={[0, 0, angle]} castShadow>
                            <boxGeometry args={[braceLen, 0.035, 0.035]} />
                            <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.32} />
                          </mesh>
                          <mesh rotation={[0, 0, -angle]} castShadow>
                            <boxGeometry args={[braceLen, 0.035, 0.035]} />
                            <meshStandardMaterial color="#cbd5e1" metalness={0.75} roughness={0.32} />
                          </mesh>
                        </group>
                      );
                    })}

                  {/* Yellow Perforated Cable Tray / O&M Walkway along elevated frame */}
                  <mesh position={[0, clearH - 0.14, legZs[1] - 0.15]} castShadow>
                    <boxGeometry args={[zone.widthM, 0.045, 0.32]} />
                    <meshStandardMaterial color="#eab308" metalness={0.45} roughness={0.4} />
                  </mesh>

                  {/* Packed 550W Solar Modules Strictly Inside Rooftop Segment & Clear of Obstacles */}
                  {showPanels &&
                    packing.panels.map((mod, pIdx) => {
                      const rotRad = (((zone.azimuthDeg ?? 180) - 180) * Math.PI) / 180;
                      const ux = Math.cos(rotRad);
                      const uy = -Math.sin(rotRad);
                      const vx = Math.sin(rotRad);
                      const vy = Math.cos(rotRad);
                      const dxENU = mod.centerENU.x - zone.centerX;
                      const dyENU = mod.centerENU.y - zone.centerY;
                      const mx = dxENU * ux + dyENU * uy;
                      const myLocal = dxENU * vx + dyENU * vy;
                      const mz = -myLocal;
                      const fracZ = zone.depthM > 0 ? mz / zone.depthM : 0;
                      const my = clearH + (0.5 - fracZ) * slopeRise + 0.11;
                      const cellShaded = evalRes.shadedCells[pIdx % 12];
                      return (
                        <mesh
                          key={`pv-mod-${pIdx}`}
                          position={[mx, my, mz]}
                          rotation={[tiltRad, 0, 0]}
                          castShadow
                          receiveShadow
                        >
                          <boxGeometry args={[mod.widthM, 0.045, mod.lengthM]} />
                          <meshStandardMaterial
                            color={cellShaded ? '#6d28d9' : '#1e3a8a'}
                            emissive={cellShaded ? '#4c1d95' : '#0c4a6e'}
                            emissiveIntensity={cellShaded ? 0.32 : 0.14}
                            roughness={0.2}
                            metalness={0.62}
                          />
                        </mesh>
                      );
                    })}
                </group>
              )}

              {/* Compact Zone + Panel Count Tag via Native Three.js Sprite */}
              {structureConfig.showZoneCountBadges && (
                <group position={[0, showStructure ? clearH + 0.85 : 0.4, 0]}>
                  <ZoneAnchorSprite
                    label={`${zone.name.split(':')[0]} (${computedCount} Panels) · ${evalRes.dailySunlitPct}% Sun`}
                    isSelected={isSelected}
                    onSelect={() => onSelectZone(zone.id)}
                  />
                </group>
              )}
            </group>
          );
        })}
    </group>
  );
};

interface SceneRigProps {
  preset: R3FCameraPreset;
  presetNonce: number;
  sunAltDeg: number;
  sunAzDeg: number;
  roofSpanM: number;
  sunArcPointsDeg?: Array<{ altitudeDeg: number; azimuthCompassDeg: number }>;
  isSoftwareGl: boolean;
  isTourPlaying: boolean;
  tourSpeed: number;
}

const SceneCameraAndSunRig: React.FC<SceneRigProps> = ({
  preset,
  presetNonce,
  sunAltDeg,
  sunAzDeg,
  roofSpanM,
  sunArcPointsDeg,
  isSoftwareGl,
  isTourPlaying,
  tourSpeed,
}) => {
  const { camera, invalidate } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const animatingRef = useRef<boolean>(false);
  const tourAngleRef = useRef<number>(0.72);

  useEffect(() => {
    invalidate();
  }, [sunAltDeg, sunAzDeg, roofSpanM, invalidate]);

  useEffect(() => {
    if (preset === 'tour_360') {
      animatingRef.current = false;
      return;
    }
    animatingRef.current = true;
    const dist = Math.max(16, Math.min(36, roofSpanM * 1.15));
    if (preset === 'iso') {
      _camTargetPos.set(dist * 0.85, dist * 0.78, dist * 0.95);
      _ctrlTargetPos.set(0, 2.5, 0);
    } else if (preset === 'plan_top') {
      _camTargetPos.set(0.01, Math.max(26, roofSpanM * 1.5), 0.01);
      _ctrlTargetPos.set(0, 0, 0);
    } else if (preset === 'south_elev') {
      _camTargetPos.set(0, 8.5, dist * 1.15);
      _ctrlTargetPos.set(0, 3.2, 0);
    } else {
      _camTargetPos.set(dist * 1.15, 10, 4);
      _ctrlTargetPos.set(0, 3.0, 0);
    }
    invalidate();
  }, [preset, presetNonce, roofSpanM, invalidate]);

  useFrame((_, delta) => {
    if (!controlsRef.current) return;
    if (isTourPlaying) {
      tourAngleRef.current += delta * 0.48 * tourSpeed;
      const r = Math.max(18, Math.min(34, roofSpanM * 1.15));
      const cy = 14.5 + Math.sin(tourAngleRef.current * 0.7) * 3.5;
      camera.position.set(
        Math.sin(tourAngleRef.current) * r,
        cy,
        Math.cos(tourAngleRef.current) * r
      );
      controlsRef.current.target.set(0, 3.4, 0);
      controlsRef.current.update();
      invalidate();
      return;
    }
    if (!animatingRef.current) return;
    const dampFactor = 1 - Math.exp(-7 * Math.min(0.1, delta));
    camera.position.lerp(_camTargetPos, dampFactor);
    controlsRef.current.target.lerp(_ctrlTargetPos, dampFactor);
    controlsRef.current.update();
    if (camera.position.distanceTo(_camTargetPos) < 0.08) {
      camera.position.copy(_camTargetPos);
      controlsRef.current.target.copy(_ctrlTargetPos);
      controlsRef.current.update();
      animatingRef.current = false;
    } else {
      invalidate();
    }
  });

  // Compute sun vector in Three.js world space (+X East, +Y Up, +Z South)
  const sunR = Math.max(18, Math.min(34, roofSpanM * 0.95 + 6));
  const altRad = Math.max(2.5, sunAltDeg) * DEG2RAD;
  const azRad = sunAzDeg * DEG2RAD;
  const sunX = sunR * Math.cos(altRad) * Math.sin(azRad);
  const sunY = sunR * Math.sin(altRad);
  const sunZ = -sunR * Math.cos(altRad) * Math.cos(azRad);
  const sunUp = sunAltDeg > 1;

  const arcRadius = Math.max(13, Math.min(26, roofSpanM * 0.72 + 4));
  const arcPts = useMemo(() => {
    if (!sunArcPointsDeg || sunArcPointsDeg.length < 2) return [];
    return sunArcPointsDeg
      .filter((p) => p.altitudeDeg > 0)
      .map((p): [number, number, number] => {
        const a = p.altitudeDeg * DEG2RAD;
        const z = p.azimuthCompassDeg * DEG2RAD;
        return [
          arcRadius * Math.cos(a) * Math.sin(z),
          arcRadius * Math.sin(a),
          -arcRadius * Math.cos(a) * Math.cos(z),
        ];
      });
  }, [sunArcPointsDeg, arcRadius]);

  const shadowMapSize = isSoftwareGl ? 1024 : 2048;
  const shadowExtent = Math.max(10, Math.min(34, roofSpanM * 0.95));

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={!isSoftwareGl}
        dampingFactor={0.07}
        maxPolarAngle={Math.PI / 2 - 0.03}
        minDistance={8}
        maxDistance={85}
        onStart={() => {
          animatingRef.current = false;
        }}
      />

      {/* Cool Sky/Ground Hemisphere + Tightly-Frustumed Directional Sunlight for Crisp Rooftop Shadows */}
      <hemisphereLight args={['#93c5fd', '#1e293b', 0.65]} />
      <directionalLight position={[-14, 16, -14]} intensity={0.38} color="#bae6fd" />
      <directionalLight
        position={[sunX, Math.max(2.5, sunY), sunZ]}
        intensity={sunUp ? 2.5 : 0.3}
        color={sunAltDeg < 18 ? '#fdba74' : '#fff7ed'}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-bias={-0.0003}
        shadow-normalBias={0.018}
      />

      {/* Visible Sun Orb & Daily Solar Path */}
      {sunUp && (
        <mesh
          position={[
            arcRadius * Math.cos(altRad) * Math.sin(azRad),
            arcRadius * Math.sin(altRad),
            -arcRadius * Math.cos(altRad) * Math.cos(azRad),
          ]}
        >
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={1.8} />
        </mesh>
      )}
      {arcPts.length >= 2 && (
        <Line points={arcPts} color="#fbbf24" lineWidth={1.25} dashed dashSize={0.7} gapSize={0.45} />
      )}

      {/* Procedural Studio/Sky Environment IBL (Zero external HDR 404) */}
      <Environment resolution={128}>
        <Lightformer
          form="rect"
          intensity={1.6}
          color="#e0f2fe"
          position={[0, 12, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[30, 30, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.1}
          color="#fef3c7"
          position={[15, 6, 15]}
          rotation={[0, -Math.PI / 4, 0]}
          scale={[16, 8, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.5}
          color="#334155"
          position={[0, -8, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={[30, 30, 1]}
        />
      </Environment>
    </>
  );
};

export const R3FSiteShadowVisualizer: React.FC<R3FSiteShadowVisualizerProps> = ({
  siteName,
  config,
  instantState,
  timeFormatted,
  dayOfYear: controlledDayOfYear,
  onChangeDayOfYear,
  timeHourDec: controlledTimeHour,
  uploadedDrawing,
  onImportDrawingFile,
  onUpdateDrawingOverlay,
  sunArcPointsDeg,
  selectedObstacleId,
  onSelectObstacle,
  onApplyZoneToArray,
  onBuildingHeightChange,
  isFullscreenWorkspace = false,
  zones: controlledZones,
  onChangeZones,
  assemblyLayer: controlledAssemblyLayer,
  onChangeAssemblyLayer,
  structureConfig: controlledStructureConfig,
  tourMode = false,
  onChangeTimeHour,
  hideZoneComparisonMatrix = false,
}) => {
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const webglCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const roofPolygon = useMemo(() => getHostRoofFootprintENU(config), [config]);
  const polyMetrics = useMemo(() => computePolygonMetricsENU(roofPolygon), [roofPolygon]);

  const roofL = Math.max(8, polyMetrics.widthM || config.roofLengthM || 16);
  const roofW = Math.max(6, polyMetrics.depthM || config.roofWidthM || 14);
  const roofSpanM = Math.max(roofL, roofW);
  const parapetH = Math.max(0.25, config.parapetHeightM ?? 1.0);
  const setbackM = Math.max(0.2, config.perimeterSetbackM ?? 0.6);
  const mmsClearanceM = Math.max(0.25, config.mmsClearanceM ?? 0.35);

  const [buildingHeightM, setBuildingHeightM] = useState<number>(
    () => config.buildingHeightM ?? 5.4
  );
  useEffect(() => {
    if (typeof config.buildingHeightM === 'number') {
      setBuildingHeightM(config.buildingHeightM);
    }
  }, [config.buildingHeightM]);

  // Independent 3D Layer Toggles (Building Footprint, PV Array Structures, Architectural Walls)
  const [showBuildingFootprint, setShowBuildingFootprint] = useState<boolean>(true);
  const [showPvStructures, setShowPvStructures] = useState<boolean>(true);
  const [showArchitecturalWalls, setShowArchitecturalWalls] = useState<boolean>(true);

  const [internalAssemblyLayer, setInternalAssemblyLayer] = useState<AssemblyLayerMode>(
    controlledAssemblyLayer ?? 'structure_and_panels'
  );
  const assemblyLayer = controlledAssemblyLayer ?? internalAssemblyLayer;
  const setAssemblyLayer = (next: AssemblyLayerMode) => {
    setInternalAssemblyLayer(next);
    onChangeAssemblyLayer?.(next);
  };

  // Full-Year Sun Simulation State (Day 1..365 + Solar Time Hour)
  const [localDayOfYear, setLocalDayOfYear] = useState<number>(() => controlledDayOfYear ?? 355);
  useEffect(() => {
    if (typeof controlledDayOfYear === 'number') {
      setLocalDayOfYear(controlledDayOfYear);
    }
  }, [controlledDayOfYear]);

  const [localTimeHour, setLocalTimeHour] = useState<number>(() => controlledTimeHour ?? 10.5);
  useEffect(() => {
    if (typeof controlledTimeHour === 'number') {
      setLocalTimeHour(controlledTimeHour);
    }
  }, [controlledTimeHour]);

  const activeDayOfYear = controlledDayOfYear ?? localDayOfYear;
  const activeTimeHour = controlledTimeHour ?? localTimeHour;

  const handleDayOfYearChange = (nextDay: number) => {
    const clamped = Math.max(1, Math.min(365, Math.round(nextDay)));
    setLocalDayOfYear(clamped);
    onChangeDayOfYear?.(clamped);
  };

  const handleTimeHourChange = (nextHr: number) => {
    const clamped = Math.max(5.5, Math.min(18.5, Number(nextHr.toFixed(2))));
    setLocalTimeHour(clamped);
    onChangeTimeHour?.(clamped);
  };

  const [isYearSweepPlaying, setIsYearSweepPlaying] = useState<boolean>(false);
  useEffect(() => {
    if (!isYearSweepPlaying) return;
    let cur = activeDayOfYear;
    const id = window.setInterval(() => {
      cur = ((cur + 4 - 1) % 365) + 1;
      setLocalDayOfYear(cur);
      onChangeDayOfYear?.(cur);
    }, 140);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isYearSweepPlaying, onChangeDayOfYear]);

  // Filter obstacles strictly to interior rooftop polygon (zero off-building rendering)
  const rooftopObstacles = useMemo(
    () => filterObstaclesInsideRoofPolygon(config.obstacles, roofPolygon),
    [config.obstacles, roofPolygon]
  );

  // Live solar position & rooftop shadow state driven smoothly by full-year day + hour sliders
  const liveInstantState = useMemo(() => {
    if (
      typeof controlledDayOfYear === 'number' &&
      typeof controlledTimeHour === 'number' &&
      rooftopObstacles.length === config.obstacles.length
    ) {
      return instantState;
    }
    return evaluateInstantaneousShading(
      { ...config, obstacles: rooftopObstacles },
      activeDayOfYear,
      activeTimeHour
    );
  }, [
    config,
    rooftopObstacles,
    activeDayOfYear,
    activeTimeHour,
    controlledDayOfYear,
    controlledTimeHour,
    instantState,
  ]);

  const liveSunArcPointsDeg = useMemo(() => {
    if (typeof controlledDayOfYear === 'number' && sunArcPointsDeg && sunArcPointsDeg.length >= 2) {
      return sunArcPointsDeg;
    }
    return computeDaySunArcPoints(config, activeDayOfYear);
  }, [config, activeDayOfYear, controlledDayOfYear, sunArcPointsDeg]);

  const activeTimeFormatted = useMemo(
    () => (typeof controlledTimeHour === 'number' ? timeFormatted : formatSolarClockHour(activeTimeHour)),
    [controlledTimeHour, timeFormatted, activeTimeHour]
  );

  const structureConfig: MmsStructureDesignConfig = useMemo(
    () =>
      controlledStructureConfig ?? {
        structureStyle: 'elevated_pergola',
        columnGridSpacingM: 3.2,
        includeCrossBracing: true,
        includeBrickPedestals: true,
        showZoneCountBadges: true,
        assemblyLayer,
      },
    [controlledStructureConfig, assemblyLayer]
  );

  const [buildingOpacity, setBuildingOpacity] = useState<number>(0.92);
  const [drawingOpacity, setDrawingOpacity] = useState<number>(
    () => uploadedDrawing?.opacity ?? 0.85
  );
  const [showStairCore, setShowStairCore] = useState<boolean>(true);
  const [isPlacingZone, setIsPlacingZone] = useState<boolean>(false);
  const [cameraPreset, setCameraPreset] = useState<R3FCameraPreset>(
    tourMode ? 'tour_360' : 'iso'
  );
  const [presetNonce, setPresetNonce] = useState<number>(0);
  const [dockExpanded, setDockExpanded] = useState<boolean>(true);
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  // 360° Tour & Video Export State
  const [isTourPlaying, setIsTourPlaying] = useState<boolean>(Boolean(tourMode));
  const [tourSpeed, setTourSpeed] = useState<number>(1.0);
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordStatusMsg, setRecordStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    if (tourMode) {
      setIsTourPlaying(true);
      setCameraPreset('tour_360');
    }
  }, [tourMode]);

  useEffect(() => {
    return () => {
      if (recordedVideoUrl && recordedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [recordedVideoUrl]);

  // Sun-hour sweep during automated tour playback
  useEffect(() => {
    if (!isTourPlaying) return;
    let currentHr = 7.0;
    const id = window.setInterval(() => {
      currentHr += 0.15 * tourSpeed;
      if (currentHr > 17.5) currentHr = 7.0;
      const next = Number(currentHr.toFixed(2));
      setLocalTimeHour(next);
      onChangeTimeHour?.(next);
    }, 180);
    return () => window.clearInterval(id);
  }, [isTourPlaying, tourSpeed, onChangeTimeHour]);

  // Sync drawing opacity if parent overlay changes
  useEffect(() => {
    if (typeof uploadedDrawing?.opacity === 'number') {
      setDrawingOpacity(uploadedDrawing.opacity);
    }
  }, [uploadedDrawing?.opacity]);

  // Candidate Potential PV Array Locations (Strictly Rooftop-Only Inside Host Roof Footprint)
  const [internalZones, setInternalZones] = useState<PotentialPvZone[]>(() =>
    generateRooftopZonesForFootprint(
      roofPolygon,
      setbackM,
      config.tiltDeg,
      config.azimuthCompassDeg,
      550,
      rooftopObstacles
    )
  );

  const zones = useMemo(() => {
    const raw = (controlledZones ?? internalZones).filter((z) => z.zoneType === 'rooftop');
    return raw.map((z) => clampZoneToRoofFootprint(z, roofPolygon, setbackM));
  }, [controlledZones, internalZones, roofPolygon, setbackM]);

  const updateZones = (updater: (prev: PotentialPvZone[]) => PotentialPvZone[]) => {
    const next = updater(zones).map((z) => clampZoneToRoofFootprint(z, roofPolygon, setbackM));
    setInternalZones(next);
    onChangeZones?.(next);
  };

  const [selectedZoneId, setSelectedZoneId] = useState<string>('pv-zone-south');

  // Build shadow-casting 3D bounding volumes strictly from rooftop walls, parapets, stair core & rooftop obstacles
  const shadowVolumes = useMemo<ShadowBoxVolume[]>(() => {
    const minX = Number.isFinite(polyMetrics.minX) ? polyMetrics.minX : -roofL / 2;
    const maxX = Number.isFinite(polyMetrics.maxX) ? polyMetrics.maxX : roofL / 2;
    const minY = Number.isFinite(polyMetrics.minY) ? polyMetrics.minY : -roofW / 2;
    const maxY = Number.isFinite(polyMetrics.maxY) ? polyMetrics.maxY : roofW / 2;

    const vols: ShadowBoxVolume[] = [];

    if (showArchitecturalWalls) {
      vols.push(
        {
          id: 'host-parapet-s',
          minX,
          maxX,
          minY,
          maxY: minY + 0.3,
          baseZ: buildingHeightM,
          topZ: buildingHeightM + parapetH,
        },
        {
          id: 'host-parapet-w',
          minX,
          maxX: minX + 0.3,
          minY,
          maxY,
          baseZ: buildingHeightM,
          topZ: buildingHeightM + parapetH,
        },
        {
          id: 'host-parapet-e',
          minX: maxX - 0.3,
          maxX,
          minY,
          maxY,
          baseZ: buildingHeightM,
          topZ: buildingHeightM + parapetH,
        }
      );

      if (showStairCore) {
        const sw = Math.min(3.4, roofL * 0.24);
        const sd = Math.min(3.2, roofW * 0.24);
        const sx = minX + sw / 2 + 0.68;
        const sy = maxY - sd / 2 - 0.68;
        vols.push({
          id: 'host-stair-core',
          minX: sx - sw / 2,
          maxX: sx + sw / 2,
          minY: sy - sd / 2,
          maxY: sy + sd / 2,
          baseZ: buildingHeightM,
          topZ: buildingHeightM + 2.65,
        });
      }

      rooftopObstacles.forEach((obs) => {
        const c = getObstacleCenterENU(obs);
        vols.push({
          id: obs.id,
          minX: c.x - obs.widthM / 2,
          maxX: c.x + obs.widthM / 2,
          minY: c.y - obs.depthM / 2,
          maxY: c.y + obs.depthM / 2,
          baseZ: buildingHeightM,
          topZ: buildingHeightM + obs.heightM,
        });
      });
    }

    return vols;
  }, [
    polyMetrics,
    roofL,
    roofW,
    buildingHeightM,
    parapetH,
    showArchitecturalWalls,
    showStairCore,
    rooftopObstacles,
  ]);

  const zoneEvaluations = useMemo(() => {
    const map: Record<string, ZoneShadowEvaluation> = {};
    zones.forEach((z) => {
      map[z.id] = evaluateZoneShadowImpact(
        z,
        liveInstantState.sunAltitudeDeg,
        liveInstantState.sunAzimuthCompassDeg,
        buildingHeightM,
        shadowVolumes,
        liveSunArcPointsDeg
      );
    });
    return map;
  }, [
    zones,
    liveInstantState.sunAltitudeDeg,
    liveInstantState.sunAzimuthCompassDeg,
    buildingHeightM,
    shadowVolumes,
    liveSunArcPointsDeg,
  ]);

  const selectedZone = useMemo(
    () => zones.find((z) => z.id === selectedZoneId) || zones[0] || null,
    [zones, selectedZoneId]
  );

  const selectedEval = selectedZone ? zoneEvaluations[selectedZone.id] : null;

  const handlePlaceZone = (enuX: number, enuY: number, _zoneType: 'rooftop' | 'ground') => {
    const newId = `pv-zone-custom-${Date.now()}`;
    const candidate = clampZoneToRoofFootprint(
      {
        id: newId,
        name: `Zone ${zones.length + 1}: Roof Bay`,
        zoneType: 'rooftop',
        centerX: enuX,
        centerY: enuY,
        widthM: 4.5,
        depthM: 2.8,
        tiltDeg: config.tiltDeg,
        azimuthDeg: config.azimuthCompassDeg,
        elevationOffsetM: 0,
        enabled: true,
      },
      roofPolygon,
      setbackM
    );
    const packing = packPanelsInSegmentENU(
      {
        centerX: candidate.centerX,
        centerY: candidate.centerY,
        widthM: candidate.widthM,
        depthM: candidate.depthM,
        azimuthDeg: config.azimuthCompassDeg,
      },
      { ...DEFAULT_PANEL_SPACING_550W, azimuthDeg: config.azimuthCompassDeg },
      roofPolygon,
      setbackM,
      rooftopObstacles
    );
    const newZone: PotentialPvZone = {
      ...candidate,
      panelCount: Math.max(1, packing.fittedPanelsCount),
    };
    updateZones((prev) => [...prev, newZone]);
    setSelectedZoneId(newId);
    setAppliedNotice(`Added ${newZone.panelCount}×550W on roof`);
    setIsPlacingZone(false);
    if (!showPvStructures) setShowPvStructures(true);
  };

  const handleDeleteCustomZone = (id: string) => {
    updateZones((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((z) => z.id !== id);
      if (selectedZoneId === id && next[0]) setSelectedZoneId(next[0].id);
      return next;
    });
  };

  const handleTriggerPreset = (p: R3FCameraPreset) => {
    setCameraPreset(p);
    setPresetNonce((n) => n + 1);
    if (p === 'tour_360') {
      setIsTourPlaying(true);
    } else {
      setIsTourPlaying(false);
    }
  };

  const handleToggleRecordVideo = () => {
    if (isRecordingVideo && mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        setIsRecordingVideo(false);
      }
      return;
    }

    const canvas = webglCanvasRef.current;
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setRecordStatusMsg('Browser does not support WebGL stream capture — use 360° Tour play mode.');
      return;
    }

    const mimeCandidates = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const supportedMime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    try {
      if (recordedVideoUrl && recordedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedVideoUrl);
        setRecordedVideoUrl(null);
      }
      const stream = canvas.captureStream(30);
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: supportedMime || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
        setIsRecordingVideo(false);
        setRecordStatusMsg('3D Tour Video ready — play or download below.');
      };
      recorder.onerror = () => {
        setIsRecordingVideo(false);
        setRecordStatusMsg('Recording stopped early by browser.');
      };

      mediaRecorderRef.current = recorder;
      setIsTourPlaying(true);
      setCameraPreset('tour_360');
      setIsRecordingVideo(true);
      setRecordStatusMsg('Recording 360° 3D visual walkthrough...');
      recorder.start(250);
    } catch {
      setIsRecordingVideo(false);
      setRecordStatusMsg('Unable to start MediaRecorder in this context.');
    }
  };

  return (
    <div className={isFullscreenWorkspace ? 'flex flex-col gap-2.5 h-full min-h-0' : 'space-y-2.5'}>
      {/* Hidden Direct 2D Drawing File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && onImportDrawingFile) {
            onImportDrawingFile(f);
          }
          e.target.value = '';
        }}
      />

      {/* Dedicated Non-Overlapping Mobile-Friendly Top Control Header */}
      <div className="rounded-2xl overflow-hidden border border-slate-700/80 bg-[#0b1220] shadow-inner flex flex-col">
        <div className="px-2.5 py-2 bg-slate-950 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 text-[10px]">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-bold text-amber-400">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">
                {!showPvStructures || assemblyLayer === 'building_only'
                  ? '3D Rooftop Footprint Only'
                  : assemblyLayer === 'structure_only'
                  ? 'Steel MMS Superstructure'
                  : 'Rooftop Building + MMS + PV Panels'}
              </span>
            </div>
            <div className="font-mono text-slate-400 truncate mt-0.5 tabular-nums">
              {formatDayOfYearLabel(activeDayOfYear)} · {activeTimeFormatted} · Sun{' '}
              {liveInstantState.sunAltitudeDeg.toFixed(0)}° Alt /{' '}
              {liveInstantState.sunAzimuthCompassDeg.toFixed(0)}° Az ·{' '}
              {Math.round(liveInstantState.linearShadingFactor * 100)}% Shade ·{' '}
              {roofL.toFixed(1)}×{roofW.toFixed(1)}m
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-1.5 ml-auto">
            {!isPlacingZone ? (
              <div className="flex items-center gap-0.5 bg-slate-900 p-0.5 rounded-xl border border-slate-700/80 text-[9.5px] font-bold">
                {(
                  [
                    { id: 'building_only', label: 'Building' },
                    { id: 'structure_only', label: 'MMS Frame' },
                    { id: 'structure_and_panels', label: 'MMS + Panels' },
                  ] as Array<{ id: AssemblyLayerMode; label: string }>
                ).map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    onClick={() => {
                      setAssemblyLayer(layer.id);
                      if (layer.id !== 'building_only' && !showPvStructures) {
                        setShowPvStructures(true);
                      }
                    }}
                    className={`px-2 py-1 rounded-lg cursor-pointer transition whitespace-nowrap ${
                      assemblyLayer === layer.id
                        ? 'bg-[#FF6F00] text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {layer.label}
                  </button>
                ))}
              </div>
            ) : (
              <div className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[10px] font-bold">
                Tap Building Rooftop Deck Only
              </div>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setIsTourPlaying((v) => !v);
                  if (!isTourPlaying) setCameraPreset('tour_360');
                }}
                className={`px-2 py-1 rounded-lg text-[9.5px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap ${
                  isTourPlaying
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-200 hover:text-white'
                }`}
              >
                {isTourPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                <span>{isTourPlaying ? 'Pause' : '360° Tour'}</span>
              </button>

              {isTourPlaying && (
                <button
                  type="button"
                  onClick={() => setTourSpeed((s) => (s >= 2 ? 0.6 : s === 1 ? 2 : 1))}
                  className="px-1.5 py-1 rounded-lg bg-slate-800 text-amber-300 font-mono text-[9.5px] font-bold cursor-pointer"
                  title="Cycle tour orbit speed"
                >
                  {tourSpeed}×
                </button>
              )}

              <button
                type="button"
                onClick={handleToggleRecordVideo}
                className={`px-2 py-1 rounded-lg text-[9.5px] font-bold flex items-center gap-1 cursor-pointer transition whitespace-nowrap ${
                  isRecordingVideo
                    ? 'bg-rose-600 text-white'
                    : 'bg-sky-600 hover:bg-sky-700 text-white'
                }`}
                title="Record 3D walkthrough to downloadable .webm video"
              >
                <Video className="w-3 h-3" />
                <span>{isRecordingVideo ? 'Stop Rec' : 'Record'}</span>
              </button>
            </div>
          </div>
        </div>

      {/* Dedicated React-Three-Fiber 3D Canvas Viewport (Strictly Rooftop Polygon Only) */}
      <div
        className={`relative w-full bg-[#0b1220] select-none ${
          isFullscreenWorkspace ? 'flex-1 min-h-[280px]' : 'h-[400px] sm:h-[440px]'
        }`}
      >
        <Canvas
          shadows
          dpr={isSoftwareGl ? 1 : [1, 2]}
          frameloop={isTourPlaying || isRecordingVideo || isYearSweepPlaying ? 'always' : 'demand'}
          camera={{ position: [19, 17, 21], fov: 42, near: 0.2, far: 200 }}
          gl={{
            antialias: !isSoftwareGl,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance',
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.08,
          }}
          onCreated={({ gl }) => {
            webglCanvasRef.current = gl.domElement;
          }}
        >
          <color attach="background" args={['#0b1220']} />

          <SceneCameraAndSunRig
            preset={cameraPreset}
            presetNonce={presetNonce}
            sunAltDeg={liveInstantState.sunAltitudeDeg}
            sunAzDeg={liveInstantState.sunAzimuthCompassDeg}
            roofSpanM={roofSpanM}
            sunArcPointsDeg={liveSunArcPointsDeg}
            isSoftwareGl={isSoftwareGl}
            isTourPlaying={isTourPlaying}
            tourSpeed={tourSpeed}
          />

          {/* Strictly Rooftop-Polygon-Bounded 3D Building Footprint + Architectural Wall Overlays */}
          <BuildingOverlayAssembly
            roofPolygon={roofPolygon}
            roofL={roofL}
            roofW={roofW}
            buildingHeightM={buildingHeightM}
            parapetHeightM={parapetH}
            setbackM={setbackM}
            buildingOpacity={buildingOpacity}
            showBuildingFootprint={showBuildingFootprint}
            showArchitecturalWalls={showArchitecturalWalls}
            showPvStructures={showPvStructures}
            showStairCore={showStairCore}
            obstacles={rooftopObstacles}
            selectedObstacleId={selectedObstacleId}
            onSelectObstacle={onSelectObstacle}
            config={config}
            isPlacingZone={isPlacingZone}
            onRoofPlaceClick={handlePlaceZone}
            assemblyLayer={assemblyLayer}
            rooftopZoneCount={zones.length}
            uploadedDrawing={uploadedDrawing}
            drawingOpacity={drawingOpacity}
          />

          {/* Strictly Rooftop Potential PV Array Structures + Modules */}
          {showPvStructures && (
            <PotentialPvZonesLayer
              zones={zones}
              roofPolygon={roofPolygon}
              setbackM={setbackM}
              obstacles={rooftopObstacles}
              evaluations={zoneEvaluations}
              selectedZoneId={selectedZoneId}
              onSelectZone={setSelectedZoneId}
              buildingHeightM={buildingHeightM}
              mmsClearanceM={mmsClearanceM}
              assemblyLayer={assemblyLayer}
              structureConfig={structureConfig}
            />
          )}
        </Canvas>

        {/* Collapsible Bottom Control Dock (Zero Viewport Occlusion) */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[96%] max-w-[660px] z-20 flex flex-col items-center">
          <button
            type="button"
            onClick={() => setDockExpanded((v) => !v)}
            className="px-3 py-1 rounded-t-xl bg-slate-950/95 border border-b-0 border-slate-700 text-[10px] font-bold text-slate-200 hover:text-amber-400 flex items-center gap-1 cursor-pointer"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>{dockExpanded ? 'Hide 3D Controls' : 'Show 3D Controls'}</span>
          </button>

          {dockExpanded && (
            <div className="w-full rounded-2xl bg-slate-950/95 border border-slate-700/90 p-2.5 space-y-2 shadow-xl text-[10.5px]">
              {/* Row 1: Full-Year Sun Simulation Slider + Solar Time Slider */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                <div>
                  <div className="flex items-center justify-between gap-1 font-mono text-[9.5px] mb-1">
                    <span className="flex items-center gap-1 text-amber-300 font-bold">
                      <Calendar className="w-3 h-3" />
                      <span>Full-Year Sun</span>
                    </span>
                    <span className="text-white font-bold tabular-nums">
                      {formatDayOfYearLabel(activeDayOfYear)}
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Simulate full-year sun position (day 1 to 365)"
                    min="1"
                    max="365"
                    step="1"
                    value={activeDayOfYear}
                    onChange={(e) => handleDayOfYearChange(parseInt(e.target.value, 10))}
                    className="w-full accent-amber-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between gap-1 mt-1">
                    <div className="flex items-center gap-1">
                      {ANNUAL_SOLAR_PRESETS.map((sp) => (
                        <button
                          key={sp.day}
                          type="button"
                          onClick={() => handleDayOfYearChange(sp.day)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold cursor-pointer ${
                            Math.abs(activeDayOfYear - sp.day) <= 2
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {sp.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsYearSweepPlaying((v) => !v)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer ${
                        isYearSweepPlaying
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 text-amber-300 hover:text-white'
                      }`}
                    >
                      {isYearSweepPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                      <span>{isYearSweepPlaying ? 'Stop' : 'Year'}</span>
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between gap-1 font-mono text-[9.5px] mb-1">
                    <span className="flex items-center gap-1 text-sky-300 font-bold">
                      <Clock className="w-3 h-3" />
                      <span>Daily Shadow Hour</span>
                    </span>
                    <span className="text-white font-bold tabular-nums">
                      {activeTimeFormatted} · {liveInstantState.sunAltitudeDeg.toFixed(0)}° Alt
                    </span>
                  </div>
                  <input
                    type="range"
                    aria-label="Solar time of day for real-time roof shadow projection"
                    min="5.5"
                    max="18.5"
                    step="0.1"
                    value={activeTimeHour}
                    onChange={(e) => handleTimeHourChange(parseFloat(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] font-mono text-slate-400 mt-1 tabular-nums">
                    <span>05:30</span>
                    <span>12:00 Noon ({Math.round(liveInstantState.linearShadingFactor * 100)}% Shade)</span>
                    <span>18:30</span>
                  </div>
                </div>
              </div>

              {/* Row 2: Independent 3D Layer Toggles (Building Footprint, PV Array Structures, Architectural Walls) */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9.5px] font-bold text-slate-400 mr-0.5">Layers:</span>
                <button
                  type="button"
                  onClick={() => setShowBuildingFootprint((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer text-[9.5px] border transition ${
                    showBuildingFootprint
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {showBuildingFootprint ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>Building Footprint</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const next = !showPvStructures;
                    setShowPvStructures(next);
                    if (next && assemblyLayer === 'building_only') {
                      setAssemblyLayer('structure_and_panels');
                    }
                  }}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer text-[9.5px] border transition ${
                    showPvStructures
                      ? 'bg-[#FF6F00] border-amber-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {showPvStructures ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>PV Array Structures</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowArchitecturalWalls((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer text-[9.5px] border transition ${
                    showArchitecturalWalls
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {showArchitecturalWalls ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  <span>Architectural Walls</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowStairCore((v) => !v)}
                  disabled={!showArchitecturalWalls}
                  className={`px-2 py-1 rounded-lg font-semibold flex items-center gap-1 cursor-pointer text-[9.5px] ${
                    showArchitecturalWalls && showStairCore
                      ? 'bg-slate-800 text-amber-300'
                      : 'bg-slate-900 text-slate-500'
                  }`}
                >
                  <Layers className="w-3 h-3" />
                  <span>{showStairCore ? 'Stair Core' : 'No Stair'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBuildingOpacity(0.45);
                    handleTriggerPreset('plan_top');
                  }}
                  className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer text-[9.5px] ml-auto"
                >
                  <RotateCcw className="w-3 h-3 text-sky-400" />
                  <span>X-Ray Plan</span>
                </button>
              </div>

              {/* Row 3: Camera Presets + Import Drawing + Add Candidate PV Zone */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: 'iso', label: '3D Iso' },
                    { id: 'plan_top', label: '2D Plan' },
                    { id: 'south_elev', label: 'South Shade' },
                    { id: 'east_view', label: 'East Profile' },
                    { id: 'tour_360', label: '360° Fly' },
                  ] as Array<{ id: R3FCameraPreset; label: string }>
                ).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleTriggerPreset(p.id)}
                    className={`px-2 py-1 rounded-lg font-bold cursor-pointer transition ${
                      cameraPreset === p.id
                        ? 'bg-[#FF6F00] text-white'
                        : 'bg-slate-800 text-slate-300 hover:text-white'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}

                {onImportDrawingFile && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1 cursor-pointer ml-auto"
                  >
                    <Upload className="w-3 h-3" />
                    <span>{uploadedDrawing?.url ? 'Replace Plan' : 'Import Wall Plan'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsPlacingZone((v) => !v)}
                  className={`px-2 py-1 rounded-lg font-bold flex items-center gap-1 cursor-pointer ${
                    isPlacingZone
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-emerald-400 hover:bg-slate-700'
                  }`}
                >
                  <Plus className="w-3 h-3" />
                  <span>{isPlacingZone ? 'Tap Roof...' : 'Add PV Zone'}</span>
                </button>
              </div>

              {/* Row 4: Live Sliders for Building Height, Building Overlay Opacity, Architectural Wall Plan Opacity */}
              <div className="grid grid-cols-3 gap-2 text-slate-300">
                <div>
                  <div className="flex justify-between font-mono text-[9.5px] mb-0.5 tabular-nums">
                    <span>Bldg H</span>
                    <span className="text-amber-400 font-bold">{buildingHeightM.toFixed(1)}m</span>
                  </div>
                  <input
                    type="range"
                    min="2.5"
                    max="24"
                    step="0.5"
                    value={buildingHeightM}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setBuildingHeightM(val);
                      onBuildingHeightChange?.(val);
                    }}
                    className="w-full accent-[#FF6F00] cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-mono text-[9.5px] mb-0.5 tabular-nums">
                    <span>Footprint</span>
                    <span className="text-sky-400 font-bold">{Math.round(buildingOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={buildingOpacity}
                    onChange={(e) => setBuildingOpacity(parseFloat(e.target.value))}
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between font-mono text-[9.5px] mb-0.5 tabular-nums">
                    <span>Wall Plan</span>
                    <span className="text-emerald-400 font-bold">{Math.round(drawingOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="1.0"
                    step="0.05"
                    value={drawingOpacity}
                    onChange={(e) => {
                      const next = parseFloat(e.target.value);
                      setDrawingOpacity(next);
                      onUpdateDrawingOverlay?.({ opacity: next });
                    }}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Recorded 3D Visual Walkthrough Playback & Download Card */}
      {(recordStatusMsg || recordedVideoUrl) && (
        <div className="bg-slate-900 rounded-2xl p-3 border border-slate-700 space-y-2 text-xs text-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-bold flex items-center gap-1.5 text-sky-300">
              <Video className="w-4 h-4 text-[#FF6F00]" />
              <span>{recordStatusMsg || '3D Walkthrough Recording'}</span>
            </span>
            {recordedVideoUrl && (
              <a
                href={recordedVideoUrl}
                download={`${(siteName || 'solar_site').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_3d_tour.webm`}
                className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .WEBM Video</span>
              </a>
            )}
          </div>
          {recordedVideoUrl && (
            <video
              src={recordedVideoUrl}
              controls
              loop
              className="w-full max-h-56 rounded-xl bg-black border border-slate-700"
            />
          )}
        </div>
      )}

      {/* Candidate Potential PV Array Locations Comparison Matrix */}
      {!hideZoneComparisonMatrix && (
        <div
          className={`bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-200 dark:border-slate-700/80 space-y-2.5 ${
            isFullscreenWorkspace ? 'shrink-0 max-h-48 overflow-y-auto' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 text-[#FF6F00]" />
                <span>Potential PV Array Zones &amp; Module Counts</span>
              </h4>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Select a zone to inspect structural mounting placement, panel count &amp; shading impact.
              </p>
            </div>
            {appliedNotice && (
              <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>{appliedNotice}</span>
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {zones.map((z) => {
              const ev = zoneEvaluations[z.id];
              const isSel = selectedZone?.id === z.id;
              const panelCnt =
                z.panelCount ??
                Math.max(1, Math.floor(z.widthM / 1.15)) * Math.max(1, Math.floor(z.depthM / 2.25));
              const statusClasses =
                ev?.status === 'optimal'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : ev?.status === 'moderate'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400';
              return (
                <button
                  key={z.id}
                  type="button"
                  onClick={() => setSelectedZoneId(z.id)}
                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                    isSel
                      ? 'bg-white dark:bg-slate-900 border-sky-500 shadow-xs'
                      : 'bg-white/70 dark:bg-slate-900/50 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-bold text-slate-900 dark:text-white truncate">
                      {z.name}
                    </span>
                    <span className={`text-[10px] font-mono font-extrabold shrink-0 ${statusClasses}`}>
                      {ev ? `${ev.dailySunlitPct}% Sun` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                    <span>
                      {panelCnt} Panels · {z.widthM.toFixed(1)}×{z.depthM.toFixed(1)}m
                    </span>
                    <span>Now: {ev?.instantShadePct ?? 0}% Shade</span>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedZone && selectedEval && (
            <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
              <div className="space-y-0.5">
                <div className="font-bold text-slate-900 dark:text-white">
                  {selectedZone.name} ·{' '}
                  <span
                    className={
                      selectedEval.status === 'optimal'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : selectedEval.status === 'moderate'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }
                  >
                    {selectedEval.status === 'optimal'
                      ? 'Optimal Unshaded Zone'
                      : selectedEval.status === 'moderate'
                      ? 'Partial Morning/Evening Shade'
                      : 'High Structural Shadow Impact'}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  Center ({selectedZone.centerX >= 0 ? '+' : ''}
                  {selectedZone.centerX.toFixed(1)}m E, {selectedZone.centerY >= 0 ? '+' : ''}
                  {selectedZone.centerY.toFixed(1)}m N) · Day Sunlit {selectedEval.dailySunlitPct}% · Current Shade {selectedEval.instantShadePct}%
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {selectedZone.id.startsWith('pv-zone-custom-') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomZone(selectedZone.id)}
                    className="px-2 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Remove</span>
                  </button>
                )}
                {onApplyZoneToArray && (
                  <button
                    type="button"
                    onClick={() => {
                      onApplyZoneToArray(selectedZone);
                      setAppliedNotice(`Synced ${selectedZone.widthM.toFixed(1)}m Array`);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold cursor-pointer"
                  >
                    Apply to Active PV Array
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
