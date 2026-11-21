import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Lock,
  Printer,
  ShieldCheck,
  Unlock,
} from 'lucide-react';
import {
  exportSiteSurveyPdfReport,
  printSiteSurveyAuditSheet,
} from '../utils/pdfReportGenerator';
import {
  AnnualSimulationSummary,
  InstantaneousShadingState,
  SiteSimulationConfig,
  computeInsetPolygonENU,
  computePolygonMetricsENU,
  computeRowOffsetsAndWalkways,
  getHostRoofFootprintENU,
} from '../utils/shadingSimulationEngine';
import { DEFAULT_PANEL_SPACING_550W } from '../utils/panelArrayPackingEngine';
import { buildShadowCadDxfPayload } from '../utils/dxfExporter';
import { computeLayoutYieldSummary } from '../utils/rooftopZoneClamper';
import { DxfExportSummaryModal, DxfPreviewRequest } from './DxfExportSummaryModal';
import {
  CompletedSurveyRecord,
  InspectionCheckItem,
  SiteMeasurements,
  SiteMediaAsset,
} from '../types/siteSurvey';

interface SurveyInspectionReportPanelProps {
  siteLocationName: string;
  config: SiteSimulationConfig;
  instantState: InstantaneousShadingState;
  annualSummary: AnnualSimulationSummary;
  mediaAssets: SiteMediaAsset[];
  measurements: SiteMeasurements;
  manualChecks: Record<string, boolean>;
  onToggleManualCheck: (id: string) => void;
  surveyRecord: CompletedSurveyRecord;
  onUpdateSurveyRecord: (patch: Partial<CompletedSurveyRecord>) => void;
}

