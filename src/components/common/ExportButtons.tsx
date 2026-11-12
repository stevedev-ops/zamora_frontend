import { useState } from 'react';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { downloadBinaryFile } from '../../api/client';
import { useToast } from './Toast';
import { CsvColumn, downloadLocalCsv } from '../../utils/export';

export interface LocalCsvConfig<T = Record<string, unknown>> {
  columns: CsvColumn<T>[];
  rows: T[];
}

export function ExportButtons<T>({
  filenameBase,
  pdfPath,
  excelPath,
  csvPath,
  localCsv,
  portalSession,
  compact = false,
  disabled = false,
}: {
  filenameBase: string;
  pdfPath?: string;
  excelPath?: string;
  csvPath?: string;
  localCsv?: LocalCsvConfig<T>;
  portalSession?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [busyFormat, setBusyFormat] = useState<'pdf' | 'excel' | 'csv' | null>(null);
  const dateSuffix = new Date().toISOString().slice(0, 10);

  const handleServerDownload = async (
    format: 'pdf' | 'excel' | 'csv',
    path: string,
    ext: string
  ) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (format === 'csv' && localCsv) {
        downloadLocalCsv(filenameBase, localCsv.columns, localCsv.rows);
        showToast('Offline CSV downloaded from cached records', 'success');
        return;
      }
      showToast('PDF and Excel exports require an active connection. Try CSV for offline export.', 'error');
      return;
    }

    setBusyFormat(format);
    try {
      await downloadBinaryFile(path, `${filenameBase}-${dateSuffix}.${ext}`, portalSession);
    } catch (err) {
      if (format === 'csv' && localCsv) {
        downloadLocalCsv(filenameBase, localCsv.columns, localCsv.rows);
        showToast('Downloaded CSV from current list view', 'success');
      } else {
        showToast(err instanceof Error ? err.message : 'Download failed', 'error');
      }
    } finally {
      setBusyFormat(null);
    }
  };

  const handleCsvClick = async () => {
    if (csvPath && (typeof navigator === 'undefined' || navigator.onLine)) {
      await handleServerDownload('csv', csvPath, 'csv');
      return;
    }
    if (localCsv) {
      downloadLocalCsv(filenameBase, localCsv.columns, localCsv.rows);
      return;
    }
    if (csvPath) {
      await handleServerDownload('csv', csvPath, 'csv');
    }
  };

  const btnPadding = compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-2 text-xs';
  const isBusy = busyFormat !== null || disabled;

  return (
    <div className="inline-flex flex-wrap items-center gap-1.5">
      {pdfPath && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleServerDownload('pdf', pdfPath, 'pdf')}
          title="Download filtered list as PDF"
          className={`inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white ${btnPadding} font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50`}
        >
          <Download className="h-3.5 w-3.5" />
          {busyFormat === 'pdf' ? 'PDF...' : 'PDF'}
        </button>
      )}
      {excelPath && (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => handleServerDownload('excel', excelPath, 'xlsx')}
          title="Download filtered list as Excel (.xlsx)"
          className={`inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 ${btnPadding} font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50`}
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {busyFormat === 'excel' ? 'Excel...' : 'Excel'}
        </button>
      )}
      {(csvPath || localCsv) && (
        <button
          type="button"
          disabled={isBusy}
          onClick={handleCsvClick}
          title="Download filtered list as CSV"
          className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 ${btnPadding} font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50`}
        >
          <FileText className="h-3.5 w-3.5" />
          {busyFormat === 'csv' ? 'CSV...' : 'CSV'}
        </button>
      )}
    </div>
  );
}

