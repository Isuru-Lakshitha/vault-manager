import { useMemo } from 'react';
import { isActivePayment } from '../utils/ledgerReporting.js';
import { toYMD } from '../utils/dates';
import { formatCurrency } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';

const OUT = t => t.type === 'Expense' || t.type === 'Loan Payment';
const dayKey = d => (d instanceof Date ? toYMD(d) : String(d || '').slice(0, 10));

/**
 * Visual insights for the currently filtered transactions:
 * daily cash-flow bars, top spending categories and an in/out ratio.
 * Pure presentational; all figures derive from `rows` (already filtered).
 */
export default function TransactionInsights({ rows, onPickCategory, activeSearch }) {
  const data = useMemo(() => {
    const live = rows.filter(isActivePayment);
    const out = live.filter(OUT);
    const inc = live.filter(t => t.type === 'Income');
    const sum = a => a.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalOut = sum(out), totalIn = sum(inc);

    // Last 14 days that exist in the data window (anchored to latest tx date)
    const latest = live.reduce((m, t) => (t.date > m ? t.date : m), '');
    const end = latest ? new Date(latest + 'T00:00:00') : new Date();
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(end); d.setDate(d.getDate() - i);
      days.push({ key: dayKey(d), label: d.getDate(), in: 0, out: 0 });
    }
    const idx = Object.fromEntries(days.map((d, i) => [d.key, i]));
    live.forEach(t => {
      const i = idx[dayKey(t.date)];
      if (i === undefined) return;
      if (OUT(t)) days[i].out += Number(t.amount) || 0;
      else if (t.type === 'Income') days[i].in += Number(t.amount) || 0;
    });
    const peak = Math.max(1, ...days.map(d => Math.max(d.in, d.out)));

    const byCat = {};
    out.forEach(t => {
      if (Array.isArray(t.splits) && t.splits.length > 0) {
        t.splits.forEach(s => {
          const sc = s.category || t.category || 'Uncategorized';
          byCat[sc] = (byCat[sc] || 0) + (Number(s.amount) || 0);
        });
      } else {
        const c = t.category || 'Uncategorized';
        byCat[c] = (byCat[c] || 0) + (Number(t.amount) || 0);
      }
    });
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);

    const biggest = out.reduce((m, t) => (!m || t.amount > m.amount ? t : m), null);
    const activeDays = new Set(out.map(t => t.date)).size || 1;
    return { totalOut, totalIn, days, peak, cats, biggest, avgPerDay: totalOut / activeDays, count: live.length };
  }, [rows]);

  if (!data.count) return null;
  const flowTotal = data.totalIn + data.totalOut || 1;
  const savingsRate = data.totalIn > 0 ? Math.round(((data.totalIn - data.totalOut) / data.totalIn) * 100) : null;

  return (
    <div className="txi-grid" aria-label="Transaction insights">
      <section className="bento-card txi-card txi-wide">
        <header><h3>Daily cash flow</h3><small>last 14 days of data</small></header>
        <div className="txi-bars" role="img" aria-label="Daily income and expense bars">
          {data.days.map(d => (
            <div key={d.key} className="txi-col" title={`${d.key} · in ${formatCurrency(d.in)} · out ${formatCurrency(d.out)}`}>
              <div className="txi-stack">
                <span className="txi-bar txi-in" style={{ height: `${(d.in / data.peak) * 100}%` }} />
                <span className="txi-bar txi-out" style={{ height: `${(d.out / data.peak) * 100}%` }} />
              </div>
              <em>{d.label}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="bento-card txi-card">
        <header><h3>Top spending</h3><small>click to filter</small></header>
        {data.cats.length === 0 ? <p className="txi-empty">No expenses in this view.</p> : data.cats.map(([cat, amt]) => {
          const pct = data.totalOut ? (amt / data.totalOut) * 100 : 0;
          const active = activeSearch && activeSearch.toLowerCase() === cat.toLowerCase();
          return (
            <button key={cat} type="button" className={`txi-cat${active ? ' is-active' : ''}`} onClick={() => onPickCategory?.(active ? '' : cat)}>
              <span className="txi-cat-top"><span>{getCategoryEmoji(cat)} {cat}</span><b>{formatCurrency(amt)}</b></span>
              <span className="txi-track"><span style={{ width: `${pct}%` }} /></span>
            </button>
          );
        })}
      </section>

      <section className="bento-card txi-card">
        <header><h3>Flow balance</h3><small>income vs spend</small></header>
        <div className="txi-ratio" aria-hidden="true">
          <span style={{ width: `${(data.totalIn / flowTotal) * 100}%` }} className="txi-in" />
          <span style={{ width: `${(data.totalOut / flowTotal) * 100}%` }} className="txi-out" />
        </div>
        <dl className="txi-facts">
          <div><dt>Savings rate</dt><dd style={{ color: savingsRate === null ? undefined : savingsRate >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>{savingsRate === null ? '—' : `${savingsRate}%`}</dd></div>
          <div><dt>Avg / spend day</dt><dd>{formatCurrency(data.avgPerDay)}</dd></div>
          <div><dt>Largest expense</dt><dd>{data.biggest ? formatCurrency(data.biggest.amount) : '—'}</dd></div>
        </dl>
      </section>
    </div>
  );
}
