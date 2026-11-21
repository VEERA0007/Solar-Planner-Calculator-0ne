import { jsPDF } from 'jspdf';
import {
  CurrencyCode,
  FinancialSavingsEstimate,
  MonthlyBillRecord,
  SolarSystemRequirements,
} from '../types/solar';
import {
  InverterSuggestionResult,
  SolarPanelModel,
} from '../data/panelDatabase';
import {
  BomMaterialItem,
  calculate25YearSensitivityRoi,
} from './solarMath';
import { selectLatestBilledMonths } from './monthlyAverage';

const PDF_CURRENCY_PREFIX: Record<CurrencyCode, string> = {
  INR: 'Rs. ',
};

function fmtCurrency(amount: number, currency: CurrencyCode): string {
  const prefix = PDF_CURRENCY_PREFIX[currency] || 'Rs. ';
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const absFormatted = Math.abs(rounded).toLocaleString('en-US');
  return `${rounded < 0 ? '-' : ''}${prefix}${absFormatted}`;
}

function drawContinuationHeader(
  doc: jsPDF,
  title: string,
  subtitle: string,
  marginX: number,
  pageWidth: number
) {
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 14, 'F');
  doc.setFillColor(255, 111, 0);
  doc.rect(0, 14, pageWidth, 1.1, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(title, marginX, 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(203, 213, 225);
  doc.text(subtitle, pageWidth - marginX, 9, { align: 'right' });
}

function applyPageFooters(
  doc: jsPDF,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  quoteRef?: string
) {
  const totalPages = doc.getNumberOfPages();
  const dateLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  });

  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 10.5;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY - 3, pageWidth - marginX, footerY - 3);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(100, 116, 139);
    const leftText = quoteRef
      ? `Solar System Proposal (${quoteRef}) • Engineering & ROI Estimate`
      : 'Solar System Engineering & Financial Proposal • Site Irradiance & Tariff Model';
    doc.text(leftText, marginX, footerY + 0.8);
    doc.text(`Generated ${dateLabel}  |  Page ${p} of ${totalPages}`, pageWidth - marginX, footerY + 0.8, {
      align: 'right',
    });
  }
}

function drawSectionHeader(
  doc: jsPDF,
  title: string,
  y: number,
  marginX: number,
  contentWidth: number
): number {
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(marginX, y, contentWidth, 7.8, 1.5, 1.5, 'F');
  doc.setFillColor(255, 111, 0);
  doc.rect(marginX, y, 2.2, 7.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(title.toUpperCase(), marginX + 5, y + 5.3);
  return y + 10.5;
}

function drawKeyValueRows(
  doc: jsPDF,
  rows: Array<{ label: string; value: string; highlight?: 'emerald' | 'amber' | 'slate' }>,
  startY: number,
  marginX: number,
  contentWidth: number
): number {
  let y = startY;
  const rowH = 6.8;

  rows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(71, 85, 105);
    doc.text(row.label, marginX + 3, y + 4.7);

    doc.setFont('helvetica', 'bold');
    if (row.highlight === 'emerald') {
      doc.setTextColor(5, 150, 105);
    } else if (row.highlight === 'amber') {
      doc.setTextColor(217, 119, 6);
    } else {
      doc.setTextColor(15, 23, 42);
    }
    doc.text(row.value, marginX + contentWidth - 3, y + 4.7, { align: 'right' });

    y += rowH;
  });

  return y + 4.5;
}

function ensureSpace(
  doc: jsPDF,
  currentY: number,
  neededHeight: number,
  pageHeight: number,
  marginX: number,
  pageWidth: number,
  contTitle: string,
  contSub: string
): number {
  const bottomLimit = pageHeight - 17;
  if (currentY + neededHeight <= bottomLimit) return currentY;
  doc.addPage();
  drawContinuationHeader(doc, contTitle, contSub, marginX, pageWidth);
  return 21;
}

export interface PdfExportOptions {
  reportPreset?: 'full_proposal' | 'executive_summary' | 'engineering_bom';
  customerName?: string;
  preparedBy?: string;
  quoteRef?: string;
  projectNotes?: string;
  includeHistoricalChart?: boolean;
  includeCashflowChart?: boolean;
  includeLoanEmiTable?: boolean;
  includeBom?: boolean;
  includeSignOff?: boolean;
  outputMode?: 'download' | 'blob';
}

export interface EstimatorPdfReportData {
  locationName: string;
  latitude: number;
  longitude: number;
  currency: CurrencyCode;
  moduleStandard: 'DCR' | 'NON_DCR';
  consumerCategory: string;
  phaseType: string;
  systemKw: number;
  panelCount: number;
  panelWattage: number;
  roofAreaNeededSqm: number;
  availableRoofAreaSqm: number;
  dailyUsageKwh: number;
  monthlyUnitsKwh: number;
  tariffPerKwh: number;
  peakSunHours: number;
  effectivePR: number;
  estimatedMonthlyGenKwh: number;
  baseCostPerKw: number;
  grossCost: number;
  governmentSubsidy: number;
  netPayable: number;
  monthlySavings: number;
  annualSavings: number;
  paybackYears: number;
  lifetimeSavings25Yr: number;
  co2AvoidedKgPerYear: number;
  systemType?: 'on-grid' | 'off-grid' | 'hybrid';
  inverterLabel?: string;
  inverterBrand?: string;
  inverterPowerKw?: number;
  inverterSuggestion?: InverterSuggestionResult;
  panelSpec?: SolarPanelModel;
  batteryKwh?: number;
  bomItems?: BomMaterialItem[];
  removedComponents?: string[];
  monthlyHistory12?: MonthlyBillRecord[];
  uscNumber?: string;
  discomName?: string;
  expectedTariffIncreasePct?: number;
  maintenanceCostPct?: number;
  engineeringLayout?: {
    placedPanels: number;
    usableRoofAreaM2: number;
    arrayFootprintM2: number;
    orientation?: 'portrait' | 'landscape';
    rows?: number;
    cols?: number;
    utilizationPercent?: number;
  } | null;
  exportOptions?: PdfExportOptions;
}

function buildMonthlyComparisonSeries(
  monthlyHistory12: MonthlyBillRecord[] | undefined,
  fallbackUnits: number,
  estSolarGen: number
): Array<{ label: string; usageKwh: number; solarKwh: number }> {
  const seasonalSolarWeights = [0.92, 1.0, 1.12, 1.16, 1.15, 0.94, 0.84, 0.86, 0.96, 1.02, 0.99, 0.94];
  if (monthlyHistory12 && monthlyHistory12.length > 0) {
    const latest12 = selectLatestBilledMonths(monthlyHistory12);
    const sourceRows = latest12.length > 0 ? latest12 : monthlyHistory12.slice(-12);
    return sourceRows.map((rec, i) => {
      const mIdx = typeof rec.calendarMonth0 === 'number' ? rec.calendarMonth0 % 12 : i % 12;
      const w = seasonalSolarWeights[mIdx] || 1.0;
      const lbl = rec.shortLabel || rec.month.slice(0, 6);
      return {
        label: lbl,
        usageKwh: Math.max(10, Math.round(rec.unitsKwh)),
        solarKwh: Math.max(10, Math.round(estSolarGen * w)),
      };
    });
  }

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const usageWeights = [0.86, 0.9, 1.04, 1.16, 1.24, 1.14, 0.96, 0.94, 0.98, 0.96, 0.92, 0.9];
  return monthNames.map((m, idx) => ({
    label: m,
    usageKwh: Math.max(10, Math.round(fallbackUnits * usageWeights[idx])),
    solarKwh: Math.max(10, Math.round(estSolarGen * seasonalSolarWeights[idx])),
  }));
}

function drawMonthlyUsageVsSolarChart(
  doc: jsPDF,
  series: Array<{ label: string; usageKwh: number; solarKwh: number }>,
  startY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 54;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, startY, contentWidth, boxH, 2, 2, 'FD');

  // Legend
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setFillColor(249, 115, 22);
  doc.rect(marginX + 4, startY + 4, 3.5, 2.5, 'F');
  doc.setTextColor(51, 65, 85);
  doc.text('Grid Usage (kWh)', marginX + 9, startY + 6.2);

  doc.setFillColor(16, 185, 129);
  doc.rect(marginX + 40, startY + 4, 3.5, 2.5, 'F');
  doc.text('Projected Solar Yield (kWh)', marginX + 45, startY + 6.2);

  const annualUsage = series.reduce((a, b) => a + b.usageKwh, 0);
  const annualSolar = series.reduce((a, b) => a + b.solarKwh, 0);
  const offsetPct = annualUsage > 0 ? Math.min(200, Math.round((annualSolar / annualUsage) * 100)) : 100;
  doc.setTextColor(5, 150, 105);
  doc.text(`Annual Solar Offset: ${offsetPct}% (${annualSolar.toLocaleString()} vs ${annualUsage.toLocaleString()} kWh)`, marginX + contentWidth - 4, startY + 6.2, {
    align: 'right',
  });

  const chartX = marginX + 12;
  const chartW = contentWidth - 16;
  const chartTop = startY + 11;
  const chartH = 33;
  const baselineY = chartTop + chartH;

  const maxVal = Math.max(100, ...series.flatMap((s) => [s.usageKwh, s.solarKwh])) * 1.1;

  // Gridlines
  [0.25, 0.5, 0.75, 1].forEach((frac) => {
    const gy = baselineY - chartH * frac;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`${Math.round(maxVal * frac)}`, chartX - 1.5, gy + 1.5, { align: 'right' });
  });

  doc.setDrawColor(148, 163, 184);
  doc.line(chartX, baselineY, chartX + chartW, baselineY);

  const slotW = chartW / series.length;
  const barW = Math.min(4.2, (slotW - 2.6) / 2);

  series.forEach((pt, idx) => {
    const cx = chartX + idx * slotW + slotW / 2;
    const hUsage = Math.max(1, (pt.usageKwh / maxVal) * chartH);
    const hSolar = Math.max(1, (pt.solarKwh / maxVal) * chartH);

    doc.setFillColor(249, 115, 22);
    doc.rect(cx - barW - 0.4, baselineY - hUsage, barW, hUsage, 'F');

    doc.setFillColor(16, 185, 129);
    doc.rect(cx + 0.4, baselineY - hSolar, barW, hSolar, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.3);
    doc.setTextColor(71, 85, 105);
    doc.text(pt.label.slice(0, 6), cx, baselineY + 4.2, { align: 'center' });
  });

  return startY + boxH + 5;
}

