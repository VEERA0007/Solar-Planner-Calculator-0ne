import { WeatherCondition } from '../types/solar';

// Preset locations for quick selection
export interface CityCoordinates {
  name: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  defaultPeakSun: number;
}

export const POPULAR_LOCATIONS: CityCoordinates[] = [
  { name: 'Bengaluru', state: 'Karnataka', country: 'India', latitude: 12.9716, longitude: 77.5946, defaultPeakSun: 5.4 },
  { name: 'New Delhi', state: 'Delhi', country: 'India', latitude: 28.6139, longitude: 77.209, defaultPeakSun: 5.6 },
  { name: 'Mumbai', state: 'Maharashtra', country: 'India', latitude: 19.076, longitude: 72.8777, defaultPeakSun: 5.2 },
  { name: 'Jaipur', state: 'Rajasthan', country: 'India', latitude: 26.9124, longitude: 75.7873, defaultPeakSun: 6.0 },
  { name: 'Chennai', state: 'Tamil Nadu', country: 'India', latitude: 13.0827, longitude: 80.2707, defaultPeakSun: 5.5 },
  { name: 'Ahmedabad', state: 'Gujarat', country: 'India', latitude: 23.0225, longitude: 72.5714, defaultPeakSun: 5.8 },
  { name: 'Hyderabad', state: 'Telangana', country: 'India', latitude: 17.385, longitude: 78.4867, defaultPeakSun: 5.5 },
  { name: 'Kolkata', state: 'West Bengal', country: 'India', latitude: 22.5726, longitude: 88.3639, defaultPeakSun: 4.8 },
  { name: 'Pune', state: 'Maharashtra', country: 'India', latitude: 18.5204, longitude: 73.8567, defaultPeakSun: 5.4 },
  { name: 'Kochi', state: 'Kerala', country: 'India', latitude: 9.9312, longitude: 76.2673, defaultPeakSun: 5.1 },
  { name: 'London', state: 'England', country: 'UK', latitude: 51.5074, longitude: -0.1278, defaultPeakSun: 3.4 },
  { name: 'Los Angeles', state: 'California', country: 'USA', latitude: 34.0522, longitude: -118.2437, defaultPeakSun: 5.8 },
  { name: 'Sydney', state: 'NSW', country: 'Australia', latitude: -33.8688, longitude: 151.2093, defaultPeakSun: 5.3 },
  { name: 'Dubai', state: 'Dubai', country: 'UAE', latitude: 25.2048, longitude: 55.2708, defaultPeakSun: 6.4 },
];

/**
 * Maps WMO weather code to human-readable condition
 */
export function getWeatherDescription(code: number): string {
  if (code === 0) return 'Clear sky / Optimal Sun';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy / Hazy';
  if (code >= 51 && code <= 55) return 'Light Drizzle';
  if (code >= 61 && code <= 65) return 'Rain showers';
  if (code >= 80 && code <= 82) return 'Heavy rain showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Scattered clouds';
}

/**
 * Fetches real meteorological and solar radiation data from Open-Meteo
 * Open-Meteo provides free, high-resolution solar irradiance (GHI, DNI, DHI), cloud cover, and sunshine hours.
 */
