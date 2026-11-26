import { TrendingUp, TrendingDown, Landmark } from 'lucide-react';
import AnimatedCounter from '../../components/AnimatedCounter';
import HealthScoreGauge from '../../components/HealthScoreGauge';
import TiltWrapper from '../../components/TiltWrapper';
import ParticleBackground from '../../components/ParticleBackground';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { motion } from 'framer-motion';
import { formatCurrency } from '../../utils/format';

// Dashboard → 'Net worth': account bento grid and the assets vs debts gauge.
export default function NetWorthSection({ COLORS, CustomTooltip, accounts, assetData, health, incomeExpenseData, loans, netWorth, netWorthTrajectory, netWorthTrend, recentTxns, setShowNWBreakdown, spendingStreak, totalAssets, totalLiabilities }) {
  return (
    <>
      <section className="dash-group">
      <h2 className="dash-section-title">Net worth</h2>
      {/* Main bento grid */}
      <div className="bento bento-grid" style={{ marginBottom:'1.75rem' }}>
        {/* Net Worth — Hero 3D card */}
        <TiltWrapper className="bento-4">
        <motion.div className="bento-card bento-item holographic-card neon-border dash-3d" data-tilt
          onClick={() => setShowNWBreakdown(true)}
          style={{ position:'relative', overflow:'hidden', cursor:'pointer', width:'100%', height:'100%' }}
          initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.05 }}>
          <ParticleBackground count={20} color="#4ade80" opacity={0.5} />
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <h3 className="text-cyan" style={{ letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>NET WORTH</h3>
            <Landmark size={18} className="text-cyan" />
          </div>
          <div className="dash-num dash-kpi-figure" style={{ marginBottom:'0.5rem' }}>
            <AnimatedCounter value={netWorth} formatter={formatCurrency} />
          </div>
          <div style={{ flex:1, minHeight:60 }}>
            {netWorthTrend.length > 1 ? (
              <ResponsiveContainer width="100%" height={60}>
                <AreaChart data={netWorthTrend}>
                  <defs><linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#4ade80" stopOpacity={0.5}/><stop offset="95%" stopColor="#4ade80" stopOpacity={0}/></linearGradient></defs>
                  <Area type="monotone" dataKey="Net Worth" stroke="#4ade80" strokeWidth={2} fill="url(#nwGrad)" dot={false}/>
                  <Tooltip content={<CustomTooltip/>}/>
                </AreaChart>
              </ResponsiveContainer>
            ) : <div style={{ height:60, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.75rem' }}>ADD TRANSACTIONS</div>}
          </div>
          <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', marginTop:'0.5rem', textAlign:'right', letterSpacing:'0.5px' }}>TAP FOR BREAKDOWN ↗</div>
        </motion.div>
        </TiltWrapper>

        {/* Total Assets */}
        <motion.div className="bento-card bento-item bento-4 holographic-card dash-3d" data-tilt initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <h3 className="text-success" style={{ letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>TOTAL ASSETS</h3>
            <TrendingUp size={18} className="text-success" />
          </div>
          <div className="hero-metric dash-num dash-kpi-figure" style={{ marginBottom:'1rem' }}>
            <AnimatedCounter value={totalAssets} formatter={formatCurrency} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
            {accounts.slice(0, 3).map(a => (
              <div key={a.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                <span>{a.name}</span><span style={{ color:'var(--mm-success)' }}>{formatCurrency(a.balance)}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Liabilities */}
        <motion.div className="bento-card bento-item bento-4 holographic-card dash-3d" data-tilt initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} transition={{ delay:0.15 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.75rem' }}>
            <h3 className="text-danger" style={{ letterSpacing:'2px', fontSize:'0.72rem', margin:0 }}>LIABILITIES</h3>
            <TrendingDown size={18} className="text-danger" />
          </div>
          <div className="dash-num dash-neg dash-kpi-figure" style={{ marginBottom:'1rem' }}>
            <AnimatedCounter value={totalLiabilities} formatter={formatCurrency} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.35rem' }}>
            {loans.filter(l => l.status === 'Active').slice(0, 3).map(l => (
              <div key={l.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.75rem', color:'var(--text-secondary)' }}>
                <span>{l.item_name || 'Loan'}</span><span style={{ color:'var(--mm-danger)' }}>{formatCurrency(l.principal_amount)}</span>
              </div>
            ))}
            {loans.filter(l => l.status === 'Active').length === 0 && <div style={{ fontSize:'0.75rem', color:'var(--text-muted)' }}>NO ACTIVE LOANS</div>}
          </div>
        </motion.div>

        {/* Health Score */}
        <motion.div className="bento-card bento-item bento-4" style={{ alignItems:'center' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.2 }}>
          <h3 style={{ fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem', width:'100%', textAlign:'center' }}>FINANCIAL HEALTH</h3>
          <HealthScoreGauge score={health.score} breakdown={health.breakdown} />
        </motion.div>

        {/* Asset Allocation Pie */}
        <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.22 }}>
          <h3 style={{ fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>ASSET ALLOCATION</h3>
          {assetData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart><Pie data={assetData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} stroke="none">
                {assetData.map((_,i) => <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ filter:`drop-shadow(0 0 4px ${COLORS[i%COLORS.length]})` }}/>)}
              </Pie><Tooltip content={<CustomTooltip/>}/></PieChart>
            </ResponsiveContainer>
          ) : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.75rem' }}>ADD ACCOUNTS</div>}
        </motion.div>

        {/* Monthly trend bar */}
        <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.25 }}>
          <h3 style={{ fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>MONTHLY TREND</h3>
          {incomeExpenseData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={incomeExpenseData.slice(-4)}>
                <XAxis dataKey="name" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:10 }} axisLine={false} tickLine={false}/>
                <Tooltip content={<CustomTooltip/>} cursor={{ fill:'rgba(255,255,255,0.03)' }}/>
                <Bar dataKey="Income" fill="#4ade80" radius={[3,3,0,0]}/>
                <Bar dataKey="Expense" fill="#f87171" radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          ) : <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.75rem' }}>NO DATA</div>}
        </motion.div>

        {/* Recent Transactions */}
        <motion.div className="bento-card bento-item bento-12" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.28 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem' }}>
            <h3 style={{ fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:0 }}>RECENT ACTIVITY</h3>
            <a href="/transactions" style={{ fontSize:'0.75rem', color:'var(--mm-success)', textDecoration:'none' }}>VIEW ALL →</a>
          </div>
          {recentTxns.length === 0 ? (
            <p style={{ color:'var(--text-muted)', textAlign:'center', padding:'1.5rem', fontSize:'0.8rem' }}>NO TRANSACTIONS YET</p>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
              {recentTxns.map(tx => {
                const typeColor = tx.type === 'Income' ? '#4ade80' : tx.type === 'Transfer' ? '#8b5cf6' : '#f87171';
                return (
                  <div key={tx.id} style={{ display:'flex', alignItems:'center', padding:'0.7rem 1rem', background:'rgba(255,255,255,0.02)', borderRadius:8, gap:'0.75rem', border:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width:3, height:36, borderRadius:2, background:typeColor, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:'0.875rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{tx.category || tx.type}</div>
                      <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{tx.date}</div>
                    </div>
                    <div style={{ color:typeColor, fontWeight:700, fontSize:'0.875rem', flexShrink:0 }}>
                      {tx.type === 'Expense' || tx.type === 'Loan Payment' ? '-' : '+'}{formatCurrency(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* ── Feature 1: Net Worth Trajectory ───────────────────────── */}
        <motion.div className="bento-card bento-item bento-8" style={{ flexDirection:'column' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.32 }}>
          <h3 style={{ fontSize:'0.78rem', letterSpacing:'0.5px', color:'var(--text-secondary)', margin:'0 0 1rem' }}>NET WORTH TRAJECTORY</h3>
          {netWorthTrajectory.length > 1 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={netWorthTrajectory} margin={{ top:4, right:8, left:0, bottom:0 }}>
                <defs>
                  <linearGradient id="nwtGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#4ade80" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#4ade80" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" stroke="#333" tick={{ fontFamily:'Inter, sans-serif', fontSize:9 }} axisLine={false} tickLine={false}/>
                <YAxis hide domain={['auto','auto']}/>
                <Tooltip content={<CustomTooltip/>}/>
                <Area type="monotone" dataKey="Net Worth" stroke="#4ade80" strokeWidth={2} fill="url(#nwtGrad)" dot={false} activeDot={{ r:4, fill:'#4ade80', strokeWidth:0 }}/>
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-muted)', fontSize:'0.75rem' }}>ADD TRANSACTIONS TO SEE TRAJECTORY</div>
          )}
        </motion.div>

        {/* ── Feature 2: Spending Streak ─────────────────────────────── */}
        <motion.div className="bento-card bento-item bento-4" style={{ flexDirection:'column', justifyContent:'center', alignItems:'center', textAlign:'center' }} initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.35 }}>
          {spendingStreak.streak >= 1 ? (
            <>
              <div style={{ fontSize:'2.5rem', marginBottom:'0.5rem' }}>🔥</div>
              <div style={{
                fontSize:'1.75rem',
                fontWeight:700,
                color: spendingStreak.streak >= 7 ? 'var(--mm-success)' : spendingStreak.streak >= 3 ? 'var(--mm-warning)' : '#ffffff',
                textShadow: 'none',
                lineHeight:1,
                marginBottom:'0.5rem',
              }}>
                {spendingStreak.streak}
              </div>
              <div style={{ fontSize:'0.68rem', letterSpacing:'1.5px', color:'var(--text-secondary)', marginBottom:'0.4rem' }}>DAY STREAK</div>
              <div style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>spending under daily target</div>
              <div style={{ marginTop:'0.75rem', fontSize:'0.7rem', color:'var(--text-muted)' }}>TARGET: {formatCurrency(spendingStreak.target)}/day</div>
            </>
          ) : (
            <>
              <div style={{ fontSize:'2rem', marginBottom:'0.5rem' }}>💡</div>
              <div style={{ fontSize:'0.75rem', letterSpacing:'1px', color:'var(--text-secondary)', marginBottom:'0.5rem' }}>START YOUR STREAK</div>
              <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', lineHeight:1.5 }}>
                Stay under {formatCurrency(spendingStreak.target)}/day today
              </div>
            </>
          )}
        </motion.div>

      </div>

      {/* Net Worth Gauge — Assets vs Liabilities visual ratio */}
      {(totalAssets + totalLiabilities) > 0 && (() => {
        const assetPct = Math.round((totalAssets / (totalAssets + totalLiabilities)) * 100);

        const R = 54, circ = 2 * Math.PI * R;
        const assetDash = (assetPct / 100) * circ;
        const gaugeColor = assetPct >= 70 ? '#4ade80' : assetPct >= 50 ? '#fbbf24' : '#f87171';
        return (
          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} transition={{ delay:0.37 }}
            style={{ position:'relative', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:16, padding:'1.25rem 1.5rem', marginBottom:'1rem', display:'flex', alignItems:'center', gap:'2rem' }}>
            {/* Ring */}
            <div style={{ position:'relative', flexShrink:0 }}>
              <svg width={130} height={130}>
                <circle cx={65} cy={65} r={R} fill="none" stroke="rgba(248,113,113,0.25)" strokeWidth={12}/>
                <circle cx={65} cy={65} r={R} fill="none" stroke={gaugeColor} strokeWidth={12}
                  strokeDasharray={`${assetDash} ${circ - assetDash}`}
                  strokeLinecap="round" transform="rotate(-90 65 65)"
                  style={{ transition:'stroke-dasharray 1.2s ease, stroke 0.4s ease', filter:`drop-shadow(0 0 6px ${gaugeColor}80)` }}/>
                <text x={65} y={60} textAnchor="middle" fill={gaugeColor} fontSize={18} fontFamily="Outfit, sans-serif" fontWeight={700}>{assetPct}%</text>
                <text x={65} y={78} textAnchor="middle" fill="#555" fontSize={9} fontFamily="Outfit, sans-serif">ASSETS</text>
              </svg>
            </div>
            {/* Stats */}
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'0.68rem', letterSpacing:'2px', color:'var(--text-muted)', marginBottom:'0.875rem' }}>NET WORTH RATIO</div>
              <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.8rem' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:gaugeColor, display:'inline-block' }}/> Assets
                  </span>
                  <span style={{ fontWeight:700, color:gaugeColor }}>{formatCurrency(totalAssets)}</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ display:'flex', alignItems:'center', gap:'0.4rem', fontSize:'0.8rem' }}>
                    <span style={{ width:8, height:8, borderRadius:'50%', background:'var(--mm-danger)', display:'inline-block' }}/> Liabilities
                  </span>
                  <span style={{ fontWeight:700, color:'var(--mm-danger)' }}>{formatCurrency(totalLiabilities)}</span>
                </div>
                <div style={{ borderTop:'1px solid rgba(255,255,255,0.06)', paddingTop:'0.5rem', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>Net Worth</span>
                  <span style={{ fontWeight:700, color: netWorth >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)', fontSize:'1rem' }}>{formatCurrency(netWorth)}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setShowNWBreakdown(true)}
              style={{ position:'absolute', right:'1.5rem', top:'1rem', background:'none', border:'none', cursor:'pointer', color:'var(--text-muted)', fontSize:'0.65rem', letterSpacing:'1px' }}>
              DETAILS ↗
            </button>
          </motion.div>
        );
      })()}

      </section>
    </>
  );
}
