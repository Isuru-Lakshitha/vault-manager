const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const multer = require('multer');
const db = require('./db');
const { authenticate } = require('./auth');
const validation = require('./validation');
const ledger = require('./ledger');
const { initializeApp, applicationDefault, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const os = require('node:os');
const Database = require('better-sqlite3');
if (!getApps().length) initializeApp({ credential: applicationDefault(), projectId: process.env.FIREBASE_PROJECT_ID || 'money-manager-isuru' });

const app = express();
app.disable('x-powered-by');
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',');
app.use(cors({ origin: (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: '256kb' }));
app.use(authenticate(token => getAuth().verifyIdToken(token, true)));
app.use((req, res, next) => {
  db.withUserDatabase(req.user.uid, connection => {
    let closed = false;
    const close = () => { if (!closed) { closed = true; connection.close(); } };
    res.once('finish', close);
    res.once('close', close);
    next();
  });
});
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

// Validate all writes before SQL executes. References resolve only in this user's database.
app.use((req, res, next) => {
  if (!['POST', 'PUT', 'DELETE'].includes(req.method) || req.path.startsWith('/restore')) return next();
  try {
    const parts = req.path.split('/').filter(Boolean);
    const table = parts[0];
    if (parts[1] && ['accounts','transactions','loans','budgets','goals'].includes(table)) validation.reference(db, table, parts[1]);
    if (req.method !== 'DELETE') {
      const data = req.body;
      for (const field of ['amount','balance','target_amount','current_amount','principal_amount','unpaid_interest','total_interest_paid','annual_interest_rate','fee_amount']) {
        if (data[field] !== undefined) validation.money(data[field], field, field !== 'amount' && field !== 'target_amount', field === 'balance');
      }
      for (const field of ['date','start_date','last_interest_calc_date','target_date']) if (data[field]) validation.date(data[field]);
      if (data.account_id) validation.reference(db, 'accounts', data.account_id);
      if (parts[2] === 'payment' || parts[2] === 'contribute') validation.money(data.amount);
      if (table === 'accounts' && (!data.name?.trim() || !data.type?.trim())) validation.fail('Account name and type are required');
      if (table === 'budgets' && (!data.category?.trim() || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month))) validation.fail('Category and valid month are required');
      if (table === 'goals' && !parts[2] && (!data.name?.trim() || data.target_amount === undefined)) validation.fail('Goal name and target are required');
      if (table === 'loans' && !parts[2]) { validation.money(data.principal_amount, 'principal_amount', true); validation.date(data.start_date); }
    }
    next();
  } catch (error) { next(error); }
});

// --- ACCOUNTS ---
app.get('/accounts', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts').all();
  res.json(accounts);
});

app.post('/accounts', (req, res) => {
  const { name, type, balance } = req.body;
  const stmt = db.prepare('INSERT INTO accounts (name, type, balance) VALUES (?, ?, ?)');
  const result = stmt.run(name, type, balance || 0);
  res.json({ id: result.lastInsertRowid });
});

app.put('/accounts/:id', (req, res) => {
  const { name, type, balance } = req.body;
  const stmt = db.prepare('UPDATE accounts SET name = ?, type = ?, balance = ? WHERE id = ?');
  stmt.run(name, type, balance, req.params.id);
  res.json({ success: true });
});

