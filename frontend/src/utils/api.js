import { requireMatchingCurrency, isInternalMove } from './ledgerReporting.js';
import { reportingTransactions, transactionCurrency } from './reportingCurrency.js';
import { parseExchangeRates, currencyRate } from './exchangeRates.js';
import { calculateLoanPayment } from './loanPayment.js';
import { advanceBill } from './billSchedule.js';
import { validateTransaction, mutateBalances as _mutateBalances, transferFee, roundMoney } from './transactionLedger.js';
import { addMoney, subMoney } from './money.js';
import { db, auth } from './firebase';
import { collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc, query, where, runTransaction, writeBatch, serverTimestamp, onSnapshot, deleteField } from "firebase/firestore";
import { executeRulesOnTransaction, DEFAULT_RULES } from './rulesEngine';
import { pendingRecurringRules } from './recurringDue.js';
export { pendingRecurringRules };
import { todayYMD } from './dates';
import { formatCurrency, getCurrency } from './format';

// --- ULTRA-FAST IN-MEMORY CACHE — fed by REAL-TIME Firestore listeners ---
const _cache = {};
let cacheEpoch = 0;
const _inflight = {}; // deduplicates concurrent fetches for the same key
const CACHE_TTL = 600_000; // 10 minutes (only for keys WITHOUT a live listener)
const _live = {};      // key -> unsubscribe fn for active onSnapshot listener
const _liveReady = {}; // key -> promise resolved after the first snapshot arrives

// Broadcast that data for `key` changed — pages subscribed via useLiveData re-render silently
const _emit = (key) => {
  try { window.dispatchEvent(new CustomEvent('vm:data-changed', { detail: { key } })); } catch {}
};

// SWR cachedFetch: returns cached data instantly; live keys are always fresh
const cachedFetch = async (key, fetcher) => {
  const epoch = cacheEpoch;
  const now = Date.now();
  const cached = _cache[key];

  // Revalidate in background if stale (but still return cached data immediately)
  const revalidate = () => {
    if (_inflight[key]) return;
    const promise = fetcher().then(data => {
      if (epoch !== cacheEpoch) return data;
      _cache[key] = { data, ts: Date.now() };
      delete _inflight[key];
      _emit(key);
      return data;
    }).catch(() => { if (epoch === cacheEpoch) delete _inflight[key]; });
    _inflight[key] = promise;
  };

  // Return cached data immediately (even if stale)
  if (cached) {
    if (!_live[key] && now - cached.ts > CACHE_TTL) revalidate(); // live keys never go stale
    return cached.data;
  }

  // Live listener attached but first snapshot not here yet — wait for it (avoids a duplicate read)
  if (_live[key] && _liveReady[key]) {
    await _liveReady[key];
    if (_cache[key]) return _cache[key].data;
  }

  // No cache at all — must fetch and wait
  if (_inflight[key]) return _inflight[key];
  const promise = fetcher().then(data => {
    if (epoch !== cacheEpoch) return data;
    _cache[key] = { data, ts: Date.now() };
    delete _inflight[key];
    return data;
  }).catch(err => { if (epoch === cacheEpoch) delete _inflight[key]; throw err; });
  _inflight[key] = promise;
  return promise;
};

// Optimistically patch the in-memory cache without a round-trip
const _patchCache = (key, patcher) => {
  if (_cache[key]) {
    _cache[key] = { data: patcher(_cache[key].data), ts: _cache[key].ts };
    _emit(key);
  }
};

// Mark a cache key as stale without deleting it — forces background revalidation on next read
const _staleCache = (...keys) => {
  keys.forEach(k => { if (_cache[k]) _cache[k].ts = 0; });
};

// Read raw cache data synchronously (for optimistic UI reads after mutations)
export const getCache = (key) => {
  if (_cache[key]) return _cache[key].data;
  if (
    key === 'analytics' &&
    _cache.transactions &&
    _cache.accounts &&
    _cache.loans &&
    _cache.goals &&
    _cache.budgets
  ) {
    try {
      const base = getCurrency();
      const rawTransactions = _cache.transactions.data;
      const accounts = _cache.accounts.data;
      const mixed = rawTransactions.some(t => transactionCurrency(t, accounts, base) !== base);
      if (!mixed || _ratesCache) {
        const computed = _computeAnalyticsSync({
          rawTransactions,
          accounts,
          loans: _cache.loans.data,
          goals: _cache.goals.data,
          budgets: _cache.budgets.data,
          reportRates: mixed ? _ratesCache : null,
        });
        _cache.analytics = { data: computed, ts: Date.now() };
        return computed;
      }
    } catch {}
  }
  return null;
};

// Surgical invalidation: only wipe related keys, not everything.
// Keys kept fresh by a live listener are skipped — the listener already has the latest data.
export const invalidateCache = (...keys) => {
  if (keys.length === 0) {
    cacheEpoch++;
    Object.keys(_inflight).forEach(k => delete _inflight[k]);
    Object.keys(_cache).forEach(k => delete _cache[k]);
  } else {
    keys.forEach(k => { if (!_live[k]) delete _cache[k]; });
  }
};

// Prefetch most-used data silently after login — makes every page feel instant
export const prefetchAll = () => {
  return new Promise((resolve) => {
    setTimeout(async () => {
      try {
        await Promise.allSettled([
          fetchAccounts(),
          fetchTransactions(),
          fetchLoans(),
          fetchRecurringTransactions(),
          fetchBills(),
          fetchGoals(),
          fetchBudgets(),
          fetchCreditCards(),
          fetchInvestments(),
          fetchAnalytics()
        ]);
      } catch {}
      resolve();
    }, 0);
  });
};

export const getUserId = () => {
  if (auth.currentUser?.uid) {
    return Promise.resolve(auth.currentUser.uid);
  }
  return new Promise((resolve) => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      unsubscribe();
      resolve(user?.uid || null);
    });
  });
};

// Helper to get all docs from a collection for current user
const fetchCollection = async (collName) => {
  const uid = await getUserId();
  if (!uid) return [];
  const querySnapshot = await getDocs(query(collection(db, collName), where('uid', '==', uid)));
  return querySnapshot.docs.map(d => ({ ...d.data(), id: String(d.id) }));
};

// Helper: get all account refs and snaps upfront to respect Firestore read-before-write rules
const _getAccountsForTxn = async (txn, accountIds, allowMissing = false) => {
  const accountsData = {};
  const seen = new Set();
  for (const accId of accountIds) {
    if (accId != null && accId !== '' && accId !== 'mark-only') {
      const key = String(accId);
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = doc(db, 'accounts', key);
      const snap = await txn.get(ref);
      if (!snap.exists() || snap.data().uid !== auth.currentUser?.uid) {
        if (allowMissing) continue;
        throw new Error('Account not found');
      }
      accountsData[key] = { ref, balance: snap.data().balance, currency: snap.data().currency || 'LKR', archived: !!snap.data().archived };
    }
  }
  return accountsData;
};

// --- ACCOUNTS ---
export const fetchAccounts = () => cachedFetch('accounts', () => fetchCollection('accounts'));
export const createAccount = async (data) => {
  const uid = await getUserId();
  const newData = { ...data, balance: data.balance || 0, opening_balance: data.balance || 0, currency: data.currency || getCurrency(), uid };
  const docRef = await addDoc(collection(db, 'accounts'), newData);
  const newItem = { ...newData, id: String(docRef.id) };
  // Optimistic: patch accounts cache immediately
  _patchCache('accounts', old => old ? [...old, newItem] : [newItem]);
  invalidateCache('analytics');
  return { id: String(docRef.id) };
};
export const updateAccount = async (id, data) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  if ('balance' in data || 'opening_balance' in data) throw new Error('Use balance reconciliation to adjust balances');
  const details = Object.fromEntries(Object.entries(data).filter(([key]) => ['name','type','currency','cashback_rate','rewards_earned'].includes(key)));
  const history = data.currency ? await fetchCollection('transactions') : [];
  const ref = doc(db, 'accounts', String(id));
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Account not found');
    if (data.currency && (snap.data().currency || 'LKR') !== data.currency) {
      if (history.some(t => String(t.from_account_id) === String(id) || String(t.to_account_id) === String(id))) throw new Error('Create a separate account for a different currency; this account already has transaction history');
      throw new Error('Create a separate account for a different currency');
    }
    txn.update(ref, details);
  });
  invalidateCache('accounts'); invalidateCache('analytics'); refreshLedger();
};
export const setOpeningBalance = async (id, opening, expectedBalance) => {
  if (!Number.isFinite(opening) || Math.abs(opening) > 1e12 || roundMoney(opening) !== opening) throw new Error('Enter an opening balance with at most two decimals');
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const ref = doc(db, 'accounts', String(id));
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Account not found');
    if (Number.isFinite(snap.data().opening_balance)) throw new Error('Opening balance already set');
    if (roundMoney(snap.data().balance) !== roundMoney(expectedBalance)) throw new Error('Balance changed. Refresh and review again');
    txn.update(ref, { opening_balance: opening, opening_balance_recorded_at: new Date().toISOString() });
  });
  invalidateCache('accounts'); refreshLedger();
};
export const setAccountArchived = async (id, archived) => {
  const uid = await getUserId();
  const ref = doc(db, 'accounts', String(id));
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Account not found');
    txn.update(ref, { archived: !!archived });
  });
  invalidateCache('accounts'); invalidateCache('analytics');
};
export const reconcileBalance = async (id, expectedBalance, actualBalance, note) => {
  if (!Number.isFinite(actualBalance) || Math.abs(actualBalance) > 1e12 || roundMoney(actualBalance) !== actualBalance) throw new Error('Enter a valid balance with at most two decimals');
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const accountRef = doc(db, 'accounts', String(id)), entryRef = doc(collection(db, 'transactions'));
  await runTransaction(db, async txn => {
    const snap = await txn.get(accountRef);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Account not found');
    if (snap.data().archived) throw new Error('Restore the archived account first');
    if (roundMoney(snap.data().balance) !== roundMoney(expectedBalance)) throw new Error('The balance changed. Refresh and reconcile again.');
    const difference = roundMoney(actualBalance - roundMoney(expectedBalance));
    if (!difference) return;
    txn.update(accountRef, { balance: actualBalance, last_ledger_ref: String(entryRef.id), last_ledger_op: 'reconcile' });
    txn.set(entryRef, { uid, type: difference > 0 ? 'Income' : 'Expense', amount: Math.abs(difference),
      currency: snap.data().currency || 'LKR', date: todayYMD(), category: 'Reconciliation', notes: note || 'Balance reconciliation',
      from_account_id: difference < 0 ? String(id) : null, to_account_id: difference > 0 ? String(id) : null,
      reconciliation: true, recorded_at: new Date().toISOString() });
  });
  refreshLedger();
};

export const deleteAccount = async (id) => {
  const transactions = await fetchCollection('transactions');
  if (transactions.some(t => String(t.from_account_id) === String(id) || String(t.to_account_id) === String(id)))
    throw new Error('This account has transaction history. Keep it to preserve your ledger.');
  const result = await deleteDoc(doc(db, 'accounts', String(id)));
  _patchCache('accounts', old => old ? old.filter(a => String(a.id) !== String(id)) : old);
  invalidateCache('analytics');
  return result;
};

// --- TRANSACTIONS ---
export const fetchTransactions = async () => cachedFetch('transactions', async () => {
  const uid = await getUserId();
  const q = query(collection(db, 'transactions'), where('uid', '==', uid));
  const querySnapshot = await getDocs(q);
  const docs = querySnapshot.docs.map(d => ({ ...d.data(), id: String(d.id) }));
  return docs.sort((a, b) => new Date(b.date) - new Date(a.date));
});

