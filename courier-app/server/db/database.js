// server/db/database.js
// Слой базы данных. Использует встроенный в Node.js модуль node:sqlite (Node 22+).
// Если на сервере другая версия Node — см. README.md, раздел "Требования".

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DB_DIR, 'courier.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Включаем поддержку внешних ключей
db.exec('PRAGMA foreign_keys = ON;');

// --- Схема таблиц ---

db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS couriers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    instagram_url TEXT,
    instagram_username TEXT,
    bio TEXT,
    avatar_path TEXT,
    followers_count TEXT,
    following_count TEXT,
    tracking_token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    phone TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    courier_id INTEGER NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    accuracy REAL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (courier_id) REFERENCES couriers(id) ON DELETE CASCADE
  );
`);

// Индекс для быстрого поиска последней точки курьера
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_locations_courier_time
  ON locations(courier_id, recorded_at DESC);
`);

module.exports = db;
