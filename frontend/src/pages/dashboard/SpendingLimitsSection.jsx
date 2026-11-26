import { todayYMD, toYMD } from '../../utils/dates';
import MoreSection from '../../components/MoreSection';
import { formatCurrency, getCurrencyLabel, haptic } from '../../utils/format';
import toast from 'react-hot-toast';
import { isInternalMove } from '../../utils/ledgerReporting.js';

// Dashboard → 'Spending limits': daily and weekly spending guardrails.
export default function SpendingLimitsSection({ capForm, dailyLimit, editingCaps, loadData, safeToSpendData, setCapForm, setDailyLimit, setEditingCaps, setWeeklyLimit, transactions, weeklyLimit }) {
  return (
    <>
      <MoreSection title="Spending limits" hint="Daily & weekly guardrails">
      {/* Custom Smart Spending Limits (Daily & Weekly Velocity Guardrails) */}
      {(() => {
        const todayKey = todayYMD();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
        const sevenDaysKey = toYMD(sevenDaysAgo);

        const activeExp = transactions.filter(t => !isInternalMove(t) && t && !t.reversed_at && !t.reversal_of && (t.type === 'Expense' || t.type === 'Loan Payment'));
        const todaySpent = activeExp
          .filter(t => t.date === todayKey)
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);
        const weekSpent = activeExp
          .filter(t => t.date >= sevenDaysKey && t.date <= todayKey)
          .reduce((s, t) => s + (Number(t.amount) || 0), 0);

        const effectiveDaily = dailyLimit > 0 ? dailyLimit : Math.round(safeToSpendData?.dailyAllowance || 0);
        const effectiveWeekly = weeklyLimit > 0 ? weeklyLimit : Math.round((safeToSpendData?.dailyAllowance || 0) * 7);

        const dPct = effectiveDaily > 0 ? Math.min(100, Math.round((todaySpent / effectiveDaily) * 100)) : 0;
        const wPct = effectiveWeekly > 0 ? Math.min(100, Math.round((weekSpent / effectiveWeekly) * 100)) : 0;

        const dColor = todaySpent > effectiveDaily && effectiveDaily > 0 ? '#f87171' : dPct >= 80 ? '#fbbf24' : '#4ade80';
        const wColor = weekSpent > effectiveWeekly && effectiveWeekly > 0 ? '#f87171' : wPct >= 80 ? '#fbbf24' : '#38bdf8';

        const handleSaveCaps = () => {
          const dVal = parseFloat(capForm.daily) || 0;
          const wVal = parseFloat(capForm.weekly) || 0;
          if (dVal > 0) localStorage.setItem('vm_daily_limit', String(dVal));
          else localStorage.removeItem('vm_daily_limit');
          if (wVal > 0) localStorage.setItem('vm_weekly_limit', String(wVal));
          else localStorage.removeItem('vm_weekly_limit');
          setDailyLimit(dVal);
          setWeeklyLimit(wVal);
          setEditingCaps(false);
          haptic();
          toast.success('Smart spending velocity caps updated!');
          loadData(true);
        };

        return (
          <div style={{
            marginBottom: '1.5rem',
            padding: '1rem 1.25rem',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>🚦</span>
                <span style={{ fontSize: '0.76rem', fontWeight: 700, letterSpacing: '1.2px', color: 'var(--text-secondary)' }}>
                  SMART SPEND VELOCITY GUARDRAILS
                </span>
                <span style={{
                  fontSize: '0.64rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: 20,
                  background: (dailyLimit > 0 || weeklyLimit > 0) ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.05)',
                  color: (dailyLimit > 0 || weeklyLimit > 0) ? 'var(--mm-success)' : 'var(--text-muted)',
                  fontWeight: 600,
                }}>
                  {(dailyLimit > 0 || weeklyLimit > 0) ? 'Custom Caps Active' : 'Auto Safe-Spend Benchmark'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setEditingCaps(v => !v)}
                style={{
                  padding: '0.28rem 0.7rem',
                  borderRadius: 8,
                  background: 'rgba(251, 146, 60, 0.12)',
                  border: '1px solid rgba(251, 146, 60, 0.3)',
                  color: '#fb923c',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {editingCaps ? 'Cancel' : '⚙ Set Daily / Weekly Caps'}
              </button>
            </div>

            {editingCaps && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '0.75rem',
                padding: '0.85rem',
                background: 'rgba(0,0,0,0.25)',
                borderRadius: 10,
                marginBottom: '0.85rem',
                border: '1px solid rgba(251,146,60,0.2)',
              }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {`Daily Spend Cap (${getCurrencyLabel()})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = Auto Safe-Spend"
                    value={capForm.daily}
                    onChange={e => setCapForm(f => ({ ...f, daily: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    {`7-Day Weekly Cap (${getCurrencyLabel()})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0 = Auto 7x Daily"
                    value={capForm.weekly}
                    onChange={e => setCapForm(f => ({ ...f, weekly: e.target.value }))}
                    style={{ width: '100%', padding: '0.45rem 0.65rem', fontSize: '0.82rem' }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleSaveCaps}
                    style={{
                      width: '100%',
                      padding: '0.5rem 0.85rem',
                      borderRadius: 8,
                      background: 'linear-gradient(135deg, #fb923c, #f97316)',
                      color: '#0f172a',
                      border: 'none',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                    }}
                  >
                    Save Velocity Caps
                  </button>
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem' }}>
              {/* Today's Velocity */}
              <div style={{ background: 'rgba(255,255,255,0.015)', padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Today&apos;s Spend Velocity</span>
                  <span style={{ color: dColor, fontWeight: 700 }}>
                    {formatCurrency(todaySpent)} / {formatCurrency(effectiveDaily)}
                  </span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${dPct}%`, height: '100%', background: dColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>{todaySpent > effectiveDaily && effectiveDaily > 0 ? '⚠ Exceeded daily cap' : `${Math.max(0, 100 - dPct)}% daily buffer left`}</span>
                  <span>{dPct}%</span>
                </div>
              </div>

              {/* 7-Day Rolling Velocity */}
              <div style={{ background: 'rgba(255,255,255,0.015)', padding: '0.75rem 0.9rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>7-Day Rolling Velocity</span>
                  <span style={{ color: wColor, fontWeight: 700 }}>
                    {formatCurrency(weekSpent)} / {formatCurrency(effectiveWeekly)}
                  </span>
                </div>
                <div style={{ height: 7, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${wPct}%`, height: '100%', background: wColor, borderRadius: 4, transition: 'width 0.5s ease' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>{weekSpent > effectiveWeekly && effectiveWeekly > 0 ? '⚠ Exceeded 7-day cap' : `${Math.max(0, 100 - wPct)}% weekly buffer left`}</span>
                  <span>{wPct}%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      </MoreSection>
    </>
  );
}
