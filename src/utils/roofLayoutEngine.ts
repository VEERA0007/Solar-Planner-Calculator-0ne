/**
 * Engineering Rooftop Layout & Setback Engine
 *
 * Implements high-precision structural layout algorithms for PV arrays:
 * 1. Gap between panels (0–500 mm, mid/end-clamp inter-module spacing)
 * 2. Gap between panel rows (separately configurable, 0–2000 mm, inter-row pitch)
 * 3. Fabrication clearance at structure edges (0–500 mm, rail overhang / structure safety margin)
 * 4. Walkway width (0–1500 mm, dedicated maintenance & string access corridors)
 * 5. Roof boundary clearance (0–1500 mm, parapet / fire & wind perimeter setback)
 * 6. Obstacle clearance (0–2000 mm, safety buffer around vents, skylights, water tanks, mumty)
 * 7. Automatic portrait/landscape layout solver that evaluates both orientations,
 *    simulates exact geometric panel placement, and auto-selects the optimal layout.
 */

import {
  LayoutAnalysisResult,
  PanelOrientation,
  PanelPosition,
  RoofLayoutConfig,
  RoofObstacle,
} from '../types/solar';
import { getPanelSpecification, SolarPanelModel } from '../data/panelDatabase';

export const DEFAULT_ROOF_LAYOUT_CONFIG: RoofLayoutConfig = {
  interPanelGapMm: 25, // 25 mm mid-clamp standard (configurable 0–500 mm)
  interRowGapMm: 450, // 450 mm row pitch gap (separately configurable 0–2000 mm)
  fabricationEdgeClearanceMm: 100, // 100 mm mounting rail overhang
  walkwayWidthMm: 600, // 600 mm safety & maintenance walkway corridor
  walkwayFrequencyRows: 2, // Walkway corridor inserted every 2 rows
  roofBoundaryClearanceMm: 500, // 500 mm parapet & wind boundary setback
  obstacleClearanceMm: 500, // 500 mm obstacle clearance buffer
  orientation: 'auto',
  obstacles: [],
};

export const COMMON_ROOF_OBSTACLES: Omit<RoofObstacle, 'id'>[] = [
  {
    name: 'Overhead Water Tank',
    type: 'water_tank',
    widthM: 1.5,
    lengthM: 1.5,
    areaM2: 2.25,
    xOffsetPercent: 75,
    yOffsetPercent: 20,
  },
  {
    name: 'Mumty / Staircase Room',
    type: 'mumty_stair',
    widthM: 3.0,
    lengthM: 2.4,
    areaM2: 7.2,
    xOffsetPercent: 20,
    yOffsetPercent: 15,
  },
  {
    name: 'HVAC / AC Outdoor Unit',
    type: 'hvac',
    widthM: 1.0,
    lengthM: 0.8,
    areaM2: 0.8,
    xOffsetPercent: 60,
    yOffsetPercent: 80,
  },
  {
    name: 'Ventilation Pipe / Skylight',
    type: 'vent',
    widthM: 0.6,
    lengthM: 0.6,
    areaM2: 0.36,
    xOffsetPercent: 35,
    yOffsetPercent: 65,
  },
];

interface LayoutSimulation {
  orientation: 'portrait' | 'landscape';
  panels: PanelPosition[];
  rows: number;
  cols: number;
  panelsCount: number;
  occupiedAreaM2: number;
  walkwayAreaM2: number;
  usableAreaM2: number;
  obstacleAreaM2: number;
  obstacleBufferAreaM2: number;
  setbackAreaM2: number;
  utilizationPercent: number;
}

/**
 * Calculates roof dimensions in millimeters from total area or polygon bounding box
 */
export function deriveRoofDimensionsMm(
  areaM2: number,
  aspectRatio = 1.35
): { lengthMm: number; widthMm: number } {
  const safeAreaM2 = Math.max(5, areaM2);
  // Length (along north-south or pitch) and Width (along east-west / row)
  const widthM = Math.sqrt(safeAreaM2 * aspectRatio);
  const lengthM = safeAreaM2 / widthM;
  return {
    widthMm: Math.round(widthM * 1000),
    lengthMm: Math.round(lengthM * 1000),
  };
}

/**
 * Simulates structural array packing for a specific orientation (portrait or landscape)
 */
