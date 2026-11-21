import React from 'react';

// 1. New Installation House with Solar Panels & Tree
export const NewInstallationHouseIcon: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="nihSun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="nihRoof" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2563EB" />
        <stop offset="100%" stopColor="#1E3A8A" />
      </linearGradient>
      <linearGradient id="nihWall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#E2E8F0" />
      </linearGradient>
      <linearGradient id="nihGrass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#86EFAC" />
        <stop offset="100%" stopColor="#22C55E" />
      </linearGradient>
      <filter id="nihShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Sun in background */}
    <circle cx="75" cy="22" r="12" fill="url(#nihSun)" filter="url(#nihShadow)" />
    <g stroke="#F59E0B" strokeWidth="2" strokeLinecap="round">
      <line x1="75" y1="6" x2="75" y2="2" />
      <line x1="91" y1="22" x2="95" y2="22" />
      <line x1="86" y1="11" x2="89" y2="8" />
      <line x1="86" y1="33" x2="89" y2="36" />
      <line x1="64" y1="11" x2="61" y2="8" />
    </g>

    {/* Lawn base */}
    <ellipse cx="50" cy="72" rx="42" ry="7" fill="url(#nihGrass)" />

    {/* House Body */}
    <g filter="url(#nihShadow)">
      <polygon points="18,44 48,30 78,44 78,68 18,68" fill="url(#nihWall)" />
      {/* Front door */}
      <rect x="42" y="52" width="12" height="16" rx="1.5" fill="#3B82F6" />
      <circle cx="45" cy="60" r="1" fill="#F8FAFC" />
      {/* Window */}
      <rect x="25" y="50" width="10" height="10" rx="1" fill="#93C5FD" stroke="#60A5FA" strokeWidth="1" />
      <line x1="30" y1="50" x2="30" y2="60" stroke="#FFFFFF" strokeWidth="1" />
      <line x1="25" y1="55" x2="35" y2="55" stroke="#FFFFFF" strokeWidth="1" />
      {/* Roof with Solar Panels */}
      <polygon points="48,22 14,44 82,44" fill="#3B82F6" />
      <polygon points="48,24 22,42 74,42" fill="url(#nihRoof)" stroke="#93C5FD" strokeWidth="1.2" />
      {/* Solar Grid Lines */}
      <line x1="48" y1="24" x2="48" y2="42" stroke="#60A5FA" strokeWidth="1" />
      <line x1="35" y1="33" x2="61" y2="33" stroke="#60A5FA" strokeWidth="1" />
      <line x1="28" y1="38" x2="68" y2="38" stroke="#60A5FA" strokeWidth="1" />
    </g>

    {/* Small green bush/tree */}
    <circle cx="78" cy="64" r="7" fill="#16A34A" />
    <circle cx="82" cy="61" r="5" fill="#22C55E" />
    <rect x="79" y="65" width="2.5" height="6" fill="#854D0E" />
  </svg>
);

// 2. Existing System Clipboard with Pulse & Bar Chart
export const ExistingSystemClipboardIcon: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="escGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="100%" stopColor="#EFF6FF" />
      </linearGradient>
      <linearGradient id="escBlue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#2563EB" />
      </linearGradient>
      <linearGradient id="escCheck" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4ADE80" />
        <stop offset="100%" stopColor="#16A34A" />
      </linearGradient>
      <filter id="escShadow" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.15" />
      </filter>
    </defs>

    {/* Clipboard Base */}
    <g filter="url(#escShadow)">
      <rect x="24" y="14" width="48" height="58" rx="8" fill="url(#escGrad)" stroke="#3B82F6" strokeWidth="2.5" />
      {/* Top Clip */}
      <rect x="38" y="9" width="20" height="9" rx="3" fill="#1E40AF" />
      <rect x="42" y="11" width="12" height="4" rx="2" fill="#93C5FD" />

      {/* Pulse / Waveform line */}
      <path
        d="M32 30 L38 30 L41 24 L45 36 L48 27 L51 30 L64 30"
        stroke="#3B82F6"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Bar Chart Bars */}
      <rect x="33" y="48" width="5.5" height="12" rx="1.5" fill="#93C5FD" />
      <rect x="41.5" y="42" width="5.5" height="18" rx="1.5" fill="#60A5FA" />
      <rect x="50" y="37" width="5.5" height="23" rx="1.5" fill="#2563EB" />
      <rect x="58.5" y="44" width="5.5" height="16" rx="1.5" fill="#3B82F6" />
    </g>

    {/* Green Circle with White Checkmark Badge */}
    <g filter="url(#escShadow)">
      <circle cx="68" cy="62" r="11" fill="url(#escCheck)" stroke="#FFFFFF" strokeWidth="2.5" />
      <path
        d="M63 62 L67 66 L74 58"
        stroke="#FFFFFF"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  </svg>
);

