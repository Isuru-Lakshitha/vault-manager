import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ShieldCheck, Crown, Users, Database, Activity, RefreshCw, Download, Trash2, Megaphone, Lock, Unlock, CheckCircle2, Sparkles } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import { auth } from '../utils/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  SUPER_ADMIN_EMAIL,
  isSuperAdmin,
  getRegisteredUsers,
  updateRegisteredUser,
  deleteRegisteredUser,
  getSystemHealth,
  getPlatformStats,
  getSystemAnnouncement,
  setSystemAnnouncement,
  clearSystemAnnouncement,
  getMaintenanceMode,
  setMaintenanceMode,
  getAdminAuditLog,
  fetchRemoteAuditLog,
  exportPlatformDump,
  flushSystemCache,
  logAdminAction
} from '../utils/adminService';
import { haptic } from '../utils/format';
import { exportFullVaultBackup } from '../utils/backupCrypto';
import { getBackupReminderDays, setBackupReminderDays } from '../utils/alertEngine';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const navigate = useNavigate();
  const currentUser = auth.currentUser;
  const authorized = isSuperAdmin(currentUser);

  // Tab navigation
  const [activeTab, setActiveTab] = useState('telemetry'); // 'telemetry' | 'users' | 'broadcast' | 'maintenance' | 'audit'

  // Data state
  const [loading, setLoading] = useState(true);
  const [health, setHealth] = useState(null);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState('');
  const [announcement, setAnnouncement] = useState(() => getSystemAnnouncement());
  const [maintenance, setMaintenance] = useState(() => getMaintenanceMode());
  const [auditLogs, setAuditLogs] = useState([]);
  const [busy, setBusy] = useState(false);
  const [remoteAudit, setRemoteAudit] = useState([]);
  const [remoteAuditError, setRemoteAuditError] = useState('');
  const [backupDays, setBackupDays] = useState(() => getBackupReminderDays());

  const loadRemoteAudit = async () => {
    try {
      setRemoteAudit(await fetchRemoteAuditLog(50));
      setRemoteAuditError('');
    } catch (err) {
      setRemoteAuditError(err?.code === 'permission-denied'
        ? 'Firestore rules do not yet allow reading admin_audit. Deploy the latest firestore.rules.'
        : (err?.message || 'Could not load audit log'));
    }
  };

  const handleExportBackup = async () => {
    const tid = toast.loading('Exporting your backup...');
    try {
      const res = await exportFullVaultBackup('');
      toast.success(`Backup saved (${res.filename})`, { id: tid });
    } catch {
      toast.error('Backup export failed', { id: tid });
    }
  };

  const handleBackupDays = (value) => {
    const n = setBackupReminderDays(value);
    setBackupDays(n);
    window.dispatchEvent(new CustomEvent('vm:backup-reminder-changed'));
  };

  // Announcement composer
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastLevel, setBroadcastLevel] = useState('info');

  // Maintenance composer
  const [maintReason, setMaintReason] = useState('Scheduled system maintenance in progress. Please check back shortly.');

  const loadUsers = async () => {
    try {
      setUsers(await getRegisteredUsers());
      setUsersError('');
    } catch (err) {
      console.error(err);
      setUsersError(err?.code === 'permission-denied'
        ? 'Firestore rules do not yet allow reading user_directory. Deploy the latest firestore.rules.'
        : (err?.message || 'Could not load user directory'));
    }
  };

  const refreshAll = async () => {
    try {
      setLoading(true);
      const [h, s] = await Promise.all([getSystemHealth(), getPlatformStats(), loadUsers()]);
      setHealth(h);
      setStats(s);
      setAnnouncement(getSystemAnnouncement());
      setMaintenance(getMaintenanceMode());
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      console.error(err);
      toast.error('Failed refreshing admin telemetry');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authorized) return;
    refreshAll();
    logAdminAction('ADMIN_PANEL_OPEN', 'Console', 'Super Admin accessed root control panel').then(loadRemoteAudit);
    const onAnn = (e) => setAnnouncement(e.detail ?? null);
    const onMaint = (e) => setMaintenance(e.detail || getMaintenanceMode());
    window.addEventListener('vm:system-announcement-updated', onAnn);
    window.addEventListener('vm:maintenance-mode-changed', onMaint);
    return () => {
      window.removeEventListener('vm:system-announcement-updated', onAnn);
      window.removeEventListener('vm:maintenance-mode-changed', onMaint);
    };
  }, [authorized]); // eslint-disable-line react-hooks/exhaustive-deps

  // 403 Forbidden screen if user is NOT isuru@moneymanager.app
  if (!authorized) {
    return (
      <PageWrapper>
        <div style={{
          minHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '2rem' }}>
          <div style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: 'rgba(248, 113, 113, 0.1)',
            border: '1px solid rgba(248, 113, 113, 0.25)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1.5rem',
            boxShadow: '0 0 30px rgba(248, 113, 113, 0.15)'
          }}>
            <ShieldAlert size={40} color="#f87171" />
          </div>
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.8rem', color: 'var(--text-primary)', fontWeight: 800 }}>
            403 · Super Admin Clearance Required
          </h1>
          <p style={{ margin: '0 0 1.5rem', color: 'var(--text-secondary)', fontSize: '0.95rem', maxWidth: 460 }}>
            This Administrative Command Center is strictly restricted to <code style={{ color: '#eab308', background: 'rgba(234, 179, 8, 0.1)', padding: '2px 6px', borderRadius: 6 }}>{SUPER_ADMIN_EMAIL}</code>. Unauthorized access attempts are monitored and logged.
          </p>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              padding: '0.75rem 1.75rem',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #4ade80, #22c55e)',
              border: 'none',
              color: 'var(--bg-void)',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(74,222,128,0.25)'
            }}
          >
            ← Return to Safe Dashboard
          </button>
        </div>
      </PageWrapper>
    );
  }

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Remove "${user.email}" from the directory?\n\nThis does not delete their login or financial data; they will reappear the next time they sign in.`)) return;
    try {
      await deleteRegisteredUser(user);
      setUsers(prev => prev.filter(u => u.uid !== user.uid));
      toast.success(`${user.email} removed from directory`);
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err.message || 'Could not remove user');
    }
  };

  const handleSendResetEmail = async (email) => {
    try {
      await sendPasswordResetEmail(auth, email);
      toast.success(`Password reset link dispatched to ${email}`);
      haptic();
      logAdminAction('PASSWORD_RESET_DISPATCH', email, 'Dispatched reset email via Firebase Auth');
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err.message || 'Could not send reset email');
    }
  };

  const handleToggleVerified = async (user) => {
    const next = !user.verified_by_admin;
    try {
      await updateRegisteredUser(user.uid, { verified_by_admin: next });
      setUsers(prev => prev.map(u => u.uid === user.uid ? { ...u, verified_by_admin: next } : u));
      toast.success(next ? `Marked ${user.email} as reviewed` : `Cleared review mark for ${user.email}`);
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err.message || 'Could not update user');
    }
  };

  // Broadcast handlers
  const handlePublishBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) {
      toast.error('Please enter a message');
      return;
    }
    setBusy(true);
    try {
      const ann = await setSystemAnnouncement({ message: broadcastMsg.trim(), level: broadcastLevel });
      setAnnouncement(ann);
      setBroadcastMsg('');
      toast.success('📢 Announcement published to all users');
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err?.code === 'permission-denied' ? 'Blocked by Firestore rules — deploy the latest firestore.rules' : (err.message || 'Publish failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleClearBroadcast = async () => {
    setBusy(true);
    try {
      await clearSystemAnnouncement();
      setAnnouncement(null);
      toast.success('Announcement removed for all users');
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err.message || 'Could not clear announcement');
    } finally {
      setBusy(false);
    }
  };

  // Maintenance handlers
  const handleToggleMaintenance = async () => {
    const nextState = !maintenance.active;
    if (nextState && !window.confirm('Enable maintenance mode? Every member will be locked out until you turn it off.')) return;
    setBusy(true);
    try {
      const m = await setMaintenanceMode(nextState, maintReason);
      setMaintenance(m);
      toast(nextState ? '🔒 Maintenance mode ENABLED for all members' : '🔓 System restored to NORMAL', {
        icon: nextState ? '⚠️' : '✅'
      });
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch (err) {
      toast.error(err?.code === 'permission-denied' ? 'Blocked by Firestore rules — deploy the latest firestore.rules' : (err.message || 'Could not change maintenance mode'));
    } finally {
      setBusy(false);
    }
  };

  const handleExportDump = async () => {
    const tId = toast.loading('Exporting complete platform dump...');
    try {
      await exportPlatformDump();
      toast.success('Master dump downloaded successfully!', { id: tId });
      haptic();
      setAuditLogs(getAdminAuditLog());
    } catch {
  toast.error('Export failed', {
    id: tId
  });
}
  };

  const handleFlushCache = () => {
    if (window.confirm('Flush all local cached data and trigger full fresh reload?')) {
      flushSystemCache();
    }
  };

  return (
    <PageWrapper>
      <div style={{ maxWidth: 1200, margin: '0 auto', paddingBottom: '3rem' }}>
        
        {/* Super Admin Top Hero Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          padding: '1.5rem',
          borderRadius: 20,
          background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(167, 139, 250, 0.08))',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          marginBottom: '1.75rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #eab308, #ca8a04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 24px rgba(234, 179, 8, 0.4)'
            }}>
              <Crown size={26} color="#1a1a2e" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  Super Admin Command Center
                </h1>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 20,
                  background: 'rgba(234, 179, 8, 0.2)',
                  border: '1px solid #eab308',
                  color: '#eab308',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: 1
                }}>
                  ROOT PRIVILEGES
                </span>
              </div>
              <p style={{ margin: '3px 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                Exclusive platform governance for <strong style={{ color: '#eab308' }}>{SUPER_ADMIN_EMAIL}</strong>
              </p>
            </div>
          </div>

          {/* Quick Header Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={refreshAll}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.9rem',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                color: 'var(--mm-text-2)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer' }}
            >
              <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
            </button>
            <button
              onClick={handleExportDump}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.9rem',
                borderRadius: 10,
                background: 'rgba(129,140,248,0.15)',
                border: '1px solid rgba(129,140,248,0.3)',
                color: '#818cf8',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer' }}
            >
              <Download size={14} /> Master Dump
            </button>
            <button
              onClick={handleFlushCache}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.9rem',
                borderRadius: 10,
                background: 'rgba(248,113,113,0.12)',
                border: '1px solid rgba(248,113,113,0.25)',
                color: 'var(--mm-danger)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer' }}
            >
              <Trash2 size={14} /> Flush Cache
            </button>
          </div>
        </div>

        {/* Global Announcement Alert if Active */}
        {announcement && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.85rem 1.25rem',
            borderRadius: 12,
            background: announcement.level === 'critical' ? 'rgba(239, 68, 68, 0.15)' : announcement.level === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${announcement.level === 'critical' ? '#ef4444' : announcement.level === 'warning' ? '#f59e0b' : '#3b82f6'}`,
            marginBottom: '1.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Megaphone size={18} color={announcement.level === 'critical' ? '#ef4444' : announcement.level === 'warning' ? '#f59e0b' : '#3b82f6'} />
              <div>
                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#fff', textTransform: 'uppercase', marginRight: 8 }}>
                  Active {announcement.level} Broadcast:
                </span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{announcement.message}</span>
              </div>
            </div>
            <button
              onClick={handleClearBroadcast}
              disabled={busy}
              style={{ background: 'transparent', border: 'none', color: 'var(--mm-text-2)', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '0.75rem', textDecoration: 'underline', opacity: busy ? 0.6 : 1 }}
            >
              Clear Banner
            </button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          paddingBottom: '0.75rem',
          marginBottom: '1.5rem',
          overflowX: 'auto'
        }}>
          {[
            { id: 'telemetry', label: '📊 System Telemetry & Health' },
            { id: 'users', label: `👥 User Directory (${users.length})` },
            { id: 'broadcast', label: '📢 Global Broadcast Banner' },
            { id: 'maintenance', label: '🛠️ Maintenance & Controls' },
            { id: 'audit', label: '📜 Admin Security Audit Stream' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); haptic(5); }}
              style={{
                padding: '0.65rem 1.25rem',
                borderRadius: 12,
                border: activeTab === tab.id ? '1px solid rgba(234, 179, 8, 0.4)' : '1px solid transparent',
                background: activeTab === tab.id ? 'rgba(234, 179, 8, 0.12)' : 'transparent',
                color: activeTab === tab.id ? '#eab308' : 'var(--mm-text-3)',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: TELEMETRY & HEALTH */}
        {activeTab === 'telemetry' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            
            {/* 4 Primary Top Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              
              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Registered Accounts</span>
                  <Users size={18} color="#818cf8" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {users.length} Users
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--mm-success)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CheckCircle2 size={12} /> {users.filter(u => u.role === 'Super Admin').length} Super Admin · {users.filter(u => u.role !== 'Super Admin').length} Members
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Firestore Latency</span>
                  <Activity size={18} color="#4ade80" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: !health ? 'var(--mm-text-3)' : health.firestoreStatus !== 'Connected' ? 'var(--mm-danger)' : health.latencyMs < 150 ? 'var(--mm-success)' : 'var(--mm-warning)' }}>
                  {health ? `${health.latencyMs} ms` : 'Testing...'}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginTop: 4 }}>
                  Status: <strong style={{ color: health?.firestoreStatus === 'Connected' ? 'var(--mm-success)' : 'var(--mm-danger)' }}>{health?.firestoreStatus || 'Checking…'}</strong>
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Your Vault Records</span>
                  <Database size={18} color="#38bdf8" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>
                  {stats ? stats.transactionsCount + stats.accountsCount + stats.budgetsCount + stats.goalsCount + stats.loansCount + stats.billsCount + stats.investmentsCount : '...'} docs
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginTop: 4 }}>
                  Admin account only · other vaults are private
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', fontWeight: 600, textTransform: 'uppercase' }}>Security Posture</span>
                  <ShieldCheck size={18} color="#eab308" />
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#eab308' }}>
                  100% Enforced
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginTop: 4 }}>
                  Zero Public Buckets · Isolated UIDs
                </div>
              </div>

            </div>

            {/* Collection Document Matrix */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '1.25rem',
              marginBottom: '1.5rem'
            }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '0.95rem', color: 'var(--text-primary)', letterSpacing: 0.5 }}>
                Your Vault — Collection Document Matrix
              </h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--mm-text-3)' }}>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Collection Path</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Document Count</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Security Rule Scope</th>
                      <th style={{ padding: '0.6rem 0.75rem' }}>Persistence State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { path: '/accounts', count: stats?.accountsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/transactions', count: stats?.transactionsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/budgets', count: stats?.budgetsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/goals', count: stats?.goalsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/loans', count: stats?.loansCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/bills', count: stats?.billsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' },
                      { path: '/investments', count: stats?.investmentsCount || 0, scope: 'Per-UID Private', state: 'Synced IndexedDB' }
                    ].map(row => (
                      <tr key={row.path} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '0.75rem', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{row.path}</td>
                        <td style={{ padding: '0.75rem', color: 'var(--mm-success)', fontWeight: 700 }}>{row.count} records</td>
                        <td style={{ padding: '0.75rem', color: 'var(--mm-text-3)' }}>
                          <span style={{ padding: '2px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.1)', color: 'var(--mm-success)', fontSize: '0.72rem' }}>
                            {row.scope}
                          </span>
                        </td>
                        <td style={{ padding: '0.75rem', color: 'var(--mm-text-2)' }}>{row.state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Architecture Details Card */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem'
            }}>
              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#eab308' }}>Platform Environment</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: '#bbb' }}>
                  <div><strong>Firebase Project ID:</strong> {health?.firebaseProject}</div>
                  <div><strong>App Version:</strong> {health?.appVersion}</div>
                  <div><strong>Client Network:</strong> {health?.isOnline ? '🟢 Connected (Online)' : '🔴 Offline'}</div>
                  <div><strong>Local Cache:</strong> {health?.indexedDbStorage}</div>
                </div>
              </div>

              <div style={{ padding: '1.25rem', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#eab308' }}>Security & Auth Stack</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.78rem', color: '#bbb' }}>
                  <div><strong>Rules Isolation:</strong> request.auth.uid verified</div>
                  <div><strong>Biometric Engine:</strong> {health?.webAuthnStatus}</div>
                  <div><strong>Session Expiry:</strong> Active Inactivity Daemon</div>
                  <div><strong>Root Administrator:</strong> {SUPER_ADMIN_EMAIL}</div>
                </div>
              </div>
            </div>

          </motion.div>
        )}

        {/* TAB 2: USER DIRECTORY & ROLES */}
        {activeTab === 'users' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Registered Users & Permissions ({users.length})
                </h3>
                <p style={{ margin: '3px 0 0', color: 'var(--mm-text-3)', fontSize: '0.78rem' }}>
                  Real accounts appear here automatically after they sign in. Financial data stays private to each user.
                </p>
              </div>
              <button
                onClick={loadUsers}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.6rem 1.1rem',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'var(--mm-text-2)',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer' }}
              >
                <RefreshCw size={15} /> Reload Directory
              </button>
            </div>

            {usersError && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: 'var(--mm-danger)', fontSize: '0.8rem' }}>
                {usersError}
              </div>
            )}

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden'
            }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--mm-text-3)', background: 'rgba(255,255,255,0.01)' }}>
                      <th style={{ padding: '0.75rem 1rem' }}>User Email</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Role</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Registered</th>
                      <th style={{ padding: '0.75rem 1rem' }}>Last Active</th>
                      <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && !usersError && (
                      <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--mm-text-3)' }}>No directory entries yet. Users are added when they sign in.</td></tr>
                    )}
                    {users.map(u => {
                      const isOwner = u.role === 'Super Admin';
                      return (
                        <tr key={u.uid} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <div style={{ fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {u.email}
                              {isOwner && <Crown size={14} color="#eab308" />}
                            </div>
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <span style={{
                              padding: '3px 8px',
                              borderRadius: 6,
                              background: isOwner ? 'rgba(234, 179, 8, 0.15)' : 'rgba(129, 140, 248, 0.15)',
                              border: `1px solid ${isOwner ? '#eab308' : '#818cf8'}`,
                              color: isOwner ? '#eab308' : '#818cf8',
                              fontWeight: 700,
                              fontSize: '0.72rem'
                            }}>
                              {u.role}
                            </span>
                          </td>
                          <td style={{ padding: '0.9rem 1rem' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: u.verified_by_admin ? '#38bdf8' : 'var(--mm-success)' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.verified_by_admin ? '#38bdf8' : 'var(--mm-success)' }} />
                              {u.status || 'Active'}{u.verified_by_admin ? ' · Reviewed' : ''}
                            </span>
                          </td>
                          <td style={{ padding: '0.9rem 1rem', color: 'var(--mm-text-3)' }}>
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'}
                          </td>
                          <td style={{ padding: '0.9rem 1rem', color: 'var(--mm-text-2)', fontSize: '0.75rem' }}>
                            {u.lastActive ? new Date(u.lastActive).toLocaleString() : '—'}
                          </td>
                          <td style={{ padding: '0.9rem 1rem', textAlign: 'right' }}>
                            {isOwner ? (
                              <span style={{ color: 'var(--mm-text-3)', fontSize: '0.72rem', fontStyle: 'italic' }}>Protected Owner</span>
                            ) : (
                              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem', flexWrap: 'nowrap' }}>
                                <button
                                  onClick={() => handleToggleVerified(u)}
                                  title={u.verified_by_admin ? 'Clear reviewed mark' : 'Mark as reviewed'}
                                  style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: 6,
                                    background: u.verified_by_admin ? 'rgba(56, 189, 248, 0.15)' : 'rgba(74, 222, 128, 0.1)',
                                    border: `1px solid ${u.verified_by_admin ? 'rgba(56, 189, 248, 0.3)' : 'rgba(74, 222, 128, 0.25)'}`,
                                    color: u.verified_by_admin ? '#38bdf8' : '#4ade80',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem',
                                    fontWeight: 600
                                  }}
                                >
                                  {u.verified_by_admin ? 'Reviewed' : 'Review'}
                                </button>
                                <button
                                  onClick={() => handleSendResetEmail(u.email)}
                                  title="Send password reset email"
                                  style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: 6,
                                    background: 'rgba(129, 140, 248, 0.1)',
                                    border: '1px solid rgba(129, 140, 248, 0.25)',
                                    color: '#818cf8',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem',
                                    fontWeight: 600
                                  }}
                                >
                                  Reset
                                </button>
                                <button
                                  onClick={() => handleDeleteUser(u)}
                                  title="Delete user"
                                  style={{
                                    padding: '0.35rem 0.65rem',
                                    borderRadius: 6,
                                    background: 'rgba(248, 113, 113, 0.1)',
                                    border: '1px solid rgba(248, 113, 113, 0.2)',
                                    color: 'var(--mm-danger)',
                                    cursor: 'pointer',
                                    fontSize: '0.72rem'
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Zero-Cost Email Branding & Delivery Guide */}
            <div style={{
              marginTop: '1.25rem',
              background: 'rgba(56, 189, 248, 0.05)',
              border: '1px solid rgba(56, 189, 248, 0.2)',
              borderRadius: 16,
              padding: '1.25rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#38bdf8', fontWeight: 700, fontSize: '0.9rem' }}>
                <Sparkles size={18} /> Zero-Cost Custom Email Branding (Firebase Spark Free Tier)
              </div>
              <p style={{ margin: 0, fontSize: '0.8rem', color: '#cbd5e1', lineHeight: 1.6 }}>
                You do not need to pay SendGrid, Mailgun, or AWS SES to brand your verification emails. In your Firebase Console, you can brand outgoing emails for free:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginTop: 4 }}>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>1. Sender Name</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Go to <strong>Authentication → Templates</strong> in Firebase Console. Click Edit icon and set Sender Name to <strong>"Vault Manager"</strong>.</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>2. Reply-To Address</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Set Reply-To to <strong>isuru@moneymanager.app</strong> so member replies route directly to your admin inbox.</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>3. Direct Verification</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>If any user has an overactive spam filter, you can click <strong>"Verify"</strong> above to instantly activate their vault.</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB 3: GLOBAL SYSTEM BROADCAST */}
        {activeTab === 'broadcast' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              
              {/* Broadcast Composer */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1.5rem'
              }}>
                <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Compose Global In-App Announcement
                </h3>
                <p style={{ margin: '0 0 1.25rem', color: 'var(--mm-text-3)', fontSize: '0.78rem' }}>
                  This message will render prominently on the Dashboard of every user across desktop and mobile.
                </p>

                <form onSubmit={handlePublishBroadcast} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#bbb', marginBottom: 4 }}>
                      Announcement Severity Level
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      {[
                        { id: 'info', label: 'ℹ️ Information', color: '#38bdf8' },
                        { id: 'warning', label: '⚠️ Warning', color: '#fbbf24' },
                        { id: 'critical', label: '🚨 Urgent / Critical', color: '#f87171' }
                      ].map(lvl => (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() => setBroadcastLevel(lvl.id)}
                          style={{
                            flex: 1,
                            padding: '0.55rem',
                            borderRadius: 8,
                            border: `1px solid ${broadcastLevel === lvl.id ? lvl.color : 'rgba(255,255,255,0.08)'}`,
                            background: broadcastLevel === lvl.id ? 'rgba(255,255,255,0.08)' : 'transparent',
                            color: broadcastLevel === lvl.id ? lvl.color : '#777',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                          }}
                        >
                          {lvl.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#bbb', marginBottom: 4 }}>
                      Announcement Message
                    </label>
                    <textarea
                      rows={4}
                      value={broadcastMsg}
                      onChange={e => setBroadcastMsg(e.target.value)}
                      placeholder="e.g. System upgrade scheduled for tonight at 02:00 UTC. Expect 5 minutes of read-only mode."
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 10,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
                        resize: 'vertical'
                      }}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    style={{
                      padding: '0.75rem',
                      borderRadius: 10,
                      background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                      border: 'none',
                      color: 'var(--bg-void)',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      cursor: busy ? 'not-allowed' : 'pointer',
                      opacity: busy ? 0.7 : 1
                    }}
                  >
                    {busy ? 'Publishing…' : '📢 Publish Global Broadcast'}
                  </button>
                </form>
              </div>

              {/* Live Preview Card */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}>
                <div>
                  <h4 style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>
                    Live User Screen Preview
                  </h4>
                  <div style={{
                    padding: '1rem',
                    borderRadius: 12,
                    background: broadcastLevel === 'critical' ? 'rgba(239, 68, 68, 0.15)' : broadcastLevel === 'warning' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                    border: `1px solid ${broadcastLevel === 'critical' ? '#ef4444' : broadcastLevel === 'warning' ? '#f59e0b' : '#3b82f6'}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}>
                    <Megaphone size={20} color={broadcastLevel === 'critical' ? '#ef4444' : broadcastLevel === 'warning' ? '#f59e0b' : '#3b82f6'} />
                    <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', flex: 1 }}>
                      {broadcastMsg.trim() || 'Your broadcast announcement will appear right here at the top of every dashboard.'}
                    </div>
                  </div>
                </div>

                {announcement && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', marginBottom: 6 }}>
                      Currently Live: <strong>{announcement.message}</strong> (Level: {announcement.level})
                    </div>
                    <button
                      onClick={handleClearBroadcast}
                      disabled={busy}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: 8,
                        background: 'rgba(248, 113, 113, 0.15)',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                        color: 'var(--mm-danger)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.6 : 1
                      }}
                    >
                      ✕ Revoke & Remove Broadcast
                    </button>
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        )}

        {/* TAB 4: MAINTENANCE & CONTROLS */}
        {activeTab === 'maintenance' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
              
              {/* Maintenance Mode Toggle Card */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1.5rem'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    {maintenance.active ? <Lock size={20} color="#f87171" /> : <Unlock size={20} color="#4ade80" />}
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      Maintenance Mode Lock
                    </h3>
                  </div>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: 20,
                    background: maintenance.active ? 'rgba(248, 113, 113, 0.2)' : 'rgba(74, 222, 128, 0.2)',
                    color: maintenance.active ? 'var(--mm-danger)' : 'var(--mm-success)',
                    fontSize: '0.72rem',
                    fontWeight: 700
                  }}>
                    {maintenance.active ? 'ACTIVE LOCK' : 'NORMAL (ONLINE)'}
                  </span>
                </div>
                <p style={{ margin: '0 0 1rem', color: 'var(--mm-text-3)', fontSize: '0.78rem' }}>
                  When enabled, non-admin members are greeted by an elegant maintenance message, while <code>{SUPER_ADMIN_EMAIL}</code> retains full operational access.
                </p>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#bbb', marginBottom: 4 }}>
                    Custom Member Reason Message
                  </label>
                  <input
                    type="text"
                    value={maintReason}
                    onChange={e => setMaintReason(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem'
                    }}
                  />
                </div>

                <button
                  onClick={handleToggleMaintenance}
                  disabled={busy}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: 10,
                    background: maintenance.active ? 'linear-gradient(135deg, #4ade80, #22c55e)' : 'linear-gradient(135deg, #f87171, #ef4444)',
                    border: 'none',
                    color: '#fff',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: busy ? 'not-allowed' : 'pointer',
                    opacity: busy ? 0.7 : 1
                  }}
                >
                  {busy ? 'Updating Mode…' : maintenance.active ? '🔓 Deactivate Maintenance Mode' : '🔒 Activate Emergency Maintenance Mode'}
                </button>
              </div>

              {/* Master System Operations */}
              <div style={{
                background: 'rgba(255,255,255,0.02)',
                borderRadius: 16,
                border: '1px solid rgba(255,255,255,0.06)',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
              }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Master System Operations
                </h3>

                <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 2 }}>Export Comprehensive System Dump</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginBottom: 8 }}>Produces an unredacted JSON snapshot of all platform records and audit events.</div>
                  <button
                    onClick={handleExportDump}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: 8,
                      background: 'rgba(129, 140, 248, 0.2)',
                      border: '1px solid #818cf8',
                      color: '#818cf8',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Download Master JSON
                  </button>
                </div>

                <div style={{ padding: '0.85rem', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', marginBottom: 2 }}>Purge & Resync Local Offline Persistence</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', marginBottom: 8 }}>Evicts volatile browser caches and rebuilds from cloud master Firestore without touching records.</div>
                  <button
                    onClick={handleFlushCache}
                    style={{
                      padding: '0.45rem 0.9rem',
                      borderRadius: 8,
                      background: 'rgba(248, 113, 113, 0.15)',
                      border: '1px solid #f87171',
                      color: 'var(--mm-danger)',
                      fontWeight: 700,
                      fontSize: '0.75rem',
                      cursor: 'pointer'
                    }}
                  >
                    Purge & Resync
                  </button>
                </div>
              </div>

            </div>
          </motion.div>
        )}

        {activeTab === 'maintenance' && (
          <div style={{ marginTop: '1.25rem', padding: '1rem', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>Your data backup</h3>
            <p style={{ margin: '4px 0 0.75rem', color: 'var(--mm-text-3)', fontSize: '0.78rem' }}>Exports only your own signed-in account data as a JSON file.</p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button type="button" onClick={handleExportBackup} style={{ padding: '0.6rem 1.1rem', borderRadius: 10, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.1)', color: 'var(--mm-success)', fontWeight: 700, cursor: 'pointer' }}>
                Export full backup (JSON)
              </button>
              <label style={{ fontSize: '0.8rem', color: 'var(--mm-text-2)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Backup reminder every
                <input type="number" min={1} max={365} value={backupDays} onChange={e => handleBackupDays(e.target.value)} style={{ width: 64, padding: '0.35rem', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'var(--text-primary)' }} />
                days
              </label>
            </div>
          </div>
        )}

        {/* TAB 5: ADMIN SECURITY AUDIT STREAM */}
        {activeTab === 'audit' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                  Super Admin Governance Stream ({auditLogs.length} events)
                </h3>
                <p style={{ margin: '3px 0 0', color: 'var(--mm-text-3)', fontSize: '0.78rem' }}>
                  Tamper-evident chronological activity ledger tracking root administrative actions.
                </p>
              </div>
            </div>

            <div style={{
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.06)',
              padding: '1rem',
              maxHeight: 500,
              overflowY: 'auto'
            }}>
              {auditLogs.map((log, idx) => (
                <div
                  key={log.id || idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.75rem 0.5rem',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    fontSize: '0.8rem',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: log.action.includes('DELETE') ? 'var(--mm-danger)' : log.action.includes('UPDATE') ? 'var(--mm-warning)' : 'var(--mm-success)'
                    }} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{log.details}</div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', marginTop: 2 }}>
                        Target: <span style={{ color: 'var(--mm-text-2)' }}>{log.target}</span> · Admin: <span style={{ color: '#eab308' }}>{log.admin}</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', whiteSpace: 'nowrap' }}>
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>

            <h3 style={{ margin: '1.5rem 0 0.5rem', fontSize: '1rem', color: 'var(--text-primary)' }}>Audit log (server, latest 50)</h3>
            {remoteAuditError && <div style={{ color: 'var(--mm-danger)', fontSize: '0.78rem', marginBottom: 8 }}>{remoteAuditError}</div>}
            <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 16, border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', maxHeight: 500, overflowY: 'auto' }}>
              {remoteAudit.length === 0 && !remoteAuditError && <div style={{ color: 'var(--mm-text-3)', fontSize: '0.8rem' }}>No server audit entries yet.</div>}
              {remoteAudit.map(entry => (
                <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.6rem 0.25rem', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{entry.action} · {entry.details}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', marginTop: 2 }}>Target: {entry.target} · Admin: {entry.admin}</div>
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-3)', whiteSpace: 'nowrap' }}>{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : '—'}</div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </PageWrapper>
  );
}
