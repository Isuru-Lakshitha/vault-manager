// Exports every UI phrase for a native-speaker review:
//   docs/translations/review.csv  (open in Google Sheets / Excel)
//   docs/translations/review.md   (readable on GitHub)
// Run: npm run i18n:review
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MESSAGES } from '../src/i18n/messages.js';

const out = fileURLToPath(new URL('../../docs/translations/', import.meta.url));
mkdirSync(out, { recursive: true });
const keys = Object.keys(MESSAGES.en).sort();
const area = (k) => ({ nav: 'Navigation', group: 'Navigation', shell: 'App shell', page: 'Page titles', tab: 'Tabs',
  gs: 'Get started', mc: 'Month close', common: 'Common', settings: 'Settings', cur: 'Currency picker', qa: 'Quick Add',
  dash: 'Dashboard', sub: 'Page subtitles', btn: 'Buttons', seg: 'Tabs', empty: 'Empty screens' }[k.split('.')[0]] || 'Other');

const csvCell = (v) => `"${String(v).replace(/"/g, '""')}"`;
const csv = ['﻿' + ['Area', 'Key', 'English', 'Sinhala', 'Sinhala correction', 'Tamil', 'Tamil correction'].map(csvCell).join(',')]
  .concat(keys.map((k) => [area(k), k, MESSAGES.en[k], MESSAGES.si[k], '', MESSAGES.ta[k], ''].map(csvCell).join(',')))
  .join('\r\n');
writeFileSync(out + 'review.csv', csv);

const md = (v) => String(v).replace(/\|/g, '\\|');
const table = [
  '# Translation review',
  '',
  `${keys.length} phrases. Please check each Sinhala and Tamil phrase reads naturally for a Sri Lankan user.`,
  'Easiest: open **review.csv** in Google Sheets, type fixes in the *correction* columns, and send it back.',
  'Keep `{placeholders}` (like `{month}`) exactly as they are.',
  '',
  '| Area | English | සිංහල | தமிழ் |',
  '|---|---|---|---|',
  ...keys.map((k) => `| ${area(k)} | ${md(MESSAGES.en[k])} | ${md(MESSAGES.si[k])} | ${md(MESSAGES.ta[k])} |`),
  '',
].join('\n');
writeFileSync(out + 'review.md', table);
console.log(`Wrote ${keys.length} phrases to docs/translations/`);
