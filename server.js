const express = require('express');
const bodyParser = require('body-parser');
const db = require('./database');
const bcrypt = require('bcrypt');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const port = 7000;


// E-Mail-Transporter für Datenbankzugriff
const dbTransporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: 'Mohammad226Mohammadi@gmail.com',
        pass: 'fnte ivdw fiqk ztpe'
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Speicher für Verifizierungscodes
const verificationCodes = new Map();

// Funktion zum Generieren eines zufälligen Codes
function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// CORS aktivieren
app.use(cors());

// Body-Parser vor den Routen
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Session-Konfiguration
app.use(session({
    secret: 'geheimnis123',
    resave: true,
    saveUninitialized: true,
    cookie: { maxAge: 3600000 } // 1 Stunde
}));

// Multer Konfiguration für Foto-Upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'public/uploads';
        if (!fs.existsSync(uploadDir)){
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

// Route für die Startseite
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route zum Anzeigen aller Benutzer
app.get('/api/users', (req, res) => {
    db.all('SELECT id, username, email, created_at FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Abrufen der Benutzer' });
        }
        res.json(rows);
    });
});

// Einfache Version der Admin-Seite
app.get('/admin', (req, res) => {
    db.all('SELECT id, username, email, photo, created_at FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).send('Fehler beim Abrufen der Benutzer');
        }
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Benutzerübersicht</title>
            <style>
                body { font-family: Arial; padding: 20px; }
                .user-card {
                    border: 1px solid #ddd;
                    margin: 10px 0;
                    padding: 15px;
                    border-radius: 8px;
                }
                .user-photo {
                    width: 100px;
                    height: 100px;
                    object-fit: cover;
                    border-radius: 50%;
                    margin-right: 15px;
                }
                .user-info {
                    display: inline-block;
                    vertical-align: top;
                }
            </style>
        </head>
        <body>
            <h1>Benutzerübersicht</h1>
        `;
        
        rows.forEach(user => {
            html += `
            <div class="user-card">
                <img src="${user.photo || 'default-profile.png'}" class="user-photo">
                <div class="user-info">
                    <p><strong>Benutzername:</strong> ${user.username}</p>
                    <p><strong>E-Mail:</strong> ${user.email}</p>
                    <p><strong>Foto:</strong> ${user.photo || 'Kein Foto'}</p>
                    <p><strong>Erstellt am:</strong> ${new Date(user.created_at).toLocaleString('de-DE')}</p>
                </div>
            </div>`;
        });
        
        html += '</body></html>';
        res.send(html);
    });
});

// Registrierung und Benutzerverifizierung
app.post('/api/signup', async (req, res) => {
    const { username, email, password } = req.body;
    console.log('Empfangene Registrierungsdaten:', { username, email, password });
    
    if (!username || !email || !password) {
        console.error('Fehlende Registrierungsdaten');
        return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
    }

    const query = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    const params = [username, email, password];

    db.run(query, params, function(err) {
        if (err) {
            console.error('Registrierungsfehler:', err);
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(400).json({ message: 'Diese E-Mail ist bereits registriert' });
            }
            return res.status(500).json({ message: 'Fehler bei der Registrierung' });
        }
        console.log('Registrierung erfolgreich:', { userId: this.lastID });

        // Bestätigungscode generieren
        const code = generateVerificationCode();
        console.log('Generierter Bestätigungscode:', code);
        verificationCodes.set(email, {
            code: code,
            expires: Date.now() + 120000 // 2 Minuten
        });
    });
});

// Login
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Login' });
        }
        if (!user) {
            return res.status(401).json({ error: 'Benutzer nicht gefunden' });
        }

        if (password === user.password) {
            // Benutzer-ID in der Session speichern
            req.session.userId = user.id;
            res.json({ success: true, userId: user.id });
        } else {
            res.status(401).json({ error: 'Falsches Passwort' });
        }
    });
});

// Benutzerprofil abrufen
app.get('/api/user-profile', (req, res) => {
    const userId = req.session.userId;
    console.log('Session User ID:', userId);
    
    if (!userId) {
        console.log('Keine User ID in der Session gefunden');
        return res.status(401).json({ error: 'Nicht eingeloggt' });
    }

    db.get('SELECT id, username, email, photo FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            console.log('Datenbankfehler:', err);
            return res.status(500).json({ error: 'Fehler beim Abrufen des Profils' });
        }
        if (!user) {
            console.log('Kein Benutzer gefunden für ID:', userId);
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }
        console.log('Gefundener Benutzer:', user);
        res.json({ success: true, user });
    });
});

// Profilfoto hochladen
app.post('/api/upload-photo', upload.single('photo'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Kein Foto hochgeladen' });
    }

    // Hier würden Sie normalerweise die Benutzer-ID aus der Session holen
    const userId = 1; // Beispiel-ID
    const photoPath = '/uploads/' + req.file.filename;

    db.run('UPDATE users SET photo = ? WHERE id = ?', [photoPath, userId], (err) => {
        if (err) {
            return res.status(500).json({ error: 'Fehler beim Speichern des Fotos' });
        }
        res.json({ success: true, photoPath });
    });
});

// Profil aktualisieren
app.post('/api/update-profile', (req, res) => {
    const { username, email, currentPassword, newPassword } = req.body;
    // Hier würden Sie normalerweise die Benutzer-ID aus der Session holen
    const userId = 1; // Beispiel-ID

    db.get('SELECT password FROM users WHERE id = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).json({ error: 'Datenbankfehler' });
        }
        if (!user) {
            return res.status(404).json({ error: 'Benutzer nicht gefunden' });
        }

        if (newPassword) {
            let updateQuery = 'UPDATE users SET username = ?, email = ?, password = ? WHERE id = ?';
            let updateParams = [username, email, newPassword, userId];

            db.run(updateQuery, updateParams, (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Fehler beim Aktualisieren des Profils' });
                }
                res.json({ success: true });
            });
        } else {
            let updateQuery = 'UPDATE users SET username = ?, email = ? WHERE id = ?';
            let updateParams = [username, email, userId];

            db.run(updateQuery, updateParams, (err) => {
                if (err) {
                    return res.status(500).json({ error: 'Fehler beim Aktualisieren des Profils' });
                }
                res.json({ success: true });
            });
        }
    });
});

// Route zum Speichern der Benutzerdaten in eine Datei
app.get('/save-users', (req, res) => {
    db.all('SELECT id, username, email, photo, created_at FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).send('Fehler beim Abrufen der Benutzer');
        }
        
        let text = 'Benutzerdaten:\n\n';
        rows.forEach(user => {
            text += '------------------------\n';
            text += `Benutzername: ${user.username}\n`;
            text += `E-Mail: ${user.email}\n`;
            text += `Foto: ${user.photo || 'Kein Foto'}\n`;
            text += `Erstellt am: ${new Date(user.created_at).toLocaleString('de-DE')}\n`;
            text += '------------------------\n\n';
        });
        
        // In Datei speichern
        fs.writeFile('benutzerdaten.txt', text, (err) => {
            if (err) {
                return res.status(500).send('Fehler beim Speichern der Datei');
            }
            res.download('benutzerdaten.txt');
        });
    });
});

// Route zum Speichern der Benutzerdaten als SQL
app.get('/save-sql', (req, res) => {
    db.all('SELECT id, username, email, photo, password, created_at FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).send('Fehler beim Abrufen der Benutzer');
        }
        
        let sql = '-- Benutzerdaten SQL Backup\n\n';
        sql += 'CREATE TABLE IF NOT EXISTS users (\n';
        sql += '    id INTEGER PRIMARY KEY AUTOINCREMENT,\n';
        sql += '    username TEXT NOT NULL,\n';
        sql += '    email TEXT UNIQUE NOT NULL,\n';
        sql += '    password TEXT NOT NULL,\n';
        sql += '    photo TEXT,\n';
        sql += '    created_at DATETIME DEFAULT CURRENT_TIMESTAMP\n';
        sql += ');\n\n';

        rows.forEach(user => {
            sql += `INSERT INTO users (username, email, password, photo, created_at) VALUES (\n`;
            sql += `    '${user.username}',\n`;
            sql += `    '${user.email}',\n`;
            sql += `    '${user.password}',\n`;
            sql += `    '${user.photo || ''}',\n`;
            sql += `    '${user.created_at}'\n`;
            sql += `);\n\n`;
        });
        
        // In SQL-Datei speichern
        fs.writeFile('backup.sql', sql, (err) => {
            if (err) {
                return res.status(500).send('Fehler beim Speichern der SQL-Datei');
            }
            res.download('backup.sql');
        });
    });
});


// Login-Formular für Datenbankzugriff
app.get('/db-login', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Datenbank Login</title>
            <style>
                :root {
                    --bg-color: #f0f0f0;
                    --text-color: #333;
                    --box-bg: white;
                    --input-border: #ddd;
                    --button-bg: #4CAF50;
                    --button-hover: #45a049;
                    --error-color: #f44336;
                    --success-color: #4CAF50;
                }

                [data-theme="dark"] {
                    --bg-color: #1a1a1a;
                    --text-color: #ffffff;
                    --box-bg: #2d2d2d;
                    --input-border: #404040;
                    --button-bg: #2e7d32;
                    --button-hover: #1b5e20;
                    --error-color: #c62828;
                    --success-color: #2e7d32;
                }

                body {
                    font-family: Arial;
                    padding: 20px;
                    background: var(--bg-color);
                    color: var(--text-color);
                    transition: all 0.3s ease;
                }

                .login-box {
                    background: var(--box-bg);
                    padding: 20px;
                    border-radius: 5px;
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    max-width: 400px;
                    margin: 50px auto;
                }

                input[type="email"], input[type="text"] {
                    width: 100%;
                    padding: 10px;
                    margin: 10px 0;
                    border: 1px solid var(--input-border);
                    border-radius: 3px;
                    background: var(--box-bg);
                    color: var(--text-color);
                }

                button {
                    background: var(--button-bg);
                    color: white;
                    padding: 10px 20px;
                    border: none;
                    border-radius: 3px;
                    cursor: pointer;
                    width: 100%;
                    margin-top: 10px;
                }

                button:hover {
                    background: var(--button-hover);
                }

                .error {
                    color: var(--error-color);
                    margin-bottom: 10px;
                }

                .success {
                    color: var(--success-color);
                    margin-bottom: 10px;
                }

                .theme-switch {
                    text-align: center;
                    margin-top: 20px;
                }

                .theme-switch button {
                    width: auto;
                    background: var(--button-bg);
                }
            </style>
        </head>
        <body>
            <div class="login-box">
                <h2>Datenbank Zugriff</h2>
                ${req.query.error ? '<p class="error">Falscher Code</p>' : ''}
                ${req.query.sent ? '<p class="success">Code wurde per E-Mail gesendet</p>' : ''}
                <form action="/request-db-code" method="POST" id="emailForm" style="${req.query.sent ? 'display:none;' : ''}">
                    <input type="email" name="email" placeholder="E-Mail Adresse eingeben" required>
                    <button type="submit">Code anfordern</button>
                </form>
                <form action="/verify-code" method="POST" id="codeForm" style="${!req.query.sent ? 'display:none;' : ''}">
                    <input type="text" name="code" placeholder="Code eingeben" required>
                    <button type="submit">Verifizieren</button>
                </form>
            </div>
            <div class="theme-switch">
                <button onclick="toggleTheme()">Theme wechseln 🌓</button>
            </div>
            <script>
                // Theme aus localStorage laden oder Standard (light) setzen
                const currentTheme = localStorage.getItem('theme') || 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);

                // Theme umschalten
                function toggleTheme() {
                    const current = document.documentElement.getAttribute('data-theme');
                    const newTheme = current === 'light' ? 'dark' : 'light';
                    
                    document.documentElement.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                }
            </script>
        </body>
        </html>
    `);
});

