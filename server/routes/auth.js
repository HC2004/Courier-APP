// server/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/database');

const router = express.Router();

router.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Введите имя пользователя и пароль' });
  }

  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);

  if (!admin) {
    return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
  }

  const passwordMatches = bcrypt.compareSync(password, admin.password_hash);

  if (!passwordMatches) {
    return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
  }

  req.session.adminId = admin.id;
  req.session.username = admin.username;

  return res.json({ success: true });
});

router.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.get('/api/me', (req, res) => {
  if (req.session && req.session.adminId) {
    return res.json({ authenticated: true, username: req.session.username });
  }
  return res.json({ authenticated: false });
});

module.exports = router;
