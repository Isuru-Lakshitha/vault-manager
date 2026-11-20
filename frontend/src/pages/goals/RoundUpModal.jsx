import { Sparkles } from 'lucide-react';
import Modal from '../../components/Modal';
import FuturisticDropdown from '../../components/FuturisticDropdown';
import { formatCurrency } from '../../utils/format';

// Goals → spare-change round-up simulator.
export default function RoundUpModal({ goals, handleApplyRoundUp, isRoundUpModalOpen, recentExpenses, roundUpGoalId, roundUpIncrement, setIsRoundUpModalOpen, setRoundUpGoalId, setRoundUpIncrement, simulatedRoundUpTotal }) {
  return (
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
          <div style={{ fontSize: '0.7rem', color: 'var(--mm-success)', fontWeight: 700, letterSpacing: '0.5px' }}>
            ⚡ SIMULATED SPARE-CHANGE POTENTIAL
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--mm-success)', marginTop: '0.2rem' }}>
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
  );
}
