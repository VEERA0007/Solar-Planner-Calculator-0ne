import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import {
  Box,
  Check,
  Compass,
  Download,
  Grid,
  MousePointer2,
  PenTool,
  Plus,
  RotateCcw,
  Ruler,
  Satellite,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  NearObstacle,
  SiteSimulationConfig,
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  getHostRoofFootprintENU,
  getObstacleCenterENU,
  latLonToLocalMeters,
  localMetersToLatLon,
  runAnnualShadingSimulation,
} from '../utils/shadingSimulationEngine';
import {
  DEFAULT_PANEL_SPACING_550W,
  computeObstacleFootprintENU,
  packPanelsInSegmentENU,
} from '../utils/panelArrayPackingEngine';
import { StandardizedDxfPayload } from '../utils/dxfExporter';
import { computeLayoutYieldSummary } from '../utils/rooftopZoneClamper';
import { RoofStructureType, UploadedDrawingOverlay } from '../types/siteSurvey';
import { DxfExportSummaryModal, DxfPreviewRequest } from './DxfExportSummaryModal';

type PolygonUnderlayMode = 'blueprint_grid' | 'satellite';
type PolygonTemplateId = 'rect' | 'l_shape' | 'u_shape' | 't_shape' | 'chamfer';

interface RoofBoundaryPolygonViewProps {
  siteLat: number;
  siteLon: number;
  config: SiteSimulationConfig;
  uploadedDrawing?: UploadedDrawingOverlay | null;
  roofPolygonENU?: Array<{ x: number; y: number }>;
  roofPolygonLatLon?: Array<[number, number]>;
  buildingHeightM: number;
  parapetHeightM: number;
  perimeterSetbackM: number;
  roofStructureType: RoofStructureType;
  onUpdateRoofPolygon: (
    nodesENU: Array<{ x: number; y: number }> | undefined,
    nodesLatLon?: Array<[number, number]>
  ) => void;
  onUpdateBuildingStructure: (patch: {
    buildingHeightM?: number;
    parapetHeightM?: number;
    perimeterSetbackM?: number;
    roofStructureType?: RoofStructureType;
  }) => void;
  onPreviewIn3D?: (mode: 'isometric' | 'r3f_overlay') => void;
  defaultUnderlayMode?: PolygonUnderlayMode;
  hide3DPreviewButton?: boolean;
  isFullscreen?: boolean;
}

function buildTemplatePolygonENU(
  kind: PolygonTemplateId,
  widthM: number,
  depthM: number
): Array<{ x: number; y: number }> {
  const hw = Number((Math.max(8, widthM) / 2).toFixed(2));
  const hd = Number((Math.max(6, depthM) / 2).toFixed(2));

  if (kind === 'rect') {
    return [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: -hw, y: hd },
    ];
  }

  if (kind === 'l_shape') {
    // Classic South/West sunny courtyard notch removed from NE corner
    return [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: 0 },
      { x: Number((hw * 0.1).toFixed(2)), y: 0 },
      { x: Number((hw * 0.1).toFixed(2)), y: hd },
      { x: -hw, y: hd },
    ];
  }

  if (kind === 'u_shape') {
    const armW = Number((hw * 0.42).toFixed(2));
    const notchDepth = Number((hd * 0.15).toFixed(2));
    return [
      { x: -hw, y: -hd },
      { x: hw, y: -hd },
      { x: hw, y: hd },
      { x: Number((hw - armW).toFixed(2)), y: hd },
      { x: Number((hw - armW).toFixed(2)), y: notchDepth },
      { x: Number((-hw + armW).toFixed(2)), y: notchDepth },
      { x: Number((-hw + armW).toFixed(2)), y: hd },
      { x: -hw, y: hd },
    ];
  }

  if (kind === 't_shape') {
    const stemW = Number((hw * 0.48).toFixed(2));
    const stemY = Number((hd * 0.1).toFixed(2));
    return [
      { x: -stemW, y: -hd },
      { x: stemW, y: -hd },
      { x: stemW, y: stemY },
      { x: hw, y: stemY },
      { x: hw, y: hd },
      { x: -hw, y: hd },
      { x: -hw, y: stemY },
      { x: -stemW, y: stemY },
    ];
  }

  // Chamfer / angled plot terrace
  return [
    { x: -hw, y: -hd },
    { x: Number((hw * 0.68).toFixed(2)), y: -hd },
    { x: hw, y: Number((-hd * 0.25).toFixed(2)) },
    { x: hw, y: hd },
    { x: Number((-hw * 0.85).toFixed(2)), y: hd },
    { x: -hw, y: Number((hd * 0.3).toFixed(2)) },
  ];
}

function snapPoint(
  raw: { x: number; y: number },
  prevNodes: Array<{ x: number; y: number }>,
  orthoSnap: boolean,
  gridSnapM: number
): { x: number; y: number } {
  let pt = {
    x: gridSnapM > 0 ? Math.round(raw.x / gridSnapM) * gridSnapM : raw.x,
    y: gridSnapM > 0 ? Math.round(raw.y / gridSnapM) * gridSnapM : raw.y,
  };

  if (orthoSnap && prevNodes.length > 0) {
    const prev = prevNodes[prevNodes.length - 1];
    const dx = pt.x - prev.x;
    const dy = pt.y - prev.y;
    if (prevNodes.length === 1) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        pt = { x: pt.x, y: prev.y };
      } else {
        pt = { x: prev.x, y: pt.y };
      }
    } else {
      const pPrev = prevNodes[prevNodes.length - 2];
      const ux = prev.x - pPrev.x;
      const uy = prev.y - pPrev.y;
      const uLen = Math.hypot(ux, uy);
      if (uLen > 0.05) {
        const uHatX = ux / uLen;
        const uHatY = uy / uLen;
        const vHatX = -uHatY;
        const vHatY = uHatX;
        const projU = dx * uHatX + dy * uHatY;
        const projV = dx * vHatX + dy * vHatY;
        if (Math.abs(projU) >= Math.abs(projV)) {
          pt = {
            x: prev.x + uHatX * projU,
            y: prev.y + uHatY * projU,
          };
        } else {
          pt = {
            x: prev.x + vHatX * projV,
            y: prev.y + vHatY * projV,
          };
        }
      }
    }
  }

  return {
    x: Number(pt.x.toFixed(2)),
    y: Number(pt.y.toFixed(2)),
  };
}

