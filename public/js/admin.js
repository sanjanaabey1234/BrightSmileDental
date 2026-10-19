// Staff dashboard: live overview, patient list, OHAT results and predictions, transcripts,
// follow-up and appointments.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const TOKEN_KEY = 'brightsmile_admin_token';
const THEME_KEY = 'selfdoc_theme';
const QUESTION_COUNT = 23; // questions in a typical full check (used for progress bars)

const LEVEL = {
  emergency: { label: 'Emergency', short: 'Emergency', s: 'critical' },
  urgent: { label: 'See dentist promptly', short: 'Urgent', s: 'serious' },
  attention: { label: 'Self-care + check-up', short: 'Check-up', s: 'warning' },
  healthy: { label: 'Healthy', short: 'Healthy', s: 'good' },
};
const LEVEL_ORDER = ['emergency', 'urgent', 'attention', 'healthy'];
const STAFF = { new: 'New', contacted: 'Contacted', booked: 'Booked', resolved: 'Resolved' };
const APPT = { requested: 'Requested', confirmed: 'Confirmed', done: 'Done', cancelled: 'Cancelled' };
const CONCERN = {
  pain: 'Toothache or pain', gums: 'Bleeding or sore gums', dry_mouth: 'Dry mouth', breath: 'Bad breath', denture: 'Denture problem',
  sore: 'Mouth sore, patch or lump', tooth: 'Broken or decayed tooth', routine: 'Routine check',
};
const AGE = { child: 'under 12', teen: '12-17', adult: '18-39', middle: '40-64', senior: '65+' };
const LANG_NAME = { en: 'English', si: 'Sinhala', ta: 'Tamil' };
const SENDER = { bot: 'Assistant', user: 'Patient', ai: 'Assistant answer', staff: 'Clinic team' };
const URGENCY = { urgent: { label: 'Urgent', s: 'critical' }, soon: { label: 'Soon', s: 'serious' }, routine: { label: 'Routine', s: 'good' } };
const RISK_TONE = { High: 'critical', Moderate: 'warning', Low: 'good' };
const SCORE = { 0: ['good', 'Healthy'], 1: ['warning', 'Changes'], 2: ['serious', 'Unhealthy'] };
const QUICK_REPLIES = [
  'Hello, this is the clinic team. We have looked at your self-check.',
  'Could we call you to arrange an appointment?',
  'Please visit the clinic as soon as you can.',
];

// ---------- icons ----------

const ICONS = {
  grid: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 6l-10 7L2 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  sparkles: '<path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6-4.6-1.9 4.6-1.9z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M17.9 17.9A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.1-5.9M9.9 4.2A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.2M14.1 14.1a3 3 0 1 1-4.2-4.2M1 1l22 22"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  chart: '<path d="M12 20V10M18 20V4M6 20v-4"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
};
const TOOTH = 'M20 6c-9 0-15 7-15 17 0 8 4 13 6 22 2 9 4 13 8 13 5 0 5-12 13-12s8 12 13 12c4 0 6-4 8-13 2-9 6-14 6-22 0-10-6-17-15-17-6 0-8 3-12 3S26 6 20 6z';

