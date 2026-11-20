import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, X, Plus, Trash2, CheckCircle2, Play, AlertCircle, Edit3, ArrowRight, Sliders } from 'lucide-react';
import Modal from './Modal';
import { fetchRules, saveRule, deleteRule, fetchTransactions, batchUpdateTransactions } from '../utils/api';
import {
  RULE_FIELDS, RULE_OPERATORS, DEFAULT_RULES,
  evaluateRule, applyRuleActions, previewRulesBatch
} from '../utils/rulesEngine';
import { formatCurrency, haptic } from '../utils/format';
import toast from 'react-hot-toast';

const TAX_CATEGORIES = ['Business', 'Medical', 'Charity', 'Education', 'Home Office', 'Work Supplies'];

export default function RulesManagerModal({ isOpen, onClose }) {
  const [rules, setRules] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingRule, setEditingRule] = useState(null); // null when not editing
  const [previewData, setPreviewData] = useState(null); // when running retroactive rules
  const [applyingBatch, setApplyingBatch] = useState(false);
  const [testText, setTestText] = useState('');
  const [testAmount, setTestAmount] = useState('');

  // Load rules & transactions
  const loadData = async () => {
    setLoading(true);
    try {
      const [r, txs] = await Promise.all([fetchRules(), fetchTransactions()]);
      setRules(r || DEFAULT_RULES);
      setTransactions(txs || []);
    } catch {
  setRules(DEFAULT_RULES);
} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setEditingRule(null);
      setPreviewData(null);
    }
  }, [isOpen]);

  const handleToggleActive = async (rule) => {
    const updated = { ...rule, active: !rule.active };
    setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
    await saveRule(updated);
    haptic();
  };

  const handleDeleteRule = async (ruleId) => {
    if (!window.confirm('Delete this automation rule?')) return;
    setRules(prev => prev.filter(r => r.id !== ruleId));
    await deleteRule(ruleId);
    toast.success('Rule deleted');
    haptic();
  };

  const handleOpenNewRule = () => {
    setEditingRule({
      id: `rule_${Date.now()}`,
      name: '',
      active: true,
      matchMode: 'all',
      conditions: [{ field: 'description', operator: 'contains', value: '' }],
      actions: {
        set_category: '',
        add_tags: [],
        set_tax_deductible: false,
        tax_category: 'Business',
        notes_prefix: '',
      },
    });
    setTestText('');
    setTestAmount('');
  };

  const handleSaveEditor = async (e) => {
    e.preventDefault();
    if (!editingRule.name.trim()) {
      toast.error('Please give your rule a name');
      return;
    }
    if (!editingRule.conditions.length || !editingRule.conditions[0].value) {
      toast.error('Add at least one valid condition');
      return;
    }

    try {
      await saveRule(editingRule);
      setRules(prev => {
        const idx = prev.findIndex(r => r.id === editingRule.id);
        if (idx >= 0) {
          const c = [...prev];
          c[idx] = editingRule;
          return c;
        }
        return [editingRule, ...prev];
      });
      toast.success('Rule saved successfully! ⚡');
      haptic();
      setEditingRule(null);
    } catch {
  toast.error('Failed to save rule');
}
  };

  // Rule Test Simulator in editor
  const testMatchResult = useMemo(() => {
    if (!editingRule) return null;
    const mockTx = {
      notes: testText,
      description: testText,
      amount: parseFloat(testAmount) || 0,
      type: 'Expense',
      category: '',
    };
    const isMatch = evaluateRule(editingRule, mockTx);
    if (!isMatch) return { match: false };
    const simulated = applyRuleActions(editingRule, mockTx);
    return { match: true, simulated };
  }, [editingRule, testText, testAmount]);

  // Preview Retroactive Execution
  const handlePreviewRetroactive = () => {
    const preview = previewRulesBatch(rules, transactions);
    setPreviewData(preview);
    haptic();
  };

  const handleExecuteBatch = async () => {
    if (!previewData || previewData.matches.length === 0) return;
    setApplyingBatch(true);
    try {
      const updates = previewData.matches.map(m => ({
        id: m.id,
        changes: {
          category: m.updated.category,
          tags: m.updated.tags || [],
          is_tax_deductible: m.updated.is_tax_deductible || false,
          tax_category: m.updated.tax_category || null,
          notes: m.updated.notes || '',
        },
      }));

      const res = await batchUpdateTransactions(updates);
      toast.success(`Updated ${res.updated} transactions! ⚡`);
      haptic();
      setPreviewData(null);
      // Reload fresh transactions
      const fresh = await fetchTransactions();
      setTransactions(fresh);
    } catch {
  toast.error('Failed to batch update transactions');
} finally {
      setApplyingBatch(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚡ Automated Transaction Rules" maxWidth="820px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', color: 'var(--text-primary)' }}>

        {/* Top Header & Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Set up IFTTT-style rules to automatically categorize, tag, and flag incoming and existing transactions.
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handlePreviewRetroactive}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.45rem 0.85rem', borderRadius: 10, background: 'rgba(129,140,248,0.12)', color: '#818cf8', border: '1px solid rgba(129,140,248,0.25)' }}
            >
              <Play size={14} /> Run on Past Transactions
            </button>
            <button
              onClick={handleOpenNewRule}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', padding: '0.45rem 0.95rem', borderRadius: 10, background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}
            >
              <Plus size={14} /> New Rule
            </button>
          </div>
        </div>

        {/* Retroactive Preview Banner / Modal */}
        {previewData && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'rgba(129, 140, 248, 0.08)',
              border: '1px solid rgba(129, 140, 248, 0.3)',
              borderRadius: 14,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, fontSize: '0.9rem', color: '#818cf8' }}>
                <Zap size={16} /> Retroactive Rule Preview
              </div>
              <button onClick={() => setPreviewData(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={16} />
              </button>
            </div>

            {previewData.count === 0 ? (
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                All existing transactions already match active rules. No changes needed! ✨
              </p>
            ) : (
              <>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                  Found <strong>{previewData.count}</strong> transactions that can be auto-updated with your active rules:
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
                  {previewData.matches.slice(0, 15).map((m, idx) => (
                    <div key={m.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.25)', borderRadius: 8, fontSize: '0.8rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                        <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.original.notes || m.original.category || 'Transaction'} ({formatCurrency(m.original.amount)})
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#818cf8' }}>Matched: {m.matchedRules.join(', ')}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                        <span style={{ color: 'var(--text-secondary)', textDecoration: 'line-through' }}>{m.original.category || 'None'}</span>
                        <ArrowRight size={12} color="#4ade80" />
                        <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>{m.updated.category}</span>
                      </div>
                    </div>
                  ))}
                  {previewData.count > 15 && (
                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-secondary)', padding: '0.25rem' }}>
                      + {previewData.count - 15} more transactions
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
                  <button onClick={() => setPreviewData(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>Cancel</button>
                  <button
                    onClick={handleExecuteBatch}
                    disabled={applyingBatch}
                    className="btn btn-primary"
                    style={{ fontSize: '0.8rem', padding: '0.4rem 1rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}
                  >
                    {applyingBatch ? 'Applying Changes...' : `Apply Rules to ${previewData.count} Transactions`}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}

        {/* Rule Editor Modal / Drawer */}
        <AnimatePresence>
          {editingRule && (
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
                  <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.95rem', color: 'var(--mm-success)' }}>
                    <Sliders size={16} /> {editingRule.id.startsWith('rule_') && !rules.some(r => r.id === editingRule.id) ? 'Create Automation Rule' : 'Edit Automation Rule'}
                  </h4>
                  <button type="button" onClick={() => setEditingRule(null)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                </div>

                {/* Rule Name & Match Mode */}
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Rule Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Uber Rides → Transport"
                      value={editingRule.name}
                      onChange={e => setEditingRule(r => ({ ...r, name: e.target.value }))}
                      required
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Condition Logic</label>
                    <select
                      value={editingRule.matchMode}
                      onChange={e => setEditingRule(r => ({ ...r, matchMode: e.target.value }))}
                      style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    >
                      <option value="all">Match ALL (AND)</option>
                      <option value="any">Match ANY (OR)</option>
                    </select>
                  </div>
                </div>

                {/* Conditions (WHEN...) */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#818cf8', letterSpacing: '0.5px' }}>
                      WHEN (CONDITIONS)
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingRule(r => ({ ...r, conditions: [...r.conditions, { field: 'description', operator: 'contains', value: '' }] }))}
                      style={{ background: 'none', border: 'none', color: 'var(--mm-success)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                    >
                      <Plus size={12} /> Add Condition
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {editingRule.conditions.map((cond, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 2fr 32px', gap: '0.5rem', alignItems: 'center' }}>
                        <select
                          value={cond.field}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingRule(r => {
                              const c = [...r.conditions];
                              c[idx] = { ...c[idx], field: val };
                              return { ...r, conditions: c };
                            });
                          }}
                          style={{ padding: '0.45rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }}
                        >
                          {RULE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <select
                          value={cond.operator}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingRule(r => {
                              const c = [...r.conditions];
                              c[idx] = { ...c[idx], operator: val };
                              return { ...r, conditions: c };
                            });
                          }}
                          style={{ padding: '0.45rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }}
                        >
                          {RULE_OPERATORS.map(op => <option key={op.value} value={op.value}>{op.label}</option>)}
                        </select>
                        <input
                          type={cond.field === 'amount' ? 'number' : 'text'}
                          placeholder="Condition value..."
                          value={cond.value}
                          onChange={e => {
                            const val = e.target.value;
                            setEditingRule(r => {
                              const c = [...r.conditions];
                              c[idx] = { ...c[idx], value: val };
                              return { ...r, conditions: c };
                            });
                          }}
                          required
                          style={{ padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }}
                        />
                        <button
                          type="button"
                          disabled={editingRule.conditions.length <= 1}
                          onClick={() => setEditingRule(r => ({ ...r, conditions: r.conditions.filter((_, i) => i !== idx) }))}
                          style={{ background: 'none', border: 'none', color: editingRule.conditions.length > 1 ? 'var(--mm-danger)' : 'rgba(255,255,255,0.2)', cursor: editingRule.conditions.length > 1 ? 'pointer' : 'default', padding: 4 }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions (THEN...) */}
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: 12, border: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--mm-success)', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>
                    THEN PERFORM ACTIONS
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Set Category</label>
                      <input
                        type="text"
                        placeholder="e.g. 🚗 Transport, 🍔 Food"
                        value={editingRule.actions?.set_category || ''}
                        onChange={e => setEditingRule(r => ({ ...r, actions: { ...r.actions, set_category: e.target.value } }))}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>Add Tags (comma separated)</label>
                      <input
                        type="text"
                        placeholder="#commute, #work, #subscription"
                        value={(editingRule.actions?.add_tags || []).join(', ')}
                        onChange={e => {
                          const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                          setEditingRule(r => ({ ...r, actions: { ...r.actions, add_tags: tags } }));
                        }}
                        style={{ width: '100%', padding: '0.45rem 0.65rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.78rem' }}
                      />
                    </div>
                  </div>

                  {/* Tax Deductible Option */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem' }}>
                      <input
                        type="checkbox"
                        checked={!!editingRule.actions?.set_tax_deductible}
                        onChange={e => setEditingRule(r => ({ ...r, actions: { ...r.actions, set_tax_deductible: e.target.checked } }))}
                      />
                      <span>🏷️ Flag as Tax Deductible</span>
                    </label>
                    {editingRule.actions?.set_tax_deductible && (
                      <select
                        value={editingRule.actions?.tax_category || 'Business'}
                        onChange={e => setEditingRule(r => ({ ...r, actions: { ...r.actions, tax_category: e.target.value } }))}
                        style={{ padding: '0.25rem 0.5rem', borderRadius: 6, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(74,222,128,0.3)', color: 'var(--mm-success)', fontSize: '0.75rem' }}
                      >
                        {TAX_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    )}
                  </div>
                </div>

                {/* Live Rule Tester */}
                <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.75rem', borderRadius: 10, border: '1px dashed rgba(255,255,255,0.1)' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.4rem', fontWeight: 600 }}>
                    🧪 LIVE SIMULATOR: Test with sample transaction note:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="e.g. Uber trip to office"
                      value={testText}
                      onChange={e => setTestText(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem' }}
                    />
                    <input
                      type="number"
                      placeholder="Amount ($)"
                      value={testAmount}
                      onChange={e => setTestAmount(e.target.value)}
                      style={{ padding: '0.4rem 0.6rem', borderRadius: 6, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.75rem' }}
                    />
                  </div>
                  {testText && (
                    <div style={{ marginTop: '0.4rem', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {testMatchResult?.match ? (
                        <span style={{ color: 'var(--mm-success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CheckCircle2 size={13} /> Rule MATCHES! Category would become <strong>{testMatchResult.simulated.category || 'same'}</strong>
                          {testMatchResult.simulated.is_tax_deductible && ` (Tax: ${testMatchResult.simulated.tax_category})`}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <AlertCircle size={13} /> No match with current conditions.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button type="button" onClick={() => setEditingRule(null)} className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}>Cancel</button>
                  <button type="submit" className="btn btn-primary" style={{ fontSize: '0.8rem', padding: '0.4rem 1.1rem', background: 'linear-gradient(135deg, #4ade80, #22c55e)', color: '#0f172a', fontWeight: 600, border: 'none' }}>
                    Save Rule
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Existing Rules List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', letterSpacing: '1px', textTransform: 'uppercase', fontWeight: 600 }}>
              Active Rules ({rules.filter(r => r.active).length} of {rules.length})
            </span>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading rules...</div>
          ) : rules.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', background: 'rgba(255,255,255,0.02)', borderRadius: 12, color: 'var(--text-secondary)' }}>
              No automation rules created yet. Click "+ New Rule" to create your first rule!
            </div>
          ) : (
            rules.map(rule => (
              <motion.div
                key={rule.id}
                layout
                style={{
                  background: rule.active ? 'rgba(37, 37, 64, 0.6)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${rule.active ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.03)'}`,
                  borderRadius: 12,
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '0.75rem',
                  opacity: rule.active ? 1 : 0.6,
                  transition: 'border-color 0.2s',
                }}
              >
                {/* Left Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: 1 }}>
                  {/* Toggle Checkbox */}
                  <button
                    onClick={() => handleToggleActive(rule)}
                    style={{
                      width: 22, height: 22, borderRadius: 6,
                      background: rule.active ? 'var(--mm-success)' : 'rgba(255,255,255,0.1)',
                      border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0
                    }}
                    title={rule.active ? 'Deactivate rule' : 'Activate rule'}
                  >
                    {rule.active && <CheckCircle2 size={16} color="#0f172a" />}
                  </button>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.88rem', color: rule.active ? '#f0f0f5' : '#9191ab' }}>
                        {rule.name}
                      </span>
                      <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(129,140,248,0.15)', color: '#818cf8', fontWeight: 600 }}>
                        {rule.matchMode === 'any' ? 'ANY' : 'ALL'}
                      </span>
                      {rule.actions?.set_tax_deductible && (
                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: 4, background: 'rgba(74,222,128,0.15)', color: 'var(--mm-success)', fontWeight: 600 }}>
                          🏷️ Tax Deductible
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
                      <span>If</span>
                      {rule.conditions.map((c, i) => (
                        <span key={i} style={{ color: '#cbd5e1', background: 'rgba(255,255,255,0.04)', padding: '0 4px', borderRadius: 4 }}>
                          {c.field} {c.operator.replace('_', ' ')} "{c.value}"
                          {i < rule.conditions.length - 1 ? (rule.matchMode === 'any' ? ' OR ' : ' AND ') : ''}
                        </span>
                      ))}
                      <ArrowRight size={11} color="#4ade80" />
                      {rule.actions?.set_category && (
                        <span style={{ color: 'var(--mm-success)', fontWeight: 600 }}>{rule.actions.set_category}</span>
                      )}
                      {rule.actions?.add_tags?.map(t => (
                        <span key={t} style={{ color: '#a78bfa', fontSize: '0.7rem' }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setTestText('');
                      setTestAmount('');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                    title="Edit rule"
                  >
                    <Edit3 size={15} />
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--mm-danger)', cursor: 'pointer', padding: 6, borderRadius: 6 }}
                    title="Delete rule"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </div>

      </div>
    </Modal>
  );
}
