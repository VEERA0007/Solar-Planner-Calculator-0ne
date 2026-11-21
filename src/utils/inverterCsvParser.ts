import { InverterDailyLog } from '../types/inverter';

export interface ParsedInverterCsvResult {
  ok: boolean;
  rows: InverterDailyLog[];
  detectedSmartMeter: boolean;
  detectedColumns: {
    date: string;
    generation: string;
    consumption?: string;
    export?: string;
    import?: string;
    peakPower?: string;
  } | null;
  totalGenerationKwh: number;
  skippedRows: number;
  error?: string;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 8).join('\n');
  const commaCount = (sample.match(/,/g) || []).length;
  const semiCount = (sample.match(/;/g) || []).length;
  const tabCount = (sample.match(/\t/g) || []).length;
  if (tabCount > commaCount && tabCount >= semiCount) return '\t';
  if (semiCount > commaCount) return ';';
  return ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNumericCell(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, '').replace(/[^0-9.\-]/g, '').trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const val = Number(cleaned);
  if (!Number.isFinite(val) || val < 0) return null;
  return val;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Normalizes common CSV date formats from Solarman, SolisCloud, Growatt, Sungrow,
 * GoodWe, Fronius, Enphase, and Excel into canonical `YYYY-MM-DD`.
 */
export function parseFlexibleDateKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return null;

  // ISO / YYYY-MM-DD or YYYY/MM/DD (with optional timestamp)
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (y >= 2005 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${pad2(m)}-${pad2(d)}`;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY or MM/DD/YYYY (prefer DD/MM/YYYY for India/EU inverter portals unless month > 12)
  const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (dmyMatch) {
    let first = Number(dmyMatch[1]);
    let second = Number(dmyMatch[2]);
    let year = Number(dmyMatch[3]);
    if (year < 100) year += 2000;
    if (year >= 2005 && year <= 2100) {
      let day = first;
      let month = second;
      if (second > 12 && first <= 12) {
        month = first;
        day = second;
      }
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${year}-${pad2(month)}-${pad2(day)}`;
      }
    }
  }

  // "19 Nov 2026" or "Nov 19, 2026"
  const textDmy = trimmed.match(/^(\d{1,2})\s+([a-zA-Z]{3,9})[,\s]+(\d{4})/);
  if (textDmy) {
    const day = Number(textDmy[1]);
    const m = MONTH_MAP[textDmy[2].toLowerCase().slice(0, 3)];
    const year = Number(textDmy[3]);
    if (m && day >= 1 && day <= 31 && year >= 2005 && year <= 2100) {
      return `${year}-${pad2(m)}-${pad2(day)}`;
    }
  }

  const textMdy = trimmed.match(/^([a-zA-Z]{3,9})\s+(\d{1,2})[,\s]+(\d{4})/);
  if (textMdy) {
    const m = MONTH_MAP[textMdy[1].toLowerCase().slice(0, 3)];
    const day = Number(textMdy[2]);
    const year = Number(textMdy[3]);
    if (m && day >= 1 && day <= 31 && year >= 2005 && year <= 2100) {
      return `${year}-${pad2(m)}-${pad2(day)}`;
    }
  }

  return null;
}

function headerScaleToKwh(header: string): number {
  const lower = header.toLowerCase();
  if (/\bmwh\b/.test(lower)) return 1000;
  if (/\bwh\b/.test(lower) && !/\bkwh\b/.test(lower)) return 0.001;
  return 1;
}

function headerScaleToKw(header: string): number {
  const lower = header.toLowerCase();
  if (/\bmw\b/.test(lower)) return 1000;
  if (/\(w\)|\[w\]|\bw\b/.test(lower) && !/\bkw\b/.test(lower)) return 0.001;
  return 1;
}

function matchHeaderIndex(headers: string[], patterns: RegExp[], exclude: RegExp[] = []): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => {
      const lower = h.toLowerCase().trim();
      if (!pattern.test(lower)) return false;
      return !exclude.some((ex) => ex.test(lower));
    });
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parses CSV / TSV generation exports from Solarman, SolisCloud, Growatt, Sungrow,
 * GoodWe, Fronius, Enphase, or generic spreadsheets and auto-detects CT/smart-meter columns.
 */
