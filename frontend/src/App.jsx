import { applyAccent, applyTheme, setThemePref } from './utils/theme';
import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { PageLoading, AppSplash } from './motion/RouteFeedback';
import PullToRefresh from './motion/PullToRefresh';
import ThemeToggle from './components/ThemeToggle';
import { Toaster, toast } from 'react-hot-toast';
import Sidebar, { NAV_ITEMS } from './components/Sidebar';
import Login from './pages/Login';
import EmailVerification from './components/EmailVerification';
import { Menu, Landmark, Plus, Eye, EyeOff, Cloud, Sparkles, Download } from 'lucide-react';
import OfflineBanner from './components/OfflineBanner';
import PrivacyShield from './components/PrivacyShield';
import ErrorBoundary from './components/ErrorBoundary';
import InstallPrompt from './components/InstallPrompt';
import { isStandalone, triggerInstallPrompt } from './utils/pwaInstall';
import QuickAdd from './components/QuickAdd';
import PWAUpdateBanner from './components/PWAUpdateBanner';
import { useStealthMode } from './utils/format';
import { auth } from './utils/firebase';
import { fetchUserPrefs, prefetchAll, startLiveSync, stopLiveSync, invalidateCache, fetchBills, fetchBudgets, fetchTransactions } from './utils/api';
import { getMaintenanceMode, isSuperAdmin, startSystemConfigSync, stopSystemConfigSync, registerUserPresence } from './utils/adminService';
import { checkFinancialTriggers } from './utils/notificationService';
import { getSessionTimeoutMinutes } from './utils/sessionTimeout';

// Auto-retry lazy component imports on chunk mismatch after new deploy
const lazyWithRetry = (importFn) =>
  lazy(async () => {
    const isRetried = JSON.parse(
      window.sessionStorage.getItem('vm_chunk_retry_' + window.location.pathname) || 'false'
    );
    try {
      const comp = await importFn();
      window.sessionStorage.setItem('vm_chunk_retry_' + window.location.pathname, 'false');
      return comp;
    } catch (err) {
      if (!isRetried) {
        window.sessionStorage.setItem('vm_chunk_retry_' + window.location.pathname, 'true');
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          } catch {}
        }
        window.location.reload();
        return { default: () => null };
      }
      throw err;
    }
  });

const dashboardChunkPromise = import('./pages/Dashboard');
const pageImporters = {
  Dashboard: () => dashboardChunkPromise,
  Accounts: () => import('./pages/Accounts'),
  Transactions: () => import('./pages/Transactions'),
  Loans: () => import('./pages/Loans'),
  Analytics: () => import('./pages/Analytics'),
  Budgets: () => import('./pages/Budgets'),
  Goals: () => import('./pages/Goals'),
  Settings: () => import('./pages/Settings'),
  Bills: () => import('./pages/Bills'),
  Investments: () => import('./pages/Investments'),
  CreditCards: () => import('./pages/CreditCards'),
  Recurring: () => import('./pages/Recurring'),
};

const Dashboard = lazyWithRetry(pageImporters.Dashboard);
const Accounts = lazyWithRetry(pageImporters.Accounts);
const Transactions = lazyWithRetry(pageImporters.Transactions);
const Loans = lazyWithRetry(pageImporters.Loans);
const Analytics = lazyWithRetry(pageImporters.Analytics);
const Budgets = lazyWithRetry(pageImporters.Budgets);
const Goals = lazyWithRetry(pageImporters.Goals);
const Settings = lazyWithRetry(pageImporters.Settings);
const Bills = lazyWithRetry(pageImporters.Bills);
const Investments = lazyWithRetry(pageImporters.Investments);
const CreditCards = lazyWithRetry(pageImporters.CreditCards);
const Recurring = lazyWithRetry(pageImporters.Recurring);
const AdminPanel = lazyWithRetry(() => import('./pages/AdminPanel'));
const Privacy = lazyWithRetry(() => import('./pages/Privacy'));
const GlobalSearch = lazyWithRetry(() => import('./components/GlobalSearch'));

