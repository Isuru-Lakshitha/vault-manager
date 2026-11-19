import { motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { spring } from '../motion/presets';

// Bills and Recurring live under one nav entry; this switch moves between
// them. Both URLs keep working (/bills, /recurring), so links and alerts
// that point at either still land on the right tab.
const TABS = [
  { seg: 'bills', label: 'Bills', hint: 'One-off and upcoming due dates' },
  { seg: 'recurring', label: 'Recurring', hint: 'Subscriptions, salary and repeating rules' },
];

export default function BillsHubTabs({ children }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // Last path segment, so this also works under a prefix (test harness).
  const current = pathname.replace(/\/$/, '').split('/').pop();
  return (
    <>
      <div className="hub-seg-row">
        <div className="hub-seg" role="tablist" aria-label="Bills and recurring">
          {TABS.map((t) => {
            const active = current === t.seg;
            return (
              <button
                key={t.seg}
                type="button"
                role="tab"
                aria-selected={active}
                title={t.hint}
                onClick={() => { if (!active) navigate(pathname.replace(/[^/]+\/?$/, t.seg), { replace: true }); }}
              >
                {active && <motion.span layoutId="hub-seg-pill" className="hub-seg-pill" transition={spring.liquid} />}
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      {children}
    </>
  );
}