function draw25YearCashflowChart(
  doc: jsPDF,
  yearlyRows: Array<{ year: number; cumulativeSavings: number }>,
  netCapex: number,
  currency: CurrencyCode,
  startY: number,
  marginX: number,
  contentWidth: number
): number {
  const boxH = 54;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, startY, contentWidth, boxH, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setFillColor(245, 158, 11);
  doc.rect(marginX + 4, startY + 4, 3.5, 2.5, 'F');
  doc.setTextColor(51, 65, 85);
  doc.text('Payback Phase', marginX + 9, startY + 6.2);

  doc.setFillColor(5, 150, 105);
  doc.rect(marginX + 35, startY + 4, 3.5, 2.5, 'F');
  doc.text('Net Profit Phase', marginX + 40, startY + 6.2);

  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.5);
  doc.line(marginX + 68, startY + 5.2, marginX + 74, startY + 5.2);
  doc.setTextColor(185, 28, 28);
  doc.text(`Break-Even Capex (${fmtCurrency(netCapex, currency)})`, marginX + 76, startY + 6.2);

  const chartX = marginX + 16;
  const chartW = contentWidth - 20;
  const chartTop = startY + 11;
  const chartH = 33;
  const baselineY = chartTop + chartH;

  const maxCum = Math.max(netCapex * 1.2, ...yearlyRows.map((r) => r.cumulativeSavings), 1000);

  [0.25, 0.5, 0.75, 1].forEach((frac) => {
    const gy = baselineY - chartH * frac;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(chartX, gy, chartX + chartW, gy);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    const valLakhs = (maxCum * frac) / 100000;
    doc.text(`${valLakhs >= 1 ? `${valLakhs.toFixed(1)}L` : `${Math.round((maxCum * frac) / 1000)}k`}`, chartX - 1.5, gy + 1.5, {
      align: 'right',
    });
  });

  doc.setDrawColor(148, 163, 184);
  doc.line(chartX, baselineY, chartX + chartW, baselineY);

  const slotW = chartW / yearlyRows.length;
  const barW = Math.max(2.2, slotW - 1.8);

  yearlyRows.forEach((pt, idx) => {
    const bx = chartX + idx * slotW + (slotW - barW) / 2;
    const hBar = Math.max(1, (pt.cumulativeSavings / maxCum) * chartH);
    const isProfitable = pt.cumulativeSavings >= netCapex;
    if (isProfitable) {
      doc.setFillColor(5, 150, 105);
    } else {
      doc.setFillColor(245, 158, 11);
    }
    doc.rect(bx, baselineY - hBar, barW, hBar, 'F');

    if (pt.year === 1 || pt.year % 5 === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      doc.setTextColor(71, 85, 105);
      doc.text(`Y${pt.year}`, bx + barW / 2, baselineY + 4.2, { align: 'center' });
    }
  });

  // Net Capex Break-Even Line
  const capexY = baselineY - (netCapex / maxCum) * chartH;
  doc.setDrawColor(239, 68, 68);
  doc.setLineWidth(0.55);
  doc.line(chartX, capexY, chartX + chartW, capexY);

  return startY + boxH + 5;
}

