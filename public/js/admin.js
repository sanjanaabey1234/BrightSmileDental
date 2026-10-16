// Staff dashboard: live list of assessments, predictions, transcripts, follow-up and appointments.

const $ = (sel, root = document) => root.querySelector(sel);
const TOKEN_KEY = 'brightsmile_admin_token';

const LEVEL = {
  emergency: { label: 'Emergency', s: 'critical' },
  urgent: { label: 'See dentist promptly', s: 'serious' },
  attention: { label: 'Self-care + check-up', s: 'warning' },
  healthy: { label: 'Healthy', s: 'good' },
};
const CONCERN = {
  pain: 'Toothache or pain', gums: 'Bleeding or sore gums', dry_mouth: 'Dry mouth', breath: 'Bad breath', denture: 'Denture problem',
  sore: 'Mouth sore, patch or lump', tooth: 'Broken or decayed tooth', routine: 'Routine check',
};
const AGE = { child: 'Under 12', teen: '12-17', adult: '18-39', middle: '40-64', senior: '65+' };
const SENDER = { bot: 'Assistant', user: 'Patient', ai: 'Assistant answer', staff: 'Clinic team' };

const state = {
  token: null,
  sessions: [],
  lastUpdated: new Map(),
  openId: null,
  detail: null,
  notesDraft: null,
  stream: null,
  poll: null,
  realtime: 'sse',
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

function levelBadge(level) {
  const l = LEVEL[level];
  if (!l) return '<span class="badge plain">Pending</span>';
  return `<span class="badge"><span class="dot s-${l.s}"></span>${esc(l.label)}</span>`;
}

function toast(title, body, { critical = false, onClick } = {}) {
  const t = document.createElement('div');
  t.className = `toast${critical ? ' critical' : ''}`;
  t.innerHTML = `<b>${esc(title)}</b>${esc(body || '')}`;
  t.addEventListener('click', () => { onClick?.(); t.remove(); });
  $('#toasts').append(t);
  setTimeout(() => t.remove(), critical ? 15000 : 6000);
}

// ---------- auth ----------

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

function logout() {
  tokenStore.clear();
  state.token = null;
  stopLive();
  closeDetail();
  showLogin();
}

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#login-form .form-err');
  err.textContent = '';
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
  }
});

$('#logout').addEventListener('click', logout);

// ---------- app ----------

async function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  try {
    const { clinic, realtime } = await (await fetch('/api/config')).json();
    $('#clinic-name').textContent = `${clinic.name} · Staff`;
    state.realtime = realtime || 'sse';
  } catch { /* keep default title */ }
  await refreshAll();
  connectLive();
}

async function refreshAll() {
  await Promise.all([loadStats(), loadSessions(), loadAppointments()]).catch((e) => toast('Could not refresh', e.message));
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(refreshAll, 350);
}

// ---------- stats ----------

function kpi(label, value, note = '', dotClass = '') {
  return `<div class="kpi"><div class="label">${dotClass ? `<span class="dot ${dotClass}"></span>` : ''}${esc(label)}</div>
    <div class="value">${esc(value ?? 0)}</div>${note ? `<div class="note">${esc(note)}</div>` : ''}</div>`;
}

function barList(el, items, labelFn, emptyText) {
  if (!items.length) { el.innerHTML = `<p class="empty-note">${esc(emptyText)}</p>`; return; }
  const max = Math.max(...items.map((i) => i.n));
  el.innerHTML = items.map((i) => {
    const pct = Math.round((i.n / max) * 100);
    return `<div class="barrow" title="${esc(labelFn(i, true))}: ${i.n}">
      <div class="barrow-top"><span>${labelFn(i)}</span><b>${i.n}</b></div>
      <div class="track"><div class="fill" style="width:${pct}%"></div></div></div>`;
  }).join('');
}

