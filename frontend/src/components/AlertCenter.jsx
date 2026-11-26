import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, CheckCircle, AlertTriangle, X, ShieldAlert, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { auth } from '../utils/firebaseApp';
import { getCache } from '../utils/api';
import {
  computeAlerts, loadAlertState, saveAlertState, dismissAlert, snoozeAlert, filterVisible,
  getBackupReminderDays, LAST_BACKUP_KEY
} from '../utils/alertEngine';

const KIND_HREF = {
  budget: '/budgets',
  bill: '/bills',
  recurring: '/recurring',
  card: '/cards',
  backup: '/settings',
};

const AlertCenter = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const uid = auth.currentUser?.uid || null;
  const [alertState, setAlertState] = useState(() => loadAlertState(uid));
  const [derived, setDerived] = useState([]);
  const containerRef = useRef(null);

  useEffect(() => {
    // Dashboard still emits legacy budget-/bill- alerts; ours replace them to avoid duplicates.
    const handler = (e) => setAlerts((e.detail || []).filter(a => !/^(budget|bill)-/.test(String(a.id))));
    window.addEventListener('vm:budget-alerts', handler);
    if (window.__budgetAlerts) handler({ detail: window.__budgetAlerts });
    return () => window.removeEventListener('vm:budget-alerts', handler);
  }, []);

  useEffect(() => {
    setAlertState(loadAlertState(uid));
    const recompute = () => {
      let lastBackupTs = null;
      try { lastBackupTs = parseInt(localStorage.getItem(LAST_BACKUP_KEY), 10) || null; } catch {}
      setDerived(computeAlerts({
        budgets: getCache('budgets') || [],
        transactions: getCache('transactions') || [],
        bills: getCache('bills') || [],
        recurring: getCache('recurring') || [],
        cards: getCache('cards') || [],
        lastBackupTs,
        backupEveryDays: getBackupReminderDays()
      }));
    };
    recompute();
    const timer = setInterval(recompute, 30000);
    ['vm:budget-alerts', 'vm:backup-updated', 'vm:backup-status-changed', 'vm:backup-reminder-changed'].forEach(ev => window.addEventListener(ev, recompute));
    return () => {
      clearInterval(timer);
      ['vm:budget-alerts', 'vm:backup-updated', 'vm:backup-status-changed', 'vm:backup-reminder-changed'].forEach(ev => window.removeEventListener(ev, recompute));
    };
  }, [uid]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const commit = (next) => { setAlertState(next); saveAlertState(uid, next); };
  const handleDismiss = (id) => commit(dismissAlert(alertState, id));
  const handleSnooze = (id) => commit(snoozeAlert(alertState, id, 1));

  const handleDismissAll = () => {
    commit(activeAlerts.reduce((st, a) => dismissAlert(st, a.id), alertState));
    toast.success('All alerts dismissed');
    setIsOpen(false);
  };

  const merged = [...derived, ...alerts];
  const activeAlerts = filterVisible(merged.filter((a, i) => merged.findIndex(x => x.id === a.id) === i), alertState);

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="menu-toggle"
        style={{ position: 'relative' }}
        title="Alerts"
        aria-label="Alerts"
        aria-expanded={isOpen}
      >
        <Bell size={18} />
        {activeAlerts.length > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              position: 'absolute',
              top: 2, right: 2,
              width: 16, height: 16,
              background: 'var(--mm-danger)',
              color: 'white',
              borderRadius: '50%',
              fontSize: '10px',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #0f172a'
            }}
          >
            {activeAlerts.length}
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            style={{
              position: 'absolute',
              top: '120%', right: 0,
              width: 'min(320px, calc(100vw - 1.25rem))',
              maxWidth: 'calc(100vw - 1.25rem)',
              background: 'var(--bg-surface)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 16,
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              zIndex: 1000,
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Notifications</h3>
              {activeAlerts.length > 0 && (
                <button
                  onClick={handleDismissAll}
                  style={{ background: 'transparent', border: 'none', color: '#a78bfa', fontSize: '0.75rem', cursor: 'pointer' }}
                >
                  Dismiss all
                </button>
              )}
            </div>

            <div style={{ maxHeight: 360, overflowY: 'auto', padding: '0.5rem' }}>
              {activeAlerts.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--mm-text-3)' }}>
                  <CheckCircle size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                  <div style={{ fontSize: '0.85rem' }}>You're all caught up!</div>
                </div>
              ) : (
                <AnimatePresence>
                  {activeAlerts.map(alert => {
                    const targetHref = alert.href || KIND_HREF[alert.kind] || null;
                    return (
                      <motion.div
                        key={alert.id}
                        layout
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        onClick={() => {
                          if (targetHref) {
                            setIsOpen(false);
                            navigate(targetHref);
                          }
                        }}
                        style={{
                          padding: '0.75rem',
                          margin: '0.25rem',
                          background: 'rgba(255,255,255,0.03)',
                          borderRadius: 10,
                          border: '1px solid rgba(255,255,255,0.05)',
                          display: 'flex',
                          gap: '0.75rem',
                          position: 'relative',
                          cursor: targetHref ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{
                          color: alert.type === 'danger' ? 'var(--mm-danger)' : alert.type === 'warning' ? 'var(--mm-warning)' : 'var(--mm-success)',
                          marginTop: 2
                        }}>
                          {alert.type === 'danger' ? <ShieldAlert size={18} /> : <AlertTriangle size={18} />}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{alert.title}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', lineHeight: 1.4 }}>{alert.body}</div>
                          {targetHref && (
                            <div style={{ fontSize: '0.68rem', color: 'var(--mm-accent, #5b8def)', fontWeight: 600, marginTop: 4 }}>
                              Open {targetHref.replace('/', '')} →
                            </div>
                          )}
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSnooze(alert.id); }}
                          title="Snooze 1 day"
                          aria-label="Snooze 1 day"
                          style={{
                            background: 'transparent', border: 'none', color: 'var(--mm-text-3)', cursor: 'pointer', padding: 4, height: 'fit-content'
                          }}
                        >
                          <Clock size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDismiss(alert.id); }}
                          aria-label="Dismiss"
                          title="Dismiss"
                          style={{
                            background: 'transparent', border: 'none', color: 'var(--mm-text-3)', cursor: 'pointer', padding: 4, height: 'fit-content'
                          }}
                        >
                          <X size={14} />
                        </button>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AlertCenter;
