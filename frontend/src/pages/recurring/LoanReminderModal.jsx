import Modal from '../../components/Modal';
import CurrencyInput from '../../components/CurrencyInput';
import { formatCurrency, getCurrencyLabel } from '../../utils/format';

// Recurring → "Track loan": add a loan's monthly instalment as a reminder,
// either from an existing loan or by entering a new one.
export default function LoanReminderModal({ isOpen, onClose, loans, accounts, form, setForm, onSubmit }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose()}
      title="Track Loan as Monthly Payment"
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        {loans.filter(l => (l.status || 'Active') === 'Active').length > 0 && (
          <div style={{ display: 'flex', gap: '0.45rem', marginBottom: '0.2rem' }}>
            <button
              type="button"
              onClick={() => setForm({ ...form, mode: 'existing' })}
              style={{
                flex: 1,
                padding: '0.45rem',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.75rem',
                background: form.mode === 'existing' ? 'rgba(91,141,239,0.14)' : 'transparent',
                color: form.mode === 'existing' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${form.mode === 'existing' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
              }}
            >
              Select Existing Loan ({loans.filter(l => (l.status || 'Active') === 'Active').length})
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, mode: 'new' })}
              style={{
                flex: 1,
                padding: '0.45rem',
                borderRadius: 8,
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.75rem',
                background: form.mode === 'new' ? 'rgba(91,141,239,0.14)' : 'transparent',
                color: form.mode === 'new' ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${form.mode === 'new' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
              }}
            >
              + Create & Track New Loan
            </button>
          </div>
        )}

        {form.mode === 'existing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.78rem', fontWeight: 600 }}>
                Select Existing Loan
              </label>
              <select
                value={form.selected_loan_id}
                onChange={e => {
                  const chosenId = e.target.value;
                  const chosenLoan = loans.find(l => String(l.id) === String(chosenId));
                  let suggested = form.monthly_payment;
                  if (chosenLoan) {
                    const p = parseFloat(chosenLoan.principal_amount) || 0;
                    const r = parseFloat(chosenLoan.annual_interest_rate) || 0;
                    const moInt = Math.round((p * (r / 100)) / 12);
                    suggested = parseFloat(chosenLoan.monthly_payment) > 0 ? parseFloat(chosenLoan.monthly_payment) : (moInt > 0 ? moInt : 5000);
                  }
                  setForm({
                    ...form,
                    selected_loan_id: chosenId,
                    monthly_payment: suggested,
                  });
                }}
                style={{ width: '100%' }}
              >
                {loans.filter(l => (l.status || 'Active') === 'Active').map(l => (
                  <option key={l.id} value={l.id}>
                    {l.item_name} ({l.lender_name || l.type || 'Loan'}) — Principal {formatCurrency(l.principal_amount)}
                  </option>
                ))}
              </select>
            </div>

            {(() => {
              const sel = loans.find(l => String(l.id) === String(form.selected_loan_id));
              if (!sel) return null;
              const p = parseFloat(sel.principal_amount) || 0;
              const apr = parseFloat(sel.annual_interest_rate) || 0;
              const moInt = Math.round((p * (apr / 100)) / 12);
              const accrued = Math.round(parseFloat(sel.current_accrued_interest ?? sel.unpaid_interest) || 0);

              return (
                <div style={{ padding: '0.7rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                  <div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Principal</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)' }}>{formatCurrency(p)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Interest Rate</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--mm-warning)' }}>{apr}% APR</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Monthly Interest</div>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--mm-success)' }}>~{formatCurrency(moInt)}/mo</div>
                  </div>
                  {accrued > 0 && (
                    <div>
                      <div style={{ fontSize: '0.64rem', color: 'var(--text-muted)' }}>Accrued Interest</div>
                      <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--mm-danger)' }}>{formatCurrency(accrued)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {form.mode === 'new' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Loan / Item Name</label>
              <input
                required
                value={form.item_name}
                onChange={e => setForm({ ...form, item_name: e.target.value })}
                placeholder="e.g. 22K Gold Chain, Personal Loan, Vehicle Lease"
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.7rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Loan Type</label>
                <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} style={{ width: '100%' }}>
                  <option value="Gold Loan">Gold Loan</option>
                  <option value="Personal Loan">Personal Loan</option>
                  <option value="Vehicle Loan">Vehicle Loan</option>
                  <option value="Mortgage">Home / Land Loan</option>
                  <option value="Debt">Other Debt</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Lender / Bank (Optional)</label>
                <input
                  value={form.lender_name}
                  onChange={e => setForm({ ...form, lender_name: e.target.value })}
                  placeholder="e.g. Commercial Bank, BOC"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '0.7rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>{`Principal (${getCurrencyLabel()})`}</label>
                <CurrencyInput
                  value={form.principal_amount}
                  onChange={v => {
                    const p = parseFloat(v) || 0;
                    const apr = parseFloat(form.annual_interest_rate) || 0;
                    const moInt = Math.round((p * (apr / 100)) / 12);
                    setForm({
                      ...form,
                      principal_amount: v,
                      monthly_payment: moInt > 0 ? moInt : form.monthly_payment,
                    });
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Annual APR (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={form.annual_interest_rate}
                  onChange={e => {
                    const apr = parseFloat(e.target.value) || 0;
                    const p = parseFloat(form.principal_amount) || 0;
                    const moInt = Math.round((p * (apr / 100)) / 12);
                    setForm({
                      ...form,
                      annual_interest_rate: e.target.value,
                      monthly_payment: moInt > 0 ? moInt : form.monthly_payment,
                    });
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Monthly Payment Amount Config */}
        <div style={{ padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.4rem' }}>
            <label style={{ fontSize: '0.76rem', fontWeight: 600 }}>
              {`Monthly Payment to Track (${getCurrencyLabel()})`}
            </label>
            {(() => {
              let moInt = 0;
              if (form.mode === 'existing') {
                const sel = loans.find(l => String(l.id) === String(form.selected_loan_id));
                if (sel) {
                  const p = parseFloat(sel.principal_amount) || 0;
                  const r = parseFloat(sel.annual_interest_rate) || 0;
                  moInt = Math.round((p * (r / 100)) / 12);
                }
              } else {
                const p = parseFloat(form.principal_amount) || 0;
                const r = parseFloat(form.annual_interest_rate) || 0;
                moInt = Math.round((p * (r / 100)) / 12);
              }
              if (moInt <= 0) return null;
              return (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, monthly_payment: moInt })}
                  style={{
                    padding: '0.2rem 0.55rem',
                    borderRadius: 6,
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.28)',
                    color: 'var(--mm-warning)',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Use Monthly Interest: {formatCurrency(moInt)}
                </button>
              );
            })()}
          </div>

          <CurrencyInput
            required
            value={form.monthly_payment}
            onChange={v => setForm({ ...form, monthly_payment: v })}
          />
        </div>

        {/* Payment Schedule */}
        <div style={{ padding: '0.8rem', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))' }}>
          <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            Payment Date Schedule
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.45rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setForm({ ...form, schedule_mode: 'flexible' })}
              style={{
                padding: '0.42rem',
                borderRadius: 8,
                border: `1px solid ${form.schedule_mode === 'flexible' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                background: form.schedule_mode === 'flexible' ? 'rgba(91,141,239,0.12)' : 'transparent',
                color: form.schedule_mode === 'flexible' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.73rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Flexible (Anytime in Month)
            </button>
            <button
              type="button"
              onClick={() => setForm({ ...form, schedule_mode: 'fixed' })}
              style={{
                padding: '0.42rem',
                borderRadius: 8,
                border: `1px solid ${form.schedule_mode === 'fixed' ? 'var(--mm-accent, #5b8def)' : 'var(--mm-border-subtle, rgba(255,255,255,0.08))'}`,
                background: form.schedule_mode === 'fixed' ? 'rgba(91,141,239,0.12)' : 'transparent',
                color: form.schedule_mode === 'fixed' ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.73rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Fixed Day of Month
            </button>
          </div>

          {form.schedule_mode === 'flexible' ? (
            <select
              value={form.flexible_window}
              onChange={e => setForm({ ...form, flexible_window: e.target.value })}
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
                value={form.day_of_month || 1}
                onChange={e => setForm({ ...form, day_of_month: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Account & Notes */}
        <div style={{ display: 'grid', gridTemplateColumns: accounts.length > 0 ? '1fr 1fr' : '1fr', gap: '0.7rem' }}>
          {accounts.length > 0 && (
            <div>
              <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Default Account (Optional)</label>
              <select
                value={form.from_account_id}
                onChange={e => setForm({ ...form, from_account_id: e.target.value })}
                style={{ width: '100%' }}
              >
                <option value="">— Choose on payment —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({formatCurrency(a.balance)})</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.76rem' }}>Notes (Optional)</label>
            <input
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Ticket number, branch, or reference…"
            />
          </div>
        </div>

        {/* Start From Next Month Toggle */}
        <div style={{
          padding: '0.7rem 0.85rem',
          borderRadius: 10,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--mm-border-subtle, rgba(255,255,255,0.08))',
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={Boolean(form.start_next_month)}
              onChange={e => setForm({ ...form, start_next_month: e.target.checked })}
              style={{ width: 16, height: 16 }}
            />
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {form.start_next_month
                  ? 'Already paid this month — start reminder from next month'
                  : 'Still due this month — reserve in this month’s Safe-to-Spend'}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {form.start_next_month
                  ? 'No money is deducted or reserved for this month; starts tracking fresh next month.'
                  : 'Reserves this loan payment in your current month’s Daily Safe-to-Spend allowance.'}
              </div>
            </div>
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.65rem', marginTop: '0.35rem' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onClose()}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add Loan to Monthly Reminders
          </button>
        </div>
      </form>
    </Modal>
  );
}
