import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { InsightGoals } from '../components/InsightPanels';
import useLiveData from '../utils/useLiveData';
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  contributeGoal,
  deductGoal,
  fetchAccounts,
  fetchTransactions,
  getCache
} from '../utils/api';
import { Plus, Minus, Trophy, Edit2, Trash2, Calendar, Sparkles, Search, Wallet } from 'lucide-react';
import PageWrapper from '../components/PageWrapper';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import SkeletonLoader from '../components/SkeletonLoader';
import FuturisticDropdown from '../components/FuturisticDropdown';
import GoalHistoryModal from '../components/GoalHistoryModal';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import CurrencyInput from '../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel, haptic } from '../utils/format';
import { toYMD } from '../utils/dates';

const parseLocalYMD = (str) => {
  if (!str) return null;
  const parts = String(str).split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
};

const GOAL_CATEGORIES = [
  { name: 'Emergency Fund', icon: '🛡️', color: '#4ade80' },
  { name: 'Travel & Vacation', icon: '✈️', color: '#06b6d4' },
  { name: 'Vehicle / Auto', icon: '🚗', color: '#818cf8' },
  { name: 'Home & Living', icon: '🏠', color: '#a78bfa' },
  { name: 'Tech & Gadgets', icon: '💻', color: '#38bdf8' },
  { name: 'Education & Courses', icon: '🎓', color: '#fbbf24' },
  { name: 'Life Event / Wedding', icon: '💍', color: '#f472b6' },
  { name: 'Investment & Wealth', icon: '📈', color: '#34d399' },
  { name: 'Gifts & Shopping', icon: '🎁', color: '#f87171' },
  { name: 'Savings Buffer', icon: '🐷', color: '#10b981' },
  { name: 'Other Target', icon: '🎯', color: '#94a3b8' },
];