function icon(name, cls = '') {
  if (name === 'tooth') return `<svg class="ic-fill" viewBox="0 0 64 64" aria-hidden="true"><path d="${TOOTH}"/></svg>`;
  return `<svg class="ic${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function paintIcons(root = document) {
  for (const el of root.querySelectorAll('[data-icon]')) {
    const name = el.dataset.icon;
    el.innerHTML = name === 'theme' ? icon('moon', 'i-moon') + icon('sun', 'i-sun') : icon(name);
  }
}

// ---------- state & helpers ----------

const state = {
  token: null,
  clinicName: 'SELF DOC',
  realtime: 'sse',
  view: null,
  all: [], // every recent session (overview)
  sessions: [], // sessions matching the patient filters
  appts: [],
  totals: null,
  level: '',
  apptFilter: '',
  lastUpdated: new Map(),
  openId: null,
  detail: null,
  dtab: 'overview',
  notesDraft: null,
  replyDraft: '',
  stream: null,
  poll: null,
  refreshTimer: null,
  detailTimer: null,
};

const tokenStore = {
  get() { try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set(v) { try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* storage unavailable */ } },
  clear() { try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function ago(iso) {
  if (!iso) return '-';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso)) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
const fullTime = (iso) => (iso ? new Date(iso).toLocaleString() : '-');
const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const pctAnswered = (n) => Math.min(100, Math.round((n / QUESTION_COUNT) * 100));

function parseDay(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return null;
  const d = new Date(`${day}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers: { Authorization: `Bearer ${state.token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 401) { logout(); throw new Error('Session expired - please sign in again.'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// ---------- small UI pieces ----------

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  const first = (w) => [...w][0] || '';
  return (first(parts[0]) + (parts.length > 1 ? first(parts[parts.length - 1]) : '')).toUpperCase();
}

function avatar(name, id, { online = false, size = '' } = {}) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const text = initials(name);
  return `<span class="avatar av-${h % 6}${size ? ` avatar-${size}` : ''}${online ? ' is-online' : ''}" aria-hidden="true">${text ? esc(text) : icon('user')}</span>`;
}

function levelBadge(level, { short = false } = {}) {
  const l = LEVEL[level];
  if (!l) return '<span class="badge plain">Pending</span>';
  return `<span class="badge tone-${l.s}" title="${esc(l.label)}"><span class="dot s-${l.s}"></span>${esc(short ? l.short : l.label)}</span>`;
}

const staffPill = (status) => `<span class="pill st-${esc(status)}">${esc(STAFF[status] || status)}</span>`;

function contactHref(contact) {
  const c = String(contact || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return { href: `mailto:${c}`, kind: 'mail', verb: 'Email' };
  const digits = c.replace(/[^\d+]/g, '');
  if (/^\+?\d{7,15}$/.test(digits)) return { href: `tel:${digits}`, kind: 'phone', verb: 'Call' };
  return null;
}

function contactLink(contact, { labelled = false } = {}) {
  const c = contactHref(contact);
  if (!c) return '';
  return labelled
    ? `<a class="btn btn-soft btn-sm" href="${esc(c.href)}">${icon(c.kind)}${c.verb}</a>`
    : `<a class="icon-btn sm" href="${esc(c.href)}" title="${c.verb} ${esc(contact)}" aria-label="${c.verb} ${esc(contact)}">${icon(c.kind)}</a>`;
}

const emptyState = (ic, title, text) => `<div class="empty-state"><span class="empty-ic">${icon(ic)}</span><b>${esc(title)}</b><p>${esc(text)}</p></div>`;

const TOAST_ICON = { info: 'bell', critical: 'alert', error: 'alert', success: 'check' };

function toast(title, body, { critical = false, kind, onClick } = {}) {
  const k = kind || (critical ? 'critical' : 'info');
  const ms = k === 'critical' ? 15000 : 6000;
  const t = document.createElement('div');
  t.className = `toast t-${k}`;
  t.style.setProperty('--life', `${ms}ms`);
  t.innerHTML = `<span class="toast-ic">${icon(TOAST_ICON[k])}</span>
    <div class="toast-body"><b>${esc(title)}</b>${body ? `<span>${esc(body)}</span>` : ''}</div>
    <button class="toast-x" type="button" aria-label="Dismiss">${icon('x')}</button><i class="toast-life"></i>`;
  t.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!e.target.closest('.toast-x')) onClick?.();
    t.remove();
  });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- theme ----------

function syncTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  $$('[data-theme-label]').forEach((el) => { el.textContent = dark ? 'Light mode' : 'Dark mode'; });
  $('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a1315' : '#f6f9f8');
}

function toggleTheme() {
  const root = document.documentElement;
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* storage unavailable */ }
  syncTheme();
}

// ---------- auth ----------

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form input[name="password"]').focus();
}

function logout() {
  tokenStore.clear();
  state.token = null;
  stopLive();
  closeDetail();
  closeEditor({ force: true });
  showLogin();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-form .form-err');
  const btn = $('#login-form button[type="submit"]');
  err.textContent = '';
  if (!e.target.password.value) { err.textContent = 'Please enter the staff password.'; return; }
  btn.disabled = true;
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: e.target.password.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Sign-in failed');
    state.token = data.token;
    tokenStore.set(data.token);
    e.target.reset();
    $('#pw-banner').hidden = !data.defaultPassword;
    showApp();
  } catch (ex) {
    err.textContent = ex.message;
    $('#login-form').classList.remove('shake');
    void $('#login-form').offsetWidth;
    $('#login-form').classList.add('shake');
  } finally {
    btn.disabled = false;
  }
});

$('#pw-toggle').addEventListener('click', () => {
  const input = $('#login-form input[name="password"]');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  const label = show ? 'Hide password' : 'Show password';
  $('#pw-toggle').setAttribute('aria-label', label);
  $('#pw-toggle').title = label;
  $('#pw-toggle').innerHTML = icon(show ? 'eyeOff' : 'eye');
  input.focus();
});

// ---------- app shell & views ----------

async function loadConfig() {
  try {
    const { clinic, realtime } = await (await fetch('/api/config')).json();
    state.clinicName = clinic?.name || state.clinicName;
    state.realtime = realtime || 'sse';
    $$('[data-clinic-name]').forEach((el) => { el.textContent = state.clinicName; });
    updateTitle();
  } catch { /* keep defaults */ }
}
const configReady = loadConfig();

function updateTitle() {
  const urgent = state.totals?.urgentOpen || 0;
  document.title = `${urgent ? `(${urgent}) ` : ''}${state.clinicName} · Staff`;
}

async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  await configReady;
  showView();
  await refreshAll();
  connectLive();
}

const VIEWS = ['overview', 'patients', 'appointments', 'blog'];
const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview');

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const HEADS = {
  overview: () => [greeting(), `Here's what's happening at ${state.clinicName} today.`],
  patients: () => ['Patients', 'Every self-check, newest activity first. Click a patient to open their full report.'],
  appointments: () => ['Appointments', 'Requests from the chatbot and the booking page.'],
  blog: () => ['Blog', 'Write articles and share photos. Published posts appear on the website\'s Blog page.'],
};

function showView(view = viewFromHash()) {
  const changed = state.view !== view;
  state.view = view;
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== view;
  $$('[data-view]').forEach((a) => {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const [title, sub] = HEADS[view]();
  $('#page-title').textContent = title;
  $('#page-sub').textContent = sub;
  $('#today-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  if (changed) window.scrollTo(0, 0);
  if (view === 'blog' && changed) loadPosts().catch((e) => toast('Could not load posts', e.message, { kind: 'error' }));
}

window.addEventListener('hashchange', () => showView());

function setView(view) {
  if (location.hash === `#${view}`) showView(view);
  else location.hash = view;
}

// Shortcuts from KPI cards and links.
function goTo(target) {
  if (target === 'followup') {
    setFilters({ status: 'completed', staff: 'new', level: '' });
    setView('patients');
  } else if (target === 'requested') {
    state.apptFilter = 'requested';
    renderAppointments();
    setView('appointments');
  } else if (target === 'queue') {
    setView('overview');
    $('#queue-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else if (VIEWS.includes(target)) {
    setView(target);
  }
}

async function refreshAll() {
  await Promise.all([loadStats(), loadSessions(), loadAppointments()]).catch((e) => toast('Could not refresh', e.message, { kind: 'error' }));
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(refreshAll, 350);
}

function setCount(name, n) {
  $$(`[data-count="${name}"]`).forEach((el) => { el.textContent = n; el.hidden = !n; });
}

// ---------- overview: figures and charts ----------

function kpi({ label, value, note, ic, tone, go, hot = false, pulse = false }) {
  return `<button class="kpi tone-${tone}${hot ? ' hot' : ''}" type="button" data-go="${go}">
    <span class="kpi-top"><span class="kpi-ic${pulse ? ' pulse' : ''}">${icon(ic)}</span><span class="kpi-go">${icon('arrow')}</span></span>
    <span class="kpi-value">${esc(value ?? 0)}</span>
    <span class="kpi-label">${esc(label)}</span>
    <span class="kpi-note">${esc(note)}</span>
  </button>`;
}

function renderDays(daily) {
  const el = $('#chart-days');
  const max = Math.max(1, ...daily.map((d) => d.n));
  const last = daily.length - 1;
  el.classList.toggle('grow', !el.dataset.drawn);
  el.dataset.drawn = '1';
  el.innerHTML = daily.map((d, i) => {
    const date = parseDay(d.date);
    const label = date ? date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : d.date;
    return `<div class="day${i === last ? ' today' : ''}" style="--i:${i}" title="${esc(label)}: ${d.n} check${d.n === 1 ? '' : 's'}">
      <span class="day-n">${d.n || ''}</span>
      <span class="day-bar" style="height:${Math.max(5, Math.round((d.n / max) * 84))}px"></span>
      <span class="day-l">${i === last ? 'Today' : date ? date.getDate() : ''}</span>
    </div>`;
  }).join('');
}

function renderDonut(levels, avgOhat) {
  const data = LEVEL_ORDER.map((l) => ({ level: l, n: levels.find((x) => x.level === l)?.n || 0 }));
  const total = data.reduce((sum, d) => sum + d.n, 0);
  const el = $('#chart-levels');
  if (!total) { el.innerHTML = emptyState('target', 'No results yet', 'Priorities appear when patients finish their check.'); return; }
  const parts = data.filter((d) => d.n);
  const gap = parts.length > 1 ? 1.4 : 0;
  let offset = 0;
  const segs = parts.map((d) => {
    const pct = (d.n / total) * 100;
    const len = Math.max(pct - gap, 0.6);
    const seg = `<circle class="seg st-${LEVEL[d.level].s}" r="15.915" cx="21" cy="21" stroke-dasharray="${len.toFixed(2)} ${(100 - len).toFixed(2)}" stroke-dashoffset="${(25 - offset).toFixed(2)}"></circle>`;
    offset += pct;
    return seg;
  }).join('');
  el.innerHTML = `<div class="donut-wrap">
      <div class="donut"><svg viewBox="0 0 42 42" aria-hidden="true"><circle class="donut-track" r="15.915" cx="21" cy="21"></circle>${segs}</svg>
        <div class="donut-c"><b>${total}</b><small>results</small></div></div>
      <ul class="legend">${data.map((d) => `<li><span class="dot s-${LEVEL[d.level].s}"></span><span class="legend-l">${esc(LEVEL[d.level].short)}</span><b>${d.n}</b><small>${Math.round((d.n / total) * 100)}%</small></li>`).join('')}</ul>
    </div>
    <p class="avg">Average OHAT score <b>${avgOhat ?? '-'}</b><span class="muted"> / 16 · lower is healthier</span></p>`;
}

function barList(el, items, labelFn, emptyText, tone) {
  if (!items.length) { el.innerHTML = `<p class="empty-note">${esc(emptyText)}</p>`; return; }
  const max = Math.max(...items.map((i) => i.n));
  const first = !el.dataset.drawn;
  el.dataset.drawn = '1';
  el.classList.toggle('grow', first);
  el.innerHTML = items.map((i, idx) => `<div class="barrow tone-${tone}" title="${esc(labelFn(i))}: ${i.n}">
      <div class="barrow-top"><span><em>${idx + 1}</em><span class="bl-t">${esc(labelFn(i))}</span></span><b>${i.n}</b></div>
      <div class="track"><div class="fill" style="width:${Math.max(3, Math.round((i.n / max) * 100))}%"></div></div></div>`).join('');
}

async function loadStats() {
  const { totals, levels, conditions, concerns, daily = [] } = await api(`/api/admin/stats?tzOffset=${-new Date().getTimezoneOffset()}`);
  state.totals = totals;
  $('#k-total').textContent = totals.total;
  $('#hero-chips').innerHTML = `<span><b>${totals.today}</b> today</span><span><b>${totals.completed}</b> completed</span><span><b>${totals.inProgress}</b> in progress</span>`;
  renderDays(daily);
  $('#kpis').innerHTML = [
    kpi({ label: 'Live now', value: totals.live, note: totals.live ? 'patients in the chat right now' : 'nobody in the chat right now', ic: 'activity', tone: 'good', go: 'patients', pulse: totals.live > 0 }),
    kpi({ label: 'Urgent open', value: totals.urgentOpen, note: 'urgent or emergency, not booked yet', ic: 'alert', tone: 'critical', go: 'queue', hot: totals.urgentOpen > 0 }),
    kpi({ label: 'Needs follow-up', value: totals.needsFollowUp, note: 'results still marked "New"', ic: 'clipboard', tone: 'warning', go: 'followup' }),
    kpi({ label: 'Appointment requests', value: totals.pendingAppointments, note: 'waiting for confirmation', ic: 'calendar', tone: 'blue', go: 'requested' }),
  ].join('');
  renderDonut(levels, totals.avgOhat);
  barList($('#chart-conditions'), conditions, (i) => i.name, 'No predictions yet.', 'blue');
  barList($('#chart-concerns'), concerns, (i) => CONCERN[i.concern] || i.concern, 'No data yet.', 'accent');
  setCount('appointments', totals.pendingAppointments);
  setCount('live', totals.live);
  updateTitle();
}

// ---------- overview: needs-attention queue ----------

function needsAttention(s) {
  if (s.status !== 'completed') return false;
  if (s.triageLevel === 'emergency' || s.triageLevel === 'urgent') return s.staffStatus === 'new' || s.staffStatus === 'contacted';
  return s.staffStatus === 'new';
}

function renderQueue() {
  const items = state.all.filter(needsAttention).sort((a, b) => LEVEL_ORDER.indexOf(a.triageLevel) - LEVEL_ORDER.indexOf(b.triageLevel)
    || new Date(b.updatedAt) - new Date(a.updatedAt));
  $('#queue-count').textContent = items.length;
  $('#queue-count').classList.toggle('zero', !items.length);
  const el = $('#queue');
  if (!items.length) { el.innerHTML = emptyState('check', 'All caught up', 'No finished checks are waiting for follow-up.'); return; }
  el.innerHTML = items.slice(0, 6).map((s) => `
    <div class="q-item tone-${LEVEL[s.triageLevel]?.s || 'brand'}">
      <button class="q-open" type="button" data-open="${esc(s.id)}">
        ${avatar(s.name, s.id, { online: s.online })}
        <span class="q-main"><b>${esc(s.name || 'Anonymous')}</b><small>${esc(s.topCondition || CONCERN[s.mainConcern] || 'No specific pattern')} · ${ago(s.completedAt || s.updatedAt)}</small></span>
      </button>
      ${levelBadge(s.triageLevel, { short: true })}
      <div class="q-actions">${contactLink(s.contact)}${s.staffStatus === 'new'
        ? `<button class="btn btn-soft btn-xs" type="button" data-quick="contacted" data-id="${esc(s.id)}">${icon('check')}Contacted</button>`
        : staffPill(s.staffStatus)}</div>
    </div>`).join('')
    + (items.length > 6 ? `<button class="link-more" type="button" data-go="followup">See all ${items.length} ${icon('arrow')}</button>` : '');
}

async function quickStatus(id, status) {
  try {
    await api(`/api/admin/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: { staffStatus: status } });
    toast(`Marked as ${STAFF[status].toLowerCase()}`, nameOf(id), { kind: 'success' });
    await refreshAll();
  } catch (ex) { toast('Not saved', ex.message, { kind: 'error' }); }
}

// ---------- overview: live activity feed ----------

const FEED = {
  created: { ic: 'userPlus', tone: 'brand', verb: 'started a self-check' },
  progress: { ic: 'activity', tone: 'brand', verb: 'is answering the check' },
  completed: { ic: 'check', tone: 'good', verb: 'finished the check' },
  redFlag: { ic: 'alert', tone: 'critical', verb: 'reported emergency symptoms' },
  question: { ic: 'message', tone: 'blue', verb: 'asked a question' },
  appointment: { ic: 'calendar', tone: 'accent', verb: 'requested an appointment' },
};
const feed = [];
let feedSeeded = false;

function seedFeed() {
  if (feedSeeded) return;
  feedSeeded = true;
  for (const s of state.all.slice(0, 8)) {
    feed.push(s.status === 'completed'
      ? { kind: 'completed', id: s.id, name: s.name, level: s.triageLevel, text: s.topCondition || '', at: s.completedAt || s.updatedAt }
      : { kind: 'progress', id: s.id, name: s.name, text: `${s.answered} answers so far`, at: s.updatedAt });
  }
}

function pushFeed(entry) {
  feed.unshift({ at: new Date().toISOString(), fresh: true, ...entry });
  feed.length = Math.min(feed.length, 14);
  renderFeed();
}

function renderFeed() {
  const el = $('#feed');
  if (!feed.length) {
    el.innerHTML = `<li class="feed-empty">${emptyState('activity', 'Quiet for now', 'New chats, results and requests appear here the moment they happen.')}</li>`;
    return;
  }
  el.innerHTML = feed.map((f) => {
    const k = FEED[f.kind];
    const tone = f.kind === 'completed' && LEVEL[f.level] ? LEVEL[f.level].s : k.tone;
    const target = f.kind === 'appointment' || !f.id ? 'data-go="appointments"' : `data-open="${esc(f.id)}"`;
    return `<li${f.fresh ? ' class="fresh"' : ''}><button class="feed-item" type="button" ${target}>
      <span class="feed-ic tone-${tone}">${icon(k.ic)}</span>
      <span class="feed-text"><span><b>${esc(f.name || 'A patient')}</b> ${k.verb}${LEVEL[f.level] ? ` · <span class="ink-${tone}">${esc(LEVEL[f.level].short)}</span>` : ''}</span>${f.text ? `<small>${esc(f.text)}</small>` : ''}</span>
      <time datetime="${esc(f.at)}">${ago(f.at)}</time>
    </button></li>`;
  }).join('');
  feed.forEach((f) => { f.fresh = false; });
}

// ---------- patients ----------

function filterQuery() {
  const p = new URLSearchParams();
  const q = $('#f-q').value.trim();
  if (q) p.set('q', q);
  if ($('#f-status').value) p.set('status', $('#f-status').value);
  if (state.level) p.set('level', state.level);
  if ($('#f-staff').value) p.set('staffStatus', $('#f-staff').value);
  return p.toString();
}

function setFilters({ q, status, staff, level }) {
  if (q !== undefined) $('#f-q').value = q;
  if (status !== undefined) $('#f-status').value = status;
  if (staff !== undefined) $('#f-staff').value = staff;
  if (level !== undefined) state.level = level;
  $$('#f-level [data-level]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === state.level)));
  loadSessions().catch((e) => toast('Could not load patients', e.message, { kind: 'error' }));
}

async function loadSessions() {
  const query = filterQuery();
  const [all, filtered] = await Promise.all([
    api('/api/admin/sessions'),
    query ? api(`/api/admin/sessions?${query}`) : null,
  ]);
  state.all = all.sessions;
  state.sessions = filtered ? filtered.sessions : all.sessions;
  renderRows(Boolean(query));
  renderQueue();
  seedFeed();
  renderFeed();
}

function renderRows(filtered) {
  $('#rows').innerHTML = state.sessions.map((s) => {
    const changed = state.lastUpdated.has(s.id) ? state.lastUpdated.get(s.id) !== s.updatedAt : state.lastUpdated.size > 0;
    const done = s.status === 'completed';
    const tone = LEVEL[s.triageLevel]?.s || 'brand';
    const progress = done
      ? `<span class="prog done">${icon('check')}Completed</span>`
      : `<span class="prog"><span class="prog-bar"><i style="width:${pctAnswered(s.answered)}%"></i></span><small>${s.answered} answers</small></span>`;
    const ohat = s.ohatTotal == null ? '<span class="muted">-</span>'
      : `<span class="ohat tone-${tone}"><b>${s.ohatTotal}</b><span class="ohat-bar"><i style="width:${Math.min(100, Math.round((s.ohatTotal / 16) * 100))}%"></i></span></span>`;
    const prediction = s.topCondition ? esc(s.topCondition) : s.mainConcern ? `<span class="muted">${esc(CONCERN[s.mainConcern] || s.mainConcern)}</span>` : '<span class="muted">-</span>';
    return `<tr class="clickable${changed ? ' flash' : ''}" data-open="${esc(s.id)}" tabindex="0">
      <td data-label="Patient"><div class="who">${avatar(s.name, s.id, { online: s.online })}<div><b>${esc(s.name || 'Anonymous')}</b><small>${esc(s.refCode)}${s.contact ? ` · ${esc(s.contact)}` : ''}</small></div></div></td>
      <td data-label="Progress">${progress}</td>
      <td data-label="Priority">${done ? levelBadge(s.triageLevel, { short: true }) : '<span class="badge plain">Pending</span>'}</td>
      <td data-label="OHAT">${ohat}</td>
      <td data-label="Top prediction" class="pred">${prediction}</td>
      <td data-label="Follow-up">${staffPill(s.staffStatus)}</td>
      <td data-label="Updated" class="time" title="${esc(fullTime(s.updatedAt))}">${ago(s.updatedAt)}</td>
    </tr>`;
  }).join('');
  // Track every patient (not just the filtered ones) so changing a filter doesn't flash rows.
  state.lastUpdated = new Map(state.all.map((s) => [s.id, s.updatedAt]));
  const n = state.sessions.length;
  $('#result-count').textContent = `${n} patient${n === 1 ? '' : 's'}${filtered ? ' match your filters' : ''}`;
  $('#f-clear').hidden = !filtered;
  $('#empty').hidden = n > 0;
  $('#empty').innerHTML = filtered
    ? emptyState('search', 'No matching patients', 'Try another search or clear the filters.')
    : emptyState('inbox', 'No assessments yet', 'Open the website and try the chatbot. New patients appear here live.');
}

$('#rows').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-open]');
  if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(tr.dataset.open); }
});

let searchTimer;
$('#f-q').addEventListener('input', () => {
  if (state.view !== 'patients') setView('patients');
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadSessions().catch((e) => toast('Search failed', e.message, { kind: 'error' })), 250);
});
['#f-status', '#f-staff'].forEach((s) => $(s).addEventListener('change', () => setFilters({})));
$('#f-level').addEventListener('click', (e) => {
  const b = e.target.closest('[data-level]');
  if (b) setFilters({ level: b.dataset.level });
});
$('#f-clear').addEventListener('click', () => setFilters({ q: '', status: '', staff: '', level: '' }));

// ---------- patient detail drawer ----------

async function openDetail(id) {
  if (state.openId !== id) {
    state.notesDraft = null;
    state.replyDraft = '';
    state.dtab = 'overview';
  }
  state.openId = id;
  const drawer = $('#drawer');
  const opening = drawer.hidden;
  drawer.hidden = false;
  $('#scrim').hidden = false;
  document.body.classList.add('drawer-open');
  if (!state.detail || state.detail.id !== id) {
    $('#drawer-body').innerHTML = '<div class="d-loading"><span class="spinner"></span>Loading patient…</div>';
  }
  try {
    const { session } = await api(`/api/admin/sessions/${encodeURIComponent(id)}`);
    if (state.openId !== id) return;
    const first = state.detail?.id !== id;
    state.detail = session;
    renderDetail(session, first);
    if (opening) $('#d-close')?.focus({ preventScroll: true });
  } catch (e) {
    $('#drawer-body').innerHTML = `<div class="d-loading">${esc(e.message)}</div>`;
  }
}

function closeDetail() {
  state.openId = null;
  state.detail = null;
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
  document.body.classList.remove('drawer-open');
}

$('#scrim').addEventListener('click', closeDetail);

function gauge(value, max, tone) {
  const c = 2 * Math.PI * 34;
  const len = max ? (value / max) * c : 0;
  return `<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="g-track" cx="40" cy="40" r="34"></circle>${len ? `<circle class="g-fill st-${tone}" cx="40" cy="40" r="34" stroke-dasharray="${len.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 40 40)"></circle>` : ''}</svg>`;
}

function dateTile(day, small = false) {
  const d = parseDay(day);
  if (!d) return `<span class="date-tile any${small ? ' sm' : ''}"><small>Any</small><b>${icon('calendar')}</b><small>date</small></span>`;
  return `<span class="date-tile${small ? ' sm' : ''}"><small>${esc(d.toLocaleDateString(undefined, { month: 'short' }))}</small><b>${d.getDate()}</b><small>${esc(d.toLocaleDateString(undefined, { weekday: 'short' }))}</small></span>`;
}

function transcriptHtml(messages) {
  return messages.map((m) => {
    const who = m.sender === 'ai' && m.meta?.source === 'kb' ? 'Clinic FAQ answer' : SENDER[m.sender] || m.sender;
    const kind = m.meta?.kind === 'alert' ? ' alert' : m.meta?.kind === 'question' ? ' question' : '';
    return `<div class="tmsg ${esc(m.sender)}${kind}" title="${esc(fullTime(m.createdAt))}"><span class="tag">${esc(who)}<time>${esc(clock(m.createdAt))}</time></span>${esc(m.text)}</div>`;
  }).join('');
}

function detailOverview(s) {
  const r = s.result;
  const notesValue = state.notesDraft ?? s.staff_notes ?? '';
  const parts = [];

  if (r) {
    const tone = LEVEL[r.level]?.s || 'good';
    parts.push(`<section class="card triage tone-${tone}">
      <div class="gauge">${gauge(r.ohatTotal, r.maxScore, tone)}<div class="gauge-c"><b>${r.ohatTotal}</b><small>of ${r.maxScore}</small></div></div>
      <div class="triage-text">
        <span class="eyebrow">OHAT score · triage</span>
        <h3>${esc(r.label || LEVEL[r.level]?.label)}</h3>
        <p class="triage-time">${icon('clock')}${esc(r.timeframe)}</p>
        ${r.reasons.length ? `<ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      </div>
    </section>`);
  } else {
    parts.push(`<section class="card progress-card">
      <div class="prog-big"><span style="width:${pctAnswered(s.answers.length)}%"></span></div>
      <p><b>Assessment in progress.</b> ${s.answers.length} of about ${QUESTION_COUNT} questions answered so far. This view updates live.</p>
    </section>`);
  }

  if (s.summary) {
    parts.push(`<section class="card"><h3 class="card-h">${icon('file')}Clinician summary<span class="badge plain src">${s.summary_source === 'ai' ? `${icon('sparkles')}Written by Claude` : 'Rule-based'}</span></h3><p class="summary">${esc(s.summary)}</p></section>`);
  }

  if (r) {
    const cats = r.categories.map((c) => {
      const sc = SCORE[c.score];
      return `<div class="cat ${sc ? `tone-${sc[0]}` : 'na'}"><div class="cat-top"><b>${esc(c.label)}</b><span class="cat-score">${sc ? `${c.score} · ${sc[1]}` : 'N/A'}</span></div><small>${esc(c.answer)}</small></div>`;
    }).join('');
    const conds = r.conditions.length ? `<div class="conds">${r.conditions.map((c) => {
      const u = URGENCY[c.urgency] || URGENCY.routine;
      return `<div class="cond tone-${u.s}">
        <div class="cond-top"><b>${esc(c.name)}</b><span class="cond-pct">${c.confidence}%</span></div>
        <div class="track"><div class="fill" style="width:${c.confidence}%"></div></div>
        <div class="cond-meta"><span class="badge tone-${u.s}">${u.label}</span><span>${esc(c.likelihood)}</span></div>
        ${c.evidence.length ? `<div class="evidence">${c.evidence.slice(0, 6).map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
      </div>`;
    }).join('')}</div>` : '<p class="muted">No specific pattern found.</p>';
    const risk = (label, band) => `<span class="badge tone-${RISK_TONE[band] || 'good'}"><span class="dot s-${RISK_TONE[band] || 'good'}"></span>${label}: ${esc(band)}</span>`;
    parts.push(`<div class="grid2">
      <section class="card"><h3 class="card-h">${icon('target')}OHAT categories</h3><div class="cats">${cats}</div></section>
      <section class="card"><h3 class="card-h">${icon('sparkles')}Predicted conditions</h3>${conds}
        <div class="risks">${risk('Decay risk', r.risks.caries)}${risk('Gum risk', r.risks.gum)}</div></section>
    </div>`);
    parts.push(`<section class="card"><h3 class="card-h">${icon('shield')}Self-care plan given to the patient</h3><ul class="checklist">${r.selfCare.map((x) => `<li>${icon('check')}<span>${esc(x)}</span></li>`).join('')}</ul></section>`);
  }

  if (s.appointments.length) {
    parts.push(`<section class="card"><h3 class="card-h">${icon('calendar')}Appointment requests</h3><ul class="mini-appts">${s.appointments.map((a) => {
      const d = parseDay(a.preferred_date);
      const when = d ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Any date';
      return `<li>${dateTile(a.preferred_date, true)}<div><b>${esc(when)}${a.preferred_time ? ` · ${esc(a.preferred_time)}` : ''}</b><small>${esc(a.contact)}${a.notes ? ` · ${esc(a.notes)}` : ''}</small></div><span class="pill st-${esc(a.status)}">${esc(APPT[a.status] || a.status)}</span></li>`;
    }).join('')}</ul></section>`);
  }

  parts.push(`<section class="card"><h3 class="card-h">${icon('edit')}Internal notes<span class="muted small">not shown to the patient</span></h3>
    <textarea class="notes" id="d-notes" placeholder="A note for the team, for example: called on Monday, prefers mornings.">${esc(notesValue)}</textarea>
    <div class="row"><button class="btn btn-primary btn-sm" type="button" id="d-save">${icon('check')}Save notes</button><span class="saved" id="d-saved" aria-live="polite"></span></div>
  </section>`);

  parts.push(`<section class="danger"><div><b>Delete this record</b><small>Removes the answers, result and conversation for good.</small></div>
    <button class="btn btn-danger btn-sm" type="button" id="d-delete">${icon('trash')}Delete</button></section>`);
  return parts.join('');
}

function detailAnswers(s) {
  if (!s.answers.length) return emptyState('list', 'No answers yet', 'Answers appear here as the patient replies.');
  const groups = [];
  for (const a of s.answers) {
    const sec = a.section || 'Answers';
    let g = groups.find((x) => x.sec === sec);
    if (!g) groups.push((g = { sec, items: [] }));
    g.items.push(a);
  }
  return groups.map((g) => `<section class="card"><h3 class="card-h">${esc(g.sec)}<span class="chip-n">${g.items.length}</span></h3>
    <dl class="qa">${g.items.map((a) => {
      const sc = SCORE[a.score];
      return `<div class="qa-row"><dt>${esc(a.question_text.split('\n').pop())}</dt><dd>${esc(a.label)}${sc ? ` <span class="badge tone-${sc[0]}" title="OHAT score">${a.score}</span>` : ''}</dd></div>`;
    }).join('')}</dl></section>`).join('');
}

function detailChat(s) {
  return `<section class="card chat">
    <div class="chat-status${s.online ? ' on' : ''}"><span class="live-dot"></span>${s.online
      ? 'The patient is online. Your message appears in their chat instantly.'
      : 'The patient is offline. They will see your message when they next open the chat.'}</div>
    <div class="transcript" id="d-transcript">${transcriptHtml(s.messages)}</div>
    <div class="quick" aria-label="Quick replies">${QUICK_REPLIES.map((q) => `<button type="button" class="chip" data-reply="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <form class="composer" id="d-reply">
      <input id="d-reply-text" maxlength="1000" placeholder="Message the patient…" aria-label="Message the patient" autocomplete="off" value="${esc(state.replyDraft)}">
      <button class="btn btn-primary" type="submit">${icon('send')}<span>Send</span></button>
    </form>
  </section>`;
}

function setDetailTab(tab) {
  state.dtab = tab;
  $$('#drawer [data-dtab]').forEach((b) => {
    const on = b.dataset.dtab === tab;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
  });
  $$('#drawer [data-dpanel]').forEach((p) => { p.hidden = p.dataset.dpanel !== tab; });
  if (tab === 'chat') {
    const tr = $('#d-transcript');
    if (tr) tr.scrollTop = tr.scrollHeight;
  }
}

function renderDetail(s, first = false) {
  const drawer = $('#drawer');
  const body = $('#drawer-body');
  const oldTr = $('#d-transcript');
  const trWasAtBottom = !oldTr || oldTr.scrollHeight - oldTr.scrollTop - oldTr.clientHeight < 80;
  const trTop = oldTr?.scrollTop || 0;
  const keepScroll = first ? 0 : drawer.scrollTop;
  const done = s.status === 'completed';
  drawer.dataset.level = done ? s.triage_level || 'healthy' : 'progress';
  body.classList.toggle('first-render', first); // entrance animations only when a patient is first opened

  const contact = contactHref(s.contact);
  const meta = [
    s.contact ? `${icon(contact?.kind || 'phone')}<b>${esc(s.contact)}</b>` : `${icon('phone')}No contact given`,
    `${icon('user')}${s.for_whom === 'other' ? 'Completed by a carer' : 'Self-assessment'}${s.age_group ? ` · age ${esc(AGE[s.age_group] || s.age_group)}` : ''}`,
    `${icon('globe')}${esc(LANG_NAME[s.lang] || 'English')}`,
    s.main_concern ? `${icon('target')}${esc(CONCERN[s.main_concern] || s.main_concern)}` : '',
    `${icon('clock')}Started ${esc(fullTime(s.created_at))}`,
  ].filter(Boolean).map((m) => `<span>${m}</span>`).join('');

  const tabs = [['overview', 'Overview', 'file', null], ['answers', 'Answers', 'list', s.answers.length], ['chat', 'Conversation', 'message', s.messages.length]];

  body.innerHTML = `
    <header class="d-hero">
      <div class="d-bar">
        <button class="d-ref" type="button" id="d-copy" title="Copy reference code">${icon('copy')}<span>${esc(s.ref_code)}</span></button>
        <button class="icon-btn d-close" type="button" id="d-close" aria-label="Close" title="Close (Esc)">${icon('x')}</button>
      </div>
      <div class="d-id">
        ${avatar(s.name, s.id, { online: s.online, size: 'lg' })}
        <div class="d-name">
          <h2>${esc(s.name || 'Anonymous')}</h2>
          <div class="d-badges">${done ? levelBadge(s.triage_level) : `<span class="badge tone-brand">${icon('activity')}In progress · ${s.answers.length} answers</span>`}${s.online ? '<span class="badge tone-good"><span class="live-dot on"></span>Online now</span>' : ''}${done && s.completed_at ? `<span class="badge plain" title="${esc(fullTime(s.completed_at))}">${icon('check')}Finished ${esc(ago(s.completed_at))}</span>` : ''}</div>
        </div>
      </div>
      <div class="d-meta">${meta}</div>
      <div class="d-follow">
        <span class="d-follow-l">Follow-up</span>
        <div class="seg" role="group" aria-label="Follow-up status">${Object.entries(STAFF).map(([v, l]) => `<button type="button" class="st-${v}" aria-pressed="${s.staff_status === v}" data-staff="${v}"><i></i>${l}</button>`).join('')}</div>
        ${contactLink(s.contact, { labelled: true })}
      </div>
    </header>
    <div class="d-tabs" role="tablist" aria-label="Patient detail">${tabs.map(([id, label, ic, n]) => `<button type="button" role="tab" id="dt-${id}" aria-controls="dp-${id}" aria-selected="false" data-dtab="${id}">${icon(ic)}${label}${n !== null ? `<span class="chip-n">${n}</span>` : ''}</button>`).join('')}</div>
    <div class="d-panel" id="dp-overview" role="tabpanel" aria-labelledby="dt-overview" data-dpanel="overview">${detailOverview(s)}</div>
    <div class="d-panel" id="dp-answers" role="tabpanel" aria-labelledby="dt-answers" data-dpanel="answers" hidden>${detailAnswers(s)}</div>
    <div class="d-panel" id="dp-chat" role="tabpanel" aria-labelledby="dt-chat" data-dpanel="chat" hidden>${detailChat(s)}</div>`;

  setDetailTab(state.dtab);
  const tr = $('#d-transcript');
  tr.scrollTop = trWasAtBottom ? tr.scrollHeight : trTop;
  drawer.scrollTop = keepScroll;

  $('#d-close').addEventListener('click', closeDetail);
  $('#d-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(s.ref_code); toast('Reference copied', s.ref_code, { kind: 'success' }); }
    catch { toast('Could not copy', 'Select the code and copy it by hand.', { kind: 'error' }); }
  });

  const tabButtons = $$('[data-dtab]', body);
  tabButtons.forEach((b, i) => {
    b.addEventListener('click', () => setDetailTab(b.dataset.dtab));
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      const next = tabButtons[(i + step + tabButtons.length) % tabButtons.length];
      setDetailTab(next.dataset.dtab);
      next.focus();
    });
  });

  $$('[data-staff]', body).forEach((b) => b.addEventListener('click', async () => {
    const value = b.dataset.staff;
    if (value === s.staff_status) return;
    const previous = s.staff_status;
    s.staff_status = value;
    $$('[data-staff]', body).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    try {
      await api(`/api/admin/sessions/${s.id}`, { method: 'PATCH', body: { staffStatus: value } });
      scheduleRefresh();
    } catch (ex) {
      s.staff_status = previous;
      $$('[data-staff]', body).forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.staff === previous)));
      toast('Not saved', ex.message, { kind: 'error' });
    }
  }));

  $('#d-notes').addEventListener('input', (e) => { state.notesDraft = e.target.value; $('#d-saved').textContent = ''; });
  $('#d-save').addEventListener('click', async () => {
    try {
      await api(`/api/admin/sessions/${s.id}`, { method: 'PATCH', body: { staffNotes: $('#d-notes').value } });
      s.staff_notes = $('#d-notes').value;
      state.notesDraft = null;
      $('#d-saved').innerHTML = `${icon('check')}Saved`;
    } catch (ex) { toast('Not saved', ex.message, { kind: 'error' }); }
  });

  $('#d-delete').addEventListener('click', async () => {
    if (!confirm(`Permanently delete ${s.name || 'this'} record, its answers and conversation?`)) return;
    try {
      await api(`/api/admin/sessions/${s.id}`, { method: 'DELETE' });
      closeDetail();
      toast('Record deleted', s.name || 'Anonymous', { kind: 'success' });
      scheduleRefresh();
    } catch (ex) { toast('Not deleted', ex.message, { kind: 'error' }); }
  });

  const input = $('#d-reply-text');
  input.addEventListener('input', () => { state.replyDraft = input.value; });
  $$('[data-reply]', body).forEach((b) => b.addEventListener('click', () => {
    input.value = b.dataset.reply;
    state.replyDraft = input.value;
    input.focus();
  }));
  $('#d-reply').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      const res = await api(`/api/admin/sessions/${s.id}/message`, { method: 'POST', body: { text } });
      input.value = '';
      state.replyDraft = '';
      appendTranscript(res.message);
      if (!res.delivered) toast('Message saved', 'The patient is offline and will see it next time they open the chat.');
    } catch (ex) { toast('Not sent', ex.message, { kind: 'error' }); }
    finally { input.disabled = false; input.focus(); }
  });
}

