import React, { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
  onFallbackOpenExport?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  compact = false,
  onFallbackOpenExport,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white font-bold shadow-xs transition cursor-pointer ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-4 py-2.5 text-xs'
        }`}
      >
        <Download className="w-3.5 h-3.5 shrink-0" />
        <span>Install Android / App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-[#FF6F00] font-bold transition cursor-pointer ${
            compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
          }`}
        >
          <Smartphone className="w-3.5 h-3.5 shrink-0" />
          <span>Install App (iOS)</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-xl border border-slate-200 dark:border-slate-700 space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Install on iPhone / iPad
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                <br />
                2. Scroll down and tap <strong>Add to Home Screen</strong>.
              </p>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full rounded-xl bg-slate-100 dark:bg-slate-800 py-2 text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  if (onFallbackOpenExport) {
    return (
      <button
        type="button"
        onClick={onFallbackOpenExport}
        className={`inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-bold transition cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/50 ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
        }`}
      >
        <Smartphone className="w-3.5 h-3.5 shrink-0" />
        <span>APK / GitHub</span>
      </button>
    );
  }

  return null;
};
