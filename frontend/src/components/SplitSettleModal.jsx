import React, { useState, useEffect, useMemo } from 'react';
import 'framer-motion';
import { Plus, Trash2, CheckCircle2, ArrowRight, Receipt, Sparkles } from 'lucide-react';
import Modal from './Modal';
import { fetchSharedTabs, saveSharedTab, fetchAccounts, createTransaction } from '../utils/api';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import toast from 'react-hot-toast';
import { todayYMD } from '../utils/dates';
import { getLastAccountId, rememberAccountId } from '../utils/lastAccount';

const DEFAULT_MEMBER_COLORS = ['#4ade80', '#818cf8', '#fbbf24', '#f472b6', '#38bdf8', '#a78bfa'];

/**
 * Debt Simplification Algorithm
 * Given a list of members and expenses, calculates the minimal set of payments to balance all accounts.
 */
function simplifyDebts(members, expenses) {
  const balances = {};
  members.forEach(m => { balances[m] = 0; });

  expenses.forEach(exp => {
    const total = parseFloat(exp.amount) || 0;
    const payer = exp.paidBy;
    if (balances[payer] === undefined) balances[payer] = 0;
    balances[payer] += total;

    // Split shares
    const participants = exp.participants || members;
    const share = total / Math.max(1, participants.length);

    participants.forEach(p => {
      if (balances[p] === undefined) balances[p] = 0;
      balances[p] -= share;
    });
  });

  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([name, bal]) => {
    // Round to 2 decimals to prevent floating point remainder issues
    const rounded = Math.round(bal * 100) / 100;
    if (rounded > 0.01) creditors.push({ name, amount: rounded });
    else if (rounded < -0.01) debtors.push({ name, amount: -rounded });
  });

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const settlements = [];
  let cIdx = 0;
  let dIdx = 0;

  while (cIdx < creditors.length && dIdx < debtors.length) {
    const cred = creditors[cIdx];
    const deb = debtors[dIdx];
    const settlementAmt = Math.min(cred.amount, deb.amount);

    if (settlementAmt > 0.01) {
      settlements.push({
        from: deb.name,
        to: cred.name,
        amount: Math.round(settlementAmt * 100) / 100,
      });
    }

    cred.amount -= settlementAmt;
    deb.amount -= settlementAmt;

    if (cred.amount <= 0.01) cIdx++;
    if (deb.amount <= 0.01) dIdx++;
  }

  return { balances, settlements };
}

// Save a shared tab; returns the saved tab, or null after telling the user it failed.
const safeSaveTab = async (tab) => {
  try { return await saveSharedTab(tab); }
  catch (err) { toast.error(err?.message || 'Couldn’t save the shared tab'); return null; }
};

