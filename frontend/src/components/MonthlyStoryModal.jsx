import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Play, Pause, ChevronLeft, ChevronRight, Share2, Shield } from 'lucide-react';
import { formatCurrency, haptic } from '../utils/format';
import { todayYMD } from '../utils/dates';
import getCategoryEmoji from '../utils/categoryEmoji';
import toast from 'react-hot-toast';

const SLIDE_DURATION = 5500; // 5.5 seconds per slide

export default function MonthlyStoryModal({ isOpen, onClose, analyticsData, transactions = [] }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef(null);
  useRef(Date.now());

  const currentMonthKey = useMemo(() => todayYMD().slice(0, 7), []);
  const monthName = useMemo(() => {
    return new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, []);

  // Compute story statistics
  const storyStats = useMemo(() => {
    if (!analyticsData) return null;

    // Filter active, non-reversed transactions to current month
    const monthTxns = (analyticsData.allTransactions || transactions || []).filter(
      t => !t.reversed_at && !t.reversal_of && !t.is_transfer_fee && t.date && t.date.startsWith(currentMonthKey)
    );

    const isOutflow = t => t.type === 'Expense' || t.type === 'Loan Payment';
    const totalIncome = monthTxns.filter(t => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpense = monthTxns.filter(isOutflow).reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const netSavings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? Math.round((netSavings / totalIncome) * 100) : 0;

    // Top categories (expanding split transactions)
    const catMap = {};
    monthTxns.filter(isOutflow).forEach(t => {
      if (Array.isArray(t.splits) && t.splits.length > 0) {
        t.splits.forEach(sp => {
          const cat = sp.category || t.category || 'Other';
          catMap[cat] = (catMap[cat] || 0) + (Number(sp.amount) || 0);
        });
      } else {
        const cat = t.category || 'Other';
        catMap[cat] = (catMap[cat] || 0) + (Number(t.amount) || 0);
      }
    });
    const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCats[0] ? { name: sortedCats[0][0], total: sortedCats[0][1] } : { name: 'None', total: 0 };
    const topCatPct = totalExpense > 0 ? Math.round((topCategory.total / totalExpense) * 100) : 0;

    // Top 3 individual transactions
    const topSingleTxns = [...monthTxns.filter(isOutflow)]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, 3);

    // Zero-spend zen days
    const dayOfMonth = new Date().getDate();
    const activeDaysSet = new Set(
      monthTxns.filter(isOutflow).map(t => parseInt(t.date.split('-')[2], 10))
    );
    let zeroSpendDays = 0;
    for (let d = 1; d <= dayOfMonth; d++) {
      if (!activeDaysSet.has(d)) zeroSpendDays++;
    }

    // Daily average
    const avgDailySpend = dayOfMonth > 0 ? totalExpense / dayOfMonth : 0;

    // Persona & Badge
    let persona = {
      title: 'Wealth Navigator',
      subtitle: 'Consistent, balanced, and steering towards financial freedom.',
      emoji: '🧭',
      badge: 'Balanced Navigator',
      accent: '#38bdf8'
    };

    if (savingsRate >= 45) {
      persona = {
        title: 'Wealth Architect',
        subtitle: 'Unstoppable momentum. Saving and compounding over 45% of income.',
        emoji: '🏛️',
        badge: 'Titan Saver',
        accent: '#4ade80'
      };
    } else if (zeroSpendDays >= 8) {
      persona = {
        title: 'Zen Monk of Finance',
        subtitle: 'Remarkable mindfulness. Mastering non-essential impulses with zen discipline.',
        emoji: '🧘',
        badge: 'Zen Master',
        accent: '#a78bfa'
      };
    } else if (netSavings > 0 && topCatPct < 30) {
      persona = {
        title: 'Fortress Commander',
        subtitle: 'Diversified spending with zero single category runaway.',
        emoji: '🛡️',
        badge: 'Fortress Guard',
        accent: '#fbbf24'
      };
    } else if (totalExpense > totalIncome && totalIncome > 0) {
      persona = {
        title: 'Cashflow Explorer',
        subtitle: 'High activity month. Ready to recalibrate for a powerhouse upcoming cycle.',
        emoji: '⚡',
        badge: 'Resilient Builder',
        accent: '#f87171'
      };
    }

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      topCategory,
      topCatPct,
      topSingleTxns,
      zeroSpendDays,
      dayOfMonth,
      avgDailySpend,
      persona
    };
  }, [analyticsData, transactions, currentMonthKey]);

  const TOTAL_SLIDES = 5;

  // Progress bar auto-advance
  useEffect(() => {
    if (!isOpen || isPaused) return;

    const interval = 50;
    const step = (interval / SLIDE_DURATION) * 100;

    progressTimerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          handleNextSlide();
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(progressTimerRef.current);
  }, [isOpen, isPaused, currentSlide]);

  const handleNextSlide = () => {
    haptic();
    setProgress(0);
    setCurrentSlide((prev) => {
      if (prev < TOTAL_SLIDES - 1) return prev + 1;
      return prev; // hold on last slide
    });
  };

  const handlePrevSlide = () => {
    haptic();
    setProgress(0);
    setCurrentSlide((prev) => Math.max(0, prev - 1));
  };

  const handleShare = () => {
    haptic();
    const text = `📊 My ${monthName} Money Wrapped on Vault Manager:\n` +
      `• Net Savings: ${formatCurrency(storyStats?.netSavings || 0)} (${storyStats?.savingsRate || 0}% Saved)\n` +
      `• Top Realm: ${storyStats?.topCategory.name} (${storyStats?.topCatPct}% of spend)\n` +
      `• Zen Zero-Spend Days: ${storyStats?.zeroSpendDays} days\n` +
      `• Persona: ${storyStats?.persona.title} ${storyStats?.persona.emoji}`;

    if (navigator.share) {
      navigator.share({ title: `Money Wrapped — ${monthName}`, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Wrapped summary copied to clipboard! 📋');
    }
  };

  if (!isOpen || !storyStats) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        userSelect: 'none'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          height: 'min(760px, 92dvh)',
          borderRadius: 24,
          background: 'linear-gradient(180deg, #16182e 0%, #0d0e1c 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 50px rgba(129,140,248,0.15)',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Top Story Header: Progress Bar Segments */}
        <div style={{ padding: '0.875rem 1rem 0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', zIndex: 20 }}>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {Array.from({ length: TOTAL_SLIDES }).map((_, idx) => {
              const isFilled = idx < currentSlide;
              const isCurrent = idx === currentSlide;
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    height: 3,
                    borderRadius: 2,
                    background: 'rgba(255,255,255,0.15)',
                    overflow: 'hidden'
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: isFilled ? '100%' : isCurrent ? `${progress}%` : '0%',
                      background: 'var(--text-primary)',
                      borderRadius: 2,
                      transition: isCurrent ? 'none' : 'width 0.2s ease'
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Title & Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.85rem' }}>✨</span>
              <span style={{ fontWeight: 700, fontSize: '0.82rem', letterSpacing: '1px', color: 'var(--text-primary)' }}>
                MONEY WRAPPED · {monthName.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => setIsPaused(!isPaused)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
              >
                {isPaused ? <Play size={14} /> : <Pause size={14} />}
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Touch Navigation Halves (Invisible Left & Right tap zones) */}
        <div
          onClick={handlePrevSlide}
          style={{ position: 'absolute', top: 60, bottom: 80, left: 0, width: '35%', zIndex: 15, cursor: 'pointer' }}
        />
        <div
          onClick={handleNextSlide}
          style={{ position: 'absolute', top: 60, bottom: 80, right: 0, width: '65%', zIndex: 15, cursor: 'pointer' }}
        />

        {/* Slide Animated Container */}
        <div style={{ flex: 1, padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'center', position: 'relative', zIndex: 10 }}>
          <AnimatePresence mode="wait">
            {/* SLIDE 1: Inflow vs Outflow */}
            {currentSlide === 0 && (
              <motion.div
                key="slide-0"
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -15 }}
                transition={{ duration: 0.35 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 600, letterSpacing: '1.5px' }}>
                  CHAPTER 01 // CASH FLOW
                </div>
                <h2 style={{ fontSize: '1.75rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  Your Financial Orbit This Month
                </h2>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Here is how capital surged into and circulated through your accounts in {monthName}.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(74, 222, 128, 0.08)', border: '1px solid rgba(74, 222, 128, 0.25)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mm-success)', fontWeight: 600 }}>TOTAL INFLOW</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--mm-success)', marginTop: 2 }}>
                      +{formatCurrency(storyStats.totalIncome)}
                    </div>
                  </div>

                  <div style={{ padding: '1rem', borderRadius: 14, background: 'rgba(248, 113, 113, 0.08)', border: '1px solid rgba(248, 113, 113, 0.25)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--mm-danger)', fontWeight: 600 }}>TOTAL OUTFLOW</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--mm-danger)', marginTop: 2 }}>
                      -{formatCurrency(storyStats.totalExpense)}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.85rem 1.25rem', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Net Capital Retained</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: storyStats.netSavings >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>
                    {formatCurrency(storyStats.netSavings)}
                  </span>
                </div>
              </motion.div>
            )}

            {/* SLIDE 2: Top Category */}
            {currentSlide === 1 && (
              <motion.div
                key="slide-1"
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -15 }}
                transition={{ duration: 0.35 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div style={{ fontSize: '0.75rem', color: '#a78bfa', fontWeight: 600, letterSpacing: '1.5px' }}>
                  CHAPTER 02 // DOMINANT SPEND REALM
                </div>
                <h2 style={{ fontSize: '1.75rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  Your Biggest Spending Gravity
                </h2>

                <div
                  style={{
                    padding: '1.5rem',
                    borderRadius: 20,
                    background: 'linear-gradient(135deg, rgba(167, 139, 250, 0.15), rgba(99, 102, 241, 0.15))',
                    border: '1px solid rgba(167, 139, 250, 0.35)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ fontSize: '3rem' }}>{getCategoryEmoji(storyStats.topCategory.name)}</div>
                  <h3 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)' }}>{storyStats.topCategory.name}</h3>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#a78bfa' }}>
                    {formatCurrency(storyStats.topCategory.total)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Consumed <strong>{storyStats.topCatPct}%</strong> of total monthly outflow
                  </div>
                </div>

                {storyStats.topSingleTxns.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Top Single Transactions:</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {storyStats.topSingleTxns.map((t, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.75rem' }}>
                          <span style={{ color: 'var(--text-primary)' }}>{t.notes || t.category || 'Expense'}</span>
                          <span style={{ fontWeight: 600, color: 'var(--mm-danger)' }}>-{formatCurrency(t.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* SLIDE 3: Zen Days & Discipline */}
            {currentSlide === 2 && (
              <motion.div
                key="slide-2"
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -15 }}
                transition={{ duration: 0.35 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div style={{ fontSize: '0.75rem', color: 'var(--mm-warning)', fontWeight: 600, letterSpacing: '1.5px' }}>
                  CHAPTER 03 // DISCIPLINE & ZEN
                </div>
                <h2 style={{ fontSize: '1.75rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  The Art of Zero-Spend Zen
                </h2>

                <div
                  style={{
                    padding: '1.5rem',
                    borderRadius: 20,
                    background: 'rgba(251, 191, 36, 0.08)',
                    border: '1px solid rgba(251, 191, 36, 0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '1rem'
                  }}
                >
                  <div style={{ fontSize: '2.5rem' }}>🧘</div>
                  <div>
                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--mm-warning)' }}>
                      {storyStats.zeroSpendDays} Days
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                      Zero money left your pocket on these days ({Math.round((storyStats.zeroSpendDays / storyStats.dayOfMonth) * 100)}% of the month)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>DAILY BURN RATE</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: 4 }}>
                      {formatCurrency(storyStats.avgDailySpend)}/d
                    </div>
                  </div>
                  <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>SAVINGS EFFICIENCY</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--mm-success)', marginTop: 4 }}>
                      {storyStats.savingsRate}%
                    </div>
                  </div>
                </div>

                <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Every zero-spend day compounds your runway and defends your long-term independence.
                </p>
              </motion.div>
            )}

            {/* SLIDE 4: Wealth Momentum */}
            {currentSlide === 3 && (
              <motion.div
                key="slide-3"
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -15 }}
                transition={{ duration: 0.35 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}
              >
                <div style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '1.5px' }}>
                  CHAPTER 04 // WEALTH MOMENTUM
                </div>
                <h2 style={{ fontSize: '1.75rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  Fortress & Growth Horizon
                </h2>

                <div
                  style={{
                    padding: '1.25rem',
                    borderRadius: 18,
                    background: 'linear-gradient(135deg, rgba(56, 189, 248, 0.12), rgba(34, 197, 94, 0.12))',
                    border: '1px solid rgba(56, 189, 248, 0.3)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Shield size={20} color="#38bdf8" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>Savings Rate Metric</span>
                  </div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--mm-success)' }}>
                    {storyStats.savingsRate}%
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {storyStats.savingsRate >= 20 ? 'Exceeding the 20% golden wealth benchmark!' : 'Keep building towards the 20% savings mark.'}
                  </div>
                </div>

                <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Total Portfolio Momentum
                  </div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatCurrency(Number(analyticsData.netWorth) || 0)}
                  </div>
                </div>
              </motion.div>
            )}

            {/* SLIDE 5: Monthly Persona & Badge */}
            {currentSlide === 4 && (
              <motion.div
                key="slide-4"
                initial={{ opacity: 0, scale: 0.92, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.05, y: -15 }}
                transition={{ duration: 0.35 }}
                style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', alignItems: 'center', textAlign: 'center' }}
              >
                <div style={{ fontSize: '0.75rem', color: storyStats.persona.accent, fontWeight: 600, letterSpacing: '1.5px' }}>
                  FINAL CHAPTER // YOUR FINTECH PERSONA
                </div>

                {/* Holographic Badge Card */}
                <div
                  style={{
                    width: '100%',
                    padding: '2rem 1.5rem',
                    borderRadius: 24,
                    background: `linear-gradient(145deg, ${storyStats.persona.accent}15, rgba(13, 14, 28, 0.95))`,
                    border: `1px solid ${storyStats.persona.accent}50`,
                    boxShadow: `0 16px 40px ${storyStats.persona.accent}20`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ fontSize: '3.8rem' }}>{storyStats.persona.emoji}</div>
                  <span style={{ fontSize: '0.75rem', padding: '3px 10px', borderRadius: 20, background: `${storyStats.persona.accent}20`, color: storyStats.persona.accent, fontWeight: 700, letterSpacing: '1px' }}>
                    {storyStats.persona.badge}
                  </span>
                  <h2 style={{ fontSize: '1.6rem', margin: 0, color: 'var(--text-primary)' }}>
                    {storyStats.persona.title}
                  </h2>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: 280 }}>
                    {storyStats.persona.subtitle}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', width: '100%', marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleShare}
                    style={{
                      flex: 1,
                      padding: '0.75rem',
                      borderRadius: 12,
                      background: 'linear-gradient(135deg, #818cf8, #a78bfa)',
                      border: 'none',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Share2 size={16} /> Share Wrapped
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCurrentSlide(0); setProgress(0); }}
                    style={{
                      padding: '0.75rem 1.25rem',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.06)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                  >
                    Replay ↺
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Navigation Buttons */}
        <div style={{ padding: '0.75rem 1.25rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', zIndex: 20 }}>
          <button
            type="button"
            onClick={handlePrevSlide}
            disabled={currentSlide === 0}
            style={{
              background: 'transparent',
              border: 'none',
              color: currentSlide === 0 ? 'transparent' : 'var(--text-muted)',
              cursor: currentSlide === 0 ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.78rem'
            }}
          >
            <ChevronLeft size={16} /> Prev
          </button>

          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {currentSlide + 1} / {TOTAL_SLIDES}
          </span>

          <button
            type="button"
            onClick={currentSlide === TOTAL_SLIDES - 1 ? onClose : handleNextSlide}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#38bdf8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: '0.78rem',
              fontWeight: 600
            }}
          >
            {currentSlide === TOTAL_SLIDES - 1 ? 'Finish ✓' : <>Next <ChevronRight size={16} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
