import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, usingDefaultAdminPassword } from './src/config.js';
import { db, now, plain, plainAll } from './src/db.js';
import { events, openStream } from './src/events.js';
import { answerQuestion } from './src/ai.js';
import {
  createSession, patientView, submitAnswer, AnswerError, addMessage, getSessionRow, touchSession,
  answerContext, chatHistory, sessionDetail,
} from './src/sessions.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(express.json({ limit: '32kb' }));

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self'",
  });
  next();
});

app.use(express.static(path.join(here, 'public'), { extensions: ['html'] }));
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ---------- helpers ----------

const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Simple fixed-window rate limiter keyed by IP.
function rateLimit({ windowMs, max }) {
  const hits = new Map();
  setInterval(() => hits.clear(), windowMs).unref();
  return (req, res, next) => {
    const key = req.ip;
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    if (n > max) return res.status(429).json({ error: 'Too many requests. Please wait a moment and try again.' });
    next();
  };
}

function loadSession(req, res, next) {
  const row = getSessionRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Session not found.' });
  req.sessionRow = row;
  next();
}

// Patients currently connected (live) via their SSE stream: sessionId -> connection count.
const liveSessions = new Map();

// ---------- public API ----------

app.get('/api/config', (req, res) => {
  res.json({ clinic: config.clinic, aiEnabled: config.anthropicEnabled });
});

app.post('/api/sessions', rateLimit({ windowMs: 60 * 60 * 1000, max: 30 }), (req, res) => {
  res.status(201).json(createSession(req.get('user-agent')));
});

app.get('/api/sessions/:id', loadSession, (req, res) => {
  touchSession(req.params.id);
  res.json(patientView(req.params.id));
});

app.post('/api/sessions/:id/answer', loadSession, asyncRoute(async (req, res) => {
  const { questionId, value } = req.body || {};
  try {
    res.json(await submitAnswer(req.params.id, String(questionId || ''), value));
  } catch (err) {
    if (err instanceof AnswerError) return res.status(400).json({ error: err.message });
    throw err;
  }
}));

app.post('/api/sessions/:id/chat', loadSession, rateLimit({ windowMs: 60 * 1000, max: 15 }), asyncRoute(async (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Please type a question.' });
  const history = chatHistory(req.params.id);
  addMessage(req.params.id, 'user', text, { kind: 'question' });
  const reply = await answerQuestion(text, history, answerContext(req.params.id));
  const message = addMessage(req.params.id, 'ai', reply.text, { source: reply.source });
  touchSession(req.params.id);
  res.json({ message });
}));

// Real-time stream for the patient: receives messages from clinic staff.
app.get('/api/sessions/:id/events', loadSession, (req, res) => {
  const id = req.params.id;
  liveSessions.set(id, (liveSessions.get(id) || 0) + 1);
  events.emit('presence', { sessionId: id, online: true });
  const onMessage = ({ sessionId, message }) => {
    if (sessionId === id && message.sender === 'staff') send('staff_message', message);
  };
  const send = openStream(req, res, () => {
    events.off('message', onMessage);
    const n = (liveSessions.get(id) || 1) - 1;
    if (n <= 0) liveSessions.delete(id); else liveSessions.set(id, n);
    events.emit('presence', { sessionId: id, online: liveSessions.has(id) });
  });
  events.on('message', onMessage);
});

const clip = (v, n) => (v == null ? null : String(v).trim().slice(0, n) || null);

