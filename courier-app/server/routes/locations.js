// server/routes/locations.js
const express = require('express');
const db = require('../db/database');

const router = express.Router();

// --- Курьер отправляет свою геолокацию (с его собственного устройства, по согласию) ---
// Это публичный (без логина-админа) роут, защищён только уникальным токеном курьера,
// который знает только он (получает от админа персональной ссылкой).
router.post('/api/track/:token', (req, res) => {
  const { token } = req.params;
  const { latitude, longitude, accuracy } = req.body || {};

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return res.status(400).json({ error: 'Некорректные координаты' });
  }

  const courier = db.prepare('SELECT id FROM couriers WHERE tracking_token = ?').get(token);

  if (!courier) {
    return res.status(404).json({ error: 'Ссылка недействительна' });
  }

  db.prepare(
    `INSERT INTO locations (courier_id, latitude, longitude, accuracy) VALUES (?, ?, ?, ?)`
  ).run(courier.id, latitude, longitude, accuracy || null);

  db.prepare(`UPDATE couriers SET status = 'online' WHERE id = ?`).run(courier.id);

  return res.json({ success: true });
});

// --- Курьер сообщает, что закончил смену (остановил трансляцию геолокации) ---
router.post('/api/track/:token/stop', (req, res) => {
  const { token } = req.params;
  const courier = db.prepare('SELECT id FROM couriers WHERE tracking_token = ?').get(token);

  if (!courier) {
    return res.status(404).json({ error: 'Ссылка недействительна' });
  }

  db.prepare(`UPDATE couriers SET status = 'offline' WHERE id = ?`).run(courier.id);

  return res.json({ success: true });
});

// --- Получить имя курьера по токену (для страницы курьера, чтобы показать "Привет, Имя") ---
router.get('/api/track/:token/info', (req, res) => {
  const { token } = req.params;
  const courier = db
    .prepare('SELECT full_name, status FROM couriers WHERE tracking_token = ?')
    .get(token);

  if (!courier) {
    return res.status(404).json({ error: 'Ссылка недействительна' });
  }

  return res.json({ fullName: courier.full_name, status: courier.status });
});

// --- Для админа: история точек конкретного курьера (например, маршрут за сегодня) ---
router.get('/api/couriers/:id/locations', (req, res) => {
  const { id } = req.params;
  const { limit } = req.query;

  const rows = db
    .prepare(
      `SELECT latitude, longitude, accuracy, recorded_at FROM locations
       WHERE courier_id = ? ORDER BY recorded_at DESC LIMIT ?`
    )
    .all(id, Number(limit) || 200);

  return res.json({ locations: rows });
});

// --- Для админа: все текущие позиции всех курьеров (для карты) ---
router.get('/api/locations/live', (req, res) => {
  const couriers = db.prepare('SELECT id, full_name, avatar_path, status FROM couriers').all();

  const live = couriers.map((c) => {
    const lastLoc = db
      .prepare(
        `SELECT latitude, longitude, accuracy, recorded_at FROM locations
         WHERE courier_id = ? ORDER BY recorded_at DESC LIMIT 1`
      )
      .get(c.id);

    return {
      id: c.id,
      fullName: c.full_name,
      avatarPath: c.avatar_path,
      status: c.status,
      location: lastLoc || null,
    };
  });

  return res.json({ couriers: live });
});

module.exports = router;
