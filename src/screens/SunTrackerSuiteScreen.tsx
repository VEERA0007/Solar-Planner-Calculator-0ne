import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Compass,
  Clock,
  Sliders,
  RotateCw,
  ChevronLeft,
  Sun,
  Maximize2,
  Minimize2,
  Navigation,
  Eye,
  CheckCircle2,
  Info,
  Sparkles,
  MapPin,
  Map as MapIcon,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  Lock,
  Sunrise,
  Sunset,
  Zap,
  RotateCcw,
  Calendar,
  Layers,
  ArrowUpRight,
  TrendingUp,
  Activity,
  Smartphone,
  ShieldCheck,
  Check,
  Share2,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import {
  calculateDetailedSunAngles,
  calculateOptimalTiltAngles,
} from '../utils/solarMath';

export type SunToolSection = 'compass' | 'ar' | 'timer' | 'tilt' | 'level';

interface SunTrackerSuiteScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  initialTab?: SunToolSection | 'dashboard';
}

export const SunTrackerSuiteScreen: React.FC<SunTrackerSuiteScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  initialTab = 'compass',
}) => {
  // Master astronomical date & time state (synchronized across all 5 tools)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [customHourDec, setCustomHourDec] = useState<number>(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });
  const [isLiveTime, setIsLiveTime] = useState(true);

  // Active section indicator for sticky anchor jump bar
  const [activeSection, setActiveSection] = useState<SunToolSection>(
    initialTab === 'dashboard' ? 'compass' : (initialTab as SunToolSection)
  );

  // Section references for smooth scrolling
  const compassSectionRef = useRef<HTMLDivElement | null>(null);
  const arSectionRef = useRef<HTMLDivElement | null>(null);
  const timerSectionRef = useRef<HTMLDivElement | null>(null);
  const tiltSectionRef = useRef<HTMLDivElement | null>(null);
  const levelSectionRef = useRef<HTMLDivElement | null>(null);

  // Compass View Mode: Dial vs Satellite Solar Beam Map
  const [compassMode, setCompassMode] = useState<'dial' | 'map'>('dial');

  // Device orientation / heading state (hardware gyroscope)
  const [deviceHeading, setDeviceHeading] = useState<number>(0);
  const [isSensorActive, setIsSensorActive] = useState<boolean>(false);

  // AR Camera state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [actualFacing, setActualFacing] = useState<'environment' | 'user'>('environment');
  const [cameraLabel, setCameraLabel] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [arViewAngle, setArViewAngle] = useState({ pitch: 25, yaw: 0 });
  const [isArDragging, setIsArDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialYaw: 0, initialPitch: 25 });
  const [isArFullscreen, setIsArFullscreen] = useState(false);

  // Bubble level state
  const [pitch, setPitch] = useState<number>(0.2);
  const [roll, setRoll] = useState<number>(-0.1);
  const [targetAngle, setTargetAngle] = useState<number>(0.0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [calibrationOffset, setCalibrationOffset] = useState({ pitch: 0, roll: 0 });
  const [isLevelFullscreen, setIsLevelFullscreen] = useState(false);

  // Ticking master clock when live mode is active
  useEffect(() => {
    if (!isLiveTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      setCustomHourDec(now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600);
    }, 1000);
    return () => clearInterval(interval);
  }, [isLiveTime]);

  // Hardware device orientation listener for real mobile devices
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.alpha !== null) {
        setIsSensorActive(true);
        setDeviceHeading(360 - e.alpha);
        setArViewAngle((prev) => ({
          ...prev,
          yaw: e.alpha || 0,
          pitch: e.beta !== null ? Math.max(0, Math.min(85, e.beta - 40)) : prev.pitch,
        }));
      }
      if (e.beta !== null && e.gamma !== null) {
        setIsSensorActive(true);
        setPitch(Number((e.beta - calibrationOffset.pitch).toFixed(1)));
        setRoll(Number((e.gamma - calibrationOffset.roll).toFixed(1)));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation);
      stopCamera();
    };
  }, [calibrationOffset]);

  // Select initial tool tab if specified on mount
  useEffect(() => {
    if (initialTab && initialTab !== 'dashboard') {
      setActiveSection(initialTab as SunToolSection);
    }
  }, [initialTab]);

  const scrollToSection = (section: SunToolSection) => {
    setActiveSection(section);
  };

  // Compute synchronized astronomical sun position for the current time
  const currentDate = new Date(selectedDate);
  const hour = Math.floor(customHourDec);
  const min = Math.floor((customHourDec - hour) * 60);
  currentDate.setHours(hour, min, 0, 0);

  const lat = weather.latitude || 17.41;
  const lon = weather.longitude || 78.44;

  const sunData = calculateDetailedSunAngles(lat, lon, currentDate);
  const tiltRecs = calculateOptimalTiltAngles(lat, lon, currentDate);

  const shadowAzimuthDeg = (sunData.azimuthDeg + 180) % 360;

  // Sunrise and Sunset dates for azimuth markers on compass
  const riseDate = new Date(currentDate);
  riseDate.setHours(6, 15, 0, 0);
  const sunriseSun = calculateDetailedSunAngles(lat, lon, riseDate);

  const setDate = new Date(currentDate);
  setDate.setHours(18, 25, 0, 0);
  const sunsetSun = calculateDetailedSunAngles(lat, lon, setDate);

  // Optimal tilt logic
  const isNorthernHemisphere = lat >= 0;
  const optimalTilt = Math.max(10, Math.round(Math.abs(lat)));
  const optimalWinterTilt = Math.min(60, optimalTilt + 15);
  const optimalSummerTilt = Math.max(5, optimalTilt - 15);
  const optimalFacing = isNorthernHemisphere ? 'True South (180°)' : 'True North (0°)';

  // Bubble level precision check
  const totalTiltMagnitude = Math.sqrt(pitch * pitch + roll * roll);
  const diffFromTarget = Math.abs(totalTiltMagnitude - targetAngle);
  const isLevelLocked = diffFromTarget <= 0.6;

  // Audio beep on lock
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {}
  };

  const wasLevelRef = useRef(false);
  useEffect(() => {
    if (isLevelLocked && !wasLevelRef.current) {
      playBeep();
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
    wasLevelRef.current = isLevelLocked;
  }, [isLevelLocked]);

  const handleZeroOut = () => {
    setCalibrationOffset({ pitch, roll });
    setPitch(0);
    setRoll(0);
  };

  // Clamped bubble coordinates (Bullseye radius: 72px)
  const maxVisualAngle = 18;
  const clampedRoll = Math.max(-maxVisualAngle, Math.min(maxVisualAngle, roll));
  const clampedPitch = Math.max(-maxVisualAngle, Math.min(maxVisualAngle, pitch));
  const bubbleX = (clampedRoll / maxVisualAngle) * 72;
  const bubbleY = (clampedPitch / maxVisualAngle) * 72;

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
    setIsCameraActive(false);
  };

  // Start Camera with strict preference for BACK (environment) camera
  const startCamera = async (requestedFacing: 'environment' | 'user' = cameraFacing) => {
    setCameraError(null);
    try {
      // First ensure any previous stream is completely stopped
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not available in this browser environment.');
      }

      // Enumerate available video input devices to explicitly locate the rear/back camera
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

      // When back camera is requested (essential for pointing at the sky):
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
            console.warn('Back device ID match failed, falling back to facingMode:', e);
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
            console.warn('Exact environment failed (falling back to ideal):', e);
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
        // User explicitly asked for front camera
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

      // Final fallback to any available video stream if device-specific calls failed
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
      setIsCameraActive(true);
    } catch (err: any) {
      console.warn('Camera error:', err);
      setIsCameraActive(false);
      setCameraError(
        err.name === 'NotAllowedError'
          ? 'Camera access permission denied. Sky dome simulation active.'
          : 'Back camera is unavailable or in use by another app. Sky dome simulation active.'
      );
    }
  };

  const toggleCamera = () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      startCamera('environment');
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

  // Section Guard: If user scrolls or selects a non-AR tool (and not in fullscreen AR), halt camera
  useEffect(() => {
    if (activeSection !== 'ar' && !isArFullscreen && isCameraActive) {
      stopCamera();
    }
  }, [activeSection, isArFullscreen, isCameraActive]);

  // Video Ref Re-attach Guard: Ensure video stream remains bound if fullscreen mode toggles
  useEffect(() => {
    if (isCameraActive && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [isArFullscreen, isCameraActive]);

  // AR Sky touch look-around handlers
  const handleArPointerDown = (e: React.PointerEvent) => {
    setIsArDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialYaw: arViewAngle.yaw,
      initialPitch: arViewAngle.pitch,
    };
  };

  const handleArPointerMove = (e: React.PointerEvent) => {
    if (!isArDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setArViewAngle({
      yaw: (dragStartRef.current.initialYaw - dx * 0.4 + 360) % 360,
      pitch: Math.max(0, Math.min(85, dragStartRef.current.initialPitch + dy * 0.3)),
    });
  };

  const handleArPointerUp = () => setIsArDragging(false);

  // Compute AR coordinates
  const relativeAzimuth = (sunData.azimuthDeg - arViewAngle.yaw + 540) % 360 - 180;
  const viewportFovX = 70;
  const viewportFovY = 50;
  const normX = relativeAzimuth / (viewportFovX / 2);
  const normY = (sunData.altitudeDeg - arViewAngle.pitch) / (viewportFovY / 2);
  const isSunInFov = Math.abs(normX) <= 1.15 && Math.abs(normY) <= 1.15 && sunData.altitudeDeg > -5;
  const sunScreenXPercent = Math.max(6, Math.min(94, 50 + normX * 45));
  const sunScreenYPercent = Math.max(8, Math.min(92, 50 - normY * 45));

  // Trajectory arc points for AR sky view
  const trajectoryPoints = [];
  for (let h = 6; h <= 18.5; h += 0.5) {
    const sampleDate = new Date(currentDate);
    sampleDate.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
    const pos = calculateDetailedSunAngles(lat, lon, sampleDate);
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

  // Hourly Ephemeris schedule table (06:00 to 18:00)
  const hourlyEphemeris = [];
  for (let h = 6; h <= 18; h += 2) {
    const d = new Date(currentDate);
    d.setHours(h, 0, 0, 0);
    const pos = calculateDetailedSunAngles(lat, lon, d);
    hourlyEphemeris.push({
      time: `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? 'PM' : 'AM'}`,
      altitude: pos.altitudeDeg,
      azimuth: pos.azimuthDeg,
      direction: pos.cardinalDirection.split(' ')[0],
      airMass: pos.airMass,
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

  // Section tool metadata for sticky jump bar
  const sectionTabs = [
    { id: 'compass' as SunToolSection, label: '360° Compass', icon: Compass },
    { id: 'ar' as SunToolSection, label: 'Sun AR Camera', icon: Camera },
    { id: 'timer' as SunToolSection, label: 'Astro Timer', icon: Clock },
    { id: 'tilt' as SunToolSection, label: 'Tilt & Facing', icon: Sliders },
    { id: 'level' as SunToolSection, label: 'Bubble Level', icon: RotateCw },
  ];

  return (
    <div className="flex-1 flex flex-col bg-[#F3F6FA] dark:bg-slate-950 pb-12 transition-colors select-none min-h-screen">
      {/* 1. STICKY TOP APP BAR: Header, Location & Navigation */}
      <div className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/90 dark:border-slate-800 px-3 py-2.5 shadow-xs">
        <div className="flex items-center justify-between gap-2 max-w-xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => {
              stopCamera();
              onNavigate('dashboard');
            }}
            className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 text-xs font-bold hover:text-sky-600 dark:hover:text-sky-400 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
            title="Back to Solar Dashboard"
          >
            <ChevronLeft className="w-4 h-4 stroke-[2.5]" />
            <span>Home</span>
          </button>

          {/* Location & Real-Time Astro Badge */}
          <button
            onClick={onOpenWeather}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition cursor-pointer min-w-0"
            title="Click to change location or view weather"
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate max-w-[130px] sm:max-w-[180px]">
              {weather.city || 'Hyderabad'}
            </span>
            <span className="text-[10px] text-slate-400 font-mono shrink-0">
              {weather.latitude.toFixed(1)}°N
            </span>
          </button>

          {/* Astro Pulse Indicator */}
          <div className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-full text-[10px] font-bold border border-emerald-200/70 dark:border-emerald-800/60 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
            <span>UNIFIED SUITE</span>
          </div>
        </div>

        {/* Sticky Anchor Navigation Bar: 1-Tap Quick Jump Between All 5 Tools */}
        <div className="flex items-center gap-1 pt-2 overflow-x-auto max-w-xl mx-auto scrollbar-none">
          {sectionTabs.map((tab) => {
            const Icon = tab.icon;
            const isSelected = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => scrollToSection(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer shrink-0 ${
                  isSelected
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. MASTER ASTRONOMICAL TIME SCRUBBER CARD (Drives All 5 Tools Synchronously) */}
      <div className="max-w-xl mx-auto w-full px-4 pt-4">
        <div className="bg-white dark:bg-slate-900 rounded-[28px] p-4.5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center">
                <Sun className="w-4 h-4 fill-amber-400 animate-spin-slow" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                    {timeDisplay}
                  </span>
                  <button
                    onClick={() => setIsLiveTime(!isLiveTime)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold cursor-pointer transition ${
                      isLiveTime
                        ? 'bg-emerald-500 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isLiveTime ? '● LIVE SYNC' : 'MANUAL TIME'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Solar Noon {sunData.solarNoonTime} · Day Length {sunData.dayLengthFormatted}
                </p>
              </div>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3.5 h-3.5 text-sky-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setIsLiveTime(false);
                }}
                className="bg-transparent text-[11px] font-semibold text-slate-700 dark:text-slate-200 outline-none cursor-pointer"
              />
            </div>
          </div>

          {/* Master 24-Hour Timeline Slider */}
          <div className="space-y-1">
            <input
              type="range"
              min="5"
              max="19.5"
              step="0.05"
              value={customHourDec}
              onChange={(e) => {
                setCustomHourDec(parseFloat(e.target.value));
                setIsLiveTime(false);
              }}
              className="w-full accent-amber-500 h-2 bg-slate-100 dark:bg-slate-800 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>🌅 {sunData.sunriseTime} Sunrise</span>
              <span className="text-amber-500 font-bold">☀️ 12:00 Solar Noon</span>
              <span>🌇 {sunData.sunsetTime} Sunset</span>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN UNIFIED DASHBOARD CONTAINER */}
      <div className="max-w-xl mx-auto w-full px-4 pt-4 space-y-4">
        {/* ============================================================== */}
        {/* SECTION 1: 360° SOLAR COMPASS & SATELLITE BEAM MAP */}
        {/* ============================================================== */}
        {activeSection === 'compass' && (
        <div
          ref={compassSectionRef}
          id="compass-section"
          className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
        >
          {/* Card Header & Mode Switcher */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-500 flex items-center justify-center font-bold">
                <Compass className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  360° Sun Compass & Direction
                </h3>
                <p className="text-[11px] text-slate-400">
                  Azimuth {sunData.azimuthDeg.toFixed(1)}° ({sunData.cardinalDirection}) · Altitude{' '}
                  {sunData.altitudeDeg.toFixed(1)}°
                </p>
              </div>
            </div>

            {/* Dial vs Satellite Map Toggle */}
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setCompassMode('dial')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                  compassMode === 'dial'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Compass className="w-3 h-3" />
                <span>Dial</span>
              </button>
              <button
                onClick={() => setCompassMode('map')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer ${
                  compassMode === 'map'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <MapIcon className="w-3 h-3" />
                <span>Map</span>
              </button>
            </div>
          </div>

          {/* Compass Content: DIAL MODE */}
          {compassMode === 'dial' ? (
            <div className="flex flex-col items-center pt-2">
              <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
                {/* Outer Ring with degree markings */}
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

                  {/* 12-Hour radial marks every 30 degrees */}
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

                  {/* Cardinal Points */}
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

                  {/* Sunrise azimuth marker */}
                  {(() => {
                    const rad = ((sunriseSun.azimuthDeg - 90) * Math.PI) / 180;
                    const x = 150 + 135 * Math.cos(rad);
                    const y = 150 + 135 * Math.sin(rad);
                    return <circle key="sunrise-marker" cx={x} cy={y} r="5" fill="#f59e0b" />;
                  })()}

                  {/* Sunset azimuth marker */}
                  {(() => {
                    const rad = ((sunsetSun.azimuthDeg - 90) * Math.PI) / 180;
                    const x = 150 + 135 * Math.cos(rad);
                    const y = 150 + 135 * Math.sin(rad);
                    return <circle key="sunset-marker" cx={x} cy={y} r="5" fill="#ea580c" />;
                  })()}
                </svg>

                {/* Rotating Pointer Container */}
                <div
                  className="absolute inset-0 flex items-center justify-center transition-transform duration-300"
                  style={{ transform: `rotate(${sunData.azimuthDeg}deg)` }}
                >
                  {/* Sun Needle (pointing UP towards sun azimuth) */}
                  <div className="absolute top-4 flex flex-col items-center">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-yellow-300 shadow-[0_0_15px_#f59e0b] border-2 border-white dark:border-slate-900 flex items-center justify-center animate-pulse">
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

              {/* Sunrise / Sunset Compass Key */}
              <div className="flex items-center gap-6 mt-3 text-[11px] text-slate-600 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span>Sunrise: {sunriseSun.azimuthDeg.toFixed(0)}° ({sunriseSun.cardinalDirection.split(' ')[0]})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-600"></span>
                  <span>Sunset: {sunsetSun.azimuthDeg.toFixed(0)}° ({sunsetSun.cardinalDirection.split(' ')[0]})</span>
                </div>
              </div>
            </div>
          ) : (
            /* MAP MODE: Satellite Rooftop with Solar Irradiance Beam */
            <div className="w-full h-64 rounded-2xl bg-slate-900 overflow-hidden relative shadow-inner flex items-center justify-center border border-slate-800">
              {/* Satellite Background Grid */}
              <div
                className="absolute inset-0 bg-cover bg-center opacity-70"
                style={{
                  backgroundImage: `radial-gradient(circle at 50% 50%, rgba(30,58,138,0.3) 0%, rgba(15,23,42,0.85) 100%), repeating-linear-gradient(45deg, #1e293b 0px, #1e293b 10px, #0f172a 10px, #0f172a 20px)`,
                }}
              />

              {/* User Pin */}
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-9 h-9 rounded-full bg-amber-500/30 border-2 border-amber-400 flex items-center justify-center shadow-lg">
                  <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping"></div>
                </div>
                <span className="mt-1 px-2 py-0.5 rounded-md bg-black/80 text-white font-mono text-[9px] border border-white/20 shadow">
                  {weather.city || 'Your Rooftop'}
                </span>
              </div>

              {/* Solar Ray SVG Vector */}
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
                    <line x1="150" y1="150" x2={shadowX} y2={shadowY} stroke="#a855f7" strokeWidth="3" strokeDasharray="4 3" opacity="0.8" />
                    <line x1="150" y1="150" x2={endX} y2={endY} stroke="#f59e0b" strokeWidth="4" strokeLinecap="round" />
                    <circle cx={endX} cy={endY} r="12" fill="#f59e0b" stroke="#ffffff" strokeWidth="2.5" />
                    <circle cx={endX} cy={endY} r="6" fill="#fef08a" />
                  </svg>
                );
              })()}

              {/* North Arrow */}
              <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md px-2 py-1 rounded-lg border border-white/20 text-[10px] font-bold text-red-400 flex items-center gap-1">
                <span>▲</span>
                <span>0° N</span>
              </div>
            </div>
          )}

          {/* Quick Ephemeris Ribbons */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs pt-1">
            <div className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-medium">Altitude</span>
              <p className="font-extrabold text-sm text-amber-500 mt-0.5">
                {sunData.altitudeDeg > 0 ? `+${sunData.altitudeDeg.toFixed(1)}` : sunData.altitudeDeg.toFixed(1)}°
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-medium">Azimuth</span>
              <p className="font-extrabold text-sm text-sky-500 mt-0.5">{sunData.azimuthDeg.toFixed(1)}°</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-medium">Zenith</span>
              <p className="font-extrabold text-sm text-purple-500 mt-0.5">{sunData.zenithDeg.toFixed(1)}°</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/70 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800">
              <span className="text-[10px] text-slate-400 font-medium">Shadow Factor</span>
              <p className="font-extrabold text-sm text-emerald-500 mt-0.5">{sunData.shadowFactor}x</p>
            </div>
          </div>
        </div>
        )}

        {/* ============================================================== */}
        {/* SECTION 2: EMBEDDED LIVE SUN AR SKY VIEWPORT */}
        {/* ============================================================== */}
        {activeSection === 'ar' && (
        <div
          ref={arSectionRef}
          id="ar-section"
          className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/60 text-orange-500 flex items-center justify-center font-bold">
                <Camera className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Sun AR Sky Viewport
                </h3>
                <p className="text-[11px] text-slate-400">
                  {isCameraActive
                    ? actualFacing === 'environment'
                      ? '📷 Back Camera active (pointing at sky)'
                      : '⚠️ Front Camera active (selfie view)'
                    : 'Touch to pan or start Back Camera AR'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Camera On / Off Button */}
              <button
                onClick={toggleCamera}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  isCameraActive
                    ? 'bg-emerald-500 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
                }`}
                title={isCameraActive ? 'Turn Camera Off (Stops Hardware Video Feed)' : 'Turn On Back Camera AR'}
              >
                {isCameraActive ? <Video className="w-3.5 h-3.5" /> : <VideoOff className="w-3.5 h-3.5" />}
                <span className="text-[11px]">
                  {isCameraActive
                    ? actualFacing === 'environment'
                      ? 'Back Cam On'
                      : 'Front Cam On'
                    : 'Start Back AR'}
                </span>
              </button>

              {/* Flip Camera Button */}
              {isCameraActive && (
                <button
                  onClick={flipCamera}
                  className="px-2 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer flex items-center gap-1 text-xs"
                  title={`Currently using ${actualFacing === 'environment' ? 'Back Camera' : 'Front Camera'}. Tap to switch.`}
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-500" />
                  <span className="text-[10px] font-semibold">Flip</span>
                </button>
              )}

              {/* Fullscreen Expand Button */}
              <button
                onClick={() => setIsArFullscreen(true)}
                className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition cursor-pointer"
                title="Expand Fullscreen AR View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Inline AR Viewport Canvas */}
          <div
            className="w-full h-72 sm:h-80 rounded-2xl overflow-hidden relative shadow-inner cursor-grab active:cursor-grabbing border border-slate-800 select-none"
            onPointerDown={handleArPointerDown}
            onPointerMove={handleArPointerMove}
            onPointerUp={handleArPointerUp}
          >
            {/* Live Camera Video Stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
                isCameraActive ? 'opacity-100 z-0' : 'opacity-0 -z-10'
              }`}
            />

            {/* Dynamic Sky Simulation Background when Camera is Inactive */}
            {!isCameraActive && (
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
                {/* Mountains Horizon */}
                <div className="absolute bottom-0 inset-x-0 h-28 opacity-40 pointer-events-none">
                  <svg viewBox="0 0 500 150" className="w-full h-full object-cover" preserveAspectRatio="none">
                    <path
                      d="M0 120 L80 85 L160 110 L240 60 L320 95 L400 70 L480 100 L500 90 L500 150 L0 150 Z"
                      fill="#030712"
                    />
                  </svg>
                </div>
              </div>
            )}

            {/* AR Crosshairs HUD */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="w-20 h-20 border border-white/30 rounded-full flex items-center justify-center relative">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400"></div>
                <div className="absolute -top-3 text-[8px] font-mono font-bold text-white/80">
                  {arViewAngle.pitch.toFixed(0)}° PITCH
                </div>
                <div className="absolute -bottom-3 text-[8px] font-mono font-bold text-white/80">
                  {arViewAngle.yaw.toFixed(0)}° YAW
                </div>
              </div>
            </div>

            {/* AR Solar Trajectory Polyline */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
              <defs>
                <linearGradient id="arGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
                  <stop offset="50%" stopColor="#fbbf24" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#ea580c" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              {trajectoryPoints.length > 1 && (
                <path
                  d={trajectoryPoints
                    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x}% ${pt.y}%`)
                    .join(' ')}
                  fill="none"
                  stroke="url(#arGrad)"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                />
              )}
            </svg>

            {/* Glowing AR Sun Disc */}
            {isSunInFov && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${sunScreenXPercent}%`,
                  top: `${sunScreenYPercent}%`,
                }}
              >
                <div className="w-24 h-24 -m-12 rounded-full bg-amber-400/30 blur-lg animate-pulse absolute top-1/2 left-1/2"></div>
                <div className="w-8 h-8 -m-4 rounded-full bg-white border-2 border-amber-300 shadow-[0_0_20px_#f59e0b] flex items-center justify-center relative">
                  <Sun className="w-4 h-4 text-amber-500 fill-amber-400" />
                </div>
                <div className="absolute top-5 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded-lg border border-amber-400/50 shadow whitespace-nowrap text-center">
                  <p className="text-[10px] font-bold text-amber-300">
                    Sun ({timeDisplay})
                  </p>
                  <p className="text-[8px] font-mono text-slate-200">
                    Alt: {sunData.altitudeDeg.toFixed(1)}° · Az: {sunData.azimuthDeg.toFixed(1)}°
                  </p>
                </div>
              </div>
            )}

            {/* Off-screen guidance badge */}
            {!isSunInFov && (
              <div className="absolute top-4 inset-x-4 z-20 flex justify-center pointer-events-none">
                <div className="bg-black/80 backdrop-blur-md text-amber-300 px-3 py-1 rounded-full text-xs font-bold border border-amber-400/40 shadow-lg flex items-center gap-1.5 animate-bounce">
                  <Sun className="w-3.5 h-3.5 fill-current" />
                  <span>
                    Pan towards {sunData.cardinalDirection} (Alt {sunData.altitudeDeg.toFixed(0)}°)
                  </span>
                </div>
              </div>
            )}

            {/* Active camera indicator badge (Back vs Front) */}
            {isCameraActive && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5">
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
            {isCameraActive && actualFacing === 'user' && (
              <div className="absolute top-12 inset-x-3 z-25 flex justify-center">
                <div className="bg-amber-950/90 text-amber-100 border border-amber-500/80 px-3 py-2 rounded-2xl text-xs shadow-xl backdrop-blur-md flex items-center justify-between gap-2 max-w-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-extrabold text-xs">⚠️ Front View:</span>
                    <span className="text-[10px] text-amber-200 leading-tight">
                      Pointing at sky needs the Back Camera.
                    </span>
                  </div>
                  <button
                    onClick={() => startCamera('environment')}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-[11px] shrink-0 cursor-pointer shadow-xs transition"
                  >
                    Switch to Back
                  </button>
                </div>
              </div>
            )}

            {/* Camera facing flip button */}
            {isCameraActive && (
              <button
                onClick={flipCamera}
                className="absolute bottom-3 right-3 z-20 px-2.5 py-1.5 rounded-full bg-black/70 hover:bg-black/90 text-white backdrop-blur-md border border-white/20 transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold shadow-md"
                title={`Switch camera (current: ${actualFacing === 'environment' ? 'Back Camera' : 'Front Camera'})`}
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span className="text-[11px]">{actualFacing === 'environment' ? 'Back Cam' : 'Front Cam'}</span>
              </button>
            )}
          </div>
        </div>
        )}

        {/* ============================================================== */}
        {/* SECTION 3: ASTRONOMICAL SUN TIMER & EPHEMERIS */}
        {/* ============================================================== */}
        {activeSection === 'timer' && (
        <div
          ref={timerSectionRef}
          id="timer-section"
          className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-500 flex items-center justify-center font-bold">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Sun Timer & Astronomical Ephemeris
                </h3>
                <p className="text-[11px] text-slate-400">
                  Solar Position Algorithm (SPA) with atmospheric optical depth
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/50 px-2 py-0.5 rounded-full border border-sky-200/60 dark:border-sky-800">
              SPA MODEL
            </span>
          </div>

          {/* Daylight Duration & Golden Hours Ribbon */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-500">
                <Sunrise className="w-3.5 h-3.5" />
                <span>Sunrise</span>
              </div>
              <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                {sunData.sunriseTime}
              </p>
              <p className="text-[10px] text-slate-400">Dawn: {sunData.civilDawn}</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-500">
                <Sun className="w-3.5 h-3.5" />
                <span>Solar Noon</span>
              </div>
              <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                {sunData.solarNoonTime}
              </p>
              <p className="text-[10px] text-slate-400">Peak irradiance</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-orange-500">
                <Sunset className="w-3.5 h-3.5" />
                <span>Sunset</span>
              </div>
              <p className="text-base font-black text-slate-900 dark:text-white mt-1">
                {sunData.sunsetTime}
              </p>
              <p className="text-[10px] text-slate-400">Dusk: {sunData.civilDusk}</p>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-purple-500">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Golden Hour</span>
              </div>
              <p className="text-sm font-black text-slate-900 dark:text-white mt-1">
                {sunData.goldenHourEvening}
              </p>
              <p className="text-[10px] text-slate-400">Optimal soft spectrum</p>
            </div>
          </div>

          {/* Deep Ephemeris Indices (Air Mass, EoT, LST) */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs pt-1">
            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Air Mass (AM) Optical Depth
                </span>
                <p className="text-[10px] text-slate-400">
                  Standard test condition is AM 1.5 (1000 W/m²)
                </p>
              </div>
              <span className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                AM {sunData.airMass.toFixed(2)}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Equation of Time (EoT)
                </span>
                <p className="text-[10px] text-slate-400">
                  Orbital eccentricity and axial obliquity adjustment
                </p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sunData.equationOfTimeMinutes > 0
                  ? `+${sunData.equationOfTimeMinutes}`
                  : sunData.equationOfTimeMinutes}{' '}
                min
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Local Solar Time (LST)
                </span>
                <p className="text-[10px] text-slate-400">
                  True sundial time based on longitude
                </p>
              </div>
              <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                {sunData.localSolarTimeString}
              </span>
            </div>

            <div className="py-2.5 flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  Solar Declination Angle (δ)
                </span>
                <p className="text-[10px] text-slate-400">
                  Current seasonal tilt of Earth relative to Sun
                </p>
              </div>
              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                {sunData.declinationDeg.toFixed(2)}°
              </span>
            </div>
          </div>

          {/* Hourly Ephemeris Schedule Table */}
          <div className="pt-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Hourly Sun Position Table (Today)
            </span>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500">
                  <tr>
                    <th className="py-2 px-3">Hour</th>
                    <th className="py-2 px-3">Altitude</th>
                    <th className="py-2 px-3">Azimuth</th>
                    <th className="py-2 px-3">Facing</th>
                    <th className="py-2 px-3">Air Mass</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-[11px]">
                  {hourlyEphemeris.map((row) => (
                    <tr key={row.time} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <td className="py-1.5 px-3 font-bold font-sans text-slate-800 dark:text-slate-200">
                        {row.time}
                      </td>
                      <td className="py-1.5 px-3 text-amber-500 font-bold">
                        {row.altitude > 0 ? `+${row.altitude.toFixed(1)}°` : `${row.altitude.toFixed(1)}°`}
                      </td>
                      <td className="py-1.5 px-3 text-sky-500">{row.azimuth.toFixed(1)}°</td>
                      <td className="py-1.5 px-3 font-sans text-slate-500">{row.direction}</td>
                      <td className="py-1.5 px-3 text-emerald-500">AM {row.airMass.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        )}

        {/* ============================================================== */}
        {/* SECTION 4: SOLAR PANEL TILT, ORIENTATION & TRACKER ANGLES */}
        {/* ============================================================== */}
        {activeSection === 'tilt' && (
        <div
          ref={tiltSectionRef}
          id="tilt-section"
          className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-500 flex items-center justify-center font-bold">
                <Sliders className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Tilt & Panel Orientation Optimizer
                </h3>
                <p className="text-[11px] text-slate-400">
                  Calibrated for Latitude {weather.latitude.toFixed(2)}° to maximize annual kWh
                </p>
              </div>
            </div>

            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-0.5 rounded-full border border-emerald-200/60 dark:border-emerald-800">
              OPTIMIZED
            </span>
          </div>

          {/* Primary Annual Recommendation Card */}
          <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 rounded-2xl p-4.5 text-white shadow-sm flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-sky-200">
                Recommended Annual Fixed Tilt
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-3xl font-black">{optimalTilt}°</span>
                <span className="text-xs font-bold text-emerald-300">
                  Facing {optimalFacing}
                </span>
              </div>
              <p className="text-[11px] text-sky-100/80 mt-1">
                Yields highest cumulative annual photovoltaic output.
              </p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/20">
              <Zap className="w-6 h-6 text-amber-300" />
            </div>
          </div>

          {/* Seasonal Adjustments Grid */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="bg-amber-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-amber-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">
                ☀️ Summer Tilt
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {optimalSummerTilt}°
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">Flatter (May - Jul)</p>
            </div>

            <div className="bg-emerald-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-emerald-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                🌿 Equinox Tilt
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {optimalTilt}°
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">Mar & Sep</p>
            </div>

            <div className="bg-blue-50/70 dark:bg-slate-800/60 p-3 rounded-2xl border border-blue-100 dark:border-slate-800">
              <span className="text-[10px] font-bold uppercase text-blue-600 dark:text-blue-400">
                ❄️ Winter Tilt
              </span>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-0.5">
                {optimalWinterTilt}°
              </p>
              <p className="text-[9px] text-slate-400 mt-0.5">Steeper (Nov - Jan)</p>
            </div>
          </div>

          {/* Single-Axis & Dual-Axis Tracker Potential */}
          <div className="grid grid-cols-2 gap-2.5 pt-1 text-xs">
            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Single-Axis Tracker</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {tiltRecs.singleAxisAngleNowDeg > 0 ? `+${tiltRecs.singleAxisAngleNowDeg}° W` : `${tiltRecs.singleAxisAngleNowDeg}° E`}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold text-[10px]">
                +22% kWh
              </span>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">Dual-Axis Tracker</span>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {tiltRecs.dualAxisTiltNowDeg}° / {tiltRecs.dualAxisAzimuthNowDeg}°
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-extrabold text-[10px]">
                +34% kWh
              </span>
            </div>
          </div>
        </div>
        )}

        {/* ============================================================== */}
        {/* SECTION 5: PRECISION DUAL-AXIS SPIRIT BUBBLE LEVEL */}
        {/* ============================================================== */}
        {activeSection === 'level' && (
        <div
          ref={levelSectionRef}
          id="level-section"
          className="bg-white dark:bg-slate-900 rounded-[28px] p-5 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4"
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-lime-50 dark:bg-lime-950/60 text-lime-600 dark:text-lime-400 flex items-center justify-center font-bold">
                <RotateCw className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Dual-Axis Spirit Bubble Level
                </h3>
                <p className="text-[11px] text-slate-400">
                  Place phone on solar panel frame to measure pitch & roll
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Audio Beep Toggle */}
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  soundEnabled
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
                title={soundEnabled ? 'Mute level audio beep' : 'Enable alignment audio beep'}
              >
                {soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>

              {/* Zero / Tare Calibration Button */}
              <button
                onClick={handleZeroOut}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                title="Tare / Calibrate to 0° on current surface"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Alignment Lock Status Banner */}
          <div
            className={`rounded-2xl p-3 border flex items-center justify-between transition-all ${
              isLevelLocked
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                  isLevelLocked ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                }`}
              >
                {isLevelLocked ? <CheckCircle2 className="w-5 h-5" /> : <Lock className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-xs font-extrabold uppercase tracking-wider">
                  {isLevelLocked
                    ? targetAngle === 0
                      ? 'PERFECTLY LEVEL (0.0°)'
                      : `TARGET ANGLE LOCKED (${targetAngle.toFixed(1)}°)`
                    : `OFF TARGET BY ${diffFromTarget.toFixed(1)}°`}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                  {isSensorActive
                    ? 'Hardware Gyroscope Live'
                    : 'Interactive Sensor Active (drag slider below to simulate)'}
                </p>
              </div>
            </div>
            <span className="font-mono font-black text-lg text-slate-900 dark:text-white">
              {totalTiltMagnitude.toFixed(1)}°
            </span>
          </div>

          {/* 2D Circular Bullseye Gauge */}
          <div className="bg-slate-950 text-white rounded-3xl p-5 border border-slate-800 flex flex-col items-center justify-center relative select-none">
            <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
              {/* Outer Bezel */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-700 bg-slate-900 shadow-inner"></div>

              {/* Concentric rings: 2°, 5°, 10°, 15° */}
              <div className="w-12 h-12 rounded-full border border-slate-700 absolute"></div>
              <div className="w-24 h-24 rounded-full border border-slate-700 absolute"></div>
              <div className="w-36 h-36 rounded-full border border-slate-700 absolute"></div>
              <div className="w-48 h-48 rounded-full border border-slate-700 absolute"></div>

              {/* Crosshairs */}
              <div className="absolute inset-x-0 h-px bg-slate-700"></div>
              <div className="absolute inset-y-0 w-px bg-slate-700"></div>

              {/* Center Bullseye Target Ring */}
              <div
                className={`w-14 h-14 rounded-full border-2 transition-all flex items-center justify-center ${
                  isLevelLocked
                    ? 'border-emerald-400 bg-emerald-500/20 shadow-[0_0_15px_#10b981]'
                    : 'border-slate-500'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-500"></div>
              </div>

              {/* Floating Spirit Bubble */}
              <div
                className={`w-12 h-12 rounded-full border-2 transition-all duration-75 shadow-lg flex items-center justify-center absolute transform -translate-x-1/2 -translate-y-1/2 ${
                  isLevelLocked
                    ? 'bg-emerald-400 border-white shadow-[0_0_20px_#10b981]'
                    : 'bg-lime-400 border-white shadow-md'
                }`}
                style={{
                  left: `calc(50% + ${bubbleX}px)`,
                  top: `calc(50% + ${bubbleY}px)`,
                }}
              >
                <div className="w-3 h-3 rounded-full bg-white/70 absolute top-1.5 left-2"></div>
                <span className="text-[10px] font-mono font-bold text-slate-950">
                  {totalTiltMagnitude.toFixed(1)}°
                </span>
              </div>
            </div>

            {/* Live Pitch & Roll Readouts */}
            <div className="grid grid-cols-2 gap-4 w-full mt-4 pt-3 border-t border-slate-800 text-center">
              <div className="bg-slate-900 rounded-xl p-2">
                <span className="text-[9px] font-bold uppercase text-slate-400">Pitch (Front/Back)</span>
                <p className="font-mono font-black text-base text-white">
                  {pitch > 0 ? `+${pitch.toFixed(1)}°` : `${pitch.toFixed(1)}°`}
                </p>
              </div>
              <div className="bg-slate-900 rounded-xl p-2">
                <span className="text-[9px] font-bold uppercase text-slate-400">Roll (Left/Right)</span>
                <p className="font-mono font-black text-base text-white">
                  {roll > 0 ? `+${roll.toFixed(1)}°` : `${roll.toFixed(1)}°`}
                </p>
              </div>
            </div>
          </div>

          {/* Target Angle Presets */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Alignment Angle Presets
            </span>
            <div className="grid grid-cols-4 gap-2 text-xs font-bold">
              {[
                { label: '0.0° Level', val: 0.0 },
                { label: `${optimalTilt}° Solar`, val: optimalTilt },
                { label: `${optimalSummerTilt}° Summer`, val: optimalSummerTilt },
                { label: `${optimalWinterTilt}° Winter`, val: optimalWinterTilt },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => setTargetAngle(preset.val)}
                  className={`py-2 px-1 rounded-xl border text-center transition cursor-pointer ${
                    targetAngle === preset.val
                      ? 'bg-amber-500 text-slate-950 border-amber-500 shadow-xs'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Desktop / Web Preview Tilt Sliders when hardware sensors are not active */}
          {!isSensorActive && (
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3 border border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Manual Tilt Simulation (Preview Mode)
              </span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Pitch:</span>
                    <span className="font-mono font-bold">{pitch.toFixed(1)}°</span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.1"
                    value={pitch}
                    onChange={(e) => setPitch(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
                <div>
                  <div className="flex justify-between text-slate-500 mb-1">
                    <span>Roll:</span>
                    <span className="font-mono font-bold">{roll.toFixed(1)}°</span>
                  </div>
                  <input
                    type="range"
                    min="-15"
                    max="15"
                    step="0.1"
                    value={roll}
                    onChange={(e) => setRoll(parseFloat(e.target.value))}
                    className="w-full accent-amber-500 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      {/* FULL-SCREEN AR MODAL (When User Needs Edge-to-Edge Field Camera View) */}
      {isArFullscreen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col text-white">
          <div className="p-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-20">
            <button
              onClick={() => setIsArFullscreen(false)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/50 border border-white/20 text-xs font-bold"
            >
              <Minimize2 className="w-4 h-4" />
              <span>Back to Dashboard</span>
            </button>
            <div className="text-center">
              <p className="text-xs font-extrabold text-amber-400">AR SKY TRACKER</p>
              <p className="text-[10px] font-mono">Alt: {sunData.altitudeDeg.toFixed(1)}° · Az: {sunData.azimuthDeg.toFixed(1)}°</p>
            </div>
            <div className="flex items-center gap-1.5">
              {isCameraActive && (
                <button
                  onClick={flipCamera}
                  className="px-2.5 py-1.5 rounded-full bg-black/60 border border-white/20 text-xs font-bold hover:bg-black/80 flex items-center gap-1 text-white"
                  title="Flip camera"
                >
                  <RotateCw className="w-3.5 h-3.5 text-sky-400" />
                  <span className="text-[10px]">{actualFacing === 'environment' ? 'Back' : 'Front'}</span>
                </button>
              )}
              <button
                onClick={toggleCamera}
                className="p-2 rounded-full bg-black/60 border border-white/20 text-xs font-bold hover:bg-black/80"
                title={isCameraActive ? 'Turn off camera' : 'Turn on back camera'}
              >
                {isCameraActive ? <Video className="w-4 h-4 text-emerald-400" /> : <VideoOff className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div
            className="flex-1 relative overflow-hidden"
            onPointerDown={handleArPointerDown}
            onPointerMove={handleArPointerMove}
            onPointerUp={handleArPointerUp}
          >
            {/* Main Fullscreen AR viewport */}
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`absolute inset-0 w-full h-full object-cover ${isCameraActive ? 'opacity-100' : 'opacity-0'}`}
            />
            {!isCameraActive && (
              <div
                className="absolute inset-0 w-full h-full"
                style={{
                  background:
                    sunData.altitudeDeg > 15
                      ? 'radial-gradient(ellipse at 50% 30%, #38bdf8 0%, #0284c7 45%, #0369a1 80%, #082f49 100%)'
                      : 'radial-gradient(ellipse at 50% 60%, #fdba74 0%, #f97316 35%, #0284c7 70%, #0f172a 100%)',
                }}
              />
            )}

            {/* Fullscreen Front Camera Alert */}
            {isCameraActive && actualFacing === 'user' && (
              <div className="absolute top-4 inset-x-4 z-25 flex justify-center">
                <div className="bg-amber-950/90 text-amber-100 border border-amber-500/80 px-4 py-2.5 rounded-2xl text-xs shadow-xl backdrop-blur-md flex items-center justify-between gap-3 max-w-sm">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-400 font-extrabold text-xs">⚠️ Front Camera:</span>
                    <span className="text-[11px] text-amber-200">
                      Pointing at sky requires the Back Camera.
                    </span>
                  </div>
                  <button
                    onClick={() => startCamera('environment')}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-[11px] shrink-0 cursor-pointer shadow-xs transition"
                  >
                    Switch to Back
                  </button>
                </div>
              </div>
            )}

            {/* Fullscreen Crosshair */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-28 h-28 border border-white/30 rounded-full flex items-center justify-center relative">
                <div className="w-2 h-2 rounded-full bg-amber-400"></div>
                <div className="absolute -top-3 text-[9px] font-mono">{arViewAngle.pitch.toFixed(0)}° PITCH</div>
                <div className="absolute -bottom-3 text-[9px] font-mono">{arViewAngle.yaw.toFixed(0)}° YAW</div>
              </div>
            </div>

            {/* Sun Disc */}
            {isSunInFov && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                style={{
                  left: `${sunScreenXPercent}%`,
                  top: `${sunScreenYPercent}%`,
                }}
              >
                <div className="w-32 h-32 -m-16 rounded-full bg-amber-400/30 blur-xl animate-pulse absolute top-1/2 left-1/2"></div>
                <div className="w-10 h-10 -m-5 rounded-full bg-white border-2 border-amber-300 shadow-[0_0_25px_#f59e0b] flex items-center justify-center">
                  <Sun className="w-5 h-5 text-amber-500 fill-amber-400" />
                </div>
              </div>
            )}
          </div>

          {/* Bottom Fullscreen Scrubber */}
          <div className="p-4 bg-slate-900 border-t border-white/10 z-20 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="font-bold text-amber-400">{timeDisplay}</span>
              <span className="font-mono text-slate-400">Alt {sunData.altitudeDeg.toFixed(1)}° · Az {sunData.azimuthDeg.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min="5"
              max="19.5"
              step="0.05"
              value={customHourDec}
              onChange={(e) => {
                setCustomHourDec(parseFloat(e.target.value));
                setIsLiveTime(false);
              }}
              className="w-full accent-amber-500 h-2 bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      )}
    </div>
  );
};
