import React, { useState } from 'react';
import {
  Flame,
  Radio,
  Activity,
  AlertTriangle,
  Zap,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Layers,
  Info,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { getSolarFluxState, SolarFluxData } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SolarFluxScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
}

export const SolarFluxScreen: React.FC<SolarFluxScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
}) => {
  const [fluxData] = useState<SolarFluxData>(() => getSolarFluxState());

  const flareClasses = [
    { name: 'A', range: '< 10⁻⁷ W/m²', desc: 'Negligible background noise', color: 'bg-emerald-500' },
    { name: 'B', range: '10⁻⁷ - 10⁻⁶', desc: 'Normal quiet sun conditions', color: 'bg-sky-500' },
    { name: 'C', range: '10⁻⁶ - 10⁻⁵', desc: 'Minor flares, negligible Earth impact', color: 'bg-amber-500' },
    { name: 'M', range: '10⁻⁵ - 10⁻⁴', desc: 'Moderate flares, brief polar blackouts', color: 'bg-orange-500' },
    { name: 'X', range: '> 10⁻⁴ W/m²', desc: 'Major intense solar flare bursts', color: 'bg-red-500' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      <MaterialTopBar
        title="Solar Flux & X-Ray Flares"
        subtitle="Sun Radio Emissions & Space Weather Activity"
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={weather}
        onOpenWeather={onOpenWeather}
      />

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* 1. Primary Radio Flux Index Card (F10.7) */}
        <div className="bg-gradient-to-br from-amber-600 via-orange-600 to-red-600 rounded-[28px] p-5 text-white shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-200 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              <span>10.7 cm Solar Radio Flux</span>
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
            Measures 2800 MHz solar microwave radiation. Indicates active solar magnetic fields and ionospheric density.
          </p>

          {/* Quick metric chips */}
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

        {/* 2. X-Ray Flare Class Meter (A, B, C, M, X) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-orange-500" />
              <span>X-Ray Flux Level (GOES Satellite)</span>
            </h3>
            <span className="font-mono font-bold text-xs text-amber-500">
              {fluxData.xrayFlareClass}{fluxData.xrayClassSublevel}
            </span>
          </div>

          {/* 5-Segment Visual Gauge */}
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

          {/* Current Flare Status Description */}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3 flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold text-amber-900 dark:text-amber-200">
                {fluxData.flareIntensityDescription}
              </p>
              <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Solar panels and terrestrial equipment operating normally. No geomagnetic satellite anomalies detected.
              </p>
            </div>
          </div>
        </div>

        {/* 3. 24-Hour Flare Probabilities */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            24-Hour Solar Flare Forecast Odds
          </h3>

          <div className="space-y-2.5 text-xs">
            {/* C-Class */}
            <div>
              <div className="flex justify-between font-bold mb-1">
                <span className="text-amber-600 dark:text-amber-400">C-Class Flare Probability</span>
                <span className="font-mono">{fluxData.flareProbability24h.cClassPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-amber-500 h-full rounded-full transition-all"
                  style={{ width: `${fluxData.flareProbability24h.cClassPercent}%` }}
                ></div>
              </div>
            </div>

            {/* M-Class */}
            <div>
              <div className="flex justify-between font-bold mb-1">
                <span className="text-orange-600 dark:text-orange-400">M-Class Flare (Moderate)</span>
                <span className="font-mono">{fluxData.flareProbability24h.mClassPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-orange-500 h-full rounded-full transition-all"
                  style={{ width: `${fluxData.flareProbability24h.mClassPercent}%` }}
                ></div>
              </div>
            </div>

            {/* X-Class */}
            <div>
              <div className="flex justify-between font-bold mb-1">
                <span className="text-red-600 dark:text-red-400">X-Class Flare (Severe)</span>
                <span className="font-mono">{fluxData.flareProbability24h.xClassPercent}%</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full rounded-full transition-all"
                  style={{ width: `${fluxData.flareProbability24h.xClassPercent}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Recent Solar Flare Events Log */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-sky-500" />
            <span>Recent Solar Flares Timeline</span>
          </h3>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {fluxData.recentFlares.map((flare, idx) => (
              <div key={idx} className="py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-mono font-bold text-[11px]">
                    {flare.class}
                  </span>
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{flare.region}</span>
                    <p className="text-[10px] text-slate-400">Duration: {flare.duration}</p>
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-slate-400">{flare.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
