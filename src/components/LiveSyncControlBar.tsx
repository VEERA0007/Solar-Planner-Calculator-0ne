import React from 'react';
import { RefreshCw, Radio, Clock, Cpu } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { ResolvedInverterTelemetry } from '../types/inverter';

interface LiveSyncControlBarProps {
  isSyncing: boolean;
  onSyncNow: () => void;
  isHourlySyncEnabled: boolean;
  onToggleHourlySync: (enabled: boolean) => void;
  lastSyncedTime: string;
  inverterTelemetry?: ResolvedInverterTelemetry;
  onOpenInverterHub?: () => void;
  className?: string;
  compact?: boolean;
}

export const LiveSyncControlBar: React.FC<LiveSyncControlBarProps> = ({
  isSyncing,
  onSyncNow,
  isHourlySyncEnabled,
  onToggleHourlySync,
  lastSyncedTime,
  inverterTelemetry,
  onOpenInverterHub,
  className = '',
}) => {
  const { t } = useLanguage();
  const isInverterConnected = Boolean(inverterTelemetry?.isConnected);

  return (
    <div
      className={`w-full bg-white dark:bg-slate-900 rounded-2xl p-2.5 px-3.5 border border-slate-200/90 dark:border-slate-800 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 transition select-none ${className}`}
    >
      {/* Left: Live Status & Last Updated Timestamp */}
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full shrink-0 transition-colors ${
              isInverterConnected
                ? 'bg-emerald-500'
                : isHourlySyncEnabled
                  ? 'bg-sky-500'
                  : 'bg-amber-400'
            }`}
          />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1">
            <Radio className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span>{t('hourly_auto_sync', 'Auto-Sync')}</span>
          </span>
        </div>

        <span className="text-slate-300 dark:text-slate-700 hidden sm:inline">·</span>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 truncate font-mono tabular-nums">
          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
          <span>
            {t('last_synced', 'Updated')}:{' '}
            <strong className="text-slate-700 dark:text-slate-300 font-semibold">
              {lastSyncedTime || 'Live'}
            </strong>
          </span>
        </div>
      </div>

      {/* Right: Inverter Hub Trigger, Toggle Switch & 'Sync Now' Action Button */}
      <div className="flex items-center gap-2 shrink-0 ml-auto">
        {onOpenInverterHub && (
          <button
            type="button"
            onClick={onOpenInverterHub}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              isInverterConnected
                ? 'border-emerald-200 dark:border-emerald-800/80 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100/70'
                : 'border-amber-200 dark:border-amber-800/70 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 hover:bg-amber-100/70'
            }`}
            title="Open Universal Solar Inverter Sync Hub"
          >
            <Cpu className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono tabular-nums">
              {isInverterConnected && inverterTelemetry
                ? `${inverterTelemetry.displayGenKwh} kWh`
                : 'Inverter'}
            </span>
          </button>
        )}

        {/* Toggle Switch: Auto-refresh every hour */}
        <label
          htmlFor="hourly-sync-toggle"
          className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition"
          title={
            isHourlySyncEnabled
              ? 'Auto-refresh every hour is active'
              : 'Enable auto-refreshing weather and peak sun data every hour'
          }
        >
          <span className="hidden xs:inline text-[10px] font-medium text-slate-400 dark:text-slate-400">
            {isHourlySyncEnabled ? '1h On' : '1h Off'}
          </span>
          <button
            id="hourly-sync-toggle"
            type="button"
            role="switch"
            aria-checked={isHourlySyncEnabled}
            onClick={() => onToggleHourlySync(!isHourlySyncEnabled)}
            className={`w-10 h-5 rounded-full transition-colors relative cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-sky-500/50 ${
              isHourlySyncEnabled ? 'bg-sky-600' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`w-3.5 h-3.5 rounded-full bg-white transition-transform block shadow-xs absolute top-0.75 ${
                isHourlySyncEnabled ? 'left-5.5' : 'left-1'
              }`}
            />
          </button>
        </label>

        {/* Sync Now Action Button */}
        <button
          type="button"
          onClick={onSyncNow}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white font-bold text-xs shadow-xs hover:shadow-md transition active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed cursor-pointer"
          title="Click to fetch live weather, solar irradiance, and inverter telemetry right now"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-white shrink-0 ${isSyncing ? 'animate-spin' : ''}`}
          />
          <span>{isSyncing ? t('syncing', 'Syncing...') : t('sync_now', 'Sync Now')}</span>
        </button>
      </div>
    </div>
  );
};

