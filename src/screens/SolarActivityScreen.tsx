import React, { useEffect, useState } from 'react';
import {
  Flame,
  Radio,
  Activity,
  Sparkles,
  Zap,
  Globe,
  Satellite,
  ShieldCheck,
  ChevronLeft,
  Calendar,
  Layers,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { getSolarFluxState, getGeomagneticKpState } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SolarActivityScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  initialTab?: 'flux' | 'kp' | 'daily_report';
  hideTopBar?: boolean;
}

export const SolarActivityScreen: React.FC<SolarActivityScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  initialTab = 'flux',
  hideTopBar = false,
}) => {
  const [activeTab, setActiveTab] = useState<'flux' | 'kp' | 'daily_report'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const fluxData = getSolarFluxState();
  const kpData = getGeomagneticKpState();

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!hideTopBar && (
        <MaterialTopBar
          title="Solar Activity & Space Weather"
          subtitle="Solar Radio Flux, Geomagnetic Kp-Index & Alerts"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
        />
      )}

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Unified Top Tab Switcher */}
        <div className="grid grid-cols-3 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl gap-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('flux')}
            className={`py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'flux'
                ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>Radio Flux</span>
          </button>
          <button
            onClick={() => setActiveTab('kp')}
            className={`py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'kp'
                ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Kp-Index</span>
          </button>
          <button
            onClick={() => setActiveTab('daily_report')}
            className={`py-2 rounded-xl transition cursor-pointer text-center flex items-center justify-center gap-1.5 ${
              activeTab === 'daily_report'
                ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sun Report</span>
          </button>
        </div>

        {/* TAB 1: SOLAR FLUX & X-RAY FLARES */}
        {activeTab === 'flux' && (
          <div className="space-y-4">
            {/* Primary Flux Card */}
            <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-red-600 rounded-[28px] p-5 text-white shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 animate-pulse" />
                  <span>10.7 cm Radio Emissions</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-black/30 backdrop-blur-xs text-[10px] font-extrabold text-amber-200 border border-white/20">
                  {fluxData.radioFluxRating}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h2 className="text-4xl font-black tracking-tight">{fluxData.f107RadioFluxSfu}</h2>
                <span className="text-lg font-bold text-amber-200">sfu</span>
              </div>

              <p className="text-xs text-amber-100/90 mt-2 leading-relaxed">
                Measures the Sun's 2800 MHz microwave radio flux. Higher values correlate with elevated solar flares and solar radiation storm risks.
              </p>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/20 text-xs">
                <div className="bg-black/20 rounded-xl p-2">
                  <span className="text-[10px] text-amber-200">Active Sunspot Regions</span>
                  <p className="font-bold text-white text-sm">{fluxData.activeRegionsCount} Active Groups</p>
                </div>
                <div className="bg-black/20 rounded-xl p-2">
                  <span className="text-[10px] text-amber-200">Current Flare Activity</span>
                  <p className="font-bold text-white text-sm">{fluxData.xrayFlareClass}{fluxData.xrayClassSublevel} Class</p>
                </div>
              </div>
            </div>

            {/* X-Ray Flare Meter (A, B, C, M, X) */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>GOES X-Ray Flare Meter (A, B, C, M, X)</span>
                </h3>
                <span className="font-mono font-bold text-xs text-amber-500">
                  {fluxData.xrayFlareClass}{fluxData.xrayClassSublevel}
                </span>
              </div>

              <div className="space-y-1.5">
                <div className="grid grid-cols-5 gap-1.5 h-3">
                  <div className="rounded-l-full bg-emerald-500 opacity-90"></div>
                  <div className="bg-sky-500 opacity-90"></div>
                  <div className="bg-amber-500 ring-2 ring-amber-400 shadow-[0_0_10px_#f59e0b] animate-pulse"></div>
                  <div className="bg-orange-500/30"></div>
                  <div className="rounded-r-full bg-red-500/30"></div>
                </div>

                <div className="grid grid-cols-5 text-center text-[11px] font-extrabold text-slate-500 dark:text-slate-400">
                  <span className="text-emerald-500">A</span>
                  <span className="text-sky-500">B</span>
                  <span className="text-amber-500">C (Current)</span>
                  <span>M</span>
                  <span>X</span>
                </div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3 flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-amber-900 dark:text-amber-200">
                    {fluxData.flareIntensityDescription}
                  </p>
                  <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                    No high-frequency radio blackouts or solar panel telemetry degradation expected today.
                  </p>
                </div>
              </div>
            </div>

            {/* 24h Probabilities */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5 text-xs">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                24-Hour Flare Probability
              </h4>
              <div className="flex justify-between font-bold">
                <span className="text-amber-600">C-Class: {fluxData.flareProbability24h.cClassPercent}%</span>
                <span className="text-orange-600">M-Class: {fluxData.flareProbability24h.mClassPercent}%</span>
                <span className="text-red-600">X-Class: {fluxData.flareProbability24h.xClassPercent}%</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: GEOMAGNETIC KP-INDEX */}
        {activeTab === 'kp' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-indigo-700 via-sky-800 to-slate-900 rounded-[28px] p-5 text-white shadow-md">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Planetary Kp-Index</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-[10px] font-extrabold uppercase">
                  {kpData.stormScale} · {kpData.stormLevelName}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h2 className="text-5xl font-black tracking-tight">{kpData.kpIndex.toFixed(2)}</h2>
                <span className="text-base font-semibold text-sky-200">/ 9.0 Scale</span>
              </div>

              <p className="text-xs text-sky-100/90 mt-2 leading-relaxed">
                Monitors global geomagnetic storms, auroral oval extensions, and electrical power grid induced currents.
              </p>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/20 text-xs">
                <div className="bg-white/10 rounded-xl p-2.5">
                  <span className="text-[10px] text-sky-200 font-medium">Aurora Cutoff Lat</span>
                  <p className="font-bold text-white text-sm">≥ {kpData.auroraCutoffLatitudeDeg}° N/S</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5">
                  <span className="text-[10px] text-sky-200 font-medium">GIC Grid Storm Risk</span>
                  <p className="font-bold text-emerald-300 text-sm">Minimal / G0 Quiet</p>
                </div>
              </div>
            </div>

            {/* 24h Kp Timeline */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-600" />
                  <span>24-Hour Kp History (3-Hour Blocks)</span>
                </h3>
                <span className="text-[10px] font-mono text-slate-400">NOAA WDC</span>
              </div>

              <div className="flex items-end justify-between h-28 pt-2 gap-1.5">
                {kpData.hourlyHistory.map((item, idx) => {
                  const heightPercent = (item.kp / 9) * 100;
                  const isHigh = item.kp >= 5;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-400">
                        {item.kp.toFixed(1)}
                      </span>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-t-lg h-full flex items-end overflow-hidden">
                        <div
                          className={`w-full rounded-t-lg transition-all ${
                            isHigh ? 'bg-amber-500' : 'bg-sky-500'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        ></div>
                      </div>
                      <span className="text-[9px] font-mono text-slate-400">{item.hour}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aurora Boundary Box */}
            <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 rounded-3xl p-4 text-xs leading-relaxed text-purple-950 dark:text-purple-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>Aurora Visibility Boundary: Lat ≥ {kpData.auroraCutoffLatitudeDeg}°</span>
              </div>
              <p className="text-[11px] text-purple-900/80 dark:text-purple-300/80">
                {kpData.auroraVisibilityScope}
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: DAILY SUN REPORT & ALERTS */}
        {activeTab === 'daily_report' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-sky-600 via-blue-600 to-indigo-700 rounded-[28px] p-5 text-white shadow-md">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Daily Sun Intelligence Report</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-black/20 text-sky-100 text-[10px] font-extrabold">
                  {weather.city.split(',')[0]}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h2 className="text-4xl font-black tracking-tight">{weather.peakSunHoursEstimated}</h2>
                <span className="text-lg font-bold text-sky-200">Peak Sun Hours</span>
              </div>

              <p className="text-xs text-sky-100/90 mt-2 leading-relaxed">
                Clear sky factor is {(weather.cloudImpactRatio * 100).toFixed(0)}%. Prime power window is between 10:00 AM and 03:00 PM.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Solar Irradiance (GHI)</span>
                <p className="font-mono font-black text-lg text-amber-500 mt-0.5">
                  {weather.globalHorizontalIrradianceWpm2} W/m²
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase">UV Radiation Index</span>
                <p className="font-mono font-black text-lg text-purple-600 dark:text-purple-400 mt-0.5">
                  {weather.uvIndex}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Sunrise / Sunset</span>
                <p className="font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                  {weather.sunrise} - {weather.sunset}
                </p>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs">
                <span className="text-[10px] text-slate-400 font-bold uppercase">Weather Status</span>
                <p className="font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
                  {weather.weatherDescription}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
