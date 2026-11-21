import React, { useMemo, useState } from 'react';
import { Sparkles, Sun, Moon, Compass, Play, Pause, RotateCcw } from 'lucide-react';
import { calculateAstronomicalSunPosition } from './SolarHeroCard';
import { useTheme } from '../context/ThemeContext';

interface AnimatedSolarHeroIllustrationProps {
  latitude: number;
  longitude: number;
  currentDate: Date;
  peakSunlightTime?: string;
  onClick?: () => void;
}

export const AnimatedSolarHeroIllustration: React.FC<AnimatedSolarHeroIllustrationProps> = ({
  latitude,
  longitude,
  currentDate,
  peakSunlightTime = '12:00 PM',
  onClick,
}) => {
  const [isInteractive, setIsInteractive] = useState(false);
  const [scrubberHour, setScrubberHour] = useState<number>(12);
  const [isHovered, setIsHovered] = useState(false);
  const { isDark } = useTheme();
  const cardBgColor = isDark ? '#0F172A' : '#FFFFFF';

  const safeLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 17.41;
  const safeLon = typeof longitude === 'number' && !isNaN(longitude) ? longitude : 78.44;

  // Determine effective date (either live ticking date or interactive simulated hour)
  const effectiveDate = useMemo(() => {
    if (!isInteractive) return currentDate;
    const d = new Date(currentDate);
    const h = Math.floor(scrubberHour);
    const m = Math.floor((scrubberHour % 1) * 60);
    d.setHours(h, m, 0, 0);
    return d;
  }, [isInteractive, scrubberHour, currentDate]);

  const { altitudeDeg, sunStatus, trajectoryProgress } = useMemo(
    () => calculateAstronomicalSunPosition(safeLat, safeLon, effectiveDate),
    [safeLat, safeLon, effectiveDate]
  );

  const isDaytime = altitudeDeg > 0;
  const altitudeNumber = isDaytime ? altitudeDeg : 54.56;
  const displayAltitude = `+${altitudeNumber.toFixed(2)}°`;
  const displayStatus = isDaytime ? sunStatus : 'Zenith';

  // Exact circular arc matching the design coordinates:
  // Center of circle: cx = 767.0, cy = 373.7, R = 333.3
  const cx = 767.0;
  const cy = 373.7;
  const radius = 333.3;

  // Clamped trajectory progress (0 = sunrise, 0.5 = noon zenith, 1 = sunset)
  const clampedProgress = Math.max(0.04, Math.min(0.96, trajectoryProgress));
  const sunAngleRad = Math.PI * (1 - clampedProgress);
  const sunX = cx + radius * Math.cos(sunAngleRad);
  const sunY = cy - radius * Math.sin(sunAngleRad);

  const isGoldenHour = altitudeDeg > 0 && altitudeDeg < 15;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group w-full rounded-[28px] overflow-hidden shadow-sm hover:shadow-lg border border-slate-200/90 dark:border-slate-800 relative bg-white dark:bg-slate-900 select-none transition-all duration-300"
    >
      {/* 1140x460 Aspect Ratio Container */}
      <div className="w-full relative aspect-[1140/460] overflow-hidden">
        {/* Pure SVG Animated Vector Landscape & Solar System */}
        <svg
          viewBox="0 0 1140 460"
          className="w-full h-full block select-none pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* 1. Dynamic Celestial Sky Gradient based on Time of Day */}
            <linearGradient id="vectorSkyDay" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1E6DEB" />
              <stop offset="38%" stopColor="#3B82F6" />
              <stop offset="72%" stopColor="#70B0FF" />
              <stop offset="100%" stopColor="#B3DAFF" />
            </linearGradient>

            <linearGradient id="vectorSkyGolden" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EA580C" />
              <stop offset="45%" stopColor="#F97316" />
              <stop offset="75%" stopColor="#FBBF24" />
              <stop offset="100%" stopColor="#FED7AA" />
            </linearGradient>

            <linearGradient id="vectorSkyNight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#020617" />
              <stop offset="50%" stopColor="#0B1528" />
              <stop offset="85%" stopColor="#1E293B" />
              <stop offset="100%" stopColor="#334155" />
            </linearGradient>

            {/* Left Card Gradient: Clean White in light mode, Dark Slate in dark mode */}
            <linearGradient id="vectorLeftFade" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={cardBgColor} stopOpacity="1" />
              <stop offset="30%" stopColor={cardBgColor} stopOpacity="0.98" />
              <stop offset="42%" stopColor={cardBgColor} stopOpacity="0.82" />
              <stop offset="52%" stopColor={cardBgColor} stopOpacity="0" />
            </linearGradient>

            {/* Distant Mountain Ridge Gradients */}
            <linearGradient id="mountainBackGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6C97DB" />
              <stop offset="100%" stopColor="#A8C8F7" />
            </linearGradient>

            <linearGradient id="mountainMidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A75BC" />
              <stop offset="100%" stopColor="#7FA3DB" />
            </linearGradient>

            {/* Rolling Grass Hills Gradients */}
            <linearGradient id="meadowGradBack" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#84CC16" />
              <stop offset="100%" stopColor="#4D7C0F" />
            </linearGradient>

            <linearGradient id="meadowGradFront" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A3E635" />
              <stop offset="40%" stopColor="#65A30D" />
              <stop offset="100%" stopColor="#3F6212" />
            </linearGradient>

            {/* High-Gloss Photovoltaic Module Cell Gradient */}
            <linearGradient id="pvCellGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1E3A8A" />
              <stop offset="35%" stopColor="#1D4ED8" />
              <stop offset="70%" stopColor="#1E40AF" />
              <stop offset="100%" stopColor="#0F172A" />
            </linearGradient>

            {/* Battery Enclosure Metallic Finish */}
            <linearGradient id="batteryGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F8FAFC" />
              <stop offset="70%" stopColor="#E2E8F0" />
              <stop offset="100%" stopColor="#CBD5E1" />
            </linearGradient>

            {/* Sun Core Radial Glow */}
            <radialGradient id="vectorSunAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
              <stop offset="35%" stopColor="#FBBF24" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#F97316" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#EA580C" stopOpacity="0" />
            </radialGradient>

            {/* Sun Beam Radiant Cone */}
            <linearGradient id="vectorSunBeams" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stopColor="#FDE047" stopOpacity="0.45" />
              <stop offset="60%" stopColor="#FBBF24" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>

            {/* Drop Shadow Filter for Solar Hardware */}
            <filter id="vectorDropShadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="6" stdDeviation="6" floodColor="#0F172A" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* ========================================================================= */}
          {/* LAYER 1: ATMOSPHERIC SKY BACKDROP                                         */}
          {/* ========================================================================= */}
          <rect
            x="0"
            y="0"
            width="1140"
            height="460"
            fill={
              !isDaytime
                ? 'url(#vectorSkyNight)'
                : isGoldenHour
                ? 'url(#vectorSkyGolden)'
                : 'url(#vectorSkyDay)'
            }
          />

          {/* Night Stars (visible when altitude <= 0) */}
          {!isDaytime && (
            <g opacity="0.85">
              <circle cx="520" cy="50" r="1.5" fill="#FFFFFF" className="animate-pulse" />
              <circle cx="610" cy="80" r="1.8" fill="#FEF08A" />
              <circle cx="700" cy="35" r="1.2" fill="#FFFFFF" className="animate-ping" style={{ animationDuration: '4s' }} />
              <circle cx="850" cy="65" r="1.6" fill="#FFFFFF" />
              <circle cx="940" cy="40" r="2" fill="#BAE6FD" />
              <circle cx="1020" cy="90" r="1.4" fill="#FFFFFF" />
              <circle cx="1080" cy="55" r="1.5" fill="#FEF08A" />
            </g>
          )}

          {/* ========================================================================= */}
          {/* LAYER 2: DRIFTING TRANSLUCENT CUMULUS CLOUDS (Pure CSS Animations)        */}
          {/* ========================================================================= */}
          {isDaytime && (
            <g opacity={isGoldenHour ? 0.65 : 0.85}>
              {/* Cloud Group 1: Background Layer (Slow Drift) */}
              <g className="animate-cloud-slow" opacity="0.45">
                <path
                  d="M 120 70 Q 140 45, 175 50 Q 215 35, 250 55 Q 285 45, 310 70 Q 325 90, 305 105 Q 285 115, 230 115 Q 160 115, 130 105 Q 105 90, 120 70 Z"
                  fill="#FFFFFF"
                />
                <path
                  d="M 680 90 Q 700 65, 735 70 Q 775 55, 810 75 Q 845 65, 870 90 Q 885 110, 865 125 Q 845 135, 790 135 Q 720 135, 690 125 Q 665 110, 680 90 Z"
                  fill="#FFFFFF"
                />
              </g>

              {/* Cloud Group 2: Foreground Layer (Gentle Drift) */}
              <g className="animate-cloud-fast" opacity="0.75">
                <path
                  d="M 420 100 Q 435 80, 460 85 Q 490 70, 520 88 Q 550 78, 570 100 Q 585 118, 565 130 Q 545 140, 500 140 Q 440 140, 425 130 Q 405 118, 420 100 Z"
                  fill="#FFFFFF"
                />
                <path
                  d="M 920 120 Q 940 98, 970 104 Q 1005 88, 1040 108 Q 1075 96, 1100 120 Q 1115 140, 1095 152 Q 1075 162, 1020 162 Q 955 162, 935 152 Q 910 138, 920 120 Z"
                  fill="#FFFFFF"
                />
              </g>
            </g>
          )}

          {/* ========================================================================= */}
          {/* LAYER 3: ATMOSPHERIC MOUNTAIN RIDGES                                      */}
          {/* ========================================================================= */}
          {/* Far Distant Mist Ridges */}
          <path
            d="M 360 250 L 440 215 L 530 245 L 630 190 L 740 235 L 860 180 L 980 230 L 1080 195 L 1140 220 L 1140 340 L 360 340 Z"
            fill="url(#mountainBackGrad)"
            opacity="0.85"
          />

          {/* Mid-Ground Faceted Mountain Peaks */}
          <path
            d="M 370 270 L 460 230 L 520 260 L 590 220 L 680 265 L 770 210 L 870 255 L 960 205 L 1050 250 L 1140 225 L 1140 370 L 370 370 Z"
            fill="url(#mountainMidGrad)"
          />

          {/* Subtle Mountain Shading Facets */}
          <polygon points="680,265 770,210 790,260" fill="#3B82F6" opacity="0.15" />
          <polygon points="870,255 960,205 985,250" fill="#3B82F6" opacity="0.15" />

          {/* ========================================================================= */}
          {/* LAYER 4: ROLLING GREEN MEADOW TERRAIN & TREES                             */}
          {/* ========================================================================= */}
          {/* Back Grass Rolling Hill */}
          <path
            d="M 360 330 Q 520 290, 720 310 Q 940 330, 1140 295 L 1140 460 L 360 460 Z"
            fill="url(#meadowGradBack)"
          />

          {/* Mid-Ground Stylized Trees Cluster */}
          <g>
            {/* Tree 1 */}
            <circle cx="410" cy="305" r="16" fill="#4D7C0F" />
            <circle cx="405" cy="300" r="13" fill="#65A30D" />
            <rect x="408" y="318" width="4" height="14" rx="1.5" fill="#78350F" />

            {/* Tree 2 */}
            <circle cx="435" cy="312" r="12" fill="#3F6212" />
            <circle cx="432" cy="308" r="9" fill="#4D7C0F" />
            <rect x="434" y="322" width="3" height="10" rx="1" fill="#78350F" />

            {/* Far Right Trees (Behind Battery) */}
            <circle cx="980" cy="320" r="18" fill="#4D7C0F" />
            <circle cx="975" cy="314" r="14" fill="#65A30D" />
            <rect x="978" y="334" width="4" height="14" rx="1.5" fill="#78350F" />

            <circle cx="1005" cy="325" r="14" fill="#3F6212" />
            <circle cx="1001" cy="320" r="10" fill="#4D7C0F" />
            <rect x="1003" y="335" width="3" height="11" rx="1" fill="#78350F" />
          </g>

          {/* Foreground Crisp Green Lawn */}
          <path
            d="M 360 365 Q 540 335, 780 345 Q 980 355, 1140 335 L 1140 460 L 360 460 Z"
            fill="url(#meadowGradFront)"
          />

          {/* Structural Ground Cast Shadows */}
          <ellipse cx="680" cy="365" rx="200" ry="18" fill="#14532D" opacity="0.45" />
          <ellipse cx="880" cy="370" rx="45" ry="10" fill="#14532D" opacity="0.45" />

          {/* ========================================================================= */}
          {/* LAYER 5: 3D PHOTOVOLTAIC SOLAR ARRAY & MOUNTING ARCHITECTURE             */}
          {/* ========================================================================= */}
          <g filter="url(#vectorDropShadow)">
            {/* Structural Galvanized Steel Foundation Pillars */}
            <g stroke="#94A3B8" strokeWidth="4" strokeLinecap="round">
              {/* Front Leg Posts */}
              <line x1="565" y1="330" x2="565" y2="368" />
              <line x1="655" y1="330" x2="655" y2="368" />
              <line x1="745" y1="330" x2="745" y2="368" />
              <line x1="835" y1="330" x2="835" y2="368" />

              {/* Diagonal Cross-Truss Stabilizers */}
              <line x1="565" y1="332" x2="655" y2="366" strokeWidth="2.5" stroke="#CBD5E1" />
              <line x1="655" y1="332" x2="745" y2="366" strokeWidth="2.5" stroke="#CBD5E1" />
              <line x1="745" y1="332" x2="835" y2="366" strokeWidth="2.5" stroke="#CBD5E1" />

              {/* Horizontal Support Girder */}
              <line x1="550" y1="330" x2="850" y2="330" strokeWidth="3" stroke="#64748B" />
              <line x1="550" y1="368" x2="850" y2="368" strokeWidth="3" stroke="#475569" />
            </g>

            {/* Main Tilted Photovoltaic Array Face (12-cell high-efficiency plane) */}
            <polygon
              points="530,325 870,295 905,230 575,255"
              fill="url(#pvCellGrad)"
              stroke="#E2E8F0"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />

            {/* Aluminum Module Frame Insets & Grid Cells */}
            {/* Vertical Cell Column Dividers */}
            <line x1="615" y1="318" x2="658" y2="249" stroke="#93C5FD" strokeWidth="1.4" opacity="0.9" />
            <line x1="700" y1="310" x2="740" y2="243" stroke="#93C5FD" strokeWidth="1.4" opacity="0.9" />
            <line x1="785" y1="303" x2="822" y2="236" stroke="#93C5FD" strokeWidth="1.4" opacity="0.9" />

            {/* Horizontal Busbar Dividing Lines */}
            <line x1="545" y1="302" x2="882" y2="273" stroke="#93C5FD" strokeWidth="1.4" opacity="0.9" />
            <line x1="560" y1="278" x2="893" y2="251" stroke="#93C5FD" strokeWidth="1.4" opacity="0.9" />

            {/* Photovoltaic Glass Gleam Reflection Line (Animated Sweep) */}
            <g className="animate-panel-gleam" opacity="0.4">
              <polygon points="560,325 610,320 660,245 610,250" fill="#FFFFFF" />
            </g>
          </g>

          {/* ========================================================================= */}
          {/* LAYER 6: SMART BATTERY STORAGE & INVERTER UNIT                           */}
          {/* ========================================================================= */}
          <g filter="url(#vectorDropShadow)" transform="translate(860, 275)">
            {/* Battery Main Architectural Casing */}
            <rect
              x="0"
              y="0"
              width="68"
              height="85"
              rx="8"
              fill="url(#batteryGrad)"
              stroke="#94A3B8"
              strokeWidth="1.6"
            />

            {/* Unit Top Bezel Accent */}
            <rect x="0" y="0" width="68" height="12" rx="6" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="1" />

            {/* Electric Blue Lightning Glyphs */}
            <path
              d="M 37 25 L 30 42 L 36 42 L 31 58 L 44 38 L 37 38 Z"
              fill="#2563EB"
              stroke="#38BDF8"
              strokeWidth="0.8"
              className="animate-pulse"
            />

            {/* LED Status Indicators */}
            <circle cx="16" cy="72" r="2.5" fill="#10B981" className="animate-ping" style={{ animationDuration: '3s' }} />
            <circle cx="16" cy="72" r="2.5" fill="#10B981" />
            <circle cx="26" cy="72" r="2" fill="#0284C7" />

            {/* Air Intake Grill Slits */}
            <line x1="45" y1="68" x2="58" y2="68" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="45" y1="72" x2="58" y2="72" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
            <line x1="45" y1="76" x2="58" y2="76" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round" />
          </g>

          {/* Peak Sunlight is rendered in SolarHeroCard HTML overlay with i18n support */}

          {/* ========================================================================= */}
          {/* LAYER 7: CELESTIAL DASHED TRAJECTORY ARC                                  */}
          {/* ========================================================================= */}
          {/* The Single Crisp Flowing Trajectory Arc */}
          <path
            d="M 433.7 373.7 A 333.3 333.3 0 0 1 1100.3 373.7"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5"
            strokeDasharray="14 14"
            opacity="0.95"
            className="animate-[dash_35s_linear_infinite]"
          />

          {/* Sunbeam Cone: Radiant Energy Projection towards the PV Array */}
          {isDaytime && (
            <polygon
              points={`${sunX},${sunY} 580,320 890,290`}
              fill="url(#vectorSunBeams)"
              opacity="0.45"
            />
          )}

          {/* ========================================================================= */}
          {/* LAYER 8: GLOWING SUN NODE (Real-time Astronomical Position)                */}
          {/* ========================================================================= */}
          {isDaytime ? (
            <g transform={`translate(${sunX}, ${sunY})`}>
              {/* Breathing Radial Outer Halo */}
              <circle
                cx="0"
                cy="0"
                r="36"
                fill="url(#vectorSunAura)"
                className="animate-ping"
                style={{ animationDuration: '3.5s' }}
              />

              {/* Secondary Warm Glow Disc */}
              <circle cx="0" cy="0" r="24" fill="#F59E0B" opacity="0.38" />

              {/* Solid White Outer Rim with Vibrant Orange Border */}
              <circle
                cx="0"
                cy="0"
                r="18"
                fill="#FFFFFF"
                stroke="#F97316"
                strokeWidth="4.8"
                className="drop-shadow-md"
              />

              {/* Inner Vibrant Gold Pupil */}
              <circle cx="0" cy="0" r="9" fill="#EA580C" />
              <circle cx="0" cy="0" r="4.5" fill="#FEF08A" />
            </g>
          ) : (
            /* Night Crescent Moon */
            <g transform={`translate(${sunX}, ${sunY})`}>
              <circle cx="0" cy="0" r="16" fill="#FDE047" opacity="0.85" />
              <circle cx="6" cy="-4" r="14" fill="#090D1A" />
            </g>
          )}

          {/* Sunrise / Sunset Horizon Flare Glow */}
          <circle cx="1100" cy="370" r="28" fill="#F97316" opacity="0.22" />

          {/* ========================================================================= */}
          {/* LAYER 9: LEFT WHITE CARD GRADIENT FADE                                    */}
          {/* ========================================================================= */}
          <rect
            x="0"
            y="0"
            width="580"
            height="460"
            fill="url(#vectorLeftFade)"
          />
        </svg>

        {/* ========================================================================= */}
        {/* OVERLAY: LEFT SIDE LIVE METRICS (Altitude & Sun Status)                   */}
        {/* ========================================================================= */}
        <div className="absolute left-4 sm:left-6 top-3.5 sm:top-5 bottom-3.5 sm:bottom-5 flex flex-col justify-between z-20 select-none">
          {/* Top Metric: Altitude */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              {/* Solid Blue Mountain Icon */}
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 sm:w-5 sm:h-5 text-[#2563EB] fill-[#2563EB] shrink-0 drop-shadow-xs"
              >
                <polygon points="12,3 2,21 22,21" />
                <polygon points="12,3 7,13 14,15" fill="#1D4ED8" />
              </svg>
              <span className="text-[11px] sm:text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                Altitude
              </span>
            </div>
            <div className="text-xl sm:text-2xl md:text-[28px] font-black text-slate-900 dark:text-white tracking-tight flex items-baseline gap-1">
              <span>{displayAltitude}</span>
            </div>
          </div>

          {/* Clean Horizontal Divider */}
          <div className="w-24 sm:w-28 h-px bg-slate-200/90 dark:bg-slate-700/80 my-0.5 sm:my-1" />

          {/* Bottom Metric: Sun Status */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              {/* Outline Orange Sun Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="#F97316"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4 sm:w-5 sm:h-5 shrink-0"
              >
                <circle cx="12" cy="12" r="4.5" />
                <line x1="12" y1="2" x2="12" y2="4.5" />
                <line x1="12" y1="19.5" x2="12" y2="22" />
                <line x1="2" y1="12" x2="4.5" y2="12" />
                <line x1="19.5" y1="12" x2="22" y2="12" />
                <line x1="4.93" y1="4.93" x2="6.7" y2="6.7" />
                <line x1="17.3" y1="17.3" x2="19.07" y2="19.07" />
                <line x1="4.93" y1="19.07" x2="6.7" y2="17.3" />
                <line x1="17.3" y1="6.7" x2="19.07" y2="4.93" />
              </svg>
              <span className="text-[11px] sm:text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                Sun Status
              </span>
            </div>
            <div className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{displayStatus}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300 shadow-xs inline-block" />
            </div>
          </div>
        </div>

        {/* Top-Right Interactive Toolbar: Scrubber Toggle & AR Quick Action */}
        <div className="absolute top-3 right-3 z-25 flex items-center gap-2">
          {/* Interactive Scrub Mode Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsInteractive(!isInteractive);
            }}
            className="bg-slate-900/80 hover:bg-slate-900 text-white backdrop-blur-md px-2.5 py-1 rounded-xl text-[10px] font-bold border border-white/20 shadow-xs flex items-center gap-1.5 transition cursor-pointer"
            title="Toggle between Live Real-time and Interactive Sun Scrubber"
          >
            {isInteractive ? (
              <>
                <RotateCcw className="w-3 h-3 text-amber-400" />
                <span>Live Mode</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Simulate Path</span>
              </>
            )}
          </button>

          {/* AR Launcher Pill */}
          {onClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
              className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-2.5 py-1 rounded-xl text-[10px] shadow-sm flex items-center gap-1 transition cursor-pointer"
              title="Open Sun AR & Compass Suite"
            >
              <Compass className="w-3 h-3 text-slate-950 animate-spin-slow" />
              <span className="hidden sm:inline">Sun Suite</span>
            </button>
          )}
        </div>

        {/* Interactive Timeline Scrubber Slider (Appears when Simulate Path is Active) */}
        {isInteractive && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 inset-x-4 sm:inset-x-8 z-25 bg-slate-900/90 backdrop-blur-md rounded-2xl p-2.5 px-4 border border-amber-400/40 shadow-xl flex items-center gap-3 animate-fade-in text-white text-xs"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-300 shrink-0">
              <Sun className="w-4 h-4 text-amber-400" />
              <span>
                {Math.floor(scrubberHour).toString().padStart(2, '0')}:
                {Math.floor((scrubberHour % 1) * 60)
                  .toString()
                  .padStart(2, '0')}{' '}
                {scrubberHour >= 12 ? 'PM' : 'AM'}
              </span>
            </div>

            <input
              type="range"
              min="5.5"
              max="18.5"
              step="0.1"
              value={scrubberHour}
              onChange={(e) => setScrubberHour(parseFloat(e.target.value))}
              className="flex-1 accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
            />

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setScrubberHour(6)}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300"
              >
                Dawn
              </button>
              <button
                onClick={() => setScrubberHour(12)}
                className="px-2 py-0.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-[10px] font-black text-slate-950"
              >
                Noon
              </button>
              <button
                onClick={() => setScrubberHour(17.5)}
                className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300"
              >
                Sunset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
