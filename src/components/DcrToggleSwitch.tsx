import React from 'react';

interface DcrToggleSwitchProps {
  moduleStandard: 'DCR' | 'NON_DCR';
  onChange: (next: 'DCR' | 'NON_DCR') => void;
  compact?: boolean;
  id?: string;
}

/**
 * DCR / Non-DCR pill toggle switch matching the horizontal
 * [DCR] (orange pill switch with white thumb) [Non-DCR] control.
 * White thumb sits on the LEFT (next to "DCR") when DCR is selected,
 * and slides to the RIGHT (next to "Non-DCR") when Non-DCR is selected.
 */
export const DcrToggleSwitch: React.FC<DcrToggleSwitchProps> = ({
  moduleStandard,
  onChange,
  compact = false,
  id,
}) => {
  const isDcr = moduleStandard === 'DCR';

  const handleToggle = () => {
    onChange(isDcr ? 'NON_DCR' : 'DCR');
  };

  const renderInlineControl = (size: 'sm' | 'md') => {
    const isSm = size === 'sm';
    return (
      <div
        className="inline-flex items-center gap-2.5 select-none shrink-0"
        title={isDcr ? 'DCR (Made-in-India / Subsidy Eligible)' : 'Non-DCR (Open Category)'}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!isDcr) onChange('DCR');
          }}
          className={`font-extrabold tracking-tight transition-colors cursor-pointer ${
            isSm ? 'text-[11px]' : 'text-xs'
          } ${
            isDcr
              ? 'text-[#D97706] dark:text-amber-400'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          DCR
        </button>

        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={!isDcr}
          aria-label={isDcr ? 'DCR selected, switch to Non-DCR' : 'Non-DCR selected, switch to DCR'}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          className={`rounded-full bg-[#F59E0B] hover:bg-[#EA8C00] transition-colors relative cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400/60 shrink-0 shadow-2xs ${
            isSm ? 'w-11 h-6' : 'w-13 h-7'
          }`}
        >
          <span
            className={`rounded-full bg-white shadow-sm block absolute transition-transform duration-200 ease-out ${
              isSm ? 'w-4.5 h-4.5 top-0.75 left-0.75' : 'w-5.5 h-5.5 top-0.75 left-0.75'
            } ${
              isDcr
                ? 'translate-x-0'
                : isSm
                ? 'translate-x-5'
                : 'translate-x-6'
            }`}
          />
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isDcr) onChange('NON_DCR');
          }}
          className={`font-extrabold tracking-tight transition-colors cursor-pointer ${
            isSm ? 'text-[11px]' : 'text-xs'
          } ${
            !isDcr
              ? 'text-[#D97706] dark:text-amber-400'
              : 'text-[#52657F] dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          Non-DCR
        </button>
      </div>
    );
  };

  if (compact) {
    return renderInlineControl('sm');
  }

  return (
    <div
      onClick={handleToggle}
      role="presentation"
      className={`w-full p-3.5 rounded-2xl border transition-all cursor-pointer select-none flex flex-wrap items-center justify-between gap-3 ${
        isDcr
          ? 'bg-amber-50/70 dark:bg-amber-950/25 border-amber-200 dark:border-amber-800/70'
          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-extrabold ${
              isDcr
                ? 'text-[#B45309] dark:text-amber-300'
                : 'text-slate-800 dark:text-slate-100'
            }`}
          >
            {isDcr ? 'DCR (Made-in-India / ALMM)' : 'Non-DCR (Open Category)'}
          </span>
        </div>
        <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 truncate">
          {isDcr
            ? 'Eligible for PM Surya Ghar Govt Subsidy & ALMM compliance'
            : 'Lower upfront equipment cost · Open category (zero subsidy)'}
        </p>
      </div>

      {renderInlineControl('md')}
    </div>
  );
};
