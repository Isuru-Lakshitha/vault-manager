import { useState, useEffect, useMemo } from 'react';
import { InsightRecurring } from '../components/InsightPanels';
import { useNavigate } from 'react-router-dom';
import useLiveData from '../utils/useLiveData';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
  Pause,
  Play,
  Zap,
  Landmark,
  ChevronDown,
  ChevronUp,
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  CheckSquare,
  Square,
  RotateCcw,
  Layers,
  List,
  Check,
  X,
  ShieldCheck,
} from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import CurrencyInput from '../components/CurrencyInput';
import SafeToSpendCard from '../components/SafeToSpendCard';
import RecurringHistoryModal from '../components/RecurringHistoryModal';
import AnimatedCounter from '../components/AnimatedCounter';
import { detectRecurring } from '../utils/recurringDetect';
import toast from 'react-hot-toast';
import {
  fetchRecurringTransactions,
  createRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransaction,
  applyPendingRecurring,
  payRecurringRule,
  fetchAccounts,
  fetchLoans,
  createLoan,
  updateLoan,
  payLoan,
  fetchGoals,
  fetchBills,
  updateBill,
  fetchCreditCards,
  fetchExchangeRates,
  fetchTransactions,
  getCache,
} from '../utils/api';
import { advanceBill } from '../utils/billSchedule';
import { calculateSafeToSpend } from '../utils/financialIntelligence';
import { todayYMD } from '../utils/dates';
import { convertCurrency, formatCurrency, getCurrency, getCurrencyLabel, haptic } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';

const FREQUENCIES = ['Monthly', 'Weekly', 'Yearly'];
const TYPES = ['Expense', 'Loan Payment', 'Income', 'Transfer'];
const EXPENSE_CATS = ['Utilities', 'Phone/Internet', 'Gold Loan', 'Loan EMI', 'Rent/Housing', 'Food', 'Transport', 'Insurance', 'Subscriptions', 'Groceries', 'Education', 'Entertainment', 'Health', 'Shopping', 'Other'];
const INCOME_CATS = ['Salary', 'Freelance', 'Business', 'Dividends', 'Rental Income', 'Other Income'];

const QUICK_PRESETS = [
  { label: '⚡ Electricity', name: 'Electricity Bill', type: 'Expense', category: 'Utilities', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Electricity (Variable)' },
  { label: '🌐 Internet / Wi-Fi', name: 'Internet / Fibre Bill', type: 'Expense', category: 'Phone/Internet', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Internet / Data (Variable)' },
  { label: '💧 Water Bill', name: 'Water Bill', type: 'Expense', category: 'Utilities', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Water Bill (Variable)' },
  { label: '📱 Mobile Package', name: 'Mobile Postpaid / Reload', type: 'Expense', category: 'Phone/Internet', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Mobile Package' },
  { label: '🪙 Gold Loan', name: 'Gold Loan Monthly Interest', type: 'Loan Payment', category: 'Gold Loan', schedule_mode: 'flexible', flexible_window: 'Anytime', is_variable: true, notes: 'Monthly Gold Loan Interest / Part-Payment' },
  { label: '🏠 Monthly Rent', name: 'Monthly Rent', type: 'Expense', category: 'Rent/Housing', schedule_mode: 'fixed', day_of_month: 1, is_variable: false, notes: 'Fixed Monthly Rent' },
  { label: '💰 Monthly Salary', name: 'Monthly Salary', type: 'Income', category: 'Salary', schedule_mode: 'fixed', day_of_month: 25, is_variable: false, notes: 'Primary Monthly Income' },
];

const freqLabel = (f) => f === 'Weekly' ? '/ wk' : f === 'Yearly' ? '/ yr' : '/ mo';

const getRuleEffectiveAmount = (rule) => {
  const direct = parseFloat(rule.amount) || parseFloat(rule.avg_amount) || 0;
  if (direct > 0) return direct;
  if (rule.is_variable && Array.isArray(rule.payment_history) && rule.payment_history.length > 0) {
    const recent3 = rule.payment_history.slice(-3);
    const avg = recent3.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0) / recent3.length;
    if (avg > 0) return Math.round(avg);
  }
  return 0;
};

const freqMonthly = (rule) => {
  const amt = getRuleEffectiveAmount(rule);
  if (rule.frequency === 'Weekly') return amt * 4.33;
  if (rule.frequency === 'Yearly') return amt / 12;
  return amt;
};

const getRuleUrgency = (rule, currentMonth) => {
  const isPaid = rule.last_applied_month === currentMonth;
  if (isPaid) {
    return {
      level: 'paid',
      rank: 50,
      label: rule.last_paid_marked_only
        ? '☑️ MARKED PAID · THIS MONTH'
        : `✅ ${rule.type === 'Income' ? 'RECEIVED' : 'PAID'} THIS MONTH${rule.last_paid_amount ? ` · ${formatCurrency(rule.last_paid_amount)}` : ''}`,
      subLabel: rule.last_paid_date ? `Settled on ${rule.last_paid_date}` : 'Settled for current cycle',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.14)',
      border: 'rgba(16, 185, 129, 0.42)',
      cardBg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.015) 100%)',
      cardBorder: 'rgba(16, 185, 129, 0.34)',
      accentColor: '#10b981',
    };
  }

  const isFlexible = (rule.schedule_mode || (rule.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
  const todayDom = new Date().getDate();
  const dom = parseInt(rule.day_of_month, 10) || 1;

  if (!isFlexible && rule.day_of_month) {
    const diff = dom - todayDom;
    if (diff < 0) {
      return {
        level: 'overdue',
        rank: 1,
        daysDiff: diff,
        label: `🚨 OVERDUE · Day ${dom} (${Math.abs(diff)}d ago)`,
        subLabel: `Was scheduled for Day ${dom} of this month`,
        color: '#f87171',
        bg: 'rgba(239, 68, 68, 0.16)',
        border: 'rgba(239, 68, 68, 0.48)',
        cardBg: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.02) 100%)',
        cardBorder: 'rgba(239, 68, 68, 0.36)',
        accentColor: '#ef4444',
      };
    }
    if (diff === 0) {
      return {
        level: 'today',
        rank: 2,
        daysDiff: 0,
        label: `⚡ DUE TODAY · Day ${dom}`,
        subLabel: 'Scheduled for today',
        color: '#fbbf24',
        bg: 'rgba(245, 158, 11, 0.18)',
        border: 'rgba(245, 158, 11, 0.52)',
        cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.09) 0%, rgba(245, 158, 11, 0.02) 100%)',
        cardBorder: 'rgba(245, 158, 11, 0.38)',
        accentColor: '#f59e0b',
      };
    }
    if (diff <= 5) {
      return {
        level: 'soon',
        rank: 3,
        daysDiff: diff,
        label: `⏰ DUE IN ${diff}d · Day ${dom}`,
        subLabel: `Upcoming in ${diff} day${diff === 1 ? '' : 's'}`,
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.14)',
        border: 'rgba(245, 158, 11, 0.38)',
        cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.06) 0%, rgba(255, 255, 255, 0.015) 100%)',
        cardBorder: 'rgba(245, 158, 11, 0.28)',
        accentColor: '#f59e0b',
      };
    }
    return {
      level: 'upcoming',
      rank: 4,
      daysDiff: diff,
      label: `⏳ UNPAID · Due Day ${dom} (in ${diff}d)`,
      subLabel: `Fixed monthly on Day ${dom}`,
      color: '#fbbf24',
      bg: 'rgba(245, 158, 11, 0.11)',
      border: 'rgba(245, 158, 11, 0.3)',
      cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.045) 0%, rgba(255, 255, 255, 0.015) 100%)',
      cardBorder: 'rgba(245, 158, 11, 0.22)',
      accentColor: '#f59e0b',
    };
  }

  return {
    level: 'flexible',
    rank: 5,
    label: `⏳ UNPAID · Due (${rule.flexible_window || 'Anytime This Month'})`,
    subLabel: `Flexible window · ${rule.flexible_window || 'Anytime'}`,
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.32)',
    cardBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.05) 0%, rgba(255, 255, 255, 0.015) 100%)',
    cardBorder: 'rgba(245, 158, 11, 0.24)',
    accentColor: '#f59e0b',
  };
};

const defaultForm = {
  name: '',
  type: 'Expense',
  amount: 0,
  min_amount: 0,
  max_amount: 0,
  category: 'Utilities',
  frequency: 'Monthly',
  schedule_mode: 'flexible',
  flexible_window: 'Anytime',
  day_of_month: 1,
  is_variable: true,
  start_next_month: true,
  loan_id: '',
  notes: '',
  from_account_id: '',
  to_account_id: '',
  paused: false,
};

