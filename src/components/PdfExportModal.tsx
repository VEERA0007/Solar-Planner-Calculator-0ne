import React, { useEffect, useState } from 'react';
import {
  Check,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Printer,
  Settings2,
  X,
} from 'lucide-react';
import {
  EstimatorPdfReportData,
  PdfExportOptions,
  exportEstimatorCsvReport,
  exportEstimatorPdfReport,
  printEstimatorProposalSheet,
} from '../utils/pdfReportGenerator';

interface PdfExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  reportData: EstimatorPdfReportData;
  defaultCustomerName?: string;
}

export const PdfExportModal: React.FC<PdfExportModalProps> = ({
  isOpen,
  onClose,
  reportData,
  defaultCustomerName = '',
}) => {
  const [preset, setPreset] = useState<'full_proposal' | 'executive_summary' | 'engineering_bom'>('full_proposal');
  const [customerName, setCustomerName] = useState<string>(defaultCustomerName);
  const [preparedBy, setPreparedBy] = useState<string>('');
  const [quoteRef, setQuoteRef] = useState<string>(
    `SOL-${new Date().getFullYear()}-${Math.round((reportData.systemKw || 3) * 100)}`
  );
  const [projectNotes, setProjectNotes] = useState<string>('');

  const [includeHistoricalChart, setIncludeHistoricalChart] = useState<boolean>(true);
  const [includeCashflowChart, setIncludeCashflowChart] = useState<boolean>(true);
  const [includeLoanEmiTable, setIncludeLoanEmiTable] = useState<boolean>(true);
  const [includeBom, setIncludeBom] = useState<boolean>(true);
  const [includeSignOff, setIncludeSignOff] = useState<boolean>(true);

  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (defaultCustomerName && !customerName) {
      setCustomerName(defaultCustomerName);
    }
  }, [defaultCustomerName, customerName]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  if (!isOpen) return null;

  const applyPreset = (next: 'full_proposal' | 'executive_summary' | 'engineering_bom') => {
    setPreset(next);
    if (next === 'full_proposal') {
      setIncludeHistoricalChart(true);
      setIncludeCashflowChart(true);
      setIncludeLoanEmiTable(true);
      setIncludeBom(true);
      setIncludeSignOff(true);
    } else if (next === 'executive_summary') {
      setIncludeHistoricalChart(false);
      setIncludeCashflowChart(true);
      setIncludeLoanEmiTable(false);
      setIncludeBom(false);
      setIncludeSignOff(true);
    } else {
      setIncludeHistoricalChart(true);
      setIncludeCashflowChart(false);
      setIncludeLoanEmiTable(false);
      setIncludeBom(true);
      setIncludeSignOff(true);
    }
  };

  const buildOptions = (outputMode: 'download' | 'blob'): PdfExportOptions => ({
    reportPreset: preset,
    customerName: customerName.trim() || undefined,
    preparedBy: preparedBy.trim() || undefined,
    quoteRef: quoteRef.trim() || undefined,
    projectNotes: projectNotes.trim() || undefined,
    includeHistoricalChart,
    includeCashflowChart,
    includeLoanEmiTable,
    includeBom,
    includeSignOff,
    outputMode,
  });

  const handleGeneratePreview = () => {
    const blob = exportEstimatorPdfReport({
      ...reportData,
      exportOptions: buildOptions('blob'),
    });
    if (blob instanceof Blob) {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      setPreviewBlobUrl(URL.createObjectURL(blob));
    }
  };

  const handleDownloadPdf = () => {
    exportEstimatorPdfReport({
      ...reportData,
      exportOptions: buildOptions('download'),
    });
  };

  const handlePrintPdf = () => {
    const started = printEstimatorProposalSheet({
      ...reportData,
      exportOptions: buildOptions('download'),
    });
    if (!started) {
      handleDownloadPdf();
    }
  };

  const handleDownloadCsv = () => {
    exportEstimatorCsvReport({
      ...reportData,
      exportOptions: buildOptions('download'),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                PDF Proposal &amp; Engineering Export Studio
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {reportData.systemKw} kW {reportData.moduleStandard} • Charts, Sensitivity ROI, EMI &amp; Full BOM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Presets */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Report Format Preset
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                { id: 'full_proposal', label: 'Full Proposal', sub: 'Charts + EMI + BOM' },
                { id: 'executive_summary', label: 'Executive Brief', sub: 'KPIs + 25Yr ROI' },
                { id: 'engineering_bom', label: 'Engineering Pack', sub: 'Specs + Full BOM' },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyPreset(item.id)}
                  className={`p-2.5 rounded-2xl border text-left transition cursor-pointer ${
                    preset === item.id
                      ? 'bg-[#FF6F00]/10 border-[#FF6F00] text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <div className="text-xs font-extrabold">{item.label}</div>
                  <div className="text-[10px] opacity-80">{item.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Client & Quote Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                Customer / Client Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="e.g. Suresh Kumar"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                Prepared By / Installer
              </label>
              <input
                type="text"
                value={preparedBy}
                onChange={(e) => setPreparedBy(e.target.value)}
                placeholder="e.g. SunTech EPC Pvt Ltd"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
                Proposal Ref #
              </label>
              <input
                type="text"
                value={quoteRef}
                onChange={(e) => setQuoteRef(e.target.value)}
                placeholder="SOL-2026-01"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
              />
            </div>
          </div>

          {/* Section Toggles */}
          <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">
              <Settings2 className="w-3.5 h-3.5 text-[#FF6F00]" />
              <span>Included PDF Sections</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {[
                { label: '12-Mo DISCOM Usage vs. Solar Chart', checked: includeHistoricalChart, set: setIncludeHistoricalChart },
                { label: '25-Yr Cashflow Chart & Schedule', checked: includeCashflowChart, set: setIncludeCashflowChart },
                { label: 'Solar Loan / EMI Comparison Table', checked: includeLoanEmiTable, set: setIncludeLoanEmiTable },
                { label: 'Complete Wrapped Bill of Materials (BOM)', checked: includeBom, set: setIncludeBom },
                { label: 'Warranty & Client Sign-Off Block', checked: includeSignOff, set: setIncludeSignOff },
              ].map((opt) => (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => opt.set(!opt.checked)}
                  className={`flex items-center gap-2 p-2 rounded-xl border text-left text-[11px] font-semibold transition cursor-pointer ${
                    opt.checked
                      ? 'bg-white dark:bg-slate-900 border-emerald-400/70 text-slate-900 dark:text-white'
                      : 'bg-slate-100/60 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                      opt.checked ? 'bg-emerald-600 text-white' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    {opt.checked && <Check className="w-3 h-3 stroke-[3]" />}
                  </span>
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Site / Engineering Notes */}
          <div className="space-y-1">
            <label className="text-[10.5px] font-bold text-slate-600 dark:text-slate-300">
              Site Notes &amp; Commissioning Remarks (Optional)
            </label>
            <textarea
              rows={2}
              value={projectNotes}
              onChange={(e) => setProjectNotes(e.target.value)}
              placeholder="e.g. Elevated HDG structure 1.5m clearance, AC/DC SPD Type-II included, DISCOM net-meter timeline ~21 days..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-[#FF6F00]"
            />
          </div>

          {/* Live Embedded PDF Preview */}
          {previewBlobUrl && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-200">
                <span>Live PDF Preview</span>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(previewBlobUrl);
                    setPreviewBlobUrl(null);
                  }}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  Hide Preview
                </button>
              </div>
              <iframe
                src={previewBlobUrl}
                title="Solar Proposal PDF Preview"
                className="w-full h-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleGeneratePreview}
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <Eye className="w-3.5 h-3.5 text-sky-600" />
            <span>{previewBlobUrl ? 'Refresh Preview' : 'Preview PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="px-3 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
          >
            <Printer className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300" />
            <span>Print</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadCsv}
            className="px-3 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
            title="Download BOM & 25-Year Cashflow CSV for Excel"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV (BOM + ROI)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleDownloadPdf();
              onClose();
            }}
            className="ml-auto px-4 py-2.5 rounded-xl bg-[#FF6F00] hover:bg-[#EA580C] text-white font-bold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer transition"
          >
            <FileDown className="w-4 h-4" />
            <span>Download PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
