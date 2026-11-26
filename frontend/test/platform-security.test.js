import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  truncateField,
  buildErrorLogPayload,
  shouldRecordError,
  _resetErrorLoggerState,
} from '../src/utils/errorLogger.js';
import {
  evaluateIdleState,
  getSessionTimeoutMinutes,
  setSessionTimeoutMinutes,
  SESSION_TIMEOUT_OPTIONS,
} from '../src/utils/sessionTimeout.js';
import {
  USER_TOP_LEVEL_COLLECTIONS,
  USER_SUBCOLLECTIONS,
} from '../src/utils/accountService.js';

test('truncateField enforces maximum string lengths safely', () => {
  assert.equal(truncateField('hello', 10), 'hello');
  assert.equal(truncateField('abcdefghij', 5), 'abcde');
  assert.equal(truncateField(null, 10), '');
});

test('buildErrorLogPayload truncates oversized messages, stacks, and contexts to Firestore rule limits', () => {
  const longMessage = 'M'.repeat(1500);
  const longStack = 'S'.repeat(6000);
  const longContext = 'C'.repeat(800);
  const err = new Error(longMessage);
  err.stack = longStack;

  const payload = buildErrorLogPayload(err, {
    level: 'error',
    context: longContext,
    url: 'https://money-manager-isuru.web.app/transactions',
    ua: 'TestAgent/1.0',
  });

  assert.equal(payload.message.length, 1000);
  assert.equal(payload.stack.length, 4000);
  assert.equal(payload.context.length, 500);
  assert.equal(payload.level, 'error');
  assert.equal(payload.url, 'https://money-manager-isuru.web.app/transactions');
  assert.equal(payload.ua, 'TestAgent/1.0');
  assert.equal(payload.app_version, '2.1.0');
});

test('shouldRecordError deduplicates identical message+url and caps per-session count at 10', () => {
  _resetErrorLoggerState();
  assert.equal(shouldRecordError({ message: 'Boom', url: '/dashboard' }), true);
  // Duplicate in same session is suppressed
  assert.equal(shouldRecordError({ message: 'Boom', url: '/dashboard' }), false);
  // Same message on a different route is recorded
  assert.equal(shouldRecordError({ message: 'Boom', url: '/accounts' }), true);

  // Cap at 10 per session
  _resetErrorLoggerState();
  for (let i = 0; i < 10; i += 1) {
    assert.equal(shouldRecordError({ message: `Err_${i}`, url: '/dashboard' }), true);
  }
  assert.equal(shouldRecordError({ message: 'Err_11', url: '/dashboard' }), false);
});

test('evaluateIdleState transitions cleanly between active, warning, and expired', () => {
  // 15 min timeout = 900,000 ms; warning at 840,000 ms
  assert.equal(evaluateIdleState(300_000, 15), 'active');
  assert.equal(evaluateIdleState(850_000, 15), 'warning');
  assert.equal(evaluateIdleState(900_000, 15), 'expired');
  // Disabled (0 min) never expires
  assert.equal(evaluateIdleState(99_999_999, 0), 'active');
});

test('getSessionTimeoutMinutes and setSessionTimeoutMinutes validate allowed options', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
  };
  assert.equal(getSessionTimeoutMinutes('u1', storage), 30);
  assert.equal(setSessionTimeoutMinutes('u1', 15, storage), 15);
  assert.equal(getSessionTimeoutMinutes('u1', storage), 15);
  assert.equal(setSessionTimeoutMinutes('u1', 0, storage), 0);
  assert.equal(getSessionTimeoutMinutes('u1', storage), 0);
  // Invalid value falls back to 30
  assert.equal(setSessionTimeoutMinutes('u1', 999, storage), 30);
  assert.equal(SESSION_TIMEOUT_OPTIONS.length, 5);
});

test('accountService lists all user collections and subcollections for GDPR export & deletion', () => {
  assert.ok(USER_TOP_LEVEL_COLLECTIONS.includes('accounts'));
  assert.ok(USER_TOP_LEVEL_COLLECTIONS.includes('transactions'));
  assert.ok(USER_SUBCOLLECTIONS.includes('error_logs'));
});

test('every collection that export & deletion reads is allowed by firestore.rules', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const userStart = rules.indexOf('    match /users/{userId}');
  const nextTopLevel = rules.indexOf('\n    match /', userStart + 1);
  const userBlock = rules.slice(userStart + '    match /users/{userId}'.length, nextTopLevel === -1 ? undefined : nextTopLevel);
  const sectionList = userBlock.match(/section in \[([^\]]*)\]/);
  assert.ok(sectionList, 'users/{uid}/{section} rule not found');
  const allowedSub = new Set([
    ...[...userBlock.matchAll(/match \/(\w+)\/\{\w+\}/g)].map(m => m[1]),
    ...[...sectionList[1].matchAll(/'(\w+)'/g)].map(m => m[1]),
  ]);
  for (const name of USER_SUBCOLLECTIONS) {
    assert.ok(allowedSub.has(name), `users/{uid}/${name} is read by export/delete but blocked by firestore.rules`);
  }
  for (const name of USER_TOP_LEVEL_COLLECTIONS) {
    assert.match(rules, new RegExp(`match /${name}/\\{\\w+\\}`), `${name} has no firestore.rules match`);
  }
});
