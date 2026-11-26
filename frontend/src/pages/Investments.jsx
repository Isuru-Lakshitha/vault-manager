import { useT } from '../i18n';
import { removeItemWithUndo, itemLabel } from '../components/undoToast';
import { PageHeader, Button } from '../components/ui';
import MoreSection from '../components/MoreSection';
import { useState, useEffect } from 'react';
import { InsightInvestments } from '../components/InsightPanels';
import useLiveData from '../utils/useLiveData';
import { motion } from 'framer-motion';
import { Plus, Trash2, TrendingUp, TrendingDown, Edit2, RefreshCw } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import AnimatedCounter from '../components/AnimatedCounter';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { fetchInvestments, createInvestment, updateInvestment, deleteInvestment, fetchAccounts, createTransaction, getCache, fetchExchangeRates } from '../utils/api';
import CurrencyInput from '../components/CurrencyInput';
import toast from 'react-hot-toast';
import { formatCurrency, formatNumber, getCurrencyLabel, getCurrency, convertCurrency } from '../utils/format';
import { todayYMD } from '../utils/dates';

const COLORS = ['#4ade80','#8b5cf6','#818cf8','#fbbf24','#f87171','#38bdf8','#e879f9','#14b8a6'];
const TYPES = ['Stock','Crypto','Fixed Deposit','Bond','Mutual Fund','Real Estate','Other'];
const fmtPct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:'var(--hud-bg, rgba(6,8,20,0.95))', border:'1px solid rgba(74,222,128,0.3)', padding:'0.75rem 1rem', borderRadius:10, fontSize:'0.8rem' }}>
      <p style={{ color:'var(--mm-success)', margin:'0 0 0.3rem', fontWeight:700 }}>{payload[0].name}</p>
      <p style={{ color:'#fff', margin:0 }}>{formatCurrency(payload[0].value)}</p>
    </div>
  );
};

