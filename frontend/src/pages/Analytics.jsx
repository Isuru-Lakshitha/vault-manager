import { useT } from '../i18n';
import { PageHeader, Segmented } from '../components/ui';
import ToolMenu from '../components/ToolMenu';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useLiveData from '../utils/useLiveData';
import { fetchAnalytics, fetchBills, fetchRecurringTransactions, fetchBudgets, fetchAccounts, fetchLoans, fetchCreditCards, fetchInvestments, getCache, fetchExchangeRates } from '../utils/api';
import PageWrapper from '../components/PageWrapper';
import SkeletonLoader from '../components/SkeletonLoader';
import AnimatedCounter from '../components/AnimatedCounter';
import getCategoryEmoji from '../utils/categoryEmoji';
import SpendingHeatmap from '../components/SpendingHeatmap';
import {
  Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, Download, Lightbulb, Flame, DollarSign, FileText, Zap, Tag, CalendarDays, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, getCurrency, convertCurrency } from '../utils/format';
import MonthlyStoryModal from '../components/MonthlyStoryModal';
import { toYMD, todayYMD, addMonthsClamped } from '../utils/dates';
import OverviewTab from './analytics/OverviewTab';
import WeekdayTab from './analytics/WeekdayTab';
import CategoriesTab from './analytics/CategoriesTab';
import TrendsTab from './analytics/TrendsTab';
import CashflowTab from './analytics/CashflowTab';
import { isInternalMove } from '../utils/ledgerReporting.js';
import { saveFile, saveWorkbook } from '../utils/saveFile';

const COLORS = ['#4ade80','#818cf8','#a78bfa','#f472b6','#fb923c','#fbbf24','#38bdf8','#14b8a6','#e879f9','#f87171'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--hud-bg, rgba(6,8,20,0.95))', border:'1px solid rgba(74,222,128,0.3)', boxShadow:'0 0 20px rgba(74,222,128,0.15)', padding:'0.875rem 1.1rem', borderRadius:'10px', fontSize:'0.8rem' }}>
      {label && <p style={{ margin:'0 0 0.5rem', color:'var(--mm-success)', fontWeight:700 }}>{label}</p>}
      {payload.map((e,i) => (
        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap:'1.5rem', margin:'0.2rem 0' }}>
          <span style={{ color: e.color||e.fill||'var(--mm-text-2)' }}>{e.name}:</span>
          <span style={{ color:'#fff', fontWeight:600 }}>{formatCurrency(e.value)}</span>
        </div>
      ))}
    </div>
  );
};

const KpiCard = ({ label, value, sub, color, icon: Icon }) => (
  <div className="bento-item col-span-3"
    style={{ flexDirection:'column', gap:'0.5rem', border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', background:'var(--bg-surface)' }}
  >
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ fontSize:'0.68rem', letterSpacing:'0.04em', fontWeight:600, color:'var(--text-secondary)' }}>{label}</span>
      <Icon size={17} style={{ color }} />
    </div>
    <div style={{ fontWeight:700, fontSize:'1.5rem', color }}>
      <AnimatedCounter value={value} formatter={formatCurrency} />
    </div>
    {sub && <div style={{ fontSize:'0.75rem', color:'var(--text-secondary)' }}>{sub}</div>}
  </div>
);

