const fs = require('fs');

const path = '/Users/isuru/Documents/Money Manager/frontend/src/pages/Settings.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add new icons
content = content.replace("from 'lucide-react';", "Fingerprint, List, Plus, Trash2, GripVertical, CheckCircle } from 'lucide-react';");

// 2. Add custom categories default
const categoryCode = `
const SUGGESTED_CATEGORIES = [
  { name: 'Food', emoji: '🍔', color: '#f87171' },
  { name: 'Transport', emoji: '🚗', color: '#60a5fa' },
  { name: 'Rent', emoji: '🏠', color: '#4ade80' },
  { name: 'Utilities', emoji: '⚡', color: '#facc15' },
  { name: 'Shopping', emoji: '🛍️', color: '#c084fc' },
  { name: 'Health', emoji: '💊', color: '#ec4899' },
  { name: 'Education', emoji: '📚', color: '#fb923c' },
  { name: 'Entertainment', emoji: '🎭', color: '#2dd4bf' },
  { name: 'Travel', emoji: '✈️', color: '#818cf8' },
  { name: 'Salary', emoji: '💰', color: '#4ade80' },
  { name: 'Business', emoji: '💼', color: '#a78bfa' },
  { name: 'Savings', emoji: '🐷', color: '#f472b6' },
  { name: 'Bills', emoji: '💳', color: '#facc15' },
  { name: 'Maintenance', emoji: '🔧', color: '#9ca3af' },
  { name: 'Phone', emoji: '📱', color: '#60a5fa' }
];

const COLORS = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#2dd4bf', '#60a5fa', '#818cf8', '#c084fc', '#ec4899'];
`;
content = content.replace("const CURRENCIES = [", categoryCode + "\nconst CURRENCIES = [");

// 3. Add states
const stateCode = `  const [customCategories, setCustomCategories] = useState(() => {
    try {
      const stored = localStorage.getItem('vm_custom_categories');
      if (stored) return JSON.parse(stored);
    } catch(e) {}
    return SUGGESTED_CATEGORIES;
  });
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [catForm, setCatForm] = useState({ name: '', emoji: '', color: COLORS[0] });

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(() => !!localStorage.getItem('vm_webauthn_cred_id'));

  useEffect(() => {
    if (window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(avail => {
        setBiometricAvailable(avail);
      });
    }
  }, []);

  const saveCategories = (cats) => {
    setCustomCategories(cats);
    localStorage.setItem('vm_custom_categories', JSON.stringify(cats));
  };
`;
content = content.replace("const [importData, setImportData] = useState(null);", "const [importData, setImportData] = useState(null);\n" + stateCode);

// 4. Biometric toggle logic
const biometricToggle = `
  const handleBiometricToggle = async () => {
    if (biometricEnabled) {
      localStorage.removeItem('vm_webauthn_cred_id');
      setBiometricEnabled(false);
      toast.success('Biometric unlock disabled');
    } else {
      try {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const cred = await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: { name: 'VaultManager', id: window.location.hostname },
            user: { id: new Uint8Array(16), name: 'user@vaultmanager.local', displayName: 'VaultManager User' },
            pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' }
          }
        });
        if (cred) {
          const credId = btoa(String.fromCharCode.apply(null, new Uint8Array(cred.rawId)));
          localStorage.setItem('vm_webauthn_cred_id', JSON.stringify({ id: credId }));
          setBiometricEnabled(true);
          toast.success('Biometric unlock enabled');
        }
      } catch (err) {
        console.error(err);
        toast.error('Failed to setup biometric unlock');
      }
    }
  };
`;
content = content.replace("const handleThemeToggle", biometricToggle + "\n  const handleThemeToggle");

// 5. Category handlers
const categoryHandlers = `
  const handleSaveCategory = () => {
    if (!catForm.name || !catForm.emoji) return toast.error('Name and emoji required');
    let updated;
    if (editingCategory !== null) {
      updated = [...customCategories];
      updated[editingCategory] = catForm;
    } else {
      updated = [...customCategories, catForm];
    }
    saveCategories(updated);
    setShowCategoryModal(false);
  };
  const handleDeleteCategory = (idx) => {
    if (confirm('Delete category?')) {
      const updated = customCategories.filter((_, i) => i !== idx);
      saveCategories(updated);
    }
  };
  const moveCategory = (idx, dir) => {
    const updated = [...customCategories];
    if (dir === -1 && idx > 0) {
      const temp = updated[idx];
      updated[idx] = updated[idx - 1];
      updated[idx - 1] = temp;
    } else if (dir === 1 && idx < updated.length - 1) {
      const temp = updated[idx];
      updated[idx] = updated[idx + 1];
      updated[idx + 1] = temp;
    }
    saveCategories(updated);
  };
`;
content = content.replace("const handleExportData", categoryHandlers + "\n  const handleExportData");

