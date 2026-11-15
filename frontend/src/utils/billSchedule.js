export function advanceBill(bill) {
  if (!bill.frequency || bill.frequency === 'Once') return { paid: true };
  const [year, month, day] = bill.due_date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  if (!Number.isFinite(next.getTime()) || next.toISOString().slice(0,10) !== bill.due_date) throw new Error('Invalid bill due date');
  if (bill.frequency === 'Weekly') next.setUTCDate(day + 7);
  else if (['Monthly', 'Yearly'].includes(bill.frequency)) {
    const targetMonth = month - 1 + (bill.frequency === 'Monthly' ? 1 : 12);
    const anchor = bill.billing_day || day;
    const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
    next.setUTCDate(1); next.setUTCMonth(targetMonth); next.setUTCDate(Math.min(anchor, lastDay));
  } else throw new Error('Unsupported bill frequency');
  return { paid: false, due_date: next.toISOString().slice(0,10), billing_day: bill.billing_day || day };
}
