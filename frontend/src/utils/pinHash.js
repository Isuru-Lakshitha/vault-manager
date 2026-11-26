// PIN lock hashing. A 4-digit PIN has only 10,000 values, so this lock is a
// privacy screen for a shared device, not real encryption. A random salt and
// slow PBKDF2 make each guess expensive, and PinLock signs out after
// MAX_PIN_ATTEMPTS wrong tries.
export const PIN_ITERATIONS = 600000;
export const MAX_PIN_ATTEMPTS = 5;
const LEGACY_SALT = 'vm_salt_2025';

const toB64 = bytes => btoa(String.fromCharCode(...bytes));
const fromB64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const toHex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');

async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Stored format: `pbkdf2$<iterations>$<salt b64>$<hash b64>`. */
export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(pin, salt, PIN_ITERATIONS);
  return `pbkdf2$${PIN_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Returns { ok, upgraded }: `upgraded` is a new-format hash after an old-format match. */
export async function verifyPin(pin, stored) {
  if (!stored) return { ok: false };
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, salt, hash] = stored.split('$');
    const iterations = Number(iter);
    if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 5000000) return { ok: false };
    return { ok: sameBytes(await pbkdf2(pin, fromB64(salt), iterations), fromB64(hash)) };
  }
  // Old unsalted SHA-256 format: accept once, then replace it with the new format.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + LEGACY_SALT)));
  if (toHex(digest) !== stored) return { ok: false };
  return { ok: true, upgraded: await hashPin(pin) };
}
