import { backupFingerprint, planBackupImport } from '../utils/backupPlan';
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageWrapper from '../components/PageWrapper';
import { Sun, Moon, LogOut, Shield, Bell, Palette, Info, Lock, Unlock, Globe, Check, Key, Download, Upload, Fingerprint, List, Plus, Trash2, Zap, Wrench, ShieldCheck, Activity, Play, Crown, Smartphone, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { saveUserPrefs, fetchAccounts, fetchTransactions, fetchBudgets, fetchGoals, fetchLoans, fetchBills, fetchInvestments, getUserId, migrateDataAddUid, deleteTransaction, invalidateCache } from '../utils/api';
import { loadDemoPortfolio } from '../utils/demoData';
import { db, auth } from '../utils/firebase';
import { runTransaction, doc, collection, query, where, getDocs } from 'firebase/firestore';
import Modal from '../components/Modal';
import { isSuperAdmin } from '../utils/adminService';
import { requestNotificationPermission, sendNotification, getNotificationPermission } from '../utils/notificationService';
import { isStandalone, isIOS, triggerInstallPrompt } from '../utils/pwaInstall';
import { exportFullVaultBackup, decryptVaultBackup, getBackupHealthStatus } from '../utils/backupCrypto';
import { getBackupReminderDays, setBackupReminderDays } from '../utils/alertEngine';


const SUGGESTED_CATEGORIES = [
  { name: 'Food', emoji: '🍔', color: '#f87171' },
  { name: 'Transport', emoji: '🚗', color: '#60a5fa' },
  { name: 'Rent', emoji: '🏠', color: '#4ade80' },
  { name: 'Utilities', emoji: '⚡', color: '#facc15' },
  { name: 'Shopping', emoji: '🛍️', color: '#c084fc' },
  { name: 'Health', emoji: '💊', color: '#ec4899' },
  { name: 'Education', emoji: '📚', color: '#fb923c' },
  { name: 'Entertainment', emoji: '🎭', color: '#2dd4bf' },
  { name: 'Travel', emoji: '✈️', color: '#818cf8' },
  { name: 'Salary', emoji: '💰', color: '#4ade80' },
  { name: 'Business', emoji: '💼', color: '#a78bfa' },
  { name: 'Savings', emoji: '🐷', color: '#f472b6' },
  { name: 'Bills', emoji: '💳', color: '#facc15' },
  { name: 'Maintenance', emoji: '🔧', color: '#9ca3af' },
  { name: 'Phone', emoji: '📱', color: '#60a5fa' }
];

const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#ec4899'];

const CURRENCIES = [
  { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'GBP', name: 'British Pound', symbol: '£' },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ' },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$' },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$' },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$' },
];

const SectionHeader = ({ label }) => (
  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', letterSpacing: '2px', color: '#444', marginBottom: '0.75rem', marginTop: '0.5rem' }}>
    {label}
  </div>
);

const SettingsRow = ({ icon: Icon, label, description, children, color = '#4ade80' }) => (
  <motion.div
    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.1rem 1.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', gap: '1rem', marginBottom: '0.5rem' }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
      <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{label}</div>
        {description && <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2, fontFamily: 'Inter, sans-serif' }}>{description}</div>}
      </div>
    </div>
    <div style={{ flexShrink: 0 }}>{children}</div>
  </motion.div>
);

const Toggle = ({ checked, onChange, color = '#818cf8' }) => (
  <button
    onClick={onChange}
    style={{ width: 48, height: 26, borderRadius: 13, background: checked ? color : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.25s', boxShadow: checked ? `0 0 12px ${color}66` : 'none' }}
  >
    <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: checked ? 25 : 3, transition: 'left 0.25s', boxShadow: '0 2px 4px rgba(0,0,0,0.3)' }} />
  </button>
);

