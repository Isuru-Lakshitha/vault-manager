import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Modal from '../../components/Modal';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { formatCurrency, haptic } from '../../utils/format';
import { todayYMD } from '../../utils/dates';

// Dashboard → tap "Income" / "Expenses" this month: the list behind the number.
export default function SummaryBreakdownModal({ popup, onClose, transactions, monthlyIncome, monthlyExpense, onOpenTx }) {
  const navigate = useNavigate();
  return (
    <Modal
      isOpen={!!popup}
      onClose={() => onClose()}
      title={popup.type === 'Income' ? '💰 This Month Income' : '💸 This Month Deductions & Expenses'}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{
          textAlign: 'center',
          padding: '1.25rem',
          background: popup.type === 'Income' ? 'rgba(74,222,128,0.08)' : 'rgba(248,113,113,0.08)',
          borderRadius: 14,
          border: `1px solid ${popup.type === 'Income' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`
        }}>
          <div style={{ fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Total {popup.type === 'Income' ? 'Income Received' : 'Deductions & Expenses'}
          </div>
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: '2rem', fontWeight: 800, color: popup.type === 'Income' ? '#4ade80' : '#f87171', marginTop: 4 }}>
            {popup.type === 'Income' ? '+' : '-'}{formatCurrency(popup.type === 'Income' ? monthlyIncome : monthlyExpense)}
          </div>
        </div>

        {(() => {
          const thisMo = todayYMD().substring(0, 7);
          const txList = (transactions || []).filter(t => {
            if (!t || t.reversed_at || t.reversal_of || t.is_transfer_fee || !t.date || !t.date.startsWith(thisMo)) return false;
            if (popup.type === 'Income') return t.type === 'Income';
            return t.type === 'Expense' || t.type === 'Loan Payment';
          });
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Transactions ({txList.length})
                </div>
                <span style={{ fontSize: '0.7rem', color: 'var(--cyan)' }}>Tap item to view popup</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '50vh', overflowY: 'auto' }}>
                {txList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
                    No {popup.type === 'Income' ? 'income' : 'expense'} transactions recorded this month yet.
                  </div>
                ) : (
                  txList.map(tx => (
                    <div
                      key={tx.id}
                      onClick={() => {
                        haptic();
                        onOpenTx(tx);
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.65rem 0.85rem',
                        borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                        cursor: 'pointer', transition: 'all 0.15s'
                      }}
                    >
                      <div style={{ fontSize: '1.3rem', width: 34, textAlign: 'center' }}>
                        {getCategoryEmoji(tx.category) || (popup.type === 'Income' ? '💰' : '💸')}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tx.category || tx.type}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                          {tx.date} {tx.notes ? `• ${tx.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, fontFamily: 'Inter, sans-serif', color: popup.type === 'Income' ? '#4ade80' : '#f87171', fontSize: '0.9rem' }}>
                        {popup.type === 'Income' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          );
        })()}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/transactions');
            }}
            className="btn btn-secondary"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.7rem', fontSize: '0.82rem' }}
          >
            View in Transactions <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
