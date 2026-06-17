// server/app.js
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

const authRoutes = require('./routes/auth');
const courierRoutes = require('./routes/couriers');
const locationRoutes = require('./routes/locations');
const requireAuth = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-me-in-production-please';

if (SESSION_SECRET === 'change-me-in-production-please') {
  console.warn(
    '\n⚠️  ВНИМАНИЕ: используется дефолтный SESSION_SECRET. ' +
      'Задай свой секрет в файле .env перед тем, как выкладывать сайт в реальный интернет.\n'
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 12, // 12 часов
      httpOnly: true,
      // secure: true нужно включить, когда сайт будет работать по HTTPS (см. README)
    },
  })
);

// Раздача загруженных файлов (аватары) — публично, чтобы фото показывались в карточках
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Публичные API роуты (логин, статус сессии, страница курьера для геолокации)
app.use(authRoutes);
app.use(locationRoutes);

// Блокируем прямой доступ к HTML-страницам через статику (например GET /dashboard.html),
// чтобы их можно было получить только через явные защищённые роуты ниже.
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    return res.status(404).send('Not found');
  }
  next();
});

// Статика фронтенда: CSS, JS и прочие не-HTML ассеты — публично
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// Страница логина — доступна всем
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Страница курьера для трансляции геолокации — доступна по токену, без логина админа
app.get('/courier/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier-tracking.html'));
});

// Главная панель админа — защищена
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Страница деталей конкретного курьера (история маршрута) — для админа
app.get('/admin/courier/:id', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'courier-details.html'));
});

// Защищённые API роуты (всё про курьеров — требует авторизации админа).
// Регистрируется ПОСЛЕ публичных путей выше, чтобы requireAuth не перехватывал их.
app.use(requireAuth, courierRoutes);

app.listen(PORT, () => {
  console.log(`\n🚴 Курьерская система запущена: http://localhost:${PORT}\n`);
});
