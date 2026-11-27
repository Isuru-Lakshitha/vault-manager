// Test-only adapter. Selected exclusively by vite.browser.config.js.
const uid = 'browser-test';
const initial = {
 'users/browser-test/invoices/invoice':{uid,id:'invoice',invoiceNumber:'TEST-1',status:'Sent',currency:'LKR',clientName:'Test client',items:[{description:'Test service',quantity:2,unitPrice:25}],taxRate:10},
 'accounts/bank':{uid,name:'Test Bank',type:'Bank',currency:'LKR',balance:1000,opening_balance:1000},
 'accounts/cash':{uid,name:'Test Cash',type:'Cash',currency:'LKR',balance:200,opening_balance:200},
 'accounts/legacy':{uid,name:'Legacy Account',type:'Cash',currency:'LKR',balance:500},
 'credit_cards/card':{uid,name:'Test Visa',currency:'LKR',balance:80,credit_limit:1000,apr:0,min_payment_pct:2},
};
let records = new Map(Object.entries(initial));
export const db = {};
export const auth = {currentUser:{uid,email:'browser-test@example.invalid',displayName:'Browser test'},onAuthStateChanged(callback){queueMicrotask(()=>callback(this.currentUser));return ()=>{};},async signOut(){this.currentUser=null;}};
export const storage = {};
export const collection = (_, ...parts) => ({path:parts.join('/')});
export const doc = (base,...parts) => {const path=base.path ? `${base.path}/${parts[0] || crypto.randomUUID()}` : parts.join('/');return {path,id:path.split('/').at(-1)};};
const snap = (ref, source=records) => ({id:ref.id,exists:()=>source.has(ref.path),data:()=>structuredClone(source.get(ref.path))});
export const getDoc = async ref => snap(ref);
export const where = (field,op,value) => ({field,value});
export const query = (base,...filters) => ({...base,filters});
export const orderBy = () => ({});
export const limit = () => ({});
export const getDocs = async ref => ({docs:[...records.keys()].filter(path=>path.startsWith(ref.path+'/') && !path.slice(ref.path.length+1).includes('/')).filter(path=>(ref.filters||[]).every(f=>!f.field || records.get(path)[f.field]===f.value)).map(path=>snap(doc(db,...path.split('/'))))});
export const getDocsFromServer = async ref => { const r = await getDocs(ref); return { ...r, empty: r.docs.length === 0 }; };
export const deleteField = () => ({__delete:true});
export const serverTimestamp = () => new Date().toISOString();
function update(source,ref,data) {const next={...source.get(ref.path)};for(const [key,value] of Object.entries(data)){if(value?.__delete)delete next[key];else next[key]=structuredClone(value);}source.set(ref.path,next);}
export async function runTransaction(_,callback) {
 if(!navigator.onLine)throw new Error('Offline');
 const staged=structuredClone(records);let writing=false;
 const txn={get:async ref=>{if(writing)throw new Error('Read after write');return snap(ref,staged);},set:(ref,data)=>{writing=true;staged.set(ref.path,structuredClone(data));},update:(ref,data)=>{writing=true;update(staged,ref,data);},delete:ref=>{writing=true;staged.delete(ref.path);}};
 const result=await callback(txn);records=staged;return result;
}
export const setDoc = async(ref,data,options)=>{if(options?.merge)update(records,ref,data);else records.set(ref.path,structuredClone(data));};
export const addDoc = async(base,data)=>{const ref=doc(base);await setDoc(ref,data);return ref;};
export const updateDoc = async(ref,data)=>update(records,ref,data);
export const deleteDoc = async ref=>records.delete(ref.path);
export const writeBatch = ()=>{const actions=[];return {set:(ref,data)=>actions.push(()=>setDoc(ref,data)),update:(ref,data)=>actions.push(()=>updateDoc(ref,data)),delete:ref=>actions.push(()=>deleteDoc(ref)),commit:()=>Promise.all(actions.map(action=>action()))};};
export const onSnapshot = ()=>()=>{};