export function parseInverterCsvText(
  rawText: string,
  plantId: string,
  weatherPotentialBenchmarkKwh?: number
): ParsedInverterCsvResult {
  const normalized = (rawText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length < 2) {
    return {
      ok: false,
      rows: [],
      detectedSmartMeter: false,
      detectedColumns: null,
      totalGenerationKwh: 0,
      skippedRows: 0,
      error: 'CSV needs a header row and at least one daily generation row.',
    };
  }

  const delimiter = detectDelimiter(rawLines);

  // Locate the header row (some portals prepend 1-5 metadata rows before column headers)
  let headerRowIdx = -1;
  let headers: string[] = [];
  let dateIdx = -1;
  let genIdx = -1;

  const datePatterns = [
    /^date$/,
    /updated\s*time|record\s*time|time\s*period/,
    /date|day|time|period|timestamp/,
  ];
  const genPatterns = [
    /pv\s*generation|solar\s*generation|daily\s*generation|generation\s*\(|generation\s*kwh/,
    /energy\s*produced|production|yield|e[_\s]?today|daily\s*yield|pv\s*yield|output\s*kwh/,
    /generation|produced|solar/,
  ];
  const genExcludes = [/cumulative|total\s*lifetime|all\s*time|export|feed|sell|import|buy|consumption|load/];

  const maxScan = Math.min(rawLines.length - 1, 12);
  for (let r = 0; r <= maxScan; r++) {
    const cols = splitCsvLine(rawLines[r], delimiter);
    if (cols.length < 2) continue;
    const dIdx = matchHeaderIndex(cols, datePatterns);
    const gIdx = matchHeaderIndex(cols, genPatterns, genExcludes);
    if (dIdx >= 0 && gIdx >= 0 && dIdx !== gIdx) {
      headerRowIdx = r;
      headers = cols;
      dateIdx = dIdx;
      genIdx = gIdx;
      break;
    }
  }

  // Fallback: if no explicit header matched but line 0 looks like headers + line 1 has parseable date & number
  if (headerRowIdx < 0) {
    const firstCols = splitCsvLine(rawLines[0], delimiter);
    const secondCols = splitCsvLine(rawLines[1], delimiter);
    if (firstCols.length >= 2 && parseFlexibleDateKey(secondCols[0]) && parseNumericCell(secondCols[1]) !== null) {
      headerRowIdx = 0;
      headers = firstCols;
      dateIdx = 0;
      genIdx = 1;
    } else {
      return {
        ok: false,
        rows: [],
        detectedSmartMeter: false,
        detectedColumns: null,
        totalGenerationKwh: 0,
        skippedRows: 0,
        error:
          'Could not detect Date and Generation (kWh) columns. Include headers like "Date, Generation (kWh), Consumption (kWh), Export (kWh), Import (kWh)".',
      };
    }
  }

  const consumptionIdx = matchHeaderIndex(
    headers,
    [/consumption|home\s*load|load\s*energy|load\s*\(|use\s*energy|usage|demand/],
    [/export|feed|sell|generation|pv/]
  );
  const exportIdx = matchHeaderIndex(
    headers,
    [/feed[\s-]*in|grid\s*export|export|sell|to\s*grid|injected|surplus/],
    [/import|buy|purchased/]
  );
  const importIdx = matchHeaderIndex(
    headers,
    [/grid\s*import|import|purchased|from\s*grid|buy|bought/],
    [/export|feed|sell/]
  );
  const peakIdx = matchHeaderIndex(
    headers,
    [/peak\s*power|max\s*power|peak\s*kw|ac\s*power|live\s*power/],
    [/kwh|energy/]
  );

  const genScale = headerScaleToKwh(headers[genIdx] || '');
  const consScale = consumptionIdx >= 0 ? headerScaleToKwh(headers[consumptionIdx] || '') : 1;
  const expScale = exportIdx >= 0 ? headerScaleToKwh(headers[exportIdx] || '') : 1;
  const impScale = importIdx >= 0 ? headerScaleToKwh(headers[importIdx] || '') : 1;
  const peakScale = peakIdx >= 0 ? headerScaleToKw(headers[peakIdx] || '') : 1;

  const byDate = new Map<string, InverterDailyLog>();
  const nowIso = new Date().toISOString();
  let skippedRows = 0;
  let detectedSmartMeter = false;

  for (let i = headerRowIdx + 1; i < rawLines.length; i++) {
    const cols = splitCsvLine(rawLines[i], delimiter);
    if (cols.length < 2) {
      skippedRows++;
      continue;
    }

    const dateKey = parseFlexibleDateKey(cols[dateIdx]);
    const rawGen = parseNumericCell(cols[genIdx]);
    if (!dateKey || rawGen === null) {
      skippedRows++;
      continue;
    }

    const generationKwh = Number(Math.min(100000, rawGen * genScale).toFixed(2));
    const rawCons = consumptionIdx >= 0 ? parseNumericCell(cols[consumptionIdx]) : null;
    const rawExp = exportIdx >= 0 ? parseNumericCell(cols[exportIdx]) : null;
    const rawImp = importIdx >= 0 ? parseNumericCell(cols[importIdx]) : null;
    const rawPeak = peakIdx >= 0 ? parseNumericCell(cols[peakIdx]) : null;

    const consumptionKwh = rawCons !== null ? Number(Math.min(100000, rawCons * consScale).toFixed(2)) : undefined;
    const exportKwh = rawExp !== null ? Number(Math.min(100000, rawExp * expScale).toFixed(2)) : undefined;
    const importKwh = rawImp !== null ? Number(Math.min(100000, rawImp * impScale).toFixed(2)) : undefined;
    const peakPowerKw = rawPeak !== null ? Number(Math.min(10000, rawPeak * peakScale).toFixed(2)) : undefined;

    const rowHasMeter =
      consumptionKwh !== undefined || exportKwh !== undefined || importKwh !== undefined;
    if (rowHasMeter) detectedSmartMeter = true;

    const weatherPotentialKwh =
      typeof weatherPotentialBenchmarkKwh === 'number' && weatherPotentialBenchmarkKwh > 0
        ? Number(weatherPotentialBenchmarkKwh.toFixed(1))
        : undefined;
    const performanceRatioPct =
      weatherPotentialKwh && weatherPotentialKwh > 0
        ? Number(Math.min(250, (generationKwh / weatherPotentialKwh) * 100).toFixed(1))
        : undefined;

    // If multiple rows share the same date (e.g., hourly export), accumulate daily totals cleanly
    const existing = byDate.get(dateKey);
    if (existing) {
      const nextGen = Number((existing.generationKwh + generationKwh).toFixed(2));
      const nextCons =
        consumptionKwh !== undefined
          ? Number(((existing.consumptionKwh || 0) + consumptionKwh).toFixed(2))
          : existing.consumptionKwh;
      const nextExp =
        exportKwh !== undefined
          ? Number(((existing.exportKwh || 0) + exportKwh).toFixed(2))
          : existing.exportKwh;
      const nextImp =
        importKwh !== undefined
          ? Number(((existing.importKwh || 0) + importKwh).toFixed(2))
          : existing.importKwh;
      const nextPeak =
        peakPowerKw !== undefined
          ? Math.max(existing.peakPowerKw || 0, peakPowerKw)
          : existing.peakPowerKw;

      byDate.set(dateKey, {
        ...existing,
        generationKwh: nextGen,
        ...(nextCons !== undefined ? { consumptionKwh: nextCons } : {}),
        ...(nextExp !== undefined ? { exportKwh: nextExp } : {}),
        ...(nextImp !== undefined ? { importKwh: nextImp } : {}),
        ...(nextPeak !== undefined ? { peakPowerKw: nextPeak } : {}),
        hasSmartMeter: existing.hasSmartMeter || rowHasMeter,
        ...(weatherPotentialKwh
          ? {
              weatherPotentialKwh,
              performanceRatioPct: Number(
                Math.min(250, (nextGen / weatherPotentialKwh) * 100).toFixed(1)
              ),
            }
          : {}),
      });
    } else {
      byDate.set(dateKey, {
        dateKey,
        plantId,
        generationKwh,
        ...(consumptionKwh !== undefined ? { consumptionKwh } : {}),
        ...(exportKwh !== undefined ? { exportKwh } : {}),
        ...(importKwh !== undefined ? { importKwh } : {}),
        ...(peakPowerKw !== undefined ? { peakPowerKw } : {}),
        ...(weatherPotentialKwh !== undefined ? { weatherPotentialKwh } : {}),
        ...(performanceRatioPct !== undefined ? { performanceRatioPct } : {}),
        hasSmartMeter: rowHasMeter,
        syncSource: 'csv_import',
        recordedAtIso: nowIso,
        visibility: 'public',
      });
    }
  }

  const rows = Array.from(byDate.values()).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  if (rows.length === 0) {
    return {
      ok: false,
      rows: [],
      detectedSmartMeter: false,
      detectedColumns: null,
      totalGenerationKwh: 0,
      skippedRows,
      error: 'No valid daily generation rows were found in the CSV.',
    };
  }

  const totalGenerationKwh = Number(
    rows.reduce((sum, r) => sum + r.generationKwh, 0).toFixed(2)
  );

  return {
    ok: true,
    rows,
    detectedSmartMeter,
    detectedColumns: {
      date: headers[dateIdx],
      generation: headers[genIdx],
      ...(consumptionIdx >= 0 ? { consumption: headers[consumptionIdx] } : {}),
      ...(exportIdx >= 0 ? { export: headers[exportIdx] } : {}),
      ...(importIdx >= 0 ? { import: headers[importIdx] } : {}),
      ...(peakIdx >= 0 ? { peakPower: headers[peakIdx] } : {}),
    },
    totalGenerationKwh,
    skippedRows,
  };
}