const Recurring = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState(() => getCache('recurring') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loans, setLoans] = useState(() => getCache('loans') || []);
  const [goals, setGoals] = useState(() => getCache('goals') || []);
  const [bills, setBills] = useState(() => getCache('bills') || []);
  const [creditCards, setCreditCards] = useState(() => getCache('credit_cards') || []);
  const [rates, setRates] = useState(null);
  const [transactions, setTransactions] = useState(() => getCache('transactions') || []);
  const [loading, setLoading] = useState(() => !getCache('recurring'));
  const [filterTab, setFilterTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showPlanner, setShowPlanner] = useState(false);

  // Advanced View, Sort, Batch Selection, Inline Estimate & Smart Detection State
  const [layoutMode, setLayoutMode] = useState('split'); // 'split' | 'list'
  const [sortBy, setSortBy] = useState('urgency'); // 'urgency' | 'amount_desc' | 'amount_asc' | 'name_asc'
  const [selectedIds, setSelectedIds] = useState([]);
  const [collapsedSections, setCollapsedSections] = useState({ unpaid: false, paid: false });
  const [editingEstId, setEditingEstId] = useState(null);
  const [editingEstVal, setEditingEstVal] = useState('');
  const [dismissedCandidates, setDismissedCandidates] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('mm_dismissed_recurring_candidates') || '[]');
    } catch {
      return [];
    }
  });

  // Create / Edit Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [formData, setFormData] = useState(defaultForm);
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [clearAllConfirm, setClearAllConfirm] = useState(false);
  const [, setPending] = useState([]);

  // Recurring Payment History Modal state
  const [selectedRuleForHistoryId, setSelectedRuleForHistoryId] = useState(null);
  const activeRuleForHistory = useMemo(
    () => rules.find(r => String(r.id) === String(selectedRuleForHistoryId)) || null,
    [rules, selectedRuleForHistoryId]
  );

  // Dedicated "Add Loan as Monthly Payment" Modal state
  const [loanModalOpen, setLoanModalOpen] = useState(false);
  const [loanForm, setLoanForm] = useState({
    mode: 'existing',
    selected_loan_id: '',
    item_name: '',
    type: 'Gold Loan',
    lender_name: '',
    principal_amount: 100000,
    annual_interest_rate: 24,
    monthly_payment: 0,
    schedule_mode: 'flexible',
    flexible_window: 'Anytime',
    day_of_month: 1,
    is_variable: true,
    start_next_month: true,
    from_account_id: '',
    notes: '',
  });

  // Smart Pay This Month Modal (for variable bills & recurring rules)
  const [payModal, setPayModal] = useState({
    open: false,
    rule: null,
    loan: null,
    amount: 0,
    date: todayYMD(),
    account_id: '',
    to_account_id: '',
    notes: '',
    updateEstimate: true,
    saving: false,
  });

  const currentMonth = todayYMD().substring(0, 7);

  useEffect(() => { load(!!getCache('recurring')); }, []);
  useLiveData(() => load(true));

  const load = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [rls, accs, pend, lns, gls, bls, cds, txns, fx] = await Promise.all([
        fetchRecurringTransactions(),
        fetchAccounts(),
        applyPendingRecurring(),
        fetchLoans().catch(() => []),
        fetchGoals().catch(() => []),
        fetchBills().catch(() => []),
        fetchCreditCards().catch(() => []),
        fetchTransactions().catch(() => []),
        fetchExchangeRates().catch(() => null),
      ]);
      setRules(rls || []);
      setAccounts(accs || []);
      setPending(pend || []);
      setLoans(lns || []);
      setGoals(gls || []);
      setBills(bls || []);
      setCreditCards(cds || []);
      setTransactions(txns || []);
      if (fx) setRates(fx);
    } catch {
      toast.error('Failed to load recurring rules');
    } finally {
      setLoading(false);
    }
  };

  // Only loans that the user has explicitly added to Recurring as a monthly payment are tracked in Recurring's calculations
  const trackedLoanIds = useMemo(() => new Set(rules.filter(r => r.loan_id).map(r => String(r.loan_id))), [rules]);
  const trackedLoansInRecurring = useMemo(() => loans.filter(l => trackedLoanIds.has(String(l.id))), [loans, trackedLoanIds]);

  // Full Safe-to-Spend & Goal Savings Telemetry
  const safeToSpendData = useMemo(() => {
    return calculateSafeToSpend({
      accounts,
      bills,
      loans: trackedLoansInRecurring,
      goals,
      transactions,
      recurringRules: rules,
      creditCards,
      baseCurrency: getCurrency(),
      rates,
    });
  }, [accounts, bills, trackedLoansInRecurring, goals, transactions, rules, creditCards, rates]);

  const openAdd = (preset = null) => {
    setEditMode(false);
    setCurrentId(null);
    const defaultAcct = accounts[0]?.id || '';
    const secondAcct = accounts[1]?.id || '';
    if (preset) {
      if (preset.type === 'Loan Payment') {
        openAddLoanModal();
        return;
      }
      setFormData({
        ...defaultForm,
        ...preset,
        from_account_id: preset.type === 'Income' ? '' : defaultAcct,
        to_account_id: preset.type === 'Income' ? defaultAcct : preset.type === 'Transfer' ? secondAcct : '',
      });
    } else {
      setFormData({
        ...defaultForm,
        from_account_id: defaultAcct,
        to_account_id: '',
      });
    }
    setIsModalOpen(true);
  };

  const openAddLoanModal = (preselectedLoanId = '') => {
    const activeLoans = loans.filter(l => (l.status || 'Active') === 'Active');
    const defaultLoan = activeLoans.find(l => String(l.id) === String(preselectedLoanId)) || activeLoans[0];
    const initialMode = activeLoans.length > 0 ? 'existing' : 'new';

    let initialMonthly = 0;
    if (defaultLoan) {
      const p = parseFloat(defaultLoan.principal_amount) || 0;
      const r = parseFloat(defaultLoan.annual_interest_rate) || 0;
      const moInt = Math.round((p * (r / 100)) / 12);
      initialMonthly = parseFloat(defaultLoan.monthly_payment) > 0 ? parseFloat(defaultLoan.monthly_payment) : (moInt > 0 ? moInt : 5000);
    } else {
      initialMonthly = 5000;
    }

    setLoanForm({
      mode: initialMode,
      selected_loan_id: defaultLoan?.id || '',
      item_name: '',
      type: 'Gold Loan',
      lender_name: '',
      principal_amount: 100000,
      annual_interest_rate: 24,
      monthly_payment: initialMonthly,
      schedule_mode: 'flexible',
      flexible_window: 'Anytime',
      day_of_month: 1,
      is_variable: true,
      start_next_month: true,
      from_account_id: accounts[0]?.id || '',
      notes: '',
    });
    setLoanModalOpen(true);
  };

  const handleLoanModalSubmit = async (e) => {
    e.preventDefault();
    const paymentAmt = parseFloat(loanForm.monthly_payment) || 0;
    if (paymentAmt <= 0) {
      toast.error('Please enter a valid monthly payment amount');
      return;
    }

    try {
      let targetLoanId = loanForm.selected_loan_id;
      let loanItemName = '';
      let loanType = loanForm.type || 'Gold Loan';

      if (loanForm.mode === 'new') {
        if (!loanForm.item_name.trim()) {
          toast.error('Please enter a loan or item name');
          return;
        }
        const newLoanRes = await createLoan({
          item_name: loanForm.item_name.trim(),
          type: loanForm.type || 'Gold Loan',
          lender_name: loanForm.lender_name.trim() || '',
          principal_amount: parseFloat(loanForm.principal_amount) || 0,
          annual_interest_rate: parseFloat(loanForm.annual_interest_rate) || 0,
          monthly_payment: paymentAmt,
          start_date: todayYMD(),
          last_paid_month: loanForm.start_next_month ? currentMonth : null,
          status: 'Active',
        });
        targetLoanId = newLoanRes.id;
        loanItemName = loanForm.item_name.trim();
      } else {
        const found = loans.find(l => String(l.id) === String(targetLoanId));
        if (!found) {
          toast.error('Please select a loan');
          return;
        }
        loanItemName = found.item_name || 'Gold Loan';
        loanType = found.type || 'Gold Loan';
        if (loanForm.start_next_month) {
          await updateLoan(found.id, { last_paid_month: currentMonth }).catch(() => {});
        }
      }

      const isFlex = loanForm.schedule_mode === 'flexible';
      const roundedAmt = parseFloat(paymentAmt.toFixed(2));
      await createRecurringTransaction({
        name: `🪙 ${loanItemName} (${loanType})`,
        type: 'Loan Payment',
        category: 'Gold Loan',
        amount: roundedAmt,
        avg_amount: roundedAmt,
        schedule_mode: isFlex ? 'flexible' : 'fixed',
        flexible_window: isFlex ? loanForm.flexible_window : 'Anytime',
        day_of_month: isFlex ? null : (parseInt(loanForm.day_of_month, 10) || 1),
        is_variable: Boolean(loanForm.is_variable),
        loan_id: targetLoanId,
        last_applied_month: loanForm.start_next_month ? currentMonth : null,
        from_account_id: loanForm.from_account_id || accounts[0]?.id || '',
        to_account_id: null,
        notes: loanForm.notes || `Monthly ${loanType} payment for ${loanItemName}`,
        paused: false,
      });

      haptic();
      toast.success(
        loanForm.start_next_month
          ? `Added "${loanItemName}" (Marked paid this month — starts next month)`
          : `Added "${loanItemName}" to Monthly Reminders`
      );
      setLoanModalOpen(false);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to add loan to monthly payments');
    }
  };

  const doClearAll = async () => {
    try {
      await Promise.all(rules.map(r => deleteRecurringTransaction(r.id)));
      haptic();
      toast.success('All recurring reminders cleared');
      load(true);
    } catch {
      toast.error('Failed to clear reminders');
    } finally {
      setClearAllConfirm(false);
    }
  };

  const openEdit = (rule) => {
    setEditMode(true);
    setCurrentId(rule.id);
    const rType = rule.type || 'Expense';
    setFormData({
      name: rule.name || rule.notes || '',
      type: rType,
      amount: getRuleEffectiveAmount(rule),
      min_amount: rule.min_amount || 0,
      max_amount: rule.max_amount || 0,
      category: rule.category || 'Utilities',
      frequency: rule.frequency || 'Monthly',
      schedule_mode: rule.schedule_mode || (rule.day_of_month ? 'fixed' : 'flexible'),
      flexible_window: rule.flexible_window || 'Anytime',
      day_of_month: rule.day_of_month || 1,
      is_variable: Boolean(rule.is_variable),
      start_next_month: rule.last_applied_month === currentMonth,
      loan_id: rule.loan_id || '',
      notes: rule.notes || '',
      from_account_id: rType === 'Income' ? '' : (rule.from_account_id ?? ''),
      to_account_id: ['Income', 'Transfer'].includes(rType) ? (rule.to_account_id ?? '') : '',
      paused: Boolean(rule.paused),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter an estimated or fixed amount');
      return;
    }
    if (formData.type === 'Transfer') {
      if (!formData.from_account_id || !formData.to_account_id) {
        toast.error('Please select both From and To accounts for a transfer');
        return;
      }
      if (String(formData.from_account_id) === String(formData.to_account_id)) {
        toast.error('Transfer accounts must be different');
        return;
      }
    }
    try {
      const isFlexible = formData.schedule_mode === 'flexible';
      const targetLastAppliedMonth = formData.start_next_month ? currentMonth : null;
      const roundedAmount = parseFloat(parseFloat(formData.amount).toFixed(2));
      const data = {
        ...formData,
        name: (formData.name || formData.category || 'Recurring Rule').trim(),
        amount: roundedAmount,
        avg_amount: roundedAmount,
        min_amount: parseFloat(formData.min_amount) || 0,
        max_amount: parseFloat(formData.max_amount) || 0,
        schedule_mode: isFlexible ? 'flexible' : 'fixed',
        day_of_month: isFlexible ? null : (parseInt(formData.day_of_month, 10) || 1),
        is_variable: Boolean(formData.is_variable),
        loan_id: formData.type === 'Loan Payment' ? (formData.loan_id || null) : null,
        from_account_id: formData.type === 'Income' ? null : (formData.from_account_id || null),
        to_account_id: ['Income', 'Transfer'].includes(formData.type) ? (formData.to_account_id || null) : null,
        last_applied_month: targetLastAppliedMonth,
      };
      if (editMode) {
        await updateRecurringTransaction(currentId, data);
        toast.success(formData.start_next_month ? 'Updated (Marked paid this month — starts next month)' : 'Reminder updated');
      } else {
        await createRecurringTransaction(data);
        toast.success(formData.start_next_month ? 'Added (Marked paid this month — starts next month)' : 'Monthly reminder added');
      }
      if (data.loan_id) {
        await updateLoan(data.loan_id, { last_paid_month: targetLastAppliedMonth }).catch(() => {});
      }
      haptic();
      setIsModalOpen(false);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to save recurring rule');
    }
  };

  // Toggle whether a Recurring Rule is already paid this month (starts next month) without deducting from any account
  const toggleRulePaidThisMonth = async (rule) => {
    try {
      const currentlyPaid = rule.last_applied_month === currentMonth;
      const nextVal = currentlyPaid ? null : currentMonth;
      await updateRecurringTransaction(rule.id, {
        last_applied_month: nextVal,
        last_paid_marked_only: !currentlyPaid,
        last_paid_amount: null,
        last_paid_date: null,
        last_paid_account_id: null,
      });
      if (rule.loan_id) {
        await updateLoan(rule.loan_id, { last_paid_month: nextVal }).catch(() => {});
      }
      haptic();
      toast.success(
        currentlyPaid
          ? `${rule.name || rule.category} marked as Due This Month`
          : `${rule.name || rule.category} marked as Paid (no account deduction)`
      );
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to update status');
    }
  };

  // 1-Tap Bulk: Mark ALL current month recurring rules & Gold Loans as Already Paid (Start All Next Month)
  const handleMarkAllStartNextMonth = async () => {
    try {
      const unpaidRules = rules.filter(r => !r.paused && r.last_applied_month !== currentMonth);
      const unpaidLoans = (safeToSpendData.loanItems || []).filter(l => !l.isPaidThisMonth);
      await Promise.all([
        ...unpaidRules.map(r => updateRecurringTransaction(r.id, {
          last_applied_month: currentMonth,
          last_paid_marked_only: true,
          last_paid_amount: null,
          last_paid_date: null,
          last_paid_account_id: null,
        })),
        ...unpaidLoans.map(l => updateLoan(l.id, { last_paid_month: currentMonth })),
      ]);
      haptic();
      toast.success('All current month reminders marked as Paid (starts fresh next month)');
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to mark all as paid');
    }
  };

  // 1-Tap Bulk Reset: Mark ALL active recurring rules as Unpaid / Due This Month
  const handleResetMonthCycle = async () => {
    try {
      const paidRules = rules.filter(r => !r.paused && r.last_applied_month === currentMonth);
      if (paidRules.length === 0) {
        toast('All active reminders are already marked as Due This Month');
        return;
      }
      await Promise.all([
        ...paidRules.map(r => updateRecurringTransaction(r.id, {
          last_applied_month: null,
          last_paid_marked_only: false,
          last_paid_amount: null,
          last_paid_date: null,
          last_paid_account_id: null,
        })),
        ...paidRules.filter(r => r.loan_id).map(r => updateLoan(r.loan_id, { last_paid_month: null }).catch(() => {})),
      ]);
      haptic();
      toast.success(`Reset ${paidRules.length} reminder${paidRules.length === 1 ? '' : 's'} to Due This Month`);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to reset cycle');
    }
  };

  // Batch Multi-Select Handlers
  const toggleSelectRule = (id, e) => {
    if (e) e.stopPropagation();
    const strId = String(id);
    setSelectedIds(prev => prev.includes(strId) ? prev.filter(x => x !== strId) : [...prev, strId]);
  };

  const handleBatchMarkStatus = async (markPaid) => {
    const targets = rules.filter(r => selectedIds.includes(String(r.id)));
    if (targets.length === 0) return;
    try {
      const nextMonthVal = markPaid ? currentMonth : null;
      await Promise.all([
        ...targets.map(r => updateRecurringTransaction(r.id, { last_applied_month: nextMonthVal, last_paid_marked_only: markPaid })),
        ...targets.filter(r => r.loan_id).map(r => updateLoan(r.loan_id, { last_paid_month: nextMonthVal }).catch(() => {})),
      ]);
      haptic();
      toast.success(
        markPaid
          ? `Marked ${targets.length} reminder${targets.length === 1 ? '' : 's'} as Paid This Month`
          : `Marked ${targets.length} reminder${targets.length === 1 ? '' : 's'} as Unpaid / Due This Month`
      );
      setSelectedIds([]);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Batch update failed');
    }
  };

  const handleBatchTogglePause = async () => {
    const targets = rules.filter(r => selectedIds.includes(String(r.id)));
    if (targets.length === 0) return;
    const shouldPause = targets.some(r => !r.paused);
    try {
      await Promise.all(targets.map(r => updateRecurringTransaction(r.id, { paused: shouldPause })));
      haptic();
      toast.success(`${shouldPause ? 'Paused' : 'Resumed'} ${targets.length} reminder${targets.length === 1 ? '' : 's'}`);
      setSelectedIds([]);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Batch pause failed');
    }
  };

  // Inline Estimate Quick-Editor
  const saveInlineEstimate = async (rule, e) => {
    if (e) e.stopPropagation();
    const parsed = parseFloat(editingEstVal);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error('Enter a valid positive amount');
      return;
    }
    try {
      const rounded = parseFloat(parsed.toFixed(2));
      await updateRecurringTransaction(rule.id, { amount: rounded, avg_amount: rounded });
      haptic();
      toast.success(`Updated "${rule.name || rule.category}" monthly estimate to ${formatCurrency(rounded)}`);
      setEditingEstId(null);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to update estimate');
    }
  };

  // Smart Ledger Recurring Candidates
  const detectedCandidates = useMemo(() => {
    return detectRecurring(transactions, rules, { today: todayYMD(), dismissed: dismissedCandidates }).slice(0, 4);
  }, [transactions, rules, dismissedCandidates]);

  const handleAcceptCandidate = async (cand) => {
    try {
      const label = cand.notes || cand.category || 'Monthly Recurring';
      await createRecurringTransaction({
        name: label,
        type: cand.type || 'Expense',
        category: cand.category || 'Utilities',
        amount: cand.amount,
        avg_amount: cand.amount,
        frequency: 'Monthly',
        schedule_mode: cand.day_of_month ? 'fixed' : 'flexible',
        day_of_month: cand.day_of_month || 1,
        flexible_window: 'Anytime',
        is_variable: true,
        last_applied_month: String(cand.lastDate || '').startsWith(currentMonth) ? currentMonth : null,
        from_account_id: cand.type === 'Income' ? null : (cand.from_account_id || accounts[0]?.id || null),
        to_account_id: cand.type === 'Income' ? (cand.to_account_id || accounts[0]?.id || null) : null,
        notes: `Auto-detected from ${cand.count} monthly ledger entries`,
        paused: false,
      });
      haptic();
      toast.success(`Added "${label}" to Monthly Reminders`);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to add candidate');
    }
  };

  const handleDismissCandidate = (key) => {
    const next = [...dismissedCandidates, key];
    setDismissedCandidates(next);
    try {
      localStorage.setItem('mm_dismissed_recurring_candidates', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  };

  // Open Smart Pay Modal for a Recurring Rule
  const openPayRuleModal = (rule) => {
    const estAmt = getRuleEffectiveAmount(rule);
    const linkedLoan = rule.loan_id ? loans.find(l => String(l.id) === String(rule.loan_id)) : null;
    const defaultAccountId = rule.type === 'Income'
      ? (rule.to_account_id || accounts[0]?.id || '')
      : (rule.from_account_id || accounts[0]?.id || '');
    const defaultDestId = rule.type === 'Transfer'
      ? (rule.to_account_id || accounts.find(a => String(a.id) !== String(defaultAccountId))?.id || '')
      : '';
    setPayModal({
      open: true,
      rule,
      loan: linkedLoan || null,
      amount: estAmt,
      date: todayYMD(),
      account_id: defaultAccountId,
      to_account_id: defaultDestId,
      notes: `${rule.name || rule.category} (${currentMonth})`,
      updateEstimate: Boolean(rule.is_variable),
      saving: false,
    });
  };

  const handleConfirmPayModal = async (e) => {
    e.preventDefault();
    const amt = parseFloat(payModal.amount) || 0;
    if (amt <= 0) {
      toast.error('Enter a valid payment amount');
      return;
    }
    if (payModal.rule?.type === 'Transfer' && payModal.account_id) {
      if (!payModal.to_account_id) {
        toast.error('Select a destination account for this transfer');
        return;
      }
      if (String(payModal.account_id) === String(payModal.to_account_id)) {
        toast.error('Transfer accounts must be different');
        return;
      }
    }
    setPayModal(p => ({ ...p, saving: true }));
    try {
      if (payModal.rule) {
        await payRecurringRule(payModal.rule, {
          amount: amt,
          date: payModal.date,
          account_id: payModal.account_id,
          to_account_id: payModal.rule.type === 'Transfer' ? payModal.to_account_id : undefined,
          notes: payModal.notes,
          updateEstimate: payModal.updateEstimate,
          force: true,
        });
        const chosenAcct = accounts.find(a => String(a.id) === String(payModal.account_id));
        const acctCur = chosenAcct?.currency || getCurrency();
        const ruleCur = payModal.rule?.currency || acctCur;
        if (chosenAcct && payModal.rule.type === 'Income') {
          const nextBal = (Number(chosenAcct.balance) || 0) + amt;
          toast.success(`Deposited ${formatCurrency(amt, { currency: acctCur })} into "${chosenAcct.name}" (New balance: ${formatCurrency(nextBal, { currency: acctCur })})`);
        } else if (chosenAcct && payModal.rule.type === 'Transfer') {
          const destAcct = accounts.find(a => String(a.id) === String(payModal.to_account_id));
          toast.success(`Transferred ${formatCurrency(amt, { currency: ruleCur })} from "${chosenAcct.name}"${destAcct ? ` to "${destAcct.name}"` : ''}`);
        } else if (chosenAcct) {
          const nextBal = (Number(chosenAcct.balance) || 0) - amt;
          toast.success(`Deducted ${formatCurrency(amt, { currency: acctCur })} from "${chosenAcct.name}" (New balance: ${formatCurrency(nextBal, { currency: acctCur })})`);
        } else {
          toast.success(`${payModal.rule.name || payModal.rule.category} marked as paid (no account deduction)`);
        }
      } else if (payModal.loan) {
        await payLoan(payModal.loan.id, {
          amount: amt,
          date: payModal.date,
          account_id: payModal.account_id,
        });
        const chosenAcct = accounts.find(a => String(a.id) === String(payModal.account_id));
        if (chosenAcct) {
          toast.success(`Deducted ${formatCurrency(amt, { currency: chosenAcct.currency || getCurrency() })} from "${chosenAcct.name}" — loan payment recorded`);
        } else {
          toast.success(`Loan payment of ${formatCurrency(amt)} recorded for ${payModal.loan.item_name || payModal.loan.name}`);
        }
      }
      haptic();
      setPayModal(p => ({ ...p, open: false, saving: false }));
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to record payment');
      setPayModal(p => ({ ...p, saving: false }));
    }
  };

  const togglePause = async (rule) => {
    try {
      await updateRecurringTransaction(rule.id, { paused: !rule.paused });
      toast.success(rule.paused ? `${rule.name || rule.category} resumed` : `${rule.name || rule.category} paused`);
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to update');
    }
  };

  const doDelete = async () => {
    try {
      await deleteRecurringTransaction(confirm.id);
      toast.success('Reminder deleted');
      load(true);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    } finally {
      setConfirm({ open: false, id: null });
    }
  };

  const activeRules = rules.filter(r => !r.paused);
  const pausedRules = rules.filter(r => r.paused);

  // Cycle Settlement Telemetry (Paid vs Unpaid Breakdown)
  const cycleStats = useMemo(() => {
    const unpaid = activeRules.filter(r => r.last_applied_month !== currentMonth);
    const paid = activeRules.filter(r => r.last_applied_month === currentMonth);
    let overdueCount = 0;
    let dueSoonCount = 0;
    let unpaidAmount = 0;
    let paidAmount = 0;
    let paidLedgerCount = 0;
    let paidMarkedCount = 0;

    unpaid.forEach(r => {
      const urg = getRuleUrgency(r, currentMonth);
      if (urg.level === 'overdue') overdueCount += 1;
      else if (urg.level === 'today' || urg.level === 'soon') dueSoonCount += 1;
      if (['Expense', 'Loan Payment'].includes(r.type)) unpaidAmount += freqMonthly(r);
    });

    paid.forEach(r => {
      const settledVal = (!r.last_paid_marked_only && Number(r.last_paid_amount) > 0)
        ? Number(r.last_paid_amount)
        : freqMonthly(r);
      if (['Expense', 'Loan Payment'].includes(r.type)) paidAmount += settledVal;
      if (r.last_paid_marked_only) paidMarkedCount += 1;
      else paidLedgerCount += 1;
    });

    const totalCount = activeRules.length;
    const paidPct = totalCount > 0 ? Math.round((paid.length / totalCount) * 100) : 0;
    const totalCycleAmt = unpaidAmount + paidAmount;
    const amtPct = totalCycleAmt > 0 ? Math.round((paidAmount / totalCycleAmt) * 100) : paidPct;

    return {
      totalCount,
      unpaidCount: unpaid.length,
      paidCount: paid.length,
      overdueCount,
      dueSoonCount,
      unpaidAmount,
      paidAmount,
      paidLedgerCount,
      paidMarkedCount,
      paidPct,
      amtPct,
    };
  }, [activeRules, currentMonth]);

  // Account Funding Coverage Check (Liquidity Guard for Unpaid Outflows)
  const accountCoverage = useMemo(() => {
    const byAcct = new Map();
    let unlinkedDue = 0;
    activeRules.forEach(r => {
      if (r.last_applied_month === currentMonth || r.type === 'Income') return;
      const amt = getRuleEffectiveAmount(r);
      if (amt <= 0) return;
      const baseCur = getCurrency();
      const ruleCur = r.currency || baseCur;
      if (!r.from_account_id) {
        let baseAmt = amt;
        if (ruleCur !== baseCur && rates) {
          const conv = convertCurrency(amt, ruleCur, baseCur, rates);
          if (Number.isFinite(conv)) baseAmt = conv;
        }
        unlinkedDue += baseAmt;
        return;
      }
      const key = String(r.from_account_id);
      const acct = accounts.find(a => String(a.id) === key);
      const acctCur = acct?.currency || ruleCur;
      let dueForAcct = amt;
      if (ruleCur !== acctCur && rates) {
        const conv = convertCurrency(amt, ruleCur, acctCur, rates);
        if (Number.isFinite(conv)) dueForAcct = conv;
      }
      const prev = byAcct.get(key) || { count: 0, dueAmount: 0 };
      byAcct.set(key, { count: prev.count + 1, dueAmount: prev.dueAmount + dueForAcct });
    });

    const items = [];
    for (const [acctId, info] of byAcct.entries()) {
      const acct = accounts.find(a => String(a.id) === acctId);
      if (!acct) continue;
      const bal = Number(acct.balance) || 0;
      const diff = bal - info.dueAmount;
      items.push({
        id: acctId,
        name: acct.name,
        balance: bal,
        dueAmount: info.dueAmount,
        count: info.count,
        covered: diff >= 0,
        shortfall: diff < 0 ? Math.abs(diff) : 0,
      });
    }
    return { items, unlinkedDue };
  }, [activeRules, accounts, currentMonth, rates]);

  const filteredActiveRules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = activeRules.filter(r => {
      const isPaid = r.last_applied_month === currentMonth;
      const isFlexible = (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
      if (filterTab === 'unpaid' && isPaid) return false;
      if (filterTab === 'paid' && !isPaid) return false;
      if (filterTab === 'variable' && !r.is_variable) return false;
      if (filterTab === 'flexible' && !isFlexible) return false;
      if (filterTab === 'gold' && !(Boolean(r.loan_id) || r.type === 'Loan Payment' || r.category === 'Gold Loan')) return false;
      if (q) {
        const hay = `${r.name || ''} ${r.category || ''} ${r.notes || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      if (sortBy === 'amount_desc') return getRuleEffectiveAmount(b) - getRuleEffectiveAmount(a);
      if (sortBy === 'amount_asc') return getRuleEffectiveAmount(a) - getRuleEffectiveAmount(b);
      if (sortBy === 'name_asc') return String(a.name || a.category || '').localeCompare(String(b.name || b.category || ''));
      // Default 'urgency': Unpaid sorted by urgency rank & day_of_month, then Paid
      const urgA = getRuleUrgency(a, currentMonth);
      const urgB = getRuleUrgency(b, currentMonth);
      if (urgA.rank !== urgB.rank) return urgA.rank - urgB.rank;
      const domA = parseInt(a.day_of_month, 10) || 99;
      const domB = parseInt(b.day_of_month, 10) || 99;
      if (domA !== domB) return domA - domB;
      return getRuleEffectiveAmount(b) - getRuleEffectiveAmount(a);
    });
  }, [activeRules, filterTab, currentMonth, searchQuery, sortBy]);

  const unpaidFilteredRules = useMemo(
    () => filteredActiveRules.filter(r => r.last_applied_month !== currentMonth),
    [filteredActiveRules, currentMonth]
  );
  const paidFilteredRules = useMemo(
    () => filteredActiveRules.filter(r => r.last_applied_month === currentMonth),
    [filteredActiveRules, currentMonth]
  );

  const cats = formData.type === 'Income' ? INCOME_CATS : EXPENSE_CATS;

  const renderRuleCard = (rule, idx = 0) => {
    const isPaidThisMonth = rule.last_applied_month === currentMonth;
    const isFlexible = (r => (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible')(rule);
    const effectiveAmt = getRuleEffectiveAmount(rule);
    const monthly = freqMonthly(rule);
    const isIncome = rule.type === 'Income';
    const isLoan = Boolean(rule.loan_id) || rule.type === 'Loan Payment';
    const isTransfer = rule.type === 'Transfer';
    const urgency = getRuleUrgency(rule, currentMonth);
    const isSelected = selectedIds.includes(String(rule.id));
    const isEditingEst = String(editingEstId) === String(rule.id);

    const typeColor = isIncome
      ? '#34d399'
      : isLoan
        ? '#f59e0b'
        : isTransfer
          ? '#5b8def'
          : '#f87171';

    const targetAccountId = isIncome ? rule.to_account_id : rule.from_account_id;
    const acct = accounts.find(a => String(a.id) === String(targetAccountId));
    const destAcct = isTransfer ? accounts.find(a => String(a.id) === String(rule.to_account_id)) : null;
    const history6 = Array.isArray(rule.payment_history) ? rule.payment_history.slice(-6) : [];
    const maxHistAmt = history6.length > 0 ? Math.max(...history6.map(h => parseFloat(h.amount) || 0), 1) : 1;
    const lastHistAmt = history6.length > 0 ? parseFloat(history6[history6.length - 1].amount) || 0 : 0;
    const avgHistAmt = history6.length > 0
      ? history6.reduce((s, h) => s + (parseFloat(h.amount) || 0), 0) / history6.length
      : 0;
    const variancePct = avgHistAmt > 0 && history6.length >= 2
      ? Math.round(((lastHistAmt - avgHistAmt) / avgHistAmt) * 100)
      : 0;

    const linkedLoan = rule.loan_id ? loans.find(l => String(l.id) === String(rule.loan_id)) : null;
    const loanPrincipal = linkedLoan ? parseFloat(linkedLoan.principal_amount) || 0 : 0;
    const loanApr = linkedLoan ? parseFloat(linkedLoan.annual_interest_rate) || 0 : 0;
    const loanMonthlyInt = loanPrincipal > 0 && loanApr > 0 ? Math.round((loanPrincipal * (loanApr / 100)) / 12) : 0;
    const loanAccrued = linkedLoan ? Math.round(parseFloat(linkedLoan.current_accrued_interest ?? linkedLoan.unpaid_interest) || 0) : 0;

    const allHistoryCount = (() => {
      const ruleHist = Array.isArray(rule.payment_history) ? rule.payment_history : [];
      const ruleIdStr = String(rule.id);
      const ruleNameLower = (rule.name || rule.category || '').toLowerCase().trim();
      const ledgerTxns = (transactions || []).filter(t => {
        if (!t || t.reversed_at || t.reversal_of) return false;
        if (t.recurring_rule_id && String(t.recurring_rule_id) === ruleIdStr) return true;
        const notesLower = (t.notes || '').toLowerCase();
        return notesLower.includes('[recurring]') && ruleNameLower && notesLower.includes(ruleNameLower);
      });
      const months = new Set();
      ruleHist.forEach(h => { if (h.month || h.date) months.add(h.month || (h.date ? h.date.slice(0, 7) : '')); });
      ledgerTxns.forEach(t => { if (t.date) months.add(t.date.slice(0, 7)); });
      months.delete('');
      return Math.max(months.size, ruleHist.length);
    })();

    return (
      <motion.div
        key={rule.id}
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: rule.paused ? 0.58 : 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.22, delay: Math.min(idx * 0.025, 0.2) }}
        whileHover={{ y: -2 }}
        onClick={() => {
          haptic();
          setSelectedRuleForHistoryId(rule.id);
        }}
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          padding: '0.95rem 1.15rem',
          background: isSelected
            ? 'rgba(91, 141, 239, 0.09)'
            : rule.paused
              ? 'var(--mm-bg-surface, rgba(255,255,255,0.02))'
              : urgency.cardBg,
          border: `1px solid ${isSelected ? 'rgba(91, 141, 239, 0.45)' : rule.paused ? 'var(--mm-border, rgba(255,255,255,0.08))' : urgency.cardBorder}`,
          borderLeft: `4px solid ${rule.paused ? '#64748b' : urgency.accentColor}`,
          borderRadius: 14,
          gap: '0.85rem',
          boxShadow: isPaidThisMonth
            ? '0 4px 18px rgba(16, 185, 129, 0.06)'
            : urgency.level === 'overdue'
              ? '0 4px 18px rgba(239, 68, 68, 0.08)'
              : '0 2px 10px rgba(0, 0, 0, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 280px', minWidth: 0 }}>
          {/* Multi-Select Checkbox */}
          <button
            type="button"
            onClick={(e) => toggleSelectRule(rule.id, e)}
            aria-label={`Select ${rule.name || rule.category}`}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 2,
              cursor: 'pointer',
              color: isSelected ? 'var(--mm-accent, #5b8def)' : 'var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {isSelected ? <CheckSquare size={17} /> : <Square size={17} />}
          </button>

          {/* Icon Box with Paid / Overdue Corner Badge */}
          <div style={{
            position: 'relative',
            width: 42,
            height: 42,
            borderRadius: 12,
            background: isPaidThisMonth
              ? 'rgba(16, 185, 129, 0.14)'
              : urgency.level === 'overdue'
                ? 'rgba(239, 68, 68, 0.14)'
                : 'var(--mm-bg-elevated, rgba(255,255,255,0.05))',
            border: `1px solid ${isPaidThisMonth ? 'rgba(16, 185, 129, 0.35)' : urgency.level === 'overdue' ? 'rgba(239, 68, 68, 0.35)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            flexShrink: 0,
          }}>
            {isLoan ? '🪙' : getCategoryEmoji(rule.category)}
            {!rule.paused && (
              <span
                style={{
                  position: 'absolute',
                  bottom: -4,
                  right: -4,
                  width: 17,
                  height: 17,
                  borderRadius: '50%',
                  background: isPaidThisMonth ? '#10b981' : urgency.level === 'overdue' ? '#ef4444' : '#f59e0b',
                  color: '#06120e',
                  fontSize: '0.62rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid var(--bg-primary, #0c1017)',
                }}
                title={isPaidThisMonth ? 'Paid This Month' : 'Unpaid / Due This Month'}
              >
                {isPaidThisMonth ? '✓' : '!'}
              </span>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                textDecoration: rule.paused ? 'line-through' : 'none',
              }}>
                {rule.name || rule.category}
              </span>

              {/* High-Contrast Paid vs. Unpaid Status Stamp */}
              {!rule.paused ? (
                <span style={{
                  fontSize: '0.68rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  letterSpacing: '0.2px',
                  padding: '3px 9px',
                  borderRadius: 999,
                  background: urgency.bg,
                  border: `1px solid ${urgency.border}`,
                  color: urgency.color,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}>
                  {urgency.label}
                </span>
              ) : (
                <span style={{ fontSize: '0.64rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--text-muted)', border: '1px solid var(--mm-border)', borderRadius: 999, padding: '2px 8px' }}>
                  ⏸ PAUSED
                </span>
              )}

              {rule.is_variable && (
                <span style={{
                  fontSize: '0.63rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  padding: '2px 7px',
                  borderRadius: 6,
                  background: 'rgba(91, 141, 239, 0.1)',
                  border: '1px solid rgba(91, 141, 239, 0.24)',
                  color: '#93c5fd',
                }}>
                  Variable {history6.length > 0 ? `(${history6.length}mo avg)` : 'est.'}
                </span>
              )}

              {variancePct !== 0 && Math.abs(variancePct) >= 5 && (
                <span style={{
                  fontSize: '0.62rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  padding: '2px 6px',
                  borderRadius: 6,
                  background: variancePct > 0 ? 'rgba(248, 113, 113, 0.1)' : 'rgba(52, 211, 153, 0.1)',
                  color: variancePct > 0 ? '#f87171' : '#34d399',
                }} title="Latest payment vs historical average">
                  {variancePct > 0 ? `+${variancePct}%` : `${variancePct}%`} vs avg
                </span>
              )}
            </div>

            {/* Clean Metadata Row */}
            <div style={{ fontSize: '0.73rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', marginTop: 4, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span>{rule.frequency || 'Monthly'}</span>
              <span>·</span>
              <span style={{ color: !isPaidThisMonth && urgency.level === 'overdue' ? '#f87171' : 'var(--text-secondary)', fontWeight: 500 }}>
                {isFlexible ? `Flexible (${rule.flexible_window || 'Anytime'})` : `Day ${rule.day_of_month}`}
              </span>
              {acct && (
                <>
                  <span>·</span>
                  <span>🏦 {isTransfer && destAcct ? `${acct.name} → ${destAcct.name}` : acct.name}</span>
                </>
              )}
              {isPaidThisMonth && rule.last_paid_date && (
                <>
                  <span>·</span>
                  <span style={{ color: '#10b981', fontWeight: 600 }}>Paid on {rule.last_paid_date}</span>
                </>
              )}
              {(rule.min_amount > 0 || rule.max_amount > 0) && (
                <>
                  <span>·</span>
                  <span>Range: {formatCurrency(rule.min_amount || 0)}–{formatCurrency(rule.max_amount || effectiveAmt)}</span>
                </>
              )}
              <span>·</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  haptic();
                  setSelectedRuleForHistoryId(rule.id);
                }}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  color: 'var(--mm-accent, #5b8def)',
                  fontSize: '0.73rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                History ({allHistoryCount})
              </button>
            </div>

            {/* Linked Loan Telemetry */}
            {linkedLoan && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 5, fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                <span>Principal: <strong>{formatCurrency(loanPrincipal)}</strong> ({loanApr}% APR)</span>
                {loanMonthlyInt > 0 && <span>· Interest: ~{formatCurrency(loanMonthlyInt)}/mo</span>}
                {loanAccrued > 0 && <span style={{ color: '#f87171' }}>· Accrued: {formatCurrency(loanAccrued)}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Mini 6-Month Spark-Bars + Inline Estimate Editor + High-Clarity Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
          {/* 6-Month Mini Spark-Bars */}
          {history6.length > 0 && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                setSelectedRuleForHistoryId(rule.id);
              }}
              title={`Last ${history6.length} payment(s): ${history6.map(h => `${h.month || h.date?.slice(0, 7) || ''}: ${formatCurrency(h.amount)}`).join(' | ')}`}
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 3,
                height: 28,
                padding: '3px 6px',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))',
              }}
            >
              {history6.map((h, i) => {
                const val = parseFloat(h.amount) || 0;
                const hPct = Math.max(22, Math.round((val / maxHistAmt) * 100));
                const isLatest = i === history6.length - 1;
                return (
                  <div
                    key={i}
                    style={{
                      width: 5,
                      height: `${hPct}%`,
                      borderRadius: 2,
                      background: isLatest ? (isPaidThisMonth ? '#10b981' : '#5b8def') : 'rgba(148, 163, 184, 0.45)',
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Amount + 1-Click Inline Estimate Editor */}
          <div style={{ textAlign: 'right', minWidth: 115 }} onClick={e => e.stopPropagation()}>
            {isEditingEst ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  step="any"
                  value={editingEstVal}
                  onChange={e => setEditingEstVal(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveInlineEstimate(rule, e);
                    if (e.key === 'Escape') setEditingEstId(null);
                  }}
                  autoFocus
                  style={{ width: 92, padding: '0.22rem 0.45rem', fontSize: '0.82rem', borderRadius: 6 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  title="Save estimate"
                  onClick={e => saveInlineEstimate(rule, e)}
                  style={{ color: '#10b981' }}
                >
                  <Check size={14} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  title="Cancel"
                  onClick={() => setEditingEstId(null)}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5 }}>
                  <span style={{
                    fontWeight: 800,
                    fontFamily: 'Inter, sans-serif',
                    fontSize: '1.02rem',
                    color: isPaidThisMonth ? '#10b981' : typeColor,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {isIncome ? '+' : '-'}{rule.is_variable ? '~' : ''}{formatCurrency(effectiveAmt)}
                  </span>
                  <button
                    type="button"
                    title="Quick-edit monthly estimate"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingEstId(rule.id);
                      setEditingEstVal(String(effectiveAmt || ''));
                    }}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      padding: 2,
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.72rem',
                      lineHeight: 1,
                    }}
                  >
                    ✎
                  </button>
                </div>
                <div style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', marginTop: 1 }}>
                  {isPaidThisMonth && rule.last_paid_amount
                    ? `Paid ${formatCurrency(rule.last_paid_amount)}`
                    : `${freqLabel(rule.frequency)} · ~${formatCurrency(Math.round(monthly))}/mo`}
                </div>
              </>
            )}
          </div>

          {!rule.paused && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className={isPaidThisMonth ? 'btn btn-secondary' : 'btn btn-primary'}
                onClick={(e) => {
                  e.stopPropagation();
                  openPayRuleModal(rule);
                }}
                style={{
                  padding: '0.42rem 0.85rem',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.32rem',
                  whiteSpace: 'nowrap',
                  ...(isPaidThisMonth ? {} : {
                    background: urgency.level === 'overdue'
                      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                      : undefined,
                  }),
                }}
              >
                <Zap size={13} />
                {isPaidThisMonth
                  ? (isIncome ? 'Record Again' : 'Pay Again')
                  : (isIncome ? 'Receive Now' : 'Pay Now')}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleRulePaidThisMonth(rule);
                }}
                style={{
                  padding: '0.42rem 0.72rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  borderColor: isPaidThisMonth ? 'rgba(245, 158, 11, 0.35)' : 'rgba(16, 185, 129, 0.38)',
                  color: isPaidThisMonth ? '#fbbf24' : '#34d399',
                  background: isPaidThisMonth ? 'rgba(245, 158, 11, 0.08)' : 'rgba(16, 185, 129, 0.1)',
                }}
                title={isPaidThisMonth ? 'Undo paid status and mark as due this month' : 'Mark as already paid this month without deducting from an account'}
              >
                {isPaidThisMonth ? '↺ Mark Unpaid' : '✓ Mark Paid'}
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.2rem', flexShrink: 0 }}>
            <button
              className="icon-btn"
              title={rule.paused ? 'Resume' : 'Pause'}
              onClick={(e) => {
                e.stopPropagation();
                togglePause(rule);
              }}
            >
              {rule.paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              className="icon-btn"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(rule);
              }}
            >
              <Edit2 size={14} />
            </button>
            <button
              className="icon-btn"
              title="Delete"
              style={{ color: 'var(--danger)' }}
              onClick={(e) => {
                e.stopPropagation();
                setConfirm({ open: true, id: rule.id });
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </motion.div>
    );
  };

  const unpaidBills = useMemo(() => (bills || []).filter(b => !b.paid), [bills]);

  return (
    <PageWrapper>
      <div>
        {/* Clean Minimalist Header */}
        <div className="page-header" style={{ marginBottom: '1.15rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.65rem', fontWeight: 700 }}>Recurring & Monthly Reminders</h1>
            <p style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.76rem', marginTop: 4 }}>
              Reminder-only monthly commitments, variable bills & loan schedules — never auto-deducted
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/bills')}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.76rem' }}
              title="Open scheduled bills, subscription detector & burn-rate audit"
            >
              <Bell size={14} /> Bills & Subscriptions {unpaidBills.length > 0 ? `(${unpaidBills.length})` : ''}
            </button>
            {cycleStats.unpaidCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleMarkAllStartNextMonth}
                style={{ fontSize: '0.75rem', borderColor: 'rgba(16, 185, 129, 0.35)', color: '#34d399' }}
                title="Mark all current month reminders as paid without deducting from any account"
              >
                ✓ Mark All Paid This Month
              </button>
            )}
            {cycleStats.paidCount > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetMonthCycle}
                style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                title="Reset all reminders to Unpaid / Due for this month"
              >
                <RotateCcw size={13} /> Reset Cycle
              </button>
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => openAddLoanModal()}
              style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}
            >
              <Landmark size={14} /> Track Loan
            </button>
            <button className="btn btn-primary" onClick={() => openAdd()} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Plus size={15} /> Add Reminder
            </button>
            {rules.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setClearAllConfirm(true)}
                style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
                title="Remove all recurring rules"
              >
                <Trash2 size={13} /> Clear All
              </button>
            )}
          </div>
        </div>

        {loading ? <SkeletonLoader rows={4} height={80} /> : (
          <>
            {/* HERO MONTHLY SETTLEMENT STATUS BANNER (Paid vs. Unpaid At-a-Glance) */}
            {activeRules.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                style={{
                  marginBottom: '1rem',
                  padding: '1.15rem 1.35rem',
                  borderRadius: 16,
                  background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.88) 0%, rgba(15, 23, 42, 0.62) 100%)',
                  border: '1px solid var(--mm-border, rgba(255,255,255,0.1))',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.22)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1.15rem' }}>
                  {/* Animated Radial Settlement Ring */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 250px' }}>
                    <div style={{ position: 'relative', width: 74, height: 74, flexShrink: 0 }}>
                      <svg width="74" height="74" viewBox="0 0 74 74" style={{ transform: 'rotate(-90deg)' }}>
                        <circle
                          cx="37"
                          cy="37"
                          r="30"
                          fill="none"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="7"
                        />
                        <motion.circle
                          cx="37"
                          cy="37"
                          r="30"
                          fill="none"
                          stroke={cycleStats.paidPct === 100 ? '#10b981' : '#34d399'}
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeDasharray={2 * Math.PI * 30}
                          initial={{ strokeDashoffset: 2 * Math.PI * 30 }}
                          animate={{ strokeDashoffset: (2 * Math.PI * 30) * (1 - cycleStats.paidPct / 100) }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </svg>
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Inter, sans-serif',
                      }}>
                        <span style={{ fontSize: '0.95rem', fontWeight: 800, color: cycleStats.paidPct === 100 ? '#10b981' : 'var(--text-primary)' }}>
                          {cycleStats.paidPct}%
                        </span>
                        <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Settled
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        {currentMonth} Monthly Settlement Status
                      </div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                        {cycleStats.paidCount} of {cycleStats.totalCount} Paid
                        {cycleStats.unpaidCount > 0 ? (
                          <span style={{ color: '#fbbf24', fontWeight: 700, fontSize: '0.92rem', marginLeft: 8 }}>
                            · {cycleStats.unpaidCount} Still Due
                          </span>
                        ) : (
                          <span style={{ color: '#10b981', fontWeight: 700, fontSize: '0.92rem', marginLeft: 8 }}>
                            · 🎉 All Settled!
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <span>Monthly Est: <strong>{formatCurrency(Math.round(safeToSpendData.nextMonthRecurringTotal || 0))}/mo</strong></span>
                        <span>·</span>
                        <span>Safe Daily: <strong style={{ color: 'var(--mm-accent, #5b8def)' }}>{formatCurrency(Math.round(safeToSpendData.strictDailySpend))}/d</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Two Giant High-Contrast Status Scorecards: UNPAID vs PAID */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', flex: '2 1 460px' }}>
                    {/* UNPAID / DUE SCORECARD */}
                    <div
                      onClick={() => setFilterTab(filterTab === 'unpaid' ? 'all' : 'unpaid')}
                      style={{
                        cursor: 'pointer',
                        padding: '0.85rem 1rem',
                        borderRadius: 12,
                        background: cycleStats.unpaidCount > 0
                          ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.14) 0%, rgba(239, 68, 68, 0.06) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${filterTab === 'unpaid' ? '#f59e0b' : cycleStats.unpaidCount > 0 ? 'rgba(245, 158, 11, 0.38)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.6px', color: cycleStats.unpaidCount > 0 ? '#fbbf24' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Clock size={13} /> ⏳ UNPAID / DUE THIS MONTH
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: cycleStats.unpaidCount > 0 ? 'rgba(245, 158, 11, 0.22)' : 'rgba(255,255,255,0.06)',
                          color: cycleStats.unpaidCount > 0 ? '#fbbf24' : 'var(--text-muted)',
                        }}>
                          {cycleStats.unpaidCount} item{cycleStats.unpaidCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: cycleStats.unpaidCount > 0 ? '#fbbf24' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                        <AnimatedCounter value={Math.round(safeToSpendData.unpaidRecurringTotal)} formatter={formatCurrency} />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {cycleStats.overdueCount > 0 && (
                          <span style={{ color: '#f87171', fontWeight: 700 }}>🚨 {cycleStats.overdueCount} Overdue</span>
                        )}
                        {cycleStats.dueSoonCount > 0 && (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>⚡ {cycleStats.dueSoonCount} Due Soon</span>
                        )}
                        {cycleStats.unpaidCount === 0 && (
                          <span style={{ color: '#10b981', fontWeight: 600 }}>✓ Nothing left to pay this month</span>
                        )}
                        {cycleStats.unpaidCount > 0 && cycleStats.overdueCount === 0 && cycleStats.dueSoonCount === 0 && (
                          <span>Click to filter unpaid items</span>
                        )}
                      </div>
                    </div>

                    {/* PAID / SETTLED SCORECARD */}
                    <div
                      onClick={() => setFilterTab(filterTab === 'paid' ? 'all' : 'paid')}
                      style={{
                        cursor: 'pointer',
                        padding: '0.85rem 1rem',
                        borderRadius: 12,
                        background: cycleStats.paidCount > 0
                          ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0.04) 100%)'
                          : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${filterTab === 'paid' ? '#10b981' : cycleStats.paidCount > 0 ? 'rgba(16, 185, 129, 0.38)' : 'rgba(255,255,255,0.08)'}`,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.6px', color: '#34d399', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <CheckCircle2 size={13} /> ✅ PAID / SETTLED THIS MONTH
                        </span>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 999,
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34d399',
                        }}>
                          {cycleStats.paidCount} item{cycleStats.paidCount === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', fontVariantNumeric: 'tabular-nums' }}>
                        <AnimatedCounter value={Math.round(safeToSpendData.paidRecurringThisMonth || cycleStats.paidAmount)} formatter={formatCurrency} />
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {cycleStats.paidLedgerCount > 0 && (
                          <span style={{ color: '#34d399', fontWeight: 600 }}>✓ {cycleStats.paidLedgerCount} Recorded in Ledger</span>
                        )}
                        {cycleStats.paidMarkedCount > 0 && (
                          <span>☑️ {cycleStats.paidMarkedCount} Marked Paid</span>
                        )}
                        {cycleStats.paidCount === 0 && (
                          <span>No reminders marked paid yet this month</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Animated Dual-Tone Progress Bar */}
                <div style={{ marginTop: '0.95rem' }}>
                  <div style={{
                    height: 8,
                    borderRadius: 999,
                    background: 'rgba(245, 158, 11, 0.2)',
                    overflow: 'hidden',
                    display: 'flex',
                  }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cycleStats.paidPct}%` }}
                      transition={{ duration: 0.7, ease: 'easeOut' }}
                      style={{
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981, #34d399)',
                        borderRadius: 999,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: '0.69rem', color: 'var(--text-muted)', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span>
                      <strong style={{ color: '#34d399' }}>✅ {cycleStats.paidCount} Paid</strong> · <strong style={{ color: '#fbbf24' }}>⏳ {cycleStats.unpaidCount} Unpaid</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPlanner(v => !v)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--mm-accent, #5b8def)',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {showPlanner ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      {showPlanner ? 'Hide Daily Safe-to-Spend Planner' : 'Open Daily Safe-to-Spend Planner'}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            <InsightRecurring rules={rules} currentMonth={currentMonth} />

            {/* Account Funding Coverage Strip (Liquidity Guard) */}
            {accountCoverage.items.length > 0 && (
              <div style={{
                marginBottom: '0.95rem',
                padding: '0.65rem 0.95rem',
                borderRadius: 12,
                background: 'var(--mm-bg-surface, rgba(255,255,255,0.02))',
                border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                display: 'flex',
                alignItems: 'center',
                gap: '0.55rem',
                flexWrap: 'wrap',
              }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <ShieldCheck size={14} style={{ color: '#34d399' }} /> Account Funding Check:
                </span>
                {accountCoverage.items.map(item => (
                  <span
                    key={item.id}
                    style={{
                      fontSize: '0.69rem',
                      fontWeight: 600,
                      padding: '3px 9px',
                      borderRadius: 999,
                      background: item.covered ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.14)',
                      border: `1px solid ${item.covered ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.4)'}`,
                      color: item.covered ? '#34d399' : '#f87171',
                    }}
                  >
                    {item.covered
                      ? `✓ ${item.name}: covers ${formatCurrency(item.dueAmount)} due (${item.count})`
                      : `⚠️ ${item.name}: ${formatCurrency(item.dueAmount)} due · Short by ${formatCurrency(item.shortfall)}`}
                  </span>
                ))}
              </div>
            )}

            {/* Smart Auto-Detected Recurring Candidates from Transaction Ledger */}
            <AnimatePresence>
              {detectedCandidates.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    marginBottom: '1rem',
                    padding: '0.85rem 1.05rem',
                    borderRadius: 12,
                    background: 'linear-gradient(135deg, rgba(91, 141, 239, 0.1) 0%, rgba(16, 185, 129, 0.05) 100%)',
                    border: '1px solid rgba(91, 141, 239, 0.3)',
                  }}
                >
                  <div style={{ fontSize: '0.73rem', fontWeight: 700, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.55rem' }}>
                    <Sparkles size={14} /> Smart Ledger Detector — Found {detectedCandidates.length} Monthly Pattern{detectedCandidates.length === 1 ? '' : 's'} Not Yet in Reminders
                  </div>
                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap' }}>
                    {detectedCandidates.map(cand => (
                      <div
                        key={cand.key}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.55rem',
                          padding: '0.4rem 0.7rem',
                          borderRadius: 10,
                          background: 'rgba(15, 23, 42, 0.65)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          fontSize: '0.73rem',
                        }}
                      >
                        <span>{getCategoryEmoji(cand.category)} <strong>{cand.notes || cand.category}</strong></span>
                        <span style={{ color: 'var(--text-muted)' }}>~{formatCurrency(cand.amount)}/mo · Day {cand.day_of_month} ({cand.count}x)</span>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => handleAcceptCandidate(cand)}
                          style={{ padding: '0.2rem 0.55rem', fontSize: '0.68rem' }}
                        >
                          + Track
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDismissCandidate(cand.key)}
                          title="Dismiss suggestion"
                          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Expandable Safe-to-Spend & Goal Savings Planner */}
            <AnimatePresence>
              {showPlanner && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ overflow: 'hidden' }}
                >
                  <SafeToSpendCard safeToSpendData={safeToSpendData} hideNavLinks />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Compact 1-Tap Quick Add Presets */}
            <div style={{
              marginBottom: '1.15rem',
              padding: '0.65rem 0.9rem',
              borderRadius: 10,
              background: 'var(--mm-bg-surface, rgba(255,255,255,0.02))',
              border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '0.2rem' }}>
                Quick Add:
              </span>
              <button
                type="button"
                onClick={() => openAddLoanModal()}
                style={{
                  padding: '0.26rem 0.6rem',
                  borderRadius: 6,
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  color: '#f59e0b',
                  fontSize: '0.7rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + 🪙 Loan / Debt
              </button>
              {QUICK_PRESETS.filter(p => p.type !== 'Loan Payment').map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => openAdd(p)}
                  style={{
                    padding: '0.26rem 0.6rem',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                    color: 'var(--text-secondary)',
                    fontSize: '0.7rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  + {p.label}
                </button>
              ))}
            </div>

            {/* Filter Tabs + View Mode Toggle + Sort Selector + Live Search */}
            {(rules.length > 0 || bills.length > 0) && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: `All Active (${activeRules.length})` },
                    { id: 'unpaid', label: `⏳ Unpaid / Due (${activeRules.filter(r => r.last_applied_month !== currentMonth).length})` },
                    { id: 'paid', label: `✅ Paid (${activeRules.filter(r => r.last_applied_month === currentMonth).length})` },
                    { id: 'variable', label: `Variable (${activeRules.filter(r => r.is_variable).length})` },
                    { id: 'flexible', label: `Flexible Date (${activeRules.filter(r => (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible').length})` },
                    { id: 'gold', label: `Loans (${activeRules.filter(r => r.loan_id || r.type === 'Loan Payment').length})` },
                    { id: 'calendar', label: '📅 Calendar View' },
                  ].map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setFilterTab(t.id)}
                      style={{
                        padding: '0.34rem 0.72rem',
                        borderRadius: 8,
                        border: `1px solid ${filterTab === t.id ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                        background: filterTab === t.id ? 'rgba(91,141,239,0.14)' : 'transparent',
                        color: filterTab === t.id ? 'var(--mm-accent, #5b8def)' : 'var(--text-secondary)',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {/* Split vs Unified List Toggle */}
                  {filterTab !== 'calendar' && (
                    <div style={{ display: 'flex', borderRadius: 8, border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.1))', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setLayoutMode('split')}
                        title="Split into Unpaid vs Paid sections"
                        style={{
                          padding: '0.32rem 0.6rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: layoutMode === 'split' ? 'rgba(91,141,239,0.18)' : 'transparent',
                          color: layoutMode === 'split' ? 'var(--mm-accent, #5b8def)' : 'var(--text-muted)',
                        }}
                      >
                        <Layers size={13} /> Split Paid/Due
                      </button>
                      <button
                        type="button"
                        onClick={() => setLayoutMode('list')}
                        title="Unified list view"
                        style={{
                          padding: '0.32rem 0.6rem',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          background: layoutMode === 'list' ? 'rgba(91,141,239,0.18)' : 'transparent',
                          color: layoutMode === 'list' ? 'var(--mm-accent, #5b8def)' : 'var(--text-muted)',
                        }}
                      >
                        <List size={13} /> Flat List
                      </button>
                    </div>
                  )}

                  {/* Sort Dropdown */}
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value)}
                    aria-label="Sort recurring reminders"
                    style={{ padding: '0.34rem 0.6rem', fontSize: '0.73rem', borderRadius: 8 }}
                  >
                    <option value="urgency">Sort: Urgency & Due Date</option>
                    <option value="amount_desc">Sort: Amount (High → Low)</option>
                    <option value="amount_asc">Sort: Amount (Low → High)</option>
                    <option value="name_asc">Sort: Name (A → Z)</option>
                  </select>

                  <input
                    type="search"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search reminders…"
                    aria-label="Filter recurring reminders"
                    style={{ minWidth: 190, maxWidth: 240, padding: '0.34rem 0.7rem', fontSize: '0.75rem', borderRadius: 8 }}
                  />
                </div>
              </div>
            )}

            {/* Batch Multi-Action Bar */}
            <AnimatePresence>
              {selectedIds.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  style={{
                    marginBottom: '1rem',
                    padding: '0.65rem 1rem',
                    borderRadius: 12,
                    background: 'rgba(91, 141, 239, 0.14)',
                    border: '1px solid rgba(91, 141, 239, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '0.6rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    <CheckSquare size={15} style={{ color: 'var(--mm-accent, #5b8def)' }} />
                    <span>{selectedIds.length} reminder{selectedIds.length === 1 ? '' : 's'} selected</span>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(unpaidFilteredRules.map(r => String(r.id)))}
                      style={{ background: 'none', border: 'none', color: '#fbbf24', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Select All Due ({unpaidFilteredRules.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedIds(filteredActiveRules.map(r => String(r.id)))}
                      style={{ background: 'none', border: 'none', color: 'var(--mm-accent, #5b8def)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Select All ({filteredActiveRules.length})
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleBatchMarkStatus(true)}
                      style={{ padding: '0.32rem 0.7rem', fontSize: '0.72rem', background: '#10b981', borderColor: '#10b981' }}
                    >
                      ✓ Mark Selected Paid
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleBatchMarkStatus(false)}
                      style={{ padding: '0.32rem 0.7rem', fontSize: '0.72rem', color: '#fbbf24', borderColor: 'rgba(245,158,11,0.4)' }}
                    >
                      ⏳ Mark Selected Unpaid
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleBatchTogglePause}
                      style={{ padding: '0.32rem 0.7rem', fontSize: '0.72rem' }}
                    >
                      ⏸ Pause / Resume
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setSelectedIds([])}
                      style={{ padding: '0.32rem 0.65rem', fontSize: '0.72rem' }}
                    >
                      Clear
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Empty state */}
            {rules.length === 0 && bills.length === 0 && (
              <div className="bento-item col-span-12" style={{ alignItems: 'center', justifyContent: 'center', padding: '3rem 2rem', textAlign: 'center', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(91,141,239,0.1)', border: '1px solid rgba(91,141,239,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <RefreshCw size={22} style={{ color: 'var(--mm-accent, #5b8def)' }} />
                </div>
                <div>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', margin: '0 0 0.3rem' }}>
                    No Monthly Reminders Added Yet
                  </p>
                  <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0, maxWidth: 460 }}>
                    Add recurring monthly bills (Electricity, Internet, Rent) or link an active loan to track monthly payments and reserve cash in your Daily Safe-to-Spend.
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => openAddLoanModal()}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <Landmark size={15} /> Track Loan Payment
                  </button>
                  <button className="btn btn-primary" onClick={() => openAdd()}>
                    <Plus size={15} /> Add Monthly Reminder
                  </button>
                </div>
              </div>
            )}

            {/* Unified Monthly Calendar View */}
            {filterTab === 'calendar' ? (() => {
              const today = new Date();
              const year = today.getFullYear();
              const month = today.getMonth();
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const cells = [];
              for (let i = 0; i < firstDay; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
              const itemsByDay = {};
              const flexibleItems = [];

              activeRules.forEach(r => {
                const isFlex = (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) === 'flexible';
                const paid = r.last_applied_month === currentMonth;
                const amt = getRuleEffectiveAmount(r);
                if (isFlex || !r.day_of_month) {
                  flexibleItems.push({ id: `rule-${r.id}`, name: r.name || r.category, amount: amt, paid, rule: r });
                } else {
                  const dom = Math.min(parseInt(r.day_of_month, 10) || 1, daysInMonth);
                  if (!itemsByDay[dom]) itemsByDay[dom] = [];
                  itemsByDay[dom].push({ id: `rule-${r.id}`, name: r.name || r.category, amount: amt, paid, rule: r });
                }
              });

              (bills || []).forEach(b => {
                if (b.due_date?.startsWith(monthStr)) {
                  const dom = parseInt(b.due_date.slice(8, 10), 10);
                  if (!itemsByDay[dom]) itemsByDay[dom] = [];
                  itemsByDay[dom].push({ id: `bill-${b.id}`, name: b.name, amount: b.amount, paid: Boolean(b.paid), bill: b });
                }
              });

              return (
                <div className="bento-item col-span-12" style={{ flexDirection: 'column', padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Calendar size={16} style={{ color: 'var(--accent-primary)' }} />
                      {today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — Commitments Calendar
                    </div>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Fixed-date reminders + scheduled bills</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '0.35rem', marginBottom: '0.4rem' }}>
                    {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
                      <div key={d} style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.62rem', letterSpacing: '1px', color: 'var(--text-muted)', textAlign: 'center', padding: '0.3rem 0' }}>{d}</div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '0.35rem' }}>
                    {cells.map((day, idx) => {
                      const dayItems = day ? (itemsByDay[day] || []) : [];
                      const isToday = day === today.getDate();
                      return (
                        <div key={idx} style={{
                          minHeight: 72, borderRadius: 8, padding: '0.4rem',
                          background: !day ? 'transparent' : isToday ? 'var(--bg-surface-hover)' : 'var(--bg-surface)',
                          border: !day ? 'none' : isToday ? '1px solid var(--accent-primary)' : '1px solid var(--mm-border-subtle, rgba(255,255,255,0.06))',
                        }}>
                          {day && (
                            <>
                              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--accent-primary)' : 'var(--text-muted)', marginBottom: '0.25rem' }}>{day}</div>
                              {dayItems.map(item => (
                                <div key={item.id} onClick={() => item.rule ? openPayRuleModal(item.rule) : navigate('/bills')} style={{
                                  fontSize: '0.64rem', fontWeight: 600, padding: '0.15rem 0.35rem', borderRadius: 4, marginBottom: 2,
                                  cursor: 'pointer',
                                  background: item.paid ? 'rgba(52,211,153,0.12)' : 'rgba(245,158,11,0.14)',
                                  color: item.paid ? '#34d399' : '#f59e0b',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {item.paid ? '✓ ' : '⏳ '}{item.name}
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {flexibleItems.length > 0 && (
                    <div style={{ marginTop: '1.15rem', paddingTop: '1rem', borderTop: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        Flexible Monthly Window ({flexibleItems.length})
                      </div>
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        {flexibleItems.map(item => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openPayRuleModal(item.rule)}
                            style={{
                              padding: '0.3rem 0.65rem',
                              borderRadius: 6,
                              border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.1))',
                              background: item.paid ? 'rgba(52,211,153,0.1)' : 'var(--bg-surface)',
                              color: item.paid ? '#34d399' : 'var(--text-primary)',
                              fontSize: '0.72rem',
                              cursor: 'pointer',
                            }}
                          >
                            {item.paid ? '✅ ' : '⏳ '}{item.name} ({formatCurrency(item.amount)})
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })() : (
              <>
                {/* SPLIT VIEW: Unpaid / Due This Month vs. Paid / Settled This Month */}
                {layoutMode === 'split' && filterTab !== 'paid' && filterTab !== 'unpaid' && filteredActiveRules.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginBottom: '1.5rem' }}>
                    {/* SECTION 1: UNPAID / DUE THIS MONTH */}
                    <div style={{
                      borderRadius: 16,
                      padding: '1rem 1.15rem',
                      background: unpaidFilteredRules.length > 0
                        ? 'rgba(245, 158, 11, 0.035)'
                        : 'rgba(16, 185, 129, 0.04)',
                      border: `1px solid ${unpaidFilteredRules.length > 0 ? 'rgba(245, 158, 11, 0.24)' : 'rgba(16, 185, 129, 0.25)'}`,
                    }}>
                      <div
                        onClick={() => setCollapsedSections(s => ({ ...s, unpaid: !s.unpaid }))}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          marginBottom: collapsedSections.unpaid || unpaidFilteredRules.length === 0 ? 0 : '0.85rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            letterSpacing: '0.7px',
                            textTransform: 'uppercase',
                            color: unpaidFilteredRules.length > 0 ? '#fbbf24' : '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            {unpaidFilteredRules.length > 0 ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
                            {unpaidFilteredRules.length > 0
                              ? `⏳ Unpaid / Due This Month (${unpaidFilteredRules.length})`
                              : '🎉 All Monthly Reminders Paid & Settled This Month!'}
                          </span>
                          {unpaidFilteredRules.length > 0 && (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 9px',
                              borderRadius: 999,
                              background: 'rgba(245, 158, 11, 0.16)',
                              color: '#fbbf24',
                            }}>
                              Remaining Due: {formatCurrency(Math.round(unpaidFilteredRules.reduce((s, r) => s + (['Expense', 'Loan Payment'].includes(r.type) ? freqMonthly(r) : 0), 0)))}
                            </span>
                          )}
                        </div>
                        {unpaidFilteredRules.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={e => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setSelectedIds(unpaidFilteredRules.map(r => String(r.id)))}
                              style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              Select All Due
                            </button>
                            <button
                              type="button"
                              onClick={() => setCollapsedSections(s => ({ ...s, unpaid: !s.unpaid }))}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              {collapsedSections.unpaid ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                          </div>
                        )}
                      </div>

                      <AnimatePresence initial={false}>
                        {!collapsedSections.unpaid && unpaidFilteredRules.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', overflow: 'hidden' }}
                          >
                            {unpaidFilteredRules.map((rule, idx) => renderRuleCard(rule, idx))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* SECTION 2: PAID / SETTLED THIS MONTH */}
                    <div style={{
                      borderRadius: 16,
                      padding: '1rem 1.15rem',
                      background: 'rgba(16, 185, 129, 0.035)',
                      border: '1px solid rgba(16, 185, 129, 0.24)',
                    }}>
                      <div
                        onClick={() => setCollapsedSections(s => ({ ...s, paid: !s.paid }))}
                        style={{
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                          marginBottom: collapsedSections.paid || paidFilteredRules.length === 0 ? 0 : '0.85rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            letterSpacing: '0.7px',
                            textTransform: 'uppercase',
                            color: '#34d399',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}>
                            <CheckCircle2 size={15} />
                            ✅ Paid & Settled This Month ({paidFilteredRules.length})
                          </span>
                          {paidFilteredRules.length > 0 && (
                            <span style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '2px 9px',
                              borderRadius: 999,
                              background: 'rgba(16, 185, 129, 0.16)',
                              color: '#34d399',
                            }}>
                              Settled: {formatCurrency(Math.round(paidFilteredRules.reduce((s, r) => s + (['Expense', 'Loan Payment'].includes(r.type) ? ((!r.last_paid_marked_only && Number(r.last_paid_amount) > 0) ? Number(r.last_paid_amount) : freqMonthly(r)) : 0), 0)))}
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {paidFilteredRules.length === 0 && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>No items marked paid yet</span>
                          )}
                          {paidFilteredRules.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCollapsedSections(s => ({ ...s, paid: !s.paid }));
                              }}
                              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              {collapsedSections.paid ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <AnimatePresence initial={false}>
                        {!collapsedSections.paid && paidFilteredRules.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', overflow: 'hidden' }}
                          >
                            {paidFilteredRules.map((rule, idx) => renderRuleCard(rule, idx))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                ) : (
                  /* Flat / Filtered Active Rules List */
                  filteredActiveRules.length > 0 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.65rem', textTransform: 'uppercase' }}>
                        {filterTab === 'unpaid'
                          ? `⏳ Unpaid / Due Reminders (${filteredActiveRules.length})`
                          : filterTab === 'paid'
                            ? `✅ Paid Reminders This Month (${filteredActiveRules.length})`
                            : `Active Reminders (${filteredActiveRules.length})`}
                      </div>
                      <motion.div layout style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                        <AnimatePresence>
                          {filteredActiveRules.map((rule, idx) => renderRuleCard(rule, idx))}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  )
                )}

                {/* Scheduled Bills from /bills */}
                {unpaidBills.length > 0 && (filterTab === 'all' || filterTab === 'unpaid') && (
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '1px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                        Upcoming Scheduled Bills ({unpaidBills.length})
                      </div>
                      <button
                        type="button"
                        onClick={() => navigate('/bills')}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Manage in Bills & Subscriptions →
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {unpaidBills.slice(0, 6).map(b => (
                        <div
                          key={b.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            padding: '0.75rem 1rem',
                            borderRadius: 10,
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-primary)' }}>
                              {getCategoryEmoji(b.category)} {b.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                              Due {b.due_date} · {b.frequency || 'Monthly'}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {formatCurrency(b.amount)}
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={async () => {
                                try {
                                  const nextBill = b.frequency && b.frequency !== 'Once'
                                    ? { ...b, ...advanceBill(b) }
                                    : { ...b, paid: true };
                                  await updateBill(b.id, nextBill);
                                  toast.success(nextBill.paid ? `${b.name} marked paid` : `${b.name} marked paid — next due ${nextBill.due_date}`);
                                  load(true);
                                } catch {
                                  toast.error('Failed to update bill');
                                }
                              }}
                              style={{ padding: '0.32rem 0.65rem', fontSize: '0.72rem' }}
                            >
                              Mark Paid
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Paused rules */}
                {pausedRules.length > 0 && (
                  <div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.68rem', fontWeight: 600, letterSpacing: '1px', color: 'var(--text-muted)', marginBottom: '0.65rem', textTransform: 'uppercase' }}>
                      Paused ({pausedRules.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {pausedRules.map((rule, idx) => renderRuleCard(rule, idx))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Smart "Pay This Month / Enter Actual Variable Bill" Modal */}
      <Modal
        isOpen={payModal.open}
        onClose={() => setPayModal(p => ({ ...p, open: false }))}
        title={
          payModal.loan && !payModal.rule
            ? `Pay Loan: ${payModal.loan.item_name || payModal.loan.name}`
            : `${payModal.rule?.type === 'Income' ? 'Receive' : 'Pay'} This Month: ${payModal.rule?.name || payModal.rule?.category || ''}`
        }
      >
        <form onSubmit={handleConfirmPayModal} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
          <div style={{
            padding: '0.7rem 0.9rem',
            borderRadius: 10,
            background: 'var(--mm-bg-elevated, rgba(255,255,255,0.03))',
            border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.45,
          }}>
            {payModal.rule?.is_variable
              ? 'Enter the exact amount for this month. If enabled below, your 3-month rolling average estimate will update automatically.'
              : payModal.loan
                ? 'This payment pays down accrued loan interest first and reduces principal with any remaining amount.'
                : 'Record this month’s transaction and mark this reminder as completed for the current month.'}
          </div>

          {/* Quick Amount Pills for Linked Loans */}
          {payModal.loan && (
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {(() => {
                const principal = parseFloat(payModal.loan.principal_amount ?? payModal.loan.principal) || 0;
                const apr = parseFloat(payModal.loan.annual_interest_rate ?? payModal.loan.apr) || 0;
                const moInt = Math.round((principal * (apr / 100)) / 12);
                const accrued = Math.round(parseFloat(payModal.loan.current_accrued_interest ?? payModal.loan.unpaid_interest ?? payModal.loan.accruedInterest) || 0);
                return (
                  <>
                    {moInt > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayModal(p => ({ ...p, amount: moInt }))}
                        style={{ padding: '0.26rem 0.6rem', borderRadius: 6, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', color: '#f59e0b', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Monthly Interest: {formatCurrency(moInt)}
                      </button>
                    )}
                    {accrued > 0 && (
                      <button
                        type="button"
                        onClick={() => setPayModal(p => ({ ...p, amount: accrued }))}
                        style={{ padding: '0.26rem 0.6rem', borderRadius: 6, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.1)', color: '#f87171', fontSize: '0.7rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Accrued Interest: {formatCurrency(accrued)}
                      </button>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                {`Actual Amount (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={payModal.amount}
                onChange={v => setPayModal(p => ({ ...p, amount: v }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Date</label>
              <input
                type="date"
                required
                value={payModal.date}
                onChange={e => setPayModal(p => ({ ...p, date: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
              {payModal.rule?.type === 'Income'
                ? 'Account to Deposit Into'
                : payModal.rule?.type === 'Transfer'
                  ? 'From Account (Source)'
                  : 'Account to Deduct From'}
            </label>
            <select
              value={payModal.account_id}
              onChange={e => setPayModal(p => ({ ...p, account_id: e.target.value }))}
              style={{ width: '100%' }}
            >
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.name} — Available: {formatCurrency(a.balance)}</option>
              ))}
              <option value="">— Do not change account balance (Mark reminder paid only) —</option>
            </select>

            {payModal.rule?.type === 'Transfer' && payModal.account_id && (
              <div style={{ marginTop: '0.65rem' }}>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                  To Account (Destination)
                </label>
                <select
                  value={payModal.to_account_id}
                  onChange={e => setPayModal(p => ({ ...p, to_account_id: e.target.value }))}
                  style={{ width: '100%' }}
                >
                  <option value="">— Select destination account —</option>
                  {accounts
                    .filter(a => String(a.id) !== String(payModal.account_id))
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.name} — Available: {formatCurrency(a.balance)}</option>
                    ))}
                </select>
              </div>
            )}

            {(() => {
              const chosenAcct = accounts.find(a => String(a.id) === String(payModal.account_id));
              const amt = parseFloat(payModal.amount) || 0;
              if (!chosenAcct) {
                return (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                    No account selected — will mark this month’s reminder as completed without changing account balances.
                  </div>
                );
              }
              const isInc = payModal.rule?.type === 'Income';
              const nextBal = isInc ? (Number(chosenAcct.balance) || 0) + amt : (Number(chosenAcct.balance) || 0) - amt;
              return (
                <div style={{
                  marginTop: 6,
                  padding: '0.45rem 0.7rem',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                  fontSize: '0.73rem',
                  color: 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.4rem',
                }}>
                  <span>
                    {isInc ? 'Crediting to' : 'Deducting from'} <strong style={{ color: 'var(--text-primary)' }}>{chosenAcct.name}</strong>
                  </span>
                  <span>
                    Projected Balance: <strong style={{ color: nextBal >= 0 ? '#34d399' : '#f87171' }}>{formatCurrency(nextBal)}</strong>
                  </span>
                </div>
              );
            })()}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Notes</label>
            <input
              value={payModal.notes}
              onChange={e => setPayModal(p => ({ ...p, notes: e.target.value }))}
              placeholder="e.g. Monthly Electricity Bill"
            />
          </div>

          {payModal.rule && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={payModal.updateEstimate}
                onChange={e => setPayModal(p => ({ ...p, updateEstimate: e.target.checked }))}
                style={{ width: 16, height: 16 }}
              />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Update future monthly estimate using 3-month rolling average
              </span>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setPayModal(p => ({ ...p, open: false }))}>
              Cancel
            </button>
            <button type="submit" disabled={payModal.saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Zap size={14} />
              {payModal.saving
                ? 'Saving…'
                : payModal.account_id
                  ? `Confirm ${payModal.rule?.type === 'Income' ? '& Deposit' : '& Deduct'} ${formatCurrency(payModal.amount || 0)}`
                  : `Mark Paid (${formatCurrency(payModal.amount || 0)})`}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add / Edit Recurring Rule Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Monthly Reminder' : 'Add Monthly Reminder'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {/* Quick Preset Chips when creating a new reminder */}
          {!editMode && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', paddingBottom: '0.35rem', borderBottom: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
              {QUICK_PRESETS.filter(p => p.type !== 'Loan Payment').map(p => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setFormData(prev => ({
                    ...prev,
                    ...p,
                    from_account_id: p.type === 'Income' ? '' : (prev.from_account_id || accounts[0]?.id || ''),
                    to_account_id: p.type === 'Income' ? (prev.to_account_id || accounts[0]?.id || '') : '',
                  }))}
                  style={{
                    padding: '0.22rem 0.55rem',
                    borderRadius: 6,
                    background: formData.name === p.name ? 'rgba(91,141,239,0.16)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${formData.name === p.name ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                    color: formData.name === p.name ? 'var(--mm-accent, #5b8def)' : 'var(--text-secondary)',
                    fontSize: '0.68rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Commitment / Bill Name</label>
            <input
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Electricity Bill, Fibre Internet, Monthly Rent"
            />
          </div>

          {/* Type & Frequency */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Type</label>
              <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                {TYPES.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      const defAcct = accounts[0]?.id || '';
                      const secAcct = accounts[1]?.id || '';
                      setFormData({
                        ...formData,
                        type: t,
                        category: t === 'Income' ? 'Salary' : t === 'Loan Payment' ? 'Gold Loan' : formData.category === 'Salary' ? 'Utilities' : formData.category,
                        from_account_id: t === 'Income' ? '' : (formData.from_account_id || defAcct),
                        to_account_id: t === 'Income' ? (formData.to_account_id || defAcct) : t === 'Transfer' ? (formData.to_account_id || secAcct) : '',
                      });
                    }}
                    style={{
                      flex: 1,
                      padding: '0.38rem 0.45rem',
                      borderRadius: 8,
                      border: `1px solid ${formData.type === t ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: formData.type === t ? 'rgba(91,141,239,0.14)' : 'transparent',
                      color: formData.type === t ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {t === 'Loan Payment' ? 'Loan' : t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Frequency</label>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                {FREQUENCIES.map(f => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormData({ ...formData, frequency: f })}
                    style={{
                      flex: 1,
                      padding: '0.38rem 0.3rem',
                      borderRadius: 8,
                      border: `1px solid ${formData.frequency === f ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      background: formData.frequency === f ? 'rgba(91,141,239,0.14)' : 'transparent',
                      color: formData.frequency === f ? 'var(--text-primary)' : 'var(--text-muted)',
                    }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Link to Active Loan when Type === 'Loan Payment' */}
          {formData.type === 'Loan Payment' && loans.filter(l => (l.status || 'Active') === 'Active').length > 0 && (
            <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.76rem', color: '#f59e0b', fontWeight: 600 }}>
                Link to Active Loan / Debt
              </label>
              <select
                value={formData.loan_id}
                onChange={e => {
                  const chosenId = e.target.value;
                  const chosenLoan = loans.find(l => String(l.id) === String(chosenId));
                  const monthlyInt = chosenLoan
                    ? Math.round(((parseFloat(chosenLoan.principal_amount) || 0) * (parseFloat(chosenLoan.annual_interest_rate) || 0) / 100) / 12)
                    : formData.amount;
                  setFormData({
                    ...formData,
                    loan_id: chosenId,
                    name: chosenLoan ? `${chosenLoan.item_name} (${chosenLoan.type || 'Loan'})` : formData.name,
                    amount: monthlyInt > 0 ? monthlyInt : formData.amount,
                  });
                }}
                style={{ width: '100%' }}
              >
                <option value="">— Standalone Loan Payment —</option>
                {loans.filter(l => (l.status || 'Active') === 'Active').map(l => {
                  const moInt = Math.round(((parseFloat(l.principal_amount) || 0) * (parseFloat(l.annual_interest_rate) || 0) / 100) / 12);
                  return (
                    <option key={l.id} value={l.id}>
                      {l.item_name} ({l.lender_name || 'Lender'}) — Principal {formatCurrency(l.principal_amount)} • Interest ~{formatCurrency(moInt)}/mo
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Schedule Mode: Flexible ("No Fixed Date") vs Fixed Day */}
          <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Payment Date Schedule
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.55rem' }}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, schedule_mode: 'flexible' })}
                style={{
                  padding: '0.45rem',
                  borderRadius: 8,
                  border: `1px solid ${formData.schedule_mode === 'flexible' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: formData.schedule_mode === 'flexible' ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: formData.schedule_mode === 'flexible' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Flexible (Anytime in Month)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, schedule_mode: 'fixed' })}
                style={{
                  padding: '0.45rem',
                  borderRadius: 8,
                  border: `1px solid ${formData.schedule_mode === 'fixed' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: formData.schedule_mode === 'fixed' ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: formData.schedule_mode === 'fixed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Fixed Day of Month
              </button>
            </div>

            {formData.schedule_mode === 'flexible' ? (
              <select
                value={formData.flexible_window}
                onChange={e => setFormData({ ...formData, flexible_window: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="Anytime">Anytime During the Month</option>
                <option value="Early (1st-10th)">Early Month (1st – 10th)</option>
                <option value="Mid (11th-20th)">Mid Month (11th – 20th)</option>
                <option value="Late (21st-31st)">Late Month (21st – End of Month)</option>
              </select>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Day of Month (1 – 28)
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={formData.day_of_month || 1}
                  onChange={e => setFormData({ ...formData, day_of_month: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Amount Mode: Variable vs Fixed */}
          <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                Amount Behavior
              </label>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_variable: true })}
                  style={{
                    padding: '0.22rem 0.55rem',
                    borderRadius: 6,
                    border: `1px solid ${formData.is_variable ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                    background: formData.is_variable ? 'rgba(91,141,239,0.12)' : 'transparent',
                    color: formData.is_variable ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.68rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Variable (Changes Monthly)
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_variable: false })}
                  style={{
                    padding: '0.22rem 0.55rem',
                    borderRadius: 6,
                    border: `1px solid ${!formData.is_variable ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                    background: !formData.is_variable ? 'rgba(91,141,239,0.12)' : 'transparent',
                    color: !formData.is_variable ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.68rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Fixed Amount
                </button>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                {formData.is_variable
                  ? `Estimated / Average Monthly Bill (${getCurrencyLabel()})`
                  : `Fixed Amount (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={formData.amount}
                onChange={v => setFormData({ ...formData, amount: v })}
              />
            </div>

            {formData.is_variable && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.6rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Min Expected (Optional)
                  </label>
                  <CurrencyInput
                    value={formData.min_amount}
                    onChange={v => setFormData({ ...formData, min_amount: v })}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                    Max Expected (Optional)
                  </label>
                  <CurrencyInput
                    value={formData.max_amount}
                    onChange={v => setFormData({ ...formData, max_amount: v })}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Category & Account Selection */}
          <div style={{ display: 'grid', gridTemplateColumns: formData.type === 'Transfer' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Category</label>
              <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ width: '100%' }}>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {formData.type !== 'Income' && accounts.length > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                  {formData.type === 'Transfer' ? 'From Account' : 'Default Account'}
                </label>
                <select value={formData.from_account_id} onChange={e => setFormData({ ...formData, from_account_id: e.target.value })} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {(formData.type === 'Income' || formData.type === 'Transfer') && accounts.length > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                  {formData.type === 'Transfer' ? 'To Account' : 'Deposit Account'}
                </label>
                <select value={formData.to_account_id} onChange={e => setFormData({ ...formData, to_account_id: e.target.value })} style={{ width: '100%' }}>
                  <option value="">— None —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Notes</label>
            <input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Account number, meter number, or reminder note…" />
          </div>

          {/* Start From Next Month (Already Paid This Month) Toggle */}
          <div style={{
            padding: '0.7rem 0.85rem',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={Boolean(formData.start_next_month)}
                onChange={e => setFormData({ ...formData, start_next_month: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {formData.start_next_month
                    ? 'Already paid this month — start reminder from next month'
                    : 'Still due this month — reserve in this month’s Safe-to-Spend'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {formData.start_next_month
                    ? 'No money is deducted or reserved for this month; activates automatically next month.'
                    : 'Reserves this amount in your current month’s Daily Safe-to-Spend allowance.'}
                </div>
              </div>
            </label>
          </div>

          {editMode && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', userSelect: 'none' }}>
              <input type="checkbox" checked={formData.paused} onChange={e => setFormData({ ...formData, paused: e.target.checked })} style={{ width: 16, height: 16 }} />
              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pause this reminder</span>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update Reminder' : 'Save Monthly Reminder'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={confirm.open} title="Delete Reminder" message="Remove this monthly reminder? Existing transactions are not affected." confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm({ open: false, id: null })} />

      <ConfirmDialog
        open={clearAllConfirm}
        title="Clear All Reminders"
        message="Remove all monthly recurring reminders? Your accounts, loans, and past transactions will not be affected."
        confirmLabel="Clear All"
        danger
        onConfirm={doClearAll}
        onCancel={() => setClearAllConfirm(false)}
      />

      {/* Dedicated "Add Loan as Monthly Payment" Modal */}
      <Modal
        isOpen={loanModalOpen}
        onClose={() => setLoanModalOpen(false)}
        title="Track Loan as Monthly Payment"
      >
        <form onSubmit={handleLoanModalSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {loans.filter(l => (l.status || 'Active') === 'Active').length > 0 && (
            <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.2rem' }}>
              <button
                type="button"
                onClick={() => setLoanForm({ ...loanForm, mode: 'existing' })}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  background: loanForm.mode === 'existing' ? 'rgba(91,141,239,0.14)' : 'transparent',
                  color: loanForm.mode === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${loanForm.mode === 'existing' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                }}
              >
                Select Existing Loan ({loans.filter(l => (l.status || 'Active') === 'Active').length})
              </button>
              <button
                type="button"
                onClick={() => setLoanForm({ ...loanForm, mode: 'new' })}
                style={{
                  flex: 1,
                  padding: '0.45rem',
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  fontSize: '0.75rem',
                  background: loanForm.mode === 'new' ? 'rgba(91,141,239,0.14)' : 'transparent',
                  color: loanForm.mode === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: `1px solid ${loanForm.mode === 'new' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                }}
              >
                + Create & Track New Loan
              </button>
            </div>
          )}

          {loanForm.mode === 'existing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                  Select Existing Loan
                </label>
                <select
                  value={loanForm.selected_loan_id}
                  onChange={e => {
                    const chosenId = e.target.value;
                    const chosenLoan = loans.find(l => String(l.id) === String(chosenId));
                    let suggested = loanForm.monthly_payment;
                    if (chosenLoan) {
                      const p = parseFloat(chosenLoan.principal_amount) || 0;
                      const r = parseFloat(chosenLoan.annual_interest_rate) || 0;
                      const moInt = Math.round((p * (r / 100)) / 12);
                      suggested = parseFloat(chosenLoan.monthly_payment) > 0 ? parseFloat(chosenLoan.monthly_payment) : (moInt > 0 ? moInt : 5000);
                    }
                    setLoanForm({
                      ...loanForm,
                      selected_loan_id: chosenId,
                      monthly_payment: suggested,
                    });
                  }}
                  style={{ width: '100%' }}
                >
                  {loans.filter(l => (l.status || 'Active') === 'Active').map(l => (
                    <option key={l.id} value={l.id}>
                      {l.item_name} ({l.lender_name || l.type || 'Loan'}) — Principal {formatCurrency(l.principal_amount)}
                    </option>
                  ))}
                </select>
              </div>

              {(() => {
                const sel = loans.find(l => String(l.id) === String(loanForm.selected_loan_id));
                if (!sel) return null;
                const p = parseFloat(sel.principal_amount) || 0;
                const apr = parseFloat(sel.annual_interest_rate) || 0;
                const moInt = Math.round((p * (apr / 100)) / 12);
                const accrued = Math.round(parseFloat(sel.current_accrued_interest ?? sel.unpaid_interest) || 0);

                return (
                  <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Principal</div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(p)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Interest Rate</div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f59e0b' }}>{apr}% APR</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Monthly Interest</div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#34d399' }}>~{formatCurrency(moInt)}/mo</div>
                    </div>
                    {accrued > 0 && (
                      <div>
                        <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Accrued Interest</div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#f87171' }}>{formatCurrency(accrued)}</div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {loanForm.mode === 'new' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Loan / Item Name</label>
                <input
                  required
                  value={loanForm.item_name}
                  onChange={e => setLoanForm({ ...loanForm, item_name: e.target.value })}
                  placeholder="e.g. 22K Gold Chain, Personal Loan, Vehicle Lease"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Loan Type</label>
                  <select value={loanForm.type} onChange={e => setLoanForm({ ...loanForm, type: e.target.value })} style={{ width: '100%' }}>
                    <option value="Gold Loan">Gold Loan</option>
                    <option value="Personal Loan">Personal Loan</option>
                    <option value="Vehicle Loan">Vehicle Loan</option>
                    <option value="Mortgage">Home / Land Loan</option>
                    <option value="Debt">Other Debt</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Lender / Bank (Optional)</label>
                  <input
                    value={loanForm.lender_name}
                    onChange={e => setLoanForm({ ...loanForm, lender_name: e.target.value })}
                    placeholder="e.g. Commercial Bank, BOC"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.7rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>{`Principal (${getCurrencyLabel()})`}</label>
                  <CurrencyInput
                    value={loanForm.principal_amount}
                    onChange={v => {
                      const p = parseFloat(v) || 0;
                      const apr = parseFloat(loanForm.annual_interest_rate) || 0;
                      const moInt = Math.round((p * (apr / 100)) / 12);
                      setLoanForm({
                        ...loanForm,
                        principal_amount: v,
                        monthly_payment: moInt > 0 ? moInt : loanForm.monthly_payment,
                      });
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Annual APR (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={loanForm.annual_interest_rate}
                    onChange={e => {
                      const apr = parseFloat(e.target.value) || 0;
                      const p = parseFloat(loanForm.principal_amount) || 0;
                      const moInt = Math.round((p * (apr / 100)) / 12);
                      setLoanForm({
                        ...loanForm,
                        annual_interest_rate: e.target.value,
                        monthly_payment: moInt > 0 ? moInt : loanForm.monthly_payment,
                      });
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Monthly Payment Amount Config */}
          <div style={{ padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.76rem', fontWeight: 600 }}>
                {`Monthly Payment to Track (${getCurrencyLabel()})`}
              </label>
              {(() => {
                let moInt = 0;
                if (loanForm.mode === 'existing') {
                  const sel = loans.find(l => String(l.id) === String(loanForm.selected_loan_id));
                  if (sel) {
                    const p = parseFloat(sel.principal_amount) || 0;
                    const r = parseFloat(sel.annual_interest_rate) || 0;
                    moInt = Math.round((p * (r / 100)) / 12);
                  }
                } else {
                  const p = parseFloat(loanForm.principal_amount) || 0;
                  const r = parseFloat(loanForm.annual_interest_rate) || 0;
                  moInt = Math.round((p * (r / 100)) / 12);
                }
                if (moInt <= 0) return null;
                return (
                  <button
                    type="button"
                    onClick={() => setLoanForm({ ...loanForm, monthly_payment: moInt })}
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: 6,
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.28)',
                      color: '#f59e0b',
                      fontSize: '0.68rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Use Monthly Interest: {formatCurrency(moInt)}
                  </button>
                );
              })()}
            </div>

            <CurrencyInput
              required
              value={loanForm.monthly_payment}
              onChange={v => setLoanForm({ ...loanForm, monthly_payment: v })}
            />
          </div>

          {/* Payment Schedule */}
          <div style={{ padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Payment Date Schedule
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setLoanForm({ ...loanForm, schedule_mode: 'flexible' })}
                style={{
                  padding: '0.42rem',
                  borderRadius: 8,
                  border: `1px solid ${loanForm.schedule_mode === 'flexible' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: loanForm.schedule_mode === 'flexible' ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: loanForm.schedule_mode === 'flexible' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Flexible (Anytime in Month)
              </button>
              <button
                type="button"
                onClick={() => setLoanForm({ ...loanForm, schedule_mode: 'fixed' })}
                style={{
                  padding: '0.42rem',
                  borderRadius: 8,
                  border: `1px solid ${loanForm.schedule_mode === 'fixed' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: loanForm.schedule_mode === 'fixed' ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: loanForm.schedule_mode === 'fixed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                  fontFamily: 'Inter, sans-serif',
                  fontSize: '0.73rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Fixed Day of Month
              </button>
            </div>

            {loanForm.schedule_mode === 'flexible' ? (
              <select
                value={loanForm.flexible_window}
                onChange={e => setLoanForm({ ...loanForm, flexible_window: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="Anytime">Anytime During the Month</option>
                <option value="Early (1st-10th)">Early Month (1st – 10th)</option>
                <option value="Mid (11th-20th)">Mid Month (11th – 20th)</option>
                <option value="Late (21st-31st)">Late Month (21st – End of Month)</option>
              </select>
            ) : (
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  Day of Month (1 – 28)
                </label>
                <input
                  type="number"
                  min="1"
                  max="28"
                  value={loanForm.day_of_month || 1}
                  onChange={e => setLoanForm({ ...loanForm, day_of_month: e.target.value })}
                />
              </div>
            )}
          </div>

          {/* Account & Notes */}
          <div style={{ display: 'grid', gridTemplateColumns: accounts.length > 0 ? '1fr 1fr' : '1fr', gap: '0.7rem' }}>
            {accounts.length > 0 && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Default Account (Optional)</label>
                <select
                  value={loanForm.from_account_id}
                  onChange={e => setLoanForm({ ...loanForm, from_account_id: e.target.value })}
                  style={{ width: '100%' }}
                >
                  <option value="">— Choose on payment —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Notes (Optional)</label>
              <input
                value={loanForm.notes}
                onChange={e => setLoanForm({ ...loanForm, notes: e.target.value })}
                placeholder="Ticket number, branch, or reference…"
              />
            </div>
          </div>

          {/* Start From Next Month Toggle */}
          <div style={{
            padding: '0.7rem 0.85rem',
            borderRadius: 10,
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
          }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
              <input
                type="checkbox"
                checked={Boolean(loanForm.start_next_month)}
                onChange={e => setLoanForm({ ...loanForm, start_next_month: e.target.checked })}
                style={{ width: 16, height: 16 }}
              />
              <div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {loanForm.start_next_month
                    ? 'Already paid this month — start reminder from next month'
                    : 'Still due this month — reserve in this month’s Safe-to-Spend'}
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {loanForm.start_next_month
                    ? 'No money is deducted or reserved for this month; starts tracking fresh next month.'
                    : 'Reserves this loan payment in your current month’s Daily Safe-to-Spend allowance.'}
                </div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setLoanModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Add Loan to Monthly Reminders
            </button>
          </div>
        </form>
      </Modal>

      {/* Recurring Payment & Monthly Activity History Modal */}
      <RecurringHistoryModal
        isOpen={!!activeRuleForHistory}
        onClose={() => setSelectedRuleForHistoryId(null)}
        rule={activeRuleForHistory}
        accounts={accounts}
        transactions={transactions}
        loans={loans}
        onPay={(r) => {
          setSelectedRuleForHistoryId(null);
          openPayRuleModal(r);
        }}
        onEdit={(r) => {
          setSelectedRuleForHistoryId(null);
          openEdit(r);
        }}
        onTogglePause={togglePause}
      />
    </PageWrapper>
  );
};

export default Recurring;
