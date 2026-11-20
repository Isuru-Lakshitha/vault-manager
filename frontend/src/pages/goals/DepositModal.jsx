import Modal from '../../components/Modal';
import FuturisticDropdown from '../../components/FuturisticDropdown';
import CurrencyInput from '../../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';

// Goals → move money from an account into a goal.
export default function DepositModal({ accountOptions, accounts, depositData, depositTargetGoal, handleDepositSubmit, isDepositModalOpen, setDepositData, setIsDepositModalOpen }) {
  return (
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
              fontSize: '0.8rem' }}
          >
            <div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>HAVE RIGHT NOW</div>
              <div style={{ fontWeight: 800, color: 'var(--mm-success)', fontSize: '1.2rem', marginTop: '0.1rem' }}>
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
                  color: 'var(--mm-success)',
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
                  <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: 'var(--mm-warning)' }}>
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
                  <span style={{ color: afterBal < 0 ? 'var(--mm-danger)' : 'var(--mm-success)', fontWeight: 700 }}>
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
  );
}
