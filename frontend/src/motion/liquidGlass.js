/*
 * Liquid Glass runtime (pairs with styles/glass.css).
 *
 *  1. Lensing: injects an SVG displacement filter and, only on Chromium
 *     (the one engine that supports `backdrop-filter: url()`), adds
 *     html.lg-lens so glass bends the content behind it. Other browsers keep
 *     the plain frosted blur — they would drop the whole backdrop-filter if
 *     given url(), so we never send it to them.
 *  2. Light bloom: a delegated pointer listener writes --gx/--gy on the
 *     .lg-interactive control under the pointer, so a soft highlight follows
 *     the finger like light inside glass. No React, no re-renders.
 *  3. Scroll state: html.lg-scrolled once content passes under the top bar
 *     (the bar turns to glass), html.lg-scroll-down while scrolling down
 *     (the floating tab bar minimises, iOS 26 style).
 */
let started = false;

// Controls that get the pointer-following light bloom (mirrors glass.css).
export const LG_INTERACTIVE = '.lg-interactive, .bottom-nav-item, .bottom-nav-fab, .menu-toggle, .shell-search, .shell-primary, .dash-seg button, .theme-seg button';

function injectFilter() {
  if (document.getElementById('lg-filters')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('id', 'lg-filters');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `
    <filter id="lg-distort" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="noise"/>
      <feGaussianBlur in="noise" stdDeviation="2" result="soft"/>
      <feDisplacementMap in="SourceGraphic" in2="soft" scale="38" xChannelSelector="R" yChannelSelector="G"/>
    </filter>`;
  document.body.appendChild(svg);
}

function supportsLens() {
  try {
    const brands = navigator.userAgentData?.brands || [];
    const chromium = brands.some((b) => /Chromium|Google Chrome|Microsoft Edge/i.test(b.brand));
    return chromium && CSS.supports('backdrop-filter', 'url(#lg-distort) blur(1px)');
  } catch {
    return false;
  }
}

function setupBloom() {
  let el = null;
  let frame = 0;
  let pt = null;
  const paint = () => {
    frame = 0;
    if (!el || !pt) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${(((pt.x - r.left) / r.width) * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(((pt.y - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  document.addEventListener('pointermove', (e) => {
    const t = e.target instanceof Element ? e.target.closest(LG_INTERACTIVE) : null;
    el = t;
    if (!t) return;
    pt = { x: e.clientX, y: e.clientY };
    if (!frame) frame = requestAnimationFrame(paint);
  }, { passive: true });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target instanceof Element ? e.target.closest(LG_INTERACTIVE) : null;
    if (!t) return;
    el = t; pt = { x: e.clientX, y: e.clientY }; paint();
  }, { passive: true });
}

function setupScrollState() {
  const root = document.documentElement;
  let lastY = 0;
  const read = (target) => (
    target && target.nodeType === 1 && target.classList.contains('main-content')
      ? target.scrollTop
      : window.scrollY
  );
  // Class toggles are cheap, so update on every scroll event (no rAF: it can
  // be paused in background/throttled contexts and the state would go stale).
  const onScroll = (e) => {
    const t = e.target;
    if (t && t.nodeType === 1 && !t.classList.contains('main-content')) return; // inner scrollers (tables, chips)
    const y = read(t);
    root.classList.toggle('lg-scrolled', y > 8);
    // Past the page's large heading → the bar takes over the title.
    root.classList.toggle('lg-title', y > 56);
    if (Math.abs(y - lastY) > 6) {
      root.classList.toggle('lg-scroll-down', y > lastY && y > 64);
      lastY = y;
    }
  };
  // Capture phase catches scrolls of .main-content as well as the window.
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  // Route changes reset the state from App (router navigations don't fire
  // popstate); popstate still covers Back/Forward.
  window.addEventListener('popstate', () => root.classList.remove('lg-scroll-down'));
}

export function initLiquidGlass() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const run = () => {
    injectFilter();
    if (supportsLens()) document.documentElement.classList.add('lg-lens');
    setupBloom();
    setupScrollState();
  };
  if (document.body) run();
  else document.addEventListener('DOMContentLoaded', run, { once: true });
}
