import React, { useState } from 'react';
import { CURRENCY_SYMBOLS } from '../utils/solarMath';
import { CurrencyCode } from '../types/solar';

interface PaybackPeriodChartProps {
  installationCost: number;
  annualSavings: number;
  currency: CurrencyCode;
}

export const PaybackPeriodChart: React.FC<PaybackPeriodChartProps> = ({
  installationCost,
  annualSavings,
  currency,
}) => {
  const sym = CURRENCY_SYMBOLS[currency] || '₹';

  // Compute break-even year
  const rawBreakEvenYears = annualSavings > 0 ? installationCost / annualSavings : 4.3;
  const breakEvenYears = parseFloat(rawBreakEvenYears.toFixed(1));

  // Timeline points over 10 years
  const maxYears = 10;
  // Year 0 net position = -installationCost
  // Year t net position = (annualSavings * t) - installationCost

  // SVG dimensions
  const width = 230;
  const height = 145;
  const paddingLeft = 38;
  const paddingRight = 15;
  const paddingTop = 12;
  const paddingBottom = 24;

  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;

  // Min and max Y values for axis
  const minY = -Math.max(installationCost * 1.15, 300000);
  const maxY = Math.max((annualSavings * maxYears - installationCost) * 1.1, 250000);

  // Coordinate mapping
  const getX = (year: number) => paddingLeft + (year / maxYears) * chartWidth;
  const getY = (val: number) => paddingTop + chartHeight - ((val - minY) / (maxY - minY)) * chartHeight;

  const zeroY = getY(0);
  const breakEvenX = getX(Math.min(breakEvenYears, maxYears));

  // Red segment: from Year 0 to break-even Year
  const startX = getX(0);
  const startY = getY(-installationCost);

  // Green segment: from break-even Year to Year 10
  const endX = getX(maxYears);
  const endVal = annualSavings * maxYears - installationCost;
  const endY = getY(endVal);

  const [hoveredPoint, setHoveredPoint] = useState<{ year: number; value: number } | null>(null);

  return (
    <div className="w-full flex flex-col">
      {/* Legend */}
      <div className="flex items-center justify-end gap-3 text-[10px] text-slate-500 dark:text-slate-400 mb-1">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-rose-500"></span>
          <span>Investment Period</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Saving Period</span>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-2 items-center">
        {/* Left Callout Box (Screenshot 8: "You break-even in 4.3 Years") */}
        <div className="col-span-2 bg-[#F0F6FF] dark:bg-slate-800/80 rounded-2xl p-3 border border-sky-100 dark:border-slate-700/80 text-left flex flex-col justify-center space-y-1">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            You break-even in
          </p>
          <div className="text-xl font-extrabold text-[#2563EB] dark:text-sky-400 tracking-tight">
            {breakEvenYears} Years
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-400 leading-snug">
            and start saving for the next upcoming years!
          </p>
        </div>

        {/* Right SVG Graph */}
        <div className="col-span-3 relative flex items-center justify-center">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible select-none"
          >
            {/* Grid Horizontal Lines */}
            {[-300000, -200000, -100000, 0, 100000, 200000].map((tickVal) => {
              const y = getY(tickVal);
              const label =
                tickVal === 0
                  ? '0'
                  : tickVal > 0
                  ? `${tickVal / 1000}K`
                  : `-${Math.abs(tickVal) / 1000}K`;
              return (
                <g key={tickVal}>
                  <line
                    x1={paddingLeft}
                    y1={y}
                    x2={width - paddingRight}
                    y2={y}
                    stroke={tickVal === 0 ? '#94A3B8' : '#E2E8F0'}
                    strokeWidth={tickVal === 0 ? '1' : '0.6'}
                    strokeDasharray={tickVal === 0 ? 'none' : '2 2'}
                    className="dark:stroke-slate-700"
                  />
                  <text
                    x={paddingLeft - 4}
                    y={y + 3}
                    textAnchor="end"
                    fontSize="7"
                    fill="#94A3B8"
                    className="font-mono"
                  >
                    {label}
                  </text>
                </g>
              );
            })}

            {/* Zero Base Axis */}
            <line
              x1={paddingLeft}
              y1={zeroY}
              x2={width - paddingRight}
              y2={zeroY}
              stroke="#64748B"
              strokeWidth="0.8"
            />

            {/* Light Green Shaded Saving Area (Above zero from break-even to Year 10) */}
            <polygon
              points={`${breakEvenX},${zeroY} ${endX},${endY} ${endX},${zeroY}`}
              fill="#22C55E"
              fillOpacity="0.2"
            />

            {/* Red Investment Recovery Line */}
            <line
              x1={startX}
              y1={startY}
              x2={breakEvenX}
              y2={zeroY}
              stroke="#EF4444"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Green Net Saving Line */}
            <line
              x1={breakEvenX}
              y1={zeroY}
              x2={endX}
              y2={endY}
              stroke="#22C55E"
              strokeWidth="2.4"
              strokeLinecap="round"
            />

            {/* Break-even point marker */}
            <circle cx={breakEvenX} cy={zeroY} r="3.5" fill="#EF4444" stroke="#FFFFFF" strokeWidth="1.5" />

            {/* Intermediate Year Dots along curve */}
            {[0, 2, 4, 6, 8, 10].map((yr) => {
              const netAtYr = annualSavings * yr - installationCost;
              const x = getX(yr);
              const y = getY(netAtYr);
              const isProfit = netAtYr >= 0;

              return (
                <g key={yr}>
                  {yr === 6 || yr === 8 || yr === 10 ? (
                    <circle
                      cx={x}
                      cy={y}
                      r="3"
                      fill={isProfit ? '#22C55E' : '#EF4444'}
                      stroke="#FFFFFF"
                      strokeWidth="1.2"
                    />
                  ) : null}
                  {/* X Axis Tick Labels */}
                  <text
                    x={x}
                    y={height - 8}
                    textAnchor="middle"
                    fontSize="7.5"
                    fill="#94A3B8"
                    className="font-mono font-medium"
                  >
                    {yr}
                  </text>
                </g>
              );
            })}

            {/* X-Axis Title */}
            <text
              x={paddingLeft + chartWidth / 2}
              y={height - 0.5}
              textAnchor="middle"
              fontSize="7"
              fill="#64748B"
              fontWeight="600"
            >
              Time (Years)
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
};
