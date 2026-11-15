module.exports = `
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      month TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount REAL NOT NULL,
      current_amount REAL DEFAULT 0,
      target_date TEXT
    );

    CREATE TABLE IF NOT EXISTS loans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      item_name TEXT NOT NULL,
      principal_amount REAL NOT NULL,
      annual_interest_rate REAL DEFAULT 0,
      start_date TEXT NOT NULL,
      last_interest_calc_date TEXT NOT NULL,
      unpaid_interest REAL DEFAULT 0,
      total_interest_paid REAL DEFAULT 0,
      status TEXT DEFAULT 'Active'
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      category TEXT,
      notes TEXT,
      from_account_id INTEGER,
      to_account_id INTEGER,
      fee_amount REAL DEFAULT 0,
      loan_id INTEGER,
      FOREIGN KEY(from_account_id) REFERENCES accounts(id),
      FOREIGN KEY(to_account_id) REFERENCES accounts(id),
      FOREIGN KEY(loan_id) REFERENCES loans(id)
    );
  `;