function computeInteriorAngleDeg(
  prev: { x: number; y: number },
  curr: { x: number; y: number },
  next: { x: number; y: number }
): number {
  const v1x = prev.x - curr.x;
  const v1y = prev.y - curr.y;
  const v2x = next.x - curr.x;
  const v2y = next.y - curr.y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 < 1e-4 || m2 < 1e-4) return 0;
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

export const RoofBoundaryPolygonView: React.FC<RoofBoundaryPolygonViewProps> = ({
  siteLat,
  siteLon,
  config,
  uploadedDrawing,
  roofPolygonENU,
  roofPolygonLatLon,
  buildingHeightM,
  parapetHeightM,
  perimeterSetbackM,
  roofStructureType,
  onUpdateRoofPolygon,
  onUpdateBuildingStructure,
  onPreviewIn3D,
  defaultUnderlayMode = 'blueprint_grid',
  hide3DPreviewButton = false,
  isFullscreen = false,
}) => {
  const [underlayMode, setUnderlayMode] = useState<PolygonUnderlayMode>(defaultUnderlayMode);
  const [editMode, setEditMode] = useState<'edit' | 'draw' | 'ruler'>('edit');
  const [orthoSnap, setOrthoSnap] = useState<boolean>(true);
  const [gridSnapM, setGridSnapM] = useState<number>(0.5);
  const [draftVertices, setDraftVertices] = useState<Array<{ x: number; y: number }>>([]);
  const [rulerPts, setRulerPts] = useState<Array<{ x: number; y: number }>>([]);
  const [hoverENU, setHoverENU] = useState<{ x: number; y: number } | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [dxfPreviewRequest, setDxfPreviewRequest] = useState<DxfPreviewRequest | null>(null);

  const activePolygon = useMemo(() => getHostRoofFootprintENU(config), [config]);
  const isCustomPolygon = Boolean(roofPolygonENU && roofPolygonENU.length >= 3);
  const polyMetrics = useMemo(() => computePolygonMetricsENU(activePolygon), [activePolygon]);
  const setbackPolygon = useMemo(
    () => computeInsetPolygonENU(activePolygon, Math.max(0.2, perimeterSetbackM)),
    [activePolygon, perimeterSetbackM]
  );

  // SVG Metric Viewport Coordinate Transform
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingVertexRef = useRef<number | null>(null);
  const vbWidth = 420;
  const vbHeight = 320;
  const cxPx = vbWidth / 2;
  const cyPx = vbHeight / 2;
  const pxPerM = 8.4 * zoomScale;

  const clientToENU = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const vbX = ((clientX - rect.left) / Math.max(1, rect.width)) * vbWidth;
      const vbY = ((clientY - rect.top) / Math.max(1, rect.height)) * vbHeight;
      return {
        x: (vbX - cxPx) / pxPerM,
        y: -(vbY - cyPx) / pxPerM,
      };
    },
    [cxPx, cyPx, pxPerM]
  );

  const commitPolygonNodes = useCallback(
    (nodes: Array<{ x: number; y: number }>) => {
      if (nodes.length < 3) return;
      const rounded = nodes.map((p) => ({
        x: Number(p.x.toFixed(2)),
        y: Number(p.y.toFixed(2)),
      }));
      const latLon = rounded.map((pt): [number, number] => {
        const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
        return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
      });
      onUpdateRoofPolygon(rounded, latLon);
    },
    [onUpdateRoofPolygon, siteLat, siteLon]
  );

  // =========================================================================
  // Leaflet Satellite Map Integration for Aerial Roof Polygon Tracing
  // =========================================================================
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const mapClickRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  const mapMoveRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});

  const handleSatelliteClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      const raw = latLonToLocalMeters(siteLat, siteLon, e.latlng.lat, e.latlng.lng);
      if (editMode === 'ruler') {
        const pt = { x: Number(raw.x.toFixed(2)), y: Number(raw.y.toFixed(2)) };
        setRulerPts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
        return;
      }
      if (editMode !== 'draw') return;
      if (draftVertices.length >= 3) {
        const first = draftVertices[0];
        if (Math.hypot(raw.x - first.x, raw.y - first.y) < 1.5) {
          commitPolygonNodes(draftVertices);
          setDraftVertices([]);
          setHoverENU(null);
          setEditMode('edit');
          return;
        }
      }
      const nextPt = snapPoint(raw, draftVertices, orthoSnap, gridSnapM);
      setDraftVertices((prev) => [...prev, nextPt]);
    },
    [commitPolygonNodes, draftVertices, editMode, gridSnapM, orthoSnap, siteLat, siteLon]
  );

  const handleSatelliteMove = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (editMode !== 'draw' && editMode !== 'ruler') return;
      const raw = latLonToLocalMeters(siteLat, siteLon, e.latlng.lat, e.latlng.lng);
      setHoverENU(
        editMode === 'ruler'
          ? { x: Number(raw.x.toFixed(2)), y: Number(raw.y.toFixed(2)) }
          : snapPoint(raw, draftVertices, orthoSnap, gridSnapM)
      );
    },
    [draftVertices, editMode, gridSnapM, orthoSnap, siteLat, siteLon]
  );

  mapClickRef.current = handleSatelliteClick;
  mapMoveRef.current = handleSatelliteMove;

  useEffect(() => {
    if (underlayMode !== 'satellite' || !mapContainerRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [siteLat, siteLon],
      zoom: 20,
      maxZoom: 22,
      minZoom: 15,
      zoomControl: false,
      attributionControl: false,
    });
    mapRef.current = map;

    L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
      maxZoom: 22,
      maxNativeZoom: 20,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    layerGroupRef.current = group;

    map.on('click', (ev) => mapClickRef.current(ev));
    map.on('mousemove', (ev) => mapMoveRef.current(ev));

    const timer = window.setTimeout(() => map.invalidateSize(), 120);

    return () => {
      window.clearTimeout(timer);
      try {
        map.stop();
        map.off();
        map.remove();
      } catch {
        // Ignore teardown if detached
      }
      mapRef.current = null;
      layerGroupRef.current = null;
    };
    // Initialize map cleanly per satellite toggle
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [underlayMode]);

  useEffect(() => {
    if (underlayMode !== 'satellite' || !mapRef.current) return;
    const t = window.setTimeout(() => mapRef.current?.invalidateSize(), 80);
    return () => window.clearTimeout(t);
  }, [isFullscreen, underlayMode]);

  // Render Satellite Vector Polygon, Draggable Vertices, Edge Lengths & Draft Line
  useEffect(() => {
    const group = layerGroupRef.current;
    const map = mapRef.current;
    if (underlayMode !== 'satellite' || !group || !map) return;

    map.getContainer().style.cursor =
      editMode === 'draw' || editMode === 'ruler' ? 'crosshair' : 'grab';
    group.clearLayers();

    // Active roof boundary polygon + setback
    const polyLatLon =
      roofPolygonLatLon && roofPolygonLatLon.length === activePolygon.length
        ? roofPolygonLatLon
        : activePolygon.map((pt) => localMetersToLatLon(siteLat, siteLon, pt.x, pt.y));

    if (polyLatLon.length >= 3) {
      L.polygon(polyLatLon, {
        color: '#f59e0b',
        weight: 2.5,
        fillColor: '#f59e0b',
        fillOpacity: 0.16,
        interactive: false,
      }).addTo(group);

      const sbLatLon = setbackPolygon.map((pt) =>
        localMetersToLatLon(siteLat, siteLon, pt.x, pt.y)
      );
      L.polygon(sbLatLon, {
        color: '#38bdf8',
        weight: 1.5,
        dashArray: '5 4',
        fill: false,
        interactive: false,
      }).addTo(group);
    }

    // Draggable vertices & edge midpoint insert handles in edit mode
    if (editMode === 'edit') {
      activePolygon.forEach((pt, idx) => {
        const ll = polyLatLon[idx];
        const nextPt = activePolygon[(idx + 1) % activePolygon.length];
        const nextLl = polyLatLon[(idx + 1) % polyLatLon.length];

        const icon = L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;border-radius:9999px;background:${
            selectedVertexIdx === idx ? '#38bdf8' : '#f59e0b'
          };color:#0f172a;font-size:9px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;box-shadow:0 1px 4px rgba(0,0,0,0.7);cursor:move;">P${
            idx + 1
          }</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10],
        });
        const marker = L.marker(ll, { icon, draggable: true }).addTo(group);
        marker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          setSelectedVertexIdx(idx);
        });
        marker.on('dragend', () => {
          const pos = marker.getLatLng();
          const moved = latLonToLocalMeters(siteLat, siteLon, pos.lat, pos.lng);
          const nextNodes = activePolygon.map((n, j) =>
            j === idx ? { x: Number(moved.x.toFixed(2)), y: Number(moved.y.toFixed(2)) } : n
          );
          const nextLL: Array<[number, number]> = polyLatLon.map((p, j) =>
            j === idx ? [Number(pos.lat.toFixed(6)), Number(pos.lng.toFixed(6))] : p
          );
          onUpdateRoofPolygon(nextNodes, nextLL);
        });

        // Edge midpoint insert handle
        const segLen = Math.hypot(nextPt.x - pt.x, nextPt.y - pt.y);
        if (segLen >= 1.2) {
          const midLat = (ll[0] + nextLl[0]) / 2;
          const midLon = (ll[1] + nextLl[1]) / 2;
          const midIcon = L.divIcon({
            className: '',
            html: `<div style="padding:1px 5px;border-radius:9999px;background:rgba(15,23,42,0.88);color:#38bdf8;font-size:8.5px;font-weight:800;font-family:monospace;border:1px solid #38bdf8;white-space:nowrap;transform:translate(-50%,-50%);cursor:pointer;">+ ${segLen.toFixed(
              1
            )}m</div>`,
            iconSize: [0, 0],
          });
          const midMarker = L.marker([midLat, midLon], { icon: midIcon }).addTo(group);
          midMarker.on('click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            const midPt = {
              x: Number(((pt.x + nextPt.x) / 2).toFixed(2)),
              y: Number(((pt.y + nextPt.y) / 2).toFixed(2)),
            };
            const inserted = [
              ...activePolygon.slice(0, idx + 1),
              midPt,
              ...activePolygon.slice(idx + 1),
            ];
            commitPolygonNodes(inserted);
            setSelectedVertexIdx(idx + 1);
          });
        }
      });
    }

    // Live Drawing Preview on Satellite
    if (editMode === 'draw' && draftVertices.length > 0) {
      const previewPts = hoverENU ? [...draftVertices, hoverENU] : draftVertices;
      const previewLL = previewPts.map((p) =>
        localMetersToLatLon(siteLat, siteLon, p.x, p.y)
      );
      if (previewLL.length >= 3) {
        L.polygon(previewLL, {
          color: '#10b981',
          weight: 2.2,
          dashArray: '5 4',
          fillColor: '#10b981',
          fillOpacity: 0.2,
          interactive: false,
        }).addTo(group);
      } else if (previewLL.length >= 2) {
        L.polyline(previewLL, {
          color: '#10b981',
          weight: 2.5,
          dashArray: '5 4',
          interactive: false,
        }).addTo(group);
      }

      draftVertices.forEach((p, idx) => {
        const ll = localMetersToLatLon(siteLat, siteLon, p.x, p.y);
        const canClose = idx === 0 && draftVertices.length >= 3;
        const nIcon = L.divIcon({
          className: '',
          html: `<div style="width:${canClose ? 22 : 18}px;height:${
            canClose ? 22 : 18
          }px;border-radius:9999px;background:${
            idx === 0 ? '#10b981' : '#f59e0b'
          };color:#0f172a;font-size:8.5px;font-weight:900;display:flex;align-items:center;justify-content:center;border:2px solid #ffffff;cursor:${
            canClose ? 'pointer' : 'default'
          };">P${idx + 1}</div>`,
          iconSize: [canClose ? 22 : 18, canClose ? 22 : 18],
          iconAnchor: [canClose ? 11 : 9, canClose ? 11 : 9],
        });
        const m = L.marker(ll, { icon: nIcon, interactive: canClose }).addTo(group);
        if (canClose) {
          m.on('click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            commitPolygonNodes(draftVertices);
            setDraftVertices([]);
            setHoverENU(null);
            setEditMode('edit');
          });
        }
      });
    }

    // Active Google-Earth-style Ruler Line & Heading Readout on Satellite Map
    if (rulerPts.length > 0) {
      const targetPt = rulerPts.length >= 2 ? rulerPts[1] : hoverENU;
      if (targetPt) {
        const p1LL = localMetersToLatLon(siteLat, siteLon, rulerPts[0].x, rulerPts[0].y);
        const p2LL = localMetersToLatLon(siteLat, siteLon, targetPt.x, targetPt.y);
        L.polyline([p1LL, p2LL], {
          color: '#fde047',
          weight: 3,
          interactive: false,
        }).addTo(group);

        const lenM = Math.hypot(targetPt.x - rulerPts[0].x, targetPt.y - rulerPts[0].y);
        const hdg = Math.round(
          ((Math.atan2(targetPt.x - rulerPts[0].x, targetPt.y - rulerPts[0].y) * 180) / Math.PI +
            360) %
            360
        );
        const midLL: [number, number] = [(p1LL[0] + p2LL[0]) / 2, (p1LL[1] + p2LL[1]) / 2];
        const rIcon = L.divIcon({
          className: '',
          html: `<div style="padding:2px 7px;border-radius:8px;background:rgba(15,23,42,0.94);color:#fde047;font-size:10px;font-weight:800;font-family:monospace;border:1.5px solid #fde047;white-space:nowrap;transform:translate(-50%,-120%);">${lenM.toFixed(
            2
          )}m · ${hdg}°</div>`,
          iconSize: [0, 0],
        });
        L.marker(midLL, { icon: rIcon, interactive: false }).addTo(group);
      }
      rulerPts.forEach((rp) => {
        L.circleMarker(localMetersToLatLon(siteLat, siteLon, rp.x, rp.y), {
          radius: 5,
          color: '#ffffff',
          weight: 2,
          fillColor: '#fde047',
          fillOpacity: 1,
          interactive: false,
        }).addTo(group);
      });
    }
  }, [
    activePolygon,
    commitPolygonNodes,
    draftVertices,
    editMode,
    hoverENU,
    onUpdateRoofPolygon,
    roofPolygonLatLon,
    rulerPts,
    selectedVertexIdx,
    setbackPolygon,
    siteLat,
    siteLon,
    underlayMode,
  ]);

  // Helper to format ENU polygon as SVG points
  const toSvgPointsStr = (pts: Array<{ x: number; y: number }>) =>
    pts
      .map((p) => `${(cxPx + p.x * pxPerM).toFixed(1)},${(cyPx - p.y * pxPerM).toFixed(1)}`)
      .join(' ');

  return (
    <div className="flex flex-col gap-2.5 h-full">
      {/* Top Action & Template Strip */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 shrink-0">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => {
              setEditMode('edit');
              setDraftVertices([]);
              setHoverENU(null);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border flex items-center gap-1 cursor-pointer transition ${
              editMode === 'edit'
                ? 'bg-sky-600 text-white border-sky-600'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <MousePointer2 className="w-3 h-3" />
            <span>Edit Vertices</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditMode('draw');
              setDraftVertices([]);
              setHoverENU(null);
              setSelectedVertexIdx(null);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border flex items-center gap-1 cursor-pointer transition ${
              editMode === 'draw'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
          >
            <PenTool className="w-3 h-3" />
            <span>Trace Roof Polygon</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEditMode((m) => (m === 'ruler' ? 'edit' : 'ruler'));
              setRulerPts([]);
            }}
            className={`px-2.5 py-1.5 rounded-xl text-[10.5px] font-bold border flex items-center gap-1 cursor-pointer transition ${
              editMode === 'ruler'
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Measure real roof span & azimuth heading (2-click ruler)"
          >
            <Ruler className="w-3 h-3" />
            <span>Ruler</span>
          </button>

          <button
            type="button"
            onClick={() => setOrthoSnap((v) => !v)}
            className={`px-2 py-1.5 rounded-xl text-[10px] font-bold border cursor-pointer transition ${
              orthoSnap
                ? 'bg-amber-600 text-white border-amber-500'
                : 'bg-slate-800/80 text-slate-400 border-slate-700'
            }`}
            title="Lock right-angle / parallel architectural corners while drawing or dragging"
          >
            90° Ortho
          </button>

          <select
            value={gridSnapM}
            onChange={(e) => setGridSnapM(parseFloat(e.target.value))}
            className="px-2 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-[10px] font-mono font-bold text-slate-200 cursor-pointer"
            title="Metric vertex grid snap step"
          >
            <option value={0}>Free</option>
            <option value={0.25}>0.25m Snap</option>
            <option value={0.5}>0.5m Snap</option>
            <option value={1}>1.0m Snap</option>
          </select>
        </div>

        <div className="flex items-center gap-1">
          {/* Underlay Switcher */}
          <div className="flex items-center bg-slate-800 p-0.5 rounded-xl border border-slate-700 text-[10px] font-bold">
            <button
              type="button"
              onClick={() => setUnderlayMode('blueprint_grid')}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer ${
                underlayMode === 'blueprint_grid'
                  ? 'bg-slate-950 text-sky-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Grid className="w-3 h-3" />
              <span>2D Plan</span>
            </button>
            <button
              type="button"
              onClick={() => setUnderlayMode('satellite')}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 cursor-pointer ${
                underlayMode === 'satellite'
                  ? 'bg-slate-950 text-amber-400'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Satellite className="w-3 h-3" />
              <span>Satellite</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              const spacing = {
                ...DEFAULT_PANEL_SPACING_550W,
                azimuthDeg: config.azimuthCompassDeg,
              };
              const packed = packPanelsInSegmentENU(
                {
                  centerX: polyMetrics.cx,
                  centerY: polyMetrics.cy,
                  widthM: polyMetrics.widthM,
                  depthM: polyMetrics.depthM,
                  azimuthDeg: config.azimuthCompassDeg,
                },
                spacing,
                activePolygon,
                perimeterSetbackM,
                config.obstacles
              );
              const hw = polyMetrics.widthM / 2;
              const hd = polyMetrics.depthM / 2;
              const simConfig: SiteSimulationConfig = {
                ...config,
                roofPolygonENU: activePolygon,
                buildingHeightM,
                parapetHeightM,
                perimeterSetbackM,
                roofStructureType,
              };
              const annual = runAnnualShadingSimulation(simConfig);
              const usableMetrics = computePolygonMetricsENU(
                setbackPolygon.length >= 3 ? setbackPolygon : activePolygon
              );
              const payload: StandardizedDxfPayload = {
                siteName: `${roofStructureType.toUpperCase()} Roof Plan`,
                latitude: siteLat,
                longitude: siteLon,
                buildingHeightM,
                parapetHeightM,
                perimeterSetbackM,
                buildingFootprintENU: activePolygon,
                roofBoundaries: [
                  {
                    name: 'HOST ROOF BOUNDARY',
                    boundaryENU: activePolygon,
                    setbackENU: setbackPolygon,
                    areaSqM: polyMetrics.areaSqM,
                  },
                ],
                arraySegments: [
                  {
                    name: 'Rooftop 550W Array',
                    widthM: polyMetrics.widthM,
                    depthM: polyMetrics.depthM,
                    centerX: polyMetrics.cx,
                    centerY: polyMetrics.cy,
                    azimuthDeg: config.azimuthCompassDeg,
                    panelWattage: spacing.panelWattage,
                    panelCount: packed.fittedPanelsCount,
                    orientation: packed.chosenOrientation,
                    segmentCornersENU: [
                      { x: polyMetrics.cx - hw, y: polyMetrics.cy - hd },
                      { x: polyMetrics.cx + hw, y: polyMetrics.cy - hd },
                      { x: polyMetrics.cx + hw, y: polyMetrics.cy + hd },
                      { x: polyMetrics.cx - hw, y: polyMetrics.cy + hd },
                    ],
                    panelsCornersENU: packed.panels.map((p) => p.cornersENU),
                  },
                ],
                obstacles: config.obstacles.map((o) => ({
                  name: o.name,
                  heightM: o.heightM,
                  polygonENU: computeObstacleFootprintENU(o),
                  labelPosENU: getObstacleCenterENU(o),
                })),
                spacingNotes: `Roof Type: ${roofStructureType} | Perimeter ${polyMetrics.perimeterM}m | Gross ${polyMetrics.areaSqM}m2`,
              };
              const yieldSummary = computeLayoutYieldSummary(
                packed.fittedPanelsCount,
                spacing.panelWattage,
                annual,
                polyMetrics.areaSqM,
                usableMetrics.areaSqM,
                1,
                packed.chosenOrientation
              );
              setDxfPreviewRequest({
                fileNameBase: `roof_footprint_${siteLat.toFixed(4)}_${siteLon.toFixed(4)}`,
                payload,
                yieldSummary,
              });
            }}
            className="px-2.5 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer shadow whitespace-nowrap"
            title="Preview annual yield & export building footprint and rooftop boundary to standardized AutoCAD R12 DXF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .DXF</span>
          </button>

          {!hide3DPreviewButton && (
            <button
              type="button"
              onClick={() => onPreviewIn3D?.('isometric')}
              className="px-2.5 py-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-[10.5px] font-bold flex items-center gap-1 cursor-pointer shadow whitespace-nowrap"
              title="Extrude this roof polygon in 3D AutoCAD Visualizer"
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D Extrude</span>
            </button>
          )}
        </div>
      </div>

      {/* Architectural Footprint Templates */}
      <div className="flex flex-wrap items-center gap-1.5 shrink-0 text-[10px]">
        <span className="font-bold text-slate-400 uppercase tracking-wider mr-0.5">
          Templates:
        </span>
        {(
          [
            { id: 'rect', label: 'Rect' },
            { id: 'l_shape', label: 'L-Shape' },
            { id: 'u_shape', label: 'U-Shape' },
            { id: 't_shape', label: 'T-Shape' },
            { id: 'chamfer', label: 'Chamfer' },
          ] as Array<{ id: PolygonTemplateId; label: string }>
        ).map((tpl) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => {
              const pts = buildTemplatePolygonENU(
                tpl.id,
                config.roofLengthM || 16,
                config.roofWidthM || 14
              );
              commitPolygonNodes(pts);
              setEditMode('edit');
              setDraftVertices([]);
              setSelectedVertexIdx(null);
            }}
            className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold cursor-pointer transition"
          >
            {tpl.label}
          </button>
        ))}

        {isCustomPolygon && (
          <button
            type="button"
            onClick={() => {
              onUpdateRoofPolygon(undefined, undefined);
              setSelectedVertexIdx(null);
            }}
            className="px-2 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-700/70 text-rose-300 font-bold flex items-center gap-1 cursor-pointer ml-auto"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Default Rect</span>
          </button>
        )}
      </div>

      {/* Main Interactive Roof Polygon Canvas (Grid/Drawing OR Satellite Aerial) */}
      <div
        className={`relative w-full rounded-2xl overflow-hidden border border-slate-700/80 bg-[#090d16] shadow-inner ${
          isFullscreen ? 'flex-1 min-h-[260px]' : 'h-80'
        }`}
      >
        {underlayMode === 'satellite' ? (
          <div key="roof-poly-satellite-pane" className="w-full h-full relative">
            <div ref={mapContainerRef} className="w-full h-full z-0" />
          </div>
        ) : (
          <div key="roof-poly-grid-pane" className="w-full h-full relative">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${vbWidth} ${vbHeight}`}
              className={`w-full h-full select-none touch-none ${
                editMode === 'draw' || editMode === 'ruler' ? 'cursor-crosshair' : 'cursor-default'
              }`}
              onClick={(e) => {
                if (draggingVertexRef.current !== null) return;
                const raw = clientToENU(e.clientX, e.clientY);
                if (editMode === 'ruler') {
                  const pt = snapPoint(raw, [], false, gridSnapM);
                  setRulerPts((prev) => (prev.length >= 2 ? [pt] : [...prev, pt]));
                  return;
                }
                if (editMode !== 'draw') return;
                if (draftVertices.length >= 3) {
                  const first = draftVertices[0];
                  if (Math.hypot(raw.x - first.x, raw.y - first.y) < 1.5 / zoomScale) {
                    commitPolygonNodes(draftVertices);
                    setDraftVertices([]);
                    setHoverENU(null);
                    setEditMode('edit');
                    return;
                  }
                }
                const nextPt = snapPoint(raw, draftVertices, orthoSnap, gridSnapM);
                setDraftVertices((prev) => [...prev, nextPt]);
              }}
              onDoubleClick={() => {
                if (editMode === 'draw' && draftVertices.length >= 3) {
                  commitPolygonNodes(draftVertices);
                  setDraftVertices([]);
                  setHoverENU(null);
                  setEditMode('edit');
                }
              }}
              onPointerMove={(e) => {
                const raw = clientToENU(e.clientX, e.clientY);
                if (draggingVertexRef.current !== null) {
                  const idx = draggingVertexRef.current;
                  const snapped = snapPoint(raw, [], false, gridSnapM);
                  const nextNodes = activePolygon.map((n, j) => (j === idx ? snapped : n));
                  commitPolygonNodes(nextNodes);
                  return;
                }
                if (editMode === 'draw') {
                  setHoverENU(snapPoint(raw, draftVertices, orthoSnap, gridSnapM));
                } else {
                  setHoverENU(raw);
                }
              }}
              onPointerUp={() => {
                draggingVertexRef.current = null;
              }}
              onPointerCancel={() => {
                draggingVertexRef.current = null;
              }}
              onPointerLeave={() => {
                draggingVertexRef.current = null;
                setHoverENU(null);
              }}
            >
              <defs>
                <pattern
                  id="roofPolyGrid2m"
                  width={pxPerM * 2}
                  height={pxPerM * 2}
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d={`M ${pxPerM * 2} 0 L 0 0 0 ${pxPerM * 2}`}
                    fill="none"
                    stroke="#1e293b"
                    strokeWidth="0.7"
                  />
                </pattern>
              </defs>

              <rect width={vbWidth} height={vbHeight} fill="#090d16" />

              {/* Uploaded 2D Drawing Underlay for Accurate Tracing */}
              {uploadedDrawing && uploadedDrawing.visible && uploadedDrawing.url && (
                <image
                  href={uploadedDrawing.url}
                  x={cxPx + (uploadedDrawing.offsetX ?? 0) * pxPerM - (uploadedDrawing.widthM * pxPerM) / 2}
                  y={cyPx - (uploadedDrawing.offsetY ?? 0) * pxPerM - (uploadedDrawing.depthM * pxPerM) / 2}
                  width={Math.max(4, uploadedDrawing.widthM) * pxPerM}
                  height={Math.max(4, uploadedDrawing.depthM) * pxPerM}
                  opacity={uploadedDrawing.opacity}
                  preserveAspectRatio="none"
                  transform={`rotate(${uploadedDrawing.rotationDeg} ${cxPx} ${cyPx})`}
                />
              )}

              <rect width={vbWidth} height={vbHeight} fill="url(#roofPolyGrid2m)" opacity="0.6" />

              {/* Axis crosshairs & Cardinal labels */}
              <line x1={0} y1={cyPx} x2={vbWidth} y2={cyPx} stroke="#334155" strokeWidth="0.7" strokeDasharray="3 3" />
              <line x1={cxPx} y1={0} x2={cxPx} y2={vbHeight} stroke="#334155" strokeWidth="0.7" strokeDasharray="3 3" />
              <text x={cxPx} y="14" textAnchor="middle" fontSize="9.5" fontWeight="bold" fill="#f87171">N</text>
              <text x={vbWidth - 10} y={cyPx + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#64748b">E</text>
              <text x={cxPx} y={vbHeight - 6} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#f59e0b">S</text>
              <text x="10" y={cyPx + 3} textAnchor="middle" fontSize="9" fontWeight="bold" fill="#64748b">W</text>

              {/* Ghost Nearby Obstacles for spatial context */}
              {config.obstacles.map((obs: NearObstacle) => {
                const c = getObstacleCenterENU(obs);
                const pts = obs.nodesENU && obs.nodesENU.length >= 3
                  ? obs.nodesENU
                  : [
                      { x: c.x - obs.widthM / 2, y: c.y - obs.depthM / 2 },
                      { x: c.x + obs.widthM / 2, y: c.y - obs.depthM / 2 },
                      { x: c.x + obs.widthM / 2, y: c.y + obs.depthM / 2 },
                      { x: c.x - obs.widthM / 2, y: c.y + obs.depthM / 2 },
                    ];
                return (
                  <polygon
                    key={`rp-obs-${obs.id}`}
                    points={toSvgPointsStr(pts)}
                    fill="#334155"
                    fillOpacity="0.35"
                    stroke="#475569"
                    strokeWidth="0.8"
                    className="pointer-events-none"
                  />
                );
              })}

              {/* Active Building Roof Boundary Polygon */}
              <polygon
                points={toSvgPointsStr(activePolygon)}
                fill="#f59e0b"
                fillOpacity={editMode === 'draw' ? '0.07' : '0.16'}
                stroke="#f59e0b"
                strokeWidth="2"
                className="pointer-events-none"
              />

              {/* Computed Inset Setback Boundary Polygon */}
              <polygon
                points={toSvgPointsStr(setbackPolygon)}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.1"
                strokeDasharray="4 2.5"
                className="pointer-events-none"
              />

              {/* Wall Segment Dimension Labels + Midpoint Split Handles */}
              {activePolygon.map((p1, idx) => {
                const p2 = activePolygon[(idx + 1) % activePolygon.length];
                const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
                const mx = cxPx + ((p1.x + p2.x) / 2) * pxPerM;
                const my = cyPx - ((p1.y + p2.y) / 2) * pxPerM;
                if (segLen < 0.8) return null;
                return (
                  <g
                    key={`rp-edge-${idx}`}
                    onClick={(ev) => {
                      if (editMode !== 'edit') return;
                      ev.stopPropagation();
                      const midPt = {
                        x: Number(((p1.x + p2.x) / 2).toFixed(2)),
                        y: Number(((p1.y + p2.y) / 2).toFixed(2)),
                      };
                      const inserted = [
                        ...activePolygon.slice(0, idx + 1),
                        midPt,
                        ...activePolygon.slice(idx + 1),
                      ];
                      commitPolygonNodes(inserted);
                      setSelectedVertexIdx(idx + 1);
                    }}
                    className={editMode === 'edit' ? 'cursor-pointer' : 'pointer-events-none'}
                  >
                    <rect
                      x={mx - 19}
                      y={my - 7.5}
                      width="38"
                      height="15"
                      rx="4"
                      fill="#0f172a"
                      fillOpacity="0.9"
                      stroke={editMode === 'edit' ? '#38bdf8' : '#475569'}
                      strokeWidth="0.8"
                    />
                    <text
                      x={mx}
                      y={my + 2.8}
                      textAnchor="middle"
                      fontSize="7"
                      fontWeight="bold"
                      fill="#bae6fd"
                      className="font-mono"
                    >
                      {editMode === 'edit' ? `+${segLen.toFixed(1)}` : `${segLen.toFixed(1)}m`}
                    </text>
                  </g>
                );
              })}

              {/* Draggable Corner Vertices (Edit Mode) */}
              {editMode === 'edit' &&
                activePolygon.map((pt, idx) => {
                  const px = cxPx + pt.x * pxPerM;
                  const py = cyPx - pt.y * pxPerM;
                  const isSel = selectedVertexIdx === idx;
                  const pPrev = activePolygon[(idx - 1 + activePolygon.length) % activePolygon.length];
                  const pNext = activePolygon[(idx + 1) % activePolygon.length];
                  const angleDeg = computeInteriorAngleDeg(pPrev, pt, pNext);

                  return (
                    <g
                      key={`rp-vtx-${idx}`}
                      onPointerDown={(ev) => {
                        ev.stopPropagation();
                        setSelectedVertexIdx(idx);
                        draggingVertexRef.current = idx;
                      }}
                      className="cursor-grab active:cursor-grabbing"
                    >
                      <circle
                        cx={px}
                        cy={py}
                        r={isSel ? '7.5' : '6.2'}
                        fill={isSel ? '#38bdf8' : '#f59e0b'}
                        stroke="#ffffff"
                        strokeWidth="1.6"
                      />
                      <text
                        x={px}
                        y={py + 2.3}
                        textAnchor="middle"
                        fontSize="6.5"
                        fontWeight="bold"
                        fill="#0f172a"
                        className="pointer-events-none"
                      >
                        P{idx + 1}
                      </text>
                      {isSel && (
                        <text
                          x={px}
                          y={py - 10}
                          textAnchor="middle"
                          fontSize="7"
                          fontWeight="bold"
                          fill="#fde047"
                          className="font-mono pointer-events-none"
                        >
                          {angleDeg}°
                        </text>
                      )}
                    </g>
                  );
                })}

              {/* Live Drawing Preview (Draw Mode) */}
              {editMode === 'draw' && draftVertices.length > 0 && (
                <g className="pointer-events-none">
                  {(() => {
                    const previewPts = hoverENU ? [...draftVertices, hoverENU] : draftVertices;
                    return previewPts.length >= 3 ? (
                      <polygon
                        points={toSvgPointsStr(previewPts)}
                        fill="#10b981"
                        fillOpacity="0.22"
                        stroke="#10b981"
                        strokeWidth="1.8"
                        strokeDasharray="4 3"
                      />
                    ) : previewPts.length >= 2 ? (
                      <polyline
                        points={toSvgPointsStr(previewPts)}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        strokeDasharray="4 3"
                      />
                    ) : null;
                  })()}

                  {draftVertices.map((pt, idx) => (
                    <g key={`rp-draft-${idx}`}>
                      <circle
                        cx={cxPx + pt.x * pxPerM}
                        cy={cyPx - pt.y * pxPerM}
                        r={idx === 0 && draftVertices.length >= 3 ? '7' : '5.5'}
                        fill={idx === 0 ? '#10b981' : '#f59e0b'}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                      <text
                        x={cxPx + pt.x * pxPerM}
                        y={cyPx - pt.y * pxPerM + 2.2}
                        textAnchor="middle"
                        fontSize="6.5"
                        fontWeight="bold"
                        fill="#0f172a"
                      >
                        {idx + 1}
                      </text>
                    </g>
                  ))}
                </g>
              )}

              {/* 2-Point Ruler Overlay in SVG Plan View */}
              {rulerPts.length > 0 && (() => {
                const target = rulerPts.length >= 2 ? rulerPts[1] : hoverENU;
                if (!target) return null;
                const x1 = cxPx + rulerPts[0].x * pxPerM;
                const y1 = cyPx - rulerPts[0].y * pxPerM;
                const x2 = cxPx + target.x * pxPerM;
                const y2 = cyPx - target.y * pxPerM;
                const len = Math.hypot(target.x - rulerPts[0].x, target.y - rulerPts[0].y);
                const hdg = Math.round(
                  ((Math.atan2(target.x - rulerPts[0].x, target.y - rulerPts[0].y) * 180) /
                    Math.PI +
                    360) %
                    360
                );
                return (
                  <g className="pointer-events-none">
                    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fde047" strokeWidth="2.2" />
                    <circle cx={x1} cy={y1} r="4" fill="#fde047" stroke="#0f172a" strokeWidth="1" />
                    <circle cx={x2} cy={y2} r="4" fill="#fde047" stroke="#0f172a" strokeWidth="1" />
                    <rect
                      x={(x1 + x2) / 2 - 40}
                      y={(y1 + y2) / 2 - 16}
                      width="80"
                      height="14"
                      rx="4"
                      fill="#0f172a"
                      stroke="#fde047"
                      strokeWidth="0.9"
                    />
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 6.5}
                      textAnchor="middle"
                      fontSize="7"
                      fontWeight="bold"
                      fill="#fde047"
                      className="font-mono"
                    >
                      {len.toFixed(2)}m · {hdg}°
                    </text>
                  </g>
                );
              })()}
            </svg>

            {/* 2D Zoom Controls */}
            <div className="absolute top-2.5 right-2.5 flex flex-col gap-1 z-10">
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.min(2.2, Number((z + 0.2).toFixed(2))))}
                className="w-7 h-7 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer"
                title="Zoom In"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoomScale((z) => Math.max(0.5, Number((z - 0.2).toFixed(2))))}
                className="w-7 h-7 rounded-lg bg-slate-900/90 border border-slate-700 text-slate-200 hover:text-white flex items-center justify-center cursor-pointer text-xs font-bold"
                title="Zoom Out"
              >
                −
              </button>
            </div>
          </div>
        )}

        {/* Top-Left Live Footprint Metric Badge */}
        <div className="absolute top-2.5 left-2.5 z-[910] px-2.5 py-1 rounded-xl bg-slate-950/90 border border-slate-700/90 text-[10px] font-mono text-slate-200 pointer-events-none">
          <span className="text-amber-400 font-bold">{activePolygon.length} Vertices</span>
          <span className="mx-1.5 text-slate-500">·</span>
          <span className="text-emerald-400 font-bold">{polyMetrics.areaSqM} m²</span>
          <span className="mx-1.5 text-slate-500">·</span>
          <span>Perim {polyMetrics.perimeterM} m</span>
          <span className="mx-1.5 text-slate-500">·</span>
          <span>{polyMetrics.widthM}×{polyMetrics.depthM} m</span>
        </div>

        {/* Drawing Toolbar Floating Controls when tracing new Roof Polygon */}
        {editMode === 'draw' && (
          <div className="absolute bottom-2.5 right-2.5 z-[920] flex items-center gap-1.5">
            {draftVertices.length > 0 && (
              <button
                type="button"
                onClick={() => setDraftVertices((prev) => prev.slice(0, -1))}
                className="px-2.5 py-1.5 rounded-xl bg-slate-900/95 border border-rose-500/60 text-rose-300 text-[10.5px] font-bold flex items-center gap-1 cursor-pointer shadow"
              >
                <Undo2 className="w-3 h-3" />
                <span>Undo P{draftVertices.length}</span>
              </button>
            )}
            {draftVertices.length >= 3 && (
              <button
                type="button"
                onClick={() => {
                  commitPolygonNodes(draftVertices);
                  setDraftVertices([]);
                  setHoverENU(null);
                  setEditMode('edit');
                }}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer shadow-lg"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply Roof ({draftVertices.length})</span>
              </button>
            )}
          </div>
        )}

        {/* Bottom-Left Cursor / Ruler Hint */}
        <div className="absolute bottom-2.5 left-2.5 z-[910] px-2.5 py-1 rounded-xl bg-slate-950/90 border border-slate-700/80 text-[10px] font-mono text-slate-300 pointer-events-none">
          {editMode === 'ruler'
            ? rulerPts.length === 0
              ? 'Ruler: Click Start Point A on map/roof'
              : rulerPts.length === 1
              ? 'Ruler: Click End Point B to lock length & heading'
              : `Measured ${Math.hypot(rulerPts[1].x - rulerPts[0].x, rulerPts[1].y - rulerPts[0].y).toFixed(2)}m · Heading ${Math.round(((Math.atan2(rulerPts[1].x - rulerPts[0].x, rulerPts[1].y - rulerPts[0].y) * 180) / Math.PI + 360) % 360)}° (Click to measure again)`
            : editMode === 'draw'
            ? draftVertices.length === 0
              ? 'Tap Corner P1 on roof perimeter to start tracing'
              : `${draftVertices.length} corner(s) plotted — tap P1 or Apply Roof to extrude 3D`
            : hoverENU
            ? `Cursor E ${hoverENU.x >= 0 ? '+' : ''}${hoverENU.x.toFixed(1)}m · N ${hoverENU.y >= 0 ? '+' : ''}${hoverENU.y.toFixed(1)}m`
            : 'Drag P1–Pn corners · Click + edge labels to split wall'}
        </div>
      </div>

      {/* Bottom 3D Building Form, Parapet Height & Selected Vertex Inspector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10.5px] shrink-0">
        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex justify-between font-bold text-slate-300 mb-1">
            <span>Building H</span>
            <span className="font-mono text-amber-400">{buildingHeightM.toFixed(1)}m</span>
          </div>
          <input
            type="range"
            min="2.5"
            max="24"
            step="0.5"
            value={buildingHeightM}
            onChange={(e) =>
              onUpdateBuildingStructure({ buildingHeightM: parseFloat(e.target.value) })
            }
            className="w-full accent-[#FF6F00] cursor-pointer"
          />
        </div>

        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex justify-between font-bold text-slate-300 mb-1">
            <span>Parapet H</span>
            <span className="font-mono text-sky-400">{parapetHeightM.toFixed(2)}m</span>
          </div>
          <input
            type="range"
            min="0"
            max="3.0"
            step="0.1"
            value={parapetHeightM}
            onChange={(e) =>
              onUpdateBuildingStructure({ parapetHeightM: parseFloat(e.target.value) })
            }
            className="w-full accent-sky-500 cursor-pointer"
          />
        </div>

        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex justify-between font-bold text-slate-300 mb-1">
            <span>Setback</span>
            <span className="font-mono text-emerald-400">{perimeterSetbackM.toFixed(1)}m</span>
          </div>
          <input
            type="range"
            min="0.2"
            max="2.5"
            step="0.1"
            value={perimeterSetbackM}
            onChange={(e) =>
              onUpdateBuildingStructure({ perimeterSetbackM: parseFloat(e.target.value) })
            }
            className="w-full accent-emerald-500 cursor-pointer"
          />
        </div>

        <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <label className="block font-bold text-slate-300 mb-1">Roof Profile</label>
          <select
            value={roofStructureType}
            onChange={(e) =>
              onUpdateBuildingStructure({
                roofStructureType: e.target.value as RoofStructureType,
              })
            }
            className="w-full px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 text-[10.5px] font-bold text-white cursor-pointer"
          >
            <option value="rcc_flat">Flat RCC + Parapet</option>
            <option value="gabled">Pitched Gable</option>
            <option value="shed_slope">Monopitch Shed</option>
          </select>
        </div>
      </div>

      {/* Selected Vertex Action Strip */}
      {selectedVertexIdx !== null && activePolygon[selectedVertexIdx] && (
        <div className="px-3 py-2 rounded-xl bg-slate-900 border border-sky-500/40 flex flex-wrap items-center justify-between gap-2 text-[10.5px] shrink-0">
          <div className="flex items-center gap-2 font-mono">
            <Compass className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="font-bold text-sky-300">Vertex P{selectedVertexIdx + 1}</span>
            <span className="text-slate-400">E</span>
            <input
              type="number"
              step="0.5"
              value={activePolygon[selectedVertexIdx].x}
              onChange={(e) => {
                const vx = parseFloat(e.target.value);
                if (!Number.isFinite(vx)) return;
                commitPolygonNodes(
                  activePolygon.map((pt, j) => (j === selectedVertexIdx ? { ...pt, x: vx } : pt))
                );
              }}
              className="w-14 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white"
            />
            <span className="text-slate-400">N</span>
            <input
              type="number"
              step="0.5"
              value={activePolygon[selectedVertexIdx].y}
              onChange={(e) => {
                const vy = parseFloat(e.target.value);
                if (!Number.isFinite(vy)) return;
                commitPolygonNodes(
                  activePolygon.map((pt, j) => (j === selectedVertexIdx ? { ...pt, y: vy } : pt))
                );
              }}
              className="w-14 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white"
            />
          </div>

          <div className="flex items-center gap-1.5">
            {activePolygon.length > 3 && (
              <button
                type="button"
                onClick={() => {
                  const next = activePolygon.filter((_, j) => j !== selectedVertexIdx);
                  commitPolygonNodes(next);
                  setSelectedVertexIdx(Math.max(0, selectedVertexIdx - 1));
                }}
                className="px-2 py-1 rounded-lg bg-rose-950/70 text-rose-300 hover:bg-rose-900 font-bold flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove P{selectedVertexIdx + 1}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedVertexIdx(null)}
              className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 font-bold cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
      <DxfExportSummaryModal
        request={dxfPreviewRequest}
        onClose={() => setDxfPreviewRequest(null)}
      />
    </div>
  );
};
