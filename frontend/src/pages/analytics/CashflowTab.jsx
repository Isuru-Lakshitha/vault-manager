import { Tooltip, ResponsiveContainer, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts';
import { motion } from 'framer-motion';
import { CalendarDays } from 'lucide-react';
import { formatCurrency } from '../../utils/format';

// Analytics → money in vs money out over time.
export default function CashflowTab({ dailyForecast, forecastLoading }) {
  return (
    <>
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
    </>
  );
}