export const SurveyInspectionReportPanel: React.FC<SurveyInspectionReportPanelProps> = ({
  siteLocationName,
  config,
  instantState,
  annualSummary,
  mediaAssets,
  measurements,
  manualChecks,
  onToggleManualCheck,
  surveyRecord,
  onUpdateSurveyRecord,
}) => {
  const rowLayout = useMemo(() => computeRowOffsetsAndWalkways(config), [config]);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [dxfPreviewRequest, setDxfPreviewRequest] = useState<DxfPreviewRequest | null>(null);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  const checklist: InspectionCheckItem[] = useMemo(() => {
    const hasDrawingOrMedia = mediaAssets.length > 0;
    const hasCalibratedDrawing = mediaAssets.some((m) => Boolean(m.calibratedPxPerMeter));
    const walkwaysPass =
      measurements.walkwayWidthM >= 0.6 && measurements.perimeterSetbackM >= 0.5;
    const opticsPass = annualSummary.shadingRetentionPct >= 82;
    const hasObstacles = config.obstacles.length > 0;

    return [
      {
        id: 'chk-gps',
        code: 'INSP-01',
        category: 'Site & Drawing',
        label: 'GPS Coordinates, Elevation & Solar Timezone Locked',
        requirement: 'Accurate site Lat/Lon synced for solar ephemeris calculation',
        autoPass: Boolean(config.latitude && config.longitude),
        autoDetail: `${config.latitude.toFixed(5)}°, ${config.longitude.toFixed(5)}° · Elev ${config.elevationM}m`,
        manualVerified: manualChecks['chk-gps'] ?? true,
        notes: '',
      },
      {
        id: 'chk-media',
        code: 'INSP-02',
        category: 'Site & Drawing',
        label: 'Site Drawing / Field Photos / 360° Video & Scale Calibrated',
        requirement: 'At least one uploaded site drawing or media asset with verified measurements',
        autoPass: hasDrawingOrMedia,
        autoDetail: hasDrawingOrMedia
          ? `${mediaAssets.length} media file(s)${hasCalibratedDrawing ? ' · Drawing Scale Calibrated' : ''}`
          : 'Upload a site drawing image or site media in Step 1 for audit archive',
        manualVerified: manualChecks['chk-media'] ?? hasDrawingOrMedia,
        notes: '',
      },
      {
        id: 'chk-autocad',
        code: 'INSP-03',
        category: 'AutoCAD 3D & Walkways',
        label: 'AutoCAD 2D→3D Obstacles, Parapets & Buildings Modeled',
        requirement: 'Nearby shading structures extruded in 3D space with real heights',
        autoPass: hasObstacles,
        autoDetail: `${config.obstacles.length} 3D structure(s) modeled on ${measurements.roofLengthM}m × ${measurements.roofWidthM}m roof`,
        manualVerified: manualChecks['chk-autocad'] ?? hasObstacles,
        notes: '',
      },
      {
        id: 'chk-walkways',
        code: 'INSP-04',
        category: 'AutoCAD 3D & Walkways',
        label: 'Built-In O&M Walkways & Perimeter Fire Setback Compliance',
        requirement: 'Walkway aisle ≥ 0.60m and rooftop edge setback ≥ 0.50m',
        autoPass: walkwaysPass,
        autoDetail: `${rowLayout.walkwayAisles.length} grated aisle(s) @ ${measurements.walkwayWidthM}m · Setback ${measurements.perimeterSetbackM}m`,
        manualVerified: manualChecks['chk-walkways'] ?? walkwaysPass,
        notes: '',
      },
      {
        id: 'chk-pvsyst',
        code: 'INSP-05',
        category: 'PVsyst Optics',
        label: 'PVsyst Optical & Annual Yield Retention Threshold',
        requirement: 'Combined far + near + string mismatch shading retention ≥ 82%',
        autoPass: opticsPass,
        autoDetail: `Retention ${annualSummary.shadingRetentionPct}% · Eff POA ${annualSummary.effectivePoaKwhM2} kWh/m²/yr`,
        manualVerified: manualChecks['chk-pvsyst'] ?? opticsPass,
        notes: '',
      },
      {
        id: 'chk-mms',
        code: 'INSP-06',
        category: 'Safety & Handover',
        label: 'MMS Earthing, String Bypass & Structural Wind Anchor Review',
        requirement: 'Final installer engineering review prior to installation release',
        autoPass: true,
        autoDetail: `Tilt ${config.tiltDeg}° / Az ${config.azimuthCompassDeg}° · ${config.numRows} rows`,
        manualVerified: manualChecks['chk-mms'] ?? false,
        notes: '',
      },
    ];
  }, [
    annualSummary.effectivePoaKwhM2,
    annualSummary.shadingRetentionPct,
    config,
    manualChecks,
    measurements,
    mediaAssets,
    rowLayout.walkwayAisles.length,
  ]);

  const passedCount = checklist.filter((c) => c.autoPass && c.manualVerified).length;
  const allReady = passedCount === checklist.length;

  const handleDownloadDxf = () => {
    const spacing = {
      ...DEFAULT_PANEL_SPACING_550W,
      panelWattage: measurements.moduleWp || 550,
      azimuthDeg: config.azimuthCompassDeg,
    };
    const payload = buildShadowCadDxfPayload(
      config,
      instantState,
      siteLocationName,
      undefined,
      spacing
    );
    const roofPoly = getHostRoofFootprintENU(config);
    const grossMetrics = computePolygonMetricsENU(roofPoly);
    const insetPoly = computeInsetPolygonENU(roofPoly, config.perimeterSetbackM ?? 0.6);
    const usableMetrics = computePolygonMetricsENU(
      insetPoly.length >= 3 ? insetPoly : roofPoly
    );
    const segs = payload.arraySegments || [];
    const packedPanels = segs.reduce((sum, s) => sum + s.panelsCornersENU.length, 0);
    const fallbackPanels = Math.max(
      1,
      Math.round((payload.shedRowsENU?.length || config.numRows) * Math.floor(config.arrayWidthM / 1.15))
    );
    const totalPanels = packedPanels > 0 ? packedPanels : fallbackPanels;
    const yieldSummary = computeLayoutYieldSummary(
      totalPanels,
      spacing.panelWattage,
      annualSummary,
      grossMetrics.areaSqM,
      usableMetrics.areaSqM,
      Math.max(1, segs.length || payload.shedRowsENU?.length || 1),
      segs[0]?.orientation || 'portrait'
    );
    setDxfPreviewRequest({
      fileNameBase: `${siteLocationName || 'solar_site'}_cad`,
      payload,
      yieldSummary,
    });
  };

  const buildSurveyPdfPayload = (outputMode: 'download' | 'blob') => {
    const calibratedCount = mediaAssets.filter((m) => Boolean(m.calibratedPxPerMeter)).length;
    return {
      siteLocationName,
      surveyId: surveyRecord.surveyId,
      projectTitle: surveyRecord.projectTitle || siteLocationName,
      inspectorName: surveyRecord.inspectorName || 'Lead Site Engineer',
      status: surveyRecord.status,
      completedAtIso: surveyRecord.completedAtIso,
      summaryRemarks: surveyRecord.summaryRemarks,
      latitude: config.latitude,
      longitude: config.longitude,
      elevationM: config.elevationM,
      roofLengthM: measurements.roofLengthM,
      roofWidthM: measurements.roofWidthM,
      parapetHeightM: measurements.parapetHeightM,
      mmsClearanceM: measurements.mmsClearanceM,
      walkwayWidthM: measurements.walkwayWidthM,
      perimeterSetbackM: measurements.perimeterSetbackM,
      walkwayAislesCount: rowLayout.walkwayAisles.length,
      tiltDeg: config.tiltDeg,
      azimuthCompassDeg: config.azimuthCompassDeg,
      numRows: config.numRows,
      arrayWidthM: config.arrayWidthM,
      effectivePitchM: rowLayout.effectivePitchM,
      gcr: annualSummary.gcr,
      annualGhiKwhM2: annualSummary.annualGhiKwhM2,
      annualPoaUnshadedKwhM2: annualSummary.annualPoaUnshadedKwhM2,
      effectivePoaKwhM2: annualSummary.effectivePoaKwhM2,
      iamLossPct: annualSummary.iamLossPct,
      farHorizonLossPct: Number(
        (annualSummary.farBeamLossPct + annualSummary.farDiffuseLossPct).toFixed(1)
      ),
      nearShadeLossPct: annualSummary.nearBeamLinearLossPct,
      electricalMismatchLossPct: annualSummary.electricalMismatchLossPct,
      shadingRetentionPct: annualSummary.shadingRetentionPct,
      mediaCount: mediaAssets.length,
      calibratedMediaCount: calibratedCount,
      obstacles: config.obstacles.map((obs) => ({
        name: obs.name,
        category: obs.category,
        heightM: obs.heightM,
        widthM: obs.widthM,
        depthM: obs.depthM,
        distanceM: obs.distanceM,
        bearingDeg: obs.bearingDeg,
      })),
      checklist: checklist.map((chk) => ({
        code: chk.code,
        category: chk.category,
        label: chk.label,
        autoDetail: chk.autoDetail,
        passed: chk.autoPass && chk.manualVerified,
      })),
      outputMode,
    };
  };

  const handleExportPdfReport = () => {
    exportSiteSurveyPdfReport(buildSurveyPdfPayload('download'));
  };

  const handlePreviewPdfReport = () => {
    const blob = exportSiteSurveyPdfReport(buildSurveyPdfPayload('blob'));
    if (blob instanceof Blob) {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
      setPreviewBlobUrl(URL.createObjectURL(blob));
    }
  };

  const handlePrintPdfReport = () => {
    const started = printSiteSurveyAuditSheet(buildSurveyPdfPayload('download'));
    if (!started) {
      handleExportPdfReport();
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Banner */}
      <div
        className={`rounded-3xl p-4 border flex items-center justify-between gap-3 ${
          surveyRecord.status === 'Completed'
            ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-950 dark:text-emerald-100'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
        }`}
      >
        <div className="flex items-start gap-3">
          {surveyRecord.status === 'Completed' ? (
            <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ClipboardCheck className="w-6 h-6 text-[#FF6F00] shrink-0 mt-0.5" />
          )}
          <div>
            <div className="text-xs font-extrabold uppercase tracking-wider flex items-center gap-2">
              <span>
                {surveyRecord.status === 'Completed'
                  ? 'Site Survey & PVsyst Audit Completed'
                  : 'Pre-Installation Engineering Inspection'}
              </span>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-slate-900/10 dark:bg-white/10">
                {passedCount}/{checklist.length} Checks
              </span>
            </div>
            <p className="text-[11px] opacity-80 mt-0.5">
              {surveyRecord.status === 'Completed'
                ? `Completed ${new Date(surveyRecord.completedAtIso).toLocaleString()} by ${surveyRecord.inspectorName || 'Lead Engineer'}`
                : 'Verify AutoCAD dimensions, built-in walkways, and PVsyst optical retention before marking survey complete.'}
            </p>
          </div>
        </div>
      </div>

      {/* Automated + Manual Engineering QA Checklist */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-2.5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-sky-600" />
          <span>QA/QC Inspection Matrix</span>
        </h3>

        <div className="space-y-2">
          {checklist.map((item) => {
            const passed = item.autoPass && item.manualVerified;
            return (
              <div
                key={item.id}
                onClick={() => onToggleManualCheck(item.id)}
                className={`p-3 rounded-2xl border transition cursor-pointer flex items-start justify-between gap-3 ${
                  passed
                    ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/50'
                    : 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/50'
                }`}
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  {passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-slate-900 dark:text-white">
                      <span className="font-mono text-[10px] text-slate-500">{item.code}</span>
                      <span>{item.label}</span>
                    </div>
                    <div className="text-[10.5px] font-mono text-slate-600 dark:text-slate-300 mt-0.5">
                      {item.autoDetail}
                    </div>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={item.manualVerified}
                  onChange={() => {}}
                  aria-label={`Verify ${item.label}`}
                  className="mt-1 accent-emerald-600 w-4 h-4 shrink-0 cursor-pointer"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Inspector Sign-Off & Survey Completion Controls */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Project / Client Name
            </label>
            <input
              type="text"
              value={surveyRecord.projectTitle}
              onChange={(e) => onUpdateSurveyRecord({ projectTitle: e.target.value })}
              placeholder={siteLocationName}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1">
              Lead Solar Installer / Inspector
            </label>
            <input
              type="text"
              value={surveyRecord.inspectorName}
              onChange={(e) => onUpdateSurveyRecord({ inspectorName: e.target.value })}
              placeholder="Engineer name..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-semibold"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-slate-500 mb-1">
            Final Handover &amp; Walkway Safety Remarks
          </label>
          <textarea
            rows={2}
            value={surveyRecord.summaryRemarks}
            onChange={(e) => onUpdateSurveyRecord({ summaryRemarks: e.target.value })}
            placeholder="All parapet clearances, O&M grated walkways, and PVsyst string mismatch losses validated..."
            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <button
            type="button"
            onClick={() =>
              onUpdateSurveyRecord({
                status: surveyRecord.status === 'Completed' ? 'Draft' : 'Completed',
                completedAtIso: new Date().toISOString(),
              })
            }
            className={`py-2.5 px-3 rounded-2xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition ${
              surveyRecord.status === 'Completed'
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : allReady
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                : 'bg-[#FF6F00] hover:bg-[#EA580C] text-white'
            }`}
          >
            {surveyRecord.status === 'Completed' ? (
              <>
                <Unlock className="w-4 h-4" />
                <span>Reopen Survey</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                <span>Complete Survey</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDownloadDxf}
            className="py-2.5 px-3 rounded-2xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <Download className="w-4 h-4" />
            <span>AutoCAD .DXF</span>
          </button>

          <button
            type="button"
            onClick={handlePreviewPdfReport}
            className="py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <Eye className="w-4 h-4 text-sky-600" />
            <span>{previewBlobUrl ? 'Refresh PDF' : 'Preview PDF'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdfReport}
            className="py-2.5 px-3 rounded-2xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition"
          >
            <FileText className="w-4 h-4 text-amber-400" />
            <span>Survey PDF</span>
          </button>
        </div>

        {previewBlobUrl && (
          <div className="pt-2 space-y-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 dark:text-slate-200">
              <span>Live Survey &amp; PVsyst Audit PDF Preview</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handlePrintPdfReport}
                  className="text-sky-600 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    URL.revokeObjectURL(previewBlobUrl);
                    setPreviewBlobUrl(null);
                  }}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                >
                  Hide
                </button>
              </div>
            </div>
            <iframe
              src={previewBlobUrl}
              title="Survey Audit PDF Preview"
              className="w-full h-72 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-100"
            />
          </div>
        )}
      </div>

      <DxfExportSummaryModal
        request={dxfPreviewRequest}
        onClose={() => setDxfPreviewRequest(null)}
      />
    </div>
  );
};