function appendTranscript(message) {
  if (!state.detail || !message) return;
  if (state.detail.messages.some((m) => m.id === message.id)) return;
  state.detail.messages.push(message);
  const tr = $('#d-transcript');
  if (!tr) return;
  const nearBottom = tr.scrollHeight - tr.scrollTop - tr.clientHeight < 80;
  tr.insertAdjacentHTML('beforeend', transcriptHtml([message]));
  tr.lastElementChild.classList.add('new');
  if (nearBottom) tr.scrollTop = tr.scrollHeight;
  const count = $('#dt-chat .chip-n');
  if (count) count.textContent = state.detail.messages.length;
}

function scheduleDetailRefresh(delay = 500) {
  clearTimeout(state.detailTimer);
  state.detailTimer = setTimeout(() => {
    if (!state.openId) return;
    // Don't re-render while staff are typing; try again shortly.
    if (['d-reply-text', 'd-notes'].includes(document.activeElement?.id)) { scheduleDetailRefresh(2000); return; }
    openDetail(state.openId);
  }, delay);
}

// ---------- appointments ----------

async function loadAppointments() {
  const { appointments } = await api('/api/admin/appointments');
  state.appts = appointments;
  renderAppointments();
}

function apptCard(a) {
  const quick = a.status === 'requested' ? ['confirmed', 'Confirm'] : a.status === 'confirmed' ? ['done', 'Mark done'] : null;
  const d = parseDay(a.preferred_date);
  return `<article class="appt st-${esc(a.status)}">
    <div class="appt-top">
      ${dateTile(a.preferred_date)}
      <div class="appt-main">
        <b>${esc(a.name)}</b>
        <small>${esc(a.contact)}${a.ref_code && a.session_id ? ` · <a href="#" data-open="${esc(a.session_id)}">${esc(a.ref_code)}</a>` : ''}</small>
        <small class="appt-when" title="${esc(fullTime(a.created_at))}">Requested ${ago(a.created_at)}</small>
        <div class="appt-tags">
          <span class="tag">${icon('calendar')}${esc(d ? d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : 'Any date')}</span>
          ${a.preferred_time ? `<span class="tag">${icon('clock')}${esc(a.preferred_time)}</span>` : ''}
          ${a.triage_level ? levelBadge(a.triage_level, { short: true }) : ''}
        </div>
      </div>
    </div>
    ${a.notes ? `<p class="appt-notes">${esc(a.notes)}</p>` : ''}
    <div class="appt-foot">
      <label class="select sm st-${esc(a.status)}"><select data-appt="${esc(a.id)}" aria-label="Appointment status for ${esc(a.name)}">${Object.entries(APPT).map(([v, l]) => `<option value="${v}"${a.status === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      ${contactLink(a.contact)}
      ${quick ? `<button class="btn btn-primary btn-xs" type="button" data-appt-quick="${quick[0]}" data-id="${esc(a.id)}">${icon('check')}${quick[1]}</button>` : ''}
    </div>
  </article>`;
}

function renderAppointments() {
  const counts = { '': state.appts.length };
  for (const a of state.appts) counts[a.status] = (counts[a.status] || 0) + 1;
  $('#a-filter').innerHTML = [['', 'All'], ...Object.entries(APPT)].map(([v, l]) => `<button class="chip" type="button" data-astatus="${v}" aria-pressed="${state.apptFilter === v}">${v ? `<i class="st-dot st-${v}"></i>` : ''}${l}<span class="chip-n">${counts[v] || 0}</span></button>`).join('');
  const list = state.appts.filter((a) => !state.apptFilter || a.status === state.apptFilter);
  $('#appt-rows').innerHTML = list.map(apptCard).join('');
  $('#appt-empty').hidden = list.length > 0;
  $('#appt-empty').innerHTML = state.apptFilter
    ? emptyState('calendar', `No ${APPT[state.apptFilter].toLowerCase()} appointments`, 'Choose another status above.')
    : emptyState('calendar', 'No appointment requests yet', 'Requests from the chatbot and the booking page appear here.');
}

async function setApptStatus(id, status) {
  const a = state.appts.find((x) => x.id === id);
  const previous = a?.status;
  if (a) { a.status = status; renderAppointments(); }
  try {
    await api(`/api/admin/appointments/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
    toast(`Appointment ${APPT[status].toLowerCase()}`, a?.name || '', { kind: 'success' });
    scheduleRefresh();
  } catch (ex) {
    if (a) { a.status = previous; renderAppointments(); }
    toast('Not saved', ex.message, { kind: 'error' });
  }
}

