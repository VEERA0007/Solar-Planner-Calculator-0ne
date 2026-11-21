import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Compass,
  Sun,
  X,
  Sparkles,
  Smartphone,
  RotateCw,
  Sliders,
  Check,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { calculateDetailedSunAngles } from '../utils/solarMath';

export interface FloatingSolarCompassProps {
  azimuthDeg: number;
  cardinalDirection: string;
  ridgeAngleDeg?: number;
  deviationFromSouthDeg?: number;
  solarEfficiencyPercent: number;
  isShapeDefined: boolean;
  pointsCount: number;
  latitude?: number;
  longitude?: number;
  onAzimuthChange?: (azimuth: number) => void;
  onRecenterNorth?: () => void;
}

export function getCardinalFromAzimuth(deg: number): string {
  const directions = [
    'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
    'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
  ];
  const normalized = ((deg % 360) + 360) % 360;
  const index = Math.round(normalized / 22.5) % 16;
  return directions[index];
}

export function calculateEfficiencyForAzimuth(azimuth: number, latitude = 17.41) {
  const isNorthernHemisphere = latitude >= 0;
  const optimalAzimuth = isNorthernHemisphere ? 180 : 0;
  let dev = Math.abs(azimuth - optimalAzimuth);
  if (dev > 180) dev = 360 - dev;

  const penalty = (dev / 90) * 8.0;
  const efficiency = Math.max(72, Math.min(99.6, parseFloat((100 - penalty).toFixed(1))));

  let grade = 'Optimal Solar Orientation';
  let color = 'text-emerald-400';
  let badgeBg = 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300';

  if (dev <= 30) {
    grade = 'Optimal Solar Alignment (Peak Sun)';
    color = 'text-emerald-400';
    badgeBg = 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300';
  } else if (dev <= 65) {
    grade = 'Good Sun Exposure (SE / SW Angle)';
    color = 'text-amber-400';
    badgeBg = 'bg-amber-950/90 border-amber-500/50 text-amber-300';
  } else if (dev <= 105) {
    grade = 'Moderate (Morning / Evening Peak)';
    color = 'text-sky-400';
    badgeBg = 'bg-sky-950/90 border-sky-500/50 text-sky-300';
  } else {
    grade = 'Suboptimal (Northward Slope)';
    color = 'text-rose-400';
    badgeBg = 'bg-rose-950/90 border-rose-500/50 text-rose-300';
  }

  return { efficiency, grade, color, badgeBg, deviationFromSouth: Math.round(dev) };
}

