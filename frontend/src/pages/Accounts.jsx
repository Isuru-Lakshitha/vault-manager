import ToolMenu from '../components/ToolMenu';
import { InsightAccounts } from '../components/InsightPanels';
import { reconcileAccount, isActivePayment, accountMovement, summarizeAccountHistory } from '../utils/ledgerReporting.js';
import { useState, useEffect, useMemo } from 'react';
import useLiveData from '../utils/useLiveData';
import { setOpeningBalance, reconcileBalance, setAccountArchived, fetchAccounts, createAccount, updateAccount, deleteAccount, deleteTransaction, getCache, fetchTransactions, createTransaction, fetchExchangeRates } from '../utils/api';
import { Plus, Edit2, Trash2, Wallet, Landmark, CreditCard, Smartphone, History, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Scale } from 'lucide-react';
import getCategoryEmoji from '../utils/categoryEmoji';
import PageWrapper from '../components/PageWrapper';
import TiltWrapper from '../components/TiltWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import FuturisticDropdown from '../components/FuturisticDropdown';
import CurrencyInput from '../components/CurrencyInput';
import AnimatedCounter from '../components/AnimatedCounter';
import SkeletonLoader from '../components/SkeletonLoader';
import TransactionPopup from '../components/TransactionPopup';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { formatCurrency, getCurrency, convertCurrency, SUPPORTED_CURRENCIES, haptic } from '../utils/format';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { todayYMD } from '../utils/dates';

const ACCOUNT_CONFIG = {
  Bank:          { gradient: 'linear-gradient(135deg, rgba(74,222,128,0.12), rgba(6,10,22,0.95))', borderColor: 'rgba(74,222,128,0.2)', icon: Landmark,   iconColor: '#4ade80' },
  Cash:          { gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,10,22,0.95))', borderColor: 'rgba(16,185,129,0.2)', icon: Wallet,    iconColor: '#4ade80' },
  'Mobile Wallet': { gradient: 'linear-gradient(135deg, rgba(167,139,250,0.12), rgba(6,10,22,0.95))', borderColor: 'rgba(167,139,250,0.2)', icon: Smartphone, iconColor: '#a78bfa' },
  'Credit Card': { gradient: 'linear-gradient(135deg, rgba(244,63,94,0.12), rgba(6,10,22,0.95))', borderColor: 'rgba(244,63,94,0.2)', icon: CreditCard, iconColor: '#f87171' },
};


