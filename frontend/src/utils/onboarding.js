/*
 * First-run checklist. Each step is "done" based on the user's real data, so
 * the card ticks itself off as they use the app and never needs saving.
 */
export const SETUP_STEPS = Object.freeze([
  { id: 'account', title: 'Add an account', hint: 'Bank, cash or wallet — where your money lives.', to: '/accounts' },
  { id: 'balance', title: 'Set its current balance', hint: 'So your net worth starts from the right number.', to: '/accounts' },
  { id: 'transaction', title: 'Record a transaction', hint: 'Anything you spent or earned today.', event: 'vm:quick-add' },
  { id: 'budget', title: 'Set a monthly budget', hint: 'Get a heads-up before a category runs out.', to: '/budgets' },
]);

const num = (v) => Number.parseFloat(v) || 0;

export function setupProgress({ accounts = [], transactions = [], budgets = [] } = {}) {
  const live = (accounts || []).filter((a) => a && !a.archived);
  const done = {
    account: live.length > 0,
    balance: live.some((a) => num(a.balance) !== 0 || num(a.opening_balance) !== 0),
    transaction: (transactions || []).length > 0,
    budget: (budgets || []).length > 0,
  };
  const steps = SETUP_STEPS.map((s) => ({ ...s, done: done[s.id] }));
  const completed = steps.filter((s) => s.done).length;
  return { steps, completed, total: steps.length, finished: completed === steps.length };
}
