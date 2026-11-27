import React, { useState, useEffect, useMemo } from 'react';
import { invoiceTotals } from '../utils/invoiceTotals';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Plus, Trash2, Download, CheckCircle2, Edit3 } from 'lucide-react';
import Modal from './Modal';
import { fetchInvoices, saveInvoice, deleteInvoice, fetchAccounts, settleInvoice } from '../utils/api';
import { formatCurrency, getCurrency, SUPPORTED_CURRENCIES, haptic } from '../utils/format';
import toast from 'react-hot-toast';
import { toYMD, todayYMD } from '../utils/dates';

const STATUS_COLORS = {
  Paid: { bg: 'rgba(74,222,128,0.15)', text: '#4ade80', border: 'rgba(74,222,128,0.3)' },
  Sent: { bg: 'rgba(251,191,36,0.15)', text: '#fbbf24', border: 'rgba(251,191,36,0.3)' },
  Draft: { bg: 'rgba(148,163,184,0.15)', text: '#94a3b8', border: 'rgba(148,163,184,0.3)' },
  Overdue: { bg: 'rgba(248,113,113,0.15)', text: '#f87171', border: 'rgba(248,113,113,0.3)' },
};

export default function InvoiceModal({ isOpen, onClose }) {
  const [settlement, setSettlement] = useState(null);
  const [settling, setSettling] = useState(false);
  const [receivingAccount, setReceivingAccount] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('All');
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [generatingPDFId, setGeneratingPDFId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [invs, accs] = await Promise.all([fetchInvoices(), fetchAccounts()]);
      setAccounts(accs || []);

      setInvoices(invs || []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setEditingInvoice(null);
    }
  }, [isOpen]);

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'All') return invoices;
    return invoices.filter(i => i.status === statusFilter);
  }, [invoices, statusFilter]);

  // Open New Invoice Editor
  const handleOpenNew = () => {
    const nextNum = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`;
    setEditingInvoice({
      id: `inv_${Date.now()}`,
      invoiceNumber: nextNum,
      status: 'Draft',
      currency: getCurrency(),
      issueDate: todayYMD(),
      dueDate: toYMD(new Date(Date.now() + 14 * 86400000)),
      senderName: localStorage.getItem('vm_user_name') || 'Freelance Services',
      senderEmail: '',
      senderAddress: '',
      clientName: '',
      clientCompany: '',
      clientEmail: '',
      clientAddress: '',
      taxRate: 0,
      paymentNotes: 'Please deposit into primary bank account within terms.',
      items: [{ description: '', quantity: 1, unitPrice: 0 }],
    });
  };

  // Save Invoice
  const handleSaveEditor = async (e) => {
    e.preventDefault();
    if (!editingInvoice.clientName.trim()) {
      toast.error('Client name is required');
      return;
    }
    if (!editingInvoice.items || editingInvoice.items.length === 0) {
      toast.error('Add at least one line item');
      return;
    }

    try {
      await saveInvoice(editingInvoice);
      setInvoices(prev => {
        const idx = prev.findIndex(i => i.id === editingInvoice.id);
        if (idx >= 0) {
          const c = [...prev];
          c[idx] = editingInvoice;
          return c;
        }
        return [editingInvoice, ...prev];
      });
      toast.success('Invoice saved successfully! 📄');
      haptic();
      setEditingInvoice(null);
    } catch (error) {
  toast.error(error.message || 'Failed to save invoice');
}
  };

  // Download PDF
  const handleDownloadPDF = async (inv) => {
    setGeneratingPDFId(inv.id);
    try {
      const { generateInvoicePDF } = await import('../utils/pdfReport');
      await generateInvoicePDF(inv);
      toast.success('Invoice PDF generated! 📥');
      haptic();
    } catch (err) {
      toast.error(err?.message || 'Failed to generate PDF');
    } finally {
      setGeneratingPDFId(null);
    }
  };

  const handleMarkAsPaid = inv => {
    setSettlement(inv);
    setReceivingAccount(accounts.find(a => !a.archived && (a.currency || 'LKR') === (inv.currency || 'LKR'))?.id || '');
  };
  const confirmSettlement = async () => {
    setSettling(true);
    try {
      await settleInvoice(settlement.id, receivingAccount);
      toast.success('Invoice settled and deposit recorded');
      setSettlement(null); await loadData();
    } catch (error) { toast.error(error.message || 'Could not settle invoice'); }
    finally { setSettling(false); }
  };
  const handleDeleteInvoice = async invId => {
    if (!window.confirm('Delete this invoice?')) return;
    try { await deleteInvoice(invId); await loadData(); toast.success('Invoice deleted'); }
    catch (error) { toast.error(error.message || 'Could not delete invoice'); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="💼 Freelancer & Business Invoicing Suite" maxWidth="880px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>

        {settlement && <section className="glass-panel" style={{padding:16}} aria-label="Invoice settlement">
          <h3>Receive payment for {settlement.invoiceNumber}</h3>
          <p>Select the account that received this payment. Currency: {settlement.currency || 'LKR'}. A deposit and paid status will be saved together.</p>
          <label>Receiving account<select aria-label="Receiving account" value={receivingAccount} disabled={settling} onChange={e => setReceivingAccount(e.target.value)}>
            <option value="">Choose an account</option>
            {accounts.filter(a => !a.archived && (a.currency || 'LKR') === (settlement.currency || 'LKR')).map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency || 'LKR'})</option>)}
          </select></label>
          <button className="btn btn-primary" disabled={settling || !receivingAccount} onClick={confirmSettlement}>{settling ? 'Recording…' : 'Confirm deposit'}</button>
          <button className="btn btn-secondary" disabled={settling} onClick={() => setSettlement(null)}>Cancel</button>
        </section>}
        <p>Invoice changes and settlement require a connection. Previously saved invoices remain available for viewing offline.</p>
        {/* Top Control Strip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.75rem' }}>
          {/* Status Filter Chips */}
          <div style={{ display: 'flex', gap: '0.4rem', overflowX: 'auto' }}>
            {['All', 'Sent', 'Draft', 'Paid', 'Overdue'].map(st => (
              <button
                key={st}
                onClick={() => { setStatusFilter(st); haptic(); }}
                style={{
                  padding: '0.35rem 0.75rem',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: statusFilter === st ? '1px solid rgba(74,222,128,0.4)' : '1px solid rgba(255,255,255,0.06)',
                  background: statusFilter === st ? 'rgba(74,222,128,0.12)' : 'rgba(255,255,255,0.02)',
                  color: statusFilter === st ? 'var(--mm-success)' : '#9191ab',
                  transition: 'all 0.15s',
                }}
              >
                {st}
              </button>
            ))}
          </div>

          <button
            onClick={handleOpenNew}
            className="btn btn-primary"
            style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.8rem', padding: '0.45rem 1rem',
              background: 'linear-gradient(135deg, #4ade80, #22c55e)',
              color: '#0f172a', fontWeight: 600, border: 'none'
            }}
          >
            <Plus size={15} /> Create Invoice
          </button>
        </div>

        {/* Invoice Editor Modal */}
        <AnimatePresence>
          {editingInvoice && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                background: 'rgba(30, 30, 50, 0.95)',
                border: '1px solid rgba(74, 222, 128, 0.3)',
                borderRadius: 16,
                padding: '1.25rem',
                overflow: 'hidden'
              }}
            >
              <form onSubmit={handleSaveEditor} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: 'var(--mm-success)', fontSize: '1rem' }}>
                    {editingInvoice.id.startsWith('inv_') && !invoices.some(i => i.id === editingInvoice.id) ? 'Create New Invoice' : 'Edit Invoice'}
                  </h4>
                  <button type="button" onClick={() => setEditingInvoice(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    ✕
                  </button>
                </div>

                {/* Metadata Row: Number, Status, Issue Date, Due Date */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Invoice #</label>
                    <input
                      type="text"
                      value={editingInvoice.invoiceNumber}
                      onChange={e => setEditingInvoice(i => ({ ...i, invoiceNumber: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Status</label>
                    <select
                      value={editingInvoice.status}
                      onChange={e => setEditingInvoice(i => ({ ...i, status: e.target.value }))}
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.82rem' }}
                    >
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>

                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Issue Date</label>
                    <input
                      type="date"
                      value={editingInvoice.issueDate}
                      onChange={e => setEditingInvoice(i => ({ ...i, issueDate: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.82rem' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Due Date</label>
                    <input
                      type="date"
                      value={editingInvoice.dueDate}
                      onChange={e => setEditingInvoice(i => ({ ...i, dueDate: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>

                <label>Invoice currency<select aria-label="Invoice currency" value={editingInvoice.currency || 'LKR'} onChange={e => setEditingInvoice(i => ({...i,currency:e.target.value}))}>{SUPPORTED_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}</select></label>
                {/* Client Info Grid */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#818cf8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Client Information</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.65rem' }}>
                    <div>
                      <input
                        type="text"
                        placeholder="Client Name *"
                        value={editingInvoice.clientName}
                        onChange={e => setEditingInvoice(i => ({ ...i, clientName: e.target.value }))}
                        required
                        style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder="Client Company"
                        value={editingInvoice.clientCompany || ''}
                        onChange={e => setEditingInvoice(i => ({ ...i, clientCompany: e.target.value }))}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <input
                        type="email"
                        placeholder="Client Email"
                        value={editingInvoice.clientEmail || ''}
                        onChange={e => setEditingInvoice(i => ({ ...i, clientEmail: e.target.value }))}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>
                </div>

                {/* Line Items Builder */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--mm-success)', textTransform: 'uppercase' }}>Line Items</div>
                    <button
                      type="button"
                      onClick={() => setEditingInvoice(i => ({ ...i, items: [...i.items, { description: '', quantity: 1, unitPrice: 0 }] }))}
                      style={{ background: 'none', border: 'none', color: 'var(--mm-success)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Plus size={12} /> Add Item
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {editingInvoice.items.map((item, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1.5fr 32px', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type="text"
                          placeholder="Description of service..."
                          value={item.description}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingInvoice(inv => {
                              const arr = [...inv.items];
                              arr[idx] = { ...arr[idx], description: val };
                              return { ...inv, items: arr };
                            });
                          }}
                          required
                          style={{ padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                        />
                        <input
                          type="number"
                          placeholder="Qty/Hrs"
                          min="0.1"
                          step="any"
                          value={item.quantity}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingInvoice(inv => {
                              const arr = [...inv.items];
                              arr[idx] = { ...arr[idx], quantity: val };
                              return { ...inv, items: arr };
                            });
                          }}
                          required
                          style={{ padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                        />
                        <input
                          type="number"
                          placeholder="Unit Rate"
                          min="0"
                          step="any"
                          value={item.unitPrice}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setEditingInvoice(inv => {
                              const arr = [...inv.items];
                              arr[idx] = { ...arr[idx], unitPrice: val };
                              return { ...inv, items: arr };
                            });
                          }}
                          required
                          style={{ padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.8rem' }}
                        />
                        <button
                          type="button"
                          disabled={editingInvoice.items.length <= 1}
                          onClick={() => setEditingInvoice(inv => ({ ...inv, items: inv.items.filter((_, i) => i !== idx) }))}
                          style={{ background: 'none', border: 'none', color: editingInvoice.items.length > 1 ? 'var(--mm-danger)' : 'rgba(255,255,255,0.2)', cursor: editingInvoice.items.length > 1 ? 'pointer' : 'default', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Totals Preview in Editor */}
                  {(() => {
                    const { total: grandTotal, valid: totalsValid } = invoiceTotals(editingInvoice);
                    return (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.05)', gap: '1.5rem', fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Tax %:</span>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editingInvoice.taxRate}
                            onChange={e => setEditingInvoice(i => ({ ...i, taxRate: parseFloat(e.target.value) || 0 }))}
                            style={{ width: 55, padding: '0.25rem 0.4rem', borderRadius: 4, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem' }}
                          />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Total:</span>
                          <strong style={{ color: 'var(--mm-success)', fontSize: '1rem' }}>{formatCurrency(grandTotal, {currency:editingInvoice.currency || 'LKR'})}</strong>
                        </div>
                        {!totalsValid && <span role="alert" style={{ color: 'var(--mm-danger)', alignSelf: 'center' }}>Every line needs a quantity above 0.</span>}
                      </div>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setEditingInvoice(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 1.1rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}>
                    Save Invoice
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Invoices List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading invoices...</div>
          ) : filteredInvoices.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, color: 'var(--text-secondary)' }}>
              No invoices found for status "{statusFilter}". Click "+ Create Invoice" to issue a client invoice!
            </div>
          ) : (
            filteredInvoices.map(inv => {
              const { total: grandTotal } = invoiceTotals(inv);
              const statusCfg = STATUS_COLORS[inv.status] || STATUS_COLORS.Draft;

              return (
                <div
                  key={inv.id}
                  style={{
                    background: 'rgba(37,37,64,0.6)',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.75rem',
                  }}
                >
                  {/* Left Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', flexShrink: 0 }}>
                      <FileText size={18} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                          {inv.clientName}
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#818cf8', fontWeight: 600 }}>
                          #{inv.invoiceNumber}
                        </span>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            padding: '1px 8px',
                            borderRadius: 12,
                            background: statusCfg.bg,
                            color: statusCfg.text,
                            border: `1px solid ${statusCfg.border}`,
                            fontWeight: 700,
                            textTransform: 'uppercase',
                          }}
                        >
                          {inv.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <span>Issued: {inv.issueDate}</span>
                        <span>Due: <strong style={{ color: inv.status === 'Overdue' ? 'var(--mm-danger)' : '#cbd5e1' }}>{inv.dueDate}</strong></span>
                        <span>({inv.items?.length || 1} line items)</span>
                      </div>
                    </div>
                  </div>

                  {/* Right Actions & Amount */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {formatCurrency(grandTotal, {currency:inv.currency || 'LKR'})}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--mm-success)' }}>
                        {inv.status === 'Paid' ? 'Deposit settled' : 'Net receivable'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {inv.status !== 'Paid' && (
                        <button
                          onClick={() => handleMarkAsPaid(inv)}
                          title="Mark as Paid & log deposit"
                          style={{
                            background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)',
                            color: 'var(--mm-success)', borderRadius: 8, padding: '0.4rem 0.65rem',
                            fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                          }}
                        >
                          <CheckCircle2 size={13} /> Settle
                        </button>
                      )}

                      <button
                        onClick={() => handleDownloadPDF(inv)}
                        disabled={generatingPDFId === inv.id}
                        title="Download official PDF"
                        style={{
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#cbd5e1', borderRadius: 8, padding: '0.4rem 0.65rem',
                          fontSize: '0.74rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                        }}
                      >
                        <Download size={13} /> {generatingPDFId === inv.id ? 'PDF...' : 'PDF'}
                      </button>

                      <button
                        disabled={inv.status === 'Paid'}
                        onClick={() => setEditingInvoice(inv)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6 }}
                        title="Edit invoice"
                      >
                        <Edit3 size={15} />
                      </button>

                      <button
                        onClick={() => handleDeleteInvoice(inv.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--mm-danger)', cursor: 'pointer', padding: 6 }}
                        title="Delete invoice"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </Modal>
  );
}