// Use confirmed writes for financial mutations; failed requests never leave invented balances in cache.
const refreshLedger = () => {
  for (const key of ['transactions', 'accounts', 'analytics']) delete _cache[key];
  _emit('transactions');
};
const assertEditable = (data) => {
  if (data.reversed_at || data.reversal_of) throw new Error('Reversal audit records cannot be edited or deleted');
  if (data.is_transfer_fee) throw new Error('Edit or delete the parent transfer to change this fee');
  if (data.invoice_id) throw new Error('Invoice settlements cannot be edited or deleted as ordinary transactions');
};
// Older versions did not store a fee link. Resolve only a unique exact match; never guess.
const findFeeRef = async (id, data) => {
  if (data.fee_transaction_id) return doc(db, 'transactions', data.fee_transaction_id);
  if (data.type !== 'Transfer' || !data.fee_amount) return null;
  const rows = await fetchCollection('transactions');
  const candidates = rows.filter(t => t.is_transfer_fee && !t.parent_transaction_id &&
    String(t.from_account_id) === String(data.from_account_id) && t.date === data.date && Number(t.amount) === Number(data.fee_amount) &&
    t.notes === `Transfer fee for ${data.notes || 'transfer'}`);
  if (candidates.length > 1) throw new Error('This older transfer has ambiguous fee entries. Reconcile its duplicate fees before editing.');
  return candidates.length ? doc(db, 'transactions', String(candidates[0].id)) : null;
};
const _txAccountIds = t => !t ? [] : t.type === 'Income' ? [t.to_account_id] : t.type === 'Transfer' ? [t.from_account_id, t.to_account_id] : [t.from_account_id];
// Same-currency transfers always receive exactly what was sent; a stray or stale
// received amount would silently credit the wrong value. Cross-currency edits that
// change the sent amount must also restate the received amount.
const _normalizeTransferAmounts = (accounts, next, old = null) => {
  if (next.type !== 'Transfer') { delete next.destination_amount; return; }
  const fromCur = accounts[String(next.from_account_id)]?.currency;
  const toCur = accounts[String(next.to_account_id)]?.currency;
  if (fromCur && toCur && fromCur === toCur) { delete next.destination_amount; return; }
  if (old && old.type === 'Transfer' && next.destination_amount != null &&
      Number(next.amount) !== Number(old.amount) && Number(next.destination_amount) === Number(old.destination_amount))
    throw new Error('You changed the amount sent. Update the amount received in the other currency too.');
};
export const createTransaction = async (data, requestId = null, expectedUid = null) => {
  let processedData = { ...data };
  if (processedData.type !== 'Transfer' || processedData.destination_amount === '') delete processedData.destination_amount;
  if (!processedData.isSplit) processedData.splits = null;
  const rules = await fetchRules();
  if (rules.length) processedData = executeRulesOnTransaction(rules, processedData).transaction;
  processedData.from_account_id = processedData.type === 'Income' ? null : (processedData.from_account_id != null && processedData.from_account_id !== '' ? String(processedData.from_account_id) : null);
  processedData.to_account_id = ['Income', 'Transfer'].includes(processedData.type) ? (processedData.to_account_id != null && processedData.to_account_id !== '' ? String(processedData.to_account_id) : null) : null;
  if (processedData.loan_id != null && processedData.loan_id !== '') processedData.loan_id = String(processedData.loan_id);
  if (processedData.goal_id != null && processedData.goal_id !== '') processedData.goal_id = String(processedData.goal_id);
  assertEditable(processedData);
  validateTransaction(processedData);
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  if (expectedUid && uid !== expectedUid) throw new Error('Account changed. Sign in again to sync these drafts.');
  if (requestId && !/^[a-zA-Z0-9-]{1,80}$/.test(requestId)) throw new Error('Invalid draft identity');
  const ref = requestId ? doc(db, 'transactions', `${uid}_draft_${requestId}`) : doc(collection(db, 'transactions'));
  const feeRef = doc(collection(db, 'transactions'));
  const fee = transferFee(processedData, ref.id, uid);
  const payload = { ...processedData, uid, fee_transaction_id: fee ? feeRef.id : null };
  await runTransaction(db, async txn => {
    if (requestId) {
      const existing = await txn.get(ref);
      if (existing.exists()) { if (existing.data().uid !== uid) throw new Error('Payment belongs to another user'); return; }
    }
    const accounts = await _getAccountsForTxn(txn, new Set(_txAccountIds(payload)));
    if (Object.values(accounts).some(a => a.archived)) throw new Error('Restore the archived account before recording a payment');
    _normalizeTransferAmounts(accounts, payload);
    payload.currency = accounts[payload.from_account_id || payload.to_account_id]?.currency;
    const preBalances = {};
    for (const [aid, acc] of Object.entries(accounts)) preBalances[aid] = acc.balance;
    _mutateBalances(accounts, payload);
    for (const account of Object.values(accounts)) txn.update(account.ref, { balance: account.balance, last_ledger_ref: String(ref.id), last_ledger_op: 'create' });
    payload.recorded_at = payload.recorded_at || new Date().toISOString();
    payload.reversal_context = Object.entries(accounts)
      .filter(([aid, acc]) => acc.balance !== preBalances[aid])
      .map(([aid, acc]) => ({
        path: `accounts/${aid}`,
        before: { balance: preBalances[aid] },
        absent: [],
        after: { balance: acc.balance },
      }));
    txn.set(ref, payload);
    if (fee) txn.set(feeRef, fee);
  });
  refreshLedger();
  return { success: true, item: { ...payload, id: String(ref.id) } };
};

const changeTransaction = async (id, updates) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const ref = doc(db, 'transactions', String(id));
  const initial = await getDoc(ref);
  if (!initial.exists()) throw new Error('Transaction not found');
  const original = initial.data();
  assertEditable(original);
  const oldFeeRef = await findFeeRef(id, original);
  const newFeeRef = oldFeeRef || doc(collection(db, 'transactions'));
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Transaction not found');
    const old = snap.data();
    assertEditable(old);
    const next = updates ? { ...old, ...updates, uid, is_transfer_fee: false, parent_transaction_id: null } : null;
    if (next) {
      if ((old.loan_id || old.goal_id || old.bill_id || old.credit_card_id || old.credit_card_charge_id) && next.type !== old.type) {
        throw new Error('Cannot change the transaction type of a linked loan, goal, bill, or card entry');
      }
      if (!next.isSplit) next.splits = null;
      next.from_account_id = next.type === 'Income' ? null : (next.from_account_id != null && next.from_account_id !== '' ? String(next.from_account_id) : null);
      next.to_account_id = ['Income', 'Transfer'].includes(next.type) ? (next.to_account_id != null && next.to_account_id !== '' ? String(next.to_account_id) : null) : null;
      if (next.loan_id != null && next.loan_id !== '') next.loan_id = String(next.loan_id);
      if (next.goal_id != null && next.goal_id !== '') next.goal_id = String(next.goal_id);
      if (next.type !== 'Transfer' || next.destination_amount == null || next.destination_amount === '') delete next.destination_amount;
      // A card charge is paid by the card, not a bank account: adding an account
      // would take the money twice (from the bank and on the card balance).
      if (next.credit_card_charge_id && !next.credit_card_id && (next.from_account_id || next.to_account_id) &&
          !(old.from_account_id || old.to_account_id))
        throw new Error('This is a credit card purchase, so it can’t also come from an account. Pay the card from the Credit Cards page instead.');
      const allowOptionalAcct = Boolean(
        next.credit_card_charge_id ||
        (!next.from_account_id && !old.from_account_id && (next.loan_id || next.goal_id || next.bill_id || next.recurring_rule_id)) ||
        (!next.to_account_id && !old.to_account_id && (next.goal_id || next.recurring_rule_id))
      );
      assertEditable(next);
      validateTransaction(
        allowOptionalAcct
          ? {
              ...next,
              from_account_id: next.from_account_id || (next.type !== 'Income' ? 'mark-only' : null),
              to_account_id: next.to_account_id || (['Income', 'Transfer'].includes(next.type) ? 'mark-only' : null),
            }
          : next
      );
    }
    // If legacy fee resolution happened outside the transaction, ensure fee-critical fields didn't change (only on edit)
    if (next && !original.fee_transaction_id && original.type === 'Transfer' && original.fee_amount) {
      if (old.type !== original.type || Number(old.fee_amount) !== Number(original.fee_amount) || String(old.from_account_id) !== String(original.from_account_id) || old.date !== original.date) {
        throw new Error('Transfer changed during fee resolution. Refresh and try again.');
      }
    }
    const feeSnap = oldFeeRef ? await txn.get(oldFeeRef) : null;
    const canDeleteFee = feeSnap?.exists() && feeSnap.data().uid === uid && feeSnap.data().is_transfer_fee &&
      (!feeSnap.data().parent_transaction_id || String(feeSnap.data().parent_transaction_id) === String(id));
    if (next && feeSnap?.exists() && !canDeleteFee) throw new Error('Invalid transfer fee link');
    const accounts = await _getAccountsForTxn(txn, new Set([..._txAccountIds(old), ..._txAccountIds(next)]), !next);
    if (next) {
      const oldIds = new Set(_txAccountIds(old).filter(Boolean).map(String));
      if (_txAccountIds(next).some(aid => aid && !oldIds.has(String(aid)) && accounts[String(aid)]?.archived))
        throw new Error('Restore the archived account before moving a payment into it');
      _normalizeTransferAmounts(accounts, next, old);
    }

    // --- READ PHASE: All reads must happen before any writes ---
    const linkedTargetSnaps = [];
    if (!next && old.reversal_context?.length) {
      for (const target of old.reversal_context) {
        const parts = target.path.split('/');
        if (parts[0] !== 'accounts') {
          const targetRef = doc(db, ...parts);
          const current = await txn.get(targetRef);
          linkedTargetSnaps.push({ target, targetRef, current, isUsers: parts[0] === 'users' });
        }
      }
    }

    const targetGoalRef = (!next ? old.goal_id : (Number(next.amount) !== Number(old.amount) ? next.goal_id : null))
      ? doc(db, 'goals', String(!next ? old.goal_id : next.goal_id)) : null;
    const targetGoalSnap = targetGoalRef ? await txn.get(targetGoalRef) : null;

    const targetLoanRef = (!next ? old.loan_id : (Number(next.amount) !== Number(old.amount) ? next.loan_id : null))
      ? doc(db, 'loans', String(!next ? old.loan_id : next.loan_id)) : null;
    const targetLoanSnap = targetLoanRef ? await txn.get(targetLoanRef) : null;

    const oldCardId = old.credit_card_id || old.credit_card_charge_id;
    const nextCardId = next ? (next.credit_card_id || next.credit_card_charge_id) : null;
    const cardIdToRead = !next ? oldCardId : (Number(next.amount) !== Number(old.amount) ? nextCardId : null);
    const isCardCharge = Boolean((next ? (next.credit_card_charge_id && !next.credit_card_id) : (old.credit_card_charge_id && !old.credit_card_id)));
    const targetCardRef = cardIdToRead ? doc(db, 'credit_cards', String(cardIdToRead)) : null;
    const targetCardSnap = targetCardRef ? await txn.get(targetCardRef) : null;

    const targetBillRef = (!next && old.bill_id) ? doc(db, 'users', uid, 'bills', String(old.bill_id)) : null;
    const targetBillSnap = targetBillRef ? await txn.get(targetBillRef) : null;

    const ruleIdToSync = !next
      ? old.recurring_rule_id
      : (Number(next.amount) !== Number(old.amount) ? (next.recurring_rule_id || old.recurring_rule_id) : null);
    const targetRuleRef = ruleIdToSync ? doc(db, 'recurring_transactions', String(ruleIdToSync)) : null;
    const targetRuleSnap = targetRuleRef ? await txn.get(targetRuleRef) : null;

    if (next) {
      const primaryAccId = next.type === 'Income' ? next.to_account_id : (next.from_account_id || next.to_account_id);
      if (primaryAccId && accounts[primaryAccId]?.currency) next.currency = accounts[primaryAccId].currency;
      else if (targetCardSnap?.exists() && targetCardSnap.data().currency) next.currency = targetCardSnap.data().currency;
    }

    // --- WRITE PHASE: All writes happen here ---
    const nextAllowOptionalAcct = Boolean(
      next && (
        next.credit_card_charge_id ||
        (!next.from_account_id && !old.from_account_id && (next.loan_id || next.goal_id || next.bill_id || next.recurring_rule_id)) ||
        (!next.to_account_id && !old.to_account_id && (next.goal_id || next.recurring_rule_id))
      )
    );
    const nextHasAccounts = Boolean(
      next && (
        next.type === 'Income' ? next.to_account_id :
        next.type === 'Transfer' ? (next.from_account_id && next.to_account_id) :
        next.from_account_id
      )
    );
    _mutateBalances(accounts, old, true);
    const preNextBalances = {};
    for (const [aid, acc] of Object.entries(accounts)) preNextBalances[aid] = acc.balance;
    if (next && (nextHasAccounts || !nextAllowOptionalAcct)) _mutateBalances(accounts, next);
    for (const account of Object.values(accounts)) txn.update(account.ref, { balance: account.balance, last_ledger_ref: String(id), last_ledger_op: next ? 'update' : 'delete' });
    if (next) {
      const financialChanged =
        Number(next.amount) !== Number(old.amount) ||
        next.type !== old.type ||
        String(next.from_account_id || '') !== String(old.from_account_id || '') ||
        String(next.to_account_id || '') !== String(old.to_account_id || '') ||
        Number(next.fee_amount || 0) !== Number(old.fee_amount || 0) ||
        Number(next.destination_amount || 0) !== Number(old.destination_amount || 0);
      if (financialChanged && Array.isArray(old.reversal_context)) {
        const hasNonAccountTarget = old.reversal_context.some(t => !String(t.path || '').startsWith('accounts/'));
        // Moving a payment to another account leaves its loan/goal/card/bill
        // effect unchanged, so that part of the undo snapshot stays valid.
        const onlyAccountChanged =
          Number(next.amount) === Number(old.amount) && next.type === old.type &&
          Number(next.fee_amount || 0) === Number(old.fee_amount || 0) &&
          Number(next.destination_amount || 0) === Number(old.destination_amount || 0);
        if (hasNonAccountTarget && !onlyAccountChanged) {
          next.reversal_context = null;
        } else {
          const keptTargets = old.reversal_context.filter(t => !String(t.path || '').startsWith('accounts/'));
          next.reversal_context = [...keptTargets, ...Object.entries(accounts)
            .filter(([aid, acc]) => acc.balance !== preNextBalances[aid])
            .map(([aid, acc]) => ({
              path: `accounts/${aid}`,
              before: { balance: preNextBalances[aid] },
              absent: [],
              after: { balance: acc.balance },
            }))];
        }
      }
    }

    // Handle rollback/reconciliation for linked entities (goals, loans, credit cards, bills, recurring)
    const isGoalDeduction = (next ? (next.category || old.category) : old.category) === 'Goal Deduction' || (next ? (next.type || old.type) : old.type) === 'Income';
    if (!next) {
      if (linkedTargetSnaps.length > 0) {
        for (const { target, targetRef, current, isUsers } of linkedTargetSnaps) {
          if (current.exists() && (isUsers || current.data().uid === uid)) {
            const matchesAfter = target.after && Object.entries(target.after).every(
              ([k, v]) => JSON.stringify(current.data()[k]) === JSON.stringify(v)
            );
            if (matchesAfter) {
              const update = { ...target.before };
              for (const key of target.absent || []) update[key] = deleteField();
              if (targetRef.path.startsWith('recurring_transactions/')) update.reversal_sequence = (current.data().reversal_sequence || 0) + 1;
              txn.update(targetRef, update);
            } else if (targetRef.path.startsWith('loans/')) {
              throw new Error('A later payment or change affects this loan. Delete or reverse newer loan payments first.');
            } else if (targetRef.path.startsWith('goals/')) {
              const delta = isGoalDeduction ? (Number(old.amount) || 0) : -(Number(old.amount) || 0);
              const newCur = Math.max(0, roundMoney((current.data().current_amount || 0) + delta));
              txn.update(targetRef, { current_amount: newCur, is_achieved: newCur >= (current.data().target_amount || 0) });
            } else if (targetRef.path.startsWith('credit_cards/')) {
              const delta = isCardCharge ? -(Number(old.amount) || 0) : (Number(old.amount) || 0);
              txn.update(targetRef, { balance: Math.max(0, roundMoney((current.data().balance || 0) + delta)) });
            } else if (targetRef.path.startsWith('recurring_transactions/')) {
              const data = current.data();
              const nextHist = (data.payment_history || []).filter(h => String(h.transaction_id) !== String(id));
              const recUpdate = { payment_history: nextHist, reversal_sequence: (data.reversal_sequence || 0) + 1 };
              if (data.last_applied_month === old.recurring_month) {
                const latest = nextHist[nextHist.length - 1] || null;
                recUpdate.last_applied_month = latest ? latest.month : null;
                recUpdate.last_paid_amount = latest ? latest.amount : deleteField();
                recUpdate.last_paid_date = latest ? latest.date : deleteField();
                recUpdate.last_paid_account_id = latest ? (latest.account_id || null) : deleteField();
                recUpdate.last_paid_marked_only = latest ? Boolean(latest.marked_only) : false;
              }
              txn.update(targetRef, recUpdate);
            }
          }
        }
      } else {
        if (targetGoalSnap?.exists() && targetGoalSnap.data().uid === uid) {
          const delta = isGoalDeduction ? (Number(old.amount) || 0) : -(Number(old.amount) || 0);
          const newCur = Math.max(0, roundMoney((targetGoalSnap.data().current_amount || 0) + delta));
          txn.update(targetGoalRef, { current_amount: newCur, is_achieved: newCur >= (targetGoalSnap.data().target_amount || 0) });
        }
        if (targetLoanSnap?.exists() && targetLoanSnap.data().uid === uid) {
          // Without the snapshot we can't tell how much of this payment was
          // interest, so adding it all back to the principal would be a guess.
          throw new Error('This older loan payment has no undo record. Edit the loan balance on the Loans page instead of deleting it.');
        }
        if (targetCardSnap?.exists() && targetCardSnap.data().uid === uid) {
          const delta = isCardCharge ? -(Number(old.amount) || 0) : (Number(old.amount) || 0);
          const newBal = Math.max(0, roundMoney((targetCardSnap.data().balance || 0) + delta));
          txn.update(targetCardRef, { balance: newBal });
        }
        if (targetBillSnap?.exists()) {
          txn.update(targetBillRef, { paid: false });
        }
        if (targetRuleSnap?.exists() && targetRuleSnap.data().uid === uid) {
          const data = targetRuleSnap.data();
          const nextHist = (data.payment_history || []).filter(h => String(h.transaction_id) !== String(id));
          const recUpdate = { payment_history: nextHist, reversal_sequence: (data.reversal_sequence || 0) + 1 };
          if (data.last_applied_month === old.recurring_month) {
            const latest = nextHist[nextHist.length - 1] || null;
            recUpdate.last_applied_month = latest ? latest.month : null;
            recUpdate.last_paid_amount = latest ? latest.amount : deleteField();
            recUpdate.last_paid_date = latest ? latest.date : deleteField();
            recUpdate.last_paid_account_id = latest ? (latest.account_id || null) : deleteField();
            recUpdate.last_paid_marked_only = latest ? Boolean(latest.marked_only) : false;
          }
          txn.update(targetRuleRef, recUpdate);
        }
      }
    } else if (Number(next.amount) !== Number(old.amount)) {
      if (targetGoalSnap?.exists() && targetGoalSnap.data().uid === uid) {
        const delta = isGoalDeduction
          ? roundMoney(Number(old.amount) - Number(next.amount))
          : roundMoney(Number(next.amount) - Number(old.amount));
        const newCur = Math.max(0, roundMoney((targetGoalSnap.data().current_amount || 0) + delta));
        txn.update(targetGoalRef, { current_amount: newCur, is_achieved: newCur >= (targetGoalSnap.data().target_amount || 0) });
      }
      if (targetLoanSnap?.exists() && targetLoanSnap.data().uid === uid) {
        // A loan payment was split into interest and principal when it was
        // made; shifting only the principal here would leave that split
        // wrong. Reversing and paying again recalculates it properly.
        throw new Error('To change a loan payment amount, delete it and record the payment again.');
      }
      if (targetCardSnap?.exists() && targetCardSnap.data().uid === uid) {
        const delta = isCardCharge
          ? roundMoney(Number(next.amount) - Number(old.amount))
          : roundMoney(Number(old.amount) - Number(next.amount));
        const newBal = Math.max(0, roundMoney((targetCardSnap.data().balance || 0) + delta));
        txn.update(targetCardRef, { balance: newBal });
      }
      if (targetRuleSnap?.exists() && targetRuleSnap.data().uid === uid) {
        const data = targetRuleSnap.data();
        const nextAmt = roundMoney(Number(next.amount));
        const nextHist = (data.payment_history || []).map(h =>
          String(h.transaction_id) === String(id) ? { ...h, amount: nextAmt } : h
        );
        const recUpdate = { payment_history: nextHist };
        if (data.last_applied_month === old.recurring_month || nextHist.some(h => String(h.transaction_id) === String(id) && h.month === data.last_applied_month)) {
          recUpdate.last_paid_amount = nextAmt;
        }
        txn.update(targetRuleRef, recUpdate);
      }
    }

    const fee = next ? transferFee(next, String(id), uid) : null;
    if (fee) txn.set(newFeeRef, fee);
    else if (canDeleteFee) txn.delete(oldFeeRef);
    if (next) txn.set(ref, { ...next, fee_transaction_id: fee ? newFeeRef.id : null });
    else txn.delete(ref);
  });
  if (original.goal_id || updates?.goal_id) invalidateCache('goals');
  if (original.loan_id || updates?.loan_id) invalidateCache('loans');
  if (original.credit_card_id || updates?.credit_card_id || original.credit_card_charge_id || updates?.credit_card_charge_id) invalidateCache('credit_cards');
  if (original.bill_id || updates?.bill_id) invalidateCache('bills');
  if (original.recurring_rule_id || updates?.recurring_rule_id) invalidateCache('recurring');
  refreshLedger();
  return { success: true };
};
export const deleteTransaction = id => changeTransaction(id, null);
export const updateTransaction = (id, data) => changeTransaction(id, data);

