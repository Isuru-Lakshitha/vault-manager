/**
 * Smart Subscription & Recurring Expense Pattern Auto-Detector
 * Scans transaction history to identify repeat expenses occurring at regular intervals (monthly/weekly).
 */

const parseLocalYMD = (str) => {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

export const detectUnmanagedSubscriptions = (transactions = [], bills = [], recurringRules = []) => {
  if (!transactions || transactions.length < 3) return [];

  const existingBillNames = new Set(
    (bills || []).map(b => (b.name || '').toLowerCase().trim())
  );
  const existingRecurringNames = new Set(
    (recurringRules || []).map(r => (r.notes || r.category || '').toLowerCase().trim())
  );

  // Consider only active expenses with positive amount (exclude reversed, reversal, and fee rows)
  const expenseTxs = transactions
    .filter(t => t && !t.reversed_at && !t.reversal_of && !t.is_transfer_fee && t.type === 'Expense' && Number(t.amount) > 0 && t.date)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // Helper to normalize merchant/notes
  const cleanMerchant = (str = '') => {
    return str
      .toLowerCase()
      .replace(/[0-9#*_\-/:.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  // Group by merchant key or category
  const groups = {};

  expenseTxs.forEach(tx => {
    const rawKey = tx.notes || tx.category || 'Unknown';
    const key = cleanMerchant(rawKey) || cleanMerchant(tx.category) || 'expense';
    
    // Ignore generic or non-subscription words
    if (key.length < 3 || key === 'cash' || key === 'transfer' || key === 'atm') return;

    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const detected = [];

  Object.entries(groups).forEach(([name, txList]) => {
    if (txList.length < 2) return;

    // Check if already in Bills or Recurring
    const isAlreadyTracked = 
      existingBillNames.has(name) ||
      Array.from(existingBillNames).some(b => b.includes(name) || name.includes(b)) ||
      existingRecurringNames.has(name) ||
      Array.from(existingRecurringNames).some(r => r.includes(name) || name.includes(r));

    if (isAlreadyTracked) return;

    // Calculate intervals between consecutive transactions in days
    const intervals = [];
    const amounts = txList.map(t => Number(t.amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

    // Verify amount variance is small (< 20%)
    const maxDiff = Math.max(...amounts.map(a => Math.abs(a - avgAmount)));
    if (avgAmount > 0 && maxDiff / avgAmount > 0.25) return;

    for (let i = 1; i < txList.length; i++) {
      const d1 = parseLocalYMD(txList[i - 1].date);
      const d2 = parseLocalYMD(txList[i].date);
      const diffDays = (d1 && d2) ? Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) : 0;
      if (diffDays > 0) intervals.push(diffDays);
    }

    if (intervals.length === 0) return;

    // Check if monthly cadence (25 to 35 days) or weekly (6 to 8 days)
    const isMonthly = intervals.some(days => days >= 25 && days <= 35);
    const isWeekly = intervals.some(days => days >= 6 && days <= 8);

    if (isMonthly || isWeekly) {
      const latestTx = txList[txList.length - 1];
      const prevTx = txList[txList.length - 2];
      const latestAmt = Number(latestTx.amount) || 0;
      const prevAmt = Number(prevTx?.amount) || 0;
      const priceHike = (prevAmt > 0 && latestAmt > prevAmt)
        ? {
            prevAmount: prevAmt,
            newAmount: latestAmt,
            diff: parseFloat((latestAmt - prevAmt).toFixed(2)),
            pct: Math.round(((latestAmt - prevAmt) / prevAmt) * 100),
          }
        : null;

      const displayName = latestTx.notes
        ? latestTx.notes.trim()
        : `${latestTx.category || 'Subscription'}`;

      detected.push({
        id: `detected-${name.replace(/\s+/g, '-')}`,
        rawKey: name,
        name: displayName,
        category: latestTx.category || 'Bills',
        amount: Math.round(latestAmt || avgAmount),
        cadence: isMonthly ? 'Monthly' : 'Weekly',
        lastDate: latestTx.date,
        occurrences: txList.length,
        from_account_id: latestTx.from_account_id || '',
        priceHike,
      });
    }
  });

  return detected.slice(0, 5); // Return top 5 detected subscriptions
};

export { calculateEmergencyRunway } from './financialIntelligence.js';
