// Website chatbot: drives the OHAT assessment, free-text Q&A, results and live staff messages.

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

async function api(path, options = {}) {
  const res = await fetch(path, {
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

// Resolves to the live-update mode the server supports: 'sse' (instant) or 'poll' (serverless hosts).
async function loadClinic() {
  let realtime = 'sse';
  try {
    const { clinic, realtime: mode } = await api('/api/config');
    realtime = mode || 'sse';
    state.clinic = clinic;
    document.title = clinic.name;
    document.querySelectorAll('[data-clinic]').forEach((el) => {
      const v = clinic[el.dataset.clinic];
      if (!v) return;
      el.textContent = v;
      if (el.dataset.href) el.href = `${el.dataset.href}:${v.replace(/\s+/g, '')}`;
    });
  } catch { /* keep defaults in the HTML */ }
  $('#year').textContent = new Date().getFullYear();
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

const TAGS = { ai: 'Assistant answer', staff: 'Clinic team' };

function renderMessage(m) {
  if (m.id && state.seen.has(m.id)) return;
  if (m.id) state.seen.add(m.id);
  const div = document.createElement('div');
  const kind = m.meta?.kind === 'alert' ? ' alert' : '';
  div.className = `msg ${m.sender}${kind}`;
  if (TAGS[m.sender]) {
    const tag = document.createElement('span');
    tag.className = 'msg-tag';
    tag.textContent = m.sender === 'ai' && m.meta?.source === 'kb' ? 'Clinic FAQ' : TAGS[m.sender];
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
    els.section.textContent = state.result ? 'Complete' : '';
    els.count.textContent = '';
    els.fill.style.width = state.result ? '100%' : '0';
    return;
  }
  els.section.textContent = q.section;
  els.count.textContent = `${q.progress.index} of ${q.progress.total}`;
  els.fill.style.width = `${Math.round(((q.progress.index - 1) / q.progress.total) * 100)}%`;
}

function renderQuestion(q) {
  state.question = q;
  setProgress(q);
  els.answer.innerHTML = '';
  els.input.placeholder = 'Type an answer or ask a question…';
  if (!q) {
    els.input.placeholder = state.result ? 'Ask Brighty anything about your results…' : 'Ask a question…';
    return;
  }
  const inner = document.createElement('div');
  inner.className = 'answer-inner';

  if (q.type === 'single') {
    const opts = document.createElement('div');
    opts.className = 'opts';
    for (const o of q.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = o.label;
      b.addEventListener('click', () => answer(o.value, o.label));
      opts.append(b);
    }
    inner.append(opts);
  } else if (q.type === 'multi') {
    const chosen = new Set();
    const opts = document.createElement('div');
    opts.className = 'opts';
    const buttons = [];
    for (const o of q.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = o.label;
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
    next.textContent = 'Continue';
    next.disabled = true;
    next.addEventListener('click', () => {
      const values = q.options.filter((o) => chosen.has(o.value));
      answer(values.map((o) => o.value), values.map((o) => o.label).join('; '));
    });
    const hint = document.createElement('span');
    hint.className = 'answer-hint';
    hint.textContent = 'Choose all that apply, then press Continue.';
    inner.append(opts, hint, next);
  } else if (q.type === 'scale') {
    const scale = document.createElement('div');
    scale.className = 'scale';
    for (let n = q.min; n <= q.max; n++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = n;
      b.setAttribute('aria-label', `${n} out of 10`);
      b.addEventListener('click', () => answer(n, `${n}/10`));
      scale.append(b);
    }
    const legend = document.createElement('div');
    legend.className = 'scale-legend';
    legend.innerHTML = '<span>No pain</span><span>Worst pain</span>';
    inner.append(scale, legend);
  } else if (q.type === 'text') {
    els.input.placeholder = q.placeholder || 'Type your answer…';
    const hint = document.createElement('span');
    hint.className = 'answer-hint';
    hint.textContent = 'Type your answer in the box below.';
    inner.append(hint);
    if (q.optional) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'btn btn-ghost btn-sm';
      skip.textContent = 'Skip';
      skip.addEventListener('click', () => answer('', '(skipped)'));
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

const SCORE_CHIP = {
  0: '<span class="chip"><span class="dot good"></span>0 Healthy</span>',
  1: '<span class="chip"><span class="dot warn"></span>1 Changes</span>',
  2: '<span class="chip"><span class="dot serious"></span>2 Unhealthy</span>',
};

function resultHtml(r) {
  const cats = r.categories.map((c) => `
    <div class="cat"><div>${esc(c.label)}<small>${esc(c.answer)}</small></div>
      ${c.score === null ? '<span class="chip">N/A</span>' : SCORE_CHIP[c.score]}</div>`).join('');

  const conds = r.conditions.length
    ? r.conditions.map((c) => `
      <div class="cond">
        <div class="cond-top"><span>${esc(c.name)}</span><span>${esc(c.likelihood)} · ${c.confidence}%</span></div>
        <div class="bar" role="img" aria-label="${c.confidence} percent match"><i style="width:${c.confidence}%"></i></div>
        <p>${esc(c.about)}</p>
        ${c.evidence.length ? `<span class="ev">Based on: ${esc(c.evidence.join(', '))}</span>` : ''}
      </div>`).join('')
    : '<p class="muted" style="margin:0;font-size:.86rem">No specific problem pattern was found in your answers.</p>';

  const reasons = r.reasons.length ? `<div><h4>Why this priority</h4><ul class="tips">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';

  return `
    <div class="result-head lvl-${r.status}">
      <div class="lvl">${LEVEL_ICON[r.status]}${esc(r.label)}</div>
      <p><span class="when">${esc(r.timeframe)}.</span> ${esc(r.action)}</p>
    </div>
    <div class="result-body">
      <div>
        <h4>OHAT score</h4>
        <div class="score-line"><b>${r.ohatTotal}</b><span>out of ${r.maxScore} · lower is healthier</span></div>
      </div>
      <div><h4>Your 8 areas</h4><div class="cats">${cats}</div></div>
      <div><h4>What might be going on</h4>${conds}</div>
      ${reasons}
      <div><h4>Your self-care plan</h4><ul class="tips">${r.selfCare.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div><h4>Risk level</h4><div class="risks"><span class="chip">Tooth decay: ${esc(r.risks.caries)}</span><span class="chip">Gum disease: ${esc(r.risks.gum)}</span></div></div>
      <p class="disclaimer">${esc(r.disclaimer)}</p>
      ${state.refCode ? `<span class="ref">Reference: <b>${esc(state.refCode)}</b> - quote this when you contact us.</span>` : ''}
      <div class="result-actions">
        <button class="btn btn-primary" data-act="book">Request appointment</button>
        <button class="btn btn-ghost" data-act="print">Print / save PDF</button>
        <button class="btn btn-ghost" data-act="new">New check</button>
      </div>
      <div data-slot="booking"></div>
    </div>`;
}

function renderResult(r) {
  state.result = r;
  const card = document.createElement('div');
  card.className = 'result';
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
      <input name="name" placeholder="Full name" maxlength="80" required value="${esc(state.sessionName || '')}">
      <input name="contact" placeholder="Phone or email" maxlength="120" required>
      <div class="row">
        <input name="preferredDate" type="date" min="${today}" aria-label="Preferred date">
        <select name="preferredTime" aria-label="Preferred time"><option value="">Any time</option><option>Morning</option><option>Afternoon</option><option>Evening</option></select>
      </div>
      <button class="btn btn-primary btn-sm" type="submit">Send request</button>
      <span class="answer-hint" role="status"></span>
    </form>`;
  const form = slot.querySelector('form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const status = form.querySelector('[role="status"]');
    if (!data.name.trim() || !data.contact.trim()) { status.textContent = 'Please enter your name and phone or email.'; return; }
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
  area.innerHTML = `<h2>${esc(clinic)} - Oral health self-check</h2>
    <p>${esc(state.sessionName || '')} · ${new Date().toLocaleString()} ${state.refCode ? `· Ref ${esc(state.refCode)}` : ''}</p>`;
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
    renderMessage({ sender: 'bot', text: `Sorry, I couldn't connect right now (${err.message}). Please try again in a moment.`, meta: { kind: 'alert' } });
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
  if (state.question && !confirm('Start a new check? Your current answers are saved for our team.')) return;
  store.clear();
  stopLive();
  els.answer.innerHTML = '';
  els.log.innerHTML = '';
  try {
    await newSession();
  } catch (err) {
    renderMessage({ sender: 'bot', text: `Sorry, something went wrong: ${err.message}`, meta: { kind: 'alert' } });
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
    if (state.question) renderMessage({ sender: 'bot', text: 'Whenever you are ready, please answer the question above to continue your check.' });
  } catch (err) {
    stop();
    renderMessage({ sender: 'bot', text: err.message, meta: { kind: 'alert' } });
  } finally {
    state.busy = false;
  }
}

// Maps typed text to an option of the current question, if it clearly matches one.
function matchOption(q, text) {
  const t = text.trim().toLowerCase();
  if (q.type === 'scale') {
    const n = Number(t.replace(/\/10$/, ''));
    return Number.isInteger(n) && n >= q.min && n <= q.max ? { value: n, label: `${n}/10` } : null;
  }
  if (!q.options) return null;
  const idx = Number(t);
  if (Number.isInteger(idx) && idx >= 1 && idx <= q.options.length && q.type === 'single') {
    const o = q.options[idx - 1];
    return { value: o.value, label: o.label };
  }
  const hits = q.options.filter((o) => o.label.toLowerCase() === t || o.value === t || (t.length >= 3 && o.label.toLowerCase().startsWith(t)));
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

  const es = new EventSource(`/api/sessions/${sessionId}/events`);
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
    msg.textContent = 'Please enter your name and a phone number or email.';
    msg.classList.add('err');
    return;
  }
  const btn = bookForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await api('/api/appointments', { method: 'POST', body: { ...data, sessionId: store.get() } });
    bookForm.reset();
    msg.textContent = 'Thank you! Your request was sent. We will call you to confirm the time.';
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