app.delete('/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- TRANSACTIONS ---
app.get('/transactions', (req, res) => {
  const transactions = db.prepare('SELECT * FROM transactions ORDER BY date DESC').all();
  res.json(transactions);
});

app.post('/transactions', (req, res) => res.json({ id: ledger.saveTransaction(db, req.body) }));
app.put('/transactions/:id', (req, res) => res.json({ id: ledger.saveTransaction(db, req.body, req.params.id), success: true }));
app.delete('/transactions/:id', (req, res) => { ledger.deleteTransaction(db, req.params.id); res.json({ success: true }); });

// --- LOANS ---
app.get('/loans', (req, res) => {
  const loans = db.prepare('SELECT * FROM loans').all();
  // Calculate current accrued interest and next payment date dynamically for display
  const today = new Date().toISOString().split('T')[0];
  
  const enhancedLoans = loans.map(loan => {
    if (loan.status === 'Active') {
      const lastCalcDate = new Date(loan.last_interest_calc_date);
      const currentDate = new Date(today);
      const diffTime = Math.abs(currentDate - lastCalcDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Daily interest = Principal * (Annual Rate / 100) / 365
      const dailyInterest = loan.principal_amount * (loan.annual_interest_rate / 100) / 365;
      const newlyAccrued = dailyInterest * diffDays;
      const current_accrued_interest = loan.unpaid_interest + newlyAccrued;
      
      // Next payment date: 1 month after last_interest_calc_date
      const nextPaymentDate = new Date(loan.last_interest_calc_date);
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      
      // Calculate how many days until next payment
      const daysUntilPayment = Math.ceil((nextPaymentDate - currentDate) / (1000 * 60 * 60 * 24));
      
      return {
        ...loan,
        current_accrued_interest,
        next_payment_date: nextPaymentDate.toISOString().split('T')[0],
        days_until_payment: daysUntilPayment
      };
    }
    return loan;
  });
  
  res.json(enhancedLoans);
});

app.post('/loans', (req, res) => {
  const { type, item_name, principal_amount, annual_interest_rate, start_date, last_interest_calc_date, total_interest_paid, unpaid_interest } = req.body;
  const calcDate = last_interest_calc_date || start_date;
  const totalPaid = total_interest_paid || 0;
  const initialUnpaidInterest = unpaid_interest || 0;
  
  const stmt = db.prepare(`
    INSERT INTO loans (type, item_name, principal_amount, annual_interest_rate, start_date, last_interest_calc_date, unpaid_interest, total_interest_paid) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(type, item_name, principal_amount, annual_interest_rate || 0, start_date, calcDate, initialUnpaidInterest, totalPaid);
  res.json({ id: result.lastInsertRowid });
});

app.put('/loans/:id', (req, res) => {
  const { type, item_name, principal_amount, annual_interest_rate, start_date, last_interest_calc_date, total_interest_paid, unpaid_interest } = req.body;
  const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(req.params.id);
  
  const calcDate = last_interest_calc_date || start_date;
  const totalPaid = total_interest_paid !== undefined ? total_interest_paid : loan.total_interest_paid;
  const newUnpaidInterest = unpaid_interest !== undefined ? unpaid_interest : loan.unpaid_interest;
  
  const stmt = db.prepare('UPDATE loans SET type = ?, item_name = ?, principal_amount = ?, annual_interest_rate = ?, start_date = ?, last_interest_calc_date = ?, total_interest_paid = ?, unpaid_interest = ? WHERE id = ?');
  stmt.run(type, item_name, principal_amount, annual_interest_rate || 0, start_date, calcDate, totalPaid, newUnpaidInterest, req.params.id);
  
  res.json({ success: true });
});

app.delete('/loans/:id', (req, res) => {
  db.prepare('DELETE FROM loans WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Loan Payment Logic
app.post('/loans/:id/payment', (req, res) => {
  const { amount, date, account_id } = req.body; // payment amount, date of payment, account to deduct from
  const loanId = req.params.id;
  
  const processPayment = db.transaction(() => {
    const loan = db.prepare('SELECT * FROM loans WHERE id = ?').get(loanId);
    if (!loan) throw new Error('Loan not found');
    if (loan.status !== 'Active') throw new Error('Loan is already paid off');

    validation.date(date);
    validation.reference(db, 'accounts', account_id);
    let paymentRemaining = amount;
    
    // 1. Calculate accrued interest up to payment date
    const lastCalcDate = new Date(loan.last_interest_calc_date);
    const paymentDate = new Date(date);
    
    // Ensure payment is not before last calculation
    if (paymentDate < lastCalcDate) {
       throw new Error('Payment date cannot be before last interest calculation date');
    }
    
    const diffTime = Math.abs(paymentDate - lastCalcDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    let newlyAccrued = 0;
    if (loan.type === 'Gold Loan') {
      const dailyInterest = loan.principal_amount * (loan.annual_interest_rate / 100) / 365;
      newlyAccrued = dailyInterest * diffDays;
    }
    
    let totalUnpaidInterest = loan.unpaid_interest + newlyAccrued;
    if (amount > Math.round((loan.principal_amount + totalUnpaidInterest) * 100) / 100) validation.fail('Payment exceeds outstanding loan balance');
    let newPrincipal = loan.principal_amount;

    let interestPaidThisTime = 0;

    // 2. Deduct from interest first
    if (paymentRemaining >= totalUnpaidInterest) {
      interestPaidThisTime = totalUnpaidInterest;
      paymentRemaining -= totalUnpaidInterest;
      totalUnpaidInterest = 0;
    } else {
      interestPaidThisTime = paymentRemaining;
      totalUnpaidInterest -= paymentRemaining;
      paymentRemaining = 0;
    }

    // 3. Deduct remainder from principal
    if (paymentRemaining > 0) {
      newPrincipal -= paymentRemaining;
    }
    
    const newStatus = newPrincipal <= 0 ? 'Paid Off' : 'Active';

    // 4. Update Loan record
    const updateLoan = db.prepare(`
      UPDATE loans 
      SET principal_amount = ?, unpaid_interest = ?, last_interest_calc_date = ?, status = ?, total_interest_paid = total_interest_paid + ?
      WHERE id = ?
    `);
    updateLoan.run(Math.max(0, newPrincipal), totalUnpaidInterest, date, newStatus, interestPaidThisTime, loanId);

    // 5. Create Transaction Record
    const insertTx = db.prepare(`
      INSERT INTO transactions (type, amount, date, notes, from_account_id, loan_id) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertTx.run('Loan Payment', amount, date, `Payment for ${loan.item_name}`, account_id, loanId);

    // 6. Deduct from Account
    db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, account_id);
    
    return { newPrincipal, totalUnpaidInterest, newStatus };
  });

  try {
    const result = processPayment();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.status ? err.message : 'Unable to complete operation; check the supplied values and references' });
  }
});

