import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  X,
  Layers,
  Crosshair,
  Plus,
  Minus,
  Check,
  Navigation,
  Search,
  Undo2,
  Trash2,
  CheckCircle2,
  Sun,
  Compass,
  Sliders,
  Sparkles,
  LayoutGrid,
  Ruler,
  Footprints,
  Square,
  Download,
} from 'lucide-react';
import L from 'leaflet';
import { detectExactLocation, searchAddressOrPlace } from '../services/weatherService';
import { FloatingSolarCompass } from './FloatingSolarCompass';
import { SOLAR_PANEL_CATALOG, getPanelSpecification } from '../data/panelDatabase';
import { EngineeringLayoutSettingsModal } from './EngineeringLayoutSettingsModal';
import {
  DEFAULT_ROOF_LAYOUT_CONFIG,
  solveRooftopLayout,
} from '../utils/roofLayoutEngine';
import {
  latLonRectToSegmentENU,
  packPanelsInSegmentENU,
  PanelSpacingSpec,
  segmentAndPanelsToLatLon,
} from '../utils/panelArrayPackingEngine';
import { StandardizedDxfPayload } from '../utils/dxfExporter';
import {
  HORIZON_PRESETS,
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  latLonToLocalMeters,
  runAnnualShadingSimulation,
} from '../utils/shadingSimulationEngine';
import { computeLayoutYieldSummary } from '../utils/rooftopZoneClamper';
import { DxfExportSummaryModal, DxfPreviewRequest } from './DxfExportSummaryModal';
import { RoofLayoutConfig } from '../types/solar';

interface DrawnArraySegmentRect {
  id: string;
  name: string;
  cornerA: [number, number];
  cornerB: [number, number];
  azimuthDeg?: number;
}

interface RoofCalculationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialAreaM2?: number;
  latitude: number;
  longitude: number;
  locationName?: string;
  initialPanelWattage?: number;
  onConfirmArea: (areaM2: number, panelCount?: number, systemKw?: number) => void;
  onUpdateLocation?: (lat: number, lon: number, locationName?: string) => void;
}

export type MapTileProvider = 'google-hybrid' | 'esri-satellite' | 'google-satellite' | 'osm-street';

interface TileConfig {
  id: MapTileProvider;
  name: string;
  shortName: string;
  url: string;
  maxZoom: number;
  maxNativeZoom: number;
  subdomains?: string[];
}

const TILE_PROVIDERS: TileConfig[] = [
  {
    id: 'google-hybrid',
    name: 'Google Hybrid (High Resolution Satellite + Roads)',
    shortName: 'Google HD',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    maxZoom: 22,
    maxNativeZoom: 20,
  },
  {
    id: 'google-satellite',
    name: 'Google Satellite Pure (Clean Aerial Photo)',
    shortName: 'Satellite',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    maxZoom: 22,
    maxNativeZoom: 20,
  },
  {
    id: 'esri-satellite',
    name: 'Esri World Imagery (Aerial Clarity)',
    shortName: 'Esri Aerial',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 21,
    maxNativeZoom: 19,
  },
  {
    id: 'osm-street',
    name: 'Street Map (Roads)',
    shortName: 'Streets',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19,
    maxNativeZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
];

export interface RoofGeometryAnalysis {
  pitchAngleDeg: number;
  pitchRatio: string;
  azimuthDeg: number;
  cardinalDirection: string;
  solarEfficiencyPercent: number;
  aspectRatio: number;
  ridgeLengthM: number;
  eaveLengthM: number;
  ridgeAngleDeg: number;
  deviationFromSouthDeg: number;
}

/**
 * High-precision geodesic area calculation using local metric projection
 * Computes exact square meters for ANY custom closed polygon
 */
function computePolygonAreaM2(pts: [number, number][]): number {
  if (pts.length < 3) return 0;

  let cLat = 0,
    cLon = 0;
  for (const [lat, lon] of pts) {
    cLat += lat;
    cLon += lon;
  }
  cLat /= pts.length;
  cLon /= pts.length;

  const rad = Math.PI / 180;
  const metersPerDegLat = 111132.954;
  const metersPerDegLon = 111412.84 * Math.cos(cLat * rad);

  const xy = pts.map(([lat, lon]) => [
    (lon - cLon) * metersPerDegLon,
    (lat - cLat) * metersPerDegLat,
  ]);

  let sum = 0;
  for (let i = 0; i < xy.length; i++) {
    const j = (i + 1) % xy.length;
    sum += xy[i][0] * xy[j][1] - xy[j][0] * xy[i][1];
  }
  const area = Math.abs(sum) / 2;
  return parseFloat(area.toFixed(2));
}

/**
 * Compute total perimeter in meters
 */
function computePolygonPerimeterMeters(pts: [number, number][]): number {
  if (pts.length < 2) return 0;
  let perimeter = 0;
  const rad = Math.PI / 180;
  const midLat = pts[0][0];
  const metersPerDegLat = 111132.954;
  const metersPerDegLon = 111412.84 * Math.cos(midLat * rad);

  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dLat = (pts[j][0] - pts[i][0]) * metersPerDegLat;
    const dLon = (pts[j][1] - pts[i][1]) * metersPerDegLon;
    perimeter += Math.sqrt(dLat * dLat + dLon * dLon);
  }
  return parseFloat(perimeter.toFixed(1));
}

/**
 * Calculate polygon centroid [lat, lon]
 */
function computePolygonCentroid(pts: [number, number][]): [number, number] {
  if (pts.length === 0) return [17.41, 78.44];
  let latSum = 0,
    lonSum = 0;
  pts.forEach(([lt, ln]) => {
    latSum += lt;
    lonSum += ln;
  });
  return [latSum / pts.length, lonSum / pts.length];
}

/**
 * Estimate rooftop pitch angle, azimuth, ridge orientation, and solar efficiency based on geometry
 */
function analyzeRoofGeometry(pts: [number, number][], latitude = 17.41): RoofGeometryAnalysis {
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];

  if (pts.length < 2) {
    return {
      pitchAngleDeg: 18,
      pitchRatio: '4:12 (Standard)',
      azimuthDeg: 180,
      cardinalDirection: 'South',
      solarEfficiencyPercent: 96,
      aspectRatio: 1.35,
      ridgeLengthM: 6.2,
      eaveLengthM: 4.4,
      ridgeAngleDeg: 90,
      deviationFromSouthDeg: 0,
    };
  }

  const rad = Math.PI / 180;
  const midLat = pts[0][0];
  const metersPerDegLat = 111132.954;
  const metersPerDegLon = 111412.84 * Math.cos(midLat * rad);

  // If 2 points are drawn, calculate the live orientation of that edge
  if (pts.length === 2) {
    const dLat = (pts[1][0] - pts[0][0]) * metersPerDegLat;
    const dLon = (pts[1][1] - pts[0][1]) * metersPerDegLon;
    const len = Math.sqrt(dLat * dLat + dLon * dLon);
    let angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    let slopeAzimuth = (angle + 90) % 360;
    if (slopeAzimuth < 90 || slopeAzimuth > 270) {
      slopeAzimuth = (slopeAzimuth + 180) % 360;
    }

    const dirIndex = Math.round(slopeAzimuth / 22.5) % 16;
    const optimalTilt = Math.max(12, Math.min(28, Math.round(Math.abs(latitude) * 0.95)));
    const azimuthDeviation = Math.abs(slopeAzimuth - 180);
    const solarEfficiency = Math.max(
      76,
      Math.min(99.6, parseFloat((100 - (azimuthDeviation / 90) * 8.0).toFixed(1)))
    );

    return {
      pitchAngleDeg: optimalTilt,
      pitchRatio: '4:12 (Standard)',
      azimuthDeg: Math.round(slopeAzimuth),
      cardinalDirection: directions[dirIndex],
      solarEfficiencyPercent: solarEfficiency,
      aspectRatio: 1.5,
      ridgeLengthM: parseFloat(len.toFixed(1)),
      eaveLengthM: parseFloat((len * 0.7).toFixed(1)),
      ridgeAngleDeg: Math.round(angle),
      deviationFromSouthDeg: Math.round(azimuthDeviation),
    };
  }

  let longestEdgeM = 0;
  let secondLongestM = 0;
  let longestEdgeAngleDeg = 90;

  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const dLat = (pts[j][0] - pts[i][0]) * metersPerDegLat;
    const dLon = (pts[j][1] - pts[i][1]) * metersPerDegLon;
    const len = Math.sqrt(dLat * dLat + dLon * dLon);

    if (len > longestEdgeM) {
      secondLongestM = longestEdgeM;
      longestEdgeM = len;
      let angle = Math.atan2(dLon, dLat) * (180 / Math.PI);
      if (angle < 0) angle += 360;
      longestEdgeAngleDeg = angle;
    } else if (len > secondLongestM) {
      secondLongestM = len;
    }
  }

  // The roof facet slopes perpendicular to the longest edge (ridge)
  let slopeAzimuth = (longestEdgeAngleDeg + 90) % 360;
  // Face towards the southern solar arc in the northern hemisphere:
  if (slopeAzimuth < 90 || slopeAzimuth > 270) {
    slopeAzimuth = (slopeAzimuth + 180) % 360;
  }

  const dirIndex = Math.round(slopeAzimuth / 22.5) % 16;
  const cardinalDirection = directions[dirIndex];

  const aspectRatio =
    secondLongestM > 0 ? parseFloat((longestEdgeM / secondLongestM).toFixed(2)) : 1.35;

  // Estimate pitch angle based on geometry:
  let estimatedPitch = 18;
  if (aspectRatio < 1.2) {
    estimatedPitch = 8; // Low pitch / RCC terrace
  } else if (aspectRatio >= 1.2 && aspectRatio <= 2.2) {
    estimatedPitch = 18; // Standard 4:12 residential pitch
  } else {
    estimatedPitch = 26; // Steeper gable plane
  }

  const pitchRatio =
    estimatedPitch <= 10
      ? '2:12 (Low Slope)'
      : estimatedPitch <= 22
      ? '4:12 (Standard)'
      : '7:12 (Steep)';

  // Solar efficiency potential relative to optimal tilt and south azimuth
  const optimalTilt = Math.max(12, Math.min(28, Math.round(Math.abs(latitude) * 0.95)));
  const tiltDeviation = Math.abs(estimatedPitch - optimalTilt);
  const azimuthDeviation = Math.abs(slopeAzimuth - 180);

  const tiltPenalty = tiltDeviation * 0.35;
  const azimuthPenalty = (azimuthDeviation / 90) * 8.0;
  const solarEfficiencyPercent = Math.max(
    76,
    Math.min(99.6, parseFloat((100 - tiltPenalty - azimuthPenalty).toFixed(1)))
  );

  return {
    pitchAngleDeg: estimatedPitch,
    pitchRatio,
    azimuthDeg: Math.round(slopeAzimuth),
    cardinalDirection,
    solarEfficiencyPercent,
    aspectRatio,
    ridgeLengthM: parseFloat(longestEdgeM.toFixed(1)),
    eaveLengthM: parseFloat((secondLongestM || longestEdgeM * 0.7).toFixed(1)),
    ridgeAngleDeg: Math.round(longestEdgeAngleDeg),
    deviationFromSouthDeg: Math.round(azimuthDeviation),
  };
}

