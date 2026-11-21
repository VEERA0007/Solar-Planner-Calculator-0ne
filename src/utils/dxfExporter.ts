import {
  computeObstacleFootprintENU,
  DEFAULT_PANEL_SPACING_550W,
  PanelSpacingSpec,
  packPanelsInSegmentENU,
} from './panelArrayPackingEngine';
import {
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  computeRowOffsetsAndWalkways,
  getHostRoofFootprintENU,
  getObstacleCenterENU,
  InstantaneousShadingState,
  SiteSimulationConfig,
} from './shadingSimulationEngine';
import { PotentialPvZone } from '../types/siteSurvey';

export interface DxfRoofBoundarySegment {
  name: string;
  boundaryENU: Array<{ x: number; y: number }>;
  setbackENU?: Array<{ x: number; y: number }>;
  areaSqM?: number;
}

export interface DxfPanelArraySegment {
  name: string;
  widthM: number;
  depthM: number;
  centerX: number;
  centerY: number;
  azimuthDeg: number;
  panelWattage: number;
  panelCount: number;
  orientation: 'portrait' | 'landscape';
  segmentCornersENU: Array<{ x: number; y: number }>;
  panelsCornersENU: Array<Array<{ x: number; y: number }>>;
}

export interface DxfObstacleEntity {
  name: string;
  heightM: number;
  polygonENU: Array<{ x: number; y: number }>;
  labelPosENU: { x: number; y: number };
}

