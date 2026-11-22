import { updateRecurringTransaction } from '../../utils/api';
import { todayYMD } from '../../utils/dates';
import { TrendingUp, TrendingDown, Landmark, Activity, Zap, ChevronDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import AnimatedCounter from '../../components/AnimatedCounter';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { motion } from 'framer-motion';
import { formatCurrency, haptic } from '../../utils/format';
import getCategoryEmoji from '../../utils/categoryEmoji';
import toast from 'react-hot-toast';

// Dashboard → the Overview view (net worth, safe-to-spend, monthly KPIs, recent activity).
export default function OverviewView({ monthlyExpense, monthlyIncome, navigate, netWorth, netWorthTrend, recentTxns, recurringRules, safeToSpendData, savingsRate, setPopupTx, setRecurringRules, setShowAdvancedInsights, setShowNWBreakdown, setSummaryPopup, showAdvancedInsights, t, totalAssets, totalLiabilities }) {
  return (
    <>
      <>
        {/* 1. Hero: 3D net worth card + today's safe-to-spend */}
        <section className="dash-hero" aria-label="Net worth and daily allowance">
          <div
            className="dash-3d dash-nw"
            data-tilt
            role="button"
            tabIndex={0}
            title="Open net worth breakdown"
            onClick={() => { haptic(); setShowNWBreakdown(true); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowNWBreakdown(true); } }}
          >
            <div className="dash-3d-bg" aria-hidden="true">
              <div className="dash-nw-grid" />
              <div className="dash-nw-orb" />
              <div className="dash-nw-orb is-alt" />
            </div>
            <div className="dash-card-head z1">
              <span className="dash-eyebrow">{t('dash.netWorth')}</span>
              <span className="dash-icon-chip"><Landmark size={18} /></span>
            </div>
            <div className="dash-nw-value dash-num z3">
              <AnimatedCounter value={netWorth} formatter={formatCurrency} />
            </div>
            <div className="dash-nw-split z2">
              <div className="dash-ratio" aria-hidden="true">
                <span style={{ flex: Math.max(totalAssets, 0) || 1, background: 'var(--dash-pos)' }} />
                {totalLiabilities > 0 && <span style={{ flex: totalLiabilities, background: 'var(--dash-neg)', animationDelay: '0.4s' }} />}
              </div>
              <div className="dash-nw-legend">
                <span><i className="dash-pos" />Assets <b className="dash-pos">{formatCurrency(totalAssets)}</b></span>
                <span><i className="dash-neg" />Debt <b className="dash-neg">{formatCurrency(totalLiabilities)}</b></span>
              </div>
            </div>
            {netWorthTrend.length > 1 && (
              <div className="dash-nw-spark z1" aria-hidden="true">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={netWorthTrend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="dashNwGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--dash-accent)" stopOpacity={0.35}/><stop offset="100%" stopColor="var(--dash-accent)" stopOpacity={0}/></linearGradient></defs>
                    <Area type="monotone" dataKey="Net Worth" stroke="var(--dash-accent)" strokeWidth={2} fill="url(#dashNwGrad)" dot={false} isAnimationActive />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
            <span className="dash-hint z1">{t('dash.breakdown')} <ArrowRight size={13} /></span>
          </div>

          {(() => {
            const allowance = safeToSpendData?.dailyAllowance || 0;
            const daysLeft = safeToSpendData?.daysRemainingInMonth || 0;
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const R = 34, C = 2 * Math.PI * R;
            const frac = Math.min(1, Math.max(0, daysLeft / daysInMonth));
            const ok = allowance > 0;
            return (
              <div className="dash-3d dash-safe" data-tilt>
                <div className="dash-3d-bg" aria-hidden="true" />
                <div className="dash-card-head z1">
                  <span className="dash-eyebrow">{t('dash.safe')}</span>
                  <span className="dash-pill" style={{ '--tone': ok ? 'var(--dash-pos)' : 'var(--dash-neg)' }}>{ok ? t('dash.onTrack') : t('dash.caution')}</span>
                </div>
                <div className="z3">
                  <div className={`dash-safe-value dash-num${ok ? '' : ' is-neg'}`}>
                    <AnimatedCounter value={allowance} formatter={formatCurrency} />
                  </div>
                  <div className="dash-safe-meta">
                    {t('dash.freeCash')} <b>{formatCurrency(safeToSpendData?.safeToSpend || 0)}</b>
                  </div>
                </div>
                <div className="dash-safe-ring z2" role="img" aria-label={`${daysLeft} of ${daysInMonth} days left this month`}>
                  <svg width="88" height="88" viewBox="0 0 88 88">
                    <circle className="track" cx="44" cy="44" r={R} fill="none" strokeWidth="7" />
                    <circle className="fill" cx="44" cy="44" r={R} fill="none" strokeWidth="7"
                      strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 44 44)" />
                    <text x="44" y="46" textAnchor="middle">{daysLeft}</text>
                    <text className="sub" x="44" y="58" textAnchor="middle">{t('dash.daysLeft')}</text>
                  </svg>
                </div>
                <button type="button" onClick={() => navigate('/transactions')} className="btn btn-primary z1" style={{ padding: '0.45rem 0.95rem', fontSize: '0.78rem' }}>
                  {t('dash.addTx')}
                </button>
              </div>
            );
          })()}
        </section>

        {/* 2. Monthly cash flow KPIs */}
        <section className="dash-kpis" aria-label="This month">
          {[
            { key: 'in', label: t('dash.incomeMonth'), value: `+${formatCurrency(monthlyIncome)}`, tone: 'var(--dash-pos)', Icon: TrendingUp, onClick: () => setSummaryPopup({ type: 'Income', title: 'This Month Income' }) },
            { key: 'out', label: t('dash.expenseMonth'), value: `-${formatCurrency(monthlyExpense)}`, tone: 'var(--dash-neg)', Icon: TrendingDown, onClick: () => setSummaryPopup({ type: 'Expense', title: 'This Month Expenses' }) },
            { key: 'net', label: t('dash.netSaved', { rate: savingsRate }), value: `${(monthlyIncome - monthlyExpense) >= 0 ? '+' : ''}${formatCurrency(monthlyIncome - monthlyExpense)}`, tone: (monthlyIncome - monthlyExpense) >= 0 ? 'var(--dash-accent)' : 'var(--dash-neg)', Icon: Activity },
          ].map(({ key, label, value, tone, Icon, onClick }) => {
            const Tag = onClick ? 'button' : 'div';
            return (
              <Tag key={key} {...(onClick ? { type: 'button', onClick: () => { haptic(); onClick(); } } : {})} className="dash-3d dash-kpi" data-tilt style={{ '--tone': tone }}>
                <span className="dash-3d-bg" aria-hidden="true" />
                <span className="dash-icon-chip z2"><Icon size={19} /></span>
                <span className="dash-kpi-body z1">
                  <span className="dash-eyebrow">{label}</span>
                  <span className="dash-kpi-value dash-num" style={{ display: 'block' }}>{value}</span>
                </span>
                {onClick && <ArrowUpRight size={16} className="dash-kpi-arrow z1" aria-hidden="true" />}
              </Tag>
            );
          })}
        </section>

        {/* 2.5 Monthly Reminders Settlement Checklist (Paid vs. Due At-a-Glance) */}
        {(() => {
          const curMonth = todayYMD().slice(0, 7);
          const activeRec = (recurringRules || []).filter(r => !r.paused);
          if (activeRec.length === 0) return null;
          const paidRec = activeRec.filter(r => r.last_applied_month === curMonth);
          const unpaidRec = activeRec
            .filter(r => r.last_applied_month !== curMonth)
            .sort((a, b) => (parseInt(a.day_of_month, 10) || 99) - (parseInt(b.day_of_month, 10) || 99));
          const pct = Math.round((paidRec.length / activeRec.length) * 100);
          const todayDom = new Date().getDate();
          return (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${unpaidRec.length > 0 ? 'rgba(245, 158, 11, 0.25)' : 'rgba(16, 185, 129, 0.28)'}`,
                borderRadius: 16,
                padding: '1.1rem 1.35rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ letterSpacing: '1.2px', fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                    MONTHLY REMINDERS STATUS
                  </span>
                  <span style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 999,
                    background: 'rgba(16, 185, 129, 0.14)',
                    color: 'var(--mm-success)',
                  }}>
                    ✅ {paidRec.length}/{activeRec.length} Paid ({pct}%)
                  </span>
                  {unpaidRec.length > 0 && (
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: 999,
                      background: 'rgba(245, 158, 11, 0.16)',
                      color: 'var(--mm-warning)',
                    }}>
                      ⏳ {unpaidRec.length} Still Due
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/recurring')}
                  style={{ background: 'none', border: 'none', color: 'var(--cyan)', fontSize: '0.74rem', cursor: 'pointer', fontWeight: 600 }}
                >
                  OPEN REMINDERS →
                </button>
              </div>

              <div style={{ height: 6, borderRadius: 999, background: 'rgba(245, 158, 11, 0.18)', overflow: 'hidden', marginBottom: unpaidRec.length > 0 ? '0.75rem' : 0 }}>
                <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>

              {unpaidRec.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  {unpaidRec.slice(0, 3).map(r => {
                    const dom = parseInt(r.day_of_month, 10);
                    const isFixed = (r.schedule_mode || (r.day_of_month ? 'fixed' : 'flexible')) !== 'flexible' && dom > 0;
                    const isOverdue = isFixed && dom < todayDom;
                    const amt = parseFloat(r.amount) || parseFloat(r.avg_amount) || 0;
                    return (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.6rem',
                          padding: '0.5rem 0.75rem',
                          borderRadius: 10,
                          background: isOverdue ? 'rgba(239, 68, 68, 0.07)' : 'rgba(255,255,255,0.025)',
                          border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.3)' : 'rgba(255,255,255,0.06)'}`,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                          <span>{getCategoryEmoji(r.category)}</span>
                          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {r.name || r.category}
                          </span>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: 999,
                            background: isOverdue ? 'rgba(239, 68, 68, 0.18)' : 'rgba(245, 158, 11, 0.14)',
                            color: isOverdue ? 'var(--mm-danger)' : 'var(--mm-warning)',
                          }}>
                            {isOverdue ? `🚨 Overdue (Day ${dom})` : isFixed ? `⏳ Due Day ${dom}` : `⏳ Due (${r.flexible_window || 'Anytime'})`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--mm-warning)', fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(amt)}
                          </span>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={async () => {
                              try {
                                await updateRecurringTransaction(r.id, { last_applied_month: curMonth, last_paid_marked_only: true });
                                setRecurringRules(prev => prev.map(x => x.id === r.id ? { ...x, last_applied_month: curMonth, last_paid_marked_only: true } : x));
                                toast.success(`${r.name || r.category} marked as Paid this month`);
                              } catch {
                                toast.error('Failed to update status');
                              }
                            }}
                            style={{ padding: '0.24rem 0.55rem', fontSize: '0.68rem', color: 'var(--mm-success)', borderColor: 'rgba(16, 185, 129, 0.35)' }}
                          >
                            ✓ Mark Paid
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          );
        })()}

        {/* 3. Recent activity (top 5) */}
        <section className="dash-3d dash-panel" aria-label={t('dash.recent')}>
          <div className="dash-panel-head">
            <h3>{t('dash.recent')}</h3>
            <button type="button" className="dash-link" onClick={() => navigate('/transactions')}>
              {t('dash.viewAll')} <ArrowRight size={13} />
            </button>
          </div>
          {recentTxns.length === 0 ? (
            <div className="dash-empty">
              <span className="dash-icon-chip"><Activity size={18} /></span>
              No transactions yet — add one to see it here.
            </div>
          ) : (
            <ul className="dash-tx-list">
              {recentTxns.slice(0, 5).map((tx, i) => {
                const isIncome = tx.type === 'Income';
                const isTransfer = tx.type === 'Transfer';
                const amtSign = isIncome ? '+' : isTransfer ? '↔ ' : '-';
                return (
                  <li key={tx.id}>
                    <button type="button" className="dash-tx" style={{ '--i': i }} onClick={() => { haptic(); setPopupTx(tx); }}>
                      <span className="dash-tx-icon" aria-hidden="true">{getCategoryEmoji(tx.category) || (isIncome ? '💰' : isTransfer ? '🔄' : '💸')}</span>
                      <span className="dash-tx-main">
                        <span className="dash-tx-title" style={{ display: 'block' }}>{tx.category || tx.type}</span>
                        <span className="dash-tx-sub" style={{ display: 'block' }}>{tx.date}{tx.notes ? ` · ${tx.notes}` : ''}</span>
                      </span>
                      <span className={`dash-tx-amt ${isIncome ? 'dash-pos' : isTransfer ? 'is-transfer' : 'dash-neg'}`}>
                        {amtSign}{formatCurrency(tx.amount)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 4. Expand deeper insights */}
        <button
          type="button"
          className="dash-3d dash-more"
          aria-expanded={showAdvancedInsights}
          aria-controls="dashboard-insights"
          onClick={() => { haptic(); setShowAdvancedInsights(prev => !prev); }}
        >
          <span className="dash-more-label">
            <span className="dash-icon-chip" aria-hidden="true"><Zap size={17} /></span>
            More insights &amp; planning
          </span>
          <ChevronDown size={18} className="dash-more-chev" aria-hidden="true" />
        </button>
      </>
    </>
  );
}