// Simple SHA-256 hash for PIN storage
const hashPin = async (pin) => {
  const msgBuffer = new TextEncoder().encode(pin + 'vm_salt_2025');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

const Settings = () => {
  const navigate = useNavigate();
  const [theme, setTheme] = useState(() => localStorage.getItem('vm_theme') || 'dark');
  const [minimalistMode, setMinimalistMode] = useState(() => {
    const val = localStorage.getItem('vm_minimalist_view');
    return val !== null ? val === 'true' : true;
  });
  const [currency, setCurrency] = useState(() => localStorage.getItem('vm_currency') || 'LKR');
  const [notifications, setNotifications] = useState(() => localStorage.getItem('vm_notifications') === 'true');
  const [notifPerm, setNotifPerm] = useState(() => getNotificationPermission());
  const [pinEnabled, setPinEnabled] = useState(() => !!localStorage.getItem('vm_pin_hash'));
  const [privacyShield, setPrivacyShield] = useState(() => localStorage.getItem('vm_privacy_shield') !== 'false');
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinStep, setPinStep] = useState('enter'); // 'enter' | 'confirm'
  const [pinInput, setPinInput] = useState('');
  const [pinFirst, setPinFirst] = useState('');
  const [pinError, setPinError] = useState('');
  const [,,] = useState(false);
  const [uid, setUid] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [importData, setImportData] = useState(null);
  const [importPreview, setImportPreview] = useState(null);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupHealth, setBackupHealth] = useState(() => getBackupHealthStatus());
  const [backupReminderDays, setBackupReminderDaysState] = useState(() => getBackupReminderDays());
  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const stored = localStorage.getItem('vm_custom_categories');
      if (stored) return JSON.parse(stored);
    } catch {}
    return SUGGESTED_CATEGORIES;
  });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '', color: COLORS[0] });

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(() => !!localStorage.getItem('vm_webauthn_cred_id'));

  useEffect(() => {
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(avail => {
        setBiometricAvailable(avail);
      });
    }
  }, []);

  const saveCategories = (cats) => {
    setCustomCategories(cats);
    localStorage.setItem('vm_custom_categories', JSON.stringify(cats));
  };

  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState(null);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);

  const runDiagnostic = async () => {
    setDiagnosticLoading(true);
    const toastId = toast.loading('Running deep database scan...');
    try {
      const [accounts, transactions, budgets, loans] = await Promise.all([
        fetchAccounts(), fetchTransactions(), fetchBudgets(), fetchLoans()
      ]);

      const accountIds = new Set(accounts.map(a => String(a.id)));

      // 1. Detect duplicates
      const seen = new Set();
      const duplicates = [];
      transactions.forEach(t => {
        const key = `${t.date}_${t.amount}_${t.type}_${t.category}_${t.from_account_id}`;
        if (seen.has(key)) {
          duplicates.push(t);
        } else {
          seen.add(key);
        }
      });

      // 2. Detect orphaned transactions
      const orphaned = transactions.filter(t => {
        if (t.from_account_id && !accountIds.has(String(t.from_account_id).replace('account_', ''))) return true;
        if (t.to_account_id && !accountIds.has(String(t.to_account_id).replace('account_', ''))) return true;
        return false;
      });

      // 3. Detect invalid budgets
      const invalidBudgets = budgets.filter(b => !b.amount || b.amount <= 0 || !b.category);

      const totalChecks = transactions.length + budgets.length + loans.length;
      const issuesCount = duplicates.length + orphaned.length + invalidBudgets.length;
      const integrityScore = totalChecks > 0 ? Math.max(0, Math.round(((totalChecks - issuesCount) / totalChecks) * 100)) : 100;

      const result = {
        duplicates,
        orphaned,
        invalidBudgets,
        integrityScore,
        scannedAt: new Date().toLocaleTimeString(),
        totalScanned: totalChecks
      };

      setDiagnosticResult(result);
      if (issuesCount === 0) {
        toast.success('Database verified! 100% integrity score ✓', { id: toastId });
      } else {
        toast(`Scan complete: ${issuesCount} anomaly found`, { icon: '⚠️', id: toastId });
      }
    } catch (e) {
      console.error(e);
      toast.error('Diagnostic scan failed', { id: toastId });
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const autoRepairDatabase = async () => {
    if (!diagnosticResult) return;
    const toastId = toast.loading('Repairing database anomalies...');
    try {
      if (diagnosticResult.duplicates.length > 0) {
        for (const dup of diagnosticResult.duplicates) {
          if (dup.id) await deleteTransaction(dup.id);
        }
      }
      toast.success('Database successfully repaired & optimized!', { id: toastId });
      runDiagnostic();
    } catch (e) {
      console.error(e);
      toast.error('Auto-repair failed', { id: toastId });
    }
  };

  // Load uid on mount
  useEffect(() => {
    const user = auth.currentUser;
    if (user) setUid(user.uid);
  }, []);

  // Load data statistics
  const [dataStats, setDataStats] = useState(null);
  useEffect(() => {
    const load = async () => {
      try {
        const [accs, txs, bud, gls, lns, bls, inv] = await Promise.all([
          fetchAccounts(), fetchTransactions(), fetchBudgets(), fetchGoals(), fetchLoans(), fetchBills(), fetchInvestments(),
        ]);
        const totalBalance = accs.reduce((s, a) => s + (a.balance || 0), 0);
        const totalSpent = txs.filter(t => t.type === 'Expense').reduce((s, t) => s + (t.amount || 0), 0);
        setDataStats({
          accounts: accs.length, transactions: txs.length, budgets: bud.length,
          goals: gls.length, loans: lns.length, bills: bls.length, investments: inv.length,
          totalBalance, totalSpent,
          oldestTx: txs.length > 0 ? txs.reduce((o, t) => (t.date < o) ? t.date : o, txs[0].date) : null,
        });
      } catch { /* silent */ }
    };
    load();
  }, []);

  const savePrefs = useCallback(async (patch) => {
    if (!uid) return;
    setSaving(true);
    await saveUserPrefs(uid, patch);
    setSaving(false);
  }, [uid]);

  
  const handleBiometricToggle = async () => {
    if (biometricEnabled) {
      localStorage.removeItem('vm_webauthn_cred_id');
      setBiometricEnabled(false);
      toast.success('Biometric unlock disabled');
    } else {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const cred = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'VaultManager', id: window.location.hostname },
            user: { id: new Uint8Array(16), name: 'user@vaultmanager.local', displayName: 'VaultManager User' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }
          }
        });
        if (cred) {
          const credId = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId)));
          localStorage.setItem('vm_webauthn_cred_id', JSON.stringify({ id: credId }));
          setBiometricEnabled(true);
          toast.success('Biometric unlock enabled');
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to setup biometric unlock');
      }
    }
  };

  const handleThemeToggle = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('vm_theme', next);
    if (next === 'light') document.body.classList.add('light-mode');
    else document.body.classList.remove('light-mode');
    toast.success(`Switched to ${next} mode`);
    await savePrefs({ theme: next });
  };

  const handleCurrencyChange = async (code) => {
    setCurrency(code);
    invalidateCache();
    localStorage.setItem('vm_currency', code);
    toast.success(`Currency set to ${code}`);
    await savePrefs({ currency: code });
  };

  const handleNotifToggle = async () => {
    const next = !notifications;
    setNotifications(next);
    localStorage.setItem('vm_notifications', String(next));
    if (next) {
      const p = await requestNotificationPermission();
      setNotifPerm(p);
      if (p === 'granted') {
        toast.success('Smart notifications activated! 🔔');
      } else {
        toast('Notification permission required in browser settings', { icon: 'ℹ️' });
      }
    } else {
      toast.success('Notifications disabled');
    }
  };

  const handleSendTestNotification = () => {
    const success = sendNotification('💰 Vault Manager Test Alert', {
      body: 'Your smart notification engine is operating normally. Zero cost, 100% private.',
      icon: '/pwa-192x192.png'
    });
    if (success) {
      toast.success('Test notification dispatched!');
    } else {
      toast.error('Could not fire notification. Check browser permissions.');
    }
  };

  const handlePrivacyShieldToggle = () => {
    const next = !privacyShield;
    setPrivacyShield(next);
    localStorage.setItem('vm_privacy_shield', String(next));
    window.dispatchEvent(new Event('vm:privacy-shield-toggled'));
    toast.success(`Multitasking Privacy Shield ${next ? 'enabled' : 'disabled'}`);
  };

  // PIN Setup Flow
  const startPinSetup = () => {
    setPinStep('enter');
    setPinInput('');
    setPinFirst('');
    setPinError('');
    setShowPinSetup(true);
  };

  const handlePinDigit = (d) => {
    const next = (pinInput + d).slice(0, 4);
    setPinInput(next);
    setPinError('');
    if (next.length === 4) {
      if (pinStep === 'enter') {
        setTimeout(() => { setPinFirst(next); setPinInput(''); setPinStep('confirm'); }, 200);
      } else {
        // Confirm
        setTimeout(async () => {
          if (next === pinFirst) {
            const hash = await hashPin(next);
            localStorage.setItem('vm_pin_hash', hash);
            setPinEnabled(true);
            setShowPinSetup(false);
            toast.success('PIN set successfully 🔒');
          } else {
            setPinError('PINs do not match. Try again.');
            setPinInput('');
            setPinFirst('');
            setPinStep('enter');
          }
        }, 200);
      }
    }
  };

  const handlePinDelete = () => setPinInput(p => p.slice(0, -1));

  const handleRemovePin = () => {
    localStorage.removeItem('vm_pin_hash');
    setPinEnabled(false);
    toast.success('PIN removed');
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      toast.success('Signed out successfully');
    } catch { toast.error('Failed to sign out'); }
  };
  
  
  const handleSaveCategory = () => {
    if (!catForm.name || !catForm.emoji) return toast.error('Name and emoji required');
    let updated;
    if (editingCategory !== null) {
      updated = [...customCategories];
      updated[editingCategory] = catForm;
    } else {
      updated = [...customCategories, catForm];
    }
    saveCategories(updated);
    setShowCategoryModal(false);
  };
  const handleDeleteCategory = (idx) => {
    if (confirm('Delete category?')) {
      const updated = customCategories.filter((_, i) => i !== idx);
      saveCategories(updated);
    }
  };
  const moveCategory = (idx, dir) => {
    const updated = [...customCategories];
    if (dir === -1 && idx > 0) {
      const temp = updated[idx];
      updated[idx] = updated[idx - 1];
      updated[idx - 1] = temp;
    } else if (dir === 1 && idx < updated.length - 1) {
      const temp = updated[idx];
      updated[idx] = updated[idx + 1];
      updated[idx + 1] = temp;
    }
    saveCategories(updated);
  };

  const handleExportData = async (useEncryption = false) => {
    try {
      const pass = useEncryption ? backupPassphrase.trim() : '';
      if (useEncryption && pass.length < 4) {
        toast.error('Enter a passphrase (at least 4 characters) to encrypt your backup');
        return;
      }
      const toastId = toast.loading(pass ? 'Encrypting backup (AES-256-GCM)...' : 'Preparing backup...');
      const res = await exportFullVaultBackup(pass);
      setBackupHealth(getBackupHealthStatus());
      toast.success(
        res.encrypted
          ? `Encrypted backup saved (${res.filename})`
          : `Backup exported (${res.filename})`,
        { id: toastId }
      );
    } catch (e) {
      console.error(e);
      toast.error('Failed to export backup');
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        let json = JSON.parse(ev.target.result);
        if (json && json.encrypted === true) {
          const pass = backupPassphrase.trim() || window.prompt('Enter your AES-256 backup passphrase to decrypt:');
          if (!pass) {
            toast.error('Passphrase required to unlock encrypted backup');
            return;
          }
          const tid = toast.loading('Decrypting AES-256-GCM backup...');
          try {
            json = await decryptVaultBackup(json, pass);
            toast.success('Backup decrypted!', { id: tid });
          } catch (decErr) {
            toast.error(decErr.message || 'Incorrect passphrase', { id: tid });
            return;
          }
        }
        if (!json.version || !json.accounts) throw new Error('Invalid format');
        const uid = await getUserId(), fingerprint = await backupFingerprint(json);
        let plan = planBackupImport(json, uid, fingerprint);
        const legacy = planBackupImport(json, uid, fingerprint, { legacyIds: true });
        const sections = [...new Set(plan.groups.flat().map(row => row.path.length === 4 ? row.path[2] : row.path[0]))];
        const nested = new Set(['bills','investments','rules','shared_tabs','invoices']);
        const snapshots = await Promise.all(sections.map(section => getDocs(query(
          collection(db, ...(nested.has(section) ? ['users',uid,section] : [section])),
          where('uid','==',uid), where('import_id','==',fingerprint)
        ))));
        const existing = new Set(snapshots.flatMap((snap,index) => snap.docs.map(row => [...(nested.has(sections[index]) ? ['users',uid,sections[index]] : [sections[index]]), row.id].join('/'))));
        const usesLegacy = legacy.groups.flat().some(row => existing.has(row.path.join('/')));
        if (usesLegacy) plan = legacy;
        const counts = sections.map(section => {
          const rows = plan.groups.flat().filter(row => (row.path.length === 4 ? row.path[2] : row.path[0]) === section);
          return { section, total: rows.length, completed: rows.filter(row => existing.has(row.path.join('/'))).length };
        });
        const conflicts = plan.groups.filter(group => { const count = group.filter(row => existing.has(row.path.join('/'))).length; return count > 0 && count < group.length; }).length;
        setImportPreview({ uid, plan, counts, conflicts, usesLegacy });
        setImportData(json);
        setShowImportConfirm(true);
      } catch (error) {
  setImportData(null);
  setImportPreview({ error: error.message || 'Invalid backup file' });
  setShowImportConfirm(true);
}
    };
    reader.readAsText(file);
    e.target.value = null; // reset
  };

  const executeImport = async () => {
    if (!importData) return;
    setShowImportConfirm(false);
    const toastId = toast.loading('Importing data...');
    try {
      const currentUid = await getUserId();
      if (!currentUid) throw new Error("No user id");

      if (currentUid !== importPreview?.uid) throw new Error('Account changed. Select the backup again.');
      const plan = importPreview.plan;
      if (importPreview.conflicts) throw new Error('Resolve incomplete linked groups before importing');
      let completed = 0;
      for (const group of plan.groups) {
        await runTransaction(db, async txn => {
          const refs = group.map(op => doc(db, ...op.path));
          const snapshots = await Promise.all(refs.map(ref => txn.get(ref)));
          if (snapshots.some(snap => snap.exists() && (snap.data().uid !== currentUid || snap.data().import_id !== plan.fingerprint))) throw new Error('Import ID conflict. No existing record will be overwritten');
          if (snapshots.every(snap => snap.exists())) return;
          if (snapshots.some(snap => snap.exists())) throw new Error('Incomplete linked import group; review this import before continuing');
          group.forEach((op, index) => txn.set(refs[index], op.data));
        });
        completed += group.length;
        toast.loading(`Importing ${completed} of ${plan.total} records…`, { id: toastId });
      }

      invalidateCache();
      toast.success('Data imported successfully!', { id: toastId });
      setImportData(null);
    } catch (e) {
      console.error(e);
      toast.error(`${e.message || 'Import interrupted'}. Retry the same backup to resume; completed records will be skipped.`, { id: toastId });
    }
  };

  const DIGITS = ['1','2','3','4','5','6','7','8','9','','0','⌫'];

  return (
    <PageWrapper>
      <div>
        <div className="page-header">
          <div>
            <h1 className="glow-text text-cyan" style={{ margin: 0, fontSize: '2rem' }}>Settings</h1>
            <p style={{ color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontSize: '0.75rem', marginTop: 4 }}>SYSTEM CONFIGURATION{saving ? ' · SAVING...' : ''}</p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680 }}>

          {/* SUPER ADMIN COMMAND CENTER (Exclusive to isuru@moneymanager.app) */}
          {isSuperAdmin(auth.currentUser) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              style={{
                padding: '1.25rem 1.5rem',
                borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(234, 179, 8, 0.15), rgba(167, 139, 250, 0.1))',
                border: '1.5px solid rgba(234, 179, 8, 0.4)',
                marginBottom: '1.5rem',
                boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(234, 179, 8, 0.4)'
                }}>
                  <Crown size={22} color="#1a1a2e" strokeWidth={2.5} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                      Super Admin Command Center
                    </span>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: 12,
                      background: 'rgba(234, 179, 8, 0.2)',
                      border: '1px solid #eab308',
                      color: '#eab308',
                      fontSize: '0.65rem',
                      fontWeight: 800
                    }}>
                      ROOT ACCESS
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                    Manage platform users, broadcast global announcements, & view system telemetry.
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate('/admin')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  padding: '0.65rem 1.25rem',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                  border: 'none',
                  color: 'var(--bg-void)',
                  fontWeight: 800,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                  boxShadow: '0 4px 16px rgba(234, 179, 8, 0.3)'
                }}
              >
                Launch Admin Console →
              </button>
            </motion.div>
          )}

          {/* APPEARANCE */}
          <details className="quiet-section settings-disclosure" open><summary>Appearance</summary><div className="quiet-section-content">
          <SettingsRow icon={theme === 'dark' ? Moon : Sun} label={`${theme === 'dark' ? 'Dark' : 'Light'} Mode`} description={`Currently: ${theme} theme — synced across devices`} color="#818cf8">
            <Toggle checked={theme === 'light'} onChange={handleThemeToggle} color="#818cf8" />
          </SettingsRow>
          <SettingsRow
            icon={Sparkles}
            label="Minimalist Focus Mode"
            description="Prioritizes core essentials (net worth, today's safe allowance, recent activity) and hides visual clutter"
            color="#00f5ff"
          >
            <Toggle
              checked={minimalistMode}
              onChange={() => {
                const next = !minimalistMode;
                setMinimalistMode(next);
                localStorage.setItem('vm_minimalist_view', String(next));
                window.dispatchEvent(new CustomEvent('vm:minimalist-view-changed', { detail: next }));
                toast.success(next ? 'Minimalist Focus Mode enabled' : 'Detailed Mode enabled');
              }}
              color="#00f5ff"
            />
          </SettingsRow>

          {/* Accent Color Picker */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Palette size={18} style={{ color: '#a78bfa' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Accent Color</div>
                <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>Choose your UI highlight color</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
              {[
                { hex: '#00f5ff', label: 'Cyan' },
                { hex: '#4ade80', label: 'Green' },
                { hex: '#a78bfa', label: 'Purple' },
                { hex: '#f472b6', label: 'Pink' },
                { hex: '#fb923c', label: 'Orange' },
                { hex: '#fbbf24', label: 'Gold' },
                { hex: '#38bdf8', label: 'Sky' },
                { hex: '#f87171', label: 'Red' },
              ].map(({ hex, label }) => {
                const isActive = (localStorage.getItem('vm_accent') || '#00f5ff') === hex;
                return (
                  <button key={hex} title={label} onClick={() => {
                    localStorage.setItem('vm_accent', hex);
                    import('../utils/theme').then(m => m.applyAccent(hex));
                    savePrefs({ accent: hex });
                    toast.success(`Accent: ${label}`);
                  }} style={{
                    width: 36, height: 36, borderRadius: '50%', background: hex, border: isActive ? `3px solid #fff` : '3px solid transparent',
                    cursor: 'pointer', boxShadow: isActive ? `0 0 14px ${hex}` : 'none',
                    transition: 'all 0.2s', transform: isActive ? 'scale(1.15)' : 'scale(1)',
                  }} />
                );
              })}
            </div>
          </motion.div>

          {/* WEB APP / MOBILE PWA INSTALLATION */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>App & notifications</summary><div className="quiet-section-content">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, flex: 1 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: isStandalone() ? 'rgba(74,222,128,0.15)' : 'linear-gradient(135deg, rgba(74,222,128,0.2), rgba(6,182,212,0.2))', border: `1px solid ${isStandalone() ? 'rgba(74,222,128,0.35)' : 'rgba(74,222,128,0.45)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Smartphone size={22} style={{ color: '#4ade80' }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                      {isStandalone() ? 'Installed as Web App' : 'Install as Mobile Web App'}
                    </span>
                    <span style={{
                      fontSize: '0.62rem', fontWeight: 800, padding: '2px 7px', borderRadius: 6,
                      background: isStandalone() ? 'rgba(74,222,128,0.18)' : 'rgba(251,191,36,0.18)',
                      color: isStandalone() ? '#4ade80' : '#fbbf24',
                      letterSpacing: '0.5px'
                    }}>
                      {isStandalone() ? 'STANDALONE MODE' : 'BROWSER MODE'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: 3, lineHeight: 1.4 }}>
                    {isStandalone()
                      ? 'Vault Manager is running as a full standalone app with offline database caching & home screen icon.'
                      : isIOS()
                      ? 'Add to your iPhone/iPad home screen via Safari for a distraction-free, full-screen financial experience.'
                      : 'Add to your Android home screen or desktop for 1-tap instant launch and zero-latency access.'}
                  </div>
                </div>
              </div>

              {!isStandalone() ? (
                <button
                  type="button"
                  onClick={() => triggerInstallPrompt()}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                    border: 'none',
                    color: '#0d1b2a',
                    fontWeight: 800,
                    fontSize: '0.84rem',
                    cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    boxShadow: '0 4px 16px rgba(74,222,128,0.3)',
                    flexShrink: 0,
                  }}
                >
                  <Download size={15} strokeWidth={2.4} />
                  <span>Install App</span>
                </button>
              ) : (
                <div style={{ padding: '0.4rem 0.8rem', borderRadius: 8, background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <Check size={14} strokeWidth={2.5} /> Active on this device
                </div>
              )}
            </div>
          </motion.div>

          {/* Auto-lock timeout */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={18} style={{ color: '#4ade80' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Auto-Lock Timer</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>PIN screen shown after this period of inactivity</div>
                </div>
              </div>
              <select value={localStorage.getItem('vm_lock_timeout') || '5'}
                onChange={e => {
                  localStorage.setItem('vm_lock_timeout', e.target.value);
                  const lbl = e.target.value === '0' ? 'Immediate' : e.target.value === '-1' ? 'Never' : `${e.target.value} min`;
                  toast.success(`Auto-lock: ${lbl}`);
                }}
                style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 8, padding: '0.4rem 0.75rem', color: '#4ade80', fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', cursor: 'pointer' }}
              >
                <option value="0">Immediate</option>
                <option value="1">1 min</option>
                <option value="5">5 min</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="60">1 hour</option>
                <option value="-1">Never</option>
              </select>
            </div>
          </motion.div>

          {/* Daily Spending Limit */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} style={{ color: '#fb923c' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Daily Spending Limit</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>Warn when daily expenses exceed this amount (0 = disabled)</div>
                </div>
              </div>
              <input type="number" min="0" placeholder="0"
                defaultValue={localStorage.getItem('vm_daily_limit') || ''}
                onBlur={e => {
                  const val = parseFloat(e.target.value) || 0;
                  if (val > 0) { localStorage.setItem('vm_daily_limit', String(val)); toast.success(`Daily limit: ${val}`); }
                  else { localStorage.removeItem('vm_daily_limit'); toast.success('Daily limit disabled'); }
                }}
                style={{ width: 100, background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 8, padding: '0.4rem 0.75rem', color: '#fb923c', fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', textAlign:'right' }}
              />
            </div>
          </motion.div>

          {/* Weekly Spending Limit */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Activity size={18} style={{ color: '#38bdf8' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>7-Day Weekly Velocity Limit</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>Alert when rolling 7-day expenses cross 80% or 100% of this cap (0 = disabled)</div>
                </div>
              </div>
              <input type="number" min="0" placeholder="0"
                defaultValue={localStorage.getItem('vm_weekly_limit') || ''}
                onBlur={e => {
                  const val = parseFloat(e.target.value) || 0;
                  if (val > 0) { localStorage.setItem('vm_weekly_limit', String(val)); toast.success(`Weekly limit: ${val}`); }
                  else { localStorage.removeItem('vm_weekly_limit'); toast.success('Weekly limit disabled'); }
                }}
                style={{ width: 100, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.3)', borderRadius: 8, padding: '0.4rem 0.75rem', color: '#38bdf8', fontSize: '0.85rem', fontFamily: 'Inter, sans-serif', textAlign:'right' }}
              />
            </div>
          </motion.div>

          {/* CURRENCY */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Currency</summary><div className="quiet-section-content">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} style={{ color: '#4ade80' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Display Currency</div>
                <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>All amounts shown in selected currency</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
              {CURRENCIES.map(c => (
                <button key={c.code} onClick={() => handleCurrencyChange(c.code)}
                  style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: currency === c.code ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.07)', background: currency === c.code ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.02)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}
                >
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', color: currency === c.code ? '#4ade80' : '#888', fontWeight: 700 }}>{c.symbol} {c.code}</div>
                  <div style={{ fontSize: '0.68rem', color: '#444', marginTop: 2 }}>{c.name}</div>
                </button>
              ))}
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Real-Time Global Converter</div>
                <div style={{ fontSize: '0.72rem', color: '#555' }}>Convert across 30+ currencies with live mid-market rates</div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event('vm:open-currency-converter'))}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.2))',
                  border: '1px solid rgba(56,189,248,0.3)',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                💱 Open Converter
              </button>
            </div>
          </motion.div>

          {/* FINTECH POWER SUITE */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Additional tools</summary><div className="quiet-section-content">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', marginBottom: '0.75rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Zap size={18} style={{ color: '#818cf8' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-primary)' }}>Institutional FinTech Tools</div>
                  <div style={{ fontSize: '0.74rem', color: '#666', fontFamily: 'Inter, sans-serif' }}>Enterprise-grade automation, AI co-pilot & group settlement</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.65rem' }}>
              {[
                { title: 'Transaction Rules', desc: 'Auto-categorization & tagging', icon: '⚡', event: 'vm:open-rules-manager', color: '#fbbf24' },
                { title: 'AI Co-Pilot', desc: 'Ledger audit & affordability simulator', icon: '🧠', event: 'vm:open-ai-copilot', color: '#818cf8' },
                { title: 'Cash Flow Calendar', desc: 'Monthly bill & liquidity timeline', icon: '📅', event: 'vm:open-cash-calendar', color: '#38bdf8' },
                { title: 'FIRE & Retirement', desc: 'Freedom age & compound forecast', icon: '🔥', event: 'vm:open-fire-planner', color: '#fb923c' },
                { title: 'Receipt Scanner', desc: 'On-device camera & OCR matching', icon: '🧾', event: 'vm:open-receipt-scanner', color: '#a78bfa' },
                { title: 'Tax & Capital Gains', desc: 'Deductions, brackets & PDF schedule', icon: '📑', event: 'vm:open-tax-suite', color: '#4ade80' },
                { title: 'Split & Settle', desc: 'Household tabs & debt minimization', icon: '👥', event: 'vm:open-split-settle', color: '#ec4899' },
                { title: 'Invoices & Billing', desc: 'Client billing & 1-click ledger sync', icon: '💼', event: 'vm:open-invoices', color: '#38bdf8' },
                { title: 'Live Bank Sync', desc: 'Open Banking simulation & hash audit', icon: '🏦', event: 'vm:open-bank-sync', color: '#a78bfa' },
                { title: 'Security Audit Trail', desc: 'Access logs & cryptographic events', icon: '🛡️', event: 'vm:open-security-audit', color: '#4ade80' },
                { title: 'Setup Wizard', desc: 'Re-run first-time onboarding', icon: '✨', event: 'vm:open-onboarding', color: '#f472b6' },
              ].map((tool, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => window.dispatchEvent(new Event(tool.event))}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.8rem 1rem',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 10,
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.18s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                >
                  <span style={{ fontSize: '1.3rem' }}>{tool.icon}</span>
                  <div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{tool.title}</div>
                    <div style={{ fontSize: '0.7rem', color: '#777', fontFamily: 'Inter, sans-serif' }}>{tool.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          {/* CATEGORIES */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Categories</summary><div className="quiet-section-content">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <List size={18} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Custom Categories</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>Manage transaction categories</div>
                </div>
              </div>
              <button onClick={() => { setEditingCategory(null); setCatForm({name:'', emoji:'', color:COLORS[0]}); setShowCategoryModal(true); }}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: 'none', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {customCategories.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <button onClick={() => moveCategory(i, -1)} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', padding:0, lineHeight:0 }} disabled={i===0}>▲</button>
                    <button onClick={() => moveCategory(i, 1)} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', padding:0, lineHeight:0 }} disabled={i===customCategories.length-1}>▼</button>
                  </div>
                  <div style={{ fontSize: '1.2rem' }}>{c.emoji}</div>
                  <div style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</div>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.color }} />
                  <button onClick={() => { setEditingCategory(i); setCatForm(c); setShowCategoryModal(true); }} style={{ background:'none', border:'none', color:'#a78bfa', cursor:'pointer', padding: '0.3rem' }}>Edit</button>
                  <button onClick={() => handleDeleteCategory(i)} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', padding: '0.3rem' }}><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          </motion.div>

          {/* NOTIFICATIONS */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Financial alerts</summary><div className="quiet-section-content">
          <SettingsRow icon={Bell} label="Smart Financial Alerts" description="Native browser & PWA notifications for due bills and budgets" color="#fbbf24">
            <Toggle checked={notifications} onChange={handleNotifToggle} color="#fbbf24" />
          </SettingsRow>
          {notifications && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'rgba(251, 191, 36, 0.05)',
                border: '1px solid rgba(251, 191, 36, 0.2)',
                borderRadius: 12,
                padding: '0.9rem 1.25rem',
                marginBottom: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.5rem'
              }}
            >
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Web Push Notification Engine
                </div>
                <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: 2 }}>
                  Status: <strong style={{ color: notifPerm === 'granted' ? '#4ade80' : '#fbbf24' }}>{notifPerm === 'granted' ? 'Active & Ready' : notifPerm}</strong> · 100% Free (No server cost)
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendTestNotification}
                style={{
                  padding: '0.45rem 0.9rem',
                  borderRadius: 8,
                  background: 'rgba(251, 191, 36, 0.15)',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                  color: '#fbbf24',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                🔔 Send Test Alert
              </button>
            </motion.div>
          )}

          {/* SECURITY */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Security</summary><div className="quiet-section-content">
          <SettingsRow icon={Shield} label="Auto Lock" description="PIN screen after 5 min inactivity, full logout after 30 min" color="#4ade80">
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.72rem', color: '#4ade80', background: 'rgba(16,185,129,0.1)', padding: '0.25rem 0.6rem', borderRadius: 6 }}>ACTIVE</span>
          </SettingsRow>

          <SettingsRow icon={ShieldCheck} label="Multitasking Privacy Shield" description="Blur screen when switching apps on mobile or backgrounding tabs" color="#4ade80">
            <Toggle checked={privacyShield} onChange={handlePrivacyShieldToggle} color="#4ade80" />
          </SettingsRow>

          <SettingsRow icon={pinEnabled ? Lock : Unlock} label="PIN Lock" description={pinEnabled ? 'PIN is active — protects on inactivity' : 'Set a 4-digit PIN for quick unlock'} color="#a78bfa">
            {pinEnabled ? (
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={startPinSetup} style={{ padding: '0.35rem 0.75rem', borderRadius: 7, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.8rem' }}>Change</button>
                <button onClick={handleRemovePin} style={{ padding: '0.35rem 0.75rem', borderRadius: 7, border: '1px solid rgba(244,63,94,0.3)', background: 'rgba(244,63,94,0.08)', color: '#f87171', cursor: 'pointer', fontSize: '0.8rem' }}>Remove</button>
              </div>
            ) : (
              <button onClick={startPinSetup} style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Set PIN</button>
            )}
          </SettingsRow>

          <SettingsRow icon={Shield} label="Data Security Migration" description="Update all your old records to include your user ID for new security rules." color="#f87171">
            <button onClick={async () => {
              try {
                const toastId = toast.loading('Migrating data...');
                const count = await migrateDataAddUid();
                toast.success(`Migration complete! Updated ${count} records.`, { id: toastId });
              } catch {
  toast.error('Migration failed');
}
            }} style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(244,63,94,0.4)', background: 'rgba(244,63,94,0.12)', color: '#f87171', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Run Migration</button>
          </SettingsRow>
          
          
          <SettingsRow icon={ShieldCheck} label="Security Audit Trail" description="Inspect chronological access logs, device sessions & security events" color="#38bdf8">
            <button
              onClick={() => window.dispatchEvent(new Event('vm:open-security-audit'))}
              style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(56,189,248,0.4)', background: 'rgba(56,189,248,0.12)', color: '#38bdf8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
            >
              View Trail
            </button>
          </SettingsRow>

          {biometricAvailable && (
            <>
              <SectionHeader label="BIOMETRIC UNLOCK" />
              <SettingsRow icon={Fingerprint} label="Fingerprint / Face ID" description="Unlock faster using device biometrics" color="#4ade80">
                <Toggle checked={biometricEnabled} onChange={handleBiometricToggle} color="#4ade80" />
              </SettingsRow>
            </>
          )}

          {/* DATA MANAGEMENT */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Backup & data management</summary><div className="quiet-section-content">
          <SettingsRow icon={Play} label="Demo Sandbox Portfolio" description="Populate realistic accounts, bills, and transactions for testing" color="#818cf8">
            <button
              onClick={async () => {
                const toastId = toast.loading('Loading demo portfolio...');
                try {
                  await loadDemoPortfolio();
                  toast.success('Demo portfolio loaded! Explore the app.', { id: toastId });
                  window.dispatchEvent(new Event('vm:data-changed'));
                } catch {
                  toast.error('Failed to load demo', { id: toastId });
                }
              }}
              style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(129,140,248,0.4)', background: 'rgba(129,140,248,0.12)', color: '#818cf8', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
            >
              Load Demo
            </button>
          </SettingsRow>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.85rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Download size={18} style={{ color: '#4ade80' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Local Vault Backup (JSON & AES-256-GCM)</span>
                    <span style={{
                      fontSize: '0.66rem',
                      padding: '0.12rem 0.45rem',
                      borderRadius: 20,
                      background: backupHealth.isDue ? 'rgba(251,191,36,0.14)' : 'rgba(74,222,128,0.14)',
                      color: backupHealth.isDue ? '#fbbf24' : '#4ade80',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 700,
                    }}>
                      {backupHealth.daysSinceBackup === null ? 'Never Backed Up' : backupHealth.daysSinceBackup === 0 ? 'Backed Up Today' : `${backupHealth.daysSinceBackup}d Since Last Backup`}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#666', marginTop: 2, fontFamily: 'Inter, sans-serif' }}>
                    Weekly auto-reminder enabled · Export plain JSON or encrypt on-device with PBKDF2 + AES-256-GCM
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                type="password"
                value={backupPassphrase}
                onChange={e => setBackupPassphrase(e.target.value)}
                placeholder="Optional passphrase for AES-256 encryption..."
                style={{
                  flex: '1 1 220px',
                  background: 'rgba(0,0,0,0.25)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 8,
                  padding: '0.45rem 0.75rem',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem',
                  fontFamily: 'Inter, sans-serif',
                }}
              />
              <button
                type="button"
                onClick={() => handleExportData(false)}
                style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.12)', color: '#4ade80', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}
              >
                📥 1-Tap JSON Export
              </button>
              <button
                type="button"
                onClick={() => handleExportData(true)}
                style={{ padding: '0.45rem 0.9rem', borderRadius: 8, border: '1px solid rgba(56,189,248,0.45)', background: 'rgba(56,189,248,0.14)', color: '#38bdf8', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}
              >
                🔒 AES-256 Encrypted Export
              </button>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                Remind every
                <input
                  type="number"
                  min={1}
                  max={365}
                  aria-label="Backup reminder interval in days"
                  value={backupReminderDays}
                  onChange={e => {
                    const n = setBackupReminderDays(e.target.value);
                    setBackupReminderDaysState(n);
                    window.dispatchEvent(new CustomEvent('vm:backup-reminder-changed'));
                  }}
                  style={{ width: 60, padding: '0.35rem 0.45rem', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(0,0,0,0.25)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                />
                days
              </label>
            </div>
          </motion.div>

          <SettingsRow icon={Upload} label="Import Backup" description="Restore data from a plain JSON or AES-256 encrypted .vault.json backup file" color="#60a5fa">
            <button onClick={() => document.getElementById('import-backup-input').click()} style={{ padding: '0.4rem 1rem', borderRadius: 8, border: '1px solid rgba(96,165,250,0.4)', background: 'rgba(96,165,250,0.12)', color: '#60a5fa', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>Import</button>
            <input type="file" id="import-backup-input" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
          </SettingsRow>

          {/* DATABASE INTEGRITY DIAGNOSTIC */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.25rem', marginBottom: '0.5rem', marginTop: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: diagnosticResult ? '1rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShieldCheck size={18} style={{ color: '#38bdf8' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Database Integrity Scanner</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Inter, sans-serif' }}>
                    Detect duplicate records, broken accounts & orphaned transactions
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={runDiagnostic}
                disabled={diagnosticLoading}
                style={{
                  padding: '0.45rem 1rem',
                  borderRadius: 8,
                  border: '1px solid rgba(56,189,248,0.3)',
                  background: 'rgba(56,189,248,0.12)',
                  color: '#38bdf8',
                  cursor: diagnosticLoading ? 'wait' : 'pointer',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {diagnosticLoading ? 'Scanning...' : '🩺 Run Scan'}
              </button>
            </div>

            {/* Diagnostic Scan Report Card */}
            {diagnosticResult && (
              <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.06)', padding: '1rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '1rem' }}>{diagnosticResult.integrityScore === 100 ? '✅' : '⚠️'}</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '0.95rem', color: diagnosticResult.integrityScore === 100 ? '#4ade80' : '#fbbf24' }}>
                      {diagnosticResult.integrityScore}% Health Score
                    </span>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    Scanned {diagnosticResult.totalScanned} items at {diagnosticResult.scannedAt}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Duplicates: </span>
                    <strong style={{ color: diagnosticResult.duplicates.length > 0 ? '#f87171' : '#4ade80' }}>
                      {diagnosticResult.duplicates.length}
                    </strong>
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Orphaned: </span>
                    <strong style={{ color: diagnosticResult.orphaned.length > 0 ? '#fbbf24' : '#4ade80' }}>
                      {diagnosticResult.orphaned.length}
                    </strong>
                  </div>
                  <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: 6, fontSize: '0.75rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Budget Errors: </span>
                    <strong style={{ color: diagnosticResult.invalidBudgets.length > 0 ? '#f87171' : '#4ade80' }}>
                      {diagnosticResult.invalidBudgets.length}
                    </strong>
                  </div>
                </div>

                {diagnosticResult.duplicates.length > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={autoRepairDatabase}
                      style={{
                        padding: '0.4rem 0.85rem',
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #4ade80, #22c55e)',
                        border: 'none',
                        color: 'var(--bg-void)',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.35rem'
                      }}
                    >
                      <Wrench size={13} /> Auto-Repair Anomalies
                    </button>
                  </div>
                )}
              </div>
            )}
          </motion.div>

          {/* DATA STATISTICS */}
          </div></details>
          <details className="quiet-section settings-disclosure"><summary>Data statistics</summary><div className="quiet-section-content">
          {dataStats && (
            <motion.div initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
              style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(130px, 1fr))', gap:'0.625rem', marginBottom:'1.5rem' }}>
              {[
                { label:'Transactions', val:dataStats.transactions, color:'#4ade80' },
                { label:'Accounts', val:dataStats.accounts, color:'#00f5ff' },
                { label:'Goals', val:dataStats.goals, color:'#a855f7' },
                { label:'Budgets', val:dataStats.budgets, color:'#fbbf24' },
                { label:'Loans', val:dataStats.loans, color:'#f87171' },
                { label:'Bills', val:dataStats.bills, color:'#818cf8' },
                { label:'Investments', val:dataStats.investments, color:'#2dd4bf' },
                { label:'Data Since', val: dataStats.oldestTx ? dataStats.oldestTx.substring(0,7) : '—', color:'#888', isText:true },
              ].map(s => (
                <div key={s.label} style={{ padding:'0.75rem', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, textAlign:'center' }}>
                  <div style={{ fontFamily:'Inter, sans-serif', fontWeight:700, fontSize: s.isText ? '0.95rem' : '1.4rem', color:s.color, marginBottom:'0.2rem' }}>{s.val}</div>
                  <div style={{ fontFamily:'Inter, sans-serif', fontSize:'0.65rem', color:'var(--text-muted)', letterSpacing:'1px' }}>{s.label.toUpperCase()}</div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ABOUT */}
          </div></details>
          <SectionHeader label="ABOUT" />
          <SettingsRow icon={Info} label="VaultManager" description="Personal Finance Intelligence Platform · v2.1" color="#06b6d4">
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '0.7rem', color: '#333' }}>v2.1</span>
          </SettingsRow>

          {/* LOGOUT */}
          <button
            onClick={handleLogout}
            className="btn btn-danger"
            style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content' }}
          >
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      </div>

      <Modal isOpen={showImportConfirm} onClose={() => setShowImportConfirm(false)} title="Backup restore preview">
        {importPreview?.error ? <p role="alert">{importPreview.error}. No records were written.</p> : <>
          <p>Existing records stay in place. Completed records from this exact backup are skipped. A different export creates a separate copy.</p>
          {importPreview?.usesLegacy && <p>Resuming an import created by an earlier app version.</p>}
          <table style={{width:'100%'}}><thead><tr><th>Collection</th><th>Total</th><th>Already imported</th><th>To import</th></tr></thead><tbody>
            {importPreview?.counts.map(row => <tr key={row.section}><td>{row.section}</td><td>{row.total}</td><td>{row.completed}</td><td>{row.total-row.completed}</td></tr>)}
          </tbody></table>
          <p role="status">{importPreview?.conflicts || 0} incomplete linked groups. References validated before writing.</p>
          {!!importPreview?.conflicts && <p role="alert">Restore is blocked because part of a linked group is missing. Review the existing import.</p>}
        </>}
        <div style={{display:'flex',gap:12,marginTop:20}}><button className="btn btn-secondary" onClick={() => setShowImportConfirm(false)}>Cancel</button><button className="btn btn-primary" disabled={!importData || !!importPreview?.error || !!importPreview?.conflicts} onClick={executeImport}>Import backup</button></div>
      </Modal>

      
      {/* Category Setup Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
            onClick={e => e.target === e.currentTarget && setShowCategoryModal(false)}
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '1.75rem', width: '100%', maxWidth: 380, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
            >
              <h3 style={{ fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)', marginBottom: '1.5rem', textAlign: 'center' }}>
                {editingCategory !== null ? 'Edit Category' : 'New Category'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Emoji</label>
                  <input type="text" value={catForm.emoji} onChange={e=>setCatForm({...catForm, emoji: e.target.value})} style={{ width:'100%', padding:'0.6rem', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff' }} maxLength={2} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Name</label>
                  <input type="text" value={catForm.name} onChange={e=>setCatForm({...catForm, name: e.target.value})} style={{ width:'100%', padding:'0.6rem', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff' }} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Color</label>
                  <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setCatForm({...catForm, color: c})}
                        style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: catForm.color === c ? '3px solid #fff' : 'none', cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:'0.75rem', justifyContent:'flex-end' }}>
                <button onClick={() => setShowCategoryModal(false)} style={{ flex: 1, minHeight: 42, padding:'0.65rem 1rem', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'var(--text-primary)', borderRadius:10, cursor:'pointer', fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>Cancel</button>
                <button onClick={handleSaveCategory} style={{ flex: 1, minHeight: 42, padding:'0.65rem 1rem', background:'linear-gradient(135deg, #4ade80, #22c55e)', border:'none', color:'var(--bg-void)', borderRadius:10, cursor:'pointer', fontWeight:700, fontFamily: 'Inter, sans-serif' }}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN Setup Modal */}
      <AnimatePresence>
        {showPinSetup && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}
            onClick={e => e.target === e.currentTarget && setShowPinSetup(false)}
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              style={{ background: 'var(--bg-surface)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: '2rem 1.5rem', width: '100%', maxWidth: 360, textAlign: 'center', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(167,139,250,0.2),rgba(129,140,248,0.2))', border: '1px solid rgba(167,139,250,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem' }}>
                <Key size={24} style={{ color: '#a78bfa' }} />
              </div>
              <h3 style={{ fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                {pinStep === 'enter' ? 'Create PIN' : 'Confirm PIN'}
              </h3>
              <p style={{ color: '#555', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif', marginBottom: '2rem' }}>
                {pinStep === 'enter' ? 'Enter a 4-digit PIN' : 'Re-enter to confirm'}
              </p>

              {/* PIN dots */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '2rem' }}>
                {[0,1,2,3].map(i => (
                  <motion.div key={i}
                    animate={{ scale: i < pinInput.length ? 1.15 : 1 }}
                    style={{ width: 16, height: 16, borderRadius: '50%', background: i < pinInput.length ? '#a78bfa' : 'rgba(255,255,255,0.1)', border: '2px solid', borderColor: i < pinInput.length ? '#a78bfa' : 'rgba(255,255,255,0.15)', boxShadow: i < pinInput.length ? '0 0 10px rgba(167,139,250,0.6)' : 'none', transition: 'all 0.15s' }}
                  />
                ))}
              </div>

              {pinError && <p style={{ color: '#f87171', fontSize: '0.8rem', marginBottom: '1rem' }}>{pinError}</p>}

              {/* Keypad */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {DIGITS.map((d, i) => (
                  <button key={i} onClick={() => d === '⌫' ? handlePinDelete() : d ? handlePinDigit(d) : null}
                    style={{ height: 60, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: d ? 'rgba(255,255,255,0.04)' : 'transparent', color: d === '⌫' ? '#f87171' : '#f0f0f5', fontSize: '1.2rem', fontFamily: 'Inter, sans-serif', cursor: d ? 'pointer' : 'default', transition: 'all 0.1s' }}
                    onMouseDown={e => e.currentTarget.style.background = 'rgba(167,139,250,0.15)'}
                    onMouseUp={e => e.currentTarget.style.background = d ? 'rgba(255,255,255,0.04)' : 'transparent'}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <button onClick={() => setShowPinSetup(false)} style={{ marginTop: '1.5rem', background: 'none', border: 'none', color: '#444', cursor: 'pointer', fontSize: '0.85rem' }}>Cancel</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageWrapper>
  );
};

export default Settings;