import ToolMenu from '../components/ToolMenu';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useLiveData from '../utils/useLiveData';
import { fetchAnalytics, fetchGoals, fetchBudgets, fetchBills, fetchRecurringTransactions, updateRecurringTransaction, fetchExchangeRates, fetchCreditCards, recordNetWorthSnapshot, fetchNetWorthHistory, deleteTransaction, getCache, getCategorySpendFromMap } from '../utils/api';
import { todayYMD, toYMD } from '../utils/dates';
import { auth } from '../utils/firebase';
import { TrendingUp, TrendingDown, Landmark, Activity, Zap, X, ChevronUp, ChevronDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import MoreSection from '../components/MoreSection';
import Modal from '../components/Modal';
import TransactionPopup from '../components/TransactionPopup';
import SmartDigestWidget from '../components/SmartDigestWidget';
import FinancialCalendar from '../components/FinancialCalendar';
import { calculateSafeToSpend, detectAnomalies, generateFinancialDigest } from '../utils/financialIntelligence';
import AnimatedCounter from '../components/AnimatedCounter';
import SkeletonLoader from '../components/SkeletonLoader';
import HealthScoreGauge from '../components/HealthScoreGauge';
import EmergencyRunwayCard from '../components/EmergencyRunwayCard';
import SafeToSpendCard from '../components/SafeToSpendCard';
import MonthlyStoryModal from '../components/MonthlyStoryModal';
import AchievementsModal from '../components/AchievementsModal';
import { evaluateAchievements } from '../utils/achievements';
import { detectUnmanagedSubscriptions } from '../utils/subscriptionDetector';
import TiltWrapper from '../components/TiltWrapper';
import ParticleBackground from '../components/ParticleBackground';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';
import { spring } from '../motion/presets';
import useTilt3D from '../motion/useTilt3D';
import './dashboard.css';
import { formatCurrency, getCurrencyLabel, getCurrency, convertCurrency, haptic } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import toast from 'react-hot-toast';
import { getSystemAnnouncement } from '../utils/adminService';
import { getBackupHealthStatus, exportFullVaultBackup, snoozeBackupReminder } from '../utils/backupCrypto';

const COLORS = ['#4ade80','#a78bfa','#818cf8','#fb923c','#fbbf24'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div style={{ background:'var(--hud-bg, rgba(6,8,20,0.97))', border:'1px solid rgba(74,222,128,0.25)', padding:'0.75rem 1rem', borderRadius:10, fontFamily:'Inter, sans-serif', fontSize:'0.78rem' }}>
      {label && <p style={{ color:'#4ade80', margin:'0 0 0.4rem', fontWeight:700 }}>{label}</p>}
      {payload.map((e,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:'1rem', color:e.color||'#aaa' }}>
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
        .filter(t => t.type === 'Expense' && t.date === todayKey)
        .reduce((s, t) => s + (Number(t.amount) || 0), 0);
      const weekSpendVal = allTxns
        .filter(t => t.type === 'Expense' && t.date >= sevenDaysKey && t.date <= todayKey)
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
      const snapToBase = (amt, cur) => {
        const v = Number(amt) || 0;
        const c = cur || baseCur;
        if (c === baseCur) return v;
        const cv = convertCurrency(v, c, baseCur, currentRates);
        return Number.isFinite(cv) ? cv : v;
      };
      const assets = (anl.accounts || []).filter(a => !isDebtAcc(a)).reduce((s, a) => s + snapToBase(a.balance, a.currency), 0);
      const loanDebt = (anl.loans || []).filter(l => l.status === 'Active')
        .reduce((s, l) => s + snapToBase((Number(l.principal_amount) || 0) + (Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency), 0);
      const cardAccDebt = (anl.accounts || []).filter(isDebtAcc).reduce((s, a) => s + Math.abs(snapToBase(a.balance, a.currency)), 0);
      const dedicatedCardDebt = (cds || []).reduce((s, c) => s + Math.max(0, snapToBase(c.balance ?? c.current_balance, c.currency)), 0);
      const liabilities = loanDebt + cardAccDebt + dedicatedCardDebt;
      recordNetWorthSnapshot(assets - liabilities, assets, liabilities).catch(() => {});

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
    return Number.isFinite(cv) ? cv : v;
  }, [baseCurrency, rates]);

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
  const monthlyIncome  = transactions.filter(tx => !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee && tx.type === 'Income' && tx.date?.startsWith(currentMonth)).reduce((s, tx) => s + txToBase(tx), 0);
  const monthlyExpense = transactions.filter(tx => !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee && (tx.type === 'Expense' || tx.type === 'Loan Payment') && tx.date?.startsWith(currentMonth)).reduce((s, tx) => s + txToBase(tx), 0);
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
    const activeTxns = transactions.filter(t => t && !t.reversed_at && !t.reversal_of && !t.is_transfer_fee);
    const activeDaysSet = new Set(
      activeTxns
        .filter(t => (t.type === 'Expense' || t.type === 'Loan Payment') && t.date?.startsWith(currentMonth))
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
    const activeTxns = transactions.filter(tx => tx && !tx.reversed_at && !tx.reversal_of && !tx.is_transfer_fee);
    const lastMonthTxns = activeTxns.filter(tx => tx.date?.startsWith(showSummary));
    const [sy, sm] = showSummary.split('-').map(Number);
    const prevMonthDate = new Date(sy, sm - 2, 1);
    const prevMonthKey = toYMD(prevMonthDate).substring(0, 7);
    const prevMonthTxns = activeTxns.filter(tx => tx.date?.startsWith(prevMonthKey));
    
    const lmIncome = lastMonthTxns.filter(t => t.type === 'Income').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const lmExpense = lastMonthTxns.filter(t => t.type === 'Expense' || t.type === 'Loan Payment').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const lmNet = lmIncome - lmExpense;
    const lmSavingsRate = lmIncome > 0 ? Math.round((lmNet / lmIncome) * 100) : 0;
    
    const pmIncome = prevMonthTxns.filter(t => t.type === 'Income').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    const pmExpense = prevMonthTxns.filter(t => t.type === 'Expense' || t.type === 'Loan Payment').reduce((s,t) => s + (Number(t.amount) || 0), 0);
    
    
    const incChange = pmIncome > 0 ? ((lmIncome - pmIncome) / pmIncome) * 100 : 0;
    const expChange = pmExpense > 0 ? ((lmExpense - pmExpense) / pmExpense) * 100 : 0;
    
    // Top 3 expense categories (supports split transactions)
    const catMap = {};
    lastMonthTxns.filter(t => t.type === 'Expense' || t.type === 'Loan Payment').forEach(t => {
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
        
        <h2 style={{ margin: '0 0 1rem', fontFamily: 'Inter, sans-serif', color: 'var(--warning)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
          <Activity size={20} /> {monthName} Summary
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>Income</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(lmIncome)}</div>
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', color: incChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {incChange >= 0 ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} {Math.abs(incChange).toFixed(1)}% vs prev
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>Expenses</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(lmExpense)}</div>
            <div style={{ fontSize: '0.7rem', display: 'flex', alignItems: 'center', color: expChange <= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {expChange >= 0 ? <ChevronUp size={12}/> : <ChevronDown size={12}/>} {Math.abs(expChange).toFixed(1)}% vs prev
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>Net Savings</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: lmNet >= 0 ? 'var(--cyan)' : 'var(--danger)' }}>{formatCurrency(lmNet)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Rate: {lmSavingsRate}%</div>
          </div>
        </div>
        
        {topCats.length > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem 1rem', borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', marginBottom: '0.5rem' }}>Top Expenses</div>
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
            <h1 className="dash-title">Dashboard</h1>
            <p className="dash-subtitle">Your financial overview · Updated {now}</p>
          </div>
          <div className="dash-actions">
            <div className="dash-seg" role="group" aria-label="Dashboard view">
              {[['Overview', true], ['Detailed', false]].map(([label, minimal]) => (
                <button key={label} type="button" aria-pressed={isMinimalistView === minimal} onClick={() => toggleMinimalistView(minimal)}>
                  {isMinimalistView === minimal && <motion.span layoutId="dash-seg-pill" className="dash-seg-pill" transition={spring.snappy} />}
                  {label}
                </button>
              ))}
            </div>
            <ToolMenu>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => setAchievementsOpen(true)}>
                <span className="dash-tool-icon" aria-hidden="true">🏆</span> Level {achievementData.currentRank.level} · {achievementData.totalXp} XP
              </button>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => setShowStoryModal(true)}>
                <span className="dash-tool-icon" aria-hidden="true">✨</span> Wrapped
              </button>
              <button type="button" className="btn header-secondary-tool dash-tool" onClick={() => window.dispatchEvent(new Event('vm:open-ai-copilot'))}>
                <span className="dash-tool-icon" aria-hidden="true">🧠</span> Co-Pilot
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
                  <div style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', color: announcement.level === 'critical' ? '#f87171' : announcement.level === 'warning' ? '#fbbf24' : '#38bdf8', letterSpacing: '0.5px' }}>
                    System Broadcast
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {announcement.message}
                  </div>
                </div>
              </motion.div>
            )}

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
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f87171' }}>{alert.title}</span>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>{alert.body}</span>
                  </div>
                </div>
              </motion.div>
            ))}

            {/* ── MINIMALIST FOCUS MODE (Default: Clean Hero, 3-Stat Pulse, Recent Activity, Collapsible Drawer) ── */}
            {isMinimalistView && (
              <>
                {/* 1. Hero: 3D net worth card + today's safe-to-spend */}
                <section className="dash-hero" aria-label="Net worth and daily allowance">
                  <div
                    className="dash-3d dash-nw"
                    data-tilt
                    role="button"
                    tabIndex={0}
                    aria-label="Open net worth breakdown"
                    onClick={() => { haptic(); setShowNWBreakdown(true); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowNWBreakdown(true); } }}
                  >
                    <div className="dash-3d-bg" aria-hidden="true">
                      <div className="dash-nw-grid" />
                      <div className="dash-nw-orb" />
                      <div className="dash-nw-orb is-alt" />
                    </div>
                    <div className="dash-card-head z1">
                      <span className="dash-eyebrow">Total net worth</span>
                      <span className="dash-icon-chip"><Landmark size={18} /></span>
                    </div>
                    <div className="dash-nw-value dash-num z3">
                      <AnimatedCounter value={netWorth} formatter={formatCurrency} />
                    </div>
                    <div className="dash-nw-split z2">
                      <div className="dash-ratio" aria-hidden="true">
                        <span style={{ flex: Math.max(totalAssets, 0) || 1, background: 'var(--dash-pos)' }} />
                        {totalLiabilities > 0 && <span style={{ flex: totalLiabilities, background: 'var(--dash-neg)', animationDelay: '0.4s' }} />}
                      </div>
                      <div className="dash-nw-legend">
                        <span><i className="dash-pos" />Assets <b className="dash-pos">{formatCurrency(totalAssets)}</b></span>
                        <span><i className="dash-neg" />Debt <b className="dash-neg">{formatCurrency(totalLiabilities)}</b></span>
                      </div>
                    </div>
                    {netWorthTrend.length > 1 && (
                      <div className="dash-nw-spark z1" aria-hidden="true">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={netWorthTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                            <defs><linearGradient id="dashNwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--dash-accent)" stopOpacity={0.35}/><stop offset="100%" stopColor="var(--dash-accent)" stopOpacity={0}/></linearGradient></defs>
                            <Area type="monotone" dataKey="Net Worth" stroke="var(--dash-accent)" strokeWidth={2} fill="url(#dashNwGrad)" dot={false} isAnimationActive />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <span className="dash-hint z1">View breakdown <ArrowRight size={13} /></span>
                  </div>

                  {(() => {
                    const allowance = safeToSpendData?.dailyAllowance || 0;
                    const daysLeft = safeToSpendData?.daysRemainingInMonth || 0;
                    const today = new Date();
                    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                    const R = 34, C = 2 * Math.PI * R;
                    const frac = Math.min(1, Math.max(0, daysLeft / daysInMonth));
                    const ok = allowance > 0;
                    return (
                      <div className="dash-3d dash-safe" data-tilt>
                        <div className="dash-3d-bg" aria-hidden="true" />
                        <div className="dash-card-head z1">
                          <span className="dash-eyebrow">Today&apos;s safe to spend</span>
                          <span className="dash-pill" style={{ '--tone': ok ? 'var(--dash-pos)' : 'var(--dash-neg)' }}>{ok ? '✓ On track' : '⚠ Caution'}</span>
                        </div>
                        <div className="z3">
                          <div className={`dash-safe-value dash-num${ok ? '' : ' is-neg'}`}>
                            <AnimatedCounter value={allowance} formatter={formatCurrency} />
                          </div>
                          <div className="dash-safe-meta">
                            Free cash this month <b>{formatCurrency(safeToSpendData?.safeToSpend || 0)}</b>
                          </div>
                        </div>
                        <div className="dash-safe-ring z2" aria-label={`${daysLeft} of ${daysInMonth} days left this month`}>
                          <svg width="88" height="88" viewBox="0 0 88 88">
                            <circle className="track" cx="44" cy="44" r={R} fill="none" strokeWidth="7" />
                            <circle className="fill" cx="44" cy="44" r={R} fill="none" strokeWidth="7"
                              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 44 44)" />
                            <text x="44" y="46" textAnchor="middle">{daysLeft}</text>
                            <text className="sub" x="44" y="58" textAnchor="middle">DAYS LEFT</text>
                          </svg>
                        </div>
                        <button type="button" onClick={() => navigate('/transactions')} className="btn btn-primary z1" style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}>
                          + Add transaction
                        </button>
                      </div>
                    );
                  })()}
                </section>

                {/* 2. Monthly cash flow KPIs */}
                <section className="dash-kpis" aria-label="This month">
                  {[
                    { key: 'in', label: 'Income this month', value: `+${formatCurrency(monthlyIncome)}`, tone: 'var(--dash-pos)', Icon: TrendingUp, onClick: () => setSummaryPopup({ type: 'Income', title: 'This Month Income' }) },
                    { key: 'out', label: 'Expenses this month', value: `-${formatCurrency(monthlyExpense)}`, tone: 'var(--dash-neg)', Icon: TrendingDown, onClick: () => setSummaryPopup({ type: 'Expense', title: 'This Month Expenses' }) },
                    { key: 'net', label: `Net saved · ${savingsRate}%`, value: `${(monthlyIncome - monthlyExpense) >= 0 ? '+' : ''}${formatCurrency(monthlyIncome - monthlyExpense)}`, tone: (monthlyIncome - monthlyExpense) >= 0 ? 'var(--dash-accent)' : 'var(--dash-neg)', Icon: Activity },
                  ].map(({ key, label, value, tone, Icon, onClick }) => {
                    const Tag = onClick ? 'button' : 'div';
                    return (
                      <Tag key={key} {...(onClick ? { type: 'button', onClick: () => { haptic(); onClick(); } } : {})} className="dash-3d dash-kpi" data-tilt style={{ '--tone': tone }}>
                        <span className="dash-3d-bg" aria-hidden="true" />
                        <span className="dash-icon-chip z2"><Icon size={19} /></span>
                        <span className="dash-kpi-body z1">
                          <span className="dash-eyebrow">{label}</span>
                          <span className="dash-kpi-value dash-num" style={{ display: 'block' }}>{value}</span>
                        </span>
                        {onClick && <ArrowUpRight size={16} className="dash-kpi-arrow z1" aria-hidden="true" />}
                      </Tag>
                    );
                  })}
                </section>

                {/* 2.5 Monthly Reminders Settlement Checklist (Paid vs. Due At-a-Glance) */}
                {(() => {
                  const curMonth = todayYMD().slice(0, 7);
                  const activeRec = (recurringRules || []).filter(r => !r.paused);
                  if (activeRec.length === 0) return null;
                  const paidRec = activeRec.filter(r => r.last_applied_month === curMonth);
                  const unpaidRec = activeRec
                    .filter(r => r.last_applied_month !== curMonth)
                    .sort((a, b) => (parseInt(a.day_of_month, 10) || 99) - (parseInt(b.day_of_month, 10) || 99));
                  const pct = Math.round((paidRec.length / activeRec.length) * 100);
                  const todayDom = new Date().getDate();
                  return (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        background: 'rgba(255,255,255,0.02)',
                        border: `1px solid ${unpaidRec.length > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.28)'}`,
                        borderRadius: 16,
                        padding: '1.1rem 1.35rem',
                        marginBottom: '1.25rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{ fontFamily: 'Inter, sans-serif', letterSpacing: '1.2px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            MONTHLY REMINDERS STATUS
                          </span>
                          <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: 999,
                            background: 'rgba(16, 185, 129, 0.14)',
                            color: '#34d399',
                          }}>
                            ✅ {paidRec.length}/{activeRec.length} Paid ({pct}%)
                          </span>
                          {unpaidRec.length > 0 && (
                            <span style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'rgba(245, 158, 11, 0.16)',
                              color: '#fbbf24',
                            }}>
                              ⏳ {unpaidRec.length} Still Due
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate('/recurring')}
                          style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontFamily: 'Inter, sans-serif', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 600 }}
                        >
                          OPEN REMINDERS →
                        </button>
                      </div>

                      <div style={{ height: 6, borderRadius: 999, background: 'rgba(245, 158, 11, 0.18)', overflow: 'hidden', marginBottom: unpaidRec.length > 0 ? '0.75rem' : 0 }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: 999, transition: 'width 0.4s ease' }} />
                      </div>

                      {unpaidRec.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                          {unpaidRec.slice(0, 3).map(r => {
                            const dom = parseInt(r.day_of_month, 10);
                            const isFixed = (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) !== 'flexible' && dom > 0;
                            const isOverdue = isFixed && dom < todayDom;
                            const amt = parseFloat(r.amount) || parseFloat(r.avg_amount) || 0;
                            return (
                              <div
                                key={r.id}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '0.6rem',
                                  padding: '0.5rem 0.75rem',
                                  borderRadius: 10,
                                  background: isOverdue ? 'rgba(239, 68, 68, 0.07)' : 'rgba(255,255,255,0.025)',
                                  border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                                  <span>{getCategoryEmoji(r.category)}</span>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {r.name || r.category}
                                  </span>
                                  <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 700,
                                    padding: '1px 7px',
                                    borderRadius: 999,
                                    background: isOverdue ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.14)',
                                    color: isOverdue ? '#f87171' : '#fbbf24',
                                  }}>
                                    {isOverdue ? `🚨 Overdue (Day ${dom})` : isFixed ? `⏳ Due Day ${dom}` : `⏳ Due (${r.flexible_window || 'Anytime'})`}
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatCurrency(amt)}
                                  </span>
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={async () => {
                                      try {
                                        await updateRecurringTransaction(r.id, { last_applied_month: curMonth, last_paid_marked_only: true });
                                        setRecurringRules(prev => prev.map(x => x.id === r.id ? { ...x, last_applied_month: curMonth, last_paid_marked_only: true } : x));
                                        toast.success(`${r.name || r.category} marked as Paid this month`);
                                      } catch {
                                        toast.error('Failed to update status');
                                      }
                                    }}
                                    style={{ padding: '0.24rem 0.55rem', fontSize: '0.68rem', color: '#34d399', borderColor: 'rgba(16, 185, 129, 0.35)' }}
                                  >
                                    ✓ Mark Paid
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </motion.div>
                  );
                })()}

                {/* 3. Recent activity (top 5) */}
                <section className="dash-3d dash-panel" aria-label="Recent activity">
                  <div className="dash-panel-head">
                    <h3>Recent activity</h3>
                    <button type="button" className="dash-link" onClick={() => navigate('/transactions')}>
                      View all <ArrowRight size={13} />
                    </button>
                  </div>
                  {recentTxns.length === 0 ? (
                    <div className="dash-empty">
                      <span className="dash-icon-chip"><Activity size={18} /></span>
                      No transactions yet — add one to see it here.
                    </div>
                  ) : (
                    <ul className="dash-tx-list">
                      {recentTxns.slice(0, 5).map((tx, i) => {
                        const isIncome = tx.type === 'Income';
                        const isTransfer = tx.type === 'Transfer';
                        const amtSign = isIncome ? '+' : isTransfer ? '↔ ' : '-';
                        return (
                          <li key={tx.id}>
                            <button type="button" className="dash-tx" style={{ '--i': i }} onClick={() => { haptic(); setPopupTx(tx); }}>
                              <span className="dash-tx-icon" aria-hidden="true">{getCategoryEmoji(tx.category) || (isIncome ? '💰' : isTransfer ? '🔄' : '💸')}</span>
                              <span className="dash-tx-main">
                                <span className="dash-tx-title" style={{ display: 'block' }}>{tx.category || tx.type}</span>
                                <span className="dash-tx-sub" style={{ display: 'block' }}>{tx.date}{tx.notes ? ` · ${tx.notes}` : ''}</span>
                              </span>
                              <span className={`dash-tx-amt ${isIncome ? 'dash-pos' : isTransfer ? 'is-transfer' : 'dash-neg'}`}>
                                {amtSign}{formatCurrency(tx.amount)}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* 4. Expand deeper insights */}
                <button
                  type="button"
                  className="dash-3d dash-more"
                  aria-expanded={showAdvancedInsights}
                  aria-controls="dashboard-insights"
                  onClick={() => { haptic(); setShowAdvancedInsights(prev => !prev); }}
                >
                  <span className="dash-more-label">
                    <span className="dash-icon-chip" aria-hidden="true"><Zap size={17} /></span>
                    More insights &amp; planning
                  </span>
                  <ChevronDown size={18} className="dash-more-chev" aria-hidden="true" />
                </button>
              </>
            )}

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
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: '#38bdf8', fontFamily: 'Inter, sans-serif' }}>
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
                      fontFamily: 'Inter, sans-serif',
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
                      fontFamily: 'Inter, sans-serif',
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
                      fontFamily: 'Inter, sans-serif',
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
                  <h3 style={{ margin:0, fontFamily:'Inter, sans-serif', letterSpacing:'1px', fontSize:'0.85rem' }}>UNPAID INTEREST DETECTED</h3>
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
            <h2 className="dash-section-title">This month</h2>
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
                  {s.sub && <div style={{ fontSize:'0.6rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:'0.15rem' }}>{s.sub}</div>}
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
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.4rem', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                    <span style={{ color:'var(--text-muted)' }}>MONTH SPEND PROGRESS</span>
                    <span style={{ color:barColor, fontWeight:600 }}>{Math.round(spendPct)}% of income spent · Day {today.getDate()}/{new Date(today.getFullYear(),today.getMonth()+1,0).getDate()}</span>
                  </div>
                  <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden', position:'relative' }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${spendPct}%` }} transition={{ duration:1, ease:'easeOut' }}
                      style={{ height:'100%', background:isOver?'#f87171':spendPct>80?'#fbbf24':'linear-gradient(90deg,#00f5ff,#a855f7)', borderRadius:4, boxShadow:`0 0 8px ${barColor}60` }}/>
                    {/* Day marker */}
                    <div style={{ position:'absolute', top:0, left:`${dayPct}%`, width:2, height:'100%', background:'rgba(255,255,255,0.4)', borderRadius:1 }} title={`Today: Day ${today.getDate()}`}/>
                  </div>
                  {isOver && <div style={{ fontSize:'0.65rem', color:'#f87171', fontFamily:'Inter, sans-serif', marginTop:'0.3rem' }}>⚠ Spending exceeds this month's income</div>}
                </div>
              );
            })()}

            </section>

            <section className="dash-group">
            <h2 className="dash-section-title">Net worth</h2>
            {/* Main bento grid */}
            <div className="bento bento-grid" style={{ marginBottom:'1.75rem' }}>
              {/* Net Worth — Hero 3D card */}
              <TiltWrapper className="bento-4">
              <motion.div className="bento-card bento-item holographic-card neon-border dash-3d" data-tilt
                onClick={() => setShowNWBreakdown(true)}
                style={{ position:'relative', overflow:'hidden', cursor:'pointer', width:'100%', height:'100%' }}
                initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.05 }}>
                <ParticleBackground count={20} color="#4ade80" opacity={0.5} />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 className="text-cyan" style={{ fontFamily:'Inter, sans-serif', letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>NET WORTH</h3>
                  <Landmark size={18} className="text-cyan" />
                </div>
                <div className="dash-num dash-kpi-figure" style={{ marginBottom:'0.5rem' }}>
                  <AnimatedCounter value={netWorth} formatter={formatCurrency} />
                </div>
                <div style={{ flex:1, minHeight:60 }}>
                  {netWorthTrend.length > 1 ? (
                    <ResponsiveContainer width="100%" height={60}>
                      <AreaChart data={netWorthTrend}>
                        <defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.5}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient></defs>
                        <Area type="monotone" dataKey="Net Worth" stroke="#4ade80" strokeWidth={2} fill="url(#nwGrad)" dot={false}/>
                        <Tooltip content={<CustomTooltip/>}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <div style={{ height:60, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.75rem', fontFamily:'Inter, sans-serif' }}>ADD TRANSACTIONS</div>}
                </div>
                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:'0.5rem', textAlign:'right', letterSpacing:'0.5px' }}>TAP FOR BREAKDOWN ↗</div>
              </motion.div>
              </TiltWrapper>

              {/* Total Assets */}
              <motion.div className="bento-card bento-item bento-4 holographic-card dash-3d" data-tilt initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 className="text-success" style={{ fontFamily:'Inter, sans-serif', letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>TOTAL ASSETS</h3>
                  <TrendingUp size={18} className="text-success" />
                </div>
                <div className="hero-metric dash-num dash-kpi-figure" style={{ marginBottom:'1rem' }}>
                  <AnimatedCounter value={totalAssets} formatter={formatCurrency} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                  {accounts.slice(0, 3).map(a => (
                    <div key={a.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', fontFamily:'Inter, sans-serif', color:'var(--text-secondary)' }}>
                      <span>{a.name}</span><span style={{ color:'#4ade80' }}>{formatCurrency(a.balance)}</span>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* Liabilities */}
              <motion.div className="bento-card bento-item bento-4 holographic-card dash-3d" data-tilt initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.15 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                  <h3 className="text-danger" style={{ fontFamily:'Inter, sans-serif', letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>LIABILITIES</h3>
                  <TrendingDown size={18} className="text-danger" />
                </div>
                <div className="dash-num dash-neg dash-kpi-figure" style={{ marginBottom:'1rem' }}>
                  <AnimatedCounter value={totalLiabilities} formatter={formatCurrency} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                  {loans.filter(l => l.status === 'Active').slice(0, 3).map(l => (
                    <div key={l.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', fontFamily:'Inter, sans-serif', color:'var(--text-secondary)' }}>
                      <span>{l.item_name || 'Loan'}</span><span style={{ color:'#f87171' }}>{formatCurrency(l.principal_amount)}</span>
                    </div>
                  ))}
                  {loans.filter(l => l.status === 'Active').length === 0 && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>NO ACTIVE LOANS</div>}
                </div>
              </motion.div>

              {/* Health Score */}
              <motion.div className="bento-card bento-item bento-4" style={{ alignItems:'center' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}>
                <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem', width:'100%', textAlign:'center' }}>FINANCIAL HEALTH</h3>
                <HealthScoreGauge score={health.score} breakdown={health.breakdown} />
              </motion.div>

              {/* Asset Allocation Pie */}
              <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}>
                <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>ASSET ALLOCATION</h3>
                {assetData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart><Pie data={assetData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} stroke="none">
                      {assetData.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter:`drop-shadow(0 0 4px ${COLORS[i%COLORS.length]})` }}/>)}
                    </Pie><Tooltip content={<CustomTooltip/>}/></PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.75rem' }}>ADD ACCOUNTS</div>}
              </motion.div>

              {/* Monthly trend bar */}
              <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}>
                <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>MONTHLY TREND</h3>
                {incomeExpenseData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={incomeExpenseData.slice(-4)}>
                      <XAxis dataKey="name" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false}/>
                      <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)' }}/>
                      <Bar dataKey="Income" fill="#4ade80" radius={[3,3,0,0]}/>
                      <Bar dataKey="Expense" fill="#f87171" radius={[3,3,0,0]}/>
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.75rem' }}>NO DATA</div>}
              </motion.div>

              {/* Recent Transactions */}
              <motion.div className="bento-card bento-item bento-12" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.28 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
                  <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:0 }}>RECENT ACTIVITY</h3>
                  <a href="/transactions" style={{ fontSize:'0.75rem', color:'#4ade80', fontFamily:'Inter, sans-serif', textDecoration:'none' }}>VIEW ALL →</a>
                </div>
                {recentTxns.length === 0 ? (
                  <p style={{ color:'var(--text-muted)', fontFamily:'Inter, sans-serif', textAlign:'center', padding:'1.5rem', fontSize:'0.8rem' }}>NO TRANSACTIONS YET</p>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                    {recentTxns.map(tx => {
                      const typeColor = tx.type === 'Income' ? '#4ade80' : tx.type === 'Transfer' ? '#8b5cf6' : '#f87171';
                      return (
                        <div key={tx.id} style={{ display:'flex', alignItems:'center', padding:'0.7rem 1rem', background:'rgba(255,255,255,0.02)', borderRadius:8, gap:'0.75rem', border:'1px solid rgba(255,255,255,0.04)' }}>
                          <div style={{ width:3, height:36, borderRadius:2, background:typeColor, flexShrink:0 }}/>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600, fontSize:'0.875rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.category || tx.type}</div>
                            <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>{tx.date}</div>
                          </div>
                          <div style={{ color:typeColor, fontWeight:700, fontFamily:'Inter, sans-serif', fontSize:'0.875rem', flexShrink:0 }}>
                            {tx.type === 'Expense' || tx.type === 'Loan Payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </motion.div>

              {/* ── Feature 1: Net Worth Trajectory ───────────────────────── */}
              <motion.div className="bento-card bento-item bento-8" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.32 }}>
                <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>NET WORTH TRAJECTORY</h3>
                {netWorthTrajectory.length > 1 ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={netWorthTrajectory} margin={{ top:4, right:8, left:0, bottom:0 }}>
                      <defs>
                        <linearGradient id="nwtGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.35}/>
                          <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:9 }} axisLine={false} tickLine={false}/>
                      <YAxis hide domain={['auto','auto']}/>
                      <Tooltip content={<CustomTooltip/>}/>
                      <Area type="monotone" dataKey="Net Worth" stroke="#4ade80" strokeWidth={2} fill="url(#nwtGrad)" dot={false} activeDot={{ r:4, fill:'#4ade80', strokeWidth:0 }}/>
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.75rem' }}>ADD TRANSACTIONS TO SEE TRAJECTORY</div>
                )}
              </motion.div>

              {/* ── Feature 2: Spending Streak ─────────────────────────────── */}
              <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}>
                {spendingStreak.streak >= 1 ? (
                  <>
                    <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>🔥</div>
                    <div style={{
                      fontFamily:'Inter, sans-serif',
                      fontSize:'1.75rem',
                      fontWeight:700,
                      color: spendingStreak.streak >= 7 ? '#4ade80' : spendingStreak.streak >= 3 ? '#fbbf24' : '#ffffff',
                      textShadow: 'none',
                      lineHeight:1,
                      marginBottom:'0.5rem',
                    }}>
                      {spendingStreak.streak}
                    </div>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.68rem', letterSpacing:'1.5px', color:'var(--text-secondary)', marginBottom:'0.4rem' }}>DAY STREAK</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>spending under daily target</div>
                    <div style={{ marginTop:'0.75rem', fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>TARGET: {formatCurrency(spendingStreak.target)}/day</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>💡</div>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.75rem', letterSpacing:'1px', color:'var(--text-secondary)', marginBottom:'0.5rem' }}>START YOUR STREAK</div>
                    <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', lineHeight:1.5 }}>
                      Stay under {formatCurrency(spendingStreak.target)}/day today
                    </div>
                  </>
                )}
              </motion.div>

            </div>

            {/* Net Worth Gauge — Assets vs Liabilities visual ratio */}
            {(totalAssets + totalLiabilities) > 0 && (() => {
              const assetPct = Math.round((totalAssets / (totalAssets + totalLiabilities)) * 100);
              
              const R = 54, circ = 2 * Math.PI * R;
              const assetDash = (assetPct / 100) * circ;
              const gaugeColor = assetPct >= 70 ? '#4ade80' : assetPct >= 50 ? '#fbbf24' : '#f87171';
              return (
                <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.37 }}
                  style={{ position:'relative', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem 1.5rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'2rem' }}>
                  {/* Ring */}
                  <div style={{ position:'relative', flexShrink:0 }}>
                    <svg width={130} height={130}>
                      <circle cx={65} cy={65} r={R} fill="none" stroke="rgba(248,113,113,0.25)" strokeWidth={12}/>
                      <circle cx={65} cy={65} r={R} fill="none" stroke={gaugeColor} strokeWidth={12}
                        strokeDasharray={`${assetDash} ${circ - assetDash}`}
                        strokeLinecap="round" transform="rotate(-90 65 65)"
                        style={{ transition:'stroke-dasharray 1.2s ease, stroke 0.4s ease', filter:`drop-shadow(0 0 6px ${gaugeColor}80)` }}/>
                      <text x={65} y={60} textAnchor="middle" fill={gaugeColor} fontSize={18} fontFamily="Outfit, sans-serif" fontWeight={700}>{assetPct}%</text>
                      <text x={65} y={78} textAnchor="middle" fill="#555" fontSize={9} fontFamily="Outfit, sans-serif">ASSETS</text>
                    </svg>
                  </div>
                  {/* Stats */}
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.68rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.875rem' }}>NET WORTH RATIO</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:gaugeColor, display:'inline-block' }}/> Assets
                        </span>
                        <span style={{ fontFamily:'Inter, sans-serif', fontWeight:700, color:gaugeColor }}>{formatCurrency(totalAssets)}</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>
                          <span style={{ width:8, height:8, borderRadius:'50%', background:'#f87171', display:'inline-block' }}/> Liabilities
                        </span>
                        <span style={{ fontFamily:'Inter, sans-serif', fontWeight:700, color:'#f87171' }}>{formatCurrency(totalLiabilities)}</span>
                      </div>
                      <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'0.5rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem', color:'var(--text-secondary)' }}>Net Worth</span>
                        <span style={{ fontFamily:'Inter, sans-serif', fontWeight:700, color: netWorth >= 0 ? '#4ade80' : '#f87171', fontSize:'1rem' }}>{formatCurrency(netWorth)}</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setShowNWBreakdown(true)}
                    style={{ position:'absolute', right:'1.5rem', top:'1rem', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.65rem', letterSpacing:'1px' }}>
                    DETAILS ↗
                  </button>
                </motion.div>
              );
            })()}

            </section>

            <section className="dash-group">
            <h2 className="dash-section-title">Spending</h2>
            {/* Safe-to-Spend Daily Allowance Hero Widget */}
            <SafeToSpendCard safeToSpendData={safeToSpendData} />

            <div className="bento dash-pair">
            {/* Top Spending Categories this month */}
            {analytics?.categoryData?.length > 0 && (
              <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.39 }}
                className="bento-card bento-item bento-6" style={{ flexDirection:'column', marginTop:'0.5rem' }}>
                <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:'0 0 0.875rem' }}>📊 TOP CATEGORIES THIS MONTH</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {[...analytics.categoryData].sort((a,b) => b.total - a.total).slice(0,5).map((cat, i) => {

                    const pct = Math.round((cat.total / Math.max(...analytics.categoryData.map(c => c.total))) * 100);
                    const colors = ['#f87171','#fb923c','#fbbf24','#4ade80','#818cf8'];
                    const col = colors[i] || '#aaa';
                    return (
                      <div key={cat.category} style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                        <div style={{ fontSize:'0.75rem', width:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontFamily:'Inter, sans-serif' }}>{cat.category}</div>
                        <div style={{ flex:1, height:6, background:'rgba(255,255,255,0.05)', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ width:`${pct}%`, height:'100%', background:col, borderRadius:3, transition:'width 0.8s ease', boxShadow:`0 0 6px ${col}` }} />
                        </div>
                        <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', color:col, minWidth:70, textAlign:'right' }}>{formatCurrency(cat.total)}</div>
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
              transactions.filter(t => t && !t.reversed_at && !t.reversal_of && !t.is_transfer_fee && t.date?.startsWith(monthStr) && (t.type === 'Expense' || t.type === 'Loan Payment'))
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
                    <h3 style={{ fontFamily:'Inter, sans-serif', letterSpacing:'2px', fontSize:'0.7rem', margin:0, color:'var(--text-secondary)' }}>SPENDING CALENDAR — {MONTHS[mo].toUpperCase()} {yr}</h3>
                    <span style={{ fontSize:'0.65rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)' }}>darker = more spent</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
                    {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', padding:'2px 0' }}>{d}</div>)}
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
                          style={{ aspectRatio:'1', borderRadius:4, background: isFuture ? 'transparent' : cellColor, border: isToday ? '1px solid #fbbf24' : '1px solid transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color: amt > 0 && intensity > 0.5 ? '#fff' : isToday ? '#fbbf24' : '#555', transition:'transform 0.1s', cursor: amt > 0 ? 'default' : 'default' }}>
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
                    <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:0 }}>🔔 UPCOMING BILLS (14d)</h3>
                    <a href="/bills" style={{ fontSize:'0.68rem', color:'var(--cyan,#00f5ff)', fontFamily:'Inter, sans-serif', textDecoration:'none' }}>VIEW ALL →</a>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
                    {upcoming.map(bill => {
                      const col = bill.days <= 3 ? '#f87171' : bill.days <= 7 ? '#fbbf24' : '#4ade80';
                      return (
                        <div key={bill.id} style={{ display:'flex', alignItems:'center', gap:'0.625rem', padding:'0.5rem 0.75rem', background:`${col}06`, border:`1px solid ${col}18`, borderLeft:`3px solid ${col}`, borderRadius:8 }}>
                          <div style={{ minWidth:36, textAlign:'center', fontSize:'0.65rem', fontFamily:'Inter, sans-serif', color:col }}>
                            {bill.days === 0 ? 'TODAY' : `${bill.days}d`}
                          </div>
                          <div style={{ flex:1, fontSize:'0.82rem', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{bill.name}</div>
                          <div style={{ fontWeight:700, color:col, fontFamily:'Inter, sans-serif', fontSize:'0.82rem', flexShrink:0 }}>{formatCurrency(bill.amount)}</div>
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
                  <h3 style={{ fontFamily:'Inter, sans-serif', fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', margin:0 }}>🎯 GOALS PROGRESS</h3>
                  <a href="/goals" style={{ fontSize:'0.68rem', color:'var(--cyan,#00f5ff)', fontFamily:'Inter, sans-serif', textDecoration:'none' }}>VIEW ALL →</a>
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
                          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                            {formatCurrency(g.current_amount || 0)} / {formatCurrency(g.target_amount || 0)}
                          </div>
                          <div style={{ fontSize:'0.65rem', marginTop:3, fontFamily:'Inter, sans-serif', color: isAtRisk ? '#f87171' : '#4ade80' }}>
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

            <MoreSection title="Spending limits" hint="Daily & weekly guardrails">
            {/* Custom Smart Spending Limits (Daily & Weekly Velocity Guardrails) */}
            {(() => {
              const todayKey = todayYMD();
              const sevenDaysAgo = new Date();
              sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
              const sevenDaysKey = toYMD(sevenDaysAgo);

              const activeExp = transactions.filter(t => t && !t.reversed_at && !t.reversal_of && !t.is_transfer_fee && (t.type === 'Expense' || t.type === 'Loan Payment'));
              const todaySpent = activeExp
                .filter(t => t.date === todayKey)
                .reduce((s, t) => s + (Number(t.amount) || 0), 0);
              const weekSpent = activeExp
                .filter(t => t.date >= sevenDaysKey && t.date <= todayKey)
                .reduce((s, t) => s + (Number(t.amount) || 0), 0);

              const effectiveDaily = dailyLimit > 0 ? dailyLimit : Math.round(safeToSpendData?.dailyAllowance || 0);
              const effectiveWeekly = weeklyLimit > 0 ? weeklyLimit : Math.round((safeToSpendData?.dailyAllowance || 0) * 7);

              const dPct = effectiveDaily > 0 ? Math.min(100, Math.round((todaySpent / effectiveDaily) * 100)) : 0;
              const wPct = effectiveWeekly > 0 ? Math.min(100, Math.round((weekSpent / effectiveWeekly) * 100)) : 0;

              const dColor = todaySpent > effectiveDaily && effectiveDaily > 0 ? '#f87171' : dPct >= 80 ? '#fbbf24' : '#4ade80';
              const wColor = weekSpent > effectiveWeekly && effectiveWeekly > 0 ? '#f87171' : wPct >= 80 ? '#fbbf24' : '#38bdf8';

              const handleSaveCaps = () => {
                const dVal = parseFloat(capForm.daily) || 0;
                const wVal = parseFloat(capForm.weekly) || 0;
                if (dVal > 0) localStorage.setItem('vm_daily_limit', String(dVal));
                else localStorage.removeItem('vm_daily_limit');
                if (wVal > 0) localStorage.setItem('vm_weekly_limit', String(wVal));
                else localStorage.removeItem('vm_weekly_limit');
                setDailyLimit(dVal);
                setWeeklyLimit(wVal);
                setEditingCaps(false);
                haptic();
                toast.success('Smart spending velocity caps updated!');
                loadData(true);
              };

              return (
                <div style={{
                  marginBottom: '1.5rem',
                  padding: '1rem 1.25rem',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 14,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>🚦</span>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-secondary)' }}>
                        SMART SPEND VELOCITY GUARDRAILS
                      </span>
                      <span style={{
                        fontSize: '0.64rem',
                        padding: '0.12rem 0.45rem',
                        borderRadius: 20,
                        background: (dailyLimit > 0 || weeklyLimit > 0) ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
                        color: (dailyLimit > 0 || weeklyLimit > 0) ? '#4ade80' : 'var(--text-muted)',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 600,
                      }}>
                        {(dailyLimit > 0 || weeklyLimit > 0) ? 'Custom Caps Active' : 'Auto Safe-Spend Benchmark'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingCaps(v => !v)}
                      style={{
                        padding: '0.28rem 0.7rem',
                        borderRadius: 8,
                        background: 'rgba(251, 146, 60, 0.12)',
                        border: '1px solid rgba(251, 146, 60, 0.3)',
                        color: '#fb923c',
                        fontSize: '0.72rem',
                        fontFamily: 'Inter, sans-serif',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {editingCaps ? 'Cancel' : '⚙ Set Daily / Weekly Caps'}
                    </button>
                  </div>

                  {editingCaps && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                      gap: '0.75rem',
                      padding: '0.85rem',
                      background: 'rgba(0,0,0,0.25)',
                      borderRadius: 10,
                      marginBottom: '0.85rem',
                      border: '1px solid rgba(251,146,60,0.2)',
                    }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
                          {`Daily Spend Cap (${getCurrencyLabel()})`}
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0 = Auto Safe-Spend"
                          value={capForm.daily}
                          onChange={e => setCapForm(f => ({ ...f, daily: e.target.value }))}
                          style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                        />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'Inter, sans-serif' }}>
                          {`7-Day Weekly Cap (${getCurrencyLabel()})`}
                        </label>
                        <input
                          type="number"
                          min="0"
                          placeholder="0 = Auto 7x Daily"
                          value={capForm.weekly}
                          onChange={e => setCapForm(f => ({ ...f, weekly: e.target.value }))}
                          style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={handleSaveCaps}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.85rem',
                            borderRadius: 8,
                            background: 'linear-gradient(135deg, #fb923c, #f97316)',
                            color: '#0f172a',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                          }}
                        >
                          Save Velocity Caps
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
                    {/* Today's Velocity */}
                    <div style={{ background: 'rgba(255,255,255,0.015)', padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Today&apos;s Spend Velocity</span>
                        <span style={{ color: dColor, fontWeight: 700 }}>
                          {formatCurrency(todaySpent)} / {formatCurrency(effectiveDaily)}
                        </span>
                      </div>
                      <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${dPct}%`, height: '100%', background: dColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                        <span>{todaySpent > effectiveDaily && effectiveDaily > 0 ? '⚠ Exceeded daily cap' : `${Math.max(0, 100 - dPct)}% daily buffer left`}</span>
                        <span>{dPct}%</span>
                      </div>
                    </div>

                    {/* 7-Day Rolling Velocity */}
                    <div style={{ background: 'rgba(255,255,255,0.015)', padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', fontFamily: 'Inter, sans-serif', marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>7-Day Rolling Velocity</span>
                        <span style={{ color: wColor, fontWeight: 700 }}>
                          {formatCurrency(weekSpent)} / {formatCurrency(effectiveWeekly)}
                        </span>
                      </div>
                      <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${wPct}%`, height: '100%', background: wColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
                        <span>{weekSpent > effectiveWeekly && effectiveWeekly > 0 ? '⚠ Exceeded 7-day cap' : `${Math.max(0, 100 - wPct)}% weekly buffer left`}</span>
                        <span>{wPct}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            </MoreSection>

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
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.7rem', letterSpacing:'1.5px', color:col, marginBottom:'0.3rem', fontWeight:600 }}>INSIGHT</div>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.82rem', fontWeight:600, marginBottom:'0.2rem' }}>{rec.title}</div>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.75rem', color:'var(--text-muted)', lineHeight:1.5 }}>{rec.body}</div>
                  </div>
                  <a href="/analytics" style={{ textDecoration:'none', color:col, fontFamily:'Inter, sans-serif', fontSize:'0.65rem', letterSpacing:'1px', flexShrink:0, marginTop:2 }}>DETAILS →</a>
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
                    <h3 style={{ fontFamily:'Inter, sans-serif', letterSpacing:'2px', fontSize:'0.7rem', margin:0, color:'var(--text-secondary)' }}>REFERENCE RATES · {rates._date || 'Unavailable'}</h3>
                    <span style={{ fontSize:'0.65rem', color:'#444', fontFamily:'Inter, sans-serif' }}>1 {base} =</span>
                  </div>
                  <div style={{ display:'flex', gap:'0.6rem', flexWrap:'wrap' }}>
                    {pairs.map(cur => {
                      const curRate = rates[cur];
                      const rate = baseRate / curRate;
                      return (
                        <div key={cur} style={{ flex:'1 1 90px', padding:'0.6rem 0.75rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.05)', textAlign:'center' }}>
                          <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.62rem', letterSpacing:'1.5px', color:'#555', marginBottom:'0.25rem' }}>{cur}</div>
                          <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:'#06b6d4' }}>
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
                <h2 style={{ margin:0, fontFamily:'Inter, sans-serif', fontSize:'1.1rem', fontWeight:700, color:'var(--text-primary)' }}>Net Worth Breakdown</h2>
                <p style={{ margin:'0.2rem 0 0', fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>Assets vs Liabilities</p>
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
                  <div style={{ fontSize:'0.6rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)', letterSpacing:'1.5px', marginBottom:'0.35rem' }}>{s.label}</div>
                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:s.col }}>{formatCurrency(s.val)}</div>
                </div>
              ))}
            </div>

            {/* Assets list */}
            <div style={{ marginBottom:'1.25rem' }}>
              <div style={{ fontSize:'0.7rem', fontFamily:'Inter, sans-serif', letterSpacing:'2px', color:'#4ade80', marginBottom:'0.625rem' }}>ASSETS</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                {accounts.filter(a => !isDebtAccount(a)).map(a => {
                  const baseBal = toBase(a.balance, a.currency);
                  const pct = totalAssets > 0 ? Math.min(100, (baseBal / totalAssets) * 100) : 0;
                  return (
                    <div key={a.id}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem', fontFamily:'Inter, sans-serif' }}>
                        <span>{a.name} <span style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>({a.type})</span></span>
                        <span style={{ color:'#4ade80', fontWeight:600 }}>{formatCurrency(a.balance, { currency: a.currency || baseCurrency })}</span>
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
                <div style={{ fontSize:'0.7rem', fontFamily:'Inter, sans-serif', letterSpacing:'2px', color:'#f87171', marginBottom:'0.625rem' }}>LIABILITIES (LOANS)</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {loans.filter(l => (l.status || 'Active') === 'Active').map(l => {
                    const owed = toBase((Number(l.principal_amount) || 0) + (Number(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency);
                    const pct = totalLiabilities > 0 ? Math.min(100, (owed / totalLiabilities) * 100) : 0;
                    return (
                      <div key={l.id}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem', fontFamily:'Inter, sans-serif' }}>
                          <span>{l.item_name || l.lender_name || l.name}</span>
                          <span style={{ color:'#f87171', fontWeight:600 }}>{formatCurrency(owed)}</span>
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
                <div style={{ fontSize:'0.7rem', fontFamily:'Inter, sans-serif', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.5rem' }}>ASSET/LIABILITY RATIO</div>
                <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden', display:'flex' }}>
                  <div style={{ width:`${Math.round((totalAssets/(totalAssets+totalLiabilities))*100)}%`, background:'linear-gradient(90deg,#4ade80,#22d3ee)', borderRadius:'4px 0 0 4px', transition:'width 1s ease' }}/>
                  <div style={{ flex:1, background:'rgba(248,113,113,0.4)', borderRadius:'0 4px 4px 0' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:'0.3rem', fontSize:'0.65rem', fontFamily:'Inter, sans-serif', color:'var(--text-muted)' }}>
                  <span style={{ color:'#4ade80' }}>Assets {Math.round((totalAssets/(totalAssets+totalLiabilities))*100)}%</span>
                  <span style={{ color:'#f87171' }}>Liabilities {Math.round((totalLiabilities/(totalAssets+totalLiabilities))*100)}%</span>
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
        onDelete={async (tx) => {
          try {
            await deleteTransaction(tx.id);
            setPopupTx(null);
            loadData(true);
            toast.success('Transaction deleted');
          } catch {
  toast.error('Failed to delete transaction');
}
        }}
      />

      {/* ── Simple Income / Deduction Summary Breakdown Popup ── */}
      {summaryPopup && (
        <Modal
          isOpen={!!summaryPopup}
          onClose={() => setSummaryPopup(null)}
          title={summaryPopup.type === 'Income' ? '💰 This Month Income' : '💸 This Month Deductions & Expenses'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{
              textAlign: 'center',
              padding: '1.25rem',
              background: summaryPopup.type === 'Income' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
              borderRadius: 14,
              border: `1px solid ${summaryPopup.type === 'Income' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`
            }}>
              <div style={{ fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Total {summaryPopup.type === 'Income' ? 'Income Received' : 'Deductions & Expenses'}
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', fontWeight: 800, color: summaryPopup.type === 'Income' ? '#4ade80' : '#f87171', marginTop: 4 }}>
                {summaryPopup.type === 'Income' ? '+' : '-'}{formatCurrency(summaryPopup.type === 'Income' ? monthlyIncome : monthlyExpense)}
              </div>
            </div>

            {(() => {
              const thisMo = todayYMD().substring(0, 7);
              const txList = (transactions || []).filter(t => {
                if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee || !t.date || !t.date.startsWith(thisMo)) return false;
                if (summaryPopup.type === 'Income') return t.type === 'Income';
                return t.type === 'Expense' || t.type === 'Loan Payment';
              });
              return (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '1px' }}>
                      Transactions ({txList.length})
                    </div>
                    <span style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Tap item to view popup</span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '50vh', overflowY: 'auto' }}>
                    {txList.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
                        No {summaryPopup.type === 'Income' ? 'income' : 'expense'} transactions recorded this month yet.
                      </div>
                    ) : (
                      txList.map(tx => (
                        <div
                          key={tx.id}
                          onClick={() => {
                            haptic();
                            setPopupTx(tx);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem',
                            borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                            cursor: 'pointer', transition: 'all 0.15s'
                          }}
                        >
                          <div style={{ fontSize: '1.3rem', width: 34, textAlign: 'center' }}>
                            {getCategoryEmoji(tx.category) || (summaryPopup.type === 'Income' ? '💰' : '💸')}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {tx.category || tx.type}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                              {tx.date} {tx.notes ? `• ${tx.notes}` : ''}
                            </div>
                          </div>
                          <div style={{ fontWeight: 700, fontFamily: 'Inter, sans-serif', color: summaryPopup.type === 'Income' ? '#4ade80' : '#f87171', fontSize: '0.9rem' }}>
                            {summaryPopup.type === 'Income' ? '+' : '-'}{formatCurrency(tx.amount)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </>
              );
            })()}

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  setSummaryPopup(null);
                  navigate('/transactions');
                }}
                className="btn btn-secondary"
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.7rem', fontSize: '0.82rem' }}
              >
                View in Transactions <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </Modal>
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