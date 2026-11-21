/**
 * Comprehensive Solar Irradiance, Horizon, 3D Near-Shading & Loss Simulation Engine
 * Models site latitude/longitude ephemeris, Hay-Davies POA transposition,
 * far horizon shading, 3D multi-obstacle ray projection, inter-row shed pitch,
 * electrical bypass-diode mismatch, and annual monthly loss waterfall.
 */

export type StringTopology =
  | 'string_standard'
  | 'halfcut_portrait'
  | 'landscape_rows'
  | 'mlpe_micro';

export interface NearObstacle {
  id: string;
  name: string;
  category: 'Building' | 'Parapet' | 'Water Tank' | 'Tree' | 'Pole' | 'Custom';
  shape?: 'box' | 'cylinder' | 'wall' | 'polygon';
  heightM: number; // Height above array mounting base (m)
  widthM: number; // Horizontal width facing array (m)
  depthM: number; // Thickness along bearing axis (m)
  distanceM: number; // Horizontal distance from array center (m)
  bearingDeg: number; // Compass bearing from array center (0=N, 90=E, 180=S, 270=W)
  offsetX?: number; // Explicit East(+)/West(-) meter offset from array center
  offsetY?: number; // Explicit North(+)/South(-) meter offset from array center
  rotationDeg?: number; // Clockwise plan rotation in degrees
  nodesENU?: Array<{ x: number; y: number }>; // Multi-node building vertices in ENU meters
  nodesLatLon?: Array<[number, number]>; // Geo-pinned building vertices [lat, lon] on satellite map
  totalHeightFromGroundM?: number; // Real total height above ground for OSM / surrounding buildings
}

export interface SiteSimulationConfig {
  latitude: number;
  longitude: number;
  elevationM: number;
  timezoneOffsetHours: number;
  albedo: number;
  tiltDeg: number;
  azimuthCompassDeg: number; // 0=N, 90=E, 180=S, 270=W
  collectorWidthM: number; // Shed slant height / table width L (m)
  rowPitchM: number; // Row-to-row spacing D (m)
  numRows: number;
  arrayWidthM: number; // Array width along E-W axis (m)
  stringTopology: StringTopology;
  horizonProfile: number[]; // 25 points from -180° to +180° relative to true South (15° step)
  obstacles: NearObstacle[];
  walkwayWidthM?: number; // Built-in O&M grated walkway corridor width (m)
  walkwayEveryRows?: number; // Walkway aisle frequency (every N rows, default 2)
  perimeterSetbackM?: number; // Rooftop perimeter access setback (m)
  mmsClearanceM?: number; // Front-edge MMS pier clearance (m)
  roofLengthM?: number; // Site-measured rooftop East-West span (m)
  roofWidthM?: number; // Site-measured rooftop North-South span (m)
  buildingHeightM?: number; // Host building height (m)
  roofStructureType?: 'rcc_flat' | 'gabled' | 'shed_slope';
  roofPolygonENU?: Array<{ x: number; y: number }>; // Custom 2D building footprint polygon in ENU meters
  roofPolygonLatLon?: Array<[number, number]>; // Geo-pinned roof vertices [lat, lon]
  parapetHeightM?: number; // Measured rooftop parapet height (m)
}

export interface RowLayoutAndWalkways {
  rowOffsetsM: number[];
  walkwayAisles: Array<{
    id: string;
    label: string;
    offsetM: number;
    widthM: number;
  }>;
  effectivePitchM: number;
  totalNorthSouthSpanM: number;
}

/**
 * Compute synchronized ENU row centers & O&M walkway aisles for both 2D CAD, 3D AutoCAD, and Ray-Cast Shading
 */
export function computeRowOffsetsAndWalkways(
  config: SiteSimulationConfig
): RowLayoutAndWalkways {
  const beta = config.tiltDeg * DEG2RAD;
  const L = Math.max(1, config.collectorWidthM);
  const rowsCount = Math.max(1, config.numRows);
  const horizShed = L * Math.cos(beta);
  const basePitch = Math.max(horizShed + 0.25, config.rowPitchM);
  const walkwayW = Math.max(0, config.walkwayWidthM ?? 0.75);
  const everyRows = Math.max(1, config.walkwayEveryRows ?? 2);

  if (rowsCount === 1) {
    return {
      rowOffsetsM: [0],
      walkwayAisles:
        walkwayW > 0
          ? [
              {
                id: 'wk-front',
                label: `Front O&M Walkway (${walkwayW.toFixed(2)}m)`,
                offsetM: -(walkwayW * 0.5 + 0.45),
                widthM: walkwayW,
              },
            ]
          : [],
      effectivePitchM: basePitch,
      totalNorthSouthSpanM: horizShed + walkwayW,
    };
  }

  const rawPositions: number[] = [0];
  const rawAisles: Array<{ id: string; label: string; rawOffset: number; widthM: number }> = [];

  for (let r = 1; r < rowsCount; r++) {
    const hasWalkwayAisle = walkwayW > 0 && r % everyRows === 0;
    const step = hasWalkwayAisle
      ? Math.max(basePitch, horizShed + walkwayW + 0.35)
      : basePitch;
    const prev = rawPositions[r - 1];
    const next = prev + step;
    rawPositions.push(next);
    if (hasWalkwayAisle) {
      rawAisles.push({
        id: `wk-aisle-${r}`,
        label: `O&M Aisle R${r}-R${r + 1} (${walkwayW.toFixed(2)}m)`,
        rawOffset: prev + horizShed + (step - horizShed) * 0.5,
        widthM: walkwayW,
      });
    }
  }

  // Always add a rear/front maintenance service walkway if none fell between rows
  if (walkwayW > 0 && rawAisles.length === 0) {
    rawAisles.push({
      id: 'wk-front-service',
      label: `Service Walkway (${walkwayW.toFixed(2)}m)`,
      rawOffset: -(walkwayW * 0.5 + 0.45),
      widthM: walkwayW,
    });
  }

  const minPos = rawPositions[0];
  const maxPos = rawPositions[rawPositions.length - 1];
  const mid = (minPos + maxPos) * 0.5;

  const rowOffsetsM = rawPositions.map((p) => Number((p - mid).toFixed(3)));
  const walkwayAisles = rawAisles.map((a) => ({
    id: a.id,
    label: a.label,
    offsetM: Number((a.rawOffset - mid).toFixed(3)),
    widthM: a.widthM,
  }));

  const effectivePitchM = Number(
    ((maxPos - minPos) / Math.max(1, rowsCount - 1)).toFixed(2)
  );

  return {
    rowOffsetsM,
    walkwayAisles,
    effectivePitchM,
    totalNorthSouthSpanM: Number((maxPos - minPos + horizShed).toFixed(2)),
  };
}

export interface SunPoint {
  hour: number;
  altitudeDeg: number;
  azimuthCompassDeg: number;
  azimuthSouthDeg: number; // -180..+180 (0 = South in NH, 0 = North in SH? Actually kept true compass + South=0 convention)
}

export interface MonthlySimulationRow {
  month: string;
  ghiKwhM2: number;
  poaUnshadedKwhM2: number;
  farShadingLossPct: number;
  nearLinearLossPct: number;
  electricalLossPct: number;
  effectivePoaKwhM2: number;
  totalShadingLossPct: number;
}

export interface ShadingMatrixCell {
  azimuthRelSouthDeg: number;
  elevationDeg: number;
  linearLossPct: number;
  electricalLossPct: number;
  retainedFactor: number; // 0..1
}

export interface AnnualSimulationSummary {
  annualGhiKwhM2: number;
  annualPoaUnshadedKwhM2: number;
  transpositionFactor: number;
  iamLossPct: number;
  farBeamLossPct: number;
  farDiffuseLossPct: number;
  nearBeamLinearLossPct: number;
  nearDiffuseAlbedoLossPct: number;
  electricalMismatchLossPct: number;
  effectivePoaKwhM2: number;
  totalShadingLossPct: number;
  shadingRetentionPct: number;
  gcr: number;
  rowShadingLimitAngleDeg: number;
  optimalPitchWinterDegM: number;
  diffuseSkyViewFactor: number;
  monthlyRows: MonthlySimulationRow[];
  matrixAzimuths: number[];
  matrixElevations: number[];
  shadingMatrix: ShadingMatrixCell[][];
}

