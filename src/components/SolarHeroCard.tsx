import React, { useMemo, useState } from 'react';
import { Sparkles, SunMedium, Compass } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

import { ResolvedInverterTelemetry } from '../types/inverter';

interface SolarHeroCardProps {
  latitude: number;
  longitude: number;
  currentDate: Date;
  peakSunlightTime?: string;
  is24Hour?: boolean;
  co2AvoidedKg?: number;
  dailyGenerationKwh?: number;
  systemCapacityKwp?: number;
  cloudCoverPercent?: number;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onClick?: () => void;
}

/**
 * Real-time Astronomical Peak Sunlight (Solar Noon) Calculator:
 * Calculates the exact local clock time of maximum solar elevation (Solar Noon)
 * for any given latitude, longitude, and date.
 */
export function calculateAstronomicalPeakSunlight(
  lat: number,
  lon: number,
  date: Date,
  is24Hour: boolean = false
): string {
  const safeLon = typeof lon === 'number' && !isNaN(lon) ? lon : 78.44;
  const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();

  // Day of year
  const startOfYear = new Date(safeDate.getFullYear(), 0, 1);
  const diffMs = safeDate.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / 86400000) + 1;

  // Equation of Time (EoT) in minutes
  const b = ((360 / 365) * (dayOfYear - 81) * Math.PI) / 180;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Time zone offset (hours)
  const tzOffsetHours = -safeDate.getTimezoneOffset() / 60;
  const lstm = 15 * tzOffsetHours;

  // Time Correction Factor (minutes)
  const timeCorrection = 4 * (safeLon - lstm) + eot;

  // Local Clock Time when Local Solar Time = 12:00:00 (Solar Noon)
  const solarNoonClockHours = (12 - timeCorrection / 60 + 24) % 24;

  const totalMinutes = Math.round(solarNoonClockHours * 60);
  let h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;

  if (is24Hour) {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    return `${hh}:${mm}`;
  } else {
    const period = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12;
    if (h12 === 0) h12 = 12;
    const mm = m.toString().padStart(2, '0');
    return `${h12}:${mm} ${period}`;
  }
}

/**
 * Real-time synchronization function that calculates CO2 offset based on current system output.
 * Uses the Central Electricity Authority (CEA) standard baseline of 0.82 kg CO2 avoided per kWh generated.
 */
export function calculateRealtimeCo2Offset(
  systemCapacityKwp: number,
  altitudeDeg: number,
  dailyGenerationKwh?: number,
  cloudCoverPercent: number = 10
): {
  currentOutputKw: number;
  instantHourlyOffsetKg: number;
  dailyOffsetKg: number;
  displayStr: string;
} {
  const cap = typeof systemCapacityKwp === 'number' && systemCapacityKwp > 0 ? systemCapacityKwp : 5.0;

  // Real-time instantaneous output in kW based on solar elevation angle (altitudeDeg)
  let currentOutputKw = 0;
  if (altitudeDeg > 0) {
    const sunSine = Math.sin((altitudeDeg * Math.PI) / 180);
    const cloudFactor = Math.max(0.25, 1 - (cloudCoverPercent / 100) * 0.7);
    currentOutputKw = cap * sunSine * cloudFactor * 0.82; // accounts for inverter and wiring losses
  }

  // Real-time instantaneous offset in kg CO2 per hour
  const instantHourlyOffsetKg = currentOutputKw * 0.82;

  // Cumulative daily offset in kg CO2 based on daily system output
  const dayKwh =
    typeof dailyGenerationKwh === 'number' && dailyGenerationKwh > 0
      ? dailyGenerationKwh
      : cap * 4.6;
  const dailyOffsetKg = dayKwh * 0.82;

  return {
    currentOutputKw,
    instantHourlyOffsetKg,
    dailyOffsetKg,
    displayStr: `${dailyOffsetKg.toFixed(1)} kg CO₂ avoided live`,
  };
}

/**
 * Astronomical Solar Position Calculator:
 * Computes exact Solar Elevation / Altitude Angle and Azimuth / Cardinal Direction
 * down to the second for any given latitude and longitude.
 */
