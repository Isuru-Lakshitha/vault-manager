import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
// backupCrypto imports the Firestore-backed api for full backups; these tests
// only need the encryption, so give it an empty stand-in.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/utils/backupCrypto.js')) {
      if (specifier === './api') return { url: 'data:text/javascript,' + encodeURIComponent('const none=async()=>[];export const fetchAccounts=none,fetchTransactions=none,fetchBudgets=none,fetchGoals=none,fetchLoans=none,fetchBills=none,fetchInvestments=none,fetchCreditCards=none,fetchRecurringTransactions=none,fetchRules=none,fetchSharedTabs=none,fetchInvoices=none,fetchReceipts=none,fetchIous=none;'), shortCircuit: true };
      if (specifier === './dates') return next('./dates.js', context);
    }
    return next(specifier, context);
  },
});
const { encryptVaultBackup, decryptVaultBackup, MIN_BACKUP_PASSPHRASE } = await import('../src/utils/backupCrypto.js');
hooks.deregister();

const pass = 'correct horse battery staple';
const payload = { accounts: [{ id: 'a', name: 'Bank', balance: 1234.56 }], note: 'සිංහල தமிழ்' };

test('a backup decrypts back to exactly what was saved', async () => {
  const file = await encryptVaultBackup(payload, pass);
  assert.equal(file.encrypted, true);
  assert.equal(file.algorithm, 'AES-256-GCM');
  assert.ok(!JSON.stringify(file).includes('Bank'), 'no plain text in the file');
  assert.deepEqual(await decryptVaultBackup(file, pass), payload);
});

test('each backup uses a fresh salt and IV', async () => {
  const a = await encryptVaultBackup(payload, pass), b = await encryptVaultBackup(payload, pass);
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ciphertext, b.ciphertext);
});

test('a wrong passphrase or a tampered file is refused', async () => {
  const file = await encryptVaultBackup(payload, pass);
  await assert.rejects(decryptVaultBackup(file, pass + '!'));
  const bytes = Buffer.from(file.ciphertext, 'base64'); bytes[0] ^= 1;
  await assert.rejects(decryptVaultBackup({ ...file, ciphertext: bytes.toString('base64') }, pass));
  await assert.rejects(decryptVaultBackup({ ...file, iterations: 10 }, pass), /damaged/);
});

test('short passphrases are rejected', async () => {
  await assert.rejects(encryptVaultBackup(payload, 'x'.repeat(MIN_BACKUP_PASSPHRASE - 1)), /at least/);
});
