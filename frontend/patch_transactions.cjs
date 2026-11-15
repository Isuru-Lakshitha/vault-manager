const fs = require('fs');
const path = '/Users/isuru/Documents/Money Manager/frontend/src/pages/Transactions.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. SUGGESTED_CATEGORIES logic
const categoryLogic = `const SUGGESTED_CATEGORIES = [
  '🍔 Food','🚗 Transport','🏠 Rent','⚡ Utilities','🛍️ Shopping',
  '💊 Health','📚 Education','🎭 Entertainment','✈️ Travel','💰 Salary',
  '💼 Business','🐷 Savings','💳 Bills','🔧 Maintenance','📱 Phone',
];

const getCategories = () => {
  try {
    const custom = JSON.parse(localStorage.getItem('vm_custom_categories'));
    if (custom && custom.length) return custom.map(c => \`\${c.emoji} \${c.name}\`);
  } catch(e) {}
  return SUGGESTED_CATEGORIES;
};`;
content = content.replace(/const SUGGESTED_CATEGORIES = \[\s*[^\]]+\];/m, categoryLogic);
content = content.replace(/SUGGESTED_CATEGORIES/g, "getCategories()");

// 2. Add isSplit to state
content = content.replace("fee_amount: 0, day_of_month: new Date().getDate(),", "fee_amount: 0, day_of_month: new Date().getDate(), isSplit: false, splits: [{category:'', amount:0}, {category:'', amount:0}],");
content = content.replace("fee_amount: tx.fee_amount || 0,", "fee_amount: tx.fee_amount || 0, isSplit: !!tx.splits, splits: tx.splits || [{category:'', amount:0}, {category:'', amount:0}],");

// 3. Update payload
content = content.replace(/fee_amount: Number\(formData.fee_amount\) \|\| 0,/g, `fee_amount: Number(formData.fee_amount) || 0,
          splits: formData.isSplit ? formData.splits : null,`);
content = content.replace(/await createTransaction\(data\);/g, `
          if (data.isSplit) {
            data.category = data.splits[0].category || 'Split';
          }
          await createTransaction(data);`);
          
// 4. Update UI for splits
// I'll replace the entire Category div block with a conditional
const oldCategoryDiv = `<div style={{ position:'relative' }} ref={catContainerRef}>`;
const newCategoryDiv = `
            {formData.type === 'Expense' && (
              <label style={{ display:'flex', alignItems:'center', gap:'0.75rem', padding:'0.75rem 1rem', background:'rgba(255,255,255,0.03)', borderRadius:10, cursor:'pointer' }}>
                <input type="checkbox" checked={formData.isSplit} onChange={e=>setFormData(f=>({...f, isSplit: e.target.checked}))}/>
                <span style={{ fontSize:'0.85rem' }}>Split Transaction</span>
              </label>
            )}

            {formData.isSplit && formData.type === 'Expense' ? (
              <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                <label style={{ display:'block', fontSize:'0.82rem', color:'var(--text-secondary)' }}>Splits</label>
                {formData.splits.map((split, idx) => (
                  <div key={idx} style={{ display:'flex', gap:'0.5rem', alignItems:'center' }}>
                    <div style={{ flex:2, position:'relative' }}>
                      <input value={split.category} onChange={e => {
                        const newSplits = [...formData.splits];
                        newSplits[idx].category = e.target.value;
                        setFormData({...formData, splits: newSplits});
                      }} placeholder="Category" style={{ width:'100%', padding:'0.6rem' }} />
                    </div>
                    <div style={{ flex:1 }}>
                      <input type="number" value={split.amount} onChange={e => {
                        const newSplits = [...formData.splits];
                        newSplits[idx].amount = Number(e.target.value);
                        setFormData({...formData, splits: newSplits});
                      }} placeholder="Amount" style={{ width:'100%', padding:'0.6rem' }} />
                    </div>
                    {formData.splits.length > 2 && (
                      <button type="button" onClick={() => {
                        const newSplits = formData.splits.filter((_, i) => i !== idx);
                        setFormData({...formData, splits: newSplits});
                      }} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer' }}><X size={16}/></button>
                    )}
                  </div>
                ))}
                <button type="button" onClick={() => {
                  setFormData({...formData, splits: [...formData.splits, {category:'', amount:0}]});
                }} style={{ alignSelf:'flex-start', padding:'0.4rem 0.8rem', background:'rgba(255,255,255,0.1)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>+ Add Split</button>
                {(() => {
                  const total = formData.splits.reduce((s, c) => s + c.amount, 0);
                  const isMatch = total === Number(formData.amount);
                  return (
                    <div style={{ color: isMatch ? '#4ade80' : '#f87171', fontSize:'0.8rem' }}>
                      Splits total: {total} / {formData.amount}
                      {!isMatch && ' (Amounts must match)'}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div style={{ position:'relative' }} ref={catContainerRef}>
`;
content = content.replace(oldCategoryDiv, newCategoryDiv);

// Close the conditional that wraps the normal Category UI
const oldCategoryUIEnd = `                ))}
              </div>
            </div>`;
const newCategoryUIEnd = `                ))}
              </div>
            </div>
            )}`;
content = content.replace(oldCategoryUIEnd, newCategoryUIEnd);

fs.writeFileSync(path, content, 'utf8');
