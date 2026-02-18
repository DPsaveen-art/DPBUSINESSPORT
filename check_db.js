const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'app', 'database', 'dp_business_portfolio.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('Checking database:', dbPath);

db.all("PRAGMA table_info(content_items)", (err, columns) => {
    if (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
    console.log('Columns in content_items:');
    columns.forEach(c => console.log(` - ${c.name} (${c.type})`));
    db.close();
});