// --- BUDGETS ---
app.get('/budgets', (req, res) => {
  const budgets = db.prepare('SELECT * FROM budgets').all();
  res.json(budgets);
});

app.post('/budgets', (req, res) => {
  const { category, amount, month } = req.body;
  const stmt = db.prepare('INSERT INTO budgets (category, amount, month) VALUES (?, ?, ?)');
  const result = stmt.run(category, amount, month);
  res.json({ id: result.lastInsertRowid });
});

app.put('/budgets/:id', (req, res) => {
  const { category, amount, month } = req.body;
  const stmt = db.prepare('UPDATE budgets SET category = ?, amount = ?, month = ? WHERE id = ?');
  stmt.run(category, amount, month, req.params.id);
  res.json({ success: true });
});

app.delete('/budgets/:id', (req, res) => {
  db.prepare('DELETE FROM budgets WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// --- GOALS ---
app.get('/goals', (req, res) => {
  const goals = db.prepare('SELECT * FROM goals').all();
  res.json(goals);
});

app.post('/goals', (req, res) => {
  const { name, target_amount, target_date } = req.body;
  const stmt = db.prepare('INSERT INTO goals (name, target_amount, current_amount, target_date) VALUES (?, ?, 0, ?)');
  const result = stmt.run(name, target_amount, target_date);
  res.json({ id: result.lastInsertRowid });
});

app.put('/goals/:id', (req, res) => {
  const { name, target_amount, target_date } = req.body;
  const stmt = db.prepare('UPDATE goals SET name = ?, target_amount = ?, target_date = ? WHERE id = ?');
  stmt.run(name, target_amount, target_date, req.params.id);
  res.json({ success: true });
});

app.delete('/goals/:id', (req, res) => {
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

app.post('/goals/:id/contribute', (req, res) => {
  const { amount, account_id } = req.body;
  const goalId = req.params.id;

  const processContribution = db.transaction(() => {
    db.prepare('UPDATE goals SET current_amount = current_amount + ? WHERE id = ?').run(amount, goalId);
    if (account_id) {
      db.prepare('UPDATE accounts SET balance = balance - ? WHERE id = ?').run(amount, account_id);
      db.prepare('INSERT INTO transactions (type, amount, date, notes, from_account_id) VALUES (?, ?, ?, ?, ?)').run('Expense', amount, new Date().toISOString().split('T')[0], 'Goal Contribution', account_id);
    }
  });

  try {
    processContribution();
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.status ? err.message : 'Unable to complete operation; check the supplied values and references' });
  }
});

// --- ANALYTICS ---
app.get('/analytics', (req, res) => {
  // Aggregate expenses by category
  const expensesByCategory = db.prepare(`
    SELECT COALESCE(category, 'Uncategorized') as category, SUM(amount) as total 
    FROM transactions 
    WHERE type = 'Expense' 
    GROUP BY COALESCE(category, 'Uncategorized')
    ORDER BY total DESC
  `).all();
  
  // Expenses vs Income over time (last 6 months or all time grouped by month)
  const monthlyTrends = db.prepare(`
    SELECT substr(date, 1, 7) as month, type, SUM(amount) as total
    FROM transactions
    WHERE type IN ('Income', 'Expense')
    GROUP BY month, type
    ORDER BY month ASC
  `).all();

  res.json({ expensesByCategory, monthlyTrends });
});

const PORT = 3001;
// --- BACKUP & RESTORE ---
app.get('/backup/excel', (req, res) => {
  try {
    const workbook = xlsx.utils.book_new();

    const tables = ['accounts', 'transactions', 'budgets', 'goals', 'loans'];
    tables.forEach(table => {
      const data = db.prepare(`SELECT * FROM ${table}`).all();
      if (data.length > 0) {
        const worksheet = xlsx.utils.json_to_sheet(data);
        xlsx.utils.book_append_sheet(workbook, worksheet, table);
      } else {
        const worksheet = xlsx.utils.json_to_sheet([{ message: 'No data' }]);
        xlsx.utils.book_append_sheet(workbook, worksheet, table);
      }
    });

    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="MoneyManager_Backup_${new Date().toISOString().split('T')[0]}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate Excel backup' });
  }
});

app.get('/backup/system', async (req, res, next) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-backup-'));
  const filename = path.join(directory, 'backup.sqlite');
  try {
    await db.backup(filename);
    res.download(filename, `MoneyManager_${new Date().toISOString().slice(0,10)}.sqlite`, error => {
      fs.rmSync(directory, { recursive: true, force: true });
      if (error && !res.headersSent) next(error);
    });
  } catch (error) { fs.rmSync(directory, { recursive: true, force: true }); next(error); }
});

// Import whitelisted table data, never execute an uploaded database's schema or triggers.
app.post('/restore/system', upload.single('dbfile'), (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  let source;
  try {
    source = new Database(req.file.path, { readonly: true, fileMustExist: true });
    if (source.pragma('integrity_check', { simple: true }) !== 'ok') validation.fail('Invalid backup');
    if (source.prepare("SELECT name FROM sqlite_master WHERE type IN ('trigger','view')").all().length) validation.fail('Unsupported backup schema');
    const tables = ['accounts','loans','budgets','goals','transactions'];
    const rows = Object.fromEntries(tables.map(table => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
    db.transaction(() => {
      for (const table of [...tables].reverse()) db.prepare(`DELETE FROM ${table}`).run();
      for (const table of tables) {
        const columns = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
        for (const row of rows[table]) {
          for (const key of ['balance','amount','fee_amount','principal_amount','target_amount','current_amount','unpaid_interest','total_interest_paid','annual_interest_rate'])
            if (row[key] != null) validation.money(row[key], key, key !== 'amount', key === 'balance');
          if (table === 'transactions') {
            if (row.type === 'Loan Payment') { validation.reference(db, 'accounts', row.from_account_id); validation.reference(db, 'loans', row.loan_id); validation.date(row.date); }
            else validation.transaction(db, row);
          }
          insert.run(...columns.map(key => row[key] ?? null));
        }
      }
    })();
    res.json({ success: true });
  } catch (error) { next(Object.assign(error, { status: 400 })); }
  finally { source?.close(); fs.unlinkSync(req.file.path); }
});
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status || 400).json({ error: error.status ? error.message : 'Request could not be completed' });
});
if (require.main === module) app.listen(process.env.PORT || PORT, '127.0.0.1', () => console.log('Money Manager API listening on localhost'));
module.exports = app;
