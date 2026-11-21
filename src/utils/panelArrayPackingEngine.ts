import { getPanelSpecification } from '../data/panelDatabase';
import {
  computeInsetPolygonENU,
  getObstacleCenterENU,
  isPointInPolygon2D,
  latLonToLocalMeters,
  localMetersToLatLon,
  NearObstacle,
} from './shadingSimulationEngine';

export function computeObstacleFootprintENU(obs: NearObstacle): Array<{ x: number; y: number }> {
  if (obs.nodesENU && obs.nodesENU.length >= 3) {
    return obs.nodesENU;
  }
  const c = getObstacleCenterENU(obs);
  const hw = Math.max(0.15, obs.widthM / 2);
  const hd = Math.max(0.15, obs.depthM / 2);
  const r = ((obs.rotationDeg ?? 0) * Math.PI) / 180;
  const cosR = Math.cos(r);
  const sinR = Math.sin(r);
  const lp = (lx: number, ly: number) => ({
    x: c.x + lx * cosR + ly * sinR,
    y: c.y - lx * sinR + ly * cosR,
  });
  return [lp(-hw, -hd), lp(hw, -hd), lp(hw, hd), lp(-hw, hd)];
}

export interface PanelSpacingSpec {
  panelWattage: number; // Default 550W
  interPanelGapMm: number; // Clamp gap between adjacent panels in a row (mm)
  interRowGapMm: number; // Gap between rows for tilt/maintenance (mm)
  edgeClearanceMm: number; // Margin inside drawn segment edge (mm)
  orientation: 'auto' | 'portrait' | 'landscape';
  azimuthDeg: number; // Array facing compass azimuth (180 = True South)
}

export const DEFAULT_PANEL_SPACING_550W: PanelSpacingSpec = {
  panelWattage: 550,
  interPanelGapMm: 20,
  interRowGapMm: 450,
  edgeClearanceMm: 250,
  orientation: 'auto',
  azimuthDeg: 180,
};

export interface PackedPanelCell {
  row: number;
  col: number;
  centerENU: { x: number; y: number };
  cornersENU: Array<{ x: number; y: number }>;
  widthM: number;
  lengthM: number;
}

export interface SegmentPackingResult {
  segmentAreaSqM: number;
  usableSegmentAreaSqM: number;
  fittedPanelsCount: number;
  rawGridCount: number;
  totalKw: number;
  chosenOrientation: 'portrait' | 'landscape';
  rows: number;
  cols: number;
  panelWidthM: number;
  panelLengthM: number;
  panels: PackedPanelCell[];
}

export interface ArrayRectangleSegmentInput {
  centerX: number;
  centerY: number;
  widthM: number;
  depthM: number;
  azimuthDeg?: number;
}

