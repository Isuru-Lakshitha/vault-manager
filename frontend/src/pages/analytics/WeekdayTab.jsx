import getCategoryEmoji from '../../utils/categoryEmoji';
import { motion } from 'framer-motion';
import { formatCurrency } from '../../utils/format';

// Analytics → spending by day of the week.
export default function WeekdayTab({ data, parseLocalYMD }) {
  return (
    <>
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
    </>
  );
}
