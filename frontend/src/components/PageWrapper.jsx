import { useRef } from 'react';
import useTilt3D from '../motion/useTilt3D';

/*
 * Page shell container used by every route.
 *  • Entrance: mounting a fresh shell triggers the CSS entrance in
 *    styles/motion.css (fade + staggered rise). No exit-blocking, so route
 *    switches stay instant.
 *  • Depth: cards on every page get the shared pointer tilt + light from
 *    styles/depth.css. Elements marked [data-tilt] are driven by their own
 *    page (e.g. the Dashboard) and are skipped here.
 */
const TILT_CARDS = [
  '.bento-item', '.hud-panel', '.ins-card', '.txi-card',
  '.monthly-strip-item', '.acc-card', '.ui-card', '.depth-tilt',
].map(s => `${s}:not([data-tilt])`).join(', ');

const PageWrapper = ({ children }) => {
  const ref = useRef(null);
  useTilt3D(ref, { selector: TILT_CARDS, max: 6, maxWidth: 640 });
  return (
    <div ref={ref} className="page-shell page-enter" style={{ minHeight: '100%' }}>
      {children}
    </div>
  );
};

export default PageWrapper;