export interface InstantaneousShadingState {
  sunAltitudeDeg: number;
  sunAzimuthCompassDeg: number;
  sunAzimuthSouthDeg: number;
  incidenceAngleDeg: number;
  isBehindPlane: boolean;
  isBelowHorizon: boolean;
  horizonElevationAtSunDeg: number;
  linearShadingFactor: number; // 0..1 shaded fraction
  electricalShadingFactor: number; // 0..1 electrical power loss fraction
  rowMutualShadingFraction: number; // 0..1
  ghiWpm2: number;
  poaUnshadedWpm2: number;
  poaShadedWpm2: number;
  obstacleProjections: {
    id: string;
    name: string;
    category: NearObstacle['category'];
    shape: 'box' | 'cylinder' | 'wall' | 'polygon';
    rotationDeg: number;
    shadowLengthM: number;
    shadowTipX: number; // relative to array center (+East, -West)
    shadowTipY: number; // relative to array center (+North, -South)
    obsX: number;
    obsY: number;
    castsShadeOnArray: boolean;
    beamLossPct: number;
    shadowVectorX: number;
    shadowVectorY: number;
    footprintAreaSqM: number;
  }[];
  shadedCellGrid: boolean[][]; // [ny][nx] collector cell shading state for 3D scene rendering
}

/**
 * Convert obstacle distance/bearing, multi-node polygon centroid, or explicit offsetX/offsetY to ENU meters (+X East, +Y North)
 */
export function getObstacleCenterENU(obs: NearObstacle): { x: number; y: number } {
  if (obs.nodesENU && obs.nodesENU.length >= 3) {
    const sum = obs.nodesENU.reduce(
      (acc, n) => ({ x: acc.x + n.x, y: acc.y + n.y }),
      { x: 0, y: 0 }
    );
    return {
      x: sum.x / obs.nodesENU.length,
      y: sum.y / obs.nodesENU.length,
    };
  }
  if (typeof obs.offsetX === 'number' && typeof obs.offsetY === 'number') {
    return { x: obs.offsetX, y: obs.offsetY };
  }
  const brRad = (obs.bearingDeg * Math.PI) / 180;
  return {
    x: obs.distanceM * Math.sin(brRad),
    y: obs.distanceM * Math.cos(brRad),
  };
}

export function isPointInPolygon2D(
  px: number,
  py: number,
  poly: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export interface PolygonMetricsENU {
  cx: number;
  cy: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  widthM: number;
  depthM: number;
  areaSqM: number;
  perimeterM: number;
  signedArea: number;
}

export function computePolygonMetricsENU(
  nodes: Array<{ x: number; y: number }>
): PolygonMetricsENU {
  if (nodes.length < 3) {
    return {
      cx: 0,
      cy: 0,
      minX: 0,
      maxX: 0,
      minY: 0,
      maxY: 0,
      widthM: 0,
      depthM: 0,
      areaSqM: 0,
      perimeterM: 0,
      signedArea: 0,
    };
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

  const signedArea = area2 / 2;
  const areaSqM = Math.abs(signedArea);
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
    minX: Number(minX.toFixed(2)),
    maxX: Number(maxX.toFixed(2)),
    minY: Number(minY.toFixed(2)),
    maxY: Number(maxY.toFixed(2)),
    widthM: Number(Math.max(0.5, maxX - minX).toFixed(2)),
    depthM: Number(Math.max(0.5, maxY - minY).toFixed(2)),
    areaSqM: Number(areaSqM.toFixed(1)),
    perimeterM: Number(perimeterM.toFixed(1)),
    signedArea,
  };
}

/**
 * Returns active building roof boundary polygon in ENU meters (falls back to roofLengthM x roofWidthM rectangle).
 */
export function getHostRoofFootprintENU(
  config: SiteSimulationConfig
): Array<{ x: number; y: number }> {
  if (config.roofPolygonENU && config.roofPolygonENU.length >= 3) {
    return config.roofPolygonENU;
  }
  const roofL = Math.max(8, config.roofLengthM ?? config.arrayWidthM + 4);
  const roofW = Math.max(6, config.roofWidthM ?? 14);
  return [
    { x: Number((-roofL / 2).toFixed(2)), y: Number((-roofW / 2).toFixed(2)) },
    { x: Number((roofL / 2).toFixed(2)), y: Number((-roofW / 2).toFixed(2)) },
    { x: Number((roofL / 2).toFixed(2)), y: Number((roofW / 2).toFixed(2)) },
    { x: Number((-roofL / 2).toFixed(2)), y: Number((roofW / 2).toFixed(2)) },
  ];
}

/**
 * Compute inward parallel offset (setback) polygon for arbitrary CCW/CW 2D roof footprints.
 */
export function computeInsetPolygonENU(
  nodes: Array<{ x: number; y: number }>,
  insetM: number
): Array<{ x: number; y: number }> {
  if (nodes.length < 3 || insetM <= 0.02) return nodes;
  const metrics = computePolygonMetricsENU(nodes);
  // Orient positively (CCW) so left-hand normal points inward
  const ccw = metrics.signedArea >= 0 ? nodes : [...nodes].reverse();
  const n = ccw.length;
  const result: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < n; i++) {
    const pPrev = ccw[(i - 1 + n) % n];
    const pCurr = ccw[i];
    const pNext = ccw[(i + 1) % n];

    const e1x = pCurr.x - pPrev.x;
    const e1y = pCurr.y - pPrev.y;
    const len1 = Math.hypot(e1x, e1y) || 1;
    const n1x = -e1y / len1;
    const n1y = e1x / len1;

    const e2x = pNext.x - pCurr.x;
    const e2y = pNext.y - pCurr.y;
    const len2 = Math.hypot(e2x, e2y) || 1;
    const n2x = -e2y / len2;
    const n2y = e2x / len2;

    // Offset lines: (P - Pcurr) . n1 = insetM  and  (P - Pcurr) . n2 = insetM
    const det = n1x * n2y - n1y * n2x;
    if (Math.abs(det) < 0.12) {
      // Nearly collinear edges: average inward normal
      const avgX = n1x + n2x;
      const avgY = n1y + n2y;
      const avgLen = Math.hypot(avgX, avgY) || 1;
      result.push({
        x: Number((pCurr.x + (avgX / avgLen) * insetM).toFixed(2)),
        y: Number((pCurr.y + (avgY / avgLen) * insetM).toFixed(2)),
      });
    } else {
      // Solve [n1x n1y; n2x n2y] * delta = [insetM; insetM]
      const dx = (insetM * n2y - n1y * insetM) / det;
      const dy = (n1x * insetM - insetM * n2x) / det;
      // Clamp extreme miter spikes on acute corners
      const miterDist = Math.hypot(dx, dy);
      const scale = miterDist > insetM * 2.8 ? (insetM * 2.8) / miterDist : 1;
      result.push({
        x: Number((pCurr.x + dx * scale).toFixed(2)),
        y: Number((pCurr.y + dy * scale).toFixed(2)),
      });
    }
  }

  return metrics.signedArea >= 0 ? result : [...result].reverse();
}

function segmentIntersectsSegment2D(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number
): boolean {
  const ccw = (p1x: number, p1y: number, p2x: number, p2y: number, p3x: number, p3y: number) =>
    (p3y - p1y) * (p2x - p1x) > (p2y - p1y) * (p3x - p1x);
  return (
    ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
    ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy)
  );
}

function rayIntervalHitsPolygon2D(
  px: number,
  py: number,
  sx: number,
  sy: number,
  tStart: number,
  tEnd: number,
  poly: Array<{ x: number; y: number }>
): boolean {
  if (tEnd <= tStart || poly.length < 3) return false;
  const ax = px + sx * tStart;
  const ay = py + sy * tStart;
  const bx = px + sx * tEnd;
  const by = py + sy * tEnd;
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;

  if (isPointInPolygon2D(mx, my, poly) || isPointInPolygon2D(ax, ay, poly) || isPointInPolygon2D(bx, by, poly)) {
    return true;
  }

  for (let i = 0; i < poly.length; i++) {
    const p1 = poly[i];
    const p2 = poly[(i + 1) % poly.length];
    if (segmentIntersectsSegment2D(ax, ay, bx, by, p1.x, p1.y, p2.x, p2.y)) {
      return true;
    }
  }
  return false;
}

