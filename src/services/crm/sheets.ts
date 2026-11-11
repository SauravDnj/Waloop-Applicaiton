/** Excel / CSV files read on the phone (a campaign audience from a file). */
import { File } from 'expo-file-system';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export type ParsedSheet = {
  headers: string[];
  rows: Record<string, string>[];
  fileName: string;
};

export const parseSheetFile = async (uri: string, name: string, mimeType?: string): Promise<ParsedSheet> => {
  const file = new File(uri);
  const lower = name.toLowerCase();
  const isCsv = lower.endsWith('.csv') || lower.endsWith('.txt') || mimeType === 'text/csv';
  if (isCsv) {
    const text = await file.text();
    const res = Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    });
    const headers = res.meta.fields ?? [];
    return { headers, rows: res.data, fileName: name };
  }
  const bytes = await file.bytes();
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
  });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  return {
    headers,
    rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v ?? '').trim()]))),
    fileName: name,
  };
};
