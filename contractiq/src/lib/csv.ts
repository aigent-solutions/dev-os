// RFC 4180 CSV with a CSV-injection guard (16-export.md §6.2). Generic and not server-only:
// the key-terms export and the eval reports (15-evals.md §6.10) both use it.
const INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (INJECTION_PREFIX.test(s)) s = `'${s}`; // CSV-injection guard (OWASP)
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`; // RFC 4180 quoting
  return s;
}

export function toCsv(header: string[], rows: (string | number | boolean | null)[][]): string {
  const lines = [header, ...rows].map((r) => r.map(escapeCsvCell).join(','));
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM for Excel, CRLF per RFC 4180
}
