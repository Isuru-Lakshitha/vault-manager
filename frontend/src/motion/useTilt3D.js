import { useEffect } from 'react';

/*
 * Delegated pointer-driven 3D tilt.
 *
 * One listener on `containerRef` drives every descendant marked `[data-tilt]`.
 * It writes CSS custom properties only (no React re-renders):
 *   --rx / --ry  rotation in degrees    --mx / --my  pointer position (0–100%)
 * and toggles `.is-tilting` while the pointer is over a card. The actual
 * transform, sheen and depth layers live in CSS (see pages/dashboard.css).
 *
 * Disabled on touch / coarse pointers and under prefers-reduced-motion, so
 * figures stay perfectly still where tilt would hurt readability.
 */
export default function useTilt3D(containerRef, { max = 7, selector = '[data-tilt]' } = {}) {
  useEffect(() => {
    const root = containerRef.current;
    if (!root || typeof window === 'undefined') return undefined;

    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!finePointer.matches || reduced.matches) return undefined;

    let active = null;
    let frame = 0;
    let last = null;

    const apply = () => {
      frame = 0;
      if (!active || !last) return;
      const r = active.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (last.x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (last.y - r.top) / r.height));
      // Scale the angle down for wide cards so they never swing too far.
      const k = Math.min(1, 420 / Math.max(r.width, 1));
      active.style.setProperty('--ry', `${((px - 0.5) * 2 * max * k).toFixed(2)}deg`);
      active.style.setProperty('--rx', `${((0.5 - py) * 2 * max * k).toFixed(2)}deg`);
      active.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      active.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    };

    const release = (el) => {
      if (!el) return;
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };

    const onMove = (e) => {
      const el = e.target instanceof Element ? e.target.closest(selector) : null;
      if (el !== active) {
        release(active);
        active = el && root.contains(el) ? el : null;
        if (active) active.classList.add('is-tilting');
      }
      last = { x: e.clientX, y: e.clientY };
      if (active && !frame) frame = requestAnimationFrame(apply);
    };

    const onLeave = () => { release(active); active = null; };

    root.addEventListener('pointermove', onMove, { passive: true });
    root.addEventListener('pointerleave', onLeave);
    return () => {
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      if (frame) cancelAnimationFrame(frame);
      release(active);
    };
  }, [containerRef, max, selector]);
}
