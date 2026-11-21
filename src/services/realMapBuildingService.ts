import {
  NearObstacle,
  computePolygonMetricsENU,
  isPointInPolygon2D,
  latLonToLocalMeters,
} from '../utils/shadingSimulationEngine';
import {
  RealMapGroundOverlay,
  RealMapSource,
  RoofStructureType,
} from '../types/siteSurvey';

const RAD2DEG = 180 / Math.PI;

export function latLonToTileXY(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return {
    x: Math.max(0, Math.min(n - 1, x)),
    y: Math.max(0, Math.min(n - 1, y)),
  };
}

export function tileXYToLatLon(tx: number, ty: number, zoom: number): [number, number] {
  const n = Math.pow(2, zoom);
  const lon = (tx / n) * 360 - 180;
  const nRad = Math.PI - (2 * Math.PI * ty) / n;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(nRad) - Math.exp(-nRad)));
  return [lat, lon];
}

function loadCorsSafeTileImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Fetches a 3x3 grid of real high-res satellite/aerial tiles via the same-origin
 * server proxy (/api/map-tile) and stitches them into a geo-accurate Data URL + ENU bounds
 * so AutoCAD 3D and R3F Building viewports render crisp real satellite ground imagery.
 */
export async function stitchSatelliteMapTexture(
  siteLat: number,
  siteLon: number,
  source: RealMapSource = 'hybrid',
  zoom = 19
): Promise<RealMapGroundOverlay | null> {
  const safeZoom = Math.max(17, Math.min(20, Math.round(zoom)));
  const centerTile = latLonToTileXY(siteLat, siteLon, safeZoom);
  const tileSize = 256;
  const gridSpan = 3;
  const canvasSize = tileSize * gridSpan; // 768x768 px

  const canvas = document.createElement('canvas');
  canvas.width = canvasSize;
  canvas.height = canvasSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, canvasSize, canvasSize);

  const jobs: Array<Promise<{ dx: number; dy: number; img: HTMLImageElement | null }>> = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const tx = centerTile.x + dx;
      const ty = centerTile.y + dy;
      const url = `/api/map-tile?source=${encodeURIComponent(source)}&z=${safeZoom}&x=${tx}&y=${ty}`;
      jobs.push(loadCorsSafeTileImage(url).then((img) => ({ dx, dy, img })));
    }
  }

  const results = await Promise.all(jobs);
  let loadedCount = 0;
  for (const item of results) {
    if (!item.img) continue;
    loadedCount++;
    const px = (item.dx + 1) * tileSize;
    const py = (item.dy + 1) * tileSize;
    ctx.drawImage(item.img, px, py, tileSize, tileSize);
  }

  if (loadedCount === 0) {
    return null;
  }

  // Exact Web Mercator corners of the 3x3 tile mosaic
  const [nwLat, nwLon] = tileXYToLatLon(centerTile.x - 1, centerTile.y - 1, safeZoom);
  const [seLat, seLon] = tileXYToLatLon(centerTile.x + 2, centerTile.y + 2, safeZoom);

  const nwENU = latLonToLocalMeters(siteLat, siteLon, nwLat, nwLon);
  const seENU = latLonToLocalMeters(siteLat, siteLon, seLat, seLon);

  return {
    dataUrl: canvas.toDataURL('image/jpeg', 0.9),
    source,
    zoom: safeZoom,
    centerLat: siteLat,
    centerLon: siteLon,
    boundsENU: {
      minX: Number(Math.min(nwENU.x, seENU.x).toFixed(2)),
      maxX: Number(Math.max(nwENU.x, seENU.x).toFixed(2)),
      minY: Number(Math.min(nwENU.y, seENU.y).toFixed(2)),
      maxY: Number(Math.max(nwENU.y, seENU.y).toFixed(2)),
    },
    fetchedAtIso: new Date().toISOString(),
    visible: true,
    opacity: 0.92,
  };
}

export interface RawOsmBuildingDto {
  osmId: number;
  name: string;
  buildingType: string;
  heightM: number;
  levels?: number;
  roofShape?: string;
  nodesLatLon: Array<[number, number]>;
}

export interface OsmSiteBuildingsScanResult {
  ok: boolean;
  hostBuilding: {
    osmId: number;
    name: string;
    heightM: number;
    roofStructureType: RoofStructureType;
    nodesENU: Array<{ x: number; y: number }>;
    nodesLatLon: Array<[number, number]>;
    widthM: number;
    depthM: number;
    areaSqM: number;
  } | null;
  neighborBuildings: NearObstacle[];
  totalDetected: number;
  message?: string;
}

function mapOsmRoofShape(raw?: string): RoofStructureType {
  const s = (raw || '').toLowerCase();
  if (s === 'gabled' || s === 'hipped' || s === 'pyramidal' || s === 'gambrel') {
    return 'gabled';
  }
  if (s === 'skillion' || s === 'shed' || s === 'lean_to') {
    return 'shed_slope';
  }
  return 'rcc_flat';
}

