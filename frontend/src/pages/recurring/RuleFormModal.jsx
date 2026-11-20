import Modal from '../../components/Modal';
import CurrencyInput from '../../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';
import { EXPENSE_CATS, FREQUENCIES, INCOME_CATS, QUICK_PRESETS, TYPES } from './model';

/*
 * Add / edit a recurring reminder. Presentation only: all state lives in the
 * Recurring page and is passed in, so behaviour is unchanged.
 */
export default function RuleFormModal({
  isOpen, onClose, editMode, formData, setFormData, onSubmit, accounts, loans,
}) {
  const setIsModalOpen = (open) => { if (!open) onClose(); };
  const handleSubmit = onSubmit;
  const isModalOpen = isOpen;
  const cats = formData.type === 'Income' ? INCOME_CATS : EXPENSE_CATS;
  return (
    <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editMode ? 'Edit Monthly Reminder' : 'Add Monthly Reminder'}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {/* Quick Preset Chips when creating a new reminder */}
        {!editMode && (
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', paddingBottom: '0.35rem', borderBottom: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
            {QUICK_PRESETS.filter(p => p.type !== 'Loan Payment').map(p => (
              <button
                key={p.label}
                type="button"
                onClick={() => setFormData(prev => ({
                  ...prev,
                  ...p,
                  from_account_id: p.type === 'Income' ? '' : (prev.from_account_id || accounts[0]?.id || ''),
                  to_account_id: p.type === 'Income' ? (prev.to_account_id || accounts[0]?.id || '') : '',
                }))}
                style={{
                  padding: '0.22rem 0.55rem',
                  borderRadius: 6,
                  background: formData.name === p.name ? 'rgba(91,141,239,0.16)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${formData.name === p.name ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  color: formData.name === p.name ? 'var(--mm-accent, #5b8def)' : 'var(--text-secondary)',
                  fontSize: '0.68rem',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div>
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Commitment / Bill Name</label>
          <input
            required
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g. Electricity Bill, Fibre Internet, Monthly Rent"
          />
        </div>

        {/* Type & Frequency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Type</label>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {TYPES.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const defAcct = accounts[0]?.id || '';
                    const secAcct = accounts[1]?.id || '';
                    setFormData({
                      ...formData,
                      type: t,
                      category: t === 'Income' ? 'Salary' : t === 'Loan Payment' ? 'Gold Loan' : formData.category === 'Salary' ? 'Utilities' : formData.category,
                      from_account_id: t === 'Income' ? '' : (formData.from_account_id || defAcct),
                      to_account_id: t === 'Income' ? (formData.to_account_id || defAcct) : t === 'Transfer' ? (formData.to_account_id || secAcct) : '',
                    });
                  }}
                  style={{
                    flex: 1,
                    padding: '0.38rem 0.45rem',
                    borderRadius: 8,
                    border: `1px solid ${formData.type === t ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    background: formData.type === t ? 'rgba(91,141,239,0.14)' : 'transparent',
                    color: formData.type === t ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {t === 'Loan Payment' ? 'Loan' : t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Frequency</label>
            <div style={{ display: 'flex', gap: '0.3rem' }}>
              {FREQUENCIES.map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormData({ ...formData, frequency: f })}
                  style={{
                    flex: 1,
                    padding: '0.38rem 0.3rem',
                    borderRadius: 8,
                    border: `1px solid ${formData.frequency === f ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    background: formData.frequency === f ? 'rgba(91,141,239,0.14)' : 'transparent',
                    color: formData.frequency === f ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Link to Active Loan when Type === 'Loan Payment' */}
        {formData.type === 'Loan Payment' && loans.filter(l => (l.status || 'Active') === 'Active').length > 0 && (
          <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.22)' }}>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.76rem', color: 'var(--mm-warning)', fontWeight: 600 }}>
              Link to Active Loan / Debt
            </label>
            <select
              value={formData.loan_id}
              onChange={e => {
                const chosenId = e.target.value;
                const chosenLoan = loans.find(l => String(l.id) === String(chosenId));
                const monthlyInt = chosenLoan
                  ? Math.round(((parseFloat(chosenLoan.principal_amount) || 0) * (parseFloat(chosenLoan.annual_interest_rate) || 0) / 100) / 12)
                  : formData.amount;
                setFormData({
                  ...formData,
                  loan_id: chosenId,
                  name: chosenLoan ? `${chosenLoan.item_name} (${chosenLoan.type || 'Loan'})` : formData.name,
                  amount: monthlyInt > 0 ? monthlyInt : formData.amount,
                });
              }}
              style={{ width: '100%' }}
            >
              <option value="">— Standalone Loan Payment —</option>
              {loans.filter(l => (l.status || 'Active') === 'Active').map(l => {
                const moInt = Math.round(((parseFloat(l.principal_amount) || 0) * (parseFloat(l.annual_interest_rate) || 0) / 100) / 12);
                return (
                  <option key={l.id} value={l.id}>
                    {l.item_name} ({l.lender_name || 'Lender'}) — Principal {formatCurrency(l.principal_amount)} • Interest ~{formatCurrency(moInt)}/mo
                  </option>
                );
              })}
            </select>
          </div>
        )}

        {/* Schedule Mode: Flexible ("No Fixed Date") vs Fixed Day */}
        <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Payment Date Schedule
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.55rem' }}>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, schedule_mode: 'flexible' })}
              style={{
                padding: '0.45rem',
                borderRadius: 8,
                border: `1px solid ${formData.schedule_mode === 'flexible' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                background: formData.schedule_mode === 'flexible' ? 'rgba(91,141,239,0.12)' : 'transparent',
                color: formData.schedule_mode === 'flexible' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.73rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Flexible (Anytime in Month)
            </button>
            <button
              type="button"
              onClick={() => setFormData({ ...formData, schedule_mode: 'fixed' })}
              style={{
                padding: '0.45rem',
                borderRadius: 8,
                border: `1px solid ${formData.schedule_mode === 'fixed' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                background: formData.schedule_mode === 'fixed' ? 'rgba(91,141,239,0.12)' : 'transparent',
                color: formData.schedule_mode === 'fixed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.73rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fixed Day of Month
            </button>
          </div>

          {formData.schedule_mode === 'flexible' ? (
            <select
              value={formData.flexible_window}
              onChange={e => setFormData({ ...formData, flexible_window: e.target.value })}
              style={{ width: '100%' }}
            >
              <option value="Anytime">Anytime During the Month</option>
              <option value="Early (1st-10th)">Early Month (1st – 10th)</option>
              <option value="Mid (11th-20th)">Mid Month (11th – 20th)</option>
              <option value="Late (21st-31st)">Late Month (21st – End of Month)</option>
            </select>
          ) : (
            <div>
              <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Day of Month (1 – 28)
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={formData.day_of_month || 1}
                onChange={e => setFormData({ ...formData, day_of_month: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Amount Mode: Variable vs Fixed */}
        <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.07))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
              Amount Behavior
            </label>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_variable: true })}
                style={{
                  padding: '0.22rem 0.55rem',
                  borderRadius: 6,
                  border: `1px solid ${formData.is_variable ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: formData.is_variable ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: formData.is_variable ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Variable (Changes Monthly)
              </button>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, is_variable: false })}
                style={{
                  padding: '0.22rem 0.55rem',
                  borderRadius: 6,
                  border: `1px solid ${!formData.is_variable ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                  background: !formData.is_variable ? 'rgba(91,141,239,0.12)' : 'transparent',
                  color: !formData.is_variable ? 'var(--text-primary)' : 'var(--text-muted)',
                  fontSize: '0.68rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Fixed Amount
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {formData.is_variable
                ? `Estimated / Average Monthly Bill (${getCurrencyLabel()})`
                : `Fixed Amount (${getCurrencyLabel()})`}
            </label>
            <CurrencyInput
              required
              value={formData.amount}
              onChange={v => setFormData({ ...formData, amount: v })}
            />
          </div>

          {formData.is_variable && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem', marginTop: '0.6rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Min Expected (Optional)
                </label>
                <CurrencyInput
                  value={formData.min_amount}
                  onChange={v => setFormData({ ...formData, min_amount: v })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  Max Expected (Optional)
                </label>
                <CurrencyInput
                  value={formData.max_amount}
                  onChange={v => setFormData({ ...formData, max_amount: v })}
                />
              </div>
            </div>
          )}
        </div>

        {/* Category & Account Selection */}
        <div style={{ display: 'grid', gridTemplateColumns: formData.type === 'Transfer' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Category</label>
            <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })} style={{ width: '100%' }}>
              {cats.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {formData.type !== 'Income' && accounts.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                {formData.type === 'Transfer' ? 'From Account' : 'Default Account'}
              </label>
              <select value={formData.from_account_id} onChange={e => setFormData({ ...formData, from_account_id: e.target.value })} style={{ width: '100%' }}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}

          {(formData.type === 'Income' || formData.type === 'Transfer') && accounts.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>
                {formData.type === 'Transfer' ? 'To Account' : 'Deposit Account'}
              </label>
              <select value={formData.to_account_id} onChange={e => setFormData({ ...formData, to_account_id: e.target.value })} style={{ width: '100%' }}>
                <option value="">— None —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem' }}>Notes</label>
          <input value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Account number, meter number, or reminder note…" />
        </div>

        {/* Start From Next Month (Already Paid This Month) Toggle */}
        <div style={{
          padding: '0.7rem 0.85rem',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={Boolean(formData.start_next_month)}
              onChange={e => setFormData({ ...formData, start_next_month: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {formData.start_next_month
                  ? 'Already paid this month — start reminder from next month'
                  : 'Still due this month — reserve in this month’s Safe-to-Spend'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {formData.start_next_month
                  ? 'No money is deducted or reserved for this month; activates automatically next month.'
                  : 'Reserves this amount in your current month’s Daily Safe-to-Spend allowance.'}
              </div>
            </div>
          </label>
        </div>

        {editMode && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={formData.paused} onChange={e => setFormData({ ...formData, paused: e.target.checked })} style={{ width: 16, height: 16 }} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pause this reminder</span>
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>Cancel</button>
          <button type="submit" className="btn btn-primary">{editMode ? 'Update Reminder' : 'Save Monthly Reminder'}</button>
        </div>
      </form>
    </Modal>
  );
}
