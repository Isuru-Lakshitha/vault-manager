import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import 'lucide-react';
import { fetchExchangeRates } from '../utils/api';
import { convertCurrency, formatCurrency, getCurrency } from '../utils/format';


const simulatePayoff = (loans, extraPayment, method, toBase = v => v) => {
  let balances = loans.map(l => {
    const principal = parseFloat(l.principal_amount) || 0;
    const accrued = parseFloat(l.current_accrued_interest ?? l.unpaid_interest) || 0;
    const balance = toBase(principal + accrued, l.currency);
    const customMin = toBase(parseFloat(l.monthly_payment) || 0, l.currency);
    return {
      id: l.id,
      name: l.item_name,
      balance,
      monthlyRate: (parseFloat(l.annual_interest_rate) || 0) / 100 / 12,
      minPayment: customMin > 0 ? customMin : Math.max(500, balance * 0.02),
    };
  });

  if (method === 'avalanche') {
    balances.sort((a, b) => b.monthlyRate - a.monthlyRate);
  } else {
    balances.sort((a, b) => a.balance - b.balance);
  }

  let months = 0;
  let totalInterest = 0;
  const MAX_MONTHS = 360;

  while (balances.some(b => b.balance > 0.005) && months < MAX_MONTHS) {
    months++;
    let budgetLeft = extraPayment + balances.reduce((s, b) => s + (b.balance > 0.005 ? b.minPayment : 0), 0);

    balances = balances.map(b => {
      if (b.balance <= 0.005) {
        b.balance = 0;
        return b;
      }
      const interest = b.balance * b.monthlyRate;
      totalInterest += interest;
      const payment = Math.min(b.minPayment, b.balance + interest);
      b.balance = Math.max(0, b.balance + interest - payment);
      budgetLeft -= payment;
      return b;
    });

    // Apply remaining budget (extra + freed minimums) across focus loans in priority order
    while (budgetLeft > 0.005) {
      const target = balances.find(b => b.balance > 0.005);
      if (!target) break;
      const extra = Math.min(budgetLeft, target.balance);
      target.balance = Math.max(0, target.balance - extra);
      budgetLeft -= extra;
    }
  }

  return { months, totalInterest };
};

const DebtPayoffPlanner = ({ loans = [] }) => {
  const [extraPayment, setExtraPayment] = useState(5000);
  const baseCur = getCurrency();
  const [rates, setRates] = useState(null);

  useEffect(() => {
    if ((loans || []).some(l => l.status === 'Active' && (l.currency || baseCur) !== baseCur)) {
      fetchExchangeRates().then(r => { if (r) setRates(r); }).catch(() => {});
    }
  }, [loans, baseCur]);

  const toBase = useCallback((amt, cur) => {
    const val = Number(amt) || 0;
    const c = cur || baseCur;
    if (c === baseCur || !rates) return val;
    const conv = convertCurrency(val, c, baseCur, rates);
    return Number.isFinite(conv) ? conv : val;
  }, [baseCur, rates]);

  const activeLoans = useMemo(
    () => (loans || []).filter(l => l.status === 'Active' && (parseFloat(l.principal_amount) || 0) > 0),
    [loans]
  );

  const avalanche = useMemo(() => simulatePayoff(activeLoans, extraPayment, 'avalanche', toBase), [activeLoans, extraPayment, toBase]);
  const snowball  = useMemo(() => simulatePayoff(activeLoans, extraPayment, 'snowball', toBase),  [activeLoans, extraPayment, toBase]);

  if (activeLoans.length === 0) {
    return (
      <div style={{ padding:'3rem', textAlign:'center', color:'var(--text-muted)', fontSize:'0.8rem' }}>
        NO ACTIVE LOANS TO PLAN
      </div>
    );
  }

  const totalBalance = activeLoans.reduce(
    (s, l) => s + toBase((parseFloat(l.principal_amount) || 0) + (parseFloat(l.current_accrued_interest ?? l.unpaid_interest) || 0), l.currency),
    0
  );
  const winner = avalanche.totalInterest <= snowball.totalInterest ? 'avalanche' : 'snowball';
  const savings = Math.abs(avalanche.totalInterest - snowball.totalInterest);

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
      {/* Extra payment slider */}
      <div className="hud-panel" style={{ padding:'1.5rem' }}>
        <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)', letterSpacing:'0.3px', fontWeight:600, marginBottom:'1rem' }}>EXTRA MONTHLY PAYMENT</div>
        <div style={{ display:'flex', alignItems:'center', gap:'1rem' }}>
          <input type="range" min={0} max={100000} step={1000} value={extraPayment}
            onChange={e => setExtraPayment(+e.target.value)}
            style={{ flex:1, accentColor:'var(--mm-success)' }}/>
          <div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--mm-success)', minWidth:110, textAlign:'right' }}>{formatCurrency(extraPayment)}</div>
        </div>
        <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginTop:'0.5rem' }}>
          Total Debt: {formatCurrency(totalBalance)} · {activeLoans.length} active loan{activeLoans.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Comparison cards */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
        {[
          { label:'AVALANCHE', sub:'Highest interest first', method:'avalanche', res:avalanche, color:'#f87171', icon:'🔥' },
          { label:'SNOWBALL', sub:'Smallest balance first', method:'snowball', res:snowball, color:'#3b82f6', icon:'⛄' },
        ].map(({ label, sub, method, res, color, icon }) => (
          <motion.div key={method} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
            style={{ padding:'1.5rem', background:`${color}08`, border:`1px solid ${color}${winner===method?'60':'20'}`, borderRadius:14,
              boxShadow: winner === method ? `0 0 20px ${color}20` : 'none', position:'relative' }}>
            {winner === method && (
              <div style={{ position:'absolute', top:12, right:12, background:color, color:'#fff', fontSize:'0.65rem', padding:'0.2rem 0.5rem', borderRadius:5, letterSpacing:'1px' }}>BEST</div>
            )}
            <div style={{ fontSize:'1.5rem', marginBottom:'0.5rem' }}>{icon}</div>
            <div style={{ fontWeight:700, fontSize:'0.9rem', color, marginBottom:'0.25rem' }}>{label}</div>
            <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:'1.25rem' }}>{sub}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
              <div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>PAYOFF TIME</div>
                <div style={{ fontWeight:700, fontSize:'1.3rem', color }}>
                  {res.months >= 360 ? '30+ years' : res.months < 12 ? `${res.months} mo` : `${Math.floor(res.months/12)}y ${res.months%12}m`}
                </div>
              </div>
              <div>
                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>TOTAL INTEREST</div>
                <div style={{ fontWeight:700, fontSize:'1.1rem', color }}>{formatCurrency(res.totalInterest)}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Winner insight */}
      <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.3 }}
        style={{ padding:'1rem 1.25rem', background:'rgba(16,185,129,0.08)', border:'1px solid rgba(16,185,129,0.2)', borderRadius:10, fontSize:'0.8rem', color:'var(--mm-success)' }}>
        💡 The <strong style={{ textTransform:'uppercase' }}>{winner}</strong> method saves you {formatCurrency(savings)} in interest.
        {extraPayment > 0 && ` Adding ${formatCurrency(extraPayment)}/month extra accelerates your debt freedom.`}
      </motion.div>
    </div>
  );
};

export default DebtPayoffPlanner;