import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Check, AlertTriangle } from 'lucide-react';
import Modal from './Modal';
import { reconcileBalance, fetchExchangeRates, getUserId, saveUserPrefs } from '../utils/api';
import { formatCurrency, getCurrency, haptic } from '../utils/format';
import { reportingTransactions } from '../utils/reportingCurrency';
import { monthCloseReport, monthLabel } from '../utils/monthClose';
import { rememberClosedMonth } from '../utils/closedMonths';
import { spring } from '../motion/presets';

const STEPS = ['Balances', 'Review', 'Close'];

/*
 * Monthly close. A short end-of-month routine:
 *   1. Balances  check each account against what the bank says (optional)
 *   2. Review    income, spending, top categories, budgets, loose ends
 *   3. Close     record the month as closed (synced via user prefs)
 */
export default function MonthCloseModal({ isOpen, onClose, month, accounts = [], transactions = [], budgets = [], onClosed }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [actuals, setActuals] = useState({});
  const [busy, setBusy] = useState(false);
  const [rates, setRates] = useState(null);
  const base = getCurrency();

  useEffect(() => {
    if (!isOpen) return;
    setStep(0); setActuals({}); setBusy(false);
    fetchExchangeRates().then(setRates).catch(() => setRates(null));
  }, [isOpen, month]);

  const liveAccounts = useMemo(() => accounts.filter((a) => a && !a.archived), [accounts]);

  const report = useMemo(() => {
    let rows = transactions;
    let estimated = false;
    try { rows = reportingTransactions(transactions, accounts, base, rates); }
    catch { estimated = true; }
    return { ...monthCloseReport({ transactions: rows, budgets, month }), estimated };
  }, [transactions, accounts, budgets, month, base, rates]);

  const changes = liveAccounts
    .map((a) => {
      const raw = actuals[a.id];
      if (raw === undefined || String(raw).trim() === '') return null;
      const actual = Math.round(Number.parseFloat(raw) * 100) / 100;
      if (!Number.isFinite(actual)) return null;
      const expected = Math.round((Number(a.balance) || 0) * 100) / 100;
      return actual === expected ? null : { account: a, expected, actual, diff: Math.round((actual - expected) * 100) / 100 };
    })
    .filter(Boolean);

  const applyBalances = async () => {
    if (changes.length === 0) { setStep(1); return; }
    setBusy(true);
    const failed = [];
    for (const c of changes) {
      try { await reconcileBalance(c.account.id, c.expected, c.actual, `Month close · ${monthLabel(month)}`); }
      catch (err) { failed.push(`${c.account.name}: ${err?.message || 'failed'}`); }
    }
    setBusy(false);
    if (failed.length) { toast.error(failed[0]); return; }
    toast.success(`${changes.length} balance${changes.length > 1 ? 's' : ''} corrected`);
    window.dispatchEvent(new Event('vm:data-changed'));
    setStep(1);
  };

  const closeMonth = async () => {
    setBusy(true);
    const record = {
      closed_at: new Date().toISOString(),
      income: report.income, expense: report.expense, net: report.net,
      currency: base, over_budget: report.overBudget.length,
    };
    try {
      const uid = await getUserId();
      rememberClosedMonth(month, record);
      if (uid) await saveUserPrefs(uid, { closed_months: { [month]: record } });
      haptic(); toast.success(`${monthLabel(month)} closed`);
      onClosed?.(month, record);
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Could not close the month');
    } finally { setBusy(false); }
  };

  const money = (v, cur) => formatCurrency(v, cur ? { currency: cur } : undefined);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Close ${monthLabel(month)}`}>
      <div className="mclose">
        <ol className="mclose-steps" aria-label="Progress">
          {STEPS.map((s, i) => (
            <li key={s} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span>{i < step ? <Check size={12} strokeWidth={3} /> : i + 1}</span>{s}
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={spring.liquid}
          >
            {step === 0 && (
              <section>
                <p className="mclose-lead">Open your banking app and type in any balance that doesn't match. Leave the rest empty. A correction entry is added for each difference.</p>
                <div className="mclose-accounts">
                  {liveAccounts.length === 0 && <p className="mclose-muted">No accounts yet.</p>}
                  {liveAccounts.map((a) => {
                    const c = changes.find((x) => x.account.id === a.id);
                    return (
                      <label key={a.id} className="mclose-acc">
                        <span className="mclose-acc-name">
                          <strong>{a.name}</strong>
                          <small>In app: {money(a.balance, a.currency)}</small>
                        </span>
                        <span className="mclose-acc-input">
                          <input
                            type="number" inputMode="decimal" step="0.01"
                            placeholder="Matches"
                            aria-label={`Actual balance for ${a.name}`}
                            value={actuals[a.id] ?? ''}
                            onChange={(e) => setActuals((p) => ({ ...p, [a.id]: e.target.value }))}
                          />
                          {c && <small className={c.diff > 0 ? 'pos' : 'neg'}>{c.diff > 0 ? '+' : ''}{money(c.diff, a.currency)}</small>}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="mclose-actions">
                  <button type="button" className="btn btn-secondary" onClick={onClose}>Later</button>
                  <button type="button" className="btn btn-primary" onClick={applyBalances} disabled={busy}>
                    {busy ? 'Saving…' : changes.length ? `Correct ${changes.length} & continue` : 'All match · continue'}
                  </button>
                </div>
              </section>
            )}

            {step === 1 && (
              <section>
                <div className="mclose-stats">
                  <div><small>Income</small><strong className="pos">{money(report.income)}</strong></div>
                  <div><small>Spent</small><strong className="neg">{money(report.expense)}</strong></div>
                  <div><small>Saved</small><strong className={report.net >= 0 ? 'pos' : 'neg'}>{money(report.net)}</strong>
                    {report.savingsRate !== null && <em>{Math.round(report.savingsRate * 100)}% of income</em>}</div>
                </div>
                {report.estimated && <p className="mclose-muted">Exchange rates unavailable. Totals add amounts as recorded, without converting currencies.</p>}

                {report.topCategories.length > 0 && (
                  <div className="mclose-block">
                    <h3>Where it went</h3>
                    {report.topCategories.map((c) => (
                      <div key={c.category} className="mclose-cat">
                        <span>{c.category}</span>
                        <span className="mclose-cat-bar"><motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(c.share * 100, 2)}%` }} transition={spring.liquid} /></span>
                        <strong>{money(c.amount)}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {report.budgetResults.length > 0 && (
                  <div className="mclose-block">
                    <h3>Budgets {report.overBudget.length > 0 ? `· ${report.overBudget.length} over` : '· all within limit'}</h3>
                    {report.budgetResults.slice(0, 6).map((b) => (
                      <div key={b.id || b.category} className={`mclose-budget ${b.over ? 'is-over' : ''}`}>
                        <span>{b.over ? <AlertTriangle size={13} /> : <Check size={13} />} {b.category}</span>
                        <span>{money(b.spent)} / {money(b.limit)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {report.uncategorised.length > 0 && (
                  <div className="ui-banner ui-banner-info">
                    <div>
                      <strong>{report.uncategorised.length} transaction{report.uncategorised.length > 1 ? 's' : ''} without a category</strong>
                      <p>Categorise them so next month's report is accurate.</p>
                    </div>
                    <div className="ui-banner-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => { onClose(); navigate('/transactions'); }}>Open transactions</button>
                    </div>
                  </div>
                )}

                {report.count === 0 && <p className="mclose-muted">Nothing was recorded this month.</p>}

                <div className="mclose-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep(0)}>Back</button>
                  <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>Continue</button>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="mclose-final">
                <div className="mclose-seal" aria-hidden="true"><Check size={30} strokeWidth={2.6} /></div>
                <h3>Close {monthLabel(month)}?</h3>
                <p className="mclose-lead">
                  You saved <strong>{money(report.net)}</strong>
                  {report.overBudget.length > 0 ? `, with ${report.overBudget.length} budget${report.overBudget.length > 1 ? 's' : ''} over the limit.` : '.'}
                  {' '}This records the month as reviewed. Nothing is locked, and you can still edit its transactions.
                </p>
                <div className="mclose-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setStep(1)}>Back</button>
                  <button type="button" className="btn btn-primary" onClick={closeMonth} disabled={busy}>{busy ? 'Closing…' : 'Close month'}</button>
                </div>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  );
}
