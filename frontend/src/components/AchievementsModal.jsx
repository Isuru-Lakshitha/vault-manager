import React from 'react';
import { motion } from 'framer-motion';
import { X, CheckCircle2, Lock } from 'lucide-react';
import { haptic } from '../utils/format';

export default function AchievementsModal({ isOpen, onClose, achievementData }) {
  if (!isOpen || !achievementData) return null;

  const { badges, unlockedCount, totalBadges, totalXp, currentRank, nextRank, rankProgress } = achievementData;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 16 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #20223d 0%, #15162b 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 24,
          padding: '1.75rem',
          width: '100%',
          maxWidth: 620,
          maxHeight: '90dvh',
          overflowY: 'auto',
          boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 50px rgba(251, 191, 36, 0.1)',
          position: 'relative'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.25), rgba(245, 158, 11, 0.25))',
                border: '1px solid rgba(251, 191, 36, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem'
              }}
            >
              🏆
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)' }}>
                Financial Achievements
              </h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {unlockedCount} of {totalBadges} Trophies Unlocked · Gamified FinTech Habits
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: 8,
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Level & Rank Hero Banner */}
        <div
          style={{
            background: `linear-gradient(135deg, ${currentRank.color}15, rgba(255,255,255,0.02))`,
            border: `1px solid ${currentRank.color}40`,
            borderRadius: 18,
            padding: '1.25rem 1.5rem',
            marginBottom: '1.5rem',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 4, background: `${currentRank.color}25`, color: currentRank.color, fontWeight: 700, letterSpacing: '1px' }}>
                  LEVEL {currentRank.level} · {currentRank.badge}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{totalXp} Total XP</span>
              </div>
              <h3 style={{ margin: '0.35rem 0 0', fontSize: '1.4rem', fontFamily: 'Inter, sans-serif', color: currentRank.color }}>
                {currentRank.title}
              </h3>
            </div>

            {nextRank && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>NEXT LEVEL</div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {nextRank.title} ({nextRank.minXp - totalXp} XP to go)
                </div>
              </div>
            )}
          </div>

          {/* XP Progress Bar */}
          <div style={{ marginTop: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Rank Progress</span>
              <span>{rankProgress}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 4, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${rankProgress}%` }}
                transition={{ duration: 1, ease: 'easeOut' }}
                style={{
                  height: '100%',
                  background: `linear-gradient(90deg, ${currentRank.color}, #fbbf24)`,
                  borderRadius: 4
                }}
              />
            </div>
          </div>
        </div>

        {/* Badges Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '0.875rem' }}>
          {badges.map((b) => (
            <motion.div
              key={b.id}
              whileHover={{ scale: 1.02, y: -2 }}
              onClick={() => haptic()}
              style={{
                borderRadius: 14,
                padding: '1rem',
                background: b.unlocked ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.25)',
                border: b.unlocked ? '1px solid rgba(251, 191, 36, 0.35)' : '1px solid rgba(255,255,255,0.05)',
                boxShadow: b.unlocked ? '0 4px 16px rgba(251, 191, 36, 0.08)' : 'none',
                opacity: b.unlocked ? 1 : 0.6,
                display: 'flex',
                gap: '0.875rem',
                alignItems: 'flex-start',
                cursor: 'pointer',
                transition: 'all 0.18s ease'
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: b.unlocked ? 'rgba(251, 191, 36, 0.15)' : 'rgba(255,255,255,0.04)',
                  border: b.unlocked ? '1px solid rgba(251, 191, 36, 0.3)' : '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  flexShrink: 0,
                  filter: b.unlocked ? 'none' : 'grayscale(100%)'
                }}
              >
                {b.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <h4 style={{ margin: 0, fontSize: '0.88rem', fontFamily: 'Inter, sans-serif', color: b.unlocked ? '#f0f0f5' : '#888' }}>
                    {b.title}
                  </h4>
                  <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 4, background: b.unlocked ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.05)', color: b.unlocked ? '#4ade80' : '#666', fontWeight: 600 }}>
                    +{b.xp} XP
                  </span>
                </div>

                <p style={{ margin: '0 0 0.5rem', fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                  {b.description}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.68rem', fontWeight: 600, color: b.unlocked ? '#fbbf24' : '#666' }}>
                  {b.unlocked ? (
                    <>
                      <CheckCircle2 size={12} color="#fbbf24" />
                      <span>Unlocked</span>
                    </>
                  ) : (
                    <>
                      <Lock size={12} color="#666" />
                      <span>In Progress</span>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
