import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Database, Download, Trash2, ArrowLeft } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';

const Privacy = () => {
  const navigate = useNavigate();

  const sections = [
    {
      icon: Database,
      color: '#4ade80',
      title: '1. Data Ownership & Cloud Isolation',
      body: 'Every account, transaction, budget, loan, goal, bill, investment, and preference you create is partitioned under your unique Firebase Authentication UID. Strict Firestore Security Rules enforce that only your authenticated session can read or modify your financial records, and every account balance change is verified against a linked ledger entry.',
    },
    {
      icon: Lock,
      color: '#818cf8',
      title: '2. Zero Third-Party Selling or Ad Tracking',
      body: 'Money Manager does not sell, rent, or share your financial data with advertisers, data brokers, or third-party analytics networks. Optional local backups can be encrypted on your device using PBKDF2 (600,000 iterations) + AES-256-GCM before saving.',
    },
    {
      icon: ShieldCheck,
      color: '#38bdf8',
      title: '3. Self-Hosted Error Telemetry & Local Storage',
      body: 'To help diagnose unexpected application crashes without third-party trackers, error logs (message, stack trace, route, and browser version) are written only to your own private `users/{uid}/error_logs` subcollection (rate-limited and append-only). Device localStorage is used strictly for offline drafts, theme preferences, PIN lock state, and session inactivity timers.',
    },
    {
      icon: Download,
      color: '#fbbf24',
      title: '4. Your Right to Export Your Data',
      body: 'You can export your complete financial ledger at any time from Settings → Backup & Data Management as a portable JSON bundle or an AES-256 encrypted archive.',
    },
    {
      icon: Trash2,
      color: '#f87171',
      title: '5. Your Right to Permanent Account Deletion',
      body: 'You can permanently delete your account and all associated cloud documents at any time from Settings → Account & Data Rights ("Delete My Account & Data"). This action erases your Firestore collections, subcollections, preferences, and authentication credentials.',
    },
  ];

  return (
    <PageWrapper>
      {/* Leave room for the phone's status bar (Android app, iOS home-screen app). */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: 'calc(1.5rem + env(safe-area-inset-top, 0px)) 1rem 4rem' }}>
        <button
          type="button"
          onClick={() => navigate(-1)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            padding: '0.45rem 0.9rem',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '0.82rem',
            marginBottom: '1.25rem',
          }}
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div
          style={{
            padding: '1.75rem',
            borderRadius: 18,
            background: 'var(--bg-surface, rgba(15, 23, 42, 0.85))',
            border: '1px solid var(--border-glass, rgba(255,255,255,0.08))',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '0.75rem' }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: 'rgba(74, 222, 128, 0.14)',
                border: '1px solid rgba(74, 222, 128, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ShieldCheck size={24} color="#4ade80" />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                Privacy Policy & Data Rights
              </h1>
              <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Last updated: November 15, 2026 · Hosted on Google Firebase
              </div>
            </div>
          </div>
          <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            VaultManager (Money Manager) is built on a privacy-first architecture. Your financial records belong exclusively to you.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          {sections.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.title}
                style={{
                  padding: '1.25rem 1.4rem',
                  borderRadius: 14,
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '0.45rem' }}>
                  <Icon size={18} color={sec.color} />
                  <h2 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {sec.title}
                  </h2>
                </div>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {sec.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </PageWrapper>
  );
};

export default Privacy;
