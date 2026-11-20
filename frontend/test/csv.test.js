import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCSV } from '../src/utils/csv.js';

test('quotes, commas and newlines are escaped, not stripped', () => {
  assert.equal(csvCell('He said "hi", then left'), '"He said ""hi"", then left"');
  assert.equal(csvCell('line1\nline2'), '"line1\nline2"');
  assert.equal(csvCell('plain'), 'plain');
});

test('formula-looking text is neutralised; numbers stay numbers', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('-12.5'), '-12.5');
  assert.equal(csvCell(-12.5), '-12.5');
  assert.equal(csvCell(null), '');
});

test('output starts with a UTF-8 BOM and keeps unicode', () => {
  const out = toCSV([['Notes'], ['🍔 බත් කෑම']]);
  assert.ok(out.startsWith('﻿'));
  assert.ok(out.includes('🍔 බත් කෑම'));
});
