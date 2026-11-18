import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Accounts from '../../src/pages/Accounts';
import Transactions from '../../src/pages/Transactions';
import CreditCards from '../../src/pages/CreditCards';
import Settings from '../../src/pages/Settings';
import QuickAdd from '../../src/components/QuickAdd';
import InvoiceModal from '../../src/components/InvoiceModal';
import OfflineBanner from '../../src/components/OfflineBanner';
import '../../src/styles/index.css';
export function Fixture() {
 const [quick,setQuick]=useState(false);
 const [invoices,setInvoices]=useState(false);
 useEffect(()=>{const open=()=>setInvoices(true);window.addEventListener('vm:open-invoices',open);return ()=>window.removeEventListener('vm:open-invoices',open);},[]);
 return <BrowserRouter><Toaster/><OfflineBanner/><header style={{padding:24,display:'flex',flexWrap:'wrap',gap:20}}><strong>Isolated browser test</strong><Link to="/test/browser/accounts">Accounts</Link><Link to="/test/browser/transactions">Transactions</Link><Link to="/test/browser/cards">Cards</Link><Link to="/test/browser/settings">Settings</Link><button onClick={()=>setQuick(true)}>Quick Add</button></header><main style={{padding:24}}><Routes><Route path="/test/browser/accounts" element={<Accounts/>}/><Route path="/test/browser/transactions" element={<Transactions/>}/><Route path="/test/browser/cards" element={<CreditCards/>}/><Route path="/test/browser/settings" element={<Settings/>}/><Route path="*" element={<Accounts/>}/></Routes></main><InvoiceModal isOpen={invoices} onClose={()=>setInvoices(false)}/><QuickAdd open={quick} onClose={()=>setQuick(false)}/></BrowserRouter>;
}
createRoot(document.getElementById('root')).render(<Fixture/>);
