// Booking page (/book): a three-step appointment request with a live summary ticket.
import { t, getLang, DICT } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SESSION_KEY = 'brightsmile_session_id'; // the chatbot's saved self-check, if any
const LOCALE = { en: 'en-GB', si: 'si-LK', ta: 'ta-LK' };
const DAYS_AHEAD = 21;
const CLOSING_HOUR = 15; // after 3 pm, today is no longer offered

const form = $('#bk-form');
const state = { step: 1, reached: 1, clinic: null, session: null, sending: false };

function api(path, options = {}) {
  const sep = path.includes('?') ? '&' : '?';
  return fetch(`${path}${sep}lang=${getLang()}`, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  });
}

// ---------- clinic details ----------

function applyClinic() {
  const clinic = state.clinic;
  if (clinic) {
    const local = { ...clinic, ...(clinic.i18n?.[getLang()] || {}) };
    $$('[data-clinic]').forEach((el) => { if (local[el.dataset.clinic]) el.textContent = local[el.dataset.clinic]; });
    $('#bk-directions').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clinic.address)}`;
  }
  document.title = `${t('bk.docTitle')} · ${clinic?.name || 'SELF DOC'}`;
  $('#bk-emergency-text').textContent = t('bk.emergency', { n: clinic?.emergencyNumber || '1990' });
  $('#year').textContent = new Date().getFullYear();
}

// ---------- days ----------

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function openDays() {
  const out = [];
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() >= CLOSING_HOUR) day.setDate(day.getDate() + 1);
  while (out.length < DAYS_AHEAD) {
    if (day.getDay() !== 0 && day.getDay() !== 6) out.push(new Date(day)); // closed at weekends
    day.setDate(day.getDate() + 1);
  }
  return out;
}

function renderDays() {
  const chosen = form.elements.date?.value ?? '';
  const locale = LOCALE[getLang()];
  const today = isoDay(new Date());
  const tomorrow = isoDay(new Date(Date.now() + 86400000));
  const chips = [`<label class="bk-day any"><input type="radio" name="date" value=""${chosen === '' ? ' checked' : ''}>
      <small>${t('bk.anyDaySub')}</small><b><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9a3 3 0 1 0 0 6c2 0 3-1.5 5-3s3-3 5-3a3 3 0 1 1 0 6c-2 0-3-1.5-5-3S9 9 7 9z"/></svg></b><span>${t('bk.anyDay')}</span></label>`];
  for (const d of openDays()) {
    const value = isoDay(d);
    const top = value === today ? t('bk.today') : value === tomorrow ? t('bk.tomorrow') : d.toLocaleDateString(locale, { weekday: 'short' });
    chips.push(`<label class="bk-day"><input type="radio" name="date" value="${value}"${chosen === value ? ' checked' : ''}>
      <small>${top}</small><b>${d.getDate()}</b><span>${d.toLocaleDateString(locale, { month: 'short' })}</span></label>`);
  }
  $('#bk-days').innerHTML = chips.join('');
}

$$('.bk-scroll').forEach((b) => b.addEventListener('click', () => {
  const strip = $('#bk-days');
  strip.scrollBy({ left: Number(b.dataset.scroll) * strip.clientWidth * 0.8, behavior: 'smooth' });
}));

// ---------- summary ----------

const choice = () => ({
  reason: form.elements.reason.value,
  notes: form.elements.notes.value.trim(),
  date: form.elements.date?.value || '',
  time: form.elements.time.value,
  name: form.elements.name.value.trim(),
  contact: form.elements.contact.value.trim(),
});

function whenText({ date, time }) {
  const day = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(LOCALE[getLang()], { weekday: 'long', day: 'numeric', month: 'long' })
    : t('bk.anyDay');
  const part = time === 'Morning' ? t('bk.t.morning') : time === 'Afternoon' ? t('bk.t.afternoon') : t('bk.t.any');
  return `${day} · ${part}`;
}

function updateSummary() {
  const c = choice();
  const set = (id, text) => { const el = $(id); el.textContent = text || t('bk.notSet'); el.classList.toggle('empty', !text); };
  const reason = c.reason ? t(`bk.r.${c.reason}`) : '';
  set('#bk-tk-reason', reason);
  set('#bk-tk-when', whenText(c));
  set('#bk-tk-name', c.name);
  $('#bk-rv-reason').textContent = reason ? `${reason}${c.notes ? ` · “${c.notes}”` : ''}` : t('bk.notSet');
  $('#bk-rv-when').textContent = whenText(c);
}

// ---------- steps ----------

function showError(key) {
  const el = $('#bk-error');
  el.textContent = key ? t(key) : '';
  el.classList.toggle('show', Boolean(key));
}

function validate(step) {
  const c = choice();
  if (step === 1 && !c.reason) return { key: 'bk.err.reason', focus: form.querySelector('input[name="reason"]') };
  if (step === 3) {
    if (!c.name) return { key: 'bk.err.name', focus: form.elements.name };
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact);
    const phone = /^\+?[\d\s()-]+$/.test(c.contact) && c.contact.replace(/\D/g, '').length >= 7;
    if (!email && !phone) return { key: 'bk.err.contact', focus: form.elements.contact };
  }
  return null;
}

