import {
  fetchAccounts,
  fetchTransactions,
  fetchBudgets,
  fetchGoals,
  fetchLoans,
  fetchBills,
  fetchInvestments,
  fetchCreditCards,
  fetchRecurringTransactions,
  fetchRules,
  fetchSharedTabs,
  fetchInvoices,
  fetchReceipts,
  fetchIous,
} from './api';
import { todayYMD } from './dates';
import { saveFile } from './saveFile.js';

const LAST_BACKUP_KEY = 'vm_last_backup_ts';
const BACKUP_SNOOZE_KEY = 'vm_backup_snooze_until';
const BACKUP_REMINDER_INTERVAL_DAYS = 7;

const bufToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToBuf = (base64) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

async function deriveAesKey(password, saltBuffer, iterations = 100000) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts a JSON backup object using Web Crypto API (AES-256-GCM + PBKDF2)
 */
export const BACKUP_ITERATIONS = 600000;
export const MIN_BACKUP_PASSPHRASE = 12;

export async function encryptVaultBackup(payloadObj, password) {
  if (String(password || '').length < MIN_BACKUP_PASSPHRASE)
    throw new Error(`Use a passphrase of at least ${MIN_BACKUP_PASSPHRASE} characters.`);
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = BACKUP_ITERATIONS;
  const key = await deriveAesKey(password, salt.buffer, iterations);
  const plaintext = enc.encode(JSON.stringify(payloadObj));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );

  return {
    version: 2,
    encrypted: true,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations,
    exported_at: new Date().toISOString(),
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    ciphertext: bufToBase64(cipherBuffer),
  };
}

/**
 * Decrypts an AES-256-GCM encrypted backup object using Web Crypto API
 */
export async function decryptVaultBackup(encryptedObj, password) {
  if (!encryptedObj?.encrypted || !encryptedObj?.ciphertext) {
    return encryptedObj;
  }
  const salt = base64ToBuf(encryptedObj.salt);
  const iv = new Uint8Array(base64ToBuf(encryptedObj.iv));
  const ciphertext = base64ToBuf(encryptedObj.ciphertext);
  // Older backups used 100k. Refuse odd values a tampered file might carry.
  const iterations = Number(encryptedObj.iterations) || 100000;
  if (!Number.isInteger(iterations) || iterations < 100000 || iterations > 5000000) throw new Error('This backup file looks damaged.');
  const key = await deriveAesKey(password, salt, iterations);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(plainBuffer));
}

export function markBackupCompleted() {
  try {
    const now = Date.now();
    localStorage.setItem(LAST_BACKUP_KEY, String(now));
    localStorage.removeItem(BACKUP_SNOOZE_KEY);
    window.dispatchEvent(new CustomEvent('vm:backup-updated', { detail: { ts: now } }));
    window.dispatchEvent(new CustomEvent('vm:backup-status-changed', { detail: { ts: now } }));
  } catch {}
}

export function snoozeBackupReminder(days = 7) {
  try {
    const until = Date.now() + days * 24 * 60 * 60 * 1000;
    localStorage.setItem(BACKUP_SNOOZE_KEY, String(until));
    window.dispatchEvent(new CustomEvent('vm:backup-updated', { detail: { snoozedUntil: until } }));
    window.dispatchEvent(new CustomEvent('vm:backup-status-changed', { detail: { snoozedUntil: until } }));
  } catch {}
}

export function getBackupHealthStatus() {
  try {
    const lastRaw = localStorage.getItem(LAST_BACKUP_KEY);
    const snoozeRaw = localStorage.getItem(BACKUP_SNOOZE_KEY);
    const now = Date.now();
    const lastBackupTs = lastRaw ? parseInt(lastRaw, 10) : null;
    const snoozedUntil = snoozeRaw ? parseInt(snoozeRaw, 10) : 0;
    const isSnoozed = snoozedUntil > now;

    const daysSinceBackup = lastBackupTs
      ? Math.floor((now - lastBackupTs) / (1000 * 60 * 60 * 24))
      : null;

    const isDue = !isSnoozed && (daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_INTERVAL_DAYS);

    return {
      lastBackupTs,
      lastBackupDate: lastBackupTs ? new Date(lastBackupTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Never',
      daysSinceBackup,
      isDue,
      isSnoozed,
    };
  } catch {
  return {
    lastBackupTs: null,
    lastBackupDate: 'Never',
    daysSinceBackup: null,
    isDue: false,
    isSnoozed: false
  };
}
}

/**
 * 1-Tap Full Vault Backup Exporter (Plain JSON or AES-256-GCM Encrypted)
 * Accepts either a string passphrase or an options object `{ password }`.
 */
/** Collects every collection into one backup object (optionally encrypted). */
export async function buildVaultBackup(password = '') {

  const [
    accounts,
    transactions,
    budgets,
    goals,
    loans,
    bills,
    investments,
    credit_cards,
    recurring_transactions,
    rules,
    shared_tabs,
    invoices,
    receipts,
    ious,
  ] = await Promise.all([
    fetchAccounts(),
    fetchTransactions(),
    fetchBudgets(),
    fetchGoals(),
    fetchLoans(),
    fetchBills(),
    fetchInvestments(),
    fetchCreditCards(),
    fetchRecurringTransactions(),
    fetchRules(),
    fetchSharedTabs(),
    fetchInvoices(),
    fetchReceipts(),
    fetchIous(),
  ]);

  const rawPayload = {
    version: 2,
    exported_at: new Date().toISOString(),
    accounts: accounts || [],
    transactions: transactions || [],
    budgets: budgets || [],
    goals: goals || [],
    loans: loans || [],
    bills: bills || [],
    investments: investments || [],
    credit_cards: credit_cards || [],
    recurring_transactions: recurring_transactions || [],
    rules: rules || [],
    shared_tabs: shared_tabs || [],
    invoices: invoices || [],
    receipts: receipts || [],
    ious: ious || [],
  };

  const dateStr = todayYMD();
  let finalPayload = rawPayload;
  let filename = `vault_backup_${dateStr}.json`;

  if (password && password.trim().length > 0) {
    finalPayload = await encryptVaultBackup(rawPayload, password.trim());
    filename = `vault_encrypted_${dateStr}.vault.json`;
  }

  const counts = {
    accounts: rawPayload.accounts.length,
    transactions: rawPayload.transactions.length,
    budgets: rawPayload.budgets.length,
    goals: rawPayload.goals.length,
  };
  return { payload: finalPayload, filename, encrypted: finalPayload !== rawPayload, counts };
}

/** Builds the backup and downloads it as a file. */
export async function exportFullVaultBackup(arg = '') {
  const password = typeof arg === 'string' ? arg : (arg?.password || '');
  const { payload: finalPayload, filename, counts } = await buildVaultBackup(password);
  const blob = new Blob([JSON.stringify(finalPayload, null, 2)], { type: 'application/json' });
  // Throws if the file wasn't saved, so the reminder is only reset for a real backup.
  await saveFile(blob, filename);

  markBackupCompleted();
  return { encrypted: !!(password && password.trim().length > 0), filename, counts };
}
