// @ts-check
import { db, auth } from './firebase.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

const APP_VERSION = '2.1.0';
const MAX_LOGS_PER_SESSION = 10;

let _sessionCount = 0;
const _seenKeys = new Set();

/**
 * Truncate a value to a string of at most `maxLen` characters.
 * @param {unknown} val
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateField(val, maxLen) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return str.length > maxLen ? str.slice(0, maxLen) : str;
}

/**
 * Sanitize and format an error payload matching Firestore security rules for `users/{uid}/error_logs`.
 * @param {unknown} error
 * @param {{ level?: 'error' | 'warn', context?: string, url?: string, ua?: string }} [meta]
 */
export function buildErrorLogPayload(error, meta = {}) {
  const rawMessage =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'string'
        ? error
        : JSON.stringify(error || 'Unknown error');
  const rawStack = error instanceof Error ? (error.stack || '') : '';
  const level = meta.level === 'warn' ? 'warn' : 'error';
  const url = meta.url ?? (typeof window !== 'undefined' && window.location ? window.location.href : '');
  const ua = meta.ua ?? (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  return {
    message: truncateField(rawMessage || 'Unknown error', 1000),
    stack: truncateField(rawStack, 4000),
    url: truncateField(url, 500),
    ua: truncateField(ua, 300),
    level,
    app_version: truncateField(APP_VERSION, 40),
    ...(meta.context ? { context: truncateField(meta.context, 500) } : {}),
  };
}

/**
 * Check rate-limit and deduplication state for a candidate error payload.
 * @param {{ message: string, url: string }} payload
 * @returns {boolean} true if the log should be recorded
 */
export function shouldRecordError(payload) {
  if (!payload || !payload.message) return false;
  if (_sessionCount >= MAX_LOGS_PER_SESSION) return false;
  const dedupeKey = `${payload.message}|${payload.url || ''}`;
  if (_seenKeys.has(dedupeKey)) return false;
  _seenKeys.add(dedupeKey);
  _sessionCount += 1;
  return true;
}

/** Reset session counters (used by unit tests). */
export function _resetErrorLoggerState() {
  _sessionCount = 0;
  _seenKeys.clear();
}

/**
 * Log an application error or warning to `users/{uid}/error_logs` in Firestore.
 * Silently no-ops when signed out, offline, or rate-limited.
 * @param {unknown} error
 * @param {{ level?: 'error' | 'warn', context?: string }} [meta]
 */
export async function logError(error, meta = {}) {
  try {
    const uid = auth?.currentUser?.uid;
    if (!uid) return false;
    const payload = buildErrorLogPayload(error, meta);
    if (!shouldRecordError(payload)) return false;
    await addDoc(collection(db, 'users', uid, 'error_logs'), {
      ...payload,
      ts: serverTimestamp(),
    });
    return true;
  } catch {
    return false;
  }
}

let _installed = false;

/**
 * Attach global window `error` and `unhandledrejection` listeners once.
 */
export function installGlobalErrorHandlers() {
  if (_installed || typeof window === 'undefined') return;
  _installed = true;

  window.addEventListener('error', (event) => {
    const err = event?.error || new Error(event?.message || 'Uncaught window error');
    logError(err, {
      level: 'error',
      context: event?.filename ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}` : 'window.onerror',
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    // Ignore benign network/offline abort errors
    const msg = String(reason?.message || reason || '');
    if (msg.includes('Failed to fetch') || msg.includes('AbortError')) return;
    logError(reason instanceof Error ? reason : new Error(msg || 'Unhandled promise rejection'), {
      level: 'warn',
      context: 'unhandledrejection',
    });
  });
}
