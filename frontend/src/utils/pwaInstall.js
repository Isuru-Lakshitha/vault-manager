/**
 * PWA & Mobile Device Helper Utility
 * Standardizes platform detection, standalone status, and manual install triggers.
 */

export const isIOS = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

export const isSafari = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  // Must contain Safari and not Chrome (CriOS), Firefox (FxiOS), Edge (EdgiOS), etc.
  return isIOS() && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Instagram|FBAN|FBAV/i.test(ua);
};

export const isAndroid = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return /android/i.test(navigator.userAgent);
};

export const isMobileDevice = () => {
  if (typeof window === 'undefined') return false;
  return isIOS() || isAndroid() || /mobile|tablet|android/i.test(navigator.userAgent) || window.innerWidth <= 768;
};

/** Running inside the Android app (Capacitor), not a browser. */
export const isNativeApp = () => typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;

export const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  // The Android app is already installed: never offer to install the web app.
  if (isNativeApp()) return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true
  );
};

export const triggerInstallPrompt = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('vm:open-install'));
  }
};
