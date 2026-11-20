import { useT } from '../i18n';
import { PageHeader, Segmented } from '../components/ui';
import ToolMenu from '../components/ToolMenu';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useLiveData from '../utils/useLiveData';
import { fetchAnalytics, fetchBills, fetchRecurringTransactions, fetchBudgets, createBudget, updateBudget, fetchAccounts, fetchLoans, getCache, getCategorySpendFromMap, fetchExchangeRates } from '../utils/api';
import PageWrapper from '../components/PageWrapper';
import SkeletonLoader from '../components/SkeletonLoader';
import AnimatedCounter from '../components/AnimatedCounter';
import getCategoryEmoji from '../utils/categoryEmoji';
import SpendingHeatmap from '../components/SpendingHeatmap';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
  AreaChart, Area, ReferenceLine,
} from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Activity, PieChart as PieIcon, BarChart2, Download, Lightbulb, Flame, DollarSign, FileText, Zap, Tag, CalendarDays, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, getCurrency, convertCurrency } from '../utils/format';
import MonthlyStoryModal from '../components/MonthlyStoryModal';
import { toYMD, todayYMD } from '../utils/dates';

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
  const nextDate   = new Date(); nextDate.setMonth(nextDate.getMonth() + 1);
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
    XLSX.writeFile(wb, `VaultManager_Report_${todayYMD()}.xlsx`);
    toast.success('Excel exported!');
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
        budgets: budgets || []
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
      const [accs, lns] = await Promise.all([fetchAccounts(), fetchLoans()]);
      await generateExecutiveFinancialDossierPDF({
        analytics: data,
        accounts: accs || [],
        loans: lns || [],
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
    filteredTxns.filter(tx => tx.type === 'Expense' || tx.type === 'Loan Payment').forEach(tx => {
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

  const monthIncome  = filteredTxns.filter(tx => tx.type === 'Income').reduce((s,tx) => s + tx.amount, 0);
  const monthExpense = filteredTxns.filter(tx => tx.type === 'Expense' || tx.type === 'Loan Payment').reduce((s,tx) => s + tx.amount, 0);
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
              {activeTab==='overview' && (
                <div key="overview">
                  <div className="bento-grid">
                    <div className="bento-item col-span-12" style={{ flexDirection:'column', minHeight:320 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                        <Activity className="text-cyan" size={20}/>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>CASH FLOW TIMELINE</h3>
                      </div>
                      {(data.monthlyTrends||[]).length===0 ? (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><p className="text-muted" >NO DATA</p></div>
                      ) : (
                        <ResponsiveContainer width="100%" height={260}>
                          <AreaChart data={data.monthlyTrends} margin={{ top:10, right:10, left:0, bottom:0 }}>
                            <defs>
                              <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.4}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                              </linearGradient>
                              <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f87171" stopOpacity={0.4}/><stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                            <XAxis dataKey="month" stroke="#444" tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                            <YAxis stroke="#444" tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                            <Tooltip content={<CustomTooltip/>}/><Legend wrapperStyle={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}/>
                            <Area type="monotone" dataKey="Income" stroke="#4ade80" strokeWidth={2} fill="url(#incomeGrad)" dot={{ fill:'#4ade80', r:3 }}/>
                            <Area type="monotone" dataKey="Expense" stroke="#f87171" strokeWidth={2} fill="url(#expGrad)" dot={{ fill:'#f87171', r:3 }}/>
                          </AreaChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* ── INTERACTIVE "WHERE DID MY MONEY GO?" CASH-FLOW WATERFALL & 50/30/20 FLOW ── */}
                    {(() => {
                      const FIXED_CATS = new Set(['rent', 'utilities', 'bills', 'phone', 'loan payment', 'insurance', 'maintenance', 'credit card payment']);
                      const ESSENTIAL_CATS = new Set(['food', 'transport', 'health', 'education', 'groceries', 'medical', 'fuel']);

                      let fixedTotal = 0;
                      let essentialTotal = 0;
                      let discretionaryTotal = 0;

                      monthCatData.forEach(c => {
                        const lowerCat = (c.category || '').toLowerCase();
                        if (FIXED_CATS.has(lowerCat)) fixedTotal += c.total;
                        else if (ESSENTIAL_CATS.has(lowerCat)) essentialTotal += c.total;
                        else discretionaryTotal += c.total;
                      });

                      const baseIncome = Math.max(monthIncome, monthExpense, 1);
                      const netRetained = Math.max(0, monthIncome - monthExpense);
                      const needsTotal = fixedTotal + essentialTotal;
                      const needsPct = Math.round((needsTotal / baseIncome) * 100);
                      const wantsPct = Math.round((discretionaryTotal / baseIncome) * 100);
                      const savedPct = monthIncome > 0 ? Math.max(0, Math.round((netRetained / monthIncome) * 100)) : 0;

                      const afterFixed = Math.max(0, monthIncome - fixedTotal);
                      const afterEssential = Math.max(0, afterFixed - essentialTotal);
                      const afterDiscretionary = Math.max(0, afterEssential - discretionaryTotal);

                      const waterfallSteps = [
                        {
                          name: 'Total Income',
                          amount: monthIncome,
                          pct: 100,
                          remaining: monthIncome,
                          color: '#4ade80',
                          badge: 'INFLOW',
                          desc: 'Gross monthly inflow',
                        },
                        {
                          name: 'Fixed Bills & Debt',
                          amount: fixedTotal,
                          pct: Math.round((fixedTotal / baseIncome) * 100),
                          remaining: afterFixed,
                          color: '#f87171',
                          badge: 'OBLIGATIONS',
                          desc: 'Rent, utilities, bills & loans',
                        },
                        {
                          name: 'Living Essentials',
                          amount: essentialTotal,
                          pct: Math.round((essentialTotal / baseIncome) * 100),
                          remaining: afterEssential,
                          color: '#fb923c',
                          badge: 'ESSENTIALS',
                          desc: 'Food, transport, health & education',
                        },
                        {
                          name: 'Lifestyle & Wants',
                          amount: discretionaryTotal,
                          pct: Math.round((discretionaryTotal / baseIncome) * 100),
                          remaining: afterDiscretionary,
                          color: '#a78bfa',
                          badge: 'LIFESTYLE',
                          desc: 'Shopping, dining, travel & entertainment',
                        },
                        {
                          name: 'Net Retained Wealth',
                          amount: monthSavings,
                          pct: monthIncome > 0 ? Math.round((monthSavings / monthIncome) * 100) : 0,
                          remaining: Math.max(0, monthSavings),
                          color: monthSavings >= 0 ? '#38bdf8' : '#f87171',
                          badge: monthSavings >= 0 ? 'SAVED' : 'DEFICIT',
                          desc: monthSavings >= 0 ? 'Unspent cash retained in vault' : 'Overspent vs monthly income',
                        },
                      ];

                      return (
                        <div className="bento-item col-span-12 heavy-section-deferred" style={{ flexDirection: 'column', padding: '1.5rem', gap: '1.25rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
                                <span style={{ fontSize: '1.15rem' }}>🌊</span>
                                <h3 style={{ margin: 0, letterSpacing: '0.4px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                                  WHERE DID MY MONEY GO? — MONTHLY CASH-FLOW WATERFALL
                                </h3>
                              </div>
                              <p style={{ margin: '0.25rem 0 0', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                Step-by-step cascade from Total Income down to Net Retained Savings &amp; 50/30/20 benchmark check
                              </p>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ padding: '0.28rem 0.65rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: needsPct <= 50 ? 'rgba(74,222,128,0.12)' : 'rgba(251,191,36,0.12)', color: needsPct <= 50 ? '#4ade80' : '#fbbf24', border: `1px solid ${needsPct <= 50 ? 'rgba(74,222,128,0.3)' : 'rgba(251,191,36,0.3)'}` }}>
                                Needs: {needsPct}% (Target ≤50%)
                              </span>
                              <span style={{ padding: '0.28rem 0.65rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: wantsPct <= 30 ? 'rgba(167,139,250,0.12)' : 'rgba(248,113,113,0.12)', color: wantsPct <= 30 ? '#a78bfa' : '#f87171', border: `1px solid ${wantsPct <= 30 ? 'rgba(167,139,250,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                                Wants: {wantsPct}% (Target ≤30%)
                              </span>
                              <span style={{ padding: '0.28rem 0.65rem', borderRadius: 999, fontSize: '0.7rem', fontWeight: 700, background: savedPct >= 20 ? 'rgba(56,189,248,0.14)' : 'rgba(248,113,113,0.12)', color: savedPct >= 20 ? '#38bdf8' : '#f87171', border: `1px solid ${savedPct >= 20 ? 'rgba(56,189,248,0.3)' : 'rgba(248,113,113,0.3)'}` }}>
                                Saved: {savedPct}% (Target ≥20%)
                              </span>
                            </div>
                          </div>

                          {/* Stacked Horizontal Allocation Bar */}
                          <div>
                            <div style={{ height: 14, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden', display: 'flex', gap: 2 }}>
                              {fixedTotal > 0 && (
                                <div title={`Fixed Bills: ${formatCurrency(fixedTotal)}`} style={{ width: `${Math.min(100, (fixedTotal / baseIncome) * 100)}%`, background: '#f87171', transition: 'width 0.6s ease' }} />
                              )}
                              {essentialTotal > 0 && (
                                <div title={`Living Essentials: ${formatCurrency(essentialTotal)}`} style={{ width: `${Math.min(100, (essentialTotal / baseIncome) * 100)}%`, background: '#fb923c', transition: 'width 0.6s ease' }} />
                              )}
                              {discretionaryTotal > 0 && (
                                <div title={`Lifestyle & Wants: ${formatCurrency(discretionaryTotal)}`} style={{ width: `${Math.min(100, (discretionaryTotal / baseIncome) * 100)}%`, background: '#a78bfa', transition: 'width 0.6s ease' }} />
                              )}
                              {netRetained > 0 && (
                                <div title={`Net Retained Savings: ${formatCurrency(netRetained)}`} style={{ width: `${Math.min(100, (netRetained / baseIncome) * 100)}%`, background: '#38bdf8', transition: 'width 0.6s ease' }} />
                              )}
                            </div>
                          </div>

                          {/* Interactive Cascade Cards */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '0.75rem' }}>
                            {waterfallSteps.map((step, idx) => (
                              <motion.div
                                key={step.name}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.06 }}
                                style={{
                                  padding: '0.95rem 1rem',
                                  borderRadius: 12,
                                  background: `linear-gradient(145deg, ${step.color}12, rgba(255,255,255,0.015))`,
                                  border: `1px solid ${step.color}30`,
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.35rem',
                                  position: 'relative',
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '1.2px', color: step.color, background: `${step.color}18`, padding: '2px 6px', borderRadius: 5 }}>
                                    {idx + 1}. {step.badge}
                                  </span>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    {step.pct}%
                                  </span>
                                </div>
                                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 2 }}>
                                  {step.name}
                                </div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: step.color }}>
                                  {idx === 0 ? '+' : idx === 4 ? (step.amount >= 0 ? '=' : '') : '-'}{formatCurrency(Math.abs(step.amount))}
                                </div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                                  {step.desc}
                                </div>
                                {idx > 0 && idx < 4 && monthIncome > 0 && (
                                  <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginTop: '0.2rem', paddingTop: '0.3rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    Left after step: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(step.remaining)}</strong>
                                  </div>
                                )}
                              </motion.div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="bento-item col-span-6" style={{ flexDirection:'column', minHeight:300 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                        <PieIcon className="text-purple" size={18}/>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>EXPENSE DISTRIBUTION</h3>
                      </div>
                      {monthCatData.length===0 ? (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><p className="text-muted" >NO DATA</p></div>
                      ) : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={monthCatData} dataKey="total" nameKey="category" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none"
                              onClick={(entry) => { setDrillCat(entry.category); setActiveTab('categories'); }}>
                              {monthCatData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} style={{ filter:`drop-shadow(0 0 4px ${COLORS[i%COLORS.length]})`, cursor:'pointer' }}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/>
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="bento-item col-span-6" style={{ flexDirection:'column', minHeight:300 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                        <TrendingUp className="text-success" size={18}/>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>INCOME SOURCES</h3>
                      </div>
                      {(data.incomeSourceData||[]).length===0 ? (
                        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}><p className="text-muted" >NO DATA</p></div>
                      ) : (
                        <ResponsiveContainer width="100%" height={240}>
                          <PieChart>
                            <Pie data={data.incomeSourceData} dataKey="total" nameKey="source" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} stroke="none">
                              {data.incomeSourceData.map((_,i) => <Cell key={i} fill={['#4ade80','#14b8a6','#06b6d4','#3b82f6','#8b5cf6'][i%5]}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/><Legend wrapperStyle={{ fontFamily:'Inter, sans-serif', fontSize:'0.78rem' }}/>
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>

                    {/* Biggest Change insight cards */}
                    {(data.momComparison||[]).length >= 2 && (() => {
                      const mom = data.momComparison;
                      const biggestIncomeMonth = [...mom].sort((a,b) => Math.abs(b.incomeDelta||0) - Math.abs(a.incomeDelta||0))[0];
                      const biggestExpenseMonth = [...mom].sort((a,b) => Math.abs(b.expenseDelta||0) - Math.abs(a.expenseDelta||0))[0];
                      const topCat = (data.categoryData||[])[0];
                      return (
                        <>
                          <div className="bento-item col-span-4 holographic-card" style={{ flexDirection:'column', gap:'0.5rem' }}>
                            <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-muted)' }}>BIGGEST INCOME SHIFT</div>
                            <div style={{ fontSize:'1.3rem', fontWeight:700, color: (biggestIncomeMonth?.incomeDelta||0) >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>
                              {(biggestIncomeMonth?.incomeDelta||0) > 0 ? '▲' : '▼'} {Math.abs(biggestIncomeMonth?.incomeDelta||0)}%
                            </div>
                            <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{biggestIncomeMonth?.month}</div>
                          </div>
                          <div className="bento-item col-span-4 holographic-card" style={{ flexDirection:'column', gap:'0.5rem' }}>
                            <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-muted)' }}>BIGGEST EXPENSE SHIFT</div>
                            <div style={{ fontSize:'1.3rem', fontWeight:700, color: (biggestExpenseMonth?.expenseDelta||0) <= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>
                              {(biggestExpenseMonth?.expenseDelta||0) > 0 ? '▲' : '▼'} {Math.abs(biggestExpenseMonth?.expenseDelta||0)}%
                            </div>
                            <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{biggestExpenseMonth?.month}</div>
                          </div>
                          {topCat && (
                            <div className="bento-item col-span-4 holographic-card" style={{ flexDirection:'column', gap:'0.5rem', cursor:'pointer' }}
                              onClick={() => { setDrillCat(topCat.category); setActiveTab('categories'); }}>
                              <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-muted)' }}>TOP EXPENSE CATEGORY</div>
                              <div style={{ fontSize:'1.3rem', fontWeight:700, color:'#fb923c' }}>{getCategoryEmoji(topCat.category)} {topCat.category}</div>
                              <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>{topCat.pct}% of all expenses — tap to drill in</div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {(data.momComparison||[]).length >= 2 && (() => {
                      const srData = (data.momComparison||[]).map(m => ({
                        month: m.month?.slice(5) || m.month,
                        rate: m.income > 0 ? parseFloat(((m.income - m.expense) / m.income * 100).toFixed(1)) : 0,
                      }));
                      const avg = srData.length > 0 ? parseFloat((srData.reduce((s,d) => s+d.rate,0) / srData.length).toFixed(1)) : 0;
                      const best = srData.reduce((b,d) => d.rate > b.rate ? d : b, srData[0]);
                      return (
                        <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.5rem' }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.5rem' }}>
                            <div>
                              <div style={{ fontSize:'0.72rem', letterSpacing:'2px', color:'var(--text-secondary)' }}>📈 SAVINGS RATE TREND</div>
                              <div style={{ fontSize:'0.7rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>Monthly % of income saved</div>
                            </div>
                            <div style={{ display:'flex', gap:'1.5rem' }}>
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', letterSpacing:'1px' }}>AVG RATE</div>
                                <div style={{ fontWeight:700, fontSize:'1.1rem', color:avg>=20?'var(--mm-success)':avg>=10?'var(--mm-warning)':'var(--mm-danger)' }}>{avg}%</div>
                              </div>
                              <div style={{ textAlign:'right' }}>
                                <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', letterSpacing:'1px' }}>BEST MONTH</div>
                                <div style={{ fontWeight:700, fontSize:'1.1rem', color:'var(--mm-success)' }}>{best?.rate}%</div>
                              </div>
                            </div>
                          </div>
                          <div style={{ height:160 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={srData} margin={{ top:5, right:10, left:0, bottom:0 }}>
                                <defs>
                                  <linearGradient id="srGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#4ade80" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                                <XAxis dataKey="month" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false}/>
                                <YAxis stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`${v}%`}/>
                                <Tooltip content={<CustomTooltip/>} cursor={{ stroke:'rgba(74,222,128,0.3)', strokeWidth:1 }}/>
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4"/>
                                <Area type="monotone" dataKey="rate" stroke="#4ade80" strokeWidth={2} fill="url(#srGrad)" dot={{ fill:'#4ade80', r:3 }} activeDot={{ r:5 }}/>
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {activeTab==='categories' && (
                <div key="categories">
                  <div className="bento-grid">
                    <div className="bento-item col-span-8" style={{ flexDirection:'column', minHeight:400 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                        <BarChart2 className="text-cyan" size={18}/>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>TOP EXPENSE CATEGORIES</h3>
                        <span style={{ fontSize:'0.72rem', color:'var(--text-muted)', marginLeft:'auto' }}>Tap a bar to drill in</span>
                      </div>
                      <ResponsiveContainer width="100%" height={360}>
                        <BarChart data={monthCatData.slice(0,10)} layout="vertical" margin={{ left:10, right:30 }}
                          onClick={e => e?.activePayload && setDrillCat(e.activePayload[0]?.payload?.category)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false}/>
                          <XAxis type="number" stroke="#444" tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                          <YAxis type="category" dataKey="category" stroke="#444" tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false} width={130}
                            tickFormatter={v => `${getCategoryEmoji(v)} ${v}`}/>
                          <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)', cursor:'pointer' }}/>
                          <Bar dataKey="total" radius={[0,4,4,0]} style={{ cursor:'pointer' }}>
                            {monthCatData.slice(0,10).map((c,i) => <Cell key={i}
                              fill={drillCat===c.category ? '#fff' : COLORS[i%COLORS.length]}
                              style={{ filter:`drop-shadow(0 0 3px ${COLORS[i%COLORS.length]})`, cursor:'pointer' }}/>)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bento-item col-span-4" style={{ flexDirection:'column', padding:'1.5rem' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600, color:'var(--mm-success)' }}>BREAKDOWN</h3>
                        {drillCat && <button onClick={() => setDrillCat(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'0.75rem' }}>✕ Clear</button>}
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem', overflowY:'auto', maxHeight:380 }}>
                        {(() => {
                          const totalExp = monthCatData.reduce((s,c) => s+c.total, 0);
                          return monthCatData.map((cat,i) => {
                            const pct = totalExp > 0 ? Math.round((cat.total/totalExp)*100) : 0;
                            return (
                          <motion.div key={cat.category} initial={{opacity:0,x:20}} animate={{opacity:1,x:0}} transition={{ delay:i*0.05 }}
                            onClick={() => setDrillCat(drillCat===cat.category ? null : cat.category)}
                            style={{ cursor:'pointer', padding:'0.25rem 0.4rem', borderRadius:6, background: drillCat===cat.category ? `${COLORS[i%COLORS.length]}18` : 'transparent',
                              border: drillCat===cat.category ? `1px solid ${COLORS[i%COLORS.length]}44` : '1px solid transparent' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'0.2rem', fontSize:'0.82rem' }}>
                              <span style={{ color:COLORS[i%COLORS.length] }}>{getCategoryEmoji(cat.category)} {cat.category}</span>
                              <span style={{ color:'var(--mm-text-2)' }}>{pct}%</span>
                            </div>
                            <div style={{ height:5, background:'rgba(255,255,255,0.06)', borderRadius:3, overflow:'hidden' }}>
                              <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{ duration:0.8, delay:i*0.05 }}
                                style={{ height:'100%', background:COLORS[i%COLORS.length], borderRadius:3, boxShadow:`0 0 6px ${COLORS[i%COLORS.length]}` }}/>
                            </div>
                          </motion.div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* Drill-down panel: transactions for selected category */}
                    {drillCat && (() => {
                      const txs = [];
                      filteredTxns.filter(t => t.type === 'Expense' || t.type === 'Loan Payment').forEach(t => {
                        const validSplits = t.isSplit !== false && Array.isArray(t.splits)
                          ? t.splits.filter(sp => (Number(sp?.amount) || 0) > 0)
                          : [];
                        if (validSplits.length > 0) {
                          const matchingSum = validSplits
                            .filter(sp => (sp.category || t.category || 'Uncategorized') === drillCat)
                            .reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
                          if (matchingSum > 0) txs.push({ ...t, drillAmount: matchingSum });
                        } else if ((t.category || 'Uncategorized') === drillCat) {
                          txs.push({ ...t, drillAmount: Number(t.amount) || 0 });
                        }
                      });
                      const catIdx = monthCatData.findIndex(c => c.category === drillCat);
                      const catColor = COLORS[catIdx >= 0 ? catIdx % COLORS.length : 0];
                      return (
                        <motion.div className="bento-item col-span-12" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}}
                          style={{ flexDirection:'column', padding:'1.5rem', border:`1px solid ${catColor}44`, background:`${catColor}08` }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'1.25rem', flexWrap:'wrap' }}>
                            <span style={{ fontSize:'1.5rem' }}>{getCategoryEmoji(drillCat)}</span>
                            <h3 style={{ margin:0, fontSize:'1rem', fontWeight:700, color:catColor }}>{drillCat}</h3>
                            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>{txs.length} transactions</span>
                            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                              <button
                                type="button"
                                onClick={() => navigate(`/transactions?q=${encodeURIComponent(drillCat)}`)}
                                style={{ padding:'0.32rem 0.7rem', borderRadius:8, background:'rgba(56,189,248,0.12)', border:'1px solid rgba(56,189,248,0.3)', color:'#38bdf8', fontSize:'0.74rem', fontWeight:600, cursor:'pointer' }}
                              >
                                View in Transactions →
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const targetMonth = selectedMonth || todayYMD().slice(0, 7);
                                  const monthSum = txs.filter(t => String(t.date || '').startsWith(targetMonth)).reduce((s, t) => s + (Number(t.drillAmount ?? t.amount) || 0), 0);
                                  const suggestedLimit = Math.max(5000, Math.ceil(((monthSum || txs.reduce((s, t) => s + (Number(t.drillAmount ?? t.amount) || 0), 0) / Math.max(1, (data.momComparison || []).length)) * 1.1) / 500) * 500);
                                  const existing = (budgets || []).find(b => (b.category || '').toLowerCase() === drillCat.toLowerCase() && (b.month || targetMonth) === targetMonth);
                                  try {
                                    if (existing) {
                                      await updateBudget(existing.id, { ...existing, amount: suggestedLimit });
                                      toast.success(`Updated ${drillCat} budget for ${targetMonth} to ${formatCurrency(suggestedLimit)}`);
                                    } else {
                                      await createBudget({ category: drillCat, amount: suggestedLimit, month: targetMonth, rollover: true });
                                      toast.success(`Created ${drillCat} budget for ${targetMonth} (${formatCurrency(suggestedLimit)})`);
                                    }
                                    const updatedBudgets = await fetchBudgets();
                                    setBudgets(updatedBudgets || []);
                                  } catch {
                                    toast.error('Failed to save budget');
                                  }
                                }}
                                style={{ padding:'0.32rem 0.7rem', borderRadius:8, background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.3)', color:'var(--mm-success)', fontSize:'0.74rem', fontWeight:600, cursor:'pointer' }}
                              >
                                🎯 Set / Tune Budget
                              </button>
                              <button onClick={() => setDrillCat(null)} style={{ background:'none', border:'none', color:'var(--text-muted)', cursor:'pointer', fontSize:'1.1rem' }}>✕</button>
                            </div>
                          </div>
                          {txs.length === 0 ? (
                            <p style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>No transactions in this category.</p>
                          ) : (
                            <div style={{ overflowX:'auto' }}>
                              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                                <thead><tr style={{ borderBottom:`1px solid ${catColor}33` }}>
                                  {['Date','Notes','Amount'].map(h=><th key={h} style={{ textAlign:'left', padding:'0.5rem 1rem', color:'var(--text-secondary)', fontWeight:600, letterSpacing:'1px', fontSize:'0.7rem' }}>{h}</th>)}
                                </tr></thead>
                                <tbody>
                                  {txs.sort((a,b)=>(b.date || '').localeCompare(a.date || '')).map((tx,i)=>(
                                    <motion.tr key={tx.id} initial={{opacity:0}} animate={{opacity:1}} transition={{delay:i*0.03}}
                                      style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                                      <td style={{ padding:'0.6rem 1rem', color:'var(--text-secondary)' }}>{tx.date}</td>
                                      <td style={{ padding:'0.6rem 1rem', color:'var(--text-primary)' }}>{tx.notes || '—'}</td>
                                      <td style={{ padding:'0.6rem 1rem', color:catColor, fontWeight:700 }}>{formatCurrency(tx.drillAmount ?? tx.amount)}</td>
                                    </motion.tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </motion.div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {activeTab==='trends' && (
                <motion.div key="trends" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-grid">
                    <div className="bento-item col-span-12" style={{ flexDirection:'column', minHeight:320 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                        <BarChart2 className="text-success" size={18}/>
                        <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>INCOME VS EXPENSES</h3>
                      </div>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={data.monthlyTrends||[]} margin={{ top:10, right:10, left:0, bottom:0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                          <XAxis dataKey="month" stroke="#444" tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                          <YAxis stroke="#444" tickFormatter={v=>`${(v/1000).toFixed(0)}k`} tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }} axisLine={false} tickLine={false}/>
                          <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)' }}/>
                          <Legend wrapperStyle={{ fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}/>
                          <Bar dataKey="Income" fill="#4ade80" radius={[4,4,0,0]} style={{ filter:'drop-shadow(0 0 4px #4ade80)' }}/>
                          <Bar dataKey="Expense" fill="#f87171" radius={[4,4,0,0]} style={{ filter:'drop-shadow(0 0 4px #f87171)' }}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.5rem' }}>
                      <h3 style={{ margin:'0 0 1.25rem', letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600, color:'var(--mm-success)' }}>MONTH-OVER-MONTH</h3>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.8rem' }}>
                          <thead><tr style={{ borderBottom:'1px solid rgba(74,222,128,0.15)' }}>
                            {['Month','Income','Expense','Net','Income Δ','Expense Δ'].map(h=>(
                              <th key={h} style={{ textAlign:'left', padding:'0.6rem 1rem', color:'var(--text-secondary)', fontWeight:600, letterSpacing:'1px', fontSize:'0.7rem' }}>{h}</th>
                            ))}
                          </tr></thead>
                          <tbody>
                            {(data.momComparison||[]).map((m,i)=>(
                              <motion.tr key={m.month} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} transition={{ delay:i*0.05 }}
                                style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--mm-success)' }}>{m.month}</td>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--mm-success)' }}>{formatCurrency(m.income)}</td>
                                <td style={{ padding:'0.75rem 1rem', color:'var(--mm-danger)' }}>{formatCurrency(m.expense)}</td>
                                <td style={{ padding:'0.75rem 1rem', color:m.net>=0?'var(--mm-success)':'var(--mm-danger)', fontWeight:700 }}>{formatCurrency(m.net)}</td>
                                <td style={{ padding:'0.75rem 1rem', color:m.incomeDelta>=0?'var(--mm-success)':'var(--mm-danger)' }}>{m.incomeDelta>0?'+':''}{m.incomeDelta}%</td>
                                <td style={{ padding:'0.75rem 1rem', color:m.expenseDelta>0?'var(--mm-danger)':'var(--mm-success)' }}>{m.expenseDelta>0?'▲':'▼'} {Math.abs(m.expenseDelta)}%</td>
                              </motion.tr>
                            ))}
                          </tbody>
                        </table>
                        {(data.momComparison||[]).length===0 && <p className="text-muted" style={{ textAlign:'center', padding:'2rem' }}>NO DATA</p>}
                      </div>
                    </div>

                    {/* Budget vs Actual */}
                    {budgets.length > 0 && (() => {
                      const actualByCategory = {};
                      filteredTxns.filter(tx => tx.type === 'Expense' || tx.type === 'Loan Payment').forEach(tx => {
                        const validSplits = tx.isSplit !== false && Array.isArray(tx.splits)
                          ? tx.splits.filter(sp => (Number(sp?.amount) || 0) > 0)
                          : [];
                        if (validSplits.length > 0) {
                          validSplits.forEach(sp => {
                            const cat = sp.category || tx.category || 'Other';
                            actualByCategory[cat] = (actualByCategory[cat] || 0) + (Number(sp.amount) || 0);
                          });
                        } else {
                          const cat = tx.category || 'Other';
                          actualByCategory[cat] = (actualByCategory[cat] || 0) + (Number(tx.amount) || 0);
                        }
                      });
                      const curMoKey = todayYMD().slice(0, 7);
                      const targetBudgets = selectedMonth
                        ? budgets.filter(b => !b.month || b.month === selectedMonth)
                        : budgets.filter(b => !b.month || b.month === curMoKey);
                      const rows = (targetBudgets.length > 0 ? targetBudgets : budgets).map(b => {
                        const monthMap = selectedMonth
                          ? actualByCategory
                          : ((data.monthlyExpensesByCategory && b.month) ? (data.monthlyExpensesByCategory[b.month] || {}) : actualByCategory);
                        const actual = getCategorySpendFromMap(monthMap, b.category);
                        const pct = b.amount > 0 ? Math.round((actual / b.amount) * 100) : 0;
                        const over = actual > b.amount;
                        const warn = pct >= 80 && !over;
                        const col = over ? '#f87171' : warn ? '#fbbf24' : '#4ade80';
                        return { ...b, actual, pct, col, over, warn };
                      }).sort((a, b) => b.pct - a.pct);
                      return (
                        <div className="bento-item col-span-12" style={{ flexDirection:'column', marginTop:'0.75rem' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                            <span style={{ fontSize:'1.1rem' }}>🎯</span>
                            <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>
                              BUDGET VS ACTUAL {selectedMonth ? `— ${new Date(selectedMonth+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}` : '(All Time)'}
                            </h3>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                            {rows.map(r => (
                              <div key={r.id}>
                                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.35rem' }}>
                                  <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
                                    <span style={{ fontSize:'0.85rem', fontWeight:600 }}>{r.category}</span>
                                    {r.over && <span style={{ fontSize:'0.65rem', background:'rgba(248,113,113,0.15)', color:'var(--mm-danger)', border:'1px solid rgba(248,113,113,0.3)', borderRadius:100, padding:'0.1rem 0.45rem' }}>OVER BUDGET</span>}
                                    {r.warn && <span style={{ fontSize:'0.65rem', background:'rgba(251,191,36,0.12)', color:'var(--mm-warning)', border:'1px solid rgba(251,191,36,0.25)', borderRadius:100, padding:'0.1rem 0.45rem' }}>⚠ {r.pct}%</span>}
                                  </div>
                                  <div style={{ fontSize:'0.82rem', color:r.col }}>
                                    {formatCurrency(r.actual)} <span style={{ color:'var(--text-muted)', fontWeight:400 }}>/ {formatCurrency(r.amount)}</span>
                                  </div>
                                </div>
                                <div style={{ height:8, background:'rgba(255,255,255,0.05)', borderRadius:4, overflow:'hidden' }}>
                                  <div style={{ width:`${Math.min(r.pct,100)}%`, height:'100%', background: r.over ? '#f87171' : r.warn ? '#fbbf24' : '#4ade80', borderRadius:4, transition:'width 0.8s ease', boxShadow:`0 0 6px ${r.col}60` }}/>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </motion.div>
              )}

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
              {activeTab==='cashflow' && (
                <motion.div key="cashflow" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
                  <div className="bento-grid">
                    {forecastLoading ? (
                      <div className="bento-item col-span-12" style={{ alignItems:'center', justifyContent:'center', padding:'3rem' }}>
                        <p className="text-muted" style={{ textAlign:'center' }}>BUILDING FORECAST...</p>
                      </div>
                    ) : (
                      <>
                        {/* Summary cards */}
                        {(() => {
                          const lowestPoint = dailyForecast.reduce((min, p) => p.balance < min.balance ? p : min, dailyForecast[0] || { balance: 0, date: '' });
                          const bestPoint   = dailyForecast.reduce((max, p) => p.balance > max.balance ? p : max, dailyForecast[0] || { balance: 0, date: '' });
                          const netFlow     = dailyForecast.length > 0 ? dailyForecast[dailyForecast.length - 1].balance - dailyForecast[0].balance : 0;
                          return [
                            { label:'LOWEST BALANCE',     val: formatCurrency(lowestPoint.balance), sub: lowestPoint.date, color: lowestPoint.balance < 0 ? '#f87171' : '#fbbf24', icon:'📉' },
                            { label:'HIGHEST BALANCE',    val: formatCurrency(bestPoint.balance),   sub: bestPoint.date,   color:'#4ade80', icon:'📈' },
                            { label:'NET CASH FLOW (60D)',val: (netFlow >= 0 ? '+' : '') + formatCurrency(netFlow), sub:'vs. today', color: netFlow >= 0 ? '#4ade80' : '#f87171', icon:'💰' },
                          ].map((c, i) => (
                            <motion.div key={c.label} className="bento-item col-span-4"
                              initial={{opacity:0,scale:0.95}} animate={{opacity:1,scale:1}} transition={{delay:i*0.08}}
                              style={{ flexDirection:'column', gap:'0.4rem', border:`1px solid ${c.color}22`, background:`linear-gradient(135deg,${c.color}10,transparent)` }}>
                              <div style={{ display:'flex', justifyContent:'space-between' }}>
                                <span style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-secondary)' }}>{c.label}</span>
                                <span style={{ fontSize:'1.1rem' }}>{c.icon}</span>
                              </div>
                              <div style={{ fontWeight:700, fontSize:'1.5rem', color:c.color }}>{c.val}</div>
                              {c.sub && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>{c.sub}</div>}
                            </motion.div>
                          ));
                        })()}

                        {/* 60-day area chart */}
                        <div className="bento-item col-span-12" style={{ flexDirection:'column', minHeight:340 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
                            <CalendarDays size={20} style={{ color:'var(--mm-success)' }}/>
                            <h3 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>60-DAY DAILY BALANCE PROJECTION</h3>
                            <span style={{ marginLeft:'auto', fontSize:'0.68rem', color:'var(--text-secondary)', letterSpacing:'1px' }}>BILLS + RECURRING TRANSACTIONS APPLIED</span>
                          </div>
                          {dailyForecast.length === 0 ? (
                            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <p className="text-muted" >NO ACCOUNT DATA — ADD ACCOUNTS TO SEE FORECAST</p>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height={300}>
                              <AreaChart data={dailyForecast} margin={{ top:10, right:10, left:0, bottom:0 }}>
                                <defs>
                                  <linearGradient id="balGradPos" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.35}/>
                                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                                  </linearGradient>
                                  <linearGradient id="balGradNeg" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%"  stopColor="#f87171" stopOpacity={0.35}/>
                                    <stop offset="95%" stopColor="#f87171" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                                <XAxis dataKey="date" stroke="#444"
                                  tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }}
                                  axisLine={false} tickLine={false}
                                  tickFormatter={v => v.substring(5)} // show MM-DD
                                  interval={Math.floor(dailyForecast.length / 8)}
                                />
                                <YAxis stroke="#444"
                                  tickFormatter={v => `${(v/1000).toFixed(0)}k`}
                                  tick={{ fontFamily:'Inter, sans-serif', fontSize:11 }}
                                  axisLine={false} tickLine={false}
                                />
                                <Tooltip
                                  content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const bal = payload[0]?.value ?? 0;
                                    const isNeg = bal < 0;
                                    return (
                                      <div style={{ background:'var(--hud-bg, rgba(6,8,20,0.95))', border:`1px solid ${isNeg?'rgba(244,63,94,0.4)':'rgba(74,222,128,0.3)'}`, boxShadow:`0 0 20px ${isNeg?'rgba(244,63,94,0.15)':'rgba(74,222,128,0.15)'}`, padding:'0.875rem 1.1rem', borderRadius:'10px', fontSize:'0.8rem' }}>
                                        <p style={{ margin:'0 0 0.4rem', color: isNeg?'var(--mm-danger)':'var(--mm-success)', fontWeight:700 }}>{label}</p>
                                        <div style={{ color: isNeg?'var(--mm-danger)':'#fff', fontWeight:600 }}>{isNeg ? '⚠ ' : ''}{formatCurrency(bal)}</div>
                                      </div>
                                    );
                                  }}
                                />
                                {/* Positive area */}
                                <Area type="monotone" dataKey="balance" name="Balance"
                                  stroke="#4ade80" strokeWidth={2}
                                  fill="url(#balGradPos)"
                                  dot={(props) => {
                                    const { cx, cy, payload } = props;
                                    if (!payload.negative) return null;
                                    return <circle key={`dot-${payload.date}`} cx={cx} cy={cy} r={3} fill="#f87171" stroke="none" style={{ filter:'drop-shadow(0 0 4px #f87171)' }}/>;
                                  }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          )}
                          {/* Red zone legend */}
                          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginTop:'0.75rem', paddingLeft:'0.5rem' }}>
                            <div style={{ width:10, height:10, borderRadius:'50%', background:'var(--mm-danger)', boxShadow:'0 0 6px #f87171' }}/>
                            <span style={{ fontSize:'0.68rem', color:'var(--text-secondary)' }}>RED DOTS = NEGATIVE BALANCE DAYS</span>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

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
                    <SpendingHeatmap dailyData={(data?.allTransactions || []).filter(t => t.type === 'Expense' || t.type === 'Loan Payment').map(t => ({ date: t.date, amount: t.amount }))} />
                    <div style={{ marginTop:'1.5rem', display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(160px,1fr))', gap:'1rem' }}>
                      {(() => {
                        const daily = {};
                        (data?.allTransactions || []).filter(t => t.type === 'Expense' || t.type === 'Loan Payment').forEach(t => { daily[t.date] = (daily[t.date]||0)+t.amount; });
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

              {activeTab==='weekday' && (
                <motion.div key="weekday" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{duration:0.35}}>
                  <div className="bento-grid">
                    <div className="bento-item col-span-8" style={{ flexDirection:'column', padding:'1.75rem' }}>
                      <div style={{ fontSize:'0.75rem', letterSpacing:'0.3px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'1.25rem' }}>AVERAGE SPENDING BY DAY OF WEEK</div>
                      {(() => {
                        const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
                        const totals = [0,0,0,0,0,0,0], counts = [0,0,0,0,0,0,0];
                        (data?.allTransactions || []).filter(t=>t.type==='Expense'||t.type==='Loan Payment').forEach(t => { const dt = parseLocalYMD(t.date); const d = dt ? dt.getDay() : NaN; if(!isNaN(d)){totals[d]+=t.amount;counts[d]++;} });
                        const avgs = totals.map((t,i)=>counts[i]>0?t/counts[i]:0);
                        const maxAvg = Math.max(...avgs, 1);
                        return (
                          <div style={{ display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                            {DAYS.map((day, i) => {
                              const pct=(avgs[i]/maxAvg)*100;
                              const isWeekend=i===0||i===6;
                              const color=avgs[i]===maxAvg?'#f87171':isWeekend?'#fbbf24':'#818cf8';
                              return (
                                <div key={day} style={{ display:'flex', alignItems:'center', gap:'0.75rem' }}>
                                  <div style={{ fontSize:'0.75rem', color:avgs[i]===maxAvg?'var(--mm-danger)':isWeekend?'var(--mm-warning)':'var(--mm-text-3)', width:80, flexShrink:0 }}>{day.slice(0,3).toUpperCase()}</div>
                                  <div style={{ flex:1, height:22, background:'rgba(255,255,255,0.03)', borderRadius:4, overflow:'hidden' }}>
                                    <motion.div initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.8,delay:i*0.06,ease:'easeOut'}}
                                      style={{ height:'100%', background:`linear-gradient(90deg,${color}80,${color})`, borderRadius:4, minWidth:2 }}/>
                                  </div>
                                  <div style={{ fontSize:'0.78rem', fontWeight:600, color, width:100, textAlign:'right', flexShrink:0 }}>
                                    {avgs[i]>0?formatCurrency(avgs[i]):'—'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="bento-item col-span-4" style={{ flexDirection:'column', padding:'1.75rem' }}>
                      <div style={{ fontSize:'0.75rem', letterSpacing:'0.3px', fontWeight:600, color:'var(--text-secondary)', marginBottom:'1.25rem' }}>WEEKEND vs WEEKDAY</div>
                      {(() => {
                        let weekdayTotal=0,weekendTotal=0,weekdayCount=0,weekendCount=0;
                        (data?.allTransactions || []).filter(t=>t.type==='Expense'||t.type==='Loan Payment').forEach(t=>{
                          const dt = parseLocalYMD(t.date);
                          if (!dt) return;
                          const d = dt.getDay();
                          if(d===0||d===6){weekendTotal+=t.amount;weekendCount++;} else {weekdayTotal+=t.amount;weekdayCount++;}
                        });
                        const wdAvg=weekdayCount>0?weekdayTotal/weekdayCount:0;
                        const weAvg=weekendCount>0?weekendTotal/weekendCount:0;
                        const ratio=wdAvg>0?(weAvg/wdAvg):1;
                        return (
                          <div style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
                            {[{label:'WEEKDAYS (avg/day)',val:wdAvg,color:'#818cf8'},{label:'WEEKENDS (avg/day)',val:weAvg,color:'#fbbf24'}].map(k=>(
                              <div key={k.label} style={{ padding:'1rem', background:`${k.color}10`, border:`1px solid ${k.color}25`, borderRadius:10 }}>
                                <div style={{ fontSize:'0.62rem', letterSpacing:'1px', color:'var(--text-muted)', marginBottom:'0.4rem' }}>{k.label}</div>
                                <div style={{ fontWeight:700, fontSize:'1.1rem', color:k.color }}>{formatCurrency(k.val)}</div>
                              </div>
                            ))}
                            <div style={{ padding:'1rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', fontSize:'0.78rem', color:ratio>1.2?'var(--mm-warning)':'var(--mm-success)' }}>
                              {ratio>1.2?`⚠ You spend ${((ratio-1)*100).toFixed(0)}% more on weekends`:'✓ Weekend spending looks controlled'}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Top Weekend Splurge Categories & Smart Targets */}
                    <div className="bento-item col-span-12" style={{ flexDirection:'column', padding:'1.75rem' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.25rem' }}>
                        <div>
                          <div style={{ fontSize:'0.75rem', letterSpacing:'0.3px', fontWeight:600, color:'var(--text-secondary)' }}>TOP WEEKEND SPLURGE CATEGORIES</div>
                          <div style={{ fontSize:'0.72rem', color:'var(--mm-text-3)', marginTop:2 }}>Where discretionary weekend burn rate accumulates</div>
                        </div>
                        <span style={{ fontSize:'0.72rem', padding:'2px 8px', borderRadius:20, background:'rgba(251,191,36,0.15)', color:'var(--mm-warning)', fontWeight:700 }}>SAT & SUN INSIGHTS</span>
                      </div>

                      {(() => {
                        const weekendCats = {};
                        let weekendSum = 0;
                        (data?.allTransactions || []).filter(t=>t.type==='Expense').forEach(t => {
                          const d = new Date(t.date).getDay();
                          if (d === 0 || d === 6) {
                            const cat = t.category || 'General';
                            weekendCats[cat] = (weekendCats[cat] || 0) + Number(t.amount || 0);
                            weekendSum += Number(t.amount || 0);
                          }
                        });

                        const sorted = Object.entries(weekendCats)
                          .sort((a,b) => b[1] - a[1])
                          .slice(0, 4);

                        if (sorted.length === 0) {
                          return <div style={{ color:'var(--mm-text-3)', fontSize:'0.8rem', fontStyle:'italic' }}>Add weekend transactions to unlock lifestyle splurge analysis.</div>;
                        }

                        return (
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'0.85rem' }}>
                            {sorted.map(([cat, total], _idx) => {
  const share = weekendSum > 0 ? Math.round(total / weekendSum * 100) : 0;
  return <div key={cat} style={{
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: '1rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  }}>
                                  <div style={{
      fontSize: '1.6rem'
    }}>{getCategoryEmoji(cat)}</div>
                                  <div style={{
      flex: 1,
      minWidth: 0
    }}>
                                    <div style={{
        fontWeight: 700,
        fontSize: '0.85rem',
        color: 'var(--text-primary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}>{cat}</div>
                                    <div style={{
        fontSize: '0.72rem',
        color: 'var(--mm-text-3)',
        marginTop: 2
      }}>{share}% of all weekend spend</div>
                                  </div>
                                  <div style={{
      fontWeight: 700,
      fontSize: '0.92rem',
      color: 'var(--mm-warning)',
      textAlign: 'right'
    }}>
                                    {formatCurrency(total)}
                                  </div>
                                </div>;
})}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </motion.div>
              )}

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
                const grossIncome = yearTx.filter(tx => tx.type === 'Income').reduce((s, tx) => s + (tx.amount || 0), 0);
                const deductibleTx = yearTx.filter(tx =>
                  tx.type === 'Expense' && (
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
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Tax_Audit_Pack_${targetYear}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success(`Tax Audit CSV exported for ${targetYear}!`);
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