// 3. Metric 1: Daily Usage Lightbulb with Speedometer Gauge
export const DailyUsageGaugeIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="duBulb" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FEF08A" />
        <stop offset="60%" stopColor="#FBBF24" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="duGauge" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#22C55E" />
        <stop offset="50%" stopColor="#EAB308" />
        <stop offset="100%" stopColor="#EF4444" />
      </linearGradient>
    </defs>
    {/* Gauge Arc */}
    <path
      d="M12 44 A 22 22 0 1 1 52 44"
      stroke="url(#duGauge)"
      strokeWidth="5"
      strokeLinecap="round"
    />
    {/* Lightbulb in Center */}
    <circle cx="32" cy="27" r="11" fill="url(#duBulb)" />
    <path d="M26 34 L38 34 L36 40 L28 40 Z" fill="#94A3B8" />
    <rect x="29" y="40" width="6" height="2" rx="1" fill="#64748B" />
    {/* Lightning Bolt */}
    <path
      d="M32 20 L28 27 L33 27 L30 34 L37 26 L32 26 Z"
      fill="#FFFFFF"
    />
    {/* Speedometer Needle */}
    <circle cx="32" cy="44" r="3.5" fill="#0F172A" />
    <line x1="32" y1="44" x2="44" y2="28" stroke="#DC2626" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);

// 4. Metric 2: System Size Solar Panel on Grass with Sun
export const SystemSizeSolarIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="sssSun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="sssPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="60%" stopColor="#2563EB" />
        <stop offset="100%" stopColor="#1E3A8A" />
      </linearGradient>
    </defs>
    {/* Sun in top right */}
    <circle cx="50" cy="15" r="7" fill="url(#sssSun)" />
    <g stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round">
      <line x1="50" y1="5" x2="50" y2="2" />
      <line x1="60" y1="15" x2="63" y2="15" />
      <line x1="57" y1="8" x2="59" y2="6" />
      <line x1="57" y1="22" x2="59" y2="24" />
    </g>
    {/* Grass Base */}
    <ellipse cx="32" cy="56" rx="26" ry="5" fill="#86EFAC" />
    {/* Panel Legs */}
    <line x1="22" y1="38" x2="24" y2="52" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
    <line x1="42" y1="36" x2="40" y2="52" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round" />
    {/* Solar PV Panel */}
    <polygon points="12,38 46,26 56,44 18,52" fill="url(#sssPanel)" stroke="#E2E8F0" strokeWidth="1.2" />
    <line x1="30" y1="32" x2="38" y2="48" stroke="#93C5FD" strokeWidth="1" />
    <line x1="15" y1="45" x2="51" y2="35" stroke="#93C5FD" strokeWidth="1" />
  </svg>
);

