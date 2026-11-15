import { reversePayment, getCache } from '../utils/api';
import { isActivePayment, isEditableTransaction } from '../utils/ledgerReporting';
import React, { useState } from 'react';
import 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Calendar, CreditCard, Tag, FileText, Edit2, Trash2, Copy, ArrowRight, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Receipt, Search } from 'lucide-react';
import Modal from './Modal';
import ReceiptImage from './ReceiptImage';
import getCategoryEmoji from '../utils/categoryEmoji';
import { formatCurrency, getCurrency, haptic } from '../utils/format';
import toast from 'react-hot-toast';

const TYPE_CONFIG = {
  Income: {
    label: 'Income',
    color: '#4ade80',
    bg: 'rgba(74, 222, 128, 0.12)',
    border: 'rgba(74, 222, 128, 0.25)',
    icon: ArrowDownLeft,
    prefix: '+',
    subLabel: 'Credited to account',
  },
  Expense: {
    label: 'Expense / Deduction',
    color: '#f87171',
    bg: 'rgba(248, 113, 113, 0.12)',
    border: 'rgba(248, 113, 113, 0.25)',
    icon: ArrowUpRight,
    prefix: '-',
    subLabel: 'Debited from account',
  },
  Transfer: {
    label: 'Transfer',
    color: '#818cf8',
    bg: 'rgba(129, 140, 248, 0.12)',
    border: 'rgba(129, 140, 248, 0.25)',
    icon: ArrowLeftRight,
    prefix: '↔',
    subLabel: 'Internal transfer',
  },
  'Loan Payment': {
    label: 'Loan Payment',
    color: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.12)',
    border: 'rgba(251, 191, 36, 0.25)',
    icon: ArrowUpRight,
    prefix: '-',
    subLabel: 'Loan deduction',
  },
};

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const [y, m, d] = dateStr.split('-');
    if (y && m && d) {
      const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return dateStr;
  } catch {
  return dateStr;
}
};

