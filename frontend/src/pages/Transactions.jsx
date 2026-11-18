import { auditStatus, summarizePayments, isActivePayment, isEditableTransaction, accountMovement } from '../utils/ledgerReporting.js';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import useLiveData from '../utils/useLiveData';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  fetchTransactions, createTransaction, updateTransaction, deleteTransaction,
  fetchAccounts, fetchLoans, getCache, invalidateCache,
  fetchRecurringTransactions, createRecurringTransaction, deleteRecurringTransaction,
  applyPendingRecurring, confirmApplyRecurring, payLoan, updateAccount
} from '../utils/api';
import { Plus, Edit2, Trash2, Search, Filter, Download, ArrowUpDown, RefreshCw, Repeat, X, Upload, Copy, Brain, FileSpreadsheet, Zap, Camera, Calendar, ChevronDown } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import FuturisticDropdown from '../components/FuturisticDropdown';
import CSVImporter from '../components/CSVImporter';
import CurrencyInput from '../components/CurrencyInput';
import ReceiptUpload from '../components/ReceiptUpload';
import ReceiptImage from '../components/ReceiptImage';
import SMSParserBox from '../components/SMSParserBox';
import TransactionPopup from '../components/TransactionPopup';
import TransactionInsights from '../components/TransactionInsights';
import '../styles/transactions.css';
import getCategoryEmoji from '../utils/categoryEmoji';
import { getRememberedNotes, getFrequentTemplates } from '../utils/noteMemory';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../utils/format';
import { auth } from '../utils/firebase';
import { detectRecurring } from '../utils/recurringDetect.js';
import { formatCurrency, getCurrencyLabel } from '../utils/format';
import { toYMD, todayYMD } from '../utils/dates';
import { getLastAccountId, rememberAccountId } from '../utils/lastAccount';

/* ─── helpers ─────────────────────────────────────────────────── */

const TYPE_COLOR = {
  Income:       'var(--success)',
  Expense:      'var(--danger)',
  Transfer:     'var(--neon-purple)',
  'Loan Payment': 'var(--warning)',
};
const TYPE_BG = {
  Income:       'var(--bg-surface)',
  Expense:      'var(--bg-surface)',
  Transfer:     'var(--bg-surface)',
  'Loan Payment':'var(--bg-surface)',
};

const SUGGESTED_CATEGORIES = [
  '🍔 Food','🚗 Transport','🏠 Rent','⚡ Utilities','🛍️ Shopping',
  '💊 Health','📚 Education','🎭 Entertainment','✈️ Travel','💰 Salary',
  '💼 Business','🐷 Savings','💳 Bills','🔧 Maintenance','📱 Phone',
];

const getCategories = () => {
  try {
    const custom = JSON.parse(localStorage.getItem('vm_custom_categories'));
    if (custom && Array.isArray(custom)) {
      return custom.map(c => typeof c === 'string' ? c : `${c.emoji || '📋'} ${c.name || 'Category'}`);
    }
  } catch {}
  return SUGGESTED_CATEGORIES;
};

// Auto-categorization keyword map
const KEYWORD_MAP = [
  { words: ['uber','lyft','taxi','grab','ola','bus','train','metro','fuel','petrol','diesel','parking','toll'], cat: 'Transport' },
  { words: ['food','restaurant','kfc','mcdonalds','pizza','burger','cafe','coffee','starbucks','zomato','swiggy','uber eat','doordash','lunch','dinner','breakfast','meal','sushi','noodle','biryani'], cat: 'Food' },
  { words: ['rent','house','apartment','flat','housing','lease','mortgage'], cat: 'Rent' },
  { words: ['electricity','water','gas','wifi','internet','broadband','utility','phone bill','mobile bill','postpaid'], cat: 'Utilities' },
  { words: ['amazon','flipkart','shopee','lazada','ebay','walmart','mall','shopping','clothes','shoes','shirt','jacket'], cat: 'Shopping' },
  { words: ['doctor','hospital','pharmacy','medicine','clinic','health','dental','eye','optical','gym','fitness'], cat: 'Health' },
  { words: ['school','tuition','college','course','book','study','exam','library','education','training'], cat: 'Education' },
  { words: ['movie','cinema','netflix','spotify','concert','game','play','entertainment','show','ticket'], cat: 'Entertainment' },
  { words: ['flight','hotel','airbnb','vacation','holiday','trip','travel','visa','passport'], cat: 'Travel' },
  { words: ['salary','paycheck','wage','income','bonus','commission'], cat: 'Salary' },
  { words: ['insurance','premium','emi','loan payment','instalment','installment'], cat: 'Bills' },
  { words: ['phone','mobile','iphone','samsung','laptop','computer','gadget','repair','service'], cat: 'Phone' },
];

const autoCategorize = (notes) => {
  if (!notes || notes.length < 2) return null;
  const lower = notes.toLowerCase();
  for (const { words, cat } of KEYWORD_MAP) {
    if (words.some(w => lower.includes(w))) return cat;
  }
  return null;
};