/**
 * Exact WGS84 ellipsoidal meters-per-degree conversion factors at latitude
 */
function getWgs84MetersPerDeg(originLatDeg: number): { mPerLat: number; mPerLon: number } {
  const latRad = (originLatDeg * Math.PI) / 180;
  const mPerLat =
    111132.92 -
    559.82 * Math.cos(2 * latRad) +
    1.175 * Math.cos(4 * latRad) -
    0.0023 * Math.cos(6 * latRad);
  const mPerLon =
    111412.84 * Math.cos(latRad) -
    93.5 * Math.cos(3 * latRad) +
    0.118 * Math.cos(5 * latRad);
  return {
    mPerLat,
    mPerLon: Math.max(1000, mPerLon),
  };
}

/**
 * Convert local ENU meter coordinates (x East, y North) around originLat/originLon to [lat, lon]
 */
export function localMetersToLatLon(
  originLat: number,
  originLon: number,
  xMeters: number,
  yMeters: number
): [number, number] {
  const { mPerLat, mPerLon } = getWgs84MetersPerDeg(originLat);
  return [originLat + yMeters / mPerLat, originLon + xMeters / mPerLon];
}

/**
 * Convert [lat, lon] to local ENU meters (x East, y North) around originLat/originLon
 */
export function latLonToLocalMeters(
  originLat: number,
  originLon: number,
  lat: number,
  lon: number
): { x: number; y: number } {
  const { mPerLat, mPerLon } = getWgs84MetersPerDeg(originLat);
  return {
    x: (lon - originLon) * mPerLon,
    y: (lat - originLat) * mPerLat,
  };
}

export const HORIZON_AZIMUTHS_DEG: number[] = Array.from(
  { length: 25 },
  (_, i) => -180 + i * 15
);

export const HORIZON_PRESETS: Record<
  'flat' | 'urban' | 'valley' | 'ridge',
  { label: string; profile: number[] }
> = {
  flat: {
    label: 'Flat Open Horizon',
    profile: Array(25).fill(0),
  },
  urban: {
    label: 'Urban Rooftop Skyline',
    profile: [
      6, 8, 12, 16, 18, 14, 10, 8, 11, 15, 12, 7, 5, 8, 12, 16, 19, 15, 11, 14, 18, 13, 9, 7, 6,
    ],
  },
  valley: {
    label: 'East-West Mountain Valley',
    profile: [
      4, 5, 7, 11, 16, 22, 26, 24, 18, 11, 6, 3, 2, 3, 7, 12, 19, 25, 28, 23, 16, 10, 6, 5, 4,
    ],
  },
  ridge: {
    label: 'Nearby Southern Ridge',
    profile: [
      2, 2, 3, 4, 6, 9, 12, 15, 18, 21, 24, 25, 26, 25, 23, 20, 16, 12, 8, 5, 4, 3, 2, 2, 2,
    ],
  },
};

export const ALBEDO_PRESETS = [
  { label: 'Concrete / Bitumen', value: 0.20 },
  { label: 'Grass / Soil', value: 0.22 },
  { label: 'Dark Roof Membrane', value: 0.12 },
  { label: 'White Cool Roof', value: 0.55 },
  { label: 'Desert Sand', value: 0.35 },
  { label: 'Fresh Snow', value: 0.70 },
];

export const STRING_TOPOLOGY_INFO: Record<
  StringTopology,
  { label: string; short: string; factor: number; desc: string }
> = {
  string_standard: {
    label: 'Series String (Full Module)',
    short: 'Standard Series',
    factor: 2.3,
    desc: 'Partial shade throttles full string current until bypass activates.',
  },
  halfcut_portrait: {
    label: 'Half-Cut Portrait (3 Diodes)',
    short: 'Half-Cut 3-Diode',
    factor: 1.45,
    desc: 'Split-cell substrings isolate lower-row shading to 50% cell blocks.',
  },
  landscape_rows: {
    label: 'Landscape (Row-Aligned)',
    short: 'Landscape Bypass',
    factor: 1.18,
    desc: 'Inter-row shadows align horizontally along bypass diode substrings.',
  },
  mlpe_micro: {
    label: 'Microinverters / Optimizers',
    short: 'Module MLPE',
    factor: 1.0,
    desc: 'Per-module MPPT eliminates string mismatch; electrical loss equals linear.',
  },
};

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_MID_DAYS = [17, 47, 75, 105, 135, 162, 198, 228, 258, 288, 318, 344];
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Exact solar position at dayOfYear (1..365) and local clock hour (0..24)
 */
export function computeSolarPosition(
  latDeg: number,
  lonDeg: number,
  tzOffsetHours: number,
  dayOfYear: number,
  clockHour: number
): {
  altitudeDeg: number;
  azimuthCompassDeg: number;
  azimuthSouthDeg: number;
  declinationDeg: number;
  solarTimeHours: number;
} {
  const declDeg =
    23.45 * Math.sin(((360 / 365) * (284 + dayOfYear)) * DEG2RAD);
  const declRad = declDeg * DEG2RAD;
  const latRad = latDeg * DEG2RAD;

  // Equation of time (minutes)
  const b = ((360 / 365) * (dayOfYear - 81)) * DEG2RAD;
  const eotMin = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  const lstm = 15 * tzOffsetHours;
  const timeCorrMin = 4 * (lonDeg - lstm) + eotMin;
  const solarTimeHours = (clockHour + timeCorrMin / 60 + 24) % 24;
  const hraDeg = 15 * (solarTimeHours - 12);
  const hraRad = hraDeg * DEG2RAD;

  const sinAlt =
    Math.sin(latRad) * Math.sin(declRad) +
    Math.cos(latRad) * Math.cos(declRad) * Math.cos(hraRad);
  const altRad = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const altitudeDeg = altRad * RAD2DEG;

  const cosAlt = Math.max(0.001, Math.cos(altRad));
  const cosAz =
    (Math.sin(declRad) * Math.cos(latRad) -
      Math.cos(declRad) * Math.sin(latRad) * Math.cos(hraRad)) /
    cosAlt;

  let azFromNorth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD2DEG;
  if (hraDeg > 0) {
    azFromNorth = 360 - azFromNorth;
  }
  const azimuthCompassDeg = (azFromNorth + 180) % 360;
  // Wait: verify standard compass convention matching solarMath.ts:
  // At noon (hra=0), cosAz = (sin(decl)*cos(lat) - cos(decl)*sin(lat)) / cosAlt = sin(decl - lat)/cosAlt.
  // In Northern Hemisphere (lat=20, decl=0): sin(-20)/cos(20) < 0 -> acos > 90 -> ~180° when shifted? Let's verify:
  // If lat=20, decl=0, noon: sin(0)*cos(20) - cos(0)*sin(20) = -sin(20), cosAlt = cos(70) = sin(20)? No, alt = 70, cosAlt = cos(70) = sin(20)!
  // So cosAz = -1 -> acos(-1) = 180°!
  // Then adding +180° would make it 360° (North)! Let's fix that carefully:
  // Actually let's compute azimuth directly via atan2(sin(hra), cos(hra)*sin(lat) - tan(decl)*cos(lat)) measured from South!
  const azSouthRad = Math.atan2(
    Math.sin(hraRad),
    Math.cos(hraRad) * Math.sin(latRad) - Math.tan(declRad) * Math.cos(latRad)
  );
  // Check: lat=20°, decl=0°, noon (hra=0): atan2(0, +sin(20)) = 0° (Due South)!
  // Morning (hra=-90°, 6 AM): atan2(-1, 0) = -90° (Due East)!
  // Evening (hra=+90°, 6 PM): atan2(+1, 0) = +90° (Due West)!
  // Southern Hemisphere (lat=-20°, decl=0°, noon hra=0): atan2(0, -sin(20)) = +180° (Due North)!
  // That atan2 formula is rock-solid globally for both hemispheres!
  const azimuthSouthDeg = azSouthRad * RAD2DEG; // -180..+180 (0=South, -90=East, +90=West, +-180=North)
  const compassDeg = (azimuthSouthDeg + 180 + 360) % 360; // 0=N, 90=E, 180=S, 270=W

  return {
    altitudeDeg: Number(altitudeDeg.toFixed(2)),
    azimuthCompassDeg: Number(compassDeg.toFixed(2)),
    azimuthSouthDeg: Number(azimuthSouthDeg.toFixed(2)),
    declinationDeg: Number(declDeg.toFixed(2)),
    solarTimeHours: Number(solarTimeHours.toFixed(2)),
  };
}