// 5. Metric 3: No. of Panels Array
export const PanelArrayIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="paGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="70%" stopColor="#1E40AF" />
      </linearGradient>
    </defs>
    <ellipse cx="32" cy="56" rx="26" ry="4" fill="#86EFAC" />
    {/* Front Row */}
    <polygon points="8,40 28,34 33,50 11,54" fill="url(#paGrad)" stroke="#FFFFFF" strokeWidth="1" />
    <line x1="20" y1="36" x2="23" y2="52" stroke="#93C5FD" strokeWidth="0.8" />
    <line x1="9" y1="47" x2="31" y2="42" stroke="#93C5FD" strokeWidth="0.8" />

    <polygon points="32,34 52,28 57,44 35,48" fill="url(#paGrad)" stroke="#FFFFFF" strokeWidth="1" />
    <line x1="44" y1="30" x2="47" y2="46" stroke="#93C5FD" strokeWidth="0.8" />
    <line x1="33" y1="41" x2="55" y2="36" stroke="#93C5FD" strokeWidth="0.8" />

    {/* Back Row (Elevated) */}
    <polygon points="12,28 28,24 32,35 15,38" fill="url(#paGrad)" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.9" />
    <polygon points="32,24 48,20 52,31 35,34" fill="url(#paGrad)" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.9" />
  </svg>
);

// 6. Metric 4: Roof Area Needed Isometric House with 6m x 6m dimension markers
export const RoofAreaHouseIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="rahRoof" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
    </defs>
    {/* House walls */}
    <polygon points="12,38 32,48 32,60 12,50" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
    <polygon points="32,48 52,38 52,50 32,60" fill="#CBD5E1" stroke="#94A3B8" strokeWidth="1" />
    {/* Rooftop Solar Surface */}
    <polygon points="32,22 12,32 32,42 52,32" fill="url(#rahRoof)" stroke="#FFFFFF" strokeWidth="1.2" />
    {/* Grid lines on roof */}
    <line x1="22" y1="27" x2="42" y2="37" stroke="#93C5FD" strokeWidth="0.8" />
    <line x1="42" y1="27" x2="22" y2="37" stroke="#93C5FD" strokeWidth="0.8" />
    {/* Dimension lines (6m) */}
    <path d="M10,34 L8,33 M8,33 L28,23 M28,23 L26,22" stroke="#64748B" strokeWidth="0.8" strokeDasharray="1 1" />
    <text x="14" y="27" fill="#64748B" fontSize="6" fontFamily="sans-serif">6m</text>
    <path d="M54,34 L56,33 M56,33 L36,23 M36,23 L34,22" stroke="#64748B" strokeWidth="0.8" strokeDasharray="1 1" />
    <text x="44" y="27" fill="#64748B" fontSize="6" fontFamily="sans-serif">6m</text>
  </svg>
);

// 7. Roof Sun House Banner (Charming header banner for Estimation screen)
export const RoofSunHouseBannerIcon: React.FC<{ className?: string }> = ({
  className = 'w-24 h-16',
}) => (
  <svg viewBox="0 0 120 70" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="rshbSun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="rshbRoof" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#2563EB" />
        <stop offset="100%" stopColor="#1E3A8A" />
      </linearGradient>
    </defs>
    {/* Sun in top right */}
    <circle cx="98" cy="18" r="10" fill="url(#rshbSun)" />
    <g stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round">
      <line x1="98" y1="4" x2="98" y2="1" />
      <line x1="112" y1="18" x2="115" y2="18" />
      <line x1="108" y1="8" x2="110" y2="6" />
      <line x1="108" y1="28" x2="110" y2="30" />
      <line x1="88" y1="8" x2="86" y2="6" />
    </g>

    {/* Green lawn */}
    <ellipse cx="65" cy="65" rx="50" ry="5" fill="#86EFAC" />

    {/* Trees on Left */}
    <circle cx="28" cy="46" r="10" fill="#22C55E" />
    <circle cx="22" cy="50" r="7" fill="#16A34A" />
    <rect x="26" y="52" width="3" height="12" fill="#854D0E" />

    {/* Modern House */}
    {/* Walls */}
    <polygon points="40,36 78,25 94,36 94,62 40,62" fill="#F8FAFC" stroke="#E2E8F0" strokeWidth="1" />
    <rect x="52" y="46" width="10" height="16" fill="#1E293B" rx="1" />
    <rect x="70" y="44" width="14" height="10" fill="#93C5FD" rx="1" stroke="#38BDF8" strokeWidth="0.8" />
    {/* Rooftop Solar Panels */}
    <polygon points="36,36 76,24 94,36 54,44" fill="#3B82F6" stroke="#93C5FD" strokeWidth="1" />
    <polygon points="40,35 74,25 90,35 56,42" fill="url(#rshbRoof)" />
    {/* Panel Grids */}
    <line x1="56" y1="30" x2="72" y2="38" stroke="#60A5FA" strokeWidth="0.8" />
    <line x1="48" y1="37" x2="82" y2="29" stroke="#60A5FA" strokeWidth="0.8" />
  </svg>
);

