import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  Box,
  Compass,
  Download,
  Eye,
  Grid,
  Layers,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCw,
  Ruler,
  SlidersHorizontal,
  Sun,
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
  runAnnualShadingSimulation,
} from '../utils/shadingSimulationEngine';
import {
  DEFAULT_PANEL_SPACING_550W,
  packPanelsInSegmentENU,
} from '../utils/panelArrayPackingEngine';
import { buildShadowCadDxfPayload } from '../utils/dxfExporter';
import {
  clampZoneToRoofFootprint,
  computeLayoutYieldSummary,
} from '../utils/rooftopZoneClamper';
import {
  ANNUAL_SOLAR_PRESETS,
  computeDaySunArcPoints,
  filterObstaclesInsideRoofPolygon,
  formatDayOfYearLabel,
  formatSolarClockHour,
} from '../utils/solarVisualizerHelpers';
import { DxfExportSummaryModal, DxfPreviewRequest } from './DxfExportSummaryModal';
import {
  AssemblyLayerMode,
  MmsStructureDesignConfig,
  PotentialPvZone,
  RealMapGroundOverlay,
  RoofStructureType,
  UploadedDrawingOverlay,
} from '../types/siteSurvey';

export type CadCameraPreset = '3d_iso' | 'top_plan' | 'south_elev' | 'east_sect' | 'tour_360';

interface AutoCadThreeViewportProps {
  siteName: string;
  config: SiteSimulationConfig;
  instantState: InstantaneousShadingState;
  timeFormatted: string;
  dayOfYear?: number;
  onChangeDayOfYear?: (day: number) => void;
  timeHourDec?: number;
  onChangeTimeHour?: (hour: number) => void;
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  realMapGround?: RealMapGroundOverlay | null;
  sunArcPointsDeg?: Array<{ altitudeDeg: number; azimuthCompassDeg: number }>;
  isFullscreenWorkspace?: boolean;
  onToggleFullscreen?: () => void;
  className?: string;
  assemblyLayer?: AssemblyLayerMode;
  onChangeAssemblyLayer?: (mode: AssemblyLayerMode) => void;
  structureConfig?: MmsStructureDesignConfig;
  zones?: PotentialPvZone[];
  tourMode?: boolean;
}

const DEG2RAD = Math.PI / 180;

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    if (!gl) return true;
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return false;
    const rendererStr = String(
      (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || ''
    );
    return /swiftshader|llvmpipe|software|mesa offscreen/i.test(rendererStr);
  } catch {
    return false;
  }
}

function createPvCellTexture(
  shadedGrid: boolean[][],
  isBehind: boolean,
  isBelowHorizon: boolean
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const ny = 5;
    const nx = 10;
    const padX = 8;
    const padY = 6;
    const cellW = (canvas.width - padX * 2) / nx;
    const cellH = (canvas.height - padY * 2) / ny;

    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const shaded = isBehind || isBelowHorizon || (shadedGrid[iy]?.[ix] ?? false);
        const x = padX + ix * cellW + 2;
        const y = padY + (ny - 1 - iy) * cellH + 2;
        const w = cellW - 4;
        const h = cellH - 4;

        const grad = ctx.createLinearGradient(x, y, x + w, y + h);
        if (shaded) {
          grad.addColorStop(0, '#312e81');
          grad.addColorStop(1, '#1e1b4b');
        } else {
          grad.addColorStop(0, '#0284c7');
          grad.addColorStop(0.55, '#0369a1');
          grad.addColorStop(1, '#075985');
        }
        ctx.fillStyle = grad;
        ctx.fillRect(x, y, w, h);

        // Silver micro-busbars
        ctx.strokeStyle = shaded ? 'rgba(165, 180, 252, 0.25)' : 'rgba(186, 230, 253, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.33, y);
        ctx.lineTo(x + w * 0.33, y + h);
        ctx.moveTo(x + w * 0.66, y);
        ctx.lineTo(x + w * 0.66, y + h);
        ctx.stroke();

        ctx.strokeStyle = shaded ? '#6366f1' : '#38bdf8';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(x, y, w, h);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createWalkwayGratingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#334155';
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    for (let i = -256; i < 512; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + 256, 256);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(i + 256, 0);
      ctx.lineTo(i, 256);
      ctx.stroke();
    }
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.strokeRect(5, 5, 246, 246);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 1);
  return tex;
}

function createConcreteSlabTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 512, 512);
    // Subtle concrete joint grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
    ctx.lineWidth = 2;
    for (let p = 0; p <= 512; p += 64) {
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(512, p);
      ctx.stroke();
    }
    // Fine grain noise
    for (let i = 0; i < 2400; i++) {
      const gx = (i * 73) % 512;
      const gy = (i * 137) % 512;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(gx, gy, 2, 2);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

function createBuildingFacadeTexture(
  buildingHeightM: number,
  roofStructureType?: RoofStructureType
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const floors = Math.max(1, Math.min(9, Math.round(buildingHeightM / 3.1)));
    const cols = 4;
    const cw = 256 / cols;
    const rh = 256 / floors;

    if (roofStructureType === 'shed_slope') {
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, 0, 256, 256);
      ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
      ctx.lineWidth = 2;
      for (let x = 0; x <= 256; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, 256);
        ctx.stroke();
      }
      ctx.fillStyle = '#334155';
      ctx.fillRect(0, 20, 256, 26);
    } else {
      ctx.fillStyle = roofStructureType === 'gabled' ? '#cbd5e1' : '#94a3b8';
      ctx.fillRect(0, 0, 256, 256);
      for (let r = 0; r < floors; r++) {
        ctx.fillStyle = '#64748b';
        ctx.fillRect(0, r * rh, 256, Math.max(4, Math.round(10 / floors + 3)));
        for (let c = 0; c < cols; c++) {
          ctx.fillStyle = '#1e293b';
          ctx.fillRect(c * cw + 10, r * rh + Math.max(8, rh * 0.18), cw - 20, Math.max(10, rh * 0.6));
          ctx.strokeStyle = '#cbd5e1';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(c * cw + 10, r * rh + Math.max(8, rh * 0.18), cw - 20, Math.max(10, rh * 0.6));
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.14, Math.max(0.08, 0.35 / Math.max(2.5, buildingHeightM)));
  return tex;
}

function createTextSprite(
  label: string,
  opts?: { bg?: string; fg?: string; border?: string; scale?: number }
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bg = opts?.bg || 'rgba(15, 23, 42, 0.9)';
    const border = opts?.border || '#38bdf8';
    const fg = opts?.fg || '#f8fafc';

    ctx.fillStyle = bg;
    ctx.strokeStyle = border;
    ctx.lineWidth = 4;
    const r = 18;
    const x = 10;
    const y = 14;
    const w = canvas.width - 20;
    const h = canvas.height - 28;
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
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.font = 'bold 28px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, canvas.width / 2, canvas.height / 2, canvas.width - 36);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(mat);
  const s = opts?.scale ?? 1;
  sprite.scale.set(4.2 * s, 1.05 * s, 1);
  sprite.renderOrder = 25;
  return sprite;
}

function addAutoCadDimensionLine(
  parent: THREE.Group,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  label: string,
  color = 0x38bdf8
) {
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
  const geo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
  parent.add(new THREE.Line(geo, mat));

  // Tick marks perpendicular in XZ or vertical
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length() || 1;
  dir.divideScalar(len);
  const tickDir =
    Math.abs(dir.y) > 0.7 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-dir.z, 0, dir.x);
  tickDir.normalize().multiplyScalar(0.28);

  const t1 = new THREE.BufferGeometry().setFromPoints([
    p1.clone().add(tickDir),
    p1.clone().sub(tickDir),
  ]);
  const t2 = new THREE.BufferGeometry().setFromPoints([
    p2.clone().add(tickDir),
    p2.clone().sub(tickDir),
  ]);
  parent.add(new THREE.Line(t1, mat), new THREE.Line(t2, mat));

  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  mid.y += 0.35;
  const sprite = createTextSprite(label, {
    bg: 'rgba(9, 13, 22, 0.92)',
    border: `#${color.toString(16).padStart(6, '0')}`,
    fg: '#e0f2fe',
    scale: 0.72,
  });
  sprite.position.copy(mid);
  parent.add(sprite);
}

