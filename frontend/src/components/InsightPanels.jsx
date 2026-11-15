import { useMemo } from 'react';
import { formatCurrency } from '../utils/format';
import getCategoryEmoji from '../utils/categoryEmoji';
import '../insights-ui.css';

const ymd = (d) => String(d || '').slice(0, 10);
const num = (v) => Number(v) || 0;
const DAY = 86400000;
const toDay = (s) => { const t = new Date(`${ymd(s)}T00:00:00`).getTime(); return Number.isNaN(t) ? null : t; };

/** Bills: unpaid amounts bucketed by week from today + paid vs unpaid ratio. Pure/presentational. */
export function InsightBills({ bills }) {
  const data = useMemo(() => {
    const list = Array.isArray(bills) ? bills : [];
    if (!list.length) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const t0 = today.getTime();
    const buckets = [
      { label: 'Overdue', amt: 0, n: 0, bad: true },
      { label: 'This week', amt: 0, n: 0 },
      { label: 'Next week', amt: 0, n: 0 },
      { label: 'Week 3', amt: 0, n: 0 },
      { label: 'Week 4', amt: 0, n: 0 },
      { label: 'Later', amt: 0, n: 0 },
    ];
    let paid = 0, unpaid = 0, paidAmt = 0, unpaidAmt = 0;
    list.forEach((b) => {
      if (b.paid) { paid++; paidAmt += num(b.amount); return; }
      unpaid++; unpaidAmt += num(b.amount);
      const d = toDay(b.due_date);
      if (d === null) return;
      const diff = Math.floor((d - t0) / DAY);
      const i = diff < 0 ? 0 : diff < 7 ? 1 : diff < 14 ? 2 : diff < 21 ? 3 : diff < 28 ? 4 : 5;
      buckets[i].amt += num(b.amount); buckets[i].n++;
    });
    const peak = Math.max(1, ...buckets.map((b) => b.amt));
    return { buckets, peak, paid, unpaid, paidAmt, unpaidAmt, total: paid + unpaid };
  }, [bills]);

  if (!data) return null;
  const paidPct = data.total ? (data.paid / data.total) * 100 : 0;
  return (
    <div className="ins-grid" aria-label="Bill insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Due timeline</h3><small>unpaid, by week</small></header>
        {data.buckets.map((b) => (
          <div key={b.label} className="ins-row" title={`${b.n} bill${b.n === 1 ? '' : 's'}`}>
            <span className="ins-row-top"><span>{b.label} <em>{b.n || ''}</em></span><b>{formatCurrency(b.amt)}</b></span>
            <span className="ins-track"><span className={b.bad ? 'is-bad' : ''} style={{ width: `${(b.amt / data.peak) * 100}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Paid vs unpaid</h3><small>{data.paid} / {data.total} paid</small></header>
        <div className="ins-ratio" aria-hidden="true">
          <span className="is-good" style={{ width: `${paidPct}%` }} />
          <span className="is-bad" style={{ width: `${100 - paidPct}%` }} />
        </div>
        <dl className="ins-facts">
          <div><dt>Paid</dt><dd style={{ color: 'var(--mm-success)' }}>{formatCurrency(data.paidAmt)}</dd></div>
          <div><dt>Unpaid</dt><dd style={{ color: data.unpaid ? 'var(--mm-danger)' : undefined }}>{formatCurrency(data.unpaidAmt)}</dd></div>
          <div><dt>Completion</dt><dd>{Math.round(paidPct)}%</dd></div>
        </dl>
      </section>
    </div>
  );
}

/** Budgets: top over-budget (or closest to limit) categories with progress bars. */
export function InsightBudgets({ budgets, getSpent }) {
  const rows = useMemo(() => (Array.isArray(budgets) ? budgets : [])
    .filter((b) => num(b.amount) > 0)
    .map((b) => { const spent = num(getSpent?.(b)); return { id: b.id ?? `${b.category}-${b.month}`, category: b.category || 'Other', amount: num(b.amount), spent, pct: (spent / num(b.amount)) * 100 }; })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 5), [budgets, getSpent]);

  if (!rows.length) return null;
  const over = rows.filter((r) => r.pct > 100).length;
  return (
    <div className="ins-grid ins-single" aria-label="Budget insights">
      <section className="bento-card ins-card">
        <header><h3>{over ? 'Over budget' : 'Closest to limit'}</h3><small>{over ? `${over} over limit` : 'top categories by usage'}</small></header>
        {rows.map((r) => (
          <div key={r.id} className="ins-row">
            <span className="ins-row-top"><span>{getCategoryEmoji(r.category)} {r.category}</span><b>{formatCurrency(r.spent)} / {formatCurrency(r.amount)} · {Math.round(r.pct)}%</b></span>
            <span className="ins-track"><span className={r.pct > 100 ? 'is-bad' : r.pct > 80 ? 'is-warn' : ''} style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Loans: remaining principal per loan + next upcoming payment. */
export function InsightLoans({ loans }) {
  const data = useMemo(() => {
    const list = (Array.isArray(loans) ? loans : []).filter((l) => num(l.principal_amount) > 0);
    if (!list.length) return null;
    const rows = list.map((l) => ({ id: l.id, name: l.item_name || l.type || 'Loan', principal: num(l.principal_amount) })).sort((a, b) => b.principal - a.principal).slice(0, 6);
    const total = list.reduce((s, l) => s + num(l.principal_amount), 0);
    const next = list.filter((l) => l.next_payment_date).sort((a, b) => ymd(a.next_payment_date).localeCompare(ymd(b.next_payment_date)))[0] || null;
    return { rows, total, peak: Math.max(1, ...rows.map((r) => r.principal)), next };
  }, [loans]);

  if (!data) return null;
  return (
    <div className="ins-grid" aria-label="Loan insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Remaining principal</h3><small>{formatCurrency(data.total)} total</small></header>
        {data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top"><span>{r.name}</span><b>{formatCurrency(r.principal)}</b></span>
            <span className="ins-track"><span style={{ width: `${(r.principal / data.peak) * 100}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Next payment</h3><small>soonest due</small></header>
        {data.next ? (
          <dl className="ins-facts">
            <div><dt>Loan</dt><dd>{data.next.item_name || data.next.type}</dd></div>
            <div><dt>Date</dt><dd>{ymd(data.next.next_payment_date)}</dd></div>
            <div><dt>Amount</dt><dd>{num(data.next.monthly_payment) > 0 ? formatCurrency(data.next.monthly_payment) : '—'}</dd></div>
          </dl>
        ) : <p className="ins-empty">No scheduled payments.</p>}
      </section>
    </div>
  );
}

/** Accounts: top balances by account + liquidity distribution by type. */
export function InsightAccounts({ accounts }) {
  const data = useMemo(() => {
    const list = (Array.isArray(accounts) ? accounts : []).filter((a) => !a.archived);
    if (!list.length) return null;
    const rows = list
      .map((a) => ({ id: a.id, name: a.name || 'Account', type: a.type || 'Bank', bal: num(a.balance) }))
      .sort((a, b) => Math.abs(b.bal) - Math.abs(a.bal))
      .slice(0, 5);
    const peak = Math.max(1, ...rows.map((r) => Math.abs(r.bal)));
    let liquid = 0, cardDebt = 0;
    list.forEach((a) => {
      if (a.type === 'Credit Card' || num(a.balance) < 0) cardDebt += Math.abs(num(a.balance));
      else liquid += num(a.balance);
    });
    return { rows, peak, liquid, cardDebt, count: list.length };
  }, [accounts]);

  if (!data) return null;
  const totalVol = Math.max(1, data.liquid + data.cardDebt);
  const liquidPct = (data.liquid / totalVol) * 100;
  return (
    <div className="ins-grid" aria-label="Account insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Account concentration</h3><small>top {data.rows.length} of {data.count} active</small></header>
        {data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top"><span>{r.name} <em>{r.type}</em></span><b>{formatCurrency(r.bal)}</b></span>
            <span className="ins-track"><span className={r.bal < 0 ? 'is-bad' : ''} style={{ width: `${(Math.abs(r.bal) / data.peak) * 100}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Liquidity mix</h3><small>cash & bank vs credit</small></header>
        <div className="ins-ratio" aria-hidden="true">
          <span className="is-good" style={{ width: `${liquidPct}%` }} />
          <span className="is-bad" style={{ width: `${100 - liquidPct}%` }} />
        </div>
        <dl className="ins-facts">
          <div><dt>Liquid assets</dt><dd style={{ color: 'var(--mm-success)' }}>{formatCurrency(data.liquid)}</dd></div>
          <div><dt>Credit / negative</dt><dd style={{ color: data.cardDebt > 0 ? 'var(--mm-danger)' : undefined }}>{formatCurrency(data.cardDebt)}</dd></div>
          <div><dt>Net position</dt><dd>{formatCurrency(data.liquid - data.cardDebt)}</dd></div>
        </dl>
      </section>
    </div>
  );
}

/** Credit Cards: per-card credit utilization bars + soonest due date. */
export function InsightCreditCards({ cards }) {
  const data = useMemo(() => {
    const list = Array.isArray(cards) ? cards : [];
    if (!list.length) return null;
    const rows = list
      .map((c) => {
        const limit = num(c.credit_limit);
        const bal = num(c.balance);
        const pct = limit > 0 ? (bal / limit) * 100 : 0;
        return { id: c.id, name: c.name || 'Card', bal, limit, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
    const nextDue = list
      .filter((c) => c.due_date && num(c.balance) > 0)
      .sort((a, b) => ymd(a.due_date).localeCompare(ymd(b.due_date)))[0] || null;
    return { rows, nextDue };
  }, [cards]);

  if (!data) return null;
  return (
    <div className="ins-grid" aria-label="Credit card insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Utilization by card</h3><small>keep under 30% for optimal score</small></header>
        {data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top"><span>{r.name}</span><b>{formatCurrency(r.bal)} / {formatCurrency(r.limit)} · {Math.round(r.pct)}%</b></span>
            <span className="ins-track"><span className={r.pct >= 70 ? 'is-bad' : r.pct >= 30 ? 'is-warn' : ''} style={{ width: `${Math.min(100, r.pct)}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Next statement due</h3><small>active balance</small></header>
        {data.nextDue ? (
          <dl className="ins-facts">
            <div><dt>Card</dt><dd>{data.nextDue.name}</dd></div>
            <div><dt>Due date</dt><dd>{ymd(data.nextDue.due_date)}</dd></div>
            <div><dt>Balance</dt><dd style={{ color: 'var(--mm-danger)' }}>{formatCurrency(num(data.nextDue.balance))}</dd></div>
          </dl>
        ) : <p className="ins-empty">No upcoming card balances due.</p>}
      </section>
    </div>
  );
}

/** Investments: unrealized return by holding + winners vs losers summary. */
export function InsightInvestments({ investments }) {
  const data = useMemo(() => {
    const list = Array.isArray(investments) ? investments : [];
    if (!list.length) return null;
    const rows = list
      .map((inv) => {
        const qty = num(inv.quantity) || 1;
        const buy = num(inv.buy_price);
        const cur = inv.current_price != null ? num(inv.current_price) : buy;
        const cost = buy * qty;
        const val = cur * qty;
        const pnl = val - cost;
        const pct = cost > 0 ? (pnl / cost) * 100 : 0;
        return { id: inv.id, name: inv.name || inv.symbol || 'Holding', val, pnl, pct };
      })
      .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))
      .slice(0, 5);
    const peak = Math.max(1, ...rows.map((r) => Math.abs(r.pnl)));
    const winners = list.filter((i) => (i.current_price != null ? num(i.current_price) : num(i.buy_price)) >= num(i.buy_price)).length;
    const losers = list.length - winners;
    return { rows, peak, winners, losers, total: list.length };
  }, [investments]);

  if (!data) return null;
  const winPct = data.total ? (data.winners / data.total) * 100 : 0;
  return (
    <div className="ins-grid" aria-label="Investment insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Unrealized P&L by holding</h3><small>largest movers</small></header>
        {data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top">
              <span>{r.name}</span>
              <b style={{ color: r.pnl >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>
                {r.pnl >= 0 ? '+' : ''}{formatCurrency(r.pnl)} ({r.pct >= 0 ? '+' : ''}{r.pct.toFixed(1)}%)
              </b>
            </span>
            <span className="ins-track"><span className={r.pnl < 0 ? 'is-bad' : ''} style={{ width: `${(Math.abs(r.pnl) / data.peak) * 100}%` }} /></span>
          </div>
        ))}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Win / loss breadth</h3><small>{data.winners} / {data.total} in profit</small></header>
        <div className="ins-ratio" aria-hidden="true">
          <span className="is-good" style={{ width: `${winPct}%` }} />
          <span className="is-bad" style={{ width: `${100 - winPct}%` }} />
        </div>
        <dl className="ins-facts">
          <div><dt>In profit</dt><dd style={{ color: 'var(--mm-success)' }}>{data.winners}</dd></div>
          <div><dt>Underwater</dt><dd style={{ color: data.losers ? 'var(--mm-danger)' : undefined }}>{data.losers}</dd></div>
          <div><dt>Win rate</dt><dd>{Math.round(winPct)}%</dd></div>
        </dl>
      </section>
    </div>
  );
}

/** Goals: closest-to-target active goals + completion summary. */
export function InsightGoals({ goals }) {
  const data = useMemo(() => {
    const list = Array.isArray(goals) ? goals : [];
    if (!list.length) return null;
    const allRows = list
      .filter((g) => num(g.target_amount) > 0)
      .map((g) => {
        const cur = num(g.current_amount);
        const tgt = num(g.target_amount);
        const pct = Math.min(100, (cur / tgt) * 100);
        return { id: g.id, name: g.name || g.goal_name || 'Goal', icon: g.icon || '🎯', cur, tgt, pct };
      })
      .sort((a, b) => b.pct - a.pct);
    const completed = allRows.filter((r) => r.pct >= 100).length;
    const rows = allRows.slice(0, 5);
    return { rows, completed, total: list.length };
  }, [goals]);

  if (!data || !data.rows.length) return null;
  return (
    <div className="ins-grid ins-single" aria-label="Goal insights">
      <section className="bento-card ins-card">
        <header><h3>Goal completion</h3><small>{data.completed} / {data.total} reached</small></header>
        {data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top"><span>{r.icon} {r.name}</span><b>{formatCurrency(r.cur)} / {formatCurrency(r.tgt)} · {Math.round(r.pct)}%</b></span>
            <span className="ins-track"><span style={{ width: `${r.pct}%` }} /></span>
          </div>
        ))}
      </section>
    </div>
  );
}

const monthlyRuleAmt = (r) => {
  const raw = r.is_variable ? (num(r.avg_amount) || num(r.amount)) : (num(r.amount) || num(r.avg_amount));
  if (r.frequency === 'Weekly') return raw * 4.33;
  if (r.frequency === 'Yearly') return raw / 12;
  return raw;
};

/** Recurring: cycle completion progress + fixed vs. variable commitment split. */
export function InsightRecurring({ rules, currentMonth }) {
  const data = useMemo(() => {
    const list = (Array.isArray(rules) ? rules : []).filter((r) => !r.paused && ['Expense', 'Loan Payment'].includes(r.type));
    if (!list.length) return null;
    const paid = list.filter((r) => r.last_applied_month === currentMonth);
    const unpaid = list.filter((r) => r.last_applied_month !== currentMonth);
    const fixedTotal = list.filter((r) => !r.is_variable).reduce((s, r) => s + monthlyRuleAmt(r), 0);
    const varTotal = list.filter((r) => r.is_variable).reduce((s, r) => s + monthlyRuleAmt(r), 0);
    const rows = unpaid
      .map((r) => ({
        id: r.id,
        name: r.name || r.category || 'Reminder',
        amt: monthlyRuleAmt(r),
        when: r.schedule_mode === 'flexible' ? (r.flexible_window || 'Flexible') : `Day ${r.day_of_month || 1}`,
      }))
      .sort((a, b) => b.amt - a.amt)
      .slice(0, 4);
    const peak = Math.max(1, ...rows.map((r) => r.amt));
    return { paidCount: paid.length, totalCount: list.length, fixedTotal, varTotal, rows, peak };
  }, [rules, currentMonth]);

  if (!data) return null;
  const totalCommit = data.fixedTotal + data.varTotal;
  const fixedPct = totalCommit > 0 ? (data.fixedTotal / totalCommit) * 100 : 50;
  return (
    <div className="ins-grid" aria-label="Recurring insights">
      <section className="bento-card ins-card ins-wide">
        <header><h3>Largest remaining reminders</h3><small>{data.paidCount} / {data.totalCount} settled this month</small></header>
        {data.rows.length ? data.rows.map((r) => (
          <div key={r.id ?? r.name} className="ins-row">
            <span className="ins-row-top"><span>{r.name} <em>{r.when}</em></span><b>{formatCurrency(r.amt)}</b></span>
            <span className="ins-track"><span style={{ width: `${(r.amt / data.peak) * 100}%` }} /></span>
          </div>
        )) : <p className="ins-empty">All monthly reminders are settled for this cycle.</p>}
      </section>
      <section className="bento-card ins-card">
        <header><h3>Fixed vs variable mix</h3><small>monthly outflow</small></header>
        <div className="ins-ratio" aria-hidden="true">
          <span className="is-good" style={{ width: `${fixedPct}%` }} />
          <span style={{ width: `${100 - fixedPct}%`, background: 'var(--mm-warning)' }} />
        </div>
        <dl className="ins-facts">
          <div><dt>Fixed rules</dt><dd>{formatCurrency(data.fixedTotal)}</dd></div>
          <div><dt>Variable est.</dt><dd>{formatCurrency(data.varTotal)}</dd></div>
          <div><dt>Cycle progress</dt><dd>{Math.round((data.paidCount / data.totalCount) * 100)}%</dd></div>
        </dl>
      </section>
    </div>
  );
}