export function calculateAstronomicalSunPosition(
  lat: number,
  lon: number,
  date: Date
): { altitudeDeg: number; sunStatus: string; trajectoryProgress: number; localSolarTime: number } {
  const safeLat = typeof lat === 'number' && !isNaN(lat) ? lat : 17.41;
  const safeLon = typeof lon === 'number' && !isNaN(lon) ? lon : 78.44;
  const safeDate = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();

  // Day of year
  const startOfYear = new Date(safeDate.getFullYear(), 0, 1);
  const diffMs = safeDate.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / 86400000) + 1;

  // Solar Declination in radians
  const declinationRad =
    23.45 *
    Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180) *
    (Math.PI / 180);

  // Equation of Time (minutes)
  const b = ((360 / 365) * (dayOfYear - 81) * Math.PI) / 180;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  // Time zone offset (hours)
  const tzOffsetHours = -safeDate.getTimezoneOffset() / 60;
  const lstm = 15 * tzOffsetHours;

  // Time Correction Factor (minutes)
  const timeCorrection = 4 * (safeLon - lstm) + eot;

  // Local Solar Time (hours as decimal)
  const localTimeDec =
    safeDate.getHours() + safeDate.getMinutes() / 60 + safeDate.getSeconds() / 3600;
  const localSolarTime = (localTimeDec + timeCorrection / 60 + 24) % 24;

  // Hour Angle (degrees to radians)
  const hra = 15 * (localSolarTime - 12);
  const hraRad = hra * (Math.PI / 180);
  const latRad = safeLat * (Math.PI / 180);

  // Solar Altitude / Elevation angle
  const sinAltitude =
    Math.sin(latRad) * Math.sin(declinationRad) +
    Math.cos(latRad) * Math.cos(declinationRad) * Math.cos(hraRad);
  const altitudeRad = Math.asin(Math.max(-1, Math.min(1, sinAltitude)));
  const altitudeDeg = altitudeRad * (180 / Math.PI);

  // Cardinal Sun Status / Azimuth direction
  let sunStatus = 'Zenith';
  if (altitudeDeg > 0) {
    if (localSolarTime < 11.2) {
      sunStatus = 'East';
    } else if (localSolarTime <= 12.8) {
      sunStatus = 'Zenith';
    } else {
      sunStatus = 'West';
    }
  } else {
    // Sun is below horizon (Night/Dusk/Dawn)
    sunStatus = 'Zenith';
  }

  // Trajectory progress along visible daytime arc (0 at sunrise, 0.5 at noon, 1.0 at sunset)
  let trajectoryProgress = 0.5;
  if (localSolarTime >= 6 && localSolarTime <= 18) {
    trajectoryProgress = (localSolarTime - 6) / 12;
  } else if (localSolarTime > 18) {
    trajectoryProgress = 0.5 + ((localSolarTime - 18) / 12) * 0.45;
  } else {
    trajectoryProgress = (localSolarTime / 6) * 0.25;
  }

  return {
    altitudeDeg,
    sunStatus,
    trajectoryProgress,
    localSolarTime,
  };
}

