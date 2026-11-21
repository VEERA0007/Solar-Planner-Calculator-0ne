import React, { useState, useEffect, useRef } from 'react';
import {
  Maximize2,
  RotateCcw,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
  CheckCircle2,
  Sliders,
  Smartphone,
  Info,
} from 'lucide-react';
import { ScreenId, WeatherCondition } from '../types/solar';
import { MaterialTopBar } from '../components/MaterialTopBar';

interface BubbleLevelScreenProps {
  onNavigate: (screen: ScreenId) => void;
  weather: WeatherCondition;
  onOpenWeather: () => void;
  hideTopBar?: boolean;
}

export const BubbleLevelScreen: React.FC<BubbleLevelScreenProps> = ({
  onNavigate,
  weather,
  onOpenWeather,
  hideTopBar = false,
}) => {
  // Pitch (X-axis, front-back tilt) and Roll (Y-axis, left-right tilt)
  const [pitch, setPitch] = useState(0.2); // degrees
  const [roll, setRoll] = useState(-0.1); // degrees
  const [targetAngle, setTargetAngle] = useState(0.0); // 0.0 = level, or e.g. 18.0 for solar tilt
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isSensorActive, setIsSensorActive] = useState(false);
  const [calibrationOffset, setCalibrationOffset] = useState({ pitch: 0, roll: 0 });

  // Sound beep simulation using Web Audio API
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880 Hz high A
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch (e) {
      // AudioContext policy
    }
  };

  // Device orientation sensors on real mobile devices
  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta !== null && e.gamma !== null) {
        setIsSensorActive(true);
        // beta is pitch (-180 to 180), gamma is roll (-90 to 90)
        setPitch(Number((e.beta - calibrationOffset.pitch).toFixed(1)));
        setRoll(Number((e.gamma - calibrationOffset.roll).toFixed(1)));
      }
    };

    window.addEventListener('deviceorientation', handleOrientation);
    return () => window.removeEventListener('deviceorientation', handleOrientation);
  }, [calibrationOffset]);

  // Check if within tolerance of target angle
  const totalTiltMagnitude = Math.sqrt(pitch * pitch + roll * roll);
  const diffFromTarget = Math.abs(totalTiltMagnitude - targetAngle);
  const isLevel = diffFromTarget <= 0.6;

  // Trigger beep when newly leveled
  const wasLevelRef = useRef(false);
  useEffect(() => {
    if (isLevel && !wasLevelRef.current) {
      playBeep();
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
    wasLevelRef.current = isLevel;
  }, [isLevel]);

  // Calibration tare
  const handleZeroOut = () => {
    setCalibrationOffset({ pitch, roll });
    setPitch(0);
    setRoll(0);
  };

  // Calculate pixel offsets for circular bullseye (Max radius = 80px for 20° tilt)
  const maxVisualAngle = 18;
  const clampedRoll = Math.max(-maxVisualAngle, Math.min(maxVisualAngle, roll));
  const clampedPitch = Math.max(-maxVisualAngle, Math.min(maxVisualAngle, pitch));

  const bubbleX = (clampedRoll / maxVisualAngle) * 80;
  const bubbleY = (clampedPitch / maxVisualAngle) * 80;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 dark:bg-slate-950 pb-8 transition-colors">
      {!hideTopBar && (
        <MaterialTopBar
          title="Bubble Level & Inclinometer"
          subtitle="Precision Angle Alignment for Solar Panels"
          showBack={true}
          onBack={() => onNavigate('dashboard')}
          weather={weather}
          onOpenWeather={onOpenWeather}
          actionButton={
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-2 rounded-full border transition cursor-pointer ${
                soundEnabled
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}
              title={soundEnabled ? 'Mute level beep' : 'Enable level sound beep'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          }
        />
      )}

      <div className="p-4 space-y-4 max-w-2xl mx-auto w-full">
        {/* Alignment Status Banner */}
        <div
          className={`rounded-3xl p-4 border flex items-center justify-between gap-2 transition-all shadow-sm ${
            isLevel
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                isLevel
                  ? 'bg-emerald-500 text-white animate-bounce'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
              }`}
            >
              {isLevel ? <CheckCircle2 className="w-6 h-6" /> : <Lock className="w-5 h-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-wider truncate">
                {isLevel
                  ? targetAngle === 0
                    ? 'SURFACE PERFECTLY LEVEL (0.0°)'
                    : `TARGET ANGLE LOCKED (${targetAngle.toFixed(1)}°)`
                  : `TILT OFF TARGET BY ${diffFromTarget.toFixed(1)}°`}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {isSensorActive
                  ? 'Real-Time Hardware Gyroscope Active'
                  : 'Interactive Sensor Simulation Active (drag/tilt to align)'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hideTopBar && (
              <button
                type="button"
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
                  soundEnabled
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}
                title={soundEnabled ? 'Mute level beep' : 'Enable level sound beep'}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            )}
            <span className="font-mono font-black text-xl text-slate-900 dark:text-white">
              {totalTiltMagnitude.toFixed(1)}°
            </span>
          </div>
        </div>

        {/* 2D Circular Bullseye Spirit Level */}
        <div className="bg-white dark:bg-slate-900 rounded-[32px] p-6 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center relative overflow-hidden select-none">
          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center">
            {/* Outer metal bezel */}
            <div className="absolute inset-0 rounded-full border-4 border-slate-200 dark:border-slate-700 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-900 shadow-inner"></div>

            {/* Spirit fluid glass circular chamber */}
            <div
              className={`absolute inset-3 rounded-full transition-colors duration-300 shadow-inner flex items-center justify-center ${
                isLevel
                  ? 'bg-emerald-100/80 dark:bg-emerald-950/50'
                  : 'bg-sky-50 dark:bg-slate-800/60'
              }`}
            >
              {/* Concentric Degree Rings: 2°, 5°, 10°, 15° */}
              <div className="w-12 h-12 rounded-full border border-slate-300 dark:border-slate-600 absolute"></div>
              <div className="w-24 h-24 rounded-full border border-slate-300 dark:border-slate-600 absolute"></div>
              <div className="w-36 h-36 rounded-full border border-slate-300 dark:border-slate-600 absolute"></div>
              <div className="w-48 h-48 rounded-full border border-slate-300 dark:border-slate-600 absolute"></div>

              {/* Crosshairs */}
              <div className="absolute inset-x-0 h-px bg-slate-300 dark:bg-slate-600"></div>
              <div className="absolute inset-y-0 w-px bg-slate-300 dark:bg-slate-600"></div>

              {/* Center Bullseye Target Ring */}
              <div
                className={`w-14 h-14 rounded-full border-2 transition-all flex items-center justify-center ${
                  isLevel
                    ? 'border-emerald-500 bg-emerald-400/20 shadow-[0_0_15px_#10b981]'
                    : 'border-slate-400/70'
                }`}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
              </div>

              {/* The Floating Fluid Bubble */}
              <div
                className={`w-12 h-12 rounded-full border-2 transition-all duration-75 shadow-lg flex items-center justify-center absolute transform -translate-x-1/2 -translate-y-1/2 ${
                  isLevel
                    ? 'bg-emerald-400 border-white shadow-[0_0_20px_#10b981]'
                    : 'bg-lime-400 border-white shadow-md'
                }`}
                style={{
                  left: `calc(50% + ${bubbleX}px)`,
                  top: `calc(50% + ${bubbleY}px)`,
                }}
              >
                {/* Bubble reflection highlight */}
                <div className="w-3 h-3 rounded-full bg-white/70 absolute top-1.5 left-2"></div>
                <span className="text-[10px] font-mono font-bold text-slate-900">
                  {totalTiltMagnitude.toFixed(1)}°
                </span>
              </div>
            </div>
          </div>

          {/* Quick Pitch & Roll Sub-readouts */}
          <div className="grid grid-cols-2 gap-4 w-full mt-5 pt-3 border-t border-slate-100 dark:border-slate-800 text-center">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">Pitch (Front/Back)</span>
              <p className="font-mono font-black text-lg text-slate-800 dark:text-slate-100">
                {pitch > 0 ? `+${pitch.toFixed(1)}°` : `${pitch.toFixed(1)}°`}
              </p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-2.5">
              <span className="text-[10px] font-bold uppercase text-slate-400">Roll (Left/Right)</span>
              <p className="font-mono font-black text-lg text-slate-800 dark:text-slate-100">
                {roll > 0 ? `+${roll.toFixed(1)}°` : `${roll.toFixed(1)}°`}
              </p>
            </div>
          </div>
        </div>

        {/* Target Preset Angle Selector */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Solar Angle Presets
            </span>
            <button
              onClick={handleZeroOut}
              className="flex items-center gap-1 text-[11px] font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Calibrate / Zero</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs font-bold">
            {[
              { label: '0.0° Level', val: 0.0 },
              { label: '15.0° Flat', val: 15.0 },
              { label: '18.0° Solar', val: 18.0 },
              { label: '25.0° Pitch', val: 25.0 },
            ].map((preset) => (
              <button
                key={preset.label}
                onClick={() => setTargetAngle(preset.val)}
                className={`py-2 px-1 rounded-xl border text-center transition cursor-pointer ${
                  targetAngle === preset.val
                    ? 'bg-sky-600 text-white border-sky-600 shadow-xs'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Manual Tilt Adjuster (For preview / desktop testing) */}
        {!isSensorActive && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Manual Simulation Controls (for Desktop / Web Preview)
            </span>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Adjust Pitch:</span>
                <span className="font-mono font-bold">{pitch.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.1"
                value={pitch}
                onChange={(e) => setPitch(parseFloat(e.target.value))}
                className="w-full accent-sky-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Adjust Roll:</span>
                <span className="font-mono font-bold">{roll.toFixed(1)}°</span>
              </div>
              <input
                type="range"
                min="-15"
                max="15"
                step="0.1"
                value={roll}
                onChange={(e) => setRoll(parseFloat(e.target.value))}
                className="w-full accent-sky-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
