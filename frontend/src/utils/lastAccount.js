// Remembers the account a user last picked for each flow so forms stop
// silently defaulting to whatever Firestore returns first (accounts[0]).
const key = (scope) => `vm_last_account:${scope}`;

export function getLastAccountId(scope, accounts = []) {
  const usable = accounts.filter(a => !a.archived);
  try {
    const saved = localStorage.getItem(key(scope));
    if (saved && usable.some(a => String(a.id) === saved)) return saved;
  } catch {
    // storage unavailable
  }
  return usable[0]?.id != null ? String(usable[0].id) : '';
}

export function rememberAccountId(scope, id) {
  if (id == null || id === '') return;
  try {
    localStorage.setItem(key(scope), String(id));
  } catch {
    // storage unavailable
  }
}