export const FloatingSolarCompass: React.FC<FloatingSolarCompassProps> = ({
  azimuthDeg: initialAzimuthDeg,
  cardinalDirection: initialCardinal,
  ridgeAngleDeg = 90,
  deviationFromSouthDeg = 0,
  solarEfficiencyPercent,
  isShapeDefined,
  pointsCount,
  latitude = 17.41,
  longitude = 78.44,
  onAzimuthChange,
  onRecenterNorth,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [rotationMode, setRotationMode] = useState<'needle' | 'dial'>('needle');

  // Interactive Azimuth State (allows user to drag dial or pick preset orientation)
  const [internalAzimuth, setInternalAzimuth] = useState<number>(() => {
    return initialAzimuthDeg ?? 180;
  });
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Phone Gyro / Magnetometer Orientation
  const [useDeviceCompass, setUseDeviceCompass] = useState<boolean>(false);
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);
  const [compassPermissionState, setCompassPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const dialSvgRef = useRef<SVGSVGElement | null>(null);

  // Sync when parent azimuth updates and user hasn't overridden
  useEffect(() => {
    if (!isManualOverride && isShapeDefined && initialAzimuthDeg !== undefined) {
      setInternalAzimuth(initialAzimuthDeg);
    }
  }, [initialAzimuthDeg, isShapeDefined, isManualOverride]);

  // Live Sun Astronomical Calculations (Azimuth + Altitude)
  const [sunData, setSunData] = useState(() => {
    try {
      return calculateDetailedSunAngles(latitude, longitude, new Date());
    } catch {
      return {
        azimuthDeg: 152,
        altitudeDeg: 54,
        cardinalDirection: 'SSE',
        isDaytime: true,
      };
    }
  });

  // Re-calculate sun position every 60 seconds
  useEffect(() => {
    const updateSun = () => {
      try {
        const angles = calculateDetailedSunAngles(latitude, longitude, new Date());
        setSunData(angles);
      } catch (err) {
        console.error('Error calculating sun angles:', err);
      }
    };
    updateSun();
    const timer = setInterval(updateSun, 60000);
    return () => clearInterval(timer);
  }, [latitude, longitude]);

  // Handle Device Orientation (Phone Compass on Android / iOS)
  useEffect(() => {
    if (!useDeviceCompass) return;

    const handleOrientation = (e: DeviceOrientationEvent) => {
      let heading: number | null = null;
      // WebKit compass heading (iOS / Safari)
      if ((e as any).webkitCompassHeading !== undefined && (e as any).webkitCompassHeading !== null) {
        heading = (e as any).webkitCompassHeading;
      } else if (e.alpha !== null && e.alpha !== undefined) {
        // Standard Android / Chrome heading
        // alpha: 0 is North, increases counter-clockwise or clockwise depending on device
        heading = (360 - e.alpha) % 360;
      }

      if (heading !== null && !isNaN(heading)) {
        const rounded = Math.round(heading);
        setDeviceHeading(rounded);
        setInternalAzimuth(rounded);
        setIsManualOverride(true);
        if (onAzimuthChange) {
          onAzimuthChange(rounded);
        }
      }
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
    };
  }, [useDeviceCompass, onAzimuthChange]);

  const toggleDeviceCompass = async () => {
    if (useDeviceCompass) {
      setUseDeviceCompass(false);
      return;
    }

    // Check for iOS 13+ permission request
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as any).requestPermission === 'function'
    ) {
      try {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission === 'granted') {
          setCompassPermissionState('granted');
          setUseDeviceCompass(true);
        } else {
          setCompassPermissionState('denied');
        }
      } catch (err) {
        console.warn('Device orientation permission rejected:', err);
      }
    } else {
      // Android / standard browser
      setCompassPermissionState('granted');
      setUseDeviceCompass(true);
    }
  };

  // Active azimuth: either user set, device compass, or shape derived
  const activeAzimuth = internalAzimuth;
  const activeCardinal = getCardinalFromAzimuth(activeAzimuth);

  // Efficiency metrics derived from current azimuth
  const effAnalysis = useMemo(() => {
    if (isShapeDefined && !isManualOverride) {
      return {
        efficiency: solarEfficiencyPercent,
        grade: deviationFromSouthDeg <= 30
          ? 'Optimal Solar Alignment'
          : deviationFromSouthDeg <= 65
          ? 'Good Sun Exposure (SE/SW)'
          : deviationFromSouthDeg <= 105
          ? 'Moderate Exposure'
          : 'Suboptimal (Northward Slope)',
        color: deviationFromSouthDeg <= 30 ? 'text-emerald-400' : deviationFromSouthDeg <= 65 ? 'text-amber-400' : 'text-sky-400',
        badgeBg: deviationFromSouthDeg <= 30 ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300' : 'bg-amber-950/90 border-amber-500/50 text-amber-300',
        deviationFromSouth: deviationFromSouthDeg,
      };
    }
    return calculateEfficiencyForAzimuth(activeAzimuth, latitude);
  }, [isShapeDefined, isManualOverride, solarEfficiencyPercent, deviationFromSouthDeg, activeAzimuth, latitude]);

  const isNorthernHemisphere = latitude >= 0;
  const optimalCardinal = isNorthernHemisphere ? 'South (180°)' : 'North (0°)';

  // Rotation angles:
  // In 'needle' mode: compass dial stays fixed (N at 0° top), needle rotates to activeAzimuth
  // In 'dial' mode: entire dial rotates by -activeAzimuth so roof facing is at top
  const needleRotation = rotationMode === 'needle' ? activeAzimuth : 0;
  const dialRotation = rotationMode === 'dial' ? -activeAzimuth : 0;

  // Handle pointer/touch drag rotation on the dial
  const updateAngleFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!dialSvgRef.current) return;
      const rect = dialSvgRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      const dx = clientX - centerX;
      const dy = clientY - centerY;

      // Calculate angle in degrees from center (0° is North / straight up)
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
      if (angle < 0) angle += 360;
      angle = Math.round(angle) % 360;

      // Snap to major cardinal points if close (within 4 degrees)
      if (Math.abs(angle - 0) <= 4 || Math.abs(angle - 360) <= 4) angle = 0;
      else if (Math.abs(angle - 90) <= 4) angle = 90;
      else if (Math.abs(angle - 180) <= 4) angle = 180;
      else if (Math.abs(angle - 270) <= 4) angle = 270;

      setInternalAzimuth(angle);
      setIsManualOverride(true);
      if (useDeviceCompass) setUseDeviceCompass(false);

      if (onAzimuthChange) {
        onAzimuthChange(angle);
      }
    },
    [onAzimuthChange, useDeviceCompass]
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateAngleFromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    e.stopPropagation();
    updateAngleFromPointer(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      e.stopPropagation();
      setIsDragging(false);
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  const handlePresetAzimuth = (deg: number) => {
    const safeDeg = (deg % 360 + 360) % 360;
    setInternalAzimuth(safeDeg);
    setIsManualOverride(true);
    if (useDeviceCompass) setUseDeviceCompass(false);
    if (onAzimuthChange) {
      onAzimuthChange(safeDeg);
    }
  };

  const handleResetToTrace = () => {
    setIsManualOverride(false);
    if (initialAzimuthDeg !== undefined) {
      setInternalAzimuth(initialAzimuthDeg);
      if (onAzimuthChange) onAzimuthChange(initialAzimuthDeg);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1 select-none">
      {/* 1. Main Floating Compass HUD Disc */}
      <div
        className="group relative bg-slate-900/95 hover:bg-slate-900 backdrop-blur-md border border-slate-700/80 hover:border-amber-400/70 p-2 rounded-2xl shadow-2xl transition duration-200 flex flex-col items-center gap-1 min-w-[82px]"
        title="Interactive Solar Compass • Touch and drag dial to rotate, or tap header to expand"
      >
        {/* Header Tag / True North Pill & Expand Toggle */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="flex items-center justify-between w-full px-1 cursor-pointer"
        >
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
            <span className="text-[9px] font-mono font-bold text-red-400">N 0°</span>
          </div>
          <div className="flex items-center gap-1">
            {useDeviceCompass && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" title="Phone Compass Active" />
            )}
            <span className="text-[9px] font-semibold text-slate-400 group-hover:text-amber-300 transition">
              {isExpanded ? '▲' : '▼'}
            </span>
          </div>
        </div>

        {/* Dynamic SVG Compass Dial with Direct Touch / Drag Rotation */}
        <div
          className={`relative w-[72px] h-[72px] flex items-center justify-center my-0.5 cursor-grab active:cursor-grabbing touch-none ${
            isDragging ? 'ring-2 ring-amber-400 rounded-full' : ''
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          title="Drag dial with finger or mouse to rotate compass"
        >
          <svg
            ref={dialSvgRef}
            viewBox="0 0 100 100"
            className="w-full h-full drop-shadow-md select-none"
            style={{
              transform: `rotate(${dialRotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            {/* Outer Bezel */}
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="#0B132B"
              stroke={isDragging ? '#F59E0B' : '#334155'}
              strokeWidth="2.5"
            />
            {/* Inner Ring */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="#0F172A"
              stroke="#1E293B"
              strokeWidth="1.5"
            />

            {/* Optimal Solar Sector (Southern arc 150° to 210° highlight) */}
            {isNorthernHemisphere && (
              <path
                d="M 50 50 L 30 84.6 A 40 40 0 0 0 70 84.6 Z"
                fill="#F59E0B"
                fillOpacity="0.18"
              />
            )}

            {/* Compass Degree Ticks (Every 30 degrees) */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => {
              const isMajor = deg % 90 === 0;
              const rad = (deg - 90) * (Math.PI / 180);
              const r1 = 40;
              const r2 = isMajor ? 31 : 35;
              const x1 = 50 + r1 * Math.cos(rad);
              const y1 = 50 + r1 * Math.sin(rad);
              const x2 = 50 + r2 * Math.cos(rad);
              const y2 = 50 + r2 * Math.sin(rad);
              return (
                <line
                  key={deg}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isMajor ? '#94A3B8' : '#475569'}
                  strokeWidth={isMajor ? '2' : '1'}
                />
              );
            })}

            {/* True North Indicator (Red Arrow at top 0°) */}
            <polygon points="50,11 46,20 54,20" fill="#EF4444" />
            <text
              x="50"
              y="26"
              fill="#EF4444"
              fontSize="8.5"
              fontWeight="900"
              textAnchor="middle"
              fontFamily="monospace"
            >
              N
            </text>

            {/* True South Indicator (Gold Sun at bottom 180°) */}
            <circle cx="50" cy="85" r="3.5" fill="#F59E0B" />
            <text
              x="50"
              y="79"
              fill="#F59E0B"
              fontSize="8.5"
              fontWeight="900"
              textAnchor="middle"
              fontFamily="monospace"
            >
              S
            </text>

            {/* East & West Markers */}
            <text
              x="87"
              y="53"
              fill="#64748B"
              fontSize="7"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              E
            </text>
            <text
              x="13"
              y="53"
              fill="#64748B"
              fontSize="7"
              fontWeight="bold"
              textAnchor="middle"
              fontFamily="sans-serif"
            >
              W
            </text>

            {/* Live Real-time Astronomical Sun Ray & Indicator */}
            {sunData && sunData.isDaytime && (
              <g
                style={{
                  transform: `rotate(${sunData.azimuthDeg}deg)`,
                  transformOrigin: '50px 50px',
                }}
              >
                {/* Sun Beam */}
                <line
                  x1="50"
                  y1="50"
                  x2="50"
                  y2="10"
                  stroke="#FBBF24"
                  strokeWidth="1.2"
                  strokeDasharray="2 2"
                  opacity="0.8"
                />
                {/* Sun Disk on Bezel */}
                <circle cx="50" cy="10" r="3" fill="#F59E0B" stroke="#FFF" strokeWidth="1" />
              </g>
            )}

            {/* Roof Ridge Axis Guide (Perpendicular to roof slope) */}
            {isShapeDefined && (
              <line
                x1="22"
                y1="50"
                x2="78"
                y2="50"
                stroke="#00F0FF"
                strokeWidth="1.5"
                strokeDasharray="2 2"
                style={{
                  transform: `rotate(${needleRotation}deg)`,
                  transformOrigin: '50px 50px',
                  transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
                }}
              />
            )}

            {/* Dynamic Interactive Orientation & Solar Azimuth Needle */}
            <g
              style={{
                transform: `rotate(${needleRotation}deg)`,
                transformOrigin: '50px 50px',
                transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            >
              {/* Sun-facing Spearhead (Points in direction roof faces) */}
              <polygon
                points="50,13 44,50 50,45"
                fill="#FF6F00"
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.5))"
              />
              <polygon
                points="50,13 56,50 50,45"
                fill="#FBBF24"
                filter="drop-shadow(0 1px 2px rgba(0,0,0,0.5))"
              />

              {/* Counter-tail (Back side of slope) */}
              <polygon points="50,87 45,50 50,55" fill="#334155" />
              <polygon points="50,87 55,50 50,55" fill="#475569" />

              {/* Sun icon glyph on the active tip */}
              <circle cx="50" cy="18" r="3" fill="#FFFFFF" stroke="#F59E0B" strokeWidth="1" />
            </g>

            {/* Center Pivot Jewel */}
            <circle cx="50" cy="50" r="5" fill="#0F172A" stroke="#F59E0B" strokeWidth="2" />
            <circle cx="50" cy="50" r="2.5" fill="#FBBF24" />
          </svg>
        </div>

        {/* Dynamic Azimuth / Orientation Readout */}
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="flex flex-col items-center leading-tight cursor-pointer w-full text-center"
        >
          <div className="flex items-center gap-0.5 justify-center">
            <span className="text-[11px] font-mono font-extrabold text-amber-400">
              {activeAzimuth}° {activeCardinal}
            </span>
          </div>
          <span className={`text-[8.5px] font-bold ${effAnalysis.color}`}>
            {effAnalysis.efficiency}% Yield
          </span>
          <span className="text-[7.5px] text-slate-400">
            {isDragging ? 'Dragging...' : isManualOverride ? 'Manual Dial' : isShapeDefined ? 'From Roof' : 'Tap to expand'}
          </span>
        </div>
      </div>

      {/* 2. Expandable Solar Alignment & True North Intelligence Card */}
      {isExpanded && (
        <div className="w-80 bg-slate-900/98 backdrop-blur-xl border border-amber-500/40 rounded-2xl shadow-2xl p-3.5 space-y-3 animate-fade-in z-30 max-h-[80vh] overflow-y-auto">
          {/* Top Title & Close Button */}
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <div className="flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-amber-400" />
              <div>
                <span className="text-xs font-bold text-white tracking-tight block">
                  Solar Orientation & True North
                </span>
                <span className="text-[9px] text-slate-400">
                  Drag dial or tap angles to test panel alignment
                </span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="w-6 h-6 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Efficiency Summary Banner */}
          <div className={`p-2.5 rounded-xl border ${effAnalysis.badgeBg} flex items-center justify-between`}>
            <div>
              <span className="text-[9px] uppercase tracking-wider block font-bold text-slate-400">
                Solar Exposure Status
              </span>
              <span className="text-xs font-extrabold text-white">
                {effAnalysis.grade}
              </span>
              <span className="text-[9px] block text-slate-300">
                Facing {activeAzimuth}° {activeCardinal}
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-mono font-black text-amber-400">
                {effAnalysis.efficiency}%
              </span>
              <span className="text-[8.5px] block text-slate-400">Annual Yield</span>
            </div>
          </div>

          {/* Real-time Astronomical Sun Tracking Card */}
          {sunData && (
            <div className="bg-slate-950/90 p-2.5 rounded-xl border border-amber-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-400">
                  <Sun className="w-4 h-4 animate-spin-slow" />
                </div>
                <div>
                  <span className="text-[9.5px] font-bold text-amber-300 block">
                    Current Sun Position
                  </span>
                  <span className="text-[11px] font-mono text-white font-bold">
                    Az: {Math.round(sunData.azimuthDeg)}° {sunData.cardinalDirection} • Alt: {Math.round(sunData.altitudeDeg)}°
                  </span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handlePresetAzimuth(Math.round(sunData.azimuthDeg));
                }}
                className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition cursor-pointer"
                title="Align dial with current real-time Sun position"
              >
                Track Sun
              </button>
            </div>
          )}

          {/* Interactive Dial Angle Scrub Slider */}
          <div className="bg-slate-950/80 p-2.5 rounded-xl border border-slate-800 space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px]">
              <span className="text-slate-300 font-bold flex items-center gap-1">
                <Sliders className="w-3 h-3 text-amber-400" />
                Dial Orientation Angle:
              </span>
              <span className="font-mono font-extrabold text-amber-400 text-xs">
                {activeAzimuth}° {activeCardinal}
              </span>
            </div>

            <input
              type="range"
              min="0"
              max="359"
              value={activeAzimuth}
              onChange={(e) => handlePresetAzimuth(parseInt(e.target.value, 10))}
              className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />

            {/* Micro Adjustment Stepper Buttons */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                {[-15, -5, +5, +15].map((step) => (
                  <button
                    key={step}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePresetAzimuth(activeAzimuth + step);
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[9.5px] font-mono font-bold transition cursor-pointer"
                  >
                    {step > 0 ? `+${step}°` : `${step}°`}
                  </button>
                ))}
              </div>

              {isShapeDefined && isManualOverride && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleResetToTrace();
                  }}
                  className="text-[9.5px] text-sky-400 hover:text-sky-300 underline font-semibold cursor-pointer"
                >
                  Reset to Roof Trace
                </button>
              )}
            </div>
          </div>

          {/* Quick Cardinal Direction Presets */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-400 font-semibold block">
              Quick Orientation Presets:
            </span>
            <div className="grid grid-cols-4 gap-1.5 text-center text-[10.5px]">
              {[
                { label: 'North', deg: 0, sub: '0°' },
                { label: 'East', deg: 90, sub: '90°' },
                { label: 'South', deg: 180, sub: '★ 180°' },
                { label: 'West', deg: 270, sub: '270°' },
              ].map((p) => {
                const isSelected = activeAzimuth === p.deg;
                return (
                  <button
                    key={p.deg}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePresetAzimuth(p.deg);
                    }}
                    className={`py-1 px-1 rounded-xl border transition cursor-pointer flex flex-col items-center ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                        : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    <span>{p.label}</span>
                    <span className="text-[8.5px] font-mono opacity-80">{p.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Alignment Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10.5px]">
            {/* True North Reference */}
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1 text-red-400 font-bold mb-0.5">
                <span className="w-2 h-2 rounded-full bg-red-500"></span>
                <span>True North Reference</span>
              </div>
              <span className="text-white font-mono font-bold block text-xs">
                0° (Top of Map)
              </span>
              <span className="text-[9px] text-slate-400">Fixed Cartographic North</span>
            </div>

            {/* Active Bearing */}
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
              <div className="flex items-center gap-1 text-amber-400 font-bold mb-0.5">
                <Sun className="w-3 h-3 text-amber-400" />
                <span>Roof Facet Facing</span>
              </div>
              <span className="text-white font-mono font-bold block text-xs">
                {activeAzimuth}° {activeCardinal}
              </span>
              <span className="text-[9px] text-slate-400">
                {isShapeDefined && !isManualOverride ? 'From Traced Ridge' : 'Interactive Selection'}
              </span>
            </div>

            {/* Optimal Solar Facing */}
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[9.5px]">Optimal Solar South</span>
              <span className="text-emerald-400 font-mono font-bold block text-xs">
                {optimalCardinal}
              </span>
              <span className="text-[9px] text-slate-400">
                {effAnalysis.deviationFromSouth}° offset from peak sun
              </span>
            </div>

            {/* Roof Ridge Axis Line */}
            <div className="bg-slate-950/80 p-2 rounded-xl border border-slate-800">
              <span className="text-slate-400 block text-[9.5px]">Roof Ridge Axis</span>
              <span className="text-sky-300 font-mono font-bold block text-xs">
                {(activeAzimuth + 90) % 360}° ↔ {(activeAzimuth + 270) % 360}°
              </span>
              <span className="text-[9px] text-slate-400">Perpendicular to slope</span>
            </div>
          </div>

          {/* Display Mode & Phone Compass Toggle */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {/* Display Mode: Rotate Needle vs Rotate Dial */}
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 font-medium">Display Mode:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRotationMode('needle');
                  }}
                  className={`flex-1 py-1 rounded-lg font-bold text-[9.5px] transition cursor-pointer text-center ${
                    rotationMode === 'needle'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Needle
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRotationMode('dial');
                  }}
                  className={`flex-1 py-1 rounded-lg font-bold text-[9.5px] transition cursor-pointer text-center ${
                    rotationMode === 'dial'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Dial
                </button>
              </div>
            </div>

            {/* Live Phone Compass Sensor Button */}
            <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800 flex flex-col gap-1">
              <span className="text-slate-400 font-medium">Phone Compass:</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDeviceCompass();
                }}
                className={`py-1 px-2 rounded-lg font-bold text-[9.5px] flex items-center justify-center gap-1 transition cursor-pointer ${
                  useDeviceCompass
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                <span>{useDeviceCompass ? 'Active' : 'Live Sensor'}</span>
              </button>
            </div>
          </div>

          {/* Solar Photovoltaic Production Insight */}
          <div className="text-[10px] text-slate-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20 leading-relaxed flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {effAnalysis.deviationFromSouth <= 35
                ? 'Excellent orientation! South-facing rooftops receive peak solar irradiance throughout mid-day solar hours (10 AM – 3 PM).'
                : effAnalysis.deviationFromSouth <= 80
                ? 'Good orientation. East/West orientations capture strong morning or afternoon sun, ideal for residential daily electricity consumption.'
                : 'Notice: North-facing slopes experience reduced direct solar radiation. Consider elevated tilt brackets to optimize output.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
