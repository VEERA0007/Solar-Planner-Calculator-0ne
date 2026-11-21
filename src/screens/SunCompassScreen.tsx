import React, { useState, useEffect } from 'react';
import {
  Compass,
  Map as MapIcon,
  Sun,
  Clock,
  RotateCw,
  Sliders,
  Navigation,
  Eye,
  Layers,
  Info,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { calculateDetailedSunAngles } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SunCompassScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  embedded?: boolean;
}

export const SunCompassScreen: React.FC<SunCompassScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  embedded = false,
}) => {
  const [viewMode, setViewMode] = useState<'compass' | 'map'>('compass');
  const [timeHourDec, setTimeHourDec] = useState<number>(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });
  const [isLive, setIsLive] = useState(true);
  const [compassHeading, setCompassHeading] = useState(0); // device heading if available

  // Live timer
  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      const now = new Date();
      setTimeHourDec(now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Orientation sensor for real mobile compass
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        setCompassHeading(e.alpha);
      }
    };
    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, []);

  const now = new Date();
  const dateAtTime = new Date();
  dateAtTime.setHours(Math.floor(timeHourDec), Math.floor((timeHourDec % 1) * 60), 0, 0);

  const sunData = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    dateAtTime
  );

  // Sunrise and Sunset dates for azimuth markers
  const riseDate = new Date();
  riseDate.setHours(6, 0, 0, 0);
  const sunriseSun = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    riseDate
  );

  const setDate = new Date();
  setDate.setHours(18, 0, 0, 0);
  const sunsetSun = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    setDate
  );

  // Shadow angle is opposite sun azimuth
  const shadowAzimuthDeg = (sunData.azimuthDeg + 180) % 360;

  // Format time
  const h = Math.floor(timeHourDec);
  const m = Math.floor((timeHourDec % 1) * 60);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const timeStr = `${displayH.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${period}`;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!embedded ? (
        <MaterialTopBar
          title="Sun Compass & Direction"
          subtitle="360° Real-Time Solar Azimuth & Map Beam"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
          actionButton={
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('compass')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'compass'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Dial</span>
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                  viewMode === 'map'
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
                }`}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>Map</span>
              </button>
            </div>
          }
        />
      ) : (
        <div className="px-4 pt-3 max-w-md mx-auto w-full flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              360° Sun Compass
            </h2>
            <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
              {weather.city} · Azimuth &amp; Shadow Ray
            </p>
          </div>
          <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('compass')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'compass'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Dial</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
          </div>
        </div>
      )}

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* Sun Angle Metrics Hero Ribbon */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Sun Direction
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-500">
                {sunData.azimuthDeg.toFixed(1)}°
              </span>
              <span className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                {sunData.cardinalDirection.split(' ')[0]}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Elevation: <strong className="text-sky-600 dark:text-sky-400">{sunData.altitudeDeg.toFixed(1)}°</strong>
            </p>
          </div>

          <div className="h-10 w-px bg-slate-200 dark:bg-slate-800"></div>

          <div className="space-y-0.5 text-right">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Shadow Angle
            </span>
            <div className="text-xl font-black text-slate-700 dark:text-slate-300">
              {shadowAzimuthDeg.toFixed(1)}°
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Factor: <strong className="text-purple-600 dark:text-purple-400">{sunData.shadowFactor}x</strong>
            </p>
          </div>
        </div>

        {/* VIEW MODE 1: 360-Degree Interactive Compass Rose */}
        {viewMode === 'compass' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center relative overflow-hidden">
            {/* Top North Badge */}
            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs font-extrabold border border-red-200 dark:border-red-900/50 mb-4">
              <Navigation className="w-3.5 h-3.5 fill-current" />
              <span>0° TRUE NORTH</span>
            </div>

            {/* Compass Dial Canvas */}
            <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
              {/* Outer Dial Circle with Degree Ticks */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 300">
                <circle
                  cx="150"
                  cy="150"
                  r="135"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-200 dark:text-slate-800"
                  strokeWidth="3"
                />
                <circle
                  cx="150"
                  cy="150"
                  r="115"
                  fill="none"
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800/60"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />

                {/* 12-Hour Radial Marks every 30 degrees */}
                {Array.from({ length: 12 }).map((_, i) => {
                  const deg = i * 30;
                  const rad = ((deg - 90) * Math.PI) / 180;
                  const x1 = 150 + 135 * Math.cos(rad);
                  const y1 = 150 + 135 * Math.sin(rad);
                  const x2 = 150 + (i % 3 === 0 ? 118 : 126) * Math.cos(rad);
                  const y2 = 150 + (i % 3 === 0 ? 118 : 126) * Math.sin(rad);
                  return (
                    <line
                      key={deg}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="currentColor"
                      className={
                        deg === 0
                          ? 'text-red-500 stroke-[3]'
                          : 'text-slate-400 dark:text-slate-600 stroke-[1.5]'
                      }
                    />
                  );
                })}

                {/* Cardinal Points Letters */}
                <text x="150" y="32" fill="#ef4444" fontSize="13" fontWeight="bold" textAnchor="middle">
                  N
                </text>
                <text x="274" y="154" fill="#64748b" fontSize="13" fontWeight="bold" textAnchor="middle">
                  E
                </text>
                <text x="150" y="278" fill="#64748b" fontSize="13" fontWeight="bold" textAnchor="middle">
                  S
                </text>
                <text x="26" y="154" fill="#64748b" fontSize="13" fontWeight="bold" textAnchor="middle">
                  W
                </text>

                {/* Sunrise Azimuth Marker */}
                {(() => {
                  const rad = ((sunriseSun.azimuthDeg - 90) * Math.PI) / 180;
                  const x = 150 + 135 * Math.cos(rad);
                  const y = 150 + 135 * Math.sin(rad);
                  return (
                    <g key="sunrise-marker">
                      <circle cx={x} cy={y} r="5" fill="#f59e0b" />
                    </g>
                  );
                })()}

                {/* Sunset Azimuth Marker */}
                {(() => {
                  const rad = ((sunsetSun.azimuthDeg - 90) * Math.PI) / 180;
                  const x = 150 + 135 * Math.cos(rad);
                  const y = 150 + 135 * Math.sin(rad);
                  return (
                    <g key="sunset-marker">
                      <circle cx={x} cy={y} r="5" fill="#ea580c" />
                    </g>
                  );
                })()}
              </svg>

              {/* Rotating Pointer Container */}
              <div
                className="absolute inset-0 flex items-center justify-center transition-transform duration-300"
                style={{ transform: `rotate(${sunData.azimuthDeg}deg)` }}
              >
                {/* Sun Needle (pointing UP at 0 relative) */}
                <div className="absolute top-4 flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 shadow-[0_0_15px_#f59e0b] border-2 border-white flex items-center justify-center animate-pulse">
                    <Sun className="w-6 h-6 text-slate-950 fill-amber-300" />
                  </div>
                  <div className="w-1 h-20 bg-gradient-to-b from-amber-400 to-amber-500/20 rounded-full mt-1"></div>
                </div>

                {/* Shadow Pointer (pointing DOWN opposite to sun) */}
                <div className="absolute bottom-5 flex flex-col items-center">
                  <div className="w-1 h-16 bg-gradient-to-t from-purple-500 to-purple-500/20 rounded-full mb-1"></div>
                  <div className="px-2 py-0.5 rounded-md bg-purple-900/80 text-purple-200 text-[9px] font-bold uppercase tracking-wider">
                    Shadow
                  </div>
                </div>

                {/* Center Pivot */}
                <div className="w-7 h-7 rounded-full bg-slate-900 border-3 border-amber-400 shadow-md z-10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                </div>
              </div>
            </div>

            {/* Sunrise & Sunset Compass Key */}
            <div className="flex items-center gap-6 mt-4 text-[11px] text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span>Sunrise: {sunriseSun.azimuthDeg.toFixed(0)}°</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
                <span>Sunset: {sunsetSun.azimuthDeg.toFixed(0)}°</span>
              </div>
            </div>
          </div>
        )}

        {/* VIEW MODE 2: Map View with Solar Ray Projection */}
        {viewMode === 'map' && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <MapIcon className="w-4 h-4 text-sky-600" />
                  <span>Sun Direction Ray on Map</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  {weather.city} · {weather.latitude.toFixed(3)}°N, {weather.longitude.toFixed(3)}°E
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 text-[10px] font-bold">
                True Orientation
              </span>
            </div>

            {/* Map Canvas with Solar Ray */}
            <div className="w-full h-64 rounded-2xl bg-slate-800 overflow-hidden relative shadow-inner flex items-center justify-center border border-slate-700/60">
              {/* Satellite background texture */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-70"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(30,58,138,0.3) 0%, rgba(15,23,42,0.85) 100%), repeating-linear-gradient(45deg, #1e293b 0px, #1e293b 10px, #0f172a 10px, #0f172a 20px)`,
                }}
              />

              {/* Grid Lines */}
              <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 opacity-20 pointer-events-none">
                {Array.from({ length: 36 }).map((_, i) => (
                  <div key={i} className="border border-white/20"></div>
                ))}
              </div>

              {/* User Location Marker (Center) */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-sky-500/30 border-2 border-sky-400 flex items-center justify-center shadow-lg">
                  <div className="w-3.5 h-3.5 rounded-full bg-sky-400 animate-ping"></div>
                </div>
                <span className="mt-1 px-2 py-0.5 rounded-md bg-black/80 text-white font-mono text-[9px] border border-white/20 shadow">
                  Your Location
                </span>
              </div>

              {/* Projected Solar Beam Ray from Center */}
              {(() => {
                const angleRad = ((sunData.azimuthDeg - 90) * Math.PI) / 180;
                const length = 115;
                const endX = 150 + length * Math.cos(angleRad);
                const endY = 150 + length * Math.sin(angleRad);

                const oppRad = ((shadowAzimuthDeg - 90) * Math.PI) / 180;
                const shadowX = 150 + 65 * Math.cos(oppRad);
                const shadowY = 150 + 65 * Math.sin(oppRad);

                return (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 300 300">
                    <defs>
                      <linearGradient id="solarRayGrad" x1="150" y1="150" x2={endX} y2={endY} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
                      </linearGradient>
                      <linearGradient id="shadowRayGrad" x1="150" y1="150" x2={shadowX} y2={shadowY} gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#a855f7" stopOpacity="0.7" />
                        <stop offset="100%" stopColor="#7e22ce" stopOpacity="0.2" />
                      </linearGradient>
                    </defs>

                    {/* Shadow Ray */}
                    <line x1="150" y1="150" x2={shadowX} y2={shadowY} stroke="url(#shadowRayGrad)" strokeWidth="3" strokeDasharray="4 3" />

                    {/* Sun Ray */}
                    <line x1="150" y1="150" x2={endX} y2={endY} stroke="url(#solarRayGrad)" strokeWidth="4" strokeLinecap="round" />

                    {/* Sun Disc at Ray End */}
                    <circle cx={endX} cy={endY} r="12" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx={endX} cy={endY} r="6" fill="#fef08a" />
                  </svg>
                );
              })()}

              {/* Map North Arrow */}
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 text-[10px] font-bold text-red-400 flex items-center gap-1">
                <span>▲</span>
                <span>N</span>
              </div>
            </div>
          </div>
        )}

        {/* Real-Time Day Movement Timeline Scrubber */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Time Scrub: {timeStr}
              </span>
            </div>
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                isLive
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              {isLive ? '● LIVE SYNC' : 'MANUAL'}
            </button>
          </div>

          <input
            type="range"
            min="5"
            max="19"
            step="0.05"
            value={timeHourDec}
            onChange={(e) => {
              setTimeHourDec(parseFloat(e.target.value));
              setIsLive(false);
            }}
            className="w-full accent-amber-500 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>05:00 Sunrise</span>
            <span>12:00 Solar Noon</span>
            <span>19:00 Sunset</span>
          </div>
        </div>
      </div>
    </div>
  );
};