function packForOrientation(
  orient: 'portrait' | 'landscape',
  segment: ArrayRectangleSegmentInput,
  spacing: PanelSpacingSpec,
  clipBoundaryENU?: Array<{ x: number; y: number }>,
  obstaclePolysENU: Array<Array<{ x: number; y: number }>> = []
): SegmentPackingResult {
  const spec = getPanelSpecification(spacing.panelWattage || 550);
  const rawW = orient === 'portrait' ? spec.widthMm / 1000 : spec.lengthMm / 1000;
  const rawL = orient === 'portrait' ? spec.lengthMm / 1000 : spec.widthMm / 1000;

  const panelGapM = Math.max(0, Math.min(0.5, spacing.interPanelGapMm / 1000));
  const rowGapM = Math.max(0, Math.min(2.5, spacing.interRowGapMm / 1000));
  const edgeClearM = Math.max(0, Math.min(1.5, spacing.edgeClearanceMm / 1000));

  const segW = Math.max(0.5, segment.widthM);
  const segD = Math.max(0.5, segment.depthM);
  const usableW = Math.max(0, segW - 2 * edgeClearM);
  const usableD = Math.max(0, segD - 2 * edgeClearM);

  const segArea = Number((segW * segD).toFixed(2));
  const usableArea = Number((usableW * usableD).toFixed(2));

  // Rotate segment axes by (azimuthDeg - 180): at 180° South, local +U is East (+X), +V is North (+Y)
  const azDeg = segment.azimuthDeg ?? spacing.azimuthDeg ?? 180;
  const rotRad = ((azDeg - 180) * Math.PI) / 180;
  const ux = Math.cos(rotRad);
  const uy = -Math.sin(rotRad);
  const vx = Math.sin(rotRad);
  const vy = Math.cos(rotRad);

  const panels: PackedPanelCell[] = [];
  let rawGridCount = 0;

  if (usableW >= rawW && usableD >= rawL) {
    const cols = Math.floor((usableW + panelGapM + 1e-6) / (rawW + panelGapM));
    const rows = Math.floor((usableD + rowGapM + 1e-6) / (rawL + rowGapM));

    const spanW = cols * rawW + Math.max(0, cols - 1) * panelGapM;
    const spanD = rows * rawL + Math.max(0, rows - 1) * rowGapM;

    const startU = -spanW / 2 + rawW / 2;
    const startV = -spanD / 2 + rawL / 2;

    const hw = rawW / 2;
    const hl = rawL / 2;

    for (let r = 0; r < rows; r++) {
      const localV = startV + r * (rawL + rowGapM);
      for (let c = 0; c < cols; c++) {
        const localU = startU + c * (rawW + panelGapM);
        rawGridCount++;

        const cx = segment.centerX + localU * ux + localV * vx;
        const cy = segment.centerY + localU * uy + localV * vy;

        const cornersENU = [
          {
            x: Number((cx - hw * ux - hl * vx).toFixed(3)),
            y: Number((cy - hw * uy - hl * vy).toFixed(3)),
          },
          {
            x: Number((cx + hw * ux - hl * vx).toFixed(3)),
            y: Number((cy + hw * uy - hl * vy).toFixed(3)),
          },
          {
            x: Number((cx + hw * ux + hl * vx).toFixed(3)),
            y: Number((cy + hw * uy + hl * vy).toFixed(3)),
          },
          {
            x: Number((cx - hw * ux + hl * vx).toFixed(3)),
            y: Number((cy - hw * uy + hl * vy).toFixed(3)),
          },
        ];

        // If a defined roof segment polygon exists, verify all 4 module corners fit inside it
        if (clipBoundaryENU && clipBoundaryENU.length >= 3) {
          const allInside =
            isPointInPolygon2D(cx, cy, clipBoundaryENU) &&
            cornersENU.every((pt) => isPointInPolygon2D(pt.x, pt.y, clipBoundaryENU));
          if (!allInside) continue;
        }

        // Avoid obstacles inside the roof segment
        if (obstaclePolysENU.length > 0) {
          const hitsObs = obstaclePolysENU.some(
            (poly) =>
              poly.length >= 3 &&
              (isPointInPolygon2D(cx, cy, poly) ||
                cornersENU.some((pt) => isPointInPolygon2D(pt.x, pt.y, poly)))
          );
          if (hitsObs) continue;
        }

        panels.push({
          row: r + 1,
          col: c + 1,
          centerENU: { x: Number(cx.toFixed(3)), y: Number(cy.toFixed(3)) },
          cornersENU,
          widthM: rawW,
          lengthM: rawL,
        });
      }
    }

    const activeKw = Number(((panels.length * (spacing.panelWattage || 550)) / 1000).toFixed(2));
    return {
      segmentAreaSqM: segArea,
      usableSegmentAreaSqM: usableArea,
      fittedPanelsCount: panels.length,
      rawGridCount,
      totalKw: activeKw,
      chosenOrientation: orient,
      rows,
      cols,
      panelWidthM: rawW,
      panelLengthM: rawL,
      panels,
    };
  }

  return {
    segmentAreaSqM: segArea,
    usableSegmentAreaSqM: usableArea,
    fittedPanelsCount: 0,
    rawGridCount: 0,
    totalKw: 0,
    chosenOrientation: orient,
    rows: 0,
    cols: 0,
    panelWidthM: rawW,
    panelLengthM: rawL,
    panels: [],
  };
}

/**
 * Compute exact count & 4-corner placement of 550W (or configured Wp) solar panels inside a drawn
 * rectangle segment, accounting for mid-clamp gap, inter-row gap, edge clearance, obstacles,
 * and containment inside defined roof boundary polygons.
 */
