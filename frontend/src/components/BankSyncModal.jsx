import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, CheckCircle2, ShieldCheck, Zap, Upload, FileText } from 'lucide-react';
import Modal from './Modal';
import { fetchAccounts, fetchTransactions, createTransaction, fetchRules } from '../utils/api';
import { executeRulesOnTransaction, DEFAULT_RULES } from '../utils/rulesEngine';
import { formatCurrency, haptic } from '../utils/format';
import { parseAnyBankFile } from '../utils/bankFileParser';
import toast from 'react-hot-toast';
import { todayYMD } from '../utils/dates';

const MOCK_BANKS = [
  { id: 'chase', name: 'Chase Bank', type: 'Checking ····· 4821', icon: '🏛️', status: 'Connected', balance: 5420.50 },
  { id: 'revolut', name: 'Revolut Global', type: 'Vault Card ····· 1904', icon: '💳', status: 'Connected', balance: 1250.00 },
  { id: 'hsbc', name: 'HSBC Premier', type: 'Savings ····· 8320', icon: '🏦', status: 'Connected', balance: 14890.00 },
];

const MOCK_INCOMING_FEED = [
  {
    notes: 'Whole Foods Market',
    amount: 54.30,
    type: 'Expense',
    category: '🍔 Food',
    status: 'cleared',
  },
  {
    notes: 'Uber Technologies Inc',
    amount: 19.50,
    type: 'Expense',
    category: 'Transport',
    status: 'cleared',
  },
  {
    notes: 'Apple Store Digital Services',
    amount: 9.99,
    type: 'Expense',
    category: 'Bills',
    status: 'cleared',
  },
  {
    notes: 'Chevron Fuel Station #402',
    amount: 42.00,
    type: 'Expense',
    category: 'Transport',
    status: 'pending',
  },
  {
    notes: 'Client Consulting Retainer',
    amount: 1500.00,
    type: 'Income',
    category: 'Salary',
    status: 'cleared',
  },
];

