import { getCategorySpendFromMap } from '../../utils/api';
import { Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import { formatCurrency } from '../../utils/format';
import { todayYMD } from '../../utils/dates';
import { isInternalMove } from '../../utils/ledgerReporting.js';

// Analytics → month-by-month trends.
export default function TrendsTab({ CustomTooltip, budgets, data, filteredTxns, selectedMonth }) {
  return (
    <>
      <motion.div key="trends" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:0.25}}>
        <div className="bento-grid">
          <div className="bento-item col-span-12" style={{ flexDirection:'column', minHeight:320 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
              <BarChart2 className="text-success" size={18}/>
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>INCOME VS EXPENSES</h2>
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
            <h2 style={{ margin:'0 0 1.25rem', letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600, color:'var(--mm-success)' }}>MONTH-OVER-MONTH</h2>
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
            filteredTxns.filter(tx => !isInternalMove(tx) && (tx.type === 'Expense' || tx.type === 'Loan Payment')).forEach(tx => {
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
                  <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>
                    BUDGET VS ACTUAL {selectedMonth ? `— ${new Date(selectedMonth+'-01').toLocaleDateString('en-US',{month:'long',year:'numeric'})}` : '(All Time)'}
                  </h2>
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
    </>
  );
}
