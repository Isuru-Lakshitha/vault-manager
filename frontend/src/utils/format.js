import { currencyRate } from './exchangeRates.js';
import { useState, useEffect } from 'react';

/* ─── Currency & Privacy formatting utility ─────────────────────── */

const CURRENCY_LOCALE = {
  LKR: 'en-LK', USD: 'en-US', EUR: 'de-DE', GBP: 'en-GB',
  AED: 'ar-AE', SGD: 'en-SG', INR: 'en-IN', AUD: 'en-AU',
  JPY: 'ja-JP', CAD: 'en-CA',
};

let stealthModeState = typeof window !== 'undefined' ? localStorage.getItem('vm_stealth_mode') === 'true' : false;

export function isStealthMode() {
  return stealthModeState;
}

export function setStealthMode(enabled) {
  stealthModeState = !!enabled;
  if (typeof window !== 'undefined') {
    localStorage.setItem('vm_stealth_mode', stealthModeState ? 'true' : 'false');
    if (stealthModeState) {
      document.body.classList.add('stealth-active');
    } else {
      document.body.classList.remove('stealth-active');
    }
    window.dispatchEvent(new CustomEvent('vm:stealth-mode', { detail: stealthModeState }));
  }
}

export function toggleStealthMode() {
  setStealthMode(!stealthModeState);
  haptic(15);
  return stealthModeState;
}

export function useStealthMode() {
  const [stealth, setStealth] = useState(isStealthMode());
  useEffect(() => {
    const handler = (e) => setStealth(e.detail);
    window.addEventListener('vm:stealth-mode', handler);
    return () => window.removeEventListener('vm:stealth-mode', handler);
  }, []);
  return [stealth, toggleStealthMode];
}

/**
 * Returns the user's selected currency code from localStorage.
 * Falls back to 'LKR' if nothing is set.
 */
export function getCurrency() {
  return typeof localStorage !== 'undefined' ? (localStorage.getItem('vm_currency') || 'LKR') : 'LKR';
}

/**
 * Format a numeric value as currency using the user's selected currency.
 * If Stealth Mode is on, returns '••••••' unless ignoreStealth is passed.
 * @param {number} val - The value to format
 * @param {object} [opts] - Options
 * @param {number} [opts.decimals=2] - Maximum fraction digits
 * @param {string} [opts.currency] - Override currency code
 * @param {boolean} [opts.ignoreStealth=false] - Ignore privacy mode
 * @returns {string} Formatted currency string
 */
export function formatCurrency(val, opts = {}) {
  if (stealthModeState && !opts.ignoreStealth) {
    return '••••••';
  }
  if (!Number.isFinite(Number(val))) return 'Unavailable';
  const code = opts.currency || getCurrency();
  const locale = CURRENCY_LOCALE[code] || 'en-US';
  const decimals = opts.decimals ?? 2;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(val || 0);
}

/**
 * Format a number without currency symbol (for charts, tables).
 * @param {number} val - The value to format
 * @param {number} [decimals=2] - Maximum fraction digits
 * @param {object} [opts] - Options
 * @returns {string} Formatted number string
 */
export function formatNumber(val, decimals = 2, opts = {}) {
  if (stealthModeState && !opts.ignoreStealth) {
    return '••••••';
  }
  const code = getCurrency();
  const locale = CURRENCY_LOCALE[code] || 'en-US';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: decimals }).format(val || 0);
}

/**
 * Get just the currency symbol for labels like "Amount (LKR)"
 */
export function getCurrencyLabel() {
  return getCurrency();
}

/**
 * Trigger haptic feedback on mobile (short vibration)
 */
export function haptic(ms = 10) {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

export const SUPPORTED_CURRENCIES = [
  { code: 'LKR', label: 'LKR (Rs) — Sri Lankan Rupee' },
  { code: 'USD', label: 'USD ($) — US Dollar' },
  { code: 'EUR', label: 'EUR (€) — Euro' },
  { code: 'GBP', label: 'GBP (£) — British Pound' },
  { code: 'AED', label: 'AED (د.إ) — UAE Dirham' },
  { code: 'SGD', label: 'SGD ($) — Singapore Dollar' },
  { code: 'INR', label: 'INR (₹) — Indian Rupee' },
  { code: 'AUD', label: 'AUD ($) — Australian Dollar' },
  { code: 'CAD', label: 'CAD ($) — Canadian Dollar' },
  { code: 'JPY', label: 'JPY (¥) — Japanese Yen' },
];

export function convertCurrency(amount, fromCur, toCur, rates) {
  const value = Number(amount);
  if (value === 0) return 0;
  const rate = currencyRate(fromCur, toCur, rates);
  return Number.isFinite(value) && Number.isFinite(rate) ? Math.round(value * rate * 100) / 100 : NaN;
}