// E-Mail mit Code senden für Datenbankzugriff
app.post('/request-db-code', (req, res) => {
    const { email } = req.body;
    if (email !== 'uipo3506@gmail.com') {
        return res.status(403).send('Zugriff verweigert: Unberechtigte E-Mail-Adresse');
    }
    const code = generateVerificationCode();
    verificationCodes.set(email, {
        code: code,
        expires: Date.now() + 600000 // 10 Minuten
    });
    const mailOptions = {
        from: 'Mohammad226Mohammadi@gmail.com',
        to: email,
        subject: 'Ihr Datenbank-Zugriffscode',
        html: `
            <div style="font-family: Arial; padding: 20px; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Ihr Verifizierungscode</h2>
                <p>Bitte verwenden Sie diesen Code, um auf die Datenbank zuzugreifen:</p>
                <div style="font-size: 24px; font-weight: bold; color: #4CAF50; margin: 20px 0; letter-spacing: 3px; padding: 10px; background: #f5f5f5; border-radius: 5px; text-align: center;">
                    ${code}
                </div>
                <p>Der Code ist 10 Minuten gültig.</p>
                <p style="color: #666; font-size: 12px;">Dies ist eine automatisch generierte E-Mail. Bitte antworten Sie nicht darauf.</p>
            </div>
        `
    };
    dbTransporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.error('E-Mail-Fehler:', error);
            return res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Fehler</title>
                    <style>
                        body { font-family: Arial; padding: 20px; background: #f0f0f0; }
                        .error-box {
                            background: white;
                            padding: 20px;
                            border-radius: 5px;
                            box-shadow: 0 0 10px rgba(0,0,0,0.1);
                            max-width: 400px;
                            margin: 50px auto;
                            text-align: center;
                        }
                        .error-message {
                            color: red;
                            margin: 20px 0;
                        }
                        .button {
                            background: #4CAF50;
                            color: white;
                            padding: 10px 20px;
                            text-decoration: none;
                            border-radius: 3px;
                            display: inline-block;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-box">
                        <h2>Fehler beim Senden der E-Mail</h2>
                        <p class="error-message">${error.message}</p>
                        <a href="/db-login" class="button">Zurück zum Login</a>
                    </div>
                </body>
                </html>
            `);
        }
        res.redirect('/db-login?sent=true');
    });
});


// Geschützte Datenbank-Ansicht
app.get('/db-view', (req, res) => {
    console.log('Session Status:', req.session);
    console.log('DB Access Status:', req.session.dbAccess);
    
    // Prüfen ob Benutzer eingeloggt ist
    if (!req.session.dbAccess) {
        console.log('Kein Zugriff - Weiterleitung zum Login');
        return res.redirect('/db-login');
    }

    console.log('Zugriff gewährt - Zeige Datenbank');
    db.all('SELECT id, username, email, password, photo, created_at FROM users', [], (err, rows) => {
        if (err) {
            return res.status(500).send('Datenbankfehler');
        }
        
        let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Datenbank Inhalt</title>
            <style>
                :root {
                    --bg-color: #f0f0f0;
                    --text-color: #333;
                    --table-bg: white;
                    --table-border: #ddd;
                    --table-hover: #f5f5f5;
                    --table-stripe: #f9f9f9;
                    --header-bg: #4CAF50;
                    --header-text: white;
                    --logout-bg: #f44336;
                    --logout-hover: #da190b;
                }

                [data-theme="dark"] {
                    --bg-color: #1a1a1a;
                    --text-color: #ffffff;
                    --table-bg: #2d2d2d;
                    --table-border: #404040;
                    --table-hover: #3d3d3d;
                    --table-stripe: #333333;
                    --header-bg: #2e7d32;
                    --header-text: #ffffff;
                    --logout-bg: #c62828;
                    --logout-hover: #b71c1c;
                }

                body {
                    font-family: Arial;
                    padding: 20px;
                    background: var(--bg-color);
                    color: var(--text-color);
                    transition: all 0.3s ease;
                }

                .container {
                    max-width: 1200px;
                    margin: 0 auto;
                }

                table {
                    width: 100%;
                    border-collapse: collapse;
                    background: var(--table-bg);
                    box-shadow: 0 0 10px rgba(0,0,0,0.1);
                    margin-top: 20px;
                }

                th, td {
                    padding: 12px;
                    text-align: left;
                    border-bottom: 1px solid var(--table-border);
                }

                th {
                    background: var(--header-bg);
                    color: var(--header-text);
                }

                tr:nth-child(even) {
                    background: var(--table-stripe);
                }

                tr:hover {
                    background: var(--table-hover);
                }

                .photo-cell img {
                    max-width: 100px;
                    height: auto;
                    border-radius: 5px;
                }

                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }

                .controls {
                    display: flex;
                    gap: 20px;
                    align-items: center;
                }

                .logout {
                    background: var(--logout-bg);
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 3px;
                }

                .logout:hover {
                    background: var(--logout-hover);
                }

                .theme-switch {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .theme-switch button {
                    background: var(--header-bg);
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 3px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 16px;
                }

                .theme-switch button:hover {
                    opacity: 0.9;
                }

                .theme-icon {
                    font-size: 20px;
                }

                [data-theme="dark"] .theme-icon-sun {
                    display: none;
                }

                [data-theme="light"] .theme-icon-moon {
                    display: none;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>SQLite Datenbank Inhalt</h1>
                    <div class="controls">
                        <div class="theme-switch">
                            <button onclick="toggleTheme()" id="themeButton">
                                <span class="theme-icon theme-icon-sun">☀️</span>
                                <span class="theme-icon theme-icon-moon">🌙</span>
                                <span id="themeText">Dark Mode</span>
                            </button>
                        </div>
                        <a href="/db-logout" class="logout">Abmelden</a>
                    </div>
                </div>
                <table>
                    <tr>
                        <th>ID</th>
                        <th>Benutzername</th>
                        <th>E-Mail</th>
                        <th>Passwort</th>
                        <th>Foto</th>
                        <th>Erstellt am</th>
                    </tr>`;
                    
        rows.forEach(user => {
            html += `
                <tr>
                    <td>${user.id}</td>
                    <td>${user.username}</td>
                    <td>${user.email}</td>
                    <td>${user.password}</td>
                    <td class="photo-cell">${user.photo ? `<img src="${user.photo}" alt="Profilbild">` : 'Kein Foto'}</td>
                    <td>${new Date(user.created_at).toLocaleString('de-DE')}</td>
                </tr>`;
        });
        
        html += `
                </table>
            </div>
            <form id="deleteUserForm">
                <input type="email" id="userEmail" placeholder="E-Mail des Benutzers" required>
                <button type="submit">Benutzer löschen</button>
            </form>
            <div id="deleteMessage"></div>
            <script>
                // Theme aus localStorage laden oder Standard (light) setzen
                const currentTheme = localStorage.getItem('theme') || 'light';
                document.documentElement.setAttribute('data-theme', currentTheme);
                updateThemeButton();

                // Theme umschalten
                function toggleTheme() {
                    const current = document.documentElement.getAttribute('data-theme');
                    const newTheme = current === 'light' ? 'dark' : 'light';
                    
                    document.documentElement.setAttribute('data-theme', newTheme);
                    localStorage.setItem('theme', newTheme);
                    updateThemeButton();
                }

                // Button-Text und Icon aktualisieren
                function updateThemeButton() {
                    const theme = document.documentElement.getAttribute('data-theme');
                    const themeText = document.getElementById('themeText');
                    themeText.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
                }

                document.getElementById('deleteUserForm').addEventListener('submit', function(event) {
                    event.preventDefault();
                    const email = document.getElementById('userEmail').value;

                    fetch('/api/delete-user', {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({ email: email })
                    })
                    .then(response => response.json())
                    .then(data => {
                        document.getElementById('deleteMessage').textContent = data.message;
                    })
                    .catch(error => {
                        console.error('Fehler beim Löschen des Benutzers:', error);
                        document.getElementById('deleteMessage').textContent = 'Fehler beim Löschen des Benutzers';
                    });
                });
            </script>
        </body>
        </html>`;
        
        res.send(html);
    });
});

