/**
 * Financial Intelligence Engine
 * Computes:
 * 1. "Safe-to-Spend" discretionary cash & daily burn rate
 * 2. Duplicate charge detection & anomalous spending spikes
 * 3. Proactive weekly/monthly financial digest insights
 */

import { convertCurrency } from './format.js';

const parseLocalYMD = (str) => {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const isActiveTx = (t) => Boolean(t && !t.reversed_at && !t.reversal_of && !t.is_transfer_fee);

const toBaseAmount = (amount, currency, baseCurrency, rates) => {
  const val = parseFloat(amount) || 0;
  if (!baseCurrency || !currency || currency === baseCurrency || !rates) return val;
  const converted = convertCurrency(val, currency, baseCurrency, rates);
  return Number.isFinite(converted) ? converted : val;
};

/**
 * Calculates Safe-to-Spend discretionary liquidity
 */
export function calculateSafeToSpend({
  accounts = [],
  bills = [],
  loans = [],
  goals = [],
  transactions = [],
  recurringRules = [],
  creditCards = [],
  baseCurrency = null,
  rates = null,
}) {
  // 1. Calculate liquid cash (Checking, Savings, Cash, Wallets)
  const LIQUID_TYPES = ['Checking', 'Savings', 'Cash', 'Digital Wallet', 'Deposit', 'Bank Account'];
  const liquidAccounts = accounts.filter(a => {
    const t = (a.type || '').trim();
    return LIQUID_TYPES.includes(t) || (!['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(t) && (a.balance || 0) > 0);
  });

  const liquidCash = liquidAccounts.reduce(
    (sum, a) => sum + Math.max(0, toBaseAmount(a.balance, a.currency, baseCurrency, rates)),
    0
  );

  // Current date & month context (local timezone safe)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayKey = `${yyyy}-${mm}-${dd}`;
  const currentMonth = `${yyyy}-${mm}`;

  const lastDayOfMonth = new Date(yyyy, today.getMonth() + 1, 0).getDate();
  const daysRemainingInMonth = Math.max(1, lastDayOfMonth - today.getDate() + 1);
  const daysRemainingAfterToday = Math.max(1, lastDayOfMonth - today.getDate());

  // 2. Recurring Payments (Fixed Date + Flexible "No Fixed Date" + Variable Amount with Rolling Average)
  const activeRecurringRules = (recurringRules || []).filter(r => r && !r.paused);
  const expenseRecurringRules = activeRecurringRules.filter(r => r.type !== 'Income' && r.type !== 'Transfer');
  const incomeRecurringRules = activeRecurringRules.filter(r => r.type === 'Income');

  const getRuleEstimatedAmount = (r) => {
    let base = parseFloat(r.amount) || parseFloat(r.avg_amount) || 0;
    if (base <= 0 && r.is_variable && Array.isArray(r.payment_history) && r.payment_history.length > 0) {
      const recent3 = r.payment_history.slice(-3);
      const avg = recent3.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0) / recent3.length;
      if (avg > 0) base = Math.round(avg);
    }
    base = toBaseAmount(base, r.currency, baseCurrency, rates);
    if (r.frequency === 'Weekly') return Math.round(base * 4.33);
    if (r.frequency === 'Yearly') return Math.round(base / 12);
    return base;
  };

  const unpaidRecurringItems = [];
  const paidRecurringItems = [];
  const linkedLoanIdsInRecurring = new Set();

  expenseRecurringRules.forEach(r => {
    const estAmount = getRuleEstimatedAmount(r);
    const isPaid = r.last_applied_month === currentMonth;
    if (r.loan_id) linkedLoanIdsInRecurring.add(String(r.loan_id));
    const settledRaw = (!r.last_paid_marked_only && parseFloat(r.last_paid_amount) > 0) ? parseFloat(r.last_paid_amount) : null;
    const item = {
      id: r.id,
      name: r.name || r.notes || r.category || 'Recurring Payment',
      category: r.category || 'Bills',
      amount: isPaid ? (settledRaw !== null ? toBaseAmount(settledRaw, r.currency, baseCurrency, rates) : estAmount) : estAmount,
      estimatedAmount: estAmount,
      isVariable: Boolean(r.is_variable),
      scheduleMode: r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible'),
      dayOfMonth: r.day_of_month || null,
      loanId: r.loan_id || null,
      isPaid,
      lastPaidDate: r.last_paid_date || null,
    };
    if (isPaid) paidRecurringItems.push(item);
    else unpaidRecurringItems.push(item);
  });

  const unpaidRecurringTotal = unpaidRecurringItems.reduce((s, r) => s + r.amount, 0);
  const paidRecurringThisMonth = paidRecurringItems.reduce((s, r) => s + r.amount, 0);
  const nextMonthRulesTotal = [...unpaidRecurringItems, ...paidRecurringItems].reduce((s, r) => s + r.estimatedAmount, 0);

  const expectedRecurringIncomeUnreceived = incomeRecurringRules
    .filter(r => r.last_applied_month !== currentMonth)
    .reduce((s, r) => s + toBaseAmount(r.amount, r.currency, baseCurrency, rates), 0);

  // 3. Upcoming unpaid bills in the next 30 days (deduplicated against recurring rules by name)
  const recurringNamesLower = new Set(
    expenseRecurringRules.map(r => (r.name || r.notes || r.category || '').trim().toLowerCase()).filter(Boolean)
  );
  const upcomingBills = bills.filter(b => {
    if (b.paid) return false;
    const bName = (b.name || '').trim().toLowerCase();
    if (bName && recurringNamesLower.has(bName)) return false;
    if (!b.due_date) return true; // count if due date unspecified
    const due = parseLocalYMD(b.due_date);
    if (!due) return true;
    const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));
    return diffDays >= -5 && diffDays <= 30; // overdue or due within 30 days
  });
  const upcomingBillsTotal = upcomingBills.reduce((sum, b) => sum + toBaseAmount(b.amount, b.currency, baseCurrency, rates), 0);

  // 4. Active Gold Loans & Debt Monthly Obligations (auto-computes monthly interest when monthly_payment is not set)
  const activeLoans = loans.filter(l => (l.status || 'Active') === 'Active');
  const monthLoanTxns = (transactions || []).filter(
    t => isActiveTx(t) && t.date?.startsWith(currentMonth) && (t.type === 'Loan Payment' || (t.category || '').toLowerCase().includes('loan'))
  );

  const loanItems = activeLoans.map(l => {
    const principal = toBaseAmount(l.principal_amount, l.currency, baseCurrency, rates);
    const apr = parseFloat(l.annual_interest_rate) || 0;
    const monthlyInterest = (principal * (apr / 100)) / 12;
    const customMonthly = toBaseAmount(l.monthly_payment || l.emi || l.monthly_installment, l.currency, baseCurrency, rates);
    const linkedRule = expenseRecurringRules.find(r => String(r.loan_id) === String(l.id));
    const targetMonthly = Math.max(
      monthlyInterest,
      customMonthly,
      linkedRule ? getRuleEstimatedAmount(linkedRule) : 0
    );

    const paidViaTxns = monthLoanTxns
      .filter(t => {
        if (t.loan_id && String(t.loan_id) === String(l.id)) return true;
        const lName = (l.item_name || '').trim().toLowerCase();
        const tNote = (t.notes || '').toLowerCase();
        return lName && tNote.includes(lName);
      })
      .reduce((s, t) => s + toBaseAmount(t.amount, t.currency, baseCurrency, rates), 0);

    const markedPaidForMonth = l.last_paid_month === currentMonth || (linkedRule && linkedRule.last_applied_month === currentMonth);

    const paidThisMonth = markedPaidForMonth
      ? Math.max(paidViaTxns, targetMonthly, toBaseAmount(linkedRule?.last_paid_amount || linkedRule?.amount, linkedRule?.currency || l.currency, baseCurrency, rates))
      : paidViaTxns;

    const remainingThisMonth = markedPaidForMonth ? 0 : Math.max(0, targetMonthly - paidThisMonth);
    const isPaidThisMonth = markedPaidForMonth || (targetMonthly > 0 ? remainingThisMonth <= 1 : paidThisMonth > 0);

    return {
      id: l.id,
      name: l.item_name || 'Gold Loan',
      lender: l.lender_name || '',
      principal,
      apr,
      monthlyInterest,
      accruedInterest: toBaseAmount(l.current_accrued_interest ?? l.unpaid_interest, l.currency, baseCurrency, rates),
      monthlyTarget: targetMonthly,
      paidThisMonth,
      remainingThisMonth,
      isPaidThisMonth,
      isLinkedToRecurring: linkedLoanIdsInRecurring.has(String(l.id)),
    };
  });

  // Unlinked loan obligations not already counted in unpaidRecurringTotal
  const unlinkedLoanEMIs = loanItems
    .filter(item => !item.isLinkedToRecurring)
    .reduce((sum, item) => sum + item.remainingThisMonth, 0);

  const unlinkedLoanMonthlyTargets = loanItems
    .filter(item => !item.isLinkedToRecurring)
    .reduce((sum, item) => sum + item.monthlyTarget, 0);

  const nextMonthRecurringTotal = nextMonthRulesTotal + unlinkedLoanMonthlyTargets;

  // Total unpaid loan obligation this month (including any linked to recurring)
  const monthlyLoanEMIs = loanItems.reduce((sum, item) => sum + item.remainingThisMonth, 0);
  const totalLoanMonthlyTarget = loanItems.reduce((sum, item) => sum + item.monthlyTarget, 0);
  const paidLoansThisMonth = loanItems.reduce((sum, item) => sum + item.paidThisMonth, 0);

  // 5. Goals monthly & daily savings allocation
  const activeGoals = goals.filter(g => (parseFloat(g.current_amount) || 0) < (parseFloat(g.target_amount) || 0));
  const goalItems = activeGoals.map(g => {
    const currentAmt = toBaseAmount(g.current_amount, g.currency, baseCurrency, rates);
    const targetAmt = toBaseAmount(g.target_amount, g.currency, baseCurrency, rates);
    const remaining = Math.max(0, targetAmt - currentAmt);
    let monthlyNeeded = 0;
    let monthsLeft = null;
    if (g.monthly_contribution && parseFloat(g.monthly_contribution) > 0) {
      monthlyNeeded = Math.min(remaining, toBaseAmount(g.monthly_contribution, g.currency, baseCurrency, rates));
    } else if (g.target_date || g.deadline) {
      const target = parseLocalYMD(g.target_date || g.deadline);
      monthsLeft = target ? Math.max(1, Math.ceil((target - today) / (1000 * 60 * 60 * 24 * 30))) : 1;
      monthlyNeeded = remaining / monthsLeft;
    } else {
      monthlyNeeded = remaining * 0.1;
    }
    return {
      id: g.id,
      name: g.name || 'Savings Goal',
      currentAmount: currentAmt,
      targetAmount: targetAmt,
      remaining,
      monthsLeft,
      monthlyNeeded,
      dailyNeeded: monthlyNeeded / daysRemainingInMonth,
      deadline: g.target_date || g.deadline || null,
    };
  });

  const monthlyGoalsAllocation = goalItems.reduce((sum, g) => sum + g.monthlyNeeded, 0);

  // Check if user already contributed to goals this month via transactions
  const contributedToGoalsThisMonth = (transactions || [])
    .filter(t => isActiveTx(t) && t.type === 'Expense' && t.date?.startsWith(currentMonth) && (t.category || '') !== 'Goal Deduction' && (
      t.goal_id ||
      (t.category || '').toLowerCase().includes('goal') ||
      (t.category || '').toLowerCase().includes('saving') ||
      (t.notes || '').toLowerCase().includes('goal:')
    ))
    .reduce((s, t) => s + toBaseAmount(t.amount, t.currency, baseCurrency, rates), 0);

  const remainingGoalQuotaThisMonth = Math.max(0, monthlyGoalsAllocation - contributedToGoalsThisMonth);
  const dailyGoalSavingNeeded = remainingGoalQuotaThisMonth / daysRemainingInMonth;

  // 6. Credit card balances owed (both Credit Card type accounts and dedicated credit_cards docs)
  const accountCardDebt = accounts
    .filter(a => (a.type || '').toLowerCase().includes('credit'))
    .reduce((sum, a) => sum + Math.max(0, toBaseAmount(a.balance, a.currency, baseCurrency, rates)), 0);
  const dedicatedCardDebt = (creditCards || [])
    .reduce((sum, c) => sum + Math.max(0, toBaseAmount(c.balance ?? c.current_balance, c.currency, baseCurrency, rates)), 0);
  const creditCardDebt = accountCardDebt + dedicatedCardDebt;

  // 7. Total Unpaid Commitments & 3 Safe-to-Spend Modes
  // Note: unpaidRecurringTotal already includes recurring rules linked to loans, so we add unlinkedLoanEMIs to avoid double-counting
  const hardCommitments = upcomingBillsTotal + unpaidRecurringTotal + unlinkedLoanEMIs + creditCardDebt;

  // Strict Mode: Reserves 100% of hard commitments + 100% of remaining monthly Goal Savings Quota
  const strictCommitments = hardCommitments + remainingGoalQuotaThisMonth;
  const strictSafeToSpend = Math.max(0, liquidCash - strictCommitments);
  const strictDailySpend = strictSafeToSpend / daysRemainingInMonth;

  // Balanced Mode (default): Reserves 100% of hard commitments + 50% of remaining monthly Goal Savings Quota
  const commitments = hardCommitments + (remainingGoalQuotaThisMonth * 0.5);
  const safeToSpend = Math.max(0, liquidCash - commitments);
  const dailyDiscretionary = safeToSpend / daysRemainingInMonth;

  // Survival / Bills & Loans Only Mode: Reserves 100% of bills, recurring & Gold Loans (0% goal reservation)
  const essentialsSafeToSpend = Math.max(0, liquidCash - hardCommitments);
  const essentialsDailySpend = essentialsSafeToSpend / daysRemainingInMonth;

  // 8. Live Today's Spend & Tomorrow's Adjusted Allowance (excludes reserved bill/recurring/loan/card/goal payments)
  const spentToday = (transactions || [])
    .filter(t => isActiveTx(t) && t.type === 'Expense' && t.date === todayKey &&
      !t.recurring_rule_id && !t.bill_id && !t.loan_id && !t.credit_card_id && !t.goal_id &&
      t.category !== 'Balance Adjustment' && t.category !== 'Reconciliation')
    .reduce((s, t) => s + toBaseAmount(t.amount, t.currency, baseCurrency, rates), 0);

  const remainingToday = Math.max(0, strictDailySpend - spentToday);
  const overspentToday = Math.max(0, spentToday - strictDailySpend);
  // Since liquidCash already reflects today's recorded transactions, tomorrow's daily limit across remaining days is:
  const adjustedTomorrowDaily = strictSafeToSpend / daysRemainingAfterToday;
  const weeklySafeAllowance = strictDailySpend * Math.min(7, daysRemainingInMonth);

  let status = 'healthy';
  if (liquidCash <= 0 || safeToSpend <= 0) {
    status = 'critical';
  } else if (safeToSpend < liquidCash * 0.3) {
    status = 'tight';
  }

  return {
    liquidCash,
    commitments,
    hardCommitments,
    strictCommitments,
    upcomingBillsTotal,
    upcomingBillsCount: upcomingBills.length,
    upcomingBills,
    unpaidRecurringTotal,
    paidRecurringThisMonth,
    nextMonthRecurringTotal,
    unpaidRecurringCount: unpaidRecurringItems.length,
    paidRecurringCount: paidRecurringItems.length,
    unpaidRecurringItems,
    paidRecurringItems,
    expectedRecurringIncomeUnreceived,
    monthlyLoanEMIs,
    unlinkedLoanEMIs,
    totalLoanMonthlyTarget,
    paidLoansThisMonth,
    loanItems,
    monthlyGoalsAllocation,
    contributedToGoalsThisMonth,
    remainingGoalQuotaThisMonth,
    dailyGoalSavingNeeded,
    goalItems,
    creditCardDebt,
    safeToSpend,
    strictSafeToSpend,
    essentialsSafeToSpend,
    daysRemainingInMonth,
    daysRemainingAfterToday,
    dailyDiscretionary,
    dailyAllowance: dailyDiscretionary,
    strictDailySpend,
    balancedDailySpend: dailyDiscretionary,
    essentialsDailySpend,
    spentToday,
    remainingToday,
    overspentToday,
    adjustedTomorrowDaily,
    weeklySafeAllowance,
    status,
  };
}

