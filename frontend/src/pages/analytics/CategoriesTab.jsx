import { fetchBudgets, createBudget, updateBudget } from '../../utils/api';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { motion } from 'framer-motion';
import { BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/format';
import { todayYMD } from '../../utils/dates';
import { isInternalMove } from '../../utils/ledgerReporting.js';

// Analytics → category breakdown and drill-down.
export default function CategoriesTab({ COLORS, CustomTooltip, budgets, data, drillCat, filteredTxns, monthCatData, navigate, selectedMonth, setBudgets, setDrillCat }) {
  return (
    <>
      <div key="categories">
        <div className="bento-grid">
          <div className="bento-item col-span-8" style={{ flexDirection:'column', minHeight:400 }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.6rem', marginBottom:'1.25rem' }}>
              <BarChart2 className="text-cyan" size={18}/>
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600 }}>TOP EXPENSE CATEGORIES</h2>
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
              <h2 style={{ margin:0, letterSpacing:'0.3px', fontSize:'0.85rem', fontWeight:600, color:'var(--mm-success)' }}>BREAKDOWN</h2>
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
            filteredTxns.filter(t => !isInternalMove(t) && (t.type === 'Expense' || t.type === 'Loan Payment')).forEach(t => {
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
                  <h2 style={{ margin:0, fontSize:'1rem', fontWeight:700, color:catColor }}>{drillCat}</h2>
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
    </>
  );
}
