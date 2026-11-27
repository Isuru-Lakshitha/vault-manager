import { useT } from '../i18n';
import { deleteWithUndo, removeItemWithUndo, itemLabel } from '../components/undoToast';
import { findDemoFeedLeftovers } from '../utils/bankFeedImport';
import { toCSV } from '../utils/csv';
import RecurringRulesTab from './transactions/RecurringRulesTab';

import { transactionCurrency, reportingTransactions } from '../utils/reportingCurrency';
import { Segmented, Button } from '../components/ui';

import { auditStatus, summarizePayments, isActivePayment, isEditableTransaction, accountMovement } from '../utils/ledgerReporting.js';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import useLiveData from '../utils/useLiveData';
import { useSearchParams } from 'react-router-dom';
import { fetchTransactions, createTransaction, updateTransaction, deleteTransaction, fetchAccounts, fetchLoans, getCache, invalidateCache, fetchRecurringTransactions, createRecurringTransaction, deleteRecurringTransaction, applyPendingRecurring, confirmApplyRecurring, payLoan, updateAccount, fetchExchangeRates } from '../utils/api';
import { Plus, RefreshCw, X, ChevronDown } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import CSVImporter from '../components/CSVImporter';

import TransactionPopup from '../components/TransactionPopup';

import '../styles/transactions.css';
import getCategoryEmoji from '../utils/categoryEmoji';
import { getRememberedNotes } from '../utils/noteMemory';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { haptic } from '../utils/format';
import { auth } from '../utils/firebaseApp';
import { detectRecurring } from '../utils/recurringDetect.js';
import { formatCurrency, getCurrency } from '../utils/format';
import { toYMD, todayYMD } from '../utils/dates';
import { getLastAccountId, rememberAccountId } from '../utils/lastAccount';
import TransactionFormModal from './transactions/TransactionFormModal';
import ToolsExportMenu from './transactions/ToolsExportMenu';
import AllTransactionsTab from './transactions/AllTransactionsTab';
import { saveFile, saveWorkbook } from '../utils/saveFile';
import { optimisticUid } from '../utils/lastSession';

/* ─── helpers ─────────────────────────────────────────────────── */

/* ─── Search highlight helper ───────────────────────────────────── */

