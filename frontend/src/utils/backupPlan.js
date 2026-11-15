const sections = ['accounts','loans','goals','credit_cards','bills','receipts','budgets','investments','rules','shared_tabs','invoices','recurring_transactions','transactions'];
const links = { invoice_id:'invoices',payment_transaction_id:'transactions', reversal_of:'transactions', reversed_by:'transactions', from_account_id:'accounts',to_account_id:'accounts',account_id:'accounts',loan_id:'loans',goal_id:'goals',credit_card_id:'credit_cards',bill_id:'bills',parent_transaction_id:'transactions',fee_transaction_id:'transactions',recurring_rule_id:'recurring_transactions' };
const nested = new Set(['bills','investments','rules','shared_tabs','invoices']);
export async function backupFingerprint(backup) {
  const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(backup)));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
}
// Build every reference before performing any write. An invalid backup writes nothing.
export function planBackupImport(input, uid, fingerprint, { legacyIds = false } = {}) {
  if (!uid || !input.version || !Array.isArray(input.accounts)) throw new Error('Invalid backup or missing user');
  const backup=structuredClone(input), maps={}, rows={};
  for(const section of sections) {
    if(backup[section] != null && !Array.isArray(backup[section])) throw new Error(`Invalid ${section} collection`);
    maps[section]=new Map();rows[section]=[];
    for(const item of backup[section]||[]) {
      if(!item || typeof item.id!=='string' || !item.id || item.id.length>300 || maps[section].has(item.id)) throw new Error(`Missing or duplicate ID in ${section}`);
      maps[section].set(item.id, legacyIds ? `import_${fingerprint}_${section}_${encodeURIComponent(item.id)}` : `import_${encodeURIComponent(uid)}_${fingerprint}_${section}_${maps[section].size}`);
    }
  }
  const txs=backup.transactions||[];
  for(const fee of txs.filter(t=>t.is_transfer_fee && !t.parent_transaction_id)) {
    const candidates=txs.filter(t=>t.type==='Transfer' && t.fee_amount===fee.amount && t.from_account_id===fee.from_account_id && t.date===fee.date && fee.notes===`Transfer fee for ${t.notes||'transfer'}`);
    if(candidates.length!==1 || candidates[0].fee_transaction_id) throw new Error('Legacy transfer fees need reconciliation before import');
    fee.parent_transaction_id=candidates[0].id;candidates[0].fee_transaction_id=fee.id;
  }
  for(const section of sections) for(const item of backup[section]||[]) {
    const {id, ...data}=item;
    for(const [field,target] of Object.entries(links)) if(data[field]) {
      const mapped=maps[target].get(String(data[field]));
      if(!mapped) throw new Error(`${section}/${id}: missing ${target} reference (${field})`);
      data[field]=mapped;
    }
    if (data.reversal_context) {
      if (!Array.isArray(data.reversal_context)) throw new Error('Invalid payment audit snapshot');
      data.reversal_context = data.reversal_context.map(target => {
        const parts = target.path.split('/');
        const section = parts.length === 4 && parts[0] === 'users' ? parts[2] : parts[0];
        const mapped = maps[section]?.get(parts.at(-1));
        if (!mapped) throw new Error('Missing payment audit reference');
        return { ...target, path: nested.has(section) ? `users/${uid}/${section}/${mapped}` : `${section}/${mapped}` };
      });
    }
    if(data.receipt_url?.startsWith('receipt:')) {
      const mapped=maps.receipts.get(data.receipt_url.slice(8));
      if(!mapped) throw new Error('Backup lacks a receipt image. Export a new complete backup before importing.');
      data.receipt_url=`receipt:${mapped}`;
    }
    for(const field of ['amount','balance','fee_amount','target_amount','current_amount','principal_amount','unpaid_interest','total_interest_paid']) {
      if(data[field]!=null && (typeof data[field]!=='number'||!Number.isFinite(data[field])||(field!=='balance'&&data[field]<0))) throw new Error(`Invalid ${field} in ${section}/${id}`);
    }
    const path=nested.has(section)?['users',uid,section,maps[section].get(id)]:[section,maps[section].get(id)];
    rows[section].push({path,data:{...data,uid,import_id:fingerprint}});
  }
  const groups=[];
  for(const section of sections.filter(s=>s!=='transactions')) for(const row of rows[section]) { if(section !== 'invoices' || !row.data.payment_transaction_id) groups.push([row]); }
  const byId=new Map(rows.transactions.map(r=>[r.path[1],r]));
  const used=new Set();
  for(const row of rows.transactions) {
    if(row.data.is_transfer_fee) continue;
    const group=[row];used.add(row.path[1]);
    if(row.data.invoice_id) {
      const invoice=rows.invoices.find(item=>item.path.at(-1)===row.data.invoice_id);
      if(!invoice || invoice.data.payment_transaction_id!==row.path[1] || invoice.data.status!=='Paid') throw new Error('Invalid invoice payment linkage');
      group.push(invoice);
    }
    if(row.data.type === 'Transfer' && row.data.fee_amount > 0 && !row.data.fee_transaction_id) throw new Error('Transfer fee record missing from backup');
    if(row.data.fee_transaction_id) {
      const fee=byId.get(row.data.fee_transaction_id);
      if(!fee?.data.is_transfer_fee || fee.data.parent_transaction_id!==row.path[1] || fee.data.amount!==row.data.fee_amount || fee.data.from_account_id!==row.data.from_account_id || fee.data.date!==row.data.date) throw new Error('Invalid transfer fee linkage');
      group.push(fee);used.add(fee.path[1]);
    }
    groups.push(group);
  }
  for(const invoice of rows.invoices.filter(row=>row.data.payment_transaction_id)) {
    if(byId.get(invoice.data.payment_transaction_id)?.data.invoice_id!==invoice.path.at(-1)) throw new Error('Invalid invoice payment linkage');
  }
  if(used.size!==rows.transactions.length) throw new Error('Orphan transfer fee in backup');
  return {groups,total:groups.reduce((n,g)=>n+g.length,0),fingerprint};
}
