import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, TrendingDown, Target, Wallet, Receipt, Brain, Zap, Compass } from 'lucide-react';
import { getCache } from '../utils/api';
import { formatCurrency, useStealthMode } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import { getRememberedNotes, searchRememberedNotes } from '../utils/noteMemory';
import { exportFullVaultBackup } from '../utils/backupCrypto';
import { isSuperAdmin } from '../utils/adminService';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const ICON_MAP = {
  command:     Zap,
  page:        Compass,
  transaction: Receipt,
  goal:        Target,
  account:     Wallet,
  bill:        TrendingDown,
  note:        Brain,
};

const QUICK_PAGES = [
  { label: 'Dashboard',    sub: 'Overview, net worth & cash-flow bento', path: '/dashboard',    emoji: '🏠' },
  { label: 'Transactions', sub: 'Full ledger, filters, bulk edit & CSV', path: '/transactions', emoji: '💸' },
  { label: 'Accounts',     sub: 'Banks, wallets, reconciliation & FX',   path: '/accounts',     emoji: '🏦' },
  { label: 'Budgets',      sub: 'Category limits, rollover & 50/30/20',  path: '/budgets',      emoji: '📊' },
  { label: 'Bills',        sub: 'Upcoming due dates & auto-pay',         path: '/bills',        emoji: '🧾' },
  { label: 'Goals',        sub: 'Savings targets, deadlines & round-ups',path: '/goals',        emoji: '🎯' },
  { label: 'Loans',        sub: 'Principal, EMI schedule & payoff',      path: '/loans',        emoji: '🏛️' },
  { label: 'Credit Cards', sub: 'Utilization, float advisor & cycles',   path: '/credit-cards', emoji: '💳' },
  { label: 'Investments',  sub: 'Portfolio P&L, allocation & crypto',    path: '/investments',  emoji: '📈' },
  { label: 'Recurring',    sub: 'Monthly reminders & auto-rules',        path: '/recurring',    emoji: '🔄' },
  { label: 'Analytics',    sub: 'Charts, trends & financial reports',    path: '/analytics',    emoji: '🔍' },
  { label: 'Settings',     sub: 'Preferences, security & JSON backups',  path: '/settings',     emoji: '⚙️' },
];

