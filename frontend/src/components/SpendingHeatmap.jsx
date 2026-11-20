import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { formatCurrency } from '../utils/format';
import { toYMD } from '../utils/dates';

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const SpendingHeatmap = ({ dailyData = [] }) => {
  const { weeks, maxVal, monthLabels } = useMemo(() => {
    if (!dailyData.length) return { weeks: [], maxVal: 0, monthLabels: [] };

    // Build map of date -> amount
    const map = {};
    dailyData.forEach(d => { map[d.date] = (map[d.date] || 0) + d.amount; });
    const maxVal = Math.max(...Object.values(map), 1);

    // Build 52 weeks grid ending today
    const today = new Date(); today.setHours(0,0,0,0);
    const endDate = new Date(today);
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 364);
    // Align to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    const weeks = [];
    const monthLabels = [];
    let cur = new Date(startDate);
    let weekIdx = 0;

    while (cur <= endDate) {
      const week = [];
      new Date(cur);
      for (let d = 0; d < 7; d++) {
        const dateStr = toYMD(cur);
        const isFuture = cur > today;
        week.push({ date: dateStr, amount: map[dateStr] || 0, isFuture, month: cur.getMonth(), day: cur.getDate() });
        cur.setDate(cur.getDate() + 1);
      }
      // Month label at first week of a new month
      if (weekIdx === 0 || week[0].month !== weeks[weeks.length - 1]?.[0]?.month) {
        monthLabels.push({ weekIdx, label: MONTHS_SHORT[week[0].month] });
      }
      weeks.push(week);
      weekIdx++;
    }
    return { weeks, maxVal, monthLabels };
  }, [dailyData]);

  const getColor = (amount, isFuture) => {
    if (isFuture || amount === 0) return 'rgba(255,255,255,0.04)';
    const intensity = Math.min(amount / maxVal, 1);
    if (intensity < 0.25) return 'rgba(74,222,128,0.15)';
    if (intensity < 0.5)  return 'rgba(74,222,128,0.35)';
    if (intensity < 0.75) return 'rgba(74,222,128,0.65)';
    return '#4ade80';
  };

  if (!dailyData.length) return (
    <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-muted)', fontSize:'0.8rem' }}>
      NO SPENDING DATA YET
    </div>
  );

  
  return (
    <div style={{ overflowX:'auto' }}>
      <div style={{ minWidth: 780, paddingBottom: '0.5rem' }}>
        {/* Month labels */}
        <div style={{ display:'flex', marginLeft:28, marginBottom:4, position:'relative', height:16 }}>
          {monthLabels.map(({ weekIdx, label }) => (
            <div key={label+weekIdx} style={{ position:'absolute', left: weekIdx * 14, fontSize:'0.65rem', color:'var(--text-secondary)', letterSpacing:'0.5px' }}>{label}</div>
          ))}
        </div>
        <div style={{ display:'flex', gap:2 }}>
          {/* Day labels */}
          <div style={{ display:'flex', flexDirection:'column', gap:2, marginRight:4, paddingTop:0 }}>
            {DAYS.map((d,i) => (
              <div key={d} style={{ height:12, fontSize:'0.6rem', color: i%2===0?'var(--mm-text-3)':'transparent', lineHeight:'12px', width:24 }}>{d}</div>
            ))}
          </div>
          {/* Weeks */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {week.map((cell, di) => (
                <motion.div
                  key={cell.date}
                  title={cell.amount > 0 ? `${cell.date}: ${formatCurrency(cell.amount)}` : cell.date}
                  initial={{ opacity:0, scale:0.5 }}
                  animate={{ opacity:1, scale:1 }}
                  transition={{ delay: (wi * 7 + di) * 0.0005, duration:0.2 }}
                  style={{ width:12, height:12, borderRadius:2, background:getColor(cell.amount, cell.isFuture), cursor: cell.amount > 0 ? 'pointer' : 'default', transition:'transform 0.1s, box-shadow 0.1s' }}
                  whileHover={cell.amount > 0 ? { scale:1.5, boxShadow:'0 0 8px #4ade80' } : {}}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', marginTop:'0.75rem', marginLeft:28, fontSize:'0.65rem', color:'var(--text-secondary)' }}>
          <span>Less</span>
          {['rgba(255,255,255,0.04)','rgba(74,222,128,0.15)','rgba(74,222,128,0.35)','rgba(74,222,128,0.65)','#4ade80'].map((c,i) => (
            <div key={i} style={{ width:12, height:12, borderRadius:2, background:c }}/>
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

export default SpendingHeatmap;