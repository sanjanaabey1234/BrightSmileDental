// Website chatbot: drives the OHAT assessment, free-text Q&A, results and live staff messages.
// All interface text comes from i18n.js; questions and results arrive from the server in the chosen language.
import { t, getLang, setLang, LANGS } from './i18n.js';

const $ = (sel, root = document) => root.querySelector(sel);
const STORAGE_KEY = 'brightsmile_session_id';

const els = {
  chat: $('#chat'),
  log: $('#chat-log'),
  answer: $('#chat-answer'),
  form: $('#chat-form'),
  input: $('#chat-text'),
  badge: $('.launcher-badge'),
  section: $('#progress-section'),
  count: $('#progress-count'),
  fill: $('#progress-fill'),
};

const state = {
  sessionId: null,
  sessionName: null,
  refCode: null,
  question: null,
  result: null,
  busy: false,
  started: false,
  unread: 0,
  seen: new Set(),
  stream: null,
  poll: null,
  clinic: null,
};

const store = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(v) { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage unavailable */ } },
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Every request carries the current language so the server answers in it.
async function api(path, options = {}) {
  const url = `${path}${path.includes('?') ? '&' : '?'}lang=${getLang()}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- clinic info ----------

// Fills [data-clinic] elements, using the Sinhala/Tamil address and hours when available.
function applyClinic() {
  const clinic = state.clinic;
  if (clinic) {
    const local = { ...clinic, ...(clinic.i18n?.[getLang()] || {}) };
    document.title = clinic.name;
    document.querySelectorAll('[data-clinic]').forEach((el) => {
      const v = local[el.dataset.clinic];
      if (!v) return;
      el.textContent = v;
      if (el.dataset.href) el.href = `${el.dataset.href}:${v.replace(/\s+/g, '')}`;
    });
  }
  $('#year').textContent = new Date().getFullYear();
}

// Resolves to the live-update mode the server supports: 'sse' (instant) or 'poll' (serverless hosts).
async function loadClinic() {
  let realtime = 'sse';
  try {
    const { clinic, realtime: mode } = await api('/api/config');
    realtime = mode || 'sse';
    state.clinic = clinic;
  } catch { /* keep defaults in the HTML */ }
  applyClinic();
  return realtime;
}

// ---------- panel ----------

function openChat() {
  els.chat.hidden = false;
  document.body.classList.add('chat-open');
  state.unread = 0;
  els.badge.hidden = true;
  if (!state.started) start();
  else scrollToEnd();
  setTimeout(() => els.input.focus(), 50);
}

function closeChat() {
  els.chat.hidden = true;
  document.body.classList.remove('chat-open');
}

function bumpUnread() {
  if (!els.chat.hidden) return;
  state.unread += 1;
  els.badge.textContent = state.unread;
  els.badge.hidden = false;
}

// ---------- rendering ----------

function scrollToEnd() {
  els.log.scrollTop = els.log.scrollHeight;
}

function messageTag(m) {
  if (m.sender === 'staff') return t('tag.staff');
  if (m.sender === 'ai') return m.meta?.source === 'kb' ? t('tag.kb') : t('tag.ai');
  return null;
}

function renderMessage(m) {
  if (m.id && state.seen.has(m.id)) return;
  if (m.id) state.seen.add(m.id);
  const div = document.createElement('div');
  const kind = m.meta?.kind === 'alert' ? ' alert' : '';
  div.className = `msg ${m.sender}${kind}`;
  const tagText = messageTag(m);
  if (tagText) {
    const tag = document.createElement('span');
    tag.className = 'msg-tag';
    tag.textContent = tagText;
    div.append(tag);
  }
  div.append(document.createTextNode(m.text));
  els.log.append(div);
  scrollToEnd();
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'msg bot typing';
  div.innerHTML = '<i></i><i></i><i></i>';
  els.log.append(div);
  scrollToEnd();
  return () => div.remove();
}

function setProgress(q) {
  if (!q) {
    els.section.textContent = state.result ? t('progress.done') : '';
    els.count.textContent = '';
    els.fill.style.width = state.result ? '100%' : '0';
    return;
  }
  els.section.textContent = q.section;
  els.count.textContent = t('progress.count', { a: q.progress.index, b: q.progress.total });
  els.fill.style.width = `${Math.round(((q.progress.index - 1) / q.progress.total) * 100)}%`;
}

// Answer button: a letter key for single choice, a checkbox for multi-select.
function optionButton(label, key) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'opt';
  const mark = document.createElement('span');
  mark.className = key ? 'opt-key' : 'opt-box';
  if (key) mark.textContent = key;
  const text = document.createElement('span');
  text.className = 'opt-label';
  text.textContent = label;
  b.append(mark, text);
  return b;
}

const MASCOT_SVG = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M20 6c-9 0-15 7-15 17 0 8 4 13 6 22 2 9 4 13 8 13 5 0 5-12 13-12s8 12 13 12c4 0 6-4 8-13 2-9 6-14 6-22 0-10-6-17-15-17-6 0-8 3-12 3S26 6 20 6z" fill="#fff" stroke="#0b7a73" stroke-width="2.4" stroke-linejoin="round"/><circle cx="24" cy="25" r="2.8" fill="#0c1f22"/><circle cx="40" cy="25" r="2.8" fill="#0c1f22"/><circle cx="19.5" cy="31" r="3" fill="#ff9e85" opacity=".6"/><circle cx="44.5" cy="31" r="3" fill="#ff9e85" opacity=".6"/><path d="M26 31.5q6 5.5 12 0" fill="none" stroke="#0c1f22" stroke-width="2.2" stroke-linecap="round"/></svg>`;

// Static welcome card at the top of every conversation (not stored), with language buttons.
function renderIntro() {
  const div = document.createElement('div');
  div.className = 'chat-intro';
  const langs = LANGS.map((l) => `<button type="button" class="intro-lang" lang="${l.code}" data-lang="${l.code}" aria-pressed="${l.code === getLang()}">${esc(l.label)}</button>`).join('');
  div.innerHTML = `<div class="intro-mark">${MASCOT_SVG}</div>
    <b>${esc(t('intro.title'))}</b>
    <p>${esc(t('intro.text'))}</p>
    <ul><li>${esc(t('intro.c1'))}</li><li>${esc(t('intro.c2'))}</li><li>${esc(t('intro.c3'))}</li></ul>
    <div class="intro-langs" role="group" aria-label="${esc(t('intro.lang'))}"><span>${esc(t('intro.lang'))}</span>${langs}</div>`;
  div.querySelectorAll('.intro-lang').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  els.log.append(div);
}

function renderQuestion(q) {
  state.question = q;
  setProgress(q);
  els.answer.innerHTML = '';
  els.input.placeholder = t('ph.answer');
  if (!q) {
    els.input.placeholder = state.result ? t('ph.results') : t('ph.question');
    return;
  }
  const inner = document.createElement('div');
  inner.className = 'answer-inner';

  if (q.type === 'single') {
    const opts = document.createElement('div');
    opts.className = 'opts stack';
    q.options.forEach((o, i) => {
      // Lettered so people can also type "A", "B"... (see matchOption).
      const b = optionButton(o.label, String.fromCharCode(65 + i));
      b.addEventListener('click', () => answer(o.value, o.label));
      opts.append(b);
    });
    inner.append(opts);
  } else if (q.type === 'multi') {
    const chosen = new Set();
    const opts = document.createElement('div');
    opts.className = 'opts stack';
    const buttons = [];
    for (const o of q.options) {
      const b = optionButton(o.label);
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => {
        if (chosen.has(o.value)) chosen.delete(o.value);
        else {
          chosen.add(o.value);
          // "None of these" is exclusive with the other options.
          if (q.exclusive) {
            if (o.value === q.exclusive) [...chosen].forEach((v) => v !== o.value && chosen.delete(v));
            else chosen.delete(q.exclusive);
          }
        }
        buttons.forEach(([btn, val]) => btn.setAttribute('aria-pressed', String(chosen.has(val))));
        next.disabled = chosen.size === 0;
      });
      buttons.push([b, o.value]);
      opts.append(b);
    }
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'btn btn-primary btn-sm';
    next.textContent = t('btn.continue');
    next.disabled = true;
    next.addEventListener('click', () => {
      const values = q.options.filter((o) => chosen.has(o.value));
      answer(values.map((o) => o.value), values.map((o) => o.label).join('; '));
    });
    const hint = document.createElement('span');
    hint.className = 'answer-hint';
    hint.textContent = t('hint.multi');
    inner.append(opts, hint, next);
  } else if (q.type === 'scale') {
    const scale = document.createElement('div');
    scale.className = 'scale';
    for (let n = q.min; n <= q.max; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = n;
      b.style.setProperty('--i', n);
      b.setAttribute('aria-label', t('scale.aria', { n }));
      b.addEventListener('click', () => answer(n, `${n}/10`));
      scale.append(b);
    }
    const legend = document.createElement('div');
    legend.className = 'scale-legend';
    legend.innerHTML = `<span>${esc(t('scale.none'))}</span><span>${esc(t('scale.worst'))}</span>`;
    inner.append(scale, legend);
  } else if (q.type === 'text') {
    els.input.placeholder = q.placeholder || t('ph.text');
    const hint = document.createElement('span');
    hint.className = 'answer-hint';
    hint.textContent = t('hint.text');
    inner.append(hint);
    if (q.optional) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'btn btn-ghost btn-sm';
      skip.textContent = t('btn.skip');
      skip.addEventListener('click', () => answer('', t('skipped')));
      inner.append(skip);
    }
    setTimeout(() => els.input.focus(), 50);
  }
  els.answer.append(inner);
}