const RecommendCard = ({ rec }) => {
  const colors = { warning:'#fbbf24', danger:'#f87171', success:'#4ade80', info:'#06b6d4' };
  const c = colors[rec.type]||'#06b6d4';
  return (
    <div
      style={{ display:'flex', gap:'1rem', alignItems:'flex-start', padding:'1.1rem 1.25rem', background:'var(--bg-surface)', border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', borderLeft:`3px solid ${c}`, borderRadius:'10px' }}
    >
      <span style={{ fontSize:'1.4rem', lineHeight:1, flexShrink:0, marginTop:2 }}>{rec.icon}</span>
      <div>
        <div style={{ fontWeight:700, fontSize:'0.82rem', color:c, marginBottom:'0.3rem', letterSpacing:'0.5px' }}>{rec.title.toUpperCase()}</div>
        <div style={{ fontSize:'0.875rem', color:'#c0c8dc', lineHeight:1.6 }}>{rec.body}</div>
      </div>
    </div>
  );
};

// Build 3-month rolling average forecast
const buildForecast = (momComparison) => {
  if (!momComparison || momComparison.length < 2) return null;
  const last3 = momComparison.slice(-3);
  const avgIncome  = last3.reduce((s, m) => s + m.income, 0) / last3.length;
  const avgExpense = last3.reduce((s, m) => s + m.expense, 0) / last3.length;
  const projected  = avgIncome - avgExpense;
  const nextDate   = addMonthsClamped(new Date(), 1);
  const nextMonth  = toYMD(nextDate).substring(0, 7);
  return { nextMonth, avgIncome, avgExpense, projected };
};

const parseLocalYMD = (str) => {
  if (!str) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const cachedFxRates = () => { try { return JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch { return null; } };

const toBaseAmt = (amt, cur, baseCurrency, rates) => {
  const v = Number(amt) || 0;
  if (!baseCurrency || !cur || cur === baseCurrency || !rates) return v;
  const cv = convertCurrency(v, cur, baseCurrency, rates);
  return Number.isFinite(cv) ? cv : v;
};

// ─── Build 60-day daily cash flow forecast ───────────────────────────────────
const buildDailyForecast = (startBalance, bills, recurringTxs, loans = [], baseCurrency = null, rates = null) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const curMo = toYMD(today).substring(0, 7);
  const todayDom = today.getDate();
  const points = [];
  let balance = startBalance;

  const activeRecurring = (recurringTxs || []).filter(r => r && !r.paused);
  const linkedLoanIds = new Set(activeRecurring.map(r => r.loan_id ? String(r.loan_id) : null).filter(Boolean));
  const unlinkedActiveLoans = (loans || []).filter(l => (l.status || 'Active') === 'Active' && !linkedLoanIds.has(String(l.id)));

  const getRuleDom = (r, isCurMonth, lastDayOfMo) => {
    let targetDom = parseInt(r.day_of_month, 10) || 0;
    if (!targetDom || r.schedule_mode === 'flexible') {
      const win = (r.flexible_window || '').toLowerCase();
      if (win.includes('early')) targetDom = 5;
      else if (win.includes('end')) targetDom = Math.min(25, lastDayOfMo);
      else targetDom = 15;
    }
    targetDom = Math.min(targetDom, lastDayOfMo);
    if (isCurMonth && targetDom < todayDom) {
      return lastDayOfMo;
    }
    return targetDom;
  };

  for (let i = 0; i < 60; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const dateStr = toYMD(day);
    const monthKey = dateStr.substring(0, 7);
    const isCurMonth = monthKey === curMo;
    const dom = day.getDate();
    const lastDayOfMo = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();

    // Apply recurring transactions due on this day-of-month (skipping months already marked paid)
    activeRecurring.forEach(r => {
      if (r.last_applied_month === monthKey || r.type === 'Transfer') return;
      const ruleDom = getRuleDom(r, isCurMonth, lastDayOfMo);
      if (ruleDom === dom) {
        const amt = toBaseAmt(parseFloat(r.avg_amount || r.amount) || 0, r.currency, baseCurrency, rates);
        if (r.type === 'Income') balance += amt;
        else balance -= amt;
      }
    });

    // Apply unlinked active Gold Loans (monthly interest or target payment)
    unlinkedActiveLoans.forEach(l => {
      if (l.last_paid_month === monthKey) return;
      const loanDom = isCurMonth && 25 < todayDom ? lastDayOfMo : Math.min(25, lastDayOfMo);
      if (loanDom === dom) {
        const p = toBaseAmt(parseFloat(l.principal_amount) || 0, l.currency, baseCurrency, rates);
        const apr = parseFloat(l.annual_interest_rate) || 0;
        const moInt = (p * (apr / 100)) / 12;
        const target = Math.max(moInt, toBaseAmt(parseFloat(l.monthly_payment || l.emi || 0) || 0, l.currency, baseCurrency, rates));
        balance -= target;
      }
    });

    // Apply bills due on this calendar date
    (bills || []).forEach(b => {
      if (b.due_date === dateStr && !b.paid && b.status !== 'Paid') {
        balance -= toBaseAmt(parseFloat(b.amount) || 0, b.currency, baseCurrency, rates);
      }
    });

    points.push({ date: dateStr, balance: parseFloat(balance.toFixed(2)), negative: balance < 0 });
  }
  return points;
};

// ─── Build tag spending data from allTransactions ─────────────────────────────
const buildTagData = (transactions) => {
  const tagMap = {};
  (transactions || []).forEach(tx => {
    if (!tx || tx.reversed_at || tx.reversal_of || tx.is_transfer_fee) return;
    if (tx.type !== 'Expense' && tx.type !== 'Loan Payment') return;
    const tags = Array.isArray(tx.tags) ? tx.tags : [];
    tags.forEach(tag => {
      if (!tag) return;
      tagMap[tag] = (tagMap[tag] || 0) + (Number(tx.amount) || 0);
    });
  });
  return Object.entries(tagMap)
    .map(([tag, total]) => ({ tag, total: parseFloat(total.toFixed(2)) }))
    .sort((a, b) => b.total - a.total);
};

const Analytics = () => {
  const t = useT();
  const navigate = useNavigate();
  const [data, setData] = useState(() => getCache('analytics') || null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(() => !getCache('analytics'));
  const [activeTab, setActiveTab] = useState('overview');
  const [showAllTabs, setShowAllTabs] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dailyForecast, setDailyForecast] = useState(() => {
    const cachedAnalytics = getCache('analytics');
    const cachedBills = getCache('bills');
    const cachedRecurring = getCache('recurring');
    if (cachedAnalytics && cachedBills && cachedRecurring) {
      const baseCur = getCurrency();
      let cachedRates = null;
      try { cachedRates = JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch {}
      const startBalance = (cachedAnalytics.accounts || [])
        .filter(a => !['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(a.type))
        .reduce((s, a) => s + toBaseAmt(a.balance || 0, a.currency || baseCur, baseCur, cachedRates), 0);
      return buildDailyForecast(startBalance, cachedBills, cachedRecurring, cachedAnalytics.loans || [], baseCur, cachedRates);
    }
    return [];
  });
  const [tagData, setTagData] = useState(() => buildTagData(getCache('analytics')?.allTransactions || []));
  const [forecastLoading, setForecastLoading] = useState(false);
  const [drillCat, setDrillCat] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(() => todayYMD().substring(0, 7));
  const [budgets, setBudgets] = useState(() => getCache('budgets') || []);
  const [showStoryModal, setShowStoryModal] = useState(false);

  useEffect(() => { loadData(!!getCache('analytics')); }, []);
  useLiveData(() => loadData(true));

  const loadData = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      setLoadError('');
      const res = await fetchAnalytics();
      setData(res);
      // Set default month to current month
      const current = todayYMD().substring(0, 7);
      setSelectedMonth(current);
      // Load supplementary data for new features (non-blocking)
      loadForecastData(res);
      // Build tag data immediately from transactions
      setTagData(buildTagData(res.allTransactions || []));
    } catch(err) { setLoadError(err.message || 'Could not load analytics'); setData(null); }
    finally { setLoading(false); }
  };

  const loadForecastData = async (analyticsData) => {
    try {
      setForecastLoading(true);
      const baseCur = getCurrency();
      const fxRates = await fetchExchangeRates().catch(() => {
        try { return JSON.parse(localStorage.getItem('vm_fx_rates') || 'null'); } catch { return null; }
      });
      const startBalance = (analyticsData.accounts || [])
        .filter(a => !['Credit Card', 'Loan', 'Mortgage', 'Liability'].includes(a.type))
        .reduce((s, a) => s + toBaseAmt(a.balance || 0, a.currency || baseCur, baseCur, fxRates), 0);
      const [bills, recurring, bud] = await Promise.allSettled([
        fetchBills(),
        fetchRecurringTransactions(),
        fetchBudgets(),
      ]);
      const billsData     = bills.status     === 'fulfilled' ? bills.value     : [];
      const recurringData = recurring.status === 'fulfilled' ? recurring.value : [];
      const budgetsData   = bud.status       === 'fulfilled' ? bud.value       : [];
      setDailyForecast(buildDailyForecast(startBalance, billsData, recurringData, analyticsData.loans || [], baseCur, fxRates));
      setBudgets(budgetsData);
    } catch(err) { console.error('Forecast load error:', err); }
    finally { setForecastLoading(false); }
  };

  const handleExcelExport = async () => {
    if (!data) return;
    const XLSX = await import('xlsx');
    const txRows = (data.allTransactions||[]).map(tx => ({ Date:tx.date, Type:tx.type, Category:tx.category||'', Amount:tx.amount, Fee:tx.fee_amount||0, Notes:tx.notes||'' }));
    const monthRows = (data.momComparison||[]).map(m => ({ Month:m.month, Income:m.income, Expense:m.expense, Net:m.net, 'ExpenseDelta%':m.expenseDelta, 'IncomeDelta%':m.incomeDelta }));
    const catRows = (data.categoryData||[]).map(c => ({ Category:c.category, 'Total Spent':c.total, 'Pct of Expenses':c.pct }));
    const loanRows = (data.loans||[]).map(l => ({ Name:l.item_name, Type:l.type, Status:l.status, Principal:l.principal_amount, 'Rate%':l.annual_interest_rate, 'Interest Paid':l.total_interest_paid||0 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthRows), 'Monthly Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(catRows), 'Categories');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loanRows), 'Loans');
    try {
      await saveWorkbook(XLSX, wb, `VaultManager_Report_${todayYMD()}.xlsx`);
      toast.success('Excel exported!');
    } catch (err) { toast.error(err?.message || 'Export failed'); }
  };

  const handlePDFExport = async () => {
    if (!data) return;
    try {
      setPdfLoading(true);
      const { generatePDFReport } = await import('../utils/pdfReport');
      await generatePDFReport(data);
      toast.success('PDF report downloaded!');
    } catch(err) { console.error(err); toast.error('PDF generation failed'); }
    finally { setPdfLoading(false); }
  };

  const [statementLoading, setStatementLoading] = useState(false);
  const [taxRate, setTaxRate] = useState(15);

  const handleStatementExport = async () => {
    if (!data) return;
    try {
      setStatementLoading(true);
      const { generateMonthlyStatement } = await import('../utils/pdfReport');
      const accs = await fetchAccounts();
      const currentMonth = selectedMonth || todayYMD().slice(0, 7);
      await generateMonthlyStatement({
        month: currentMonth,
        userEmail: localStorage.getItem('vm_user_email') || 'Personal Portfolio',
        accounts: accs || [],
        transactions: data.allTransactions || [],
        budgets: budgets || [],
        rates: await fetchExchangeRates().catch(cachedFxRates),
      });
      toast.success('Monthly statement downloaded!');
    } catch(err) { console.error(err); toast.error('Statement generation failed'); }
    finally { setStatementLoading(false); }
  };

  const [dossierLoading, setDossierLoading] = useState(false);

  const handleExecutiveDossier = async () => {
    if (!data) return;
    try {
      setDossierLoading(true);
      const { generateExecutiveFinancialDossierPDF } = await import('../utils/pdfReport');
      const [accs, lns, cards, invs] = await Promise.all([fetchAccounts(), fetchLoans(), fetchCreditCards(), fetchInvestments()]);
      await generateExecutiveFinancialDossierPDF({
        analytics: data,
        accounts: accs || [],
        loans: lns || [],
        creditCards: cards || [],
        investments: invs || [],
        rates: await fetchExchangeRates().catch(cachedFxRates),
        transactions: data.allTransactions || [],
        periodLabel: selectedMonth ? `Month of ${selectedMonth}` : 'Annual Fiscal Review',
        userName: localStorage.getItem('vm_user_name') || 'Executive Account Holder'
      });
      toast.success('Executive Financial Dossier PDF downloaded!');
    } catch(err) {
      console.error(err);
      toast.error('Executive Dossier generation failed');
    } finally {
      setDossierLoading(false);
    }
  };

  const TAB_GROUPS = [
    {
      id: 'overview_group',
      label: 'Overview & Flow',
      tabs: [
        { id: 'overview',  label: 'OVERVIEW' },
        { id: 'cashflow',  label: 'CASH FLOW' },
        { id: 'recommend', label: 'INSIGHTS' },
      ],
    },
    {
      id: 'spending_group',
      label: 'Spending Breakdown',
      tabs: [
        { id: 'categories', label: 'CATEGORIES' },
        { id: 'top10',      label: 'TOP SPENDS' },
        { id: 'tags',       label: 'TAGS' },
      ],
    },
    {
      id: 'trends_group',
      label: 'Trends & Activity',
      tabs: [
        { id: 'trends',  label: 'TRENDS' },
        { id: 'yoy',     label: 'YEAR vs YEAR' },
        { id: 'heatmap', label: 'HEATMAP' },
        { id: 'weekday', label: 'WEEKDAY' },
      ],
    },
    {
      id: 'planning_group',
      label: 'Forecast & Tax',
      tabs: [
        { id: 'forecast', label: 'FORECAST' },
        { id: 'tax',      label: '🧾 TAX & AUDIT' },
      ],
    },
  ];

  const TABS = TAB_GROUPS.flatMap(g => g.tabs);
  const activeGroup = TAB_GROUPS.find(g => g.tabs.some(t => t.id === activeTab)) || TAB_GROUPS[0];
  const visibleTabs = showAllTabs ? TABS : activeGroup.tabs;

  const forecast = data ? buildForecast(data.momComparison) : null;

  // Month picker — derive available months from all transactions
  const availableMonths = data ? [...new Set((data.allTransactions || []).map(tx => tx.date?.substring(0,7)).filter(Boolean))].sort().reverse() : [];

  // Derive month-filtered stats and category data for overview tab
  const filteredTxns = data && selectedMonth
    ? (data.allTransactions || []).filter(tx => tx.date?.startsWith(selectedMonth))
    : (data?.allTransactions || []);

  const monthCatData = (() => {
    const map = {};
    filteredTxns.filter(tx => !isInternalMove(tx) && (tx.type === 'Expense' || tx.type === 'Loan Payment')).forEach(tx => {
      const validSplits = tx.isSplit !== false && Array.isArray(tx.splits)
        ? tx.splits.filter(sp => (Number(sp?.amount) || 0) > 0)
        : [];
      if (validSplits.length > 0) {
        validSplits.forEach(sp => {
          const cat = sp.category || tx.category || 'Uncategorized';
          map[cat] = (map[cat] || 0) + (Number(sp.amount) || 0);
        });
      } else {
        const cat = tx.category || 'Uncategorized';
        map[cat] = (map[cat] || 0) + (Number(tx.amount) || 0);
      }
    });
    return Object.entries(map).map(([category, total]) => ({ category, total: parseFloat(total.toFixed(2)) })).sort((a,b) => b.total - a.total);
  })();

  const monthIncome  = filteredTxns.filter(tx => !isInternalMove(tx) && tx.type === 'Income').reduce((s,tx) => s + tx.amount, 0);
  const monthExpense = filteredTxns.filter(tx => !isInternalMove(tx) && (tx.type === 'Expense' || tx.type === 'Loan Payment')).reduce((s,tx) => s + tx.amount, 0);
  const monthSavings = monthIncome - monthExpense;
  const monthSavingsRate = monthIncome > 0 ? Math.round((monthSavings / monthIncome) * 100) : 0;

  return (
    <PageWrapper>
      <div>
        {loadError && <div role="alert" className="glass-panel" style={{ padding: 16, marginBottom: 16 }}>{loadError} <button className="btn btn-secondary" onClick={() => loadData()}>Retry</button></div>}
        {data?.currencyEstimate && <p role="status">Amounts converted to {data.reportingCurrency} using Frankfurter reference rates dated {data.exchangeRateDate}. Historical totals are estimates at these rates.</p>}
        <PageHeader title={t('nav.analytics')} subtitle="Financial overview & insights">
          <div className="filter-scroll-row" style={{ gap:'0.75rem' }}>
            {/* Month Picker */}
            {availableMonths.length > 0 && (
              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'0.5rem 0.875rem' }}>
                <CalendarDays size={14} style={{ color:'var(--text-muted)' }} />
                <select value={selectedMonth} onChange={e => { setSelectedMonth(e.target.value); setDrillCat(null); }}
                  style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.82rem', color:'var(--text-primary)', cursor:'pointer', minWidth:110 }}>
                  {availableMonths.map(m => (
                    <option key={m} value={m} style={{ background:'var(--bg-deep)' }}>
                      {new Date(m + '-01').toLocaleDateString('en-US', { month:'long', year:'numeric' })}
                    </option>
                  ))}
                  <option value="" style={{ background:'var(--bg-deep)' }}>All Time</option>
                </select>
              </div>
            )}
            <ToolMenu label="Reports & tools">
              <div className="menu-label">Export</div>
              <button className="btn" onClick={handlePDFExport} disabled={!data || pdfLoading}>
                <FileText size={16} /> {pdfLoading ? 'Generating…' : 'PDF report'}
              </button>
              <button className="btn" onClick={handleStatementExport} disabled={!data || statementLoading} title="Download official monthly statement">
                <FileText size={16} /> {statementLoading ? 'Generating…' : 'Monthly statement (PDF)'}
              </button>
              <button className="btn" onClick={handleExecutiveDossier} disabled={!data || dossierLoading} title="Executive financial statement (P&L)">
                <FileText size={16} /> {dossierLoading ? 'Generating…' : 'Executive dossier'}
              </button>
              <button className="btn" onClick={handleExcelExport} disabled={!data}>
                <Download size={16} /> Excel workbook
              </button>
              <div className="menu-sep" />
              <div className="menu-label">Planning</div>
              <button className="btn" onClick={() => setShowStoryModal(true)} disabled={!data}>
                <Sparkles size={16} /> Money Wrapped
              </button>
              <button className="btn" onClick={() => window.dispatchEvent(new Event('vm:open-fire-planner'))} title="Retirement & FIRE simulator">
                <TrendingUp size={16} /> FIRE planner
              </button>
              <button className="btn" onClick={() => window.dispatchEvent(new Event('vm:open-tax-suite'))} title="Tax optimisation & capital gains">
                <FileText size={16} /> Tax suite
              </button>
            </ToolMenu>
          </div>
        </PageHeader>

        {loading ? (
          <SkeletonLoader rows={6} height={120} />
        ) : data ? (
          <>
            <div className="bento-grid" style={{ marginBottom:'2rem' }}>
              <KpiCard index={0} label="INCOME" value={monthIncome} color="#4ade80" icon={TrendingUp}
                sub={selectedMonth ? new Date(selectedMonth+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'}) : 'All time'} />
              <KpiCard index={1} label="EXPENSES" value={monthExpense} color="#f87171" icon={TrendingDown}
                sub={`${monthCatData.length} categories`} />
              <KpiCard index={2} label="NET SAVINGS" value={monthSavings} color={monthSavings>=0?'#4ade80':'#f87171'} icon={DollarSign}
                sub={`Rate: ${monthSavingsRate}%`} />
              <KpiCard index={3} label="AVG MONTHLY SPEND" value={data.avgMonthlySpend} color="#8b5cf6" icon={Activity}
                sub="Last 6 months" />
            </div>

            {/* Grouped Analytics Navigation */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
              <Segmented
                label="Analytics sections"
                value={showAllTabs ? 'all' : activeGroup.id}
                onChange={(v) => {
                  if (v === 'all') { setShowAllTabs(true); return; }
                  setShowAllTabs(false);
                  const group = TAB_GROUPS.find(g => g.id === v);
                  if (group && !group.tabs.some(t => t.id === activeTab)) setActiveTab(group.tabs[0].id);
                }}
                options={[
                  ...TAB_GROUPS.map(g => ({ value: g.id, label: g.label })),
                  { value: 'all', label: 'All views', count: TAB_GROUPS.reduce((n, g) => n + g.tabs.length, 0) },
                ]}
              />

              <div className="filter-scroll-row" style={{ gap: '0.4rem' }}>
                {visibleTabs.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                    padding:'0.45rem 0.95rem', fontSize:'0.72rem', letterSpacing:'0.04em', fontWeight: activeTab===tab.id ? 600 : 500,
                    border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', borderRadius:'8px', cursor:'pointer',
                    background: activeTab===tab.id ? 'var(--bg-surface-hover)' : 'transparent',
                    color: activeTab===tab.id ? 'var(--accent-primary, #4ade80)' : 'var(--text-secondary)',
                    borderBottom: activeTab===tab.id ? '2px solid var(--accent-primary, #4ade80)' : '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                  }}>{tab.label}</button>
                ))}
              </div>
            </div>

            <div>
              {activeTab==='overview' && <OverviewTab COLORS={COLORS} CustomTooltip={CustomTooltip} data={data} monthCatData={monthCatData} monthExpense={monthExpense} monthIncome={monthIncome} monthSavings={monthSavings} setActiveTab={setActiveTab} setDrillCat={setDrillCat} />}

              {activeTab==='categories' && <CategoriesTab COLORS={COLORS} CustomTooltip={CustomTooltip} budgets={budgets} data={data} drillCat={drillCat} filteredTxns={filteredTxns} monthCatData={monthCatData} navigate={navigate} selectedMonth={selectedMonth} setBudgets={setBudgets} setDrillCat={setDrillCat} />}

              {activeTab==='trends' && <TrendsTab CustomTooltip={CustomTooltip} budgets={budgets} data={data} filteredTxns={filteredTxns} selectedMonth={selectedMonth} />}

              {activeTab==='top10' && (
                <motion.div key="top10" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.5rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                      <Flame size={20} style={{ color:'var(--mm-danger)' }}/>
                      <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>
                        TOP 10 LARGEST TRANSACTIONS {selectedMonth ? `— ${new Date(selectedMonth+'-01').toLocaleDateString('en-US',{month:'short',year:'numeric'})}` : '(All Time)'}
                      </h3>
                    </div>
                    <div style={{ overflowX:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                        <thead><tr style={{ borderBottom:'1px solid rgba(74,222,128,0.15)' }}>
                          {['#','Date','Type','Category','Amount','Notes'].map(h=>(
                            <th key={h} style={{ textAlign:'left', padding:'0.6rem 1rem', color:'var(--text-secondary)', fontWeight:600, letterSpacing:'1px', fontSize:'0.7rem' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {[...filteredTxns].sort((a,b)=>b.amount-a.amount).slice(0,10).map((tx,i)=>{
                            const typeColor = tx.type==='Income'?'#4ade80':tx.type==='Transfer'?'#8b5cf6':'#f87171';
                            return (
                              <motion.tr key={tx.id||i} initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} transition={{ delay:i*0.04 }}
                                style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--text-muted)' }}>#{i+1}</td>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--mm-text-2)' }}>{tx.date}</td>
                                <td style={{ padding:'0.75rem 1rem' }}><span style={{ color:typeColor, background:`${typeColor}18`, padding:'0.2rem 0.6rem', borderRadius:6, fontSize:'0.72rem' }}>{tx.type}</span></td>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--mm-text-2)' }}>{getCategoryEmoji(tx.category)} {tx.category||'--'}</td>
                                <td style={{ padding:'0.75rem 1rem', color:typeColor, fontWeight:700, fontSize:'0.9rem' }}>{formatCurrency(tx.amount)}</td>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--text-secondary)', maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.notes||'--'}</td>
                              </motion.tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {(data.top10Transactions||[]).length===0 && <p className="text-muted" style={{ textAlign:'center', padding:'2rem' }}>NO TRANSACTIONS</p>}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab==='forecast' && (
                <motion.div key="forecast" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-grid">
                    {!forecast ? (
                      <div className="bento-item col-span-12" style={{ alignItems:'center', justifyContent:'center', padding:'3rem' }}>
                        <p className="text-muted" style={{ textAlign:'center' }}>ADD AT LEAST 2 MONTHS OF TRANSACTIONS TO SEE A FORECAST</p>
                      </div>
                    ) : (
                      <>
                        <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.75rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.75rem' }}>
                            <Zap size={22} style={{ color:'var(--mm-warning)' }}/>
                            <div>
                              <h3 style={{ margin:0, fontSize:'0.88rem', letterSpacing:'0.3px', fontWeight:600, color:'var(--mm-warning)' }}>CASH FLOW FORECAST — {forecast.nextMonth}</h3>
                              <p style={{ margin:'0.2rem 0 0', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Based on 3-month rolling average</p>
                            </div>
                          </div>
                          <div className="bento-grid" style={{ gap:'1rem', marginBottom:'1.75rem' }}>
                            {[
                              { label:'Projected Income',  val:forecast.avgIncome,  color:'#4ade80', icon:'📈' },
                              { label:'Projected Expense', val:forecast.avgExpense, color:'#f87171', icon:'📉' },
                              { label:'Projected Net',     val:forecast.projected,  color:forecast.projected>=0?'#4ade80':'#f87171', icon:'💰' },
                            ].map((c,i) => (
                              <motion.div key={c.label} className="bento-item col-span-4" initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{ delay:i*0.1 }}
                                style={{ flexDirection:'column', gap:'0.5rem', border:`1px solid ${c.color}22`, background:`linear-gradient(135deg,${c.color}10,transparent)` }}>
                                <div style={{ display:'flex', justifyContent:'space-between' }}>
                                  <span style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-secondary)' }}>{c.label}</span>
                                  <span style={{ fontSize:'1.2rem' }}>{c.icon}</span>
                                </div>
                                <div style={{ fontWeight:700, fontSize:'1.6rem', color:c.color }}>{formatCurrency(c.val)}</div>
                              </motion.div>
                            ))}
                          </div>

                          {/* Visual forecast bar */}
                          <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:12, padding:'1.5rem', border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginBottom:'1rem', letterSpacing:'1px' }}>INCOME vs EXPENSE PROJECTION</div>
                            {['Projected Income','Projected Expense'].map((label, idx) => {
                              const val = idx === 0 ? forecast.avgIncome : forecast.avgExpense;
                              const max = Math.max(forecast.avgIncome, forecast.avgExpense);
                              const pct = max > 0 ? (val / max) * 100 : 0;
                              const color = idx === 0 ? '#4ade80' : '#f87171';
                              return (
                                <div key={label} style={{ marginBottom:'1rem' }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.4rem', fontSize:'0.8rem' }}>
                                    <span style={{ color:'var(--text-secondary)' }}>{label}</span>
                                    <span style={{ color, fontWeight:700 }}>{formatCurrency(val)}</span>
                                  </div>
                                  <div style={{ height:10, background:'rgba(255,255,255,0.06)', borderRadius:5, overflow:'hidden' }}>
                                    <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{ duration:1, ease:'easeOut' }}
                                      style={{ height:'100%', background:color, borderRadius:5, boxShadow:`0 0 8px ${color}` }}/>
                                  </div>
                                </div>
                              );
                            })}
                            <div style={{ marginTop:'1.25rem', padding:'1rem', background:`${forecast.projected>=0?'rgba(16,185,129,0.08)':'rgba(244,63,94,0.08)'}`, borderRadius:8, border:`1px solid ${forecast.projected>=0?'rgba(16,185,129,0.2)':'rgba(244,63,94,0.2)'}` }}>
                              <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginBottom:4 }}>ESTIMATED NET NEXT MONTH</div>
                              <div style={{ fontWeight:700, fontSize:'1.5rem', color:forecast.projected>=0?'var(--mm-success)':'var(--mm-danger)' }}>
                                {forecast.projected>=0?'+':''}{formatCurrency(forecast.projected)}
                              </div>
                              <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginTop:4 }}>
                                {forecast.projected>=0 ? '✅ On track to save money next month' : '⚠️ Projected to overspend next month — review spending habits'}
                              </div>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── CASH FLOW FORECAST (60-day daily balance) ── */}
              {activeTab==='cashflow' && <CashflowTab dailyForecast={dailyForecast} forecastLoading={forecastLoading} />}

              {/* ── SPENDING BY TAG ── */}
              {activeTab==='tags' && (
                <motion.div key="tags" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-grid">
                    {tagData.length === 0 ? (
                      <div className="bento-item col-span-12" style={{ flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4rem 2rem', gap:'1rem' }}>
                        <Tag size={40} style={{ color:'var(--text-muted)' }}/>
                        <p style={{ fontSize:'0.82rem', color:'var(--text-secondary)', textAlign:'center', letterSpacing:'1px', lineHeight:1.8 }}>
                          ADD TAGS TO TRANSACTIONS TO SEE TAG ANALYTICS
                        </p>
                        <p style={{ fontSize:'0.78rem', color:'var(--text-muted)', textAlign:'center', maxWidth:400 }}>
                          When creating or editing a transaction, add tags to categorize spending across multiple categories.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* Bar chart */}
                        <div className="bento-item col-span-8" style={{ flexDirection:'column', minHeight:400 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                            <Tag size={18} style={{ color:'#a78bfa' }}/>
                            <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>SPENDING BY TAG</h3>
                          </div>
                          <ResponsiveContainer width="100%" height={Math.max(280, tagData.length * 44)}>
                            <BarChart data={tagData.slice(0, 15)} layout="vertical" margin={{ left:10, right:30 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false}/>
                              <XAxis type="number" stroke="#444"
                                tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                                tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                              <YAxis type="category" dataKey="tag" stroke="#444"
                                tick={{ fontFamily:'Inter, sans-serif', fontSize:11, fill:'#aaa' }}
                                axisLine={false} tickLine={false} width={120}/>
                              <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)' }}/>
                              <Bar dataKey="total" radius={[0,4,4,0]}>
                                {tagData.slice(0, 15).map((_, i) => (
                                  <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter:`drop-shadow(0 0 3px ${COLORS[i%COLORS.length]})` }}/>
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Tag breakdown list */}
                        <div className="bento-item col-span-4" style={{ flexDirection:'column', padding:'1.5rem' }}>
                          <h3 style={{ margin:'0 0 1rem', letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600, color:'#a78bfa' }}>TAG TOTALS</h3>
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', overflowY:'auto', maxHeight:400 }}>
                            {tagData.map((t, i) => {
                              const totalAll = tagData.reduce((s, x) => s + x.total, 0);
                              const pct = totalAll > 0 ? Math.round((t.total / totalAll) * 100) : 0;
                              const color = COLORS[i % COLORS.length];
                              return (
                                <motion.div key={t.tag} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{ delay:i*0.05 }}>
                                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem' }}>
                                    <span style={{ color }}># {t.tag}</span>
                                    <span style={{ color:'var(--mm-text-2)' }}>{pct}%</span>
                                  </div>
                                  <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                                    <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{ duration:0.8, delay:i*0.05 }}
                                      style={{ height:'100%', background:color, borderRadius:3, boxShadow:`0 0 6px ${color}` }}/>
                                  </div>
                                  <div style={{ fontSize:'0.72rem', color:'var(--text-secondary)', marginTop:'0.15rem' }}>{formatCurrency(t.total)}</div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {activeTab==='heatmap' && (
                <motion.div key="heatmap" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.35}}>
                  <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.75rem', marginBottom:'1.25rem' }}>
                    <div style={{ fontSize:'0.75rem', letterSpacing:'0.3px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'1.25rem' }}>SPENDING ACTIVITY — LAST 12 MONTHS</div>
                    <SpendingHeatmap dailyData={(data?.allTransactions || []).filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).map(t => ({ date: t.date, amount: t.amount }))} />
                    <div style={{ marginTop:'1.5rem', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:'1rem' }}>
                      {(() => {
                        const daily = {};
                        (data?.allTransactions || []).filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).forEach(t => { daily[t.date] = (daily[t.date]||0)+t.amount; });
                        const amounts = Object.values(daily);
                        if (!amounts.length) return null;
                        const avg = amounts.reduce((s,a)=>s+a,0)/amounts.length;
                        const max = Math.max(...amounts);
                        const maxDate = Object.entries(daily).find(([,v])=>v===max)?.[0];
                        const activeDays = amounts.length;
                        return [
                          { label:'AVERAGE DAILY SPEND', val:formatCurrency(avg), color:'#818cf8' },
                          { label:'HIGHEST SINGLE DAY', val:formatCurrency(max), color:'#f87171', sub:maxDate },
                          { label:'ACTIVE SPENDING DAYS', val:activeDays, color:'#4ade80' },
                        ].map(k => (
                          <div key={k.label} style={{ padding:'1rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:`1px solid ${k.color}20` }}>
                            <div style={{ fontSize:'0.62rem', letterSpacing:'1.5px', color:'var(--text-muted)', marginBottom:'0.4rem' }}>{k.label}</div>
                            <div style={{ fontWeight:700, fontSize:'1.2rem', color:k.color }}>{k.val}</div>
                            {k.sub && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)', marginTop:'0.2rem' }}>{k.sub}</div>}
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab==='weekday' && <WeekdayTab data={data} parseLocalYMD={parseLocalYMD} />}

              {activeTab==='recommend' && (
                <motion.div key="recommend" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-grid">
                    <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.75rem 1.5rem' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.5rem' }}>
                        <Lightbulb size={22} style={{ color:'var(--mm-warning)' }}/>
                        <div>
                          <h3 style={{ margin:0, letterSpacing:'2px', fontSize:'0.85rem', color:'var(--mm-warning)' }}>AI FINANCIAL INSIGHTS</h3>
                          <p style={{ margin:'0.2rem 0 0', fontSize:'0.78rem', color:'var(--text-secondary)' }}>Personalized recommendations from your data</p>
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                        {(data.recommendations||[]).length===0 ? (
                          <p className="text-muted" style={{ textAlign:'center', padding:'2rem' }}>ADD MORE TRANSACTIONS TO UNLOCK INSIGHTS.</p>
                        ) : (data.recommendations||[]).map((rec,i) => <RecommendCard key={i} rec={rec} index={i}/>)}
                      </div>
                      {(data.totalIncome||0)>0 && (
                        <div style={{ marginTop:'2rem', padding:'1.5rem', background:'rgba(74,222,128,0.04)', border:'1px solid rgba(74,222,128,0.1)', borderRadius:'12px' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
                            <span style={{ fontSize:'0.78rem', letterSpacing:'1px', color:'var(--text-secondary)' }}>SAVINGS RATE GAUGE</span>
                            <span style={{ fontWeight:700, fontSize:'1.1rem', color:(data.savingsRate||0)>=20?'var(--mm-success)':(data.savingsRate||0)>=10?'var(--mm-warning)':'var(--mm-danger)' }}>{data.savingsRate||0}%</span>
                          </div>
                          <div style={{ position:'relative', height:12, background:'rgba(255,255,255,0.06)', borderRadius:6, overflow:'hidden' }}>
                            <motion.div initial={{width:0}} animate={{width:`${Math.min(data.savingsRate||0,100)}%`}} transition={{ duration:1.2, ease:'easeOut' }}
                              style={{ height:'100%', borderRadius:6, background:(data.savingsRate||0)>=20?'linear-gradient(90deg,#4ade80,#14b8a6)':(data.savingsRate||0)>=10?'linear-gradient(90deg,#fbbf24,#fb923c)':'linear-gradient(90deg,#f87171,#fb7185)', boxShadow:(data.savingsRate||0)>=20?'0 0 12px #4ade80':(data.savingsRate||0)>=10?'0 0 12px #fbbf24':'0 0 12px #f87171' }}/>
                            <div style={{ position:'absolute', top:0, left:'20%', width:2, height:'100%', background:'rgba(255,255,255,0.3)' }}/>
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.68rem', color:'var(--text-muted)', marginTop:'0.4rem' }}>
                            <span>0%</span><span style={{ color:'var(--text-secondary)' }}>20% TARGET</span><span>100%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab==='yoy' && (() => {
                // Build year-over-year data from momComparison
                const thisYear = new Date().getFullYear();
                const lastYear = thisYear - 1;
                const allMoM = data.momComparison || [];
                const byMonth = {};
                allMoM.forEach(m => {
                  const [yr, mo] = (m.month || '').split('-');
                  if (!yr || !mo) return;
                  if (!byMonth[mo]) byMonth[mo] = {};
                  byMonth[mo][yr] = { income: m.income || 0, expense: m.expense || 0 };
                });
                const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
                const MO_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                const yoyData = MONTHS.map((mo, idx) => ({
                  month: MO_LABELS[idx],
                  [`${thisYear} Income`]: byMonth[mo]?.[thisYear]?.income || 0,
                  [`${thisYear} Expense`]: byMonth[mo]?.[thisYear]?.expense || 0,
                  [`${lastYear} Income`]: byMonth[mo]?.[lastYear]?.income || 0,
                  [`${lastYear} Expense`]: byMonth[mo]?.[lastYear]?.expense || 0,
                }));
                const curIncome  = yoyData.reduce((s, d) => s + d[`${thisYear} Income`], 0);
                const curExpense = yoyData.reduce((s, d) => s + d[`${thisYear} Expense`], 0);
                const prvIncome  = yoyData.reduce((s, d) => s + d[`${lastYear} Income`], 0);
                const prvExpense = yoyData.reduce((s, d) => s + d[`${lastYear} Expense`], 0);
                const incChg = prvIncome > 0 ? ((curIncome - prvIncome) / prvIncome) * 100 : 0;
                const expChg = prvExpense > 0 ? ((curExpense - prvExpense) / prvExpense) * 100 : 0;
                const hasData = curIncome > 0 || curExpense > 0 || prvIncome > 0 || prvExpense > 0;
                return (
                  <motion.div key="yoy" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                    <div className="bento-grid">
                      {/* Year totals strip */}
                      <div className="bento-item col-span-12" style={{ flexDirection:'row', gap:'1.5rem', flexWrap:'wrap', padding:'1rem 1.5rem' }}>
                        {[
                          { label:`${thisYear} Income`,  val:curIncome,  col:'#4ade80' },
                          { label:`${thisYear} Expenses`,val:curExpense, col:'#f87171' },
                          { label:`${lastYear} Income`,  val:prvIncome,  col:'rgba(74,222,128,0.5)' },
                          { label:`${lastYear} Expenses`,val:prvExpense, col:'rgba(248,113,113,0.5)' },
                          { label:'Income Growth',  val:`${incChg >= 0 ? '+' : ''}${incChg.toFixed(1)}%`, col: incChg >= 0 ? '#4ade80' : '#f87171', isText:true },
                          { label:'Expense Growth', val:`${expChg >= 0 ? '+' : ''}${expChg.toFixed(1)}%`, col: expChg <= 0 ? '#4ade80' : '#f87171', isText:true },
                        ].map(s => (
                          <div key={s.label} style={{ textAlign:'center', minWidth:110 }}>
                            <div style={{ fontSize:'0.65rem', letterSpacing:'1px', color:'var(--text-muted)', marginBottom:'0.3rem' }}>{s.label.toUpperCase()}</div>
                            <div style={{ fontWeight:700, fontSize:s.isText?'1.1rem':'0.95rem', color:s.col }}>
                              {s.isText ? s.val : formatCurrency(s.val)}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* YoY bar chart */}
                      <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.5rem' }}>
                        <div style={{ fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)', marginBottom:'1rem' }}>
                          📅 {lastYear} vs {thisYear} — MONTHLY INCOME & EXPENSE
                        </div>
                        {hasData ? (
                          <div style={{ height:300 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={yoyData} margin={{ top:5, right:20, left:0, bottom:5 }} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false}/>
                                <XAxis dataKey="month" stroke="#444" tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                                <YAxis stroke="#444" tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                                <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)' }}/>
                                <Bar dataKey={`${lastYear} Income`}  fill="rgba(74,222,128,0.35)"  radius={[3,3,0,0]}/>
                                <Bar dataKey={`${lastYear} Expense`} fill="rgba(248,113,113,0.35)" radius={[3,3,0,0]}/>
                                <Bar dataKey={`${thisYear} Income`}  fill="#4ade80" radius={[3,3,0,0]}/>
                                <Bar dataKey={`${thisYear} Expense`} fill="#f87171" radius={[3,3,0,0]}/>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        ) : (
                          <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)' }}>
                            Need data from at least two years for comparison.
                          </div>
                        )}
                        {/* Legend */}
                        <div style={{ display:'flex', gap:'1rem', flexWrap:'wrap', marginTop:'0.75rem', justifyContent:'center' }}>
                          {[
                            { col:'rgba(74,222,128,0.35)', label:`${lastYear} Income` },
                            { col:'rgba(248,113,113,0.35)', label:`${lastYear} Expense` },
                            { col:'#4ade80', label:`${thisYear} Income` },
                            { col:'#f87171', label:`${thisYear} Expense` },
                          ].map(l => (
                            <div key={l.label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:'0.72rem', color:'var(--text-muted)' }}>
                              <div style={{ width:12, height:12, borderRadius:3, background:l.col }}/>
                              {l.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {activeTab==='tax' && (() => {
                const allTx = data?.allTransactions || [];
                const targetYear = selectedMonth ? selectedMonth.slice(0, 4) : new Date().getFullYear().toString();
                const yearTx = allTx.filter(tx => (tx.date || '').startsWith(targetYear));
                const grossIncome = yearTx.filter(tx => !isInternalMove(tx) && tx.type === 'Income').reduce((s, tx) => s + (tx.amount || 0), 0);
                const deductibleTx = yearTx.filter(tx =>
                  !isInternalMove(tx) && tx.type === 'Expense' && (
                    tx.is_tax_deductible ||
                    tx.tax_deductible ||
                    (tx.tags || []).some(t => /tax|business|deduct|office|work/i.test(t)) ||
                    ['Business', 'Education', 'Health', 'Medical'].includes(tx.category)
                  )
                );
                const deductibleTotal = deductibleTx.reduce((s, tx) => s + (tx.amount || 0), 0);
                const netTaxable = Math.max(0, grossIncome - deductibleTotal);
                const estimatedTax = netTaxable * (taxRate / 100);
                const taxSaved = deductibleTotal * (taxRate / 100);

                const exportTaxCSV = () => {
                  const headers = ['Date', 'Category', 'Amount', 'Marked Tax-Deductible', 'Tags', 'Notes'];
                  const rows = deductibleTx.map(tx => [
                    tx.date || '',
                    `"${(tx.category || 'Uncategorized').replace(/"/g, '""')}"`,
                    tx.amount || 0,
                    (tx.is_tax_deductible || tx.tax_deductible) ? 'Yes' : 'Auto-Detected (Category/Tag)',
                    `"${(tx.tags || []).join(', ')}"`,
                    `"${(tx.notes || '').replace(/"/g, '""')}"`
                  ]);
                  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  saveFile(blob, `Tax_Audit_Pack_${targetYear}.csv`)
                    .then(() => toast.success(`Tax Audit CSV exported for ${targetYear}!`))
                    .catch(err => toast.error(err?.message || 'Export failed'));
                };

                return (
                  <motion.div key="tax" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.35}}>
                    <div className="bento-grid">
                      <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.5rem', background:'linear-gradient(135deg, rgba(74,222,128,0.06), rgba(129,140,248,0.05))', border:'1px solid rgba(74,222,128,0.2)' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'1rem', marginBottom:'1.25rem' }}>
                          <div>
                            <div style={{ fontSize:'0.78rem', fontWeight:700, letterSpacing:'1.5px', color:'var(--mm-success)' }}>
                              🧾 ANNUAL TAX &amp; DEDUCTION SUMMARY ({targetYear})
                            </div>
                            <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:3 }}>
                              Includes transactions explicitly marked 🧾 Tax-Deductible or categorized under Business, Education, &amp; Health
                            </div>
                          </div>
                          <button className="btn btn-primary" onClick={exportTaxCSV} style={{ fontSize:'0.78rem', padding:'0.55rem 1rem' }}>
                            <Download size={15} /> Export {targetYear} Tax Audit CSV
                          </button>
                        </div>

                        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(190px, 1fr))', gap:'0.85rem', marginBottom:'1.25rem' }}>
                          <div style={{ padding:'1rem', borderRadius:12, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>GROSS INCOME ({targetYear})</div>
                            <div style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--mm-success)', marginTop:4 }}>{formatCurrency(grossIncome)}</div>
                          </div>
                          <div style={{ padding:'1rem', borderRadius:12, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(74,222,128,0.2)' }}>
                            <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>DEDUCTIBLE EXPENSES</div>
                            <div style={{ fontSize:'1.25rem', fontWeight:700, color:'#38bdf8', marginTop:4 }}>{formatCurrency(deductibleTotal)}</div>
                            <div style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:2 }}>{deductibleTx.length} qualifying items</div>
                          </div>
                          <div style={{ padding:'1rem', borderRadius:12, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)' }}>
                            <div style={{ fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>NET TAXABLE INCOME</div>
                            <div style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--text-primary)', marginTop:4 }}>{formatCurrency(netTaxable)}</div>
                          </div>
                          <div style={{ padding:'1rem', borderRadius:12, background:'rgba(251,191,36,0.06)', border:'1px solid rgba(251,191,36,0.2)' }}>
                            <div style={{ fontSize:'0.65rem', color:'var(--mm-warning)', letterSpacing:'1px' }}>EST. TAX (@ {taxRate}%)</div>
                            <div style={{ fontSize:'1.25rem', fontWeight:700, color:'var(--mm-warning)', marginTop:4 }}>{formatCurrency(estimatedTax)}</div>
                            <div style={{ fontSize:'0.68rem', color:'var(--mm-success)', marginTop:2 }}>Saved {formatCurrency(taxSaved)} via deductions</div>
                          </div>
                        </div>

                        <div style={{ display:'flex', alignItems:'center', gap:'1rem', flexWrap:'wrap', padding:'0.85rem 1rem', borderRadius:10, background:'rgba(0,0,0,0.25)', marginBottom:'1.25rem' }}>
                          <span style={{ fontSize:'0.76rem', color:'var(--text-secondary)' }}>
                            Effective Tax Rate Bracket: <strong style={{ color:'var(--mm-warning)' }}>{taxRate}%</strong>
                          </span>
                          <input type="range" min="0" max="45" step="1" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} style={{ flex:1, minWidth:160, accentColor:'var(--mm-success)' }} />
                        </div>

                        <div style={{ fontSize:'0.72rem', letterSpacing:'1px', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>
                          DEDUCTIBLE EXPENSE LEDGER ({deductibleTx.length})
                        </div>
                        {deductibleTx.length === 0 ? (
                          <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-muted)', fontSize:'0.82rem' }}>
                            No tax-deductible expenses recorded for {targetYear}. Toggle &ldquo;🧾 Mark as Tax-Deductible&rdquo; when adding an expense to track it here.
                          </div>
                        ) : (
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.45rem', maxHeight:340, overflowY:'auto' }}>
                            {deductibleTx.slice(0, 50).map(tx => (
                              <div key={tx.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.65rem 0.9rem', borderRadius:10, background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                  <div style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)', display:'flex', alignItems:'center', gap:'0.4rem' }}>
                                    <span>{getCategoryEmoji(tx.category)} {tx.category || 'Expense'}</span>
                                    {(tx.is_tax_deductible || tx.tax_deductible) && <span style={{ fontSize:'0.62rem', padding:'0.1rem 0.4rem', borderRadius:6, background:'rgba(74,222,128,0.14)', color:'var(--mm-success)' }}>🧾 Explicit</span>}
                                  </div>
                                  <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>
                                    {tx.date} {tx.notes ? `• ${tx.notes}` : ''}
                                  </div>
                                </div>
                                <div style={{ fontWeight:700, fontSize:'0.9rem', color:'#38bdf8' }}>
                                  {formatCurrency(tx.amount)}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
            </div>
          </>
        ) : (
          <p className="text-muted" style={{ textAlign:'center', padding:'3rem' }}>FAILED TO LOAD DATA</p>
        )}
      </div>

      <MonthlyStoryModal
        isOpen={showStoryModal}
        onClose={() => setShowStoryModal(false)}
        analyticsData={data}
        transactions={data?.allTransactions || []}
      />
    </PageWrapper>
  );
};

export default Analytics;