/* ─── Search highlight helper ───────────────────────────────────── */
const Highlight = ({ text, query }) => {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background:'rgba(0,245,255,0.25)', color:'#00f5ff', borderRadius:2, padding:'0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

/* ─── Transactions page ────────────────────────────────────────── */
const Transactions = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [transactions, setTransactions] = useState(() => getCache('transactions') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loans, setLoans] = useState(() => getCache('loans') || []);
  const [recurringRules, setRecurringRules] = useState(() => getCache('recurring') || []);
  const [pendingRecurring, setPendingRecurring] = useState([]);
  const [loading, setLoading] = useState(() => !getCache('transactions'));

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [activeTab, setActiveTab] = useState('all');
  const [isRecurring, setIsRecurring] = useState(false);
  const [confirm, setConfirm] = useState({ open: false, id: null, type: 'txn' });
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [catDropOpen, setCatDropOpen] = useState(false);
  const [noteDropOpen, setNoteDropOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [popupTx, setPopupTx] = useState(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const toolsMenuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target)) {
        setToolsMenuOpen(false);
      }
    };
    if (toolsMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('touchstart', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [toolsMenuOpen]);

  // Auto-open add modal when navigated with ?add=1 or search query ?q= / ?note=
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setIsModalOpen(true);
      setEditMode(false);
      setCurrentId(null);
      setSearchParams({}, { replace: true });
    }
    const q = searchParams.get('q') || searchParams.get('note');
    if (q) setSearchQuery(q);
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 768px)').matches);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  
  const catContainerRef = useRef(null);
  const noteContainerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (catContainerRef.current && !catContainerRef.current.contains(e.target)) {
        setCatDropOpen(false);
      }
      if (noteContainerRef.current && !noteContainerRef.current.contains(e.target)) {
        setNoteDropOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  /* filters */
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filterAccount, setFilterAccount] = useState('All');
  const [sortBy, setSortBy] = useState('Newest');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minAmt, setMinAmt] = useState('');
  const [maxAmt, setMaxAmt] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [filterTaxDeductible, setFilterTaxDeductible] = useState(false);
  const [filterHasReceipt,,] = useState(false);
  const [filterAnomalies, setFilterAnomalies] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  /* inline quick-edit state */
  const [quickEditId, setQuickEditId] = useState(null);
  const [quickCat, setQuickCat] = useState('');
  const [quickNotes, setQuickNotes] = useState('');
  const [quickSaving, setQuickSaving] = useState(false);

  // Extracted note memory bank from transactions
  const rememberedNotes = useMemo(() => getRememberedNotes(transactions), [transactions]);

  /* form */
  const EMPTY_FORM = {
    type: 'Expense', amount: 0,
    date: todayYMD(),
    category: '', notes: '',
    from_account_id: '', to_account_id: '',
    fee_amount: 0, day_of_month: new Date().getDate(), isSplit: false, splits: [{category:'', amount:0}, {category:'', amount:0}],
    tags: [], receipt_url: '', receipt_thumb: '',
  };
  const [formData, setFormData] = useState(EMPTY_FORM);

  // ── Transaction Templates (stored in localStorage) ──
  const [templates, setTemplates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vm_tx_templates') || '[]'); } catch { return []; }
  });
  const saveTemplate = () => {
    const t = {
      id: Date.now().toString(),
      label: formData.category || formData.type,
      type: formData.type, amount: formData.amount,
      category: formData.category, notes: formData.notes,
      from_account_id: formData.from_account_id,
      to_account_id: formData.to_account_id,
      tags: formData.tags || [],
    };
    const next = [...templates, t];
    setTemplates(next);
    localStorage.setItem('vm_tx_templates', JSON.stringify(next));
    toast.success(`Template "${t.label}" saved!`);
  };
  const applyTemplate = (t) => {
    setFormData(f => ({
      ...f, type: t.type, amount: t.amount, category: t.category,
      notes: t.notes, from_account_id: t.from_account_id || f.from_account_id,
      to_account_id: t.to_account_id || f.to_account_id, tags: t.tags || [],
      date: todayYMD(),
    }));
    setIsModalOpen(true); setEditMode(false); setCurrentId(null);
    toast.success(`Template "${t.label}" applied!`);
  };
  const deleteTemplate = (id) => {
    const next = templates.filter(t => t.id !== id);
    setTemplates(next);
    localStorage.setItem('vm_tx_templates', JSON.stringify(next));
  };

  const handlePreset = (preset) => {
    const today = new Date();
    let from = '', to = '';
    if (preset === 'This Month') {
      from = toYMD(new Date(today.getFullYear(), today.getMonth(), 1));
      to = toYMD(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    } else if (preset === 'Last 30d') {
      const past = new Date(today);
      past.setDate(past.getDate() - 30);
      from = toYMD(past);
      to = toYMD(today);
    } else if (preset === 'Last 3mo') {
      const past = new Date(today);
      past.setMonth(past.getMonth() - 3);
      from = toYMD(past);
      to = toYMD(today);
    } else if (preset === 'This Year') {
      from = toYMD(new Date(today.getFullYear(), 0, 1));
      to = toYMD(new Date(today.getFullYear(), 11, 31));
    }
    setDateFrom(from);
    setDateTo(to);
  };

  /* ── load ── */
  useEffect(() => { loadData(!!getCache('transactions')); }, []);
  useLiveData(() => loadData(true));

  const loadData = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [txs, accs, lns, rules] = await Promise.all([
        fetchTransactions(), fetchAccounts(), fetchLoans(), fetchRecurringTransactions()
      ]);
      setTransactions(txs);
      setAccounts(accs);
      setLoans(lns);
      setRecurringRules(rules);
      const pending = await applyPendingRecurring();
      if (pending.length > 0) setPendingRecurring(pending);
    } catch { toast.error('Failed to load transactions'); }
    finally { setLoading(false); }
  };

  /* ── modal helpers ── */
  const duplicateTx = (tx) => {
    setEditMode(false); setIsRecurring(false); setCurrentId(null);
    setFormData({
      type: tx.type || 'Expense',
      amount: tx.amount || 0,
      date: todayYMD(), // today's date
      category: tx.category || '',
      notes: tx.notes || '',
      from_account_id: tx.from_account_id || getLastAccountId('transactions:from', accounts),
      to_account_id: tx.type === 'Transfer' && tx.to_account_id ? `account_${tx.to_account_id}` : (tx.to_account_id || getLastAccountId('transactions:to', accounts)),
      destination_amount: tx.destination_amount || '', fee_amount: tx.fee_amount || 0,
      isSplit: false,
      splits: [{ category:'', amount:0 }, { category:'', amount:0 }],
      tags: tx.tags || [],
      tax_deductible: !!tx.tax_deductible,
      receipt_url: '', receipt_thumb: '',
      day_of_month: 1,
    });
    setIsModalOpen(true);
    toast('📋 Duplicated — edit & save', { duration: 2000 });
  };

  const openAddModal = () => {
    setEditMode(false); setIsRecurring(false); setCurrentId(null);
    const fromId = getLastAccountId('transactions:from', accounts);
    let toId = getLastAccountId('transactions:to', accounts);
    if (!toId) toId = fromId;
    setFormData({
      ...EMPTY_FORM,
      from_account_id: fromId,
      to_account_id: toId,
    });
    setIsModalOpen(true);
  };

  const handleApplySMS = (data) => {
    setFormData(f => ({
      ...f,
      type: data.type || 'Expense',
      amount: data.amount || 0,
      notes: data.merchant || '',
      category: data.category || '',
      date: data.date || f.date,
      ...(data.matchedAccountId ? (data.type === 'Income' ? { to_account_id: data.matchedAccountId } : { from_account_id: data.matchedAccountId }) : {})
    }));
  };

  const openEditModal = (tx) => {
    setEditMode(true); setIsRecurring(false); setCurrentId(tx.id);
    let toAcc = tx.to_account_id != null && tx.to_account_id !== '' ? String(tx.to_account_id) : '';
    if (tx.type === 'Transfer' && toAcc && !toAcc.startsWith('account_') && !toAcc.startsWith('loan_')) {
      toAcc = `account_${toAcc}`;
    }
    const hasValidSplits = Boolean(tx.isSplit !== false && Array.isArray(tx.splits) && tx.splits.some(s => Number(s.amount) > 0));
    setFormData({
      type: tx.type,
      amount: tx.amount,
      date: tx.date,
      category: tx.category || '',
      notes: tx.notes || '',
      from_account_id: tx.from_account_id != null && tx.from_account_id !== '' ? String(tx.from_account_id) : '',
      to_account_id: toAcc,
      destination_amount: tx.destination_amount || '', fee_amount: tx.fee_amount || 0,
      isSplit: hasValidSplits,
      splits: hasValidSplits ? tx.splits : [{category:'', amount:0}, {category:'', amount:0}],
      day_of_month: 1,
      tags: tx.tags || [],
      tax_deductible: !!tx.tax_deductible,
      receipt_url: tx.receipt_url || '', receipt_thumb: tx.receipt_thumb || '',
    });
    setIsModalOpen(true);
  };

  /* ── submit (create / update) ── */
  const validateForm = (f) => {
    const amt = Number(f.amount);
    if (!Number.isFinite(amt) || amt <= 0) return 'Enter an amount greater than zero';
    if (Math.abs(amt * 100 - Math.round(amt * 100)) > 0.001) return 'Amounts can have at most two decimals';
    if (!f.date) return 'Choose a date';
    if (isRecurring) return null;
    const toId = f.to_account_id ? String(f.to_account_id).replace(/^account_/, '') : '';
    if (f.type !== 'Income' && !f.from_account_id) return 'Choose the account the money comes from';
    if (f.type !== 'Expense' && !toId) return 'Choose the account the money goes to';
    if (f.type === 'Transfer' && !String(f.to_account_id).startsWith('loan_') && String(f.from_account_id) === toId) return 'Choose two different accounts';
    if (f.type === 'Transfer') {
      const fee = Number(f.fee_amount) || 0;
      if (fee < 0) return 'Transfer fee cannot be negative';
      const fromAcc = accounts.find(a => String(a.id) === String(f.from_account_id));
      const toAcc = accounts.find(a => String(a.id) === toId);
      if (fromAcc && toAcc && (fromAcc.currency || 'LKR') !== (toAcc.currency || 'LKR') && !(Number(f.destination_amount) > 0))
        return `Enter the amount received in ${toAcc.currency || 'LKR'}`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validateForm(formData);
    if (problem) { toast.error(problem); return; }
    // Close modal instantly
    setIsModalOpen(false);
    setCatDropOpen(false);

    // Snapshot form data before any async work
    const snap = { ...formData };

    if (snap.isSplit && snap.type === 'Expense') {
      const splitSum = Math.round((snap.splits || []).reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100;
      const totalAmt = Math.round(Number(snap.amount) * 100) / 100;
      if (Math.abs(splitSum - totalAmt) > 0.01) {
        toast.error(`Split amounts (${splitSum}) must equal total amount (${totalAmt})`);
        setIsModalOpen(true);
        return;
      }
    }

    try {
      if (isRecurring) {
        const cleanRule = {
          ...snap,
          amount: Number(snap.amount) || 0,
          fee_amount: Number(snap.fee_amount) || 0,
          name: String(snap.name || snap.category || snap.notes || snap.type || 'Recurring').trim(),
          to_account_id: snap.to_account_id ? String(snap.to_account_id).replace(/^account_/, '') : null,
        };
        await createRecurringTransaction(cleanRule);
        toast.success('Recurring rule created!');
        haptic();
        // Reload recurring rules only
        const rules = await fetchRecurringTransactions();
        setRecurringRules(rules);

      } else if (editMode) {
        const cleanTo = snap.to_account_id ? String(snap.to_account_id).replace(/^account_/, '') : null;
        const payload = {
          type: snap.type,
          amount: Number(snap.amount),
          date: snap.date,
          category: snap.category,
          notes: snap.notes,
          from_account_id: snap.from_account_id || null,
          to_account_id: cleanTo,
          fee_amount: snap.type === 'Transfer' ? (Number(snap.fee_amount) || 0) : 0,
          // Always send the received amount explicitly so a cleared value never keeps a stale one
          destination_amount: snap.type === 'Transfer' && Number(snap.destination_amount) > 0 ? Number(snap.destination_amount) : null,
          isSplit: Boolean(snap.isSplit && snap.type === 'Expense'),
          splits: snap.isSplit && snap.type === 'Expense' ? snap.splits : null,
          tags: snap.tags || [],
          tax_deductible: !!snap.tax_deductible,
          is_tax_deductible: snap.type !== 'Transfer' && !!snap.tax_deductible,
          receipt_url: snap.receipt_url || '',
          receipt_thumb: snap.receipt_thumb || '',
        };
        if (payload.isSplit && Array.isArray(payload.splits) && payload.splits.length > 0) {
          payload.category = payload.splits[0].category || 'Split';
        }
        // Optimistic: update the item in state IMMEDIATELY before await
        setTransactions(prev => prev.map(t => String(t.id) === String(currentId) ? { ...t, ...payload } : t));
        await updateTransaction(currentId, payload);
        // Sync from patched cache (accounts balance may have changed)
        const fresh = getCache('transactions');
        if (fresh) setTransactions([...fresh]);
        const freshAcc = getCache('accounts');
        if (freshAcc) setAccounts([...freshAcc]);
        toast.success('Transaction updated ✓');
        haptic();

      } else {
        if (snap.type === 'Transfer' && String(snap.to_account_id).startsWith('loan_')) {
          const loanId = String(snap.to_account_id).replace('loan_', '');
          await payLoan(loanId, { amount: Number(snap.amount), date: snap.date, account_id: snap.from_account_id });
          toast.success('Loan payment recorded!');
          haptic();
          // Reload fully since payLoan affects loans + accounts
          loadData();
          return;
        } else {
          // Strip private UI-only fields before sending to Firestore
          const { _autoCat, _foreignAmt, _foreignCur, ...cleanSnap } = snap;
          const data = {
            ...cleanSnap,
            amount: Number(cleanSnap.amount),
            fee_amount: cleanSnap.type === 'Transfer' ? (Number(cleanSnap.fee_amount) || 0) : 0,
            ...(cleanSnap.type === 'Transfer' && Number(cleanSnap.destination_amount) > 0 ? { destination_amount: Number(cleanSnap.destination_amount) } : { destination_amount: '' }),
            to_account_id: cleanSnap.to_account_id ? String(cleanSnap.to_account_id).replace(/^account_/, '') : null,
            isSplit: Boolean(cleanSnap.isSplit && cleanSnap.type === 'Expense'),
            splits: cleanSnap.isSplit && cleanSnap.type === 'Expense' ? cleanSnap.splits : null,
          };
          if (data.isSplit && Array.isArray(data.splits) && data.splits.length > 0) {
            data.category = data.splits[0].category || 'Split';
          }
          // Optimistic: add a placeholder item immediately so user sees it NOW
          const tempId = `optimistic_${Date.now()}`;
          const optimisticTx = {
            id: tempId,
            ...data,
            category: data.category || null,
            notes: data.notes || null,
          };
          setTransactions(prev => [optimisticTx, ...prev]);

          await createTransaction(data);
          if (data.type !== 'Income') rememberAccountId('transactions:from', data.from_account_id);
          if (data.type !== 'Expense') rememberAccountId('transactions:to', data.to_account_id);

          // Cashback rewards: if from_account is a Credit Card with cashback_rate, accumulate rewards
          if (data.type === 'Expense' && data.from_account_id) {
            const srcAcc = accounts.find(a => String(a.id) === String(data.from_account_id));
            if (srcAcc && srcAcc.type === 'Credit Card' && srcAcc.cashback_rate > 0) {
              const earned = parseFloat((data.amount * srcAcc.cashback_rate / 100).toFixed(2));
              if (earned > 0) {
                const newRewards = (srcAcc.rewards_earned || 0) + earned;
                updateAccount(srcAcc.id, { rewards_earned: newRewards }).catch(() => {});
                toast.success(`🎁 +${earned.toLocaleString()} cashback earned!`, { duration: 3000 });
              }
            }
          }

          // Replace optimistic item with real cache (has server IDs)
          const fresh = getCache('transactions');
          if (fresh) {
            setTransactions([...fresh]);
          } else {
            // Fallback: remove the temp item, reload
            setTransactions(prev => prev.filter(t => t.id !== tempId));
            loadData();
            return;
          }
          // Sync account balances from patched cache
          const freshAcc = getCache('accounts');
          if (freshAcc) setAccounts([...freshAcc]);

          toast.success('Transaction saved ✓');
          haptic();
        }
      }
    } catch (err) {
      console.error(err);
      toast.error(err?.message || (editMode ? 'Failed to update' : 'Failed to save transaction'));
      setIsModalOpen(true); // re-open on failure
      // Full reload to get consistent state on error
      loadData();
    }
  };


  /* ── delete ── */
  const doConfirmDelete = async () => {
    const deleteId = confirm.id;
    const deleteType = confirm.type;
    // Optimistic: remove from UI immediately before network call
    if (deleteType === 'txn') {
      setTransactions(prev => prev.filter(t => String(t.id) !== String(deleteId)));
    } else {
      setRecurringRules(prev => prev.filter(r => String(r.id) !== String(deleteId)));
    }
    setConfirm({ open: false, id: null, type: 'txn' });
    try {
      if (deleteType === 'txn') {
        try {
          await deleteTransaction(deleteId);
        } catch (firstErr) {
          if (firstErr?.message?.includes('changed') || firstErr?.message?.includes('fee')) {
            invalidateCache('transactions');
            await deleteTransaction(deleteId);
          } else {
            throw firstErr;
          }
        }
        toast.success('Deleted & balances corrected');
        const freshAcc = getCache('accounts');
        if (freshAcc) setAccounts([...freshAcc]);
      } else {
        await deleteRecurringTransaction(deleteId);
        toast.success('Recurring rule removed');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
      loadData(); // revert on error
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const byId = new Map(transactions.map(t => [String(t.id), t]));
    // Generated fees, reversal audit rows and invoice settlements are protected.
    const protectedIds = ids.filter(id => {
      const t = byId.get(String(id));
      return t && (t.is_transfer_fee || t.reversed_at || t.reversal_of || t.invoice_id);
    });
    const deletable = ids.filter(id => !protectedIds.includes(id));
    setSelectedIds(new Set());
    if (deletable.length === 0) {
      toast.error('Selected rows are protected audit/fee records and cannot be deleted');
      return;
    }
    setTransactions(prev => prev.filter(t => !deletable.includes(t.id)));
    // Delete one at a time: each delete corrects shared account balances atomically,
    // so running them in parallel causes contention and partial failures.
    let done = 0;
    const failed = [];
    for (const id of deletable) {
      try {
        await deleteTransaction(id);
        done++;
      } catch (err) {
        failed.push(err?.message || 'unknown error');
      }
    }
    if (done) toast.success(`${done} transaction${done > 1 ? 's' : ''} deleted & balances corrected`);
    if (protectedIds.length) toast(`Skipped ${protectedIds.length} protected record${protectedIds.length > 1 ? 's' : ''} (fees / reversals / invoices)`, { icon: 'ℹ️' });
    if (failed.length) toast.error(`${failed.length} could not be deleted: ${failed[0]}`);
    loadData(true);
  };

  const handleApplyRecurring = async () => {
    try {
      await confirmApplyRecurring(pendingRecurring);
      toast.success(`Applied ${pendingRecurring.length} recurring transaction(s)!`);
      setPendingRecurring([]); loadData();
    } catch (err) { toast.error(err?.message || 'Failed to apply recurring transactions'); }
  };

  /* ── derived data ── */
  const getAccountName = useCallback((id) => accounts.find(a => String(a.id) === String(id))?.name || '—', [accounts]);

  const anomalyMap = useMemo(() => {
    const map = {};
    const activeTxs = transactions.filter(tx => isActivePayment(tx) && !tx.is_transfer_fee);
    // 1. Detect duplicate entries (same date, type, and amount > 0)
    const sigBuckets = {};
    activeTxs.forEach(tx => {
      const amt = Number(tx.amount) || 0;
      if (amt <= 0 || !tx.date) return;
      const sig = `${tx.date}|${tx.type}|${amt}`;
      if (!sigBuckets[sig]) sigBuckets[sig] = [];
      sigBuckets[sig].push(tx);
    });
    Object.values(sigBuckets).forEach(group => {
      if (group.length > 1) {
        group.forEach(tx => {
          map[tx.id] = { isDuplicate: true, label: '⚠️ Duplicate' };
        });
      }
    });

    // 2. Detect unusual category spend spikes (>= 3.5x historical category average for expenses >= 3000)
    const catTotals = {};
    const catCounts = {};
    activeTxs.forEach(tx => {
      if (tx.type !== 'Expense' || !tx.category) return;
      const catKey = tx.category.toLowerCase().trim();
      const amt = Number(tx.amount) || 0;
      if (amt <= 0) return;
      catTotals[catKey] = (catTotals[catKey] || 0) + amt;
      catCounts[catKey] = (catCounts[catKey] || 0) + 1;
    });

    activeTxs.forEach(tx => {
      if (tx.type !== 'Expense' || !tx.category) return;
      const catKey = tx.category.toLowerCase().trim();
      const count = catCounts[catKey] || 0;
      const amt = Number(tx.amount) || 0;
      if (count >= 2 && amt >= 3000) {
        const otherTotal = catTotals[catKey] - amt;
        const otherAvg = otherTotal / (count - 1);
        if (otherAvg > 0 && amt >= otherAvg * 3.5) {
          const ratio = (amt / otherAvg).toFixed(1);
          map[tx.id] = {
            ...(map[tx.id] || {}),
            isSpike: true,
            ratio,
            label: map[tx.id]?.isDuplicate ? `⚠️ Dup · 📈 ${ratio}× Spike` : `📈 ${ratio}× Spike`,
          };
        }
      }
    });

    return map;
  }, [transactions]);

  const anomalyCount = useMemo(() => Object.keys(anomalyMap).length, [anomalyMap]);

  const [auditFilter, setAuditFilter] = useState('All');
  const filtered = useMemo(() => {
    return transactions.filter(tx => {
      if (auditFilter !== 'All' && auditStatus(tx) !== auditFilter) return false;
      if (filterAccount !== 'All' && String(tx.from_account_id) !== String(filterAccount) && String(tx.to_account_id) !== String(filterAccount)) return false;
      const q = searchQuery.toLowerCase();
      if (q && !String(tx.id).toLowerCase().includes(q) && !String(tx.reversal_of || tx.reversed_by || '').toLowerCase().includes(q) && !(tx.category||'').toLowerCase().includes(q) && !(tx.notes||'').toLowerCase().includes(q) &&
          !getAccountName(tx.from_account_id).toLowerCase().includes(q) &&
          !getAccountName(tx.to_account_id).toLowerCase().includes(q)) return false;
      if (filterType !== 'All' && tx.type !== filterType) return false;
      if (dateFrom && tx.date < dateFrom) return false;
      if (dateTo && tx.date > dateTo) return false;
      if (minAmt !== '' && tx.amount < parseFloat(minAmt)) return false;
      if (maxAmt !== '' && tx.amount > parseFloat(maxAmt)) return false;
      if (filterTag && !(tx.tags || []).includes(filterTag)) return false;
      if (filterTaxDeductible && !tx.tax_deductible && !tx.is_tax_deductible && !(Array.isArray(tx.tags) && (tx.tags.includes('#tax-deductible') || tx.tags.includes('tax-deductible')))) return false;
      if (filterHasReceipt && !tx.receipt_url && !tx.receipt_uri) return false;
      if (filterAnomalies && !anomalyMap[tx.id]) return false;
      return true;
    }).sort((a, b) => {
      if (sortBy === 'Newest') return new Date(b.date) - new Date(a.date) || String(b.recorded_at || b.id || '').localeCompare(String(a.recorded_at || a.id || ''));
      if (sortBy === 'Oldest') return new Date(a.date) - new Date(b.date) || String(a.recorded_at || a.id || '').localeCompare(String(b.recorded_at || b.id || ''));
      if (sortBy === 'Highest Amount') return b.amount - a.amount;
      if (sortBy === 'Lowest Amount') return a.amount - b.amount;
      return 0;
    });
  }, [transactions, getAccountName, searchQuery, filterType, filterAccount, dateFrom, dateTo, sortBy, minAmt, maxAmt, filterTag, filterTaxDeductible, filterHasReceipt, filterAnomalies, anomalyMap, auditFilter]);

  /* Bank-statement running balance per transaction when a single account is selected */
  const runningBalanceMap = useMemo(() => {
    const map = new Map();
    if (filterAccount === 'All') return map;
    const acc = accounts.find(a => String(a.id) === String(filterAccount));
    if (!acc) return map;
    const acctTxs = transactions
      .filter(tx => String(tx.from_account_id) === String(filterAccount) || String(tx.to_account_id) === String(filterAccount))
      .sort((a, b) => new Date(b.date) - new Date(a.date) || String(b.recorded_at || b.id || '').localeCompare(String(a.recorded_at || a.id || '')));
    let running = Number(acc.balance) || 0;
    acctTxs.forEach(tx => {
      map.set(tx.id, Math.round(running * 100) / 100);
      running = Math.round((running - accountMovement(filterAccount, tx)) * 100) / 100;
    });
    return map;
  }, [filterAccount, accounts, transactions]);

  /* Summary stats: global portfolio summary or account-specific cashflow */
  const stats = useMemo(() => {
    if (filterAccount === 'All') return summarizePayments(filtered);
    const active = filtered.filter(isActivePayment);
    let inflow = 0;
    let outflow = 0;
    active.forEach(tx => {
      // Use the same signed movement as the stored balance so legacy rows with
      // a stale to_account_id on an Expense never count as an inflow.
      const mov = accountMovement(filterAccount, tx);
      if (mov > 0) inflow += mov;
      else if (mov < 0) outflow += -mov;
    });
    return {
      income: Math.round(inflow * 100) / 100,
      expense: Math.round(outflow * 100) / 100,
      net: Math.round((inflow - outflow) * 100) / 100,
      count: filtered.length,
      isAccountView: true,
    };
  }, [filtered, filterAccount]);

  /* Windowed slice for fast initial DOM mount (60 rows default unless searching) */
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [compact, setCompact] = useState(() => localStorage.getItem('vm_tx_compact') === '1');
  const [showInsights, setShowInsights] = useState(() => localStorage.getItem('vm_tx_insights') !== '0');
  const toggleCompact = () => setCompact(v => { localStorage.setItem('vm_tx_compact', v ? '0' : '1'); return !v; });
  const toggleInsights = () => setShowInsights(v => { localStorage.setItem('vm_tx_insights', v ? '0' : '1'); return !v; });

  /* ── Saved filter views (per user, localStorage) ── */
  const viewsKey = `vm_tx_views:${auth.currentUser?.uid || 'anon'}`;
  const [savedViews, setSavedViews] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(viewsKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [viewName, setViewName] = useState('');
  const [savingView, setSavingView] = useState(false);
  const persistViews = (next) => { setSavedViews(next); localStorage.setItem(viewsKey, JSON.stringify(next)); };
  const currentFilters = () => ({ searchQuery, filterType, filterAccount, dateFrom, dateTo, minAmt, maxAmt, filterTag, filterTaxDeductible, filterAnomalies, auditFilter, sortBy });
  const hasActiveFilters = !!(searchQuery || filterType !== 'All' || filterAccount !== 'All' || dateFrom || dateTo || minAmt || maxAmt || filterTag || filterTaxDeductible || filterAnomalies || auditFilter !== 'All' || sortBy !== 'Newest');
  const saveView = (e) => {
    e?.preventDefault();
    const name = viewName.trim();
    if (!name) return;
    const others = savedViews.filter(v => v.name.toLowerCase() !== name.toLowerCase());
    persistViews([...others, { id: String(Date.now()), name, filters: currentFilters() }]);
    setViewName(''); setSavingView(false);
    toast.success(`View "${name}" saved`);
  };
  const applyView = (view) => {
    const f = { searchQuery: '', filterType: 'All', filterAccount: 'All', dateFrom: '', dateTo: '', minAmt: '', maxAmt: '', filterTag: '', filterTaxDeductible: false, filterAnomalies: false, auditFilter: 'All', sortBy: 'Newest', ...view.filters };
    haptic();
    setSearchQuery(f.searchQuery); setFilterType(f.filterType); setFilterAccount(f.filterAccount || 'All'); setDateFrom(f.dateFrom); setDateTo(f.dateTo);
    setMinAmt(f.minAmt); setMaxAmt(f.maxAmt); setFilterTag(f.filterTag); setFilterTaxDeductible(!!f.filterTaxDeductible);
    setFilterAnomalies(!!f.filterAnomalies); setAuditFilter(f.auditFilter); setSortBy(f.sortBy);
  };
  const deleteView = (id) => persistViews(savedViews.filter(v => v.id !== id));

  /* ── Inline Quick-Edit for category & notes on active Expense/Income rows ── */
  const startQuickEdit = (tx, e) => {
    e?.stopPropagation();
    setQuickEditId(tx.id);
    setQuickCat(tx.category || '');
    setQuickNotes(tx.notes || '');
  };
  const cancelQuickEdit = (e) => {
    e?.stopPropagation();
    setQuickEditId(null);
    setQuickCat('');
    setQuickNotes('');
  };
  const saveQuickEdit = async (tx, e) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (quickSaving) return;
    const nextCat = quickCat.trim() || tx.category || '';
    const nextNotes = quickNotes.trim();
    setQuickSaving(true);
    setQuickEditId(null);
    setTransactions(prev => prev.map(t => String(t.id) === String(tx.id) ? { ...t, category: nextCat, notes: nextNotes } : t));
    try {
      await updateTransaction(tx.id, { category: nextCat, notes: nextNotes });
      toast.success('Updated category & notes ✓');
      haptic();
    } catch (err) {
      toast.error(err?.message || 'Failed to quick-edit');
      loadData(true);
    } finally {
      setQuickSaving(false);
    }
  };

  /* ── Bulk edit: category / tag (amounts and accounts are never touched) ── */
  const [bulkMode, setBulkMode] = useState(null);
  const [bulkValue, setBulkValue] = useState('');
  const handleBulkEdit = async (e) => {
    e.preventDefault();
    const value = bulkValue.trim();
    if (!value || !bulkMode) return;
    const targets = transactions.filter(t => selectedIds.has(t.id) && ['Expense', 'Income'].includes(t.type) && isEditableTransaction(t));
    const skipped = selectedIds.size - targets.length;
    if (!targets.length) { toast.error('Selected rows cannot be edited (only active Expense/Income)'); return; }
    const patchFor = (t) => bulkMode === 'category' ? { category: value } : { tags: [...new Set([...(t.tags || []), value])] };
    const results = await Promise.allSettled(targets.map(t => updateTransaction(t.id, patchFor(t))));
    const ok = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.length - ok;
    if (ok) toast.success(`${bulkMode === 'category' ? 'Category set' : 'Tag added'} on ${ok} transaction${ok > 1 ? 's' : ''}${skipped ? ` · ${skipped} skipped` : ''}`);
    if (failed) toast.error(`${failed} transaction${failed > 1 ? 's' : ''} failed to update`);
    setBulkMode(null); setBulkValue(''); setSelectedIds(new Set());
    loadData(true);
  };

  /* ── Recurring auto-detection ── */
  const dismissKey = `vm_tx_recurring_dismissed:${auth.currentUser?.uid || 'anon'}`;
  const [dismissedRecurring, setDismissedRecurring] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(dismissKey) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const recurringSuggestion = useMemo(
    () => detectRecurring(transactions, recurringRules, { dismissed: dismissedRecurring })[0] || null,
    [transactions, recurringRules, dismissedRecurring]);
  const dismissSuggestion = () => {
    if (!recurringSuggestion) return;
    const next = [...dismissedRecurring, recurringSuggestion.id];
    setDismissedRecurring(next);
    localStorage.setItem(dismissKey, JSON.stringify(next));
  };
  const createSuggestedReminder = async () => {
    const s = recurringSuggestion;
    if (!s) return;
    try {
      await createRecurringTransaction({
        type: s.type, amount: s.amount, category: s.category, notes: s.notes,
        name: String(s.notes || s.category || s.type).trim(),
        from_account_id: s.type === 'Expense' ? s.from_account_id : null,
        to_account_id: s.type === 'Income' ? s.to_account_id : null,
        day_of_month: s.day_of_month, fee_amount: 0, tags: [],
      });
      toast.success('Reminder created');
      setRecurringRules(await fetchRecurringTransactions());
    } catch (err) { toast.error(err?.message || 'Failed to create reminder'); }
  };
  const typeCounts = useMemo(() => {
    const c = { All: 0, Expense: 0, Income: 0, Transfer: 0, 'Loan Payment': 0 };
    transactions.forEach(t => { c.All++; if (c[t.type] !== undefined) c[t.type]++; });
    return c;
  }, [transactions]);
  const visibleFiltered = useMemo(() => {
    if (searchQuery.trim()) return filtered;
    return filtered.slice(0, visibleLimit);
  }, [filtered, visibleLimit, searchQuery]);

  /* Keyboard shortcuts: N = new transaction, / = focus search */
  useEffect(() => {
    const onKey = (e) => {
      const el = document.activeElement;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openAddModal(); }
      else if (e.key === '/') { e.preventDefault(); document.querySelector('input[placeholder^="Search category"]')?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /* Group by date */
  const grouped = useMemo(() => {
    const map = {};
    visibleFiltered.forEach(tx => {
      const d = tx.date || 'Unknown';
      if (!map[d]) map[d] = [];
      map[d].push(tx);
    });
    return Object.entries(map).sort(([a], [b]) => {
      if (sortBy === 'Oldest') return new Date(a) - new Date(b);
      return new Date(b) - new Date(a);
    });
  }, [visibleFiltered, sortBy]);

  /* CSV Export (supports Selected Rows or Filtered View + Summary Footer) */
  const handleExportCSV = () => {
    const sourceRows = selectedIds.size > 0 ? filtered.filter(tx => selectedIds.has(tx.id)) : filtered;
    if (!sourceRows.length) { toast.error('No transactions to export'); return; }
    const sumStats = summarizePayments(sourceRows);
    const rows = [
      ['Date', 'Type', 'Category', 'Amount', 'Fee', 'From', 'To', 'Notes'].join(','),
      ...sourceRows.map(tx => [
        tx.date, tx.type,
        `"${(tx.category||'').replace(/"/g,'')}"`,
        tx.amount, tx.fee_amount||0,
        `"${getAccountName(tx.from_account_id)}"`,
        `"${getAccountName(tx.to_account_id)}"`,
        `"${(tx.notes||'').replace(/"/g,'')}"`
      ].join(',')),
      '',
      ['SUMMARY', `Records: ${sourceRows.length}`, `Income: ${sumStats.income}`, `Expense: ${sumStats.expense}`, `Net: ${sumStats.net}`, '', '', ''].join(','),
    ].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }));
    a.download = `transactions_${dateFrom ? `${dateFrom}_to_${dateTo||'now'}` : todayYMD()}.csv`;
    a.click();
    toast.success(`Exported ${sourceRows.length} transaction${sourceRows.length === 1 ? '' : 's'} to CSV!`);
  };

  /* Excel (.xlsx) Export (supports Selected Rows or Filtered View + Category Summary Sheet) */
  const handleExportExcel = async () => {
    const sourceRows = selectedIds.size > 0 ? filtered.filter(tx => selectedIds.has(tx.id)) : filtered;
    if (!sourceRows.length) { toast.error('No transactions to export'); return; }
    try {
      const XLSX = await import('xlsx');
      const sumStats = summarizePayments(sourceRows);
      const rows = sourceRows.map(tx => ({
        Date: tx.date,
        Type: tx.type,
        Category: tx.category || '',
        Amount: tx.amount,
        Fee: tx.fee_amount || 0,
        From: getAccountName(tx.from_account_id),
        To: getAccountName(tx.to_account_id),
        Notes: tx.notes || '',
      }));
      rows.push({
        Date: 'SUMMARY',
        Type: `${sourceRows.length} records`,
        Category: `In: ${sumStats.income} | Out: ${sumStats.expense}`,
        Amount: sumStats.net,
        Fee: 0,
        From: '',
        To: '',
        Notes: 'Net Cash Flow',
      });
      const byCat = new Map();
      sourceRows.forEach(tx => {
        const key = `${tx.type || 'Other'} · ${tx.category || 'Uncategorized'}`;
        const prev = byCat.get(key) || { Type: tx.type || 'Other', Category: tx.category || 'Uncategorized', Count: 0, Total: 0 };
        byCat.set(key, { ...prev, Count: prev.Count + 1, Total: Math.round((prev.Total + (Number(tx.amount) || 0)) * 100) / 100 });
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Transactions');
      if (byCat.size > 0) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Array.from(byCat.values())), 'By Category');
      }
      XLSX.writeFile(wb, `Transactions_${dateFrom ? `${dateFrom}_to_${dateTo||'now'}` : todayYMD()}.xlsx`);
      toast.success(`Exported ${sourceRows.length} transaction${sourceRows.length === 1 ? '' : 's'} to Excel!`);
    } catch {
      toast.error('Failed to export Excel');
    }
  };

  const accountOptions = accounts.map(a => ({ value: a.id, label: `${a.name}` }));
  const toAccountOptions = [
    ...accounts.map(a => ({ value: `account_${a.id}`, label: `💳 ${a.name}` })),
    ...loans.filter(l => l.status === 'Active').map(l => ({ value: `loan_${l.id}`, label: `🏦 Loan: ${l.item_name}` }))
  ];
  const uniqueCategories = [...new Set(transactions.map(tx => tx.category).filter(Boolean))];

  const formatGroupDate = (d) => {
    if (!d || d === 'Unknown') return d;
    try {
      const date = new Date(d + 'T00:00:00');
      const today = new Date(); today.setHours(0,0,0,0);
      const yest  = new Date(today); yest.setDate(yest.getDate()-1);
      if (date.getTime() === today.getTime()) return 'Today';
      if (date.getTime() === yest.getTime())  return 'Yesterday';
      return date.toLocaleDateString('en-LK', { weekday:'long', day:'numeric', month:'short', year:'numeric' });
    } catch {
  return d;
}
  };

  return (
    <PageWrapper>
      <div>

        {/* ── Header ── */}
        <div className="page-header">
          <div>
            <h1 className="glow-text text-cyan" style={{ margin:0, fontSize:'2rem' }}>Transactions</h1>
            <div style={{ display:'flex', gap:'1rem', marginTop:4, flexWrap:'wrap' }}>
              <span style={{ color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.78rem' }}>{filtered.length} records</span>
              {stats.income > 0 && <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', color:'#4ade80' }}>+{formatCurrency(stats.income)}</span>}
              {stats.expense > 0 && <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', color:'#f87171' }}>-{formatCurrency(stats.expense)}</span>}
              {filtered.length > 0 && <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', color: stats.net >= 0 ? '#4ade80' : '#f87171', fontWeight:600 }}>
                net {stats.net >= 0 ? '+' : ''}{formatCurrency(stats.net)}
              </span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', position: 'relative' }}>
            {/* Tools & Export Dropdown */}
            <div ref={toolsMenuRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setToolsMenuOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem' }}
                title="Advanced Tools & Export Menu"
              >
                <span>⚡ Tools & Export</span>
                <ChevronDown size={14} style={{ transform: toolsMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {toolsMenuOpen && (
                <div style={{
                  position: 'absolute',
                  right: 0,
                  top: 'calc(100% + 6px)',
                  zIndex: 999,
                  minWidth: 200,
                  background: 'var(--bg-surface, #131722)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 12,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                  padding: '0.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-receipt-scanner')); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Camera size={14} color="#a78bfa" /> Scan Receipt
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-cash-calendar')); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Calendar size={14} color="#38bdf8" /> Cash Flow Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-rules-manager')); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Zap size={14} color="#4ade80" /> Automated Rules
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); window.dispatchEvent(new Event('vm:open-bank-sync')); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <RefreshCw size={14} color="#818cf8" /> Live Bank Sync
                  </button>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); setCsvModalOpen(true); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Upload size={14} /> Import CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); handleExportCSV(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <Download size={14} /> Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => { setToolsMenuOpen(false); handleExportExcel(); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.55rem 0.75rem', background: 'transparent', border: 'none', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <FileSpreadsheet size={14} /> Export Excel (.xlsx)
                  </button>
                </div>
              )}
            </div>

            {/* Primary Action */}
            <button className="btn btn-primary" onClick={openAddModal} style={{ padding: '0.5rem 1rem', fontSize: '0.84rem' }}>
              <Plus size={16} /> New Transaction
            </button>
          </div>
        </div>

        {templates.length > 0 && <details className="quiet-section"><summary>Quick templates ({templates.length})</summary><div className="quiet-section-content">
        {/* ── Quick Templates ── */}
        {templates.length > 0 && (
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem', alignItems:'center' }}>
            <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px', marginRight:'0.25rem' }}>TEMPLATES:</span>
            {templates.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:0, background:'rgba(0,245,255,0.07)', border:'1px solid rgba(0,245,255,0.2)', borderRadius:100, overflow:'hidden' }}>
                <button onClick={() => applyTemplate(t)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:'0.3rem 0.65rem', fontFamily:'Inter, sans-serif', fontSize:'0.75rem', color:'#00f5ff', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                  {getCategoryEmoji(t.category)} {t.label}
                  <span style={{ fontSize:'0.65rem', color:'rgba(0,245,255,0.6)' }}>{formatCurrency(t.amount)}</span>
                </button>
                <button onClick={() => deleteTemplate(t.id)} aria-label={`Delete template ${t.label}`}
                  style={{ background:'none', border:'none', borderLeft:'1px solid rgba(0,245,255,0.15)', cursor:'pointer', padding:'0.3rem 0.5rem', color:'rgba(0,245,255,0.4)', fontSize:'0.7rem', display:'flex', alignItems:'center' }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        </div></details>}
        {/* ── Pending recurring banner ── */}
        <AnimatePresence>
          {pendingRecurring.length > 0 && (
            <motion.div initial={{opacity:0,y:-10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}
              style={{ background:'rgba(129,140,248,0.08)', border:'1px solid rgba(129,140,248,0.3)', borderRadius:12, padding:'0.875rem 1.25rem', marginBottom:'1.25rem' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'1rem', flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                  <RefreshCw size={16} color="#818cf8"/>
                  <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.85rem' }}>
                    <strong style={{ color:'#818cf8' }}>{pendingRecurring.length}</strong> recurring transaction{pendingRecurring.length>1?'s':''} ready · {formatCurrency(pendingRecurring.reduce((s,r)=>s+(r.amount||0),0))} total
                  </span>
                </div>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button className="btn btn-primary" style={{ padding:'0.45rem 1rem', fontSize:'0.82rem' }} onClick={handleApplyRecurring}>Apply All</button>
                  <button className="btn btn-secondary" aria-label="Dismiss pending recurring banner" style={{ padding:'0.45rem 0.65rem' }} onClick={()=>setPendingRecurring([])}><X size={14}/></button>
                </div>
              </div>
              {pendingRecurring.length > 0 && (
                <div style={{ marginTop:'0.625rem', display:'flex', flexDirection:'column', gap:'0.25rem' }}>
                  {pendingRecurring.slice(0,4).map((r, idx) => (
                    <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'0.35rem 0.5rem', background:'rgba(129,140,248,0.06)', borderRadius:7, fontSize:'0.78rem', fontFamily:'Inter, sans-serif' }}>
                      <span style={{ color:'#d0d0e0' }}>{r.category || r.description || 'Recurring'}</span>
                      <span style={{ color: r.type === 'Expense' ? '#f87171' : '#4ade80', fontWeight:600 }}>
                        {r.type === 'Expense' ? '-' : '+'}{formatCurrency(r.amount||0)}
                      </span>
                    </div>
                  ))}
                  {pendingRecurring.length > 4 && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', textAlign:'center', marginTop:'0.2rem' }}>+{pendingRecurring.length-4} more</div>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div style={{ display:'flex', gap:'0.375rem', marginBottom:'1.25rem', borderBottom:'1px solid rgba(255,255,255,0.06)', paddingBottom:'0.75rem' }}>
          {[['all','All Transactions'],['recurring','🔄 Recurring Rules']].map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{ padding:'0.45rem 1.25rem', background:'none', border:'none', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'0.5px',
                color: activeTab===id ? '#4ade80' : 'var(--text-secondary)', borderBottom: activeTab===id ? '2px solid #4ade80' : '2px solid transparent',
                transition:'all 0.18s', paddingBottom:'0.75rem', marginBottom:'-0.75rem' }}>{label}
            </button>
          ))}
        </div>

        {/* ── Recurring Rules tab ── */}
         {activeTab === 'recurring' && (
          <div className="hud-panel" style={{ padding:'1.1rem' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' }}>
              <div>
                <div style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text-primary)', fontFamily:'Inter, sans-serif' }}>
                  Monthly Reminders & Recurring Rules ({recurringRules.length})
                </div>
                <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                  Synced with Recurring & Monthly Reminders (fixed days, flexible windows, variable estimates)
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate('/recurring')}
                style={{ fontSize:'0.76rem', padding:'0.45rem 0.85rem' }}
              >
                Open Recurring & Reminders →
              </button>
            </div>
            {recurringRules.length === 0 ? (
              <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>
                <Repeat size={36} style={{ opacity:0.2, marginBottom:'1rem' }}/><br/>
                NO RECURRING RULES YET. ADD A TRANSACTION AND ENABLE &quot;SET AS RECURRING&quot;.
              </div>
            ) : (
              <>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                  {recurringRules.map(rule => {
                    const currentMonth = todayYMD().slice(0, 7);
                    const isPaidThisMonth = rule.last_applied_month === currentMonth;
                    const isFlexible = rule.schedule_mode === 'flexible' || !rule.day_of_month;
                    const scheduleLabel = isFlexible
                      ? `Flexible (${rule.flexible_window || 'Anytime this month'})`
                      : `Every month on day ${rule.day_of_month || 1}`;
                    const displayAmt = Number(rule.avg_amount || rule.amount || 0);
                    return (
                      <div key={rule.id} style={{ display:'flex', alignItems:'center', padding:'0.875rem 1rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', gap:'0.875rem', flexWrap:'wrap' }}>
                        <span style={{ fontSize:'1.4rem', flexShrink:0 }}>{getCategoryEmoji(rule.category)}</span>
                        <div style={{ flex:1, minWidth:180 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                            <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rule.name || rule.category || rule.type}</span>
                            {rule.paused ? (
                              <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(148,163,184,0.12)', color:'#94a3b8', fontWeight:600 }}>Paused</span>
                            ) : isPaidThisMonth ? (
                              <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(74,222,128,0.12)', color:'#4ade80', fontWeight:600 }}>✓ Paid this month</span>
                            ) : (
                              <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(251,191,36,0.12)', color:'#fbbf24', fontWeight:600 }}>Due this month</span>
                            )}
                          </div>
                          <div className="text-muted" style={{ fontSize:'0.76rem', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                            {scheduleLabel} · {rule.type}{rule.is_variable ? ' · Variable Est.' : ''}
                          </div>
                        </div>
                        <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:TYPE_COLOR[rule.type]||'#aaa', flexShrink:0 }}>
                          {rule.type==='Income'?'+':'-'}{rule.is_variable ? '~' : ''}{formatCurrency(displayAmt)}
                        </div>
                        <button className="icon-btn" aria-label="Delete recurring rule" style={{ color:'var(--danger)' }} onClick={()=>setConfirm({open:true,id:rule.id,type:'recurring'})}><Trash2 size={15}/></button>
                      </div>
                    );
                  })}
                </div>

                {/* Upcoming 30-day timeline */}
                <div style={{ marginTop:'1.5rem' }}>
                  <h3 style={{ margin:'0 0 1rem', fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'2px', color:'var(--text-muted)' }}>UPCOMING — NEXT 30 DAYS</h3>
                  {(() => {
                    const today = new Date(); today.setHours(0,0,0,0);
                    const currentMonth = todayYMD().slice(0, 7);
                    const upcoming = [];
                    recurringRules.forEach(rule => {
                      if (rule.paused) return;
                      const isFlexible = rule.schedule_mode === 'flexible' || !rule.day_of_month;
                      if (isFlexible) {
                        if (rule.last_applied_month !== currentMonth) {
                          upcoming.push({ ...rule, fireDate: today, diffDays: 0, isFlexible: true });
                        }
                        return;
                      }
                      const day = rule.day_of_month || 1;
                      for (let mOffset = 0; mOffset <= 1; mOffset++) {
                        if (mOffset === 0 && rule.last_applied_month === currentMonth) continue;
                        const d = new Date(today.getFullYear(), today.getMonth() + mOffset, day);
                        const diffDays = Math.ceil((d - today) / (1000*60*60*24));
                        if (diffDays >= 0 && diffDays <= 30) {
                          upcoming.push({ ...rule, fireDate: d, diffDays, isFlexible: false });
                        }
                      }
                    });
                    upcoming.sort((a,b) => a.fireDate - b.fireDate);
                    if (upcoming.length === 0) return <p style={{ color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.82rem' }}>No pending recurring transactions in the next 30 days.</p>;
                    return (
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                        {upcoming.map((item, i) => {
                          const col = item.type==='Income' ? '#4ade80' : item.type==='Expense' ? '#f87171' : '#a78bfa';
                          const displayAmt = Number(item.avg_amount || item.amount || 0);
                          return (
                            <div key={`${item.id}-${i}`}
                              style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.6rem 0.875rem', background:`${col}08`, border:`1px solid ${col}22`, borderLeft:`3px solid ${col}`, borderRadius:8 }}>
                              <div style={{ minWidth:56, textAlign:'center' }}>
                                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>
                                  {item.isFlexible ? 'FLEXIBLE' : item.diffDays === 0 ? 'TODAY' : `in ${item.diffDays}d`}
                                </div>
                                <div style={{ fontSize:'0.75rem', fontWeight:700, color:col, fontFamily:'Inter, sans-serif' }}>
                                  {item.isFlexible ? 'This Mo' : item.fireDate.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                                </div>
                              </div>
                              <span style={{ fontSize:'1.2rem' }}>{getCategoryEmoji(item.category)}</span>
                              <div style={{ flex:1 }}>
                                <div style={{ fontWeight:600, fontSize:'0.85rem' }}>{item.name || item.category || item.type}</div>
                                <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>{item.notes || item.type}</div>
                              </div>
                              <div style={{ fontWeight:700, color:col, fontFamily:'Inter, sans-serif' }}>
                                {item.type==='Income'?'+':'-'}{item.is_variable ? '~' : ''}{formatCurrency(displayAmt)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── All Transactions tab ── */}
        {activeTab === 'all' && (
          <>
            {/* Summary strip */}
            <motion.div className="monthly-strip" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} style={{ marginBottom:'1.25rem' }}>
              <div className="monthly-strip-item">
                <div className="monthly-strip-label">{stats.isAccountView ? 'INFLOW (IN)' : 'INCOME'}</div>
                <div className="monthly-strip-value text-success">+{formatCurrency(stats.income)}</div>
              </div>
              <div className="monthly-strip-item">
                <div className="monthly-strip-label">{stats.isAccountView ? 'OUTFLOW (OUT)' : 'EXPENSES'}</div>
                <div className="monthly-strip-value text-danger">-{formatCurrency(stats.expense)}</div>
              </div>
              <div className="monthly-strip-item">
                <div className="monthly-strip-label">{stats.isAccountView ? 'NET MOVEMENT' : 'NET'}</div>
                <div className="monthly-strip-value" style={{ color:stats.net>=0?'var(--success)':'var(--danger)' }}>{stats.net>=0?'+':''}{formatCurrency(stats.net)}</div>
              </div>
              <div className="monthly-strip-item"><div className="monthly-strip-label">RECORDS</div><div className="monthly-strip-value text-cyan">{stats.count}</div></div>
              {/* Daily Spend Limit badge */}
              {(() => {
                const limit = parseFloat(localStorage.getItem('vm_daily_limit') || '0');
                if (!limit) return null;
                const todayStr = todayYMD();
                const todaySpend = transactions.filter(isActivePayment).filter(t => ['Expense', 'Loan Payment'].includes(t.type) && t.date === todayStr).reduce((s, t) => s + (Number(t.amount) || 0), 0);
                const pct = Math.round((todaySpend / limit) * 100);
                const over = todaySpend > limit;
                return (
                  <div className="monthly-strip-item" style={{ borderLeft: `2px solid ${over ? '#f87171' : '#fb923c'}33` }}>
                    <div className="monthly-strip-label" style={{ color: over ? '#f87171' : '#fb923c' }}>TODAY {over ? '🔴 OVER' : `${pct}%`}</div>
                    <div className="monthly-strip-value" style={{ color: over ? '#f87171' : '#fb923c', fontSize:'0.85rem' }}>{formatCurrency(todaySpend)} / {formatCurrency(limit)}</div>
                  </div>
                );
              })()}
            </motion.div>

            {showInsights && <TransactionInsights rows={filtered} activeSearch={searchQuery} onPickCategory={setSearchQuery} />}

            {recurringSuggestion && (
              <div className="tx-suggest" role="status">
                <span>Looks recurring: <b>{recurringSuggestion.notes || recurringSuggestion.category}</b> · ~{formatCurrency(recurringSuggestion.amount)} monthly ({recurringSuggestion.count}×)</span>
                <span className="tx-suggest-actions">
                  <button type="button" className="tx-chip is-on" onClick={createSuggestedReminder}>Create reminder</button>
                  <button type="button" className="tx-chip" onClick={dismissSuggestion} aria-label="Dismiss suggestion">Dismiss</button>
                </span>
              </div>
            )}

            <div className="tx-toolbar">
              <div className="tx-seg" role="tablist" aria-label="Transaction type">
                {['All', 'Expense', 'Income', 'Transfer', 'Loan Payment'].map(t => (
                  <button key={t} type="button" role="tab" aria-selected={filterType === t} className={filterType === t ? 'is-on' : ''} onClick={() => { haptic(); setFilterType(t); }}>
                    {t === 'Loan Payment' ? 'Loans' : t}<i>{typeCounts[t]}</i>
                  </button>
                ))}
              </div>
              <div className="tx-tools">
                <select
                  aria-label="Filter by account"
                  className={`tx-chip${filterAccount !== 'All' ? ' is-on' : ''}`}
                  value={filterAccount}
                  onChange={e => { haptic(); setFilterAccount(e.target.value); }}
                  style={{ cursor: 'pointer', maxWidth: 210 }}
                >
                  <option value="All">🏦 All Accounts</option>
                  {accounts.map(a => (
                    <option key={a.id} value={String(a.id)}>
                      {a.name} ({formatCurrency(a.balance)})
                    </option>
                  ))}
                </select>
                <button type="button" className={`tx-chip${showInsights ? ' is-on' : ''}`} onClick={toggleInsights} aria-pressed={showInsights}>📊 Insights</button>
                <button type="button" className={`tx-chip${compact ? ' is-on' : ''}`} onClick={toggleCompact} aria-pressed={compact}>☰ Compact</button>
                <button type="button" className="tx-chip" onClick={() => setSelectedIds(prev => prev.size === visibleFiltered.length ? new Set() : new Set(visibleFiltered.map(t => t.id)))}>
                  {selectedIds.size && selectedIds.size === visibleFiltered.length ? 'Deselect all' : `Select all (${visibleFiltered.length})`}
                </button>
                <button type="button" className="tx-chip" onClick={handleExportCSV} title="Export filtered or selected rows to CSV with summary footer">
                  ⬇ CSV {selectedIds.size > 0 ? `(${selectedIds.size})` : `(${filtered.length})`}
                </button>
                <button type="button" className="tx-chip" onClick={handleExportExcel} title="Export filtered or selected rows to Excel (.xlsx) with category summary sheet">
                  ⬇ Excel
                </button>
                <span className="kbd-hint" title="Shortcuts"><kbd>N</kbd> new · <kbd>/</kbd> search</span>
              </div>
            </div>

            <div className="tx-views" aria-label="Saved views">
              {savedViews.map(v => (
                <span key={v.id} className="tx-view">
                  <button type="button" onClick={() => applyView(v)} title="Apply view">{v.name}</button>
                  <button type="button" onClick={() => deleteView(v.id)} aria-label={`Delete view ${v.name}`}>×</button>
                </span>
              ))}
              {savingView ? (
                <form onSubmit={saveView} className="tx-view-form">
                  <input autoFocus aria-label="View name" placeholder="View name" value={viewName} maxLength={30} onChange={e => setViewName(e.target.value)} />
                  <button type="submit" className="tx-chip is-on">Save</button>
                  <button type="button" className="tx-chip" onClick={() => { setSavingView(false); setViewName(''); }}>Cancel</button>
                </form>
              ) : (
                <button type="button" className="tx-chip" disabled={!hasActiveFilters} onClick={() => setSavingView(true)}>＋ Save view</button>
              )}
            </div>

            {/* Filter bar */}
            <div className="filter-scroll-row quiet-filter-row" style={{ marginBottom:'1.25rem', alignItems:'stretch' }}>
              {/* Search */}
              <div style={{ display:'flex', flex:'1 1 200px', alignItems:'center', gap:'0.625rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
                <Search size={16} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
                <input type="text" aria-label="Search transactions" placeholder="Search category, notes, account…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.875rem', flex:1, minWidth:0 }}/>
                {searchQuery && <button aria-label="Clear search" onClick={()=>setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}><X size={14}/></button>}
              </div>
              <details className="quiet-section quiet-filter-panel">
                <summary>Filters & sorting <span>{dateFrom || dateTo || filterType !== 'All' || auditFilter !== 'All' || minAmt || maxAmt || filterTag || filterTaxDeductible || filterAnomalies ? 'Filters applied' : 'Optional'}</span></summary>
                <div className="quiet-filter-controls">
              {/* Date Range & Presets */}
              <div style={{ display:'flex', flexWrap:'nowrap', gap:'0.5rem', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'2px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
                  <input type="date" aria-label="Date from" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text-primary)', fontSize:'0.82rem' }}/>
                  <span style={{ color:'var(--text-muted)' }}>-</span>
                  <input type="date" aria-label="Date to" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text-primary)', fontSize:'0.82rem' }}/>
                </div>
                {['All', 'This Month', 'Last 30d', 'Last 3mo', 'This Year'].map(p => (
                  <button key={p} onClick={() => handlePreset(p)} className="btn btn-secondary" style={{ whiteSpace:'nowrap', padding: '0.5rem 0.8rem', fontSize: '0.75rem', background: (p === 'All' && !dateFrom) || (p !== 'All' && dateFrom) ? 'rgba(255,255,255,0.05)' : undefined }}>{p}</button>
                ))}
              </div>
              {/* Type */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem', minWidth:130 }}>
                <Filter size={14} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
                <select aria-label="Filter by transaction type" value={filterType} onChange={e=>setFilterType(e.target.value)}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.82rem', color:'var(--text-primary)', cursor:'pointer' }}>
                  {['All','Expense','Income','Transfer','Loan Payment'].map(t=><option key={t} value={t} style={{ background:'var(--bg-deep)' }}>{t}</option>)}
                </select>
              </div>
              <label>Audit status <select aria-label="Audit status" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>{['All','Active','Reversed','Reversal'].map(status => <option key={status}>{status}</option>)}</select></label>
              {/* Sort */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem', minWidth:130 }}>
                <ArrowUpDown size={14} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
                <select aria-label="Sort transactions" value={sortBy} onChange={e=>setSortBy(e.target.value)}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.82rem', color:'var(--text-primary)', cursor:'pointer' }}>
                  {['Newest','Oldest','Highest Amount','Lowest Amount'].map(s=><option key={s} value={s} style={{ background:'var(--bg-deep)' }}>{s}</option>)}
                </select>
              </div>
              {/* Amount range */}
              <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
                <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', whiteSpace:'nowrap' }}>💰</span>
                <input type="number" inputMode="decimal" aria-label="Minimum amount" placeholder="Min" value={minAmt} onChange={e=>setMinAmt(e.target.value)}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, width:72, fontSize:'0.8rem', color:'var(--text-primary)' }}/>
                <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>–</span>
                <input type="number" inputMode="decimal" aria-label="Maximum amount" placeholder="Max" value={maxAmt} onChange={e=>setMaxAmt(e.target.value)}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, width:72, fontSize:'0.8rem', color:'var(--text-primary)' }}/>
              </div>
              {/* Active tag filter pill */}
              {filterTag && (
                <button onClick={() => setFilterTag('')}
                  style={{ display:'flex', alignItems:'center', gap:'0.3rem', background:'rgba(168,85,247,0.15)', border:'1px solid rgba(168,85,247,0.4)', borderRadius:100, padding:'0.4rem 0.75rem', color:'#c084fc', fontSize:'0.75rem', fontFamily:'Inter, sans-serif', cursor:'pointer', whiteSpace:'nowrap' }}>
                  #{filterTag} ✕
                </button>
              )}
              {/* Tax Deductible filter pill */}
              <button
                onClick={() => setFilterTaxDeductible(prev => !prev)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  background: filterTaxDeductible ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${filterTaxDeductible ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 100, padding: '0.4rem 0.8rem',
                  color: filterTaxDeductible ? '#4ade80' : 'var(--text-secondary)',
                  fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
                }}
              >
                🏷️ Tax Deductible {filterTaxDeductible ? '✓' : ''}
              </button>
              {/* Duplicates & Spikes filter pill */}
              <button
                onClick={() => { haptic(); setFilterAnomalies(prev => !prev); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  background: filterAnomalies ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${filterAnomalies ? 'rgba(251,191,36,0.5)' : anomalyCount > 0 ? 'rgba(251,191,36,0.28)' : 'rgba(255,255,255,0.07)'}`,
                  borderRadius: 100, padding: '0.4rem 0.8rem',
                  color: filterAnomalies ? '#fbbf24' : anomalyCount > 0 ? '#fcd34d' : 'var(--text-secondary)',
                  fontSize: '0.75rem', fontFamily: 'Inter, sans-serif', fontWeight: 600,
                  cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
                }}
                title="Scan for suspected duplicate transactions or unusual spend spikes"
              >
                🔍 Duplicates & Spikes {anomalyCount > 0 ? `(${anomalyCount})` : ''} {filterAnomalies ? '✓' : ''}
              </button>
                </div>
              </details>
            </div>

            {rememberedNotes.length > 0 && <details className="quiet-section"><summary>Saved note searches</summary><div className="quiet-section-content">
            {/* Remembered Notes Quick Search Row */}
            {rememberedNotes.length > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'1.25rem', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'4px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', textTransform:'uppercase', letterSpacing:'1px', whiteSpace:'nowrap', flexShrink:0 }}>
                  <Brain size={14} style={{ color:'var(--cyan, #4ade80)' }} />
                  <span>Notes Memory:</span>
                </div>
                {rememberedNotes.slice(0, 10).map(item => {
                  const isSelected = searchQuery.toLowerCase().trim() === item.text.toLowerCase().trim();
                  return (
                    <button
                      key={item.text}
                      type="button"
                      onClick={() => {
                        haptic();
                        setSearchQuery(isSelected ? '' : item.text);
                      }}
                      style={{
                        display:'inline-flex', alignItems:'center', gap:'0.35rem',
                        padding:'0.35rem 0.7rem', borderRadius:100,
                        background: isSelected ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
                        border: isSelected ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.07)',
                        color: isSelected ? '#4ade80' : 'var(--text-secondary)',
                        fontSize:'0.75rem', fontFamily:'Inter, sans-serif', fontWeight: isSelected ? 600 : 400,
                        cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                        transition:'all 0.15s ease',
                      }}
                      title={`Filter by note "${item.text}" (${item.count} txns)`}
                    >
                      <span>{item.text}</span>
                      <span style={{ fontSize:'0.65rem', opacity:0.65, borderRadius:6, background:'rgba(255,255,255,0.06)', padding:'0 0.3rem' }}>
                        {item.count}
                      </span>
                      {isSelected && <X size={11} style={{ marginLeft: 2 }} />}
                    </button>
                  );
                })}
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => { haptic(); setSearchQuery(''); }}
                    style={{
                      padding:'0.35rem 0.7rem', borderRadius:100,
                      background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)',
                      color:'#f87171', fontSize:'0.72rem', fontFamily:'Inter, sans-serif',
                      cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                    }}
                  >
                    Clear filter ✕
                  </button>
                )}
              </div>
            )}

            </div></details>}
            {/* Grouped transaction list */}
            {loading ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                {[...Array(5)].map((_,i)=>(
                  <div key={i} style={{ height:70, background:'rgba(255,255,255,0.02)', borderRadius:10, animation:'pulse 1.5s ease-in-out infinite', animationDelay:`${i*0.1}s`}}/>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>
                <div style={{ fontSize:'3rem', marginBottom:'1rem', opacity:0.3 }}>📭</div>
                <div style={{ fontSize:'0.82rem', letterSpacing:'1px' }}>NO TRANSACTIONS FOUND</div>
                {(searchQuery||filterType!=='All'||filterAccount!=='All'||dateFrom||dateTo||minAmt||maxAmt||filterTag||filterAnomalies) && (
                  <button onClick={()=>{setSearchQuery('');setFilterType('All');setFilterAccount('All');setDateFrom('');setDateTo('');setMinAmt('');setMaxAmt('');setFilterTag('');setFilterAnomalies(false);}} className="btn btn-secondary" style={{ marginTop:'1.5rem', fontSize:'0.8rem' }}>Clear Filters</button>
                )}
              </div>
            ) : (
              <div className={compact ? 'tx-compact' : undefined} style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

                {/* Bulk action bar */}
                {selectedIds.size > 0 && (
                  <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                    style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1.25rem', background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, gap:'1rem' }}>
                    <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.88rem', fontWeight:600, color:'#f87171' }}>
                      {selectedIds.size} selected
                    </div>
                    <div style={{ display:'flex', gap:'0.5rem' }}>
                      <button onClick={() => setSelectedIds(new Set())} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>
                        Clear
                      </button>
                      {bulkMode ? (
                        <form onSubmit={handleBulkEdit} style={{ display:'flex', gap:'0.4rem' }}>
                          <input autoFocus aria-label={bulkMode === 'category' ? 'Bulk category' : 'Bulk tag'} list="tx-bulk-cats" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder={bulkMode === 'category' ? 'Category' : 'Tag'} style={{ fontSize:'0.78rem', padding:'0.35rem 0.6rem', width:150 }} />
                          {bulkMode === 'category' && <datalist id="tx-bulk-cats">{getCategories().map(c => <option key={c} value={c} />)}</datalist>}
                          <button type="submit" className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Apply</button>
                          <button type="button" className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }} onClick={() => { setBulkMode(null); setBulkValue(''); }}>Cancel</button>
                        </form>
                      ) : (<>
                        <button onClick={() => setBulkMode('category')} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Set category</button>
                        <button onClick={() => setBulkMode('tag')} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Add tag</button>
                      </>)}
                      <button onClick={handleBulkDelete} className="btn" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem', background:'rgba(239,68,68,0.2)', color:'#f87171', border:'1px solid rgba(239,68,68,0.4)' }}>
                        🗑 Delete {selectedIds.size}
                      </button>
                    </div>
                  </motion.div>
                )}

                {grouped.map(([date, txs], groupIdx) => {
                  const dayIncome  = txs.filter(isActivePayment).filter(t=>t.type==='Income').reduce((s,t)=>s+t.amount,0);
                  const dayExpense = txs.filter(isActivePayment).filter(t=>t.type==='Expense'||t.type==='Loan Payment').reduce((s,t)=>s+t.amount,0);
                  return (
                    <div key={date} className={groupIdx >= 2 ? 'heavy-section-deferred' : undefined}>
                      {/* Date group header */}
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem', paddingBottom:'0.5rem', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                        <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem', fontWeight:600, color:'var(--text-secondary)', letterSpacing:'1px' }}>
                          {formatGroupDate(date)}
                        </div>
                        <div style={{ display:'flex', gap:'1rem', fontFamily:'Inter, sans-serif', fontSize:'0.72rem' }}>
                          {dayIncome  > 0 && <span style={{ color:'var(--success)' }}>+{formatCurrency(dayIncome)}</span>}
                          {dayExpense > 0 && <span style={{ color:'var(--danger)' }}>-{formatCurrency(dayExpense)}</span>}
                        </div>
                      </div>

                      <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
                          {txs.map((tx) => {
                            const color = TYPE_COLOR[tx.type] || '#aaa';
                            const bg    = TYPE_BG[tx.type]    || 'rgba(255,255,255,0.02)';
                            const isIncome = tx.type === 'Income';
                            const isExpense = tx.type === 'Expense' || tx.type === 'Loan Payment';
                            const canEdit = isEditableTransaction(tx);
                            const txAccId = isIncome ? tx.to_account_id : (tx.from_account_id || tx.to_account_id);
                            const txCurrency = tx.currency || accounts.find(a => String(a.id) === String(txAccId))?.currency;
                            const filteredAccCurrency = filterAccount !== 'All' ? accounts.find(a => String(a.id) === String(filterAccount))?.currency : undefined;
                            return (
                              <div
                                key={tx.id}
                                style={{ position: 'relative' }}
                              >
                                {isMobile && canEdit && (
                                  <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, background: 'var(--danger)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '1.5rem', color: '#fff', zIndex: 0 }}>
                                    <Trash2 size={18}/>
                                  </div>
                                )}
                                <motion.div
                                  data-tx-row
                                  drag={isMobile && canEdit ? "x" : false}
                                  dragConstraints={{ left: -100, right: 0 }}
                                  dragElastic={0.1}
                                  dragSnapToOrigin
                                  onDragEnd={(e, { offset }) => {
                                    if (offset.x < -80) {
                                      setConfirm({open:true,id:tx.id,type:'txn'});
                                    }
                                  }}
                                  onClick={() => {
                                    haptic();
                                    setPopupTx(tx);
                                  }}
                                  style={{
                                    position: 'relative',
                                    zIndex: 1,
                                    display:'flex', alignItems:'center',
                                    padding:'0.75rem 1rem',
                                    background: bg,
                                    borderRadius:10,
                                    border:'1px solid var(--border-glass)',
                                    borderLeft:`2px solid ${color}`,
                                    gap:'0.875rem',
                                    cursor:'pointer',
                                    transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                                  }}
                              >
                                {/* Checkbox for bulk select */}
                                <input
                                  type="checkbox"
                                  aria-label={`Select transaction ${tx.category || tx.type}`}
                                  checked={selectedIds.has(tx.id)}
                                  onChange={e => {
                                    e.stopPropagation();
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(tx.id)) next.delete(tx.id);
                                      else next.add(tx.id);
                                      return next;
                                    });
                                  }}
                                  style={{ width:15, height:15, flexShrink:0, accentColor:'#f87171', cursor:'pointer' }}
                                  onClick={e => e.stopPropagation()}
                                />

                                {/* Emoji icon */}
                                <div style={{ fontSize:'1.5rem', flexShrink:0, width:36, textAlign:'center', lineHeight:1 }}>
                                  {getCategoryEmoji(tx.category) || (tx.type === 'Income' ? '💰' : tx.type === 'Transfer' ? '🔄' : tx.type === 'Loan Payment' ? '🏦' : '💸')}
                                </div>

                                {/* Main info */}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                                    <span style={{ fontWeight:600, fontSize:'0.92rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                      <Highlight text={tx.category || tx.type} query={searchQuery} />
                                    </span>
                                    <span style={{ fontSize:'0.65rem', fontFamily:'Inter, sans-serif', padding:'0.1rem 0.4rem', borderRadius:4, background:'var(--bg-elevated)', color, flexShrink:0 }}>
                                      {tx.type}
                                    </span>
                                    {canEdit && quickEditId !== tx.id && (
                                      <button
                                        type="button"
                                        aria-label="Inline quick edit"
                                        title="Quick edit category & notes"
                                        onClick={(e) => startQuickEdit(tx, e)}
                                        style={{
                                          background: 'transparent',
                                          border: '1px solid rgba(255,255,255,0.08)',
                                          borderRadius: 4,
                                          padding: '0.08rem 0.35rem',
                                          fontSize: '0.64rem',
                                          color: 'var(--text-muted)',
                                          cursor: 'pointer',
                                          fontFamily: 'Inter, sans-serif',
                                          flexShrink: 0,
                                        }}
                                      >
                                        ✎ Quick edit
                                      </button>
                                    )}
                                    {(tx.tax_deductible || tx.is_tax_deductible) && (
                                      <span style={{ fontSize:'0.63rem', fontFamily:'Inter, sans-serif', padding:'0.1rem 0.4rem', borderRadius:4, background:'rgba(74,222,128,0.14)', color:'#4ade80', border:'1px solid rgba(74,222,128,0.3)', flexShrink:0 }}>
                                        🏷️ Tax {tx.tax_category ? `(${tx.tax_category})` : ''}
                                      </span>
                                    )}
                                    {tx.status === 'pending' && (
                                      <span style={{ fontSize:'0.63rem', fontFamily:'Inter, sans-serif', padding:'0.1rem 0.4rem', borderRadius:4, background:'rgba(251,191,36,0.15)', color:'#fbbf24', border:'1px solid rgba(251,191,36,0.3)', flexShrink:0 }}>
                                        ⏳ Pending
                                      </span>
                                    )}
                                    {anomalyMap[tx.id] && (
                                      <span style={{ fontSize:'0.63rem', fontFamily:'Inter, sans-serif', fontWeight:700, padding:'0.1rem 0.45rem', borderRadius:4, background: anomalyMap[tx.id].isDuplicate ? 'rgba(251,191,36,0.18)' : 'rgba(167,139,250,0.18)', color: anomalyMap[tx.id].isDuplicate ? '#fbbf24' : '#c084fc', border:`1px solid ${anomalyMap[tx.id].isDuplicate ? 'rgba(251,191,36,0.4)' : 'rgba(167,139,250,0.4)'}`, flexShrink:0 }}>
                                        {anomalyMap[tx.id].label}
                                      </span>
                                    )}
                                  </div>
                                  <div style={{ fontSize:'0.76rem', color:'var(--text-secondary)', fontFamily:'Inter, sans-serif', marginTop:'0.2rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                    {tx.type === 'Transfer'
                                      ? `${getAccountName(tx.from_account_id)} → ${getAccountName(tx.to_account_id)}`
                                      : tx.type === 'Income'
                                        ? `→ ${getAccountName(tx.to_account_id)}`
                                        : `← ${getAccountName(tx.from_account_id)}`}
                                  </div>
                                  {/* Tags */}
                                  {(tx.tags||[]).length > 0 && (
                                    <div className="tx-extra" style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem', marginTop:'0.3rem' }}>
                                      {tx.tags.map(tag => (
                                        <button key={tag} onClick={e => { e.stopPropagation(); setFilterTag(filterTag===tag ? '' : tag); }}
                                          style={{ background: filterTag===tag ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.1)', border:`1px solid ${filterTag===tag ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.25)'}`, borderRadius:100, padding:'0.1rem 0.45rem', fontSize:'0.65rem', color:'#c084fc', cursor:'pointer', fontFamily:'Inter, sans-serif', letterSpacing:'0.3px' }}>
                                          #{tag}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {tx.notes && quickEditId !== tx.id && (
                                    <div className="tx-extra" style={{ fontSize:'0.78rem', color:'var(--text-secondary, #8892aa)', marginTop:'0.25rem', display:'flex', alignItems:'flex-start', gap:'0.35rem', lineHeight:1.4 }}>
                                      <span style={{ flexShrink:0, opacity:0.7 }}>📝</span>
                                       <span style={{ overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}><Highlight text={tx.notes} query={searchQuery} /></span>
                                    </div>
                                  )}
                                  {quickEditId === tx.id && (
                                    <form
                                      onSubmit={(e) => saveQuickEdit(tx, e)}
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', alignItems:'center', marginTop:'0.4rem' }}
                                    >
                                      <input
                                        type="text"
                                        aria-label="Quick edit category"
                                        list="cat-options"
                                        value={quickCat}
                                        onChange={(e) => setQuickCat(e.target.value)}
                                        placeholder="Category"
                                        autoFocus
                                        style={{ padding:'0.3rem 0.55rem', fontSize:'0.78rem', borderRadius:6, width:140 }}
                                      />
                                      <input
                                        type="text"
                                        aria-label="Quick edit notes"
                                        value={quickNotes}
                                        onChange={(e) => setQuickNotes(e.target.value)}
                                        placeholder="Notes / merchant"
                                        style={{ padding:'0.3rem 0.55rem', fontSize:'0.78rem', borderRadius:6, flex:'1 1 150px', minWidth:120 }}
                                      />
                                      <button type="submit" className="tx-chip is-on" style={{ padding:'0.28rem 0.65rem', fontSize:'0.74rem' }}>
                                        Save
                                      </button>
                                      <button type="button" className="tx-chip" onClick={cancelQuickEdit} style={{ padding:'0.28rem 0.65rem', fontSize:'0.74rem' }}>
                                        Cancel
                                      </button>
                                    </form>
                                  )}
                                  {tx.receipt_url && (
                                    <div className="tx-extra" style={{ marginTop:'0.3rem' }} onClick={e => e.stopPropagation()}>
                                      <ReceiptImage
                                        value={tx.receipt_url}
                                        thumb={tx.receipt_thumb}
                                        style={{ height:36, width:'auto', maxWidth:80, minWidth:36, borderRadius:4, objectFit:'cover', border:'1px solid rgba(74,222,128,0.25)', opacity:0.9 }}
                                      />
                                    </div>
                                  )}
                                </div>

                                {/* Amount + Bank-Statement Running Balance */}
                                <div style={{ textAlign:'right', flexShrink:0 }}>
                                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'1rem', color }}>
                                    {isExpense ? '-' : isIncome ? '+' : ''}{formatCurrency(tx.amount, txCurrency ? { currency: txCurrency } : {})}{auditStatus(tx) !== 'Active' && <small style={{display:'block'}}>{auditStatus(tx)}</small>}
                                  </div>
                                  {tx.fee_amount > 0 && (
                                    <div style={{ fontSize:'0.68rem', color:'var(--danger)', marginTop:1 }}>Fee: {formatCurrency(tx.fee_amount, txCurrency ? { currency: txCurrency } : {})}</div>
                                  )}
                                  {filterAccount !== 'All' && runningBalanceMap.has(tx.id) && (
                                    <div data-testid="tx-running-balance" style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2, fontVariantNumeric:'tabular-nums' }}>
                                      Bal: {formatCurrency(runningBalanceMap.get(tx.id), filteredAccCurrency ? { currency: filteredAccCurrency } : {})}
                                    </div>
                                  )}
                                </div>

                                {/* Actions (desktop inline; on mobile, tap row for TransactionPopup or swipe to delete) */}
                                {!isMobile && (
                                  <div style={{ display:'flex', gap:'0.2rem', flexShrink:0 }}>
                                    {!tx.is_transfer_fee && (
                                      <button type="button" className="icon-btn" aria-label="Duplicate transaction" onClick={(e) => { e.stopPropagation(); duplicateTx(tx); }} title="Duplicate">
                                        <Copy size={13}/>
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button type="button" className="icon-btn" aria-label="Edit transaction" onClick={(e) => { e.stopPropagation(); openEditModal(tx); }} title="Edit">
                                        <Edit2 size={14}/>
                                      </button>
                                    )}
                                    {canEdit && (
                                      <button type="button" className="icon-btn" aria-label="Delete transaction" style={{ color:'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setConfirm({open:true,id:tx.id,type:'txn'}); }} title="Delete">
                                        <Trash2 size={14}/>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </motion.div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}

                {visibleFiltered.length < filtered.length && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                      Showing {visibleFiltered.length} of {filtered.length} transactions
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setVisibleLimit(prev => prev + 60)}
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.95rem' }}
                    >
                      Load 60 More
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setVisibleLimit(filtered.length)}
                      style={{ fontSize: '0.78rem', padding: '0.45rem 0.95rem' }}
                    >
                      Show All ({filtered.length})
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── Add / Edit Modal ── */}
        <Modal isOpen={isModalOpen} onClose={()=>setIsModalOpen(false)} title={editMode ? '✏️ Edit Transaction' : '+ New Transaction'}>
          <datalist id="cat-options">{uniqueCategories.map(c=><option key={c} value={c}/>)}</datalist>
          <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
            {!editMode && <SMSParserBox accounts={accounts} onApply={handleApplySMS} />}
            {!editMode && (() => {
              const freqList = getFrequentTemplates(transactions, 6);
              if (!freqList.length) return null;
              return (
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 11,
                  padding: '0.5rem 0.65rem',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.35rem',
                    fontSize: '0.68rem',
                    fontFamily: 'Inter, sans-serif',
                    color: 'var(--text-muted)',
                    fontWeight: 700,
                    letterSpacing: '0.4px'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#fbbf24' }}>
                      <Zap size={11} /> 1-TAP FREQUENT REPEAT
                    </span>
                    <span>Tap to fill all fields</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
                    {freqList.map(tpl => (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => {
                          haptic(15);
                          setFormData(f => ({
                            ...f,
                            type: tpl.type || 'Expense',
                            amount: tpl.amount || f.amount,
                            category: tpl.category || f.category,
                            notes: tpl.notes || tpl.label || '',
                            from_account_id: tpl.from_account_id || f.from_account_id,
                            to_account_id: tpl.to_account_id ? `account_${tpl.to_account_id}` : f.to_account_id,
                          }));
                          toast.success(`⚡ Filled: ${tpl.label} · ${formatCurrency(tpl.amount)}`, { duration: 2200 });
                        }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.32rem 0.65rem',
                          borderRadius: 999,
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.09)',
                          color: 'var(--text-primary)',
                          fontSize: '0.72rem',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 600,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                        }}
                      >
                        <span>{getCategoryEmoji(tpl.category)}</span>
                        <span>{tpl.label}</span>
                        <span style={{ color: tpl.type === 'Income' ? '#4ade80' : '#fbbf24', fontWeight: 700, fontSize: '0.68rem' }}>
                          {formatCurrency(tpl.amount)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Type selector */}
            <div>
              <label style={{ display:'block', marginBottom:'0.5rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Type</label>
              <div style={{ display:'flex', gap:'0.5rem' }}>
                {['Expense','Income','Transfer'].map(t=>(
                  <button key={t} type="button" onClick={()=>setFormData(f=>{
                    let nextTo = f.to_account_id || '';
                    if (t === 'Transfer') {
                      const rawId = String(nextTo).replace(/^account_/, '');
                      if (!String(nextTo).startsWith('loan_')) {
                        const fallbackAcc = accounts.find(a => String(a.id) !== String(f.from_account_id)) || accounts[0];
                        const chosenId = (rawId && String(rawId) !== String(f.from_account_id)) ? rawId : (fallbackAcc?.id || rawId);
                        nextTo = chosenId ? `account_${chosenId}` : '';
                      }
                    } else if (t === 'Income') {
                      if (String(nextTo).startsWith('loan_')) nextTo = accounts[0]?.id || '';
                      else nextTo = String(nextTo).replace(/^account_/, '') || accounts[0]?.id || '';
                    }
                    return { ...f, type: t, to_account_id: nextTo };
                  })}
                    style={{ flex:1, padding:'0.6rem', borderRadius:8, border:'none', cursor:'pointer', fontFamily:'Inter, sans-serif', fontSize:'0.78rem', fontWeight:600, transition:'all 0.15s',
                      background: formData.type===t ? TYPE_BG[t] : 'rgba(255,255,255,0.04)',
                      color: formData.type===t ? TYPE_COLOR[t] : '#555',
                      borderBottom: formData.type===t ? `2px solid ${TYPE_COLOR[t]}` : '2px solid transparent' }}>
                    {t==='Expense'?'💸':t==='Income'?'💰':'🔄'} {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Amount + Date row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.875rem' }}>
              <div>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{`Amount (${getCurrencyLabel()})`}</label>
                <CurrencyInput required value={formData.amount} onChange={v=>setFormData(f=>({...f,amount:v}))}/>
              </div>
              {!isRecurring && (
                <div>
                  <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Date</label>
                  <input type="date" required value={formData.date} onChange={e=>setFormData(f=>({...f,date:e.target.value}))} style={{ width:'100%' }}/>
                </div>
              )}
              {isRecurring && (
                <div>
                  <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Day of Month (1–28)</label>
                  <input type="number" inputMode="numeric" min="1" max="28" required value={formData.day_of_month} onChange={e=>setFormData(f=>({...f,day_of_month:parseInt(e.target.value)||1}))} style={{ width:'100%' }}/>
                </div>
              )}
            </div>

            {/* Foreign currency converter (optional) */}
            {!isRecurring && (
              <div style={{ background:'rgba(0,245,255,0.04)', border:'1px solid rgba(0,245,255,0.12)', borderRadius:10, padding:'0.75rem 1rem' }}>
                <div style={{ fontSize:'0.72rem', letterSpacing:'1.5px', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginBottom:'0.5rem' }}>💱 FOREIGN CURRENCY (optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.5rem' }}>
                  <div>
                    <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Foreign Amount</label>
                    <input type="number" inputMode="decimal" min="0" step="any" placeholder="e.g. 100"
                      value={formData._foreignAmt || ''}
                      onChange={e => {
                        const famt = parseFloat(e.target.value) || 0;
                        const cur = formData._foreignCur || 'USD';
                        // Try to get rate from cached exchange rates
                        try {
                          const rates = JSON.parse(localStorage.getItem('vm_fx_rates') || '{}');
                          const baseCur = (localStorage.getItem('vm_currency') || 'LKR').toUpperCase();
                          const baseRate = rates[baseCur] || 1;
                          const fRate = rates[cur] || 1;
                          const converted = famt > 0 ? parseFloat(((famt / fRate) * baseRate).toFixed(2)) : 0;
                          setFormData(f => ({ ...f, _foreignAmt: e.target.value, _foreignCur: cur, amount: converted || f.amount }));
                        } catch { setFormData(f => ({ ...f, _foreignAmt: e.target.value })); }
                      }}
                      style={{ width:'100%', fontSize:'0.85rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display:'block', marginBottom:'0.3rem', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Currency</label>
                    <select value={formData._foreignCur || 'USD'}
                      onChange={e => setFormData(f => ({ ...f, _foreignCur: e.target.value }))}
                      style={{ width:'100%', background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'0.5rem', color:'var(--text-primary)', fontSize:'0.85rem', fontFamily:'Inter, sans-serif' }}>
                      {['USD','EUR','GBP','AUD','CAD','SGD','JPY','INR','AED','MYR','CHF','CNY'].map(c => <option key={c} value={c} style={{ background:'#0a0a1a' }}>{c}</option>)}
                    </select>
                  </div>
                </div>
                {formData._foreignAmt > 0 && <div style={{ fontSize:'0.7rem', color:'var(--cyan,#00f5ff)', marginTop:'0.3rem', fontFamily:'Inter, sans-serif' }}>→ Converted: {getCurrencyLabel()} {formData.amount?.toLocaleString()}</div>}
              </div>
            )}

            {/* From / To accounts */}
            {formData.type !== 'Income' && (
              <div>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>From Account</label>
                <FuturisticDropdown options={accountOptions} value={formData.from_account_id} onChange={v=>setFormData(f=>({...f,from_account_id:v}))}/>
              </div>
            )}
            {formData.type === 'Income' && (
              <div>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>To Account</label>
                <FuturisticDropdown options={accountOptions} value={formData.to_account_id} onChange={v=>setFormData(f=>({...f,to_account_id:v}))}/>
              </div>
            )}
            {formData.type === 'Transfer' && (
              <div>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>To (Account or Loan)</label>
                <FuturisticDropdown options={toAccountOptions} value={formData.to_account_id} onChange={v=>setFormData(f=>({...f,to_account_id:v}))}/>
              </div>
            )}
            {formData.type === 'Transfer' && (
              <div>
                <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>{`Transfer Fee (${getCurrencyLabel()})`}</label>
                <CurrencyInput value={formData.fee_amount} onChange={v=>setFormData(f=>({...f,fee_amount:v}))}/>
                <label style={{ display: 'block', marginTop: 12 }}>Amount received in destination currency (required for different currencies)</label>
                <CurrencyInput value={formData.destination_amount || ''} onChange={v => setFormData(f => ({ ...f, destination_amount: v }))} />
              </div>
            )}

            {/* Category */}
            
            {formData.type === 'Expense' && (
              <label style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.03)', borderRadius:10, cursor:'pointer' }}>
                <input type="checkbox" checked={formData.isSplit} onChange={e=>setFormData(f=>({...f, isSplit: e.target.checked}))}/>
                <span style={{ fontSize:'0.85rem' }}>Split Transaction</span>
              </label>
            )}

            {formData.isSplit && formData.type === 'Expense' ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                <label style={{ display:'block', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Splits</label>
                {formData.splits.map((split, idx) => (
                  <div key={idx} style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <div style={{ flex:2, position:'relative' }}>
                      <input value={split.category} onChange={e => {
                        const newSplits = [...formData.splits];
                        newSplits[idx].category = e.target.value;
                        setFormData({...formData, splits: newSplits});
                      }} placeholder="Category" style={{ width:'100%', padding:'0.6rem' }} />
                    </div>
                    <div style={{ flex:1 }}>
                      <input type="number" inputMode="decimal" value={split.amount} onChange={e => {
                        const newSplits = [...formData.splits];
                        newSplits[idx].amount = Number(e.target.value);
                        setFormData({...formData, splits: newSplits});
                      }} placeholder="Amount" style={{ width:'100%', padding:'0.6rem' }} />
                    </div>
                    {formData.splits.length > 2 && (
                      <button type="button" onClick={() => {
                        const newSplits = formData.splits.filter((_, i) => i !== idx);
                        setFormData({...formData, splits: newSplits});
                      }} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer' }}><X size={16}/></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setFormData({...formData, splits: [...formData.splits, {category:'', amount:0}]});
                }} style={{ alignSelf:'flex-start', padding:'0.4rem 0.8rem', background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>+ Add Split</button>
                {(() => {
                  const total = Math.round(formData.splits.reduce((s, c) => s + (Number(c.amount) || 0), 0) * 100) / 100;
                  const isMatch = Math.abs(total - Number(formData.amount)) < 0.01;
                  return (
                    <div style={{ color: isMatch ? '#4ade80' : '#f87171', fontSize:'0.8rem' }}>
                      Splits total: {total} / {formData.amount}
                      {!isMatch && ' (Amounts must match)'}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ position:'relative' }} ref={catContainerRef}>

              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Category</label>
              <div style={{ position:'relative' }}>
                <input
                  value={formData.category}
                  onChange={e => { setFormData(f => ({...f, category: e.target.value})); setCatDropOpen(true); }}
                  onFocus={() => setCatDropOpen(true)}
                  placeholder="e.g. Food, Rent, Salary…"
                  autoComplete="off"
                  style={{ width:'100%', paddingRight: formData.category ? '2.5rem' : undefined }}
                />
                {formData.category && (
                  <span style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', fontSize:'1.2rem', pointerEvents:'none' }}>
                    {getCategoryEmoji(formData.category)}
                  </span>
                )}
              </div>
              {/* Autocomplete dropdown */}
              {catDropOpen && (() => {
                const q = (formData.category || '').toLowerCase();
                const used = uniqueCategories.filter(c => c.toLowerCase().includes(q) && c !== formData.category);
                const suggested = getCategories()
                  .map(c => c.split(' ').slice(1).join(' '))
                  .filter(c => c.toLowerCase().includes(q) && c !== formData.category && !used.includes(c));
                const all = [...used, ...suggested].slice(0, 8);
                if (all.length === 0) return null;
                return (
                  <div style={{
                    position:'absolute', left:0, right:0, top:'100%', zIndex:20,
                    marginTop:4, background:'var(--hud-bg, var(--bg-surface))', border:'1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                    borderRadius:10, overflow:'hidden', boxShadow:'0 8px 24px rgba(0,0,0,0.4)',
                    maxHeight:200, overflowY:'auto', WebkitOverflowScrolling:'touch'
                  }}>
                    {all.map(c => (
                      <button key={c} type="button"
                        onClick={() => { setFormData(f => ({...f, category: c})); setCatDropOpen(false); }}
                        style={{
                          display:'flex', alignItems:'center', gap:'0.5rem', width:'100%',
                          padding:'0.65rem 0.875rem', border:'none', background:'transparent',
                          color:'var(--text-primary, #f0f0f5)', fontSize:'0.85rem', cursor:'pointer',
                          textAlign:'left', fontFamily:'inherit', minHeight:44,
                          borderBottom:'1px solid rgba(255,255,255,0.04)'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,222,128,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <span style={{ fontSize:'1.1rem', flexShrink:0 }}>{getCategoryEmoji(c) || '📋'}</span>
                        {c}
                        {used.includes(c) && <span style={{ marginLeft:'auto', fontSize:'0.65rem', color:'var(--text-muted)', opacity:0.7 }}>used before</span>}
                      </button>
                    ))}
                  </div>
                );
              })()}
              {/* Quick-pick chips */}
              <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem', marginTop:'0.5rem' }}>
                {getCategories().filter(c => formData.type==='Income' ? ['💰 Salary','💼 Business','🐷 Savings'].includes(c) : !['💰 Salary','💼 Business'].includes(c)).slice(0,8).map(c=>(
                  <button key={c} type="button" onClick={()=>{ setFormData(f=>({...f,category:c.split(' ').slice(1).join(' ')})); setCatDropOpen(false); }}
                    style={{ padding:'0.2rem 0.65rem', borderRadius:20, border:`1px solid ${formData.category===c.split(' ').slice(1).join(' ')?'rgba(74,222,128,0.5)':'rgba(255,255,255,0.07)'}`, background: formData.category===c.split(' ').slice(1).join(' ')?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.03)', cursor:'pointer', fontSize:'0.72rem', color:'var(--text-secondary)', transition:'all 0.12s' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            )}

            {/* Notes / Memo with Note Memory & Autocomplete */}
            <div ref={noteContainerRef} style={{ position:'relative' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.45rem' }}>
                <label style={{ margin:0, fontSize:'0.82rem', color:'var(--text-secondary)', display:'flex', alignItems:'center', gap:'0.35rem' }}>
                  <Brain size={13} style={{ color:'var(--cyan, #4ade80)' }} />
                  <span>Notes / Memo</span>
                  <span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>(with memory)</span>
                </label>
                {formData.notes && (
                  <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>{formData.notes.length} chars</span>
                )}
              </div>

              <div style={{ position:'relative' }}>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={e => {
                    const val = e.target.value;
                    setNoteDropOpen(true);
                    setFormData(f => {
                      const suggested = autoCategorize(val);
                      if (suggested && (!f.category || f.category === '')) {
                        return { ...f, notes: val, category: suggested, _autoCat: suggested };
                      }
                      return { ...f, notes: val };
                    });
                  }}
                  onFocus={() => setNoteDropOpen(true)}
                  placeholder="Type or pick remembered note (e.g. Keells, Uber, Rent)..."
                  autoComplete="off"
                  style={{ width:'100%', paddingRight: formData.notes ? '2rem' : undefined }}
                />
                {formData.notes && (
                  <button
                    type="button"
                    onClick={() => setFormData(f => ({ ...f, notes: '' }))}
                    style={{ position:'absolute', right:'0.75rem', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', padding:2 }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Live Autocomplete Dropdown from Note Memory */}
              {noteDropOpen && (() => {
                const q = (formData.notes || '').toLowerCase().trim();
                const matches = rememberedNotes.filter(n => (!q || n.text.toLowerCase().includes(q)) && n.text.toLowerCase() !== q).slice(0, 6);
                if (matches.length === 0) return null;
                return (
                  <div style={{
                    position:'absolute', left:0, right:0, top:'100%', zIndex:30,
                    marginTop:4, background:'var(--hud-bg, #252540)', border:'1px solid rgba(74,222,128,0.25)',
                    borderRadius:10, overflow:'hidden', boxShadow:'0 8px 30px rgba(0,0,0,0.5)',
                    maxHeight:220, overflowY:'auto', WebkitOverflowScrolling:'touch'
                  }}>
                    <div style={{ padding:'0.4rem 0.75rem', fontSize:'0.65rem', fontFamily:'Inter, sans-serif', letterSpacing:'1.5px', color:'var(--text-muted)', textTransform:'uppercase', background:'rgba(255,255,255,0.02)', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                      🧠 Remembered Notes
                    </div>
                    {matches.map(item => (
                      <button
                        key={item.text}
                        type="button"
                        onClick={() => {
                          haptic();
                          setFormData(f => ({
                            ...f,
                            notes: item.text,
                            category: (!f.category || f.category === '') && item.category ? item.category : f.category,
                            _autoCat: item.category || null,
                          }));
                          setNoteDropOpen(false);
                        }}
                        style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%',
                          padding:'0.6rem 0.85rem', border:'none', background:'transparent',
                          color:'var(--text-primary, #f0f0f5)', fontSize:'0.82rem', cursor:'pointer',
                          textAlign:'left', fontFamily:'inherit', minHeight:40,
                          borderBottom:'1px solid rgba(255,255,255,0.04)',
                          transition:'background 0.12s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,222,128,0.08)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          <span style={{ fontSize:'0.9rem' }}>📝</span>
                          <span style={{ fontWeight:500 }}>{item.text}</span>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', flexShrink:0 }}>
                          {item.category && (
                            <span style={{ fontSize:'0.68rem', padding:'0.1rem 0.45rem', borderRadius:6, background:'rgba(255,255,255,0.05)', color:'var(--text-secondary)' }}>
                              {item.category}
                            </span>
                          )}
                          <span style={{ fontSize:'0.65rem', color:'var(--cyan, #4ade80)' }}>
                            {item.count}x
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                );
              })()}

              {/* Auto-category suggestion badge */}
              {formData._autoCat && formData.category === formData._autoCat && (
                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.35rem' }}>
                  <span style={{ fontSize:'0.7rem', color:'var(--cyan, #4ade80)', fontFamily:'Inter, sans-serif' }}>
                    ✨ Auto-categorized as <b>{formData._autoCat}</b>
                  </span>
                  <button type="button" onClick={() => setFormData(f => ({ ...f, category: '', _autoCat: null }))}
                    style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.7rem' }}>✕ clear</button>
                </div>
              )}

              {/* Quick-pick Note Memory Chips */}
              {rememberedNotes.length > 0 && (
                <div style={{ marginTop:'0.5rem' }}>
                  <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginBottom:'0.3rem', display:'flex', alignItems:'center', gap:'0.25rem' }}>
                    <span>Quick memory notes:</span>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem' }}>
                    {rememberedNotes.slice(0, 8).map(n => (
                      <button
                        key={n.text}
                        type="button"
                        onClick={() => {
                          haptic();
                          setFormData(f => ({
                            ...f,
                            notes: n.text,
                            category: (!f.category || f.category === '') && n.category ? n.category : f.category,
                            _autoCat: n.category || null,
                          }));
                          setNoteDropOpen(false);
                        }}
                        style={{
                          padding:'0.2rem 0.65rem', borderRadius:20,
                          border:`1px solid ${formData.notes === n.text ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.07)'}`,
                          background: formData.notes === n.text ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.03)',
                          cursor:'pointer', fontSize:'0.72rem', color: formData.notes === n.text ? '#4ade80' : 'var(--text-secondary)',
                          transition:'all 0.12s'
                        }}
                      >
                        {n.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Tags */}
            <div>
              <label style={{ display:'block', marginBottom:'0.45rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Tags (comma separated)</label>
              <input 
                value={(formData.tags || []).join(', ')} 
                onChange={e=>setFormData(f=>({ ...f, tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean) }))} 
                placeholder="e.g. vacation, gift, tax-deductible" 
                style={{ width:'100%' }}
              />
            </div>

            {/* Tax Deductible / Business Expense Toggle */}
            <label
              style={{
                display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.65rem 1rem',
                background: formData.tax_deductible ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
                borderRadius:10, border:`1px solid ${formData.tax_deductible ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.08)'}`,
                cursor:'pointer', fontSize:'0.82rem', color: formData.tax_deductible ? '#4ade80' : 'var(--text-secondary)',
                fontFamily:'Inter, sans-serif'
              }}
            >
              <input
                type="checkbox"
                checked={!!formData.tax_deductible}
                onChange={e => setFormData(f => ({ ...f, tax_deductible: e.target.checked }))}
                style={{ width:16, height:16, accentColor:'#4ade80' }}
              />
              <span>🧾 Mark as Tax-Deductible / Business Expense</span>
            </label>

            {/* Receipt Photo */}
            {!isRecurring && (
              <ReceiptUpload
                existingUrl={formData.receipt_url || null}
                existingThumb={formData.receipt_thumb || null}
                onUploaded={(url, thumb) => setFormData(f => ({ ...f, receipt_url: url || '', receipt_thumb: thumb || '' }))}
              />
            )}

            {/* Recurring toggle */}
            {!editMode && (
              <label style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', background:'rgba(129,140,248,0.07)', borderRadius:10, border:'1px solid rgba(129,140,248,0.18)', cursor:'pointer' }}>
                <input type="checkbox" checked={isRecurring} onChange={e=>setIsRecurring(e.target.checked)}/>
                <Repeat size={15} color="#818cf8"/>
                <span style={{ fontSize:'0.85rem' }}>Set as Recurring (auto-creates monthly)</span>
              </label>
            )}

            {/* Buttons */}
            <div style={{ display:'flex', justifyContent:'space-between', gap:'0.75rem', marginTop:'0.25rem', flexWrap:'wrap' }}>
              <button type="button" onClick={saveTemplate}
                style={{ background:'rgba(0,245,255,0.07)', border:'1px solid rgba(0,245,255,0.2)', borderRadius:8, padding:'0.45rem 0.875rem', color:'#00f5ff', cursor:'pointer', fontSize:'0.78rem', fontFamily:'Inter, sans-serif' }}>
                ⭐ Save as Template
              </button>
              <div style={{ display:'flex', gap:'0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={()=>setIsModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">
                  {isRecurring ? '💾 Save Rule' : editMode ? '✓ Update' : '+ Save'}
                </button>
              </div>
            </div>
          </form>
        </Modal>

        {/* ── CSV Import Modal ── */}
        <Modal isOpen={csvModalOpen} onClose={()=>setCsvModalOpen(false)} title="📥 Import Bank CSV">
          <CSVImporter accounts={accounts} onImported={()=>{ loadData(); setCsvModalOpen(false); }} onClose={()=>setCsvModalOpen(false)}/>
        </Modal>

        {/* ── Confirm delete ── */}
        <ConfirmDialog
          open={confirm.open}
          title={confirm.type==='txn' ? 'Delete Transaction' : 'Delete Recurring Rule'}
          message={confirm.type==='txn' ? 'Account balances will be automatically corrected.' : 'This recurring rule will be permanently removed.'}
          confirmLabel="Delete" danger
          onConfirm={doConfirmDelete}
          onCancel={()=>setConfirm({open:false,id:null,type:'txn'})}
        />

        {/* ── Simple Transaction / Income / Deduction Details Popup ── */}
        <TransactionPopup
          isOpen={!!popupTx}
          onClose={() => setPopupTx(null)}
          transaction={popupTx}
          accounts={accounts}
          onEdit={(tx) => openEditModal(tx)}
          onDelete={(tx) => setConfirm({ open: true, id: tx.id, type: 'txn' })}
          onDuplicate={(tx) => duplicateTx(tx)}
        />
      </div>
    </PageWrapper>
  );
};

export default Transactions;