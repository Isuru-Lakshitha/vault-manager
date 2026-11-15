/**
 * Financial Achievements, Badges & Level-Up Engine
 */

export const BADGE_DEFINITIONS = [
  {
    id: 'fortress_builder',
    title: 'Fortress Builder',
    category: 'Security',
    icon: '🛡️',
    description: 'Accumulate 3 or more months of emergency living runway.',
    xp: 350,
    check: ({ runwayMonths }) => (runwayMonths || 0) >= 3
  },
  {
    id: 'budget_disciplinarian',
    title: 'Budget Disciplinarian',
    category: 'Discipline',
    icon: '🎯',
    description: 'Keep 100% of active budgets within limit with 0 breaches.',
    xp: 300,
    check: ({ budgets, expenses }) => {
      if (!budgets || budgets.length === 0) return false;
      return budgets.every(b => (expenses[b.category] || 0) <= b.amount);
    }
  },
  {
    id: 'zen_master',
    title: 'Zen Master',
    category: 'Mindfulness',
    icon: '🧘',
    description: 'Achieve 5 or more zero-spend days in the current month.',
    xp: 250,
    check: ({ zeroSpendDays }) => (zeroSpendDays || 0) >= 5
  },
  {
    id: 'wealth_compounder',
    title: 'Wealth Compounder',
    category: 'Growth',
    icon: '📈',
    description: 'Attain a net monthly savings rate of 30% or higher.',
    xp: 350,
    check: ({ savingsRate }) => (savingsRate || 0) >= 30
  },
  {
    id: 'quick_tracker',
    title: 'Active Ledger',
    category: 'Habits',
    icon: '⚡',
    description: 'Log 25 or more transactions in your personal financial ledger.',
    xp: 200,
    check: ({ transactionCount }) => (transactionCount || 0) >= 25
  },
  {
    id: 'debt_slasher',
    title: 'Debt Slasher',
    category: 'Freedom',
    icon: '⚔️',
    description: 'Keep liabilities under control or pay down an active loan.',
    xp: 300,
    check: ({ loans }) => {
      if (!loans || loans.length === 0) return true; // debt-free!
      return loans.some(l => l.status === 'Paid' || (l.total_paid || 0) > 0);
    }
  },
  {
    id: 'goal_conqueror',
    title: 'Goal Conqueror',
    category: 'Milestones',
    icon: '🏆',
    description: 'Fully achieve (100%) or surpass a financial savings goal.',
    xp: 400,
    check: ({ goals }) => {
      if (!goals || goals.length === 0) return false;
      return goals.some(g => g.is_achieved || (g.target_amount > 0 && g.current_amount >= g.target_amount));
    }
  },
  {
    id: 'global_citizen',
    title: 'Global Citizen',
    category: 'Treasury',
    icon: '💱',
    description: 'Hold accounts across multiple currencies or utilize currency conversions.',
    xp: 250,
    check: ({ accounts }) => {
      if (!accounts || accounts.length === 0) return false;
      const currencies = new Set(accounts.map(a => a.currency || 'LKR'));
      return currencies.size >= 2;
    }
  }
];

export const RANKS = [
  { level: 1, title: 'Novice Ledger', minXp: 0, maxXp: 400, color: '#94a3b8', badge: 'Tier I' },
  { level: 2, title: 'Tactical Saver', minXp: 400, maxXp: 850, color: '#38bdf8', badge: 'Tier II' },
  { level: 3, title: 'Wealth Strategist', minXp: 850, maxXp: 1350, color: '#818cf8', badge: 'Tier III' },
  { level: 4, title: 'Fortress Architect', minXp: 1350, maxXp: 1900, color: '#a78bfa', badge: 'Tier IV' },
  { level: 5, title: 'FinTech Legend', minXp: 1900, maxXp: 2400, color: '#4ade80', badge: 'Max Tier' }
];

export function evaluateAchievements(state) {
  let totalXp = 0;
  const badges = BADGE_DEFINITIONS.map(badge => {
    let unlocked = false;
    try {
      unlocked = !!badge.check(state);
    } catch {
      unlocked = false;
    }
    if (unlocked) {
      totalXp += badge.xp;
    }
    return {
      ...badge,
      unlocked
    };
  });

  // Calculate current rank
  let currentRank = RANKS[0];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalXp >= RANKS[i].minXp) {
      currentRank = RANKS[i];
      break;
    }
  }

  const nextRank = RANKS.find(r => r.level === currentRank.level + 1) || null;
  const rankProgress = nextRank
    ? Math.min(100, Math.round(((totalXp - currentRank.minXp) / (nextRank.minXp - currentRank.minXp)) * 100))
    : 100;

  return {
    badges,
    unlockedCount: badges.filter(b => b.unlocked).length,
    totalBadges: badges.length,
    totalXp,
    currentRank,
    nextRank,
    rankProgress
  };
}