// --- RECURRING TRANSACTIONS ---
export const fetchRecurringTransactions = () => cachedFetch('recurring', () => fetchCollection('recurring_transactions'));

export const createRecurringTransaction = async (data) => {
  const uid = await getUserId();
  const payload = {
    ...data,
    name: String(data.name || data.category || data.notes || data.type || 'Recurring').trim(),
    from_account_id: data.from_account_id != null && data.from_account_id !== '' ? String(data.from_account_id) : null,
    to_account_id: data.to_account_id != null && data.to_account_id !== '' ? String(data.to_account_id) : null,
    loan_id: data.loan_id != null && data.loan_id !== '' ? String(data.loan_id) : null,
    uid,
    schedule_mode: data.schedule_mode || (data.day_of_month ? 'fixed' : 'flexible'),
    is_variable: Boolean(data.is_variable),
    payment_history: Array.isArray(data.payment_history) ? data.payment_history : [],
    last_applied_month: data.last_applied_month || null,
  };
  const docRef = await addDoc(collection(db, 'recurring_transactions'), payload);
  _patchCache('recurring', old => old ? [{ ...payload, id: String(docRef.id) }, ...old] : null);
  return { id: String(docRef.id) };
};

export const deleteRecurringTransaction = async (id) => {
  _patchCache('recurring', old => old ? old.filter(r => String(r.id) !== String(id)) : old);
  return deleteDoc(doc(db, 'recurring_transactions', String(id)));
};

export const updateRecurringTransaction = async (id, data) => {
  const cleanData = { ...data };
  if ('from_account_id' in cleanData) cleanData.from_account_id = cleanData.from_account_id != null && cleanData.from_account_id !== '' ? String(cleanData.from_account_id) : null;
  if ('to_account_id' in cleanData) cleanData.to_account_id = cleanData.to_account_id != null && cleanData.to_account_id !== '' ? String(cleanData.to_account_id) : null;
  if ('loan_id' in cleanData) cleanData.loan_id = cleanData.loan_id != null && cleanData.loan_id !== '' ? String(cleanData.loan_id) : null;
  _patchCache('recurring', old => old ? old.map(r => String(r.id) === String(id) ? { ...r, ...cleanData } : r) : old);
  return updateDoc(doc(db, 'recurring_transactions', String(id)), cleanData);
};

// Pay a single recurring rule for the current (or chosen) month — strictly manual, supports variable amounts, account choice & Gold Loan payments
// Capture affected fields inside the same commit as the payment. Existing payments
// without these snapshots remain protected from unsafe guessed reversals.
const auditedPayment = async (database, callback) => runTransaction(database, async transaction => {
  const snapshots = new Map(), writes = [], targets = [];
  let primaryTxId = null;
  const txn = {
    get: async ref => { const snap = await transaction.get(ref); snapshots.set(ref.path, snap.data()); return snap; },
    update: (ref, changes) => {
      const old = snapshots.get(ref.path);
      if (!old) throw new Error('Payment audit requires reading the record first');
      const before = {}, absent = [];
      for (const key of Object.keys(changes)) { if (Object.hasOwn(old, key)) before[key] = old[key]; else absent.push(key); }
      targets.push({ path: ref.path, before, absent, after: changes });
      writes.push(() => transaction.update(ref, {
        ...changes,
        ...(ref.path.startsWith('accounts/')
          ? (Object.hasOwn(changes, 'balance') && primaryTxId ? { last_ledger_ref: String(primaryTxId), last_ledger_op: 'create' } : {})
          : { has_payment_history: true })
      }));
    },
    set: (ref, data) => {
      if (ref.path.startsWith('transactions/') && !data.is_transfer_fee) primaryTxId = ref.id;
      writes.push(() => transaction.set(ref, data.is_transfer_fee ? data : { ...data, currency: data.currency || snapshots.get(`accounts/${data.from_account_id || data.to_account_id}`)?.currency || getCurrency(), recorded_at: new Date().toISOString(), reversal_context: targets }));
    },
  };
  await callback(txn);
  for (const write of writes) write();
});

