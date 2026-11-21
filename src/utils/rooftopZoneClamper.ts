import { PotentialPvZone } from '../types/siteSurvey';
import {
  DEFAULT_PANEL_SPACING_550W,
  PanelSpacingSpec,
  packPanelsInSegmentENU,
} from './panelArrayPackingEngine';
import {
  AnnualSimulationSummary,
  NearObstacle,
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  isPointInPolygon2D,
} from './shadingSimulationEngine';

export interface DxfYieldSummaryData {
  totalPanels: number;
  panelWattage: number;
  totalCapacityKw: number;
  projectedAnnualYieldKwh: number;
  monthlyAverageKwh: number;
  specificYieldKwhPerKwp: number;
  effectivePoaKwhM2: number;
  annualPoaUnshadedKwhM2: number;
  shadingRetentionPct: number;
  grossRoofAreaSqM: number;
  usableRoofAreaSqM: number;
  co2OffsetTonnesYr: number;
  segmentsCount: number;
  orientationLabel: string;
}

/**
 * Clamp any candidate PV zone strictly inside the usable roof polygon (never outside on the ground/street).
 */
export function clampZoneToRoofFootprint(
  zone: PotentialPvZone,
  roofPolygonENU: Array<{ x: number; y: number }>,
  setbackM = 0.5
): PotentialPvZone {
  const usable =
    roofPolygonENU.length >= 3
      ? computeInsetPolygonENU(roofPolygonENU, Math.max(0.2, setbackM))
      : [];
  const targetPoly = usable.length >= 3 ? usable : roofPolygonENU;
  const metrics = computePolygonMetricsENU(targetPoly);
  const maxW = Math.max(1.2, metrics.widthM);
  const maxD = Math.max(1.2, metrics.depthM);

  const clampedW = Number(Math.min(Math.max(1.2, zone.widthM), maxW).toFixed(2));
  const clampedD = Number(Math.min(Math.max(1.2, zone.depthM), maxD).toFixed(2));

  const minAllowedX = metrics.minX + clampedW / 2;
  const maxAllowedX = metrics.maxX - clampedW / 2;
  const minAllowedY = metrics.minY + clampedD / 2;
  const maxAllowedY = metrics.maxY - clampedD / 2;

  let cx =
    minAllowedX <= maxAllowedX
      ? Math.max(minAllowedX, Math.min(maxAllowedX, zone.centerX))
      : metrics.cx;
  let cy =
    minAllowedY <= maxAllowedY
      ? Math.max(minAllowedY, Math.min(maxAllowedY, zone.centerY))
      : metrics.cy;

  // For L/U/T notched roofs, pull zone center inside polygon centroid if it landed inside a courtyard notch
  if (targetPoly.length >= 3 && !isPointInPolygon2D(cx, cy, targetPoly)) {
    cx = metrics.cx;
    cy = metrics.cy;
  }

  return {
    ...zone,
    zoneType: 'rooftop',
    centerX: Number(cx.toFixed(2)),
    centerY: Number(cy.toFixed(2)),
    widthM: clampedW,
    depthM: clampedD,
  };
}

/**
 * Generate rooftop-only solar array zones strictly inside the traced/measured roof footprint.
 * Zero off-building ground/street zones are created.
 */
