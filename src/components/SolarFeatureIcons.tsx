import React from 'react';

/**
 * Three Soft Light-Blue Chevrons (>>>)
 * Exact match to the top-right watermark on each card in the reference screenshot
 */
export const CardChevrons: React.FC<{ className?: string }> = ({
  className = 'w-7 h-4',
}) => (
  <svg
    viewBox="0 0 28 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M3 2.5L9.5 8L3 13.5"
      stroke="#D1E1FC"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M10.5 2.5L17 8L10.5 13.5"
      stroke="#D1E1FC"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M18 2.5L24.5 8L18 13.5"
      stroke="#D1E1FC"
      strokeWidth="2.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * High-fidelity 3D-styled SVG icons matching the reference mobile UI screenshot:
 * 1. Solar Estimator: Tilted PV panel + Calculator with LCD display & buttons + Glowing Sun
 * 2. Appliance Analysis: 3D purple wall socket + 3-bar analytical chart + Green leaf
 * 3. Shadow Tracker: 3D house with orange roof solar panel + Tree casting ground shadow + Sun
 * 4. Solar Maintenance: 3D solar panel + Wiper squeegee with soap suds + Shield with checkmark
 */

// 1. SOLAR ESTIMATOR ICON
export const SolarEstimatorIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Sun Gradient */}
      <linearGradient id="seSunGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      {/* Solar Panel Face Gradient */}
      <linearGradient id="sePanelGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="35%" stopColor="#2563EB" />
        <stop offset="85%" stopColor="#1E3A8A" />
        <stop offset="100%" stopColor="#0F172A" />
      </linearGradient>
      {/* Calculator Body Gradient */}
      <linearGradient id="seCalcBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="60%" stopColor="#F1F5F9" />
        <stop offset="100%" stopColor="#E2E8F0" />
      </linearGradient>
      {/* Drop Shadow Filter */}
      <filter id="seDropShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Radiant Sun in top-left background with slow rotating rays */}
    <g filter="url(#seDropShadow)">
      <circle cx="24" cy="22" r="11" fill="url(#seSunGrad)" />
      {/* Sun rays rotating gently */}
      <g stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" className="animate-spin-slow origin-[24px_22px]">
        <line x1="24" y1="6" x2="24" y2="9.5" />
        <line x1="24" y1="34.5" x2="24" y2="38" />
        <line x1="8" y1="22" x2="11.5" y2="22" />
        <line x1="36.5" y1="22" x2="40" y2="22" />
        <line x1="13" y1="11" x2="15.5" y2="13.5" strokeWidth="2" />
        <line x1="32.5" y1="30.5" x2="35" y2="33" strokeWidth="2" />
        <line x1="13" y1="33" x2="15.5" y2="30.5" strokeWidth="2" />
        <line x1="32.5" y1="13.5" x2="35" y2="11" strokeWidth="2" />
      </g>
    </g>

    {/* 3D Tilted Solar PV Panel */}
    <g filter="url(#seDropShadow)">
      {/* Metal Mounting Legs */}
      <line x1="32" y1="46" x2="36" y2="60" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
      <line x1="52" y1="42" x2="55" y2="56" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
      <line x1="30" y1="60" x2="57" y2="57" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />

      {/* Blue Panel Surface (Isometric angled quadrilateral) */}
      <polygon
        points="16,40 54,25 64,48 24,59"
        fill="url(#sePanelGrad)"
        stroke="#E2E8F0"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />

      {/* Solar Panel Aluminum Partition & Cell Lines */}
      <line x1="35" y1="32.5" x2="44" y2="53.5" stroke="#93C5FD" strokeWidth="1.2" opacity="0.9" />
      <line x1="20" y1="49.5" x2="59" y2="36.5" stroke="#93C5FD" strokeWidth="1.2" opacity="0.9" />
      <line x1="27.5" y1="44" x2="36.5" y2="28" stroke="#60A5FA" strokeWidth="0.9" opacity="0.75" />
      <line x1="42.5" y1="51" x2="51.5" y2="35" stroke="#60A5FA" strokeWidth="0.9" opacity="0.75" />
    </g>

    {/* Realistic Modern Pocket Calculator in Front-Right */}
    <g filter="url(#seDropShadow)" transform="translate(38, 32)">
      {/* Calculator Body */}
      <rect
        x="0"
        y="0"
        width="30"
        height="40"
        rx="5.5"
        fill="url(#seCalcBody)"
        stroke="#94A3B8"
        strokeWidth="1.4"
      />

      {/* LCD Digital Screen */}
      <rect
        x="3.5"
        y="3.5"
        width="23"
        height="9"
        rx="2.5"
        fill="#E0F2FE"
        stroke="#BAE6FD"
        strokeWidth="0.8"
      />
      {/* 12345 LCD Display Text */}
      <text
        x="6"
        y="10.2"
        fontSize="5.5"
        fill="#0369A1"
        fontWeight="bold"
        fontFamily="monospace"
        letterSpacing="0.8"
      >
        12345
      </text>

      {/* Keypad Buttons (Row 1) */}
      <circle cx="7.5" cy="17" r="2.2" fill="#F97316" />
      <circle cx="15" cy="17" r="2.2" fill="#0284C7" />
      <circle cx="22.5" cy="17" r="2.2" fill="#0284C7" />

      {/* Keypad Buttons (Row 2) */}
      <circle cx="7.5" cy="23.5" r="2.2" fill="#3B82F6" />
      <circle cx="15" cy="23.5" r="2.2" fill="#3B82F6" />
      <circle cx="22.5" cy="23.5" r="2.2" fill="#3B82F6" />

      {/* Keypad Buttons (Row 3) */}
      <circle cx="7.5" cy="30" r="2.2" fill="#3B82F6" />
      <circle cx="15" cy="30" r="2.2" fill="#3B82F6" />
      <circle cx="22.5" cy="30" r="2.2" fill="#10B981" />

      {/* Bottom Bar / Space Key */}
      <rect x="5.5" y="34.5" width="19" height="2.5" rx="1.2" fill="#64748B" />
    </g>
  </svg>
);