export const reversePayment = async (id, reason) => {
  if (!reason?.trim()) throw new Error('Enter a reason for the reversal');
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const ref = doc(db, 'transactions', String(id));
  const reversalRef = doc(db, 'transactions', `${id}_reversal`);
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref), existing = await txn.get(reversalRef);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Payment not found');
    const payment = snap.data();
    if (existing.exists() || payment.reversed_at) throw new Error('Payment already reversed');
    if (!payment.reversal_context?.length || payment.reversal_of) throw new Error('This older payment has no safe reversal snapshot');
    const changes = [];
    for (const target of payment.reversal_context) {
      const parts = target.path.split('/');
      if (!(['accounts','loans','goals','credit_cards','recurring_transactions'].includes(parts[0]) && parts.length === 2) && !(parts.length === 4 && parts[0] === 'users' && parts[1] === uid && parts[2] === 'bills')) throw new Error('Invalid payment audit reference');
      const targetRef = doc(db, ...parts), current = await txn.get(targetRef);
      if (!current.exists() || (parts[0] !== 'users' && current.data().uid !== uid)) throw new Error('Linked record unavailable');
      let update;
      if (parts[0] === 'accounts') {
        update = { balance: addMoney(current.data().balance, subMoney(target.before.balance, target.after.balance)), last_ledger_ref: String(reversalRef.id), last_ledger_op: 'reverse' };
      } else {
        for (const [key, value] of Object.entries(target.after)) if (JSON.stringify(current.data()[key]) !== JSON.stringify(value)) throw new Error('A later change affects this payment. Reverse newer payments first.');
        update = { ...target.before };
        for (const key of target.absent) update[key] = deleteField();
        if (parts[0] === 'recurring_transactions') update.reversal_sequence = (current.data().reversal_sequence || 0) + 1;
      }
      changes.push([targetRef, update]);
    }
    const feeRef = payment.fee_transaction_id ? doc(db, 'transactions', payment.fee_transaction_id) : null;
    const fee = feeRef ? await txn.get(feeRef) : null;
    if (feeRef && (!fee.exists() || fee.data().uid !== uid || fee.data().parent_transaction_id !== id)) throw new Error('Transfer fee linkage has changed');
    const now = new Date().toISOString();
    const reversal = { uid, amount: payment.amount, type: payment.type === 'Income' ? 'Expense' : 'Income', date: todayYMD(), category: 'Payment reversal',
      notes: reason.trim(), reversal_of: id, recorded_at: now, from_account_id: payment.to_account_id || null, to_account_id: payment.from_account_id || null };
    if (payment.goal_id) reversal.goal_id = payment.goal_id;
    if (payment.type === 'Transfer') Object.assign(reversal, { type: 'Transfer', amount: payment.destination_amount ?? payment.amount, destination_amount: roundMoney(payment.amount + (payment.fee_amount || 0)), fee_amount: 0 });
    for (const [target, update] of changes) txn.update(target, update);
    txn.update(ref, { reversed_at: now, reversed_by: reversalRef.id });
    if (feeRef) txn.update(feeRef, { reversed_at: now, reversed_by: reversalRef.id });
    txn.set(reversalRef, reversal);
  });
  invalidateCache(); refreshLedger();
  return { success: true };
};

export const payRecurringRule = async (rule, paymentData = {}) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const date = paymentData.date || todayYMD();
  const month = date.slice(0, 7);
  const ruleRef = doc(db, 'recurring_transactions', String(rule.id));

  let updates;
  let alreadyPaid = false;
  let transactionId = null;
  await auditedPayment(db, async txn => {
    const snap = await txn.get(ruleRef);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Recurring payment not found');
    const current = snap.data();
    if (current.paused) throw new Error('Resume this recurring payment first');

    const amount = Number(paymentData.amount ?? current.amount);
    const type = current.loan_id ? 'Loan Payment' : current.type || 'Expense';
    const hasExplicitAccount = Object.hasOwn(paymentData, 'account_id');
    const rawSource = hasExplicitAccount
      ? paymentData.account_id
      : (type === 'Income' ? current.to_account_id : current.from_account_id);
    const source = rawSource != null && rawSource !== '' && rawSource !== 'mark-only' ? String(rawSource) : null;
    const rawDest = type === 'Income' ? source : (paymentData.to_account_id ?? current.to_account_id);
    const destination = rawDest != null && rawDest !== '' && rawDest !== 'mark-only' ? String(rawDest) : null;
    const markOnly = Boolean(paymentData.markOnly) || (type !== 'Transfer' && !source);

    // Skip if already applied this month (unless forced)
    if (!paymentData.force && (current.last_applied_month === month || (current.payment_history || []).some(h => h.month === month && !h.marked_only))) {
      alreadyPaid = true;
      return;
    }

    validateTransaction({
      type,
      amount,
      date,
      from_account_id: source || (markOnly ? 'mark-only' : null),
      to_account_id: destination || (markOnly ? 'mark-only' : null),
      fee_amount: current.fee_amount || 0
    });

    const accounts = markOnly ? {} : await _getAccountsForTxn(txn, new Set([type === 'Income' ? null : source, ['Income','Transfer'].includes(type) ? destination : null]));
    if (Object.values(accounts).some(a => a.archived)) throw new Error('Restore the archived account before recording a payment');

    let loanRef, loanUpdate;
    if (current.loan_id) {
      loanRef = doc(db, 'loans', String(current.loan_id));
      const loanSnap = await txn.get(loanRef);
      if (!loanSnap.exists() || loanSnap.data().uid !== uid) {
        if (!markOnly) throw new Error('Loan not found');
        loanRef = null;
      } else if (!markOnly) {
        requireMatchingCurrency(loanSnap.data(), accounts[source]);
        loanUpdate = calculateLoanPayment(loanSnap.data(), amount, date);
      } else {
        loanUpdate = { last_paid_month: month };
      }
    }

    const paymentRef = doc(collection(db, 'transactions'));
    const feeRef = doc(collection(db, 'transactions'));
    transactionId = markOnly ? null : paymentRef.id;

    const priorHistory = (current.payment_history || []).filter(h => !(h.month === month && h.marked_only));
    const history = [
      ...priorHistory,
      {
        month,
        amount,
        date,
        marked_only: markOnly,
        account_id: source || null,
        transaction_id: markOnly ? null : paymentRef.id
      }
    ].sort((a,b)=>a.month.localeCompare(b.month)).slice(-12);

    const recent = history.slice(-3);
    const average = roundMoney(recent.reduce((total,h)=>total+h.amount,0)/recent.length);
    const shouldUpdateEst = paymentData.updateEstimate !== undefined ? Boolean(paymentData.updateEstimate) : Boolean(current.is_variable);
    updates = {
      ...(current.name ? {} : { name: String(current.category || current.notes || 'Recurring').trim() }),
      last_applied_month: month,
      last_paid_amount: amount,
      last_paid_date: date,
      last_paid_account_id: source || null,
      last_paid_marked_only: markOnly,
      payment_history: history,
      avg_amount: shouldUpdateEst ? average : (current.avg_amount ?? current.amount ?? average)
    };
    if (shouldUpdateEst) updates.amount = average;

    if (!markOnly) {
      const entry = {
        uid,
        type,
        amount,
        date,
        from_account_id: type === 'Income' ? null : source,
        to_account_id: ['Income','Transfer'].includes(type) ? destination : null,
        fee_amount: current.fee_amount || 0,
        notes: paymentData.notes || `[Recurring] ${current.name || current.category || ''}`,
        category: current.category || 'Bills',
        recurring_rule_id: String(rule.id),
        recurring_month: month
      };
      if (current.loan_id) entry.loan_id = String(current.loan_id);
      if (type === 'Transfer') {
        // A cross-currency transfer must credit what was actually received. The
        // stored amount only applies when the payment matches the rule exactly.
        const fromCur = accounts[source]?.currency;
        const toCur = accounts[destination]?.currency;
        const explicit = Number(paymentData.destination_amount);
        const matchesRule = amount === Number(current.amount) && String(destination) === String(current.to_account_id ?? '');
        if (fromCur && toCur && fromCur === toCur) {
          // Same currency: the destination receives exactly what was sent.
        } else if (explicit > 0) {
          entry.destination_amount = roundMoney(explicit);
        } else if (matchesRule && Number(current.destination_amount) > 0) {
          entry.destination_amount = Number(current.destination_amount);
        } else if (fromCur && toCur) {
          throw new Error('This transfer is between two currencies. Enter the amount received.');
        }
        if (shouldUpdateEst && entry.destination_amount && amount > 0) {
          updates.destination_amount = roundMoney(updates.amount * entry.destination_amount / amount);
        }
      }
      const fee = transferFee(entry, paymentRef.id, uid);
      entry.fee_transaction_id = fee ? feeRef.id : null;

      _mutateBalances(accounts, entry);
      for (const account of Object.values(accounts)) {
        txn.update(account.ref, { balance: account.balance });
      }
      if (loanRef) txn.update(loanRef, { ...loanUpdate, has_payment_history: true });
      txn.set(paymentRef, entry);
      if (fee) txn.set(feeRef, fee);
    } else if (loanRef && loanUpdate) {
      txn.update(loanRef, loanUpdate);
    }
    txn.update(ruleRef, updates);
  });

  for (const key of ['transactions', 'accounts', 'analytics', 'recurring', 'loans']) {
    delete _cache[key];
  }
  refreshLedger();
  return { success: true, alreadyPaid, updates, transactionId };
};

// Check and apply pending recurring transactions for the current month
export const applyPendingRecurring = async () => {
  const rules = await fetchRecurringTransactions();
  return pendingRecurringRules(rules, todayYMD()); // UI shows a confirmation dialog
};

export const confirmApplyRecurring = async (rules) => {
  const currentMonth = todayYMD().substring(0, 7);
  const today = todayYMD();
  const [y, m] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const applied = [];
  const failed = [];
  for (const rule of pendingRecurringRules(rules, today)) {
    const dom = parseInt(rule.day_of_month, 10);
    const dayStr = dom ? String(Math.min(dom, daysInMonth)).padStart(2, '0') : today.substring(8, 10);
    const candidateDate = `${currentMonth}-${dayStr}`;
    const txDate = candidateDate <= today ? candidateDate : today;
    try {
      const res = await payRecurringRule(rule, {
        amount: rule.amount,
        date: txDate,
        account_id: rule.type === 'Income' ? rule.to_account_id : rule.from_account_id,
        notes: `[Auto] ${rule.notes || rule.category || ''}`,
        skipIfPaid: true,
      });
      if (!res?.alreadyPaid) applied.push(rule);
    } catch (err) {
      // One bad rule (archived account, missing loan…) must not stop the rest.
      failed.push({ rule, message: err?.message || 'Failed' });
    }
  }
  return { success: failed.length === 0, applied, failed };
};

// --- LOANS ---
// Adds live accrued interest (since last calc date) to each active loan
const _withAccruedInterest = (loans) => {
  const todayMs = Date.parse(todayYMD());
  return loans.map(loan => {
    const baseline = loan.last_interest_calc_date || loan.start_date;
    if (loan.status === 'Active' && loan.principal_amount > 0 && loan.annual_interest_rate > 0 && baseline) {
      const baseMs = typeof baseline === 'string' && /^\d{4}-\d{2}-\d{2}/.test(baseline)
        ? Date.parse(baseline.slice(0, 10))
        : Date.parse(baseline);
      const diffDays = Number.isFinite(baseMs) ? Math.max(0, Math.floor((todayMs - baseMs) / 86400000)) : 0;
      const dailyRate = (loan.annual_interest_rate / 100) / 365;
      const newlyAccrued = loan.principal_amount * dailyRate * diffDays;
      loan.current_accrued_interest = roundMoney((loan.unpaid_interest || 0) + newlyAccrued);
    } else {
      loan.current_accrued_interest = loan.unpaid_interest || 0;
    }
    return loan;
  });
};

export const fetchLoans = async () => cachedFetch('loans', async () => {
  const loans = await fetchCollection('loans');
  return _withAccruedInterest(loans);
});

export const createLoan = async (data) => {
  const uid = await getUserId();
  const calcDate = data.last_interest_calc_date || data.start_date;
  const docRef = await addDoc(collection(db, 'loans'), {
    ...data, currency: data.currency || getCurrency(),
    uid,
    last_interest_calc_date: calcDate,
    total_interest_paid: data.total_interest_paid || 0,
    unpaid_interest: data.unpaid_interest || 0,
    annual_interest_rate: data.annual_interest_rate || 0,
    status: 'Active'
  });
  invalidateCache('loans', 'analytics');
  return { id: docRef.id };
};

export const updateLoan = async (id, data) => {
  if (data && data.last_interest_calc_date) {
    // Interest up to the saved date is already accrued (and maybe paid).
    // Moving that date back — e.g. by fixing a typo in the start date — would
    // charge the same days' interest again, so keep the later date.
    const snap = await getDoc(doc(db, 'loans', String(id)));
    const saved = snap.exists() ? snap.data().last_interest_calc_date : null;
    if (saved && data.last_interest_calc_date < saved) {
      data = { ...data };
      delete data.last_interest_calc_date;
    }
  }
  _patchCache('loans', old => old ? old.map(l => String(l.id) === String(id) ? { ...l, ...data } : l) : old);
  invalidateCache('analytics');
  const res = await updateDoc(doc(db, 'loans', String(id)), data);
  return res;
};
const deleteLinkedRecord = async (section, id, link, cacheKey = section) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const links = Array.isArray(link) ? link : [link];
  const [payments, recurring] = await Promise.all([fetchCollection('transactions'), fetchCollection('recurring_transactions')]);
  const hasMatch = row => links.some(l => row[l] != null && String(row[l]) === String(id));
  if (payments.some(hasMatch) || recurring.some(hasMatch)) throw new Error('This record has payment history or a linked recurring rule. Keep it to preserve your ledger.');
  const ref = doc(db, section, String(id));
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Record not found');
    if (snap.data().has_payment_history) throw new Error('This record has payment history. Keep it to preserve your ledger.');
    txn.delete(ref);
  });
  invalidateCache(cacheKey, 'analytics');
};
export const deleteLoan = id => deleteLinkedRecord('loans', id, 'loan_id');