export function generateRooftopZonesForFootprint(
  roofPolygonENU: Array<{ x: number; y: number }>,
  setbackM = 0.6,
  tiltDeg = 16,
  azimuthDeg = 180,
  moduleWp = 550,
  obstacles: NearObstacle[] = []
): PotentialPvZone[] {
  const usable =
    roofPolygonENU.length >= 3
      ? computeInsetPolygonENU(roofPolygonENU, Math.max(0.25, setbackM))
      : roofPolygonENU;
  const target = usable.length >= 3 ? usable : roofPolygonENU;
  const metrics = computePolygonMetricsENU(target);
  const usableW = Math.max(2.4, metrics.widthM);
  const usableD = Math.max(2.4, metrics.depthM);

  const spacing: PanelSpacingSpec = {
    ...DEFAULT_PANEL_SPACING_550W,
    panelWattage: moduleWp || 550,
    azimuthDeg,
  };

  const candidates: Array<{
    id: string;
    name: string;
    cx: number;
    cy: number;
    w: number;
    d: number;
    elev: number;
  }> = [];

  if (usableW >= 9.5 && usableD >= 8.5) {
    // South Main Bay + North-East & North-West Bays leaving space for rooftop staircase/tank
    candidates.push(
      {
        id: 'pv-zone-south',
        name: 'Zone 1: South Roof Bay',
        cx: metrics.cx,
        cy: metrics.minY + usableD * 0.27,
        w: Number(Math.min(usableW * 0.92, 14).toFixed(2)),
        d: Number(Math.min(usableD * 0.42, 5.2).toFixed(2)),
        elev: 0,
      },
      {
        id: 'pv-zone-east',
        name: 'Zone 2: East Roof Bay',
        cx: metrics.cx + usableW * 0.24,
        cy: metrics.minY + usableD * 0.74,
        w: Number(Math.min(usableW * 0.42, 7.2).toFixed(2)),
        d: Number(Math.min(usableD * 0.36, 4.4).toFixed(2)),
        elev: 0.25,
      },
      {
        id: 'pv-zone-west',
        name: 'Zone 3: West Roof Bay',
        cx: metrics.cx - usableW * 0.24,
        cy: metrics.minY + usableD * 0.74,
        w: Number(Math.min(usableW * 0.4, 6.6).toFixed(2)),
        d: Number(Math.min(usableD * 0.34, 4.2).toFixed(2)),
        elev: 0,
      }
    );
  } else {
    candidates.push({
      id: 'pv-zone-south',
      name: 'Zone 1: Main Roof Array',
      cx: metrics.cx,
      cy: metrics.cy,
      w: Number((usableW * 0.92).toFixed(2)),
      d: Number((usableD * 0.88).toFixed(2)),
      elev: 0,
    });
  }

  return candidates.map((c) => {
    const clamped = clampZoneToRoofFootprint(
      {
        id: c.id,
        name: c.name,
        zoneType: 'rooftop',
        centerX: c.cx,
        centerY: c.cy,
        widthM: c.w,
        depthM: c.d,
        tiltDeg,
        azimuthDeg,
        elevationOffsetM: c.elev,
        enabled: true,
      },
      roofPolygonENU,
      setbackM
    );

    const packing = packPanelsInSegmentENU(
      {
        centerX: clamped.centerX,
        centerY: clamped.centerY,
        widthM: clamped.widthM,
        depthM: clamped.depthM,
        azimuthDeg,
      },
      spacing,
      roofPolygonENU,
      setbackM,
      obstacles
    );

    return {
      ...clamped,
      panelCount: Math.max(1, packing.fittedPanelsCount),
    };
  });
}

/**
 * Project total annual energy yield (kWh/yr) for a specific module layout from irradiance + shading retention.
 */
export function computeLayoutYieldSummary(
  totalPanels: number,
  panelWattage: number,
  annualSummary: AnnualSimulationSummary,
  grossRoofAreaSqM: number,
  usableRoofAreaSqM: number,
  segmentsCount: number,
  orientationLabel: string,
  performanceRatio = 0.82
): DxfYieldSummaryData {
  const safePanels = Math.max(0, Math.round(totalPanels));
  const safeWp = Math.max(100, panelWattage || 550);
  const totalCapacityKw = Number(((safePanels * safeWp) / 1000).toFixed(2));

  // Effective POA (kWh/m2/yr) after IAM + horizon + near-shading * DC-AC Performance Ratio (inverter/wiring/temp)
  const specificYieldKwhPerKwp = Math.round(
    Math.max(400, annualSummary.effectivePoaKwhM2 * performanceRatio)
  );
  const projectedAnnualYieldKwh = Math.round(totalCapacityKw * specificYieldKwhPerKwp);
  const monthlyAverageKwh = Math.round(projectedAnnualYieldKwh / 12);
  const co2OffsetTonnesYr = Number(((projectedAnnualYieldKwh * 0.82) / 1000).toFixed(2));

  return {
    totalPanels: safePanels,
    panelWattage: safeWp,
    totalCapacityKw,
    projectedAnnualYieldKwh,
    monthlyAverageKwh,
    specificYieldKwhPerKwp,
    effectivePoaKwhM2: annualSummary.effectivePoaKwhM2,
    annualPoaUnshadedKwhM2: annualSummary.annualPoaUnshadedKwhM2,
    shadingRetentionPct: annualSummary.shadingRetentionPct,
    grossRoofAreaSqM: Number(Math.max(0, grossRoofAreaSqM).toFixed(1)),
    usableRoofAreaSqM: Number(Math.max(0, usableRoofAreaSqM).toFixed(1)),
    co2OffsetTonnesYr,
    segmentsCount,
    orientationLabel,
  };
}
