// Test-harness stand-in for vite-plugin-pwa's virtual module (the harness
// config does not load the PWA plugin). Behaves as "no update pending".
const noop = () => {};
export function useRegisterSW() {
  return {
    needRefresh: [false, noop],
    offlineReady: [false, noop],
    updateServiceWorker: async () => {},
  };
}
