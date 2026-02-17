const db = require("./database/db");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "DP Business Portfolio",
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../ui/index.html"));

  // Fetch active business
  db.get(
    `SELECT name FROM businesses ORDER BY id ASC LIMIT 1`,
    (err, row) => {
      if (err) {
        console.error("❌ Failed to fetch business:", err.message);
      } else if (row) {
        mainWindow.webContents.on("did-finish-load", () => {
          mainWindow.webContents.send("business-data", row);
        });
      }
    }
  );
}

// Delete Product
ipcMain.on("delete-product", (event, id) => {
  db.run("DELETE FROM products WHERE id = ?", [id], (err) => {
    if (err) console.error(err.message);
    else event.reply("product-deleted");
  });
});

/* =====================================================
   CLIENT IPC
===================================================== */

// Save client
ipcMain.on("save-client", (event, client) => {
  const { business_id, name, email, phone, notes } = client;

  db.run(
    `INSERT INTO clients (business_id, name, email, phone, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [business_id, name, email, phone, notes],
    function (err) {
      if (err) {
        console.error("❌ Failed to save client:", err.message);
      } else {
        const clientId = this.lastID;

        // Log activity
        db.run(
          `INSERT INTO client_activities (client_id, action)
           VALUES (?, ?)`,
          [clientId, "Client created"]
        );

        event.reply("client-saved");
      }
    }
  );
});

// Fetch clients
ipcMain.on("get-clients", (event, businessId) => {
  db.all(
    `SELECT * FROM clients
     WHERE business_id = ?
     ORDER BY created_at DESC`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch clients:", err.message);
      } else {
        event.reply("clients-data", rows);
      }
    }
  );
});

// Fetch single client
ipcMain.on("get-client-by-id", (event, id) => {
  db.get(
    `SELECT * FROM clients WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        console.error("❌ Failed to fetch client:", err.message);
      } else {
        event.reply("client-data", row);
      }
    }
  );
});

// Fetch single client for docs
ipcMain.on("get-client-by-id-for-docs", (event, id) => {
  db.get(
    `SELECT * FROM clients WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        console.error("❌ Failed to fetch client for docs:", err.message);
      } else {
        event.reply("client-data-for-docs", row);
      }
    }
  );
});

// Update client
ipcMain.on("update-client", (event, client) => {
  const { id, name, email, phone, notes } = client;

  db.run(
    `UPDATE clients
     SET name = ?, email = ?, phone = ?, notes = ?
     WHERE id = ?`,
    [name, email, phone, notes, id],
    function (err) {
      if (err) {
        console.error("❌ Failed to update client:", err.message);
      } else {
        // Log activity
        db.run(
          `INSERT INTO client_activities (client_id, action)
           VALUES (?, ?)`,
          [id, "Client updated"]
        );

        event.reply("client-updated");
      }
    }
  );
});

// Delete client
ipcMain.on("delete-client", (event, id) => {
  db.run(`DELETE FROM clients WHERE id = ?`, [id], function (err) {
    if (err) {
      console.error("❌ Failed to delete client:", err.message);
    } else {
      event.reply("client-deleted");
    }
  });
});

/* =====================================================
   LEADS IPC
===================================================== */

// Save Lead
ipcMain.on("save-lead", (event, lead) => {
  const { business_id, name, email, phone, notes, status, expected_value, probability } = lead;

  db.run(
    `INSERT INTO leads (business_id, name, email, phone, notes, status, expected_value, probability)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [business_id, name, email, phone, notes, status || 'New', expected_value || 0, probability || 0],
    function (err) {
      if (err) {
        console.error("❌ Failed to save lead:", err.message);
      } else {
        event.reply("lead-saved");
      }
    }
  );
});

// Fetch Leads
ipcMain.on("get-leads", (event, businessId) => {
  db.all(
    `SELECT * FROM leads
     WHERE business_id = ?
     ORDER BY created_at DESC`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch leads:", err.message);
      } else {
        event.reply("leads-data", rows);
      }
    }
  );
});