/**
 * Detects anomalies: duplicate charges and unusual spending spikes
 */
export function detectAnomalies(transactions = []) {
  const anomalies = [];
  if (!transactions || transactions.length < 2) return anomalies;

  // Filter active expenses (exclude reversed/reversal/fee entries)
  const expenses = transactions
    .filter(t => isActiveTx(t) && t.type === 'Expense' && (parseFloat(t.amount) || 0) > 0)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // 1. Duplicate detection: same amount + same notes/merchant/category within 36h
  for (let i = 0; i < Math.min(expenses.length, 50); i++) {
    const cur = expenses[i];
    const curTime = (parseLocalYMD(cur.date) || new Date(cur.created_at || 0)).getTime();
    const curAmt = parseFloat(cur.amount);
    const curNote = (cur.notes || '').trim().toLowerCase();
    const curCat = (cur.category || '').trim().toLowerCase();

    for (let j = i + 1; j < Math.min(expenses.length, i + 10); j++) {
      const other = expenses[j];
      const otherTime = (parseLocalYMD(other.date) || new Date(other.created_at || 0)).getTime();
      const timeDiffHours = Math.abs(curTime - otherTime) / (1000 * 60 * 60);

      if (timeDiffHours <= 36) {
        const otherAmt = parseFloat(other.amount);
        const otherNote = (other.notes || '').trim().toLowerCase();
        const otherCat = (other.category || '').trim().toLowerCase();

        const matchAmount = Math.abs(curAmt - otherAmt) < 0.01;
        const matchNote = curNote && otherNote && (curNote === otherNote || curNote.includes(otherNote) || otherNote.includes(curNote));
        const matchCategory = !curNote && !otherNote && curCat && curCat === otherCat;

        if (matchAmount && (matchNote || matchCategory)) {
          // Avoid duplicate flagging
          const already = anomalies.some(a => a.id === `dup_${cur.id}_${other.id}` || a.id === `dup_${other.id}_${cur.id}`);
          if (!already) {
            anomalies.push({
              id: `dup_${cur.id}_${other.id}`,
              type: 'duplicate',
              severity: 'warning',
              title: 'Possible Duplicate Charge',
              message: `2 identical charges of ${curAmt.toLocaleString()} for "${cur.notes || cur.category}" within 24 hours.`,
              txId: cur.id,
              date: cur.date,
              amount: curAmt,
            });
          }
        }
      }
    }
  }

  // 2. Spending spike detection: recent transaction > 2.5x category baseline (median / leave-one-out mean)
  const catStats = {};
  expenses.forEach(t => {
    const cat = t.category || 'General';
    const amt = parseFloat(t.amount) || 0;
    if (!catStats[cat]) catStats[cat] = { total: 0, count: 0, amounts: [] };
    catStats[cat].total += amt;
    catStats[cat].count += 1;
    catStats[cat].amounts.push(amt);
  });

  const todayMid = new Date();
  todayMid.setHours(0, 0, 0, 0);
  const recentExpenses = expenses.slice(0, 15);

  recentExpenses.forEach(t => {
    const cat = t.category || 'General';
    const stat = catStats[cat];
    if (stat && stat.count >= 4) {
      const amt = parseFloat(t.amount) || 0;
      const sorted = [...stat.amounts].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
      const otherMean = stat.count > 1 ? (stat.total - amt) / (stat.count - 1) : stat.total;
      const baseline = Math.min(median || otherMean, otherMean || median);

      if (baseline > 0 && amt >= baseline * 2.5 && amt > 1000) {
        const tDate = parseLocalYMD(t.date)?.getTime() || 0;
        const daysAgo = (todayMid.getTime() - tDate) / (1000 * 60 * 60 * 24);
        if (daysAgo <= 30) {
          anomalies.push({
            id: `spike_${t.id}`,
            type: 'spike',
            severity: 'info',
            title: `Unusual ${cat} Spend`,
            message: `Charge of ${amt.toLocaleString()} is ${(amt / baseline).toFixed(1)}× your typical ${cat} spend (${Math.round(baseline).toLocaleString()}).`,
            txId: t.id,
            date: t.date,
            amount: amt,
          });
        }
      }
    }
  });

  return anomalies;
}