export interface DxfShadowVector {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface DxfWalkwayRect {
  label: string;
  cornersENU: Array<{ x: number; y: number }>;
  labelPosENU: { x: number; y: number };
}

export interface StandardizedDxfPayload {
  siteName: string;
  latitude: number;
  longitude: number;
  buildingHeightM?: number;
  parapetHeightM?: number;
  perimeterSetbackM?: number;
  buildingFootprintENU: Array<{ x: number; y: number }>;
  roofBoundaries?: DxfRoofBoundarySegment[];
  arraySegments?: DxfPanelArraySegment[];
  shedRowsENU?: Array<{ label: string; cornersENU: Array<{ x: number; y: number }>; centerENU: { x: number; y: number } }>;
  walkways?: DxfWalkwayRect[];
  obstacles?: DxfObstacleEntity[];
  shadowVectors?: DxfShadowVector[];
  spacingNotes?: string;
}

function sanitizeDxfText(input: string): string {
  return (input || '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim();
}

/**
 * Generates an AutoCAD R12 (AC1009) ASCII DXF document with complete HEADER, TABLES (LTYPE, LAYER, STYLE),
 * BLOCKS, and ENTITIES sections so files open cleanly in AutoCAD, BricsCAD, LibreCAD, QCAD, SketchUp, and PVsyst.
 */
export function buildStandardizedDxf(payload: StandardizedDxfPayload): string {
  const entityLines: string[] = [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const trackPt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  const addPoly = (
    layer: string,
    colorAci: number,
    pts: Array<{ x: number; y: number }>,
    closed = true,
    lineType = 'CONTINUOUS'
  ) => {
    if (pts.length < 2) return;
    entityLines.push(
      '0',
      'POLYLINE',
      '8',
      layer,
      '6',
      lineType,
      '62',
      String(colorAci),
      '66',
      '1',
      '70',
      closed ? '1' : '0'
    );
    pts.forEach((p) => {
      trackPt(p.x, p.y);
      entityLines.push('0', 'VERTEX', '8', layer, '10', p.x.toFixed(4), '20', p.y.toFixed(4), '30', '0.0000');
    });
    entityLines.push('0', 'SEQEND');
  };

  const addLine = (
    layer: string,
    colorAci: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    lineType = 'CONTINUOUS'
  ) => {
    trackPt(x1, y1);
    trackPt(x2, y2);
    entityLines.push(
      '0',
      'LINE',
      '8',
      layer,
      '6',
      lineType,
      '62',
      String(colorAci),
      '10',
      x1.toFixed(4),
      '20',
      y1.toFixed(4),
      '30',
      '0.0000',
      '11',
      x2.toFixed(4),
      '21',
      y2.toFixed(4),
      '31',
      '0.0000'
    );
  };

  const addText = (
    layer: string,
    x: number,
    y: number,
    height: number,
    text: string,
    colorAci = 7,
    rotationDeg = 0
  ) => {
    trackPt(x, y);
    entityLines.push(
      '0',
      'TEXT',
      '8',
      layer,
      '62',
      String(colorAci),
      '10',
      x.toFixed(4),
      '20',
      y.toFixed(4),
      '30',
      '0.0000',
      '40',
      Math.max(0.12, height).toFixed(3),
      '50',
      rotationDeg.toFixed(2),
      '1',
      sanitizeDxfText(text)
    );
  };

  // 1. Primary Defined Building Footprint Polygon + Edge Length Annotations
  if (payload.buildingFootprintENU.length >= 3) {
    addPoly('BUILDING_FOOTPRINT', 7, payload.buildingFootprintENU, true, 'CONTINUOUS');
    for (let i = 0; i < payload.buildingFootprintENU.length; i++) {
      const a = payload.buildingFootprintENU[i];
      const b = payload.buildingFootprintENU[(i + 1) % payload.buildingFootprintENU.length];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      if (segLen >= 0.5) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        const readableRot = rot > 90 || rot < -90 ? rot + 180 : rot;
        addText('DIMENSIONS', mx, my + 0.22, 0.28, `${segLen.toFixed(2)}m`, 7, readableRot);
      }
    }
  }

  // 2. Rooftop Segment Boundaries & Required Setbacks
  (payload.roofBoundaries || []).forEach((rb, idx) => {
    if (rb.boundaryENU.length >= 3) {
      addPoly('ROOF_BOUNDARY', 30, rb.boundaryENU, true, 'CONTINUOUS');
      if (rb.setbackENU && rb.setbackENU.length >= 3) {
        addPoly('ROOF_SETBACK', 2, rb.setbackENU, true, 'DASHED');
      }
      const cx = rb.boundaryENU.reduce((s, p) => s + p.x, 0) / rb.boundaryENU.length;
      const cy = rb.boundaryENU.reduce((s, p) => s + p.y, 0) / rb.boundaryENU.length;
      addText(
        'DIMENSIONS',
        cx,
        cy,
        0.32,
        `${rb.name || `ROOF SEG ${idx + 1}`}${rb.areaSqM ? ` (${rb.areaSqM} m2)` : ''}`,
        2
      );
    }
  });

  // 3. Drawn Panel Array Segments + Individual 550W Modules
  let totalModules = 0;
  let totalKw = 0;
  (payload.arraySegments || []).forEach((seg, idx) => {
    if (seg.segmentCornersENU.length >= 3) {
      addPoly('PANEL_SEGMENTS', 4, seg.segmentCornersENU, true, 'DASHED');
    }
    seg.panelsCornersENU.forEach((panelPts) => {
      addPoly('PV_MODULES_550W', 5, panelPts, true, 'CONTINUOUS');
    });
    totalModules += seg.panelCount;
    totalKw += (seg.panelCount * seg.panelWattage) / 1000;
    addText(
      'DIMENSIONS',
      seg.centerX,
      seg.centerY,
      0.32,
      `${seg.name || `ARRAY ${idx + 1}`}: ${seg.panelCount}x${seg.panelWattage}W (${((seg.panelCount * seg.panelWattage) / 1000).toFixed(2)}kW ${seg.orientation.toUpperCase()})`,
      4
    );
  });

  // 4. Parametric PV Shed Rows (if exported from Shadow CAD)
  (payload.shedRowsENU || []).forEach((row) => {
    addPoly('PV_MODULES_550W', 5, row.cornersENU, true, 'CONTINUOUS');
    addText('DIMENSIONS', row.centerENU.x, row.centerENU.y, 0.3, row.label, 4);
  });

  // 5. Maintenance Walkways
  (payload.walkways || []).forEach((wk) => {
    addPoly('OM_WALKWAYS', 3, wk.cornersENU, true, 'CONTINUOUS');
    addText('OM_WALKWAYS', wk.labelPosENU.x, wk.labelPosENU.y, 0.25, wk.label, 3);
  });

  // 6. Roof Obstacles & Surrounding Buildings
  (payload.obstacles || []).forEach((obs) => {
    addPoly('ROOF_OBSTACLES', 1, obs.polygonENU, true, 'CONTINUOUS');
    addText('DIMENSIONS', obs.labelPosENU.x, obs.labelPosENU.y, 0.28, `${obs.name} H=${obs.heightM}m`, 1);
  });

  // 7. Shadow Projection Vectors
  (payload.shadowVectors || []).forEach((sv) => {
    addLine('SHADOW_VECTORS', 6, sv.from.x, sv.from.y, sv.to.x, sv.to.y, 'DASHED');
  });

  if (!Number.isFinite(minX)) {
    minX = -10;
    minY = -10;
    maxX = 10;
    maxY = 10;
  }

  // 8. North Compass Arrow & Engineering Title Block outside upper-right / bottom-left extents
  const compassX = maxX + 3.0;
  const compassY = maxY - 1.0;
  addLine('DIMENSIONS', 1, compassX, compassY - 1.5, compassX, compassY + 1.5);
  addLine('DIMENSIONS', 1, compassX, compassY + 1.5, compassX - 0.45, compassY + 0.8);
  addLine('DIMENSIONS', 1, compassX, compassY + 1.5, compassX + 0.45, compassY + 0.8);
  addText('DIMENSIONS', compassX - 0.25, compassY + 1.85, 0.5, 'N', 1);

  const titleX = minX;
  const titleY = maxY + 1.4;
  addText(
    'TITLE_BLOCK',
    titleX,
    titleY + 0.9,
    0.45,
    `SOLAR ROOFTOP CAD EXPORT - ${payload.siteName} (${payload.latitude.toFixed(6)}, ${payload.longitude.toFixed(6)})`,
    7
  );
  const specLine = [
    typeof payload.buildingHeightM === 'number' ? `Bldg H: ${payload.buildingHeightM.toFixed(1)}m` : null,
    typeof payload.perimeterSetbackM === 'number' ? `Setback: ${payload.perimeterSetbackM.toFixed(2)}m` : null,
    totalModules > 0 ? `PV Fit: ${totalModules} Modules (${totalKw.toFixed(2)} kWp DC)` : null,
    payload.spacingNotes || null,
    'Units: Meters (Local ENU Origin 0,0 = Site Pin)',
  ]
    .filter(Boolean)
    .join(' | ');
  addText('TITLE_BLOCK', titleX, titleY + 0.25, 0.3, specLine, 7);

  // Pad extents slightly for DXF zoom extents
  const extMinX = (minX - 2).toFixed(3);
  const extMinY = (minY - 2).toFixed(3);
  const extMaxX = (maxX + 5).toFixed(3);
  const extMaxY = (maxY + 4).toFixed(3);

  const layers: Array<{ name: string; color: number; ltype: string }> = [
    { name: '0', color: 7, ltype: 'CONTINUOUS' },
    { name: 'BUILDING_FOOTPRINT', color: 7, ltype: 'CONTINUOUS' },
    { name: 'ROOF_BOUNDARY', color: 30, ltype: 'CONTINUOUS' },
    { name: 'ROOF_SETBACK', color: 2, ltype: 'DASHED' },
    { name: 'PANEL_SEGMENTS', color: 4, ltype: 'DASHED' },
    { name: 'PV_MODULES_550W', color: 5, ltype: 'CONTINUOUS' },
    { name: 'OM_WALKWAYS', color: 3, ltype: 'CONTINUOUS' },
    { name: 'ROOF_OBSTACLES', color: 1, ltype: 'CONTINUOUS' },
    { name: 'SHADOW_VECTORS', color: 6, ltype: 'DASHED' },
    { name: 'DIMENSIONS', color: 7, ltype: 'CONTINUOUS' },
    { name: 'TITLE_BLOCK', color: 7, ltype: 'CONTINUOUS' },
  ];

  const doc: string[] = [
    // HEADER
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER', '1', 'AC1009',
    '9', '$INSUNITS', '70', '6',
    '9', '$MEASUREMENT', '70', '1',
    '9', '$EXTMIN', '10', extMinX, '20', extMinY, '30', '0.000',
    '9', '$EXTMAX', '10', extMaxX, '20', extMaxY, '30', '0.000',
    '9', '$LIMMIN', '10', extMinX, '20', extMinY,
    '9', '$LIMMAX', '10', extMaxX, '20', extMaxY,
    '0', 'ENDSEC',

    // TABLES
    '0', 'SECTION',
    '2', 'TABLES',
    // LTYPE table
    '0', 'TABLE', '2', 'LTYPE', '70', '2',
    '0', 'LTYPE', '2', 'CONTINUOUS', '70', '0', '3', 'Solid line', '72', '65', '73', '0', '40', '0.0',
    '0', 'LTYPE', '2', 'DASHED', '70', '0', '3', 'Dashed __ __ __', '72', '65', '73', '2', '40', '0.75', '49', '0.5', '49', '-0.25',
    '0', 'ENDTAB',
    // LAYER table
    '0', 'TABLE', '2', 'LAYER', '70', String(layers.length),
  ];

  layers.forEach((lyr) => {
    doc.push('0', 'LAYER', '2', lyr.name, '70', '0', '62', String(lyr.color), '6', lyr.ltype);
  });

  doc.push(
    '0', 'ENDTAB',
    // STYLE table
    '0', 'TABLE', '2', 'STYLE', '70', '1',
    '0', 'STYLE', '2', 'STANDARD', '70', '0', '40', '0.0', '41', '1.0', '50', '0.0', '71', '0', '42', '0.3', '3', 'txt', '4', '',
    '0', 'ENDTAB',
    '0', 'ENDSEC',

    // BLOCKS
    '0', 'SECTION',
    '2', 'BLOCKS',
    '0', 'ENDSEC',

    // ENTITIES
    '0', 'SECTION',
    '2', 'ENTITIES',
    ...entityLines,
    '0', 'ENDSEC',
    '0', 'EOF'
  );

  return doc.join('\n');
}

/**
 * Helper to convert PotentialPvZone segments into packed 550W DXF array segments
 */
export function buildDxfArraySegmentsFromZones(
  zones: PotentialPvZone[],
  spacing: PanelSpacingSpec,
  roofBoundaryENU?: Array<{ x: number; y: number }>,
  setbackM = 0
): DxfPanelArraySegment[] {
  return zones
    .filter((z) => z.enabled !== false)
    .map((z) => {
      const segSpacing: PanelSpacingSpec = {
        ...spacing,
        azimuthDeg: z.azimuthDeg || spacing.azimuthDeg,
      };
      const packing = packPanelsInSegmentENU(
        {
          centerX: z.centerX,
          centerY: z.centerY,
          widthM: z.widthM,
          depthM: z.depthM,
          azimuthDeg: z.azimuthDeg || spacing.azimuthDeg,
        },
        segSpacing,
        roofBoundaryENU,
        setbackM
      );
      const rotRad = (((z.azimuthDeg || spacing.azimuthDeg || 180) - 180) * Math.PI) / 180;
      const ux = Math.cos(rotRad);
      const uy = -Math.sin(rotRad);
      const vx = Math.sin(rotRad);
      const vy = Math.cos(rotRad);
      const hw = z.widthM / 2;
      const hd = z.depthM / 2;
      const segmentCornersENU = [
        { x: z.centerX - hw * ux - hd * vx, y: z.centerY - hw * uy - hd * vy },
        { x: z.centerX + hw * ux - hd * vx, y: z.centerY + hw * uy - hd * vy },
        { x: z.centerX + hw * ux + hd * vx, y: z.centerY + hw * uy + hd * vy },
        { x: z.centerX - hw * ux + hd * vx, y: z.centerY - hw * uy + hd * vy },
      ];
      return {
        name: z.name,
        widthM: z.widthM,
        depthM: z.depthM,
        centerX: z.centerX,
        centerY: z.centerY,
        azimuthDeg: z.azimuthDeg || spacing.azimuthDeg,
        panelWattage: spacing.panelWattage || 550,
        panelCount: packing.fittedPanelsCount,
        orientation: packing.chosenOrientation,
        segmentCornersENU,
        panelsCornersENU: packing.panels.map((p) => p.cornersENU),
      };
    });
}

export function buildShadowCadDxfPayload(
  config: SiteSimulationConfig,
  instantState: InstantaneousShadingState,
  siteName: string,
  zones?: PotentialPvZone[],
  spacing: PanelSpacingSpec = DEFAULT_PANEL_SPACING_550W
): StandardizedDxfPayload {
  const roofPoly = getHostRoofFootprintENU(config);
  const roofMetrics = computePolygonMetricsENU(roofPoly);
  const setback = Math.max(0.25, config.perimeterSetbackM ?? 0.6);
  const setbackPoly = computeInsetPolygonENU(roofPoly, setback);

  const deg2rad = Math.PI / 180;
  const azRad = config.azimuthCompassDeg * deg2rad;
  const beta = config.tiltDeg * deg2rad;
  const ux = Math.cos(azRad);
  const uy = -Math.sin(azRad);
  const vx = -Math.cos(beta) * Math.sin(azRad);
  const vy = -Math.cos(beta) * Math.cos(azRad);
  const stepX = -Math.sin(azRad);
  const stepY = -Math.cos(azRad);
  const layout = computeRowOffsetsAndWalkways(config);
  const W = Math.max(2, config.arrayWidthM);
  const L = Math.max(1, config.collectorWidthM);

  const shedRowsENU = layout.rowOffsetsM.map((off, idx) => {
    const rcx = off * stepX;
    const rcy = off * stepY;
    const p = (u: number, v: number) => ({
      x: rcx + u * ux + v * vx,
      y: rcy + u * uy + v * vy,
    });
    return {
      label: `PV ROW ${idx + 1} (${W}x${L}m @ ${config.tiltDeg}deg)`,
      cornersENU: [p(-W / 2, 0), p(W / 2, 0), p(W / 2, L), p(-W / 2, L)],
      centerENU: { x: rcx, y: rcy },
    };
  });

  const walkways: DxfWalkwayRect[] = layout.walkwayAisles.map((aisle) => {
    const wcx = aisle.offsetM * stepX;
    const wcy = aisle.offsetM * stepY;
    const hw = (W + 1.2) / 2;
    const hd = aisle.widthM / 2;
    const p = (u: number, d: number) => ({
      x: wcx + u * ux + d * (-stepX),
      y: wcy + u * uy + d * (-stepY),
    });
    return {
      label: `WALKWAY W=${aisle.widthM}m`,
      cornersENU: [p(-hw, -hd), p(hw, -hd), p(hw, hd), p(-hw, hd)],
      labelPosENU: { x: wcx, y: wcy },
    };
  });

  const obstacles: DxfObstacleEntity[] = config.obstacles.map((obs) => ({
    name: obs.name,
    heightM: obs.heightM,
    polygonENU: computeObstacleFootprintENU(obs),
    labelPosENU: getObstacleCenterENU(obs),
  }));

  const shadowVectors: DxfShadowVector[] = instantState.obstacleProjections
    .filter((proj) => proj.shadowLengthM > 0.2)
    .map((proj) => ({
      from: { x: proj.obsX, y: proj.obsY },
      to: { x: proj.shadowTipX, y: proj.shadowTipY },
    }));

  const rooftopZones = zones?.filter((z) => z.zoneType === 'rooftop' && z.enabled !== false);
  const arraySegments =
    rooftopZones && rooftopZones.length > 0
      ? buildDxfArraySegmentsFromZones(rooftopZones, spacing, roofPoly, setback)
      : undefined;

  return {
    siteName: siteName || 'Solar Rooftop Site',
    latitude: config.latitude,
    longitude: config.longitude,
    buildingHeightM: config.buildingHeightM,
    parapetHeightM: config.parapetHeightM,
    perimeterSetbackM: setback,
    buildingFootprintENU: roofPoly,
    roofBoundaries: [
      {
        name: 'HOST ROOF SEGMENT',
        boundaryENU: roofPoly,
        setbackENU: setbackPoly,
        areaSqM: roofMetrics.areaSqM,
      },
    ],
    arraySegments,
    shedRowsENU: arraySegments && arraySegments.length > 0 ? undefined : shedRowsENU,
    walkways,
    obstacles,
    shadowVectors,
    spacingNotes: `Mod ${spacing.panelWattage}W | Gap ${spacing.interPanelGapMm}mm | RowGap ${spacing.interRowGapMm}mm`,
  };
}

export function exportShadowCadSiteDxf(
  config: SiteSimulationConfig,
  instantState: InstantaneousShadingState,
  siteName: string,
  zones?: PotentialPvZone[],
  spacing: PanelSpacingSpec = DEFAULT_PANEL_SPACING_550W
): string {
  return buildStandardizedDxf(buildShadowCadDxfPayload(config, instantState, siteName, zones, spacing));
}

export function downloadDxfFile(dxfContent: string, baseName: string): void {
  const safeBase = (baseName || 'solar_roof_cad').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase();
  const blob = new Blob([dxfContent], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeBase || 'solar_roof_cad'}.dxf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
