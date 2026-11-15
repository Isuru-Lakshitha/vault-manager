// @ts-check

/**
 * Convert a monetary value (in major currency units) into integer cents
 * without IEEE-754 floating-point drift (e.g. 1.005 -> 101, 19.99 -> 1999).
 * @param {number | string | null | undefined} value
 * @returns {number}
 */
export function toCents(value) {
  if (value === null || value === undefined || value === '') return 0;
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const sign = num < 0 ? -1 : 1;
  // Adding 1e-9 before rounding resolves binary float representation gaps like 1.005 * 100 = 100.49999999999999
  return sign * Math.round((Math.abs(num) + 1e-9) * 100);
}

/**
 * Convert integer cents back to a 2-decimal major-unit number.
 * @param {number} cents
 * @returns {number}
 */
export function fromCents(cents) {
  if (!Number.isFinite(cents)) return 0;
  const rounded = Math.round(cents);
  if (rounded === 0) return 0;
  return rounded / 100;
}

/**
 * Round a monetary amount to 2 decimal places using integer cents.
 * @param {number | string | null | undefined} value
 * @returns {number}
 */
export function roundMoney(value) {
  return fromCents(toCents(value));
}

/**
 * Add two or more monetary amounts in integer cents.
 * @param {...(number | string | null | undefined)} values
 * @returns {number}
 */
export function addMoney(...values) {
  let totalCents = 0;
  for (const val of values) {
    totalCents += toCents(val);
  }
  return fromCents(totalCents);
}

/**
 * Subtract `b` from `a` in integer cents.
 * @param {number | string | null | undefined} a
 * @param {number | string | null | undefined} b
 * @returns {number}
 */
export function subMoney(a, b) {
  return fromCents(toCents(a) - toCents(b));
}

/**
 * Multiply a monetary amount by a scalar factor and round to integer cents.
 * @param {number | string | null | undefined} amount
 * @param {number} factor
 * @returns {number}
 */
export function mulMoney(amount, factor) {
  const f = Number(factor);
  if (!Number.isFinite(f)) return 0;
  return fromCents(Math.round(toCents(amount) * f + (amount < 0 || f < 0 ? -1e-9 : 1e-9)));
}

/**
 * Check whether a value is a valid bounded monetary amount with at most 2 decimal places.
 * @param {unknown} value
 * @param {{ allowZero?: boolean, allowNegative?: boolean }} [options]
 * @returns {boolean}
 */
export function isValidMoney(value, { allowZero = true, allowNegative = true } = {}) {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num) || Math.abs(num) > 1e12) return false;
  if (!allowNegative && num < 0) return false;
  if (!allowZero && num === 0) return false;
  return roundMoney(num) === num;
}