/**
 * Interpolate far horizon obstruction angle (deg) at a given azimuth relative to South (-180..+180)
 */
export function interpolateHorizonAngle(
  horizonProfile: number[],
  azimuthSouthDeg: number
): number {
  const clampedAz = Math.max(-180, Math.min(180, azimuthSouthDeg));
  const idxFloat = (clampedAz + 180) / 15;
  const idxLow = Math.max(0, Math.min(24, Math.floor(idxFloat)));
  const idxHigh = Math.max(0, Math.min(24, idxLow + 1));
  const frac = idxFloat - idxLow;
  const vLow = horizonProfile[idxLow] ?? 0;
  const vHigh = horizonProfile[idxHigh] ?? vLow;
  return vLow + (vHigh - vLow) * frac;
}

/**
 * Compute angle of incidence (deg) between sun ray and collector plane normal
 */
export function computeIncidenceAngleDeg(
  sunAltDeg: number,
  sunAzCompassDeg: number,
  tiltDeg: number,
  planeAzCompassDeg: number
): number {
  if (sunAltDeg <= 0) return 90;
  const alt = sunAltDeg * DEG2RAD;
  const beta = tiltDeg * DEG2RAD;
  const deltaAz = (sunAzCompassDeg - planeAzCompassDeg) * DEG2RAD;
  const cosTheta =
    Math.sin(alt) * Math.cos(beta) +
    Math.cos(alt) * Math.sin(beta) * Math.cos(deltaAz);
  const clamped = Math.max(-1, Math.min(1, cosTheta));
  return Math.acos(clamped) * RAD2DEG;
}

/**
 * Convert linear area shading fraction (0..1) into electrical string loss (0..1)
 */
export function computeElectricalShadingFraction(
  linearFraction: number,
  topology: StringTopology
): number {
  if (linearFraction <= 0) return 0;
  if (linearFraction >= 0.99) return 1;
  const factor = STRING_TOPOLOGY_INFO[topology].factor;
  // Non-linear bypass threshold ramp up to full module string drop
  return Math.min(1, Number((linearFraction * factor).toFixed(4)));
}

/**
 * Mutual inter-row shed shading fraction (0..1) for N rows of slant height L at pitch D
 */
export function computeInterRowShadingFraction(
  sunAltDeg: number,
  sunAzCompassDeg: number,
  tiltDeg: number,
  planeAzCompassDeg: number,
  collectorWidthM: number,
  rowPitchM: number,
  numRows: number
): number {
  if (sunAltDeg <= 0 || numRows <= 1 || tiltDeg <= 0.5) return 0;
  const deltaAz = (sunAzCompassDeg - planeAzCompassDeg) * DEG2RAD;
  const cosDelta = Math.cos(deltaAz);
  // If sun is behind the collector plane, beam doesn't hit front face anyway
  if (cosDelta <= 0.01) return 0;

  // Profile angle of sun projected onto vertical plane perpendicular to row axis
  const tanProfile = Math.tan(sunAltDeg * DEG2RAD) / cosDelta;
  const profileAngleRad = Math.atan(tanProfile);

  const beta = tiltDeg * DEG2RAD;
  const L = collectorWidthM;
  const D = Math.max(rowPitchM, L * Math.cos(beta) + 0.15);

  // Horizontal shadow projection from top edge of front row onto rear row base plane
  const shadowReach = L * Math.cos(beta) + (L * Math.sin(beta)) / Math.max(0.02, Math.tan(profileAngleRad));
  if (shadowReach <= D) return 0;

  // Fraction of collector slant width shaded on rows 2..N
  // Using law of sines / projection onto tilted collector plane
  const overhang = shadowReach - D;
  const shadedSlant =
    (overhang * Math.sin(profileAngleRad)) /
    Math.max(0.05, Math.sin(beta + profileAngleRad));
  const rowShadedFrac = Math.min(1, Math.max(0, shadedSlant / L));

  // Front row (1 of N) is unshaded by other rows; rows 2..N are shaded
  return Number((((numRows - 1) / numRows) * rowShadedFrac).toFixed(4));
}

/**
 * Evaluate near-shading beam fraction (0..1) from explicit 3D obstacles + inter-row sheds
 * Using a 10x5 planar collector ray-cast grid against obstacle 3D volumes
 */
