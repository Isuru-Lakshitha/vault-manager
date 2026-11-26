// Rules that are due to be posted on `today` (YYYY-MM-DD). Only monthly rules are
// tracked per month, so weekly and yearly rules are left for the user to pay.
// A fixed-day rule is due only once its day (clamped to the month's last day)
// has arrived, so money is never posted before it actually moves.
export const pendingRecurringRules = (rules, today) => {
  const currentMonth = today.substring(0, 7);
  const [y, m, d] = today.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  return (rules || []).filter(r => {
    if (r.paused || r.last_applied_month === currentMonth) return false;
    if ((r.payment_history || []).some(h => h.month === currentMonth && !h.marked_only)) return false;
    if (r.frequency && r.frequency !== 'Monthly') return false;
    const dom = parseInt(r.day_of_month, 10);
    return !dom || Math.min(dom, daysInMonth) <= d;
  });
};
