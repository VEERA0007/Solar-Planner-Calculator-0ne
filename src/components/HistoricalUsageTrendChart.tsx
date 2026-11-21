import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { CalendarRange, CheckCircle2, TrendingUp, Zap, IndianRupee } from 'lucide-react';
import { MonthlyBillRecord } from '../types/solar';
import {
  FourStateId,
  build12MonthSeries,
  getIndiaClockInfo,
  getRollingMonths,
} from '../data/uscPortals';
import { computeLatest12MonthSummary } from '../utils/monthlyAverage';

interface HistoricalUsageTrendChartProps {
  monthlyHistory?: MonthlyBillRecord[];
  uscNumber?: string;
  discomName?: string;
  stateId: FourStateId;
  gridCategory: 'domestic' | 'commercial';
  sanctionedLoadKw?: number;
  fallbackMonthlyUnits: number;
  estimatedMonthlyGenKwh?: number;
}

interface TrendChartPoint {
  shortLabel: string;
  month: string;
  year: number;
  calendarMonth0: number;
  unitsKwh: number;
  billAmountInr: number;
  effectiveRate: number;
  isVerifiedPortalData: boolean;
  isRunningMonth: boolean;
  isPeakMonth: boolean;
  isMissingRunningBill: boolean;
}

type MetricViewMode = 'units' | 'bill' | 'both';