export function evaluateNearSceneShading(
  sunAltDeg: number,
  sunAzCompassDeg: number,
  config: SiteSimulationConfig
): {
  linearFraction: number;
  electricalFraction: number;
  rowMutualFraction: number;
  perObstacleLossPct: Record<string, number>;
  shadedCellGrid: boolean[][];
} {
  const nxSamples = 10;
  const nySamples = 5;
  const emptyGrid = (fillVal: boolean) =>
    Array.from({ length: nySamples }, () => Array(nxSamples).fill(fillVal));

  if (sunAltDeg <= 0.5) {
    return {
      linearFraction: 1,
      electricalFraction: 1,
      rowMutualFraction: 0,
      perObstacleLossPct: {},
      shadedCellGrid: emptyGrid(true),
    };
  }

  // Sun unit vector in ENU coordinates (+X = East, +Y = North, +Z = Up)
  const altRad = sunAltDeg * DEG2RAD;
  const azRad = sunAzCompassDeg * DEG2RAD;
  const sx = Math.cos(altRad) * Math.sin(azRad);
  const sy = Math.cos(altRad) * Math.cos(azRad);
  const sz = Math.sin(altRad);

  // Collector plane basis vectors
  const planeAzRad = config.azimuthCompassDeg * DEG2RAD;
  const beta = config.tiltDeg * DEG2RAD;
  const nx = Math.sin(beta) * Math.sin(planeAzRad);
  const ny = Math.sin(beta) * Math.cos(planeAzRad);
  const nz = Math.cos(beta);

  const dotSN = sx * nx + sy * ny + sz * nz;
  if (dotSN <= 0.005) {
    return {
      linearFraction: 1,
      electricalFraction: 1,
      rowMutualFraction: 0,
      perObstacleLossPct: {},
      shadedCellGrid: emptyGrid(true),
    };
  }

  const ux = Math.cos(planeAzRad);
  const uy = -Math.sin(planeAzRad);
  const vx = -Math.cos(beta) * Math.sin(planeAzRad);
  const vy = -Math.cos(beta) * Math.cos(planeAzRad);
  const vz = Math.sin(beta);

  // Horizontal row-normal direction along array pitch (North-ish when facing South)
  const rowStepX = -Math.sin(planeAzRad);
  const rowStepY = -Math.cos(planeAzRad);

  const W = Math.max(2, config.arrayWidthM);
  const L = Math.max(1, config.collectorWidthM);
  const rowsCount = Math.max(1, config.numRows);
  const layout = computeRowOffsetsAndWalkways(config);
  const mmsClearance = Math.max(0.15, config.mmsClearanceM ?? 0.35);
  const totalSamples = nxSamples * nySamples * rowsCount;

  const perObsHits: Record<string, number> = {};
  config.obstacles.forEach((o) => {
    perObsHits[o.id] = 0;
  });

  // Precompute obstacle descriptors in ENU
  const obsDescriptors = config.obstacles.map((obs) => {
    const center = getObstacleCenterENU(obs);
    const hasPolygon = Boolean(obs.nodesENU && obs.nodesENU.length >= 3);
    const shape: 'box' | 'cylinder' | 'wall' | 'polygon' = hasPolygon
      ? 'polygon'
      : obs.shape ||
        (obs.category === 'Water Tank' || obs.category === 'Tree' || obs.category === 'Pole'
          ? 'cylinder'
          : obs.category === 'Parapet'
          ? 'wall'
          : 'box');
    const rotRad = ((obs.rotationDeg ?? 0) * Math.PI) / 180;
    return {
      obs,
      shape,
      cx: center.x,
      cy: center.y,
      cosR: Math.cos(rotRad),
      sinR: Math.sin(rotRad),
      halfW: Math.max(0.15, obs.widthM / 2),
      halfD: Math.max(0.15, obs.depthM / 2),
      radius: Math.max(0.25, Math.max(obs.widthM, obs.depthM) / 2),
      heightM: Math.max(0.1, obs.heightM),
      nodesENU: obs.nodesENU,
    };
  });

  const shadedCellGrid = emptyGrid(false);
  let obstacleShadedSamples = 0;

  for (let rIdx = 0; rIdx < rowsCount; rIdx++) {
    const rowCenterOffset = layout.rowOffsetsM[rIdx] ?? 0;
    for (let ix = 0; ix < nxSamples; ix++) {
      const uOffset = ((ix + 0.5) / nxSamples - 0.5) * W;
      for (let iy = 0; iy < nySamples; iy++) {
        const vOffset = ((iy + 0.5) / nySamples) * L;
        const px = rowCenterOffset * rowStepX + uOffset * ux + vOffset * vx;
        const py = rowCenterOffset * rowStepY + uOffset * uy + vOffset * vy;
        const pz = mmsClearance + vOffset * vz;

        let pointShaded = false;

        for (const desc of obsDescriptors) {
          const tMinZ = (0 - pz) / sz;
          const tMaxZ = (desc.heightM - pz) / sz;
          const zEnter = Math.min(tMinZ, tMaxZ);
          const zExit = Math.max(tMinZ, tMaxZ);
          if (zExit <= 0.05) continue;

          if (desc.shape === 'polygon' && desc.nodesENU && desc.nodesENU.length >= 3) {
            const tStart = Math.max(0.05, zEnter);
            const tEnd = zExit;
            if (tEnd > tStart && rayIntervalHitsPolygon2D(px, py, sx, sy, tStart, tEnd, desc.nodesENU)) {
              perObsHits[desc.obs.id] += 1;
              pointShaded = true;
            }
          } else if (desc.shape === 'cylinder') {
            const dpx = px - desc.cx;
            const dpy = py - desc.cy;
            const a = sx * sx + sy * sy;
            const b = 2 * (dpx * sx + dpy * sy);
            const c = dpx * dpx + dpy * dpy - desc.radius * desc.radius;
            if (a > 1e-8) {
              const disc = b * b - 4 * a * c;
              if (disc >= 0) {
                const sqrtD = Math.sqrt(disc);
                const tEnter = Math.max(zEnter, (-b - sqrtD) / (2 * a));
                const tExit = Math.min(zExit, (-b + sqrtD) / (2 * a));
                if (tExit > Math.max(0.05, tEnter)) {
                  perObsHits[desc.obs.id] += 1;
                  pointShaded = true;
                }
              }
            }
          } else {
            // Oriented Bounding Box in obstacle local coordinates
            const dpx = px - desc.cx;
            const dpy = py - desc.cy;
            const lpx = dpx * desc.cosR - dpy * desc.sinR;
            const lpy = dpx * desc.sinR + dpy * desc.cosR;
            const lsx = sx * desc.cosR - sy * desc.sinR;
            const lsy = sx * desc.sinR + sy * desc.cosR;

            const tMinX =
              Math.abs(lsx) > 1e-5
                ? ((lsx > 0 ? -desc.halfW : desc.halfW) - lpx) / lsx
                : lpx >= -desc.halfW && lpx <= desc.halfW
                ? -Infinity
                : Infinity;
            const tMaxX =
              Math.abs(lsx) > 1e-5
                ? ((lsx > 0 ? desc.halfW : -desc.halfW) - lpx) / lsx
                : lpx >= -desc.halfW && lpx <= desc.halfW
                ? Infinity
                : -Infinity;

            const tMinY =
              Math.abs(lsy) > 1e-5
                ? ((lsy > 0 ? -desc.halfD : desc.halfD) - lpy) / lsy
                : lpy >= -desc.halfD && lpy <= desc.halfD
                ? -Infinity
                : Infinity;
            const tMaxY =
              Math.abs(lsy) > 1e-5
                ? ((lsy > 0 ? desc.halfD : -desc.halfD) - lpy) / lsy
                : lpy >= -desc.halfD && lpy <= desc.halfD
                ? Infinity
                : -Infinity;

            const tEnter = Math.max(tMinX, tMinY, zEnter);
            const tExit = Math.min(tMaxX, tMaxY, zExit);
            if (tExit > Math.max(0.05, tEnter)) {
              perObsHits[desc.obs.id] += 1;
              pointShaded = true;
            }
          }
        }

        if (pointShaded) {
          obstacleShadedSamples += 1;
          shadedCellGrid[iy][ix] = true;
        }
      }
    }
  }

  const obsLinear = obstacleShadedSamples / totalSamples;
  const rowMutualFraction = computeInterRowShadingFraction(
    sunAltDeg,
    sunAzCompassDeg,
    config.tiltDeg,
    config.azimuthCompassDeg,
    config.collectorWidthM,
    config.rowPitchM,
    config.numRows
  );

  // Combine obstacle shade and row mutual shade probabilistically (union)
  const combinedLinear = Math.min(
    1,
    1 - (1 - obsLinear) * (1 - rowMutualFraction)
  );
  const electricalFraction = computeElectricalShadingFraction(
    combinedLinear,
    config.stringTopology
  );

  const perObstacleLossPct: Record<string, number> = {};
  Object.keys(perObsHits).forEach((id) => {
    perObstacleLossPct[id] = Number(((perObsHits[id] / totalSamples) * 100).toFixed(1));
  });

  return {
    linearFraction: Number(combinedLinear.toFixed(4)),
    electricalFraction,
    rowMutualFraction,
    perObstacleLossPct,
    shadedCellGrid,
  };
}

/**
 * Evaluate instantaneous irradiance & shadow projections for a given dayOfYear + clockHour
 */