// Warm all main route chunks after initial paint so switching pages never waits on network I/O
let _chunksPreloaded = false;
const preloadAllRouteChunks = () => {
  if (_chunksPreloaded) return;
  _chunksPreloaded = true;
  const run = () => {
    Object.values(pageImporters).forEach(fn => {
      try { fn().catch(() => {}); } catch {}
    });
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 1200 });
  } else {
    setTimeout(run, 150);
  }
};

const PinLock = lazyWithRetry(() => import('./components/PinLock'));
const AlertCenter = lazyWithRetry(() => import('./components/AlertCenter'));
const CurrencyConverterModal = lazyWithRetry(() => import('./components/CurrencyConverterModal'));
const RulesManagerModal = lazyWithRetry(() => import('./components/RulesManagerModal'));
const AICoPilotModal = lazyWithRetry(() => import('./components/AICoPilotModal'));
const TaxCapitalGainsModal = lazyWithRetry(() => import('./components/TaxCapitalGainsModal'));
const SplitSettleModal = lazyWithRetry(() => import('./components/SplitSettleModal'));
const InvoiceModal = lazyWithRetry(() => import('./components/InvoiceModal'));
const BankSyncModal = lazyWithRetry(() => import('./components/BankSyncModal'));
const CashFlowCalendarModal = lazyWithRetry(() => import('./components/CashFlowCalendarModal'));
const FIREPlannerModal = lazyWithRetry(() => import('./components/FIREPlannerModal'));
const ReceiptScannerModal = lazyWithRetry(() => import('./components/ReceiptScannerModal'));
const OnboardingWizardModal = lazyWithRetry(() => import('./components/OnboardingWizardModal'));
const SecurityAuditModal = lazyWithRetry(() => import('./components/SecurityAuditModal'));

// Read timeouts from user settings (in minutes → ms). Defaults: 5 min pin lock, 30 min logout.
const getPinLockTimeout = () => {
  const val = parseInt(localStorage.getItem('vm_lock_timeout') || '5', 10);
  if (val === -1) return 2147483647; // Never (max 32-bit int timer)
  if (val === 0) return 1000; // Immediate (1 second after last input)
  return val * 60 * 1000;
};
 // hard logout after 30 min always

const LoadingSpinner = PageLoading;