// 6. UI insertions
const biometricUI = `
          {biometricAvailable && (
            <>
              <SectionHeader label="BIOMETRIC UNLOCK" />
              <SettingsRow icon={Fingerprint} label="Fingerprint / Face ID" description="Unlock faster using device biometrics" color="#4ade80">
                <Toggle checked={biometricEnabled} onChange={handleBiometricToggle} color="#4ade80" />
              </SettingsRow>
            </>
          )}
`;

content = content.replace("{/* DATA MANAGEMENT */}", biometricUI + "\n          {/* DATA MANAGEMENT */}");

const categoryUI = `
          {/* CATEGORIES */}
          <SectionHeader label="CATEGORIES" />
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)', padding: '1.1rem 1.5rem', marginBottom: '0.5rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <List size={18} style={{ color: '#a78bfa' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#f0f0f5' }}>Custom Categories</div>
                  <div style={{ fontSize: '0.78rem', color: '#555', fontFamily: 'Outfit, sans-serif' }}>Manage transaction categories</div>
                </div>
              </div>
              <button onClick={() => { setEditingCategory(null); setCatForm({name:'', emoji:'', color:COLORS[0]}); setShowCategoryModal(true); }}
                style={{ padding: '0.4rem 0.8rem', borderRadius: 8, background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: 'none', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {customCategories.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                    <button onClick={() => moveCategory(i, -1)} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', padding:0, lineHeight:0 }} disabled={i===0}>▲</button>
                    <button onClick={() => moveCategory(i, 1)} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', padding:0, lineHeight:0 }} disabled={i===customCategories.length-1}>▼</button>
                  </div>
                  <div style={{ fontSize: '1.2rem' }}>{c.emoji}</div>
                  <div style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</div>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: c.color }} />
                  <button onClick={() => { setEditingCategory(i); setCatForm(c); setShowCategoryModal(true); }} style={{ background:'none', border:'none', color:'#a78bfa', cursor:'pointer', padding: '0.3rem' }}>Edit</button>
                  <button onClick={() => handleDeleteCategory(i)} style={{ background:'none', border:'none', color:'#f87171', cursor:'pointer', padding: '0.3rem' }}><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          </motion.div>
`;
content = content.replace("{/* NOTIFICATIONS */}", categoryUI + "\n          {/* NOTIFICATIONS */}");

// 7. Category Modal
const categoryModal = `
      {/* Category Setup Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(6,8,20,0.92)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
            onClick={e => e.target === e.currentTarget && setShowCategoryModal(false)}
          >
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              style={{ background: 'rgba(15,21,36,0.98)', border: '1px solid rgba(167,139,250,0.3)', borderRadius: 20, padding: '2rem', width: '100%', maxWidth: 360 }}
            >
              <h3 style={{ fontFamily: 'Outfit, sans-serif', color: '#f0f0f5', marginBottom: '1.5rem', textAlign: 'center' }}>
                {editingCategory !== null ? 'Edit Category' : 'New Category'}
              </h3>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Emoji</label>
                  <input type="text" value={catForm.emoji} onChange={e=>setCatForm({...catForm, emoji: e.target.value})} style={{ width:'100%', padding:'0.6rem', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff' }} maxLength={2} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Name</label>
                  <input type="text" value={catForm.name} onChange={e=>setCatForm({...catForm, name: e.target.value})} style={{ width:'100%', padding:'0.6rem', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', color:'#fff' }} />
                </div>
                <div>
                  <label style={{ display:'block', fontSize:'0.8rem', color:'#aaa', marginBottom:'0.3rem' }}>Color</label>
                  <div style={{ display:'flex', gap:'0.4rem', flexWrap:'wrap' }}>
                    {COLORS.map(c => (
                      <button key={c} onClick={() => setCatForm({...catForm, color: c})}
                        style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: catForm.color === c ? '3px solid #fff' : 'none', cursor: 'pointer' }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display:'flex', gap:'0.5rem', justifyContent:'flex-end' }}>
                <button onClick={() => setShowCategoryModal(false)} style={{ padding:'0.5rem 1rem', background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', borderRadius:8, cursor:'pointer' }}>Cancel</button>
                <button onClick={handleSaveCategory} style={{ padding:'0.5rem 1rem', background:'#4ade80', border:'none', color:'#000', borderRadius:8, cursor:'pointer', fontWeight:600 }}>Save</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
`;
content = content.replace("{/* PIN Setup Modal */}", categoryModal + "\n      {/* PIN Setup Modal */}");

fs.writeFileSync(path, content, 'utf8');
