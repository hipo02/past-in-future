const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Datenbank-Datei im gleichen Verzeichnis erstellen
const dbPath = path.join(__dirname, 'users.db');
const db = new sqlite3.Database(dbPath);

// Benutzer-Tabelle erstellen
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

module.exports = db; 