async function loadStats() {
  const { totals, levels, conditions, concerns } = await api('/api/admin/stats');
  $('#kpis').innerHTML = [
    kpi('Total checks', totals.total, `${totals.completed || 0} completed`),
    kpi('Started today', totals.today),
    kpi('Live now', totals.live, 'patients in the chat', totals.live ? 's-good' : ''),
    kpi('Urgent / emergency open', totals.urgentOpen, 'not yet booked or resolved', totals.urgentOpen ? 's-critical' : ''),
    kpi('Needs follow-up', totals.needsFollowUp, 'completed, status "new"'),
    kpi('Appointment requests', totals.pendingAppointments, 'awaiting confirmation'),
    kpi('Average OHAT', totals.avgOhat ?? '-', 'out of 16 · lower is healthier'),
  ].join('');

  const order = ['emergency', 'urgent', 'attention', 'healthy'];
  const lv = order.map((l) => ({ level: l, n: levels.find((x) => x.level === l)?.n || 0 })).filter((x) => x.n);
  barList($('#chart-levels'), lv, (i, plain) => (plain ? LEVEL[i.level].label : `<span class="dot s-${LEVEL[i.level].s}"></span>${esc(LEVEL[i.level].label)}`), 'No completed checks yet.');
  barList($('#chart-conditions'), conditions, (i) => esc(i.name), 'No predictions yet.');
  barList($('#chart-concerns'), concerns, (i) => esc(CONCERN[i.concern] || i.concern), 'No data yet.');

  const appt = $('#appt-count');
  appt.textContent = totals.pendingAppointments;
  appt.hidden = !totals.pendingAppointments;
}

// ---------- assessments ----------

function filters() {
  const p = new URLSearchParams();
  const q = $('#f-q').value.trim();
  if (q) p.set('q', q);
  if ($('#f-status').value) p.set('status', $('#f-status').value);
  if ($('#f-level').value) p.set('level', $('#f-level').value);
  if ($('#f-staff').value) p.set('staffStatus', $('#f-staff').value);
  return p.toString();
}

async function loadSessions() {
  const { sessions } = await api(`/api/admin/sessions?${filters()}`);
  state.sessions = sessions;
  const rows = $('#rows');
  rows.innerHTML = sessions.map((s) => {
    const changed = state.lastUpdated.has(s.id) ? state.lastUpdated.get(s.id) !== s.updatedAt : state.lastUpdated.size > 0;
    const progress = s.status === 'completed'
      ? '<span class="pill">Completed</span>'
      : `<span class="pill">In progress · ${s.answered} answers</span>`;
    return `<tr class="clickable${changed ? ' flash' : ''}" data-id="${esc(s.id)}" tabindex="0">
      <td class="who"><b>${s.online ? '<span class="online-dot" title="Online now"></span>' : ''}${esc(s.name || 'Anonymous')}</b><small>${esc(s.refCode)}${s.contact ? ` · ${esc(s.contact)}` : ''}</small></td>
      <td><div class="progress-mini">${progress}</div></td>
      <td>${s.status === 'completed' ? levelBadge(s.triageLevel) : '<span class="badge plain">Pending</span>'}</td>
      <td class="num">${s.ohatTotal ?? '-'}</td>
      <td>${esc(s.topCondition || (s.mainConcern ? CONCERN[s.mainConcern] : '-'))}</td>
      <td><span class="pill ${s.staffStatus === 'new' ? 'new' : ''}">${esc(s.staffStatus)}</span></td>
      <td class="time" title="${esc(fullTime(s.updatedAt))}">${ago(s.updatedAt)}</td>
    </tr>`;
  }).join('');
  state.lastUpdated = new Map(sessions.map((s) => [s.id, s.updatedAt]));
  $('#empty').hidden = sessions.length > 0;
}

$('#rows').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr) openDetail(tr.dataset.id);
});
$('#rows').addEventListener('keydown', (e) => {
  const tr = e.target.closest('tr[data-id]');
  if (tr && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(tr.dataset.id); }
});

let searchTimer;
$('#f-q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadSessions, 250); });
['#f-status', '#f-level', '#f-staff'].forEach((s) => $(s).addEventListener('change', loadSessions));

// ---------- detail drawer ----------

async function openDetail(id) {
  if (state.openId !== id) state.notesDraft = null;
  state.openId = id;
  $('#drawer').hidden = false;
  $('#scrim').hidden = false;
  if (!state.detail || state.detail.id !== id) $('#drawer-body').innerHTML = '<p class="muted">Loading…</p>';
  try {
    const { session } = await api(`/api/admin/sessions/${encodeURIComponent(id)}`);
    if (state.openId !== id) return;
    state.detail = session;
    renderDetail(session);
  } catch (e) {
    $('#drawer-body').innerHTML = `<p>${esc(e.message)}</p>`;
  }
}

function closeDetail() {
  state.openId = null;
  state.detail = null;
  $('#drawer').hidden = true;
  $('#scrim').hidden = true;
}

$('#scrim').addEventListener('click', closeDetail);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.openId) closeDetail(); });

