// Small, Firestore-free admin helpers that the app shell needs at startup.
// adminService.js re-exports these and adds the Firestore-backed parts.

export const SUPER_ADMIN_EMAIL = 'isuru@moneymanager.app';

// Admin is an `admin: true` custom claim on the account (set once with
// backend/set-admin.js), read from the signed-in user's ID token.
const adminClaims = new Map();

/**
 * Read the admin claim for this user from their ID token and remember it, so
 * isSuperAdminUser() can answer synchronously while rendering.
 * @returns {Promise<boolean>}
 */
export const loadAdminClaim = async (user) => {
  if (!user?.getIdTokenResult) return false;
  try {
    const { claims } = await user.getIdTokenResult();
    const isAdmin = claims?.admin === true;
    adminClaims.set(user.uid, isAdmin);
    return isAdmin;
  } catch { return adminClaims.get(user.uid) === true; }
};

/** UI-only check (real enforcement is in firestore.rules). */
export const isSuperAdminUser = (user) => !!user && adminClaims.get(user.uid) === true;

// system_config/global is mirrored to localStorage so the UI can read it
// synchronously before Firestore has loaded.
export const CONFIG_CACHE_KEY = 'vm_system_config';

export const readConfigCache = () => {
  try {
    const raw = localStorage.getItem(CONFIG_CACHE_KEY);
    if (raw) return JSON.parse(raw) || {};
  } catch {}
  return {};
};

export const getMaintenanceMode = () => readConfigCache().maintenance || { active: false, reason: '' };
