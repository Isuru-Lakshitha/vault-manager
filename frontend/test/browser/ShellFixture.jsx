import { useRef } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../../src/components/Sidebar';
import ThemeToggle from '../../src/components/ThemeToggle';
import PullToRefresh from '../../src/motion/PullToRefresh';
import Dashboard from '../../src/pages/Dashboard';
import Transactions from '../../src/pages/Transactions';
import Budgets from '../../src/pages/Budgets';
import Accounts from '../../src/pages/Accounts';
import Analytics from '../../src/pages/Analytics';

// ?page=transactions etc. picks the page inside the shell (default Dashboard).
const PAGES = { dashboard: ['Dashboard', Dashboard], transactions: ['Transactions', Transactions], budgets: ['Budgets', Budgets], accounts: ['Accounts', Accounts], analytics: ['Analytics', Analytics] };

// The real app shell (sidebar, bottom nav dock, top bar, pull-to-refresh)
// around a page, for checking layout without signing in.
export default function ShellFixture() {
  const mainRef = useRef(null);
  const { search } = useLocation();
  const [title, Page] = PAGES[new URLSearchParams(search).get('page')] || PAGES.dashboard;
  return (
    <div className="app-container" style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Sidebar isOpen={false} onSearchOpen={() => {}} />
      <div className="main-content-wrapper">
        <header className="shell-topbar">
          <div className="shell-crumb"><h2><span className="shell-crumb-title">{title}</span></h2></div>
          <div className="shell-actions"><ThemeToggle /></div>
        </header>
        <header className="mobile-header">
          <h2 className="mobile-title"><span className="mobile-title-brand">Vault Manager</span><span className="mobile-title-page" aria-hidden="true">{title}</span></h2>
          <div className="mobile-header-actions"><ThemeToggle /></div>
        </header>
        <main ref={mainRef} className="main-content">
          <PullToRefresh scrollRef={mainRef} onRefresh={() => new Promise(r => setTimeout(r, 500))} />
          <Page key={title} />
        </main>
      </div>
    </div>
  );
}
