import React, { useRef, useState } from 'react';
import {
  HORIZON_AZIMUTHS_DEG,
  SunPoint,
  computeIncidenceAngleDeg,
  evaluateNearSceneShading,
  SiteSimulationConfig,
} from '../utils/shadingSimulationEngine';

interface SunPathHorizonChartProps {
  config: SiteSimulationConfig;
  sunPaths: {
    summerSolstice: SunPoint[];
    equinox: SunPoint[];
    winterSolstice: SunPoint[];
    hourlyCurves: { hour: number; points: SunPoint[] }[];
  };
  currentSunAltDeg: number;
  currentSunAzSouthDeg: number;
  onUpdateHorizonPoint: (index: number, elevationDeg: number) => void;
  showIsoShadingOverlay?: boolean;
}

export const SunPathHorizonChart: React.FC<SunPathHorizonChartProps> = ({
  config,
  sunPaths,
  currentSunAltDeg,
  currentSunAzSouthDeg,
  onUpdateHorizonPoint,
  showIsoShadingOverlay = true,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const W = 560;
  const H = 300;
  const padL = 36;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Map azimuth (-180..+180) and altitude (0..90) to SVG coords
  const xForAz = (azSouth: number) =>
    padL + ((Math.max(-180, Math.min(180, azSouth)) + 180) / 360) * plotW;
  const yForAlt = (alt: number) =>
    padT + (1 - Math.max(0, Math.min(90, alt)) / 90) * plotH;

  const toPolyline = (pts: SunPoint[]) =>
    pts
      .map((p) => `${xForAz(p.azimuthSouthDeg).toFixed(1)},${yForAlt(p.altitudeDeg).toFixed(1)}`)
      .join(' ');

  // Horizon polygon points
  const horizonCoords = HORIZON_AZIMUTHS_DEG.map((az, idx) => ({
    x: xForAz(az),
    y: yForAlt(config.horizonProfile[idx] ?? 0),
    az,
    elev: config.horizonProfile[idx] ?? 0,
    idx,
  }));

  const horizonPolygonPoints = [
    `${xForAz(-180).toFixed(1)},${yForAlt(0).toFixed(1)}`,
    ...horizonCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`),
    `${xForAz(180).toFixed(1)},${yForAlt(0).toFixed(1)}`,
  ].join(' ');

  const horizonPolylinePoints = horizonCoords
    .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
    .join(' ');

  // Collector behind-the-plane limit curve (cos(theta_i) = 0)
  const planeCutoffPoints = HORIZON_AZIMUTHS_DEG.map((azSouth) => {
    const compassAz = (azSouth + 180 + 360) % 360;
    // Find lowest altitude >= 0 where incidenceAngle < 90
    let cutAlt = 0;
    for (let a = 0; a <= 89; a += 1) {
      if (
        computeIncidenceAngleDeg(a, compassAz, config.tiltDeg, config.azimuthCompassDeg) < 90
      ) {
        cutAlt = a;
        break;
      }
      cutAlt = 90;
    }
    return `${xForAz(azSouth).toFixed(1)},${yForAlt(cutAlt).toFixed(1)}`;
  }).join(' ');

  // Pointer interaction to sculpt horizon curve directly
  const handlePointerToHorizon = (clientX: number, clientY: number, forceIdx?: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * W;
    const relY = ((clientY - rect.top) / rect.height) * H;
    const elev = Math.max(0, Math.min(60, Math.round((1 - (relY - padT) / plotH) * 90)));
    if (forceIdx !== undefined) {
      onUpdateHorizonPoint(forceIdx, elev);
      return;
    }
    const az = ((relX - padL) / plotW) * 360 - 180;
    const nearestIdx = Math.max(0, Math.min(24, Math.round((az + 180) / 15)));
    onUpdateHorizonPoint(nearestIdx, elev);
  };

  // Coarse Iso-Shading cells (every 15° azimuth x 10° elevation)
  const isoCells: { x: number; y: number; w: number; h: number; loss: number }[] = [];
  if (showIsoShadingOverlay) {
    const azStep = 15;
    const altStep = 10;
    for (let az = -180; az < 180; az += azStep) {
      for (let alt = 0; alt < 80; alt += altStep) {
        const midAzSouth = az + azStep / 2;
        const midAlt = alt + altStep / 2;
        const compassAz = (midAzSouth + 180 + 360) % 360;
        const res = evaluateNearSceneShading(midAlt, compassAz, config);
        if (res.linearFraction > 0.04) {
          isoCells.push({
            x: xForAz(az),
            y: yForAlt(alt + altStep),
            w: (azStep / 360) * plotW + 0.5,
            h: (altStep / 90) * plotH + 0.5,
            loss: res.linearFraction,
          });
        }
      }
    }
  }

  const azTicks = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const azLabels: Record<number, string> = {
    [-180]: 'N',
    [-135]: 'NE',
    [-90]: 'E',
    [-45]: 'SE',
    0: 'S',
    45: 'SW',
    90: 'W',
    135: 'NW',
    180: 'N',
  };

  return (
    <div className="w-full space-y-2">
      <div className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-2 overflow-hidden select-none">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none cursor-crosshair"
          onPointerMove={(e) => {
            if (draggingIdx !== null) {
              handlePointerToHorizon(e.clientX, e.clientY, draggingIdx);
            }
          }}
          onPointerUp={() => setDraggingIdx(null)}
          onPointerLeave={() => setDraggingIdx(null)}
          onClick={(e) => {
            if (draggingIdx === null) {
              handlePointerToHorizon(e.clientX, e.clientY);
            }
          }}
        >
          {/* Sky Dome Background */}
          <rect
            x={padL}
            y={padT}
            width={plotW}
            height={plotH}
            fill="#0b1324"
            rx="4"
          />

          {/* Iso-Shading Near-Obstacle Footprint on Sky Dome */}
          {isoCells.map((cell, i) => (
            <rect
              key={i}
              x={cell.x}
              y={cell.y}
              width={cell.w}
              height={cell.h}
              fill={
                cell.loss > 0.6
                  ? 'rgba(239, 68, 68, 0.34)'
                  : cell.loss > 0.25
                  ? 'rgba(249, 115, 22, 0.26)'
                  : 'rgba(245, 158, 11, 0.16)'
              }
            />
          ))}

          {/* Elevation Grid Lines (15° increments) */}
          {[15, 30, 45, 60, 75, 90].map((alt) => {
            const y = yForAlt(alt);
            return (
              <g key={alt}>
                <line
                  x1={padL}
                  y1={y}
                  x2={W - padR}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray={alt === 30 || alt === 60 ? undefined : '3 3'}
                />
                <text
                  x={padL - 5}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="8.5"
                  fill="#94a3b8"
                  className="font-mono"
                >
                  {alt}°
                </text>
              </g>
            );
          })}

          {/* Azimuth Vertical Grid Lines */}
          {azTicks.map((az) => {
            const x = xForAz(az);
            return (
              <g key={az}>
                <line
                  x1={x}
                  y1={padT}
                  x2={x}
                  y2={padT + plotH}
                  stroke={az === 0 ? '#334155' : '#1e293b'}
                  strokeWidth={az === 0 ? '1.2' : '1'}
                />
                <text
                  x={x}
                  y={H - 18}
                  textAnchor="middle"
                  fontSize="8.5"
                  fill={az === 0 ? '#f59e0b' : '#94a3b8'}
                  fontWeight={az === 0 ? 'bold' : 'normal'}
                  className="font-mono"
                >
                  {az}°
                </text>
                <text
                  x={x}
                  y={H - 7}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#64748b"
                  fontWeight="bold"
                >
                  {azLabels[az]}
                </text>
              </g>
            );
          })}

          {/* Behind-Collector-Plane Cutoff Zone */}
          <polyline
            points={planeCutoffPoints}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.2"
            strokeDasharray="4 3"
            opacity="0.7"
          />

          {/* Hourly Solar Time Curves */}
          {sunPaths.hourlyCurves.map((hc) => (
            <polyline
              key={hc.hour}
              points={toPolyline(hc.points)}
              fill="none"
              stroke="#475569"
              strokeWidth="0.9"
              strokeDasharray="2 2"
            />
          ))}

          {/* Summer Solstice Curve (Jun 21) */}
          <polyline
            points={toPolyline(sunPaths.summerSolstice)}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
          />

          {/* Equinox Curve (Mar 21 / Sep 21) */}
          <polyline
            points={toPolyline(sunPaths.equinox)}
            fill="none"
            stroke="#f97316"
            strokeWidth="1.8"
          />

          {/* Winter Solstice Curve (Dec 21) */}
          <polyline
            points={toPolyline(sunPaths.winterSolstice)}
            fill="none"
            stroke="#60a5fa"
            strokeWidth="2"
          />

          {/* Far Horizon Profile Polygon */}
          <polygon
            points={horizonPolygonPoints}
            fill="rgba(15, 23, 42, 0.85)"
          />
          <polyline
            points={horizonPolylinePoints}
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
          />

          {/* Draggable Horizon Breakpoints */}
          {horizonCoords.map((pt) => (
            <circle
              key={pt.idx}
              cx={pt.x}
              cy={pt.y}
              r={draggingIdx === pt.idx ? 5.5 : 3.5}
              fill={pt.elev > 0 ? '#ef4444' : '#64748b'}
              stroke="#ffffff"
              strokeWidth="1"
              className="cursor-ns-resize"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingIdx(pt.idx);
              }}
            />
          ))}

          {/* Live Sun Position Marker */}
          {currentSunAltDeg > 0 && (
            <g>
              <circle
                cx={xForAz(currentSunAzSouthDeg)}
                cy={yForAlt(currentSunAltDeg)}
                r="7"
                fill="#fde047"
                opacity="0.35"
              />
              <circle
                cx={xForAz(currentSunAzSouthDeg)}
                cy={yForAlt(currentSunAltDeg)}
                r="4"
                fill="#facc15"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Compact Legend Bar */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[10.5px] text-slate-600 dark:text-slate-400 px-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-amber-400 inline-block" /> Jun 21
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-orange-500 inline-block" /> Mar/Sep 21
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-blue-400 inline-block" /> Dec 21
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-red-500 inline-block" /> Horizon Line
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 bg-orange-500/40 border border-orange-400/50 inline-block rounded-xs" /> Near Shade Zone
          </span>
        </div>
        <span className="text-[10px] text-slate-500">
          Tap or drag red points to sculpt horizon
        </span>
      </div>
    </div>
  );
};
