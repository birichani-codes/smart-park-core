// ── Token helpers ────────────────────────────────────────────
const getToken   = () => localStorage.getItem('sp_token');
const getUser    = () => JSON.parse(localStorage.getItem('sp_user') || 'null');
const setSession = (token, user) => {
  localStorage.setItem('sp_token', token);
  localStorage.setItem('sp_user', JSON.stringify(user));
};
const clearSession = () => {
  localStorage.removeItem('sp_token');
  localStorage.removeItem('sp_user');
};

function requireAuth(allowedRoles = []) {
  const token = getToken();
  const user  = getUser();
  if (!token || !user) { window.location.href = '/'; return null; }
  if (allowedRoles.length && !allowedRoles.includes(user.role)) {
    window.location.href = '/dashboard';
    return null;
  }
  return user;
}

function logout() {
  clearSession();
  window.location.href = '/';
}

// ── API fetch wrapper ────────────────────────────────────────
async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// ── UI helpers ───────────────────────────────────────────────
function showAlert(containerId, message, type = 'info') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

function setLoading(btnId, loading, label = 'Submit') {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Please wait…' : label;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
}

function formatCountdown(ms) {
  if (ms <= 0) return 'Expired';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function statusBadge(status) {
  const map = {
    available: 'badge-green', occupied: 'badge-red', reserved: 'badge-amber',
    confirmed: 'badge-blue',  completed: 'badge-green', cancelled: 'badge-gray',
    open: 'badge-green',      full: 'badge-red', pending_payment: 'badge-amber',
    matched: 'badge-blue',
  };
  return `<span class="badge ${map[status] || 'badge-gray'}">${status}</span>`;
}

// ── Populate sidebar user info ───────────────────────────────
function initSidebar() {
  const user = getUser();
  if (!user) return;
  const el = document.getElementById('sidebar-user');
  if (el) el.textContent = user.fullName;

  // Hide admin-only links for non-admins
  document.querySelectorAll('[data-role]').forEach(link => {
    const roles = link.dataset.role.split(',');
    if (!roles.includes(user.role)) link.style.display = 'none';
  });
}