export function evaluateInstantaneousShading(
  config: SiteSimulationConfig,
  dayOfYear: number,
  clockHour: number,
  cloudCoverPercent = 15
): InstantaneousShadingState {
  const sun = computeSolarPosition(
    config.latitude,
    config.longitude,
    config.timezoneOffsetHours,
    dayOfYear,
    clockHour
  );

  const horizonElev = interpolateHorizonAngle(config.horizonProfile, sun.azimuthSouthDeg);
  const isBelowHorizon = sun.altitudeDeg <= 0 || sun.altitudeDeg <= horizonElev;
  const incidenceAngleDeg = computeIncidenceAngleDeg(
    sun.altitudeDeg,
    sun.azimuthCompassDeg,
    config.tiltDeg,
    config.azimuthCompassDeg
  );
  const isBehindPlane = incidenceAngleDeg >= 89.5;

  // Clear-sky irradiance model (Ineichen / Hottel approximation scaled by cloud cover & site elevation)
  let ghiWpm2 = 0;
  let dniWpm2 = 0;
  let dhiWpm2 = 0;

  if (sun.altitudeDeg > 0.5) {
    const altRad = sun.altitudeDeg * DEG2RAD;
    const zenithDeg = 90 - sun.altitudeDeg;
    const airMass =
      1 /
      (Math.cos(zenithDeg * DEG2RAD) +
        0.50572 * Math.pow(Math.max(96.07995 - zenithDeg, 0.1), -1.6364));
    const elevFactor = 1 + config.elevationM * 0.0001;
    const clearDni = 1367 * Math.pow(0.7, Math.pow(airMass, 0.678)) * elevFactor;
    const clearDhi = 0.12 * clearDni * Math.sin(altRad);
    const cloudTransmittance = Math.max(0.22, 1 - 0.72 * Math.pow(cloudCoverPercent / 100, 1.4));

    dniWpm2 = isBelowHorizon ? 0 : clearDni * cloudTransmittance;
    dhiWpm2 = clearDhi * (1 + 0.35 * (cloudCoverPercent / 100));
    ghiWpm2 = Math.max(0, dniWpm2 * Math.sin(altRad) + dhiWpm2);
  }

  const beta = config.tiltDeg * DEG2RAD;
  const cosTheta = Math.max(0, Math.cos(incidenceAngleDeg * DEG2RAD));
  const poaBeamUnshaded = isBehindPlane ? 0 : dniWpm2 * cosTheta;
  const poaDiffUnshaded = dhiWpm2 * ((1 + Math.cos(beta)) / 2);
  const poaReflUnshaded = ghiWpm2 * config.albedo * ((1 - Math.cos(beta)) / 2);
  const poaUnshadedWpm2 = Math.round(poaBeamUnshaded + poaDiffUnshaded + poaReflUnshaded);

  const nearEval = evaluateNearSceneShading(sun.altitudeDeg, sun.azimuthCompassDeg, config);

  // Shaded POA accounts for horizon beam cut + near beam electrical loss + slight diffuse attenuation
  const diffuseAttenuation = Math.min(0.18, nearEval.linearFraction * 0.15);
  const poaShadedWpm2 = Math.round(
    poaBeamUnshaded * (1 - nearEval.electricalFraction) +
      poaDiffUnshaded * (1 - diffuseAttenuation) +
      poaReflUnshaded * (1 - diffuseAttenuation)
  );

  // Obstacle shadow projections on horizontal site plane
  const shadowDirCompassDeg = (sun.azimuthCompassDeg + 180) % 360;
  const shadowDirRad = shadowDirCompassDeg * DEG2RAD;
  const tanAlt = Math.max(0.05, Math.tan(Math.max(2, sun.altitudeDeg) * DEG2RAD));

  const obstacleProjections = config.obstacles.map((obs) => {
    const center = getObstacleCenterENU(obs);
    const obsX = center.x;
    const obsY = center.y;
    const shape: 'box' | 'cylinder' | 'wall' | 'polygon' =
      obs.nodesENU && obs.nodesENU.length >= 3
        ? 'polygon'
        : obs.shape ||
          (obs.category === 'Water Tank' || obs.category === 'Tree' || obs.category === 'Pole'
            ? 'cylinder'
            : obs.category === 'Parapet'
            ? 'wall'
            : 'box');
    const shadowLengthM =
      sun.altitudeDeg > 0.5 ? Number((obs.heightM / tanAlt).toFixed(1)) : 0;
    const shadowVectorX =
      sun.altitudeDeg > 0.5 ? Number((shadowLengthM * Math.sin(shadowDirRad)).toFixed(2)) : 0;
    const shadowVectorY =
      sun.altitudeDeg > 0.5 ? Number((shadowLengthM * Math.cos(shadowDirRad)).toFixed(2)) : 0;
    const shadowTipX = obsX + shadowVectorX;
    const shadowTipY = obsY + shadowVectorY;
    const beamLossPct = nearEval.perObstacleLossPct[obs.id] ?? 0;

    let footprintAreaSqM = obs.widthM * obs.depthM;
    if (shape === 'polygon' && obs.nodesENU && obs.nodesENU.length >= 3) {
      let area2 = 0;
      for (let i = 0; i < obs.nodesENU.length; i++) {
        const p1 = obs.nodesENU[i];
        const p2 = obs.nodesENU[(i + 1) % obs.nodesENU.length];
        area2 += p1.x * p2.y - p2.x * p1.y;
      }
      footprintAreaSqM = Math.abs(area2) / 2;
    } else if (shape === 'cylinder') {
      const r = Math.max(0.25, Math.max(obs.widthM, obs.depthM) / 2);
      footprintAreaSqM = Math.PI * r * r;
    }

    return {
      id: obs.id,
      name: obs.name,
      category: obs.category,
      shape,
      rotationDeg: obs.rotationDeg ?? 0,
      shadowLengthM,
      shadowTipX,
      shadowTipY,
      obsX,
      obsY,
      castsShadeOnArray: beamLossPct > 0.5,
      beamLossPct,
      shadowVectorX,
      shadowVectorY,
      footprintAreaSqM: Number(footprintAreaSqM.toFixed(1)),
    };
  });

  return {
    sunAltitudeDeg: sun.altitudeDeg,
    sunAzimuthCompassDeg: sun.azimuthCompassDeg,
    sunAzimuthSouthDeg: sun.azimuthSouthDeg,
    incidenceAngleDeg: Number(incidenceAngleDeg.toFixed(1)),
    isBehindPlane,
    isBelowHorizon,
    horizonElevationAtSunDeg: Number(horizonElev.toFixed(1)),
    linearShadingFactor: nearEval.linearFraction,
    electricalShadingFactor: nearEval.electricalFraction,
    rowMutualShadingFraction: nearEval.rowMutualFraction,
    ghiWpm2: Math.round(ghiWpm2),
    poaUnshadedWpm2,
    poaShadedWpm2,
    obstacleProjections,
    shadedCellGrid: nearEval.shadedCellGrid,
  };
}

/**
 * Generate full sun-path trajectory curves for Jun 21, Mar 21, Dec 21 + hourly points
 */
export function computeAnnualSunPaths(
  latDeg: number,
  lonDeg: number,
  tzOffsetHours: number
): {
  summerSolstice: SunPoint[];
  equinox: SunPoint[];
  winterSolstice: SunPoint[];
  hourlyCurves: { hour: number; points: SunPoint[] }[];
} {
  const sampleDay = (dayOfYear: number): SunPoint[] => {
    const pts: SunPoint[] = [];
    for (let h = 4.5; h <= 19.5; h += 0.25) {
      const s = computeSolarPosition(latDeg, lonDeg, tzOffsetHours, dayOfYear, h);
      if (s.altitudeDeg >= -1) {
        pts.push({
          hour: h,
          altitudeDeg: Math.max(0, s.altitudeDeg),
          azimuthCompassDeg: s.azimuthCompassDeg,
          azimuthSouthDeg: s.azimuthSouthDeg,
        });
      }
    }
    return pts;
  };

  const hourlyCurves: { hour: number; points: SunPoint[] }[] = [];
  for (let hr = 7; hr <= 17; hr += 1) {
    const pts: SunPoint[] = [];
    for (let d = 1; d <= 365; d += 12) {
      const s = computeSolarPosition(latDeg, lonDeg, tzOffsetHours, d, hr);
      if (s.altitudeDeg > 0) {
        pts.push({
          hour: hr,
          altitudeDeg: s.altitudeDeg,
          azimuthCompassDeg: s.azimuthCompassDeg,
          azimuthSouthDeg: s.azimuthSouthDeg,
        });
      }
    }
    hourlyCurves.push({ hour: hr, points: pts });
  }

  return {
    summerSolstice: sampleDay(172),
    equinox: sampleDay(80),
    winterSolstice: sampleDay(355),
    hourlyCurves,
  };
}

/**
 * Full Annual Hourly/Half-Hourly Simulation & Shading Matrix Generator
 */
