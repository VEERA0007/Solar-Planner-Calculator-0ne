import {
  NearObstacle,
  SiteSimulationConfig,
  computeSolarPosition,
  getObstacleCenterENU,
  isPointInPolygon2D,
} from './shadingSimulationEngine';

export interface AnnualSolarPreset {
  day: number;
  label: string;
}

export const ANNUAL_SOLAR_PRESETS: AnnualSolarPreset[] = [
  { day: 80, label: 'Mar 21' },
  { day: 172, label: 'Jun 21' },
  { day: 265, label: 'Sep 22' },
  { day: 355, label: 'Dec 21' },
];

const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Convert day-of-year (1..365) to concise readable calendar date & solar season tag.
 */
export function formatDayOfYearLabel(dayOfYear: number): string {
  const clamped = Math.max(1, Math.min(365, Math.round(dayOfYear)));
  let rem = clamped;
  let mIdx = 0;
  while (mIdx < 11 && rem > MONTH_DAYS[mIdx]) {
    rem -= MONTH_DAYS[mIdx];
    mIdx++;
  }
  const base = `${MONTH_NAMES[mIdx]} ${rem}`;
  if (Math.abs(clamped - 80) <= 1) return `${base} · Spring Equinox`;
  if (Math.abs(clamped - 172) <= 1) return `${base} · Summer Solstice`;
  if (Math.abs(clamped - 265) <= 1) return `${base} · Autumn Equinox`;
  if (Math.abs(clamped - 355) <= 1) return `${base} · Winter Solstice`;
  return `${base} (Day ${clamped})`;
}

export function formatSolarClockHour(hourDec: number): string {
  const clamped = Math.max(0, Math.min(23.99, hourDec));
  const h24 = Math.floor(clamped);
  const mins = Math.round((clamped - h24) * 60) % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${suffix}`;
}

/**
 * Compute hourly solar trajectory points for any day of year (1..365).
 */
export function computeDaySunArcPoints(
  config: SiteSimulationConfig,
  dayOfYear: number
): Array<{ altitudeDeg: number; azimuthCompassDeg: number }> {
  const pts: Array<{ altitudeDeg: number; azimuthCompassDeg: number }> = [];
  for (let h = 5.0; h <= 19.0; h += 0.5) {
    const pos = computeSolarPosition(
      config.latitude,
      config.longitude,
      config.timezoneOffsetHours,
      dayOfYear,
      h
    );
    if (pos.altitudeDeg > 0) {
      pts.push({
        altitudeDeg: pos.altitudeDeg,
        azimuthCompassDeg: pos.azimuthCompassDeg,
      });
    }
  }
  return pts;
}

/**
 * Keep only obstacles whose anchor center resides strictly inside the host rooftop polygon.
 */
export function filterObstaclesInsideRoofPolygon(
  obstacles: NearObstacle[],
  roofPolygonENU: Array<{ x: number; y: number }>
): NearObstacle[] {
  if (!roofPolygonENU || roofPolygonENU.length < 3) return [];
  return obstacles.filter((obs) => {
    if (obs.id.startsWith('osm-bldg-')) return false;
    const center = getObstacleCenterENU(obs);
    return isPointInPolygon2D(center.x, center.y, roofPolygonENU);
  });
}
