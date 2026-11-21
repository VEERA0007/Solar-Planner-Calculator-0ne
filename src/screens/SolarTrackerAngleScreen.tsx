import React, { useState } from 'react';
import {
  Compass,
  Sun,
  Maximize2,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Activity,
  CheckCircle2,
  Sliders,
  Info,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import {
  calculateOptimalTiltAngles,
  calculateDetailedSunAngles,
} from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SolarTrackerAngleScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  hideTopBar?: boolean;
}

export const SolarTrackerAngleScreen: React.FC<SolarTrackerAngleScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  hideTopBar = false,
}) => {
  const [activeTab, setActiveTab] = useState<'daily' | 'seasonal' | 'tracking'>('daily');
  const now = new Date();

  const tiltRecs = calculateOptimalTiltAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    now
  );

  const currentSun = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    now
  );

  // Compute 24-hour sun elevation points for today
  const hourlyElevation = [];
  for (let h = 5; h <= 19; h++) {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    const pos = calculateDetailedSunAngles(
      weather.latitude || 17.41,
      weather.longitude || 78.44,
      d
    );
    hourlyElevation.push({
      hour: h,
      label: `${h > 12 ? h - 12 : h}${h >= 12 ? 'PM' : 'AM'}`,
      altitude: Math.max(0, pos.altitudeDeg),
      azimuth: pos.azimuthDeg,
    });
  }

  // Solstice vs Equinox peak altitudes
  const lat = Math.abs(weather.latitude || 17.41);
  const summerSolsticeNoon = Math.min(90, 90 - lat + 23.45);
  const equinoxNoon = 90 - lat;
  const winterSolsticeNoon = Math.max(10, 90 - lat - 23.45);

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!hideTopBar && (
        <MaterialTopBar
          title="Solar Tracker & Optimal Angles"
          subtitle="Sun Path, Tilt Alignment & Yield Gain"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
        />
      )}

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Tab Switcher */}
        <div className="grid grid-cols-3 bg-slate-200/80 dark:bg-slate-800 p-1 rounded-2xl gap-1 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('daily')}
            className={`py-2 rounded-xl transition cursor-pointer text-center ${
              activeTab === 'daily'
                ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Day Curve
          </button>
          <button
            onClick={() => setActiveTab('seasonal')}
            className={`py-2 rounded-xl transition cursor-pointer text-center ${
              activeTab === 'seasonal'
                ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Seasonal Tilt
          </button>
          <button
            onClick={() => setActiveTab('tracking')}
            className={`py-2 rounded-xl transition cursor-pointer text-center ${
              activeTab === 'tracking'
                ? 'bg-white dark:bg-slate-900 text-sky-700 dark:text-sky-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Trackers (1X/2X)
          </button>
        </div>

        {/* TAB 1: DAILY SUN ELEVATION CURVE */}
        {activeTab === 'daily' && (
          <div className="space-y-4">
            {/* Chart Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Sun Altitude Curve (05:00 - 19:00)
                  </h3>
                  <p className="text-base font-extrabold text-slate-800 dark:text-slate-100">
                    Peak Elevation: {Math.max(...hourlyElevation.map((p) => p.altitude)).toFixed(1)}° at Solar Noon
                  </p>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center">
                  <Sun className="w-4 h-4 fill-current" />
                </div>
              </div>

              {/* SVG Curve Chart */}
              <div className="h-44 w-full relative pt-2">
                <svg className="w-full h-full" viewBox="0 0 320 120" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1="0" y1="20" x2="320" y2="20" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                  <line x1="0" y1="60" x2="320" y2="60" stroke="currentColor" className="text-slate-100 dark:text-slate-800" strokeWidth="1" />
                  <line x1="0" y1="100" x2="320" y2="100" stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeWidth="1.5" />

                  {/* Area fill */}
                  {(() => {
                    const points = hourlyElevation.map((pt, i) => {
                      const x = (i / (hourlyElevation.length - 1)) * 320;
                      const y = 100 - (pt.altitude / 90) * 85;
                      return `${x},${y}`;
                    });
                    const d = `M 0,100 L ${points.join(' L ')} L 320,100 Z`;
                    return <path d={d} fill="url(#elevationGrad)" />;
                  })()}

                  {/* Curve line */}
                  {(() => {
                    const points = hourlyElevation.map((pt, i) => {
                      const x = (i / (hourlyElevation.length - 1)) * 320;
                      const y = 100 - (pt.altitude / 90) * 85;
                      return `${x},${y}`;
                    });
                    const d = `M ${points.join(' L ')}`;
                    return <path d={d} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" />;
                  })()}

                  {/* Current sun dot on curve */}
                  {(() => {
                    const currentHour = now.getHours() + now.getMinutes() / 60;
                    if (currentHour >= 5 && currentHour <= 19) {
                      const fraction = (currentHour - 5) / 14;
                      const x = fraction * 320;
                      const y = 100 - (Math.max(0, currentSun.altitudeDeg) / 90) * 85;
                      return (
                        <g>
                          <circle cx={x} cy={y} r="6" fill="#f59e0b" stroke="#ffffff" strokeWidth="2" />
                          <circle cx={x} cy={y} r="12" fill="#f59e0b" opacity="0.25" />
                        </g>
                      );
                    }
                    return null;
                  })()}
                </svg>

                {/* X-axis labels */}
                <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                  <span>5 AM</span>
                  <span>9 AM</span>
                  <span>12 PM</span>
                  <span>3 PM</span>
                  <span>7 PM</span>
                </div>
              </div>
            </div>

            {/* Current Real-Time Angles Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-around text-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Current Sun Alt</span>
                <p className="text-xl font-black text-amber-500 mt-0.5">{currentSun.altitudeDeg.toFixed(1)}°</p>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Sun Azimuth</span>
                <p className="text-xl font-black text-sky-600 dark:text-sky-400 mt-0.5">{currentSun.azimuthDeg.toFixed(1)}°</p>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Optimal Azimuth</span>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{tiltRecs.optimalAzimuthDeg}°</p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SEASONAL TILT ANGLES */}
        {activeTab === 'seasonal' && (
          <div className="space-y-3">
            {/* Primary Recommendation Card */}
            <div className="bg-gradient-to-r from-sky-600 to-indigo-600 rounded-3xl p-5 text-white shadow-md">
              <span className="text-[11px] font-bold uppercase tracking-wider text-sky-200">
                Optimal Year-Round Fixed Tilt
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black">{tiltRecs.fixedYearRoundTiltDeg}°</span>
                <span className="text-sm font-semibold text-sky-100">
                  Facing {tiltRecs.optimalAzimuthFacing}
                </span>
              </div>
              <p className="text-xs text-sky-100/90 mt-2 leading-relaxed">
                Calibrated for latitude {weather.latitude.toFixed(2)}° to maximize annual kilowatt-hour energy generation.
              </p>
            </div>

            {/* Seasonal Adjustments Grid */}
            <div className="grid grid-cols-3 gap-2.5">
              {/* Summer */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs text-center">
                <span className="text-[10px] font-bold text-amber-500 uppercase">Summer Tilt</span>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-0.5">
                  {tiltRecs.summerTiltDeg}°
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Flatter angle (May - Jul)</p>
              </div>

              {/* Autumn / Spring */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs text-center">
                <span className="text-[10px] font-bold text-emerald-500 uppercase">Equinox Tilt</span>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-0.5">
                  {tiltRecs.springAutumnTiltDeg}°
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Mar & Sep Equinox</p>
              </div>

              {/* Winter */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl p-3 border border-slate-200 dark:border-slate-800 shadow-xs text-center">
                <span className="text-[10px] font-bold text-blue-500 uppercase">Winter Tilt</span>
                <p className="text-2xl font-black text-slate-800 dark:text-slate-100 mt-0.5">
                  {tiltRecs.winterTiltDeg}°
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">Steeper angle (Nov - Jan)</p>
              </div>
            </div>

            {/* Solstices & Equinox Peaks Card */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Annual Solstice Solar Noon Altitudes
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Summer Solstice (June 21)</span>
                  <span className="font-bold text-amber-500">{summerSolsticeNoon.toFixed(1)}°</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-amber-400 h-full rounded-full" style={{ width: `${(summerSolsticeNoon / 90) * 100}%` }}></div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Equinox (March / September 21)</span>
                  <span className="font-bold text-emerald-500">{equinoxNoon.toFixed(1)}°</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-emerald-400 h-full rounded-full" style={{ width: `${(equinoxNoon / 90) * 100}%` }}></div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Winter Solstice (December 21)</span>
                  <span className="font-bold text-blue-500">{winterSolsticeNoon.toFixed(1)}°</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-400 h-full rounded-full" style={{ width: `${(winterSolsticeNoon / 90) * 100}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TRACKING TECHNOLOGY (1X & 2X) */}
        {activeTab === 'tracking' && (
          <div className="space-y-3">
            {/* Single-Axis Tracker */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Single-Axis Tracker (Horizontal E-W)
                  </h4>
                  <p className="text-[11px] text-slate-400">Rotates throughout daytime following solar hour</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 text-xs font-extrabold">
                  +22% Yield
                </span>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Live Tracker Angle Now:</span>
                <span className="font-mono font-black text-base text-amber-500">
                  {tiltRecs.singleAxisAngleNowDeg > 0 ? `+${tiltRecs.singleAxisAngleNowDeg}° West` : `${tiltRecs.singleAxisAngleNowDeg}° East`}
                </span>
              </div>
            </div>

            {/* Dual-Axis Tracker */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Dual-Axis Tracker (Altitude + Azimuth)
                  </h4>
                  <p className="text-[11px] text-slate-400">Perpendicular solar beam alignment at all times</p>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950 text-purple-600 text-xs font-extrabold">
                  +34% Yield
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Target Tilt</span>
                  <p className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">
                    {tiltRecs.dualAxisTiltNowDeg}°
                  </p>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl">
                  <span className="text-[10px] text-slate-400 uppercase font-bold">Target Azimuth</span>
                  <p className="font-mono font-black text-sm text-purple-600 dark:text-purple-400">
                    {tiltRecs.dualAxisAzimuthNowDeg}°
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
