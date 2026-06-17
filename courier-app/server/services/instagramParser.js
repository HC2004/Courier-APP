// server/services/instagramParser.js
//
// Пытается вытащить ПУБЛИЧНЫЕ данные профиля Instagram (аватар, имя, био)
// из открытой страницы профиля — то же самое, что видно в браузере без логина.
//
// ЧЕСТНОЕ ПРЕДУПРЕЖДЕНИЕ:
// Instagram активно блокирует автоматические запросы (403, капча, rate-limit).
// Это НЕ баг, который можно один раз пофиксить — это постоянное поведение
// защиты Instagram. Поэтому функция всегда возвращает { success: false }
// в случае неудачи, а не бросает исключение — и вызывающий код (роуты)
// обязан в этом случае предлагать пользователю заполнить данные вручную.
// Не пытайся "обойти" защиту агрессивнее (массовые ретраи, пул прокси,
// фейковые логины) — это нарушает условия использования Instagram и может
// привести к блокировке IP или аккаунтов.

const { JSDOM } = require('jsdom');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function extractUsernameFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[0] || null;
  } catch {
    return null;
  }
}

function getMetaContent(document, property) {
  const el =
    document.querySelector(`meta[property="${property}"]`) ||
    document.querySelector(`meta[name="${property}"]`);
  return el ? el.getAttribute('content') : null;
}

/**
 * Пытается получить публичные данные профиля.
 * @param {string} profileUrl - ссылка на профиль, например https://instagram.com/har8ut
 * @returns {Promise<{success: true, username, avatarUrl, bio, displayName} | {success: false, reason: string}>}
 */
async function fetchInstagramProfile(profileUrl) {
  const username = extractUsernameFromUrl(profileUrl);

  if (!username) {
    return { success: false, reason: 'invalid_url' };
  }

  const cleanUrl = `https://www.instagram.com/${username}/`;

  let response;
  try {
    response = await fetch(cleanUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    // Сетевая ошибка, таймаут и т.п.
    return { success: false, reason: 'network_error' };
  }

  if (response.status === 429) {
    return { success: false, reason: 'rate_limited' };
  }

  if (response.status === 403 || response.status === 401) {
    return { success: false, reason: 'blocked' };
  }

  if (!response.ok) {
    return { success: false, reason: `http_${response.status}` };
  }

  let html;
  try {
    html = await response.text();
  } catch {
    return { success: false, reason: 'read_error' };
  }

  // Если Instagram вместо профиля отдал страницу логина/капчи
  if (html.includes('Войти') && html.includes('challenge')) {
    return { success: false, reason: 'login_wall' };
  }

  let dom;
  try {
    dom = new JSDOM(html);
  } catch {
    return { success: false, reason: 'parse_error' };
  }

  const document = dom.window.document;

  const avatarUrl = getMetaContent(document, 'og:image');
  const description = getMetaContent(document, 'og:description');
  const ogTitle = getMetaContent(document, 'og:title');

  if (!avatarUrl && !description) {
    return { success: false, reason: 'no_data_found' };
  }

  // og:description у Instagram обычно вида:
  // "123 Followers, 45 Following, 6 Posts - See Instagram photos and videos from ИМЯ (@username)"
  let bio = null;
  let followers = null;
  let following = null;

  if (description) {
    const followersMatch = description.match(/([\d.,KkMm]+)\s+Followers/i);
    const followingMatch = description.match(/([\d.,KkMm]+)\s+Following/i);
    followers = followersMatch ? followersMatch[1] : null;
    following = followingMatch ? followingMatch[1] : null;
    bio = description;
  }

  return {
    success: true,
    username,
    avatarUrl,
    bio,
    followers,
    following,
    displayName: ogTitle || username,
  };
}

module.exports = { fetchInstagramProfile, extractUsernameFromUrl };
