// server/middleware/requireAuth.js
// Защищает роуты, доступные только авторизованному админу.

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }

  // Для API-запросов (fetch с фронта) возвращаем JSON, а не редирект
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Не авторизован' });
  }

  return res.redirect('/login');
}

module.exports = requireAuth;
