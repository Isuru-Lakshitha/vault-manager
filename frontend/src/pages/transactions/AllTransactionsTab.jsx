import { TYPE_COLOR, TYPE_BG } from '../transactions/constants';
import { getCategories } from '../transactions/categories';
import { StatCard } from '../../components/ui';
import ToolMenu from '../../components/ToolMenu';
import { auditStatus, isActivePayment, isEditableTransaction } from '../../utils/ledgerReporting.js';
import { Edit2, Trash2, Search, Filter, ArrowUpDown, X, Copy, Brain } from 'lucide-react';
import ReceiptImage from '../../components/ReceiptImage';
import TransactionInsights from '../../components/TransactionInsights';
import getCategoryEmoji from '../../utils/categoryEmoji';
import { motion } from 'framer-motion';
import { haptic } from '../../utils/format';
import { formatCurrency } from '../../utils/format';
import { todayYMD } from '../../utils/dates';

const Highlight = ({ text, query }) => {
  if (!query || !text) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background:'rgba(0,245,255,0.25)', color:'#00f5ff', borderRadius:2, padding:'0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
};

// Transactions → 'All' tab: summary strip, filters, search and the transaction list.
export default function AllTransactionsTab({ accounts, anomalyCount, anomalyMap, applyView, auditFilter, bulkMode, bulkValue, cancelQuickEdit, compact, createSuggestedReminder, dateFrom, dateTo, deleteView, dismissSuggestion, duplicateTx, filterAccount, filterAnomalies, filterTag, filterTaxDeductible, filterType, filtered, formatGroupDate, getAccountName, grouped, handleBulkDelete, handleBulkEdit, handleExportCSV, handleExportExcel, handlePreset, hasActiveFilters, isMobile, loading, maxAmt, minAmt, openEditModal, quickCat, quickEditId, quickNotes, recurringSuggestion, rememberedNotes, runningBalanceMap, saveQuickEdit, saveView, savedViews, savingView, searchQuery, selectedIds, setAuditFilter, setBulkMode, setBulkValue, setConfirm, setDateFrom, setDateTo, setFilterAccount, setFilterAnomalies, setFilterTag, setFilterTaxDeductible, setFilterType, setMaxAmt, setMinAmt, setPopupTx, setQuickCat, setQuickNotes, setSavingView, setSearchQuery, setSelectedIds, setSortBy, setViewName, setVisibleLimit, showInsights, sortBy, startQuickEdit, stats, toggleCompact, toggleInsights, transactions, typeCounts, viewName, visibleFiltered }) {
  return (
    <>
      <>
        {/* Summary strip */}
        <motion.div className="monthly-strip stat-grid" initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}} style={{ marginBottom:'1.25rem' }}>
          <StatCard label={stats.isAccountView ? 'Inflow' : 'Income'} value={stats.income == null ? '—' : `+${formatCurrency(stats.income)}`} tone="pos" />
          <StatCard label={stats.isAccountView ? 'Outflow' : 'Expenses'} value={stats.expense == null ? '—' : `-${formatCurrency(stats.expense)}`} tone="neg" />
          <StatCard label={stats.isAccountView ? 'Net movement' : 'Net'} value={stats.net == null ? '—' : `${stats.net >= 0 ? '+' : ''}${formatCurrency(stats.net)}`} tone={(stats.net ?? 0) >= 0 ? 'pos' : 'neg'} />
          <StatCard label="Records" value={stats.count} tone="accent" />
          {(stats.converted || stats.unavailable || stats.loadingRates) && (
            <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              {stats.loadingRates
                ? 'Converting other currencies…'
                : stats.unavailable
                ? 'Totals hidden: some rows are in another currency and exchange rates are unavailable. Reconnect to see them.'
                : 'Totals include other currencies, converted at current exchange rates.'}
            </p>
          )}
          {/* Daily Spend Limit badge */}
          {(() => {
            const limit = parseFloat(localStorage.getItem('vm_daily_limit') || '0');
            if (!limit) return null;
            const todayStr = todayYMD();
            const todaySpend = transactions.filter(isActivePayment).filter(t => ['Expense', 'Loan Payment'].includes(t.type) && t.date === todayStr).reduce((s, t) => s + (Number(t.amount) || 0), 0);
            const pct = Math.round((todaySpend / limit) * 100);
            const over = todaySpend > limit;
            return (
              <div className="monthly-strip-item" style={{ borderLeft: `2px solid ${over ? '#f87171' : '#fb923c'}33` }}>
                <div className="monthly-strip-label" style={{ color: over ? 'var(--mm-danger)' : '#fb923c' }}>TODAY {over ? '🔴 OVER' : `${pct}%`}</div>
                <div className="monthly-strip-value" style={{ color: over ? 'var(--mm-danger)' : '#fb923c', fontSize:'0.85rem' }}>{formatCurrency(todaySpend)} / {formatCurrency(limit)}</div>
              </div>
            );
          })()}
        </motion.div>

        {showInsights && <TransactionInsights rows={filtered} activeSearch={searchQuery} onPickCategory={setSearchQuery} />}

        {recurringSuggestion && (
          <div className="tx-suggest" role="status">
            <span>Looks recurring: <b>{recurringSuggestion.notes || recurringSuggestion.category}</b> · ~{formatCurrency(recurringSuggestion.amount)} monthly ({recurringSuggestion.count}×)</span>
            <span className="tx-suggest-actions">
              <button type="button" className="tx-chip is-on" onClick={createSuggestedReminder}>Create reminder</button>
              <button type="button" className="tx-chip" onClick={dismissSuggestion} aria-label="Dismiss suggestion">Dismiss</button>
            </span>
          </div>
        )}

        <div className="tx-toolbar">
          <div className="tx-seg" role="tablist" aria-label="Transaction type">
            {['All', 'Expense', 'Income', 'Transfer', 'Loan Payment'].map(t => (
              <button key={t} type="button" role="tab" aria-selected={filterType === t} className={filterType === t ? 'is-on' : ''} onClick={() => { haptic(); setFilterType(t); }}>
                {t === 'Loan Payment' ? 'Loans' : t}<i>{typeCounts[t]}</i>
              </button>
            ))}
          </div>
          <div className="tx-tools">
            <select
              aria-label="Filter by account"
              className={`tx-chip${filterAccount !== 'All' ? ' is-on' : ''}`}
              value={filterAccount}
              onChange={e => { haptic(); setFilterAccount(e.target.value); }}
              style={{ cursor: 'pointer', maxWidth: 210 }}
            >
              <option value="All">🏦 All Accounts</option>
              {accounts.map(a => (
                <option key={a.id} value={String(a.id)}>
                  {a.name} ({formatCurrency(a.balance)})
                </option>
              ))}
            </select>
            <button type="button" className={`tx-chip${showInsights ? ' is-on' : ''}`} onClick={toggleInsights} aria-pressed={showInsights}>📊 Insights</button>
            <button type="button" className={`tx-chip${compact ? ' is-on' : ''}`} onClick={toggleCompact} aria-pressed={compact}>☰ Compact</button>
            <button type="button" className="tx-chip" onClick={() => setSelectedIds(prev => prev.size === visibleFiltered.length ? new Set() : new Set(visibleFiltered.map(t => t.id)))}>
              {selectedIds.size && selectedIds.size === visibleFiltered.length ? 'Deselect all' : `Select all (${visibleFiltered.length})`}
            </button>
            <ToolMenu label="Export" className="is-chip">
              <button type="button" className="btn" onClick={handleExportCSV} title="Export filtered or selected rows to CSV with summary footer">
                CSV {selectedIds.size > 0 ? `· selected rows (${selectedIds.size})` : `· all rows (${filtered.length})`}
              </button>
              <button type="button" className="btn" onClick={handleExportExcel} title="Export filtered or selected rows to Excel (.xlsx) with category summary sheet">
                Excel workbook (.xlsx)
              </button>
            </ToolMenu>
            <span className="kbd-hint" title="Shortcuts"><kbd>N</kbd> new · <kbd>/</kbd> search</span>
          </div>
        </div>

        {(savedViews.length > 0 || hasActiveFilters || savingView) && <div className="tx-views" aria-label="Saved views">
          {savedViews.map(v => (
            <span key={v.id} className="tx-view">
              <button type="button" onClick={() => applyView(v)} title="Apply view">{v.name}</button>
              <button type="button" onClick={() => deleteView(v.id)} aria-label={`Delete view ${v.name}`}>×</button>
            </span>
          ))}
          {savingView ? (
            <form onSubmit={saveView} className="tx-view-form">
              <input autoFocus aria-label="View name" placeholder="View name" value={viewName} maxLength={30} onChange={e => setViewName(e.target.value)} />
              <button type="submit" className="tx-chip is-on">Save</button>
              <button type="button" className="tx-chip" onClick={() => { setSavingView(false); setViewName(''); }}>Cancel</button>
            </form>
          ) : (
            <button type="button" className="tx-chip" disabled={!hasActiveFilters} onClick={() => setSavingView(true)}>＋ Save view</button>
          )}
        </div>}

        {/* Filter bar */}
        <div className="filter-scroll-row quiet-filter-row" style={{ marginBottom:'1.25rem', alignItems:'stretch' }}>
          {/* Search */}
          <div style={{ display:'flex', flex:'1 1 200px', alignItems:'center', gap:'0.625rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
            <Search size={16} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
            <input type="text" aria-label="Search transactions" placeholder="Search category, notes, account…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
              style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.875rem', flex:1, minWidth:0 }}/>
            {searchQuery && <button aria-label="Clear search" onClick={()=>setSearchQuery('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-secondary)', flexShrink:0 }}><X size={14}/></button>}
          </div>
          <details className="quiet-section quiet-filter-panel">
            <summary>Filters & sorting <span>{dateFrom || dateTo || filterType !== 'All' || auditFilter !== 'All' || minAmt || maxAmt || filterTag || filterTaxDeductible || filterAnomalies ? 'Filters applied' : 'Optional'}</span></summary>
            <div className="quiet-filter-controls">
          {/* Date Range & Presets */}
          {/* Dates take a full row on phones; the presets wrap underneath at full width. */}
          <div style={{ display:'flex', flexWrap:'wrap', gap:'0.5rem' }}>
            <div style={{ display:'flex', flex:'1 1 100%', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
              <input type="date" aria-label="Date from" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text-primary)', fontSize:'0.82rem', flex:1, minWidth:0 }}/>
              <span style={{ color:'var(--text-muted)' }}>-</span>
              <input type="date" aria-label="Date to" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ background:'transparent', border:'none', color:'var(--text-primary)', fontSize:'0.82rem', flex:1, minWidth:0 }}/>
            </div>
            {['All', 'This Month', 'Last 30d', 'Last 3mo', 'This Year'].map(p => (
              <button key={p} onClick={() => handlePreset(p)} className="btn btn-secondary" style={{ whiteSpace:'nowrap', flex:'1 0 auto', padding: '0.5rem 0.8rem', fontSize: '0.75rem', background: (p === 'All' && !dateFrom) || (p !== 'All' && dateFrom) ? 'rgba(255,255,255,0.05)' : undefined }}>{p}</button>
            ))}
          </div>
          {/* Type */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem', minWidth:130 }}>
            <Filter size={14} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
            <select aria-label="Filter by transaction type" value={filterType} onChange={e=>setFilterType(e.target.value)}
              style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.82rem', color:'var(--text-primary)', cursor:'pointer' }}>
              {['All','Expense','Income','Transfer','Loan Payment'].map(t=><option key={t} value={t} style={{ background:'var(--bg-deep)' }}>{t}</option>)}
            </select>
          </div>
          <label>Audit status <select aria-label="Audit status" value={auditFilter} onChange={e => setAuditFilter(e.target.value)}>{['All','Active','Reversed','Reversal'].map(status => <option key={status}>{status}</option>)}</select></label>
          {/* Sort */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem', minWidth:130 }}>
            <ArrowUpDown size={14} style={{ color:'var(--text-secondary)', flexShrink:0 }}/>
            <select aria-label="Sort transactions" value={sortBy} onChange={e=>setSortBy(e.target.value)}
              style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, fontSize:'0.82rem', color:'var(--text-primary)', cursor:'pointer' }}>
              {['Newest','Oldest','Highest Amount','Lowest Amount'].map(s=><option key={s} value={s} style={{ background:'var(--bg-deep)' }}>{s}</option>)}
            </select>
          </div>
          {/* Amount range */}
          <div style={{ display:'flex', alignItems:'center', gap:'0.4rem', background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'0.6rem 1rem' }}>
            <span style={{ fontSize:'0.75rem', color:'var(--text-muted)', whiteSpace:'nowrap' }}>💰</span>
            <input type="number" inputMode="decimal" aria-label="Minimum amount" placeholder="Min" value={minAmt} onChange={e=>setMinAmt(e.target.value)}
              style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, width:72, fontSize:'0.8rem', color:'var(--text-primary)' }}/>
            <span style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>–</span>
            <input type="number" inputMode="decimal" aria-label="Maximum amount" placeholder="Max" value={maxAmt} onChange={e=>setMaxAmt(e.target.value)}
              style={{ background:'transparent', border:'none', boxShadow:'none', padding:0, width:72, fontSize:'0.8rem', color:'var(--text-primary)' }}/>
          </div>
          {/* Active tag filter pill */}
          {filterTag && (
            <button onClick={() => setFilterTag('')}
              style={{ display:'flex', alignItems:'center', gap:'0.3rem', background:'rgba(168,85,247,0.15)', border:'1px solid rgba(168,85,247,0.4)', borderRadius:100, padding:'0.4rem 0.75rem', color:'#c084fc', fontSize:'0.75rem', cursor:'pointer', whiteSpace:'nowrap' }}>
              #{filterTag} ✕
            </button>
          )}
          {/* Tax Deductible filter pill */}
          <button
            onClick={() => setFilterTaxDeductible(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: filterTaxDeductible ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterTaxDeductible ? 'rgba(74,222,128,0.45)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 100, padding: '0.4rem 0.8rem',
              color: filterTaxDeductible ? '#4ade80' : 'var(--text-secondary)',
              fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
            }}
          >
            🏷️ Tax Deductible {filterTaxDeductible ? '✓' : ''}
          </button>
          {/* Duplicates & Spikes filter pill */}
          <button
            onClick={() => { haptic(); setFilterAnomalies(prev => !prev); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.35rem',
              background: filterAnomalies ? 'rgba(251,191,36,0.18)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${filterAnomalies ? 'rgba(251,191,36,0.5)' : anomalyCount > 0 ? 'rgba(251,191,36,0.28)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 100, padding: '0.4rem 0.8rem',
              color: filterAnomalies ? '#fbbf24' : anomalyCount > 0 ? '#fcd34d' : 'var(--text-secondary)',
              fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s'
            }}
            title="Scan for suspected duplicate transactions or unusual spend spikes"
          >
            🔍 Duplicates & Spikes {anomalyCount > 0 ? `(${anomalyCount})` : ''} {filterAnomalies ? '✓' : ''}
          </button>
            </div>
          </details>
        </div>

        {rememberedNotes.length > 0 && <details className="quiet-section"><summary>Saved note searches</summary><div className="quiet-section-content">
        {/* Remembered Notes Quick Search Row */}
        {rememberedNotes.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', gap:'0.45rem', marginBottom:'1.25rem', overflowX:'auto', WebkitOverflowScrolling:'touch', paddingBottom:'4px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', fontSize:'0.72rem', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'1px', whiteSpace:'nowrap', flexShrink:0 }}>
              <Brain size={14} style={{ color:'var(--cyan, #4ade80)' }} />
              <span>Notes Memory:</span>
            </div>
            {rememberedNotes.slice(0, 10).map(item => {
              const isSelected = searchQuery.toLowerCase().trim() === item.text.toLowerCase().trim();
              return (
                <button
                  key={item.text}
                  type="button"
                  onClick={() => {
                    haptic();
                    setSearchQuery(isSelected ? '' : item.text);
                  }}
                  style={{
                    display:'inline-flex', alignItems:'center', gap:'0.35rem',
                    padding:'0.35rem 0.7rem', borderRadius:100,
                    background: isSelected ? 'rgba(74,222,128,0.18)' : 'rgba(255,255,255,0.03)',
                    border: isSelected ? '1px solid rgba(74,222,128,0.5)' : '1px solid rgba(255,255,255,0.07)',
                    color: isSelected ? 'var(--mm-success)' : 'var(--text-secondary)',
                    fontSize:'0.75rem', fontWeight: isSelected ? 600 : 400,
                    cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
                    transition:'all 0.15s ease',
                  }}
                  title={`Filter by note "${item.text}" (${item.count} txns)`}
                >
                  <span>{item.text}</span>
                  <span style={{ fontSize:'0.65rem', opacity:0.65, borderRadius:6, background:'rgba(255,255,255,0.06)', padding:'0 0.3rem' }}>
                    {item.count}
                  </span>
                  {isSelected && <X size={11} style={{ marginLeft: 2 }} />}
                </button>
              );
            })}
            {searchQuery && (
              <button
                type="button"
                onClick={() => { haptic(); setSearchQuery(''); }}
                style={{
                  padding:'0.35rem 0.7rem', borderRadius:100,
                  background:'rgba(248,113,113,0.12)', border:'1px solid rgba(248,113,113,0.3)',
                  color:'var(--mm-danger)', fontSize:'0.72rem',
                  cursor:'pointer', whiteSpace:'nowrap', flexShrink:0
                }}
              >
                Clear filter ✕
              </button>
            )}
          </div>
        )}

        </div></details>}
        {/* Grouped transaction list */}
        {loading ? (
          <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem' }}>
            {[...Array(5)].map((_,i)=>(
              <div key={i} style={{ height:70, background:'rgba(255,255,255,0.02)', borderRadius:10, animation:'pulse 1.5s ease-in-out infinite', animationDelay:`${i*0.1}s`}}/>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'4rem 2rem', color:'var(--text-muted)' }}>
            <div style={{ fontSize:'3rem', marginBottom:'1rem', opacity:0.3 }}>📭</div>
            <div style={{ fontSize:'0.82rem', letterSpacing:'1px' }}>NO TRANSACTIONS FOUND</div>
            {(searchQuery||filterType!=='All'||filterAccount!=='All'||dateFrom||dateTo||minAmt||maxAmt||filterTag||filterAnomalies) && (
              <button onClick={()=>{setSearchQuery('');setFilterType('All');setFilterAccount('All');setDateFrom('');setDateTo('');setMinAmt('');setMaxAmt('');setFilterTag('');setFilterAnomalies(false);}} className="btn btn-secondary" style={{ marginTop:'1.5rem', fontSize:'0.8rem' }}>Clear Filters</button>
            )}
          </div>
        ) : (
          <div className={compact ? 'tx-compact' : undefined} style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

            {/* Bulk action bar */}
            {selectedIds.size > 0 && (
              <motion.div initial={{ opacity:0, y:-8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:-8 }}
                style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.75rem 1.25rem', background:'rgba(239,68,68,0.12)', border:'1px solid rgba(239,68,68,0.3)', borderRadius:12, gap:'1rem' }}>
                <div style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--mm-danger)' }}>
                  {selectedIds.size} selected
                </div>
                <div style={{ display:'flex', gap:'0.5rem' }}>
                  <button onClick={() => setSelectedIds(new Set())} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>
                    Clear
                  </button>
                  {bulkMode ? (
                    <form onSubmit={handleBulkEdit} style={{ display:'flex', gap:'0.4rem' }}>
                      <input autoFocus aria-label={bulkMode === 'category' ? 'Bulk category' : 'Bulk tag'} list="tx-bulk-cats" value={bulkValue} onChange={e => setBulkValue(e.target.value)} placeholder={bulkMode === 'category' ? 'Category' : 'Tag'} style={{ fontSize:'0.78rem', padding:'0.35rem 0.6rem', width:150 }} />
                      {bulkMode === 'category' && <datalist id="tx-bulk-cats">{getCategories().map(c => <option key={c} value={c} />)}</datalist>}
                      <button type="submit" className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Apply</button>
                      <button type="button" className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }} onClick={() => { setBulkMode(null); setBulkValue(''); }}>Cancel</button>
                    </form>
                  ) : (<>
                    <button onClick={() => setBulkMode('category')} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Set category</button>
                    <button onClick={() => setBulkMode('tag')} className="btn btn-secondary" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem' }}>Add tag</button>
                  </>)}
                  <button onClick={handleBulkDelete} className="btn" style={{ fontSize:'0.78rem', padding:'0.4rem 0.875rem', background:'rgba(239,68,68,0.2)', color:'var(--mm-danger)', border:'1px solid rgba(239,68,68,0.4)' }}>
                    🗑 Delete {selectedIds.size}
                  </button>
                </div>
              </motion.div>
            )}

            {grouped.map(([date, txs], groupIdx) => {
              const dayIncome  = txs.filter(isActivePayment).filter(t=>t.type==='Income').reduce((s,t)=>s+t.amount,0);
              const dayExpense = txs.filter(isActivePayment).filter(t=>t.type==='Expense'||t.type==='Loan Payment').reduce((s,t)=>s+t.amount,0);
              return (
                <div key={date} className={groupIdx >= 2 ? 'heavy-section-deferred' : undefined}>
                  {/* Date group header */}
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.5rem', paddingBottom:'0.5rem', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ fontSize:'0.78rem', fontWeight:600, color:'var(--text-secondary)', letterSpacing:'1px' }}>
                      {formatGroupDate(date)}
                    </div>
                    <div style={{ display:'flex', gap:'1rem', fontSize:'0.72rem' }}>
                      {dayIncome  > 0 && <span style={{ color:'var(--success)' }}>+{formatCurrency(dayIncome)}</span>}
                      {dayExpense > 0 && <span style={{ color:'var(--danger)' }}>-{formatCurrency(dayExpense)}</span>}
                    </div>
                  </div>

                  <div style={{ display:'flex', flexDirection:'column', gap:'0.375rem' }}>
                      {txs.map((tx) => {
                        const color = TYPE_COLOR[tx.type] || '#aaa';
                        const bg    = TYPE_BG[tx.type]    || 'rgba(255,255,255,0.02)';
                        const isIncome = tx.type === 'Income';
                        const isExpense = tx.type === 'Expense' || tx.type === 'Loan Payment';
                        const canEdit = isEditableTransaction(tx);
                        const txAccId = isIncome ? tx.to_account_id : (tx.from_account_id || tx.to_account_id);
                        const txCurrency = tx.currency || accounts.find(a => String(a.id) === String(txAccId))?.currency;
                        const filteredAccCurrency = filterAccount !== 'All' ? accounts.find(a => String(a.id) === String(filterAccount))?.currency : undefined;
                        return (
                          <div
                            key={tx.id}
                            style={{ position: 'relative' }}
                          >
                            {isMobile && canEdit && (
                              <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 100, background: 'var(--danger)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '1.5rem', color: '#fff', zIndex: 0 }}>
                                <Trash2 size={18}/>
                              </div>
                            )}
                            <motion.div
                              data-tx-row
                              drag={isMobile && canEdit ? "x" : false}
                              dragConstraints={{ left: -100, right: 0 }}
                              dragElastic={0.1}
                              dragSnapToOrigin
                              onDragEnd={(e, { offset }) => {
                                if (offset.x < -80) {
                                  setConfirm({open:true,id:tx.id,type:'txn'});
                                }
                              }}
                              onClick={() => {
                                haptic();
                                setPopupTx(tx);
                              }}
                              style={{
                                position: 'relative',
                                zIndex: 1,
                                display:'flex', alignItems:'center',
                                padding:'0.75rem 1rem',
                                background: bg,
                                borderRadius:10,
                                border:'1px solid var(--border-glass)',
                                borderLeft:`2px solid ${color}`,
                                gap:'0.875rem',
                                cursor:'pointer',
                                transition: 'background 0.15s, border-color 0.15s, box-shadow 0.15s',
                              }}
                          >
                            {/* Checkbox for bulk select */}
                            <input
                              type="checkbox"
                              aria-label={`Select transaction ${tx.category || tx.type}`}
                              checked={selectedIds.has(tx.id)}
                              onChange={e => {
                                e.stopPropagation();
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(tx.id)) next.delete(tx.id);
                                  else next.add(tx.id);
                                  return next;
                                });
                              }}
                              style={{ width:15, height:15, flexShrink:0, accentColor:'var(--mm-danger)', cursor:'pointer' }}
                              onClick={e => e.stopPropagation()}
                            />

                            {/* Emoji icon */}
                            <div style={{ fontSize:'1.5rem', flexShrink:0, width:36, textAlign:'center', lineHeight:1 }}>
                              {getCategoryEmoji(tx.category) || (tx.type === 'Income' ? '💰' : tx.type === 'Transfer' ? '🔄' : tx.type === 'Loan Payment' ? '🏦' : '💸')}
                            </div>

                            {/* Main info */}
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', flexWrap:'wrap' }}>
                                <span style={{ fontWeight:600, fontSize:'0.92rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                  <Highlight text={tx.category || tx.type} query={searchQuery} />
                                </span>
                                <span style={{ fontSize:'0.65rem', padding:'0.1rem 0.4rem', borderRadius:4, background:'var(--bg-elevated)', color, flexShrink:0 }}>
                                  {tx.type}
                                </span>
                                {canEdit && quickEditId !== tx.id && (
                                  <button
                                    type="button"
                                    aria-label="Inline quick edit"
                                    title="Quick edit category & notes"
                                    onClick={(e) => startQuickEdit(tx, e)}
                                    style={{
                                      background: 'transparent',
                                      border: '1px solid rgba(255,255,255,0.08)',
                                      borderRadius: 4,
                                      padding: '0.08rem 0.35rem',
                                      fontSize: '0.64rem',
                                      color: 'var(--text-muted)',
                                      cursor: 'pointer',
                                      flexShrink: 0,
                                    }}
                                  >
                                    ✎ Quick edit
                                  </button>
                                )}
                                {(tx.tax_deductible || tx.is_tax_deductible) && (
                                  <span style={{ fontSize:'0.63rem', padding:'0.1rem 0.4rem', borderRadius:4, background:'rgba(74,222,128,0.14)', color:'var(--mm-success)', border:'1px solid rgba(74,222,128,0.3)', flexShrink:0 }}>
                                    🏷️ Tax {tx.tax_category ? `(${tx.tax_category})` : ''}
                                  </span>
                                )}
                                {tx.status === 'pending' && (
                                  <span style={{ fontSize:'0.63rem', padding:'0.1rem 0.4rem', borderRadius:4, background:'rgba(251,191,36,0.15)', color:'var(--mm-warning)', border:'1px solid rgba(251,191,36,0.3)', flexShrink:0 }}>
                                    ⏳ Pending
                                  </span>
                                )}
                                {anomalyMap[tx.id] && (
                                  <span style={{ fontSize:'0.63rem', fontWeight:700, padding:'0.1rem 0.45rem', borderRadius:4, background: anomalyMap[tx.id].isDuplicate ? 'rgba(251,191,36,0.18)' : 'rgba(167,139,250,0.18)', color: anomalyMap[tx.id].isDuplicate ? '#fbbf24' : '#c084fc', border:`1px solid ${anomalyMap[tx.id].isDuplicate ? 'rgba(251,191,36,0.4)' : 'rgba(167,139,250,0.4)'}`, flexShrink:0 }}>
                                    {anomalyMap[tx.id].label}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize:'0.76rem', color:'var(--text-secondary)', marginTop:'0.2rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {tx.type === 'Transfer'
                                  ? `${getAccountName(tx.from_account_id)} → ${getAccountName(tx.to_account_id)}`
                                  : tx.type === 'Income'
                                    ? `→ ${getAccountName(tx.to_account_id)}`
                                    : `← ${getAccountName(tx.from_account_id)}`}
                              </div>
                              {/* Tags */}
                              {(tx.tags||[]).length > 0 && (
                                <div className="tx-extra" style={{ display:'flex', flexWrap:'wrap', gap:'0.25rem', marginTop:'0.3rem' }}>
                                  {tx.tags.map(tag => (
                                    <button key={tag} onClick={e => { e.stopPropagation(); setFilterTag(filterTag===tag ? '' : tag); }}
                                      style={{ background: filterTag===tag ? 'rgba(168,85,247,0.25)' : 'rgba(168,85,247,0.1)', border:`1px solid ${filterTag===tag ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.25)'}`, borderRadius:100, padding:'0.1rem 0.45rem', fontSize:'0.65rem', color:'#c084fc', cursor:'pointer', letterSpacing:'0.3px' }}>
                                      #{tag}
                                    </button>
                                  ))}
                                </div>
                              )}
                              {tx.notes && quickEditId !== tx.id && (
                                <div className="tx-extra" style={{ fontSize:'0.78rem', color:'var(--text-secondary, #8892aa)', marginTop:'0.25rem', display:'flex', alignItems:'flex-start', gap:'0.35rem', lineHeight:1.4 }}>
                                  <span style={{ flexShrink:0, opacity:0.7 }}>📝</span>
                                   <span style={{ overflow:'hidden', textOverflow:'ellipsis', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}><Highlight text={tx.notes} query={searchQuery} /></span>
                                </div>
                              )}
                              {quickEditId === tx.id && (
                                <form
                                  onSubmit={(e) => saveQuickEdit(tx, e)}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display:'flex', flexWrap:'wrap', gap:'0.4rem', alignItems:'center', marginTop:'0.4rem' }}
                                >
                                  <input
                                    type="text"
                                    aria-label="Quick edit category"
                                    list="cat-options"
                                    value={quickCat}
                                    onChange={(e) => setQuickCat(e.target.value)}
                                    placeholder="Category"
                                    autoFocus
                                    style={{ padding:'0.3rem 0.55rem', fontSize:'0.78rem', borderRadius:6, width:140 }}
                                  />
                                  <input
                                    type="text"
                                    aria-label="Quick edit notes"
                                    value={quickNotes}
                                    onChange={(e) => setQuickNotes(e.target.value)}
                                    placeholder="Notes / merchant"
                                    style={{ padding:'0.3rem 0.55rem', fontSize:'0.78rem', borderRadius:6, flex:'1 1 150px', minWidth:120 }}
                                  />
                                  <button type="submit" className="tx-chip is-on" style={{ padding:'0.28rem 0.65rem', fontSize:'0.74rem' }}>
                                    Save
                                  </button>
                                  <button type="button" className="tx-chip" onClick={cancelQuickEdit} style={{ padding:'0.28rem 0.65rem', fontSize:'0.74rem' }}>
                                    Cancel
                                  </button>
                                </form>
                              )}
                              {tx.receipt_url && (
                                <div className="tx-extra" style={{ marginTop:'0.3rem' }} onClick={e => e.stopPropagation()}>
                                  <ReceiptImage
                                    value={tx.receipt_url}
                                    thumb={tx.receipt_thumb}
                                    style={{ height:36, width:'auto', maxWidth:80, minWidth:36, borderRadius:4, objectFit:'cover', border:'1px solid rgba(74,222,128,0.25)', opacity:0.9 }}
                                  />
                                </div>
                              )}
                            </div>

                            {/* Amount + Bank-Statement Running Balance */}
                            <div style={{ textAlign:'right', flexShrink:0 }}>
                              <div style={{ fontWeight:700, fontSize:'1rem', color }}>
                                {isExpense ? '-' : isIncome ? '+' : ''}{formatCurrency(tx.amount, txCurrency ? { currency: txCurrency } : {})}{auditStatus(tx) !== 'Active' && <small style={{display:'block'}}>{auditStatus(tx)}</small>}
                              </div>
                              {tx.fee_amount > 0 && (
                                <div style={{ fontSize:'0.68rem', color:'var(--danger)', marginTop:1 }}>Fee: {formatCurrency(tx.fee_amount, txCurrency ? { currency: txCurrency } : {})}</div>
                              )}
                              {filterAccount !== 'All' && runningBalanceMap.has(tx.id) && (
                                <div data-testid="tx-running-balance" style={{ fontSize:'0.68rem', color:'var(--text-muted)', marginTop:2, fontVariantNumeric:'tabular-nums' }}>
                                  Bal: {formatCurrency(runningBalanceMap.get(tx.id), filteredAccCurrency ? { currency: filteredAccCurrency } : {})}
                                </div>
                              )}
                            </div>

                            {/* Actions (desktop inline; on mobile, tap row for TransactionPopup or swipe to delete) */}
                            {!isMobile && (
                              <div style={{ display:'flex', gap:'0.2rem', flexShrink:0 }}>
                                {!tx.is_transfer_fee && (
                                  <button type="button" className="icon-btn" aria-label="Duplicate transaction" onClick={(e) => { e.stopPropagation(); duplicateTx(tx); }} title="Duplicate">
                                    <Copy size={13}/>
                                  </button>
                                )}
                                {canEdit && (
                                  <button type="button" className="icon-btn" aria-label="Edit transaction" onClick={(e) => { e.stopPropagation(); openEditModal(tx); }} title="Edit">
                                    <Edit2 size={14}/>
                                  </button>
                                )}
                                {canEdit && (
                                  <button type="button" className="icon-btn" aria-label="Delete transaction" style={{ color:'var(--danger)' }} onClick={(e) => { e.stopPropagation(); setConfirm({open:true,id:tx.id,type:'txn'}); }} title="Delete">
                                    <Trash2 size={14}/>
                                  </button>
                                )}
                              </div>
                            )}
                          </motion.div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}

            {visibleFiltered.length < filtered.length && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 0', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  Showing {visibleFiltered.length} of {filtered.length} transactions
                </span>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVisibleLimit(prev => prev + 60)}
                  style={{ fontSize: '0.78rem', padding: '0.45rem 0.95rem' }}
                >
                  Load 60 More
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setVisibleLimit(filtered.length)}
                  style={{ fontSize: '0.78rem', padding: '0.45rem 0.95rem' }}
                >
                  Show All ({filtered.length})
                </button>
              </div>
            )}
          </div>
        )}
      </>
    </>
  );
}