export async function fetchLiveSolarWeather(
  latitude: number,
  longitude: number,
  cityName: string = 'Current Location'
): Promise<WeatherCondition> {
  const safeLat = typeof latitude === 'number' && Number.isFinite(latitude) && !Number.isNaN(latitude) ? latitude : 17.41;
  const safeLon = typeof longitude === 'number' && Number.isFinite(longitude) && !Number.isNaN(longitude) ? longitude : 78.44;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${safeLat}&longitude=${safeLon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,surface_pressure,wind_speed_10m&hourly=cloud_cover,direct_normal_irradiance,diffuse_radiation,direct_radiation,shortwave_radiation&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,sunshine_duration,uv_index_max&timezone=auto`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Open-Meteo API returned status: ${res.status}`);
    }
    const data = await res.json();

    const current = data.current || {};
    const daily = data.daily || {};
    const hourly = data.hourly || {};

    const cloudCover = current.cloud_cover ?? 25;
    const weatherCode = current.weather_code ?? 1;
    const tempC = Math.round(current.temperature_2m ?? 28);
    const apparentTempC = Math.round(current.apparent_temperature ?? 30);
    const uvIndex = daily.uv_index_max?.[0] ?? 7.5;

    // Sunshine duration in seconds -> hours
    const sunshineSeconds = daily.sunshine_duration?.[0] ?? 28800; // 8 hrs default
    const sunshineDurationHours = Number((sunshineSeconds / 3600).toFixed(1));

    // Approximate direct and global irradiance from hourly noon value
    const noonIndex = 12; // approximate index for noon
    const dni = Math.round(hourly.direct_normal_irradiance?.[noonIndex] ?? (1000 * (1 - cloudCover / 100 * 0.7)));
    const ghi = Math.round(hourly.shortwave_radiation?.[noonIndex] ?? (900 * (1 - cloudCover / 100 * 0.65)));

    // Cloud impact ratio: at 0% clouds = 1.0; at 100% clouds = ~0.35 (diffuse light still penetrates)
    const cloudImpactRatio = Number((1 - (cloudCover / 100) * 0.65).toFixed(2));

    // Estimated peak sun hours today = baseline based on latitude/season modulated by cloud cover
    const baselineSun = Math.max(5.8 - Math.abs(latitude) * 0.04, 3.5);
    const peakSunHoursEstimated = Number((baselineSun * cloudImpactRatio).toFixed(1));

    const sunrise = daily.sunrise?.[0] ? daily.sunrise[0].split('T')[1].slice(0, 5) : '06:15';
    const sunset = daily.sunset?.[0] ? daily.sunset[0].split('T')[1].slice(0, 5) : '18:30';

    return {
      city: cityName,
      latitude,
      longitude,
      temperatureC: tempC,
      apparentTempC,
      cloudCoverPercent: cloudCover,
      uvIndex: Math.round(uvIndex * 10) / 10,
      weatherCode,
      weatherDescription: getWeatherDescription(weatherCode),
      directNormalIrradianceWpm2: Math.max(dni, 50),
      globalHorizontalIrradianceWpm2: Math.max(ghi, 80),
      sunshineDurationHours,
      sunrise,
      sunset,
      peakSunHoursEstimated,
      cloudImpactRatio,
      isLive: true,
      lastUpdated: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
  } catch (error) {
    console.warn('Fallback to estimated solar weather due to network:', error);
    // Offline / fallback solar weather model based on latitude
    const lat = Math.abs(latitude);
    const baselineSun = Number((Math.max(6.0 - lat * 0.05, 3.8)).toFixed(1));

    return {
      city: cityName,
      latitude,
      longitude,
      temperatureC: 29,
      apparentTempC: 31,
      cloudCoverPercent: 20,
      uvIndex: 8.2,
      weatherCode: 1,
      weatherDescription: 'Clear / Sunny (Estimated)',
      directNormalIrradianceWpm2: 780,
      globalHorizontalIrradianceWpm2: 840,
      sunshineDurationHours: 8.5,
      sunrise: '06:12',
      sunset: '18:28',
      peakSunHoursEstimated: baselineSun,
      cloudImpactRatio: 0.88,
      isLive: false,
      lastUpdated: 'Standard Solar Almanac',
    };
  }
}

/**
 * Searches for a city name and returns coordinates using Open-Meteo Geocoding
 */
