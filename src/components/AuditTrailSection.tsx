import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AccountCorrectionFactor, EstimatorInputs, MonthlyBillRecord } from '../types/solar';
import {
  FourStateId,
  computeBaseDiscomSlabBill,
  computeCorrectionFactorFromVariance,
  computeExactDiscomBill,
  getCorrectionFactorForAccount,
  removeCorrectionFactorForAccount,
  setCorrectionFactorForAccount,
} from '../data/uscPortals';
import { RealtimeTariffSyncResult } from '../services/tariffService';
import { selectLatestBilledMonths } from '../utils/monthlyAverage';

interface ManualAuditEntry {
  id: string;
  month: string;
  unitsKwh: number;
  billAmountInr: number;
}

interface AuditTrailSectionProps {
  inputs: EstimatorInputs;
  liveTariff: RealtimeTariffSyncResult | null;
  onSyncTariff?: () => void;
  isSyncingTariff?: boolean;
  onCalibrateFromAudit?: (avgUnits: number, avgBill: number, blendedTariff: number) => void;
  onCorrectionFactorChanged?: (record: AccountCorrectionFactor | null) => void;
}

const AUDIT_STORAGE_KEY = 'solar_audit_manual_bills_v1';

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function resolveFourStateId(inputs: EstimatorInputs, liveTariff: RealtimeTariffSyncResult | null): FourStateId {
  if (liveTariff?.stateId) return liveTariff.stateId;
  const st = (inputs.uscStateId || inputs.state || '').toLowerCase();
  if (st.includes('andhra')) return 'andhra_pradesh';
  if (st.includes('odis') || st.includes('oris')) return 'odissa';
  if (st.includes('chandigarh')) return 'chandigarh';
  return 'telangana';
}

