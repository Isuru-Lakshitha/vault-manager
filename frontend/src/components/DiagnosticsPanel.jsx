import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Bug, Copy, Trash2, MessageSquareWarning, RefreshCw } from 'lucide-react';
import { Button, EmptyState } from './ui';
import { useT } from '../i18n';
import { fetchMyErrorLogs, clearMyErrorLogs, buildDiagnosticsReport, problemReportUrl } from '../utils/errorLogger';

const APP_VERSION = import.meta.env.VITE_BUILD_STAMP || 'dev';
const when = (ts) => {
  const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : null);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString() : '—';
};

/*
 * Settings → Diagnostics. Shows the errors this app logged for you (stored
 * privately in your account), lets you copy a support report or clear them,
 * and opens a pre-filled problem report on GitHub (you review it first).
 */
export default function DiagnosticsPanel() {
  const t = useT();
  const [logs, setLogs] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLogs(null);
    fetchMyErrorLogs().then(setLogs).catch(() => setLogs([]));
  };
  useEffect(load, []);

  const report = () => buildDiagnosticsReport(logs || [], { appVersion: APP_VERSION, userAgent: navigator.userAgent, page: location.pathname });

  const copy = async () => {
    try { await navigator.clipboard.writeText(report()); toast.success('Report copied'); }
    catch { toast.error('Could not copy. Select the text and copy it manually.'); }
  };
  const clear = async () => {
    setBusy(true);
    try { const n = await clearMyErrorLogs((logs || []).map((l) => l.id)); toast.success(`Cleared ${n} log${n === 1 ? '' : 's'}`); setLogs([]); }
    catch { toast.error('Could not clear logs'); }
    finally { setBusy(false); }
  };

  return (
    <div className="diag">
      <div className="diag-actions">
        <Button size="sm" icon={MessageSquareWarning} variant="primary" onClick={() => window.open(problemReportUrl(report()), '_blank', 'noopener')}>
          {t('diag.report')}
        </Button>
        <Button size="sm" icon={Copy} onClick={copy}>{t('diag.copy')}</Button>
        <Button size="sm" icon={RefreshCw} variant="ghost" onClick={load}>{t('diag.refresh')}</Button>
        {logs?.length > 0 && <Button size="sm" icon={Trash2} variant="ghost" loading={busy} onClick={clear}>{t('diag.clear')}</Button>}
      </div>
      <p className="diag-note">{t('diag.note', { version: APP_VERSION })}</p>
      {logs === null ? (
        <p className="diag-note">Loading…</p>
      ) : logs.length === 0 ? (
        <EmptyState icon={Bug} title={t('diag.none')}>{t('diag.noneBody')}</EmptyState>
      ) : (
        <ol className="diag-list">
          {logs.map((l) => (
            <li key={l.id}>
              <span className={`ui-badge diag-level`} data-tone={l.level === 'warn' ? 'warn' : 'neg'}>{l.level || 'error'}</span>
              <div>
                <strong>{String(l.message || 'Unknown error').slice(0, 200)}</strong>
                <small>{when(l.ts)}{l.context ? ` · ${String(l.context).slice(0, 80)}` : ''}</small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
