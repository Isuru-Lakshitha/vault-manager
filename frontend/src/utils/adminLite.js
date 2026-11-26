// Small, Firestore-free admin helpers that the app shell needs at startup.
// adminService.js re-exports these and adds the Firestore-backed parts.

export const SUPER_ADMIN_EMAIL = 'isuru@moneymanager.app';

/** UI-only check (real enforcement is in firestore.rules). */
export const isSuperAdminUser = (user) => {
  if (!user) return false;
  const email = (user.email || '').toLowerCase().trim();
  return email === SUPER_ADMIN_EMAIL.toLowerCase();
};

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
