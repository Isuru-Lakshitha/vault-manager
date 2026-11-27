import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useT } from '../i18n';
import { LayoutDashboard, ArrowRightLeft, Landmark, BarChart2, LogOut, MoreHorizontal, Search, X, Eye, EyeOff, Plus, Crown, Smartphone, Pin, PinOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { spring } from '../motion/presets';
import { apiIfLoaded, loadApi } from '../utils/lazyData';
import { auth } from '../utils/firebaseApp';
import { signOutAndClear } from '../utils/signOut';
import { useBackLayer } from '../utils/backLayers';
import { isGuest, GUEST_SIGN_OUT_WARNING, deleteGuestAndSignOut } from '../utils/guestAccount';
import { toast } from 'react-hot-toast';
import { useStealthMode } from '../utils/format';
import { isSuperAdminUser as isSuperAdmin } from '../utils/adminLite';
import { isStandalone, triggerInstallPrompt } from '../utils/pwaInstall';
import { NAV_ITEMS } from './navItems';


const Sidebar = ({ isOpen, onSearchOpen }) => {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const [isStealth, toggleStealth] = useStealthMode();
  const handleLogout = async () => {
    if (isGuest()) {
      if (!window.confirm(GUEST_SIGN_OUT_WARNING)) return;
      try { await deleteGuestAndSignOut(); } catch (err) { toast.error(err?.message || 'Could not delete the guest data. Check your connection.'); }
      return;
    }
    try {
      if (!(await signOutAndClear({ redirectTo: '/' }))) navigate('/');
    } catch { toast.error('Could not sign out. Check your connection and try again.'); }
  };
  // Desktop with a mouse: an icon rail that opens on hover/focus (overlaying
  // the page) unless pinned open. Touch devices always get the full sidebar.
  const [pinned, setPinned] = useState(() => {
    try { return localStorage.getItem('vm_sidebar_pinned') === '1'; } catch { return false; }
  });
  useEffect(() => {
    document.body.classList.toggle('sidebar-rail', !pinned);
    document.body.classList.remove('sidebar-collapsed'); // legacy mode
    try { localStorage.setItem('vm_sidebar_pinned', pinned ? '1' : '0'); } catch { /* private mode */ }
  }, [pinned]);
  return (
    <>
      <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
        <button className="sidebar-pin-btn" onClick={() => setPinned(p => !p)} aria-label={pinned ? t('side.unpin') : t('side.pin')} title={pinned ? 'Unpin: show icons, open on hover' : 'Keep the sidebar open'} aria-pressed={pinned}>
          {pinned ? <PinOff size={13} /> : <Pin size={13} />}
        </button>
        <NavLink to="/dashboard" className="workspace-brand" title="Dashboard">
          <span className="workspace-brand-icon"><Landmark size={22} /></span>
          <span><strong>Vault Manager</strong><small>{t('shell.personalFinance')}</small></span>
        </NavLink>
        <button className="workspace-search" onClick={onSearchOpen}>
          <Search size={17} /><span>{t('shell.search')}</span><kbd>⌘ K</kbd>
        </button>
        <nav className="workspace-nav" aria-label="Main navigation">
          {[
            {label:'group.everyday', paths:['/dashboard','/accounts','/transactions','/bills']},
            {label:'group.planning', paths:['/budgets','/goals','/loans','/credit-cards','/investments']},
            {label:'group.reports', paths:['/analytics','/settings']},
          ].map((group,index) => {
            const links=group.paths.map(path => NAV_ITEMS.find(item => item.path===path)).filter(Boolean).map(({path,also,icon:Icon,labelKey,page}) => {
              const on = (isActive) => isActive || !!also?.includes(location.pathname);
              return <NavLink key={path} to={path} className={({isActive}) => `workspace-link${on(isActive) ? ' is-active' : ''}`} onMouseEnter={() => page().catch(() => {})}>{({isActive}) => (<>{on(isActive) && <motion.span layoutId="nav-indicator" className="nav-indicator" transition={spring.liquid} />}<Icon size={18} strokeWidth={1.8}/><span>{t(labelKey)}</span></>)}</NavLink>;
            });
            return index===1 ? <details key={group.label} className="quiet-nav-group" open={group.paths.includes(location.pathname)}><summary>{t(group.label)}</summary>{links}</details> : <div key={group.label}><p className="workspace-section">{t(group.label)}</p>{links}</div>;
          })}
          {isSuperAdmin(auth.currentUser) && <NavLink to="/admin" className="workspace-link"><Crown size={18} /><span>Administration</span></NavLink>}
        </nav>
        <div className="workspace-footer">
          <button className="workspace-link" onClick={toggleStealth} aria-pressed={isStealth}>
            {isStealth ? <EyeOff size={18} /> : <Eye size={18} />}<span>{isStealth ? t('shell.showBalances') : t('shell.hideBalances')}</span>
          </button>
          <button className="workspace-link" onClick={handleLogout}><LogOut size={18} /><span>{t('shell.signOut')}</span></button>
        </div>
      </aside>
      <BottomNav />
    </>
  );
};

// ─── MOBILE NAVIGATION ───────────────────────────────────────────────
const BOTTOM_ITEMS = [
  { path: '/dashboard',    icon: LayoutDashboard, label: 'Home',      labelKey: 'nav.home', badgeKey: null },
  { path: '/transactions', icon: ArrowRightLeft,  label: 'Txns',      labelKey: 'nav.txns', badgeKey: null },
  { path: '/analytics',    icon: BarChart2,       label: 'Analytics', labelKey: 'nav.analytics', badgeKey: null },
];

// Accent per page for the "More" sheet tiles
const TILE_COLORS = {
  '/dashboard': '#4ade80', '/accounts': '#38bdf8', '/transactions': '#a78bfa', '/recurring': '#22d3ee',
  '/loans': '#f87171', '/budgets': '#fbbf24', '/goals': '#f472b6', '/bills': '#fb923c',
  '/investments': '#34d399', '/credit-cards': '#818cf8', '/analytics': '#60a5fa', '/settings': '#9191ab',
};

const Badge = ({ n }) => n > 0 ? (
  <span style={{ position:'absolute', top:-5, right:-8, background:'var(--mm-danger)', color:'#fff', borderRadius:10, fontSize:'0.55rem', fontWeight:700, minWidth:15, height:15, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 3px', boxShadow:'0 0 6px rgba(248,113,113,0.7)' }}>{n}</span>
) : null;

const MoreSheet = ({ open, onClose, badges }) => {
  const t = useT();
  const dragControls = useDragControls();
  const location = useLocation();
  const navigate = useNavigate();

  // Close when the route changes (user picked a page)
  useEffect(() => { if (open) onClose(); }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useBackLayer(open, onClose);

  // Lock background scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const logout = async () => {
    if (isGuest()) {
      if (!window.confirm(GUEST_SIGN_OUT_WARNING)) return;
      try { await deleteGuestAndSignOut(); } catch (err) { toast.error(err?.message || 'Could not delete the guest data. Check your connection.'); }
      return;
    }
    try {
      if (!(await signOutAndClear({ redirectTo: '/' }))) navigate('/');
    } catch { toast.error('Could not sign out. Check your connection and try again.'); }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div key="more-overlay" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
          onClick={onClose}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', zIndex:9000, display:'flex', alignItems:'flex-end' }}>
          <motion.div
            initial={{ y:'100%' }} animate={{ y:0 }} exit={{ y:'100%' }}
            transition={{ type:'spring', damping:30, stiffness:320 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top:0, bottom:0 }}
            dragElastic={{ top:0, bottom:0.4 }}
            onDragEnd={(_, info) => { if (info.offset.y > 80 || info.velocity.y > 500) onClose(); }}
            onClick={e => e.stopPropagation()}
            style={{
              width:'100%',
              background:'var(--bg-surface)',
              borderTop:'1px solid rgba(255,255,255,0.08)',
              borderRadius:'24px 24px 0 0',
              padding:'0 1rem calc(1.5rem + env(safe-area-inset-bottom, 16px))',
              maxHeight:'88dvh',
              display:'flex',
              flexDirection:'column',
              boxShadow:'0 -8px 40px rgba(0,0,0,0.6)',
              overflow:'hidden',
            }}>
            {/* Dedicated Drag handle */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              style={{
                width:'100%',
                padding:'0.75rem 0 0.5rem',
                display:'flex',
                justifyContent:'center',
                alignItems:'center',
                cursor:'grab',
                touchAction:'none',
                flexShrink:0,
                WebkitTapHighlightColor:'transparent',
              }}
            >
              <div style={{ width:40, height:4, borderRadius:2, background:'rgba(255,255,255,0.22)' }} />
            </div>

            {/* Scrollable content container */}
            <div style={{
              flex:'1 1 auto',
              overflowY:'auto',
              WebkitOverflowScrolling:'touch',
              overscrollBehavior:'contain',
              paddingBottom:'0.5rem',
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem', padding:'0 0.25rem' }}>
                <span style={{ fontWeight:700, fontSize:'1.05rem', color:'var(--text-primary)' }}>All sections</span>
                <button onClick={onClose} aria-label="Close" style={{ background:'rgba(255,255,255,0.06)', border:'none', borderRadius:'50%', width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-secondary)', cursor:'pointer' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Search shortcut */}
              <button onClick={() => { onClose(); window.dispatchEvent(new Event('vm:open-search')); }}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:'0.6rem', padding:'0.8rem 1rem', marginBottom:'1rem', borderRadius:14, background:'rgba(0,0,0,0.3)', border:'1px solid rgba(255,255,255,0.07)', color:'var(--text-secondary)', fontSize:'0.9rem', cursor:'pointer' }}>
                <Search size={17} /> Search transactions, accounts…
              </button>

              {/* Super Admin Quick Launch (admin claim only) */}
              {isSuperAdmin(auth.currentUser) && (
                <NavLink
                  to="/admin"
                  onClick={onClose}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.2), rgba(167, 139, 250, 0.15))',
                    border: '1px solid rgba(234, 179, 8, 0.4)',
                    textDecoration: 'none',
                    marginBottom: '1rem',
                    boxShadow: '0 4px 16px rgba(234, 179, 8, 0.15)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <Crown size={20} color="#eab308" />
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        👑 Super Admin Command Center
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#eab308' }}>Root Platform Governance</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.78rem', color: '#eab308', fontWeight: 700 }}>Open →</span>
                </NavLink>
              )}

              {/* Install Web App Quick Launcher (Mobile / PWA) */}
              {!isStandalone() && (
                <div
                  onClick={() => { onClose(); triggerInstallPrompt(); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.85rem 1rem',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.18), rgba(6, 182, 212, 0.12))',
                    border: '1px solid rgba(74, 222, 128, 0.35)',
                    marginBottom: '1rem',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(74, 222, 128, 0.12)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #4ade80, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Smartphone size={20} color="#0d1b2a" strokeWidth={2.4} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        📲 Install as Web App
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        Home screen icon · Fast offline access
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--mm-success)', fontWeight: 800 }}>Install →</span>
                </div>
              )}

              {/* FinTech Power Suite */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#818cf8', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
                  FinTech Power Suite
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                  {[
                    { label: 'Assistant', icon: '🧠', event: 'vm:open-ai-copilot', color: '#c4b5fd', bg: 'rgba(167,139,250,0.12)' },
                    { label: 'Cash Calendar', icon: '📅', event: 'vm:open-cash-calendar', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
                    { label: 'FIRE Planner', icon: '🔥', event: 'vm:open-fire-planner', color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
                    { label: 'Receipts', icon: '🧾', event: 'vm:open-receipt-scanner', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
                    { label: 'Rules (IFTTT)', icon: '⚡', event: 'vm:open-rules-manager', color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
                    { label: 'Tax & Gains', icon: '📑', event: 'vm:open-tax-suite', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
                    { label: 'Split & Settle', icon: '👥', event: 'vm:open-split-settle', color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
                    { label: 'Invoices', icon: '💼', event: 'vm:open-invoices', color: '#f472b6', bg: 'rgba(244,114,182,0.12)' },
                    { label: 'Import statement', icon: '🏦', event: 'vm:open-bank-sync', color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
                  ].map(tool => (
                    <button
                      key={tool.label}
                      onClick={() => { onClose(); window.dispatchEvent(new Event(tool.event)); }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.35rem',
                        padding: '0.65rem 0.25rem', borderRadius: 14, border: `1px solid ${tool.color}33`,
                        background: tool.bg, cursor: 'pointer', WebkitTapHighlightColor: 'transparent'
                      }}
                    >
                      <span style={{ fontSize: '1.3rem' }}>{tool.icon}</span>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: tool.color }}>{tool.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Page grid */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:'0.6rem' }}>
                {NAV_ITEMS.map(({ path, also, icon: Icon, labelKey }) => {
                  const active = location.pathname === path || !!also?.includes(location.pathname);
                  const c = TILE_COLORS[path] || '#4ade80';
                  return (
                    <NavLink key={path} to={path} onClick={onClose}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'0.45rem', padding:'0.95rem 0.25rem', borderRadius:16, textDecoration:'none', background: active ? `${c}1f` : 'rgba(255,255,255,0.03)', border:`1px solid ${active ? c + '66' : 'rgba(255,255,255,0.06)'}`, WebkitTapHighlightColor:'transparent', minHeight:84 }}>
                      <div style={{ position:'relative', width:40, height:40, borderRadius:12, background:`${c}1a`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Icon size={20} color={c} />
                        {path === '/bills' && <Badge n={badges.bills} />}
                      </div>
                      <span style={{ fontSize:'0.74rem', fontWeight:600, color: active ? c : '#c8c8d8', textAlign:'center', lineHeight:1.15 }}>{t(labelKey)}</span>
                    </NavLink>
                  );
                })}
              </div>

              <button onClick={logout}
                style={{ width:'100%', marginTop:'1rem', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.5rem', padding:'0.8rem', borderRadius:14, background:'rgba(248,113,113,0.08)', border:'1px solid rgba(248,113,113,0.2)', color:'var(--mm-danger)', fontWeight:600, fontSize:'0.88rem', cursor:'pointer' }}>
                <LogOut size={16} /> {t('shell.signOut')}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

const BottomNav = () => {
  const t = useT();
  const location = useLocation();
  const [badges, setBadges] = useState({});
  const [moreOpen, setMoreOpen] = useState(false);

  // Bills due within 3 days (or overdue)
  useEffect(() => {
    const compute = () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const bills = apiIfLoaded()?.getCache('bills') || [];
      const due = bills.filter(b => {
        if (b.paid) return false;
        const d = new Date(b.due_date + 'T00:00:00');
        return Math.ceil((d - today) / 86400000) <= 3;
      }).length;
      setBadges(prev => ({ ...prev, bills: due || null }));
    };
    compute();
    const id = setInterval(compute, 60000);
    window.addEventListener('vm:data-changed', compute);
    let live = true;
    loadApi().then(() => { if (live) compute(); }).catch(() => {}); // data layer loads after sign-in
    return () => { live = false; clearInterval(id); window.removeEventListener('vm:data-changed', compute); };
  }, []);

  // The mobile header's menu button opens this sheet
  useEffect(() => {
    const open = () => setMoreOpen(true);
    window.addEventListener('vm:open-more', open);
    return () => window.removeEventListener('vm:open-more', open);
  }, []);

  const tap = () => { try { navigator.vibrate?.(10); } catch {} };
  const inMore = !BOTTOM_ITEMS.some(i => i.path === location.pathname);

  const Item = ({ path, icon: Icon, labelKey, badgeKey }) => (
    <NavLink to={path} onClick={tap} className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}>
      {({ isActive }) => (
        <>
          <div className="bottom-nav-icon-wrap">
            {isActive && (
              <motion.span
                layoutId="bottom-nav-pill"
                className="bottom-nav-pill"
                transition={spring.liquid}
              />
            )}
            <motion.span
              style={{ display: 'inline-flex', position: 'relative', zIndex: 1 }}
              animate={{ scale: isActive ? 1.12 : 1, y: isActive ? -1 : 0 }}
              transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            >
              <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
            </motion.span>
            {badgeKey && <Badge n={badges[badgeKey]} />}
          </div>
          <span className="bottom-nav-label">{t(labelKey)}</span>
        </>
      )}
    </NavLink>
  );

  return (
    <>
      <nav className="bottom-nav" aria-label="Primary Navigation">
        <div className="bottom-nav-inner">
          {BOTTOM_ITEMS.slice(0, 2).map(i => <Item key={i.path} {...i} />)}

          {/* Centre FAB — opens Quick Add on top of the current screen */}
          <button
            className="bottom-nav-fab"
            onClick={() => { tap(); window.dispatchEvent(new Event('vm:quick-add')); }}
            aria-label="Quick Add Transaction"
          >
            <Plus size={24} color="#0d1527" strokeWidth={2.8} />
          </button>

          {BOTTOM_ITEMS.slice(2).map(i => <Item key={i.path} {...i} />)}

          <button
            onClick={() => { tap(); setMoreOpen(true); }}
            className={`bottom-nav-item ${inMore || moreOpen ? 'active' : ''}`}
            title="All sections"
          >
            <div className="bottom-nav-icon-wrap">
              <MoreHorizontal size={20} strokeWidth={inMore || moreOpen ? 2.3 : 1.8} />
              {badges.bills > 0 && <Badge n={badges.bills} />}
            </div>
            <span className="bottom-nav-label">{t('nav.more')}</span>
          </button>
        </div>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} badges={badges} />
    </>
  );
};

export default Sidebar;