// Abmelden
app.get('/db-logout', (req, res) => {
    req.session.dbAccess = false;
    res.redirect('/db-login');
});

// Chat-Routen
app.get('/chat.html', (req, res) => {
    if (!req.session.userId) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/check-session', (req, res) => {
    res.json({ loggedIn: !!req.session.userId });
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout-Fehler:', err);
            return res.status(500).json({ error: 'Fehler beim Abmelden' });
        }
        res.json({ success: true });
    });
});

// Benutzer löschen
app.delete('/api/delete-user', (req, res) => {
    const { email } = req.body; // oder verwenden Sie eine andere eindeutige Kennung wie userId

    const query = 'DELETE FROM users WHERE email = ?';
    db.run(query, [email], function(err) {
        if (err) {
            console.error('Fehler beim Löschen des Benutzers:', err);
            return res.status(500).json({ message: 'Fehler beim Löschen des Benutzers' });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Benutzer nicht gefunden' });
        }
        res.json({ message: 'Benutzer erfolgreich gelöscht' });
    });
});


app.use((req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' blob:;");
    next();
});

app.get('/user-info', (req, res) => {
    const userId = req.session.userId;
    if (!userId) {
        return res.status(401).send('Nicht eingeloggt');
    }

    db.get('SELECT id, username, email, photo FROM users WHERE email = ?', [userId], (err, user) => {
        if (err) {
            return res.status(500).send('Fehler beim Abrufen der Benutzerinformationen');
        }
        if (!user) {
            return res.status(404).send('Benutzer nicht gefunden');
        }
        res.json(user);
    });
});

app.listen(port, () => {
    console.log(`Server läuft auf http://localhost:${port}`);
}); 