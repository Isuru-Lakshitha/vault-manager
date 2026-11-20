import { Minus } from 'lucide-react';
import Modal from '../../components/Modal';
import FuturisticDropdown from '../../components/FuturisticDropdown';
import CurrencyInput from '../../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';

// Goals → take money back out of a goal into an account.
export default function DeductModal({ accountOptions, deductData, deductTargetGoal, handleDeductSubmit, isDeductModalOpen, setDeductData, setIsDeductModalOpen }) {
  return (
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
            <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>
              HAVE RIGHT NOW IN THIS GOAL
            </div>
            <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--mm-danger)', marginTop: '0.15rem' }}>
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
  );
}