// Fetch single Lead (NEW — required for Lead Detail page)
ipcMain.on("get-lead-by-id", (event, id) => {
  db.get(
    `SELECT * FROM leads WHERE id = ?`,
    [id],
    (err, row) => {
      if (err) {
        console.error("❌ Failed to fetch lead:", err.message);
      } else {
        event.reply("lead-data", row);
      }
    }
  );
});

// Update Lead
ipcMain.on("update-lead", (event, lead) => {
  const { id, name, email, phone, notes, status, expected_value, probability } = lead;

  db.run(
    `UPDATE leads
     SET name = ?, email = ?, phone = ?, notes = ?, status = ?, expected_value = ?, probability = ?
     WHERE id = ?`,
    [name, email, phone, notes, status, expected_value, probability, id],
    function (err) {
      if (err) {
        console.error("❌ Failed to update lead:", err.message);
      } else {
        // Return updated lead to UI
        db.get(
          `SELECT * FROM leads WHERE id = ?`,
          [id],
          (err2, updatedRow) => {
            if (err2) {
              console.error("❌ Failed to refetch updated lead:", err2.message);
            } else {
              event.reply("lead-updated", updatedRow);
            }
          }
        );
      }
    }
  );
});

// Get Dashboard Stats
ipcMain.on("get-dashboard-stats", (event, businessId) => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const firstDayOfMonth = `${year}-${month}-01`;

  const queries = {
    forecast: `SELECT SUM(expected_value * (probability / 100.0)) as val FROM leads WHERE business_id = ? AND status != 'Converted'`,
    revenue: `SELECT SUM(amount) as val FROM transactions WHERE business_id = ? AND type = 'Income' AND date >= ?`,
    expenses: `SELECT SUM(amount) as val FROM transactions WHERE business_id = ? AND type = 'Expense' AND date >= ?`,
    clients: `SELECT COUNT(*) as val FROM clients WHERE business_id = ?`,
    leads: `SELECT COUNT(*) as val FROM leads WHERE business_id = ? AND status != 'Converted'`,
    forecasted_clients: `SELECT COUNT(*) as val FROM leads WHERE business_id = ? AND (status = 'Proposal' OR status = 'Nurturing' OR probability > 70)`
  };

  const results = {};
  const queryKeys = Object.keys(queries);
  let completed = 0;

  queryKeys.forEach(key => {
    const params = [businessId];
    if (key === 'revenue' || key === 'expenses') params.push(firstDayOfMonth);

    db.get(queries[key], params, (err, row) => {
      results[key] = row ? (row.val || 0) : 0;
      completed++;

      if (completed === queryKeys.length) {
        results.profit = results.revenue - results.expenses;
        event.reply("dashboard-stats", results);
      }
    });
  });
});

/* =====================================================
   ACCOUNTING IPC
===================================================== */

// Get Accounts
ipcMain.on("get-accounts", (event, businessId) => {
  db.all(
    `SELECT * FROM accounts WHERE business_id = ? ORDER BY type, name`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch accounts:", err.message);
      } else {
        event.reply("accounts-data", rows);
      }
    }
  );
});

