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
  limits: { fileSize: 5 * 1024 * 1024 },
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

// --- НОВЫЙ ЭНДПОИНТ ДЛЯ РУЧНОГО ИМПОРТА ЧЕРЕЗ БУКМАРКЛЕТ ---
router.post('/api/instagram/manual-import', (req, res) => {
  const { name, username, avatar, bio, followers } = req.body;
  // Возвращаем данные в том же формате, что и автоматический парсер
  res.json({
    success: true,
    username: username,
    displayName: name,
    bio: bio,
    followers: followers,
    avatarPath: avatar // В данном случае мы берем прямой URL из инсты
  });
});

// --- Автоматический парсинг ---
router.post('/api/instagram/fetch', async (req, res) => {
  const { instagramUrl } = req.body || {};
  if (!instagramUrl) return res.status(400).json({ error: 'Укажите ссылку' });
  const result = await fetchInstagramProfile(instagramUrl);
  if (!result.success) {
    return res.json({ success: false, message: 'Не удалось получить данные. Заполните вручную' });
  }
  let localAvatarPath = result.avatarUrl ? await downloadAvatar(result.avatarUrl) : null;
  return res.json({ success: true, ...result, avatarPath: localAvatarPath });
});

// --- Создание курьера ---
router.post('/api/couriers', upload.single('avatarFile'), async (req, res) => {
  const { fullName, instagramUrl, instagramUsername, bio, followersCount, phone, notes, avatarPath } = req.body || {};
  if (!fullName) return res.status(400).json({ error: 'Укажите имя' });
  
  let finalAvatarPath = req.file ? `/uploads/${req.file.filename}` : avatarPath;
  const trackingToken = generateTrackingToken();

  const result = db.prepare(
    `INSERT INTO couriers (full_name, instagram_url, instagram_username, bio, avatar_path, followers_count, tracking_token, phone, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(fullName, instagramUrl, instagramUsername, bio, finalAvatarPath, followersCount, trackingToken, phone, notes);

  const courier = db.prepare('SELECT * FROM couriers WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ success: true, courier });
});

// --- Остальные методы (GET, DELETE) ---
router.get('/api/couriers', (req, res) => {
  const couriers = db.prepare('SELECT * FROM couriers ORDER BY created_at DESC').all();
  return res.json({ couriers });
});

router.delete('/api/couriers/:id', (req, res) => {
  db.prepare('DELETE FROM couriers WHERE id = ?').run(req.params.id);
  return res.json({ success: true });
});

router.get('/api/couriers/:id/tracking-link', (req, res) => {
  const courier = db.prepare('SELECT tracking_token FROM couriers WHERE id = ?').get(req.params.id);
  return res.json({ link: `/courier/${courier.tracking_token}` });
});

module.exports = router;