export const AutoCadThreeViewport: React.FC<AutoCadThreeViewportProps> = ({
  siteName,
  config,
  instantState,
  timeFormatted,
  dayOfYear,
  onChangeDayOfYear,
  timeHourDec,
  onChangeTimeHour,
  selectedObstacleId,
  onSelectObstacle,
  uploadedDrawing,
  realMapGround: _realMapGround,
  sunArcPointsDeg,
  isFullscreenWorkspace = false,
  onToggleFullscreen,
  className = '',
  assemblyLayer: controlledAssemblyLayer,
  onChangeAssemblyLayer,
  structureConfig,
  zones = [],
  tourMode = false,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const sunLightRef = useRef<THREE.DirectionalLight | null>(null);
  const dynamicGroupRef = useRef<THREE.Group | null>(null);
  const clickableMeshesRef = useRef<THREE.Object3D[]>([]);
  const isSoftwareGlRef = useRef<boolean>(false);
  const overlayTexCacheRef = useRef<{ url: string; tex: THREE.Texture } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);

  const [cameraPreset, setCameraPreset] = useState<CadCameraPreset>(
    tourMode ? 'tour_360' : '3d_iso'
  );
  const [internalAssemblyLayer, setInternalAssemblyLayer] = useState<AssemblyLayerMode>(
    controlledAssemblyLayer ?? 'structure_and_panels'
  );
  const assemblyLayer = controlledAssemblyLayer ?? internalAssemblyLayer;
  const setAssemblyLayer = (next: AssemblyLayerMode) => {
    setInternalAssemblyLayer(next);
    onChangeAssemblyLayer?.(next);
  };

  const [localDayOfYear, setLocalDayOfYear] = useState<number>(dayOfYear ?? 172);
  const [localHourDec, setLocalHourDec] = useState<number>(timeHourDec ?? 11.5);
  const [isYearSweepPlaying, setIsYearSweepPlaying] = useState<boolean>(false);

  const activeDayOfYear = dayOfYear ?? localDayOfYear;
  const activeHourDec = timeHourDec ?? localHourDec;

  const handleDayChange = (nextDay: number) => {
    const clamped = Math.max(1, Math.min(365, Math.round(nextDay)));
    setLocalDayOfYear(clamped);
    onChangeDayOfYear?.(clamped);
  };

  const handleHourChange = (nextHour: number) => {
    const clamped = Math.max(5.5, Math.min(18.5, Number(nextHour)));
    setLocalHourDec(clamped);
    onChangeTimeHour?.(clamped);
  };

  useEffect(() => {
    if (typeof dayOfYear === 'number') setLocalDayOfYear(dayOfYear);
  }, [dayOfYear]);

  useEffect(() => {
    if (typeof timeHourDec === 'number') setLocalHourDec(timeHourDec);
  }, [timeHourDec]);

  useEffect(() => {
    if (!isYearSweepPlaying) return;
    const id = window.setInterval(() => {
      setLocalDayOfYear((prev) => {
        const next = prev >= 365 ? 1 : prev + 3;
        onChangeDayOfYear?.(next);
        return next;
      });
    }, 90);
    return () => window.clearInterval(id);
  }, [isYearSweepPlaying, onChangeDayOfYear]);

  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showCadEdges, setShowCadEdges] = useState<boolean>(true);
  const [showBuildingFootprint, setShowBuildingFootprint] = useState<boolean>(true);
  const [showPvStructures, setShowPvStructures] = useState<boolean>(true);
  const [showArchitecturalWalls, setShowArchitecturalWalls] = useState<boolean>(true);
  const [hudExpanded, setHudExpanded] = useState<boolean>(true);
  const [isFullscreenHeight, setIsFullscreenHeight] = useState<boolean>(false);
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [dxfPreviewRequest, setDxfPreviewRequest] = useState<DxfPreviewRequest | null>(null);

  useEffect(() => {
    if (tourMode) {
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

  const layout = useMemo(() => computeRowOffsetsAndWalkways(config), [config]);

  const roofFootprintPoly = useMemo(() => getHostRoofFootprintENU(config), [config]);
  const rooftopObstaclesFiltered = useMemo(
    () => filterObstaclesInsideRoofPolygon(config.obstacles, roofFootprintPoly),
    [config.obstacles, roofFootprintPoly]
  );

  const liveInstantState = useMemo(() => {
    if (
      typeof dayOfYear === 'number' &&
      typeof timeHourDec === 'number' &&
      rooftopObstaclesFiltered.length === config.obstacles.length &&
      !isYearSweepPlaying
    ) {
      return instantState;
    }
    return evaluateInstantaneousShading(
      { ...config, obstacles: rooftopObstaclesFiltered },
      activeDayOfYear,
      activeHourDec
    );
  }, [
    activeDayOfYear,
    activeHourDec,
    config,
    dayOfYear,
    instantState,
    isYearSweepPlaying,
    rooftopObstaclesFiltered,
    timeHourDec,
  ]);

  const liveSunArcPointsDeg = useMemo(() => {
    if (typeof dayOfYear === 'number' && sunArcPointsDeg && sunArcPointsDeg.length >= 2 && !isYearSweepPlaying) {
      return sunArcPointsDeg;
    }
    return computeDaySunArcPoints(config, activeDayOfYear);
  }, [activeDayOfYear, config, dayOfYear, isYearSweepPlaying, sunArcPointsDeg]);

  const displayTimeLabel = useMemo(() => {
    if (timeHourDec !== undefined || isYearSweepPlaying || localHourDec !== 11.5) {
      return formatSolarClockHour(activeHourDec);
    }
    return timeFormatted;
  }, [activeHourDec, isYearSweepPlaying, localHourDec, timeFormatted, timeHourDec]);

  const dayLabel = useMemo(() => formatDayOfYearLabel(activeDayOfYear), [activeDayOfYear]);

  const handleOpenDxfPreview = () => {
    const spacing = { ...DEFAULT_PANEL_SPACING_550W, azimuthDeg: config.azimuthCompassDeg };
    const payload = buildShadowCadDxfPayload(config, instantState, siteName, zones, spacing);
    const roofPoly = getHostRoofFootprintENU(config);
    const metrics = computePolygonMetricsENU(roofPoly);
    const setback = Math.max(0.25, config.perimeterSetbackM ?? 0.6);
    const insetPoly = computeInsetPolygonENU(roofPoly, setback);
    const usableAreaSqM = insetPoly.length >= 3 ? computePolygonMetricsENU(insetPoly).areaSqM : metrics.areaSqM * 0.85;
    const segPanels = (payload.arraySegments || []).reduce((s, seg) => s + seg.panelCount, 0);
    const fallbackPanels = (payload.shedRowsENU || []).length * Math.max(1, Math.floor(config.arrayWidthM / 1.15));
    const totalPanels = segPanels > 0 ? segPanels : fallbackPanels;
    const annualSim = runAnnualShadingSimulation(config);
    const orient =
      payload.arraySegments?.[0]?.orientation === 'landscape'
        ? 'Landscape'
        : payload.arraySegments?.[0]?.orientation === 'portrait'
        ? 'Portrait'
        : '550W';

    const yieldSummary = computeLayoutYieldSummary(
      totalPanels,
      spacing.panelWattage,
      annualSim,
      metrics.areaSqM,
      usableAreaSqM,
      (payload.arraySegments?.length || 0) || (payload.shedRowsENU?.length || 0),
      orient
    );

    setDxfPreviewRequest({
      fileNameBase: `${siteName || 'solar_site'}_autocad`,
      payload,
      yieldSummary,
    });
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
    const canvas = rendererRef.current?.domElement;
    if (!canvas || typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      return;
    }
    const mime =
      ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
        MediaRecorder.isTypeSupported(m)
      ) || '';
    try {
      if (recordedVideoUrl && recordedVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedVideoUrl);
        setRecordedVideoUrl(null);
      }
      const stream = canvas.captureStream(30);
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recordedChunksRef.current = [];
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mime || 'video/webm' });
        setRecordedVideoUrl(URL.createObjectURL(blob));
        setIsRecordingVideo(false);
      };
      mediaRecorderRef.current = recorder;
      setCameraPreset('tour_360');
      setIsRecordingVideo(true);
      recorder.start(250);
    } catch {
      setIsRecordingVideo(false);
    }
  };

  // Initialize Three.js WebGLRenderer, Scene, Camera, RoomEnvironment IBL & OrbitControls
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSwGl = detectSoftwareWebGL();
    isSoftwareGlRef.current = isSwGl;

    const width = Math.max(container.clientWidth || 340, 280);
    const height = Math.max(container.clientHeight || 340, 260);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSwGl,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    renderer.setPixelRatio(isSwGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    scene.fog = new THREE.Fog('#090d16', 75, 165);
    sceneRef.current = scene;

    // RoomEnvironment IBL for realistic galvanized steel & PV glass reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    scene.environmentIntensity = 0.7;

    const camera = new THREE.PerspectiveCamera(44, width / height, 0.25, 320);
    camera.position.set(16, 12.5, 17);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = !isSwGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2 - 0.03;
    controls.minDistance = 5;
    controls.maxDistance = 95;
    controls.update();
    controlsRef.current = controls;

    // Lighting rig: Ambient sky fill + directional sun key light
    const hemi = new THREE.HemisphereLight(0xbae6fd, 0x334155, 0.65);
    scene.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xfff4d6, 2.3);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(isSwGl ? 512 : 1024, isSwGl ? 512 : 1024);
    sunLight.shadow.camera.near = 2;
    sunLight.shadow.camera.far = 110;
    sunLight.shadow.camera.left = -38;
    sunLight.shadow.camera.right = 38;
    sunLight.shadow.camera.top = 38;
    sunLight.shadow.camera.bottom = -38;
    sunLight.shadow.bias = -0.0006;
    sunLight.shadow.normalBias = 0.025;
    sunLight.position.set(14, 18, 12);
    scene.add(sunLight);
    scene.add(sunLight.target);
    sunLightRef.current = sunLight;

    // Dynamic group holds strictly rooftop-bounded CAD scene + tight cardinal labels
    const dynGroupPlaceholder = new THREE.Group();
    dynGroupPlaceholder.name = 'rooftop-origin-anchor';
    scene.add(dynGroupPlaceholder);

    const dynGroup = new THREE.Group();
    scene.add(dynGroup);
    dynamicGroupRef.current = dynGroup;

    // Click Raycaster to select obstacles cleanly (ignoring drags)
    const raycaster = new THREE.Raycaster();
    const ptr = new THREE.Vector2();
    let downX = 0;
    let downY = 0;

    const handlePointerDown = (ev: PointerEvent) => {
      downX = ev.clientX;
      downY = ev.clientY;
    };
    const handlePointerUp = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - downX, ev.clientY - downY) > 6) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ptr.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ptr.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ptr, camera);
      const hits = raycaster.intersectObjects(clickableMeshesRef.current, true);
      if (hits.length > 0) {
        let cur: THREE.Object3D | null = hits[0].object;
        while (cur && !cur.userData?.obstacleId) {
          cur = cur.parent;
        }
        if (cur?.userData?.obstacleId) {
          onSelectObstacle(cur.userData.obstacleId as string);
        }
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    let rafId = 0;
    let dirty = true;
    const renderLoop = () => {
      if (dirty || controls.enableDamping) {
        controls.update();
        renderer.render(scene, camera);
        dirty = false;
      }
      if (controls.enableDamping) {
        rafId = requestAnimationFrame(renderLoop);
      } else {
        rafId = 0;
      }
    };

    const requestRender = () => {
      dirty = true;
      if (!rafId) {
        rafId = requestAnimationFrame(renderLoop);
      }
    };

    controls.addEventListener('change', requestRender);
    requestRender();

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth || 340, 280);
      const h = Math.max(container.clientHeight || 340, 260);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      requestRender();
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      controls.dispose();
      envTarget.dispose();
      roomEnv.dispose();
      pmremGenerator.dispose();
      if (overlayTexCacheRef.current) {
        overlayTexCacheRef.current.tex.dispose();
        overlayTexCacheRef.current = null;
      }
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      dynamicGroupRef.current = null;
    };
    // Intentionally mounted once for WebGL context stability
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Camera Presets & 360° AutoCAD Walkthrough Tour
  useEffect(() => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!cam || !ctrl || !renderer || !scene) return;

    const applyPreset = () => {
      if (cameraPreset === '3d_iso') {
        cam.position.set(16, 12.5, 17);
        ctrl.target.set(0, 1.0, 0);
      } else if (cameraPreset === 'top_plan') {
        cam.position.set(0, 29, 0.01);
        ctrl.target.set(0, 0, 0);
      } else if (cameraPreset === 'south_elev') {
        cam.position.set(0, 4.2, 23);
        ctrl.target.set(0, 2.2, 0);
      } else if (cameraPreset === 'east_sect') {
        cam.position.set(23, 4.5, 0);
        ctrl.target.set(0, 2.2, 0);
      }
      ctrl.update();
      renderer.render(scene, cam);
    };

    if (cameraPreset !== 'tour_360') {
      applyPreset();
      return;
    }

    let stopped = false;
    let angle = Math.atan2(cam.position.z, cam.position.x);
    let timerId = 0;
    let rafId = 0;

    const stepTour = () => {
      if (stopped) return;
      angle += 0.012;
      const radius = 21;
      cam.position.set(Math.cos(angle) * radius, 11.5, Math.sin(angle) * radius);
      ctrl.target.set(0, 1.2, 0);
      ctrl.update();
      renderer.render(scene, cam);

      if (isSoftwareGlRef.current) {
        timerId = window.setTimeout(stepTour, 45);
      } else {
        rafId = requestAnimationFrame(stepTour);
      }
    };
    stepTour();

    return () => {
      stopped = true;
      if (timerId) window.clearTimeout(timerId);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [cameraPreset]);

  // Rebuild Dynamic Architectural AutoCAD Scene (Roof Slab, Drawing Sheet, MMS, PV Modules, Walkways, Obstacles, Shadows, Dimensions)
  useEffect(() => {
    const dyn = dynamicGroupRef.current;
    const sunLight = sunLightRef.current;
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const cam = cameraRef.current;
    if (!dyn || !sunLight || !renderer || !scene || !cam) return;

    // Dispose old dynamic geometries/materials/textures cleanly
    const disposeObjectTree = (obj: THREE.Object3D) => {
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => {
          if (!m) return;
          const anyMat = m as THREE.MeshStandardMaterial & { map?: THREE.Texture | null };
          if (
            anyMat.map &&
            anyMat.map !== overlayTexCacheRef.current?.tex
          ) {
            anyMat.map.dispose();
          }
          m.dispose();
        });
      });
    };

    while (dyn.children.length > 0) {
      const child = dyn.children[0];
      dyn.remove(child);
      disposeObjectTree(child);
    }
    clickableMeshesRef.current = [];

    const dimsGroup = new THREE.Group();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    // 1. Update Sun Light & Tightly Bounded Rooftop Cast Shadows
    const sunUp = liveInstantState.sunAltitudeDeg > 0.5;
    const altRad = Math.max(1, liveInstantState.sunAltitudeDeg) * DEG2RAD;
    const azRad = liveInstantState.sunAzimuthCompassDeg * DEG2RAD;
    // ENU (East=X, Up=Y, North=-Z)
    const sx = Math.cos(altRad) * Math.sin(azRad);
    const sy = Math.sin(altRad);
    const sz = -Math.cos(altRad) * Math.cos(azRad);

    // 2. Polygon Rooftop Deck Slab, Extruded Building Body, Perimeter Parapets & Setback Boundary
    const roofPoly = getHostRoofFootprintENU(config);
    const polyMetrics = computePolygonMetricsENU(roofPoly);
    const roofL = Math.max(8, polyMetrics.widthM || config.roofLengthM || config.arrayWidthM + 4);
    const roofW = Math.max(
      8,
      polyMetrics.depthM || config.roofWidthM || Math.max(12, layout.totalNorthSouthSpanM + 4)
    );
    const roofSpanM = Math.max(roofL, roofW);
    const shadowHalf = Math.max(9, Math.min(34, roofSpanM * 0.95));

    sunLight.intensity = sunUp ? 2.4 : 0.25;
    sunLight.position.set(
      polyMetrics.cx + sx * Math.max(24, roofSpanM * 1.4),
      Math.max(2, sy * Math.max(24, roofSpanM * 1.4)),
      -polyMetrics.cy + sz * Math.max(24, roofSpanM * 1.4)
    );
    sunLight.target.position.set(polyMetrics.cx, 0.5, -polyMetrics.cy);
    sunLight.target.updateMatrixWorld();
    sunLight.shadow.camera.left = -shadowHalf;
    sunLight.shadow.camera.right = shadowHalf;
    sunLight.shadow.camera.top = shadowHalf;
    sunLight.shadow.camera.bottom = -shadowHalf;
    sunLight.shadow.camera.updateProjectionMatrix();
    sunLight.castShadow = sunUp;

    const setback = Math.max(0.25, config.perimeterSetbackM ?? 0.6);
    const bldgH = Math.max(2.5, config.buildingHeightM ?? 5.4);
    const parapetH = Math.max(0.2, config.parapetHeightM ?? 1.0);

    const concreteTex = createConcreteSlabTexture();
    concreteTex.anisotropy = Math.min(4, maxAniso);

    const roofShape = new THREE.Shape();
    roofPoly.forEach((pt, idx) => {
      if (idx === 0) roofShape.moveTo(pt.x, pt.y);
      else roofShape.lineTo(pt.x, pt.y);
    });
    roofShape.closePath();

    // Tightly attached cardinal indicators right outside the roof boundary
    const halfSpanPad = roofSpanM * 0.55 + 1.8;
    const tightCardinals: Array<{ label: string; pos: [number, number, number]; fg: string; border: string }> = [
      { label: 'N (0°)', pos: [polyMetrics.cx, 0.45, -polyMetrics.cy - halfSpanPad], fg: '#fca5a5', border: '#ef4444' },
      { label: 'S (180°)', pos: [polyMetrics.cx, 0.45, -polyMetrics.cy + halfSpanPad], fg: '#fde047', border: '#f59e0b' },
      { label: 'E (90°)', pos: [polyMetrics.cx + halfSpanPad, 0.45, -polyMetrics.cy], fg: '#7dd3fc', border: '#0ea5e9' },
      { label: 'W (270°)', pos: [polyMetrics.cx - halfSpanPad, 0.45, -polyMetrics.cy], fg: '#cbd5e1', border: '#64748b' },
    ];
    tightCardinals.forEach((c) => {
      const sp = createTextSprite(c.label, {
        bg: 'rgba(15,23,42,0.88)',
        fg: c.fg,
        border: c.border,
        scale: 0.62,
      });
      sp.position.set(...c.pos);
      dyn.add(sp);
    });

    if (showBuildingFootprint) {
      // Extruded Architectural Building Body downward from Roof Deck (Y=0 down to -bldgH)
      const facadeTex = createBuildingFacadeTexture(bldgH, config.roofStructureType);
      facadeTex.anisotropy = Math.min(4, maxAniso);
      const bodyGeo = new THREE.ExtrudeGeometry(roofShape, {
        depth: bldgH - 0.16,
        bevelEnabled: false,
      });
      const bodyMat = new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: 0xe2e8f0,
        roughness: 0.72,
        metalness: 0.14,
      });
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.rotation.x = -Math.PI / 2;
      bodyMesh.position.y = -bldgH;
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      dyn.add(bodyMesh);

      if (showCadEdges) {
        const bodyEdge = new THREE.LineSegments(
          new THREE.EdgesGeometry(bodyGeo),
          new THREE.LineBasicMaterial({ color: 0x475569 })
        );
        bodyEdge.rotation.x = -Math.PI / 2;
        bodyEdge.position.y = -bldgH;
        dyn.add(bodyEdge);
      }

      // Top Polygon Concrete Deck Slab strictly inside roofPoly (no overhang bevel outside roof)
      const slabGeo = new THREE.ExtrudeGeometry(roofShape, {
        depth: 0.18,
        bevelEnabled: false,
      });
      const slabMat = new THREE.MeshStandardMaterial({
        map: concreteTex,
        roughness: 0.85,
        metalness: 0.06,
      });
      const slabMesh = new THREE.Mesh(slabGeo, slabMat);
      slabMesh.rotation.x = -Math.PI / 2;
      slabMesh.position.y = -0.18;
      slabMesh.receiveShadow = true;
      dyn.add(slabMesh);

      if (showCadEdges) {
        const slabEdge = new THREE.LineSegments(
          new THREE.EdgesGeometry(slabGeo),
          new THREE.LineBasicMaterial({ color: 0x38bdf8 })
        );
        slabEdge.rotation.x = -Math.PI / 2;
        slabEdge.position.y = -0.18;
        dyn.add(slabEdge);
      }

      // Optional Pitched Gable / Shed Slope Roof Profile
      if (config.roofStructureType === 'gabled' || config.roofStructureType === 'shed_slope') {
        const w = Math.max(2, roofL);
        const d = Math.max(2, roofW);
        const peakH = Math.min(3.0, Math.max(1.1, d * 0.14));
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
        const pGeo = new THREE.ExtrudeGeometry(prof, { depth: w, bevelEnabled: false });
        pGeo.translate(0, 0, -w / 2);
        pGeo.rotateY(Math.PI / 2);
        const pMesh = new THREE.Mesh(
          pGeo,
          new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.55, metalness: 0.35, transparent: true, opacity: 0.85 })
        );
        pMesh.position.set(polyMetrics.cx, 0.02, -polyMetrics.cy);
        pMesh.castShadow = true;
        pMesh.receiveShadow = true;
        dyn.add(pMesh);
      }

      // Polygon Perimeter Safety Setback Line
      const insetPoly = computeInsetPolygonENU(roofPoly, setback);
      const sbPts = insetPoly.map((pt) => new THREE.Vector3(pt.x, 0.03, -pt.y));
      if (sbPts.length >= 3) {
        sbPts.push(sbPts[0].clone());
        const sbLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(sbPts),
          new THREE.LineBasicMaterial({ color: 0xf59e0b })
        );
        dyn.add(sbLine);
      }
    } else {
      // Thin architectural footprint wireframe outline when Building Footprint is toggled off
      const outlinePts = roofPoly.map((pt) => new THREE.Vector3(pt.x, 0.015, -pt.y));
      if (outlinePts.length >= 3) {
        outlinePts.push(outlinePts[0].clone());
        dyn.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(outlinePts),
            new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.55 })
          )
        );
      }
    }

    // Polygon Perimeter Parapet Walls + Coping Trim along every edge (gated by Architectural Walls toggle)
    if (showArchitecturalWalls && config.roofStructureType !== 'gabled') {
      const parapetMat = new THREE.MeshStandardMaterial({
        color: 0x94a3b8,
        roughness: 0.8,
        metalness: 0.1,
      });
      const copingMat = new THREE.MeshStandardMaterial({
        color: 0x475569,
        roughness: 0.35,
        metalness: 0.72,
      });
      for (let i = 0; i < roofPoly.length; i++) {
        const p1 = roofPoly[i];
        const p2 = roofPoly[(i + 1) % roofPoly.length];
        const dx = p2.x - p1.x;
        const dz = -p2.y - -p1.y;
        const len = Math.hypot(dx, dz);
        if (len < 0.25) continue;
        const yaw = -Math.atan2(dz, dx);
        const cxEdge = (p1.x + p2.x) / 2;
        const czEdge = -(p1.y + p2.y) / 2;

        const pWall = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, len), parapetH, 0.24), parapetMat);
        pWall.position.set(cxEdge, parapetH / 2, czEdge);
        pWall.rotation.y = yaw;
        pWall.castShadow = true;
        pWall.receiveShadow = true;
        dyn.add(pWall);

        const pCoping = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, len + 0.04), 0.06, 0.28), copingMat);
        pCoping.position.set(cxEdge, parapetH + 0.03, czEdge);
        pCoping.rotation.y = yaw;
        pCoping.castShadow = true;
        dyn.add(pCoping);
      }
    }

    // Calibrated Site Drawing / Wall Plan Overlay strictly clipped inside roofShape
    if (showArchitecturalWalls && uploadedDrawing && uploadedDrawing.visible && uploadedDrawing.url) {
      const renderDrawingPlane = (tex: THREE.Texture) => {
        const clippedGeo = new THREE.ShapeGeometry(roofShape);
        const pos = clippedGeo.attributes.position;
        const uv = clippedGeo.attributes.uv;
        const spanW = Math.max(1, polyMetrics.maxX - polyMetrics.minX);
        const spanD = Math.max(1, polyMetrics.maxY - polyMetrics.minY);
        if (pos && uv) {
          for (let idx = 0; idx < pos.count; idx++) {
            const vx = pos.getX(idx);
            const vy = pos.getY(idx);
            uv.setXY(
              idx,
              Math.max(0, Math.min(1, (vx - polyMetrics.minX) / spanW)),
              Math.max(0, Math.min(1, (vy - polyMetrics.minY) / spanD))
            );
          }
          uv.needsUpdate = true;
        }
        const planeMat = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity: uploadedDrawing.opacity,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          depthWrite: false,
        });
        const sheetMesh = new THREE.Mesh(clippedGeo, planeMat);
        sheetMesh.rotation.x = -Math.PI / 2;
        sheetMesh.position.set(0, 0.018, 0);
        dyn.add(sheetMesh);
      };

      if (overlayTexCacheRef.current?.url === uploadedDrawing.url) {
        renderDrawingPlane(overlayTexCacheRef.current.tex);
      } else {
        const loader = new THREE.TextureLoader();
        loader.load(uploadedDrawing.url, (loadedTex) => {
          loadedTex.colorSpace = THREE.SRGBColorSpace;
          loadedTex.anisotropy = Math.min(4, maxAniso);
          if (overlayTexCacheRef.current) {
            overlayTexCacheRef.current.tex.dispose();
          }
          overlayTexCacheRef.current = { url: uploadedDrawing.url, tex: loadedTex };
          renderDrawingPlane(loadedTex);
          renderer.render(scene, cam);
        });
      }
    }

    // 3. Multi-Part Solar Mounting Structures (MMS) + Live Shaded PV Module Arrays
    const showStructure = showPvStructures && assemblyLayer !== 'building_only';
    const showPanels = showPvStructures && assemblyLayer === 'structure_and_panels';

    const planeAzRad = config.azimuthCompassDeg * DEG2RAD;
    const beta = config.tiltDeg * DEG2RAD;
    const W = Math.max(2, config.arrayWidthM);
    const L = Math.max(1, config.collectorWidthM);
    const baseClear =
      structureConfig?.structureStyle === 'elevated_pergola'
        ? Math.max(2.1, config.mmsClearanceM ?? 0.35)
        : Math.max(0.2, config.mmsClearanceM ?? 0.35);
    const mmsClearance = baseClear;

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.78,
      roughness: 0.3,
    });
    const footingMat = new THREE.MeshStandardMaterial({
      color: structureConfig?.includeBrickPedestals ? 0x9a3412 : 0x94a3b8,
      roughness: 0.9,
      metalness: 0.05,
    });
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      metalness: 0.7,
      roughness: 0.28,
    });

    const pvCellTex = createPvCellTexture(
      liveInstantState.shadedCellGrid,
      liveInstantState.isBehindPlane,
      liveInstantState.isBelowHorizon
    );
    pvCellTex.anisotropy = Math.min(4, maxAniso);
    const pvGlassMat = new THREE.MeshStandardMaterial({
      map: pvCellTex,
      roughness: 0.16,
      metalness: 0.25,
      envMapIntensity: 1.15,
    });

    const cosAz = Math.cos(planeAzRad);
    const sinAz = Math.sin(planeAzRad);
    const rowStepThreeX = -sinAz;
    const rowStepThreeZ = cosAz;
    const uThreeX = cosAz;
    const uThreeZ = sinAz;

    const arrayYawRad = (180 - config.azimuthCompassDeg) * DEG2RAD;
    const horizL = L * Math.cos(beta);
    const riseH = L * Math.sin(beta);

    const rooftopZones = (zones || [])
      .filter((z) => z.zoneType === 'rooftop' && z.enabled !== false)
      .map((z) => clampZoneToRoofFootprint(z, roofPoly, setback));

    if (showStructure && rooftopZones.length > 0) {
      rooftopZones.forEach((z) => {
        const zoneGroup = new THREE.Group();
        zoneGroup.position.set(z.centerX, 0, -z.centerY);
        zoneGroup.rotation.y = (180 - (z.azimuthDeg || config.azimuthCompassDeg)) * DEG2RAD;

        const zTilt = (z.tiltDeg || config.tiltDeg) * DEG2RAD;
        const zClear = Math.max(0.35, mmsClearance + (z.elevationOffsetM ?? 0));
        const zRise = Math.sin(zTilt) * (z.depthM * 0.85);
        const colN = Math.max(2, Math.round(z.widthM / Math.max(2.0, structureConfig?.columnGridSpacingM || 3.2)) + 1);
        const legXs = Array.from({ length: colN }).map(
          (_, i) => -z.widthM * 0.45 + (i / Math.max(1, colN - 1)) * (z.widthM * 0.9)
        );
        const legZs = [-z.depthM * 0.4, z.depthM * 0.4];

        legXs.forEach((lx) => {
          legZs.forEach((lz, zi) => {
            const cH = zClear + (zi === 0 ? zRise : 0);
            const col = new THREE.Mesh(new THREE.BoxGeometry(0.08, cH, 0.08), steelMat);
            col.position.set(lx, cH / 2, lz);
            col.castShadow = true;
            zoneGroup.add(col);

            const padH = structureConfig?.includeBrickPedestals ? 0.22 : 0.08;
            const pad = new THREE.Mesh(new THREE.BoxGeometry(0.26, padH, 0.26), footingMat);
            pad.position.set(lx, padH / 2, lz);
            pad.receiveShadow = true;
            zoneGroup.add(pad);
          });

          const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, z.depthM * 0.94), steelMat);
          rafter.position.set(lx, zClear + zRise * 0.5, 0);
          rafter.rotation.x = zTilt;
          zoneGroup.add(rafter);
        });

        [-0.32, 0, 0.32].forEach((frac) => {
          const pz = frac * z.depthM;
          const py = zClear + (0.5 - frac) * zRise + 0.04;
          const purlin = new THREE.Mesh(new THREE.BoxGeometry(z.widthM + 0.08, 0.05, 0.05), steelMat);
          purlin.position.set(0, py, pz);
          zoneGroup.add(purlin);
        });

        if (showPanels) {
          const pack = packPanelsInSegmentENU(
            {
              centerX: z.centerX,
              centerY: z.centerY,
              widthM: z.widthM,
              depthM: z.depthM,
              azimuthDeg: z.azimuthDeg || config.azimuthCompassDeg,
            },
            { ...DEFAULT_PANEL_SPACING_550W, azimuthDeg: z.azimuthDeg || config.azimuthCompassDeg },
            roofPoly,
            setback,
            config.obstacles
          );

          const rotRad = (((z.azimuthDeg || config.azimuthCompassDeg) - 180) * Math.PI) / 180;
          const ux = Math.cos(rotRad);
          const uy = -Math.sin(rotRad);
          const vx = Math.sin(rotRad);
          const vy = Math.cos(rotRad);

          pack.panels.forEach((mod) => {
            const dxENU = mod.centerENU.x - z.centerX;
            const dyENU = mod.centerENU.y - z.centerY;
            const mx = dxENU * ux + dyENU * uy;
            const mz = -(dxENU * vx + dyENU * vy);
            const fracZ = z.depthM > 0 ? mz / z.depthM : 0;
            const my = zClear + (0.5 - fracZ) * zRise + 0.1;

            const modPivot = new THREE.Group();
            modPivot.position.set(mx, my, mz);
            modPivot.rotation.x = zTilt;

            const mFrame = new THREE.Mesh(
              new THREE.BoxGeometry(mod.widthM, 0.045, mod.lengthM),
              frameMat
            );
            mFrame.castShadow = true;
            mFrame.receiveShadow = true;
            modPivot.add(mFrame);

            const mCell = new THREE.Mesh(
              new THREE.PlaneGeometry(Math.max(0.2, mod.widthM - 0.06), Math.max(0.2, mod.lengthM - 0.06)),
              pvGlassMat
            );
            mCell.rotation.x = -Math.PI / 2;
            mCell.position.y = 0.026;
            modPivot.add(mCell);

            if (showCadEdges) {
              const mEdge = new THREE.LineSegments(
                new THREE.EdgesGeometry(new THREE.BoxGeometry(mod.widthM, 0.048, mod.lengthM)),
                new THREE.LineBasicMaterial({ color: 0x38bdf8 })
              );
              modPivot.add(mEdge);
            }
            zoneGroup.add(modPivot);
          });
        }

        dyn.add(zoneGroup);
      });
    } else if (showStructure) {
      const clampedW = Math.min(W, Math.max(2, roofL - setback * 2.2));
      layout.rowOffsetsM.forEach((off, rIdx) => {
        const cxENU = off * (-sinAz);
        const cyENU = off * (-cosAz);
        if (!isPointInPolygon2D(cxENU, cyENU, roofPoly)) return;

        const shedGroup = new THREE.Group();
        shedGroup.position.set(off * rowStepThreeX, 0, off * rowStepThreeZ);
        shedGroup.rotation.y = arrayYawRad;

        const legCount = Math.max(2, Math.min(6, Math.round(clampedW / 3) + 1));
        const frontZ = horizL * 0.5;
        const rearZ = -horizL * 0.5;
        const rearTopY = mmsClearance + riseH;

        for (let li = 0; li < legCount; li++) {
          const lx = -clampedW / 2 + 0.35 + (li / Math.max(1, legCount - 1)) * (clampedW - 0.7);
          const fH = Math.max(0.2, mmsClearance);
          const fCol = new THREE.Mesh(new THREE.BoxGeometry(0.08, fH, 0.08), steelMat);
          fCol.position.set(lx, fH / 2, frontZ - 0.1);
          fCol.castShadow = true;
          shedGroup.add(fCol);

          const fPad = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, structureConfig?.includeBrickPedestals ? 0.22 : 0.08, 0.26),
            footingMat
          );
          fPad.position.set(lx, structureConfig?.includeBrickPedestals ? 0.11 : 0.04, frontZ - 0.1);
          fPad.receiveShadow = true;
          shedGroup.add(fPad);

          const rH = Math.max(0.3, rearTopY);
          const rCol = new THREE.Mesh(new THREE.BoxGeometry(0.08, rH, 0.08), steelMat);
          rCol.position.set(lx, rH / 2, rearZ + 0.1);
          rCol.castShadow = true;
          shedGroup.add(rCol);

          const rPad = new THREE.Mesh(
            new THREE.BoxGeometry(0.26, structureConfig?.includeBrickPedestals ? 0.22 : 0.08, 0.26),
            footingMat
          );
          rPad.position.set(lx, structureConfig?.includeBrickPedestals ? 0.11 : 0.04, rearZ + 0.1);
          rPad.receiveShadow = true;
          shedGroup.add(rPad);

          const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, L), steelMat);
          rafter.position.set(lx, mmsClearance + riseH * 0.5 - 0.05, 0);
          rafter.rotation.x = beta;
          shedGroup.add(rafter);
        }

        [-L * 0.26, L * 0.26].forEach((vPos) => {
          const purlinY = mmsClearance + (0.5 - vPos / L) * riseH - 0.03;
          const purlinZ = (vPos / L) * horizL;
          const purlin = new THREE.Mesh(new THREE.BoxGeometry(clampedW + 0.1, 0.05, 0.05), steelMat);
          purlin.position.set(0, purlinY, purlinZ);
          shedGroup.add(purlin);
        });

        if (showPanels) {
          const collectorPivot = new THREE.Group();
          collectorPivot.position.set(0, mmsClearance + riseH * 0.5, 0);
          collectorPivot.rotation.x = beta;

          const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(clampedW, 0.045, L), frameMat);
          frameMesh.castShadow = true;
          frameMesh.receiveShadow = true;
          collectorPivot.add(frameMesh);

          const cellPlane = new THREE.Mesh(new THREE.PlaneGeometry(clampedW - 0.08, L - 0.08), pvGlassMat);
          cellPlane.rotation.x = -Math.PI / 2;
          cellPlane.position.y = 0.026;
          cellPlane.receiveShadow = true;
          collectorPivot.add(cellPlane);

          if (showCadEdges) {
            const modEdges = new THREE.LineSegments(
              new THREE.EdgesGeometry(new THREE.BoxGeometry(clampedW, 0.048, L)),
              new THREE.LineBasicMaterial({ color: 0x38bdf8 })
            );
            collectorPivot.add(modEdges);
          }

          shedGroup.add(collectorPivot);
        }

        dyn.add(shedGroup);

        if (showDimensions && rIdx === 0) {
          const ridgeY = mmsClearance + riseH;
          const pLeft = new THREE.Vector3(
            off * rowStepThreeX - (clampedW / 2) * uThreeX,
            ridgeY + 0.45,
            off * rowStepThreeZ - (clampedW / 2) * uThreeZ
          );
          const pRight = new THREE.Vector3(
            off * rowStepThreeX + (clampedW / 2) * uThreeX,
            ridgeY + 0.45,
            off * rowStepThreeZ + (clampedW / 2) * uThreeZ
          );
          addAutoCadDimensionLine(dimsGroup, pLeft, pRight, `Row W=${clampedW.toFixed(1)}m · β=${config.tiltDeg}°`, 0x38bdf8);
        }
      });

      if (showDimensions && layout.rowOffsetsM.length >= 2) {
        const o0 = layout.rowOffsetsM[0];
        const o1 = layout.rowOffsetsM[1];
        const edgeOffset = clampedW / 2 + 0.65;
        const pA = new THREE.Vector3(
          o0 * rowStepThreeX + edgeOffset * uThreeX,
          0.15,
          o0 * rowStepThreeZ + edgeOffset * uThreeZ
        );
        const pB = new THREE.Vector3(
          o1 * rowStepThreeX + edgeOffset * uThreeX,
          0.15,
          o1 * rowStepThreeZ + edgeOffset * uThreeZ
        );
        addAutoCadDimensionLine(
          dimsGroup,
          pA,
          pB,
          `Pitch ${Math.abs(o1 - o0).toFixed(2)}m`,
          0xa855f7
        );
      }

      // 4. Built-in Grated O&M Service Walkways & Yellow Safety Handrails
      const walkwayTex = createWalkwayGratingTexture();
      walkwayTex.anisotropy = Math.min(4, maxAniso);
      const walkwayDeckMat = new THREE.MeshStandardMaterial({
        map: walkwayTex,
        roughness: 0.45,
        metalness: 0.6,
      });
      const yellowSafetyMat = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        roughness: 0.35,
        metalness: 0.4,
      });

      layout.walkwayAisles.forEach((aisle, wIdx) => {
        const axENU = aisle.offsetM * (-sinAz);
        const ayENU = aisle.offsetM * (-cosAz);
        if (!isPointInPolygon2D(axENU, ayENU, roofPoly)) return;

        const wkGroup = new THREE.Group();
        wkGroup.position.set(aisle.offsetM * rowStepThreeX, 0, aisle.offsetM * rowStepThreeZ);
        wkGroup.rotation.y = arrayYawRad;

        const spanLen = clampedW + 0.8;
        const plank = new THREE.Mesh(
          new THREE.BoxGeometry(spanLen, 0.055, aisle.widthM),
          walkwayDeckMat
        );
        plank.position.y = 0.04;
        plank.castShadow = true;
        plank.receiveShadow = true;
        wkGroup.add(plank);

        [-aisle.widthM / 2, aisle.widthM / 2].forEach((zEdge) => {
          const curb = new THREE.Mesh(
            new THREE.BoxGeometry(spanLen, 0.07, 0.04),
            yellowSafetyMat
          );
          curb.position.set(0, 0.045, zEdge);
          wkGroup.add(curb);
        });

        [-spanLen / 2 + 0.1, spanLen / 2 - 0.1].forEach((px) => {
          const post = new THREE.Mesh(
            new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8),
            yellowSafetyMat
          );
          post.position.set(px, 0.45, 0);
          post.castShadow = true;
          wkGroup.add(post);
        });

        dyn.add(wkGroup);

        if (showDimensions && wIdx === 0) {
          const sp = createTextSprite(`Walkway ${aisle.widthM.toFixed(2)}m`, {
            bg: 'rgba(15,23,42,0.9)',
            border: '#f59e0b',
            fg: '#fde68a',
            scale: 0.65,
          });
          sp.position.set(
            aisle.offsetM * rowStepThreeX,
            0.95,
            aisle.offsetM * rowStepThreeZ
          );
          dimsGroup.add(sp);
        }
      });
    } else if (showPvStructures && rooftopZones.length > 0) {
      // In Building-Only stage, draw rooftop candidate zone outlines strictly inside the roof deck
      rooftopZones.forEach((z) => {
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(z.widthM, 0.04, z.depthM),
          new THREE.MeshStandardMaterial({
            color: 0xef4444,
            transparent: true,
            opacity: 0.35,
          })
        );
        pad.position.set(z.centerX, 0.04, -z.centerY);
        dyn.add(pad);
      });
    }

    // 5. Interior Rooftop Obstacles Strictly Filtered to Roof Polygon (No off-roof OSM buildings)
    const rooftopObstacles = showArchitecturalWalls
      ? filterObstaclesInsideRoofPolygon(config.obstacles, roofPoly)
      : [];
    rooftopObstacles.forEach((obs: NearObstacle) => {
      const center = getObstacleCenterENU(obs);
      const isSelected = obs.id === selectedObstacleId;
      const proj = liveInstantState.obstacleProjections.find((p) => p.id === obs.id);
      const isCasting = proj?.castsShadeOnArray;
      const shape =
        obs.nodesENU && obs.nodesENU.length >= 3
          ? 'polygon'
          : obs.shape ||
            (obs.category === 'Water Tank' || obs.category === 'Tree' || obs.category === 'Pole'
              ? 'cylinder'
              : obs.category === 'Parapet'
              ? 'wall'
              : 'box');

      const isGroundBased =
        obs.id.startsWith('osm-bldg-') ||
        typeof obs.totalHeightFromGroundM === 'number' ||
        ((obs.category === 'Building' || obs.category === 'Tree') &&
          !isPointInPolygon2D(center.x, center.y, roofPoly));
      const baseY = isGroundBased ? -bldgH : 0;
      const extrudeH = isGroundBased
        ? Math.max(0.4, obs.totalHeightFromGroundM ?? bldgH + obs.heightM)
        : Math.max(0.2, obs.heightM);
      const topY = baseY + extrudeH;

      const obsGroup = new THREE.Group();
      obsGroup.userData = { obstacleId: obs.id };

      if (shape === 'polygon' && obs.nodesENU && obs.nodesENU.length >= 3) {
        const polyShape = new THREE.Shape();
        obs.nodesENU.forEach((pt, idx) => {
          if (idx === 0) polyShape.moveTo(pt.x, pt.y);
          else polyShape.lineTo(pt.x, pt.y);
        });
        polyShape.closePath();

        const extGeo = new THREE.ExtrudeGeometry(polyShape, {
          depth: extrudeH,
          bevelEnabled: false,
        });
        const extMat = new THREE.MeshStandardMaterial({
          color: isSelected
            ? 0xf59e0b
            : isCasting
            ? 0x7e22ce
            : obs.id.startsWith('osm-bldg-')
            ? 0x64748b
            : 0x475569,
          roughness: 0.72,
          metalness: 0.12,
        });
        const extMesh = new THREE.Mesh(extGeo, extMat);
        extMesh.rotation.x = -Math.PI / 2;
        extMesh.position.y = baseY;
        extMesh.castShadow = true;
        extMesh.receiveShadow = true;
        obsGroup.add(extMesh);

        if (showCadEdges || isSelected) {
          const edgeMesh = new THREE.LineSegments(
            new THREE.EdgesGeometry(extGeo),
            new THREE.LineBasicMaterial({ color: isSelected ? 0xfde047 : 0xcbd5e1 })
          );
          edgeMesh.rotation.x = -Math.PI / 2;
          edgeMesh.position.y = baseY;
          obsGroup.add(edgeMesh);
        }
      } else if (shape === 'cylinder') {
        const radius = Math.max(0.25, Math.max(obs.widthM, obs.depthM) / 2);
        if (obs.category === 'Tree') {
          const trunkH = Math.max(0.8, extrudeH * 0.45);
          const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.16, radius * 0.26, trunkH, 10),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 })
          );
          trunk.position.set(center.x, baseY + trunkH / 2, -center.y);
          trunk.castShadow = true;
          obsGroup.add(trunk);

          const crownMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xf59e0b : isCasting ? 0x9333ea : 0x15803d,
            roughness: 0.85,
          });
          const crownMain = new THREE.Mesh(
            new THREE.DodecahedronGeometry(radius * 0.86, 1),
            crownMat
          );
          crownMain.position.set(center.x, baseY + extrudeH * 0.65, -center.y);
          crownMain.castShadow = true;
          crownMain.receiveShadow = true;
          obsGroup.add(crownMain);

          const crownSide = new THREE.Mesh(
            new THREE.DodecahedronGeometry(radius * 0.56, 1),
            crownMat
          );
          crownSide.position.set(
            center.x + radius * 0.34,
            baseY + extrudeH * 0.8,
            -center.y - radius * 0.22
          );
          crownSide.castShadow = true;
          obsGroup.add(crownSide);
        } else {
          // Multi-part Overhead Water Tank on Galvanized Steel Staging Legs
          const standH = extrudeH * 0.34;
          const drumH = extrudeH * 0.62;
          const legMat = new THREE.MeshStandardMaterial({
            color: 0x94a3b8,
            roughness: 0.35,
            metalness: 0.78,
          });
          [
            [-radius * 0.58, -radius * 0.58],
            [radius * 0.58, -radius * 0.58],
            [radius * 0.58, radius * 0.58],
            [-radius * 0.58, radius * 0.58],
          ].forEach(([lx, lz]) => {
            const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, standH, 0.1), legMat);
            leg.position.set(center.x + lx, baseY + standH / 2, -center.y + lz);
            leg.castShadow = true;
            obsGroup.add(leg);
          });

          const platform = new THREE.Mesh(
            new THREE.BoxGeometry(radius * 1.45, 0.09, radius * 1.45),
            new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.65 })
          );
          platform.position.set(center.x, baseY + standH, -center.y);
          platform.castShadow = true;
          obsGroup.add(platform);

          const cylGeo = new THREE.CylinderGeometry(radius, radius * 1.02, drumH, 20);
          const cylMat = new THREE.MeshStandardMaterial({
            color: isSelected ? 0xf59e0b : isCasting ? 0x9333ea : 0x0e7490,
            roughness: 0.42,
            metalness: 0.35,
          });
          const cylMesh = new THREE.Mesh(cylGeo, cylMat);
          cylMesh.position.set(center.x, baseY + standH + drumH / 2 + 0.04, -center.y);
          cylMesh.castShadow = true;
          cylMesh.receiveShadow = true;
          obsGroup.add(cylMesh);

          const lidMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(radius * 0.38, radius * 0.44, 0.12, 16),
            new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 })
          );
          lidMesh.position.set(center.x, baseY + standH + drumH + 0.09, -center.y);
          obsGroup.add(lidMesh);
        }
      } else {
        // Oriented Building or Parapet Wall Box
        const boxGeo = new THREE.BoxGeometry(
          Math.max(0.25, obs.widthM),
          extrudeH,
          Math.max(0.25, obs.depthM)
        );
        const boxMat = new THREE.MeshStandardMaterial({
          color:
            isSelected
              ? 0xf59e0b
              : obs.category === 'Parapet'
              ? 0x94a3b8
              : isCasting
              ? 0x7e22ce
              : 0x475569,
          roughness: 0.72,
          metalness: 0.1,
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        boxMesh.position.set(center.x, baseY + extrudeH / 2, -center.y);
        boxMesh.rotation.y = -((obs.rotationDeg ?? 0) * DEG2RAD);
        boxMesh.castShadow = true;
        boxMesh.receiveShadow = true;
        obsGroup.add(boxMesh);

        if (showCadEdges || isSelected) {
          const edgeSeg = new THREE.LineSegments(
            new THREE.EdgesGeometry(boxGeo),
            new THREE.LineBasicMaterial({ color: isSelected ? 0xfde047 : 0xe2e8f0 })
          );
          edgeSeg.position.copy(boxMesh.position);
          edgeSeg.rotation.copy(boxMesh.rotation);
          obsGroup.add(edgeSeg);
        }
      }

      if (showDimensions && (isSelected || isCasting)) {
        const sp = createTextSprite(
          `${obs.name.split(' ').slice(0, 2).join(' ')} H=${extrudeH.toFixed(1)}m${
            proj && proj.shadowLengthM > 0 ? ` · S=${proj.shadowLengthM}m` : ''
          }`,
          {
            bg: isSelected ? 'rgba(120, 53, 15, 0.92)' : 'rgba(59, 7, 100, 0.9)',
            border: isSelected ? '#f59e0b' : '#c084fc',
            fg: '#fef3c7',
            scale: 0.66,
          }
        );
        sp.position.set(center.x, topY + 0.85, -center.y);
        dimsGroup.add(sp);
      }

      clickableMeshesRef.current.push(obsGroup);
      dyn.add(obsGroup);
    });

    // 6. Sun Trajectory Arc & Live Sun Orb + Ray Vector (for active day of year)
    const sunRadius = Math.max(15, roofSpanM * 0.95);
    if (liveSunArcPointsDeg && liveSunArcPointsDeg.length > 2) {
      const arcPts = liveSunArcPointsDeg
        .filter((pt) => pt.altitudeDeg >= 0)
        .map((pt) => {
          const aRad = pt.altitudeDeg * DEG2RAD;
          const zRad = pt.azimuthCompassDeg * DEG2RAD;
          return new THREE.Vector3(
            polyMetrics.cx + sunRadius * Math.cos(aRad) * Math.sin(zRad),
            Math.max(0.15, sunRadius * Math.sin(aRad)),
            -polyMetrics.cy - sunRadius * Math.cos(aRad) * Math.cos(zRad)
          );
        });
      if (arcPts.length >= 2) {
        const arcLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(arcPts),
          new THREE.LineBasicMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.5 })
        );
        dyn.add(arcLine);
      }
    }

    if (sunUp) {
      const sunPos = new THREE.Vector3(
        polyMetrics.cx + sx * sunRadius,
        Math.max(1.2, sy * sunRadius),
        -polyMetrics.cy + sz * sunRadius
      );
      const sunOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.68, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      );
      sunOrb.position.copy(sunPos);
      dyn.add(sunOrb);

      const rayMat = new THREE.LineDashedMaterial({
        color: 0xf59e0b,
        dashSize: 0.6,
        gapSize: 0.35,
        transparent: true,
        opacity: 0.78,
      });
      const rayLine = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([
          sunPos,
          new THREE.Vector3(polyMetrics.cx, 0.7, -polyMetrics.cy),
        ]),
        rayMat
      );
      rayLine.computeLineDistances();
      dyn.add(rayLine);
    }

    // Overall Roof Polygon Bounding Dimension Callouts
    if (showDimensions) {
      addAutoCadDimensionLine(
        dimsGroup,
        new THREE.Vector3(polyMetrics.minX, parapetH + 0.25, -polyMetrics.minY + 1.1),
        new THREE.Vector3(polyMetrics.maxX, parapetH + 0.25, -polyMetrics.minY + 1.1),
        `Span ${roofL.toFixed(1)}m · ${polyMetrics.areaSqM}m²`,
        0x94a3b8
      );
      addAutoCadDimensionLine(
        dimsGroup,
        new THREE.Vector3(polyMetrics.minX - 1.1, parapetH + 0.25, -polyMetrics.maxY),
        new THREE.Vector3(polyMetrics.minX - 1.1, parapetH + 0.25, -polyMetrics.minY),
        `Depth ${roofW.toFixed(1)}m`,
        0x94a3b8
      );
      dyn.add(dimsGroup);
    }

    renderer.render(scene, cam);
  }, [
    assemblyLayer,
    config,
    layout,
    liveInstantState,
    liveSunArcPointsDeg,
    selectedObstacleId,
    showArchitecturalWalls,
    showBuildingFootprint,
    showCadEdges,
    showDimensions,
    showPvStructures,
    structureConfig,
    uploadedDrawing,
    zones,
  ]);

  return (
    <div className="space-y-2">
    <div
      className={`w-full rounded-2xl bg-[#090d16] relative overflow-hidden border border-slate-700/80 shadow-inner ${
        isFullscreenWorkspace
          ? 'flex-1 min-h-[340px] h-full'
          : isFullscreenHeight
          ? 'h-[440px]'
          : 'h-[340px]'
      } ${className}`}
    >
      {/* Pure Full-Bleed WebGL Canvas */}
      <div
        ref={mountRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Minimal Corner Label */}
      <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700 text-[10px] font-mono tabular-nums text-slate-200 pointer-events-none flex items-center gap-2">
        <Box className="w-3 h-3 text-[#FF6F00]" />
        <span>
          AutoCAD 3D · {dayLabel} · {displayTimeLabel} · Alt {liveInstantState.sunAltitudeDeg.toFixed(0)}°
        </span>
      </div>

      {/* Expand Height / Export DXF / Video Record & Assembly Layer */}
      <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1 z-10">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleToggleRecordVideo}
            className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer border ${
              isRecordingVideo
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-slate-900/95 border-emerald-500/60 text-emerald-300 hover:text-white'
            }`}
            title="Record 360° AutoCAD Video (.webm)"
          >
            <Video className="w-3 h-3" />
            <span>{isRecordingVideo ? 'Stop' : 'Rec .webm'}</span>
          </button>
          <button
            type="button"
            onClick={handleOpenDxfPreview}
            className="px-2.5 py-1 rounded-xl bg-slate-900/95 border border-sky-500/60 text-sky-300 hover:text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
            title="Preview layout & annual yield before exporting .DXF"
          >
            <Download className="w-3 h-3" />
            <span>.DXF</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (onToggleFullscreen) {
                onToggleFullscreen();
              } else {
                setIsFullscreenHeight((v) => !v);
              }
            }}
            className="w-7 h-7 rounded-xl bg-slate-900/95 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer"
            title={
              onToggleFullscreen
                ? isFullscreenWorkspace
                  ? 'Exit Fullscreen Studio'
                  : 'Fullscreen CAD Studio'
                : isFullscreenHeight
                ? 'Compact Viewport'
                : 'Expand 3D Viewport'
            }
          >
            {isFullscreenWorkspace || isFullscreenHeight ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>

        <div className="flex items-center gap-1 bg-slate-950/90 p-0.5 rounded-lg border border-slate-700/80 text-[9px] font-bold">
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
              onClick={() => setAssemblyLayer(layer.id)}
              className={`px-1.5 py-0.5 rounded cursor-pointer ${
                assemblyLayer === layer.id ? 'bg-[#FF6F00] text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </div>

      {/* Consolidated Collapsible Bottom CAD HUD Dock */}
      <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-col items-stretch gap-1.5 pointer-events-none">
        {hudExpanded && (
          <div className="pointer-events-auto bg-slate-900/95 border border-slate-700 rounded-2xl p-2 flex flex-col gap-2 shadow-lg">
            {/* Full-Year Sun Simulation & Time-of-Day Shadow Projection Sliders */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 border-b border-slate-800 pb-1.5">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-bold text-amber-300 flex items-center gap-1">
                    <Sun className="w-3 h-3 text-amber-400" />
                    <span>Annual Sun · {dayLabel}</span>
                  </span>
                  <div className="flex items-center gap-1">
                    {ANNUAL_SOLAR_PRESETS.map((preset) => (
                      <button
                        key={preset.day}
                        type="button"
                        onClick={() => {
                          setIsYearSweepPlaying(false);
                          handleDayChange(preset.day);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold cursor-pointer ${
                          Math.abs(activeDayOfYear - preset.day) <= 3
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:text-white'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsYearSweepPlaying((v) => !v)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold flex items-center gap-0.5 cursor-pointer border ${
                        isYearSweepPlaying
                          ? 'bg-rose-600 border-rose-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-amber-300 hover:text-white'
                      }`}
                    >
                      {isYearSweepPlaying ? <Pause className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                      <span>Year</span>
                    </button>
                  </div>
                </div>
                <input
                  type="range"
                  min={1}
                  max={365}
                  step={1}
                  value={activeDayOfYear}
                  onChange={(e) => {
                    setIsYearSweepPlaying(false);
                    handleDayChange(Number(e.target.value));
                  }}
                  aria-label="Annual sun simulation day of year"
                  className="w-full accent-amber-400 cursor-pointer h-1.5"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="font-bold text-sky-300">
                    Daily Shadow Time · {displayTimeLabel}
                  </span>
                  <span className="font-mono tabular-nums text-slate-400">
                    Az {liveInstantState.sunAzimuthCompassDeg.toFixed(0)}° · Alt {liveInstantState.sunAltitudeDeg.toFixed(0)}°
                  </span>
                </div>
                <input
                  type="range"
                  min={5.5}
                  max={18.5}
                  step={0.25}
                  value={activeHourDec}
                  onChange={(e) => handleHourChange(Number(e.target.value))}
                  aria-label="Daily shadow hour"
                  className="w-full accent-sky-400 cursor-pointer h-1.5"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-1.5">
              {/* Camera View Presets */}
              <div className="flex flex-wrap items-center gap-1">
                {(
                  [
                    { id: '3d_iso', label: '3D Orbit', icon: Eye },
                    { id: 'top_plan', label: '2D Plan', icon: Compass },
                    { id: 'south_elev', label: 'South Elev', icon: Layers },
                    { id: 'east_sect', label: 'East Sect', icon: Grid },
                    { id: 'tour_360', label: '360° Tour', icon: RotateCw },
                  ] as Array<{ id: CadCameraPreset; label: string; icon: React.ComponentType<{ className?: string }> }>
                ).map((preset) => {
                  const Icon = preset.icon;
                  const active = cameraPreset === preset.id;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCameraPreset(preset.id)}
                      className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer transition ${
                        active
                          ? 'bg-[#FF6F00] text-white'
                          : 'bg-slate-800 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{preset.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Independent 3D Layer Toggles: Building Footprint, PV Arrays, Architectural Walls & CAD Dims */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowBuildingFootprint((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold cursor-pointer border ${
                    showBuildingFootprint
                      ? 'bg-slate-700 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Show or hide rooftop building footprint and deck slab"
                >
                  Building Footprint
                </button>

                <button
                  type="button"
                  onClick={() => setShowPvStructures((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold cursor-pointer border ${
                    showPvStructures
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Show or hide PV array structures and 550W modules"
                >
                  PV Arrays
                </button>

                <button
                  type="button"
                  onClick={() => setShowArchitecturalWalls((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold cursor-pointer border ${
                    showArchitecturalWalls
                      ? 'bg-amber-600 border-amber-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Show or hide architectural parapet walls, rooftop obstacles, and clipped plan sheet"
                >
                  Architectural Walls
                </button>

                <button
                  type="button"
                  onClick={() => setShowDimensions((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer border ${
                    showDimensions
                      ? 'bg-sky-600 border-sky-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Toggle Architectural Dimension Callouts"
                >
                  <Ruler className="w-3 h-3" />
                  <span>Dims</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowCadEdges((v) => !v)}
                  className={`px-2 py-1 rounded-xl text-[10px] font-bold cursor-pointer border ${
                    showCadEdges
                      ? 'bg-indigo-600 border-indigo-500 text-white'
                      : 'bg-slate-800 border-slate-700 text-slate-400'
                  }`}
                  title="Toggle AutoCAD Wireframe Edges"
                >
                  Edges
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2">
          <div className="px-2.5 py-1 rounded-xl bg-slate-900/90 border border-slate-700/80 text-[9.5px] font-mono text-slate-300 pointer-events-none truncate">
            Rooftop-Only CAD · Drag Orbit · Scroll Zoom · Walkways {config.walkwayWidthM ?? 0.75}m
          </div>
          <button
            type="button"
            onClick={() => setHudExpanded((v) => !v)}
            className="pointer-events-auto px-2.5 py-1 rounded-xl bg-slate-900/95 border border-slate-700 text-[10px] font-bold text-slate-200 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
          >
            <SlidersHorizontal className="w-3 h-3 text-[#FF6F00]" />
            <span>{hudExpanded ? 'Hide CAD Bar' : 'CAD Controls'}</span>
          </button>
        </div>
      </div>
    </div>

    {recordedVideoUrl && (
      <div className="bg-slate-900 rounded-2xl p-2.5 border border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-200">
        <span className="font-bold text-emerald-400">AutoCAD 3D Walkthrough Recording Ready</span>
        <a
          href={recordedVideoUrl}
          download={`${(siteName || 'solar_site').replace(/[^a-z0-9]+/gi, '_').toLowerCase()}_autocad_3d.webm`}
          className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download .WEBM</span>
        </a>
      </div>
    )}
      <DxfExportSummaryModal
        request={dxfPreviewRequest}
        onClose={() => setDxfPreviewRequest(null)}
      />
    </div>
  );
};