export function exportEstimatorPdfReport(data: EstimatorPdfReportData): Blob | void {
  const opts = data.exportOptions || {};
  const preset = opts.reportPreset || 'full_proposal';
  const isExecutiveOnly = preset === 'executive_summary';
  const isBomFocus = preset === 'engineering_bom';

  const includeHistorical = opts.includeHistoricalChart ?? !isExecutiveOnly;
  const includeCashflow = opts.includeCashflowChart ?? !isBomFocus;
  const includeEmi = opts.includeLoanEmiTable ?? (!isExecutiveOnly && !isBomFocus);
  const includeBom = opts.includeBom ?? !isExecutiveOnly;
  const includeSignOff = opts.includeSignOff ?? true;

  const tariffIncPct = data.expectedTariffIncreasePct ?? 2.5;
  const maintPct = data.maintenanceCostPct ?? 1.0;

  const roiModel = calculate25YearSensitivityRoi({
    installationCost: data.grossCost,
    subsidyAmount: data.governmentSubsidy,
    annualSavings: data.annualSavings,
    expectedTariffIncreasePct: tariffIncPct,
    maintenanceCostPct: maintPct,
    includeInverterReplacement: true,
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const quoteRef = opts.quoteRef?.trim() || `SOL-${new Date().getFullYear()}-${Math.round(data.systemKw * 100)}`;
  const contTitle = `Solar Proposal — ${data.systemKw} kW ${data.moduleStandard === 'DCR' ? 'DCR' : 'Non-DCR'} (${data.systemType?.toUpperCase() || 'ON-GRID'})`;
  const contSub = `${data.locationName || 'Site Location'} | Ref: ${quoteRef}`;

  // Top Header Banner (Page 1)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 38, 'F');
  doc.setFillColor(255, 111, 0);
  doc.rect(0, 36.2, pageWidth, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Solar System Engineering & Financial Proposal', marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(203, 213, 225);
  const siteCoords = `${data.locationName || 'Site Location'} (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)})`;
  doc.text(`Site: ${siteCoords}`, marginX, 20.5);
  doc.text(
    `Standard: ${data.moduleStandard === 'DCR' ? 'DCR ALMM (Subsidy Eligible)' : 'Non-DCR (Open Category)'} | Category: ${data.consumerCategory.toUpperCase()} | Ref: ${quoteRef}`,
    marginX,
    26
  );
  const customerMeta = [
    opts.customerName?.trim() ? `Prepared For: ${opts.customerName.trim()}` : null,
    data.uscNumber ? `USC: ${data.uscNumber}${data.discomName ? ` (${data.discomName})` : ''}` : null,
    opts.preparedBy?.trim() ? `Prepared By: ${opts.preparedBy.trim()}` : null,
  ]
    .filter(Boolean)
    .join('  |  ');
  if (customerMeta) {
    doc.setTextColor(253, 186, 116);
    doc.text(customerMeta, marginX, 31.5);
  } else {
    doc.text(
      `Architecture: ${(data.systemType || 'on-grid').toUpperCase()} | Inverter: ${data.inverterLabel || `${data.systemKw} kW MPPT`}`,
      marginX,
      31.5
    );
  }

  let y = 43;

  // 4 Executive KPI Cards
  const gap = 3;
  const cardW = (contentWidth - gap * 3) / 4;
  const cardH = 21;
  const kpiCards = [
    {
      label: 'SYSTEM CAPACITY',
      value: `${data.systemKw} kW`,
      sub: `${data.panelWattage}W × ${data.panelCount} Panels`,
      accent: [37, 99, 235] as const,
    },
    {
      label: 'INVERTER & PHASE',
      value: `${data.inverterPowerKw || data.inverterSuggestion?.recommendedAcKw || data.systemKw} kW`,
      sub: data.phaseType === 'three_phase' ? '3-Phase 415V' : '1-Phase 230V',
      accent: [234, 88, 12] as const,
    },
    {
      label: 'NET INVESTMENT',
      value: fmtCurrency(data.netPayable, data.currency),
      sub: data.governmentSubsidy > 0 ? `After -${fmtCurrency(data.governmentSubsidy, data.currency)} DBT` : 'Turnkey Cost',
      accent: [217, 119, 6] as const,
    },
    {
      label: 'BREAK-EVEN / 25-YR',
      value: `${roiModel.breakEvenBeyondHorizon ? '25+' : roiModel.breakEvenYear} Yrs`,
      sub: `25Yr: ${fmtCurrency(roiModel.lifetimeCumulativeSavings, data.currency)}`,
      accent: [5, 150, 105] as const,
    },
  ];

  kpiCards.forEach((card, i) => {
    const cx = marginX + i * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cx + 2.8, y + 5.2);

    doc.setFontSize(10.8);
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.value, cx + 2.8, y + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, cx + 2.8, y + 17.5);
  });

  y += cardH + 6;

  // Section 1: System Engineering & Inverter Sizing Profile
  y = drawSectionHeader(doc, '1. Solar Array, Inverter Engineering & Site Profile', y, marginX, contentWidth);
  const panelCellInfo = data.panelSpec
    ? `${data.panelWattage}W ${data.panelSpec.cellTechnology} (${data.panelSpec.efficiencyPercent}% Eff · ${data.panelSpec.dimensionsMm})`
    : `${data.panelWattage}W Tier-1 Modules`;
  y = drawKeyValueRows(
    doc,
    [
      {
        label: 'Consumer Category & Supply Phase',
        value: `${data.consumerCategory.toUpperCase()} (${data.phaseType === 'three_phase' ? '3-Phase 415V' : '1-Phase 230V'})`,
      },
      {
        label: 'System Architecture',
        value:
          data.systemType === 'off-grid'
            ? 'Off-Grid (Standalone PCU + Battery Bank)'
            : data.systemType === 'hybrid'
            ? 'Hybrid (Net-Metered Export + LFP Backup)'
            : 'On-Grid (Net-Metered, Battery Not Required)',
      },
      { label: 'PV Module Specification', value: panelCellInfo },
      {
        label: 'Selected Inverter Brand & Power',
        value: data.inverterLabel || `${data.inverterBrand || 'Recommended'} ${data.inverterPowerKw || data.systemKw} kW`,
      },
      ...(typeof data.batteryKwh === 'number'
        ? [
            {
              label: 'Battery Storage Bank',
              value: data.batteryKwh > 0 ? `${data.batteryKwh} kWh LiFePO4 Bank` : '0 kWh (Grid Acts as Virtual Storage)',
            },
          ]
        : []),
      {
        label: 'Monthly / Daily Electricity Consumption',
        value: `${data.monthlyUnitsKwh.toLocaleString()} kWh/mo (${data.dailyUsageKwh} kWh/day) @ ${fmtCurrency(data.tariffPerKwh, data.currency)}/kWh`,
      },
      {
        label: 'Site Irradiance & Performance Ratio',
        value: `${data.peakSunHours.toFixed(1)} Peak Sun Hrs/day | PR ${Math.round(data.effectivePR * 100)}%`,
      },
      {
        label: 'Estimated Monthly & Annual Solar Yield',
        value: `${data.estimatedMonthlyGenKwh.toLocaleString()} kWh/mo (${(data.estimatedMonthlyGenKwh * 12).toLocaleString()} kWh/yr)`,
        highlight: 'emerald',
      },
      {
        label: 'Required Roof Area vs. Available Area',
        value: `${data.roofAreaNeededSqm} m2 needed (${Math.round(data.roofAreaNeededSqm * 10.7639)} sq.ft)${
          data.availableRoofAreaSqm > 0 ? ` / ${data.availableRoofAreaSqm} m2 available` : ''
        }`,
      },
      ...(data.engineeringLayout
        ? [
            {
              label: 'Rooftop Engineering Fit & Clearances',
              value: `${data.engineeringLayout.placedPanels} max fit (${data.engineeringLayout.rows || '-'}x${
                data.engineeringLayout.cols || '-'
              } ${(data.engineeringLayout.orientation || 'auto').toUpperCase()}) | Usable ${data.engineeringLayout.usableRoofAreaM2.toFixed(
                1
              )} m2 (${Math.round(data.engineeringLayout.utilizationPercent || 0)}% util.)`,
            },
          ]
        : []),
    ],
    y,
    marginX,
    contentWidth
  );

  // Inverter Engineering Suggestion Callout Box
  if (data.inverterSuggestion) {
    y = ensureSpace(doc, y, 22, pageHeight, marginX, pageWidth, contTitle, contSub);
    const sug = data.inverterSuggestion;
    const isWarn = sug.ratioStatus === 'undersized';
    doc.setFillColor(isWarn ? 254 : 236, isWarn ? 242 : 253, isWarn ? 242 : 245);
    doc.setDrawColor(isWarn ? 248 : 110, isWarn ? 113 : 231, isWarn ? 113 : 183);
    doc.roundedRect(marginX, y, contentWidth, 18, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(isWarn ? 185 : 6, isWarn ? 28 : 95, isWarn ? 28 : 70);
    doc.text(
      `INVERTER SIZING CHECK: ${sug.ratioHeadline} | Recommended: ${sug.recommendedAcKw} kW (${sug.recommendedPhaseLabel})`,
      marginX + 3,
      y + 5.2
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const adviceLines = doc.splitTextToSize(`${sug.ratioAdvice}  ${sug.mpptCurrentNote}`, contentWidth - 6);
    doc.text(adviceLines.slice(0, 2), marginX + 3, y + 10.2);
    y += 22;
  }

  // Section 2: Cost, Subsidy, Sensitivity & Environmental Impact
  y = ensureSpace(doc, y, 64, pageHeight, marginX, pageWidth, contTitle, contSub);
  y = drawSectionHeader(doc, '2. Cost Breakdown, Subsidy & Environmental Impact', y, marginX, contentWidth);
  const co225Tonnes = ((data.co2AvoidedKgPerYear * 25 * 0.94) / 1000).toFixed(1);
  const equivTrees = Math.round((data.co2AvoidedKgPerYear * 25 * 0.94) / 21.7);
  y = drawKeyValueRows(
    doc,
    [
      {
        label: `Gross Turnkey Capex (@ ${fmtCurrency(data.baseCostPerKw, data.currency)}/kW base)`,
        value: fmtCurrency(data.grossCost, data.currency),
      },
      {
        label: 'PM Surya Ghar Govt Subsidy (DBT Credit)',
        value: data.governmentSubsidy > 0 ? `- ${fmtCurrency(data.governmentSubsidy, data.currency)}` : fmtCurrency(0, data.currency),
        highlight: data.governmentSubsidy > 0 ? 'emerald' : 'slate',
      },
      {
        label: 'Net Customer Investment (Payback Basis)',
        value: fmtCurrency(data.netPayable, data.currency),
        highlight: 'amber',
      },
      {
        label: `Estimated Year-1 Savings (Escalation ${tariffIncPct}%/yr · O&M ${maintPct}%/yr)`,
        value: `${fmtCurrency(data.monthlySavings, data.currency)}/mo  |  ${fmtCurrency(data.annualSavings, data.currency)}/yr`,
        highlight: 'emerald',
      },
      {
        label: 'Sensitivity Payback & 25-Yr Net Profit',
        value: `${roiModel.breakEvenBeyondHorizon ? '25+' : roiModel.breakEvenYear} Yrs  |  Net Profit ${fmtCurrency(roiModel.lifetimeCumulativeSavings, data.currency)}`,
        highlight: 'emerald',
      },
      {
        label: '25-Year Environmental Offset',
        value: `${co225Tonnes} Tonnes CO2 Avoided (~${equivTrees.toLocaleString()} Mature Trees)`,
        highlight: 'emerald',
      },
    ],
    y,
    marginX,
    contentWidth
  );

  // Section 3: Historical Usage vs Solar Chart (Optional / Included in Full Proposal)
  if (includeHistorical) {
    y = ensureSpace(doc, y, 68, pageHeight, marginX, pageWidth, contTitle, contSub);
    y = drawSectionHeader(doc, '3. 12-Month Consumption vs. Projected Solar Generation', y, marginX, contentWidth);
    const monthlySeries = buildMonthlyComparisonSeries(
      data.monthlyHistory12,
      data.monthlyUnitsKwh,
      data.estimatedMonthlyGenKwh
    );
    y = drawMonthlyUsageVsSolarChart(doc, monthlySeries, y, marginX, contentWidth);
  }

  // Section 4: 25-Year Cashflow Chart & Milestone Schedule
  if (includeCashflow) {
    const projectionYears = roiModel.chartData.filter((r) => r.year >= 1);
    y = ensureSpace(doc, y, 70, pageHeight, marginX, pageWidth, contTitle, contSub);
    y = drawSectionHeader(doc, '4. 25-Year Cumulative Cashflow & Break-Even Trajectory', y, marginX, contentWidth);
    y = draw25YearCashflowChart(
      doc,
      projectionYears,
      data.netPayable,
      data.currency,
      y,
      marginX,
      contentWidth
    );

    const milestones = projectionYears.filter((r) => [1, 2, 3, 4, 5, 7, 10, 15, 20, 25].includes(r.year));
    y = ensureSpace(doc, y, milestones.length * 6.2 + 12, pageHeight, marginX, pageWidth, contTitle, contSub);

    const cols = [0.12, 0.21, 0.16, 0.23, 0.16, 0.12];
    const headers = ['Year', 'Gross Gain', 'O&M Cost', 'Cum. Net Cash', 'Net Position', 'Status'];
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, y, contentWidth, 6.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(255, 255, 255);

    let cx = marginX;
    headers.forEach((h, i) => {
      const w = contentWidth * cols[i];
      const align = i === 0 || i === 5 ? 'left' : 'right';
      doc.text(h, align === 'left' ? cx + 2.2 : cx + w - 2.2, y + 4.7, { align });
      cx += w;
    });
    y += 6.8;

    milestones.forEach((row, idx) => {
      const isProfitable = row.netCashFlow >= 0;
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, 6, 'F');
      }

      const values = [
        `Yr ${row.year}`,
        fmtCurrency(row.grossAnnualSavings, data.currency),
        fmtCurrency(row.maintenanceCost, data.currency),
        fmtCurrency(row.cumulativeSavings, data.currency),
        `${row.netCashFlow >= 0 ? '+' : ''}${fmtCurrency(row.netCashFlow, data.currency)}`,
        isProfitable ? 'Profit' : 'Payback',
      ];

      cx = marginX;
      values.forEach((v, i) => {
        const w = contentWidth * cols[i];
        const align = i === 0 || i === 5 ? 'left' : 'right';
        doc.setFont('helvetica', i === 0 || i >= 4 ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        if (i >= 4) {
          doc.setTextColor(isProfitable ? 5 : 217, isProfitable ? 150 : 119, isProfitable ? 105 : 6);
        } else {
          doc.setTextColor(30, 41, 59);
        }
        doc.text(v, align === 'left' ? cx + 2.2 : cx + w - 2.2, y + 4.2, { align });
        cx += w;
      });
      y += 6;
    });
    y += 5;
  }

  // Section 5: Solar Loan / EMI Financing Comparison
  if (includeEmi) {
    y = ensureSpace(doc, y, 42, pageHeight, marginX, pageWidth, contTitle, contSub);
    y = drawSectionHeader(doc, '5. Indicative Solar Loan / EMI vs. Monthly Savings (80% Financed @ 9.9% p.a.)', y, marginX, contentWidth);

    const downPayment = Math.round(data.netPayable * 0.2);
    const principal = Math.max(0, data.netPayable - downPayment);
    const monthlyRate = 0.099 / 12;
    const tenures = [3, 5, 7];

    const emiCols = [0.2, 0.2, 0.2, 0.2, 0.2];
    const emiHeaders = ['Tenure', 'Loan Amount (80%)', 'Monthly EMI', 'Monthly Savings', 'Net Cash Impact'];
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, y, contentWidth, 6.8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(255, 255, 255);
    let ex = marginX;
    emiHeaders.forEach((h, i) => {
      const w = contentWidth * emiCols[i];
      doc.text(h, i === 0 ? ex + 2.5 : ex + w - 2.5, y + 4.7, { align: i === 0 ? 'left' : 'right' });
      ex += w;
    });
    y += 6.8;

    tenures.forEach((yrs, idx) => {
      const n = yrs * 12;
      const emi = Math.round(
        (principal * monthlyRate * Math.pow(1 + monthlyRate, n)) /
          (Math.pow(1 + monthlyRate, n) - 1)
      );
      const netImpact = data.monthlySavings - emi;
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, 6.4, 'F');
      }
      const rowVals = [
        `${yrs} Years (${n} EMIs)`,
        fmtCurrency(principal, data.currency),
        fmtCurrency(emi, data.currency),
        fmtCurrency(data.monthlySavings, data.currency),
        `${netImpact >= 0 ? '+' : ''}${fmtCurrency(netImpact, data.currency)}/mo`,
      ];
      ex = marginX;
      rowVals.forEach((v, i) => {
        const w = contentWidth * emiCols[i];
        doc.setFont('helvetica', i === 0 || i === 4 ? 'bold' : 'normal');
        doc.setFontSize(7.6);
        if (i === 4) {
          doc.setTextColor(netImpact >= 0 ? 5 : 217, netImpact >= 0 ? 150 : 119, netImpact >= 0 ? 105 : 6);
        } else {
          doc.setTextColor(30, 41, 59);
        }
        doc.text(v, i === 0 ? ex + 2.5 : ex + w - 2.5, y + 4.4, { align: i === 0 ? 'left' : 'right' });
        ex += w;
      });
      y += 6.4;
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Illustrative down payment (20%): ${fmtCurrency(downPayment, data.currency)} · Net-positive cashflow indicates solar savings fully cover EMI.`,
      marginX,
      y + 3.8
    );
    y += 8.5;
  }

  // Section 6: Complete Wrapped Bill of Materials (BOM)
  if (includeBom && data.bomItems && data.bomItems.length > 0) {
    y = ensureSpace(doc, y, 40, pageHeight, marginX, pageWidth, contTitle, contSub);
    y = drawSectionHeader(
      doc,
      `Bill of Materials (BOM) — ${
        data.systemType === 'hybrid'
          ? 'Hybrid'
          : data.systemType === 'off-grid'
          ? 'Off-Grid'
          : 'On-Grid'
      } (${data.moduleStandard === 'DCR' ? 'DCR ALMM' : 'Non-DCR'})`,
      y,
      marginX,
      contentWidth
    );

    const bomCols = [0.18, 0.44, 0.23, 0.15];
    const bomHeaders = ['Category', 'Component & Technical Specification', 'Quantity', 'Status'];

    const drawBomTableHeader = (curY: number) => {
      doc.setFillColor(30, 41, 59);
      doc.rect(marginX, curY, contentWidth, 6.8, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(255, 255, 255);
      let bx = marginX;
      bomHeaders.forEach((h, i) => {
        const w = contentWidth * bomCols[i];
        doc.text(h, bx + 2.5, curY + 4.7);
        bx += w;
      });
      return curY + 6.8;
    };

    y = drawBomTableHeader(y);

    data.bomItems.forEach((item, idx) => {
      const specLines = doc.splitTextToSize(
        `${item.name} — ${item.specification}`,
        contentWidth * bomCols[1] - 4
      );
      const qtyLines = doc.splitTextToSize(item.quantity, contentWidth * bomCols[2] - 4);
      const lineCount = Math.max(specLines.length, qtyLines.length, 1);
      const rowHeight = Math.max(8.5, lineCount * 3.8 + 3.5);

      if (y + rowHeight > pageHeight - 17) {
        doc.addPage();
        drawContinuationHeader(doc, contTitle, contSub, marginX, pageWidth);
        y = drawBomTableHeader(21);
      }

      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginX, y + rowHeight, marginX + contentWidth, y + rowHeight);

      let bx = marginX;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(30, 41, 59);
      doc.text(item.category, bx + 2.5, y + 4.8);
      bx += contentWidth * bomCols[0];

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.text(specLines, bx + 2.2, y + 4.6);
      bx += contentWidth * bomCols[1];

      doc.setFont('helvetica', 'bold');
      doc.text(qtyLines, bx + 2.2, y + 4.6);
      bx += contentWidth * bomCols[2];

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(
        item.status === 'Required' ? 5 : 100,
        item.status === 'Required' ? 150 : 116,
        item.status === 'Required' ? 105 : 139
      );
      doc.text(item.status, bx + 2.5, y + 4.8);

      y += rowHeight;
    });

    if (data.removedComponents && data.removedComponents.length > 0) {
      y += 3;
      y = ensureSpace(doc, y, 12, pageHeight, marginX, pageWidth, contTitle, contSub);
      doc.setFillColor(241, 245, 249);
      doc.roundedRect(marginX, y, contentWidth, 9, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.3);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `Omitted for ${data.systemType?.toUpperCase() || 'SELECTED'} Mode: ${data.removedComponents.join(' · ')}`,
        marginX + 3,
        y + 5.7
      );
      y += 12;
    } else {
      y += 5;
    }
  }

  // Optional Project Notes + Warranty & Client Sign-Off Block
  if (opts.projectNotes?.trim() || includeSignOff) {
    const blockNeeded = (opts.projectNotes?.trim() ? 18 : 0) + (includeSignOff ? 34 : 0);
    y = ensureSpace(doc, y, blockNeeded, pageHeight, marginX, pageWidth, contTitle, contSub);

    if (opts.projectNotes?.trim()) {
      y = drawSectionHeader(doc, 'Engineering Notes & Site Conditions', y, marginX, contentWidth);
      const noteLines = doc.splitTextToSize(opts.projectNotes.trim(), contentWidth - 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(51, 65, 85);
      doc.text(noteLines, marginX + 2, y + 1);
      y += noteLines.length * 4 + 5;
    }

    if (includeSignOff) {
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(203, 213, 225);
      doc.roundedRect(marginX, y, contentWidth, 28, 2, 2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text('WARRANTY ASSURANCE & PROPOSAL ACCEPTANCE', marginX + 3, y + 5.5);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.3);
      doc.setTextColor(71, 85, 105);
      doc.text(
        'Modules: 25-Yr Linear Output Warranty (≥84% Year 25)  |  Inverter: 7–10 Yr OEM Replacement Warranty  |  MMS & BOS: 5-Yr Workmanship',
        marginX + 3,
        y + 10.5
      );

      doc.setDrawColor(148, 163, 184);
      doc.line(marginX + 3, y + 22, marginX + 75, y + 22);
      doc.line(marginX + 100, y + 22, marginX + contentWidth - 3, y + 22);
      doc.setFontSize(7.2);
      doc.text(`Prepared By: ${opts.preparedBy?.trim() || 'Solar Project Engineer'}`, marginX + 3, y + 26);
      doc.text(`Client Acceptance: ${opts.customerName?.trim() || 'Authorized Signatory'} & Date`, marginX + 100, y + 26);
    }
  }

  applyPageFooters(doc, marginX, pageWidth, pageHeight, quoteRef);

  if (opts.outputMode === 'blob') {
    return doc.output('blob');
  }

  const safeCity = (data.locationName || 'Solar').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24);
  doc.save(`Solar_Proposal_${safeCity}_${data.systemKw}kW.pdf`);
}

export function exportEstimatorCsvReport(data: EstimatorPdfReportData): void {
  const tariffIncPct = data.expectedTariffIncreasePct ?? 2.5;
  const maintPct = data.maintenanceCostPct ?? 1.0;
  const roiModel = calculate25YearSensitivityRoi({
    installationCost: data.grossCost,
    subsidyAmount: data.governmentSubsidy,
    annualSavings: data.annualSavings,
    expectedTariffIncreasePct: tariffIncPct,
    maintenanceCostPct: maintPct,
    includeInverterReplacement: true,
  });

  const rows: string[][] = [
    ['SOLAR SYSTEM ESTIMATION & BOM REPORT'],
    ['Location', data.locationName, 'Coordinates', `${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}`],
    ['Module Standard', data.moduleStandard, 'Architecture', (data.systemType || 'on-grid').toUpperCase()],
    ['System Capacity (kW)', String(data.systemKw), 'Panel Spec', `${data.panelCount} x ${data.panelWattage}W`],
    ['Inverter', data.inverterLabel || `${data.inverterPowerKw || data.systemKw} kW`, 'Battery (kWh)', String(data.batteryKwh ?? 0)],
    ['Gross Cost (INR)', String(data.grossCost), 'Govt Subsidy (INR)', String(data.governmentSubsidy)],
    ['Net Payable (INR)', String(data.netPayable), 'Monthly Savings (INR)', String(data.monthlySavings)],
    ['Payback Years', String(roiModel.breakEvenYear), '25-Yr Net Cumulative (INR)', String(roiModel.lifetimeCumulativeSavings)],
    [],
    ['BILL OF MATERIALS (BOM)'],
    ['Category', 'Component', 'Specification', 'Quantity', 'Status'],
    ...(data.bomItems || []).map((b) => [b.category, b.name, b.specification, b.quantity, b.status]),
    [],
    ['25-YEAR CASHFLOW PROJECTION'],
    ['Year', 'Annual Gross Savings (INR)', 'O&M Cost (INR)', 'Net Annual Cashflow (INR)', 'Cumulative Savings (INR)', 'Net Balance vs Capex (INR)'],
    ...roiModel.chartData
      .filter((r) => r.year >= 1)
      .map((r) => [
        `Year ${r.year}`,
        String(r.grossAnnualSavings),
        String(r.maintenanceCost),
        String(r.annualSavings),
        String(r.cumulativeSavings),
        String(r.netCashFlow),
      ]),
  ];

  const csvContent = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')
    )
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeCity = (data.locationName || 'Solar').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24);
  a.href = url;
  a.download = `Solar_BOM_Cashflow_${safeCity}_${data.systemKw}kW.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface FinancialSavingsPdfReportData {
  locationName: string;
  latitude: number;
  longitude: number;
  currency: CurrencyCode;
  monthlyUnitsKwh: number;
  tariffPerKwh: number;
  installationCost: number;
  monthlySavings: number;
  annualSavings: number;
  requirements: SolarSystemRequirements;
  savings: FinancialSavingsEstimate;
}

export function exportFinancialSavingsPdfReport(data: FinancialSavingsPdfReportData): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;

  const subsidy = data.savings.governmentSubsidy || 0;
  const netCost = Math.max(1000, data.installationCost - subsidy);
  const breakEvenYears = data.annualSavings > 0 ? Number((netCost / data.annualSavings).toFixed(1)) : 0;

  const yearlyData: Array<{ year: number; yrSavings: number; cumulativeSavings: number; netCumulativeProfit: number }> = [];
  let cumulative25 = 0;
  for (let yr = 1; yr <= 25; yr++) {
    const yrSav = Math.round(data.annualSavings * Math.pow(0.995, yr - 1) * Math.pow(1.022, yr - 1));
    cumulative25 += yrSav;
    yearlyData.push({
      year: yr,
      yrSavings: yrSav,
      cumulativeSavings: Math.round(cumulative25),
      netCumulativeProfit: Math.round(cumulative25 - netCost),
    });
  }
  const netGain25 = Math.round(cumulative25 - netCost);
  const roiPct = netCost > 0 ? Math.round((netGain25 / netCost) * 100) : 0;

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(16, 185, 129);
  doc.rect(0, 32.5, pageWidth, 1.8, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('Solar Financial Savings & Payback Report', marginX, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Location: ${data.locationName || 'Site Location'} (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)})`,
    marginX,
    21.5
  );
  doc.text(
    `System: ${data.requirements.totalDcCapacityKwp.toFixed(1)} kWp (${data.requirements.requiredPanelCount} x ${data.requirements.selectedWattage}W) | Tariff: ${fmtCurrency(data.tariffPerKwh, data.currency)}/kWh`,
    marginX,
    27.5
  );

  let y = 41;

  // 4 Financial KPI Cards
  const gap = 3;
  const cardW = (contentWidth - gap * 3) / 4;
  const cardH = 21;
  const cards = [
    { label: 'MONTHLY SAVINGS', value: fmtCurrency(data.monthlySavings, data.currency), sub: `${data.monthlyUnitsKwh} Units/mo`, accent: [234, 88, 12] as const },
    { label: 'ANNUAL RETURN', value: fmtCurrency(data.annualSavings, data.currency), sub: 'Avoided + Export', accent: [22, 163, 74] as const },
    { label: 'BREAK-EVEN POINT', value: `${breakEvenYears} Years`, sub: `Net Cost ${fmtCurrency(netCost, data.currency)}`, accent: [37, 99, 235] as const },
    { label: '25-YR NET PROFIT', value: fmtCurrency(netGain25, data.currency), sub: `Total ROI ${roiPct}%`, accent: [5, 150, 105] as const },
  ];

  cards.forEach((card, i) => {
    const cx = marginX + i * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cx + 3, y + 5.5);

    doc.setFontSize(11);
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.value, cx + 3, y + 12.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, cx + 3, y + 18);
  });

  y += cardH + 7;

  // Section 1: Investment & Tariff Summary
  y = drawSectionHeader(doc, '1. Investment & Energy Savings Breakdown', y, marginX, contentWidth);
  y = drawKeyValueRows(
    doc,
    [
      { label: 'System Size & Module Count', value: `${data.requirements.totalDcCapacityKwp.toFixed(1)} kWp (${data.requirements.requiredPanelCount} x ${data.requirements.selectedWattage}W)` },
      { label: 'Estimated Monthly Generation', value: `${data.requirements.monthlyGenerationKwh.toLocaleString()} kWh / month` },
      { label: 'Self-Consumed vs. Grid Export', value: `${data.savings.selfConsumedMonthlyUnits} kWh self / ${data.savings.exportedMonthlyUnits} kWh export` },
      { label: 'Gross Installation Cost', value: fmtCurrency(data.installationCost, data.currency) },
      {
        label: 'Government Subsidy Deduction',
        value: subsidy > 0 ? `- ${fmtCurrency(subsidy, data.currency)}` : fmtCurrency(0, data.currency),
        highlight: subsidy > 0 ? 'emerald' : 'slate',
      },
      { label: 'Net Capital Outlay (Payback Basis)', value: fmtCurrency(netCost, data.currency), highlight: 'amber' },
      { label: '25-Year Gross Cumulative Savings', value: fmtCurrency(Math.round(cumulative25), data.currency), highlight: 'emerald' },
    ],
    y,
    marginX,
    contentWidth
  );

  // Section 2: 25-Yr Vector Cashflow Chart
  y = drawSectionHeader(doc, '2. 25-Year Payback Visualization', y, marginX, contentWidth);
  y = draw25YearCashflowChart(doc, yearlyData, netCost, data.currency, y, marginX, contentWidth);

  // Section 3: 25-Year Milestone Recovery Table
  y = ensureSpace(doc, y, 78, pageHeight, marginX, pageWidth, 'Solar Financial ROI Report', data.locationName);
  y = drawSectionHeader(doc, '3. 25-Year Milestone Cashflow Schedule', y, marginX, contentWidth);

  const milestoneYears = [1, 2, 3, 4, 5, 7, 10, 15, 20, 25];
  const milestoneRows = yearlyData.filter((r) => milestoneYears.includes(r.year));

  const cols = [0.14, 0.21, 0.23, 0.22, 0.2];
  const headers = ['Year', 'Annual Gain', 'Cum. Savings', 'Net Balance', 'Milestone'];
  doc.setFillColor(30, 41, 59);
  doc.rect(marginX, y, contentWidth, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(255, 255, 255);

  let cx = marginX;
  headers.forEach((h, i) => {
    const w = contentWidth * cols[i];
    const align = i === 0 || i === 4 ? 'left' : 'right';
    doc.text(h, align === 'left' ? cx + 2.5 : cx + w - 2.5, y + 4.8, { align });
    cx += w;
  });
  y += 7;

  milestoneRows.forEach((row, idx) => {
    const isProfitable = row.netCumulativeProfit >= 0;
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, 6.2, 'F');
    }

    const vals = [
      `Year ${row.year}`,
      fmtCurrency(row.yrSavings, data.currency),
      fmtCurrency(row.cumulativeSavings, data.currency),
      `${row.netCumulativeProfit >= 0 ? '+' : ''}${fmtCurrency(row.netCumulativeProfit, data.currency)}`,
      isProfitable ? 'Profitable' : 'Payback Phase',
    ];

    cx = marginX;
    vals.forEach((v, i) => {
      const w = contentWidth * cols[i];
      const align = i === 0 || i === 4 ? 'left' : 'right';
      doc.setFont('helvetica', i === 0 || i >= 3 ? 'bold' : 'normal');
      doc.setFontSize(8.2);
      if (i >= 3) {
        doc.setTextColor(isProfitable ? 5 : 217, isProfitable ? 150 : 119, isProfitable ? 105 : 6);
      } else {
        doc.setTextColor(30, 41, 59);
      }
      doc.text(v, align === 'left' ? cx + 2.5 : cx + w - 2.5, y + 4.3, { align });
      cx += w;
    });
    y += 6.2;
  });

  applyPageFooters(doc, marginX, pageWidth, pageHeight);
  const safeCity = (data.locationName || 'Solar').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24);
  doc.save(`Solar_Financial_ROI_${safeCity}.pdf`);
}

export interface SiteSurveyPdfReportData {
  siteLocationName: string;
  surveyId: string;
  projectTitle: string;
  inspectorName: string;
  status: string;
  completedAtIso?: string;
  summaryRemarks?: string;
  latitude: number;
  longitude: number;
  elevationM: number;
  roofLengthM: number;
  roofWidthM: number;
  parapetHeightM: number;
  mmsClearanceM: number;
  walkwayWidthM: number;
  perimeterSetbackM: number;
  walkwayAislesCount: number;
  tiltDeg: number;
  azimuthCompassDeg: number;
  numRows: number;
  arrayWidthM: number;
  effectivePitchM: number;
  gcr: number;
  annualGhiKwhM2: number;
  annualPoaUnshadedKwhM2: number;
  effectivePoaKwhM2: number;
  iamLossPct: number;
  farHorizonLossPct: number;
  nearShadeLossPct: number;
  electricalMismatchLossPct: number;
  shadingRetentionPct: number;
  mediaCount: number;
  calibratedMediaCount: number;
  obstacles: Array<{
    name: string;
    category: string;
    heightM: number;
    widthM: number;
    depthM: number;
    distanceM: number;
    bearingDeg: number;
  }>;
  checklist: Array<{
    code: string;
    category: string;
    label: string;
    autoDetail: string;
    passed: boolean;
  }>;
  outputMode?: 'download' | 'blob';
}

export function exportSiteSurveyPdfReport(data: SiteSurveyPdfReportData): Blob | void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const contTitle = `Site Survey & PVsyst Audit — ${data.projectTitle || data.siteLocationName}`;
  const contSub = `Survey ID: ${data.surveyId} | ${data.status.toUpperCase()}`;

  const passedCount = data.checklist.filter((c) => c.passed).length;

  // Top Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 36, 'F');
  doc.setFillColor(255, 111, 0);
  doc.rect(0, 34.4, pageWidth, 1.6, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(255, 255, 255);
  doc.text('Solar Site Survey, AutoCAD 3D & PVsyst Audit Report', marginX, 13);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(203, 213, 225);
  doc.text(
    `Project: ${data.projectTitle || data.siteLocationName}  |  GPS: ${data.latitude.toFixed(5)}N, ${data.longitude.toFixed(5)}E  |  Elev: ${data.elevationM}m`,
    marginX,
    20.5
  );
  doc.text(
    `Survey ID: ${data.surveyId}  |  Inspector: ${data.inspectorName || 'Lead Site Engineer'}  |  Status: ${data.status.toUpperCase()}`,
    marginX,
    26.2
  );
  doc.setTextColor(253, 186, 116);
  doc.text(
    `Site Media: ${data.mediaCount} asset(s) (${data.calibratedMediaCount} scale-calibrated)  |  3D Obstacles: ${data.obstacles.length}  |  Walkways: ${data.walkwayAislesCount} aisles`,
    marginX,
    31.5
  );

  let y = 41;

  // 4 Executive Survey KPI Cards
  const gap = 3;
  const cardW = (contentWidth - gap * 3) / 4;
  const cardH = 20.5;
  const kpis = [
    {
      label: 'ANNUAL GHI / POA',
      value: `${data.annualGhiKwhM2}`,
      sub: `Unshaded POA: ${data.annualPoaUnshadedKwhM2}`,
      accent: [37, 99, 235] as const,
    },
    {
      label: 'EFFECTIVE POA',
      value: `${data.effectivePoaKwhM2}`,
      sub: 'kWh/m2/yr post-shade',
      accent: [234, 88, 12] as const,
    },
    {
      label: 'SHADE RETENTION',
      value: `${data.shadingRetentionPct}%`,
      sub: data.shadingRetentionPct >= 82 ? 'Pass (>=82% target)' : 'Review (<82% target)',
      accent: data.shadingRetentionPct >= 82 ? ([5, 150, 105] as const) : ([217, 119, 6] as const),
    },
    {
      label: 'QA INSPECTION',
      value: `${passedCount} / ${data.checklist.length}`,
      sub: passedCount === data.checklist.length ? 'All Checks Passed' : 'Checks Pending',
      accent: passedCount === data.checklist.length ? ([5, 150, 105] as const) : ([217, 119, 6] as const),
    },
  ];

  kpis.forEach((card, i) => {
    const cx = marginX + i * (cardW + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, y, cardW, cardH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.9);
    doc.setTextColor(100, 116, 139);
    doc.text(card.label, cx + 2.8, y + 5.2);

    doc.setFontSize(11);
    doc.setTextColor(card.accent[0], card.accent[1], card.accent[2]);
    doc.text(card.value, cx + 2.8, y + 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.9);
    doc.setTextColor(71, 85, 105);
    doc.text(card.sub, cx + 2.8, y + 17.2);
  });

  y += cardH + 6;

  // Section 1: Field Measurements & AutoCAD 3D Structure Geometry
  y = drawSectionHeader(doc, '1. Field Measurements, Walkways & AutoCAD 3D Array', y, marginX, contentWidth);
  y = drawKeyValueRows(
    doc,
    [
      {
        label: 'Roof Envelope & Parapet Height',
        value: `${data.roofLengthM}m (L) x ${data.roofWidthM}m (W) | Parapet ${data.parapetHeightM}m | MMS Clearance ${data.mmsClearanceM}m`,
      },
      {
        label: 'Built-In O&M Walkways & Fire Setback',
        value: `${data.walkwayAislesCount} grated aisle(s) @ ${data.walkwayWidthM}m width | Edge Setback ${data.perimeterSetbackM}m`,
      },
      {
        label: 'Array Orientation & Row Spacing',
        value: `Tilt ${data.tiltDeg} deg | Azimuth ${data.azimuthCompassDeg} deg | ${data.numRows} rows x ${data.arrayWidthM}m | Pitch ${data.effectivePitchM}m (GCR ${(data.gcr * 100).toFixed(0)}%)`,
      },
      {
        label: 'Site Media & Drawing Scale Archive',
        value: `${data.mediaCount} site file(s) attached (${data.calibratedMediaCount} drawing(s) calibrated to meters)`,
      },
    ],
    y,
    marginX,
    contentWidth
  );

  // Section 2: PVsyst Optical Loss Visual Breakdown
  y = ensureSpace(doc, y, 52, pageHeight, marginX, pageWidth, contTitle, contSub);
  y = drawSectionHeader(doc, '2. PVsyst Optical & Shading Loss Waterfall', y, marginX, contentWidth);

  const losses = [
    { label: 'IAM Reflection Loss', pct: data.iamLossPct, color: [59, 130, 246] as const },
    { label: 'Far Horizon Loss', pct: data.farHorizonLossPct, color: [168, 85, 247] as const },
    { label: 'Near Shading Loss (3D Obstacles)', pct: data.nearShadeLossPct, color: [249, 115, 22] as const },
    { label: 'String Electrical Mismatch', pct: data.electricalMismatchLossPct, color: [239, 68, 68] as const },
    { label: 'Net Optical Shade Retention', pct: data.shadingRetentionPct, color: [16, 185, 129] as const },
  ];

  const boxHeight = losses.length * 7.2 + 6;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginX, y, contentWidth, boxHeight, 2, 2, 'FD');

  losses.forEach((item, i) => {
    const ry = y + 6 + i * 7.2;
    doc.setFont('helvetica', i === losses.length - 1 ? 'bold' : 'normal');
    doc.setFontSize(7.8);
    doc.setTextColor(30, 41, 59);
    doc.text(item.label, marginX + 3, ry);

    const barX = marginX + 64;
    const barMaxW = contentWidth - 88;
    doc.setFillColor(226, 232, 240);
    doc.roundedRect(barX, ry - 3, barMaxW, 3.6, 1, 1, 'F');

    const fillW = Math.max(2, Math.min(barMaxW, (item.pct / 100) * barMaxW));
    doc.setFillColor(item.color[0], item.color[1], item.color[2]);
    doc.roundedRect(barX, ry - 3, fillW, 3.6, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    const valStr = i === losses.length - 1 ? `${item.pct.toFixed(1)}%` : `-${item.pct.toFixed(1)}%`;
    doc.text(valStr, marginX + contentWidth - 3, ry, { align: 'right' });
  });
  y += boxHeight + 6;

  // Section 3: Modeled 3D Obstacles Table (Complete, Multi-Page Safe)
  y = ensureSpace(doc, y, 28, pageHeight, marginX, pageWidth, contTitle, contSub);
  y = drawSectionHeader(doc, `3. AutoCAD 3D Shading Obstacles (${data.obstacles.length})`, y, marginX, contentWidth);

  if (data.obstacles.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('No surrounding 3D shading obstacles recorded on site.', marginX + 2, y + 3);
    y += 9;
  } else {
    const obsCols = [0.3, 0.16, 0.22, 0.16, 0.16];
    const obsHeaders = ['Obstacle Structure', 'Category', 'Dimensions (H×W×D)', 'Distance', 'Bearing'];

    const drawObsHeader = (curY: number) => {
      doc.setFillColor(30, 41, 59);
      doc.rect(marginX, curY, contentWidth, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(255, 255, 255);
      let ox = marginX;
      obsHeaders.forEach((h, i) => {
        const w = contentWidth * obsCols[i];
        doc.text(h, i >= 3 ? ox + w - 2.2 : ox + 2.2, curY + 4.5, { align: i >= 3 ? 'right' : 'left' });
        ox += w;
      });
      return curY + 6.5;
    };

    y = drawObsHeader(y);

    data.obstacles.forEach((obs, idx) => {
      const nameLines = doc.splitTextToSize(obs.name, contentWidth * obsCols[0] - 4);
      const rowH = Math.max(7, nameLines.length * 3.8 + 3);
      if (y + rowH > pageHeight - 17) {
        doc.addPage();
        drawContinuationHeader(doc, contTitle, contSub, marginX, pageWidth);
        y = drawObsHeader(21);
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(marginX, y, contentWidth, rowH, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

      let ox = marginX;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      doc.setTextColor(15, 23, 42);
      doc.text(nameLines, ox + 2.2, y + 4.4);
      ox += contentWidth * obsCols[0];

      doc.setFont('helvetica', 'normal');
      doc.text(obs.category, ox + 2.2, y + 4.4);
      ox += contentWidth * obsCols[1];

      doc.text(`${obs.heightM}m × ${obs.widthM}m × ${obs.depthM}m`, ox + 2.2, y + 4.4);
      ox += contentWidth * obsCols[2];

      doc.text(`${obs.distanceM} m`, ox + contentWidth * obsCols[3] - 2.2, y + 4.4, { align: 'right' });
      ox += contentWidth * obsCols[3];

      doc.text(`${obs.bearingDeg}°`, ox + contentWidth * obsCols[4] - 2.2, y + 4.4, { align: 'right' });

      y += rowH;
    });
    y += 5;
  }

  // Section 4: Engineering QA/QC Inspection Matrix
  y = ensureSpace(doc, y, 36, pageHeight, marginX, pageWidth, contTitle, contSub);
  y = drawSectionHeader(
    doc,
    `4. Engineering Inspection Sign-Off Matrix (${passedCount}/${data.checklist.length} Passed)`,
    y,
    marginX,
    contentWidth
  );

  const chkCols = [0.12, 0.36, 0.38, 0.14];
  const chkHeaders = ['Code', 'Inspection Requirement', 'Measured Evidence / Detail', 'Result'];
  const drawChkHeader = (curY: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(marginX, curY, contentWidth, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    let cx = marginX;
    chkHeaders.forEach((h, i) => {
      const w = contentWidth * chkCols[i];
      doc.text(h, cx + 2.2, curY + 4.5);
      cx += w;
    });
    return curY + 6.5;
  };
  y = drawChkHeader(y);

  data.checklist.forEach((chk, idx) => {
    const lblLines = doc.splitTextToSize(chk.label, contentWidth * chkCols[1] - 4);
    const detLines = doc.splitTextToSize(chk.autoDetail, contentWidth * chkCols[2] - 4);
    const lineCount = Math.max(lblLines.length, detLines.length, 1);
    const rowH = Math.max(8, lineCount * 3.8 + 3.2);
    if (y + rowH > pageHeight - 17) {
      doc.addPage();
      drawContinuationHeader(doc, contTitle, contSub, marginX, pageWidth);
      y = drawChkHeader(21);
    }
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, y, contentWidth, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, y + rowH, marginX + contentWidth, y + rowH);

    let cx = marginX;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.3);
    doc.setTextColor(71, 85, 105);
    doc.text(chk.code, cx + 2.2, y + 4.6);
    cx += contentWidth * chkCols[0];

    doc.setTextColor(15, 23, 42);
    doc.text(lblLines, cx + 2.2, y + 4.5);
    cx += contentWidth * chkCols[1];

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    doc.text(detLines, cx + 2.2, y + 4.5);
    cx += contentWidth * chkCols[2];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(chk.passed ? 5 : 217, chk.passed ? 150 : 119, chk.passed ? 105 : 6);
    doc.text(chk.passed ? 'PASS' : 'REVIEW', cx + 2.2, y + 4.6);

    y += rowH;
  });

  // Final Inspector Remarks & Sign-off Box
  y += 5;
  const signOffNeed = (data.summaryRemarks?.trim() ? 16 : 0) + 28;
  y = ensureSpace(doc, y, signOffNeed, pageHeight, marginX, pageWidth, contTitle, contSub);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(marginX, y, contentWidth, signOffNeed - 4, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('SURVEY COMPLETION & HANDOVER SIGN-OFF', marginX + 3, y + 5.5);

  let noteOffset = y + 10.5;
  if (data.summaryRemarks?.trim()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(71, 85, 105);
    const remLines = doc.splitTextToSize(`Remarks: ${data.summaryRemarks.trim()}`, contentWidth - 6);
    doc.text(remLines.slice(0, 2), marginX + 3, noteOffset);
    noteOffset += remLines.slice(0, 2).length * 4 + 2;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Lead Solar Inspector: ${data.inspectorName || 'Site Engineer'}  |  Status: ${data.status}${
      data.completedAtIso ? ` (${new Date(data.completedAtIso).toLocaleDateString()})` : ''
    }`,
    marginX + 3,
    noteOffset + 6
  );

  applyPageFooters(doc, marginX, pageWidth, pageHeight, data.surveyId);

  if (data.outputMode === 'blob') {
    return doc.output('blob');
  }

  const safeCity = (data.siteLocationName || 'solar_survey').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  doc.save(`${safeCity}_pvsyst_report.pdf`);
}

function escapeHtml(raw: string | number | undefined | null): string {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerSameOriginIframePrint(htmlDocument: string): boolean {
  try {
    const existing = document.getElementById('__solar_print_frame__');
    if (existing) existing.remove();

    const iframe = document.createElement('iframe');
    iframe.id = '__solar_print_frame__';
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.visibility = 'hidden';
    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    const frameWin = iframe.contentWindow;
    if (!frameDoc || !frameWin) {
      iframe.remove();
      return false;
    }

    frameDoc.open();
    frameDoc.write(htmlDocument);
    frameDoc.close();

    setTimeout(() => {
      try {
        frameWin.focus();
        frameWin.print();
      } catch {
        // Ignore browser sandbox print restriction cleanly
      } finally {
        setTimeout(() => iframe.remove(), 60000);
      }
    }, 120);
    return true;
  } catch {
    return false;
  }
}

export function printEstimatorProposalSheet(data: EstimatorPdfReportData): boolean {
  const opts = data.exportOptions || {};
  const tariffIncPct = data.expectedTariffIncreasePct ?? 2.5;
  const maintPct = data.maintenanceCostPct ?? 1.0;
  const roiModel = calculate25YearSensitivityRoi({
    installationCost: data.grossCost,
    subsidyAmount: data.governmentSubsidy,
    annualSavings: data.annualSavings,
    expectedTariffIncreasePct: tariffIncPct,
    maintenanceCostPct: maintPct,
    includeInverterReplacement: true,
  });

  const milestones = roiModel.chartData.filter((r) => [1, 2, 3, 5, 10, 15, 20, 25].includes(r.year));
  const bomHtml = (opts.includeBom ?? true) && data.bomItems && data.bomItems.length > 0
    ? `
      <h2>Bill of Materials (BOM)</h2>
      <table>
        <thead><tr><th>Category</th><th>Component &amp; Specification</th><th>Qty</th><th>Status</th></tr></thead>
        <tbody>
          ${data.bomItems
            .map(
              (item) => `<tr>
                <td><strong>${escapeHtml(item.category)}</strong></td>
                <td>${escapeHtml(item.name)} — ${escapeHtml(item.specification)}</td>
                <td>${escapeHtml(item.quantity)}</td>
                <td>${escapeHtml(item.status)}</td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `
    : '';

  const cashflowHtml = (opts.includeCashflowChart ?? true)
    ? `
      <h2>25-Year Cumulative Cashflow Milestones</h2>
      <table>
        <thead><tr><th>Year</th><th class="r">Gross Gain</th><th class="r">O&amp;M</th><th class="r">Cum. Net Cash</th><th class="r">Net Position</th></tr></thead>
        <tbody>
          ${milestones
            .map(
              (r) => `<tr>
                <td>Yr ${r.year}</td>
                <td class="r">${escapeHtml(fmtCurrency(r.grossAnnualSavings, data.currency))}</td>
                <td class="r">${escapeHtml(fmtCurrency(r.maintenanceCost, data.currency))}</td>
                <td class="r">${escapeHtml(fmtCurrency(r.cumulativeSavings, data.currency))}</td>
                <td class="r"><strong>${r.netCashFlow >= 0 ? '+' : ''}${escapeHtml(fmtCurrency(r.netCashFlow, data.currency))}</strong></td>
              </tr>`
            )
            .join('')}
        </tbody>
      </table>
    `
    : '';

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Solar Proposal - ${escapeHtml(data.locationName)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; line-height: 1.45; }
  .banner { background: #0f172a; color: #fff; padding: 14px 16px; border-bottom: 4px solid #ff6f00; border-radius: 6px; margin-bottom: 14px; }
  .banner h1 { margin: 0 0 4px; font-size: 17px; }
  .banner p { margin: 2px 0; font-size: 10.5px; color: #cbd5e1; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 10px; }
  .kpi .lbl { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
  .kpi .val { font-size: 14px; font-weight: bold; color: #0f172a; margin: 3px 0; }
  .kpi .sub { font-size: 9.5px; color: #475569; }
  h2 { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; background: #f1f5f9; border-left: 4px solid #ff6f00; padding: 5px 8px; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; }
  th { background: #1e293b; color: #fff; font-weight: bold; }
  .r { text-align: right; }
  .notes { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px 10px; margin-top: 8px; font-size: 10px; }
</style>
</head>
<body>
  <div class="banner">
    <h1>Solar System Engineering &amp; Financial Proposal</h1>
    <p>Site: ${escapeHtml(data.locationName)} (${data.latitude.toFixed(4)}, ${data.longitude.toFixed(4)}) | Ref: ${escapeHtml(opts.quoteRef || 'SOL-QUOTE')}</p>
    <p>Standard: ${data.moduleStandard === 'DCR' ? 'DCR ALMM' : 'Non-DCR'} | Architecture: ${escapeHtml((data.systemType || 'on-grid').toUpperCase())} | Prepared For: ${escapeHtml(opts.customerName || 'Client')}</p>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="lbl">System Size</div><div class="val">${data.systemKw} kW</div><div class="sub">${data.panelWattage}W × ${data.panelCount} Panels</div></div>
    <div class="kpi"><div class="lbl">Inverter &amp; Phase</div><div class="val">${escapeHtml(data.inverterPowerKw || data.systemKw)} kW</div><div class="sub">${data.phaseType === 'three_phase' ? '3-Phase 415V' : '1-Phase 230V'}</div></div>
    <div class="kpi"><div class="lbl">Net Payable</div><div class="val">${escapeHtml(fmtCurrency(data.netPayable, data.currency))}</div><div class="sub">Subsidy: ${escapeHtml(fmtCurrency(data.governmentSubsidy, data.currency))}</div></div>
    <div class="kpi"><div class="lbl">Payback / 25-Yr</div><div class="val">${roiModel.breakEvenBeyondHorizon ? '25+' : roiModel.breakEvenYear} Yrs</div><div class="sub">${escapeHtml(fmtCurrency(roiModel.lifetimeCumulativeSavings, data.currency))}</div></div>
  </div>
  <h2>System, Cost &amp; Yield Summary</h2>
  <table>
    <tbody>
      <tr><td>Inverter Selection</td><td class="r"><strong>${escapeHtml(data.inverterLabel || `${data.inverterBrand || 'Recommended'} ${data.inverterPowerKw || data.systemKw} kW`)}</strong></td></tr>
      <tr><td>Estimated Solar Generation</td><td class="r"><strong>${data.estimatedMonthlyGenKwh.toLocaleString()} kWh/mo (${(data.estimatedMonthlyGenKwh * 12).toLocaleString()} kWh/yr)</strong></td></tr>
      <tr><td>Gross Capex / Subsidy / Net</td><td class="r">${escapeHtml(fmtCurrency(data.grossCost, data.currency))} / -${escapeHtml(fmtCurrency(data.governmentSubsidy, data.currency))} / <strong>${escapeHtml(fmtCurrency(data.netPayable, data.currency))}</strong></td></tr>
      <tr><td>Estimated Year-1 Savings</td><td class="r"><strong>${escapeHtml(fmtCurrency(data.monthlySavings, data.currency))}/mo (${escapeHtml(fmtCurrency(data.annualSavings, data.currency))}/yr)</strong></td></tr>
    </tbody>
  </table>
  ${cashflowHtml}
  ${bomHtml}
  ${opts.projectNotes?.trim() ? `<div class="notes"><strong>Engineering Notes:</strong> ${escapeHtml(opts.projectNotes.trim())}</div>` : ''}
</body>
</html>`;

  return triggerSameOriginIframePrint(html);
}

export function printSiteSurveyAuditSheet(data: SiteSurveyPdfReportData): boolean {
  const passedCount = data.checklist.filter((c) => c.passed).length;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Site Survey & PVsyst Audit - ${escapeHtml(data.projectTitle || data.siteLocationName)}</title>
<style>
  @page { size: A4 portrait; margin: 14mm; }
  body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; margin: 0; font-size: 11px; line-height: 1.45; }
  .banner { background: #0f172a; color: #fff; padding: 14px 16px; border-bottom: 4px solid #ff6f00; border-radius: 6px; margin-bottom: 14px; }
  .banner h1 { margin: 0 0 4px; font-size: 16px; }
  .banner p { margin: 2px 0; font-size: 10px; color: #cbd5e1; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 14px; }
  .kpi { border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 6px; padding: 8px 10px; }
  .kpi .lbl { font-size: 9px; font-weight: bold; color: #64748b; text-transform: uppercase; }
  .kpi .val { font-size: 14px; font-weight: bold; color: #0f172a; margin: 3px 0; }
  .kpi .sub { font-size: 9.5px; color: #475569; }
  h2 { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.4px; background: #f1f5f9; border-left: 4px solid #ff6f00; padding: 5px 8px; margin: 12px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; font-size: 10px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; text-align: left; }
  th { background: #1e293b; color: #fff; font-weight: bold; }
  .r { text-align: right; }
</style>
</head>
<body>
  <div class="banner">
    <h1>Solar Site Survey, AutoCAD 3D &amp; PVsyst Audit Report</h1>
    <p>Project: ${escapeHtml(data.projectTitle || data.siteLocationName)} | Survey ID: ${escapeHtml(data.surveyId)} | Status: ${escapeHtml(data.status.toUpperCase())}</p>
    <p>GPS: ${data.latitude.toFixed(5)}N, ${data.longitude.toFixed(5)}E | Elev: ${data.elevationM}m | Inspector: ${escapeHtml(data.inspectorName)}</p>
  </div>
  <div class="kpis">
    <div class="kpi"><div class="lbl">Annual GHI</div><div class="val">${data.annualGhiKwhM2}</div><div class="sub">Unshaded POA: ${data.annualPoaUnshadedKwhM2}</div></div>
    <div class="kpi"><div class="lbl">Effective POA</div><div class="val">${data.effectivePoaKwhM2}</div><div class="sub">kWh/m2/yr post-shade</div></div>
    <div class="kpi"><div class="lbl">Shade Retention</div><div class="val">${data.shadingRetentionPct}%</div><div class="sub">Near Shade: -${data.nearShadeLossPct}%</div></div>
    <div class="kpi"><div class="lbl">QA Inspection</div><div class="val">${passedCount}/${data.checklist.length}</div><div class="sub">Walkways: ${data.walkwayAislesCount} aisles</div></div>
  </div>
  <h2>Field Measurements &amp; AutoCAD 3D Array</h2>
  <table>
    <tbody>
      <tr><td>Roof Dimensions &amp; Parapet</td><td class="r">${data.roofLengthM}m × ${data.roofWidthM}m | Parapet ${data.parapetHeightM}m | MMS ${data.mmsClearanceM}m</td></tr>
      <tr><td>O&amp;M Walkways &amp; Edge Setback</td><td class="r">${data.walkwayAislesCount} aisles @ ${data.walkwayWidthM}m | Setback ${data.perimeterSetbackM}m</td></tr>
      <tr><td>Array Tilt, Azimuth &amp; GCR</td><td class="r">Tilt ${data.tiltDeg}° | Azimuth ${data.azimuthCompassDeg}° | ${data.numRows} rows × ${data.arrayWidthM}m | GCR ${(data.gcr * 100).toFixed(0)}%</td></tr>
    </tbody>
  </table>
  <h2>Modeled 3D Obstacles (${data.obstacles.length})</h2>
  <table>
    <thead><tr><th>Obstacle</th><th>Category</th><th>H × W × D</th><th class="r">Dist</th><th class="r">Bearing</th></tr></thead>
    <tbody>
      ${data.obstacles
        .map(
          (obs) => `<tr>
            <td><strong>${escapeHtml(obs.name)}</strong></td>
            <td>${escapeHtml(obs.category)}</td>
            <td>${obs.heightM}m × ${obs.widthM}m × ${obs.depthM}m</td>
            <td class="r">${obs.distanceM} m</td>
            <td class="r">${obs.bearingDeg}°</td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table>
  <h2>QA/QC Inspection Matrix</h2>
  <table>
    <thead><tr><th>Code</th><th>Requirement</th><th>Measured Evidence</th><th>Result</th></tr></thead>
    <tbody>
      ${data.checklist
        .map(
          (c) => `<tr>
            <td>${escapeHtml(c.code)}</td>
            <td>${escapeHtml(c.label)}</td>
            <td>${escapeHtml(c.autoDetail)}</td>
            <td><strong>${c.passed ? 'PASS' : 'REVIEW'}</strong></td>
          </tr>`
        )
        .join('')}
    </tbody>
  </table>
</body>
</html>`;

  return triggerSameOriginIframePrint(html);
}
