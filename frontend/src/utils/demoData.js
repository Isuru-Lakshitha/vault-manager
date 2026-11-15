import { createAccount, createTransaction, createBill, createGoal, createLoan, fetchAccounts } from './api';

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

/**
 * Loads the institutional demo sandbox dataset into the user's account
 */
export async function loadDemoPortfolio() {
  await fetchAccounts();
  const createdAccMap = {};

  // 1. Create Accounts
  for (const acc of DEMO_DATASET.accounts) {
    const created = await createAccount(acc);
    if (created && created.id) createdAccMap[acc.name] = created.id;
  }

  // Get primary account ID
  const freshAccounts = await fetchAccounts();
  const primaryId = freshAccounts[0]?.id || '';

  // 2. Create Bills
  for (const bill of DEMO_DATASET.bills) {
    await createBill(bill).catch(() => {});
  }

  // 3. Create Goals
  for (const goal of DEMO_DATASET.goals) {
    await createGoal(goal).catch(() => {});
  }

  // 4. Create Loans
  for (const loan of DEMO_DATASET.loans) {
    await createLoan(loan).catch(() => {});
  }

  // 5. Create Transactions
  for (const tx of DEMO_DATASET.transactions) {
    await createTransaction({
      ...tx,
      from_account_id: primaryId,
      to_account_id: tx.type === 'Income' ? primaryId : ''
    }).catch(() => {});
  }

  localStorage.setItem('vm_demo_loaded', 'true');
  return true;
}