export const payLoan = async (loanId, { amount, date, account_id }) => {
  const uid = await getUserId();
  const payAmt = Number(amount);
  const cleanAccId = account_id != null && account_id !== '' && account_id !== 'mark-only' ? String(account_id) : null;
  validateTransaction({ type: 'Loan Payment', amount: payAmt, date, from_account_id: cleanAccId || 'mark-only' });
  const loanRef = doc(db, 'loans', String(loanId));
  let linkedRules = [];
  try {
    const allRules = await fetchCollection('recurring_transactions');
    linkedRules = allRules.filter(r => r.loan_id != null && String(r.loan_id) === String(loanId));
  } catch {}
  await auditedPayment(db, async (txn) => {
    const loanSnap = await txn.get(loanRef);
    if (!loanSnap.exists()) throw new Error('Loan not found');
    const loan = loanSnap.data();
    if (loan.uid !== uid) throw new Error('Loan not found');
    if (date < (loan.last_interest_calc_date || loan.start_date)) throw new Error('Payment date precedes the last interest calculation');

    const accRef = cleanAccId ? doc(db, 'accounts', cleanAccId) : null;
    const accSnap = accRef ? await txn.get(accRef) : null;
    const linkedSnaps = await Promise.all(linkedRules.map(r => txn.get(doc(db, 'recurring_transactions', String(r.id)))));

    // Deduct from source account if provided
    if (cleanAccId) {
      if (!accSnap.exists() || accSnap.data().uid !== uid) throw new Error('Account not found');
      if (accSnap.data().archived) throw new Error('Restore the archived account before recording a payment');
      requireMatchingCurrency(loan, accSnap.data());
      if (accSnap.exists()) {
        const curBal = Number(accSnap.data().balance) || 0;
        txn.update(accRef, { balance: roundMoney(curBal - payAmt) });
      }
    }

    // Calculate how much goes to interest vs principal (delegates to calculateLoanPayment)
    const loanUpdate = calculateLoanPayment(loan, payAmt, date);
    const paidMonth = loanUpdate.last_paid_month;

    txn.update(loanRef, loanUpdate);

    // Record a loan payment transaction
    const newTxRef = doc(collection(db, 'transactions'));

    // Sync any linked monthly reminder in recurring_transactions
    for (const rSnap of linkedSnaps) {
      if (!rSnap.exists() || rSnap.data().uid !== uid) continue;
      const rData = rSnap.data();
      const priorHistory = (rData.payment_history || []).filter(h => !(h.month === paidMonth && h.marked_only));
      const history = [
        ...priorHistory,
        {
          month: paidMonth,
          amount: payAmt,
          date,
          marked_only: !cleanAccId,
          account_id: cleanAccId || null,
          transaction_id: newTxRef.id
        }
      ].sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
      const recent = history.slice(-3);
      const average = roundMoney(recent.reduce((total, h) => total + h.amount, 0) / recent.length);
      const ruleUpdates = {
        ...(rData.name ? {} : { name: String(rData.category || rData.notes || loan.item_name || 'Loan Payment').trim() }),
        last_applied_month: paidMonth,
        last_paid_amount: payAmt,
        last_paid_date: date,
        last_paid_account_id: cleanAccId || null,
        last_paid_marked_only: !cleanAccId,
        payment_history: history,
        avg_amount: rData.is_variable ? average : (rData.avg_amount ?? rData.amount ?? average)
      };
      if (rData.is_variable) ruleUpdates.amount = average;
      txn.update(doc(db, 'recurring_transactions', rSnap.id), ruleUpdates);
    }

    txn.set(newTxRef, {
      type: 'Loan Payment',
      amount: payAmt,
      date,
      category: 'Loan Payment',
      notes: `Payment for: ${loan.item_name || 'Loan'}`,
      from_account_id: cleanAccId,
      to_account_id: null,
      loan_id: String(loanId),
      fee_amount: 0,
      uid
    });
  });
  invalidateCache('loans', 'transactions', 'accounts', 'analytics', 'recurring');
  refreshLedger();
  return { success: true };
};

// --- BUDGETS ---
export const fetchBudgets = () => cachedFetch('budgets', () => fetchCollection('budgets'));
export const createBudget = async (data) => {
  const uid = await getUserId();
  const docRef = await addDoc(collection(db, 'budgets'), { ...data, uid });
  const newItem = { id: docRef.id, ...data, uid };
  _patchCache('budgets', old => old ? [...old, newItem] : [newItem]);
  invalidateCache('analytics');
  return { id: docRef.id };
};
export const updateBudget = async (id, data) => {
  _patchCache('budgets', old => old ? old.map(b => b.id === id ? { ...b, ...data } : b) : old);
  invalidateCache('analytics');
  const res = await updateDoc(doc(db, 'budgets', String(id)), data);
  return res;
};
export const deleteBudget = async (id) => {
  _patchCache('budgets', old => old ? old.filter(b => b.id !== id) : old);
  invalidateCache('analytics');
  const res = await deleteDoc(doc(db, 'budgets', String(id)));
  return res;
};

// --- GOALS ---
export const fetchGoals = () => cachedFetch('goals', () => fetchCollection('goals'));
export const createGoal = async (data) => {
  const uid = await getUserId();
  const current_amount = parseFloat((Number(data.current_amount) || 0).toFixed(2));
  const target_amount = parseFloat((Number(data.target_amount) || 0).toFixed(2));
  const goalPayload = {
    ...data, currency: data.currency || getCurrency(),
    current_amount,
    target_amount,
    start_date: data.start_date || todayYMD(),
    category: data.category || 'Savings',
    priority: data.priority || 'medium',
    icon: data.icon || '🎯',
    color: data.color || '#4ade80',
    notes: data.notes || '',
    milestones: Array.isArray(data.milestones) ? data.milestones : [],
    is_achieved: target_amount > 0 && current_amount >= target_amount,
    uid
  };
  const docRef = await addDoc(collection(db, 'goals'), goalPayload);
  const newItem = { id: docRef.id, ...goalPayload };
  _patchCache('goals', old => old ? [...old, newItem] : [newItem]);
  invalidateCache('analytics');
  return { id: docRef.id };
};

export const updateGoal = async (id, data) => {
  const updatedData = { ...data };
  if (data.target_amount !== undefined) {
    updatedData.target_amount = parseFloat((Number(data.target_amount) || 0).toFixed(2));
  }
  if (data.current_amount !== undefined) {
    updatedData.current_amount = parseFloat((Number(data.current_amount) || 0).toFixed(2));
  }
  if (updatedData.target_amount !== undefined && updatedData.current_amount !== undefined) {
    updatedData.is_achieved = updatedData.current_amount >= updatedData.target_amount;
  }
  _patchCache('goals', old => old ? old.map(g => g.id === id ? { ...g, ...updatedData } : g) : old);
  invalidateCache('analytics');
  const res = await updateDoc(doc(db, 'goals', String(id)), updatedData);
  return res;
};

export const deleteGoal = id => deleteLinkedRecord('goals', id, 'goal_id');

export const contributeGoal = async (goalId, { amount, account_id, note, round_up_ids }) => {
  const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
  if (numAmount <= 0) throw new Error('Invalid contribution amount');
  const goalRef = doc(db, 'goals', String(goalId));
  const uid = await getUserId();
  await auditedPayment(db, async (txn) => {
    const goalSnap = await txn.get(goalRef);
    if (!goalSnap.exists()) throw new Error('Goal not found');
    const goal = goalSnap.data();
    if (goal.uid !== uid) throw new Error('Goal not found');

    // Deduct from source account if provided
    if (account_id) {
      const accRef = doc(db, 'accounts', String(account_id));
      const accSnap = await txn.get(accRef);
      if (!accSnap.exists() || accSnap.data().uid !== uid) throw new Error('Account not found');
      if (accSnap.data().archived) throw new Error('Restore the archived account before recording a payment');
      requireMatchingCurrency(goal, accSnap.data());
      if (accSnap.exists()) {
        const curBal = Number(accSnap.data().balance) || 0;
        const newBal = parseFloat((curBal - numAmount).toFixed(2));
        txn.update(accRef, { balance: newBal });
      }
    }

    // Add to goal's current amount
    const newAmount = parseFloat(((goal.current_amount || 0) + numAmount).toFixed(2));
    const targetAmt = goal.target_amount || 0;
    const isAchieved = targetAmt > 0 && newAmount >= targetAmt;
    txn.update(goalRef, { current_amount: newAmount, is_achieved: isAchieved });

    // Record as a transaction
    const newTxRef = doc(collection(db, 'transactions'));
    txn.set(newTxRef, {
      type: 'Expense',
      amount: numAmount,
      date: todayYMD(),
      goal_id: String(goalId),
      category: 'Goal Contribution',
      notes: note ? `Contribution to: ${goal.name} (${note})` : `Contribution to: ${goal.name}`,
      from_account_id: account_id != null && account_id !== '' ? String(account_id) : null,
      to_account_id: null,
      fee_amount: 0,
      // Round-up: which expenses this covered, so they're never rounded twice.
      ...(Array.isArray(round_up_ids) && round_up_ids.length ? { round_up_ids: round_up_ids.slice(0, 500).map(String) } : {}),
      uid
    });
  });
  invalidateCache('goals', 'accounts', 'transactions', 'analytics');
  refreshLedger();
  return { success: true };
};

export const withdrawGoal = async (goalId, { amount, account_id, reason }) => {
  const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
  if (numAmount <= 0) throw new Error('Invalid withdrawal amount');
  const goalRef = doc(db, 'goals', String(goalId));
  const uid = await getUserId();
  await auditedPayment(db, async (txn) => {
    const goalSnap = await txn.get(goalRef);
    if (!goalSnap.exists()) throw new Error('Goal not found');
    const goal = goalSnap.data();
    if (goal.uid !== uid) throw new Error('Goal not found');

    const currentBal = goal.current_amount || 0;
    const withdrawAmt = Math.min(numAmount, currentBal);
    if (withdrawAmt <= 0) throw new Error('Insufficient goal funds to withdraw');

    // Credit to destination account if provided
    if (account_id) {
      const accRef = doc(db, 'accounts', String(account_id));
      const accSnap = await txn.get(accRef);
      if (!accSnap.exists() || accSnap.data().uid !== uid) throw new Error('Account not found');
      if (accSnap.data().archived) throw new Error('Restore the archived account before recording a payment');
      requireMatchingCurrency(goal, accSnap.data());
      if (accSnap.exists()) {
        const curBal = Number(accSnap.data().balance) || 0;
        const newBal = parseFloat((curBal + withdrawAmt).toFixed(2));
        txn.update(accRef, { balance: newBal });
      }
    }

    const newAmount = Math.max(0, parseFloat((currentBal - withdrawAmt).toFixed(2)));
    const targetAmt = goal.target_amount || 0;
    const isAchieved = targetAmt > 0 && newAmount >= targetAmt;
    txn.update(goalRef, { current_amount: newAmount, is_achieved: isAchieved });

    // Record as transaction
    const newTxRef = doc(collection(db, 'transactions'));
    txn.set(newTxRef, {
      type: account_id ? 'Income' : 'Expense',
      amount: withdrawAmt,
      date: todayYMD(),
      goal_id: String(goalId),
      category: 'Goal Deduction',
      notes: reason ? `Deduction from: ${goal.name} (${reason})` : `Deduction from: ${goal.name}`,
      from_account_id: null,
      to_account_id: account_id != null && account_id !== '' ? String(account_id) : null,
      fee_amount: 0,
      uid
    });
  });
  invalidateCache('goals', 'accounts', 'transactions', 'analytics');
  refreshLedger();
  return { success: true };
};

export const deductGoal = withdrawGoal;