/**
 * Fetches real building footprints from OpenStreetMap Overpass via /api/osm-buildings,
 * identifies the host building containing (siteLat, siteLon) if mapped, and returns
 * surrounding neighbor buildings formatted cleanly as polygon NearObstacles.
 */
export async function fetchSurroundingOsmBuildings(
  siteLat: number,
  siteLon: number,
  radiusM = 95,
  hostBuildingHeightM = 5.4
): Promise<OsmSiteBuildingsScanResult> {
  try {
    const resp = await fetch(
      `/api/osm-buildings?lat=${encodeURIComponent(siteLat.toFixed(6))}&lon=${encodeURIComponent(
        siteLon.toFixed(6)
      )}&radius=${Math.round(radiusM)}`
    );
    const data = (await resp.json()) as {
      ok?: boolean;
      buildings?: RawOsmBuildingDto[];
      message?: string;
    };

    const rawList = Array.isArray(data.buildings) ? data.buildings : [];
    if (rawList.length === 0) {
      return {
        ok: Boolean(data.ok),
        hostBuilding: null,
        neighborBuildings: [],
        totalDetected: 0,
        message:
          data.message ||
          'No OpenStreetMap building outlines found in 95m radius — use Roof Poly or Building Nodes to trace manually from the Satellite Map.',
      };
    }

    const projected = rawList.map((b) => {
      const nodesENU = b.nodesLatLon.map(([lt, ln]) => {
        const p = latLonToLocalMeters(siteLat, siteLon, lt, ln);
        return { x: Number(p.x.toFixed(2)), y: Number(p.y.toFixed(2)) };
      });
      const metrics = computePolygonMetricsENU(nodesENU);
      const distToOrigin = Math.hypot(metrics.cx, metrics.cy);
      const containsOrigin = isPointInPolygon2D(0, 0, nodesENU);
      return { raw: b, nodesENU, metrics, distToOrigin, containsOrigin };
    });

    // Host building: one containing (0, 0) or within 7.5m of site origin
    let hostIdx = projected.findIndex((item) => item.containsOrigin);
    if (hostIdx === -1) {
      let bestDist = 7.5;
      projected.forEach((item, idx) => {
        if (item.distToOrigin < bestDist && item.metrics.areaSqM >= 16) {
          bestDist = item.distToOrigin;
          hostIdx = idx;
        }
      });
    }

    let hostBuilding: OsmSiteBuildingsScanResult['hostBuilding'] = null;
    const neighborBuildings: NearObstacle[] = [];
    const safeHostH = Math.max(2.5, hostBuildingHeightM || 5.4);

    projected.forEach((item, idx) => {
      if (idx === hostIdx) {
        hostBuilding = {
          osmId: item.raw.osmId,
          name: item.raw.name,
          heightM: item.raw.heightM,
          roofStructureType: mapOsmRoofShape(item.raw.roofShape),
          nodesENU: item.nodesENU,
          nodesLatLon: item.raw.nodesLatLon,
          widthM: item.metrics.widthM,
          depthM: item.metrics.depthM,
          areaSqM: item.metrics.areaSqM,
        };
        return;
      }

      // Skip huge regional outlines far bigger than realistic shading context
      if (item.metrics.widthM > 140 && item.metrics.depthM > 140) return;

      const bearingDeg = Math.round(
        ((Math.atan2(item.metrics.cx, item.metrics.cy) * RAD2DEG) + 360) % 360
      );
      const effectiveAboveRoofH = Math.max(
        0.2,
        Number((item.raw.heightM - safeHostH).toFixed(1))
      );
      neighborBuildings.push({
        id: `osm-bldg-${item.raw.osmId}`,
        name: item.raw.name,
        category: 'Building',
        shape: 'polygon',
        nodesENU: item.nodesENU,
        nodesLatLon: item.raw.nodesLatLon,
        heightM: effectiveAboveRoofH,
        totalHeightFromGroundM: Number(Math.max(2.5, item.raw.heightM).toFixed(1)),
        widthM: item.metrics.widthM,
        depthM: item.metrics.depthM,
        distanceM: Number(Math.max(1, item.distToOrigin).toFixed(1)),
        bearingDeg,
        offsetX: item.metrics.cx,
        offsetY: item.metrics.cy,
        rotationDeg: 0,
      });
    });

    return {
      ok: true,
      hostBuilding,
      neighborBuildings: neighborBuildings.slice(0, 18),
      totalDetected: rawList.length,
    };
  } catch {
    return {
      ok: false,
      hostBuilding: null,
      neighborBuildings: [],
      totalDetected: 0,
      message: 'Could not reach OpenStreetMap building service. Verify connection or add obstacles manually.',
    };
  }
}
