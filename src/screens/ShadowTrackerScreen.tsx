import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Clock,
  Building,
  Plus,
  Trash2,
  Layers,
  Grid,
  Navigation,
  ChevronDown,
  ChevronUp,
  Camera,
  Upload,
  Box,
  Cpu,
  ClipboardCheck,
  MapPin,
  PenTool,
  Wrench,
  Video,
  Check,
  ArrowRight,
} from 'lucide-react';
import {
  ScreenId,
  ShadowCalculationInputs,
  WeatherCondition,
} from '../types/solar';
import {
  AssemblyLayerMode,
  CompletedSurveyRecord,
  InstallerWorkflowStage,
  MmsStructureDesignConfig,
  MmsStructureStyle,
  PotentialPvZone,
  RealMapGroundOverlay,
  RealMapSource,
  RoofStructureType,
  SiteMeasurements,
  SiteMediaAsset,
  SiteVerificationStatus,
  UploadedDrawingOverlay,
} from '../types/siteSurvey';
import { calculateShadowGeometry } from '../utils/solarMath';
import {
  HORIZON_PRESETS,
  NearObstacle,
  STRING_TOPOLOGY_INFO,
  SiteSimulationConfig,
  StringTopology,
  computeAnnualSunPaths,
  computePolygonMetricsENU,
  evaluateInstantaneousShading,
  getHostRoofFootprintENU,
  getObstacleCenterENU,
  latLonToLocalMeters,
  localMetersToLatLon,
  runAnnualShadingSimulation,
} from '../utils/shadingSimulationEngine';
import {
  clampZoneToRoofFootprint,
  generateRooftopZonesForFootprint,
} from '../utils/rooftopZoneClamper';
import {
  detectExactLocation,
  fetchLiveSolarWeather,
  reverseGeocode,
} from '../services/weatherService';
import {
  fetchSurroundingOsmBuildings,
  stitchSatelliteMapTexture,
} from '../services/realMapBuildingService';
import { MaterialTopBar } from '../components/MaterialTopBar';
import { ShadowCadEditor } from '../components/ShadowCadEditor';
import { SiteSurveyDrawingPanel } from '../components/SiteSurveyDrawingPanel';
import { RoofBoundaryPolygonView } from '../components/RoofBoundaryPolygonView';
import { PvSystEngineeringPanel } from '../components/PvSystEngineeringPanel';
import { SurveyInspectionReportPanel } from '../components/SurveyInspectionReportPanel';
import { RealMapVerificationPanel } from '../components/RealMapVerificationPanel';
import { useLanguage } from '../context/LanguageContext';
import { SunARScreen } from './SunARScreen';
import { SunCompassScreen } from './SunCompassScreen';
import { SunTimerScreen } from './SunTimerScreen';

export type SolarAnalysisSuiteTab =
  | 'solar_analysis'
  | 'shadow'
  | 'ar_view'
  | 'sun_compass'
  | 'sun_timer';

interface ShadowTrackerScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  initialSuiteTab?: SolarAnalysisSuiteTab;
}

const MONTH_OPTIONS = [
  { label: 'Jan', day: 17 },
  { label: 'Feb', day: 47 },
  { label: 'Mar (Equinox)', day: 80 },
  { label: 'Apr', day: 105 },
  { label: 'May', day: 135 },
  { label: 'Jun (Solstice)', day: 172 },
  { label: 'Jul', day: 198 },
  { label: 'Aug', day: 228 },
  { label: 'Sep (Equinox)', day: 265 },
  { label: 'Oct', day: 288 },
  { label: 'Nov', day: 318 },
  { label: 'Dec (Solstice)', day: 355 },
];

const INITIAL_OBSTACLES: NearObstacle[] = [
  {
    id: 'obs-building-w',
    name: 'West Neighbor Building',
    category: 'Building',
    heightM: 9.5,
    widthM: 8.0,
    depthM: 6.0,
    distanceM: 12.0,
    bearingDeg: 255,
  },
  {
    id: 'obs-tank-s',
    name: 'Rooftop Water Tank',
    category: 'Water Tank',
    heightM: 2.4,
    widthM: 1.8,
    depthM: 1.8,
    distanceM: 4.5,
    bearingDeg: 195,
  },
  {
    id: 'obs-parapet-s',
    name: 'South Parapet Wall',
    category: 'Parapet',
    heightM: 1.1,
    widthM: 10.0,
    depthM: 0.35,
    distanceM: 5.5,
    bearingDeg: 180,
  },
];