export function runAnnualShadingSimulation(
  config: SiteSimulationConfig,
  cloudCoverPercent = 18
): AnnualSimulationSummary {
  const beta = config.tiltDeg * DEG2RAD;
  const gcr = Number(
    (config.collectorWidthM / Math.max(0.5, config.rowPitchM)).toFixed(2)
  );
  const denom = config.rowPitchM - config.collectorWidthM * Math.cos(beta);
  const rowShadingLimitAngleDeg =
    denom > 0.05
      ? Number(
          (Math.atan((config.collectorWidthM * Math.sin(beta)) / denom) * RAD2DEG).toFixed(1)
        )
      : 85;

  // Optimal pitch for Winter Solstice 9 AM - 3 PM (~22° solar profile)
  const winterProfileRad = Math.max(15, 66.5 - Math.abs(config.latitude) - 10) * DEG2RAD;
  const optimalPitchWinterDegM = Number(
    (
      config.collectorWidthM * Math.cos(beta) +
      (config.collectorWidthM * Math.sin(beta)) / Math.tan(winterProfileRad)
    ).toFixed(2)
  );

  // Far Horizon Sky View Factor (diffuse obstruction across 24 azimuth bins)
  let horizonViewBlocking = 0;
  for (let i = 0; i < 24; i++) {
    const hAng = ((config.horizonProfile[i] ?? 0) + (config.horizonProfile[i + 1] ?? 0)) / 2;
    horizonViewBlocking += Math.pow(Math.sin(Math.max(0, hAng) * DEG2RAD), 2);
  }
  const farDiffuseLossRatio = Math.min(0.4, horizonViewBlocking / 24);
  const diffuseSkyViewFactor = Number((1 - farDiffuseLossRatio).toFixed(3));

  // Monthly Integration (representative day per month at 0.5h steps)
  let annualGhi = 0;
  let annualPoaUnshaded = 0;
  let annualIamLoss = 0;
  let annualFarBeamLoss = 0;
  let annualFarDiffLoss = 0;
  let annualNearLinearLoss = 0;
  let annualNearDiffLoss = 0;
  let annualElectricalExtraLoss = 0;

  // Seasonal cloud variation slightly realistic
  const cloudFactorBase = Math.max(0.35, 1 - 0.65 * Math.pow(cloudCoverPercent / 100, 1.35));

  const monthlyRows: MonthlySimulationRow[] = MONTH_NAMES.map((month, mIdx) => {
    const dayOfYear = MONTH_MID_DAYS[mIdx];
    const numDays = MONTH_DAYS[mIdx];

    let dayGhiWh = 0;
    let dayPoaWh = 0;
    let dayIamLossWh = 0;
    let dayFarBeamWh = 0;
    let dayFarDiffWh = 0;
    let dayNearLinWh = 0;
    let dayNearDiffWh = 0;
    let dayElecExtraWh = 0;

    for (let h = 5.0; h <= 19.0; h += 0.5) {
      const sun = computeSolarPosition(
        config.latitude,
        config.longitude,
        config.timezoneOffsetHours,
        dayOfYear,
        h
      );
      if (sun.altitudeDeg <= 0.5) continue;

      const altRad = sun.altitudeDeg * DEG2RAD;
      const zenithDeg = 90 - sun.altitudeDeg;
      const airMass =
        1 /
        (Math.cos(zenithDeg * DEG2RAD) +
          0.50572 * Math.pow(Math.max(96.07995 - zenithDeg, 0.1), -1.6364));
      const elevFactor = 1 + config.elevationM * 0.0001;
      const clearDni = 1367 * Math.pow(0.7, Math.pow(airMass, 0.678)) * elevFactor;
      const dni = clearDni * cloudFactorBase;
      const dhi = 0.13 * clearDni * Math.sin(altRad) * (1.1 - 0.2 * cloudFactorBase);
      const ghi = dni * Math.sin(altRad) + dhi;

      const incDeg = computeIncidenceAngleDeg(
        sun.altitudeDeg,
        sun.azimuthCompassDeg,
        config.tiltDeg,
        config.azimuthCompassDeg
      );
      const cosTheta = incDeg < 89.5 ? Math.cos(incDeg * DEG2RAD) : 0;

      // Hay-Davies transposition
      const ai = Math.min(1, dni / 1367);
      const rb = Math.min(3.5, cosTheta / Math.max(0.08, Math.sin(altRad)));
      const poaBeam = dni * cosTheta;
      const poaDiff = dhi * (ai * rb + (1 - ai) * ((1 + Math.cos(beta)) / 2));
      const poaAlbedo = ghi * config.albedo * ((1 - Math.cos(beta)) / 2);
      const poaTotal = poaBeam + poaDiff + poaAlbedo;

      // ASHRAE IAM (b0 = 0.05)
      const iamFactor =
        cosTheta > 0.08 ? Math.max(0, 1 - 0.05 * (1 / cosTheta - 1)) : 0;
      const iamLossBeam = poaBeam * (1 - iamFactor);
      const effectiveBeamAfterIam = poaBeam * iamFactor;

      // Far horizon cut
      const horElev = interpolateHorizonAngle(config.horizonProfile, sun.azimuthSouthDeg);
      const isHorBlocked = sun.altitudeDeg <= horElev;
      const farBeamLoss = isHorBlocked ? effectiveBeamAfterIam : 0;
      const beamAfterFar = effectiveBeamAfterIam - farBeamLoss;

      const farDiffLoss = poaDiff * farDiffuseLossRatio;
      const diffAfterFar = poaDiff - farDiffLoss;

      // Near shading ray projection
      const near = evaluateNearSceneShading(sun.altitudeDeg, sun.azimuthCompassDeg, config);
      const nearLinLoss = beamAfterFar * near.linearFraction;
      const nearElecTotal = beamAfterFar * near.electricalFraction;
      const nearElecExtra = Math.max(0, nearElecTotal - nearLinLoss);

      // Near-shading diffuse factor (weighted by GCR & obstacle solid angle)
      const nearDiffRatio = Math.min(0.16, farDiffuseLossRatio * 0.2 + (gcr > 0.5 ? (gcr - 0.45) * 0.08 : 0) + near.linearFraction * 0.08);
      const nearDiffLoss = (diffAfterFar + poaAlbedo) * nearDiffRatio;

      // Integrate 0.5 hour step
      dayGhiWh += ghi * 0.5;
      dayPoaWh += poaTotal * 0.5;
      dayIamLossWh += iamLossBeam * 0.5;
      dayFarBeamWh += farBeamLoss * 0.5;
      dayFarDiffWh += farDiffLoss * 0.5;
      dayNearLinWh += nearLinLoss * 0.5;
      dayNearDiffWh += nearDiffLoss * 0.5;
      dayElecExtraWh += nearElecExtra * 0.5;
    }

    const ghiKwhM2 = Number(((dayGhiWh * numDays) / 1000).toFixed(1));
    const poaUnshadedKwhM2 = Number(((dayPoaWh * numDays) / 1000).toFixed(1));
    const monthFarLossKwh = ((dayFarBeamWh + dayFarDiffWh) * numDays) / 1000;
    const monthNearLinKwh = ((dayNearLinWh + dayNearDiffWh) * numDays) / 1000;
    const monthElecExtraKwh = (dayElecExtraWh * numDays) / 1000;
    const monthIamKwh = (dayIamLossWh * numDays) / 1000;

    const effectivePoaKwhM2 = Number(
      Math.max(
        0,
        poaUnshadedKwhM2 - monthIamKwh - monthFarLossKwh - monthNearLinKwh - monthElecExtraKwh
      ).toFixed(1)
    );

    const totalShadingOnlyKwh = monthFarLossKwh + monthNearLinKwh + monthElecExtraKwh;
    const totalShadingLossPct =
      poaUnshadedKwhM2 > 0
        ? Number(Math.min(100, (totalShadingOnlyKwh / poaUnshadedKwhM2) * 100).toFixed(1))
        : 0;

    annualGhi += ghiKwhM2;
    annualPoaUnshaded += poaUnshadedKwhM2;
    annualIamLoss += monthIamKwh;
    annualFarBeamLoss += (dayFarBeamWh * numDays) / 1000;
    annualFarDiffLoss += (dayFarDiffWh * numDays) / 1000;
    annualNearLinearLoss += (dayNearLinWh * numDays) / 1000;
    annualNearDiffLoss += (dayNearDiffWh * numDays) / 1000;
    annualElectricalExtraLoss += monthElecExtraKwh;

    return {
      month,
      ghiKwhM2,
      poaUnshadedKwhM2,
      farShadingLossPct:
        poaUnshadedKwhM2 > 0
          ? Number(((monthFarLossKwh / poaUnshadedKwhM2) * 100).toFixed(1))
          : 0,
      nearLinearLossPct:
        poaUnshadedKwhM2 > 0
          ? Number(((monthNearLinKwh / poaUnshadedKwhM2) * 100).toFixed(1))
          : 0,
      electricalLossPct:
        poaUnshadedKwhM2 > 0
          ? Number(((monthElecExtraKwh / poaUnshadedKwhM2) * 100).toFixed(1))
          : 0,
      effectivePoaKwhM2,
      totalShadingLossPct,
    };
  });

  const denomPoa = Math.max(1, annualPoaUnshaded);
  const iamLossPct = Number(((annualIamLoss / denomPoa) * 100).toFixed(1));
  const farBeamLossPct = Number(((annualFarBeamLoss / denomPoa) * 100).toFixed(1));
  const farDiffuseLossPct = Number(((annualFarDiffLoss / denomPoa) * 100).toFixed(1));
  const nearBeamLinearLossPct = Number(((annualNearLinearLoss / denomPoa) * 100).toFixed(1));
  const nearDiffuseAlbedoLossPct = Number(((annualNearDiffLoss / denomPoa) * 100).toFixed(1));
  const electricalMismatchLossPct = Number(
    ((annualElectricalExtraLoss / denomPoa) * 100).toFixed(1)
  );

  const effectivePoaKwhM2 = Math.round(
    Math.max(
      0,
      annualPoaUnshaded -
        annualIamLoss -
        annualFarBeamLoss -
        annualFarDiffLoss -
        annualNearLinearLoss -
        annualNearDiffLoss -
        annualElectricalExtraLoss
    )
  );

  const totalShadingLossPct = Number(
    Math.min(
      100,
      farBeamLossPct +
        farDiffuseLossPct +
        nearBeamLinearLossPct +
        nearDiffuseAlbedoLossPct +
        electricalMismatchLossPct
    ).toFixed(1)
  );

  const shadingRetentionPct = Number(Math.max(0, 100 - totalShadingLossPct).toFixed(1));
  const transpositionFactor = Number(
    (annualPoaUnshaded / Math.max(1, annualGhi)).toFixed(3)
  );

  // Shading Factor Matrix (Azimuth rel South x Sun Elevation)
  const matrixAzimuths = [-120, -90, -60, -30, 0, 30, 60, 90, 120];
  const matrixElevations = [10, 20, 30, 45, 60, 75];

  const shadingMatrix: ShadingMatrixCell[][] = matrixElevations.map((elev) =>
    matrixAzimuths.map((azSouth) => {
      const compassAz = (azSouth + 180 + 360) % 360;
      const evalCell = evaluateNearSceneShading(elev, compassAz, config);
      return {
        azimuthRelSouthDeg: azSouth,
        elevationDeg: elev,
        linearLossPct: Math.round(evalCell.linearFraction * 100),
        electricalLossPct: Math.round(evalCell.electricalFraction * 100),
        retainedFactor: Number((1 - evalCell.electricalFraction).toFixed(2)),
      };
    })
  );

  return {
    annualGhiKwhM2: Math.round(annualGhi),
    annualPoaUnshadedKwhM2: Math.round(annualPoaUnshaded),
    transpositionFactor,
    iamLossPct,
    farBeamLossPct,
    farDiffuseLossPct,
    nearBeamLinearLossPct,
    nearDiffuseAlbedoLossPct,
    electricalMismatchLossPct,
    effectivePoaKwhM2,
    totalShadingLossPct,
    shadingRetentionPct,
    gcr,
    rowShadingLimitAngleDeg,
    optimalPitchWinterDegM,
    diffuseSkyViewFactor,
    monthlyRows,
    matrixAzimuths,
    matrixElevations,
    shadingMatrix,
  };
}

