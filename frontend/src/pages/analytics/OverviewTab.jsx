import { lazy, Suspense } from 'react';
import { useT } from '../../i18n';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Legend, AreaChart, Area, ReferenceLine } from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp, Activity, PieChart as PieIcon } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

// Analytics → income vs spending, top categories and the month at a glance.
// Three.js bars (own chunk, loaded with Analytics).
const CashflowBarsScene = lazy(() => import('../../three/CashflowBarsScene'));

export default function OverviewTab({ COLORS, CustomTooltip, data, monthCatData, monthExpense, monthIncome, monthSavings, setActiveTab, setDrillCat }) {
  const t = useT();
  return (
    <>
      <div key="overview">
        <div className="bento-grid">
          {(data.monthlyTrends || []).length > 0 && (
            <figure className="bento-item col-span-12 an3d-card" aria-label={t('an3d.title')}>
              <figcaption className="an3d-head">
                <h2>{t('an3d.title')}</h2>
                <span className="an3d-legend" aria-hidden="true">
                  <span><i className="is-income" />{t('an3d.income')}</span>
                  <span><i className="is-spending" />{t('an3d.spending')}</span>
                </span>
              </figcaption>
              <Suspense fallback={<div className="an3d-stage" />}>
                <CashflowBarsScene className="an3d-stage" months={(data.monthlyTrends || []).slice(-6)} />
              </Suspense>
              <ul className="sr-only">
                {(data.monthlyTrends || []).slice(-6).map((m) => (
                  <li key={m.month}>{t('an3d.summary', { month: m.month, income: formatCurrency(m.Income || 0), spending: formatCurrency(m.Expense || 0) })}</li>
                ))}
              </ul>
            </figure>
          )}
          <div className="bento-item col-span-12" style={{ flexDirection:'column', minHeight:320 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
              <Activity className="text-cyan" size={20}/>
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>CASH FLOW TIMELINE</h2>
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
                      <h2 style={{ margin: 0, letterSpacing: '0.4px', fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        WHERE DID MY MONEY GO? — MONTHLY CASH-FLOW WATERFALL
                      </h2>
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
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>EXPENSE DISTRIBUTION</h2>
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
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>INCOME SOURCES</h2>
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
    </>
  );
}