// Helper: normalize category name (strip leading emojis/symbols & lowercase) for resilient matching
export const normalizeCategoryKey = (cat) =>
  String(cat || '')
    .replace(/^[\p{Emoji}\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+/gu, '')
    .trim()
    .toLowerCase();

export const getCategorySpendFromMap = (catMap, catName) => {
  if (!catMap || !catName) return 0;
  if (catMap[catName] !== undefined) return catMap[catName];
  const targetNorm = normalizeCategoryKey(catName);
  if (!targetNorm) return 0;
  let sum = 0;
  for (const [k, v] of Object.entries(catMap)) {
    if (normalizeCategoryKey(k) === targetNorm) {
      sum += Number(v) || 0;
    }
  }
  return sum;
};

// --- ANALYTICS ---
const _computeAnalyticsSync = ({ rawTransactions, accounts, loans, goals, budgets, reportRates }) => {
  const base = getCurrency();
  const mixed = rawTransactions.some(t => transactionCurrency(t, accounts, base) !== base);
  const txs = reportingTransactions(rawTransactions, accounts, base, reportRates);

  const expensesByCategory = {};
  const monthlyExpensesByCategory = {}; // { 'YYYY-MM': { [cat]: amount } }
  const incomeBySource = {};
  const monthlyMap = {}; // { 'YYYY-MM': { Income: 0, Expense: 0 } }
  const dailySpend = {}; // { 'YYYY-MM-DD': amount }
  let totalIncome = 0;
  let totalExpense = 0;
  const allTransactions = txs.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  txs.forEach(tx => {
    const txDate = tx.date || todayYMD();
    const month = txDate.substring(0, 7);
    if (!monthlyMap[month]) monthlyMap[month] = { month, Income: 0, Expense: 0 };
    if (!monthlyExpensesByCategory[month]) monthlyExpensesByCategory[month] = {};

    const amount = Number(tx.amount) || 0;
    // Card payments, goal savings and balance corrections aren't income or
    // spending (matches Month close and the Transactions totals).
    if (isInternalMove(tx) || tx.reconciliation) return;

    if (tx.type === 'Expense' || tx.type === 'Loan Payment') {
      const validSplits = tx.isSplit !== false && Array.isArray(tx.splits)
        ? tx.splits.filter(sp => (Number(sp.amount) || 0) > 0)
        : [];
      if (validSplits.length > 0) {
        validSplits.forEach(sp => {
          const spCat = sp.category || tx.category || 'Uncategorized';
          const spAmt = Number(sp.amount) || 0;
          if (spAmt > 0) {
            expensesByCategory[spCat] = (expensesByCategory[spCat] || 0) + spAmt;
            monthlyExpensesByCategory[month][spCat] = (monthlyExpensesByCategory[month][spCat] || 0) + spAmt;
          }
        });
      } else {
        const cat = tx.category || 'Uncategorized';
        expensesByCategory[cat] = (expensesByCategory[cat] || 0) + amount;
        monthlyExpensesByCategory[month][cat] = (monthlyExpensesByCategory[month][cat] || 0) + amount;
      }
      totalExpense += amount;
      monthlyMap[month].Expense = (monthlyMap[month].Expense || 0) + amount;
      // Daily spend heatmap
      dailySpend[txDate] = (dailySpend[txDate] || 0) + amount;
    }

    if (tx.type === 'Income') {
      const src = tx.category || 'Other';
      incomeBySource[src] = (incomeBySource[src] || 0) + amount;
      totalIncome += amount;
      monthlyMap[month].Income = (monthlyMap[month].Income || 0) + amount;
    }
  });

  // Sums above are plain floats (0.1 + 0.2 = 0.30000000000000004): round to
  // cents so totals and budget checks compare exact amounts.
  const roundAll = (obj) => { for (const k of Object.keys(obj)) obj[k] = roundMoney(obj[k]); };
  roundAll(expensesByCategory); roundAll(incomeBySource); roundAll(dailySpend);
  Object.values(monthlyExpensesByCategory).forEach(roundAll);
  Object.values(monthlyMap).forEach(m => { m.Income = roundMoney(m.Income); m.Expense = roundMoney(m.Expense); });
  totalIncome = roundMoney(totalIncome); totalExpense = roundMoney(totalExpense);

  // Sort months chronologically
  const sortedMonths = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month));

  // Month-over-Month comparison (last 6 months)
  const last6 = sortedMonths.slice(-6);
  const momComparison = last6.map((m, i) => {
    const prev = last6[i - 1];
    const expenseDelta = prev ? ((m.Expense - prev.Expense) / (prev.Expense || 1)) * 100 : 0;
    const incomeDelta  = prev ? ((m.Income  - prev.Income)  / (prev.Income  || 1)) * 100 : 0;
    return {
      month: m.month,
      income: m.Income,
      expense: m.Expense,
      net: m.Income - m.Expense,
      expenseDelta: Math.round(expenseDelta),
      incomeDelta: Math.round(incomeDelta),
    };
  });

  // Avg monthly spend (last 6 months)
  const avgMonthlySpend = last6.length > 0
    ? last6.reduce((s, m) => s + m.Expense, 0) / last6.length
    : 0;

  // Category array with percentage
  const totalExpCat = Object.values(expensesByCategory).reduce((a, b) => a + b, 0);
  const categoryData = Object.entries(expensesByCategory)
    .map(([category, total]) => ({ category, total, pct: totalExpCat > 0 ? Math.round((total / totalExpCat) * 100) : 0 }))
    .sort((a, b) => b.total - a.total);

  const incomeSourceData = Object.entries(incomeBySource)
    .map(([source, total]) => ({ source, total }))
    .sort((a, b) => b.total - a.total);

  // Top 10 biggest transactions (by amount, any active non-fee type)
  const top10Transactions = allTransactions
    .filter(t => !t.is_transfer_fee)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  // Daily spend last 30 days for heatmap
  const dailySpendArray = Object.entries(dailySpend)
    .map(([date, amount]) => ({ date, amount }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-60);

  // Net savings & savings rate
  const netSavings = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

  // Recommendations engine
  const recommendations = [];
  if (categoryData.length > 0) {
    const top = categoryData[0];
    recommendations.push({
      type: top.pct > 30 ? 'warning' : 'info',
      icon: '📊',
      title: 'Top Spending Category',
      body: `"${top.category}" accounts for ${top.pct}% of all expenses (${formatCurrency(top.total)}). ${top.pct > 30 ? 'Consider reviewing this category.' : 'Your spending looks fairly distributed.'}`,
    });
  }
  if (savingsRate < 10 && totalIncome > 0) {
    recommendations.push({
      type: 'danger',
      icon: '⚠️',
      title: 'Low Savings Rate',
      body: `Your savings rate is only ${savingsRate}%. Financial experts recommend saving at least 20% of income. Try reducing discretionary expenses.`,
    });
  } else if (savingsRate >= 20) {
    recommendations.push({
      type: 'success',
      icon: '✅',
      title: 'Healthy Savings Rate',
      body: `Great job! Your savings rate is ${savingsRate}%. You're on track to build a solid financial cushion.`,
    });
  } else if (totalIncome > 0) {
    recommendations.push({
      type: 'info',
      icon: '💡',
      title: 'Savings Rate',
      body: `Your savings rate is ${savingsRate}%. The 50/30/20 rule suggests putting 20% into savings. You're close — keep it up!`,
    });
  }
  // MoM expense trend
  if (momComparison.length >= 2) {
    const latest = momComparison[momComparison.length - 1];
    if (latest.expenseDelta > 20) {
      recommendations.push({
        type: 'warning',
        icon: '📈',
        title: 'Spending Spike Detected',
        body: `Your expenses in ${latest.month} increased by ${latest.expenseDelta}% vs the previous month. Review recent transactions to identify the cause.`,
      });
    } else if (latest.expenseDelta < -10) {
      recommendations.push({
        type: 'success',
        icon: '🎉',
        title: 'Spending Down This Month',
        body: `Expenses dropped by ${Math.abs(latest.expenseDelta)}% vs last month. Great discipline! Keep it going.`,
      });
    }
  }
  // Loan interest burden (converted to reporting currency)
  const activeLoans = loans.filter(l => l.status === 'Active');
  if (activeLoans.length > 0) {
    const totalInterestBurden = activeLoans.reduce((s, l) => {
      const lCur = l.currency || base;
      const rate = lCur === base ? 1 : currencyRate(lCur, base, reportRates);
      const principalInBase = (Number(l.principal_amount) || 0) * (Number.isFinite(rate) ? rate : 1);
      const monthlyRate = ((Number(l.annual_interest_rate) || 0) / 100) / 12;
      return s + principalInBase * monthlyRate;
    }, 0);
    recommendations.push({
      type: activeLoans.length > 2 ? 'warning' : 'info',
      icon: '🏦',
      title: `${activeLoans.length} Active Loan${activeLoans.length > 1 ? 's' : ''}`,
      body: `Your loans cost approximately ${formatCurrency(Math.round(totalInterestBurden))}/month in interest. ${activeLoans.length > 2 ? 'Consider prioritizing high-interest loans first (avalanche method).' : ''}`,
    });
  }
  // Goal progress
  const incompleteGoals = goals.filter(g => g.current_amount < g.target_amount);
  if (incompleteGoals.length > 0) {
    const closest = incompleteGoals.sort((a, b) => {
      const pa = (a.current_amount / a.target_amount);
      const pb = (b.current_amount / b.target_amount);
      return pb - pa;
    })[0];
    const pct = Math.round((closest.current_amount / closest.target_amount) * 100);
    recommendations.push({
      type: 'info',
      icon: '🎯',
      title: 'Closest Goal',
      body: `"${closest.name}" is ${pct}% funded (${formatCurrency(closest.current_amount)} of ${formatCurrency(closest.target_amount)}). ${pct >= 75 ? 'Almost there!' : 'Keep contributing regularly.'}`,
    });
  }
  // Budget overruns (evaluated per budget's month or current month)
  const currentMonthKey = todayYMD().substring(0, 7);
  const currentMonthExpensesByCategory = monthlyExpensesByCategory[currentMonthKey] || {};
  const budgetAlerts = budgets.filter(b => {
    const limit = Number(b.amount || b.limit_amount) || 0;
    const mKey = b.month || currentMonthKey;
    // A month with no spending yet has nothing over budget (never borrow another month's).
    const mMap = monthlyExpensesByCategory[mKey] || {};
    const spent = getCategorySpendFromMap(mMap, b.category);
    return limit > 0 && spent > limit;
  });
  if (budgetAlerts.length > 0) {
    recommendations.push({
      type: 'danger',
      icon: '🚨',
      title: `${budgetAlerts.length} Budget${budgetAlerts.length > 1 ? 's' : ''} Overrun`,
      body: `You've exceeded your budget in: ${budgetAlerts.map(b => b.category).join(', ')}. Consider adjusting your limits or cutting back.`,
    });
  }

  return {
    reportingCurrency: base,
    exchangeRateDate: reportRates?._date || null,
    currencyEstimate: mixed,
    totalIncome,
    totalExpense,
    netSavings,
    savingsRate,
    avgMonthlySpend,
    categoryData,
    monthlyExpensesByCategory,
    currentMonthExpensesByCategory,
    incomeSourceData,
    monthlyTrends: sortedMonths,
    momComparison,
    dailySpendArray,
    top10Transactions,
    recommendations,
    allTransactions,
    accounts,
    loans,
  };
};

export const fetchAnalytics = async () => cachedFetch('analytics', async () => {
  const [rawTransactions, accounts, loans, goals, budgets] = await Promise.all([
    fetchTransactions(),
    fetchAccounts(),
    fetchLoans(),
    fetchGoals(),
    fetchBudgets(),
  ]);

  const base = getCurrency();
  const mixed = rawTransactions.some(t => transactionCurrency(t, accounts, base) !== base) ||
    loans.some(l => l.status === 'Active' && (l.currency || base) !== base);
  const reportRates = mixed ? await fetchExchangeRates() : null;
  return _computeAnalyticsSync({ rawTransactions, accounts, loans, goals, budgets, reportRates });
});


// ─── BILLS ────────────────────────────────────────────────────────
export const fetchBills = async () => cachedFetch('bills', async () => {
  const uid = await getUserId();
  const snap = await getDocs(collection(db, 'users', uid, 'bills'));
  const docs = snap.docs.map(d => ({ ...d.data(), id: String(d.id) }));
  return docs.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
});

export const createBill = async (data) => {
  const uid = await getUserId();
  const res = await addDoc(collection(db, 'users', uid, 'bills'), { ...data, currency: data.currency || getCurrency(), created_at: serverTimestamp() });
  invalidateCache('bills');
  return res;
};

export const updateBill = async (id, data) => {
  const uid = await getUserId();
  const { id: _id, ...rest } = data;
  const res = await updateDoc(doc(db, 'users', uid, 'bills', String(id)), rest);
  invalidateCache('bills');
  return res;
};

export const deleteBill = async (id) => {
  const uid = await getUserId();
  const res = await deleteDoc(doc(db, 'users', uid, 'bills', String(id)));
  invalidateCache('bills');
  return res;
};

// Debit and advance the bill cycle in one commit. An outdated dialog cannot pay a cycle twice.
export const payBill = async (bill, payment) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const amount = Number(payment.amount);
  const date = payment.date || todayYMD();
  const cleanAccId = payment.account_id != null && payment.account_id !== '' ? String(payment.account_id) : null;
  validateTransaction({ type: 'Expense', amount, date, from_account_id: cleanAccId || 'mark-only' });
  const ref = doc(db, 'users', uid, 'bills', String(bill.id));
  await auditedPayment(db, async txn => {
    const snap = await txn.get(ref);
    if (!snap.exists()) throw new Error('Bill not found');
    const current = snap.data();
    if (!payment.force && (current.paid || current.due_date !== bill.due_date)) {
      throw new Error('This bill cycle has already changed. Refresh before paying.');
    }
    const accounts = cleanAccId ? await _getAccountsForTxn(txn, new Set([cleanAccId])) : {};
    if (Object.values(accounts).some(a => a.archived)) throw new Error('Restore the archived account before recording a payment');
    if (cleanAccId) {
      requireMatchingCurrency(current, accounts[cleanAccId]);
      const entry = { uid, type: 'Expense', amount, date, category: current.category || 'Bills',
        notes: payment.notes || `Bill: ${current.name}`, from_account_id: cleanAccId,
        to_account_id: null, bill_id: String(bill.id) };
      _mutateBalances(accounts, entry);
      for (const account of Object.values(accounts)) txn.update(account.ref, { balance: account.balance });
      txn.set(doc(collection(db, 'transactions')), entry);
    }
    txn.update(ref, { ...advanceBill(current), amount, last_paid_date: date, last_paid_amount: amount });
  });
  invalidateCache('bills', 'accounts', 'transactions', 'analytics');
  refreshLedger();
};

