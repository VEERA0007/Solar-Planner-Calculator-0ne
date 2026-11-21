import React, { useState, useEffect } from 'react';
import {
  Sun,
  Sunrise,
  Sunset,
  Clock,
  Compass,
  Zap,
  Globe,
  Sliders,
  Sparkles,
  Info,
  Calendar,
  Layers,
  ChevronRight,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { calculateDetailedSunAngles } from '../utils/solarMath';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface SunTimerScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  embedded?: boolean;
}

export const SunTimerScreen: React.FC<SunTimerScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  embedded = false,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  const [timeHourDec, setTimeHourDec] = useState<number>(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });

  const [isLive, setIsLive] = useState(true);

  useEffect(() => {
    if (!isLive) return;
    const interval = setInterval(() => {
      const now = new Date();
      setTimeHourDec(now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Compute date object
  const currentDate = new Date(selectedDate);
  const h = Math.floor(timeHourDec);
  const m = Math.floor((timeHourDec - h) * 60);
  currentDate.setHours(h, m, 0, 0);

  const sun = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    currentDate
  );

  const tzHours = -new Date().getTimezoneOffset() / 60;
  const lstm = 15 * tzHours;

  // Format time
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const timeFormatted = `${displayH.toString().padStart(2, '0')}:${m
    .toString()
    .padStart(2, '0')} ${ampm}`;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!embedded && (
        <MaterialTopBar
          title="Sun Timer & Solar Angles"
          subtitle="Ephemeris, Day Length & Solar Efficiency"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
        />
      )}

      <div className="p-4 space-y-4 max-w-md mx-auto w-full">
        {/* 1. Sunrise / Sunset / Day Length Card */}
        <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 rounded-[28px] p-5 text-white shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-100 flex items-center gap-1.5">
                <Sun className="w-3.5 h-3.5 fill-current" />
                <span>Daylight Duration</span>
              </span>
              <h2 className="text-3xl font-black tracking-tight mt-0.5">
                {sun.dayLengthFormatted}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-200">
                Solar Noon
              </span>
              <p className="text-lg font-extrabold text-white">{sun.solarNoonTime}</p>
            </div>
          </div>

          {/* Sunrise and Sunset times */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/20">
            <div className="flex items-center gap-3 bg-black/15 backdrop-blur-xs rounded-2xl p-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/30 flex items-center justify-center shrink-0">
                <Sunrise className="w-5 h-5 text-amber-200" />
              </div>
              <div>
                <p className="text-[10px] text-amber-100 font-medium">Sunrise</p>
                <p className="text-sm font-bold text-white">{sun.sunriseTime}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-black/15 backdrop-blur-xs rounded-2xl p-2.5">
              <div className="w-9 h-9 rounded-xl bg-orange-400/30 flex items-center justify-center shrink-0">
                <Sunset className="w-5 h-5 text-orange-200" />
              </div>
              <div>
                <p className="text-[10px] text-amber-100 font-medium">Sunset</p>
                <p className="text-sm font-bold text-white">{sun.sunsetTime}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Interactive Time Slider & Scrubbing */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                Selected Time: {timeFormatted}
              </span>
            </div>
            <button
              onClick={() => setIsLive(!isLive)}
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                isLive
                  ? 'bg-emerald-500 text-white shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              {isLive ? '● LIVE' : 'MANUAL'}
            </button>
          </div>

          <input
            type="range"
            min="0"
            max="23.95"
            step="0.05"
            value={timeHourDec}
            onChange={(e) => {
              setTimeHourDec(parseFloat(e.target.value));
              setIsLive(false);
            }}
            className="w-full accent-amber-500 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
          />

          <div className="flex justify-between text-[10px] font-mono text-slate-400">
            <span>00:00 Night</span>
            <span>06:00 Dawn</span>
            <span>12:00 Noon</span>
            <span>18:00 Dusk</span>
            <span>24:00</span>
          </div>
        </div>

        {/* 3. Solar Angles (Altitude, Azimuth, Zenith) */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-amber-500" />
            <span>Real-Time Sun Angles</span>
          </h3>

          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-sky-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-sky-100 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Altitude
              </span>
              <p className="text-xl font-black text-sky-600 dark:text-sky-400 mt-0.5">
                {sun.altitudeDeg.toFixed(1)}°
              </p>
              <p className="text-[10px] text-slate-400">Above Horizon</p>
            </div>

            <div className="bg-amber-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-amber-100 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Azimuth
              </span>
              <p className="text-xl font-black text-amber-500 mt-0.5">
                {sun.azimuthDeg.toFixed(1)}°
              </p>
              <p className="text-[10px] text-slate-400">{sun.cardinalDirection.split(' ')[0]}</p>
            </div>

            <div className="bg-purple-50 dark:bg-slate-800/80 rounded-2xl p-3 border border-purple-100 dark:border-slate-700">
              <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                Zenith
              </span>
              <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-0.5">
                {sun.zenithDeg.toFixed(1)}°
              </p>
              <p className="text-[10px] text-slate-400">90° - Altitude</p>
            </div>
          </div>
        </div>

        {/* 4. Solar Efficiency Precision Alignment Parameters */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-emerald-500" />
              <span>Solar Efficiency & Alignment Math</span>
            </h3>
            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
              SPA Model
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
            {/* Air Mass */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Air Mass (AM)</span>
                <p className="text-[10px] text-slate-400">Atmospheric optical path length (AM 1.5 standard)</p>
              </div>
              <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                AM {sun.airMass.toFixed(2)}
              </span>
            </div>

            {/* Equation of Time */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Equation of Time (EoT)</span>
                <p className="text-[10px] text-slate-400">Earth orbital eccentricity & axial tilt difference</p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sun.equationOfTimeMinutes > 0 ? `+${sun.equationOfTimeMinutes}` : sun.equationOfTimeMinutes} min
              </span>
            </div>

            {/* Time Correction */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Time Correction (TC)</span>
                <p className="text-[10px] text-slate-400">4 × (Longitude - Meridian) + EoT</p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sun.timeCorrectionMinutes > 0 ? `+${sun.timeCorrectionMinutes}` : sun.timeCorrectionMinutes} min
              </span>
            </div>

            {/* Local Solar Time */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Local Solar Time (LST)</span>
                <p className="text-[10px] text-slate-400">Actual sun dial time based on longitude</p>
              </div>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                {sun.localSolarTimeString}
              </span>
            </div>

            {/* Declination Angle */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Solar Declination (δ)</span>
                <p className="text-[10px] text-slate-400">Angle between Sun and Earth equatorial plane</p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sun.declinationDeg.toFixed(2)}°
              </span>
            </div>

            {/* Hour Angle */}
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">Hour Angle (HRA)</span>
                <p className="text-[10px] text-slate-400">Sun angular displacement (15° per hour)</p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sun.hourAngleDeg.toFixed(1)}°
              </span>
            </div>
          </div>
        </div>

        {/* 5. Twilight & Golden Hours Details */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Lighting Phases & Golden Hours
          </h3>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-amber-50 dark:bg-slate-800 rounded-2xl p-2.5 border border-amber-100 dark:border-slate-700">
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold">Morning Golden Hour</span>
              <p className="font-bold text-slate-800 dark:text-slate-200">{sun.goldenHourMorning}</p>
            </div>
            <div className="bg-orange-50 dark:bg-slate-800 rounded-2xl p-2.5 border border-orange-100 dark:border-slate-700">
              <span className="text-[10px] text-orange-700 dark:text-orange-400 font-bold">Evening Golden Hour</span>
              <p className="font-bold text-slate-800 dark:text-slate-200">{sun.goldenHourEvening}</p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-2.5 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Civil Dawn</span>
              <p className="font-bold text-slate-800 dark:text-slate-200">{sun.civilDawn}</p>
            </div>
            <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl p-2.5 border border-slate-200 dark:border-slate-700">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold">Civil Dusk</span>
              <p className="font-bold text-slate-800 dark:text-slate-200">{sun.civilDusk}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
