const courierGrid = document.getElementById('courierGrid');
const emptyState = document.getElementById('emptyState');
const courierCount = document.getElementById('courierCount');
const searchInput = document.getElementById('searchInput');

const modalOverlay = document.getElementById('modalOverlay');
const courierForm = document.getElementById('courierForm');
const fetchStatus = document.getElementById('fetchStatus');
const fetchPreview = document.getElementById('fetchPreview');

const linkModalOverlay = document.getElementById('linkModalOverlay');
const linkDisplay = document.getElementById('linkDisplay');

// --- Авторизация / выход ---
async function checkAuth() {
  const res = await fetch('/api/me');
  const data = await res.json();
  if (data.authenticated) {
    document.getElementById('adminUsername').textContent = data.username;
  }
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// --- Загрузка и отрисовка курьеров ---
async function loadCouriers(search = '') {
  const url = search ? `/api/couriers?search=${encodeURIComponent(search)}` : '/api/couriers';
  const res = await fetch(url);
  const data = await res.json();
  renderCouriers(data.couriers);
}

function statusLabel(status) {
  return status === 'online' ? 'На смене' : 'Не в сети';
}

function renderCouriers(couriers) {
  courierGrid.innerHTML = '';

  if (couriers.length === 0) {
    emptyState.style.display = 'block';
    courierCount.textContent = 'Курьеров пока нет';
    return;
  }

  emptyState.style.display = 'none';
  courierCount.textContent = `${couriers.length} ${couriers.length === 1 ? 'курьер' : 'курьеров'}`;

  couriers.forEach((c) => {
    const card = document.createElement('div');
    card.className = 'courier-card';

    const avatarHtml = c.avatar_path
      ? `<img class="courier-avatar" src="${c.avatar_path}" alt="">`
      : `<div class="courier-avatar-placeholder">${(c.full_name || '?')[0].toUpperCase()}</div>`;

    card.innerHTML = `
      <div class="courier-card-top">
        ${avatarHtml}
        <div class="courier-info">
          <p class="courier-name">${escapeHtml(c.full_name)}</p>
          ${c.instagram_username ? `<span class="courier-username">@${escapeHtml(c.instagram_username)}</span>` : ''}
        </div>
      </div>
      <span class="status-badge ${c.status === 'online' ? 'online' : 'offline'}">
        <span class="pulse"></span>${statusLabel(c.status)}
      </span>
      ${c.bio ? `<p class="courier-bio" style="margin-top:12px;">${escapeHtml(c.bio)}</p>` : ''}
      <div class="courier-stats">
        ${c.followers_count ? `<span><strong>${escapeHtml(c.followers_count)}</strong> подписчиков</span>` : ''}
      </div>
      <div class="courier-card-actions">
        <button class="btn btn-ghost details-btn" data-id="${c.id}">Маршрут</button>
        <button class="btn btn-ghost link-btn" data-id="${c.id}">Ссылка</button>
        <button class="btn btn-danger delete-btn" data-id="${c.id}">Удалить</button>
      </div>
    `;

    courierGrid.appendChild(card);
  });

  document.querySelectorAll('.details-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `/admin/courier/${btn.dataset.id}`;
    });
  });

  document.querySelectorAll('.link-btn').forEach((btn) => {
    btn.addEventListener('click', () => showTrackingLink(btn.dataset.id));
  });

  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteCourier(btn.dataset.id));
  });
}

async function showTrackingLink(id) {
  const res = await fetch(`/api/couriers/${id}/tracking-link`);
  const data = await res.json();
  const fullLink = `${window.location.origin}${data.link}`;
  linkDisplay.textContent = fullLink;
  linkModalOverlay.hidden = false;

  document.getElementById('copyLinkBtn').onclick = async () => {
    await navigator.clipboard.writeText(fullLink);
    document.getElementById('copyLinkBtn').textContent = 'Скопировано!';
    setTimeout(() => {
      document.getElementById('copyLinkBtn').textContent = 'Скопировать ссылку';
    }, 1500);
  };
}