export default function SplitSettleModal({ isOpen, onClose }) {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  // '' = only update the group tab, never touch an account balance
  const [settleAccountId, setSettleAccountId] = useState('');

  // Modals for creating tab or expense
  const [newTabModal, setNewTabModal] = useState(false);
  const [tabForm, setTabForm] = useState({ name: '', members: 'Me, Partner' });

  const [newExpModal, setNewExpModal] = useState(false);
  const [expForm, setExpForm] = useState({
    title: '',
    amount: '',
    paidBy: 'Me',
    date: todayYMD(),
  });

  // Load tabs & accounts
  const loadData = async () => {
    setLoading(true);
    try {
      const [tList, accs] = await Promise.all([fetchSharedTabs(), fetchAccounts()]);
      const usable = (accs || []).filter(a => !a.archived);
      setAccounts(usable);
      setSettleAccountId(prev => prev || getLastAccountId('split-settle', usable));

      if (tList && tList.length > 0) {
        setTabs(tList);
        setActiveTabId(tList[0].id);
      } else {
        // Initialize with default Household tab if none exists
        const initialTab = {
          id: 'tab_household_default',
          name: '🏠 Household & Shared',
          members: ['Me', 'Partner'],
          expenses: [],
        };
        if (!(await safeSaveTab(initialTab))) return;
        setTabs([initialTab]);
        setActiveTabId(initialTab.id);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const activeTab = useMemo(() => {
    return tabs.find(t => t.id === activeTabId) || tabs[0] || null;
  }, [tabs, activeTabId]);

  const debtAnalysis = useMemo(() => {
    if (!activeTab || !activeTab.members || !activeTab.expenses) {
      return { balances: {}, settlements: [] };
    }
    return simplifyDebts(activeTab.members, activeTab.expenses);
  }, [activeTab]);

  // Create new Tab
  const handleCreateTab = async (e) => {
    e.preventDefault();
    if (!tabForm.name.trim()) return;

    const memberList = tabForm.members
      .split(',')
      .map(m => m.trim())
      .filter(Boolean);

    const newTab = {
      id: `tab_${Date.now()}`,
      name: tabForm.name.trim(),
      members: memberList.length > 0 ? memberList : ['Me', 'Partner'],
      expenses: [],
    };

    const saved = await safeSaveTab(newTab);
    if (!saved) return;
    setTabs(prev => [saved, ...prev]);
    setActiveTabId(saved.id);
    setNewTabModal(false);
    setTabForm({ name: '', members: 'Me, Partner' });
    toast.success('Group tab created! 👥');
    haptic();
  };

  // Add Shared Expense
  const handleAddExpense = async (e) => {
    e.preventDefault();
    const amt = parseFloat(expForm.amount);
    if (!amt || amt <= 0 || !expForm.title.trim() || !activeTab) return;

    const newExp = {
      id: `exp_${Date.now()}`,
      title: expForm.title.trim(),
      amount: amt,
      paidBy: expForm.paidBy || activeTab.members[0],
      date: expForm.date || todayYMD(),
      participants: [...activeTab.members],
    };

    const updatedTab = {
      ...activeTab,
      expenses: [newExp, ...(activeTab.expenses || [])],
    };

    if (!(await safeSaveTab(updatedTab))) return;
    setTabs(prev => prev.map(t => t.id === updatedTab.id ? updatedTab : t));
    setNewExpModal(false);
    setExpForm({ title: '', amount: '', paidBy: activeTab.members[0] || 'Me', date: todayYMD() });
    toast.success('Expense added to group! 🧾');
    haptic();
  };

  // Delete Expense
  const handleDeleteExpense = async (expId) => {
    if (!activeTab) return;
    const updatedTab = {
      ...activeTab,
      expenses: activeTab.expenses.filter(e => e.id !== expId),
    };
    if (!(await safeSaveTab(updatedTab))) return;
    setTabs(prev => prev.map(t => t.id === updatedTab.id ? updatedTab : t));
    haptic();
  };

  // Settle Debt
  const handleSettleDebt = async (settlement) => {
    if (!activeTab) return;
    const isMeInvolved = settlement.from.toLowerCase() === 'me' || settlement.to.toLowerCase() === 'me';
    const logAccount = accounts.find(a => String(a.id) === String(settleAccountId));
    const willLog = isMeInvolved && Boolean(logAccount);
    const isReceivingMsg = settlement.to.toLowerCase() === 'me';

    const confirmMsg = `Settle ${settlement.from} → ${settlement.to} for ${formatCurrency(settlement.amount)}?` +
      (willLog
        ? `\n\nThis will ${isReceivingMsg ? 'ADD' : 'DEDUCT'} ${formatCurrency(settlement.amount)} ${isReceivingMsg ? 'to' : 'from'} "${logAccount.name}".`
        : isMeInvolved ? '\n\nThe group tab will be updated only (no account balance change).' : '');

    if (!window.confirm(confirmMsg)) return;

    // Log offsetting settlement expense to balance out ledger
    const settlementExp = {
      id: `exp_settle_${Date.now()}`,
      title: `🤝 Settlement: ${settlement.from} → ${settlement.to}`,
      amount: settlement.amount,
      paidBy: settlement.from,
      date: todayYMD(),
      participants: [settlement.to], // only paid directly to receiver
    };

    const updatedTab = {
      ...activeTab,
      expenses: [settlementExp, ...activeTab.expenses],
    };

    if (!(await safeSaveTab(updatedTab))) return;
    setTabs(prev => prev.map(t => t.id === updatedTab.id ? updatedTab : t));

    // Optionally log real transaction
    if (willLog) {
      try {
        const isReceiving = isReceivingMsg;
        await createTransaction({
          type: isReceiving ? 'Income' : 'Expense',
          amount: settlement.amount,
          date: todayYMD(),
          category: 'Transfers',
          notes: `Settled shared debt with ${isReceiving ? settlement.from : settlement.to} (${activeTab.name})`,
          from_account_id: isReceiving ? '' : logAccount.id,
          to_account_id: isReceiving ? logAccount.id : '',
        });
        rememberAccountId('split-settle', logAccount.id);
        toast.success(`Debt settled & logged to ${logAccount.name}! 💸`);
      } catch (err) {
        toast.error(`Group tab settled, but the account entry failed: ${err?.message || 'unknown error'}`);
      }
    } else {
      toast.success('Debt settled in group tab! 🤝');
    }
    haptic();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="👥 Shared Household & Group Expense Splitting" maxWidth="840px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>

        {/* Group Tabs Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', scrollbarWidth: 'none' }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTabId(tab.id); haptic(); }}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: 10,
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: activeTabId === tab.id ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  background: activeTabId === tab.id ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.02)',
                  color: activeTabId === tab.id ? 'var(--mm-success)' : '#9191ab',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                {tab.name}
              </button>
            ))}
          </div>

          <button
            onClick={() => setNewTabModal(true)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', padding: '0.4rem 0.75rem' }}
          >
            <Plus size={14} /> New Group
          </button>
        </div>

        {activeTab && (
          <>
            {/* Members & Action Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Members:</span>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  {activeTab.members?.map((m, idx) => (
                    <span
                      key={m}
                      style={{
                        padding: '0.2rem 0.6rem',
                        borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)',
                        border: `1px solid ${DEFAULT_MEMBER_COLORS[idx % DEFAULT_MEMBER_COLORS.length]}44`,
                        color: DEFAULT_MEMBER_COLORS[idx % DEFAULT_MEMBER_COLORS.length],
                        fontSize: '0.74rem',
                        fontWeight: 600,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setNewExpModal(true)}
                className="btn btn-primary"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  fontSize: '0.8rem', padding: '0.45rem 1rem',
                  background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                  color: '#0f172a', fontWeight: 600, border: 'none'
                }}
              >
                <Plus size={15} /> Add Shared Expense
              </button>
            </div>

            {/* Smart Debt Simplification ("Who Owes Who") */}
            <div style={{ background: 'rgba(37,37,64,0.7)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '1.1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Sparkles size={15} /> Simplified Settlement Ledger
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Minimizes multi-person transfers
                </span>
              </div>

              {accounts.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  When I settle, record it in:
                  <select
                    aria-label="Settlement account"
                    value={settleAccountId}
                    onChange={e => setSettleAccountId(e.target.value)}
                    style={{ padding: '0.3rem 0.5rem', borderRadius: 8, fontSize: '0.76rem', minWidth: 180 }}
                  >
                    <option value="">Don't record (group tab only)</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({formatCurrency(a.balance, a.currency ? { currency: a.currency } : undefined)})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {debtAnalysis.settlements.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--mm-success)', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                  <CheckCircle2 size={16} /> All accounts are fully settled! No debts outstanding. 🎉
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0.65rem' }}>
                  {debtAnalysis.settlements.map((s, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)',
                        borderRadius: 10, padding: '0.65rem 0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.84rem' }}>
                        <span style={{ fontWeight: 600, color: 'var(--mm-danger)' }}>{s.from}</span>
                        <ArrowRight size={13} color="#9191ab" />
                        <span style={{ fontWeight: 600, color: 'var(--mm-success)' }}>{s.to}</span>
                        <strong style={{ marginLeft: 4, color: 'var(--text-primary)' }}>{formatCurrency(s.amount)}</strong>
                      </div>

                      <button
                        onClick={() => handleSettleDebt(s)}
                        style={{
                          background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.35)',
                          color: 'var(--mm-success)', borderRadius: 8, padding: '0.25rem 0.65rem',
                          fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Settle Up
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Expenses History List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Shared Expenses ({activeTab.expenses?.length || 0})
              </span>

              {activeTab.expenses?.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                  No expenses added yet. Click "+ Add Shared Expense" to log shared costs!
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
                  {activeTab.expenses?.map(exp => (
                    <div
                      key={exp.id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.04)',
                        borderRadius: 10, padding: '0.65rem 0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                        <Receipt size={16} color="#818cf8" style={{ flexShrink: 0 }} />
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {exp.title}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            Paid by <strong style={{ color: 'var(--text-primary)' }}>{exp.paidBy}</strong> · {exp.date}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                        <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>{formatCurrency(exp.amount)}</strong>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                          title="Delete expense"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

      </div>

      {/* New Group Modal */}
      {newTabModal && (
        <Modal isOpen={newTabModal} onClose={() => setNewTabModal(false)} title="👥 Create Shared Group">
          <form onSubmit={handleCreateTab} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-primary)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Group Name</label>
              <input
                type="text"
                placeholder="e.g. 🏠 Household, ✈️ Europe Trip, 🍕 Flatmates"
                value={tabForm.name}
                onChange={e => setTabForm(f => ({ ...f, name: e.target.value }))}
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Members (comma-separated)</label>
              <input
                type="text"
                placeholder="Me, Sarah, Alex"
                value={tabForm.members}
                onChange={e => setTabForm(f => ({ ...f, members: e.target.value }))}
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setNewTabModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600 }}>
                Create Group
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* New Shared Expense Modal */}
      {newExpModal && activeTab && (
        <Modal isOpen={newExpModal} onClose={() => setNewExpModal(false)} title="🧾 Add Shared Expense">
          <form onSubmit={handleAddExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-primary)' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Expense Description</label>
              <input
                type="text"
                placeholder="e.g. Weekly Grocery Run, Airbnb deposit, Dinner"
                value={expForm.title}
                onChange={e => setExpForm(f => ({ ...f, title: e.target.value }))}
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Amount ({getCurrencyLabel()})</label>
                <input
                  type="number"
                  placeholder="0.00"
                  step="0.01"
                  value={expForm.amount}
                  onChange={e => setExpForm(f => ({ ...f, amount: e.target.value }))}
                  required
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 600 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Paid By</label>
                <select
                  value={expForm.paidBy}
                  onChange={e => setExpForm(f => ({ ...f, paidBy: e.target.value }))}
                  style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                >
                  {activeTab.members?.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: 8 }}>
              💡 This cost will be automatically divided equally among all <strong>{activeTab.members?.length || 2} members</strong>.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setNewExpModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600 }}>
                Save Expense
              </button>
            </div>
          </form>
        </Modal>
      )}

    </Modal>
  );
}
