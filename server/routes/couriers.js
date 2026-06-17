// server/routes/couriers.js
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db/database');
const { fetchInstagramProfile } = require('../services/instagramParser');

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Разрешены только изображения (jpeg, png, webp, gif)'));
    }
  },
});

function generateTrackingToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Скачивает аватар по URL и сохраняет локально (ссылки Instagram CDN протухают)
async function downloadAvatar(avatarUrl) {
  try {
    const response = await fetch(avatarUrl, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    const ext = contentType.includes('png') ? '.png' : '.jpg';
    const filename = `${crypto.randomUUID()}${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(filepath, buffer);

    return `/uploads/${filename}`;
  } catch {
    return null;
  }
}

// --- Попытка спарсить профиль Instagram (без сохранения, просто предпросмотр) ---
router.post('/api/instagram/fetch', async (req, res) => {
  const { instagramUrl } = req.body || {};

  if (!instagramUrl) {
    return res.status(400).json({ error: 'Укажите ссылку на профиль Instagram' });
  }

  const result = await fetchInstagramProfile(instagramUrl);

  if (!result.success) {
    const messages = {
      invalid_url: 'Некорректная ссылка на профиль',
      blocked: 'Instagram заблокировал запрос (защита от ботов). Заполните данные вручную',
      rate_limited: 'Слишком много запросов к Instagram. Попробуйте позже или заполните вручную',
      login_wall: 'Instagram требует авторизацию для просмотра этого профиля. Заполните данные вручную',
      no_data_found: 'Не удалось найти данные на странице. Профиль может быть приватным. Заполните вручную',
      network_error: 'Не удалось подключиться к Instagram. Заполните данные вручную',
    };

    return res.json({
      success: false,
      reason: result.reason,
      message: messages[result.reason] || 'Не удалось получить данные. Заполните вручную',
    });
  }

  // Скачиваем аватар локально, чтобы не зависеть от протухающих ссылок Instagram CDN
  let localAvatarPath = null;
  if (result.avatarUrl) {
    localAvatarPath = await downloadAvatar(result.avatarUrl);
  }

  return res.json({
    success: true,
    username: result.username,
    displayName: result.displayName,
    bio: result.bio,
    followers: result.followers,
    following: result.following,
    avatarPath: localAvatarPath,
  });
});

// --- Создание курьера ---
router.post('/api/couriers', upload.single('avatarFile'), async (req, res) => {
  const {
    fullName,
    instagramUrl,
    instagramUsername,
    bio,
    followersCount,
    followingCount,
    phone,
    notes,
    avatarPath, // путь, который уже скачан через /api/instagram/fetch
  } = req.body || {};

  if (!fullName || !fullName.trim()) {
    return res.status(400).json({ error: 'Укажите имя курьера' });
  }

  let finalAvatarPath = avatarPath || null;
  if (req.file) {
    finalAvatarPath = `/uploads/${req.file.filename}`;
  }

  const trackingToken = generateTrackingToken();

  const result = db
    .prepare(
      `INSERT INTO couriers
       (full_name, instagram_url, instagram_username, bio, avatar_path, followers_count, following_count, tracking_token, phone, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fullName.trim(),
      instagramUrl || null,
      instagramUsername || null,
      bio || null,
      finalAvatarPath,
      followersCount || null,
      followingCount || null,
      trackingToken,
      phone || null,
      notes || null
    );

  const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(result.lastInsertRowid);

  return res.status(201).json({ success: true, courier });
});

// --- Список курьеров (с поиском по имени/никнейму) ---
router.get('/api/couriers', (req, res) => {
  const { search } = req.query;

  let couriers;
  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    couriers = db
      .prepare(
        `SELECT * FROM couriers
         WHERE full_name LIKE ? OR instagram_username LIKE ?
         ORDER BY created_at DESC`
      )
      .all(q, q);
  } else {
    couriers = db.prepare('SELECT * FROM couriers ORDER BY created_at DESC').all();
  }

  // Подмешиваем последнюю известную точку для каждого курьера
  const withLocation = couriers.map((c) => {
    const lastLoc = db
      .prepare(
        `SELECT latitude, longitude, recorded_at FROM locations
         WHERE courier_id = ? ORDER BY recorded_at DESC LIMIT 1`
      )
      .get(c.id);
    return { ...c, lastLocation: lastLoc || null };
  });

  return res.json({ couriers: withLocation });
});

// --- Один курьер ---
router.get('/api/couriers/:id', (req, res) => {
  const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(req.params.id);
  if (!courier) return res.status(404).json({ error: 'Курьер не найден' });

  const lastLoc = db
    .prepare(
      `SELECT latitude, longitude, accuracy, recorded_at FROM locations
       WHERE courier_id = ? ORDER BY recorded_at DESC LIMIT 1`
    )
    .get(courier.id);

  return res.json({ courier: { ...courier, lastLocation: lastLoc || null } });
});

// --- Удаление курьера ---
router.delete('/api/couriers/:id', (req, res) => {
  const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(req.params.id);
  if (!courier) return res.status(404).json({ error: 'Курьер не найден' });

  db.prepare('DELETE FROM couriers WHERE id = ?').run(req.params.id);

  return res.json({ success: true });
});

// --- Ссылка для курьера (чтобы открыть страницу геолокации) ---
router.get('/api/couriers/:id/tracking-link', (req, res) => {
  const courier = db.prepare('SELECT tracking_token FROM couriers WHERE id = ?').get(req.params.id);
  if (!courier) return res.status(404).json({ error: 'Курьер не найден' });

  return res.json({ link: `/courier/${courier.tracking_token}` });
});

module.exports = router;