// Save Transaction
ipcMain.on("save-transaction", (event, txn) => {
  const { business_id, date, description, amount, type, account_id, client_id } = txn;
  db.run(
    `INSERT INTO transactions (business_id, date, description, amount, type, account_id, client_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [business_id, date, description, amount, type, account_id, client_id],
    (err) => {
      if (err) {
        console.error("❌ Failed to save transaction:", err.message);
      } else {
        event.reply("transaction-saved");
      }
    }
  );
});

// Get Transactions
ipcMain.on("get-transactions", (event, data) => {
  const { businessId, month, year } = data;
  let query = `
     SELECT t.*, a.name as account_name, c.name as client_name
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     LEFT JOIN clients c ON t.client_id = c.id
     WHERE t.business_id = ?
  `;
  const params = [businessId];

  if (month && year) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    query += ` AND t.date >= ? AND t.date < ?`;
    params.push(`${year}-${String(month).padStart(2, '0')}-01`);
    params.push(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
  }

  query += ` ORDER BY t.date DESC, t.id DESC LIMIT 100`;

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error("❌ Failed to fetch transactions:", err.message);
    } else {
      event.reply("transactions-data", rows);
    }
  });
});

// Delete Transaction
ipcMain.on("delete-transaction", (event, id) => {
  db.run(`DELETE FROM transactions WHERE id = ?`, [id], (err) => {
    if (err) console.error(err.message);
    else event.reply("transaction-deleted");
  });
});

// Update Report monthly filter as well
ipcMain.on("get-financial-reports", (event, data) => {
  const { businessId, month, year } = data;
  let query = `
        SELECT 
            SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as total_income,
            SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as total_expenses
        FROM transactions
        WHERE business_id = ?
    `;
  const params = [businessId];

  if (month && year) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    query += ` AND date >= ? AND date < ?`;
    params.push(`${year}-${String(month).padStart(2, '0')}-01`);
    params.push(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01`);
  }

  db.get(query, params, (err, row) => {
    if (err) {
      console.error("❌ Failed to generate reports:", err.message);
      event.reply("financial-reports-data", { error: err.message });
    } else {
      const income = row?.total_income || 0;
      const expenses = row?.total_expenses || 0;
      const netProfit = income - expenses;
      const assets = netProfit;
      const equity = netProfit;

      event.reply("financial-reports-data", {
        incomeStatement: { income, expenses, netProfit },
        balanceSheet: { assets, liabilities: 0, equity }
      });
    }
  });
});

/* =====================================================
   CORPORATE IPC (DOCUMENTS & COMPLIANCE)
===================================================== */

// Get Documents
ipcMain.on("get-documents", (event, businessId) => {
  db.all(
    `SELECT * FROM documents WHERE business_id = ? ORDER BY type, name`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch documents:", err.message);
      } else {
        event.reply("documents-data", rows);
      }
    }
  );
});

// Get Client Documents
ipcMain.on("get-client-documents", (event, clientId) => {
  db.all(
    `SELECT * FROM client_documents WHERE client_id = ? ORDER BY created_at DESC`,
    [clientId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch client documents:", err.message);
      } else {
        event.reply("client-documents-data", rows);
      }
    }
  );
});

// Save Client Document
ipcMain.on("save-client-document", (event, doc) => {
  const { client_id, name, type, notes, file_path } = doc;
  db.run(
    `INSERT INTO client_documents (client_id, name, type, notes, file_path) VALUES (?, ?, ?, ?, ?)`,
    [client_id, name, type, notes, file_path],
    (err) => {
      if (err) {
        console.error("❌ Failed to save client document:", err.message);
      } else {
        event.reply("client-document-saved");
      }
    }
  );
});

// Delete Client Document
ipcMain.on("delete-client-document", (event, id) => {
  db.run(`DELETE FROM client_documents WHERE id = ?`, [id], (err) => {
    if (err) console.error(err.message);
    else event.reply("client-document-deleted");
  });
});

// Save Document
ipcMain.on("save-document", (event, doc) => {
  const { business_id, name, type, notes, expiry_date } = doc;
  db.run(
    `INSERT INTO documents (business_id, name, type, notes, expiry_date) VALUES (?, ?, ?, ?, ?)`,
    [business_id, name, type, notes, expiry_date],
    (err) => {
      if (err) {
        console.error("❌ Failed to save document:", err.message);
      } else {
        event.reply("document-saved");
      }
    }
  );
});

// Get Compliance Alerts (Expiring in 30 days)
ipcMain.on("get-compliance-alerts", (event, businessId) => {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  const dateStr = thirtyDaysFromNow.toISOString().split('T')[0];
  const todayStr = new Date().toISOString().split('T')[0];

  db.all(
    `SELECT * FROM documents 
     WHERE business_id = ? 
     AND expiry_date IS NOT NULL 
     AND expiry_date <= ? 
     AND expiry_date >= ?
     ORDER BY expiry_date ASC`,
    [businessId, dateStr, todayStr],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch compliance alerts:", err.message);
      } else {
        event.reply("compliance-alerts-data", rows);
      }
    }
  );
});

