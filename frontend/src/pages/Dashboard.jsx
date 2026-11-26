import { useT } from '../i18n';
import { removeItemWithUndo } from '../components/undoToast';
import ToolMenu from '../components/ToolMenu';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useLiveData from '../utils/useLiveData';
import { fetchAnalytics, fetchGoals, fetchBudgets, fetchBills, fetchRecurringTransactions, fetchExchangeRates, fetchCreditCards, recordNetWorthSnapshot, fetchNetWorthHistory, deleteTransaction, getCache, getCategorySpendFromMap } from '../utils/api';
import { todayYMD, toYMD } from '../utils/dates';
import { auth } from '../utils/firebaseApp';
import { TrendingDown, Activity, Zap, X, ChevronUp, ChevronDown } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import MoreSection from '../components/MoreSection';
import TransactionPopup from '../components/TransactionPopup';
import SmartDigestWidget from '../components/SmartDigestWidget';
import FinancialCalendar from '../components/FinancialCalendar';
import { calculateSafeToSpend, detectAnomalies, generateFinancialDigest } from '../utils/financialIntelligence';

import SkeletonLoader from '../components/SkeletonLoader';

import EmergencyRunwayCard from '../components/EmergencyRunwayCard';
import SafeToSpendCard from '../components/SafeToSpendCard';
import GettingStarted from '../components/GettingStarted';
import MonthClosePrompt from '../components/MonthClosePrompt';
import DemoDataBanner from '../components/DemoDataBanner';
import SummaryBreakdownModal from './dashboard/SummaryBreakdownModal';
import MonthlyStoryModal from '../components/MonthlyStoryModal';
import AchievementsModal from '../components/AchievementsModal';
import { evaluateAchievements } from '../utils/achievements';
import { detectUnmanagedSubscriptions } from '../utils/subscriptionDetector';

import { motion } from 'framer-motion';
import { spring } from '../motion/presets';
import useTilt3D from '../motion/useTilt3D';
import './dashboard.css';
import { formatCurrency, getCurrency, convertCurrency, haptic } from '../utils/format';
import toast from 'react-hot-toast';
import { getSystemAnnouncement } from '../utils/adminService';
import { getBackupHealthStatus, exportFullVaultBackup, snoozeBackupReminder } from '../utils/backupCrypto';
import OverviewView from './dashboard/OverviewView';
import { isInternalMove } from '../utils/ledgerReporting.js';
import SpendingLimitsSection from './dashboard/SpendingLimitsSection';
import NetWorthSection from './dashboard/NetWorthSection';

const COLORS = ['#4ade80','#a78bfa','#818cf8','#fb923c','#fbbf24'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{ background:'var(--hud-bg, rgba(6,8,20,0.97))', border:'1px solid rgba(74,222,128,0.25)', padding:'0.75rem 1rem', borderRadius:10, fontSize:'0.78rem' }}>
      {label && <p style={{ color:'var(--mm-success)', margin:'0 0 0.4rem', fontWeight:700 }}>{label}</p>}
      {payload.map((e,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:'1rem', color:e.color||'var(--mm-text-2)' }}>
          <span>{e.name}:</span><span style={{ color:'#fff', fontWeight:700 }}>{formatCurrency(e.value)}</span>
        </div>
      ))}
    </div>
  );
};

// Compute financial health score 0-100
const computeHealthScore = (savingsRate, budgets, expenses, totalIncome, loans) => {
  const savPts = Math.min(40, (savingsRate / 20) * 40);
  const totalBudgets = budgets.length;
  const onTrack = budgets.filter(b => getCategorySpendFromMap(expenses, b.category) <= b.amount).length;
  const budPts = totalBudgets > 0 ? (onTrack / totalBudgets) * 30 : 30;
  const monthlyLoanCost = loans.filter(l => l.status === 'Active').reduce((s, l) => s + l.principal_amount * ((l.annual_interest_rate || 0) / 100 / 12), 0);
  const monthlyIncome = totalIncome > 0 ? totalIncome / 12 : 1;
  const ratio = Math.min(1, monthlyLoanCost / monthlyIncome);
  const loanPts = (1 - ratio) * 20;
  const total = 30 + Math.round(savPts) + Math.round(budPts) + Math.round(loanPts);
  const breakdown = {
    'Savings Rate': Math.round((savPts / 40) * 10),
    'Budget Adherence': Math.round((budPts / 30) * 10),
    'Loan Ratio': Math.round((loanPts / 20) * 10),
  };
  return { score: Math.round(total), breakdown };
};

