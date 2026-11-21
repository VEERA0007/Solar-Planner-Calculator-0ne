import React, { useState } from 'react';
import {
  Compass,
  Radio,
  Sparkles,
  Zap,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Satellite,
  Layers,
  Activity,
  ShieldCheck,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { getGeomagneticKpState, GeomagneticKpData } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SolarKpIndexScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
}

export const SolarKpIndexScreen: React.FC<SolarKpIndexScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
}) => {
  const [kpData] = useState<GeomagneticKpData>(() => getGeomagneticKpState());

  const stormScales = [
    { scale: 'G0', kp: '0-4', label: 'Quiet / Below Storm', color: 'bg-emerald-500' },
    { scale: 'G1', kp: '5', label: 'Minor Storm', color: 'bg-yellow-500' },
    { scale: 'G2', kp: '6', label: 'Moderate Storm', color: 'bg-amber-500' },
    { scale: 'G3', kp: '7', label: 'Strong Storm', color: 'bg-orange-500' },
    { scale: 'G4', kp: '8', label: 'Severe Storm', color: 'bg-red-500' },
    { scale: 'G5', kp: '9', label: 'Extreme Storm', color: 'bg-purple-600' },
  ];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      <MaterialTopBar
        title="Solar Kp-Index & Geomagnetism"
        subtitle="Space Weather, Aurora Boundary & Power Grids"
        showBack={true}
        onBack={() => onNavigate('dashboard')}
        weather={weather}
        onOpenWeather={onOpenWeather}
      />

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* 1. Main Kp-Index Hero Display */}
        <div className="bg-gradient-to-br from-indigo-700 via-sky-800 to-slate-900 rounded-[28px] p-5 text-white shadow-md relative overflow-hidden">
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
            <span className="text-base font-semibold text-sky-200">/ 9.0 Max</span>
          </div>

          <p className="text-xs text-sky-100/90 mt-2 leading-relaxed">
            Measures geomagnetic field disturbances caused by solar wind. Quiet conditions indicate stable power networks and minimal satellite drag.
          </p>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/20 text-xs">
            <div className="bg-white/10 rounded-xl p-2.5">
              <span className="text-[10px] text-sky-200 font-medium">Aurora Cutoff</span>
              <p className="font-bold text-white text-sm">Lat ≥ {kpData.auroraCutoffLatitudeDeg}°</p>
            </div>
            <div className="bg-white/10 rounded-xl p-2.5">
              <span className="text-[10px] text-sky-200 font-medium">Power Grid Impact</span>
              <p className="font-bold text-emerald-300 text-sm">Normal (GIC 0)</p>
            </div>
          </div>
        </div>

        {/* 2. 24-Hour Kp-Index History (3-Hour Intervals) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-sky-600" />
              <span>24-Hour Planetary Kp Timeline</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">NOAA WDC</span>
          </div>

          {/* Timeline Bar Chart */}
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

        {/* 3. Aurora Visibility Latitude Scope */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-purple-500" />
              <span>Aurora Borealis & Australis Visibility</span>
            </h3>
            <span className="text-xs font-bold text-purple-600 dark:text-purple-400">
              {kpData.auroraCutoffLatitudeDeg}° N/S
            </span>
          </div>

          <div className="bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 rounded-2xl p-3 text-xs leading-relaxed text-purple-950 dark:text-purple-200">
            {kpData.auroraVisibilityScope}
          </div>
        </div>

        {/* 4. Infrastructure & Environmental Impact Breakdown */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Infrastructure Environmental Impacts
          </h3>

          <div className="space-y-3 text-xs">
            <div className="flex items-start gap-3">
              <Zap className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Power Transmission Grids</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{kpData.gridImpactWarning}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Satellite className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Satellites & Orbital Drag</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{kpData.satelliteImpact}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Radio className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">HF Radio Communications</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{kpData.hfRadioImpact}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