const SCORE_LABEL = { 0: ['s-good', '0 Healthy'], 1: ['s-warning', '1 Changes'], 2: ['s-serious', '2 Unhealthy'] };

function transcriptHtml(messages) {
  return messages.map((m) => `<div class="tmsg ${esc(m.sender)}" title="${esc(fullTime(m.createdAt))}">
    <span class="tag">${esc(m.sender === 'ai' && m.meta?.source === 'kb' ? 'Clinic FAQ answer' : SENDER[m.sender] || m.sender)} · ${esc(new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</span>${esc(m.text)}</div>`).join('');
}

function renderDetail(s) {
  const r = s.result;
  const body = $('#drawer-body');
  const statusOpts = ['new', 'contacted', 'booked', 'resolved'].map((v) => `<option value="${v}"${s.staff_status === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('');
  const notesValue = state.notesDraft ?? s.staff_notes ?? '';

  const resultBlock = r ? `
    <div class="card">
      <h3>Triage</h3>
      <div class="form-row">${levelBadge(r.level)}<b>${esc(r.timeframe)}</b><span class="muted">OHAT ${r.ohatTotal}/${r.maxScore}</span></div>
      ${r.reasons.length ? `<ul class="list" style="margin-top:10px">${r.reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    </div>
    <div class="grid2">
      <div class="card"><h3>OHAT categories</h3><div class="cats">${r.categories.map((c) => `
        <div class="catbox"><div class="t">${esc(c.label)}${c.score === null ? '<span class="badge plain">N/A</span>' : `<span class="badge"><span class="dot ${SCORE_LABEL[c.score][0]}"></span>${SCORE_LABEL[c.score][1]}</span>`}</div><small>${esc(c.answer)}</small></div>`).join('')}</div></div>
      <div class="card"><h3>Predicted conditions</h3><div class="conds">${r.conditions.length ? r.conditions.map((c) => `
        <div class="cond barrow" title="${esc(c.name)}: ${c.confidence}%">
          <div class="barrow-top"><span>${esc(c.name)}</span><b>${c.confidence}%</b></div>
          <div class="track"><div class="fill" style="width:${c.confidence}%"></div></div>
          <small>${esc(c.likelihood)} · ${esc(c.urgency)} · ${esc(c.evidence.join(', '))}</small>
        </div>`).join('') : '<p class="muted">No specific pattern found.</p>'}</div>
        <div class="form-row" style="margin-top:12px"><span class="badge">Decay risk: ${esc(r.risks.caries)}</span><span class="badge">Gum risk: ${esc(r.risks.gum)}</span></div>
      </div>
    </div>` : `<div class="card"><h3>Status</h3><p class="muted" style="margin:0">Assessment in progress - ${s.answers.length} answers so far. This view updates live.</p></div>`;

  body.innerHTML = `
    <div class="d-head">
      <div>
        <h2>${esc(s.name || 'Anonymous')}</h2>
        <div class="meta">${esc(s.ref_code)} · started ${esc(fullTime(s.created_at))}${s.completed_at ? ` · completed ${esc(fullTime(s.completed_at))}` : ''}</div>
        <div class="meta">${s.contact ? `Contact: <b>${esc(s.contact)}</b> · ` : 'No contact given · '}${s.for_whom === 'other' ? 'Completed by a carer' : 'Self-assessment'}${s.age_group ? ` · Age ${esc(AGE[s.age_group])}` : ''}${s.main_concern ? ` · ${esc(CONCERN[s.main_concern])}` : ''}</div>
        <div class="d-badges">${s.status === 'completed' ? levelBadge(s.triage_level) : '<span class="badge plain">In progress</span>'}${s.online ? '<span class="badge"><span class="dot s-good"></span>Online now</span>' : ''}</div>
      </div>
      <button class="btn btn-ghost btn-sm close" id="d-close">Close</button>
    </div>

    <div class="card">
      <h3>Follow-up</h3>
      <div class="form-row">
        <label>Status <select id="d-status">${statusOpts}</select></label>
        <button class="btn btn-danger btn-sm" id="d-delete" style="margin-left:auto">Delete record</button>
      </div>
      <textarea class="notes" id="d-notes" placeholder="Internal notes (not shown to the patient)">${esc(notesValue)}</textarea>
      <div class="form-row"><button class="btn btn-primary btn-sm" id="d-save">Save notes</button><span class="saved" id="d-saved"></span></div>
    </div>

    ${s.summary ? `<div class="card"><h3>Clinician summary <span class="src badge plain">${s.summary_source === 'ai' ? 'Written by Claude' : 'Rule-based'}</span></h3><p class="summary">${esc(s.summary)}</p></div>` : ''}

    ${resultBlock}

    ${r ? `<div class="card"><h3>Self-care plan given to patient</h3><ul class="list">${r.selfCare.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}

    ${s.appointments.length ? `<div class="card"><h3>Appointment requests</h3><ul class="list">${s.appointments.map((a) => `<li><b>${esc(a.preferred_date || 'Any date')}</b> ${esc(a.preferred_time || '')} · ${esc(a.contact)} · <span class="pill">${esc(a.status)}</span></li>`).join('')}</ul></div>` : ''}

    <div class="grid2">
      <div class="card"><h3>Answers (${s.answers.length})</h3>
        <table class="answers"><tbody>${s.answers.map((a) => `<tr><td>${esc(a.question_text.split('\n').pop())}</td><td>${esc(a.label)}${a.score !== null ? ` <span class="muted">(${a.score})</span>` : ''}</td></tr>`).join('')}</tbody></table>
      </div>
      <div class="card"><h3>Live conversation</h3>
        <div class="transcript" id="d-transcript">${transcriptHtml(s.messages)}</div>
        <form class="reply" id="d-reply"><input id="d-reply-text" maxlength="1000" placeholder="Message the patient…" aria-label="Message the patient"><button class="btn btn-primary btn-sm">Send</button></form>
        <small class="muted">${s.online ? 'Patient is online - your message appears in their chat instantly.' : 'Patient is offline - they will see your message when they next open the chat.'}</small>
      </div>
    </div>`;

  const tr = $('#d-transcript');
  tr.scrollTop = tr.scrollHeight;

  $('#d-close').addEventListener('click', closeDetail);
  $('#d-notes').addEventListener('input', (e) => { state.notesDraft = e.target.value; });
  $('#d-status').addEventListener('change', async (e) => {
    try { await api(`/api/admin/sessions/${s.id}`, { method: 'PATCH', body: { staffStatus: e.target.value } }); }
    catch (ex) { toast('Not saved', ex.message); }
  });
  $('#d-save').addEventListener('click', async () => {
    try {
      await api(`/api/admin/sessions/${s.id}`, { method: 'PATCH', body: { staffNotes: $('#d-notes').value } });
      state.notesDraft = null;
      $('#d-saved').textContent = 'Saved';
    } catch (ex) { toast('Not saved', ex.message); }
  });
  $('#d-delete').addEventListener('click', async () => {
    if (!confirm(`Permanently delete ${s.name || 'this'} record, its answers and conversation?`)) return;
    try { await api(`/api/admin/sessions/${s.id}`, { method: 'DELETE' }); closeDetail(); }
    catch (ex) { toast('Not deleted', ex.message); }
  });
  $('#d-reply').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#d-reply-text');
    const text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      const res = await api(`/api/admin/sessions/${s.id}/message`, { method: 'POST', body: { text } });
      input.value = '';
      if (!res.delivered) toast('Message saved', 'The patient is offline and will see it next time they open the chat.');
    } catch (ex) { toast('Not sent', ex.message); }
    finally { input.disabled = false; input.focus(); }
  });
}

function appendTranscript(message) {
  if (!state.detail) return;
  if (state.detail.messages.some((m) => m.id === message.id)) return;
  state.detail.messages.push(message);
  const tr = $('#d-transcript');
  if (!tr) return;
  const nearBottom = tr.scrollHeight - tr.scrollTop - tr.clientHeight < 80;
  tr.insertAdjacentHTML('beforeend', transcriptHtml([message]));
  if (nearBottom) tr.scrollTop = tr.scrollHeight;
}

function scheduleDetailRefresh() {
  clearTimeout(state.detailTimer);
  state.detailTimer = setTimeout(() => {
    // Don't re-render while staff are typing a reply.
    if (state.openId && document.activeElement?.id !== 'd-reply-text') openDetail(state.openId);
  }, 500);
}

// ---------- appointments ----------

async function loadAppointments() {
  const { appointments } = await api('/api/admin/appointments');
  $('#appt-rows').innerHTML = appointments.map((a) => `<tr>
      <td class="time" title="${esc(fullTime(a.created_at))}">${ago(a.created_at)}</td>
      <td class="who"><b>${esc(a.name)}</b><small>${esc(a.contact)}${a.ref_code ? ` · <a href="#" data-open="${esc(a.session_id)}">${esc(a.ref_code)}</a>` : ''}</small></td>
      <td>${esc(a.preferred_date || 'Any date')} ${esc(a.preferred_time || '')}</td>
      <td>${a.triage_level ? levelBadge(a.triage_level) : '<span class="muted">-</span>'}</td>
      <td>${esc(a.notes || '')}</td>
      <td><select data-appt="${a.id}" aria-label="Appointment status">${['requested', 'confirmed', 'done', 'cancelled'].map((v) => `<option value="${v}"${a.status === v ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}</select></td>
    </tr>`).join('');
  $('#appt-empty').hidden = appointments.length > 0;
}

$('#appt-rows').addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-appt]');
  if (!sel) return;
  try { await api(`/api/admin/appointments/${sel.dataset.appt}`, { method: 'PATCH', body: { status: sel.value } }); }
  catch (ex) { toast('Not saved', ex.message); }
});
$('#appt-rows').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-open]');
  if (a) { e.preventDefault(); openDetail(a.dataset.open); }
});

