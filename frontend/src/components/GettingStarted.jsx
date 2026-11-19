import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X } from 'lucide-react';
import { setupProgress } from '../utils/onboarding';
import { spring } from '../motion/presets';

const HIDE_KEY = 'vm_getting_started_hidden';

/*
 * Dashboard "Get started" checklist. Shows until every step is done (judged
 * from real data) or the user hides it.
 */
export default function GettingStarted({ accounts, transactions, budgets }) {
  const navigate = useNavigate();
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; }
  });
  const { steps, completed, total, finished } = setupProgress({ accounts, transactions, budgets });
  const show = !hidden && !finished;

  const hide = () => {
    try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* private mode */ }
    setHidden(true);
  };
  const go = (step) => {
    if (step.event) window.dispatchEvent(new Event(step.event));
    else if (step.to) navigate(step.to);
  };
  const next = steps.find((s) => !s.done);

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.section
          className="getting-started"
          aria-label="Get started"
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8, scale: 0.98 }}
          transition={spring.liquid}
        >
          <header className="gs-head">
            <div>
              <h2>Get started</h2>
              <p>{completed} of {total} done · takes about two minutes</p>
            </div>
            <button type="button" className="gs-close" onClick={hide} aria-label="Hide get started">
              <X size={16} />
            </button>
          </header>
          <div className="gs-bar" aria-hidden="true">
            <motion.span animate={{ width: `${(completed / total) * 100}%` }} transition={spring.liquid} />
          </div>
          <ol className="gs-steps">
            {steps.map((s) => (
              <li key={s.id} className={s.done ? 'is-done' : s === next ? 'is-next' : ''}>
                <button type="button" onClick={() => go(s)} disabled={s.done} aria-label={s.done ? `${s.title} (done)` : undefined}>
                  <span className="gs-check" aria-hidden="true">{s.done && <Check size={13} strokeWidth={3} />}</span>
                  <span className="gs-text">
                    <strong>{s.title}</strong>
                    {!s.done && <small>{s.hint}</small>}
                  </span>
                  {!s.done && <ChevronRight size={16} className="gs-go" aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ol>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