// 8. Solar Panel on Pedestal with Leaf
export const SolarPanelPedestalIcon: React.FC<{ className?: string }> = ({
  className = 'w-16 h-16',
}) => (
  <svg viewBox="0 0 80 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="sppGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#1E3A8A" />
      </linearGradient>
    </defs>
    {/* Pedestal Stand */}
    <ellipse cx="40" cy="54" rx="18" ry="3.5" fill="#E2E8F0" stroke="#CBD5E1" strokeWidth="1" />
    <rect x="38" y="38" width="4" height="16" fill="#94A3B8" rx="1" />

    {/* Solar PV Panel */}
    <polygon points="16,36 48,18 68,30 34,46" fill="url(#sppGrad)" stroke="#FFFFFF" strokeWidth="1.5" />
    <line x1="32" y1="27" x2="50" y2="38" stroke="#93C5FD" strokeWidth="1" />
    <line x1="25" y1="40" x2="57" y2="24" stroke="#93C5FD" strokeWidth="1" />

    {/* Green Leaf sprout */}
    <path
      d="M58 40 C65 32 74 34 76 42 C68 44 64 42 58 40 Z"
      fill="#22C55E"
    />
    <path
      d="M59 40 C64 43 70 47 72 52 C67 52 62 48 59 40 Z"
      fill="#16A34A"
    />
  </svg>
);

// 9. Eco Leaf Solar Graphic
export const EcoLeafSolarIcon: React.FC<{ className?: string }> = ({
  className = 'w-14 h-14',
}) => (
  <svg viewBox="0 0 70 50" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="elsSun" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#F59E0B" />
      </linearGradient>
      <linearGradient id="elsPanel" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#38BDF8" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
    </defs>
    {/* Sun */}
    <circle cx="56" cy="14" r="8" fill="url(#elsSun)" />
    {/* Grass */}
    <ellipse cx="42" cy="44" rx="22" ry="3.5" fill="#86EFAC" />
    {/* Panel */}
    <polygon points="20,28 48,16 58,32 30,42" fill="url(#elsPanel)" stroke="#FFFFFF" strokeWidth="1" />
    <line x1="34" y1="22" x2="44" y2="37" stroke="#93C5FD" strokeWidth="0.8" />
    <line x1="25" y1="35" x2="52" y2="24" stroke="#93C5FD" strokeWidth="0.8" />
    {/* Plant */}
    <circle cx="60" cy="38" r="5" fill="#22C55E" />
  </svg>
);

// 10. Blue Wallet with Coins Icon
export const WalletSavingsIcon: React.FC<{ className?: string }> = ({
  className = 'w-10 h-10',
}) => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <defs>
      <linearGradient id="wsWallet" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#60A5FA" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>
      <linearGradient id="wsCoin" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FDE047" />
        <stop offset="100%" stopColor="#EAB308" />
      </linearGradient>
    </defs>
    {/* Gold coins popping out */}
    <circle cx="20" cy="14" r="6" fill="url(#wsCoin)" stroke="#CA8A04" strokeWidth="1" />
    <circle cx="28" cy="12" r="5" fill="url(#wsCoin)" stroke="#CA8A04" strokeWidth="1" />
    {/* Wallet body */}
    <rect x="6" y="16" width="36" height="24" rx="5" fill="url(#wsWallet)" stroke="#93C5FD" strokeWidth="1.2" />
    {/* Clasp / Flap */}
    <path d="M6 22 L24 22 C26 22 28 24 28 26 L28 30 C28 32 26 34 24 34 L6 34 Z" fill="#2563EB" />
    <circle cx="24" cy="28" r="2.5" fill="#FDE047" />
  </svg>
);