/**
 * Generate a valid ASCII AutoCAD DXF (.dxf) R12/LT2 engineering blueprint containing
 * ROOF_SLAB, SETBACK_ZONE, WALKWAYS, PV_ARRAYS, OBSTACLES, and SHADOW_PROJECTIONS layers.
 */
export function generateAutoCadDxf(
  config: SiteSimulationConfig,
  instantState: InstantaneousShadingState,
  siteName: string
): string {
  const lines: string[] = [];
  const addPoly = (
    layer: string,
    colorAci: number,
    pts: Array<{ x: number; y: number }>,
    closed = true
  ) => {
    if (pts.length < 2) return;
    lines.push('0', 'POLYLINE', '8', layer, '62', String(colorAci), '66', '1', '70', closed ? '1' : '0');
    pts.forEach((p) => {
      lines.push('0', 'VERTEX', '8', layer, '10', p.x.toFixed(3), '20', p.y.toFixed(3), '30', '0.0');
    });
    lines.push('0', 'SEQEND');
  };
  const addText = (layer: string, x: number, y: number, height: number, text: string, colorAci = 7) => {
    lines.push(
      '0',
      'TEXT',
      '8',
      layer,
      '62',
      String(colorAci),
      '10',
      x.toFixed(3),
      '20',
      y.toFixed(3),
      '30',
      '0.0',
      '40',
      height.toFixed(2),
      '1',
      text
    );
  };

  lines.push('0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC');
  lines.push('0', 'SECTION', '2', 'ENTITIES');

  const roofPoly = getHostRoofFootprintENU(config);
  const roofMetrics = computePolygonMetricsENU(roofPoly);
  const roofL = Math.max(8, roofMetrics.widthM || config.roofLengthM || config.arrayWidthM + 4);
  const roofW = Math.max(6, roofMetrics.depthM || config.roofWidthM || 14);
  const setback = Math.max(0.3, config.perimeterSetbackM ?? 0.6);
  const setbackPoly = computeInsetPolygonENU(roofPoly, setback);

  // Roof Perimeter Slab (Polygon Footprint)
  addPoly('ROOF_SLAB', 8, roofPoly, true);

  // Safety Perimeter Setback Zone (Inset Polygon)
  addPoly('SETBACK_ZONE', 2, setbackPoly, true);

  const azRad = config.azimuthCompassDeg * DEG2RAD;
  const beta = config.tiltDeg * DEG2RAD;
  const ux = Math.cos(azRad);
  const uy = -Math.sin(azRad);
  const vx = -Math.cos(beta) * Math.sin(azRad);
  const vy = -Math.cos(beta) * Math.cos(azRad);
  const stepX = -Math.sin(azRad);
  const stepY = -Math.cos(azRad);
  const layout = computeRowOffsetsAndWalkways(config);
  const W = Math.max(2, config.arrayWidthM);
  const L = Math.max(1, config.collectorWidthM);

  // PV Collector Rows
  layout.rowOffsetsM.forEach((off, idx) => {
    const rcx = off * stepX;
    const rcy = off * stepY;
    const p = (u: number, v: number) => ({
      x: rcx + u * ux + v * vx,
      y: rcy + u * uy + v * vy,
    });
    addPoly('PV_ARRAYS', 5, [p(-W / 2, 0), p(W / 2, 0), p(W / 2, L), p(-W / 2, L)], true);
    addText('DIMENSIONS', rcx, rcy, 0.35, `PV ROW ${idx + 1} (${W}x${L}m @ ${config.tiltDeg}deg)`, 4);
  });

  // Built-in O&M Walkways
  layout.walkwayAisles.forEach((aisle) => {
    const wcx = aisle.offsetM * stepX;
    const wcy = aisle.offsetM * stepY;
    const hw = (W + 1.2) / 2;
    const hd = aisle.widthM / 2;
    const p = (u: number, d: number) => ({
      x: wcx + u * ux + d * (-stepX),
      y: wcy + u * uy + d * (-stepY),
    });
    addPoly('WALKWAYS', 3, [p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)], true);
    addText('WALKWAYS', wcx, wcy, 0.28, `WALKWAY W=${aisle.widthM}m`, 3);
  });

  // Near Obstacles & Shadow Vectors
  config.obstacles.forEach((obs) => {
    const c = getObstacleCenterENU(obs);
    if (obs.nodesENU && obs.nodesENU.length >= 3) {
      addPoly('OBSTACLES', 1, obs.nodesENU, true);
    } else {
      const hw = obs.widthM / 2;
      const hd = obs.depthM / 2;
      const r = ((obs.rotationDeg ?? 0) * Math.PI) / 180;
      const cosR = Math.cos(r);
      const sinR = Math.sin(r);
      const lp = (lx: number, ly: number) => ({
        x: c.x + lx * cosR + ly * sinR,
        y: c.y - lx * sinR + ly * cosR,
      });
      addPoly('OBSTACLES', 1, [lp(-hw, -hd), lp(hw, -hd), lp(hw, hd), lp(-hw, hd)], true);
    }
    addText('DIMENSIONS', c.x, c.y, 0.3, `${obs.name} H=${obs.heightM}m`, 1);
  });

  instantState.obstacleProjections.forEach((proj) => {
    if (proj.shadowLengthM > 0.2) {
      addPoly(
        'SHADOW_PROJECTIONS',
        6,
        [
          { x: proj.obsX, y: proj.obsY },
          { x: proj.shadowTipX, y: proj.shadowTipY },
        ],
        false
      );
    }
  });

  addText(
    'DIMENSIONS',
    -roofL / 2,
    roofW / 2 + 0.8,
    0.45,
    `SOLAR SITE CAD: ${siteName} (${config.latitude.toFixed(5)}, ${config.longitude.toFixed(5)})`,
    7
  );

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