// 2. APPLIANCE ANALYSIS ICON
export const ApplianceAnalysisIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Soft Purple Glow Filter */}
      <filter id="aaGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      {/* Plug/Socket Gradient */}
      <linearGradient id="aaPlugGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#F5F3FF" />
        <stop offset="40%" stopColor="#DDD6FE" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>
      {/* Bar Chart Gradient */}
      <linearGradient id="aaBarGrad1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#C084FC" />
        <stop offset="100%" stopColor="#9333EA" />
      </linearGradient>
      <linearGradient id="aaBarGrad2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#818CF8" />
        <stop offset="100%" stopColor="#4F46E5" />
      </linearGradient>
      <linearGradient id="aaBarGrad3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6366F1" />
        <stop offset="100%" stopColor="#3730A3" />
      </linearGradient>
      {/* Green Leaf Gradient */}
      <linearGradient id="aaLeafGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#86EFAC" />
        <stop offset="60%" stopColor="#22C55E" />
        <stop offset="100%" stopColor="#15803D" />
      </linearGradient>
      {/* Drop Shadow */}
      <filter id="aaShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2.5" floodColor="#3B0764" floodOpacity="0.18" />
      </filter>
    </defs>

    {/* Soft Purple Ambient Radial Glow behind socket */}
    <circle cx="34" cy="38" r="24" fill="#F3E8FF" opacity="0.6" />

    {/* 3D Smart Electrical Wall Socket */}
    <g filter="url(#aaShadow)">
      {/* Socket Outer Casing */}
      <rect
        x="12"
        y="14"
        width="38"
        height="50"
        rx="10"
        fill="url(#aaPlugGrad)"
        stroke="#C084FC"
        strokeWidth="1.6"
      />
      {/* Inner Recessed Bezel */}
      <circle cx="31" cy="32" r="12" fill="#FAF5FF" stroke="#A855F7" strokeWidth="1.4" />
      
      {/* Two Pin Holes */}
      <circle cx="26.5" cy="31" r="2.5" fill="#3B0764" />
      <circle cx="35.5" cy="31" r="2.5" fill="#3B0764" />
      {/* Earth Ground Notch */}
      <rect x="29.5" y="36.5" width="3" height="3.5" rx="1" fill="#6B21A8" />

      {/* Smart LED Power Light with gentle pulse */}
      <circle cx="31" cy="52" r="2.2" fill="#22C55E" className="animate-ping" style={{ animationDuration: '3s' }} />
      <circle cx="31" cy="52" r="2.2" fill="#22C55E" />
      <circle cx="31" cy="52" r="4" fill="#22C55E" opacity="0.3" />
    </g>

    {/* 3D Energy Usage Bar Chart Beside Socket */}
    <g filter="url(#aaShadow)" transform="translate(44, 30)">
      {/* Bar 1 (Shortest - Lavender) */}
      <rect x="0" y="16" width="5.5" height="15" rx="2" fill="url(#aaBarGrad1)" />
      {/* Bar 2 (Medium - Indigo/Violet) */}
      <rect x="7.5" y="9" width="5.5" height="22" rx="2" fill="url(#aaBarGrad2)" />
      {/* Bar 3 (Tallest - Deep Indigo) */}
      <rect x="15" y="2" width="5.5" height="29" rx="2" fill="url(#aaBarGrad3)" />

      {/* Upward Energy Trend Line */}
      <path
        d="M 2.5 12 L 10 6 L 17.5 1"
        stroke="#A855F7"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>

    {/* Green Eco Leaf on Bottom-Right with gentle swaying motion */}
    <g filter="url(#aaShadow)" transform="translate(48, 48)" className="animate-float-gentle origin-[58px_58px]">
      <path
        d="M 2 17 C 2 6, 16 0, 19 0 C 19 12, 9 19, 2 17 Z"
        fill="url(#aaLeafGrad)"
        stroke="#166534"
        strokeWidth="1"
      />
      {/* Leaf Center Vein */}
      <path d="M 3 16 Q 10 9, 17 2" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" />
    </g>
  </svg>
);

