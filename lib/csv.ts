// Minimal RFC-4180 CSV writer (2026-08-01).
//
// Hand-rolled rather than a dependency: the whole need is "quote it properly",
// and the failure mode of getting that wrong is silent — a device called
// `AC Pro, Rm 2` or a resolution note containing a newline would shift every
// later column in the row and nobody would notice until a manager filtered on
// the wrong field.

/**
 * Quotes one field. A field is wrapped in double quotes when it contains a
 * comma, a quote, or any newline; embedded quotes are doubled.
 *
 * null/undefined become empty, NOT the strings "null"/"undefined" — an empty
 * cell reads as "no value" in every spreadsheet, which is what we mean.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvRow(values: unknown[]): string {
  return values.map(csvField).join(",");
}

/**
 * Full document: header + rows, CRLF-separated per the spec, with a trailing
 * newline so the last row is terminated.
 *
 * Prefixed with a UTF-8 BOM because Excel on Windows otherwise reads the file
 * as the system codepage and mangles non-ASCII — property and device names here
 * are user-entered and Spanish accents are expected.
 */
export function toCsv(header: string[], rows: unknown[][]): string {
  const body = [csvRow(header), ...rows.map(csvRow)].join("\r\n");
  return `﻿${body}\r\n`;
}

/** `tickets_2026-08-01.csv` — safe on every OS, sorts chronologically. */
export function csvFilename(prefix: string, isoDate: string): string {
  return `${prefix}_${isoDate}.csv`;
}
