import { LayoutDashboard, CreditCard, ArrowRightLeft, Landmark, BarChart2, Target, Wallet, Settings, Receipt, TrendingUp, BadgeDollarSign } from 'lucide-react';

export const NAV_ITEMS = [
  { path: '/dashboard',    icon: LayoutDashboard,  label: 'Dashboard', labelKey: 'nav.dashboard',    page: () => import('../pages/Dashboard')    },
  { path: '/accounts',     icon: CreditCard,        label: 'Accounts', labelKey: 'nav.accounts',     page: () => import('../pages/Accounts')     },
  { path: '/transactions', icon: ArrowRightLeft,    label: 'Transactions', labelKey: 'nav.transactions', page: () => import('../pages/Transactions') },
  // One entry for both: /recurring is a tab of the same page (components/BillsHubTabs).
  { path: '/bills', also: ['/recurring'], icon: Receipt, label: 'Bills & Recurring', labelKey: 'nav.bills', page: () => Promise.all([import('../pages/Bills'), import('../pages/Recurring')]) },
  { path: '/loans',        icon: Landmark,          label: 'Loans', labelKey: 'nav.loans',        page: () => import('../pages/Loans')        },
  { path: '/budgets',      icon: Target,            label: 'Budgets', labelKey: 'nav.budgets',      page: () => import('../pages/Budgets')      },
  { path: '/goals',        icon: Wallet,            label: 'Goals', labelKey: 'nav.goals',        page: () => import('../pages/Goals')        },
  { path: '/investments',  icon: TrendingUp,        label: 'Investments', labelKey: 'nav.investments',  page: () => import('../pages/Investments')  },
  { path: '/credit-cards', icon: BadgeDollarSign,   label: 'Credit Cards', labelKey: 'nav.creditCards', page: () => import('../pages/CreditCards') },
  { path: '/analytics',    icon: BarChart2,         label: 'Analytics', labelKey: 'nav.analytics',    page: () => import('../pages/Analytics')   },
  { path: '/settings',     icon: Settings,          label: 'Settings', labelKey: 'nav.settings',     page: () => import('../pages/Settings')    },
];
