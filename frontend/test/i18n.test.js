import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, LANGUAGES } from '../src/i18n/messages.js';

const placeholders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every key is translated in every language, with the same placeholders', () => {
  const keys = Object.keys(MESSAGES.en);
  for (const { code } of LANGUAGES) {
    const dict = MESSAGES[code];
    assert.ok(dict, `missing language ${code}`);
    assert.deepEqual(Object.keys(dict).sort(), [...keys].sort(), `${code} keys differ from English`);
    for (const k of keys) {
      assert.ok(dict[k].trim(), `${code}.${k} is empty`);
      assert.equal(placeholders(dict[k]), placeholders(MESSAGES.en[k]), `${code}.${k} placeholders differ`);
    }
  }
});

test('Sinhala and Tamil text actually uses their scripts', () => {
  for (const [code, re] of [['si', /[඀-෿]/], ['ta', /[஀-௿]/]]) {
    for (const [k, v] of Object.entries(MESSAGES[code])) assert.match(v, re, `${code}.${k} has no ${code} script`);
  }
});
