import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  RotateCcw,
  Calendar,
  Clock,
  Compass,
  Sparkles,
  Info,
  Sun,
  Eye,
  Sliders,
  ChevronLeft,
  Video,
  VideoOff,
  Maximize2,
  Download,
  RotateCw,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { calculateDetailedSunAngles } from '../utils/solarMath';

interface SunARScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  embedded?: boolean;
}

export const SunARScreen: React.FC<SunARScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  embedded = false,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Time scrubber: hour in decimal (e.g. 12.5 = 12:30 PM)
  const [customHourDec, setCustomHourDec] = useState<number>(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });

  const [isLiveTime, setIsLiveTime] = useState(true);

  // Live timer effect when live mode is active
  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      setCustomHourDec(now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  // Compute date object from selectedDate and customHourDec
  const currentDate = new Date(selectedDate);
  const hour = Math.floor(customHourDec);
  const min = Math.floor((customHourDec - hour) * 60);
  currentDate.setHours(hour, min, 0, 0);

  // Compute astronomical sun position
  const sunData = calculateDetailedSunAngles(
    weather.latitude || 17.41,
    weather.longitude || 78.44,
    currentDate
  );

  // Camera video ref and state
  // Camera video ref, stream ref, and facing state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [actualFacing, setActualFacing] = useState<'environment' | 'user'>('environment');
  const [cameraLabel, setCameraLabel] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionRequested, setPermissionRequested] = useState(false);
  const [arViewAngle, setArViewAngle] = useState({ pitch: 25, yaw: 0 }); // drag to look around
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialYaw: 0, initialPitch: 25 });

  // Complete Camera Stop: halts all hardware tracks and clears video element
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.warn('Error stopping video track:', e);
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      if (videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => {
          try {
            track.stop();
          } catch (e) {}
        });
      }
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  // Start Camera with strict preference for BACK (environment) camera
  const startCamera = async (requestedFacing: 'environment' | 'user' = cameraFacing) => {
    setPermissionRequested(true);
    setCameraError(null);
    try {
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this environment.');
      }

      // Enumerate available video devices to explicitly locate the rear/back camera
      let videoDevices: MediaDeviceInfo[] = [];
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = allDevices.filter((d) => d.kind === 'videoinput');
      } catch (e) {
        console.warn('enumerateDevices error:', e);
      }

      const backDevice = videoDevices.find((d) => {
        const label = d.label.toLowerCase();
        return (
          label.includes('back') ||
          label.includes('rear') ||
          label.includes('environment') ||
          label.includes('facing back') ||
          label.includes('0, facing back') ||
          label.includes('main') ||
          label.includes('wide')
        );
      });

      const frontDevice = videoDevices.find((d) => {
        const label = d.label.toLowerCase();
        return (
          label.includes('front') ||
          label.includes('user') ||
          label.includes('selfie') ||
          label.includes('facetime') ||
          label.includes('facing front')
        );
      });

      let stream: MediaStream | null = null;

      if (requestedFacing === 'environment') {
        // Priority 1: Match by identified back camera deviceId
        if (backDevice?.deviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: backDevice.deviceId },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            });
          } catch (e) {
            console.warn('Back device ID match failed, trying exact facingMode:', e);
          }
        }

        // Priority 2: Force exact environment constraint (mobile browsers)
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { exact: 'environment' },
                width: { ideal: 1920 },
                height: { ideal: 1080 },
              },
              audio: false,
            });
          } catch (e) {
            console.warn('Exact environment failed (trying ideal):', e);
          }
        }

        // Priority 3: Ideal environment constraint
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch (e) {
            console.warn('Ideal environment failed:', e);
          }
        }
      } else {
        // User requested front camera
        if (frontDevice?.deviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: frontDevice.deviceId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch (e) {}
        }
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
              audio: false,
            });
          } catch (e) {}
        }
      }

      // Final fallback if specific constraints failed
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      // Inspect active video track to detect actual facing orientation
      const activeTrack = stream.getVideoTracks()[0];
      const settings = activeTrack?.getSettings?.() || {};
      const trackLabel = (activeTrack?.label || '').toLowerCase();
      const isFront =
        settings.facingMode === 'user' ||
        trackLabel.includes('front') ||
        trackLabel.includes('user') ||
        trackLabel.includes('selfie') ||
        trackLabel.includes('facetime');

      const detectedFacing: 'environment' | 'user' = isFront ? 'user' : 'environment';
      setActualFacing(detectedFacing);
      setCameraFacing(detectedFacing);
      setCameraLabel(activeTrack?.label || (detectedFacing === 'environment' ? 'Back Camera' : 'Front Camera'));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch((e) => console.warn('Video play error:', e));
      }
      setCameraActive(true);
    } catch (err: any) {
      console.warn('Camera stream error:', err);
      setCameraActive(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Rendering high-precision sky AR simulation.'
          : 'Back camera is unavailable or in use by another app. AR simulation active.'
      );
    }
  };

  const flipCamera = () => {
    const nextFacing = actualFacing === 'environment' ? 'user' : 'environment';
    startCamera(nextFacing);
  };

  // Background Prevention: Stop camera when tab/page is hidden, minimized, or switched away
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopCamera();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Device orientation sensors for real mobile devices
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null && e.beta !== null) {
        setArViewAngle({
          yaw: e.alpha,
          pitch: Math.max(0, Math.min(85, e.beta - 40)),
        });
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      stopCamera();
    };
  }, []);

  // Touch / mouse pan handling for desktop or manual AR control
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialYaw: arViewAngle.yaw,
      initialPitch: arViewAngle.pitch,
    };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setArViewAngle({
      yaw: (dragStartRef.current.initialYaw - dx * 0.4 + 360) % 360,
      pitch: Math.max(0, Math.min(85, dragStartRef.current.initialPitch + dy * 0.3)),
    });
  };

  const handlePointerUp = () => setIsDragging(false);

  // Compute coordinates for AR overlay
  // Map Azimuth difference into X position, Altitude into Y position
  const relativeAzimuth = (sunData.azimuthDeg - arViewAngle.yaw + 540) % 360 - 180;
  // Canvas viewport mapping: 70° FOV horizontally, 50° FOV vertically
  const viewportFovX = 70;
  const viewportFovY = 50;

  // Normalized position (-1 to 1)
  const normX = relativeAzimuth / (viewportFovX / 2);
  const normY = (sunData.altitudeDeg - arViewAngle.pitch) / (viewportFovY / 2);

  // Clamp & determine if sun is currently visible in camera FOV
  const isSunInFov = Math.abs(normX) <= 1.15 && Math.abs(normY) <= 1.15 && sunData.altitudeDeg > -5;

  // Convert to percentage for CSS absolute positioning (50% center)
  const sunScreenXPercent = Math.max(5, Math.min(95, 50 + normX * 45));
  const sunScreenYPercent = Math.max(8, Math.min(92, 50 - normY * 45));

  // Compute 24-hour arc points for the sky trajectory line
  const trajectoryPoints = [];
  for (let h = 6; h <= 18.5; h += 0.5) {
    const sampleDate = new Date(selectedDate);
    sampleDate.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
    const pos = calculateDetailedSunAngles(
      weather.latitude || 17.41,
      weather.longitude || 78.44,
      sampleDate
    );
    const relAz = (pos.azimuthDeg - arViewAngle.yaw + 540) % 360 - 180;
    const ptNormX = relAz / (viewportFovX / 2);
    const ptNormY = (pos.altitudeDeg - arViewAngle.pitch) / (viewportFovY / 2);
    trajectoryPoints.push({
      hour: h,
      label: `${Math.floor(h)}:00`,
      x: 50 + ptNormX * 45,
      y: 50 - ptNormY * 45,
      visible: Math.abs(ptNormX) <= 1.3 && Math.abs(ptNormY) <= 1.3,
      altitude: pos.altitudeDeg,
    });
  }

  // Format time display
  const formattedHours = Math.floor(customHourDec);
  const formattedMinutes = Math.floor((customHourDec - formattedHours) * 60);
  const ampm = formattedHours >= 12 ? 'PM' : 'AM';
  const displayHours = formattedHours % 12 === 0 ? 12 : formattedHours % 12;
  const timeDisplay = `${displayHours.toString().padStart(2, '0')}:${formattedMinutes
    .toString()
    .padStart(2, '0')} ${ampm}`;

  return (
    <div className="flex-1 flex flex-col bg-slate-950 text-white select-none overflow-hidden relative min-h-[640px]">
      {/* Top Overlay Bar */}
      <div className="absolute top-0 left-0 right-0 z-30 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-3 pt-3 flex items-center justify-between">
        {!embedded ? (
          <button
            onClick={() => {
              stopCamera();
              onNavigate('dashboard');
            }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/20 text-white text-xs font-semibold cursor-pointer transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onOpenWeather}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/45 hover:bg-black/65 backdrop-blur-md border border-white/20 text-white text-[11px] font-semibold cursor-pointer transition max-w-[140px]"
            title="Update site location"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            <span className="truncate">{weather.city || 'Site AR'}</span>
          </button>
        )}

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
            <span className="text-xs font-bold tracking-wider uppercase text-amber-300">
              Sun AR View
            </span>
          </div>
          <p className="text-[10px] text-slate-300 font-mono">
            Az: {sunData.azimuthDeg.toFixed(1)}° · Alt: {sunData.altitudeDeg.toFixed(1)}°
          </p>
        </div>

        {/* Camera toggle and flip controls */}
        <div className="flex items-center gap-1.5">
          {cameraActive && (
            <button
              onClick={flipCamera}
              className="px-2.5 py-1.5 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer transition"
              title={`Switch camera (current: ${actualFacing === 'environment' ? 'Back' : 'Front'})`}
            >
              <RotateCw className="w-3.5 h-3.5 text-sky-400" />
              <span className="text-[10px] font-bold">{actualFacing === 'environment' ? 'Back' : 'Front'}</span>
            </button>
          )}

          <button
            onClick={() => {
              if (cameraActive) {
                stopCamera();
              } else {
                startCamera('environment');
              }
            }}
            className={`p-2 rounded-full backdrop-blur-md border transition cursor-pointer ${
              cameraActive
                ? 'bg-emerald-500/80 border-emerald-400 text-white'
                : 'bg-black/40 border-white/20 text-slate-300 hover:text-white'
            }`}
            title={cameraActive ? 'Turn off camera' : 'Start back camera AR tracking'}
          >
            {cameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Viewport: Live Camera Feed OR High-Fidelity AR Sky Simulator */}
      <div
        className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Hidden video element for live camera feed */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
            cameraActive ? 'opacity-100 z-0' : 'opacity-0 -z-10'
          }`}
        />

        {/* Simulated Sky View when Camera is off or unavailable */}
        {!cameraActive && (
          <div
            className="absolute inset-0 w-full h-full transition-colors duration-700"
            style={{
              background:
                sunData.altitudeDeg > 15
                  ? 'radial-gradient(ellipse at 50% 30%, #38bdf8 0%, #0284c7 45%, #0369a1 80%, #082f49 100%)'
                  : sunData.altitudeDeg > 0
                  ? 'radial-gradient(ellipse at 50% 60%, #fdba74 0%, #f97316 35%, #0284c7 70%, #0f172a 100%)'
                  : 'radial-gradient(ellipse at 50% 80%, #1e1b4b 0%, #0f172a 40%, #020617 100%)',
            }}
          >
            {/* Horizon Mountains Silhouette */}
            <div className="absolute bottom-0 inset-x-0 h-40 opacity-40 pointer-events-none">
              <svg viewBox="0 0 500 150" className="w-full h-full object-cover" preserveAspectRatio="none">
                <path
                  d="M0 120 L80 85 L160 110 L240 60 L320 95 L400 70 L480 100 L500 90 L500 150 L0 150 Z"
                  fill="#030712"
                />
                <path
                  d="M0 135 L120 105 L200 125 L290 85 L380 115 L460 95 L500 110 L500 150 L0 150 Z"
                  fill="#020617"
                />
              </svg>
            </div>

            {/* Stars at night */}
            {sunData.altitudeDeg <= 0 && (
              <div className="absolute inset-0 opacity-70 pointer-events-none">
                <span className="absolute top-12 left-16 text-white text-[8px]">★</span>
                <span className="absolute top-24 right-20 text-white text-[6px]">★</span>
                <span className="absolute top-36 left-1/3 text-white text-[7px]">★</span>
                <span className="absolute top-16 right-1/3 text-white text-[9px]">★</span>
                <span className="absolute top-48 right-12 text-white text-[6px]">★</span>
              </div>
            )}
          </div>
        )}

        {/* Active camera indicator badge (Back vs Front) */}
        {cameraActive && (
          <div className="absolute top-16 left-4 z-20 flex items-center gap-1.5">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold backdrop-blur-md border shadow-md flex items-center gap-1.5 ${
                actualFacing === 'environment'
                  ? 'bg-emerald-950/85 text-emerald-300 border-emerald-500/50'
                  : 'bg-amber-950/85 text-amber-300 border-amber-500/50'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  actualFacing === 'environment' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <span>{actualFacing === 'environment' ? 'Back Camera (Sky View)' : 'Front Camera (Selfie)'}</span>
            </span>
          </div>
        )}

        {/* Front Camera Warning Alert with 1-tap Switch to Back Camera */}
        {cameraActive && actualFacing === 'user' && (
          <div className="absolute top-24 inset-x-4 z-25 flex justify-center">
            <div className="bg-amber-950/90 text-amber-100 border border-amber-500/80 px-4 py-2.5 rounded-2xl text-xs shadow-xl backdrop-blur-md flex items-center justify-between gap-3 max-w-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-amber-400 font-extrabold text-xs">⚠️ Front Camera:</span>
                <span className="text-[11px] text-amber-200">
                  Selfie view points away from sky. Pointing at sky needs the Back Camera.
                </span>
              </div>
              <button
                onClick={() => startCamera('environment')}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-[11px] shrink-0 cursor-pointer shadow-xs transition"
              >
                Use Back Cam
              </button>
            </div>
          </div>
        )}

        {/* Camera Permission / Guidance Banner */}
        {!cameraActive && (
          <div className="absolute top-16 inset-x-4 z-20">
            <div className="bg-slate-900/90 backdrop-blur-md border border-amber-500/40 rounded-2xl p-3 shadow-xl flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                  <Camera className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">Augmented Reality Camera</p>
                  <p className="text-[11px] text-slate-300">
                    {cameraError ? cameraError : 'Overlay sun path over real sky with your Back Camera!'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => startCamera('environment')}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-slate-950 font-bold text-[11px] shrink-0 shadow-md cursor-pointer transition"
              >
                Start Back AR
              </button>
            </div>
          </div>
        )}

        {/* 3D AR Reticle & Crosshairs Center HUD */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-24 h-24 border border-white/20 rounded-full flex items-center justify-center relative">
            <div className="w-2 h-2 rounded-full bg-amber-400/80"></div>
            <div className="absolute -top-3 text-[9px] font-mono font-bold text-white/70">
              {arViewAngle.pitch.toFixed(0)}° PITCH
            </div>
            <div className="absolute -bottom-3 text-[9px] font-mono font-bold text-white/70">
              {arViewAngle.yaw.toFixed(0)}° YAW
            </div>
            <div className="absolute -left-3 text-[9px] font-mono text-white/50">W</div>
            <div className="absolute -right-3 text-[9px] font-mono text-white/50">E</div>
          </div>
        </div>

        {/* Cardinal Horizon Indicators */}
        <div className="absolute bottom-24 inset-x-6 flex justify-between pointer-events-none z-10 text-[11px] font-bold text-white/60">
          <span className="bg-black/50 px-2 py-0.5 rounded-md border border-white/10">0° N</span>
          <span className="bg-black/50 px-2 py-0.5 rounded-md border border-white/10">90° E</span>
          <span className="bg-black/50 px-2 py-0.5 rounded-md border border-white/10">180° S</span>
          <span className="bg-black/50 px-2 py-0.5 rounded-md border border-white/10">270° W</span>
        </div>

        {/* AR Solar Trajectory Path SVG Overlay */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <defs>
            <linearGradient id="arTrajectoryGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
              <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#ea580c" stopOpacity="0.4" />
            </linearGradient>
          </defs>

          {/* Polyline connecting trajectory points */}
          {trajectoryPoints.length > 1 && (
            <path
              d={trajectoryPoints
                .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x}% ${pt.y}%`)
                .join(' ')}
              fill="none"
              stroke="url(#arTrajectoryGrad)"
              strokeWidth="3"
              strokeDasharray="6 4"
            />
          )}

          {/* Hour nodes along the arc */}
          {trajectoryPoints
            .filter((_, i) => i % 2 === 0)
            .map((pt, idx) => (
              <g key={idx} transform={`translate(${pt.x}%, ${pt.y}%)`}>
                <circle cx="0" cy="0" r="3.5" fill="#fef08a" stroke="#d97706" strokeWidth="1.5" />
                <text
                  x="6"
                  y="3"
                  fill="#ffffff"
                  fontSize="9"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  opacity="0.8"
                >
                  {pt.label}
                </text>
              </g>
            ))}
        </svg>

        {/* Active AR Sun Disc with Corona & Flare */}
        {isSunInFov && (
          <div
            className="absolute z-20 pointer-events-none transition-all duration-150 transform -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${sunScreenXPercent}%`,
              top: `${sunScreenYPercent}%`,
            }}
          >
            {/* Outer solar corona pulse */}
            <div className="w-32 h-32 -m-16 rounded-full bg-amber-400/25 blur-xl animate-pulse absolute top-1/2 left-1/2"></div>
            {/* Mid flare glow */}
            <div className="w-16 h-16 -m-8 rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-orange-400 opacity-90 blur-sm absolute top-1/2 left-1/2"></div>
            {/* Core Sun disk */}
            <div className="w-9 h-9 -m-4.5 rounded-full bg-white border-2 border-amber-300 shadow-[0_0_25px_#f59e0b] flex items-center justify-center relative">
              <Sun className="w-5 h-5 text-amber-500 fill-amber-400 animate-spin-slow" />
            </div>

            {/* Sun HUD Tag */}
            <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-black/85 backdrop-blur-md px-2.5 py-1 rounded-xl border border-amber-400/60 shadow-lg text-center whitespace-nowrap">
              <p className="text-[11px] font-extrabold text-amber-300">
                SUN ({timeDisplay})
              </p>
              <p className="text-[9px] font-mono text-slate-200">
                Alt: {sunData.altitudeDeg.toFixed(1)}° · Az: {sunData.azimuthDeg.toFixed(1)}°
              </p>
            </div>
          </div>
        )}

        {/* Off-screen Sun Direction Pointer Arrow */}
        {!isSunInFov && (
          <div className="absolute inset-x-8 top-28 z-20 flex justify-center pointer-events-none">
            <div className="bg-amber-500/90 text-slate-950 px-3 py-1.5 rounded-full font-bold text-xs shadow-xl flex items-center gap-2 animate-bounce">
              <Sun className="w-4 h-4 fill-current" />
              <span>
                Pan camera towards {sunData.cardinalDirection} (Alt: {sunData.altitudeDeg.toFixed(0)}°)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom AR Controls & Time Adjuster Panel */}
      <div className="relative z-30 bg-slate-900/95 backdrop-blur-lg border-t border-white/10 p-4 space-y-3">
        {/* Time Scrubber Header */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <span className="font-bold text-white">{timeDisplay}</span>
            <button
              onClick={() => setIsLiveTime(!isLiveTime)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase transition cursor-pointer ${
                isLiveTime
                  ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {isLiveTime ? '● LIVE' : 'MANUAL'}
            </button>
          </div>

          {/* Date Picker */}
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-sky-400" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setIsLiveTime(false);
              }}
              className="bg-slate-800 border border-slate-700 text-white text-[11px] rounded-lg px-2 py-1 outline-none focus:border-amber-400"
            />
          </div>
        </div>

        {/* 24-Hour Slider */}
        <div className="space-y-1">
          <input
            type="range"
            min="5"
            max="20"
            step="0.05"
            value={customHourDec}
            onChange={(e) => {
              setCustomHourDec(parseFloat(e.target.value));
              setIsLiveTime(false);
            }}
            className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400 font-mono">
            <span>05:00 Sunrise</span>
            <span>12:00 Solar Noon</span>
            <span>19:00 Sunset</span>
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-center">
          <div className="bg-slate-800/80 rounded-xl p-1.5 border border-slate-700/60">
            <p className="text-[9px] text-slate-400">Altitude</p>
            <p className="text-xs font-bold text-amber-400">{sunData.altitudeDeg.toFixed(1)}°</p>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-1.5 border border-slate-700/60">
            <p className="text-[9px] text-slate-400">Azimuth</p>
            <p className="text-xs font-bold text-sky-400">{sunData.azimuthDeg.toFixed(1)}°</p>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-1.5 border border-slate-700/60">
            <p className="text-[9px] text-slate-400">Air Mass</p>
            <p className="text-xs font-bold text-emerald-400">{sunData.airMass.toFixed(2)}</p>
          </div>
          <div className="bg-slate-800/80 rounded-xl p-1.5 border border-slate-700/60">
            <p className="text-[9px] text-slate-400">Status</p>
            <p className="text-xs font-bold text-purple-400">{sunData.sunStatus}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