/**
 * Generates smart financial digest insights for Dashboard
 */
export function generateFinancialDigest({
  transactions = [],
  budgets: _budgets = [],
  bills = [],
  goals = [],
}) {
  const insights = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 1. Week-over-week spending pace (local calendar midnight comparisons, excludes reversals)
  const oneWeekAgo = new Date(today);
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  const twoWeeksAgo = new Date(today);
  twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

  const activeExpenses = (transactions || []).filter(
    t => isActiveTx(t) && (t.type === 'Expense' || t.type === 'Loan Payment')
  );

  const thisWeekSpend = activeExpenses
    .filter(t => {
      const d = parseLocalYMD(t.date);
      return d && d >= oneWeekAgo && d <= today;
    })
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  const lastWeekSpend = activeExpenses
    .filter(t => {
      const d = parseLocalYMD(t.date);
      return d && d >= twoWeeksAgo && d < oneWeekAgo;
    })
    .reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

  if (lastWeekSpend > 0) {
    const pctDiff = Math.round(((thisWeekSpend - lastWeekSpend) / lastWeekSpend) * 100);
    if (pctDiff <= -10) {
      insights.push({
        id: 'pace_down',
        icon: '📉',
        type: 'success',
        text: `Great job! You spent ${Math.abs(pctDiff)}% less this week compared to last week.`,
      });
    } else if (pctDiff >= 20) {
      insights.push({
        id: 'pace_up',
        icon: '⚠️',
        type: 'warning',
        text: `Spending is up ${pctDiff}% this week compared to last week. Keep an eye on discretionary costs.`,
      });
    }
  }

  // 2. Urgent upcoming bills
  const urgentBills = bills.filter(b => {
    if (b.paid || !b.due_date) return false;
    const due = parseLocalYMD(b.due_date);
    if (!due) return false;
    const diff = Math.round((due - today) / (1000 * 60 * 60 * 24));
    return diff >= 0 && diff <= 5;
  });

  if (urgentBills.length > 0) {
    const sum = urgentBills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    insights.push({
      id: 'urgent_bills',
      icon: '⏰',
      type: 'warning',
      text: `${urgentBills.length} bill${urgentBills.length > 1 ? 's' : ''} (${sum.toLocaleString()}) due in the next 5 days.`,
    });
  }

  // 3. Goal milestones near completion
  const nearGoals = goals.filter(g => {
    const cur = parseFloat(g.current_amount) || 0;
    const tgt = parseFloat(g.target_amount) || 0;
    if (tgt <= 0) return false;
    const pct = (cur / tgt) * 100;
    return pct >= 80 && pct < 100;
  });

  if (nearGoals.length > 0) {
    const g = nearGoals[0];
    const pct = Math.round((g.current_amount / g.target_amount) * 100);
    insights.push({
      id: 'near_goal',
      icon: '🎯',
      type: 'success',
      text: `Goal "${g.goal_name || g.name}" is ${pct}% funded! Almost there.`,
    });
  }

  return insights;
}