// ---------- tabs & export ----------

document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((t) => t.setAttribute('aria-selected', String(t === tab)));
  $('#tab-assessments').hidden = tab.dataset.tab !== 'assessments';
  $('#tab-appointments').hidden = tab.dataset.tab !== 'appointments';
}));

$('#export').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/admin/export.csv', { headers: { Authorization: `Bearer ${state.token}` } });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `assessments-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { toast('Export failed', e.message); }
});

// ---------- live updates ----------

const nameOf = (id) => state.sessions.find((s) => s.id === id)?.name || 'A patient';
const openAppointments = () => document.querySelector('[data-tab="appointments"]').click();

function setLive(on, text) {
  const live = $('#live-status');
  live.classList.toggle('on', on);
  live.lastElementChild.textContent = text;
}

// Notifications shared by both update modes.
const notify = {
  created: (id) => toast('New patient started a check', 'Live in the list below.', { onClick: () => openDetail(id) }),
  redFlag: (id) => toast('EMERGENCY red flag', `${nameOf(id)} reported emergency symptoms.`, { critical: true, onClick: () => openDetail(id) }),
  completed: (id, name, level, topCondition) => toast(`Check completed: ${name || 'Anonymous'}`,
    `${LEVEL[level]?.label || ''}${topCondition ? ` · ${topCondition}` : ''}`,
    { critical: ['urgent', 'emergency'].includes(level), onClick: () => openDetail(id) }),
  question: (id, text) => toast(`${nameOf(id)} asked a question`, text.slice(0, 120), { onClick: () => openDetail(id) }),
  appointment: (sessionId) => toast('New appointment request', sessionId ? `From ${nameOf(sessionId)}.` : 'From the website booking form.', { onClick: openAppointments }),
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
  es.addEventListener('hello', () => setLive(true, 'Live'));
  es.onerror = () => setLive(false, 'Reconnecting…');

  es.addEventListener('session', async (e) => {
    const ev = JSON.parse(e.data);
    scheduleRefresh();
    if (ev.sessionId === state.openId) {
      if (ev.type === 'deleted') closeDetail();
      else if (ev.type !== 'answered') scheduleDetailRefresh();
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
      setLive(true, 'Live (auto-refresh)');
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
      setLive(false, 'Reconnecting…');
    }
  };
  tick();
  state.poll = setInterval(tick, 3000);
}

// Keep relative times fresh.
setInterval(() => { if (state.token && !document.hidden) loadSessions().catch(() => {}); }, 60000);

// ---------- boot ----------

state.token = tokenStore.get();
if (state.token) showApp(); else showLogin();
