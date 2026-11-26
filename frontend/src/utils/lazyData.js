// On-demand loaders for the Firestore-backed modules. The sign-in page and
// app shell import these instead of api.js/adminService.js directly, so the
// database library (~170 KB gzip) downloads only once someone is signed in.
let apiMod = null;
let apiPromise = null;
let adminPromise = null;

export const loadApi = () => (apiPromise ??= import('./api.js').then((m) => (apiMod = m)));
/** The api module if it has already loaded, else null (for sync reads like getCache). */
export const apiIfLoaded = () => apiMod;
export const loadAdmin = () => (adminPromise ??= import('./adminService.js'));
/** The admin module's promise if loading has started, else null (never starts it). */
export const adminIfStarted = () => adminPromise;
export const loadNotifications = () => import('./notificationService.js');