/* =====================================================
   TAX PREPARATION IPC
===================================================== */

// Get Tax Report (Expense by Tax Category)
ipcMain.on("get-tax-report", (event, businessId) => {
  db.all(
    `SELECT 
       a.tax_category, 
       SUM(t.amount) as total 
     FROM transactions t
     JOIN accounts a ON t.account_id = a.id
     WHERE t.business_id = ? 
     AND t.type = 'Expense'
     AND a.tax_category IS NOT NULL
     GROUP BY a.tax_category
     ORDER BY total DESC`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to generate tax report:", err.message);
        event.reply("tax-report-data", { error: err.message });
      } else {
        event.reply("tax-report-data", rows);
      }
    }
  );
});

/* =====================================================
   INVOICING IPC
===================================================== */

// Get Invoices
ipcMain.on("get-invoices", (event, businessId) => {
  db.all(
    `SELECT i.*, c.name as client_name 
     FROM invoices i
     JOIN clients c ON i.client_id = c.id
     WHERE i.business_id = ? 
     ORDER BY i.date DESC, i.id DESC`,
    [businessId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch invoices:", err.message);
      } else {
        event.reply("invoices-data", rows);
      }
    }
  );
});

// Save Invoice
ipcMain.on("save-invoice", (event, data) => {
  const { business_id, client_id, invoice_number, date, due_date, items, notes } = data;
  const total_amount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    db.run(
      `INSERT INTO invoices (business_id, client_id, invoice_number, date, due_date, total_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [business_id, client_id, invoice_number, date, due_date, total_amount, notes],
      function (err) {
        if (err) {
          console.error("❌ Failed to insert invoice:", err.message);
          db.run("ROLLBACK");
          return event.reply("invoice-save-error", err.message);
        }

        const invoiceId = this.lastID;
        const stmt = db.prepare(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, amount)
           VALUES (?, ?, ?, ?, ?)`
        );

        items.forEach(item => {
          stmt.run(invoiceId, item.description, item.quantity, item.unit_price, item.quantity * item.unit_price);
        });

        stmt.finalize((err) => {
          if (err) {
            console.error("❌ Failed to insert items:", err.message);
            db.run("ROLLBACK");
            event.reply("invoice-save-error", err.message);
          } else {
            db.run("COMMIT");
            event.reply("invoice-saved");
          }
        });
      }
    );
  });
});

// Get Invoice Details (Items)
ipcMain.on("get-invoice-details", (event, invoiceId) => {
  db.all(
    `SELECT * FROM invoice_items WHERE invoice_id = ?`,
    [invoiceId],
    (err, rows) => {
      if (err) {
        console.error("❌ Failed to fetch invoice items:", err.message);
      } else {
        event.reply("invoice-details-data", { invoiceId, items: rows });
      }
    }
  );
});

// Delete Invoice
ipcMain.on("delete-invoice", (event, invoiceId) => {
  db.serialize(() => {
    db.run("BEGIN TRANSACTION");
    db.run(`DELETE FROM invoice_items WHERE invoice_id = ?`, [invoiceId], (err) => {
      if (err) {
        db.run("ROLLBACK");
        return console.error(err.message);
      }
      db.run(`DELETE FROM invoices WHERE id = ?`, [invoiceId], (err2) => {
        if (err2) {
          db.run("ROLLBACK");
          return console.error(err2.message);
        }
        db.run("COMMIT");
        event.reply("invoice-deleted");
      });
    });
  });
});