const TransactionPopup = ({
  isOpen,
  onClose,
  transaction,
  accounts = [],
  onEdit,
  onDelete,
  onDuplicate,
}) => {
  // Hooks must run unconditionally (before any early return) — otherwise
  // React throws "Rendered more hooks than during the previous render"
  // when `transaction` switches from null to a value.
  const navigate = useNavigate();
  const [reversalReason, setReversalReason] = useState('');
  const [reversing, setReversing] = useState(false);
  const [voucherLoading, setVoucherLoading] = useState(false);

  if (!transaction) return null;

  const cfg = TYPE_CONFIG[transaction.type] || TYPE_CONFIG.Expense;
  const TypeIcon = cfg.icon;

  const getAccountObj = (id) => {
    if (!id) return null;
    const cleanId = String(id).replace('account_', '').replace('loan_', '');
    return accounts.find(a => String(a.id) === cleanId) || null;
  };

  const fromAcc = getAccountObj(transaction.from_account_id);
  const toAcc = getAccountObj(transaction.to_account_id);
  const fromAccName = fromAcc?.name || 'Account';
  const toAccName = toAcc?.name || 'Account';
  const txCurrency = transaction.currency || (transaction.type === 'Income' ? toAcc?.currency : (fromAcc?.currency || toAcc?.currency)) || getCurrency();
  const toCurrency = toAcc?.currency || txCurrency;

  const categoryEmoji = getCategoryEmoji(transaction.category) ||
    (transaction.type === 'Income' ? '💰' : transaction.type === 'Transfer' ? '🔄' : '💸');

  // Merchant / Category History Snapshot from cached ledger
  const historySnapshot = (() => {
    const allTxs = (getCache('transactions') || []).filter(t => isActivePayment(t) && !t.is_transfer_fee);
    const cleanNote = String(transaction.notes || '').trim().toLowerCase();
    const cleanCat = String(transaction.category || '').trim().toLowerCase();
    const txMonth = String(transaction.date || '').slice(0, 7);

    const matches = allTxs.filter(t => {
      if (cleanNote) {
        return String(t.notes || '').trim().toLowerCase() === cleanNote;
      }
      return String(t.category || '').trim().toLowerCase() === cleanCat && t.type === transaction.type;
    });

    const totalSum = matches.reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const avgAmount = matches.length > 0 ? totalSum / matches.length : 0;
    const thisMonthSum = matches
      .filter(t => String(t.date || '').slice(0, 7) === txMonth)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const recentOthers = matches
      .filter(t => String(t.id) !== String(transaction.id))
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      .slice(0, 3);

    return {
      label: cleanNote ? `"${String(transaction.notes).trim()}"` : (transaction.category || transaction.type),
      count: matches.length,
      avgAmount,
      thisMonthSum,
      recentOthers,
    };
  })();

  const handleVoucher = async () => {
    haptic();
    setVoucherLoading(true);
    try {
      toast.loading('Generating official voucher...', { id: 'voucher-toast' });
      const { generatePaymentVoucherPDF } = await import('../utils/pdfReport');
      await generatePaymentVoucherPDF(transaction, fromAccName || toAccName);
      toast.success('Official payment voucher downloaded!', { id: 'voucher-toast' });
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate voucher', { id: 'voucher-toast' });
    } finally {
      setVoucherLoading(false);
    }
  };

  const handleEdit = () => {
    haptic();
    onClose();
    if (onEdit) onEdit(transaction);
  };

  const handleDuplicate = () => {
    haptic();
    onClose();
    if (onDuplicate) onDuplicate(transaction);
  };

  const handleDelete = () => {
    haptic(50);
    onClose();
    if (onDelete) onDelete(transaction);
  };

  const handleSearchNote = (e) => {
    e.stopPropagation();
    haptic();
    onClose();
    navigate(`/transactions?q=${encodeURIComponent(String(transaction.notes || '').trim())}`);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Top Header Strip with Emoji & Badges */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '-0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 14,
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.6rem',
                flexShrink: 0,
                boxShadow: `0 4px 16px ${cfg.bg}`,
              }}
            >
              {categoryEmoji}
            </div>
            <div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: '1.15rem', color: 'var(--text-primary)', letterSpacing: '0.3px' }}>
                {transaction.category || transaction.type}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: 2 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.7rem',
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600,
                    padding: '0.15rem 0.5rem',
                    borderRadius: 6,
                    background: cfg.bg,
                    color: cfg.color,
                    border: `1px solid ${cfg.border}`,
                  }}
                >
                  <TypeIcon size={11} strokeWidth={2.5} />
                  {cfg.label}
                </span>
                {transaction.is_tax_deductible && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      fontSize: '0.7rem',
                      fontFamily: 'Inter, sans-serif',
                      fontWeight: 600,
                      padding: '0.15rem 0.5rem',
                      borderRadius: 6,
                      background: 'rgba(74,222,128,0.15)',
                      color: '#4ade80',
                      border: '1px solid rgba(74,222,128,0.3)',
                    }}
                  >
                    🏷️ Tax Deductible ({transaction.tax_category || 'Business'})
                  </span>
                )}
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                  {formatDate(transaction.date)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Hero Amount Banner */}
        <div
          style={{
            background: `linear-gradient(135deg, ${cfg.bg} 0%, rgba(255,255,255,0.02) 100%)`,
            border: `1px solid ${cfg.border}`,
            borderRadius: 16,
            padding: '1.25rem 1.5rem',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontFamily: 'Inter, sans-serif', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>
            {transaction.type === 'Income' ? 'Incoming Amount' : transaction.type === 'Transfer' ? 'Transfer Amount' : 'Deducted Amount'}
          </div>
          <div
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 800,
              fontSize: '2rem',
              color: cfg.color,
              letterSpacing: '-0.5px',
              textShadow: `0 2px 20px ${cfg.color}33`,
            }}
          >
            {cfg.prefix}{formatCurrency(transaction.amount, { currency: txCurrency })}
          </div>
          {transaction.type === 'Transfer' && Number(transaction.destination_amount) > 0 && (
            <div style={{ fontSize: '0.78rem', color: '#4ade80', marginTop: 4, fontFamily: 'Inter, sans-serif', fontWeight: 600 }}>
              Received: {formatCurrency(transaction.destination_amount, { currency: toCurrency })}
            </div>
          )}
          {transaction.fee_amount > 0 && (
            <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 4, fontFamily: 'Inter, sans-serif' }}>
              Fee: {formatCurrency(transaction.fee_amount, { currency: txCurrency })}
            </div>
          )}
        </div>

        {/* Key Information Cards Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem' }}>
          {/* Account Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              <CreditCard size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                {transaction.type === 'Transfer' ? 'Transfer Route' : transaction.type === 'Income' ? 'Credited To' : 'Debited From'}
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: 1 }}>
                {transaction.type === 'Transfer' ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    {fromAccName} <ArrowRight size={13} style={{ color: 'var(--text-muted)' }} /> {toAccName}
                  </span>
                ) : transaction.type === 'Income' ? (
                  toAccName
                ) : (
                  fromAccName
                )}
              </div>
            </div>
          </div>

          {/* Date Card */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.875rem 1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              borderRadius: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(255, 255, 255, 0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-secondary)',
                flexShrink: 0,
              }}
            >
              <Calendar size={18} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                Transaction Date
              </div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)', marginTop: 1 }}>
                {formatDate(transaction.date)}
              </div>
            </div>
          </div>

          {/* Notes / Description (if available) */}
          {transaction.notes && (
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(255, 255, 255, 0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              >
                <FileText size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Notes & Details
                  </div>
                  <button
                    type="button"
                    onClick={handleSearchNote}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                      padding: '0.2rem 0.5rem',
                      borderRadius: 6,
                      background: 'rgba(74, 222, 128, 0.1)',
                      border: '1px solid rgba(74, 222, 128, 0.25)',
                      color: '#4ade80',
                      fontFamily: 'Inter, sans-serif',
                      fontSize: '0.68rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={`Search all "${transaction.notes}" transactions`}
                  >
                    <Search size={11} strokeWidth={2.5} />
                    <span>Search note</span>
                  </button>
                </div>
                <div style={{ fontSize: '0.86rem', color: '#e0e0ee', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                  {transaction.notes}
                </div>
              </div>
            </div>
          )}

          {/* Tags (if available) */}
          {(transaction.tags || []).length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'rgba(168, 85, 247, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#c084fc',
                  flexShrink: 0,
                }}
              >
                <Tag size={18} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Tags
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: 4 }}>
                  {transaction.tags.map(t => (
                    <span
                      key={t}
                      style={{
                        background: 'rgba(168, 85, 247, 0.15)',
                        border: '1px solid rgba(168, 85, 247, 0.35)',
                        borderRadius: 100,
                        padding: '0.15rem 0.55rem',
                        fontSize: '0.72rem',
                        color: '#c084fc',
                        fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Splits (if split transaction) */}
          {transaction.splits && transaction.splits.length > 0 && (
            <div
              style={{
                padding: '0.875rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
              }}
            >
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5rem' }}>
                Split Breakdown
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                {transaction.splits.map((s, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>{s.category || 'Uncategorized'}</span>
                    <span style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: '0.82rem', color: cfg.color }}>{formatCurrency(s.amount, { currency: txCurrency })}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Receipt Image Preview */}
          {(transaction.receipt_url || transaction.receipt_uri) && (
            <div
              style={{
                padding: '0.875rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '0.5rem' }}>
                <Receipt size={13} />
                Attached Receipt
              </div>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ReceiptImage
                  value={transaction.receipt_url || transaction.receipt_uri}
                  thumb={transaction.receipt_thumb}
                  style={{ maxHeight: 180, width: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>
          )}

          {/* Merchant / Category History Snapshot */}
          {historySnapshot.count > 1 && (
            <div
              style={{
                padding: '0.875rem 1rem',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.06)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  History Snapshot · {historySnapshot.label}
                </span>
                <span style={{ fontSize: '0.7rem', fontFamily: 'Inter, sans-serif', fontWeight: 600, color: '#38bdf8' }}>
                  {historySnapshot.count} entries
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: historySnapshot.recentOthers.length > 0 ? '0.6rem' : 0 }}>
                <div style={{ padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>This Month</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'Inter, sans-serif' }}>
                    {formatCurrency(historySnapshot.thisMonthSum, { currency: txCurrency })}
                  </div>
                </div>
                <div style={{ padding: '0.45rem 0.65rem', background: 'rgba(255,255,255,0.025)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>Historical Avg</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', fontFamily: 'Inter, sans-serif' }}>
                    {formatCurrency(historySnapshot.avgAmount, { currency: txCurrency })}
                  </div>
                </div>
              </div>
              {historySnapshot.recentOthers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                  {historySnapshot.recentOthers.map(rt => (
                    <div key={rt.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif' }}>
                      <span>{formatDate(rt.date)}</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{formatCurrency(rt.amount, { currency: rt.currency || txCurrency })}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Official Voucher Download Button */}
        <button
          type="button"
          onClick={handleVoucher}
          disabled={voucherLoading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.7rem 1rem',
            borderRadius: 12,
            background: 'linear-gradient(135deg, rgba(129, 140, 248, 0.15), rgba(99, 102, 241, 0.15))',
            border: '1px solid rgba(129, 140, 248, 0.35)',
            color: '#c7d2fe',
            fontFamily: 'Inter, sans-serif',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: voucherLoading ? 'wait' : 'pointer',
            marginTop: '0.875rem',
            marginBottom: '0.5rem',
            transition: 'all 0.2s ease'
          }}
        >
          <FileText size={15} color="#818cf8" />
          {voucherLoading ? 'Generating Official Voucher...' : 'Download Official Voucher PDF'}
        </button>

        {transaction.reversed_at && <p role="status" style={{ fontSize: '0.82rem', color: '#fbbf24', textAlign: 'center', margin: '0.5rem 0' }}>Reversed on {transaction.reversed_at.slice(0, 10)}. Original record retained for audit.</p>}
        {transaction.is_transfer_fee && !transaction.reversed_at && (
          <p role="status" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0.35rem 0' }}>
            Transfer fees are managed automatically from the parent transfer.
          </p>
        )}
        {transaction.invoice_id && !transaction.reversed_at && (
          <p role="status" style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0.35rem 0' }}>
            Invoice payments are managed from the Invoices page.
          </p>
        )}
        {transaction.reversal_context && !transaction.reversed_at && !transaction.is_transfer_fee && (
          <div style={{ padding: '0.75rem', borderRadius: 10, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              ⚖️ Or create a formal audit reversal record:
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={reversalReason}
                onChange={e => setReversalReason(e.target.value)}
                placeholder="Why is this payment being reversed?"
                style={{ flex: 1, fontSize: '0.82rem', padding: '0.45rem 0.65rem', borderRadius: 8 }}
              />
              <button
                type="button"
                className="btn btn-secondary"
                disabled={reversing || !reversalReason.trim()}
                onClick={async () => {
                  setReversing(true);
                  try {
                    await reversePayment(transaction.id, reversalReason);
                    toast.success('Payment reversed; audit history retained');
                    setReversalReason('');
                    onClose();
                  } catch (error) {
                    toast.error(error.message);
                  } finally {
                    setReversing(false);
                  }
                }}
                style={{ fontSize: '0.78rem', padding: '0.45rem 0.75rem', whiteSpace: 'nowrap' }}
              >
                {reversing ? 'Reversing…' : 'Reverse payment'}
              </button>
            </div>
          </div>
        )}
        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onEdit && isEditableTransaction(transaction) && (
            <button
              type="button"
              onClick={handleEdit}
              className="btn btn-primary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem', fontSize: '0.85rem' }}
            >
              <Edit2 size={15} /> Edit
            </button>
          )}

          {onDuplicate && !transaction.is_transfer_fee && (
            <button
              type="button"
              onClick={handleDuplicate}
              className="btn btn-secondary"
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', padding: '0.75rem', fontSize: '0.85rem' }}
            >
              <Copy size={15} /> Duplicate
            </button>
          )}

          {onDelete && isEditableTransaction(transaction) && (
            <button
              type="button"
              onClick={handleDelete}
              className="btn"
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.75rem',
                fontSize: '0.85rem',
                background: 'rgba(239, 68, 68, 0.15)',
                color: '#f87171',
                border: '1px solid rgba(239, 68, 68, 0.3)',
              }}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default TransactionPopup;
