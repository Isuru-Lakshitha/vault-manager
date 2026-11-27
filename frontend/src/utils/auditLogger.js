import { todayYMD } from './dates';
import { saveFile } from './saveFile.js';
/**
 * Enterprise Audit Logger & Activity Tracker
 * Logs critical mutations, session access, and data exports.
 */

const STORAGE_KEY = 'vm_audit_log';
const MAX_LOGS = 200;

export function getAuditLogs() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

export function logAuditEvent({ action, category = 'General', details = '', severity = 'info' }) {
  try {
    const logs = getAuditLogs();
    const entry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      category,
      details,
      severity,
      device: getDeviceSummary(),
    };

    const updated = [entry, ...logs].slice(0, MAX_LOGS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('vm:audit-logged', { detail: entry }));
    return entry;
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
}

export function clearAuditLogs() {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event('vm:audit-cleared'));
}

export function exportAuditLogsCSV() {
  const logs = getAuditLogs();
  if (logs.length === 0) return false;

  const headers = ['Timestamp', 'Action', 'Category', 'Details', 'Severity', 'Device'];
  const rows = logs.map(l => [
    `"${l.timestamp}"`,
    `"${l.action.replace(/"/g, '""')}"`,
    `"${l.category.replace(/"/g, '""')}"`,
    `"${(l.details || '').replace(/"/g, '""')}"`,
    `"${l.severity}"`,
    `"${(l.device || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  return saveFile(new Blob([csvContent], { type: 'text/csv;charset=utf-8' }), `Security_Audit_Log_${todayYMD()}.csv`).then(() => true);
}

function getDeviceSummary() {
  const ua = navigator.userAgent;
  let browser = 'Browser';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edge')) browser = 'Edge';

  const isMobile = /Mobi|Android|iPhone/i.test(ua);
  return `${isMobile ? 'Mobile' : 'Desktop'} • ${browser}`;
}