// 3. SHADOW TRACKER ICON
export const ShadowTrackerIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Sun Gradient */}
      <linearGradient id="stSunGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      {/* Terracotta Roof Gradient */}
      <linearGradient id="stRoofGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FB923C" />
        <stop offset="100%" stopColor="#C2410C" />
      </linearGradient>
      {/* House Wall Gradient */}
      <linearGradient id="stWallGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#E2E8F0" />
      </linearGradient>
      {/* Tree Foliage Gradient */}
      <linearGradient id="stTreeGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4ADE80" />
        <stop offset="60%" stopColor="#22C55E" />
        <stop offset="100%" stopColor="#15803D" />
      </linearGradient>
      {/* Drop Shadow */}
      <filter id="stShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Radiant Sun in top-left casting shadow angles */}
    <g filter="url(#stShadow)">
      <circle cx="20" cy="20" r="9.5" fill="url(#stSunGrad)" />
      <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" className="animate-spin-slow origin-[20px_20px]">
        <line x1="20" y1="6" x2="20" y2="9" />
        <line x1="20" y1="31" x2="20" y2="34" />
        <line x1="6" y1="20" x2="9" y2="20" />
        <line x1="31" y1="20" x2="34" y2="20" />
        <line x1="10" y1="10" x2="12.5" y2="12.5" />
        <line x1="27.5" y1="27.5" x2="30" y2="30" />
      </g>
    </g>

    {/* Ground Elliptical Shadow Projection */}
    <ellipse cx="42" cy="65" rx="30" ry="7" fill="#CBD5E1" opacity="0.65" />

    {/* 3D House Structure */}
    <g filter="url(#stShadow)">
      {/* Front Wall */}
      <polygon
        points="27,42 45,42 45,60 27,60"
        fill="url(#stWallGrad)"
        stroke="#CBD5E1"
        strokeWidth="1.2"
      />
      {/* Side Wall in Perspective */}
      <polygon
        points="45,42 57,35 57,53 45,60"
        fill="#CBD5E1"
        stroke="#94A3B8"
        strokeWidth="1"
      />

      {/* Front Door */}
      <rect x="33" y="48" width="7" height="12" rx="1" fill="#78350F" />
      <circle cx="38.5" cy="54" r="0.7" fill="#FDE047" />

      {/* Front Window */}
      <rect x="29" y="44" width="4.5" height="4.5" rx="0.8" fill="#38BDF8" stroke="#64748B" strokeWidth="0.6" />

      {/* Gabled Orange Roof (Front slope) */}
      <polygon
        points="24,42 36,29 48,42"
        fill="url(#stRoofGrad)"
        stroke="#9A3412"
        strokeWidth="1.2"
      />
      {/* Gabled Orange Roof (Side slope) */}
      <polygon
        points="36,29 60,24 61,35 48,42"
        fill="#F97316"
        stroke="#9A3412"
        strokeWidth="1"
      />

      {/* Rooftop Solar PV Panel */}
      <polygon
        points="39,31 53,28 54,34 40,38"
        fill="#1E3A8A"
        stroke="#60A5FA"
        strokeWidth="0.9"
      />
      {/* Panel Grid Dividing Lines */}
      <line x1="46" y1="29.5" x2="47" y2="36" stroke="#93C5FD" strokeWidth="0.7" />
    </g>

    {/* Lush Green Tree Casting Shade Beside House */}
    <g filter="url(#stShadow)" transform="translate(53, 38)">
      {/* Tree Trunk */}
      <rect x="8" y="14" width="4.5" height="12" rx="1.5" fill="#78350F" />
      {/* Back Foliage Layer */}
      <circle cx="10" cy="10" r="10.5" fill="url(#stTreeGrad)" />
      {/* Front Highlight Foliage */}
      <circle cx="7" cy="7" r="7" fill="#86EFAC" opacity="0.65" />
    </g>
  </svg>
);