async function deleteCourier(id) {
  if (!confirm('Удалить этого курьера? Это действие нельзя отменить.')) return;
  await fetch(`/api/couriers/${id}`, { method: 'DELETE' });
  loadCouriers(searchInput.value);
}

// --- Поиск ---
let searchDebounce = null;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => loadCouriers(searchInput.value), 300);
});

// --- Модалка добавления курьера ---
function openModal() {
  courierForm.reset();
  fetchStatus.className = 'inline-status';
  fetchPreview.className = 'preview-row';
  document.getElementById('resolvedAvatarPath').value = '';
  modalOverlay.hidden = false;
}

function closeModal() {
  modalOverlay.hidden = true;
}

document.getElementById('addCourierBtn').addEventListener('click', openModal);
document.getElementById('emptyAddBtn').addEventListener('click', openModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.getElementById('cancelBtn').addEventListener('click', closeModal);
document.getElementById('linkModalCloseBtn').addEventListener('click', () => {
  linkModalOverlay.hidden = true;
});

modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// --- Получение данных из Instagram ---
document.getElementById('fetchInstagramBtn').addEventListener('click', async () => {
  const url = document.getElementById('instagramUrlInput').value.trim();
  if (!url) return;

  fetchStatus.className = 'inline-status show info';
  fetchStatus.textContent = 'Пытаюсь получить данные...';
  fetchPreview.className = 'preview-row';

  try {
    const res = await fetch('/api/instagram/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instagramUrl: url }),
    });
    const data = await res.json();

    if (data.success) {
      fetchStatus.className = 'inline-status show success';
      fetchStatus.textContent = 'Данные получены и подставлены в форму.';

      document.getElementById('usernameInput').value = data.username || '';
      if (!document.getElementById('fullNameInput').value) {
        document.getElementById('fullNameInput').value = data.displayName || data.username || '';
      }
      document.getElementById('bioInput').value = data.bio || '';
      document.getElementById('resolvedAvatarPath').value = data.avatarPath || '';
      document.getElementById('resolvedFollowers').value = data.followers || '';

      if (data.avatarPath) {
        document.getElementById('previewAvatar').src = data.avatarPath;
        document.getElementById('previewName').textContent = data.displayName || data.username;
        document.getElementById('previewFollowers').textContent = data.followers
          ? `${data.followers} подписчиков`
          : '';
        fetchPreview.className = 'preview-row show';
      }
    } else {
      fetchStatus.className = 'inline-status show warning';
      fetchStatus.textContent = data.message + ' Поля ниже можно заполнить вручную.';
      document.getElementById('usernameInput').value =
        url.split('/').filter(Boolean).pop() || '';
    }
  } catch (err) {
    fetchStatus.className = 'inline-status show warning';
    fetchStatus.textContent = 'Не удалось связаться с сервером. Заполните данные вручную.';
  }
});

// --- Сохранение курьера ---
courierForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const avatarFile = document.getElementById('avatarFileInput').files[0];
  const formData = new FormData();

  formData.append('fullName', document.getElementById('fullNameInput').value);
  formData.append('instagramUrl', document.getElementById('instagramUrlInput').value);
  formData.append('instagramUsername', document.getElementById('usernameInput').value);
  formData.append('bio', document.getElementById('bioInput').value);
  formData.append('phone', document.getElementById('phoneInput').value);
  formData.append('notes', document.getElementById('notesInput').value);
  formData.append('followersCount', document.getElementById('resolvedFollowers').value);
  formData.append('avatarPath', document.getElementById('resolvedAvatarPath').value);

  if (avatarFile) {
    formData.append('avatarFile', avatarFile);
  }

  try {
    const res = await fetch('/api/couriers', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok && data.success) {
      closeModal();
      loadCouriers(searchInput.value);
    } else {
      alert(data.error || 'Не удалось сохранить курьера');
    }
  } catch (err) {
    alert('Ошибка сети. Попробуйте снова.');
  }
});

// --- Инициализация ---
checkAuth();
loadCouriers();

// Обновляем список карточек каждые 10 секунд
setInterval(() => {
  if (document.activeElement !== searchInput) {
    loadCouriers(searchInput.value);
  }
}, 10000);
