import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  Layers,
  Crosshair,
  Search,
  Check,
  MapPin,
  Info,
} from 'lucide-react';
import L from 'leaflet';
import { WeatherCondition } from '../types/solar';
import { reverseGeocode, detectExactLocation, searchCities, CityCoordinates } from '../services/weatherService';

interface ChangeLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentLat: number;
  currentLon: number;
  currentCity: string;
  onConfirmLocation: (lat: number, lon: number, cityName: string) => void;
  weather?: WeatherCondition;
}

export type TileLayerType = 'vector' | 'topo' | 'esri_topo' | 'street' | 'satellite' | 'osm';

interface TileLayerDef {
  name: string;
  subtitle: string;
  url: string;
  attribution: string;
  maxZoom: number;
  maxNativeZoom: number;
  subdomains?: string[];
  fallbackUrl?: string;
}

const TILE_LAYERS: Record<TileLayerType, TileLayerDef> = {
  vector: {
    name: 'Google Maps Roadmap',
    subtitle: 'Streets, landmarks & 3D buildings',
    url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps',
    maxZoom: 21,
    maxNativeZoom: 20,
    fallbackUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  },
  topo: {
    name: 'Topography & Relief',
    subtitle: 'Contour elevation & mountain terrain',
    url: 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google Maps Terrain & Topography',
    maxZoom: 20,
    maxNativeZoom: 18,
    fallbackUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
  },
  esri_topo: {
    name: 'Esri World Topo Map',
    subtitle: 'ArcGIS topographic contours & relief',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Topo Map',
    maxZoom: 19,
    maxNativeZoom: 16,
    fallbackUrl: 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
  },
  street: {
    name: 'Esri World Street Map',
    subtitle: 'ArcGIS global street & highway grid',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; World Street Map',
    maxZoom: 19,
    maxNativeZoom: 17,
    fallbackUrl: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
  },
  satellite: {
    name: 'Satellite Aerial (Hybrid)',
    subtitle: 'High-res aerial imagery with road names',
    url: 'https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '&copy; Google & Esri Satellite Imagery',
    maxZoom: 21,
    maxNativeZoom: 20,
    fallbackUrl: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  },
  osm: {
    name: 'OpenStreetMap (OSM)',
    subtitle: 'Community-driven open cartography',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    maxNativeZoom: 19,
  },
};

/**
 * Creates a Leaflet TileLayer with maxNativeZoom and resilient fallback
 */
function createLeafletTileLayer(layerKey: TileLayerType): L.TileLayer {
  const config = TILE_LAYERS[layerKey] || TILE_LAYERS.vector;
  const options: L.TileLayerOptions = {
    maxZoom: config.maxZoom || 19,
    maxNativeZoom: config.maxNativeZoom || 18,
    attribution: config.attribution,
  };
  if (config.subdomains && config.subdomains.length > 0) {
    options.subdomains = config.subdomains;
  }

  const layer = L.tileLayer(config.url, options);

  // Seamless fallback for broken, missing, or rate-limited tiles
  if (config.fallbackUrl) {
    layer.on('tileerror', (event: any) => {
      const img = event.tile as HTMLImageElement;
      if (img && !img.dataset.hasFallenBack && config.fallbackUrl) {
        img.dataset.hasFallenBack = 'true';
        const coords = event.coords;
        if (coords) {
          let fallback = config.fallbackUrl
            .replace('{z}', String(coords.z))
            .replace('{x}', String(coords.x))
            .replace('{y}', String(coords.y));
          if (fallback.includes('{s}')) {
            const s = ['mt0', 'mt1', 'mt2', 'mt3'][Math.abs((coords.x + coords.y) % 4)];
            fallback = fallback.replace('{s}', s);
          }
          img.src = fallback;
        }
      }
    });
  }

  return layer;
}

/**
 * Coordinate verification helpers
 */
function isValidCoord(lat: any, lon: any): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

function safeLat(lat: any, fallback = 17.41): number {
  const num = typeof lat === 'string' ? parseFloat(lat) : lat;
  return typeof num === 'number' && Number.isFinite(num) && !Number.isNaN(num) && num >= -90 && num <= 90
    ? num
    : fallback;
}

function safeLon(lon: any, fallback = 78.44): number {
  const num = typeof lon === 'string' ? parseFloat(lon) : lon;
  return typeof num === 'number' && Number.isFinite(num) && !Number.isNaN(num) && num >= -180 && num <= 180
    ? num
    : fallback;
}

/**
 * Calculates local solar time at given longitude
 */