const GlobalSearch = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const [stealth, toggleStealth] = useStealthMode();

  const topNotes = getRememberedNotes(getCache('transactions') || []);

  const quickCommands = useMemo(() => {
    const list = [
      {
        type: 'command', id: 'cmd_quick_add', emoji: '⚡',
        label: 'Quick Add Transaction',
        sub: 'Record an expense, income, or transfer anywhere',
        action: () => window.dispatchEvent(new Event('vm:quick-add')),
      },
      {
        type: 'command', id: 'cmd_scan_receipt', emoji: '📷',
        label: 'Scan Receipt',
        sub: 'Extract merchant, date & total from receipt photo',
        action: () => window.dispatchEvent(new Event('vm:open-receipt-scanner')),
      },
      {
        type: 'command', id: 'cmd_ai_copilot', emoji: '🤖',
        label: 'Money Assistant',
        sub: 'Quick answers about spending, runway and affordability from your data',
        action: () => window.dispatchEvent(new Event('vm:open-ai-copilot')),
      },
      {
        type: 'command', id: 'cmd_calendar', emoji: '📅',
        label: 'Cash Flow Calendar',
        sub: 'Daily calendar view of income, expenses & bills',
        action: () => window.dispatchEvent(new Event('vm:open-cash-calendar')),
      },
      {
        type: 'command', id: 'cmd_rules', emoji: '⚙️',
        label: 'Automated Rules Engine',
        sub: 'Auto-categorize and tag incoming transactions',
        action: () => window.dispatchEvent(new Event('vm:open-rules-manager')),
      },
      {
        type: 'command', id: 'cmd_converter', emoji: '💱',
        label: 'Currency Converter Hub',
        sub: 'Live multi-currency FX rates & calculator',
        action: () => window.dispatchEvent(new Event('vm:open-currency-converter')),
      },
      {
        type: 'command', id: 'cmd_stealth', emoji: stealth ? '👁️' : '🙈',
        label: stealth ? 'Disable Privacy Mode (Show Amounts)' : 'Enable Privacy Mode (Mask Amounts)',
        sub: 'Toggle stealth masking across all balances & amounts',
        action: () => { toggleStealth(); toast.success(stealth ? 'Privacy mode off' : 'Privacy mode on'); },
      },
      {
        type: 'command', id: 'cmd_backup', emoji: '💾',
        label: 'Export Full Backup (JSON)',
        sub: 'Download a complete snapshot of your vault now',
        action: async () => {
          try {
            await exportFullVaultBackup('');
            toast.success('Full vault backup downloaded');
          } catch {
            toast.error('Backup export failed');
          }
        },
      },
    ];
    if (isSuperAdmin()) {
      list.push({
        type: 'page', id: 'page_admin', emoji: '🛡️',
        label: 'Administration Console',
        sub: 'System maintenance, audit log & diagnostics',
        path: '/admin',
      });
    }
    return list;
  }, [stealth, toggleStealth]);

  useEffect(() => {
    if (open) { setQuery(''); setResults([]); setActiveIdx(0); setTimeout(() => inputRef.current?.focus(), 60); }
  }, [open]);

  const search = useCallback((q) => {
    if (!q.trim()) { setResults([]); return; }
    const lower = q.toLowerCase();
    const hits = [];

    // 1. Matching Quick Commands
    quickCommands.filter(cmd =>
      cmd.label.toLowerCase().includes(lower) || cmd.sub.toLowerCase().includes(lower)
    ).slice(0, 4).forEach(cmd => hits.push(cmd));

    // 2. Matching Navigation Pages
    QUICK_PAGES.filter(p =>
      p.label.toLowerCase().includes(lower) || p.sub.toLowerCase().includes(lower)
    ).slice(0, 3).forEach(p => hits.push({
      type: 'page', id: `page_${p.path}`,
      emoji: p.emoji,
      label: `Go to ${p.label}`,
      sub: p.sub,
      path: p.path,
    }));

    const txs = getCache('transactions') || [];

    // 3. Note Memory search
    const matchedNotes = searchRememberedNotes(lower, txs, 3);
    matchedNotes.forEach(rn => hits.push({
      type: 'note', id: `note_${rn.text}`,
      label: rn.text,
      sub: `Note Memory · ${rn.count} txn${rn.count > 1 ? 's' : ''}${rn.category ? ` · ${rn.category}` : ''}`,
      path: `/transactions?q=${encodeURIComponent(rn.text)}`,
    }));

    // 4. Transactions (deep-linked with ?q= so the clicked row is filtered immediately)
    txs.filter(tx =>
      tx.category?.toLowerCase().includes(lower) ||
      tx.notes?.toLowerCase().includes(lower) ||
      String(tx.amount).includes(lower)
    ).slice(0, 5).forEach(tx => {
      const qParam = tx.notes || tx.category || String(tx.amount);
      hits.push({
        type: 'transaction', id: tx.id,
        label: tx.category || tx.type,
        sub: `${tx.notes ? `${tx.notes} · ` : ''}${tx.date || ''}`,
        amount: tx.amount,
        txType: tx.type,
        path: `/transactions?q=${encodeURIComponent(qParam)}`,
      });
    });

    const goals = getCache('goals') || [];
    goals.filter(g =>
      g.goal_name?.toLowerCase().includes(lower) || g.name?.toLowerCase().includes(lower)
    ).slice(0, 3).forEach(g => hits.push({
      type: 'goal', id: g.id,
      label: g.goal_name || g.name,
      sub: `${formatCurrency(g.current_amount)} / ${formatCurrency(g.target_amount)}`,
      path: '/goals',
    }));

    const accounts = getCache('accounts') || [];
    accounts.filter(a => a.name?.toLowerCase().includes(lower)).slice(0, 3).forEach(a => hits.push({
      type: 'account', id: a.id,
      label: a.name,
      sub: `${a.type} · ${formatCurrency(a.balance)}`,
      path: '/accounts',
    }));

    const bills = getCache('bills') || [];
    bills.filter(b => b.name?.toLowerCase().includes(lower)).slice(0, 3).forEach(b => hits.push({
      type: 'bill', id: b.id,
      label: b.name,
      sub: `${formatCurrency(b.amount)} · ${b.due_date}`,
      path: '/bills',
    }));

    setResults(hits);
    setActiveIdx(0);
  }, [quickCommands]);

  useEffect(() => { search(query); }, [query, search]);

  const go = (result) => {
    onClose();
    if (typeof result.action === 'function') {
      result.action();
    } else if (result.path) {
      navigate(result.path);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) go(results[activeIdx]);
    if (e.key === 'Escape') onClose();
  };

  const typeColor = { command: '#38bdf8', page: '#94a3b8', transaction: '#818cf8', goal: '#4ade80', account: '#00f5ff', bill: '#fbbf24', note: '#a78bfa' };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(0,0,0,0.78)', backdropFilter:'blur(8px)', display:'flex', alignItems:'flex-start', justifyContent:'center', paddingTop:'max(1rem, env(safe-area-inset-top, 0px))', paddingBottom:'env(safe-area-inset-bottom, 0px)' }}>
          <motion.div
            initial={{ opacity:0, y:-20, scale:0.98 }} animate={{ opacity:1, y:0, scale:1 }} exit={{ opacity:0, y:-12, scale:0.98 }}
            transition={{ type:'spring', stiffness:400, damping:30 }}
            onClick={e => e.stopPropagation()}
            style={{ width:'100%', maxWidth:580, maxHeight:'85dvh', display:'flex', flexDirection:'column', background:'linear-gradient(135deg,rgba(18,22,38,0.98),rgba(10,13,26,0.99))', border:'1px solid rgba(74,222,128,0.25)', borderRadius:18, boxShadow:'0 0 60px rgba(0,0,0,0.7),0 24px 80px rgba(0,0,0,0.6)', overflow:'hidden', margin:'0 0.75rem' }}>

            {/* Search bar */}
            <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'1rem 1.25rem', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
              <Search size={18} color="#00f5ff" style={{ flexShrink:0 }}/>
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
                placeholder="Type a command or search transactions, goals, accounts, bills..."
                aria-label="Global command palette and search"
                style={{ flex:1, background:'none', border:'none', outline:'none', fontSize:'1rem', color:'var(--text-primary)' }}/>
              <button onClick={onClose} aria-label="Close command palette" style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', display:'flex', alignItems:'center' }}><X size={16}/></button>
            </div>

            {/* Results */}
            {results.length > 0 ? (
              <div style={{ maxHeight:380, overflowY:'auto' }}>
                {results.map((r, i) => {
                  const Icon = ICON_MAP[r.type] || Receipt;
                  const col = typeColor[r.type] || '#aaa';
                  return (
                    <div key={`${r.type}-${r.id}`} onClick={() => go(r)}
                      onMouseEnter={() => setActiveIdx(i)}
                      style={{ display:'flex', alignItems:'center', gap:'0.875rem', padding:'0.75rem 1.25rem', cursor:'pointer', background:i===activeIdx?'rgba(0,245,255,0.06)':'transparent', borderLeft:i===activeIdx?'2px solid #00f5ff':'2px solid transparent', transition:'background 0.1s' }}>
                      <div style={{ width:34, height:34, borderRadius:10, background:`${col}18`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {r.emoji ? (
                          <span style={{ fontSize:'1.05rem' }}>{r.emoji}</span>
                        ) : r.type==='transaction' ? (
                          <span style={{ fontSize:'1.1rem' }}>{getCategoryEmoji(r.label)||'💸'}</span>
                        ) : (
                          <Icon size={16} style={{ color:col }}/>
                        )}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:600, fontSize:'0.88rem', color:'var(--text-primary)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.label}</div>
                        <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.sub}</div>
                      </div>
                      <div style={{ flexShrink:0, textAlign:'right' }}>
                        {r.amount !== undefined && (
                          <div style={{ fontWeight:700, fontSize:'0.85rem', color:r.txType==='Income'?'var(--mm-success)':r.txType==='Transfer'?'#818cf8':'var(--mm-danger)' }}>
                            {r.txType==='Income'?'+':r.txType==='Transfer'?'↔':'-'}{formatCurrency(r.amount)}
                          </div>
                        )}
                        <div style={{ fontSize:'0.62rem', color:col, letterSpacing:'0.5px', textTransform:'uppercase' }}>{r.type}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : query.trim() ? (
              <div style={{ padding:'2rem', textAlign:'center', color:'var(--text-muted)', fontSize:'0.85rem' }}>
                No results for "{query}"
              </div>
            ) : (
              <div style={{ padding:'1.1rem 1.35rem', maxHeight:400, overflowY:'auto' }}>
                {/* Quick Actions */}
                <div style={{ marginBottom:'1.1rem' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.65rem', letterSpacing:'1.5px', color:'#38bdf8', marginBottom:'0.55rem' }}>
                    <Zap size={12} />
                    <span>QUICK ACTIONS</span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'0.4rem' }}>
                    {quickCommands.slice(0, 6).map(cmd => (
                      <button
                        key={cmd.id}
                        type="button"
                        onClick={() => go(cmd)}
                        style={{
                          display:'flex', alignItems:'center', gap:'0.55rem',
                          padding:'0.48rem 0.7rem', borderRadius:10,
                          background:'rgba(255,255,255,0.025)',
                          border:'1px solid rgba(255,255,255,0.07)',
                          color:'var(--text-primary)', fontSize:'0.78rem', cursor:'pointer', textAlign:'left',
                          transition:'border-color 0.15s, background 0.15s',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(56,189,248,0.4)'; e.currentTarget.style.background = 'rgba(56,189,248,0.06)'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
                      >
                        <span style={{ fontSize:'0.95rem', flexShrink:0 }}>{cmd.emoji}</span>
                        <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:500 }}>{cmd.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Notes Memory Quick Filter Chips */}
                {topNotes.length > 0 && (
                  <div style={{ marginBottom:'1.1rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.65rem', letterSpacing:'1.5px', color:'var(--mm-success)', marginBottom:'0.55rem' }}>
                      <Brain size={12} />
                      <span>NOTES MEMORY</span>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:'0.35rem' }}>
                      {topNotes.slice(0, 8).map(rn => (
                        <button
                          key={rn.text}
                          type="button"
                          onClick={() => go({ path: `/transactions?q=${encodeURIComponent(rn.text)}` })}
                          style={{
                            display:'inline-flex', alignItems:'center', gap:'0.35rem',
                            padding:'0.28rem 0.65rem', borderRadius:100,
                            background:'rgba(255,255,255,0.03)',
                            border:'1px solid rgba(255,255,255,0.08)',
                            color:'var(--text-primary)', fontSize:'0.75rem', cursor:'pointer',
                            transition:'all 0.15s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(74,222,128,0.4)'; e.currentTarget.style.color = '#4ade80'; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#f0f0f5'; }}
                        >
                          <span>{rn.text}</span>
                          <span style={{ fontSize:'0.65rem', opacity:0.65, background:'rgba(255,255,255,0.08)', borderRadius:6, padding:'0 0.3rem' }}>
                            {rn.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ fontSize:'0.65rem', letterSpacing:'1.5px', color:'var(--text-muted)', marginBottom:'0.55rem' }}>QUICK NAVIGATION</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:'0.25rem' }}>
                  {QUICK_PAGES.map(item => (
                    <div key={item.path} onClick={() => { navigate(item.path); onClose(); }}
                      style={{ display:'flex', alignItems:'center', gap:'0.65rem', padding:'0.45rem 0.6rem', borderRadius:8, cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                      onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                      <span style={{ fontSize:'0.95rem' }}>{item.emoji}</span>
                      <span style={{ fontSize:'0.82rem', color:'var(--text-secondary)' }}>{item.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer hint */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:'0.85rem', padding:'0.6rem 1.25rem', borderTop:'1px solid rgba(255,255,255,0.05)', fontSize:'0.65rem', color:'var(--text-muted)' }}>
              <span>↑↓ navigate</span><span>↵ run / open</span><span>ESC close</span>
              <span style={{ marginLeft:'auto' }}>Shortcuts: [N] Quick Add · [P] Stealth · [/] Search · [⌘K] Palette</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalSearch;