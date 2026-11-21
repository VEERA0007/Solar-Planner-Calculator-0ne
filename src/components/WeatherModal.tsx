import React, { useState } from 'react';
import {
  Cloud,
  Sun,
  Compass,
  MapPin,
  RefreshCw,
  Search,
  Check,
  X,
  Gauge,
  Thermometer,
  Eye,
  AlertCircle,
  CheckCircle2,
  Navigation,
} from 'lucide-react';
import { WeatherCondition } from '../types/solar';
import {
  POPULAR_LOCATIONS,
  searchCities,
  CityCoordinates,
  detectExactLocation,
  DetectedLocationResult,
} from '../services/weatherService';

interface WeatherModalProps {
  weather: WeatherCondition;
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (lat: number, lon: number, cityName: string) => void;
  onRefresh: () => void;
  isLoading: boolean;
  onOpenChangeLocation?: () => void;
  isHourlySyncEnabled?: boolean;
  onToggleHourlySync?: (enabled: boolean) => void;
  lastSyncedTime?: string;
}

export const WeatherModal: React.FC<WeatherModalProps> = ({
  weather,
  isOpen,
  onClose,
  onSelectLocation,
  onRefresh,
  isLoading,
  onOpenChangeLocation,
  isHourlySyncEnabled = true,
  onToggleHourlySync,
  lastSyncedTime,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CityCoordinates[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [locatingGps, setLocatingGps] = useState(false);
  const [locatingStatus, setLocatingStatus] = useState<string>('');
  const [detectedResult, setDetectedResult] = useState<DetectedLocationResult | null>(null);

  if (!isOpen) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const results = await searchCities(searchQuery);
    setSearchResults(results);
    setIsSearching(false);
  };

  const handleGpsLocation = async () => {
    setLocatingGps(true);
    setLocatingStatus('Acquiring location coordinates...');
    setDetectedResult(null);

    try {
      const result = await detectExactLocation((step) => {
        setLocatingStatus(step);
      });

      setDetectedResult(result);
      setLocatingStatus(`Located: ${result.cityName}`);

      // Small delay so user sees confirmation of exact location name
      setTimeout(() => {
        onSelectLocation(result.latitude, result.longitude, result.cityName);
        setLocatingGps(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error('Failed to detect exact location:', err);
      setLocatingStatus('Location detection timed out. Please select from search or presets.');
      setTimeout(() => {
        setLocatingGps(false);
      }, 2000);
    }
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-sky-100 dark:border-slate-800 p-5 space-y-4 text-slate-800 dark:text-slate-100 transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Live Solar Weather & Irradiance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Powered by Open-Meteo & Meteorological Radiometers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Active Station */}
        <div className="bg-gradient-to-br from-sky-50 via-sky-100/40 to-blue-50 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-sky-950/40 rounded-2xl p-4 border border-sky-200/60 dark:border-slate-700 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <div className="flex items-center gap-1.5 text-sky-800 dark:text-sky-300 font-semibold text-sm">
                <MapPin className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                <span>{weather.city}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Lat: {weather.latitude.toFixed(3)}° · Lon: {weather.longitude.toFixed(3)}° · {lastSyncedTime ? `Synced at ${lastSyncedTime}` : 'Live'}
              </p>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {onToggleHourlySync && (
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-white/70 dark:bg-slate-800/80 px-2.5 py-1 rounded-xl border border-sky-100 dark:border-slate-700">
                  <span className="text-[10px]">Hourly Auto-Sync</span>
                  <input
                    type="checkbox"
                    checked={isHourlySyncEnabled}
                    onChange={(e) => onToggleHourlySync(e.target.checked)}
                    className="w-3.5 h-3.5 accent-sky-600 rounded cursor-pointer"
                  />
                </label>
              )}

              <button
                onClick={onRefresh}
                disabled={isLoading}
                className="px-3 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>{isLoading ? 'Syncing...' : 'Sync Now'}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-1">
            <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-2.5 text-center shadow-xs border border-sky-100 dark:border-slate-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Temperature</div>
              <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                {weather.temperatureC}°C
              </div>
              <div className="text-[10px] text-slate-400">Feels {weather.apparentTempC}°</div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-2.5 text-center shadow-xs border border-sky-100 dark:border-slate-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Cloud Cover</div>
              <div className="text-lg font-bold text-sky-700 dark:text-sky-400 mt-0.5">
                {weather.cloudCoverPercent}%
              </div>
              <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                {weather.cloudImpactRatio >= 0.85 ? 'Sunny Sky' : 'Diffuse Sun'}
              </div>
            </div>

            <div className="bg-white/80 dark:bg-slate-800/80 rounded-xl p-2.5 text-center shadow-xs border border-sky-100 dark:border-slate-700">
              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Est. Peak Sun</div>
              <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {weather.peakSunHoursEstimated} <span className="text-xs font-normal">h/d</span>
              </div>
              <div className="text-[10px] text-slate-400">Insolation</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">Direct Normal (DNI):</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {weather.directNormalIrradianceWpm2} W/m²
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">Global Horiz. (GHI):</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {weather.globalHorizontalIrradianceWpm2} W/m²
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">Sunrise / Sunset:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {weather.sunrise} - {weather.sunset}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-white/60 dark:bg-slate-800/60">
              <span className="text-slate-500 dark:text-slate-400">Max UV Index:</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{weather.uvIndex} (High)</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-900/50 flex items-start gap-2 text-xs text-blue-900 dark:text-blue-200">
            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Generation Impact:</span>{' '}
              {weather.cloudCoverPercent < 20
                ? 'Crystal clear atmosphere provides maximum direct beam radiation. Panels achieve up to 98% nameplate efficiency.'
                : weather.cloudCoverPercent < 60
                ? 'Moderate scattered clouds increase diffuse solar fraction. Generation is throttled by ~' +
                  Math.round((1 - weather.cloudImpactRatio) * 100) +
                  '%, but MPPT tracking remains active.'
                : 'Heavy overcast cloud layer absorbs direct rays. Panels produce ~30-45% through ambient diffuse light.'}
            </div>
          </div>
        </div>

        {/* Change Location Search */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Search or Change Location</label>
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city, e.g. Jaipur, Pune, Dallas..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSearching}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
            >
              {isSearching ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Find'}
            </button>
          </form>

          {/* Quick GPS / Exact Location button and Interactive Map */}
          <div className="space-y-2 pt-1">
            {onOpenChangeLocation && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChangeLocation();
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-orange-300 dark:border-orange-700 bg-orange-50 hover:bg-orange-100 dark:bg-orange-950/40 dark:hover:bg-orange-900/50 text-orange-800 dark:text-orange-200 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs active:scale-[0.99]"
              >
                <MapPin className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                <span>Open Interactive Map (Change Location &amp; Crosshair)</span>
              </button>
            )}

            <button
              onClick={handleGpsLocation}
              disabled={locatingGps}
              className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer shadow-xs ${
                locatingGps
                  ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-400 text-sky-800 dark:text-sky-200'
                  : 'border-sky-300 dark:border-sky-700/60 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-sky-800 dark:text-sky-200'
              }`}
            >
              <Compass className={`w-4 h-4 text-sky-600 dark:text-sky-400 ${locatingGps ? 'animate-spin' : ''}`} />
              <span>
                {locatingGps
                  ? locatingStatus || 'Pinpointing Exact Location...'
                  : 'Detect My Location (Exact GPS & City Name)'}
              </span>
            </button>
            {locatingGps && (
              <div className="text-[11px] text-center text-sky-600 dark:text-sky-400 animate-pulse font-medium">
                {locatingStatus}
              </div>
            )}
            {detectedResult && (
              <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                <div>
                  <div className="font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>{detectedResult.cityName}</span>
                  </div>
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                    Exact Lat: {detectedResult.latitude.toFixed(4)}°, Lon: {detectedResult.longitude.toFixed(4)}° · Source:{' '}
                    {detectedResult.source === 'gps' ? 'Device GPS Fix' : 'Network Geo-IP'}
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-200/80 dark:bg-emerald-900 px-2 py-0.5 rounded-md font-semibold">
                  Applied
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-1">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Search Results
            </div>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {searchResults.map((res, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onSelectLocation(res.latitude, res.longitude, `${res.name}, ${res.country}`);
                    onClose();
                  }}
                  className="w-full text-left p-2.5 rounded-xl hover:bg-sky-50 dark:hover:bg-slate-800 border border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs transition cursor-pointer"
                >
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {res.name}, <span className="text-slate-500 dark:text-slate-400">{res.state || res.country}</span>
                  </span>
                  <span className="text-sky-600 dark:text-sky-400 font-semibold">{res.defaultPeakSun} h/d</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Popular Locations */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Popular Solar Hubs
          </div>
          <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1">
            {POPULAR_LOCATIONS.map((loc) => (
              <button
                key={loc.name}
                onClick={() => {
                  onSelectLocation(loc.latitude, loc.longitude, `${loc.name}, ${loc.state}`);
                  onClose();
                }}
                className={`p-2 rounded-xl text-left border text-xs transition flex items-center justify-between cursor-pointer ${
                  weather.city.includes(loc.name)
                    ? 'border-sky-500 bg-sky-50/70 dark:bg-sky-950/60 text-sky-900 dark:text-sky-200 font-medium'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                }`}
              >
                <div className="truncate">
                  <div className="font-medium truncate">{loc.name}</div>
                  <div className="text-[10px] text-slate-400">{loc.state}</div>
                </div>
                <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0">
                  {loc.defaultPeakSun}h
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