function simulateArrayPacking(
  orientation: 'portrait' | 'landscape',
  roofWidthMm: number,
  roofLengthMm: number,
  panelSpec: SolarPanelModel,
  config: RoofLayoutConfig
): LayoutSimulation {
  // Module physical dimensions in this orientation:
  // In portrait: moduleWidth = spec.widthMm, moduleLength = spec.lengthMm
  // In landscape: moduleWidth = spec.lengthMm, moduleLength = spec.widthMm
  const moduleWidthMm =
    orientation === 'portrait' ? panelSpec.widthMm : panelSpec.lengthMm;
  const moduleLengthMm =
    orientation === 'portrait' ? panelSpec.lengthMm : panelSpec.widthMm;

  // Total perimeter setback (roof boundary setback + fabrication rail margin)
  const edgeSetbackMm =
    config.roofBoundaryClearanceMm + config.fabricationEdgeClearanceMm;

  const usableWidthMm = Math.max(0, roofWidthMm - 2 * edgeSetbackMm);
  const usableLengthMm = Math.max(0, roofLengthMm - 2 * edgeSetbackMm);

  const totalRoofAreaM2 = (roofWidthMm * roofLengthMm) / 1000000;
  const usableRoofAreaM2 = (usableWidthMm * usableLengthMm) / 1000000;
  const setbackAreaM2 = Math.max(0, totalRoofAreaM2 - usableRoofAreaM2);

  // Obstacle bounding boxes in millimeters relative to usable area
  const obstacleBoxes = (config.obstacles || []).map((obs) => {
    const wMm = obs.widthM * 1000;
    const lMm = obs.lengthM * 1000;
    const clearanceMm = config.obstacleClearanceMm;

    // Position relative to usable area
    const centerX = ((obs.xOffsetPercent ?? 50) / 100) * usableWidthMm;
    const centerY = ((obs.yOffsetPercent ?? 50) / 100) * usableLengthMm;

    return {
      // Expanded bounding box including obstacle clearance
      minX: centerX - wMm / 2 - clearanceMm,
      maxX: centerX + wMm / 2 + clearanceMm,
      minY: centerY - lMm / 2 - clearanceMm,
      maxY: centerY + lMm / 2 + clearanceMm,
      rawAreaM2: obs.areaM2,
      bufferAreaM2:
        ((wMm + 2 * clearanceMm) * (lMm + 2 * clearanceMm)) / 1000000 - obs.areaM2,
    };
  });

  const totalObstacleRawAreaM2 = obstacleBoxes.reduce((acc, o) => acc + o.rawAreaM2, 0);
  const totalObstacleBufferAreaM2 = obstacleBoxes.reduce(
    (acc, o) => acc + Math.max(0, o.bufferAreaM2),
    0
  );

  // Array Grid Simulation
  const panels: PanelPosition[] = [];
  let currentY = 0;
  let rowIndex = 0;
  let maxColsFitted = 0;
  let totalWalkwayAreaM2 = 0;

  // Inter-module gap (0-500mm) and inter-row pitch gap (0-2000mm)
  const panelGap = Math.max(0, Math.min(500, config.interPanelGapMm));
  const rowGap = Math.max(0, Math.min(2000, config.interRowGapMm));
  const walkwayWidth = Math.max(0, Math.min(1500, config.walkwayWidthMm));

  while (currentY + moduleLengthMm <= usableLengthMm) {
    rowIndex++;
    let currentX = 0;
    let colIndex = 0;

    // Determine if next row requires a walkway corridor
    const isWalkwayRow =
      config.walkwayFrequencyRows > 0 &&
      rowIndex > 1 &&
      (rowIndex - 1) % config.walkwayFrequencyRows === 0;

    if (isWalkwayRow && walkwayWidth > 0) {
      if (currentY + walkwayWidth + moduleLengthMm <= usableLengthMm) {
        currentY += walkwayWidth;
        totalWalkwayAreaM2 += (usableWidthMm * walkwayWidth) / 1000000;
      }
    }

    while (currentX + moduleWidthMm <= usableWidthMm) {
      colIndex++;
      const panelMinX = currentX;
      const panelMaxX = currentX + moduleWidthMm;
      const panelMinY = currentY;
      const panelMaxY = currentY + moduleLengthMm;

      // Check collision with obstacles (including clearance buffer)
      const collidesWithObstacle = obstacleBoxes.some((obs) => {
        return (
          panelMinX < obs.maxX &&
          panelMaxX > obs.minX &&
          panelMinY < obs.maxY &&
          panelMaxY > obs.minY
        );
      });

      if (!collidesWithObstacle) {
        panels.push({
          id: `p-${orientation}-${rowIndex}-${colIndex}`,
          row: rowIndex,
          col: colIndex,
          xMm: panelMinX,
          yMm: panelMinY,
          widthMm: moduleWidthMm,
          lengthMm: moduleLengthMm,
          orientation,
          isWalkwayAdjacent: isWalkwayRow,
        });
      }

      currentX += moduleWidthMm + panelGap;
    }

    if (colIndex > maxColsFitted) {
      maxColsFitted = colIndex;
    }

    currentY += moduleLengthMm + rowGap;
  }

  const singlePanelAreaM2 = (panelSpec.lengthMm * panelSpec.widthMm) / 1000000;
  const occupiedAreaM2 = parseFloat((panels.length * singlePanelAreaM2).toFixed(2));
  const usableNetAreaM2 = Math.max(0, usableRoofAreaM2 - totalObstacleRawAreaM2);
  const utilizationPercent =
    totalRoofAreaM2 > 0
      ? parseFloat(((occupiedAreaM2 / totalRoofAreaM2) * 100).toFixed(1))
      : 0;

  return {
    orientation,
    panels,
    rows: rowIndex,
    cols: maxColsFitted,
    panelsCount: panels.length,
    occupiedAreaM2,
    walkwayAreaM2: parseFloat(totalWalkwayAreaM2.toFixed(2)),
    usableAreaM2: parseFloat(usableNetAreaM2.toFixed(2)),
    obstacleAreaM2: parseFloat(totalObstacleRawAreaM2.toFixed(2)),
    obstacleBufferAreaM2: parseFloat(totalObstacleBufferAreaM2.toFixed(2)),
    setbackAreaM2: parseFloat(setbackAreaM2.toFixed(2)),
    utilizationPercent,
  };
}