app.post('/api/appointments', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }), (req, res) => {
  const b = req.body || {};
  const name = clip(b.name, 80);
  const contact = clip(b.contact, 120);
  if (!name || !contact) return res.status(400).json({ error: 'Name and phone/email are required.' });
  const date = clip(b.preferredDate, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Invalid date.' });
  const sessionId = b.sessionId && getSessionRow(String(b.sessionId)) ? String(b.sessionId) : null;
  const info = db.prepare(`INSERT INTO appointments (session_id, name, contact, preferred_date, preferred_time, notes, created_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(sessionId, name, contact, date, clip(b.preferredTime, 20), clip(b.notes, 600), now());
  let message = null;
  if (sessionId) {
    db.prepare("UPDATE sessions SET contact = COALESCE(contact, ?), updated_at = ? WHERE id = ?").run(contact, now(), sessionId);
    message = addMessage(sessionId, 'bot', `Appointment request received for ${date || 'the earliest available date'}${b.preferredTime ? ` (${clip(b.preferredTime, 20)})` : ''}. Our team will contact you on ${contact} to confirm.`, { kind: 'appointment' });
  }
  events.emit('appointment', { id: Number(info.lastInsertRowid), sessionId });
  res.status(201).json({ id: Number(info.lastInsertRowid), message });
});

// ---------- staff (admin) API ----------

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const sign = (payload) => crypto.createHmac('sha256', config.adminSecret).update(payload).digest('base64url');

function issueToken() {
  const payload = String(Date.now() + TOKEN_TTL_MS);
  return `${payload}.${sign(payload)}`;
}

function validToken(token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return false;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  return Number(payload) > Date.now();
}

function requireAdmin(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!validToken(token)) return res.status(401).json({ error: 'Please log in.' });
  next();
}

app.post('/api/admin/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10 }), (req, res) => {
  const given = Buffer.from(String(req.body?.password || ''));
  const expected = Buffer.from(config.adminPassword);
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: 'Incorrect password.' });
  res.json({ token: issueToken(), defaultPassword: usingDefaultAdminPassword });
});

const admin = express.Router();
admin.use(requireAdmin);

function sessionSummaryRow(r) {
  return {
    id: r.id, refCode: r.ref_code, createdAt: r.created_at, updatedAt: r.updated_at, completedAt: r.completed_at,
    status: r.status, name: r.name, contact: r.contact, forWhom: r.for_whom, ageGroup: r.age_group,
    mainConcern: r.main_concern, ohatTotal: r.ohat_total, triageLevel: r.triage_level, topCondition: r.top_condition,
    staffStatus: r.staff_status, answered: r.answered, online: liveSessions.has(r.id),
  };
}

const LIST_SQL = `SELECT s.*, (SELECT COUNT(*) FROM answers a WHERE a.session_id = s.id) AS answered FROM sessions s`;

admin.get('/sessions', (req, res) => {
  const where = [];
  const params = [];
  const { status, level, staffStatus, q } = req.query;
  if (status) { where.push('s.status = ?'); params.push(String(status)); }
  if (level) { where.push('s.triage_level = ?'); params.push(String(level)); }
  if (staffStatus) { where.push('s.staff_status = ?'); params.push(String(staffStatus)); }
  if (q) {
    where.push('(s.name LIKE ? OR s.contact LIKE ? OR s.ref_code LIKE ? OR s.top_condition LIKE ?)');
    const like = `%${String(q).slice(0, 60)}%`;
    params.push(like, like, like, like);
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const rows = db.prepare(`${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.updated_at DESC LIMIT ${limit}`).all(...params);
  res.json({ sessions: plainAll(rows).map(sessionSummaryRow) });
});

admin.get('/sessions/:id', (req, res) => {
  const detail = sessionDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: 'Not found.' });
  res.json({ session: { ...detail, online: liveSessions.has(detail.id) } });
});

const STAFF_STATUSES = new Set(['new', 'contacted', 'booked', 'resolved']);

admin.patch('/sessions/:id', (req, res) => {
  const row = getSessionRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const { staffStatus, staffNotes } = req.body || {};
  if (staffStatus !== undefined && !STAFF_STATUSES.has(staffStatus)) return res.status(400).json({ error: 'Invalid status.' });
  db.prepare('UPDATE sessions SET staff_status = ?, staff_notes = ?, updated_at = ? WHERE id = ?')
    .run(staffStatus ?? row.staff_status, staffNotes !== undefined ? String(staffNotes).slice(0, 4000) : row.staff_notes, now(), row.id);
  events.emit('session', { type: 'staff_update', sessionId: row.id });
  res.json({ ok: true });
});

admin.delete('/sessions/:id', (req, res) => {
  const info = db.prepare('DELETE FROM sessions WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Not found.' });
  events.emit('session', { type: 'deleted', sessionId: req.params.id });
  res.json({ ok: true });
});

admin.post('/sessions/:id/message', (req, res) => {
  const row = getSessionRow(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found.' });
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!text) return res.status(400).json({ error: 'Message is empty.' });
  const message = addMessage(row.id, 'staff', text);
  if (row.staff_status === 'new') db.prepare("UPDATE sessions SET staff_status = 'contacted' WHERE id = ?").run(row.id);
  events.emit('session', { type: 'staff_update', sessionId: row.id });
  res.json({ message, delivered: liveSessions.has(row.id) });
});

admin.get('/stats', (req, res) => {
  const one = (sql, ...p) => plain(db.prepare(sql).get(...p));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const since = today.toISOString();
  const totals = one(`SELECT COUNT(*) AS total,
      SUM(status = 'completed') AS completed,
      SUM(status = 'in_progress') AS inProgress,
      SUM(created_at >= ?) AS today,
      ROUND(AVG(CASE WHEN status = 'completed' THEN ohat_total END), 1) AS avgOhat,
      SUM(status = 'completed' AND triage_level IN ('urgent','emergency') AND staff_status IN ('new','contacted')) AS urgentOpen,
      SUM(status = 'completed' AND staff_status = 'new') AS needsFollowUp
    FROM sessions`, since);
  const levels = plainAll(db.prepare(`SELECT triage_level AS level, COUNT(*) AS n FROM sessions WHERE status = 'completed' GROUP BY triage_level`).all());
  const concerns = plainAll(db.prepare(`SELECT main_concern AS concern, COUNT(*) AS n FROM sessions WHERE main_concern IS NOT NULL GROUP BY main_concern ORDER BY n DESC`).all());
  const conditionCounts = {};
  for (const r of db.prepare(`SELECT result_json FROM sessions WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 2000`).all()) {
    for (const c of JSON.parse(r.result_json).conditions) conditionCounts[c.name] = (conditionCounts[c.name] || 0) + 1;
  }
  const conditions = Object.entries(conditionCounts).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  const pendingAppointments = one(`SELECT COUNT(*) AS n FROM appointments WHERE status = 'requested'`).n;
  res.json({ totals: { ...totals, live: liveSessions.size, pendingAppointments }, levels, concerns, conditions });
});

admin.get('/appointments', (req, res) => {
  const rows = db.prepare(`SELECT a.*, s.ref_code, s.triage_level FROM appointments a LEFT JOIN sessions s ON s.id = a.session_id
                           ORDER BY a.id DESC LIMIT 500`).all();
  res.json({ appointments: plainAll(rows) });
});

const APPT_STATUSES = new Set(['requested', 'confirmed', 'cancelled', 'done']);
admin.patch('/appointments/:id', (req, res) => {
  const status = req.body?.status;
  if (!APPT_STATUSES.has(status)) return res.status(400).json({ error: 'Invalid status.' });
  const appt = plain(db.prepare('SELECT * FROM appointments WHERE id = ?').get(Number(req.params.id)));
  if (!appt) return res.status(404).json({ error: 'Not found.' });
  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, appt.id);
  if (appt.session_id && status === 'confirmed') {
    db.prepare("UPDATE sessions SET staff_status = 'booked', updated_at = ? WHERE id = ?").run(now(), appt.session_id);
    events.emit('session', { type: 'staff_update', sessionId: appt.session_id });
  }
  events.emit('appointment', { id: appt.id, sessionId: appt.session_id, status });
  res.json({ ok: true });
});

const csvCell = (v) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

admin.get('/export.csv', (req, res) => {
  const rows = plainAll(db.prepare(`SELECT * FROM sessions ORDER BY created_at DESC`).all());
  const answerRows = plainAll(db.prepare('SELECT session_id, question_id, label FROM answers').all());
  const bySession = {};
  for (const a of answerRows) (bySession[a.session_id] ||= {})[a.question_id] = a.label;
  const qIds = ['age_group', 'main_concern', 'red_flags', 'lips', 'tongue', 'gums', 'saliva', 'teeth', 'denture_use', 'dentures',
    'cleanliness', 'pain', 'pain_level', 'pain_type', 'symptoms', 'duration', 'risk_factors', 'brushing', 'interdental', 'last_visit', 'notes'];
  const header = ['ref_code', 'created_at', 'completed_at', 'status', 'name', 'contact', 'for_whom', 'triage_level', 'ohat_total',
    'predicted_conditions', 'staff_status', 'staff_notes', 'summary', ...qIds];
  const lines = [header.join(',')];
  for (const r of rows) {
    const result = r.result_json ? JSON.parse(r.result_json) : null;
    const conds = result ? result.conditions.map((c) => `${c.name} (${c.confidence}%)`).join('; ') : '';
    const a = bySession[r.id] || {};
    lines.push([r.ref_code, r.created_at, r.completed_at, r.status, r.name, r.contact, r.for_whom, r.triage_level, r.ohat_total,
      conds, r.staff_status, r.staff_notes, r.summary, ...qIds.map((id) => a[id])].map(csvCell).join(','));
  }
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="assessments-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send('﻿' + lines.join('\r\n'));
});

// Real-time feed for the staff dashboard.
admin.get('/stream', (req, res) => {
  const onSession = (e) => send('session', e);
  const onMessage = (e) => send('message', { sessionId: e.sessionId, message: e.message });
  const onAppointment = (e) => send('appointment', e);
  const onPresence = (e) => send('presence', e);
  const send = openStream(req, res, () => {
    events.off('session', onSession);
    events.off('message', onMessage);
    events.off('appointment', onAppointment);
    events.off('presence', onPresence);
  });
  events.on('session', onSession);
  events.on('message', onMessage);
  events.on('appointment', onAppointment);
  events.on('presence', onPresence);
  send('hello', { at: now() });
});

app.use('/api/admin', admin);

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : 'Something went wrong. Please try again.' });
});

app.listen(config.port, () => {
  console.log(`\n  ${config.clinic.name} - website:  http://localhost:${config.port}`);
  console.log(`  Staff dashboard:                  http://localhost:${config.port}/admin`);
  console.log(`  Claude AI answers: ${config.anthropicEnabled ? 'ON' : 'OFF (set ANTHROPIC_API_KEY in .env to enable)'}`);
  if (usingDefaultAdminPassword) console.log('  WARNING: using default admin password "admin123" - set ADMIN_PASSWORD in .env');
  console.log('');
});