// ─── INVESTMENTS ─────────────────────────────────────────────────
export const fetchInvestments = async () => cachedFetch('investments', async () => {
  const uid = await getUserId();
  const snap = await getDocs(collection(db, 'users', uid, 'investments'));
  const docs = snap.docs.map(d => ({ ...d.data(), id: String(d.id) }));
  return docs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
});

export const createInvestment = async (data) => {
  const uid = await getUserId();
  // Prices and cost are in this currency for good, even if the display currency changes later.
  const res = await addDoc(collection(db, 'users', uid, 'investments'), { ...data, currency: data.currency || getCurrency(), created_at: serverTimestamp() });
  invalidateCache('investments');
  return res;
};

export const updateInvestment = async (id, data) => {
  const uid = await getUserId();
  const { id: _id, ...rest } = data;
  const res = await updateDoc(doc(db, 'users', uid, 'investments', id), rest);
  invalidateCache('investments');
  return res;
};

export const deleteInvestment = async (id) => {
  const uid = await getUserId();
  const res = await deleteDoc(doc(db, 'users', uid, 'investments', id));
  invalidateCache('investments');
  return res;
};

// ─── USER PREFERENCES ─────────────────────────────────────────────
export const fetchUserPrefs = async (uid) => {
  try {
    if (!uid) return null;
    const prefRef = doc(db, 'user_prefs', uid);
    const snap = await getDoc(prefRef);
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
};

export const saveUserPrefs = async (uid, prefs) => {
  try {
    if (!uid) return;
    const prefRef = doc(db, 'user_prefs', uid);
    await setDoc(prefRef, prefs, { merge: true });
  } catch (e) { console.error('saveUserPrefs failed', e); }
};

// ─── EXCHANGE RATES ────────────────────────────────────────────────
let _ratesCache = null;
let _ratesCacheTs = 0;
export const fetchExchangeRates = async () => {
  if (_ratesCache && Date.now() - _ratesCacheTs < 60 * 60 * 1000) return _ratesCache;
  const response = await fetch('https://api.frankfurter.dev/v2/rates?base=LKR', { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Exchange rates are unavailable. Try again later.');
  const rates = parseExchangeRates(await response.json());
  _ratesCache = rates;
  _ratesCacheTs = Date.now();
  return rates;
};

// ─── NET WORTH SNAPSHOTS ───────────────────────────────────────────
export const recordNetWorthSnapshot = async (netWorth, assets, liabilities) => {
  if (![netWorth, assets, liabilities].every(Number.isFinite)) return;
  try {
    const uid = await getUserId();
    if (!uid) return;
    const today = todayYMD();
    const snapRef = doc(db, 'net_worth_snapshots', `${uid}_${today}`);
    await setDoc(snapRef, { uid, date: today, netWorth, assets, liabilities }, { merge: true });
  } catch (e) { console.error('recordNetWorthSnapshot failed', e); }
};

export const fetchNetWorthHistory = async () => cachedFetch('net_worth_history', async () => {
  const uid = await getUserId();
  if (!uid) return [];
  const q = query(collection(db, 'net_worth_snapshots'), where('uid', '==', uid));
  const snap = await getDocs(q);
  const docs = snap.docs.map(d => ({ ...d.data(), id: String(d.id) }));
  return docs.sort((a, b) => new Date(a.date) - new Date(b.date));
});

// ─── MIGRATION (ONE-TIME) ───────────────────────────────────────────
export const migrateDataAddUid = async () => {
  try {
    const uid = await getUserId();
    if (!uid) throw new Error("Must be logged in to migrate data");
    
    const collectionsToMigrate = [
      'accounts', 'transactions', 'loans', 'budgets', 'goals', 'recurring_transactions', 'net_worth_snapshots'
    ];
    
    const batch = writeBatch(db);
    let count = 0;
    
    for (const coll of collectionsToMigrate) {
      const snap = await getDocs(collection(db, coll));
      snap.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.uid) {
          batch.update(docSnap.ref, { uid });
          count++;
        }
      });
    }
    
    if (count > 0) {
      await batch.commit();
    } else {
    }
    return count;
  } catch (err) {
    console.error("Migration failed:", err);
    throw err;
  }
};

// --- CREDIT CARDS ---
export const fetchCreditCards = () => cachedFetch('credit_cards', () => fetchCollection('credit_cards'));

export const createCreditCard = async (data) => {
  const uid = await getUserId();
  const newData = { ...data, currency: data.currency || getCurrency(), uid, created_at: new Date().toISOString() };
  const docRef = await addDoc(collection(db, 'credit_cards'), newData);
  const newItem = { id: docRef.id, ...newData };
  _patchCache('credit_cards', old => old ? [...old, newItem] : [newItem]);
  return { id: docRef.id };
};

export const updateCreditCard = async (id, data) => {
  _patchCache('credit_cards', old => old ? old.map(c => c.id === id ? { ...c, ...data } : c) : old);
  return updateDoc(doc(db, 'credit_cards', String(id)), data);
};

export const deleteCreditCard = id => deleteLinkedRecord('credit_cards', id, ['credit_card_id', 'credit_card_charge_id']);

// Record a credit card charge: atomically increases card balance and optionally records a category expense in transactions
export const recordCardCharge = async (card, { amount, date, category, notes, logTransaction = true } = {}) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const chargeAmt = roundMoney(Number(amount));
  if (!Number.isFinite(chargeAmt) || chargeAmt <= 0) throw new Error('Enter a valid charge amount');
  const chargeDate = date || todayYMD();
  const cardRef = doc(db, 'credit_cards', String(card.id));
  await runTransaction(db, async txn => {
    const snap = await txn.get(cardRef);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Credit card not found');
    txn.update(cardRef, { balance: roundMoney((Number(snap.data().balance) || 0) + chargeAmt) });
    if (logTransaction) {
      txn.set(doc(collection(db, 'transactions')), {
        uid,
        type: 'Expense',
        amount: chargeAmt,
        currency: snap.data().currency || card.currency || getCurrency(),
        date: chargeDate,
        category: category || 'Shopping',
        notes: `${notes ? `${notes} · ` : ''}[Card: ${snap.data().name || card.name}]`,
        from_account_id: null,
        to_account_id: null,
        credit_card_charge_id: String(card.id),
      });
    }
  });
  invalidateCache('credit_cards', 'transactions', 'analytics');
  refreshLedger();
};

// Record a credit card payment: creates expense txn from bank account (if selected), reduces card balance
export const recordCardPayment = async (card, amount, fromAccountId) => {
  const uid = await getUserId();
  const payAmt = Number(amount);
  const date = todayYMD();
  const cleanAccId = fromAccountId != null && fromAccountId !== '' ? String(fromAccountId) : null;
  validateTransaction({ type: 'Expense', amount: payAmt, date, from_account_id: cleanAccId });
  const cardRef = doc(db, 'credit_cards', String(card.id));
  await auditedPayment(db, async txn => {
    const snap = await txn.get(cardRef);
    if (!snap.exists() || snap.data().uid !== uid) throw new Error('Credit card not found');
    if (roundMoney(payAmt) > roundMoney(Number(snap.data().balance) || 0)) throw new Error('Payment exceeds the card balance');
    const accounts = await _getAccountsForTxn(txn, new Set([cleanAccId]));
    if (Object.values(accounts).some(a => a.archived)) throw new Error('Restore the archived account before recording a payment');
    requireMatchingCurrency(snap.data(), accounts[cleanAccId]);
    const payment = { type: 'Expense', amount: payAmt, date, from_account_id: cleanAccId,
      to_account_id: null, credit_card_id: String(card.id), category: 'Credit Card Payment', notes: `Payment to ${snap.data().name}`, uid };
    _mutateBalances(accounts, payment);
    for (const account of Object.values(accounts)) txn.update(account.ref, { balance: account.balance });
    txn.update(cardRef, { balance: roundMoney(snap.data().balance - payAmt) });
    txn.set(doc(collection(db, 'transactions')), payment);
  });
  invalidateCache('credit_cards', 'accounts', 'transactions', 'analytics');
  refreshLedger();
};

// ─── REAL-TIME SYNC ──────────────────────────────────────────────────
// One onSnapshot listener per collection keeps the cache permanently fresh.
// Any change (this device, another device, or a pending offline write) updates the
// cache instantly and fires 'vm:data-changed' so open screens re-render — no manual refresh.
const _byDate = (docs) => docs.sort((a, b) => new Date(b.date) - new Date(a.date));
const _ANALYTICS_DEPS = ['transactions', 'accounts', 'loans', 'goals', 'budgets'];

const _liveSources = (uid) => ({
  accounts:     { q: query(collection(db, 'accounts'), where('uid', '==', uid)) },
  transactions: { q: query(collection(db, 'transactions'), where('uid', '==', uid)), map: _byDate },
  loans:        { q: query(collection(db, 'loans'), where('uid', '==', uid)), map: _withAccruedInterest },
  budgets:      { q: query(collection(db, 'budgets'), where('uid', '==', uid)) },
  goals:        { q: query(collection(db, 'goals'), where('uid', '==', uid)) },
  credit_cards: { q: query(collection(db, 'credit_cards'), where('uid', '==', uid)) },
  recurring:    { q: query(collection(db, 'recurring_transactions'), where('uid', '==', uid)) },
  bills:        { q: collection(db, 'users', uid, 'bills'),
                  map: (d) => d.sort((a, b) => (a.due_date || '').localeCompare(b.due_date || '')) },
  investments:  { q: collection(db, 'users', uid, 'investments'),
                  map: (d) => d.sort((a, b) => (a.name || '').localeCompare(b.name || '')) },
});

const _pendingCollections = new Set();
const _emitSyncState = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vm:sync-state', {
      detail: {
        pendingCount: _pendingCollections.size,
        syncing: _pendingCollections.size > 0,
        lastSyncedAt: Date.now(),
      }
    }));
  }
};

export const getSyncQueueState = () => ({
  pendingCount: _pendingCollections.size,
  syncing: _pendingCollections.size > 0,
});

export const stopLiveSync = () => {
  invalidateCache();
  _pendingCollections.clear();
  Object.keys(_live).forEach(k => {
    try { _live[k](); } catch {}
    delete _live[k];
    delete _liveReady[k];
  });
};

export const startLiveSync = (uid) => {
  if (!uid) return;
  stopLiveSync();
  Object.entries(_liveSources(uid)).forEach(([key, { q, map }]) => {
    let resolveReady;
    _liveReady[key] = new Promise(r => { resolveReady = r; });
    _live[key] = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      const hadPending = _pendingCollections.has(key);
      const hasPending = !!snap.metadata?.hasPendingWrites;
      if (hasPending !== hadPending) {
        if (hasPending) _pendingCollections.add(key);
        else _pendingCollections.delete(key);
        _emitSyncState();
      }

      const docs = snap.docs.map(d => ({ ...d.data(), id: String(d.id) }));
      _cache[key] = { data: map ? map(docs) : docs, ts: Date.now() };
      // Derived data must be recomputed from the fresh base data
      if (_ANALYTICS_DEPS.includes(key)) delete _cache.analytics;
      resolveReady();
      _emit(key);
    }, (err) => {
      console.warn(`[live-sync] ${key} listener failed, falling back to fetch:`, err?.code || err);
      _pendingCollections.delete(key);
      _emitSyncState();
      resolveReady();
      delete _live[key];
    });
  });
};

// ─── RECEIPTS (stored in Firestore — works on the free plan and offline) ────────
// Full image lives in its own doc so the transactions list stays light.
// Transactions reference it as receipt_url = "receipt:<docId>" plus a tiny inline thumbnail.
const _receiptCache = {};

export const fetchReceipts = () => fetchCollection('receipts');

export const saveReceipt = async (dataUrl) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Not signed in');
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 700000) throw new Error('Receipt image is too large or invalid');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(dataUrl));
  const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
  const ref = doc(db, 'receipts', `${uid}_${hash}`);
  await runTransaction(db, async txn => {
    const existing = await txn.get(ref);
    if (existing.exists()) { if (existing.data().uid !== uid) throw new Error('Receipt belongs to another user'); return; }
    txn.set(ref, { uid, data: dataUrl, created_at: new Date().toISOString(), content_hash: hash });
  });
  _receiptCache[`${uid}:${ref.id}`] = dataUrl;
  return ref.id;
};

// Resolves any receipt reference (receipt:<id>, data: URL, or legacy https URL) to a displayable src
export const resolveReceipt = async (value) => {
  if (!value) return null;
  if (!value.startsWith('receipt:')) return value;
  const id = value.slice(8);
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to view receipts');
  if (_receiptCache[`${uid}:${id}`]) return _receiptCache[`${uid}:${id}`];
  const snap = await getDoc(doc(db, 'receipts', id));
  const data = snap.exists() && snap.data().uid === uid ? snap.data().data : null;
  if (data) _receiptCache[`${uid}:${id}`] = data;
  return data;
};

