import {
  createAccount, createTransaction, createBill, createGoal, createLoan,
  fetchAccounts, fetchTransactions, fetchBills, fetchGoals, fetchLoans,
  deleteTransaction, deleteBill, deleteGoal, deleteLoan, deleteAccount, invalidateCache,
} from './api';
import { demoRecords } from './demoRecords';

export const DEMO_DATASET = {
  accounts: [
    { name: 'Apex Premier Checking', type: 'Bank', balance: 8450, currency: 'USD', is_demo: true },
    { name: 'High-Yield Vault Reserve', type: 'Bank', balance: 32500, currency: 'USD', is_demo: true },
    { name: 'Sapphire Preferred Card', type: 'Credit Card', balance: 640, currency: 'USD', cashback_rate: 2.0, is_demo: true },
    { name: 'Revolut Global Travel', type: 'Mobile Wallet', balance: 1450, currency: 'EUR', is_demo: true }
  ],
  bills: [
    { name: 'AWS Cloud Hosting', amount: 120, category: 'Utilities', due_date: getFutureDate(4), paid: false, is_demo: true },
    { name: 'Fiber Internet 1Gbps', amount: 65, category: 'Bills', due_date: getFutureDate(11), paid: false, is_demo: true },
    { name: 'Equinox Fitness Club', amount: 95, category: 'Health', due_date: getFutureDate(18), paid: false, is_demo: true }
  ],
  goals: [
    { name: 'Fortress Emergency Fund', target_amount: 50000, current_amount: 32500, deadline: '2027-12-31', is_demo: true },
    { name: 'Tokyo Tech Summit Trip', target_amount: 6000, current_amount: 4200, deadline: '2027-08-15', is_demo: true }
  ],
  loans: [
    { loan_name: 'Model 3 Auto Financing', principal_amount: 22000, monthly_installment: 420, due_day: 15, status: 'Active', is_demo: true }
  ],
  transactions: [
    { type: 'Income', amount: 6500, category: 'Salary', notes: 'Monthly Tech Lead Salary Direct Deposit', date: getPastDate(2), is_demo: true },
    { type: 'Expense', amount: 1850, category: 'Rent', notes: 'Downtown Loft Monthly Lease', date: getPastDate(3), is_demo: true },
    { type: 'Expense', amount: 145.50, category: 'Food', notes: 'Whole Foods Market Organic Groceries', date: getPastDate(4), is_demo: true },
    { type: 'Expense', amount: 62.00, category: 'Transport', notes: 'Uber Business Client Commute', date: getPastDate(5), is_tax_deductible: true, tax_category: 'Travel & Transport', is_demo: true },
    { type: 'Expense', amount: 280.00, category: 'Shopping', notes: 'Apple Store Accessories & Cables', date: getPastDate(7), is_tax_deductible: true, tax_category: 'Office & Professional', is_demo: true },
    { type: 'Expense', amount: 35.00, category: 'Utilities', notes: 'GitHub Enterprise Subscription', date: getPastDate(12), is_tax_deductible: true, tax_category: 'Office & Professional', is_demo: true },
    { type: 'Expense', amount: 110.00, category: 'Entertainment', notes: 'Omni IMAX Cinema & Dining', date: getPastDate(14), is_demo: true },
    { type: 'Income', amount: 1250, category: 'Business', notes: 'Client Consultation Retainer Fee', date: getPastDate(18), is_demo: true }
  ]
};

function getPastDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getFutureDate(daysAhead) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DEMO_PRIMARY = 'Apex Premier Checking';

/**
 * Adds the demo dataset alongside the user's data. Every record is tagged
 * is_demo, and demo transactions only ever touch demo accounts, so real
 * balances never change and removeDemoPortfolio() can take it all back out.
 */
export async function loadDemoPortfolio() {
  const createdAccMap = {};
  for (const acc of DEMO_DATASET.accounts) {
    const created = await createAccount(acc);
    if (created && created.id) createdAccMap[acc.name] = created.id;
  }
  const demoAccountId = createdAccMap[DEMO_PRIMARY];
  if (!demoAccountId) throw new Error('Could not create the demo accounts');

  for (const bill of DEMO_DATASET.bills) await createBill(bill).catch(() => {});
  for (const goal of DEMO_DATASET.goals) await createGoal(goal).catch(() => {});
  for (const loan of DEMO_DATASET.loans) await createLoan(loan).catch(() => {});
  for (const tx of DEMO_DATASET.transactions) {
    await createTransaction({
      ...tx,
      from_account_id: tx.type === 'Income' ? '' : demoAccountId,
      to_account_id: tx.type === 'Income' ? demoAccountId : '',
    }).catch(() => {});
  }
  try { localStorage.setItem('vm_demo_loaded', 'true'); } catch { /* private mode */ }
  window.dispatchEvent(new Event('vm:data-changed'));
  return true;
}

/** Whether any demo record is present (used to offer removal). */
export async function hasDemoData() {
  const [accounts, transactions] = await Promise.all([fetchAccounts(), fetchTransactions()]);
  return demoRecords({ accounts, transactions }).total > 0;
}

/**
 * Removes every is_demo record. Transactions go first (each delete reverses
 * its balance change, which also repairs real accounts touched by older
 * versions of the demo), then bills, goals, loans and finally the accounts.
 * Returns what was removed and what had to be kept.
 */
export async function removeDemoPortfolio() {
  const [accounts, transactions, bills, goals, loans] = await Promise.all([
    fetchAccounts(), fetchTransactions(), fetchBills(), fetchGoals(), fetchLoans(),
  ]);
  const demo = demoRecords({ accounts, transactions, bills, goals, loans });
  const kept = [];
  let removed = 0;
  const run = async (items, del, label) => {
    for (const item of items) {
      try { await del(item.id); removed += 1; }
      catch (err) { kept.push(`${label} "${item.name || item.loan_name || item.notes || item.id}": ${err?.message || 'failed'}`); }
    }
  };
  await run(demo.transactions, deleteTransaction, 'Transaction');
  invalidateCache('transactions', 'accounts', 'analytics');
  await run(demo.bills, deleteBill, 'Bill');
  await run(demo.goals, deleteGoal, 'Goal');
  await run(demo.loans, deleteLoan, 'Loan');
  await run(demo.accounts, deleteAccount, 'Account');
  invalidateCache();
  try { localStorage.removeItem('vm_demo_loaded'); } catch { /* private mode */ }
  window.dispatchEvent(new Event('vm:data-changed'));
  return { removed, kept };
}