export const RoofCalculationModal: React.FC<RoofCalculationModalProps> = ({
  isOpen,
  onClose,
  initialAreaM2,
  latitude,
  longitude,
  locationName,
  initialPanelWattage,
  onConfirmArea,
  onUpdateLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Layers for Point-by-Point Custom Polygon Tracing & Physical PV Modules
  const polylineLayerRef = useRef<L.Polyline | null>(null);
  const polygonLayerRef = useRef<L.Polygon | null>(null);
  const pointMarkersRef = useRef<L.Marker[]>([]);
  const pitchOverlayMarkerRef = useRef<L.Marker | null>(null);
  const panelsLayerRef = useRef<L.LayerGroup | null>(null);
  const arrayRectLayerRef = useRef<L.LayerGroup | null>(null);
  const draftRectLayerRef = useRef<L.LayerGroup | null>(null);

  // Interactive Overlay Tool: Trace Building Footprint Polygon OR Draw Panel Array Rectangles
  const [overlayTool, setOverlayTool] = useState<'trace_roof' | 'draw_array'>('trace_roof');
  const [arraySegments, setArraySegments] = useState<DrawnArraySegmentRect[]>([]);
  const [rectStartLatLon, setRectStartLatLon] = useState<[number, number] | null>(null);
  const [hoverLatLon, setHoverLatLon] = useState<[number, number] | null>(null);
  const [showSpacingHud, setShowSpacingHud] = useState<boolean>(false);

  // Custom polygon points [lat, lon][]
  const [customPoints, setCustomPoints] = useState<[number, number][]>([]);
  const [isShapeClosed, setIsShapeClosed] = useState<boolean>(false);

  // Measured Area in Square Meters (calculated once shape is closed)
  const [calculatedAreaM2, setCalculatedAreaM2] = useState<number>(0);
  const [perimeterMeters, setPerimeterMeters] = useState<number>(0);

  // Geometry-based Rooftop Pitch & Solar Analysis
  const [geometryAnalysis, setGeometryAnalysis] = useState<RoofGeometryAnalysis | null>(null);

  // User adjustable pitch angle (defaults to geometry-estimated pitch)
  const [selectedPitchAngle, setSelectedPitchAngle] = useState<number>(18);

  // User adjustable orientation azimuth (from interactive compass dial drag or presets)
  const [manualAzimuth, setManualAzimuth] = useState<number | null>(null);

  // High-Resolution Tile Provider: Default to Google Hybrid (High Res Satellite with crisp street clarity)
  const [selectedProvider, setSelectedProvider] = useState<MapTileProvider>('google-hybrid');

  // Center Coordinates
  const [currentCenter, setCurrentCenter] = useState<[number, number]>([
    latitude && !isNaN(latitude) ? latitude : 17.41,
    longitude && !isNaN(longitude) ? longitude : 78.44,
  ]);

  const [activeAddressName, setActiveAddressName] = useState<string>(
    locationName || 'Current Rooftop Location'
  );

  // Address Search State
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ display_name: string; latitude: number; longitude: number }>
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  // Selected Solar Panel Model from official database (550W benchmark default)
  const [catalogPanelWattage, setCatalogPanelWattage] = useState<number>(initialPanelWattage || 550);

  // Engineering Layout & Clearances State
  const [roofLayoutConfig, setRoofLayoutConfig] = useState<RoofLayoutConfig>(DEFAULT_ROOF_LAYOUT_CONFIG);
  const [isEngineeringModalOpen, setIsEngineeringModalOpen] = useState<boolean>(false);
  const [showPanelsOnMap, setShowPanelsOnMap] = useState<boolean>(true);
  const [dxfPreviewRequest, setDxfPreviewRequest] = useState<DxfPreviewRequest | null>(null);

  // GPS & Toast notification refs
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const hasAutoDetectedRef = useRef(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onUpdateLocationRef = useRef(onUpdateLocation);
  onUpdateLocationRef.current = onUpdateLocation;

  // Mutable refs to prevent map re-creations during clicks
  const handleMapClickRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});
  const handleMapMouseMoveRef = useRef<(e: L.LeafletMouseEvent) => void>(() => {});

  const showToast = useCallback((msg: string, duration = 3000) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(msg);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, duration);
  }, []);

  /**
   * Real Live Location Detection via High-Accuracy GPS
   */
  const handleDetectLiveLocation = useCallback(async () => {
    if (isDetectingGps) return;
    setIsDetectingGps(true);
    showToast('🛰️ Auto-detecting your live location...', 3500);

    try {
      const res = await detectExactLocation();

      if (res && res.latitude && res.longitude) {
        const { latitude: lat, longitude: lon, cityName } = res;
        showToast(`📍 Found: ${cityName || 'Your Building'}`, 3000);

        setCurrentCenter([lat, lon]);
        if (cityName) setActiveAddressName(cityName);

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lon], 20, { duration: 1.2 });
        }

        onUpdateLocationRef.current?.(lat, lon, cityName);
      }
    } catch (err) {
      console.warn('GPS detection failed:', err);
      showToast('⚠️ GPS unavailable. Use search icon 🔍 or tap your roof.', 3000);
    } finally {
      setIsDetectingGps(false);
    }
  }, [isDetectingGps, showToast]);

  // Clean-up and auto-detect on modal open
  useEffect(() => {
    if (isOpen) {
      if (!hasAutoDetectedRef.current) {
        hasAutoDetectedRef.current = true;
        setCustomPoints([]);
        setIsShapeClosed(false);
        setCalculatedAreaM2(0);
        setGeometryAnalysis(null);

        const lat = latitude && !isNaN(latitude) ? latitude : 17.41;
        const lon = longitude && !isNaN(longitude) ? longitude : 78.44;
        setCurrentCenter([lat, lon]);
        if (locationName) setActiveAddressName(locationName);

        const timer = setTimeout(() => {
          handleDetectLiveLocation();
        }, 300);
        return () => clearTimeout(timer);
      }
    } else {
      hasAutoDetectedRef.current = false;
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
      setToastMessage(null);
    }
  }, [isOpen, latitude, longitude, locationName, handleDetectLiveLocation]);

  /**
   * Clear all drawn points and reset map overlays
   */
  const handleClearShape = useCallback(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }
    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }
    pointMarkersRef.current.forEach((m) => {
      try {
        map.removeLayer(m);
      } catch {}
    });
    pointMarkersRef.current = [];

    if (pitchOverlayMarkerRef.current) {
      try {
        map.removeLayer(pitchOverlayMarkerRef.current);
        pitchOverlayMarkerRef.current = null;
      } catch {}
    }

    if (panelsLayerRef.current) {
      try {
        map.removeLayer(panelsLayerRef.current);
        panelsLayerRef.current = null;
      } catch {}
    }

    if (arrayRectLayerRef.current) {
      arrayRectLayerRef.current.clearLayers();
    }
    if (draftRectLayerRef.current) {
      draftRectLayerRef.current.clearLayers();
    }

    setCustomPoints([]);
    setIsShapeClosed(false);
    setCalculatedAreaM2(0);
    setPerimeterMeters(0);
    setGeometryAnalysis(null);
    setArraySegments([]);
    setRectStartLatLon(null);
    setHoverLatLon(null);
    setOverlayTool('trace_roof');
    showToast('Shape cleared. Tap starting point on your rooftop.');
  }, [showToast]);

  /**
   * Close the shape and calculate exact square footage & meterage and pitch overlay
   */
  const handleCloseShape = useCallback(() => {
    if (customPoints.length < 3 || !mapInstanceRef.current) {
      showToast('Please place at least 3 corner points to close a shape.', 2500);
      return;
    }

    const map = mapInstanceRef.current;

    // Remove temporary tracing polyline
    if (polylineLayerRef.current) {
      map.removeLayer(polylineLayerRef.current);
      polylineLayerRef.current = null;
    }

    // Remove old polygon if exists
    if (polygonLayerRef.current) {
      map.removeLayer(polygonLayerRef.current);
      polygonLayerRef.current = null;
    }

    // Create completed closed polygon with high-visibility solar orange styling
    const polygon = L.polygon(customPoints, {
      color: '#FFFFFF',
      weight: 3,
      fillColor: '#FF6F00',
      fillOpacity: 0.55,
      interactive: true,
    }).addTo(map);
    polygonLayerRef.current = polygon;

    // Compute exact square meters & perimeter
    const area = computePolygonAreaM2(customPoints);
    const perimeter = computePolygonPerimeterMeters(customPoints);
    setCalculatedAreaM2(area);
    setPerimeterMeters(perimeter);
    setIsShapeClosed(true);

    // Analyze geometry for pitch estimation and solar efficiency
    const analysis = analyzeRoofGeometry(customPoints, currentCenter[0]);
    setGeometryAnalysis(analysis);
    setSelectedPitchAngle(analysis.pitchAngleDeg);

    // Create Pitch & Solar Efficiency Overlay Badge on the polygon centroid
    const centroid = computePolygonCentroid(customPoints);

    if (pitchOverlayMarkerRef.current) {
      try {
        map.removeLayer(pitchOverlayMarkerRef.current);
      } catch {}
    }

    const pitchBadgeIcon = L.divIcon({
      className: 'custom-pitch-overlay-badge',
      html: `
        <div style="
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          pointer-events: none;
          transform: translate(-50%, -50%);
        ">
          <!-- Solar Pitch & Azimuth Arrow -->
          <div style="
            display: flex;
            align-items: center;
            gap: 4px;
            background: rgba(15, 23, 42, 0.92);
            border: 1.5px solid #F59E0B;
            border-radius: 20px;
            padding: 4px 10px;
            box-shadow: 0 4px 14px rgba(0,0,0,0.6);
            backdrop-filter: blur(4px);
            white-space: nowrap;
          ">
            <span style="color: #FBBF24; font-size: 13px;">☀️</span>
            <span style="color: #FFFFFF; font-size: 11px; font-weight: 800; font-family: monospace;">
              ${analysis.pitchAngleDeg}° Pitch
            </span>
            <span style="color: #10B981; font-size: 11px; font-weight: 800;">
              • ${analysis.solarEfficiencyPercent}% Yield
            </span>
          </div>

          <!-- Slope direction arrow -->
          <div style="
            margin-top: 2px;
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            transform: rotate(${analysis.azimuthDeg}deg);
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.8));
          ">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"></line>
              <polyline points="5 12 12 5 19 12"></polyline>
            </svg>
          </div>
        </div>
      `,
      iconSize: [0, 0],
      iconAnchor: [0, 0],
    });

    const pitchMarker = L.marker(centroid, {
      icon: pitchBadgeIcon,
      interactive: false,
    }).addTo(map);
    pitchOverlayMarkerRef.current = pitchMarker;

    const sqFt = Math.round(area * 10.7639);
    showToast(
      `🏁 Closed! ${area} m² (${sqFt} sq ft) • Estimated Pitch: ${analysis.pitchAngleDeg}° (${analysis.solarEfficiencyPercent}% solar efficiency)`,
      4000
    );
  }, [customPoints, currentCenter, showToast]);

  /**
   * Recalculate area and redraw after dragging any corner handle
   */
  const updatePointsAfterDrag = useCallback(() => {
    const updatedPts = pointMarkersRef.current.map((m) => {
      const ll = m.getLatLng();
      return [ll.lat, ll.lng] as [number, number];
    });

    setCustomPoints(updatedPts);

    if (polygonLayerRef.current) {
      polygonLayerRef.current.setLatLngs(updatedPts);
      const newArea = computePolygonAreaM2(updatedPts);
      const newPerimeter = computePolygonPerimeterMeters(updatedPts);
      setCalculatedAreaM2(newArea);
      setPerimeterMeters(newPerimeter);

      const analysis = analyzeRoofGeometry(updatedPts, currentCenter[0]);
      setGeometryAnalysis(analysis);

      if (pitchOverlayMarkerRef.current) {
        const centroid = computePolygonCentroid(updatedPts);
        pitchOverlayMarkerRef.current.setLatLng(centroid);
      }
    } else if (polylineLayerRef.current) {
      polylineLayerRef.current.setLatLngs(updatedPts);
    }
  }, [currentCenter]);

  /**
   * Remove the last added dot/vertex
   */
  const handleUndoLastPoint = useCallback(() => {
    if (isShapeClosed) {
      handleClearShape();
      return;
    }
    if (customPoints.length === 0) return;

    const newPts = customPoints.slice(0, -1);
    setCustomPoints(newPts);

    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    const lastMarker = pointMarkersRef.current.pop();
    if (lastMarker) {
      try {
        map.removeLayer(lastMarker);
      } catch {}
    }

    if (polylineLayerRef.current) {
      if (newPts.length > 0) {
        polylineLayerRef.current.setLatLngs(newPts);
      } else {
        map.removeLayer(polylineLayerRef.current);
        polylineLayerRef.current = null;
      }
    }

    showToast(`Removed dot. ${newPts.length} points remaining.`);
  }, [customPoints, handleClearShape, isShapeClosed, showToast]);

  /**
   * Handle Map Click to place a point or close polygon
   */
  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (!mapInstanceRef.current) return;
      const map = mapInstanceRef.current;

      const clickedLat = e.latlng.lat;
      const clickedLon = e.latlng.lng;

      // Mode 2: Interactive Panel Array Rectangle Drawing Overlay
      if (overlayTool === 'draw_array') {
        if (!rectStartLatLon) {
          setRectStartLatLon([clickedLat, clickedLon]);
          setHoverLatLon([clickedLat, clickedLon]);
          showToast('Array corner A locked. Move & tap opposite corner B to fit 550W panels.', 2500);
          return;
        }
        const origin =
          customPoints.length >= 3 ? computePolygonCentroid(customPoints) : currentCenter;
        const activeAz = liveGeometry?.azimuthDeg ?? manualAzimuth ?? 180;
        const testSeg = latLonRectToSegmentENU(
          origin[0],
          origin[1],
          rectStartLatLon,
          [clickedLat, clickedLon],
          activeAz
        );
        if (testSeg.widthM < 1.0 && testSeg.depthM < 1.0) {
          showToast('Rectangle too small — tap two wider corners for the array segment.', 2200);
          return;
        }
        const nextIdx = arraySegments.length + 1;
        setArraySegments((prev) => [
          ...prev,
          {
            id: `arr-seg-${Date.now()}`,
            name: `Segment ${nextIdx}`,
            cornerA: rectStartLatLon,
            cornerB: [clickedLat, clickedLon],
            azimuthDeg: activeAz,
          },
        ]);
        setRectStartLatLon(null);
        setHoverLatLon(null);
        showToast(`Added Array Segment ${nextIdx} (${testSeg.widthM}×${testSeg.depthM}m). Tap again to add another or Switch to Edit.`, 2800);
        return;
      }

      if (isShapeClosed) {
        showToast('Roof boundary enclosed. Drag dots to adjust or switch to Draw Array Rect.', 2500);
        return;
      }

      // Check auto-close on tapping near starting point (#1)
      if (customPoints.length >= 3) {
        const startPt = customPoints[0];
        const metersPerDegLat = 111132.954;
        const metersPerDegLon = 111412.84 * Math.cos((startPt[0] * Math.PI) / 180);
        const dLat = (clickedLat - startPt[0]) * metersPerDegLat;
        const dLon = (clickedLon - startPt[1]) * metersPerDegLon;
        const distToStartMeters = Math.sqrt(dLat * dLat + dLon * dLon);

        if (distToStartMeters < 3.8) {
          handleCloseShape();
          return;
        }
      }

      // Add new point
      const newPts = [...customPoints, [clickedLat, clickedLon] as [number, number]];
      setCustomPoints(newPts);

      const pointIndex = newPts.length;

      // High-Visibility Numbered Vertex Dot Icon
      const createVertexIcon = (num: number, isStart = false) =>
        L.divIcon({
          className: 'custom-vertex-handle',
          html: `
            <div style="
              width: 34px;
              height: 34px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: grab;
              touch-action: none;
            ">
              <div style="
                width: ${isStart ? '24px' : '20px'};
                height: ${isStart ? '24px' : '20px'};
                border-radius: 50%;
                background: ${isStart ? '#10B981' : '#FF6F00'};
                border: 2.8px solid #FFFFFF;
                box-shadow: 0 3px 10px rgba(0,0,0,0.7), 0 0 0 2px ${isStart ? '#10B981' : '#FF6F00'};
                display: flex;
                align-items: center;
                justify-content: center;
                color: #FFFFFF;
                font-size: 11px;
                font-weight: 900;
                font-family: ui-sans-serif, system-ui, sans-serif;
              ">
                ${num}
              </div>
            </div>
          `,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });

      const marker = L.marker([clickedLat, clickedLon], {
        draggable: true,
        icon: createVertexIcon(pointIndex, pointIndex === 1),
        zIndexOffset: 1000,
      }).addTo(map);

      // Clicking on start point (#1) when points >= 3 closes the shape!
      if (pointIndex === 1) {
        marker.on('click', () => {
          if (customPoints.length >= 2 && !isShapeClosed) {
            handleCloseShape();
          }
        });
      }

      marker.on('dragstart', () => {
        map.dragging.disable();
      });

      marker.on('drag', () => {
        updatePointsAfterDrag();
      });

      marker.on('dragend', () => {
        map.dragging.enable();
        updatePointsAfterDrag();
      });

      pointMarkersRef.current.push(marker);

      // Update or create connecting polyline
      if (!polylineLayerRef.current) {
        const polyline = L.polyline(newPts, {
          color: '#00F0FF',
          weight: 3.5,
          dashArray: '6 6',
          interactive: false,
        }).addTo(map);
        polylineLayerRef.current = polyline;
      } else {
        polylineLayerRef.current.setLatLngs(newPts);
      }

      // Visual tap confirmation ripple
      const ripple = L.circleMarker([clickedLat, clickedLon], {
        radius: 14,
        color: '#10B981',
        fillColor: '#10B981',
        fillOpacity: 0.5,
        weight: 2,
        interactive: false,
      }).addTo(map);

      setTimeout(() => {
        try {
          map.removeLayer(ripple);
        } catch {}
      }, 700);

      if (pointIndex === 1) {
        showToast('Dot 1 placed. Now tap the next corner of your roof.');
      } else if (pointIndex === 2) {
        showToast('Dot 2 placed. Tap the 3rd corner.');
      } else {
        showToast(`Dot ${pointIndex} placed. Tap more corners or tap "Close Shape".`);
      }
    },
    [
      arraySegments.length,
      currentCenter,
      customPoints,
      handleCloseShape,
      isShapeClosed,
      manualAzimuth,
      overlayTool,
      rectStartLatLon,
      showToast,
      updatePointsAfterDrag,
      geometryAnalysis,
    ]
  );

  // Keep refs up to date
  handleMapClickRef.current = handleMapClick;
  handleMapMouseMoveRef.current = (e: L.LeafletMouseEvent) => {
    if (overlayTool === 'draw_array' && rectStartLatLon) {
      setHoverLatLon([e.latlng.lat, e.latlng.lng]);
    }
  };

  /**
   * Switch Satellite / Street Map Layer
   */
  const handleChangeTileProvider = (providerId: MapTileProvider) => {
    setSelectedProvider(providerId);

    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const cfg = TILE_PROVIDERS.find((p) => p.id === providerId) || TILE_PROVIDERS[0];
    const newLayer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      subdomains: cfg.subdomains || 'abc',
    }).addTo(map);

    tileLayerRef.current = newLayer;
    showToast(`Imagery: ${cfg.shortName}`);
  };

  // Setup Leaflet map on modal open (ONLY ONCE per modal lifecycle!)
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const initialLat = currentCenter[0];
    const initialLon = currentCenter[1];

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLon],
      zoom: 19,
      maxZoom: 22,
      minZoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    mapInstanceRef.current = map;

    // Tile Layer: Google Hybrid Satellite (High Res) by default
    const cfg = TILE_PROVIDERS.find((p) => p.id === selectedProvider) || TILE_PROVIDERS[0];
    const tileLayer = L.tileLayer(cfg.url, {
      maxZoom: cfg.maxZoom,
      maxNativeZoom: cfg.maxNativeZoom,
      subdomains: cfg.subdomains || 'abc',
    }).addTo(map);
    tileLayerRef.current = tileLayer;

    // Dedicated interactive array rectangle & draft rubber-band layers
    const arrayLayer = L.layerGroup().addTo(map);
    arrayRectLayerRef.current = arrayLayer;
    const draftLayer = L.layerGroup().addTo(map);
    draftRectLayerRef.current = draftLayer;

    // Map Click & Move Listeners delegating to stable refs (NEVER triggers map recreation!)
    map.on('click', (ev) => {
      handleMapClickRef.current(ev);
    });
    map.on('mousemove', (ev) => {
      handleMapMouseMoveRef.current(ev);
    });

    const timer = setTimeout(() => {
      map.invalidateSize();
      map.setView([initialLat, initialLon], 19);
    }, 150);

    return () => {
      clearTimeout(timer);
      try {
        map.stop();
        map.off();
        map.remove();
      } catch {
        // Ignore teardown error if container already detached
      }
      mapInstanceRef.current = null;
      polylineLayerRef.current = null;
      polygonLayerRef.current = null;
      pointMarkersRef.current = [];
      pitchOverlayMarkerRef.current = null;
      arrayRectLayerRef.current = null;
      draftRectLayerRef.current = null;
    };
  }, [isOpen]); // NEVER put handleMapClick here!

  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  const handleRecenter = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo(currentCenter, 20, { duration: 0.8 });
      showToast('Centered on location');
    }
  };

  /**
   * Search an address or place
   */
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchAddressOrPlace(searchQuery);
      setSearchResults(results);
      if (results.length === 0) {
        showToast('No locations found. Try entering colony name or PIN code.');
      }
    } catch {
      showToast('Search error. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (res: { display_name: string; latitude: number; longitude: number }) => {
    setCurrentCenter([res.latitude, res.longitude]);
    setActiveAddressName(res.display_name.split(',').slice(0, 3).join(', '));
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);

    if (mapInstanceRef.current) {
      mapInstanceRef.current.flyTo([res.latitude, res.longitude], 20, { duration: 1.2 });
    }

    onUpdateLocationRef.current?.(res.latitude, res.longitude, res.display_name);
    showToast(`📍 Moved to: ${res.display_name.split(',')[0]}. Tap roof corners to trace.`);
  };

  // True 3D surface area considering slope angle:
  const pitchRad = (selectedPitchAngle * Math.PI) / 180;
  const slopeDivisor = Math.cos(pitchRad);
  const trueSurfaceAreaM2 = parseFloat((calculatedAreaM2 / (slopeDivisor || 1)).toFixed(1));
  const areaSqFt = Math.round(trueSurfaceAreaM2 * 10.7639);

  // Panel capacity based on selected model from official catalog
  const modalPanelSpec = getPanelSpecification(catalogPanelWattage);
  const rawFitPanels = Math.floor(trueSurfaceAreaM2 / modalPanelSpec.areaSqm);

  // Engineering Layout computation taking into account:
  // - Gap between panels: 0–500 mm
  // - Gap between panel rows: separately configurable (0–2000 mm)
  // - Fabrication clearance at structure edges
  // - Walkway width & frequency
  // - Roof boundary clearance
  // - Obstacle clearance & obstacles
  // - Automatic portrait/landscape solver
  const engineeringLayout = useMemo(() => {
    return solveRooftopLayout(trueSurfaceAreaM2, catalogPanelWattage, roofLayoutConfig);
  }, [trueSurfaceAreaM2, catalogPanelWattage, roofLayoutConfig]);

  // Live geometry analysis for dynamic solar compass & pitch orientation
  const liveGeometry = useMemo(() => {
    let base = geometryAnalysis;
    if (!base && customPoints.length >= 2) {
      base = analyzeRoofGeometry(customPoints, currentCenter[0]);
    }
    if (manualAzimuth !== null) {
      const az = ((manualAzimuth % 360) + 360) % 360;
      const directions = [
        'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
        'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
      ];
      const dirIndex = Math.round(az / 22.5) % 16;
      let dev = Math.abs(az - 180);
      if (dev > 180) dev = 360 - dev;
      const penalty = (dev / 90) * 8.0;
      const eff = Math.max(72, Math.min(99.6, parseFloat((100 - penalty).toFixed(1))));

      return {
        pitchAngleDeg: base?.pitchAngleDeg ?? selectedPitchAngle,
        pitchRatio: base?.pitchRatio ?? '4:12 (Standard)',
        azimuthDeg: Math.round(az),
        cardinalDirection: directions[dirIndex],
        solarEfficiencyPercent: eff,
        aspectRatio: base?.aspectRatio ?? 1.35,
        ridgeLengthM: base?.ridgeLengthM ?? 6.0,
        eaveLengthM: base?.eaveLengthM ?? 4.2,
        ridgeAngleDeg: (az + 90) % 360,
        deviationFromSouthDeg: Math.round(dev),
      };
    }
    return base;
  }, [geometryAnalysis, customPoints, currentCenter, manualAzimuth, selectedPitchAngle]);

  // Render physical solar PV module layout directly on the Leaflet satellite map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (panelsLayerRef.current) {
      try {
        map.removeLayer(panelsLayerRef.current);
      } catch {}
      panelsLayerRef.current = null;
    }

    if (!isShapeClosed || !showPanelsOnMap || customPoints.length < 3 || calculatedAreaM2 <= 0) {
      return;
    }

    const panelGroup = L.layerGroup();
    const centroid = computePolygonCentroid(customPoints);
    const cLat = centroid[0];
    const cLon = centroid[1];

    const metersPerDegLat = 111132.954;
    const metersPerDegLon = 111412.84 * Math.cos((cLat * Math.PI) / 180);

    const positions = engineeringLayout.panelPositions;
    if (positions.length === 0) return;

    let maxXMm = 0;
    let maxYMm = 0;
    positions.forEach((p) => {
      if (p.xMm + p.widthMm > maxXMm) maxXMm = p.xMm + p.widthMm;
      if (p.yMm + p.lengthMm > maxYMm) maxYMm = p.yMm + p.lengthMm;
    });

    const halfSpanXM = (maxXMm / 2) / 1000;
    const halfSpanYM = (maxYMm / 2) / 1000;

    // Rotate panel orientation to match compass facing azimuth
    const activeAzimuth = liveGeometry?.azimuthDeg ?? manualAzimuth ?? 180;
    const rotRad = ((activeAzimuth - 180) * Math.PI) / 180;
    const cosRot = Math.cos(rotRad);
    const sinRot = Math.sin(rotRad);

    positions.forEach((p) => {
      const pCenterX = -halfSpanXM + (p.xMm + p.widthMm / 2) / 1000;
      const pCenterY = halfSpanYM - (p.yMm + p.lengthMm / 2) / 1000;

      // Rotate center point around centroid
      const rotCenterX = pCenterX * cosRot - pCenterY * sinRot;
      const rotCenterY = pCenterX * sinRot + pCenterY * cosRot;

      const halfWM = (p.widthMm / 2) / 1000;
      const halfLM = (p.lengthMm / 2) / 1000;

      const pLat = cLat + rotCenterY / metersPerDegLat;
      const pLon = cLon + rotCenterX / metersPerDegLon;

      // 4 corners of rectangle rotated
      const cornerDeltas: [number, number][] = [
        [-halfWM, -halfLM],
        [-halfWM, halfLM],
        [halfWM, halfLM],
        [halfWM, -halfLM],
      ];

      const corners: [number, number][] = cornerDeltas.map(([dx, dy]) => {
        const rdx = dx * cosRot - dy * sinRot;
        const rdy = dx * sinRot + dy * cosRot;
        return [pLat + rdy / metersPerDegLat, pLon + rdx / metersPerDegLon];
      });

      const rect = L.polygon(corners, {
        color: '#93C5FD',
        weight: 1.2,
        fillColor: '#1E40AF',
        fillOpacity: 0.85,
        interactive: false,
      });

      panelGroup.addLayer(rect);
    });

    panelGroup.addTo(map);
    panelsLayerRef.current = panelGroup;

    return () => {
      if (map && panelGroup) {
        try {
          map.removeLayer(panelGroup);
        } catch {}
      }
    };
  }, [
    arraySegments.length,
    isShapeClosed,
    showPanelsOnMap,
    customPoints,
    calculatedAreaM2,
    engineeringLayout,
    liveGeometry?.azimuthDeg,
    manualAzimuth,
  ]);

  // Compute ENU roof boundary + packed 550W panels inside all user-drawn Array Segment Rectangles
  const originCenter = useMemo<[number, number]>(
    () => (customPoints.length >= 3 ? computePolygonCentroid(customPoints) : currentCenter),
    [customPoints, currentCenter]
  );

  const roofBoundaryENU = useMemo(() => {
    if (customPoints.length < 3) return [];
    return customPoints.map(([lt, ln]) => latLonToLocalMeters(originCenter[0], originCenter[1], lt, ln));
  }, [customPoints, originCenter]);

  const spacingSpec = useMemo<PanelSpacingSpec>(
    () => ({
      panelWattage: catalogPanelWattage || 550,
      interPanelGapMm: roofLayoutConfig.interPanelGapMm,
      interRowGapMm: roofLayoutConfig.interRowGapMm,
      edgeClearanceMm: roofLayoutConfig.fabricationEdgeClearanceMm,
      orientation: roofLayoutConfig.orientation,
      azimuthDeg: liveGeometry?.azimuthDeg ?? manualAzimuth ?? 180,
    }),
    [catalogPanelWattage, liveGeometry?.azimuthDeg, manualAzimuth, roofLayoutConfig]
  );

  const drawnSegmentsAnalysis = useMemo(() => {
    const boundarySetbackM = (roofLayoutConfig.roofBoundaryClearanceMm || 0) / 1000;
    return arraySegments.map((seg) => {
      const segENU = latLonRectToSegmentENU(
        originCenter[0],
        originCenter[1],
        seg.cornerA,
        seg.cornerB,
        seg.azimuthDeg ?? spacingSpec.azimuthDeg
      );
      const segSpacing: PanelSpacingSpec = {
        ...spacingSpec,
        azimuthDeg: seg.azimuthDeg ?? spacingSpec.azimuthDeg,
      };
      const packing = packPanelsInSegmentENU(
        segENU,
        segSpacing,
        roofBoundaryENU.length >= 3 ? roofBoundaryENU : undefined,
        boundarySetbackM
      );
      const geo = segmentAndPanelsToLatLon(originCenter[0], originCenter[1], segENU, packing);
      return {
        seg,
        segENU,
        packing,
        ...geo,
      };
    });
  }, [
    arraySegments,
    originCenter,
    roofBoundaryENU,
    roofLayoutConfig.roofBoundaryClearanceMm,
    spacingSpec,
  ]);

  const drawnTotalPanels = useMemo(
    () => drawnSegmentsAnalysis.reduce((s, item) => s + item.packing.fittedPanelsCount, 0),
    [drawnSegmentsAnalysis]
  );

  const drawnTotalKw = useMemo(
    () => Number(((drawnTotalPanels * (catalogPanelWattage || 550)) / 1000).toFixed(2)),
    [drawnTotalPanels, catalogPanelWattage]
  );

  const activeTotalPanels =
    arraySegments.length > 0 ? drawnTotalPanels : isShapeClosed ? engineeringLayout.panelsCount : 0;
  const activeTotalKw =
    arraySegments.length > 0 ? drawnTotalKw : isShapeClosed ? engineeringLayout.systemKw : 0;

  // Render Drawn Panel Array Rectangles + Fitted 550W PV Modules + Live Rubber-Band Draft on Map
  useEffect(() => {
    const group = arrayRectLayerRef.current;
    const draftGroup = draftRectLayerRef.current;
    const map = mapInstanceRef.current;
    if (!group || !draftGroup || !map) return;

    group.clearLayers();
    draftGroup.clearLayers();

    map.getContainer().style.cursor = overlayTool === 'draw_array' ? 'crosshair' : '';

    // Hide default whole-roof fill panels when user has explicitly drawn custom array segments
    if (panelsLayerRef.current && arraySegments.length > 0) {
      try {
        map.removeLayer(panelsLayerRef.current);
      } catch {}
    }

    // Draw roof boundary setback line when enclosed
    if (isShapeClosed && roofBoundaryENU.length >= 3) {
      const setbackM = Math.max(0.1, (roofLayoutConfig.roofBoundaryClearanceMm || 500) / 1000);
      const insetPoly = computeInsetPolygonENU(roofBoundaryENU, setbackM);
      if (insetPoly.length >= 3) {
        const insetLL = insetPoly.map((p) => {
          const latLon = segmentAndPanelsToLatLon(
            originCenter[0],
            originCenter[1],
            { centerX: p.x, centerY: p.y, widthM: 0.5, depthM: 0.5 },
            packPanelsInSegmentENU({ centerX: 0, centerY: 0, widthM: 0.5, depthM: 0.5 })
          );
          return latLon.segmentCornersLatLon[0];
        });
        // Direct lat/lon conversion for crisp setback outline
        const metersPerDegLat = 111132.954;
        const metersPerDegLon = 111412.84 * Math.cos((originCenter[0] * Math.PI) / 180);
        const sbLL: [number, number][] = insetPoly.map((p) => [
          originCenter[0] + p.y / metersPerDegLat,
          originCenter[1] + p.x / metersPerDegLon,
        ]);
        void insetLL;
        L.polygon(sbLL, {
          color: '#fde047',
          weight: 1.5,
          dashArray: '5 4',
          fill: false,
          interactive: false,
        }).addTo(group);
      }
    }

    // Render every user-drawn Array Rectangle Segment & its fitted 550W panels
    drawnSegmentsAnalysis.forEach((item, idx) => {
      L.polygon(item.segmentCornersLatLon, {
        color: '#22d3ee',
        weight: 2.2,
        dashArray: '6 4',
        fillColor: '#0891b2',
        fillOpacity: 0.14,
        interactive: false,
      }).addTo(group);

      if (showPanelsOnMap) {
        item.panelPolygonsLatLon.forEach((corners) => {
          L.polygon(corners, {
            color: '#93c5fd',
            weight: 1,
            fillColor: '#1d4ed8',
            fillOpacity: 0.86,
            interactive: false,
          }).addTo(group);
        });
      }

      const metersPerDegLat = 111132.954;
      const metersPerDegLon = 111412.84 * Math.cos((originCenter[0] * Math.PI) / 180);
      const labelLL: [number, number] = [
        originCenter[0] + item.segENU.centerY / metersPerDegLat,
        originCenter[1] + item.segENU.centerX / metersPerDegLon,
      ];
      const badgeIcon = L.divIcon({
        className: '',
        html: `<div style="padding:2px 7px;border-radius:6px;background:rgba(15,23,42,0.92);color:#e0f2fe;font-size:10px;font-weight:800;font-family:monospace;border:1.5px solid #22d3ee;white-space:nowrap;transform:translate(-50%,-50%);box-shadow:0 2px 6px rgba(0,0,0,0.65);">S${
          idx + 1
        }: ${item.packing.fittedPanelsCount}×${catalogPanelWattage}W (${item.packing.totalKw}kW)</div>`,
        iconSize: [0, 0],
      });
      L.marker(labelLL, { icon: badgeIcon, interactive: false }).addTo(group);
    });

    // Live rubber-band rectangle while drawing Corner B
    if (overlayTool === 'draw_array' && rectStartLatLon && hoverLatLon) {
      const boundarySetbackM = (roofLayoutConfig.roofBoundaryClearanceMm || 0) / 1000;
      const previewSeg = latLonRectToSegmentENU(
        originCenter[0],
        originCenter[1],
        rectStartLatLon,
        hoverLatLon,
        spacingSpec.azimuthDeg
      );
      const previewPack = packPanelsInSegmentENU(
        previewSeg,
        spacingSpec,
        roofBoundaryENU.length >= 3 ? roofBoundaryENU : undefined,
        boundarySetbackM
      );
      const previewGeo = segmentAndPanelsToLatLon(
        originCenter[0],
        originCenter[1],
        previewSeg,
        previewPack
      );

      L.polygon(previewGeo.segmentCornersLatLon, {
        color: '#34d399',
        weight: 2.4,
        dashArray: '5 4',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        interactive: false,
      }).addTo(draftGroup);

      previewGeo.panelPolygonsLatLon.forEach((corners) => {
        L.polygon(corners, {
          color: '#a7f3d0',
          weight: 0.9,
          fillColor: '#047857',
          fillOpacity: 0.72,
          interactive: false,
        }).addTo(draftGroup);
      });

      const midLL: [number, number] = [
        (rectStartLatLon[0] + hoverLatLon[0]) / 2,
        (rectStartLatLon[1] + hoverLatLon[1]) / 2,
      ];
      const liveIcon = L.divIcon({
        className: '',
        html: `<div style="padding:3px 8px;border-radius:8px;background:rgba(6,78,59,0.95);color:#ecfdf5;font-size:10.5px;font-weight:800;font-family:monospace;border:1.5px solid #34d399;white-space:nowrap;transform:translate(-50%,-120%);">${previewSeg.widthM}×${previewSeg.depthM}m · ${previewPack.fittedPanelsCount}×${catalogPanelWattage}W</div>`,
        iconSize: [0, 0],
      });
      L.marker(midLL, { icon: liveIcon, interactive: false }).addTo(draftGroup);
    }
  }, [
    arraySegments.length,
    catalogPanelWattage,
    drawnSegmentsAnalysis,
    hoverLatLon,
    isShapeClosed,
    originCenter,
    overlayTool,
    rectStartLatLon,
    roofBoundaryENU,
    roofLayoutConfig.roofBoundaryClearanceMm,
    showPanelsOnMap,
    spacingSpec,
  ]);

  const handleExportDxf = useCallback(() => {
    if (customPoints.length < 3 && arraySegments.length === 0) {
      showToast('Trace a roof boundary or draw an array rectangle first.', 2400);
      return;
    }

    let footprintENU = roofBoundaryENU;
    if (footprintENU.length < 3 && drawnSegmentsAnalysis.length > 0) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      drawnSegmentsAnalysis.forEach((d) => {
        minX = Math.min(minX, d.segENU.centerX - d.segENU.widthM / 2);
        maxX = Math.max(maxX, d.segENU.centerX + d.segENU.widthM / 2);
        minY = Math.min(minY, d.segENU.centerY - d.segENU.depthM / 2);
        maxY = Math.max(maxY, d.segENU.centerY + d.segENU.depthM / 2);
      });
      footprintENU = [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY },
      ];
    }

    const setbackM = Math.max(0.2, (roofLayoutConfig.roofBoundaryClearanceMm || 500) / 1000);
    const setbackENU =
      footprintENU.length >= 3 ? computeInsetPolygonENU(footprintENU, setbackM) : undefined;
    const roofAreaM2 =
      footprintENU.length >= 3 ? computePolygonMetricsENU(footprintENU).areaSqM : trueSurfaceAreaM2;

    const dxfArraySegments = drawnSegmentsAnalysis.map((d) => {
      const rotRad = (((d.segENU.azimuthDeg ?? 180) - 180) * Math.PI) / 180;
      const ux = Math.cos(rotRad);
      const uy = -Math.sin(rotRad);
      const vx = Math.sin(rotRad);
      const vy = Math.cos(rotRad);
      const hw = d.segENU.widthM / 2;
      const hd = d.segENU.depthM / 2;
      return {
        name: d.seg.name,
        widthM: d.segENU.widthM,
        depthM: d.segENU.depthM,
        centerX: d.segENU.centerX,
        centerY: d.segENU.centerY,
        azimuthDeg: d.segENU.azimuthDeg ?? spacingSpec.azimuthDeg,
        panelWattage: catalogPanelWattage || 550,
        panelCount: d.packing.fittedPanelsCount,
        orientation: d.packing.chosenOrientation,
        segmentCornersENU: [
          { x: d.segENU.centerX - hw * ux - hd * vx, y: d.segENU.centerY - hw * uy - hd * vy },
          { x: d.segENU.centerX + hw * ux - hd * vx, y: d.segENU.centerY + hw * uy - hd * vy },
          { x: d.segENU.centerX + hw * ux + hd * vx, y: d.segENU.centerY + hw * uy + hd * vy },
          { x: d.segENU.centerX - hw * ux + hd * vx, y: d.segENU.centerY - hw * uy + hd * vy },
        ],
        panelsCornersENU: d.packing.panels.map((p) => p.cornersENU),
      };
    });

    // Fallback: if no custom rectangles drawn, pack the enclosed roof bounding box into DXF modules
    if (dxfArraySegments.length === 0 && footprintENU.length >= 3) {
      const m = computePolygonMetricsENU(footprintENU);
      const autoSeg = {
        centerX: m.cx,
        centerY: m.cy,
        widthM: m.widthM,
        depthM: m.depthM,
        azimuthDeg: spacingSpec.azimuthDeg,
      };
      const autoPack = packPanelsInSegmentENU(autoSeg, spacingSpec, footprintENU, setbackM);
      dxfArraySegments.push({
        name: 'Auto Roof Array',
        widthM: m.widthM,
        depthM: m.depthM,
        centerX: m.cx,
        centerY: m.cy,
        azimuthDeg: spacingSpec.azimuthDeg,
        panelWattage: catalogPanelWattage || 550,
        panelCount: autoPack.fittedPanelsCount,
        orientation: autoPack.chosenOrientation,
        segmentCornersENU: footprintENU,
        panelsCornersENU: autoPack.panels.map((p) => p.cornersENU),
      });
    }

    const payload: StandardizedDxfPayload = {
      siteName: activeAddressName || 'Solar Rooftop',
      latitude: originCenter[0],
      longitude: originCenter[1],
      perimeterSetbackM: setbackM,
      buildingFootprintENU: footprintENU,
      roofBoundaries: [
        {
          name: 'ROOF BOUNDARY',
          boundaryENU: footprintENU,
          setbackENU,
          areaSqM: roofAreaM2,
        },
      ],
      arraySegments: dxfArraySegments,
      spacingNotes: `Panel ${catalogPanelWattage}W | Gap ${spacingSpec.interPanelGapMm}mm | RowGap ${spacingSpec.interRowGapMm}mm | Edge ${spacingSpec.edgeClearanceMm}mm`,
    };

    const totalDxfPanels = dxfArraySegments.reduce((sum, s) => sum + s.panelCount, 0);
    const usableAreaSqM =
      setbackENU && setbackENU.length >= 3
        ? computePolygonMetricsENU(setbackENU).areaSqM
        : Number((roofAreaM2 * 0.85).toFixed(1));
    const footprintMetrics =
      footprintENU.length >= 3
        ? computePolygonMetricsENU(footprintENU)
        : { widthM: 10, depthM: 8 };
    const annual = runAnnualShadingSimulation({
      latitude: originCenter[0],
      longitude: originCenter[1],
      elevationM: 300,
      timezoneOffsetHours: Math.round((originCenter[1] / 15) * 2) / 2,
      albedo: 0.2,
      tiltDeg: selectedPitchAngle || 15,
      azimuthCompassDeg: spacingSpec.azimuthDeg,
      collectorWidthM: 2.28,
      rowPitchM: 4.2,
      numRows: Math.max(1, dxfArraySegments.length || 3),
      arrayWidthM: Math.max(4, footprintMetrics.widthM),
      stringTopology: 'halfcut_portrait',
      horizonProfile: HORIZON_PRESETS.flat.profile,
      obstacles: [],
      roofPolygonENU: footprintENU,
      perimeterSetbackM: setbackM,
    });
    const yieldSummary = computeLayoutYieldSummary(
      totalDxfPanels,
      catalogPanelWattage || 550,
      annual,
      roofAreaM2,
      usableAreaSqM,
      dxfArraySegments.length,
      dxfArraySegments[0]?.orientation || 'portrait'
    );

    setDxfPreviewRequest({
      fileNameBase: `${activeAddressName || 'solar_roof'}_footprint_cad`,
      payload,
      yieldSummary,
    });
  }, [
    activeAddressName,
    arraySegments.length,
    catalogPanelWattage,
    customPoints.length,
    drawnSegmentsAnalysis,
    originCenter,
    roofBoundaryENU,
    roofLayoutConfig.roofBoundaryClearanceMm,
    selectedPitchAngle,
    showToast,
    spacingSpec,
    trueSurfaceAreaM2,
  ]);

  const handleDone = () => {
    if (calculatedAreaM2 <= 0 && activeTotalPanels <= 0) {
      showToast('Please trace your rooftop area or draw an array rectangle first.', 2500);
      return;
    }
    const fallbackArea =
      calculatedAreaM2 > 0
        ? trueSurfaceAreaM2
        : Number(
            drawnSegmentsAnalysis
              .reduce((s, d) => s + d.packing.segmentAreaSqM, 0)
              .toFixed(1)
          );
    onConfirmArea(fallbackArea, activeTotalPanels, activeTotalKw);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900 animate-fade-in text-white select-none">
      {/* 1. Header Bar: Clear title, live area metrics, search and layer switches */}
      <div className="bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between z-30 shrink-0">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 hover:text-white transition cursor-pointer"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-white tracking-tight">Rooftop Area</span>
              {isShapeClosed ? (
                <div className="flex items-center gap-1">
                  <span className="text-amber-400 font-mono font-extrabold text-sm">
                    {trueSurfaceAreaM2} m²
                  </span>
                  <span className="text-[11px] text-sky-300 font-mono">
                    ({areaSqFt} sq ft)
                  </span>
                </div>
              ) : (
                <span className="text-[10.5px] font-medium text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30">
                  {customPoints.length === 0
                    ? 'Tap roof corners'
                    : `${customPoints.length} points placed`}
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 truncate max-w-[190px]">
              {activeAddressName}
            </span>
          </div>
        </div>

        {/* Right Header Controls: Search + Layer Toggle */}
        <div className="flex items-center gap-1.5">
          {/* Address Search Toggle */}
          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition cursor-pointer ${
              isSearchOpen
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            title="Search Address or Colony"
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Quick Satellite vs Street toggle */}
          <button
            onClick={() =>
              handleChangeTileProvider(
                selectedProvider === 'google-hybrid'
                  ? 'esri-satellite'
                  : selectedProvider === 'esri-satellite'
                  ? 'google-satellite'
                  : selectedProvider === 'google-satellite'
                  ? 'osm-street'
                  : 'google-hybrid'
              )
            }
            className="px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 text-xs text-sky-300 font-semibold flex items-center gap-1 border border-slate-700 cursor-pointer"
            title="Toggle Map High-Res Satellite Imagery"
          >
            <Layers className="w-3 h-3 text-sky-400" />
            <span className="text-[11px]">
              {TILE_PROVIDERS.find((p) => p.id === selectedProvider)?.shortName || 'Satellite'}
            </span>
          </button>
        </div>
      </div>

      {/* Address Search Overlay Box */}
      {isSearchOpen && (
        <div className="bg-slate-900/95 backdrop-blur-md px-3.5 py-2.5 border-b border-slate-800 z-30 space-y-2 animate-fade-in shrink-0">
          <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search colony, street, house or PIN (e.g. Banjara Hills, Hyderabad)"
                autoFocus
                className="w-full px-3 py-1.5 pl-8 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-400"
              />
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition cursor-pointer disabled:opacity-50"
            >
              {isSearching ? 'Finding...' : 'Go'}
            </button>
          </form>

          {searchResults.length > 0 && (
            <div className="bg-slate-950 rounded-xl border border-slate-800 max-h-48 overflow-y-auto divide-y divide-slate-850">
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  onClick={() => handleSelectSearchResult(res)}
                  className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition flex flex-col cursor-pointer"
                >
                  <span className="font-semibold text-white truncate">{res.display_name.split(',')[0]}</span>
                  <span className="text-[10px] text-slate-400 truncate">{res.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Floating Status Notification Toast */}
      {toastMessage && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-40 max-w-[88%] pointer-events-none">
          <div className="px-3.5 py-1.5 rounded-full text-xs font-semibold shadow-xl backdrop-blur-md bg-slate-900/90 text-amber-300 border border-amber-500/40 flex items-center gap-2 animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0"></span>
            <span className="truncate">{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 2. Full-Bleed Map Canvas with High-Resolution Satellite View */}
      <div className="flex-1 relative w-full h-full overflow-hidden bg-slate-950">
        <div ref={mapContainerRef} className="w-full h-full z-10 cursor-crosshair" />

        {/* Floating Dynamic Solar Compass Overlay (top-left) */}
        <div className="absolute top-3 left-3 z-20">
          <FloatingSolarCompass
            azimuthDeg={liveGeometry?.azimuthDeg ?? manualAzimuth ?? 180}
            cardinalDirection={liveGeometry?.cardinalDirection ?? 'S'}
            ridgeAngleDeg={liveGeometry?.ridgeAngleDeg ?? 90}
            deviationFromSouthDeg={liveGeometry?.deviationFromSouthDeg ?? 0}
            solarEfficiencyPercent={liveGeometry?.solarEfficiencyPercent ?? 96}
            isShapeDefined={Boolean(liveGeometry && customPoints.length >= 2)}
            pointsCount={customPoints.length}
            latitude={currentCenter[0]}
            longitude={currentCenter[1]}
            onAzimuthChange={(az) => setManualAzimuth(az)}
          />
        </div>

        {/* Dynamic Instructional Banner (centered between compass and right controls) */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 max-w-[60%] md:max-w-[70%] flex flex-col items-center gap-1.5">
          {/* Interactive Map Overlay Mode Bar */}
          <div className="bg-slate-950/92 backdrop-blur-md p-1 rounded-xl border border-slate-700/80 shadow-lg flex items-center gap-1 text-[10.5px] font-bold">
            <button
              type="button"
              onClick={() => {
                setOverlayTool('trace_roof');
                setRectStartLatLon(null);
                setHoverLatLon(null);
              }}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap cursor-pointer transition ${
                overlayTool === 'trace_roof'
                  ? 'bg-[#FF6F00] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Footprints className="w-3 h-3" />
              <span>Trace Roof</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setOverlayTool('draw_array');
                setRectStartLatLon(null);
                setHoverLatLon(null);
                showToast('Tap Corner A & Corner B on map to place a 550W panel array rectangle.', 2600);
              }}
              className={`px-2.5 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap cursor-pointer transition ${
                overlayTool === 'draw_array'
                  ? 'bg-cyan-600 text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Square className="w-3 h-3" />
              <span>Draw 550W Rect</span>
            </button>

            <button
              type="button"
              onClick={() => setShowSpacingHud((v) => !v)}
              className={`px-2 py-1 rounded-lg flex items-center gap-1 whitespace-nowrap cursor-pointer transition ${
                showSpacingHud
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Configure panel gap, row gap & edge spacing"
            >
              <Sliders className="w-3 h-3" />
              <span>Spacing</span>
            </button>

            {(customPoints.length >= 3 || arraySegments.length > 0) && (
              <button
                type="button"
                onClick={handleExportDxf}
                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 whitespace-nowrap cursor-pointer transition"
                title="Download building footprint, roof boundary & 550W panels as .DXF"
              >
                <Download className="w-3 h-3" />
                <span>.DXF</span>
              </button>
            )}
          </div>

          <div className="bg-slate-900/90 backdrop-blur-sm px-3 py-1 rounded-full text-[10px] text-slate-200 border border-slate-700/70 shadow-md pointer-events-none truncate max-w-full">
            {overlayTool === 'draw_array'
              ? rectStartLatLon
                ? 'Move & click opposite corner B to fit 550W panels'
                : 'Click corner A on roof to draw an array rectangle'
              : !isShapeClosed
              ? customPoints.length === 0
                ? 'Tap each corner of roof to trace building footprint'
                : customPoints.length < 3
                ? `Placed point ${customPoints.length}. Tap next corner...`
                : `Placed ${customPoints.length} points. Tap start (#1) or "Close Shape"`
              : 'Roof enclosed · Drag dots or switch to Draw 550W Rect'}
          </div>
        </div>

        {/* Inline Spacing & 550W Array Packing Overlay HUD */}
        {showSpacingHud && (
          <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:w-[400px] z-30 bg-slate-950/95 backdrop-blur-md border border-slate-700 rounded-2xl p-3 shadow-2xl space-y-2.5 text-[11px]">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">
                {catalogPanelWattage}W Panel &amp; Spacing Spec
              </span>
              <span className="font-mono tabular-nums text-[10px] text-slate-400">
                {modalPanelSpec.dimensionsMm}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[9.5px] text-slate-400 mb-0.5">Panel Gap (mm)</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={5}
                  value={roofLayoutConfig.interPanelGapMm}
                  onChange={(e) =>
                    setRoofLayoutConfig((prev) => ({
                      ...prev,
                      interPanelGapMm: Math.max(0, Math.min(500, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono tabular-nums font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-slate-400 mb-0.5">Row Gap (mm)</label>
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={50}
                  value={roofLayoutConfig.interRowGapMm}
                  onChange={(e) =>
                    setRoofLayoutConfig((prev) => ({
                      ...prev,
                      interRowGapMm: Math.max(0, Math.min(2000, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono tabular-nums font-bold text-white"
                />
              </div>
              <div>
                <label className="block text-[9.5px] text-slate-400 mb-0.5">Setback (mm)</label>
                <input
                  type="number"
                  min={0}
                  max={1500}
                  step={50}
                  value={roofLayoutConfig.roofBoundaryClearanceMm}
                  onChange={(e) =>
                    setRoofLayoutConfig((prev) => ({
                      ...prev,
                      roofBoundaryClearanceMm: Math.max(0, Math.min(1500, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-full px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono tabular-nums font-bold text-white"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
                {(['auto', 'portrait', 'landscape'] as const).map((ori) => (
                  <button
                    key={ori}
                    type="button"
                    onClick={() =>
                      setRoofLayoutConfig((prev) => ({ ...prev, orientation: ori }))
                    }
                    className={`px-2 py-1 rounded-md font-bold capitalize cursor-pointer ${
                      roofLayoutConfig.orientation === ori
                        ? 'bg-cyan-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {ori}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowSpacingHud(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-[10px] cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        )}

        {/* Floating Side Action Buttons on Right */}
        <div className="absolute top-3 right-3 z-20 flex flex-col gap-2">
          {/* Live GPS Detection Button */}
          <button
            onClick={handleDetectLiveLocation}
            disabled={isDetectingGps}
            className={`w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 shadow-md border flex items-center justify-center transition cursor-pointer ${
              isDetectingGps
                ? 'border-amber-400 text-amber-400 animate-pulse'
                : 'border-slate-700 hover:border-emerald-400 text-emerald-400'
            }`}
            title="Auto-Detect Live Location"
          >
            <Navigation className={`w-4 h-4 ${isDetectingGps ? 'animate-spin' : ''}`} />
          </button>

          {/* Recenter on Rooftop */}
          <button
            onClick={handleRecenter}
            className="w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-sky-400 shadow-md border border-slate-700 flex items-center justify-center transition cursor-pointer"
            title="Recenter Map"
          >
            <Crosshair className="w-4 h-4" />
          </button>

          {/* Zoom In/Out */}
          <div className="flex flex-col bg-slate-900/90 rounded-xl border border-slate-700 overflow-hidden shadow-md">
            <button
              onClick={handleZoomIn}
              className="w-9 h-8 hover:bg-slate-800 flex items-center justify-center text-slate-200 transition cursor-pointer"
              title="Zoom In (High-Res)"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <div className="h-[1px] bg-slate-800 w-full" />
            <button
              onClick={handleZoomOut}
              className="w-9 h-8 hover:bg-slate-800 flex items-center justify-center text-slate-200 transition cursor-pointer"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Floating Tracing Actions during drawing */}
        {!isShapeClosed && customPoints.length > 0 && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
            <button
              onClick={handleUndoLastPoint}
              className="px-3 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-slate-200 border border-slate-700 shadow-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Undo last placed dot"
            >
              <Undo2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Undo Dot</span>
            </button>

            {customPoints.length >= 3 && (
              <button
                onClick={handleCloseShape}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 animate-bounce-once"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Close Shape ({customPoints.length} Dots)</span>
              </button>
            )}

            <button
              onClick={handleClearShape}
              className="px-2.5 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-red-400 border border-slate-700 shadow-lg text-xs font-semibold flex items-center gap-1 cursor-pointer active:scale-95"
              title="Clear shape"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3. Bottom Action Bar: Segments / Roof Area Summary + 550W Fit + DXF Export */}
      <div className="bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-4 py-3 z-30 shrink-0 space-y-2.5">
        {!isShapeClosed && arraySegments.length === 0 ? (
          /* Tracing state: guide the user through dot-by-dot placement or array rect */
          <div className="flex items-center justify-between text-xs py-1 gap-2">
            <div className="text-slate-300">
              {overlayTool === 'draw_array' ? (
                <span>Tap Corner A &amp; Corner B on map to draw a 550W array segment</span>
              ) : customPoints.length === 0 ? (
                <span>Tap starting corner on satellite map (or switch to Draw 550W Rect)</span>
              ) : customPoints.length < 3 ? (
                <span>
                  Placed <strong>{customPoints.length}</strong> dots. Need at least 3 to close boundary.
                </span>
              ) : (
                <span className="text-emerald-400 font-semibold">
                  {customPoints.length} corners placed! Tap &ldquo;Close Shape&rdquo; or corner #1.
                </span>
              )}
            </div>

            {customPoints.length >= 3 && overlayTool === 'trace_roof' && (
              <button
                onClick={handleCloseShape}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition cursor-pointer shrink-0"
              >
                Close &amp; Calculate
              </button>
            )}
          </div>
        ) : (
          /* Closed Roof Boundary OR Drawn Array Segments State */
          <div className="space-y-2.5">
            {/* Drawn Array Segments Summary Strip */}
            {drawnSegmentsAnalysis.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                {drawnSegmentsAnalysis.map((item, idx) => (
                  <div
                    key={item.seg.id}
                    className="shrink-0 flex items-center gap-2 px-2.5 py-1 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-[10.5px] font-mono tabular-nums"
                  >
                    <span className="font-bold text-cyan-300">S{idx + 1}</span>
                    <span className="text-slate-300">
                      {item.segENU.widthM}×{item.segENU.depthM}m
                    </span>
                    <span className="text-emerald-300 font-bold">
                      {item.packing.fittedPanelsCount}×{catalogPanelWattage}W ({item.packing.chosenOrientation.slice(0, 4)})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setArraySegments((prev) => prev.filter((s) => s.id !== item.seg.id))
                      }
                      className="text-rose-400 hover:text-rose-300 cursor-pointer"
                      title="Remove array segment"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Calculation Metrics & 550W Fit Banner */}
            <div className="bg-slate-950/80 p-2.5 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  {isShapeClosed ? 'Enclosed Rooftop Area' : 'Drawn Array Coverage'}
                </div>
                <div className="flex items-baseline gap-2 mt-0.5 font-mono tabular-nums">
                  <span className="text-amber-400 font-extrabold text-base">
                    {isShapeClosed
                      ? `${trueSurfaceAreaM2} m²`
                      : `${Number(
                          drawnSegmentsAnalysis
                            .reduce((s, d) => s + d.packing.segmentAreaSqM, 0)
                            .toFixed(1)
                        )} m²`}
                  </span>
                  {isShapeClosed && (
                    <span className="text-sky-400 font-bold text-xs">({areaSqFt} sq ft)</span>
                  )}
                </div>
                <div className="text-[9.5px] text-slate-400 font-mono tabular-nums mt-0.5">
                  Gap {roofLayoutConfig.interPanelGapMm}mm · Row {roofLayoutConfig.interRowGapMm}mm · Setback {roofLayoutConfig.roofBoundaryClearanceMm}mm
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-300 space-y-0.5 ml-auto">
                <div className="text-emerald-400 font-semibold font-mono tabular-nums flex items-center justify-end gap-1.5">
                  <span>
                    Fits {activeTotalPanels} × {catalogPanelWattage}W ({activeTotalKw} kW)
                  </span>
                  <span className="text-[9.5px] text-cyan-300 uppercase">
                    {arraySegments.length > 0
                      ? `${arraySegments.length} Seg`
                      : engineeringLayout.orientation}
                  </span>
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-0.5">
                  <span className="text-[10px] text-slate-400">Panel:</span>
                  <select
                    value={catalogPanelWattage}
                    onChange={(e) => setCatalogPanelWattage(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 text-amber-400 text-[10.5px] font-bold rounded-lg px-2 py-0.5 cursor-pointer focus:outline-none"
                  >
                    {SOLAR_PANEL_CATALOG.map((p) => (
                      <option key={p.wattage} value={p.wattage}>
                        {p.wattage}W ({p.dimensionsMm} · {p.areaSqm} m²)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center justify-end gap-1.5 pt-1">
                  <button
                    onClick={() => setIsEngineeringModalOpen(true)}
                    className="text-[10px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 cursor-pointer bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/30"
                    title="Configure panel gap, row pitch, walkways & setbacks"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>Clearances</span>
                  </button>
                  <button
                    onClick={() => setShowPanelsOnMap(!showPanelsOnMap)}
                    className={`text-[10px] font-bold flex items-center gap-1 cursor-pointer px-2 py-0.5 rounded-md border ${
                      showPanelsOnMap
                        ? 'bg-sky-500/20 text-sky-300 border-sky-500/40'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}
                  >
                    <LayoutGrid className="w-3 h-3" />
                    <span>{showPanelsOnMap ? 'Grid On' : 'Grid Off'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Geometry-Estimated Rooftop Pitch & Solar Panel Efficiency Indicator */}
            {geometryAnalysis && (
              <div className="bg-gradient-to-r from-amber-950/40 to-slate-900 p-2.5 rounded-2xl border border-amber-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sun className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-amber-300">
                      Rooftop Pitch &amp; Solar Yield
                    </span>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums font-bold text-emerald-400">
                    {geometryAnalysis.solarEfficiencyPercent}% Solar Yield
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-[10.5px]">
                  <div className="bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[9.5px]">Pitch</span>
                    <span className="font-bold text-white font-mono tabular-nums">
                      {selectedPitchAngle}°
                    </span>
                  </div>

                  <div className="bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[9.5px]">Azimuth</span>
                    <span className="font-bold text-sky-300 font-mono tabular-nums">
                      {liveGeometry?.azimuthDeg ?? geometryAnalysis.azimuthDeg}°{' '}
                      {liveGeometry?.cardinalDirection ?? geometryAnalysis.cardinalDirection}
                    </span>
                  </div>

                  <div className="bg-slate-900/90 p-1.5 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[9.5px]">DC Capacity</span>
                    <span className="font-bold text-emerald-400 font-mono tabular-nums">
                      {activeTotalKw} kWp
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10.5px] text-slate-400">Pitch:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { label: 'Flat 0°', angle: 0 },
                      { label: 'Low 10°', angle: 10 },
                      { label: 'Opt 18°', angle: 18 },
                      { label: 'Steep 30°', angle: 30 },
                    ].map((p) => (
                      <button
                        key={p.angle}
                        onClick={() => setSelectedPitchAngle(p.angle)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                          selectedPitchAngle === p.angle
                            ? 'bg-amber-500 text-slate-950 font-bold'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons: Redraw, Standardized DXF Export & Apply Area */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleClearShape}
                className="px-3 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer flex items-center gap-1 shrink-0"
                title="Clear shape & array rectangles"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>

              <button
                onClick={handleExportDxf}
                className="px-3.5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shrink-0"
                title="Export Building Footprint, Roof Boundaries & 550W Panels to Standardized .DXF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export DXF</span>
              </button>

              <button
                onClick={handleDone}
                className="flex-1 py-3 rounded-2xl bg-[#FF6F00] hover:bg-[#F57C00] active:scale-[0.99] text-white font-bold text-sm shadow-lg transition duration-150 cursor-pointer flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4 stroke-[3]" />
                <span>
                  Apply {activeTotalPanels} Panels ({activeTotalKw} kW)
                </span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Engineering Rooftop Clearances & Setback Settings Modal */}
      <EngineeringLayoutSettingsModal
        isOpen={isEngineeringModalOpen}
        onClose={() => setIsEngineeringModalOpen(false)}
        roofAreaM2={trueSurfaceAreaM2}
        panelWattage={catalogPanelWattage}
        config={roofLayoutConfig}
        onUpdateConfig={(cfg) => setRoofLayoutConfig(cfg)}
        onApplyLayout={(res) => {
          showToast(`Applied ${res.panelsCount} panels (${res.systemKw} kW) in ${res.orientation} layout!`);
        }}
      />

      <DxfExportSummaryModal
        request={dxfPreviewRequest}
        onClose={() => setDxfPreviewRequest(null)}
        onDownloaded={(fileName) =>
          showToast(`Exported ${fileName} (footprint, setbacks & 550W panels)`, 3200)
        }
      />
    </div>
  );
};