function getSolarLocalTime(lon: number): string {
  const safeL = safeLon(lon, 78.44);
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  // Solar time offset = 4 minutes per degree of longitude
  const lonOffsetMinutes = Math.round(safeL * 4);
  let localMinutes = (utcMinutes + lonOffsetMinutes) % 1440;
  if (localMinutes < 0) localMinutes += 1440;

  const hours24 = Math.floor(localMinutes / 60);
  const minutes = Math.floor(localMinutes % 60);
  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : `${minutes}`;

  return `${hours12}:${minutesStr} ${ampm}`;
}

export const ChangeLocationModal: React.FC<ChangeLocationModalProps> = ({
  isOpen,
  onClose,
  currentLat,
  currentLon,
  currentCity,
  onConfirmLocation,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const activeTileLayerRef = useRef<L.TileLayer | null>(null);
  const reverseGeocodeTimerRef = useRef<any>(null);

  const [activeLayer, setActiveLayer] = useState<TileLayerType>('vector');
  const [showLayerPicker, setShowLayerPicker] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CityCoordinates[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [adToast, setAdToast] = useState<string | null>(null);

  // Live center coordinates and resolved location name
  const [centerLat, setCenterLat] = useState(() => safeLat(currentLat, 17.41));
  const [centerLon, setCenterLon] = useState(() => safeLon(currentLon, 78.44));
  const [locationName, setLocationName] = useState(currentCity || 'Hyderabad, Telangana');
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [isLocatingGps, setIsLocatingGps] = useState(false);
  const [gpsStatusText, setGpsStatusText] = useState<string | null>(null);

  // Computed solar time at target longitude
  const localTime = getSolarLocalTime(centerLon);

  // Sync state when incoming props update
  useEffect(() => {
    if (isOpen) {
      setCenterLat(safeLat(currentLat, 17.41));
      setCenterLon(safeLon(currentLon, 78.44));
      if (currentCity) setLocationName(currentCity);
    }
  }, [isOpen, currentLat, currentLon, currentCity]);

  // Leaflet Map Lifecycle
  useEffect(() => {
    if (!isOpen) {
      // Modal closed: Stop any in-flight animations and clean up instance
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch (e) {
          console.warn('Map cleanup error:', e);
        }
        mapInstanceRef.current = null;
        activeTileLayerRef.current = null;
      }
      return;
    }

    // Modal is open: Initialize map after DOM has computed dimensions
    let isCancelled = false;
    const initTimer = setTimeout(() => {
      if (isCancelled || !mapContainerRef.current) return;

      const container = mapContainerRef.current;
      const width = container.clientWidth || container.offsetWidth;
      const height = container.clientHeight || container.offsetHeight;

      // Ensure valid container dimensions before initializing
      if (width === 0 || height === 0) {
        return;
      }

      if (!mapInstanceRef.current) {
        const startLat = safeLat(currentLat, 17.41);
        const startLon = safeLon(currentLon, 78.44);

        try {
          const map = L.map(container, {
            center: [startLat, startLon],
            zoom: 17,
            zoomControl: false,
            attributionControl: false,
          });

          const tileLayer = createLeafletTileLayer(activeLayer);
          tileLayer.addTo(map);

          activeTileLayerRef.current = tileLayer;
          mapInstanceRef.current = map;

          // Sync center on move
          map.on('move', () => {
            try {
              const center = map.getCenter();
              if (center && isValidCoord(center.lat, center.lng)) {
                setCenterLat(center.lat);
                setCenterLon(center.lng);
              }
            } catch {}
          });

          // Trigger reverse geocode when user finishes panning/zooming
          map.on('moveend', () => {
            try {
              const center = map.getCenter();
              if (center && isValidCoord(center.lat, center.lng)) {
                setCenterLat(center.lat);
                setCenterLon(center.lng);

                if (reverseGeocodeTimerRef.current) {
                  clearTimeout(reverseGeocodeTimerRef.current);
                }

                setIsGeocoding(true);
                reverseGeocodeTimerRef.current = setTimeout(async () => {
                  try {
                    const resolved = await reverseGeocode(center.lat, center.lng);
                    if (resolved) {
                      setLocationName(resolved);
                    }
                  } catch (err) {
                    console.warn('Reverse geocode error:', err);
                  } finally {
                    setIsGeocoding(false);
                  }
                }, 600);
              }
            } catch {}
          });

          // Tap to center
          map.on('click', (e: L.LeafletMouseEvent) => {
            if (e?.latlng && isValidCoord(e.latlng.lat, e.latlng.lng)) {
              try {
                map.panTo(e.latlng, { animate: true, duration: 0.4 });
              } catch {
                map.setView(e.latlng, map.getZoom() || 17, { animate: false });
              }
            }
          });

          // Force dimension recalculation once mounted
          setTimeout(() => {
            if (mapInstanceRef.current) {
              mapInstanceRef.current.invalidateSize();
            }
          }, 150);
        } catch (err) {
          console.error('Failed to initialize Leaflet map:', err);
        }
      }
    }, 120);

    const secondaryInvalidateTimer = setTimeout(() => {
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.invalidateSize();
        } catch {}
      }
    }, 350);

    return () => {
      isCancelled = true;
      clearTimeout(initTimer);
      clearTimeout(secondaryInvalidateTimer);
      if (reverseGeocodeTimerRef.current) {
        clearTimeout(reverseGeocodeTimerRef.current);
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.off();
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
        activeTileLayerRef.current = null;
      }
    };
  }, [isOpen]);

  // Handle tile layer change
  const handleSwitchLayer = (type: TileLayerType) => {
    setActiveLayer(type);
    setShowLayerPicker(false);
    if (mapInstanceRef.current) {
      try {
        if (activeTileLayerRef.current) {
          mapInstanceRef.current.removeLayer(activeTileLayerRef.current);
        }
        const newLayer = createLeafletTileLayer(type);
        newLayer.addTo(mapInstanceRef.current);
        activeTileLayerRef.current = newLayer;
      } catch (err) {
        console.warn('Tile layer switch error:', err);
      }
    }
  };

  // High accuracy auto-detection
  const handleAutoLocate = async () => {
    setIsLocatingGps(true);
    setGpsStatusText('Engaging High-Accuracy GPS Sensor...');

    try {
      const res = await detectExactLocation((status) => {
        setGpsStatusText(status);
      });

      const validLat = safeLat(res.latitude, 17.41);
      const validLon = safeLon(res.longitude, 78.44);

      setCenterLat(validLat);
      setCenterLon(validLon);
      if (res.cityName) {
        setLocationName(res.cityName);
      }
      setGpsStatusText(`High Accuracy Fix (${res.accuracyMeters ? Math.round(res.accuracyMeters) + 'm' : 'Exact'})`);

      if (mapInstanceRef.current) {
        const map = mapInstanceRef.current;
        try {
          map.stop();
          const size = map.getSize();
          if (size && size.x > 0 && size.y > 0) {
            map.flyTo([validLat, validLon], 18, {
              animate: true,
              duration: 1.2,
            });
          } else {
            map.setView([validLat, validLon], 18, { animate: false });
          }
        } catch (flyErr) {
          console.warn('FlyTo error, fallback to setView:', flyErr);
          map.setView([validLat, validLon], 18, { animate: false });
        }
      }

      setTimeout(() => {
        setGpsStatusText(null);
        setIsLocatingGps(false);
      }, 2500);
    } catch (err) {
      console.warn('GPS detection failed:', err);
      setGpsStatusText('Auto-detection timed out. Drag map pin manually.');
      setTimeout(() => {
        setGpsStatusText(null);
        setIsLocatingGps(false);
      }, 3000);
    }
  };

  // City Search
  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchCities(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.warn('Search cities error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (item: CityCoordinates) => {
    const validLat = safeLat(item.latitude, 17.41);
    const validLon = safeLon(item.longitude, 78.44);

    setCenterLat(validLat);
    setCenterLon(validLon);
    setLocationName(`${item.name}, ${item.state || item.country}`);
    setShowSearch(false);
    setSearchResults([]);
    setSearchQuery('');

    if (mapInstanceRef.current) {
      const map = mapInstanceRef.current;
      try {
        map.stop();
        const size = map.getSize();
        if (size && size.x > 0 && size.y > 0) {
          map.flyTo([validLat, validLon], 16, {
            animate: true,
            duration: 1.0,
          });
        } else {
          map.setView([validLat, validLon], 16, { animate: false });
        }
      } catch (flyErr) {
        console.warn('FlyTo error, fallback to setView:', flyErr);
        map.setView([validLat, validLon], 16, { animate: false });
      }
    }
  };

  // Confirm selection
  const handleConfirm = () => {
    const finalLat = safeLat(centerLat, 17.41);
    const finalLon = safeLon(centerLon, 78.44);
    onConfirmLocation(finalLat, finalLon, locationName || 'Selected Location');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      {/* Phone Screen Modal container */}
      <div className="relative w-full max-w-md h-[100dvh] sm:h-[860px] max-h-[100dvh] bg-slate-100 dark:bg-slate-900 sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col font-sans select-none border border-slate-200 dark:border-slate-800">
        
        {/* Top Navigation Bar matching screenshot */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-4 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/80 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 transition cursor-pointer shadow-xs active:scale-95"
              title="Back"
            >
              <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
            </button>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Change Location
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowSearch(!showSearch)}
              className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-300 transition cursor-pointer shadow-xs active:scale-95"
              title="Search City or Landmark"
            >
              <Search className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expandable Search Drawer */}
        {showSearch && (
          <div className="absolute top-16 left-3 right-3 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-3 shadow-xl border border-sky-100 dark:border-slate-800 space-y-2 animate-fade-in">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search city, e.g. Hyderabad, Jaipur, Pune..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded-xl shadow-xs transition"
              >
                {isSearching ? 'Finding...' : 'Search'}
              </button>
            </form>

            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto space-y-1 pt-1">
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectSearchResult(item)}
                    className="w-full text-left p-2 rounded-xl hover:bg-sky-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs text-slate-800 dark:text-slate-200 transition"
                  >
                    <span className="font-medium">
                      {item.name}, <span className="text-slate-500 text-[11px]">{item.state || item.country}</span>
                    </span>
                    <span className="text-sky-600 dark:text-sky-400 font-semibold text-[11px]">
                      {item.defaultPeakSun} h/d
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* GPS Live Notification Toast */}
        {gpsStatusText && (
          <div className="absolute top-18 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 text-white text-xs px-3.5 py-2 rounded-full shadow-lg border border-sky-400/50 flex items-center gap-2 backdrop-blur-md animate-bounce-once">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="font-medium">{gpsStatusText}</span>
          </div>
        )}

        {/* Full-bleed Map View Container */}
        <div className="relative flex-1 w-full h-full bg-slate-200 overflow-hidden min-h-[300px]">
          <div ref={mapContainerRef} className="w-full h-full min-h-[300px]" />

          {/* Floating Map Controls in Top Right matching screenshot */}
          <div className="absolute right-4 top-20 z-20 flex flex-col gap-3">
            {/* Layer Switcher Button */}
            <div className="relative">
              <button
                onClick={() => setShowLayerPicker(!showLayerPicker)}
                className="w-11 h-11 bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg border border-slate-200/90 dark:border-slate-700 flex items-center justify-center text-slate-700 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 transition cursor-pointer active:scale-95"
                title="Switch Map Layers"
              >
                <Layers className="w-5 h-5 text-slate-700 dark:text-slate-200" />
              </button>

              {/* Layer Picker Dropdown */}
              {showLayerPicker && (
                <div className="absolute right-14 top-0 z-30 w-56 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-2 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-1 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase px-2.5 py-1 tracking-wider">
                    Map Layers & Style
                  </div>
                  {(Object.keys(TILE_LAYERS) as TileLayerType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleSwitchLayer(type)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-xl flex items-center justify-between transition cursor-pointer ${
                        activeLayer === type
                          ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-semibold'
                          : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex flex-col min-w-0 pr-1">
                        <span className="font-semibold text-xs truncate">{TILE_LAYERS[type].name}</span>
                        <span className="text-[10px] text-slate-400 truncate font-normal">
                          {TILE_LAYERS[type].subtitle}
                        </span>
                      </div>
                      {activeLayer === type && <Check className="w-3.5 h-3.5 text-sky-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* GPS Crosshair / High Accuracy Auto Detect Button */}
            <button
              onClick={handleAutoLocate}
              disabled={isLocatingGps}
              className="w-11 h-11 bg-white dark:bg-slate-800 rounded-xl shadow-md hover:shadow-lg border border-slate-200/90 dark:border-slate-700 flex items-center justify-center text-slate-800 dark:text-slate-200 hover:text-sky-600 dark:hover:text-sky-400 transition cursor-pointer active:scale-95"
              title="Pinpoint My Exact Location (High Accuracy GPS)"
            >
              <Crosshair className={`w-5 h-5 text-slate-800 dark:text-slate-100 ${isLocatingGps ? 'animate-spin text-sky-600' : ''}`} />
            </button>

            {/* Quick Zoom In / Zoom Out Controls */}
            <div className="flex flex-col bg-white dark:bg-slate-800 rounded-xl shadow-md border border-slate-200/90 dark:border-slate-700 overflow-hidden divide-y divide-slate-100 dark:divide-slate-700">
              <button
                type="button"
                onClick={() => {
                  try {
                    mapInstanceRef.current?.zoomIn();
                  } catch {}
                }}
                className="w-11 h-9 flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 font-bold text-lg select-none transition cursor-pointer"
                title="Zoom In"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    mapInstanceRef.current?.zoomOut();
                  } catch {}
                }}
                className="w-11 h-9 flex items-center justify-center text-slate-800 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 font-bold text-lg select-none transition cursor-pointer"
                title="Zoom Out"
              >
                &minus;
              </button>
            </div>
          </div>

          {/* Central Target Crosshairs Marker - Fixed Dead Center matching screenshot */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex items-center justify-center">
            {/* Radiating Pulse Wave */}
            <div className="absolute w-14 h-14 rounded-full bg-sky-400/25 animate-ping pointer-events-none" />
            <div className="absolute w-20 h-20 rounded-full bg-sky-400/10 pointer-events-none" />

            {/* Reticle / Crosshair Outer Rings and Lines */}
            <div className="relative w-12 h-12 flex items-center justify-center">
              {/* Dark Navy Crosshair Circle */}
              <div className="w-8 h-8 rounded-full border-2 border-slate-900 dark:border-white shadow-xs flex items-center justify-center">
                {/* Center Solid Blue Dot */}
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400 border border-white shadow-xs" />
              </div>

              {/* Crosshair Ticks: Top, Bottom, Left, Right */}
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-slate-900 dark:bg-white" />
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-slate-900 dark:bg-white" />
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-slate-900 dark:bg-white" />
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-slate-900 dark:bg-white" />
            </div>
          </div>

          {/* Bottom Left Map Attribution Badge */}
          <div className="absolute bottom-2 left-3 z-10 flex items-center gap-1.5 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-300 shadow-xs border border-slate-200/50 dark:border-slate-800/50">
            {activeLayer === 'vector' || activeLayer === 'topo' || activeLayer === 'satellite' ? (
              <>
                <span className="font-bold tracking-tight">
                  <span className="text-blue-500">G</span>
                  <span className="text-red-500">o</span>
                  <span className="text-amber-500">o</span>
                  <span className="text-blue-500">g</span>
                  <span className="text-green-500">l</span>
                  <span className="text-red-500">e</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-0.5">
                  {activeLayer === 'topo' ? 'Terrain & Topo' : activeLayer === 'satellite' ? 'Satellite View' : 'Maps View'}
                </span>
              </>
            ) : activeLayer === 'street' || activeLayer === 'esri_topo' ? (
              <>
                <span className="font-bold text-sky-600 dark:text-sky-400">Esri</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                  {activeLayer === 'esri_topo' ? 'World Topo' : 'World Street'}
                </span>
              </>
            ) : (
              <>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">OSM</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">OpenStreetMap</span>
              </>
            )}
          </div>
        </div>

        {/* Bottom Sheet / Card matching screenshot */}
        <div className="relative z-30 bg-white dark:bg-slate-900 border-t border-amber-500/60 shadow-2xl pt-4 pb-3 px-4 flex flex-col gap-3.5 transition-colors">
          
          {/* 3 Columns: Latitude | Longitude | Time */}
          <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 text-center">
            {/* Latitude Column */}
            <div className="px-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Latitude
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                {safeLat(centerLat, 17.41).toFixed(2)}°
              </div>
            </div>

            {/* Longitude Column */}
            <div className="px-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Longitude
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5 font-mono">
                {safeLon(centerLon, 78.44).toFixed(2)}°
              </div>
            </div>

            {/* Time Column */}
            <div className="px-2">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Time
              </div>
              <div className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                {localTime}
              </div>
            </div>
          </div>

          {/* Reverse Geocoded Address Preview */}
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                {isGeocoding ? 'Resolving street & landmark...' : locationName}
              </span>
            </div>
            <span className="shrink-0 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
              High Accuracy Pin
            </span>
          </div>

          {/* Orange Confirm Button matching screenshot */}
          <button
            onClick={handleConfirm}
            className="w-full py-3.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-bold text-base shadow-lg shadow-orange-600/30 transition cursor-pointer active:scale-[0.99] tracking-wide text-center"
          >
            Confirm
          </button>

          {/* Bottom Ad / Promotion Banner matching screenshot */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-3 text-[11px] text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-1.5 min-w-0">
              <Info className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
              <p className="line-clamp-2 leading-tight">
                {adToast || 'Keep your photos and videos in full resolution, without worrying about space.'}
              </p>
            </div>
            <button
              onClick={() => {
                setAdToast('Google One 100 GB Cloud Storage promo details saved.');
                setTimeout(() => setAdToast(null), 3000);
              }}
              className="shrink-0 px-3 py-1.5 rounded-full bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 font-bold text-[10px] tracking-wider transition active:scale-95"
            >
              SIGN UP &gt;
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