export async function searchCities(query: string): Promise<CityCoordinates[]> {
  if (!query || query.trim().length < 2) return [];

  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`
    );
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.results || !Array.isArray(data.results)) return [];

    return data.results.map((item: any) => ({
      name: item.name,
      state: item.admin1 || item.country || '',
      country: item.country || '',
      latitude: item.latitude,
      longitude: item.longitude,
      defaultPeakSun: Number((Math.max(6.0 - Math.abs(item.latitude) * 0.04, 3.5)).toFixed(1)),
    }));
  } catch {
    // Filter local list
    return POPULAR_LOCATIONS.filter(
      (loc) =>
        loc.name.toLowerCase().includes(query.toLowerCase()) ||
        loc.state.toLowerCase().includes(query.toLowerCase())
    );
  }
}

export interface DetectedLocationResult {
  latitude: number;
  longitude: number;
  cityName: string;
  accuracyMeters?: number;
  source: 'gps' | 'ip' | 'fallback';
}

/**
 * High-precision reverse geocoding to resolve exact city, neighborhood, state, and country
 * Uses BigDataCloud client API with OpenStreetMap Nominatim and coordinate fallbacks
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string> {
  const safeLat = typeof latitude === 'number' && Number.isFinite(latitude) && !Number.isNaN(latitude) ? latitude : 17.41;
  const safeLon = typeof longitude === 'number' && Number.isFinite(longitude) && !Number.isNaN(longitude) ? longitude : 78.44;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // 1. Primary: BigDataCloud Client Reverse Geocode API (free, client-side, CORS enabled)
    const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${safeLat}&longitude=${safeLon}&localityLanguage=en`;
    const res = await fetch(bdcUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const locality = data.locality || data.neighbourhood || '';
      const city = data.city || data.principalSubdivisionDistrict || data.locality || '';
      const state = data.principalSubdivision || '';
      const country = data.countryName || '';

      const parts: string[] = [];
      if (locality && locality !== city) parts.push(locality);
      if (city) parts.push(city);
      if (state && state !== city) parts.push(state);
      if (country && parts.length < 2) parts.push(country);

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  } catch (err) {
    console.warn('BigDataCloud reverse geocode failed, trying Nominatim fallback:', err);
  }

  // 2. Secondary: OpenStreetMap Nominatim reverse geocode
  try {
    const nomController = new AbortController();
    const nomTimeout = setTimeout(() => nomController.abort(), 4000);
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${safeLat}&lon=${safeLon}`;
    const nomRes = await fetch(nomUrl, {
      signal: nomController.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(nomTimeout);

    if (nomRes.ok) {
      const data = await nomRes.json();
      const addr = data.address || {};
      const neighborhood = addr.suburb || addr.neighbourhood || addr.residential || '';
      const townOrCity = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      const state = addr.state || '';
      const country = addr.country || '';

      const parts: string[] = [];
      if (neighborhood && neighborhood !== townOrCity) parts.push(neighborhood);
      if (townOrCity) parts.push(townOrCity);
      if (state && state !== townOrCity) parts.push(state);
      if (country && parts.length < 2) parts.push(country);

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode failed:', err);
  }

  // 3. Tertiary: Match nearest known solar hub within 60 km
  let closestHub: CityCoordinates | null = null;
  let minDistance = Infinity;

  for (const hub of POPULAR_LOCATIONS) {
    const dLat = (hub.latitude - safeLat) * (Math.PI / 180);
    const dLon = (hub.longitude - safeLon) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(safeLat * (Math.PI / 180)) *
        Math.cos(hub.latitude * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distKm = 6371 * c; // Earth radius in km

    if (distKm < minDistance) {
      minDistance = distKm;
      closestHub = hub;
    }
  }

  if (closestHub && minDistance <= 60) {
    return `${closestHub.name}, ${closestHub.state}`;
  }

  // 4. Exact coordinate display as final fallback
  const latStr = `${Math.abs(safeLat).toFixed(3)}°${safeLat >= 0 ? 'N' : 'S'}`;
  const lonStr = `${Math.abs(safeLon).toFixed(3)}°${safeLon >= 0 ? 'E' : 'W'}`;
  return `GPS Spot (${latStr}, ${lonStr})`;
}

/**
 * Fallback location detector using IP address when GPS permissions are blocked or unavailable
 */
export async function detectLocationFromIp(): Promise<DetectedLocationResult> {
  // Provider 1: ipapi.co
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://ipapi.co/json/', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        const parts = [data.city, data.region, data.country_name].filter(Boolean);
        return {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          cityName: parts.length > 0 ? parts.join(', ') : `${data.city || 'Detected Region'}`,
          source: 'ip',
        };
      }
    }
  } catch (err) {
    console.warn('ipapi.co check failed, trying freeipapi:', err);
  }

  // Provider 2: freeipapi.com
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://freeipapi.com/api/json', { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.latitude && data.longitude) {
        const parts = [data.cityName, data.regionName, data.countryName].filter(Boolean);
        return {
          latitude: Number(data.latitude),
          longitude: Number(data.longitude),
          cityName: parts.length > 0 ? parts.join(', ') : `${data.cityName || 'Detected Region'}`,
          source: 'ip',
        };
      }
    }
  } catch (err) {
    console.warn('freeipapi check failed:', err);
  }

  // Default fallback to Bengaluru solar center
  return {
    latitude: 12.9716,
    longitude: 77.5946,
    cityName: 'Bengaluru, Karnataka',
    source: 'fallback',
  };
}

/**
 * Search for an exact address, building, colony, street, or PIN code using Nominatim & Open-Meteo
 */
export async function searchAddressOrPlace(
  query: string
): Promise<Array<{ display_name: string; latitude: number; longitude: number }>> {
  if (!query || query.trim().length < 2) return [];
  const cleanQ = query.trim();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      cleanQ
    )}&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept-Language': 'en' },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          display_name: item.display_name,
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
        }));
      }
    }
  } catch (err) {
    console.warn('Nominatim address search error:', err);
  }

  // Fallback to searchCities
  const cities = await searchCities(cleanQ);
  return cities.map((c) => ({
    display_name: `${c.name}, ${c.state}, ${c.country}`,
    latitude: c.latitude,
    longitude: c.longitude,
  }));
}

/**
 * Master location detection:
 * 1. Tries high-accuracy browser GPS (fresh fix, no cache)
 * 2. On GPS success, reverse geocodes the exact coordinates into real city / district / state name
 * 3. On GPS denial / timeout / iframe block, automatically falls back to IP geolocation
 */
export async function detectExactLocation(
  onProgress?: (step: string) => void
): Promise<DetectedLocationResult> {
  if (typeof navigator !== 'undefined' && 'geolocation' in navigator) {
    onProgress?.('Acquiring high-accuracy GPS fix...');

    const gpsPromise = new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0, // Force fresh satellite reading
        }
      );
    });

    try {
      const pos = await gpsPromise;
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;

      onProgress?.(`Satellite lock acquired (±${Math.round(accuracy)}m). Pinpointing street...`);
      const resolvedName = await reverseGeocode(lat, lon);

      return {
        latitude: lat,
        longitude: lon,
        cityName: resolvedName,
        accuracyMeters: Math.round(accuracy),
        source: 'gps',
      };
    } catch (gpsError: any) {
      console.warn('GPS hardware access timed out or was blocked:', gpsError);
      if (gpsError?.code === 1) {
        onProgress?.('GPS permission denied. Using network IP location...');
      } else {
        onProgress?.('GPS unavailable; locating via network IP...');
      }
    }
  } else {
    onProgress?.('Locating via network IP...');
  }

  // Fallback to IP geolocation
  const ipResult = await detectLocationFromIp();
  return ipResult;
}

