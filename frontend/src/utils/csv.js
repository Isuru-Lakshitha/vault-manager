/*
 * Safe CSV building for exports opened in Excel / Sheets / Numbers.
 *  - quotes are escaped (doubled), never stripped
 *  - text starting with = + - @ (or tab/CR) is prefixed with ' so the
 *    spreadsheet shows it as text instead of running it as a formula
 *  - a UTF-8 BOM keeps emoji, Sinhala and Tamil readable in Excel
 */
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = String(value);
  if (FORMULA_START.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s !== s.trim() ? `"${s.replace(/"/g, '""')}"` : s;
}

export const toCSV = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