function goTo(step, { focus = true } = {}) {
  state.step = step;
  state.reached = Math.max(state.reached, step);
  $$('.bk-panel').forEach((p) => { p.hidden = Number(p.dataset.panel) !== step; });
  $$('.bk-steps li').forEach((li, i) => {
    const n = i + 1;
    li.classList.toggle('done', n < step);
    li.classList.toggle('current', n === step);
    const btn = li.querySelector('button');
    btn.disabled = n > state.reached;
    if (n === step) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
  });
  $('#bk-steps').style.setProperty('--progress', `${((step - 1) / 2) * 100}%`);
  $('#bk-back').hidden = step === 1;
  $('#bk-next-l').textContent = t(step === 3 ? 'bk.submit' : 'bk.next');
  showError('');
  updateSummary();
  const card = $('#bk-card');
  if (card.getBoundingClientRect().top < 70) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (focus) $(`#bk-s${step}`).focus({ preventScroll: true });
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const problem = validate(state.step);
  if (problem) {
    showError(problem.key);
    problem.focus?.focus();
    return;
  }
  if (state.step < 3) { goTo(state.step + 1); return; }
  await send();
});
$('#bk-back').addEventListener('click', () => goTo(Math.max(1, state.step - 1)));
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-goto]');
  if (target && !target.disabled) goTo(Number(target.dataset.goto));
});
form.addEventListener('input', () => { showError(''); updateSummary(); });
form.addEventListener('change', updateSummary);

// ---------- sending ----------

async function send() {
  if (state.sending) return;
  const c = choice();
  const btn = $('#bk-next');
  state.sending = true;
  btn.disabled = true;
  $('#bk-next-l').textContent = t('bk.sending');
  // Staff read requests in English: the reason uses its English name; the patient's own words stay as typed.
  const notes = `${DICT.en[`bk.r.${c.reason}`]}${c.notes ? ` — ${c.notes}` : ''}`;
  try {
    await api('/api/appointments', {
      method: 'POST',
      body: { name: c.name, contact: c.contact, preferredDate: c.date, preferredTime: c.time, notes, sessionId: state.session?.id || null },
    });
    showDone(c);
  } catch (err) {
    showError(err.status === 429 ? 'bk.err.busy' : 'bk.err.send');
  } finally {
    state.sending = false;
    btn.disabled = false;
    if (state.step === 3) $('#bk-next-l').textContent = t('bk.submit');
  }
}

function showDone(c) {
  state.done = c;
  form.hidden = true;
  $('#bk-steps').hidden = true;
  const done = $('#bk-done');
  done.hidden = false;
  renderDone();
  done.focus({ preventScroll: true });
  $('#bk-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderDone() {
  if (!state.done) return;
  $('#bk-done-text').textContent = t('bk.done.text', { name: state.done.name.split(/\s+/)[0], contact: state.done.contact });
  const ref = $('#bk-done-ref');
  ref.hidden = !state.session;
  if (state.session) ref.textContent = t('bk.done.ref', { ref: state.session.refCode });
}

$('#bk-again').addEventListener('click', () => {
  state.done = null;
  form.reset();
  renderDays();
  state.reached = 1;
  form.hidden = false;
  $('#bk-steps').hidden = false;
  $('#bk-done').hidden = true;
  goTo(1);
});

// ---------- the patient's earlier self-check ----------

async function linkSession() {
  let id = null;
  try { id = localStorage.getItem(SESSION_KEY); } catch { /* storage unavailable */ }
  if (!id) return;
  try {
    const { session } = await api(`/api/sessions/${encodeURIComponent(id)}`);
    state.session = { id: session.id, refCode: session.refCode };
    if (session.name && !form.elements.name.value) form.elements.name.value = session.name;
    renderLinked();
    updateSummary();
  } catch { /* old or deleted check: book without it */ }
}

function renderLinked() {
  const el = $('#bk-linked');
  el.hidden = !state.session;
  if (!state.session) return;
  el.querySelector('span').textContent = t('bk.linked', { ref: state.session.refCode });
  $('#bk-tk-ref').textContent = state.session.refCode;
}

// ---------- start ----------

$$('[data-step-of]').forEach((el) => { el.dataset.n = el.dataset.stepOf; });
function renderStepOf() { $$('[data-step-of]').forEach((el) => { el.textContent = t('bk.stepOf', { n: el.dataset.n }); }); }
$$('.bk-panel h2').forEach((h) => h.setAttribute('tabindex', '-1'));

window.addEventListener('langchange', () => {
  renderDays();
  renderStepOf();
  renderLinked();
  applyClinic();
  renderDone();
  goTo(state.step, { focus: false });
});

renderDays();
renderStepOf();
applyClinic();
goTo(1, { focus: false });
api('/api/config').then(({ clinic }) => { state.clinic = clinic; applyClinic(); }).catch(() => {});
linkSession();