/**
 * Calculates Emergency Runway (months of liquid cash coverage based on recent burn rate)
 */
export function calculateEmergencyRunway(accounts = [], transactions = [], { baseCurrency = null, rates = null } = {}) {
  const LIQUID_TYPES = ['Checking', 'Savings', 'Cash', 'Digital Wallet', 'Deposit', 'Bank Account'];
  const liquidAccounts = (accounts || []).filter(a => {
    const t = (a.type || '').trim();
    return LIQUID_TYPES.includes(t) || (!['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(t) && (a.balance || 0) > 0);
  });
  const liquidCash = liquidAccounts.reduce(
    (sum, a) => sum + Math.max(0, toBaseAmount(a.balance, a.currency, baseCurrency, rates)),
    0
  );

  // Calculate monthly burn rate from last 90 days of active expenses & loan payments
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(now.getDate() - 90);

  const outflowTxs = (transactions || []).filter(
    t => isActiveTx(t) && (t.type === 'Expense' || t.type === 'Loan Payment')
  );

  const expenses90d = outflowTxs
    .filter(t => {
      const d = parseLocalYMD(t.date);
      return d && d >= ninetyDaysAgo && d <= now;
    })
    .reduce((s, t) => s + toBaseAmount(t.amount, t.currency, baseCurrency, rates), 0);

  let monthlyBurn = expenses90d > 0 ? expenses90d / 3 : 0;
  if (monthlyBurn <= 0) {
    const allExpenses = outflowTxs
      .reduce((s, t) => s + toBaseAmount(t.amount, t.currency, baseCurrency, rates), 0);
    monthlyBurn = allExpenses > 0 ? allExpenses : 1;
  }

  const runwayMonths = monthlyBurn > 0 ? liquidCash / monthlyBurn : 0;

  let tier = 'Robust';
  if (runwayMonths < 1) tier = 'Critical';
  else if (runwayMonths < 3) tier = 'Vulnerable';
  else if (runwayMonths < 6) tier = 'Moderate';
  else tier = 'Fortress';

  return {
    runwayMonths: Number(runwayMonths.toFixed(1)),
    liquidCash: Math.round(liquidCash),
    monthlyBurn: Math.round(monthlyBurn),
    tier,
    status: tier
  };
}
