import React, { useState, useEffect, useMemo, useCallback } from 'react';
import 'framer-motion';
import { FileText, Download, Percent, Calendar, Search } from 'lucide-react';
import Modal from './Modal';
import { fetchTransactions, fetchInvestments, fetchExchangeRates } from '../utils/api';
import { toYMD } from '../utils/dates';
import { convertCurrency, formatCurrency, getCurrency, haptic } from '../utils/format';
import toast from 'react-hot-toast';

const TAX_BRACKETS = [10, 12, 15, 22, 24, 32, 35, 37];

export default function TaxCapitalGainsModal({ isOpen, onClose }) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [taxBracket, setTaxBracket] = useState(24);
  const [transactions, setTransactions] = useState([]);
  const [investments, setInvestments] = useState([]);
  const [rates, setRates] = useState(null);
  const baseCur = getCurrency();
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [exportingPDF, setExportingPDF] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      Promise.all([
        fetchTransactions(),
        fetchInvestments(),
        fetchExchangeRates().catch(() => null),
      ]).then(([txs, invs, fx]) => {
        setTransactions(txs || []);
        setInvestments(invs || []);
        if (fx) setRates(fx);
        setLoading(false);
      }).catch(() => setLoading(false));
    }
  }, [isOpen, baseCur]);

  const toBase = useCallback((amt, cur) => {
    const val = Number(amt) || 0;
    const c = cur || baseCur;
    if (c === baseCur || !rates) return val;
    const conv = convertCurrency(val, c, baseCur, rates);
    return Number.isFinite(conv) ? conv : val;
  }, [baseCur, rates]);

  // Filter active non-reversed deductible transactions for selected year
  const deductibleTxs = useMemo(() => {
    const yearPrefix = `${selectedYear}-`;
    return transactions.filter(t => {
      if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return false;
      const isYear = String(t.date || '').startsWith(yearPrefix);
      const isDeductible = t.is_tax_deductible || t.tax_deductible || (Array.isArray(t.tags) && t.tags.includes('#tax-deductible'));
      return isYear && isDeductible;
    });
  }, [transactions, selectedYear]);

  // Search filtered deductible list
  const filteredTxs = useMemo(() => {
    if (!searchQuery) return deductibleTxs;
    const q = searchQuery.toLowerCase();
    return deductibleTxs.filter(t =>
      (t.notes && t.notes.toLowerCase().includes(q)) ||
      (t.category && t.category.toLowerCase().includes(q)) ||
      (t.tax_category && t.tax_category.toLowerCase().includes(q))
    );
  }, [deductibleTxs, searchQuery]);

  // Group by tax category
  const categoryBreakdown = useMemo(() => {
    const map = {};
    deductibleTxs.forEach(t => {
      const cat = t.tax_category || 'Business';
      map[cat] = (map[cat] || 0) + toBase(parseFloat(t.amount) || 0, t.currency);
    });
    return Object.entries(map).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  }, [deductibleTxs, toBase]);

  const totalDeductions = useMemo(() => {
    return deductibleTxs.reduce((sum, t) => sum + toBase(parseFloat(t.amount) || 0, t.currency), 0);
  }, [deductibleTxs, toBase]);

  const estimatedTaxSavings = totalDeductions * (taxBracket / 100);

  // Capital Gains calculations from investments
  const capitalGainsData = useMemo(() => {
    let shortTermGains = 0;
    let longTermGains = 0;
    let unrealizedLosses = 0;
    let netGains = 0;

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoYMD = toYMD(oneYearAgo);

    investments.forEach(inv => {
      const buyPrice = parseFloat(inv.buy_price) || 0;
      const currentPrice = parseFloat(inv.current_price) || buyPrice;
      const quantity = parseFloat(inv.quantity) || 0;
      const diff = toBase((currentPrice - buyPrice) * quantity, inv.currency);

      const isLongTerm = inv.purchase_date ? String(inv.purchase_date).slice(0, 10) <= oneYearAgoYMD : false;

      if (diff > 0) {
        if (isLongTerm) longTermGains += diff;
        else shortTermGains += diff;
      } else if (diff < 0) {
        unrealizedLosses += Math.abs(diff);
      }
      netGains += diff;
    });

    return { shortTermGains, longTermGains, unrealizedLosses, netGains };
  }, [investments, toBase]);

  const handleDownloadPDF = async () => {
    setExportingPDF(true);
    try {
      const { generateTaxSchedulePDF } = await import('../utils/pdfReport');
      await generateTaxSchedulePDF({
        taxYear: selectedYear,
        transactions: deductibleTxs,
        taxBracket,
        capitalGains: capitalGainsData,
      });
      toast.success('Tax Schedule PDF generated!');
      haptic();
    } catch {
  toast.error('Failed to generate PDF');
} finally {
      setExportingPDF(false);
    }
  };

  const handleDownloadCSV = async () => {
    const { exportTaxDeductionsCSV } = await import('../utils/pdfReport');
    exportTaxDeductionsCSV({
      taxYear: selectedYear,
      transactions: deductibleTxs,
    });
    toast.success('Tax CSV downloaded for your accountant!');
    haptic();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="📑 Tax Optimization & Capital Gains Suite" maxWidth="860px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>

        {/* Top Control Bar: Tax Year & Tax Bracket */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.75rem 1rem', borderRadius: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Year Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Calendar size={15} color="#818cf8" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tax Year:</span>
              <select
                value={selectedYear}
                onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                style={{ padding: '0.35rem 0.65rem', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {[currentYear, currentYear - 1, currentYear - 2].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Tax Bracket Selector */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Percent size={15} color="#4ade80" />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Tax Bracket:</span>
              <select
                value={taxBracket}
                onChange={e => setTaxBracket(parseInt(e.target.value, 10))}
                style={{ padding: '0.35rem 0.65rem', borderRadius: 8, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#4ade80', fontSize: '0.85rem', fontWeight: 600 }}
              >
                {TAX_BRACKETS.map(b => (
                  <option key={b} value={b}>{b}% Bracket</option>
                ))}
              </select>
            </div>
          </div>

          {/* Export Actions */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleDownloadCSV}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={exportingPDF}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.4rem 1rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}
            >
              <FileText size={14} /> {exportingPDF ? 'Generating...' : 'Tax Schedule PDF'}
            </button>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
          <div style={{ background: 'rgba(37,37,64,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Total Deductions</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>{formatCurrency(totalDeductions)}</div>
            <div style={{ fontSize: '0.72rem', color: '#4ade80', marginTop: 2 }}>{deductibleTxs.length} items claimable</div>
          </div>

          <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.25)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#4ade80', letterSpacing: '0.5px' }}>Estimated Tax Savings</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#4ade80', marginTop: 4 }}>~{formatCurrency(estimatedTaxSavings)}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>At {taxBracket}% tax bracket</div>
          </div>

          <div style={{ background: 'rgba(37,37,64,0.7)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>Net Capital Gains</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: capitalGainsData.netGains >= 0 ? '#4ade80' : '#f87171', marginTop: 4 }}>
              {capitalGainsData.netGains >= 0 ? '+' : ''}{formatCurrency(capitalGainsData.netGains)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>
              LT: {formatCurrency(capitalGainsData.longTermGains)} · ST: {formatCurrency(capitalGainsData.shortTermGains)}
            </div>
          </div>

          <div style={{ background: 'rgba(129,140,248,0.08)', border: '1px solid rgba(129,140,248,0.25)', borderRadius: 12, padding: '1rem' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#818cf8', letterSpacing: '0.5px' }}>Loss Harvesting Opportunity</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#818cf8', marginTop: 4 }}>
              {formatCurrency(capitalGainsData.unrealizedLosses)}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 2 }}>Can offset taxable capital gains</div>
          </div>
        </div>

        {/* Categories Progress Breakdown */}
        {categoryBreakdown.length > 0 && (
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Deduction Allocation by Category
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {categoryBreakdown.map(c => {
                const pct = totalDeductions > 0 ? (c.amount / totalDeductions) * 100 : 0;
                return (
                  <div key={c.name} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 500 }}>{c.name}</span>
                      <strong style={{ color: '#4ade80' }}>{formatCurrency(c.amount)} ({pct.toFixed(0)}%)</strong>
                    </div>
                    <div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #4ade80, #818cf8)', borderRadius: 3 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Itemized Deductible Transactions Ledger */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Itemized Claims ({filteredTxs.length})
            </span>
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#64748b' }} />
              <input
                type="text"
                placeholder="Filter deductions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem 0.4rem 30px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.78rem' }}
              />
            </div>
          </div>

          <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', paddingRight: '0.25rem' }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>Loading tax deductions...</div>
            ) : filteredTxs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                No tax deductible expenses recorded for {selectedYear}. Tag your business, health, or charity transactions to see them here!
              </div>
            ) : (
              filteredTxs.map(t => (
                <div
                  key={t.id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.55rem 0.85rem', background: 'rgba(37,37,64,0.5)',
                    border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, fontSize: '0.8rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', width: 75 }}>{t.date}</span>
                    <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.notes || t.category || 'Deductible Transaction'}
                    </span>
                    <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontWeight: 600 }}>
                      {t.tax_category || 'Business'}
                    </span>
                  </div>
                  <strong style={{ color: '#4ade80', fontSize: '0.88rem', marginLeft: '0.75rem' }}>
                    {formatCurrency(t.amount)}
                  </strong>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </Modal>
  );
}
