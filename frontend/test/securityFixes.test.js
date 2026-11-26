// PIN lock hashing and backup restore link remapping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { hashPin, verifyPin } from '../src/utils/pinHash.js';
import { backupFingerprint, planBackupImport } from '../src/utils/backupPlan.js';

test('PIN hashes are salted, verify correctly and reject wrong PINs', async () => {
  const a = await hashPin('1234');
  const b = await hashPin('1234');
  assert.match(a, /^pbkdf2\$600000\$/);
  assert.notEqual(a, b); // random salt
  assert.equal((await verifyPin('1234', a)).ok, true);
  assert.equal((await verifyPin('4321', a)).ok, false);
  assert.equal((await verifyPin('1234', a.replace('600000', '10'))).ok, false); // tampered rounds
});

test('an old-style PIN still unlocks once and is upgraded', async () => {
  const legacy = createHash('sha256').update('2468vm_salt_2025').digest('hex');
  const res = await verifyPin('2468', legacy);
  assert.equal(res.ok, true);
  assert.match(res.upgraded, /^pbkdf2\$/);
  assert.equal((await verifyPin('2468', res.upgraded)).ok, true);
  assert.equal((await verifyPin('0000', legacy)).ok, false);
});

test('restore remaps card charges, history ids and IOUs to the new records', async () => {
  const input = {
    version: 2,
    accounts: [{ id: 'a1', name: 'Bank', balance: 100 }],
    credit_cards: [{ id: 'c1', name: 'Visa', balance: 50 }],
    transactions: [
      { id: 't1', type: 'Expense', amount: 50, date: '2026-11-01', credit_card_charge_id: 'c1' },
      { id: 't2', type: 'Expense', amount: 10, date: '2026-11-02', from_account_id: 'a1' },
    ],
    goals: [{ id: 'g1', name: 'Trip', target_amount: 100, current_amount: 0 }],
    recurring_transactions: [{ id: 'r1', amount: 10, last_paid_account_id: 'gone', payment_history: [{ month: '2026-11', transaction_id: 't2', account_id: 'a1' }] }],
    ious: [{ id: 'iou1', person: 'Sam', amount: 500 }],
  };
  input.transactions.push({ id: 't3', type: 'Expense', amount: 1, date: '2026-11-03', goal_id: 'g1', category: 'Goal Contribution', round_up_ids: ['t2', 'missing'] });
  const plan = planBackupImport(input, 'alice', await backupFingerprint(input));
  const rows = plan.groups.flat();
  const byOld = (section, i) => rows.filter(r => (r.path.length === 4 ? r.path[2] : r.path[0]) === section)[i];
  const card = byOld('credit_cards', 0), acct = byOld('accounts', 0);
  const charge = rows.find(r => r.data.credit_card_charge_id);
  assert.equal(charge.data.credit_card_charge_id, card.path[1]);
  const t2 = rows.find(r => r.data.amount === 10 && r.data.from_account_id);
  const rule = byOld('recurring_transactions', 0);
  assert.equal(rule.data.last_paid_account_id, null);
  assert.equal(rule.data.payment_history[0].transaction_id, t2.path[1]);
  assert.equal(rule.data.payment_history[0].account_id, acct.path[1]);
  const roundUp = rows.find(r => r.data.round_up_ids);
  assert.deepEqual(roundUp.data.round_up_ids, [t2.path[1]]);
  const iou = byOld('ious', 0);
  assert.deepEqual(iou.path.slice(0, 3), ['users', 'alice', 'ious']);
});
