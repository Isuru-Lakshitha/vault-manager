// Pure helper: which records belong to the demo dataset (tagged is_demo).
const tagged = (rows) => (Array.isArray(rows) ? rows.filter((r) => r && r.is_demo === true) : []);

export function demoRecords({ accounts, transactions, bills, goals, loans } = {}) {
  const out = {
    accounts: tagged(accounts),
    // Newest first, so later rows are reversed before the ones they follow.
    transactions: tagged(transactions).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    bills: tagged(bills),
    goals: tagged(goals),
    loans: tagged(loans),
  };
  out.total = out.accounts.length + out.transactions.length + out.bills.length + out.goals.length + out.loans.length;
  return out;
}