// 4. SOLAR MAINTENANCE ICON
export const SolarMaintenanceIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg
    viewBox="0 0 80 80"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      {/* Sun Gradient */}
      <linearGradient id="smSunGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      {/* Solar Panel Face */}
      <linearGradient id="smPanelGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="50%" stopColor="#0284C7" />
        <stop offset="100%" stopColor="#0369A1" />
      </linearGradient>
      {/* Protection Shield Gradient */}
      <linearGradient id="smShieldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
      {/* Drop Shadow */}
      <filter id="smShadow" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="1.5" dy="2.5" stdDeviation="2" floodColor="#0F172A" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Sun in background with rotating rays */}
    <g filter="url(#smShadow)">
      <circle cx="20" cy="20" r="8" fill="url(#smSunGrad)" />
      <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" className="animate-spin-slow origin-[20px_20px]">
        <line x1="20" y1="7" x2="20" y2="10" />
        <line x1="20" y1="30" x2="20" y2="33" />
        <line x1="7" y1="20" x2="10" y2="20" />
        <line x1="30" y1="20" x2="33" y2="20" />
      </g>
    </g>

    {/* 3D Solar PV Panel */}
    <g filter="url(#smShadow)">
      {/* Panel Stand */}
      <path d="M 28 47 L 30 59 M 48 45 L 50 57" stroke="#94A3B8" strokeWidth="2.8" strokeLinecap="round" />

      {/* Blue Panel Face */}
      <polygon
        points="18,39 53,26 60,48 25,59"
        fill="url(#smPanelGrad)"
        stroke="#E0F2FE"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />

      {/* Grid Lines on Panel */}
      <line x1="35" y1="33" x2="42" y2="54" stroke="#BAE6FD" strokeWidth="1.2" />
      <line x1="21.5" y1="49" x2="56.5" y2="37" stroke="#BAE6FD" strokeWidth="1.2" />

      {/* Clean sparkles / glints on glass */}
      <polygon points="30,42 32,39 34,42 32,45" fill="#FFFFFF" />
      <polygon points="46,35 47.5,33 49,35 47.5,37" fill="#FFFFFF" />
    </g>

    {/* Cleaning Squeegee / Wiper Sweeping Across Glass */}
    <g filter="url(#smShadow)" className="animate-float-gentle origin-[30px_35px]">
      {/* Squeegee Handle */}
      <line x1="22" y1="25" x2="37" y2="42" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round" />
      {/* Squeegee Rubber Wiper Blade */}
      <line x1="28" y1="47" x2="46" y2="33" stroke="#0284C7" strokeWidth="4.5" strokeLinecap="round" />
      {/* White wiper highlight */}
      <line x1="28" y1="47" x2="46" y2="33" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" />
    </g>

    {/* Foamy Soap Bubbles and Water Droplets */}
    <circle cx="48" cy="27" r="3.5" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="1" opacity="0.9" />
    <circle cx="53" cy="32" r="2.2" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="0.8" opacity="0.9" />
    <circle cx="44" cy="53" r="2.8" fill="#E0F2FE" stroke="#38BDF8" strokeWidth="0.8" opacity="0.9" />

    {/* Protection Shield with White Checkmark in Front */}
    <g filter="url(#smShadow)" transform="translate(46, 40)">
      <path
        d="M 11 1 C 11 1, 21 2.8, 21 9 C 21 18, 11 22, 11 22 C 11 22, 1 18, 1 9 C 1 2.8, 11 1, 11 1 Z"
        fill="url(#smShieldGrad)"
        stroke="#DBEAFE"
        strokeWidth="1.4"
      />
      {/* White Checkmark */}
      <path
        d="M 7 11 L 10 14 L 15.5 8.5"
        stroke="#FFFFFF"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);