$('#appt-rows').addEventListener('change', (e) => {
  const sel = e.target.closest('select[data-appt]');
  if (sel) setApptStatus(sel.dataset.appt, sel.value);
});
$('#appt-rows').addEventListener('click', (e) => {
  const b = e.target.closest('[data-appt-quick]');
  if (b) setApptStatus(b.dataset.id, b.dataset.apptQuick);
});
$('#a-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-astatus]');
  if (!b) return;
  state.apptFilter = b.dataset.astatus;
  renderAppointments();
});

// ---------- blog ----------

const MAX_PHOTOS = 20;
const PHOTO_EDGE = 1600; // longest side after shrinking
const blog = { posts: [], filter: '', post: null, status: 'draft', photos: [], cover: null, dirty: false };
let photoKey = 0;

async function loadPosts() {
  const { posts } = await api('/api/admin/posts');
  blog.posts = posts;
  renderPosts();
}

const postDate = (p) => new Date(p.publishedAt || p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function renderPosts() {
  const counts = { '': blog.posts.length, published: 0, draft: 0 };
  for (const p of blog.posts) counts[p.status] += 1;
  $('#b-filter').innerHTML = [['', 'All'], ['published', 'Published'], ['draft', 'Drafts']].map(([v, l]) => `<button class="chip" type="button" data-bfilter="${v}" aria-pressed="${blog.filter === v}">${v ? `<i class="st-dot st-${v}"></i>` : ''}${l}<span class="chip-n">${counts[v]}</span></button>`).join('');
  const list = blog.posts.filter((p) => !blog.filter || p.status === blog.filter);
  $('#b-posts').innerHTML = list.map((p) => `
    <article class="post-card">
      <button class="post-cover" type="button" data-edit="${esc(p.id)}" aria-label="Edit ${esc(p.title)}">
        ${p.cover ? `<img src="${esc(p.cover)}" alt="" loading="lazy">` : `<span class="post-ph">${icon('image')}</span>`}
        <span class="pill st-${esc(p.status)}">${p.status === 'published' ? 'Published' : 'Draft'}</span>
        ${p.imageCount > 1 ? `<span class="post-count">${icon('image')}${p.imageCount}</span>` : ''}
      </button>
      <div class="post-body">
        ${p.category ? `<span class="post-cat">${esc(p.category)}</span>` : ''}
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.excerpt)}</p>
        <span class="post-meta">${icon('clock')}${esc(postDate(p))} · ${p.readMinutes} min read</span>
      </div>
      <div class="post-actions">
        <button class="btn btn-soft btn-xs" type="button" data-edit="${esc(p.id)}">${icon('edit')}Edit</button>
        ${p.status === 'published' ? `<a class="btn btn-ghost btn-xs" href="/blog?p=${encodeURIComponent(p.slug)}" target="_blank" rel="noopener">${icon('external')}View</a>` : ''}
        <button class="icon-btn sm post-del" type="button" data-del="${esc(p.id)}" aria-label="Delete ${esc(p.title)}" title="Delete">${icon('trash')}</button>
      </div>
    </article>`).join('');
  $('#b-empty').hidden = list.length > 0;
  $('#b-empty').innerHTML = blog.filter
    ? emptyState('news', blog.filter === 'draft' ? 'No drafts' : 'Nothing published yet', 'Choose another filter above.')
    : emptyState('news', 'No posts yet', 'Write your first article. Add photos and publish it to the website\'s Blog page.');
  $('#ed-categories').innerHTML = [...new Set(blog.posts.map((p) => p.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join('');
}

$('#b-filter').addEventListener('click', (e) => {
  const b = e.target.closest('[data-bfilter]');
  if (b) { blog.filter = b.dataset.bfilter; renderPosts(); }
});
$('#b-new').addEventListener('click', () => openEditor(null));
$('#b-posts').addEventListener('click', async (e) => {
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    try { openEditor((await api(`/api/admin/posts/${encodeURIComponent(edit.dataset.edit)}`)).post); }
    catch (ex) { toast('Could not open the post', ex.message, { kind: 'error' }); }
    return;
  }
  const del = e.target.closest('[data-del]');
  if (del) {
    const p = blog.posts.find((x) => x.id === del.dataset.del);
    if (p) await removePost(p);
  }
});

async function removePost(p) {
  if (!confirm(`Delete "${p.title}" and its photos? This cannot be undone.`)) return false;
  try {
    await api(`/api/admin/posts/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
    toast('Post deleted', p.title, { kind: 'success' });
    await loadPosts();
    return true;
  } catch (ex) {
    toast('Not deleted', ex.message, { kind: 'error' });
    return false;
  }
}

// ---- editor ----

function openEditor(post) {
  blog.post = post;
  blog.status = post?.status || 'draft';
  blog.photos = (post?.imageIds || []).map((id) => ({ key: ++photoKey, id, src: `/api/images/${id}`, state: 'done' }));
  blog.cover = post?.coverId || null;
  $('#ed-title').value = post?.title || '';
  $('#ed-category').value = post?.category || '';
  $('#ed-summary').value = post?.summary || '';
  $('#ed-body').value = post?.body || '';
  $('#ed-kicker').textContent = post ? 'Edit post' : 'New post';
  $('#ed-heading').textContent = post ? post.title : 'Write a post';
  $('#ed-delete').hidden = !post;
  const view = $('#ed-view');
  view.hidden = !(post && post.status === 'published');
  if (post) view.href = `/blog?p=${encodeURIComponent(post.slug)}`;
  $('#ed-err').textContent = '';
  syncStatus();
  renderThumbs();
  updateCounts();
  blog.dirty = false;
  $('#editor').hidden = false;
  $('#ed-scrim').hidden = false;
  document.body.classList.add('drawer-open');
  $('#editor .ed-body').scrollTop = 0;
  setTimeout(() => $('#ed-title').focus(), 50);
}

function closeEditor({ force = false } = {}) {
  if (!force && blog.dirty && !confirm('Close without saving? Your changes will be lost.')) return;
  $('#editor').hidden = true;
  $('#ed-scrim').hidden = true;
  if ($('#drawer').hidden) document.body.classList.remove('drawer-open');
}

function syncStatus() {
  $$('#editor [data-status]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.status === blog.status)));
  $('#ed-save-l').textContent = blog.status === 'published' ? (blog.post?.status === 'published' ? 'Save changes' : 'Publish') : 'Save draft';
}

function updateCounts() {
  $$('#editor [data-count-for]').forEach((el) => {
    const input = $(`#${el.dataset.countFor}`);
    el.textContent = `${input.value.length}/${input.maxLength}`;
  });
  $('#ed-photo-count').textContent = `${blog.photos.length}/${MAX_PHOTOS}`;
}

function renderThumbs() {
  const cover = blog.cover && blog.photos.some((p) => p.id === blog.cover) ? blog.cover : blog.photos.find((p) => p.id)?.id;
  $('#ed-thumbs').innerHTML = blog.photos.map((p, i) => `
    <li class="thumb ${p.state}${p.id && p.id === cover ? ' is-cover' : ''}" data-key="${p.key}">
      ${p.src ? `<img src="${esc(p.src)}" alt="">` : '<span class="thumb-ph"></span>'}
      ${p.id && p.id === cover ? `<span class="thumb-badge">${icon('star')}Cover</span>` : ''}
      ${p.state === 'uploading' || p.state === 'resizing' ? '<span class="thumb-busy"><span class="spinner"></span></span>' : ''}
      ${p.state === 'error' ? `<button class="thumb-retry" type="button" data-retry="${p.key}" title="${esc(p.error || 'Upload failed')}">${icon('refresh')}Retry</button>` : ''}
      <div class="thumb-tools">
        ${p.id && p.id !== cover ? `<button type="button" data-cover="${p.key}" title="Use as cover" aria-label="Use photo ${i + 1} as cover">${icon('star')}</button>` : ''}
        ${i > 0 ? `<button type="button" data-move="${p.key}" data-dir="-1" title="Move left" aria-label="Move photo ${i + 1} left">${icon('left')}</button>` : ''}
        ${i < blog.photos.length - 1 ? `<button type="button" data-move="${p.key}" data-dir="1" title="Move right" aria-label="Move photo ${i + 1} right">${icon('right')}</button>` : ''}
        <button type="button" data-remove="${p.key}" title="Remove" aria-label="Remove photo ${i + 1}">${icon('x')}</button>
      </div>
    </li>`).join('');
  $('#ed-drop').classList.toggle('full', blog.photos.length >= MAX_PHOTOS);
  updateCounts();
}

$('#ed-thumbs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const key = Number(b.dataset.cover || b.dataset.move || b.dataset.remove || b.dataset.retry);
  const i = blog.photos.findIndex((p) => p.key === key);
  if (i < 0) return;
  if (b.dataset.cover) blog.cover = blog.photos[i].id;
  if (b.dataset.move) {
    const j = i + Number(b.dataset.dir);
    [blog.photos[i], blog.photos[j]] = [blog.photos[j], blog.photos[i]];
  }
  if (b.dataset.remove) {
    if (blog.photos[i].id === blog.cover) blog.cover = null;
    blog.photos.splice(i, 1);
  }
  if (b.dataset.retry) uploadPhoto(blog.photos[i]);
  blog.dirty = true;
  renderThumbs();
});

/** Shrinks a photo to at most PHOTO_EDGE pixels (WebP, or JPEG where WebP is unsupported) plus a small preview. */
async function shrinkPhoto(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // transparent PNG areas become white
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const toBlob = (type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  let blob = await toBlob('image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob('image/jpeg', 0.85);
  const ps = Math.min(1, 360 / Math.max(width, height));
  const thumb = Object.assign(document.createElement('canvas'), { width: Math.round(width * ps), height: Math.round(height * ps) });
  thumb.getContext('2d').drawImage(canvas, 0, 0, thumb.width, thumb.height);
  return { blob, width, height, preview: thumb.toDataURL('image/jpeg', 0.8) };
}

let uploadsRunning = 0;
const uploadQueue = [];
function uploadPhoto(photo) {
  photo.state = 'resizing';
  photo.error = null;
  uploadQueue.push(photo);
  pumpUploads();
}
async function pumpUploads() {
  while (uploadsRunning < 2 && uploadQueue.length) {
    const photo = uploadQueue.shift();
    uploadsRunning += 1;
    (async () => {
      try {
        if (!photo.shrunk) {
          photo.shrunk = await shrinkPhoto(photo.file);
          photo.src = photo.shrunk.preview;
        }
        photo.state = 'uploading';
        renderThumbs();
        const res = await fetch('/api/admin/images', {
          method: 'POST',
          headers: { Authorization: `Bearer ${state.token}`, 'Content-Type': photo.shrunk.blob.type, 'X-Image-Width': photo.shrunk.width, 'X-Image-Height': photo.shrunk.height },
          body: photo.shrunk.blob,
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { logout(); throw new Error('Session expired - please sign in again.'); }
        if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
        photo.id = data.image.id;
        photo.state = 'done';
      } catch (ex) {
        photo.state = 'error';
        photo.error = ex.message;
      } finally {
        uploadsRunning -= 1;
        renderThumbs();
        pumpUploads();
      }
    })();
  }
}

function addPhotos(files) {
  const ok = [...files].filter((f) => /^image\/(jpeg|png|webp)$/.test(f.type));
  if (ok.length < files.length) toast('Some files were skipped', 'Only JPG, PNG and WebP photos can be added.', { kind: 'error' });
  const room = MAX_PHOTOS - blog.photos.length;
  if (ok.length > room) toast(`Only ${room} more photo${room === 1 ? '' : 's'} fit`, `A post can have up to ${MAX_PHOTOS} photos.`, { kind: 'error' });
  for (const file of ok.slice(0, Math.max(0, room))) {
    const photo = { key: ++photoKey, file, id: null, src: null, state: 'resizing' };
    blog.photos.push(photo);
    uploadPhoto(photo);
  }
  blog.dirty = true;
  renderThumbs();
}

$('#ed-files').addEventListener('change', (e) => { addPhotos(e.target.files); e.target.value = ''; });
const drop = $('#ed-drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => addPhotos(e.dataTransfer.files));

$('#editor').addEventListener('click', (e) => {
  const st = e.target.closest('[data-status]');
  if (st) { blog.status = st.dataset.status; blog.dirty = true; syncStatus(); }
});
$('#ed-form').addEventListener('input', () => { blog.dirty = true; updateCounts(); $('#ed-err').textContent = ''; });
$('#ed-close').addEventListener('click', () => closeEditor());
$('#ed-cancel').addEventListener('click', () => closeEditor());
$('#ed-scrim').addEventListener('click', () => closeEditor());
$('#ed-delete').addEventListener('click', async () => {
  if (blog.post && await removePost({ id: blog.post.id, title: blog.post.title })) closeEditor({ force: true });
});

$('#ed-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#ed-err');
  const title = $('#ed-title').value.trim();
  const body = $('#ed-body').value.trim();
  if (!title) { err.textContent = 'Please add a title.'; $('#ed-title').focus(); return; }
  if (!body) { err.textContent = 'Please write the article text.'; $('#ed-body').focus(); return; }
  if (blog.photos.some((p) => p.state === 'resizing' || p.state === 'uploading')) { err.textContent = 'Please wait until the photos finish uploading.'; return; }
  if (blog.photos.some((p) => p.state === 'error')) { err.textContent = 'Some photos failed to upload. Retry or remove them first.'; return; }
  const imageIds = blog.photos.map((p) => p.id);
  const payload = {
    title, body, status: blog.status,
    category: $('#ed-category').value.trim(),
    summary: $('#ed-summary').value.trim(),
    imageIds, coverId: imageIds.includes(blog.cover) ? blog.cover : imageIds[0] || null,
  };
  const btn = $('#ed-save');
  btn.disabled = true;
  try {
    const { post } = blog.post
      ? await api(`/api/admin/posts/${encodeURIComponent(blog.post.id)}`, { method: 'PATCH', body: payload })
      : await api('/api/admin/posts', { method: 'POST', body: payload });
    const wasPublished = blog.post?.status === 'published';
    blog.dirty = false;
    closeEditor({ force: true });
    toast(post.status === 'published' ? (wasPublished ? 'Post updated' : 'Post published') : 'Draft saved', post.title, { kind: 'success' });
    await loadPosts();
  } catch (ex) {
    err.textContent = ex.message;
  } finally {
    btn.disabled = false;
  }
});

// ---------- export ----------

async function exportCsv() {
  try {
    const res = await fetch('/api/admin/export.csv', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `assessments-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
    toast('Export ready', 'The CSV file is downloading.', { kind: 'success' });
  } catch (e) { toast('Export failed', e.message, { kind: 'error' }); }
}

// ---------- page-wide clicks and keys ----------

document.addEventListener('click', (e) => {
  const t = e.target;
  if (t.closest('[data-theme-toggle]')) { toggleTheme(); return; }
  const action = t.closest('[data-action]')?.dataset.action;
  if (action === 'logout') { logout(); return; }
  if (action === 'export') { exportCsv(); return; }
  const quick = t.closest('[data-quick]');
  if (quick) { quickStatus(quick.dataset.id, quick.dataset.quick); return; }
  const go = t.closest('[data-go]');
  if (go) { e.preventDefault(); goTo(go.dataset.go); return; }
  const open = t.closest('[data-open]');
  if (open?.dataset.open && !t.closest('a[href^="tel:"], a[href^="mailto:"]')) { e.preventDefault(); openDetail(open.dataset.open); }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#editor').hidden) { closeEditor(); return; }
  if (e.key === 'Escape' && state.openId) closeDetail();
  if (e.key === '/' && !$('#app').hidden && !state.openId && !e.target.closest('input, textarea, select')) {
    e.preventDefault();
    $('#f-q').focus();
  }
});

// ---------- live updates ----------

const nameOf = (id) => state.all.find((s) => s.id === id)?.name || 'A patient';

function setLive(on, text, sub) {
  $$('[data-live]').forEach((el) => el.classList.toggle('on', on));
  $$('[data-live-text]').forEach((el) => { el.textContent = text; });
  $$('[data-live-sub]').forEach((el) => { el.textContent = sub; });
}

// Notifications shared by both update modes.
const notify = {
  created: (id) => {
    pushFeed({ kind: 'created', id });
    toast('New patient started a check', 'They appear in the patient list now.', { onClick: () => openDetail(id) });
  },
  redFlag: (id) => {
    pushFeed({ kind: 'redFlag', id, name: nameOf(id) });
    toast('EMERGENCY red flag', `${nameOf(id)} reported emergency symptoms.`, { critical: true, onClick: () => openDetail(id) });
  },
  completed: (id, name, level, topCondition) => {
    pushFeed({ kind: 'completed', id, name, level, text: topCondition || '' });
    toast(`Check finished: ${name || 'Anonymous'}`, `${LEVEL[level]?.label || ''}${topCondition ? ` · ${topCondition}` : ''}`,
      { critical: ['urgent', 'emergency'].includes(level), onClick: () => openDetail(id) });
  },
  question: (id, text) => {
    pushFeed({ kind: 'question', id, name: nameOf(id), text: text.slice(0, 90) });
    toast(`${nameOf(id)} asked a question`, text.slice(0, 120), { onClick: () => openDetail(id) });
  },
  appointment: (sessionId) => {
    pushFeed({ kind: 'appointment', id: sessionId, name: sessionId ? nameOf(sessionId) : 'A website visitor' });
    toast('New appointment request', sessionId ? `From ${nameOf(sessionId)}.` : 'From the booking page.', { onClick: () => goTo('requested') });
  },
};

function stopLive() {
  state.stream?.close();
  state.stream = null;
  clearInterval(state.poll);
  state.poll = null;
}

function connectLive() {
  stopLive();
  if (state.realtime === 'poll') startPolling();
  else connectStream();
}

// Instant updates over Server-Sent Events (normal Node server).
function connectStream() {
  const es = new EventSource(`/api/admin/stream?token=${encodeURIComponent(state.token)}`);
  es.addEventListener('hello', () => setLive(true, 'Live', 'Updates arrive instantly'));
  es.onerror = () => setLive(false, 'Reconnecting…', 'Trying to reach the server');

  es.addEventListener('session', async (e) => {
    const ev = JSON.parse(e.data);
    scheduleRefresh();
    if (ev.sessionId === state.openId) {
      if (ev.type === 'deleted') closeDetail();
      else scheduleDetailRefresh();
    }
    if (ev.type === 'created') notify.created(ev.sessionId);
    if (ev.type === 'red_flag') notify.redFlag(ev.sessionId);
    if (ev.type === 'completed') {
      try {
        const { session } = await api(`/api/admin/sessions/${encodeURIComponent(ev.sessionId)}`);
        notify.completed(ev.sessionId, session.name, session.triage_level, session.top_condition);
      } catch { /* toast is best-effort */ }
    }
  });
  es.addEventListener('message', (e) => {
    const { sessionId, message } = JSON.parse(e.data);
    if (sessionId === state.openId) appendTranscript(message);
    if (message.sender === 'user' && message.meta?.kind === 'question') notify.question(sessionId, message.text);
    scheduleRefresh();
  });
  es.addEventListener('appointment', (e) => {
    const ev = JSON.parse(e.data);
    scheduleRefresh();
    if (ev.sessionId === state.openId) scheduleDetailRefresh();
    if (!ev.status) notify.appointment(ev.sessionId);
  });
  es.addEventListener('presence', (e) => {
    const ev = JSON.parse(e.data);
    scheduleRefresh();
    if (ev.sessionId === state.openId) scheduleDetailRefresh();
  });
  state.stream = es;
}

// Polling every few seconds (serverless hosts such as Vercel).
function startPolling() {
  let since = new Date(Date.now() - 5000).toISOString();
  const handled = new Set();
  // True the first time a key is seen; the server re-sends a short overlap window.
  const once = (key) => {
    if (handled.has(key)) return false;
    if (handled.size > 5000) handled.clear();
    handled.add(key);
    return true;
  };
  let lastOnlineCheck = 0;

  const tick = async () => {
    if (!state.token || document.hidden) return;
    try {
      const ch = await api(`/api/admin/changes?since=${encodeURIComponent(since)}`);
      since = ch.now;
      setLive(true, 'Live', 'Refreshing every 3 seconds');
      let changed = false;
      for (const s of ch.sessions) {
        changed = true;
        if (s.created && once(`created:${s.id}`)) notify.created(s.id);
        if (s.completed && once(`completed:${s.id}`)) notify.completed(s.id, s.name, s.triageLevel, s.topCondition);
        if (s.id === state.openId) scheduleDetailRefresh();
      }
      for (const { sessionId, message } of ch.messages) {
        if (!once(`m:${message.id}`)) continue;
        changed = true;
        if (sessionId === state.openId) appendTranscript(message);
        if (message.meta?.kind === 'alert') notify.redFlag(sessionId);
        if (message.sender === 'user' && message.meta?.kind === 'question') notify.question(sessionId, message.text);
      }
      for (const a of ch.appointments) {
        changed = true;
        if (a.isNew && once(`a:${a.id}`)) notify.appointment(a.sessionId);
        if (a.sessionId === state.openId) scheduleDetailRefresh();
      }
      // "Online now" depends on time passing, so refresh the list now and then even when idle.
      if (changed || Date.now() - lastOnlineCheck > 15000) {
        lastOnlineCheck = Date.now();
        scheduleRefresh();
      }
    } catch {
      setLive(false, 'Reconnecting…', 'Trying to reach the server');
    }
  };
  tick();
  state.poll = setInterval(tick, 3000);
}

// Keep relative times and the greeting fresh.
setInterval(() => {
  if (!state.token || document.hidden) return;
  loadSessions().catch(() => {});
  renderAppointments();
  if (state.view === 'overview') showView('overview');
}, 60000);

// ---------- boot ----------

paintIcons();
syncTheme();
state.token = tokenStore.get();
if (state.token) showApp(); else showLogin();
