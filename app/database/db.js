const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// Path to the database file
const dbPath = path.join(__dirname, "dp_business_portfolio.sqlite");

// Create or open the database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Failed to connect to database:", err.message);
  } else {
    console.log("✅ Connected to SQLite database");
  }
});

// Create tables and initial data
db.serialize(() => {
  /* ---------- Businesses table ---------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS businesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      currency TEXT DEFAULT 'USD',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert default business if table is empty
  db.get(`SELECT COUNT(*) as count FROM businesses`, (err, row) => {
    if (err) {
      console.error("❌ Failed to check businesses:", err.message);
      return;
    }

    if (row.count === 0) {
      db.run(
        `INSERT INTO businesses (name, currency) VALUES (?, ?)`,
        ["AgoraX Media", "USD"],
        (err) => {
          if (err) {
            console.error("❌ Failed to insert default business:", err.message);
          } else {
            console.log("✅ Default business created");
          }
        }
      );
    }
  });

  /* ---------- Clients table ---------- */
  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    )
  `);
});

db.run(`
  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    notes TEXT,
    status TEXT DEFAULT 'New',
    expected_value REAL DEFAULT 0,
    probability INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migration: Add expected_value and probability if missing
db.all(`PRAGMA table_info(leads)`, (err, rows) => {
  if (err) {
    console.error("❌ Failed to check leads schema:", err.message);
    return;
  }
  const hasValue = rows.some(r => r.name === 'expected_value');
  const hasProb = rows.some(r => r.name === 'probability');

  if (!hasValue) {
    db.run(`ALTER TABLE leads ADD COLUMN expected_value REAL DEFAULT 0`, (e) => {
      if (!e) console.log("✅ Added expected_value column to leads");
    });
  }
  if (!hasProb) {
    db.run(`ALTER TABLE leads ADD COLUMN probability INTEGER DEFAULT 0`, (e) => {
      if (!e) console.log("✅ Added probability column to leads");
    });
  }
});

// Client activity log
db.run(`
    CREATE TABLE IF NOT EXISTS client_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

/* ---------- Accounting: Chart of Accounts ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- Income, Expense, Asset, Liability, Equity
      code TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
  if (!err) {
    // Seed default accounts if empty
    db.get("SELECT count(*) as count FROM accounts", (e, r) => {
      if (!e && r.count === 0) {
        const defaults = [
          ['Sales', 'Income'], ['Service Revenue', 'Income'],
          ['Advertising', 'Expense'], ['Bank Fees', 'Expense'],
          ['Office Supplies', 'Expense'], ['Rent', 'Expense'],
          ['Utilities', 'Expense'], ['Travel', 'Expense'],
          ['Cash on Hand', 'Asset'], ['Bank Account', 'Asset']
        ];
        const stmt = db.prepare("INSERT INTO accounts (business_id, name, type) VALUES (1, ?, ?)");
        defaults.forEach(a => stmt.run(a[0], a[1]));
        stmt.finalize(() => console.log("✅ Default accounts seeded"));
      }
    });
  }
});

/* ---------- Accounting: Transactions ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL, -- INCOME, EXPENSE
      account_id INTEGER,
      client_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

/* ---------- Corporate: Documents & Compliance ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- Legal, Tax, Compliance, Other
      notes TEXT,
      expiry_date TEXT, -- Nullable, for compliance tracking
      status TEXT DEFAULT 'Active',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

// Migration: Add tax_category to accounts if missing
db.all(`PRAGMA table_info(accounts)`, (err, rows) => {
  if (err) return console.error("❌ Failed to check accounts schema:", err.message);

  const hasTax = rows.some(r => r.name === 'tax_category');
  if (!hasTax) {
    db.run(`ALTER TABLE accounts ADD COLUMN tax_category TEXT`, (e) => {
      if (!e) {
        console.log("✅ Added tax_category column to accounts");
        // Seed default tax categories
        const updates = [
          ['Advertising', 'Advertising'],
          ['Bank Fees', 'Bank charges'],
          ['Office Supplies', 'Office expenses'],
          ['Rent', 'Rent or lease'],
          ['Utilities', 'Utilities'],
          ['Travel', 'Travel'],
          ['Legal Fees', 'Legal and professional services'],
          ['Software', 'Office expenses']
        ];
        const stmt = db.prepare("UPDATE accounts SET tax_category = ? WHERE name = ?");
        updates.forEach(u => stmt.run(u[1], u[0]));
        stmt.finalize();
      }
    });
  }
});

/* ---------- Invoicing ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      date TEXT NOT NULL,
      due_date TEXT,
      status TEXT DEFAULT 'Draft', -- Draft, Sent, Paid, Void
      total_amount REAL NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )
  `);

db.run(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity REAL DEFAULT 1,
      unit_price REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      FOREIGN KEY (invoice_id) REFERENCES invoices(id)
    )
  `);

/* ---------- Inventory ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'Service', -- Service, Product
      price REAL DEFAULT 0,
      description TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

/* ---------- Client Documents ---------- */
db.run(`
     CREATE TABLE IF NOT EXISTS client_documents (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       client_id INTEGER NOT NULL,
       name TEXT NOT NULL,
       type TEXT,
       notes TEXT,
       file_path TEXT,
       created_at TEXT DEFAULT CURRENT_TIMESTAMP,
       FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
     )
   `);

/* ---------- Tasks Management ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      business_id INTEGER NOT NULL,
      client_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'Pending',
      due_date TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (business_id) REFERENCES businesses(id),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

/* ---------- Content Ops OS ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS content_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER NOT NULL,
      platform TEXT NOT NULL,
      title TEXT NOT NULL,
      caption TEXT,
      hashtags TEXT,
      status TEXT DEFAULT 'IDEA',
      scheduled_date TEXT,
      posted_date TEXT,
      cta_hook TEXT,
      media_path TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

// Migration for content_items (adding new columns if they don't exist)
db.serialize(() => {
  db.all("PRAGMA table_info(content_items)", (err, columns) => {
    if (err) return;
    const hasCta = columns.some(c => c.name === 'cta_hook');
    const hasMedia = columns.some(c => c.name === 'media_path');
    if (!hasCta) db.run("ALTER TABLE content_items ADD COLUMN cta_hook TEXT");
    if (!hasMedia) db.run("ALTER TABLE content_items ADD COLUMN media_path TEXT");
  });
});

db.run(`
    CREATE TABLE IF NOT EXISTS content_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (content_id) REFERENCES content_items(id) ON DELETE CASCADE
    )
  `);

db.run(`
    CREATE TABLE IF NOT EXISTS caption_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      platform TEXT,
      caption TEXT NOT NULL,
      tags TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

db.run(`
    CREATE TABLE IF NOT EXISTS hashtag_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER,
      platform TEXT,
      hashtags TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    )
  `);

/* ---------- Settings ---------- */
db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

// Seed default settings if empty
db.get("SELECT count(*) as count FROM settings", (err, row) => {
  if (!err && row.count === 0) {
    const defaults = [
      ['business_name', 'My Business'],
      ['address', '123 Main St, City, State'],
      ['phone', '555-1234'],
      ['email', 'contact@example.com'],
      ['currency', 'USD']
    ];
    const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
    defaults.forEach(d => stmt.run(d[0], d[1]));
    stmt.finalize();
  }
});

module.exports = db;
