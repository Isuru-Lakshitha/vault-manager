import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, User, ShieldCheck } from 'lucide-react';
import Modal from './Modal';
import {
  fetchAccounts, fetchTransactions, fetchBills,
  fetchGoals, fetchLoans, fetchBudgets, fetchInvestments
} from '../utils/api';
import { calculateSafeToSpend, calculateEmergencyRunway } from '../utils/financialIntelligence';

import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import 'react-hot-toast';

const SUGGESTED_QUERIES = [
  { icon: '🛍️', text: 'Can I afford an upcoming purchase?' },
  { icon: '🔍', text: 'Where is my biggest financial leak this month?' },
  { icon: '🛡️', text: 'How secure is my emergency runway?' },
  { icon: '🏷️', text: 'Summarize my tax deductions for this year' },
  { icon: '🎯', text: 'Am I on track with the 50/30/20 rule?' },
];

export default function AICoPilotModal({ isOpen, onClose }) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      text: `Hi! I'm your **Money Assistant**. I answer from your own transactions: spending breakdowns, runway, tax-deductible spending and whether you can afford something.\n\nPick a question below or type one:`,
      cards: null,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [financialData, setFinancialData] = useState(null);
  const [, setLoadingData] = useState(true);
  const [affordModal, setAffordModal] = useState(false);
  const [affordAmount, setAffordAmount] = useState('');
  const [affordItem, setAffordItem] = useState('');

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Load all live financial snapshot data
  useEffect(() => {
    if (isOpen) {
      setLoadingData(true);
      Promise.all([
        fetchAccounts(),
        fetchTransactions(),
        fetchBills(),
        fetchGoals(),
        fetchLoans(),
        fetchBudgets(),
        fetchInvestments(),
      ]).then(([accounts, transactions, bills, goals, loans, budgets, investments]) => {
        const safeData = calculateSafeToSpend({ accounts, bills, loans, goals, transactions });
        const runwayData = calculateEmergencyRunway(accounts, transactions);

        // Compute 30d spend & category breakdown
        const now = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(now.getDate() - 30);

        const recentTxs = transactions.filter(t => new Date(t.date) >= thirtyDaysAgo);
        const income30d = recentTxs.filter(t => t.type === 'Income').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);
        const expense30d = recentTxs.filter(t => t.type === 'Expense').reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

        const categoryMap = {};
        recentTxs.filter(t => t.type === 'Expense').forEach(t => {
          const cat = t.category || 'Uncategorized';
          categoryMap[cat] = (categoryMap[cat] || 0) + (parseFloat(t.amount) || 0);
        });

        const topCategories = Object.entries(categoryMap)
          .map(([name, total]) => ({ name, total }))
          .sort((a, b) => b.total - a.total);

        // Tax deductible transactions
        const currentYear = now.getFullYear();
        const taxDeductibleTxs = transactions.filter(t => {
          const isYear = new Date(t.date).getFullYear() === currentYear;
          return isYear && (t.is_tax_deductible || (t.tags && t.tags.includes('#tax-deductible')));
        });
        const totalDeductions = taxDeductibleTxs.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

        setFinancialData({
          accounts,
          transactions,
          bills,
          goals,
          loans,
          budgets,
          investments,
          safeData,
          runwayData,
          income30d,
          expense30d,
          topCategories,
          taxDeductibleTxs,
          totalDeductions,
        });
        setLoadingData(false);
      }).catch(() => setLoadingData(false));
    }
  }, [isOpen]);

  // Comprehensive rule-based financial analysis engine (Instant & 100% private)
  const processQuery = async (queryText) => {
    if (!financialData) return;
    const q = queryText.toLowerCase().trim();

    // 1. Purchase Affordability
    if (q.includes('afford') || q.includes('buy') || q.includes('purchase')) {
      setAffordModal(true);
      return;
    }

    // 2. Financial Leaks & Waste
    if (q.includes('leak') || q.includes('waste') || q.includes('expensive') || q.includes('cut spend')) {
      const { topCategories, expense30d, bills } = financialData;
      const topCat = topCategories[0];
      const secondCat = topCategories[1];
      const recurringSum = bills.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);

      const reply = `Here is your **Financial Leak Audit** based on the past 30 days:\n\n` +
        `• **Highest Spending Category:** **${topCat?.name || 'General'}** consumed **${formatCurrency(topCat?.total || 0)}** (${topCat && expense30d > 0 ? ((topCat.total / expense30d) * 100).toFixed(0) : 0}% of all spending).\n` +
        `• **Secondary Outflow:** **${secondCat?.name || 'None'}** at **${formatCurrency(secondCat?.total || 0)}**.\n` +
        `• **Fixed Bill Drain:** You have **${bills.length} recurring commitments** totaling **${formatCurrency(recurringSum)}/month**.\n\n` +
        `💡 **Suggestion:** Trimming just 15% from ${topCat?.name || 'top category'} saves approximately **${formatCurrency((topCat?.total || 0) * 0.15)}** next month!`;

      addMessage('assistant', reply, [
        { title: 'Top Category', value: topCat ? `${topCat.name} (${formatCurrency(topCat.total)})` : 'None', color: '#f87171' },
        { title: 'Monthly Fixed Commitments', value: formatCurrency(recurringSum), color: '#fbbf24' }
      ]);
      return;
    }

    // 3. Emergency Runway & Financial Security
    if (q.includes('runway') || q.includes('emergency') || q.includes('safety') || q.includes('security')) {
      const { runwayData, safeData } = financialData;
      const months = runwayData?.runwayMonths || 0;
      const status = runwayData?.tier || 'Moderate';

      let verdict = `🛡️ Your current **Emergency Runway** is **${months} months** (Financial Fortress status: **${status}**).\n\n` +
        `• **Liquid Reserves:** ${formatCurrency(runwayData?.liquidCash || safeData?.liquidCash || 0)}\n` +
        `• **Average Monthly Burn Rate:** ${formatCurrency(runwayData?.monthlyBurn || 0)}/mo\n\n`;

      if (months >= 6) {
        verdict += `✅ **Excellent Fortress!** You exceed the gold-standard 6-month buffer. You are well protected against income disruption.`;
      } else if (months >= 3) {
        verdict += `⚠️ **Healthy but growing:** You have 3-5 months covered. Aim to allocate an extra 10% to savings to reach full 6-month fortress independence.`;
      } else {
        verdict += `🚨 **Priority Focus:** Your runway is under 3 months. Prioritize building liquid reserves before taking on discretionary purchases.`;
      }

      addMessage('assistant', verdict, [
        { title: 'Runway Buffer', value: `${months} Months`, color: months >= 6 ? '#4ade80' : months >= 3 ? '#fbbf24' : '#f87171' },
        { title: 'Liquid Cash', value: formatCurrency(runwayData?.liquidCash || 0), color: '#818cf8' },
      ]);
      return;
    }

    // 4. Tax Deductions
    if (q.includes('tax') || q.includes('deduct') || q.includes('write off')) {
      const { taxDeductibleTxs, totalDeductions } = financialData;
      const estimatedSavings = totalDeductions * 0.24; // 24% typical bracket

      const reply = `📑 **Tax Deductions Snapshot (${new Date().getFullYear()} Tax Year):**\n\n` +
        `• **Recorded Deductions:** **${taxDeductibleTxs.length} items** totaling **${formatCurrency(totalDeductions)}**.\n` +
        `• **Estimated Tax Bill Reduction (24% bracket):** ~**${formatCurrency(estimatedSavings)}**.\n\n` +
        (taxDeductibleTxs.length === 0
          ? `💡 *Tip: Tag your business software, medical expenses, home office, or charitable donations as "Tax Deductible" in your transactions or use Automation Rules.*`
          : `You can generate a compliant **Tax Schedule PDF** from the Tax & Capital Gains suite!`);

      addMessage('assistant', reply, [
        { title: 'Total Deductions', value: formatCurrency(totalDeductions), color: '#4ade80' },
        { title: 'Projected Tax Savings', value: `~${formatCurrency(estimatedSavings)}`, color: '#818cf8' },
      ]);
      return;
    }

    // 5. 50/30/20 Rule
    if (q.includes('50/30/20') || q.includes('budget') || q.includes('rule') || q.includes('ratios')) {
      const { income30d, expense30d } = financialData;
      const netSavings = Math.max(0, income30d - expense30d);
      const savingsRate = income30d > 0 ? (netSavings / income30d) * 100 : 0;

      const reply = `🎯 **50/30/20 Rule Allocation Analysis (Past 30 Days):**\n\n` +
        `• **Income Inflow:** ${formatCurrency(income30d)}\n` +
        `• **Total Expenses:** ${formatCurrency(expense30d)}\n` +
        `• **Current Savings Rate:** **${savingsRate.toFixed(1)}%** (Target: 20%)\n\n` +
        (savingsRate >= 20
          ? `🎉 **Superb:** You are saving at least 20% of your income! Maintain this to accelerate your investment compounding.`
          : `💡 **Target Gap:** You are currently saving ${savingsRate.toFixed(1)}%. Trimming 5-10% of discretionary spending will bring you to the 20% milestone.`);

      addMessage('assistant', reply, [
        { title: 'Savings Rate', value: `${savingsRate.toFixed(1)}%`, color: savingsRate >= 20 ? '#4ade80' : '#fbbf24' },
        { title: 'Net Inflow Saved', value: formatCurrency(netSavings), color: '#818cf8' },
      ]);
      return;
    }

    // Fallback: General Financial Summary
    const { safeData, income30d, expense30d, runwayData } = financialData;
    const fallbackText = `Here is your current **Holistic Financial Health Report**:\n\n` +
      `• **Safe-to-Spend Liquidity:** **${formatCurrency(safeData?.safeToSpend || 0)}** available for discretionary use right now.\n` +
      `• **Cash Flow (30d):** ${formatCurrency(income30d)} Income vs ${formatCurrency(expense30d)} Outflow (Net: **${formatCurrency(income30d - expense30d)}**).\n` +
      `• **Fortress Runway:** **${runwayData?.runwayMonths || 0} months** of emergency coverage.\n\n` +
      `What specific financial decision or scenario would you like me to evaluate?`;

    addMessage('assistant', fallbackText, [
      { title: 'Safe-to-Spend', value: formatCurrency(safeData?.safeToSpend || 0), color: '#4ade80' },
      { title: 'Runway', value: `${runwayData?.runwayMonths || 0} mo`, color: '#818cf8' }
    ]);
  };

  const addMessage = (role, text, cards = null) => {
    const newMsg = {
      id: `msg_${Date.now()}_${Math.random()}`,
      role,
      text,
      cards,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setMessages(prev => [...prev, newMsg]);
  };

  const handleSend = (textToSend = null) => {
    const text = (textToSend || input).trim();
    if (!text) return;

    addMessage('user', text);
    setInput('');
    setIsTyping(true);
    haptic();

    setTimeout(() => {
      setIsTyping(false);
      processQuery(text);
      haptic();
    }, 450);
  };

  // Simulate Affordability
  const handleSimulateAfford = (e) => {
    e.preventDefault();
    const amount = parseFloat(affordAmount);
    if (!amount || amount <= 0) return;

    setAffordModal(false);
    const itemName = affordItem.trim() || 'this item';
    const { safeData, runwayData } = financialData;
    const safeCash = safeData?.safeToSpend || 0;
    const remainingSafe = safeCash - amount;
    const monthlyBurn = runwayData?.monthlyBurn || 1;

    const newRunway = ((runwayData?.liquidCash || safeCash) - amount) / Math.max(1, monthlyBurn);

    let verdictIcon = '✅';
    let verdictTitle = 'Safe to Proceed';
    let verdictColor = '#4ade80';
    let explanation = '';

    if (remainingSafe >= 0 && newRunway >= 3) {
      verdictIcon = '✅';
      verdictTitle = 'Safe to Buy!';
      verdictColor = '#4ade80';
      explanation = `You have ample discretionary buffer. After buying **${itemName}** for **${formatCurrency(amount)}**, you will still have **${formatCurrency(remainingSafe)}** in safe-to-spend liquidity and your runway stays at a resilient **${newRunway.toFixed(1)} months**.`;
    } else if (remainingSafe < 0 && (runwayData?.liquidCash || 0) >= amount && newRunway >= 3) {
      verdictIcon = '⚠️';
      verdictTitle = 'Moderate Caution';
      verdictColor = '#fbbf24';
      explanation = `Buying **${itemName}** (${formatCurrency(amount)}) exceeds your current safe-to-spend monthly buffer by **${formatCurrency(Math.abs(remainingSafe))}**. While you have the total cash, this dips into upcoming bill/goal allocations. Your runway drops to **${newRunway.toFixed(1)} months**.`;
    } else {
      verdictIcon = '🛑';
      verdictTitle = 'High Risk - Defer Purchase';
      verdictColor = '#f87171';
      explanation = `This purchase would severely deplete your liquidity. It reduces your emergency runway down to **${Math.max(0, newRunway).toFixed(1)} months**, leaving you vulnerable to unexpected expenses. We advise saving for this over the next 2-3 months.`;
    }

    addMessage('user', `Can I afford to spend ${formatCurrency(amount)} on ${itemName}?`);
    setTimeout(() => {
      addMessage('assistant', `${verdictIcon} **Affordability Verdict: ${verdictTitle}**\n\n${explanation}`, [
        { title: 'Purchase Cost', value: formatCurrency(amount), color: 'var(--text-primary)' },
        { title: 'Safe Cash Remaining', value: formatCurrency(Math.max(0, remainingSafe)), color: verdictColor },
        { title: 'New Runway Buffer', value: `${Math.max(0, newRunway).toFixed(1)} mo`, color: newRunway >= 3 ? '#4ade80' : '#f87171' },
      ]);
    }, 300);

    setAffordAmount('');
    setAffordItem('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🧠 Money Assistant" maxWidth="720px">
      <div style={{ display: 'flex', flexDirection: 'column', height: '620px', maxHeight: '75vh', color: 'var(--text-primary)' }}>

        {/* Top Status Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.03)', borderRadius: 10, marginBottom: '0.75rem', fontSize: '0.78rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#4ade80' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 8px #4ade80' }} />
            <span>Ledger Intelligence Active</span>
          </div>
          <div style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldCheck size={14} color="#818cf8" />
            <span>100% On-Device & Private</span>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', paddingRight: '0.5rem' }}>
          {messages.map(m => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                display: 'flex',
                gap: '0.75rem',
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '88%',
              }}
            >
              {m.role === 'assistant' && (
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #818cf8, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <Sparkles size={18} color="#fff" />
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div
                  style={{
                    background: m.role === 'user' ? 'linear-gradient(135deg, #4ade80, #22c55e)' : 'rgba(37, 37, 64, 0.75)',
                    color: m.role === 'user' ? '#0f172a' : '#f0f0f5',
                    padding: '0.85rem 1.1rem',
                    borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    fontSize: '0.86rem',
                    lineHeight: '1.55',
                    border: m.role === 'user' ? 'none' : '1px solid rgba(255,255,255,0.08)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {m.text}
                </div>

                {/* Key Metric Insight Cards */}
                {m.cards && (
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: 2 }}>
                    {m.cards.map((c, idx) => (
                      <div key={idx} style={{ padding: '0.4rem 0.75rem', background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, fontSize: '0.75rem' }}>
                        <span style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{c.title}:</span>
                        <strong style={{ color: c.color || '#fff' }}>{c.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                <span style={{ fontSize: '0.65rem', color: '#64748b', alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', paddingLeft: 4 }}>
                  {m.timestamp}
                </span>
              </div>

              {m.role === 'user' && (
                <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                  <User size={18} color="#4ade80" />
                </div>
              )}
            </motion.div>
          ))}

          {isTyping && (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #818cf8, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Sparkles size={18} color="#fff" />
              </div>
              <div style={{ background: 'rgba(37, 37, 64, 0.75)', padding: '0.6rem 1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 4 }}>
                <span className="dot-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80' }} />
                <span className="dot-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animationDelay: '0.2s' }} />
                <span className="dot-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animationDelay: '0.4s' }} />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto', padding: '0.6rem 0', scrollbarWidth: 'none' }}>
          {SUGGESTED_QUERIES.map(q => (
            <button
              key={q.text}
              onClick={() => handleSend(q.text)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 0.75rem', borderRadius: 20,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#cbd5e1', fontSize: '0.74rem', whiteSpace: 'nowrap', cursor: 'pointer',
                transition: 'all 0.15s'
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,222,128,0.1)'; e.currentTarget.style.borderColor = 'rgba(74,222,128,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; }}
            >
              <span>{q.icon}</span>
              <span>{q.text}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend(); }}
          style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          <input
            type="text"
            placeholder="Ask about spending, runway, or scenario planning..."
            value={input}
            onChange={e => setInput(e.target.value)}
            style={{
              flex: 1, padding: '0.75rem 1rem', borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#fff', fontSize: '0.85rem'
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            style={{
              width: 44, height: 44, borderRadius: 12, border: 'none',
              background: input.trim() ? 'linear-gradient(135deg, #4ade80, #22c55e)' : 'rgba(255,255,255,0.05)',
              color: input.trim() ? '#0f172a' : '#64748b', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s'
            }}
          >
            <Send size={18} />
          </button>
        </form>

      </div>

      {/* Affordability Calculator Modal */}
      {affordModal && (
        <Modal isOpen={affordModal} onClose={() => setAffordModal(false)} title="🛍️ Affordability Simulator">
          <form onSubmit={handleSimulateAfford} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', color: 'var(--text-primary)' }}>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Test an upcoming purchase to see its precise impact on your safe-to-spend liquidity and emergency runway.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>What are you planning to buy?</label>
              <input
                type="text"
                placeholder="e.g. MacBook Pro, Weekend Trip, New Watch"
                value={affordItem}
                onChange={e => setAffordItem(e.target.value)}
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Estimated Cost ({getCurrencyLabel()})</label>
              <input
                type="number"
                placeholder="0.00"
                value={affordAmount}
                onChange={e => setAffordAmount(e.target.value)}
                required
                style={{ width: '100%', padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '1rem', fontWeight: 600 }}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="button" onClick={() => setAffordModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600 }}>
                Calculate Impact
              </button>
            </div>
          </form>
        </Modal>
      )}
    </Modal>
  );
}