const Accounts = () => {
  const [showArchived, setShowArchived] = useState(false);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [allTransactions, setAllTransactions] = useState(() => getCache('transactions') || []);
  const [loading, setLoading] = useState(() => !getCache('accounts'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [rates, setRates] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch {
  return null;
}
  });
  const [formData, setFormData] = useState({ name: '', type: 'Bank', balance: 0, currency: getCurrency(), cashback_rate: 0 });
  const [confirm, setConfirm] = useState({ open: false, id: null });
  const [viewAcc, setViewAcc] = useState(null);
  const [popupTx, setPopupTx] = useState(null);
  const [txHistory, setTxHistory] = useState([]);
  const [txLoading, setTxLoading] = useState(false);

  // 1-Tap Account Balance Reconciliation
  const [reconcileAcc, setReconcileAcc] = useState(null);
  const [reconcileActual, setReconcileActual] = useState(0);
  const [baselineAccount, setBaselineAccount] = useState(null);
  const [baselineAmount, setBaselineAmount] = useState('');
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [reconcileNote, setReconcileNote] = useState('Balance Reconciliation Adjustment');
  const [reconciling, setReconciling] = useState(false);

  const openReconcile = (acc) => {
    haptic();
    setReconcileAcc(acc);
    setReconcileActual(acc.balance || 0);

    setReconcileNote('Balance Reconciliation Adjustment');
  };

  const handleReconcileSubmit = async (e) => {
    e.preventDefault();
    if (!reconcileAcc) return;
    const actual = Number(reconcileActual);
    if (String(reconcileActual).trim() === '' || !Number.isFinite(actual)) { toast.error('Enter a valid statement balance'); return; }
    const current = parseFloat(reconcileAcc.balance) || 0;
    const diff = parseFloat((actual - current).toFixed(2));

    if (Math.abs(diff) < 0.01) {
      toast('Account balance already matches!', { icon: '✅' });
      setReconcileAcc(null);
      return;
    }

    setReconciling(true);
    try {
      await reconcileBalance(reconcileAcc.id, current, actual, reconcileNote.trim());
      haptic(15);
      toast.success(`⚖️ Reconciled ${reconcileAcc.name} (${diff > 0 ? '+' : '-'}${formatCurrency(Math.abs(diff), { currency: reconcileAcc.currency || baseCurrency })})`);
      setReconcileAcc(null);
      loadAccounts();
    } catch (error) {
      toast.error(error.message || 'Failed to reconcile balance');
    } finally {
      setReconciling(false);
    }
  };

  // Quick Transfer
  const [transferFrom, setTransferFrom] = useState(null); // account id
  const [transferModal, setTransferModal] = useState(false);
  const [transferForm, setTransferForm] = useState({ toId: '', amount: 0, received: '' });
  const openTransfer = (acc) => {
    setTransferFrom(acc.id);
    setTransferForm({ toId: accounts.filter(a => !a.archived && String(a.id) !== String(acc.id))[0]?.id || '', amount: 0, received: '' });
    setTransferModal(true);
  };
  const handleTransfer = async (e) => {
    e.preventDefault();
    const v = parseFloat(transferForm.amount);
    if (!v || v <= 0 || !transferForm.toId) { toast.error('Enter valid amount and destination'); return; }
    try {
      await createTransaction({
        type: 'Transfer', amount: v,
        ...(transferForm.received ? { destination_amount: Number(transferForm.received) } : {}),
        date: todayYMD(),
        category: 'Transfer', notes: 'Quick Transfer',
        from_account_id: transferFrom,
        to_account_id: transferForm.toId,
      });
      const fromCur = accounts.find(a => String(a.id) === String(transferFrom))?.currency || baseCurrency;
      toast.success(`Transferred ${formatCurrency(v, { currency: fromCur })}`);
      setTransferModal(false);
      loadAccounts();
    } catch (error) { toast.error(error.message || 'Transfer failed'); }
  };

  useEffect(() => { loadAccounts(!!getCache('accounts')); }, []);
  useLiveData(() => loadAccounts(true));

  const loadAccounts = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [data, txs] = await Promise.all([fetchAccounts(), fetchTransactions().catch(() => [])]);
      setAccounts(data);
      setAllTransactions(txs || []);
      fetchExchangeRates().then(r => {
        if (r) {
          setRates(r);
          localStorage.setItem('vm_fx_rates', JSON.stringify(r));
        }
      }).catch(() => {});
    } catch {
      toast.error('Failed to load accounts');
    } finally {
      setLoading(false);
    }
  };

  // Pre-compute balance sparklines per account (last 6 months of net flow)
  const sparklineByAccount = useMemo(() => {
    const result = {};
    accounts.forEach(acc => {
      const monthlyFlow = {};
      allTransactions.forEach(tx => {
        const mo = (tx.date || '').substring(0, 7);
        if (!mo) return;
        if (!monthlyFlow[mo]) monthlyFlow[mo] = 0;
        monthlyFlow[mo] += accountMovement(acc.id, tx);
      });
      const sorted = Object.keys(monthlyFlow).sort().slice(-6);
      if (sorted.length < 2) { result[acc.id] = []; return; }
      // Build running balance backwards from current
      let running = Number(acc.balance) || 0;
      const points = [];
      for (let i = sorted.length - 1; i >= 0; i--) {
        points.unshift({ month: sorted[i].substring(5), balance: parseFloat(running.toFixed(2)) });
        running -= monthlyFlow[sorted[i]];
      }
      result[acc.id] = points;
    });
    return result;
  }, [accounts, allTransactions]);

  const openAddModal = () => {
    setEditMode(false);
    setFormData({ name: '', type: 'Bank', balance: 0, currency: getCurrency(), cashback_rate: 0 });
    setIsModalOpen(true);
  };

  const openEditModal = (acc) => {
    setEditMode(true);
    setCurrentId(acc.id);
    setFormData({ name: acc.name, type: acc.type, balance: acc.balance, currency: acc.currency || getCurrency(), cashback_rate: acc.cashback_rate || 0 });
    setIsModalOpen(true);
  };

  const handleDelete = (id) => {
    setConfirm({ open: true, id });
  };

  const filterAndSortAccountHistory = (all, accId) => (all || []).filter(tx => {
    if (tx.type === 'Income') return String(tx.to_account_id) === String(accId);
    if (tx.type === 'Transfer') return String(tx.from_account_id) === String(accId) || String(tx.to_account_id) === String(accId);
    return String(tx.from_account_id) === String(accId);
  }).sort((a, b) => new Date(b.date) - new Date(a.date) || String(b.recorded_at || b.id || '').localeCompare(String(a.recorded_at || a.id || '')));

  const openHistory = async (acc) => {
    setViewAcc(acc);
    setTxHistory([]);
    setTxLoading(true);
    try {
      const cached = getCache('transactions');
      const all = cached || await fetchTransactions();
      setTxHistory(filterAndSortAccountHistory(all, acc.id));
    } catch { toast.error('Failed to load history'); }
    finally { setTxLoading(false); }
  };

  useEffect(() => {
    if (!viewAcc) return;
    const updatedAcc = accounts.find(a => String(a.id) === String(viewAcc.id));
    if (updatedAcc && updatedAcc !== viewAcc) setViewAcc(updatedAcc);
    setTxHistory(filterAndSortAccountHistory(allTransactions, viewAcc.id));
  }, [accounts, allTransactions, viewAcc]);

  const doDelete = async () => {
    const deleteId = confirm.id;
    // Optimistic: remove from UI immediately
    setAccounts(prev => prev.filter(a => String(a.id) !== String(deleteId)));
    setConfirm({ open: false, id: null });
    try {
      await deleteAccount(deleteId);
      toast.success('Account deleted');
      // Sync from cache to ensure consistency
      const fresh = getCache('accounts');
      if (fresh) setAccounts([...fresh]);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete account');
      loadAccounts(); // revert on error
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const snap = {
      ...formData,
      currency: formData.currency || getCurrency(),
      cashback_rate: Number(formData.cashback_rate) || 0,
    };
    setIsModalOpen(false);
    try {
      if (editMode) {
        // Optimistic: update in state immediately
        setAccounts(prev => prev.map(a => String(a.id) === String(currentId)
          ? { ...a, name: snap.name, type: snap.type, currency: snap.currency, cashback_rate: snap.cashback_rate }
          : a
        ));
        const { balance: _balance, ...details } = snap;
        await updateAccount(currentId, details);
        const fresh = getCache('accounts');
        if (fresh) setAccounts([...fresh]);
        toast.success('Account updated');
      } else {
        await createAccount({ ...snap, balance: Number(snap.balance) });
        // Read patched cache which has the new account with real Firestore ID
        const fresh = getCache('accounts');
        if (fresh) {
          setAccounts([...fresh]);
        } else {
          loadAccounts();
        }
        toast.success('Account created');
      }
    } catch (err) {
      toast.error(err?.message || (editMode ? 'Failed to update' : 'Failed to create account'));
      setIsModalOpen(true); // re-open on failure
      loadAccounts();
    }
  };

  const baseCurrency = getCurrency();
  // Convert each balance to the display currency. Accounts without an exchange
  // rate are excluded (and flagged) instead of turning the whole total into NaN.
  const { totalBalance, unconvertedAccounts } = useMemo(() => {
    let sum = 0;
    const missing = [];
    for (const a of accounts) {
      const accCur = a.currency || baseCurrency;
      const v = convertCurrency(Number(a.balance) || 0, accCur, baseCurrency, rates);
      if (Number.isFinite(v)) sum += v;
      else missing.push(a.name);
    }
    return { totalBalance: Math.round(sum * 100) / 100, unconvertedAccounts: missing };
  }, [accounts, rates, baseCurrency]);

  return (
    <PageWrapper>
      <div>
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="glow-text text-cyan" style={{ fontSize: '2rem' }}>Accounts</h1>
            <p style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', marginTop: 4 }}>
              Balances and account activity
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <ToolMenu label="Account tools">
            <button
              className="btn btn-secondary"
              onClick={() => window.dispatchEvent(new Event('vm:open-bank-sync'))}
              title="Open Banking & Live Bank Feeds"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.55rem 0.85rem', color: '#818cf8', borderColor: 'rgba(129,140,248,0.3)' }}
            >
              <span>🏦</span> Bank Sync
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.dispatchEvent(new Event('vm:open-cash-calendar'))}
              title="Interactive Cash Flow Calendar"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.55rem 0.85rem', color: '#38bdf8', borderColor: 'rgba(56,189,248,0.3)' }}
            >
              <span>📅</span> Calendar
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => window.dispatchEvent(new Event('vm:open-invoices'))}
              title="Client Invoicing & Billing"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.55rem 0.85rem', color: '#f472b6', borderColor: 'rgba(244,114,182,0.3)' }}
            >
              <span>💼</span> Invoices
            </button>
            <button
              className="btn"
              onClick={() => window.dispatchEvent(new Event('vm:open-currency-converter'))}
              title="Global Currency Converter Hub"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.78rem',
                padding: '0.55rem 0.85rem',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)'
              }}
            >
              <span>💱</span> Converter
            </button>
            </ToolMenu>
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> New Account
            </button>
          </div>
        </div>

        {/* Total balance banner */}
        {!loading && accounts.length > 0 && <InsightAccounts accounts={accounts} />}
        {!loading && accounts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="hud-panel"
            style={{ padding: '1.25rem 1.75rem', marginBottom: '1.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}
          >
            <div>
              <div style={{ fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>
                Total Portfolio Value
              </div>
              <div className="glow-text text-cyan" style={{ fontSize: '2rem', fontFamily: 'Inter, sans-serif', fontWeight: 700 }}>
                <AnimatedCounter value={totalBalance} formatter={formatCurrency} />
              </div>
              {unconvertedAccounts.length > 0 && (
                <div style={{ fontSize: '0.7rem', color: '#fbbf24', marginTop: 4 }}>
                  Excludes {unconvertedAccounts.join(', ')} (exchange rate unavailable)
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              {Object.entries(
                accounts.reduce((acc, a) => {
                  const accCur = a.currency || baseCurrency;
                  const converted = convertCurrency(Number(a.balance) || 0, accCur, baseCurrency, rates);
                  if (!Number.isFinite(converted)) return acc;
                  acc[a.type] = Math.round(((acc[a.type] ?? 0) + converted) * 100) / 100;
                  return acc;
                }, {})
              ).map(([type, bal]) => (
                <div key={type} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase' }}>{type}</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{formatCurrency(bal)}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <label style={{ display: 'flex', gap: 8, marginBottom: 16 }}><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} /> Show archived accounts (balances remain in portfolio totals)</label>
        <button className="btn btn-secondary" onClick={() => setShowReconciliation(value => !value)}>Reconcile ledger</button>
        {showReconciliation && <section className="glass-panel" style={{padding:20,margin:'16px 0',overflowX:'auto'}}>
          <h2>Ledger reconciliation</h2>
          <p>Expected balance = saved opening balance + transaction movements. Older accounts without an opening balance are marked for review.</p>
          <table style={{width:'100%'}}><thead><tr><th>Account</th><th>Opening</th><th>Expected</th><th>Recorded</th><th>Difference</th><th>Action</th></tr></thead><tbody>
          {accounts.map(account => { const result = reconcileAccount(account, allTransactions); const money = value => formatCurrency(value, {currency:account.currency || 'LKR'}); return <tr key={account.id}>
            <td>{account.name}</td><td>{result.known ? money(account.opening_balance) : 'Unknown'}</td><td>{result.known ? money(result.expected) : 'Opening balance needed'}</td><td>{money(account.balance)}</td><td>{result.known ? money(result.difference) : 'Review history'}</td>
            <td>{!result.known && <button className="btn btn-secondary" onClick={() => { setBaselineAccount(account); setBaselineAmount(''); }}>Set opening balance</button>}<button className="btn btn-secondary" disabled={account.archived} onClick={() => openReconcile(account)}>Compare statement</button></td>
          </tr>; })}</tbody></table>
        </section>}
        {/* Content */}
        {loading ? (
          <SkeletonLoader rows={3} height={200} />
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: '1.5rem' }}>
            {accounts.filter(a => showArchived || !a.archived).map((acc, i) => {
              const cfg = ACCOUNT_CONFIG[acc.type] || ACCOUNT_CONFIG.Bank;
              const Icon = cfg.icon;
              const recon = reconcileAccount(acc, allTransactions);
              return (
                <TiltWrapper key={acc.id}>
                  <motion.div
                    initial={{ opacity: 0, y: 28 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, type: 'spring', stiffness: 50, damping: 18 }}
                    style={{
                      background: cfg.gradient,
                      border: `1px solid ${cfg.borderColor}`,
                      borderRadius: 20,
                      padding: '1.75rem',
                      position: 'relative',
                      overflow: 'hidden',
                      minHeight: 200,
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      transformStyle: 'preserve-3d',
                      cursor: 'default',
                    }}
                  >
                    {/* Glass sheen */}
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', background: 'linear-gradient(180deg,rgba(255,255,255,0.04) 0%,transparent 100%)', pointerEvents: 'none', borderRadius: '20px 20px 0 0' }} />
                    {/* Glow orb */}
                    <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: `radial-gradient(circle, ${cfg.iconColor}22 0%, transparent 70%)`, pointerEvents: 'none' }} />

                    {/* Card top */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem', minWidth: 0 }}>
                        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${cfg.iconColor}18`, border: `1px solid ${cfg.iconColor}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={22} color={cfg.iconColor} />
                        </div>
                        <div>
                          <div style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 2 }}>
                            {acc.type}{acc.archived ? ' · Archived' : ''}
                          </div>
                          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{acc.name}</h3>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.1rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', marginLeft: 'auto' }}>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label={`Reconcile ${acc.name}`} title="Reconcile / Adjust to Actual Balance" style={{ color: '#38bdf8' }} onClick={() => openReconcile(acc)}>
                          <Scale size={14} />
                        </motion.button>
                        {accounts.length > 1 && (
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label={`Quick transfer from ${acc.name}`} title="Quick Transfer" onClick={() => openTransfer(acc)}>
                            <ArrowLeftRight size={14} />
                          </motion.button>
                        )}
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label={`View history for ${acc.name}`} title="View History" onClick={() => openHistory(acc)}>
                          <History size={14} />
                        </motion.button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label={`Edit ${acc.name}`} title="Edit Account" onClick={() => openEditModal(acc)}>
                          <Edit2 size={14} />
                        </motion.button>
                        <button type="button" className="btn btn-secondary" style={{ padding: '0.3rem 0.6rem', fontSize: '0.7rem' }} onClick={async () => {
                          try { await setAccountArchived(acc.id, !acc.archived); setAccounts(current => current.map(a => a.id === acc.id ? { ...a, archived: !a.archived } : a)); toast.success(acc.archived ? 'Account restored' : 'Account archived'); } catch (error) { toast.error(error.message); }
                        }}>{acc.archived ? 'Restore' : 'Archive'}</button>
                        <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} className="icon-btn" aria-label={`Delete ${acc.name}`} title="Delete Account" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(acc.id)}>
                          <Trash2 size={14} />
                        </motion.button>
                      </div>
                    </div>

                    {/* Balance */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                          CURRENT BALANCE
                        </span>
                        {acc.currency && acc.currency !== baseCurrency && (
                          <span style={{ fontSize: '0.65rem', fontFamily: 'Inter, sans-serif', fontWeight: 700, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.06)', padding: '0.15rem 0.45rem', borderRadius: 6 }}>
                            {acc.currency}
                          </span>
                        )}
                      </div>
                      <div className="glow-text" style={{ fontSize: '1.85rem', fontWeight: 650, fontFamily: 'Inter, sans-serif', color: acc.balance < 0 ? 'var(--danger)' : 'var(--text-primary)' }}>
                        <AnimatedCounter
                          value={acc.balance}
                          formatter={v => formatCurrency(v, { currency: acc.currency || baseCurrency })}
                        />
                      </div>
                      {acc.currency && acc.currency !== baseCurrency && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                          ≈ {formatCurrency(convertCurrency(acc.balance, acc.currency, baseCurrency, rates), { currency: baseCurrency })}
                        </div>
                      )}
                      {/* Live Ledger Reconciliation Status Pill */}
                      <div style={{ marginTop: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                        {recon.known && Math.abs(recon.difference || 0) < 0.01 ? (
                          <span style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 999, padding: '0.15rem 0.55rem' }}>
                            ✓ Ledger Verified
                          </span>
                        ) : !recon.known ? (
                          <button
                            type="button"
                            onClick={() => { setBaselineAccount(acc); setBaselineAmount(''); }}
                            style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#fbbf24', background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.28)', borderRadius: 999, padding: '0.15rem 0.55rem', cursor: 'pointer' }}
                          >
                            ⚠️ Set Opening Baseline
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openReconcile(acc)}
                            style={{ fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#f87171', background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 999, padding: '0.15rem 0.55rem', cursor: 'pointer' }}
                          >
                            ⚠️ Drift: {formatCurrency(recon.difference, { currency: acc.currency || baseCurrency })}
                          </button>
                        )}
                      </div>
                      {/* Cashback badge for credit cards */}
                      {acc.type === 'Credit Card' && acc.cashback_rate > 0 && (
                        <div style={{ marginTop: '0.5rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                          <div style={{ fontSize: '0.7rem', background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.3)', borderRadius:20, padding:'0.2rem 0.6rem', color:'#fbbf24', fontFamily:'Inter, sans-serif' }}>
                            🎁 {acc.cashback_rate}% cashback
                          </div>
                          {acc.rewards_earned > 0 && (
                            <div style={{ fontSize: '0.7rem', color:'#4ade80', fontFamily:'Inter, sans-serif' }}>
                              Earned: {formatCurrency(acc.rewards_earned, { currency: acc.currency || baseCurrency })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Balance history sparkline */}
                    {(sparklineByAccount[acc.id]?.length >= 2) && (
                      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:60, opacity:0.4, pointerEvents:'none', borderRadius:'0 0 20px 20px', overflow:'hidden' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sparklineByAccount[acc.id]} margin={{ top:0, right:0, left:0, bottom:0 }}>
                            <defs>
                              <linearGradient id={`sg-${acc.id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={cfg.iconColor} stopOpacity={0.5}/>
                                <stop offset="95%" stopColor={cfg.iconColor} stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <Area type="monotone" dataKey="balance" stroke={cfg.iconColor} strokeWidth={1.5} fill={`url(#sg-${acc.id})`} dot={false} isAnimationActive={false}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    )}

                  </motion.div>
                </TiltWrapper>
              );
            })}

            {accounts.length === 0 && (
              <div className="hud-panel col-span-12" style={{ textAlign: 'center', padding: '3.5rem', gridColumn: '1 / -1' }}>
                <Landmark size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                <p style={{ fontFamily: 'Inter, sans-serif', color: 'var(--text-muted)' }}>
                  NO ACCOUNTS DETECTED. INITIALIZE A NEW ASSET REPOSITORY.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Spending by Account */}
      {!loading && accounts.length > 1 && allTransactions.length > 0 && (() => {
        const spendMap = {};
        allTransactions.forEach(tx => {
          if (isActivePayment(tx) && (tx.type === 'Expense' || tx.type === 'Loan Payment') && tx.from_account_id) {
            const key = String(tx.from_account_id);
            spendMap[key] = (spendMap[key] || 0) + (Number(tx.amount) || 0);
          }
        });
        const rows = accounts
          .map(a => {
            const cur = a.currency || baseCurrency;
            const spend = parseFloat((spendMap[String(a.id)] || 0).toFixed(2));
            const baseSpend = cur === baseCurrency ? spend : (convertCurrency(spend, cur, baseCurrency, rates) ?? spend);
            return { id: a.id, currency: cur, name: a.name, spend, baseSpend };
          })
          .filter(r => r.spend > 0)
          .sort((a, b) => b.baseSpend - a.baseSpend);
        if (rows.length === 0) return null;
        const maxByCurrency = Object.fromEntries(rows.map(row => [row.currency, Math.max(...rows.filter(r => r.currency === row.currency).map(r => r.spend))]));
        return (
          <div className="heavy-section-deferred"
            style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem 1.5rem', marginTop:'1.5rem' }}>
            <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.7rem', letterSpacing:'2px', color:'var(--text-secondary)', marginBottom:'1rem' }}>💳 SPENDING BY ACCOUNT (ALL TIME)</div>
            <p>Amounts use each account’s currency. Bar lengths compare accounts within the same currency.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
              {rows.map((r, i) => (
                <div key={r.id}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem' }}>
                    <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem', color:'var(--text-primary)' }}>{r.name}</span>
                    <span style={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem', fontWeight:600, color:'#f87171' }}>{formatCurrency(r.spend, {currency:r.currency})}</span>
                  </div>
                  <div style={{ height:6, borderRadius:3, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                    <motion.div initial={{ width:0 }} animate={{ width:`${(r.spend/maxByCurrency[r.currency])*100}%` }} transition={{ duration:0.8, delay:0.05*i, ease:'easeOut' }}
                      style={{ height:'100%', borderRadius:3, background:`hsl(${220+i*30},70%,65%)`, boxShadow:`0 0 6px hsl(${220+i*30},70%,65%)40` }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <Modal isOpen={!!baselineAccount} onClose={() => !savingBaseline && setBaselineAccount(null)} title="Set opening balance">
        {baselineAccount && <form onSubmit={async e => {
          e.preventDefault(); setSavingBaseline(true);
          try { if (!baselineAmount.trim()) throw new Error('Enter a verified opening balance'); await setOpeningBalance(baselineAccount.id, Number(baselineAmount), baselineAccount.balance); setBaselineAccount(null); await loadAccounts(); toast.success('Opening balance saved'); }
          catch (error) { toast.error(error.message); } finally { setSavingBaseline(false); }
        }}>
          <p>Use the statement balance immediately before the first transaction recorded in this app. This sets a historical baseline; it does not change your current balance.</p>
          <p>Review account history first. Saved transaction movement: {formatCurrency(reconcileAccount(baselineAccount, allTransactions).delta, {currency:baselineAccount.currency || 'LKR'})}.</p>
          <label>Verified opening balance ({baselineAccount.currency || 'LKR'})<input aria-label="Verified opening balance" required type="number" step="0.01" value={baselineAmount} onChange={e => setBaselineAmount(e.target.value)}/></label>
          <p>Expected current balance: {baselineAmount.trim() ? formatCurrency(Number(baselineAmount) + reconcileAccount(baselineAccount, allTransactions).delta, {currency:baselineAccount.currency || 'LKR'}) : 'Enter opening balance'}. Compare this with your recorded balance before saving.</p>
          <button className="btn btn-primary" disabled={savingBaseline}>{savingBaseline ? 'Saving…' : 'Save opening balance'}</button>
        </form>}
      </Modal>
      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Account' : 'New Account'}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Account Name</label>
            <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Commercial Bank" />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Account Type</label>
            <FuturisticDropdown
              options={['Bank', 'Cash', 'Mobile Wallet', 'Credit Card']}
              value={formData.type}
              onChange={(val) => setFormData({ ...formData, type: val })}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Currency</label>
            <select
              disabled={editMode}
              value={formData.currency || baseCurrency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--text-primary)',
                fontFamily: 'Inter, sans-serif',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            >
              {SUPPORTED_CURRENCIES.map(c => (
                <option key={c.code} value={c.code} style={{ background: 'var(--bg-void)', color: 'var(--text-primary)' }}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          {!editMode && <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>{`Starting Balance (${formData.currency || baseCurrency})`}</label>
            <CurrencyInput required value={formData.balance} onChange={(val) => setFormData({ ...formData, balance: val })} />
          </div>}
          {editMode && <p>Adjust balances through Compare statement in ledger reconciliation. Account currency is fixed after creation.</p>}
          {formData.type === 'Credit Card' && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize:'0.82rem', color:'var(--text-secondary)' }}>
                Cashback Rate (%) <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>— rewards % per transaction</span>
              </label>
              <input type="number" inputMode="decimal" min="0" max="10" step="0.1" placeholder="e.g. 1.5"
                value={formData.cashback_rate || ''}
                onChange={e => setFormData({ ...formData, cashback_rate: parseFloat(e.target.value) || 0 })}
                style={{ width:'100%' }}
              />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Save Account'}</button>
          </div>
        </form>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        open={confirm.open}
        title="Delete Account"
        message="Are you sure you want to delete this account? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
      />

      {/* Quick Transfer Modal */}
      <Modal isOpen={transferModal} onClose={() => setTransferModal(false)} title="↔ Quick Transfer">
        <form onSubmit={handleTransfer} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div>
            <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.75rem', color:'var(--text-muted)', marginBottom:'0.4rem' }}>FROM</div>
            <div style={{ fontFamily:'Inter, sans-serif', fontWeight:600, color:'var(--text-primary)' }}>
              {accounts.find(a => String(a.id) === String(transferFrom))?.name || '—'}
            </div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem', fontFamily:'Inter, sans-serif' }}>To Account</label>
            <select value={transferForm.toId} onChange={e => setTransferForm(f => ({...f, toId:e.target.value}))}
              style={{ width:'100%', padding:'0.6rem', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--text-primary)', fontFamily:'Inter, sans-serif' }}>
              {accounts.filter(a => !a.archived && String(a.id) !== String(transferFrom)).map(a => (
                <option key={a.id} value={a.id} style={{ background:'#0a0d1a' }}>{a.name} — {formatCurrency(a.balance, { currency: a.currency || baseCurrency })}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem', fontFamily:'Inter, sans-serif' }}>Amount</label>
            <CurrencyInput required value={transferForm.amount} onChange={v => setTransferForm(f => ({...f, amount:v}))}/>
          </div>
          <label>Amount received in destination currency (required for different currencies)
            <CurrencyInput value={transferForm.received || ''} onChange={v => setTransferForm(f => ({ ...f, received: v }))} />
          </label>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setTransferModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">↔ Transfer</button>
          </div>
        </form>
      </Modal>

      {/* 1-Tap Reconcile Account Balance Modal */}
      <Modal
        isOpen={!!reconcileAcc}
        onClose={() => setReconcileAcc(null)}
        title={`⚖️ Reconcile Balance — ${reconcileAcc?.name || ''}`}
      >
        {reconcileAcc && (() => {
          const currentBal = parseFloat(reconcileAcc.balance) || 0;
          const actualBal = parseFloat(reconcileActual) || 0;
          const diff = parseFloat((actualBal - currentBal).toFixed(2));
          const accCur = reconcileAcc.currency || baseCurrency;
          return (
            <form onSubmit={handleReconcileSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '0.75rem',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                <div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase' }}>
                    Recorded in App
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)', marginTop: 2 }}>
                    {formatCurrency(currentBal, { currency: accCur })}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase' }}>
                    Discrepancy
                  </div>
                  <div style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    fontFamily: 'Inter, sans-serif',
                    color: Math.abs(diff) < 0.01 ? 'var(--text-muted)' : diff > 0 ? '#4ade80' : '#f87171',
                    marginTop: 2
                  }}>
                    {Math.abs(diff) < 0.01 ? 'Matched ✓' : `${diff > 0 ? '+' : '-'}${formatCurrency(Math.abs(diff), { currency: accCur })}`}
                  </div>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '0.45rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  {`Actual Current Balance (${accCur})`}
                </label>
                <CurrencyInput
                  required
                  value={reconcileActual}
                  onChange={(v) => setReconcileActual(v)}
                />
              </div>

              <p>Every adjustment is recorded in your transaction history.</p>
              {(
                <div>
                  <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    Adjustment Note
                  </label>
                  <input
                    value={reconcileNote}
                    onChange={e => setReconcileNote(e.target.value)}
                    placeholder="Balance Reconciliation Adjustment"
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setReconcileAcc(null)}>Cancel</button>
                <button type="submit" disabled={reconciling} className="btn btn-primary">
                  {reconciling ? 'Reconciling…' : '⚖️ Confirm Reconciliation'}
                </button>
              </div>
            </form>
          );
        })()}
      </Modal>

      {/* Transaction History Drawer */}
      {viewAcc && (() => {
        const accCur = viewAcc.currency || baseCurrency;
        const fmtAcc = (v) => formatCurrency(v, { currency: accCur });
        const summary = summarizeAccountHistory(viewAcc, txHistory);
        return (
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', zIndex:9999, display:'flex', justifyContent:'flex-end' }}
          onClick={e => { if (e.target === e.currentTarget) setViewAcc(null); }}>
          <motion.div initial={{ x:'100%' }} animate={{ x:0 }} exit={{ x:'100%' }} transition={{ type:'spring', stiffness:300, damping:30 }}
            style={{ width:'min(480px, 100vw)', height:'100%', background:'var(--bg-deep,#1e1e32)', borderLeft:'1px solid rgba(255,255,255,0.08)', display:'flex', flexDirection:'column', overflowY:'auto', paddingBottom:'calc(1rem + env(safe-area-inset-bottom, 16px))' }}>
            {/* Header */}
            <div style={{ padding:'1.5rem', borderBottom:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.75rem', background:`${ACCOUNT_CONFIG[viewAcc.type]?.iconColor || '#4ade80'}08` }}>
              <div>
                <div style={{ fontSize:'0.65rem', fontFamily:'Inter, sans-serif', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:4 }}>{viewAcc.type} HISTORY</div>
                <h2 style={{ margin:0, fontSize:'1.25rem', fontFamily:'Inter, sans-serif' }}>{viewAcc.name}</h2>
                <div style={{ fontSize:'1.5rem', fontWeight:700, color:ACCOUNT_CONFIG[viewAcc.type]?.iconColor || '#4ade80', fontFamily:'Inter, sans-serif', marginTop:'0.25rem' }}>
                  {fmtAcc(viewAcc.balance)}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                <button
                  type="button"
                  onClick={() => {
                    const target = viewAcc;
                    setViewAcc(null);
                    setReconcileAcc(target);
                    setReconcileActual(target.balance ?? 0);
                    setReconcileNote('Balance Reconciliation Adjustment');
                  }}
                  className="btn btn-secondary"
                  style={{ padding:'0.4rem 0.65rem', fontSize:'0.72rem', display:'inline-flex', alignItems:'center', gap:'0.35rem' }}
                  title="Adjust recorded balance to match actual cash/statement"
                >
                  <Scale size={14}/> Reconcile
                </button>
                <button onClick={() => setViewAcc(null)} className="icon-btn" style={{ fontSize:'1.2rem' }}><X size={20}/></button>
              </div>
            </div>
        {/* Content */}
            <div style={{ padding:'1rem', flex:1 }}>
              {txLoading ? (
                <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'0.5rem', marginBottom:'0.85rem', padding:'0.75rem', borderRadius:12, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
                    <div>
                      <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase' }}>Inflows</div>
                      <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#4ade80', marginTop:2 }}>+{fmtAcc(summary.inflows)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase' }}>Outflows</div>
                      <div style={{ fontSize:'0.82rem', fontWeight:700, color:'#f87171', marginTop:2 }}>-{fmtAcc(summary.outflows)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', textTransform:'uppercase' }}>Net Change</div>
                      <div style={{ fontSize:'0.82rem', fontWeight:700, color: summary.delta >= 0 ? '#4ade80' : '#f87171', marginTop:2 }}>
                        {summary.delta >= 0 ? '+' : '-'}{fmtAcc(Math.abs(summary.delta))}
                      </div>
                    </div>
                    <div style={{ gridColumn:'1 / -1', borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'0.5rem', marginTop:'0.15rem', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.4rem', fontSize:'0.72rem', color:'var(--text-secondary)' }}>
                      <span>Opening: <strong>{summary.known ? fmtAcc(viewAcc.opening_balance) : 'Not set'}</strong></span>
                      {summary.known && (
                        <span>
                          Expected: <strong>{fmtAcc(summary.expected)}</strong>
                          {Math.abs(summary.difference) >= 0.01 && (
                            <span style={{ color:'#fbbf24', marginLeft:6 }}>
                              (Drift {summary.difference > 0 ? '+' : '-'}{fmtAcc(Math.abs(summary.difference))})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {txHistory.length === 0 ? (
                    <div style={{ textAlign:'center', padding:'2.5rem 1rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.82rem' }}>
                      <History size={36} style={{ opacity:0.2, marginBottom:'1rem' }}/><br/>NO TRANSACTIONS FOR THIS ACCOUNT
                    </div>
                  ) : (
                    <>
                      <div style={{ fontSize:'0.7rem', fontFamily:'Inter, sans-serif', letterSpacing:'1.5px', color:'var(--text-muted)', marginBottom:'0.75rem' }}>
                        {txHistory.length} TRANSACTION{txHistory.length !== 1 ? 'S' : ''}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                        {txHistory.map(tx => {
                          const mov = accountMovement(viewAcc.id, tx);
                          const isFeeChild = Boolean(tx.is_transfer_fee);
                          const statusTag = tx.reversal_of ? 'Reversal' : tx.reversed_at ? 'Reversed' : isFeeChild ? 'Included in Transfer' : null;
                          const isTransferIn = tx.type === 'Transfer' && mov > 0;
                          const typeColor = tx.type === 'Income' ? '#4ade80' : tx.type === 'Transfer' ? '#a78bfa' : '#f87171';
                          const Icon = tx.type === 'Income' || isTransferIn ? ArrowDownRight : tx.type === 'Transfer' ? ArrowLeftRight : ArrowUpRight;
                          const amountColor = isFeeChild ? 'var(--text-muted)' : mov > 0 ? '#4ade80' : mov < 0 ? '#f87171' : 'var(--text-secondary)';
                          const amountText = isFeeChild
                            ? `(${fmtAcc(tx.amount)} fee)`
                            : `${mov > 0 ? '+' : mov < 0 ? '-' : ''}${fmtAcc(Math.abs(mov))}`;
                          return (
                            <motion.div key={tx.id} initial={{ opacity:0, x:10 }} animate={{ opacity: tx.reversed_at || isFeeChild ? 0.72 : 1, x:0 }}
                              whileHover={{ scale: 1.01 }}
                              whileTap={{ scale: 0.99 }}
                              onClick={() => { haptic(); setPopupTx(tx); }}
                              style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.05)', cursor:'pointer', transition:'background 0.15s, border-color 0.15s' }}>
                              <div style={{ width:32, height:32, borderRadius:8, background:`${typeColor}18`, border:`1px solid ${typeColor}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <Icon size={16} color={typeColor}/>
                              </div>
                              <div style={{ flex:1, minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontWeight:600, fontSize:'0.82rem', overflow:'hidden' }}>
                                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{getCategoryEmoji(tx.category)} {tx.category || tx.type}</span>
                                  {statusTag && (
                                    <span style={{ fontSize:'0.6rem', padding:'0.08rem 0.35rem', borderRadius:4, flexShrink:0, background: tx.reversed_at ? 'rgba(251,191,36,0.16)' : tx.reversal_of ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.07)', color: tx.reversed_at ? '#fbbf24' : tx.reversal_of ? '#c084fc' : 'var(--text-muted)' }}>
                                      {statusTag}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                                  {tx.date}{tx.type === 'Transfer' && Number(tx.fee_amount) > 0 && mov < 0 ? ` · incl. ${fmtAcc(tx.fee_amount)} fee` : ''}{tx.notes ? ` · ${tx.notes}` : ''}
                                </div>
                              </div>
                              <div style={{ fontWeight:700, fontFamily:'Inter, sans-serif', color: amountColor, flexShrink:0, fontSize:'0.875rem' }}>
                                {amountText}
                              </div>
                            </motion.div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
        );
      })()}

      {/* ── Simple Transaction / Income / Deduction Details Popup ── */}
      <TransactionPopup
        isOpen={!!popupTx}
        onClose={() => setPopupTx(null)}
        transaction={popupTx}
        accounts={accounts}
        onDelete={async (tx) => {
          try {
            await deleteTransaction(tx.id);
            toast.success('Transaction deleted');
            loadAccounts(true);
          } catch (err) {
            toast.error(err?.message || 'Failed to delete transaction');
          }
        }}
      />
    </PageWrapper>
  );
};

export default Accounts;
