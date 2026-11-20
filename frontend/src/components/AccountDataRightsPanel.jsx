import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/firebase';
import { fetchAccounts, fetchTransactions } from '../utils/api';
import { auditLedger } from '../utils/ledgerReporting';
import { exportAllUserData, deleteAccountAndData } from '../utils/accountService';
import { formatCurrency } from '../utils/format';
import { ShieldCheck, Download, Trash2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

const AccountDataRightsPanel = () => {
  const navigate = useNavigate();
  const [auditReport, setAuditReport] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteProgress, setDeleteProgress] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleRunLedgerAudit = async () => {
    setAuditing(true);
    try {
      const [accounts, transactions] = await Promise.all([fetchAccounts(), fetchTransactions()]);
      const res = auditLedger(accounts, transactions);
      setAuditReport(res);
      if (res.driftedCount === 0) {
        toast.success('All accounts with opening balances match the transaction ledger!');
      } else {
        toast(`${res.driftedCount} account(s) have a balance difference vs opening balance`, { icon: '⚖️' });
      }
    } catch (err) {
      toast.error(err?.message || 'Could not audit ledger');
    } finally {
      setAuditing(false);
    }
  };

  const handleFullExport = async () => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    setExporting(true);
    try {
      const data = await exportAllUserData(uid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vaultmanager-complete-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Complete account data exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handlePermanentDelete = async (e) => {
    e.preventDefault();
    if (deleteText.trim() !== 'DELETE') {
      toast.error('Type DELETE in uppercase to confirm');
      return;
    }
    setDeleting(true);
    try {
      await deleteAccountAndData({
        password: deletePassword,
        onProgress: (msg) => setDeleteProgress(msg),
      });
      toast.success('Your account and all cloud data have been permanently deleted');
      navigate('/');
    } catch (err) {
      toast.error(err?.message || 'Account deletion failed');
      setDeleting(false);
      setDeleteProgress('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.5rem' }}>
      {/* Cents-Safe Ledger Drift Checker */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.05)',
          padding: '1.1rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ShieldCheck size={18} style={{ color: 'var(--mm-success)' }} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                Ledger Balance Verification (Integer-Cents Audit)
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--mm-text-3)' }}>
                Verify every account’s current balance against opening balance + sum of all transactions
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRunLedgerAudit}
            disabled={auditing}
            style={{
              padding: '0.45rem 1rem',
              borderRadius: 8,
              border: '1px solid rgba(74,222,128,0.35)',
              background: 'rgba(74,222,128,0.12)',
              color: 'var(--mm-success)',
              cursor: auditing ? 'wait' : 'pointer',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            {auditing ? 'Verifying…' : '⚖️ Verify Balances'}
          </button>
        </div>

        {auditReport && (
          <div style={{ marginTop: '0.85rem', padding: '0.85rem', borderRadius: 10, background: 'rgba(0,0,0,0.28)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {auditReport.accounts.map((row) => (
                <div
                  key={row.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                    padding: '0.45rem 0.65rem',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.02)',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {row.name} <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>({row.currency})</span>
                  </span>
                  {row.known ? (
                    row.drifted ? (
                      <span style={{ color: 'var(--mm-warning)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <AlertTriangle size={13} /> Diff: {row.difference > 0 ? '+' : ''}{formatCurrency(row.difference, { currency: row.currency })} (Expected {formatCurrency(row.expected, { currency: row.currency })})
                      </span>
                    ) : (
                      <span style={{ color: 'var(--mm-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <CheckCircle2 size={13} /> Exact match ({formatCurrency(row.balance, { currency: row.currency })})
                      </span>
                    )
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                      Net ledger movement: {row.delta >= 0 ? '+' : ''}{formatCurrency(row.delta, { currency: row.currency })} (Set opening balance on Accounts page to lock baseline)
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Data Rights & Privacy Policy */}
      <div
        style={{
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.05)',
          padding: '1.1rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
            Privacy Policy & Full Data Portability
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--mm-text-3)' }}>
            Download all cloud records or review how your financial data is protected
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => navigate('/privacy')}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              border: '1px solid rgba(129,140,248,0.35)',
              background: 'rgba(129,140,248,0.12)',
              color: '#818cf8',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <FileText size={14} /> Privacy Policy
          </button>
          <button
            type="button"
            onClick={handleFullExport}
            disabled={exporting}
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 8,
              border: '1px solid rgba(56,189,248,0.35)',
              background: 'rgba(56,189,248,0.12)',
              color: '#38bdf8',
              cursor: exporting ? 'wait' : 'pointer',
              fontSize: '0.8rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <Download size={14} /> {exporting ? 'Exporting…' : 'Download All My Data'}
          </button>
        </div>
      </div>

      {/* Danger Zone: Delete Account & Data */}
      <div
        style={{
          background: 'rgba(248, 113, 113, 0.04)',
          borderRadius: 12,
          border: '1px solid rgba(248, 113, 113, 0.22)',
          padding: '1.1rem 1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--mm-danger)' }}>
              Delete My Account & Cloud Data
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Permanently erase all accounts, transactions, budgets, loans, goals, and your login credentials
            </div>
          </div>
          {!showDeleteConfirm && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                padding: '0.45rem 0.95rem',
                borderRadius: 8,
                border: '1px solid rgba(248,113,113,0.45)',
                background: 'rgba(248,113,113,0.14)',
                color: 'var(--mm-danger)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <Trash2 size={14} /> Delete Account…
            </button>
          )}
        </div>

        {showDeleteConfirm && (
          <form onSubmit={handlePermanentDelete} style={{ marginTop: '0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ fontSize: '0.78rem', color: '#fca5a5' }}>
              This action is irreversible. Enter your password and type <strong>DELETE</strong> below to permanently erase your vault:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Current password"
                required
                style={{
                  flex: '1 1 180px',
                  padding: '0.45rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(248,113,113,0.35)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              />
              <input
                type="text"
                value={deleteText}
                onChange={(e) => setDeleteText(e.target.value)}
                placeholder="Type DELETE"
                required
                style={{
                  width: 140,
                  padding: '0.45rem 0.75rem',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.35)',
                  border: '1px solid rgba(248,113,113,0.35)',
                  color: 'var(--text-primary)',
                  fontSize: '0.82rem',
                }}
              />
              <button
                type="submit"
                disabled={deleting || deleteText.trim() !== 'DELETE'}
                style={{
                  padding: '0.45rem 0.95rem',
                  borderRadius: 8,
                  border: 'none',
                  background: 'var(--mm-danger)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: deleting ? 'wait' : 'pointer',
                }}
              >
                {deleting ? (deleteProgress || 'Deleting…') : 'Permanently Delete'}
              </button>
              <button
                type="button"
                onClick={() => { setShowDeleteConfirm(false); setDeleteText(''); setDeletePassword(''); }}
                className="btn btn-secondary"
                style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem' }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default AccountDataRightsPanel;
