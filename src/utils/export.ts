export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadLocalCsv<T>(
  filenameBase: string,
  columns: CsvColumn<T>[],
  rows: T[]
): void {
  const headerLine = columns.map((c) => escapeCsvCell(c.header)).join(',');
  const bodyLines = rows.map((row) =>
    columns.map((c) => escapeCsvCell(c.value(row))).join(',')
  );
  const content = `\uFEFF${[headerLine, ...bodyLines].join('\r\n')}\r\n`;
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function buildExportQuery(
  params: Record<string, string | number | boolean | null | undefined>
): string {
  const qs = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === null || val === '' || val === false) continue;
    qs.set(key, String(val));
  }
  const encoded = qs.toString();
  return encoded ? `?${encoded}` : '';
}

