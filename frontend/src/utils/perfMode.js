// Lighter visuals for the Android app. Its WebView stutters on the glass
// effects (backdrop blur, SVG lens), endless decorative animations and the
// Three.js scenes, so there `html.perf-lite` turns those off (see glass.css)
// and the 3D scenes are not loaded. Browsers keep the full look.

/** True inside the Android app (Capacitor). */
export const isLiteEffects = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;

/** Call once at startup, before the first render. */
export function applyPerfMode() {
  if (isLiteEffects()) document.documentElement.classList.add('perf-lite');
}