const Investments = () => {
  const t = useT();
  const [investments, setInvestments] = useState(() => getCache('investments') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loading, setLoading] = useState(() => !getCache('investments'));
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [confirm, setConfirm] = useState({ open:false, id:null });
  const [formData, setFormData] = useState({ name:'', symbol:'', type:'Stock', quantity:1, buy_price:0, current_price:0 });
  const [fireMonthly, setFireMonthly] = useState(25000);
  const [fireRate, setFireRate] = useState(12);
  const [fireYears, setFireYears] = useState(10);
  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editingPriceVal, setEditingPriceVal] = useState('');
  const [topUpModal, setTopUpModal] = useState(null);
  const [topUpQty, setTopUpQty] = useState(1);
  const [topUpPrice, setTopUpPrice] = useState(0);
  const [topUpAccountId, setTopUpAccountId] = useState('');

  useEffect(() => { load(!!getCache('investments')); }, []);
  useLiveData(() => load(true));
  const load = async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [invs, accs] = await Promise.all([fetchInvestments(), fetchAccounts().catch(() => [])]);
      setInvestments(invs);
      setAccounts(accs || []);
    }
    catch { toast.error('Failed to load investments'); }
    finally { setLoading(false); }
  };

  const handleQuickPriceSave = async (inv) => {
    const nextPrice = parseFloat(editingPriceVal);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) {
      toast.error('Enter a valid price');
      return;
    }
    try {
      await updateInvestment(inv.id, { ...inv, current_price: nextPrice });
      toast.success(`Updated ${inv.name} price to ${formatCurrency(nextPrice)}`);
      setEditingPriceId(null);
      load(true);
    } catch {
      toast.error('Failed to update price');
    }
  };

  const handleTopUpSubmit = async (e) => {
    e.preventDefault();
    if (!topUpModal) return;
    const addQty = parseFloat(topUpQty);
    const addPrice = parseFloat(topUpPrice);
    if (!Number.isFinite(addQty) || addQty <= 0 || !Number.isFinite(addPrice) || addPrice < 0) {
      toast.error('Enter valid quantity and buy price');
      return;
    }
    try {
      const oldQty = parseFloat(topUpModal.quantity) || 0;
      const oldBuy = parseFloat(topUpModal.buy_price) || 0;
      const newTotalQty = parseFloat((oldQty + addQty).toFixed(6));
      const weightedBuy = newTotalQty > 0
        ? parseFloat((((oldQty * oldBuy) + (addQty * addPrice)) / newTotalQty).toFixed(6))
        : addPrice;
      await updateInvestment(topUpModal.id, {
        ...topUpModal,
        quantity: newTotalQty,
        buy_price: weightedBuy,
        current_price: addPrice > 0 ? addPrice : topUpModal.current_price,
      });
      const totalCost = parseFloat((addQty * addPrice).toFixed(2));
      if (topUpAccountId && totalCost > 0) {
        await createTransaction({
          type: 'Expense',
          amount: totalCost,
          date: todayYMD(),
          category: 'Investments',
          notes: `Bought +${addQty} ${topUpModal.symbol || topUpModal.name} @ ${formatCurrency(addPrice)}`,
          from_account_id: topUpAccountId,
        });
      }
      toast.success(`Added +${addQty} units to ${topUpModal.name} (New avg: ${formatCurrency(weightedBuy)})`);
      setTopUpModal(null);
      load(true);
    } catch {
      toast.error('Failed to top up investment');
    }
  };

  const openAdd = () => { setEditMode(false); setCurrentId(null); setFormData({ name:'', symbol:'', type:'Stock', quantity:1, buy_price:0, current_price:0, purchase_date: todayYMD() }); setIsModalOpen(true); };
  const openEdit = (inv) => { setEditMode(true); setCurrentId(inv.id); setFormData({ name:inv.name, symbol:inv.symbol||'', type:inv.type||'Stock', quantity:inv.quantity, buy_price:inv.buy_price, current_price:inv.current_price, purchase_date: inv.purchase_date || '' }); setIsModalOpen(true); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = { ...formData, quantity: parseFloat(formData.quantity)||1, buy_price: parseFloat(formData.buy_price)||0, current_price: parseFloat(formData.current_price)||0 };
      if (editMode) { await updateInvestment(currentId, data); toast.success('Investment updated'); }
      else { await createInvestment(data); toast.success('Investment added'); }
      setIsModalOpen(false); load();
    } catch { toast.error('Failed to save'); }
  };

  const doDelete = () => {
    const id = confirm.id;
    const item = investments.find(x => String(x.id) === String(id));
    setConfirm({ open: false, id: null });
    removeItemWithUndo({
      key: `investment:${id}`,
      label: itemLabel(item, 'Investment deleted'),
      setItems: setInvestments,
      id,
      commit: () => deleteInvestment(id),
      onCommitted: () => load(),
    });
  };

  // Live price refresh via CoinGecko (free, no API key)
  const [priceRefreshing, setPriceRefreshing] = useState(false);
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState(null);

  const CRYPTO_ID_MAP = {
    BTC:'bitcoin', ETH:'ethereum', BNB:'binancecoin', SOL:'solana', ADA:'cardano',
    XRP:'ripple', DOGE:'dogecoin', DOT:'polkadot', MATIC:'matic-network', AVAX:'avalanche-2',
    LINK:'chainlink', LTC:'litecoin', USDT:'tether', USDC:'usd-coin', SHIB:'shiba-inu',
  };

  const refreshPrices = async () => {
    const cryptos = investments.filter(inv => inv.type === 'Crypto' && inv.symbol);
    if (cryptos.length === 0) { toast('No crypto holdings with symbols to refresh.'); return; }
    setPriceRefreshing(true);
    try {
      const ids = cryptos.map(inv => CRYPTO_ID_MAP[inv.symbol?.toUpperCase()] || inv.symbol?.toLowerCase()).filter(Boolean);
      const uniqueIds = [...new Set(ids)];
      // Each holding is priced in its own currency (older holdings without one
      // were entered in the display currency; they get it stamped below).
      const curOf = inv => (inv.currency || getCurrency() || 'USD');
      const vsCurs = [...new Set([...cryptos.map(inv => curOf(inv).toLowerCase()), 'usd'])];
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=${vsCurs.join(',')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('API error');
      const data = await res.json();

      const needsUsdConversion = cryptos.some(inv => {
        const cgId = CRYPTO_ID_MAP[inv.symbol?.toUpperCase()] || inv.symbol?.toLowerCase();
        const pd = data[cgId];
        const cur = curOf(inv).toLowerCase();
        return pd && pd[cur] == null && pd['usd'] != null && cur !== 'usd';
      });
      const fxRates = needsUsdConversion ? await fetchExchangeRates().catch(() => null) : null;

      // Update each matching investment
      const updates = [];
      for (const inv of cryptos) {
        const cgId = CRYPTO_ID_MAP[inv.symbol?.toUpperCase()] || inv.symbol?.toLowerCase();
        const priceData = data[cgId];
        if (priceData) {
          const invCur = curOf(inv);
          const baseCur = invCur.toLowerCase();
          let newPrice = priceData[baseCur];
          if (newPrice == null && priceData['usd'] != null) {
            if (baseCur === 'usd') newPrice = priceData['usd'];
            else if (fxRates) {
              const converted = convertCurrency(priceData['usd'], 'USD', invCur, fxRates);
              if (Number.isFinite(converted)) newPrice = converted;
            }
          }
          if (Number.isFinite(newPrice) && (Math.abs(newPrice - inv.current_price) > 0.0001 || !inv.currency)) {
            updates.push(updateInvestment(inv.id, { ...inv, currency: invCur, current_price: newPrice }));
          }
        }
      }
      await Promise.all(updates);
      setPricesUpdatedAt(new Date().toLocaleTimeString());
      await load();
      toast.success(`📈 Prices refreshed for ${updates.length} holding(s)`);
    } catch (err) {
      console.error('Price refresh failed:', err);
      toast.error('Price refresh failed. Check connection.');
    } finally {
      setPriceRefreshing(false);
    }
  };

  // Portfolio calculations
  const totalInvested = investments.reduce((s, inv) => s + (inv.buy_price * inv.quantity), 0);
  const totalCurrent  = investments.reduce((s, inv) => s + (inv.current_price * inv.quantity), 0);
  const totalPnL      = totalCurrent - totalInvested;
  const totalPnLPct   = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;
  const pieData = investments.map(inv => ({ name: inv.name, value: inv.current_price * inv.quantity }));

  
  return (
    <PageWrapper>
      <div>
        <PageHeader title={t('nav.investments')} subtitle={t('sub.investments')}>
          {pricesUpdatedAt && <span className="ui-header-note">Updated {pricesUpdatedAt}</span>}
          <Button icon={RefreshCw} loading={priceRefreshing} onClick={refreshPrices}>{priceRefreshing ? t('btn.refreshing') : t('btn.refreshPrices')}</Button>
          <Button variant="primary" icon={Plus} onClick={openAdd}>{t('btn.addInvestment')}</Button>
        </PageHeader>

        {loading ? <SkeletonLoader rows={4} height={100} /> : (
          <>
            <InsightInvestments investments={investments} />
            {/* Portfolio summary */}
            <div className="bento-grid" style={{ marginBottom:'1.5rem' }}>
              {[
                { label:'TOTAL INVESTED', val:totalInvested, color:'#818cf8' },
                { label:'CURRENT VALUE', val:totalCurrent, color:'#4ade80' },
                { label:'TOTAL P&L', val:totalPnL, color: totalPnL >= 0 ? '#4ade80' : '#f87171' },
              ].map((k) => (
                <div key={k.label} className="bento-item col-span-4"
                  style={{ flexDirection:'column', border:'1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', background:'var(--bg-surface)' }}>
                  <div style={{ fontSize:'0.68rem', letterSpacing:'0.04em', color:'var(--text-secondary)', marginBottom:'0.4rem', fontWeight:600 }}>{k.label}</div>
                  <div style={{ fontWeight:700, fontSize:'1.5rem', color:k.color }}>
                    {k.label === 'TOTAL P&L' ? (
                      <>{totalPnL >= 0 ? '+' : ''}{formatCurrency(totalPnL)} <span style={{ fontSize:'0.88rem' }}>({fmtPct(totalPnLPct)})</span></>
                    ) : <AnimatedCounter value={k.val} formatter={formatCurrency} />}
                  </div>
                </div>
              ))}
              {/* 4th KPI — Best performer */}
              {investments.length > 0 && (() => {
                const best = investments.reduce((b, inv) => {
                  const pct = inv.buy_price > 0 ? ((inv.current_price - inv.buy_price) / inv.buy_price) * 100 : 0;
                  const bpct = b.buy_price > 0 ? ((b.current_price - b.buy_price) / b.buy_price) * 100 : 0;
                  return pct > bpct ? inv : b;
                }, investments[0]);
                const pct = best.buy_price > 0 ? ((best.current_price - best.buy_price) / best.buy_price) * 100 : 0;
                return (
                  <motion.div className="bento-item col-span-6" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.3, type:'spring', stiffness:300 }}
                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', border:'1px solid rgba(74,222,128,0.15)', background:'linear-gradient(135deg,rgba(74,222,128,0.06),transparent)', padding:'1rem 1.5rem' }}>
                    <div>
                      <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.3rem' }}>🏆 BEST PERFORMER</div>
                      <div style={{ fontWeight:700, fontSize:'1rem' }}>{best.name} {best.symbol && <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>({best.symbol})</span>}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{best.type} · {best.quantity} units</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:700, fontSize:'1.4rem', color: pct >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>{fmtPct(pct)}</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{formatCurrency(best.current_price * best.quantity)}</div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* 5th KPI — Worst performer */}
              {investments.length > 1 && (() => {
                const worst = investments.reduce((w, inv) => {
                  const pct = inv.buy_price > 0 ? ((inv.current_price - inv.buy_price) / inv.buy_price) * 100 : 0;
                  const wpct = w.buy_price > 0 ? ((w.current_price - w.buy_price) / w.buy_price) * 100 : 0;
                  return pct < wpct ? inv : w;
                }, investments[0]);
                const pct = worst.buy_price > 0 ? ((worst.current_price - worst.buy_price) / worst.buy_price) * 100 : 0;
                return (
                  <motion.div className="bento-item col-span-6" initial={{ opacity:0, y:16 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.32, type:'spring', stiffness:300 }}
                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', border:'1px solid rgba(248,113,113,0.15)', background:'linear-gradient(135deg,rgba(248,113,113,0.06),transparent)', padding:'1rem 1.5rem' }}>
                    <div>
                      <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.3rem' }}>📉 WORST PERFORMER</div>
                      <div style={{ fontWeight:700, fontSize:'1rem' }}>{worst.name} {worst.symbol && <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>({worst.symbol})</span>}</div>
                      <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', marginTop:'0.2rem' }}>{worst.type} · {worst.quantity} units</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:700, fontSize:'1.4rem', color: pct >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>{fmtPct(pct)}</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>{formatCurrency(worst.current_price * worst.quantity)}</div>
                    </div>
                  </motion.div>
                );
              })()}

              <div className="bento-item col-span-6" style={{ flexDirection:'column' }}>
                <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-secondary)', marginBottom:'0.75rem' }}>ALLOCATION</div>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} stroke="none">
                        {pieData.map((_,i) => <Cell key={i} fill={COLORS[i%COLORS.length]} style={{ filter:`drop-shadow(0 0 4px ${COLORS[i%COLORS.length]})` }}/>)}
                      </Pie>
                      <Tooltip content={<CustomTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                ) : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.8rem' }}>NO INVESTMENTS</div>}
              </div>
              <div className="bento-item col-span-6" style={{ flexDirection:'column', padding:'1.5rem' }}>
                <div style={{ fontSize:'0.65rem', letterSpacing:'2px', color:'var(--text-secondary)', marginBottom:'0.875rem' }}>BY TYPE</div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.7rem', overflowY:'auto', maxHeight:200 }}>
                  {Object.entries(investments.reduce((acc, inv) => {
                    acc[inv.type] = (acc[inv.type]||0) + inv.current_price * inv.quantity; return acc;
                  }, {})).sort(([,a],[,b]) => b - a).map(([type, val], i) => {
                    const pct = totalCurrent > 0 ? (val / totalCurrent) * 100 : 0;
                    return (
                      <div key={type}>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', marginBottom:'0.3rem' }}>
                          <span style={{ color:COLORS[i%COLORS.length] }}>● {type}</span>
                          <span style={{ color:'var(--mm-text-2)' }}>{formatCurrency(val)} <span style={{ color:'var(--text-muted)', fontSize:'0.7rem' }}>({Math.round(pct)}%)</span></span>
                        </div>
                        <div style={{ height:4, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                          <motion.div initial={{ width:0 }} animate={{ width:`${pct}%` }} transition={{ duration:0.8, ease:'easeOut' }}
                            style={{ height:'100%', background:COLORS[i%COLORS.length], borderRadius:2, boxShadow:`0 0 6px ${COLORS[i%COLORS.length]}60` }}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Cost vs Current Value chart */}
            {investments.length > 0 && (() => {
              const chartData = investments.map(inv => ({
                name: inv.symbol || inv.name.slice(0,8),
                Cost: parseFloat((inv.buy_price * inv.quantity).toFixed(2)),
                Value: parseFloat((inv.current_price * inv.quantity).toFixed(2)),
              }));
              return (
                <div className="hud-panel" style={{ padding:'1.25rem 1.5rem', marginBottom:'1rem' }}>
                  <div style={{ fontSize:'0.68rem', letterSpacing:'2px', color:'var(--text-secondary)', marginBottom:'1rem' }}>📊 COST vs CURRENT VALUE BY HOLDING</div>
                  <div style={{ height:180, overflowX:'auto' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top:5, right:10, left:0, bottom:5 }} barGap={2}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false}/>
                        <XAxis dataKey="name" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false}/>
                        <YAxis stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
                        <Tooltip content={<CustomTooltip/>}/>
                        <Bar dataKey="Cost" fill="#8b5cf6" radius={[3,3,0,0]} maxBarSize={24} fillOpacity={0.7}/>
                        <Bar dataKey="Value" fill="#4ade80" radius={[3,3,0,0]} maxBarSize={24}>
                          {chartData.map((entry, i) => (
                            <Cell key={i} fill={entry.Value >= entry.Cost ? '#4ade80' : '#f87171'}/>
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={{ display:'flex', gap:'1.25rem', marginTop:'0.5rem' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><div style={{ width:10, height:10, borderRadius:2, background:'#8b5cf6' }}/><span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>Cost</span></div>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}><div style={{ width:10, height:10, borderRadius:2, background:'var(--mm-success)' }}/><span style={{ fontSize:'0.68rem', color:'var(--text-muted)' }}>Current (green = gain, red = loss)</span></div>
                  </div>
                </div>
              );
            })()}

            {/* Holdings list */}
            <div className="hud-panel" style={{ padding:'0.75rem' }}>
              <div style={{ overflowX:'auto' }}>
                <table tabIndex={0} aria-label="Holdings" style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' }}>
                  <thead><tr style={{ borderBottom:'1px solid rgba(74,222,128,0.15)' }}>
                    {['Name','Type','Qty','Buy Price','Current Price','Value','P&L','CAGR',''].map(h => (
                      <th key={h || 'actions'} style={{ textAlign:'left', padding:'0.6rem 1rem', color:'var(--text-muted)', fontWeight:600, fontSize:'0.7rem', letterSpacing:'1px' }}>{h || <span className="sr-only">Actions</span>}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {investments.length === 0 && (
                      <tr><td colSpan={9} style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)' }}>NO HOLDINGS. ADD YOUR FIRST INVESTMENT.</td></tr>
                    )}
                    {investments.map((inv, i) => {
                      const pnl = (inv.current_price - inv.buy_price) * inv.quantity;
                      const pnlPct = inv.buy_price > 0 ? ((inv.current_price - inv.buy_price) / inv.buy_price) * 100 : 0;
                      const pnlColor = pnl >= 0 ? '#4ade80' : '#f87171';
                      // CAGR calculation
                      let cagr = null, heldLabel = null;
                      if (inv.purchase_date && inv.buy_price > 0 && inv.current_price > 0) {
                        const years = (new Date() - new Date(inv.purchase_date)) / (1000*60*60*24*365.25);
                        if (years > 0.05) { // at least ~18 days
                          cagr = (Math.pow(inv.current_price / inv.buy_price, 1/years) - 1) * 100;
                          const days = Math.floor(years * 365.25);
                          heldLabel = days < 365 ? `${days}d` : `${Math.floor(years)}y ${Math.floor((years % 1) * 12)}m`;
                        }
                      }
                      return (
                        <motion.tr key={inv.id} initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:i*0.04 }}
                          style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', background:i%2===0?'rgba(255,255,255,0.01)':'transparent' }}>
                          <td style={{ padding:'0.75rem 1rem' }}>
                            <div style={{ fontWeight:700, color:'var(--text-primary)' }}>{inv.name}</div>
                            {inv.symbol && <div style={{ fontSize:'0.7rem', color:'var(--text-secondary)' }}>{inv.symbol}</div>}
                          </td>
                          <td style={{ padding:'0.75rem 1rem' }}><span style={{ background:'rgba(129,140,248,0.15)', color:'#a78bfa', padding:'0.15rem 0.5rem', borderRadius:5, fontSize:'0.72rem' }}>{inv.type}</span></td>
                          <td style={{ padding:'0.75rem 1rem', color:'var(--mm-text-2)' }}>{formatNumber(inv.quantity)}</td>
                          <td style={{ padding:'0.75rem 1rem', color:'var(--mm-text-2)' }}>{formatCurrency(inv.buy_price)}</td>
                          <td style={{ padding:'0.75rem 1rem', color:'var(--mm-success)', fontWeight:600 }}>
                            {editingPriceId === inv.id ? (
                              <div style={{ display:'flex', alignItems:'center', gap:'0.3rem' }}>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={editingPriceVal}
                                  onChange={e => setEditingPriceVal(e.target.value)}
                                  style={{ width:95, padding:'0.22rem 0.45rem', fontSize:'0.76rem', borderRadius:6 }}
                                  autoFocus
                                />
                                <button type="button" className="btn btn-primary" style={{ padding:'0.2rem 0.45rem', fontSize:'0.7rem' }} onClick={() => handleQuickPriceSave(inv)}>✓</button>
                                <button type="button" className="btn btn-secondary" style={{ padding:'0.2rem 0.45rem', fontSize:'0.7rem' }} onClick={() => setEditingPriceId(null)}>✕</button>
                              </div>
                            ) : (
                              <div style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
                                <span>{formatCurrency(inv.current_price)}</span>
                                <button
                                  type="button"
                                  onClick={() => { setEditingPriceId(inv.id); setEditingPriceVal(String(inv.current_price || 0)); }}
                                  title="Quick edit current price"
                                  style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:5, color:'var(--text-muted)', fontSize:'0.65rem', padding:'0.1rem 0.35rem', cursor:'pointer' }}
                                >
                                  ✎
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'0.75rem 1rem', fontWeight:700, color:'var(--text-primary)' }}>{formatCurrency(inv.current_price * inv.quantity)}</td>
                          <td style={{ padding:'0.75rem 1rem', color:pnlColor, fontWeight:700 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:'0.2rem' }}>
                              {pnl >= 0 ? <TrendingUp size={12} style={{ marginRight:2 }}/> : <TrendingDown size={12} style={{ marginRight:2 }}/>}
                              {formatCurrency(Math.abs(pnl))} <span style={{ fontSize:'0.72rem' }}>({fmtPct(pnlPct)})</span>
                            </div>
                            <div style={{ height:3, width:80, background:'rgba(255,255,255,0.05)', borderRadius:2, overflow:'hidden' }}>
                              <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(Math.abs(pnlPct), 100)}%` }} transition={{ duration:0.8, delay:i*0.04, ease:'easeOut' }}
                                style={{ height:'100%', background:pnlColor, borderRadius:2, boxShadow:`0 0 4px ${pnlColor}60` }}/>
                            </div>
                          </td>
                          <td style={{ padding:'0.75rem 1rem' }}>
                            {cagr !== null ? (
                              <div>
                                <div style={{ fontWeight:700, fontSize:'0.82rem', color: cagr >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>
                                  {cagr >= 0 ? '+' : ''}{cagr.toFixed(1)}%/yr
                                </div>
                                <div style={{ fontSize:'0.65rem', color:'var(--text-muted)' }}>held {heldLabel}</div>
                              </div>
                            ) : (
                              <span style={{ fontSize:'0.7rem', color:'var(--text-muted)' }}>—</span>
                            )}
                          </td>
                          <td style={{ padding:'0.75rem 1rem' }}>
                            <div style={{ display:'flex', gap:'0.3rem', alignItems:'center' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setTopUpModal(inv);
                                  setTopUpQty(1);
                                  setTopUpPrice(inv.current_price || inv.buy_price || 0);
                                  setTopUpAccountId('');
                                }}
                                style={{ padding:'0.25rem 0.55rem', borderRadius:6, background:'rgba(74,222,128,0.12)', border:'1px solid rgba(74,222,128,0.3)', color:'var(--mm-success)', fontSize:'0.7rem', fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
                                title={`Buy more ${inv.name}`}
                              >
                                + Buy
                              </button>
                              <button className="icon-btn" aria-label={`Edit investment ${inv.name}`} onClick={() => openEdit(inv)}><Edit2 size={14}/></button>
                              <button className="icon-btn" aria-label={`Delete investment ${inv.name}`} style={{ color:'var(--danger)' }} onClick={() => setConfirm({ open:true, id:inv.id })}><Trash2 size={14}/></button>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <MoreSection title="FIRE & compound growth projector" hint="Optional">
            {/* Compound Wealth & FIRE (Financial Independence) Projector */}
            {(() => {
              const months = Math.max(1, fireYears * 12);
              const r = (fireRate / 100) / 12;
              const pv = totalCurrent || 0;
              const pmt = Math.max(0, Number(fireMonthly) || 0);
              const futureValue = r === 0
                ? pv + (pmt * months)
                : pv * Math.pow(1 + r, months) + pmt * ((Math.pow(1 + r, months) - 1) / r);
              const totalPrincipal = pv + (pmt * months);
              const compoundGain = Math.max(0, futureValue - totalPrincipal);
              const gainPct = futureValue > 0 ? (compoundGain / futureValue) * 100 : 0;
              const fireMonthlyPassive = (futureValue * 0.04) / 12;

              return (
                <div className="bento-item col-span-12 heavy-section-deferred" style={{ flexDirection: 'column', gap: '1.1rem', marginTop: '1.5rem', padding: '1.5rem', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', background: 'var(--bg-surface)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 700, letterSpacing: '1px', color: 'var(--mm-success)' }}>
                        🚀 COMPOUND WEALTH & FIRE PROJECTOR
                      </h2>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                        Starting from your current portfolio ({formatCurrency(pv)}) with monthly compounding
                      </span>
                    </div>
                    <span style={{ padding: '0.25rem 0.7rem', borderRadius: 20, background: 'rgba(129,140,248,0.14)', border: '1px solid rgba(129,140,248,0.3)', color: '#818cf8', fontSize: '0.72rem', fontWeight: 700 }}>
                      4% Safe Withdrawal Rule
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', alignItems: 'center' }}>
                    {/* Sliders / Inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Monthly Investment ({getCurrencyLabel()})</span>
                          <strong style={{ color: 'var(--mm-success)' }}>{formatCurrency(fireMonthly)}</strong>
                        </div>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1000"
                          aria-label="Monthly investment"
                          value={fireMonthly}
                          onChange={e => setFireMonthly(parseFloat(e.target.value) || 0)}
                          style={{ width: '100%' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Expected Annual Return (APY)</span>
                          <strong style={{ color: '#818cf8' }}>{fireRate}% / yr</strong>
                        </div>
                        <input
                          type="range"
                          min="2"
                          max="30"
                          aria-label="Expected annual return (percent)"
                          step="0.5"
                          value={fireRate}
                          onChange={e => setFireRate(parseFloat(e.target.value))}
                          style={{ width: '100%', accentColor: '#818cf8' }}
                        />
                      </div>

                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', marginBottom: '0.3rem' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Time Horizon</span>
                          <strong style={{ color: 'var(--mm-warning)' }}>{fireYears} Years</strong>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="35"
                          aria-label="Time horizon (years)"
                          step="1"
                          value={fireYears}
                          onChange={e => setFireYears(parseInt(e.target.value, 10))}
                          style={{ width: '100%', accentColor: 'var(--mm-warning)' }}
                        />
                      </div>
                    </div>

                    {/* Results Cards */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'rgba(0,0,0,0.28)', borderRadius: 14, padding: '1.15rem', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', letterSpacing: '1px' }}>
                          PROJECTED WEALTH IN {fireYears} YEARS
                        </div>
                        <div style={{ fontSize: '1.85rem', fontWeight: 800, color: 'var(--mm-success)', marginTop: '0.15rem' }}>
                          {formatCurrency(futureValue)}
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Total Principal</div>
                          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(totalPrincipal)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>Compound Growth</div>
                          <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#a78bfa' }}>+{formatCurrency(compoundGain)}</div>
                        </div>
                      </div>

                      {/* Principal vs Compound Growth Bar */}
                      <div>
                        <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex' }}>
                          <div style={{ width: `${100 - gainPct}%`, background: '#4ade80' }} />
                          <div style={{ width: `${gainPct}%`, background: '#a78bfa' }} />
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          <span style={{ color: 'var(--mm-success)' }}>Principal {(100 - gainPct).toFixed(0)}%</span>
                          <span style={{ color: '#a78bfa' }}>Compound Interest {gainPct.toFixed(0)}%</span>
                        </div>
                      </div>

                      <div style={{ background: 'rgba(129,140,248,0.1)', border: '1px solid rgba(129,140,248,0.25)', borderRadius: 10, padding: '0.6rem 0.8rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.74rem', color: '#d1d1e0' }}>🏖️ Est. FIRE Passive Income:</span>
                        <strong style={{ fontSize: '0.9rem', color: '#818cf8' }}>{formatCurrency(fireMonthlyPassive)} / mo</strong>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
            </MoreSection>

          </>
        )}
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Investment' : 'Add Investment'}>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'1rem' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'0.75rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>Name</label><input required value={formData.name} onChange={e => setFormData({...formData,name:e.target.value})} placeholder="e.g. Apple Inc."/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>Symbol (optional)</label><input value={formData.symbol} onChange={e => setFormData({...formData,symbol:e.target.value})} placeholder="e.g. AAPL"/></div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>Type</label>
            <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
              {TYPES.map(t => (
                <button key={t} type="button" onClick={() => setFormData({...formData,type:t})}
                  style={{ padding:'0.35rem 0.75rem', borderRadius:7, border:'none', cursor:'pointer', fontSize:'0.75rem',
                    background: formData.type===t ? 'linear-gradient(135deg,#818cf8,#a78bfa)' : 'rgba(255,255,255,0.05)',
                    color: formData.type===t ? '#fff' : 'var(--mm-text-3)' }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(95px, 1fr))', gap:'0.75rem' }}>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>Quantity</label><input type="number" step="any" min="0" required value={formData.quantity} onChange={e => setFormData({...formData,quantity:e.target.value})}/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>{`Buy Price (${getCurrencyLabel()})`}</label><input type="number" step="any" min="0" required value={formData.buy_price} onChange={e => setFormData({...formData,buy_price:e.target.value})}/></div>
            <div><label style={{ display:'block', marginBottom:'0.4rem', fontSize:'0.82rem' }}>{`Current Price (${getCurrencyLabel()})`}</label><input type="number" step="any" min="0" required value={formData.current_price} onChange={e => setFormData({...formData,current_price:e.target.value})}/></div>
          </div>
          <div>
            <label style={{ display:'block', marginBottom:'0.4rem' }}>Purchase Date <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>(for CAGR calc, optional)</span></label>
            <input type="date" value={formData.purchase_date || ''} onChange={e => setFormData({...formData, purchase_date:e.target.value})}/>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem', marginTop:'0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{editMode ? 'Update' : 'Add'}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!topUpModal} onClose={() => setTopUpModal(null)} title={`Buy / Top-Up — ${topUpModal?.name || ''}`}>
        {topUpModal && (() => {
          const oldQty = parseFloat(topUpModal.quantity) || 0;
          const oldBuy = parseFloat(topUpModal.buy_price) || 0;
          const addQty = parseFloat(topUpQty) || 0;
          const addPrice = parseFloat(topUpPrice) || 0;
          const nextQty = oldQty + addQty;
          const nextAvg = nextQty > 0 ? ((oldQty * oldBuy) + (addQty * addPrice)) / nextQty : oldBuy;
          return (
            <form onSubmit={handleTopUpSubmit} style={{ display:'flex', flexDirection:'column', gap:'0.9rem' }}>
              <div style={{ padding:'0.75rem 1rem', borderRadius:10, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', fontSize:'0.78rem', display:'flex', justifyContent:'space-between', flexWrap:'wrap', gap:'0.5rem' }}>
                <span>Current: <strong>{formatNumber(oldQty)} units</strong> @ {formatCurrency(oldBuy)}</span>
                <span style={{ color:'var(--mm-success)' }}>New Avg Buy: <strong>{formatCurrency(nextAvg)}</strong> ({formatNumber(nextQty)} units)</span>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0.75rem' }}>
                <div>
                  <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>Additional Quantity</label>
                  <input type="number" step="any" min="0.000001" required value={topUpQty} onChange={e => setTopUpQty(e.target.value)} style={{ width:'100%' }} />
                </div>
                <div>
                  <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>{`Buy Price / Unit (${getCurrencyLabel()})`}</label>
                  <CurrencyInput value={topUpPrice} onChange={v => setTopUpPrice(v)} />
                </div>
              </div>
              {accounts.length > 0 && (
                <div>
                  <label style={{ display:'block', marginBottom:'0.35rem', fontSize:'0.8rem' }}>Deduct Total Cost ({formatCurrency(addQty * addPrice)}) From Account (optional)</label>
                  <select value={topUpAccountId} onChange={e => setTopUpAccountId(e.target.value)} style={{ width:'100%' }}>
                    <option value="">Do not deduct from bank account</option>
                    {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
                  </select>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'flex-end', gap:'0.75rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setTopUpModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">+ Confirm Top-Up</button>
              </div>
            </form>
          );
        })()}
      </Modal>

      <ConfirmDialog open={confirm.open} title="Delete Investment" message="Remove this holding from your portfolio?" confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm({ open:false, id:null })} />
    </PageWrapper>
  );
};

export default Investments;