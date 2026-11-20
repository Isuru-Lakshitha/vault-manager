import { useNavigate } from 'react-router-dom';
import { Repeat, Trash2 } from 'lucide-react';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { formatCurrency } from '../../utils/format';
import { todayYMD } from '../../utils/dates';
import { TYPE_COLOR } from './constants';

// Transactions → "Recurring Rules" tab: rule list and the next-30-days timeline.
export default function RecurringRulesTab({ rules, onDelete }) {
  const navigate = useNavigate();
  return (
    <div className="hud-panel" style={{ padding:'1.1rem' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', flexWrap:'wrap', gap:'0.75rem' }}>
        <div>
          <div style={{ fontWeight:700, fontSize:'0.95rem', color:'var(--text-primary)', fontFamily:'Inter, sans-serif' }}>
            Monthly Reminders & Recurring Rules ({rules.length})
          </div>
          <div style={{ fontSize:'0.75rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', marginTop:2 }}>
            Synced with Recurring & Monthly Reminders (fixed days, flexible windows, variable estimates)
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigate('/recurring')}
          style={{ fontSize:'0.76rem', padding:'0.45rem 0.85rem' }}
        >
          Open Recurring & Reminders →
        </button>
      </div>
      {rules.length === 0 ? (
        <div style={{ textAlign:'center', padding:'3rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.8rem' }}>
          <Repeat size={36} style={{ opacity:0.2, marginBottom:'1rem' }}/><br/>
          NO RECURRING RULES YET. ADD A TRANSACTION AND ENABLE &quot;SET AS RECURRING&quot;.
        </div>
      ) : (
        <>
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {rules.map(rule => {
              const currentMonth = todayYMD().slice(0, 7);
              const isPaidThisMonth = rule.last_applied_month === currentMonth;
              const isFlexible = rule.schedule_mode === 'flexible' || !rule.day_of_month;
              const scheduleLabel = isFlexible
                ? `Flexible (${rule.flexible_window || 'Anytime this month'})`
                : `Every month on day ${rule.day_of_month || 1}`;
              const displayAmt = Number(rule.avg_amount || rule.amount || 0);
              return (
                <div key={rule.id} style={{ display:'flex', alignItems:'center', padding:'0.875rem 1rem', background:'rgba(255,255,255,0.02)', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', gap:'0.875rem', flexWrap:'wrap' }}>
                  <span style={{ fontSize:'1.4rem', flexShrink:0 }}>{getCategoryEmoji(rule.category)}</span>
                  <div style={{ flex:1, minWidth:180 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                      <span style={{ fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{rule.name || rule.category || rule.type}</span>
                      {rule.paused ? (
                        <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(148,163,184,0.12)', color:'#94a3b8', fontWeight:600 }}>Paused</span>
                      ) : isPaidThisMonth ? (
                        <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(74,222,128,0.12)', color:'#4ade80', fontWeight:600 }}>✓ Paid this month</span>
                      ) : (
                        <span style={{ fontSize:'0.66rem', padding:'0.12rem 0.45rem', borderRadius:999, background:'rgba(251,191,36,0.12)', color:'#fbbf24', fontWeight:600 }}>Due this month</span>
                      )}
                    </div>
                    <div className="text-muted" style={{ fontSize:'0.76rem', fontFamily:'Inter, sans-serif', marginTop:2 }}>
                      {scheduleLabel} · {rule.type}{rule.is_variable ? ' · Variable Est.' : ''}
                    </div>
                  </div>
                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize:'0.95rem', color:TYPE_COLOR[rule.type]||'#aaa', flexShrink:0 }}>
                    {rule.type==='Income'?'+':'-'}{rule.is_variable ? '~' : ''}{formatCurrency(displayAmt)}
                  </div>
                  <button className="icon-btn" aria-label="Delete recurring rule" style={{ color:'var(--danger)' }} onClick={() => onDelete(rule.id)}><Trash2 size={15}/></button>
                </div>
              );
            })}
          </div>

          {/* Upcoming 30-day timeline */}
          <div style={{ marginTop:'1.5rem' }}>
            <h3 style={{ margin:'0 0 1rem', fontFamily:'Inter, sans-serif', fontSize:'0.78rem', letterSpacing:'2px', color:'var(--text-muted)' }}>UPCOMING — NEXT 30 DAYS</h3>
            {(() => {
              const today = new Date(); today.setHours(0,0,0,0);
              const currentMonth = todayYMD().slice(0, 7);
              const upcoming = [];
              rules.forEach(rule => {
                if (rule.paused) return;
                const isFlexible = rule.schedule_mode === 'flexible' || !rule.day_of_month;
                if (isFlexible) {
                  if (rule.last_applied_month !== currentMonth) {
                    upcoming.push({ ...rule, fireDate: today, diffDays: 0, isFlexible: true });
                  }
                  return;
                }
                const day = rule.day_of_month || 1;
                for (let mOffset = 0; mOffset <= 1; mOffset++) {
                  if (mOffset === 0 && rule.last_applied_month === currentMonth) continue;
                  const d = new Date(today.getFullYear(), today.getMonth() + mOffset, day);
                  const diffDays = Math.ceil((d - today) / (1000*60*60*24));
                  if (diffDays >= 0 && diffDays <= 30) {
                    upcoming.push({ ...rule, fireDate: d, diffDays, isFlexible: false });
                  }
                }
              });
              upcoming.sort((a,b) => a.fireDate - b.fireDate);
              if (upcoming.length === 0) return <p style={{ color:'var(--text-muted)', fontFamily:'Inter, sans-serif', fontSize:'0.82rem' }}>No pending recurring transactions in the next 30 days.</p>;
              return (
                <div style={{ display:'flex', flexDirection:'column', gap:'0.4rem' }}>
                  {upcoming.map((item, i) => {
                    const col = item.type==='Income' ? '#4ade80' : item.type==='Expense' ? '#f87171' : '#a78bfa';
                    const displayAmt = Number(item.avg_amount || item.amount || 0);
                    return (
                      <div key={`${item.id}-${i}`}
                        style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.6rem 0.875rem', background:`${col}08`, border:`1px solid ${col}22`, borderLeft:`3px solid ${col}`, borderRadius:8 }}>
                        <div style={{ minWidth:56, textAlign:'center' }}>
                          <div style={{ fontSize:'0.62rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>
                            {item.isFlexible ? 'FLEXIBLE' : item.diffDays === 0 ? 'TODAY' : `in ${item.diffDays}d`}
                          </div>
                          <div style={{ fontSize:'0.75rem', fontWeight:700, color:col, fontFamily:'Inter, sans-serif' }}>
                            {item.isFlexible ? 'This Mo' : item.fireDate.toLocaleDateString('en-US',{month:'short',day:'numeric'})}
                          </div>
                        </div>
                        <span style={{ fontSize:'1.2rem' }}>{getCategoryEmoji(item.category)}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:600, fontSize:'0.85rem' }}>{item.name || item.category || item.type}</div>
                          <div style={{ fontSize:'0.72rem', color:'var(--text-muted)', fontFamily:'Inter, sans-serif' }}>{item.notes || item.type}</div>
                        </div>
                        <div style={{ fontWeight:700, color:col, fontFamily:'Inter, sans-serif' }}>
                          {item.type==='Income'?'+':'-'}{item.is_variable ? '~' : ''}{formatCurrency(displayAmt)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}
