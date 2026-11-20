import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { setupProgress } from '../utils/onboarding';
import { spring } from '../motion/presets';
import { useT } from '../i18n';
import CurrencyPickerModal, { CURRENCY_CHOSEN_KEY } from './CurrencyPickerModal';

const HIDE_KEY = 'vm_getting_started_hidden';

/*
 * Dashboard "Get started" checklist. Shows until every step is done (judged
 * from real data) or the user hides it.
 */
export default function GettingStarted({ accounts, transactions, budgets }) {
  const navigate = useNavigate();
  const t = useT();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [currencyChosen, setCurrencyChosen] = useState(() => {
    try { return localStorage.getItem(CURRENCY_CHOSEN_KEY) === '1'; } catch { return false; }
  });
  const { steps, completed, total, finished } = setupProgress({ accounts, transactions, budgets, currencyChosen });
  const show = !hidden && !finished;

  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private mode */ }
    setHidden(true);
  };
  const go = (step) => {
    if (step.id === 'currency') setPickerOpen(true);
    else if (step.event) window.dispatchEvent(new Event(step.event));
    else if (step.to) navigate(step.to);
  };
  const next = steps.find((s) => !s.done);

  return (
    <>
    <CurrencyPickerModal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} onChosen={() => setCurrencyChosen(true)} />
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          className="getting-started"
          aria-label={t('gs.title')}
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={spring.liquid}
        >
          <header className="gs-head">
            <div>
              <h2>{t('gs.title')}</h2>
              <p>{t('gs.progress', { done: completed, total })}</p>
            </div>
            <button type="button" className="gs-close" onClick={hide} aria-label={t('gs.hide')}>
              <X size={16} />
            </button>
          </header>
          <div className="gs-bar" aria-hidden="true">
            <motion.span animate={{ width: `${(completed / total) * 100}%` }} transition={spring.liquid} />
          </div>
          <ol className="gs-steps">
            {steps.map((s) => (
              <li key={s.id} className={s.done ? 'is-done' : s === next ? 'is-next' : ''}>
                <button type="button" onClick={() => go(s)} disabled={s.done} aria-label={s.done ? `${t(`gs.${s.id}.title`)} ✓` : undefined}>
                  <span className="gs-check" aria-hidden="true">{s.done && <Check size={13} strokeWidth={3} />}</span>
                  <span className="gs-text">
                    <strong>{t(`gs.${s.id}.title`)}</strong>
                    {!s.done && <small>{t(`gs.${s.id}.hint`)}</small>}
                  </span>
                  {!s.done && <ChevronRight size={16} className="gs-go" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ol>
        </motion.section>
      )}
    </AnimatePresence>
    </>
  );
}