/* ─── Transactions page ────────────────────────────────────────── */
const Transactions = () => {
  const t = useT();
  const [searchParams, setSearchParams] = useSearchParams();

  const [transactions, setTransactions] = useState(() => getCache('transactions') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [rates, setRates] = useState(undefined); // undefined = still loading
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
      const [txs, accs, lns, rules, fx] = await Promise.all([
        fetchTransactions(), fetchAccounts(), fetchLoans(), fetchRecurringTransactions(),
        fetchExchangeRates().catch(() => null)
      ]);
      setRates(fx);
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
                const newRewards = Math.round(((Number(srcAcc.rewards_earned) || 0) + earned) * 100) / 100;
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
  const doConfirmDelete = () => {
    const deleteId = confirm.id;
    const deleteType = confirm.type;
    setConfirm({ open: false, id: null, type: 'txn' });
    if (deleteType === 'txn') {
      removeItemWithUndo({
        key: `txn:${deleteId}`,
        label: 'Transaction deleted',
        setItems: setTransactions,
        id: deleteId,
        commit: async () => {
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
        },
        onCommitted: () => {
          const freshAcc = getCache('accounts');
          if (freshAcc) setAccounts([...freshAcc]);
        },
      });
    } else {
      const rule = recurringRules.find(r => String(r.id) === String(deleteId));
      removeItemWithUndo({
        key: `rule:${deleteId}`,
        label: itemLabel(rule, 'Recurring rule deleted'),
        setItems: setRecurringRules,
        id: deleteId,
        commit: () => deleteRecurringTransaction(deleteId),
      });
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
    if (protectedIds.length) toast(`Skipped ${protectedIds.length} protected record${protectedIds.length > 1 ? 's' : ''} (fees / reversals / invoices)`, { icon: 'ℹ️' });
    const n = deletable.length;
    deleteManyWithUndo(deletable, `${n} transaction${n > 1 ? 's' : ''} deleted`);
  };

  // Hide rows now, delete them after the Undo window.
  const deleteManyWithUndo = (deletable, label) => {
    let snapshot = null;
    deleteWithUndo({
      key: `txn-bulk:${deletable.join(',')}`,
      label,
      hide: () => setTransactions(prev => { snapshot = prev; return prev.filter(t => !deletable.includes(t.id)); }),
      restore: () => { if (snapshot) setTransactions(snapshot); },
      // Delete one at a time: each delete corrects shared account balances atomically,
      // so running them in parallel causes contention and partial failures.
      commit: async () => {
        const failed = [];
        for (const id of deletable) {
          try { await deleteTransaction(id); } catch (err) { failed.push(err?.message || 'unknown error'); }
        }
        if (failed.length) toast.error(`${failed.length} could not be deleted: ${failed[0]}`);
      },
      onCommitted: () => loadData(true),
    });
  };

  // Rows the old Bank Sync demo wrote into real accounts (see bankFeedImport).
  const [demoLeftoversDismissed, setDemoLeftoversDismissed] = useState(() => {
    try { return localStorage.getItem('vm_demo_leftovers_kept') === '1'; } catch { return false; }
  });
  const demoLeftovers = useMemo(
    () => (demoLeftoversDismissed ? [] : findDemoFeedLeftovers(transactions)),
    [transactions, demoLeftoversDismissed],
  );
  const removeDemoLeftovers = () => {
    const n = demoLeftovers.length;
    deleteManyWithUndo(demoLeftovers.map(t => t.id), `${n} sample row${n > 1 ? 's' : ''} removed`);
  };
  const keepDemoLeftovers = () => {
    try { localStorage.setItem('vm_demo_leftovers_kept', '1'); } catch { /* private mode */ }
    setDemoLeftoversDismissed(true);
  };

  const handleApplyRecurring = async () => {
    try {
      const { applied = [], failed = [] } = await confirmApplyRecurring(pendingRecurring) || {};
      if (applied.length) toast.success(`Applied ${applied.length} recurring transaction(s)!`);
      if (failed.length) toast.error(`${failed.length} not applied: ${failed.map(f => `${f.rule.name || f.rule.category || 'Rule'} (${f.message})`).join(', ')}`);
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

  /* Totals across accounts: rows in other currencies are converted to the main
     currency first. If rates are missing the totals are left blank (null)
     rather than adding different currencies together. */
  const summarizeAll = useCallback((rows) => {
    const base = getCurrency();
    const foreign = rows.some(t => transactionCurrency(t, accounts, base) !== base);
    if (!foreign) return summarizePayments(rows);
    try {
      return { ...summarizePayments(reportingTransactions(rows, accounts, base, rates)), count: rows.length, converted: true };
    } catch {
      const loading = rates === undefined;
      return { income: null, expense: null, net: null, count: rows.length, unavailable: !loading, loadingRates: loading };
    }
  }, [accounts, rates]);

  /* Summary stats: global portfolio summary or account-specific cashflow */
  const stats = useMemo(() => {
    if (filterAccount === 'All') return summarizeAll(filtered);
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
  }, [filtered, filterAccount, summarizeAll]);

  /* Windowed slice for fast initial DOM mount (60 rows default unless searching) */
  const [visibleLimit, setVisibleLimit] = useState(60);
  const [compact, setCompact] = useState(() => localStorage.getItem('vm_tx_compact') === '1');
  const [showInsights, setShowInsights] = useState(() => localStorage.getItem('vm_tx_insights') !== '0');
  const toggleCompact = () => setCompact(v => { localStorage.setItem('vm_tx_compact', v ? '0' : '1'); return !v; });
  const toggleInsights = () => setShowInsights(v => { localStorage.setItem('vm_tx_insights', v ? '0' : '1'); return !v; });

  /* ── Saved filter views (per user, localStorage) ── */
  const viewsKey = `vm_tx_views:${auth.currentUser?.uid || optimisticUid() || 'anon'}`;
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
  const dismissKey = `vm_tx_recurring_dismissed:${auth.currentUser?.uid || optimisticUid() || 'anon'}`;
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
    const sumStats = summarizeAll(sourceRows);
    const rows = toCSV([
      ['Date', 'Type', 'Category', 'Amount', 'Currency', 'Fee', 'From', 'To', 'Notes'],
      ...sourceRows.map(tx => [
        tx.date, tx.type, tx.category || '',
        Number(tx.amount) || 0, transactionCurrency(tx, accounts, getCurrency()), Number(tx.fee_amount) || 0,
        getAccountName(tx.from_account_id), getAccountName(tx.to_account_id), tx.notes || '',
      ]),
      [],
      ['SUMMARY', `Records: ${sourceRows.length}`, `Income: ${sumStats.income ?? 'n/a (exchange rates unavailable)'}`, `Expense: ${sumStats.expense ?? 'n/a'}`, `Net: ${sumStats.net ?? 'n/a'}`, sumStats.converted ? `Totals in ${getCurrency()} at current rates` : ''],
    ]);
    saveFile(new Blob([rows], { type: 'text/csv;charset=utf-8' }), `transactions_${dateFrom ? `${dateFrom}_to_${dateTo||'now'}` : todayYMD()}.csv`)
      .then(() => toast.success(`Exported ${sourceRows.length} transaction${sourceRows.length === 1 ? '' : 's'} to CSV!`))
      .catch(err => toast.error(err?.message || 'Export failed'));
  };

  /* Excel (.xlsx) Export (supports Selected Rows or Filtered View + Category Summary Sheet) */
  const handleExportExcel = async () => {
    const sourceRows = selectedIds.size > 0 ? filtered.filter(tx => selectedIds.has(tx.id)) : filtered;
    if (!sourceRows.length) { toast.error('No transactions to export'); return; }
    try {
      const XLSX = await import('xlsx');
      const sumStats = summarizeAll(sourceRows);
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
        Category: sumStats.unavailable ? 'Totals n/a (exchange rates unavailable)' : `In: ${sumStats.income} | Out: ${sumStats.expense}`,
        Amount: sumStats.net ?? '',
        Fee: 0,
        From: '',
        To: '',
        Notes: sumStats.converted ? `Net Cash Flow (in ${getCurrency()} at current rates)` : 'Net Cash Flow',
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
      await saveWorkbook(XLSX, wb, `Transactions_${dateFrom ? `${dateFrom}_to_${dateTo||'now'}` : todayYMD()}.xlsx`);
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
            <h1 className="glow-text text-cyan" style={{ margin:0, fontSize:'2rem' }}>{t('nav.transactions')}</h1>
            <p className="ui-page-sub">{filtered.length} {filtered.length === 1 ? 'record' : 'records'} · totals below</p>
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

              {toolsMenuOpen && <ToolsExportMenu handleExportCSV={handleExportCSV} handleExportExcel={handleExportExcel} setCsvModalOpen={setCsvModalOpen} setToolsMenuOpen={setToolsMenuOpen} />}
            </div>

            {/* Primary Action */}
            <Button variant="primary" icon={Plus} onClick={openAddModal}>{t('btn.newTransaction')}</Button>
          </div>
        </div>

        {demoLeftovers.length > 0 && (
          <div className="ui-banner ui-banner-warn" role="status">
            <div>
              <strong>{demoLeftovers.length} sample row{demoLeftovers.length > 1 ? 's' : ''} from the old Bank Sync demo</strong>
              <p>{demoLeftovers.map(t => t.notes).join(', ')}. These aren't your transactions and they changed your balances.</p>
            </div>
            <div className="ui-banner-actions">
              <button type="button" className="btn btn-primary" onClick={removeDemoLeftovers}>Remove them</button>
              <button type="button" className="btn btn-secondary" onClick={keepDemoLeftovers}>Keep</button>
            </div>
          </div>
        )}

        {templates.length > 0 && <details className="quiet-section"><summary>Quick templates ({templates.length})</summary><div className="quiet-section-content">
        {/* ── Quick Templates ── */}
        {templates.length > 0 && (
          <div style={{ display:'flex', gap:'0.5rem', flexWrap:'wrap', marginBottom:'1rem', alignItems:'center' }}>
            <span style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px', marginRight:'0.25rem' }}>TEMPLATES:</span>
            {templates.map(t => (
              <div key={t.id} style={{ display:'flex', alignItems:'center', gap:0, background:'rgba(0,245,255,0.07)', border:'1px solid rgba(0,245,255,0.2)', borderRadius:100, overflow:'hidden' }}>
                <button onClick={() => applyTemplate(t)}
                  style={{ background:'none', border:'none', cursor:'pointer', padding:'0.3rem 0.65rem', fontSize:'0.75rem', color:'#00f5ff', display:'flex', alignItems:'center', gap:'0.35rem' }}>
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
                  <span style={{ fontSize:'0.85rem' }}>
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
                    <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'0.35rem 0.5rem', background:'rgba(129,140,248,0.06)', borderRadius:7, fontSize:'0.78rem' }}>
                      <span style={{ color:'#d0d0e0' }}>{r.category || r.description || 'Recurring'}</span>
                      <span style={{ color: r.type === 'Expense' ? 'var(--mm-danger)' : 'var(--mm-success)', fontWeight:600 }}>
                        {r.type === 'Expense' ? '-' : '+'}{formatCurrency(r.amount||0)}
                      </span>
                    </div>
                  ))}
                  {pendingRecurring.length > 4 && <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', textAlign:'center', marginTop:'0.2rem' }}>+{pendingRecurring.length-4} more</div>}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Tabs ── */}
        <div className="ui-tabs-row">
          <Segmented
            label="Transactions view"
            value={activeTab}
            onChange={setActiveTab}
            options={[
              { value: 'all', label: t('seg.allTx') },
              { value: 'recurring', label: t('seg.recurringRules'), count: recurringRules.length },
            ]}
          />
        </div>

        {/* ── Recurring Rules tab ── */}
        {activeTab === 'recurring' && (
          <RecurringRulesTab rules={recurringRules} onDelete={(id) => setConfirm({ open: true, id, type: 'recurring' })} />
        )}

        {/* ── All Transactions tab ── */}
        {activeTab === 'all' && <AllTransactionsTab accounts={accounts} anomalyCount={anomalyCount} anomalyMap={anomalyMap} applyView={applyView} auditFilter={auditFilter} bulkMode={bulkMode} bulkValue={bulkValue} cancelQuickEdit={cancelQuickEdit} compact={compact} createSuggestedReminder={createSuggestedReminder} dateFrom={dateFrom} dateTo={dateTo} deleteView={deleteView} dismissSuggestion={dismissSuggestion} duplicateTx={duplicateTx} filterAccount={filterAccount} filterAnomalies={filterAnomalies} filterTag={filterTag} filterTaxDeductible={filterTaxDeductible} filterType={filterType} filtered={filtered} formatGroupDate={formatGroupDate} getAccountName={getAccountName} grouped={grouped} handleBulkDelete={handleBulkDelete} handleBulkEdit={handleBulkEdit} handleExportCSV={handleExportCSV} handleExportExcel={handleExportExcel} handlePreset={handlePreset} hasActiveFilters={hasActiveFilters} isMobile={isMobile} loading={loading} maxAmt={maxAmt} minAmt={minAmt} openEditModal={openEditModal} quickCat={quickCat} quickEditId={quickEditId} quickNotes={quickNotes} recurringSuggestion={recurringSuggestion} rememberedNotes={rememberedNotes} runningBalanceMap={runningBalanceMap} saveQuickEdit={saveQuickEdit} saveView={saveView} savedViews={savedViews} savingView={savingView} searchQuery={searchQuery} selectedIds={selectedIds} setAuditFilter={setAuditFilter} setBulkMode={setBulkMode} setBulkValue={setBulkValue} setConfirm={setConfirm} setDateFrom={setDateFrom} setDateTo={setDateTo} setFilterAccount={setFilterAccount} setFilterAnomalies={setFilterAnomalies} setFilterTag={setFilterTag} setFilterTaxDeductible={setFilterTaxDeductible} setFilterType={setFilterType} setMaxAmt={setMaxAmt} setMinAmt={setMinAmt} setPopupTx={setPopupTx} setQuickCat={setQuickCat} setQuickNotes={setQuickNotes} setSavingView={setSavingView} setSearchQuery={setSearchQuery} setSelectedIds={setSelectedIds} setSortBy={setSortBy} setViewName={setViewName} setVisibleLimit={setVisibleLimit} showInsights={showInsights} sortBy={sortBy} startQuickEdit={startQuickEdit} stats={stats} toggleCompact={toggleCompact} toggleInsights={toggleInsights} transactions={transactions} typeCounts={typeCounts} viewName={viewName} visibleFiltered={visibleFiltered} />}

        {/* ── Add / Edit Modal ── */}
        <TransactionFormModal accountOptions={accountOptions} accounts={accounts} catContainerRef={catContainerRef} catDropOpen={catDropOpen} editMode={editMode} formData={formData} handleApplySMS={handleApplySMS} handleSubmit={handleSubmit} isModalOpen={isModalOpen} isRecurring={isRecurring} noteContainerRef={noteContainerRef} noteDropOpen={noteDropOpen} rememberedNotes={rememberedNotes} saveTemplate={saveTemplate} setCatDropOpen={setCatDropOpen} setFormData={setFormData} setIsModalOpen={setIsModalOpen} setIsRecurring={setIsRecurring} setNoteDropOpen={setNoteDropOpen} toAccountOptions={toAccountOptions} transactions={transactions} uniqueCategories={uniqueCategories} />

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