const PRIORITY_CONFIG = {
  high: { label: 'High Priority', badge: 'HIGH', color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
  medium: { label: 'Medium Priority', badge: 'MED', color: '#fbbf24', bg: 'rgba(251,191,36,0.14)' },
  low: { label: 'Low Priority', badge: 'LOW', color: '#818cf8', bg: 'rgba(129,140,248,0.14)' },
};

const SORT_OPTIONS = [
  { value: 'deadline', label: '📅 End Goal Date (Soonest)' },
  { value: 'daily_desc', label: '⚡ Daily Needed (Highest)' },
  { value: 'current_desc', label: '💵 Have Right Now (Highest)' },
  { value: 'progress_desc', label: '📈 Progress (% High to Low)' },
  { value: 'target_desc', label: '💰 Target Amount (Highest)' },
  { value: 'name', label: '🔤 Name (A - Z)' },
];

// Canvas confetti burst
const runConfetti = (canvas) => {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const COLORS = ['#4ade80', '#06b6d4', '#a78bfa', '#fbbf24', '#f472b6', '#38bdf8', '#34d399'];
  const particles = Array.from({ length: 140 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 100,
    r: 4 + Math.random() * 5,
    d: 1.5 + Math.random() * 2.5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    tiltAngle: 0,
    tiltSpeed: 0.05 + Math.random() * 0.05,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15,
  }));
  let frame = 0;
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(p => {
      p.y += p.d;
      p.tiltAngle += p.tiltSpeed;
      const tilt = Math.sin(p.tiltAngle) * 12;
      p.rotation += p.rotSpeed;
      ctx.save();
      ctx.translate(p.x + tilt, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = p.color;
      if (p.shape === 'rect') {
        ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    frame++;
    if (frame < 200) requestAnimationFrame(animate);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  animate();
};

const calculateGoalStats = (goal) => {
  const current = parseFloat((Number(goal.current_amount) || 0).toFixed(2));
  const target = parseFloat((Number(goal.target_amount) || 0).toFixed(2));
  const remaining = Math.max(0, parseFloat((target - current).toFixed(2)));
  const progressPct = target > 0 ? (current / target) * 100 : 0;
  const isReached = target > 0 && current >= target;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetDate = parseLocalYMD(goal.target_date);
  if (targetDate) targetDate.setHours(0, 0, 0, 0);

  const daysLeft = targetDate ? Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)) : 0;
  const isPast = targetDate ? targetDate < today : false;

  // Exact daily calculation without rounding up
  const dailyNeeded = daysLeft > 0 ? parseFloat((remaining / daysLeft).toFixed(2)) : remaining;
  const monthsLeft = daysLeft > 0 ? daysLeft / 30.4375 : 0;
  const monthlyNeeded = monthsLeft > 0 ? Math.ceil(remaining / monthsLeft) : remaining;
  const plannedMonthly = parseFloat(goal.monthly_contribution) || 0;

  return {
    current,
    target,
    remaining,
    progressPct,
    isReached,
    targetDateStr: goal.target_date || 'No Date Set',
    daysLeft,
    isPast,
    dailyNeeded,
    monthlyNeeded,
    plannedMonthly,
  };
};

const Goals = () => {
  const [goals, setGoals] = useState(() => getCache('goals') || []);
  const [accounts, setAccounts] = useState(() => getCache('accounts') || []);
  const [loading, setLoading] = useState(() => !getCache('goals'));

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [currentId, setCurrentId] = useState(null);

  // Deposit Modal State
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositTargetGoal, setDepositTargetGoal] = useState(null);
  const [depositData, setDepositData] = useState({ amount: 0, account_id: '', note: '' });

  // Deduct Modal State
  const [isDeductModalOpen, setIsDeductModalOpen] = useState(false);
  const [deductTargetGoal, setDeductTargetGoal] = useState(null);
  const [deductData, setDeductData] = useState({ amount: 0, account_id: '', reason: '' });

  const [confirm, setConfirm] = useState({ open: false, id: null });

  // History Modal State
  const [selectedGoalForHistoryId, setSelectedGoalForHistoryId] = useState(null);
  const activeGoalForHistory = useMemo(
    () => goals.find(g => String(g.id) === String(selectedGoalForHistoryId)) || null,
    [goals, selectedGoalForHistoryId]
  );

  // Virtual Round-Up Simulator & What-If Boost State
  const [isRoundUpModalOpen, setIsRoundUpModalOpen] = useState(false);
  const [roundUpIncrement, setRoundUpIncrement] = useState(100);
  const [roundUpGoalId, setRoundUpGoalId] = useState('');
  const [transactionsList, setTransactionsList] = useState(() => getCache('transactions') || []);
  const [boostByGoal, setBoostByGoal] = useState({});
  const [expandedBoostGoalId, setExpandedBoostGoalId] = useState(null);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'active' | 'completed' | 'high'
  const [sortBy, setSortBy] = useState('deadline');

  const canvasRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    target_amount: 0,
    current_amount: 0,
    monthly_contribution: 0,
    target_date: '',
    category: 'Emergency Fund',
    priority: 'medium',
    icon: '🛡️',
    color: '#4ade80',
    notes: ''
  });


  useLiveData(() => loadData(true));

  const loadData = useCallback(async (silent) => {
    try {
      if (silent !== true) setLoading(true);
      const [gData, aData, tData] = await Promise.all([
        fetchGoals(),
        fetchAccounts(),
        fetchTransactions()
      ]);
      setGoals(gData || []);
      setAccounts(aData || []);
      setTransactionsList(tData || []);
      if (aData && aData.length > 0) {
        setDepositData(prev => ({ ...prev, account_id: prev.account_id || aData[0].id }));
        setDeductData(prev => ({ ...prev, account_id: prev.account_id || aData[0].id }));
      }
      if (gData && gData.length > 0) {
        setRoundUpGoalId(previous => previous || gData[0].id);
      }
    } catch {
      toast.error('Failed to load goals');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadData(!!getCache('goals')); }, [loadData]);

  const recentExpenses = useMemo(() => {
    return (transactionsList || [])
      .filter(t => t.type === 'Expense' && (parseFloat(t.amount) || 0) > 0)
      .slice(0, 35);
  }, [transactionsList]);

  const simulatedRoundUpTotal = useMemo(() => {
    return recentExpenses.reduce((sum, tx) => {
      const amt = parseFloat(tx.amount) || 0;
      const rem = amt % roundUpIncrement;
      const diff = rem > 0 ? (roundUpIncrement - rem) : 0;
      return sum + diff;
    }, 0);
  }, [recentExpenses, roundUpIncrement]);

  const handleApplyRoundUp = async () => {
    const targetGoal = goals.find(g => g.id === roundUpGoalId) || goals[0];
    if (!targetGoal) { toast.error('Please select a goal'); return; }
    if (simulatedRoundUpTotal <= 0) { toast.error('No round-up spare change calculated'); return; }

    try {
      await contributeGoal(targetGoal.id, {
        amount: simulatedRoundUpTotal,
        account_id: accounts.length > 0 ? accounts[0].id : '',
        note: `⚡ Virtual Round-Up Contribution (${recentExpenses.length} transactions)`
      });
      toast.success(`🎉 +${formatCurrency(simulatedRoundUpTotal)} spare change deposited into "${targetGoal.name}"!`, { duration: 5000 });
      runConfetti(canvasRef.current);
      haptic();
      setIsRoundUpModalOpen(false);
      loadData();
    } catch {
      toast.error('Failed to apply round-up');
    }
  };

  const openAddModal = () => {
    setEditMode(false);
    setCurrentId(null);
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    setFormData({
      name: '',
      target_amount: 0,
      current_amount: 0,
      monthly_contribution: 0,
      target_date: toYMD(d),
      category: 'Emergency Fund',
      priority: 'medium',
      icon: '🛡️',
      color: '#4ade80',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (goal) => {
    setEditMode(true);
    setCurrentId(goal.id);
    const catObj = GOAL_CATEGORIES.find(c => c.name === goal.category);
    setFormData({
      name: goal.name || '',
      target_amount: goal.target_amount || 0,
      current_amount: goal.current_amount || 0,
      monthly_contribution: goal.monthly_contribution || 0,
      target_date: goal.target_date || '',
      category: goal.category || 'Other Target',
      priority: goal.priority || 'medium',
      icon: goal.icon || (catObj ? catObj.icon : '🎯'),
      color: goal.color || (catObj ? catObj.color : '#4ade80'),
      notes: goal.notes || ''
    });
    setIsModalOpen(true);
  };

  const openDepositModal = (goal, prefillAmount = 0) => {
    setDepositTargetGoal(goal);
    setDepositData({
      amount: prefillAmount,
      account_id: accounts.length > 0 ? accounts[0].id : '',
      note: ''
    });
    setIsDepositModalOpen(true);
  };

  const openDeductModal = (goal, prefillAmount = 0) => {
    setDeductTargetGoal(goal);
    setDeductData({
      amount: prefillAmount,
      account_id: accounts.length > 0 ? accounts[0].id : '',
      reason: ''
    });
    setIsDeductModalOpen(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Please enter a goal name');
      return;
    }
    if (formData.target_amount <= 0) {
      toast.error('Target amount must be greater than zero');
      return;
    }

    try {
      if (editMode) {
        await updateGoal(currentId, formData);
        toast.success('Goal updated successfully!');
      } else {
        await createGoal(formData);
        toast.success('Goal created successfully!');
      }
      setIsModalOpen(false);
      haptic();
      loadData();
    } catch (err) {
      toast.error(err?.message || (editMode ? 'Failed to update goal' : 'Failed to create goal'));
    }
  };

  // Deposit handler
  const handleDepositSubmit = async (e) => {
    e.preventDefault();
    if (!depositTargetGoal) return;
    if (depositData.amount <= 0) {
      toast.error('Enter a valid deposit amount');
      return;
    }

    try {
      const oldPct = depositTargetGoal.target_amount > 0
        ? (depositTargetGoal.current_amount / depositTargetGoal.target_amount) * 100
        : 0;
      const newPct = depositTargetGoal.target_amount > 0
        ? ((depositTargetGoal.current_amount + depositData.amount) / depositTargetGoal.target_amount) * 100
        : 0;

      await contributeGoal(depositTargetGoal.id, depositData);
      toast.success(`+${formatCurrency(depositData.amount)} added to "${depositTargetGoal.name}"!`);
      setIsDepositModalOpen(false);
      haptic();
      loadData();

      // Milestone trigger check
      const milestones = [25, 50, 75, 100];
      const crossed = milestones.find(m => oldPct < m && newPct >= m);
      if (crossed) {
        const emoji = crossed === 100 ? '🏆' : '🎉';
        toast.success(`${emoji} ${crossed}% Milestone Reached for "${depositTargetGoal.name}"!`, { duration: 6000 });
        runConfetti(canvasRef.current);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to add deposit');
    }
  };

  // Deduct handler
  const handleDeductSubmit = async (e) => {
    e.preventDefault();
    if (!deductTargetGoal) return;
    if (deductData.amount <= 0) {
      toast.error('Enter a valid amount to deduct');
      return;
    }
    if (deductData.amount > deductTargetGoal.current_amount) {
      toast.error(`Cannot deduct more than current balance (${formatCurrency(deductTargetGoal.current_amount)})`);
      return;
    }

    try {
      await deductGoal(deductTargetGoal.id, deductData);
      toast.success(`−${formatCurrency(deductData.amount)} deducted from "${deductTargetGoal.name}"!`);
      setIsDeductModalOpen(false);
      haptic();
      loadData();
    } catch (err) {
      toast.error(err?.message || 'Failed to deduct funds');
    }
  };

  // Quick preset chip -> opens Deposit Modal with amount pre-filled so user can choose which account to deduct from
  const handleQuickDeposit = (goal, amount) => {
    const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
    if (numAmount <= 0) return;
    openDepositModal(goal, numAmount);
  };

  // Quick preset chip -> opens Deduct Modal with amount pre-filled so user can choose destination account
  const handleQuickDeduct = (goal, amount) => {
    const numAmount = parseFloat((Number(amount) || 0).toFixed(2));
    if (numAmount <= 0) return;
    if (numAmount > goal.current_amount) {
      toast.error(`Cannot deduct more than current balance (${formatCurrency(goal.current_amount)})`);
      return;
    }
    openDeductModal(goal, numAmount);
  };

  const doDelete = async () => {
    try {
      await deleteGoal(confirm.id);
      toast.success('Goal deleted');
      haptic();
      loadData();
    } catch (error) {
      toast.error(error.message || 'Failed to delete goal');
    } finally {
      setConfirm({ open: false, id: null });
    }
  };

  // Top Summary KPIs (Current Right Now + Target + Total Daily Calculation)
  const { totalSaved, totalTarget, totalRemaining, overallProgress, totalDailyNeeded, completedCount, activeCount, highPriorityCount } = useMemo(() => {
    let saved = 0;
    let target = 0;
    let comp = 0;
    let active = 0;
    let totalDaily = 0;
    let highPri = 0;

    goals.forEach(g => {
      const c = Number(g.current_amount) || 0;
      const t = Number(g.target_amount) || 0;
      saved += c;
      target += t;
      if (t > 0 && c >= t) {
        comp++;
      } else {
        active++;
        const stats = calculateGoalStats(g);
        if (stats.daysLeft > 0) {
          totalDaily += stats.dailyNeeded;
        }
      }
      if (g.priority === 'high') highPri++;
    });

    const prog = target > 0 ? Math.min(100, (saved / target) * 100) : 0;
    const rem = Math.max(0, target - saved);

    return {
      totalSaved: parseFloat(saved.toFixed(2)),
      totalTarget: parseFloat(target.toFixed(2)),
      totalRemaining: parseFloat(rem.toFixed(2)),
      overallProgress: Math.round(prog),
      totalDailyNeeded: parseFloat(totalDaily.toFixed(2)),
      completedCount: comp,
      activeCount: active,
      highPriorityCount: highPri
    };
  }, [goals]);

  // Filtered & Sorted Goals
  const filteredGoals = useMemo(() => {
    return goals
      .filter(goal => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchesName = (goal.name || '').toLowerCase().includes(q);
          const matchesCat = (goal.category || '').toLowerCase().includes(q);
          const matchesNotes = (goal.notes || '').toLowerCase().includes(q);
          if (!matchesName && !matchesCat && !matchesNotes) return false;
        }

        const stats = calculateGoalStats(goal);
        if (activeTab === 'active') return !stats.isReached;
        if (activeTab === 'completed') return stats.isReached;
        if (activeTab === 'high') return goal.priority === 'high';
        return true;
      })
      .sort((a, b) => {
        const statsA = calculateGoalStats(a);
        const statsB = calculateGoalStats(b);

        if (sortBy === 'deadline') {
          if (!a.target_date) return 1;
          if (!b.target_date) return -1;
          return new Date(a.target_date) - new Date(b.target_date);
        }
        if (sortBy === 'daily_desc') return statsB.dailyNeeded - statsA.dailyNeeded;
        if (sortBy === 'current_desc') return statsB.current - statsA.current;
        if (sortBy === 'progress_desc') return statsB.progressPct - statsA.progressPct;
        if (sortBy === 'target_desc') return statsB.target - statsA.target;
        if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
        return 0;
      });
  }, [goals, searchQuery, activeTab, sortBy]);

  const accountOptions = [
    { value: '', label: 'Do not link to an account' },
    ...accounts.map(acc => ({
      value: acc.id,
      label: `${acc.name} (${formatCurrency(acc.balance)})`
    }))
  ];

  const uniqueGoalNames = [...new Set(goals.map(g => g.name).filter(Boolean))];

  return (
    <PageWrapper>
      {/* Confetti canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 99999
        }}
      />

      <div style={{ maxWidth: 1240, margin: '0 auto', width: '100%' }}>
        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: '1.25rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 className="glow-text text-cyan" style={{ margin: 0, fontSize: '1.85rem', fontWeight: 800 }}>
                Goals & Targets
              </h1>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', fontSize: '0.8rem', marginTop: 4 }}>
              Track what you have right now, your end goal date, daily targets, and easily deposit or deduct funds.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-secondary"
              onClick={() => {
                setIsRoundUpModalOpen(true);
                if (goals.length > 0 && !roundUpGoalId) setRoundUpGoalId(goals[0].id);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
            >
              <Sparkles size={15} color="#4ade80" /> Round-Up Simulator
            </button>
            <button className="btn btn-primary" onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Plus size={16} /> New Goal
            </button>
          </div>
        </div>

        {/* Top Summary KPIs Strip: What You Have Right Now + End Goal + Daily Needed */}
        {!loading && goals.length > 0 && <InsightGoals goals={goals} />}
        {!loading && goals.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.5rem'
            }}
          >
            {/* Card 1: Have Right Now */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.65)',
                border: '1px solid rgba(74, 222, 128, 0.25)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '0.5px' }}>
                💵 HAVE RIGHT NOW (SAVED)
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                {formatCurrency(totalSaved)}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                {overallProgress}% of {formatCurrency(totalTarget)} target reached
              </div>
            </div>

            {/* Card 2: Daily Savings Needed */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.65)',
                border: '1px solid rgba(6, 182, 212, 0.25)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.2)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: '#06b6d4', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '0.5px' }}>
                ⚡ DAILY SAVINGS NEEDED
              </div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#06b6d4', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                {formatCurrency(totalDailyNeeded)} <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ day</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Across all active goals to reach deadlines on time
              </div>
            </div>

            {/* Card 3: Target & Remaining */}
            <div
              style={{
                background: 'rgba(37, 37, 64, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 14,
                padding: '1rem 1.1rem',
                backdropFilter: 'blur(12px)'
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: '0.5px' }}>
                🎯 TOTAL TARGET CAPITAL
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
                {formatCurrency(totalTarget)}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#fbbf24', marginTop: '0.25rem' }}>
                {formatCurrency(totalRemaining)} remaining to complete all goals
              </div>
            </div>
          </motion.div>
        )}

        {/* 1-Tap Spare-Change Round-Up Banner */}
        {!loading && goals.length > 0 && simulatedRoundUpTotal > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.12) 0%, rgba(6, 182, 212, 0.08) 50%, rgba(30, 30, 50, 0.85) 100%)',
              border: '1px solid rgba(74, 222, 128, 0.3)',
              borderRadius: 14,
              padding: '0.85rem 1.15rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              backdropFilter: 'blur(12px)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 280px' }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  background: 'rgba(74, 222, 128, 0.16)',
                  border: '1px solid rgba(74, 222, 128, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.15rem',
                  flexShrink: 0
                }}
              >
                🪙
              </div>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 800, letterSpacing: '0.5px' }}>
                  SPARE-CHANGE ROUND-UP READY
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-primary)', marginTop: 2 }}>
                  Rounding your last <strong>{recentExpenses.length}</strong> expenses to the nearest <strong>{roundUpIncrement}</strong> saves{' '}
                  <strong style={{ color: '#4ade80' }}>+{formatCurrency(simulatedRoundUpTotal)}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {[100, 500, 1000].map(inc => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => setRoundUpIncrement(inc)}
                  style={{
                    padding: '0.32rem 0.6rem',
                    borderRadius: 8,
                    fontSize: '0.72rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: roundUpIncrement === inc ? '1px solid #4ade80' : '1px solid rgba(255,255,255,0.08)',
                    background: roundUpIncrement === inc ? 'rgba(74, 222, 128, 0.18)' : 'rgba(255,255,255,0.03)',
                    color: roundUpIncrement === inc ? '#4ade80' : 'var(--text-secondary)'
                  }}
                >
                  +{inc}
                </button>
              ))}
              <button
                type="button"
                onClick={handleApplyRoundUp}
                style={{
                  padding: '0.42rem 0.85rem',
                  borderRadius: 9,
                  fontSize: '0.76rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 700,
                  cursor: 'pointer',
                  border: '1px solid rgba(74, 222, 128, 0.45)',
                  background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.25), rgba(6, 182, 212, 0.22))',
                  color: '#4ade80',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Sparkles size={13} /> 1-Tap Deposit +{formatCurrency(simulatedRoundUpTotal)}
              </button>
            </div>
          </motion.div>
        )}

        {/* Filter, Search & Sort Bar */}
        <div
          style={{
            background: 'rgba(37, 37, 64, 0.45)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 14,
            padding: '0.75rem 1rem',
            marginBottom: '1.25rem',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.75rem',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            {[
              { id: 'all', label: `All (${goals.length})` },
              { id: 'active', label: `In Progress (${activeCount})` },
              { id: 'completed', label: `Secured (${completedCount})` },
              { id: 'high', label: `High Priority (${highPriorityCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontFamily: 'Inter, sans-serif',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: activeTab === tab.id ? '1px solid rgba(74, 222, 128, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                  background: activeTab === tab.id ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255, 255, 255, 0.02)',
                  color: activeTab === tab.id ? '#4ade80' : 'var(--text-secondary)',
                  transition: 'all 0.18s'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Sort */}
          <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flex: '1 1 260px', justifyContent: 'flex-end' }}>
            <div style={{ position: 'relative', flex: '1 1 140px', maxWidth: 220 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search goals..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.38rem 0.6rem 0.38rem 2rem',
                  fontSize: '0.8rem',
                  borderRadius: 10,
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  background: 'rgba(0,0,0,0.25)',
                  color: 'var(--text-primary)'
                }}
              />
            </div>

            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '0.38rem 0.65rem',
                fontSize: '0.75rem',
                borderRadius: 10,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                background: 'rgba(26, 26, 46, 0.85)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              {SORT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Goals Grid */}
        {loading ? (
          <SkeletonLoader rows={3} height={220} />
        ) : filteredGoals.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: 'rgba(37, 37, 64, 0.3)',
              borderRadius: 16,
              border: '1px dashed rgba(255, 255, 255, 0.08)',
              marginTop: '1rem'
            }}
          >
            <Wallet size={36} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem' }} />
            <h3 style={{ margin: '0 0 0.5rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)', fontSize: '1.1rem' }}>
              No goals found
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
              {searchQuery ? 'No goals match your search filter.' : 'Create your first goal to start tracking.'}
            </p>
            <button className="btn btn-primary" onClick={openAddModal}>
              <Plus size={16} /> Create Goal
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 360px), 1fr))',
              gap: '1rem'
            }}
          >
            {filteredGoals.map((goal, idx) => {
              const stats = calculateGoalStats(goal);
              const {
                current,
                target,
                remaining,
                progressPct,
                isReached,
                targetDateStr,
                daysLeft,
                isPast,
                dailyNeeded
              } = stats;

              const priConfig = PRIORITY_CONFIG[goal.priority || 'medium'] || PRIORITY_CONFIG.medium;
              const radius = 34;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset = circumference - (Math.min(100, progressPct) / 100) * circumference;
              const accentColor = goal.color || (isReached ? '#4ade80' : '#06b6d4');

              const goalIdStr = String(goal.id);
              const goalNameLower = (goal.name || '').toLowerCase().trim();
              const historyCount = (transactionsList || []).filter(t => {
                if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee) return false;
                if (t.goal_id && String(t.goal_id) === goalIdStr) return true;
                const notesLower = (t.notes || '').toLowerCase();
                const catLower = (t.category || '').toLowerCase();
                return (catLower.includes('goal') || catLower.includes('saving')) && goalNameLower && notesLower.includes(goalNameLower);
              }).length;

              return (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -2 }}
                  transition={{ delay: idx * 0.04, duration: 0.25 }}
                  onClick={() => {
                    haptic();
                    setSelectedGoalForHistoryId(goal.id);
                  }}
                  style={{
                    cursor: 'pointer',
                    background: 'rgba(30, 30, 50, 0.75)',
                    border: isReached
                      ? '1px solid rgba(74, 222, 128, 0.4)'
                      : `1px solid ${accentColor}30`,
                    borderRadius: 16,
                    padding: '1.15rem',
                    display: 'flex',
                    flexDirection: 'column',
                    position: 'relative',
                    boxShadow: isReached
                      ? '0 0 24px rgba(74, 222, 128, 0.08) inset, 0 4px 20px rgba(0,0,0,0.25)'
                      : '0 4px 20px rgba(0,0,0,0.25)',
                    backdropFilter: 'blur(16px)'
                  }}
                >
                  {/* Top Bar: Icon, Goal Name, Category, Priority & Edit Actions */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.85rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                      <div
                        style={{
                          width: 42,
                          height: 42,
                          borderRadius: 12,
                          background: `${accentColor}18`,
                          border: `1px solid ${accentColor}35`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.3rem'
                        }}
                      >
                        {goal.icon || '🎯'}
                      </div>
                      <div>
                        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)' }}>
                          {goal.name}
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                            {goal.category || 'Savings'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              fontFamily: 'Inter, sans-serif',
                              color: priConfig.color,
                              background: priConfig.bg,
                              padding: '0.1rem 0.4rem',
                              borderRadius: 8
                            }}
                          >
                            {priConfig.badge}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              haptic();
                              setSelectedGoalForHistoryId(goal.id);
                            }}
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 700,
                              fontFamily: 'Inter, sans-serif',
                              color: '#38bdf8',
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              padding: '0.1rem 0.45rem',
                              borderRadius: 8,
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem'
                            }}
                            title="View Goal Activity & Payment History"
                          >
                            📜 History ({historyCount})
                          </button>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <button
                        className="icon-btn"
                        title="Edit Goal"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(goal);
                        }}
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Delete Goal"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirm({ open: true, id: goal.id });
                        }}
                        style={{ color: '#f87171' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* PROMINENT SECTION: WHAT YOU HAVE RIGHT NOW */}
                  <div
                    style={{
                      background: 'linear-gradient(135deg, rgba(74, 222, 128, 0.08) 0%, rgba(0,0,0,0.3) 100%)',
                      border: '1px solid rgba(74, 222, 128, 0.2)',
                      borderRadius: 14,
                      padding: '0.9rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.85rem'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.68rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '0.5px' }}>
                        HAVE RIGHT NOW
                      </div>
                      <div
                        style={{
                          fontSize: '1.5rem',
                          fontWeight: 800,
                          color: '#4ade80',
                          fontFamily: 'Inter, sans-serif',
                          marginTop: '0.15rem'
                        }}
                      >
                        {formatCurrency(current)}
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.35rem', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          Target: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(target)}</strong>
                        </span>
                        <span style={{ color: remaining > 0 ? '#fbbf24' : '#4ade80' }}>
                          {remaining > 0 ? `To Go: ${formatCurrency(remaining)}` : 'Completed 🏆'}
                        </span>
                      </div>
                    </div>

                    {/* Radial Progress Ring */}
                    <div style={{ position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="72" height="72" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="36" cy="36" r={radius} fill="transparent" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
                        <motion.circle
                          cx="36"
                          cy="36"
                          r={radius}
                          fill="transparent"
                          stroke={isReached ? '#4ade80' : accentColor}
                          strokeWidth="7"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          initial={{ strokeDashoffset: circumference }}
                          animate={{ strokeDashoffset }}
                          transition={{ duration: 1.2, ease: 'easeOut' }}
                          style={{
                            filter: isReached ? 'drop-shadow(0 0 6px #4ade80)' : `drop-shadow(0 0 5px ${accentColor})`
                          }}
                        />
                      </svg>
                      <div style={{ position: 'absolute', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 800, fontFamily: 'Inter, sans-serif', color: 'var(--text-primary)' }}>
                          {Math.round(progressPct)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* END GOAL DATE & DAYS REMAINING */}
                  <div
                    style={{
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: 12,
                      padding: '0.65rem 0.85rem',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.75rem',
                      fontFamily: 'Inter, sans-serif',
                      marginBottom: '0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Calendar size={14} style={{ color: '#06b6d4' }} />
                      <span style={{ color: 'var(--text-muted)' }}>End Goal Date:</span>
                      <strong style={{ color: 'var(--text-primary)' }}>{targetDateStr}</strong>
                    </div>

                    <div>
                      {isReached ? (
                        <span style={{ color: '#4ade80', fontWeight: 700 }}>Achieved 🏆</span>
                      ) : isPast ? (
                        <span style={{ color: '#f87171', fontWeight: 700 }}>Deadline Passed ⏰</span>
                      ) : (
                        <span style={{ color: daysLeft < 30 ? '#fbbf24' : '#06b6d4', fontWeight: 700 }}>
                          {daysLeft} days left
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PROMINENT DAILY CALCULATION + WHAT-IF MONTHLY BOOST SIMULATOR */}
                  {!isReached ? (
                    <div
                      style={{
                        background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.12) 0%, rgba(37, 37, 64, 0.4) 100%)',
                        border: '1px solid rgba(6, 182, 212, 0.28)',
                        borderRadius: 12,
                        padding: '0.75rem 0.9rem',
                        marginBottom: '0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: '0.68rem', color: '#06b6d4', fontWeight: 700, fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px' }}>
                            ⚡ DAILY CALCULATION
                          </div>
                          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif', marginTop: '0.15rem' }}>
                            {formatCurrency(dailyNeeded)}{' '}
                            <span style={{ fontSize: '0.75rem', color: '#06b6d4', fontWeight: 600 }}>/ day</span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif', maxWidth: 140 }}>
                          {daysLeft > 0
                            ? `Save daily for ${daysLeft} days to hit your end date`
                            : 'Target date overdue'}
                        </div>
                      </div>

                      {/* Goal Pacing Feasibility Check & 1-Tap Match Pace */}
                      {daysLeft > 0 && remaining > 0 && (
                        <div style={{ marginTop: '0.6rem', paddingTop: '0.55rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.72rem', fontFamily: 'Inter, sans-serif' }}>
                          {stats.plannedMonthly >= stats.monthlyNeeded ? (
                            <span style={{ color: '#4ade80', fontWeight: 600 }}>
                              ✓ On Pace ({formatCurrency(stats.plannedMonthly)}/mo ≥ {formatCurrency(stats.monthlyNeeded)}/mo needed)
                            </span>
                          ) : (
                            <>
                              <span style={{ color: '#fbbf24' }}>
                                ⚠️ Need <strong>{formatCurrency(stats.monthlyNeeded)}/mo</strong> (planned: {formatCurrency(stats.plannedMonthly)}/mo)
                              </span>
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await updateGoal(goal.id, { ...goal, monthly_contribution: stats.monthlyNeeded });
                                    toast.success(`Updated "${goal.name}" monthly pace to ${formatCurrency(stats.monthlyNeeded)}/mo`);
                                    loadData(true);
                                  } catch {
                                    toast.error('Failed to update goal pace');
                                  }
                                }}
                                style={{
                                  padding: '0.2rem 0.55rem',
                                  borderRadius: 6,
                                  background: 'rgba(56,189,248,0.14)',
                                  border: '1px solid rgba(56,189,248,0.35)',
                                  color: '#38bdf8',
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                Match Required Pace
                              </button>
                            </>
                          )}
                        </div>
                      )}

                      {/* What-If Monthly Boost Toggle & Collapsible Slider */}
                      {remaining > 0 && (() => {
                        const extraMonthly = Number(boostByGoal[goal.id]) || 0;
                        const isExpanded = expandedBoostGoalId === goal.id || extraMonthly > 0;
                        const maxBoost = Math.max(2000, Math.min(250000, Math.ceil((remaining * 0.5) / 500) * 500));
                        const stepBoost = maxBoost >= 50000 ? 1000 : maxBoost >= 10000 ? 500 : 100;
                        const baseDays = daysLeft > 0 ? daysLeft : 180;
                        const baseDailyRate = remaining / baseDays;
                        const boostedDailyRate = baseDailyRate + (extraMonthly / 30);
                        const newDays = boostedDailyRate > 0 ? Math.max(1, Math.ceil(remaining / boostedDailyRate)) : baseDays;
                        const daysSaved = Math.max(0, baseDays - newDays);
                        const earlyFinishDate = new Date();
                        earlyFinishDate.setDate(earlyFinishDate.getDate() + newDays);
                        const earlyDateStr = toYMD(earlyFinishDate);

                        return (
                          <div
                            style={{
                              marginTop: '0.65rem',
                              paddingTop: '0.6rem',
                              borderTop: '1px dashed rgba(255,255,255,0.1)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  haptic();
                                  setExpandedBoostGoalId(prev => prev === goal.id ? null : goal.id);
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.35rem',
                                  fontSize: '0.68rem',
                                  fontFamily: 'Inter, sans-serif',
                                  fontWeight: 700,
                                  color: '#a78bfa'
                                }}
                              >
                                <span>🚀 What-If Simulator</span>
                                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>
                                  {isExpanded ? '▲' : '▼'}
                                </span>
                              </button>
                              {extraMonthly > 0 && (
                                <strong style={{ fontSize: '0.68rem', color: '#4ade80', fontFamily: 'Inter, sans-serif' }}>
                                  +{formatCurrency(extraMonthly)} / mo
                                </strong>
                              )}
                            </div>

                            {isExpanded && (
                              <div style={{ marginTop: '0.5rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.66rem', fontFamily: 'Inter, sans-serif', marginBottom: '0.3rem' }}>
                                  <span style={{ color: 'var(--text-muted)' }}>Slide to simulate extra monthly savings:</span>
                                  <strong style={{ color: extraMonthly > 0 ? '#4ade80' : 'var(--text-muted)' }}>
                                    +{formatCurrency(extraMonthly)} / mo
                                  </strong>
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={maxBoost}
                                  step={stepBoost}
                                  value={extraMonthly}
                                  onClick={e => e.stopPropagation()}
                                  onChange={e => setBoostByGoal(prev => ({ ...prev, [goal.id]: Number(e.target.value) }))}
                                  style={{
                                    width: '100%',
                                    accentColor: '#4ade80',
                                    cursor: 'pointer',
                                    height: 5
                                  }}
                                />
                                {extraMonthly > 0 && (
                                  <div
                                    style={{
                                      marginTop: '0.4rem',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'space-between',
                                      gap: '0.4rem',
                                      flexWrap: 'wrap',
                                      background: 'rgba(74, 222, 128, 0.1)',
                                      border: '1px solid rgba(74, 222, 128, 0.25)',
                                      borderRadius: 8,
                                      padding: '0.35rem 0.55rem',
                                      fontSize: '0.68rem',
                                      fontFamily: 'Inter, sans-serif'
                                    }}
                                  >
                                    <span style={{ color: 'var(--text-primary)' }}>
                                      🎯 Finish <strong style={{ color: '#4ade80' }}>{daysSaved}d earlier</strong> ({earlyDateStr})
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openDepositModal(goal, extraMonthly);
                                      }}
                                      style={{
                                        padding: '0.2rem 0.5rem',
                                        borderRadius: 6,
                                        border: '1px solid rgba(74, 222, 128, 0.4)',
                                        background: 'rgba(74, 222, 128, 0.18)',
                                        color: '#4ade80',
                                        fontSize: '0.65rem',
                                        fontFamily: 'Inter, sans-serif',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                      }}
                                    >
                                      + Deposit {formatCurrency(extraMonthly)}
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div
                      style={{
                        background: 'rgba(74, 222, 128, 0.1)',
                        border: '1px solid rgba(74, 222, 128, 0.25)',
                        borderRadius: 12,
                        padding: '0.75rem 0.9rem',
                        marginBottom: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        color: '#4ade80',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        fontFamily: 'Inter, sans-serif'
                      }}
                    >
                      <Trophy size={18} />
                      Goal Accomplished! Funds are available.
                    </div>
                  )}

                  {/* Notes if present */}
                  {goal.notes && (
                    <div style={{ padding: '0.35rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.85rem' }}>
                      💡 {goal.notes}
                    </div>
                  )}

                  {/* ACTIONS: DEPOSIT & DEDUCT BUTTONS & QUICK CHIPS */}
                  <div style={{ marginTop: 'auto', paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    {/* Primary Two Action Buttons: Deposit & Deduct */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.55rem' }}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDepositModal(goal);
                        }}
                        style={{
                          padding: '0.5rem',
                          fontSize: '0.8rem',
                          justifyContent: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem'
                        }}
                      >
                        <Plus size={15} /> Deposit
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeductModal(goal);
                        }}
                        disabled={current <= 0}
                        style={{
                          padding: '0.5rem',
                          fontSize: '0.8rem',
                          justifyContent: 'center',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          borderRadius: 'var(--radius-sm, 10px)',
                          background: current > 0 ? 'rgba(248, 113, 113, 0.15)' : 'rgba(255,255,255,0.04)',
                          color: current > 0 ? '#f87171' : 'var(--text-muted)',
                          border: current > 0 ? '1px solid rgba(248, 113, 113, 0.35)' : '1px solid rgba(255,255,255,0.05)',
                          cursor: current > 0 ? 'pointer' : 'not-allowed',
                          fontFamily: 'Inter, sans-serif',
                          fontWeight: 700,
                          transition: 'all 0.18s'
                        }}
                      >
                        <Minus size={15} /> Deduct
                      </button>
                    </div>

                    {/* Quick One-Tap Deposit & Deduct Chips */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {/* Quick Add */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.62rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 700, minWidth: 32 }}>
                          ADD:
                        </span>
                        {[50, 100, 500].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickDeposit(goal, amt);
                            }}
                            style={{
                              flex: 1,
                              padding: '0.28rem 0.35rem',
                              borderRadius: 6,
                              border: '1px solid rgba(74, 222, 128, 0.2)',
                              background: 'rgba(74, 222, 128, 0.06)',
                              color: '#4ade80',
                              fontSize: '0.68rem',
                              fontFamily: 'Inter, sans-serif',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            +{formatCurrency(amt)}
                          </button>
                        ))}
                      </div>

                      {/* Quick Deduct (active if current > 0) */}
                      {current > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.62rem', color: '#f87171', fontFamily: 'Inter, sans-serif', fontWeight: 700, minWidth: 32 }}>
                            DEDUCT:
                          </span>
                          {[50, 100, 500].map(amt => {
                            const canDeduct = current >= amt;
                            return (
                              <button
                                key={amt}
                                type="button"
                                disabled={!canDeduct}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickDeduct(goal, amt);
                                }}
                                style={{
                                  flex: 1,
                                  padding: '0.28rem 0.35rem',
                                  borderRadius: 6,
                                  border: canDeduct ? '1px solid rgba(248, 113, 113, 0.2)' : '1px solid rgba(255,255,255,0.04)',
                                  background: canDeduct ? 'rgba(248, 113, 113, 0.06)' : 'transparent',
                                  color: canDeduct ? '#f87171' : 'var(--text-muted)',
                                  fontSize: '0.68rem',
                                  fontFamily: 'Inter, sans-serif',
                                  fontWeight: 600,
                                  cursor: canDeduct ? 'pointer' : 'not-allowed'
                                }}
                              >
                                −{formatCurrency(amt)}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Target Creation / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editMode ? 'Edit Goal Target' : 'Create New Goal Target'}
      >
        <datalist id="goal-names">
          {uniqueGoalNames.map(n => <option key={n} value={n} />)}
        </datalist>

        <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Goal Name */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Target Name
            </label>
            <input
              list="goal-names"
              required
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Emergency Fund, Japan Trip, MacBook Pro"
              style={{ width: '100%', fontSize: '1rem' }}
            />
          </div>

          {/* Category Chips */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Category
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', maxHeight: 110, overflowY: 'auto', padding: '0.2rem 0' }}>
              {GOAL_CATEGORIES.map(cat => {
                const isSelected = formData.category === cat.name;
                return (
                  <button
                    key={cat.name}
                    type="button"
                    onClick={() => setFormData({ ...formData, category: cat.name, icon: cat.icon, color: cat.color })}
                    style={{
                      padding: '0.3rem 0.6rem',
                      borderRadius: 14,
                      fontSize: '0.72rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: isSelected ? `1px solid ${cat.color}` : '1px solid rgba(255,255,255,0.08)',
                      background: isSelected ? `${cat.color}25` : 'rgba(255,255,255,0.03)',
                      color: isSelected ? cat.color : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem'
                    }}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Priority & End Goal Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Priority Level
              </label>
              <select
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.65rem' }}
              >
                <option value="high">🔴 High Priority</option>
                <option value="medium">🟡 Medium Priority</option>
                <option value="low">🔵 Low Priority</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                End Goal Date (Deadline)
              </label>
              <input
                type="date"
                required
                value={formData.target_date}
                onChange={e => setFormData({ ...formData, target_date: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem', padding: '0.65rem' }}
              />
            </div>
          </div>

          {/* Target Capital & Initial/Current Balance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Target Capital (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={formData.target_amount}
                onChange={val => setFormData({ ...formData, target_amount: val })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Have Right Now (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                value={formData.current_amount}
                onChange={val => setFormData({ ...formData, current_amount: val })}
              />
            </div>
          </div>

          {/* Planned Monthly Saving Quota (Reserved in Daily Safe-to-Spend) */}
          <div style={{ padding: '0.75rem', borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.22)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.35rem' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c4b5fd' }}>
                {`🎯 Monthly Saving Quota (${getCurrencyLabel()}) — Reserved in Daily Safe-to-Spend`}
              </label>
              {(() => {
                const rem = Math.max(0, (parseFloat(formData.target_amount) || 0) - (parseFloat(formData.current_amount) || 0));
                if (rem <= 0) return null;
                const d = parseLocalYMD(formData.target_date);
                const now = new Date();
                const mos = d ? Math.max(1, Math.ceil((d - now) / (1000 * 60 * 60 * 24 * 30))) : 10;
                const autoMo = Math.round(rem / mos);
                return (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, monthly_contribution: autoMo })}
                    style={{ padding: '0.18rem 0.55rem', borderRadius: 10, border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(167,139,250,0.15)', color: '#c4b5fd', fontSize: '0.68rem', fontFamily: 'Inter, sans-serif', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Use Auto ({formatCurrency(autoMo)}/mo)
                  </button>
                );
              })()}
            </div>
            <CurrencyInput
              value={formData.monthly_contribution || 0}
              onChange={val => setFormData({ ...formData, monthly_contribution: val })}
              placeholder="0 = Auto-calculate from deadline"
            />
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              Leave 0 to auto-calculate monthly & daily saving needs from your deadline, or enter a fixed monthly saving target.
            </div>
          </div>

          {/* Strategy Notes */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Notes (Optional)
            </label>
            <input
              type="text"
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Save every Friday, Black Friday target"
              style={{ width: '100%', fontSize: '0.9rem' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              {editMode ? 'Update Goal' : 'Create Goal'}
            </button>
          </div>
        </form>
      </Modal>

      {/* DEPOSIT MODAL */}
      <Modal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title={depositTargetGoal ? `+ Deposit into "${depositTargetGoal.name}"` : 'Deposit into Goal'}
      >
        {depositTargetGoal && (
          <form onSubmit={handleDepositSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'rgba(74, 222, 128, 0.08)',
                border: '1px solid rgba(74, 222, 128, 0.2)',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                fontFamily: 'Inter, sans-serif'
              }}
            >
              <div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>HAVE RIGHT NOW</div>
                <div style={{ fontWeight: 800, color: '#4ade80', fontSize: '1.2rem', marginTop: '0.1rem' }}>
                  {formatCurrency(depositTargetGoal.current_amount)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>TARGET</div>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem', marginTop: '0.1rem' }}>
                  {formatCurrency(depositTargetGoal.target_amount)}
                </div>
              </div>
            </div>

            {/* Quick Fill Chips */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[50, 100, 500, 1000].map(amt => (
                <button
                  key={amt}
                  type="button"
                  onClick={() => setDepositData(prev => ({ ...prev, amount: amt }))}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 8,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'var(--text-primary)',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  +{formatCurrency(amt)}
                </button>
              ))}
              {depositTargetGoal.target_amount > depositTargetGoal.current_amount && (
                <button
                  type="button"
                  onClick={() => setDepositData(prev => ({
                    ...prev,
                    amount: Math.max(0, parseFloat((depositTargetGoal.target_amount - depositTargetGoal.current_amount).toFixed(2)))
                  }))}
                  style={{
                    padding: '0.35rem 0.65rem',
                    borderRadius: 8,
                    background: 'rgba(74, 222, 128, 0.15)',
                    border: '1px solid rgba(74, 222, 128, 0.3)',
                    color: '#4ade80',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Fill Remaining ({formatCurrency(Math.max(0, depositTargetGoal.target_amount - depositTargetGoal.current_amount))})
                </button>
              )}
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Deposit Amount (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={depositData.amount}
                onChange={val => setDepositData({ ...depositData, amount: val })}
              />
            </div>

            {/* Source Account */}
            <div style={{ padding: '0.75rem', borderRadius: 12, background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.22)' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', fontWeight: 700, color: '#06b6d4' }}>
                🏦 Choose Account to Deduct From
              </label>
              <FuturisticDropdown
                options={accountOptions}
                value={depositData.account_id}
                onChange={val => setDepositData({ ...depositData, account_id: val })}
              />
              {(() => {
                const selAcc = accounts.find(a => String(a.id) === String(depositData.account_id));
                if (!selAcc) {
                  return (
                    <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: '#fbbf24' }}>
                      ℹ️ Goal balance will increase without deducting from any bank account.
                    </div>
                  );
                }
                const curBal = parseFloat(selAcc.balance) || 0;
                const afterBal = curBal - (parseFloat(depositData.amount) || 0);
                return (
                  <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', padding: '0.4rem 0.6rem', borderRadius: 8, background: 'rgba(0,0,0,0.25)' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Current: <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(curBal)}</strong>
                    </span>
                    <span style={{ color: afterBal < 0 ? '#f87171' : '#4ade80', fontWeight: 700 }}>
                      After Deposit: {formatCurrency(afterBal)}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Note */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Weekly savings deposit, Birthday money"
                value={depositData.note}
                onChange={e => setDepositData({ ...depositData, note: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsDepositModalOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                + Add Deposit
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* DEDUCT / SPEND MODAL */}
      <Modal
        isOpen={isDeductModalOpen}
        onClose={() => setIsDeductModalOpen(false)}
        title={deductTargetGoal ? `− Deduct from "${deductTargetGoal.name}"` : 'Deduct from Goal'}
      >
        {deductTargetGoal && (
          <form onSubmit={handleDeductSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div
              style={{
                background: 'rgba(248, 113, 113, 0.08)',
                border: '1px solid rgba(248, 113, 113, 0.25)',
                padding: '0.85rem 1rem',
                borderRadius: 12,
                fontSize: '0.8rem',
                color: 'var(--text-primary)'
              }}
            >
              <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontFamily: 'Inter, sans-serif' }}>
                HAVE RIGHT NOW IN THIS GOAL
              </div>
              <div style={{ fontWeight: 800, fontSize: '1.4rem', color: '#f87171', fontFamily: 'Inter, sans-serif', marginTop: '0.15rem' }}>
                {formatCurrency(deductTargetGoal.current_amount)}
              </div>
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                Deduct money from this goal when spending or withdrawing.
              </p>
            </div>

            {/* Quick Percentage Chips */}
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[0.25, 0.5, 0.75, 1].map(pct => {
                const amt = parseFloat((deductTargetGoal.current_amount * pct).toFixed(2));
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setDeductData(prev => ({ ...prev, amount: amt }))}
                    style={{
                      flex: 1,
                      padding: '0.35rem',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      color: 'var(--text-primary)',
                      fontSize: '0.75rem',
                      fontFamily: 'Inter, sans-serif',
                      cursor: 'pointer'
                    }}
                  >
                    {pct === 1 ? '100% (All)' : `${pct * 100}%`}
                  </button>
                );
              })}
            </div>

            {/* Amount */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {`Amount to Deduct (${getCurrencyLabel()})`}
              </label>
              <CurrencyInput
                required
                value={deductData.amount}
                onChange={val => setDeductData({ ...deductData, amount: val })}
              />
            </div>

            {/* Destination Account */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Where does the money go?
              </label>
              <FuturisticDropdown
                options={accountOptions}
                value={deductData.account_id}
                onChange={val => setDeductData({ ...deductData, account_id: val })}
              />
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.2rem', display: 'block' }}>
                Select an account to add funds to it, or choose &quot;Do not link&quot; if spent directly.
              </span>
            </div>

            {/* Reason */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Reason / Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Bought items, Emergency expense, Withdrew cash"
                value={deductData.reason}
                onChange={e => setDeductData({ ...deductData, reason: e.target.value })}
                style={{ width: '100%', fontSize: '0.9rem' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsDeductModalOpen(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-danger"
                style={{
                  background: 'linear-gradient(135deg, #f87171, #ef4444)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem'
                }}
              >
                <Minus size={15} /> Confirm Deduction
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* VIRTUAL ROUND-UP SIMULATOR MODAL */}
      <Modal
        isOpen={isRoundUpModalOpen}
        onClose={() => setIsRoundUpModalOpen(false)}
        title="⚡ Spare-Change Round-Up Simulator"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <div
            style={{
              background: 'linear-gradient(145deg, rgba(74, 222, 128, 0.08) 0%, rgba(37, 37, 64, 0.6) 100%)',
              border: '1px solid rgba(74, 222, 128, 0.25)',
              borderRadius: 14,
              padding: '1rem 1.15rem',
              backdropFilter: 'blur(12px)'
            }}
          >
            <div style={{ fontSize: '0.7rem', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontWeight: 700, letterSpacing: '0.5px' }}>
              ⚡ SIMULATED SPARE-CHANGE POTENTIAL
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4ade80', fontFamily: 'Inter, sans-serif', marginTop: '0.2rem' }}>
              +{formatCurrency(simulatedRoundUpTotal)}
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Calculated across your last {recentExpenses.length} expense transactions.
            </div>
          </div>

          {/* Round-up Increment Selector */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Round Up Each Expense To Nearest:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              {[100, 500, 1000].map(inc => (
                <button
                  key={inc}
                  type="button"
                  onClick={() => setRoundUpIncrement(inc)}
                  style={{
                    padding: '0.65rem 0.5rem',
                    borderRadius: 10,
                    border: `1px solid ${roundUpIncrement === inc ? '#4ade80' : 'rgba(255,255,255,0.08)'}`,
                    background: roundUpIncrement === inc ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.03)',
                    color: roundUpIncrement === inc ? '#4ade80' : '#f0f0f5',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 700,
                    fontSize: '0.9rem',
                    cursor: 'pointer',
                    transition: 'all 0.18s ease'
                  }}
                >
                  +{inc}
                </button>
              ))}
            </div>
          </div>

          {/* Target Goal Selector */}
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Deposit Spare Change Into Goal:
            </label>
            <FuturisticDropdown
              options={goals.map(g => ({
                value: g.id,
                label: `${g.icon || '🎯'} ${g.name} (${formatCurrency(g.current_amount)} / ${formatCurrency(g.target_amount)})`
              }))}
              value={roundUpGoalId}
              onChange={val => setRoundUpGoalId(val)}
            />
          </div>

          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Applying this deposit will log a contribution to your selected goal and celebrate with confetti!
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsRoundUpModalOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={simulatedRoundUpTotal <= 0 || goals.length === 0}
              onClick={handleApplyRoundUp}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <Sparkles size={16} /> Apply Round-Up Deposit
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Goal Activity & Contribution History Modal ── */}
      <GoalHistoryModal
        isOpen={!!activeGoalForHistory}
        onClose={() => setSelectedGoalForHistoryId(null)}
        goal={activeGoalForHistory}
        accounts={accounts}
        transactions={transactionsList}
        onDeposit={(g, amt) => openDepositModal(g, amt)}
        onDeduct={(g, amt) => openDeductModal(g, amt)}
        onEdit={(g) => openEditModal(g)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirm.open}
        title="Delete Target"
        message="Are you sure you want to delete this target? Note that previously recorded contributions and account transactions will remain in your history."
        confirmLabel="Delete"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirm({ open: false, id: null })}
      />
    </PageWrapper>
  );
};

export default Goals;