/**
 * Main Engineering Layout Solver:
 * Computes both Portrait and Landscape arrays, compares them, and returns
 * full layout metrics with panel coordinate maps.
 */
export function solveRooftopLayout(
  roofAreaM2: number,
  panelWattage: number,
  config: RoofLayoutConfig = DEFAULT_ROOF_LAYOUT_CONFIG,
  customDimensionsMm?: { widthMm: number; lengthMm: number }
): LayoutAnalysisResult {
  const panelSpec = getPanelSpecification(panelWattage);
  const dimensions =
    customDimensionsMm || deriveRoofDimensionsMm(roofAreaM2, 1.35);

  const portrait = simulateArrayPacking(
    'portrait',
    dimensions.widthMm,
    dimensions.lengthMm,
    panelSpec,
    config
  );

  const landscape = simulateArrayPacking(
    'landscape',
    dimensions.widthMm,
    dimensions.lengthMm,
    panelSpec,
    config
  );

  const portraitKw = parseFloat(((portrait.panelsCount * panelSpec.wattage) / 1000).toFixed(2));
  const landscapeKw = parseFloat(((landscape.panelsCount * panelSpec.wattage) / 1000).toFixed(2));

  // Determine optimal orientation (whichever fits more panels or achieves higher capacity)
  let recommended: 'portrait' | 'landscape';
  if (portrait.panelsCount > landscape.panelsCount) {
    recommended = 'portrait';
  } else if (landscape.panelsCount > portrait.panelsCount) {
    recommended = 'landscape';
  } else {
    // If counts are equal, pick orientation with higher space utilization
    recommended = portrait.utilizationPercent >= landscape.utilizationPercent ? 'portrait' : 'landscape';
  }

  // Active chosen orientation based on config
  const activeOrientation =
    config.orientation === 'auto' ? recommended : config.orientation;
  const activeSim = activeOrientation === 'portrait' ? portrait : landscape;
  const activeKw = activeOrientation === 'portrait' ? portraitKw : landscapeKw;

  const diffPanels = Math.abs(portrait.panelsCount - landscape.panelsCount);
  const baselineCount = Math.min(portrait.panelsCount, landscape.panelsCount) || 1;
  const diffPercent = parseFloat(((diffPanels / baselineCount) * 100).toFixed(1));

  return {
    orientation: activeOrientation,
    isOptimal: activeOrientation === recommended,
    panelsCount: activeSim.panelsCount,
    systemKw: activeKw,
    rows: activeSim.rows,
    cols: activeSim.cols,
    usableAreaM2: activeSim.usableAreaM2,
    occupiedAreaM2: activeSim.occupiedAreaM2,
    setbackAreaM2: activeSim.setbackAreaM2,
    walkwayAreaM2: activeSim.walkwayAreaM2,
    obstacleAreaM2: activeSim.obstacleAreaM2,
    obstacleBufferAreaM2: activeSim.obstacleBufferAreaM2,
    totalAreaM2: parseFloat(roofAreaM2.toFixed(1)),
    areaUtilizationPercent: activeSim.utilizationPercent,
    panelPositions: activeSim.panels,
    comparison: {
      portraitPanels: portrait.panelsCount,
      portraitKw,
      landscapePanels: landscape.panelsCount,
      landscapeKw,
      diffPercent,
      recommended,
    },
  };
}
