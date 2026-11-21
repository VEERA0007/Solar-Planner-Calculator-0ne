import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Box,
  Building2,
  Check,
  Clock,
  Compass,
  Crosshair,
  Download,
  Hexagon,
  Image as ImageIcon,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Minus,
  MousePointer2,
  Navigation,
  PenTool,
  Plus,
  Satellite,
  Search,
  SlidersHorizontal,
  Square,
  Sun,
  Trash2,
  Trees,
  Undo2,
} from 'lucide-react';
import {
  InstantaneousShadingState,
  NearObstacle,
  SiteSimulationConfig,
  computeInsetPolygonENU,
  computePolygonMetricsENU as computeShadingPolygonMetricsENU,
  computeRowOffsetsAndWalkways,
  getHostRoofFootprintENU,
  getObstacleCenterENU,
  latLonToLocalMeters,
  localMetersToLatLon,
  runAnnualShadingSimulation,
} from '../utils/shadingSimulationEngine';
import {
  DEFAULT_PANEL_SPACING_550W,
  PanelSpacingSpec,
  packPanelsInSegmentENU,
  segmentAndPanelsToLatLon,
} from '../utils/panelArrayPackingEngine';
import { buildShadowCadDxfPayload } from '../utils/dxfExporter';
import {
  clampZoneToRoofFootprint,
  computeLayoutYieldSummary,
} from '../utils/rooftopZoneClamper';
import { searchAddressOrPlace } from '../services/weatherService';
import {
  AssemblyLayerMode,
  MmsStructureDesignConfig,
  PotentialPvZone,
  RealMapGroundOverlay,
  RealMapSource,
  RoofStructureType,
  SiteMeasurements,
  SiteMediaAsset,
  SiteVerificationStatus,
  UploadedDrawingOverlay,
} from '../types/siteSurvey';
import { AutoCadThreeViewport } from './AutoCadThreeViewport';
import { R3FSiteShadowVisualizer } from './R3FSiteShadowVisualizer';
import { RoofBoundaryPolygonView } from './RoofBoundaryPolygonView';
import { CadMediaReferenceDrawer } from './CadMediaReferenceDrawer';
import { RealMapVerificationPanel } from './RealMapVerificationPanel';
import { DxfExportSummaryModal, DxfPreviewRequest } from './DxfExportSummaryModal';

export type CadViewMode =
  | 'roof_polygon'
  | 'isometric'
  | 'r3f_overlay'
  | 'satellite'
  | 'blueprint';
export type CadTool =
  | 'select'
  | 'pv_zone'
  | 'pv_array'
  | 'building'
  | 'wall'
  | 'cylinder'
  | 'tree';
type MapLayerStyle = 'hybrid' | 'satellite' | 'esri' | 'streets';

interface ShadowCadEditorProps {
  siteLat: number;
  siteLon: number;
  locationName: string;
  elevationM: number;
  isFetchingLocationData: boolean;
  isDetectingGps: boolean;
  config: SiteSimulationConfig;
  instantState: InstantaneousShadingState;
  timeFormatted: string;
  selectedObstacleId: string | null;
  onSelectObstacle: (id: string | null) => void;
  onSelectLocation: (lat: number, lon: number, resolvedName?: string) => void;
  onDetectGps: () => void;
  onUpdateArrayGeometry: (patch: {
    arrayWidthM?: number;
    collectorWidthM?: number;
    azimuthCompassDeg?: number;
  }) => void;
  onAddDrawnObstacle: (obs: NearObstacle) => void;
  onUpdateObstacle: (id: string, patch: Partial<NearObstacle>) => void;
  onRemoveObstacle: (id: string) => void;
  controlledViewMode?: CadViewMode;
  onViewModeChange?: (mode: CadViewMode) => void;
  hideModeBar?: boolean;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  onImportDrawingFile?: (file: File) => void;
  onUpdateDrawingOverlay?: (patch: Partial<UploadedDrawingOverlay>) => void;
  sunArcPointsDeg?: Array<{ altitudeDeg: number; azimuthCompassDeg: number }>;
  roofPolygonENU?: Array<{ x: number; y: number }>;
  roofPolygonLatLon?: Array<[number, number]>;
  onUpdateRoofPolygon?: (
    nodesENU: Array<{ x: number; y: number }> | undefined,
    nodesLatLon?: Array<[number, number]>
  ) => void;
  buildingHeightM?: number;
  parapetHeightM?: number;
  perimeterSetbackM?: number;
  roofStructureType?: RoofStructureType;
  onUpdateBuildingStructure?: (patch: {
    buildingHeightM?: number;
    parapetHeightM?: number;
    perimeterSetbackM?: number;
    roofStructureType?: RoofStructureType;
  }) => void;
  mediaAssets?: SiteMediaAsset[];
  onAddMediaAssets?: (items: SiteMediaAsset[]) => void;
  onRemoveMediaAsset?: (id: string) => void;
  activeDrawingId?: string | null;
  onSelectActiveDrawing?: (id: string | null) => void;
  timeHourDec?: number;
  onChangeTimeHour?: (hr: number) => void;
  selectedDayOfYear?: number;
  onChangeDayOfYear?: (day: number) => void;
  monthOptions?: Array<{ label: string; day: number }>;
  realMapGround?: RealMapGroundOverlay | null;
  verification?: SiteVerificationStatus;
  onUpdateVerification?: (patch: Partial<SiteVerificationStatus>) => void;
  onFetchRealMap?: (source?: RealMapSource) => Promise<void>;
  onScanOsmBuildings?: () => Promise<void>;
  isFetchingMap?: boolean;
  isScanningBuildings?: boolean;
  osmScanMessage?: string | null;
  measurements?: SiteMeasurements;
  onUpdateMeasurements?: (patch: Partial<SiteMeasurements>) => void;
  zones?: PotentialPvZone[];
  onChangeZones?: (zones: PotentialPvZone[]) => void;
  assemblyLayer?: AssemblyLayerMode;
  onChangeAssemblyLayer?: (mode: AssemblyLayerMode) => void;
  structureConfig?: MmsStructureDesignConfig;
  tourMode?: boolean;
  hideZoneComparisonMatrix?: boolean;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

const TILE_LAYERS: Record<
  MapLayerStyle,
  { label: string; url: string; maxZoom: number; maxNativeZoom: number; subdomains?: string[] }
> = {
  hybrid: {
    label: 'Hybrid HD',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    maxZoom: 22,
    maxNativeZoom: 20,
  },
  satellite: {
    label: 'Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    maxZoom: 22,
    maxNativeZoom: 20,
  },
  esri: {
    label: 'Esri Aerial',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 21,
    maxNativeZoom: 19,
  },
  streets: {
    label: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    maxNativeZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
};

function obsLocalToENU(
  lx: number,
  ly: number,
  cx: number,
  cy: number,
  rotationDeg = 0
): { x: number; y: number } {
  const r = rotationDeg * DEG2RAD;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  return {
    x: cx + lx * cosR + ly * sinR,
    y: cy - lx * sinR + ly * cosR,
  };
}

function getObstacleFootprintENU(obs: NearObstacle): { x: number; y: number }[] {
  if (obs.nodesENU && obs.nodesENU.length >= 3) {
    return obs.nodesENU;
  }

  const center = getObstacleCenterENU(obs);
  const shape =
    obs.shape ||
    (obs.category === 'Water Tank' || obs.category === 'Tree' || obs.category === 'Pole'
      ? 'cylinder'
      : obs.category === 'Parapet'
      ? 'wall'
      : 'box');

  if (shape === 'cylinder') {
    const r = Math.max(0.25, Math.max(obs.widthM, obs.depthM) / 2);
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push({ x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) });
    }
    return pts;
  }

  const hw = Math.max(0.15, obs.widthM / 2);
  const hd = Math.max(0.15, obs.depthM / 2);
  const rot = obs.rotationDeg ?? 0;
  return [
    obsLocalToENU(-hw, -hd, center.x, center.y, rot),
    obsLocalToENU(hw, -hd, center.x, center.y, rot),
    obsLocalToENU(hw, hd, center.x, center.y, rot),
    obsLocalToENU(-hw, hd, center.x, center.y, rot),
  ];
}

function computePolygonMetricsENU(nodes: { x: number; y: number }[]) {
  if (nodes.length < 3) {
    return { cx: 0, cy: 0, widthM: 0, depthM: 0, areaSqM: 0, perimeterM: 0 };
  }
  let area2 = 0;
  let cxSum = 0;
  let cySum = 0;
  let perimeterM = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < nodes.length; i++) {
    const p1 = nodes[i];
    const p2 = nodes[(i + 1) % nodes.length];
    perimeterM += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const cross = p1.x * p2.y - p2.x * p1.y;
    area2 += cross;
    cxSum += (p1.x + p2.x) * cross;
    cySum += (p1.y + p2.y) * cross;
    if (p1.x < minX) minX = p1.x;
    if (p1.x > maxX) maxX = p1.x;
    if (p1.y < minY) minY = p1.y;
    if (p1.y > maxY) maxY = p1.y;
  }

  const areaSqM = Math.abs(area2) / 2;
  let cx = 0;
  let cy = 0;
  if (Math.abs(area2) > 1e-6) {
    cx = cxSum / (3 * area2);
    cy = cySum / (3 * area2);
  } else {
    cx = nodes.reduce((s, p) => s + p.x, 0) / nodes.length;
    cy = nodes.reduce((s, p) => s + p.y, 0) / nodes.length;
  }

  return {
    cx: Number(cx.toFixed(2)),
    cy: Number(cy.toFixed(2)),
    widthM: Number(Math.max(0.5, maxX - minX).toFixed(1)),
    depthM: Number(Math.max(0.5, maxY - minY).toFixed(1)),
    areaSqM: Number(areaSqM.toFixed(1)),
    perimeterM: Number(perimeterM.toFixed(1)),
  };
}

function computeConvexHull2D(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return [...lower, ...upper];
}

function getObstacleShadowPartsENU(
  obs: NearObstacle,
  sunAltDeg: number,
  sunAzCompassDeg: number
): {
  hull: { x: number; y: number }[];
  basePts: { x: number; y: number }[];
  topProjected: { x: number; y: number }[];
  sideQuads: Array<{ x: number; y: number }[]>;
} {
  if (sunAltDeg <= 0.5) {
    return { hull: [], basePts: [], topProjected: [], sideQuads: [] };
  }
  const basePts = getObstacleFootprintENU(obs);
  const altRad = Math.max(2, sunAltDeg) * DEG2RAD;
  const azRad = sunAzCompassDeg * DEG2RAD;
  // Shadow vector opposes incoming sun direction
  const shadowLen = obs.heightM / Math.max(0.05, Math.tan(altRad));
  const dx = -Math.sin(azRad) * shadowLen;
  const dy = -Math.cos(azRad) * shadowLen;

  const topProjected = basePts.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  const sideQuads = basePts.map((p1, i) => {
    const j = (i + 1) % basePts.length;
    return [p1, basePts[j], topProjected[j], topProjected[i]];
  });

  return {
    hull: computeConvexHull2D([...basePts, ...topProjected]),
    basePts,
    topProjected,
    sideQuads,
  };
}

function snapBuildingPointENU(
  raw: { x: number; y: number },
  existingNodes: Array<{ x: number; y: number }>,
  orthoEnabled: boolean
): { x: number; y: number } {
  if (!orthoEnabled || existingNodes.length === 0) return raw;
  const prev = existingNodes[existingNodes.length - 1];
  const dx = raw.x - prev.x;
  const dy = raw.y - prev.y;

  // First edge sets optional axis, or orthogonal to world E/N if only 1 node
  if (existingNodes.length === 1) {
    if (Math.abs(dx) >= Math.abs(dy)) {
      return { x: raw.x, y: prev.y };
    }
    return { x: prev.x, y: raw.y };
  }

  // Snap perpendicular/parallel to the previous wall segment (architectural roof lock)
  const pPrev = existingNodes[existingNodes.length - 2];
  const ux = prev.x - pPrev.x;
  const uy = prev.y - pPrev.y;
  const uLen = Math.hypot(ux, uy);
  if (uLen < 0.05) return raw;
  const uHatX = ux / uLen;
  const uHatY = uy / uLen;
  const vHatX = -uHatY;
  const vHatY = uHatX;
  const projU = dx * uHatX + dy * uHatY;
  const projV = dx * vHatX + dy * vHatY;
  if (Math.abs(projU) >= Math.abs(projV)) {
    return {
      x: Number((prev.x + uHatX * projU).toFixed(2)),
      y: Number((prev.y + uHatY * projU).toFixed(2)),
    };
  }
  return {
    x: Number((prev.x + vHatX * projV).toFixed(2)),
    y: Number((prev.y + vHatY * projV).toFixed(2)),
  };
}

function getShedRowFootprint3D(
  config: SiteSimulationConfig,
  rowIndex: number
): {
  corners3D: [
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number },
    { x: number; y: number; z: number }
  ];
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  vz: number;
  rowCenterX: number;
  rowCenterY: number;
} {
  const planeAzRad = config.azimuthCompassDeg * DEG2RAD;
  const beta = config.tiltDeg * DEG2RAD;
  const ux = Math.cos(planeAzRad);
  const uy = -Math.sin(planeAzRad);
  const vx = -Math.cos(beta) * Math.sin(planeAzRad);
  const vy = -Math.cos(beta) * Math.cos(planeAzRad);
  const vz = Math.sin(beta);

  const rowStepX = -Math.sin(planeAzRad);
  const rowStepY = -Math.cos(planeAzRad);

  const W = Math.max(2, config.arrayWidthM);
  const L = Math.max(1, config.collectorWidthM);
  const layout = computeRowOffsetsAndWalkways(config);
  const rowOffset = layout.rowOffsetsM[rowIndex] ?? 0;

  const rcx = rowOffset * rowStepX;
  const rcy = rowOffset * rowStepY;
  const baseZ = Math.max(0.15, config.mmsClearanceM ?? 0.35);

  const pt = (u: number, v: number) => ({
    x: rcx + u * ux + v * vx,
    y: rcy + u * uy + v * vy,
    z: baseZ + v * vz,
  });

  return {
    corners3D: [pt(-W / 2, 0), pt(W / 2, 0), pt(W / 2, L), pt(-W / 2, L)],
    ux,
    uy,
    vx,
    vy,
    vz,
    rowCenterX: rcx,
    rowCenterY: rcy,
  };
}