export const deleteReceipt = async (value) => {
  if (!value || !value.startsWith('receipt:')) return;
  const id = value.slice(8);
  delete _receiptCache[id];
  try { await deleteDoc(doc(db, 'receipts', id)); } catch {}
};

// ─── BATCH TRANSACTION UPDATE ──────────────────────────────────────
export const batchUpdateTransactions = async (updates) => {
  const uid = await getUserId();
  if (!uid || !Array.isArray(updates) || updates.length === 0) return { updated: 0 };

  const allowed = new Set(['category', 'tags', 'is_tax_deductible', 'tax_category', 'notes']);
  if (updates.some(item => !item.changes || Object.keys(item.changes).some(key => !allowed.has(key))))
    throw new Error('Bulk updates may only change descriptive fields');
  if (updates.length > 450) throw new Error('Apply rules to at most 450 transactions at a time');
  const batch = writeBatch(db);
  let count = 0;

  for (const item of updates) {
    if (!item.id || String(item.id).startsWith('optimistic_')) continue;
    const ref = doc(db, 'transactions', String(item.id));
    batch.update(ref, item.changes);
    count++;
  }

  if (count > 0) {
    await batch.commit();
    _patchCache('transactions', old => {
      if (!old) return old;
      const updateMap = new Map(updates.map(u => [u.id, u.changes]));
      return old.map(t => {
        const changes = updateMap.get(t.id);
        return changes ? { ...t, ...changes } : t;
      });
    });
    invalidateCache('analytics');
    _emit('transactions');
  }

  return { updated: count };
};

// ─── AUTOMATED TRANSACTION RULES ("IFTTT") ─────────────────────────
export const fetchRules = async () => cachedFetch('rules', async () => {
  const uid = await getUserId();
  if (!uid) return DEFAULT_RULES;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'rules'));
    if (snap.empty) {
      const local = localStorage.getItem(`vm_transaction_rules:${uid}`);
      return local ? JSON.parse(local) : DEFAULT_RULES;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    try { localStorage.setItem(`vm_transaction_rules:${uid}`, JSON.stringify(docs)); } catch {}
    return docs;
  } catch {
  const local = localStorage.getItem(`vm_transaction_rules:${uid}`);
  return local ? JSON.parse(local) : DEFAULT_RULES;
}
});

export const saveRule = async (ruleData) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const existing = await fetchRules();
  _cache['rules'] = { data: existing, ts: Date.now() };
  const id = ruleData.id || `rule_${Date.now()}`;
  const payload = { ...ruleData, id, updated_at: new Date().toISOString() };

  _patchCache('rules', old => {
    const arr = Array.isArray(old) ? old : [];
    const idx = arr.findIndex(r => r.id === id);
    if (idx >= 0) {
      const copy = [...arr];
      copy[idx] = payload;
      return copy;
    }
    return [...arr, payload];
  });

  try {
    const current = _cache['rules']?.data || [];
    localStorage.setItem(`vm_transaction_rules:${uid}`, JSON.stringify(current));
  } catch {}

  if (uid) {
    try {
      await setDoc(doc(db, 'users', uid, 'rules', id), payload);
    } catch (err) {
      console.warn('Saved rule locally; failed firestore sync:', err);
    }
  }
  _emit('rules');
  return payload;
};

export const deleteRule = async (ruleId) => {
  const uid = await getUserId();
  _patchCache('rules', old => old ? old.filter(r => r.id !== ruleId) : []);
  try {
    const current = _cache['rules']?.data || [];
    localStorage.setItem(`vm_transaction_rules:${uid}`, JSON.stringify(current));
  } catch {}

  if (uid) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'rules', ruleId));
    } catch {}
  }
  _emit('rules');
  return true;
};

// ─── SHARED HOUSEHOLD TABS & GROUP EXPENSES ────────────────────────
export const fetchSharedTabs = async () => cachedFetch('shared_tabs', async () => {
  const uid = await getUserId();
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'shared_tabs'));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs;
  } catch {
  const local = localStorage.getItem(`vm_shared_tabs:${uid}`);
  return local ? JSON.parse(local) : [];
}
});

export const saveSharedTab = async (tabData) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const existing = await fetchSharedTabs();
  _cache['shared_tabs'] = { data: existing, ts: Date.now() };
  const id = tabData.id || `tab_${Date.now()}`;
  const payload = { ...tabData, id, updated_at: new Date().toISOString() };

  _patchCache('shared_tabs', old => {
    const arr = Array.isArray(old) ? old : [];
    const idx = arr.findIndex(t => t.id === id);
    if (idx >= 0) {
      const copy = [...arr];
      copy[idx] = payload;
      return copy;
    }
    return [payload, ...arr];
  });

  try {
    const current = _cache['shared_tabs']?.data || [];
    localStorage.setItem(`vm_shared_tabs:${uid}`, JSON.stringify(current));
  } catch {}

  if (uid) {
    try {
      await setDoc(doc(db, 'users', uid, 'shared_tabs', id), payload);
    } catch (err) {
      invalidateCache('shared_tabs');
      throw new Error(`Couldn’t save the shared tab: ${err?.message || 'unknown error'}`);
    }
  }
  _emit('shared_tabs');
  return payload;
};

export const deleteSharedTab = async (tabId) => {
  const uid = await getUserId();
  _patchCache('shared_tabs', old => old ? old.filter(t => t.id !== tabId) : []);
  try {
    const current = _cache['shared_tabs']?.data || [];
    localStorage.setItem(`vm_shared_tabs:${uid}`, JSON.stringify(current));
  } catch {}

  if (uid) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'shared_tabs', tabId));
    } catch {}
  }
  _emit('shared_tabs');
  return true;
};

// ─── PERSONAL IOU & BILL SPLIT TRACKER ─────────────────────────────
export const fetchIous = async () => cachedFetch('ious', async () => {
  const uid = await getUserId();
  if (!uid) return [];
  const scopedKey = `vm_ious:${uid}`;
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'ious'));
    // A confirmed server answer is the truth, even when it's empty: falling
    // back to this device's copy would bring back IOUs deleted elsewhere.
    if (!snap.empty || !snap.metadata.fromCache) {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (snap.empty) {
        try {
          const local = JSON.parse(localStorage.getItem(scopedKey) || '[]');
          if (Array.isArray(local) && local.length) localStorage.setItem(`vm_ious_unsynced:${uid}`, JSON.stringify(local));
        } catch { /* unreadable copy */ }
      }
      try { localStorage.setItem(scopedKey, JSON.stringify(docs)); } catch {}
      return docs;
    }
    const local = localStorage.getItem(scopedKey);
    return local ? JSON.parse(local) : [];
  } catch {
    const local = localStorage.getItem(scopedKey);
    return local ? JSON.parse(local) : [];
  }
});

export const saveIou = async (iouData) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const existing = await fetchIous();
  _cache['ious'] = { data: existing, ts: Date.now() };
  const id = iouData.id || `iou_${Date.now()}`;
  const payload = { ...iouData, id, uid, updated_at: new Date().toISOString() };

  _patchCache('ious', old => {
    const arr = Array.isArray(old) ? old : [];
    const idx = arr.findIndex(x => x.id === id);
    if (idx >= 0) {
      const copy = [...arr];
      copy[idx] = payload;
      return copy;
    }
    return [payload, ...arr];
  });

  try {
    const current = _cache['ious']?.data || [];
    localStorage.setItem(`vm_ious:${uid}`, JSON.stringify(current));
  } catch {}

  if (uid) {
    try {
      await setDoc(doc(db, 'users', uid, 'ious', id), payload);
    } catch (err) {
      invalidateCache('ious');
      throw new Error(`Couldn’t save the IOU: ${err?.message || 'unknown error'}`);
    }
  }
  _emit('ious');
  return payload;
};

export const deleteIou = async (iouId) => {
  const uid = await getUserId();
  _patchCache('ious', old => old ? old.filter(x => x.id !== iouId) : []);
  if (uid) {
    try {
      const current = _cache['ious']?.data || [];
      localStorage.setItem(`vm_ious:${uid}`, JSON.stringify(current));
    } catch {}
    try {
      await deleteDoc(doc(db, 'users', uid, 'ious', iouId));
    } catch (err) {
      invalidateCache('ious');
      throw new Error(`Couldn’t delete the IOU: ${err?.message || 'unknown error'}`);
    }
  }
  _emit('ious');
  return true;
};

// ─── FREELANCER INVOICES & CLIENT BILLING ──────────────────────────
export const fetchInvoices = async () => cachedFetch('invoices', async () => {
  const uid = await getUserId();
  if (!uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'invoices'));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => new Date(b.issueDate || 0) - new Date(a.issueDate || 0));
  } catch {
  const local = localStorage.getItem(`vm_invoices:${uid}`);
  return local ? JSON.parse(local) : [];
}
});

export const settleInvoice = async (id, accountId) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  if (!accountId) throw new Error('Choose a receiving account');
  const invoiceRef = doc(db, 'users', uid, 'invoices', String(id));
  const accountRef = doc(db, 'accounts', String(accountId));
  const paymentRef = doc(db, 'transactions', `invoice_${encodeURIComponent(uid)}_${encodeURIComponent(id)}`);
  await runTransaction(db, async txn => {
    const invoice = await txn.get(invoiceRef), account = await txn.get(accountRef), payment = await txn.get(paymentRef);
    if (!invoice.exists()) throw new Error('Save this invoice online before settling');
    const inv = invoice.data();
    if (inv.status === 'Paid') {
      if (inv.payment_transaction_id && payment.exists() && payment.data().uid === uid && inv.payment_transaction_id === paymentRef.id) return;
      throw new Error('This invoice is already paid. Review its existing payment');
    }
    if (payment.exists()) throw new Error('An existing payment needs review');
    if (!account.exists() || account.data().uid !== uid) throw new Error('Account not found');
    if (account.data().archived) throw new Error('Choose an active account');
    requireMatchingCurrency(inv, account.data());
    if (!Array.isArray(inv.items) || !inv.items.length) throw new Error('Invoice needs line items');
    let subtotal = 0;
    for (const item of inv.items) {
      const quantity = Number(item.quantity), price = Number(item.unitPrice);
      if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price < 0) throw new Error('Invalid invoice line item');
      subtotal += roundMoney(quantity * price);
    }
    const tax = Number(inv.taxRate || 0);
    if (!Number.isFinite(tax) || tax < 0 || tax > 100) throw new Error('Invalid invoice tax rate');
    const amount = roundMoney(subtotal * (1 + tax / 100));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) throw new Error('Invalid invoice total');
    const date = todayYMD(), now = new Date().toISOString();
    txn.update(accountRef, { balance: addMoney(account.data().balance, amount), last_ledger_ref: String(paymentRef.id), last_ledger_op: 'create' });
    txn.update(invoiceRef, { status: 'Paid', paidDate: date, payment_transaction_id: paymentRef.id, account_id: accountId, updated_at: now });
    txn.set(paymentRef, { uid, type: 'Income', amount, date, currency: inv.currency || 'LKR', category: 'Business', notes: `Payment for Invoice #${inv.invoiceNumber || id}`, to_account_id: accountId, from_account_id: null, invoice_id: id, recorded_at: now });
  });
  invalidateCache(); refreshLedger();
};

export const saveInvoice = async (invoiceData) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  if (invoiceData.status === 'Paid' || invoiceData.payment_transaction_id) throw new Error('Use Settle to record invoice payments');
  const existing = await fetchInvoices();
  const id = invoiceData.id || `inv_${Date.now()}`;
  const payload = { ...invoiceData, id, uid, currency: invoiceData.currency || getCurrency(), updated_at: new Date().toISOString() };
  const ref = doc(db, 'users', uid, 'invoices', id);
  await runTransaction(db, async txn => {
    const current = await txn.get(ref);
    if (current.exists() && (current.data().status === 'Paid' || current.data().payment_transaction_id)) throw new Error('Settled invoices cannot be overwritten');
    txn.set(ref, payload);
  });
  const saved = [...existing.filter(item => item.id !== id), payload];
  _cache.invoices = {data:saved,ts:Date.now()};
  try { localStorage.setItem(`vm_invoices:${uid}`, JSON.stringify(saved)); } catch {}
  _emit('invoices');
  return payload;
};

export const deleteInvoice = async (invoiceId) => {
  const uid = await getUserId();
  if (!uid) throw new Error('Sign in to continue');
  const ref = doc(db, 'users', uid, 'invoices', invoiceId);
  await runTransaction(db, async txn => {
    const snap = await txn.get(ref);
    if (snap.exists() && (snap.data().status === 'Paid' || snap.data().payment_transaction_id)) throw new Error('Keep settled invoices for payment history');
    txn.delete(ref);
  });
  invalidateCache('invoices');
  try { localStorage.removeItem(`vm_invoices:${uid}`); } catch {}
  _emit('invoices');
};

