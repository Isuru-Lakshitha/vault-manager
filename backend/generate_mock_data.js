const Database = require('better-sqlite3');
const db = new Database('./money_manager.sqlite');

const generateMockData = () => {
  console.log('Generating mock data...');
  
  // Create a default account if none exists
  let account = db.prepare('SELECT id FROM accounts LIMIT 1').get();
  let accountId;
  if (!account) {
    const res = db.prepare("INSERT INTO accounts (name, type, balance) VALUES ('Primary Bank', 'Bank', 500000)").run();
    accountId = res.lastInsertRowid;
  } else {
    accountId = account.id;
  }

  // Define some realistic categories
  const expenseCategories = ['Groceries', 'Rent', 'Utilities', 'Dining Out', 'Transport', 'Entertainment', 'Healthcare'];
  const incomeCategories = ['Salary', 'Freelance', 'Dividends'];
  const notes = ['Regular payment', 'Weekend trip', 'Monthly bill', 'Client project', 'Bonus'];

  const stmt = db.prepare('INSERT INTO transactions (type, amount, date, category, notes, from_account_id) VALUES (?, ?, ?, ?, ?, ?)');

  // Generate data over the last 6 months
  const now = new Date();
  
  db.transaction(() => {
    for (let i = 0; i < 180; i++) {
      // 1-3 transactions per day
      const txnCount = Math.floor(Math.random() * 3) + 1;
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      for (let j = 0; j < txnCount; j++) {
        const isExpense = Math.random() > 0.15; // 85% chance of expense
        const type = isExpense ? 'Expense' : 'Income';
        const category = isExpense 
          ? expenseCategories[Math.floor(Math.random() * expenseCategories.length)]
          : incomeCategories[Math.floor(Math.random() * incomeCategories.length)];
        
        let amount = isExpense 
          ? Math.floor(Math.random() * 15000) + 500 // 500 to 15500
          : Math.floor(Math.random() * 200000) + 50000; // 50k to 250k

        const note = notes[Math.floor(Math.random() * notes.length)];

        stmt.run(type, amount, dateStr, category, note, accountId);
      }
    }
  })();

  console.log('Finished inserting mock data.');
};

generateMockData();