export const ShadowTrackerScreen: React.FC<ShadowTrackerScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  initialSuiteTab = 'shadow',
}) => {
  const { t } = useLanguage();
  const normalizeSuiteTab = (tab: SolarAnalysisSuiteTab): SolarAnalysisSuiteTab =>
    tab === 'solar_analysis' ? 'shadow' : tab;

  const [suiteTab, setSuiteTab] = useState<SolarAnalysisSuiteTab>(() =>
    normalizeSuiteTab(initialSuiteTab)
  );
  const [workflowStage, setWorkflowStage] =
    useState<InstallerWorkflowStage>('step1_media');
  const [step3CadSurface, setStep3CadSurface] = useState<'blueprint' | 'satellite'>('blueprint');
  const [step4RenderEngine, setStep4RenderEngine] = useState<'r3f_overlay' | 'isometric'>('r3f_overlay');
  const [step7SubTab, setStep7SubTab] = useState<'pvsyst' | 'report'>('pvsyst');

  useEffect(() => {
    setSuiteTab(normalizeSuiteTab(initialSuiteTab));
  }, [initialSuiteTab]);

  // Core Site & Array Configuration (seeded from live GPS coordinates)
  const defaultTz = useMemo(
    () => Math.round((weather.longitude || 78.44) / 15 * 2) / 2,
    [weather.longitude]
  );

  const [latStr, setLatStr] = useState<string>(() => (weather.latitude || 17.41).toFixed(4));
  const [lonStr, setLonStr] = useState<string>(() => (weather.longitude || 78.44).toFixed(4));
  const [elevStr, setElevStr] = useState<string>('520');
  const [tzStr, setTzStr] = useState<string>(() => String(defaultTz || 5.5));
  const [siteLocationName, setSiteLocationName] = useState<string>(
    () => weather.city || 'Site Location'
  );
  const [siteCloudCover, setSiteCloudCover] = useState<number>(
    () => weather.cloudCoverPercent ?? 18
  );
  const [isFetchingSiteData, setIsFetchingSiteData] = useState<boolean>(false);
  const [isDetectingGps, setIsDetectingGps] = useState<boolean>(false);
  const [albedo, setAlbedo] = useState<number>(0.20);
  const [tiltDeg, setTiltDeg] = useState<number>(() =>
    Math.max(5, Math.min(45, Math.round(Math.abs(weather.latitude || 17.41) * 0.9)))
  );
  const [azimuthCompassDeg, setAzimuthCompassDeg] = useState<number>(() =>
    (weather.latitude || 17.41) >= 0 ? 180 : 0
  );
  const [collectorWidthM, setCollectorWidthM] = useState<number>(2.28);
  const [rowPitchM, setRowPitchM] = useState<number>(4.2);
  const [numRows, setNumRows] = useState<number>(3);
  const [arrayWidthM, setArrayWidthM] = useState<number>(8.0);
  const [stringTopology, setStringTopology] = useState<StringTopology>('halfcut_portrait');
  const [horizonProfile, setHorizonProfile] = useState<number[]>(() => [...HORIZON_PRESETS.flat.profile]);
  const [obstacles, setObstacles] = useState<NearObstacle[]>(INITIAL_OBSTACLES);
  const [expandedObstacleId, setExpandedObstacleId] = useState<string | null>('obs-building-w');
  const [selectedCadObstacleId, setSelectedCadObstacleId] = useState<string | null>('obs-building-w');
  const [showTopologyPanel, setShowTopologyPanel] = useState<boolean>(false);
  const [showObjectsList, setShowObjectsList] = useState<boolean>(false);

  // Field Survey Drawings, 2D Photos, 360° Videos & Measurements
  const [mediaAssets, setMediaAssets] = useState<SiteMediaAsset[]>([]);
  const mediaAssetsRef = useRef<SiteMediaAsset[]>([]);
  mediaAssetsRef.current = mediaAssets;
  useEffect(() => {
    return () => {
      mediaAssetsRef.current.forEach((asset) => {
        if (asset.url.startsWith('blob:')) {
          URL.revokeObjectURL(asset.url);
        }
      });
    };
  }, []);
  const [activeDrawingId, setActiveDrawingId] = useState<string | null>(null);
  const [drawingOverlay, setDrawingOverlay] = useState<UploadedDrawingOverlay | null>(null);
  const [roofPolygonENU, setRoofPolygonENU] = useState<
    Array<{ x: number; y: number }> | undefined
  >(undefined);
  const [roofPolygonLatLon, setRoofPolygonLatLon] = useState<
    Array<[number, number]> | undefined
  >(undefined);
  const roofPolygonLatLonRef = useRef<Array<[number, number]> | undefined>(undefined);
  roofPolygonLatLonRef.current = roofPolygonLatLon;
  const [measurements, setMeasurements] = useState<SiteMeasurements>({
    roofLengthM: 16,
    roofWidthM: 14,
    parapetHeightM: 1.0,
    buildingHeightM: 5.4,
    roofStructureType: 'rcc_flat',
    walkwayWidthM: 0.75,
    walkwayEveryRows: 2,
    perimeterSetbackM: 0.6,
    mmsClearanceM: 0.35,
    moduleWp: 550,
    surveyorNotes: '',
  });
  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});
  const [surveyRecord, setSurveyRecord] = useState<CompletedSurveyRecord>(() => ({
    surveyId: `SRV-${Math.floor(100000 + Math.random() * 900000)}`,
    completedAtIso: new Date().toISOString(),
    inspectorName: '',
    projectTitle: weather.city || 'Solar Rooftop Survey',
    status: 'Draft',
    summaryRemarks: '',
  }));

  // Real Satellite Map Terrain, OSM Surrounding Buildings & Pre-3D Verification State
  const [realMapGround, setRealMapGround] = useState<RealMapGroundOverlay | null>(null);
  const [isFetchingMap, setIsFetchingMap] = useState<boolean>(false);
  const [isScanningBuildings, setIsScanningBuildings] = useState<boolean>(false);
  const [osmScanMessage, setOsmScanMessage] = useState<string | null>(null);
  const [verification, setVerification] = useState<SiteVerificationStatus>({
    mapImageVerified: false,
    buildingPhotosVerified: false,
    surroundingBuildingsVerified: false,
    osmBuildingsCount: 0,
    hostBuildingDetected: false,
  });

  // Lifted Solar PV Zones & Raised Galvanized MMS Steel Superstructure Config (Steps 3–6, Rooftop-Only)
  const [zones, setZones] = useState<PotentialPvZone[]>(() =>
    generateRooftopZonesForFootprint(
      [
        { x: -8, y: -7 },
        { x: 8, y: -7 },
        { x: 8, y: 7 },
        { x: -8, y: 7 },
      ],
      0.6,
      16,
      180,
      550,
      INITIAL_OBSTACLES
    )
  );

  const [mmsStructure, setMmsStructure] = useState<MmsStructureDesignConfig>({
    structureStyle: 'elevated_pergola',
    columnGridSpacingM: 3.2,
    includeCrossBracing: true,
    includeBrickPedestals: true,
    showZoneCountBadges: true,
    assemblyLayer: 'structure_and_panels',
  });

  const totalZonePanels = useMemo(
    () =>
      zones
        .filter((z) => z.enabled !== false)
        .reduce(
          (sum, z) =>
            sum +
            (z.panelCount ??
              Math.max(1, Math.floor(z.widthM / 1.15)) * Math.max(1, Math.floor(z.depthM / 2.25))),
          0
        ),
    [zones]
  );

  // Interactive Scene Time & Month Controls
  const [selectedDayOfYear, setSelectedDayOfYear] = useState<number>(355); // Dec Solstice worst-case default
  const [timeHourDec, setTimeHourDec] = useState<number>(() => {
    const now = new Date();
    const hr = now.getHours() + now.getMinutes() / 60;
    return hr >= 6 && hr <= 18 ? Number(hr.toFixed(1)) : 10.5;
  });

  // Parsed safe numeric coordinates
  const parsedLat = parseFloat(latStr);
  const siteLat = !isNaN(parsedLat) ? Math.max(-89, Math.min(89, parsedLat)) : weather.latitude || 17.41;
  const parsedLon = parseFloat(lonStr);
  const siteLon = !isNaN(parsedLon) ? Math.max(-180, Math.min(180, parsedLon)) : weather.longitude || 78.44;
  const parsedElev = parseFloat(elevStr);
  const siteElev = !isNaN(parsedElev) ? Math.max(0, Math.min(5500, parsedElev)) : 520;
  const parsedTz = parseFloat(tzStr);
  const siteTz = !isNaN(parsedTz) ? Math.max(-12, Math.min(14, parsedTz)) : 5.5;

  // Keep synced with global weather/location updates from WeatherModal / ChangeLocationModal
  useEffect(() => {
    if (weather.latitude && weather.longitude) {
      setLatStr(weather.latitude.toFixed(4));
      setLonStr(weather.longitude.toFixed(4));
    }
    if (weather.city) {
      setSiteLocationName(weather.city);
    }
    if (typeof weather.cloudCoverPercent === 'number') {
      setSiteCloudCover(weather.cloudCoverPercent);
    }
  }, [weather.latitude, weather.longitude, weather.city, weather.cloudCoverPercent]);

  // Combined live weather/site coordinates passed into embedded Solar Analysis tabs
  const syncedWeather: WeatherCondition = useMemo(
    () => ({
      ...weather,
      latitude: siteLat,
      longitude: siteLon,
      city: siteLocationName,
      cloudCoverPercent: siteCloudCover,
    }),
    [weather, siteLat, siteLon, siteLocationName, siteCloudCover]
  );

  const simConfig: SiteSimulationConfig = useMemo(
    () => ({
      latitude: siteLat,
      longitude: siteLon,
      elevationM: siteElev,
      timezoneOffsetHours: siteTz,
      albedo,
      tiltDeg,
      azimuthCompassDeg,
      collectorWidthM,
      rowPitchM,
      numRows,
      arrayWidthM,
      stringTopology,
      horizonProfile,
      obstacles,
      walkwayWidthM: measurements.walkwayWidthM,
      walkwayEveryRows: measurements.walkwayEveryRows,
      perimeterSetbackM: measurements.perimeterSetbackM,
      mmsClearanceM: measurements.mmsClearanceM,
      roofLengthM: measurements.roofLengthM,
      roofWidthM: measurements.roofWidthM,
      parapetHeightM: measurements.parapetHeightM,
      buildingHeightM: measurements.buildingHeightM,
      roofStructureType: measurements.roofStructureType,
      roofPolygonENU,
      roofPolygonLatLon,
    }),
    [
      siteLat,
      siteLon,
      siteElev,
      siteTz,
      albedo,
      tiltDeg,
      azimuthCompassDeg,
      collectorWidthM,
      rowPitchM,
      numRows,
      arrayWidthM,
      stringTopology,
      horizonProfile,
      obstacles,
      measurements,
      roofPolygonENU,
      roofPolygonLatLon,
    ]
  );

  // Run Instantaneous, Sun-Path, and Annual Simulations
  const instantState = useMemo(
    () =>
      evaluateInstantaneousShading(
        simConfig,
        selectedDayOfYear,
        timeHourDec,
        siteCloudCover
      ),
    [simConfig, selectedDayOfYear, timeHourDec, siteCloudCover]
  );

  const sunPaths = useMemo(
    () => computeAnnualSunPaths(siteLat, siteLon, siteTz),
    [siteLat, siteLon, siteTz]
  );

  const annualSummary = useMemo(
    () => runAnnualShadingSimulation(simConfig, siteCloudCover),
    [simConfig, siteCloudCover]
  );

  // Obstacle Setback Clearance State (Rooftop Setback Model)
  const [setbackInputs, setSetbackInputs] = useState<ShadowCalculationInputs>({
    locationName: weather.city,
    roofOrientation: 'South',
    latitude: siteLat,
    obstacleType: 'Water Tank',
    obstacleHeight: 2.4,
    obstacleDistance: 4.5,
    tiltAngle: tiltDeg,
    timeOfDayHour: 10,
    season: 'winter',
  });

  const setbackResults = useMemo(
    () =>
      calculateShadowGeometry({
        ...setbackInputs,
        latitude: siteLat,
        tiltAngle: tiltDeg,
      }),
    [setbackInputs, siteLat, tiltDeg]
  );

  // Formatted clock string
  const hrInt = Math.floor(timeHourDec);
  const minInt = Math.round((timeHourDec - hrInt) * 60) % 60;
  const ampm = hrInt >= 12 ? 'PM' : 'AM';
  const displayH = hrInt % 12 === 0 ? 12 : hrInt % 12;
  const timeFormatted = `${displayH.toString().padStart(2, '0')}:${minInt
    .toString()
    .padStart(2, '0')} ${ampm}`;

  const lastGeoOriginRef = useRef<{ lat: number; lon: number } | null>(null);

  // Sync rooftop-only PV zones cleanly whenever traced polygon, roof dimensions, tilt, azimuth or obstacles change
  useEffect(() => {
    const roofPoly = getHostRoofFootprintENU(simConfig);
    const setback = measurements.perimeterSetbackM ?? 0.6;
    const regenerated = generateRooftopZonesForFootprint(
      roofPoly,
      setback,
      tiltDeg,
      azimuthCompassDeg,
      measurements.moduleWp || 550,
      obstacles
    );

    setZones((prev) => {
      const customZones = prev
        .filter((z) => z.id.startsWith('pv-zone-custom-') || z.id.startsWith('pv-zone-cad-'))
        .map((z) => clampZoneToRoofFootprint(z, roofPoly, setback));

      const hasOnlyAutoOrEmpty = customZones.length === 0;
      const autoMapped = regenerated.map((rz) => {
        const existing = prev.find((p) => p.id === rz.id);
        return existing ? { ...rz, enabled: existing.enabled } : rz;
      });

      if (hasOnlyAutoOrEmpty) {
        return autoMapped;
      }
      // Keep user's custom CAD zones clamped inside the roof polygon alongside enabled auto bays if present
      const existingAuto = prev
        .filter((z) => z.zoneType === 'rooftop' && (z.id === 'pv-zone-south' || z.id === 'pv-zone-east' || z.id === 'pv-zone-west'))
        .map((z) => {
          const matched = autoMapped.find((m) => m.id === z.id);
          return matched || clampZoneToRoofFootprint(z, roofPoly, setback);
        });
      return [...existingAuto, ...customZones];
    });
  }, [
    roofPolygonENU,
    measurements.roofLengthM,
    measurements.roofWidthM,
    measurements.perimeterSetbackM,
    measurements.moduleWp,
    tiltDeg,
    azimuthCompassDeg,
    obstacles,
  ]);

  // Fetch real site elevation, timezone offset, cloud irradiance, OSM footprints & place name for exact coordinates
  const fetchExactLocationData = useCallback(
    async (lat: number, lon: number, resolvedName?: string) => {
      setLatStr(lat.toFixed(5));
      setLonStr(lon.toFixed(5));
      setIsFetchingSiteData(true);

      const prevOrigin = lastGeoOriginRef.current;
      const movedFar =
        prevOrigin !== null &&
        Math.hypot(
          (lat - prevOrigin.lat) * 111320,
          (lon - prevOrigin.lon) * 111320 * Math.cos((lat * Math.PI) / 180)
        ) > 25;
      lastGeoOriginRef.current = { lat, lon };

      if (movedFar) {
        setRoofPolygonENU(undefined);
        setRoofPolygonLatLon(undefined);
        setOsmScanMessage(null);
      } else {
        // Re-project existing roof boundary polygon ENU points around small origin adjustment
        const currentPolyLL = roofPolygonLatLonRef.current;
        if (currentPolyLL && currentPolyLL.length >= 3) {
          const reprojected = currentPolyLL.map(([lt, ln]) => {
            const p = latLonToLocalMeters(lat, lon, lt, ln);
            return { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) };
          });
          setRoofPolygonENU(reprojected);
        }
      }

      // Re-project any geo-pinned multi-node obstacles to keep exact real-world roof lock
      setObstacles((prev) =>
        prev.map((o) => {
          if (!o.nodesLatLon || o.nodesLatLon.length < 3) return o;
          const nextNodes = o.nodesLatLon.map(([lt, ln]) => {
            const p = latLonToLocalMeters(lat, lon, lt, ln);
            return { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) };
          });
          const xs = nextNodes.map((n) => n.x);
          const ys = nextNodes.map((n) => n.y);
          const cx = xs.reduce((a, b) => a + b, 0) / nextNodes.length;
          const cy = ys.reduce((a, b) => a + b, 0) / nextNodes.length;
          return {
            ...o,
            nodesENU: nextNodes,
            offsetX: Number(cx.toFixed(2)),
            offsetY: Number(cy.toFixed(2)),
            distanceM: Number(Math.max(0.5, Math.hypot(cx, cy)).toFixed(1)),
            bearingDeg: Math.round(((Math.atan2(cx, cy) * 180) / Math.PI + 360) % 360),
          };
        })
      );

      const fallbackTz = Math.round((lon / 15) * 2) / 2;
      setTzStr(String(fallbackTz));

      // Reset real-map verification flags when moving to a new geo coordinate and load aerial tile + OSM footprint
      setVerification((prev) => ({
        ...prev,
        mapImageVerified: false,
        surroundingBuildingsVerified: false,
      }));
      setIsFetchingMap(true);
      stitchSatelliteMapTexture(lat, lon, 'hybrid', 19)
        .then((mosaic) => {
          if (mosaic) setRealMapGround(mosaic);
        })
        .finally(() => setIsFetchingMap(false));

      setIsScanningBuildings(true);
      fetchSurroundingOsmBuildings(lat, lon, 95, measurements.buildingHeightM)
        .then((res) => {
          if (res.hostBuilding) {
            const hb = res.hostBuilding;
            if (movedFar || !roofPolygonLatLonRef.current || roofPolygonLatLonRef.current.length < 3) {
              setRoofPolygonENU(hb.nodesENU);
              setRoofPolygonLatLon(hb.nodesLatLon);
              const metrics = computePolygonMetricsENU(hb.nodesENU);
              setMeasurements((prev) => ({
                ...prev,
                roofLengthM: Number(Math.max(4, metrics.widthM || hb.widthM).toFixed(1)),
                roofWidthM: Number(Math.max(4, metrics.depthM || hb.depthM).toFixed(1)),
                buildingHeightM: Number(Math.max(3, hb.heightM).toFixed(1)),
                roofStructureType: hb.roofStructureType,
              }));
            }
          }
          if (res.neighborBuildings.length > 0) {
            setObstacles((prev) => {
              const retainedCustom = prev.filter(
                (o) => !o.id.startsWith('osm-bldg-') && o.id !== 'obs-building-w'
              );
              return [...retainedCustom, ...res.neighborBuildings];
            });
          }
          setVerification((prev) => ({
            ...prev,
            osmBuildingsCount: res.neighborBuildings.length,
            hostBuildingDetected: Boolean(res.hostBuilding),
          }));
          if (res.hostBuilding || res.neighborBuildings.length > 0) {
            setOsmScanMessage(
              `${res.hostBuilding ? `Matched host roof (${res.hostBuilding.areaSqM}m²) + ` : ''}Imported ${
                res.neighborBuildings.length
              } surrounding OSM building${res.neighborBuildings.length === 1 ? '' : 's'} within 95m.`
            );
          }
        })
        .catch(() => {
          // Non-blocking fallback
        })
        .finally(() => setIsScanningBuildings(false));

      try {
        const [elevRes, metaRes, nameRes, liveWeather] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`).then(
            (r) => (r.ok ? r.json() : null)
          ),
          fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=1`
          ).then((r) => (r.ok ? r.json() : null)),
          resolvedName ? Promise.resolve(resolvedName) : reverseGeocode(lat, lon),
          fetchLiveSolarWeather(lat, lon, resolvedName || siteLocationName),
        ]);

        if (
          elevRes.status === 'fulfilled' &&
          elevRes.value &&
          Array.isArray(elevRes.value.elevation) &&
          typeof elevRes.value.elevation[0] === 'number'
        ) {
          setElevStr(String(Math.max(0, Math.round(elevRes.value.elevation[0]))));
        }

        if (
          metaRes.status === 'fulfilled' &&
          metaRes.value &&
          typeof metaRes.value.utc_offset_seconds === 'number'
        ) {
          setTzStr(String(Number((metaRes.value.utc_offset_seconds / 3600).toFixed(2))));
        }

        if (nameRes.status === 'fulfilled' && nameRes.value) {
          setSiteLocationName(nameRes.value);
          setSetbackInputs((p) => ({ ...p, locationName: nameRes.value }));
        }

        if (liveWeather.status === 'fulfilled' && liveWeather.value) {
          setSiteCloudCover(liveWeather.value.cloudCoverPercent);
        }
      } finally {
        setIsFetchingSiteData(false);
      }
    },
    [measurements.buildingHeightM, siteLocationName]
  );

  // Sync elevation & exact local metadata on initial open
  useEffect(() => {
    fetchExactLocationData(
      weather.latitude || 17.41,
      weather.longitude || 78.44,
      weather.city
    );
    // Run once for initial weather coordinates
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handlers
  const handleSyncGps = async () => {
    setIsDetectingGps(true);
    try {
      const detected = await detectExactLocation();
      await fetchExactLocationData(detected.latitude, detected.longitude, detected.cityName);
    } finally {
      setIsDetectingGps(false);
    }
  };

  const handleFetchRealMap = useCallback(
    async (source?: RealMapSource) => {
      setIsFetchingMap(true);
      try {
        const src = source || realMapGround?.source || 'hybrid';
        const mosaic = await stitchSatelliteMapTexture(siteLat, siteLon, src, 19);
        if (mosaic) {
          setRealMapGround(mosaic);
        }
      } finally {
        setIsFetchingMap(false);
      }
    },
    [realMapGround?.source, siteLat, siteLon]
  );

  const handleScanOsmBuildings = useCallback(async () => {
    setIsScanningBuildings(true);
    setOsmScanMessage(null);
    try {
      const res = await fetchSurroundingOsmBuildings(
        siteLat,
        siteLon,
        95,
        measurements.buildingHeightM
      );
      if (res.hostBuilding) {
        const hb = res.hostBuilding;
        setRoofPolygonENU(hb.nodesENU);
        setRoofPolygonLatLon(hb.nodesLatLon);
        setMeasurements((prev) => ({
          ...prev,
          roofLengthM: Number(Math.max(4, hb.widthM).toFixed(1)),
          roofWidthM: Number(Math.max(4, hb.depthM).toFixed(1)),
          buildingHeightM: Number(Math.max(3, hb.heightM).toFixed(1)),
          roofStructureType: hb.roofStructureType,
        }));
      }
      if (res.neighborBuildings.length > 0) {
        setObstacles((prev) => {
          const retainedCustom = prev.filter(
            (o) => !o.id.startsWith('osm-bldg-') && o.id !== 'obs-building-w'
          );
          return [...retainedCustom, ...res.neighborBuildings];
        });
      }
      setVerification((prev) => ({
        ...prev,
        osmBuildingsCount: res.neighborBuildings.length,
        hostBuildingDetected: Boolean(res.hostBuilding),
      }));
      if (res.hostBuilding || res.neighborBuildings.length > 0) {
        setOsmScanMessage(
          `${res.hostBuilding ? `Matched host roof (${res.hostBuilding.areaSqM}m²) + ` : ''}Imported ${
            res.neighborBuildings.length
          } surrounding OSM building${res.neighborBuildings.length === 1 ? '' : 's'} within 95m.`
        );
      } else {
        setOsmScanMessage(
          res.message || 'No mapped OSM buildings nearby — adjust obstacles manually below.'
        );
      }
    } finally {
      setIsScanningBuildings(false);
    }
  }, [measurements.buildingHeightM, roofPolygonENU, siteLat, siteLon]);

  const handleUpdateHorizonPoint = (idx: number, elevDeg: number) => {
    setHorizonProfile((prev) => {
      const next = [...prev];
      next[idx] = Math.max(0, Math.min(60, elevDeg));
      return next;
    });
  };

  const handleAddObstacle = () => {
    const newId = `obs-${Date.now()}`;
    const dist = 7.5;
    const brg = 135;
    const brRad = (brg * Math.PI) / 180;
    const newObs: NearObstacle = {
      id: newId,
      name: `Obstacle ${obstacles.length + 1}`,
      category: 'Building',
      shape: 'box',
      heightM: 4.0,
      widthM: 3.5,
      depthM: 2.5,
      distanceM: dist,
      bearingDeg: brg,
      offsetX: Number((dist * Math.sin(brRad)).toFixed(2)),
      offsetY: Number((dist * Math.cos(brRad)).toFixed(2)),
      rotationDeg: 0,
    };
    setObstacles((prev) => [...prev, newObs]);
    setExpandedObstacleId(newId);
    setSelectedCadObstacleId(newId);
    setShowObjectsList(true);
  };

  const handleAddDrawnObstacle = (obs: NearObstacle) => {
    setObstacles((prev) => [...prev, obs]);
    setExpandedObstacleId(obs.id);
    setSelectedCadObstacleId(obs.id);
  };

  const handleUpdateObstacle = (id: string, patch: Partial<NearObstacle>) => {
    setObstacles((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const oldCenter = getObstacleCenterENU(o);
        const merged = { ...o, ...patch };

        if (patch.nodesENU && patch.nodesENU.length >= 3) {
          const xs = patch.nodesENU.map((n) => n.x);
          const ys = patch.nodesENU.map((n) => n.y);
          const cx = xs.reduce((a, b) => a + b, 0) / patch.nodesENU.length;
          const cy = ys.reduce((a, b) => a + b, 0) / patch.nodesENU.length;
          merged.shape = 'polygon';
          if (!patch.nodesLatLon) {
            merged.nodesLatLon = patch.nodesENU.map((pt): [number, number] => {
              const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
              return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
            });
          }
          merged.offsetX = Number(cx.toFixed(2));
          merged.offsetY = Number(cy.toFixed(2));
          merged.widthM = Number(Math.max(0.5, Math.max(...xs) - Math.min(...xs)).toFixed(1));
          merged.depthM = Number(Math.max(0.5, Math.max(...ys) - Math.min(...ys)).toFixed(1));
          merged.distanceM = Number(Math.max(0.5, Math.hypot(cx, cy)).toFixed(1));
          merged.bearingDeg = Math.round(((Math.atan2(cx, cy) * 180) / Math.PI + 360) % 360);
          return merged;
        }

        if (
          (patch.distanceM !== undefined || patch.bearingDeg !== undefined) &&
          patch.offsetX === undefined &&
          patch.offsetY === undefined
        ) {
          const brRad = (merged.bearingDeg * Math.PI) / 180;
          const nx = Number((merged.distanceM * Math.sin(brRad)).toFixed(2));
          const ny = Number((merged.distanceM * Math.cos(brRad)).toFixed(2));
          merged.offsetX = nx;
          merged.offsetY = ny;
          if (merged.nodesENU && merged.nodesENU.length >= 3) {
            const dx = nx - oldCenter.x;
            const dy = ny - oldCenter.y;
            merged.nodesENU = merged.nodesENU.map((n) => ({
              x: Number((n.x + dx).toFixed(2)),
              y: Number((n.y + dy).toFixed(2)),
            }));
            merged.nodesLatLon = merged.nodesENU.map((pt): [number, number] => {
              const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
              return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
            });
          }
        } else if (
          (patch.offsetX !== undefined || patch.offsetY !== undefined) &&
          patch.distanceM === undefined
        ) {
          const nx = typeof merged.offsetX === 'number' ? merged.offsetX : oldCenter.x;
          const ny = typeof merged.offsetY === 'number' ? merged.offsetY : oldCenter.y;
          if (merged.nodesENU && merged.nodesENU.length >= 3) {
            const dx = nx - oldCenter.x;
            const dy = ny - oldCenter.y;
            merged.nodesENU = merged.nodesENU.map((n) => ({
              x: Number((n.x + dx).toFixed(2)),
              y: Number((n.y + dy).toFixed(2)),
            }));
            merged.nodesLatLon = merged.nodesENU.map((pt): [number, number] => {
              const [lt, ln] = localMetersToLatLon(siteLat, siteLon, pt.x, pt.y);
              return [Number(lt.toFixed(6)), Number(ln.toFixed(6))];
            });
          }
          merged.distanceM = Number(Math.max(0.5, Math.hypot(nx, ny)).toFixed(1));
          merged.bearingDeg = Math.round(((Math.atan2(nx, ny) * 180) / Math.PI + 360) % 360);
        }
        return merged;
      })
    );
  };

  const handleRemoveObstacle = (id: string) => {
    setObstacles((prev) => prev.filter((o) => o.id !== id));
    if (selectedCadObstacleId === id) {
      setSelectedCadObstacleId(null);
    }
    if (expandedObstacleId === id) {
      setExpandedObstacleId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      <MaterialTopBar
        title={t('solar_analysis', 'Solar Analysis')}
        subtitle="Shadow CAD, Sun AR Trajectory, 360° Compass & Sun Timer"
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={syncedWeather}
        onOpenWeather={onOpenWeather}
      />

      {/* Built-in Solar CAD Workspace & Field Utilities Switcher (No Redundant 4-Card Menu) */}
      <div className="bg-white/95 dark:bg-slate-900/95 border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 sticky top-[52px] z-20 backdrop-blur-md">
        <div className="max-w-2xl mx-auto flex items-center gap-1 overflow-x-auto scrollbar-none bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl text-[10.5px] font-bold">
          <button
            type="button"
            onClick={() => setSuiteTab('shadow')}
            className={`shrink-0 flex-[1.5] min-w-fit py-2 px-3 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap ${
              suiteTab === 'shadow' || suiteTab === 'solar_analysis'
                ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Solar CAD Pipeline</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('ar_view')}
            className={`shrink-0 flex-1 min-w-fit py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
              suiteTab === 'ar_view'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Sun AR</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('sun_compass')}
            className={`shrink-0 flex-1 min-w-fit py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
              suiteTab === 'sun_compass'
                ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Compass</span>
          </button>

          <button
            type="button"
            onClick={() => setSuiteTab('sun_timer')}
            className={`shrink-0 flex-1 min-w-fit py-2 px-2.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-1 whitespace-nowrap ${
              suiteTab === 'sun_timer'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Sun Timer</span>
          </button>
        </div>
      </div>

      {suiteTab === 'ar_view' && (
        <SunARScreen
          embedded
          onNavigate={onNavigate}
          weather={syncedWeather}
          onOpenWeather={onOpenWeather}
        />
      )}

      {suiteTab === 'sun_compass' && (
        <SunCompassScreen
          embedded
          onNavigate={onNavigate}
          weather={syncedWeather}
          onOpenWeather={onOpenWeather}
        />
      )}

      {suiteTab === 'sun_timer' && (
        <SunTimerScreen
          embedded
          onNavigate={onNavigate}
          weather={syncedWeather}
          onOpenWeather={onOpenWeather}
        />
      )}

      {(suiteTab === 'shadow' || suiteTab === 'solar_analysis') && (
        <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto w-full">
          {/* Global Site & Annual Simulation Summary Strip */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300 font-medium min-w-0">
                <Compass className="w-4 h-4 text-[#FF6F00] shrink-0" />
                <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                  {siteLocationName}
                </span>
                <span aria-hidden="true">·</span>
                <span className="truncate font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                  {Math.abs(siteLat).toFixed(4)}°{siteLat >= 0 ? 'N' : 'S'},{' '}
                  {Math.abs(siteLon).toFixed(4)}°{siteLon >= 0 ? 'E' : 'W'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {surveyRecord.status === 'Completed' && (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-extrabold">
                    Survey Done
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleSyncGps}
                  disabled={isDetectingGps}
                  className="text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-60"
                  title="Sync with live site GPS coordinates & elevation"
                >
                  <Navigation className="w-3 h-3" />
                  <span>{isDetectingGps ? 'Locating...' : 'Sync GPS'}</span>
                </button>
              </div>
            </div>
            <div className="text-[10.5px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
              Roof {measurements.roofLengthM}×{measurements.roofWidthM}m · Height {measurements.buildingHeightM}m · {totalZonePanels} Panels ({((totalZonePanels * (measurements.moduleWp || 550)) / 1000).toFixed(1)} kWp) · Media {mediaAssets.length}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Effective POA
                </span>
                <span className="block font-mono tabular-nums font-extrabold text-sm text-slate-900 dark:text-white mt-0.5">
                  {annualSummary.effectivePoaKwhM2.toLocaleString()}
                </span>
                <span className="block text-[9.5px] text-slate-400">kWh/m²/yr</span>
              </div>

              <div className="p-2.5 rounded-2xl bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/40">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Total Shade Loss
                </span>
                <span className="block font-mono tabular-nums font-extrabold text-sm text-[#FF6F00] mt-0.5">
                  -{annualSummary.totalShadingLossPct}%
                </span>
                <span className="block text-[9.5px] text-slate-400">
                  Far {annualSummary.farBeamLossPct}% · Near {(annualSummary.nearBeamLinearLossPct + annualSummary.electricalMismatchLossPct).toFixed(1)}%
                </span>
              </div>

              <div className="p-2.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40">
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Yield Retention
                </span>
                <span className="block font-mono tabular-nums font-extrabold text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {annualSummary.shadingRetentionPct}%
                </span>
                <span className="block text-[9.5px] text-slate-400">
                  TF {annualSummary.transpositionFactor}×
                </span>
              </div>
            </div>
          </div>

          {/* 7-Step Linear Solar Engineering Pipeline Stepper */}
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl text-[10px] font-bold">
            {(
              [
                { id: 'step1_media', label: '1. Video & Sketch', icon: Upload },
                { id: 'step2_map_trace', label: '2. Map & Area', icon: MapPin },
                { id: 'step3_cad_zones', label: '3. 2D CAD Zones', icon: PenTool },
                { id: 'step4_building_3d', label: '4. 3D Building', icon: Building },
                { id: 'step5_structure_panels', label: '5. Structure & Panels', icon: Wrench },
                { id: 'step6_visual_video', label: '6. 3D Tour Video', icon: Video },
                { id: 'step7_pvsyst_report', label: '7. PVsyst & PDF', icon: ClipboardCheck },
              ] as Array<{
                id: InstallerWorkflowStage;
                label: string;
                icon: React.ComponentType<{ className?: string }>;
              }>
            ).map((step, idx, arr) => {
              const Icon = step.icon;
              const active = workflowStage === step.id;
              const currentIdx = arr.findIndex((s) => s.id === workflowStage);
              const done = idx < currentIdx;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setWorkflowStage(step.id)}
                  className={`shrink-0 min-h-[42px] py-1.5 px-2.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                      : done
                      ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {done ? <Check className="w-3 h-3 shrink-0" /> : <Icon className="w-3.5 h-3.5 shrink-0" />}
                  <span>{step.label}</span>
                </button>
              );
            })}
          </div>

          {/* STEP 1: 360° VIDEO, SITE DRAWING & MEASUREMENTS */}
          {workflowStage === 'step1_media' && (
            <SiteSurveyDrawingPanel
              siteLocationName={siteLocationName}
              siteLat={siteLat}
              siteLon={siteLon}
              latStr={latStr}
              lonStr={lonStr}
              elevStr={elevStr}
              tzStr={tzStr}
              onChangeLatStr={setLatStr}
              onChangeLonStr={setLonStr}
              onChangeElevStr={setElevStr}
              onChangeTzStr={setTzStr}
              onApplyCoordinates={(lt, ln) => fetchExactLocationData(lt, ln)}
              onSyncGps={handleSyncGps}
              isDetectingGps={isDetectingGps}
              isFetchingSiteData={isFetchingSiteData}
              mediaAssets={mediaAssets}
              onAddMediaAssets={(items) => setMediaAssets((prev) => [...prev, ...items])}
              onUpdateMediaAsset={(id, patch) =>
                setMediaAssets((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
                )
              }
              onRemoveMediaAsset={(id) => {
                const target = mediaAssets.find((m) => m.id === id);
                if (target?.url.startsWith('blob:')) {
                  URL.revokeObjectURL(target.url);
                }
                setMediaAssets((prev) => prev.filter((m) => m.id !== id));
                if (activeDrawingId === id) {
                  setActiveDrawingId(null);
                  setDrawingOverlay(null);
                }
              }}
              activeDrawingId={activeDrawingId}
              onSelectActiveDrawing={setActiveDrawingId}
              drawingOverlay={drawingOverlay}
              onUpdateDrawingOverlay={(patch) =>
                setDrawingOverlay((prev) => ({
                  url: prev?.url || '',
                  name: prev?.name || 'Site Drawing',
                  widthM: prev?.widthM ?? measurements.roofLengthM,
                  depthM: prev?.depthM ?? measurements.roofWidthM,
                  opacity: prev?.opacity ?? 0.55,
                  rotationDeg: prev?.rotationDeg ?? 0,
                  visible: prev?.visible ?? true,
                  ...patch,
                }))
              }
              measurements={measurements}
              onUpdateMeasurements={(patch) =>
                setMeasurements((prev) => ({ ...prev, ...patch }))
              }
              onNextStep={() => setWorkflowStage('step2_map_trace')}
            />
          )}

          {/* STEP 2: SATELLITE MAP, RULER & ROOF BOUNDARY VERIFICATION */}
          {workflowStage === 'step2_map_trace' && (
            <div className="space-y-4">
              <div
                id="step2-roof-polygon-card"
                className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-[#FF6F00]" />
                    <span>Step 2 · Satellite Map Area Identification, Ruler &amp; Roof Boundary</span>
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Locate building on satellite imagery, measure spans with the 2-click Ruler, and define exact roof corners before CAD design.
                  </p>
                </div>

                <RoofBoundaryPolygonView
                  siteLat={siteLat}
                  siteLon={siteLon}
                  config={simConfig}
                  uploadedDrawing={drawingOverlay}
                  roofPolygonENU={roofPolygonENU}
                  roofPolygonLatLon={roofPolygonLatLon}
                  buildingHeightM={measurements.buildingHeightM}
                  parapetHeightM={measurements.parapetHeightM}
                  perimeterSetbackM={measurements.perimeterSetbackM}
                  roofStructureType={measurements.roofStructureType as RoofStructureType}
                  onUpdateRoofPolygon={(nodesENU, nodesLatLon) => {
                    setRoofPolygonENU(nodesENU);
                    setRoofPolygonLatLon(nodesLatLon);
                  }}
                  onUpdateBuildingStructure={(patch) =>
                    setMeasurements((prev) => ({
                      ...prev,
                      ...(typeof patch.buildingHeightM === 'number'
                        ? { buildingHeightM: patch.buildingHeightM }
                        : {}),
                      ...(typeof patch.parapetHeightM === 'number'
                        ? { parapetHeightM: patch.parapetHeightM }
                        : {}),
                      ...(typeof patch.perimeterSetbackM === 'number'
                        ? { perimeterSetbackM: patch.perimeterSetbackM }
                        : {}),
                      ...(patch.roofStructureType ? { roofStructureType: patch.roofStructureType } : {}),
                    }))
                  }
                  defaultUnderlayMode="satellite"
                  hide3DPreviewButton
                  onPreviewIn3D={(mode) => {
                    setStep4RenderEngine(mode);
                    setWorkflowStage('step4_building_3d');
                  }}
                />
              </div>

              <RealMapVerificationPanel
                siteLocationName={siteLocationName}
                siteLat={siteLat}
                siteLon={siteLon}
                config={simConfig}
                measurements={measurements}
                onUpdateMeasurements={(patch) =>
                  setMeasurements((prev) => ({ ...prev, ...patch }))
                }
                mediaAssets={mediaAssets}
                onAddMediaAssets={(items) => setMediaAssets((prev) => [...prev, ...items])}
                onRemoveMediaAsset={(id) => {
                  const target = mediaAssets.find((m) => m.id === id);
                  if (target?.url.startsWith('blob:')) {
                    URL.revokeObjectURL(target.url);
                  }
                  setMediaAssets((prev) => prev.filter((m) => m.id !== id));
                  if (activeDrawingId === id) {
                    setActiveDrawingId(null);
                    setDrawingOverlay(null);
                  }
                }}
                realMapGround={realMapGround}
                isFetchingMap={isFetchingMap}
                isScanningBuildings={isScanningBuildings}
                osmScanMessage={osmScanMessage}
                onFetchRealMap={handleFetchRealMap}
                onScanOsmBuildings={handleScanOsmBuildings}
                obstacles={obstacles}
                onUpdateObstacle={handleUpdateObstacle}
                onRemoveObstacle={handleRemoveObstacle}
                verification={verification}
                onUpdateVerification={(patch) =>
                  setVerification((prev) => ({ ...prev, ...patch }))
                }
                onOpenRoofPolygon={() => {
                  document
                    .getElementById('step2-roof-polygon-card')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                onLaunchAutoCad3D={() => {
                  setStep4RenderEngine('isometric');
                  setWorkflowStage('step4_building_3d');
                }}
                onLaunchR3F3D={() => {
                  setStep4RenderEngine('r3f_overlay');
                  setWorkflowStage('step4_building_3d');
                }}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setVerification((prev) => ({
                      ...prev,
                      mapImageVerified: true,
                      buildingPhotosVerified: true,
                      surroundingBuildingsVerified: true,
                    }));
                    setWorkflowStage('step3_cad_zones');
                  }}
                  className="py-2.5 px-4 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Confirm Area Verification &amp; Step 3: 2D CAD Zones</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: 2D CAD FLOORPLAN, OBSTACLE PLACEMENT & SOLAR ZONE ALLOCATION */}
          {workflowStage === 'step3_cad_zones' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <PenTool className="w-4 h-4 text-[#FF6F00]" />
                      <span>Step 3 · 2D AutoCAD Zone &amp; Panel Placement</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Use + PV Zone on the CAD sheet to define candidate roof bays and module counts, plus parapet/tank obstacles.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[10.5px] font-bold">
                    <button
                      type="button"
                      onClick={() => setStep3CadSurface('blueprint')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        step3CadSurface === 'blueprint'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      2D CAD Sheet
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep3CadSurface('satellite')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        step3CadSurface === 'satellite'
                          ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Satellite CAD
                    </button>
                  </div>
                </div>

                {/* Live Zone & Module Allocation Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {zones.map((z, idx) => {
                    const count =
                      z.panelCount ??
                      Math.max(1, Math.floor(z.widthM / 1.15)) *
                        Math.max(1, Math.floor(z.depthM / 2.25));
                    return (
                      <div
                        key={z.id}
                        className={`p-2 rounded-xl border text-[10.5px] space-y-1 ${
                          z.enabled !== false
                            ? 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
                            : 'bg-slate-100/50 dark:bg-slate-900/40 border-slate-200/50 opacity-60'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1 font-bold">
                          <span className="truncate text-slate-900 dark:text-white">
                            Z{idx + 1}: {z.widthM.toFixed(1)}×{z.depthM.toFixed(1)}m
                          </span>
                          <input
                            type="checkbox"
                            checked={z.enabled !== false}
                            onChange={(e) =>
                              setZones((prev) =>
                                prev.map((it) =>
                                  it.id === z.id ? { ...it, enabled: e.target.checked } : it
                                )
                              )
                            }
                            aria-label={`Enable ${z.name}`}
                            className="accent-[#FF6F00] cursor-pointer"
                          />
                        </div>
                        <div className="flex items-center justify-between gap-1 font-mono text-[10px]">
                          <span className="text-sky-600 dark:text-sky-400 font-bold">{count} Panels</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setZones((prev) =>
                                  prev.map((it) =>
                                    it.id === z.id
                                      ? { ...it, panelCount: Math.max(1, count - 1) }
                                      : it
                                  )
                                )
                              }
                              className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 font-bold cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setZones((prev) =>
                                  prev.map((it) =>
                                    it.id === z.id ? { ...it, panelCount: count + 1 } : it
                                  )
                                )
                              }
                              className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 font-bold cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <ShadowCadEditor
                siteLat={siteLat}
                siteLon={siteLon}
                locationName={siteLocationName}
                elevationM={siteElev}
                isFetchingLocationData={isFetchingSiteData}
                isDetectingGps={isDetectingGps}
                config={simConfig}
                instantState={instantState}
                timeFormatted={timeFormatted}
                selectedObstacleId={selectedCadObstacleId}
                onSelectObstacle={(id) => {
                  setSelectedCadObstacleId(id);
                  if (id) setExpandedObstacleId(id);
                }}
                onSelectLocation={(lat, lon, resolvedName) =>
                  fetchExactLocationData(lat, lon, resolvedName)
                }
                onDetectGps={handleSyncGps}
                onUpdateArrayGeometry={(patch) => {
                  if (typeof patch.arrayWidthM === 'number') setArrayWidthM(patch.arrayWidthM);
                  if (typeof patch.collectorWidthM === 'number')
                    setCollectorWidthM(patch.collectorWidthM);
                  if (typeof patch.azimuthCompassDeg === 'number')
                    setAzimuthCompassDeg(patch.azimuthCompassDeg);
                }}
                onAddDrawnObstacle={handleAddDrawnObstacle}
                onUpdateObstacle={handleUpdateObstacle}
                onRemoveObstacle={handleRemoveObstacle}
                controlledViewMode={step3CadSurface}
                hideModeBar
                uploadedDrawing={drawingOverlay}
                onUpdateDrawingOverlay={(patch) =>
                  setDrawingOverlay((prev) =>
                    prev
                      ? { ...prev, ...patch }
                      : {
                          url: '',
                          name: 'Site Drawing',
                          widthM: measurements.roofLengthM + 8,
                          depthM: measurements.roofWidthM + 8,
                          opacity: 0.85,
                          rotationDeg: 0,
                          visible: true,
                          ...patch,
                        }
                  )
                }
                sunArcPointsDeg={
                  selectedDayOfYear < 120
                    ? sunPaths.equinox
                    : selectedDayOfYear < 250
                    ? sunPaths.summerSolstice
                    : sunPaths.winterSolstice
                }
                roofPolygonENU={roofPolygonENU}
                roofPolygonLatLon={roofPolygonLatLon}
                onUpdateRoofPolygon={(nodesENU, nodesLatLon) => {
                  setRoofPolygonENU(nodesENU);
                  setRoofPolygonLatLon(nodesLatLon);
                }}
                buildingHeightM={measurements.buildingHeightM}
                parapetHeightM={measurements.parapetHeightM}
                perimeterSetbackM={measurements.perimeterSetbackM}
                roofStructureType={measurements.roofStructureType as RoofStructureType}
                onUpdateBuildingStructure={(patch) =>
                  setMeasurements((prev) => ({
                    ...prev,
                    ...(typeof patch.buildingHeightM === 'number'
                      ? { buildingHeightM: patch.buildingHeightM }
                      : {}),
                    ...(typeof patch.parapetHeightM === 'number'
                      ? { parapetHeightM: patch.parapetHeightM }
                      : {}),
                    ...(typeof patch.perimeterSetbackM === 'number'
                      ? { perimeterSetbackM: patch.perimeterSetbackM }
                      : {}),
                    ...(patch.roofStructureType ? { roofStructureType: patch.roofStructureType } : {}),
                  }))
                }
                mediaAssets={mediaAssets}
                onAddMediaAssets={(items) => setMediaAssets((prev) => [...prev, ...items])}
                onRemoveMediaAsset={(id) => {
                  const target = mediaAssets.find((m) => m.id === id);
                  if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
                  setMediaAssets((prev) => prev.filter((m) => m.id !== id));
                }}
                activeDrawingId={activeDrawingId}
                onSelectActiveDrawing={setActiveDrawingId}
                timeHourDec={timeHourDec}
                onChangeTimeHour={setTimeHourDec}
                selectedDayOfYear={selectedDayOfYear}
                onChangeDayOfYear={setSelectedDayOfYear}
                monthOptions={MONTH_OPTIONS}
                realMapGround={realMapGround}
                zones={zones}
                onChangeZones={setZones}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setVerification((prev) => ({
                      ...prev,
                      mapImageVerified: true,
                      buildingPhotosVerified: true,
                      surroundingBuildingsVerified: true,
                    }));
                    setMmsStructure((prev) => ({ ...prev, assemblyLayer: 'building_only' }));
                    setWorkflowStage('step4_building_3d');
                  }}
                  className="py-2.5 px-4 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Step 4: Build 3D Building Shell</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: 3D BUILDING MASSING ON REAL SATELLITE MAP */}
          {workflowStage === 'step4_building_3d' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-[#FF6F00]" />
                      <span>Step 4 · 3D Building Massing, Parapets &amp; Surrounding Shadow Check</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Verify multi-story building height, stair core, parapets and candidate zone shading before fabricating steel structure.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[10.5px] font-bold">
                    <button
                      type="button"
                      onClick={() => setStep4RenderEngine('r3f_overlay')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        step4RenderEngine === 'r3f_overlay'
                          ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Realistic 3D
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep4RenderEngine('isometric')}
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        step4RenderEngine === 'isometric'
                          ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      AutoCAD 3D
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Building H (m)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="2.5"
                      max="40"
                      value={measurements.buildingHeightM}
                      onChange={(e) =>
                        setMeasurements((p) => ({
                          ...p,
                          buildingHeightM: Math.max(2.5, parseFloat(e.target.value) || 2.5),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Parapet H (m)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0.2"
                      max="3"
                      value={measurements.parapetHeightM}
                      onChange={(e) =>
                        setMeasurements((p) => ({
                          ...p,
                          parapetHeightM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Roof Type
                    </label>
                    <select
                      value={measurements.roofStructureType}
                      onChange={(e) =>
                        setMeasurements((p) => ({
                          ...p,
                          roofStructureType: e.target.value as RoofStructureType,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-xs"
                    >
                      <option value="rcc_flat">RCC Flat</option>
                      <option value="shed_slope">Shed Slope</option>
                      <option value="gabled">Gabled</option>
                    </select>
                  </div>
                </div>
              </div>

              <ShadowCadEditor
                siteLat={siteLat}
                siteLon={siteLon}
                locationName={siteLocationName}
                elevationM={siteElev}
                isFetchingLocationData={isFetchingSiteData}
                isDetectingGps={isDetectingGps}
                config={simConfig}
                instantState={instantState}
                timeFormatted={timeFormatted}
                selectedObstacleId={selectedCadObstacleId}
                onSelectObstacle={(id) => {
                  setSelectedCadObstacleId(id);
                  if (id) setExpandedObstacleId(id);
                }}
                onSelectLocation={(lat, lon, resolvedName) =>
                  fetchExactLocationData(lat, lon, resolvedName)
                }
                onDetectGps={handleSyncGps}
                onUpdateArrayGeometry={(patch) => {
                  if (typeof patch.arrayWidthM === 'number') setArrayWidthM(patch.arrayWidthM);
                  if (typeof patch.collectorWidthM === 'number')
                    setCollectorWidthM(patch.collectorWidthM);
                  if (typeof patch.azimuthCompassDeg === 'number')
                    setAzimuthCompassDeg(patch.azimuthCompassDeg);
                }}
                onAddDrawnObstacle={handleAddDrawnObstacle}
                onUpdateObstacle={handleUpdateObstacle}
                onRemoveObstacle={handleRemoveObstacle}
                controlledViewMode={step4RenderEngine}
                hideModeBar
                uploadedDrawing={drawingOverlay}
                onUpdateDrawingOverlay={(patch) =>
                  setDrawingOverlay((prev) =>
                    prev
                      ? { ...prev, ...patch }
                      : {
                          url: '',
                          name: 'Site Drawing',
                          widthM: measurements.roofLengthM + 8,
                          depthM: measurements.roofWidthM + 8,
                          opacity: 0.85,
                          rotationDeg: 0,
                          visible: true,
                          ...patch,
                        }
                  )
                }
                sunArcPointsDeg={
                  selectedDayOfYear < 120
                    ? sunPaths.equinox
                    : selectedDayOfYear < 250
                    ? sunPaths.summerSolstice
                    : sunPaths.winterSolstice
                }
                roofPolygonENU={roofPolygonENU}
                roofPolygonLatLon={roofPolygonLatLon}
                onUpdateRoofPolygon={(nodesENU, nodesLatLon) => {
                  setRoofPolygonENU(nodesENU);
                  setRoofPolygonLatLon(nodesLatLon);
                }}
                buildingHeightM={measurements.buildingHeightM}
                parapetHeightM={measurements.parapetHeightM}
                perimeterSetbackM={measurements.perimeterSetbackM}
                roofStructureType={measurements.roofStructureType as RoofStructureType}
                onUpdateBuildingStructure={(patch) =>
                  setMeasurements((prev) => ({
                    ...prev,
                    ...(typeof patch.buildingHeightM === 'number'
                      ? { buildingHeightM: patch.buildingHeightM }
                      : {}),
                    ...(typeof patch.parapetHeightM === 'number'
                      ? { parapetHeightM: patch.parapetHeightM }
                      : {}),
                    ...(typeof patch.perimeterSetbackM === 'number'
                      ? { perimeterSetbackM: patch.perimeterSetbackM }
                      : {}),
                    ...(patch.roofStructureType ? { roofStructureType: patch.roofStructureType } : {}),
                  }))
                }
                mediaAssets={mediaAssets}
                onAddMediaAssets={(items) => setMediaAssets((prev) => [...prev, ...items])}
                onRemoveMediaAsset={(id) => {
                  const target = mediaAssets.find((m) => m.id === id);
                  if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
                  setMediaAssets((prev) => prev.filter((m) => m.id !== id));
                }}
                activeDrawingId={activeDrawingId}
                onSelectActiveDrawing={setActiveDrawingId}
                timeHourDec={timeHourDec}
                onChangeTimeHour={setTimeHourDec}
                selectedDayOfYear={selectedDayOfYear}
                onChangeDayOfYear={setSelectedDayOfYear}
                monthOptions={MONTH_OPTIONS}
                realMapGround={realMapGround}
                verification={verification}
                onUpdateVerification={(patch) => setVerification((p) => ({ ...p, ...patch }))}
                onFetchRealMap={handleFetchRealMap}
                onScanOsmBuildings={handleScanOsmBuildings}
                isFetchingMap={isFetchingMap}
                isScanningBuildings={isScanningBuildings}
                osmScanMessage={osmScanMessage}
                measurements={measurements}
                onUpdateMeasurements={(patch) => setMeasurements((p) => ({ ...p, ...patch }))}
                zones={zones}
                onChangeZones={setZones}
                assemblyLayer="building_only"
                structureConfig={mmsStructure}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMmsStructure((prev) => ({ ...prev, assemblyLayer: 'structure_and_panels' }));
                    setWorkflowStage('step5_structure_panels');
                  }}
                  className="py-2.5 px-4 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Step 5: Build Structure &amp; Mount Panels on Top</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 5: MMS STEEL STRUCTURE & SOLAR PANEL PLACEMENT ON ROOFTOP */}
          {workflowStage === 'step5_structure_panels' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-[#FF6F00]" />
                      <span>Step 5 · Rooftop Steel MMS Structure &amp; Panel Array Assembly</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Toggle steel pergola frame vs mounted PV modules on top of the 3D building ({totalZonePanels} panels total).
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[10.5px] font-bold">
                    <button
                      type="button"
                      onClick={() =>
                        setMmsStructure((p) => ({ ...p, assemblyLayer: 'structure_only' }))
                      }
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        mmsStructure.assemblyLayer === 'structure_only'
                          ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Steel Structure Only
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMmsStructure((p) => ({ ...p, assemblyLayer: 'structure_and_panels' }))
                      }
                      className={`px-2.5 py-1 rounded-lg cursor-pointer ${
                        mmsStructure.assemblyLayer !== 'structure_only'
                          ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                          : 'text-slate-500'
                      }`}
                    >
                      Structure + Panels
                    </button>
                  </div>
                </div>

                {/* MMS Steel Structure Configuration Controls */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      MMS Style
                    </label>
                    <select
                      value={mmsStructure.structureStyle}
                      onChange={(e) =>
                        setMmsStructure((p) => ({
                          ...p,
                          structureStyle: e.target.value as MmsStructureStyle,
                        }))
                      }
                      className="w-full px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-bold text-[11px]"
                    >
                      <option value="elevated_pergola">Elevated Pergola (2.2m+)</option>
                      <option value="low_rise">Low-Rise Flush Rail</option>
                      <option value="tiered_split">Tiered Stair Split</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Clearance (m)
                    </label>
                    <input
                      type="number"
                      step="0.2"
                      min="0.25"
                      max="4.0"
                      value={measurements.mmsClearanceM}
                      onChange={(e) =>
                        setMeasurements((p) => ({
                          ...p,
                          mmsClearanceM: Math.max(0.25, parseFloat(e.target.value) || 0.25),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Column Bay (m)
                    </label>
                    <input
                      type="number"
                      step="0.4"
                      min="2.0"
                      max="6.0"
                      value={mmsStructure.columnGridSpacingM}
                      onChange={(e) =>
                        setMmsStructure((p) => ({
                          ...p,
                          columnGridSpacingM: Math.max(2.0, parseFloat(e.target.value) || 3.2),
                        }))
                      }
                      className="w-full px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      Tilt (°) / Azimuth
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        min="2"
                        max="45"
                        value={tiltDeg}
                        onChange={(e) => setTiltDeg(Math.max(2, Math.min(45, Number(e.target.value) || 15)))}
                        className="w-1/2 px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                      />
                      <input
                        type="number"
                        min="0"
                        max="359"
                        value={azimuthCompassDeg}
                        onChange={(e) =>
                          setAzimuthCompassDeg(((Number(e.target.value) || 180) + 360) % 360)
                        }
                        className="w-1/2 px-2 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10.5px] font-bold">
                  <button
                    type="button"
                    onClick={() =>
                      setMmsStructure((p) => ({
                        ...p,
                        includeBrickPedestals: !p.includeBrickPedestals,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-xl border cursor-pointer ${
                      mmsStructure.includeBrickPedestals
                        ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 text-amber-800 dark:text-amber-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    Brick/Concrete Pedestals: {mmsStructure.includeBrickPedestals ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMmsStructure((p) => ({
                        ...p,
                        includeCrossBracing: !p.includeCrossBracing,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-xl border cursor-pointer ${
                      mmsStructure.includeCrossBracing
                        ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-400 text-sky-800 dark:text-sky-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    Steel X-Bracing: {mmsStructure.includeCrossBracing ? 'ON' : 'OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMmsStructure((p) => ({
                        ...p,
                        showZoneCountBadges: !p.showZoneCountBadges,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-xl border cursor-pointer ${
                      mmsStructure.showZoneCountBadges
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-300'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                    }`}
                  >
                    Zone Count Badges: {mmsStructure.showZoneCountBadges ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <ShadowCadEditor
                siteLat={siteLat}
                siteLon={siteLon}
                locationName={siteLocationName}
                elevationM={siteElev}
                isFetchingLocationData={isFetchingSiteData}
                isDetectingGps={isDetectingGps}
                config={simConfig}
                instantState={instantState}
                timeFormatted={timeFormatted}
                selectedObstacleId={selectedCadObstacleId}
                onSelectObstacle={(id) => {
                  setSelectedCadObstacleId(id);
                  if (id) setExpandedObstacleId(id);
                }}
                onSelectLocation={(lat, lon, resolvedName) =>
                  fetchExactLocationData(lat, lon, resolvedName)
                }
                onDetectGps={handleSyncGps}
                onUpdateArrayGeometry={(patch) => {
                  if (typeof patch.arrayWidthM === 'number') setArrayWidthM(patch.arrayWidthM);
                  if (typeof patch.collectorWidthM === 'number')
                    setCollectorWidthM(patch.collectorWidthM);
                  if (typeof patch.azimuthCompassDeg === 'number')
                    setAzimuthCompassDeg(patch.azimuthCompassDeg);
                }}
                onAddDrawnObstacle={handleAddDrawnObstacle}
                onUpdateObstacle={handleUpdateObstacle}
                onRemoveObstacle={handleRemoveObstacle}
                controlledViewMode={step4RenderEngine}
                hideModeBar
                uploadedDrawing={drawingOverlay}
                sunArcPointsDeg={
                  selectedDayOfYear < 120
                    ? sunPaths.equinox
                    : selectedDayOfYear < 250
                    ? sunPaths.summerSolstice
                    : sunPaths.winterSolstice
                }
                roofPolygonENU={roofPolygonENU}
                roofPolygonLatLon={roofPolygonLatLon}
                onUpdateRoofPolygon={(nodesENU, nodesLatLon) => {
                  setRoofPolygonENU(nodesENU);
                  setRoofPolygonLatLon(nodesLatLon);
                }}
                buildingHeightM={measurements.buildingHeightM}
                parapetHeightM={measurements.parapetHeightM}
                perimeterSetbackM={measurements.perimeterSetbackM}
                roofStructureType={measurements.roofStructureType as RoofStructureType}
                onUpdateBuildingStructure={(patch) =>
                  setMeasurements((prev) => ({
                    ...prev,
                    ...(typeof patch.buildingHeightM === 'number'
                      ? { buildingHeightM: patch.buildingHeightM }
                      : {}),
                    ...(typeof patch.parapetHeightM === 'number'
                      ? { parapetHeightM: patch.parapetHeightM }
                      : {}),
                    ...(typeof patch.perimeterSetbackM === 'number'
                      ? { perimeterSetbackM: patch.perimeterSetbackM }
                      : {}),
                    ...(patch.roofStructureType ? { roofStructureType: patch.roofStructureType } : {}),
                  }))
                }
                mediaAssets={mediaAssets}
                onAddMediaAssets={(items) => setMediaAssets((prev) => [...prev, ...items])}
                onRemoveMediaAsset={(id) => {
                  const target = mediaAssets.find((m) => m.id === id);
                  if (target?.url.startsWith('blob:')) URL.revokeObjectURL(target.url);
                  setMediaAssets((prev) => prev.filter((m) => m.id !== id));
                }}
                activeDrawingId={activeDrawingId}
                onSelectActiveDrawing={setActiveDrawingId}
                timeHourDec={timeHourDec}
                onChangeTimeHour={setTimeHourDec}
                selectedDayOfYear={selectedDayOfYear}
                onChangeDayOfYear={setSelectedDayOfYear}
                monthOptions={MONTH_OPTIONS}
                realMapGround={realMapGround}
                verification={verification}
                onUpdateVerification={(patch) => setVerification((p) => ({ ...p, ...patch }))}
                onFetchRealMap={handleFetchRealMap}
                onScanOsmBuildings={handleScanOsmBuildings}
                isFetchingMap={isFetchingMap}
                isScanningBuildings={isScanningBuildings}
                osmScanMessage={osmScanMessage}
                measurements={measurements}
                onUpdateMeasurements={(patch) => setMeasurements((p) => ({ ...p, ...patch }))}
                zones={zones}
                onChangeZones={setZones}
                assemblyLayer={
                  mmsStructure.assemblyLayer === 'building_only'
                    ? 'structure_and_panels'
                    : mmsStructure.assemblyLayer
                }
                onChangeAssemblyLayer={(m) =>
                  setMmsStructure((p) => ({ ...p, assemblyLayer: m }))
                }
                structureConfig={mmsStructure}
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setMmsStructure((prev) => ({ ...prev, assemblyLayer: 'structure_and_panels' }));
                    setWorkflowStage('step6_visual_video');
                  }}
                  className="py-2.5 px-4 rounded-2xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Step 6: Full 3D Visual Walkthrough &amp; Video</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 6: FULL 3D VISUAL WALKTHROUGH & .WEBM VIDEO EXPORT */}
          {workflowStage === 'step6_visual_video' && (
            <div className="space-y-4">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-[#FF6F00]" />
                      <span>Step 6 · Full 3D Visual Tour &amp; Video Recorder</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Automated 360° camera orbit + solar shadow sweep across your 3D building, steel MMS structure &amp; {totalZonePanels} solar panels. Hit Record Video to save `.webm`.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-[10px] font-bold">
                    {(
                      [
                        { id: 'building_only', label: '1. Building' },
                        { id: 'structure_only', label: '2. Structure' },
                        { id: 'structure_and_panels', label: '3. Full + Panels' },
                      ] as Array<{ id: AssemblyLayerMode; label: string }>
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMmsStructure((p) => ({ ...p, assemblyLayer: m.id }))}
                        className={`px-2 py-1 rounded-lg cursor-pointer ${
                          mmsStructure.assemblyLayer === m.id
                            ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                            : 'text-slate-500'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <ShadowCadEditor
                siteLat={siteLat}
                siteLon={siteLon}
                locationName={siteLocationName}
                elevationM={siteElev}
                isFetchingLocationData={isFetchingSiteData}
                isDetectingGps={isDetectingGps}
                config={simConfig}
                instantState={instantState}
                timeFormatted={timeFormatted}
                selectedObstacleId={selectedCadObstacleId}
                onSelectObstacle={(id) => setSelectedCadObstacleId(id)}
                onSelectLocation={(lat, lon, resolvedName) =>
                  fetchExactLocationData(lat, lon, resolvedName)
                }
                onDetectGps={handleSyncGps}
                onUpdateArrayGeometry={(patch) => {
                  if (typeof patch.arrayWidthM === 'number') setArrayWidthM(patch.arrayWidthM);
                  if (typeof patch.collectorWidthM === 'number')
                    setCollectorWidthM(patch.collectorWidthM);
                  if (typeof patch.azimuthCompassDeg === 'number')
                    setAzimuthCompassDeg(patch.azimuthCompassDeg);
                }}
                onAddDrawnObstacle={handleAddDrawnObstacle}
                onUpdateObstacle={handleUpdateObstacle}
                onRemoveObstacle={handleRemoveObstacle}
                controlledViewMode="r3f_overlay"
                hideModeBar
                tourMode
                uploadedDrawing={drawingOverlay}
                sunArcPointsDeg={
                  selectedDayOfYear < 120
                    ? sunPaths.equinox
                    : selectedDayOfYear < 250
                    ? sunPaths.summerSolstice
                    : sunPaths.winterSolstice
                }
                roofPolygonENU={roofPolygonENU}
                roofPolygonLatLon={roofPolygonLatLon}
                buildingHeightM={measurements.buildingHeightM}
                parapetHeightM={measurements.parapetHeightM}
                perimeterSetbackM={measurements.perimeterSetbackM}
                roofStructureType={measurements.roofStructureType as RoofStructureType}
                timeHourDec={timeHourDec}
                onChangeTimeHour={setTimeHourDec}
                selectedDayOfYear={selectedDayOfYear}
                onChangeDayOfYear={setSelectedDayOfYear}
                monthOptions={MONTH_OPTIONS}
                realMapGround={realMapGround}
                verification={verification}
                onUpdateVerification={(patch) => setVerification((p) => ({ ...p, ...patch }))}
                onFetchRealMap={handleFetchRealMap}
                onScanOsmBuildings={handleScanOsmBuildings}
                isFetchingMap={isFetchingMap}
                isScanningBuildings={isScanningBuildings}
                osmScanMessage={osmScanMessage}
                measurements={measurements}
                onUpdateMeasurements={(patch) => setMeasurements((p) => ({ ...p, ...patch }))}
                zones={zones}
                onChangeZones={setZones}
                assemblyLayer={mmsStructure.assemblyLayer}
                onChangeAssemblyLayer={(m) => setMmsStructure((p) => ({ ...p, assemblyLayer: m }))}
                structureConfig={mmsStructure}
                hideZoneComparisonMatrix
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setWorkflowStage('step7_pvsyst_report')}
                  className="py-2.5 px-4 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <span>Step 7: Analyze in PVsyst &amp; Export PDF Report</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Shared Instantaneous Solar Time Sweep & Near-Objects Accordion in Steps 4 & 5 */}
          {(workflowStage === 'step4_building_3d' || workflowStage === 'step5_structure_panels') && (
            <div className="space-y-3">
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Sun Position
                    </span>
                    <div className="text-sm font-black font-mono tabular-nums text-amber-500 mt-0.5">
                      {instantState.sunAltitudeDeg.toFixed(1)}° Alt
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                      Az {instantState.sunAzimuthCompassDeg.toFixed(0)}° · Inc {instantState.incidenceAngleDeg}°
                    </p>
                  </div>

                  <div className="border-x border-slate-100 dark:border-slate-800 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Array Shade
                    </span>
                    <div className="text-sm font-black font-mono tabular-nums text-purple-600 dark:text-purple-400 mt-0.5">
                      {Math.round(instantState.linearShadingFactor * 100)}% Lin
                    </div>
                    <p className="text-[10px] text-rose-500 font-semibold font-mono tabular-nums">
                      {Math.round(instantState.electricalShadingFactor * 100)}% Elec
                    </p>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      POA Yield
                    </span>
                    <div className="text-sm font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {instantState.poaShadedWpm2} W/m²
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                      of {instantState.poaUnshadedWpm2} W/m²
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span>Solar Time Sweep: {timeFormatted}</span>
                  </span>
                  <select
                    value={selectedDayOfYear}
                    onChange={(e) => setSelectedDayOfYear(Number(e.target.value))}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
                  >
                    {MONTH_OPTIONS.map((m) => (
                      <option key={m.day} value={m.day}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="range"
                  min="5.5"
                  max="18.5"
                  step="0.1"
                  value={timeHourDec}
                  onChange={(e) => setTimeHourDec(parseFloat(e.target.value))}
                  className="w-full accent-[#FF6F00] h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                  <span>05:30 Sunrise</span>
                  <span>12:00 Noon</span>
                  <span>18:30 Sunset</span>
                </div>
              </div>

              {/* Collapsible 3D Near Shading Objects Manager */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowObjectsList((v) => !v)}
                    className="flex-1 flex items-center justify-between gap-2 text-left cursor-pointer min-w-0"
                  >
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <Building className="w-4 h-4 text-purple-600 shrink-0" />
                        <span>Near Shading Objects ({obstacles.length})</span>
                      </h3>
                      <p className="text-[10.5px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {showObjectsList
                          ? 'Edit numeric sizes, offsets or bearings'
                          : 'Tap any object on 3D/2D canvas or expand list'}
                      </p>
                    </div>
                    {showObjectsList ? (
                      <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleAddObstacle}
                    className="px-3 py-2 rounded-xl bg-[#FF6F00] hover:bg-[#EA580C] text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Object</span>
                  </button>
                </div>

                {showObjectsList && (
                  <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {obstacles.map((obs) => {
                      const proj = instantState.obstacleProjections.find((p) => p.id === obs.id);
                      const isOpen = expandedObstacleId === obs.id;
                      return (
                        <div
                          key={obs.id}
                          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 overflow-hidden"
                        >
                          <div
                            onClick={() => {
                              setExpandedObstacleId(isOpen ? null : obs.id);
                              setSelectedCadObstacleId(obs.id);
                            }}
                            className="p-3 flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                {obs.name}
                              </div>
                              <div className="text-[10.5px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                                H {obs.heightM}m · Dist {obs.distanceM}m · Brg {obs.bearingDeg}°
                                {proj ? ` · Shadow ${proj.shadowLengthM}m` : ''}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {proj && proj.beamLossPct > 0 && (
                                <span className="text-[11px] font-mono font-bold text-purple-600 dark:text-purple-400">
                                  -{proj.beamLossPct}%
                                </span>
                              )}
                              {isOpen ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {isOpen && (
                            <div className="p-3 pt-2 border-t border-slate-200 dark:border-slate-700/70 space-y-2.5 text-xs">
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    Height (m)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.2"
                                    min="0.2"
                                    value={obs.heightM}
                                    onChange={(e) =>
                                      handleUpdateObstacle(obs.id, {
                                        heightM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    Width (m)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0.2"
                                    value={obs.widthM}
                                    onChange={(e) =>
                                      handleUpdateObstacle(obs.id, {
                                        widthM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                                    Depth (m)
                                  </label>
                                  <input
                                    type="number"
                                    step="0.2"
                                    min="0.2"
                                    value={obs.depthM}
                                    onChange={(e) =>
                                      handleUpdateObstacle(obs.id, {
                                        depthM: Math.max(0.2, parseFloat(e.target.value) || 0.2),
                                      })
                                    }
                                    className="w-full px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-xs font-bold"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveObstacle(obs.id)}
                                  className="px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Remove Object</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Collapsible Module & String Electrical Response */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
                <button
                  type="button"
                  onClick={() => setShowTopologyPanel((v) => !v)}
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                      <span>String Electrical Topology</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {STRING_TOPOLOGY_INFO[stringTopology].short} · Mismatch +{annualSummary.electricalMismatchLossPct}%/yr
                    </p>
                  </div>
                  {showTopologyPanel ? (
                    <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {showTopologyPanel && (
                  <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800">
                    {(Object.keys(STRING_TOPOLOGY_INFO) as StringTopology[]).map((key) => {
                      const info = STRING_TOPOLOGY_INFO[key];
                      const active = stringTopology === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setStringTopology(key)}
                          className={`p-2.5 rounded-2xl border text-left transition cursor-pointer ${
                            active
                              ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500 text-sky-950 dark:text-sky-100 shadow-2xs'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="text-xs font-bold leading-tight">{info.short}</div>
                          <div className="text-[10px] opacity-80 mt-0.5 leading-snug">{info.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 7: PVSYST NEAR-SHADING ANALYTICS & INSPECTION PDF REPORT */}
          {workflowStage === 'step7_pvsyst_report' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl gap-1 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setStep7SubTab('pvsyst')}
                  className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    step7SubTab === 'pvsyst'
                      ? 'bg-white dark:bg-slate-900 text-[#FF6F00] shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Cpu className="w-3.5 h-3.5" />
                  <span>PVsyst Shading Analysis</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStep7SubTab('report')}
                  className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition ${
                    step7SubTab === 'report'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <ClipboardCheck className="w-3.5 h-3.5" />
                  <span>Inspection &amp; PDF Report</span>
                </button>
              </div>

              {step7SubTab === 'pvsyst' ? (
                <PvSystEngineeringPanel
                  config={simConfig}
                  instantState={instantState}
                  annualSummary={annualSummary}
                  sunPaths={sunPaths}
                  measurements={measurements}
                  onUpdateMeasurements={(patch) =>
                    setMeasurements((prev) => ({ ...prev, ...patch }))
                  }
                  tiltDeg={tiltDeg}
                  onChangeTilt={setTiltDeg}
                  azimuthCompassDeg={azimuthCompassDeg}
                  onChangeAzimuth={setAzimuthCompassDeg}
                  collectorWidthM={collectorWidthM}
                  onChangeCollectorWidth={setCollectorWidthM}
                  rowPitchM={rowPitchM}
                  onChangeRowPitch={setRowPitchM}
                  numRows={numRows}
                  onChangeNumRows={setNumRows}
                  arrayWidthM={arrayWidthM}
                  onChangeArrayWidth={setArrayWidthM}
                  stringTopology={stringTopology}
                  onChangeStringTopology={setStringTopology}
                  albedo={albedo}
                  onChangeAlbedo={setAlbedo}
                  onApplyHorizonPreset={setHorizonProfile}
                  onUpdateHorizonPoint={handleUpdateHorizonPoint}
                  setbackInputs={setbackInputs}
                  onUpdateSetbackInputs={(patch) =>
                    setSetbackInputs((p) => ({ ...p, ...patch }))
                  }
                  setbackResults={setbackResults}
                  onProceedToInspection={() => setStep7SubTab('report')}
                />
              ) : (
                <SurveyInspectionReportPanel
                  siteLocationName={siteLocationName}
                  config={simConfig}
                  instantState={instantState}
                  annualSummary={annualSummary}
                  mediaAssets={mediaAssets}
                  measurements={measurements}
                  manualChecks={manualChecks}
                  onToggleManualCheck={(id) =>
                    setManualChecks((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  surveyRecord={surveyRecord}
                  onUpdateSurveyRecord={(patch) =>
                    setSurveyRecord((prev) => ({ ...prev, ...patch }))
                  }
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