export const HistoricalUsageTrendChart: React.FC<HistoricalUsageTrendChartProps> = ({
  monthlyHistory,
  uscNumber,
  discomName = 'DISCOM',
  stateId,
  gridCategory,
  sanctionedLoadKw = 4,
  fallbackMonthlyUnits,
  estimatedMonthlyGenKwh,
}) => {
  const [metricView, setMetricView] = useState<MetricViewMode>('units');

  const now = useMemo(() => new Date(), []);
  const liveClock = useMemo(() => getIndiaClockInfo(now), [now]);

  const {
    chartData,
    isPortalBacked,
    verifiedCount,
    rangeStartLabel,
    rangeEndLabel,
    avgBasisCount,
    totalUnits,
    avgUnits,
    totalBill,
    avgBill,
    peakPoint,
    latestBilledPoint,
    runningMonthPoint,
  } = useMemo(() => {
    // Exact 13-month rolling window from corresponding month of previous year to current month
    // e.g. Nov 2025 -> Nov 2026 (13 inclusive months)
    const currentAnchorYm = `${liveClock.year}-${String(liveClock.month0 + 1).padStart(2, '0')}`;
    const exact13Slots = getRollingMonths(13, now, currentAnchorYm);

    const existing = Array.isArray(monthlyHistory) ? monthlyHistory : [];
    const hasSyncedHistory = existing.length > 0;
    const hasVerifiedPortal = existing.some((r) => r.isVerifiedPortalData);

    let resolvedRows: {
      shortLabel: string;
      month: string;
      year: number;
      calendarMonth0: number;
      unitsKwh: number;
      billAmountInr: number;
      isVerifiedPortalData: boolean;
      isRunningMonth: boolean;
      isMissingRunningBill: boolean;
    }[];

    if (hasSyncedHistory) {
      const byYm = new Map<string, MonthlyBillRecord>();
      const byMonthStr = new Map<string, MonthlyBillRecord>();
      for (const rec of existing) {
        if (typeof rec.year === 'number' && typeof rec.calendarMonth0 === 'number') {
          byYm.set(`${rec.year}-${rec.calendarMonth0}`, rec);
        }
        if (rec.month) {
          byMonthStr.set(rec.month.trim().toLowerCase(), rec);
        }
      }

      resolvedRows = exact13Slots.map((slot) => {
        const matched =
          byYm.get(`${slot.year}-${slot.calendarMonth0}`) ||
          byMonthStr.get(slot.month.toLowerCase());

        const unitsKwh = matched ? Math.max(0, Math.round(matched.unitsKwh || 0)) : 0;
        const billAmountInr = matched
          ? Math.max(0, Math.round((matched.billAmountInr || 0) * 100) / 100)
          : 0;

        return {
          shortLabel: slot.shortLabel,
          month: slot.month,
          year: slot.year,
          calendarMonth0: slot.calendarMonth0,
          unitsKwh,
          billAmountInr,
          isVerifiedPortalData: Boolean(matched?.isVerifiedPortalData),
          isRunningMonth: slot.isRunningMonth,
          isMissingRunningBill: !matched || (unitsKwh === 0 && billAmountInr === 0),
        };
      });
    } else {
      const baseUnits = Math.max(80, Math.round(fallbackMonthlyUnits || 420));
      const estimated13 = build12MonthSeries(
        baseUnits,
        stateId,
        gridCategory,
        sanctionedLoadKw,
        0,
        now,
        13,
        currentAnchorYm
      );
      resolvedRows = estimated13.map((row, idx) => {
        const slot = exact13Slots[idx];
        return {
          shortLabel: slot?.shortLabel || row.shortLabel || slot?.month || row.month || '',
          month: slot?.month || row.month,
          year: slot?.year ?? row.year ?? liveClock.year,
          calendarMonth0: slot?.calendarMonth0 ?? row.calendarMonth0 ?? 0,
          unitsKwh: Math.max(0, Math.round(row.unitsKwh || 0)),
          billAmountInr: Math.max(0, Math.round((row.billAmountInr || 0) * 100) / 100),
          isVerifiedPortalData: false,
          isRunningMonth: Boolean(slot?.isRunningMonth ?? row.isRunningMonth),
          isMissingRunningBill: false,
        };
      });
    }

    // Strictly average the latest 12 billed months (dividing by available billed months up to 12)
    const latest12 = computeLatest12MonthSummary(resolvedRows);

    const maxUnitsVal = Math.max(0, ...resolvedRows.map((r) => r.unitsKwh));

    const points: TrendChartPoint[] = resolvedRows.map((r) => ({
      ...r,
      effectiveRate:
        r.unitsKwh > 0 ? Number((r.billAmountInr / r.unitsKwh).toFixed(2)) : 0,
      isPeakMonth: maxUnitsVal > 0 && r.unitsKwh === maxUnitsVal,
    }));

    const peak = points.reduce(
      (best, cur) => (cur.unitsKwh > best.unitsKwh ? cur : best),
      points[0]
    );
    const latestBilled =
      [...points].reverse().find((p) => p.unitsKwh > 0 || p.billAmountInr > 0) ||
      points[points.length - 1];
    const runningPt = points[points.length - 1];

    return {
      chartData: points,
      isPortalBacked: hasSyncedHistory && hasVerifiedPortal,
      verifiedCount: points.filter((p) => p.isVerifiedPortalData).length,
      rangeStartLabel: exact13Slots[0]?.month || '',
      rangeEndLabel: exact13Slots[exact13Slots.length - 1]?.month || '',
      avgBasisCount: latest12.basisCount,
      totalUnits: latest12.totalUnits,
      avgUnits: latest12.avgUnits,
      totalBill: Math.round(latest12.totalBill),
      avgBill: latest12.avgBill,
      peakPoint: peak,
      latestBilledPoint: latestBilled,
      runningMonthPoint: runningPt,
    };
  }, [
    monthlyHistory,
    liveClock.year,
    liveClock.month0,
    now,
    fallbackMonthlyUnits,
    stateId,
    gridCategory,
    sanctionedLoadKw,
  ]);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: TrendChartPoint }>;
  }) => {
    if (!active || !payload || !payload.length) return null;
    const pt = payload[0].payload;
    return (
      <div className="rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white px-3.5 py-2.5 shadow-xl border border-slate-700/80 text-xs space-y-1 min-w-[175px]">
        <div className="flex items-center justify-between gap-2 border-b border-slate-700/80 pb-1">
          <span className="font-extrabold text-amber-300">{pt.month}</span>
          {pt.isRunningMonth ? (
            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
              Current Month
            </span>
          ) : pt.isPeakMonth ? (
            <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
              Peak Load
            </span>
          ) : null}
        </div>
        {pt.isMissingRunningBill && isPortalBacked ? (
          <p className="text-[11px] text-slate-300 pt-0.5">
            {pt.isRunningMonth
              ? 'Current month bill not yet generated on DISCOM portal.'
              : 'No billing entry returned by DISCOM portal for this month.'}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">Units Consumed</span>
              <span className="font-mono font-bold text-white">
                {pt.unitsKwh.toLocaleString('en-IN')} kWh
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-300">DISCOM Bill</span>
              <span className="font-mono font-bold text-emerald-400">
                ₹{pt.billAmountInr.toLocaleString('en-IN')}
              </span>
            </div>
            {pt.effectiveRate > 0 && (
              <div className="flex items-center justify-between gap-3 text-[10.5px] text-slate-400">
                <span>Effective Rate</span>
                <span className="font-mono">₹{pt.effectiveRate}/kWh</span>
              </div>
            )}
          </>
        )}
        <div className="pt-1 border-t border-slate-700/60 text-[10px] text-slate-400">
          {pt.isVerifiedPortalData
            ? `Verified ${discomName} Portal Ledger`
            : isPortalBacked
            ? `${discomName} Portal Slot`
            : 'Seasonal Tariff Profile'}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[28px] p-5 shadow-xs border border-slate-100 dark:border-slate-800 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/60 text-[#FF6F00] flex items-center justify-center shrink-0">
            <CalendarRange className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                13-Month Historical Usage Trends
              </h2>
              {isPortalBacked ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>
                    {discomName}
                    {uscNumber ? ` · #${uscNumber}` : ''}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold">
                  Estimated 13-Mo Curve
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {rangeStartLabel} → {rangeEndLabel} (Prev Year Same Month to Current Month)
            </p>
          </div>
        </div>

        {/* Metric View Toggle */}
        <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[10.5px] font-bold shrink-0">
          <button
            type="button"
            onClick={() => setMetricView('units')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              metricView === 'units'
                ? 'bg-white dark:bg-slate-700 text-[#FF6F00] shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Zap className="w-3 h-3" />
            <span>Units</span>
          </button>
          <button
            type="button"
            onClick={() => setMetricView('bill')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              metricView === 'bill'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <IndianRupee className="w-3 h-3" />
            <span>Bill</span>
          </button>
          <button
            type="button"
            onClick={() => setMetricView('both')}
            className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1 ${
              metricView === 'both'
                ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-400 shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3 h-3" />
            <span>Both</span>
          </button>
        </div>
      </div>

      {/* 4 Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {avgBasisCount || 12}-Mo Total
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">
            {totalUnits.toLocaleString('en-IN')} <span className="text-[10px] font-bold text-slate-500">kWh</span>
          </div>
          <div className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
            ₹{totalBill.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {avgBasisCount || 12}-Mo Avg
          </div>
          <div className="text-sm font-black text-[#FF6F00] mt-0.5">
            {avgUnits.toLocaleString('en-IN')} <span className="text-[10px] font-bold">kWh</span>
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            ₹{avgBill.toLocaleString('en-IN')} / mo
          </div>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Peak Month
          </div>
          <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5 truncate">
            {peakPoint?.shortLabel || '—'}
          </div>
          <div className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {peakPoint?.unitsKwh.toLocaleString('en-IN')} kWh · ₹
            {peakPoint?.billAmountInr.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="rounded-2xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {runningMonthPoint?.isMissingRunningBill && isPortalBacked
              ? `Latest (${latestBilledPoint?.shortLabel})`
              : `Current (${runningMonthPoint?.shortLabel})`}
          </div>
          <div className="text-sm font-black text-sky-600 dark:text-sky-400 mt-0.5">
            {latestBilledPoint?.unitsKwh.toLocaleString('en-IN')}{' '}
            <span className="text-[10px] font-bold">kWh</span>
          </div>
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            ₹{latestBilledPoint?.billAmountInr.toLocaleString('en-IN')}
          </div>
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-60 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          {metricView === 'both' ? (
            <ComposedChart data={chartData} margin={{ top: 10, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} vertical={false} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                yAxisId="units"
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                yAxisId="bill"
                orientation="right"
                tick={{ fontSize: 10, fill: '#10b981' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
              />
              <Tooltip content={<CustomTooltip />} />
              {typeof estimatedMonthlyGenKwh === 'number' && estimatedMonthlyGenKwh > 0 && (
                <ReferenceLine
                  yAxisId="units"
                  y={estimatedMonthlyGenKwh}
                  stroke="#0ea5e9"
                  strokeDasharray="4 4"
                  label={{
                    value: `Solar Gen ~${estimatedMonthlyGenKwh} kWh`,
                    position: 'insideTopRight',
                    fill: '#0ea5e9',
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                />
              )}
              <Bar yAxisId="units" dataKey="unitsKwh" radius={[6, 6, 0, 0]} maxBarSize={24}>
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`cell-both-${idx}`}
                    fill={
                      entry.isRunningMonth
                        ? '#0284c7'
                        : entry.isPeakMonth
                        ? '#FF6F00'
                        : '#f59e0b'
                    }
                    fillOpacity={entry.isMissingRunningBill ? 0.25 : 0.88}
                  />
                ))}
              </Bar>
              <Line
                yAxisId="bill"
                type="monotone"
                dataKey="billAmountInr"
                stroke="#10b981"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
            </ComposedChart>
          ) : (
            <BarChart data={chartData} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} vertical={false} />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: '#64748b', fontWeight: 600 }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis
                tick={{ fontSize: 10, fill: '#64748b' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) =>
                  metricView === 'bill'
                    ? `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`
                    : String(v)
                }
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                y={metricView === 'units' ? avgUnits : avgBill}
                stroke="#64748b"
                strokeDasharray="4 4"
                label={{
                  value:
                    metricView === 'units'
                      ? `${avgBasisCount || 12}M Avg ${avgUnits} kWh`
                      : `${avgBasisCount || 12}M Avg ₹${avgBill.toLocaleString('en-IN')}`,
                  position: 'insideTopLeft',
                  fill: '#64748b',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              />
              {metricView === 'units' &&
                typeof estimatedMonthlyGenKwh === 'number' &&
                estimatedMonthlyGenKwh > 0 && (
                  <ReferenceLine
                    y={estimatedMonthlyGenKwh}
                    stroke="#0ea5e9"
                    strokeDasharray="4 4"
                    label={{
                      value: `Est. Solar ${estimatedMonthlyGenKwh} kWh`,
                      position: 'insideTopRight',
                      fill: '#0ea5e9',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  />
                )}
              <Bar
                dataKey={metricView === 'units' ? 'unitsKwh' : 'billAmountInr'}
                radius={[6, 6, 0, 0]}
                maxBarSize={26}
              >
                {chartData.map((entry, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={
                      metricView === 'bill'
                        ? entry.isRunningMonth
                          ? '#0284c7'
                          : entry.isPeakMonth
                          ? '#059669'
                          : '#10b981'
                        : entry.isRunningMonth
                        ? '#0284c7'
                        : entry.isPeakMonth
                        ? '#ea580c'
                        : '#f59e0b'
                    }
                    fillOpacity={entry.isMissingRunningBill ? 0.25 : 0.9}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Legend & Range Verification Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10.5px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`w-2.5 h-2.5 rounded-xs ${
                metricView === 'bill' ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
            />
            <span>{metricView === 'bill' ? 'DISCOM Bill (₹)' : 'Consumed Units (kWh)'}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-sky-600" />
            <span>Current Month ({runningMonthPoint?.shortLabel})</span>
          </span>
          {metricView !== 'bill' &&
            typeof estimatedMonthlyGenKwh === 'number' &&
            estimatedMonthlyGenKwh > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="w-3 border-t-2 border-dashed border-sky-500" />
                <span>Est. Solar Output</span>
              </span>
            )}
        </div>
        <span className="font-semibold text-slate-600 dark:text-slate-300">
          {isPortalBacked
            ? `${verifiedCount}/13 Portal Months Mapped`
            : `13-Month Range (${rangeStartLabel} – ${rangeEndLabel})`}
        </span>
      </div>
    </div>
  );
};