export const ShadowCadEditor: React.FC<ShadowCadEditorProps> = ({
  siteLat,
  siteLon,
  locationName,
  elevationM,
  isFetchingLocationData,
  isDetectingGps,
  config,
  instantState,
  timeFormatted,
  selectedObstacleId,
  onSelectObstacle,
  onSelectLocation,
  onDetectGps,
  onUpdateArrayGeometry,
  onAddDrawnObstacle,
  onUpdateObstacle,
  onRemoveObstacle,
  controlledViewMode,
  onViewModeChange,
  hideModeBar = false,
  uploadedDrawing,
  onImportDrawingFile,
  onUpdateDrawingOverlay,
  sunArcPointsDeg,
  roofPolygonENU,
  roofPolygonLatLon,
  onUpdateRoofPolygon,
  buildingHeightM = 5.4,
  parapetHeightM = 1.0,
  perimeterSetbackM = 0.6,
  roofStructureType = 'rcc_flat',
  onUpdateBuildingStructure,
  mediaAssets = [],
  onAddMediaAssets,
  onRemoveMediaAsset,
  activeDrawingId = null,
  onSelectActiveDrawing,
  timeHourDec,
  onChangeTimeHour,
  selectedDayOfYear,
  onChangeDayOfYear,
  monthOptions = [],
  realMapGround = null,
  verification,
  onUpdateVerification,
  onFetchRealMap,
  onScanOsmBuildings,
  isFetchingMap = false,
  isScanningBuildings = false,
  osmScanMessage = null,
  measurements,
  onUpdateMeasurements,
  zones,
  onChangeZones,
  assemblyLayer,
  onChangeAssemblyLayer,
  structureConfig,
  tourMode = false,
  hideZoneComparisonMatrix = false,
}) => {
  const [internalViewMode, setInternalViewMode] = useState<CadViewMode>(
    controlledViewMode || 'isometric'
  );
  const viewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (mode: CadViewMode) => {
    setInternalViewMode(mode);
    onViewModeChange?.(mode);
  };
  const [isCadFullscreen, setIsCadFullscreen] = useState<boolean>(false);
  const [showMediaDrawer, setShowMediaDrawer] = useState<boolean>(false);
  const [activeTool, setActiveTool] = useState<CadTool>('select');
  const [draftAnchorENU, setDraftAnchorENU] = useState<{ x: number; y: number } | null>(null);
  const [draftAnchorLatLon, setDraftAnchorLatLon] = useState<[number, number] | null>(null);
  const [buildingNodesENU, setBuildingNodesENU] = useState<Array<{ x: number; y: number }>>([]);
  const [buildingNodesLatLon, setBuildingNodesLatLon] = useState<Array<[number, number]>>([]);
  const [draftHeightM, setDraftHeightM] = useState<number>(7.5);
  const [orthoSnap, setOrthoSnap] = useState<boolean>(false);
  const [draftHoverENU, setDraftHoverENU] = useState<{ x: number; y: number } | null>(null);
  const [draftHoverLatLon, setDraftHoverLatLon] = useState<[number, number] | null>(null);
  const [drawnIdsStack, setDrawnIdsStack] = useState<string[]>([]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [interPanelGapMm, setInterPanelGapMm] = useState<number>(DEFAULT_PANEL_SPACING_550W.interPanelGapMm);
  const [interRowGapMm, setInterRowGapMm] = useState<number>(DEFAULT_PANEL_SPACING_550W.interRowGapMm);
  const [edgeClearanceMm, setEdgeClearanceMm] = useState<number>(DEFAULT_PANEL_SPACING_550W.edgeClearanceMm);
  const [panelOrientation, setPanelOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [showSpacingPanel, setShowSpacingPanel] = useState<boolean>(false);
  const [dxfPreviewRequest, setDxfPreviewRequest] = useState<DxfPreviewRequest | null>(null);

  const spacingSpec = useMemo<PanelSpacingSpec>(
    () => ({
      panelWattage: measurements?.moduleWp || 550,
      interPanelGapMm,
      interRowGapMm,
      edgeClearanceMm,
      orientation: panelOrientation,
      azimuthDeg: config.azimuthCompassDeg,
    }),
    [
      measurements?.moduleWp,
      interPanelGapMm,
      interRowGapMm,
      edgeClearanceMm,
      panelOrientation,
      config.azimuthCompassDeg,
    ]
  );

  // Escape key exits fullscreen studio mode
  useEffect(() => {
    if (!isCadFullscreen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCadFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isCadFullscreen]);

  // Direct User Coordinate Mapping State
  const [coordLatStr, setCoordLatStr] = useState<string>(() => siteLat.toFixed(6));
  const [coordLonStr, setCoordLonStr] = useState<string>(() => siteLon.toFixed(6));

  useEffect(() => {
    setCoordLatStr(siteLat.toFixed(6));
    setCoordLonStr(siteLon.toFixed(6));
  }, [siteLat, siteLon]);

  // Blueprint Drag Obstacle & Vertex Node State
  const blueprintSvgRef = useRef<SVGSVGElement | null>(null);
  const draggingObsRef = useRef<{ id: string; startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );
  const draggingNodeRef = useRef<{ obsId: string; nodeIndex: number } | null>(null);

  // Satellite Search & Map Refs
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<
    Array<{ display_name: string; latitude: number; longitude: number }>
  >([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [mapLayerStyle, setMapLayerStyle] = useState<MapLayerStyle>('hybrid');

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const shadowLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const vectorLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const handleMapClickRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  const handleMapMouseMoveRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  const lastCenteredCoordsRef = useRef<{ lat: number; lon: number } | null>(null);

  const selectedObstacle = useMemo(
    () => config.obstacles.find((o) => o.id === selectedObstacleId) || null,
    [config.obstacles, selectedObstacleId]
  );

  const flashNotice = useCallback((msg: string) => {
    setStatusNotice(msg);
  }, []);

  useEffect(() => {
    if (!statusNotice) return;
    const t = setTimeout(() => setStatusNotice(null), 3500);
    return () => clearTimeout(t);
  }, [statusNotice]);

  // Cancel half-completed draft when switching tools or views
  const selectTool = (tool: CadTool) => {
    setActiveTool(tool);
    setDraftAnchorENU(null);
    setDraftAnchorLatLon(null);
    setBuildingNodesENU([]);
    setBuildingNodesLatLon([]);
    setDraftHoverENU(null);
    setDraftHoverLatLon(null);
    if (tool !== 'select' && viewMode === 'isometric') {
      setViewMode('satellite');
    }
    if (tool === 'pv_zone') {
      flashNotice('Tap 2 opposite corners on rooftop CAD to place PV Zone & Panels');
    } else if (tool === 'pv_array') {
      flashNotice('Tap 2 corners along rooftop edge to place PV Sheds');
    } else if (tool === 'building') {
      flashNotice('Tap 3+ corners to map building nodes · Tap N1 or Finish to extrude');
    } else if (tool === 'wall') {
      flashNotice('Tap start & end points along parapet wall');
    } else if (tool === 'cylinder') {
      flashNotice('Tap location to place Water Tank / Chimney');
    } else if (tool === 'tree') {
      flashNotice('Tap location to place Tree canopy obstacle');
    }
  };

  // Search places/addresses
  const handleAddressSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
    setIsSearching(true);
    try {
      const results = await searchAddressOrPlace(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        flashNotice('No matching address found — try street name or city.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handlePickSearchResult = (item: { display_name: string; latitude: number; longitude: number }) => {
    setSearchResults([]);
    setSearchQuery('');
    const shortName = item.display_name.split(',').slice(0, 2).join(', ');
    onSelectLocation(item.latitude, item.longitude, shortName);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([item.latitude, item.longitude], 20, { animate: true });
      lastCenteredCoordsRef.current = { lat: item.latitude, lon: item.longitude };
    }
    flashNotice(`Location locked: ${shortName}`);
  };

  const handleApplyExactCoordinates = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = parseFloat(coordLatStr);
    const lon = parseFloat(coordLonStr);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) {
      flashNotice('Enter valid Latitude (-85..85) and Longitude (-180..180)');
      return;
    }
    onSelectLocation(lat, lon, `Site ${lat.toFixed(5)}°, ${lon.toFixed(5)}°`);
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([lat, lon], 20, { animate: true });
      lastCenteredCoordsRef.current = { lat, lon };
    }
    flashNotice(`Map pinned to ${lat.toFixed(5)}°, ${lon.toFixed(5)}°`);
  };

  // Commit N-node polygon building from ENU nodes + geo-pinned Lat/Lon + configured height
  const commitMultiNodeBuilding = useCallback(
    (
      nodes: Array<{ x: number; y: number }>,
      heightM: number,
      explicitLatLon?: Array<[number, number]>
    ) => {
      if (nodes.length < 3) return;
      const roundedNodes = nodes.map((n) => ({
        x: Number(n.x.toFixed(2)),
        y: Number(n.y.toFixed(2)),
      }));
      const pinnedLatLon: Array<[number, number]> =
        explicitLatLon && explicitLatLon.length === nodes.length
          ? explicitLatLon.map(([lt, ln]) => [Number(lt.toFixed(6)), Number(ln.toFixed(6))])
          : roundedNodes.map((n) => {
              const [lt, ln] = localMetersToLatLon(siteLat, siteLon, n.x, n.y);
              return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
            });

      const metrics = computePolygonMetricsENU(roundedNodes);
      const distanceM = Number(Math.hypot(metrics.cx, metrics.cy).toFixed(1));
      const bearingDeg = Math.round(((Math.atan2(metrics.cx, metrics.cy) * RAD2DEG) + 360) % 360);
      const safeHeight = Number(Math.max(0.5, heightM).toFixed(1));

      const newId = `cad-bldg-${Date.now()}`;
      onAddDrawnObstacle({
        id: newId,
        name: `Building (${roundedNodes.length} Nodes)`,
        category: 'Building',
        shape: 'polygon',
        nodesENU: roundedNodes,
        nodesLatLon: pinnedLatLon,
        heightM: safeHeight,
        widthM: metrics.widthM,
        depthM: metrics.depthM,
        distanceM: Math.max(0.5, distanceM),
        bearingDeg,
        offsetX: metrics.cx,
        offsetY: metrics.cy,
        rotationDeg: 0,
      });

      setDrawnIdsStack((prev) => [...prev, newId]);
      onSelectObstacle(newId);
      setBuildingNodesENU([]);
      setBuildingNodesLatLon([]);
      setDraftHoverENU(null);
      setDraftHoverLatLon(null);
      setActiveTool('select');
      flashNotice(`Mapped ${roundedNodes.length}-node Building (${metrics.areaSqM}m², H ${safeHeight}m)`);
    },
    [flashNotice, onAddDrawnObstacle, onSelectObstacle, siteLat, siteLon]
  );

  // Create obstacle or update PV array from 2 ENU points
  const commitDrawnGeometry = useCallback(
    (
      tool: CadTool,
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      latLonCenterIfNewArray?: [number, number]
    ) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);

      if (tool === 'pv_zone') {
        const rotRad = ((config.azimuthCompassDeg - 180) * DEG2RAD);
        const ux = Math.cos(rotRad);
        const uy = -Math.sin(rotRad);
        const vx = Math.sin(rotRad);
        const vy = Math.cos(rotRad);
        const du = Math.abs(dx * ux + dy * uy);
        const dv = Math.abs(dx * vx + dy * vy);
        const rawCx = Number(((p1.x + p2.x) / 2).toFixed(2));
        const rawCy = Number(((p1.y + p2.y) / 2).toFixed(2));
        const rawW = Number(Math.max(1.2, du).toFixed(2));
        const rawD = Number(Math.max(1.2, dv).toFixed(2));
        const roofPoly = getHostRoofFootprintENU(config);
        const setback = config.perimeterSetbackM ?? 0.6;
        const currentZones = zones || [];
        const clampedZone = clampZoneToRoofFootprint(
          {
            id: `pv-zone-cad-${Date.now()}`,
            name: `Segment ${currentZones.length + 1}`,
            zoneType: 'rooftop',
            centerX: rawCx,
            centerY: rawCy,
            widthM: rawW,
            depthM: rawD,
            tiltDeg: config.tiltDeg,
            azimuthDeg: config.azimuthCompassDeg,
            elevationOffsetM: 0,
            enabled: true,
          },
          roofPoly,
          setback
        );
        const packing = packPanelsInSegmentENU(
          {
            centerX: clampedZone.centerX,
            centerY: clampedZone.centerY,
            widthM: clampedZone.widthM,
            depthM: clampedZone.depthM,
            azimuthDeg: config.azimuthCompassDeg,
          },
          spacingSpec,
          roofPoly,
          setback,
          config.obstacles
        );
        const newZone: PotentialPvZone = {
          ...clampedZone,
          name: `Segment ${currentZones.length + 1} (${packing.chosenOrientation === 'landscape' ? 'Land' : 'Port'})`,
          panelCount: packing.fittedPanelsCount,
        };
        onChangeZones?.([...currentZones, newZone]);
        flashNotice(
          `Rooftop Segment ${currentZones.length + 1} (${clampedZone.widthM}×${clampedZone.depthM}m): ${packing.fittedPanelsCount}×${spacingSpec.panelWattage}W (${packing.totalKw} kWp ${packing.chosenOrientation})`
        );
        setActiveTool('select');
        return;
      }

      if (tool === 'pv_array') {
        const width = Number(Math.max(2.5, Math.min(45, dist || 6)).toFixed(1));
        const computedAz = Math.round(((Math.atan2(-dy, dx) * RAD2DEG) + 360) % 360);
        const hemiPreferred =
          siteLat >= 0
            ? computedAz > 90 && computedAz < 270
              ? computedAz
              : (computedAz + 180) % 360
            : computedAz < 90 || computedAz > 270
            ? computedAz
            : (computedAz + 180) % 360;

        onUpdateArrayGeometry({
          arrayWidthM: width,
          azimuthCompassDeg: hemiPreferred,
        });
        if (latLonCenterIfNewArray) {
          onSelectLocation(latLonCenterIfNewArray[0], latLonCenterIfNewArray[1]);
        }
        flashNotice(`PV Shed aligned: ${width}m wide · Azimuth ${hemiPreferred}°`);
        setActiveTool('select');
        return;
      }

      if (tool === 'wall') {
        const cx = Number(((p1.x + p2.x) / 2).toFixed(2));
        const cy = Number(((p1.y + p2.y) / 2).toFixed(2));
        const length = Number(Math.max(1.5, dist).toFixed(1));
        const rotDeg = Math.round(((Math.atan2(-dy, dx) * RAD2DEG) + 360) % 360);
        const distanceM = Number(Math.hypot(cx, cy).toFixed(1));
        const bearingDeg = Math.round(((Math.atan2(cx, cy) * RAD2DEG) + 360) % 360);

        const newId = `cad-wall-${Date.now()}`;
        onAddDrawnObstacle({
          id: newId,
          name: `Parapet Wall ${config.obstacles.length + 1}`,
          category: 'Parapet',
          shape: 'wall',
          heightM: 1.2,
          widthM: length,
          depthM: 0.35,
          distanceM: Math.max(0.5, distanceM),
          bearingDeg,
          offsetX: cx,
          offsetY: cy,
          rotationDeg: rotDeg,
        });
        setDrawnIdsStack((prev) => [...prev, newId]);
        onSelectObstacle(newId);
        flashNotice(`Added Parapet Wall (${length}m long, H 1.2m)`);
        setActiveTool('select');
      }
    },
    [
      config,
      flashNotice,
      onAddDrawnObstacle,
      onChangeZones,
      onSelectLocation,
      onSelectObstacle,
      onUpdateArrayGeometry,
      siteLat,
      spacingSpec,
      zones,
    ]
  );

  // Place 1-tap cylinder / tree
  const commitSingleTapObstacle = useCallback(
    (tool: 'cylinder' | 'tree', pt: { x: number; y: number }) => {
      const cx = Number(pt.x.toFixed(2));
      const cy = Number(pt.y.toFixed(2));
      const distanceM = Number(Math.hypot(cx, cy).toFixed(1));
      const bearingDeg = Math.round(((Math.atan2(cx, cy) * RAD2DEG) + 360) % 360);
      const newId = `cad-${tool}-${Date.now()}`;
      const isTree = tool === 'tree';

      onAddDrawnObstacle({
        id: newId,
        name: isTree ? `Tree Canopy ${config.obstacles.length + 1}` : `Roof Tank ${config.obstacles.length + 1}`,
        category: isTree ? 'Tree' : 'Water Tank',
        shape: 'cylinder',
        heightM: isTree ? 6.5 : 2.4,
        widthM: isTree ? 4.2 : 1.8,
        depthM: isTree ? 4.2 : 1.8,
        distanceM: Math.max(0.5, distanceM),
        bearingDeg,
        offsetX: cx,
        offsetY: cy,
        rotationDeg: 0,
      });
      setDrawnIdsStack((prev) => [...prev, newId]);
      onSelectObstacle(newId);
      flashNotice(isTree ? 'Placed Tree Canopy (H 6.5m)' : 'Placed Rooftop Tank (H 2.4m)');
      setActiveTool('select');
    },
    [config.obstacles.length, flashNotice, onAddDrawnObstacle, onSelectObstacle]
  );

  // Leaflet Click Handler
  const handleLeafletClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const enu = latLonToLocalMeters(siteLat, siteLon, lat, lng);

      if (activeTool === 'select') {
        return;
      }

      if (activeTool === 'cylinder' || activeTool === 'tree') {
        commitSingleTapObstacle(activeTool, enu);
        return;
      }

      // Multi-node building drafting
      if (activeTool === 'building') {
        if (buildingNodesENU.length >= 3) {
          const first = buildingNodesENU[0];
          const closeDist = Math.hypot(enu.x - first.x, enu.y - first.y);
          if (closeDist < 1.8) {
            commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon);
            return;
          }
        }
        const snappedENU = snapBuildingPointENU(enu, buildingNodesENU, orthoSnap);
        const snappedLatLon: [number, number] =
          snappedENU === enu
            ? [lat, lng]
            : localMetersToLatLon(siteLat, siteLon, snappedENU.x, snappedENU.y);

        const nextIdx = buildingNodesENU.length + 1;
        setBuildingNodesENU((prev) => [...prev, snappedENU]);
        setBuildingNodesLatLon((prev) => [...prev, snappedLatLon]);
        if (nextIdx < 3) {
          flashNotice(`Node N${nextIdx} pinned — tap corner ${nextIdx + 1}`);
        } else {
          flashNotice(`${nextIdx} nodes pinned — keep tapping or click N1 / Finish`);
        }
        return;
      }

      // 2-tap tools: pv_array, wall
      if (!draftAnchorENU || !draftAnchorLatLon) {
        setDraftAnchorENU(enu);
        setDraftAnchorLatLon([lat, lng]);
        flashNotice('Point 1 locked — now tap Point 2 to finish shape');
        return;
      }

      if (activeTool === 'pv_array') {
        const midLat = (draftAnchorLatLon[0] + lat) / 2;
        const midLon = (draftAnchorLatLon[1] + lng) / 2;
        const p1RelMid = latLonToLocalMeters(midLat, midLon, draftAnchorLatLon[0], draftAnchorLatLon[1]);
        const p2RelMid = latLonToLocalMeters(midLat, midLon, lat, lng);
        setDraftAnchorENU(null);
        setDraftAnchorLatLon(null);
        commitDrawnGeometry('pv_array', p1RelMid, p2RelMid, [midLat, midLon]);
        return;
      }

      const anchor = draftAnchorENU;
      setDraftAnchorENU(null);
      setDraftAnchorLatLon(null);
      setDraftHoverENU(null);
      setDraftHoverLatLon(null);
      commitDrawnGeometry(activeTool, anchor, enu);
    },
    [
      activeTool,
      buildingNodesENU,
      buildingNodesLatLon,
      commitDrawnGeometry,
      commitMultiNodeBuilding,
      commitSingleTapObstacle,
      draftAnchorENU,
      draftAnchorLatLon,
      draftHeightM,
      flashNotice,
      orthoSnap,
      siteLat,
      siteLon,
    ]
  );

  const handleLeafletMouseMove = useCallback(
    (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const rawENU = latLonToLocalMeters(siteLat, siteLon, lat, lng);
      if (activeTool === 'building' && orthoSnap && buildingNodesENU.length > 0) {
        const snapped = snapBuildingPointENU(rawENU, buildingNodesENU, true);
        setDraftHoverENU(snapped);
        setDraftHoverLatLon(localMetersToLatLon(siteLat, siteLon, snapped.x, snapped.y));
        return;
      }
      setDraftHoverLatLon([lat, lng]);
      setDraftHoverENU(rawENU);
    },
    [activeTool, buildingNodesENU, orthoSnap, siteLat, siteLon]
  );

  handleMapClickRef.current = handleLeafletClick;
  handleMapMouseMoveRef.current = handleLeafletMouseMove;

  // Initialize Leaflet Map only when Satellite CAD view is active
  useEffect(() => {
    if (viewMode !== 'satellite' || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [siteLat, siteLon],
      zoom: 20,
      maxZoom: 22,
      minZoom: 14,
      zoomControl: false,
      attributionControl: false,
    });
    mapInstanceRef.current = map;
    lastCenteredCoordsRef.current = { lat: siteLat, lon: siteLon };

    // Dedicated unified-opacity shadow pane so concave L/U shadows never double-darken seams
    const shadowPane = map.createPane('cadShadowPane');
    shadowPane.style.zIndex = '380';
    shadowPane.style.opacity = '0.44';
    shadowPane.style.pointerEvents = 'none';

    const cfg = TILE_LAYERS[mapLayerStyle];
    const layer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      subdomains: cfg.subdomains || 'abc',
    }).addTo(map);
    tileLayerRef.current = layer;

    const shadowGroup = L.layerGroup().addTo(map);
    shadowLayerGroupRef.current = shadowGroup;

    const vectorGroup = L.layerGroup().addTo(map);
    vectorLayerGroupRef.current = vectorGroup;

    map.on('click', (ev) => {
      handleMapClickRef.current(ev);
    });
    map.on('mousemove', (ev) => {
      handleMapMouseMoveRef.current(ev);
    });

    const resizeTimer = setTimeout(() => {
      map.invalidateSize();
    }, 120);

    return () => {
      clearTimeout(resizeTimer);
      try {
        map.stop();
        map.off();
        map.remove();
      } catch {
        // Ignore teardown error if container already detached
      }
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      shadowLayerGroupRef.current = null;
      vectorLayerGroupRef.current = null;
    };
    // Intentionally initialize once per satellite tab activation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  // Switch tile layer style dynamically
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (viewMode !== 'satellite' || !map) return;
    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }
    const cfg = TILE_LAYERS[mapLayerStyle];
    tileLayerRef.current = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      subdomains: cfg.subdomains || 'abc',
    }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [mapLayerStyle, viewMode]);

  // Set CAD crosshair cursor when drawing on satellite imagery
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (viewMode !== 'satellite' || !map) return;
    map.getContainer().style.cursor = activeTool === 'select' ? 'grab' : 'crosshair';
  }, [activeTool, viewMode]);

  // Invalidate Leaflet map size whenever fullscreen or media drawer toggles
  useEffect(() => {
    if (viewMode !== 'satellite' || !mapInstanceRef.current) return;
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 120);
    return () => clearTimeout(timer);
  }, [isCadFullscreen, showMediaDrawer, viewMode]);

  // Recenter map when siteLat / siteLon changes significantly from external GPS/search
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (viewMode !== 'satellite' || !map) return;
    const prev = lastCenteredCoordsRef.current;
    if (!prev || Math.hypot(prev.lat - siteLat, prev.lon - siteLon) > 0.00015) {
      map.setView([siteLat, siteLon], map.getZoom(), { animate: true });
      lastCenteredCoordsRef.current = { lat: siteLat, lon: siteLon };
    }
  }, [siteLat, siteLon, viewMode]);

  // Render Live Geo-Locked CAD Polygons & Cast Shadows on Satellite Map
  useEffect(() => {
    const group = vectorLayerGroupRef.current;
    const shadowGroup = shadowLayerGroupRef.current;
    if (viewMode !== 'satellite' || !group || !shadowGroup) return;
    group.clearLayers();
    shadowGroup.clearLayers();

    // 1. Site origin crosshair marker
    L.circleMarker([siteLat, siteLon], {
      radius: 4,
      color: '#f59e0b',
      fillColor: '#ffffff',
      fillOpacity: 1,
      weight: 2,
      interactive: false,
    }).addTo(group);

    // 2. Concave Height-Based Cast Shadows for each obstacle (rendered in unified cadShadowPane)
    if (instantState.sunAltitudeDeg > 0.5) {
      const altRad = Math.max(2, instantState.sunAltitudeDeg) * DEG2RAD;
      const azRad = instantState.sunAzimuthCompassDeg * DEG2RAD;
      const tanAlt = Math.max(0.05, Math.tan(altRad));

      config.obstacles.forEach((obs) => {
        const shadowLen = obs.heightM / tanAlt;
        const dx = -Math.sin(azRad) * shadowLen;
        const dy = -Math.cos(azRad) * shadowLen;
        const footprintENU = getObstacleFootprintENU(obs);
        const baseLatLon: Array<[number, number]> =
          obs.nodesLatLon && obs.nodesLatLon.length >= 3
            ? obs.nodesLatLon
            : footprintENU.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y));

        if (baseLatLon.length >= 3) {
          const topLatLon = baseLatLon.map(([lt, ln]) => localMetersToLatLon(lt, ln, dx, dy));

          // Base footprint + vertical wall sweeps + shifted roof shadow inside unified cadShadowPane
          L.polygon(baseLatLon, {
            pane: 'cadShadowPane',
            stroke: false,
            fillColor: '#4c1d95',
            fillOpacity: 1,
            interactive: false,
          }).addTo(shadowGroup);

          for (let i = 0; i < baseLatLon.length; i++) {
            const j = (i + 1) % baseLatLon.length;
            L.polygon([baseLatLon[i], baseLatLon[j], topLatLon[j], topLatLon[i]], {
              pane: 'cadShadowPane',
              stroke: false,
              fillColor: '#4c1d95',
              fillOpacity: 1,
              interactive: false,
            }).addTo(shadowGroup);
          }

          L.polygon(topLatLon, {
            pane: 'cadShadowPane',
            stroke: false,
            fillColor: '#5b21b6',
            fillOpacity: 1,
            interactive: false,
          }).addTo(shadowGroup);

          // Crisp dashed roof shadow projection contour on overlay layer
          L.polygon(topLatLon, {
            color: obs.id === selectedObstacleId ? '#c084fc' : '#9333ea',
            weight: obs.id === selectedObstacleId ? 1.6 : 1.1,
            opacity: 0.75,
            dashArray: '4 3',
            fill: false,
            interactive: false,
          }).addTo(group);

          // Height-to-shadow ray tie-lines for the selected obstacle
          if (obs.id === selectedObstacleId) {
            const rayStep = baseLatLon.length > 12 ? Math.max(1, Math.floor(baseLatLon.length / 8)) : 1;
            for (let i = 0; i < baseLatLon.length; i += rayStep) {
              L.polyline([baseLatLon[i], topLatLon[i]], {
                color: '#d8b4fe',
                weight: 1.15,
                opacity: 0.72,
                dashArray: '3 3',
                interactive: false,
              }).addTo(group);
            }
          }
        }
      });
    }

    // 2.5 Host Roof Polygon Footprint & Safety Setback Boundary on Satellite Map
    const roofPolyENU = getHostRoofFootprintENU(config);
    if (roofPolyENU.length >= 3) {
      const roofLatLngs =
        config.roofPolygonLatLon && config.roofPolygonLatLon.length === roofPolyENU.length
          ? config.roofPolygonLatLon
          : roofPolyENU.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y));
      L.polygon(roofLatLngs, {
        color: '#10b981',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 0.08,
        interactive: false,
      }).addTo(group);

      const insetENU = computeInsetPolygonENU(roofPolyENU, config.perimeterSetbackM ?? 0.6);
      if (insetENU.length >= 3) {
        L.polygon(
          insetENU.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y)),
          {
            color: '#f59e0b',
            weight: 1.3,
            dashArray: '4 3',
            fill: false,
            interactive: false,
          }
        ).addTo(group);
      }
    }

    // 2.6 Drawn Array Segments & Exact Packed 550W Panels on Satellite Map
    if (zones && zones.length > 0) {
      zones
        .filter((z) => z.enabled !== false)
        .forEach((z, zi) => {
          const segInput = {
            centerX: z.centerX,
            centerY: z.centerY,
            widthM: z.widthM,
            depthM: z.depthM,
            azimuthDeg: z.azimuthDeg || spacingSpec.azimuthDeg,
          };
          const segSpacing: PanelSpacingSpec = {
            ...spacingSpec,
            azimuthDeg: segInput.azimuthDeg,
          };
          const packing = packPanelsInSegmentENU(
            segInput,
            segSpacing,
            roofPolyENU,
            config.perimeterSetbackM ?? 0.6,
            config.obstacles
          );
          const { segmentCornersLatLon, panelPolygonsLatLon } = segmentAndPanelsToLatLon(
            siteLat,
            siteLon,
            segInput,
            packing
          );

          L.polygon(segmentCornersLatLon, {
            color: '#22d3ee',
            weight: 2,
            dashArray: '5 3',
            fillColor: '#06b6d4',
            fillOpacity: 0.08,
          })
            .bindTooltip(
              `${z.name}: ${packing.fittedPanelsCount}×${segSpacing.panelWattage}W (${packing.totalKw} kWp)`,
              { sticky: true }
            )
            .addTo(group);

          panelPolygonsLatLon.forEach((cellLatLngs) => {
            L.polygon(cellLatLngs, {
              color: '#bae6fd',
              weight: 0.9,
              fillColor: '#0284c7',
              fillOpacity: 0.85,
              interactive: false,
            }).addTo(group);
          });

          const [cLat, cLon] = localMetersToLatLon(siteLat, siteLon, z.centerX, z.centerY);
          const badgeIcon = L.divIcon({
            className: '',
            html: `<div style="padding:1px 5px;border-radius:4px;background:rgba(15,23,42,0.88);color:#38bdf8;font-size:9px;font-weight:800;font-family:monospace;white-space:nowrap;border:1px solid #38bdf8;transform:translate(-50%,-50%);">S${
              zi + 1
            }: ${packing.fittedPanelsCount}×${segSpacing.panelWattage}W</div>`,
            iconSize: [0, 0],
          });
          L.marker([cLat, cLon], { icon: badgeIcon, interactive: false }).addTo(group);
        });
    }

    // 3. PV Collector Shed Polygons + Directional Azimuth Vector
    for (let r = 0; r < config.numRows; r++) {
      const shed = getShedRowFootprint3D(config, r);
      const latLngs = shed.corners3D.map((c) => localMetersToLatLon(siteLat, siteLon, c.x, c.y));
      const poly = L.polygon(latLngs, {
        color: '#38bdf8',
        weight: 2,
        fillColor: instantState.linearShadingFactor > 0.15 ? '#0369a1' : '#0ea5e9',
        fillOpacity: 0.72,
      }).addTo(group);
      poly.bindTooltip(`PV Row ${r + 1} · ${config.arrayWidthM}m · Az ${config.azimuthCompassDeg}°`, { sticky: true });
    }

    // Collector normal azimuth arrow from site center
    const azRad = config.azimuthCompassDeg * DEG2RAD;
    const tipENU = { x: Math.sin(azRad) * 3.2, y: Math.cos(azRad) * 3.2 };
    L.polyline(
      [
        [siteLat, siteLon],
        localMetersToLatLon(siteLat, siteLon, tipENU.x, tipENU.y),
      ],
      { color: '#38bdf8', weight: 2.5, dashArray: '4 3', interactive: false }
    ).addTo(group);

    // 4. Obstacle Footprints + Draggable Vertex Nodes / Center Handle when Selected
    config.obstacles.forEach((obs) => {
      const isSelected = obs.id === selectedObstacleId;
      const footprintENU = getObstacleFootprintENU(obs);
      const centerENU = getObstacleCenterENU(obs);
      const latLngs =
        obs.nodesLatLon && obs.nodesLatLon.length >= 3
          ? obs.nodesLatLon
          : footprintENU.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y));
      const proj = instantState.obstacleProjections.find((p) => p.id === obs.id);
      const isCasting = proj?.castsShadeOnArray;

      const poly = L.polygon(latLngs, {
        color: isSelected ? '#f59e0b' : isCasting ? '#c084fc' : '#e2e8f0',
        weight: isSelected ? 3 : 1.8,
        fillColor:
          obs.category === 'Tree'
            ? '#16a34a'
            : obs.category === 'Water Tank'
            ? '#0891b2'
            : isCasting
            ? '#9333ea'
            : '#475569',
        fillOpacity: 0.78,
      }).addTo(group);

      poly.on('click', (ev) => {
        L.DomEvent.stopPropagation(ev);
        onSelectObstacle(obs.id);
      });
      poly.bindTooltip(`${obs.name} (H ${obs.heightM}m)`, { sticky: true });

      if (isSelected && activeTool === 'select') {
        if (obs.nodesENU && obs.nodesENU.length >= 3) {
          obs.nodesENU.forEach((node, nodeIdx) => {
            const nodeLatLon: [number, number] =
              obs.nodesLatLon && obs.nodesLatLon[nodeIdx]
                ? obs.nodesLatLon[nodeIdx]
                : localMetersToLatLon(siteLat, siteLon, node.x, node.y);
            const nodeIcon = L.divIcon({
              className: '',
              html: `<div style="width:18px;height:18px;border-radius:9999px;background:#f59e0b;color:#0f172a;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.65);cursor:move;">${
                nodeIdx + 1
              }</div>`,
              iconSize: [18, 18],
              iconAnchor: [9, 9],
            });
            const nodeMarker = L.marker(nodeLatLon, {
              icon: nodeIcon,
              draggable: true,
            }).addTo(group);
            nodeMarker.on('dragend', () => {
              const pos = nodeMarker.getLatLng();
              const movedENU = latLonToLocalMeters(siteLat, siteLon, pos.lat, pos.lng);
              const nextNodes = obs.nodesENU!.map((pt, idx) =>
                idx === nodeIdx
                  ? { x: Number(movedENU.x.toFixed(2)), y: Number(movedENU.y.toFixed(2)) }
                  : pt
              );
              const baseLatLon =
                obs.nodesLatLon && obs.nodesLatLon.length === obs.nodesENU!.length
                  ? obs.nodesLatLon
                  : obs.nodesENU!.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y));
              const nextLatLon = baseLatLon.map((ll, idx): [number, number] =>
                idx === nodeIdx
                  ? [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))]
                  : ll
              );
              onUpdateObstacle(obs.id, { nodesENU: nextNodes, nodesLatLon: nextLatLon });
            });
          });
        } else {
          const centerLatLon = localMetersToLatLon(siteLat, siteLon, centerENU.x, centerENU.y);
          const dragIcon = L.divIcon({
            className: '',
            html: '<div style="width:14px;height:14px;border-radius:9999px;background:#f59e0b;border:2.5px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:move;"></div>',
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          const handleMarker = L.marker(centerLatLon, {
            icon: dragIcon,
            draggable: true,
          }).addTo(group);
          handleMarker.on('dragend', () => {
            const pos = handleMarker.getLatLng();
            const newENU = latLonToLocalMeters(siteLat, siteLon, pos.lat, pos.lng);
            onUpdateObstacle(obs.id, {
              offsetX: Number(newENU.x.toFixed(2)),
              offsetY: Number(newENU.y.toFixed(2)),
            });
          });
        }
      }
    });

    // 5A. Multi-Node Building Draft Preview + Live Height Shadow Projection (Satellite Map)
    if (activeTool === 'building' && buildingNodesLatLon.length > 0) {
      const ptsLatLon = draftHoverLatLon
        ? [...buildingNodesLatLon, draftHoverLatLon]
        : buildingNodesLatLon;
      const ptsENU = draftHoverENU ? [...buildingNodesENU, draftHoverENU] : buildingNodesENU;

      // Live ghost height shadow projection once 3+ nodes exist
      if (buildingNodesLatLon.length >= 3 && instantState.sunAltitudeDeg > 0.5) {
        const altRad = Math.max(2, instantState.sunAltitudeDeg) * DEG2RAD;
        const azRad = instantState.sunAzimuthCompassDeg * DEG2RAD;
        const shadowLen = draftHeightM / Math.max(0.05, Math.tan(altRad));
        const dx = -Math.sin(azRad) * shadowLen;
        const dy = -Math.cos(azRad) * shadowLen;
        const ghostTop = buildingNodesLatLon.map(([lt, ln]) => localMetersToLatLon(lt, ln, dx, dy));

        L.polygon(buildingNodesLatLon, {
          pane: 'cadShadowPane',
          stroke: false,
          fillColor: '#7c3aed',
          fillOpacity: 1,
          interactive: false,
        }).addTo(shadowGroup);
        for (let i = 0; i < buildingNodesLatLon.length; i++) {
          const j = (i + 1) % buildingNodesLatLon.length;
          L.polygon([buildingNodesLatLon[i], buildingNodesLatLon[j], ghostTop[j], ghostTop[i]], {
            pane: 'cadShadowPane',
            stroke: false,
            fillColor: '#7c3aed',
            fillOpacity: 1,
            interactive: false,
          }).addTo(shadowGroup);
        }
        L.polygon(ghostTop, {
          color: '#c084fc',
          weight: 1.5,
          dashArray: '4 3',
          fillColor: '#6d28d9',
          fillOpacity: 0.25,
          interactive: false,
        }).addTo(group);
      }

      if (ptsLatLon.length >= 3) {
        L.polygon(ptsLatLon, {
          color: '#FF6F00',
          weight: 2.2,
          dashArray: '5 4',
          fillColor: '#FF6F00',
          fillOpacity: 0.22,
          interactive: false,
        }).addTo(group);
      } else if (ptsLatLon.length >= 2) {
        L.polyline(ptsLatLon, {
          color: '#FF6F00',
          weight: 2.5,
          dashArray: '5 4',
          interactive: false,
        }).addTo(group);
      }

      // Segment edge distance badges along drafted perimeter
      for (let i = 0; i < ptsENU.length - 1; i++) {
        const segLen = Math.hypot(ptsENU[i + 1].x - ptsENU[i].x, ptsENU[i + 1].y - ptsENU[i].y);
        if (segLen >= 0.8) {
          const midLat = (ptsLatLon[i][0] + ptsLatLon[i + 1][0]) / 2;
          const midLon = (ptsLatLon[i][1] + ptsLatLon[i + 1][1]) / 2;
          const segIcon = L.divIcon({
            className: '',
            html: `<div style="padding:1px 4px;border-radius:4px;background:rgba(15,23,42,0.85);color:#fde68a;font-size:9px;font-weight:700;font-family:monospace;white-space:nowrap;border:1px solid rgba(245,158,11,0.5);transform:translate(-50%,-50%);">${segLen.toFixed(
              1
            )}m</div>`,
            iconSize: [0, 0],
          });
          L.marker([midLat, midLon], { icon: segIcon, interactive: false }).addTo(group);
        }
      }

      buildingNodesLatLon.forEach((ll, idx) => {
        const canCloseOnN1 = idx === 0 && buildingNodesLatLon.length >= 3;
        const icon = L.divIcon({
          className: '',
          html: `<div style="width:${canCloseOnN1 ? 22 : 18}px;height:${
            canCloseOnN1 ? 22 : 18
          }px;border-radius:9999px;background:${
            idx === 0 ? '#16a34a' : '#FF6F00'
          };color:#ffffff;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:${
            canCloseOnN1 ? '0 0 0 4px rgba(34,197,94,0.45), 0 1px 4px rgba(0,0,0,0.6)' : '0 1px 4px rgba(0,0,0,0.6)'
          };cursor:${canCloseOnN1 ? 'pointer' : 'default'};">${idx + 1}</div>`,
          iconSize: [canCloseOnN1 ? 22 : 18, canCloseOnN1 ? 22 : 18],
          iconAnchor: [canCloseOnN1 ? 11 : 9, canCloseOnN1 ? 11 : 9],
        });
        const m = L.marker(ll, { icon, interactive: canCloseOnN1 }).addTo(group);
        if (canCloseOnN1) {
          m.bindTooltip('Tap N1 to Close & Extrude', { direction: 'top' });
          m.on('click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon);
          });
        }
      });
    }

    // 5B. Draft Point #1 Anchor & Live Rubber-Band CAD Preview (PV Zone Rectangle + Packed 550W / PV Shed / Wall)
    if (draftAnchorLatLon && draftAnchorENU) {
      L.circleMarker(draftAnchorLatLon, {
        radius: 7,
        color: '#ffffff',
        fillColor: activeTool === 'pv_zone' ? '#10b981' : '#FF6F00',
        fillOpacity: 1,
        weight: 2.5,
        interactive: false,
      }).addTo(group);

      if (draftHoverLatLon && draftHoverENU) {
        if (activeTool === 'pv_zone') {
          const rotRad = (config.azimuthCompassDeg - 180) * DEG2RAD;
          const ux = Math.cos(rotRad);
          const uy = -Math.sin(rotRad);
          const vx = Math.sin(rotRad);
          const vy = Math.cos(rotRad);
          const dx = draftHoverENU.x - draftAnchorENU.x;
          const dy = draftHoverENU.y - draftAnchorENU.y;
          const segInput = {
            centerX: (draftAnchorENU.x + draftHoverENU.x) / 2,
            centerY: (draftAnchorENU.y + draftHoverENU.y) / 2,
            widthM: Math.max(0.6, Math.abs(dx * ux + dy * uy)),
            depthM: Math.max(0.6, Math.abs(dx * vx + dy * vy)),
            azimuthDeg: config.azimuthCompassDeg,
          };
          const livePack = packPanelsInSegmentENU(
            segInput,
            spacingSpec,
            roofPolyENU,
            config.perimeterSetbackM ?? 0.6,
            config.obstacles
          );
          const { segmentCornersLatLon, panelPolygonsLatLon } = segmentAndPanelsToLatLon(
            siteLat,
            siteLon,
            segInput,
            livePack
          );
          L.polygon(segmentCornersLatLon, {
            color: '#10b981',
            weight: 2.4,
            dashArray: '5 4',
            fillColor: '#10b981',
            fillOpacity: 0.14,
            interactive: false,
          }).addTo(group);
          panelPolygonsLatLon.forEach((cellLatLngs) => {
            L.polygon(cellLatLngs, {
              color: '#a7f3d0',
              weight: 0.8,
              fillColor: '#0ea5e9',
              fillOpacity: 0.72,
              interactive: false,
            }).addTo(group);
          });
        } else {
          L.polyline([draftAnchorLatLon, draftHoverLatLon], {
            color: '#FF6F00',
            weight: 2.5,
            dashArray: '6 4',
            interactive: false,
          }).addTo(group);
        }
      }
    }
  }, [
    activeTool,
    buildingNodesENU,
    buildingNodesLatLon,
    commitMultiNodeBuilding,
    config,
    draftAnchorENU,
    draftAnchorLatLon,
    draftHeightM,
    draftHoverENU,
    draftHoverLatLon,
    instantState.linearShadingFactor,
    instantState.obstacleProjections,
    instantState.sunAltitudeDeg,
    instantState.sunAzimuthCompassDeg,
    onSelectObstacle,
    onUpdateObstacle,
    selectedObstacleId,
    siteLat,
    siteLon,
    spacingSpec,
    viewMode,
    zones,
  ]);

  const handleLockMapCenter = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    const c = map.getCenter();
    lastCenteredCoordsRef.current = { lat: c.lat, lon: c.lng };
    onSelectLocation(c.lat, c.lng);
    flashNotice('Fetching exact elevation & irradiance for map center...');
  };

  // =========================================================================
  // 2D BLUEPRINT CANVAS HANDLERS
  // =========================================================================
  const bpScale = 7.2; // px per meter (viewBox 340x320 => +-22m radius)
  const bpCenterX = 170;
  const bpCenterY = 160;

  const clientToBlueprintENU = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = blueprintSvgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const vbX = ((clientX - rect.left) / rect.width) * 340;
    const vbY = ((clientY - rect.top) / rect.height) * 320;
    return {
      x: (vbX - bpCenterX) / bpScale,
      y: -(vbY - bpCenterY) / bpScale,
    };
  };

  const handleBlueprintClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (draggingObsRef.current || draggingNodeRef.current) return;
    const enu = clientToBlueprintENU(e.clientX, e.clientY);

    if (activeTool === 'select') return;
    if (activeTool === 'cylinder' || activeTool === 'tree') {
      commitSingleTapObstacle(activeTool, enu);
      return;
    }

    if (activeTool === 'building') {
      if (buildingNodesENU.length >= 3) {
        const first = buildingNodesENU[0];
        if (Math.hypot(enu.x - first.x, enu.y - first.y) < 1.8) {
          commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon);
          return;
        }
      }
      const snappedENU = snapBuildingPointENU(enu, buildingNodesENU, orthoSnap);
      const ll = localMetersToLatLon(siteLat, siteLon, snappedENU.x, snappedENU.y);
      const nextIdx = buildingNodesENU.length + 1;
      setBuildingNodesENU((prev) => [...prev, snappedENU]);
      setBuildingNodesLatLon((prev) => [...prev, ll]);
      if (nextIdx < 3) {
        flashNotice(`Node N${nextIdx} placed — tap corner ${nextIdx + 1}`);
      } else {
        flashNotice(`${nextIdx} nodes placed — add node or tap N1 / Finish`);
      }
      return;
    }

    if (!draftAnchorENU) {
      setDraftAnchorENU(enu);
      flashNotice('Point 1 placed — tap Point 2 to finish');
      return;
    }
    const anchor = draftAnchorENU;
    setDraftAnchorENU(null);
    setDraftHoverENU(null);
    commitDrawnGeometry(activeTool, anchor, enu);
  };

  const handleUndoCad = () => {
    if (activeTool === 'building' && buildingNodesENU.length > 0) {
      setBuildingNodesENU((prev) => prev.slice(0, -1));
      setBuildingNodesLatLon((prev) => prev.slice(0, -1));
      flashNotice(
        buildingNodesENU.length <= 1 ? 'Draft cleared' : `Removed Node N${buildingNodesENU.length}`
      );
      return;
    }
    if (draftAnchorENU) {
      setDraftAnchorENU(null);
      setDraftAnchorLatLon(null);
      setDraftHoverENU(null);
      setDraftHoverLatLon(null);
      flashNotice('Draft cleared');
      return;
    }
    const lastId = drawnIdsStack[drawnIdsStack.length - 1];
    if (lastId) {
      onRemoveObstacle(lastId);
      setDrawnIdsStack((prev) => prev.slice(0, -1));
      flashNotice('Removed last drawn CAD object');
    }
  };

  const liveDraftStats = useMemo(() => {
    if (activeTool === 'building' && buildingNodesENU.length > 0) {
      const pts = draftHoverENU ? [...buildingNodesENU, draftHoverENU] : buildingNodesENU;
      let perim = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        perim += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      }
      const last = pts[pts.length - 1];
      const prev = pts.length >= 2 ? pts[pts.length - 2] : pts[0];
      const segLen = Math.hypot(last.x - prev.x, last.y - prev.y);
      const area = pts.length >= 3 ? computePolygonMetricsENU(pts).areaSqM : 0;
      return {
        label: `${buildingNodesENU.length} nodes · Seg ${segLen.toFixed(1)}m · Perim ${perim.toFixed(1)}m${
          area > 0 ? ` · ${area}m²` : ''
        }`,
      };
    }
    if (!draftAnchorENU || !draftHoverENU) return null;
    const dx = draftHoverENU.x - draftAnchorENU.x;
    const dy = draftHoverENU.y - draftAnchorENU.y;
    if (activeTool === 'pv_zone') {
      const rotRad = (config.azimuthCompassDeg - 180) * DEG2RAD;
      const ux = Math.cos(rotRad);
      const uy = -Math.sin(rotRad);
      const vx = Math.sin(rotRad);
      const vy = Math.cos(rotRad);
      const wM = Math.max(0.6, Math.abs(dx * ux + dy * uy));
      const dM = Math.max(0.6, Math.abs(dx * vx + dy * vy));
      const livePack = packPanelsInSegmentENU(
        {
          centerX: (draftAnchorENU.x + draftHoverENU.x) / 2,
          centerY: (draftAnchorENU.y + draftHoverENU.y) / 2,
          widthM: wM,
          depthM: dM,
          azimuthDeg: config.azimuthCompassDeg,
        },
        spacingSpec,
        getHostRoofFootprintENU(config),
        config.perimeterSetbackM ?? 0.6,
        config.obstacles
      );
      return {
        label: `${wM.toFixed(1)}×${dM.toFixed(1)}m · ${livePack.fittedPanelsCount}×${spacingSpec.panelWattage}W (${livePack.totalKw} kWp · ${livePack.chosenOrientation})`,
      };
    }
    const dist = Math.hypot(dx, dy);
    const bearing = Math.round(((Math.atan2(dx, dy) * RAD2DEG) + 360) % 360);
    return {
      label: `${dist.toFixed(1)}m · Bearing ${bearing}°`,
    };
  }, [activeTool, buildingNodesENU, config, draftAnchorENU, draftHoverENU, spacingSpec]);

  return (
    <div
      className={
        isCadFullscreen
          ? 'fixed inset-0 z-[1200] bg-slate-950 text-slate-100 flex flex-col p-3 gap-2.5 overflow-hidden'
          : 'bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5'
      }
    >
      {/* Compact Unified Site Location, Studio Toggles & Coordinate Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <h3
            className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${
              isCadFullscreen ? 'text-white' : 'text-slate-800 dark:text-slate-200'
            }`}
          >
            <PenTool className="w-4 h-4 text-[#FF6F00] shrink-0" />
            <span className="truncate">
              {isCadFullscreen ? 'Full-Screen CAD & 3D Solar Studio' : 'Site 3D & CAD Scene'}
            </span>
          </h3>
          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            {isFetchingLocationData
              ? 'Syncing site weather...'
              : `${locationName || 'Site'} · Elev ${elevationM}m · Array ${config.numRows}×${config.arrayWidthM}m · ${timeFormatted}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowMediaDrawer((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition ${
              showMediaDrawer
                ? 'bg-emerald-600 border-emerald-500 text-white'
                : isCadFullscreen
                ? 'bg-slate-900 border-slate-700 text-slate-200 hover:text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            }`}
            title="Inspect Site Photos, 360° Video, Calibrate 2D Drawing & Add Structures"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Site Ref</span>
            {mediaAssets.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white/20 text-[9.5px] font-mono">
                {mediaAssets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsCadFullscreen((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-[10.5px] font-bold flex items-center gap-1 cursor-pointer transition ${
              isCadFullscreen
                ? 'bg-[#FF6F00] border-[#FF6F00] text-white'
                : 'bg-slate-900 dark:bg-slate-800 border-slate-700 text-white hover:bg-slate-800'
            }`}
            title={isCadFullscreen ? 'Exit Full-Screen Studio (Esc)' : 'Expand Full-Screen CAD Workspace'}
          >
            {isCadFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Exit Fullscreen</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Fullscreen</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onDetectGps}
            disabled={isDetectingGps}
            className="px-2.5 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-[10.5px] font-bold text-sky-700 dark:text-sky-300 flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <Navigation className="w-3 h-3" />
            <span className="hidden sm:inline">{isDetectingGps ? 'Locating...' : 'GPS Lock'}</span>
          </button>
        </div>
      </div>

      {/* Inline Live Solar Time & Season Sweep Bar when inside Full-Screen CAD Studio */}
      {isCadFullscreen && onChangeTimeHour && typeof timeHourDec === 'number' && (
        <div className="shrink-0 flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-2xl bg-slate-900 border border-slate-800 text-[10.5px]">
          <div className="flex items-center gap-1.5 font-mono font-bold text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            <span>{timeFormatted}</span>
            <span className="text-slate-400 font-normal">
              ({instantState.sunAltitudeDeg.toFixed(0)}° Alt / {instantState.sunAzimuthCompassDeg.toFixed(0)}° Az)
            </span>
          </div>
          <input
            type="range"
            min="5.5"
            max="18.5"
            step="0.1"
            value={timeHourDec}
            onChange={(e) => onChangeTimeHour(parseFloat(e.target.value))}
            className="flex-1 min-w-[140px] accent-[#FF6F00] h-1.5 cursor-pointer"
          />
          {onChangeDayOfYear && typeof selectedDayOfYear === 'number' && monthOptions.length > 0 && (
            <select
              value={selectedDayOfYear}
              onChange={(e) => onChangeDayOfYear(Number(e.target.value))}
              className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 font-bold text-[10.5px] cursor-pointer"
            >
              {monthOptions.map((m) => (
                <option key={m.day} value={m.day}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          <div className="font-mono text-[10px] text-emerald-400 font-bold">
            POA {instantState.poaShadedWpm2} W/m² · Shade {Math.round(instantState.linearShadingFactor * 100)}%
          </div>
        </div>
      )}

      {/* Unified Address Search + Direct Coordinate Mapping Strip */}
      {!isCadFullscreen && (
        <div className="space-y-1.5 relative">
          <form onSubmit={handleAddressSearch} className="flex gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search rooftop address or city..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#FF6F00]"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-700 text-white text-xs font-bold cursor-pointer hover:bg-slate-800 shrink-0 disabled:opacity-60"
            >
              {isSearching ? '...' : 'Locate'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 top-9 z-[1100] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {searchResults.map((res, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handlePickSearchResult(res)}
                  className="w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 flex items-start gap-2 cursor-pointer"
                >
                  <MapPin className="w-3.5 h-3.5 text-[#FF6F00] shrink-0 mt-0.5" />
                  <span className="text-slate-700 dark:text-slate-200 line-clamp-2">{res.display_name}</span>
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleApplyExactCoordinates} className="grid grid-cols-12 gap-1.5 items-center">
            <div className="col-span-4 flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-700">
              <span className="text-[9.5px] font-bold text-slate-400 uppercase">Lat</span>
              <input
                type="text"
                inputMode="decimal"
                value={coordLatStr}
                onChange={(e) => setCoordLatStr(e.target.value)}
                aria-label="Site Latitude"
                className="w-full text-[11px] font-mono font-bold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none"
              />
            </div>
            <div className="col-span-4 flex items-center gap-1 bg-slate-50 dark:bg-slate-800 rounded-xl px-2 py-1 border border-slate-200 dark:border-slate-700">
              <span className="text-[9.5px] font-bold text-slate-400 uppercase">Lon</span>
              <input
                type="text"
                inputMode="decimal"
                value={coordLonStr}
                onChange={(e) => setCoordLonStr(e.target.value)}
                aria-label="Site Longitude"
                className="w-full text-[11px] font-mono font-bold text-slate-800 dark:text-slate-100 bg-transparent focus:outline-none"
              />
            </div>
            <button
              type="submit"
              className="col-span-4 py-1.5 px-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10.5px] font-bold flex items-center justify-center gap-1 cursor-pointer transition"
            >
              <MapPin className="w-3 h-3 shrink-0" />
              <span>Map Coords</span>
            </button>
          </form>
        </div>
      )}

      {/* 5-Mode View Tabs (hidden inside single-step guided pipeline when hideModeBar is true) */}
      {!hideModeBar && (
      <div
        className={`grid grid-cols-5 gap-1 p-1 rounded-2xl text-[10.5px] font-bold shrink-0 ${
          isCadFullscreen ? 'bg-slate-900 border border-slate-800' : 'bg-slate-100 dark:bg-slate-800'
        }`}
      >
        <button
          type="button"
          onClick={() => setViewMode('roof_polygon')}
          className={`py-1.5 px-1 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
            viewMode === 'roof_polygon'
              ? isCadFullscreen
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Hexagon className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Roof Poly</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('isometric')}
          className={`py-1.5 px-1 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
            viewMode === 'isometric'
              ? isCadFullscreen
                ? 'bg-[#FF6F00] text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Box className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">AutoCAD 3D</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('r3f_overlay')}
          className={`py-1.5 px-1 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
            viewMode === 'r3f_overlay'
              ? isCadFullscreen
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">R3F Bldg</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('satellite')}
          className={`py-1.5 px-1 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
            viewMode === 'satellite'
              ? isCadFullscreen
                ? 'bg-sky-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Satellite className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Satellite</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode('blueprint')}
          className={`py-1.5 px-1 rounded-xl flex items-center justify-center gap-1 transition cursor-pointer ${
            viewMode === 'blueprint'
              ? isCadFullscreen
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Compass className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">2D CAD</span>
        </button>
      </div>
      )}

      {/* Main Workspace Area (+ Side Reference Drawer in Fullscreen or Split View) */}
      <div
        className={
          isCadFullscreen
            ? 'flex-1 min-h-0 flex flex-col md:flex-row gap-2.5 overflow-hidden'
            : 'space-y-2.5'
        }
      >
        <div
          className={
            isCadFullscreen
              ? 'flex-1 min-w-0 min-h-0 flex flex-col gap-2 overflow-hidden'
              : 'space-y-2.5'
          }
        >

      {/* CAD Drawing Toolbar (Satellite & 2D Blueprint CAD) */}
      {(viewMode === 'satellite' || viewMode === 'blueprint') && (
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'select', label: 'Select', icon: MousePointer2 },
              { id: 'pv_zone', label: '+ PV Zone', icon: Plus },
              { id: 'pv_array', label: 'PV Shed', icon: Sun },
              { id: 'building', label: 'Building Nodes', icon: Square },
              { id: 'wall', label: 'Wall', icon: Minus },
              { id: 'cylinder', label: 'Tank', icon: Layers },
              { id: 'tree', label: 'Tree', icon: Trees },
            ] as Array<{ id: CadTool; label: string; icon: React.ComponentType<{ className?: string }> }>
          ).map((tool) => {
            const Icon = tool.icon;
            const active = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => selectTool(tool.id)}
                className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border flex items-center gap-1 transition cursor-pointer ${
                  active
                    ? 'bg-[#FF6F00] text-white border-[#FF6F00] shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{tool.label}</span>
              </button>
            );
          })}

          {(draftAnchorENU || buildingNodesENU.length > 0 || drawnIdsStack.length > 0) && (
            <button
              type="button"
              onClick={handleUndoCad}
              className="px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 flex items-center gap-1 cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              <span>
                {buildingNodesENU.length > 0
                  ? 'Undo Node'
                  : draftAnchorENU
                  ? 'Cancel'
                  : 'Undo'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowSpacingPanel((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border flex items-center gap-1 transition cursor-pointer ml-auto whitespace-nowrap ${
              showSpacingPanel
                ? 'bg-cyan-600 text-white border-cyan-600'
                : 'bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-cyan-500'
            }`}
            title="Configure 550W panel spacing, row gap, setback, and orientation"
          >
            <SlidersHorizontal className="w-3 h-3" />
            <span>550W Spacing</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const payload = buildShadowCadDxfPayload(
                config,
                instantState,
                locationName || 'Solar Site',
                zones,
                spacingSpec
              );
              const annual = runAnnualShadingSimulation(config);
              const segs = payload.arraySegments || [];
              const packedPanels = segs.reduce((sum, s) => sum + s.panelsCornersENU.length, 0);
              const fallbackPanels = Math.max(
                1,
                Math.round((payload.shedRowsENU?.length || config.numRows) * Math.floor(config.arrayWidthM / 1.15))
              );
              const totalPanels = packedPanels > 0 ? packedPanels : fallbackPanels;
              const roofPoly = getHostRoofFootprintENU(config);
              const grossMetrics = computeShadingPolygonMetricsENU(roofPoly);
              const insetPoly = computeInsetPolygonENU(roofPoly, config.perimeterSetbackM ?? 0.6);
              const usableMetrics = computeShadingPolygonMetricsENU(
                insetPoly.length >= 3 ? insetPoly : roofPoly
              );
              const orientationLabel = segs[0]?.orientation || 'portrait';
              const yieldSummary = computeLayoutYieldSummary(
                totalPanels,
                spacingSpec.panelWattage || 550,
                annual,
                grossMetrics.areaSqM,
                usableMetrics.areaSqM,
                Math.max(1, segs.length || payload.shedRowsENU?.length || 1),
                orientationLabel
              );
              setDxfPreviewRequest({
                fileNameBase: `${locationName || 'solar_site'}_cad`,
                payload,
                yieldSummary,
              });
            }}
            className="px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold bg-sky-600 hover:bg-sky-700 text-white border border-sky-500 flex items-center gap-1 cursor-pointer whitespace-nowrap shadow-xs"
            title="Preview annual yield & export building footprint, rooftop boundaries, and packed 550W panels to standardized AutoCAD R12 DXF"
          >
            <Download className="w-3 h-3" />
            <span>Export .DXF</span>
          </button>
        </div>
      )}

      {/* Collapsible 550W Array Spacing & Drawn Segment Breakdown Bar */}
      {(viewMode === 'satellite' || viewMode === 'blueprint') && showSpacingPanel && (
        <div className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 space-y-2 text-[10.5px]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase mb-0.5">
                Panel Gap (mm)
              </label>
              <input
                type="number"
                min={0}
                max={200}
                step={5}
                value={interPanelGapMm}
                onChange={(e) => setInterPanelGapMm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase mb-0.5">
                Row Gap (mm)
              </label>
              <input
                type="number"
                min={0}
                max={2000}
                step={50}
                value={interRowGapMm}
                onChange={(e) => setInterRowGapMm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase mb-0.5">
                Edge Clear (mm)
              </label>
              <input
                type="number"
                min={0}
                max={1200}
                step={50}
                value={edgeClearanceMm}
                onChange={(e) => setEdgeClearanceMm(Math.max(0, Number(e.target.value) || 0))}
                className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-white font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[9.5px] font-bold text-slate-400 uppercase mb-0.5">
                Orientation
              </label>
              <div className="grid grid-cols-3 gap-1">
                {(['auto', 'portrait', 'landscape'] as const).map((orient) => (
                  <button
                    key={orient}
                    type="button"
                    onClick={() => setPanelOrientation(orient)}
                    className={`py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${
                      panelOrientation === orient
                        ? 'bg-cyan-600 text-white border-cyan-500'
                        : 'bg-slate-950 text-slate-400 border-slate-700 hover:text-white'
                    }`}
                  >
                    {orient === 'auto' ? 'Auto' : orient === 'portrait' ? 'Port' : 'Land'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {zones && zones.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800">
              {zones.map((z, idx) => {
                const livePack = packPanelsInSegmentENU(
                  {
                    centerX: z.centerX,
                    centerY: z.centerY,
                    widthM: z.widthM,
                    depthM: z.depthM,
                    azimuthDeg: z.azimuthDeg || spacingSpec.azimuthDeg,
                  },
                  { ...spacingSpec, azimuthDeg: z.azimuthDeg || spacingSpec.azimuthDeg },
                  getHostRoofFootprintENU(config),
                  config.perimeterSetbackM ?? 0.6,
                  config.obstacles
                );
                return (
                  <div
                    key={z.id}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 font-mono text-[10px]"
                  >
                    <span className="text-cyan-400 font-bold">S{idx + 1}</span>
                    <span className="text-slate-300">
                      {z.widthM.toFixed(1)}×{z.depthM.toFixed(1)}m · {livePack.fittedPanelsCount}×{spacingSpec.panelWattage}W ({livePack.totalKw} kW)
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeZones?.(zones.filter((item) => item.id !== z.id))}
                      className="text-rose-400 hover:text-rose-300 font-bold cursor-pointer"
                      title="Remove segment"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Inline Building Height, 90° Ortho Snap & Finish Bar during Multi-Node Building Drafting */}
      {activeTool === 'building' && (viewMode === 'satellite' || viewMode === 'blueprint') && (
        <div className="px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold text-amber-900 dark:text-amber-200">
              Height (m):
            </span>
            <input
              type="number"
              step="0.5"
              min="0.5"
              max="50"
              value={draftHeightM}
              onChange={(e) => setDraftHeightM(Math.max(0.5, parseFloat(e.target.value) || 0.5))}
              className="w-16 px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 font-mono font-bold text-xs text-slate-900 dark:text-white"
            />
            <button
              type="button"
              onClick={() => setOrthoSnap((v) => !v)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer ${
                orthoSnap
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-amber-300/80 dark:border-slate-700'
              }`}
              title="Snap new walls 90° perpendicular/parallel to previous wall"
            >
              90° Snap
            </button>
            <span className="text-[10px] font-mono text-amber-800 dark:text-amber-300">
              {buildingNodesENU.length} nodes · {timeFormatted}
              {instantState.sunAltitudeDeg > 0.5 && (
                <span className="ml-1 text-purple-700 dark:text-purple-300 font-bold">
                  · Shadow {(draftHeightM / Math.max(0.05, Math.tan(Math.max(2, instantState.sunAltitudeDeg) * DEG2RAD))).toFixed(1)}m
                </span>
              )}
            </span>
          </div>

          {buildingNodesENU.length >= 3 && (
            <button
              type="button"
              onClick={() => commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon)}
              className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-xs"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Finish ({buildingNodesENU.length})</span>
            </button>
          )}
        </div>
      )}

      {/* Main Drafting / Roof Boundary Polygon / Verified 3D Viewports */}
      {viewMode === 'roof_polygon' ? (
        <RoofBoundaryPolygonView
          key="cad-view-roof-polygon"
          siteLat={siteLat}
          siteLon={siteLon}
          config={config}
          uploadedDrawing={uploadedDrawing}
          roofPolygonENU={roofPolygonENU}
          roofPolygonLatLon={roofPolygonLatLon}
          buildingHeightM={buildingHeightM}
          parapetHeightM={parapetHeightM}
          perimeterSetbackM={perimeterSetbackM}
          roofStructureType={roofStructureType}
          onUpdateRoofPolygon={(nodesENU, nodesLatLon) =>
            onUpdateRoofPolygon?.(nodesENU, nodesLatLon)
          }
          onUpdateBuildingStructure={(patch) => onUpdateBuildingStructure?.(patch)}
          onPreviewIn3D={(mode) => setViewMode(mode)}
          isFullscreen={isCadFullscreen}
        />
      ) : (viewMode === 'isometric' || viewMode === 'r3f_overlay') &&
        verification &&
        !(
          verification.mapImageVerified &&
          verification.buildingPhotosVerified &&
          verification.surroundingBuildingsVerified
        ) &&
        onUpdateVerification &&
        onFetchRealMap &&
        onScanOsmBuildings &&
        measurements &&
        onUpdateMeasurements ? (
        <div
          key="cad-view-verification-gate"
          className={isCadFullscreen ? 'flex-1 min-h-0 overflow-y-auto pr-1' : ''}
        >
          <RealMapVerificationPanel
            compact
            siteLocationName={locationName || 'Solar Site'}
            siteLat={siteLat}
            siteLon={siteLon}
            config={config}
            measurements={measurements}
            onUpdateMeasurements={onUpdateMeasurements}
            mediaAssets={mediaAssets}
            onAddMediaAssets={(items) => onAddMediaAssets?.(items)}
            onRemoveMediaAsset={(id) => onRemoveMediaAsset?.(id)}
            realMapGround={realMapGround}
            isFetchingMap={isFetchingMap}
            isScanningBuildings={isScanningBuildings}
            osmScanMessage={osmScanMessage}
            onFetchRealMap={onFetchRealMap}
            onScanOsmBuildings={onScanOsmBuildings}
            obstacles={config.obstacles}
            onUpdateObstacle={onUpdateObstacle}
            onRemoveObstacle={onRemoveObstacle}
            verification={verification}
            onUpdateVerification={onUpdateVerification}
            onOpenRoofPolygon={() => setViewMode('roof_polygon')}
            onLaunchAutoCad3D={() => setViewMode('isometric')}
            onLaunchR3F3D={() => setViewMode('r3f_overlay')}
          />
        </div>
      ) : viewMode === 'isometric' ? (
        <AutoCadThreeViewport
          key="cad-view-isometric"
          siteName={locationName || 'Solar Site'}
          config={config}
          instantState={instantState}
          timeFormatted={timeFormatted}
          dayOfYear={selectedDayOfYear}
          onChangeDayOfYear={onChangeDayOfYear}
          timeHourDec={timeHourDec}
          onChangeTimeHour={onChangeTimeHour}
          selectedObstacleId={selectedObstacleId}
          onSelectObstacle={onSelectObstacle}
          uploadedDrawing={uploadedDrawing}
          realMapGround={realMapGround}
          sunArcPointsDeg={sunArcPointsDeg}
          isFullscreenWorkspace={isCadFullscreen}
          onToggleFullscreen={() => setIsCadFullscreen((v) => !v)}
          assemblyLayer={assemblyLayer}
          onChangeAssemblyLayer={onChangeAssemblyLayer}
          structureConfig={structureConfig}
          zones={zones}
          tourMode={tourMode}
        />
      ) : viewMode === 'r3f_overlay' ? (
        <R3FSiteShadowVisualizer
          key="cad-view-r3f"
          siteName={locationName || 'Solar Site'}
          config={config}
          instantState={instantState}
          timeFormatted={timeFormatted}
          dayOfYear={selectedDayOfYear}
          onChangeDayOfYear={onChangeDayOfYear}
          timeHourDec={timeHourDec}
          uploadedDrawing={uploadedDrawing}
          realMapGround={realMapGround}
          onImportDrawingFile={onImportDrawingFile}
          onUpdateDrawingOverlay={onUpdateDrawingOverlay}
          sunArcPointsDeg={sunArcPointsDeg}
          selectedObstacleId={selectedObstacleId}
          onSelectObstacle={onSelectObstacle}
          isFullscreenWorkspace={isCadFullscreen}
          onBuildingHeightChange={(h) => onUpdateBuildingStructure?.({ buildingHeightM: h })}
          zones={zones}
          onChangeZones={onChangeZones}
          assemblyLayer={assemblyLayer}
          onChangeAssemblyLayer={onChangeAssemblyLayer}
          structureConfig={structureConfig}
          tourMode={tourMode}
          onChangeTimeHour={onChangeTimeHour}
          hideZoneComparisonMatrix={hideZoneComparisonMatrix}
          onApplyZoneToArray={(zone: PotentialPvZone) => {
            onUpdateArrayGeometry({
              arrayWidthM: Number(Math.max(2, zone.widthM).toFixed(1)),
              azimuthCompassDeg: zone.azimuthDeg,
            });
          }}
        />
      ) : (
      <div
        key="cad-view-2d-shell"
        className={`w-full rounded-2xl bg-slate-950 relative overflow-hidden border border-slate-700/70 shadow-inner ${
          isCadFullscreen ? 'flex-1 min-h-[340px]' : 'h-80'
        }`}
      >
        {/* VIEW 2: SATELLITE MAP GEO-LOCKED CAD */}
        {viewMode === 'satellite' && (
          <div key="cad-pane-satellite" className="w-full h-full relative">
            <div ref={mapContainerRef} className="w-full h-full z-0" />

            {/* Floating Layer + Zoom Controls */}
            <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 z-[900]">
              <button
                type="button"
                onClick={() => mapInstanceRef.current?.zoomIn()}
                className="w-8 h-8 rounded-xl bg-slate-900/90 border border-slate-700 text-white flex items-center justify-center cursor-pointer shadow"
                title="Zoom In"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => mapInstanceRef.current?.zoomOut()}
                className="w-8 h-8 rounded-xl bg-slate-900/90 border border-slate-700 text-white flex items-center justify-center cursor-pointer shadow"
                title="Zoom Out"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleLockMapCenter}
                className="w-8 h-8 rounded-xl bg-slate-900/90 border border-slate-700 text-amber-400 flex items-center justify-center cursor-pointer shadow"
                title="Lock Map Center as Site Origin"
              >
                <Crosshair className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Map Layer Selector */}
            <div className="absolute bottom-2.5 left-2.5 flex gap-1 z-[900] bg-slate-900/85 p-1 rounded-xl border border-slate-700">
              {(Object.keys(TILE_LAYERS) as MapLayerStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setMapLayerStyle(style)}
                  className={`px-2 py-0.5 rounded-lg text-[9.5px] font-bold cursor-pointer transition ${
                    mapLayerStyle === style
                      ? 'bg-[#FF6F00] text-white'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {TILE_LAYERS[style].label}
                </button>
              ))}
            </div>

            {/* Live Geographical Coordinate HUD */}
            <div className="absolute bottom-2.5 right-2.5 z-[900] px-2 py-1 rounded-xl bg-slate-900/90 border border-slate-700 text-[9.5px] font-mono text-slate-200 pointer-events-none shadow">
              {draftHoverLatLon ? (
                <span>
                  {draftHoverLatLon[0].toFixed(6)}, {draftHoverLatLon[1].toFixed(6)}
                  {draftHoverENU ? (
                    <span className="text-sky-400 ml-1.5">
                      ({draftHoverENU.x >= 0 ? '+' : ''}
                      {draftHoverENU.x.toFixed(1)}, {draftHoverENU.y >= 0 ? '+' : ''}
                      {draftHoverENU.y.toFixed(1)}m)
                    </span>
                  ) : null}
                </span>
              ) : (
                <span>
                  Origin: {siteLat.toFixed(5)}, {siteLon.toFixed(5)}
                </span>
              )}
            </div>
          </div>
        )}

        {/* VIEW 3: 2D ORTHOGRAPHIC METRIC BLUEPRINT CAD */}
        {viewMode === 'blueprint' && (
          <div key="cad-pane-blueprint" className="w-full h-full relative">
            <svg
              ref={blueprintSvgRef}
              viewBox="0 0 340 320"
              className="w-full h-full select-none cursor-crosshair touch-none"
              onClick={handleBlueprintClick}
              onDoubleClick={() => {
                if (activeTool === 'building' && buildingNodesENU.length >= 3) {
                  commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon);
                }
              }}
              onPointerMove={(e) => {
                const rawEnu = clientToBlueprintENU(e.clientX, e.clientY);
                const enu =
                  activeTool === 'building' && orthoSnap && buildingNodesENU.length > 0
                    ? snapBuildingPointENU(rawEnu, buildingNodesENU, true)
                    : rawEnu;
                setDraftHoverENU(enu);
                if (draggingNodeRef.current) {
                  const targetObs = config.obstacles.find((o) => o.id === draggingNodeRef.current?.obsId);
                  if (targetObs?.nodesENU) {
                    const nextNodes = targetObs.nodesENU.map((pt, idx) =>
                      idx === draggingNodeRef.current!.nodeIndex
                        ? { x: Number(enu.x.toFixed(2)), y: Number(enu.y.toFixed(2)) }
                        : pt
                    );
                    const nextLatLon = nextNodes.map((pt): [number, number] => {
                      const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
                      return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
                    });
                    onUpdateObstacle(targetObs.id, { nodesENU: nextNodes, nodesLatLon: nextLatLon });
                  }
                  return;
                }
                if (!draggingObsRef.current) return;
                const dx = enu.x - draggingObsRef.current.startX;
                const dy = enu.y - draggingObsRef.current.startY;
                const nx = Number((draggingObsRef.current.origX + dx).toFixed(2));
                const ny = Number((draggingObsRef.current.origY + dy).toFixed(2));
                const dist = Number(Math.hypot(nx, ny).toFixed(1));
                const brg = Math.round(((Math.atan2(nx, ny) * RAD2DEG) + 360) % 360);
                onUpdateObstacle(draggingObsRef.current.id, {
                  offsetX: nx,
                  offsetY: ny,
                  distanceM: Math.max(0.5, dist),
                  bearingDeg: brg,
                });
              }}
              onPointerUp={() => {
                draggingObsRef.current = null;
                draggingNodeRef.current = null;
              }}
              onPointerCancel={() => {
                draggingObsRef.current = null;
                draggingNodeRef.current = null;
              }}
              onPointerLeave={() => {
                setDraftHoverENU(null);
              }}
            >
              <defs>
                <pattern id="cadGridPattern" width={bpScale * 2} height={bpScale * 2} patternUnits="userSpaceOnUse">
                  <path
                    d={`M ${bpScale * 2} 0 L 0 0 0 ${bpScale * 2}`}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="0.7"
                  />
                </pattern>
              </defs>

              <rect width="340" height="320" fill="#090d16" />

              {/* Calibrated Uploaded Site Drawing Image Underlay */}
              {uploadedDrawing && uploadedDrawing.visible && uploadedDrawing.url && (() => {
                const imgW = Math.max(4, uploadedDrawing.widthM) * bpScale;
                const imgH = Math.max(4, uploadedDrawing.depthM) * bpScale;
                const drawCx = bpCenterX + (uploadedDrawing.offsetX ?? 0) * bpScale;
                const drawCy = bpCenterY - (uploadedDrawing.offsetY ?? 0) * bpScale;
                return (
                  <image
                    href={uploadedDrawing.url}
                    x={drawCx - imgW / 2}
                    y={drawCy - imgH / 2}
                    width={imgW}
                    height={imgH}
                    opacity={uploadedDrawing.opacity}
                    preserveAspectRatio="none"
                    transform={`rotate(${uploadedDrawing.rotationDeg} ${drawCx} ${drawCy})`}
                  />
                );
              })()}

              <rect width="340" height="320" fill="url(#cadGridPattern)" opacity="0.65" />

              {/* Host Roof Polygon Footprint & Safety Edge Setback Boundary */}
              {(() => {
                const roofPoly = getHostRoofFootprintENU(config);
                const setback = Math.max(0.2, config.perimeterSetbackM ?? 0.6);
                const insetPoly = computeInsetPolygonENU(roofPoly, setback);
                const toPts = (pts: Array<{ x: number; y: number }>) =>
                  pts
                    .map(
                      (p) =>
                        `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`
                    )
                    .join(' ');
                return (
                  <g className="pointer-events-none">
                    <polygon
                      points={toPts(roofPoly)}
                      fill="rgba(16, 185, 129, 0.06)"
                      stroke="#10b981"
                      strokeWidth="1.4"
                    />
                    {insetPoly.length >= 3 && (
                      <polygon
                        points={toPts(insetPoly)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="0.95"
                        strokeDasharray="4 2.5"
                      />
                    )}
                  </g>
                );
              })()}

              {/* Built-In O&M Grated Walkway Corridors */}
              {(() => {
                const layout = computeRowOffsetsAndWalkways(config);
                const azRad = config.azimuthCompassDeg * DEG2RAD;
                const ux = Math.cos(azRad);
                const uy = -Math.sin(azRad);
                const stepX = -Math.sin(azRad);
                const stepY = -Math.cos(azRad);
                const hw = (Math.max(2, config.arrayWidthM) + 1.0) / 2;
                return layout.walkwayAisles.map((aisle) => {
                  const wcx = aisle.offsetM * stepX;
                  const wcy = aisle.offsetM * stepY;
                  const hd = aisle.widthM / 2;
                  const pt = (u: number, d: number) => {
                    const ex = wcx + u * ux + d * (-stepX);
                    const ey = wcy + u * uy + d * (-stepY);
                    return `${(bpCenterX + ex * bpScale).toFixed(1)},${(bpCenterY - ey * bpScale).toFixed(1)}`;
                  };
                  return (
                    <polygon
                      key={`bp-wk-${aisle.id}`}
                      points={[pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)].join(' ')}
                      fill="#f59e0b"
                      fillOpacity="0.22"
                      stroke="#fbbf24"
                      strokeWidth="0.9"
                      strokeDasharray="2 2"
                    />
                  );
                });
              })()}

              {/* Distance Rings */}
              <circle cx={bpCenterX} cy={bpCenterY} r={10 * bpScale} fill="none" stroke="#334155" strokeDasharray="3 3" />
              <circle cx={bpCenterX} cy={bpCenterY} r={20 * bpScale} fill="none" stroke="#1e293b" strokeDasharray="3 3" />
              <text x={bpCenterX + 3} y={bpCenterY - 10 * bpScale + 10} fontSize="8" fill="#64748b" className="font-mono">
                10m
              </text>
              <text x={bpCenterX + 3} y={bpCenterY - 20 * bpScale + 10} fontSize="8" fill="#475569" className="font-mono">
                20m
              </text>

              {/* Cardinal Axes */}
              <text x={bpCenterX} y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#f87171">N</text>
              <text x="328" y={bpCenterY + 3} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#64748b">E</text>
              <text x={bpCenterX} y="313" textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#f59e0b">S</text>
              <text x="12" y={bpCenterY + 3} textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#64748b">W</text>

              {/* Cast Shadows (Concave Extruded Silhouettes) */}
              {instantState.sunAltitudeDeg > 0.5 &&
                config.obstacles.map((obs) => {
                  const parts = getObstacleShadowPartsENU(
                    obs,
                    instantState.sunAltitudeDeg,
                    instantState.sunAzimuthCompassDeg
                  );
                  if (parts.hull.length < 3) return null;
                  const toBpStr = (pts: { x: number; y: number }[]) =>
                    pts
                      .map(
                        (p) =>
                          `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`
                      )
                      .join(' ');
                  const rayStep =
                    parts.basePts.length > 12 ? Math.max(1, Math.floor(parts.basePts.length / 8)) : 1;
                  return (
                    <g key={`bp-sh-${obs.id}`} opacity="0.52">
                      <polygon points={toBpStr(parts.basePts)} fill="#4c1d95" />
                      {parts.sideQuads.map((q, qIdx) => (
                        <polygon key={`bp-q-${qIdx}`} points={toBpStr(q)} fill="#4c1d95" />
                      ))}
                      <polygon
                        points={toBpStr(parts.topProjected)}
                        fill="#5b21b6"
                        stroke="#7c3aed"
                        strokeWidth="0.7"
                      />
                      {obs.id === selectedObstacleId &&
                        parts.basePts.map((bpPt, bIdx) =>
                          bIdx % rayStep === 0 && parts.topProjected[bIdx] ? (
                            <line
                              key={`bp-ray-${bIdx}`}
                              x1={(bpCenterX + bpPt.x * bpScale).toFixed(1)}
                              y1={(bpCenterY - bpPt.y * bpScale).toFixed(1)}
                              x2={(bpCenterX + parts.topProjected[bIdx].x * bpScale).toFixed(1)}
                              y2={(bpCenterY - parts.topProjected[bIdx].y * bpScale).toFixed(1)}
                              stroke="#d8b4fe"
                              strokeWidth="0.95"
                              strokeDasharray="3 2.5"
                              opacity="0.9"
                            />
                          ) : null
                        )}
                    </g>
                  );
                })}

              {/* PV Collector Sheds with Sub-Cell Shading Overlay & Azimuth Normal Vector */}
              {Array.from({ length: config.numRows }).map((_, rIdx) => {
                const shed = getShedRowFootprint3D(config, rIdx);
                const W = Math.max(2, config.arrayWidthM);
                const L = Math.max(1, config.collectorWidthM);
                const nx = 10;
                const ny = 5;
                const toBp = (u: number, v: number) => {
                  const ex = shed.rowCenterX + u * shed.ux + v * shed.vx;
                  const ey = shed.rowCenterY + u * shed.uy + v * shed.vy;
                  return {
                    sx: bpCenterX + ex * bpScale,
                    sy: bpCenterY - ey * bpScale,
                  };
                };
                const ptsStr = shed.corners3D
                  .map((c) => `${(bpCenterX + c.x * bpScale).toFixed(1)},${(bpCenterY - c.y * bpScale).toFixed(1)}`)
                  .join(' ');
                return (
                  <g key={`bp-pv-${rIdx}`}>
                    <polygon
                      points={ptsStr}
                      fill="#0c4a6e"
                      stroke="#bae6fd"
                      strokeWidth="1.1"
                    />
                    {Array.from({ length: ny }).map((__, iy) =>
                      Array.from({ length: nx }).map((___, ix) => {
                        const u0 = (ix / nx - 0.5) * W;
                        const u1 = ((ix + 1) / nx - 0.5) * W;
                        const v0 = (iy / ny) * L;
                        const v1 = ((iy + 1) / ny) * L;
                        const isShaded =
                          instantState.isBehindPlane ||
                          instantState.isBelowHorizon ||
                          (instantState.shadedCellGrid[iy]?.[ix] ?? false);
                        const cPts = [toBp(u0, v0), toBp(u1, v0), toBp(u1, v1), toBp(u0, v1)]
                          .map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`)
                          .join(' ');
                        return (
                          <polygon
                            key={`${ix}-${iy}`}
                            points={cPts}
                            fill={isShaded ? '#312e81' : '#0284c7'}
                            stroke="#38bdf8"
                            strokeWidth="0.35"
                            opacity={0.92}
                          />
                        );
                      })
                    )}
                  </g>
                );
              })}

              {/* Numbered Array Segments & Packed 550W Modules on 2D CAD Blueprint */}
              {zones &&
                zones.length > 0 &&
                zones
                  .filter((z) => z.enabled !== false)
                  .map((z, zi) => {
                    const az = z.azimuthDeg || spacingSpec.azimuthDeg;
                    const rotRad = (az - 180) * DEG2RAD;
                    const ux = Math.cos(rotRad);
                    const uy = -Math.sin(rotRad);
                    const vx = Math.sin(rotRad);
                    const vy = Math.cos(rotRad);
                    const hw = z.widthM / 2;
                    const hd = z.depthM / 2;
                    const segPoly = [
                      { x: z.centerX - hw * ux - hd * vx, y: z.centerY - hw * uy - hd * vy },
                      { x: z.centerX + hw * ux - hd * vx, y: z.centerY + hw * uy - hd * vy },
                      { x: z.centerX + hw * ux + hd * vx, y: z.centerY + hw * uy + hd * vy },
                      { x: z.centerX - hw * ux + hd * vx, y: z.centerY - hw * uy + hd * vy },
                    ]
                      .map(
                        (p) =>
                          `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`
                      )
                      .join(' ');
                    const packing = packPanelsInSegmentENU(
                      {
                        centerX: z.centerX,
                        centerY: z.centerY,
                        widthM: z.widthM,
                        depthM: z.depthM,
                        azimuthDeg: az,
                      },
                      { ...spacingSpec, azimuthDeg: az },
                      getHostRoofFootprintENU(config),
                      config.perimeterSetbackM ?? 0.6,
                      config.obstacles
                    );
                    return (
                      <g key={`bp-zone-${z.id}`} className="pointer-events-none">
                        <polygon
                          points={segPoly}
                          fill="rgba(6, 182, 212, 0.14)"
                          stroke="#22d3ee"
                          strokeWidth="1.2"
                          strokeDasharray="3 2"
                        />
                        {packing.panels.map((cell, ci) => {
                          const cellPts = cell.cornersENU
                            .map(
                              (pt) =>
                                `${(bpCenterX + pt.x * bpScale).toFixed(1)},${(
                                  bpCenterY -
                                  pt.y * bpScale
                                ).toFixed(1)}`
                            )
                            .join(' ');
                          return (
                            <polygon
                              key={`bp-z-${z.id}-c-${ci}`}
                              points={cellPts}
                              fill="#0284c7"
                              fillOpacity="0.88"
                              stroke="#bae6fd"
                              strokeWidth="0.45"
                            />
                          );
                        })}
                        <rect
                          x={bpCenterX + z.centerX * bpScale - 20}
                          y={bpCenterY - z.centerY * bpScale - 6.5}
                          width="40"
                          height="13"
                          rx="3"
                          fill="#0f172a"
                          stroke="#38bdf8"
                          strokeWidth="0.9"
                        />
                        <text
                          x={bpCenterX + z.centerX * bpScale}
                          y={bpCenterY - z.centerY * bpScale + 2.5}
                          textAnchor="middle"
                          fontSize="6"
                          fontWeight="bold"
                          fill="#f8fafc"
                        >
                          S{zi + 1}·{packing.fittedPanelsCount}×{spacingSpec.panelWattage}W
                        </text>
                      </g>
                    );
                  })}

              {/* Collector Azimuth Orientation Arrow */}
              {(() => {
                const azRad = config.azimuthCompassDeg * DEG2RAD;
                const ax = bpCenterX + Math.sin(azRad) * 26;
                const ay = bpCenterY - Math.cos(azRad) * 26;
                return (
                  <g className="pointer-events-none">
                    <line
                      x1={bpCenterX}
                      y1={bpCenterY}
                      x2={ax}
                      y2={ay}
                      stroke="#38bdf8"
                      strokeWidth="1.6"
                      strokeDasharray="3 2"
                    />
                    <circle cx={ax} cy={ay} r="2.5" fill="#38bdf8" />
                  </g>
                );
              })()}

              {/* Obstacle Footprints (draggable in Select mode) */}
              {config.obstacles.map((obs) => {
                const isSelected = obs.id === selectedObstacleId;
                const footprint = getObstacleFootprintENU(obs);
                const center = getObstacleCenterENU(obs);
                const proj = instantState.obstacleProjections.find((p) => p.id === obs.id);
                const ptsStr = footprint
                  .map((p) => `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`)
                  .join(' ');
                return (
                  <g
                    key={`bp-obs-${obs.id}`}
                    onPointerDown={(ev) => {
                      if (activeTool !== 'select') return;
                      ev.stopPropagation();
                      onSelectObstacle(obs.id);
                      const enu = clientToBlueprintENU(ev.clientX, ev.clientY);
                      draggingObsRef.current = {
                        id: obs.id,
                        startX: enu.x,
                        startY: enu.y,
                        origX: center.x,
                        origY: center.y,
                      };
                    }}
                    className={activeTool === 'select' ? 'cursor-move' : 'cursor-pointer'}
                  >
                    <polygon
                      points={ptsStr}
                      fill={
                        obs.category === 'Tree'
                          ? '#15803d'
                          : proj?.castsShadeOnArray
                          ? '#9333ea'
                          : '#475569'
                      }
                      fillOpacity="0.88"
                      stroke={isSelected ? '#f59e0b' : '#e2e8f0'}
                      strokeWidth={isSelected ? '2.2' : '1.1'}
                    />
                    <text
                      x={bpCenterX + center.x * bpScale}
                      y={bpCenterY - center.y * bpScale - 6}
                      textAnchor="middle"
                      fontSize="7.5"
                      fill="#e2e8f0"
                      fontWeight="bold"
                      className="pointer-events-none"
                    >
                      {obs.name.split(' ').slice(0, 2).join(' ')} ({obs.heightM}m)
                    </text>

                    {/* Draggable Corner Vertex Nodes for Selected Multi-Node Buildings */}
                    {isSelected &&
                      activeTool === 'select' &&
                      obs.nodesENU &&
                      obs.nodesENU.map((node, nodeIdx) => (
                        <g
                          key={`bp-node-${obs.id}-${nodeIdx}`}
                          onPointerDown={(ev) => {
                            ev.stopPropagation();
                            draggingNodeRef.current = { obsId: obs.id, nodeIndex: nodeIdx };
                          }}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <circle
                            cx={bpCenterX + node.x * bpScale}
                            cy={bpCenterY - node.y * bpScale}
                            r="5.5"
                            fill="#f59e0b"
                            stroke="#ffffff"
                            strokeWidth="1.4"
                          />
                          <text
                            x={bpCenterX + node.x * bpScale}
                            y={bpCenterY - node.y * bpScale + 2.5}
                            textAnchor="middle"
                            fontSize="6.5"
                            fontWeight="bold"
                            fill="#0f172a"
                            className="pointer-events-none"
                          >
                            {nodeIdx + 1}
                          </text>
                        </g>
                      ))}
                  </g>
                );
              })}

              {/* Multi-Node Building Draft Preview + Ghost Height Shadow on 2D CAD Blueprint */}
              {activeTool === 'building' && buildingNodesENU.length > 0 && (
                <g className="pointer-events-none">
                  {buildingNodesENU.length >= 3 &&
                    instantState.sunAltitudeDeg > 0.5 &&
                    (() => {
                      const draftShadowParts = getObstacleShadowPartsENU(
                        {
                          id: 'draft-bldg',
                          name: 'Draft',
                          category: 'Building',
                          shape: 'polygon',
                          heightM: draftHeightM,
                          widthM: 1,
                          depthM: 1,
                          distanceM: 1,
                          bearingDeg: 0,
                          nodesENU: buildingNodesENU,
                        },
                        instantState.sunAltitudeDeg,
                        instantState.sunAzimuthCompassDeg
                      );
                      const toBpStr = (pts: { x: number; y: number }[]) =>
                        pts
                          .map(
                            (p) =>
                              `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`
                          )
                          .join(' ');
                      return (
                        <g opacity="0.45">
                          <polygon points={toBpStr(draftShadowParts.basePts)} fill="#6d28d9" />
                          {draftShadowParts.sideQuads.map((q, qIdx) => (
                            <polygon key={`draft-sh-q-${qIdx}`} points={toBpStr(q)} fill="#6d28d9" />
                          ))}
                          <polygon
                            points={toBpStr(draftShadowParts.topProjected)}
                            fill="#7c3aed"
                            stroke="#c084fc"
                            strokeWidth="0.8"
                            strokeDasharray="3 2"
                          />
                        </g>
                      );
                    })()}
                  {(() => {
                    const previewPts = draftHoverENU ? [...buildingNodesENU, draftHoverENU] : buildingNodesENU;
                    const ptsStr = previewPts
                      .map((p) => `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`)
                      .join(' ');
                    return previewPts.length >= 3 ? (
                      <polygon
                        points={ptsStr}
                        fill="#FF6F00"
                        fillOpacity="0.22"
                        stroke="#FF6F00"
                        strokeWidth="1.6"
                        strokeDasharray="4 3"
                      />
                    ) : previewPts.length >= 2 ? (
                      <polyline
                        points={ptsStr}
                        fill="none"
                        stroke="#FF6F00"
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                      />
                    ) : null;
                  })()}
                  {buildingNodesENU.map((n, idx) => (
                    <g key={`draft-bp-node-${idx}`}>
                      <circle
                        cx={bpCenterX + n.x * bpScale}
                        cy={bpCenterY - n.y * bpScale}
                        r="5.5"
                        fill={idx === 0 ? '#16a34a' : '#FF6F00'}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={bpCenterX + n.x * bpScale}
                        y={bpCenterY - n.y * bpScale + 2.5}
                        textAnchor="middle"
                        fontSize="6.5"
                        fontWeight="bold"
                        fill="#ffffff"
                      >
                        {idx + 1}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* Draft Anchor Marker & Live Rubber-Band Preview (PV Zone Rectangles + Packed 550W / 2-tap tools) */}
              {draftAnchorENU && (
                <g className="pointer-events-none">
                  {draftHoverENU &&
                    (activeTool === 'pv_zone' ? (
                      (() => {
                        const rotRad = (config.azimuthCompassDeg - 180) * DEG2RAD;
                        const ux = Math.cos(rotRad);
                        const uy = -Math.sin(rotRad);
                        const vx = Math.sin(rotRad);
                        const vy = Math.cos(rotRad);
                        const dx = draftHoverENU.x - draftAnchorENU.x;
                        const dy = draftHoverENU.y - draftAnchorENU.y;
                        const segInput = {
                          centerX: (draftAnchorENU.x + draftHoverENU.x) / 2,
                          centerY: (draftAnchorENU.y + draftHoverENU.y) / 2,
                          widthM: Math.max(0.6, Math.abs(dx * ux + dy * uy)),
                          depthM: Math.max(0.6, Math.abs(dx * vx + dy * vy)),
                          azimuthDeg: config.azimuthCompassDeg,
                        };
                        const livePack = packPanelsInSegmentENU(
                          segInput,
                          spacingSpec,
                          getHostRoofFootprintENU(config),
                          config.perimeterSetbackM ?? 0.6,
                          config.obstacles
                        );
                        const hw = segInput.widthM / 2;
                        const hd = segInput.depthM / 2;
                        const rectPts = [
                          { x: segInput.centerX - hw * ux - hd * vx, y: segInput.centerY - hw * uy - hd * vy },
                          { x: segInput.centerX + hw * ux - hd * vx, y: segInput.centerY + hw * uy - hd * vy },
                          { x: segInput.centerX + hw * ux + hd * vx, y: segInput.centerY + hw * uy + hd * vy },
                          { x: segInput.centerX - hw * ux + hd * vx, y: segInput.centerY - hw * uy + hd * vy },
                        ]
                          .map(
                            (p) =>
                              `${(bpCenterX + p.x * bpScale).toFixed(1)},${(bpCenterY - p.y * bpScale).toFixed(1)}`
                          )
                          .join(' ');
                        return (
                          <g>
                            <polygon
                              points={rectPts}
                              fill="rgba(16, 185, 129, 0.16)"
                              stroke="#10b981"
                              strokeWidth="1.6"
                              strokeDasharray="4 3"
                            />
                            {livePack.panels.map((cell, ci) => (
                              <polygon
                                key={`draft-cell-${ci}`}
                                points={cell.cornersENU
                                  .map(
                                    (pt) =>
                                      `${(bpCenterX + pt.x * bpScale).toFixed(1)},${(
                                        bpCenterY -
                                        pt.y * bpScale
                                      ).toFixed(1)}`
                                  )
                                  .join(' ')}
                                fill="#0ea5e9"
                                fillOpacity="0.72"
                                stroke="#a7f3d0"
                                strokeWidth="0.4"
                              />
                            ))}
                          </g>
                        );
                      })()
                    ) : (
                      <line
                        x1={bpCenterX + draftAnchorENU.x * bpScale}
                        y1={bpCenterY - draftAnchorENU.y * bpScale}
                        x2={bpCenterX + draftHoverENU.x * bpScale}
                        y2={bpCenterY - draftHoverENU.y * bpScale}
                        stroke="#FF6F00"
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                      />
                    ))}
                  <circle
                    cx={bpCenterX + draftAnchorENU.x * bpScale}
                    cy={bpCenterY - draftAnchorENU.y * bpScale}
                    r="5"
                    fill={activeTool === 'pv_zone' ? '#10b981' : '#FF6F00'}
                    stroke="#ffffff"
                    strokeWidth="2"
                  />
                </g>
              )}

              {/* Sun Ray Vector */}
              {instantState.sunAltitudeDeg > 0 &&
                (() => {
                  const sunRad = ((instantState.sunAzimuthCompassDeg - 90) * Math.PI) / 180;
                  const sx = bpCenterX + 132 * Math.cos(sunRad);
                  const sy = bpCenterY + 132 * Math.sin(sunRad);
                  return (
                    <g className="pointer-events-none">
                      <line
                        x1={sx}
                        y1={sy}
                        x2={bpCenterX}
                        y2={bpCenterY}
                        stroke="#f59e0b"
                        strokeWidth="1.4"
                        strokeDasharray="4 3"
                        opacity="0.7"
                      />
                      <circle cx={sx} cy={sy} r="8" fill="#f59e0b" stroke="#fff" strokeWidth="1.4" />
                      <circle cx={sx} cy={sy} r="3.5" fill="#fef08a" />
                    </g>
                  );
                })()}
            </svg>

            <div className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-xl bg-slate-900/80 border border-slate-700/80 text-[10px] text-slate-300 font-mono pointer-events-none">
              {liveDraftStats
                ? liveDraftStats.label
                : draftHoverENU
                ? `E ${draftHoverENU.x >= 0 ? '+' : ''}${draftHoverENU.x.toFixed(1)}m · N ${draftHoverENU.y >= 0 ? '+' : ''}${draftHoverENU.y.toFixed(1)}m`
                : activeTool === 'select'
                ? 'Drag obstacle or building node to adjust'
                : 'Tap blueprint grid to place obstacle'}
            </div>
          </div>
        )}

        {/* Live Dimension Badge during Drafting (Satellite & 2D CAD) */}
        {liveDraftStats && (
          <div className="absolute top-2.5 left-2.5 z-[960] px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 text-[11px] font-mono font-black shadow-md pointer-events-none">
            {liveDraftStats.label}
          </div>
        )}

        {/* Quick Finish Overlay inside Map/Grid during Multi-Node Building */}
        {activeTool === 'building' && buildingNodesENU.length >= 3 && (
          <button
            type="button"
            onClick={() => commitMultiNodeBuilding(buildingNodesENU, draftHeightM, buildingNodesLatLon)}
            className="absolute bottom-2.5 right-2.5 z-[960] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-lg flex items-center gap-1 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Close &amp; Extrude ({buildingNodesENU.length})</span>
          </button>
        )}

        {/* Toast / Status Banner inside Canvas */}
        {statusNotice && !liveDraftStats && (
          <div className="absolute top-2.5 left-2.5 right-12 z-[950] px-3 py-1.5 rounded-xl bg-slate-900/90 border border-[#FF6F00]/60 text-white text-[11px] font-semibold shadow-md pointer-events-none">
            {statusNotice}
          </div>
        )}

        {/* Horizon warning bar */}
        {instantState.isBelowHorizon && (
          <div className="absolute bottom-2.5 right-2.5 z-[950] px-2.5 py-1 rounded-xl bg-red-950/90 border border-red-500/60 text-red-200 text-[10px] font-bold pointer-events-none">
            Below Horizon ({instantState.horizonElevationAtSunDeg}°)
          </div>
        )}
      </div>
      )}

      {/* Selected Obstacle Quick CAD Dimension, Height Shadow Projection & Node Inspector */}
      {selectedObstacle && (() => {
        const proj = instantState.obstacleProjections.find((p) => p.id === selectedObstacle.id);
        const shadowAz = Math.round((instantState.sunAzimuthCompassDeg + 180) % 360);
        const hasNodes = Boolean(selectedObstacle.nodesENU && selectedObstacle.nodesENU.length >= 3);
        const polyMetrics = hasNodes ? computePolygonMetricsENU(selectedObstacle.nodesENU!) : null;

        return (
          <div
            className={`p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-amber-300/60 dark:border-amber-700/50 space-y-2.5 text-slate-900 dark:text-slate-100 ${
              isCadFullscreen ? 'max-h-40 overflow-y-auto shrink-0' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate block">
                  Selected: {selectedObstacle.name}
                </span>
                <span className="text-[10px] font-mono text-purple-700 dark:text-purple-300">
                  {instantState.sunAltitudeDeg > 0.5 && proj
                    ? `Shadow: ${proj.shadowLengthM}m @ ${shadowAz}° · Base ${proj.footprintAreaSqM}m² · Shade ${proj.beamLossPct}%`
                    : 'Sun below horizon — no directional cast shadow'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onRemoveObstacle(selectedObstacle.id)}
                  className="px-2 py-1 rounded-lg text-[10.5px] font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Delete</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectObstacle(null)}
                  className="px-2 py-1 rounded-lg text-[10.5px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>

            {/* Interactive Height Slider & Story Presets for Real-Time Shadow Projection */}
            <div className="bg-white dark:bg-slate-900/90 p-2 rounded-xl border border-slate-200 dark:border-slate-700/70 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[10.5px]">
                <span className="font-bold text-slate-600 dark:text-slate-300">
                  Height (m) — Shadow Projection Driver
                </span>
                <div className="flex items-center gap-1.5">
                  {[3, 6, 9, 12].map((presetH) => (
                    <button
                      key={presetH}
                      type="button"
                      onClick={() => onUpdateObstacle(selectedObstacle.id, { heightM: presetH })}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold cursor-pointer ${
                        Math.abs(selectedObstacle.heightM - presetH) < 0.1
                          ? 'bg-[#FF6F00] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {presetH}m
                    </button>
                  ))}
                  <span className="font-mono font-bold text-[#FF6F00] min-w-[42px] text-right">
                    {selectedObstacle.heightM.toFixed(1)} m
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0.5"
                max="30"
                step="0.5"
                value={selectedObstacle.heightM}
                onChange={(e) =>
                  onUpdateObstacle(selectedObstacle.id, {
                    heightM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                  })
                }
                className="w-full accent-[#FF6F00] cursor-pointer"
              />
            </div>

            {hasNodes && selectedObstacle.nodesENU ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10.5px] text-slate-600 dark:text-slate-300">
                  <span className="font-mono">
                    {selectedObstacle.nodesENU.length} Nodes · Area {polyMetrics?.areaSqM}m² · Perim{' '}
                    {polyMetrics?.perimeterM}m
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nodes = selectedObstacle.nodesENU!;
                      const pLast = nodes[nodes.length - 1];
                      const pFirst = nodes[0];
                      const mid = {
                        x: Number(((pLast.x + pFirst.x) / 2).toFixed(2)),
                        y: Number(((pLast.y + pFirst.y) / 2).toFixed(2)),
                      };
                      const nextNodes = [...nodes, mid];
                      const nextLatLon = nextNodes.map((pt): [number, number] => {
                        const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
                        return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
                      });
                      onUpdateObstacle(selectedObstacle.id, {
                        nodesENU: nextNodes,
                        nodesLatLon: nextLatLon,
                      });
                      flashNotice(`Added Node N${nodes.length + 1} (drag on map or 2D grid)`);
                    }}
                    className="px-2 py-0.5 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-bold text-[10px] cursor-pointer"
                  >
                    + Add Node
                  </button>
                </div>

                <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                  {selectedObstacle.nodesENU.map((node, idx) => {
                    const [nLat, nLon] =
                      selectedObstacle.nodesLatLon && selectedObstacle.nodesLatLon[idx]
                        ? selectedObstacle.nodesLatLon[idx]
                        : localMetersToLatLon(siteLat, siteLon, node.x, node.y);
                    const updateNodeCoord = (nextLat: number, nextLon: number) => {
                      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) return;
                      if (nextLat < -90 || nextLat > 90 || nextLon < -180 || nextLon > 180) return;
                      const nextEnuPt = latLonToLocalMeters(siteLat, siteLon, nextLat, nextLon);
                      const nextNodes = selectedObstacle.nodesENU!.map((pt, j) =>
                        j === idx
                          ? { x: Number(nextEnuPt.x.toFixed(2)), y: Number(nextEnuPt.y.toFixed(2)) }
                          : pt
                      );
                      const baseLatLon =
                        selectedObstacle.nodesLatLon &&
                        selectedObstacle.nodesLatLon.length === selectedObstacle.nodesENU!.length
                          ? selectedObstacle.nodesLatLon
                          : selectedObstacle.nodesENU!.map((pt) =>
                              localMetersToLatLon(siteLat, siteLon, pt.x, pt.y)
                            );
                      const nextLatLon = baseLatLon.map((ll, j): [number, number] =>
                        j === idx ? [Number(nextLat.toFixed(6)), Number(nextLon.toFixed(6))] : ll
                      );
                      onUpdateObstacle(selectedObstacle.id, {
                        nodesENU: nextNodes,
                        nodesLatLon: nextLatLon,
                      });
                    };

                    return (
                      <div
                        key={`sel-node-${idx}`}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] font-mono"
                      >
                        <span className="font-bold text-amber-600 dark:text-amber-400 shrink-0">
                          N{idx + 1}
                        </span>
                        <input
                          type="number"
                          step="0.00001"
                          value={Number(nLat.toFixed(6))}
                          aria-label={`Node ${idx + 1} Latitude`}
                          onChange={(e) => updateNodeCoord(parseFloat(e.target.value), nLon)}
                          className="w-[84px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[10px]"
                        />
                        <input
                          type="number"
                          step="0.00001"
                          value={Number(nLon.toFixed(6))}
                          aria-label={`Node ${idx + 1} Longitude`}
                          onChange={(e) => updateNodeCoord(nLat, parseFloat(e.target.value))}
                          className="w-[88px] px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 text-[10px]"
                        />
                        <span className="text-slate-400 shrink-0 ml-auto text-[9.5px]">
                          {node.x >= 0 ? '+' : ''}
                          {node.x.toFixed(1)},{node.y >= 0 ? '+' : ''}
                          {node.y.toFixed(1)}m
                        </span>
                        {selectedObstacle.nodesENU!.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextNodes = selectedObstacle.nodesENU!.filter((_, j) => j !== idx);
                              const nextLatLon = selectedObstacle.nodesLatLon
                                ? selectedObstacle.nodesLatLon.filter((_, j) => j !== idx)
                                : nextNodes.map((pt): [number, number] => {
                                    const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
                                    return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
                                  });
                              onUpdateObstacle(selectedObstacle.id, {
                                nodesENU: nextNodes,
                                nodesLatLon: nextLatLon,
                              });
                            }}
                            className="text-rose-500 hover:text-rose-700 font-bold cursor-pointer px-1"
                            title="Remove node"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2 text-[11px]">
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-500 mb-0.5">Height (m)</label>
                  <input
                    type="number"
                    step="0.2"
                    min="0.2"
                    value={selectedObstacle.heightM}
                    onChange={(e) =>
                      onUpdateObstacle(selectedObstacle.id, {
                        heightM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                      })
                    }
                    className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-500 mb-0.5">Width (m)</label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.3"
                    value={selectedObstacle.widthM}
                    onChange={(e) =>
                      onUpdateObstacle(selectedObstacle.id, {
                        widthM: Math.max(0.3, parseFloat(e.target.value) || 0.3),
                      })
                    }
                    className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-500 mb-0.5">Depth (m)</label>
                  <input
                    type="number"
                    step="0.3"
                    min="0.2"
                    value={selectedObstacle.depthM}
                    onChange={(e) =>
                      onUpdateObstacle(selectedObstacle.id, {
                        depthM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                      })
                    }
                    className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[9.5px] font-bold text-slate-500 mb-0.5">Angle (°)</label>
                  <input
                    type="number"
                    step="5"
                    value={selectedObstacle.rotationDeg ?? 0}
                    onChange={(e) =>
                      onUpdateObstacle(selectedObstacle.id, {
                        rotationDeg: ((parseFloat(e.target.value) || 0) + 360) % 360,
                      })
                    }
                    className="w-full px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono font-bold text-xs"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })()}
        </div>

        {/* Interactive Site Photo, 360° Video, Drawing Calibration & Preset Studio Drawer */}
        {showMediaDrawer && (
          <div
            className={
              isCadFullscreen
                ? 'w-full md:w-80 lg:w-96 shrink-0 h-72 md:h-full overflow-hidden'
                : 'w-full'
            }
          >
            <CadMediaReferenceDrawer
              mediaAssets={mediaAssets}
              onAddMediaAssets={(items) => onAddMediaAssets?.(items)}
              onRemoveMediaAsset={(id) => onRemoveMediaAsset?.(id)}
              activeDrawingId={activeDrawingId}
              onSelectActiveDrawing={(id) => onSelectActiveDrawing?.(id)}
              uploadedDrawing={uploadedDrawing}
              onImportDrawingFile={onImportDrawingFile}
              onUpdateDrawingOverlay={onUpdateDrawingOverlay}
              config={config}
              onAddPresetObstacle={(obs) => {
                onAddDrawnObstacle(obs);
                onSelectObstacle(obs.id);
                flashNotice(`Added ${obs.name} (H ${obs.heightM}m)`);
              }}
              onJumpToView={(target) => setViewMode(target)}
              onClose={() => setShowMediaDrawer(false)}
            />
          </div>
        )}
      </div>

      <DxfExportSummaryModal
        request={dxfPreviewRequest}
        onClose={() => setDxfPreviewRequest(null)}
        onDownloaded={(fileName) =>
          flashNotice(`Exported ${fileName} (rooftop footprint, boundaries & 550W panels)`)
        }
      />
    </div>
  );
};
