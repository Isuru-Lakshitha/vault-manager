import React, { useState, useEffect } from 'react';
import 'framer-motion';
import { ShieldCheck, Lock, Download, Trash2 } from 'lucide-react';
import Modal from './Modal';
import { getAuditLogs, clearAuditLogs, exportAuditLogsCSV, logAuditEvent } from '../utils/auditLogger';
import toast from 'react-hot-toast';

export default function SecurityAuditModal({ isOpen, onClose }) {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('All');

  const refresh = () => {
    setLogs(getAuditLogs());
  };

  useEffect(() => {
    if (isOpen) {
      refresh();
      // Auto-log modal inspection event
      logAuditEvent({
        action: 'SECURITY_AUDIT_VIEWED',
        category: 'Security',
        details: 'User inspected security audit timeline',
        severity: 'info'
      });
      refresh();
    }
  }, [isOpen]);

  const handleExport = async () => {
    try {
      const ok = await exportAuditLogsCSV();
      if (ok) toast.success('Audit log CSV exported!');
      else toast.error('No logs to export');
    } catch (err) { toast.error(err?.message || 'Export failed'); }
  };

  const handleClear = () => {
    if (window.confirm('Clear all security audit logs? This cannot be undone.')) {
      clearAuditLogs();
      setLogs([]);
      toast.success('Audit logs cleared');
    }
  };

  const filteredLogs = logs.filter(l => {
    if (filter === 'All') return true;
    if (filter === 'Security') return l.category === 'Security' || l.action.includes('PIN') || l.action.includes('AUTH');
    if (filter === 'Data') return l.category === 'Data' || l.action.includes('BACKUP') || l.action.includes('RULES');
    return l.category === filter;
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="🛡️ Security Audit Trail & Access Logs" maxWidth="820px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        
        {/* Security Posture Status */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '0.75rem',
          padding: '1rem',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.06)'
        }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>DEVICE ENCRYPTION</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--mm-success)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ShieldCheck size={18} color="#4ade80" /> AES-256 / SHA
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>Zero-knowledge local store</div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>AUTO LOCK SESSION</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#818cf8', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Lock size={18} color="#818cf8" /> {localStorage.getItem('vm_lock_timeout') || '5'} Minutes
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>Inactivity screen protection</div>
          </div>

          <div>
            <div style={{ fontSize: '0.7rem', color: 'var(--mm-text-3)', textTransform: 'uppercase', letterSpacing: 1 }}>BIOMETRICS / WEBAUTHN</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: localStorage.getItem('vm_webauthn_cred_id') ? 'var(--mm-success)' : 'var(--mm-warning)', marginTop: 2 }}>
              {localStorage.getItem('vm_webauthn_cred_id') ? '✅ Enabled' : '⚡ PIN Protected'}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--mm-text-3)', marginTop: 2 }}>FIDO2 Hardware passkey</div>
          </div>
        </div>

        {/* Filter bar & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['All', 'Security', 'Data'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: '0.35rem 0.8rem',
                  borderRadius: 8,
                  border: 'none',
                  background: filter === f ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
                  color: filter === f ? 'var(--mm-success)' : 'var(--mm-text-3)',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {f}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleExport}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: 8,
                background: 'rgba(129,140,248,0.15)',
                border: '1px solid rgba(129,140,248,0.3)',
                color: '#818cf8',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Download size={14} /> Export CSV
            </button>
            <button
              onClick={handleClear}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.4rem 0.8rem',
                borderRadius: 8,
                background: 'rgba(248,113,113,0.1)',
                border: '1px solid rgba(248,113,113,0.25)',
                color: 'var(--mm-danger)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Trash2 size={14} /> Clear
            </button>
          </div>
        </div>

        {/* Timeline Event List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: 380, overflowY: 'auto' }}>
          {filteredLogs.map(log => {
            const isWarn = log.severity === 'warning';
            const isCrit = log.severity === 'critical';
            return (
              <div
                key={log.id}
                style={{
                  padding: '0.75rem 1rem',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${isCrit ? 'rgba(248,113,113,0.3)' : isWarn ? 'rgba(251,191,36,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: '1rem'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {log.action}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      padding: '1px 6px',
                      borderRadius: 4,
                      background: isCrit ? 'rgba(248,113,113,0.15)' : isWarn ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.12)',
                      color: isCrit ? 'var(--mm-danger)' : isWarn ? 'var(--mm-warning)' : 'var(--mm-success)',
                      fontWeight: 700
                    }}>
                      {log.category}
                    </span>
                  </div>
                  {log.details && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--mm-text-3)', marginTop: 3 }}>
                      {log.details}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--mm-text-2)' }}>
                    {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--mm-text-3)', marginTop: 2 }}>
                    {log.device}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredLogs.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--mm-text-3)', fontSize: '0.82rem' }}>
              No audit events recorded yet. Mutations, exports, and session activity will appear here.
            </div>
          )}
        </div>

      </div>
    </Modal>
  );
}