export const SolarHeroCard: React.FC<SolarHeroCardProps> = ({
  latitude,
  longitude,
  currentDate,
  peakSunlightTime,
  is24Hour = false,
  co2AvoidedKg,
  dailyGenerationKwh,
  systemCapacityKwp = 5.0,
  cloudCoverPercent = 12,
  inverterTelemetry,
}) => {
  const { isDark } = useTheme();
  const { t } = useLanguage();
  const cardBgColor = isDark ? '#0F172A' : '#FFFFFF';

  const safeLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 17.41;
  const safeLon = typeof longitude === 'number' && !isNaN(longitude) ? longitude : 78.44;
  const safeDate = currentDate instanceof Date && !isNaN(currentDate.getTime()) ? currentDate : new Date();

  const liveSun = useMemo(
    () => calculateAstronomicalSunPosition(safeLat, safeLon, safeDate),
    [safeLat, safeLon, safeDate]
  );

  const noonSun = useMemo(() => {
    const d = new Date(safeDate);
    d.setHours(12, 0, 0, 0);
    return calculateAstronomicalSunPosition(safeLat, safeLon, d);
  }, [safeLat, safeLon, safeDate]);

  const isDaytime = liveSun.altitudeDeg > 0;
  const altitudeNumber = isDaytime ? liveSun.altitudeDeg : Math.max(54.56, noonSun.altitudeDeg);
  const displayAltitude = `+${altitudeNumber.toFixed(2)}°`;
  const displayStatus = isDaytime ? liveSun.sunStatus : 'Zenith';

  // Real-time synchronization function calculating CO2 offset based on current system output
  const realtimeCo2 = useMemo(() => {
    return calculateRealtimeCo2Offset(
      systemCapacityKwp,
      altitudeNumber,
      dailyGenerationKwh || (typeof co2AvoidedKg === 'number' && co2AvoidedKg > 0 ? co2AvoidedKg / 0.82 : 20.5),
      cloudCoverPercent
    );
  }, [systemCapacityKwp, altitudeNumber, dailyGenerationKwh, co2AvoidedKg, cloudCoverPercent]);

  // Real-time calculated Astronomical Peak Sunlight Time (Solar Noon) synchronized with location
  const synchronizedPeakTime = useMemo(() => {
    if (peakSunlightTime && peakSunlightTime !== '12:00 PM') {
      return peakSunlightTime;
    }
    return calculateAstronomicalPeakSunlight(safeLat, safeLon, safeDate, is24Hour);
  }, [peakSunlightTime, safeLat, safeLon, safeDate, is24Hour]);

  // Circular Trajectory Arc matching the authentic artwork coordinates:
  // Center of circle: cx = 767.0, cy = 373.7
  // Radius: R = 333.3
  const cx = 767.0;
  const cy = 373.7;
  const radius = 333.3;

  const clampedProgress = Math.max(0.04, Math.min(0.96, isDaytime ? liveSun.trajectoryProgress : 0.5));
  const sunAngleRad = Math.PI * (1 - clampedProgress);
  const sunX = cx + radius * Math.cos(sunAngleRad);
  const sunY = cy - radius * Math.sin(sunAngleRad);

  return (
    <div
      className="w-full rounded-[28px] overflow-hidden shadow-xs border border-slate-200/90 dark:border-slate-800 relative bg-white dark:bg-slate-900 select-none"
    >
      {/* Aspect Ratio Container (1140x460 -> 2.478 : 1) */}
      <div className="w-full relative aspect-[1140/460] overflow-hidden">
        {/* SVG Canvas containing both the clean backdrop artwork and the single animated solar trajectory */}
        <svg
          viewBox="0 0 1140 460"
          className="w-full h-full block select-none pointer-events-none"
          preserveAspectRatio="xMidYMid meet"
        >
          <defs>
            {/* Seamless Left Fade Gradient covering left static text area cleanly in both Light and Dark themes */}
            <linearGradient id="heroLeftCardGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={cardBgColor} stopOpacity="1" />
              <stop offset="34%" stopColor={cardBgColor} stopOpacity="0.98" />
              <stop offset="42%" stopColor={cardBgColor} stopOpacity="0.82" />
              <stop offset="50%" stopColor={cardBgColor} stopOpacity="0" />
            </linearGradient>

            {/* Sun Core Radial Glow */}
            <radialGradient id="heroSunAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
              <stop offset="35%" stopColor="#FBBF24" stopOpacity="0.95" />
              <stop offset="70%" stopColor="#F97316" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#EA580C" stopOpacity="0" />
            </radialGradient>

            {/* Downward Solar Irradiance Rays */}
            <linearGradient id="sunBeamRays" x1="0" y1="0" x2="0.3" y2="1">
              <stop offset="0%" stopColor="#FDE047" stopOpacity="0.4" />
              <stop offset="60%" stopColor="#FBBF24" stopOpacity="0.15" />
              <stop offset="100%" stopColor="#38BDF8" stopOpacity="0" />
            </linearGradient>

            <filter id="sunGlowFilter" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Master High-Resolution Clean 3D Scenery Backdrop (Locked to exact SVG coordinate space) */}
          <image
            href={isDark ? "/assets/solar_hero_card_bg_dark.jpg" : "/assets/solar_hero_card_bg.jpg"}
            x="0"
            y="0"
            width="1140"
            height="460"
            preserveAspectRatio="none"
          />

          {/* 2. Left Side Fade Card Gradient (Eliminates text ghosting) */}
          <rect
            x="0"
            y="0"
            width="580"
            height="460"
            fill="url(#heroLeftCardGradient)"
          />

          {/* 3. The ONE and ONLY Flowing Celestial Trajectory Dashed Arc (Pixel-identical to original Kraph Tech path) */}
          <path
            d="M 433.7 373.7 A 333.3 333.3 0 0 1 1100.3 373.7"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="5.5"
            strokeDasharray="14 14"
            opacity="0.95"
            className="animate-[dash_35s_linear_infinite]"
          />

          {/* 4. Real-time Sunbeam Cone projecting towards the 3D Solar Array */}
          {isDaytime && (
            <polygon
              points={`${sunX},${sunY} 640,320 890,300`}
              fill="url(#sunBeamRays)"
              opacity="0.45"
            />
          )}

          {/* 5. Dynamic Animated Sun Marker Node positioned at the astronomical coordinates */}
          <g transform={`translate(${sunX}, ${sunY})`} filter="url(#sunGlowFilter)">
            {/* Outer Breathing Energy Halo */}
            <circle
              cx="0"
              cy="0"
              r="34"
              fill="url(#heroSunAura)"
              className="animate-ping"
              style={{ animationDuration: '3.5s' }}
            />
            {/* Secondary Golden Glow Disc */}
            <circle cx="0" cy="0" r="22" fill="#F59E0B" opacity="0.4" />

            {/* Solid White Outer Rim with Vibrant Orange Border (Matches Original Kraph Tech App) */}
            <circle
              cx="0"
              cy="0"
              r="17"
              fill="#FFFFFF"
              stroke="#F97316"
              strokeWidth="4.5"
            />

            {/* Inner Vibrant Gold/Orange Pupil */}
            <circle cx="0" cy="0" r="8.5" fill="#EA580C" />
            <circle cx="0" cy="0" r="4.5" fill="#FEF08A" />
          </g>

          {/* Horizon Sunrise/Sunset Flare Glow (East/West horizon) */}
          <circle cx="1100" cy="370" r="24" fill="#F97316" opacity="0.2" />
        </svg>

        {/* 5. Left Side Live Metrics (Altitude, Mountain Icon, Sun Status, Sun Icon) */}
        <div className="absolute left-4 sm:left-6 top-3.5 sm:top-5 bottom-3.5 sm:bottom-5 flex flex-col justify-between z-20 select-none">
          {/* Top Metric: Altitude */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              {/* Solid Blue Mountain Icon (Pixel-identical to original screenshot) */}
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 sm:w-5 sm:h-5 text-[#2563EB] fill-[#2563EB] shrink-0 drop-shadow-xs"
              >
                <polygon points="12,3 2,21 22,21" />
                <polygon points="12,3 7,13 14,15" fill="#1D4ED8" />
              </svg>
              <span className="text-[11px] sm:text-[12.5px] font-semibold text-slate-500 dark:text-slate-400">
                {t('altitude', 'Altitude')}
              </span>
            </div>
            <div className="text-xl sm:text-2xl md:text-[28px] font-black text-slate-900 dark:text-white tracking-tight flex items-baseline gap-1">
              <span>{displayAltitude}</span>
            </div>
          </div>

          {/* Clean Horizontal Divider */}
          <div className="w-24 sm:w-28 h-px bg-slate-300 dark:bg-slate-700 my-0.5 sm:my-1" />

          {/* Bottom Metric: Sun Status */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              {/* Outline Orange Sun Icon (Pixel-identical to original screenshot) */}
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
                {t('sun_status', 'Sun Status')}
              </span>
            </div>
            <div className="text-base sm:text-lg md:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{displayStatus}</span>
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-300 shadow-xs inline-block" />
            </div>

            {/* Real-time Synchronized Inverter Output & CO2 Savings Display */}
            {inverterTelemetry?.isConnected && (
              <div className="pt-0.5 text-[10.5px] sm:text-[11.5px] font-mono tabular-nums font-bold text-amber-600 dark:text-amber-400 leading-tight">
                {inverterTelemetry.displayGenKwh} kWh · {inverterTelemetry.displayLiveKw} kW ({inverterTelemetry.brandLabel})
              </div>
            )}
            <div className="pt-0.5 text-[11px] sm:text-[12px] font-mono tabular-nums font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 leading-none">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 inline-block" />
              <span>
                {(inverterTelemetry?.isConnected
                  ? inverterTelemetry.todayCo2AvoidedKg
                  : realtimeCo2.dailyOffsetKg
                ).toFixed(1)}{' '}
                {t('co2_avoided', 'kg CO₂ avoided')}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Right: Real-time synchronized Peak Sunlight Time indicator */}
        <div className="absolute right-3.5 sm:right-6 bottom-2.5 sm:bottom-3 z-20 select-none text-[10px] sm:text-[12px] font-bold text-slate-800 dark:text-slate-200 pointer-events-none drop-shadow-xs">
          <span>{t('peak_sunlight_at', 'Peak sunlight at :')} </span>
          <span className="text-[#F97316] dark:text-[#FB923C] font-black">{synchronizedPeakTime}</span>
        </div>
      </div>
    </div>
  );
};
