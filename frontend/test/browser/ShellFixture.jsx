import { useRef } from 'react';
import Sidebar from '../../src/components/Sidebar';
import ThemeToggle from '../../src/components/ThemeToggle';
import PullToRefresh from '../../src/motion/PullToRefresh';
import Dashboard from '../../src/pages/Dashboard';

// The real app shell (sidebar, bottom nav dock, top bar, pull-to-refresh)
// around a page, for checking layout without signing in.
export default function ShellFixture() {
  const mainRef = useRef(null);
  return (
    <div className="app-container" style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Sidebar isOpen={false} onSearchOpen={() => {}} />
      <div className="main-content-wrapper">
        <header className="shell-topbar">
          <div className="shell-crumb"><h2><span className="shell-crumb-title">Dashboard</span></h2></div>
          <div className="shell-actions"><ThemeToggle /></div>
        </header>
        <header className="mobile-header">
          <h2>Dashboard</h2>
          <div className="mobile-header-actions"><ThemeToggle /></div>
        </header>
        <main ref={mainRef} className="main-content">
          <PullToRefresh scrollRef={mainRef} onRefresh={() => new Promise(r => setTimeout(r, 500))} />
          <Dashboard />
        </main>
      </div>
    </div>
  );
}