const readCachedDashboard = () => {
  try {
    const memAnl = getCache('analytics');
    if (memAnl) {
      return {
        anl: memAnl,
        gls: getCache('goals') || [],
        bgs: getCache('budgets') || [],
        bls: getCache('bills') || [],
        rec: getCache('recurring') || [],
        cds: getCache('credit_cards') || [],
      };
    }
    const uid = auth.currentUser?.uid;
    if (uid) {
      const raw = localStorage.getItem('vm_dash_snapshot_' + uid);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return null;
};

const Dashboard = () => {
  const t = useT();
  const initialCache = useMemo(() => readCachedDashboard(), []);
  const [accounts, setAccounts] = useState(() => initialCache?.anl?.accounts || []);
  const [loans, setLoans] = useState(() => initialCache?.anl?.loans || []);
  const [transactions, setTransactions] = useState(() => initialCache?.anl?.allTransactions || []);
  const [analytics, setAnalytics] = useState(() => initialCache?.anl || null);
  const [goals, setGoals] = useState(() => initialCache?.gls || []);
  const [budgets, setBudgets] = useState(() => initialCache?.bgs || []);
  const [bills, setBills] = useState(() => initialCache?.bls || []);
  const [recurringRules, setRecurringRules] = useState(() => initialCache?.rec || []);
  const [creditCards, setCreditCards] = useState(() => initialCache?.cds || []);
  const [loading, setLoading] = useState(() => !initialCache?.anl);
  const [now] = useState(new Date().toLocaleString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
  const [budgetAlerts, setBudgetAlerts] = useState([]);
  const [showSummary, setShowSummary] = useState(null);
  const [rates, setRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch {
  return null;
}
  });
  const [netWorthHistory, setNetWorthHistory] = useState([]);
  const [showNWBreakdown, setShowNWBreakdown] = useState(false);
  const navigate = useNavigate();
  const [popupTx, setPopupTx] = useState(null);
  const [summaryPopup, setSummaryPopup] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dismissedSubs, setDismissedSubs] = useState(false);
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [announcement, setAnnouncement] = useState(() => getSystemAnnouncement());
  const [backupStatus, setBackupStatus] = useState(() => getBackupHealthStatus());
  const [dailyLimit, setDailyLimit] = useState(() => parseFloat(localStorage.getItem('vm_daily_limit')) || 0);
  const [weeklyLimit, setWeeklyLimit] = useState(() => parseFloat(localStorage.getItem('vm_weekly_limit')) || 0);
  const [editingCaps, setEditingCaps] = useState(false);
  const [capForm, setCapForm] = useState(() => ({
    daily: localStorage.getItem('vm_daily_limit') || '',
    weekly: localStorage.getItem('vm_weekly_limit') || '',
  }));

  // Minimalist Mode state (Default TRUE: focused essentials, collapsible deep insights)
  const [isMinimalistView, setIsMinimalistView] = useState(() => {
    const stored = localStorage.getItem('vm_minimalist_view');
    return stored !== null ? stored === 'true' : true;
  });
  const [showAdvancedInsights, setShowAdvancedInsights] = useState(false);
  const dashRef = useRef(null);
  useTilt3D(dashRef);

  const toggleMinimalistView = (val) => {
    const next = typeof val === 'boolean' ? val : !isMinimalistView;
    setIsMinimalistView(next);
    try { localStorage.setItem('vm_minimalist_view', String(next)); } catch {}
    window.dispatchEvent(new CustomEvent('vm:minimalist-view-changed', { detail: next }));
    haptic();
  };

  useEffect(() => {
    const handler = (e) => setAnnouncement(e.detail);
    const backupHandler = () => setBackupStatus(getBackupHealthStatus());
    const minHandler = (e) => {
      if (typeof e?.detail === 'boolean') setIsMinimalistView(e.detail);
      else setIsMinimalistView(localStorage.getItem('vm_minimalist_view') !== 'false');
    };
    window.addEventListener('vm:system-announcement-updated', handler);
    window.addEventListener('vm:backup-status-changed', backupHandler);
    window.addEventListener('vm:backup-updated', backupHandler);
    window.addEventListener('vm:minimalist-view-changed', minHandler);
    return () => {
      window.removeEventListener('vm:system-announcement-updated', handler);
      window.removeEventListener('vm:backup-status-changed', backupHandler);
      window.removeEventListener('vm:backup-updated', backupHandler);
      window.removeEventListener('vm:minimalist-view-changed', minHandler);
    };
  }, []);

  useLiveData(() => loadData(true));

  useEffect(() => {
    const today = new Date();
    if (today.getDate() >= 1 && today.getDate() <= 5) {
      const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const lastMonthKey = toYMD(lastMonth).substring(0, 7);
      if (!localStorage.getItem('vm_monthly_summary_dismissed_' + lastMonthKey)) {
        setShowSummary(lastMonthKey);
      }
    }
  }, []);

  const handleDismissSummary = () => {
    if (showSummary) {
      localStorage.setItem('vm_monthly_summary_dismissed_' + showSummary, 'true');
      setShowSummary(null);
    }
  };

  const loadData = useCallback(async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [anl, gls, bgs, bls, rec, cds] = await Promise.all([
        fetchAnalytics(), fetchGoals(), fetchBudgets(), fetchBills(), fetchRecurringTransactions().catch(() => []), fetchCreditCards().catch(() => [])
      ]);
      setAccounts(anl.accounts || []); setLoans(anl.loans || []);
      setTransactions(anl.allTransactions || []);
      setAnalytics(anl); setGoals(gls); setBudgets(bgs); setBills(bls || []);
      setRecurringRules(rec || []); setCreditCards(cds || []);

      try {
        const uid = auth.currentUser?.uid;
        if (uid && anl) {
          localStorage.setItem('vm_dash_snapshot_' + uid, JSON.stringify({
            anl,
            gls: gls || [],
            bgs: bgs || [],
            bls: bls || [],
            rec: rec || [],
            cds: cds || [],
          }));
        }
      } catch {}

      // If user already has accounts or transactions, mark as onboarded so setup wizard never shows automatically
      if ((anl.accounts && anl.accounts.length > 0) || (anl.allTransactions && anl.allTransactions.length > 0)) {
        try {
          if (!localStorage.getItem('vm_onboarded')) {
            localStorage.setItem('vm_onboarded', 'true');
          }
        } catch {}
      }

      // Compute budget alerts (>80% or exceeded) using current month's category spend
      const currentMo = todayYMD().substring(0, 7);
      const fallbackExpByCategory = {};
      (anl.categoryData || []).forEach(c => { fallbackExpByCategory[c.category] = c.total; });
      const monthlyCatMap = anl.monthlyExpensesByCategory?.[currentMo] || anl.currentMonthExpensesByCategory || fallbackExpByCategory;
      const bAlerts = bgs
        .filter(b => b.amount > 0 && (!b.month || b.month === currentMo))
        .map(b => {
          const spent = getCategorySpendFromMap(monthlyCatMap, b.category);
          const pct = Math.round((spent / b.amount) * 100);
          return { id: b.id, pct, b, spent };
        })
        .filter(({ pct }) => pct >= 80)
        .map(({ id, pct, b, spent }) => ({
          id: `budget-${id}`,
          type: pct >= 100 ? 'danger' : 'warning',
          icon: '💰',
          title: pct >= 100 ? `Budget Exceeded: ${b.category}` : `Budget at ${pct}%: ${b.category}`,
          body: pct >= 100
            ? `You've spent ${formatCurrency(spent)} against a ${formatCurrency(b.amount)} limit.`
            : `${formatCurrency(spent)} of ${formatCurrency(b.amount)} used this month.`,
        }));

      // Compute due & overdue bills
      const today = new Date(); today.setHours(0,0,0,0);
      const billAlerts = (bls || [])
        .filter(b => !b.paid && b.due_date)
        .map(b => {
          const due = new Date(b.due_date); due.setHours(0,0,0,0);
          const days = Math.ceil((due - today) / (1000*60*60*24));
          return { b, days };
        })
        .filter(({ days }) => days <= 3)
        .sort((a,b) => a.days - b.days)
        .map(({ b, days }) => {
          let type = 'warning';
          let icon = '📅';
          let title = '';
          if (days < 0) {
            type = 'danger';
            icon = '🚨';
            title = `Overdue Bill: ${b.name}`;
          } else if (days === 0) {
            type = 'danger';
            icon = '⏰';
            title = `Bill Due Today: ${b.name}`;
          } else {
            type = 'warning';
            icon = '⚡';
            title = `Bill Due in ${days}d: ${b.name}`;
          }
          return {
            id: `bill-${b.id}`,
            type,
            icon,
            title,
            body: `${b.name} (${formatCurrency(b.amount)}) is ${days < 0 ? `overdue by ${Math.abs(days)} day(s)` : `due on ${b.due_date}`}.`,
          };
        });

      // Compute Custom Smart Spending Limits (Daily / Weekly Velocity Alerts)
      const velocityAlerts = [];
      const todayKey = todayYMD();
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const sevenDaysKey = toYMD(sevenDaysAgo);

      const allTxns = anl.allTransactions || [];
      const todaySpendVal = allTxns
        .filter(t => !isInternalMove(t) && t.type === 'Expense' && t.date === todayKey)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const weekSpendVal = allTxns
        .filter(t => !isInternalMove(t) && t.type === 'Expense' && t.date >= sevenDaysKey && t.date <= todayKey)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);

      const dLim = parseFloat(localStorage.getItem('vm_daily_limit')) || 0;
      const wLim = parseFloat(localStorage.getItem('vm_weekly_limit')) || 0;

      if (dLim > 0) {
        const dPct = Math.round((todaySpendVal / dLim) * 100);
        if (dPct >= 80) {
          velocityAlerts.push({
            id: `velocity-daily-${todayKey}`,
            type: dPct >= 100 ? 'danger' : 'warning',
            icon: '🚦',
            title: dPct >= 100 ? `Daily Cap Exceeded (${dPct}%)` : `Daily Spend Velocity at ${dPct}%`,
            body: `Today's spend is ${formatCurrency(todaySpendVal)} against your ${formatCurrency(dLim)} daily limit.`,
          });
        }
      }
      if (wLim > 0) {
        const wPct = Math.round((weekSpendVal / wLim) * 100);
        if (wPct >= 80) {
          velocityAlerts.push({
            id: `velocity-weekly-${todayKey}`,
            type: wPct >= 100 ? 'danger' : 'warning',
            icon: '🚦',
            title: wPct >= 100 ? `7-Day Cap Exceeded (${wPct}%)` : `Weekly Spend Velocity at ${wPct}%`,
            body: `Last 7 days spend is ${formatCurrency(weekSpendVal)} against your ${formatCurrency(wLim)} weekly limit.`,
          });
        }
      }

      const allAlerts = [...velocityAlerts, ...bAlerts, ...billAlerts];
      setBudgetAlerts(allAlerts);
      window.__budgetAlerts = allAlerts;
      window.dispatchEvent(new CustomEvent('vm:budget-alerts', { detail: allAlerts }));

      // Record today's net worth snapshot (non-blocking)
      const currentRates = await fetchExchangeRates().catch(() => null);
      if (currentRates) { setRates(currentRates); localStorage.setItem('vm_fx_rates', JSON.stringify(currentRates)); }
      const baseCur = getCurrency();
      const isDebtAcc = (a) => ['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(a.type);
      let snapMissingRate = false;
      const snapToBase = (amt, cur) => {
        const v = Number(amt) || 0;
        const c = cur || baseCur;
        if (c === baseCur) return v;
        const cv = convertCurrency(v, c, baseCur, currentRates);
        if (!Number.isFinite(cv)) { snapMissingRate = true; return 0; }
        return cv;
      };
      const assets = (anl.accounts || []).filter(a => !isDebtAcc(a)).reduce((s, a) => s + snapToBase(a.balance, a.currency), 0);
      const loanDebt = (anl.loans || []).filter(l => l.status === 'Active')
        .reduce((s, l) => s + snapToBase((Number(l.principal_amount) || 0) + (Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency), 0);
      const cardAccDebt = (anl.accounts || []).filter(isDebtAcc).reduce((s, a) => s + Math.abs(snapToBase(a.balance, a.currency)), 0);
      const dedicatedCardDebt = (cds || []).reduce((s, c) => s + Math.max(0, snapToBase(c.balance ?? c.current_balance, c.currency)), 0);
      const liabilities = loanDebt + cardAccDebt + dedicatedCardDebt;
      // Never save a net worth that had to leave out (or guess) foreign money.
      if (!snapMissingRate) recordNetWorthSnapshot(assets - liabilities, assets, liabilities).catch(() => {});

      // Fetch real net worth history (non-blocking)
      fetchNetWorthHistory().then(hist => setNetWorthHistory(hist || [])).catch(() => {});

      // Fetch live exchange rates (non-blocking)

    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { loadData(!!initialCache?.anl); }, [loadData, initialCache]);

  const baseCurrency = getCurrency();
  const isDebtAccount = (a) => ['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(a.type);
  const toBase = useCallback((amt, cur) => {
    const v = Number(amt) || 0;
    const c = cur || baseCurrency;
    if (c === baseCurrency) return v;
    const cv = convertCurrency(v, c, baseCurrency, rates);
    // No rate: leave it out (and say so below) rather than count it at face value.
    return Number.isFinite(cv) ? cv : 0;
  }, [baseCurrency, rates]);
  const missingRateCurrencies = useMemo(() => {
    const curs = new Set();
    const check = (cur) => { if (cur && cur !== baseCurrency && !Number.isFinite(convertCurrency(1, cur, baseCurrency, rates))) curs.add(cur); };
    accounts.forEach(a => check(a.currency));
    loans.forEach(l => check(l.currency));
    creditCards.forEach(c => check(c.currency));
    return [...curs];
  }, [accounts, loans, creditCards, baseCurrency, rates]);

  // KPIs
  const totalAssets = accounts.filter(a => !isDebtAccount(a)).reduce((s, a) => s + toBase(a.balance, a.currency), 0);
  const loanLiabilities = loans.filter(l => l.status === 'Active')
    .reduce((s, l) => s + toBase((Number(l.principal_amount) || 0) + (Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency), 0);
  const cardAccountLiabilities = accounts.filter(isDebtAccount).reduce((s, a) => s + Math.abs(toBase(a.balance, a.currency)), 0);
  const dedicatedCardLiabilities = creditCards.reduce((s, c) => s + Math.max(0, toBase(c.balance ?? c.current_balance, c.currency)), 0);
  const totalLiabilities = loanLiabilities + cardAccountLiabilities + dedicatedCardLiabilities;
  const netWorth = totalAssets - totalLiabilities;
  const currentMonth = todayYMD().substring(0, 7);
  const txToBase = useCallback((tx) => {
    const accId = tx.type === 'Income' ? tx.to_account_id : (tx.from_account_id || tx.to_account_id);
    const cur = tx.currency || accounts.find(a => String(a.id) === String(accId))?.currency || baseCurrency;
    return toBase(tx.amount, cur);
  }, [accounts, baseCurrency, toBase]);
  const monthlyIncome  = transactions.filter(tx => !isInternalMove(tx) && !tx.reversed_at && !tx.reversal_of && tx.type === 'Income' && tx.date?.startsWith(currentMonth)).reduce((s, tx) => s + txToBase(tx), 0);
  const monthlyExpense = transactions.filter(tx => !isInternalMove(tx) && !tx.reversed_at && !tx.reversal_of && (tx.type === 'Expense' || tx.type === 'Loan Payment') && tx.date?.startsWith(currentMonth)).reduce((s, tx) => s + txToBase(tx), 0);
  const monthlySavings = monthlyIncome - monthlyExpense;
  const savingsRate = monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : 0;

  // Financial Intelligence: Safe-to-Spend, Anomalies & Digest
  const safeToSpendData = useMemo(() => {
    return calculateSafeToSpend({ accounts, bills, loans, goals, transactions, recurringRules, creditCards, baseCurrency, rates });
  }, [accounts, bills, loans, goals, transactions, recurringRules, creditCards, baseCurrency, rates]);

  const anomalies = useMemo(() => {
    return detectAnomalies(transactions);
  }, [transactions]);

  const digestInsights = useMemo(() => {
    return generateFinancialDigest({ transactions, budgets, bills, goals });
  }, [transactions, budgets, bills, goals]);

  // Asset allocation chart
  const assetData = accounts
    .filter(a => !isDebtAccount(a) && toBase(a.balance, a.currency) > 0)
    .map(a => ({ name: a.name, value: toBase(a.balance, a.currency) }));

  // Income/expense chart from analytics
  const incomeExpenseData = [];
  if (analytics?.monthlyTrends) {
    const grouped = {};
    analytics.monthlyTrends.forEach(row => {
      if (!grouped[row.month]) grouped[row.month] = { name: row.month, Income: 0, Expense: 0 };
      grouped[row.month].Income  = row.Income  || grouped[row.month].Income;
      grouped[row.month].Expense = row.Expense || grouped[row.month].Expense;
    });
    Object.values(grouped).sort((a,b) => a.name.localeCompare(b.name)).forEach(r => incomeExpenseData.push(r));
  }

  // Net Worth trend — use REAL snapshots when available, fallback to simulated
  const netWorthChartData = (() => {
    if (netWorthHistory.length >= 2) {
      // Use real Firestore snapshots
      return netWorthHistory.slice(-30).map(s => ({
        month: s.date?.substring(5) || s.date,
        'Net Worth': Math.round(s.netWorth || 0),
      }));
    }
    // Fallback: simulate from monthly trends
    const trends = analytics?.monthlyTrends || [];
    if (trends.length === 0) return [];
    const byMonth = {};
    trends.forEach(r => {
      if (!byMonth[r.month]) byMonth[r.month] = { Income: 0, Expense: 0 };
      byMonth[r.month].Income  = r.Income  || byMonth[r.month].Income;
      byMonth[r.month].Expense = r.Expense || byMonth[r.month].Expense;
    });
    const sorted = Object.keys(byMonth).sort().slice(-12);
    if (sorted.length === 0) return [];
    const nets = sorted.map(m => byMonth[m].Income - byMonth[m].Expense);
    const totalCumulative = nets.reduce((s, v) => s + v, 0);
    let cumulative = 0;
    return sorted.map((month, i) => {
      cumulative += nets[i];
      const point = totalCumulative !== 0
        ? netWorth - totalCumulative + cumulative
        : netWorth + (cumulative - (nets.reduce((s,v,j) => j <= i ? s+v : s, 0)));
      return { month: month.substring(5), 'Net Worth': Math.round(point) };
    });
  })();
  // Keep old aliases for backward compat with JSX below
  const netWorthTrend = netWorthChartData;
  const netWorthTrajectory = netWorthChartData;

  // Health score (use current month's category spend when available)
  const fallbackExpenses = {};
  (analytics?.categoryData || []).forEach(c => { fallbackExpenses[c.category] = c.total; });
  const expenses = analytics?.monthlyExpensesByCategory?.[currentMonth] || analytics?.currentMonthExpensesByCategory || fallbackExpenses;
  const health = computeHealthScore(savingsRate, budgets, expenses, monthlyIncome * 12, loans);

  // Liabilities chart
  loans.filter(l => l.status === 'Active' && l.principal_amount > 0).map(l => ({
  name: l.item_name || 'Loan',
  value: l.principal_amount + (l.unpaid_interest || 0)
}));

  // Smart Subscription pattern detector
  const unmanagedSubscriptions = useMemo(() => {
    return detectUnmanagedSubscriptions(transactions, bills, recurringRules);
  }, [transactions, bills, recurringRules]);

  // Recent transactions (last 5)
  const recentTxns = transactions.slice(0, 5);
  // Count consecutive days going back from today where spending < dailyTarget
  const spendingStreak = (() => {
    const dailyTarget = analytics?.avgMonthlySpend > 0
      ? analytics.avgMonthlySpend / 30
      : null;
    if (!dailyTarget || !analytics?.dailySpendArray?.length) {
      return { streak: 0, target: dailyTarget || 0 };
    }
    // Build a map of date -> amount
    const spendMap = {};
    analytics.dailySpendArray.forEach(({ date, amount }) => { spendMap[date] = amount; });
    // Walk back from yesterday (today's data may be incomplete)
    let streak = 0;
    const today = new Date();
    for (let i = 1; i <= 90; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = toYMD(d);
      const spent = spendMap[key] || 0;
      if (spent <= dailyTarget) {
        streak++;
      } else {
        break; // streak broken
      }
    }
    return { streak, target: dailyTarget };
  })();

  // Gamified FinTech Achievements
  const achievementData = useMemo(() => {
    const expMap = {};
    (analytics?.categoryData || []).forEach(c => { expMap[c.category] = c.total; });
    const dayOfMonth = new Date().getDate();
    const activeTxns = transactions.filter(t => t && !t.reversed_at && !t.reversal_of);
    const activeDaysSet = new Set(
      activeTxns
        .filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment') && t.date?.startsWith(currentMonth))
        .map(t => parseInt(t.date?.split('-')[2] || '0', 10))
    );
    let zeroSpendDays = 0;
    for (let d = 1; d <= dayOfMonth; d++) {
      if (!activeDaysSet.has(d)) zeroSpendDays++;
    }
    return evaluateAchievements({
      runwayMonths: analytics?.avgMonthlySpend > 0 ? Math.max(0, netWorth / analytics.avgMonthlySpend) : 0,
      budgets,
      expenses: expMap,
      zeroSpendDays,
      savingsRate,
      transactionCount: activeTxns.length,
      loans,
      goals,
      accounts
    });
  }, [analytics, budgets, transactions, currentMonth, netWorth, savingsRate, loans, goals, accounts]);

  let summaryCard = null;
  if (showSummary && transactions.length > 0) {
    const activeTxns = transactions.filter(tx => tx && !tx.reversed_at && !tx.reversal_of);
    const lastMonthTxns = activeTxns.filter(tx => tx.date?.startsWith(showSummary));
    const [sy, sm] = showSummary.split('-').map(Number);
    const prevMonthDate = new Date(sy, sm - 2, 1);
    const prevMonthKey = toYMD(prevMonthDate).substring(0, 7);
    const prevMonthTxns = activeTxns.filter(tx => tx.date?.startsWith(prevMonthKey));
    
    const lmIncome = lastMonthTxns.filter(t => !isInternalMove(t) && t.type === 'Income').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const lmExpense = lastMonthTxns.filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const lmNet = lmIncome - lmExpense;
    const lmSavingsRate = lmIncome > 0 ? Math.round((lmNet / lmIncome) * 100) : 0;
    
    const pmIncome = prevMonthTxns.filter(t => !isInternalMove(t) && t.type === 'Income').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const pmExpense = prevMonthTxns.filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).reduce((s,t) => s + (Number(t.amount) || 0), 0);
    
    
    const incChange = pmIncome > 0 ? ((lmIncome - pmIncome) / pmIncome) * 100 : 0;
    const expChange = pmExpense > 0 ? ((lmExpense - pmExpense) / pmExpense) * 100 : 0;
    
    // Top 3 expense categories (supports split transactions)
    const catMap = {};
    lastMonthTxns.filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).forEach(t => {
      const validSplits = t.isSplit !== false && Array.isArray(t.splits) ? t.splits.filter(sp => (Number(sp?.amount) || 0) > 0) : [];
      if (validSplits.length > 0) {
        validSplits.forEach(sp => {
          const cat = sp.category || t.category || 'Other';
          catMap[cat] = (catMap[cat] || 0) + (Number(sp.amount) || 0);
        });
      } else {
        const cat = t.category || 'Other';
        catMap[cat] = (catMap[cat] || 0) + (Number(t.amount) || 0);
      }
    });
    const topCats = Object.entries(catMap).sort((a,b) => b[1] - a[1]).slice(0, 3);
    
    const monthName = new Date(showSummary + '-01T00:00:00').toLocaleString('default', { month: 'long', year: 'numeric' });
    
    summaryCard = (
      <motion.div initial={{ opacity:0, y:-20 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-20 }} 
        style={{ background: 'rgba(251, 191, 36, 0.05)', border: '1px solid rgba(251, 191, 36, 0.4)', borderRadius: 16, padding: '1.5rem', marginBottom: '1.75rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, width: '4px', height: '100%', background: 'var(--warning)' }} />
        
        <button onClick={handleDismissSummary} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <X size={18} />
        </button>
        
        <h2 style={{ margin: '0 0 1rem', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
          <Activity size={20} /> {monthName} Summary
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Income</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(lmIncome)}</div>
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', color: incChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {incChange >= 0 ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} {Math.abs(incChange).toFixed(1)}% vs prev
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Expenses</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(lmExpense)}</div>
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', color: expChange <= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {expChange >= 0 ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} {Math.abs(expChange).toFixed(1)}% vs prev
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Net Savings</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: lmNet >= 0 ? 'var(--cyan)' : 'var(--danger)' }}>{formatCurrency(lmNet)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rate: {lmSavingsRate}%</div>
          </div>
        </div>
        
        {topCats.length > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Top Expenses</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {topCats.map(([cat, amount]) => (
                <div key={cat} style={{ fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{cat}:</span> <span style={{ color: 'var(--danger)' }}>{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <PageWrapper>
      <div className="dash" ref={dashRef}>
        {/* Header */}
        <header className="dash-header">
          <div>
            <h1 className="dash-title">{t('nav.dashboard')}</h1>
            <p className="dash-subtitle">{t('dash.subtitle', { time: now })}</p>
          </div>
          <div className="dash-actions">
            <div className="dash-seg" role="group" aria-label="Dashboard view">
              {[[t('dash.overview'), true], [t('dash.detailed'), false]].map(([label, minimal]) => (
                <button key={label} type="button" aria-pressed={isMinimalistView === minimal} onClick={() => toggleMinimalistView(minimal)}>
                  {isMinimalistView === minimal && <motion.span layoutId="dash-seg-pill" className="dash-seg-pill" transition={spring.liquid} />}
                  {label}
                </button>
              ))}
            </div>
            <ToolMenu label={t('dash.moreTools')}>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => setAchievementsOpen(true)}>
                <span className="dash-tool-icon" aria-hidden="true">🏆</span> Level {achievementData.currentRank.level} · {achievementData.totalXp} XP
              </button>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => window.dispatchEvent(new Event('vm:open-month-close'))}>
                <span className="dash-tool-icon" aria-hidden="true">📅</span> Close last month
              </button>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => setShowStoryModal(true)}>
                <span className="dash-tool-icon" aria-hidden="true">✨</span> Wrapped
              </button>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => window.dispatchEvent(new Event('vm:open-ai-copilot'))}>
                <span className="dash-tool-icon" aria-hidden="true">🧠</span> Assistant
              </button>
            </ToolMenu>
            <button type="button" className="btn btn-secondary dash-tool dash-refresh" onClick={loadData}>
              <Zap size={15} /> Refresh
            </button>
          </div>
        </header>

        {loading ? <SkeletonLoader rows={5} height={96} /> : (
          <>
            {/* Global System Announcement Banner (Admin Broadcast) */}
            {announcement && announcement.active !== false && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: announcement.level === 'critical' ? 'rgba(239, 68, 68, 0.15)' : announcement.level === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                  border: `1px solid ${announcement.level === 'critical' ? '#ef4444' : announcement.level === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                  borderRadius: 14,
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>
                  {announcement.level === 'critical' ? '🚨' : announcement.level === 'warning' ? '⚠️' : '📢'}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: announcement.level === 'critical' ? 'var(--mm-danger)' : announcement.level === 'warning' ? 'var(--mm-warning)' : '#38bdf8', letterSpacing: '0.5px' }}>
                    System Broadcast
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {announcement.message}
                  </div>
                </div>
              </motion.div>
            )}

            <DemoDataBanner accounts={accounts} transactions={transactions} />
            <GettingStarted accounts={accounts} transactions={transactions} budgets={budgets} />
            <MonthClosePrompt accounts={accounts} transactions={transactions} budgets={budgets} />

            {summaryCard}

            {/* Urgent Alert Banner (Overdue bills or exceeded budgets) */}
            {budgetAlerts.filter(a => a.type === 'danger').slice(0, 1).map(alert => (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(248,113,113,0.12)',
                  border: '1px solid rgba(248,113,113,0.3)',
                  borderRadius: 14,
                  padding: '0.75rem 1.25rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  backdropFilter: 'blur(10px)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>{alert.icon}</span>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--mm-danger)' }}>{alert.title}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{alert.body}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {missingRateCurrencies.length > 0 && (
              <div role="status" style={{ margin: '0 0 1rem', padding: '0.6rem 0.9rem', borderRadius: 10, border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Exchange rates are unavailable, so money in {missingRateCurrencies.join(', ')} is left out of your net worth and totals. Reconnect to include it.
              </div>
            )}

            {/* ── MINIMALIST FOCUS MODE (Default: Clean Hero, 3-Stat Pulse, Recent Activity, Collapsible Drawer) ── */}
            {isMinimalistView && <OverviewView monthlyExpense={monthlyExpense} monthlyIncome={monthlyIncome} navigate={navigate} netWorth={netWorth} netWorthTrend={netWorthTrend} recentTxns={recentTxns} recurringRules={recurringRules} safeToSpendData={safeToSpendData} savingsRate={savingsRate} setPopupTx={setPopupTx} setRecurringRules={setRecurringRules} setShowAdvancedInsights={setShowAdvancedInsights} setShowNWBreakdown={setShowNWBreakdown} setSummaryPopup={setSummaryPopup} showAdvancedInsights={showAdvancedInsights} t={t} totalAssets={totalAssets} totalLiabilities={totalLiabilities} />}

            {/* Deep Financial Intelligence (Detailed View OR Expanded Drawer) */}
            {(!isMinimalistView || showAdvancedInsights) && (
              <motion.div
                id="dashboard-insights"
                initial={isMinimalistView ? { opacity: 0, y: -8 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
            {/* Alerts that need attention */}
            {/* Unmanaged Subscriptions Smart Alert */}
            {unmanagedSubscriptions.length > 0 && !dismissedSubs && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'rgba(167, 139, 250, 0.12)',
                  border: '1px solid rgba(167, 139, 250, 0.35)',
                  borderRadius: 14,
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.25rem' }}>🤖</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#a78bfa' }}>
                      Smart Detector: {unmanagedSubscriptions.length} Unmanaged Recurring Subscription{unmanagedSubscriptions.length > 1 ? 's' : ''} Found
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                      {unmanagedSubscriptions.map(s => `${s.name} (${formatCurrency(s.amount)})`).join(' • ')}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => navigate('/bills')}
                    style={{ padding: '0.4rem 0.85rem', borderRadius: 8, background: '#a78bfa', color: '#0f172a', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
                  >
                    Manage in Bills ↗
                  </button>
                  <button
                    onClick={() => setDismissedSubs(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', padding: '0.3rem' }}
                  >
                    ✕
                  </button>
                </div>
              </motion.div>
            )}

            {/* Weekly Encrypted Backup Auto-Reminder Banner */}
            {backupStatus.isDue && (accounts.length > 0 || transactions.length > 0) && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.1), rgba(74, 222, 128, 0.08))',
                  border: '1px solid rgba(56, 189, 248, 0.32)',
                  borderRadius: 14,
                  padding: '0.85rem 1.25rem',
                  marginBottom: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>🔐</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#38bdf8' }}>
                      {backupStatus.daysSinceBackup === null
                        ? 'Weekly Vault Protection: Save Your First Local Backup'
                        : `Weekly Backup Due (${backupStatus.daysSinceBackup} days since last export)`}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                      Keep an offline AES-256 encrypted or JSON snapshot of your {transactions.length} transactions & {accounts.length} accounts.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.45rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const tid = toast.loading('Exporting local backup...');
                      try {
                        const res = await exportFullVaultBackup('');
                        setBackupStatus(getBackupHealthStatus());
                        haptic();
                        toast.success(`Backup saved (${res.filename})!`, { id: tid });
                      } catch {
                        toast.error('Backup export failed', { id: tid });
                      }
                    }}
                    style={{
                      padding: '0.42rem 0.85rem',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                      color: '#06121e',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    📥 1-Tap Backup
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    style={{
                      padding: '0.42rem 0.75rem',
                      borderRadius: 8,
                      background: 'rgba(56, 189, 248, 0.14)',
                      color: '#38bdf8',
                      border: '1px solid rgba(56, 189, 248, 0.35)',
                      fontWeight: 600,
                      fontSize: '0.74rem',
                      cursor: 'pointer',
                    }}
                  >
                    🔒 AES-256 Encrypt
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      snoozeBackupReminder(7);
                      setBackupStatus(getBackupHealthStatus());
                      toast('Backup reminder snoozed for 7 days', { icon: '⏳' });
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '0.72rem',
                      cursor: 'pointer',
                      padding: '0.3rem 0.45rem',
                    }}
                    title="Remind me next week"
                  >
                    Snooze 7d
                  </button>
                </div>
              </motion.div>
            )}

            {/* Loan alerts */}
            {loans.filter(l => l.status === 'Active' && (l.unpaid_interest || 0) > 0).length > 0 && (
              <div style={{ background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, padding:'1.25rem 1.5rem', marginBottom:'1.75rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:'var(--danger)', marginBottom:'0.75rem' }}>
                  <TrendingDown size={18} />
                  <h3 style={{ margin:0, letterSpacing:'1px', fontSize:'0.85rem' }}>UNPAID INTEREST DETECTED</h3>
                </div>
                {loans.filter(l => l.status === 'Active' && (l.unpaid_interest || 0) > 0).map(loan => (
                  <div key={loan.id} style={{ display:'flex', justifyContent:'space-between', padding:'0.6rem 0.75rem', background:'rgba(0,0,0,0.2)', borderRadius:8, marginBottom:4 }}>
                    <span>{loan.item_name || 'Loan'}</span>
                    <span style={{ color:'var(--danger)', fontWeight:'bold' }}>{formatCurrency(loan.unpaid_interest)}</span>
                  </div>
                ))}
              </div>
            )}

            <section className="dash-group">
            <h2 className="dash-section-title">{t('dash.thisMonth')}</h2>
            {/* Monthly Summary Strip */}
            <motion.div className="monthly-strip" initial={{ opacity:0, y:-10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.4 }} style={{ marginBottom:'0.75rem' }}>
              {[
                {
                  label: 'This Month Income',
                  val: formatCurrency(monthlyIncome),
                  color: 'var(--success)',
                  clickable: true,
                  onClick: () => { haptic(); setSummaryPopup({ type: 'Income', title: 'This Month Income' }); }
                },
                {
                  label: 'This Month Expenses',
                  val: formatCurrency(monthlyExpense),
                  color: 'var(--danger)',
                  clickable: true,
                  onClick: () => { haptic(); setSummaryPopup({ type: 'Expense', title: 'This Month Expenses & Deductions' }); }
                },
                { label: 'Savings Rate',        val: `${savingsRate}%`,    color: savingsRate >= 0 ? 'var(--cyan)' : 'var(--danger)' },
                (() => {
                  const today = new Date();
                  const dayOfMonth = today.getDate();
                  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
                  const dailyBurn = dayOfMonth > 0 ? monthlyExpense / dayOfMonth : 0;
                  const projectedMonthly = dailyBurn * daysInMonth;
                  return { label: 'Daily Burn Rate', val: formatCurrency(dailyBurn), color: projectedMonthly > monthlyIncome ? 'var(--danger)' : '#fbbf24', sub: `~${formatCurrency(projectedMonthly)} projected` };
                })(),
                (() => {
                  const today = new Date();
                  const dayOfMonth = today.getDate();
                  const dailyBurn = dayOfMonth > 0 ? monthlyExpense / dayOfMonth : 0;
                  const totalBalance = (analytics.accounts || []).filter(a => !isDebtAccount(a)).reduce((s, a) => s + Math.max(0, toBase(a.balance, a.currency)), 0);
                  if (dailyBurn <= 0 || totalBalance <= 0) return { label: 'Days Until Zero', val: '∞', color: '#4ade80', sub: 'balanced' };
                  const daysLeft = Math.floor(totalBalance / dailyBurn);
                  return {
                    label: 'Days Until Zero',
                    val: daysLeft > 365 ? '∞' : `${daysLeft}d`,
                    color: daysLeft < 30 ? 'var(--danger)' : daysLeft < 90 ? '#fbbf24' : '#4ade80',
                    sub: daysLeft > 365 ? 'very stable' : `of runway left`,
                  };
                })(),
              ].map(s => (
                <div
                  key={s.label}
                  className="monthly-strip-item"
                  onClick={s.onClick}
                  style={{ cursor: s.clickable ? 'pointer' : 'default', transition: 'all 0.15s' }}
                  title={s.clickable ? 'Click for simple summary popup' : undefined}
                >
                  <div className="monthly-strip-label">{s.label} {s.clickable ? '↗' : ''}</div>
                  <div className="monthly-strip-value" style={{ color: s.color }}>{s.val}</div>
                  {s.sub && <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', marginTop:'0.15rem' }}>{s.sub}</div>}
                </div>
              ))}
            </motion.div>

            {/* Month spend-progress bar */}
            {monthlyIncome > 0 && (() => {
              const spendPct = Math.min((monthlyExpense / monthlyIncome) * 100, 100);
              const today = new Date();
              const dayPct = (today.getDate() / new Date(today.getFullYear(), today.getMonth()+1, 0).getDate()) * 100;
              const isOver = spendPct >= 100;
              const barColor = isOver ? '#f87171' : spendPct > 80 ? '#fbbf24' : '#00f5ff';
              return (
                <div style={{ marginBottom:'1.5rem', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.4rem', fontSize:'0.72rem' }}>
                    <span style={{ color:'var(--text-muted)' }}>MONTH SPEND PROGRESS</span>
                    <span style={{ color:barColor, fontWeight:600 }}>{Math.round(spendPct)}% of income spent · Day {today.getDate()}/{new Date(today.getFullYear(),today.getMonth()+1,0).getDate()}</span>
                  </div>
                  <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden', position:'relative' }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${spendPct}%` }} transition={{ duration:1, ease:'easeOut' }}
                      style={{ height:'100%', background:isOver?'#f87171':spendPct>80?'#fbbf24':'linear-gradient(90deg,#00f5ff,#a855f7)', borderRadius:4, boxShadow:`0 0 8px ${barColor}60` }}/>
                    {/* Day marker */}
                    <div style={{ position:'absolute', top:0, left:`${dayPct}%`, width:2, height:'100%', background:'rgba(255,255,255,0.4)', borderRadius:1 }} title={`Today: Day ${today.getDate()}`}/>
                  </div>
                  {isOver && <div style={{ fontSize:'0.65rem', color:'var(--mm-danger)', marginTop:'0.3rem' }}>⚠ Spending exceeds this month's income</div>}
                </div>
              );
            })()}

            </section>

            <NetWorthSection COLORS={COLORS} CustomTooltip={CustomTooltip} accounts={accounts} assetData={assetData} health={health} incomeExpenseData={incomeExpenseData} loans={loans} netWorth={netWorth} netWorthTrajectory={netWorthTrajectory} netWorthTrend={netWorthTrend} recentTxns={recentTxns} setShowNWBreakdown={setShowNWBreakdown} spendingStreak={spendingStreak} totalAssets={totalAssets} totalLiabilities={totalLiabilities} />

            <section className="dash-group">
            <h2 className="dash-section-title">Spending</h2>
            {/* Safe-to-Spend Daily Allowance Hero Widget */}
            <SafeToSpendCard safeToSpendData={safeToSpendData} />

            <div className="bento dash-pair">
            {/* Top Spending Categories this month */}
            {analytics?.categoryData?.length > 0 && (
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.39 }}
                className="bento-card bento-item bento-6" style={{ flexDirection:'column', marginTop:'0.5rem' }}>
                <h3 style={{ fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:'0 0 0.875rem' }}>📊 TOP CATEGORIES THIS MONTH</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {[...analytics.categoryData].sort((a,b) => b.total - a.total).slice(0,5).map((cat, i) => {

                    const pct = Math.round((cat.total / Math.max(...analytics.categoryData.map(c => c.total))) * 100);
                    const colors = ['#f87171','#fb923c','#fbbf24','#4ade80','#818cf8'];
                    const col = colors[i] || '#aaa';
                    return (
                      <div key={cat.category} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <div style={{ fontSize:'0.75rem', width:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{cat.category}</div>
                        <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3, transition:'width 0.8s ease', boxShadow:`0 0 6px ${col}` }} />
                        </div>
                        <div style={{ fontSize:'0.72rem', color:col, minWidth:70, textAlign:'right' }}>{formatCurrency(cat.total)}</div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            </div>

            {/* Spending Calendar — current month daily heatmap */}
            {transactions.length > 0 && (() => {
              const now = new Date();
              const yr = now.getFullYear(), mo = now.getMonth();
              const daysInMonth = new Date(yr, mo + 1, 0).getDate();
              const firstDow = new Date(yr, mo, 1).getDay(); // 0=Sun
              // Build daily spend map for this month
              const monthStr = toYMD(now).substring(0, 7);
              const spendMap = {};
              transactions.filter(t => !isInternalMove(t) && t && !t.reversed_at && !t.reversal_of && t.date?.startsWith(monthStr) && (t.type === 'Expense' || t.type === 'Loan Payment'))
                .forEach(t => { spendMap[t.date] = (spendMap[t.date] || 0) + t.amount; });
              const maxSpend = Math.max(...Object.values(spendMap), 1);
              const DAYS = ['S','M','T','W','T','F','S'];
              const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
              const cells = [];
              for (let d = 0; d < firstDow; d++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              const today = now.getDate();
              return (
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.55 }}
                  style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem 1.5rem', marginTop:'0.75rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                    <h3 style={{ letterSpacing:'2px', fontSize:'0.7rem', margin:0, color:'var(--text-secondary)' }}>SPENDING CALENDAR — {MONTHS[mo].toUpperCase()} {yr}</h3>
                    <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>darker = more spent</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                    {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:'0.6rem', color:'var(--text-muted)', padding:'2px 0' }}>{d}</div>)}
                    {cells.map((day, i) => {
                      if (!day) return <div key={`e${i}`}/>;
                      const dateStr = `${yr}-${String(mo+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                      const amt = spendMap[dateStr] || 0;
                      const intensity = amt > 0 ? 0.15 + (amt / maxSpend) * 0.85 : 0;
                      const isToday = day === today;
                      const isFuture = day > today;
                      const cellColor = amt > 0 ? `rgba(248,113,113,${intensity.toFixed(2)})` : 'rgba(255,255,255,0.03)';
                      return (
                        <div key={day} title={amt > 0 ? `${dateStr}: ${formatCurrency(parseFloat(amt.toFixed(2)))}` : dateStr}
                          style={{ aspectRatio:'1', borderRadius:4, background: isFuture ? 'transparent' : cellColor, border: isToday ? '1px solid #fbbf24' : '1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', color: amt > 0 && intensity > 0.5 ? '#fff' : isToday ? 'var(--mm-warning)' : 'var(--mm-text-3)', transition:'transform 0.1s', cursor: amt > 0 ? 'default' : 'default' }}>
                          {day}
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}
            </section>

            <section className="dash-group">
            <h2 className="dash-section-title">Bills &amp; goals</h2>
            <div className="bento dash-pair">
            {/* Upcoming Bills */}
            {bills.length > 0 && (() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const upcoming = bills
                .filter(b => !b.paid)
                .map(b => {
                  const d = new Date(b.due_date + 'T00:00:00');
                  const days = Math.ceil((d - today) / (1000*60*60*24));
                  return { ...b, days };
                })
                .filter(b => b.days >= 0 && b.days <= 14)
                .sort((a, b) => a.days - b.days)
                .slice(0, 5);
              if (!upcoming.length) return null;
              return (
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.38 }}
                  className="bento-card bento-item bento-6" style={{ flexDirection:'column', marginTop:'0.5rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                    <h3 style={{ fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:0 }}>🔔 UPCOMING BILLS (14d)</h3>
                    <a href="/bills" style={{ fontSize:'0.68rem', color:'var(--cyan,#00f5ff)', textDecoration:'none' }}>VIEW ALL →</a>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                    {upcoming.map(bill => {
                      const col = bill.days <= 3 ? '#f87171' : bill.days <= 7 ? '#fbbf24' : '#4ade80';
                      return (
                        <div key={bill.id} style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 0.75rem', background:`${col}06`, border:`1px solid ${col}18`, borderLeft:`3px solid ${col}`, borderRadius:8 }}>
                          <div style={{ minWidth:36, textAlign:'center', fontSize:'0.65rem', color:col }}>
                            {bill.days === 0 ? 'TODAY' : `${bill.days}d`}
                          </div>
                          <div style={{ flex:1, fontSize:'0.82rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bill.name}</div>
                          <div style={{ fontWeight:700, color:col, fontSize:'0.82rem', flexShrink:0 }}>{formatCurrency(bill.amount)}</div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}

            </div>

            {/* Goals Progress */}
            {goals.filter(g => !g.is_achieved).length > 0 && (
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
                className="bento-card bento-item bento-12" style={{ flexDirection:'column', marginTop:'0.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                  <h3 style={{ fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:0 }}>🎯 GOALS PROGRESS</h3>
                  <a href="/goals" style={{ fontSize:'0.68rem', color:'var(--cyan,#00f5ff)', textDecoration:'none' }}>VIEW ALL →</a>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px, 1fr))', gap:'0.75rem' }}>
                  {goals.filter(g => !g.is_achieved).slice(0, 4).map(g => {
                    const pct = Math.min(100, Math.round(((g.current_amount || 0) / (g.target_amount || 1)) * 100));
                    const remaining = (g.target_amount || 0) - (g.current_amount || 0);
                    const isAtRisk = g.target_date && (() => {
                      const daysLeft = Math.ceil((new Date(g.target_date) - new Date()) / (1000*60*60*24));
                      const needed = remaining / (daysLeft / 30);
                      return daysLeft > 0 && needed > (monthlyIncome * 0.5);
                    })();
                    const col = pct >= 75 ? '#4ade80' : pct >= 40 ? '#fbbf24' : '#f87171';
                    const r = 22, circ = 2 * Math.PI * r;
                    return (
                      <div key={g.id} style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.025)', borderRadius:12, border:`1px solid ${col}18` }}>
                        {/* Mini ring */}
                        <svg width={52} height={52} style={{ flexShrink:0 }}>
                          <circle cx={26} cy={26} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4}/>
                          <circle cx={26} cy={26} r={r} fill="none" stroke={col} strokeWidth={4}
                            strokeDasharray={circ} strokeDashoffset={circ - (circ * pct / 100)}
                            strokeLinecap="round" transform="rotate(-90 26 26)" style={{ transition:'stroke-dashoffset 1s ease' }}/>
                          <text x={26} y={30} textAnchor="middle" fill={col} fontSize={11} fontFamily="Outfit, sans-serif" fontWeight={700}>{pct}%</text>
                        </svg>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontWeight:600, fontSize:'0.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.goal_name || g.name}</div>
                          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginTop:2 }}>
                            {formatCurrency(g.current_amount || 0)} / {formatCurrency(g.target_amount || 0)}
                          </div>
                          <div style={{ fontSize:'0.65rem', marginTop:3, color: isAtRisk ? 'var(--mm-danger)' : 'var(--mm-success)' }}>
                            {isAtRisk ? '⚠ At Risk' : '✓ On Track'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            </section>

            <SpendingLimitsSection capForm={capForm} dailyLimit={dailyLimit} editingCaps={editingCaps} loadData={loadData} safeToSpendData={safeToSpendData} setCapForm={setCapForm} setDailyLimit={setDailyLimit} setEditingCaps={setEditingCaps} setWeeklyLimit={setWeeklyLimit} transactions={transactions} weeklyLimit={weeklyLimit} />

            <MoreSection title="Smart insights" hint="Anomalies, runway & tips">
            {/* Smart Financial Intelligence & Anomaly Engine Widget */}
            <div style={{ marginBottom: '1.5rem' }}>
              <SmartDigestWidget
                safeToSpendData={safeToSpendData}
                anomalies={anomalies}
                insights={digestInsights}
                onOpenCalendar={() => setCalendarOpen(true)}
                onViewTransaction={(txId) => navigate(`/transactions?q=${encodeURIComponent(txId)}`)}
              />
            </div>

            {/* Emergency Runway & Financial Fortress Intelligence */}
            <EmergencyRunwayCard
              accounts={accounts}
              analytics={analytics || {}}
              onNavigateGoals={() => navigate('/goals')}
            />

            {/* AI Insight of the Day */}
            {analytics?.recommendations?.length > 0 && (() => {
              const rec = analytics.recommendations[0];
              const typeColors = { warning:'#fbbf24', danger:'#f87171', success:'#4ade80', info:'#00f5ff' };
              const col = typeColors[rec.type] || '#00f5ff';
              return (
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.41 }}
                  style={{ background:`${col}08`, border:`1px solid ${col}22`, borderLeft:`3px solid ${col}`, borderRadius:12, padding:'1rem 1.25rem', marginTop:'0.5rem', display:'flex', alignItems:'flex-start', gap:'0.875rem' }}>
                  <div style={{ fontSize:'1.25rem', flexShrink:0 }}>{rec.icon || '💡'}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'0.7rem', letterSpacing:'1.5px', color:col, marginBottom:'0.3rem', fontWeight:600 }}>INSIGHT</div>
                    <div style={{ fontSize:'0.82rem', fontWeight:600, marginBottom:'0.2rem' }}>{rec.title}</div>
                    <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', lineHeight:1.5 }}>{rec.body}</div>
                  </div>
                  <a href="/analytics" style={{ textDecoration:'none', color:col, fontSize:'0.65rem', letterSpacing:'1px', flexShrink:0, marginTop:2 }}>DETAILS →</a>
                </motion.div>
              );
            })()}

            </MoreSection>

            <MoreSection title="Exchange rates" hint="Live">
            {/* Live Exchange Rates */}
            {rates && (() => {
              const base = localStorage.getItem('vm_currency') || 'LKR';
              const pairs = ['USD','EUR','GBP','AED','SGD','INR','AUD'].filter(c => c !== base).slice(0, 6);
              const baseRate = rates._source ? rates[base] : NaN;
              return (
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.4 }}
                  style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem 1.5rem', marginTop:'0.5rem' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.875rem' }}>
                    <h3 style={{ letterSpacing:'2px', fontSize:'0.7rem', margin:0, color:'var(--text-secondary)' }}>REFERENCE RATES · {rates._date || 'Unavailable'}</h3>
                    <span style={{ fontSize:'0.65rem', color: 'var(--mm-text-3)' }}>1 {base} =</span>
                  </div>
                  <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap' }}>
                    {pairs.map(cur => {
                      const curRate = rates[cur];
                      const rate = baseRate / curRate;
                      return (
                        <div key={cur} style={{ flex:'1 1 90px', padding:'0.6rem 0.75rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.05)', textAlign:'center' }}>
                          <div style={{ fontSize:'0.62rem', letterSpacing:'1.5px', color:'var(--mm-text-3)', marginBottom:'0.25rem' }}>{cur}</div>
                          <div style={{ fontWeight:700, fontSize:'0.95rem', color:'#06b6d4' }}>
                            {!Number.isFinite(rate) ? 'Unavailable' : rate >= 100 ? rate.toFixed(0) : rate >= 1 ? rate.toFixed(2) : rate.toFixed(4)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              );
            })()}
            </MoreSection>

              </motion.div>
            )}
          </>
        )}
      </div>

      {/* ── Net Worth Breakdown Modal ── */}
      {showNWBreakdown && (
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(10px)', display:'flex', alignItems:'center', justifyContent:'center', padding:'1rem' }}
          onClick={() => setShowNWBreakdown(false)}>
          <motion.div initial={{ opacity:0, scale:0.95, y:20 }} animate={{ opacity:1, scale:1, y:0 }} transition={{ duration:0.22 }}
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-surface)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:20, padding:'1.5rem', width:'100%', maxWidth:480, maxHeight:'90dvh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
              <div>
                <h2 style={{ margin:0, fontSize:'1.1rem', fontWeight:700, color:'var(--text-primary)' }}>Net Worth Breakdown</h2>
                <p style={{ margin:'0.2rem 0 0', fontSize:'0.75rem', color:'var(--text-muted)' }}>Assets vs Liabilities</p>
              </div>
              <button onClick={() => setShowNWBreakdown(false)} style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, color:'#fff', cursor:'pointer', padding:'0.4rem 0.7rem', fontSize:'0.8rem' }}>✕</button>
            </div>

            {/* Summary row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.75rem', marginBottom:'1.5rem' }}>
              {[
                { label:'ASSETS', val: totalAssets, col:'#4ade80' },
                { label:'LIABILITIES', val: totalLiabilities, col:'#f87171' },
                { label:'NET WORTH', val: netWorth, col: netWorth >= 0 ? '#00f5ff' : '#f87171' },
              ].map(s => (
                <div key={s.label} style={{ background:'rgba(255,255,255,0.03)', border:`1px solid ${s.col}22`, borderRadius:12, padding:'0.875rem', textAlign:'center' }}>
                  <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', letterSpacing:'1.5px', marginBottom:'0.35rem' }}>{s.label}</div>
                  <div style={{ fontWeight:700, fontSize:'0.95rem', color:s.col }}>{formatCurrency(s.val)}</div>
                </div>
              ))}
            </div>

            {/* Assets list */}
            <div style={{ marginBottom:'1.25rem' }}>
              <div style={{ fontSize:'0.7rem', letterSpacing:'2px', color:'var(--mm-success)', marginBottom:'0.625rem' }}>ASSETS</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                {accounts.filter(a => !isDebtAccount(a)).map(a => {
                  const baseBal = toBase(a.balance, a.currency);
                  const pct = totalAssets > 0 ? Math.min(100, (baseBal / totalAssets) * 100) : 0;
                  return (
                    <div key={a.id}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem' }}>
                        <span>{a.name} <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>({a.type})</span></span>
                        <span style={{ color:'var(--mm-success)', fontWeight:600 }}>{formatCurrency(a.balance, { currency: a.currency || baseCurrency })}</span>
                      </div>
                      <div style={{ height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                        <div style={{ width:`${Math.max(0,pct)}%`, height:'100%', background:'#4ade80', borderRadius:2, transition:'width 0.8s ease' }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Liabilities list */}
            {loans.filter(l => (l.status || 'Active') === 'Active').length > 0 && (
              <div>
                <div style={{ fontSize:'0.7rem', letterSpacing:'2px', color:'var(--mm-danger)', marginBottom:'0.625rem' }}>LIABILITIES (LOANS)</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {loans.filter(l => (l.status || 'Active') === 'Active').map(l => {
                    const owed = toBase((Number(l.principal_amount) || 0) + (Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency);
                    const pct = totalLiabilities > 0 ? Math.min(100, (owed / totalLiabilities) * 100) : 0;
                    return (
                      <div key={l.id}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem' }}>
                          <span>{l.item_name || l.lender_name || l.name}</span>
                          <span style={{ color:'var(--mm-danger)', fontWeight:600 }}>{formatCurrency(owed)}</span>
                        </div>
                        <div style={{ height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:'#f87171', borderRadius:2, transition:'width 0.8s ease' }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ratio bar */}
            {(totalAssets + totalLiabilities) > 0 && (
              <div style={{ marginTop:'1.25rem' }}>
                <div style={{ fontSize:'0.7rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.5rem' }}>ASSET/LIABILITY RATIO</div>
                <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden', display:'flex' }}>
                  <div style={{ width:`${Math.round((totalAssets/(totalAssets+totalLiabilities))*100)}%`, background:'linear-gradient(90deg,#4ade80,#22d3ee)', borderRadius:'4px 0 0 4px', transition:'width 1s ease' }}/>
                  <div style={{ flex:1, background:'rgba(248,113,113,0.4)', borderRadius:'0 4px 4px 0' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.3rem', fontSize:'0.65rem', color:'var(--text-muted)' }}>
                  <span style={{ color:'var(--mm-success)' }}>Assets {Math.round((totalAssets/(totalAssets+totalLiabilities))*100)}%</span>
                  <span style={{ color:'var(--mm-danger)' }}>Liabilities {Math.round((totalLiabilities/(totalAssets+totalLiabilities))*100)}%</span>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* ── Simple Transaction / Income / Deduction Details Popup ── */}
      <TransactionPopup
        isOpen={!!popupTx}
        onClose={() => setPopupTx(null)}
        transaction={popupTx}
        accounts={accounts}
        onEdit={() => {
          navigate('/transactions');
        }}
        onDelete={(tx) => {
          setPopupTx(null);
          removeItemWithUndo({
            key: `txn:${tx.id}`,
            label: 'Transaction deleted',
            setItems: setTransactions,
            id: tx.id,
            commit: () => deleteTransaction(tx.id),
            onCommitted: () => loadData(true),
          });
        }}
      />

      {/* ── Simple Income / Deduction Summary Breakdown Popup ── */}
      {summaryPopup && (
        <SummaryBreakdownModal
          popup={summaryPopup}
          onClose={() => setSummaryPopup(null)}
          transactions={transactions}
          monthlyIncome={monthlyIncome}
          monthlyExpense={monthlyExpense}
          onOpenTx={setPopupTx}
        />
      )}

      {/* Interactive Financial Calendar */}
      <FinancialCalendar
        isOpen={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        transactions={transactions}
        bills={bills}
        loans={loans}
      />

      {/* Monthly Financial Story ("Money Wrapped") */}
      <MonthlyStoryModal
        isOpen={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        analyticsData={analytics}
        transactions={transactions}
      />

      {/* Gamified Financial Achievements & Badges */}
      <AchievementsModal
        isOpen={achievementsOpen}
        onClose={() => setAchievementsOpen(false)}
        achievementData={achievementData}
      />
    </PageWrapper>
  );
};

export default Dashboard;