export const AuditTrailSection: React.FC<AuditTrailSectionProps> = ({
  inputs,
  liveTariff,
  onSyncTariff,
  isSyncingTariff = false,
  onCalibrateFromAudit,
  onCorrectionFactorChanged,
}) => {
  const [manualEntries, setManualEntries] = useState<ManualAuditEntry[]>(() => {
    try {
      const saved = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(manualEntries));
    } catch {}
  }, [manualEntries]);

  const stateId = resolveFourStateId(inputs, liveTariff);
  const gridCategory =
    inputs.consumerCategory === 'commercial' ? 'commercial' : 'domestic';
  const sanctionedLoadKw = Math.max(1, inputs.sanctionedLoadKw || 2);

  const effectiveUscKey = (inputs.uscNumber || '').trim();
  const displayAccountKey = effectiveUscKey || 'DEFAULT-METER';

  const [factorVersion, setFactorVersion] = useState<number>(0);
  const storedCorrection = useMemo(
    () => getCorrectionFactorForAccount(effectiveUscKey || displayAccountKey),
    [effectiveUscKey, displayAccountKey, factorVersion]
  );

  const [factorDraft, setFactorDraft] = useState<string>(() =>
    String(storedCorrection?.factor ?? 1.0)
  );
  const [offsetDraft, setOffsetDraft] = useState<string>(() =>
    String(storedCorrection?.fixedOffsetInr ?? 0)
  );
  const [factorNotice, setFactorNotice] = useState<string | null>(null);

  useEffect(() => {
    setFactorDraft(String(storedCorrection?.factor ?? 1.0));
    setOffsetDraft(String(storedCorrection?.fixedOffsetInr ?? 0));
  }, [storedCorrection?.accountKey, storedCorrection?.factor, storedCorrection?.fixedOffsetInr]);

  const activeFactor = storedCorrection?.factor ?? 1.0;
  const activeOffset = storedCorrection?.fixedOffsetInr ?? 0;

  const now = new Date();
  const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [newMonthYm, setNewMonthYm] = useState<string>(defaultYm);
  const [newUnitsStr, setNewUnitsStr] = useState<string>(String(Math.round(inputs.monthlyUnits || 420)));
  const [newBillStr, setNewBillStr] = useState<string>(
    String(
      Math.round(
        inputs.monthlyBill ||
          computeExactDiscomBill(
            inputs.monthlyUnits || 420,
            stateId,
            gridCategory,
            sanctionedLoadKw,
            {
              accountNumber: effectiveUscKey || displayAccountKey,
              correctionFactor: activeFactor,
              fixedOffsetInr: activeOffset,
            }
          )
      )
    )
  );
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [calibratedNotice, setCalibratedNotice] = useState<boolean>(false);

  const auditSourceRows: {
    id: string;
    month: string;
    actualUnits: number;
    actualBill: number;
    origin: 'manual' | 'portal';
  }[] = useMemo(() => {
    const map = new Map<
      string,
      { id: string; month: string; actualUnits: number; actualBill: number; origin: 'manual' | 'portal' }
    >();

    if (Array.isArray(inputs.monthlyHistory12) && inputs.monthlyHistory12.length > 0) {
      selectLatestBilledMonths(inputs.monthlyHistory12).forEach((row: MonthlyBillRecord, idx: number) => {
        map.set(row.month.toLowerCase(), {
          id: `portal-${idx}-${row.month}`,
          month: row.month,
          actualUnits: Math.round(row.unitsKwh || 0),
          actualBill: Math.round(row.billAmountInr || 0),
          origin: 'portal',
        });
      });
    }

    manualEntries.forEach((m) => {
      map.set(m.month.toLowerCase(), {
        id: m.id,
        month: m.month,
        actualUnits: Math.round(m.unitsKwh),
        actualBill: Math.round(m.billAmountInr),
        origin: 'manual',
      });
    });

    if (map.size === 0) {
      const mName = `${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
      const u = Math.max(50, Math.round(inputs.monthlyUnits || 420));
      const b = Math.max(
        100,
        Math.round(
          inputs.monthlyBill ||
            computeExactDiscomBill(u, stateId, gridCategory, sanctionedLoadKw, {
              accountNumber: effectiveUscKey || displayAccountKey,
              correctionFactor: activeFactor,
              fixedOffsetInr: activeOffset,
            })
        )
      );
      map.set(mName.toLowerCase(), {
        id: 'current-baseline',
        month: mName,
        actualUnits: u,
        actualBill: b,
        origin: 'manual',
      });
    }

    return Array.from(map.values());
  }, [
    inputs.monthlyHistory12,
    inputs.monthlyUnits,
    inputs.monthlyBill,
    stateId,
    gridCategory,
    sanctionedLoadKw,
    effectiveUscKey,
    displayAccountKey,
    activeFactor,
    activeOffset,
    manualEntries,
  ]);

  const empiricalVariance = useMemo(
    () =>
      computeCorrectionFactorFromVariance(
        auditSourceRows.map((r) => ({ unitsKwh: r.actualUnits, billAmountInr: r.actualBill })),
        stateId,
        gridCategory,
        sanctionedLoadKw
      ),
    [auditSourceRows, stateId, gridCategory, sanctionedLoadKw]
  );

  const evaluatedRows = useMemo(() => {
    const baselineUnits = Math.max(1, Math.round(inputs.monthlyUnits || 420));
    const flatRate = liveTariff?.blendedRatePerKwh || inputs.tariffPerKwh || 7.15;

    return auditSourceRows.map((row) => {
      const baseSlabBill = computeBaseDiscomSlabBill(
        row.actualUnits,
        stateId,
        gridCategory,
        sanctionedLoadKw
      );
      const slabEstimateForActualUnits = computeExactDiscomBill(
        row.actualUnits,
        stateId,
        gridCategory,
        sanctionedLoadKw,
        {
          accountNumber: effectiveUscKey || displayAccountKey,
          correctionFactor: activeFactor,
          fixedOffsetInr: activeOffset,
        }
      );
      const estimatorMonthlyEstimate = Math.round(baselineUnits * flatRate);
      const billDeltaInr = row.actualBill - slabEstimateForActualUnits;
      const billVariancePct =
        slabEstimateForActualUnits > 0
          ? Number(((billDeltaInr / slabEstimateForActualUnits) * 100).toFixed(1))
          : 0;
      const unitsDeltaKwh = row.actualUnits - baselineUnits;
      const unitsVariancePct =
        baselineUnits > 0
          ? Number(((unitsDeltaKwh / baselineUnits) * 100).toFixed(1))
          : 0;

      const maxAbsPct = Math.max(Math.abs(billVariancePct), Math.abs(unitsVariancePct));
      const status: 'match' | 'minor' | 'high' =
        maxAbsPct > 15 ? 'high' : maxAbsPct > 5 ? 'minor' : 'match';

      return {
        ...row,
        baseSlabBill,
        slabEstimateForActualUnits,
        estimatorMonthlyEstimate,
        billDeltaInr,
        billVariancePct,
        unitsDeltaKwh,
        unitsVariancePct,
        status,
      };
    });
  }, [
    auditSourceRows,
    inputs.monthlyUnits,
    inputs.tariffPerKwh,
    liveTariff,
    stateId,
    gridCategory,
    sanctionedLoadKw,
    effectiveUscKey,
    displayAccountKey,
    activeFactor,
    activeOffset,
  ]);

  const totals = useMemo(() => {
    const count = Math.max(1, evaluatedRows.length);
    const avgActualUnits = Math.round(
      evaluatedRows.reduce((s, r) => s + r.actualUnits, 0) / count
    );
    const avgActualBill = Math.round(
      evaluatedRows.reduce((s, r) => s + r.actualBill, 0) / count
    );
    const avgCalculatedSlabBill = Math.round(
      evaluatedRows.reduce((s, r) => s + r.slabEstimateForActualUnits, 0) / count
    );
    const avgBaseSlabBill = Math.round(
      evaluatedRows.reduce((s, r) => s + r.baseSlabBill, 0) / count
    );
    const avgUnitsDelta = Math.round(
      evaluatedRows.reduce((s, r) => s + r.unitsDeltaKwh, 0) / count
    );
    const avgBillDelta = avgActualBill - avgCalculatedSlabBill;
    const avgBillPct =
      avgCalculatedSlabBill > 0
        ? Number(((avgBillDelta / avgCalculatedSlabBill) * 100).toFixed(1))
        : 0;
    const flaggedCount = evaluatedRows.filter((r) => r.status !== 'match').length;
    return {
      count: evaluatedRows.length,
      avgActualUnits,
      avgActualBill,
      avgBaseSlabBill,
      avgCalculatedSlabBill,
      avgUnitsDelta,
      avgBillDelta,
      avgBillPct,
      flaggedCount,
    };
  }, [evaluatedRows]);

  const handleSaveCustomFactor = (
    nextFactor: number,
    nextOffset: number,
    noteText?: string
  ) => {
    const clampedFactor = Number(
      Math.max(0.5, Math.min(2.0, Number.isFinite(nextFactor) ? nextFactor : 1.0)).toFixed(4)
    );
    const cleanOffset = Math.round(Number.isFinite(nextOffset) ? nextOffset : 0);
    const saved = setCorrectionFactorForAccount({
      uscNumber: effectiveUscKey || displayAccountKey,
      factor: clampedFactor,
      fixedOffsetInr: cleanOffset,
      sampleMonthsCount: totals.count,
      avgVariancePct: empiricalVariance.avgVariancePct,
      note: noteText || `Calibrated from ${totals.count} historical bill(s)`,
    });
    setFactorDraft(String(clampedFactor));
    setOffsetDraft(String(cleanOffset));
    setFactorVersion((v) => v + 1);
    onCorrectionFactorChanged?.(saved);
    setFactorNotice(
      `Saved ${clampedFactor.toFixed(2)}x${cleanOffset !== 0 ? ` + ₹${cleanOffset}` : ''} for ${
        effectiveUscKey ? `USC #${effectiveUscKey}` : 'Meter'
      }`
    );
    setTimeout(() => setFactorNotice(null), 3000);
  };

  const handleAutoCalibrateFactor = () => {
    handleSaveCustomFactor(
      empiricalVariance.factor,
      0,
      `Auto-calibrated from ${empiricalVariance.sampleMonthsCount}-mo variance (${empiricalVariance.avgVariancePct >= 0 ? '+' : ''}${empiricalVariance.avgVariancePct}%)`
    );
  };

  const handleResetCorrectionFactor = () => {
    removeCorrectionFactorForAccount(effectiveUscKey || displayAccountKey);
    setFactorDraft('1');
    setOffsetDraft('0');
    setFactorVersion((v) => v + 1);
    onCorrectionFactorChanged?.(null);
    setFactorNotice('Correction factor reset to 1.00x (Base Regulatory Slabs)');
    setTimeout(() => setFactorNotice(null), 3000);
  };

  const handleAddManualRow = (e: React.FormEvent) => {
    e.preventDefault();
    const m = newMonthYm.match(/^(\d{4})-(\d{2})$/);
    const monthLabel = m
      ? `${MONTHS_SHORT[Math.max(0, Math.min(11, parseInt(m[2], 10) - 1))]} ${m[1]}`
      : `${MONTHS_SHORT[now.getMonth()]} ${now.getFullYear()}`;
    const units = Math.max(1, Math.round(Number(newUnitsStr) || 0));
    const bill = Math.max(1, Math.round(Number(newBillStr) || 0));

    setManualEntries((prev) => {
      const filtered = prev.filter((item) => item.month.toLowerCase() !== monthLabel.toLowerCase());
      return [
        {
          id: `manual-${Date.now()}`,
          month: monthLabel,
          unitsKwh: units,
          billAmountInr: bill,
        },
        ...filtered,
      ];
    });
    setIsAddOpen(false);
  };

  const handleDeleteManual = (id: string) => {
    setManualEntries((prev) => prev.filter((item) => item.id !== id));
  };

  const handleApplyCalibration = () => {
    if (!onCalibrateFromAudit) return;
    const blended =
      totals.avgActualUnits > 0
        ? Number((totals.avgActualBill / totals.avgActualUnits).toFixed(2))
        : liveTariff?.blendedRatePerKwh || inputs.tariffPerKwh || 7.15;
    onCalibrateFromAudit(totals.avgActualUnits, totals.avgActualBill, blended);
    setCalibratedNotice(true);
    setTimeout(() => setCalibratedNotice(false), 3000);
  };

  const hasCustomCorrection =
    Math.abs(activeFactor - 1) > 0.0005 || activeOffset !== 0;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[26px] p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3">
      {/* Header & Live Regulatory Tariff Banner */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/70 dark:border-amber-900/50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-4.5 h-4.5 text-[#FF6F00]" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
              Audit Trail · Bill vs Estimator
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {liveTariff
                ? `${liveTariff.providerShortName} (${liveTariff.regulatorName}) · ₹${liveTariff.blendedRatePerKwh}/kWh`
                : `${inputs.discom || 'Local DISCOM'} · ₹${inputs.tariffPerKwh}/kWh`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onSyncTariff && (
            <button
              type="button"
              onClick={onSyncTariff}
              disabled={isSyncingTariff}
              title="Re-sync local government electricity tariff"
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingTariff ? 'animate-spin' : ''}`} />
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsAddOpen((prev) => !prev)}
            className="px-2.5 py-1.5 rounded-xl bg-[#FF6F00] hover:bg-[#e66400] text-white text-[11px] font-bold inline-flex items-center gap-1 transition cursor-pointer shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Bill</span>
          </button>
        </div>
      </div>

      {/* KPI Variance Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            {hasCustomCorrection ? 'Corrected Est' : 'Slab Calc Avg'}
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
            ₹{totals.avgCalculatedSlabBill.toLocaleString('en-IN')}
          </div>
          <div className="text-[9.5px] text-slate-400">
            {hasCustomCorrection
              ? `Base ₹${totals.avgBaseSlabBill.toLocaleString('en-IN')}`
              : `${totals.avgActualUnits} kWh/mo`}
          </div>
        </div>

        <div className="rounded-xl bg-[#F8FAFC] dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/70 p-2.5">
          <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            Entered Actual
          </div>
          <div className="text-sm font-extrabold text-slate-900 dark:text-white mt-0.5">
            ₹{totals.avgActualBill.toLocaleString('en-IN')}
          </div>
          <div
            className={`text-[9.5px] font-bold ${
              totals.avgUnitsDelta === 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {totals.avgUnitsDelta >= 0 ? `+${totals.avgUnitsDelta}` : totals.avgUnitsDelta} kWh vs est
          </div>
        </div>

        <div
          className={`rounded-xl border p-2.5 ${
            totals.flaggedCount > 0
              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50'
              : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/50'
          }`}
        >
          <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
            Discrepancy
          </div>
          <div
            className={`text-sm font-extrabold mt-0.5 ${
              Math.abs(totals.avgBillPct) > 5
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {totals.avgBillDelta >= 0 ? `+₹${totals.avgBillDelta}` : `-₹${Math.abs(totals.avgBillDelta)}`}
          </div>
          <div className="text-[9.5px] font-semibold text-slate-500 dark:text-slate-400">
            {totals.flaggedCount} flagged ({totals.avgBillPct >= 0 ? '+' : ''}
            {totals.avgBillPct}%)
          </div>
        </div>
      </div>

      {/* Per-USC Correction Factor Calibration Control */}
      <div className="rounded-2xl bg-sky-50/80 dark:bg-sky-950/25 border border-sky-200/80 dark:border-sky-900/50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 min-w-0">
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-[11px] font-extrabold text-slate-900 dark:text-white truncate">
              Correction Factor · {effectiveUscKey ? `USC #${effectiveUscKey}` : 'Active Meter'}
            </span>
          </div>
          <span
            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
              hasCustomCorrection
                ? 'bg-[#FF6F00] text-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
            }`}
          >
            {activeFactor.toFixed(2)}x{activeOffset !== 0 ? ` ${activeOffset >= 0 ? '+' : '-'} ₹${Math.abs(activeOffset)}` : ''}
          </span>
        </div>

        <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-snug">
          Adjusts DISCOM slab math for meter-specific fixed surcharges, FPPCA/true-up levies, or historical variance on this USC account.
        </p>

        <div className="grid grid-cols-12 gap-1.5 items-end">
          <div className="col-span-4">
            <label className="block text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
              Factor (0.50–2.00)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.5"
              max="2.0"
              value={factorDraft}
              onChange={(e) => setFactorDraft(e.target.value)}
              className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div className="col-span-4">
            <label className="block text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
              Fixed Offset (₹)
            </label>
            <input
              type="number"
              step="10"
              value={offsetDraft}
              onChange={(e) => setOffsetDraft(e.target.value)}
              placeholder="0"
              className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white"
            />
          </div>
          <div className="col-span-4 flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                handleSaveCustomFactor(
                  parseFloat(factorDraft) || 1.0,
                  parseFloat(offsetDraft) || 0
                )
              }
              className="flex-1 py-1.5 px-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-[10.5px] font-bold transition cursor-pointer"
            >
              Apply
            </button>
            {hasCustomCorrection && (
              <button
                type="button"
                onClick={handleResetCorrectionFactor}
                title="Reset Correction Factor to 1.00x"
                className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-500 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            Empirical ratio: <strong>{empiricalVariance.factor.toFixed(2)}x</strong> ({empiricalVariance.avgVariancePct >= 0 ? '+' : ''}
            {empiricalVariance.avgVariancePct}% over {empiricalVariance.sampleMonthsCount} mo)
          </span>
          <button
            type="button"
            onClick={handleAutoCalibrateFactor}
            className="px-2.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-[10.5px] font-extrabold inline-flex items-center gap-1 transition cursor-pointer shrink-0"
          >
            <Sparkles className="w-3 h-3" />
            <span>Auto-Calibrate ({empiricalVariance.factor.toFixed(2)}x)</span>
          </button>
        </div>

        {factorNotice && (
          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg px-2.5 py-1">
            {factorNotice}
          </div>
        )}
      </div>

      {/* Add Manual Historical Bill Entry Form */}
      {isAddOpen && (
        <form
          onSubmit={handleAddManualRow}
          className="rounded-2xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/50 p-3 space-y-2.5"
        >
          <div className="text-[11px] font-extrabold text-amber-950 dark:text-amber-200">
            Enter Historical Monthly Paper Bill for Audit Comparison
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                Billing Month
              </label>
              <input
                type="month"
                value={newMonthYm}
                onChange={(e) => setNewMonthYm(e.target.value)}
                required
                className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                Units (kWh)
              </label>
              <input
                type="number"
                min="1"
                value={newUnitsStr}
                onChange={(e) => setNewUnitsStr(e.target.value)}
                required
                className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 mb-0.5">
                Paid Bill (₹)
              </label>
              <input
                type="number"
                min="1"
                value={newBillStr}
                onChange={(e) => setNewBillStr(e.target.value)}
                required
                className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-slate-700 text-[11px] font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddOpen(false)}
              className="px-3 py-1 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold cursor-pointer"
            >
              Save Audit Row
            </button>
          </div>
        </form>
      )}

      {/* Row-by-Row Audit Trail Table */}
      <div className="max-h-52 overflow-y-auto rounded-2xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-[11px]">
        <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1.5 font-bold text-slate-500 dark:text-slate-400 sticky top-0 z-10">
          <span className="col-span-3">Month</span>
          <span className="col-span-3 text-right">Actual</span>
          <span className="col-span-3 text-right">{hasCustomCorrection ? 'Adj. Est' : 'Govt Slab'}</span>
          <span className="col-span-3 text-right">Variance</span>
        </div>

        {evaluatedRows.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-12 items-center px-2.5 py-2 bg-white dark:bg-slate-900"
          >
            <div className="col-span-3 min-w-0 pr-1">
              <div className="font-bold text-slate-800 dark:text-slate-100 truncate">
                {row.month}
              </div>
              <div className="text-[9.5px] text-slate-400">
                {row.actualUnits} kWh ({row.origin === 'manual' ? 'Manual' : 'Portal'})
              </div>
            </div>

            <div className="col-span-3 text-right font-bold text-slate-900 dark:text-white">
              ₹{row.actualBill.toLocaleString('en-IN')}
            </div>

            <div className="col-span-3 text-right font-semibold text-slate-600 dark:text-slate-300">
              ₹{row.slabEstimateForActualUnits.toLocaleString('en-IN')}
            </div>

            <div className="col-span-3 flex items-center justify-end gap-1">
              <span
                className={`px-1.5 py-0.5 rounded-md font-extrabold text-[9.5px] inline-flex items-center gap-0.5 ${
                  row.status === 'high'
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    : row.status === 'minor'
                    ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                }`}
              >
                {row.status === 'match' ? (
                  <CheckCircle2 className="w-2.5 h-2.5" />
                ) : (
                  <AlertTriangle className="w-2.5 h-2.5" />
                )}
                <span>
                  {row.billVariancePct >= 0 ? `+${row.billVariancePct}%` : `${row.billVariancePct}%`}
                </span>
              </span>
              {row.origin === 'manual' && row.id.startsWith('manual-') && (
                <button
                  type="button"
                  onClick={() => handleDeleteManual(row.id)}
                  title="Remove manual bill row"
                  className="text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer Action */}
      {onCalibrateFromAudit && (
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="text-[10px] text-slate-500 dark:text-slate-400">
            {calibratedNotice
              ? 'Estimator synchronized to audited actual bills.'
              : `${totals.count} month(s) audited against ${liveTariff?.providerShortName || stateId.toUpperCase()} slabs`}
          </span>
          <button
            type="button"
            onClick={handleApplyCalibration}
            className="px-2.5 py-1 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-[10.5px] font-bold transition cursor-pointer shrink-0"
          >
            Sync Estimator to Actuals
          </button>
        </div>
      )}
    </div>
  );
};