export default function BankSyncModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('upload'); // 'upload' | 'sandbox'
  const [syncing, setSyncing] = useState(false);
  const [syncedFeed, setSyncedFeed] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [existingTxs, setExistingTxs] = useState([]);
  const [rules, setRules] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(() => localStorage.getItem('vm_last_bank_sync') || 'Just now');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      Promise.all([fetchAccounts(), fetchTransactions(), fetchRules()]).then(([accs, txs, r]) => {
        setAccounts(accs || []);
        if (accs && accs.length > 0) setSelectedAccountId(accs[0].id);
        setExistingTxs(txs || []);
        setRules(r || DEFAULT_RULES);
      });
      setSyncedFeed(null);
    }
  }, [isOpen]);

  // Handle uploaded bank file (.ofx, .qfx, .qif)
  const handleBankFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result;
        const result = parseAnyBankFile(content, file.name);

        if (!result.transactions || result.transactions.length === 0) {
          toast.error(`Could not parse transactions from ${file.name}. Ensure it's an OFX, QFX, or QIF export.`);
          return;
        }

        const targetAccId = selectedAccountId || accounts[0]?.id || '';
        const processedItems = result.transactions.map((tx, idx) => {
          const item = {
            ...tx,
            id: `bank_import_${Date.now()}_${idx}`,
            from_account_id: tx.type === 'Expense' ? targetAccId : '',
            to_account_id: tx.type === 'Income' ? targetAccId : '',
          };

          const { transaction: ruleEnhanced, matchedRules } = executeRulesOnTransaction(rules, item);

          // Duplicate check: Match amount, date, or fitId
          const isDuplicate = existingTxs.some(existing => {
            const sameAmount = Math.abs((parseFloat(existing.amount) || 0) - (parseFloat(tx.amount) || 0)) < 0.01;
            const sameDate = existing.date === tx.date;
            const sameDesc = (existing.notes || '').toLowerCase().trim() === (tx.notes || '').toLowerCase().trim();
            return (sameAmount && sameDate) || (sameAmount && sameDesc);
          });

          return {
            item: ruleEnhanced,
            matchedRules: matchedRules.map(r => r.name),
            isDuplicate,
          };
        });

        setSyncedFeed(processedItems);
        toast.success(`Parsed ${processedItems.length} transactions from ${file.name} (${result.format})!`);
        haptic();
      } catch (err) {
        console.error(err);
        toast.error('Failed reading statement file.');
      }
    };
    reader.readAsText(file);
  };

  // Run Bank Sync Simulation
  const handleTriggerSync = async () => {
    setSyncing(true);
    haptic();

    setTimeout(() => {
      const targetAccId = selectedAccountId || accounts[0]?.id || '';
      const todayStr = todayYMD();

      const processedItems = MOCK_INCOMING_FEED.map((feedItem, idx) => {
        const itemWithDate = {
          ...feedItem,
          id: `feed_${Date.now()}_${idx}`,
          date: todayStr,
          from_account_id: feedItem.type === 'Expense' ? targetAccId : '',
          to_account_id: feedItem.type === 'Income' ? targetAccId : '',
        };

        const { transaction: ruleEnhanced, matchedRules } = executeRulesOnTransaction(rules, itemWithDate);

        const isDuplicate = existingTxs.some(t => {
          const sameAmount = Math.abs((parseFloat(t.amount) || 0) - (parseFloat(feedItem.amount) || 0)) < 0.01;
          const sameDesc = (t.notes || '').toLowerCase().trim() === feedItem.notes.toLowerCase().trim();
          return sameAmount && sameDesc;
        });

        return {
          item: ruleEnhanced,
          matchedRules: matchedRules.map(r => r.name),
          isDuplicate,
        };
      });

      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      localStorage.setItem('vm_last_bank_sync', `Today, ${timeStr}`);
      setLastSyncTime(`Today, ${timeStr}`);
      setSyncedFeed(processedItems);
      setSyncing(false);
      toast.success('Live bank feeds synced! 🏦');
      haptic();
    }, 900);
  };

  // Import New Bank Transactions
  const handleImportFeed = async () => {
    if (!syncedFeed) return;
    const toImport = syncedFeed.filter(f => !f.isDuplicate);
    if (toImport.length === 0) {
      toast('All transactions already imported or marked duplicates', { icon: 'ℹ️' });
      return;
    }

    try {
      for (const entry of toImport) {
        await createTransaction(entry.item);
      }
      toast.success(`Imported ${toImport.length} transactions into ledger! ⚡`);
      haptic();
      setSyncedFeed(null);
      onClose();
    } catch {
  toast.error('Failed to import feed transactions');
}
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🏦 Bank Feeds & Statement Hub" maxWidth="780px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>

        {/* Tab Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.75rem' }}>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'upload' ? 'rgba(74,222,128,0.15)' : 'transparent',
              color: activeTab === 'upload' ? '#4ade80' : '#888',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <Upload size={15} /> Real Bank Statement (OFX / QFX / QIF)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'sandbox' ? 'rgba(129,140,248,0.15)' : 'transparent',
              color: activeTab === 'sandbox' ? '#818cf8' : '#888',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={15} /> Live Sandbox Simulation
          </button>
        </div>

        {/* Target Account Selector */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.02)', padding: '0.65rem 1rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Syncing To Account:
          </div>
          <select
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            style={{
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              color: '#4ade80',
              fontWeight: 600,
              fontSize: '0.82rem',
              padding: '0.35rem 0.75rem'
            }}
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name} ({formatCurrency(acc.balance)})</option>
            ))}
          </select>
        </div>

        {activeTab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Explanatory Box */}
            <div style={{
              background: 'rgba(74,222,128,0.05)',
              border: '1px solid rgba(74,222,128,0.2)',
              borderRadius: 12,
              padding: '1rem',
              fontSize: '0.82rem',
              lineHeight: 1.5,
              color: '#d1d5db'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>
                <CheckCircle2 size={16} /> 100% Free Universal Bank Integration
              </div>
              Download an <strong>OFX, QFX, or QIF</strong> statement export from your bank portal (Chase, BoA, Wells Fargo, HSBC, Revolut, Monzo, HNB, Commercial Bank, Sampath, etc.) and drop it below. No third-party paid subscriptions required!
            </div>

            {/* Upload Dropzone */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleBankFileUpload}
              accept=".ofx,.qfx,.qif"
              style={{ display: 'none' }}
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: '2px dashed rgba(74,222,128,0.3)',
                borderRadius: 16,
                padding: '2.5rem 1.5rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'rgba(255,255,255,0.01)',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4ade80';
                e.currentTarget.style.background = 'rgba(74,222,128,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(74,222,128,0.3)';
                e.currentTarget.style.background = 'rgba(255,255,255,0.01)';
              }}
            >
              <div style={{
                width: 52,
                height: 52,
                borderRadius: 16,
                background: 'rgba(74,222,128,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                color: '#4ade80'
              }}>
                <FileText size={28} />
              </div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', marginBottom: 4 }}>
                Click or Drop Bank Statement File
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                Supports standard .OFX, .QFX, and .QIF formats
              </div>
            </div>
          </div>
        )}

        {activeTab === 'sandbox' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Top Header Strip */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: 12, flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  <ShieldCheck size={16} color="#4ade80" />
                  <span>Open Banking Sandbox Feed Active</span>
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Last synchronized: <strong style={{ color: '#cbd5e1' }}>{lastSyncTime}</strong>
                </div>
              </div>

              <button
                onClick={handleTriggerSync}
                disabled={syncing}
                className="btn btn-primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.8rem', padding: '0.45rem 1.1rem',
                  background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                  color: '#0f172a', fontWeight: 600, border: 'none'
                }}
              >
                <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Fetching Live Feeds...' : '⚡ Sync Feeds Now'}
              </button>
            </div>

            {/* Connected Institutions Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
              {MOCK_BANKS.map(bank => (
                <div
                  key={bank.id}
                  style={{
                    background: 'rgba(37,37,64,0.6)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '0.85rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '1.2rem' }}>{bank.icon}</span>
                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontWeight: 600 }}>
                      {bank.status}
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: 2 }}>
                    {bank.name}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                    {bank.type}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Synced Incoming Feed Preview */}
        {syncedFeed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(129, 140, 248, 0.08)',
              border: '1px solid rgba(129, 140, 248, 0.3)',
              borderRadius: 14,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 600, fontSize: '0.88rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={16} /> Parsed Transactions ({syncedFeed.length} detected)
              </div>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Evaluated against active Automation Rules
              </span>
            </div>

            <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
              {syncedFeed.map((entry, idx) => {
                const { item, matchedRules, isDuplicate } = entry;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '0.6rem 0.85rem', background: 'rgba(0,0,0,0.3)',
                      border: `1px solid ${isDuplicate ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius: 8, fontSize: '0.8rem', opacity: isDuplicate ? 0.5 : 1
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: item.status === 'pending' ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.15)', color: item.status === 'pending' ? '#fbbf24' : '#4ade80', fontWeight: 600 }}>
                        {item.status === 'pending' ? '⏳ PENDING' : 'CLEARED'}
                      </span>

                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.notes}
                        </span>
                        <div style={{ display: 'flex', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                          <span style={{ color: '#4ade80' }}>Category: {item.category}</span>
                          <span style={{ color: '#888' }}>Date: {item.date}</span>
                          {matchedRules.length > 0 && (
                            <span style={{ color: '#818cf8' }}>⚡ Rule: {matchedRules[0]}</span>
                          )}
                          {item.is_tax_deductible && (
                            <span style={{ color: '#fbbf24' }}>🏷️ Tax Deductible</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                      {isDuplicate ? (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>Duplicate skipped</span>
                      ) : (
                        <strong style={{ color: item.type === 'Income' ? '#4ade80' : '#f0f0f5', fontSize: '0.92rem' }}>
                          {item.type === 'Income' ? '+' : '-'}{formatCurrency(item.amount)}
                        </strong>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <button onClick={() => setSyncedFeed(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>Dismiss</button>
              <button
                onClick={handleImportFeed}
                className="btn btn-primary"
                style={{ fontSize: '0.8rem', padding: '0.4rem 1.1rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}
              >
                Import {syncedFeed.filter(f => !f.isDuplicate).length} New Transactions
              </button>
            </div>
          </motion.div>
        )}

      </div>
    </Modal>
  );
}