// ---------- result card ----------

const LEVEL_ICON = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M7.5 12.5l3 3 6-6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2L12 3z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
  serious: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 7v6M12 16.5v.5"/></svg>',
};

// Ring gauge for the OHAT total (fills toward the maximum; lower is healthier).
function gauge(r) {
  const C = 2 * Math.PI * 34;
  const filled = r.maxScore ? (C * r.ohatTotal) / r.maxScore : 0;
  return `<svg class="gauge" viewBox="0 0 80 80" role="img" aria-label="${esc(t('r.gauge', { a: r.ohatTotal, b: r.maxScore }))}">
    <circle class="g-track" cx="40" cy="40" r="34"/>
    <circle class="g-fill" cx="40" cy="40" r="34" stroke-dasharray="${filled.toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 40 40)"/>
    <text class="g-num" x="40" y="42" text-anchor="middle">${r.ohatTotal}</text>
    <text class="g-of" x="40" y="55" text-anchor="middle">${esc(t('r.of', { n: r.maxScore }))}</text>
  </svg>`;
}

function resultHtml(r) {
  const cats = r.categories.map((c) => `
    <div class="cat ${c.score === null ? 'sna' : `s${c.score}`}">
      <span class="cat-top"><b>${esc(c.label)}</b><span class="sc">${esc(c.score === null ? t('r.na') : t(`r.s${c.score}`))}</span></span>
      <small>${esc(c.answer)}</small>
    </div>`).join('');

  const conds = r.conditions.length
    ? r.conditions.map((c) => `
      <div class="cond">
        <div class="cond-top"><span>${esc(c.name)}</span><span>${esc(c.likelihood)} · ${c.confidence}%</span></div>
        <div class="bar" role="img" aria-label="${esc(t('r.match', { n: c.confidence }))}"><i style="width:${c.confidence}%"></i></div>
        <p>${esc(c.about)}</p>
        ${c.evidence.length ? `<span class="ev">${esc(t('r.based', { x: c.evidence.join(', ') }))}</span>` : ''}
      </div>`).join('')
    : `<p class="muted" style="margin:0;font-size:.86rem">${esc(t('r.none'))}</p>`;

  const reasons = r.reasons.length ? `<div><h4>${esc(t('r.why'))}</h4><ul class="reasons">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  return `
    <div class="result-head">
      <div class="lvl"><span class="lvl-icon">${LEVEL_ICON[r.status]}</span>${esc(r.label)}</div>
      <p><span class="when">${esc(r.timeframe)}.</span> ${esc(r.action)}</p>
    </div>
    <div class="result-body">
      <div class="score-block">
        ${gauge(r)}
        <div class="score-text">
          <b>${esc(t('r.score', { a: r.ohatTotal, b: r.maxScore }))}</b>
          <span>${esc(t('r.lower'))}</span>
          <div class="risks"><span class="chip">${esc(t('r.caries', { x: r.risks.caries }))}</span><span class="chip">${esc(t('r.gum', { x: r.risks.gum }))}</span></div>
        </div>
      </div>
      <div><h4>${esc(t('r.areas'))}</h4><div class="cats">${cats}</div></div>
      <div><h4>${esc(t('r.conditions'))}</h4>${conds}</div>
      ${reasons}
      <div><h4>${esc(t('r.plan'))}</h4><ul class="tips">${r.selfCare.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <p class="disclaimer">${esc(r.disclaimer)}</p>
      ${state.refCode ? `<span class="ref">${t('r.ref', { ref: esc(state.refCode) })}</span>` : ''}
      <div class="result-actions">
        <button class="btn btn-primary" data-act="book">${esc(t('r.book'))}</button>
        <button class="btn btn-ghost" data-act="print">${esc(t('r.print'))}</button>
        <button class="btn btn-ghost" data-act="new">${esc(t('r.new'))}</button>
      </div>
      <div data-slot="booking"></div>
    </div>`;
}

function renderResult(r) {
  state.result = r;
  const card = document.createElement('div');
  card.className = `result lvl-${r.status}`;
  card.innerHTML = resultHtml(r);
  card.querySelector('[data-act="book"]').addEventListener('click', () => showBookingForm(card));
  card.querySelector('[data-act="print"]').addEventListener('click', () => printResult(card));
  card.querySelector('[data-act="new"]').addEventListener('click', restart);
  els.log.append(card);
  setProgress(null);
  // Show the start of the result (the priority banner), not the bottom of the card.
  els.log.scrollTop = card.offsetTop - els.log.offsetTop - 8;
}

function showBookingForm(card) {
  const slot = card.querySelector('[data-slot="booking"]');
  if (slot.firstChild) return;
  const today = new Date().toISOString().slice(0, 10);
  slot.innerHTML = `
    <form class="inline-form" novalidate>
      <input name="name" placeholder="${esc(t('form.name'))}" maxlength="80" required value="${esc(state.sessionName || '')}">
      <input name="contact" placeholder="${esc(t('form.contact'))}" maxlength="120" required>
      <div class="row">
        <input name="preferredDate" type="date" min="${today}" aria-label="${esc(t('r.dateAria'))}">
        <select name="preferredTime" aria-label="${esc(t('r.timeAria'))}">
          <option value="">${esc(t('form.anyTime'))}</option><option value="Morning">${esc(t('form.morning'))}</option>
          <option value="Afternoon">${esc(t('form.afternoon'))}</option><option value="Evening">${esc(t('form.evening'))}</option>
        </select>
      </div>
      <button class="btn btn-primary btn-sm" type="submit">${esc(t('r.send'))}</button>
      <span class="answer-hint" role="status"></span>
    </form>`;
  const form = slot.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const status = form.querySelector('[role="status"]');
    if (!data.name.trim() || !data.contact.trim()) { status.textContent = t('form.required'); return; }
    form.querySelector('button').disabled = true;
    try {
      const res = await api('/api/appointments', { method: 'POST', body: { ...data, sessionId: state.sessionId } });
      slot.innerHTML = '';
      if (res.message) renderMessage(res.message);
    } catch (err) {
      status.textContent = err.message;
      form.querySelector('button').disabled = false;
    }
  });
  scrollToEnd();
}

function printResult(card) {
  const area = $('#print-area');
  const clinic = state.clinic?.name || document.title;
  area.innerHTML = `<h2>${esc(t('print.title', { clinic }))}</h2>
    <p>${esc(state.sessionName || '')} · ${new Date().toLocaleString()} ${state.refCode ? `· ${esc(t('print.ref', { ref: state.refCode }))}` : ''}</p>`;
  area.append(card.cloneNode(true));
  window.print();
}

// ---------- flow ----------

async function playBotMessages(messages) {
  for (const m of messages) {
    const stop = showTyping();
    await wait(Math.min(900, 250 + m.text.length * 4));
    stop();
    renderMessage(m);
  }
}

function renderView(view) {
  state.sessionId = view.session.id;
  state.sessionName = view.session.name;
  state.refCode = view.session.refCode;
  state.result = null;
  state.seen.clear();
  els.log.innerHTML = '';
  renderIntro();
  for (const m of view.messages) {
    renderMessage(m);
    if (m.meta?.kind === 'result' && view.result) renderResult(view.result);
  }
  if (view.result && !state.result) renderResult(view.result);
  renderQuestion(view.question);
  connectStream();
}

async function start() {
  state.started = true;
  const saved = store.get();
  try {
    if (saved) {
      try {
        renderView(await api(`/api/sessions/${encodeURIComponent(saved)}`));
        return;
      } catch (err) {
        if (err.status !== 404) throw err;
        store.clear();
      }
    }
    await newSession();
  } catch (err) {
    state.started = false;
    renderMessage({ sender: 'bot', text: t('err.connect', { e: err.message }), meta: { kind: 'alert' } });
  }
}

async function newSession() {
  const stop = showTyping();
  try {
    const view = await api('/api/sessions', { method: 'POST' });
    store.set(view.session.id);
    renderView(view);
  } finally {
    stop();
  }
}

async function restart() {
  if (state.busy) return;
  if (state.question && !confirm(t('confirm.restart'))) return;
  store.clear();
  stopLive();
  els.answer.innerHTML = '';
  els.log.innerHTML = '';
  try {
    await newSession();
  } catch (err) {
    renderMessage({ sender: 'bot', text: t('err.generic', { e: err.message }), meta: { kind: 'alert' } });
  }
}

async function answer(value, label) {
  if (state.busy || !state.question) return;
  state.busy = true;
  const q = state.question;
  els.answer.querySelectorAll('button').forEach((b) => { b.disabled = true; });
  renderMessage({ sender: 'user', text: label });
  try {
    const res = await api(`/api/sessions/${state.sessionId}/answer`, { method: 'POST', body: { questionId: q.id, value } });
    if (q.id === 'name') state.sessionName = value;
    await playBotMessages(res.botMessages);
    if (res.result) renderResult(res.result);
    renderQuestion(res.question);
  } catch (err) {
    renderMessage({ sender: 'bot', text: err.message, meta: { kind: 'alert' } });
    renderQuestion(q);
  } finally {
    state.busy = false;
  }
}

async function ask(text) {
  if (state.busy) return;
  state.busy = true;
  renderMessage({ sender: 'user', text });
  const stop = showTyping();
  try {
    const { message } = await api(`/api/sessions/${state.sessionId}/chat`, { method: 'POST', body: { text } });
    stop();
    renderMessage(message);
    if (state.question) renderMessage({ sender: 'bot', text: t('chat.resume') });
  } catch (err) {
    stop();
    renderMessage({ sender: 'bot', text: err.message, meta: { kind: 'alert' } });
  } finally {
    state.busy = false;
  }
}

// Maps typed text to an option of the current question, if it clearly matches one.
function matchOption(q, text) {
  const typed = text.trim().toLowerCase();
  if (q.type === 'scale') {
    const n = Number(typed.replace(/\/10$/, ''));
    return Number.isInteger(n) && n >= q.min && n <= q.max ? { value: n, label: `${n}/10` } : null;
  }
  if (!q.options) return null;
  // "2" or "b" picks the second option of a single-choice question.
  const idx = /^[a-z]$/.test(typed) ? typed.charCodeAt(0) - 96 : Number(typed);
  if (Number.isInteger(idx) && idx >= 1 && idx <= q.options.length && q.type === 'single') {
    const o = q.options[idx - 1];
    return { value: o.value, label: o.label };
  }
  const hits = q.options.filter((o) => o.label.toLowerCase() === typed || o.value === typed || (typed.length >= 3 && o.label.toLowerCase().startsWith(typed)));
  if (hits.length !== 1) return null;
  const o = hits[0];
  return q.type === 'multi' ? { value: [o.value], label: o.label } : { value: o.value, label: o.label };
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = els.input.value.trim();
  if (!text || state.busy || !state.sessionId) return;
  els.input.value = '';
  const q = state.question;
  if (q?.type === 'text' && !text.endsWith('?')) return answer(text, text);
  if (q && q.type !== 'text') {
    const m = matchOption(q, text);
    if (m) return answer(m.value, m.label);
  }
  ask(text);
});

// ---------- language changes ----------

// Re-fetches the conversation so questions, answers and results show in the new language.
window.addEventListener('langchange', async () => {
  applyClinic();
  if (!state.sessionId) return;
  try {
    renderView(await api(`/api/sessions/${encodeURIComponent(state.sessionId)}`));
  } catch { /* keep the current view */ }
});

// ---------- live staff messages ----------

function stopLive() {
  state.stream?.close();
  state.stream = null;
  clearInterval(state.poll);
  state.poll = null;
}

function showStaffMessage(m) {
  if (state.seen.has(m.id)) return;
  renderMessage(m);
  bumpUnread();
}

async function connectStream() {
  stopLive();
  const sessionId = state.sessionId;
  if (!sessionId) return;
  const mode = await configReady;
  if (sessionId !== state.sessionId) return;

  if (mode === 'poll' || !('EventSource' in window)) {
    // Start a minute back; messages already on screen are skipped by id.
    let after = new Date(Date.now() - 60000).toISOString();
    const tick = async () => {
      if (document.hidden || state.sessionId !== sessionId) return;
      try {
        const res = await api(`/api/sessions/${sessionId}/updates?after=${encodeURIComponent(after)}`);
        after = res.now;
        res.messages.forEach(showStaffMessage);
      } catch { /* try again on the next tick */ }
    };
    state.poll = setInterval(tick, 4000);
    return;
  }

  const es = new EventSource(`/api/sessions/${sessionId}/events?lang=${getLang()}`);
  es.addEventListener('staff_message', (e) => showStaffMessage(JSON.parse(e.data)));
  state.stream = es;
}

// ---------- website booking form ----------

const bookForm = $('#book-form');
bookForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = bookForm.querySelector('.form-msg');
  const data = Object.fromEntries(new FormData(bookForm));
  msg.className = 'form-msg';
  if (!data.name.trim() || !data.contact.trim()) {
    msg.textContent = t('form.required');
    msg.classList.add('err');
    return;
  }
  const btn = bookForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await api('/api/appointments', { method: 'POST', body: { ...data, sessionId: store.get() } });
    bookForm.reset();
    msg.textContent = t('form.ok');
    msg.classList.add('ok');
  } catch (err) {
    msg.textContent = err.message;
    msg.classList.add('err');
  } finally {
    btn.disabled = false;
  }
});
bookForm.querySelector('input[type="date"]').min = new Date().toISOString().slice(0, 10);

// ---------- wiring ----------

document.querySelectorAll('[data-open-chat]').forEach((b) => b.addEventListener('click', openChat));
$('#chat-close').addEventListener('click', closeChat);
$('#chat-restart').addEventListener('click', restart);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !els.chat.hidden) closeChat(); });

const configReady = loadClinic();
// Reconnect a returning visitor so staff messages still arrive while the panel is closed.
if (store.get()) start();