export function packPanelsInSegmentENU(
  segment: ArrayRectangleSegmentInput,
  spacing: PanelSpacingSpec = DEFAULT_PANEL_SPACING_550W,
  roofBoundaryENU?: Array<{ x: number; y: number }>,
  roofBoundarySetbackM = 0,
  obstacles: NearObstacle[] = []
): SegmentPackingResult {
  const clipPoly =
    roofBoundaryENU && roofBoundaryENU.length >= 3
      ? roofBoundarySetbackM > 0.05
        ? computeInsetPolygonENU(roofBoundaryENU, roofBoundarySetbackM)
        : roofBoundaryENU
      : undefined;

  const obstaclePolys = obstacles
    .filter((o) => o.category !== 'Building' || (o.distanceM ?? 99) < 12)
    .map((o) => computeObstacleFootprintENU(o));

  if (spacing.orientation === 'portrait') {
    return packForOrientation('portrait', segment, spacing, clipPoly, obstaclePolys);
  }
  if (spacing.orientation === 'landscape') {
    return packForOrientation('landscape', segment, spacing, clipPoly, obstaclePolys);
  }

  const portrait = packForOrientation('portrait', segment, spacing, clipPoly, obstaclePolys);
  const landscape = packForOrientation('landscape', segment, spacing, clipPoly, obstaclePolys);

  if (portrait.fittedPanelsCount > landscape.fittedPanelsCount) return portrait;
  if (landscape.fittedPanelsCount > portrait.fittedPanelsCount) return landscape;

  // Tie-break: fewer broken rows / cleaner array compactness
  return portrait.rows <= landscape.rows ? portrait : landscape;
}

/**
 * Convert a Leaflet 2-corner box ([lat1, lon1], [lat2, lon2]) into ENU segment input
 */
export function latLonRectToSegmentENU(
  originLat: number,
  originLon: number,
  cornerA: [number, number],
  cornerB: [number, number],
  azimuthDeg = 180
): ArrayRectangleSegmentInput {
  const a = latLonToLocalMeters(originLat, originLon, cornerA[0], cornerA[1]);
  const b = latLonToLocalMeters(originLat, originLon, cornerB[0], cornerB[1]);

  // Project corner offset vector along azimuth local axes so oriented rectangles preserve drawn bounds
  const rotRad = ((azimuthDeg - 180) * Math.PI) / 180;
  const ux = Math.cos(rotRad);
  const uy = -Math.sin(rotRad);
  const vx = Math.sin(rotRad);
  const vy = Math.cos(rotRad);

  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const du = Math.abs(dx * ux + dy * uy);
  const dv = Math.abs(dx * vx + dy * vy);

  return {
    centerX: Number(((a.x + b.x) / 2).toFixed(3)),
    centerY: Number(((a.y + b.y) / 2).toFixed(3)),
    widthM: Number(Math.max(0.5, du).toFixed(2)),
    depthM: Number(Math.max(0.5, dv).toFixed(2)),
    azimuthDeg,
  };
}

/**
 * Convert ENU segment corners & packed panel cells to Leaflet [lat, lon][] polygons
 */
export function segmentAndPanelsToLatLon(
  originLat: number,
  originLon: number,
  segment: ArrayRectangleSegmentInput,
  packing: SegmentPackingResult
): {
  segmentCornersLatLon: Array<[number, number]>;
  panelPolygonsLatLon: Array<Array<[number, number]>>;
} {
  const rotRad = (((segment.azimuthDeg ?? 180) - 180) * Math.PI) / 180;
  const ux = Math.cos(rotRad);
  const uy = -Math.sin(rotRad);
  const vx = Math.sin(rotRad);
  const vy = Math.cos(rotRad);
  const hw = segment.widthM / 2;
  const hd = segment.depthM / 2;

  const segCornersENU = [
    { x: segment.centerX - hw * ux - hd * vx, y: segment.centerY - hw * uy - hd * vy },
    { x: segment.centerX + hw * ux - hd * vx, y: segment.centerY + hw * uy - hd * vy },
    { x: segment.centerX + hw * ux + hd * vx, y: segment.centerY + hw * uy + hd * vy },
    { x: segment.centerX - hw * ux + hd * vx, y: segment.centerY - hw * uy + hd * vy },
  ];

  return {
    segmentCornersLatLon: segCornersENU.map((pt) =>
      localMetersToLatLon(originLat, originLon, pt.x, pt.y)
    ),
    panelPolygonsLatLon: packing.panels.map((p) =>
      p.cornersENU.map((pt) => localMetersToLatLon(originLat, originLon, pt.x, pt.y))
    ),
  };
}
