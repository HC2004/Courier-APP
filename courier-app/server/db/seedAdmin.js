// server/db/seedAdmin.js
// Создаёт первого администратора. Запускать вручную один раз:
//   node server/db/seedAdmin.js имя_пользователя пароль
//
// Если админ с таким именем уже есть — скрипт скажет об этом и ничего не сломает.

const bcrypt = require('bcryptjs');
const db = require('./database');

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.log('Использование: node server/db/seedAdmin.js <имя_пользователя> <пароль>');
  process.exit(1);
}

if (password.length < 6) {
  console.log('Пароль должен быть не короче 6 символов.');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);

if (existing) {
  console.log(`Админ "${username}" уже существует. Ничего не создано.`);
  process.exit(0);
}

const passwordHash = bcrypt.hashSync(password, 10);

db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(username, passwordHash);

console.log(`Готово. Админ "${username}" создан. Теперь можешь войти через /login.`);
