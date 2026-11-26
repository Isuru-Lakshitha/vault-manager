import { Zap } from 'lucide-react';
import Modal from '../../components/Modal';
import CurrencyInput from '../../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';

// Recurring → "Pay this month": record a reminder's payment (or enter the
// actual amount of a variable bill) from a chosen account.
export default function PayReminderModal({ state, setState, accounts, onConfirm }) {
  return (
    <Modal
      isOpen={state.open}
      onClose={() => setState(p => ({ ...p, open: false }))}
      title={
        state.loan && !state.rule
          ? `Pay Loan: ${state.loan.item_name || state.loan.name}`
          : `${state.rule?.type === 'Income' ? 'Receive' : 'Pay'} This Month: ${state.rule?.name || state.rule?.category || ''}`
      }
    >
      <form onSubmit={onConfirm} style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
        <div style={{
          padding: '0.7rem 0.9rem',
          borderRadius: 10,
          background: 'var(--mm-bg-elevated, rgba(255,255,255,0.03))',
          border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.45,
        }}>
          {state.rule?.is_variable
            ? 'Enter the exact amount for this month. If enabled below, your 3-month rolling average estimate will update automatically.'
            : state.loan
              ? 'This payment pays down accrued loan interest first and reduces principal with any remaining amount.'
              : 'Record this month’s transaction and mark this reminder as completed for the current month.'}
        </div>

        {/* Quick Amount Pills for Linked Loans */}
        {state.loan && (
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {(() => {
              const principal = parseFloat(state.loan.principal_amount ?? state.loan.principal) || 0;
              const apr = parseFloat(state.loan.annual_interest_rate ?? state.loan.apr) || 0;
              const moInt = Math.round((principal * (apr / 100)) / 12);
              const accrued = Math.round(parseFloat(state.loan.current_accrued_interest ?? state.loan.unpaid_interest ?? state.loan.accruedInterest) || 0);
              return (
                <>
                  {moInt > 0 && (
                    <button
                      type="button"
                      onClick={() => setState(p => ({ ...p, amount: moInt }))}
                      style={{ padding: '0.26rem 0.6rem', borderRadius: 6, border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.1)', color: 'var(--mm-warning)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Monthly Interest: {formatCurrency(moInt)}
                    </button>
                  )}
                  {accrued > 0 && (
                    <button
                      type="button"
                      onClick={() => setState(p => ({ ...p, amount: accrued }))}
                      style={{ padding: '0.26rem 0.6rem', borderRadius: 6, border: '1px solid rgba(248,113,113,0.35)', background: 'rgba(248,113,113,0.1)', color: 'var(--mm-danger)', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Accrued Interest: {formatCurrency(accrued)}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
              {`Actual Amount (${getCurrencyLabel()})`}
            </label>
            <CurrencyInput
              required
              value={state.amount}
              onChange={v => setState(p => ({
                ...p,
                amount: v,
                // A new sent amount makes the old received amount stale.
                ...(p.rule?.type === 'Transfer' && Number(v) !== Number(p.amount) ? { destination_amount: '' } : {}),
              }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Date</label>
            <input
              type="date"
              required
              value={state.date}
              onChange={e => setState(p => ({ ...p, date: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
            {state.rule?.type === 'Income'
              ? 'Account to Deposit Into'
              : state.rule?.type === 'Transfer'
                ? 'From Account (Source)'
                : 'Account to Deduct From'}
          </label>
          <select
            value={state.account_id}
            onChange={e => setState(p => ({ ...p, account_id: e.target.value, destination_amount: '' }))}
            style={{ width: '100%' }}
          >
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name} — Available: {formatCurrency(a.balance)}</option>
            ))}
            <option value="">— Do not change account balance (Mark reminder paid only) —</option>
          </select>

          {state.rule?.type === 'Transfer' && state.account_id && (
            <div style={{ marginTop: '0.65rem' }}>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                To Account (Destination)
              </label>
              <select
                value={state.to_account_id}
                onChange={e => setState(p => ({ ...p, to_account_id: e.target.value, destination_amount: '' }))}
                style={{ width: '100%' }}
              >
                <option value="">— Select destination account —</option>
                {accounts
                  .filter(a => String(a.id) !== String(state.account_id))
                  .map(a => (
                    <option key={a.id} value={a.id}>{a.name} — Available: {formatCurrency(a.balance)}</option>
                  ))}
              </select>
              {(() => {
                const from = accounts.find(a => String(a.id) === String(state.account_id));
                const to = accounts.find(a => String(a.id) === String(state.to_account_id));
                if (!from?.currency || !to?.currency || from.currency === to.currency) return null;
                return (
                  <div style={{ marginTop: '0.65rem' }}>
                    <label htmlFor="pay-received-amount" style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                      {`Amount received (${to.currency})`}
                    </label>
                    <CurrencyInput
                      id="pay-received-amount"
                      required
                      value={state.destination_amount}
                      onChange={v => setState(p => ({ ...p, destination_amount: v }))}
                    />
                  </div>
                );
              })()}
            </div>
          )}

          {(() => {
            const chosenAcct = accounts.find(a => String(a.id) === String(state.account_id));
            const amt = parseFloat(state.amount) || 0;
            if (!chosenAcct) {
              return (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  No account selected — will mark this month’s reminder as completed without changing account balances.
                </div>
              );
            }
            const isInc = state.rule?.type === 'Income';
            const nextBal = isInc ? (Number(chosenAcct.balance) || 0) + amt : (Number(chosenAcct.balance) || 0) - amt;
            return (
              <div style={{
                marginTop: 6,
                padding: '0.45rem 0.7rem',
                borderRadius: 8,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
                fontSize: '0.73rem',
                color: 'var(--text-secondary)',
                display: 'flex',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}>
                <span>
                  {isInc ? 'Crediting to' : 'Deducting from'} <strong style={{ color: 'var(--text-primary)' }}>{chosenAcct.name}</strong>
                </span>
                <span>
                  Projected Balance: <strong style={{ color: nextBal >= 0 ? 'var(--mm-success)' : 'var(--mm-danger)' }}>{formatCurrency(nextBal)}</strong>
                </span>
              </div>
            );
          })()}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Notes</label>
          <input
            value={state.notes}
            onChange={e => setState(p => ({ ...p, notes: e.target.value }))}
            placeholder="e.g. Monthly Electricity Bill"
          />
        </div>

        {state.rule && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={state.updateEstimate}
              onChange={e => setState(p => ({ ...p, updateEstimate: e.target.checked }))}
              style={{ width: 16, height: 16 }}
            />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Update future monthly estimate using 3-month rolling average
            </span>
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setState(p => ({ ...p, open: false }))}>
            Cancel
          </button>
          <button type="submit" disabled={state.saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <Zap size={14} />
            {state.saving
              ? 'Saving…'
              : state.account_id
                ? `Confirm ${state.rule?.type === 'Income' ? '& Deposit' : '& Deduct'} ${formatCurrency(state.amount || 0)}`
                : `Mark Paid (${formatCurrency(state.amount || 0)})`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