const AnimatedRoutes = () => (
  <MotionConfig reducedMotion="user">
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard"    element={<Dashboard />} />
        <Route path="/accounts"     element={<Accounts />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/loans"        element={<Loans />} />
        <Route path="/analytics"    element={<Analytics />} />
        <Route path="/budgets"      element={<Budgets />} />
        <Route path="/goals"        element={<Goals />} />
        <Route path="/settings"     element={<Settings />} />
        <Route path="/bills"        element={<Bills />} />
        <Route path="/investments"  element={<Investments />} />
        <Route path="/credit-cards" element={<CreditCards />} />
        <Route path="/recurring"    element={<Recurring />} />
        <Route path="/admin"        element={<AdminPanel />} />
        <Route path="/privacy"      element={<Privacy />} />
      </Routes>
    </Suspense>
  </MotionConfig>
);

// Applies an accent color palette to CSS custom properties on :root


function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!auth.currentUser);
  const [isInitializing, setIsInitializing] = useState(() => !auth.currentUser);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [currencyConverterOpen, setCurrencyConverterOpen] = useState(false);
  const [rulesManagerOpen, setRulesManagerOpen] = useState(false);
  const [aiCoPilotOpen, setAiCoPilotOpen] = useState(false);
  const [taxSuiteOpen, setTaxSuiteOpen] = useState(false);
  const [splitSettleOpen, setSplitSettleOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [bankSyncOpen, setBankSyncOpen] = useState(false);
  const [cashCalendarOpen, setCashCalendarOpen] = useState(false);
  const [firePlannerOpen, setFirePlannerOpen] = useState(false);
  const [receiptScannerOpen, setReceiptScannerOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [securityAuditOpen, setSecurityAuditOpen] = useState(false);
  const [pinLocked, setPinLocked] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(() => isStandalone());
  const [syncStatus, setSyncStatus] = useState(() => ({ online: navigator.onLine, pendingCount: 0, syncing: false }));
  const [maintenanceState, setMaintenanceState] = useState(() => getMaintenanceMode());

  useEffect(() => {
    const onMaint = (e) => setMaintenanceState(e?.detail || getMaintenanceMode());
    window.addEventListener('vm:maintenance-mode-changed', onMaint);
    return () => window.removeEventListener('vm:maintenance-mode-changed', onMaint);
  }, []);
  const mainContentRef = useRef(null);
  const [isStealth, toggleStealth] = useStealthMode();
  const location = useLocation();
  const logoutTimerRef = useRef(null);
  const pinTimerRef = useRef(null);

  useEffect(() => {
    const onInstalled = () => setIsAppInstalled(true);
    const onOnline = () => setSyncStatus(s => ({ ...s, online: true }));
    const onOffline = () => setSyncStatus(s => ({ ...s, online: false }));
    const onSyncState = (e) => {
      setSyncStatus(s => ({
        ...s,
        pendingCount: e.detail?.pendingCount || 0,
        syncing: !!e.detail?.syncing,
      }));
    };
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('vm:sync-state', onSyncState);
    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('vm:sync-state', onSyncState);
    };
  }, []);

  const handlePullRefresh = useCallback(async () => {
    try {
      await prefetchAll();
      window.dispatchEvent(new Event('vm:data-changed'));
      toast.success('Up to date', { duration: 1500 });
    } catch {
      toast.error('Could not refresh — check your connection');
    }
  }, []);

  // Only show Welcome to Vault Manager popup ONCE for a brand-new registered user's very 1st time
  useEffect(() => {
    const user = auth.currentUser;
    if (!isAuthenticated || !user || pinLocked) return;
    const verified = user.emailVerified || isSuperAdmin(user);
    if (!verified) return;

    try {
      const uid = user.uid;
      const isFirstTimeNewUser = localStorage.getItem('vm_first_time_user_' + uid) === 'true';
      const alreadyOnboarded =
        localStorage.getItem('vm_onboarded_' + uid) === 'true' ||
        localStorage.getItem('vm_never_show_onboarding') === 'true';

      if (isFirstTimeNewUser && !alreadyOnboarded && !isSuperAdmin(user)) {
        // Consume the one-time flag immediately so it never shows a 2nd time
        localStorage.removeItem('vm_first_time_user_' + uid);
        localStorage.setItem('vm_onboarded_' + uid, 'true');
        localStorage.setItem('vm_onboarded', 'true');
        localStorage.setItem('vm_never_show_onboarding', 'true');
        setOnboardingOpen(true);
      } else {
        // Ensure existing users are marked as onboarded so the popup never appears
        localStorage.setItem('vm_onboarded_' + uid, 'true');
        localStorage.setItem('vm_onboarded', 'true');
        localStorage.setItem('vm_never_show_onboarding', 'true');
      }
    } catch {}
  }, [isAuthenticated, pinLocked]);

  // Check for PWA App Icon Shortcut (?action=quick-add, ?action=paste-sms, or ?add=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get('action');
    if ((action === 'quick-add' || action === 'paste-sms' || params.get('add') === '1') && isAuthenticated && !pinLocked) {
      setQuickAddOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [isAuthenticated, pinLocked]);

  // Phone-sized viewport (matches the CSS 900px breakpoint)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 900px)');
    const onChange = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Mobile header shows the current page name
  const pageTitle = NAV_ITEMS.find(i => location.pathname.startsWith(i.path))?.label || 'Vault Manager';

  // Bottom-nav FAB → Quick Add; More sheet → Search; Currency Hub; FinTech Tools
  useEffect(() => {
    const openAdd = () => setQuickAddOpen(true);
    const openSearch = () => setSearchOpen(true);
    const openConverter = () => setCurrencyConverterOpen(true);
    const openRules = () => setRulesManagerOpen(true);
    const openAI = () => setAiCoPilotOpen(true);
    const openTax = () => setTaxSuiteOpen(true);
    const openSplit = () => setSplitSettleOpen(true);
    const openInvoices = () => setInvoicesOpen(true);
    const openBank = () => setBankSyncOpen(true);
    const openCalendar = () => setCashCalendarOpen(true);
    const openFIRE = () => setFirePlannerOpen(true);
    const openReceipt = () => setReceiptScannerOpen(true);
    const openOnboarding = () => setOnboardingOpen(true);
    const openAudit = () => setSecurityAuditOpen(true);

    window.addEventListener('vm:quick-add', openAdd);
    window.addEventListener('vm:open-search', openSearch);
    window.addEventListener('vm:open-currency-converter', openConverter);
    window.addEventListener('vm:open-rules-manager', openRules);
    window.addEventListener('vm:open-ai-copilot', openAI);
    window.addEventListener('vm:open-tax-suite', openTax);
    window.addEventListener('vm:open-split-settle', openSplit);
    window.addEventListener('vm:open-invoices', openInvoices);
    window.addEventListener('vm:open-bank-sync', openBank);
    window.addEventListener('vm:open-cash-calendar', openCalendar);
    window.addEventListener('vm:open-fire-planner', openFIRE);
    window.addEventListener('vm:open-receipt-scanner', openReceipt);
    window.addEventListener('vm:open-onboarding', openOnboarding);
    window.addEventListener('vm:open-security-audit', openAudit);

    return () => {
      window.removeEventListener('vm:quick-add', openAdd);
      window.removeEventListener('vm:open-search', openSearch);
      window.removeEventListener('vm:open-currency-converter', openConverter);
      window.removeEventListener('vm:open-rules-manager', openRules);
      window.removeEventListener('vm:open-ai-copilot', openAI);
      window.removeEventListener('vm:open-tax-suite', openTax);
      window.removeEventListener('vm:open-split-settle', openSplit);
      window.removeEventListener('vm:open-invoices', openInvoices);
      window.removeEventListener('vm:open-bank-sync', openBank);
      window.removeEventListener('vm:open-cash-calendar', openCalendar);
      window.removeEventListener('vm:open-fire-planner', openFIRE);
      window.removeEventListener('vm:open-receipt-scanner', openReceipt);
      window.removeEventListener('vm:open-onboarding', openOnboarding);
      window.removeEventListener('vm:open-security-audit', openAudit);
    };
  }, []);

  // Scroll to top on page change (mobile users otherwise land mid-page)
  useEffect(() => { window.scrollTo(0, 0); document.querySelector('.main-content')?.scrollTo?.(0, 0); }, [location.pathname]);

  // Apply saved theme + accent color on mount
  useEffect(() => {
    applyTheme();
    // Apply accent color
    const accent = localStorage.getItem('vm_accent');
    if (accent) applyAccent(accent);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const tag = e.target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable;
      // Cmd/Ctrl+K → search
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearchOpen(s => !s); return; }
      // Escape → close global overlays
      if (e.key === 'Escape') { setSearchOpen(false); setQuickAddOpen(false); return; }
      if (isTyping || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      const onTransactionsPage = window.location.pathname.startsWith('/transactions');
      // N → new transaction (Transactions page handles its own N shortcut)
      if ((e.key === 'n' || e.key === 'N') && !onTransactionsPage) { e.preventDefault(); setQuickAddOpen(true); return; }
      // P → toggle stealth / privacy mode
      if (e.key === 'p' || e.key === 'P') { toggleStealth(); return; }
      // ? → help shortcuts
      if (e.key === '?') {
        toast('⌨️ Shortcuts: [N] Quick Add · [P] Stealth Mode · [⌘K] Command Palette · [/] Search · [Esc] Close', { icon: '💡', duration: 4000 });
        return;
      }
      // / → search (Transactions page focuses its own search bar)
      if (e.key === '/' && !onTransactionsPage) { e.preventDefault(); setSearchOpen(true); return; }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [toggleStealth]);

  const handleLogout = useCallback(async () => {
    setPinLocked(false);
    try {
      await auth.signOut();
    } catch (error) { console.error('Error signing out: ', error); }
  }, []);

  // Show PIN lock screen on inactivity (instead of immediate logout)
  const triggerPinLock = useCallback(() => {
    const hasPinSet = !!localStorage.getItem('vm_pin_hash');
    const timeoutMins = getSessionTimeoutMinutes(auth.currentUser?.uid);
    if (hasPinSet) {
      setPinLocked(true);
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (timeoutMins > 0) {
        logoutTimerRef.current = setTimeout(handleLogout, timeoutMins * 60 * 1000);
      }
    } else if (timeoutMins > 0) {
      handleLogout();
    }
  }, [handleLogout]);

  const resetTimer = useCallback(() => {
    if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    const hasPinSet = !!localStorage.getItem('vm_pin_hash');
    const timeoutMins = getSessionTimeoutMinutes(auth.currentUser?.uid);
    if (hasPinSet) {
      pinTimerRef.current = setTimeout(triggerPinLock, getPinLockTimeout());
    } else if (timeoutMins > 0) {
      logoutTimerRef.current = setTimeout(handleLogout, timeoutMins * 60 * 1000);
    }
  }, [triggerPinLock, handleLogout]);

  useEffect(() => {
    // Safety fallback so the loading screen can never hang on slow mobile IndexedDB locks
    const fallbackTimer = setTimeout(() => {
      setIsInitializing(false);
    }, 1500);

    const unsubscribe = auth.onAuthStateChanged((user) => {
      clearTimeout(fallbackTimer);
      if (user) {
        setIsAuthenticated(true);
        setPinLocked(false);
        setIsInitializing(false);
        resetTimer();
        try {
          preloadAllRouteChunks();
          startLiveSync(user.uid);
          startSystemConfigSync();
          registerUserPresence(user).catch(() => {});
          fetchUserPrefs(user.uid).then(prefs => {
            if (prefs?.theme) setThemePref(prefs.theme);
            if (prefs?.currency) localStorage.setItem('vm_currency', prefs.currency);
          }).catch(() => {});
          Promise.resolve(prefetchAll()).then(async () => {
            try {
              const [bills, budgets, transactions] = await Promise.all([
                fetchBills().catch(() => []),
                fetchBudgets().catch(() => []),
                fetchTransactions().catch(() => [])
              ]);
              checkFinancialTriggers({ bills, budgets, transactions });
            } catch {}
          }).catch(() => {});
        } catch {}
      } else {
        setIsAuthenticated(false);
        setPinLocked(false);
        setIsInitializing(false);
        if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
        if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
        stopLiveSync();
        stopSystemConfigSync();
        invalidateCache();
      }
    });
    return () => {
      clearTimeout(fallbackTimer);
      if (unsubscribe) unsubscribe();
      if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
      if (pinTimerRef.current) clearTimeout(pinTimerRef.current);
    };
  }, [resetTimer]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
    let throttled = false;
    const handleActivity = () => {
      if (throttled) return;
      throttled = true;
      resetTimer();
      setTimeout(() => { throttled = false; }, 1000);
    };
    events.forEach(event => document.addEventListener(event, handleActivity, { passive: true }));
    document.addEventListener('mousemove', handleActivity, { passive: true });
    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
      document.removeEventListener('mousemove', handleActivity);
    };
  }, [isAuthenticated, resetTimer]);

  // Shake-to-hide gesture on mobile
  useEffect(() => {
    if (!isAuthenticated) return;
    let lastX = null, lastY = null, lastZ = null;
    let lastTime = 0;
    const SHAKE_THRESHOLD = 28;

    const handleMotion = (e) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const now = Date.now();
      if (now - lastTime > 120) {
        const diffTime = now - lastTime;
        lastTime = now;
        if (lastX !== null && diffTime > 0) {
          const deltaX = Math.abs(acc.x - lastX);
          const deltaY = Math.abs(acc.y - lastY);
          const deltaZ = Math.abs(acc.z - lastZ);
          const speed = ((deltaX + deltaY + deltaZ) / diffTime) * 10000;
          if (speed > SHAKE_THRESHOLD * 100) {
            toggleStealth();
            toast(isStealth ? '👁️ Balances revealed' : '🛡️ Privacy Mode activated', {
              icon: isStealth ? '👁️' : '🛡️',
              duration: 2000,
            });
          }
        }
        lastX = acc.x;
        lastY = acc.y;
        lastZ = acc.z;
      }
    };

    if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
      window.addEventListener('devicemotion', handleMotion, { passive: true });
    }
    return () => {
      if (typeof window !== 'undefined' && 'DeviceMotionEvent' in window) {
        window.removeEventListener('devicemotion', handleMotion);
      }
    };
  }, [isAuthenticated, toggleStealth, isStealth]);

  useEffect(() => { setIsSidebarOpen(false); }, [location.pathname]);

  if (isInitializing) {
    return (
      <AppSplash icon={<Landmark size={28} />} />
    );
  }

  if (!isAuthenticated) {
    if (location.pathname === '/privacy') {
      return (
        <Suspense fallback={<LoadingSpinner />}>
          <Privacy />
        </Suspense>
      );
    }
    return <Login onLogin={() => { setPinLocked(false); resetTimer(); }} />;
  }

  // Email Verification Guard (Super Admin isuru@moneymanager.app is always verified/exempt)
  const isEmailVerified = auth.currentUser?.emailVerified || isSuperAdmin(auth.currentUser);
  if (!isEmailVerified) {
    return (
      <EmailVerification
        user={auth.currentUser}
        onVerified={() => {
          setIsAuthenticated(true);
          resetTimer();
        }}
        onSignOut={handleLogout}
      />
    );
  }

  // Global Maintenance Lock (Super Admin isuru@moneymanager.app always bypasses)
  const maintMode = maintenanceState;
  if (maintMode?.active && !isSuperAdmin(auth.currentUser)) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-void)',
        padding: '2rem',
        textAlign: 'center',
        fontFamily: 'Inter, sans-serif'
      }}>
        <div style={{
          width: 68,
          height: 68,
          borderRadius: 20,
          background: 'rgba(234, 179, 8, 0.15)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1.25rem',
          boxShadow: '0 0 24px rgba(234, 179, 8, 0.2)'
        }}>
          <Landmark size={32} color="#eab308" />
        </div>
        <h1 style={{ color: 'var(--text-primary)', margin: '0 0 0.5rem', fontSize: '1.75rem', fontWeight: 800 }}>
          System Maintenance in Progress
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 440, fontSize: '0.9rem', margin: '0 0 1.5rem', lineHeight: 1.5 }}>
          {maintMode.reason || 'We are currently performing scheduled maintenance to upgrade system infrastructure. Please check back shortly.'}
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: '0.65rem 1.4rem',
            borderRadius: 10,
            background: 'linear-gradient(135deg, #4ade80, #22c55e)',
            border: 'none',
            color: 'var(--bg-void)',
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'Inter, sans-serif'
          }}
        >
          Check Status / Reload
        </button>
      </div>
    );
  }

  if (pinLocked) {
    return (
      <Suspense fallback={null}>
        <PinLock
          onUnlock={() => { setPinLocked(false); resetTimer(); }}
          onSignOut={handleLogout}
        />
      </Suspense>
    );
  }

  return (
    <div className="app-container">
      <PWAUpdateBanner />
      <OfflineBanner />
      <PrivacyShield />
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)} />
      <Sidebar isOpen={isSidebarOpen} onSearchOpen={() => setSearchOpen(true)} />
      <div className="main-content-wrapper">
        <header className="shell-topbar">
          <div className="shell-crumb">
            <h2><span key={pageTitle} className="shell-crumb-title">{pageTitle}</span></h2>
            <small>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
          </div>
          <div className="shell-actions">
            <button className="shell-search" onClick={() => setSearchOpen(true)} aria-label="Search">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <span>Search…</span><kbd>⌘ K</kbd>
            </button>
            <button className="menu-toggle" onClick={toggleStealth} aria-label="Privacy Mode" title={isStealth ? 'Reveal balances' : 'Hide balances'} style={{ color: isStealth ? '#fbbf24' : 'var(--text-secondary)' }}>
              {isStealth ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <ThemeToggle />
            <button className="menu-toggle" onClick={() => setCurrencyConverterOpen(true)} aria-label="Currency Converter" title="Currency Converter">💱</button>
            <button className="menu-toggle" onClick={() => setAiCoPilotOpen(true)} aria-label="AI Co-Pilot" title="AI Financial Co-Pilot"><Sparkles size={17} /></button>
            <Suspense fallback={null}><AlertCenter /></Suspense>
            <button className="shell-primary" onClick={() => window.dispatchEvent(new Event('vm:quick-add'))}>
              <Plus size={15} strokeWidth={2.6} /> Quick Add
            </button>
          </div>
        </header>
        <header className="mobile-header">
          <div style={{ display:'flex', alignItems:'center', gap:'10px', minWidth:0 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'linear-gradient(135deg, #818cf8, #a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <Landmark size={17} color="#fff" />
            </div>
            <h2 style={{ fontFamily:'Inter, sans-serif', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}><span key={pageTitle} className="shell-crumb-title">{pageTitle}</span></h2>
          </div>
          <div className="mobile-header-actions" style={{ display:'flex', gap:'0.35rem', alignItems:'center', flexShrink:0 }}>
            {/* Install as Web App Pill (Visible on tablet/desktop if not in standalone mode) */}
            {!isAppInstalled && (
              <button
                className="install-app-pill header-secondary-tool"
                onClick={triggerInstallPrompt}
                title="Install Vault Manager on Mobile"
                aria-label="Install App"
              >
                <Download size={13} strokeWidth={2.4} />
                <span>Install App</span>
              </button>
            )}

            {/* Live Cloud Sync & Offline Queue Indicator */}
            <button
              className="menu-toggle header-secondary-tool"
              onClick={async () => {
                toast.promise(
                  prefetchAll().then(() => window.dispatchEvent(new Event('vm:data-changed'))),
                  {
                    loading: 'Syncing with cloud...',
                    success: syncStatus.online
                      ? 'Cloud data in sync ✓'
                      : `Offline Mode (${syncStatus.pendingCount} queued locally)`,
                    error: 'Sync error',
                  }
                );
              }}
              title={
                !syncStatus.online
                  ? `Offline Mode (${syncStatus.pendingCount} queued)`
                  : syncStatus.syncing
                  ? `Syncing ${syncStatus.pendingCount} pending change(s)...`
                  : 'Cloud Sync Active (Tap to refresh)'
              }
              aria-label="Cloud Sync"
              style={{ position: 'relative' }}
            >
              <Cloud
                size={17}
                style={{
                  color: !syncStatus.online ? '#fbbf24' : syncStatus.syncing ? '#38bdf8' : '#4ade80',
                  transition: 'color 0.2s',
                }}
              />
              <span style={{
                position: 'absolute', top: 4, right: 4,
                minWidth: syncStatus.pendingCount > 0 ? 13 : 6,
                height: syncStatus.pendingCount > 0 ? 13 : 6,
                borderRadius: '50%',
                background: !syncStatus.online ? '#fbbf24' : syncStatus.syncing ? '#38bdf8' : '#4ade80',
                boxShadow: `0 0 6px ${!syncStatus.online ? '#fbbf24' : syncStatus.syncing ? '#38bdf8' : '#4ade80'}`,
                color: '#0d1b2a',
                fontSize: '0.55rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: 'Inter, sans-serif',
              }}>
                {syncStatus.pendingCount > 0 ? syncStatus.pendingCount : ''}
              </span>
            </button>

            {/* Privacy / Stealth Mode Button */}
            <button
              className="menu-toggle"
              onClick={toggleStealth}
              title={isStealth ? "Privacy Mode Active (Tap to reveal)" : "Hide Balances (Privacy Mode)"}
              aria-label="Privacy Mode"
              style={{ color: isStealth ? '#fbbf24' : 'var(--text-secondary)' }}
            >
              {isStealth ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>

            {/* AI Financial Co-Pilot (Desktop / More sheet on mobile) */}
            <button
              className="menu-toggle header-secondary-tool"
              onClick={() => setAiCoPilotOpen(true)}
              title="AI Financial Co-Pilot"
              aria-label="AI Co-Pilot"
              style={{
                background: 'linear-gradient(135deg, rgba(129,140,248,0.2), rgba(167,139,250,0.2))',
                border: '1px solid rgba(129,140,248,0.4)',
                borderRadius: 10,
                color: '#c4b5fd',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Sparkles size={17} color="#c4b5fd" />
            </button>

            {/* Global Currency Hub (Desktop / More sheet on mobile) */}
            <button
              className="menu-toggle header-secondary-tool"
              onClick={() => setCurrencyConverterOpen(true)}
              title="Global Currency Converter Hub"
              aria-label="Currency Converter"
              style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              💱
            </button>
            <Suspense fallback={null}><AlertCenter /></Suspense>
            <button className="menu-toggle" onClick={() => setSearchOpen(true)} aria-label="Search">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </button>
            <button className="menu-toggle" onClick={() => window.dispatchEvent(new Event('vm:open-more'))} aria-label="All sections">
              <Menu size={20} />
            </button>
          </div>
        </header>
        <main
          ref={mainContentRef}
          className="main-content"
        >
          <PullToRefresh scrollRef={mainContentRef} onRefresh={handlePullRefresh} />
          <ErrorBoundary>
            <AnimatedRoutes />
          </ErrorBoundary>
        </main>
      </div>
      <Suspense fallback={null}>
        <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <CurrencyConverterModal isOpen={currencyConverterOpen} onClose={() => setCurrencyConverterOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <RulesManagerModal isOpen={rulesManagerOpen} onClose={() => setRulesManagerOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <AICoPilotModal isOpen={aiCoPilotOpen} onClose={() => setAiCoPilotOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <TaxCapitalGainsModal isOpen={taxSuiteOpen} onClose={() => setTaxSuiteOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <SplitSettleModal isOpen={splitSettleOpen} onClose={() => setSplitSettleOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <InvoiceModal isOpen={invoicesOpen} onClose={() => setInvoicesOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <BankSyncModal isOpen={bankSyncOpen} onClose={() => setBankSyncOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <CashFlowCalendarModal isOpen={cashCalendarOpen} onClose={() => setCashCalendarOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <FIREPlannerModal isOpen={firePlannerOpen} onClose={() => setFirePlannerOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <ReceiptScannerModal isOpen={receiptScannerOpen} onClose={() => setReceiptScannerOpen(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <OnboardingWizardModal
          isOpen={onboardingOpen}
          onClose={() => {
            setOnboardingOpen(false);
            try {
              localStorage.setItem('vm_onboarded', 'true');
            } catch {}
          }}
        />
      </Suspense>
      <Suspense fallback={null}>
        <SecurityAuditModal isOpen={securityAuditOpen} onClose={() => setSecurityAuditOpen(false)} />
      </Suspense>
      <Toaster
        position={isMobile ? 'top-center' : 'bottom-right'}
        containerStyle={isMobile ? { top: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' } : { bottom: '1rem', right: '1rem' }}
        toastOptions={{
          style: { background:'rgba(37,37,64,0.97)', color:'var(--text-primary)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(16px)', fontFamily:'Inter, sans-serif', fontSize:'0.875rem', borderRadius:'14px', boxShadow:'0 8px 32px rgba(0,0,0,0.4)', maxWidth: 'min(420px, calc(100vw - 2rem))' },
          success: { iconTheme:{ primary:'#4ade80', secondary:'var(--bg-void)' } },
          error:   { iconTheme:{ primary:'#f87171', secondary:'var(--bg-void)' } },
        }}
      />
      {/* Floating Quick-Add Button (desktop only — mobile uses the bottom-nav FAB) */}
      <button
        className="desktop-fab"
        onClick={() => setQuickAddOpen(true)}
        title="Quick Add Transaction"
        style={{
          position: 'fixed',
          bottom: '1.25rem',
          right: '1.25rem',
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #4ade80, #06b6d4)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(74,222,128,0.35)',
          zIndex: 197, transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; e.currentTarget.style.boxShadow = '0 6px 32px rgba(74,222,128,0.55)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(74,222,128,0.35)'; }}
      >
        <Plus size={26} color="#0a1628" strokeWidth={2.5} />
      </button>
      <QuickAdd open={quickAddOpen} onClose={() => setQuickAddOpen(false)} />
      <InstallPrompt />
    </div>
  );
}

function Root() {
  return <Router><App /></Router>;
}

export default Root;