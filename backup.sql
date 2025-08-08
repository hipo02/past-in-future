-- Benutzerdaten SQL Backup

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    photo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (username, email, password, photo, created_at) VALUES (
    'M.92',
    'Mohammad226mohammadi@gmail.com',
    'asdfghjklöä',
    '',
    '2025-04-04 20:41:38'
);

INSERT INTO users (username, email, password, photo, created_at) VALUES (
    'm.2',
    'mohammad226mohammadi@gmail.com',
    'asdfghjklöä',
    '',
    '2025-04-04 21:00:48'
);