// Mark Invoice as Paid
ipcMain.on("mark-invoice-paid", (event, invoiceId) => {
  // 1. Update Invoice Status
  db.run(`UPDATE invoices SET status = 'Paid' WHERE id = ?`, [invoiceId], function (err) {
    if (err) return console.error(err.message);

    // 2. Fetch Invoice info to create Transaction
    db.get(`SELECT * FROM invoices WHERE id = ?`, [invoiceId], (err, inv) => {
      if (err || !inv) return;

      // 3. Find "Sales" account ID (default)
      db.get(`SELECT id FROM accounts WHERE name = 'Sales' AND business_id = ?`, [inv.business_id], (err, acc) => {
        const accountId = acc ? acc.id : null; // Fallback?

        // 4. Create Income Transaction
        db.run(
          `INSERT INTO transactions (business_id, date, description, amount, type, account_id, client_id)
                   VALUES (?, ?, ?, ?, 'Income', ?, ?)`,
          [inv.business_id, new Date().toISOString().split('T')[0], `Invoice Payment: ${inv.invoice_number}`, inv.total_amount, accountId, inv.client_id],
          (err) => {
            if (!err) event.reply("invoice-paid-success");
          }
        );
      });
    });
  });
});

/* =====================================================
   INVENTORY IPC
===================================================== */
// Get Products
ipcMain.on("get-products", (event, businessId) => {
  db.all("SELECT * FROM products WHERE business_id = ?", [businessId], (err, rows) => {
    event.reply("products-data", rows || []);
  });
});

// Save Product
ipcMain.on("save-product", (event, prod) => {
  const { business_id, name, type, price, description } = prod;
  if (prod.id) {
    db.run("UPDATE products SET name=?, type=?, price=?, description=? WHERE id=?",
      [name, type, price, description, prod.id],
      (err) => event.reply("product-saved", err ? { error: err.message } : { success: true }));
  } else {
    db.run("INSERT INTO products (business_id, name, type, price, description) VALUES (?, ?, ?, ?, ?)",
      [business_id, name, type, price, description],
      (err) => event.reply("product-saved", err ? { error: err.message } : { success: true }));
  }
});

/* =====================================================
   SETTINGS & BACKUP IPC
===================================================== */
// Get Settings
ipcMain.on("get-settings", (event) => {
  db.all("SELECT * FROM settings", (err, rows) => {
    const settings = {};
    if (rows) rows.forEach(r => settings[r.key] = r.value);
    event.reply("settings-data", settings);
  });
});

// Save Settings
ipcMain.on("save-settings", (event, settings) => {
  const stmt = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  Object.keys(settings).forEach(key => {
    stmt.run(key, settings[key]);
  });
  stmt.finalize(() => event.reply("settings-saved"));
});

// Backup Data

ipcMain.on("backup-data", async (event) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Backup Database',
    defaultPath: 'dp-business-backup.sqlite',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }]
  });

  if (filePath) {
    fs.copyFile(dbPath, filePath, (err) => {
      event.reply("backup-complete", err ? { error: err.message } : { success: true, path: filePath });
    });
  }
});

// Restore Data
ipcMain.on("restore-data", async (event) => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Restore Database',
    filters: [{ name: 'SQLite Database', extensions: ['sqlite'] }],
    properties: ['openFile']
  });

  if (filePaths && filePaths.length > 0) {
    // ALERT: This is dangerous in a real app (open connections etc). 
    // For this simple app, we'll try to copy over and restart/reload.
    // Ideally we should close DB connection first.
    db.close((closeErr) => {
      if (closeErr) return event.reply("restore-complete", { error: "Could not close DB for restore." });

      fs.copyFile(filePaths[0], dbPath, (copyErr) => {
        if (copyErr) {
          // Try to reopen old db if fail
          db = new sqlite3.Database(dbPath);
          return event.reply("restore-complete", { error: copyErr.message });
        }

        // Reopen and reload
        db = new sqlite3.Database(dbPath);
        event.reply("restore-complete", { success: true });
        // In a real app, might want to relaunch. Here we just say success and client reloads data.
      });
    });
  }
});

/* =====================================================
   APP LIFECYCLE
===================================================== */

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
