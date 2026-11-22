// How the Dashboard's 3D coin stacks split between assets and debt.
export const TOTAL_COINS = 14;

/** How many coins each stack gets (always at least one for a non-zero side). */
export function stackCounts(assets, debt) {
  const a = Math.max(0, Number(assets) || 0);
  const d = Math.max(0, Number(debt) || 0);
  if (a + d === 0) return { a: 0, d: 0 };
  let na = Math.round((TOTAL_COINS * a) / (a + d));
  let nd = TOTAL_COINS - na;
  if (a > 0 && na === 0) { na = 1; nd -= 1; }
  if (d > 0 && nd === 0) { nd = 1; na -= 1; }
  return { a: na, d: nd };
}
