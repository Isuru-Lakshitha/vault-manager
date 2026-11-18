import { useEffect, useRef } from 'react';

/*
 * Pull-to-refresh, the way modern mobile sites do it.
 *
 *  • Touch: pull down from the top of the scroll area. The content follows
 *    your finger with rubber-band resistance, a circular indicator fills
 *    as you approach the threshold, and you feel a tick (haptics) when
 *    releasing will refresh.
 *  • Trackpad / mouse wheel: starting a new scroll-up gesture while already
 *    at the top fills the same indicator; it refreshes once it's full.
 *    Momentum from a flick that reaches the top never counts.
 *  • While refreshing, the indicator spins; content eases back when done.
 *
 * Everything runs on native listeners writing styles directly, so the
 * gesture never re-renders React and stays at 60fps.
 *
 * Props:
 *   scrollRef   ref to the scrolling element (window scroll is also handled)
 *   onRefresh   async () => void — awaited while the spinner shows
 *   threshold   px of (resisted) pull needed to trigger, default 72
 */
const MAX_PULL = 128;
const resist = (dy) => MAX_PULL * (1 - Math.exp(-dy / (MAX_PULL * 1.6)));

export default function PullToRefresh({ scrollRef, onRefresh, threshold = 72 }) {
  const indRef = useRef(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    const el = scrollRef?.current;
    const ind = indRef.current;
    if (!el || !ind) return undefined;
    const arc = ind.querySelector('.ptr-arc');
    const ARC_LEN = 2 * Math.PI * 10;

    let startY = null;
    let pull = 0;
    let armed = false;
    let busy = false;
    let wheelAcc = 0;
    let wheelTimer = 0;
    let lastWheel = 0;
    let wheelEligible = false;

    const atTop = () => el.scrollTop <= 0 && window.scrollY <= 0;

    const paint = (y, animate) => {
      pull = y;
      const p = Math.min(1, y / threshold);
      el.style.setProperty('--ptr-y', `${y}px`);
      el.classList.toggle('is-pulling', y > 0 || busy);
      el.classList.toggle('ptr-animate', !!animate);
      ind.style.setProperty('--ptr-p', p.toFixed(3));
      ind.style.transform = `translate3d(-50%, ${Math.min(y, threshold + 12) - 48}px, 0)`;
      ind.style.setProperty('--ptr-rot', `${(p * 270).toFixed(1)}deg`);
      ind.style.opacity = y > 4 || busy ? '1' : '0';
      if (arc) arc.style.strokeDashoffset = String(ARC_LEN * (1 - p * 0.85));
      const nowArmed = p >= 1;
      if (nowArmed !== armed) {
        armed = nowArmed;
        ind.classList.toggle('is-armed', armed);
        if (armed && navigator.vibrate) navigator.vibrate(8);
      }
    };

    const settle = () => {
      paint(0, true);
      ind.classList.remove('is-armed', 'is-refreshing');
      armed = false;
    };

    const trigger = async () => {
      busy = true;
      ind.classList.add('is-refreshing');
      paint(threshold * 0.78, true);
      try { await onRefreshRef.current?.(); } catch { /* caller reports errors */ }
      busy = false;
      settle();
    };

    // ---- Touch ----
    const onStart = (e) => {
      if (busy || e.touches.length !== 1 || !atTop()) { startY = null; return; }
      startY = e.touches[0].clientY;
    };
    const onMove = (e) => {
      if (startY === null || busy) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0) { if (pull) paint(0); return; }
      if (!atTop()) { startY = null; paint(0, true); return; }
      if (e.cancelable) e.preventDefault(); // stop native bounce / browser reload
      paint(resist(dy));
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (armed && !busy) trigger();
      else settle();
    };

    // ---- Trackpad / wheel overscroll at the top ----
    const onWheel = (e) => {
      if (busy || e.ctrlKey) return;
      // Only a *fresh* gesture that begins at the top counts — momentum from a
      // flick that just reached the top must never trigger a refresh.
      const now = performance.now();
      if (now - lastWheel > 260) wheelEligible = atTop() && e.deltaY < 0;
      lastWheel = now;
      if (!wheelEligible || e.deltaY >= 0 || !atTop()) {
        if (wheelAcc) { wheelAcc = 0; settle(); }
        return;
      }
      wheelAcc += -e.deltaY;
      paint(resist(wheelAcc * 0.35));
      clearTimeout(wheelTimer);
      if (armed) { wheelAcc = 0; trigger(); return; }
      wheelTimer = setTimeout(() => { wheelAcc = 0; if (!busy) settle(); }, 180);
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
      clearTimeout(wheelTimer);
      el.classList.remove('is-pulling', 'ptr-animate');
    };
  }, [scrollRef, threshold]);

  return (
    <div ref={indRef} className="ptr-indicator" role="status" aria-live="polite" aria-label="Pull to refresh">
      <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
        <circle className="ptr-track" cx="13" cy="13" r="10" fill="none" strokeWidth="2.4" />
        <circle className="ptr-arc" cx="13" cy="13" r="10" fill="none" strokeWidth="2.4"
          strokeDasharray={2 * Math.PI * 10} strokeDashoffset={2 * Math.PI * 10} strokeLinecap="round" />
      </svg>
      <svg className="ptr-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 19V5M5 12l7-7 7 7" />
      </svg>
    </div>
  );
}
