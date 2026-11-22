import { useEffect, useRef, useState } from 'react';

/*
 * Shared Three.js plumbing for the app's 3D scenes (Login, Dashboard,
 * Analytics). Three.js is imported on demand, so it lands in its own chunk
 * and only loads on pages that show a scene.
 *
 *   const { canvasRef, status } = useThreeScene(build, [deps]);
 *   <canvas ref={canvasRef} />  // status: 'loading' | 'ready' | 'unsupported'
 *
 * `build(ctx)` creates the scene once and returns { update(t, dt), dispose? }.
 * ctx = { THREE, scene, camera, renderer, colors, reduced, pointer, size }.
 *
 * Built in: transparent canvas (the glass card behind shows through), DPR
 * capped for battery, resize via ResizeObserver, no rendering while
 * off-screen or the tab is hidden, a single still frame for
 * prefers-reduced-motion, theme colours from CSS tokens (rebuilt when the
 * theme changes), and full disposal on unmount.
 */
export function readThemeColors() {
  const cs = getComputedStyle(document.body);
  const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  return {
    accent: v('--mm-accent', '#5b8def'),
    accent2: '#8b7cf6',
    success: v('--mm-success', '#3dbb84'),
    danger: v('--mm-danger', '#e5636b'),
    text: v('--mm-text', '#e8eaed'),
    text2: v('--mm-text-2', '#a6adb8'),
    light: document.body.classList.contains('light-mode'),
  };
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch { return false; }
}

export function useThreeScene(build, deps = []) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [themeKey, setThemeKey] = useState(() => (typeof document !== 'undefined' && document.body.classList.contains('light-mode') ? 'light' : 'dark'));

  // Rebuild when light/dark flips.
  useEffect(() => {
    const mo = new MutationObserver(() => setThemeKey(document.body.classList.contains('light-mode') ? 'light' : 'dark'));
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    if (!webglAvailable()) { setStatus('unsupported'); return undefined; }
    let disposed = false;
    let cleanup = () => {};

    import('three').then((THREE) => {
      if (disposed || !canvasRef.current) return;
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
      } catch { setStatus('unsupported'); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
      const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
      const size = { w: 1, h: 1 };
      const ctx = { THREE, scene, camera, renderer, colors: readThemeColors(), reduced, pointer, size, alive: true };
      // 5: a scene that fails to build must not leak its renderer.
      let api;
      try { api = build(ctx) || {}; } catch { renderer.dispose(); setStatus('unsupported'); return; }

      const resize = () => {
        const r = canvas.getBoundingClientRect();
        size.w = Math.max(1, Math.round(r.width)); size.h = Math.max(1, Math.round(r.height));
        renderer.setSize(size.w, size.h, false);
        camera.aspect = size.w / size.h;
        camera.updateProjectionMatrix();
        api.resize?.(size.w, size.h);
        if (reduced || !running) renderer.render(scene, camera);
      };

      // Gentle pointer parallax (eased toward the target each frame).
      const onPointer = (e) => {
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return; // hidden canvas: avoid ±Infinity/NaN
        const clamp = (v) => Math.max(-1, Math.min(1, v));
        // Measured against the canvas but heard page-wide, so clamp to [-1, 1].
        pointer.tx = clamp(((e.clientX - r.left) / r.width) * 2 - 1);
        pointer.ty = clamp(((e.clientY - r.top) / r.height) * 2 - 1);
      };

      let running = false;
      let visible = true;
      let raf = 0;
      let last = performance.now();
      const start = performance.now();
      const frame = (now) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        pointer.x += (pointer.tx - pointer.x) * Math.min(1, dt * 4);
        pointer.y += (pointer.ty - pointer.y) * Math.min(1, dt * 4);
        api.update?.((now - start) / 1000, dt);
        renderer.render(scene, camera);
      };
      const play = () => { if (!running && !reduced && visible && !document.hidden) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } };
      const pause = () => { running = false; cancelAnimationFrame(raf); };

      const ro = new ResizeObserver(resize);
      ro.observe(canvas);
      const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) play(); else pause(); });
      io.observe(canvas);
      const onVis = () => (document.hidden ? pause() : play());
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('pointermove', onPointer, { passive: true });

      resize();
      if (reduced) { api.update?.(10, 0); renderer.render(scene, camera); } // settled still frame
      else play();
      setStatus('ready');

      cleanup = () => {
        ctx.alive = false;
        pause(); ro.disconnect(); io.disconnect();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('pointermove', onPointer);
        api.dispose?.();
        scene.traverse((o) => {
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          mats.forEach((m) => { Object.values(m).forEach((val) => val?.isTexture && val.dispose()); m.dispose(); });
        });
        scene.environment?.dispose?.();
        renderer.dispose();
      };
    }).catch(() => setStatus('unsupported'));

    return () => { disposed = true; cleanup(); };
  }, [themeKey, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  return { canvasRef, status };
}

/** Image-based lighting so glass and metal have something to reflect. */
export async function addStudioLighting(ctx) {
  const { THREE, scene, renderer } = ctx;
  const { RoomEnvironment } = await import('three/examples/jsm/environments/RoomEnvironment.js');
  if (!ctx.alive) return false; // scene was torn down while loading
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  room.dispose(); // frees the room's GPU geometry/materials
  pmrem.dispose();
  return true;
}

/** Add lighting, then draw once more (for still frames) only if still alive. */
export function lightAndRender(ctx) {
  addStudioLighting(ctx)
    .then((ok) => { if (ok && ctx.alive) ctx.renderer.render(ctx.scene, ctx.camera); })
    .catch(() => {});
}
